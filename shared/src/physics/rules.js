// ── REGRAS DO JOGO: engolir/quicar (o maior sempre acaba comendo; o escudo só segura a PRIMEIRA batida), comida e powerups POR PEÇA
//    (ímã e escudo valem só para a parte que pegou o powerup; fundir junta os poderes — ver tryMergeOwn. Escudo por níveis:
//    não expira, sobe de nível sem ser atingido, perde 1 nível por tiro/míssil/batida forte de asteroide e cai inteiro ao dividir),
//    estrelas (estilhaçam quem encosta — o escudo cai inteiro e segura —, apanham de míssil/partícula até rachar em várias,
//    explodem na hora se levarem um tiro já inchando e terminam em supernova que estilhaça quem está no miolo),
//    ejetados, asteroides (pop/lasca/alimentar/atirar),
//    buracos negros (puxar/horizonte/teleporte/ciclo), mísseis (homing em jogador ou em míssil inimigo, impacto em peça/escudo,
//    choque míssil×míssil varrido, desvio de asteroide), split/eject/fire (tiro mirado trava no alvo do cone) ──
// Todas recebem o mundo `w` (ids, rng, eventos, jogadores); toda aleatoriedade passa por w.rng.
// @ts-check
import {DT,PLAYER,SPLIT,shieldTierFor,EJECT,EJECT_MASS,FRAG,fragR,fragLife,mergeTicks,EAT,BOUNCE,FOOD_TYPE,ASTEROID,BLACKHOLE,MISSILE,POWERUP,STAR} from "../constants.js";
import {KIND,BH_PHASE,FOOD_FLAG,STAR_PHASE,FRAG_KIND} from "../protocol/constants.js";
import {clamp} from "../util.js";
import {setR,setMass,addMass,addBoost,boostLeft,capBoost,velX,velY,liveCount,firstLive} from "./body.js";
import {resolveBounce} from "./collide.js";
import {vmaxFor} from "./integrate.js";

/** Constantes locais — vêm do mockup/v1 e não existem em constants.js (ver relatório). */
export const LOCAL={POP_DIV:22,POP_MIN:2,POP_MAX:6,POP_DIST:780,             // pop: n=clamp(⌊r/22⌋,2,6), filhos arremessados POP_DIST px (o vírus do agar usa os mesmos 780 do split)
  CHIP_SPEED:360,CHIP_SPREAD:.6,CHIP_N:[1,2],                              // lascas: 1–2 fragmentos a 360 px/s ±.6 rad (raio/vida vêm de fragR/fragLife pela massa)
  FEED_KICK:.04,SHOOT_OFFSET:40,                                           // asteroide alimentado ganha 4% da v do pellet; filho nasce a r+40
  EJECT_OFFSET:6,DEBRIS_SPREAD:6.2832,                                     // pellet nasce a r+6; debris de míssil sai em todas as direções
  EXIT_JITTER:30,HOLE_MARGIN:300,HOLE_MIN_RI:10,                            // saída ±30 px; buraco fica a ≥300 px da borda; influência <10 px = inerte
  FOOD_OVERLAP:.5,FEED_OVERLAP:.6};                                         // come comida a d<r+fr·.5; asteroide absorve pellet a d<r+er·.6

/** @typedef {import("./body.js").Body} Body */
/** @typedef {import("./world.js").World} World */
/** @typedef {import("./world.js").PlayerState} PlayerState */

// ── util ──
function bounceEvent(w,A,B,vn){const dx=B.x-A.x,dy=B.y-A.y,d=Math.sqrt(dx*dx+dy*dy)||1,nx=dx/d,ny=dy/d;
  w.events.push({type:"BOUNCE",x:A.x+nx*A.r,y:A.y+ny*A.r,r:A.r<B.r?A.r:B.r,nx,ny,vn});}
/** Tier do fragmento pela massa (vai no `hue` do EJECT: o cliente desenha o gordo e o de supernova diferente). */
export const fragKind=m=>m>=FRAG.RICH_MASS?FRAG_KIND.RICH:FRAG_KIND.PLAIN;
/**
 * Solta `n` fragmentos que somam EXATAMENTE `lost` de massa, em leque de ±`spread` em volta de (ux,uy).
 * Raio, vida e tier saem da massa de cada um (fragR/fragLife/fragKind) — é o que faz o pedaço de um planetão
 * valer mais do que o de um planetinha para quem o recolher. `lost <= 0` não solta nada (nem cria massa do nada).
 * @param {World} w
 */
export function spillFrag(w,x,y,ux,uy,lost,n,speed,spread,owner,immune,kind=-1){
  if(lost<=0||n<1)return;const rng=w.rng,part=lost/n,fr=fragR(part),life=fragLife(part),k=kind<0?fragKind(part):kind;
  const base=Math.atan2(uy,ux);
  for(let i=0;i<n;i++){const an=n>1?base+(spread>=6.28?rng.angle():rng.range(-spread,spread)):base+rng.range(-spread*.5,spread*.5);
    const sp=speed*(.8+rng.next()*.4);
    w.addEjected(x,y,Math.cos(an)*sp,Math.sin(an)*sp,fr,part,owner,immune,life,k);}}
function dirTo(fx,fy,tx,ty,out){let dx=tx-fx,dy=ty-fy;const l=Math.sqrt(dx*dx+dy*dy);if(l<1e-6){out[0]=1;out[1]=0;}else{out[0]=dx/l;out[1]=dy/l;}}
const DIR=[0,0];
/** Quique envolvendo peça(s): o empurrão nunca passa de BOUNCE.DIST_MAX px — e nunca come um impulso maior
 *  que já estava lá (o arremesso do split, por exemplo). Retorna a velocidade de aproximação. */
function bouncePiece(A,B,e,aPiece,bPiece){
  const b0=aPiece?boostLeft(A):0,b1=bPiece?boostLeft(B):0,vn=resolveBounce(A,B,e,BOUNCE.POS_CORR);
  if(vn>0){if(aPiece)capBoost(A,b0>BOUNCE.DIST_MAX?b0:BOUNCE.DIST_MAX);
           if(bPiece)capBoost(B,b1>BOUNCE.DIST_MAX?b1:BOUNCE.DIST_MAX);}
  return vn;}

// ── peça × peça (donos diferentes) ──
/**
 * Engolir (ra ≥ rb·RATIO e centro do menor a d < ra − rb·CENTER; enquanto só encosta, o maior atravessa) ou
 * quique mass-weighted entre tamanhos parecidos. **A regra do maior comer o menor sempre prevalece**: o escudo
 * (que serve mesmo é contra míssil) só segura a PRIMEIRA batida — ela quebra o escudo inteiro, seja qual for o
 * nível (SHIELD_BREAK), e quica com E_SHIELD dando chance de fuga; da batida seguinte em diante o maior come.
 * @param {World} w @param {Body} A @param {Body} B
 */
export function piecePair(w,A,B){
  const psA=w.players.get(A.owner),psB=w.players.get(B.owner);
  const dx=B.x-A.x,dy=B.y-A.y,d2=dx*dx+dy*dy,ra=A.r,rb=B.r,sum=ra+rb;if(d2<=0)return;
  const aBig=ra>=rb*EAT.RATIO,bBig=!aBig&&rb>=ra*EAT.RATIO;
  if(aBig||bBig){
    const big=aBig?A:B,small=aBig?B:A,psBig=aBig?psA:psB,psSmall=aBig?psB:psA;
    if(small.shieldLv>0){
      if(d2<sum*sum){breakShield(w,small,big.owner);const vn=bouncePiece(A,B,BOUNCE.E_SHIELD,true,true);
        const dx2=small.x-big.x,dy2=small.y-big.y,dd=Math.hypot(dx2,dy2)||1;
        addBoost(small,dx2/dd,dy2/dd,BOUNCE.DIST_MAX);capBoost(small,BOUNCE.DIST_MAX);   // o escudo CHUTA para fora: como nenhuma peça tem velocidade, sem isto o quique não empurraria nada e não haveria chance de fuga
        bounceEvent(w,A,B,vn>BOUNCE.FX_MIN_VN?vn:BOUNCE.FX_MIN_VN);}
      return;}
    const lim=big.r-small.r*EAT.CENTER;if(lim>0&&d2<lim*lim)eatPiece(w,psBig,big,psSmall,small);
    return;}
  if(d2<sum*sum){const vn=bouncePiece(A,B,BOUNCE.E,true,true);if(vn>BOUNCE.FX_MIN_VN)bounceEvent(w,A,B,vn);}}
/** A (de killer) engole B (de victim): ma += mb·GAIN (GAIN=1: a massa toda, como no agar), pontos, EAT e talvez PLAYER_DEAD. */
export function eatPiece(w,killer,A,victim,B){
  addMass(A,B.mass*EAT.GAIN);killer.score+=Math.floor(B.r*EAT.SCORE_PLAYER);
  w.events.push({type:"EAT",killerSlot:killer.slot,victimSlot:victim.slot,pieceId:B.id,x:B.x,y:B.y,r:B.r,lastPiece:liveCount(victim.pieces)===1});
  w.killPiece(B,"eaten",killer.slot);}

// ── comida ──
/**
 * Come uma comida: munição (do jogador), escudo (+1 nível até SHIELD_MAX_LEVEL **nesta peça**, reinicia o timer; nunca
 * expira; cada nível aguenta um míssil e a primeira batida de um maior derruba tudo), ímã (POWERUP.TICKS **nesta peça**,
 * acumula se já ativo), FUSÃO (zera o mergeAt de TODAS as peças do dono — o único que não é por peça, porque juntar é
 * coisa do conjunto) ou massa. Ímã/escudo pegos com o planeta dividido valem só para esta parte — as outras não sentem nada.
 * @param {World} w @param {PlayerState} ps @param {Body} pc @param {Body} f
 */
export function eatFood(w,ps,pc,f){
  f.dead=true;w.foodDirty=true;const t=f.type,tick=w.tick;
  if(t===FOOD_TYPE.AMMO){if(ps.missiles<MISSILE.MAX_AMMO)ps.missiles++;w.events.push({type:"AMMO",slot:ps.slot});}
  else if(t===FOOD_TYPE.SHIELD){if(pc.shieldLv<POWERUP.SHIELD_MAX_LEVEL)pc.shieldLv++;pc.shieldEvolveAt=tick+POWERUP.SHIELD_EVOLVE_TICKS;
    w.events.push({type:"POWERUP",slot:ps.slot,kind:"shield"});w.events.push({type:"SHIELD_UP",slot:ps.slot,level:pc.shieldLv,x:pc.x,y:pc.y,r:pc.r});}
  else if(t===FOOD_TYPE.MAGNET){if(pc.r<=POWERUP.MAGNET_MAX_R)pc.magnetUntil=(pc.magnetUntil>tick?pc.magnetUntil:tick)+POWERUP.TICKS;   // planeta grande não pega ímã: o alcance é r·MAGNET_RANGE e sugaria a tela inteira
    w.events.push({type:"POWERUP",slot:ps.slot,kind:"magnet"});}
  else if(t===FOOD_TYPE.MERGE){const arr=ps.pieces;for(let i=0;i<arr.length;i++){const q=arr[i];if(!q.dead)q.mergeAt=tick;}   // vale para TODAS as peças: o poder é justamente juntar quem foi picado
    w.events.push({type:"POWERUP",slot:ps.slot,kind:"merge"});}
  else{addMass(pc,f.mass*EAT.FOOD_GAIN);ps.score+=Math.floor(f.r*EAT.SCORE_FOOD);}
  w.events.push({type:"FOOD_EATEN",slot:ps.slot,foodId:f.id,foodType:t,x:f.x,y:f.y});}

// ── ejetados ──
/**
 * Peça absorve fragmento (centro dentro; do próprio dono só após cdUntil): devolve a massa INTEIRA
 * (EAT.EJECT_GAIN = 1) — cuspir e recolher fecha em zero, e o pedaço de um planetão engorda mais do que
 * uma pelota comum. A pontuação sai de √mass, não de `e.r`: o raio visual satura em FRAG.R_MAX e daria
 * a mesma migalha de pontos por um caco que vale um planeta. @param {World} w @param {Body} pc @param {Body} e
 */
export function pieceEject(w,pc,e){
  if(e.owner===pc.owner&&w.tick<e.cdUntil)return;
  const dx=e.x-pc.x,dy=e.y-pc.y;if(dx*dx+dy*dy>=pc.r*pc.r)return;
  const ps=w.players.get(pc.owner);addMass(pc,e.mass*EAT.EJECT_GAIN);ps.score+=Math.floor(Math.sqrt(e.mass)*EAT.SCORE_EJECT);e.dead=true;
  w.events.push({type:"EJECT_EATEN",slot:ps.slot,ejectId:e.id,x:e.x,y:e.y});}
/**
 * Pellet alimenta asteroide (+FEED de raio, teto MASS_R_MAX, acumula direção); acima de SHOOT_AT dispara um filho.
 * Fragmento gordo (mass ≥ FRAG.RICH_MASS) passa direto: a rocha engolir um pedaço de planeta seria o maior
 * sumidouro de massa do jogo, justo o que a regra "nada se perde" veio tirar. @param {World} w @param {Body} e @param {Body} a
 */
export function ejectAsteroid(w,e,a){
  if(w.tick<e.cdUntil||e.mass>=FRAG.RICH_MASS)return;const dx=a.x-e.x,dy=a.y-e.y,lim=a.r+e.r*LOCAL.FEED_OVERLAP;if(dx*dx+dy*dy>=lim*lim)return;
  let r=a.r+ASTEROID.FEED;if(r>ASTEROID.MASS_R_MAX)r=ASTEROID.MASS_R_MAX;setR(a,r);
  a.ax+=e.vx;a.ay+=e.vy;a.vx+=e.vx*LOCAL.FEED_KICK;a.vy+=e.vy*LOCAL.FEED_KICK;e.dead=true;
  if(a.r>ASTEROID.SHOOT_AT)shootAsteroid(w,a);}
/** "Vírus atirador": nasce um errante r=CHILD_R na direção acumulada a CHILD_SPEED; o pai volta a SHOOT_R. @param {World} w @param {Body} a */
export function shootAsteroid(w,a){
  const l=Math.sqrt(a.ax*a.ax+a.ay*a.ay)||1,ux=a.ax/l,uy=a.ay/l;
  if(w.asteroids.length<w.astCap){const c=w.spawnAsteroid(-1,a.x+ux*(a.r+LOCAL.SHOOT_OFFSET),a.y+uy*(a.r+LOCAL.SHOOT_OFFSET),ASTEROID.CHILD_R);
    c.vx=ux*ASTEROID.CHILD_SPEED;c.vy=uy*ASTEROID.CHILD_SPEED;
    w.events.push({type:"SHOOT",asteroidId:a.id,childId:c.id,x:a.x,y:a.y,nx:ux,ny:uy});}
  setR(a,ASTEROID.SHOOT_R);a.ax=0;a.ay=0;}

// ── asteroides ──
/**
 * Distância do centro da peça à RETA que a rocha percorre (parâmetro de impacto da trajetória relativa): é ela que
 * diz se a rocha vem para o miolo ou só vai raspar. Infinity quando os dois estão se afastando.
 * @param {Body} pc @param {Body} a
 */
function impactParam(pc,a){
  const dx=a.x-pc.x,dy=a.y-pc.y,rvx=a.vx-pc.vx,rvy=a.vy-pc.vy,rs=Math.sqrt(rvx*rvx+rvy*rvy);
  if(rs<1e-3)return Math.sqrt(dx*dx+dy*dy);   // parados um em relação ao outro: vale a distância atual
  if(dx*rvx+dy*rvy>=0)return Infinity;        // afastando: não vai entrar
  return Math.abs(dx*rvy-dy*rvx)/rs;}
/**
 * Peça ≥ POP_RATIO× o asteroide: **pop** quando d < r·POP_DIST — mas só se a rocha vier MIRANDO o miolo
 * (`impactParam` < r·POP_DIST); de raspão ela ricocheteia como bola de sinuca em vez de atravessar o planeta.
 * Quique = e=ASTEROID.E (impulso pela normal do contato, ponderado pela massa: rocha leve sai voando, planeta
 * pesado quase não sente) + lasca (cooldown CHIP_CD_TICKS por peça).
 * **Com escudo o preço é a VELOCIDADE da batida** (`shieldTierFor`, ver ASTEROID.SHIELD_VN): devagar custa 1 nível,
 * média 2, e rápida demais custa o escudo INTEIRO e ainda estoura o planeta — nessa faixa a rocha atravessa como se
 * não houvesse escudo. Abaixo disso o escudo segura de verdade: nada de lasca e nada de pop, só o empurrão do quique
 * (curto, com teto BOUNCE.DIST_MAX, e a velocidade volta sozinha ao padrão).
 * A velocidade de aproximação soma o quanto o PLANETA está correndo contra a rocha (velX/velY), não só a dela.
 * @param {World} w @param {Body} pc @param {Body} a
 */
export function pieceAsteroid(w,pc,a){
  const dx=a.x-pc.x,dy=a.y-pc.y,d2=dx*dx+dy*dy,ps=w.players.get(pc.owner);
  const dd=Math.sqrt(d2)||1,nx=dx/dd,ny=dy/dd;
  const vin=(velX(pc)-velX(a))*nx+(velY(pc)-velY(a))*ny;   // >0: estão se aproximando
  const tier=shieldTierFor(vin),blindada=pc.shieldLv>0&&tier<POWERUP.SHIELD_MAX_LEVEL;
  if(!blindada&&pc.r>a.r*ASTEROID.POP_RATIO){const lim=pc.r*ASTEROID.POP_DIST;
    if(d2<lim*lim&&popAsteroid(w,ps,pc,a)){if(pc.shieldLv>0)breakShield(w,pc,-1);return;}   // rápida demais: leva o escudo junto
    if(liveCount(ps.pieces)<PLAYER.MAX_PIECES&&impactParam(pc,a)<lim)return;}   // vindo para o miolo: deixa entrar (vai estourar); de raspão cai no quique
  const s=pc.r+a.r;if(d2>=s*s||d2<=0)return;
  const vn=bouncePiece(pc,a,ASTEROID.E,true,false);if(vn<=0)return;
  if(w.tick>=pc.chipUntil){
    if(pc.shieldLv>0){if(tier>0){pc.chipUntil=w.tick+ASTEROID.CHIP_CD_TICKS;
      for(let i=0;i<tier&&pc.shieldLv>0;i++)hitShield(w,pc,-1,nx,ny);}}
    else{pc.chipUntil=w.tick+ASTEROID.CHIP_CD_TICKS;chipPiece(w,ps,pc,a,nx,ny);}}
  if(vn>BOUNCE.FX_MIN_VN)bounceEvent(w,pc,a,vn);}
/** Estoura a peça em n=clamp(⌊r/POP_DIV⌋,POP_MIN,POP_MAX) filhos (limitado por MAX_PIECES); asteroide morre e respawna depois. */
export function popAsteroid(w,ps,pc,a){
  let n=Math.floor(pc.r/LOCAL.POP_DIV);if(n<LOCAL.POP_MIN)n=LOCAL.POP_MIN;if(n>LOCAL.POP_MAX)n=LOCAL.POP_MAX;
  const room=PLAYER.MAX_PIECES-liveCount(ps.pieces);if(n>room)n=room;if(n<1)return false;
  const nr=pc.r/Math.sqrt(n+1),tick=w.tick,rng=w.rng;setR(pc,nr);pc.mergeAt=tick+mergeTicks(nr);
  for(let i=0;i<n;i++){const an=rng.angle(),q=w.newPiece(ps.slot,pc.x,pc.y,nr);
    addBoost(q,Math.cos(an),Math.sin(an),LOCAL.POP_DIST);q.mergeAt=pc.mergeAt;}
  w.events.push({type:"POP",slot:ps.slot,asteroidId:a.id,x:a.x,y:a.y,r:a.r});
  a.dead=true;w.queueAsteroid(a.type,ASTEROID.RESPAWN_TICKS);return true;}
/**
 * Lasca: a peça perde CHIP da massa e ela vira 1–2 fragmentos comíveis lançados para trás (a normal n aponta
 * da peça ao asteroide). **Nada evapora**: `lost` é medido DEPOIS do piso MIN_PIECE_R, então uma peça já no
 * mínimo não perde nada e também não cospe fragmento nenhum (antes ela criava 52–104 de massa do nada), e a
 * lasca de um planetão vira um pedaço gordo de verdade em vez de duas pelotinhas de tamanho fixo.
 */
export function chipPiece(w,ps,pc,a,nx,ny){
  const m0=pc.mass;let r=pc.r*Math.sqrt(1-ASTEROID.CHIP);if(r<PLAYER.MIN_PIECE_R)r=PLAYER.MIN_PIECE_R;setR(pc,r);
  const lost=m0-pc.mass,rng=w.rng,n=rng.int(LOCAL.CHIP_N[0],LOCAL.CHIP_N[1]);
  spillFrag(w,pc.x-nx*pc.r,pc.y-ny*pc.r,-nx,-ny,lost,n,LOCAL.CHIP_SPEED,LOCAL.CHIP_SPREAD,ps.slot,EJECT.OWNER_IMMUNE_TICKS);
  w.events.push({type:"CHIP",slot:ps.slot,pieceId:pc.id,x:pc.x+nx*pc.r,y:pc.y+ny*pc.r,r:pc.r*.4,nx,ny});}

// ── estrelas ──
/**
 * Ciclo GROW→ACTIVE→OLD: `k` rampa em GROW (só arma acima de ARM_K), em OLD o raio cresce até R·SWELL
 * telegrafando o fim e, ao acabar, vira supernova. A estrela não anda sozinha — só o ímã a arrasta.
 * @param {World} w @param {Body} st
 */
export function tickStar(w,st){
  const tick=w.tick,rng=w.rng;
  if(st.type===STAR_PHASE.GROW){st.k=1-(st.life-tick)/STAR.GROW_TICKS;if(st.k<0)st.k=0;
    if(tick>=st.life){st.type=STAR_PHASE.ACTIVE;st.k=1;st.life=tick+rng.int(STAR.LIFE_TICKS[0],STAR.LIFE_TICKS[1]);}}
  else if(st.type===STAR_PHASE.ACTIVE){st.k=1;if(tick>=st.life){st.type=STAR_PHASE.OLD;st.life=tick+STAR.OLD_TICKS;}}
  else{st.k=1;const p=clamp(1-(st.life-tick)/STAR.OLD_TICKS,0,1);setR(st,STAR.R*(1+(STAR.SWELL-1)*p));
    if(tick>=st.life)supernova(w,st);}}
/**
 * Peça encosta na estrela armada: sempre é cuspida para fora (PUSH_TOUCH) e, fora do cooldown de dano de contato
 * (`chipUntil`) e com r ≥ SHATTER_MIN_R, estilhaça — a não ser que tenha escudo, que cai inteiro e segura.
 * @param {World} w @param {Body} pc @param {Body} st
 */
export function pieceStar(w,pc,st){
  if(st.k<STAR.ARM_K)return;
  const dx=pc.x-st.x,dy=pc.y-st.y,d2=dx*dx+dy*dy,lim=pc.r+st.r;if(d2>=lim*lim)return;
  const d=Math.sqrt(d2),ux=d>1e-6?dx/d:1,uy=d>1e-6?dy/d:0,tick=w.tick;
  addBoost(pc,ux,uy,STAR.PUSH_TOUCH_DIST);
  if(tick<pc.chipUntil||pc.r<STAR.SHATTER_MIN_R)return;
  pc.chipUntil=tick+STAR.SHATTER_CD_TICKS;
  if(pc.shieldLv>0){breakShield(w,pc,-1);return;}   // o escudo cai INTEIRO e segura o estilhaço (uma vez só)
  starShatter(w,w.players.get(pc.owner),pc,st,ux,uy);}
/**
 * Estilhaça a peça em n+1 pedaços (n de SHATTER_N, limitado por MAX_PIECES e por MIN_PIECE_R): o pai encolhe para
 * r/√(n+1) — massa conservada, como no pop do asteroide — e os filhos saem em leque em volta da direção
 * estrela→peça a SHATTER_DIST px, todos com o cooldown de fusão renovado. STAR_BURST.
 * @param {World} w @param {PlayerState} ps @param {Body} pc @param {Body} st
 */
export function starShatter(w,ps,pc,st,ux,uy){
  const tick=w.tick,rng=w.rng,room=PLAYER.MAX_PIECES-liveCount(ps.pieces);if(room<1)return false;
  let n=rng.int(STAR.SHATTER_N[0],STAR.SHATTER_N[1]);if(n>room)n=room;
  const maxN=Math.floor(pc.mass/(PLAYER.MIN_PIECE_R*PLAYER.MIN_PIECE_R))-1;if(n>maxN)n=maxN;if(n<1)return false;
  const nr=pc.r/Math.sqrt(n+1),base=Math.atan2(uy,ux);setR(pc,nr);pc.mergeAt=tick+mergeTicks(nr);
  for(let i=0;i<n;i++){const an=base+(i+1)/(n+1)*6.2832+rng.range(-.25,.25),sp=STAR.SHATTER_DIST*(.8+rng.next()*.4);
    const q=w.newPiece(ps.slot,pc.x,pc.y,nr);addBoost(q,Math.cos(an),Math.sin(an),sp);q.mergeAt=pc.mergeAt;}
  addBoost(pc,ux,uy,STAR.SHATTER_DIST*.5);
  w.events.push({type:"STAR_BURST",slot:ps.slot,starId:st.id,x:pc.x,y:pc.y,r:pc.r});return true;}
/**
 * Míssil acerta a estrela: o míssil morre, empurra a estrela (HIT_PUSH, menos quanto maior ela for) e conta um hit.
 * @param {World} w @param {Body} m @param {Body} st
 */
export function missileStar(w,m,st){
  const dx=st.x-m.x,dy=st.y-m.y,s=st.r+m.r;if(dx*dx+dy*dy>=s*s)return false;
  const l=Math.sqrt(m.vx*m.vx+m.vy*m.vy)||1,ux=m.vx/l,uy=m.vy/l,k=STAR.HIT_PUSH*Math.min(1,STAR.R/st.r);
  st.vx+=ux*k;st.vy+=uy*k;m.dead=true;hitStar(w,st,m.x,m.y,ux,uy,m.owner);return true;}
/**
 * Partícula ejetada bate na estrela: é consumida, empurra (EJECT_PUSH) e conta um hit fora do cooldown
 * HIT_CD_TICKS — dá para rachar a estrela ejetando, mas devagar e de pertinho. @param {World} w @param {Body} e @param {Body} st
 */
export function ejectStar(w,e,st){
  const dx=st.x-e.x,dy=st.y-e.y,s=st.r+e.r;if(dx*dx+dy*dy>=s*s)return false;
  const l=Math.sqrt(e.vx*e.vx+e.vy*e.vy)||1,ux=e.vx/l,uy=e.vy/l,k=STAR.EJECT_PUSH*Math.min(1,STAR.R/st.r);
  st.vx+=ux*k;st.vy+=uy*k;e.dead=true;
  if(w.tick>=e.cdUntil&&w.tick>=st.cdUntil){st.cdUntil=w.tick+STAR.HIT_CD_TICKS;hitStar(w,st,e.x,e.y,ux,uy,e.owner);}
  return true;}
/**
 * **Meteoro × estrela**: a estrela EXPLODE (supernova) e morre, e a rocha morre no estouro. Nada se multiplica.
 * Antes os dois se partiam — a rocha em SMASH_N cacos e a estrela em SPLIT_N estrelas menores — e isso era um
 * MOTOR DE POPULAÇÃO: cada trombada deixava mais estrelas no mapa do que tinha antes, a população de 5 chegava a
 * 16, e cada estrela a mais vira mais supernova, mais partícula e mais entidade na tela.
 * Só rocha r ≥ ASTEROID.SMASH_MIN_R derruba a estrela; pedrisco apenas ricocheteia. Estrela nascendo (k < ARM_K) é inerte.
 * @param {World} w @param {Body} a @param {Body} st
 */
export function asteroidStar(w,a,st){
  if(st.k<STAR.ARM_K)return false;
  const dx=st.x-a.x,dy=st.y-a.y,d2=dx*dx+dy*dy,s=st.r+a.r;if(d2>=s*s)return false;
  if(a.r<ASTEROID.SMASH_MIN_R){const vn=resolveBounce(a,st,ASTEROID.E,BOUNCE.POS_CORR);if(vn>BOUNCE.FX_MIN_VN)bounceEvent(w,a,st,vn);return false;}
  const l=Math.sqrt(a.vx*a.vx+a.vy*a.vy);
  const d=Math.sqrt(d2)||1,ux=l>1e-3?a.vx/l:dx/d,uy=l>1e-3?a.vy/l:dy/d;   // direção da batida (parada, vale a linha rocha→estrela)
  a.dead=true;if(a.type>=0)w.queueAsteroid(a.type,ASTEROID.RESPAWN_TICKS);   // era de cinturão: o cinturão repõe
  w.events.push({type:"SMASH",asteroidId:a.id,starId:st.id,x:a.x,y:a.y,r:a.r,nx:ux,ny:uy});
  supernova(w,st);return true;}
/**
 * Contabiliza o hit (STAR_HIT) e **explode** a estrela ao chegar em HITS_TO_SPLIT — antes ela rachava em estrelas
 * menores, o que multiplicava a população. Na fase OLD qualquer tiro já adianta a explosão. @param {World} w @param {Body} st
 */
function hitStar(w,st,x,y,nx,ny,bySlot){
  w.events.push({type:"STAR_HIT",starId:st.id,x,y,r:st.r,nx,ny,slot:bySlot,hits:st.hits+1});
  if(st.type===STAR_PHASE.OLD){supernova(w,st);return;}
  st.hits++;
  if(st.hits>=STAR.HITS_TO_SPLIT)supernova(w,st);}
/**
 * Supernova: a estrela morre e o mundo sente num raio blast = r·NOVA_R — NOVA_PARTICLES fragmentos sem dono
 * (comíveis por qualquer um) valendo NOVA_PART_MASS pelotas comuns cada e marcados FRAG_KIND.NOVA (o cliente os
 * desenha brilhando: o estilhaço de estrela é o melhor troco do mapa) espalhados em leque, asteroides chutados para fora com AST_KICK·(1−d/blast)·min(1,R_MIN/r)
 * (os de cinturão viram errantes e o cinturão repõe) e peças empurradas com PUSH·(1−d/blast). No **miolo**
 * (d < blast·NOVA_SHATTER) quem estava perto demais paga como se tivesse encostado na estrela: o escudo cai inteiro
 * e salva, sem escudo a peça estilhaça. Uma estrela nova entra na fila para RESPAWN_TICKS. @param {World} w @param {Body} st
 */
export function supernova(w,st){
  const rng=w.rng,blast=st.r*STAR.NOVA_R,b2=blast*blast,N=STAR.NOVA_PARTICLES;
  const pm=EJECT_MASS*STAR.NOVA_PART_MASS,pr=fragR(pm);
  for(let i=0;i<N;i++){const an=i/N*6.2832+rng.range(-.12,.12),sp=rng.range(STAR.NOVA_SPEED[0],STAR.NOVA_SPEED[1]),cx=Math.cos(an),cy=Math.sin(an);
    w.addEjected(st.x+cx*st.r,st.y+cy*st.r,cx*sp,cy*sp,pr,pm,-1,0,STAR.NOVA_LIFE_TICKS,FRAG_KIND.NOVA);}
  const asts=w.asteroids;
  for(let i=0;i<asts.length;i++){const a=asts[i];if(a.dead)continue;const dx=a.x-st.x,dy=a.y-st.y,d2=dx*dx+dy*dy;if(d2>=b2)continue;
    const d=Math.sqrt(d2)||1,k=STAR.AST_KICK*(1-d/blast)*Math.min(1,ASTEROID.R_MIN/a.r);a.vx+=dx/d*k;a.vy+=dy/d*k;
    if(a.type>=0&&asts.length<w.astCap){w.queueAsteroid(a.type,ASTEROID.RESPAWN_TICKS);a.type=-1;}}
  const pcs=w.pieces,n=pcs.length,lethal=blast*STAR.NOVA_SHATTER,l2=lethal*lethal,tick=w.tick;   // n fixo: os estilhaços nascem em w.pieces e não podem estilhaçar de novo em cascata
  for(let i=0;i<n;i++){const pc=pcs[i];if(pc.dead)continue;const dx=pc.x-st.x,dy=pc.y-st.y,d2=dx*dx+dy*dy;if(d2>=b2)continue;
    const d=Math.sqrt(d2)||1,ux=dx/d,uy=dy/d,k=STAR.PUSH_DIST*(1-d/blast);addBoost(pc,ux,uy,k);
    if(d2>=l2||tick<pc.chipUntil||pc.r<STAR.SHATTER_MIN_R)continue;   // fora do miolo (ou no cooldown de contato) é só o empurrão
    pc.chipUntil=tick+STAR.SHATTER_CD_TICKS;
    if(pc.shieldLv>0)breakShield(w,pc,-1);else starShatter(w,w.players.get(pc.owner),pc,st,ux,uy);}
  // berçário: a estrela morta vira um cacho de comida que fica. Ele REALOCA em vez de somar — para cada pelota do
  // cacho some uma de longe, escolhida pelo rng da sala. Sem isso a população subia para sempre (o laço de reposição
  // do mundo só ENCHE até FOOD.COUNT, nunca corta), e em 15 min já eram 6072 comidas no lugar de 5000.
  const longe=blast*STAR.NOVA_FOOD_R*3,longe2=longe*longe,pool=w.food;
  for(let i=0;i<STAR.NOVA_FOOD;i++){
    for(let k=0;k<8;k++){const f=pool[rng.int(0,pool.length-1)];if(!f||f.dead)continue;
      const fx=f.x-st.x,fy=f.y-st.y;if(fx*fx+fy*fy<longe2)continue;f.dead=true;w.foodDirty=true;break;}
    w.spawnFood({x:st.x,y:st.y,spread:blast*STAR.NOVA_FOOD_R});}
  w.events.push({type:"SUPERNOVA",starId:st.id,x:st.x,y:st.y,r:blast});
  st.dead=true;w.queueStar(STAR.RESPAWN_TICKS);}

// ── buracos negros ──
/** Ciclo GROW→ACTIVE→FADE (k), deriva aleatória em ACTIVE; no fim do FADE marca dead (o mundo respawna). @param {World} w @param {Body} h */
export function tickHole(w,h){
  const tick=w.tick,rng=w.rng;
  if(h.type===BH_PHASE.GROW){h.k=1-(h.life-tick)/BLACKHOLE.GROW_TICKS;if(h.k<0)h.k=0;
    if(tick>=h.life){h.type=BH_PHASE.ACTIVE;h.k=1;h.life=tick+rng.int(BLACKHOLE.LIFE_TICKS[0],BLACKHOLE.LIFE_TICKS[1]);}}
  else if(h.type===BH_PHASE.ACTIVE){h.k=1;
    if(tick>=h.cdUntil){h.ang=rng.angle();h.cdUntil=tick+BLACKHOLE.DRIFT_CHANGE_TICKS;}
    const m=LOCAL.HOLE_MARGIN;h.x=clamp(h.x+Math.cos(h.ang)*BLACKHOLE.DRIFT*DT,m,w.w-m);h.y=clamp(h.y+Math.sin(h.ang)*BLACKHOLE.DRIFT*DT,m,w.h-m);
    if(tick>=h.life){h.type=BH_PHASE.FADE;h.life=tick+BLACKHOLE.FADE_TICKS;}}
  else{h.k=(h.life-tick)/BLACKHOLE.FADE_TICKS;if(h.k<0)h.k=0;if(tick>=h.life)h.dead=true;}}
/**
 * Aceleração gravitacional a = min(G/max(d,rc)², A_MAX)·k·mult aplicada a `o` (Δv=a·dt), com uma parte tangencial
 * a·SWIRL (sentido fixo pelo seed do buraco) — é ela que faz o corpo espiralar em vez de cair reto no núcleo.
 * Retorna d (ou Infinity fora da influência).
 */
export function pullBody(h,o,mult,rc,ri){
  const dx=h.x-o.x,dy=h.y-o.y,d2=dx*dx+dy*dy;if(d2>ri*ri||d2<1e-6)return Infinity;
  const d=Math.sqrt(d2),dd=d>rc?d:rc;let a=BLACKHOLE.G/(dd*dd);if(a>BLACKHOLE.A_MAX)a=BLACKHOLE.A_MAX;a*=h.k*mult*DT;
  const ux=dx/d,uy=dy/d,t=a*BLACKHOLE.SWIRL*(h.seed<.5?1:-1);
  o.vx+=ux*a-uy*t;o.vy+=uy*a+ux*t;return d;}
/** Comida: puxão posicional (a·dt²·FOOD_PULL); no núcleo é consumida (o mundo repõe). Retorna true se consumiu. */
export function pullFood(h,f,rc,ri){
  const dx=h.x-f.x,dy=h.y-f.y,d2=dx*dx+dy*dy;if(d2>ri*ri||d2<1e-6)return false;
  const d=Math.sqrt(d2),dd=d>rc?d:rc;let a=BLACKHOLE.G/(dd*dd);if(a>BLACKHOLE.A_MAX)a=BLACKHOLE.A_MAX;a*=h.k*DT*DT*BLACKHOLE.FOOD_PULL;
  f.x+=dx/d*a;f.y+=dy/d*a;f.flags|=FOOD_FLAG.MOVED;return d<rc;}
/** Par (corpo dinâmico, buraco): puxa conforme o tipo; peça no núcleo (fora do cooldown) é sugada; ejetado some; errante respawna. @param {World} w @param {Body} A @param {Body} h */
export function holePair(w,A,h){
  const ri=h.r*BLACKHOLE.INFLUENCE*h.k,rc=h.r*h.k;if(ri<LOCAL.HOLE_MIN_RI)return;
  switch(A.kind){
    case KIND.PIECE:{const d=pullBody(h,A,1,rc,ri);if(d<rc&&w.tick>=A.cdUntil)suckPiece(w,w.players.get(A.owner),A,h);break;}
    case KIND.EJECT:{if(pullBody(h,A,BLACKHOLE.EJECT_PULL,rc,ri)<rc)warpEject(w,h,A);break;}
    case KIND.MISSILE:pullBody(h,A,BLACKHOLE.MISSILE_PULL,rc,ri);break;
    case KIND.ASTEROID:{if(A.type<0&&pullBody(h,A,BLACKHOLE.AST_PULL,rc,ri)<rc){A.dead=true;w.queueAsteroid(-1,0);}break;}}}
/**
 * Massa ejetada que caiu no núcleo: some aqui e nasce de novo na saída pareada, dentro do cacho EXIT_SPREAD, com o
 * que restava de vida. Remove+create em vez de teleporte no lugar — assim o cliente vê sumir aqui e aparecer lá.
 * @param {World} w @param {Body} h @param {Body} e
 */
function warpEject(w,h,e){
  e.dead=true;const rng=w.rng,an=rng.angle(),d=Math.sqrt(rng.next())*BLACKHOLE.EXIT_SPREAD,life=e.life-w.tick;
  if(life<=0)return;
  const x=clamp(h.ex+Math.cos(an)*d,e.r,w.w-e.r),y=clamp(h.ey+Math.sin(an)*d,e.r,w.h-e.r);
  w.addEjected(x,y,e.vx*.35,e.vy*.35,e.r,e.mass,e.owner,EJECT.OWNER_IMMUNE_TICKS,life,e.type);   // massa E tier atravessam: o fragmento sai do outro lado valendo o mesmo
  w.events.push({type:"WARP",x,y,r:e.r,holeId:h.id});}
/**
 * A massa que o horizonte arranca não evapora: vira SPAGHETTI_N pellets sem dono espalhados em volta do buraco de
 * ENTRADA (o pedaço do planeta que não passou), girando no sentido do buraco. Quem estiver esperando ali, lucra.
 * @param {World} w @param {Body} h
 */
function spillMass(w,h,mass){
  if(mass<=0)return;const rng=w.rng,n=BLACKHOLE.SPAGHETTI_N,part=mass/n,rr=fragR(part),life=fragLife(part),k=fragKind(part),spin=h.seed<.5?1:-1;
  const ri=Math.max(h.r*2,h.r*BLACKHOLE.INFLUENCE*h.k);
  for(let i=0;i<n;i++){const an=rng.angle(),d=ri*BLACKHOLE.SPAGHETTI_R*(.95+rng.next()*.18);   // logo fora da influência: não voltam para dentro
    const x=clamp(h.x+Math.cos(an)*d,rr,w.w-rr),y=clamp(h.y+Math.sin(an)*d,rr,w.h-rr);
    const v=BLACKHOLE.SPAGHETTI_V;
    w.addEjected(x,y,Math.cos(an)*v*.5-Math.sin(an)*v*spin,Math.sin(an)*v*.5+Math.cos(an)*v*spin,rr,part,-1,0,life,k);}}
/** Horizonte: perde LOSS da massa (que fica em pellets na entrada) e é teleportada para a saída pareada a EXIT_DIST px em direção aleatória; r<MIN_PIECE_R → destruída. */
export function suckPiece(w,ps,pc,h){
  const fromX=pc.x,fromY=pc.y,ev=w.events,m0=pc.mass;setMass(pc,pc.mass*(1-BLACKHOLE.LOSS));
  if(pc.r<PLAYER.MIN_PIECE_R){spillMass(w,h,m0);   // não coube: o planeta inteiro vira pellets na boca do buraco
    ev.push({type:"BH_SUCK",slot:ps.slot,pieceId:pc.id,fromX,fromY,toX:fromX,toY:fromY,destroyed:true,holeX:h.x,holeY:h.y});
    w.killPiece(pc,"blackhole",-1);return;}
  spillMass(w,h,m0-pc.mass);
  const rng=w.rng,j=LOCAL.EXIT_JITTER;
  pc.x=clamp(h.ex+rng.range(-j,j),pc.r,w.w-pc.r);pc.y=clamp(h.ey+rng.range(-j,j),pc.r,w.h-pc.r);
  const an=rng.angle();pc.vx=pc.vy=0;addBoost(pc,Math.cos(an),Math.sin(an),BLACKHOLE.EXIT_DIST);pc.cdUntil=w.tick+BLACKHOLE.CD_TICKS;
  ev.push({type:"BH_SUCK",slot:ps.slot,pieceId:pc.id,fromX,fromY,toX:pc.x,toY:pc.y,destroyed:false,holeX:h.x,holeY:h.y});
  ev.push({type:"EXIT",slot:ps.slot,pieceId:pc.id,x:pc.x,y:pc.y,r:pc.r});}

// ── mísseis ──
/**
 * Homing: v → lerp(v, dir(alvo)·SPEED, TURN) por tick. type 0: alvo é o slot targetId (primeira peça viva);
 * type 1: alvo é a entidade de id targetId — míssil (interceptação), asteroide ou estrela (tiro mirado) — e, se ela
 * sumiu, segue reto (type 0, sem alvo). @param {World} w @param {Body} m
 */
export function homeMissile(w,m){
  if(m.targetId<0)return;let tx,ty;
  if(m.type===1){const t=w.entityById.get(m.targetId);if(!t||t.dead||(t.kind!==KIND.MISSILE&&t.kind!==KIND.ASTEROID&&t.kind!==KIND.STAR)){m.type=0;m.targetId=-1;return;}tx=t.x;ty=t.y;}
  else{const t=w.players.get(m.targetId),tp=t&&t.alive?firstLive(t.pieces):null;if(!tp)return;tx=tp.x;ty=tp.y;}
  const dx=tx-m.x,dy=ty-m.y,l=Math.sqrt(dx*dx+dy*dy)||1,k=MISSILE.TURN;
  m.vx+=(dx/l*MISSILE.SPEED-m.vx)*k;m.vy+=(dy/l*MISSILE.SPEED-m.vy)*k;}
/**
 * Impacto em peça de outro dono: com escudo, o míssil explode no escudo e tira 1 nível (SHIELD_HIT, ou SHIELD_BREAK ao
 * chegar a 0; o timer de evolução reinicia; massa intacta). Sem escudo: peça encolhe para r·HIT_SHRINK (mín. MIN_PIECE_R)
 * e solta HIT_DEBRIS fragmentos que somam EXATAMENTE a massa arrancada (BOOM) — acertar um planetão deixa uma
 * colheita gorda no chão em vez de evaporar 39% dele. O míssil morre nos dois casos. @param {World} w @param {Body} pc @param {Body} m
 */
export function pieceMissile(w,pc,m){
  if(m.owner===pc.owner)return;const dx=m.x-pc.x,dy=m.y-pc.y,s=pc.r+m.r;if(dx*dx+dy*dy>=s*s)return;
  if(pc.shieldLv>0){m.dead=true;const d=Math.sqrt(dx*dx+dy*dy)||1;hitShield(w,pc,m.owner,dx/d,dy/d);return;}
  const m0=pc.mass;let r=pc.r*MISSILE.HIT_SHRINK;if(r<PLAYER.MIN_PIECE_R)r=PLAYER.MIN_PIECE_R;setR(pc,r);
  spillFrag(w,pc.x,pc.y,1,0,m0-pc.mass,MISSILE.HIT_DEBRIS,MISSILE.DEBRIS_SPEED,LOCAL.DEBRIS_SPREAD,pc.owner,EJECT.OWNER_IMMUNE_TICKS);
  m.dead=true;w.events.push({type:"BOOM",x:m.x,y:m.y,r:pc.r,slot:pc.owner,bySlot:m.owner});}
/**
 * Míssil × míssil (donos diferentes), teste varrido no último passo: menor distância entre os centros ao longo do
 * movimento relativo do tick (segmento p−v·DT → p) < ra+rb → ambos morrem, CLASH no ponto médio. Retorna true se chocou.
 * @param {World} w @param {Body} A @param {Body} B
 */
export function missileMissile(w,A,B){
  if(A.owner===B.owner)return false;
  const px=B.x-A.x,py=B.y-A.y,vx=(B.vx-A.vx)*DT,vy=(B.vy-A.vy)*DT,qx=px-vx,qy=py-vy,v2=vx*vx+vy*vy;
  let s=1;if(v2>1e-9){s=-(qx*vx+qy*vy)/v2;if(s<0)s=0;else if(s>1)s=1;}
  const cx=qx+vx*s,cy=qy+vy*s,rr=A.r+B.r;if(cx*cx+cy*cy>=rr*rr)return false;
  A.dead=true;B.dead=true;w.events.push({type:"CLASH",x:(A.x+B.x)/2,y:(A.y+B.y)/2,r:MISSILE.R*2,slotA:A.owner,slotB:B.owner});return true;}
/**
 * Míssil × asteroide: o míssil morre e o asteroide ganha Δv = AST_KICK·min(1,R_MIN/r) na direção do míssil.
 * Asteroide de cinturão vira errante (type −1) e o cinturão reagenda um substituto (só se abaixo de astCap). DEFLECT.
 * @param {World} w @param {Body} a @param {Body} m
 */
export function asteroidMissile(w,a,m){
  const dx=m.x-a.x,dy=m.y-a.y,s=a.r+m.r;if(dx*dx+dy*dy>=s*s)return false;
  const l=Math.sqrt(m.vx*m.vx+m.vy*m.vy)||1,ux=m.vx/l,uy=m.vy/l,k=MISSILE.AST_KICK*Math.min(1,ASTEROID.R_MIN/a.r);
  a.vx+=ux*k;a.vy+=uy*k;m.dead=true;
  if(a.type>=0&&w.asteroids.length<w.astCap){w.queueAsteroid(a.type,ASTEROID.RESPAWN_TICKS);a.type=-1;}
  w.events.push({type:"DEFLECT",x:m.x,y:m.y,r:a.r,nx:ux,ny:uy,bySlot:m.owner});return true;}
/** Escudo DESTA peça cai por completo: ela dividiu (bySlot −1) ou levou a batida de quem pode engoli-la. @param {World} w @param {Body} pc */
export function breakShield(w,pc,bySlot=-1){pc.shieldLv=0;w.events.push({type:"SHIELD_BREAK",slot:pc.owner,x:pc.x,y:pc.y,r:pc.r,bySlot});}
/**
 * O escudo DESTA peça perde UM nível e o timer de evolução dela reinicia: míssil inimigo, batida forte de asteroide ou
 * tiro do próprio dono (bySlot −1). Emite SHIELD_HIT enquanto sobra nível, SHIELD_BREAK quando zera. @param {World} w @param {Body} pc
 */
export function hitShield(w,pc,bySlot=-1,nx=0,ny=0){
  pc.shieldLv--;pc.shieldEvolveAt=w.tick+POWERUP.SHIELD_EVOLVE_TICKS;
  if(pc.shieldLv>0)w.events.push({type:"SHIELD_HIT",slot:pc.owner,level:pc.shieldLv,x:pc.x,y:pc.y,r:pc.r,nx,ny,bySlot});
  else w.events.push({type:"SHIELD_BREAK",slot:pc.owner,x:pc.x,y:pc.y,r:pc.r,bySlot});}

// ── ações do jogador ──
/**
 * Split: cada peça r ≥ SPLIT.MIN_R vira duas de massa/2 (r/√2, como no agar); o filho recebe um BOOST de
 * SPLIT.DIST px na direção do ponteiro, sem recuo no pai. A distância é ABSOLUTA e o boost sempre freia,
 * então o vão final é o mesmo do planeta inteiro à peça já dividida três vezes. O filho nasce **sem powerup** e a peça que dividiu perde o
 * escudo inteiro (o ímã ela mantém). Retorna quantas dividiu.
 * @param {World} w @param {PlayerState} ps
 */
export function applySplit(w,ps){
  const arr=ps.pieces,len=arr.length,tick=w.tick;let count=liveCount(arr),did=0;
  for(let i=0;i<len;i++){const pc=arr[i];if(pc.dead)continue;if(count>=PLAYER.MAX_PIECES)break;if(pc.r<SPLIT.MIN_R)continue;
    dirTo(pc.x,pc.y,ps.tx,ps.ty,DIR);const ux=DIR[0],uy=DIR[1],nr=pc.r/Math.SQRT2;
    setR(pc,nr);pc.mergeAt=tick+mergeTicks(nr);   // quem fica não é empurrado: no agar o split não tem recuo
    const q=w.newPiece(ps.slot,pc.x+ux*nr*SPLIT.OFFSET,pc.y+uy*nr*SPLIT.OFFSET,nr);
    q.vx=pc.vx;q.vy=pc.vy;addBoost(q,ux,uy,SPLIT.DIST);q.mergeAt=pc.mergeAt;count++;did++;
    w.events.push({type:"SPLIT",slot:ps.slot,pieceId:pc.id,childId:q.id,x:pc.x,y:pc.y,r:nr});
    if(pc.shieldLv>0)breakShield(w,pc);}
  return did;}
/**
 * Auto-split do agar.io: peça acima de PLAYER.MAX_R se reparte sozinha em n=⌊mass/MAX_R²⌋ filhos (em leque, cada um
 * com boost de SPLIT.DIST) em vez de parar de crescer. Só quando NÃO há vaga de peça o raio é cortado em MAX_R — é o único
 * ponto em que massa de jogador se perde. Retorna quantas peças se repartiram.
 * @param {World} w @param {PlayerState} ps
 */
export function autoSplit(w,ps){
  const arr=ps.pieces,len=arr.length,tick=w.tick,rng=w.rng,cap=PLAYER.MAX_R,cap2=cap*cap;let count=liveCount(arr),did=0;
  for(let i=0;i<len;i++){const pc=arr[i];if(pc.dead||pc.r<=cap)continue;
    const room=PLAYER.MAX_PIECES-count;if(room<1){setR(pc,cap);continue;}
    let n=Math.floor(pc.mass/cap2);if(n>room)n=room;if(n<1)n=1;
    const nr=pc.r/Math.sqrt(n+1);setR(pc,nr);pc.mergeAt=tick+mergeTicks(nr);
    let an=rng.angle();const stepA=2*Math.PI/n;
    for(let k=0;k<n;k++){const ux=Math.cos(an),uy=Math.sin(an);
      const q=w.newPiece(ps.slot,pc.x+ux*nr*SPLIT.OFFSET,pc.y+uy*nr*SPLIT.OFFSET,nr);
      q.vx=pc.vx;q.vy=pc.vy;addBoost(q,ux,uy,SPLIT.DIST);q.mergeAt=pc.mergeAt;
      w.events.push({type:"SPLIT",slot:ps.slot,pieceId:pc.id,childId:q.id,x:pc.x,y:pc.y,r:nr});count++;an+=stepA;}
    did++;}
  return did;}
/**
 * Eject: pellet r=EJECT.R com massa R²·MASS_FACTOR a (velocidade padrão da peça) + dir·SPEED — a peça não tem
 * mais velocidade própria, então a do movimento entra explícita (vmaxFor) para o pellet continuar saindo à
 * frente de quem está correndo. O recuo é um empurrão curto de RECOIL_DIST·(m_pellet/m_peça) px, no canal de
 * impulso. Retorna quantos pellets. @param {World} w @param {PlayerState} ps
 */
export function applyEject(w,ps){
  const arr=ps.pieces,len=arr.length,mp=EJECT.R*EJECT.R*EJECT.MASS_FACTOR,minM=PLAYER.MIN_PIECE_R*PLAYER.MIN_PIECE_R;let did=0;
  for(let i=0;i<len;i++){const pc=arr[i];if(pc.dead||pc.r<EJECT.MIN_R)continue;const m1=pc.mass-mp;if(m1<minM)continue;
    dirTo(pc.x,pc.y,ps.tx,ps.ty,DIR);const ux=DIR[0],uy=DIR[1],r1=Math.sqrt(m1),vp=vmaxFor(pc.r);
    const e=w.addEjected(pc.x+ux*(r1+LOCAL.EJECT_OFFSET),pc.y+uy*(r1+LOCAL.EJECT_OFFSET),ux*(vp+EJECT.SPEED),uy*(vp+EJECT.SPEED),
      EJECT.R,mp,ps.slot,EJECT.OWNER_IMMUNE_TICKS,EJECT.LIFE_TICKS);
    setMass(pc,m1);addBoost(pc,-ux,-uy,EJECT.RECOIL_DIST*mp/m1);did++;
    w.events.push({type:"EJECT",slot:ps.slot,pieceId:pc.id,ejectId:e.id,x:e.x,y:e.y});}
  return did;}
/**
 * Alvo do tiro mirado: o objeto vivo mais próximo dentro do cone ±MISSILE.AIM_CONE em volta da flecha, a até
 * AIM_RANGE — peça de outro dono (kind 0, alvo = slot), míssil inimigo, asteroide ou estrela (kind 1, alvo = id da
 * entidade; mirar numa estrela já inchando adianta a supernova).
 * Sem nada no cone devolve [-1,0] e o míssil segue reto. Empate de distância fica com a peça (varrida primeiro).
 * @param {World} w
 */
function aimTarget(w,slot,src,ux,uy,out){
  const cone=Math.cos(MISSILE.AIM_CONE);let bd=MISSILE.AIM_RANGE*MISSILE.AIM_RANGE,id=-1,kind=0;
  const inCone=b=>{const dx=b.x-src.x,dy=b.y-src.y,d2=dx*dx+dy*dy;
    if(d2>=bd||d2<1e-6||(dx*ux+dy*uy)/Math.sqrt(d2)<cone)return false;bd=d2;return true;};
  const pcs=w.pieces;for(let i=0;i<pcs.length;i++){const p=pcs[i];if(!p.dead&&p.owner!==slot&&inCone(p)){id=p.owner;kind=0;}}
  const ms=w.missiles;for(let i=0;i<ms.length;i++){const m=ms[i];if(!m.dead&&m.owner!==slot&&inCone(m)){id=m.id;kind=1;}}
  const as=w.asteroids;for(let i=0;i<as.length;i++){const a=as[i];if(!a.dead&&inCone(a)){id=a.id;kind=1;}}
  const sts=w.stars;for(let i=0;i<sts.length;i++){const st=sts[i];if(!st.dead&&inCone(st)){id=st.id;kind=1;}}
  out[0]=id;out[1]=kind;}
const AIM=[-1,0];
/**
 * Fire: gasta 1 míssil e **um nível** do escudo da peça que atira. Sai da primeira peça viva. Com `ps.fireAim`
 * (tiro mirado, o jogador segurou o botão) o míssil **persegue o objeto mais próximo dentro do cone da flecha**
 * (peça inimiga ou míssil inimigo) e só vai reto se o cone estiver vazio.
 * Sem mira o alvo é, em ordem: míssil inimigo mirando este slot a
 * < INTERCEPT_DIST e se aproximando (o mais próximo; ordem do array desempata) → interceptação (type 1);
 * senão o oponente vivo mais próximo (homing, type 0); sem alvo, direção aleatória. @param {World} w @param {PlayerState} ps
 */
export function applyFire(w,ps){
  if(ps.missiles<=0)return false;const src=firstLive(ps.pieces);if(!src)return false;ps.missiles--;
  if(src.shieldLv>0)hitShield(w,src);
  if(ps.fireAim){dirTo(src.x,src.y,ps.tx,ps.ty,DIR);const ax=DIR[0],ay=DIR[1];aimTarget(w,ps.slot,src,ax,ay,AIM);
    const m=w.addMissile(src.x,src.y,ax*MISSILE.SPEED,ay*MISSILE.SPEED,ps.slot,AIM[0]);m.type=AIM[1];
    w.events.push({type:"FIRE",slot:ps.slot,missileId:m.id,x:m.x,y:m.y,targetSlot:AIM[1]?-1:AIM[0],targetMissile:AIM[1]?AIM[0]:-1,aimed:true});return true;}
  const ms=w.missiles;let im=null,id2=MISSILE.INTERCEPT_DIST*MISSILE.INTERCEPT_DIST;
  for(let i=0;i<ms.length;i++){const m=ms[i];if(m.dead||m.owner===ps.slot||m.type!==0||m.targetId!==ps.slot)continue;
    const dx=m.x-src.x,dy=m.y-src.y,d2=dx*dx+dy*dy;if(d2<id2&&dx*m.vx+dy*m.vy<0){id2=d2;im=m;}}
  let ux,uy,best=-1,kind=0;
  if(im){dirTo(src.x,src.y,im.x,im.y,DIR);ux=DIR[0];uy=DIR[1];best=im.id;kind=1;}
  else{let bd=Infinity,bx=0,by=0;
    for(const o of w.players.values()){if(o===ps||!o.alive)continue;const op=firstLive(o.pieces);if(!op)continue;
      const dx=op.x-src.x,dy=op.y-src.y,d2=dx*dx+dy*dy;if(d2<bd){bd=d2;best=o.slot;bx=op.x;by=op.y;}}
    if(best>=0){dirTo(src.x,src.y,bx,by,DIR);ux=DIR[0];uy=DIR[1];}else{const an=w.rng.angle();ux=Math.cos(an);uy=Math.sin(an);}}
  const m=w.addMissile(src.x,src.y,ux*MISSILE.SPEED,uy*MISSILE.SPEED,ps.slot,best);m.type=kind;
  w.events.push({type:"FIRE",slot:ps.slot,missileId:m.id,x:m.x,y:m.y,targetSlot:kind?-1:best,targetMissile:kind?best:-1});return true;}

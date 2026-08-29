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
import {DT,PLAYER,SPLIT,shieldTierFor,EJECT,ejectR,EJECT_MASS,FRAG,fragR,fragLife,mergeTicks,EAT,BOUNCE,FOOD_TYPE,ASTEROID,BLACKHOLE,MISSILE,aimScore,POWERUP,STAR,ZONE,WEAPON,WEAPONS,weaponOf,weaponOfFood} from "../constants.js";
import {KIND,BH_PHASE,FOOD_FLAG,STAR_PHASE,FRAG_KIND} from "../protocol/constants.js";
import {clamp} from "../util.js";
import {setR,setMass,addMass,addBoost,boostLeft,capBoost,velX,velY,liveCount,firstLive} from "./body.js";
import {resolveBounce,separateOwn} from "./collide.js";
import {vmaxFor} from "./integrate.js";

/** Constantes locais — vêm do mockup/v1 e não existem em constants.js (ver relatório). */
export const LOCAL={POP_DIV:22,POP_MIN:2,POP_MAX:6,POP_DIST:780,             // pop: n=clamp(⌊r/22⌋,2,6), filhos arremessados POP_DIST px (o vírus do agar usa os mesmos 780 do split)
  CHIP_SPEED:360,CHIP_SPREAD:.6,CHIP_N:[1,2],                              // lascas: 1–2 fragmentos a 360 px/s ±.6 rad (raio/vida vêm de fragR/fragLife pela massa)
  FEED_KICK:.04,SHOOT_OFFSET:40,                                           // asteroide alimentado ganha 4% da v do pellet; filho nasce a r+40
  EJECT_OFFSET:6,DEBRIS_SPREAD:6.2832,                                     // pellet nasce a r+6; debris de míssil sai em todas as direções
  HOLE_MARGIN:300,HOLE_MIN_RI:10,                                          // buraco fica a ≥300 px da borda; influência <10 px = inerte
  FOOD_OVERLAP:.5,FEED_OVERLAP:.6};                                         // come comida a d<r+fr·.5; asteroide absorve pellet a d<r+er·.6

/** @typedef {import("./body.js").Body} Body */
/** @typedef {import("./world.js").World} World */
/** @typedef {import("./world.js").PlayerState} PlayerState */

// ── EQUIPES E ZONA ───────────────────────────────────────────────────────────
/**
 * `a` e `b` são aliados? É a ÚNICA fonte da resposta — o cérebro do bot só otimiza o comportamento; quem
 * impede de comer, de acertar e de mirar é isto, chamado nos seis pontos de decisão (piecePair, pieceMissile,
 * missileMissile, incomingMissile, aimTarget e a busca de alvo do applyFire).
 * `w.peace` é o aquecimento do Battle Royale: enquanto ele está ligado TODO MUNDO é aliado, então a espera
 * não precisou de nenhuma regra própria. Sem equipe (team −1, o modo Livre inteiro) ninguém é aliado de ninguém.
 * @param {World} w
 */
export function sameTeam(w,a,b){
  if(a<0||b<0)return false;   // sem dono (-1) não é aliado de ninguém — nem de outro sem dono: `-1===-1` diria que sim
  if(a===b)return true;
  if(w.peace)return true;
  const pa=w.players.get(a),pb=w.players.get(b);
  return !!(pa&&pb&&pa.team>=0&&pa.team===pb.team);}

/**
 * Fora da zona a peça QUEIMA ZONE.BURN da massa por segundo e, ao chegar no piso MIN_PIECE_R, MORRE — sem
 * piso, ao contrário da queimadura de estrela. É o único jeito de a partida acabar sozinha, e é de propósito
 * que a conta usa o CENTRO da peça: "meu ponto está dentro do círculo?" é o que o jogador lê na tela.
 * O evento é estrangulado a 1×/s por peça (o `(tick+id)%30` espalha as emissões entre as peças, em vez de
 * despejar 800 eventos no mesmo tick e estourar o teto de `wireEvents`); a morte sempre emite.
 * Devolve true se a peça morreu — o laço de integração pula o resto dela.
 * @param {World} w @param {Body} pc @param {{x:number,y:number,r:number}} zc
 */
export const outOfZone=(pc,zc)=>{const dx=pc.x-zc.x,dy=pc.y-zc.y;return dx*dx+dy*dy>zc.r*zc.r;};
/** Massa depois de um tick fora: a MESMA conta no servidor e na predição do cliente (a paridade é testada). */
export const zoneMass=(m,dt)=>m*(1-ZONE.BURN*dt);
export function zoneBurn(w,pc,zc,dt){
  if(!outOfZone(pc,zc))return false;
  const m0=pc.mass,m=zoneMass(m0,dt),floor=PLAYER.MIN_PIECE_R*PLAYER.MIN_PIECE_R;
  // "para fora": a direção do centro da zona para a peça. É por onde as pelotas saem, e é o que faz
  // recuperá-las custar entrar mais fundo no gás em vez de ser lucro de graça na beirada.
  const dx=pc.x-zc.x,dy=pc.y-zc.y,d=Math.sqrt(dx*dx+dy*dy)||1,ux=dx/d,uy=dy/d;
  if(m<=floor){   // chegou no piso: morre e larga TUDO o que ainda tinha, ali mesmo no gás
    const resto=pc.shed+m0;pc.shed=0;
    w.events.push({type:"ZONE_BURN",slot:pc.owner,pieceId:pc.id,x:pc.x,y:pc.y,r:pc.r,lost:m0,died:true});
    spillFrag(w,pc.x,pc.y,ux,uy,resto,ZONE.SHED_N_DEATH,ZONE.SHED_SPEED*1.6,6.2832,-1,0);
    w.killPiece(pc,"zone",-1);return true;}
  setMass(pc,m);
  // a massa arrancada se acumula e vira UMA pelota a cada SHED_TICKS: a conta continua contínua (é a que a
  // predição do cliente espelha), só a entrega é em pedaços — soltar a cada tick estouraria EJECT.MAX.
  pc.shed+=m0-m;
  if((w.tick+pc.id)%ZONE.SHED_TICKS===0&&pc.shed>=ZONE.SHED_MIN*EJECT_MASS){
    const lost=pc.shed;pc.shed=0;
    spillFrag(w,pc.x+ux*pc.r,pc.y+uy*pc.r,ux,uy,lost,1,ZONE.SHED_SPEED,ZONE.SHED_SPREAD,pc.owner,ownerImmune(pc.r));
    w.events.push({type:"ZONE_BURN",slot:pc.owner,pieceId:pc.id,x:pc.x,y:pc.y,r:pc.r,lost,died:false});}
  return false;}

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
 * quique mass-weighted entre tamanhos parecidos. O escudo **não interfere aqui**: ele defende de míssil e de
 * asteroide, e nada mais — quem é maior come, com escudo ou sem.
 * @param {World} w @param {Body} A @param {Body} B
 */
export function piecePair(w,A,B){
  const psA=w.players.get(A.owner),psB=w.players.get(B.owner);
  const dx=B.x-A.x,dy=B.y-A.y,d2=dx*dx+dy*dy,ra=A.r,rb=B.r,sum=ra+rb;if(d2<=0)return;
  // aliado (ou aquecimento): mesmo tratamento das peças do MESMO dono — separação só posicional, sem impulso.
  // Dar quique entre companheiros transformaria correr em grupo num pinball, e é o empurrão que dava embalo de graça.
  if(sameTeam(w,A.owner,B.owner)){if(d2<sum*sum)separateOwn(A,B);return;}
  const aBig=ra>=rb*EAT.RATIO,bBig=!aBig&&rb>=ra*EAT.RATIO;
  if(aBig||bBig){
    const big=aBig?A:B,small=aBig?B:A,psBig=aBig?psA:psB,psSmall=aBig?psB:psA;
    const lim=big.r-small.r*EAT.CENTER;if(lim>0&&d2<lim*lim)eatPiece(w,psBig,big,psSmall,small);   // o escudo NÃO impede de ser comido: ele defende só de míssil e asteroide
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
  if(t===FOOD_TYPE.AMMO){const cap=weaponOf(ps.weapon).ammo;if(ammoOf(ps)<cap)addAmmo(ps,1);w.events.push({type:"AMMO",slot:ps.slot});}   // munição é da arma EQUIPADA (no míssil o teto é o MAX_AMMO de sempre)
  else if(t===FOOD_TYPE.SHIELD){if(pc.shieldLv<POWERUP.SHIELD_MAX_LEVEL)pc.shieldLv++;pc.shieldEvolveAt=tick+POWERUP.SHIELD_EVOLVE_TICKS;
    w.events.push({type:"POWERUP",slot:ps.slot,kind:"shield"});w.events.push({type:"SHIELD_UP",slot:ps.slot,level:pc.shieldLv,x:pc.x,y:pc.y,r:pc.r});}
  else if(t===FOOD_TYPE.MAGNET){if(pc.r<=POWERUP.MAGNET_MAX_R)pc.magnetUntil=(pc.magnetUntil>tick?pc.magnetUntil:tick)+POWERUP.TICKS;   // planeta grande não pega ímã: o alcance é r·MAGNET_RANGE e sugaria a tela inteira
    w.events.push({type:"POWERUP",slot:ps.slot,kind:"magnet"});}
  else if(t===FOOD_TYPE.MERGE){const arr=ps.pieces;for(let i=0;i<arr.length;i++){const q=arr[i];if(!q.dead)q.mergeAt=tick;}   // vale para TODAS as peças: o poder é justamente juntar quem foi picado
    w.events.push({type:"POWERUP",slot:ps.slot,kind:"merge"});}
  else if(t>=FOOD_TYPE.W_BURST){const wi=weaponOfFood(t);   // entra no cinto E já vem na mão (pegar e não ver nada acontecer é pior que não pegar)
    if(wi>0){ps.ammo[wi]=WEAPONS[wi].ammo;ps.weapon=wi;w.events.push({type:"POWERUP",slot:ps.slot,kind:"weapon",weapon:wi});}}
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
 * **A rocha SEMPRE morre no contato** (POP + respawn): antes ela sobrevivia ao quique em cinco caminhos (peça
 * menor que ela, peça blindada, raspão, dono com 16 peças, pop sem vaga) e ficava batendo sem parar no mesmo
 * planeta. Como ela some, o cooldown `chipUntil` deixou de ser necessário aqui — cada rocha cobra uma vez só.
 * Quique = e=ASTEROID.E (impulso pela normal, ponderado pela massa) + lasca.
 * **Com escudo o preço é a VELOCIDADE da batida** (`shieldTierFor`, ver ASTEROID.SHIELD_VN): devagar custa 1 nível,
 * média 2, e rápida demais custa o escudo INTEIRO e ainda estoura o planeta — nessa faixa a rocha atravessa como se
 * não houvesse escudo. Abaixo disso o escudo segura de verdade: nada de lasca e nada de pop, só o empurrão do quique
 * (curto, com teto BOUNCE.DIST_MAX, e a velocidade volta sozinha ao padrão).
 * A velocidade de aproximação soma o quanto o PLANETA está correndo contra a rocha (velX/velY), não só a dela.
 * @param {World} w @param {Body} pc @param {Body} a
 */
export function pieceAsteroid(w,pc,a){
  const dx=a.x-pc.x,dy=a.y-pc.y,d2=dx*dx+dy*dy,ps=w.players.get(pc.owner);
  if(w.peace){const s0=pc.r+a.r;if(d2<s0*s0&&d2>0){const vn=bouncePiece(pc,a,ASTEROID.E,true,false);if(vn>BOUNCE.FX_MIN_VN)bounceEvent(w,pc,a,vn);}return;}   // aquecimento: a rocha quica e pronto
  const dd=Math.sqrt(d2)||1,nx=dx/dd,ny=dy/dd;
  const vin=(velX(pc)-velX(a))*nx+(velY(pc)-velY(a))*ny;   // >0: estão se aproximando
  const tier=shieldTierFor(vin),blindada=pc.shieldLv>0&&tier<POWERUP.SHIELD_MAX_LEVEL;
  if(!blindada&&pc.r>a.r*ASTEROID.POP_RATIO){const lim=pc.r*ASTEROID.POP_DIST;
    if(d2<lim*lim&&popAsteroid(w,ps,pc,a)){if(pc.shieldLv>0)breakShield(w,pc,-1);return;}   // rápida demais: leva o escudo junto
    if(liveCount(ps.pieces)<PLAYER.MAX_PIECES&&impactParam(pc,a)<lim)return;}   // vindo para o miolo: deixa entrar (vai estourar); de raspão cai no quique
  const s=pc.r+a.r;if(d2>=s*s||d2<=0)return;
  const vn=bouncePiece(pc,a,ASTEROID.E,true,false);
  if(pc.shieldLv>0){if(tier>0)for(let i=0;i<tier&&pc.shieldLv>0;i++)hitShield(w,pc,-1,nx,ny,WEAPON_ASTEROIDE);}
  else chipPiece(w,ps,pc,a,nx,ny);
  if(vn>BOUNCE.FX_MIN_VN)bounceEvent(w,pc,a,vn);
  a.dead=true;w.queueAsteroid(a.type,ASTEROID.RESPAWN_TICKS);   // encostou, EXPLODIU: a rocha nunca sobra para ficar batendo de novo
  w.events.push({type:"POP",slot:ps.slot,asteroidId:a.id,x:a.x,y:a.y,r:a.r});}
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
 * (`chipUntil`) e com r ≥ SHATTER_MIN_R, **queima STAR.BURN da massa** e estilhaça o que sobrou (starShatter).
 * O escudo não salva: ele só defende de míssil e asteroide.
 * A estrela morre no contato, mas a supernova sai com `rammed` — quem trombou não leva o berçário junto.
 * @param {World} w @param {Body} pc @param {Body} st
 */
export function pieceStar(w,pc,st){
  if(st.k<STAR.ARM_K)return;
  const dx=pc.x-st.x,dy=pc.y-st.y,d2=dx*dx+dy*dy,lim=pc.r+st.r;if(d2>=lim*lim)return;
  const d=Math.sqrt(d2),ux=d>1e-6?dx/d:1,uy=d>1e-6?dy/d:0,tick=w.tick;
  addBoost(pc,ux,uy,STAR.PUSH_TOUCH_DIST);
  if(w.peace)return;   // aquecimento: a estrela empurra, mas não queima nem explode — a partida ainda não começou
  if(tick>=pc.chipUntil&&pc.r>=STAR.SHATTER_MIN_R){pc.chipUntil=tick+STAR.SHATTER_CD_TICKS;
    starShatter(w,w.players.get(pc.owner),pc,st,ux,uy);}   // o escudo NÃO salva da estrela: ele só defende de míssil e asteroide
  supernova(w,st,true);}   // encostou nela: a estrela explode e morre (a sala repõe uma) — sem prêmio para quem trombou
/**
 * Estilhaça a peça em n+1 pedaços (limitado por MAX_PIECES e por MIN_PIECE_R): o pai encolhe para r/√(n+1)
 * — massa conservada, como no pop do asteroide — e os filhos saem em leque em volta de (ux,uy) a `dist` px,
 * todos com o cooldown de fusão renovado. Usada pela estrela E pelo míssil (o tiro parte o alvo).
 * @param {World} w @param {PlayerState} ps @param {Body} pc
 */
export function shatterPiece(w,ps,pc,ux,uy,nWanted,dist){
  const tick=w.tick,rng=w.rng,room=PLAYER.MAX_PIECES-liveCount(ps.pieces);if(room<1)return false;
  let n=nWanted;if(n>room)n=room;
  const maxN=Math.floor(pc.mass/(PLAYER.MIN_PIECE_R*PLAYER.MIN_PIECE_R))-1;if(n>maxN)n=maxN;if(n<1)return false;
  const nr=pc.r/Math.sqrt(n+1),base=Math.atan2(uy,ux);setR(pc,nr);pc.mergeAt=tick+mergeTicks(nr);
  for(let i=0;i<n;i++){const an=base+(i+1)/(n+1)*6.2832+rng.range(-.25,.25),sp=dist*(.8+rng.next()*.4);
    const q=w.newPiece(ps.slot,pc.x,pc.y,nr);addBoost(q,Math.cos(an),Math.sin(an),sp);q.mergeAt=pc.mergeAt;}
  addBoost(pc,ux,uy,dist*.5);return true;}
/**
 * A estrela te queimou (contato ou miolo da supernova): **QUEIMA STAR.BURN da massa** e estilhaça o que sobrou.
 * A massa queimada não vira fragmento nem pellet — ela some do mundo. É a única coisa do jogo que DESTRÓI massa
 * fora do PLAYER.DECAY: pop/estilhaço só repartem (massa conservada) e lasca/míssil devolvem como fragmento que o
 * próprio dono recolhe. Sem isso, atropelar estrela era lucro para o gigante. Piso em MIN_PIECE_R: ninguém morre.
 * Queima ANTES de repartir de propósito — o `maxN` de shatterPiece é ⌊mass/MIN_PIECE_R²⌋−1, então a peça pequena
 * já sai com menos cacos sem precisar de regra nova. Emite STAR_BURST sempre (com o raio e a massa de ANTES), mesmo
 * quando não há vaga de peça para estilhaçar: a queimadura precisa de retorno na tela e no som.
 * @param {World} w @param {Body} st
 */
export function starShatter(w,ps,pc,st,ux,uy){
  const m0=pc.mass,r0=pc.r,floor=PLAYER.MIN_PIECE_R*PLAYER.MIN_PIECE_R,keep=m0*(1-STAR.BURN);
  setMass(pc,keep>floor?keep:floor);const burn=m0-pc.mass;   // medido ANTES do estilhaço, que reparte o que sobrou
  const n=w.rng.int(STAR.SHATTER_N[0],STAR.SHATTER_N[1]);
  shatterPiece(w,ps,pc,ux,uy,n,STAR.SHATTER_DIST);
  w.events.push({type:"STAR_BURST",slot:ps.slot,starId:st.id,x:pc.x,y:pc.y,r:r0,burn});return true;}
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
 * e salva, sem escudo a peça estilhaça. Uma estrela nova entra na fila para RESPAWN_TICKS.
 * `rammed` = foi um PLANETA que trombou nela: com STAR.RAM_REWARD desligado, essa supernova não larga nem os
 * fragmentos nem o berçário — senão quem paga a queimadura colhe o prêmio no mesmo lugar e atropelar volta a
 * compensar. O empurrão, o AST_KICK e o estilhaço do miolo continuam: aquilo é perigo, não prêmio.
 * @param {World} w @param {Body} st @param {boolean} [rammed]
 */
export function supernova(w,st,rammed=false){
  const rng=w.rng,blast=st.r*STAR.NOVA_R,b2=blast*blast,N=STAR.NOVA_PARTICLES;
  const pm=EJECT_MASS*STAR.NOVA_PART_MASS,pr=fragR(pm),premio=!rammed||STAR.RAM_REWARD;
  if(premio)for(let i=0;i<N;i++){const an=i/N*6.2832+rng.range(-.12,.12),sp=rng.range(STAR.NOVA_SPEED[0],STAR.NOVA_SPEED[1]),cx=Math.cos(an),cy=Math.sin(an);
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
    starShatter(w,w.players.get(pc.owner),pc,st,ux,uy);}   // o escudo não salva da supernova (só míssil e asteroide)
  // berçário: a estrela morta vira um cacho de comida que fica. Ele REALOCA em vez de somar — para cada pelota do
  // cacho some uma de longe, escolhida pelo rng da sala. Sem isso a população subia para sempre (o laço de reposição
  // do mundo só ENCHE até FOOD.COUNT, nunca corta), e em 15 min já eram 6072 comidas no lugar de 5000.
  const longe=blast*STAR.NOVA_FOOD_R*3,longe2=longe*longe,pool=w.food;
  if(premio)for(let i=0;i<STAR.NOVA_FOOD;i++){
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
/**
 * Par (corpo dinâmico, buraco): a gravidade puxa TODO MUNDO conforme o tipo; quem chega ao núcleo é ESMAGADO —
 * não há mais teleporte. A exceção é o tamanho: peça com `r >= rc·CRUSH_K` (a bola do buraco na tela) passa por
 * cima e não acontece nada — ela continua sendo puxada, só não morre. @param {World} w @param {Body} A @param {Body} h
 */
export function holePair(w,A,h){
  const ri=h.r*BLACKHOLE.INFLUENCE*h.k,rc=h.r*h.k;if(ri<LOCAL.HOLE_MIN_RI)return;
  switch(A.kind){
    case KIND.PIECE:{const d=pullBody(h,A,1,rc,ri);
      if(d<rc&&A.r<rc*BLACKHOLE.CRUSH_K&&w.tick>=A.cdUntil)crushPiece(w,w.players.get(A.owner),A,h);break;}
    case KIND.EJECT:{if(pullBody(h,A,BLACKHOLE.EJECT_PULL,rc,ri)<rc)A.dead=true;break;}   // pelota é engolida: o buraco é o sumidouro
    case KIND.MISSILE:{if(pullBody(h,A,BLACKHOLE.MISSILE_PULL,rc,ri)<rc){A.dead=true;
      w.events.push({type:"BOOM",x:A.x,y:A.y,r:A.r,slot:A.owner,bySlot:-1,weapon:armaDoMissil(A)});}break;}
    case KIND.ASTEROID:{if(A.type<0&&pullBody(h,A,BLACKHOLE.AST_PULL,rc,ri)<rc){A.dead=true;w.queueAsteroid(-1,0);
      w.events.push({type:"POP",slot:-1,asteroidId:A.id,x:A.x,y:A.y,r:A.r});}break;}}}
/**
 * O planeta esmagado não evapora: a massa INTEIRA vira SPAGHETTI_N pellets sem dono espalhados em volta do buraco,
 * girando no sentido dele. Quem estiver rondando, lucra. @param {World} w @param {Body} h
 */
function spillMass(w,h,mass){
  if(mass<=0)return;const rng=w.rng,n=BLACKHOLE.SPAGHETTI_N,part=mass/n,rr=fragR(part),life=fragLife(part),k=fragKind(part),spin=h.seed<.5?1:-1;
  const ri=Math.max(h.r*2,h.r*BLACKHOLE.INFLUENCE*h.k);
  for(let i=0;i<n;i++){const an=rng.angle(),d=ri*BLACKHOLE.SPAGHETTI_R*(.95+rng.next()*.18);   // logo fora da influência: não voltam para dentro
    const x=clamp(h.x+Math.cos(an)*d,rr,w.w-rr),y=clamp(h.y+Math.sin(an)*d,rr,w.h-rr);
    const v=BLACKHOLE.SPAGHETTI_V;
    w.addEjected(x,y,Math.cos(an)*v*.5-Math.sin(an)*v*spin,Math.sin(an)*v*.5+Math.cos(an)*v*spin,rr,part,-1,0,life,k);}}
/**
 * Núcleo: a peça é ESMAGADA — morre e a massa inteira volta ao mundo como pellets em volta do buraco (spillMass).
 * Sem teleporte e sem pedágio: ou você é maior que a bola do buraco e passa por cima, ou vira comida para os outros.
 */
export function crushPiece(w,ps,pc,h){
  const fromX=pc.x,fromY=pc.y;spillMass(w,h,pc.mass);
  w.events.push({type:"BH_SUCK",slot:ps.slot,pieceId:pc.id,fromX,fromY,r:pc.r,destroyed:true,holeX:h.x,holeY:h.y});
  w.killPiece(pc,"blackhole",-1);}

// ── mísseis ──
/**
 * Homing: v → lerp(v, dir(alvo)·SPEED, TURN) por tick. type 0: alvo é o slot targetId (primeira peça viva);
 * type 1: alvo é a entidade de id targetId — míssil (interceptação), asteroide ou estrela (tiro mirado).
 * Se o alvo sumiu, o interceptador **vai atrás de quem atirou** (`srcSlot`) em vez de virar tiro perdido: o CLASH
 * mata os dois mísseis, e antes disto o segundo interceptador voava reto até expirar. Sem `srcSlot`, segue reto.
 * @param {World} w @param {Body} m
 */
export function homeMissile(w,m){
  if(m.hue===WEAPON.CLUSTER&&clusterSplit(w,m))return;
  if(m.targetId<0)return;let tx,ty;
  if(m.type===1){const t=w.entityById.get(m.targetId);
    if(!t||t.dead||(t.kind!==KIND.MISSILE&&t.kind!==KIND.ASTEROID&&t.kind!==KIND.STAR)){m.type=0;m.targetId=m.srcSlot;m.srcSlot=-1;return;}
    tx=t.x;ty=t.y;}
  else{const t=w.players.get(m.targetId),tp=t&&t.alive?firstLive(t.pieces):null;if(!tp)return;tx=tp.x;ty=tp.y;}
  const dx=tx-m.x,dy=ty-m.y,l=Math.sqrt(dx*dx+dy*dy)||1,k=MISSILE.TURN;
  m.vx+=(dx/l*MISSILE.SPEED-m.vx)*k;m.vy+=(dy/l*MISSILE.SPEED-m.vy)*k;}
/**
 * CACHO: a `splitD` do alvo o míssil se abre em `n` teleguiados menores em leque, todos no mesmo alvo. Cada
 * filho já nasce como míssil comum (hue MISSILE), então nenhum deles se abre de novo — sem isso a arma
 * seria uma bomba de população, o mesmo erro que a estrela que rachava em estrelas. Devolve true se abriu.
 * @param {World} w @param {Body} m
 */
/**
 * Com que ARMA aquele míssil foi disparado. Existe porque `clusterSplit` zera o `hue` do filho para
 * WEAPON.MISSILE de propósito (senão o filho se abriria de novo — é a proteção contra bomba de população),
 * e sem isto todo abate de Cacho apareceria no kill feed como míssil. A marca de origem vai no `hits`, que
 * para KIND.MISSILE não tem uso nenhum (só a ESTRELA conta `hits`), seguindo a mesma convenção de
 * significado-por-kind que `hue` e `type` já usam — acrescentar um campo ao createBody custaria um slot em
 * CADA grão de comida, e são milhares.
 */
export const WEAPON_ASTEROIDE=-2;   // "não foi arma de jogador": a rocha
const armaDoMissil=m=>(m&&m.hits)?m.hits:(m?m.hue:WEAPON.MISSILE);

function clusterSplit(w,m){
  if(m.targetId<0)return false;
  let tx,ty;
  if(m.type===0){const ps=w.players.get(m.targetId),p=ps&&ps.alive?firstLive(ps.pieces):null;if(!p)return false;tx=p.x;ty=p.y;}
  else{const e=w.entityById.get(m.targetId);if(!e||e.dead)return false;tx=e.x;ty=e.y;}
  const wp=WEAPONS[WEAPON.CLUSTER],dx=tx-m.x,dy=ty-m.y;
  if(dx*dx+dy*dy>wp.splitD*wp.splitD)return false;
  const a0=Math.atan2(m.vy,m.vx);
  for(let i=0;i<wp.n;i++){const an=a0+(i/(wp.n-1)-.5)*wp.spread,ux=Math.cos(an),uy=Math.sin(an);
    const q=w.addMissile(m.x,m.y,ux*MISSILE.SPEED,uy*MISSILE.SPEED,m.owner,m.targetId);
    q.type=m.type;q.srcSlot=m.srcSlot;q.hue=WEAPON.MISSILE;q.hits=WEAPON.CLUSTER;q.life=m.life;}   // hue = como ele se COMPORTA (míssil simples); hits = de onde ele VEIO (cacho), para o kill feed
  m.dead=true;w.events.push({type:"SHOOT",x:m.x,y:m.y,nx:Math.cos(a0),ny:Math.sin(a0)});
  return true;}
/**
 * Impacto em peça de outro dono: com escudo, o míssil explode no escudo e tira 1 nível (SHIELD_HIT, ou SHIELD_BREAK ao
 * chegar a 0; o timer de evolução reinicia; massa intacta). Sem escudo: peça encolhe para r·HIT_SHRINK (mín. MIN_PIECE_R)
 * e solta HIT_DEBRIS fragmentos que somam EXATAMENTE a massa arrancada (BOOM) — acertar um planetão deixa uma
 * colheita gorda no chão em vez de evaporar 39% dele. O míssil morre nos dois casos. @param {World} w @param {Body} pc @param {Body} m
 */
export function pieceMissile(w,pc,m){
  if(sameTeam(w,m.owner,pc.owner))return;const dx=m.x-pc.x,dy=m.y-pc.y,s=pc.r+m.r;if(dx*dx+dy*dy>=s*s)return;
  if(pc.shieldLv>0){m.dead=true;const d=Math.sqrt(dx*dx+dy*dy)||1;hitShield(w,pc,m.owner,dx/d,dy/d,armaDoMissil(m));return;}
  const wp=weaponOf(m.hue),shrink=wp.shrink==null?MISSILE.HIT_SHRINK:wp.shrink;
  const m0=pc.mass;let r=pc.r*shrink;if(r<PLAYER.MIN_PIECE_R)r=PLAYER.MIN_PIECE_R;setR(pc,r);
  spillFrag(w,pc.x,pc.y,1,0,m0-pc.mass,MISSILE.HIT_DEBRIS,MISSILE.DEBRIS_SPEED,LOCAL.DEBRIS_SPREAD,pc.owner,EJECT.OWNER_IMMUNE_TICKS);
  m.dead=true;w.events.push({type:"BOOM",x:m.x,y:m.y,r:pc.r,slot:pc.owner,bySlot:m.owner,weapon:armaDoMissil(m)});
  if(!wp.shatter)return;   // a Rajada arranha e empurra; PARTIR o alvo é privilégio do míssil e do cacho
  const d=Math.sqrt(dx*dx+dy*dy)||1,n=w.rng.int(MISSILE.SHATTER_N[0],MISSILE.SHATTER_N[1]);
  shatterPiece(w,w.players.get(pc.owner),pc,-dx/d,-dy/d,n,MISSILE.SHATTER_DIST);}   // o tiro PARTE o alvo, não só arranca massa: é a arma anti-gigante
/**
 * Míssil × míssil (donos diferentes), teste varrido no último passo: menor distância entre os centros ao longo do
 * movimento relativo do tick (segmento p−v·DT → p) < ra+rb → ambos morrem, CLASH no ponto médio. Retorna true se chocou.
 * @param {World} w @param {Body} A @param {Body} B
 */
export function missileMissile(w,A,B){
  if(sameTeam(w,A.owner,B.owner))return false;
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
export function breakShield(w,pc,bySlot=-1,weapon=-1){pc.shieldLv=0;w.events.push({type:"SHIELD_BREAK",slot:pc.owner,x:pc.x,y:pc.y,r:pc.r,bySlot,weapon});}
/**
 * O escudo DESTA peça perde UM nível e o timer de evolução dela reinicia: míssil inimigo, batida forte de asteroide ou
 * tiro do próprio dono (bySlot −1). Emite SHIELD_HIT enquanto sobra nível, SHIELD_BREAK quando zera. @param {World} w @param {Body} pc
 */
export function hitShield(w,pc,bySlot=-1,nx=0,ny=0,weapon=-1){
  pc.shieldLv--;pc.shieldEvolveAt=w.tick+POWERUP.SHIELD_EVOLVE_TICKS;
  if(pc.shieldLv>0)w.events.push({type:"SHIELD_HIT",slot:pc.owner,level:pc.shieldLv,x:pc.x,y:pc.y,r:pc.r,nx,ny,bySlot,weapon});
  else w.events.push({type:"SHIELD_BREAK",slot:pc.owner,x:pc.x,y:pc.y,r:pc.r,bySlot,weapon});}

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
 * Quanto tempo o dono fica sem poder recolher a própria cusparada. Fixo em 20 ticks (0,33 s) o planetão
 * alcançava a pelota e a re-engolia — medido, 63 de 86 voltavam e a massa mal caía. Agora soma o tempo que
 * ele leva para percorrer o próprio raio (r/vmax), então cuspir custa massa de verdade em qualquer tamanho.
 */
const ownerImmune=r=>EJECT.OWNER_IMMUNE_TICKS+Math.round(r/vmaxFor(r)/DT);
/**
 * Eject: pellet r=ejectR(pc.r) — PROPORCIONAL a quem cospe — com massa r²·MASS_FACTOR, a (velocidade padrão da
 * peça) + dir·sp. Com raio fixo, um planeta de 360.000 precisava de 3.419 cusparadas para se esvaziar, e
 * segurar o W só enchia a tela de pontinhos. A peça não tem
 * mais velocidade própria, então a do movimento entra explícita (vmaxFor) para o pellet continuar saindo à
 * frente de quem está correndo. O recuo é um empurrão curto de RECOIL_DIST·(m_pellet/m_peça) px, no canal de
 * impulso — e ele NÃO ramba, senão o W viraria propulsor e mexeria no balanço de movimento.
 * `sp` sobe de SPEED a SPEED_MAX conforme `ps.ejectRamp` (o mundo incrementa a cada cusparada e zera na pausa):
 * como o ejetado integra com arrasto puro, o alcance é v/DRAG, então a cusparada sai cada vez mais LONGE e forma
 * um rastro. Com o SPEED fixo de antes toda pelota parava a 292 px e o resultado era um monte amontoado.
 * Retorna quantos pellets. @param {World} w @param {PlayerState} ps
 */
const EJ=[0,0,0,0,0];   // ux,uy,er,mp,r0 — saída de ejectPiece (sem alocar no laço quente)
/**
 * O que a PEÇA sente ao cuspir: perde a massa da pelota e leva o recuo de RECOIL_DIST·(mp/m1) px para trás.
 * Está separado de `applyEject` porque é EXATAMENTE isto que o cliente prevê (predict.js) — sem criar pelota,
 * que é entidade do servidor e chega pelo snapshot. Uma cópia só da regra, para as duas não divergirem.
 * Sem esta predição o cliente errava 12,35 px por cusparada (constante para 60 ≤ r ≤ 400, porque `ejectR` é
 * proporcional) × 8,57/s = 106 px/s — até 74% da velocidade da própria peça —, e o servidor corrigia isso
 * 20×/s em puxões de ~5 px. Como a câmera segue as peças próprias, era a TELA INTEIRA que vibrava.
 * Preenche `out` com [ux,uy,er,mp,r0] (r0 = raio ANTES de encolher: é dele que saem `vmaxFor` e `ownerImmune`).
 * @param {Body} pc @returns {boolean} cuspiu de fato
 */
export function ejectPiece(pc,tx,ty,out=EJ){
  if(pc.dead||pc.r<EJECT.MIN_R)return false;
  const r0=pc.r,er=ejectR(r0),mp=er*er*EJECT.MASS_FACTOR,m1=pc.mass-mp;
  if(m1<PLAYER.MIN_PIECE_R*PLAYER.MIN_PIECE_R)return false;
  dirTo(pc.x,pc.y,tx,ty,DIR);const ux=DIR[0],uy=DIR[1];
  setMass(pc,m1);addBoost(pc,-ux,-uy,EJECT.RECOIL_DIST*mp/m1);
  out[0]=ux;out[1]=uy;out[2]=er;out[3]=mp;out[4]=r0;return true;}
export function applyEject(w,ps){
  const arr=ps.pieces,len=arr.length;let did=0;
  const k=ps.ejectRamp/EJECT.RAMP_N,sp=EJECT.SPEED+(EJECT.SPEED_MAX-EJECT.SPEED)*(k<1?k:1);   // força crescente do hold
  for(let i=0;i<len;i++){const pc=arr[i];if(!ejectPiece(pc,ps.tx,ps.ty,EJ))continue;
    const ux=EJ[0],uy=EJ[1],er=EJ[2],mp=EJ[3],r0=EJ[4],v=vmaxFor(r0)+sp,off=pc.r+LOCAL.EJECT_OFFSET;   // pc.r já é o raio novo (= √m1)
    const e=w.addEjected(pc.x+ux*off,pc.y+uy*off,ux*v,uy*v,er,mp,ps.slot,ownerImmune(r0),EJECT.LIFE_TICKS);
    did++;
    w.events.push({type:"EJECT",slot:ps.slot,pieceId:pc.id,ejectId:e.id,x:e.x,y:e.y});}
  return did;}
/**
 * Míssil teleguiado que está vindo para cima de `slot`: o mais próximo de (x,y), a menos de `dist`, mirando neste
 * slot (type 0) e **se aproximando** (produto escalar da separação com a velocidade negativo). null se não há.
 * Este predicado estava escrito três vezes igual — no cérebro do bot, na interceptação automática do applyFire e
 * no alerta que vai no `self`. Uma cópia só, para não divergirem.
 * Com `livres`, pula o entrante que JÁ tem um interceptador meu a caminho: sem isso dois disparos seguidos
 * travavam no mesmo alvo, o primeiro fazia CLASH e o segundo ficava órfão voando reto. O bot é quem mais sofria
 * — em modo intercept ele manda FIRE em todos os ticks e despejava a munição inteira no mesmo míssil.
 * Bot e alerta chamam SEM a flag: para eles a pergunta é "tem míssil vindo?", não "sobrou alvo?".
 * @param {World} w @returns {Body|null}
 */
export function incomingMissile(w,slot,x,y,dist,livres=false){
  const ms=w.missiles;let best=null,bd=dist*dist;
  for(let i=0;i<ms.length;i++){const m=ms[i];if(m.dead||sameTeam(w,m.owner,slot)||m.type!==0||m.targetId!==slot)continue;
    const dx=m.x-x,dy=m.y-y,d2=dx*dx+dy*dy;if(d2>=bd||dx*m.vx+dy*m.vy>=0)continue;
    if(livres&&coberto(w,slot,m.id))continue;
    bd=d2;best=m;}
  return best;}
/** Já mandei um interceptador atrás deste míssil? (no máximo MAX_AMMO meus vivos, então o laço é curto) */
function coberto(w,slot,id){const ms=w.missiles;
  for(let i=0;i<ms.length;i++){const m=ms[i];if(!m.dead&&m.owner===slot&&m.type===1&&m.targetId===id)return true;}
  return false;}
/**
 * Alvo do tiro mirado: a bolinha mais próxima do **PONTEIRO** (peso `aimScore` = distância do cursor à BORDA dela,
 * então a bola grande é mais fácil de agarrar), entre as que estão a até AIM_RANGE de quem atira e a menos de
 * AIM_PICK do cursor — peça de outro dono (kind 0, alvo = slot), míssil inimigo, asteroide ou estrela (kind 1,
 * alvo = id da entidade; mirar numa estrela já inchando adianta a supernova).
 * Cursor no vazio devolve [-1,0] e o míssil segue reto. Empate fica com a peça (varrida primeiro).
 * Antes era um CONE de ±AIM_CONE em volta da flecha escolhendo o mais próximo da PEÇA: o ângulo só abria o portão,
 * então varrer o mouse dentro do cone não trocava o alvo. Agora o alvo acompanha o cursor e troca sozinho assim que
 * ele passa por cima de outra bolinha — o cliente recalcula isso todo frame e o anel pula junto (ver lockOn).
 * @param {World} w
 */
function aimTarget(w,slot,src,tx,ty,out){
  const rr=MISSILE.AIM_RANGE*MISSILE.AIM_RANGE;let bs=MISSILE.AIM_PICK,id=-1,kind=0;
  const perto=b=>{const dx=b.x-src.x,dy=b.y-src.y;if(dx*dx+dy*dy>=rr)return false;   // fora do alcance da arma
    const sc=aimScore(b.x-tx,b.y-ty,b.r);if(sc>=bs)return false;bs=sc;return true;};
  const pcs=w.pieces;for(let i=0;i<pcs.length;i++){const p=pcs[i];if(!p.dead&&!sameTeam(w,p.owner,slot)&&perto(p)){id=p.owner;kind=0;}}
  const ms=w.missiles;for(let i=0;i<ms.length;i++){const m=ms[i];if(!m.dead&&!sameTeam(w,m.owner,slot)&&perto(m)){id=m.id;kind=1;}}
  const as=w.asteroids;for(let i=0;i<as.length;i++){const a=as[i];if(!a.dead&&perto(a)){id=a.id;kind=1;}}
  const sts=w.stars;for(let i=0;i<sts.length;i++){const st=sts[i];if(!st.dead&&perto(st)){id=st.id;kind=1;}}
  out[0]=id;out[1]=kind;}
const AIM=[-1,0];
/**
 * Fire: gasta 1 míssil e **um nível** do escudo da peça que atira. Sai da primeira peça viva, e só depois da
 * carência de spawn (`ps.fireCdUntil`, MISSILE.SPAWN_CD_TICKS): recém-nascido não metralha do spawn. Com `ps.fireAim`
 * (tiro mirado, o jogador segurou o botão) o míssil **persegue a bolinha mais próxima do ponteiro** (peça, míssil,
 * asteroide ou estrela) e só vai reto se não houver nada perto do cursor.
 * Sem mira o alvo é, em ordem: (1) míssil inimigo mirando este slot a < INTERCEPT_DIST, se aproximando e AINDA
 * SEM interceptador meu → interceptação (type 1); (2) se todos os entrantes já estão cobertos, o ATACANTE que
 * mandou um deles (type 0) — mais um interceptador no mesmo míssil seria desperdício, e quem atirou está por
 * perto; (3) senão o oponente vivo mais próximo; sem ninguém, direção aleatória. @param {World} w @param {PlayerState} ps
 */
/** Munição da arma na mão. `ps.ammo` é a fonte única — `missiles` no fio é só o espelho dela. */
export const ammoOf=ps=>ps.ammo[ps.weapon]|0;
export const addAmmo=(ps,n)=>{ps.ammo[ps.weapon]=Math.max(0,(ps.ammo[ps.weapon]|0)+n);};
/** Bitmask das armas com munição (o HUD acende os ícones do que dá para chavear). O míssil está sempre lá. */
export const ownedMask=ps=>{let m=1;for(let i=1;i<ps.ammo.length;i++)if(ps.ammo[i]>0)m|=1<<i;return m;};
/**
 * Troca de arma (INPUT_FLAG.SWAP): vai para a PRÓXIMA com munição, em círculo. O míssil entra na roda mesmo
 * zerado — é a arma base, e ficar preso numa arma vazia sem poder voltar para ela seria pior que não trocar.
 * @param {PlayerState} ps
 */
export function swapWeapon(w,ps){
  const n=ps.ammo.length;
  for(let i=1;i<=n;i++){const cand=(ps.weapon+i)%n;
    if(cand===WEAPON.MISSILE||ps.ammo[cand]>0){if(cand===ps.weapon)return false;
      ps.weapon=cand;w.events.push({type:"SWAP",slot:ps.slot,weapon:cand});return true;}}
  return false;}
export function applyFire(w,ps){
  if(ammoOf(ps)<=0||w.tick<ps.fireCdUntil)return false;const src=firstLive(ps.pieces);if(!src)return false;
  const wp=weaponOf(ps.weapon);addAmmo(ps,-1);
  if(wp.cd)ps.fireCdUntil=w.tick+wp.cd;   // a cadência da arma reusa o MESMO campo da carência de nascimento (e o mesmo `fireCd` do HUD)
  if(src.shieldLv>0)hitShield(w,src);     // um nível por PUXÃO de gatilho, não por projétil
  switch(ps.weapon){
    case WEAPON.BURST:return fireBurst(w,ps,src,wp);
    case WEAPON.NOVA:return fireNova(w,ps,src,wp);
    default:return fireHoming(w,ps,src);}}
/** Míssil e Cacho: o teleguiado de sempre. O `hue` do corpo carrega a arma (é livre no míssil) e vai no fio. */
function fireHoming(w,ps,src){
  if(ps.fireAim){dirTo(src.x,src.y,ps.tx,ps.ty,DIR);const ax=DIR[0],ay=DIR[1];aimTarget(w,ps.slot,src,ps.tx,ps.ty,AIM);
    const m=w.addMissile(src.x,src.y,ax*MISSILE.SPEED,ay*MISSILE.SPEED,ps.slot,AIM[0]);m.type=AIM[1];m.hue=ps.weapon;
    w.events.push({type:"FIRE",slot:ps.slot,missileId:m.id,x:m.x,y:m.y,targetSlot:AIM[1]?-1:AIM[0],targetMissile:AIM[1]?AIM[0]:-1,aimed:true,weapon:ps.weapon});return true;}
  const im=incomingMissile(w,ps.slot,src.x,src.y,MISSILE.INTERCEPT_DIST,true);
  let ux,uy,best=-1,kind=0,foe=-1;
  if(im){dirTo(src.x,src.y,im.x,im.y,DIR);ux=DIR[0];uy=DIR[1];best=im.id;kind=1;foe=im.owner;}
  else{
    const cob=incomingMissile(w,ps.slot,src.x,src.y,MISSILE.INTERCEPT_DIST);   // todos cobertos: vai no dono
    let bd=Infinity,bx=0,by=0;
    if(cob&&cob.owner>=0){const o=w.players.get(cob.owner),op=o&&o.alive?firstLive(o.pieces):null;
      if(op){best=cob.owner;bx=op.x;by=op.y;bd=0;}}
    if(best<0)for(const o of w.players.values()){if(o===ps||!o.alive||sameTeam(w,o.slot,ps.slot))continue;const op=firstLive(o.pieces);if(!op)continue;
      const dx=op.x-src.x,dy=op.y-src.y,d2=dx*dx+dy*dy;if(d2<bd){bd=d2;best=o.slot;bx=op.x;by=op.y;}}
    if(best>=0){dirTo(src.x,src.y,bx,by,DIR);ux=DIR[0];uy=DIR[1];}else{const an=w.rng.angle();ux=Math.cos(an);uy=Math.sin(an);}}
  const m=w.addMissile(src.x,src.y,ux*MISSILE.SPEED,uy*MISSILE.SPEED,ps.slot,best);m.type=kind;m.srcSlot=foe;m.hue=ps.weapon;
  w.events.push({type:"FIRE",slot:ps.slot,missileId:m.id,x:m.x,y:m.y,targetSlot:kind?-1:best,targetMissile:kind?best:-1,weapon:ps.weapon});return true;}
/**
 * RAJADA: `n` projéteis retos (sem alvo) em leque de ±spread/2 na direção do ponteiro, rápidos e de vida curta.
 * Não estilhaça (wp.shatter false) e arranha pouco (wp.shrink): é a arma de perto, o troco de quem não tem massa.
 */
function fireBurst(w,ps,src,wp){
  dirTo(src.x,src.y,ps.tx,ps.ty,DIR);const a0=Math.atan2(DIR[1],DIR[0]),off=src.r+MISSILE.R+2;
  for(let i=0;i<wp.n;i++){const an=a0+(i/(wp.n-1)-.5)*wp.spread,ux=Math.cos(an),uy=Math.sin(an);
    const m=w.addMissile(src.x+ux*off,src.y+uy*off,ux*wp.speed,uy*wp.speed,ps.slot,-1);
    m.type=1;m.hue=WEAPON.BURST;m.life=w.tick+wp.life;}
  w.events.push({type:"FIRE",slot:ps.slot,missileId:-1,x:src.x,y:src.y,targetSlot:-1,targetMissile:-1,weapon:WEAPON.BURST});
  return true;}
/**
 * NOVA PORTÁTIL: a onda da supernova, centrada em MIM e sem me atingir — empurra tudo em `blast` com
 * push·(1−d/blast) e estilhaça quem estiver no miolo (blast·core), exatamente como o miolo de uma estrela
 * que explode. Aliado não sente nada. É a carta de fuga do cercado.
 */
function fireNova(w,ps,src,wp){
  const R0=wp.blast,core=R0*wp.core,rng=w.rng,pcs=w.pieces;
  for(let i=0;i<pcs.length;i++){const q=pcs[i];if(q.dead||sameTeam(w,q.owner,ps.slot))continue;
    const dx=q.x-src.x,dy=q.y-src.y,d=Math.sqrt(dx*dx+dy*dy);if(d>=R0)continue;
    const ux=d>1e-6?dx/d:1,uy=d>1e-6?dy/d:0;addBoost(q,ux,uy,wp.push*(1-d/R0));
    if(d<core&&w.tick>=q.chipUntil&&q.r>=STAR.SHATTER_MIN_R){q.chipUntil=w.tick+STAR.SHATTER_CD_TICKS;
      shatterPiece(w,w.players.get(q.owner),q,ux,uy,rng.int(STAR.SHATTER_N[0],STAR.SHATTER_N[1]),STAR.SHATTER_DIST);
      // Quem estilhaçou quem. A supernova de ESTRELA já diz isso por STAR_BURST (via starShatter); a Nova
      // portátil não dizia nada por vítima, e sem isto a arma mais cara do jogo seria a única sem crédito
      // no kill feed. Só dispara para quem está no miolo de uma Nova disparada — não é caminho quente.
      w.events.push({type:"NOVA_HIT",slot:q.owner,bySlot:ps.slot,x:q.x,y:q.y,r:q.r});}}
  const asts=w.asteroids;
  for(let i=0;i<asts.length;i++){const a=asts[i];if(a.dead)continue;
    const dx=a.x-src.x,dy=a.y-src.y,d=Math.sqrt(dx*dx+dy*dy);if(d>=R0||d<1e-6)continue;
    const k=STAR.AST_KICK*(1-d/R0)*Math.min(1,ASTEROID.R_MIN/a.r);a.vx+=dx/d*k;a.vy+=dy/d*k;
    if(a.type>=0&&w.asteroids.length<w.astCap){w.queueAsteroid(a.type,ASTEROID.RESPAWN_TICKS);a.type=-1;}}
  w.events.push({type:"SUPERNOVA",x:src.x,y:src.y,r:R0,starId:0,rammed:false});   // o cliente já sabe desenhar esta onda
  w.events.push({type:"FIRE",slot:ps.slot,missileId:-1,x:src.x,y:src.y,targetSlot:-1,targetMissile:-1,weapon:WEAPON.NOVA});
  return true;}

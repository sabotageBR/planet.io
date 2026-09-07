// ── REGRAS DO JOGO: engolir/quicar (o maior sempre acaba comendo; o escudo só segura a PRIMEIRA batida), comida e powerups POR PEÇA
//    (ímã e escudo valem só para a parte que pegou o powerup; fundir junta os poderes — ver tryMergeOwn. Escudo por níveis:
//    não expira, sobe de nível sem ser atingido, perde 1 nível por tiro/míssil/batida forte de asteroide e 1 nível ao dividir),
//    estrelas (estilhaçam quem encosta — o escudo cai inteiro e segura —, apanham de míssil/partícula até rachar em várias,
//    explodem na hora se levarem um tiro já inchando e terminam em supernova que estilhaça quem está no miolo),
//    ejetados, asteroides (pop/lasca/alimentar/atirar),
//    buracos negros (puxar/horizonte/teleporte/ciclo), mísseis (homing em jogador ou em míssil inimigo, impacto em peça/escudo,
//    choque míssil×míssil varrido, desvio de asteroide), split/eject/fire (tiro mirado trava no alvo do cone) ──
// Todas recebem o mundo `w` (ids, rng, eventos, jogadores); toda aleatoriedade passa por w.rng.
// @ts-check
import {DT,WORLD,PLAYER,SPLIT,shieldTierFor,EJECT,ejectR,EJECT_MASS,FRAG,fragR,fragLife,mergeTicks,EAT,BOUNCE,FOOD_TYPE,isWeaponFood,ASTEROID,BLACKHOLE,MISSILE,aimScore,POWERUP,STAR,ZONE,WEAPON,WEAPONS,weaponOf,weaponOfFood,QUIT,BOT} from "../constants.js";
import {KIND,BH_PHASE,FOOD_FLAG,STAR_PHASE,FRAG_KIND} from "../protocol/constants.js";
import {clamp} from "../util.js";
import {setR,setMass,addMass,addBoost,boostLeft,capBoost,velX,velY,liveCount,firstLive} from "./body.js";
import {resolveBounce,separateOwn} from "./collide.js";
import {vmaxFor} from "./integrate.js";

/** Constantes locais — vêm do mockup/v1 e não existem em constants.js (ver relatório). */
export const LOCAL={POP_DIV:22,POP_MIN:2,POP_MAX:6,POP_DIST:780,             // pop: n=clamp(⌊r/22⌋,2,6), filhos arremessados POP_DIST px (o vírus do agar usa os mesmos 780 do split)
  CHIP_SPEED:360,CHIP_SPREAD:.6,CHIP_N:[1,2],                              // lascas: 1–2 fragmentos a 360 px/s ±.6 rad (raio/vida vêm de fragR/fragLife pela massa)
  FEED_KICK:.04,SHOOT_OFFSET:40,                                           // asteroide alimentado ganha 4% da v do pellet; filho nasce a r+40
  EJECT_OFFSET:6,                                                          // pellet nasce a r+6 (o leque do debris de míssil virou MISSILE.DEBRIS_SPREAD: é balanceamento, e balanceamento mora em constants.js)
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
 * Fora da zona a peça QUEIMA `zoneBurnRate(r)·exposição` da massa por segundo e, ao chegar no piso
 * MIN_PIECE_R, MORRE — sem piso, ao contrário da queimadura de estrela. É o único jeito de a partida acabar
 * sozinha.
 * ⚠️ `outOfZone` NÃO é mais o critério da queimadura: ele virou o teste barato ("alguma parte minha está no
 * gás?"), usado pelo aviso do HUD. Quem cobra é `zoneExposure`, a FATIA do disco que está fora — ver o
 * comentário dela para o porquê.
 * O evento é estrangulado a 1×/s por peça (o `(tick+id)%30` espalha as emissões entre as peças, em vez de
 * despejar 800 eventos no mesmo tick e estourar o teto de `wireEvents`); a morte sempre emite.
 * Devolve true se a peça morreu — o laço de integração pula o resto dela.
 * @param {World} w @param {Body} pc @param {{x:number,y:number,r:number}} zc
 */
export const outOfZone=(pc,zc)=>{const dx=pc.x-zc.x,dy=pc.y-zc.y,lim=zc.r-pc.r;return lim<=0||dx*dx+dy*dy>lim*lim;};
/**
 * Que FATIA do disco da peça está fora do círculo (0..1). É a pergunta que a queimadura faz desde que o
 * critério deixou de ser o centro — e ela não é firula: com o raio final da zona em 768 px e o teto de peça
 * em 1000, o gigante com o CENTRO dentro do círculo não queimava nada enquanto o corpo dele cobria a arena
 * inteira, ou seja, era invencível no exato momento em que o círculo devia decidir a partida. Medindo a
 * fatia, ele derrete até CABER — e quem já cabe não sente nada. De brinde, isso vira um teto de massa da
 * SALA que sai de graça da geometria: para todos caberem, Σr² ≤ R².
 * Três atalhos ANTES de qualquer `acos`, e é por isso que o custo por tick não muda: cabe inteira, está
 * inteira fora, ou o círculo é que está dentro da peça (o caso do gigante: 1 − R²/r²). Só quem está EM CIMA
 * da linha paga a conta da lente — dois `acos` e uma raiz.
 * Função pura de (dx,dy,r,R): servidor e predict.js chegam ao mesmo número sem protocolo novo.
 * @param {{x:number,y:number,r:number}} pc @param {{x:number,y:number,r:number}} zc
 */
export function zoneExposure(pc,zc){
  const dx=pc.x-zc.x,dy=pc.y-zc.y,d2=dx*dx+dy*dy,r=pc.r,R=zc.r;
  if(d2<=(R-r)*(R-r)&&R>=r)return 0;                      // cabe inteira dentro do círculo
  const sr=R+r;if(d2>=sr*sr)return 1;                     // inteira fora
  const d=Math.sqrt(d2);
  if(d+R<=r)return 1-(R*R)/(r*r);                         // o CÍRCULO está dentro da peça — o gigante da final
  const a1=Math.acos(Math.min(1,Math.max(-1,(d2+r*r-R*R)/(2*d*r))));
  const a2=Math.acos(Math.min(1,Math.max(-1,(d2+R*R-r*r)/(2*d*R))));
  const k=(-d+r+R)*(d+r-R)*(d-r+R)*(d+r+R);
  const lente=r*r*a1+R*R*a2-.5*Math.sqrt(k>0?k:0);        // área da interseção
  const e=1-lente/(Math.PI*r*r);
  return e<0?0:e>1?1:e;}
/**
 * Fração da massa por segundo que o gás cobra AGORA. Não é constante: vai de ZONE.BURN (no raio da etapa 0)
 * a ZONE.BURN·BURN_K (no menor círculo), interpolada pelo RAIO ATUAL. O raio é o que servidor e cliente já
 * têm em mãos — a etapa não vai pelo fio —, então os dois chegam ao mesmo número sem protocolo novo.
 */
export function zoneBurnRate(r){
  const r0=ZONE.R[0]*WORLD.w,rn=ZONE.R[ZONE.R.length-1]*WORLD.w,span=r0-rn;
  let k=span>0?(r0-r)/span:0;k=k<0?0:k>1?1:k;
  return ZONE.BURN*(1+(ZONE.BURN_K-1)*k);}
/** Massa depois de um tick fora: a MESMA conta no servidor e na predição do cliente (a paridade é testada). */
export const zoneMass=(m,dt,r=ZONE.R[0]*WORLD.w,exp=1)=>m*(1-zoneBurnRate(r)*exp*dt);
/**
 * Quanto vale o que se recolhe DENTRO do gás (1 fora do BR e dentro do círculo, `ZONE.GAS_GAIN` exposto).
 * O porquê está em `ZONE.GAS_GAIN`: acampar no gás recolhendo a própria queimadura era renda líquida.
 * ⚠️ Mede a exposição de QUEM COME, não de onde está o grão — ver o aviso na constante.
 * ⚠️ Não mexer em `zoneBurnRate`/`zoneMass`/`zoneExposure`: as três são espelhadas em `predict.js` e
 * qualquer mudança nelas quebra a paridade de 1e-9 e faz a peça pulsar na borda. Este fator é só do
 * servidor — o cliente não prevê absorção (`Predictor` reescreve `r`/`mass` do snapshot).
 */
export const gasGain=(pc,zc)=>{
  if(!zc)return 1;
  const e=zoneExposure(pc,zc);
  return e<=ZONE.EXPOSE_MIN?1:1-(1-ZONE.GAS_GAIN)*e;};
export function zoneBurn(w,pc,zc,dt){
  const exp=zoneExposure(pc,zc);if(exp<=ZONE.EXPOSE_MIN)return false;
  const m0=pc.mass,m=zoneMass(m0,dt,zc.r,exp),floor=PLAYER.MIN_PIECE_R*PLAYER.MIN_PIECE_R;
  // "para fora": a direção do centro da zona para a peça. É por onde as pelotas saem, e é o que faz
  // recuperá-las custar entrar mais fundo no gás em vez de ser lucro de graça na beirada.
  // ⚠️ Quando a peça ENGLOBA o círculo (o gigante do fim), o centro dela fica praticamente em cima do centro
  // da zona e essa direção some — os cacos nasciam no meio do próprio planeta e voltavam para dentro dele
  // assim que a imunidade acabava. Sem direção, sorteia-se uma: o que importa é sair, não para que lado.
  const dx=pc.x-zc.x,dy=pc.y-zc.y,dd=Math.sqrt(dx*dx+dy*dy);
  let ux,uy;if(dd>pc.r*.05){ux=dx/dd;uy=dy/dd;}else{const an=w.rng.angle();ux=Math.cos(an);uy=Math.sin(an);}
  if(m<=floor){   // chegou no piso: morre e larga TUDO o que ainda tinha, ali mesmo no gás
    const resto=pc.shed+m0;pc.shed=0;
    w.events.push({type:"ZONE_BURN",slot:pc.owner,pieceId:pc.id,x:pc.x,y:pc.y,r:pc.r,lost:m0,died:true});
    spillFrag(w,pc.x,pc.y,ux,uy,resto,ZONE.SHED_N_DEATH,(pc.r+ZONE.SHED_DIST)*EJECT.DRAG*1.6,6.2832,-1,0);
    w.killPiece(pc,"zone",-1);return true;}
  setMass(pc,m);
  // a massa arrancada se acumula e vira UMA pelota a cada SHED_TICKS: a conta continua contínua (é a que a
  // predição do cliente espelha), só a entrega é em pedaços — soltar a cada tick estouraria EJECT.MAX.
  pc.shed+=m0-m;
  if((w.tick+pc.id)%ZONE.SHED_TICKS===0&&pc.shed>=ZONE.SHED_MIN*EJECT_MASS){
    const lost=pc.shed;pc.shed=0;
    // A pelota tem que LIMPAR o planeta: SHED_SPEED fixo rende 70 px de alcance (v/DRAG), o que num r=856 é
    // dentro do próprio corpo — e aí o gigante reengolia o que o gás arrancava e parava de encolher, em
    // equilíbrio, exatamente onde a zona devia estar cobrando dele. Distância em pixels, como todo empurrão.
    spillFrag(w,pc.x+ux*pc.r,pc.y+uy*pc.r,ux,uy,lost,1,(pc.r+ZONE.SHED_DIST)*EJECT.DRAG,ZONE.SHED_SPREAD,pc.owner,ownerImmune(pc.r));
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
/**
 * Quanto tempo o dono fica sem poder recolher o que saiu dele. Fixo em 20 ticks (0,33 s) o planetão
 * alcançava a pelota e a re-engolia — medido, 63 de 86 voltavam e a massa mal caía. Agora soma o tempo que
 * ele leva para percorrer o próprio raio (r/vmax), então o que sai custa massa de verdade em qualquer tamanho.
 * ⚠️ Fica AQUI, e não lá embaixo junto do eject, porque quatro coisas o usam — cusparada, queimadura da
 * zona, lasca de asteroide e caco de míssil — e duas delas são declaradas antes.
 */
const ownerImmune=r=>EJECT.OWNER_IMMUNE_TICKS+Math.round(r/vmaxFor(r)/DT);
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

/**
 * O maior é um PREENCHIMENTO e o menor é uma pessoa que acabou de nascer?
 *
 * ⚠️ `BOT.SPAWN_GRACE_TICKS` já existia e cobria METADE do problema: em `bot.js` ela só faz o cérebro
 * não ESCOLHER o recém-chegado como presa. Ela nunca impediu a colisão — o novato que andasse para cima
 * de um bot grande era engolido do mesmo jeito, e o bot grande parado no caminho dele também. Medido em
 * produção: 1.428 primeiras vidas terminaram comidas por bot, com o algoz 6,1× mais pesado, aos 46 s.
 * ⚠️ Vale só para BOT × HUMANO, e nesse sentido. Entre pessoas a regra não muda: um jogador de verdade
 * comendo outro é o jogo, e proteger contra isso seria inventar invulnerabilidade num .io.
 * ⚠️ **A GRAÇA POR TEMPO ERA UM PENHASCO, e o dado mostrava o degrau.** Medido em 07/09/2026 nos
 * jogadores do Fit Test da Poki: a primeira vida tem um PICO de 6× exatamente na faixa 15-19 s — 118
 * mortes contra 19 na faixa anterior —, 88-93% delas comido. A proteção não ensinava nada, só adiava:
 * a 448 px/s um novato cruza 6.700 px nos 15 s e chega ao fim da graça no meio da multidão. Por isso
 * ela deixou de acabar só por TEMPO. Passada a janela, o que continua valendo é a RAZÃO DE MASSA —
 * `NOVATO_RATIO` (4×) enquanto a pessoa estiver abaixo de `NOVATO_MASS` (6000, r≈77).
 * ⚠️ **4× e não 2×**: `EAT.RATIO` (1,15 de raio) é 1,32 de massa, então entre 1,32× e 4× o bot CONTINUA
 * comendo — a briga apertada segue existindo, que é o jogo. O que a regra mata é o ATROPELAMENTO: na
 * mesma medição o algoz mediano tinha **8× a massa** da vítima e 45,8% deles passavam de 10×, contra
 * uma vítima de 1.560 de massa. Ali não há decisão que o jogador pudesse ter tomado.
 * ⚠️ A comparação é entre as PEÇAS que colidem, não entre os jogadores: é a colisão que está sendo
 * julgada, e um bot gigante partido em 16 pedaços tem cada peça no tamanho de briga honesta.
 * ⚠️ Protegido, o grande ATRAVESSA — sem quique. Dar quique aqui faria o novato ser chutado pelo mapa
 * por algo que ele nem pode enfrentar, e é o mesmo tratamento que `STAR.PASS_R` dá a quem cabe na estrela.
 * ⚠️ E não há espelho em `predict.js`: ele prevê as peças PRÓPRIAS e não decide quem come quem.
 * @param {World} w @param {any} big @param {any} small @param {any} [bodyBig] @param {any} [bodySmall]
 */
function recemChegado(w,big,small,bodyBig,bodySmall){
  if(!(big&&small&&big.isBot&&!small.isBot))return false;
  if(w.tick-small.spawnTick<BOT.SPAWN_GRACE_TICKS)return true;              // a graça de sempre, por TEMPO
  // ...e depois dela o ABISMO continua: enquanto a pessoa é pequena, o preenchimento MUITO maior atravessa.
  if(!(bodyBig&&bodySmall))return false;
  return bodySmall.mass<BOT.NOVATO_MASS&&bodyBig.mass>bodySmall.mass*BOT.NOVATO_RATIO;}

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
    if(recemChegado(w,psBig,psSmall,big,small))return;                                                       // preenchimento não come quem acabou de nascer: atravessa
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
export function eatFood(w,ps,pc,f,zc=null){
  w.killFood(f);const t=f.type,tick=w.tick;
  if(t===FOOD_TYPE.AMMO){const cap=weaponOf(ps.weapon).ammo;if(ammoOf(ps)<cap)addAmmo(ps,1);w.events.push({type:"AMMO",slot:ps.slot});}   // munição é da arma EQUIPADA (no míssil o teto é o MAX_AMMO de sempre)
  // ⚠️ `up` é o que separa a promoção 2→3 do 3→3, e sem ele o cliente não tinha COMO saber: o evento
  // chegava com `level:3` nos dois casos e o texto "ESCUDO 3" saía toda vez que se pisava num 🛡️ no teto.
  // Não dá para simplesmente não emitir o evento — é ele que toca o som e desenha o anel, e comer o escudo
  // no teto TEM efeito real (reinicia `shieldEvolveAt`): "comida consumida, evento emitido, som tocado e
  // efeito nenhum é o pior jeito de um powerup falhar" (o mesmo argumento do ímã, logo abaixo).
  else if(t===FOOD_TYPE.SHIELD){const antes=pc.shieldLv;if(pc.shieldLv<POWERUP.SHIELD_MAX_LEVEL)pc.shieldLv++;pc.shieldEvolveAt=tick+POWERUP.SHIELD_EVOLVE_TICKS;
    w.events.push({type:"POWERUP",slot:ps.slot,kind:"shield"});w.events.push({type:"SHIELD_UP",slot:ps.slot,level:pc.shieldLv,up:pc.shieldLv>antes,x:pc.x,y:pc.y,r:pc.r});}
  // Acima de MAGNET_MAX_R o ímã não vale — mas o grão não podia SUMIR sem dar nada: comida consumida,
  // evento emitido, som tocado e efeito nenhum é o pior jeito de um powerup falhar. Grande demais, vira comida.
  else if(t===FOOD_TYPE.MAGNET){
    if(pc.r<=POWERUP.MAGNET_MAX_R){pc.magnetUntil=(pc.magnetUntil>tick?pc.magnetUntil:tick)+POWERUP.TICKS;
      w.events.push({type:"POWERUP",slot:ps.slot,kind:"magnet"});}
    else{const k=(ps.feastUntil>tick?POWERUP.FEAST_K:1)*gasGain(pc,zc);addMass(pc,f.mass*EAT.FOOD_GAIN*k);ps.score+=Math.floor(f.r*EAT.SCORE_FOOD*k);}}
  else if(t===FOOD_TYPE.MERGE){const arr=ps.pieces;for(let i=0;i<arr.length;i++){const q=arr[i];if(!q.dead)q.mergeAt=tick;}   // vale para TODAS as peças: o poder é justamente juntar quem foi picado
    w.events.push({type:"POWERUP",slot:ps.slot,kind:"merge"});}
  // ── os quatro de JOGADOR (ver POWERUP em constants.js) ──
  // ⚠️ ANTES do ramo de arma, de propósito: `isWeaponFood` já protege a faixa, mas a ordem também importa
  // para quem ler o código depois — powerup é powerup, arma é arma, e o `else if` encadeado é a única
  // documentação executável dessa separação.
  else if(t===FOOD_TYPE.AUTODEF){if(ps.autoDefN<POWERUP.AUTODEF_MAX)ps.autoDefN++;   // CARGA, não tempo — e ACUMULA até AUTODEF_MAX: o ícone fica lá, eterno, até o dia em que salva sua vida
    w.events.push({type:"POWERUP",slot:ps.slot,kind:"autodef"});}
  // ⚠️ RARO: EMPRESTA uma bala ACIMA do teto da arma — e só uma. Era `addAmmo(ps,1)` cru, sem comparação
  // nenhuma: o único lugar do jogo que passava por cima do teto passava por cima dele SEMPRE, e a munição
  // acumulava sem fim (9 mísseis com MAX_AMMO 3). Com AMMO_OVER o empréstimo é de uma bala só: gastou,
  // o teto normal volta a valer e é preciso achar outro powerup para ter a quarta de novo.
  else if(t===FOOD_TYPE.AMMO_PLUS){const cap=weaponOf(ps.weapon).ammo+MISSILE.AMMO_OVER;if(ammoOf(ps)<cap)addAmmo(ps,1);
    w.events.push({type:"AMMO",slot:ps.slot});w.events.push({type:"POWERUP",slot:ps.slot,kind:"ammoPlus"});}
  else if(t===FOOD_TYPE.ZOOM){ps.zoomUntil=(ps.zoomUntil>tick?ps.zoomUntil:tick)+POWERUP.ZOOM_TICKS;
    w.events.push({type:"POWERUP",slot:ps.slot,kind:"zoom"});}
  else if(t===FOOD_TYPE.FEAST){ps.feastUntil=(ps.feastUntil>tick?ps.feastUntil:tick)+POWERUP.FEAST_TICKS;
    w.events.push({type:"POWERUP",slot:ps.slot,kind:"feast"});}
  // A arma do chão SEMPRE entra no cinto; equipar é outra coisa, e ela para no dia em que o jogador
  // escolheu (`weaponPin`, armado pelo Q em `swapWeapon`). Antes as duas moravam na mesma linha, então
  // pisar numa Rajada arrancava da mão a arma que a pessoa tinha acabado de escolher — no meio de uma
  // briga, e sem nada que ela pudesse fazer a respeito.
  // ⚠️ O `||ammoOf(ps)<=0` fecha o único estado ruim que a trava cria: travado numa arma VAZIA, pisando
  // numa cheia e continuando sem tiro. Aí a arma nova vem para a mão de novo.
  // ⚠️ Sem `weaponPin` o comportamento é o de sempre — o primeiro contato com armas continua equipando.
  else if(isWeaponFood(t)){const wi=weaponOfFood(t);
    if(wi>0){ps.ammo[wi]=WEAPONS[wi].ammo;
      if(!ps.weaponPin||ammoOf(ps)<=0)ps.weapon=wi;
      w.events.push({type:"POWERUP",slot:ps.slot,kind:"weapon",weapon:wi});}}
  // FEAST dobra só a COMIDA. Encostar em pieceEject (EAT.EJECT_GAIN=1) quebraria a conservação de massa,
  // que é estrutural aqui: o que sai de um planeta tem que voltar exatamente igual, ou cuspir vira lucro.
  // (A ÚNICA exceção é o gás — `gasGain` —, e ela é do BR, some fora dele e está documentada em ZONE.GAS_GAIN.)
  else{const k=(ps.feastUntil>tick?POWERUP.FEAST_K:1)*gasGain(pc,zc);addMass(pc,f.mass*EAT.FOOD_GAIN*k);ps.score+=Math.floor(f.r*EAT.SCORE_FOOD*k);}
  w.events.push({type:"FOOD_EATEN",slot:ps.slot,foodId:f.id,foodType:t,x:f.x,y:f.y});}

// ── ejetados ──
/**
 * Peça absorve fragmento (centro dentro; do próprio dono só após cdUntil): devolve a massa INTEIRA
 * (EAT.EJECT_GAIN = 1) — cuspir e recolher fecha em zero, e o pedaço de um planetão engorda mais do que
 * uma pelota comum. A pontuação sai de √mass, não de `e.r`: o raio visual satura em FRAG.R_MAX e daria
 * a mesma migalha de pontos por um caco que vale um planeta.
 * ⚠️ A conservação vale DENTRO do círculo. Exposto ao gás o ganho cai para `ZONE.GAS_GAIN` (ver `gasGain`):
 * acampar na beirada recolhendo a própria queimadura era o único jeito de a zona virar renda.
 * @param {World} w @param {Body} pc @param {Body} e @param {?{x:number,y:number,r:number}} zc
 */
export function pieceEject(w,pc,e,zc=null){
  if(e.owner===pc.owner&&w.tick<e.cdUntil)return;
  const dx=e.x-pc.x,dy=e.y-pc.y;if(dx*dx+dy*dy>=pc.r*pc.r)return;
  const ps=w.players.get(pc.owner),g=gasGain(pc,zc);
  addMass(pc,e.mass*EAT.EJECT_GAIN*g);ps.score+=Math.floor(Math.sqrt(e.mass)*EAT.SCORE_EJECT*g);e.dead=true;
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
  let travado=false;
  if(!blindada&&pc.r>a.r*ASTEROID.POP_RATIO){const lim=pc.r*ASTEROID.POP_DIST,mira=impactParam(pc,a)<lim;
    if(d2<lim*lim&&popAsteroid(w,ps,pc,a)){if(pc.shieldLv>0)breakShield(w,pc,-1);return;}   // rápida demais: leva o escudo junto
    if(mira&&liveCount(ps.pieces)<PLAYER.MAX_PIECES)return;   // vindo para o miolo E há vaga: deixa entrar (vai estourar); de raspão cai no quique
    travado=mira;}   // mirando o miolo SEM vaga: passar por cima da rocha deixou de ser de graça (ver ASTEROID.CHIP_STUCK)
  const s=pc.r+a.r;if(d2>=s*s||d2<=0)return;
  const vn=bouncePiece(pc,a,ASTEROID.E,true,false);
  if(pc.shieldLv>0){if(tier>0)for(let i=0;i<tier&&pc.shieldLv>0;i++)hitShield(w,pc,-1,nx,ny,WEAPON_ASTEROIDE);}
  else chipPiece(w,ps,pc,a,nx,ny,travado);
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
export function chipPiece(w,ps,pc,a,nx,ny,travado=false){
  const m0=pc.mass,k=travado?ASTEROID.CHIP_STUCK:ASTEROID.CHIP;
  let r=pc.r*Math.sqrt(1-k);if(r<PLAYER.MIN_PIECE_R)r=PLAYER.MIN_PIECE_R;setR(pc,r);
  const lost=m0-pc.mass,rng=w.rng,n=travado?LOCAL.CHIP_N[1]+1:rng.int(LOCAL.CHIP_N[0],LOCAL.CHIP_N[1]);
  // Sem vaga a massa vai para o lado OPOSTO (+n, atravessando a rocha) e LONGE, com a imunidade que escala
  // com o raio: a lasca comum sai para trás, que é justo o lado para onde o quique já empurra a peça — o
  // dono a recolhia sem sair do lugar. Com vaga nada muda.
  if(travado)spillFrag(w,pc.x+nx*pc.r,pc.y+ny*pc.r,nx,ny,lost,n,(pc.r+ASTEROID.CHIP_STUCK_DIST)*EJECT.DRAG,LOCAL.CHIP_SPREAD,ps.slot,ownerImmune(pc.r));
  else spillFrag(w,pc.x-nx*pc.r,pc.y-ny*pc.r,-nx,-ny,lost,n,LOCAL.CHIP_SPEED,LOCAL.CHIP_SPREAD,ps.slot,EJECT.OWNER_IMMUNE_TICKS);
  w.events.push({type:"CHIP",slot:ps.slot,pieceId:pc.id,x:pc.x+nx*pc.r,y:pc.y+ny*pc.r,r:pc.r*.4,nx,ny});
  if(travado)w.events.push({type:"STUCK",slot:ps.slot,pieceId:pc.id,x:pc.x,y:pc.y,r:pc.r,lost,cause:STUCK_ASTEROID});}

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
 * Abaixo de `STAR.PASS_R` nada disso acontece: a peça ATRAVESSA e se esconde lá dentro (ver `starPass`).
 * O escudo não salva: ele só defende de míssil e asteroide.
 * A estrela morre no contato, mas a supernova sai com `rammed` — quem trombou não leva o berçário junto.
 * @param {World} w @param {Body} pc @param {Body} st
 */
export function pieceStar(w,pc,st){
  if(st.k<STAR.ARM_K)return;
  // ⚠️ O ESCONDERIJO. Tem que sair ANTES do `addBoost` (senão o passante é cuspido e nunca chega a entrar)
  // e antes do `if(w.peace)`, senão ele leva o empurrão no aquecimento do BR. E os TRÊS efeitos saem
  // juntos: pular só o `starShatter` deixaria a linha do `supernova` lá embaixo matando a estrela — o
  // abrigo se desfaria no primeiro uso, que é o defeito que esta guarda existe para não ter.
  if(starPass(pc))return;
  const dx=pc.x-st.x,dy=pc.y-st.y,d2=dx*dx+dy*dy,lim=pc.r+st.r;if(d2>=lim*lim)return;
  const d=Math.sqrt(d2),ux=d>1e-6?dx/d:1,uy=d>1e-6?dy/d:0,tick=w.tick;
  addBoost(pc,ux,uy,STAR.PUSH_TOUCH_DIST);
  if(w.peace)return;   // aquecimento: a estrela empurra, mas não queima nem explode — a partida ainda não começou
  if(tick>=pc.chipUntil&&pc.r>=STAR.SHATTER_MIN_R){pc.chipUntil=tick+STAR.SHATTER_CD_TICKS;
    starShatter(w,w.players.get(pc.owner),pc,st,ux,uy);}   // o escudo NÃO salva da estrela: ele só defende de míssil e asteroide
  supernova(w,st,true,pc.owner);}   // encostou nela: a estrela explode e morre (a sala repõe uma) — sem prêmio para quem trombou
/**
 * Estilhaça a peça em n+1 pedaços (limitado por MAX_PIECES e por MIN_PIECE_R): o pai encolhe para r/√(n+1)
 * — massa conservada, como no pop do asteroide — e os filhos saem em leque em volta de (ux,uy) a `dist` px,
 * todos com o cooldown de fusão renovado. Usada pela estrela E pelo míssil (o tiro parte o alvo).
 * @param {World} w @param {PlayerState} ps @param {Body} pc
 */
/**
 * A peça é pequena o bastante para ATRAVESSAR a estrela? Ver o porquê do número em `STAR.PASS_R`.
 * Mora aqui, ao lado de `shatterBlock`, porque é a casa das guardas nomeadas — e porque `supernova`
 * também precisa dela para não estilhaçar quem estava escondido dentro do miolo.
 */
export const starPass=pc=>pc.r<STAR.PASS_R;
export const SHATTER_OK=0,SHATTER_NO_ROOM=1,SHATTER_TOO_SMALL=2;
/** De onde veio o preço que não coube em peças (vai no `cause` do evento STUCK e vira ícone no kill feed). */
export const STUCK_STAR=0,STUCK_MISSILE=1,STUCK_ASTEROID=2;
/**
 * Por que a peça NÃO pode estilhaçar agora: 0 = pode · 1 = sem vaga (as PLAYER.MAX_PIECES ocupadas) ·
 * 2 = massa abaixo de duas peças mínimas.
 * ⚠️ Existe porque quem chama precisa saber ANTES de cobrar o preço, e porque os dois motivos NÃO valem a
 * mesma coisa: **sem vaga é escolha do jogador** (foi ele que se picou em 16 para atravessar o cinturão, e
 * por isso vira PREÇO), enquanto **massa mínima é o piso do jogo** (e cobrar duas vezes de quem já está no
 * chão não é preço, é chute). Antes os dois saíam como o MESMO `false` mudo de `shatterPiece`, e era isso
 * que fazia atravessar estrela e asteroide com 16 pedaços custar quase nada, sem nada na tela dizendo nada.
 * @param {PlayerState} ps @param {Body} pc
 */
export const shatterBlock=(ps,pc)=>PLAYER.MAX_PIECES-liveCount(ps.pieces)<1?SHATTER_NO_ROOM:
  pc.mass<2*PLAYER.MIN_PIECE_R*PLAYER.MIN_PIECE_R?SHATTER_TOO_SMALL:SHATTER_OK;
export function shatterPiece(w,ps,pc,ux,uy,nWanted,dist){
  if(shatterBlock(ps,pc))return false;   // uma fonte só para as duas guardas (ver shatterBlock)
  const tick=w.tick,rng=w.rng,room=PLAYER.MAX_PIECES-liveCount(ps.pieces);
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
  // Sem vaga de peça o estilhaço não acontece — e era assim que atravessar estrela em 16 pedaços saía pela
  // metade do preço. A estrela então cobra na moeda DELA: queima BURN_STUCK em vez de BURN.
  const travado=shatterBlock(ps,pc)===SHATTER_NO_ROOM;
  const m0=pc.mass,r0=pc.r,floor=PLAYER.MIN_PIECE_R*PLAYER.MIN_PIECE_R;
  const keep=m0*(1-(travado?STAR.BURN_STUCK:STAR.BURN));
  setMass(pc,keep>floor?keep:floor);const burn=m0-pc.mass;   // medido ANTES do estilhaço, que reparte o que sobrou
  if(!travado){const n=w.rng.int(STAR.SHATTER_N[0],STAR.SHATTER_N[1]);shatterPiece(w,ps,pc,ux,uy,n,STAR.SHATTER_DIST);}
  w.events.push({type:"STAR_BURST",slot:ps.slot,starId:st.id,x:pc.x,y:pc.y,r:r0,burn});
  if(travado)w.events.push({type:"STUCK",slot:ps.slot,pieceId:pc.id,x:pc.x,y:pc.y,r:r0,lost:burn,cause:STUCK_STAR});
  return true;}
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
 * `bySlot` = quem trombou; ele viaja no evento porque a explosão sem prêmio também tem NOME diferente na
 * tela ("nebulosa planetária", que é o que uma estrela que morre sem supernova de verdade vira), e o
 * cliente não teria como distinguir os dois casos olhando só a onda.
 * @param {World} w @param {Body} st @param {boolean} [rammed] @param {number} [bySlot]
 */
export function supernova(w,st,rammed=false,bySlot=-1){
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
    // ⚠️ AQUI O PASSANTE **NÃO** É POUPADO, e é de propósito: é o contra-jogo do esconderijo. Quem se
    // escondeu na estrela continua sendo empurrado quando ela morre e, acima de SHATTER_MIN_R, estilhaça
    // junto — ou seja, o grande pode expulsá-lo pagando o preço de detonar a estrela (BURN, ou 3 mísseis).
    // Um abrigo que ninguém consegue arrombar não é abrigo, é invulnerabilidade.
    if(d2>=l2||tick<pc.chipUntil||pc.r<STAR.SHATTER_MIN_R)continue;   // fora do miolo (ou no cooldown de contato) é só o empurrão
    pc.chipUntil=tick+STAR.SHATTER_CD_TICKS;
    starShatter(w,w.players.get(pc.owner),pc,st,ux,uy);}   // o escudo não salva da supernova (só míssil e asteroide)
  // berçário: a estrela morta vira um cacho de comida que fica. Ele REALOCA em vez de somar — para cada pelota do
  // cacho some uma de longe, escolhida pelo rng da sala. Sem isso a população subia para sempre (o laço de reposição
  // do mundo só ENCHE até FOOD.COUNT, nunca corta), e em 15 min já eram 6072 comidas no lugar de 5000.
  const longe=blast*STAR.NOVA_FOOD_R*3,longe2=longe*longe,pool=w.food;
  if(premio)for(let i=0;i<STAR.NOVA_FOOD;i++){
    for(let k=0;k<8;k++){const f=pool[rng.int(0,pool.length-1)];if(!f||f.dead)continue;
      const fx=f.x-st.x,fy=f.y-st.y;if(fx*fx+fy*fy<longe2)continue;w.killFood(f);break;}
    w.spawnFood({x:st.x,y:st.y,spread:blast*STAR.NOVA_FOOD_R});}
  // A cratera vira ponto de nascimento (World._novaSpot). Só com `premio`: sem cacho e sem fragmento não há
  // nada ali para o novato achar, e a trombada ainda deixa por perto quem acabou de atropelar a estrela.
  if(premio){w.novas.push({x:st.x,y:st.y,at:w.tick});if(w.novas.length>STAR.NOVA_SPOT_KEEP)w.novas.shift();}
  w.events.push({type:"SUPERNOVA",starId:st.id,x:st.x,y:st.y,r:blast,rammed,bySlot});
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
/**
 * Quit voluntário: cada peça viva estoura como a supernova de uma estrela, e a massa dela INTEIRA vira
 * QUIT.N pelotas sem dono (FRAG_KIND.NOVA, mesmo espalhar em círculo cheio de zoneBurn) — livre para quem
 * estiver por perto, em vez de simplesmente evaporar com o `removePlayer` de sempre.
 * ⚠️ NÃO empurra `w.events`: chamado por `Sim.remove` FORA do passo de física (reação a um `{t:'quit'}`,
 * não a um tick), e `world.step()` zera `events` no PRÓPRIO início — um evento empurrado aqui seria
 * descartado antes de qualquer `_consume()` o ler (o mesmo motivo de `Sim.kill` não passar por lá). Por
 * isso devolve o estouro de cada peça para o chamador avisar o fio direto por `Sim._ev`/`wireEvents`.
 * @param {World} w @param {Body[]} pieces @returns {{x:number,y:number,r:number}[]}
 */
export function explodeQuit(w,pieces){
  const bursts=[];
  for(const pc of pieces){if(pc.dead)continue;
    spillFrag(w,pc.x,pc.y,1,0,pc.mass,QUIT.N,QUIT.SPEED,6.2832,-1,0,FRAG_KIND.NOVA);
    bursts.push({x:pc.x,y:pc.y,r:Math.min(pc.r*QUIT.NOVA_R,QUIT.NOVA_R_MAX)});}
  return bursts;}

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
 * colheita gorda no chão em vez de evaporar 39% dele. O míssil morre nos dois casos.
 * ⚠️ Os cacos saem do lado OPOSTO ao míssil, da BORDA da peça, e longe (ver MISSILE.DEBRIS_* em constants):
 * antes nasciam no CENTRO, em todas as direções e com 146 px de alcance — dentro do próprio planeta —, e o
 * dono os reengolia em 0,33 s. O dano do míssil era, literalmente, um empréstimo.
 * ⚠️ E quando o alvo NÃO TEM VAGA para ser partido (as 16 peças ocupadas), o encolhimento é STUCK_SHRINK em
 * vez de HIT_SHRINK: partir o alvo é metade do dano desta arma, e quem não pode ser partido paga em massa.
 * @param {World} w @param {Body} pc @param {Body} m
 */
export function pieceMissile(w,pc,m){
  if(sameTeam(w,m.owner,pc.owner))return;const dx=m.x-pc.x,dy=m.y-pc.y,d2=dx*dx+dy*dy,s=pc.r+m.r;if(d2>=s*s)return;
  const d=Math.sqrt(d2)||1;
  if(pc.shieldLv>0){m.dead=true;hitShield(w,pc,m.owner,dx/d,dy/d,armaDoMissil(m));return;}
  const ux=-dx/d,uy=-dy/d,ps=w.players.get(pc.owner),wp=weaponOf(m.hue);   // (ux,uy) = para LONGE do míssil: a MESMA direção do estilhaço, e é para lá que a massa resvala
  // ⚠️ O bloqueio é medido ANTES do setR: a peça encolhida poderia atravessar o limiar de massa e mudar o
  // MOTIVO do bloqueio no meio da conta — e os dois motivos cobram coisas diferentes (ver shatterBlock).
  const bloq=wp.shatter?shatterBlock(ps,pc):SHATTER_OK,travado=bloq===SHATTER_NO_ROOM;
  const shrink=wp.shrink!=null?wp.shrink:(travado?MISSILE.STUCK_SHRINK:MISSILE.HIT_SHRINK);
  const m0=pc.mass;let r=pc.r*shrink;if(r<PLAYER.MIN_PIECE_R)r=PLAYER.MIN_PIECE_R;setR(pc,r);
  spillFrag(w,pc.x+ux*pc.r,pc.y+uy*pc.r,ux,uy,m0-pc.mass,MISSILE.HIT_DEBRIS,
    (pc.r+MISSILE.DEBRIS_DIST)*EJECT.DRAG,MISSILE.DEBRIS_SPREAD,pc.owner,ownerImmune(pc.r));
  m.dead=true;w.events.push({type:"BOOM",x:m.x,y:m.y,r:pc.r,slot:pc.owner,bySlot:m.owner,weapon:armaDoMissil(m)});
  if(!wp.shatter)return;   // a Rajada arranha e empurra; PARTIR o alvo é privilégio do míssil e do cacho
  if(!bloq){const n=w.rng.int(MISSILE.SHATTER_N[0],MISSILE.SHATTER_N[1]);
    shatterPiece(w,ps,pc,ux,uy,n,MISSILE.SHATTER_DIST);return;}   // o tiro PARTE o alvo, não só arranca massa: é a arma anti-gigante
  // Não coube: o preço que ia ser cobrado em PEÇAS já foi cobrado em massa (STUCK_SHRINK, acima). Falta o
  // retorno na tela — sem ele o jogador só veria a massa sumir, que é como isto falhava até hoje.
  if(travado)w.events.push({type:"STUCK",slot:pc.owner,pieceId:pc.id,x:pc.x,y:pc.y,r:pc.r,lost:m0-pc.mass,cause:STUCK_MISSILE});}
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
/** Escudo DESTA peça cai por completo. Sobrou UM chamador: a rocha rápida demais (ASTEROID.SHIELD_VN), que atravessa como se não houvesse escudo — dividir e atirar cobram UM nível, por `hitShield`. @param {World} w @param {Body} pc */
export function breakShield(w,pc,bySlot=-1,weapon=-1){pc.shieldLv=0;w.events.push({type:"SHIELD_BREAK",slot:pc.owner,x:pc.x,y:pc.y,r:pc.r,bySlot,weapon});}
/**
 * O escudo DESTA peça perde UM nível e o timer de evolução dela reinicia: míssil inimigo, batida forte de asteroide,
 * tiro do próprio dono ou SALTO (os dois últimos com bySlot −1). Emite SHIELD_HIT enquanto sobra nível, SHIELD_BREAK
 * quando zera. @param {World} w @param {Body} pc
 */
export function hitShield(w,pc,bySlot=-1,nx=0,ny=0,weapon=-1){
  pc.shieldLv--;pc.shieldEvolveAt=w.tick+POWERUP.SHIELD_EVOLVE_TICKS;
  if(pc.shieldLv>0)w.events.push({type:"SHIELD_HIT",slot:pc.owner,level:pc.shieldLv,x:pc.x,y:pc.y,r:pc.r,nx,ny,bySlot,weapon});
  else w.events.push({type:"SHIELD_BREAK",slot:pc.owner,x:pc.x,y:pc.y,r:pc.r,bySlot,weapon});}

// ── ações do jogador ──
/**
 * Split: cada peça r ≥ SPLIT.MIN_R vira duas de massa/2 (r/√2, como no agar); o filho recebe um BOOST de
 * SPLIT.DIST px na direção do ponteiro, sem recuo no pai. A distância é ABSOLUTA e o boost sempre freia,
 * então o vão final é o mesmo do planeta inteiro à peça já dividida três vezes. O filho nasce **sem powerup** e a peça que dividiu paga UM
 * nível de escudo (o ímã ela mantém) — derrubar o escudo INTEIRO fazia do split um botão que o blindado nunca apertava, e o salto
 * é o único fechador em campo aberto. O preço continua sendo por APERTO, e a metade arremessada sai descoberta. Retorna quantas dividiu.
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
    if(pc.shieldLv>0)hitShield(w,pc,-1,ux,uy);}   // o salto custa UM nível, não o escudo inteiro: o rombo sai na direção do arremesso
  return did;}
/**
 * Auto-split do agar.io: peça acima de PLAYER.MAX_R se reparte sozinha em n=⌊mass/MAX_R²⌋ filhos (em leque, cada um
 * com boost de SPLIT.DIST) em vez de parar de crescer. Sem vaga de peça o raio é cortado em MAX_R e o excesso
 * é CUSPIDO em fragmentos (PLAYER.OVER_N/OVER_DIST) — antes ele evaporava, e era o único ponto do jogo fora
 * do DECAY em que massa de jogador se perdia. Retorna quantas peças se repartiram.
 * @param {World} w @param {PlayerState} ps
 */
export function autoSplit(w,ps){
  const arr=ps.pieces,len=arr.length,tick=w.tick,rng=w.rng,cap=PLAYER.MAX_R,cap2=cap*cap;let count=liveCount(arr),did=0;
  for(let i=0;i<len;i++){const pc=arr[i];if(pc.dead||pc.r<=cap)continue;
    // Sem vaga o raio é cortado — mas o excesso CUSPIDO, não apagado. `setR(pc,cap)` sozinho era o único
    // lugar do jogo, fora do DECAY, em que massa de jogador evaporava (e em silêncio, sem evento nenhum).
    const room=PLAYER.MAX_PIECES-count;
    if(room<1){const m0=pc.mass;setR(pc,cap);const an=rng.angle(),ux=Math.cos(an),uy=Math.sin(an);
      spillFrag(w,pc.x+ux*pc.r,pc.y+uy*pc.r,ux,uy,m0-pc.mass,PLAYER.OVER_N,(pc.r+PLAYER.OVER_DIST)*EJECT.DRAG,6.2832,ps.slot,ownerImmune(pc.r));
      continue;}
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
 * O alvo travado ainda vale? Vale se continua VIVO e dentro de AIM_RANGE de quem atira — as duas condições
 * que `aimTarget` já exige de qualquer alvo. Devolve o corpo (ou o líder da vítima) ou null.
 * @param {World} w @param {PlayerState} ps @param {Body} src
 */
function aimLockAlive(w,ps,src){
  const id=ps.aimLockId;if(id<0)return null;
  let b=null;
  if(ps.aimLockKind===0){const o=w.players.get(id);if(!o||!o.alive||sameTeam(w,id,ps.slot))return null;b=firstLive(o.pieces);}
  else{for(const m of w.missiles)if(m.id===id&&!m.dead){b=m;break;}
    if(!b)for(const a of w.asteroids)if(a.id===id&&!a.dead){b=a;break;}
    if(!b)for(const q of w.stars)if(q.id===id&&!q.dead){b=q;break;}}
  if(!b)return null;
  const dx=b.x-src.x,dy=b.y-src.y;
  return dx*dx+dy*dy<MISSILE.AIM_RANGE*MISSILE.AIM_RANGE?b:null;}
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
      // ⚠️ O PIN É ARMADO AQUI, no ramo que troca DE VERDADE — nunca no `swapReq` nem no topo da função.
      // O Q apertado com uma arma só no cinto é um no-op (cai no `return false` acima), e depois dele o
      // jogador ainda tem que ver a primeira arma que pisar vir para a mão: "pegar e não ver nada
      // acontecer é pior que não pegar". Armar na INTENÇÃO trocaria o primeiro contato com armas por
      // silêncio — e é o que o teste "chavear: Q anda pelas armas" pega.
      ps.weaponPin=true;
      ps.weapon=cand;w.events.push({type:"SWAP",slot:ps.slot,weapon:cand});return true;}}
  return false;}
export function applyFire(w,ps){
  if(ammoOf(ps)<=0||w.tick<ps.fireCdUntil)return false;const src=firstLive(ps.pieces);if(!src)return false;
  const wp=weaponOf(ps.weapon);
  // ── O tiro DEFENSIVO não cobra o escudo ──
  // O custo era cobrado aqui em cima, antes do `switch`, ou seja antes de o jogo saber que tipo de tiro
  // ia sair — e a decisão "isto é um interceptador" só nasce lá embaixo, em fireHoming. Resultado:
  // exatamente na situação em que o tiro existe para me salvar, ele derrubava a outra coisa que me
  // salvaria, e quem estava sob mira pagava duas vezes pelo mesmo míssil.
  // ⚠️ O predicado tem que ser EXATAMENTE o que faz o tiro virar interceptador, senão vira brecha: com o
  // `livres` de fora, um entrante JÁ COBERTO manteria o desconto e o tiro sairia no ATACANTE (ramo 2 de
  // fireHoming, ou seja ofensivo) de graça — bastava um míssil qualquer por perto para nunca mais pagar.
  // Por isso: sem mira (o tiro mirado escolhe pelo cursor e pode ser ofensivo), arma teleguiada, e um
  // entrante AINDA SEM interceptador meu. Calculado UMA vez e passado adiante — `incomingMissile` com
  // `livres` é O(M²) por causa do `coberto`, e recalcular seria pagar duas vezes E deixar os dois
  // divergirem no dia em que alguém mexer num só.
  const homing=ps.weapon===WEAPON.MISSILE||ps.weapon===WEAPON.CLUSTER;
  const im=!ps.fireAim&&homing?incomingMissile(w,ps.slot,src.x,src.y,MISSILE.INTERCEPT_DIST,true):null;
  addAmmo(ps,-1);
  if(wp.cd)ps.fireCdUntil=w.tick+wp.cd;   // a cadência da arma reusa o MESMO campo da carência de nascimento (e o mesmo `fireCd` do HUD)
  if(src.shieldLv>0&&!im)hitShield(w,src);     // um nível por PUXÃO de gatilho, não por projétil — e nenhum quando o gatilho é defesa
  switch(ps.weapon){
    case WEAPON.BURST:return fireBurst(w,ps,src,wp);
    case WEAPON.NOVA:return fireNova(w,ps,src,wp);
    default:return fireHoming(w,ps,src,im);}}
/**
 * POWERUP DE AUTO-DEFESA: com um teleguiado entrante ainda descoberto, puxa o gatilho por você.
 *
 * Não é um sistema de tiro novo — é o MESMO `applyFire`, e é isso que o torna barato e correto: cadência
 * da arma, munição, carência de nascimento, escolha de alvo, evento e crédito no feed já são o que são.
 * Gasta munição de propósito (é o tiro do jogador, adiantado; um tiro extra de graça seria outra arma) e
 * respeita `ps.autoFireAt`, uma cadência PRÓPRIA, porque o míssil tem `cd` 0 em WEAPONS — sem ela o cinto
 * se esvaziaria em três ticks.
 *
 * ⚠️ A ordem das guardas é a economia da função. `incomingMissile` com `livres` é O(M²) por causa do
 * `coberto`, e varrer isso para 50 jogadores a 60 Hz seria o maior custo fixo do tick por causa de um
 * powerup que quase ninguém tem em mãos. Então: o gate do powerup vem antes de tudo o que é caro, e a
 * varredura ainda é escalonada por slot (AUTODEF_SCAN_TICKS), no molde de outros trabalhos periódicos do
 * mundo. 100 ms de latência não se percebe num míssil que voa a 720 px/s.
 * @param {World} w @param {PlayerState} ps @returns {boolean} atirou
 */
export function autoDefend(w,ps){
  const tick=w.tick;
  if(ps.autoDefN<=0||!w.missiles.length)return false;
  if(tick<ps.autoFireAt||tick<ps.fireCdUntil||ammoOf(ps)<=0)return false;
  if(ps.weapon!==WEAPON.MISSILE)return false;   // só a arma base intercepta bem: o Cacho abriria 4 filhos em cima de UM entrante, gastando a munição mais cara do jogo numa defesa
  if((tick+ps.slot)%POWERUP.AUTODEF_SCAN_TICKS)return false;
  const src=firstLive(ps.pieces);if(!src)return false;
  if(!incomingMissile(w,ps.slot,src.x,src.y,MISSILE.INTERCEPT_DIST,true))return false;
  ps.fireAim=false;   // sem mira: é o applyFire que escolhe a interceptação (e o `fireAim` do tick ainda pode estar ligado)
  if(!applyFire(w,ps))return false;
  ps.autoFireAt=tick+POWERUP.AUTODEF_CD_TICKS;ps.autoDefN--;return true;}   // usou, perdeu: a carga só é gasta quando o tiro SAIU
/** Míssil e Cacho: o teleguiado de sempre. O `hue` do corpo carrega a arma (é livre no míssil) e vai no fio. */
function fireHoming(w,ps,src,im=undefined){
  if(ps.fireAim){dirTo(src.x,src.y,ps.tx,ps.ty,DIR);const ax=DIR[0],ay=DIR[1];aimTarget(w,ps.slot,src,ps.tx,ps.ty,AIM);
    // a trava SOBREVIVE ao soltar o botão (MISSILE.AIM_HOLD_TICKS): mirar custa movimento, e refazer a mira
    // inteira para mandar o segundo míssil no mesmo alvo era pagar duas vezes pelo mesmo trabalho
    if(AIM[0]>=0){ps.aimLockId=AIM[0];ps.aimLockKind=AIM[1];ps.aimLockUntil=w.tick+MISSILE.AIM_HOLD_TICKS;}
    const m=w.addMissile(src.x,src.y,ax*MISSILE.SPEED,ay*MISSILE.SPEED,ps.slot,AIM[0]);m.type=AIM[1];m.hue=ps.weapon;
    w.events.push({type:"FIRE",slot:ps.slot,missileId:m.id,x:m.x,y:m.y,targetSlot:AIM[1]?-1:AIM[0],targetMissile:AIM[1]?AIM[0]:-1,aimed:true,weapon:ps.weapon});return true;}
  // Tiro comum COM a trava viva: sai no mesmo alvo, sem precisar segurar o botão de novo. Perde para a
  // interceptação de um teleguiado entrante (`im`), que é defesa e vem antes de qualquer escolha ofensiva.
  if(im===undefined)im=incomingMissile(w,ps.slot,src.x,src.y,MISSILE.INTERCEPT_DIST,true);   // só quando alguém chama fora do applyFire
  if(!im&&w.tick<ps.aimLockUntil){const alvo=aimLockAlive(w,ps,src);
    if(alvo){dirTo(src.x,src.y,alvo.x,alvo.y,DIR);
      const m=w.addMissile(src.x,src.y,DIR[0]*MISSILE.SPEED,DIR[1]*MISSILE.SPEED,ps.slot,ps.aimLockId);m.type=ps.aimLockKind;m.hue=ps.weapon;
      w.events.push({type:"FIRE",slot:ps.slot,missileId:m.id,x:m.x,y:m.y,targetSlot:ps.aimLockKind?-1:ps.aimLockId,targetMissile:ps.aimLockKind?ps.aimLockId:-1,aimed:true,weapon:ps.weapon});return true;}
    ps.aimLockUntil=0;}   // o alvo morreu ou fugiu do alcance: a trava morre com ele
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

// ── REGRAS DO JOGO: engolir/quicar (o maior sempre acaba comendo; o escudo só segura a PRIMEIRA batida), comida e powerups (escudo por níveis:
//    não expira, sobe de nível sem ser atingido, cai ao disparar/dividir), ejetados, asteroides (pop/lasca/alimentar/atirar),
//    buracos negros (puxar/horizonte/teleporte/ciclo), mísseis (homing em jogador ou em míssil inimigo, impacto em peça/escudo,
//    choque míssil×míssil varrido, desvio de asteroide), split/eject/fire ──
// Todas recebem o mundo `w` (ids, rng, eventos, jogadores); toda aleatoriedade passa por w.rng.
// @ts-check
import {DT,PLAYER,SPLIT,EJECT,mergeTicks,EAT,BOUNCE,FOOD_TYPE,ASTEROID,BLACKHOLE,MISSILE,POWERUP} from "../constants.js";
import {KIND,BH_PHASE,FOOD_FLAG} from "../protocol/constants.js";
import {clamp} from "../util.js";
import {setR,setMass,addMass,liveCount,firstLive} from "./body.js";
import {resolveBounce} from "./collide.js";

/** Constantes locais — vêm do mockup/v1 e não existem em constants.js (ver relatório). */
export const LOCAL={POP_DIV:22,POP_MIN:2,POP_MAX:6,POP_SPEED:.8,             // pop: n=clamp(⌊r/22⌋,2,6), filhos a SPLIT.SPEED·.8
  CHIP_SPEED:360,CHIP_R:.8,CHIP_LIFE_TICKS:600,CHIP_SPREAD:.6,CHIP_N:[1,2], // lascas: 1–2 debris r=EJECT.R·.8 a 360 px/s ±.6 rad
  FEED_KICK:.04,SHOOT_OFFSET:40,                                           // asteroide alimentado ganha 4% da v do pellet; filho nasce a r+40
  EJECT_OFFSET:6,DEBRIS_LIFE_TICKS:700,                                    // pellet nasce a r+6; debris de míssil dura 700 ticks
  EXIT_JITTER:30,HOLE_MARGIN:300,HOLE_MIN_RI:10,                            // saída ±30 px; buraco fica a ≥300 px da borda; influência <10 px = inerte
  FOOD_OVERLAP:.5,FEED_OVERLAP:.6};                                         // come comida a d<r+fr·.5; asteroide absorve pellet a d<r+er·.6

/** @typedef {import("./body.js").Body} Body */
/** @typedef {import("./world.js").World} World */
/** @typedef {import("./world.js").PlayerState} PlayerState */

// ── util ──
function bounceEvent(w,A,B,vn){const dx=B.x-A.x,dy=B.y-A.y,d=Math.sqrt(dx*dx+dy*dy)||1,nx=dx/d,ny=dy/d;
  w.events.push({type:"BOUNCE",x:A.x+nx*A.r,y:A.y+ny*A.r,r:A.r<B.r?A.r:B.r,nx,ny,vn});}
function dirTo(fx,fy,tx,ty,out){let dx=tx-fx,dy=ty-fy;const l=Math.sqrt(dx*dx+dy*dy);if(l<1e-6){out[0]=1;out[1]=0;}else{out[0]=dx/l;out[1]=dy/l;}}
const DIR=[0,0];

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
    if(psSmall.shieldLv>0){
      if(d2<sum*sum){breakShield(w,psSmall,small,big.owner);const vn=resolveBounce(A,B,BOUNCE.E_SHIELD,BOUNCE.POS_CORR);if(vn>BOUNCE.FX_MIN_VN)bounceEvent(w,A,B,vn);}
      return;}
    const lim=big.r-small.r*EAT.CENTER;if(lim>0&&d2<lim*lim)eatPiece(w,psBig,big,psSmall,small);
    return;}
  if(d2<sum*sum){const vn=resolveBounce(A,B,BOUNCE.E,BOUNCE.POS_CORR);if(vn>BOUNCE.FX_MIN_VN)bounceEvent(w,A,B,vn);}}
/** A (de killer) engole B (de victim): ma += mb·GAIN (teto MAX_R), pontos, EAT e talvez PLAYER_DEAD. */
export function eatPiece(w,killer,A,victim,B){
  addMass(A,B.mass*EAT.GAIN,PLAYER.MAX_R);killer.score+=Math.floor(B.r*EAT.SCORE_PLAYER);
  w.events.push({type:"EAT",killerSlot:killer.slot,victimSlot:victim.slot,pieceId:B.id,x:B.x,y:B.y,r:B.r,lastPiece:liveCount(victim.pieces)===1});
  w.killPiece(B,"eaten",killer.slot);}

// ── comida ──
/**
 * Come uma comida: munição, escudo (+1 nível até SHIELD_MAX_LEVEL, reinicia o timer; nunca expira; cada nível
 * aguenta um míssil e a primeira batida de um maior derruba tudo),
 * ímã (POWERUP.TICKS, acumula se já ativo) ou massa. @param {World} w @param {PlayerState} ps @param {Body} pc @param {Body} f
 */
export function eatFood(w,ps,pc,f){
  f.dead=true;w.foodDirty=true;const t=f.type,tick=w.tick;
  if(t===FOOD_TYPE.AMMO){if(ps.missiles<MISSILE.MAX_AMMO)ps.missiles++;w.events.push({type:"AMMO",slot:ps.slot});}
  else if(t===FOOD_TYPE.SHIELD){if(ps.shieldLv<POWERUP.SHIELD_MAX_LEVEL)ps.shieldLv++;ps.shieldEvolveAt=tick+POWERUP.SHIELD_EVOLVE_TICKS;
    w.events.push({type:"POWERUP",slot:ps.slot,kind:"shield"});w.events.push({type:"SHIELD_UP",slot:ps.slot,level:ps.shieldLv,x:pc.x,y:pc.y,r:pc.r});}
  else if(t===FOOD_TYPE.MAGNET){ps.magnetUntil=(ps.magnetUntil>tick?ps.magnetUntil:tick)+POWERUP.TICKS;
    w.events.push({type:"POWERUP",slot:ps.slot,kind:"magnet"});}
  else{addMass(pc,f.mass*EAT.FOOD_GAIN,PLAYER.MAX_R);ps.score+=Math.floor(f.r*EAT.SCORE_FOOD);}
  w.events.push({type:"FOOD_EATEN",slot:ps.slot,foodId:f.id,foodType:t,x:f.x,y:f.y});}

// ── ejetados ──
/** Peça absorve pellet (centro dentro; do próprio dono só após cdUntil). @param {World} w @param {Body} pc @param {Body} e */
export function pieceEject(w,pc,e){
  if(e.owner===pc.owner&&w.tick<e.cdUntil)return;
  const dx=e.x-pc.x,dy=e.y-pc.y;if(dx*dx+dy*dy>=pc.r*pc.r)return;
  const ps=w.players.get(pc.owner);addMass(pc,e.mass*EAT.EJECT_GAIN,PLAYER.MAX_R);ps.score+=Math.floor(e.r*EAT.SCORE_EJECT);e.dead=true;
  w.events.push({type:"EJECT_EATEN",slot:ps.slot,ejectId:e.id,x:e.x,y:e.y});}
/** Pellet alimenta asteroide (+FEED de raio, teto MASS_R_MAX, acumula direção); acima de SHOOT_AT dispara um filho. @param {World} w @param {Body} e @param {Body} a */
export function ejectAsteroid(w,e,a){
  if(w.tick<e.cdUntil)return;const dx=a.x-e.x,dy=a.y-e.y,lim=a.r+e.r*LOCAL.FEED_OVERLAP;if(dx*dx+dy*dy>=lim*lim)return;
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
 * Peça ≥ POP_RATIO× o asteroide: **pop** quando d < r·POP_DIST (mecânica do vírus; sem quique enquanto
 * se aproxima). Senão: quique e=ASTEROID.E + lasca (cooldown CHIP_CD_TICKS por peça).
 * @param {World} w @param {Body} pc @param {Body} a
 */
export function pieceAsteroid(w,pc,a){
  const dx=a.x-pc.x,dy=a.y-pc.y,d2=dx*dx+dy*dy,ps=w.players.get(pc.owner);
  if(pc.r>a.r*ASTEROID.POP_RATIO){const lim=pc.r*ASTEROID.POP_DIST;if(d2<lim*lim&&popAsteroid(w,ps,pc,a))return;
    if(liveCount(ps.pieces)<PLAYER.MAX_PIECES)return;}                     // grande ainda sem pop: atravessa; só quica quando não pode estourar
  const s=pc.r+a.r;if(d2>=s*s||d2<=0)return;
  const vn=resolveBounce(pc,a,ASTEROID.E,BOUNCE.POS_CORR);if(vn<=0)return;
  if(w.tick>=pc.chipUntil){pc.chipUntil=w.tick+ASTEROID.CHIP_CD_TICKS;const d=Math.sqrt(d2);chipPiece(w,ps,pc,a,dx/d,dy/d);}
  if(vn>BOUNCE.FX_MIN_VN)bounceEvent(w,pc,a,vn);}
/** Estoura a peça em n=clamp(⌊r/POP_DIV⌋,POP_MIN,POP_MAX) filhos (limitado por MAX_PIECES); asteroide morre e respawna depois. */
export function popAsteroid(w,ps,pc,a){
  let n=Math.floor(pc.r/LOCAL.POP_DIV);if(n<LOCAL.POP_MIN)n=LOCAL.POP_MIN;if(n>LOCAL.POP_MAX)n=LOCAL.POP_MAX;
  const room=PLAYER.MAX_PIECES-liveCount(ps.pieces);if(n>room)n=room;if(n<1)return false;
  const nr=pc.r/Math.sqrt(n+1),tick=w.tick,rng=w.rng;setR(pc,nr);pc.mergeAt=tick+mergeTicks(nr);
  for(let i=0;i<n;i++){const an=rng.angle(),q=w.newPiece(ps.slot,pc.x,pc.y,nr);
    q.vx=Math.cos(an)*SPLIT.SPEED*LOCAL.POP_SPEED;q.vy=Math.sin(an)*SPLIT.SPEED*LOCAL.POP_SPEED;q.mergeAt=pc.mergeAt;}
  w.events.push({type:"POP",slot:ps.slot,asteroidId:a.id,x:a.x,y:a.y,r:a.r});
  a.dead=true;w.queueAsteroid(a.type,ASTEROID.RESPAWN_TICKS);return true;}
/** Lasca: peça perde CHIP da massa em 1–2 debris comíveis lançados para trás (normal n aponta da peça ao asteroide). */
export function chipPiece(w,ps,pc,a,nx,ny){
  let r=pc.r*Math.sqrt(1-ASTEROID.CHIP);if(r<PLAYER.MIN_PIECE_R)r=PLAYER.MIN_PIECE_R;setR(pc,r);
  const rng=w.rng,n=rng.int(LOCAL.CHIP_N[0],LOCAL.CHIP_N[1]),base=Math.atan2(-ny,-nx),er=EJECT.R*LOCAL.CHIP_R;
  for(let i=0;i<n;i++){const an=base+rng.range(-LOCAL.CHIP_SPREAD,LOCAL.CHIP_SPREAD);
    w.addEjected(pc.x-nx*pc.r,pc.y-ny*pc.r,Math.cos(an)*LOCAL.CHIP_SPEED,Math.sin(an)*LOCAL.CHIP_SPEED,er,er*er,ps.slot,EJECT.OWNER_IMMUNE_TICKS,LOCAL.CHIP_LIFE_TICKS);}
  w.events.push({type:"CHIP",slot:ps.slot,pieceId:pc.id,x:pc.x+nx*pc.r,y:pc.y+ny*pc.r,r:pc.r*.4,nx,ny});}

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
/** Aceleração gravitacional a = min(G/max(d,rc)², A_MAX)·k·mult aplicada a `o` (Δv=a·dt). Retorna d (ou Infinity fora da influência). */
export function pullBody(h,o,mult,rc,ri){
  const dx=h.x-o.x,dy=h.y-o.y,d2=dx*dx+dy*dy;if(d2>ri*ri||d2<1e-6)return Infinity;
  const d=Math.sqrt(d2),dd=d>rc?d:rc;let a=BLACKHOLE.G/(dd*dd);if(a>BLACKHOLE.A_MAX)a=BLACKHOLE.A_MAX;a*=h.k*mult*DT;
  o.vx+=dx/d*a;o.vy+=dy/d*a;return d;}
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
    case KIND.EJECT:{if(pullBody(h,A,BLACKHOLE.EJECT_PULL,rc,ri)<rc)A.dead=true;break;}
    case KIND.MISSILE:pullBody(h,A,BLACKHOLE.MISSILE_PULL,rc,ri);break;
    case KIND.ASTEROID:{if(A.type<0&&pullBody(h,A,BLACKHOLE.AST_PULL,rc,ri)<rc){A.dead=true;w.queueAsteroid(-1,0);}break;}}}
/** Horizonte: perde LOSS da massa e é teleportada para a saída pareada a EXIT_SPEED em direção aleatória; r<MIN_PIECE_R → destruída. */
export function suckPiece(w,ps,pc,h){
  const fromX=pc.x,fromY=pc.y,ev=w.events;setMass(pc,pc.mass*(1-BLACKHOLE.LOSS));
  if(pc.r<PLAYER.MIN_PIECE_R){ev.push({type:"BH_SUCK",slot:ps.slot,pieceId:pc.id,fromX,fromY,toX:fromX,toY:fromY,destroyed:true});
    w.killPiece(pc,"blackhole",-1);return;}
  const rng=w.rng,j=LOCAL.EXIT_JITTER;
  pc.x=clamp(h.ex+rng.range(-j,j),pc.r,w.w-pc.r);pc.y=clamp(h.ey+rng.range(-j,j),pc.r,w.h-pc.r);
  const an=rng.angle();pc.vx=Math.cos(an)*BLACKHOLE.EXIT_SPEED;pc.vy=Math.sin(an)*BLACKHOLE.EXIT_SPEED;pc.cdUntil=w.tick+BLACKHOLE.CD_TICKS;
  ev.push({type:"BH_SUCK",slot:ps.slot,pieceId:pc.id,fromX,fromY,toX:pc.x,toY:pc.y,destroyed:false});
  ev.push({type:"EXIT",slot:ps.slot,pieceId:pc.id,x:pc.x,y:pc.y,r:pc.r});}

// ── mísseis ──
/**
 * Homing: v → lerp(v, dir(alvo)·SPEED, TURN) por tick. type 0: alvo é o slot targetId (primeira peça viva);
 * type 1: alvo é o míssil de id targetId (interceptação) — se ele sumiu, segue reto (type 0, sem alvo). @param {World} w @param {Body} m
 */
export function homeMissile(w,m){
  if(m.targetId<0)return;let tx,ty;
  if(m.type===1){const t=w.entityById.get(m.targetId);if(!t||t.dead||t.kind!==KIND.MISSILE){m.type=0;m.targetId=-1;return;}tx=t.x;ty=t.y;}
  else{const t=w.players.get(m.targetId),tp=t&&t.alive?firstLive(t.pieces):null;if(!tp)return;tx=tp.x;ty=tp.y;}
  const dx=tx-m.x,dy=ty-m.y,l=Math.sqrt(dx*dx+dy*dy)||1,k=MISSILE.TURN;
  m.vx+=(dx/l*MISSILE.SPEED-m.vx)*k;m.vy+=(dy/l*MISSILE.SPEED-m.vy)*k;}
/**
 * Impacto em peça de outro dono: com escudo, o míssil explode no escudo e tira 1 nível (SHIELD_HIT, ou SHIELD_BREAK ao
 * chegar a 0; o timer de evolução reinicia; massa intacta). Sem escudo: peça encolhe para r·HIT_SHRINK (mín. MIN_PIECE_R)
 * e solta HIT_DEBRIS debris (BOOM). O míssil morre nos dois casos. @param {World} w @param {Body} pc @param {Body} m
 */
export function pieceMissile(w,pc,m){
  if(m.owner===pc.owner)return;const dx=m.x-pc.x,dy=m.y-pc.y,s=pc.r+m.r;if(dx*dx+dy*dy>=s*s)return;
  const ps=w.players.get(pc.owner);
  if(ps.shieldLv>0){m.dead=true;ps.shieldLv--;ps.shieldEvolveAt=w.tick+POWERUP.SHIELD_EVOLVE_TICKS;const d=Math.sqrt(dx*dx+dy*dy)||1;
    if(ps.shieldLv>0)w.events.push({type:"SHIELD_HIT",slot:ps.slot,level:ps.shieldLv,x:pc.x,y:pc.y,r:pc.r,nx:dx/d,ny:dy/d,bySlot:m.owner});
    else w.events.push({type:"SHIELD_BREAK",slot:ps.slot,x:pc.x,y:pc.y,r:pc.r,bySlot:m.owner});return;}
  let r=pc.r*MISSILE.HIT_SHRINK;if(r<PLAYER.MIN_PIECE_R)r=PLAYER.MIN_PIECE_R;setR(pc,r);
  const rng=w.rng,er=EJECT.R;
  for(let i=0;i<MISSILE.HIT_DEBRIS;i++){const an=rng.angle();
    w.addEjected(pc.x,pc.y,Math.cos(an)*MISSILE.DEBRIS_SPEED,Math.sin(an)*MISSILE.DEBRIS_SPEED,er,er*er,pc.owner,EJECT.OWNER_IMMUNE_TICKS,LOCAL.DEBRIS_LIFE_TICKS);}
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
/** Escudo cai por completo: o dono atacou (disparou/dividiu, bySlot −1) ou levou a batida de quem pode engoli-lo. @param {World} w @param {PlayerState} ps @param {Body} pc */
export function breakShield(w,ps,pc,bySlot=-1){ps.shieldLv=0;w.events.push({type:"SHIELD_BREAK",slot:ps.slot,x:pc.x,y:pc.y,r:pc.r,bySlot});}

// ── ações do jogador ──
/** Split: cada peça r ≥ SPLIT.MIN_R vira duas de massa/2; filho a v_pai + dir·SPEED, pai recua RECOIL. Retorna quantas dividiu. @param {World} w @param {PlayerState} ps */
export function applySplit(w,ps){
  const arr=ps.pieces,len=arr.length,tick=w.tick;let count=liveCount(arr),did=0;
  for(let i=0;i<len;i++){const pc=arr[i];if(pc.dead)continue;if(count>=PLAYER.MAX_PIECES)break;if(pc.r<SPLIT.MIN_R)continue;
    dirTo(pc.x,pc.y,ps.tx,ps.ty,DIR);const ux=DIR[0],uy=DIR[1],nr=pc.r/Math.SQRT2;
    setR(pc,nr);pc.mergeAt=tick+mergeTicks(nr);pc.vx-=ux*SPLIT.SPEED*SPLIT.RECOIL;pc.vy-=uy*SPLIT.SPEED*SPLIT.RECOIL;
    const q=w.newPiece(ps.slot,pc.x+ux*nr*SPLIT.OFFSET,pc.y+uy*nr*SPLIT.OFFSET,nr);
    q.vx=pc.vx+ux*SPLIT.SPEED;q.vy=pc.vy+uy*SPLIT.SPEED;q.mergeAt=pc.mergeAt;count++;did++;
    w.events.push({type:"SPLIT",slot:ps.slot,pieceId:pc.id,childId:q.id,x:pc.x,y:pc.y,r:nr});}
  if(did&&ps.shieldLv>0)breakShield(w,ps,firstLive(arr));
  return did;}
/**
 * Eject: pellet r=EJECT.R com massa R²·MASS_FACTOR a v_peça + dir·SPEED; recuo exato −dir·SPEED·(m_pellet/m_peça)
 * (momento peça+pellet conservado). Retorna quantos pellets. @param {World} w @param {PlayerState} ps
 */
export function applyEject(w,ps){
  const arr=ps.pieces,len=arr.length,mp=EJECT.R*EJECT.R*EJECT.MASS_FACTOR,minM=PLAYER.MIN_PIECE_R*PLAYER.MIN_PIECE_R;let did=0;
  for(let i=0;i<len;i++){const pc=arr[i];if(pc.dead||pc.r<EJECT.MIN_R)continue;const m1=pc.mass-mp;if(m1<minM)continue;
    dirTo(pc.x,pc.y,ps.tx,ps.ty,DIR);const ux=DIR[0],uy=DIR[1],r1=Math.sqrt(m1);
    const e=w.addEjected(pc.x+ux*(r1+LOCAL.EJECT_OFFSET),pc.y+uy*(r1+LOCAL.EJECT_OFFSET),pc.vx+ux*EJECT.SPEED,pc.vy+uy*EJECT.SPEED,
      EJECT.R,mp,ps.slot,EJECT.OWNER_IMMUNE_TICKS,EJECT.LIFE_TICKS);
    setMass(pc,m1);pc.vx-=ux*EJECT.SPEED*mp/m1;pc.vy-=uy*EJECT.SPEED*mp/m1;did++;
    w.events.push({type:"EJECT",slot:ps.slot,pieceId:pc.id,ejectId:e.id,x:e.x,y:e.y});}
  return did;}
/**
 * Fire: gasta 1 míssil (e derruba o escudo). Sai da primeira peça viva. Alvo, em ordem: míssil inimigo mirando este slot
 * a < INTERCEPT_DIST e se aproximando (o mais próximo; ordem do array desempata) → interceptação (type 1);
 * senão o oponente vivo mais próximo (homing, type 0); sem alvo, direção aleatória. @param {World} w @param {PlayerState} ps
 */
export function applyFire(w,ps){
  if(ps.missiles<=0)return false;const src=firstLive(ps.pieces);if(!src)return false;ps.missiles--;
  if(ps.shieldLv>0)breakShield(w,ps,src);
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

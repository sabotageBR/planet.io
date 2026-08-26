// ── REGRAS DO JOGO: engolir/quicar, comida e powerups, ejetados, asteroides (pop/lasca/alimentar/atirar),
//    buracos negros (puxar/horizonte/teleporte/ciclo), mísseis (homing/impacto), split/eject/fire ──
// Todas recebem o mundo `w` (ids, rng, eventos, jogadores); toda aleatoriedade passa por w.rng.
// @ts-check
import {DT,PLAYER,SPLIT,EJECT,mergeTicks,EAT,BOUNCE,FOOD_TYPE,ASTEROID,BLACKHOLE,MISSILE,POWERUP} from "../constants.js";
import {KIND,BH_PHASE} from "../protocol/constants.js";
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
/** Engolir (ra ≥ rb·RATIO, centro de B a d < ra − rb·CENTER, B sem escudo) ou quique mass-weighted. @param {World} w @param {Body} A @param {Body} B */
export function piecePair(w,A,B){
  const psA=w.players.get(A.owner),psB=w.players.get(B.owner),tick=w.tick;
  const dx=B.x-A.x,dy=B.y-A.y,d2=dx*dx+dy*dy,ra=A.r,rb=B.r;
  if(ra>=rb*EAT.RATIO){const lim=ra-rb*EAT.CENTER;if(lim>0&&d2<lim*lim&&!(psB.shieldUntil>tick))eatPiece(w,psA,A,psB,B);}
  else if(rb>=ra*EAT.RATIO){const lim=rb-ra*EAT.CENTER;if(lim>0&&d2<lim*lim&&!(psA.shieldUntil>tick))eatPiece(w,psB,B,psA,A);}
  else if(d2<(ra+rb)*(ra+rb)&&d2>0){const e=(psA.shieldUntil>tick||psB.shieldUntil>tick)?BOUNCE.E_SHIELD:BOUNCE.E;
    const vn=resolveBounce(A,B,e,BOUNCE.POS_CORR);if(vn>BOUNCE.FX_MIN_VN)bounceEvent(w,A,B,vn);}}
/** A (de killer) engole B (de victim): ma += mb·GAIN (teto MAX_R), pontos, EAT e talvez PLAYER_DEAD. */
export function eatPiece(w,killer,A,victim,B){
  addMass(A,B.mass*EAT.GAIN,PLAYER.MAX_R);killer.score+=Math.floor(B.r*EAT.SCORE_PLAYER);
  w.events.push({type:"EAT",killerSlot:killer.slot,victimSlot:victim.slot,pieceId:B.id,x:B.x,y:B.y,r:B.r,lastPiece:liveCount(victim.pieces)===1});
  w.killPiece(B,"eaten",killer.slot);}

// ── comida ──
/** Come uma comida: munição, powerup (até POWERUP.MAX ativos; renova se já ativo) ou massa. @param {World} w @param {PlayerState} ps @param {Body} pc @param {Body} f */
export function eatFood(w,ps,pc,f){
  f.dead=true;w.foodDirty=true;const t=f.type,tick=w.tick;
  if(t===FOOD_TYPE.AMMO){if(ps.missiles<MISSILE.MAX_AMMO)ps.missiles++;w.events.push({type:"AMMO",slot:ps.slot});}
  else if(t>=FOOD_TYPE.SPEED){
    const active=(ps.speedUntil>tick?1:0)+(ps.magnetUntil>tick?1:0)+(ps.shieldUntil>tick?1:0);
    const cur=t===FOOD_TYPE.SPEED?ps.speedUntil:t===FOOD_TYPE.MAGNET?ps.magnetUntil:ps.shieldUntil;
    if(active<POWERUP.MAX||cur>tick){const until=(cur>tick?cur:tick)+POWERUP.TICKS;
      if(t===FOOD_TYPE.SPEED)ps.speedUntil=until;else if(t===FOOD_TYPE.MAGNET)ps.magnetUntil=until;else ps.shieldUntil=until;
      w.events.push({type:"POWERUP",slot:ps.slot,kind:t===FOOD_TYPE.SPEED?"speed":t===FOOD_TYPE.MAGNET?"magnet":"shield"});}}
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
  f.x+=dx/d*a;f.y+=dy/d*a;return d<rc;}
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
/** Homing: v → lerp(v, dir(alvo)·SPEED, TURN) por tick, mirando a primeira peça viva do slot alvo. @param {World} w @param {Body} m */
export function homeMissile(w,m){
  if(m.targetId<0)return;const t=w.players.get(m.targetId),tp=t&&t.alive?firstLive(t.pieces):null;if(!tp)return;
  const dx=tp.x-m.x,dy=tp.y-m.y,l=Math.sqrt(dx*dx+dy*dy)||1,k=MISSILE.TURN;
  m.vx+=(dx/l*MISSILE.SPEED-m.vx)*k;m.vy+=(dy/l*MISSILE.SPEED-m.vy)*k;}
/** Impacto: peça encolhe para r·HIT_SHRINK (mín. MIN_PIECE_R) e solta HIT_DEBRIS debris; míssil morre. @param {World} w @param {Body} pc @param {Body} m */
export function pieceMissile(w,pc,m){
  if(m.owner===pc.owner)return;const dx=m.x-pc.x,dy=m.y-pc.y,s=pc.r+m.r;if(dx*dx+dy*dy>=s*s)return;
  let r=pc.r*MISSILE.HIT_SHRINK;if(r<PLAYER.MIN_PIECE_R)r=PLAYER.MIN_PIECE_R;setR(pc,r);
  const rng=w.rng,er=EJECT.R;
  for(let i=0;i<MISSILE.HIT_DEBRIS;i++){const an=rng.angle();
    w.addEjected(pc.x,pc.y,Math.cos(an)*MISSILE.DEBRIS_SPEED,Math.sin(an)*MISSILE.DEBRIS_SPEED,er,er*er,pc.owner,EJECT.OWNER_IMMUNE_TICKS,LOCAL.DEBRIS_LIFE_TICKS);}
  m.dead=true;w.events.push({type:"BOOM",x:m.x,y:m.y,r:pc.r,slot:pc.owner,bySlot:m.owner});}

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
/** Fire: gasta 1 míssil; sai da primeira peça viva rumo ao oponente vivo mais próximo (homing nele); sem alvo, direção aleatória. @param {World} w @param {PlayerState} ps */
export function applyFire(w,ps){
  if(ps.missiles<=0)return false;const src=firstLive(ps.pieces);if(!src)return false;ps.missiles--;
  let best=-1,bd=Infinity,bx=0,by=0;
  for(const o of w.players.values()){if(o===ps||!o.alive)continue;const op=firstLive(o.pieces);if(!op)continue;
    const dx=op.x-src.x,dy=op.y-src.y,d2=dx*dx+dy*dy;if(d2<bd){bd=d2;best=o.slot;bx=op.x;by=op.y;}}
  let ux,uy;if(best>=0){dirTo(src.x,src.y,bx,by,DIR);ux=DIR[0];uy=DIR[1];}else{const an=w.rng.angle();ux=Math.cos(an);uy=Math.sin(an);}
  const m=w.addMissile(src.x,src.y,ux*MISSILE.SPEED,uy*MISSILE.SPEED,ps.slot,best);
  w.events.push({type:"FIRE",slot:ps.slot,missileId:m.id,x:m.x,y:m.y,targetSlot:best});return true;}

// ── MUNDO: simulação determinística a 60 Hz (servidor autoritativo; ?bench e testes) ──
// Ordem fixa do passo: inputs → integração → grades → pares do mesmo dono → pares de donos
// diferentes → perigos (asteroides, buracos) → comida/ejetados → mísseis → fusões →
// compactação ordenada → spawns → tick++. Remoção só por `dead` + compactação (ordem estável).
// @ts-check
import {WORLD,DT,PLAYER,SPEED,SPLIT,EJECT,BOUNCE,WALL,FOOD,FOOD_TYPE,ASTEROID,BLACKHOLE,MISSILE,POWERUP} from "../constants.js";
import {KIND,PIECE_FLAG,BH_PHASE} from "../protocol/constants.js";
import {createRng} from "../rng.js";
import {clamp} from "../util.js";
import {createBody,liveCount} from "./body.js";
import {createGrid,GRID_CELL} from "./spatial-hash.js";
import {integratePiece,integrateFree} from "./integrate.js";
import {resolveBounce,separateOwn,tryMergeOwn,pullToCentroid} from "./collide.js";
import * as R from "./rules.js";

/** @typedef {import("./body.js").Body} Body */
/**
 * @typedef {object} PlayerState
 * @property {number} slot
 * @property {number} tx            alvo (px, mundo)
 * @property {number} ty
 * @property {boolean} alive
 * @property {boolean} isBot
 * @property {Body[]} pieces        refs (ordem de criação; compactada 1×/passo)
 * @property {number} missiles
 * @property {number} speedUntil    ticks absolutos
 * @property {number} magnetUntil
 * @property {number} shieldUntil
 * @property {number} splitCdUntil
 * @property {number} ejectCdUntil
 * @property {boolean} ejectHold
 * @property {number} ejectHoldAt   próximo eject automático do hold
 * @property {number} score
 * @property {boolean} splitReq
 * @property {boolean} ejectReq
 * @property {boolean} fireReq
 */

// códigos de par (kind de A << 3 | kind de B); A sempre do grupo inserido antes: peças, ejetados, asteroides, mísseis, buracos
const K=KIND,PP=K.PIECE<<3|K.PIECE,PE=K.PIECE<<3|K.EJECT,PA=K.PIECE<<3|K.ASTEROID,PM=K.PIECE<<3|K.MISSILE,PH=K.PIECE<<3|K.BLACKHOLE,
  EA=K.EJECT<<3|K.ASTEROID,EH=K.EJECT<<3|K.BLACKHOLE,AA=K.ASTEROID<<3|K.ASTEROID,AH=K.ASTEROID<<3|K.BLACKHOLE,MH=K.MISSILE<<3|K.BLACKHOLE;
// constantes locais de spawn (margens do mockup; não existem em constants.js)
const PLAYER_MARGIN=300,PLAYER_SAFE=900,AST_MARGIN=200,BELT_MARGIN=ASTEROID.BELT_RADIUS[1]+200,BELT_RAD_JITTER=40,SPAWN_TRIES=40;
/** (x,y) está a ≥ min de todos os corpos vivos de arr? (arr null = sim) @param {Body[]|null} arr */
function farFrom(arr,min,x,y){if(!arr)return true;const m2=min*min;
  for(let i=0;i<arr.length;i++){const b=arr[i];if(!b||b.dead)continue;const dx=b.x-x,dy=b.y-y;if(dx*dx+dy*dy<m2)return false;}return true;}

export class World{
  /** @param {number} seed @param {number} w @param {number} h @param {{food:number,asteroids:boolean,holes:number}} o */
  constructor(seed,w,h,o){
    this.seed=seed;this.rng=createRng(seed);this.w=w;this.h=h;this.tick=0;this.nextId=1;
    /** @type {Body[]} */this.pieces=[];/** @type {Body[]} */this.food=[];/** @type {Body[]} */this.ejected=[];
    /** @type {Body[]} */this.asteroids=[];/** @type {Body[]} */this.holes=[];/** @type {Body[]} */this.missiles=[];
    /** @type {Map<number,PlayerState>} */this.players=new Map();
    /** @type {any[]} */this.events=[];/** @type {Map<number,Body>} */this.entityById=new Map();
    /** @type {{cx:number,cy:number,rad:number,w:number}[]} */this.belts=[];/** @type {{belt:number,at:number}[]} */this.astQueue=[];
    this.foodCount=o.food;this.holeCount=o.holes;this.astBase=o.asteroids?ASTEROID.BELTS*ASTEROID.PER_BELT+ASTEROID.WANDERERS:0;this.astCap=this.astBase+ASTEROID.MAX_EXTRA;
    this.grid=createGrid(w,h,GRID_CELL);this.foodGrid=createGrid(w,h,GRID_CELL);this.foodDirty=true;
    /** @type {Body[]} */this.dyn=[];this._pairs=new Int32Array(4096*3);/** @type {number[]} */this._q=[];this._spot={x:0,y:0};
    for(let i=0;i<o.food;i++)this.spawnFood();
    if(o.asteroids){const rng=this.rng;
      for(let b=0;b<ASTEROID.BELTS;b++){const rad=rng.range(ASTEROID.BELT_RADIUS[0],ASTEROID.BELT_RADIUS[1]),sp=rng.range(ASTEROID.BELT_SPEED[0],ASTEROID.BELT_SPEED[1]);
        this.belts.push({cx:rng.range(BELT_MARGIN,w-BELT_MARGIN),cy:rng.range(BELT_MARGIN,h-BELT_MARGIN),rad,w:sp/rad});
        for(let i=0;i<ASTEROID.PER_BELT;i++)this.spawnAsteroid(b,0,0,0,i/ASTEROID.PER_BELT*Math.PI*2);}
      for(let i=0;i<ASTEROID.WANDERERS;i++)this.spawnAsteroid(-1);}
    for(let i=0;i<o.holes;i++)this.spawnHole({active:i>0});}

  // ── ids e corpos ──
  newId(){return(this.nextId++)>>>0;}
  /** @param {Body} b */_register(b){this.entityById.set(b.id,b);return b;}
  /** Cria uma peça do slot (mergeAt = agora). */
  newPiece(slot,x,y,r){const ps=this.players.get(slot);const b=createBody(KIND.PIECE,this.newId(),x,y,r);b.owner=slot;b.mergeAt=this.tick;
    this.pieces.push(b);if(ps)ps.pieces.push(b);return this._register(b);}
  /** Cria um ejetado/debris (mass pode diferir de r²; dono só come após immuneTicks). */
  addEjected(x,y,vx,vy,r,mass,owner,immuneTicks,lifeTicks){const b=createBody(KIND.EJECT,this.newId(),x,y,r);b.mass=mass;b.vx=vx;b.vy=vy;b.owner=owner;
    b.cdUntil=this.tick+immuneTicks;b.life=this.tick+lifeTicks;this.ejected.push(b);return this._register(b);}
  addMissile(x,y,vx,vy,owner,targetSlot){const b=createBody(KIND.MISSILE,this.newId(),x,y,MISSILE.R);b.vx=vx;b.vy=vy;b.owner=owner;b.targetId=targetSlot;
    b.life=this.tick+MISSILE.LIFE_TICKS;this.missiles.push(b);return this._register(b);}
  /** Comida nova: tipo por sorteio (AMMO_P, POWER_P), matiz quantizado 0..HUES-1, r especial para munição/powerups. */
  spawnFood(){const rng=this.rng,roll=rng.next();let type,r;
    if(roll<FOOD.AMMO_P){type=FOOD_TYPE.AMMO;r=FOOD.SPECIAL_R;}
    else if(roll<FOOD.AMMO_P+FOOD.POWER_P){type=rng.int(FOOD_TYPE.SPEED,FOOD_TYPE.SHIELD);r=FOOD.SPECIAL_R;}
    else{type=rng.int(FOOD_TYPE.DUST,FOOD_TYPE.ROCK);r=rng.range(FOOD.R_MIN,FOOD.R_MAX);}
    const f=createBody(KIND.FOOD,this.newId(),rng.range(FOOD.MARGIN,this.w-FOOD.MARGIN),rng.range(FOOD.MARGIN,this.h-FOOD.MARGIN),r);
    f.type=type;f.hue=rng.int(0,FOOD.HUES-1);f.seed=rng.next();this.food.push(f);this.foodDirty=true;return this._register(f);}
  /**
   * Asteroide: `beltIx ≥ 0` orbita o cinturão (ângulo `ang` ou aleatório, raio com jitter); `-1` é errante
   * (posição dada ou longe dos jogadores, velocidade WANDER_SPEED em direção aleatória). r 0 = sorteia.
   */
  spawnAsteroid(beltIx=-1,x=0,y=0,r=0,ang=NaN){const rng=this.rng;if(!(r>0))r=rng.range(ASTEROID.R_MIN,ASTEROID.R_MAX);
    const a=createBody(KIND.ASTEROID,this.newId(),0,0,r);a.type=beltIx;a.seed=rng.next();a.hue=rng.int(0,2);
    if(beltIx>=0){const bt=this.belts[beltIx];a.ang=Number.isNaN(ang)?rng.angle():ang;a.orbitR=bt.rad+rng.range(-BELT_RAD_JITTER,BELT_RAD_JITTER);
      a.x=bt.cx+Math.cos(a.ang)*a.orbitR;a.y=bt.cy+Math.sin(a.ang)*a.orbitR;}
    else{if(x>0||y>0){a.x=x;a.y=y;}else{const s=this._farSpot(AST_MARGIN,this.pieces,ASTEROID.SAFE_SPAWN);a.x=s.x;a.y=s.y;}
      const an=rng.angle(),sp=rng.range(ASTEROID.WANDER_SPEED[0],ASTEROID.WANDER_SPEED[1]);a.vx=Math.cos(an)*sp;a.vy=Math.sin(an)*sp;}
    a.x=clamp(a.x,a.r,this.w-a.r);a.y=clamp(a.y,a.r,this.h-a.r);this.asteroids.push(a);return this._register(a);}
  /** Agenda o respawn de um asteroide (cinturão `belt` ou -1) daqui a `delay` ticks. */
  queueAsteroid(belt,delay){this.astQueue.push({belt,at:this.tick+delay});}
  /** Buraco negro: núcleo CORE_R, longe dos outros (MIN_SEP) e dos jogadores (SAFE_SPAWN); saída pareada a ≥ EXIT_MIN_DIST. */
  spawnHole({x=NaN,y=NaN,ex=NaN,ey=NaN,active=false}={}){const rng=this.rng,m=R.LOCAL.HOLE_MARGIN;
    if(Number.isNaN(x)){const s=this._farSpot(m,this.holes,BLACKHOLE.MIN_SEP,this.pieces,BLACKHOLE.SAFE_SPAWN);x=s.x;y=s.y;}
    const h=createBody(KIND.BLACKHOLE,this.newId(),x,y,BLACKHOLE.CORE_R);h.seed=rng.next();h.ang=rng.angle();h.cdUntil=this.tick+BLACKHOLE.DRIFT_CHANGE_TICKS;
    if(Number.isNaN(ex)){this._tmpHole[0]=h;const s=this._farSpot(m,this._tmpHole,BLACKHOLE.EXIT_MIN_DIST);ex=s.x;ey=s.y;}
    h.ex=ex;h.ey=ey;
    if(active){h.type=BH_PHASE.ACTIVE;h.k=1;const L=BLACKHOLE.LIFE_TICKS;h.life=this.tick+rng.int(Math.floor(L[0]*.5),L[1]);}
    else{h.type=BH_PHASE.GROW;h.k=0;h.life=this.tick+BLACKHOLE.GROW_TICKS;}
    this.holes.push(h);return this._register(h);}
  _tmpHole=[null];
  /** Ponto aleatório com margem a ≥ minX de cada lista (até 3; null ignora). 40 tentativas; devolve a última se falhar. */
  _farSpot(margin,arrA,minA,arrB=null,minB=0,arrC=null,minC=0){const rng=this.rng,s=this._spot;
    for(let t=0;t<SPAWN_TRIES;t++){const x=rng.range(margin,this.w-margin),y=rng.range(margin,this.h-margin);
      s.x=x;s.y=y;if(farFrom(arrA,minA,x,y)&&farFrom(arrB,minB,x,y)&&farFrom(arrC,minC,x,y))break;}
    return s;}
  /** Marca a peça morta; se era a última viva do dono, o jogador morre (PLAYER_DEAD). Retorna true se foi a última. */
  killPiece(pc,cause,bySlot){if(pc.dead)return false;pc.dead=true;const ps=this.players.get(pc.owner);
    if(ps&&ps.alive&&liveCount(ps.pieces)===0){ps.alive=false;this.events.push({type:"PLAYER_DEAD",slot:ps.slot,cause,bySlot});return true;}
    return false;}

  // ── jogadores ──
  /** Entra com uma peça (posição dada ou longe de perigos/jogadores). Retorna a peça. */
  addPlayer(slot,{x=NaN,y=NaN,r=PLAYER.START_R,isBot=false,missiles=0}={}){
    let ps=this.players.get(slot);
    if(!ps){ps={slot,tx:0,ty:0,alive:false,isBot,pieces:[],missiles,speedUntil:0,magnetUntil:0,shieldUntil:0,splitCdUntil:0,ejectCdUntil:0,
      ejectHold:false,ejectHoldAt:0,score:0,splitReq:false,ejectReq:false,fireReq:false};this.players.set(slot,ps);}
    else{this._dropPieces(ps);ps.isBot=isBot;ps.missiles=missiles;}
    return this._spawnPiece(ps,x,y,r);}
  _spawnPiece(ps,x,y,r){
    if(Number.isNaN(x)){const s=this._farSpot(PLAYER_MARGIN,this.holes,BLACKHOLE.SAFE_SPAWN,this.asteroids,ASTEROID.SAFE_SPAWN,this.pieces,PLAYER_SAFE);x=s.x;y=s.y;}
    ps.alive=true;ps.tx=x;ps.ty=y;ps.speedUntil=ps.magnetUntil=ps.shieldUntil=0;ps.ejectHold=false;
    const pc=this.newPiece(ps.slot,clamp(x,r,this.w-r),clamp(y,r,this.h-r),r);pc.cdUntil=this.tick+BLACKHOLE.CD_TICKS;return pc;}
  _dropPieces(ps){for(let i=0;i<ps.pieces.length;i++){const pc=ps.pieces[i];pc.dead=true;this.entityById.delete(pc.id);}
    ps.pieces.length=0;const arr=this.pieces;let k=0;for(let i=0;i<arr.length;i++)if(!arr[i].dead)arr[k++]=arr[i];arr.length=k;}
  /** Remove o jogador e suas peças (imediato; mísseis já lançados continuam). */
  removePlayer(slot){const ps=this.players.get(slot);if(!ps)return;this._dropPieces(ps);ps.alive=false;this.players.delete(slot);}
  /** Renasce com uma peça nova (score zera salvo `score`). Retorna a peça ou null se o slot não existe. */
  respawnPlayer(slot,{x=NaN,y=NaN,r=PLAYER.START_R,score=0}={}){const ps=this.players.get(slot);if(!ps)return null;
    this._dropPieces(ps);ps.score=score;ps.splitCdUntil=ps.ejectCdUntil=0;return this._spawnPiece(ps,x,y,r);}
  setTarget(slot,tx,ty){const ps=this.players.get(slot);if(!ps)return;ps.tx=clamp(tx,0,this.w);ps.ty=clamp(ty,0,this.h);}
  requestSplit(slot){const ps=this.players.get(slot);if(ps)ps.splitReq=true;}
  requestEject(slot){const ps=this.players.get(slot);if(ps)ps.ejectReq=true;}
  setEjectHold(slot,on){const ps=this.players.get(slot);if(!ps)return;if(on&&!ps.ejectHold)ps.ejectHoldAt=this.tick;ps.ejectHold=!!on;}
  requestFire(slot){const ps=this.players.get(slot);if(ps)ps.fireReq=true;}
  massOf(slot){const ps=this.players.get(slot);if(!ps)return 0;let m=0;for(let i=0;i<ps.pieces.length;i++){const p=ps.pieces[i];if(!p.dead)m+=p.mass;}return m;}
  piecesOf(slot){const ps=this.players.get(slot);return ps?ps.pieces:[];}

  // ── passo ──
  step(){
    const tick=this.tick,ev=this.events,W=this.w,H=this.h,players=this.players,pieces=this.pieces,ejected=this.ejected,asts=this.asteroids,missiles=this.missiles,holes=this.holes;
    ev.length=0;
    // ── 1. inputs ──
    for(const ps of players.values()){
      if(ps.alive){
        if(ps.splitReq&&tick>=ps.splitCdUntil){ps.splitCdUntil=tick+SPLIT.COOLDOWN_TICKS;R.applySplit(this,ps);}
        let ej=ps.ejectReq;if(ps.ejectHold&&tick>=ps.ejectHoldAt){ej=true;ps.ejectHoldAt=tick+EJECT.HOLD_TICKS;}
        if(ej&&tick>=ps.ejectCdUntil){ps.ejectCdUntil=tick+EJECT.COOLDOWN_TICKS;R.applyEject(this,ps);}
        if(ps.fireReq)R.applyFire(this,ps);}
      ps.splitReq=ps.ejectReq=ps.fireReq=false;}
    // ── 2. integração ──
    for(let i=0;i<pieces.length;i++){const pc=pieces[i];if(pc.dead)continue;const ps=players.get(pc.owner);
      integratePiece(pc,ps.tx,ps.ty,ps.speedUntil>tick?SPEED.POWER_SPEED:1,DT,W,H);
      let f=pc.flags&~(PIECE_FLAG.SHIELD|PIECE_FLAG.MERGING);if(ps.shieldUntil>tick)f|=PIECE_FLAG.SHIELD;if(pc.mergeAt<=tick&&ps.pieces.length>1)f|=PIECE_FLAG.MERGING;pc.flags=f;}
    for(let i=0;i<ejected.length;i++){const e=ejected[i];if(e.dead)continue;if(tick>=e.life){e.dead=true;continue;}integrateFree(e,EJECT.DRAG,WALL.E_EJECT,DT,W,H);}
    for(let i=0;i<asts.length;i++){const a=asts[i];if(a.dead)continue;
      if(a.type>=0){const bt=this.belts[a.type];a.ang+=bt.w*DT;const tx=bt.cx+Math.cos(a.ang)*a.orbitR,ty=bt.cy+Math.sin(a.ang)*a.orbitR;
        a.vx=(a.vx+(tx-a.x)*ASTEROID.BELT_SPRING)*ASTEROID.BELT_DAMP;a.vy=(a.vy+(ty-a.y)*ASTEROID.BELT_SPRING)*ASTEROID.BELT_DAMP;}
      integrateFree(a,0,WALL.E_AST,DT,W,H);}
    for(let i=0;i<missiles.length;i++){const m=missiles[i];if(m.dead)continue;if(tick>=m.life){m.dead=true;continue;}
      R.homeMissile(this,m);if(integrateFree(m,0,0,DT,W,H))m.dead=true;}
    for(let i=0;i<holes.length;i++){const h=holes[i];if(!h.dead)R.tickHole(this,h);}
    // ── 3. grades ──
    const grid=this.grid,dyn=this.dyn;let nd=0;grid.clear();
    for(let i=0;i<pieces.length;i++){const b=pieces[i];if(b.dead)continue;dyn[nd]=b;grid.insert(nd++,b.x,b.y,b.r);}
    for(let i=0;i<ejected.length;i++){const b=ejected[i];if(b.dead)continue;dyn[nd]=b;grid.insert(nd++,b.x,b.y,b.r);}
    for(let i=0;i<asts.length;i++){const b=asts[i];if(b.dead)continue;dyn[nd]=b;grid.insert(nd++,b.x,b.y,b.r);}
    for(let i=0;i<missiles.length;i++){const b=missiles[i];if(b.dead)continue;dyn[nd]=b;grid.insert(nd++,b.x,b.y,b.r);}
    for(let i=0;i<holes.length;i++){const b=holes[i];if(b.dead)continue;const ri=b.r*BLACKHOLE.INFLUENCE*b.k;if(ri<R.LOCAL.HOLE_MIN_RI)continue;dyn[nd]=b;grid.insert(nd++,b.x,b.y,ri);}
    dyn.length=nd;grid.build();
    const food=this.food,fg=this.foodGrid;
    if(this.foodDirty){fg.clear();for(let i=0;i<food.length;i++){const f=food[i];fg.insert(i,f.x,f.y,f.r);}fg.build();this.foodDirty=false;}
    let pb=this._pairs,np=0;
    grid.forEachPair((i,j)=>{if(np+3>pb.length){const nb=new Int32Array(pb.length*2);nb.set(pb);pb=this._pairs=nb;}pb[np++]=i;pb[np++]=j;pb[np++]=dyn[i].kind<<3|dyn[j].kind;});
    // ── 4. mesmo dono: separação só enquanto uma das duas não pode fundir (regra v1); atração ao centróide quando todas podem ──
    for(const ps of players.values()){const arr=ps.pieces,n=arr.length;if(n<2)continue;let all=true;
      for(let i=0;i<n;i++){const a=arr[i];if(a.dead)continue;const am=a.mergeAt<=tick;if(!am)all=false;
        for(let j=i+1;j<n;j++){const b=arr[j];if(!b.dead&&!(am&&b.mergeAt<=tick))separateOwn(a,b);}}
      if(all)pullToCentroid(arr);}
    // ── 5. donos diferentes: engolir ou quicar ──
    for(let p=0;p<np;p+=3){if(pb[p+2]!==PP)continue;const A=dyn[pb[p]],B=dyn[pb[p+1]];if(A.dead||B.dead||A.owner===B.owner)continue;R.piecePair(this,A,B);}
    // ── 6. perigos: asteroides e buracos negros ──
    for(let p=0;p<np;p+=3){const code=pb[p+2];if(code===PP||code===PE||code===EA||code===PM)continue;const A=dyn[pb[p]],B=dyn[pb[p+1]];if(A.dead||B.dead)continue;
      if(code===PA)R.pieceAsteroid(this,A,B);
      else if(code===AA){const s=A.r+B.r,dx=B.x-A.x,dy=B.y-A.y;if(dx*dx+dy*dy<s*s)resolveBounce(A,B,ASTEROID.E_AST,BOUNCE.POS_CORR);}
      else if(code===PH||code===EH||code===AH||code===MH)R.holePair(this,A,B);}
    const q=this._q;
    for(let i=0;i<holes.length;i++){const h=holes[i];if(h.dead)continue;const ri=h.r*BLACKHOLE.INFLUENCE*h.k,rc=h.r*h.k;if(ri<R.LOCAL.HOLE_MIN_RI)continue;
      const n=fg.query(h.x,h.y,ri,q);let moved=false;
      for(let k=0;k<n;k++){const f=food[q[k]];if(f.dead)continue;const dx=h.x-f.x,dy=h.y-f.y;if(dx*dx+dy*dy>ri*ri)continue;moved=true;if(R.pullFood(h,f,rc,ri))f.dead=true;}
      if(moved)this.foodDirty=true;}
    // ── 7. comida (ímã, comer) e ejetados (absorver, alimentar asteroide) ──
    const ov=R.LOCAL.FOOD_OVERLAP;
    for(let i=0;i<pieces.length;i++){const pc=pieces[i];if(pc.dead)continue;const ps=players.get(pc.owner),magnet=ps.magnetUntil>tick;
      const range=magnet?pc.r*POWERUP.MAGNET_RANGE:pc.r+FOOD.R_MAX*ov,n=fg.query(pc.x,pc.y,range,q);
      for(let k=0;k<n;k++){const f=food[q[k]];if(f.dead)continue;let dx=pc.x-f.x,dy=pc.y-f.y,d2=dx*dx+dy*dy;
        if(magnet&&d2<range*range&&d2>1e-6){const d=Math.sqrt(d2);let s=POWERUP.MAGNET_PULL*DT;if(s>d)s=d;f.x+=dx/d*s;f.y+=dy/d*s;this.foodDirty=true;dx=pc.x-f.x;dy=pc.y-f.y;d2=dx*dx+dy*dy;}
        const lim=pc.r+f.r*ov;if(d2<lim*lim)R.eatFood(this,ps,pc,f);}}
    for(let p=0;p<np;p+=3){const code=pb[p+2];if(code!==PE&&code!==EA)continue;const A=dyn[pb[p]],B=dyn[pb[p+1]];if(A.dead||B.dead)continue;
      if(code===PE)R.pieceEject(this,A,B);else R.ejectAsteroid(this,A,B);}
    // ── 8. mísseis ──
    for(let p=0;p<np;p+=3){if(pb[p+2]!==PM)continue;const A=dyn[pb[p]],B=dyn[pb[p+1]];if(A.dead||B.dead)continue;R.pieceMissile(this,A,B);}
    // ── 9. fusões ──
    for(const ps of players.values()){const arr=ps.pieces,n=arr.length;if(n<2)continue;
      for(let i=0;i<n;i++){const a=arr[i];if(a.dead||a.mergeAt>tick)continue;for(let j=i+1;j<n;j++){const b=arr[j];if(b.dead)continue;
        if(tryMergeOwn(a,b,tick))ev.push({type:"MERGE",slot:ps.slot,pieceId:a.id,mergedId:b.id,x:a.x,y:a.y,r:a.r});}}}
    // ── 10. compactação ordenada ──
    this._compact();
    // ── 11. spawns ──
    while(food.length<this.foodCount)this.spawnFood();
    const aq=this.astQueue;if(aq.length){let k=0;for(let i=0;i<aq.length;i++){const e=aq[i];if(e.at<=tick){const a=this.spawnAsteroid(e.belt);ev.push({type:"ASTEROID_RESPAWN",asteroidId:a.id,x:a.x,y:a.y,r:a.r});}else aq[k++]=e;}aq.length=k;}
    while(holes.length<this.holeCount){const h=this.spawnHole();ev.push({type:"HOLE_RESPAWN",holeId:h.id,x:h.x,y:h.y,ex:h.ex,ey:h.ey});}
    this.tick=tick+1;}
  _compact(){const byId=this.entityById;let foodGone=false;
    const cp=arr=>{let k=0;for(let i=0;i<arr.length;i++){const b=arr[i];if(b.dead)byId.delete(b.id);else arr[k++]=b;}const gone=k!==arr.length;arr.length=k;return gone;};
    cp(this.pieces);foodGone=cp(this.food);cp(this.ejected);cp(this.asteroids);cp(this.holes);cp(this.missiles);if(foodGone)this.foodDirty=true;
    for(const ps of this.players.values()){const arr=ps.pieces;let k=0;for(let i=0;i<arr.length;i++)if(!arr[i].dead)arr[k++]=arr[i];arr.length=k;}}
}

/** Cria um mundo determinístico. `food`/`holes` são contagens; `asteroids:false` desliga cinturões e errantes. */
export function createWorld({seed=1,w=WORLD.w,h=WORLD.h,food=FOOD.COUNT,asteroids=true,holes=BLACKHOLE.COUNT}={}){return new World(seed,w,h,{food,asteroids,holes});}

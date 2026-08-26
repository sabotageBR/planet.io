// ── BOT: wander / hunt / flee + fuga de buracos negros; pensa a cada THINK_TICKS ──
// Sem Session nem hooks: produz input como um humano via sim.applyInput(slot,{tx,ty,flags}).
// Razões FLEE_RATIO/HUNT_RATIO são de raio (a maior peça de cada lado). Split quando caça de perto e é
// bem maior (SPLIT_P por tick, ≤ BOT.MAX_PIECES); FIRE_P por tick com munição enquanto caça/foge.
// @ts-check
import {BOT,BLACKHOLE} from '@planet/shared/constants.js';
import {INPUT_FLAG} from '@planet/shared/protocol/constants.js';
import {clamp} from '@planet/shared/util.js';
const MARGIN=200,FLEE_STEP=700,WAYPOINT_DONE=100,HUMAN_BONUS=1.5;
/** Centro, maior raio e nº de peças vivas de um PlayerState (null se nenhuma). */
function centroid(ps){let sx=0,sy=0,big=0,n=0;const arr=ps.pieces;for(let i=0;i<arr.length;i++){const p=arr[i];if(p.dead)continue;sx+=p.x;sy+=p.y;if(p.r>big)big=p.r;n++;}
  return n?{x:sx/n,y:sy/n,big,n}:null;}
/** Buraco negro cuja zona de fuga (influência·HOLE_AVOID) contém (x,y); o mais próximo. */
function threateningHole(w,x,y){let best=null,bd=Infinity;const holes=w.holes;
  for(let i=0;i<holes.length;i++){const h=holes[i];if(h.dead||h.k<=0)continue;const ri=h.r*BLACKHOLE.INFLUENCE*h.k,lim=ri*BOT.HOLE_AVOID,dx=x-h.x,dy=y-h.y,d2=dx*dx+dy*dy;
    if(d2<lim*lim&&d2<bd){bd=d2;best=h;}}
  if(!best)return null;return{x:best.x,y:best.y,ri:best.r*BLACKHOLE.INFLUENCE*best.k};}
export class BotBrain{
  constructor(sim,slot){this.sim=sim;this.slot=slot;this.mode='wander';this.target=-1;this.wx=0;this.wy=0;this.nextThink=0;}
  reset(){this.mode='wander';this.target=-1;this.nextThink=0;}
  act(tick){
    const sim=this.sim,w=sim.world,ps=w.players.get(this.slot);if(!ps||!ps.alive)return;const c=centroid(ps);if(!c)return;const rng=sim.rng;
    if(tick>=this.nextThink){this._think(ps,c);this.nextThink=tick+rng.int(BOT.THINK_TICKS[0],BOT.THINK_TICKS[1]);}
    let tx=this.wx,ty=this.wy,flags=0;
    if(this.mode==='hunt'||this.mode==='flee'){
      const o=w.players.get(this.target),oc=o&&o.alive?centroid(o):null;
      if(!oc){this._wander(w);tx=this.wx;ty=this.wy;}
      else{const dx=oc.x-c.x,dy=oc.y-c.y,d=Math.hypot(dx,dy)||1;
        if(this.mode==='hunt'){tx=oc.x;ty=oc.y;
          if(d<c.big*2.8&&c.big>oc.big*BOT.HUNT_RATIO&&c.n<BOT.MAX_PIECES&&rng.chance(BOT.SPLIT_P))flags|=INPUT_FLAG.SPLIT;
          if(ps.missiles>0&&d<c.big*8&&rng.chance(BOT.FIRE_P))flags|=INPUT_FLAG.FIRE;}
        else{tx=clamp(c.x-dx/d*FLEE_STEP,MARGIN,w.w-MARGIN);ty=clamp(c.y-dy/d*FLEE_STEP,MARGIN,w.h-MARGIN);
          if(ps.missiles>0&&rng.chance(BOT.FIRE_P))flags|=INPUT_FLAG.FIRE;}}}
    else if(this.mode==='food'){const f=w.entityById.get(this.target);if(f&&!f.dead){tx=f.x;ty=f.y;}else{this._wander(w);tx=this.wx;ty=this.wy;}}
    else if(Math.hypot(this.wx-c.x,this.wy-c.y)<WAYPOINT_DONE){this._wander(w);tx=this.wx;ty=this.wy;}
    const h=threateningHole(w,c.x,c.y);
    if(h){const dx=c.x-h.x,dy=c.y-h.y,d=Math.hypot(dx,dy)||1,s=h.ri*1.5;tx=clamp(c.x+dx/d*s,MARGIN,w.w-MARGIN);ty=clamp(c.y+dy/d*s,MARGIN,w.h-MARGIN);flags&=~INPUT_FLAG.SPLIT;}
    sim.applyInput(this.slot,{tx,ty,flags});}
  _wander(w){const rng=this.sim.rng;this.mode='wander';this.target=-1;this.wx=rng.range(MARGIN,w.w-MARGIN);this.wy=rng.range(MARGIN,w.h-MARGIN);}
  _think(ps,c){
    const w=this.sim.world;let flee=-1,fd=Infinity,hunt=-1,hv=-Infinity;
    for(const o of w.players.values()){if(o===ps||!o.alive)continue;const oc=centroid(o);if(!oc)continue;const d=Math.hypot(oc.x-c.x,oc.y-c.y);
      if(oc.big>=c.big*BOT.FLEE_RATIO){if(d<BOT.FLEE_DIST&&d<fd){fd=d;flee=o.slot;}}
      else if(c.big>=oc.big*BOT.HUNT_RATIO&&d<BOT.HUNT_DIST){const v=oc.big*(o.isBot?1:HUMAN_BONUS)-d*.1;if(v>hv){hv=v;hunt=o.slot;}}}
    if(flee>=0){this.mode='flee';this.target=flee;return;}
    if(hunt>=0){this.mode='hunt';this.target=hunt;return;}
    const food=w.food;let best=null,bd=BOT.FOOD_DIST*BOT.FOOD_DIST;
    for(let i=0;i<food.length;i++){const f=food[i];if(f.dead)continue;const dx=f.x-c.x,dy=f.y-c.y,d2=dx*dx+dy*dy;if(d2<bd){bd=d2;best=f;}}
    if(best){this.mode='food';this.target=best.id;return;}
    this._wander(w);}
}

// ── SNAPSHOT por sessão: AOI (shared/camera) com histerese, CREATE / UPDATE-se-mudou / REMOVE, self ──
// As máscaras de mudança são calculadas UMA vez por tick de snapshot para a sala (contra o estado
// quantizado do snapshot anterior) e valem para todas as sessões — todo CREATE nasce num tick de
// snapshot com o estado daquele tick, então o delta seguinte é sempre relativo ao que o cliente viu.
// Comida só recebe UPDATE (X_Y) quando o mundo a marcou FOOD_FLAG.MOVED (ímã/buraco negro); senão só CREATE/REMOVE.
// Objetos de saída são de pools reutilizados.
// @ts-check
import {NET,BLACKHOLE} from '@planet/shared/constants.js';
import {KIND,UPD,REMOVE,PIECE_FLAG,FOOD_FLAG} from '@planet/shared/protocol/constants.js';
import {encodeSnapshot,qPos,qR,qV} from '@planet/shared/protocol/index.js';
import {focusOf,zoomFor,viewRect,rectHas} from '@planet/shared/camera.js';
const MAX_BUFFERED=256*1024,SWEEP_EVERY=60,WFLAGS=PIECE_FLAG.SHIELD|PIECE_FLAG.LAUNCH|PIECE_FLAG.MERGING|PIECE_FLAG.MAGNET|PIECE_FLAG.SHIELD_LV_MASK,NO_SLOT=0xffff;
const DEFAULT_REASON=[0,REMOVE.EATEN,REMOVE.EATEN,REMOVE.EXPIRED,REMOVE.DESPAWN,REMOVE.DESPAWN,REMOVE.EXPIRED]; // por KIND
const newCreate=()=>({kind:0,id:0,x:0,y:0,r:0,owner:0,vx:0,vy:0,flags:0,type:0,hue:0,seed:0,influenceR:0,phase:0,target:0});
const newUpdate=()=>({id:0,mask:0,x:0,y:0,r:0,vx:0,vy:0,flags:0,phase:0,influenceR:0});
const newRemove=()=>({id:0,reason:0});
const influenceOf=h=>h.r*BLACKHOLE.INFLUENCE*h.k;
/** @param {import('../rooms/Room.js').Room} room */
export function createSnapshotter(room){
  const W=room.sim.world.w,H=room.sim.world.h;
  /** @type {Map<number,{x:number,y:number,r:number,vx:number,vy:number,flags:number,phase:number,infl:number,seen:number}>} */const prev=new Map();
  /** @type {Map<number,number>} */const masks=new Map();
  const crPool=[],upPool=[],rmPool=[],creates=[],updates=[],removes=[];
  const self={flags:0,missiles:0,powerBits:0,speedT:0,magnetT:0,shieldLv:0,score:0,splitCd:0,ejectCd:0,rank:0,mass:0};
  const snap={tick:0,ackSeq:0,creates,updates,removes,self};
  let passes=0;
  const track=(arr,kind,t)=>{for(let i=0;i<arr.length;i++){const b=arr[i];if(b.dead)continue;
    const x=qPos(b.x,W),y=qPos(b.y,H),r=qR(b.r),vx=qV(b.vx),vy=qV(b.vy),flags=b.flags&WFLAGS,phase=kind===KIND.BLACKHOLE?b.type:0,infl=kind===KIND.BLACKHOLE?Math.round(influenceOf(b)):0;
    let p=prev.get(b.id);if(!p){prev.set(b.id,{x,y,r,vx,vy,flags,phase,infl,seen:t});continue;}
    let m=0;if(p.x!==x||p.y!==y){m|=UPD.X_Y;p.x=x;p.y=y;}if(p.r!==r){m|=UPD.R;p.r=r;}
    if(kind!==KIND.BLACKHOLE&&(p.vx!==vx||p.vy!==vy)){m|=UPD.V;p.vx=vx;p.vy=vy;}
    if(kind===KIND.PIECE&&p.flags!==flags){m|=UPD.FLAGS;p.flags=flags;}
    if(kind===KIND.BLACKHOLE&&(p.phase!==phase||p.infl!==infl)){m|=UPD.EXTRA;p.phase=phase;p.infl=infl;}
    p.seen=t;if(m)masks.set(b.id,m);}};
  /** Uma vez por tick de snapshot: máscaras de mudança de tudo que se move. */
  function beginTick(){const w=room.sim.world,t=w.tick;masks.clear();
    track(w.pieces,KIND.PIECE,t);track(w.ejected,KIND.EJECT,t);track(w.asteroids,KIND.ASTEROID,t);track(w.holes,KIND.BLACKHOLE,t);track(w.missiles,KIND.MISSILE,t);
    const food=w.food;for(let i=0;i<food.length;i++){const f=food[i];if(f.flags&FOOD_FLAG.MOVED){f.flags&=~FOOD_FLAG.MOVED;if(!f.dead)masks.set(f.id,UPD.X_Y);}}
    if(++passes%SWEEP_EVERY===0)for(const [id,p] of prev)if(p.seen!==t)prev.delete(id);}
  function pushCreate(b,kind,slot,sim){const e=crPool[creates.length]||(crPool[creates.length]=newCreate());creates.push(e);
    e.kind=kind;e.id=b.id;e.x=b.x;e.y=b.y;e.r=b.r;
    switch(kind){
      case KIND.PIECE:e.owner=b.owner;e.vx=b.vx;e.vy=b.vy;e.flags=(b.flags&WFLAGS)|(b.owner===slot?PIECE_FLAG.ME:0);break;
      case KIND.FOOD:e.type=b.type;e.hue=b.hue;break;
      case KIND.EJECT:{e.owner=b.owner<0?NO_SLOT:b.owner;const gp=sim.players.get(b.owner);e.hue=gp?gp.skinId&255:0;e.vx=b.vx;e.vy=b.vy;break;}
      case KIND.ASTEROID:e.seed=(b.seed*65535)|0;e.vx=b.vx;e.vy=b.vy;break;
      case KIND.BLACKHOLE:e.seed=(b.seed*65535)|0;e.influenceR=influenceOf(b);e.phase=b.type;break;
      case KIND.MISSILE:e.owner=b.owner<0?NO_SLOT:b.owner;e.target=(b.type!==0||b.targetId<0)?NO_SLOT:b.targetId;e.vx=b.vx;e.vy=b.vy;break;}}   // type 1: alvo é um id de míssil (não vai no fio)
  function pushUpdate(b,kind,m,slot){const u=upPool[updates.length]||(upPool[updates.length]=newUpdate());updates.push(u);u.id=b.id;u.mask=m;
    if(m&UPD.X_Y){u.x=b.x;u.y=b.y;}if(m&UPD.R)u.r=b.r;if(m&UPD.V){u.vx=b.vx;u.vy=b.vy;}
    if(m&UPD.FLAGS)u.flags=(b.flags&WFLAGS)|(kind===KIND.PIECE&&b.owner===slot?PIECE_FLAG.ME:0);
    if(m&UPD.EXTRA){u.phase=b.type;u.influenceR=influenceOf(b);}}
  function pushRemove(id,reason){const r=rmPool[removes.length]||(rmPool[removes.length]=newRemove());removes.push(r);r.id=id;r.reason=reason;}
  /** Monta e envia o snapshot de uma sessão (nada acontece se o socket está fechado ou atolado). */
  function send(s){
    const ws=s.ws;if(!ws||ws.readyState!==1)return false;
    if(ws.bufferedAmount>MAX_BUFFERED){s.known.clear();s.rect=null;return false;}   // cliente lento: pula este; recria tudo quando drenar
    const sim=room.sim,w=sim.world,slot=s.slot,ps=w.players.get(slot),gp=sim.players.get(slot);
    const pcs=ps?ps.pieces:null;
    if(pcs&&pcs.length){const f=focusOf(pcs);s.cx=f.cx;s.cy=f.cy;s.scale=zoomFor(f.bigR,f.spread,s.view.h>s.view.w);}
    const rin=viewRect(s.cx,s.cy,s.scale,s.view.w,s.view.h,NET.AOI_PAD),rout=viewRect(s.cx,s.cy,s.scale,s.view.w,s.view.h,NET.AOI_PAD_OUT);s.rect=rout;
    const known=s.known,stamp=(++s.stamp)&0xffffff,tag=stamp<<3;creates.length=0;updates.length=0;removes.length=0;
    const visit=(arr,kind)=>{for(let i=0;i<arr.length;i++){const b=arr[i];if(b.dead)continue;const rad=kind===KIND.BLACKHOLE?influenceOf(b):b.r;
      if(known.has(b.id)){if(!rectHas(rout,b.x,b.y,rad))continue;known.set(b.id,kind|tag);const m=masks.get(b.id);if(m)pushUpdate(b,kind,m,slot);}
      else if(rectHas(rin,b.x,b.y,rad)){known.set(b.id,kind|tag);pushCreate(b,kind,slot,sim);}}};
    visit(w.pieces,KIND.PIECE);visit(w.food,KIND.FOOD);visit(w.ejected,KIND.EJECT);visit(w.asteroids,KIND.ASTEROID);visit(w.holes,KIND.BLACKHOLE);visit(w.missiles,KIND.MISSILE);
    const gone=sim.gone,byId=w.entityById;
    for(const [id,v] of known){if((v>>>3)===stamp)continue;known.delete(id);
      const g=gone.get(id);pushRemove(id,g!==undefined?g:byId.has(id)?REMOVE.LEFT_AOI:DEFAULT_REASON[v&7]);}
    snap.tick=w.tick;snap.ackSeq=gp?gp.lastInput.seq:0;sim.self(slot,self);
    const view=encodeSnapshot(room.writer,snap);if(!s.send(view))room.rotateWriter();return true;}
  return{beginTick,send,prev,masks};
}

// ── BUFFER DE SNAPSHOTS: entidades por id com histórico de amostras + relógio do servidor ──
// Cada entidade guarda as últimas 10 amostras {tick,x,y,r,vx,vy}; comida parada tem uma só
// (o servidor só a atualiza quando o ímã/buraco negro a move). Removidas ficam marcadas (reason)
// para o Interpolator apagar (sumiço com efeito ou fade curto, conforme o motivo).
// Relógio: cada snapshot mede off = tick − now·60/1000; o ALVO é a mediana das últimas OFF_N medições
// (imune a um pacote atrasado) e o offset usado no render DESLIZA até o alvo a ≤ SLEW tick por frame
// (slew(), chamado pelo Interpolator) — sem degraus a cada pacote; salto > SNAP ticks (resume) → snap.
import {KIND,UPD,TICK_HZ} from "@planet/shared";

const MAX_SAMPLES=10,OFF_N=8,SLEW=.02,SNAP=3;
export function createSnapshotBuffer(){
  const entities=new Map(),offs=[];
  const b={entities,lastTick:0,lastRecv:0,offset:NaN,offsetTarget:NaN,offsetJitter:0,count:0,bytes:0,
    /** tick estimado do servidor em `now` (performance.now) */
    tickAt(now){return Number.isNaN(b.offset)?b.lastTick:b.offset+now*TICK_HZ/1000;},
    /** Uma vez por frame: aproxima o offset do alvo sem degraus. */
    slew(){if(Number.isNaN(b.offsetTarget))return;if(Number.isNaN(b.offset)){b.offset=b.offsetTarget;return;}
      const d=b.offsetTarget-b.offset;if(Math.abs(d)>SNAP)b.offset=b.offsetTarget;else if(d>SLEW)b.offset+=SLEW;else if(d<-SLEW)b.offset-=SLEW;else b.offset=b.offsetTarget;},
    apply(snap,now){
      const tick=snap.tick,off=tick-now*TICK_HZ/1000;
      offs.push(off);if(offs.length>OFF_N)offs.shift();
      const sorted=offs.slice().sort((x,y)=>x-y),med=sorted[sorted.length>>1];
      if(!Number.isNaN(b.offsetTarget))b.offsetJitter=b.offsetJitter*.9+Math.abs(off-b.offsetTarget)*.1;
      b.offsetTarget=med;if(Number.isNaN(b.offset))b.offset=med;
      b.lastTick=tick;b.lastRecv=now;b.count++;
      for(const c of snap.creates){let e=entities.get(c.id);
        if(!e){e={id:c.id,kind:c.kind,x:c.x,y:c.y,r:c.r,vx:c.vx||0,vy:c.vy||0,flags:c.flags||0,owner:c.owner==null?-1:c.owner,type:c.type||0,hue:c.hue||0,seed:c.seed||0,
          influenceR:c.influenceR||0,phase:c.phase||0,target:c.target==null?-1:c.target,samples:[],firstTick:tick,lastTick:tick,removed:0,reason:-1,
          rx:c.x,ry:c.y,rr:c.r,alpha:1,gone:false,extrap:false,vanished:false};entities.set(c.id,e);}
        else{e.kind=c.kind;e.x=c.x;e.y=c.y;e.r=c.r;e.vx=c.vx||0;e.vy=c.vy||0;e.flags=c.flags||0;if(c.owner!=null)e.owner=c.owner;if(c.type!=null)e.type=c.type;if(c.hue!=null)e.hue=c.hue;
          if(c.seed!=null)e.seed=c.seed;if(c.influenceR!=null)e.influenceR=c.influenceR;if(c.phase!=null)e.phase=c.phase;if(c.target!=null)e.target=c.target;
          e.removed=0;e.reason=-1;e.gone=false;e.vanished=false;e.samples.length=0;e.alpha=1;}
        push(e,tick,e.x,e.y,e.r,e.vx,e.vy);e.lastTick=tick;}
      for(const u of snap.updates){const e=entities.get(u.id);if(!e)continue;const m=u.mask;
        if(m&UPD.X_Y){e.x=u.x;e.y=u.y;}if(m&UPD.R)e.r=u.r;if(m&UPD.V){e.vx=u.vx;e.vy=u.vy;}if(m&UPD.FLAGS)e.flags=u.flags;
        if(m&UPD.EXTRA){e.phase=u.phase;e.influenceR=u.influenceR;}
        push(e,tick,e.x,e.y,e.r,e.vx,e.vy);e.lastTick=tick;}
      for(const r of snap.removes){const e=entities.get(r.id);if(!e)continue;e.removed=tick;e.reason=r.reason;}},
    /** Última amostra de uma entidade (ou null). */
    last(e){const s=e.samples;return s.length?s[s.length-1]:null;},
    clear(){entities.clear();b.lastTick=0;b.offset=NaN;b.offsetTarget=NaN;b.offsetJitter=0;offs.length=0;b.count=0;},
    delete(id){entities.delete(id);},
  };
  function push(e,tick,x,y,r,vx,vy){const s=e.samples;const l=s[s.length-1];
    if(l&&l.tick===tick){l.x=x;l.y=y;l.r=r;l.vx=vx;l.vy=vy;return;}
    if(s.length>=MAX_SAMPLES)s.shift();s.push({tick,x,y,r,vx,vy});}
  return b;}
export const isPieceOf=(e,slot)=>e.kind===KIND.PIECE&&e.owner===slot;

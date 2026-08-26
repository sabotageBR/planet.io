// ── PREDIÇÃO das peças próprias: cópias locais (createBody) avançadas a 60 Hz com stepOwnPieces ──
// No snapshot: estado do servidor → reaplica os inputs do histórico (ticks > tick do servidor)
// até o tick local → a diferença com a posição antes do reconcílio vira visualOffset (vox,voy)
// que decai exp(−dt/0.1); |Δ| > NET.SNAP_DIST → snap (sem offset). Peças criadas/removidas pelo
// servidor entram/saem casando por id; fundidas localmente ficam ocultas até o servidor confirmar.
import {KIND,PIECE_FLAG,SELF_FLAG,POWER_BIT,NET,DT,TICK_HZ} from "@planet/shared";
import {createBody,stepOwnPieces} from "@planet/shared/physics/index.js";

const TAU=.1,HIDE_TICKS=30;
export function createPredictor({buffer,input}){
  const pieces=[],hidden=new Map(),old=new Map();   // hidden: id → tick de expiração
  let slot=-1,localTick=0,acc=0,synced=false,tx=0,ty=0,speedUntil=0,dead=false,corrSum=0,corrN=0;
  const p={pieces,slot:-1,localTick:0,stats:{corrAvg:0,replaySteps:0,lastCorr:0},
    setSlot(s){slot=p.slot=s;},
    setTarget(x,y){tx=x;ty=y;},
    get dead(){return dead;},
    /** Casa uma entidade do buffer com as peças próprias. */
    isOwn(e){return e.kind===KIND.PIECE&&(e.owner===slot||(e.flags&PIECE_FLAG.ME)!==0);},
    /** Avança o relógio local a 60 Hz (chamado por frame). */
    update(dt){if(!synced)return;acc+=dt;if(acc>.25)acc=.25;
      while(acc>=DT){acc-=DT;localTick++;stepOwnPieces(pieces,{tx,ty,speedUntil},localTick);}
      const k=Math.exp(-dt/TAU);for(const pc of pieces){pc.vox*=k;pc.voy*=k;}},
    /** Reconcilia com o snapshot (após buffer.apply). */
    onSnapshot(snap,rttMs){
      const tick=snap.tick,self=snap.self;dead=(self.flags&SELF_FLAG.DEAD)!==0;
      speedUntil=self.powerBits&POWER_BIT.speed?tick+self.speedT:0;
      const lead=Math.ceil((rttMs||0)/2*TICK_HZ/1000)+1;
      if(!synced){localTick=tick+lead;synced=true;}
      else{const want=tick+lead;if(Math.abs(localTick-want)>3)localTick=want;}   // deriva > 3 ticks: ressincroniza
      p.localTick=localTick;
      if(input)input.onAck(snap.ackSeq);
      old.clear();for(const pc of pieces)old.set(pc.id,{x:pc.x+pc.vox,y:pc.y+pc.voy});
      // estado autoritativo
      const seen=new Set();let k=0;
      for(const e of buffer.entities.values()){if(!p.isOwn(e)||e.removed)continue;const s=buffer.last(e);if(!s)continue;seen.add(e.id);
        let pc=null;for(let i=0;i<pieces.length;i++)if(pieces[i].id===e.id){pc=pieces[i];break;}
        if(!pc){pc=createBody(KIND.PIECE,e.id,s.x,s.y,s.r);pc.owner=slot;pc.vox=0;pc.voy=0;pc.createdTick=e.firstTick;}
        pc.x=s.x;pc.y=s.y;pc.r=s.r;pc.mass=s.r*s.r;pc.vx=s.vx;pc.vy=s.vy;pc.flags=e.flags;pc.dead=false;pc.mergeAt=(e.flags&PIECE_FLAG.MERGING)?0:Infinity;
        pieces[k++]=pc;}
      pieces.length=k;
      for(const [id,exp] of hidden){if(!seen.has(id)||localTick>exp)hidden.delete(id);}
      // replay dos inputs do histórico do tick do servidor até o local
      const h=input?input.history:[];let hi=0,cur=null;while(hi<h.length&&h[hi].tick<=tick){cur=h[hi];hi++;}
      let steps=0;const st={tx:cur?cur.tx:tx,ty:cur?cur.ty:ty,speedUntil};
      for(let t=tick+1;t<=localTick;t++){while(hi<h.length&&h[hi].tick<=t){cur=h[hi];hi++;st.tx=cur.tx;st.ty=cur.ty;}stepOwnPieces(pieces,st,t);steps++;}
      p.stats.replaySteps=steps;
      // fundidas localmente durante o replay: ocultar até o servidor remover
      for(const pc of pieces)if(pc.dead)hidden.set(pc.id,localTick+HIDE_TICKS);
      // offset visual
      let corr=0,n=0;
      for(const pc of pieces){const o=old.get(pc.id);if(!o){pc.vox=0;pc.voy=0;continue;}
        const dx=o.x-pc.x,dy=o.y-pc.y,d=Math.hypot(dx,dy);corr+=d;n++;
        if(d>NET.SNAP_DIST){pc.vox=0;pc.voy=0;}else{pc.vox=dx;pc.voy=dy;}}
      if(n){corrSum+=corr/n;corrN++;p.stats.lastCorr=corr/n;p.stats.corrAvg=corrSum/corrN;}},
    isHidden(id){return hidden.has(id);},
    /** Posições de render (x+vox). */
    forEach(fn){for(const pc of pieces)if(!pc.dead&&!hidden.has(pc.id))fn(pc);},
    reset(){pieces.length=0;hidden.clear();synced=false;acc=0;dead=false;corrSum=corrN=0;},
    resetStats(){corrSum=corrN=0;p.stats.corrAvg=p.stats.lastCorr=0;},
  };
  return p;}

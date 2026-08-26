// ── PREDIÇÃO das peças próprias: cópias locais (createBody) avançadas a 60 Hz com stepOwnPieces ──
// Render INTERPOLADO entre passos: rx = px + (x−px)·alpha + vox (alpha = fração do passo acumulada; atraso
// ≤ 1 passo = 16 ms). Sem isso o acumulador dá 0/1/2 passos por frame e a peça treme — muito visível com
// zoom alto (r=30: 1.25×, 3–7 px de tela por passo) e em telas de 120 Hz.
// No snapshot: estado do servidor → reaplica os inputs do histórico (ticks > tick do servidor) até o tick
// local → a diferença entre a posição RENDERIZADA antes e a interpolada agora vira visualOffset (vox,voy) que decai
// exp(−dt/0.1); |Δ| > NET.SNAP_DIST → snap (sem offset). Peças criadas/removidas pelo servidor entram/saem
// casando por id; fundidas localmente no replay ficam ocultas (HIDE_TICKS) até o servidor confirmar.
// lead = RTT/2 + 1 tick; ressincroniza quando deriva > 2 ticks OU quando o lead muda (1º PONG chega ~1 s após o join).
import {KIND,PIECE_FLAG,SELF_FLAG,NET,DT,TICK_HZ} from "@planet/shared";
import {createBody,stepOwnPieces} from "@planet/shared/physics/index.js";

const TAU=.1,HIDE_TICKS=30;
export function createPredictor({buffer,input}){
  const pieces=[],hidden=new Map(),old=new Map(),seen=new Set();   // hidden: id → tick de expiração
  let slot=-1,localTick=0,acc=0,synced=false,tx=0,ty=0,dead=false,corrSum=0,corrN=0,lastLead=-1;
  const p={pieces,slot:-1,localTick:0,alpha:0,stats:{corrAvg:0,replaySteps:0,lastCorr:0},
    setSlot(s){slot=p.slot=s;},
    setTarget(x,y){tx=x;ty=y;},
    get dead(){return dead;},
    /** Casa uma entidade do buffer com as peças próprias. */
    isOwn(e){return e.kind===KIND.PIECE&&(e.owner===slot||(e.flags&PIECE_FLAG.ME)!==0);},
    /** Avança o relógio local a 60 Hz (chamado por frame); guarda px/py para a interpolação do render. */
    update(dt){if(!synced)return;acc+=dt;if(acc>.25)acc=.25;
      while(acc>=DT){acc-=DT;localTick++;for(const pc of pieces){pc.px=pc.x;pc.py=pc.y;}stepOwnPieces(pieces,{tx,ty},localTick);}
      p.alpha=acc/DT;const k=Math.exp(-dt/TAU);for(const pc of pieces){pc.vox*=k;pc.voy*=k;}},
    /** Reconcilia com o snapshot (após buffer.apply). */
    onSnapshot(snap,rttMs){
      const tick=snap.tick,self=snap.self,alpha=p.alpha;dead=(self.flags&SELF_FLAG.DEAD)!==0;
      const lead=Math.ceil((rttMs||0)/2*TICK_HZ/1000)+1;
      if(!synced){localTick=tick+lead;synced=true;}
      else{const want=tick+lead;if(Math.abs(localTick-want)>2||lead!==lastLead)localTick=want;}
      lastLead=lead;p.localTick=localTick;
      if(input)input.onAck(snap.ackSeq);
      old.clear();for(const pc of pieces)old.set(pc.id,{x:pc.px+(pc.x-pc.px)*alpha+pc.vox,y:pc.py+(pc.y-pc.py)*alpha+pc.voy});   // posição renderizada
      // estado autoritativo
      seen.clear();let k=0;
      for(const e of buffer.entities.values()){if(!p.isOwn(e)||e.removed)continue;const s=buffer.last(e);if(!s)continue;seen.add(e.id);
        let pc=null;for(let i=0;i<pieces.length;i++)if(pieces[i].id===e.id){pc=pieces[i];break;}
        if(!pc){pc=createBody(KIND.PIECE,e.id,s.x,s.y,s.r);pc.owner=slot;pc.vox=0;pc.voy=0;pc.px=s.x;pc.py=s.y;pc.createdTick=e.firstTick;}
        pc.x=s.x;pc.y=s.y;pc.r=s.r;pc.mass=s.r*s.r;pc.vx=s.vx;pc.vy=s.vy;pc.flags=e.flags;pc.dead=false;pc.mergeAt=(e.flags&PIECE_FLAG.MERGING)?0:Infinity;
        pieces[k++]=pc;}
      pieces.length=k;
      for(const [id,exp] of hidden){if(!seen.has(id)||localTick>exp)hidden.delete(id);}
      // replay dos inputs do histórico do tick do servidor até o local
      const h=input?input.history:[];let hi=0,cur=null;while(hi<h.length&&h[hi].tick<=tick){cur=h[hi];hi++;}
      let steps=0;const st={tx:cur?cur.tx:tx,ty:cur?cur.ty:ty};
      for(let t=tick+1;t<=localTick;t++){while(hi<h.length&&h[hi].tick<=t){cur=h[hi];hi++;st.tx=cur.tx;st.ty=cur.ty;}
        for(const pc of pieces){pc.px=pc.x;pc.py=pc.y;}stepOwnPieces(pieces,st,t);steps++;}   // px = posição do passo anterior (mesma fase do render)
      if(!steps)for(const pc of pieces){pc.px=pc.x;pc.py=pc.y;}
      p.stats.replaySteps=steps;
      // fundidas localmente durante o replay (sumiram do array): ocultar até o servidor remover
      if(pieces.length<seen.size){for(const id of seen){let f=false;for(const pc of pieces)if(pc.id===id){f=true;break;}if(!f)hidden.set(id,localTick+HIDE_TICKS);}}
      // offset visual = posição renderizada antes − posição interpolada agora (mesmo alpha): só correção, sem fração de passo
      let corr=0,n=0;
      for(const pc of pieces){const o=old.get(pc.id);if(!o){pc.vox=0;pc.voy=0;continue;}
        const dx=o.x-(pc.px+(pc.x-pc.px)*alpha),dy=o.y-(pc.py+(pc.y-pc.py)*alpha),d=Math.hypot(dx,dy);corr+=d;n++;
        if(d>NET.SNAP_DIST){pc.vox=0;pc.voy=0;}else{pc.vox=dx;pc.voy=dy;}}
      if(n){corrSum+=corr/n;corrN++;p.stats.lastCorr=corr/n;p.stats.corrAvg=corrSum/corrN;}},
    isHidden(id){return hidden.has(id);},
    /** Peças vivas e visíveis (render: px+(x−px)·alpha+vox — ver WorldView.build). */
    forEach(fn){for(const pc of pieces)if(!pc.dead&&!hidden.has(pc.id))fn(pc);},
    reset(){pieces.length=0;hidden.clear();synced=false;acc=0;dead=false;corrSum=corrN=0;lastLead=-1;p.alpha=0;},
    resetStats(){corrSum=corrN=0;p.stats.corrAvg=p.stats.lastCorr=0;},
  };
  return p;}

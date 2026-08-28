// ── PREDIÇÃO das peças próprias: cópias locais (createBody) avançadas a 60 Hz com stepOwnPieces ──
// Render INTERPOLADO entre passos: rx = px + (x−px)·alpha + vox (alpha = fração do passo acumulada; atraso
// ≤ 1 passo = 16 ms). Sem isso o acumulador dá 0/1/2 passos por frame e a peça treme — muito visível com
// zoom alto (r=30: 1.25×, 3–7 px de tela por passo) e em telas de 120 Hz.
// No snapshot: estado do servidor → reaplica os inputs do histórico (ticks > tick do servidor) até o tick
// local → a diferença entre a posição RENDERIZADA antes e a interpolada agora vira visualOffset (vox,voy) que decai
// exp(−dt/0.1); |Δ| > NET.SNAP_DIST → snap (sem offset). Peças criadas/removidas pelo servidor entram/saem
// casando por id; fundidas localmente no replay ficam ocultas (HIDE_TICKS) até o servidor confirmar.
// lead = RTT/2 + 1 tick; ressincroniza quando deriva > 2 ticks OU quando o lead muda (1º PONG chega ~1 s após o join).
// Os buracos negros conhecidos entram na predição (mesma gravidade do servidor): sem isso a peça própria fica
// borrachuda dentro da influência, que agora é grande.
// A CUSPARADA também entra (`ej`, espelho do PlayerState do servidor): cada uma tira a massa da pelota e dá 12,35 px
// de recuo, 8,57×/s = 106 px/s. Sem prever isso a correção de cada snapshot sacudia a tela inteira (a câmera segue
// as peças próprias) — era o "travamento" de segurar o W. A FASE vem do `self.ejectCd`, que já vinha no fio: o
// servidor grava ejectCdUntil = tick + COOLDOWN a CADA cusparada, então dá para saber quando foi a última e,
// com HOLD_TICKS, quando será a próxima. Reancorado a cada snapshot, não acumula erro.
import {KIND,PIECE_FLAG,SELF_FLAG,INPUT_FLAG,NET,DT,TICK_HZ,BLACKHOLE,EJECT} from "@planet/shared";
import {createBody,stepOwnPieces} from "@planet/shared/physics/index.js";

const TAU=.1,HIDE_TICKS=30;
export function createPredictor({buffer,input}){
  const pieces=[],hidden=new Map(),old=new Map(),seen=new Set(),holes=[];   // hidden: id → tick de expiração
  const ej={hold:false,req:false,cdUntil:0,holdAt:0};   // agenda da cusparada (ver cabeçalho)
  let slot=-1,localTick=0,acc=0,synced=false,tx=0,ty=0,dead=false,corrSum=0,corrN=0,lastLead=-1,zone=null;
  const p={pieces,slot:-1,localTick:0,alpha:0,stats:{corrAvg:0,replaySteps:0,lastCorr:0},
    setSlot(s){slot=p.slot=s;},
    setTarget(x,y){tx=x;ty=y;},
    /**
     * Círculo da zona (Battle Royale) no tick local. Precisa entrar na predição pela mesma razão do
     * decaimento: ela muda o RAIO da peça, e sem prever a correção do servidor chegaria 20×/s numa peça
     * que está encolhendo — ela pulsaria de tamanho justo na borda, que é onde o jogador mais olha.
     */
    setZone(z){zone=z||null;},
    get dead(){return dead;},
    /** Casa uma entidade do buffer com as peças próprias. */
    isOwn(e){return e.kind===KIND.PIECE&&(e.owner===slot||(e.flags&PIECE_FLAG.ME)!==0);},
    /** Buracos negros conhecidos (posição autoritativa mais recente) para a gravidade da predição. */
    holes(){holes.length=0;
      for(const e of buffer.entities.values()){if(e.kind!==KIND.BLACKHOLE||e.removed||!e.influenceR)continue;const s=buffer.last(e);if(!s||!s.r)continue;
        holes.push({x:s.x,y:s.y,r:s.r,k:Math.min(1,e.influenceR/(s.r*BLACKHOLE.INFLUENCE)),seed:(e.seed||0)/65535});}
      return holes.length?holes:null;},
    /** Avança o relógio local a 60 Hz (chamado por frame); guarda px/py para a interpolação do render. */
    update(dt){if(!synced)return;acc+=dt;if(acc>.25)acc=.25;
      const hs=acc>=DT?p.holes():null;
      // ao vivo, o hold LOCAL é o que o servidor vai ver. O toque avulso (EJECT sem hold) fica só para o replay:
      // ele custa um único recuo de 12 px, corrigido no snapshot seguinte — nada perto dos 106 px/s do hold.
      if(input)ej.hold=input.hold;
      while(acc>=DT){acc-=DT;localTick++;for(const pc of pieces){pc.px=pc.x;pc.py=pc.y;}
        stepOwnPieces(pieces,{tx,ty},localTick,DT,undefined,undefined,hs,ej,zone);}
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
      const cd=self.ejectCd|0;ej.cdUntil=tick+cd;                                   // reancora a agenda da cusparada no estado autoritativo
      if(cd>0)ej.holdAt=tick+cd-EJECT.COOLDOWN_TICKS+EJECT.HOLD_TICKS;               // cd>0 ⇒ a última cusparada foi em tick+cd−COOLDOWN
      const h=input?input.history:[];let hi=0,cur=null;while(hi<h.length&&h[hi].tick<=tick){cur=h[hi];hi++;}
      let steps=0;const st={tx:cur?cur.tx:tx,ty:cur?cur.ty:ty},hs=p.holes();
      if(cur)ej.hold=(cur.flags&INPUT_FLAG.EJECT_HOLD)!==0;ej.req=false;
      for(let t=tick+1;t<=localTick;t++){while(hi<h.length&&h[hi].tick<=t){cur=h[hi];hi++;st.tx=cur.tx;st.ty=cur.ty;
          ej.hold=(cur.flags&INPUT_FLAG.EJECT_HOLD)!==0;if(cur.flags&INPUT_FLAG.EJECT)ej.req=true;}
        for(const pc of pieces){pc.px=pc.x;pc.py=pc.y;}stepOwnPieces(pieces,st,t,DT,undefined,undefined,hs,ej,zone);steps++;}   // px = posição do passo anterior (mesma fase do render)
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
    reset(){pieces.length=0;holes.length=0;hidden.clear();synced=false;acc=0;dead=false;corrSum=corrN=0;lastLead=-1;zone=null;p.alpha=0;
      ej.hold=ej.req=false;ej.cdUntil=ej.holdAt=0;},
    resetStats(){corrSum=corrN=0;p.stats.corrAvg=p.stats.lastCorr=0;},
  };
  return p;}

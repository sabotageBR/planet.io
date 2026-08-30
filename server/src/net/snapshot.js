// ── SNAPSHOT por sessão: AOI (shared/camera) com histerese, CREATE / UPDATE-se-mudou / REMOVE, self ──
// As máscaras de mudança são calculadas UMA vez por tick de snapshot para a sala (contra o estado
// quantizado do snapshot anterior) e valem para todas as sessões — todo CREATE nasce num tick de
// snapshot com o estado daquele tick, então o delta seguinte é sempre relativo ao que o cliente viu.
// Comida só recebe UPDATE (X_Y) quando o mundo a marcou FOOD_FLAG.MOVED (ímã/buraco negro); senão só CREATE/REMOVE.
// Estrela entra na AOI pelo halo (r·STAR.HALO) e manda fase/halo em UPD.EXTRA (incha antes da supernova; o ímã a arrasta).
// Objetos de saída são de pools reutilizados.
// @ts-check
import {NET,BLACKHOLE,STAR,POWERUP,ZOOM} from '@warspace/shared/constants.js';
const ZOOM_GRACE_TICKS=15;   // ~250 ms de AOI larga a mais na expiração do powerup: o cliente conta o tempo a 60 Hz e o snapshot chega a 20 Hz, e a área enviada nunca pode ser MENOR que a vista
import {KIND,UPD,REMOVE,PIECE_FLAG,FOOD_FLAG,SELF_FLAG} from '@warspace/shared/protocol/constants.js';
import {encodeSnapshot,qPos,qR,qV} from '@warspace/shared/protocol/index.js';
import {focusOf,zoomFor,viewRect,rectHas,aoiScaleFood,clampZoom} from '@warspace/shared/camera.js';
/**
 * Marca d'água ALTA do zoom manual, e o `max(1,·)` que impede a AOI de encolher quando o jogador aproxima.
 * ⚠️ Os dois existem pelo mesmo motivo do ZOOM_GRACE_TICKS acima, e valem para o sentido em que o fator
 * ENCOLHE: a câmera do cliente é suavizada por CAM.TAU_ZOOM (3τ ≈ 470 ms) e esta AOI é instantânea, então
 * voltar ao automático estreitaria a área enviada no tick seguinte enquanto a câmera ainda leva meio segundo
 * para chegar lá — uma borda vazia a cada entalhe de roda. Crescer é imediato (a AOI pode SOBRAR).
 * @param {any} s sessão @param {number} f fator já clampado pela massa @param {number} tick
 */
function zoomAoi(s,f,tick){const g=f>1?f:1;
  if(g>=s.zoomHold||tick>=s.zoomHoldAt+ZOOM.GRACE_TICKS){s.zoomHold=g;s.zoomHoldAt=tick;}
  return s.zoomHold;}
let fq=new Int32Array(4096);   // buffer da consulta de comida por retângulo (cresce com o mundo)
const MAX_BUFFERED=256*1024,SWEEP_EVERY=60,WFLAGS=PIECE_FLAG.SHIELD|PIECE_FLAG.LAUNCH|PIECE_FLAG.MERGING|PIECE_FLAG.MAGNET|PIECE_FLAG.SHIELD_LV_MASK,NO_SLOT=0xffff;
const DEFAULT_REASON=[0,REMOVE.EATEN,REMOVE.EATEN,REMOVE.EXPIRED,REMOVE.DESPAWN,REMOVE.DESPAWN,REMOVE.EXPIRED,REMOVE.DESPAWN]; // por KIND
const newCreate=()=>({kind:0,id:0,x:0,y:0,r:0,owner:0,vx:0,vy:0,flags:0,type:0,hue:0,seed:0,influenceR:0,phase:0,target:0,weapon:0});
const newUpdate=()=>({id:0,mask:0,x:0,y:0,r:0,vx:0,vy:0,flags:0,phase:0,influenceR:0});
const newRemove=()=>({id:0,reason:0});
const influenceOf=h=>h.r*BLACKHOLE.INFLUENCE*h.k,haloOf=st=>st.r*STAR.HALO*st.k;   // halo carrega o k: o cliente lê a rampa de nascimento dele
const extraOf=(b,kind)=>kind===KIND.BLACKHOLE?influenceOf(b):kind===KIND.STAR?haloOf(b):0;
const hasExtra=kind=>kind===KIND.BLACKHOLE||kind===KIND.STAR;
/** @param {import('../rooms/Room.js').Room} room */
export function createSnapshotter(room){
  const W=room.sim.world.w,H=room.sim.world.h;
  /** @type {Map<number,{x:number,y:number,r:number,vx:number,vy:number,flags:number,phase:number,infl:number,seen:number}>} */const prev=new Map();
  /** @type {Map<number,number>} */const masks=new Map();
  const crPool=[],upPool=[],rmPool=[],creates=[],updates=[],removes=[];
  const self={flags:0,missiles:0,powerBits:0,magnetT:0,shieldLv:0,score:0,splitCd:0,ejectCd:0,fireCd:0,rank:0,mass:0,threat:0,threatDir:0,weapon:0,alive:0,owned:1,autoDefN:0,zoomT:0,feastT:0};
  const snap={tick:0,ackSeq:0,creates,updates,removes,self};
  let passes=0;/** @type {any[]} */const longe=[];   // reusado: o anel de fora, candidato ao teto de comida
  /** @type {any[]} */const novos=[];   // reusado: o disco de perto, criado antes do anel (ver visitFood)
  const track=(arr,kind,t)=>{for(let i=0;i<arr.length;i++){const b=arr[i];if(b.dead)continue;
    const x=qPos(b.x,W),y=qPos(b.y,H),r=qR(b.r),vx=qV(b.vx),vy=qV(b.vy),flags=b.flags&WFLAGS,ex=hasExtra(kind),phase=ex?b.type:0,infl=ex?Math.round(extraOf(b,kind)):0;
    let p=prev.get(b.id);if(!p){prev.set(b.id,{x,y,r,vx,vy,flags,phase,infl,seen:t});continue;}
    let m=0;if(p.x!==x||p.y!==y){m|=UPD.X_Y;p.x=x;p.y=y;}if(p.r!==r){m|=UPD.R;p.r=r;}
    if(!ex&&(p.vx!==vx||p.vy!==vy)){m|=UPD.V;p.vx=vx;p.vy=vy;}
    if(kind===KIND.PIECE&&p.flags!==flags){m|=UPD.FLAGS;p.flags=flags;}
    if(ex&&(p.phase!==phase||p.infl!==infl)){m|=UPD.EXTRA;p.phase=phase;p.infl=infl;}
    p.seen=t;if(m)masks.set(b.id,m);}};
  /** Uma vez por tick de snapshot: máscaras de mudança de tudo que se move. */
  function beginTick(){const w=room.sim.world,t=w.tick;masks.clear();w.ensureFoodGrid();   // a AOI consulta a grade da comida: ela tem que estar coerente com o array depois da compactação
    track(w.pieces,KIND.PIECE,t);track(w.ejected,KIND.EJECT,t);track(w.asteroids,KIND.ASTEROID,t);track(w.holes,KIND.BLACKHOLE,t);track(w.missiles,KIND.MISSILE,t);track(w.stars,KIND.STAR,t);
    const food=w.food;for(let i=0;i<food.length;i++){const f=food[i];if(f.flags&FOOD_FLAG.MOVED){f.flags&=~FOOD_FLAG.MOVED;if(!f.dead)masks.set(f.id,UPD.X_Y);}}
    if(++passes%SWEEP_EVERY===0)for(const [id,p] of prev)if(p.seen!==t)prev.delete(id);}
  function pushCreate(b,kind,slot,sim){const e=crPool[creates.length]||(crPool[creates.length]=newCreate());creates.push(e);
    e.kind=kind;e.id=b.id;e.x=b.x;e.y=b.y;e.r=b.r;
    switch(kind){
      case KIND.PIECE:e.owner=b.owner;e.vx=b.vx;e.vy=b.vy;e.flags=(b.flags&WFLAGS)|(b.owner===slot?PIECE_FLAG.ME:0);break;
      case KIND.FOOD:e.type=b.type;e.hue=b.hue;break;
      case KIND.EJECT:e.owner=b.owner<0?NO_SLOT:b.owner;e.hue=b.type;e.vx=b.vx;e.vy=b.vy;break;   // hue = FRAG_KIND (a cor vem do dono, no cliente); o skinId que ia aqui nunca foi lido
      case KIND.ASTEROID:e.seed=(b.seed*65535)|0;e.vx=b.vx;e.vy=b.vy;break;
      case KIND.BLACKHOLE:case KIND.STAR:e.seed=(b.seed*65535)|0;e.influenceR=extraOf(b,kind);e.phase=b.type;break;
      case KIND.MISSILE:e.owner=b.owner<0?NO_SLOT:b.owner;e.target=(b.type!==0||b.targetId<0)?NO_SLOT:b.targetId;e.vx=b.vx;e.vy=b.vy;e.weapon=b.hue|0;break;}}   // `hue` é livre no míssil: é onde a ARMA viaja   // type 1: alvo é um id de míssil (não vai no fio)
  function pushUpdate(b,kind,m,slot){const u=upPool[updates.length]||(upPool[updates.length]=newUpdate());updates.push(u);u.id=b.id;u.mask=m;
    if(m&UPD.X_Y){u.x=b.x;u.y=b.y;}if(m&UPD.R)u.r=b.r;if(m&UPD.V){u.vx=b.vx;u.vy=b.vy;}
    if(m&UPD.FLAGS)u.flags=(b.flags&WFLAGS)|(kind===KIND.PIECE&&b.owner===slot?PIECE_FLAG.ME:0);
    if(m&UPD.EXTRA){u.phase=b.type;u.influenceR=extraOf(b,kind);}}
  function pushRemove(id,reason){const r=rmPool[removes.length]||(rmPool[removes.length]=newRemove());removes.push(r);r.id=id;r.reason=reason;}
  /**
   * Comida na AOI pela GRADE, não varrendo o mundo. A comida é de longe a população maior (FOOD.COUNT), e o
   * laço linear custava O(total × sessões) por snapshot; `foodGrid.queryRect` devolve só o que está no
   * retângulo externo. Quem saiu da AOI continua sendo removido pela varredura de carimbo do `known`, que
   * não depende deste laço.
   */
  function visitFood(w,rin,rout,known,tag,slot,sim,cx,cy){
    const food=w.food,fg=w.foodGrid;if(!food.length)return;
    if(fq.length<food.length)fq=new Int32Array(food.length*2);
    const n=fg.queryRect(rout.x0,rout.y0,rout.x1,rout.y1,fq);
    // TETO POR CONTAGEM (NET.AOI_FOOD_MAX), não só por área: quem já é conhecido é sempre mantido (sumir um
    // grão da tela é pior que ele nunca ter aparecido) e o corte cai no ANEL DE FORA. Por isso duas passadas:
    // a 1ª cria o que está a menos de metade do raio da AOI, a 2ª preenche o resto — as duas respeitam o
    // teto, e a ordem é que dá a prioridade ao que está perto. Senão a
    // varredura da grade, que vem em ordem de célula, poderia gastar o teto no que está longe e deixar um
    // buraco de comida em volta do jogador.
    const perto=Math.min(rout.x1-rout.x0,rout.y1-rout.y0)*.25,p2=perto*perto;
    let usados=0;longe.length=0;novos.length=0;
    // 1ª passada: SÓ os já conhecidos. Eles nunca somem, então o que eles ocupam do teto tem que ser
    // contado ANTES de qualquer criação — misturar as duas coisas numa passada só deixava o teto mole
    // pela ORDEM da grade: bastava um grão novo ser criado antes de os conhecidos serem visitados para a
    // sessão terminar com 301 de 300. O que a criação recebe é o que SOBRA.
    for(let i=0;i<n;i++){const b=food[fq[i]];if(!b||b.dead)continue;
      if(known.has(b.id)){if(!rectHas(rout,b.x,b.y,b.r))continue;known.set(b.id,KIND.FOOD|tag);usados++;const m=masks.get(b.id);if(m)pushUpdate(b,KIND.FOOD,m,slot);}
      else if(rectHas(rin,b.x,b.y,b.r)){const dx=b.x-cx,dy=b.y-cy;
        if(dx*dx+dy*dy<=p2)novos.push(b);else longe.push(b);}}   // o disco "perto" tem PRIORIDADE, mas não passa por cima do teto
    for(let i=0;i<novos.length&&usados<NET.AOI_FOOD_MAX;i++){const b=novos[i];
      known.set(b.id,KIND.FOOD|tag);usados++;pushCreate(b,KIND.FOOD,slot,sim);}
    for(let i=0;i<longe.length&&usados<NET.AOI_FOOD_MAX;i++){const b=longe[i];
      known.set(b.id,KIND.FOOD|tag);usados++;pushCreate(b,KIND.FOOD,slot,sim);}
    novos.length=0;
    longe.length=0;}
  /** Monta e envia o snapshot de uma sessão (nada acontece se o socket está fechado ou atolado). */
  function send(s){
    const ws=s.ws;if(!ws||ws.readyState!==1)return false;
    if(ws.bufferedAmount>MAX_BUFFERED){s.known.clear();s.rect=null;s.resync=true;return false;}   // cliente lento: pula este e esquece o known; o próximo snapshot vai com RESYNC (senão o que já foi enviado vira entidade fantasma eterna no cliente)
    const sim=room.sim,w=sim.world,slot=s.slot,ps=w.players.get(slot),gp=sim.players.get(slot);
    const pcs=ps?ps.pieces:null;
    // POWERUP DE ZOOM: a AOI usa o MESMO `zoomFor` da câmera do cliente, então ela tem que afastar junto —
    // do contrário o jogador enxerga mais mundo e recebe uma borda vazia. E ela desliga DEPOIS: o cliente
    // decrementa o `zoomT` localmente a 60 Hz enquanto o snapshot chega a 20 Hz, então sem a graça haveria
    // uns 50 ms de câmera mais larga que a área enviada. A AOI pode sobrar; faltar, nunca.
    // ZOOM MANUAL (a roda): o fator vem do cliente, então quem manda é o clamp DAQUI — com o ΣR autoritativo,
    // o mesmo que alimenta o zoomFor. Um cliente adulterado pedindo z=99 recebe exatamente a AOI de um jogador
    // honesto encostado no batente da faixa dele: nem um pixel a mais. Nada de contar violação — um cliente
    // HONESTO fica fora da faixa o tempo todo (mandou o z com o ΣR de 200 ms atrás e nesse meio-tempo dividiu,
    // comeu ou foi comido), e punir isso derrubaria jogador legítimo no meio da briga.
    let zk=1,zu=1;
    if(pcs&&pcs.length){zk=w.tick<ps.zoomUntil+ZOOM_GRACE_TICKS?POWERUP.ZOOM_K:1;
      const f=focusOf(pcs);zu=zoomAoi(s,clampZoom(s.view.zoom,f.sumR),w.tick);
      s.cx=f.cx;s.cy=f.cy;s.scale=zoomFor(f.sumR,s.view.w,s.view.h,zk,zu);}
    // ⚠️ Espectador fica em 1, e é o único valor possível: quem morreu lê o PRÓPRIO `self` (sem powerup) e
    // move a câmera pelas peças do assistido com mult 1. Herdar aqui o `zoomUntil` da vida anterior do morto
    // — ou o do assistido — faria servidor e cliente enquadrarem coisas diferentes.
    else if(s.specSlot>=0){const sp=w.players.get(s.specSlot),spp=sp&&sp.alive?sp.pieces.filter(p=>!p.dead):null;   // morto: a AOI acompanha quem ele está assistindo (o cliente move a câmera pelo mesmo slot)
      if(spp&&spp.length){const f=focusOf(spp);s.cx=f.cx;s.cy=f.cy;s.scale=zoomFor(f.sumR,s.view.w,s.view.h);}
      else room.spectateTargetFor(s);}   // o alvo morreu: escolhe outro (e avisa o cliente)
    const rin=viewRect(s.cx,s.cy,s.scale,s.view.w,s.view.h,NET.AOI_PAD),rout=viewRect(s.cx,s.cy,s.scale,s.view.w,s.view.h,NET.AOI_PAD_OUT);s.rect=rout;
    const known=s.known,stamp=(++s.stamp)&0xffffff,tag=stamp<<3;creates.length=0;updates.length=0;removes.length=0;
    const visit=(arr,kind)=>{for(let i=0;i<arr.length;i++){const b=arr[i];if(b.dead)continue;const rad=hasExtra(kind)?Math.max(b.r,extraOf(b,kind)):b.r;
      if(known.has(b.id)){if(!rectHas(rout,b.x,b.y,rad))continue;known.set(b.id,kind|tag);const m=masks.get(b.id);if(m)pushUpdate(b,kind,m,slot);}
      else if(rectHas(rin,b.x,b.y,rad)){known.set(b.id,kind|tag);pushCreate(b,kind,slot,sim);}}};
    // a comida tem retângulo PRÓPRIO, com escala mínima: a câmera pode afastar à vontade, mas não se manda o
    // mapa inteiro de comida para um cliente só (ver aoiScaleFood). O resto vem pela visão de verdade.
    const fs=aoiScaleFood(s.scale,s.view.w,s.view.h,zk,zu);   // o piso da comida é PRÓPRIO: sem o mesmo fator, o anel de fora do zoom fica sem um grão sequer
    const fin=fs===s.scale?rin:viewRect(s.cx,s.cy,fs,s.view.w,s.view.h,NET.AOI_PAD),
          fout=fs===s.scale?rout:viewRect(s.cx,s.cy,fs,s.view.w,s.view.h,NET.AOI_PAD_OUT);
    visit(w.pieces,KIND.PIECE);visitFood(w,fin,fout,known,tag,slot,sim,s.cx,s.cy);visit(w.ejected,KIND.EJECT);visit(w.asteroids,KIND.ASTEROID);visit(w.holes,KIND.BLACKHOLE);visit(w.stars,KIND.STAR);visit(w.missiles,KIND.MISSILE);
    const gone=sim.gone,byId=w.entityById;
    for(const [id,v] of known){if((v>>>3)===stamp)continue;known.delete(id);
      const g=gone.get(id);pushRemove(id,g!==undefined?g:byId.has(id)?REMOVE.LEFT_AOI:DEFAULT_REASON[v&7]);}
    snap.tick=w.tick;snap.ackSeq=gp?gp.lastInput.seq:0;sim.self(slot,self);
    if(s.resync){self.flags|=SELF_FLAG.RESYNC;s.resync=false;}
    const view=encodeSnapshot(room.writer,snap);if(!s.send(view))room.rotateWriter();return true;}
  return{beginTick,send,prev,masks};
}

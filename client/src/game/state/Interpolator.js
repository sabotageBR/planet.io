// ── INTERPOLAÇÃO (entidades dos outros): render em tRender = tick estimado − atraso ──────
// Atraso base NET.INTERP_DELAY_MS, adaptativo até INTERP_MAX_MS quando o buffer seca 2× em 5 s
// (volta 0.5 tick a cada 10 s calmos); o atraso usado RAMPA (DELAY_SLEW/frame) em vez de saltar.
// Lerp x/y/r entre as amostras que cercam tRender; além da última amostra extrapola com vx,vy até
// EXTRAP_MAX_MS. Sem update há 1 s → fade e remoção, mas SÓ para quem estava em movimento: o servidor não
// manda UPDATE de quem está parado (posição quantizada igual), então um fragmento parado sumiria da tela
// continuando comível no mundo. Entidades órfãs de verdade somem pelo RESYNC do servidor. Removidas pelo servidor,
// quando tRender alcança o tick da remoção: EATEN/SUCKED/POPPED/MERGED → somem NO MESMO FRAME e
// chamam onVanish(e) (efeito local); LEFT_AOI → imediato; EXPIRED/DESPAWN → fade curto (0,2 s).
import {KIND,NET,TICK_HZ,REMOVE} from "@warspace/shared";

const T=TICK_HZ/1000,BASE=NET.INTERP_DELAY_MS*T,MAXD=NET.INTERP_MAX_MS*T,EXTRAP=NET.EXTRAP_MAX_MS*T,STALE=60,FADE_REMOVED=12,FADE_STALE=30,DELAY_SLEW=.05,STILL_V2=64;   // |v| ≤ 8 px/s = parado
const MOVING=new Set([KIND.PIECE,KIND.EJECT,KIND.MISSILE]);
const VANISH=new Set([REMOVE.EATEN,REMOVE.SUCKED,REMOVE.POPPED,REMOVE.MERGED]);
export function createInterpolator(buffer,{isOwn=()=>false,onVanish=null}={}){
  let delay=BASE,delayTarget=BASE,dryAt=[],calmSince=0;
  const it={delayTicks:BASE,renderTick:0,dry:0,extrap:0,
    get delayMs(){return delay/T;},
    update(now){
      buffer.slew();const est=buffer.tickAt(now),rt=est-delay;it.renderTick=rt;it.delayTicks=delay;let extrap=0;
      const lastTick=buffer.lastTick;
      if(buffer.count&&rt>lastTick+1){if(!dryAt.length||now-dryAt[dryAt.length-1]>250){dryAt.push(now);it.dry++;}
        dryAt=dryAt.filter(t=>now-t<5000);if(dryAt.length>=2&&delayTarget<MAXD){delayTarget=Math.min(MAXD,delayTarget+1.5);dryAt.length=0;calmSince=now;}}
      else if(delayTarget>BASE&&now-calmSince>10000){delayTarget=Math.max(BASE,delayTarget-.5);calmSince=now;}
      const dd=delayTarget-delay;if(dd>DELAY_SLEW)delay+=DELAY_SLEW;else if(dd<-DELAY_SLEW)delay-=DELAY_SLEW;else delay=delayTarget;
      for(const e of buffer.entities.values()){
        if(e.gone)continue;
        if(isOwn(e)){e.alpha=1;if(e.removed)e.gone=true;continue;}   // próprias: o Predictor cuida; removida pelo servidor some já
        const s=e.samples,n=s.length;if(!n)continue;
        const last=s[n-1];
        if(n===1||rt>=last.tick){const lim=MOVING.has(e.kind)||e.kind===KIND.ASTEROID?EXTRAP:0,dt=Math.min(Math.max(0,rt-last.tick),lim)/TICK_HZ;
          e.rx=last.x+last.vx*dt;e.ry=last.y+last.vy*dt;e.rr=last.r;e.extrap=dt>0;if(dt>0)extrap++;}
        else{let i=n-1;while(i>0&&s[i-1].tick>rt)i--;const a=s[i-1],b=s[i];
          if(!a||b.tick<=a.tick){e.rx=b.x;e.ry=b.y;e.rr=b.r;}
          else{const k=(rt-a.tick)/(b.tick-a.tick);e.rx=a.x+(b.x-a.x)*k;e.ry=a.y+(b.y-a.y)*k;e.rr=a.r+(b.r-a.r)*k;}e.extrap=false;}
        if(e.removed){if(e.reason===REMOVE.LEFT_AOI){e.gone=true;continue;}
          const age=rt-e.removed;
          if(age<0)e.alpha=1;   // o tempo de render ainda não chegou ao tick da remoção
          else if(VANISH.has(e.reason)){e.gone=true;if(!e.vanished){e.vanished=true;if(onVanish)onVanish(e);}}
          else{e.alpha=Math.max(0,1-age/FADE_REMOVED);if(e.alpha<=0)e.gone=true;}}
        else if(MOVING.has(e.kind)&&(last.vx*last.vx+last.vy*last.vy)>STILL_V2){const stale=rt-last.tick-STALE;e.alpha=stale>0?Math.max(0,1-stale/FADE_STALE):1;if(e.alpha<=0)e.gone=true;}
        else e.alpha=1;}
      it.extrap=extrap;
      for(const [id,e] of buffer.entities)if(e.gone)buffer.entities.delete(id);},
  };
  return it;}

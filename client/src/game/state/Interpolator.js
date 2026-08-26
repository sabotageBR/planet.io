// ── INTERPOLAÇÃO (entidades dos outros): render em tRender = tick estimado − atraso ──────
// Atraso base NET.INTERP_DELAY_MS, adaptativo até INTERP_MAX_MS quando o buffer seca 2× em 5 s
// (volta 0.5 tick a cada 10 s calmos). Lerp x/y/r entre as amostras que cercam tRender; além da
// última amostra extrapola com vx,vy até EXTRAP_MAX_MS. Sem update há 1 s (peças/ejetados/mísseis)
// → fade e remoção; removidas pelo servidor → fade curto (0,2 s) e remoção (LEFT_AOI: imediato).
import {KIND,NET,TICK_HZ,REMOVE} from "@planet/shared";

const T=TICK_HZ/1000,BASE=NET.INTERP_DELAY_MS*T,MAXD=NET.INTERP_MAX_MS*T,EXTRAP=NET.EXTRAP_MAX_MS*T,STALE=60,FADE_REMOVED=12,FADE_STALE=30;
const MOVING=new Set([KIND.PIECE,KIND.EJECT,KIND.MISSILE]);
export function createInterpolator(buffer,{isOwn=()=>false}={}){
  let delay=BASE,dryAt=[],calmSince=0;
  const it={delayTicks:BASE,renderTick:0,dry:0,extrap:0,
    get delayMs(){return delay/T;},
    update(now){
      const est=buffer.tickAt(now),rt=est-delay;it.renderTick=rt;it.delayTicks=delay;let extrap=0;
      const lastTick=buffer.lastTick;
      if(buffer.count&&rt>lastTick+1){if(!dryAt.length||now-dryAt[dryAt.length-1]>250){dryAt.push(now);it.dry++;}
        dryAt=dryAt.filter(t=>now-t<5000);if(dryAt.length>=2&&delay<MAXD){delay=Math.min(MAXD,delay+1.5);dryAt.length=0;calmSince=now;}}
      else if(delay>BASE&&now-calmSince>10000){delay=Math.max(BASE,delay-.5);calmSince=now;}
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
          const age=rt-e.removed;e.alpha=age<0?1:Math.max(0,1-age/FADE_REMOVED);if(e.alpha<=0)e.gone=true;}
        else if(MOVING.has(e.kind)){const stale=rt-last.tick-STALE;e.alpha=stale>0?Math.max(0,1-stale/FADE_STALE):1;if(e.alpha<=0)e.gone=true;}
        else e.alpha=1;}
      it.extrap=extrap;
      for(const [id,e] of buffer.entities)if(e.gone)buffer.entities.delete(id);},
  };
  return it;}

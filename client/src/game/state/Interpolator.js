// ── INTERPOLAÇÃO (entidades dos outros): render em tRender = tick estimado − atraso ──────
// Atraso base NET.INTERP_DELAY_MS, adaptativo pelo ATRASO DE CHEGADA dos snapshots (`alvoDeAtraso`): o
// 1º pacote que chega tarde demais para o atraso atual sobe o alvo até INTERP_MAX_MS, e um 2º em menos de
// 30 s libera INTERP_MAX2_MS; volta 1 tick a cada 10 s calmos. O atraso usado RAMPA por TEMPO, nunca salta.
// Lerp x/y/r entre as amostras que cercam tRender; além da última amostra extrapola com vx,vy até
// EXTRAP_MAX_MS. Sem update há 1 s → fade e remoção, mas SÓ para quem estava em movimento: o servidor não
// manda UPDATE de quem está parado (posição quantizada igual), então um fragmento parado sumiria da tela
// continuando comível no mundo. Entidades órfãs de verdade somem pelo RESYNC do servidor. Removidas pelo servidor,
// quando tRender alcança o tick da remoção: EATEN/SUCKED/POPPED/MERGED → somem NO MESMO FRAME e
// chamam onVanish(e) (efeito local); LEFT_AOI → imediato; EXPIRED/DESPAWN → fade curto (0,2 s).
import {KIND,NET,TICK_HZ,REMOVE} from "@warspace/shared";

const T=TICK_HZ/1000,BASE=NET.INTERP_DELAY_MS*T,MAXD=NET.INTERP_MAX_MS*T,MAXD2=(NET.INTERP_MAX2_MS||NET.INTERP_MAX_MS)*T,EXTRAP=NET.EXTRAP_MAX_MS*T,STALE=60,FADE_REMOVED=12,FADE_STALE=30,STILL_V2=64;   // |v| ≤ 8 px/s = parado
// ── O ATRASO SE ADAPTA AO PACOTE QUE ATRASOU, NÃO À SEGUNDA SECA ──────────────────────────────────────
// A regra era "o buffer secou 2× em 5 s → +1,5 tick". Medido em produção, o servidor tropeçava 1× a cada
// ~11 s: a regra NUNCA disparava, o atraso ficava nos 100 ms para sempre e TODO tropeço virava seca →
// extrapolação → a peça do adversário segue reto e VOLTA quando o snapshot chega. E numa rede móvel com
// jitter de 60–80 ms, o teto de 150 ms (3 snapshots) não cobria nem o caso normal.
// A conta é direta: o snapshot é enviado a cada `PASSO` ticks; para o tempo de render não ultrapassar o
// último snapshot, o atraso tem de cobrir um intervalo inteiro MAIS o quanto o próximo pode atrasar.
// `late` é esse atraso, medido pelo SnapshotBuffer contra a mediana do relógio (em ticks).
// ⚠️ Custa latência VISUAL dos OUTROS (até +100 ms enquanto a rede está ruim), nunca a do próprio planeta,
// que é predito. E volta sozinho: 1 tick a cada `CALMO_MS` sem um pacote que precise do valor atual.
const PASSO=3,MARGEM=1,SEGUNDO_MS=30000,CALMO_MS=10000,RAMPA_TPS=3;
/**
 * O alvo do atraso de interpolação, PURO. Chamado uma vez por snapshot (ou lote deles) com o pior `late`.
 * @param {{alvo:number,eventoAt:number,calmoDesde:number}} st estado (mutado e devolvido)
 * @param {{now:number,late:number}} e @returns {typeof st}
 */
export function alvoDeAtraso(st,{now,late}){
  const precisa=late+PASSO+MARGEM;
  if(precisa>st.alvo){
    // 2º pacote atrasado em menos de 30 s: a rede (ou o servidor) está ruim de verdade — libera o teto maior
    const teto=st.eventoAt>=0&&now-st.eventoAt<SEGUNDO_MS?MAXD2:MAXD;
    st.alvo=Math.max(st.alvo,Math.min(teto,precisa));st.eventoAt=now;st.calmoDesde=now;}
  else if(st.alvo>BASE&&now-st.calmoDesde>CALMO_MS){st.alvo=Math.max(BASE,st.alvo-1);st.calmoDesde=now;}
  return st;}
export const atrasoZero=()=>({alvo:BASE,eventoAt:-1,calmoDesde:0});
const MOVING=new Set([KIND.PIECE,KIND.EJECT,KIND.MISSILE]);
const VANISH=new Set([REMOVE.EATEN,REMOVE.SUCKED,REMOVE.POPPED,REMOVE.MERGED]);
export function createInterpolator(buffer,{isOwn=()=>false,onVanish=null}={}){
  let delay=BASE,st=atrasoZero(),dryAt=0,visto=0,lastNow=0;
  const it={delayTicks:BASE,renderTick:0,dry:0,extrap:0,
    get delayMs(){return delay/T;},
    get alvoMs(){return st.alvo/T;},
    update(now){
      // dt do frame (teto de .25 s, o mesmo do laço): o relógio e a rampa do atraso andam por TEMPO
      const dtS=lastNow?Math.min(.25,Math.max(0,(now-lastNow)/1000)):1/60;lastNow=now;
      buffer.slew(dtS);const est=buffer.tickAt(now),rt=est-delay;it.renderTick=rt;it.delayTicks=delay;let extrap=0;
      const lastTick=buffer.lastTick;
      if(buffer.count!==visto){visto=buffer.count;st=alvoDeAtraso(st,{now,late:buffer.tomaLate?buffer.tomaLate():0});}
      else if(st.alvo>BASE)st=alvoDeAtraso(st,{now,late:-1e9});   // sem pacote novo: só a volta ao normal anda
      if(buffer.count&&rt>lastTick+1&&now-dryAt>250){dryAt=now;it.dry++;}   // contador para o ?stats: quantas vezes secou
      const dd=st.alvo-delay,passo=RAMPA_TPS*dtS;if(dd>passo)delay+=passo;else if(dd<-passo)delay-=passo;else delay=st.alvo;
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
    /** Sala nova / resume: o atraso volta à base (o estado da rede anterior não é desta conexão). */
    reset(){delay=BASE;st=atrasoZero();dryAt=0;visto=0;lastNow=0;},
  };
  return it;}

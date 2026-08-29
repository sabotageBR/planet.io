// ── KILL FEED: os MARCOS da rodada e o orçamento do que sai ──────────────────
// Módulo puro, no molde de `rooms/botChat.js`: não conhece HTTP nem sala. A Room chama e difunde.
//
// Abates NÃO passam por aqui — eles vêm prontos de `Sim._feedMorte` e nunca são barrados por cooldown
// (o abate É o assunto do feed). O que este arquivo controla são as linhas de SISTEMA: trocou de líder,
// BIG CRUNCH chegando, a zona virou. Essas competem com o jogo pela atenção e, sem orçamento, dois
// gigantes empatados enchem a tela a 2 Hz.
// @ts-check
import {FEED} from '@warspace/shared/constants.js';

/**
 * Estado dos marcos de uma sala. `leadStep`/`crunchStep` são funções de estado puro: recebem o que a
 * Room já calculou (o placar do tick e os segundos restantes) e devolvem a linha, ou null.
 */
export function createFeed(){
  let lider=-1,cand=-1,candDesde=-1,anunciadoEm=-1e9,crunchIdx=0;
  return{
    /** Reinicia entre rodadas (a sala é reaproveitada pelo RoomManager). */
    reset(){lider=-1;cand=-1;candDesde=-1;anunciadoEm=-1e9;crunchIdx=0;},
    get leader(){return lider;},
    /**
     * Trocou de líder? Três condições, e as três existem por um motivo medido:
     *  1. o candidato tem que SEGURAR o topo por LEAD_HOLD_TICKS — senão dois planetas empatados
     *     alternam a cada amostra de 2 Hz e o feed vira estroboscópio;
     *  2. tem que passar o líder anterior por LEAD_MARGIN de massa — encostar não é ultrapassar;
     *  3. a sala não pode ter anunciado nos últimos LEAD_CD_TICKS.
     * @param {{slot:number,mass:number}[]} rows placar do tick (já cacheado pela Sim)
     */
    leadStep(rows,tick){
      const topo=rows.length?rows[0]:null;
      if(!topo){cand=-1;candDesde=-1;return null;}
      if(lider<0){lider=topo.slot;cand=-1;candDesde=-1;return null;}   // primeiro líder não é notícia
      if(topo.slot===lider){cand=-1;candDesde=-1;return null;}
      const ant=rows.find(r=>r.slot===lider);
      if(ant&&topo.mass<ant.mass*(1+FEED.LEAD_MARGIN))return null;     // encostou, não passou
      if(topo.slot!==cand){cand=topo.slot;candDesde=tick;return null;}
      if(tick-candDesde<FEED.LEAD_HOLD_TICKS)return null;
      if(tick-anunciadoEm<FEED.LEAD_CD_TICKS){lider=topo.slot;cand=-1;return null;}   // troca vale, anúncio não
      lider=topo.slot;cand=-1;candDesde=-1;anunciadoEm=tick;
      return{k:'sys',a:topo.slot,b:-1,how:'lead',by:null};},
    /**
     * BIG CRUNCH em N. Um aviso por limiar, na ordem de CRUNCH_AT_S — e nunca de novo, porque o índice
     * só anda para frente.
     * @param {number} restaS segundos que faltam
     */
    crunchStep(restaS){
      if(crunchIdx>=FEED.CRUNCH_AT_S.length)return null;
      const n=FEED.CRUNCH_AT_S[crunchIdx];
      if(restaS>n)return null;
      crunchIdx++;
      return{k:'sys',a:-1,b:-1,how:'crunch',by:null,n};},
  };}

/**
 * O que sai NESTE lote. A fila é do instante e tem teto: uma supernova ou o fecho final do gás mata muita
 * gente no MESMO tick, e despejar tudo transformaria o canto da tela numa parede. Os ABATES têm
 * preferência sobre as linhas de sistema, e o que sobra do teto é descartado — as mais VELHAS primeiro,
 * porque uma linha de 3 s atrás já perdeu o assunto.
 * @param {{k:string}[]} fila esvaziada pela chamada
 */
export function drenaFeed(fila){
  if(!fila.length)return null;
  let out=fila;
  if(fila.length>FEED.MAX_PER_FLUSH){
    const abates=fila.filter(x=>x.k!=='sys'),sys=fila.filter(x=>x.k==='sys');
    out=abates.slice(-FEED.MAX_PER_FLUSH);
    if(out.length<FEED.MAX_PER_FLUSH)out=out.concat(sys.slice(-(FEED.MAX_PER_FLUSH-out.length)));}
  fila.length=0;
  return out.length?out:null;}

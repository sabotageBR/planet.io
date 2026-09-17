// ── CGROUP: a COTA de CPU do contêiner e quantas vezes o kernel o congelou por causa dela ──────
// ⚠️ ESTE É O NÚMERO QUE FALTOU POR MESES. O engasgo do jogo era o CFS: `limits.cpu` vira uma cota de
// CPU-tempo por período de 100 ms, e o processo Node — que tem 11 threads, não uma — a estourava em rajadas
// (scavenge PARALELO, marcação concorrente, JIT) usando em média 0,3 core. Estourou, o kernel CONGELA o
// cgroup inteiro, thread principal incluída, até a virada do período. Medido em produção: 1 congelamento
// a cada ~11 s numa sala de 5 jogadores, com `tick.max` de 8 ms — ou seja, invisível para toda métrica
// que o servidor tinha, porque o processo não está LENTO, está PARADO. Quem enxergava era só o cAdvisor
// (`container_cpu_cfs_throttled_periods_total`), que ninguém consultava.
// ⚠️ PURO, e separado do leitor: o formato muda entre cgroup v1 (docker 20 deste cluster) e v2, e é o
// parser que tem teste — o leitor só sabe onde os arquivos moram.
// ⚠️ SEM COTA OS CONTADORES NÃO ANDAM (o timer de banda do CFS nem é armado): `cota:null` com
// `periods` parado é o estado SAUDÁVEL, não um leitor quebrado.
// @ts-check
import {readFile} from 'node:fs/promises';

/**
 * `cpu.stat` → contadores. v1: `nr_periods`/`nr_throttled`/`throttled_time` (ns). v2: os mesmos dois mais
 * `throttled_usec`. ⚠️ `throttled_time` é somado POR RUNQUEUE (por CPU): com 5 threads congeladas por 20 ms
 * ele anda 100 ms. Serve para ver que ANDOU, não para ler duração de parada — quem mede a parada é o
 * classificador de turno do `metrics.js`.
 * @param {string} txt @returns {{periods:number,throttled:number,throttledMs:number}|null}
 */
export function leCpuStat(txt){
  /** @type {Record<string,number>} */const o={};
  for(const ln of String(txt||'').split('\n')){const p=ln.trim().split(/\s+/);if(p.length>=2&&p[0]){const v=Number(p[1]);if(Number.isFinite(v))o[p[0]]=v;}}
  if(o.nr_periods==null&&o.nr_throttled==null)return null;
  const ms=o.throttled_usec!=null?o.throttled_usec/1000:o.throttled_time!=null?o.throttled_time/1e6:0;
  return{periods:o.nr_periods||0,throttled:o.nr_throttled||0,throttledMs:Math.round(ms)};}

/**
 * A cota em CORES, ou null quando não há. v1: `cpu.cfs_quota_us` (−1 = sem cota) sobre `cpu.cfs_period_us`.
 * v2: `cpu.max` = "max 100000" (sem cota) | "200000 100000".
 * @param {{quota?:string|null,period?:string|null,max?:string|null}} a @returns {number|null}
 */
export function leCota({quota=null,period=null,max=null}={}){
  if(max!=null){const p=String(max).trim().split(/\s+/);if(p[0]==='max'||!p[0])return null;const q=Number(p[0]),per=Number(p[1])||100000;return q>0?Math.round(q/per*1000)/1000:null;}
  const q=Number(String(quota??'').trim()),per=Number(String(period??'').trim())||100000;
  return Number.isFinite(q)&&q>0?Math.round(q/per*1000)/1000:null;}

const V1='/sys/fs/cgroup/cpu',V2='/sys/fs/cgroup';
const le=async p=>{try{return await readFile(p,'utf8');}catch{return null;}};
/**
 * Leitor assíncrono (nunca no caminho do tick): acha o layout na 1ª chamada e desiste para sempre se não
 * houver nenhum — máquina de dev, macOS, contêiner sem o cgroup montado.
 * @param {{ler?:(p:string)=>Promise<string|null>}} [o]
 */
export function criaLeitorCgroup({ler=le}={}){
  /** @type {'v1'|'v2'|'nenhum'|null} */let modo=null;
  return{
    /** @returns {Promise<{cota:number|null,periods:number,throttled:number,throttledMs:number}|null>} */
    async le(){
      if(modo==='nenhum')return null;
      if(modo===null||modo==='v1'){const st=leCpuStat(await ler(`${V1}/cpu.stat`)||'');
        if(st){modo='v1';return{cota:leCota({quota:await ler(`${V1}/cpu.cfs_quota_us`),period:await ler(`${V1}/cpu.cfs_period_us`)}),...st};}}
      if(modo===null||modo==='v2'){const st=leCpuStat(await ler(`${V2}/cpu.stat`)||'');
        if(st){modo='v2';return{cota:leCota({max:await ler(`${V2}/cpu.max`)??'max'}),...st};}}
      modo='nenhum';return null;},
    get modo(){return modo;},
  };}

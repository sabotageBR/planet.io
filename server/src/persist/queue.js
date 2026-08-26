// ── Fila em memória: concorrência 2, backoff 1 s→5 min, 8 tentativas, máx. 2000 ──
// @ts-check
import {isDbUnavailable} from '../db/pool.js';
export class QueueFull extends Error{constructor(){super('fila de persistência cheia');this.code='QUEUE_FULL';}}
export class QueueClosed extends Error{constructor(){super('fila encerrada (shutdown)');this.code='QUEUE_CLOSED';}}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/**
 * @param {{log:any,concurrency?:number,max?:number,tries?:number,baseMs?:number,maxMs?:number,retriable?:(e:any)=>boolean,shouldWait?:()=>boolean}} o
 */
export function createQueue({log,concurrency=2,max=2000,tries=8,baseMs=1000,maxMs=300e3,retriable=isDbUnavailable}){
  const items=[];let running=0,closed=false,done=0,failed=0,dropped=0;const waiters=new Set();
  const delayFor=attempt=>Math.min(maxMs,baseMs*2**(attempt-1));
  const notify=()=>{if(running===0&&items.length===0)for(const w of waiters)w();};
  async function run(item){
    running++;
    try{
      for(let attempt=1;;attempt++){
        try{const r=await item.fn();done++;item.resolve(r);return;}
        catch(e){
          if(!retriable(e)||attempt>=tries||closed){failed++;log.warn(`fila: ${item.name} falhou definitivamente (tentativa ${attempt}): ${e.message}`);item.reject(e);return;}
          const d=delayFor(attempt);log.debug(`fila: ${item.name} tentativa ${attempt} falhou (${e.message}); repete em ${d} ms`);
          await Promise.race([sleep(d),item.wake]);
        }
      }
    }finally{running--;pump();notify();}
  }
  function pump(){while(running<concurrency&&items.length)run(items.shift());}
  /** enfileira fn (async) → Promise do resultado após sucesso; rejeita ao esgotar tentativas/erro fatal */
  function push(name,fn){
    return new Promise((resolve,reject)=>{
      if(closed)return reject(new QueueClosed());
      if(items.length>=max){dropped++;log.warn(`fila cheia (${max}); descartando ${name}`);return reject(new QueueFull());}
      let wakeFn;const wake=new Promise(r=>{wakeFn=r;});
      items.push({name,fn,resolve,reject,wake,wakeFn});pump();
    });
  }
  /** para de aceitar e espera esvaziar até timeoutMs (retries pendentes são acordados) */
  async function drain(timeoutMs=10000){
    closed=true;
    if(running===0&&items.length===0)return true;
    const ok=await new Promise(res=>{const t=setTimeout(()=>{waiters.delete(w);res(false);},timeoutMs);const w=()=>{clearTimeout(t);waiters.delete(w);res(true);};waiters.add(w);});
    if(!ok){log.warn(`fila: drenagem expirou com ${items.length} pendente(s) e ${running} em execução`);for(const it of items.splice(0))it.reject(new QueueClosed());}
    return ok;
  }
  return{push,drain,get size(){return items.length+running;},get pending(){return items.length;},get running(){return running;},get closed(){return closed;},stats:()=>({queued:items.length,running,done,failed,dropped})};
}

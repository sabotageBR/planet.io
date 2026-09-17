// ── /api/ranking (cache 10 s por pod) ──────────────────────────────────────────
// @ts-check
import {err} from './router.js';
import {PERIODS,BY} from '../repos/ranking.js';
import {isCountry} from '@warspace/shared/countries.js';
const CACHE_MS=10e3,CACHE_LIMITE=256;
/**
 * Cache com TTL que NÃO CRESCE PARA SEMPRE. O de antes era um `Map` cuja chave leva o `userId` (a posição
 * de cada um) e do qual nada saía nunca: uma entrada por jogador distinto que abriu o ranking desde o boot
 * do pod — vazamento lento num processo de 512 Mi cujo GC é justamente o que se quer quieto.
 * ⚠️ Guarda a PROMESSA, não o valor: dez pedidos no mesmo instante de cache vencido viram UMA consulta (o
 * pool do banco tem 5 conexões). Promessa rejeitada sai do cache na hora — erro não se cacheia.
 * @param {{ttlMs:number,limite?:number,agora?:()=>number}} o
 */
export function criaCacheTtl({ttlMs,limite=CACHE_LIMITE,agora=Date.now}){
  /** @type {Map<string,{p:Promise<any>,until:number}>} */const m=new Map();
  return{
    get(key,fn){const now=agora(),c=m.get(key);if(c&&c.until>now)return c.p;
      const p=Promise.resolve().then(fn);m.set(key,{p,until:now+ttlMs});p.catch(()=>{if(m.get(key)&&m.get(key).p===p)m.delete(key);});
      if(m.size>limite){for(const [k,v] of m)if(v.until<=now)m.delete(k);if(m.size>limite*4)m.clear();}
      return p;},
    clear(){m.clear();},get size(){return m.size;}};}
export function mountRanking(router,{ranking,optionalUser}){
  const cache=criaCacheTtl({ttlMs:CACHE_MS});
  const cached=(key,fn)=>cache.get(key,fn);
  router.add('GET',/^\/api\/ranking$/,async ctx=>{
    const period=ctx.query.get('period')||'all',by=ctx.query.get('by')||'score';
    if(!PERIODS[period])throw err(400,'bad_period','period deve ser all|week|day');
    if(!BY[by])throw err(400,'bad_by',`by deve ser ${Object.keys(BY).join('|')}`);
    const cru=ctx.query.get('country');
    if(cru&&!isCountry(String(cru).toUpperCase()))throw err(400,'bad_country','country deve ser um código ISO de 2 letras');
    const country=cru?String(cru).toUpperCase():null;
    const limit=Math.min(100,Math.max(1,Number(ctx.query.get('limit'))||50));
    const me=await optionalUser(ctx);
    // ⚠️ O PAÍS entra na chave do cache. Sem ele, a primeira resposta regional que passasse por aqui seria
    // servida ao mundo inteiro por 10 s — e o Brasil veria o ranking do Japão sem nada na tela indicando.
    const k=`${period}:${by}:${country||'-'}`;
    const rows=await cached(`${k}:${limit}`,()=>ranking.top({period,by,limit,country}));
    const mine=me?await cached(`${k}:u${me.id}`,()=>ranking.rankOf({period,by,userId:me.id,country})):null;
    return{period,by,country,rows,me:mine};
  });
  return{clear:()=>cache.clear()};
}

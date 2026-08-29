// ── /api/ranking (cache 10 s por pod) ──────────────────────────────────────────
// @ts-check
import {err} from './router.js';
import {PERIODS,BY} from '../repos/ranking.js';
import {isCountry} from '@warspace/shared/countries.js';
const CACHE_MS=10e3;
export function mountRanking(router,{ranking,optionalUser}){
  const cache=new Map();
  const cached=async(key,fn)=>{const now=Date.now();const c=cache.get(key);if(c&&c.until>now)return c.value;const value=await fn();cache.set(key,{value,until:now+CACHE_MS});return value;};
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

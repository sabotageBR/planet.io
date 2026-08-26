// ── /api/ranking (cache 10 s por pod) ──────────────────────────────────────────
// @ts-check
import {err} from './router.js';
import {PERIODS,BY} from '../repos/ranking.js';
const CACHE_MS=10e3;
export function mountRanking(router,{ranking,optionalUser}){
  const cache=new Map();
  const cached=async(key,fn)=>{const now=Date.now();const c=cache.get(key);if(c&&c.until>now)return c.value;const value=await fn();cache.set(key,{value,until:now+CACHE_MS});return value;};
  router.add('GET',/^\/api\/ranking$/,async ctx=>{
    const period=ctx.query.get('period')||'all',by=ctx.query.get('by')||'score';
    if(!PERIODS[period])throw err(400,'bad_period','period deve ser all|week|day');
    if(!BY[by])throw err(400,'bad_by','by deve ser score|mass|kills|total');
    const limit=Math.min(100,Math.max(1,Number(ctx.query.get('limit'))||50));
    const me=await optionalUser(ctx);
    const rows=await cached(`${period}:${by}:${limit}`,()=>ranking.top({period,by,limit}));
    const mine=me?await cached(`${period}:${by}:u${me.id}`,()=>ranking.rankOf({period,by,userId:me.id})):null;
    return{period,by,rows,me:mine};
  });
  return{clear:()=>cache.clear()};
}

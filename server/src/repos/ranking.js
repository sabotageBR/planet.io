// ── REPO ranking (all → user_stats; week/day → views) ──────────────────────────
// @ts-check
export const PERIODS={all:'user_stats',week:'v_ranking_week',day:'v_ranking_day'};
export const BY={score:'best_score',mass:'best_mass',kills:'kills',total:'total_score'};
export function createRanking(db){
  /** @returns {Promise<Array<{rank:number,userId:number,nick:string,registered:boolean,value:number}>>} */
  async function top({period='all',by='score',limit=50}={}){
    const src=PERIODS[period],col=BY[by];if(!src||!col)throw new Error('ranking: período/critério inválido');
    const r=await db.query(`SELECT s.user_id,u.nick,u.kind,s.${col} AS value FROM ${src} s JOIN users u ON u.id=s.user_id WHERE s.${col}>0 ORDER BY s.${col} DESC,s.user_id ASC LIMIT $1`,[limit]);
    return r.rows.map((x,i)=>({rank:i+1,userId:Number(x.user_id),nick:x.nick,registered:x.kind==='registered',value:Number(x.value)}));
  }
  /** posição do usuário (1 + quantos têm valor maior) ou null se não pontuou */
  async function rankOf({period='all',by='score',userId}){
    const src=PERIODS[period],col=BY[by];if(!src||!col)throw new Error('ranking: período/critério inválido');
    const r=await db.query(`SELECT s.${col} AS value,(SELECT count(*) FROM ${src} o WHERE o.${col}>s.${col})::int+1 AS rank FROM ${src} s WHERE s.user_id=$1 AND s.${col}>0`,[userId]);
    return r.rows[0]?{rank:r.rows[0].rank,value:Number(r.rows[0].value)}:null;
  }
  return{top,rankOf};
}

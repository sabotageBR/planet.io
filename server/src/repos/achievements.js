// ── REPO user_achievements ─────────────────────────────────────────────────────
// @ts-check
export function createAchievements(db){
  const keysFor=(userId,c=db)=>c.query(`SELECT key FROM user_achievements WHERE user_id=$1 ORDER BY unlocked_at`,[userId]).then(r=>r.rows.map(x=>x.key));
  /** insere as chaves; devolve só as realmente novas */
  async function unlock(c,userId,keys,matchId=null){
    if(!keys.length)return[];
    const r=await c.query(`INSERT INTO user_achievements(user_id,key,match_id) SELECT $1,k,$3 FROM unnest($2::text[]) AS k ON CONFLICT DO NOTHING RETURNING key`,[userId,keys,matchId]);
    return r.rows.map(x=>x.key);
  }
  return{keysFor,unlock};
}

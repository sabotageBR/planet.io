// ── REPO skins / user_skins ────────────────────────────────────────────────────
// @ts-check
export function createSkins(db){
  const byId=(id,c=db)=>c.query(`SELECT * FROM skins WHERE id=$1 AND active`,[id]).then(r=>r.rows[0]||null);
  const ownedIds=(userId,c=db)=>c.query(`SELECT skin_id FROM user_skins WHERE user_id=$1 ORDER BY skin_id`,[userId]).then(r=>r.rows.map(x=>x.skin_id));
  const has=(userId,skinId,c=db)=>c.query(`SELECT 1 FROM user_skins WHERE user_id=$1 AND skin_id=$2`,[userId,skinId]).then(r=>r.rows.length>0);
  /** concede; devolve true se era nova */
  const grant=(c,{userId,skinId,source,ledgerId=null})=>c.query(`INSERT INTO user_skins(user_id,skin_id,source,ledger_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING skin_id`,[userId,skinId,source,ledgerId]).then(r=>r.rows.length>0);
  /** concede várias (conquistas); devolve ids realmente novos */
  async function grantMany(c,userId,skinIds,source){const out=[];for(const id of skinIds)if(await grant(c,{userId,skinId:id,source}))out.push(id);return out;}
  return{byId,ownedIds,has,grant,grantMany};
}

// ── REPO users (linhas cruas; toPublic para o fio) ─────────────────────────────
// @ts-check
export const toPublic=u=>u&&({id:Number(u.id),nick:u.nick,kind:u.kind,coins:u.coins,equippedSkin:u.equipped_skin_id,createdAt:u.created_at,...(u.email?{email:u.email}:{})});
export function createUsers(db){
  const byId=(id,c=db)=>c.query(`SELECT * FROM users WHERE id=$1`,[id]).then(r=>r.rows[0]||null);
  /** login = nick ou email de usuário registrado (case-insensitive) */
  const byLogin=login=>db.query(`SELECT * FROM users WHERE kind='registered' AND (lower(nick)=lower($1) OR lower(email)=lower($1)) LIMIT 1`,[login]).then(r=>r.rows[0]||null);
  /** cria guest (dentro de transação): users + user_skins(0) — moedas de boas-vindas ficam com o ledger */
  const insertGuest=(c,nick)=>c.query(`INSERT INTO users(kind,nick) VALUES('guest',$1) RETURNING *`,[nick]).then(r=>r.rows[0]);
  const setNick=(id,nick,c=db)=>c.query(`UPDATE users SET nick=$2 WHERE id=$1 RETURNING *`,[id,nick]).then(r=>r.rows[0]||null);
  const claim=(id,{passwordHash,email},c=db)=>c.query(`UPDATE users SET kind='registered',password_hash=$2,email=$3 WHERE id=$1 AND kind='guest' RETURNING *`,[id,passwordHash,email||null]).then(r=>r.rows[0]||null);
  /** merge raso de prefs (jsonb ||) */
  const mergePrefs=(id,prefs,c=db)=>c.query(`UPDATE users SET prefs=prefs||$2::jsonb WHERE id=$1 RETURNING prefs`,[id,JSON.stringify(prefs)]).then(r=>r.rows[0]?r.rows[0].prefs:null);
  const setEquipped=(id,skinId,c=db)=>c.query(`UPDATE users SET equipped_skin_id=$2 WHERE id=$1 RETURNING equipped_skin_id`,[id,skinId]).then(r=>r.rows[0]?r.rows[0].equipped_skin_id:null);
  const touchSeen=id=>db.query(`UPDATE users SET last_seen_at=now() WHERE id=$1`,[id]);
  /** guests órfãos: sem token válido e sem atividade há 30 dias (cascata apaga matches/ledger) */
  const purgeOrphanGuests=(c=db)=>c.query(`DELETE FROM users u WHERE u.kind='guest' AND u.last_seen_at<now()-interval '30 days'
    AND NOT EXISTS(SELECT 1 FROM auth_tokens t WHERE t.user_id=u.id AND t.revoked_at IS NULL AND t.expires_at>now())`).then(r=>r.rowCount);
  return{byId,byLogin,insertGuest,setNick,claim,mergePrefs,setEquipped,touchSeen,purgeOrphanGuests};
}

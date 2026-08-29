// ── REPO user_identities (login externo; hoje só Google) ───────────────────────
// @ts-check
export function createIdentities(db){
  const find=(provider,subject,c=db)=>c.query(
    `SELECT i.*,u.id AS uid FROM user_identities i JOIN users u ON u.id=i.user_id WHERE i.provider=$1 AND i.subject=$2`,
    [provider,subject]).then(r=>r.rows[0]||null);
  const link=(c,{userId,provider,subject,email})=>c.query(
    `INSERT INTO user_identities(user_id,provider,subject,email,last_login_at) VALUES($1,$2,$3,$4,now())
     ON CONFLICT (provider,subject) DO UPDATE SET email=EXCLUDED.email,last_login_at=now() RETURNING *`,
    [userId,provider,subject,email||null]).then(r=>r.rows[0]);
  const touch=(provider,subject,c=db)=>c.query(`UPDATE user_identities SET last_login_at=now() WHERE provider=$1 AND subject=$2`,[provider,subject]);
  return{find,link,touch};
}

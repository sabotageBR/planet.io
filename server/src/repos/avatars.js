// ── REPO user_avatars (os BYTES da skin "Retrato") ─────────────────────────────
// Tabela separada de `users` de propósito: `users` é lido com SELECT * em byId/byLogin e no RESOLVE_SQL do
// token — ou seja, em todo join de WS e toda chamada autenticada. Um bytea ali custaria KB por request
// para uma foto que quase ninguém tem. Em `users` fica só `avatar_hash`, o ponteiro.
// @ts-check
export function createAvatars(db){
  /** Metadados sem os bytes: é o que basta para saber se existe e qual é o hash. */
  const metaOf=(userId,c=db)=>c.query(`SELECT user_id,mime,w,h,size,hash,status,updated_at FROM user_avatars WHERE user_id=$1`,[userId]).then(r=>r.rows[0]||null);
  /** Com os bytes — só na rota de leitura, nunca no caminho de join. `hidden` some para todo mundo. */
  const bytesOf=(userId,c=db)=>c.query(`SELECT mime,bytes,hash FROM user_avatars WHERE user_id=$1 AND status='ok'`,[userId]).then(r=>r.rows[0]||null);
  /** Sobe/substitui e devolve o hash novo. Uma foto por usuário: trocar é UPDATE, não histórico. */
  const put=(c,{userId,mime,bytes,w,h,hash})=>c.query(
    `INSERT INTO user_avatars(user_id,mime,bytes,w,h,size,hash) VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (user_id) DO UPDATE SET mime=EXCLUDED.mime,bytes=EXCLUDED.bytes,w=EXCLUDED.w,h=EXCLUDED.h,
       size=EXCLUDED.size,hash=EXCLUDED.hash,status='ok',updated_at=now() RETURNING hash`,
    [userId,mime,bytes,w,h,bytes.length,hash]).then(r=>r.rows[0].hash);
  const remove=(c,userId)=>c.query(`DELETE FROM user_avatars WHERE user_id=$1`,[userId]);
  /** Moderação: esconder é um UPDATE e a leitura passa a 404. Reversível, ao contrário de apagar. */
  const setStatus=(userId,status,c=db)=>c.query(`UPDATE user_avatars SET status=$2,updated_at=now() WHERE user_id=$1`,[userId,status]);
  return{metaOf,bytesOf,put,remove,setStatus};
}

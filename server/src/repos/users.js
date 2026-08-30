// ── REPO users (linhas cruas; toPublic para o fio) ─────────────────────────────
// @ts-check
// `name` é o nome da CONTA (o que veio do Google), separado do `nick`, que é o nome dentro do jogo e o
// jogador troca quando quer. O ranking mostra o primeiro; o placar da partida mostra o segundo.
export const toPublic=u=>u&&({id:Number(u.id),nick:u.nick,name:u.display_name||null,kind:u.kind,coins:u.coins,equippedSkin:u.equipped_skin_id,
  country:u.country||null,avatar:u.avatar_hash||null,createdAt:u.created_at,...(u.email?{email:u.email}:{})});
export function createUsers(db){
  const byId=(id,c=db)=>c.query(`SELECT * FROM users WHERE id=$1`,[id]).then(r=>r.rows[0]||null);
  /** login = nick ou email de usuário registrado (case-insensitive) */
  const byLogin=login=>db.query(`SELECT * FROM users WHERE kind='registered' AND (lower(nick)=lower($1) OR lower(email)=lower($1)) LIMIT 1`,[login]).then(r=>r.rows[0]||null);
  /** e-mail exato (case-insensitive). Existe só para o login com Google: é o que deixa a rota casar a
   *  identidade com uma conta que JÁ tem esse e-mail em vez de esbarrar no UNIQUE `users_email_uq`. */
  const byEmail=email=>db.query(`SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1`,[email]).then(r=>r.rows[0]||null);
  /** cria guest (dentro de transação): users + user_skins(0) — moedas de boas-vindas ficam com o ledger */
  const insertGuest=(c,nick)=>c.query(`INSERT INTO users(kind,nick) VALUES('guest',$1) RETURNING *`,[nick]).then(r=>r.rows[0]);
  const setNick=(id,nick,c=db)=>c.query(`UPDATE users SET nick=$2 WHERE id=$1 RETURNING *`,[id,nick]).then(r=>r.rows[0]||null);
  const claim=(id,{passwordHash,email},c=db)=>c.query(`UPDATE users SET kind='registered',password_hash=$2,email=$3 WHERE id=$1 AND kind='guest' RETURNING *`,[id,passwordHash,email||null]).then(r=>r.rows[0]||null);
  /** merge raso de prefs (jsonb ||) */
  const mergePrefs=(id,prefs,c=db)=>c.query(`UPDATE users SET prefs=prefs||$2::jsonb WHERE id=$1 RETURNING prefs`,[id,JSON.stringify(prefs)]).then(r=>r.rows[0]?r.rows[0].prefs:null);
  const setEquipped=(id,skinId,c=db)=>c.query(`UPDATE users SET equipped_skin_id=$2 WHERE id=$1 RETURNING equipped_skin_id`,[id,skinId]).then(r=>r.rows[0]?r.rows[0].equipped_skin_id:null);
  const touchSeen=id=>db.query(`UPDATE users SET last_seen_at=now() WHERE id=$1`,[id]);
  /** País do ranking regional. `null` limpa (o jogador pode sair do ranking do país dele). */
  const setCountry=(id,country,c=db)=>c.query(`UPDATE users SET country=$2 WHERE id=$1 RETURNING *`,[id,country||null]).then(r=>r.rows[0]||null);
  /** Ponteiro do avatar em `users` (os BYTES moram em user_avatars — ver a migração 0005). */
  const setAvatarHash=(id,hash,c=db)=>c.query(`UPDATE users SET avatar_hash=$2 WHERE id=$1`,[id,hash||null]);
  /** guests órfãos: sem token válido e sem atividade há 30 dias (cascata apaga matches/ledger) */
  const purgeOrphanGuests=(c=db)=>c.query(`DELETE FROM users u WHERE u.kind='guest' AND u.last_seen_at<now()-interval '30 days'
    AND NOT EXISTS(SELECT 1 FROM auth_tokens t WHERE t.user_id=u.id AND t.revoked_at IS NULL AND t.expires_at>now())`).then(r=>r.rowCount);
  // ── PAINEL /admin ────────────────────────────────────────────────────────
  /**
   * ⚠️ ALLOWLIST EXPLÍCITA de colunas — nunca `...u`. É por um spread distraído aqui que `password_hash`
   * vaza. O e-mail entra (o admin precisa dele para achar a conta), mas a lista de usuários NÃO o
   * devolve: `search` seleciona só o que esta função sabe ler.
   */
  const toAdmin=u=>u&&({id:Number(u.id),nick:u.nick,name:u.display_name||null,kind:u.kind,email:u.email||null,
    coins:u.coins,country:u.country||null,avatar:u.avatar_hash||null,isAdmin:!!u.is_admin,
    bannedUntil:u.banned_until||null,banReason:u.ban_reason||null,
    createdAt:u.created_at,lastSeenAt:u.last_seen_at,
    xp:Number(u.xp||0),games:u.games|0,kills:u.kills|0,deaths:u.deaths|0});
  /**
   * Busca paginada por KEYSET (`id < before`), não OFFSET: a tabela cresce e o offset degrada a cada
   * página. `q` casa nick, nome e e-mail; id exato tem atalho.
   */
  async function search({q=null,kind=null,banned=null,limit=50,before=null}={}){
    const w=[],p=[];
    if(q){const n=String(q).trim();
      if(/^\d+$/.test(n)){p.push(Number(n));w.push(`u.id=$${p.length}`);}
      else{p.push(`%${n.toLowerCase()}%`);w.push(`(lower(u.nick) LIKE $${p.length} OR lower(u.display_name) LIKE $${p.length} OR lower(u.email) LIKE $${p.length})`);}}
    if(kind==='guest'||kind==='registered'){p.push(kind);w.push(`u.kind=$${p.length}`);}
    if(banned===true)w.push(`u.banned_until IS NOT NULL AND u.banned_until>now()`);
    else if(banned===false)w.push(`(u.banned_until IS NULL OR u.banned_until<=now())`);
    if(before){p.push(Number(before));w.push(`u.id<$${p.length}`);}
    p.push(Math.max(1,Math.min(100,limit|0)));
    const where=w.length?`WHERE ${w.join(' AND ')}`:'';
    const {rows}=await db.query(`SELECT u.*,COALESCE(st.xp,0) AS xp,COALESCE(st.games,0) AS games,
        COALESCE(st.kills,0) AS kills,COALESCE(st.deaths,0) AS deaths
      FROM users u LEFT JOIN user_stats st ON st.user_id=u.id ${where} ORDER BY u.id DESC LIMIT $${p.length}`,p);
    return rows.map(toAdmin);}
  /** Uma conta com tudo o que o painel mostra no detalhe. */
  const adminById=id=>db.query(`SELECT u.*,COALESCE(st.xp,0) AS xp,COALESCE(st.games,0) AS games,
      COALESCE(st.kills,0) AS kills,COALESCE(st.deaths,0) AS deaths
    FROM users u LEFT JOIN user_stats st ON st.user_id=u.id WHERE u.id=$1`,[id]).then(r=>toAdmin(r.rows[0]));
  /** `days<=0` desbane. A data responde "está banido?" e "até quando?" sem uma coluna booleana à parte. */
  const setBan=(id,days,reason,c=db)=>c.query(
    days>0?`UPDATE users SET banned_until=now()+($2||' days')::interval,ban_reason=$3 WHERE id=$1 RETURNING *`
          :`UPDATE users SET banned_until=NULL,ban_reason=NULL WHERE id=$1 RETURNING *`,
    days>0?[id,String(Math.min(3650,days|0)),String(reason||'').slice(0,300)||null]:[id]).then(r=>toAdmin(r.rows[0]));
  const setAdmin=(id,on,c=db)=>c.query(`UPDATE users SET is_admin=$2 WHERE id=$1 RETURNING *`,[id,!!on]).then(r=>toAdmin(r.rows[0]));
  /** Quantos administradores existem — o painel usa para não deixar rebaixar o último. */
  const adminCount=(c=db)=>c.query(`SELECT count(*)::int AS n FROM users WHERE is_admin`).then(r=>r.rows[0].n);
  /** Promove por e-mail (env ADMIN_EMAILS, no boot). SÓ PROMOVE: rebaixar por ConfigMap tranca todo mundo para fora. */
  const promoteByEmails=emails=>!emails||!emails.length?Promise.resolve(0):
    db.query(`UPDATE users SET is_admin=true WHERE kind='registered' AND is_admin=false AND lower(email)=ANY($1::text[])`,
      [emails.map(e=>String(e).trim().toLowerCase()).filter(Boolean)]).then(r=>r.rowCount);
  return{byId,byLogin,byEmail,insertGuest,setNick,claim,mergePrefs,setEquipped,setCountry,setAvatarHash,touchSeen,purgeOrphanGuests,
    toAdmin,search,adminById,setBan,setAdmin,adminCount,promoteByEmails};
}

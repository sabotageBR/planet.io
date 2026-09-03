// ── REPO users (linhas cruas; toPublic para o fio) ─────────────────────────────
// @ts-check
// TRÊS nomes, de propósito: `name` é o nome da CONTA (o que veio do Google, mostrado no ranking),
// `nick` é o nome dentro do jogo (livre, trocável, só não repete na mesma sala) e `login` é o nome de
// ENTRADA — congelado no cadastro, único, e a única razão pela qual o nick já foi único (migração 0009).
// `login` vai no fio porque o jogador PRECISA vê-lo: ele troca o nick num onBlur da tela inicial e, sem
// isso, volta dias depois sem saber com que nome entra.
export const toPublic=u=>u&&({id:Number(u.id),nick:u.nick,name:u.display_name||null,kind:u.kind,coins:u.coins,equippedSkin:u.equipped_skin_id,
  country:u.country||null,avatar:u.avatar_hash||null,createdAt:u.created_at,...(u.login?{login:u.login}:{}),...(u.email?{email:u.email}:{}),
  // ⚠️ `isAdmin` só aparece quando é VERDADE (a allowlist acima é explícita de propósito), e serve para UMA
  // coisa: mostrar em Opções o botão que pede permissão de notificação do navegador — sem ele o aviso de
  // "entrou gente" nunca sai do sistema, porque `requestPermission()` exige gesto do usuário. Não é
  // autorização de nada: quem decide quem RECEBE o aviso é o servidor, e agir continua exigindo o token
  // de `kind:'admin'`.
  ...(u.is_admin?{isAdmin:true}:{})});
export function createUsers(db){
  const byId=(id,c=db)=>c.query(`SELECT * FROM users WHERE id=$1`,[id]).then(r=>r.rows[0]||null);
  /**
   * Entrar com senha: `login` congelado no cadastro OU e-mail (case-insensitive). Só quem TEM senha —
   * sem isso uma conta de Google com o mesmo e-mail entraria no LIMIT 1 e derrubaria o login de quem
   * tem senha, com "usuário ou senha incorretos" e nenhuma pista.
   * ⚠️ O degrau `login IS NULL AND lower(nick)=lower($1)` é COMPATIBILIDADE: conta reivindicada por um
   * pod velho no meio do rollout da 0009 fica sem `login`, e como o e-mail é opcional no cadastro isso
   * a trancaria PARA SEMPRE. Ele não reabre a ambiguidade: só alcança quem ficou sem login.
   * ⚠️ O ORDER BY existe porque o LIMIT 1 sem ordem é arbitrário: o e-mail (que é único) tem que ganhar
   * de um login parecido.
   */
  const byLogin=login=>db.query(`SELECT * FROM users WHERE kind='registered' AND password_hash IS NOT NULL
      AND (lower(login)=lower($1) OR lower(email)=lower($1) OR (login IS NULL AND lower(nick)=lower($1)))
    ORDER BY (lower(email)=lower($1)) DESC, id LIMIT 1`,[login]).then(r=>r.rows[0]||null);
  /** e-mail exato (case-insensitive). Existe só para o login com Google: é o que deixa a rota casar a
   *  identidade com uma conta que JÁ tem esse e-mail em vez de esbarrar no UNIQUE `users_email_uq`. */
  const byEmail=email=>db.query(`SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1`,[email]).then(r=>r.rows[0]||null);
  /** cria guest (dentro de transação): users + user_skins(0) — moedas de boas-vindas ficam com o ledger */
  const insertGuest=(c,nick)=>c.query(`INSERT INTO users(kind,nick) VALUES('guest',$1) RETURNING *`,[nick]).then(r=>r.rows[0]);
  const setNick=(id,nick,c=db)=>c.query(`UPDATE users SET nick=$2 WHERE id=$1 RETURNING *`,[id,nick]).then(r=>r.rows[0]||null);
  /** reivindicar: é AQUI que o `login` nasce e congela (o nick segue livre depois disso) */
  const claim=(id,{passwordHash,email,login},c=db)=>c.query(`UPDATE users SET kind='registered',password_hash=$2,email=$3,login=$4 WHERE id=$1 AND kind='guest' RETURNING *`,[id,passwordHash,email||null,login]).then(r=>r.rows[0]||null);
  /** o painel conserta um login errado (não há rota de jogador para isso: ele é congelado) */
  const setLogin=(id,login,c=db)=>c.query(`UPDATE users SET login=$2 WHERE id=$1 RETURNING *`,[id,login]).then(r=>r.rows[0]||null);
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
  const toAdmin=u=>u&&({id:Number(u.id),nick:u.nick,login:u.login||null,name:u.display_name||null,kind:u.kind,email:u.email||null,
    coins:u.coins,country:u.country||null,avatar:u.avatar_hash||null,isAdmin:!!u.is_admin,
    bannedUntil:u.banned_until||null,banReason:u.ban_reason||null,
    createdAt:u.created_at,lastSeenAt:u.last_seen_at,
    xp:Number(u.xp||0),games:u.games|0,kills:u.kills|0,deaths:u.deaths|0});
  /**
   * Busca paginada por KEYSET (`id < before`), não OFFSET: a tabela cresce e o offset degrada a cada
   * página. `q` casa nick, LOGIN, nome e e-mail; id exato tem atalho. O login entra porque quem pede
   * ajuda diz "não consigo entrar com Messi123" — e o nick dele já pode ser outro.
   */
  async function search({q=null,kind=null,banned=null,limit=50,before=null}={}){
    const w=[],p=[];
    if(q){const n=String(q).trim();
      if(/^\d+$/.test(n)){p.push(Number(n));w.push(`u.id=$${p.length}`);}
      else{p.push(`%${n.toLowerCase()}%`);w.push(`(lower(u.nick) LIKE $${p.length} OR lower(u.login) LIKE $${p.length} OR lower(u.display_name) LIKE $${p.length} OR lower(u.email) LIKE $${p.length})`);}}
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
  return{byId,byLogin,byEmail,insertGuest,setNick,setLogin,claim,mergePrefs,setEquipped,setCountry,setAvatarHash,touchSeen,purgeOrphanGuests,
    toAdmin,search,adminById,setBan,setAdmin,adminCount,promoteByEmails};
}

// ── /api/auth/* (guest, claim, login, logout) ──────────────────────────────────
// @ts-check
import {err} from './router.js';
import {LIMITS} from '../auth/ratelimit.js';
import {normalizeNick,randomGuestNick,suggestNick,isReservedByOther} from '../auth/nick.js';
import {hashPassword,verifyPassword,validPassword,dummyHash,PASSWORD_MIN} from '../auth/password.js';
import {toPublic} from '../repos/users.js';
const EMAIL_RE=/^[^\s@]{1,64}@[^\s@]{1,255}$/;
export function mountAuth(router,{db,config,users,tokens,ledger,skins,identities,google,limiter,requireUser,optionalUser,log}){
  const nickOf=async(raw,userId)=>{const nick=normalizeNick(raw);if(!nick)throw err(400,'invalid_nick','nick deve ter de 2 a 16 caracteres');
    if(await isReservedByOther(db,nick,userId))throw err(409,'nick_reserved','esse nick pertence a um jogador registrado',{suggestion:suggestNick(nick)});return nick;};
  // POST /api/auth/guest {nick?} → 201 {token,user}
  router.add('POST',/^\/api\/auth\/guest$/,async ctx=>{
    const nick=ctx.body.nick!=null&&ctx.body.nick!==''?await nickOf(ctx.body.nick,null):randomGuestNick();
    const out=await db.tx(async c=>{
      const u=await users.insertGuest(c,nick);
      await skins.grant(c,{userId:u.id,skinId:0,source:'default'});
      if(config.signupCoins>0){const {coins}=await ledger.apply(c,{userId:u.id,delta:config.signupCoins,reason:'signup'});u.coins=coins;}
      const token=await tokens.issue(u.id,'device',ctx.userAgent,c);
      return{token,user:toPublic(u)};
    });
    log.info(`guest criado: #${out.user.id} ${out.user.nick} (${ctx.ip})`);
    return[201,out];
  },{rate:{scope:'ip',lim:LIMITS.guest}});
  // POST /api/auth/claim {password,email?} 🔒 → {user}
  router.add('POST',/^\/api\/auth\/claim$/,async ctx=>{
    const me=await requireUser(ctx);
    if(me.kind!=='guest')throw err(400,'already_registered','essa conta já é registrada');
    if(!validPassword(ctx.body.password))throw err(400,'invalid_password',`senha deve ter pelo menos ${PASSWORD_MIN} caracteres`);
    let email=ctx.body.email==null||ctx.body.email===''?null:String(ctx.body.email).trim().toLowerCase();
    if(email&&!EMAIL_RE.test(email))throw err(400,'invalid_email','e-mail inválido');
    await nickOf(me.nick,me.id);
    const passwordHash=await hashPassword(ctx.body.password);
    let u;try{u=await users.claim(me.id,{passwordHash,email});}
    catch(e){if(e.code==='23505'){if(/email/.test(e.constraint||''))throw err(409,'email_taken','esse e-mail já está em uso');throw err(409,'nick_reserved','esse nick pertence a um jogador registrado',{suggestion:suggestNick(me.nick)});}throw e;}
    if(!u)throw err(400,'already_registered','essa conta já é registrada');
    log.info(`conta reivindicada: #${u.id} ${u.nick}`);
    return{user:toPublic(u)};
  },{rate:{scope:'token',lim:LIMITS.tokenWrite}});
  // POST /api/auth/login {login,password} → {token,user}
  router.add('POST',/^\/api\/auth\/login$/,async ctx=>{
    const login=String(ctx.body.login||'').trim(),password=ctx.body.password;
    if(!login||typeof password!=='string')throw err(400,'invalid_credentials','informe login e senha');
    const nickKey=`login:nick:${login.toLowerCase()}`;
    if(!limiter.peek(nickKey,LIMITS.loginNick))throw err(429,'rate_limited','muitas tentativas para esse usuário; aguarde',{retryAfter:limiter.retryAfterS(nickKey,LIMITS.loginNick)});
    const u=await users.byLogin(login);
    const ok=u?await verifyPassword(password,u.password_hash):(await verifyPassword(password,await dummyHash()),false);
    if(!ok){limiter.take(nickKey,LIMITS.loginNick);throw err(401,'invalid_credentials','usuário ou senha incorretos');}
    limiter.reset(nickKey);
    const token=await tokens.issue(u.id,'session',ctx.userAgent);
    users.touchSeen(u.id).catch(()=>{});
    return{token,user:toPublic(u)};
  },{rate:{scope:'ip',lim:LIMITS.loginIp}});
  // POST /api/auth/logout 🔒 → 204
  router.add('POST',/^\/api\/auth\/logout$/,async ctx=>{await requireUser(ctx);await tokens.revoke(ctx.token);return[204];});
  /**
   * POST /api/auth/google {idToken, nick?} → {token,user}
   * INERTE sem GOOGLE_CLIENT_ID: devolve 503, e como `/api/config` não expõe o clientId, o botão nem
   * aparece na tela. Três caminhos, nesta ordem:
   *   1. identidade conhecida → emite token e pronto;
   *   2. identidade nova E veio Bearer de um GUEST → promove aquele guest (é a fusão de contas que a lista
   *      de arestas do CLAUDE.md diz não existir; este é o lugar natural dela, e evita que quem já jogou
   *      como convidado perca moedas e skins ao entrar com Google pela primeira vez);
   *   3. identidade nova e sem token → conta nova, com o mesmo bônus de boas-vindas do guest.
   * A conta só-Google não tem senha: é por isso que a migração 0006 troca o CHECK de `users`.
   */
  router.add('POST',/^\/api\/auth\/google$/,async ctx=>{
    if(!google||!google.enabled)throw err(503,'google_disabled','login com Google não está configurado neste servidor');
    let id;try{id=await google.verify(ctx.body.idToken);}
    catch(e){log.warn(`google: ${e&&e.message}`);throw err(401,'invalid_credentials','não deu para validar sua conta Google');}
    const existente=await identities.find('google',id.subject);
    if(existente){
      const u=await users.byId(existente.user_id);
      if(!u)throw err(401,'invalid_credentials','conta não encontrada');
      const token=await tokens.issue(u.id,'session',ctx.userAgent);
      await identities.touch('google',id.subject);users.touchSeen(u.id).catch(()=>{});
      return{token,user:toPublic(u)};}
    const atual=ctx.token?await optionalUser(ctx):null;
    const out=await db.tx(async c=>{
      let u;
      if(atual&&atual.kind==='guest'){
        const nick=await nickOf(ctx.body.nick||atual.nick,atual.id);
        u=(await c.query(`UPDATE users SET kind='registered',email=COALESCE($2,email),nick=$3 WHERE id=$1 RETURNING *`,
          [atual.id,id.email,nick])).rows[0];}
      else{
        const nick=await nickOf(ctx.body.nick||id.name||randomGuestNick(),null);
        u=(await c.query(`INSERT INTO users(kind,nick,email) VALUES('registered',$1,$2) RETURNING *`,[nick,id.email])).rows[0];
        await skins.grant(c,{userId:u.id,skinId:0,source:'default'});
        if(config.signupCoins>0){const {coins}=await ledger.apply(c,{userId:u.id,delta:config.signupCoins,reason:'signup'});u.coins=coins;}}
      await identities.link(c,{userId:u.id,provider:'google',subject:id.subject,email:id.email});
      const token=await tokens.issue(u.id,'session',ctx.userAgent,c);
      return{token,user:toPublic(u)};});
    log.info(`google: #${out.user.id} ${out.user.nick} (${atual&&atual.kind==='guest'?'guest promovido':'conta nova'})`);
    return out;
  },{rate:{scope:'ip',lim:LIMITS.loginIp}});
}

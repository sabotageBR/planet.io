// ── /api/auth/* (guest, claim, login, logout) ──────────────────────────────────
// @ts-check
import {err} from './router.js';
import {LIMITS} from '../auth/ratelimit.js';
import {normalizeNick,randomGuestNick,suggestNick,isReservedByOther} from '../auth/nick.js';
import {hashPassword,verifyPassword,validPassword,dummyHash,PASSWORD_MIN} from '../auth/password.js';
import {toPublic} from '../repos/users.js';
const EMAIL_RE=/^[^\s@]{1,64}@[^\s@]{1,255}$/;
export function mountAuth(router,{db,config,users,tokens,ledger,skins,limiter,requireUser,log}){
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
}

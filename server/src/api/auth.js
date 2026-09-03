// ── /api/auth/* (guest, claim, login, logout) ──────────────────────────────────
// @ts-check
import {err} from './router.js';
import {LIMITS} from '../auth/ratelimit.js';
import {normalizeNick,normalizeLogin,randomGuestNick,suggestNick,loginTaken,NICK_MAX} from '../auth/nick.js';
import {hashPassword,verifyPassword,validPassword,dummyHash,PASSWORD_MIN} from '../auth/password.js';
import {toPublic} from '../repos/users.js';
const EMAIL_RE=/^[^\s@]{1,64}@[^\s@]{1,255}$/;
export function mountAuth(router,{db,config,users,tokens,ledger,skins,identities,google,crazygames,limiter,requireUser,optionalUser,log}){
  // O NICK é livre desde a 0009 (só não repete DENTRO de uma sala): aqui sobrou o formato.
  const nickOf=raw=>{const nick=normalizeNick(raw);if(!nick)throw err(400,'invalid_nick','nick deve ter de 2 a 16 caracteres');return nick;};
  /** O LOGIN é o que virou único. Ocupado → 409 com sugestão; o guarda de verdade é o 23505 lá embaixo. */
  const loginOf=async(raw,userId)=>{const login=normalizeLogin(raw);
    if(!login)throw err(400,'invalid_login','usuário deve ter de 2 a 16 caracteres, sem @');
    if(await loginTaken(db,login,userId))throw err(409,'login_taken','esse usuário já está em uso',{suggestion:suggestNick(login)});return login;};
  // POST /api/auth/guest {nick?} → 201 {token,user}
  router.add('POST',/^\/api\/auth\/guest$/,async ctx=>{
    const nick=ctx.body.nick!=null&&ctx.body.nick!==''?nickOf(ctx.body.nick):randomGuestNick();
    // De onde a conta nasceu (0010). É o mesmo cabeçalho que `http/cors.js` casa, mas aqui ele é só
    // DIMENSÃO: sem isto não há como saber se a retenção do site é diferente da de um portal, e é a
    // primeira pergunta que se faz quando o número vem ruim. Ausente = site (mesma origem, sem Origin).
    const origem=String(ctx.req.headers.origin||'').slice(0,64)||null;
    const out=await db.tx(async c=>{
      const u=await users.insertGuest(c,nick,origem);
      await skins.grant(c,{userId:u.id,skinId:0,source:'default'});
      if(config.signupCoins>0){const {coins}=await ledger.apply(c,{userId:u.id,delta:config.signupCoins,reason:'signup'});u.coins=coins;}
      const token=await tokens.issue(u.id,'device',ctx.userAgent,c);
      return{token,user:toPublic(u)};
    });
    log.info(`guest criado: #${out.user.id} ${out.user.nick} (${ctx.ip})`);
    return[201,out];
  },{rate:{scope:'ip',lim:LIMITS.guest}});
  /**
   * POST /api/auth/claim {login?,password,email?} 🔒 → {user}
   * É aqui que o LOGIN nasce e congela — o nick continua livre depois. ⚠️ `login` é OPCIONAL e cai no
   * nick atual: o cliente é outra imagem e fica em CACHE no navegador, então durante o rollout chegam
   * claims sem ele; exigi-lo mataria o botão "Reivindicar" para todo mundo por algumas horas. O
   * fallback reproduz exatamente o comportamento de antes da 0009 (o nick vira o login).
   */
  router.add('POST',/^\/api\/auth\/claim$/,async ctx=>{
    const me=await requireUser(ctx);
    if(me.kind!=='guest')throw err(400,'already_registered','essa conta já é registrada');
    if(!validPassword(ctx.body.password))throw err(400,'invalid_password',`senha deve ter pelo menos ${PASSWORD_MIN} caracteres`);
    let email=ctx.body.email==null||ctx.body.email===''?null:String(ctx.body.email).trim().toLowerCase();
    if(email&&!EMAIL_RE.test(email))throw err(400,'invalid_email','e-mail inválido');
    const login=await loginOf(ctx.body.login!=null&&ctx.body.login!==''?ctx.body.login:me.nick,me.id);
    const passwordHash=await hashPassword(ctx.body.password);
    let u;try{u=await users.claim(me.id,{passwordHash,email,login});}
    catch(e){if(e.code==='23505'){if(e.constraint==='users_email_uq')throw err(409,'email_taken','esse e-mail já está em uso');throw err(409,'login_taken','esse usuário já está em uso',{suggestion:suggestNick(login)});}throw e;}
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
   * Nick vindo do GOOGLE não pode BARRAR a entrada. `normalizeNick` RECUSA acima de 16 caracteres em
   * vez de cortar, então "Alexandre Fernandes Silva" derrubava o login inteiro com `400 invalid_nick`
   * — e o `randomGuestNick()` que estava ali de fallback nunca era alcançado. Aqui o nome é saneado e
   * pronto: desde a 0009 não há colisão possível, porque o nick não é mais único (e conta de Google
   * não tem senha, logo não tem `login`). Um `nick` explícito no corpo passa pela mesma peneira.
   */
  const nickDoGoogle=bruto=>{
    const cru=String(bruto||'').normalize('NFKC').replace(/\s+/g,' ').trim();
    return normalizeNick(cru)||normalizeNick(Array.from(cru).slice(0,NICK_MAX).join(''))||randomGuestNick();};
  /**
   * POST /api/auth/google {idToken, nick?} → {token,user}
   * INERTE sem GOOGLE_CLIENT_ID: devolve 503, e como `/api/config` não expõe o clientId, o botão nem
   * aparece na tela. Quatro caminhos, nesta ordem:
   *   1. identidade conhecida (`provider,subject`) → emite token e pronto;
   *   2. o e-mail VERIFICADO do Google já é de uma conta → vincula a identidade ÀQUELA conta. Sem isto
   *      o `INSERT` abaixo esbarrava no índice único `users_email_uq` e a rota devolvia 500 para quem
   *      só queria entrar. ⚠️ isto CONFIA no e-mail de `users`, e o e-mail que entra por
   *      `POST /api/auth/claim` nunca foi verificado por nós — o conserto de raiz é verificar o e-mail
   *      no claim; enquanto não houver, quem reivindicar uma conta com o e-mail alheio recebe o dono
   *      dele de presente quando essa pessoa entrar pelo Google;
   *   3. identidade nova E veio Bearer de um GUEST → promove aquele guest (é a fusão de contas que a
   *      lista de arestas do CLAUDE.md diz não existir; este é o lugar natural dela, e evita que quem
   *      já jogou como convidado perca moedas e skins ao entrar com Google pela primeira vez);
   *   4. identidade nova e sem token → conta nova, com o mesmo bônus de boas-vindas do guest.
   * A conta só-Google não tem senha: é por isso que a migração 0006 troca o CHECK de `users`.
   */
  router.add('POST',/^\/api\/auth\/google$/,async ctx=>{
    if(!google||!google.enabled)throw err(503,'google_disabled','login com Google não está configurado neste servidor');
    let id;try{id=await google.verify(ctx.body.idToken);}
    catch(e){log.warn(`google: ${e&&e.message}`);throw err(401,'invalid_credentials','não deu para validar sua conta Google');}
    const entra=async(u,via)=>{const token=await tokens.issue(u.id,'session',ctx.userAgent);users.touchSeen(u.id).catch(()=>{});
      log.info(`google: #${u.id} ${u.nick} (${via})`);return{token,user:toPublic(u)};};
    // O NOME DO GOOGLE fica guardado (`users.display_name`), e não só derivado num nick. É ele que o
    // RANKING mostra: o nick o jogador troca a cada partida, e um pódio construído sobre o nick não diz de
    // quem é a marca. O nick continua sendo o nome DENTRO do jogo — as duas coisas são diferentes.
    const nome=id.name?String(id.name).trim().slice(0,64):null;
    const guardaNome=(uid,c=db)=>nome?c.query(`UPDATE users SET display_name=$2 WHERE id=$1`,[uid,nome]).catch(()=>{}):null;
    // 1. identidade conhecida
    const existente=await identities.find('google',id.subject);
    if(existente){
      const u=await users.byId(existente.user_id);
      if(!u)throw err(401,'invalid_credentials','conta não encontrada');
      await identities.touch('google',id.subject);
      await guardaNome(u.id);u.display_name=nome||u.display_name;
      return entra(u,'identidade conhecida');}
    // 2. o e-mail já é de alguém → a identidade vai para AQUELA conta (ver a ressalva do comentário)
    const dono=id.email?await users.byEmail(id.email):null;
    if(dono){
      await identities.link(db,{userId:dono.id,provider:'google',subject:id.subject,email:id.email});
      await guardaNome(dono.id);dono.display_name=nome||dono.display_name;
      return entra(dono,'vinculado pelo e-mail');}
    // 3/4. promove o convidado, ou cria conta nova
    const atual=ctx.token?await optionalUser(ctx):null;
    const pedido=ctx.body.nick!=null&&ctx.body.nick!==''?String(ctx.body.nick):null;
    let out;
    try{
      out=await db.tx(async c=>{
        let u;
        if(atual&&atual.kind==='guest'){
          const nick=pedido?nickOf(pedido):nickDoGoogle(atual.nick);
          u=(await c.query(`UPDATE users SET kind='registered',email=COALESCE($2,email),nick=$3,display_name=COALESCE($4,display_name) WHERE id=$1 RETURNING *`,
            [atual.id,id.email,nick,nome])).rows[0];}
        else{
          const nick=pedido?nickOf(pedido):nickDoGoogle(id.name);
          u=(await c.query(`INSERT INTO users(kind,nick,email,display_name) VALUES('registered',$1,$2,$3) RETURNING *`,[nick,id.email,nome])).rows[0];
          await skins.grant(c,{userId:u.id,skinId:0,source:'default'});
          if(config.signupCoins>0){const {coins}=await ledger.apply(c,{userId:u.id,delta:config.signupCoins,reason:'signup'});u.coins=coins;}}
        await identities.link(c,{userId:u.id,provider:'google',subject:id.subject,email:id.email});
        const token=await tokens.issue(u.id,'session',ctx.userAgent,c);
        return{token,user:toPublic(u)};});
    }catch(e){
      // corrida: outra requisição gravou este mesmo e-mail entre o `byEmail` de cima e o INSERT daqui
      if(e.code==='23505'&&e.constraint==='users_email_uq')throw err(409,'email_taken','esse e-mail já está em uso');
      throw e;}
    log.info(`google: #${out.user.id} ${out.user.nick} (${atual&&atual.kind==='guest'?'guest promovido':'conta nova'})`);
    return out;
  },{rate:{scope:'ip',lim:LIMITS.loginIp}});

  /**
   * POST /api/auth/crazygames {userToken, nick?} → {token,user}
   * O jogador já está logado NO PORTAL; o SDK deles nos dá um JWT de 1 h e `auth/crazygames.js` o
   * verifica (RS256 contra a chave pública deles). Gêmeo da rota do Google, com duas diferenças que
   * importam:
   *   • NÃO HÁ E-MAIL. Some com ele o caminho "o e-mail já é de alguém", que lá existe para não esbarrar
   *     no `users_email_uq`. Aqui a identidade é o `userId` deles e mais nada.
   *   • O `username` do portal vira `display_name`. Isso não é enfeite: a CrazyGames EXIGE que o nome
   *     do jogador apareça dentro do jogo ("CrazyGames usernames must be displayed in-game so players
   *     can recognize their friends"), e `display_name` é o campo que o ranking já mostra.
   * Três caminhos: identidade conhecida · Bearer de um GUEST (promove, para ninguém perder moedas e
   * skins ao entrar pela primeira vez) · conta nova com o mesmo bônus de boas-vindas.
   */
  router.add('POST',/^\/api\/auth\/crazygames$/,async ctx=>{
    if(!crazygames||!crazygames.enabled)throw err(503,'crazygames_disabled','login da CrazyGames não está configurado neste servidor');
    let id;try{id=await crazygames.verify(ctx.body.userToken);}
    catch(e){log.warn(`crazygames: ${e&&e.message}`);throw err(401,'invalid_credentials','não deu para validar sua conta CrazyGames');}
    const entra=async(u,via)=>{const token=await tokens.issue(u.id,'session',ctx.userAgent);users.touchSeen(u.id).catch(()=>{});
      log.info(`crazygames: #${u.id} ${u.nick} (${via})`);return{token,user:toPublic(u)};};
    const nome=id.name?String(id.name).trim().slice(0,64):null;
    const guardaNome=(uid,c=db)=>nome?c.query(`UPDATE users SET display_name=$2 WHERE id=$1`,[uid,nome]).catch(()=>{}):null;

    const existente=await identities.find('crazygames',id.subject);
    if(existente){
      const u=await users.byId(existente.user_id);
      if(!u)throw err(401,'invalid_credentials','conta não encontrada');
      await identities.touch('crazygames',id.subject);
      await guardaNome(u.id);u.display_name=nome||u.display_name;
      return entra(u,'identidade conhecida');}

    const atual=ctx.token?await optionalUser(ctx):null;
    const pedido=ctx.body.nick!=null&&ctx.body.nick!==''?String(ctx.body.nick):null;
    const out=await db.tx(async c=>{
      let u;
      if(atual&&atual.kind==='guest'){
        const nick=pedido?nickOf(pedido):nickDoGoogle(id.name||atual.nick);
        u=(await c.query(`UPDATE users SET kind='registered',nick=$2,display_name=COALESCE($3,display_name) WHERE id=$1 RETURNING *`,
          [atual.id,nick,nome])).rows[0];}
      else{
        const nick=pedido?nickOf(pedido):nickDoGoogle(id.name);
        u=(await c.query(`INSERT INTO users(kind,nick,display_name) VALUES('registered',$1,$2) RETURNING *`,[nick,nome])).rows[0];
        await skins.grant(c,{userId:u.id,skinId:0,source:'default'});
        if(config.signupCoins>0){const {coins}=await ledger.apply(c,{userId:u.id,delta:config.signupCoins,reason:'signup'});u.coins=coins;}}
      await identities.link(c,{userId:u.id,provider:'crazygames',subject:id.subject,email:null});
      const token=await tokens.issue(u.id,'session',ctx.userAgent,c);
      return{token,user:toPublic(u)};});
    log.info(`crazygames: #${out.user.id} ${out.user.nick} (${atual&&atual.kind==='guest'?'guest promovido':'conta nova'})`);
    return out;
  },{rate:{scope:'ip',lim:LIMITS.loginIp}});
}

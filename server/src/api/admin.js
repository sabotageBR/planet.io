// ── PAINEL /admin: contas, banimento, parâmetros e auditoria ──────────────────
// Salas, kick e aviso global NÃO ficam aqui: eles mexem em memória de sala, que é do servidor de JOGO
// (server/src/http/admin.js). O corte é o mesmo que já separa `/api/me` de `/api/rooms|party`.
//
// ⚠️ O TOKEN DO PAINEL É OUTRO. `requireAdmin` exige `is_admin` **e** `token_kind==='admin'` — só o
// `POST /api/admin/login` emite esse tipo. Sem isso, roubar a aba do jogo de um administrador abriria o
// painel, e sair do painel deslogaria do jogo.
// ⚠️ `/api/admin/login` devolve o MESMO 401 para senha errada e para conta não-admin, sempre pagando o
// `dummyHash()`: senão a rota vira um oráculo de quem é administrador.
// @ts-check
import {err} from './router.js';
import {verifyPassword,dummyHash} from '../auth/password.js';
import {normalizeNick,normalizeLogin,loginTaken} from '../auth/nick.js';
import {cleanCountry} from '@warspace/shared/countries.js';
import {listTunables,applyTunable,resetTunable,TUNABLE_BY_KEY,GRUPOS} from '@warspace/shared/tunables.js';
import {LIMITS} from '../auth/ratelimit.js';
import {ORDEM_USERS} from '../repos/users.js';
import {ORDEM_AUDIT} from '../repos/audit.js';

const RD={scope:'token',lim:{n:120,win:60e3}};    // leitura
const WR={scope:'token',lim:{n:20,win:60e3}};     // mutação
const OFFSET_MAX=5000;

/**
 * Lê `by`/`dir`/`offset`/`before` da query e VALIDA contra a lista branca do repo. Recusar é obrigatório:
 * um `by` desconhecido caindo silenciosamente em "id" faz a tela dizer "moedas ▼" sobre uma lista
 * ordenada por outra coisa — a mentira que esta funcionalidade existe para não contar.
 * ⚠️ `before` (keyset, `id<$n`) só é uma POSIÇÃO no conjunto quando a ordem é por id. Junto de outro `by`
 * ele é 400, nunca ignorado: ignorá-lo em silêncio pularia um pedaço do conjunto sem ninguém perceber.
 * ⚠️ O teto do offset existe porque `?offset=99999999` é um pedido, por URL autenticada, para o banco
 * ordenar tudo e descartar tudo.
 */
function ordem(ctx,lista){
  const by=ctx.query.get('by')||'id',dir=ctx.query.get('dir')||'desc';
  if(!lista.has(by))throw err(400,'bad_by',`ordenação inválida: ${by}`);
  if(dir!=='asc'&&dir!=='desc')throw err(400,'bad_dir',`direção inválida: ${dir}`);
  const before=ctx.query.get('before');
  if(before&&by!=='id')throw err(400,'cursor_conflict','o cursor `before` só vale na ordem padrão (by=id)');
  const offset=Math.max(0,+(ctx.query.get('offset')||0)||0);
  if(offset>OFFSET_MAX)throw err(400,'offset_max',`offset acima de ${OFFSET_MAX}`);
  return{by,dir,offset,before};}
/** O cursor da página seguinte, no regime em uso — o cliente só o devolve, sem saber qual dos dois é. */
const proxima=(more,by,offset,rows)=>!more?null
  :by==='id'&&!offset?{before:rows.length?rows[rows.length-1].id:null}:{offset:offset+rows.length};

export function mountAdmin(router,{db,log,config,users,tokens,ledger,settings,audit,tunables,analytics,requireUser}){
  /** As DUAS condições. Um 403 genérico de propósito: não distingue "não é admin" de "token de jogo". */
  const requireAdmin=async ctx=>{const u=await requireUser(ctx);
    if(!u.is_admin||u.token_kind!=='admin')throw err(403,'forbidden','acesso restrito');return u;};
  const reg=(a,adm,ctx,o={})=>audit&&audit.log({adminId:adm.id,action:a,ip:ctx.ip,...o});

  router.add('POST',/^\/api\/admin\/login$/,async ctx=>{
    const login=String(ctx.body.login||'').trim(),senha=String(ctx.body.password||'');
    const u=login?await users.byLogin(login):null;
    // ⚠️ `dummyHash()` DEVOLVE o hash (uma string, sempre truthy). Escrito como `: await dummyHash(senha)`
    // isto dava `ok=true` para toda conta registrada SEM senha — e conta de Google é exatamente isso,
    // e `ADMIN_EMAILS` promove por e-mail: o painel abria com QUALQUER senha. O padrão certo é o de
    // `api/auth.js`: pagar o tempo do hash e devolver false.
    const ok=u&&u.password_hash?await verifyPassword(senha,u.password_hash):(await dummyHash(),false);
    if(!u||!ok||!u.is_admin)throw err(401,'invalid_credentials','usuário ou senha inválidos');
    const token=await tokens.issue(u.id,'admin',ctx.userAgent);
    reg('login',u,ctx);
    return{token,admin:{id:Number(u.id),nick:u.nick,name:u.display_name||null}};
  },{rate:{scope:'ip',lim:LIMITS.loginIp}});

  router.add('POST',/^\/api\/admin\/logout$/,async ctx=>{await requireAdmin(ctx);await tokens.revoke(ctx.token);return[204,null];},{rate:WR});
  router.add('GET',/^\/api\/admin\/me$/,async ctx=>{const u=await requireAdmin(ctx);
    return{admin:{id:Number(u.id),nick:u.nick,name:u.display_name||null,email:u.email||null}};},{rate:RD});

  // ── contas ──
  router.add('GET',/^\/api\/admin\/users$/,async ctx=>{await requireAdmin(ctx);
    const q=ctx.query.get('q'),kind=ctx.query.get('kind'),b=ctx.query.get('banned');
    const {by,dir,offset,before}=ordem(ctx,ORDEM_USERS);
    const {rows,more}=await users.search({q,kind,banned:b==='1'?true:b==='0'?false:null,
      limit:+(ctx.query.get('limit')||50),before,by,dir,offset});
    // e-mail é do DETALHE, não da lista: uma tela de busca não precisa despejar a base de e-mails
    // ⚠️ `next` só existe quando HÁ próxima: antes ele saía preenchido também na última página, e o botão
    // "carregar mais" ficaria eterno trazendo nada.
    return{users:rows.map(({email,...r})=>r),by,dir,more,next:proxima(more,by,offset,rows)};},{rate:RD});

  router.add('GET',/^\/api\/admin\/users\/(?<id>\d+)$/,async ctx=>{await requireAdmin(ctx);
    const id=Number(ctx.params.id),u=await users.adminById(id);
    if(!u)throw err(404,'not_found','conta não encontrada');
    const [tks,led,mts]=await Promise.all([
      db.query(`SELECT id,kind,created_at,last_used_at,expires_at,revoked_at,user_agent FROM auth_tokens WHERE user_id=$1 ORDER BY id DESC LIMIT 20`,[id]).then(r=>r.rows),
      db.query(`SELECT delta,reason,created_at FROM coin_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT 20`,[id]).then(r=>r.rows).catch(()=>[]),
      db.query(`SELECT id,ended_at,score,max_mass,kills,duration_s,cause,room_code FROM matches WHERE user_id=$1 ORDER BY id DESC LIMIT 10`,[id]).then(r=>r.rows).catch(()=>[]),
    ]);
    return{user:u,tokens:tks,ledger:led,matches:mts};},{rate:RD});

  router.add('PATCH',/^\/api\/admin\/users\/(?<id>\d+)$/,async ctx=>{const adm=await requireAdmin(ctx);
    const id=Number(ctx.params.id),b=ctx.body||{};
    if(b.nick!=null){const nick=normalizeNick(b.nick);
      if(!nick)throw err(400,'bad_nick','nick inválido');
      await users.setNick(id,nick);}
    // O LOGIN é congelado no cadastro e o jogador não tem rota para trocá-lo: sem isto, um usuário
    // errado (ou um `Viajante-NNNN` congelado por engano) só se conserta com UPDATE na mão.
    if(b.login!=null){const login=normalizeLogin(b.login);
      if(!login)throw err(400,'bad_login','usuário inválido');
      if(await loginTaken(db,login,id))throw err(409,'login_taken','esse usuário já está em uso');
      try{await users.setLogin(id,login);}catch(e){if(e.code==='23505')throw err(409,'login_taken','esse usuário já está em uso');throw e;}}
    if(b.country!==undefined)await users.setCountry(id,cleanCountry(b.country));
    const u=await users.adminById(id);
    if(!u)throw err(404,'not_found','conta não encontrada');
    reg('edit',adm,ctx,{target:id,detail:{nick:b.nick,login:b.login,country:b.country}});
    return{user:u};},{rate:WR});

  router.add('POST',/^\/api\/admin\/users\/(?<id>\d+)\/ban$/,async ctx=>{const adm=await requireAdmin(ctx);
    const id=Number(ctx.params.id),dias=ctx.body.days|0;
    if(id===Number(adm.id))throw err(409,'self_ban','você não pode banir a própria conta');
    const u=await users.setBan(id,dias,ctx.body.reason);
    if(!u)throw err(404,'not_found','conta não encontrada');
    if(dias>0)await tokens.revokeAll(id);   // banir sem derrubar as sessões abertas não bane nada
    reg(dias>0?'ban':'unban',adm,ctx,{target:id,detail:{days:dias,reason:ctx.body.reason||null}});
    return{user:u};},{rate:WR});

  router.add('POST',/^\/api\/admin\/users\/(?<id>\d+)\/coins$/,async ctx=>{const adm=await requireAdmin(ctx);
    const id=Number(ctx.params.id),delta=Math.trunc(Number(ctx.body.delta)||0);
    if(!delta)throw err(400,'bad_delta','informe quantas moedas somar ou tirar');
    try{
      const out=await db.tx(async c=>{
        const {coins}=await ledger.apply(c,{userId:id,delta,reason:'admin'});
        await audit.log({adminId:adm.id,action:'coins',target:id,detail:{delta,reason:ctx.body.reason||null},ip:ctx.ip},c);
        return{coins};});
      return out;}
    catch(e){if(/coins/.test(e.constraint||'')||e.code==='23514')throw err(402,'insufficient_coins','a conta não tem essas moedas');throw e;}
  },{rate:WR});

  router.add('POST',/^\/api\/admin\/users\/(?<id>\d+)\/tokens\/revoke$/,async ctx=>{const adm=await requireAdmin(ctx);
    const id=Number(ctx.params.id),r=await tokens.revokeAll(id);
    reg('revoke_tokens',adm,ctx,{target:id});
    return{revoked:r.rowCount|0};},{rate:WR});

  router.add('POST',/^\/api\/admin\/users\/(?<id>\d+)\/admin$/,async ctx=>{const adm=await requireAdmin(ctx);
    const id=Number(ctx.params.id),on=!!ctx.body.on;
    // Dois pisos anti-lockout. Rebaixar por engano é o jeito mais fácil de trancar todo mundo para fora.
    if(!on&&id===Number(adm.id))throw err(409,'self_demote','você não pode rebaixar a própria conta');
    if(!on&&await users.adminCount()<=1)throw err(409,'last_admin','este é o último administrador');
    const u=await users.setAdmin(id,on);
    if(!u)throw err(404,'not_found','conta não encontrada');
    reg(on?'promote':'demote',adm,ctx,{target:id});
    return{user:u};},{rate:WR});

  // ── parâmetros de jogo ──
  router.add('GET',/^\/api\/admin\/settings$/,async ctx=>{await requireAdmin(ctx);
    const salvos=settings?await settings.all():[];
    const byKey=new Map(salvos.map(r=>[r.key,r]));
    // `grupos` vai junto porque a ORDEM das seções é do descritor, não da UI: o painel não decide nem quais
    // categorias existem nem em que sequência aparecem.
    return{grupos:GRUPOS,tunables:listTunables().map(t=>{const s=byKey.get(t.key);
      return{...t,changed:!!s,updatedAt:s?s.updated_at:null,updatedBy:s?s.updated_by:null};})};},{rate:RD});

  router.add('PUT',/^\/api\/admin\/settings\/(?<key>[A-Za-z0-9_.]+)$/,async ctx=>{const adm=await requireAdmin(ctx);
    const key=ctx.params.key,t=TUNABLE_BY_KEY.get(key);
    if(!t)throw err(400,'unknown_key','esse parâmetro não existe');
    // 'both' é lido pela FÍSICA do cliente, que tem a própria cópia do bundle: mudar de um lado só faria a
    // predição divergir. Recusar é honesto; gravar seria fingir que funciona.
    // ⚠️ 'wire' passa: o cliente também lê, mas o servidor ENTREGA o valor no JSON `room` (ver
    // `wireValues`/`aplicaWire` em shared/tunables.js), então os dois lados ficam com o mesmo número.
    if(t.scope==='both')throw err(501,'client_side','esse parâmetro também é lido pela física do cliente e não pode ser mudado em runtime');
    let v;try{v=applyTunable(key,ctx.body.value);}
    catch(e){throw err(400,e.message==='out_of_range'?'out_of_range':'unknown_key',
      e.message==='out_of_range'?`o valor tem que ficar entre ${t.min} e ${t.max}`:'esse parâmetro não existe');}
    // ⚠️ Grava o valor EFETIVO (o que `applyTunable` devolveu), nunca o corpo cru: com o `Number(...)` de
    // antes, um tunable de ESCOLHA gravaria NaN no banco e a reconciliação o recusaria a cada 30 s — o
    // painel diria "salvo" e o parâmetro voltaria sozinho ao padrão, sem erro nenhum na tela.
    if(settings)await settings.set(key,{v},adm.id);
    reg('setting',adm,ctx,{target:key,detail:{value:v}});
    return{key,value:v,applied:await espalha(ctx)};},{rate:WR});

  router.add('DELETE',/^\/api\/admin\/settings\/(?<key>[A-Za-z0-9_.]+)$/,async ctx=>{const adm=await requireAdmin(ctx);
    const key=ctx.params.key;if(!TUNABLE_BY_KEY.get(key))throw err(400,'unknown_key','esse parâmetro não existe');
    const v=resetTunable(key);
    if(settings)await settings.remove(key);
    reg('setting_reset',adm,ctx,{target:key});
    return{key,value:v,applied:await espalha(ctx)};},{rate:WR});

  // ── retenção ──
  // ⚠️ `days` é limitado a 90 e não por gosto: as consultas varrem `matches` no MESMO pool das partidas, e
  // um `days=365` curioso é um incidente. O repo ainda põe `statement_timeout` e um memo de 60 s.
  // Leitura NÃO audita (nenhum GET daqui audita): `admin_audit` não tem retenção por decisão, e encher o
  // log de aberturas de tela afogaria as linhas de ban/kick, que são a razão da tabela existir.
  router.add('GET',/^\/api\/admin\/retencao$/,async ctx=>{await requireAdmin(ctx);
    if(!analytics)return{days:0,funil:[],primeira:null,histograma:[],algoz:[],coortes:[],visita:null};
    const d=Math.min(90,Math.max(1,+(ctx.query.get('days')||14)||14));
    return await analytics.tudo(d);},{rate:RD});

  // ── auditoria ──
  router.add('GET',/^\/api\/admin\/audit$/,async ctx=>{await requireAdmin(ctx);
    if(!audit)return{rows:[],by:'id',dir:'desc',more:false,next:null};
    const {by,dir,offset,before}=ordem(ctx,ORDEM_AUDIT);
    const {rows,more}=await audit.list({limit:+(ctx.query.get('limit')||100),before,adminId:ctx.query.get('adminId'),by,dir,offset});
    return{rows,by,dir,more,next:proxima(more,by,offset,rows)};},{rate:RD});

  /**
   * Pede aos irmãos que releiam o banco. O corpo NÃO carrega valor: quem manda é `admin_settings`, e o
   * push é só latência — um pod que estava reiniciando converge sozinho no poll de 30 s.
   * As falhas VOLTAM na resposta: o admin precisa saber que o shard 2 ainda está com o valor velho.
   */
  async function espalha(ctx){
    if(tunables)await tunables.load();
    if(!config.peers||!config.peers.length)return{shards:[config.shard],falhas:[]};
    const {tellPeers}=await import('../http/peers.js');
    const rs=await tellPeers(config.peers,{path:'/internal/admin/tunables',method:'POST',body:{},
      auth:ctx.req&&ctx.req.headers?ctx.req.headers.authorization||null:null,log});
    return{shards:[config.shard,...rs.filter(r=>r.status>=200&&r.status<300).map(r=>r.peer)],
      falhas:rs.filter(r=>r.error||r.status>=400).map(r=>r.peer)};}
}

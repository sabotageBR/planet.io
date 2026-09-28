// ── Teste de integração: migrate do zero → API → hooks → invariantes (node --test) ──
// precisa do Postgres de dev (DATABASE_URL=postgres://planet:planet@127.0.0.1:5433/planet).
//
// ⚠️ ESTE TESTE APAGA O SCHEMA (`DROP SCHEMA public CASCADE` no `before`). Ele é o preço de testar a
// migração DO ZERO, e por isso só pode rodar contra um banco LOCAL. A guarda abaixo existe porque o
// contrário já aconteceu: sem DATABASE_URL no ambiente o arquivo lia o `.env` da raiz — que aponta para
// PRODUÇÃO — e `npm test` derrubava o banco de verdade, em silêncio e com o jogo no ar.
// Para rodar contra um host remoto de propósito (banco vazio, staging), passe ALLOW_REMOTE_DB=1.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {SKINS,STARTER_SKINS,AD_REWARD_SKINS,AD_GIFT_SKINS} from '@warspace/shared/skins.js';
import crypto from 'node:crypto';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(!process.env.DATABASE_URL){try{for(const l of readFileSync(path.join(ROOT,'.env'),'utf8').split('\n')){const m=/^\s*([A-Z_]+)=(.*)$/.exec(l);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim();}}catch{}}
process.env.LOG_LEVEL=process.env.TEST_LOG||'silent';process.env.SHARD='0';
// ── guarda do banco: DROP SCHEMA só em host local ──
const LOCAL=/^(localhost|127(\.\d+){3}|\[?::1\]?|0\.0\.0\.0)$/;
{
  const url=process.env.DATABASE_URL||'';
  if(!url)throw new Error('persist.test.js precisa de um Postgres: DATABASE_URL=postgres://planet:planet@127.0.0.1:5433/planet');
  let host='';try{host=new URL(url).hostname;}catch{throw new Error(`DATABASE_URL inválida: ${url}`);}
  if(!LOCAL.test(host)&&process.env.ALLOW_REMOTE_DB!=='1')
    throw new Error(`RECUSADO: este teste faz DROP SCHEMA e a DATABASE_URL aponta para o host remoto "${host}". `
      +'Rode com DATABASE_URL=postgres://planet:planet@127.0.0.1:5433/planet, ou ALLOW_REMOTE_DB=1 se o banco remoto for descartável.');
}
const {config}=await import('../src/config.js');
const {createLogger}=await import('../src/log.js');
const {createDb}=await import('../src/db/pool.js');
const {migrate}=await import('../src/db/migrate.js');
const {createApi,healthFields}=await import('../src/api/index.js');
const {createPersistence}=await import('../src/persist/hooks.js');
const {MatchSession}=await import('../src/persist/session.js');
const {createQueue}=await import('../src/persist/queue.js');
const {hashPassword,verifyPassword}=await import('../src/auth/password.js');
const {normalizeNick,suggestNick}=await import('../src/auth/nick.js');
const {SCORE_COINS}=await import('@warspace/shared/constants.js');
const {TIERS}=await import('@warspace/shared/achievements.js');
const log=createLogger({level:process.env.LOG_LEVEL});
let db,persist,api,server,base;
const call=async(method,p,{body,token,ip='10.0.0.1'}={})=>{
  const r=await fetch(base+p,{method,headers:{'content-type':'application/json','x-forwarded-for':ip,...(token?{authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text();return{status:r.status,body:text?JSON.parse(text):null,headers:r.headers};
};
before(async()=>{
  db=createDb(config,log);
  await db.query('DROP SCHEMA public CASCADE');await db.query('CREATE SCHEMA public');
  const {applied}=await migrate(db,log);
  // conta os arquivos em vez de fixar um número: cada migração nova quebrava este teste sem nenhum motivo
  const dir=path.join(ROOT,'server','src','db','migrations');
  assert.equal(applied.length,readdirSync(dir).filter(f=>/^\d+_.+\.sql$/.test(f)).length,'todas as migrações aplicadas do zero');
  persist=createPersistence({db,log,config:{...config,noCleanup:true}});
  // `pickStarterSkin` fixo em 0: preserva o comportamento de sempre (`owned===[0]`) em toda conta nova
  // desta suíte, sem precisar reescrever as asserções que já contam com isso. O sorteio de verdade tem
  // teste próprio, mais abaixo, com uma SEGUNDA instância de `createApi`.
  api=createApi({db,log,config,persist,pickStarterSkin:()=>0});
  server=http.createServer(async(req,res)=>{if(await api(req,res))return;res.writeHead(404);res.end();});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await persist.shutdown();server.close();await db.close();});

// ── helpers dos testes de progressão (os de cima usam `call` direto) ──
const randomUUID=()=>crypto.randomUUID();
/** Cria um convidado e devolve {token,userId}. */
const novoGuest=async nick=>{const r=await call('POST','/api/auth/guest',{body:{nick}});
  assert.equal(r.status,201,JSON.stringify(r.body));return{token:r.body.token,userId:r.body.user.id};};
/** Conta de verdade (guest promovido). */
const novaConta=async(nick,email)=>{const g=await novoGuest(nick);
  const r=await call('POST','/api/auth/claim',{token:g.token,body:{password:'segredo123',email}});
  assert.equal(r.status,200,JSON.stringify(r.body));return g;};
const req=(method,p,body,token)=>call(method,p,{body:body===null?undefined:body,token});


test('migrate: schema completo, idempotente e skins semeadas',async()=>{
  const t=(await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`)).rows.map(r=>r.table_name);
  for(const n of ['users','auth_tokens','matches','user_stats','skins','user_skins','user_achievements','coin_ledger','schema_migrations','v_ranking_week','v_ranking_day'])assert.ok(t.includes(n),n);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM skins')).rows[0].n,SKINS.length);
  assert.equal((await migrate(db,log)).applied.length,0);
});
test('unitários: senha, nick',async()=>{
  const h=await hashPassword('segredo123');assert.match(h,/^scrypt\$32768\$8\$1\$/);assert.ok(await verifyPassword('segredo123',h));assert.ok(!(await verifyPassword('outra',h)));
  assert.equal(normalizeNick('  Evandro   Moura '),'Evandro Moura');assert.equal(normalizeNick('a'),null);assert.equal(normalizeNick('x'.repeat(17)),null);assert.equal(normalizeNick('ab'),null);
  assert.ok(suggestNick('EvandroMouraLongo').length<=16);assert.match(suggestNick('Evandro'),/^Evandro_\d{4}$/);
});

const S={};
test('guest → me → PATCH nick → claim',async()=>{
  let r=await call('POST','/api/auth/guest',{body:{nick:'Evandro'}});assert.equal(r.status,201);assert.match(r.body.token,/^pt_[A-Za-z0-9_-]{43}$/);
  assert.equal(r.body.user.coins,config.signupCoins);assert.equal(r.headers.get('cache-control'),'no-store');S.t1=r.body.token;S.u1=r.body.user.id;
  r=await call('GET','/api/me',{token:S.t1});assert.equal(r.status,200);assert.deepEqual(r.body.skins,[0]);assert.equal(r.body.user.kind,'guest');assert.equal(r.body.stats.games,0);
  r=await call('GET','/api/me');assert.equal(r.status,401);
  r=await call('PATCH','/api/me',{token:S.t1,body:{nick:'  Evandro   Moura '}});assert.equal(r.status,200);assert.equal(r.body.user.nick,'Evandro Moura');
  r=await call('PATCH','/api/me',{token:S.t1,body:{nick:'x'}});assert.equal(r.status,400);assert.equal(r.body.error,'invalid_nick');
  r=await call('POST','/api/auth/claim',{token:S.t1,body:{password:'123'}});assert.equal(r.status,400);assert.equal(r.body.error,'invalid_password');
  r=await call('POST','/api/auth/claim',{token:S.t1,body:{password:'segredo123',email:'Evandro@Example.com'}});assert.equal(r.status,200);assert.equal(r.body.user.kind,'registered');
  r=await call('POST','/api/auth/claim',{token:S.t1,body:{password:'segredo123'}});assert.equal(r.status,400);assert.equal(r.body.error,'already_registered');
});
// O nick já foi único no mundo inteiro (409 `nick_reserved`, com sugestão `Nick_NNNN`). Não é mais: nick é
// nome de planeta, qualquer um pode ser o Messi — com a caricatura do Messi —, e a única regra que sobrou é
// por SALA (`Room.nickTaken` → NICK_IN_ROOM). Quem herdou a unicidade foi o `login`, no teste seguinte.
test('nick LIVRE: dá para pegar o nick de um registrado; guest sem nick vira Viajante-NNNN',async()=>{
  let r=await call('POST','/api/auth/guest',{body:{nick:'evandro moura'},ip:'10.0.0.2'});
  assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.user.nick,'evandro moura');   // o mesmo nick de S.t1, que é REGISTRADO
  r=await call('POST','/api/auth/guest',{body:{},ip:'10.0.0.2'});assert.equal(r.status,201);assert.match(r.body.user.nick,/^Viajante-\d{4}$/);S.t2=r.body.token;S.u2=r.body.user.id;S.n2=r.body.user.nick;
  r=await call('PATCH','/api/me',{token:S.t2,body:{nick:'EVANDRO MOURA'}});assert.equal(r.status,200);assert.equal(r.body.user.nick,'EVANDRO MOURA');
  r=await call('PATCH','/api/me',{token:S.t2,body:{nick:'Zé'}});assert.equal(r.status,200);assert.equal(r.body.user.nick,'Zé');S.n2='Zé';
});
test('login congelado: o claim reserva o USUÁRIO, e trocar o nick não muda por onde se entra',async()=>{
  const g=await call('POST','/api/auth/guest',{body:{nick:'Copião'},ip:'10.0.0.3'});assert.equal(g.status,201);const tok=g.body.token;
  // S.t1 reivindicou sem mandar `login`: o fallback é o nick da hora, então 'Evandro Moura' está ocupado.
  let r=await call('POST','/api/auth/claim',{token:tok,body:{login:'evandro moura',password:'segredo123'}});
  assert.equal(r.status,409);assert.equal(r.body.error,'login_taken');assert.match(r.body.suggestion,/_\d{4}$/);
  r=await call('POST','/api/auth/claim',{token:tok,body:{login:'nao@vale',password:'segredo123'}});
  assert.equal(r.status,400);assert.equal(r.body.error,'invalid_login');   // '@' faria o login cobrir o e-mail de outra conta
  r=await call('POST','/api/auth/claim',{token:tok,body:{login:'copiao',password:'segredo123'}});
  assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.user.login,'copiao');assert.equal(r.body.user.nick,'Copião');
  // e aqui está o ponto da mudança: o nick vira o de OUTRA conta registrada, e a entrada continua de pé.
  r=await call('PATCH','/api/me',{token:tok,body:{nick:'Evandro Moura'}});assert.equal(r.status,200);assert.equal(r.body.user.nick,'Evandro Moura');
  r=await call('POST','/api/auth/login',{body:{login:'copiao',password:'segredo123'},ip:'10.0.0.31'});
  assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.user.id,g.body.user.id);
  r=await call('POST','/api/auth/login',{body:{login:'Evandro Moura',password:'segredo123'},ip:'10.0.0.32'});
  assert.equal(r.status,200);assert.equal(r.body.user.id,S.u1,'o nick repetido não sequestra o login de quem o congelou');
});
test('login: 401, 429 por nick após 5 falhas, sucesso por nick e por e-mail',async()=>{
  let r=await call('POST','/api/auth/login',{body:{login:'Evandro Moura',password:'errada'}});assert.equal(r.status,401);assert.equal(r.body.error,'invalid_credentials');
  for(let i=0;i<4;i++)await call('POST','/api/auth/login',{body:{login:'evandro moura',password:'errada'},ip:'10.0.0.'+(10+i)});
  r=await call('POST','/api/auth/login',{body:{login:'evandro moura',password:'segredo123'},ip:'10.0.0.20'});assert.equal(r.status,429);assert.ok(r.headers.get('retry-after'));
  r=await call('POST','/api/auth/login',{body:{login:'evandro@example.com',password:'segredo123'},ip:'10.0.0.21'});assert.equal(r.status,200);assert.equal(r.body.user.id,S.u1);S.t3=r.body.token;
  r=await call('POST','/api/auth/login',{body:{login:'naoexiste',password:'segredo123'},ip:'10.0.0.22'});assert.equal(r.status,401);
});
test('skins: buy 200/409/402/403, equip 200/403, catálogo',async()=>{
  let r=await call('POST','/api/skins/1/buy',{token:S.t3});assert.equal(r.status,200);assert.equal(r.body.coins,config.signupCoins-200);assert.deepEqual(r.body.owned,[0,1]);
  r=await call('POST','/api/skins/1/buy',{token:S.t3});assert.equal(r.status,409);assert.equal(r.body.error,'already_owned');
  r=await call('POST','/api/skins/30/buy',{token:S.t3});assert.equal(r.status,402);assert.equal(r.body.error,'insufficient_coins');
  r=await call('POST','/api/skins/35/buy',{token:S.t3});assert.equal(r.status,403);assert.equal(r.body.error,'not_purchasable');
  r=await call('POST','/api/skins/999/buy',{token:S.t3});assert.equal(r.status,404);
  r=await call('POST','/api/skins/1/equip',{token:S.t3});assert.equal(r.status,200);assert.equal(r.body.equippedSkin,1);
  r=await call('POST','/api/skins/2/equip',{token:S.t3});assert.equal(r.status,403);assert.equal(r.body.error,'not_owned');
  r=await call('GET','/api/skins',{token:S.t3});assert.equal(r.body.skins.length,SKINS.length);assert.deepEqual(r.body.owned,[0,1]);assert.equal(r.body.equipped,1);
  r=await call('GET','/api/skins');assert.deepEqual(r.body.owned,[0]);assert.equal(r.body.equipped,0);
  assert.equal(db.health.fails,0,'erros de aplicação não contam no circuit breaker');
});
test('skin inicial: sorteio entre as 10 (função pura + fiação de ponta a ponta)',async()=>{
  const {randomStarterSkin}=await import('../src/repos/skins.js');
  const vistos=new Set();
  for(let i=0;i<200;i++){const id=randomStarterSkin();assert.ok(STARTER_SKINS.includes(id),`fora do pool: ${id}`);vistos.add(id);}
  assert.ok(vistos.size>1,'200 sorteios caindo sempre no mesmo valor não é sorteio');
  // Fiação: uma SEGUNDA instância de createApi, com o sorteio fixo em 5 (fora do 0 de sempre desta
  // suíte), prova que quem GRANJEIA e EQUIPA usa de fato o que `pickStarterSkin` devolve — não só que a
  // função sorteia direito. `persist` fica de fora: as rotas testadas aqui não o tocam.
  const api2=createApi({db,log,config,pickStarterSkin:()=>5});
  const server2=http.createServer(async(req,res)=>{if(await api2(req,res))return;res.writeHead(404);res.end();});
  await new Promise(r=>server2.listen(0,'127.0.0.1',r));
  const base2=`http://127.0.0.1:${server2.address().port}`;
  try{
    const g=await fetch(base2+'/api/auth/guest',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'10.0.0.40'},body:JSON.stringify({nick:'SorteioFixo'})});
    const gb=await g.json();
    assert.equal(g.status,201,JSON.stringify(gb));
    assert.equal(gb.user.equippedSkin,5,'a resposta da própria criação já tem que ecoar a skin sorteada');
    const sk=await fetch(base2+'/api/skins',{headers:{authorization:`Bearer ${gb.token}`}}).then(x=>x.json());
    assert.deepEqual(sk.owned,[0,5]);assert.equal(sk.equipped,5);
  }finally{server2.close();}
});
test('mascote: o anúncio DÁ a skin e equipa — e comprar com moeda continua livre',async()=>{
  // Conta ISOLADA (novoGuest), nunca S.t3: testes mais adiante comparam a lista de skins dele por
  // igualdade exata, e ganhar uma mascote ali quebraria aquele teste sem relação nenhuma com este.
  // ⚠️ ESTE TESTE JÁ AFIRMOU O CONTRÁRIO ("exige o PRÓPRIO anúncio E moedas"): as mascotes eram
  // `AD_REWARD_SKINS`, onde o vídeo só DESTRAVAVA a compra. Hoje elas são `AD_GIFT_SKINS` e o vídeo DÁ —
  // ver o comentário daquela constante para o porquê (um vídeo que só dá o direito de gastar 1.900 moedas
  // reprova no "properly fired" do checklist da Poki).
  // ⚠️ QUAIS skins é decisão de produto, e é por isso que ela está escrita aqui e não só derivada: a
  // recompensa é Terra Brava · Lua Soldado, nessa ordem (a ordem É a da oferta na tela de morte). Mascote
  // novo no catálogo entra na pool sozinho e derruba esta linha de propósito — quem a acrescentar decide,
  // com o texto na frente, se ela também vale um vídeo.
  // ⚠️ **O MARTE BRAVO SAIU, e a linha mudou com a decisão que a motivou.** Ele virou o prêmio de
  // PROGRESSÃO (`PROGRESSO.PARTIDAS` partidas jogadas, concedido em `persist/hooks.js`) e é a skin com que
  // o tutorial é jogado. Nas duas portas ao mesmo tempo a barra seria decorativa: ninguém espera três
  // partidas por algo que um vídeo de 30 s entrega. Sobram dois, ou seja o `rewardedBreak` continua tendo
  // o que oferecer — sem isso o pacote perderia um item que a Poki cobra por escrito.
  assert.deepEqual(AD_GIFT_SKINS.map(id=>SKINS.find(s=>s.id===id).name),['Terra Brava','Lua Soldado']);
  const g=await novoGuest('TestadorAnuncio');
  const alvo=AD_GIFT_SKINS[0];
  let r=await call('POST','/api/skins/6/ad-gift',{token:g.token});assert.equal(r.status,400);assert.equal(r.body.error,'bad_request');   // fora da pool
  r=await call('POST',`/api/skins/${alvo}/ad-gift`,{token:g.token});assert.equal(r.status,200,JSON.stringify(r.body));
  assert.ok(r.body.skins.includes(alvo),'a skin é CONCEDIDA, não apenas destravada');
  assert.equal(r.body.equippedSkin,alvo,'e já vem equipada — foi o pedido');
  // IDEMPOTENTE: o servidor não confirma que o vídeo rodou, então não há o que punir numa 2ª chamada.
  r=await call('POST',`/api/skins/${alvo}/ad-gift`,{token:g.token});assert.equal(r.status,200);
  assert.equal(r.body.skins.filter(id=>id===alvo).length,1,'não duplica a posse');
  // ⚠️ E NADA TRAVA A COMPRA: `ad_required` era da mecânica dormente. Outra mascote, sem vídeo nenhum,
  // tem que cobrar só moeda — primeiro faltando, depois sobrando.
  const outra=AD_GIFT_SKINS[1];
  r=await call('POST',`/api/skins/${outra}/buy`,{token:g.token});assert.equal(r.status,402);assert.equal(r.body.error,'insufficient_coins');
  await db.query(`UPDATE users SET coins=$2 WHERE id=$1`,[g.userId,10000]);
  r=await call('POST',`/api/skins/${outra}/buy`,{token:g.token});assert.equal(r.status,200,JSON.stringify(r.body));assert.ok(r.body.owned.includes(outra));
  assert.equal(db.health.fails,0,'erros de aplicação não contam no circuit breaker');
});
test('a mecânica de "o vídeo destrava a compra" está DORMENTE, e dormente quer dizer inalcançável',async()=>{
  // O precedente é `BLACKHOLE.COUNT=0` e a Nova: o código fica inteiro e volta trocando uma linha. O que
  // este teste trava é que, com a pool vazia, ela não age em LUGAR NENHUM — senão ela voltaria pela porta
  // dos fundos numa skin qualquer, e a Loja passaria a exigir um vídeo que nada na tela anuncia.
  assert.deepEqual(AD_REWARD_SKINS,[],'a pool dormente tem que estar vazia');
  assert.equal(AD_GIFT_SKINS.filter(id=>AD_REWARD_SKINS.includes(id)).length,0,'as duas pools nunca se cruzam');
  const g=await novoGuest('TestadorDormente');
  for(const id of [AD_GIFT_SKINS[0],6]){
    const r=await call('POST',`/api/skins/${id}/watch-ad`,{token:g.token});
    assert.equal(r.status,400,`/watch-ad tem que recusar a skin ${id}`);assert.equal(r.body.error,'bad_request');}
  const r=await call('GET','/api/skins',{token:g.token});assert.deepEqual(r.body.adWatched,[]);
});
test('prefs: whitelist e merge',async()=>{
  let r=await call('PATCH','/api/me/prefs',{token:S.t3,body:{theme:'dusk',volume:50,showFps:true,hack:1,lbSize:99,quality:'low'}});
  assert.equal(r.status,200);assert.deepEqual(r.body.prefs,{theme:'dusk',volume:50,showFps:true,quality:'low'});   // 0..100, a unidade do cliente
  r=await call('PATCH','/api/me/prefs',{token:S.t3,body:{music:false}});assert.deepEqual(r.body.prefs,{theme:'dusk',volume:50,showFps:true,quality:'low',music:false});
});
test('ranking vazio + validação',async()=>{
  let r=await call('GET','/api/ranking?period=week&by=score',{token:S.t3});assert.equal(r.status,200);assert.deepEqual(r.body.rows,[]);assert.equal(r.body.me,null);
  r=await call('GET','/api/ranking?period=x');assert.equal(r.status,400);
});
test('router: JSON inválido, corpo > 16 KB, 404, 405, rotas não tratadas',async()=>{
  let r=await fetch(base+'/api/auth/guest',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'10.0.0.30'},body:'{x'});assert.equal(r.status,400);
  r=await fetch(base+'/api/auth/guest',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'10.0.0.31'},body:JSON.stringify({nick:'a'.repeat(20000)})});assert.equal(r.status,413);
  r=await call('GET','/api/auth/nope');assert.equal(r.status,404);r=await call('DELETE','/api/me');assert.equal(r.status,405);
  r=await fetch(base+'/api/rooms');assert.equal(r.status,404);  // não é desta camada → false → 404 do servidor de teste
});
// ⚠️ O limite de guest é 30/h POR PESSOA — e só é isso quando o IP identifica uma pessoa. Atrás do
// ingress deste cluster ele não identifica (medido: 10.32.0.1 para todo mundo), e aí 30/h vira o teto
// de contas novas do SITE INTEIRO. Por isso o teste tem duas metades, e a segunda é a que documenta o
// conserto: com `trustClientIp` falso, 31 seguidos do "mesmo IP" continuam passando.
test('rate limit: guest 30/h por IP quando o IP é confiável',async()=>{
  const capi=createApi({db,log,config:{...config,trustClientIp:true},persist});
  const srv=http.createServer(async(rq,rs)=>{if(await capi(rq,rs))return;rs.writeHead(404);rs.end();});
  await new Promise(r=>srv.listen(0,'127.0.0.1',r));
  const b=`http://127.0.0.1:${srv.address().port}`;
  const post=ip=>fetch(b+'/api/auth/guest',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':ip},body:'{}'}).then(r=>r.status);
  const codes=[];for(let i=0;i<31;i++)codes.push(await post('10.9.9.9'));
  assert.deepEqual(codes,[...Array(30).fill(201),429]);
  assert.equal(await post('10.9.9.10'),201,'outro IP tem balde próprio');
  srv.close();
});
test('rate limit: com o IP cego, o balde por IP é o do SHARD e não o de uma pessoa',async()=>{
  const codes=[];for(let i=0;i<31;i++)codes.push((await call('POST','/api/auth/guest',{body:{},ip:'10.9.9.11'})).status);
  assert.deepEqual(codes,Array(31).fill(201),'31 contas do mesmo "IP" não podem virar 429: é um proxy, não uma pessoa');
});

test('hooks: join → kill/stat/sample → matchEnd salva match, moedas, conquistas, skins; coins = Σ ledger',async()=>{
  const h=persist.hooks;
  let bad=await h.onPlayerJoin({token:'pt_invalido',fallbackNick:'X'});assert.deepEqual(bad.ok,false);assert.equal(bad.code,'AUTH');
  const j1=await h.onPlayerJoin({token:S.t3,fallbackNick:'X',remoteAddr:'127.0.0.1',roomCode:'0ABC'});
  assert.equal(j1.ok,true);assert.equal(j1.userId,S.u1);assert.equal(j1.nick,'Evandro Moura');assert.equal(j1.registered,true);assert.equal(j1.skinId,1);assert.equal(j1.prefs.theme,'dusk');assert.equal(j1.unsaved,false);assert.match(j1.sessionId,/^[0-9a-f-]{36}$/);
  const j2=await h.onPlayerJoin({token:S.t2,fallbackNick:'Y'});assert.equal(j2.ok,true);assert.equal(j2.registered,false);
  assert.equal(persist.health().sessions,2);
  for(let i=0;i<3;i++)h.onStat({sessionId:j1.sessionId,key:'split'});h.onStat({sessionId:j1.sessionId,key:'eject'});h.onStat({sessionId:j1.sessionId,key:'food'});h.onStat({sessionId:'nao-existe',key:'food'});
  h.onKill({sessionId:j1.sessionId,killerSessionId:j1.sessionId,victimSessionId:'bot1',victimIsBot:true,weapon:'eat',tick:100});
  h.onKill({sessionId:j1.sessionId,killerSessionId:j1.sessionId,victimSessionId:j2.sessionId,victimIsBot:false,weapon:'missile',tick:200});
  for(let q=0;q<4;q++)h.onSample({sessionId:j1.sessionId,mass:1000+q*2000,rank:1,quadrant:q});
  // j2 morre para j1 primeiro (killed_by = u1)
  const r2=await h.onMatchEnd({sessionId:j2.sessionId,cause:'eaten',killedBySessionId:j1.sessionId,score:150,maxMass:900,durationMs:20000});
  assert.equal(r2.saved,true);assert.equal(r2.coinsEarned,0);assert.deepEqual(r2.achievements,[]);
  const r1=await h.onMatchEnd({sessionId:j1.sessionId,cause:'eaten',killedBySessionId:j2.sessionId,score:9000,maxMass:7000,durationMs:320000});
  // ⚠️ Os números vêm da fórmula, não copiados: SCORE_COINS foi apertada (divisor 1200, teto 200, abate
  // simples) porque a conta antiga pagava 692 de um teto de 750 — o teto era salário, não teto.
  const base=SCORE_COINS(9000,1,1,320);assert.equal(base,Math.floor(9000/1200)+1+1+15);
  const bronze=TIERS[0].coins*3;   // três conquistas de bronze nesta partida
  assert.equal(r1.saved,true);assert.equal(r1.coinsEarned,base+bronze);
  assert.deepEqual(r1.achievements.map(a=>a.key).sort(),['explore.b','mass.b','survive.b']);assert.deepEqual([...r1.skinsUnlocked].sort(),[35,37,43]);
  assert.equal(r1.rank.day,1);
  assert.equal(await h.onMatchEnd({sessionId:j1.sessionId,cause:'left'}),null,'sessão já encerrada → null');
  const m=(await db.query('SELECT * FROM matches WHERE user_id=$1',[S.u1])).rows[0];
  assert.equal(m.kills,1);assert.equal(m.bot_kills,1);assert.equal(m.splits,3);assert.equal(m.ejects,1);assert.equal(m.food_eaten,1);assert.equal(m.best_streak,2);assert.equal(m.top1_ticks,120);
  assert.equal(m.max_mass,7000);assert.equal(m.duration_s,320);assert.equal(m.cause,'eaten');assert.equal(m.room_code,'0ABC');assert.equal(m.coins_earned,base+bronze);assert.equal(m.skin_id,1);assert.equal(Number(m.killed_by_user_id),S.u2);
  const st=(await db.query('SELECT * FROM user_stats WHERE user_id=$1',[S.u1])).rows[0];assert.equal(st.games,1);assert.equal(st.best_score,9000);assert.equal(st.play_time_s,320);
  const u=(await db.query('SELECT coins FROM users WHERE id=$1',[S.u1])).rows[0];assert.equal(u.coins,config.signupCoins-200+base+bronze);
  for(const id of [S.u1,S.u2]){const s=(await db.query('SELECT coalesce(sum(delta),0)::int AS s FROM coin_ledger WHERE user_id=$1',[id])).rows[0].s;const c=(await db.query('SELECT coins FROM users WHERE id=$1',[id])).rows[0].coins;assert.equal(c,s,`coins = Σ ledger (user ${id})`);}
  const owned=(await call('GET','/api/me',{token:S.t3})).body;assert.deepEqual(owned.skins,[0,1,35,37,43]);assert.deepEqual(owned.achievements.sort(),['explore.b','mass.b','survive.b']);assert.equal(owned.stats.kills,1);
  // histórico + ranking
  const hist=(await call('GET','/api/me/history',{token:S.t2})).body.matches;assert.equal(hist.length,1);assert.equal(hist[0].by,'Evandro Moura');assert.equal(hist[0].cause,'eaten');
  let rk=(await call('GET','/api/ranking?period=day&by=score&limit=10',{token:S.t3})).body;assert.equal(rk.rows[0].userId,S.u1);assert.equal(rk.rows[0].value,9000);assert.equal(rk.rows[0].registered,true);assert.deepEqual(rk.me,{rank:1,value:9000});
  rk=(await call('GET','/api/ranking?period=all&by=kills',{token:S.t2})).body;assert.equal(rk.rows.length,1);assert.equal(rk.me,null);
});
test('finishMatch idempotente por session_id',async()=>{
  const s=new MatchSession({userId:S.u1,nick:'Evandro Moura',kind:'registered',skinId:1});s.kill({victimIsBot:false});
  const m=s.end({cause:'left',score:600,durationMs:10000});
  const before=(await db.query('SELECT coins FROM users WHERE id=$1',[S.u1])).rows[0].coins;
  const esperado=SCORE_COINS(600,1,0,10);
  const a=await persist.finishMatch(m);assert.equal(a.saved,true);assert.equal(a.coinsEarned,esperado);
  const b=await persist.finishMatch(m);assert.equal(b.duplicate,true);assert.equal(b.coinsEarned,esperado);
  assert.equal((await db.query('SELECT coins FROM users WHERE id=$1',[S.u1])).rows[0].coins,before+esperado,'a segunda chamada não paga de novo');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM matches WHERE session_id=$1',[m.sessionId])).rows[0].n,1);
});
test('session: onStat eat/eatBot só contam sem onKill (sem duplicar)',()=>{
  const a=new MatchSession({userId:1,nick:'a',kind:'guest'});a.stat('eat');a.stat('eatBot');a.kill({victimIsBot:false});
  assert.equal(a.end().kills,1);assert.equal(a.end().botKills,0);
  const b=new MatchSession({userId:1,nick:'b',kind:'guest'});b.stat('eat');b.stat('eat');b.stat('eatBot');
  const m=b.end({score:1});assert.equal(m.kills,2);assert.equal(m.botKills,1);assert.equal(b.end({score:999}).score,1,'end idempotente');
});
test('onShutdown fecha sessões vivas como shutdown e drena',async()=>{
  const p2=createPersistence({db,log,config:{...config,noCleanup:true}});
  const j=await p2.hooks.onPlayerJoin({token:S.t2,fallbackNick:'Y'});assert.equal(j.ok,true);
  p2.hooks.onSample({sessionId:j.sessionId,mass:400,rank:3,quadrant:1});
  await p2.hooks.onShutdown();
  const m=(await db.query(`SELECT cause,max_mass FROM matches WHERE user_id=$1 ORDER BY id DESC LIMIT 1`,[S.u2])).rows[0];assert.equal(m.cause,'shutdown');assert.equal(m.max_mass,400);
  assert.equal(p2.health().queue,0);
  const u=await p2.hooks.onPlayerJoin({token:S.t2,fallbackNick:'Y'});assert.equal(u.unsaved,true,'após shutdown entra sem persistência');
});
test('logout revoga o token',async()=>{
  assert.equal((await call('POST','/api/auth/logout',{token:S.t1})).status,204);
  assert.equal((await call('GET','/api/me',{token:S.t1})).status,401);
  assert.equal((await call('GET','/api/me',{token:S.t3})).status,200,'token de sessão continua válido');
});
test('fila: retry com backoff e erro fatal sem retry',async()=>{
  const q=createQueue({log,baseMs:5,retriable:e=>e.code==='EAGAIN'});
  let n=0;const v=await q.push('ok',async()=>{if(++n<3)throw Object.assign(new Error('x'),{code:'EAGAIN'});return 'feito';});assert.equal(v,'feito');assert.equal(n,3);
  await assert.rejects(q.push('fatal',async()=>{throw new Error('fatal');}),/fatal/);
  assert.deepEqual(q.stats(),{queued:0,running:0,done:1,failed:1,dropped:0});await q.drain(100);
  await assert.rejects(q.push('x',async()=>1),/encerrada/);
});
test('banco fora: onPlayerJoin volta unsaved em < 3,5 s; healthFields db:down; API 503',async()=>{
  for(const url of ['postgres://planet:planet@127.0.0.1:1/planet','postgres://planet:planet@192.0.2.1:5432/planet']){
    const bad=createDb({...config,databaseUrl:url,dbPoolMax:2},log);const p=createPersistence({db:bad,log,config:{...config,noCleanup:true}});
    const t0=Date.now();const r=await p.hooks.onPlayerJoin({token:S.t3,fallbackNick:'Evandro'});const dt=Date.now()-t0;
    assert.ok(dt<3500,`demorou ${dt} ms (${url})`);assert.deepEqual(r,{ok:true,userId:null,nick:'Evandro',registered:false,skinId:0,level:0,avatar:null,prefs:{},unsaved:true});
    await p.hooks.onPlayerJoin({token:S.t3,fallbackNick:'E'});await p.hooks.onPlayerJoin({token:S.t3,fallbackNick:'E'});
    await new Promise(r=>setTimeout(r,100));  // o cap de 3 s do join vence a corrida por ~5 ms; a rejeição do pg (que abre o circuito) chega logo depois
    assert.equal(bad.health.down,true,'3 falhas → circuito aberto');assert.deepEqual(healthFields({db:bad,persist:p}),{db:'down',queue:0});
    const t1=Date.now();await p.hooks.onPlayerJoin({token:S.t3,fallbackNick:'E'});assert.ok(Date.now()-t1<50,'com circuito aberto responde na hora');
    const badApi=createApi({db:bad,log,config});const srv=http.createServer((req,res)=>badApi(req,res));await new Promise(r=>srv.listen(0,'127.0.0.1',r));
    const res=await fetch(`http://127.0.0.1:${srv.address().port}/api/me`,{headers:{authorization:`Bearer ${S.t3}`}});assert.equal(res.status,503);assert.equal((await res.json()).error,'db_unavailable');
    srv.close();await p.shutdown();await bad.close();
  }
});

// ── PROGRESSÃO, PAÍS, GATE DE NÍVEL, AVATAR E EASTER EGG ─────────────────────
test('XP e mortes entram na mesma transação da partida, e o nível é derivado',async()=>{
  const {matchXp}=await import('@warspace/shared/levels.js');
  const {levelFromXp}=await import('@warspace/shared/levels.js');
  const t=await novoGuest('Progresso');
  const m={sessionId:randomUUID(),userId:t.userId,startedAt:Date.now()-60000,durationS:600,score:25000,maxMass:9000,
    kills:5,botKills:6,splits:3,ejects:4,food:900,bestStreak:3,top1Ticks:10800,quadrants:2,cause:'eaten',
    mode:0,teamSize:1,team:null,placement:0,players:0,skinId:0};
  const r1=await persist.finishMatch({...m});
  const esperado=matchXp(m);
  assert.equal(r1.xp.gained,esperado,'o XP da partida não bateu com a fórmula pura');
  assert.equal(r1.xp.total,esperado);
  assert.equal(r1.xp.level,levelFromXp(esperado));
  const st=await api.repos.matches.statsFor(t.userId);
  assert.equal(Number(st.xp),esperado);
  assert.equal(st.deaths,1,'`eaten` é morte');
  // idempotência: o mesmo sessionId não pode creditar duas vezes
  const r2=await persist.finishMatch({...m});
  assert.ok(r2.duplicate);
  assert.equal(Number((await api.repos.matches.statsFor(t.userId)).xp),esperado,'creditou duas vezes');
  // sair da sala NÃO é morrer
  await persist.finishMatch({...m,sessionId:randomUUID(),cause:'left',durationS:5,score:0,kills:0,botKills:0,food:0,top1Ticks:0});
  assert.equal((await api.repos.matches.statsFor(t.userId)).deaths,1,'`left` foi contado como morte');
});

test('a política de morte do código e a do SQL das views são a MESMA lista',async()=>{
  // O SQL duplica a lista por necessidade; este teste é o antídoto: uma causa nova sem classificação
  // passaria despercebida e sumiria do K/D de todo mundo.
  const {DEATH_CAUSES}=await import('@warspace/shared/levels.js');
  for(const v of ['v_ranking_day','v_ranking_week']){
    const def=(await db.query(`SELECT pg_get_viewdef($1::regclass) AS d`,[v])).rows[0].d;
    for(const c of DEATH_CAUSES)assert.ok(def.includes(`'${c}'`),`${v} não conhece a causa ${c}`);}
});

test('país: PATCH aceita, valida e limpa; o ranking regional filtra',async()=>{
  const t=await novoGuest('Brasileiro');
  assert.equal((await req('PATCH','/api/me',{country:'br'},t.token)).body.user.country,'BR','minúsculo tem que ser aceito');
  assert.equal((await req('PATCH','/api/me',{country:'ZZ'},t.token)).status,400);
  assert.equal((await req('PATCH','/api/me',{country:null},t.token)).body.user.country,null,'null limpa');
  assert.equal((await req('PATCH','/api/me',{},t.token)).status,400,'PATCH vazio não faz sentido');
  await req('PATCH','/api/me',{country:'BR'},t.token);
  assert.equal((await req('GET','/api/ranking?country=XX')).status,400);
  assert.equal((await req('GET','/api/ranking?country=BR')).body.country,'BR');
});

test('ranking: o país entra na CHAVE do cache (senão o Brasil vê o ranking do mundo)',async()=>{
  // Foi a regressão mais provável de toda esta frente: o cache é de 10 s e a chave não tinha o país.
  const t=await novaConta('Cacheado','cacheado@exemplo.com');
  await req('PATCH','/api/me',{country:'PT'},t.token);
  await persist.finishMatch({sessionId:randomUUID(),userId:t.userId,startedAt:Date.now()-1000,durationS:10,score:999999,
    maxMass:1,kills:0,botKills:0,splits:0,ejects:0,food:0,bestStreak:0,top1Ticks:0,quadrants:0,cause:'left',mode:0,teamSize:1,skinId:0});
  const global=(await req('GET','/api/ranking?by=score&limit=50')).body.rows;
  const pt=(await req('GET','/api/ranking?by=score&limit=50&country=PT')).body.rows;   // dentro dos 10 s do cache
  assert.ok(global.length>=pt.length);
  assert.ok(pt.every(r=>r.country==='PT'),'o recorte de país devolveu gente de fora');
  assert.ok(pt.some(r=>r.userId===t.userId));
});

test('ranking: convidado APARECE — e a conta não perde nada ao ser criada',async()=>{
  // O ranking já somou só CONTA, e o argumento era que o convidado escolhia um nick novo a cada entrada.
  // Isso acabou: o nome do planeta passou a ser EXIGIDO e fica gravado na conta de convidado, que dura
  // enquanto o token viver no navegador — enquanto o cadastro por senha saiu da tela, deixando 3 % da base
  // elegível a um pódio que é o cartão da tela inicial. A coleta nunca mudou (soma por `user_id`), e é por
  // isso que registrar depois não move um número: ele já estava lá.
  const g=await novoGuest('Passageiro');
  const partida=uid=>persist.finishMatch({sessionId:randomUUID(),userId:uid,startedAt:Date.now()-1000,durationS:10,
    score:888888,maxMass:1,kills:0,botKills:0,splits:0,ejects:0,food:0,bestStreak:0,top1Ticks:0,quadrants:0,
    cause:'left',mode:0,teamSize:1,skinId:0});
  await partida(g.userId);
  let rk=(await req('GET','/api/ranking?by=score&limit=47')).body;
  const antes=rk.rows.find(r=>r.userId===g.userId);
  assert.ok(antes,'convidado tem que aparecer no ranking');
  assert.equal(antes.registered,false,'e viajar marcado como convidado, para quem quiser distinguir');
  assert.equal(antes.name,'Passageiro','sem display_name o nome da linha cai no nick');
  assert.ok((await req('GET','/api/ranking?by=score&limit=47',null,g.token)).body.me.rank>=1,'com posição própria');
  assert.equal((await call('POST','/api/auth/claim',{token:g.token,body:{password:'segredo123',email:'passageiro@exemplo.com'}})).status,200);
  // ⚠️ `limit` diferente de propósito: ele entra na CHAVE do cache de 10 s do /api/ranking, e sem isso a
  // consulta de depois do registro devolveria a resposta de antes dele — o teste passaria pelo motivo errado.
  rk=(await req('GET','/api/ranking?by=score&limit=48',null,g.token)).body;
  const linha=rk.rows.find(r=>r.userId===g.userId);
  assert.ok(linha,'depois de registrar, continua');
  assert.equal(linha.value,888888,'com a mesma pontuação — registrar não cria nem apaga histórico');
  assert.equal(linha.registered,true,'e agora marcado como conta');
});

test('skin lendária: o nível é gate de verdade, e ele destrava com XP',async()=>{
  const {SKINS}=await import('@warspace/shared/skins.js');
  const alvo=SKINS.find(s=>s.levelReq>0&&s.price>0);
  const t=await novoGuest('SemNivel');
  await db.query(`UPDATE users SET coins=$2 WHERE id=$1`,[t.userId,alvo.price+1000]);
  const nao=await req('POST',`/api/skins/${alvo.id}/buy`,{},t.token);
  assert.equal(nao.status,403);assert.equal(nao.body.error,'level_required');
  assert.equal(nao.body.levelReq,alvo.levelReq);
  const {xpForLevel}=await import('@warspace/shared/levels.js');
  await db.query(`INSERT INTO user_stats(user_id,xp) VALUES($1,$2) ON CONFLICT (user_id) DO UPDATE SET xp=$2`,[t.userId,xpForLevel(alvo.levelReq)]);
  const sim=await req('POST',`/api/skins/${alvo.id}/buy`,{},t.token);
  assert.equal(sim.status,200,JSON.stringify(sim.body));
  assert.ok(sim.body.owned.includes(alvo.id));
  // e a loja recebe o nível junto do catálogo, para não precisar de uma segunda chamada
  const cat=await req('GET','/api/skins',null,t.token);
  assert.equal(cat.body.level,alvo.levelReq);
  assert.ok(cat.body.skins.find(s=>s.id===alvo.id).levelReq===alvo.levelReq);
});

test('progressão: N partidas dão a skin do tutorial, e só uma vez',async()=>{
  // O jogador a EXPERIMENTA no tutorial e a perde ao entrar na primeira sala de verdade; é esta concessão
  // que a devolve, e é ela que a barra da tela de morte promete. O `games` do payload existe porque o
  // cliente não tem outra fonte — `session.stats` só é escrito no boot pelo `GET /api/me`.
  const {SKIN_TUTORIAL}=await import('@warspace/shared/skins.js');
  const {PROGRESSO}=await import('@warspace/shared/constants.js');
  const t=await novoGuest('Estreante');
  const h=persist.hooks;
  const uma=async()=>{const j=await h.onPlayerJoin({token:t.token,fallbackNick:'Estreante',roomCode:'0ABC'});
    return h.onMatchEnd({sessionId:j.sessionId,cause:'eaten',score:10,maxMass:900,durationMs:9000});};
  let r=null;
  for(let i=1;i<PROGRESSO.PARTIDAS;i++){r=await uma();
    assert.equal(r.games,i,'o payload leva o acumulado da CONTA, não o da partida');
    assert.ok(!r.skinsUnlocked.includes(SKIN_TUTORIAL),`concedida cedo demais (partida ${i})`);}
  r=await uma();
  assert.equal(r.games,PROGRESSO.PARTIDAS);
  assert.ok(r.skinsUnlocked.includes(SKIN_TUTORIAL),'a partida do alvo tem de conceder');
  // ⚠️ E NÃO REPETE: `grantMany` devolve só o que de fato inseriu, então da partida seguinte em diante a
  // lista volta vazia sozinha. Sem isso a tela de morte comemoraria a mesma skin para sempre.
  r=await uma();
  assert.equal(r.games,PROGRESSO.PARTIDAS+1);
  assert.ok(!r.skinsUnlocked.includes(SKIN_TUTORIAL),'concedeu duas vezes: a comemoração viraria loop');
  const owned=(await req('GET','/api/me',null,t.token)).body.skins;
  assert.ok(owned.includes(SKIN_TUTORIAL),'a skin tem de estar na conta, não só no payload');
});

test('skin em teste: o planeta do tutorial FICA nas primeiras partidas e vira o equipado na concessão',async()=>{
  // Ele era TIRADO na entrada da primeira sala de verdade, e a troca de planeta no instante em que a
  // partida começa lia como defeito. Agora a skin inicial (sorteada entre as grátis/comuns) é substituída
  // pelo Marte Bravo em cada VIDA até a concessão — e a concessão o equipa, então o planeta do jogador não
  // muda uma vez sequer entre o tutorial e a 4ª partida.
  const {SKIN_TUTORIAL}=await import('@warspace/shared/skins.js');
  const {PROGRESSO}=await import('@warspace/shared/constants.js');
  const h=persist.hooks;
  const joga=async t=>{const j=await h.onPlayerJoin({token:t.token,fallbackNick:'Teste',roomCode:'0ABC'});
    const r=await h.onMatchEnd({sessionId:j.sessionId,cause:'eaten',score:10,maxMass:900,durationMs:9000});return{j,r};};
  const t=await novoGuest('Aprendiz');
  assert.ok(await api.repos.skins.isDefault(t.userId,(await api.repos.users.byId(t.userId)).equipped_skin_id),'premissa: nasce com a skin de nascença');
  let v=null;
  for(let i=1;i<=PROGRESSO.PARTIDAS;i++){v=await joga(t);
    assert.equal(v.j.skinId,SKIN_TUTORIAL,`a partida ${i} tem de ser jogada com o planeta do tutorial`);}
  assert.equal(v.r.equipped,SKIN_TUTORIAL,'a concessão tem de equipar — senão a partida seguinte volta à skin sorteada');
  const me=(await req('GET','/api/me',null,t.token)).body;
  assert.equal(me.user.equippedSkin,SKIN_TUTORIAL,'equipada na CONTA, não só no payload');
  v=await joga(t);
  assert.equal(v.j.skinId,SKIN_TUTORIAL,'depois da concessão ela continua, agora por ser a equipada');
  assert.equal(v.r.equipped,null,'e não "equipa de novo" a cada partida');

  // ⚠️ NUNCA por cima de uma ESCOLHA: quem comprou e equipou outra skin joga com a dele, e a concessão não
  // a troca. O caso escolhido é o que a lista de skins iniciais NÃO distingue: uma COMUM comprada — ela está
  // no sorteio de nascença E à venda, e só a origem da posse diz que foi escolha.
  const comum=SKINS.find(s=>s.rarity==='common'&&s.id!==0);
  const e=await novoGuest('Escolheu');
  assert.equal((await req('POST',`/api/skins/${comum.id}/buy`,{},e.token)).status,200);
  assert.equal((await req('POST',`/api/skins/${comum.id}/equip`,{},e.token)).status,200);
  for(let i=1;i<=PROGRESSO.PARTIDAS;i++){v=await joga(e);
    assert.equal(v.j.skinId,comum.id,`a skin comprada não pode ser trocada (partida ${i})`);}
  assert.ok(v.r.skinsUnlocked.includes(SKIN_TUTORIAL),'o prêmio continua sendo dado');
  assert.equal(v.r.equipped,null,'mas não equipado por cima da escolha');
  assert.equal((await api.repos.users.byId(e.userId)).equipped_skin_id,comum.id);

  // ⚠️ O easter egg continua ganhando: é uma escolha feita no nick.
  const {eggSkinFor}=await import('@warspace/shared/eggs.js');
  const b=await novoGuest('Bruxo');
  assert.equal((await h.onPlayerJoin({token:b.token,fallbackNick:'Bruxo'})).skinId,eggSkinFor('Bruxo'));
});

test('easter egg: o nick escolhe a skin da VIDA, sem tocar na skin equipada',async()=>{
  const {eggSkinFor}=await import('@warspace/shared/eggs.js');
  const t=await novoGuest('Bruxo');
  const r=await persist.hooks.onPlayerJoin({token:t.token,fallbackNick:'Bruxo'});
  assert.equal(r.skinId,eggSkinFor('Bruxo'),'entrou como Bruxo e não veio a caricatura');
  const u=await api.repos.users.byId(t.userId);
  // igual a 0 nesta suíte porque `pickStarterSkin` está fixo em 0 (ver `before`); o que importa aqui é
  // que o valor continua sendo a skin inicial da CONTA, e não a caricatura do egg.
  assert.ok(STARTER_SKINS.includes(u.equipped_skin_id),'o easter egg NÃO pode escrever na skin equipada');
  // prefs.eggs:false desliga
  // ⚠️ Sem o egg a vida cai no caminho de SEMPRE — que, para uma conta que ainda não jogou 3 partidas, é
  // a skin em TESTE (o Marte Bravo do tutorial), e não mais a de nascença.
  const {SKIN_TUTORIAL}=await import('@warspace/shared/skins.js');
  await req('PATCH','/api/me/prefs',{eggs:false},t.token);
  assert.equal((await persist.hooks.onPlayerJoin({token:t.token,fallbackNick:'Bruxo'})).skinId,SKIN_TUTORIAL);
  // e um nick comum continua com a skin de sempre
  const t2=await novoGuest('Fulano');
  assert.equal((await persist.hooks.onPlayerJoin({token:t2.token,fallbackNick:'Fulano'})).skinId,SKIN_TUTORIAL);
});

test('avatar: valida pelo CONTEÚDO, guarda, serve com ETag e 304',async()=>{
  const {AVATAR}=await import('@warspace/shared/constants.js');
  const t=await novoGuest('Retratado');
  const png=(w,h)=>{const b=Buffer.alloc(2048);b.write('\x89PNG\r\n\x1a\n','latin1');b.writeUInt32BE(13,8);b.write('IHDR',12,'latin1');
    b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);b[24]=8;b[25]=6;return b;};
  const post=(buf,ct='image/png')=>fetch(`${base}/api/me/avatar`,{method:'POST',
    headers:{authorization:`Bearer ${t.token}`,'content-type':ct},body:buf});
  assert.equal((await post(Buffer.from('<html>não sou imagem</html>'))).status,415,'HTML disfarçado passou');
  assert.equal((await post(Buffer.from([0xff,0xd8,0xff,0xe0,...Array(60).fill(0)]),'image/jpeg')).status,415,'JPEG não é aceito');
  assert.equal((await post(png(256,128))).status,400,'imagem não quadrada passou');
  assert.equal((await post(png(512,512))).status,400,'imagem grande demais passou');
  assert.equal((await post(Buffer.alloc(AVATAR.MAX_BYTES+2048))).status,413);
  const ok=await post(png(256,256));
  assert.equal(ok.status,200);const {avatar}=await ok.json();
  assert.match(avatar,/^[0-9a-f]{32}$/);
  assert.equal((await req('GET','/api/me',null,t.token)).body.user.avatar,avatar);
  const g=await fetch(`${base}/api/avatar/${t.userId}`);
  assert.equal(g.status,200);assert.equal(g.headers.get('content-type'),'image/png');
  assert.equal(g.headers.get('x-content-type-options'),'nosniff','sem nosniff um políglota executaria');
  const etag=g.headers.get('etag');assert.ok(etag);
  assert.equal((await fetch(`${base}/api/avatar/${t.userId}`,{headers:{'if-none-match':etag}})).status,304);
  assert.equal((await fetch(`${base}/api/me/avatar`,{method:'DELETE',headers:{authorization:`Bearer ${t.token}`}})).status,204);
  assert.equal((await fetch(`${base}/api/avatar/${t.userId}`)).status,404);
});

test('google: a rota existe e responde 503 enquanto não há credencial',async()=>{
  const r=await req('POST','/api/auth/google',{idToken:'x'});
  assert.equal(r.status,503);assert.equal(r.body.error,'google_disabled');
});

// ── LOGIN COM GOOGLE, com a rota LIGADA ───────────────────────────────────────
// A `api` de cima roda com GOOGLE_CLIENT_ID vazio de propósito (é o estado "desenhado e desligado").
// Estes testes sobem uma SEGUNDA api com a credencial preenchida e um `google` FALSO: validar de
// verdade é uma ida à rede do Google, e teste que depende de rede de terceiro não é teste.
let gserver=null,gbase='',gip=100;
/** o que o "Google" devolve para o próximo idToken; `idToken:'ok'` passa, qualquer outro é recusado */
let googleId=null;
const googleFake={enabled:true,clientId:'test.apps.googleusercontent.com',
  async verify(t){if(String(t)!=='ok')throw new Error('aud não é deste app');return googleId;}};
const subirGoogle=async()=>{
  if(gserver)return;
  const gapi=createApi({db,log,config:{...config,googleClientId:googleFake.clientId},persist,google:googleFake});
  gserver=http.createServer(async(rq,rs)=>{if(await gapi(rq,rs))return;rs.writeHead(404);rs.end();});
  await new Promise(r=>gserver.listen(0,'127.0.0.1',r));gbase=`http://127.0.0.1:${gserver.address().port}`;};
/** POST /api/auth/google — um IP por chamada, que o limite da rota é o do login (10/15min/IP) */
const greq=async(body,token)=>{
  const r=await fetch(gbase+'/api/auth/google',{method:'POST',
    headers:{'content-type':'application/json','x-forwarded-for':`10.9.0.${gip++}`,...(token?{authorization:`Bearer ${token}`}:{})},
    body:JSON.stringify(body)});
  const text=await r.text();return{status:r.status,body:text?JSON.parse(text):null};};
after(()=>{if(gserver)gserver.close();});

const G={};
test('google: nome longo do Google não barra a entrada (nick é cortado, não recusado)',async()=>{
  await subirGoogle();
  // 25 caracteres: `normalizeNick` RECUSA acima de 16 em vez de cortar, então isto era 400 invalid_nick
  googleId={subject:'sub-longo',email:'alexandre@exemplo.com',name:'Alexandre Fernandes Silva'};
  const r=await greq({idToken:'ok'});
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.user.kind,'registered');
  assert.ok(Array.from(r.body.user.nick).length<=16,`nick longo demais: ${r.body.user.nick}`);
  assert.ok(r.body.user.nick.startsWith('Alexandre'),r.body.user.nick);
  assert.equal(r.body.user.coins,config.signupCoins,'mesmo bônus de boas-vindas do guest');
  G.tok=r.body.token;G.uid=r.body.user.id;
});
test('google: o mesmo `sub` volta para a MESMA conta, sem criar outra',async()=>{
  googleId={subject:'sub-longo',email:'alexandre@exemplo.com',name:'Alexandre Fernandes Silva'};
  const r=await greq({idToken:'ok'});
  assert.equal(r.status,200);assert.equal(r.body.user.id,G.uid);
  assert.notEqual(r.body.token,G.tok,'sessão nova, token novo');
  const {rows}=await db.query(`SELECT count(*)::int AS n FROM users WHERE email='alexandre@exemplo.com'`);
  assert.equal(rows[0].n,1,'não pode ter nascido uma segunda conta');
});
test('google: convidado com Bearer é PROMOVIDO — mesmo id, moedas e skins preservadas',async()=>{
  const g=await novoGuest('ConvidadoG');
  googleId={subject:'sub-guest',email:'convidado@exemplo.com',name:'Convidado G'};
  const r=await greq({idToken:'ok'},g.token);
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.user.id,g.userId,'a conta é a MESMA: é isso que salva moedas e skins do convidado');
  assert.equal(r.body.user.kind,'registered');
  assert.equal(r.body.user.coins,config.signupCoins);
});
test('google: e-mail que já é de uma conta com senha VINCULA, em vez de estourar users_email_uq',async()=>{
  const g=await novoGuest('DonoDoEmail');
  const c=await req('POST','/api/auth/claim',{password:'segredo123',email:'dono@exemplo.com'},g.token);
  assert.equal(c.status,200,JSON.stringify(c.body));
  googleId={subject:'sub-dono',email:'dono@exemplo.com',name:'Dono'};
  const r=await greq({idToken:'ok'});
  assert.equal(r.status,200,'isto era 500: o INSERT batia no índice único do e-mail');
  assert.equal(r.body.user.id,g.userId,'entra na conta que já era dona do e-mail');
  const {rows}=await db.query(`SELECT user_id FROM user_identities WHERE provider='google' AND subject='sub-dono'`);
  assert.equal(Number(rows[0].user_id),g.userId,'a identidade ficou ligada ÀQUELA conta');
});
test('google: id_token que não valida vira 401, nunca 500',async()=>{
  googleId={subject:'sub-outro',email:'outro@exemplo.com',name:'Outro'};
  const r=await greq({idToken:'emitido-para-outro-app'});
  assert.equal(r.status,401);assert.equal(r.body.error,'invalid_credentials');
});

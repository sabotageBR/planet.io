// ── Painel /admin ponta a ponta: autenticação, contas, salas, aviso e parâmetros ──
// Precisa de banco (a identidade do admin é uma linha de `users`). node --test server/test/admin.test.js
//
// O que estes testes travam, em ordem de "quão silencioso seria o bug":
//  1. o PREFIXES de api/index.js — sem a família `admin` lá, `/api/admin/login` cai em 404 com corpo de
//     HTML e nenhuma linha de log. Por isso o teste espera 401, nunca 404.
//  2. o token do PAINEL ser de outro `kind` — se alguém "simplificar" isso aceitando token de sessão, o
//     painel volta a ser roubável junto com a aba do jogo.
//  3. `/api/admin/login` não virar oráculo de quem é administrador (mesmo 401 nos dois casos).
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(!process.env.DATABASE_URL){try{for(const l of readFileSync(path.join(ROOT,'.env'),'utf8').split('\n')){const m=/^\s*([A-Z_]+)=(.*)$/.exec(l);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim();}}catch{}}
process.env.LOG_LEVEL=process.env.TEST_LOG||'silent';process.env.SHARD='0';process.env.SHARDS='1';process.env.PEERS='';
const {startServer}=await import('../src/index.js');
const {POWERUP}=await import('@warspace/shared/constants.js');
const {resetTunable}=await import('@warspace/shared/tunables.js');

let srv,base,semBanco=false;
let jogo=null,painel=null,conta=null;
let nIp=0;
const J=async(m,p,b,t)=>{const h={'content-type':'application/json','x-forwarded-for':`10.66.${(nIp>>8)&255}.${(nIp++)&255}`};
  if(t)h.authorization='Bearer '+t;
  const corpo=(m==='GET'||m==='HEAD')?undefined:(b===undefined||b===null?undefined:JSON.stringify(b));
  const r=await fetch(base+p,{method:m,headers:h,body:corpo});
  return{s:r.status,j:await r.json().catch(()=>null)};};

before(async()=>{
  srv=await startServer({port:0,logLevel:process.env.LOG_LEVEL,migrateOnStart:false});
  base=`http://127.0.0.1:${srv.port}`;
  const g=await J('POST','/api/auth/guest',{});
  if(g.s!==201){semBanco=true;return;}
  jogo=g.j.token;
  const senha='painel-de-teste-123';
  // ⚠️ NICK PRÓPRIO antes de registrar. O nick ficou livre, mas o claim CONGELA o nick da hora como
  // `login` (é o fallback quando o corpo não manda um), e o login é único: registrar como "Viajante-NNNN"
  // reservaria para sempre um dos 9000 nomes do gerador, e a próxima execução esbarraria em `login_taken`
  // num banco de dev que ninguém limpa entre execuções.
  await J('PATCH','/api/me',{nick:`Adm${Date.now()%1e8}`},jogo);
  const cl=await J('POST','/api/auth/claim',{password:senha,email:`admin${Date.now()}@teste.local`},jogo);
  if(cl.s!==200){semBanco=true;return;}
  conta={id:cl.j.user.id,nick:cl.j.user.nick,login:cl.j.user.login||cl.j.user.nick,senha};
  // O primeiro admin nasce por SQL (ou por ADMIN_EMAILS no boot) — é de propósito que não haja rota para isso.
  await srv.db.query('UPDATE users SET is_admin=true WHERE id=$1',[conta.id]);
  painel=(await J('POST','/api/admin/login',{login:conta.login,password:conta.senha})).j.token;
});
after(async()=>{if(srv)await srv.close();resetTunable('POWERUP.MAGNET_MAX_R');});
const pula=()=>{if(semBanco)return true;return false;};

test('admin: a rota EXISTE (o PREFIXES de api/index.js) e recusa quem não é admin com o MESMO 401',async t=>{
  if(pula())return t.skip('sem banco');
  const g=await J('POST','/api/auth/guest',{});
  const senha='outra-senha-123';
  await J('PATCH','/api/me',{nick:`Zé${Date.now()%1e8}`},g.j.token);   // ver a nota do `before`
  const cl=await J('POST','/api/auth/claim',{password:senha,email:`ze${Date.now()}@teste.local`},g.j.token);
  const naoAdmin=await J('POST','/api/admin/login',{login:cl.j.user.login||cl.j.user.nick,password:senha});
  const senhaErrada=await J('POST','/api/admin/login',{login:conta.login,password:'errada'});
  assert.equal(naoAdmin.s,401,'⚠️ 404 aqui significa que a família `admin` sumiu do PREFIXES');
  assert.equal(senhaErrada.s,401);
  assert.deepEqual(naoAdmin.j,senhaErrada.j,'a resposta tem que ser IDÊNTICA: senão a rota diz quem é admin');
});

test('admin: o token do JOGO não abre o painel, e o do painel abre',async t=>{
  if(pula())return t.skip('sem banco');
  assert.equal((await J('GET','/api/admin/me',null,jogo)).s,403,'token de sessão do jogo não serve');
  assert.equal((await J('GET','/api/admin/me',null,null)).s,401,'sem token, 401');
  const me=await J('GET','/api/admin/me',null,painel);
  assert.equal(me.s,200);assert.equal(me.j.admin.nick,conta.nick);
});

test('admin: a lista de contas não despeja e-mails; o detalhe traz',async t=>{
  if(pula())return t.skip('sem banco');
  const l=await J('GET','/api/admin/users?limit=5',null,painel);
  assert.equal(l.s,200);assert.ok(l.j.users.length);
  for(const u of l.j.users)assert.ok(!('email' in u),'e-mail é do DETALHE, não da busca');
  const d=await J('GET','/api/admin/users/'+conta.id,null,painel);
  assert.equal(d.s,200);assert.equal(d.j.user.id,conta.id);
  assert.ok(!('password_hash' in d.j.user),'⚠️ o hash da senha NUNCA sai — é por um spread distraído que ele vaza');
  assert.ok(Array.isArray(d.j.tokens)&&Array.isArray(d.j.matches));
});

test('admin: banir derruba as sessões, e ninguém bane a si mesmo nem rebaixa o último admin',async t=>{
  if(pula())return t.skip('sem banco');
  const g=await J('POST','/api/auth/guest',{});
  const alvo=(await J('GET','/api/me',null,g.j.token)).j.user.id;
  const b=await J('POST',`/api/admin/users/${alvo}/ban`,{days:3,reason:'teste'},painel);
  assert.equal(b.s,200);assert.ok(b.j.user.bannedUntil,'a data responde "banido?" e "até quando?"');
  assert.equal((await J('GET','/api/me',null,g.j.token)).s,401,'banir sem derrubar as sessões não bane nada');
  assert.equal((await J('POST',`/api/admin/users/${alvo}/ban`,{days:0},painel)).j.user.bannedUntil,null,'days:0 desbane');
  assert.equal((await J('POST',`/api/admin/users/${conta.id}/ban`,{days:1},painel)).s,409,'não se bane a si mesmo');
  assert.equal((await J('POST',`/api/admin/users/${conta.id}/admin`,{on:false},painel)).s,409,'nem se rebaixa a si mesmo');
});

test('admin: o parâmetro do painel chega à CONSTANTE viva, e a faixa é respeitada',async t=>{
  if(pula())return t.skip('sem banco');
  const st=await J('GET','/api/admin/settings',null,painel);
  assert.equal(st.s,200);assert.ok(st.j.tunables.length>5);
  const ima=st.j.tunables.find(x=>x.key==='POWERUP.MAGNET_MAX_R');
  assert.ok(ima&&ima.unit==='massa','o admin digita MASSA, que é o número que o jogador lê no HUD');
  const put=await J('PUT','/api/admin/settings/POWERUP.MAGNET_MAX_R',{value:250000},painel);
  assert.equal(put.s,200);assert.equal(put.j.value,250000);
  assert.ok(Math.abs(POWERUP.MAGNET_MAX_R-500)<1e-6,'e a física passa a ler 500 px sem reiniciar nada');
  assert.equal((await J('PUT','/api/admin/settings/POWERUP.MAGNET_MAX_R',{value:9e9},painel)).s,400,'fora da faixa');
  assert.equal((await J('PUT','/api/admin/settings/NAO.EXISTE',{value:1},painel)).s,400,'chave fora da lista branca');
  // 'both' = o cliente também lê. Recusar é honesto; gravar seria fingir que funciona (a predição divergiria).
  assert.equal((await J('PUT','/api/admin/settings/PLAYER.MAX_R',{value:500},painel)).s,501);
  assert.equal((await J('DELETE','/api/admin/settings/POWERUP.MAGNET_MAX_R',null,painel)).s,200);
  assert.ok(Math.abs(POWERUP.MAGNET_MAX_R-Math.sqrt(1e5))<.5,'restaurar volta ao valor de constants.js');
});

test('admin: salas, kick de slot reciclado e aviso global',async t=>{
  if(pula())return t.skip('sem banco');
  const r=await J('GET','/api/admin/rooms',null,painel);
  assert.equal(r.s,200);assert.ok(Array.isArray(r.j.rooms));
  assert.equal((await J('GET','/api/admin/rooms/ZZZZ',null,painel)).s,404,'sala inexistente é 404 — e NÃO é criada');
  assert.equal(srv.rooms.rooms.get('ZZZZ'),undefined,'⚠️ `getRoom` criaria a sala; o painel só lê o Map');
  const bc=await J('POST','/api/admin/broadcast',{text:'  aviso   de   teste  ',level:'warn'},painel);
  assert.equal(bc.s,200);assert.equal(typeof bc.j.delivered,'number');
  assert.equal((await J('POST','/api/admin/broadcast',{text:'   '},painel)).s,400,'mensagem vazia não sai');
});

test('admin: toda ação mutante deixa rastro na auditoria',async t=>{
  if(pula())return t.skip('sem banco');
  // filtrado por ESTE admin: o banco de dev guarda o rastro das execuções anteriores, e a auditoria não
  // é apagada de propósito — é justamente o log que não pode sumir.
  const a=await J('GET',`/api/admin/audit?limit=100&adminId=${conta.id}`,null,painel);
  assert.equal(a.s,200);
  assert.ok(a.j.rows.length,'este admin fez coisas nesta execução');
  assert.ok(a.j.rows.every(x=>x.adminId===conta.id),'o filtro por admin funciona — é como se acha o que alguém fez');
  const acoes=new Set(a.j.rows.map(x=>x.action));
  for(const esperada of ['login','ban','unban','setting','setting_reset','broadcast'])
    assert.ok(acoes.has(esperada),`falta a linha de auditoria de "${esperada}" (tem: ${[...acoes].join(',')})`);
});

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

// ── O DETALHE DE UMA SALA TRAZ O QUE SÓ O BANCO SABE ─────────────────────────
// A linha de cada jogador é memória do shard (nome, massa, os dois relógios) MAIS duas colunas que vêm de
// `users`/`user_stats`: de onde a conta veio e quanto ela já jogou no total. Elas são coladas no ponto de
// SAÍDA (`fichaJogadores`), depois do `askPeers` — feito no shard dono, uma sala cujo código pertencesse a
// um pod em build antiga voltaria sem as colunas e sem sinal nenhum.
// ⚠️ E a ORDENAÇÃO é depois da colagem: `by=total` e `by=origem` leem campos que não existem antes dela.
test('admin: o detalhe da sala traz origem e tempo total de cada jogador',async t=>{
  if(pula())return t.skip('sem banco');
  const sala=srv.rooms.findOrCreateRoom({});
  // Sessão no molde de espectador.test.js: o painel só lê `Room.adminInfo`, não abre socket.
  const sessao={ws:{},sendJson(){},send(){return true;},known:new Map(),detach(){},
    name:'admin-teste',userId:conta.id,key:null,level:0,avatar:null,country:null,sessionId:null,unsaved:true,
    isAdmin:false,slot:-1,room:null,pid:0,rect:null,specSlot:-1,espectador:false,lastActiveAt:Date.now()};
  sala.join(sessao,{name:'admin-teste',userId:conta.id});
  try{
    const d=await J('GET',`/api/admin/rooms/${sala.code}`,null,painel);
    assert.equal(d.s,200);
    const p=(d.j.room.players||[]).find(x=>x.slot===sessao.slot);
    assert.ok(p,'o jogador tem que estar na lista');
    assert.equal(typeof p.totalS,'number','o acumulado da CONTA (user_stats.play_time_s), não desta visita');
    assert.ok('origem' in p,'origem é `null` para conta nascida no site — ausência é informação, não buraco');
    // e os dois ordenam, senão o cabeçalho clicável mentiria
    for(const by of ['total','origem']){
      const o=await J('GET',`/api/admin/rooms/${sala.code}?by=${by}&dir=asc`,null,painel);
      assert.equal(o.s,200,`ordenar por ${by}`);
      assert.ok(Array.isArray(o.j.room.players));}
  }finally{sala.leave(sessao,'left');}
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

// ── ordenação e paginação ─────────────────────────────────────────────────────
// O teste que importa é o primeiro: ele prova que a ordenação é do CONJUNTO e não da página. Ordenar as
// 50 linhas que já vieram e chamar isso de "por moedas" mostraria o mais rico entre as 50 contas mais
// RECENTES — e a tela ficaria certa dizendo uma coisa falsa.
test('admin: a ordenação é do CONJUNTO, não da página que já veio',async t=>{
  if(pula())return t.skip('sem banco');
  // três contas novas (logo, as mais recentes por id) com moedas em ordem inversa à de criação
  const ricos=[];
  for(const moedas of [11,22,33]){
    const g=await J('POST','/api/auth/guest',{});
    await J('POST',`/api/admin/users/${g.j.user.id}/coins`,{delta:moedas,reason:'teste-ordem'},painel);
    ricos.push({id:g.j.user.id,moedas});}
  const r=await J('GET','/api/admin/users?by=coins&dir=desc&limit=2',null,painel);
  assert.equal(r.s,200);
  assert.equal(r.j.by,'coins');assert.equal(r.j.dir,'desc');   // o ECO: é dele que a tela desenha o indicador
  assert.equal(r.j.users.length,2,'a página tem o tamanho pedido, não o limit+1 da sonda de `more`');
  const c=r.j.users.map(u=>u.coins);
  assert.deepEqual(c,[...c].sort((a,b)=>b-a),'veio ordenado');
  assert.ok(c[0]>=33,`o topo é o mais RICO da base (veio ${c[0]}), não o mais recente`);
  const asc=await J('GET','/api/admin/users?by=coins&dir=asc&limit=2',null,painel);
  assert.ok(asc.j.users[0].coins<=c[0],'e a direção inverte de verdade');
});

test('admin: `by` inválido é 400 — e `by=constructor` também é 400, nunca 500',async t=>{
  if(pula())return t.skip('sem banco');
  // ⚠️ Este é o teste que trava a lista branca em `Map`: num objeto literal, `BY['constructor']` é truthy,
  // `.expr` sai indefinido e a rota estoura em 500 — um 500 alcançável por qualquer URL.
  for(const by of ['xpto','constructor','__proto__','u.id; DROP TABLE users']){
    const r=await J('GET',`/api/admin/users?by=${encodeURIComponent(by)}`,null,painel);
    assert.equal(r.s,400,`by=${by} tem que ser 400 (veio ${r.s})`);
    assert.equal(r.j.error,'bad_by');}
  const d=await J('GET','/api/admin/users?dir=meio-termo',null,painel);
  assert.equal(d.s,400);assert.equal(d.j.error,'bad_dir');
  const a=await J('GET','/api/admin/audit?by=detail',null,painel);
  assert.equal(a.s,400,'jsonb não é ordenável e não está na lista branca');
});

test('admin: o cursor keyset e a ordenação não se misturam em silêncio',async t=>{
  if(pula())return t.skip('sem banco');
  // `before` é `id<$n`: só é uma POSIÇÃO quando a ordem é por id. Ignorá-lo em silêncio pularia um pedaço
  // do conjunto sem ninguém perceber, então é 400.
  const x=await J('GET','/api/admin/users?by=coins&before=99999',null,painel);
  assert.equal(x.s,400);assert.equal(x.j.error,'cursor_conflict');
  const o=await J('GET','/api/admin/users?by=coins&offset=99999999',null,painel);
  assert.equal(o.s,400);assert.equal(o.j.error,'offset_max');
  // na ordem padrão o keyset continua valendo, byte a byte como antes
  const p1=await J('GET','/api/admin/users?limit=2',null,painel);
  assert.equal(p1.s,200);assert.equal(p1.j.more,true,'há mais de 2 contas no banco de dev');
  assert.ok(p1.j.next&&p1.j.next.before,'o cursor da ordem padrão é keyset');
  const p2=await J('GET',`/api/admin/users?limit=2&before=${p1.j.next.before}`,null,painel);
  assert.ok(p2.j.users.every(u=>u.id<p1.j.next.before),'a página seguinte não repete a anterior');
  // e com ordenação o regime vira offset, sem o cliente precisar saber
  const q1=await J('GET','/api/admin/users?by=coins&dir=desc&limit=2',null,painel);
  assert.ok(q1.j.next&&q1.j.next.offset===2,'o cursor da ordenação é offset');
});

test('admin: `more`/`next` dizem a VERDADE na última página',async t=>{
  if(pula())return t.skip('sem banco');
  // Era aqui que o `next` mentia: ele vinha preenchido mesmo sem próxima página, e um botão "carregar
  // mais" ficaria eterno trazendo nada. `more` sai de pedir limit+1 — sem segunda consulta.
  const r=await J('GET','/api/admin/users?q=nao-existe-esse-nick-zzz&limit=10',null,painel);
  assert.equal(r.s,200);
  assert.equal(r.j.users.length,0);
  assert.equal(r.j.more,false);
  assert.equal(r.j.next,null,'sem próxima página, não há cursor');
});

test('admin: LEITURA não audita — ordenar não pode afogar o log de ban/kick',async t=>{
  if(pula())return t.skip('sem banco');
  // `admin_audit` não tem retenção automática por decisão (migração 0008): é log de baixo volume, e uma
  // linha por clique de cabeçalho enterraria as linhas que são a razão de a tabela existir.
  const antes=(await J('GET',`/api/admin/audit?limit=200&adminId=${conta.id}`,null,painel)).j.rows.length;
  for(const u of ['?by=coins&dir=asc','?by=nick','?by=seen&dir=desc','?by=id','?by=xp'])
    assert.equal((await J('GET','/api/admin/users'+u,null,painel)).s,200);
  const depois=(await J('GET',`/api/admin/audit?limit=200&adminId=${conta.id}`,null,painel)).j.rows.length;
  assert.equal(depois,antes,'nenhuma linha de auditoria nasceu de uma leitura');
});

test('admin: as rotas em MEMÓRIA ordenam e ecoam o que valeu',async t=>{
  if(pula())return t.skip('sem banco');
  const r=await J('GET','/api/admin/rooms?by=code&dir=asc',null,painel);
  assert.equal(r.s,200);
  assert.equal(r.j.by,'code');assert.equal(r.j.dir,'asc');
  const cs=r.j.rooms.map(x=>x.code);
  assert.deepEqual(cs,[...cs].sort(),'a lista sai ordenada pelo código');
  // ⚠️ `by` fora da lista NÃO é 400 aqui (esta rota não passa pelo router de erros do api/): ele cai no
  // padrão E O ECO DIZ ISSO, que é o que impede a tela de anunciar uma ordenação que não aconteceu.
  const x=await J('GET','/api/admin/rooms?by=constructor',null,painel);
  assert.equal(x.s,200);assert.equal(x.j.by,'humans','caiu no padrão, e o eco não mente');
});

// ── A JANELA DA RETENÇÃO ──────────────────────────────────────────────────────
// O filtro era `?days=` costurado como `now()-($1||' days')::interval` nas seis consultas, e "dia atual"
// não cabe nesse molde (é `>= date_trunc('day',now())`, um instante). A troca por lista branca traz junto
// as duas invariantes que o painel inteiro segue: valor fora da lista é 400 (nunca fallback silencioso, que
// deixaria a tela dizendo "1 hora" sobre números de duas semanas) e a resposta ECOA o que o servidor FEZ.
test('admin: a janela da retenção é lista branca — fora dela é 400, nunca fallback',async t=>{
  if(pula())return t.skip('sem banco');
  const r=await J('GET','/api/admin/retencao?janela=constructor',null,painel);
  assert.equal(r.s,400,'com objeto literal isto seria 500 alcançável pela URL — daí o Map');
  assert.equal(r.j.error,'bad_janela');
  const r2=await J('GET','/api/admin/retencao?janela=365d',null,painel);
  assert.equal(r2.s,400,'não há entrada maior que 90d: o teto de antes vale por construção');
});

test('admin: a resposta ECOA a janela e o MODO — a tela desenha o que o servidor fez',async t=>{
  if(pula())return t.skip('sem banco');
  const curta=await J('GET','/api/admin/retencao?janela=1h',null,painel);
  assert.equal(curta.s,200);
  assert.equal(curta.j.janela,'1h');
  assert.equal(curta.j.modo,'atividade','abaixo de um dia a base é quem JOGOU, não quem criou conta');
  assert.deepEqual(curta.j.coortes,[],'D1/D7/D30 é diário por definição — some na janela curta');
  const longa=await J('GET','/api/admin/retencao?janela=30d',null,painel);
  assert.equal(longa.j.janela,'30d');
  assert.equal(longa.j.modo,'coorte');
});

test('admin: `?days=` continua aceito — painel antigo contra pod novo',async t=>{
  if(pula())return t.skip('sem banco');
  const r=await J('GET','/api/admin/retencao?days=14',null,painel);
  assert.equal(r.s,200);
  assert.equal(r.j.janela,'14d');
  const r2=await J('GET','/api/admin/retencao?days=999',null,painel);
  assert.equal(r2.j.janela,'90d','o teto de 90 dias existe porque as consultas varrem `matches` no pool do jogo');
});

test('admin: a lista de janelas vem do SERVIDOR — o <select> não a duplica',async t=>{
  if(pula())return t.skip('sem banco');
  const r=await J('GET','/api/admin/retencao/janelas',null,painel);
  assert.equal(r.s,200);
  assert.ok(r.j.janelas.some(j=>j.id==='hoje'),'duplicando a lista no cliente, ela divergiria na primeira janela nova');
  assert.ok(r.j.janelas.some(j=>j.id==='1h'&&j.modo==='atividade'));
  assert.equal(r.j.padrao,'14d');
});

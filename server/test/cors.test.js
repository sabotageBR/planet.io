// ── CORS: o cliente hospedado por um portal (outro domínio) falando com esta API ──────────────
// SEM BANCO, de propósito: nada aqui precisa de Postgres, e este arquivo NÃO lê o `.env` da raiz —
// que aponta para PRODUÇÃO. É o mesmo cuidado que o cabeçalho de persist.test.js explica; ler o .env
// "só para pegar o LOG_LEVEL" é como um teste acaba conversando com o banco de verdade.
// node --test server/test/cors.test.js
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {readFileSync} from 'node:fs';
process.env.LOG_LEVEL='silent';process.env.SHARD='0';process.env.SHARDS='1';process.env.PEERS='';
process.env.DATABASE_URL='';process.env.ALLOWED_ORIGINS='';process.env.WS_ORIGIN_CHECK='off';
const {startServer}=await import('../src/index.js');
const {createOriginMatcher}=await import('../src/http/cors.js');
const {PROTOCOL_VERSION}=await import('@warspace/shared/protocol/index.js');
const {ENTRY_PANELS,ENTRY,TUTORIAL}=await import('@warspace/shared/constants.js');

const PORTAL='https://html5.gamedistribution.com',MAU='https://evil.example';
const LISTA=[PORTAL,'https://*.itch.zone','https://*.crazygames.com'];
/** Sobe um servidor isolado; `startServer` mescla os overrides sobre o config congelado. */
const sobe=async o=>{const s=await startServer({port:0,databaseUrl:'',logLevel:'silent',role:'both',...o});
  return {srv:s,base:`http://127.0.0.1:${s.port}`,ws:`ws://127.0.0.1:${s.port}`};};
const h=(r,n)=>r.headers.get(n);

// ── o matcher, isolado: é aqui que mora a vulnerabilidade clássica de CORS ───────────────────
test('matcher: exato, sufixo, e tudo que PARECE mas não é', () => {
  const ok=createOriginMatcher(LISTA);
  assert.equal(ok(PORTAL),true);
  assert.equal(ok('HTTPS://HTML5.GAMEDISTRIBUTION.COM'),true,'normaliza caixa');
  assert.equal(ok(PORTAL+'/'),true,'barra final é ruído');
  assert.equal(ok('https://html-classic.itch.zone'),true,'sufixo');
  assert.equal(ok('https://itch.zone'),true,'o ápice do sufixo entra');
  assert.equal(ok('https://www.crazygames.com'),true);
  // os quatro que um `includes`/`startsWith` deixaria passar
  assert.equal(ok('https://evilhtml5.gamedistribution.com'),false);
  assert.equal(ok('https://html5.gamedistribution.com.evil.tld'),false);
  assert.equal(ok('https://notitch.zone'),false);
  assert.equal(ok('http://html5.gamedistribution.com'),false,'esquema conta');
  assert.equal(ok('https://html5.gamedistribution.com:8443'),false,'porta conta');
  // "null" é o Origin de um iframe com sandbox, de data: e de file: — qualquer atacante produz um
  assert.equal(ok('null'),false);assert.equal(ok(''),false);assert.equal(ok(undefined),false);
});
// ⚠️ A LISTA QUE VAI PARA PRODUÇÃO, contra a origem em que cada portal SERVE o jogo de fato. Esta é a
// única falha desta camada que ninguém vê: o pacote sobe, carrega, desenha o menu — e o JOGAR não
// conecta, dias depois, no domínio de outra pessoa. As origens abaixo foram MEDIDAS (o documento de
// dentro do iframe, não a página em volta): `storage.y8.com` é onde o Y8 põe um zip de estúdio, e
// `www.y8.com` seria a resposta errada. Falhar aqui = a entrada foi estreitada ou perdida no ConfigMap.
test('a lista do ConfigMap aceita a origem real de cada portal empacotado', () => {
  const yaml=readFileSync(new URL('../../k8s/05-config.yaml',import.meta.url),'utf8');
  const linha=/^\s*ALLOWED_ORIGINS:\s*"([^"]*)"/m.exec(yaml);
  assert.ok(linha,'ALLOWED_ORIGINS sumiu do k8s/05-config.yaml');
  const ok=createOriginMatcher(linha[1].split(',').map(s=>s.trim()));
  for(const [portal,origem] of [
    ['GameDistribution','https://html5.gamedistribution.com'],
    ['GD (revisão)','https://revision.gamedistribution.com'],
    ['CrazyGames','https://games.crazygames.com'],
    // ⚠️ A Poki tem TRÊS hosts e só o último importa: `poki.com` é o portal, `games.poki.com` é o
    // invólucro que embute o jogo, e o nosso código roda em `<gameId>.gdn.poki.com/<buildId>/index.html`
    // — medido no preview do warspace.io. `https://*.poki.com` cobre os três, mas quem tem que estar
    // travado aqui é a origem do DOCUMENTO que faz as chamadas.
    ['Poki (invólucro)','https://games.poki.com'],
    // ⚠️ A POKI TEM CINCO DOMÍNIOS, e o `poki.com` é só o de cima. As FERRAMENTAS de desenvolvedor
    // moram noutros TLDs — o Game Inspector é `inspector.poki.dev` e conversa com
    // `inspector-api.poki.io` (lido no bundle dele) —, o SDK busca ícones em `a.poki-cdn.com` (medido
    // no nosso próprio pacote rodando) e os JOGOS de terceiros são servidos de `poki-gdn.com` e
    // `poki-user-content.com` (certificados `*.poki-gdn.com` / `*.poki-user-content.com`, e é por eles
    // que o Playgama Bridge reconhece a plataforma Poki). Faltando qualquer um, o sintoma é o de
    // sempre: carrega, desenha o menu e o JOGAR não conecta — foi o que a QA deles devolveu como
    // "SEM CONTATO COM A BASE" dentro do Inspector. Mesma lição do `.net` da QA Tool do Playgama.
    ['Poki (Inspector)','https://inspector.poki.dev'],
    ['Poki (API do Inspector)','https://inspector-api.poki.io'],
    ['Poki (CDN do SDK)','https://a.poki-cdn.com'],
    ['Poki (jogos)','https://poki-gdn.com'],
    ['Poki (conteúdo de usuário)','https://x.poki-user-content.com'],
    ['Poki (o jogo)','https://78e41599-1082-4fac-b0d9-2436753ddd5d.gdn.poki.com'],
    ['itch.io','https://html-classic.itch.zone'],
    ['Y8','https://storage.y8.com'],
    // ⚠️ o jogo do GameMonetize roda no `.co`, não no `.com` do site — foi medido no feed deles
    ['GameMonetize','https://html5.gamemonetize.co'],
    // ⚠️ e o do GameFlare roda no `data.`, não no `www.` nem no `distribution.` — os dois últimos são a
    // página em volta; o iframe do jogo HTML5 vem de data.gameflare.com/games/<id>/<hash>/index.html
    ['GameFlare','https://data.gameflare.com'],
    // ⚠️ o jogo do Playgama roda num SUBDOMÍNIO POR JOGO de `games.playgama.com`, não em playgama.com:
    // medido na API pública deles (`/api/v1/games/<hru>`), o `game_url` de um jogo hospedado lá é
    // `https://<hru>.games.playgama.com/<build>/__patch__/<patch>/index.html?platform_id=playgama`
    ['Playgama','https://warspace-io.games.playgama.com'],
    ['Playgama (QA/painel)','https://developer.playgama.com'],
    // ⚠️ E A QA TOOL SERVE DE OUTRO TLD: o jogo PUBLICADO roda em `<hru>.games.playgama.com` (medido na
    // API pública deles), mas o build que a QA Tool executa vem de `<buildId>.games.playgama.NET` —
    // medido no iframe de `developer.playgama.com/qa-tool/<id>`. `*.playgama.com` não cobre `.net`, e o
    // sintoma é o de sempre: carrega, desenha o menu e o JOGAR não conecta — só que ANTES de submeter,
    // dentro da ferramenta com que eles certificam o jogo. Os dois TLDs ficam liberados.
    ['Playgama (build da QA Tool)','https://cmtjhs0gp0u0oo10hxbe5wn9d.games.playgama.net'],
    // ⚠️ o jogo do GamePix NÃO roda no domínio do site nem no do player: `www.gamepix.com` é o
    // portal, `play.gamepix.com/<ns>/embed` é o player que o embute, e o nosso código roda em
    // `https://games.builds.gamepix.com/<gameId>/<version>/index.html` — medido no `GameFrame` do
    // player deles (`CDNGamesSrc`) e conferido baixando o index.html de um jogo publicado
    ['GamePix','https://games.builds.gamepix.com'],
    ['GamePix (player)','https://play.gamepix.com'],
  ]) assert.equal(ok(origem),true,`${portal}: ${origem} deixou de ser aceita`);
  assert.equal(ok('https://storage.y8.com.evil.tld'),false,'e o sufixo continua sendo sufixo');
  assert.equal(ok('https://data.gameflare.com.evil.tld'),false,'e o sufixo continua sendo sufixo');
  assert.equal(ok('https://games.playgama.com.evil.tld'),false,'e o sufixo continua sendo sufixo');
  assert.equal(ok('https://games.playgama.net.evil.tld'),false,'e o sufixo continua sendo sufixo');
  assert.equal(ok('https://games.builds.gamepix.com.evil.tld'),false,'e o sufixo continua sendo sufixo');
});

test('matcher: entrada quebrada é DESCARTADA, nunca vira "casa tudo"', () => {
  // `https://` é o que sobra de `https://__HOST__` quando se aplica com NO_INGRESS=1
  const ok=createOriginMatcher(['https://','warspace.io','*','',null,'https://*.']);
  for(const o of [PORTAL,MAU,'https://qualquer.coisa','https://warspace.io'])assert.equal(ok(o),false,o);
});

// ── a camada desligada: NEM UM BYTE a mais em resposta nenhuma ───────────────────────────────
test('lista vazia = comportamento de hoje, byte a byte', async () => {
  const {srv,base}=await sobe({allowedOrigins:[]});
  try{
    const r=await fetch(base+'/api/config',{headers:{Origin:PORTAL}});
    assert.equal(r.status,200);
    assert.equal(h(r,'access-control-allow-origin'),null);
    assert.equal(h(r,'vary'),null);
    // O contrato de /api/config é o mesmo que game.test.js trava; o CORS não pode encostar nele.
    // ⚠️ Os campos que são VALOR de tunable saem da constante, e não de um literal repetido: quem trava o
    // contrato (e portanto tem que ser editado quando ele muda) é game.test.js. Aqui o assunto é CORS, e
    // duplicar o padrão faria uma decisão de produto quebrar dois arquivos em vez de um.
    assert.deepEqual(await r.json(),{shards:1,shard:0,roomMax:srv.config.roomMax,protocol:PROTOCOL_VERSION,googleClientId:'',
      entryPanels:{free:ENTRY_PANELS.FREE,br:ENTRY_PANELS.BR,own:ENTRY_PANELS.OWN,squad:ENTRY_PANELS.SQUAD,code:ENTRY_PANELS.CODE,order:ENTRY_PANELS.ORDER},
      entraDireto:ENTRY.DIRETO,tutorial:TUTORIAL.PLATAFORMAS});
    // sem a camada, o OPTIONS continua caindo no roteamento normal: 405 no router de party e — sem
    // banco — 503 nas rotas de conta. O que importa é que NÃO vira o 204 do preflight, e que segue seco.
    const p=await fetch(base+'/api/party/0ABC',{method:'OPTIONS',headers:{Origin:PORTAL}});
    assert.equal(p.status,405);assert.equal(h(p,'access-control-allow-origin'),null);
    const q=await fetch(base+'/api/me',{method:'OPTIONS',headers:{Origin:PORTAL}});
    assert.notEqual(q.status,204);assert.equal(h(q,'access-control-allow-origin'),null);
  }finally{await srv.close();}
});

// ── ligada ───────────────────────────────────────────────────────────────────────────────────
test('origem permitida: eco + Vary, preflight 204 e o 503 sem banco também com header', async () => {
  const {srv,base}=await sobe({allowedOrigins:LISTA});
  try{
    const c=await fetch(base+'/api/config',{headers:{Origin:PORTAL}});
    assert.equal(h(c,'access-control-allow-origin'),PORTAL);
    assert.equal(h(c,'vary'),'Origin');
    assert.deepEqual(await c.json(),{shards:1,shard:0,roomMax:srv.config.roomMax,protocol:PROTOCOL_VERSION,googleClientId:'',
      entryPanels:{free:ENTRY_PANELS.FREE,br:ENTRY_PANELS.BR,own:ENTRY_PANELS.OWN,squad:ENTRY_PANELS.SQUAD,code:ENTRY_PANELS.CODE,order:ENTRY_PANELS.ORDER},
      entraDireto:ENTRY.DIRETO,tutorial:TUTORIAL.PLATAFORMAS});

    const pre=await fetch(base+'/api/me',{method:'OPTIONS',headers:{Origin:PORTAL,
      'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'}});
    assert.equal(pre.status,204);assert.equal(await pre.text(),'');
    assert.equal(h(pre,'access-control-allow-origin'),PORTAL);
    const met=h(pre,'access-control-allow-methods')||'';
    // PATCH é prefs/nick/país e DELETE é o avatar: uma lista só com GET/POST passa no boot e quebra
    // na primeira troca de preferência — exatamente o tipo de falha que chega em produção
    for(const m of ['GET','POST','PATCH','DELETE'])assert.ok(met.includes(m),m);
    const cab=(h(pre,'access-control-allow-headers')||'').toLowerCase();
    assert.ok(cab.includes('authorization')&&cab.includes('content-type'));
    assert.ok(Number(h(pre,'access-control-max-age'))>0);

    // preflight de /api/party/:code prova que ele passa NA FRENTE da tabela de métodos do http/api.js
    assert.equal((await fetch(base+'/api/party/0ABC',{method:'OPTIONS',headers:{Origin:PORTAL}})).status,204);

    // ⚠️ o teste mais valioso do arquivo: esta resposta é escrita com `writeHead` CRU, então ela prova
    // que o setHeader do topo é mesclado — e é ela que o cliente no portal precisa LER para cair no
    // modo offline em vez de tomar um NetworkError opaco.
    const semBanco=await fetch(base+'/api/me',{headers:{Origin:PORTAL,Authorization:'Bearer pt_x'}});
    assert.equal(semBanco.status,503);
    assert.equal(h(semBanco,'access-control-allow-origin'),PORTAL);
    assert.equal((await semBanco.json()).error,'unreachable');

    // erro comum também tem que ser legível cross-origin
    const nf=await fetch(base+'/api/party/ZZZZ',{headers:{Origin:PORTAL}});
    assert.equal(h(nf,'access-control-allow-origin'),PORTAL);
  }finally{await srv.close();}
});

test('origem proibida: resposta normal, sem header e SEM 403', async () => {
  const {srv,base}=await sobe({allowedOrigins:LISTA});
  try{
    const r=await fetch(base+'/api/config',{headers:{Origin:MAU}});
    // 403 aqui derrubaria o jogo inteiro no dia em que a própria origem saísse da lista: o navegador
    // manda Origin em TODO POST same-origin. Omitir o header já basta — quem bloqueia é o navegador.
    assert.equal(r.status,200);
    assert.equal(h(r,'access-control-allow-origin'),null);
    assert.equal(h(r,'vary'),'Origin');
    const pre=await fetch(base+'/api/me',{method:'OPTIONS',headers:{Origin:MAU,'Access-Control-Request-Method':'GET'}});
    assert.equal(pre.status,204);assert.equal(h(pre,'access-control-allow-origin'),null);
  }finally{await srv.close();}
});

test('superfície: /api/avatar sai com *, e /healthz, /internal e /api/admin ficam de fora', async () => {
  const {srv,base}=await sobe({allowedOrigins:LISTA});
  try{
    // a foto é pública e `immutable` por um ano: eco+Vary fragmentaria o cache por portal
    const a=await fetch(base+'/api/avatar/1',{headers:{Origin:PORTAL}});
    assert.equal(h(a,'access-control-allow-origin'),'*');
    assert.equal(h(a,'vary'),null);
    for(const p of ['/healthz','/internal/rooms','/api/admin/rooms']){
      const r=await fetch(base+p,{headers:{Origin:PORTAL}});
      assert.equal(h(r,'access-control-allow-origin'),null,p);}
    // e o painel não ganha preflight: ele é same-origin por natureza
    assert.notEqual((await fetch(base+'/api/admin/rooms',{method:'OPTIONS',headers:{Origin:PORTAL}})).status,204);
  }finally{await srv.close();}
});

// ── WebSocket ────────────────────────────────────────────────────────────────────────────────
const abre=(url,origin)=>new Promise((res,rej)=>{const w=new WebSocket(url,origin?{origin}:undefined);
  w.on('open',()=>{w.close();res(true);});w.on('error',e=>rej(e));});

test('ws: sem Origin sempre abre; com origem proibida depende do modo', async () => {
  const on=await sobe({allowedOrigins:LISTA,wsOriginCheck:'on'});
  try{
    // ⚠️ ESTE é o caso que protege a suíte inteira: o `ws` só manda Origin quando o chamador pede, e
    // game/br/host/roombots nunca pedem. Se este assert cair, todos eles caem junto.
    assert.equal(await abre(on.ws+'/ws/0'),true);
    assert.equal(await abre(on.ws+'/ws/0',PORTAL),true);
    await assert.rejects(abre(on.ws+'/ws/0',MAU),/403/);
  }finally{await on.srv.close();}
  const off=await sobe({allowedOrigins:LISTA,wsOriginCheck:'off'});
  try{ assert.equal(await abre(off.ws+'/ws/0',MAU),true,'off é fail-open: idêntico a hoje'); }
  finally{await off.srv.close();}
});

// ── CORS: o cliente hospedado por um portal (outro domínio) falando com esta API ──────────────
// SEM BANCO, de propósito: nada aqui precisa de Postgres, e este arquivo NÃO lê o `.env` da raiz —
// que aponta para PRODUÇÃO. É o mesmo cuidado que o cabeçalho de persist.test.js explica; ler o .env
// "só para pegar o LOG_LEVEL" é como um teste acaba conversando com o banco de verdade.
// node --test server/test/cors.test.js
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
process.env.LOG_LEVEL='silent';process.env.SHARD='0';process.env.SHARDS='1';process.env.PEERS='';
process.env.DATABASE_URL='';process.env.ALLOWED_ORIGINS='';process.env.WS_ORIGIN_CHECK='off';
const {startServer}=await import('../src/index.js');
const {createOriginMatcher}=await import('../src/http/cors.js');
const {PROTOCOL_VERSION}=await import('@warspace/shared/protocol/index.js');

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
    // o contrato de /api/config é o mesmo que game.test.js trava; o CORS não pode encostar nele
    assert.deepEqual(await r.json(),{shards:1,shard:0,roomMax:srv.config.roomMax,protocol:PROTOCOL_VERSION,googleClientId:''});
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
    assert.deepEqual(await c.json(),{shards:1,shard:0,roomMax:srv.config.roomMax,protocol:PROTOCOL_VERSION,googleClientId:''});

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

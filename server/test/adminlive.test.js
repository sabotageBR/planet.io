// ── O fluxo AO VIVO do /admin ATRAVÉS DOS SHARDS ─────────────────────────────
// Dois servidores no MESMO processo, um por shard: o painel abre UM SSE no shard A e tem que receber o
// que aconteceu no shard B. É a razão de o recurso existir, e é o único jeito de provar o fan-in.
// Precisa de banco (a identidade do admin é uma linha de `users`), no molde de admin.test.js.
// node --test server/test/adminlive.test.js
//
// O que estes testes travam, em ordem de "quão silencioso seria o bug":
//  1. o `MINHAS` de http/admin.js — sem `live$` lá, a rota escorre para o router de persistência, o
//     `PREFIXES` casa, nenhuma rota casa, e sai 404 de JSON SEM UMA LINHA DE LOG. Por isso o teste
//     espera 403, nunca 404. É a armadilha de docs/spec/admin.md:36-38 vista do outro lado.
//  2. os HEADERS do SSE — sem `X-Accel-Buffering: no` o painel funciona em dev e engasga atrás do nginx,
//     entregando os eventos em blocos de 4 KB. Nada acusa.
//  3. o FAN-IN — um evento do shard B chegando no stream aberto no shard A, com o shard certo.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(!process.env.DATABASE_URL){try{for(const l of readFileSync(path.join(ROOT,'.env'),'utf8').split('\n')){const m=/^\s*([A-Z_]+)=(.*)$/.exec(l);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim();}}catch{}}
process.env.LOG_LEVEL=process.env.TEST_LOG||'silent';process.env.SHARD='0';process.env.SHARDS='1';process.env.PEERS='';
const {startServer}=await import('../src/index.js');
const {ADMIN_BUS}=await import('@warspace/shared/constants.js');

let A,B,baseA,painel=null,semBanco=false;
let nIp=0;
const J=async(m,p,b,t,base)=>{const h={'content-type':'application/json','x-forwarded-for':`10.77.${(nIp>>8)&255}.${(nIp++)&255}`};
  if(t)h.authorization='Bearer '+t;
  const r=await fetch((base||baseA)+p,{method:m,headers:h,body:m==='GET'?undefined:JSON.stringify(b||{})});
  return{s:r.status,j:await r.json().catch(()=>null)};};

before(async()=>{
  // B é o irmão: `role:'game'` não monta a API, então ele PRECISA ser 'both' para responder o /internal.
  B=await startServer({port:0,shard:1,shards:2,peers:[],logLevel:'silent',migrateOnStart:false});
  A=await startServer({port:0,shard:0,shards:2,peers:[`127.0.0.1:${B.port}`],logLevel:'silent',migrateOnStart:false});
  baseA=`http://127.0.0.1:${A.port}`;
  const g=await J('POST','/api/auth/guest',{});
  if(g.s!==201){semBanco=true;return;}
  const senha='ao-vivo-de-teste-123';
  await J('PATCH','/api/me',{nick:`Vivo${Date.now()%1e8}`},g.j.token);
  const cl=await J('POST','/api/auth/claim',{password:senha,email:`vivo${Date.now()}@teste.local`},g.j.token);
  if(cl.s!==200){semBanco=true;return;}
  await A.db.query('UPDATE users SET is_admin=true WHERE id=$1',[cl.j.user.id]);
  painel=(await J('POST','/api/admin/login',{login:cl.j.user.login||cl.j.user.nick,password:senha})).j.token;
});
after(async()=>{try{await A.close();}catch{}try{await B.close();}catch{}});
const pula=()=>semBanco;

/**
 * Abre o SSE e devolve `{ler(ms), fim()}`. Lê o corpo cru, como o painel faz — `EventSource` não manda
 * header `Authorization`, e é por isso que o cliente também usa fetch + ReadableStream.
 */
async function stream(tok,since){
  const ac=new AbortController();
  const r=await fetch(`${baseA}/api/admin/live${since?`?since=${since}`:''}`,
    {headers:{authorization:'Bearer '+tok,accept:'text/event-stream'},signal:ac.signal});
  const rd=r.body.getReader(),dec=new TextDecoder();let acc='';
  // ⚠️ O laço de leitura roda EM SEGUNDO PLANO e `ler(ms)` só espera o relógio. Fazer o timeout com
  // `ac.abort()` mataria a CONEXÃO INTEIRA na primeira espera, e a leitura seguinte veria um stream morto
  // — que foi exatamente como este teste falhou da primeira vez.
  // ⚠️ `{stream:true}` e UM decoder para o stream inteiro: um chunk pode cortar uma sequência UTF-8 no
  // meio, e aí "Kauã" vira "Kau�" sem nada acusar.
  (async()=>{try{for(;;){const {value,done}=await rd.read();if(done)break;acc+=dec.decode(value,{stream:true});}}catch{}})();
  return{res:r,
    async ler(ms){await new Promise(r=>setTimeout(r,ms));return acc;},
    fim(){try{ac.abort();}catch{}}};
}
/** Os objetos de todos os frames `event: ev` vistos até agora. */
const eventos=txt=>txt.split('\n\n').filter(b=>b.includes('event: ev'))
  .flatMap(b=>{const d=/^data: (.*)$/m.exec(b);try{return d?JSON.parse(d[1]):[];}catch{return [];}});

test('ao vivo: a rota EXISTE (o MINHAS de http/admin.js) e recusa quem não é admin — 403, nunca 404',async t=>{
  if(pula())return t.skip('sem banco');
  for(const p of ['/api/admin/live','/api/admin/kpis']){
    const r=await J('GET',p);
    assert.equal(r.s,403,`${p} caiu em 404: falta a família no MINHAS, e isso não deixa uma linha de log`);
    assert.equal(r.j.error,'forbidden');}
});

test('ao vivo: token do JOGO não abre o stream (é o kind admin que manda)',async t=>{
  if(pula())return t.skip('sem banco');
  const g=await J('POST','/api/auth/guest',{});
  assert.equal((await J('GET','/api/admin/live',null,g.j.token)).s,403);
});

test('ao vivo: os headers que fazem o SSE atravessar o nginx',async t=>{
  if(pula())return t.skip('sem banco');
  const s=await stream(painel);
  const h=s.res.headers;
  assert.match(h.get('content-type')||'',/text\/event-stream/);
  assert.equal(h.get('x-accel-buffering'),'no','sem isto o nginx bufferiza e os eventos chegam em blocos');
  assert.match(h.get('cache-control')||'',/no-cache/);
  assert.match(h.get('cache-control')||'',/no-transform/,'senão um proxy pode comprimir e segurar o stream');
  s.fim();
});

test('ao vivo: o KPI chega logo na abertura, sem esperar a cadência',async t=>{
  if(pula())return t.skip('sem banco');
  const s=await stream(painel);
  const txt=await s.ler(1500);
  s.fim();
  assert.match(txt,/event: kpi/,'a primeira pintura não pode ficar 3 s em branco');
  const d=/^data: (.*)$/m.exec(txt.split('\n\n').find(b=>b.includes('event: kpi')));
  const kpi=JSON.parse(d[1]);
  assert.equal(kpi.shardsTot,2,'os dois shards entram na conta');
  assert.equal(kpi.shardsOk,2,'e os dois responderam');
  assert.ok(typeof kpi.online==='number'&&typeof kpi.tickPior.shard==='number');
});

test('ao vivo: um evento do shard B sai no stream aberto no shard A (o fan-in)',async t=>{
  if(pula())return t.skip('sem banco');
  const s=await stream(painel);
  await s.ler(1200);                       // a 1ª coleta ACORDA o anel do irmão
  assert.equal(B.bus.on,true,'a própria coleta é o sinal de "tem alguém olhando"');
  B.bus.publica('chat',{sala:'ZZZZ',quem:'Fulano',txt:'oi do shard 1'});
  const txt=await s.ler(1600);
  s.fim();
  const ev=eventos(txt).find(e=>e.kind==='chat'&&e.txt==='oi do shard 1');
  assert.ok(ev,'o evento do irmão tem que atravessar');
  assert.equal(ev.shard,1,'e chegar dizendo de qual shard veio');
});

test('ao vivo: sem ninguém olhando o barramento DORME (o custo em produção é zero)',async t=>{
  if(pula())return t.skip('sem banco');
  A.bus.on=false;                                  // o relógio de vigília faria isto em AWAKE_MS
  A.bus.publica('chat',{sala:'ZZZZ',txt:'ninguém vê'});
  assert.equal(A.bus.seq,0,'dormindo, publicar é um retorno na primeira linha');
  assert.ok(ADMIN_BUS.AWAKE_MS>ADMIN_BUS.FANIN_MS*2,
    'a vigília tem que cobrir mais de uma coleta, senão o pod dorme entre duas e ninguém percebe');
});

test('ao vivo: shard que NUNCA existiu não entra no denominador (o "3/24" falso)',async t=>{
  if(pula())return t.skip('sem banco');
  // Em produção o ConfigMap diz SHARDS=24 e o HPA mantém 3 pods: 21 dos nomes de peer simplesmente não
  // resolvem. Contá-los como "mudos" faria o painel gritar num cluster saudável — e sondá-los a cada
  // segundo seria bater em 21 endereços inexistentes para sempre.
  const C=await startServer({port:0,shard:5,shards:9,logLevel:'silent',migrateOnStart:false,
    peers:[`127.0.0.1:${B.port}`,'127.0.0.1:9','127.0.0.1:9']});   // um vivo, dois que não existem
  try{
    const r=await fetch(`http://127.0.0.1:${C.port}/api/admin/live`,
      {headers:{authorization:'Bearer '+painel,accept:'text/event-stream'}});
    const rd=r.body.getReader(),dec=new TextDecoder();let acc='';
    const t0=Date.now();
    while(Date.now()-t0<2500){const {value,done}=await rd.read();if(done)break;acc+=dec.decode(value,{stream:true});}
    try{await rd.cancel();}catch{}
    const bloco=acc.split('\n\n').filter(b=>b.includes('event: kpi')).pop();
    const kpi=JSON.parse(/^data: (.*)$/m.exec(bloco)[1]);
    assert.equal(kpi.shardsTot,2,'o local mais o irmão que respondeu — os dois inexistentes ficam de fora');
    assert.equal(kpi.shardsOk,2,'e nenhum deles aparece como "mudo"');
  }finally{await C.close();}
});

test('ao vivo: o teto de streams responde 503 (capacidade), não 429 (espere)',async t=>{
  if(pula())return t.skip('sem banco');
  const abertos=[];
  for(let i=0;i<ADMIN_BUS.MAX_STREAMS;i++)abertos.push(await stream(painel));
  const r=await J('GET','/api/admin/live',null,painel);
  assert.equal(r.s,503,'503 manda o painel tentar OUTRO shard, que é o conselho certo — o /api é balanceado');
  assert.equal(r.j.error,'too_many_streams');
  for(const s of abertos)s.fim();
});

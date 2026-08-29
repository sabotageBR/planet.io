// ── Lobby de equipe ATRAVÉS DOS SHARDS: o pod que recebe encaminha para o dono do código ──────
// O party vive na memória do shard que criou o código (1º char), mas em produção o Ingress balanceia
// /api entre os 3 pods — 2 em cada 3 chamadas caíam no pod errado, voltavam 404, e a tela de equipe se
// fechava sozinha em 1 s. `br.test.js` nunca pegou isso porque fixa SHARDS=1 e sobe um servidor só.
// Dois servidores no MESMO processo, um por shard. Sem banco (é requisito do recurso) e sem WebSocket.
// node --test server/test/party-shards.test.js
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
process.env.LOG_LEVEL='silent';process.env.SHARD='0';process.env.SHARDS='1';process.env.PEERS='';
const {startServer}=await import('../src/index.js');

let A,B,baseA,baseB;
const api=(base,p,o={})=>fetch(base+p,{headers:{'content-type':'application/json',authorization:`Bearer ${o.tok||'pt_lider'}`},...o})
  .then(async r=>({status:r.status,body:await r.json().catch(()=>null)}));
const post=(base,p,body,o={})=>api(base,p,{method:'POST',body:JSON.stringify(body||{}),...o});
// equipe criada NO SHARD 1 (servidor B) — é o caso que produção quebra: o cliente pergunta por A
const criaEmB=async(tok='pt_lider')=>(await post(baseB,'/api/party',{mode:1,teamSize:2,nick:'Líder'},{tok})).body.party.code;

before(async()=>{
  // `role:'api'` evita dois schedulers a 60 Hz; `databaseUrl:''` prova que o conserto vale SEM banco.
  B=await startServer({port:0,shard:1,shards:2,peers:[],databaseUrl:'',role:'api',logLevel:'silent'});
  baseB=`http://127.0.0.1:${B.port}`;
  A=await startServer({port:0,shard:0,shards:2,peers:[`127.0.0.1:${B.port}`],databaseUrl:'',role:'api',logLevel:'silent'});
  baseA=`http://127.0.0.1:${A.port}`;
});
after(async()=>{try{await A.close();}catch{}try{await B.close();}catch{}});

test('o código carrega o dono no 1º char', async()=>{
  assert.equal((await post(baseA,'/api/party',{mode:1,teamSize:2,nick:'L'})).body.party.code[0],'0');
  assert.equal((await post(baseB,'/api/party',{mode:1,teamSize:2,nick:'L'})).body.party.code[0],'1');
});

test('perguntar ao shard ERRADO devolve a equipe (era o 404 que fechava a tela)', async()=>{
  const code=await criaEmB();
  const g=await api(baseA,`/api/party/${code}`);
  assert.equal(g.status,200,'o pod que não é dono tem que encaminhar, não responder 404');
  assert.equal(g.body.party.code,code);assert.equal(g.body.party.members.length,1);
});

test('entrar por código pelo shard errado aplica no DONO, sem lobby paralelo', async()=>{
  const code=await criaEmB();
  const j=await post(baseA,`/api/party/${code}/join`,{nick:'Amigo'},{tok:'pt_amigo'});
  assert.equal(j.status,200);assert.equal(j.body.party.members.length,2);
  assert.equal((await api(baseB,`/api/party/${code}`)).body.party.members.length,2,'a mutação foi para o dono');
});

test('`you.leader` atravessa o encaminhamento (o Authorization foi repassado)', async()=>{
  const code=await criaEmB();
  await post(baseA,`/api/party/${code}/join`,{nick:'Amigo'},{tok:'pt_amigo'});
  assert.equal((await api(baseA,`/api/party/${code}`,{tok:'pt_lider'})).body.you.leader,true);
  assert.equal((await api(baseA,`/api/party/${code}`,{tok:'pt_amigo'})).body.you.leader,false);
});

test('o status do dono atravessa: 403 de estranho, 200 do líder', async()=>{
  const code=await criaEmB();
  assert.equal((await post(baseA,`/api/party/${code}/start`,{room:'1ABC'},{tok:'pt_estranho'})).status,403);
  assert.equal((await post(baseA,`/api/party/${code}/start`,{room:'1ABC'})).status,200);
  const g=await api(baseB,`/api/party/${code}`);
  assert.equal(g.body.party.started,true);assert.equal(g.body.party.room,'1ABC');
});

test('o líder saindo pelo shard errado dissolve o lobby nos dois', async()=>{
  const code=await criaEmB();
  assert.equal((await post(baseA,`/api/party/${code}/leave`,{})).status,200);
  assert.equal((await api(baseA,`/api/party/${code}`)).status,404);
  assert.equal((await api(baseB,`/api/party/${code}`)).status,404);
});

test('código inexistente continua 404 e não sai encaminhando', async()=>{
  assert.equal((await api(baseA,'/api/party/0ZZZ')).status,404,'código do próprio shard');
  assert.equal((await api(baseA,'/api/party/1ZZZ')).status,404,'shard do irmão, código que não existe');
  assert.equal((await api(baseA,'/api/party/ZZZZ')).status,404,'shard 35 não existe: 404 local e barato');
});

test('a rota interna NUNCA reencaminha (é o que impede laço entre irmãos)', async()=>{
  const code=await criaEmB();
  assert.equal((await api(baseB,`/internal/party/${code}`)).status,200,'o dono responde na via interna');
  assert.equal((await api(baseA,`/internal/party/${code}`)).status,404,'quem não é dono não repassa');
});

// ⚠️ Último: fecha B. Irmão fora do ar tem que ser 503 — se virar 404, a equipe de todo mundo se
// desfaz num piscar de rede (é o `isGone` do cliente que depende deste contrato).
test('irmão fora do ar é 503, nunca 404', async()=>{
  const code=await criaEmB();
  await B.close();
  const g=await api(baseA,`/api/party/${code}`);
  assert.notEqual(g.status,404,'404 aqui faria o cliente desfazer a equipe');
  assert.equal(g.status,503);assert.equal(g.body.error,'peer_unreachable');
});

// ── AS SALAS DOS IRMÃOS: sonda + memo + uma busca em voo ──────────────────────
// `/api/rooms` (polling de 5 s por jogador no menu) e `/api/auto` (todo JOGAR) faziam 23 fetch por chamada
// para 3 pods existentes. Aqui ficam travados os três remédios e o efeito colateral do memo.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {criaPeerRooms} from '../src/http/peers.js';
import {criaSonda} from '../src/admin/sonda.js';
import {criaCacheTtl} from '../src/api/ranking.js';

/** Um `fetch` falso: `vivos` = {peer:{shard,rooms}}; o resto é nome que não resolve. */
function rede(vivos){const pedidos=[];
  const busca=async url=>{const p=/^http:\/\/([^/]+)\//.exec(url)[1];pedidos.push(p);
    const v=vivos[p];if(!v)throw new Error('getaddrinfo ENOTFOUND');
    return{ok:true,json:async()=>({shard:v.shard,rooms:v.rooms})};};
  return{busca,pedidos};}
const PEERS=Array.from({length:23},(_,i)=>`s-${i+1}.x:3000`);

test('a 1ª rodada pergunta a todos; da 2ª em diante só a quem EXISTE',async()=>{
  let t=0;const vivos={'s-1.x:3000':{shard:1,rooms:[{code:'1AAA',shard:1,players:3,max:30}]},'s-2.x:3000':{shard:2,rooms:[]}};
  const r=rede(vivos),sonda=criaSonda({peers:PEERS,agora:()=>t,sondaMs:15000});
  const pr=criaPeerRooms({peers:PEERS,sonda,ttlMs:1500,agora:()=>t,busca:r.busca});
  assert.deepEqual((await pr.rooms()).map(x=>x.code),['1AAA']);assert.equal(r.pedidos.length,23,'estreia: sonda todo mundo');
  t+=2000;r.pedidos.length=0;await pr.rooms();
  assert.deepEqual(r.pedidos.sort(),['s-1.x:3000','s-2.x:3000'],'memo vencido, sonda não: só os 2 que existem');
  t+=15000;r.pedidos.length=0;await pr.rooms();
  assert.equal(r.pedidos.length,23,'a cada SONDA_MS os desconhecidos são revisitados — é como um pod novo do HPA é visto');
  assert.equal(sonda.peerDe(2),'s-2.x:3000');assert.equal(sonda.peerDe(9),null);
});

test('dentro do TTL não há rede nenhuma, e chamadas simultâneas dividem UMA rodada',async()=>{
  let t=0;const r=rede({'s-1.x:3000':{shard:1,rooms:[{code:'1AAA',shard:1,players:3,max:30}]}});
  const pr=criaPeerRooms({peers:PEERS.slice(0,3),sonda:criaSonda({peers:PEERS.slice(0,3),agora:()=>t}),agora:()=>t,busca:r.busca});
  const [a,b,c]=await Promise.all([pr.rooms(),pr.rooms(),pr.rooms()]);
  assert.equal(r.pedidos.length,3,'três chamadas ao mesmo tempo = uma rodada de 3 peers, não três');
  assert.deepEqual(a,b);assert.deepEqual(b,c);
  r.pedidos.length=0;t+=1000;await pr.rooms();await pr.rooms();
  assert.equal(r.pedidos.length,0,'memo vivo');assert.equal(pr.stats.doMemo,2);
  pr.limpa();await pr.rooms();assert.ok(r.pedidos.length>0,'limpa() força a rodada');
});

test('⚠️ conta(): o memo não pode virar atrator — quem este pod mandou para a sala do irmão soma nela',async()=>{
  let t=0;const r=rede({'s-1.x:3000':{shard:1,rooms:[{code:'1AAA',shard:1,players:10,max:30}]}});
  const pr=criaPeerRooms({peers:['s-1.x:3000'],agora:()=>t,busca:r.busca});
  assert.equal((await pr.rooms())[0].players,10);
  pr.conta('1AAA');pr.conta('1AAA');pr.conta('ZZZZ');
  assert.equal((await pr.rooms())[0].players,12,'dois JOGAR dentro da janela: a sala já aparece com 12');
  t+=2000;assert.equal((await pr.rooms())[0].players,10,'rodada nova: vale a contagem de verdade, e o extra zera');
});

test('sem peers não há rede; peer fora do ar não lança',async()=>{
  assert.deepEqual(await criaPeerRooms({peers:[],busca:async()=>{throw new Error('não deveria');}}).rooms(),[]);
  const pr=criaPeerRooms({peers:['x:1'],busca:async()=>{throw new Error('ECONNREFUSED');}});
  assert.deepEqual(await pr.rooms(),[]);
  const ruim=criaPeerRooms({peers:['x:1'],busca:async()=>({ok:false,json:async()=>({})})});
  assert.deepEqual(await ruim.rooms(),[]);
});

test('cache do ranking: expira, junta pedidos simultâneos, não cacheia erro e NÃO cresce para sempre',async()=>{
  let t=0,n=0;const c=criaCacheTtl({ttlMs:10000,limite:4,agora:()=>t});
  const fn=async()=>{n++;return n;};
  const [a,b]=await Promise.all([c.get('k',fn),c.get('k',fn)]);assert.equal(a,1);assert.equal(b,1);assert.equal(n,1,'uma consulta para dois pedidos');
  t+=9999;assert.equal(await c.get('k',fn),1);t+=2;assert.equal(await c.get('k',fn),2,'venceu');
  await assert.rejects(c.get('erro',async()=>{throw new Error('banco fora');}));
  assert.equal(await c.get('erro',async()=>'ok'),'ok','o erro não ficou no cache');
  // uma chave por usuário, como em produção: o vencido sai na varredura
  for(let i=0;i<50;i++){await c.get('u'+i,async()=>i);t+=3000;}
  assert.ok(c.size<=8,`o cache tem teto (${c.size})`);
});

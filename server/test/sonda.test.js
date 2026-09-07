// ── A FAIXA DE SHARDS DO PAINEL SÓ CONTA QUEM EXISTE ─────────────────────────
// Um cluster com `SHARDS=24` no ConfigMap e 7 pods de pé tem 17 nomes que não resolvem no DNS. Sem
// separar "não respondeu" de "nunca existiu", a tela de Salas anuncia 17 shards "sem resposta" num
// cluster saudável — e o administrador aprende a ignorar o vermelho, que é o pior resultado possível.
// node --test server/test/sonda.test.js   (não precisa de banco)
import test from 'node:test';
import assert from 'node:assert/strict';
const {criaSonda}=await import('../src/admin/sonda.js');

const PEERS=['a:1','b:1','c:1'];
/** Relógio de mentira, para a sonda ser exercitada sem esperar 15 s. */
const relogio=()=>{let t=1000;return{agora:()=>t,anda:ms=>{t+=ms;}};};

test('na estreia ela pergunta a todos — ninguém é conhecido ainda', () => {
  const s=criaSonda({peers:PEERS});
  assert.deepEqual(s.aPerguntar(),PEERS);
});

test('quem nunca respondeu SAI da faixa, mesmo tendo sido sondado agora', () => {
  const s=criaSonda({peers:PEERS});
  s.anota('a:1',true,7); s.anota('b:1',false,null); s.anota('c:1',false,null);
  // as três falhas estão em `respostas`; só a conhecida pode virar chip
  const f=s.faixa(0,[{peer:'a:1',status:200,body:{shard:7}},{peer:'b:1',error:'ENOTFOUND'},{peer:'c:1',error:'ENOTFOUND'}]);
  assert.deepEqual(f.map(x=>x.peer),[undefined,'a:1'],'este é o defeito que apareceu em produção: 17 chips vermelhos');
  assert.equal(f[0].shard,0);
  assert.equal(f[1].ok,true);
});

test('um shard que EXISTIA e caiu continua vermelho — é a única coisa acionável ali', () => {
  const s=criaSonda({peers:PEERS});
  s.anota('a:1',true,7);
  const f=s.faixa(0,[{peer:'a:1',error:'timeout'}]);
  assert.equal(f[1].peer,'a:1');
  assert.equal(f[1].ok,false);
  assert.equal(f[1].shard,7,'o número dele é lembrado mesmo sem corpo na resposta');
});

test('conhecido que não foi perguntado nesta rodada NÃO vira falha', () => {
  const s=criaSonda({peers:PEERS});
  s.anota('a:1',true,7); s.anota('b:1',true,8);
  const f=s.faixa(0,[{peer:'a:1',status:200,body:{shard:7}}]);   // b não foi perguntado
  const b=f.find(x=>x.peer==='b:1');
  assert.equal(b.ok,true,'ninguém falou com ele; ausência de resposta não é resposta ruim');
});

test('o desconhecido só é resondado quando a janela vence — o custo fica proporcional ao que existe', () => {
  const r=relogio();
  const s=criaSonda({peers:PEERS,agora:r.agora,sondaMs:15000});
  s.anota('a:1',true,7); s.anota('b:1',false,null); s.anota('c:1',false,null);
  assert.deepEqual(s.aPerguntar(),['a:1'],'logo depois de falhar, os fantasmas ficam de fora');
  r.anda(14999); assert.deepEqual(s.aPerguntar(),['a:1']);
  r.anda(2);     assert.deepEqual(s.aPerguntar(),PEERS,'vencida a janela, tenta de novo — é assim que um pod NOVO aparece');
});

test('um pod que o HPA acabou de subir entra na faixa assim que responde', () => {
  const r=relogio();
  const s=criaSonda({peers:PEERS,agora:r.agora,sondaMs:15000});
  s.anota('b:1',false,null);
  assert.equal(s.conhece('b:1'),false);
  r.anda(15001); s.anota('b:1',true,3);
  assert.equal(s.conhece('b:1'),true);
  assert.equal(s.faixa(0,[{peer:'b:1',status:200,body:{shard:3}}]).find(x=>x.peer==='b:1').shard,3);
});

// ── O barramento ao vivo do /admin (server/src/admin/bus.js) ─────────────────
// Módulo puro: roda sem banco, sem servidor e sem sala. node --test server/test/adminbus.test.js
//
// O que estes testes travam, em ordem de "quão silencioso seria o bug":
//  1. DORMINDO NÃO PUBLICA. É a regressão que poria o painel dentro do laço de 60 Hz para sempre — e ela
//     não tem sintoma nenhum: o jogo continua funcionando, só fica mais caro em todos os 24 pods.
//  2. A LACUNA É EXPLÍCITA. Um consumidor que ficou para trás precisa receber `perdidos>0`, nunca um lote
//     curto que ele leria como "estava calmo".
//  3. O EPOCH. Sem ele, pod reiniciado = shard que some do painel sem uma linha de log.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAdminBus} from '../src/admin/bus.js';
import {ADMIN_BUS} from '@warspace/shared/constants.js';

/** Um barramento já acordado — que é o estado em que quase todo teste quer começar. */
const acordado=()=>{const b=createAdminBus({shard:3});b.acorda();return b;};

test('bus: DORMINDO não publica — é o interruptor de custo em produção',()=>{
  const b=createAdminBus({shard:0});
  assert.equal(b.on,false,'nasce dormindo: ninguém abriu o painel ainda');
  b.publica('kill',{a:'x'});b.publica('kill',{a:'y'});
  assert.equal(b.seq,0,'nada foi enfileirado');
  assert.deepEqual(b.desde(0).ev.length,0);
  b.stop();
});

test('bus: acordar não entrega a história velha do anel',()=>{
  const b=acordado();
  b.publica('chat',{txt:'antes'});
  b.on=false;                      // simula o rebaixamento do relógio de vigília
  b.acorda();
  const r=b.desde(0);
  assert.equal(r.ev.length,0,'a linha de uma hora atrás não é "ao vivo"');
  assert.equal(r.perdidos,0,'e não vale como lacuna: ninguém estava esperando por ela');
  b.stop();
});

test('bus: desde() devolve o que veio depois, na ordem, com o cursor novo',()=>{
  const b=acordado();
  b.publica('a',{n:1});b.publica('a',{n:2});b.publica('a',{n:3});
  const r=b.desde(0);
  assert.deepEqual(r.ev.map(e=>e.n),[1,2,3]);
  assert.equal(r.seq,3,'o cursor vem no envelope, não deduzido do último item');
  assert.equal(r.shard,3);
  assert.deepEqual(b.desde(2).ev.map(e=>e.n),[3]);
  assert.deepEqual(b.desde(3).ev,[],'em dia: lote vazio, e o cursor continua sendo devolvido');
  assert.equal(b.desde(3).seq,3);
  b.stop();
});

test('bus: o registro carrega seq, at, shard e kind — e espalha o resto',()=>{
  const b=acordado();
  b.publica('kill',{sala:'1ABC',a:'Evandro',b:'Kaua'});
  const e=b.desde(0).ev[0];
  assert.equal(e.kind,'kill');assert.equal(e.shard,3);assert.equal(e.seq,1);
  assert.equal(e.sala,'1ABC');assert.equal(e.a,'Evandro');assert.equal(e.b,'Kaua');
  assert.ok(e.at>0,'carimbo do pod, para o painel ordenar dentro do shard');
  b.stop();
});

test('bus: LACUNA EXPLÍCITA quando o consumidor fica para trás',()=>{
  const b=acordado();
  const n=ADMIN_BUS.RING+50;
  for(let i=1;i<=n;i++)b.publica('a',{n:i});
  const r=b.desde(1);   // ele JÁ tinha visto o primeiro: está atrasado, não estreando
  assert.equal(r.ev.length,ADMIN_BUS.RING,'o anel entrega o que cabe nele');
  assert.equal(r.perdidos,49,'…e DIZ quantos caíram — silêncio aqui é a pior falha possível');
  assert.equal(r.ev[0].n,51,'o lote começa no mais antigo ainda vivo');
  assert.equal(r.ev[r.ev.length-1].n,n);
  b.stop();
});

test('bus: cursor ZERO é ESTREIA — lote curto e SEM lacuna',()=>{
  const b=acordado();
  for(let i=1;i<=ADMIN_BUS.RING;i++)b.publica('a',{n:i});
  const r=b.desde(0);
  assert.equal(r.perdidos,0,'quem acabou de abrir o painel não "perdeu" nada');
  assert.equal(r.ev.length,ADMIN_BUS.ESTREIA,'e não leva o anel inteiro na primeira pintura');
  assert.equal(r.ev[r.ev.length-1].n,ADMIN_BUS.RING,'o lote termina no evento mais recente');
  assert.equal(r.seq,ADMIN_BUS.RING,'e o cursor já vem em dia, então a coleta seguinte é incremental');
  b.stop();
});

test('bus: a volta do anel não duplica nem perde item (o off-by-one clássico)',()=>{
  const b=acordado();
  const n=ADMIN_BUS.RING*2+7;
  for(let i=1;i<=n;i++)b.publica('a',{n:i});
  const v=b.desde(n-10).ev.map(e=>e.n);
  assert.deepEqual(v,[n-9,n-8,n-7,n-6,n-5,n-4,n-3,n-2,n-1,n]);
  assert.equal(new Set(v).size,v.length,'sem duplicata');
  b.stop();
});

test('bus: EPOCH diferente é "este pod reiniciou", não um replay silencioso',()=>{
  const b=acordado();
  b.publica('a',{n:1});b.publica('a',{n:2});
  // O coletor guardou seq=900 de uma encarnação anterior; sem o epoch isto devolveria VAZIO para sempre.
  const r=b.desde(900,b.epoch-1);
  assert.equal(r.perdidos,-1,'a marca de "outra vida", que o painel imprime');
  assert.equal(r.ev.length,2,'e entrega o que este pod tem, em vez de sumir da tela');
  assert.equal(r.epoch,b.epoch,'o cursor novo leva o epoch novo');
  b.stop();
});

test('bus: o EPOCH não cabe em 32 bits — quem o truncar inventa um "reiniciou" por segundo',()=>{
  const b=acordado();
  assert.ok(b.epoch>2**31,'é um Date.now(): passa de 2³¹ desde 1970');
  assert.notEqual(b.epoch|0,b.epoch,'e `|0` o corrompe — foi assim que o coletor viu lacuna em toda coleta');
  // O caminho certo: guardar o epoch como NÚMERO e devolvê-lo intacto na volta.
  b.publica('a',{n:1});
  const r1=b.desde(0);
  const r2=b.desde(r1.seq,+r1.epoch||0);
  assert.equal(r2.perdidos,0,'mesmo pod, mesma vida: nenhuma lacuna');
  b.stop();
});

test('bus: ler é o que mantém o pod acordado (não há broadcast de despertar)',()=>{
  const b=createAdminBus({shard:1});
  assert.equal(b.on,false);
  b.desde(0);                       // a própria coleta é o sinal
  assert.equal(b.on,true);
  b.publica('a',{n:1});
  assert.equal(b.desde(0).ev.length,1);
  b.stop();
});

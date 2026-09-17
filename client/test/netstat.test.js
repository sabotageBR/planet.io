// ── netstat: o intervalo entre snapshots e o que o netcode decidiu por causa dele ──
import {test} from "node:test";
import assert from "node:assert/strict";
import {criaNetstat,NETSTAT_INERTE,percentis,classifica,FAIXAS} from "../src/game/netstat.js";

test("histograma: 50 ms é o normal; os buracos caem nas faixas certas e viram evento",()=>{
  const n=criaNetstat();let t=1000,tick=0;
  const chega=dt=>{t+=dt;tick+=3;n.snap(t,tick);};
  n.snap(t,tick);for(let i=0;i<100;i++)chega(50);
  chega(90);chega(130);chega(250);chega(50);
  const f=n.foto();
  assert.equal(f.total,104);assert.equal(f.acima83,3);assert.equal(f.acima120,2);assert.equal(f.acima200,1);
  assert.equal(f.max,250);assert.equal(f.p50,50);assert.equal(f.eventos.length,3);assert.equal(f.eventos[2].ms,250);
  assert.match(n.texto(t+3000),/>83:3 >120:2 >200:1/);assert.match(n.texto(t+3000),/REDE 250 ms há \d+ s/);
});
test("rajada (snapshots colados) e snapshots por frame",()=>{
  const n=criaNetstat();n.snap(0,0);n.snap(200,3);n.snap(201,6);n.snap(202,9);n.frame(4);
  const f=n.foto();assert.equal(f.rajadas,2);assert.equal(f.maxNoFrame,4);
});
test("⚠️ buraco com a ABA parada não é culpa da rede",()=>{
  assert.equal(classifica(200,180),"local");assert.equal(classifica(200,20),"rede");
  const n=criaNetstat();n.snap(0,0);n.frame(3);n.snap(50,3);
  n.frame(190);            // um frame de 190 ms segurou o JS: os pacotes esperaram na fila do navegador
  n.snap(250,6);
  assert.match(n.foto().eventos[0].tipo,/aba parada/);
  const m=criaNetstat();m.snap(0,0);m.frame(3);m.snap(50,3);m.frame(3);m.snap(250,6);
  assert.equal(m.foto().eventos[0].tipo,"REDE");
});
test("recomeca(): o intervalo até o 1º snapshot da sala nova não é um buraco",()=>{
  const n=criaNetstat();n.snap(1000,0);n.snap(1050,3);n.recomeca();n.snap(9000,900);n.snap(9050,903);   // (performance.now() nunca é 0: o zero é o sentinela de "sem anterior")
  assert.equal(n.foto().acima83,0);assert.equal(n.foto().total,2);
});
test("percentis e contadores do netcode",()=>{
  const a=new Float32Array([10,20,30,40,50,60,70,80,90,100]);
  assert.deepEqual(percentis(a,10,[.5,.99]),[60,100]);assert.deepEqual(percentis(a,0,[.5]),[0]);
  const n=criaNetstat();n.resync(true);n.resync(false);n.snapDistou(140);n.relogioSnap(14);n.desvio(-2.5);n.extrapPop(33);
  const f=n.foto();assert.equal(f.resyncs,2);assert.equal(f.resyncTarde,1);assert.equal(f.snapDist,1);assert.equal(f.snapDistMax,140);assert.equal(f.relogioSnaps,1);assert.equal(f.desvioMax,2.5);assert.equal(f.popMax,33);
  n.zera();assert.equal(n.foto().resyncs,0);
  assert.equal(FAIXAS[1],83,"a faixa de 83 ms é o overrun do servidor (5 ticks)");
});
test("o medidor INERTE (pacote de portal) tem os MESMOS métodos — um ausente é TypeError no laço de render",()=>{
  const vivo=Object.keys(criaNetstat()).sort(),inerte=Object.keys(NETSTAT_INERTE).sort();
  assert.deepEqual(inerte,vivo);
});

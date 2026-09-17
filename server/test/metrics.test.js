// ── DE QUEM É O ENGASGO: o classificador de paradas, o parser do cgroup e os campos novos do /healthz ──
// O servidor passou meses sabendo QUE o laço atrasava (`overruns`) sem saber POR QUÊ. Estes testes travam as
// três peças que respondem isso: a CPU da thread contra o relógio de parede (parado × ocupado), a cota do
// CFS lida de dentro do contêiner, e o GC por tipo.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMetrics,classificaGap} from '../src/metrics.js';
import {leCpuStat,leCota,criaLeitorCgroup} from '../src/cgroup.js';

test('classificaGap: wall alto com CPU baixa é PARADA; com CPU alta é TRABALHO; intervalo normal não é evento',()=>{
  assert.equal(classificaGap(16.7,2),null,'o tick normal não é evento');
  assert.equal(classificaGap(39.9,1),null,'abaixo do limiar não é evento');
  assert.equal(classificaGap(85,3),'congelado','85 ms de relógio com 3 ms de CPU: o processo esteve parado');
  assert.equal(classificaGap(85,80),'trabalho','85 ms de relógio com 80 ms de CPU: a thread estava ocupada');
  // a fronteira é metade: 100 ms com 49 de CPU ainda é parada, com 50 já é trabalho
  assert.equal(classificaGap(100,49),'congelado');assert.equal(classificaGap(100,50),'trabalho');
  assert.equal(classificaGap(NaN,0),null);
});

test('metrics.gap: acumula por tipo, guarda os últimos e sai no snapshot sem mexer no formato antigo',()=>{
  const m=createMetrics({vivo:false});
  assert.equal(m.gap(20,1),null,'abaixo do limiar nada é contado');
  assert.equal(m.gap(90,4),'congelado');assert.equal(m.gap(60,2),'congelado');assert.equal(m.gap(70,66),'trabalho');
  const s=m.snapshot();
  assert.equal(s.laco.congelado.n,2);assert.equal(s.laco.congelado.maxMs,90);assert.equal(s.laco.congelado.somaMs,150);assert.equal(s.laco.congelado.porMin,2);
  assert.equal(s.laco.trabalho.n,1);assert.equal(s.laco.trabalho.porMin,1);
  assert.equal(s.laco.ultimos.length,3);assert.equal(s.laco.ultimos[2].tipo,'trabalho');
  assert.equal(typeof s.laco.congelado.ultimoHa,'number');
  // ⚠️ o que já existia continua onde estava: o painel AO VIVO e o `game.test.js` leem estes campos
  for(const k of ['tick','loopLagMs','overrunMs','net','llm','joins','vida','spawn'])assert.ok(s[k],`campo antigo ${k}`);
  assert.equal(s.eld,null,'sem observadores, o eld sai null — e não um objeto de zeros que se leria como "está tudo bem"');
  assert.equal(s.cfs,null);assert.equal(s.writerRot,0);m.writerRot();assert.equal(m.snapshot().writerRot,1);
  m.stop();m.stop();   // idempotente
});

test('metrics.gap: o anel de paradas tem teto, e porMin só conta o último minuto',()=>{
  const m=createMetrics({vivo:false});
  for(let i=0;i<200;i++)m.gap(80,1,1000+i);   // 200 eventos "antigos" (t pequeno = muito antes de agora)
  const s=m.snapshot();
  assert.equal(s.laco.congelado.n,200,'o contador não tem teto');
  assert.ok(s.laco.ultimos.length<=5);
  // t=1000..1199 ms de performance.now(): o processo de teste já passou disso há mais de um minuto? não
  // necessariamente — então a asserção é só o TETO do anel, que é o que protege a memória
  assert.ok(s.laco.congelado.porMin<=64,'porMin sai do anel de 64');
});

test('GC e atraso do event loop: observados de verdade quando vivo',async()=>{
  const m=createMetrics();
  // lixo suficiente para forçar scavenges (e talvez um major) — o observador entrega de forma assíncrona
  let lixo=[];for(let r=0;r<40;r++){lixo=[];for(let i=0;i<50000;i++)lixo.push({i,s:'x'+i});}
  await new Promise(r=>setTimeout(r,60));
  const s=m.snapshot();m.stop();
  assert.ok(s.gc.minor.n+s.gc.major.n+s.gc.incremental.n>0,`algum GC foi observado (${JSON.stringify(s.gc)})`);
  assert.equal(typeof s.gc.major.porMin,'number');
  assert.ok(s.eld&&typeof s.eld.max==='number'&&s.eld.max>=0,'eld vivo, e nunca negativo (a resolução é subtraída)');
  assert.ok(s.heap===null||s.heap.limiteMB>0);
  assert.equal(lixo.length,50000);
});

test('cgroup: cpu.stat nos dois formatos',()=>{
  // v1 — docker 20.10 deste cluster: throttled_time em NANOSSEGUNDOS
  assert.deepEqual(leCpuStat('nr_periods 69108\nnr_throttled 447\nthrottled_time 37644354436\n'),{periods:69108,throttled:447,throttledMs:37644});
  // v2: throttled_usec, no meio de outras linhas
  assert.deepEqual(leCpuStat('usage_usec 1200\nuser_usec 800\nsystem_usec 400\nnr_periods 10\nnr_throttled 3\nthrottled_usec 250000\n'),{periods:10,throttled:3,throttledMs:250});
  // v2 SEM controlador de banda: só usage_* — não é um cpu.stat de cota
  assert.equal(leCpuStat('usage_usec 1200\nuser_usec 800\n'),null);
  assert.equal(leCpuStat(''),null);assert.equal(leCpuStat(null),null);
});

test('cgroup: a cota em cores, e a ausência dela',()=>{
  assert.equal(leCota({quota:'200000\n',period:'100000\n'}),2,'o limits.cpu:"2" de hoje');
  assert.equal(leCota({quota:'-1',period:'100000'}),null,'v1 sem limite');
  assert.equal(leCota({quota:'50000',period:'100000'}),.5);
  assert.equal(leCota({max:'max 100000'}),null,'v2 sem limite');
  assert.equal(leCota({max:'800000 100000'}),8);
  assert.equal(leCota({}),null);
});

test('cgroup: o leitor acha o layout uma vez, e desiste para sempre onde não há cgroup',async()=>{
  const v1={'/sys/fs/cgroup/cpu/cpu.stat':'nr_periods 5\nnr_throttled 1\nthrottled_time 9000000\n','/sys/fs/cgroup/cpu/cpu.cfs_quota_us':'200000','/sys/fs/cgroup/cpu/cpu.cfs_period_us':'100000'};
  let lidos=[];const l1=criaLeitorCgroup({ler:async p=>{lidos.push(p);return v1[p]??null;}});
  assert.deepEqual(await l1.le(),{cota:2,periods:5,throttled:1,throttledMs:9});assert.equal(l1.modo,'v1');
  lidos=[];await l1.le();assert.ok(lidos.every(p=>p.startsWith('/sys/fs/cgroup/cpu/')),'decidido o layout, não sonda o outro');
  const v2={'/sys/fs/cgroup/cpu.stat':'nr_periods 0\nnr_throttled 0\nthrottled_usec 0\n','/sys/fs/cgroup/cpu.max':'max 100000'};
  const l2=criaLeitorCgroup({ler:async p=>v2[p]??null});
  assert.deepEqual(await l2.le(),{cota:null,periods:0,throttled:0,throttledMs:0},'sem cota: contadores parados é o estado SAUDÁVEL');
  let n=0;const l3=criaLeitorCgroup({ler:async()=>{n++;return null;}});
  assert.equal(await l3.le(),null);const antes=n;assert.equal(await l3.le(),null);assert.equal(n,antes,'sem cgroup não volta a tentar');
});

// ── o rate limit perdoa RAJADA (Session.violation) ──
import {Session} from '../src/net/Session.js';
test('Session.violation: o excedente da MESMA rajada não conta; uma violação por segundo, três fecham',()=>{
  const m=createMetrics({vivo:false}),s=new Session({ws:null,metrics:m});
  assert.equal(s.violation(10000),false);                      // 1ª
  for(let i=1;i<=50;i++)assert.equal(s.violation(10000+i),false,'mesma rajada');
  assert.equal(m.rateLimitHits,1);assert.equal(m.snapshot().net.rateDrops,50);
  assert.equal(s.violation(10999),false,'ainda a menos de 1 s da anterior');
  assert.equal(s.violation(11000),false);                      // 2ª
  assert.equal(s.violation(12000),true,'3ª violação em 10 s: fecha');
  assert.equal(m.rateLimitHits,3);
  // três rajadas ESPAÇADAS (um túnel a cada 6 s) não fecham: a janela é de 10 s
  const t=new Session({ws:null,metrics:m});
  assert.equal(t.violation(0),false);assert.equal(t.violation(6000),false);assert.equal(t.violation(12000),false);
});

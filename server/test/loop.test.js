// ── SCHEDULER: o intervalo entre turnos é classificado com a CPU da THREAD, e a régua zera quando ele dorme ──
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scheduler} from '../src/loop.js';

const sala=()=>({code:'T',passos:0,step(){this.passos++;}});
/** Roda `_run` à mão com o relógio de parede controlado: o teste não depende de timers de verdade. */
function bancada(){
  const gaps=[];const m={lag(){},tick(){},overrun(){},gap:(w,c)=>{gaps.push({w:Math.round(w),c:Math.round(c)});}};
  let agora=1000,cpu=0;const real=performance.now;
  const s=new Scheduler({metrics:m,cpuMs:()=>cpu});
  s._arm=()=>{};   // sem timers: quem chama o turno é o teste
  const turno=(dtWall,dtCpu)=>{agora+=dtWall;cpu+=dtCpu;performance.now=()=>agora;try{s._run();}finally{performance.now=real;}};
  const liga=r=>{performance.now=()=>agora;try{s.add(r);}finally{performance.now=real;}};
  return{s,gaps,turno,liga};}

test('turnos no ritmo normal não viram evento',()=>{
  const b=bancada(),r=sala();b.liga(r);
  for(let i=0;i<10;i++)b.turno(16.7,2);
  assert.equal(b.gaps.length,0);assert.ok(r.passos>=9);
});

test('intervalo longo é entregue ao metrics com o relógio E a CPU da thread',()=>{
  const b=bancada(),r=sala();b.liga(r);
  b.turno(16.7,2);b.turno(16.7,2);
  b.turno(90,3);    // 90 ms de parede, 3 ms de CPU: parado
  b.turno(16.7,2);
  b.turno(70,65);   // 70 ms de parede, 65 de CPU: ocupado
  assert.deepEqual(b.gaps,[{w:90,c:3},{w:70,c:65}]);
});

test('⚠️ o scheduler DORME sem salas: o 1º turno depois de acordar não é "uma parada de uma hora"',()=>{
  const b=bancada(),r=sala();b.liga(r);
  b.turno(16.7,2);b.turno(16.7,2);
  b.s.remove(r);b.turno(16.7,0);          // sem salas: para
  assert.equal(b.s.running,false);
  b.turno(3600000,5);                     // uma hora depois… (o _run sai cedo: não está rodando)
  b.liga(r);                              // …alguém entra: start() zera a régua
  b.turno(16.7,2);b.turno(16.7,2);
  assert.equal(b.gaps.length,0,JSON.stringify(b.gaps));
});

test('sem metrics (ou com um metrics antigo, sem gap) o laço roda igual',()=>{
  const s=new Scheduler({metrics:{lag(){},tick(){},overrun(){}},cpuMs:()=>{throw new Error('não deveria ler a CPU');}});
  s._arm=()=>{};const r=sala();s.add(r);s.next=performance.now()-1;s._run();
  assert.ok(r.passos>=1);s.stop();
});

// ── o aquecimento do JIT no boot ──
import {aqueceJit} from '../src/aquece.js';
import {config} from '../src/config.js';
import {MODE} from '@warspace/shared/constants.js';
test('aqueceJit: roda salas DESCARTÁVEIS dos dois modos sem lançar e sem deixar nada para trás',()=>{
  const a=aqueceJit({config,ticks:90,humanos:3,modos:[MODE.FREE,MODE.BR]});
  assert.equal(a.salas,2);assert.equal(a.ticks,180);assert.ok(a.ms>=0);
});
test('o aquecimento fica FORA dos testes por padrão (o node --test marca o processo) e o env manda',()=>{
  assert.equal(config.jitWarmup,false,'dezenas de startServer por arquivo de teste não podem pagar isso');
});

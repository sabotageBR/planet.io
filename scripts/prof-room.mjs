#!/usr/bin/env node
// ── ONDE VAI O TEMPO DE UMA SALA ─────────────────────────────────────────────
//
//   node scripts/prof-room.mjs                       # a sala do Livre como ela é hoje
//   node scripts/prof-room.mjs --bots 0 --humanos 30 # sem preenchimento
//   node --cpu-prof --cpu-prof-dir /tmp/p scripts/prof-room.mjs   # perfil por função
//
// Medido em produção (3 shards, limits.cpu=1): uma sala do Livre com 1 humano e 13
// preenchimentos consome ~300m de CPU, e 150 jogadores levam os três shards a 99% —
// ou seja o teto de hoje é ~50 por shard. Como o servidor é Node single-thread, o
// limite de 1 core é o limite de UM PROCESSO: quem responde "por que 300m?" é este
// arquivo, não o k8s.
//
// A sala roda o MESMO caminho do servidor (Sim.step: cérebros → World.step → _consume),
// e o relógio é dividido nas três fases. `--humanos` são jogadores sem cérebro que
// mandam alvo como um humano manda: é o custo de FÍSICA de um jogador, sem o de rede.
// @ts-check
import {Sim} from '../server/src/sim/Sim.js';
import {createRng} from '@warspace/shared/rng.js';
import {TICK_HZ,MODE,botSpawnR} from '@warspace/shared/constants.js';

const A=(()=>{const o={};for(let i=2;i<process.argv.length;i++){const a=process.argv[i];if(!a.startsWith('--'))continue;
  const v=process.argv[i+1];if(v==null||v.startsWith('--')){o[a.slice(2)]=true;continue;}o[a.slice(2)]=v;i++;}return o;})();
const num=(k,d)=>A[k]!=null?Number(A[k]):d;
const BOTS=num('bots',15),HUM=num('humanos',1),TICKS=num('ticks',3600),SEED=num('seed',7);

const rng=createRng(SEED);
const sim=new Sim({seed:SEED,mode:MODE.FREE,rng});
const w=sim.world;

// preenchimentos: o mesmo caminho de Room._nasceBot (tamanho pela cota da semente)
for(let i=0;i<BOTS;i++)sim.addBot(i,{name:`bot${i}`,r:botSpawnR(rng,i,1)});
// humanos: entram como jogador de verdade e mandam alvo longe, que é o que produz movimento
const humSlots=[];
for(let i=0;i<HUM;i++){const slot=200+i;sim.addHuman(slot,{name:`h${i}`,skinId:0});humSlots.push(slot);}

const fase={brain:0,step:0,consume:0};
// O Sim.step faz as três coisas de uma vez; para dividir o relógio sem tocar no arquivo de
// produção, o laço aqui repete a MESMA ordem chamando as partes. Se `Sim.step` mudar, este
// número deixa de valer — por isso o total é conferido contra um `sim.step()` de verdade.
const hr=()=>Number(process.hrtime.bigint())/1e6;
function tickDividido(){
  let t=hr();
  for(const gp of sim.players.values())if(gp.brain&&!gp.dead)gp.brain.act(w.tick);
  const t1=hr();fase.brain+=t1-t;
  w.step();
  const t2=hr();fase.step+=t2-t1;
  sim._consume();
  fase.consume+=hr()-t2;
}
// alvo dos humanos: círculo, como no loadtest
let ang=0;
const t0=hr();
for(let i=0;i<TICKS;i++){
  ang+=.02;
  for(let k=0;k<humSlots.length;k++){const a=ang+k*.7;
    w.setTarget(humSlots[k],w.w/2+Math.cos(a)*3000,w.h/2+Math.sin(a)*3000);}
  tickDividido();
}
const total=hr()-t0;
const porTick=total/TICKS,orc=1000/TICK_HZ;
const vivos=[...sim.players.values()].filter(p=>!p.dead).length;
const ents=w.pieces.length+w.food.length+w.ejected.length+w.asteroids.length+w.missiles.length+w.stars.length;
console.log(`sala do Livre · ${BOTS} preenchimento(s) + ${HUM} humano(s) · ${TICKS} ticks (${(TICKS/TICK_HZ).toFixed(0)}s de jogo)`);
console.log(`  tick médio      : ${porTick.toFixed(3)} ms   (orçamento a ${TICK_HZ} Hz: ${orc.toFixed(2)} ms → ${(porTick/orc*100).toFixed(1)}% de UM core)`);
console.log(`  cérebro dos bots: ${(fase.brain/TICKS).toFixed(3)} ms  (${(fase.brain/total*100).toFixed(1)}%)`);
console.log(`  World.step      : ${(fase.step/TICKS).toFixed(3)} ms  (${(fase.step/total*100).toFixed(1)}%)`);
console.log(`  _consume        : ${(fase.consume/TICKS).toFixed(3)} ms  (${(fase.consume/total*100).toFixed(1)}%)`);
console.log(`  jogadores vivos : ${vivos} · entidades no mundo: ${ents} (peças ${w.pieces.length}, comida ${w.food.length}, ejetados ${w.ejected.length})`);

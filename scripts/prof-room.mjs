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
//
// ⚠️ **AS DUAS FASES DE SAÍDA ENTRARAM, e a falta delas era um buraco de verdade.** `Sim.step` é
// metade do tick: a outra é `Room._flush`, que a cada 3 ticks monta e codifica um SNAPSHOT POR SESSÃO
// e a cada 30 monta o PLACAR. Como 30 % 3 === 0, a cada 500 ms um único tick paga as duas coisas de
// uma vez — e um tick que estoura o orçamento faz o scheduler recuperar até `MAX_STEPS`=5 passos no
// mesmo turno do event loop, entregando dois snapshots colados e depois um buraco. Esse é exatamente
// o formato de um engasgo visto do lado do cliente, e o perfil não media nada disso.
// ⚠️ A sessão aqui é FALSA, e de propósito: o que se quer é o custo de CPU de `beginTick`+`send`, não
// o do WebSocket. Se `snapshot.js` passar a ler um campo que esta sessão não tem, o script QUEBRA —
// que é melhor que medir um caminho que não existe mais. `--sessoes 0` desliga a fase.
// @ts-check
import {Sim} from '../server/src/sim/Sim.js';
import {createSnapshotter} from '../server/src/net/snapshot.js';
import {createWriter} from '@warspace/shared/protocol/writer.js';
import {createRng} from '@warspace/shared/rng.js';
import {TICK_HZ,MODE,botSpawnR,SNAPSHOT_EVERY,LEADERBOARD_EVERY} from '@warspace/shared/constants.js';

const A=(()=>{const o={};for(let i=2;i<process.argv.length;i++){const a=process.argv[i];if(!a.startsWith('--'))continue;
  const v=process.argv[i+1];if(v==null||v.startsWith('--')){o[a.slice(2)]=true;continue;}o[a.slice(2)]=v;i++;}return o;})();
const num=(k,d)=>A[k]!=null?Number(A[k]):d;
const BOTS=num('bots',15),HUM=num('humanos',1),TICKS=num('ticks',3600),SEED=num('seed',7);
// quantas sessões recebem snapshot. Padrão: uma por humano — é o caso real de uma sala do Livre.
const SESSOES=num('sessoes',HUM);

const rng=createRng(SEED);
const sim=new Sim({seed:SEED,mode:MODE.FREE,rng});
const w=sim.world;

// preenchimentos: o mesmo caminho de Room._nasceBot (tamanho pela cota da semente)
for(let i=0;i<BOTS;i++)sim.addBot(i,{name:`bot${i}`,r:botSpawnR(rng,i,1)});
// humanos: entram como jogador de verdade e mandam alvo longe, que é o que produz movimento
const humSlots=[];
for(let i=0;i<HUM;i++){const slot=200+i;sim.addHuman(slot,{name:`h${i}`,skinId:0});humSlots.push(slot);}

const fase={brain:0,step:0,consume:0,snapshot:0,placar:0};
// ── A SAÍDA: snapshot por sessão e placar ────────────────────────────────────
// `createSnapshotter` só precisa de três coisas da Room, e é por isso que dá para medi-lo sem subir
// meia aplicação: o `sim`, um `writer` e o `rotateWriter` de quando o buffer não coube.
const WRITER_SIZE=1<<16;
const sala={sim,writer:createWriter(WRITER_SIZE),rotateWriter(){sala.writer=createWriter(WRITER_SIZE);}};
const snapshotter=SESSOES>0?createSnapshotter(sala):null;
/** O mínimo que `snapshot.send` lê de uma sessão. Ver o aviso do cabeçalho sobre ela quebrar. */
const fakeSessao=slot=>({
  ws:{readyState:1,bufferedAmount:0},slot,specSlot:-1,
  known:new Map(),rect:null,resync:false,stamp:0,cx:0,cy:0,scale:1,
  view:{w:1280,h:720,zoom:1},zoomHold:1,zoomHoldAt:0,
  send(){return true;},   // sem rede: o que se mede é montar e CODIFICAR, não transmitir
});
const sessoes=[];
for(let i=0;i<SESSOES;i++)sessoes.push(fakeSessao(200+i));
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
  const t3=hr();fase.consume+=t3-t2;
  // ── a MESMA cadência do `Room._flush`: snapshot a cada SNAPSHOT_EVERY, placar a cada LEADERBOARD_EVERY ──
  if(snapshotter&&w.tick%SNAPSHOT_EVERY===0){
    snapshotter.beginTick();
    for(const s of sessoes)snapshotter.send(s);
    sim.gone.clear();   // o `_flush` real limpa aqui; sem isso a lista de removidos cresce sem fim
    fase.snapshot+=hr()-t3;}
  const t4=hr();
  if(w.tick%LEADERBOARD_EVERY===0){sim.leaderboard();fase.placar+=hr()-t4;}
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
// ⚠️ AS DUAS ÚLTIMAS SÃO POR TICK MÉDIO E TAMBÉM POR OCORRÊNCIA, e a segunda é a que importa para um
// engasgo: diluída em 60 ticks, uma fase que só roda em 1 deles parece barata. O tick que a paga é o
// que estoura o orçamento — e é ele que o jogador sente.
const nSnap=snapshotter?Math.floor(TICKS/SNAPSHOT_EVERY):0,nLb=Math.floor(TICKS/LEADERBOARD_EVERY);
console.log(`  snapshot (${String(SESSOES).padStart(2)} ses.): ${(fase.snapshot/TICKS).toFixed(3)} ms  (${(fase.snapshot/total*100).toFixed(1)}%)  · ${nSnap?(fase.snapshot/nSnap).toFixed(3):'0.000'} ms no tick em que sai`);
console.log(`  placar          : ${(fase.placar/TICKS).toFixed(3)} ms  (${(fase.placar/total*100).toFixed(1)}%)  · ${nLb?(fase.placar/nLb).toFixed(3):'0.000'} ms no tick em que sai`);
// ⚠️ `LEADERBOARD_EVERY % SNAPSHOT_EVERY === 0` é o que faz as duas caírem SEMPRE no mesmo tick: 30/3.
// Enquanto for assim, o pior tick do servidor paga as duas de uma vez, e é essa a soma a comparar com
// o orçamento de 16,67 ms.
if(nSnap&&nLb)console.log(`  pior tick (as duas juntas): ${(fase.snapshot/nSnap+fase.placar/nLb).toFixed(3)} ms  · orçamento ${orc.toFixed(2)} ms`);
console.log(`  jogadores vivos : ${vivos} · entidades no mundo: ${ents} (peças ${w.pieces.length}, comida ${w.food.length}, ejetados ${w.ejected.length})`);

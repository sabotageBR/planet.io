// ── AQUECIMENTO DO JIT: a PRIMEIRA sala de um processo não pode custar 200 ms ─────────────────────────
// Medido em produção em 2026-09-17, com `laco.trabalho` do /healthz (o classificador de turno): cada pod tinha
// UM bloco de 190–220 ms de trabalho na thread principal, logo no começo da vida — a criação da primeira
// sala. Criar o mundo (3900 grãos, cinturões, estrelas com `_farSpot`, a semente de 13 preenchimentos) e dar
// os primeiros passos com o código ainda FRIO custa ~35 ms numa máquina de dev e ~8× isso nos núcleos de lá.
// O laço de 60 Hz é UM por processo: enquanto a sala nova nasce, TODAS as outras salas do pod ficam paradas.
// E isso casa com a queixa: num Fit Test os pods são recém-subidos pelo HPA e as salas nascem sem parar.
//
// O conserto é rodar esse caminho UMA vez no boot, ANTES de a porta abrir — quando não há ninguém para sentir.
// A sala é de verdade (a mesma `Room`, o mesmo `Sim`, o mesmo snapshot por sessão), com sessões de mentira:
// o V8 compila e otimiza pelo que EXECUTA, então aquecer com um caminho parecido-mas-diferente não adianta.
// ⚠️ NADA daqui toca em estado do processo: sala fora do `RoomManager`, hooks NOOP, métricas descartáveis,
// barramento mudo. Ela não entra no scheduler, não aparece em `/api/rooms` e é largada no fim.
// ⚠️ Sala AQUECIDA continua custando (o mundo tem de ser criado): ~3–8 ms em dev, dezenas em produção. O que
// some é a parcela do código frio, que era a maior.
// @ts-check
import {Room} from './rooms/Room.js';
import {Session} from './net/Session.js';
import {createMetrics} from './metrics.js';
import {NOOP_HOOKS} from './sim/hooks.js';
import {MODE,WORLD} from '@warspace/shared/constants.js';

const MUDO={info(){},warn(){},error(){},debug(){},child(){return MUDO;}};
const wsFalso=()=>({readyState:1,bufferedAmount:0,send(){},close(){},ping(){},terminate(){}});

/**
 * @param {{config:any,ticks?:number,humanos?:number,modos?:number[]}} o
 * @returns {{ms:number,ticks:number,salas:number}}
 */
export function aqueceJit({config,ticks=360,humanos=6,modos=[MODE.FREE]}){
  const t0=performance.now();let n=0,salas=0;
  for(const mode of modos){
    const metrics=createMetrics({vivo:false});
    const room=new Room({code:'0000',shard:config.shard|0,seed:0x5eed+mode,hooks:NOOP_HOOKS,log:MUDO,metrics,config,mode});
    if(typeof room.start==='function')room.start();salas++;
    const ss=[];
    for(let i=0;i<humanos;i++){const s=new Session({ws:wsFalso(),metrics});
      s.view={w:1600,h:900,zoom:1};
      try{room.join(s,{name:`aquece${i}`,skinId:i});ss.push(s);}catch{}}
    // alvo girando: o planeta ANDA, a AOI muda e a comida é comida — o caminho quente de verdade
    for(let t=0;t<ticks;t++){
      if(t%6===0)for(let i=0;i<ss.length;i++){const a=t*.02+i,w=room.sim.world;
        w.setTarget(ss[i].slot,WORLD.w/2+Math.cos(a)*3000,WORLD.h/2+Math.sin(a)*3000);}
      room.step();n++;}
    for(const s of ss){try{room.leave(s,'left');}catch{}}
    try{if(typeof room.stop==='function')room.stop();}catch{}}
  return{ms:Math.round(performance.now()-t0),ticks:n,salas};}

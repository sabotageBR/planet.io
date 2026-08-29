// ── BANCADA DA FALA DOS BOTS ─────────────────────────────────────────────────
// Roteia cenários pelo MESMO montaPrompt/sanitiza do jogo e imprime a linha + a latência, sem subir sala
// nenhuma. É por onde a tabela de personas e o formato do prompt são afinados — o mesmo papel que o
// `?sfx` faz para o som.
//   OLLAMA_URL=http://192.168.8.251:11434 node scripts/llm-bench.mjs [n_personas]
import {createOllama} from '../server/src/llm/ollama.js';
import {montaPrompt,sanitiza,aberta} from '../server/src/rooms/botChat.js';
import {PERSONAS} from '../server/src/rooms/botPersonas.js';
import {BOT_LLM} from '@planet/shared/constants.js';

const url=process.env.OLLAMA_URL||'http://192.168.8.251:11434';
const model=process.env.OLLAMA_MODEL||'qwen3.6:35b-a3b';
const nP=Math.max(1,Math.min(PERSONAS.length,Number(process.argv[2]||3)));
const llm=createOllama({url,model,log:{info:console.log,warn:console.warn,error:console.error,debug(){}}});

const CENARIOS=[
  {rot:'pergunta aberta',ctx:{kind:'coro',quem:'Evandro',texto:'e aí galera, tudo bem?',
    estado:{modo:'food'},agressor:null,historico:[{name:'Evandro',text:'e aí galera, tudo bem?'}]}},
  {rot:'provocação à sala',ctx:{kind:'coro',quem:'Evandro',texto:'eu vou matar todo mundo',
    estado:{modo:'hunt',alvo:'Zeca'},agressor:null,historico:[{name:'Evandro',text:'eu vou matar todo mundo'}]}},
  {rot:'chamado pelo nome',ctx:{kind:'mention',quem:'Evandro',texto:'Solares eu vou te pegar',
    estado:{modo:'hold'},agressor:null,historico:[{name:'Evandro',text:'Solares eu vou te pegar'}]}},
  {rot:'FUGINDO de quem atira (o caso)',ctx:{kind:'tiro',quem:'Evandro',
    estado:{modo:'flee',alvo:'Evandro',press:1.5},agressor:{nome:'Evandro',k:'tiro',n:3,recente:true},
    historico:[{name:'Zeca',text:'corre'}]}},
  {rot:'acabou de matar',ctx:{kind:'kill',quem:'Zeca',estado:{modo:'hunt',alvo:'Nebulox'},agressor:null,historico:[]}},
  {rot:'em inglês',ctx:{kind:'mention',quem:'Nick',texto:'solares you are trash',
    estado:{modo:'flee',alvo:'Nick'},agressor:{nome:'Nick',k:'tiro',n:1,recente:true},
    historico:[{name:'Zeca',text:'kkkk'},{name:'Nick',text:'solares you are trash'}]}},
];

console.log(`bancada: ${url} · ${model} · ${nP} personas × ${CENARIOS.length} cenários\n`);
await llm.warmup();
let n=0,soma=0,vazias=0,maxChars=0;
for(const persona of PERSONAS.slice(0,nP)){
  console.log(`\n══ ${persona.id} — ${persona.jeito}`);
  for(const c of CENARIOS){
    const ctx={nome:'Solares',historia:persona,rank:3,vivos:20,modo:'free-for-all',...c.ctx};
    const {system,user}=montaPrompt(ctx);
    maxChars=Math.max(maxChars,user.length);
    const t0=Date.now();
    let cru=null;try{cru=await llm.chat({system,user,force:true,timeoutMs:20000});}catch(e){cru=null;}
    const ms=Date.now()-t0,txt=sanitiza(cru);
    n++;soma+=ms;if(!txt)vazias++;
    console.log(`  ${String(ms).padStart(5)}ms  ${c.rot.padEnd(30)} ${txt?`« ${txt} »`:`(vazia) cru=${JSON.stringify(String(cru||'').slice(0,60))}`}`);
  }
}
console.log(`\n${n} gerações · média ${Math.round(soma/n)}ms · ${vazias} recusadas pela peneira · maior prompt ${maxChars} chars (teto ${BOT_LLM.PROMPT_MAX_CHARS})`);

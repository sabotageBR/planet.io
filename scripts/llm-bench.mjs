// ── BANCADA DA FALA DOS BOTS ─────────────────────────────────────────────────
// Roteia cenários pelo MESMO montaPrompt/sanitiza do jogo e imprime a linha + a latência, sem subir sala
// nenhuma. É por onde a tabela de personas e o formato do prompt são afinados — o mesmo papel que o
// `?sfx` faz para o som.
//   OLLAMA_URL=http://192.168.8.251:11434 node scripts/llm-bench.mjs [n_personas]
//   ...e `node scripts/llm-bench.mjs nicks [n_lotes]` imprime lotes de APELIDOS com o validador aplicado,
//   que e o unico jeito honesto de julgar se eles "parecem de gente daquele pais" antes de subir.
import {createOllama,seedModelo} from '../server/src/llm/ollama.js';
import {montaPrompt,sanitiza,aberta} from '../server/src/rooms/botChat.js';
import {createBotNames,recusa} from '../server/src/rooms/botNames.js';
import {PERSONAS} from '../server/src/rooms/botPersonas.js';
import {BOT_LLM} from '@warspace/shared/constants.js';

const url=process.env.OLLAMA_URL||'http://192.168.8.251:11434';
// O modelo é tunable (BOT_LLM.MODELO): aqui o env entra pela MESMA porta do servidor, para a bancada medir
// exatamente o que a produção vai rodar — inclusive o `think`/`reserva` que a entrada do modelo declara.
const model=seedModelo(process.env.OLLAMA_MODEL||BOT_LLM.MODELO);
const nP=Math.max(1,Math.min(PERSONAS.length,Number(process.argv[2]||3)));
const llm=createOllama({url,log:{info:console.log,warn:console.warn,error:console.error,debug(){}}});

// O ELENCO: e ele que transforma um nick numa piada que a sala entende. `egg` e FATO (o servidor decidiu
// a caricatura a partir do nick); pais e nivel tambem saem do GamePlayer.
const MESSI={nome:'Messi',egg:'Lionel Messi',pais:'AR',nivel:31};
const EU={nome:'Solares',egg:null,pais:'BR',nivel:12};
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
  // ── o mundo real (o que a feature acrescentou) ──
  {rot:'CARICATURA: quem me caca e o Messi',ctx:{kind:'cacado',quem:'Messi',
    estado:{modo:'flee',alvo:'Messi',press:1.6},agressor:{nome:'Messi',k:'mordida',n:2,recente:true},
    gente:[EU,MESSI],historico:[{name:'Messi',text:'vem ca'}]}},
  {rot:'CARICATURA: eu comi o Messi',ctx:{kind:'kill',quem:'Messi',estado:{modo:'hunt',alvo:'Zeca'},
    gente:[EU,MESSI],feed:['Solares killed Messi'],historico:[]}},
  {rot:'NICK LIVRE: a LLM infere sozinha',ctx:{kind:'mention',quem:'pizzalover99',texto:'solares tu e ruim demais',
    gente:[EU,{nome:'pizzalover99',egg:null,pais:'IT',nivel:8}],
    historico:[{name:'pizzalover99',text:'solares tu e ruim demais'}]}},
  {rot:'RIVALIDADE de pais',ctx:{kind:'morte',quem:'Messi',gente:[EU,MESSI],
    feed:['Messi killed Solares'],historico:[{name:'Messi',text:'kkkkk'}]}},
  // ── a INICIATIVA: o bot puxa assunto sozinho ──
  {rot:'PUXA ASSUNTO: o lider disparou',ctx:{kind:'puxa',assunto:'lider',quem:'Trovao',
    fracLider:.08,lider:'Trovao',estado:{modo:'food'},gente:[EU],historico:[]}},
  {rot:'PUXA ASSUNTO: o gas fechando',ctx:{kind:'puxa',assunto:'gas',zonaS:22,
    estado:{modo:'zone',zu:.7},gente:[EU],historico:[]}},
  {rot:'PUXA ASSUNTO: sala morta',ctx:{kind:'puxa',assunto:'partida',estado:{modo:'food'},gente:[EU],historico:[]}},
  // ── e o que NAO pode sair ──
  {rot:'ISCA POLITICA (a peneira tem que barrar)',ctx:{kind:'mention',quem:'Lula',
    texto:'lula, o que vc acha da eleicao?',
    gente:[EU,{nome:'Lula',egg:'Lula',pais:'BR',nivel:40}],
    historico:[{name:'Lula',text:'lula, o que vc acha da eleicao?'}]}},
];

// ── MODO NICKS ───────────────────────────────────────────────────────────────
// Imprime lotes de apelidos com o validador aplicado. O numero que importa e a taxa de "celebridade": e o
// unico furo que poe um preenchimento vestido de gente famosa dentro da sala.
if(process.argv[2]==='nicks'){
  const lotes=Math.max(1,Number(process.argv[3]||3));
  console.log(`apelidos: ${url} · ${model} · ${lotes} lote(s)`);
  await llm.warmup();
  const cru=[];
  const chatOrig=llm.chat.bind(llm);
  llm.chat=async o=>{const r=await chatOrig({...o,force:true,timeoutMs:60000});cru.push(r);return r;};
  const bn=createBotNames({llm,log:{debug:()=>{},info:()=>{},warn:console.warn,error:console.error}});
  for(let i=0;i<lotes;i++){
    const t0=Date.now();
    while(bn.take(new Set()));                           // esvazia o balde: e o balde VAZIO que pede um lote novo
    for(let k=0;k<120&&cru.length<=i;k++)await new Promise(r=>setTimeout(r,250));
    console.log(`  lote ${i+1}: ${bn.size} aceitos em ${Date.now()-t0}ms`);}
  const linhas=cru.filter(Boolean).join('\n').split('\n')
    .map(l=>l.replace(/^\s*[-*•\d]+[.)\]]?\s*/,'').replace(/^[\s"'`]+|[\s"'`,.]+$/g,'').trim())
    .filter(l=>l&&!/\s/.test(l));
  const ok=[],mau=new Map();
  for(const n of linhas){const r=recusa(n);if(r)mau.set(n,r);else ok.push(n);}
  console.log(`\nACEITOS (${ok.length}):\n  ${ok.join('  ')}`);
  if(mau.size){console.log(`\nRECUSADOS (${mau.size}) — e por que:`);
    for(const [n,r] of mau)console.log(`  ${String(n).padEnd(20)} ${r}`);}
  const cel=[...mau.values()].filter(r=>r==='celebridade').length;
  console.log(`\ntaxa de recusa ${linhas.length?Math.round(mau.size/linhas.length*100):0}% · celebridades ${cel}`);
  console.log(cel?'⚠️  o prompt esta deixando passar nome de gente famosa — e o validador que segurou':'ok: nenhuma celebridade no lote');
  bn.stop();process.exit(0);}

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

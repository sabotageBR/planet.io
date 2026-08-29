// ── FALA GERADA DOS BOTS: o que dá para provar sem rede ───────────────────────
// A geração em si depende de um Ollama e de sorte; o que NÃO pode depender de nenhum dos dois é o que
// cerca a geração: reconhecer que alguém te chamou (mesmo escrevendo errado) e desconfiar do que voltou.
// Esses dois são pura função e é o que este arquivo trava. node --test server/test/botchat.test.js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {citou,baseNick,sanitiza,normalizar,montaPrompt,detectaIdioma,createBotChat,aberta,estadoLinha,agressorLinha} from '../src/rooms/botChat.js';
import {PERSONAS,pickPersona} from '../src/rooms/botPersonas.js';
import {createRng} from '@warspace/shared/rng.js';
import {botNick,BOT_LLM,CHAT} from '@warspace/shared/constants.js';
import * as CONST from '@warspace/shared/constants.js';

test('menção: a raiz do apelido sobrevive aos cinco formatos de botNick', () => {
  assert.equal(baseNick('Trovao'),'trovao');
  assert.equal(baseNick('Trovao42'),'trovao');
  assert.equal(baseNick('Trovao_137'),'trovao');
  assert.equal(baseNick('TROVAO'),'trovao');
  assert.equal(baseNick('xXtrovaoXx'),'trovao');
  assert.equal(normalizar('João_Ç 12'),'joao c 12','acento e pontuação viram comparável');
  // e a garantia de verdade: TODO nick que o jogo sabe gerar volta a uma raiz não vazia
  const rng=createRng(12345),usados=new Set();
  for(let i=0;i<200;i++){const n=botNick(rng,usados);usados.add(n);
    assert.ok(baseNick(n).length>=2,`raiz vazia para "${n}"`);}
});

test('menção: reconhece quem chama errado e ignora quem não está chamando', () => {
  for(const m of ['cade o trovao','trovao vem ca','TROVÃO seu lixo','@trovao_137 corre','trovaozinho kkkk','trvao ta fugindo','xXtrovaoXx morreu'])
    assert.ok(citou(m,'Trovao_137'),`devia reconhecer: "${m}"`);
  assert.ok(citou('cassi onde vc ta','Cassiona'),'apelido cortado');
  assert.ok(citou('zeka corre','Zeca'),'uma letra errada num nick curto');
  assert.ok(citou('zecao manda ver','Zeca'),'aumentativo');
  assert.ok(citou('hey Lyrandis what are you doing','Lyrandis'),'menção em outra língua');
  // e os que a varredura pegou: nick curto que por acaso é palavra de conversa
  assert.ok(!citou('vem pro meio','PRO'),'"pro" é preposição antes de ser apelido');
  assert.ok(!citou('toma massa','Tom'),'sufixo não vale para raiz de 3 letras');
  assert.ok(!citou('ta fechando','Fernando'),'duas letras de folga só em raiz longa');
  assert.ok(!citou('boa sorte ai','sorvete'));
  for(const m of ['alguem ai','corre que o gas ta vindo','kkkkk morreu feio','boa sorte pessoal','quantos faltam'])
    assert.ok(!citou(m,'Trovao_137'),`não devia reconhecer: "${m}"`);
  // o caso que quebra a comparação ingênua por substring: "mila" está dentro de "milagre", mas ninguém
  // chamou a Mila. Sem isto o bot responde a conversas em que não foi citado — que é poluir o chat.
  assert.ok(!citou('milagre aconteceu','Mila'));
  assert.ok(citou('mila para de correr','Mila'));
  // raiz curta demais casaria com meia língua portuguesa
  assert.ok(!citou('vou ali e volto','Vo'));
});

test('menção: varredura de falso positivo com os nomes e as frases que o jogo realmente usa', () => {
  // O pecado grave é o FALSO positivo: um bot respondendo a quem não o chamou é literalmente o "não polua o
  // chat". Esta varredura é o que segura os parâmetros de `citou` (tolerância, corte, sufixo, stopwords) —
  // sem ela, afrouxar um deles para reconhecer mais menções passa despercebido até virar bot tagarela.
  // Já aconteceu: sem a lista de comuns, o nick "PRO" respondia a todo "vem pro meio" e "vex" a todo "vem".
  const {BOT_NAMES,BOT_CHAT}=CONST;
  const rng=createRng(999),usados=new Set(),nicks=[...BOT_NAMES];
  for(let i=0;i<300;i++){const n=botNick(rng,usados);usados.add(n);nicks.push(n);}
  const frases=[...Object.values(BOT_CHAT).flat(),
    'corre que o gas ta vindo','alguem quer time','essa foi por pouco','to quase morrendo','cuidado com a estrela',
    'vamo la pessoal','nossa que sorte','perdi tudo de novo','quem ta ganhando','alguem viu meu planeta',
    'boa sorte a todos','que jogo bom','estou com fome','calma ai gente','vou ali e volto','milagre aconteceu',
    'hey guys good luck','run to the middle now','that was close man','who is winning here','stop camping noob'];
  let fp=0;const exemplos=[];
  for(const n of nicks)for(const f of frases)if(citou(f,n)){fp++;if(exemplos.length<5)exemplos.push(`"${f}" acordou "${n}"`);}
  const pares=nicks.length*frases.length;
  assert.ok(fp/pares<=0.0005,`${fp} falsos positivos em ${pares} pares (teto 0,05%): ${exemplos.join(' · ')}`);
});

test('idioma: quem escreveu decide, e na dúvida não se afirma nada', () => {
  // "Responda no idioma da mensagem" o modelo acerta quase sempre — e "quase" é o problema: a resposta em
  // português para quem escreveu em espanhol foi vista no teste ponta a ponta. Nomear o idioma tira a
  // decisão do modelo e a traz para cá, onde ela é testável.
  assert.equal(detectaIdioma('oye Alnitak, eres muy malo jugando'),'Spanish');
  assert.equal(detectaIdioma('Callistro what are you doing bro'),'English');
  assert.equal(detectaIdioma('vc ta muito ruim mano kkkk'),'Portuguese');
  assert.equal(detectaIdioma('Trovao vem ca seu covarde'),'Portuguese');
  // sem sinal nenhum é melhor não afirmar: a instrução genérica volta a valer
  assert.equal(detectaIdioma('gg'),null);
  assert.equal(detectaIdioma('Nebulox'),null);
  assert.equal(detectaIdioma(''),null);
  // e o prompt carrega a ordem nomeada
  assert.match(montaPrompt({nome:'X',kind:'mention',quem:'A',texto:'you are trash bro'}).user,/write your line in English/);
  assert.match(montaPrompt({nome:'X',kind:'mention',quem:'A',texto:'eres muy malo'}).user,/write your line in Spanish/);
  assert.match(montaPrompt({nome:'X',kind:'mention',quem:'A',texto:'gg'}).user,/SAME LANGUAGE/,'sem certeza, a instrução genérica');
});

test('limpeza: só passa o que parece uma linha de chat de verdade', () => {
  assert.equal(sanitiza('  "vai chorar"  '),'vai chorar','aspas de citação saem');
  assert.equal(sanitiza('primeira\nsegunda'),'primeira','o modelo adora listar: fica só a primeira linha');
  assert.equal(sanitiza('<think>deixa eu ver</think> sai fora'),'sai fora','cinto de segurança do think:false');
  assert.equal(sanitiza('te como todinho 😂'),'te como todinho','o jogo não usa emoji no chat');
  assert.equal(sanitiza('As an AI, I cannot'),null,'quem se denuncia não fala');
  assert.equal(sanitiza('Sure, here is a funny line'),null);
  assert.equal(sanitiza(new Array(40).fill('palavra').join(' ')),null,'parágrafo não é fala de partida');
  assert.equal(sanitiza('   '),null);
  assert.equal(sanitiza(null),null);
});

test('prompt: leva quem é o bot, o que aconteceu e a conversa — e manda achar o idioma sozinho', () => {
  const {system,user}=montaPrompt({nome:'Trovao',persona:'cacador',pericia:'fera',massa:4820,vivos:12,
    modo:'battle royale',kind:'kill',quem:'Zeca',
    historico:[{name:'Zeca',text:'caraca me pegou'},{name:'Mila',text:'kkkk morreu feio'}]});
  assert.match(system,/LANGUAGE RULE/,'é essa instrução que faz o bot responder em pt para quem fala pt');
  assert.match(system,/NOT an assistant/);
  assert.match(user,/Trovao/);assert.match(user,/aggressive hunter/);assert.match(user,/dominating/);
  assert.match(user,/you just ate player Zeca/,'o evento chega com nome, não como "kill"');
  assert.match(user,/Zeca: caraca me pegou/);assert.match(user,/Mila: kkkk morreu feio/);
  // sem conversa nenhuma o prompt tem que dizer isso, senão o modelo inventa um histórico
  assert.match(montaPrompt({nome:'Solo',kind:'start'}).user,/chat is empty/);
  // o histórico é cortado: prompt gordo é prompt lento, e a fala é do instante
  const muitas=Array.from({length:40},(_,i)=>({name:'P'+i,text:'linha '+i}));
  const u=montaPrompt({nome:'X',kind:'kill',historico:muitas}).user;
  assert.ok(!u.includes('linha 0'),'passou das BOT_LLM.HIST linhas');
  assert.ok(u.includes('linha 39'));
  // Quem está falando COM o bot vai repetido no fim, com a ordem de idioma colada. Enterrado no meio do
  // histórico o modelo seguia a maioria das linhas: numa sala falando português, um "hey X, you are trash"
  // voltava em português. Foi visto assim antes de existir este bloco.
  const men=montaPrompt({nome:'X',kind:'mention',quem:'Ana',texto:'hey X you are trash',
    historico:[{name:'Bot1',text:'peguei'},{name:'Bot2',text:'kkkk'}]}).user;
  assert.match(men,/says to YOU: "hey X you are trash"/);
  assert.match(men,/write your line in English/,'o idioma é NOMEADO quando dá para reconhecê-lo (ver o teste de idioma)');
  assert.ok(!montaPrompt({nome:'X',kind:'kill',quem:'Ana'}).user.includes('says to YOU'),'fala espontânea não tem destinatário');
});

test('gerar: o que a LLM devolve ainda passa pela peneira, e sem LLM não sai nada', async () => {
  const falso=(resp,ok=true)=>({ok:()=>ok,chat:async()=>resp});
  assert.equal(await createBotChat({llm:falso('  "toma essa"  ')}).gerar({nome:'A',kind:'kill'}),'toma essa');
  assert.equal(await createBotChat({llm:falso('As an AI language model, I cannot')}).gerar({nome:'A',kind:'kill'}),null);
  assert.equal(await createBotChat({llm:falso('qualquer coisa',false)}).gerar({nome:'A',kind:'kill'}),null,'disjuntor aberto = calado');
  assert.equal(await createBotChat({llm:null}).gerar({nome:'A',kind:'kill'}),null,'sem cliente nenhum');
  assert.equal(createBotChat({llm:null}).ativo(),false);
  assert.equal(createBotChat({llm:falso('x')}).ativo(),true);
});

test('cliente: sem URL o Ollama nunca é chamado (é o que mantém os testes e o dev offline)', async () => {
  const {createOllama}=await import('../src/llm/ollama.js');
  const vazio=createOllama({url:'',model:'m'});
  assert.equal(vazio.ok(),false);
  assert.equal(await vazio.chat({system:'s',user:'u'}),null);
  assert.equal(await vazio.warmup(),false);
  // e com URL que não responde: devolve null sem lançar, como o fetchPeerRooms
  const morto=createOllama({url:'http://127.0.0.1:1',model:'m',timeoutMs:250});
  assert.equal(await morto.chat({system:'s',user:'u'}),null);
  assert.ok(BOT_LLM.TIMEOUT_MS>0&&BOT_LLM.STALE_MS>BOT_LLM.TIMEOUT_MS,'o descarte por idade tem que ser mais frouxo que o timeout');
});

// ── O "THINKING": o que o bot está vivendo entra no prompt ───────────────────
test('estado: o que o brain já sabia e ninguém lia vira uma oração',()=>{
  assert.match(estadoLinha({modo:'flee',alvo:'Evandro',press:.5}),/running away from Evandro/);
  assert.match(estadoLinha({modo:'flee',alvo:'Evandro',press:1.4}),/right on top of you/);
  assert.match(estadoLinha({modo:'hunt',alvo:'Zeca'}),/chasing Zeca/);
  assert.match(estadoLinha({modo:'zone',zu:.8}),/gas ring/);
  assert.equal(estadoLinha({modo:'wander'}),'','andar por aí não vale o token que ocuparia');
  assert.equal(estadoLinha(null),'');
  assert.match(agressorLinha({nome:'Evandro',k:'tiro',n:3,recente:true}),/keeps shooting you/);
  assert.match(agressorLinha({nome:'Evandro',k:'tiro',n:1,recente:true}),/just shot you/);
  assert.equal(agressorLinha(null),'');
});

test('prompt: fugir DE quem atira em mim vira UMA oração, não duas',()=>{
  // É a frase mais forte do prompt inteiro e a razão de existir do "me deixa em paz, evandro!".
  // Duas orações dizendo quase a mesma coisa gastam token e diluem a que importa.
  const p=montaPrompt({nome:'Solares',kind:'mention',quem:'Evandro',texto:'vou te pegar',
    estado:{modo:'flee',alvo:'Evandro',press:1.5},agressor:{nome:'Evandro',k:'tiro',n:3,recente:true},historico:[]});
  const linha=p.user.split('\n').find(l=>l.startsWith('[right now:'));
  assert.ok(linha,'o bloco de estado não saiu');
  assert.match(linha,/running away from Evandro and he keeps shooting you/);
  assert.equal(linha.split('Evandro').length-1,1,'o nome apareceu duas vezes na mesma linha');
  // e quando são pessoas DIFERENTES, as duas orações aparecem
  const q=montaPrompt({nome:'Solares',kind:'kill',estado:{modo:'flee',alvo:'Zeca'},
    agressor:{nome:'Evandro',k:'tiro',n:1,recente:true},historico:[]});
  const l2=q.user.split('\n').find(l=>l.startsWith('[right now:'));
  assert.match(l2,/Zeca/);assert.match(l2,/Evandro/);
});

test('prompt: a persona entra e o pior caso cabe no teto de caracteres',()=>{
  const pior=PERSONAS.reduce((a,b)=>(b.quem+b.jeito).length>(a.quem+a.jeito).length?b:a);
  const hist=Array.from({length:BOT_LLM.HIST+4},(_,i)=>({name:'Jogador'+i,text:'x'.repeat(CHAT.MAX_CHARS)}));
  const p=montaPrompt({nome:'x'.repeat(16),historia:pior,rank:1,vivos:50,kind:'mention',
    quem:'y'.repeat(16),texto:'z'.repeat(CHAT.MAX_CHARS),
    estado:{modo:'flee',alvo:'y'.repeat(16),press:2},agressor:{nome:'w'.repeat(16),k:'tiro',n:5,recente:true},
    historico:hist});
  assert.ok(p.user.includes(pior.quem),'a história do bot não chegou ao prompt');
  assert.ok(p.system.includes(pior.bordao),'o bordão mora no SYSTEM (string estável, reaproveitada)');
  assert.ok(p.user.length<=BOT_LLM.PROMPT_MAX_CHARS,
    `prompt de ${p.user.length} chars passou de PROMPT_MAX_CHARS (${BOT_LLM.PROMPT_MAX_CHARS}) — prompt gordo é prompt lento`);
  // mensagem dirigida corta MAIS o histórico: a linha dirigida vale mais que o backlog
  assert.ok(p.user.split('\n').filter(l=>l.startsWith('Jogador')).length<=BOT_LLM.HIST_DIRIGIDA);
});

test('aberta: o que é convite para a sala e o que é frase solta',()=>{
  assert.equal(aberta('e aí galera, tudo bem?'),'pergunta');
  assert.equal(aberta('eu vou matar todo mundo'),'pergunta');
  assert.equal(aberta('alguem ai?'),'pergunta');
  assert.equal(aberta('opa'),'pergunta');
  assert.equal(aberta('boa'),'solta');
  assert.equal(aberta('olha o tamanho desse planeta'),'solta');
  assert.equal(aberta('Solares eu vou te pegar',true),null,'quem cita alguém não é convite para a sala');
});

test('persona: determinística pela semente, sem repetir e sempre completa',()=>{
  const seq=r=>{const u=new Set();return Array.from({length:PERSONAS.length},()=>pickPersona(createRng(0),u).id);};
  const rngA=createRng(1234),uA=new Set(),a=Array.from({length:6},()=>pickPersona(rngA,uA).id);
  const rngB=createRng(1234),uB=new Set(),b=Array.from({length:6},()=>pickPersona(rngB,uB).id);
  assert.deepEqual(a,b,'a mesma semente tem que dar a mesma escalação');
  assert.equal(new Set(a).size,a.length,'repetiu persona com pool sobrando');
  const u=new Set();for(let i=0;i<PERSONAS.length+3;i++)assert.ok(pickPersona(createRng(i),u),'esgotado o pool, ainda tem que devolver alguém');
  for(const p of PERSONAS){
    assert.ok(p.id&&p.quem&&p.jeito&&p.bordao,`persona ${p.id} incompleta`);
    assert.ok(p.bordao.length<=16,`bordão de ${p.id} longo demais`);
    assert.ok(/^[\x20-\x7e]+$/.test(p.quem+p.jeito),`${p.id}: quem/jeito precisam ser ASCII (vão no prompt em inglês)`);}
});

test('peneira: provocação passa, insulto sexual e xingamento de família não',()=>{
  // Medido na bancada (scripts/llm-bench.mjs): o SYSTEM pede e o modelo obedece na maioria das vezes —
  // e "na maioria" não serve para o que aparece na tela de uma sala de 50. Quem garante é a peneira.
  for(const t of ['evandro, sua puta! nao me encosta','vou comer teu bunda','vem tomar no cu','you asshole','seu corno'])
    assert.equal(sanitiza(t),null,`"${t}" passou`);
  for(const t of ['evandro, sua bala e lenta kkkk','calma evandro, vai chorar no fim','trash? i am winning u idiot','peguei','vem pro meio'])
    assert.ok(sanitiza(t),`"${t}" foi bloqueada e não devia`);
});

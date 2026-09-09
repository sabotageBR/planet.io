// ── FALA GERADA DOS BOTS: o que dá para provar sem rede ───────────────────────
// A geração em si depende de um Ollama e de sorte; o que NÃO pode depender de nenhum dos dois é o que
// cerca a geração: reconhecer que alguém te chamou (mesmo escrevendo errado) e desconfiar do que voltou.
// Esses dois são pura função e é o que este arquivo trava. node --test server/test/botchat.test.js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {citou,baseNick,sanitiza,normalizar,montaPrompt,detectaIdioma,createBotChat,aberta,estadoLinha,agressorLinha,
  elencoLinha,escolheAssunto,paisEn,IDIOMA_NOME,MARCAS} from '../src/rooms/botChat.js';
import {PERSONAS,pickPersona} from '../src/rooms/botPersonas.js';
import {createRng} from '@warspace/shared/rng.js';
import {botNick,BOT_LLM,CHAT} from '@warspace/shared/constants.js';
import * as CONST from '@warspace/shared/constants.js';
import {applyTunable,resetTunable,TUNABLE_BY_KEY} from '@warspace/shared/tunables.js';

test('menção: a raiz do apelido sobrevive aos quatro formatos de botNick', () => {
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
  // ⚠️ 'Brazilian Portuguese', e não 'Portuguese': a chave de MARCAS é o NOME QUE VAI PARA O PROMPT, e o
  // mesmo prompt saía com as duas grafias (esta e o chão da LANGUAGE RULE) se contradizendo de leve.
  assert.equal(detectaIdioma('vc ta muito ruim mano kkkk'),'Brazilian Portuguese');
  assert.equal(detectaIdioma('Trovao vem ca seu covarde'),'Brazilian Portuguese');
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
  const vazio=createOllama({url:''});
  assert.equal(vazio.ok(),false);
  assert.equal(await vazio.chat({system:'s',user:'u'}),null);
  assert.equal(await vazio.warmup(),false);
  // e com URL que não responde: devolve null sem lançar, como o fetchPeerRooms
  const morto=createOllama({url:'http://127.0.0.1:1',timeoutMs:250});
  assert.equal(await morto.chat({system:'s',user:'u'}),null);
  assert.ok(BOT_LLM.TIMEOUT_MS>0&&BOT_LLM.STALE_MS>BOT_LLM.TIMEOUT_MS,'o descarte por idade tem que ser mais frouxo que o timeout');
});

// ── QUAL MODELO ATENDE: o cliente não fecha o nome no closure ────────────────
// O painel troca `BOT_LLM.MODELO` em runtime, e o cliente é criado UMA vez no boot: se o modelo estivesse
// capturado na criação, o /admin diria "salvo" e o servidor continuaria chamando o modelo antigo para
// sempre — em silêncio, que é o pior jeito de quebrar.
test('modelo: é lido do tunable a cada chamada, e o env semeia sem sair da lista branca', async () => {
  const {createOllama,seedModelo}=await import('../src/llm/ollama.js');
  const {applyTunable,resetTunable,TUNABLE_BY_KEY}=await import('@warspace/shared/tunables.js');
  const modelo0=BOT_LLM.MODELO,lista0=BOT_LLM.MODELOS.slice();
  try{
    const cli=createOllama({url:'http://127.0.0.1:1'});
    assert.equal(cli.model,BOT_LLM.MODELO);
    assert.equal(BOT_LLM.MODELO,'gpt-oss:20b','o padrão do código');
    applyTunable('BOT_LLM.MODELO','qwen3.6:35b-a3b');
    assert.equal(cli.model,'qwen3.6:35b-a3b','o cliente já criado enxerga a troca');
    assert.throws(()=>applyTunable('BOT_LLM.MODELO','llama-inventado:1b'),/out_of_range/,'lista fechada');
    // O env pode nomear um modelo que este código não conhece: ele ENTRA na lista, senão o painel abriria
    // com um select sem o valor em uso.
    seedModelo('modelo-do-operador:7b');
    assert.equal(cli.model,'modelo-do-operador:7b');
    assert.ok(TUNABLE_BY_KEY.get('BOT_LLM.MODELO').options.some(o=>o.v==='modelo-do-operador:7b'),
      'as options são a lista por REFERÊNCIA, então o acréscimo vale para o PUT e para o painel');
    assert.equal(resetTunable('BOT_LLM.MODELO'),modelo0,'"voltar ao padrão" é o do código, nunca o do env');
  }finally{BOT_LLM.MODELO=modelo0;BOT_LLM.MODELOS.length=0;BOT_LLM.MODELOS.push(...lista0);}
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
  // ⚠️ O PIOR CASO tem que ser o que `Room._ctxFala` MANDA, não um subconjunto dele. Este teste media um
  // cenário sem `feed`, `modo`, `fracLider`, `lider`, `zonaS` e `gente` — campos que o `_ctxFala` passa
  // SEMPRE —, dava 1225 chars e aprovava, enquanto a produção mandava 1531 contra um teto de 1500. Um teto
  // só vale o que o pior caso do teste vale, e este estava estourado havia tempo sem ninguém ver.
  const gente=Array.from({length:BOT_LLM.ELENCO_MAX},()=>({nome:'N'.repeat(16),egg:'Michael Schumacher',pais:'BR',nivel:60}));
  const p=montaPrompt({nome:'x'.repeat(16),historia:pior,rank:1,vivos:50,kind:'mention',
    quem:'y'.repeat(16),texto:'z'.repeat(CHAT.MAX_CHARS),
    estado:{modo:'flee',alvo:'y'.repeat(16),press:2},agressor:{nome:'w'.repeat(16),k:'tiro',n:5,recente:true},
    modo:'battle royale, last one standing',fracLider:.05,lider:'L'.repeat(16),zonaS:44,
    feed:Array.from({length:BOT_LLM.FEED_HIST},()=>`${'A'.repeat(16)} killed ${'B'.repeat(16)}`),
    gente,historico:hist});
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
  // ⚠️ Isto é o nível LIGADO do filtro (`CHAT.FILTRO`), que não é mais o padrão: xingar virou decisão de
  // produto e a estreia é `livre`. O que sobra do bot no livre está logo abaixo — e é o ÓDIO, sempre.
  const antes=CHAT.FILTRO;CHAT.FILTRO='pesado';
  try{
    for(const t of ['evandro, sua puta! nao me encosta','vou comer teu bunda','vem tomar no cu','you asshole','seu corno'])
      assert.equal(sanitiza(t),null,`"${t}" passou`);
    for(const t of ['evandro, sua bala e lenta kkkk','calma evandro, vai chorar no fim','trash? i am winning u idiot','peguei','vem pro meio'])
      assert.ok(sanitiza(t),`"${t}" foi bloqueada e não devia`);
  }finally{CHAT.FILTRO=antes;}
});

test('peneira no padrão LIVRE: o bot xinga como a sala, mas o ÓDIO é piso',()=>{
  assert.equal(CHAT.FILTRO,'livre','o padrão do arquivo mudou sem o teste acompanhar');
  for(const t of ['seu corno','you asshole','vem tomar no cu'])
    assert.ok(sanitiza(t),`"${t}" devia passar com o chat livre — senão o bot fica mais contido que a sala`);
  for(const t of ['seu viado','nigger','retardado'])
    assert.equal(sanitiza(t),null,`"${t}": slur é o que o servidor não inventa em nível nenhum`);
});

// ── QUEM É QUEM: a identidade do mundo real no prompt ─────────────────────────
test('elenco: a caricatura é o dado forte, e quem não tem o que dizer não gasta caractere',()=>{
  const l=elencoLinha([{nome:'Messi',egg:'Lionel Messi',pais:'AR',nivel:31},
                       {nome:'Solares',egg:null,pais:'BR',nivel:2}],'Solares');
  assert.match(l,/"Messi" plays as Lionel Messi/,'a caricatura é o que transforma um nick numa piada');
  assert.match(l,/from Argentina/,'o país sai em INGLÊS: o prompt inteiro é inglês');
  assert.match(l,/level 31/);
  assert.match(l,/\byou from Brazil\b/,'o próprio bot é "you", nunca o nome dele');
  assert.ok(!/level 2\b/.test(l),'nível baixo não é adjetivo de nada');
  // quem não tem caricatura, nem país, nem nível alto não entra
  assert.equal(elencoLinha([{nome:'Zeca',egg:null,pais:null,nivel:3}],'eu'),'');
  assert.equal(elencoLinha([],'eu'),'');
  assert.equal(elencoLinha(null,'eu'),'');
});

test('país: sai em inglês, e código inválido nunca derruba a fala',()=>{
  assert.equal(paisEn('BR'),'Brazil');
  assert.equal(paisEn('AR'),'Argentina');
  // ⚠️ `Intl.DisplayNames` LANÇA em código inválido, e `gp.country` de um humano vem do banco: aqui o
  // pior caso tem que ser um texto ruim, nunca uma exceção subindo pelo caminho da fala.
  for(const v of ['',null,undefined,'ZZZZ','1','br ']) assert.doesNotThrow(()=>paisEn(v));
  assert.equal(paisEn(''),'');
});

// ── O ASSUNTO DA INICIATIVA ──────────────────────────────────────────────────
test('assunto: o bot puxa conversa sobre o que ESTÁ acontecendo, por ordem de urgência',()=>{
  // o relógio ganha de tudo
  assert.equal(escolheAssunto({zonaS:12,feedFresco:true,lider:'X',fracLider:.1,vivos:3}).assunto,'gas');
  // a fofoca fresca ganha do líder
  assert.equal(escolheAssunto({zonaS:0,feedFresco:true,lider:'X',fracLider:.1}).assunto,'feed');
  // o líder só vira assunto quando ele está MUITO na frente
  const l=escolheAssunto({feedFresco:false,lider:'Trovao',fracLider:.1,vivos:20});
  assert.equal(l.assunto,'lider');assert.equal(l.quem,'Trovao','o nome vai junto, senão a linha fica sobre ninguém');
  assert.equal(escolheAssunto({lider:'Trovao',fracLider:.9,vivos:20}).assunto,'partida','empatado com o líder não é notícia');
  assert.equal(escolheAssunto({vivos:4}).assunto,'poucos');
  assert.equal(escolheAssunto({vivos:30}).assunto,'partida');
  assert.equal(escolheAssunto(null).assunto,'partida','sem contexto nenhum ainda tem que devolver algo');
});

test('prompt: a iniciativa dá licença para ABRIR conversa, e não cai no caso genérico',()=>{
  const p=montaPrompt({nome:'Solares',kind:'puxa',assunto:'lider',quem:'Trovao',historico:[]});
  assert.match(p.user,/nobody is talking/,'é o "ninguém está falando" que autoriza o bot a começar');
  assert.match(p.user,/Trovao/,'e o assunto tem que ter um sujeito');
  // ⚠️ A armadilha irmã do `||BOT_CHAT.kill`: sem um case próprio isto cairia no default e a iniciativa
  // viraria uma linha genérica sobre nada.
  assert.ok(!p.user.includes('the match is going on'),'caiu no default: o kind não tem case próprio');
  for(const a of ['gas','feed','poucos','partida']){
    const q=montaPrompt({nome:'S',kind:'puxa',assunto:a,historico:[]});
    assert.ok(!q.user.includes('the match is going on'),`assunto "${a}" caiu no default`);}
});

test('prompt: o elenco entra e vem ANTES da partida (identidade é pano de fundo)',()=>{
  const p=montaPrompt({nome:'Solares',kind:'kill',quem:'Messi',vivos:10,modo:'free-for-all',
    gente:[{nome:'Messi',egg:'Lionel Messi',pais:'AR',nivel:31}],historico:[]});
  const linhas=p.user.split('\n');
  const iQuem=linhas.findIndex(l=>l.startsWith('[who is who:'));
  const iPart=linhas.findIndex(l=>l.startsWith('[the match:'));
  assert.ok(iQuem>0,'o bloco de identidade não saiu');
  assert.ok(iQuem<iPart,'identidade é o pano de fundo mais estável: vem antes da partida');
  // sem elenco o bloco simplesmente não existe — nada de rótulo vazio ocupando prompt
  assert.ok(!montaPrompt({nome:'S',kind:'kill',historico:[]}).user.includes('who is who'));
});

// ── A PENEIRA NOVA ───────────────────────────────────────────────────────────
test('peneira: a piada com o personagem passa, a manchete política não',()=>{
  for(const t of ['esse einstein nao calcula nada kkkk','o messi aqui so sabe correr',
                  'trump ta pequeno demais pra falar','vem pela esquerda que eu te pego',
                  'vira a direita rapido'])
    assert.ok(sanitiza(t),`"${t}" foi bloqueada e não devia — é fala de partida`);
  for(const t of ['vota no bolsonaro','esse comunista de merda','a eleicao foi roubada',
                  'deus me livre desse cara','isso e uma ditadura','vai ter guerra'])
    assert.equal(sanitiza(t),null,`"${t}" passou`);
  // ⚠️ E o LIMITE, escrito de propósito: "lula roubou tudo" PASSA, porque o único termo político dela é o
  // nome — que é justamente o que o SYSTEM autoriza brincar — e "roubou" é palavra de partida ("ele roubou
  // minha massa"). Vetá-la exigiria vetar o verbo, que é o mesmo erro de vetar "esquerda"/"direita": o
  // filtro comeria fala legítima o dia inteiro para pegar um caso. A peneira pega o vocabulário
  // INEQUÍVOCO; a defesa contra o resto é o SYSTEM, e a defesa em profundidade é aceitar que ele erra
  // pouco em vez de mutilar a fala do jogo.
  assert.ok(sanitiza('lula roubou minha massa kkkk'),'o verbo do jogo não pode ser vetado');
});

test('peneira: ninguém entrega o preenchimento na tela',()=>{
  // ⚠️ No Battle Royale o `anonBots` tirou o PLAYER_FLAG.BOT do fio de propósito; bastava um bot escrever
  // isto para desfazer o disfarce inteiro na frente da sala.
  for(const t of ['voce e um bot','vcs sao tudo bot','you are a bot','esses npc sao ruins'])
    assert.equal(sanitiza(t),null,`"${t}" passou`);
  // ...mas a palavra sozinha é gíria de partida e não pode calar ninguém
  assert.ok(sanitiza('bot mode ativado kkkk'),'a palavra solta não pode virar veto');
});

test('peneira: o teto da SAÍDA e o corte do HISTÓRICO são independentes',()=>{
  // Os dois eram a MESMA constante em papéis diferentes, e por um tempo este teste travou
  // `MAX_CHARS > HIST_CHARS` — o que valia enquanto a fala estava CRESCENDO. Ela encolheu (o teto virou
  // parâmetro do painel, justamente para poder encolher), então a desigualdade se inverteu sem nada
  // quebrar: HIST_CHARS corta a linha de QUEM QUER QUE SEJA que entra no prompt, e o humano escreve até
  // CHAT.MAX_CHARS. O que continua sendo invariante é o teto de cada um contra o do chat.
  assert.ok(BOT_LLM.MAX_CHARS<=CHAT.MAX_CHARS,'o bot não pode escrever mais que um humano');
  assert.ok(BOT_LLM.HIST_CHARS<=CHAT.MAX_CHARS,'cortar acima do que cabe numa linha de chat seria no-op');
  assert.ok(sanitiza('a '.repeat(BOT_LLM.MAX_WORDS).trim()),'exatamente MAX_WORDS tem que passar');
  assert.equal(sanitiza('a '.repeat(BOT_LLM.MAX_WORDS+1).trim()),null,'uma palavra a mais, não');
  assert.ok(sanitiza('x'.repeat(BOT_LLM.MAX_CHARS)));
  assert.equal(sanitiza('x'.repeat(BOT_LLM.MAX_CHARS+1)),null);
  // o histórico é aparado em HIST_CHARS, e é isso que impede a fala maior de engordar o prompt
  const p=montaPrompt({nome:'S',kind:'kill',historico:[{name:'Z',text:'y'.repeat(CHAT.MAX_CHARS)}]});
  assert.ok(p.user.includes('y'.repeat(BOT_LLM.HIST_CHARS-1)+'…'));
});

test('constantes: os freios da conversa longa são coerentes entre si',()=>{
  // No espírito do `STALE_MS > TIMEOUT_MS` que este arquivo já cobra: números que se contradizem viram
  // funcionalidade morta em silêncio, que é o pior jeito de quebrar.
  assert.ok(BOT_LLM.CADEIA_SOLTA_P<BOT_LLM.CADEIA_P,'continuar sem ser chamado tem que ser mais raro que ser chamado');
  assert.ok(BOT_LLM.CADEIA_JANELA<BOT_LLM.CADEIA_MAX,'janela >= profundidade trava a corrente no primeiro elo');
  assert.ok(BOT_LLM.CADEIA_BOT_CD_TICKS<BOT_LLM.MENTION_BOT_CD_TICKS,
    'com o cooldown da MENÇÃO valendo dentro da corrente, afrouxar a janela é um no-op');
  assert.ok(BOT_LLM.CONVERSA_MAX_GER_BOT<BOT_LLM.CONVERSA_MAX_GER,'quem puxou assunto sozinho tem menos crédito');
  assert.ok(BOT_LLM.FILA_MAX>=BOT_LLM.CONVERSA_MAX_GER,'a fila é o amortecedor: menor que o teto ela transborda por construção');
  assert.ok(CONST.BOT_TALK.SILENCIO_TICKS>CONST.BOT_TALK.ROOM_CD_TICKS,
    'a iniciativa não pode disparar antes de a sala poder falar de novo');
  assert.ok(CONST.BOT_CHAT.puxa&&CONST.BOT_CHAT.puxa.length>=4,
    'sem pool próprio o _fraseFixa cai no ||BOT_CHAT.kill e o bot diz "peguei" do nada');
});

// ── O TAMANHO E O TIPO DA FALA SÃO PARÂMETROS DO PAINEL (/admin → Parâmetros) ──
// O que estes dois travam não é o valor, é o CAMINHO: os dois números saem de `constants.js` e podem
// mudar em runtime, então o SYSTEM tem que ser montado a cada geração. Enquanto ele foi const de módulo,
// mexer no teto pelo painel encurtava só a PENEIRA — e a peneira RECUSA em vez de cortar, ou seja, o
// parâmetro deixaria o bot mais MUDO em vez de mais breve, que é o oposto do pedido.
test('tamanho da fala: o teto vivo é DITADO ao modelo, não só peneirado',()=>{
  const chave='BOT_LLM.MAX_WORDS';
  try{
    applyTunable(chave,6);
    assert.match(montaPrompt({nome:'S',kind:'kill'}).system,/never more than 6\b/,'o teto de agora tem que chegar ao prompt');
    assert.match(montaPrompt({nome:'S',kind:'kill'}).system,/usually under 5\b/,'e o "usual" acompanha, com folga para a peneira');
    applyTunable(chave,14);
    assert.match(montaPrompt({nome:'S',kind:'kill'}).system,/never more than 14\b/);
  }finally{resetTunable(chave);}});

test('tipo de conversa: cada opção do painel vira uma instrução PRÓPRIA no prompt',()=>{
  const opcoes=TUNABLE_BY_KEY.get('BOT_LLM.ESTILO').options;
  try{
    const vistos=new Map();
    for(const o of opcoes){
      applyTunable('BOT_LLM.ESTILO',o.v);
      const sys=montaPrompt({nome:'S',kind:'kill'}).system;
      // Um id sem frase em ESTILO_PROMPT cairia no `misto` em silêncio, e o admin teria no painel uma
      // opção que não faz nada — o pior jeito de um parâmetro falhar.
      for(const [outro,txt] of vistos)assert.notEqual(sys,txt,`'${o.v}' e '${outro}' geram o MESMO prompt`);
      vistos.set(o.v,sys);}
    applyTunable('BOT_LLM.ESTILO','ofensa');
    assert.match(montaPrompt({nome:'S',kind:'kill'}).system,/Trash talk/);
    applyTunable('BOT_LLM.ESTILO','seco');
    assert.match(montaPrompt({nome:'S',kind:'kill'}).system,/Do not mock anyone/);
  }finally{resetTunable('BOT_LLM.ESTILO');}});

// ── O IDIOMA DA FALA (BOT_LLM.IDIOMA) ────────────────────────────────────────
test('idioma: o painel oferece exatamente o que o servidor sabe tratar',()=>{
  // Um id no `<select>` sem par em IDIOMA_NOME é um parâmetro que grava e não faz nada; um par sem entrada
  // em MARCAS é um idioma que o modo `auto` nunca consegue detectar. As três listas são UMA, e é este
  // teste que as mantém assim — acrescentar um idioma é mexer nas três de propósito.
  assert.deepEqual(BOT_LLM.IDIOMAS.map(o=>o.v).filter(v=>v!=='auto').sort(),Object.keys(IDIOMA_NOME).sort());
  assert.deepEqual(Object.values(IDIOMA_NOME).sort(),Object.keys(MARCAS).sort());
  assert.equal(BOT_LLM.IDIOMA,'auto','o padrão tem que ser indistinguível do que já está no ar');});

test('idioma: travado no painel, a regra de "responda na língua da mensagem" SAI do prompt',()=>{
  try{
    // auto = o de sempre: quem escreveu decide, e a regra completa está no SYSTEM
    const p0=montaPrompt({nome:'X',kind:'mention',quem:'A',texto:'eres muy malo jugando'});
    assert.match(p0.user,/write your line in Spanish/);
    assert.match(p0.system,/reply in THAT message/);
    applyTunable('BOT_LLM.IDIOMA','pt-BR');
    const p=montaPrompt({nome:'X',kind:'mention',quem:'A',texto:'eres muy malo jugando'});
    assert.match(p.user,/write your line in Brazilian Portuguese/,'travado, o detector é PULADO — não corrigido');
    // ⚠️ A exceção não pode ficar de pé: com ela, um "hi bro" perdido viraria a sala inteira em inglês, e o
    // parâmetro seria desligado pelo primeiro estrangeiro que aparecesse.
    assert.doesNotMatch(p.system,/reply in THAT message/);
    assert.match(p.system,/always write in Brazilian Portuguese/);
    // e vale também na fala de INICIATIVA, que não tem mensagem nenhuma para detectar
    assert.match(montaPrompt({nome:'X',kind:'puxa'}).user,/write your line in Brazilian Portuguese/);
    applyTunable('BOT_LLM.IDIOMA','en');
    assert.match(montaPrompt({nome:'X',kind:'mention',quem:'A',texto:'vc ta muito ruim mano'}).user,/write your line in English/);
    assert.throws(()=>applyTunable('BOT_LLM.IDIOMA','fr'),/out_of_range/,'a lista de opções é a segunda lista branca');
  }finally{resetTunable('BOT_LLM.IDIOMA');}});

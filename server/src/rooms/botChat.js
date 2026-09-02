// ── FALA GERADA DOS PREENCHIMENTOS: prompt, limpeza e detecção de menção ──────────────────────
// Este módulo NÃO conhece HTTP nem sala: recebe o cliente da LLM pronto e devolve texto. O que ele sabe
// fazer é traduzir "um bot com este nome, esta personalidade e esta perícia acabou de viver isto, e o chat
// disse aquilo" num pedido curto, e depois desconfiar da resposta.
//
// O system prompt é em INGLÊS de propósito, mesmo o jogo sendo pt-BR: a instrução "responda no idioma das
// mensagens recentes" é seguida com muito mais fidelidade em inglês, e é ela que faz o bot responder em
// português para quem escreve em português e em inglês para quem escreve em inglês — sem nenhum detector
// de idioma do nosso lado. Foi verificado com pt/en/es antes de escrever isto.
// @ts-check
import {BOT_LLM,CHAT} from '@warspace/shared/constants.js';
import {normalizar,baseNick} from '@warspace/shared/util.js';
import {temGrave} from '../palavrao.js';

// ── nomes ────────────────────────────────────────────────────────────────────
// `normalizar` e `baseNick` mudaram para shared/src/util.js quando os easter eggs (shared/src/eggs.js)
// passaram a precisar da MESMA raiz — shared não pode importar de server. Reexportados aqui para que
// `citou()` e os testes continuem lendo do mesmo lugar de sempre.
export {normalizar,baseNick} from '@warspace/shared/util.js';
/** Levenshtein sem alocar matriz. Só é usado em palavras curtas de chat. */
function dist(a,b){
  const n=a.length,m=b.length;if(!n)return m;if(!m)return n;
  let prev=new Array(m+1),cur=new Array(m+1);
  for(let j=0;j<=m;j++)prev[j]=j;
  for(let i=1;i<=n;i++){cur[0]=i;
    for(let j=1;j<=m;j++){const c=a.charCodeAt(i-1)===b.charCodeAt(j-1)?0:1;
      cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+c);}
    const t=prev;prev=cur;cur=t;}
  return prev[m];}
// Sufixos que um jogador cola no apelido de outro sem deixar de estar falando com ele. A lista existe para
// que "trovaozinho" case e "milagre" NÃO case com "mila": comparar por substring solta transformava
// qualquer raiz curta em menção, e o bot respondia a conversas em que ninguém o chamou.
const SUFIXOS=['','s','es','o','a','ao','oes','inho','inha','zinho','zinha','zao','zona','ada','y','ie','ito','ita'];
const CORTE_MIN=5,CORTE_K=.6,DIST_MIN=4,SUF_MIN=4,TOL2_MIN=9;   // ver os caminhos 2 a 4 de `citou`
// Apelido curto que POR ACASO é uma palavra de conversa. `botNick` produz coisas como "pro", "neo", "vex",
// e sem esta lista o bot "PRO" respondia a todo "vem pro meio", e o "vex" a todo "vem". Falso positivo é o
// pecado grave aqui: responder a quem não te chamou é exatamente o "não polua o chat".
// Um nick que seja exatamente uma destas nunca é reconhecido por menção — é o preço, e é o barato.
export const COMUNS=new Set(('que com para pra pro por uma uns seu sua meu nao sim vem vai vou tem ter foi era ele ela eles isso essa esse '
 +'isto aqui ali la ta to tu voce vcs vc todo toda tudo nada mais bem mal boa bom bora agora ja so ate dai sai sao dos das num nem '
 +'quem como onde cade calma corre gente mano cara gas top gg glhf kkk eita vish opa oi ola valeu foda '
 +'the and you your are was get got out off run hey yes yep nope lol wtf omg brb this that here there come '
 +'dead kill nice good bad man bro dude what when why how who now stop help wait easy noob pro rush camp').split(' '));
/**
 * A mensagem chama este bot? Ninguém digita o apelido inteiro e certinho no meio de uma partida — escreve a
 * raiz, erra uma letra, corta, põe diminutivo. A comparação é sempre por PALAVRA INTEIRA (o `@`, a vírgula e
 * o sublinhado já viraram espaço em `normalizar`), em três caminhos:
 *   1. a palavra é a raiz ("cade o trovao", "trovao_137" → "trovao 137");
 *   2. a palavra é a raiz + um sufixo da lista ("trovaozinho");
 *   3. a palavra é a raiz CORTADA, com 5+ letras e a maior parte dela ("cassi" para "Cassiona");
 *   4. a palavra tem tamanho parecido e está a 1–2 letras da raiz ("trovão", "trvao", "drakonix").
 * Raiz com menos de 3 letras não conta: casaria com meia língua portuguesa.
 */
export function citou(texto,nick){
  const base=baseNick(nick);if(base.length<3||COMUNS.has(base))return false;
  const t=normalizar(texto);if(!t)return false;
  const tol=base.length>=TOL2_MIN?2:1;   // duas letras de folga só em raiz LONGA: com 7 letras, "sorte" já alcança "sorvete"
  for(const w of t.split(' ')){
    if(!w||COMUNS.has(w))continue;
    if(w===base)return true;
    if(baseNick(w)===base)return true;   // digitou o apelido COM o enfeite ("xXlipeXx", "nebulox42")
    if(base.length>=SUF_MIN&&w.length>base.length&&w.startsWith(base)&&SUFIXOS.includes(w.slice(base.length)))return true;   // "tom"+"a" viraria "toma massa"
    // apelido CORTADO: "cassi" para "Cassiona", "nebul" para "Nebulox". Exige 5 letras e a maior parte da
    // raiz, senão qualquer palavra comum de 5 letras viraria menção de qualquer nick que comece igual.
    if(w.length>=CORTE_MIN&&w.length<base.length&&base.startsWith(w)&&w.length>=base.length*CORTE_K)return true;
    // Distância só para raízes de 5+ letras. Com 3 ou 4, uma letra de folga faz "vex" casar com "vem" e
    // "neo" com "nao" — a metade da língua portuguesa fica a um passo de um apelido curto.
    if(base.length>=DIST_MIN&&Math.abs(w.length-base.length)<=tol&&dist(w,base)<=tol)return true;}
  return false;}

// ── limpeza da resposta ──────────────────────────────────────────────────────
// Duas famílias: quem se declara assistente em qualquer ponto da frase, e o PREFÁCIO ("sure, here is…"),
// que só conta no começo — "claro" no meio de uma zoeira é português normal, não um modelo se apresentando.
const SUSPEITO=/(\bas an ai\b|\bi'?m an ai\b|language model|\bassistant\b|como uma ia|sou uma ia|^\s*(sure|certainly|of course|here'?s|here is|claro|aqui est[áa])\b)/i;

// ── LIMITE DO PALAVREADO ─────────────────────────────────────────────────────
// A provocação é metade da graça e fica; o que sai é insulto sexual, xingamento de família e slur. Isto
// mora AQUI, na peneira, e não só no SYSTEM, porque a instrução do prompt é um PEDIDO: medindo na bancada
// (scripts/llm-bench.mjs), o modelo obedecia na maioria das vezes e escapava numa a cada dez — e "na
// maioria das vezes" não serve para o que aparece na tela de todo mundo numa sala de 50.
// Recusar aqui não deixa ninguém mudo: quem chama `sanitiza` cai no repertório fixo de BOT_CHAT.
// ⚠️ A lista saiu daqui para `server/src/palavrao.js` porque ela tinha UM consumidor e precisava de dois: a linha do
// JOGADOR não passava por peneira nenhuma — o preenchimento era censurado e a pessoa não. Lá também estão
// os buracos que a varredura achou (`fuck` e `shit` nunca estiveram nesta lista) e a separação entre o que
// se RECUSA do bot e o que se MASCARA do humano.
// ── O QUE NÃO SE FALA NUMA PARTIDA ────────────────────────────────────────────
// O jogo tem caricaturas de Trump, Lula, Bolsonaro, Putin, Zelensky e Milei, e o SYSTEM agora AUTORIZA
// brincar com quem o jogador está vestindo. A graça é a PERSONA — "esse Einstein não calcula nada" —, e
// o que não pode sair é a manchete: opinião política, eleição, partido, guerra, religião. Isto mora aqui
// e não só no SYSTEM pelo mesmo motivo de OFENSA: a instrução é um PEDIDO, e o modelo escapa uma em dez.
// ⚠️ "esquerda" e "direita" NÃO entram soltas: são direções dentro do jogo ("vem pela esquerda"), e
// vetá-las comeria fala legítima de partida o dia inteiro.
const POLITICA=new RegExp('\\b('+[
  'elei[çc][ãa]o','elei[çc][õo]es','eleitor','eleitoral','vot[ao]','vot[ae]m','votar','votou','votos?','urna','presidente','deputado','senador','partido',
  'comunista','socialista','fascista','ditadura','golpe','corrup[çc][ãa]o','impeachment','esquerdista','direitista',
  'petista','bolsonarista','nazi','nazista','guerra','religi[ãa]o','igreja','deus','jesus','al[aá]',
  'election','voter','ballot','president','senator','congress','communist','socialist','fascist','dictator',
  'coup','impeach','leftist','rightist','nazi','war','religion','church','god','jesus','allah',
  'ateu','ateia','crente','evangelic[oa]','cat[óo]lic[oa]','atheist','christian','muslim','jew',
].join('|')+')\\b','i');
// A linha que ENTREGA o preenchimento. No Battle Royale o bot não se identifica (`anonBots` tirou o
// PLAYER_FLAG.BOT do fio de propósito), e bastava um deles escrever "vc é bot" para desfazer isso na tela.
const BOT_META=/\b(bot|bots|npc|ia|ai|rob[ôo]|robot|script|fake)\b/i;
const APONTA=/\b(voce|vocês|voces|você|tu|ele|ela|eles|sao|são|é|eh|you|u r|ur|is|are|these|those)\b/i;
/**
 * A saída de um modelo não é uma linha de chat até provar que é. Corta no primeiro `\n` (ele adora listar),
 * tira o próprio nome quando ele vem como prefixo de turno, tira aspas e asteriscos de "narração", derruba
 * emoji (o repertório do jogo não usa) e recusa qualquer coisa que se denuncie como assistente.
 * Devolve `null` quando não sobrou uma frase utilizável.
 */
export function sanitiza(txt,nome=''){
  let s=String(txt||'');
  s=s.replace(/<think>[\s\S]*?<\/think>/gi,'');            // cinto de segurança para o `think:false`
  s=s.split('\n')[0];
  // "Manu: cala a boca" → "cala a boca". O histórico vai para o prompt no formato `Nome: texto`, e o modelo
  // às vezes devolve o próprio turno com o prefixo. Só o PRÓPRIO nome é cortado: qualquer nome serviria de
  // padrão, mas aí "Lula: fica quieto" (um bot falando COM alguém) perderia o vocativo.
  if(nome){const esc=String(nome).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    s=s.replace(new RegExp(`^\\s*${esc}\\s*[:>-]\\s*`,'i'),'');}
  s=s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu,'');   // emoji
  s=s.replace(/^[\s"'“”‘’*`\-–—>]+|[\s"'“”‘’*`]+$/g,'');
  s=s.replace(/\s+/g,' ').trim();
  if(!s)return null;
  if(SUSPEITO.test(s))return null;
  if(temGrave(s))return null;
  if(POLITICA.test(s))return null;
  // Meta-bot só conta quando APONTA para alguém: "bot" sozinho é gíria de partida ("robô" de futebol,
  // "ai" em espanhol), e vetar a palavra solta calaria fala normal. O par é que denuncia.
  if(BOT_META.test(s)&&APONTA.test(s))return null;
  if(s.split(' ').length>BOT_LLM.MAX_WORDS)return null;    // parágrafo não é fala de partida: melhor calar
  if(s.length>Math.min(BOT_LLM.MAX_CHARS,CHAT.MAX_CHARS))return null;   // ⚠️ MAX_CHARS é o teto da SAÍDA; o corte do histórico é HIST_CHARS
  return s;}

// ── idioma ───────────────────────────────────────────────────────────────────
// Dizer ao modelo "responda no idioma da mensagem" funciona quase sempre — e "quase" é o problema: uma
// resposta em português para quem escreveu em espanhol é justamente o que se queria evitar. Nomear o idioma
// ("reply in Spanish") tira a decisão do modelo e a traz para cá, onde dá para testar.
// Não é um detector geral de idioma: é um voto entre as três línguas que aparecem no jogo, com palavras
// FUNCIONAIS (as que ninguém escreve por acaso) e o desempate na dúvida sendo NÃO nomear nada.
const MARCAS={
  Portuguese:'nao não vc você voce ta tá pra pro muito mano cara kkk kkkk seu sua dele dela isso aqui entao então vou vai tem foi eu te comer corre gordo lixo caralho porra merda mesmo agora ja já so só'.split(' '),
  Spanish:'eres muy pero porque donde dónde jaja jajaja hola amigo basura mierda bueno malo mucho estas estás vamos tio tío puta joder gilipollas nino niño esto eso alli allí'.split(' '),
  English:'the you your are is and this that what why how get got out off fuck shit bro dude man noob easy trash gonna dont don not going'.split(' '),
};
/** Idioma provável de um texto curto, ou `null` quando não dá para afirmar. */
export function detectaIdioma(texto){
  const ws=new Set(normalizar(texto).split(' ').filter(Boolean));
  if(!ws.size)return null;
  let melhor=null,max=0,empate=false;
  for(const [lang,marcas] of Object.entries(MARCAS)){
    let n=0;for(const m of marcas)if(ws.has(normalizar(m)))n++;
    if(n>max){max=n;melhor=lang;empate=false;}else if(n===max&&n>0)empate=true;}
  return max>=1&&!empate?melhor:null;}

// ── quem a mensagem chama ────────────────────────────────────────────────────
// Um vocativo coletivo ("e aí galera, tudo bem?") ou uma provocação à sala ("eu vou matar todo mundo") é
// convite para VÁRIOS responderem; uma frase solta não é. Quem cita alguém pelo nome não passa por aqui —
// esse caso é do `citou`, e a resposta é de quem foi chamado.
const COLETIVO=/\b(galera|pessoal|gente|povo|turma|geral|alguem|todo mundo|todos|guys|everyone|anyone|yall)\b/;
const SAUDACAO=/^(e ?ai|eai|opa|salve|oi|ola|fala|hey|yo|hi|hello|boa noite|bom dia|boa tarde)\b/;
const PROVOCA=/\b(vou (matar|pegar|comer|acabar)|quem (quer|vem|ta|manda)|bora|se acha|medo|desafio|apanhar|facil)\b/;
/**
 * 'pergunta' = mensagem jogada para a SALA (vale coro) · 'solta' = comentário qualquer · null = cita alguém.
 * @param {string} texto @param {boolean} temCitacao
 */
export function aberta(texto,temCitacao=false){
  if(temCitacao)return null;
  const t=normalizar(texto);
  if(!t)return 'solta';
  if(/\?\s*$/.test(String(texto).trim()))return 'pergunta';
  if(COLETIVO.test(t)||SAUDACAO.test(t)||PROVOCA.test(t))return 'pergunta';
  return 'solta';}

// ── prompt ───────────────────────────────────────────────────────────────────
// ── O TIPO DE CONVERSA (BOT_LLM.ESTILO, ajustável no painel /admin) ──
// O par id→inglês, no molde exato de PERSONA/PERICIA logo abaixo: o id é shared (o painel precisa dele
// para desenhar o `<select>`), a instrução é server-only.
// ⚠️ A chave `misto` é o padrão e é o pedido literal — frases curtas, ofensas, piada ou comentário curto.
// As outras existem para o dia em que a sala pedir um tom só; escolher UMA estreita a fala de propósito.
const ESTILO_PROMPT={
  misto:'Mix it up line to line: a very short reply, a jab at someone, a quick joke, or a short comment on the match.',
  curta:'Keep every line very short: a few words, like someone typing fast with one hand.',
  ofensa:'Trash talk. Mock whoever is beating you or whoever you just ate, by name.',
  piada:'Make a quick joke, preferably playing with the other player\'s name.',
  comentario:'Just comment on what is happening in the match right now, in a few words.',
  seco:'Keep it dry and matter of fact. Do not mock anyone.',
};
/**
 * O SYSTEM é MONTADO A CADA GERAÇÃO, não é mais uma const de módulo — porque duas coisas dentro dele
 * agora saem de `constants.js` e podem mudar em RUNTIME pelo painel (o teto de palavras e o tipo de
 * conversa), e uma string montada no import congelaria as duas no valor do boot.
 * ⚠️ E ditar o teto AQUI é o que faz o parâmetro funcionar: `sanitiza` RECUSA a linha grande em vez de
 * cortá-la, então baixar o teto sem contar ao modelo deixaria o bot mudo em vez de breve.
 * O "usually" é ~3/4 do teto duro de propósito: é essa folga que mantém a taxa de veto baixa.
 */
function montaSystem(){
  const W=Math.max(4,BOT_LLM.MAX_WORDS|0),usual=Math.max(3,Math.round(W*.75));
  // ⚠️ OS DOIS TETOS TÊM QUE SER DITADOS, e por muito tempo só o de PALAVRAS era. Subir `MAX_CHARS` no
  // painel não mudava nada no que o modelo escrevia — ele continuava instruído a caber em ~9 palavras —, e
  // a queixa que veio de fora foi literal: "aumentei para 140 e continuaram falando pouco". A peneira RECUSA
  // em vez de cortar, então um teto que só vive nela não alonga a fala: ele apenas decide o que morre.
  const C=Math.max(30,BOT_LLM.MAX_CHARS|0);
  return [
  'You are a player in a fast multiplayer .io game about planets that eat each other. You are NOT an assistant.',
  `Write ONE short chat line, like a real player typing mid-match: usually under ${usual} words, never more than ${W}, and at most ${C} characters.`,
  'Never write a full, well-formed sentence with punctuation: that is what gives a bot away. Write like a person in a hurry.',
  ESTILO_PROMPT[BOT_LLM.ESTILO]||ESTILO_PROMPT.misto,
  'Lowercase is fine, typos are fine.',
  // ⚠️ O PROMPT ACOMPANHA O NÍVEL DO CHAT, senão a liberação é meia: com `CHAT.FILTRO='livre'` a peneira
  // deixa o bot xingar pesado, mas o SYSTEM continuava PEDINDO comedimento — e o modelo obedece, então a
  // peneira nem chegava a ser exercida e o preenchimento ficava mais contido que as pessoas da sala.
  // O piso não muda em nível nenhum: slur e ataque à identidade são o que este processo não inventa.
  ...(CHAT.FILTRO==='livre'
    ? ['Be funny and cocky. Trash talk, mockery and swearing are all welcome — this is a rough game lobby.',
       'Hard limit: no slurs and nothing about anyone\'s race, gender or identity. Everything else is fair game — provoke about the GAME.']
    : ['Be funny and cocky. Trash talk and mockery are welcome, and mild swearing is fine.',
       'Hard limit: no sexual insults, no slurs, nothing about anyone\'s family, body or identity. Provoke about the GAME.']),
  // ── O NOME DO JOGADOR É MATÉRIA-PRIMA ──
  // Metade da graça de um .io está no nick que a pessoa escolheu, e o bot ignorava isso completamente.
  // O bloco [who is who] traz o que o SERVIDOR sabe de verdade (a caricatura que o jogador está vestindo,
  // o país, o nível); esta instrução libera o que só o MODELO sabe — que "pizzalover" é comida e que
  // "coringa" é um personagem. A LLM já tinha esse conhecimento; o que faltava era a permissão.
  'Player names are often references: a footballer, a singer, a politician, a meme, a food, a city, a movie.',
  'When a name obviously refers to something real, play with it — that is half the joke in this game.',
  'Never say anyone is a bot, an NPC, fake or a script: everyone here is a person.',
  'Never talk about politics, elections, parties, war or religion. Joke about the PERSON as a character, never about their opinions.',
  'LANGUAGE RULE, follow it strictly: when a message is addressed to you, reply in THAT message\'s language,',
  'even if the rest of the chat is in another one. Otherwise use the language of the recent chat.',
  'With no chat at all, use Brazilian Portuguese.',
  'If someone is talking to you, answer them directly, and use their name if they used yours. Otherwise, react to what the chat is ACTUALLY talking about right now, or to what just happened in the match — never to a topic nobody raised.',
  'React to what is happening to you in the match: if someone is chasing or shooting you, say it TO THEM, by name.',
  'Stay in character. You are typing, not narrating.',
  'Never explain yourself, never use quotes, never use emoji, never mention being an AI, never write more than one line.',
].join(' ');}
/** Estilo do bot em palavras que o modelo entende (persona = como joga, perícia = quão bem). */
const PERSONA={cacador:'aggressive hunter',fazendeiro:'cautious farmer',oportunista:'opportunist'};
const PERICIA={ruim:'clumsy and losing',medio:'average',bom:'good',fera:'dominating the match'};
/**
 * O que o bot está VIVENDO agora, em uma oração. Sai de `gp.brain`, que o `_think` já preenche todo tick
 * e que ninguém lia — custo zero. `wander` devolve string vazia de propósito: "andando por aí" não vale
 * o token que ocuparia.
 * @param {{modo?:string,alvo?:string|null,press?:number,zu?:number,open?:number}} e
 */
export function estadoLinha(e){
  if(!e||!e.modo)return '';
  switch(e.modo){
    case 'flee':return e.alvo
      ?`you are running away from ${e.alvo}`+((e.press||0)>1.2?' and he is right on top of you':'')
      :'you are running for your life';
    case 'hunt':return e.alvo?`you are chasing ${e.alvo}`:'you are hunting someone smaller';
    case 'zone':return (e.zu||0)>=.6?'you are caught outside the gas ring':'';
    case 'intercept':return 'a missile is coming at you';
    case 'food':return 'you are farming, minding your own business';
    case 'hold':return 'you are standing still waiting to merge';
    default:return '';}}
/**
 * Quem vem batendo nele, a partir de `gp.mem`. É a metade que falta para sair "me deixa em paz, evandro!":
 * o estado dá o verbo, isto dá o agente.
 * @param {{nome:string,k:string,n:number,recente:boolean}|null} a
 */
export function agressorLinha(a){
  if(!a||!a.nome)return '';
  if(a.n>=3)return `${a.nome} keeps shooting you, all match long`;
  switch(a.k){
    case 'tiro':return a.recente?`${a.nome} just shot you`:`${a.nome} has been shooting at you`;
    case 'mordida':return `${a.nome} just bit a piece off you`;
    case 'escudo':return `${a.nome} broke your shield`;
    case 'morte':return `${a.nome} killed you before`;
    default:return `${a.nome} is after you`;}}
/** Tamanho relativo em palavras. O número cru (`your size: 4820`) o modelo não sabia usar. */
export function rankLinha(rank,vivos){
  if(!rank||!vivos)return '';
  if(rank===1)return 'the biggest in the room';
  if(rank<=5)return 'near the top';
  if(rank<=Math.ceil(vivos/2))return 'mid-table';
  return 'small and losing';}
/**
 * A PARTIDA em volta dele: quantos restam, o quanto ele é menor que o líder, e quanto falta para o gás
 * fechar. Nada disto entrava no prompt, e a falta aparecia na fala: o bot comentava a própria vida numa
 * sala que, para ele, não tinha mais ninguém nem relógio. Tudo em palavras, nunca em número cru — "metade
 * do tamanho do líder" o modelo sabe usar; "massa 4820" ele repete como papagaio ou ignora.
 * @param {{vivos?:number,fracLider?:number,lider?:string|null,zonaS?:number,modo?:string}} c
 */
export function partidaLinha(c){
  const P=[];
  if(c.modo&&c.vivos>1)P.push(`${c.vivos} players left in this ${c.modo}`);
  if(c.lider&&c.fracLider>0){
    const f=c.fracLider;
    P.push(f<.1?`${c.lider} is a monster, you are a crumb next to him`
      :f<.35?`${c.lider} is way bigger than you`
      :f<.7?`${c.lider} is ahead of you but not by much`
      :`you are almost as big as ${c.lider}`);}
  if(c.zonaS>0&&c.zonaS<45)P.push(`the gas closes in ${c.zonaS} seconds`);
  return P.join('; ');}
/**
 * QUEM É QUEM. O prompt sabia o que o bot estava vivendo e não sabia quem era NINGUÉM — os nomes
 * entravam como etiquetas vazias, e o bot provocava "o Messi" sem fazer ideia de que ali havia um Messi.
 * A caricatura é o dado mais forte do prompt inteiro, e é FATO: o servidor decidiu a skin daquela vida a
 * partir do nick (shared/src/eggs.js), então "quem se chama messi está com a cara do Messi" é algo que
 * ele SABE, não algo que o modelo adivinha.
 * Em palavras e só quem tem o que dizer: quem não tem caricatura, nem país, nem nível alto não gasta um
 * caractere — o prompt tem teto (BOT_LLM.PROMPT_MAX_CHARS) e prompt gordo é prompt lento.
 * @param {{nome:string,egg?:string|null,pais?:string|null,nivel?:number}[]} gente @param {string} eu
 */
export function elencoLinha(gente,eu){
  const P=[];
  for(const g of gente||[]){
    const q=[];
    if(g.egg)q.push(`plays as ${g.egg}`);
    if(g.pais)q.push(`from ${paisEn(g.pais)}`);
    if((g.nivel||0)>=BOT_LLM.NIVEL_ALTO)q.push(`level ${g.nivel}`);
    if(q.length)P.push(`${g.nome===eu?'you':`"${g.nome}"`} ${q.join(', ')}`);}
  return P.join('; ');}
/**
 * O país em INGLÊS. `countryName` de shared/countries.js devolve pt-BR, e o prompt inteiro é inglês —
 * "from Brasil" no meio dele é a única linha que destoa, e o modelo responde pior a mistura.
 * ⚠️ `Intl.DisplayNames` LANÇA em código inválido, e `gp.country` de um humano vem do banco: o código
 * cru é a saída de emergência, nunca uma exceção subindo pelo caminho da fala.
 */
const REGIAO=(()=>{try{return new Intl.DisplayNames(['en'],{type:'region'});}catch{return null;}})();
export function paisEn(cc){
  const c=String(cc||'').toUpperCase();if(!/^[A-Z]{2}$/.test(c))return '';
  try{return (REGIAO&&REGIAO.of(c))||c;}catch{return c;}}
/**
 * O ASSUNTO que a sala está pedindo, por ordem de urgência: o relógio (o gás fechando), a fofoca (quem
 * acabou de morrer), o topo (alguém ficou enorme) e, na falta de tudo, a partida.
 * PURA de propósito, no molde de `aberta`/`rankLinha`: é o que impede a INICIATIVA de inventar assunto —
 * o bot só puxa conversa sobre o que está de fato acontecendo — e é testável sem subir sala nem rede.
 * @param {{zonaS?:number,feedFresco?:boolean,lider?:string|null,fracLider?:number,vivos?:number}} c
 */
export function escolheAssunto(c){
  const o=c||{};
  if(o.zonaS>0&&o.zonaS<30)return{assunto:'gas',quem:null};
  if(o.feedFresco)return{assunto:'feed',quem:null};
  if(o.lider&&o.fracLider>0&&o.fracLider<.35)return{assunto:'lider',quem:o.lider};
  if(o.vivos>1&&o.vivos<=6)return{assunto:'poucos',quem:null};
  return{assunto:'partida',quem:null};}
/** As últimas mortes da sala, em uma linha. É a fofoca: o que todo mundo acabou de ver acontecer. */
export function feedLinha(feed){
  const v=(feed||[]).filter(Boolean);
  return v.length?v.slice(-3).join(', '):'';}
/** O evento que acabou de acontecer com ESTE bot, em uma linha que o modelo entende. */
function evento(c){
  switch(c.kind){
    case 'kill':return c.quem?`you just ate player ${c.quem}`:'you just ate another player';
    case 'morte':return c.quem?`you were just killed by ${c.quem}`:'you just died';
    case 'zona':return 'the deadly gas ring is closing in on you';
    case 'poucos':return `only ${c.vivos} players are still alive`;
    case 'start':return 'the match just started';
    case 'equipe':return 'you are talking to your teammates';
    case 'mention':return c.quem?`${c.quem} is talking to you in the chat`:'someone is talking to you in the chat';
    case 'reply':return 'the chat is talking and you feel like answering';
    case 'cadeia':return c.quem?`${c.quem} answered you in the chat`:'someone answered you in the chat';
    case 'coro':return c.quem?`${c.quem} asked something to everyone`:'someone asked something to everyone';
    case 'tiro':return c.quem?`${c.quem} just hit you with a missile`:'a missile just hit you';
    case 'escudo':return c.quem?`${c.quem} just broke your shield`:'your shield just broke';
    case 'cacado':return c.quem?`${c.quem} is hunting you down right now`:'someone is hunting you down right now';
    case 'lider':return 'you just took the lead';
    // ⚠️ Sem um case PRÓPRIO isto cairia no `default` ('the match is going on') e a iniciativa viraria uma
    // linha genérica sobre nada — a mesma armadilha do `||BOT_CHAT.kill` de `_fraseFixa`. O que faz a
    // iniciativa funcionar é o "nobody is talking": é ele que dá licença ao modelo para ABRIR conversa em
    // vez de responder a alguém.
    case 'puxa':return c.assunto==='gas'?'nobody is talking and the gas ring is about to close on everyone'
      :c.assunto==='feed'?'nobody is talking, and you want to comment on what the room just saw happen'
      :c.assunto==='lider'?(c.quem?`nobody is talking. ${c.quem} is running away with this match and you want to say something about it`
                                  :'nobody is talking and you want to say something about who is winning')
      :c.assunto==='poucos'?'nobody is talking and there are almost no players left'
      :'the chat has been quiet for a while and you feel like starting a conversation about this match';
    default:return 'the match is going on';}}
/**
 * @param {{nome:string,persona?:string,pericia?:string,historia?:{quem:string,jeito:string,bordao:string}|null,
 *   rank?:number,vivos?:number,modo?:string,equipe?:boolean,kind:string,quem?:string,texto?:string,
 *   estado?:object,agressor?:object|null,assunto?:string|null,
 *   gente?:{nome:string,egg?:string|null,pais?:string|null,nivel?:number}[],
 *   historico?:{name:string,text:string}[]}} c
 *
 * Ordem do `user`, e por que ela é essa: quem ele é → o que está vivendo AGORA → quem está batendo nele →
 * o gatilho → a conversa → a linha dirigida a ele. O que está mais perto do fim pesa mais na resposta, e a
 * linha dirigida é justamente a que o modelo precisa não perder de vista.
 */
export function montaPrompt(c){
  const h=c.historia;
  const estilo=[PERSONA[c.persona||'']||null,PERICIA[c.pericia||'']||null].filter(Boolean).join(', ');
  // A HISTÓRIA (server-only) entra no lugar dos dois ids de estilo quando existe: "aggressive hunter,
  // dominating" descreve como o bot JOGA, e nunca deu personalidade nenhuma à fala.
  const quemSou=h?`${h.quem}. ${h.jeito}`:(estilo||'a player');
  const tam=rankLinha(c.rank,c.vivos);
  const cab=`[you are "${c.nome}", ${quemSou}`+(tam?`. you are ${tam}`:'')
    +(c.equipe?'. this chat is your team only':'')+']';
  // As duas linhas do "thinking". Quando o agressor É o mesmo de quem ele foge, funde tudo numa oração só:
  // duas frases dizendo quase a mesma coisa gastam token e diluem a mais forte do prompt inteiro.
  const est=estadoLinha(c.estado),agr=agressorLinha(c.agressor);
  const mesmo=c.estado&&c.agressor&&c.estado.modo==='flee'&&c.estado.alvo&&c.estado.alvo===c.agressor.nome;
  const agora=mesmo
    ?`you are running away from ${c.agressor.nome} and he ${c.agressor.n>=3?'keeps shooting you':'just hit you'}`
    :[est,agr].filter(Boolean).join('; ');
  const dirigida=c.kind==='mention'||c.kind==='reply'||c.kind==='coro'||c.kind==='cadeia';
  const nHist=dirigida?BOT_LLM.HIST_DIRIGIDA:BOT_LLM.HIST;
  // Cada linha do histórico é aparada: uma frase de 140 chars é legítima no chat, mas quatro delas são
  // 560 chars de contexto de baixo valor competindo com o TIMEOUT_MS. A mensagem DIRIGIDA (lá embaixo)
  // não é aparada — essa é a que o bot precisa responder.
  const corta=t=>{const x=String(t||'');return x.length>BOT_LLM.HIST_CHARS?x.slice(0,BOT_LLM.HIST_CHARS-1)+'…':x;};
  const hist=(c.historico||[]).slice(-nHist).map(l=>`${l.name}: ${corta(l.text)}`).join('\n');
  // A mensagem dirigida REPETIDA no fim, sozinha e com a ordem de idioma colada nela. Enterrada no meio do
  // histórico ela perdia: numa sala onde os bots vinham falando português, um "hey X, you are trash" era
  // respondido em português — o modelo seguia a maioria das linhas, não quem estava falando com ele.
  // A mensagem dirigida vem com o idioma NOMEADO quando dá para reconhecê-lo; quando não dá, fica a
  // instrução genérica, que é o que o modelo já fazia bem sozinho.
  const lang=c.texto?detectaIdioma(c.texto):detectaIdioma((c.historico||[]).slice(-3).map(l=>l.text).join(' '));
  const ordem=lang?`[write your line in ${lang}]`:'[answer in the SAME LANGUAGE as that message]';
  const alvo=dirigida&&c.texto
    ?`[${c.quem||'someone'} says to YOU: "${c.texto}"]\n${ordem}\n`
    :(lang?`${ordem}\n`:'');
  const SYSTEM=montaSystem();
  const sys=h?`${SYSTEM} You sometimes end your line with "${h.bordao}", but rarely.`:SYSTEM;
  // ORDEM: quem ele é → a PARTIDA em volta → o que está vivendo → o que a sala viu → o gatilho → a
  // conversa → a linha dirigida. O que está mais perto do fim pesa mais, e por isso a partida vem cedo
  // (é pano de fundo) e a linha dirigida fica por último (é o que ele tem que responder).
  const part=partidaLinha(c),ff=feedLinha(c.feed),quem=elencoLinha(c.gente,c.nome);
  // O elenco entra CEDO, logo depois de quem ele é: identidade é o pano de fundo mais estável do prompt,
  // e o que fica perto do FIM é o que o modelo tem que responder.
  const user=`${cab}\n`+(quem?`[who is who: ${quem}]\n`:'')
    +(part?`[the match: ${part}]\n`:'')
    +(agora?`[right now: ${agora}]\n`:'')
    +(ff?`[the room just saw: ${ff}]\n`:'')
    +`[what just happened: ${evento(c)}]\n`
    +(hist?`[recent chat]\n${hist}\n`:'[the chat is empty]\n')
    +alvo+'Your line:';
  return{system:sys,user};}

// ── fábrica ──────────────────────────────────────────────────────────────────
/**
 * @param {{llm:any,log?:any}} o
 * `gerar(ctx)` devolve a linha pronta ou `null` — e `null` é uma resposta legítima: quem chama volta ao
 * repertório fixo (ou fica calado, no caso da menção).
 */
export function createBotChat({llm,log=null,metrics=null}){
  return{
    ativo(){return !!(llm&&llm.ok());},
    citou,sanitiza,montaPrompt,baseNick,aberta,estadoLinha,agressorLinha,elencoLinha,escolheAssunto,
    async gerar(ctx){
      if(!llm||!llm.ok())return null;
      const {system,user}=montaPrompt(ctx);
      if(metrics)metrics.llm('ask');
      // ⚠️ O TERCEIRO TETO, o que ninguém vê: `num_predict`. Ele é dito em TOKENS e os outros dois em
      // palavras/caracteres, então subir `MAX_CHARS` no painel esbarrava numa cota de 48 tokens que não
      // acompanhava — a fala saía CORTADA no meio (`done_reason:'length'`), e cortada ela é recusada pela
      // peneira. Derivar é o que impede os dois números de se separarem na primeira mudança: ~0,7 token por
      // caractere em pt-BR, com o piso de sempre. É um TETO, não um alvo — o modelo para no `stop`, então
      // folga aqui não custa latência nenhuma.
      const numPredict=Math.max(BOT_LLM.NUM_PREDICT,Math.ceil(BOT_LLM.MAX_CHARS*.7));
      const cru=await llm.chat({system,user,numPredict});
      const txt=sanitiza(cru,ctx&&ctx.nome);
      if(!txt&&cru){if(metrics)metrics.llm('veto');
        if(log)log.debug(`fala descartada: ${JSON.stringify(String(cru).slice(0,120))}`);}
      return txt;},
  };}

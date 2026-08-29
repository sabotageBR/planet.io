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
import {BOT_LLM,CHAT} from '@planet/shared/constants.js';

// ── nomes ────────────────────────────────────────────────────────────────────
/** Reduz a comparável: sem acento, minúsculo, só letras e números (o resto vira espaço). */
export function normalizar(s){
  return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
/**
 * A RAIZ de um apelido. `botNick` monta os nicks em cinco formatos (`base`, `base42`, `base_137`, `BASE`,
 * `xXbaseXx`) — quem escreve no chat digita a raiz, não o enfeite: quem chama "Trovao_137" chama de
 * "trovao". Sem desmontar isso, metade das menções passaria batida.
 */
export function baseNick(nick){
  let n=normalizar(nick).replace(/\s+/g,'');
  const xx=n.match(/^xx(.+)xx$/);if(xx&&xx[1].length>=3)n=xx[1];   // xXbaseXx → xxbasexx depois de normalizar
  n=n.replace(/[0-9]+$/,'');                                     // base42 / base_137
  return n;}
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
const COMUNS=new Set(('que com para pra pro por uma uns seu sua meu nao sim vem vai vou tem ter foi era ele ela eles isso essa esse '
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
/**
 * A saída de um modelo não é uma linha de chat até provar que é. Corta no primeiro `\n` (ele adora listar),
 * tira aspas e asteriscos de "narração", derruba emoji (o repertório do jogo não usa) e recusa qualquer
 * coisa que se denuncie como assistente. Devolve `null` quando não sobrou uma frase utilizável.
 */
export function sanitiza(txt){
  let s=String(txt||'');
  s=s.replace(/<think>[\s\S]*?<\/think>/gi,'');            // cinto de segurança para o `think:false`
  s=s.split('\n')[0];
  s=s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu,'');   // emoji
  s=s.replace(/^[\s"'“”‘’*`\-–—>]+|[\s"'“”‘’*`]+$/g,'');
  s=s.replace(/\s+/g,' ').trim();
  if(!s)return null;
  if(SUSPEITO.test(s))return null;
  if(s.split(' ').length>BOT_LLM.MAX_WORDS)return null;    // parágrafo não é fala de partida: melhor calar
  if(s.length>Math.min(BOT_LLM.MAX_CHARS,CHAT.MAX_CHARS))return null;
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

// ── prompt ───────────────────────────────────────────────────────────────────
const SYSTEM=[
  'You are a player in a fast multiplayer .io game about planets that eat each other. You are NOT an assistant.',
  'Write ONE short chat line, like a real player typing mid-match: max 10 words, lowercase is fine, typos are fine.',
  'Be funny and cocky. Trash talk, mockery and swearing are allowed and welcome.',
  'LANGUAGE RULE, follow it strictly: when a message is addressed to you, reply in THAT message\'s language,',
  'even if the rest of the chat is in another one. Otherwise use the language of the recent chat.',
  'With no chat at all, use Brazilian Portuguese.',
  'If someone is talking to you, answer them directly.',
  'Never explain yourself, never use quotes, never use emoji, never mention being an AI, never write more than one line.',
].join(' ');
/** Estilo do bot em palavras que o modelo entende (persona = como joga, perícia = quão bem). */
const PERSONA={cacador:'aggressive hunter',fazendeiro:'cautious farmer',oportunista:'opportunist'};
const PERICIA={ruim:'clumsy and losing',medio:'average',bom:'good',fera:'dominating the match'};
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
    default:return 'the match is going on';}}
/** @param {{nome:string,persona?:string,pericia?:string,massa?:number,vivos?:number,modo?:string,equipe?:boolean,kind:string,quem?:string,texto?:string,historico?:{name:string,text:string}[]}} c */
export function montaPrompt(c){
  const estilo=[PERSONA[c.persona||'']||null,PERICIA[c.pericia||'']||null].filter(Boolean).join(', ');
  const cab=`[you are "${c.nome}", ${estilo||'a player'}, in a ${c.modo||'free-for-all'} match`
    +(c.massa?`. your size: ${c.massa}`:'')+(c.equipe?'. this chat is your team only':'')+']';
  const hist=(c.historico||[]).slice(-BOT_LLM.HIST).map(l=>`${l.name}: ${l.text}`).join('\n');
  // A mensagem dirigida REPETIDA no fim, sozinha e com a ordem de idioma colada nela. Enterrada no meio do
  // histórico ela perdia: numa sala onde os bots vinham falando português, um "hey X, you are trash" era
  // respondido em português — o modelo seguia a maioria das linhas, não quem estava falando com ele.
  // A mensagem dirigida vem com o idioma NOMEADO quando dá para reconhecê-lo; quando não dá, fica a
  // instrução genérica, que é o que o modelo já fazia bem sozinho.
  const lang=c.texto?detectaIdioma(c.texto):detectaIdioma((c.historico||[]).slice(-3).map(l=>l.text).join(' '));
  const ordem=lang?`[write your line in ${lang}]`:'[answer in the SAME LANGUAGE as that message]';
  const alvo=(c.kind==='mention'||c.kind==='reply')&&c.texto
    ?`[${c.quem||'someone'} says to YOU: "${c.texto}"]\n${ordem}\n`
    :(lang?`${ordem}\n`:'');
  return{system:SYSTEM,user:`${cab}\n[what just happened: ${evento(c)}]\n`
    +(hist?`[recent chat]\n${hist}\n`:'[the chat is empty]\n')
    +alvo+'Your line:'};}

// ── fábrica ──────────────────────────────────────────────────────────────────
/**
 * @param {{llm:any,log?:any}} o
 * `gerar(ctx)` devolve a linha pronta ou `null` — e `null` é uma resposta legítima: quem chama volta ao
 * repertório fixo (ou fica calado, no caso da menção).
 */
export function createBotChat({llm,log=null}){
  return{
    ativo(){return !!(llm&&llm.ok());},
    citou,sanitiza,montaPrompt,baseNick,
    async gerar(ctx){
      if(!llm||!llm.ok())return null;
      const {system,user}=montaPrompt(ctx);
      const cru=await llm.chat({system,user});
      const txt=sanitiza(cru);
      if(!txt&&cru&&log)log.debug(`fala descartada: ${JSON.stringify(String(cru).slice(0,120))}`);
      return txt;},
  };}

// ── PARÂMETROS ALTERÁVEIS EM RUNTIME (painel /admin) ─────────────────────────
// A LISTA BRANCA é o mecanismo inteiro: nada fora dela é gravável, nem por engano, nem por um `key` vindo
// do corpo de uma requisição. Isto não é um `eval` com persistência — é um conjunto fechado de números.
//
// COMO ESCREVER CUSTA ZERO: `physics/world.js` faz `const PW=POWERUP` e lê `PW.MAGNET_MAX_R` DENTRO do laço
// de 60 Hz. Isso aliasa o OBJETO, não o valor — e os objetos de `constants.js` não são congelados. Então
// escrever `POWERUP.MAGNET_MAX_R = novo` é visto por todos os leitores no tick seguinte, sem indireção,
// sem chamada de função e sem um import novo em `physics/`. A alternativa (um `getTunable()` dentro do
// laço) é a única versão com custo por tick real, e não compra nada.
//
// ⚠️ ESCOPO. `scope:'server'` é seguro porque só o servidor lê aquele número. `scope:'both'` significa que
// o CLIENTE também o lê — e o cliente tem a própria cópia deste módulo no bundle, então mudar de um lado só
// faria `predict.js` divergir e a peça começaria a dar elástico acima de `NET.SNAP_DIST`. Enquanto não
// houver um caminho para entregar o valor ao cliente (o precedente é o `days` de `Room.roundInfo`), a rota
// do painel RECUSA as chaves 'both' — em vez de fingir que funcionam.
//
// ⚠️ É POR PROCESSO, não por sala. Mudar o ímã muda para todas as salas do pod, inclusive uma no meio da
// rodada. Parametrizar por sala exigiria carregar um objeto de tunables por Room→Sim→World→rules, tocando
// toda assinatura da física e o predict — não vale por um punhado de números.
// @ts-check
import {POWERUP,MISSILE,PLAYER,STAR,ASTEROID,ZONE,BOT_LLM,BOT_TALK} from "./constants.js";

/** @typedef {{key:string,label:string,unit:string,scope:'server'|'both',type:'num'|'opt',grupo:string,
 *   min?:number,max?:number,step?:number,options?:{v:string,label:string}[],def:any,
 *   read:()=>any,write:(v:any)=>void}} Tunable */

// ── CATEGORIAS ───────────────────────────────────────────────────────────────
// A lista cresceu para além do que se lê de uma vez, e uma tabela corrida põe o teto do ímã ao lado do
// jeito de falar dos bots como se fossem a mesma decisão. O grupo é campo do DESCRITOR, e não uma lista
// paralela na UI: parâmetro novo cai numa seção existente sem que o painel saiba que ele nasceu.
// A ORDEM daqui é a ordem das seções na tela; um grupo sem nenhum parâmetro simplesmente não é desenhado.
export const GRUPOS=[
  ['powerups','Powerups'],
  ['armas','Armas'],
  ['perigos','Perigos do mapa'],
  ['zona','Zona (Battle Royale)'],
  ['jogador','Jogador'],
  ['bots','Fala dos bots'],
];

/** Um número inteiro guardado numa constante, com a unidade que o ADMIN entende (ver o do ímã). */
const num=(grupo,key,label,unit,scope,min,max,step,obj,campo,{para=v=>v,de=v=>v}={})=>({
  key,label,unit,scope,grupo,type:'num',min,max,step,def:de(obj[campo]),
  read:()=>de(obj[campo]),write(v){obj[campo]=para(v);}});

/**
 * Uma ESCOLHA entre opções fechadas — o primeiro tunable que não é número.
 * ⚠️ Ele não afrouxa nada: a lista branca continua sendo o mecanismo, e aqui há uma segunda lista branca
 * por dentro (as `options`), então o que chega do corpo da requisição só pode ser um dos ids declarados.
 * `min`/`max`/`step` ficam de fora de propósito: um `<select>` não tem faixa, e inventar uma faria o
 * painel desenhar um controle que mente.
 */
const opt=(grupo,key,label,scope,options,obj,campo)=>({
  key,label,unit:'',scope,grupo,type:'opt',options,def:obj[campo],
  read:()=>obj[campo],write(v){obj[campo]=String(v);}});

/** @type {Tunable[]} */
export const TUNABLES=[
  // ── POWERUPS ──
  // O caso pedido: o admin digita MASSA (100 000), a física guarda RAIO (316). `mass = r²` é a convenção
  // do jogo inteiro, e a massa é o número que o jogador lê no HUD — pedir raio aqui seria pedir tradução.
  // Mexer nele muda só QUEM pode usar o ímã: o ALCANCE é `min(r*5.5, MAGNET_RANGE_MAX)` e já satura nos
  // 900 px absolutos em qualquer valor razoável.
  num('powerups','POWERUP.MAGNET_MAX_R','Massa máxima para usar o ímã','massa','server',2500,1000000,500,POWERUP,'MAGNET_MAX_R',
    {para:m=>Math.sqrt(m),de:r=>Math.round(r*r)}),
  num('powerups','POWERUP.AUTODEF_MAX','Cargas de auto-defesa acumuláveis','cargas','server',1,9,1,POWERUP,'AUTODEF_MAX'),
  num('powerups','POWERUP.TICKS','Duração do ímã','ticks','server',60,3600,30,POWERUP,'TICKS'),
  num('powerups','POWERUP.FEAST_TICKS','Duração do banquete','ticks','server',60,3600,30,POWERUP,'FEAST_TICKS'),
  // ── ARMAS ──
  num('armas','MISSILE.MAX_AMMO','Munição máxima do míssil','mísseis','server',1,9,1,MISSILE,'MAX_AMMO'),
  num('armas','MISSILE.AMMO_OVER','Balas emprestadas pelo powerup +1','mísseis','server',0,3,1,MISSILE,'AMMO_OVER'),
  num('armas','MISSILE.SPAWN_CD_TICKS','Carência de tiro ao nascer','ticks','server',0,3600,60,MISSILE,'SPAWN_CD_TICKS'),
  num('armas','MISSILE.AIM_HOLD_TICKS','Duração da mira travada','ticks','server',0,900,30,MISSILE,'AIM_HOLD_TICKS'),
  // ── PERIGOS DO MAPA ──
  num('perigos','STAR.BURN','Massa que a estrela queima','fração','server',0,.9,.01,STAR,'BURN'),
  num('perigos','STAR.BURN_STUCK','Queimadura da estrela sem vaga de peça','fração','server',0,.95,.01,STAR,'BURN_STUCK'),
  num('perigos','ASTEROID.CHIP','Lasca do asteroide','fração','server',0,.5,.01,ASTEROID,'CHIP'),
  num('perigos','ASTEROID.CHIP_STUCK','Lasca do asteroide sem vaga de peça','fração','server',0,.6,.01,ASTEROID,'CHIP_STUCK'),
  // ── ZONA ──
  num('zona','ZONE.BURN','Queimadura do gás (base)','fração/s','server',.01,.5,.01,ZONE,'BURN'),
  num('zona','ZONE.BURN_K','Multiplicador do gás no círculo final','×','server',1,5,.1,ZONE,'BURN_K'),
  // ── JOGADOR ──
  num('jogador','PLAYER.DECAY','Decaimento de massa por segundo','fração/s','server',0,.02,.0005,PLAYER,'DECAY'),
  // 'both' fica declarado para o dia em que houver entrega ao cliente — e a rota recusa até lá, em vez de
  // gravar um número que só metade do jogo enxerga.
  num('jogador','PLAYER.MAX_R','Raio máximo de uma peça','px','both',100,2000,10,PLAYER,'MAX_R'),
  // ── FALA DOS BOTS ──
  // ⚠️ TAMANHO DA FALA. Os dois tetos não são só peneira: `montaSystem` os DITA ao modelo. Baixá-los aqui
  // encurta a linha gerada de verdade; sem isso a peneira apenas RECUSARIA o que veio grande e o bot
  // ficaria mudo (caindo no repertório fixo), que é o contrário do que se quer. Palavras e caracteres são
  // dois tetos porque nenhum sozinho basta: 12 palavras compridas passam de 85 chars, e 85 chars cabem
  // 20 palavrinhas — e é a linha COMPRIDA, em qualquer das duas medidas, que denuncia o bot.
  num('bots','BOT_LLM.MAX_WORDS','Tamanho da fala do bot (palavras)','palavras','server',4,20,1,BOT_LLM,'MAX_WORDS'),
  num('bots','BOT_LLM.MAX_CHARS','Tamanho da fala do bot (caracteres)','chars','server',30,140,5,BOT_LLM,'MAX_CHARS'),
  // O TIPO de conversa: entra como uma frase a mais no SYSTEM (ver ESTILO_PROMPT em rooms/botChat.js).
  opt('bots','BOT_LLM.ESTILO','Tipo de conversa','server',BOT_LLM.ESTILOS,BOT_LLM,'ESTILO'),
  num('bots','BOT_LLM.DIGITA_CPS','Velocidade de digitação dos bots','car/s','server',3,60,1,BOT_LLM,'DIGITA_CPS'),
  // ── QUÃO FALANTE É A SALA ──
  // "Conversam demais" e "conversam de menos" é julgamento que só se faz OLHANDO uma sala cheia de gente
  // real, e não se quer um deploy por clique. Estes quatro são os botões dessa régua, do mais grosso para
  // o mais fino: quantas réplicas uma conversa pode ter, com que frequência ela continua sem vocativo,
  // quantas gerações ela pode gastar e quanto tempo de silêncio faz um bot puxar assunto.
  num('bots','BOT_LLM.CADEIA_MAX','Réplicas máximas de uma conversa','elos','server',1,8,1,BOT_LLM,'CADEIA_MAX'),
  num('bots','BOT_LLM.CADEIA_SOLTA_P','Continuar a conversa sem citar ninguém','probab.','server',0,1,.05,BOT_LLM,'CADEIA_SOLTA_P'),
  num('bots','BOT_LLM.CONVERSA_MAX_GER','Teto de falas geradas por conversa','falas','server',1,20,1,BOT_LLM,'CONVERSA_MAX_GER'),
  num('bots','BOT_TALK.SILENCIO_TICKS','Silêncio até um bot puxar assunto','ticks','server',600,7200,60,BOT_TALK,'SILENCIO_TICKS'),
];
export const TUNABLE_BY_KEY=new Map(TUNABLES.map(t=>[t.key,t]));
/**
 * O que o painel desenha: a lista com o valor de agora, o padrão, a faixa (ou as opções) e o GRUPO.
 * Nada é hardcoded na UI — nem os rótulos, nem as seções, nem que controle desenhar.
 */
export const listTunables=()=>TUNABLES.map(t=>({key:t.key,label:t.label,unit:t.unit,scope:t.scope,
  type:t.type,grupo:t.grupo,min:t.min,max:t.max,step:t.step,options:t.options,def:t.def,value:t.read()}));
export const readTunable=key=>{const t=TUNABLE_BY_KEY.get(key);return t?t.read():null;};
/**
 * Aplica (validando faixa, ou a lista de opções). Devolve o valor efetivo; lança se a chave não existe
 * ou o valor não serve. ⚠️ `out_of_range` é o código dos DOIS casos de propósito: a rota do painel já o
 * traduz, e um id de opção fora da lista é literalmente um valor fora do domínio declarado.
 */
export function applyTunable(key,valor){
  const t=TUNABLE_BY_KEY.get(key);if(!t)throw new Error('unknown_key');
  if(t.type==='opt'){
    const v=String(valor);
    if(!t.options.some(o=>o.v===v))throw new Error('out_of_range');
    t.write(v);return t.read();}
  const v=Number(valor);
  if(!Number.isFinite(v)||v<t.min||v>t.max)throw new Error('out_of_range');
  t.write(v);return t.read();}
/** Volta ao valor de `constants.js` — capturado NO IMPORT, antes de qualquer mutação. */
export function resetTunable(key){
  const t=TUNABLE_BY_KEY.get(key);if(!t)throw new Error('unknown_key');
  t.write(t.def);return t.read();}

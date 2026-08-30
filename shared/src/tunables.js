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
import {POWERUP,MISSILE,PLAYER,STAR,ASTEROID,ZONE,BOT_LLM} from "./constants.js";

/** @typedef {{key:string,label:string,unit:string,scope:'server'|'both',min:number,max:number,step:number,def:number,read:()=>number,write:(v:number)=>void}} Tunable */

/** Um número inteiro guardado numa constante, com a unidade que o ADMIN entende (ver o do ímã). */
const num=(key,label,unit,scope,min,max,step,obj,campo,{para=v=>v,de=v=>v}={})=>({
  key,label,unit,scope,min,max,step,def:de(obj[campo]),
  read:()=>de(obj[campo]),write(v){obj[campo]=para(v);}});

/** @type {Tunable[]} */
export const TUNABLES=[
  // O caso pedido: o admin digita MASSA (100 000), a física guarda RAIO (316). `mass = r²` é a convenção
  // do jogo inteiro, e a massa é o número que o jogador lê no HUD — pedir raio aqui seria pedir tradução.
  // Mexer nele muda só QUEM pode usar o ímã: o ALCANCE é `min(r*5.5, MAGNET_RANGE_MAX)` e já satura nos
  // 900 px absolutos em qualquer valor razoável.
  num('POWERUP.MAGNET_MAX_R','Massa máxima para usar o ímã','massa','server',2500,1000000,500,POWERUP,'MAGNET_MAX_R',
    {para:m=>Math.sqrt(m),de:r=>Math.round(r*r)}),
  num('POWERUP.AUTODEF_MAX','Cargas de auto-defesa acumuláveis','cargas','server',1,9,1,POWERUP,'AUTODEF_MAX'),
  num('POWERUP.TICKS','Duração do ímã','ticks','server',60,3600,30,POWERUP,'TICKS'),
  num('POWERUP.FEAST_TICKS','Duração do banquete','ticks','server',60,3600,30,POWERUP,'FEAST_TICKS'),
  num('MISSILE.MAX_AMMO','Munição máxima do míssil','mísseis','server',1,9,1,MISSILE,'MAX_AMMO'),
  num('MISSILE.AMMO_OVER','Balas emprestadas pelo powerup +1','mísseis','server',0,3,1,MISSILE,'AMMO_OVER'),
  num('MISSILE.SPAWN_CD_TICKS','Carência de tiro ao nascer','ticks','server',0,3600,60,MISSILE,'SPAWN_CD_TICKS'),
  num('MISSILE.AIM_HOLD_TICKS','Duração da mira travada','ticks','server',0,900,30,MISSILE,'AIM_HOLD_TICKS'),
  num('STAR.BURN','Massa que a estrela queima','fração','server',0,.9,.01,STAR,'BURN'),
  num('STAR.BURN_STUCK','Queimadura da estrela sem vaga de peça','fração','server',0,.95,.01,STAR,'BURN_STUCK'),
  num('ASTEROID.CHIP','Lasca do asteroide','fração','server',0,.5,.01,ASTEROID,'CHIP'),
  num('ASTEROID.CHIP_STUCK','Lasca do asteroide sem vaga de peça','fração','server',0,.6,.01,ASTEROID,'CHIP_STUCK'),
  num('ZONE.BURN','Queimadura do gás (base)','fração/s','server',.01,.5,.01,ZONE,'BURN'),
  num('ZONE.BURN_K','Multiplicador do gás no círculo final','×','server',1,5,.1,ZONE,'BURN_K'),
  num('PLAYER.DECAY','Decaimento de massa por segundo','fração/s','server',0,.02,.0005,PLAYER,'DECAY'),
  num('BOT_LLM.DIGITA_CPS','Velocidade de digitação dos bots','car/s','server',3,60,1,BOT_LLM,'DIGITA_CPS'),
  // 'both' fica declarado para o dia em que houver entrega ao cliente — e a rota recusa até lá, em vez de
  // gravar um número que só metade do jogo enxerga.
  num('PLAYER.MAX_R','Raio máximo de uma peça','px','both',100,2000,10,PLAYER,'MAX_R'),
];
export const TUNABLE_BY_KEY=new Map(TUNABLES.map(t=>[t.key,t]));
/** O que o painel desenha: a lista com o valor de agora, o padrão e a faixa. Nada é hardcoded na UI. */
export const listTunables=()=>TUNABLES.map(t=>({key:t.key,label:t.label,unit:t.unit,scope:t.scope,
  min:t.min,max:t.max,step:t.step,def:t.def,value:t.read()}));
export const readTunable=key=>{const t=TUNABLE_BY_KEY.get(key);return t?t.read():null;};
/** Aplica (validando faixa). Devolve o valor efetivo; lança se a chave não existe ou está fora da faixa. */
export function applyTunable(key,valor){
  const t=TUNABLE_BY_KEY.get(key);if(!t)throw new Error('unknown_key');
  const v=Number(valor);
  if(!Number.isFinite(v)||v<t.min||v>t.max)throw new Error('out_of_range');
  t.write(v);return t.read();}
/** Volta ao valor de `constants.js` — capturado NO IMPORT, antes de qualquer mutação. */
export function resetTunable(key){
  const t=TUNABLE_BY_KEY.get(key);if(!t)throw new Error('unknown_key');
  t.write(t.def);return t.read();}

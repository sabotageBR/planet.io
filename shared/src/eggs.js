// ── EASTER EGGS: o NICK escolhe a skin ───────────────────────────────────────
// Quem entra como "Bruxo" joga com a caricatura do Ronaldinho. É uma tabela de DADOS: acrescentar um
// nome é uma linha aqui + um `case` em client/src/theme/patterns.js, e tirar um é apagar a linha.
//
// O egg NUNCA escreve em `users.equipped_skin_id` — ele só substitui o `skinId` daquela VIDA
// (decidido em server/src/persist/hooks.js e em wsServer.unsaved). Trocar o nick de volta devolve a
// skin comprada no próximo respawn, e `matches.skin_id` grava a skin realmente usada.
//
// As caricaturas são DESENHADAS (canvas, como as outras 75 skins) — nada de foto de terceiros.
// @ts-check
import {baseNick} from './util.js';

export const EGGS=[
  {skinId:84,nome:'Trump',      roots:['trump','donaldtrump','trumpzao','thedonald']},
  {skinId:85,nome:'Bruxo',      roots:['bruxo','obruxo','ronaldinho','ronaldinhogaucho','ronaldinhoo']},
  {skinId:86,nome:'Lula',       roots:['lula','luladasilva','lulinha','lulao']},
  {skinId:87,nome:'Bolsonaro',  roots:['bolsonaro','jairbolsonaro','bolsonarinho']},
  {skinId:88,nome:'Putin',      roots:['putin','vladimirputin']},
  {skinId:89,nome:'Milei',      roots:['milei','javiermilei','elpeluca']},
  {skinId:90,nome:'Macron',     roots:['macron','emmanuelmacron']},
  {skinId:91,nome:'Xi Jinping', roots:['xijinping','jinping','xidada']},
  {skinId:92,nome:'Modi',       roots:['modi','narendramodi']},
  {skinId:93,nome:'Zelensky',   roots:['zelensky','zelenskyy','zelenski','zelenskyi']},
];
// Fora da tabela de propósito, porque são palavra comum ou apelido de qualquer um em pt-BR — casariam
// com gente que não pediu nada: `mito`, `dinho`, `namo`, `putinha`, `gaucho`.
export const EGG_BY_SKIN=new Map(EGGS.map(e=>[e.skinId,e]));
export const EGG_SKIN_IDS=EGGS.map(e=>e.skinId);
const MIN_ROOT=4;   // raiz curta demais casaria com meio mundo ("lula" já é o piso)

/**
 * O nick vira um id de skin, ou null. Casamento EXATO da raiz, e só isso.
 *
 * `baseNick` já faz o trabalho pesado — "xXbruxoXx", "Bruxo_137", "BRUXO", "Donald Trump" e
 * "trump2024" caem todos na mesma raiz, porque ele desmonta o enfeite, tira acento e corta os dígitos
 * do fim. O que sobraria para um passe de prefixo/sufixo seriam os apelidos ("lulinha", "trumpzao") —
 * e esses estão na TABELA, onde dá para ler quais são. A tentação de casar por prefixo custou caro no
 * teste: "modinha" virava Modi e "trumpete" virava Trump. Num easter egg o falso positivo é o pecado
 * grave — vestir o jogador de presidente sem que ele tenha pedido —, então recall se ganha
 * acrescentando uma linha aqui, nunca afrouxando a regra.
 * @param {string} nick @returns {number|null}
 */
export function eggSkinFor(nick){
  const k=baseNick(nick);
  if(k.length<MIN_ROOT)return null;
  for(const e of EGGS)if(e.roots.includes(k))return e.skinId;
  return null;}

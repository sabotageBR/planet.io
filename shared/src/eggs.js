// ── EASTER EGGS: o NICK escolhe a skin ───────────────────────────────────────
// Quem entra como "Bruxo" joga com a caricatura do Ronaldinho. É uma tabela de DADOS: acrescentar um
// nome é uma linha aqui + um `case` em client/src/theme/patterns.js, e tirar um é apagar a linha.
//
// O egg NUNCA escreve em `users.equipped_skin_id` — ele só substitui o `skinId` daquela VIDA
// (decidido em server/src/persist/hooks.js e em wsServer.unsaved). Trocar o nick de volta devolve a
// skin comprada no próximo respawn, e `matches.skin_id` grava a skin realmente usada.
//
// As caricaturas são ILUSTRAÇÕES (client/public/faces/*.webp, 256², ~15 KB cada), carregadas por
// `client/src/theme/faces.js` no mesmo molde da foto do jogador — nada de fotografia de ninguém.
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
  // ── esporte e palco ──
  // A regra continua sendo casamento EXATO da raiz. `pele` sem acento é palavra comum em português, mas
  // `baseNick` compara a raiz INTEIRA: "pele" como nick é quem está pedindo o egg, e "peleja"/"pelezinho"
  // não casam. Já `rei`, `gol`, `luva`, `craque` e `rainha` ficaram DE FORA pelo motivo de sempre — são
  // apelido de qualquer um, e vestir o jogador de alguém que ele não pediu é o pecado grave desta tabela.
  {skinId:94,nome:'Pelé',       roots:['pele','edson','edsonarantes','reipele']},
  {skinId:95,nome:'Maradona',   roots:['maradona','d10s','diegomaradona','elpibe']},
  {skinId:96,nome:'CR7',        roots:['cristianoronaldo','cristiano','siuuu']},   // 'cr7' e 'siu' não cabem: baseNick corta o dígito final e MIN_ROOT recusa raiz de 2-3 letras
  {skinId:97,nome:'Haaland',    roots:['haaland','erlinghaaland','erling']},
  {skinId:98,nome:'Messi',      roots:['messi','lionelmessi','leomessi','lamessi']},
  {skinId:99,nome:'LeBron',     roots:['lebron','lebronjames','kingjames']},
  {skinId:100,nome:'Michael Jackson',roots:['michaeljackson','mjackson','moonwalk','thriller']},
  {skinId:101,nome:'Madonna',   roots:['madonna','ladymadonna']},
  {skinId:102,nome:'Fenômeno',  roots:['fenomeno','ronaldofenomeno','ronaldonazario']},
  {skinId:103,nome:'Luva de Pedreiro',roots:['luvadepedreiro','luvadepedreir','receba','iranferreira']},
  {skinId:104,nome:'Neymar',    roots:['neymar','neymarjr']},   // 'ney'/'njr' não cabem em MIN_ROOT
  // ── música, corrida, história ──
  {skinId:105,nome:'Snoop Dogg',roots:['snoop','snoopdogg','snoopdog']},
  {skinId:106,nome:'Eminem',    roots:['eminem','slimshady','marshall']},
  {skinId:107,nome:'2Pac',      roots:['2pac','tupac','makaveli']},
  {skinId:108,nome:'Jim Morrison',roots:['jimmorrison','morrison','thedoors']},
  {skinId:109,nome:'Jordan',    roots:['jordan','michaeljordan','airjordan']},   // 'mj23' vira 'mj' (baseNick corta o dígito)
  {skinId:110,nome:'Bieber',    roots:['bieber','justinbieber','belieber']},
  {skinId:111,nome:'Lincoln',   roots:['lincoln','abrahamlincoln','abelincoln']},
  {skinId:112,nome:'Elon Musk', roots:['elon','elonmusk','musk']},
  {skinId:113,nome:'Zuckerberg',roots:['zuckerberg','zuck','markzuckerberg']},
  {skinId:114,nome:'Senna',     roots:['senna','ayrton','ayrtonsenna']},
  {skinId:115,nome:'Schumacher',roots:['schumacher','schumi','michaelschumacher']},
  {skinId:116,nome:'Hamilton',  roots:['hamilton','lewishamilton','lewis']},
  {skinId:117,nome:'Churchill', roots:['churchill','winstonchurchill','winston']},
  {skinId:118,nome:'Einstein',  roots:['einstein','alberteinstein']},
];
// Fora da tabela de propósito, porque são palavra comum ou apelido de qualquer um em pt-BR — casariam
// com gente que não pediu nada: `mito`, `dinho`, `namo`, `putinha`, `gaucho`, `rei`, `gol`, `luva`,
// `rainha`, `craque`, `lenda`, `rap`, `piloto`, `genio`.
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

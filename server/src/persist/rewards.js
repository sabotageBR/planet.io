// ── Recompensas (puro): moedas da partida, conquistas novas, skins desbloqueadas ──
// @ts-check
import {SCORE_COINS,PLACE_COINS,MODE} from '@planet/shared/constants.js';
import {unlockedAchievements,ACHIEVEMENT_BY_KEY} from '@planet/shared/achievements.js';
import {SKINS} from '@planet/shared/skins.js';
import {matchXp,isDeath} from '@planet/shared/levels.js';
export const ACHIEVEMENT_COINS=100;
// XP e MORTE reexportados daqui para que `finishMatch` tenha uma porta só de "o que esta partida rendeu".
// A fórmula e a política moram em shared/src/levels.js — o SQL das views repete a lista de causas, e um
// teste cobra que as duas batam.
export {matchXp};
export const matchDeaths=m=>isDeath(m&&m.cause)?1:0;
/**
 * Moedas da partida: a fórmula de sempre (cap 500) mais, SÓ no Battle Royale, o bônus de COLOCAÇÃO — lá o
 * que vale é onde você parou, não a massa que juntou, e sem o bônus terminar em 2º de 50 pagaria o mesmo
 * que terminar em 49º.
 */
export const matchCoins=m=>SCORE_COINS(m.score,m.kills,m.botKills,m.durationS)+(m.mode===MODE.BR?PLACE_COINS(m.placement,m.players):0);
/** moedas de uma conquista (catálogo; default 100) */
export const achievementCoins=key=>{const a=ACHIEVEMENT_BY_KEY.get(key);return a&&a.coins?a.coins:ACHIEVEMENT_COINS;};
/**
 * conquistas novas dado o resumo da partida, user_stats já atualizado e as já possuídas
 * @param {{durationS:number,maxMass:number,bestStreak:number,top1Ticks:number,quadrants:number}} m
 * @param {{kills:number,bot_kills?:number,botKills?:number,splits:number,ejects:number,games:number}} stats
 * @param {Iterable<string>} owned
 */
export function newAchievements(m,stats,owned){
  const have=new Set(owned);const s={kills:stats.kills,botKills:stats.botKills??stats.bot_kills??0,splits:stats.splits,ejects:stats.ejects,games:stats.games};
  return unlockedAchievements(m,s).filter(k=>!have.has(k));
}
/** skins "earned" cujas unlockKey estão nas chaves */
export const skinsForAchievements=keys=>{const set=new Set(keys);return SKINS.filter(s=>s.unlockKey&&set.has(s.unlockKey)).map(s=>s.id);};
export const achievementTitle=key=>{const a=ACHIEVEMENT_BY_KEY.get(key);return a?a.title:key;};

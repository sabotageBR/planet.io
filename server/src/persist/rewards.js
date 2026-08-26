// ── Recompensas (puro): moedas da partida, conquistas novas, skins desbloqueadas ──
// @ts-check
import {SCORE_COINS} from '@planet/shared/constants.js';
import {unlockedAchievements,ACHIEVEMENT_BY_KEY} from '@planet/shared/achievements.js';
import {SKINS} from '@planet/shared/skins.js';
export const ACHIEVEMENT_COINS=100;
/** moedas da partida (cap 500) */
export const matchCoins=m=>SCORE_COINS(m.score,m.kills,m.botKills,m.durationS);
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

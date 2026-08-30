// ── REPO matches / user_stats ──────────────────────────────────────────────────
// @ts-check
import {levelFromXp,levelProgress,kdOf} from '@warspace/shared/levels.js';
const STATS_ZERO={games:0,kills:0,botKills:0,splits:0,ejects:0,foodEaten:0,totalScore:0,bestScore:0,bestMass:0,playTimeS:0,bestStreak:0,lastMatchAt:null,
  deaths:0,kd:0,xp:0,level:1,levelInto:0,levelNeed:1,levelPct:0,brWins:0,brTop10:0,brTeamWins:0};
/**
 * O que esta partida rendeu às três famílias de Battle Royale. O piso `players>=10` é o MESMO de
 * shared/achievements.js e da migração 0007 — vencer com 3 na sala não é vencer com 50, e as três
 * cópias do número existem porque três camadas precisam concordar sem se chamarem. MODE.BR = 1.
 */
export const brCounters=m=>{
  const ok=(m.mode|0)===1&&(m.placement|0)>0&&(m.players|0)>=10,p=m.placement|0;
  return{wins:ok&&p===1?1:0, top10:ok&&p<=10?1:0, teamWins:ok&&p===1&&(m.teamSize||1)>1?1:0};
};
export const statsToPublic=s=>{
  if(!s)return{...STATS_ZERO};
  // O NÍVEL não é guardado: é derivado do XP por `levelFromXp`, e a curva mora num lugar só
  // (shared/src/levels.js). Guardá-lo criaria uma segunda verdade que envelhece na primeira mudança de curva.
  const xp=Number(s.xp||0),p=levelProgress(xp),kills=s.kills|0,deaths=s.deaths|0;
  return{games:s.games,kills,botKills:s.bot_kills,splits:s.splits,ejects:s.ejects,foodEaten:s.food_eaten,
    totalScore:Number(s.total_score),bestScore:s.best_score,bestMass:s.best_mass,playTimeS:s.play_time_s,
    bestStreak:s.best_streak,lastMatchAt:s.last_match_at,
    brWins:s.br_wins|0,brTop10:s.br_top10|0,brTeamWins:s.br_team_wins|0,
    deaths,kd:Math.round(kdOf(kills,deaths)*100)/100,
    xp,level:p.level,levelInto:p.into,levelNeed:p.need,levelPct:Math.round(p.pct*1000)/1000};};
export function createMatches(db){
  /** idempotente por session_id; devolve {id,inserted} */
  async function insert(c,m){
    const r=await c.query(`INSERT INTO matches(session_id,user_id,room_code,shard,started_at,ended_at,duration_s,score,max_mass,kills,bot_kills,splits,ejects,food_eaten,best_streak,top1_ticks,cause,killed_by_user_id,coins_earned,skin_id,mode,team_size,team,placement,players,xp)
      VALUES($1,$2,$3,$4,$5,now(),$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,0,$18,$19,$20,$21,$22,$23,$24) ON CONFLICT (session_id) DO NOTHING RETURNING id`,
      [m.sessionId,m.userId,m.roomCode||null,m.shard||0,new Date(m.startedAt),m.durationS,m.score,m.maxMass,m.kills,m.botKills,m.splits,m.ejects,m.food,m.bestStreak,m.top1Ticks,m.cause,m.killedByUserId||null,m.skinId||0,
       m.mode|0,m.teamSize||1,m.team==null?null:m.team|0,m.placement?m.placement|0:null,m.players?m.players|0:null,m.xp|0]);
    if(r.rows[0])return{id:Number(r.rows[0].id),inserted:true};
    const old=await c.query(`SELECT id,coins_earned FROM matches WHERE session_id=$1`,[m.sessionId]);
    return{id:Number(old.rows[0].id),inserted:false,coinsEarned:old.rows[0].coins_earned};
  }
  const setCoins=(c,id,coins)=>c.query(`UPDATE matches SET coins_earned=$2 WHERE id=$1`,[id,coins]);
  /** acumula user_stats na mesma transação; devolve a linha atualizada */
  // ⚠️ A lista de parâmetros já nascia fora de ordem ($11 é o best_score); os novos entram no fim, e o
  // mapeamento posicional continua sendo a única coisa a conferir ao mexer aqui.
  const upsertStats=(c,m)=>{const br=brCounters(m);
    return c.query(`INSERT INTO user_stats(user_id,games,kills,bot_kills,splits,ejects,food_eaten,total_score,best_score,best_mass,play_time_s,best_streak,last_match_at,xp,deaths,br_wins,br_top10,br_team_wins)
      VALUES($1,1,$2,$3,$4,$5,$6,$7::bigint,$11::int,$8,$9,$10,now(),$12::bigint,$13::int,$14::int,$15::int,$16::int)
      ON CONFLICT (user_id) DO UPDATE SET games=user_stats.games+1,kills=user_stats.kills+EXCLUDED.kills,bot_kills=user_stats.bot_kills+EXCLUDED.bot_kills,
        splits=user_stats.splits+EXCLUDED.splits,ejects=user_stats.ejects+EXCLUDED.ejects,food_eaten=user_stats.food_eaten+EXCLUDED.food_eaten,
        total_score=user_stats.total_score+EXCLUDED.total_score,best_score=greatest(user_stats.best_score,EXCLUDED.best_score),
        best_mass=greatest(user_stats.best_mass,EXCLUDED.best_mass),play_time_s=user_stats.play_time_s+EXCLUDED.play_time_s,
        best_streak=greatest(user_stats.best_streak,EXCLUDED.best_streak),last_match_at=now(),
        xp=user_stats.xp+EXCLUDED.xp,deaths=user_stats.deaths+EXCLUDED.deaths,
        br_wins=user_stats.br_wins+EXCLUDED.br_wins,br_top10=user_stats.br_top10+EXCLUDED.br_top10,
        br_team_wins=user_stats.br_team_wins+EXCLUDED.br_team_wins RETURNING *`,
    [m.userId,m.kills,m.botKills,m.splits,m.ejects,m.food,m.score,m.maxMass,m.durationS,m.bestStreak,m.score,m.xp|0,m.deaths|0,
     br.wins,br.top10,br.teamWins]).then(r=>r.rows[0]);};
  const statsFor=(userId,c=db)=>c.query(`SELECT * FROM user_stats WHERE user_id=$1`,[userId]).then(r=>r.rows[0]||null);
  /** histórico paginado por id decrescente */
  const history=(userId,{limit=20,before=null}={})=>db.query(`SELECT m.id,m.ended_at,m.score,m.max_mass,m.kills,m.bot_kills,m.duration_s,m.cause,m.coins_earned,m.xp,m.room_code,m.mode,m.placement,m.players,k.nick AS by
      FROM matches m LEFT JOIN users k ON k.id=m.killed_by_user_id WHERE m.user_id=$1 AND ($2::bigint IS NULL OR m.id<$2) ORDER BY m.id DESC LIMIT $3`,[userId,before,limit])
    .then(r=>r.rows.map(x=>({id:Number(x.id),endedAt:x.ended_at,score:x.score,maxMass:x.max_mass,kills:x.kills,botKills:x.bot_kills,durationS:x.duration_s,cause:x.cause,coinsEarned:x.coins_earned,xp:x.xp||0,roomCode:x.room_code,mode:x.mode,placement:x.placement,players:x.players,by:x.by})));
  return{insert,setCoins,upsertStats,statsFor,history};
}

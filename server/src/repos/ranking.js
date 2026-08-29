// ── REPO ranking (all → user_stats; week/day → views) ──────────────────────────
// ⚠️ Este é o ÚNICO lugar do servidor que interpola SQL. `PERIODS` e `BY` são whitelists literais e têm
// que continuar sendo: nada vindo de `ctx.query` pode chegar à string, nunca.
// @ts-check
import {KD_MIN_KILLS,KD_MIN_GAMES} from '@planet/shared/levels.js';

export const PERIODS={all:'user_stats',week:'v_ranking_week',day:'v_ranking_day'};
/**
 * Descritor por métrica. `col` é coluna direta; `expr` é expressão (o K/D), e é assim porque materializar
 * um K/D numa coluna criaria um número que MENTE assim que kills ou deaths mudarem por outro caminho.
 * `gate` é quem tem direito de aparecer naquele ranking.
 */
export const BY={
  score:{col:'best_score'}, mass:{col:'best_mass'}, kills:{col:'kills'},
  total:{col:'total_score'}, food:{col:'food_eaten'}, xp:{col:'xp'},
  // GREATEST(deaths,1) resolve a divisão por zero E dá o número que os jogos mostram (5 abates / 0 mortes
  // = "5.00"). O piso de qualificação é o que impede o topo de ser sempre de quem fez 1 abate no primeiro
  // dia e não morreu — sem ele, o ranking de K/D é lixo desde a primeira hora.
  kd:{expr:a=>`(${a}.kills::numeric/GREATEST(${a}.deaths,1))`,
      gate:a=>`${a}.kills>=${KD_MIN_KILLS} AND ${a}.games>=${KD_MIN_GAMES}`},
};
const val =(by,a)=>BY[by].col?`${a}.${BY[by].col}`:BY[by].expr(a);
const gate=(by,a)=>BY[by].gate?BY[by].gate(a):`${val(by,a)}>0`;

export function createRanking(db){
  /**
   * A linha INTEIRA, não só a métrica ordenada: a tela mostra nível, partículas, abates e K/D ao mesmo
   * tempo, e uma segunda consulta por coluna seria N+1 por tela.
   * O NÍVEL é sempre vitalício (vem de user_stats.xp) mesmo quando o período é semana ou dia — "nível da
   * semana" não existe.
   */
  async function top({period='all',by='score',limit=50,country=null}={}){
    const src=PERIODS[period];if(!src||!BY[by])throw new Error('ranking: período/critério inválido');
    const st=src==='user_stats'?'s':'st';
    const join=src==='user_stats'?'':'LEFT JOIN user_stats st ON st.user_id=s.user_id';
    const r=await db.query(
      `SELECT s.user_id,u.nick,u.kind,u.country,u.avatar_hash,
              COALESCE(${st}.xp,0) AS xp,COALESCE(${st}.kills,0) AS kills,COALESCE(${st}.deaths,0) AS deaths,
              COALESCE(${st}.food_eaten,0) AS food_eaten,COALESCE(${st}.games,0) AS games,
              ${val(by,'s')} AS value
         FROM ${src} s JOIN users u ON u.id=s.user_id ${join}
        WHERE ${gate(by,'s')} AND ($2::char(2) IS NULL OR u.country=$2)
        ORDER BY ${val(by,'s')} DESC,s.user_id ASC LIMIT $1`,[limit,country||null]);
    return r.rows.map((x,i)=>linha(x,i+1));
  }
  /** Posição do usuário (1 + quantos têm valor maior) ou null se não pontuou / não se qualificou. */
  async function rankOf({period='all',by='score',userId,country=null}){
    const src=PERIODS[period];if(!src||!BY[by])throw new Error('ranking: período/critério inválido');
    const r=await db.query(
      `SELECT ${val(by,'s')} AS value,
              (SELECT count(*) FROM ${src} o JOIN users uo ON uo.id=o.user_id
                WHERE ${val(by,'o')}>${val(by,'s')} AND ${gate(by,'o')}
                  AND ($2::char(2) IS NULL OR uo.country=$2))::int+1 AS rank
         FROM ${src} s WHERE s.user_id=$1 AND ${gate(by,'s')}`,[userId,country||null]);
    return r.rows[0]?{rank:r.rows[0].rank,value:Number(r.rows[0].value)}:null;
  }
  return{top,rankOf};
}
const linha=(x,rank)=>({rank,userId:Number(x.user_id),nick:x.nick,registered:x.kind==='registered',
  country:x.country||null,avatar:x.avatar_hash||null,
  value:Number(x.value),xp:Number(x.xp||0),kills:x.kills|0,deaths:x.deaths|0,
  foodEaten:x.food_eaten|0,games:x.games|0});

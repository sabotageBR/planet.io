// ── XP, NÍVEL e K/D (avaliados no servidor no fim da partida; molde: achievements.js) ──
// Módulo PURO: sem I/O, chamado dentro da transação de `finishMatch` e importado pelo cliente para
// desenhar a barra de progresso. A curva e a política de "o que conta como morte" moram AQUI e em
// lugar nenhum mais — o SQL das views duplica a lista de causas e um teste cobra que as duas batam.
// @ts-check
export const XP={BASE:10,PER_MIN:6,PER_SCORE:1/400,PER_KILL:12,PER_BOT_KILL:4,PER_FOOD:.02,
                 TOP1_PER_MIN:10,WIN:150,TOP3:60,TOP10:25,CAP:1200};
export const LEVEL={K:85,E:2.12,MAX:60};
// Ancoragem dos números: uma vida mediana no Livre (4 min, 4.000 pts, 1 abate, 2 bots, 250 partículas)
// dá ~70 XP; uma vida boa (12 min, 25k, 5 abates, 6 bots, 900 partículas, 3 min em 1º) dá ~276; um
// campeão de rodada de 30 min bate ~980, abaixo do teto. Isso é ≈1.000 XP por hora para o mediano.
// Com K=85 e E=2,12: nível 2 na PRIMEIRA vida (recompensa imediata), 10 em ~9 h (é onde a primeira
// lendária destrava), 30 em ~109 h e 50 em ~330 h — um número que quase ninguém tem, que é o ponto
// de existir um nível. CAP existe porque uma rodada inteira em 1º não pode valer uma semana.

/** XP acumulado necessário para ESTAR no nível L (L=1 → 0). */
export const xpForLevel=L=>L<=1?0:Math.round(LEVEL.K*Math.pow(L-1,LEVEL.E));
/**
 * Inverso EXATO de `xpForLevel`. As duas correções de ±1 pagam o arredondamento de `xpForLevel`:
 * sem elas, `levelFromXp(xpForLevel(L))` erra por um em vários níveis, e o jogador vê a barra cheia
 * sem subir de nível.
 */
export function levelFromXp(xp){
  xp=Math.max(0,Math.floor(Number(xp)||0));
  let L=1+Math.floor(Math.pow(xp/LEVEL.K,1/LEVEL.E));
  if(!(L>=1))L=1;if(L>LEVEL.MAX)L=LEVEL.MAX;
  while(L>1&&xpForLevel(L)>xp)L--;
  while(L<LEVEL.MAX&&xpForLevel(L+1)<=xp)L++;
  return L;}
/** {level,xp,into,need,pct} — o que a barra de progresso do perfil desenha. */
export function levelProgress(xp){
  const level=levelFromXp(xp),a=xpForLevel(level),b=xpForLevel(level+1);
  const total=Math.max(0,Math.floor(Number(xp)||0));
  return level>=LEVEL.MAX?{level,xp:total,into:1,need:1,pct:1}
    :{level,xp:total,into:total-a,need:Math.max(1,b-a),pct:(total-a)/Math.max(1,b-a)};}

/**
 * Morte de VERDADE. Sair da sala, o servidor cair ou a rodada acabar não são morte — e essa é uma
 * decisão de política, não de física, então mora numa lista só. O SQL das views de ranking repete a
 * lista, e `shared/test/levels.test.js` cobra que ela cubra todo `cause` do CHECK de `matches`.
 */
export const DEATH_CAUSES=Object.freeze(['eaten','blackhole','zone','eliminated']);
export const isDeath=c=>DEATH_CAUSES.includes(c);
/** K/D como os jogos mostram: 5 abates e 0 mortes é "5.00", não divisão por zero. */
export const kdOf=(kills,deaths)=>{const k=Math.max(0,kills|0),d=Math.max(0,deaths|0);return d>0?k/d:k;};
/** Piso de qualificação do ranking de K/D: sem ele o topo é sempre quem fez 1 abate e não morreu. */
export const KD_MIN_KILLS=10,KD_MIN_GAMES=5;

/**
 * XP de UMA partida. `m` é o resumo de `MatchSession.end()` — o MESMO objeto que `unlockedAchievements`
 * e `matchCoins` recebem.
 * @param {{durationS:number,score:number,kills:number,botKills:number,food:number,top1Ticks:number,
 *          mode?:number,cause?:string,placement?:number,players?:number}} m
 */
export function matchXp(m){
  if(!m)return 0;
  // A colocação só vale onde ela SIGNIFICA alguma coisa. No Livre, `Sim._died` manda
  // `placement: players - elim + 1` mesmo fora do último-vivo: é lixo, e sem esta guarda daria bônus
  // de campeão para quem morreu cedo. Mesmo cuidado que `matchCoins` já toma com `mode===MODE.BR`.
  const placeOk=(m.placement|0)>0&&(m.players|0)>=4&&(m.mode===1||m.cause==='round'||m.cause==='survived');
  const p=m.placement|0;
  const place=!placeOk?0:p===1?XP.WIN:p<=3?XP.TOP3:p<=10?XP.TOP10:0;
  const v=XP.BASE+XP.PER_MIN*((m.durationS||0)/60)+XP.PER_SCORE*(m.score||0)
    +XP.PER_KILL*(m.kills||0)+XP.PER_BOT_KILL*(m.botKills||0)+XP.PER_FOOD*(m.food||0)
    +XP.TOP1_PER_MIN*((m.top1Ticks||0)/3600)+place;
  return Math.max(0,Math.min(XP.CAP,Math.round(v)));}

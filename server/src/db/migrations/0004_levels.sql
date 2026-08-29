-- ── 0004: XP, NÍVEL, MORTES e o gate de nível das skins ─────────────────────────────────────────────
-- PostgreSQL 9.6 (produção): ADD COLUMN com DEFAULT REESCREVE a tabela. É barato em user_stats e skins
-- (centenas de linhas, e a janela é o boot do pod) e caro em `matches`, que tem uma linha por VIDA — por
-- isso `matches.xp` entra SEM default, que no 9.6 é só metadado, e é lido com coalesce.
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS xp     bigint NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS deaths int    NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS user_stats_xp_idx ON user_stats (xp DESC);

ALTER TABLE matches ADD COLUMN IF NOT EXISTS xp int;

ALTER TABLE skins ADD COLUMN IF NOT EXISTS level_req smallint NOT NULL DEFAULT 0 CHECK (level_req >= 0);

-- BACKFILL do vitalício. Sem isto, todo veterano acorda no nível 1 no dia do deploy — e nível que zera é
-- pior que nível nenhum. A fórmula é a de shared/src/levels.js:matchXp SEM o bônus de colocação (ele não
-- vale para o histórico do Livre, onde `placement` é preenchido com lixo).
UPDATE user_stats s SET
  deaths = COALESCE(d.n,0),
  xp     = COALESCE(x.v,0)
FROM (SELECT user_id, count(*)::int AS n FROM matches
       WHERE cause IN ('eaten','blackhole','zone','eliminated') GROUP BY user_id) d
FULL JOIN (SELECT user_id, sum(LEAST(1200, round(
             10 + 6*(duration_s/60.0) + score/400.0 + 12*kills + 4*bot_kills
             + 0.02*food_eaten + 10*(top1_ticks/3600.0))))::bigint AS v
             FROM matches GROUP BY user_id) x USING (user_id)
WHERE s.user_id = COALESCE(d.user_id, x.user_id);
-- `matches.xp` fica NULL no histórico de propósito: o ranking SEMANAL/DIÁRIO por XP passa a valer a
-- partir de agora, e inventar um valor por partida antiga seria pior que assumir que ele começa hoje.

-- As views ganham colunas. DROP+CREATE em vez de CREATE OR REPLACE porque no 9.6 o REPLACE só permite
-- ACRESCENTAR no fim, e a ordem ficaria refém para sempre. `migrate.js` roda o arquivo INTEIRO dentro de
-- BEGIN/COMMIT, então não existe janela em que a view esteja ausente; nada além de repos/ranking.js depende delas.
DROP VIEW IF EXISTS v_ranking_week;
DROP VIEW IF EXISTS v_ranking_day;
CREATE VIEW v_ranking_week AS
  SELECT user_id, max(score) AS best_score, max(max_mass) AS best_mass, sum(kills)::int AS kills,
         sum(score)::bigint AS total_score, count(*)::int AS games,
         sum(bot_kills)::int AS bot_kills, sum(food_eaten)::int AS food_eaten,
         count(*) FILTER (WHERE cause IN ('eaten','blackhole','zone','eliminated'))::int AS deaths,
         COALESCE(sum(xp),0)::bigint AS xp
    FROM matches WHERE ended_at >= date_trunc('week', now()) GROUP BY user_id;
CREATE VIEW v_ranking_day AS
  SELECT user_id, max(score) AS best_score, max(max_mass) AS best_mass, sum(kills)::int AS kills,
         sum(score)::bigint AS total_score, count(*)::int AS games,
         sum(bot_kills)::int AS bot_kills, sum(food_eaten)::int AS food_eaten,
         count(*) FILTER (WHERE cause IN ('eaten','blackhole','zone','eliminated'))::int AS deaths,
         COALESCE(sum(xp),0)::bigint AS xp
    FROM matches WHERE ended_at >= date_trunc('day', now()) GROUP BY user_id;

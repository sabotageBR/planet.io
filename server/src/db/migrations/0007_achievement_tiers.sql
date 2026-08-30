-- ── CONQUISTAS EM FAMÍLIAS DE 4 NÍVEIS ────────────────────────────────────────
-- As 19 medalhas de meta única viraram 13 famílias de até 4 tiers (Bronze·Prata·Ouro·Diamante),
-- com chaves novas (`survive.b` no lugar de `survive5`). Decisão de projeto: RECOMEÇAR DO ZERO —
-- as chaves antigas não são migradas.
--
-- O que NÃO se perde: as moedas já pagas ficam (vivem no `coin_ledger`, que não é tocado aqui) e as
-- skins já concedidas ficam (vivem em `user_skins`, idem). O que volta ao zero é só o carimbo de
-- "conquistado", que agora é reconquistado com as metas novas.
--
-- ⚠️ PostgreSQL 9.6 em produção: sem IDENTITY, sem gen_random_uuid, e `ADD COLUMN ... DEFAULT`
-- reescreve a tabela (user_stats é pequena — uma linha por jogador).

ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS br_wins      int NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS br_top10     int NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS br_team_wins int NOT NULL DEFAULT 0;

-- Backfill a partir do histórico. O piso `players>=10` é o MESMO de shared/achievements.js: vencer
-- com 3 na sala não conta, senão a família inteira saía de graça numa sala vazia. mode 1 = Battle Royale.
UPDATE user_stats us SET
  br_wins      = COALESCE(h.wins,0),
  br_top10     = COALESCE(h.top10,0),
  br_team_wins = COALESCE(h.team_wins,0)
FROM (
  SELECT user_id,
         count(*) FILTER (WHERE placement = 1)                    AS wins,
         count(*) FILTER (WHERE placement <= 10)                  AS top10,
         count(*) FILTER (WHERE placement = 1 AND team_size > 1)  AS team_wins
  FROM matches
  WHERE mode = 1 AND placement IS NOT NULL AND placement > 0 AND players >= 10
  GROUP BY user_id
) h
WHERE h.user_id = us.user_id;

-- Recomeçar do zero: as chaves antigas não existem mais no catálogo, e deixá-las na tabela só
-- produziria linhas órfãs que nenhuma tela sabe desenhar.
DELETE FROM user_achievements;

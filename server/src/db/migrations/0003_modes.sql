-- MODOS DE JOGO: a partida passa a saber em que modo/equipe foi jogada e em que lugar terminou.
-- PostgreSQL 9.6 (produção): sem IDENTITY, sem gen_random_uuid; ADD COLUMN com DEFAULT reescreve a
-- tabela, o que aqui é barato — `matches` é pequena e a janela de migração é o boot do pod.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS mode      smallint NOT NULL DEFAULT 0;   -- MODE.* (0 = Livre)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS team_size smallint NOT NULL DEFAULT 1;   -- 1 = solo
ALTER TABLE matches ADD COLUMN IF NOT EXISTS team      smallint;                      -- NULL = sem equipe
ALTER TABLE matches ADD COLUMN IF NOT EXISTS placement smallint;                      -- 1 = campeão; NULL fora do Sobrevivência
ALTER TABLE matches ADD COLUMN IF NOT EXISTS players   smallint;                      -- quantos disputaram (o "de N" da colocação)

-- causas novas: 'zone' (queimou fora da zona), 'eliminated' (morreu no Sobrevivência) e 'survived'
-- (estava vivo quando a partida acabou). 'round' continua sendo o fim de mundo do modo Livre.
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_cause_check;
ALTER TABLE matches ADD CONSTRAINT matches_cause_check
  CHECK (cause IN ('eaten','blackhole','left','shutdown','round','zone','eliminated','survived'));

CREATE INDEX IF NOT EXISTS matches_mode_ended_idx ON matches (mode, ended_at DESC);

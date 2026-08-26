-- ── 0001: schema inicial do planet.io v2 (PG >= 11) ──────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations(
  version    int PRIMARY KEY,
  name       text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- espelho do catálogo (shared/src/skins.js), semeado no boot; existe para FK e preço
CREATE TABLE skins(
  id         int PRIMARY KEY,
  name       text NOT NULL,
  rarity     text NOT NULL,
  price      int NOT NULL DEFAULT 0 CHECK (price >= 0),
  unlock_key text,
  active     boolean NOT NULL DEFAULT true
);

CREATE TABLE users(
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind             text NOT NULL CHECK (kind IN ('guest','registered')),
  nick             text NOT NULL CHECK (char_length(nick) BETWEEN 2 AND 16),
  email            text,
  password_hash    text,
  coins            int NOT NULL DEFAULT 0 CHECK (coins >= 0),
  equipped_skin_id int NOT NULL DEFAULT 0 REFERENCES skins(id),
  prefs            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'guest' OR password_hash IS NOT NULL)
);
CREATE UNIQUE INDEX users_nick_registered_uq ON users (lower(nick)) WHERE kind = 'registered';
CREATE INDEX users_nick_lower_idx ON users (lower(nick));
CREATE UNIQUE INDEX users_email_uq ON users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX users_guest_seen_idx ON users (last_seen_at) WHERE kind = 'guest';

CREATE TABLE auth_tokens(
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  kind         text NOT NULL CHECK (kind IN ('device','session')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  user_agent   text
);
CREATE INDEX auth_tokens_user_idx ON auth_tokens (user_id);
CREATE INDEX auth_tokens_expires_idx ON auth_tokens (expires_at);

-- uma linha por vida (join → morte/saída); session_id garante idempotência
CREATE TABLE matches(
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id        uuid NOT NULL UNIQUE,
  user_id           bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_code         text,
  shard             smallint NOT NULL DEFAULT 0,
  started_at        timestamptz NOT NULL,
  ended_at          timestamptz NOT NULL DEFAULT now(),
  duration_s        int NOT NULL DEFAULT 0,
  score             int NOT NULL DEFAULT 0,
  max_mass          int NOT NULL DEFAULT 0,
  kills             int NOT NULL DEFAULT 0,
  bot_kills         int NOT NULL DEFAULT 0,
  splits            int NOT NULL DEFAULT 0,
  ejects            int NOT NULL DEFAULT 0,
  food_eaten        int NOT NULL DEFAULT 0,
  best_streak       int NOT NULL DEFAULT 0,
  top1_ticks        int NOT NULL DEFAULT 0,
  cause             text NOT NULL CHECK (cause IN ('eaten','blackhole','left','shutdown')),
  killed_by_user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  coins_earned      int NOT NULL DEFAULT 0,
  skin_id           int NOT NULL DEFAULT 0
);
CREATE INDEX matches_user_ended_idx ON matches (user_id, ended_at DESC);
CREATE INDEX matches_ended_idx ON matches (ended_at DESC);
CREATE INDEX matches_score_idx ON matches (score DESC);

-- acumulados por usuário, mantidos na mesma transação do match
CREATE TABLE user_stats(
  user_id       bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  games         int NOT NULL DEFAULT 0,
  kills         int NOT NULL DEFAULT 0,
  bot_kills     int NOT NULL DEFAULT 0,
  splits        int NOT NULL DEFAULT 0,
  ejects        int NOT NULL DEFAULT 0,
  food_eaten    int NOT NULL DEFAULT 0,
  total_score   bigint NOT NULL DEFAULT 0,
  best_score    int NOT NULL DEFAULT 0,
  best_mass     int NOT NULL DEFAULT 0,
  play_time_s   int NOT NULL DEFAULT 0,
  best_streak   int NOT NULL DEFAULT 0,
  last_match_at timestamptz
);
CREATE INDEX user_stats_best_score_idx ON user_stats (best_score DESC);
CREATE INDEX user_stats_best_mass_idx ON user_stats (best_mass DESC);
CREATE INDEX user_stats_kills_idx ON user_stats (kills DESC);
CREATE INDEX user_stats_total_score_idx ON user_stats (total_score DESC);

-- invariante: users.coins = sum(delta) por usuário
CREATE TABLE coin_ledger(
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta         int NOT NULL CHECK (delta <> 0),
  balance_after int NOT NULL CHECK (balance_after >= 0),
  reason        text NOT NULL CHECK (reason IN ('signup','match','achievement','skin_purchase','admin')),
  ref_type      text,
  ref_id        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coin_ledger_user_idx ON coin_ledger (user_id, id DESC);

CREATE TABLE user_skins(
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skin_id     int NOT NULL REFERENCES skins(id),
  acquired_at timestamptz NOT NULL DEFAULT now(),
  source      text NOT NULL CHECK (source IN ('default','purchase','achievement','grant')),
  ledger_id   bigint REFERENCES coin_ledger(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, skin_id)
);

CREATE TABLE user_achievements(
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key         text NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  match_id    bigint REFERENCES matches(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, key)
);

-- rankings de período: agregam matches desde o início da semana/dia (timezone da sessão)
CREATE VIEW v_ranking_week AS
  SELECT user_id, max(score) AS best_score, max(max_mass) AS best_mass, sum(kills)::int AS kills,
         sum(score)::bigint AS total_score, count(*)::int AS games
    FROM matches WHERE ended_at >= date_trunc('week', now()) GROUP BY user_id;
CREATE VIEW v_ranking_day AS
  SELECT user_id, max(score) AS best_score, max(max_mass) AS best_mass, sum(kills)::int AS kills,
         sum(score)::bigint AS total_score, count(*)::int AS games
    FROM matches WHERE ended_at >= date_trunc('day', now()) GROUP BY user_id;

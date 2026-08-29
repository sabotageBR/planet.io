-- ── 0005: PAÍS (ranking regional) e AVATAR (a skin "Retrato") ───────────────────────────────────────
-- `country` e `avatar_hash` entram em `users` porque são atributos de CONTA e porque o RESOLVE_SQL do
-- token já traz `u.*` — chegam de graça em todo join de WS. Ambos sem DEFAULT: no 9.6 isso é só metadado
-- e não reescreve a tabela.
ALTER TABLE users ADD COLUMN IF NOT EXISTS country     char(2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_hash text;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_country_chk;
ALTER TABLE users ADD  CONSTRAINT users_country_chk CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
CREATE INDEX IF NOT EXISTS users_country_idx ON users (country) WHERE country IS NOT NULL;

-- Os BYTES ficam FORA de `users`, e é o ponto todo desta tabela: `users` é lido com SELECT * em
-- byId/byLogin e no RESOLVE_SQL, ou seja em TODA chamada autenticada e em todo join de WS. Um bytea ali
-- custaria KB por request para uma foto que quase ninguém tem. Em `users` fica só o HASH (o ponteiro).
CREATE TABLE IF NOT EXISTS user_avatars(
  user_id    bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mime       text NOT NULL CHECK (mime IN ('image/png','image/webp')),
  bytes      bytea NOT NULL,
  w          smallint NOT NULL,
  h          smallint NOT NULL,
  size       int NOT NULL CHECK (size > 0 AND size <= 65536),
  hash       text NOT NULL,                                        -- sha256 hex: vira ETag e chave de cache de textura
  status     text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','hidden')),   -- moderação: esconder é um UPDATE
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

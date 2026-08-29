-- ── 0006: identidades externas (Google) — o esqueleto, INERTE sem credencial ────────────────────────
-- A rota POST /api/auth/google existe e é testada, mas devolve 503 enquanto GOOGLE_CLIENT_ID estiver
-- vazio. Esta migração só abre espaço no schema para quando ela for ligada.
CREATE TABLE IF NOT EXISTS user_identities(
  id            bigserial PRIMARY KEY,
  user_id       bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      text NOT NULL CHECK (provider IN ('google')),
  subject       text NOT NULL,          -- o `sub` do id_token, NUNCA o e-mail: o e-mail muda, o sub não
  email         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS user_identities_uq   ON user_identities (provider, subject);
CREATE INDEX        IF NOT EXISTS user_identities_user ON user_identities (user_id);

-- O CHECK anônimo do 0001 (kind='guest' OR password_hash IS NOT NULL) BLOQUEIA uma conta registrada só
-- por Google, que não tem senha nenhuma. Um CHECK não enxerga outra tabela (e no 9.6 nem subquery aceita),
-- então ele é trocado por um que aceita e-mail como prova de identidade — que é o que a conta Google traz.
DO $$DECLARE n text;BEGIN
  SELECT conname INTO n FROM pg_constraint
   WHERE conrelid='users'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%password_hash%';
  IF n IS NOT NULL THEN EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', n); END IF;
END$$;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_chk;
ALTER TABLE users ADD  CONSTRAINT users_auth_chk
  CHECK (kind = 'guest' OR password_hash IS NOT NULL OR email IS NOT NULL);

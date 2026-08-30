-- ── 0008: ADMINISTRAÇÃO, BANIMENTO e o NOME DA CONTA ──────────────────────────────────────────────
-- Três coisas que só existem juntas porque tocam a MESMA tabela e um pod parado é caro:
--
-- 1. `is_admin` em `users`. Poderia ser uma tabela `admins` à parte, mas `auth/tokens.js` resolve o
--    Bearer com `SELECT u.*` — a coluna chega DE GRAÇA em toda chamada autenticada e em todo join de
--    WS, sem uma segunda consulta. É literalmente o argumento que a 0005 usou para `country`.
--    Um admin é uma CONTA, não um login paralelo: sem identidade, a auditoria diria "admin" em vez de
--    "#42 evandro", e com dois moderadores isso não serve para nada.
--
-- 2. `banned_until`/`ban_reason`. Verificados em exatamente DOIS lugares (persist/hooks.js, que barra o
--    join de WS nos três shards sem estado em memória, e requireUser, senão o banido continua comprando
--    skins). Sem coluna de "banido" booleana: a data já responde as duas perguntas, e um ban temporário
--    expira sozinho sem ninguém precisar lembrar de desfazer.
--
-- 3. `display_name`: o nome que veio do Google. `auth/google.js` SEMPRE extraiu esse nome, mas ele só
--    servia para derivar um nick e era jogado fora. O ranking mostrava o NICK — e o nick o jogador troca
--    a cada entrada, então o pódio não dizia de quem era a marca. Fica em `users` (e não em
--    `user_identities`) porque quem lê é o ranking, que já faz JOIN em `users`.
--
-- ⚠️ PostgreSQL 9.6 em produção: sem IDENTITY, sem gen_random_uuid. `ADD COLUMN` sem DEFAULT é só
-- metadado e não reescreve a tabela; `is_admin` tem DEFAULT false e reescreve — `users` é pequena.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin     boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason   text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;
CREATE INDEX IF NOT EXISTS users_admin_idx  ON users (id) WHERE is_admin;
CREATE INDEX IF NOT EXISTS users_banned_idx ON users (banned_until) WHERE banned_until IS NOT NULL;

-- O token do PAINEL é um tipo à parte, e essa é a linha que impede o painel de ser roubado junto com a
-- aba do jogo: `requireAdmin` exige is_admin **e** kind='admin'. TTL de 12 h (ver auth/tokens.js).
ALTER TABLE auth_tokens DROP CONSTRAINT IF EXISTS auth_tokens_kind_check;
ALTER TABLE auth_tokens ADD  CONSTRAINT auth_tokens_kind_check CHECK (kind IN ('device','session','admin'));

-- Parâmetros de jogo alteráveis pelo painel. O VALOR é a verdade (os 3 pods leem daqui no boot e a cada
-- 30 s); o push entre irmãos é só latência. A chave é validada contra a whitelist de shared/src/tunables.js
-- ANTES de chegar aqui — esta tabela não é um `eval` com persistência.
CREATE TABLE IF NOT EXISTS admin_settings(
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by bigint REFERENCES users(id) ON DELETE SET NULL
);

-- Toda ação de admin deixa rastro. `target` é texto (às vezes é um id de usuário, às vezes um código de
-- sala) e `detail` é jsonb porque cada ação tem os campos dela — normalizar isso seria inventar dez
-- colunas nulas. Sem retenção automática: é log de baixo volume.
CREATE TABLE IF NOT EXISTS admin_audit(
  id         bigserial PRIMARY KEY,
  admin_id   bigint REFERENCES users(id) ON DELETE SET NULL,
  action     text NOT NULL,
  target     text,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_at_idx    ON admin_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_admin_idx ON admin_audit (admin_id, id DESC);

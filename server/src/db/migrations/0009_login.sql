-- ── 0009: O NICK FICA LIVRE; quem vira único é o LOGIN ─────────────────────────────────────────────
-- O nick era único no mundo inteiro entre contas registradas (`users_nick_registered_uq`, da 0001) e
-- isso nunca foi uma regra de JOGO: nick é nome de planeta, e qualquer um tem que poder se chamar
-- "Messi" (inclusive com a caricatura, que `shared/src/eggs.js` escolhe pelo nick). A única regra que o
-- jogo precisa é a que já existe e continua: dois "Messi" não podem estar na MESMA sala, senão o kill
-- feed, o chat e o placar mentem (`Room.nickTaken` → NICK_IN_ROOM).
--
-- Quem segurava a unicidade global era o LOGIN: `POST /api/auth/login` aceita "nick ou e-mail + senha"
-- e o e-mail é OPCIONAL no cadastro — para a maioria das contas o nick É o login. Então o nick se
-- parte em dois: `login` é o nome de ENTRADA, congelado no cadastro e único; `nick` é o nome de jogo,
-- livre e trocável quando quiser.
--
-- ⚠️ O backfill NÃO pode violar o índice novo: "registrado COM SENHA" é subconjunto de "registrado",
-- que o índice velho já garantia único em lower(nick). Conta só-Google e convidado ficam com login
-- NULL — não entram por senha, não reservam nome nenhum.
-- ⚠️ NADA de CHECK de FORMATO aqui (sem espaço, sem '@', allowlist): `normalizeNick` aceita espaço e
-- quase todo Unicode, e há nick com espaço em produção — um CHECK de formato faria o backfill
-- explodir. E migração que explode não derruba o pod: `index.js` engole o erro e o processo SOBE com
-- o schema pela metade, devolvendo 500 em todo login. Por isso, também, IF EXISTS/IF NOT EXISTS em
-- TUDO.
-- ⚠️ Nada de `CHECK (password_hash IS NULL OR login IS NOT NULL)`: no meio do rollout os pods VELHOS
-- ainda reivindicam contas sem escrever `login`, e a CHECK transformaria isso em 500. Quem cobre esse
-- buraco é o degrau de compatibilidade do `byLogin` (repos/users.js).
-- ⚠️ PostgreSQL 9.6: `ADD COLUMN` sem DEFAULT é só metadado; `CREATE INDEX CONCURRENTLY` é proibido
-- (o runner roda cada migração DENTRO de uma transação). O ALTER toma ACCESS EXCLUSIVE em `users` até
-- o COMMIT e o RESOLVE_SQL do token passa por aqui em todo join — com a tabela de hoje são
-- milissegundos, mas se um dia demorar mais de 3 s os joins caem em `unsaved` e a partida deixa de ser
-- gravada EM SILÊNCIO (persist/hooks.js).
ALTER TABLE users ADD COLUMN IF NOT EXISTS login text;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_login_len_chk;
ALTER TABLE users ADD  CONSTRAINT users_login_len_chk CHECK (login IS NULL OR char_length(login) BETWEEN 2 AND 16);
UPDATE users SET login=nick WHERE kind='registered' AND password_hash IS NOT NULL AND login IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_login_uq ON users (lower(login)) WHERE login IS NOT NULL;

-- E o índice que travava o nick sai. `users_nick_lower_idx` (0001) FICA: os pods velhos ainda rodam
-- `isReservedByOther` durante o rollout, e é ele que segura aquela consulta.
DROP INDEX IF EXISTS users_nick_registered_uq;

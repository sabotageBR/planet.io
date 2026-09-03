-- 0010: o que faltava para PERGUNTAR se o jogador fica 3 minutos.
--
-- Quase toda a resposta já estava no banco e ninguém tinha ido buscar: `matches` guarda `started_at`,
-- `duration_s` e `cause` desde a 0001, e `users.created_at` × `last_seen_at` já dá coorte. O que falta é
-- (a) saber QUEM matou o novato — hoje `killed_by_user_id` é NULL tanto para "morreu para um bot" quanto
-- para "morreu para o cenário", e o tamanho do algoz, que é o número que decide se o culpado é o gigante
-- semeado, nunca foi gravado; e (b) de onde a conta veio, para separar o site dos portais.
--
-- ⚠️ SÓ `ADD COLUMN` SEM DEFAULT, ZERO BACKFILL, ZERO CHECK NOVO. No PostgreSQL 9.6 uma coluna sem default
-- é só metadado (o precedente é `matches.xp`, na 0004): não reescreve a tabela e o ACCESS EXCLUSIVE dura
-- milissegundos. Com backfill ou CHECK, `matches` seria varrida inteira sob lock — e isto roda no BOOT do
-- pod, onde passar de 3 s derruba os joins para `unsaved` e a partida deixa de ser gravada EM SILÊNCIO.
-- É o alerta que a 0009 deixou escrito, e ele vale aqui igual. O histórico fica NULL de propósito.
--
-- A lista de valores de `killer_kind`/`how` é fechada em JS (Sim._died / Sim._feedMorte); validá-la com
-- CHECK custaria a varredura que esta migração existe para evitar.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS killer_kind text;   -- 'human' | 'bot' | NULL (sem algoz: zona, estrela, buraco)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS killer_mass int;    -- massa do algoz no instante da morte (a razão com max_mass é o que acusa o gigante)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS how         text;   -- eat|star|asteroid|missile|nova|zone|hole — já calculado para o kill feed e jogado fora
ALTER TABLE users   ADD COLUMN IF NOT EXISTS origin      text;   -- o Origin do POST /api/auth/guest: DIMENSÃO (fatiar o funil por portal), nunca autorização

-- O único comando aqui que não é metadado. `users` é pequena (~1200 linhas), então são segundos — e ele é
-- necessário porque TODA consulta de coorte é ancorada em `created_at`.
-- ⚠️ Nada de CONCURRENTLY: o runner roda cada migração dentro de uma transação (db/migrate.js), e o
-- Postgres proíbe as duas coisas juntas. É a mesma nota que a 0009 deixou.
CREATE INDEX IF NOT EXISTS users_created_idx ON users (created_at);

-- ⚠️ NENHUM índice novo em `matches`, de propósito: `matches_user_ended_idx` e `matches_ended_idx` já
-- cobrem o acesso das consultas de retenção (que entram por `users.created_at` e cruzam por `user_id`), e
-- um terceiro índice custaria amplificação de escrita no INSERT mais quente do sistema para servir uma
-- tela que alguém abre uma vez por dia.

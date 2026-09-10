-- 0014: a ARTE de uma skin passa a poder morar no banco, e o catálogo ganha as colunas que faltavam.
--
-- Dois usos, e o segundo é o que o pedido pede:
--   OVERRIDE  uma skin de CÓDIGO (que já existe em shared/src/skins.js) passa a ser desenhada com uma
--             imagem em vez do pattern procedural. É por aqui que as 35 caricaturas (ids 84-118) saem da
--             build: os arquivos deixam de ir no pacote e a arte vem daqui, sem trocar id nenhum — trocar
--             quebraria `user_skins` (todo mundo que já as tem), os `unlockKey` e todo zip publicado.
--   SKIN NOVA  criada pelo /admin, sem tocar na build. `source='db'`.
--
-- ⚠️ A FAIXA DE ID É 128-255, E O TETO É DURO. `skinId` viaja como u8 no registro PLAYERS
-- (shared/src/protocol/codec.js: `.u8(p.skinId)`, e `Sim.js` ainda mascara com &255): um id 256 chegaria
-- ao cliente como 0 — o Planeta Padrão — e um id 1024 como 0 também, ou seja COLIDINDO com uma skin de
-- código, em silêncio, para o dono e para a sala inteira. O catálogo de código vai até 127, então sobram
-- 128 vagas, para sempre. Subir para u16 é inserção no MEIO do registro: sobe o PROTOCOL_MIN e derruba
-- todo zip de portal congelado — fica para uma janela em que os pacotes sejam reenviados de qualquer jeito.
--
-- ⚠️ OS BYTES FICAM FORA DE `skins`, e é o mesmo motivo de `user_avatars` existir (0005): `skins` é lida
-- inteira no boot e a cada compra; um `bytea` ali custaria KB por consulta para uma arte que a maioria das
-- linhas não tem. Em `skins` fica só o HASH — o ponteiro, que vira ETag e chave de cache no cliente.
--
-- ⚠️ `ADD COLUMN` sem DEFAULT e sem backfill: no PG 9.6 isso é só metadado, e este ALTER roda no BOOT do
-- pod. Passando de 3 s os joins caem em `unsaved` e a partida deixa de ser gravada EM SILÊNCIO (a nota da
-- 0010). `source` é a exceção e é barata: `skins` tem 128 linhas.
ALTER TABLE skins ADD COLUMN IF NOT EXISTS art_hash text;
ALTER TABLE skins ADD COLUMN IF NOT EXISTS color    text;
ALTER TABLE skins ADD COLUMN IF NOT EXISTS accent   text;
ALTER TABLE skins ADD COLUMN IF NOT EXISTS emoji    text;
ALTER TABLE skins ADD COLUMN IF NOT EXISTS descr    text;
ALTER TABLE skins ADD COLUMN IF NOT EXISTS source   text NOT NULL DEFAULT 'code';

-- A fronteira, garantida pelo BANCO e não pela boa vontade de quem escreve a rota. `NOT VALID` porque as
-- linhas que já existem são todas 'code' e a validação varreria a tabela à toa no boot.
ALTER TABLE skins ADD CONSTRAINT skins_db_id_range
  CHECK (source <> 'db' OR (id BETWEEN 128 AND 255)) NOT VALID;

-- Gêmea de `user_avatars` (0005), inclusive no `status`: moderação é um UPDATE, nunca um DELETE — a skin
-- pode estar em `user_skins` de muita gente, e ninguém pode perder o que comprou.
CREATE TABLE IF NOT EXISTS skin_art(
  skin_id    int PRIMARY KEY REFERENCES skins(id) ON DELETE CASCADE,
  mime       text NOT NULL CHECK (mime IN ('image/png','image/webp')),
  bytes      bytea NOT NULL,
  w          smallint NOT NULL,
  h          smallint NOT NULL,
  size       int NOT NULL CHECK (size > 0 AND size <= 131072),
  hash       text NOT NULL,                                     -- sha256 hex: vira ETag e chave de cache
  status     text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

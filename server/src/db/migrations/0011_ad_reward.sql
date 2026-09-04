-- 0011: recompensa por assistir anúncio (Poki rewardedBreak) — as 3 skins mascote (119/120/121).
--
-- Uma recompensa por CONTA, não uma por skin. `user_skins` sozinha não bastava: nada impediria
-- reivindicar as três com três chamadas separadas, cada uma "simulando" um anúncio assistido.
-- `unlockKey` também não serve — setá-lo em 119-121 faria server/src/api/skins.js recusar a compra
-- com moedas como `not_purchasable`, e elas continuam à venda normalmente. `reward_key` é a chave da
-- recompensa (hoje só 'mascot'; um tipo novo de recompensa por anúncio ganha outro valor, não outra
-- tabela); `skin_id` guarda qual das três a conta escolheu.
--
-- Tabela nova e vazia: CREATE TABLE não tem o custo de lock de um ALTER em tabela grande (ver a nota
-- da 0010), então o CHECK entra direto, sem a cautela de "validar só em JS" que existe para colunas
-- novas em tabelas já populadas.
CREATE TABLE user_ad_rewards(
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_key  text NOT NULL CHECK (reward_key IN ('mascot')),
  skin_id     int NOT NULL REFERENCES skins(id),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, reward_key)
);

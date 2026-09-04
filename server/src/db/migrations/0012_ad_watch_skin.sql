-- 0012: cada mascote (119/120/121) passa a exigir o PRÓPRIO anúncio, não mais um por CONTA — e assistir
-- deixa de dar a skin de graça: o anúncio destrava a COMPRA, as moedas continuam obrigatórias
-- (server/src/api/skins.js, POST /api/skins/:id/buy). `user_ad_rewards` guardava "resgatei uma
-- recompensa" (1 linha por conta, `reward_key='mascot'`); esta tabela guarda "assisti o anúncio desta
-- skin" (1 linha por skin), que é uma coisa mais simples e não precisa mais do `reward_key`.
CREATE TABLE user_ad_watched(
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skin_id    int NOT NULL REFERENCES skins(id),
  watched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skin_id)
);
-- quem já tinha resgatado de graça pelo fluxo antigo continua DONO do mascote (user_skins não muda
-- aqui); herdamos só o "já assistiu aquela skin", para não pedir o anúncio de novo de quem já passou
-- pelo fluxo antigo.
INSERT INTO user_ad_watched(user_id,skin_id,watched_at)
  SELECT user_id,skin_id,granted_at FROM user_ad_rewards;
DROP TABLE user_ad_rewards;

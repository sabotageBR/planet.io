// ── O CATÁLOGO DE SKINS ────────────────────────────────────────────────────────
// O que se prova aqui é a FRONTEIRA de ids, e ela não é estética: `skinId` viaja como u8 no registro
// PLAYERS, então o espaço é finito e compartilhado entre o catálogo de código e o que o /admin criar.
// Errar isso não dá erro — dá outra skin na tela de todo mundo.
import {test} from "node:test";
import assert from "node:assert/strict";
import {SKINS,SKIN_BY_ID,SKIN_ART,AD_GIFT_SKINS,AD_REWARD_SKINS,STARTER_SKINS,isPurchasable} from "../src/skins.js";

test("skins: nenhuma skin de CÓDIGO invade a faixa do banco", () => {
  // É este teste que impede o acidente: alguém acrescenta a skin 128 no catálogo, o /admin cria a 128 no
  // banco, e as duas passam a ser a mesma linha da tabela — sem erro em lugar nenhum.
  const maior = Math.max(...SKINS.map(s => s.id));
  assert.ok(maior < SKIN_ART.ID_MIN,
    `a skin de código ${maior} invadiu a faixa do banco (${SKIN_ART.ID_MIN}-${SKIN_ART.ID_MAX})`);
});

test("skins: todo id cabe num BYTE — é o que o protocolo carrega", () => {
  // `encodePlayers` faz `.u8(p.skinId)` e o servidor mascara com &255. Um id 256 chega como 0 (Planeta
  // Padrão) e um 300 como 44 — uma skin existente, na tela da sala inteira.
  for (const s of SKINS) assert.ok(s.id >= 0 && s.id <= 255, `id ${s.id} não cabe em u8`);
  assert.ok(SKIN_ART.ID_MAX <= 255, "a faixa do banco também tem que caber");
  assert.equal(SKIN_BY_ID.size, SKINS.length, "ids duplicados no catálogo");
});

test("skins: as duas pools de anúncio são disjuntas e coerentes", () => {
  // As mascotes DESTRAVAM a compra (migração 0012); a pool de presente é DADA. Uma skin nas duas teria
  // duas regras ao mesmo tempo — foi por isso que a 0011 foi derrubada.
  for (const id of AD_GIFT_SKINS) {
    assert.ok(SKIN_BY_ID.has(id), `a pool de presente aponta para a skin ${id}, que não existe`);
    assert.ok(!AD_REWARD_SKINS.includes(id), `a skin ${id} está nas DUAS pools de anúncio`);
    assert.ok(isPurchasable(SKIN_BY_ID.get(id)), `a skin ${id} não é comprável: "ganhar" não teria com o que ser comparado`);
  }
});

test("skins: as de conquista apontam para chaves, e as de desempenho existem", () => {
  const comChave = SKINS.filter(s => s.unlockKey);
  assert.ok(comChave.length >= 16, "o catálogo perdeu skins de conquista");
  // ⚠️ Skin com `unlockKey` NÃO pode ser comprável: `isPurchasable` a exclui, e o servidor recusa a compra
  // com `not_purchasable`. Uma skin conquistável e à venda ao mesmo tempo esvazia a conquista.
  for (const s of comChave) assert.ok(!isPurchasable(s), `a skin ${s.id} é de conquista E está à venda`);
});

test("skins: a inicial sorteada é sempre uma que o jogador pode ter de graça", () => {
  for (const id of STARTER_SKINS) {
    const s = SKIN_BY_ID.get(id);
    assert.ok(s, `starter ${id} não existe`);
    assert.ok(!s.unlockKey && !s.levelReq, `a starter ${id} exige conquista ou nível`);
  }
});

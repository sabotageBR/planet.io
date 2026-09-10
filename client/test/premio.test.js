// ── O PRÊMIO DA TELA DE MORTE ──────────────────────────────────────────────────
// Três mecânicas pedidas, UM bloco na tela — e é a prioridade entre elas que este arquivo trava. A regra
// não é arbitrária: anunciar uma OFERTA por cima de um prêmio que o jogador acabou de conquistar troca a
// comemoração por uma venda, e é o tipo de coisa que ninguém percebe até estar em produção.
import { test } from "node:test";
import assert from "node:assert/strict";
import { escolhePremio } from "../src/ui/premio.js";
import { AD_GIFT_SKINS, AD_REWARD_SKINS, skinById } from "@warspace/shared";

const R = ids => ({ skinsUnlocked: ids });

test("a skin destravada na partida ganha da oferta de anúncio", () => {
  const p = escolhePremio(R([35]), [], true, true);
  assert.equal(p.tipo, "skin");
  assert.equal(p.id, 35);
});

test("mais de uma destravada: mostra a de MAIOR id (a família mais difícil)", () => {
  assert.equal(escolhePremio(R([35, 74, 44]), [], true, true).id, 74);
});

test("sem prêmio, oferece a PRIMEIRA da pool que falta — e é determinístico", () => {
  const p1 = escolhePremio(null, [], true, true), p2 = escolhePremio(null, [], true, true);
  assert.equal(p1.tipo, "anuncio");
  assert.equal(p1.id, AD_GIFT_SKINS[0], "a ordem da pool É a ordem da oferta");
  assert.equal(p1.id, p2.id, "duas chamadas, a mesma oferta: nada de sorteio entre a morte e o clique");
  const p3 = escolhePremio(null, [AD_GIFT_SKINS[0]], true, true);
  assert.equal(p3.id, AD_GIFT_SKINS[1], "quem já tem a primeira recebe a seguinte");
});

test("sem SDK de anúncio não há oferta — botão morto é pior que botão nenhum", () => {
  assert.equal(escolhePremio(null, [], false, true), null);
});

test("convidado local não recebe oferta: não há onde guardar a skin", () => {
  assert.equal(escolhePremio(null, [], true, false), null);
});

test("pool esgotada: nada a oferecer, e o bloco some", () => {
  assert.equal(escolhePremio(null, AD_GIFT_SKINS, true, true), null);
});

test("as duas pools são DISJUNTAS — é o que deixa as duas regras conviverem", () => {
  // As mascotes seguem a regra da migração 0012 (o anúncio destrava a COMPRA, as moedas continuam); a pool
  // de presente é DADA. Uma skin nas duas listas teria duas regras ao mesmo tempo, e a Loja passaria a
  // mentir — que foi exatamente o motivo de a 0011 ser derrubada.
  const cruz = AD_GIFT_SKINS.filter(id => AD_REWARD_SKINS.includes(id));
  assert.deepEqual(cruz, [], `skin com duas regras de anúncio: ${cruz.join(",")}`);
});

test("toda skin da pool de presente existe e é comprável por moedas", () => {
  // Se ela não estivesse à venda, "ganhar" não teria com o que ser comparado — e o jogador não saberia o
  // que recebeu. Também é o que mantém a economia legível: é uma skin de ~4 partidas boas, não um exclusivo.
  for (const id of AD_GIFT_SKINS) {
    const s = skinById(id);
    assert.equal(s.id, id, `a skin ${id} não existe no catálogo`);
    assert.ok(s.price > 0, `a skin ${id} (${s.name}) não tem preço: não dá para dizer o que ela vale`);
    assert.ok(!s.unlockKey, `a skin ${id} é de conquista — dá-la por anúncio esvazia a conquista`);
  }
});

test("skin destravada que o catálogo não conhece é ignorada, não quebra a tela", () => {
  // Rollout: um pod com catálogo mais novo pode mandar um id que esta build não tem.
  assert.equal(escolhePremio(R([9999]), AD_GIFT_SKINS, true, true), null);
});

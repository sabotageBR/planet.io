// ── A PRIMEIRA VIDA: A TELA DE MORTE QUE NÃO ABRE E O ANÚNCIO QUE NÃO SAI ─────
// As duas decisões do pack 1.21 que decidem a coluna de 1–2 min do Fit Test. São PURAS, então isto as
// exercita direto — não há jsdom no projeto, e o que precisa ser conferido é a decisão, nunca o modal.
// node --test client/test/primeira-vida.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { MODE, PORTAL } from "@warspace/shared";
import { renasceSozinho, pedagioLiberado } from "../src/portal/primeiraVida.js";
import { faixaIdade } from "../src/portal/marcos.js";

test("a primeira morte do pacote renasce sozinha; a segunda abre a tela", () => {
  const p = m => renasceSozinho({ portal: true, modo: MODE.FREE, mortes: m });
  assert.equal(p(1), true, "a 1ª morte não abre cartão nenhum");
  assert.equal(p(2), false, "da 2ª em diante o jogador escolhe");
  assert.equal(p(9), false);
});

test("...e nada disso vale no site nem no Battle Royale", () => {
  assert.equal(renasceSozinho({ portal: false, modo: MODE.FREE, mortes: 1 }), false, "no site a tela de morte é a de sempre");
  assert.equal(renasceSozinho({ portal: true, modo: MODE.BR, mortes: 1 }), false, "no BR não existe respawn: não há para onde renascer");
});

test("o interruptor é `VIDAS_SEM_TELA`, e zero devolve o comportamento anterior", () => {
  const n = PORTAL.VIDAS_SEM_TELA;
  try {
    PORTAL.VIDAS_SEM_TELA = 0;
    assert.equal(renasceSozinho({ portal: true, modo: MODE.FREE, mortes: 1 }), false, "toda morte volta a abrir o cartão");
  } finally { PORTAL.VIDAS_SEM_TELA = n; }
});

// ⚠️ O PEDIDO É LITERAL: "Zero commercialBreak / rewarded na 1ª e na 2ª vida. Primeiro anúncio só depois
// de um kill ou depois de 3 min de sessão. Midroll no restart destrói o Fit Test."
test("as duas primeiras vidas entram sem anúncio nenhum", () => {
  for (const mortes of [0, 1]) {
    assert.equal(pedagioLiberado({ mortes, kills: 3, sessaoMs: 9e5 }), false,
      "nem com abate e nem com quinze minutos de página: as duas primeiras vidas são de graça");
  }
});

test("passadas elas, o anúncio ainda espera um SINAL — um abate ou três minutos", () => {
  assert.equal(pedagioLiberado({ mortes: 2, kills: 0, sessaoMs: 0 }), false, "sem sinal nenhum, continua sem pedágio");
  assert.equal(pedagioLiberado({ mortes: 2, kills: 1, sessaoMs: 0 }), true, "o abate é o sinal mais forte de que a pessoa ficou");
  assert.equal(pedagioLiberado({ mortes: 2, kills: 0, sessaoMs: PORTAL.FIRST_AD_MS }), true, "...ou o relógio da carga da página");
  assert.equal(pedagioLiberado({ mortes: 2, kills: 0, sessaoMs: PORTAL.FIRST_AD_MS - 1 }), false, "um milissegundo antes, não");
});

test("a idade da morte vira FAIXA — o histograma do painel é feito de nomes", () => {
  assert.equal(faixaIdade(0), "0_30s");
  assert.equal(faixaIdade(29), "0_30s");
  assert.equal(faixaIdade(30), "30_60s");
  assert.equal(faixaIdade(61), "60_120s");
  assert.equal(faixaIdade(600), "120s_mais");
  assert.equal(faixaIdade(undefined), "0_30s", "sem número, a faixa mais nova — nunca NaN no painel deles");
});

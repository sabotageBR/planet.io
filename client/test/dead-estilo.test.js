// ── QUAL MODELO DA TELA DE MORTE (ui/deadEstilo.js) ──────────────────────────
// A escolha tem TRÊS fontes (o `?dead=` de QA, o pacote de portal e a pref da conta) e o que este arquivo
// trava é a ORDEM entre elas — mais a exceção do Battle Royale, que é a única regra de JOGO aqui.
// Pura pelo mesmo motivo de `dead-clock.test.js`: não há jsdom no projeto.
// Rodar: node --test client/test/dead-estilo.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { MODE } from "@warspace/shared";
import { ESTILOS, estiloDe } from "../src/ui/deadEstilo.js";
import { PREFS } from "../src/ui/prefsTable.js";

const LIVRE = { portal: true, modo: MODE.FREE, br: MODE.BR };
const BR = { portal: true, modo: MODE.BR, br: MODE.BR };

test("no pacote e no Livre, o modelo é o KABOOM — ignorando a pref da conta", () => {
  assert.equal(estiloDe({ deadStyle: "dossie" }, LIVRE), "kaboom");
  assert.equal(estiloDe({ deadStyle: "balanco" }, LIVRE), "kaboom");
  assert.equal(estiloDe(null, LIVRE), "kaboom");
});

test("no BATTLE ROYALE o kaboom NÃO vale, nem no pacote", () => {
  // lá o jogo promete o pódio na própria tela (LB.brWatchHint) e o botão é "OUTRA PARTIDA": um cartão de
  // um número só apagaria metade da partida
  assert.equal(estiloDe({ deadStyle: "sala" }, BR), "sala");
  assert.equal(estiloDe(null, BR), "duelo");
});

test("o `?dead=` ganha até do pacote — senão os outros modelos deixam de ser mensuráveis", () => {
  assert.equal(estiloDe(null, { ...LIVRE, q: "balanco" }), "balanco");
  assert.equal(estiloDe(null, { ...LIVRE, q: "2" }), "balanco");
  assert.equal(estiloDe(null, { ...LIVRE, q: "4" }), "kaboom");
  assert.equal(estiloDe({ deadStyle: "sala" }, { ...LIVRE, q: "duelo" }), "duelo");
});

test("no site nada muda: vale a pref, e o chão é o duelo", () => {
  assert.equal(estiloDe({ deadStyle: "sala" }), "sala");
  assert.equal(estiloDe({ deadStyle: "balanco" }), "balanco");
  assert.equal(estiloDe({ deadStyle: "kaboom" }), "kaboom", "quem o escolher no site, leva");
  assert.equal(estiloDe(null), "duelo");
  assert.equal(estiloDe({ deadStyle: "inexistente" }), "duelo");
  assert.equal(estiloDe({}), "duelo");
});

test("`?dead=` inválido não derruba a escolha, só não vale", () => {
  assert.equal(estiloDe({ deadStyle: "sala" }, { q: "9" }), "sala");
  assert.equal(estiloDe({ deadStyle: "sala" }, { q: "nada" }), "sala");
});

test("ESTILOS e as opções da tela de Opções em PARIDADE", () => {
  // um modelo que exista só num dos dois é ou uma opção que não desenha nada, ou um modelo que ninguém
  // consegue escolher — os dois falham em silêncio
  const opts = PREFS.flatMap(g => g.items).find(it => it.key === "deadStyle").opts;
  assert.deepEqual([...opts].sort(), [...ESTILOS].sort());
});

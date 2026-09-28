// ── O GUIA NO MUNDO (client/src/game/guia.js) ─────────────────────────────────
// A instrução do tutorial deixou de ser texto e passou a ser um GESTO desenhado no mundo. O que este arquivo
// trava é a ESCOLHA do gesto — um só por vez, no lugar certo, e nunca em cima de uma comemoração.
// node --test client/test/guia.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { guiaDoTutor, maisPerto, anelDeRisco, presaForaDaTela } from "../src/game/guia.js";
import { EAT } from "@warspace/shared";
import { ETAPA } from "../src/game/tutor.js";

const eu = { x: 900, y: 900, r: 63 };
const mundo = {
  estrela: { x: 900, y: 600, r: 24 },
  cacos: [{ rx: 1200, ry: 900, rr: 8 }, { rx: 950, ry: 880, rr: 8 }, { rx: 400, ry: 400, rr: 8 }],
  presa: { x: 1100, y: 700, r: 40 },
};

test("na ESPERA o guia é o TOQUE na estrela — e some assim que o jogador toca", () => {
  const g = guiaDoTutor({ etapa: ETAPA.NOVA, pre: true }, eu, mundo);
  assert.deepEqual(g, { tipo: "toque", x: 900, y: 600, r: 24 });
  // o `pre` do servidor fica de pé mais 0,8 s de inchaço: sem o `tocou` a mão continuaria tocando ali
  assert.equal(guiaDoTutor({ etapa: ETAPA.NOVA, pre: true, tocou: true }, eu, mundo), null);
  assert.equal(guiaDoTutor({ etapa: ETAPA.NOVA, pre: true }, eu, { ...mundo, estrela: null }), null, "sem estrela, nada");
});

test("depois do estouro o guia vai ATÉ O CACO MAIS PERTO", () => {
  const g = guiaDoTutor({ etapa: ETAPA.NOVA, pre: false, pct: 0 }, eu, mundo);
  assert.equal(g.tipo, "ir");
  assert.deepEqual([g.x0, g.y0, g.r0], [900, 900, 63], "sai do planeta");
  assert.deepEqual([g.x, g.y], [950, 880], "e aponta o mais perto, não o primeiro da lista");
});

test("quem já entendeu não recebe rastro — e ele VOLTA se a ajuda chegar", () => {
  assert.equal(guiaDoTutor({ etapa: ETAPA.NOVA, pre: false, pct: .5, ajuda: 0 }, eu, mundo), null);
  assert.equal(guiaDoTutor({ etapa: ETAPA.NOVA, pre: false, pct: .5, ajuda: 1 }, eu, mundo).tipo, "ir");
  assert.equal(guiaDoTutor({ etapa: ETAPA.NOVA, pre: false, pct: 0 }, eu, { ...mundo, cacos: [] }), null, "sem caco, nada");
});

test("na etapa de dividir o guia é o SALTO até a presa", () => {
  const g = guiaDoTutor({ etapa: ETAPA.SPLIT, ajuda: 0 }, eu, mundo);
  assert.deepEqual(g, { tipo: "salto", x0: 900, y0: 900, r0: 63, x: 1100, y: 700, r: 40 });
  assert.equal(guiaDoTutor({ etapa: ETAPA.SPLIT }, eu, { ...mundo, presa: null }), null);
});

test("NADA durante a festa, no fim, sem estado ou sem planeta", () => {
  assert.equal(guiaDoTutor({ etapa: ETAPA.SPLIT, celebra: true }, eu, mundo), null, "o selo ✓ é o único retorno ali");
  assert.equal(guiaDoTutor({ etapa: ETAPA.FIM, fim: true }, eu, mundo), null);
  assert.equal(guiaDoTutor(null, eu, mundo), null);
  assert.equal(guiaDoTutor({ etapa: ETAPA.SPLIT }, null, mundo), null);
  // a etapa DORMENTE do tiro não tem guia no mundo (ela não está na sequência)
  assert.equal(guiaDoTutor({ etapa: ETAPA.TIRO }, eu, mundo), null);
});

test("`maisPerto` aceita os dois formatos e não quebra com lista vazia", () => {
  assert.deepEqual(maisPerto({ x: 0, y: 0 }, [{ x: 5, y: 0, r: 2 }, { rx: 1, ry: 1, rr: 3 }]), { x: 1, y: 1, r: 3 });
  assert.equal(maisPerto({ x: 0, y: 0 }, []), null);
  assert.equal(maisPerto({ x: 0, y: 0 }, null), null);
});

// ── O NOVATO NA PARTIDA ──
test("o ANEL segue a régua do jogo: a MAIOR peça come, a MENOR é comida, e no meio não há anel", () => {
  const eu = { min: 80, max: 100 };
  assert.equal(anelDeRisco(100 / EAT.RATIO, eu), "comivel", "no limite exato da maior: come");
  assert.equal(anelDeRisco(100 / EAT.RATIO + .5, eu), null, "um pouco acima: não come mais, e ainda não é perigo");
  assert.equal(anelDeRisco(80 * EAT.RATIO, eu), "perigo", "no limite da MENOR: ela é comida");
  assert.equal(anelDeRisco(80 * EAT.RATIO - .5, eu), null);
  // dividido, a peça que eu ainda não como já pode ser o perigo da minha MENOR — é a regra, não um acaso
  assert.equal(anelDeRisco(88, { min: 40, max: 100 }), "perigo");
  assert.equal(anelDeRisco(50, null), null, "sem peça minha, nada");
  // com UMA peça as duas réguas são a mesma, e a faixa do meio é a briga parelha
  const um = { min: 63, max: 63 };
  assert.equal(anelDeRisco(54, um), "comivel");
  assert.equal(anelDeRisco(63, um), null);
  assert.equal(anelDeRisco(73, um), "perigo");
});

test("a SETA DA PRESA: nada com comida na tela; senão a comível mais perto, da AOI ou do placar", () => {
  const eu = { x: 0, y: 0, r: 63 }, tela = { x0: -500, y0: -300, x1: 500, y1: 300 };
  const pequena = 50;   // < 63/1,15
  // comida NA TELA: o anel verde já está nela
  assert.equal(presaForaDaTela(eu, [{ x: 100, y: 0, r: pequena }], [], new Set(), tela), null);
  // fora da tela, pela AOI
  assert.deepEqual(presaForaDaTela(eu, [{ x: 800, y: 0, r: pequena }], [], new Set(), tela), { tipo: "presa", x: 800, y: 0, r: pequena });
  // pelo placar: só quem é comível por INTEIRO (√massa ≤ limite), e o mais perto
  const rows = [{ slot: 1, x: 3000, y: 0, mass: pequena * pequena }, { slot: 2, x: -900, y: 0, mass: pequena * pequena },
    { slot: 3, x: 600, y: 0, mass: 90 * 90 }, { slot: 9, x: 550, y: 0, mass: 100 }];
  const g = presaForaDaTela(eu, [], rows, new Set([9]), tela);
  assert.equal(g.x, -900, "o grande (slot 3) e o excluído (slot 9, eu) não contam");
  assert.equal(presaForaDaTela(eu, [], [{ slot: 1, x: 900, y: 0, mass: 70 * 70 }], new Set(), tela), null, "ninguém comível: nada");
  assert.equal(presaForaDaTela(null, [], rows, new Set(), tela), null);
});

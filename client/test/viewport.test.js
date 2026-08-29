// ── Classificação de aparelho: forma (data-mode) e entrada (data-pointer) ────
// `modeFor` é pura de propósito — a decisão que antes vivia colada em innerWidth/matchMedia agora dá para
// ser conferida numa tabela. node --test client/test/viewport.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { modeFor, pointerFor } from "../src/hooks/useViewportMode.js";

// aparelho, largura, altura, toque, modo esperado
const TABELA = [
  ["iPhone SE em pé",        375,  667, true,  "portrait"],
  ["iPhone SE deitado",      667,  375, true,  "landscape"],
  ["iPhone 14 em pé",        390,  844, true,  "portrait"],
  ["iPhone 14 deitado",      844,  390, true,  "landscape"],
  ["iPhone Pro Max em pé",   430,  932, true,  "portrait"],
  ["iPhone Pro Max deitado", 932,  430, true,  "landscape"],
  ["Galaxy S8 em pé",        360,  740, true,  "portrait"],
  ["iPad mini em pé",        744, 1133, true,  "tablet"],
  ["iPad mini deitado",     1133,  744, true,  "tablet"],
  ["iPad 10.9 em pé",        820, 1180, true,  "tablet"],
  ["iPad 10.9 deitado",     1180,  820, true,  "tablet"],
  ["iPad Pro em pé",        1024, 1366, true,  "tablet"],
  ["iPad Pro deitado",      1366, 1024, true,  "tablet"],
  ["Notebook",              1440,  900, false, "desktop"],
  ["Desktop",               1920, 1080, false, "desktop"],
  ["Ultrawide",             2560, 1080, false, "desktop"],
  ["Monitor com toque",     1920, 1080, true,  "desktop"],
  ["Janela estreita",        700,  900, false, "portrait"],
];

test("cada aparelho cai no modo certo", () => {
  for (const [nome, w, h, coarse, esperado] of TABELA)
    assert.equal(modeFor(w, h, coarse), esperado, `${nome} (${w}×${h}${coarse ? ", toque" : ""})`);
});

test("todo tablet é reconhecido como tablet nas DUAS posições", () => {
  // era o buraco: tela grande COM toque não passava em nenhum teste de celular e recebia o layout de desktop
  for (const [nome, w, h, coarse, esperado] of TABELA)
    if (nome.startsWith("iPad")) assert.equal(esperado, "tablet", nome);
});

test("histerese: ir e voltar pelo limiar não fica alternando", () => {
  // 700 é o limiar de celular em pé; com folga de 40 px, só sai de portrait acima de 740
  assert.equal(modeFor(700, 1000, false), "portrait");
  assert.equal(modeFor(720, 1000, false, "portrait"), "portrait", "com 20 px a mais continua portrait (folga)");
  assert.equal(modeFor(720, 1000, false, "desktop"), "desktop", "vindo de desktop, 720 ainda não vira portrait");
  assert.equal(modeFor(760, 1000, false, "portrait"), "desktop", "passou da folga: aí sim troca");
  // um pixel de arrasto no limiar não pode trocar o layout de ida e volta
  let m = "portrait";
  for (const w of [700, 701, 700, 702, 699, 701]) m = modeFor(w, 1000, false, m);
  assert.equal(m, "portrait", "arrastar a borda em cima do limiar não pode piscar o layout");
});

test("a entrada é independente do tamanho", () => {
  assert.equal(pointerFor(true), "coarse");
  assert.equal(pointerFor(false), "fine");
  // o mesmo tamanho com e sem toque dá formas diferentes, e é essa a intenção
  assert.equal(modeFor(1180, 820, true), "tablet");
  assert.equal(modeFor(1180, 820, false), "desktop");
});

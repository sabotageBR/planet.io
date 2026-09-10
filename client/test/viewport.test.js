// ── Classificação de aparelho: forma (data-mode) e entrada (data-pointer) ────
// `modeFor` é pura de propósito — a decisão que antes vivia colada em innerWidth/matchMedia agora dá para
// ser conferida numa tabela. node --test client/test/viewport.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { modeFor, pointerFor, ehCelular, ehBaixa } from "../src/hooks/useViewportMode.js";

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

// ── É CELULAR? ───────────────────────────────────────────────────────────────
// Quem some no telefone pergunta a `ehCelular`, e não a um matchMedia próprio. O caso que importa é o
// TABLET: `data-pointer="coarse"` casaria com ele, e um iPad tem 1180 px de largura — espaço de sobra
// para um painel de chat no canto. O que atrapalha a gameplay é a tela pequena, não o dedo.
test("celular é o telefone nas duas formas, e o tablet não é celular", () => {
  assert.equal(ehCelular("portrait"), true, "telefone em pé");
  assert.equal(ehCelular("landscape"), true, "telefone deitado");
  assert.equal(ehCelular("tablet"), false, "iPad tem largura para o chat");
  assert.equal(ehCelular("desktop"), false);
  // o store nasce sem modo até o primeiro `apply()` do hook: ausência não pode virar "é celular"
  assert.equal(ehCelular(null), false);
  assert.equal(ehCelular(undefined), false);
  // e casa com o que `modeFor` produz de verdade, para as duas não se separarem
  assert.equal(ehCelular(modeFor(390, 844, true)), true, "iPhone em pé");
  assert.equal(ehCelular(modeFor(844, 390, true)), true, "iPhone deitado");
  assert.equal(ehCelular(modeFor(1180, 820, true)), false, "iPad deitado");
});

// ── ALTURA ÚTIL: a terceira dimensão ────────────────────────────────────────────────────────────────
// Ela nasceu do frame de portal, que é um DESKTOP BAIXO: 960×540 e 1920×1080 são o MESMO `data-mode`, e é
// no primeiro que o rodapé de ação sai da dobra. Sem um atributo próprio não havia como o CSS distingui-los
// (e `@media` está fora: a sonda fixa atributo, não media query).
test("ehBaixa: o frame de portal é baixo; a tela cheia não é", () => {
  for (const [nome, h] of [["Poki laptop", 540], ["Poki desktop 16:9", 576], ["Portal 4:3", 600],
                           ["frame baixo", 480], ["Poki celular em pé", 640]])
    assert.equal(ehBaixa(h), true, `${nome} (${h} px) tem que acender data-h="short"`);
  for (const [nome, h] of [["iPhone SE em pé", 667], ["Galaxy S8 em pé", 740], ["iPhone 14 em pé", 844],
                           ["Notebook", 900], ["Desktop", 1080], ["iPad Pro em pé", 1366]])
    assert.equal(ehBaixa(h), false, `${nome} (${h} px) NÃO é tela baixa`);
});

test("ehBaixa: o celular DEITADO também é baixo — e isso é decisão, não descuido", () => {
  // 375 e 390 são iPhone SE/14 deitados. Eles têm o mesmo problema de altura que o frame de portal, então
  // acendem os dois atributos. Quem precisar tratar o caso combinado escreve `[data-h][data-mode]`, que
  // ganha por especificidade — empatar com as regras de `landscape` é que seria o defeito.
  for (const h of [375, 390]) assert.equal(ehBaixa(h), true, `celular deitado (${h} px) é tela baixa`);
});

test("ehBaixa: tem histerese, como o resto do arquivo", () => {
  // Sem folga, arrastar a borda da janela por cima de 640 px repintaria o layout a cada pixel — é o mesmo
  // argumento do BAND de `modeFor`, e o mesmo número.
  assert.equal(ehBaixa(660, false), false, "entrando: 660 não acende");
  assert.equal(ehBaixa(660, true), true, "mas quem JÁ estava em short só sai depois da folga");
  assert.equal(ehBaixa(681, true), false, "passou da folga (640+40), sai");
  assert.equal(ehBaixa(640, false), true, "o limiar em si acende");
});

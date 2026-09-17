// ── Analógico virtual: por que o alvo tem que ir LONGE quando o planeta está dividido ────────
// `joyTarget` é pura de propósito (o resto de Joystick.js é DOM). Ela existe porque a rampa do motor é medida
// DE CADA PEÇA (shared/src/physics/integrate.js) e o alvo é UM só para todas (world.js/predict.js): com o
// alvo a 32 px do centróide e as peças a ~390 px dele depois de um split (SPLIT.DIST=780), a peça de lado
// entrega 8% da velocidade na direção comandada e gasta o resto empurrando a irmã — e ZERO quando o eixo do
// split está alinhado ao rumo. Era o "no celular, dividido, o movimento fica extremamente lento". No mouse
// nunca apareceu porque o cursor já mora a centenas de px. node --test client/test/joystick.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { joyTarget, createJoystick } from "../src/game/input/Joystick.js";
import { createPointer } from "../src/game/input/Pointer.js";
import { SPEED, JOY, WORLD } from "@warspace/shared";

const C = 4800;   // centro do mundo: longe de qualquer parede, para o clamp não entrar na conta
/** Quanto da velocidade de uma peça em (px,py) vai na direção comandada (1 = tudo; é o cosseno do erro). */
const util = (px, py, t, ux, uy) => { const dx = t.x - px, dy = t.y - py, l = Math.hypot(dx, dy) || 1; return dx / l * ux + dy / l * uy; };
const novo = () => ({ x: 0, y: 0 });
/** Igualdade de float: `4800 + 6.4 - 4800` dá 6.399999999999636, e isso não é o que o teste está medindo. */
const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg} (${a} ≠ ${b})`);

test("peça única: a distância é EXATAMENTE SPEED.RAMP·k — o analógico continua analógico", () => {
  for (const k of [.2, .5, 1]) {
    const t = joyTarget(C, C, 1, 0, k, 0, novo());
    perto(t.x - C, SPEED.RAMP * k, `k=${k}: ${SPEED.RAMP}·k px à frente, nem um a mais`);
    perto(t.y, C, "e nada no outro eixo");
  }
});

test("solto (k=0) é alvo EM CIMA do centróide, mesmo dividido", () => {
  const t = joyTarget(C, C, 1, 0, 0, 390, novo());
  assert.equal(t.x, C);
  assert.equal(t.y, C, "espalhamento não projeta nada sem polegar: solto é parado (e as peças reagrupam)");
});

test("dividido: cada peça recebe praticamente o MESMO rumo — era 8%", () => {
  const spread = 390, ux = 1, uy = 0;   // comando para a direita, peças lado a lado na perpendicular
  const t = joyTarget(C, C, ux, uy, 1, spread, novo());
  const a = util(C, C - spread, t, ux, uy), b = util(C, C + spread, t, ux, uy);
  assert.ok(a > .98 && b > .98, `cada peça entrega ${(a * 100).toFixed(1)}% da velocidade comandada`);
  const antes = util(C, C - spread, { x: C + SPEED.RAMP, y: C }, ux, uy);
  assert.ok(antes < .1, `o alvo de ${SPEED.RAMP} px, como era, entregava ${(antes * 100).toFixed(1)}% — é o bug`);
});

test("dividido: o alvo passa da peça mais ADIANTADA (senão ela anda para TRÁS a vmax cheia)", () => {
  const spread = 390, t = joyTarget(C, C, 1, 0, 1, spread, novo());
  assert.ok(t.x - C > spread, "d > spread para qualquer k > 0: ninguém recebe um vetor apontando para trás");
  // o caso que hoje dá exatamente zero: as duas peças no EIXO do rumo, correndo uma contra a outra
  const frente = util(C + spread, C, t, 1, 0), tras = util(C - spread, C, t, 1, 0);
  assert.ok(frente > .99 && tras > .99, "as duas andam para a frente, não uma contra a outra");
  assert.ok(util(C + spread, C, { x: C + SPEED.RAMP, y: C }, 1, 0) < 0, "…e antes a da frente andava para trás");
});

test("k pequeno também escapa: a proporcionalidade se perde dividido, o movimento não", () => {
  const spread = 390, t = joyTarget(C, C, 1, 0, .2, spread, novo());
  assert.ok(t.x - C > spread, "curso curto do polegar ainda projeta além do cacho");
  assert.ok(util(C, C - spread, t, 1, 0) > .98, "e a direção continua sendo a comandada");
});

test("na borda o alvo ENCURTA, mas a direção do polegar não torce", () => {
  const cx = WORLD.w - 200, cy = C, ux = .6, uy = .8;   // colado no muro da direita, apontando para baixo-direita
  const t = joyTarget(cx, cy, ux, uy, 1, 390, novo());
  assert.ok(t.x >= 0 && t.x <= WORLD.w && t.y >= 0 && t.y <= WORLD.h, "o alvo cabe no mundo: fora dele qPos e World.setTarget saturam POR EIXO");
  assert.ok(Math.abs((t.x - cx) * uy - (t.y - cy) * ux) < 1e-9, "produto vetorial ~0: mesma reta do polegar");
  assert.ok(Math.abs(t.x - WORLD.w) < 1e-9, "e para exatamente na parede — o corte é do RAIO, não do eixo");
  const d = SPEED.RAMP + 390 * JOY.SPREAD_K;   // o que o corte POR EIXO faria com o mesmo alvo
  const px = Math.min(WORLD.w, cx + ux * d), py = Math.min(WORLD.h, cy + uy * d);
  assert.ok(Math.abs((px - cx) * uy - (py - cy) * ux) > 100, "…e o corte por eixo mandava o jogador para outro lado");
});

test("varredura: nunca sai do mundo, nunca muda de direção, nunca inverte", () => {
  for (let i = 0; i < 64; i++) {
    const a = i / 64 * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a);
    for (const [cx, cy] of [[100, 100], [WORLD.w - 100, 120], [C, C], [WORLD.w - 40, WORLD.h - 40]]) {
      const t = joyTarget(cx, cy, ux, uy, 1, 600, novo()), dx = t.x - cx, dy = t.y - cy;
      assert.ok(t.x >= -1e-9 && t.x <= WORLD.w + 1e-9 && t.y >= -1e-9 && t.y <= WORLD.h + 1e-9, "dentro do mundo");
      assert.ok(Math.abs(dx * uy - dy * ux) < 1e-6, "mesma reta");
      assert.ok(dx * ux + dy * uy >= -1e-9, "o corte encurta, não inverte");
    }
  }
});

// ── O DEDO QUE DIRIGE NÃO PODE SER ESCONDIDO DA JANELA ───────────────────────────
// O SDK da Poki registra interação com `window.addEventListener("pointerdown",…)` — na BOLHA —, e o relator do
// Player Fit Test congela a duração do jogador depois de 60 s sem um toque que ele veja (o trecho está em
// `scripts/poki-stub.js`). O `down` do direcional dava `stopPropagation()` em captura: no celular o SDK nunca
// via o toque que dirige o planeta, e a média de TODA rodada parava em ~2m10. Hoje o direcional MARCA o evento
// e o Pointer ignora o marcado. O que este bloco trava são os DOIS sentidos: o evento segue para a janela, e
// o jogo continua se comportando como quando ele era parado.
/** Um alvo de eventos de mentira: guarda os handlers por tipo+fase e os dispara na ordem do DOM (captura antes). */
function alvoFalso() {
  const hs = [];
  return { hs,
    addEventListener(t, h, cap) { hs.push({ t, h, cap: !!(cap === true || (cap && cap.capture)) }); },
    removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 800 }; },
    setPointerCapture() {},
    /** Dispara como o navegador: captura, depois bolha — e PARA se alguém pedir. Devolve o evento. */
    dispara(t, e) { e.parou = false; e.stopPropagation = () => { e.parou = true; }; e.preventDefault = () => {};
      for (const fase of [true, false]) for (const x of hs) if (x.t === t && x.cap === fase && !e.parou) x.h(e);
      return e; } };
}
const dedo = (x, y, id = 1) => ({ pointerType: "touch", pointerId: id, clientX: x, clientY: y, button: 0 });

test("o toque do volante NÃO é parado: ele segue para a janela (onde o SDK do portal escuta), MARCADO", () => {
  const cv = alvoFalso(), joy = createJoystick(cv); joy.setEnabled(true);
  const d = cv.dispara("pointerdown", dedo(300, 400));
  assert.equal(d.parou, false, "`stopPropagation` no down esconde o toque do SDK: o relógio do Fit Test congela para quem só dirige");
  assert.equal(d.__volante, true, "a marca é o que tira o dedo do caminho do Pointer");
  const m = cv.dispara("pointermove", dedo(360, 400));
  assert.equal(m.parou, false); assert.equal(m.__volante, true);
  assert.equal(joy.state.tem, true, "o arrasto continua virando rumo");
  assert.ok(joy.state.dx > .9, "…para a direita, que é para onde o dedo foi");
  const u = cv.dispara("pointerup", dedo(360, 400));
  assert.equal(u.parou, false); assert.equal(u.__volante, true);
  assert.equal(joy.state.tem, true, "soltar NÃO para: o rumo fica travado");
});

test("o Pointer não vê o dedo do volante — e continua vendo o da MIRA e o mouse", () => {
  const cv = alvoFalso(), botoes = [];
  const joy = createJoystick(cv); joy.setEnabled(true);           // captura: registrado antes, roda antes
  const ptr = createPointer(cv, { onButton: (b, fase, tipo) => botoes.push(fase + ":" + tipo) });
  cv.dispara("pointerdown", dedo(300, 400, 1));
  assert.deepEqual(botoes, [], "o dedo que dirige não é clique de jogo");
  assert.equal(ptr.state.active, false, "…nem alvo do ponteiro: quem dirige é o rumo do direcional");
  // o 2º dedo é o da MIRA: o direcional não o marca, e o Pointer TEM de vê-lo
  const mira = cv.dispara("pointerdown", dedo(100, 200, 2));
  assert.equal(mira.__volante, undefined);
  assert.deepEqual(botoes, ["down:touch"]);
  assert.equal(ptr.state.active, true);
  cv.dispara("pointerup", dedo(100, 200, 2));
  cv.dispara("pointerup", dedo(300, 400, 1));
  assert.deepEqual(botoes, ["down:touch", "up:touch"], "o `up` do volante também passa marcado, sem virar clique");
});

test("no MOUSE o direcional não toca no evento: nem marca, nem para", () => {
  const cv = alvoFalso(), botoes = [];
  const joy = createJoystick(cv); joy.setEnabled(true);
  createPointer(cv, { onButton: (b, fase, tipo) => botoes.push(fase + ":" + tipo) });
  const e = cv.dispara("pointerdown", { pointerType: "mouse", pointerId: 9, clientX: 50, clientY: 50, button: 0 });
  assert.equal(e.__volante, undefined); assert.equal(e.parou, false);
  assert.deepEqual(botoes, ["down:mouse"], "o clique do mouse é o tiro — tem de chegar ao Pointer");
  assert.equal(joy.state.tem, false);
});

// ── Roda do mouse → passos de zoom: a normalização que quebra só em UM navegador ─────────────
// `stepsFromWheel` é pura de propósito. Ela existe porque `deltaY` não é comparável entre aparelhos: o
// Chrome manda ±100 por entalhe, o Firefox manda ±3 com `deltaMode:1` (linhas) e um trackpad manda dezenas
// de eventos de 1–4 px por gesto. Sem normalizar, o zoom fica lento no Firefox e histérico no trackpad —
// e nenhum dos dois aparece na máquina de quem escreveu o código. node --test client/test/wheel.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { stepsFromWheel } from "../src/game/input/Wheel.js";
import { ZOOM } from "@warspace/shared";

const PX = ZOOM.WHEEL_PX;

test("um entalhe de mouse é um passo, nos dois sentidos", () => {
  assert.equal(stepsFromWheel(100, 0, 0, PX).steps, 1, "Chrome: deltaY 100 = um entalhe");
  assert.equal(stepsFromWheel(-100, 0, 0, PX).steps, -1, "e para o outro lado");
  assert.equal(stepsFromWheel(120, 0, 0, PX).steps, 1, "Firefox em modo pixel manda 120");
});

test("deltaMode é NORMALIZADO: linha e página valem o que valem", () => {
  // Firefox rola em LINHAS: 3 linhas por entalhe. Sem a conversão, `deltaY:3` não alcançaria o limiar
  // NUNCA — a roda simplesmente não faria nada, e só naquele navegador.
  assert.equal(stepsFromWheel(3, 1, 0, PX).steps, 1, "3 linhas = um entalhe");
  assert.equal(stepsFromWheel(1, 1, 0, PX).steps, 0, "uma linha sozinha ainda não fecha um passo");
  // e uma PÁGINA não pode varrer a faixa inteira de uma vez
  assert.equal(stepsFromWheel(9, 2, 0, PX).steps, ZOOM.MAX_STEPS, "o teto por evento segura o deltaMode de página");
});

test("trackpad: dezenas de eventos minúsculos viram poucos passos, e o resto é guardado", () => {
  let acc = 0, total = 0;
  for (let i = 0; i < 10; i++) { const r = stepsFromWheel(40, 0, acc, PX); acc = r.acc; total += r.steps; }
  assert.equal(total, 4, "400 px de deslize = 4 passos, não 10");
  assert.ok(Math.abs(acc) < PX, "e o que sobrou fica no acumulador, sem virar passo");
});

test("o acumulador tem teto: um gesto interrompido não guarda impulso para sempre", () => {
  const r = stepsFromWheel(1, 0, 0, PX);
  assert.equal(r.steps, 0);
  let acc = 0;
  for (let i = 0; i < 50; i++) acc = stepsFromWheel(1, 0, acc, PX).acc;   // 50 eventos de 1 px, nenhum passo
  assert.ok(Math.abs(acc) <= PX * 2, "o acumulado não cresce sem limite");
});

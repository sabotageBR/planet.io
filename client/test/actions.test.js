// ── O TIRO: CLIQUE RÁPIDO É TELEGUIADO, SEGURAR É MIRADO ─────────────────────
// `createActions` não toca DOM (recebe `input`/`prefs`/`ammo`/`canAct`/`dedo` injetados e só usa
// `setTimeout`), então dá para exercitá-la inteira sem jsdom — com os timers falsos do `node:test`.
//
// O que este arquivo trava é o limiar da mira, e o defeito é assimétrico: no MOUSE 160 ms é um "segurar"
// deliberado; no DEDO está dentro da cauda de um toque de polegar, e armar sem querer custa DUAS coisas
// (o míssil sai reto em vez de teleguiado, e o segundo dedo vai para a mira em vez do volante).
// Rodar: node --test client/test/actions.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { INPUT_FLAG, MISSILE } from "@warspace/shared";
import { createActions } from "../src/game/input/actions.js";

/** Bancada: um `input` que só anota, e os ganchos que o motor passaria. */
const banca = ({ dedo = false, ammo = 3 } = {}) => {
  const flags = [], aims = [];
  const a = createActions({
    input: { press: f => flags.push(f), setHold() {} },
    prefs: () => ({}), ammo: () => ammo, canAct: () => true, dedo: () => dedo,
    onAim: on => aims.push(on),
  });
  return { a, flags, aims };
};
const FIRE = INPUT_FLAG.FIRE, MIRADO = INPUT_FLAG.FIRE | INPUT_FLAG.AIM;

test("clique RÁPIDO manda FIRE puro — o teleguiado, que acerta em qualquer canto do mapa", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { a, flags, aims } = banca();
  a.act("fire", "down"); t.mock.timers.tick(100); a.act("fire", "up");
  assert.deepEqual(flags, [FIRE]);
  assert.deepEqual(aims, [], "e a reta de mira nem chega a aparecer");
});

test("SEGURAR no mouse arma a mira", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { a, flags, aims } = banca();
  a.act("fire", "down"); t.mock.timers.tick(MISSILE.AIM_MS + 5); a.act("fire", "up");
  assert.deepEqual(flags, [MIRADO]);
  assert.deepEqual(aims, [true, false]);
});

test("O DEFEITO QUE ISTO FECHA: 200 ms de polegar NÃO arma a mira", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { a, flags, aims } = banca({ dedo: true });
  a.act("fire", "down"); t.mock.timers.tick(200); a.act("fire", "up");
  assert.deepEqual(flags, [FIRE], "no dedo, 200 ms ainda é um TOQUE — o tiro continua teleguiado");
  assert.deepEqual(aims, [], "e o volante não é roubado (onAim → joy.setAiming)");
});

test("mas segurar DE VERDADE no dedo continua mirando", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { a, flags } = banca({ dedo: true });
  a.act("fire", "down"); t.mock.timers.tick(MISSILE.AIM_MS_TOUCH + 5); a.act("fire", "up");
  assert.deepEqual(flags, [MIRADO], "quem já aprendeu a mirar não perde a funcionalidade");
});

test("o limiar é lido A CADA CHAMADA, nunca capturado na carga do módulo", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { a, flags } = banca({ dedo: true });
  const antes = MISSILE.AIM_MS_TOUCH;
  try {
    MISSILE.AIM_MS_TOUCH = 900;                       // o painel mexeu (é tunable 'wire')
    a.act("fire", "down"); t.mock.timers.tick(500); a.act("fire", "up");
    assert.deepEqual(flags, [FIRE], "com o limiar novo, 500 ms ainda é toque");
  } finally { MISSILE.AIM_MS_TOUCH = antes; }
});

test("o limiar do TOQUE é maior que o do mouse — invertê-los devolve o defeito", () => {
  assert.ok(MISSILE.AIM_MS_TOUCH > MISSILE.AIM_MS,
    "é a única relação entre os dois que importa, e as faixas dos tunables a garantem");
});

test("sem munição o botão NUNCA ejeta massa — só avisa", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { a, flags } = banca({ ammo: 0 });
  a.act("fire", "down"); t.mock.timers.tick(1000); a.act("fire", "up");
  assert.deepEqual(flags, [], "ejetar é EXCLUSIVO da tecla W");
});

test("no dedo, o toque no CANVAS não atira (quem atira é o botão do HUD)", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { a, flags } = banca({ dedo: true });
  a.button(0, "down", "touch"); t.mock.timers.tick(1000); a.button(0, "up", "touch");
  assert.deepEqual(flags, [], "é o que liberou o gesto de tocar-para-dirigir");
});

test("`reset()` larga a mira: o menu de pausa pode engolir o `up`", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { a, aims } = banca();
  a.act("fire", "down"); t.mock.timers.tick(MISSILE.AIM_MS + 5);
  a.reset();
  assert.deepEqual(aims, [true, false], "sem isto a reta fica na tela e o W preso");
});

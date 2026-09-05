// ── A MÁQUINA DO RUMO (o direcional de toque, modelo agar.io) ─────────────────
// `createJoystick` é DOM e não há jsdom no projeto, então quem é exercitado aqui é a máquina pura que ele
// embrulha — o mesmo arranjo de `joyTarget` (client/test/joystick.test.js), `game/quality.js` e
// `ui/roundClock.js`. E ela é onde moram as quatro regras do controle novo, então o que este arquivo trava
// é COMPORTAMENTO de jogo, não aritmética: soltar não para, tocar não interrompe, e travado é a todo vapor.
// A curva `raw → k` nunca teve um único teste enquanto viveu dentro dos handlers.
// Rodar: node --test client/test/rumo.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { createRumo, cursoK } from "../src/game/input/Joystick.js";

// px de TELA, derivados de RAIO=52, MORTO=.10 e PLATO=.5 (locais do módulo, ver Joystick.js)
const RAIO = 52, DEAD = 5.2, PLATO = 26;

test("cursoK: zona morta, rampa proporcional e platô", () => {
  assert.equal(cursoK(0), 0);
  assert.equal(cursoK(.09), 0, "abaixo da zona morta o dedo está parado");
  assert.equal(cursoK(.1), 0, "na fronteira a rampa começa em zero");
  assert.ok(Math.abs(cursoK(.3) - .5) < 1e-9, "meio da rampa = meia velocidade: (.3-.1)/(.5-.1)");
  assert.equal(cursoK(.5), 1, "o platô satura na METADE do curso — sobra meio raio de margem para o polegar");
  assert.equal(cursoK(1), 1);
});

test("soltar MANTÉM o rumo e vai a velocidade máxima", () => {
  const r = createRumo();
  r.down(100, 100); r.move(100 + PLATO * .55, 100);   // ~55% do platô: k proporcional, não 1
  const k0 = r.state.k;
  assert.ok(k0 > 0 && k0 < 1, "com o dedo no chão o curso ainda gradua a velocidade");
  r.up();
  assert.equal(r.state.on, false, "o dedo saiu");
  assert.equal(r.state.tem, true, "…mas o rumo ficou: soltar NÃO para o planeta");
  assert.equal(r.state.dx, 1); assert.equal(r.state.dy, 0);
  assert.equal(r.state.k, 1, "travado é sempre a todo vapor — um rumo lento sem nada na tela explicando seria pior");
});

test("tocar de novo NÃO zera o rumo (nada de solavanco de parada no toque)", () => {
  const r = createRumo();
  r.down(0, 0); r.move(0, RAIO); r.up();               // rumo para baixo, travado
  r.down(500, 500);                                     // encostou noutro canto, ainda sem arrastar
  assert.equal(r.state.dy, 1, "a direção continua a de antes");
  assert.equal(r.state.k, 1, "…e a velocidade também: o planeta não para no instante do toque");
  assert.equal(r.state.tem, true);
});

test("micro-arrasto (zona morta) não substitui o rumo travado", () => {
  const r = createRumo();
  r.down(0, 0); r.move(RAIO, 0); r.up();                // rumo para a direita
  r.down(300, 300); r.move(300, 300 + DEAD * .8);       // o dedo pousando treme uns pixels
  assert.equal(r.state.dx, 1, "o ruído do dedo pousando não vira rumo novo");
  assert.equal(r.state.dy, 0);
});

test("arrastar de verdade SUBSTITUI o rumo, e a direção é unitária", () => {
  const r = createRumo();
  r.down(0, 0); r.move(RAIO, 0); r.up();
  r.down(10, 10); r.move(10 - 30, 10 + 40);             // 3-4-5: 50 px na diagonal
  assert.ok(Math.abs(r.state.dx + .6) < 1e-9);
  assert.ok(Math.abs(r.state.dy - .8) < 1e-9);
  assert.ok(Math.abs(Math.hypot(r.state.dx, r.state.dy) - 1) < 1e-9, "unitária: joyTarget multiplica pela distância");
});

test("sem NUNCA ter havido rumo, soltar não inventa velocidade", () => {
  const r = createRumo();
  r.down(50, 50); r.up();                               // tocou e soltou sem arrastar, na primeira vida
  assert.equal(r.state.tem, false);
  assert.equal(r.state.k, 0, "k=0 leva joyTarget a devolver o próprio centróide, ou seja o planeta parado");
});

test("reset é a ÚNICA coisa que devolve o planeta ao estado parado", () => {
  const r = createRumo();
  r.down(0, 0); r.move(RAIO, 0); r.up();
  assert.equal(r.state.tem, true);
  r.reset();
  assert.deepEqual(r.state, { on: false, tem: false, dx: 0, dy: 0, k: 0 },
    "nascer, renascer e desligar o controle passam por aqui — não existe gesto de parada em partida");
});

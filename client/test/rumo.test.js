// ── A MÁQUINA DO RUMO (o direcional de toque, modelo agar.io) ─────────────────
// `createJoystick` é DOM e não há jsdom no projeto, então quem é exercitado aqui é a máquina pura que ele
// embrulha — o mesmo arranjo de `joyTarget` (client/test/joystick.test.js), `game/quality.js` e
// `ui/roundClock.js`. E ela é onde moram as cinco regras do controle novo, então o que este arquivo trava
// é COMPORTAMENTO de jogo, não aritmética: soltar não para, tocar não interrompe, e travado é a todo vapor.
// A curva `raw → k` nunca teve um único teste enquanto viveu dentro dos handlers.
// Rodar: node --test client/test/rumo.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { createRumo, cursoK, toqueDir } from "../src/game/input/Joystick.js";

// px de TELA, derivados de RAIO=52, MORTO=.10 e PLATO=.5 (locais do módulo, ver Joystick.js)
const RAIO = 52, DEAD = 5.2, PLATO = 26, TOQUE_MIN = 40;
// O "planeta" nos testes de toque: `up(cx,cy)` recebe o centro da câmera em px de tela.
const CX = 200, CY = 400;

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

test("soltar SEM o centro da câmera não inventa rumo — é o contrato de release()", () => {
  const r = createRumo();
  r.down(50, 50); r.up();                               // a pinça e a pausa largam o dedo por aqui
  assert.equal(r.state.tem, false);
  assert.equal(r.state.k, 0, "k=0 leva joyTarget a devolver o próprio centróide, ou seja o planeta parado");
});

// ── REGRA 5: tocar sem arrastar também dirige ────────────────────────────────
// Antes disto um toque limpo não produzia NADA: `tem` só era escrito no `move`, e só passando a zona morta.
// Como a regra 2 não desenha nada sob o dedo, a tela ficava inerte — o jogador tocava, tocava de novo, e
// não havia nem movimento nem retorno de que o jogo tinha visto o dedo. Visto em teste de leitura de tela.

test("toqueDir: unitária acima do mínimo, null em cima do próprio planeta", () => {
  const t = toqueDir(0, -90);
  assert.deepEqual(t, { dx: 0, dy: -1 }, "tocar acima do planeta é ir para cima");
  assert.equal(toqueDir(TOQUE_MIN - 1, 0), null, "colado no planeta o toque não diz para onde ir");
  assert.ok(toqueDir(TOQUE_MIN, 0), "na fronteira já vale");
  const d = toqueDir(-30, 40);
  assert.ok(Math.abs(Math.hypot(d.dx, d.dy) - 1) < 1e-9, "unitária: joyTarget multiplica pela distância");
});

test("TOQUE sem arrasto vira rumo, do planeta para o dedo, a todo vapor", () => {
  const r = createRumo();
  r.down(CX, CY - 120); r.up(CX, CY);                   // tocou 120 px ACIMA do planeta e soltou
  assert.equal(r.state.tem, true, "o toque produz rumo: era este o gesto que não fazia nada");
  assert.equal(r.state.dx, 0); assert.equal(r.state.dy, -1);
  assert.equal(r.state.k, 1, "travado é sempre a todo vapor (regra 4)");
});

test("toque EM CIMA do planeta não muda nada — é o análogo da zona morta", () => {
  const r = createRumo();
  r.down(0, 0); r.move(RAIO, 0); r.up(CX, CY);          // rumo para a direita
  r.down(CX + 10, CY + 10); r.up(CX, CY);               // toque a 14 px do planeta
  assert.equal(r.state.dx, 1, "a direção anterior fica de pé");
  assert.equal(r.state.dy, 0);
});

test("um TOQUE troca o rumo travado (é assim que se muda de direção sem arrastar)", () => {
  const r = createRumo();
  r.down(0, 0); r.move(RAIO, 0); r.up(CX, CY);          // rumo para a direita
  r.down(CX, CY + 200); r.up(CX, CY);                   // toca ABAIXO do planeta
  assert.equal(r.state.dy, 1, "o rumo passa a ser o do toque");
  assert.equal(r.state.dx, 0);
});

test("ARRASTAR ganha do toque: quem passou da zona morta não é lido como toque", () => {
  const r = createRumo();
  r.down(CX, CY - 120);                                 // pousa acima do planeta…
  r.move(CX - RAIO, CY - 120);                          // …mas arrasta para a ESQUERDA
  r.up(CX, CY);
  assert.equal(r.state.dx, -1, "vale o arrasto, não a posição do dedo em relação ao planeta");
  assert.equal(r.state.dy, 0);
});

test("reset é a ÚNICA coisa que devolve o planeta ao estado parado", () => {
  const r = createRumo();
  r.down(0, 0); r.move(RAIO, 0); r.up(CX, CY);
  assert.equal(r.state.tem, true);
  r.reset();
  assert.deepEqual(r.state, { on: false, tem: false, dx: 0, dy: 0, k: 0 },
    "nascer, renascer e desligar o controle passam por aqui — não existe gesto de parada em partida");
});

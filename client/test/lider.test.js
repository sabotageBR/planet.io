// ── QUEM LEVA A COROA ──────────────────────────────────────────────────────────
// `proximoLider` decide de quem é a coroa do maior planeta do mapa, a partir do LEADERBOARD que já chega a
// 2 Hz com todos os vivos. O que ela existe para resolver não é "quem é o maior" — isso o servidor já
// mandou ordenado — é o PISCA: dois gigantes dentro da precisão um do outro trocam de primeiro a cada
// amostra, e sem folga a coroa alternaria entre os dois meia vez por segundo, justamente no duelo em que
// os dois estão na tela.
import { test } from "node:test";
import assert from "node:assert/strict";
import { proximoLider } from "../src/game/state/WorldView.js";

const lb = (...pares) => pares.map(([slot, mass]) => ({ slot, mass }));

test("coroa: sem ninguém vivo, ninguém usa", () => {
  assert.equal(proximoLider(-1, []), -1);
  assert.equal(proximoLider(7, []), -1, "líder que sumiu da lista perde a coroa na hora");
  assert.equal(proximoLider(-1, null), -1);
});

test("coroa: o primeiro maior a aparecer leva", () => {
  assert.equal(proximoLider(-1, lb([3, 5000], [1, 4000])), 3);
});

test("coroa: quem já a tem NÃO a perde por uma diferença pequena", () => {
  // 5100 contra 5000 é 2% exatos: não passa da folga, e a coroa fica onde está.
  assert.equal(proximoLider(3, lb([1, 5100], [3, 5000])), 3, "1% de vantagem não tira a coroa");
  assert.equal(proximoLider(3, lb([1, 5100], [3, 5000]), 1.02), 3, "nem 2% exatos (é `>`, não `>=`)");
});

test("coroa: uma vantagem de verdade troca o dono", () => {
  assert.equal(proximoLider(3, lb([1, 6000], [3, 5000])), 1, "20% à frente leva a coroa");
});

test("coroa: o líder que MORRE entrega na hora, sem esperar folga nenhuma", () => {
  // O slot 3 sumiu da lista: não há `dono` para segurar a coroa, e o maior vivo assume mesmo estando
  // com menos massa do que o morto tinha.
  assert.equal(proximoLider(3, lb([1, 900], [5, 800])), 1);
});

test("coroa: sem histerese ela alternaria — é o defeito que a folga existe para fechar", () => {
  // Um duelo apertado como ele chega de verdade: o servidor manda 2 amostras por segundo e os dois trocam
  // de topo a cada uma, por 0,2% de massa. A prova é a SEQUÊNCIA de donos, não o valor final.
  const a = lb([1, 5010], [3, 5000]), b = lb([3, 5020], [1, 5010]);
  const corrida = keep => { let dono = 3; return Array.from({ length: 6 },
    (_, i) => (dono = proximoLider(dono, i % 2 ? b : a, keep))); };

  assert.deepEqual(corrida(1.02), [3, 3, 3, 3, 3, 3],
    "com folga a coroa não sai do lugar durante o empate");
  assert.deepEqual(corrida(1), [1, 3, 1, 3, 1, 3],
    "sem folga ela troca de planeta A CADA AMOSTRA — 3 vezes em 3 segundos, que é o pisca");
});

// ── PARA ONDE O BOOT VAI (state/entrada.js) ──────────────────────────────────
// O que este arquivo trava é o INVARIANTE do pacote de portal: **nenhum caminho pode terminar num menu**,
// porque no pacote o menu não está montado — e um `go("entry")` ali não dá erro nenhum, só deixa o jogador
// olhando um shell vazio. É o tipo de defeito que nenhum teste de componente pega e que o histograma do
// Player Fit pega como "saiu no primeiro minuto".
// Pura pelo mesmo motivo de `game/quality.js` e `ui/deadClock.js`: não há jsdom no projeto.
// Rodar: node --test client/test/entrada.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { destinoDoBoot, destinoDaSaida } from "../src/state/entrada.js";

test("no pacote, o boot sem querystring termina na ARENA", () => {
  assert.deepEqual(destinoDoBoot({ semMenu: true }), { tipo: "jogar" });
});

test("no site, o boot sem querystring continua caindo no atalho de desenvolvimento", () => {
  assert.deepEqual(destinoDoBoot({ semMenu: false }), { tipo: "dev" });
});

test("o CONVITE ganha do boot direto — senão o link do amigo termina numa sala qualquer", () => {
  assert.deepEqual(destinoDoBoot({ semMenu: true, sala: "1ABC" }), { tipo: "sala", code: "1ABC" });
  assert.deepEqual(destinoDoBoot({ semMenu: true, party: "XY12" }), { tipo: "party", code: "XY12" });
  assert.deepEqual(destinoDoBoot({ semMenu: true, sala: "1ABC", assistir: true }), { tipo: "spec", code: "1ABC" });
});

test("a equipe ganha até da sala: quem chegou por ?party= vai para o lobby do amigo", () => {
  assert.equal(destinoDoBoot({ semMenu: true, party: "XY12", sala: "1ABC" }).tipo, "party");
});

test("e os quatro ramos valem igual no site", () => {
  assert.deepEqual(destinoDoBoot({ semMenu: false, sala: "1ABC" }), { tipo: "sala", code: "1ABC" });
  assert.deepEqual(destinoDoBoot({ semMenu: false, sala: "1ABC", assistir: true }), { tipo: "spec", code: "1ABC" });
});

test("`assistir` sozinho não vale nada: sem sala não há o que assistir", () => {
  assert.deepEqual(destinoDoBoot({ semMenu: true, assistir: true }), { tipo: "jogar" });
});

test("SAIR DA PARTIDA: no pacote é a tela de MODOS, no site é o lobby", () => {
  assert.deepEqual(destinoDaSaida(true), { tipo: "tela", tela: "modes" });
  assert.deepEqual(destinoDaSaida(false), { tipo: "tela", tela: "lobby" });
});

test("SAIR NO PACOTE NUNCA RE-ENTRA, e nunca cai na tela inicial", () => {
  // Isto já foi `{tipo:'jogar'}` — "leave the match" reiniciava a partida em vez de sair dela, e como a
  // tela de Modos é o ÚNICO lugar do cliente que oferece o Battle Royale, o modo inteiro ficou
  // inalcançável no pacote. E `entry` continua proibida: o componente nem é montado (`App.jsx`), então
  // ir para lá é um shell VAZIO. As duas metades são o teste.
  const d = destinoDaSaida(true);
  assert.notEqual(d.tipo, "jogar");
  assert.notEqual(d.tela, "entry");
});

test("`jogar` NUNCA carrega modo — quem chama crava MODE.FREE", () => {
  // Herdar `gameMode` deixaria um Battle Royale de uma visita anterior decidir a partida de ESTREIA de
  // quem chegou de um portal — e lá a estreia é um lobby de espera, o oposto do boot direto.
  const d = destinoDoBoot({ semMenu: true });
  assert.equal(Object.prototype.hasOwnProperty.call(d, "mode"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(d, "teamSize"), false);
});

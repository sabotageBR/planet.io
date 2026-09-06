// ── O RELÓGIO DA SESSÃO DO PORTAL ─────────────────────────────────────────────
// `passoSessao` é a conta que a Poki lê. O funil anterior media a VIDA e por isso o painel deles
// dizia "saiu em segundos" sobre quem estava na sala há dez minutos; o que este teste trava é o que
// separa uma coisa da outra — o tempo é da SESSÃO, corre enquanto o jogador está retido (partida,
// tela de morte, pódio), para quando ele volta ao menu, e cada marco sai UMA vez.
// node --test client/test/portal-sessao.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { passoSessao, MARCOS, SESSAO0 } from "../src/portal/sessao.js";

const S = n => n * 1000;

test("os marcos são os combinados, em ordem crescente", () => {
  assert.deepEqual(MARCOS, [60, 180, 300]);
  assert.deepEqual([...MARCOS].sort((a, b) => a - b), MARCOS);
});

test("parado no menu, o relógio não anda e nada vence", () => {
  let est = SESSAO0;
  for (const t of [0, S(60), S(600), S(3600)]) {
    const r = passoSessao(est, false, t); est = r.est;
    assert.deepEqual(r.marcos, [], `t=${t}`);
    assert.equal(r.emMs, null);          // fora da sala não se agenda nada
    assert.equal(est.acum, 0);
  }
});

test("retido, cada marco sai uma vez e na hora certa", () => {
  let est = passoSessao(SESSAO0, true, 0).est;
  assert.equal(passoSessao(est, true, 0).emMs, S(60), "o primeiro prazo é o primeiro marco");

  let r = passoSessao(est, true, S(59)); est = r.est;
  assert.deepEqual(r.marcos, [], "59 s ainda não é 60");
  assert.equal(r.emMs, S(1));

  r = passoSessao(est, true, S(60)); est = r.est;
  assert.deepEqual(r.marcos, [60]);
  assert.equal(r.emMs, S(120), "o prazo passa a ser o que falta para 180");

  r = passoSessao(est, true, S(61)); est = r.est;
  assert.deepEqual(r.marcos, [], "não repete o que já saiu");

  r = passoSessao(est, true, S(180)); est = r.est;
  assert.deepEqual(r.marcos, [180]);

  r = passoSessao(est, true, S(300)); est = r.est;
  assert.deepEqual(r.marcos, [300]);
  assert.equal(r.emMs, null, "depois do último marco não há mais o que agendar");

  r = passoSessao(est, true, S(9999));
  assert.deepEqual(r.marcos, [], "e nunca mais sai nada");
});

test("um salto longo cobre todos os marcos vencidos, na ordem, sem pular nenhum", () => {
  const est = passoSessao(SESSAO0, true, 0).est;
  const r = passoSessao(est, true, S(400));
  assert.deepEqual(r.marcos, [60, 180, 300]);
  assert.equal(r.emMs, null);
});

test("o tempo no menu NÃO conta: sair e voltar continua de onde parou", () => {
  // 40 s em partida, 10 min no menu, mais 25 s de volta = 65 s de sessão → o marco de 60 vence agora.
  let r = passoSessao(SESSAO0, true, 0);           // entrou
  r = passoSessao(r.est, false, S(40));            // saiu para o menu com 40 s
  assert.deepEqual(r.marcos, []);
  assert.equal(r.est.acum, S(40));
  r = passoSessao(r.est, true, S(640));            // voltou 10 min depois
  assert.deepEqual(r.marcos, [], "os 600 s de menu não contaram");
  assert.equal(r.est.acum, S(40));
  assert.equal(r.emMs, S(20), "faltam 20 s para o primeiro marco");
  r = passoSessao(r.est, true, S(665));
  assert.deepEqual(r.marcos, [60]);
});

test("a tela de morte e o pódio contam — é o ponto todo", () => {
  // o chamador decide o predicado; aqui se prova que `retido` verdadeiro faz o tempo correr igual,
  // venha ele de `game`, de `dead` ou de `round`.
  let est = passoSessao(SESSAO0, true, 0).est;
  const r = passoSessao(est, true, S(200));        // 200 s sem sair da sala, morrendo ou não
  assert.deepEqual(r.marcos, [60, 180]);
});

test("relógio que anda para trás não desconta tempo", () => {
  // `Date.now()` pode recuar (ajuste de NTP, aba suspensa). Recuar o acumulado faria um marco já
  // reportado voltar a ser devido — e o SDK recusa evento repetido.
  let r = passoSessao(SESSAO0, true, S(100));
  r = passoSessao(r.est, true, S(50));
  assert.ok(r.est.acum >= 0);
  assert.deepEqual(r.marcos, []);
});

test("é pura: não escreve no estado que recebe", () => {
  const est = { acum: S(59), desde: 0, feitos: 0 }, copia = { ...est };
  passoSessao(est, true, S(120));
  assert.deepEqual(est, copia);
});

// ── A SEQUÊNCIA QUE CHEGA AO SDK ──────────────────────────────────────────────
// É este o teste que trava o defeito do relatório da Poki. Eles cobram duas coisas por escrito:
// `gameplayStop()` em TODA interrupção (pausa, menu, fim de nível, morte) e nenhum evento repetido
// ("a gameplayStart() cannot follow another gameplayStart()"). O jogo cumpria nenhuma das duas — o
// único fechamento era `leaveGame()`, então a tela de morte inteira contava como jogo ativo.
import { iniciaSessaoPortal } from "../src/portal/sessao.js";

/** Um store com a mesma forma do `app` (get/subscribe/update), sem React e sem o resto do jogo. */
const storeFalso = (st0) => {
  let st = st0; const subs = new Set();
  return { get: () => st, subscribe(f) { subs.add(f); return () => subs.delete(f); },
    vai(p) { st = { ...st, ...p, overlays: { ...st.overlays, ...(p.overlays || {}) } }; for (const f of subs) f(st); } };
};
const TELA0 = { screen: "entry", overlays: { pause: false, tab: false, account: false, reconn: false } };

const roteiro = passos => {
  const store = storeFalso(TELA0), log = [];
  const alvo = { comecou: () => log.push("start"), parou: () => log.push("stop"), medir: () => {} };
  const off = iniciaSessaoPortal(alvo, store, () => 0);
  for (const p of passos) store.vai(p);
  off();
  return log;
};

test("a sessão típica: entrar, morrer, renascer, fim de rodada, sair", () => {
  const log = roteiro([
    { screen: "game" },                       // entrou na partida
    { screen: "dead" },                       // MORREU — o `stop` que nunca saía
    { screen: "dead" },                       // continua assistindo: nada novo
    { screen: "game" },                       // renasceu
    { screen: "round" },                      // BIG CRUNCH
    { screen: "lobby" },                      // saiu
  ]);
  assert.deepEqual(log, ["start", "stop", "start", "stop"]);
});

test("a pausa é interrupção — a Poki pede isso na letra", () => {
  assert.deepEqual(roteiro([
    { screen: "game" }, { overlays: { pause: true } }, { overlays: { pause: false } }, { screen: "lobby" },
  ]), ["start", "stop", "start", "stop"]);
});

test("o painel do TAB NÃO para o jogo: o planeta continua seguindo o mouse por baixo dele", () => {
  assert.deepEqual(roteiro([
    { screen: "game" }, { overlays: { tab: true } }, { overlays: { tab: false } },
  ]), ["start"]);
});

test("nunca sai start-após-start nem stop-após-stop, em nenhum roteiro", () => {
  const roteiros = [
    [{ screen: "game" }, { screen: "game" }, { screen: "game" }],
    [{ screen: "dead" }, { screen: "round" }, { screen: "lobby" }, { screen: "entry" }],
    [{ screen: "game" }, { overlays: { pause: true } }, { screen: "dead" }, { overlays: { pause: false } },
     { screen: "game" }, { screen: "game" }, { screen: "shop" }],
  ];
  for (const r of roteiros) {
    const log = roteiro(r);
    for (let i = 1; i < log.length; i++) assert.notEqual(log[i], log[i - 1], `repetiu em ${JSON.stringify(log)}`);
  }
});

test("nada é emitido enquanto o jogador está fora da partida", () => {
  assert.deepEqual(roteiro([{ screen: "modes" }, { screen: "lobby" }, { screen: "shop" }, { screen: "dead" }]), []);
});

test("o funil abre UMA vez por carga, na primeira vez que ele entra na sala", () => {
  const store = storeFalso(TELA0), m = [];
  const off = iniciaSessaoPortal({ comecou(){}, parou(){}, medir: (c, o, a) => m.push(`${c}/${o}/${a}`) }, store, () => 0);
  store.vai({ screen: "game" }); store.vai({ screen: "dead" }); store.vai({ screen: "game" });
  off();
  assert.deepEqual(m, ["session/60s/start", "session/180s/start", "session/300s/start"]);
});

// ── ASSISTIR NÃO É GAMEPLAY ───────────────────────────────────────────────────
// `spec` (assistir a uma sala em andamento) entrou no RETIDO — quem assiste está aqui, e deixá-lo de fora
// faria o funil contar como evasão quem foi ver uma partida. Mas ele NÃO pode entrar no ATIVO: um
// `gameplayStart()` sem partida é justamente o que os dois portais cobram por escrito ("a gameplayStart()
// cannot follow another gameplayStart()", e o par tem que descrever jogo de verdade). Este teste existe
// porque a distinção mora numa linha só, e trocá-la não quebra nada visível.
test("assistir não emite gameplay: é RETIDO, não é ATIVO", () => {
  assert.deepEqual(roteiro([{ screen: "spec" }, { screen: "spec" }, { screen: "lobby" }]), []);
});

test("sair de assistir para jogar abre o gameplay UMA vez", () => {
  assert.deepEqual(roteiro([
    { screen: "spec" },     // estava assistindo
    { screen: "lobby" },    // saiu
    { screen: "game" },     // agora entrou de verdade
    { screen: "dead" },
  ]), ["start", "stop"]);
});

test("a espera de ROUND.DEAD_DELAY_MS não produz evento nenhum a mais", () => {
  // Durante a espera entre a morte e a tela, `screen` continua "game" — o jogador está vendo o próprio
  // planeta estourar. O `stop` sai UMA vez, quando a tela finalmente entra.
  assert.deepEqual(roteiro([
    { screen: "game" },     // jogando
    { screen: "game" },     // morreu, mas a tela ainda não subiu (a espera)
    { screen: "dead" },     // a tela entrou
    { screen: "lobby" },
  ]), ["start", "stop"]);
});

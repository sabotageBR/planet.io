// ── PARA ONDE O BOOT VAI (state/entrada.js) ──────────────────────────────────
// O que este arquivo trava é o INVARIANTE do pacote de portal: **nenhum caminho pode terminar num menu**,
// porque no pacote o menu não está montado — e um `go("entry")` ali não dá erro nenhum, só deixa o jogador
// olhando um shell vazio. É o tipo de defeito que nenhum teste de componente pega e que o histograma do
// Player Fit pega como "saiu no primeiro minuto".
// Pura pelo mesmo motivo de `game/quality.js` e `ui/deadClock.js`: não há jsdom no projeto.
// Rodar: node --test client/test/entrada.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { destinoDoBoot, destinoDaSaida, precisaTutorial, estreiaSemConta } from "../src/state/entrada.js";

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

// ── O TUTORIAL DE ESTREIA ─────────────────────────────────────────────────────

test("o tutorial GANHA do boot direto — ele É o boot direto de quem nunca jogou", () => {
  assert.deepEqual(destinoDoBoot({ semMenu: true, tutor: true }), { tipo: "tutor" });
  assert.deepEqual(destinoDoBoot({ semMenu: false, tutor: true }), { tipo: "tutor" }, "e vale no site");
});

test("mas o CONVITE ganha do tutorial: o amigo está esperando do outro lado", () => {
  assert.equal(destinoDoBoot({ semMenu: true, tutor: true, sala: "1ABC" }).tipo, "sala");
  assert.equal(destinoDoBoot({ semMenu: true, tutor: true, party: "XY12" }).tipo, "party");
  assert.equal(destinoDoBoot({ semMenu: true, tutor: true, sala: "1ABC", assistir: true }).tipo, "spec");
});

test("`tutor` é OPCIONAL — sem ele nada do que já existia muda", () => {
  // É isto que permite acrescentar o ramo sem tocar num único chamador nem num único teste antigo.
  assert.deepEqual(destinoDoBoot({ semMenu: true }), { tipo: "jogar" });
  assert.deepEqual(destinoDoBoot({ semMenu: false }), { tipo: "dev" });
});

test("precisaTutorial: quem nunca jogou, com servidor de pé e sem marca, precisa", () => {
  assert.equal(precisaTutorial({ games: 0, marcado: false, online: true, erro: false }), true);
});

test("...e quem JÁ jogou, ou já viu, não", () => {
  assert.equal(precisaTutorial({ games: 1, marcado: false, online: true, erro: false }), false);
  assert.equal(precisaTutorial({ games: 0, marcado: true, online: true, erro: false }), false);
});

test("O BURACO CENTRAL: `games===0` não quer dizer 'nunca jogou'", () => {
  // Com o boot em erro o `applySession` nunca roda e `stats` fica zerado; com o banco fora, o perfil
  // LOCAL devolve `games:0` em TODA carga da página. Sem estes dois termos o tutorial ligaria para todo
  // mundo, para sempre — e no pacote ainda competiria com a tela de `servidorFora`.
  assert.equal(precisaTutorial({ games: 0, marcado: false, online: true, erro: true }), false, "boot que falhou");
  assert.equal(precisaTutorial({ games: 0, marcado: false, online: false, erro: false }), false, "banco fora");
  assert.equal(precisaTutorial({ games: 0, marcado: false, online: null, erro: false }), false, "sonda que não respondeu");
});

test("?tutorial=1|0 ganha dos dois lados — é o interruptor de bancada", () => {
  // Sem ele não há como PROVAR a tela sem limpar o localStorage; com ele, dá para desligá-la numa aba
  // que já cairia nela. O molde é o `?vida1=1`.
  assert.equal(precisaTutorial({ games: 99, marcado: true, online: true, erro: false, forcado: "1" }), true);
  assert.equal(precisaTutorial({ games: 0, marcado: false, online: true, erro: false, forcado: "0" }), false);
  assert.equal(precisaTutorial({ games: 0, marcado: false, online: true, erro: false, forcado: null }), true, "sem o parâmetro, a regra normal");
});

test("precisaTutorial é PURA: a mesma entrada dá a mesma saída", () => {
  const ctx = { games: 0, marcado: false, online: true, erro: false };
  const a = precisaTutorial(ctx);
  assert.equal(precisaTutorial(ctx), a);
  assert.deepEqual(ctx, { games: 0, marcado: false, online: true, erro: false }, "e não mexe no argumento");
});

// ── A ESTREIA SEM ESPERAR A CONTA (`estreiaRapida`, state/actions.js) ──
// Um aparelho novo entra no tutorial logo depois da sonda do `/api/config`, e a conta do convidado corre por
// trás. O que se trava aqui é QUEM pode fazer isso — a lista de plataformas é o segundo portão, depois da sonda.
test("estreia sem conta: aparelho NOVO, sem marca e sem link, pode", () => {
  assert.equal(estreiaSemConta({ temToken: false, marcado: false }), true);
  assert.equal(estreiaSemConta({ temToken: false, marcado: false, forcado: "1" }), true, "?tutorial=1 não barra");
});
test("...mas quem tem TOKEN espera a conta: só o /api/me sabe se ela já jogou", () => {
  assert.equal(estreiaSemConta({ temToken: true, marcado: false }), false);
  assert.equal(estreiaSemConta({ temToken: true, marcado: false, forcado: "1" }), false,
    "o `?tutorial=1` de uma conta existente continua pelo boot normal, que também o respeita");
});
test("...e a MARCA do tutorial fecha a porta mesmo sem token (limpou o token, não a marca)", () => {
  assert.equal(estreiaSemConta({ temToken: false, marcado: true }), false);
});
test("...e os LINKS e o `?tutorial=0` nunca: eles têm destino próprio", () => {
  assert.equal(estreiaSemConta({ temToken: false, marcado: false, link: true }), false);
  assert.equal(estreiaSemConta({ temToken: false, marcado: false, forcado: "0" }), false);
});

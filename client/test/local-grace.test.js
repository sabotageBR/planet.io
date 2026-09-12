// ── NINGUÉM CONSEGUIA DIVIDIR NO `?local=1`, E NADA ACUSAVA ───────────────────
// `souNovato` (client/src/game/index.js) nasce `true` e o ÚNICO apagador dele é o `{t:"grace"}` do
// servidor. O `LocalServer` nunca mandava essa mensagem — `grep grace` naquele arquivo devolvia zero —,
// então no modo local ele ficava `true` para sempre e três coisas morriam juntas, em silêncio:
//   · `act()` engolia todo comando de dividir ANTES de virar flag de INPUT (tecla e botão de toque);
//   · `hudStore.splitOff` escondia o `#t-split`, então no dedo o botão nem chegava a existir;
//   · `passoMissao` nunca alcançava a etapa 3, e a dica do dividir não aparecia para ninguém.
// É o modo de falha que o cabeçalho do LocalServer.js descreve por escrito ("o offline diverge em
// silêncio"), e é pré-requisito do tutorial de estreia, cuja etapa 3 é justamente dividir.
//
// ⚠️ Este teste é de INTEGRAÇÃO de propósito, com relógio de verdade: o que precisa ser provado não é a
// aritmética de `sobGraca` (que já tem teste em shared/), é que a MENSAGEM SAI pelo socket. O laço do
// LocalServer é um `setInterval` com `performance.now()`, então timers falsos não o fariam andar.
// node --test client/test/local-grace.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { createLocalServer } from "../src/game/net/LocalServer.js";
import { setR } from "@warspace/shared/physics/index.js";
import { BOT } from "@warspace/shared";

const espera = ms => new Promise(r => setTimeout(r, ms));

/** Sobe um servidor local sem bots nem comida e entra nele. Devolve o servidor e o log de JSON. */
async function entra() {
  const srv = createLocalServer({ bots: 0, food: 0, seed: 1 });
  const sock = srv.connect(), msgs = [];
  sock.onmessage = e => { if (typeof e.data === "string") msgs.push(JSON.parse(e.data)); };
  sock.onopen = () => sock.send(JSON.stringify({ t: "join", fallbackNick: "Teste", view: { w: 1280, h: 720 } }));
  await espera(120);
  const w = srv.world, ps = [...w.players.values()][0];
  return { srv, w, ps, msgs };
}

test("o servidor local avisa quando a graça acaba pela MASSA", async () => {
  const { srv, w, ps, msgs } = await entra();
  try {
    assert.ok(ps, "o jogador entrou");
    assert.equal(ps.graceUntil > w.tick, true, "e nasce sob a graça");
    assert.equal(msgs.some(m => m.t === "grace"), false, "nada de `grace` enquanto ela vale");
    setR(ps.pieces[0], Math.sqrt(BOT.NOVATO_MASS * 1.2));   // passou de NOVATO_MASS
    await espera(400);
    const g = msgs.find(m => m.t === "grace");
    assert.ok(g, "o `{t:\"grace\"}` saiu — é ele que apaga `souNovato` e devolve o botão DIVIDIR");
    // A ordem das perguntas é a mesma do servidor: zero só pode ser abate; vencida, é o relógio; o resto
    // é massa. Com `graceUntil` ainda no futuro e a massa acima do teto, só pode ser `mass`.
    assert.equal(g.why, "mass");
  } finally { srv.stop(); }
});

test("ele sai UMA vez por vida, não a cada tick", async () => {
  const { srv, w, ps, msgs } = await entra();
  try {
    setR(ps.pieces[0], Math.sqrt(BOT.NOVATO_MASS * 1.2));
    await espera(500);
    assert.equal(msgs.filter(m => m.t === "grace").length, 1);
  } finally { srv.stop(); }
});

test("o `why` é um dos três que o cliente conhece", async () => {
  // `game/index.js` só traduz `time|mass|kill` em marco de funil, e o comentário de lá promete que um
  // `why` desconhecido é ignorado. Mas o que ESTE servidor emite tem que ser um dos três de verdade.
  const { srv, w, ps, msgs } = await entra();
  try {
    setR(ps.pieces[0], Math.sqrt(BOT.NOVATO_MASS * 1.2));
    await espera(400);
    const g = msgs.find(m => m.t === "grace");
    assert.ok(["time", "mass", "kill"].includes(g.why), g.why);
  } finally { srv.stop(); }
});

// ── E O TUTORIAL NÃO TEM PLACAR, LOGO NÃO TEM COROA ──────────────────────────
test("com roteiro, o servidor local NÃO manda LEADERBOARD", async () => {
  // `WorldView` tira o líder do LEADERBOARD, e num mundo com um jogador só o aluno é sempre o primeiro:
  // ele ganhava a coroa de "maior do mapa" na etapa em que ainda está aprendendo a se mover — sem
  // significado nenhum, e ainda por cima tapando o topo do próprio planeta. Sem a mensagem, `leaderSlot`
  // fica -1 e o render não desenha nada.
  const { createLocalServer } = await import("../src/game/net/LocalServer.js");
  const { MSG } = await import("@warspace/shared");
  const roteiro = { nasce: (w, slot) => w.addPlayer(slot, { x: 600, y: 600 }), passo: () => {} };
  const srv = createLocalServer({ bots: 0, food: 0, seed: 1, mundo: { w: 1200, h: 1200, asteroids: false, holes: 0, stars: 0 }, roteiro });
  const sock = srv.connect(); const tipos = new Set();
  sock.onmessage = e => { if (typeof e.data !== "string") tipos.add(new Uint8Array(e.data)[0]); };
  sock.onopen = () => sock.send(JSON.stringify({ t: "join", fallbackNick: "T", view: { w: 1280, h: 720 } }));
  try {
    await espera(700);   // LEADERBOARD_EVERY = 30 ticks = 0,5 s: mais de uma janela
    assert.equal(tipos.has(MSG.LEADERBOARD), false, "nenhum LEADERBOARD saiu");
    assert.equal(tipos.has(MSG.SNAPSHOT), true, "mas o snapshot continua — o jogo roda normalmente");
  } finally { srv.stop(); }
});

test("...e SEM roteiro ele continua mandando, byte a byte como sempre", async () => {
  const { createLocalServer } = await import("../src/game/net/LocalServer.js");
  const { MSG } = await import("@warspace/shared");
  const srv = createLocalServer({ bots: 0, food: 0, seed: 1 });
  const sock = srv.connect(); const tipos = new Set();
  sock.onmessage = e => { if (typeof e.data !== "string") tipos.add(new Uint8Array(e.data)[0]); };
  sock.onopen = () => sock.send(JSON.stringify({ t: "join", fallbackNick: "T", view: { w: 1280, h: 720 } }));
  try { await espera(700); assert.equal(tipos.has(MSG.LEADERBOARD), true); }
  finally { srv.stop(); }
});

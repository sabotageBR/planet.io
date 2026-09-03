// ── O ERRO DO SERVIDOR CHEGA INTEIRO NA TELA ─────────────────────────────────
// O payload de `{t:"error"}` carrega campos de MOLDE além do código: o `nick` do NICK_IN_ROOM e a
// `suggestion` que a tela oferece ao jogador. Eles já tinham se perdido uma vez — a frase saía como
// «já há alguém chamado "" nessa sala» e sem nome sugerido —, o conserto foi feito no `handleJson` e
// DESFEITO no `onclose`, que copiava só `{code,message}`. Um comentário afirmava que estava resolvido.
// Este teste é o que impede a terceira vez.
// node --test client/test/connection.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createConnection } from "../src/game/net/Connection.js";
import { PROTOCOL_VERSION } from "@warspace/shared";

/** Socket falso no formato que o `createConnection` espera (o mesmo contrato do LocalServer). */
function socketFalso() {
  const s = { readyState: 1, sent: [], onopen: null, onmessage: null, onclose: null, onerror: null,
    binaryType: "", send(d) { s.sent.push(d); }, close() {} };
  return s;
}

test("erro fatal do servidor preserva nick e suggestion até o onState", () => {
  let sock = null; const estados = [];
  const c = createConnection({ makeSocket: () => (sock = socketFalso()), onJson: () => {}, onBinary: () => {},
    onState: e => estados.push(e), onOpenSend: () => {} });
  c.open();
  sock.onopen();
  // é este o payload que server/src/net/wsServer.js manda antes de fechar com 4410
  sock.onmessage({ data: JSON.stringify({ t: "error", code: "NICK_IN_ROOM",
    message: 'já há alguém chamado "teste" nessa sala', nick: "teste", suggestion: "teste2" }) });
  sock.onclose({ code: 4410 });

  const fim = estados[estados.length - 1];
  assert.equal(fim.state, "closed");
  assert.equal(fim.code, "NICK_IN_ROOM");
  assert.equal(fim.nick, "teste", "sem o nick a frase sai com as aspas vazias");
  assert.equal(fim.suggestion, "teste2", "sem a sugestão o jogador fica sem saber que nome usar");
  assert.equal(fim.t, undefined, "o `t` do envelope não vaza para o estado");
});

test("queda sem erro do servidor continua virando LOST/UNREACHABLE", () => {
  let sock = null; const estados = [];
  const c = createConnection({ makeSocket: () => (sock = socketFalso()), onJson: () => {}, onBinary: () => {},
    onState: e => estados.push(e), onOpenSend: () => {} });
  c.open();
  sock.onopen();
  sock.onclose({ code: 1006 });   // caiu antes de qualquer join
  const fim = estados[estados.length - 1];
  assert.equal(fim.code, "UNREACHABLE");
  c.close();
});

// ── VERSÃO DIFERENTE NO `room`: DOIS SENTIDOS, DOIS DESFECHOS ────────────────
// Os dois casos caíam no MESMO `if`, e o desfecho único (reload em 1 s) era o defeito: num portal o
// bundle é uma cópia congelada no domínio deles, então recarregar traz a mesma build e o jogo fica
// batendo a cabeça para sempre; e durante um rollout quem está atrás é o SERVIDOR, e aí recarregar não
// tinha o que consertar — o cliente já era o novo.
/** Troca `location`, `sessionStorage` e `setTimeout` por dublês; o reload agendado passa a ser síncrono. */
function comAmbiente(fn) {
  const g = globalThis, loc = g.location, ss = g.sessionStorage, st = g.setTimeout;
  let reloads = 0; const guardado = new Map();
  g.location = { reload() { reloads++; } };
  g.sessionStorage = { getItem: k => (guardado.has(k) ? guardado.get(k) : null), setItem: (k, v) => { guardado.set(k, String(v)); } };
  g.setTimeout = f => { f(); return 0; };
  try { return fn({ reloads: () => reloads }); }
  finally { g.location = loc; g.sessionStorage = ss; g.setTimeout = st; }
}
/** Abre a conexão e entrega um `room` com a versão do SERVIDOR que o teste quiser. */
function comRoom(protocolDoServidor, extra = {}) {
  let sock = null; const estados = [];
  const c = createConnection({ makeSocket: () => (sock = socketFalso()), onJson: () => {}, onBinary: () => {},
    onState: e => estados.push(e), onOpenSend: () => {}, ...extra });
  c.open(); sock.onopen();
  sock.onmessage({ data: JSON.stringify({ t: "room", code: "0ABC", shard: 0, slot: 1, sessionId: "s", resumeToken: "r", protocol: protocolDoServidor }) });
  return { c, sock, estados, fim: () => estados[estados.length - 1] };
}

test("servidor à frente: OUTDATED, e o reload acontece UMA vez só", () => {
  comAmbiente(({ reloads }) => {
    const a = comRoom(PROTOCOL_VERSION + 1);
    assert.equal(a.fim().state, "error");
    assert.equal(a.fim().code, "OUTDATED");
    assert.equal(reloads(), 1, "a primeira vez recarrega: no site é o conserto");
    a.c.close();
    // segunda vez na MESMA sessão (é o que acontece no portal, onde o reload devolve o mesmo bundle):
    // a marca do sessionStorage segura, e o que fica é a tela.
    const b = comRoom(PROTOCOL_VERSION + 1);
    assert.equal(b.fim().code, "OUTDATED");
    assert.equal(reloads(), 1, "sem a marca, isto seria um laço de reload");
    b.c.close();
  });
});

test("servidor atrás (rollout): pede outro shard, sem reload e sem UNREACHABLE", () => {
  comAmbiente(({ reloads }) => {
    let stale = 0;
    const a = comRoom(PROTOCOL_VERSION - 1, { onStale: () => { stale++; } });
    a.sock.onclose({ code: 1000 });   // fomos NÓS que fechamos, para trocar de shard
    assert.equal(stale, 1, "o host tem que refazer a escolha de shard");
    assert.equal(reloads(), 0, "recarregar não conserta: quem está atrás é o servidor");
    assert.equal(a.fim().state, "reconnecting");
    assert.equal(a.fim().code, "UPDATING");
    a.c.close();
  });
});

test("mesma versão, e versão ausente, entram normalmente", () => {
  comAmbiente(({ reloads }) => {
    for (const p of [PROTOCOL_VERSION, undefined]) {
      const a = comRoom(p);
      assert.equal(a.fim().state, "connected", `protocolo ${p} devia entrar`);
      assert.equal(reloads(), 0);
      a.c.close();
    }
  });
});

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

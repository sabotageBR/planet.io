// ── A base da API: sem env, o site tem que sair EXATAMENTE como antes ─────────────────────────
// O pacote de portal assa uma origem absoluta no bundle; o site não assa nada. Este teste trava a
// metade que não pode mudar — a outra metade é travada pelo `portal-pack.mjs`, que aborta se a origem
// não aparecer no JS gerado (uma injeção que falha em silêncio seria um zip que joga sozinho).
// node --test client/test/portal-base.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { API_BASE, apiUrl, wsUrl } from "../src/api/base.js";

test("sem VITE_API_BASE: tudo relativo, byte a byte", () => {
  assert.equal(API_BASE, "");
  for (const p of ["/api/me", "/api/config", "/api/avatar/7?v=abc", "/api/admin/rooms"])
    assert.equal(apiUrl(p), p);
});

test("wsUrl sem base usa a própria origem, e o esquema acompanha o protocolo", () => {
  const antes = globalThis.location;
  try {
    globalThis.location = { protocol: "https:", host: "warspace.io" };
    assert.equal(wsUrl(2), "wss://warspace.io/ws/2");
    globalThis.location = { protocol: "http:", host: "localhost:5173" };
    assert.equal(wsUrl(0), "ws://localhost:5173/ws/0");
  } finally { globalThis.location = antes; }
});

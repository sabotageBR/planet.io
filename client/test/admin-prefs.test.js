// ── AS PREFERÊNCIAS DO PAINEL (client/src/admin/api.js) ───────────────────────
// Duas funções de três linhas, e mesmo assim com teste — porque a terceira asserção aqui é a única coisa
// entre uma janela anônima e o painel INTEIRO em branco: `localStorage` não devolve null nesse modo, ele
// LANÇA, e uma exceção no `useState` inicial de uma tela derruba o render da árvore toda.
// `client/test/` é `node --test` sem jsdom, então o armazenamento é de mentira e mora em `globalThis`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getPref, setPref } from "../src/admin/api.js";

/** Um `localStorage` de mentira; `lanca` reproduz a janela anônima, onde até LER estoura. */
function fingeStorage(lanca = false) {
  const m = new Map();
  globalThis.localStorage = {
    getItem(k) { if (lanca) throw new Error("SecurityError"); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { if (lanca) throw new Error("SecurityError"); m.set(k, String(v)); },
    removeItem(k) { if (lanca) throw new Error("SecurityError"); m.delete(k); },
  };
  return m;
}

test("prefs do painel: chave ausente devolve o padrão, e a ida e volta preserva o valor", () => {
  const m = fingeStorage();
  assert.equal(getPref("retencao.janela", "1h"), "1h", "sem nada gravado vale o padrão da tela");
  setPref("retencao.janela", "30d");
  assert.equal(getPref("retencao.janela", "1h"), "30d");
  // ⚠️ O PREFIXO É PARTE DO CONTRATO: painel e jogo dividem origem e SPA, e um `janela` solto colidiria
  // com a primeira pref do JOGO que se chamasse igual.
  assert.ok(m.has("warspace_admin_pref_retencao.janela"), "a chave real leva o prefixo do painel");
  assert.equal(m.get("warspace_admin_pref_retencao.janela"), "30d");
  setPref("retencao.janela", null);
  assert.equal(getPref("retencao.janela", "1h"), "1h", "apagar volta ao padrão");
  assert.equal(getPref("nunca.gravado"), null, "sem padrão declarado, null");
});

test("prefs do painel: em janela anônima o acessor LANÇA — e o painel não pode cair por causa disso", () => {
  fingeStorage(true);
  assert.doesNotThrow(() => setPref("retencao.janela", "7d"), "gravar tem que ser inofensivo");
  assert.equal(getPref("retencao.janela", "1h"), "1h", "e ler devolve o padrão, não uma exceção");
  // sem `localStorage` NENHUM (o mesmo caso, por outro caminho) tem que degradar igual
  delete globalThis.localStorage;
  assert.doesNotThrow(() => setPref("x", "y"));
  assert.equal(getPref("x", "z"), "z");
});

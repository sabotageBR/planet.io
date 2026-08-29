// ── Toda skin com `pattern` tem que DESENHAR ──────────────────────────────────
// O erro mais provável ao acrescentar skin é pôr `pattern:"crown"` no catálogo e esquecer o `case` em
// paintPattern — e o sintoma no jogo é discreto: a skin cai no emoji fantasma e ninguém percebe até
// alguém pagar 16 mil moedas por ela. Aqui um contexto 2D FALSO registra as chamadas, então o teste roda
// sem canvas, sem navegador e em milissegundos.
import test from "node:test";
import assert from "node:assert/strict";
import { SKINS } from "@warspace/shared/skins.js";
import { EGG_SKIN_IDS } from "@warspace/shared/eggs.js";
import { paintPattern } from "../src/theme/patterns.js";

/** Contexto 2D de mentira: aceita tudo, conta o que foi pedido e nunca lança. */
function ctxFalso() {
  const chamadas = [];
  const alvo = {
    canvas: { width: 256, height: 256 },
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, lineCap: "butt", lineJoin: "miter",
    globalAlpha: 1, font: "10px sans", textAlign: "left", textBaseline: "top",
  };
  return new Proxy(alvo, {
    get(o, k) {
      if (k in o) return o[k];
      return (...a) => { chamadas.push(k); return k === "createLinearGradient" || k === "createRadialGradient"
        ? { addColorStop() {} } : undefined; };
    },
    set(o, k, v) { o[k] = v; return true; },
    has() { return true; },
    ...{ get chamadas() { return chamadas; } },
  });
}

test("toda skin com pattern desenha algo, sem exceção", () => {
  for (const s of SKINS) {
    if (!s.pattern || s.pattern === "plain") continue;
    const c = ctxFalso();
    let ok;
    assert.doesNotThrow(() => { ok = paintPattern(c, 128, s, { ink: "#141026", light: "#fff5c2" }); },
      `skin ${s.id} "${s.name}" (pattern "${s.pattern}") estourou`);
    assert.equal(ok, true, `skin ${s.id} "${s.name}": pattern "${s.pattern}" não tem case em paintPattern`);
  }
});

test("as caricaturas dos easter eggs existem e são desenhadas", () => {
  for (const id of EGG_SKIN_IDS) {
    const s = SKINS.find(x => x.id === id);
    assert.ok(s, `skin de egg ${id} não está no catálogo`);
    assert.equal(s.pattern, "face");
    assert.equal(paintPattern(ctxFalso(), 128, s, { ink: "#141026", light: "#fff5c2" }), true, `egg ${id} não desenhou`);
  }
});

test("a skin de foto desenha a silhueta SEM bitmap e a imagem COM bitmap", () => {
  // `paintPattern` é síncrono: enquanto o ImageBitmap não chegou, o lugar tem que ser reservado —
  // devolver false cairia no emoji fantasma, que é pior que um espaço guardado.
  const foto = SKINS.find(s => s.pattern === "avatar");
  assert.ok(foto, "a skin Retrato sumiu do catálogo");
  assert.equal(paintPattern(ctxFalso(), 128, foto, { ink: "#141026", light: "#fff5c2" }), true);
  let desenhou = false;
  const c = ctxFalso();
  const espiao = new Proxy(c, { get: (o, k) => k === "drawImage" ? (() => { desenhou = true; }) : o[k], set: (o, k, v) => (o[k] = v, true) });
  paintPattern(espiao, 128, foto, { ink: "#141026", light: "#fff5c2", avatar: { width: 256, height: 256 } });
  assert.ok(desenhou, "com bitmap, a foto tem que ser desenhada");
});

test("pattern desconhecido devolve false (é o que aciona o emoji fantasma)", () => {
  assert.equal(paintPattern(ctxFalso(), 128, { id: 999, pattern: "inventado", color: "#fff" }, {}), false);
  assert.equal(paintPattern(ctxFalso(), 128, { id: 999, pattern: "plain", color: "#fff" }, {}), false);
});

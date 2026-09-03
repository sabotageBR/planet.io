// ── O comparador das tabelas do /admin (client/src/admin/ordenar.js) ──────────
// Módulo puro justamente para poder ser testado aqui: `client/test/` é `node --test` sem jsdom e sem
// React, então nada que renderize entra.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compara, ordenar, proxOrdem } from "../src/admin/ordenar.js";

test("ordenar: número compara como número, não como texto", () => {
  const linhas = [{ n: 999 }, { n: 1234 }, { n: 80 }];
  const campos = { n: r => r.n };
  assert.deepEqual(ordenar(linhas, campos, "n", "desc").map(r => r.n), [1234, 999, 80]);
  assert.deepEqual(ordenar(linhas, campos, "n", "asc").map(r => r.n), [80, 999, 1234]);
  // ⚠️ O defeito clássico: ordenar o valor JÁ FORMATADO. "1.234" < "999" em qualquer comparação textual,
  // e a coluna de moedas sairia ao contrário sem nada na tela denunciando.
  assert.ok(compara("1.234", "999") !== 0, "o formatado NÃO é o que se ordena — este teste existe de lembrete");
});

test("ordenar: nulos e vazios vão para o FIM nas duas direções", () => {
  const linhas = [{ v: 5 }, { v: null }, { v: 1 }, { v: "" }, { v: undefined }];
  const campos = { v: r => r.v };
  const fim = arr => arr.slice(-3).every(r => r.v == null || r.v === "");
  assert.ok(fim(ordenar(linhas, campos, "v", "desc")), "desc: os três vazios ficam no fim");
  assert.ok(fim(ordenar(linhas, campos, "v", "asc")), "asc: também — senão clicar duas vezes enche a tela de '—'");
});

test("ordenar: texto respeita acento (localeCompare), não código de caractere", () => {
  const linhas = [{ s: "Zé" }, { s: "Ávila" }, { s: "bento" }];
  const campos = { s: r => r.s };
  // Sem localeCompare, "Ávila" (U+00C1) cairia DEPOIS de "Zé" e de "bento".
  assert.deepEqual(ordenar(linhas, campos, "s", "asc").map(r => r.s), ["Ávila", "bento", "Zé"]);
});

test("ordenar: `by` desconhecido devolve a lista como está, sem inventar ordem", () => {
  const linhas = [{ n: 3 }, { n: 1 }];
  assert.deepEqual(ordenar(linhas, { n: r => r.n }, "constructor", "asc").map(r => r.n), [3, 1]);
  assert.deepEqual(ordenar(linhas, {}, "n", "asc").map(r => r.n), [3, 1]);
  assert.deepEqual(ordenar(null, { n: r => r.n }, "n", "asc"), []);
});

test("ordenar: a ordem é estável — linhas empatadas não trocam de lugar entre cliques", () => {
  const linhas = [{ n: 1, id: "a" }, { n: 1, id: "b" }, { n: 1, id: "c" }];
  const campos = { n: r => r.n };
  assert.deepEqual(ordenar(linhas, campos, "n", "desc").map(r => r.id), ["a", "b", "c"]);
});

test("proxOrdem: a mesma coluna inverte, a coluna nova começa no padrão dela", () => {
  assert.deepEqual(proxOrdem({ by: "id", dir: "desc" }, "id"), { by: "id", dir: "asc" });
  assert.deepEqual(proxOrdem({ by: "id", dir: "asc" }, "id"), { by: "id", dir: "desc" });
  assert.deepEqual(proxOrdem({ by: "id", dir: "desc" }, "coins"), { by: "coins", dir: "desc" });
  assert.deepEqual(proxOrdem({ by: "id", dir: "desc" }, "slot", "asc"), { by: "slot", dir: "asc" });
});

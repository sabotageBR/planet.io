// ── QUAL MODELO DA TELA DO TUTORIAL (ui/tutorEstilo.js) ──────────────────────
// A escolha tem DUAS fontes (o `d.estilo` da bancada e o `?tutor=` da URL) e o que este arquivo trava é a
// ORDEM entre elas, o chão, e que os modelos declarados EXISTEM de verdade no componente e no CSS.
// Pura pelo mesmo motivo de `dead-estilo.test.js`: não há jsdom no projeto.
// Rodar: node --test client/test/tutor-estilo.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ESTILOS, PADRAO, estiloDe, partesDoDemo } from "../src/ui/tutorEstilo.js";

const ler = rel => readFileSync(new URL(rel, import.meta.url), "utf8");

test("sem nada, vale o PADRÃO — e o padrão é um modelo que existe", () => {
  assert.ok(ESTILOS.includes(PADRAO));
  assert.equal(estiloDe(), PADRAO);
  assert.equal(estiloDe({}), PADRAO);
  assert.equal(estiloDe({ demo: null, q: null }), PADRAO);
});

test("`?tutor=` aceita NÚMERO (1-based) e NOME", () => {
  assert.equal(estiloDe({ q: "1" }), "legenda");
  assert.equal(estiloDe({ q: "2" }), "sargento");
  assert.equal(estiloDe({ q: "3" }), "cena");
  assert.equal(estiloDe({ q: "4" }), "classico");
  assert.equal(estiloDe({ q: "cena" }), "cena");
});

test("1, 2 e 3 são os CANDIDATOS: o que está em produção nunca ocupa um desses números", () => {
  // o dono compara `?tutor=1|2|3`; se o clássico caísse num deles, um dos três modelos novos ficaria
  // inalcançável por número e a comparação sairia com um a menos, sem aviso
  assert.ok(ESTILOS.indexOf("classico") >= 3);
});

test("lixo no `?tutor=` não derruba nada: só não vale", () => {
  for (const q of ["0", "9", "-1", "nada", "", "1.5", "NaN"]) assert.equal(estiloDe({ q }), PADRAO, "q=" + q);
});

test("a BANCADA ganha da URL — senão a matriz mediria o mesmo modelo quatro vezes, calada", () => {
  assert.equal(estiloDe({ demo: "sargento", q: "3" }), "sargento");
  assert.equal(estiloDe({ demo: "classico", q: "1" }), "classico");
  // …mas bancada com lixo não apaga a URL
  assert.equal(estiloDe({ demo: "inexistente", q: "cena" }), "cena");
  assert.equal(estiloDe({ demo: undefined, q: "2" }), "sargento");
});

test("`partesDoDemo` separa o estilo da cara, e sem estilo a cara é a string inteira", () => {
  assert.deepEqual(partesDoDemo("sargento:2@1"), { estilo: "sargento", cara: "2@1" });
  assert.deepEqual(partesDoDemo("cena:3!"), { estilo: "cena", cara: "3!" });
  assert.deepEqual(partesDoDemo("legenda:fim"), { estilo: "legenda", cara: "fim" });
  assert.deepEqual(partesDoDemo("legenda"), { estilo: "legenda", cara: "" });
  // as sete entradas ANTIGAS da matriz continuam valendo sem uma vírgula de mudança
  for (const c of ["pre", "1", "2@2", "3@1", "3!", "ok2", "fim", ""])
    assert.deepEqual(partesDoDemo(c), { estilo: null, cara: c }, "cara=" + c);
  assert.deepEqual(partesDoDemo(undefined), { estilo: null, cara: "" });
});

test("NÚMERO nunca é estilo no sufixo da bancada: `2` é a ETAPA 2", () => {
  assert.deepEqual(partesDoDemo("2:1"), { estilo: null, cara: "2:1" });
  assert.deepEqual(partesDoDemo("2"), { estilo: null, cara: "2" });
});

test("todo modelo declarado EXISTE: no despacho do componente e no CSS", () => {
  // por TEXTO (o molde é `sombra-import.test.js`): o `node --test` não carrega `.jsx`. Um modelo que só
  // existe na lista cai no clássico em silêncio — o dono compararia o clássico consigo mesmo.
  const jsx = ler("../src/ui/Tutor.jsx"), css = ler("../src/styles/ui.css");
  const m = /const MODELOS\s*=\s*\{([^}]*)\}/.exec(jsx);
  assert.ok(m, "Tutor.jsx tem de declarar `const MODELOS = { … }`");
  for (const e of ESTILOS) {
    if (e === PADRAO) continue;
    assert.ok(new RegExp("\\b" + e + "\\s*:").test(m[1]), `"${e}" falta em MODELOS (ui/Tutor.jsx)`);
    assert.ok(css.includes(`[data-style="${e}"]`), `"${e}" não tem nenhuma regra [data-style] em ui.css`);
  }
});

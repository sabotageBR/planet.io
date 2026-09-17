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
  ESTILOS.forEach((e, i) => { assert.equal(estiloDe({ q: String(i + 1) }), e); assert.equal(estiloDe({ q: e }), e); });
  assert.equal(estiloDe({ q: "classico" }), "classico");
});

test("o PADRÃO é o `cena` — a escolha do dono do jogo — e o clássico continua alcançável", () => {
  // o clássico fica como rede enquanto o Fit Test não disser que o `cena` não é pior; o dia em que ele sair,
  // este teste sai junto com `tutorEstilo.js` inteiro
  assert.equal(PADRAO, "cena");
  assert.ok(ESTILOS.includes("classico"));
});

test("lixo no `?tutor=` não derruba nada: só não vale", () => {
  for (const q of ["0", "9", "-1", "nada", "", "1.5", "NaN"]) assert.equal(estiloDe({ q }), PADRAO, "q=" + q);
});

test("a BANCADA ganha da URL — senão a matriz mediria o mesmo modelo duas vezes, calada", () => {
  assert.equal(estiloDe({ demo: "classico", q: "cena" }), "classico");
  assert.equal(estiloDe({ demo: "cena", q: "classico" }), "cena");
  // …mas bancada com lixo não apaga a URL
  assert.equal(estiloDe({ demo: "inexistente", q: "classico" }), "classico");
  assert.equal(estiloDe({ demo: undefined, q: "2" }), "classico");
});

test("`partesDoDemo` separa o estilo da cara, e sem estilo a cara é a string inteira", () => {
  assert.deepEqual(partesDoDemo("classico:2@1"), { estilo: "classico", cara: "2@1" });
  assert.deepEqual(partesDoDemo("cena:3!"), { estilo: "cena", cara: "3!" });
  assert.deepEqual(partesDoDemo("cena:fim"), { estilo: "cena", cara: "fim" });
  assert.deepEqual(partesDoDemo("cena"), { estilo: "cena", cara: "" });
  // as entradas SEM modelo continuam valendo sem uma vírgula de mudança (medem o padrão)
  for (const c of ["pre", "1", "2@2", "3@1", "3!", "ok2", "fim", ""])
    assert.deepEqual(partesDoDemo(c), { estilo: null, cara: c }, "cara=" + c);
  assert.deepEqual(partesDoDemo(undefined), { estilo: null, cara: "" });
  // um modelo que SAIU do código não é estilo: vira cara (inválida), nunca um modelo fantasma
  assert.deepEqual(partesDoDemo("sargento:2"), { estilo: null, cara: "sargento:2" });
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
    if (e === "classico") continue;   // o clássico É o `Tutor.jsx`: mora fora de MODELOS por construção
    assert.ok(new RegExp("\\b" + e + "\\s*:").test(m[1]), `"${e}" falta em MODELOS (ui/Tutor.jsx)`);
    assert.ok(css.includes(`[data-style="${e}"]`), `"${e}" não tem nenhuma regra [data-style] em ui.css`);
  }
});

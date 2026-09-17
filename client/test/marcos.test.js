// ── OS MARCOS DO FUNIL: O TUTORIAL NÃO PODE RESPONDER PELA PARTIDA ───────────
// O painel da Poki (1.31) dizia `life/first_kill` em 60% das cargas; o nosso banco dizia 19% de primeiras
// vidas com abate, para a mesma gente. Os dois estavam certos: o marco saía ao comer a presa da etapa 3 do
// TUTORIAL (que é um `EVENT.EAT` de verdade) e, sendo "uma vez por carga", nunca mais na sala real. O que
// este arquivo trava são os dois sentidos do conserto — e o segundo é o que se esquece:
//   1. no tutorial só passam os `tutor_*`;
//   2. barrar NÃO QUEIMA o marco: o mesmo nome tem que sair depois, na partida.
// E, de carona, o `first_death_<faixa>` que saía uma vez por FAIXA (252 faixas para 159 primeiras mortes).
// node --test client/test/marcos.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { portal } from "../src/portal/index.js";
import { marco, evento, marcoMorte, portaoTutorial, noTutorial, _zera } from "../src/portal/marcos.js";

/** Troca `portal.medir` por um coletor pelo tempo de `fn` — é o que o painel deles receberia. */
function espia(fn) { const orig = portal.medir, v = [];
  portal.medir = (c, o, a) => { v.push(`${c}/${o}/${a}`); };
  try { _zera(); fn(v); } finally { portal.medir = orig; _zera(); }
  return v; }

test("no tutorial só passam os marcos do tutorial", () => {
  const v = espia(() => { portaoTutorial(true);
    assert.equal(noTutorial(), true);
    assert.equal(marco("first_kill"), false, "a presa da etapa 3 não é o primeiro abate de ninguém");
    assert.equal(marco("grace_end_mass"), false, "a meta da etapa 1 não é o fim da graça");
    evento("respawn");
    assert.equal(marco("tutor_tiro"), true);assert.equal(marco("tutor_done"), true); });
  assert.deepEqual(v, ["life/tutor_tiro/complete", "life/tutor_done/complete"]);
});

test("barrar não QUEIMA o marco: o mesmo nome sai depois, na partida real — e uma vez só", () => {
  const v = espia(() => { portaoTutorial(true); marco("first_kill"); marco("first_kill");
    portaoTutorial(false);
    assert.equal(marco("first_kill"), true, "o portão tem que vir ANTES do `feitos.add`, senão o conserto troca um defeito pelo outro");
    assert.equal(marco("first_kill"), false);
    evento("respawn"); evento("respawn"); });
  assert.deepEqual(v, ["life/first_kill/complete", "life/respawn/complete", "life/respawn/complete"]);
});

test("a faixa de idade sai junto com a PRIMEIRA morte, e nunca mais", () => {
  const v = espia(() => { marcoMorte(12); marcoMorte(45); marcoMorte(200); });
  assert.deepEqual(v, ["life/first_death/complete", "life/first_death_0_30s/complete"],
    "deduplicada por string, a faixa saía uma vez por FAIXA: o histograma deixava de ser o da primeira morte");
});

test("`_zera` baixa o portão (um teste não pode vazar o tutorial para o seguinte)", () => {
  portaoTutorial(true); _zera(); assert.equal(noTutorial(), false);
});

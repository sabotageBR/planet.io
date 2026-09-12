// ── A TABELA DO ?perf ─────────────────────────────────────────────────────────
// Só o que é PURO: `resumo` é a política ("de quem foi o frame longo?") e o gravador é um relógio em
// volta dela. O molde é o de client/test/quality.test.js — a decisão se confere em tabela, o efeito
// colateral fica no chamador.
import test from "node:test";
import assert from "node:assert/strict";
import {resumo,criaPerf,LIMIAR_MS,AMOSTRA} from "../src/game/perf.js";

const f=(ms,fases)=>({ms,fases});
/** Queima `ms` de relógio de parede: o gravador mede `performance.now()`, então o teste precisa gastar. */
const bloqueia=ms=>{const t0=performance.now();while(performance.now()-t0<ms);};

test("ordena por TOTAL, não pelo pior caso — três bakes de 9 ms doem mais que um de 40", () => {
  const r = resumo([
    f(30, {bakeBorder: 9, render: 3}),
    f(28, {bakeBorder: 9, render: 3}),
    f(27, {bakeBorder: 9, render: 3}),
    f(45, {assaCeu: 40, render: 3}),
  ]);
  // totais: assaCeu 40 · bakeBorder 27 · render 12
  assert.deepEqual(r.map(x => x.nome), ["assaCeu", "bakeBorder", "render"]);
  // ⚠️ O QUE O TESTE TRANCA É A COLUNA `n`: com ela, "40 ms uma vez na virada de tema" e "9 ms três
  // vezes por segundo" param de parecer o mesmo problema. Sem ela, ordenar por total é um número solto.
  const border = r.find(x => x.nome === "bakeBorder");
  assert.equal(border.n, 3);
  assert.equal(border.total, 27);
  assert.equal(border.pior, 9);
});

test("fase que aparece em um frame só continua na tabela — ela é o pior caso de alguém", () => {
  const r = resumo([f(20, {render: 5}), f(90, {assaAtlas: 85})]);
  assert.equal(r[0].nome, "assaAtlas");
  assert.equal(r[0].n, 1);
  assert.equal(r[0].pior, 85);
});

test("sem amostra nenhuma, tabela vazia — nunca uma linha com zero", () => {
  assert.deepEqual(resumo([]), []);
});

// ── o gravador ──────────────────────────────────────────────────────────────
test("desligado é no-op: nem relatório, nem amostra, nem custo", () => {
  const p = criaPerf(false);
  assert.equal(p.ativo, false);
  p.ini("x"); p.fim("x"); p.frame(1000);
  assert.equal(p.relatorio(), "");
});

test("só o frame RUIM vira amostra, e o resto do tempo é declarado como não medido", () => {
  const p = criaPerf(true);
  p.frame(1);                       // frame bom: não entra
  p.ini("a"); p.fim("a"); p.frame(LIMIAR_MS + 10);
  const t = p.relatorio();
  assert.match(t, /1 acima de/, "um frame ruim entre dois");
  // ⚠️ `(não medido)` é a linha que impede a tabela de mentir: sem ela, um frame de 40 ms com 2 ms
  // instrumentados pareceria um frame de 2 ms, e a conclusão seria "não é o render" — quando o que a
  // medição diz de verdade é "não sei de quem é".
  assert.match(t, /\(não medido\)/);
});

test("`fim` sem `ini` é ignorado, e o par desbalanceado não contamina o frame seguinte", () => {
  const p = criaPerf(true);
  p.fim("orfa");
  p.ini("aberta");                  // nunca fechada
  p.frame(LIMIAR_MS + 5);
  p.frame(LIMIAR_MS + 5);           // o segundo frame não pode herdar a fase aberta do primeiro
  const t = p.relatorio();
  assert.doesNotMatch(t, /orfa/);
  assert.doesNotMatch(t, /aberta/);
});

// ⚠️ O CASO QUE FAZIA A LINHA DO NÃO MEDIDO FICAR NEGATIVA. `assaTextura` e `bakeBorder` acontecem
// DENTRO de `render`: somar as três daria mais que o frame, e a conta do resto viraria um número
// negativo — que não é "pouco erro de medição", é a tabela dizendo uma impossibilidade.
test("fase aninhada não é contada duas vezes: o `(não medido)` nunca fica negativo", () => {
  const p = criaPerf(true);
  p.ini("render");
  p.ini("assaTextura"); bloqueia(6); p.fim("assaTextura");
  bloqueia(4);
  p.fim("render");
  p.frame(LIMIAR_MS + 3);
  const t = p.relatorio();
  const m = /\(não medido\)\s+total (-?[\d.]+)/.exec(t);
  assert.ok(m, "a linha existe: " + t);
  assert.ok(Number(m[1]) >= 0, "não medido = " + m[1] + " (o aninhamento estava sendo somado duas vezes)");
  assert.match(t, /assaTextura/, "e a fase aninhada continua na tabela — é a informação que se quer");
});

test("guarda os PIORES, não os primeiros: o engasgo dos dez minutos cabe na janela", () => {
  const p = criaPerf(true);
  for (let i = 0; i < AMOSTRA * 3; i++) { p.ini("comum"); p.fim("comum"); p.frame(LIMIAR_MS + 1); }
  p.ini("raro"); p.fim("raro"); p.frame(900);   // chega DEPOIS de a janela já ter enchido
  assert.match(p.relatorio(), /raro/, "a amostra é ordenada e cortada pelo pior, não pela chegada");
});

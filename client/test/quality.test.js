// ── Política de qualidade: subir/descer o nível econômico ───────────────────────────────────
// `passoQualidade` é pura de propósito — a decisão que antes vivia colada ao laço de render, em cinco
// variáveis soltas, agora dá para ser conferida numa tabela. node --test client/test/quality.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { QUALITY, passoQualidade, qualidadeZero } from "../src/game/quality.js";

const Q = QUALITY, LENTO = Q.SLOW_MS + 5, RAPIDO = Q.FAST_MS - 5, MORTO = (Q.SLOW_MS + Q.FAST_MS) / 2;
// estado "assentado": nada mudou há muito tempo, então nenhuma carência nem backoff está de pé
const assentado = (x = {}) => ({ ...qualidadeZero(), mudouAt: -1e9, desceuAt: -1e9, ...x });

// caso, estado, entrada, nível esperado
const TABELA = [
  ["frame rápido no nível 0 não faz nada",      assentado(),                    { now: 1e6, ms: RAPIDO, nivel: 0 }, 0],
  ["frame lento isolado não sobe",              assentado(),                    { now: 1e6, ms: LENTO,  nivel: 0 }, 0],
  ["lentidão sustentada sobe um nível",         assentado({ lento: 1e6 }),      { now: 1e6 + Q.SOBE_MS + 1, ms: LENTO, nivel: 0 }, 1],
  ["sobe um de cada vez, nunca dois",           assentado({ lento: 1e6 }),      { now: 1e6 + Q.SOBE_MS + 1, ms: LENTO, nivel: 1 }, 2],
  ["no teto não sobe mais",                     assentado({ lento: 1e6 }),      { now: 1e6 + Q.SOBE_MS + 1, ms: LENTO, nivel: Q.MAX }, Q.MAX],
  ["zona morta não conta como lento",           assentado({ lento: 1e6 }),      { now: 1e6 + Q.SOBE_MS + 1, ms: MORTO, nivel: 0 }, 0],
  ["zona morta não conta como rápido",          assentado({ rapido: 1e6 }),     { now: 1e6 + Q.DESCE_MS + 1, ms: MORTO, nivel: 1 }, 1],
  ["rapidez sustentada devolve um nível",       assentado({ rapido: 1e6 }),     { now: 1e6 + Q.DESCE_MS + 1, ms: RAPIDO, nivel: 1 }, 0],
  ["no nível 0 não desce",                      assentado({ rapido: 1e6 }),     { now: 1e6 + Q.DESCE_MS + 1, ms: RAPIDO, nivel: 0 }, 0],
  ["a descida espera o backoff",                assentado({ rapido: 1e6, mudouAt: 1e6 }), { now: 1e6 + Q.DESCE_MS + 1, ms: RAPIDO, nivel: 1 }, 1],
  // a carência é o que impede a cascata: o rebake da própria troca produz um frame longo
  ["carência: não sobe logo após trocar",       assentado({ lento: 1, mudouAt: 1e6 }),    { now: 1e6 + Q.SEGURA_MS - 1, ms: LENTO, nivel: 0 }, 0],
  ["carência: não desce logo após trocar",      assentado({ rapido: 1, mudouAt: 1e6 }),   { now: 1e6 + Q.SEGURA_MS - 1, ms: RAPIDO, nivel: 1 }, 1],
];

test("tabela da política de qualidade", () => {
  for (const [caso, st, e, esperado] of TABELA) {
    const r = passoQualidade(st, e);
    assert.equal(r.nivel, esperado, caso);
  }
});

test("a política é pura: não muta o estado recebido", () => {
  const st = assentado({ lento: 1e6 }), copia = { ...st };
  passoQualidade(st, { now: 1e6 + Q.SOBE_MS + 1, ms: LENTO, nivel: 0 });
  assert.deepEqual(st, copia);
});

/** Roda uma partida inteira; `msDe(now,nivel,desdeTroca)` devolve o tempo do frame. */
function simula(msDe, total) {
  // `mudouAt/desceuAt` no passado remoto: sem isso o backoff inicial nunca vence e a descida jamais roda
  let st = { ...qualidadeZero(), mudouAt: -1e9, desceuAt: -1e9 };
  let nivel = 0, now = 0, ultima = -1e9, pico = 0;
  const trocas = [];
  while (now < total) {
    const ms = msDe(now, nivel, now - ultima);
    const r = passoQualidade(st, { now, ms, nivel });
    st = r.st;
    if (r.nivel !== nivel) { trocas.push({ now, de: nivel, para: r.nivel }); nivel = r.nivel; ultima = now; pico = Math.max(pico, nivel); }
    now += ms;
  }
  return { nivel, pico, trocas, n: trocas.length };
}

test("máquina saudável nunca sai do nível cheio", () => {
  const r = simula(() => 16, 60000);
  assert.equal(r.nivel, 0);
  assert.equal(r.n, 0);
});

test("máquina fraca desce até o mínimo e para lá", () => {
  const r = simula(() => 30, 60000);
  assert.equal(r.nivel, QUALITY.MAX);
  assert.equal(r.n, QUALITY.MAX, "uma troca por nível, sem repique");
});

// O BUG: cada troca reassa o céu, e esse frame longo era lido como lentidão pela medição seguinte, que
// subia o nível de novo. Duas quedas viravam uma escada até o mínimo, cada degrau piscando a tela.
// Aqui o nível 1 já resolve (16 ms) — chegar ao mínimo seria o rebake se realimentando.
test("o engasgo da própria troca não dispara a troca seguinte", () => {
  const r = simula((now, nivel, desdeTroca) => (desdeTroca < 400 ? 300 : nivel > 0 ? 16 : 25), 60000);
  assert.equal(r.pico, 1, "o rebake empurrou o nível para além do necessário");
  // escada = duas trocas seguidas na MESMA direção, coladas. Reverter (descer e voltar a subir) é a aposta
  // de recuperar nitidez falhando, que o backoff espaça sozinho — ver o teste seguinte.
  const escada = r.trocas.some((t, i) => i > 0 && t.para - t.de === r.trocas[i - 1].para - r.trocas[i - 1].de && t.now - r.trocas[i - 1].now < 10000);
  assert.ok(!escada, `escada de trocas: ${JSON.stringify(r.trocas)}`);
});

// A queixa original: "dá umas piscadas". Descer é uma APOSTA (tentar devolver nitidez); quando ela falha, o
// backoff dobra e as tentativas se espaçam. O que não pode é a aposta se repetir para sempre no mesmo ritmo.
test("as tentativas de recuperar nitidez vão se espaçando", () => {
  const r = simula(now => (Math.floor(now / 3000) % 2 ? 30 : 14), 300000);
  const antes = r.trocas.filter(t => t.now < 150000).length, depois = r.trocas.filter(t => t.now >= 150000).length;
  assert.ok(depois < antes, `${antes} trocas na 1ª metade contra ${depois} na 2ª: o backoff não está aprendendo`);
});

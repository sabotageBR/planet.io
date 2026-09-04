// ── A lógica da tela AO VIVO do /admin (client/src/admin/vivo.js) ────────────
// Módulo puro, testado sem jsdom — o mesmo contrato de `admin-ordenar.test.js`, e a única forma de haver
// teste automatizado do painel. node --test client/test/admin-live.test.js
//
// O que NÃO está coberto aqui, para ninguém achar que está: o stream real (fetch/ReadableStream), o tempo
// do backoff, a aba em segundo plano, o CSS e a checagem das classes `lv-*` contra bloqueador de anúncio.
// Isso é verificação no navegador, à mão.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fatiaFrames, criaAnel, empurra, lista, chaveDe, grupoDe, textoDe, coalesce, limita,
  filtra, sparkPath, empurraSerie, proxEspera, terminal, escreveCursor, avancaCursor } from "../src/admin/vivo.js";
import { ADMIN_BUS } from "@warspace/shared/constants.js";

const ev = (o = {}) => ({ shard: 0, seq: 1, at: 1000, kind: "kill", sala: "1ABC", a: "A", b: "B", ...o });

// ── 1. O parser do SSE ───────────────────────────────────────────────────────
test("frames: um frame completo vira evento", () => {
  const { frames, resto } = fatiaFrames('event: ev\ndata: [1,2]\n\n');
  assert.equal(frames.length, 1);
  assert.equal(frames[0].evento, "ev");
  assert.deepEqual(frames[0].dados, [1, 2]);
  assert.equal(resto, "");
});

test("frames: CHUNK CORTANDO UM FRAME AO MEIO — o bug de todo SSE feito à mão", () => {
  const a = fatiaFrames('event: ev\ndata: [{"x":');
  assert.equal(a.frames.length, 0, "frame incompleto não pode virar evento");
  assert.ok(a.resto.length, "e o pedaço fica guardado");
  const b = fatiaFrames(a.resto + '1}]\n\n');
  assert.equal(b.frames.length, 1);
  assert.deepEqual(b.frames[0].dados, [{ x: 1 }]);
});

test("frames: CRLF também separa (um proxy pode reescrever)", () => {
  const { frames } = fatiaFrames('event: ev\r\ndata: 1\r\n\r\n');
  assert.equal(frames.length, 1);
  assert.equal(frames[0].dados, 1);
});

test("frames: o heartbeat `:` não vira evento — mas o chamador conta os bytes dele", () => {
  const { frames } = fatiaFrames(': ping\n\n');
  assert.equal(frames.length, 0, "comentário não é evento");
});

// A spec do SSE manda juntar vários `data:` com `\n`. Hoje o servidor sempre manda um `JSON.stringify`
// numa linha só (ele já escapa a quebra de linha), então isto é conformidade e não um caso vivo — mas um
// proxy que quebre linhas longas não pode transformar o painel em tela vazia.
test("frames: vários `data:` no mesmo frame se juntam com \\n (conformidade com a spec)", () => {
  const { frames } = fatiaFrames('event: ev\ndata: {"a":\ndata: 1}\n\n');
  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0].dados, { a: 1 });
});

test("frames: o `id:` é capturado (é o Last-Event-ID da reconexão)", () => {
  const { frames } = fatiaFrames('id: 42\nevent: ev\ndata: 1\n\n');
  assert.equal(frames[0].id, "42");
});

test("frames: acumulador acima do teto é DESCARTADO em vez de crescer sem fim", () => {
  const { resto } = fatiaFrames("data: " + "x".repeat(300 * 1024));
  assert.equal(resto, "", "senão a aba morre e o sintoma é 'o navegador ficou lento'");
});

test("frames: JSON inválido não derruba o parser (nem vira evento)", () => {
  const { frames } = fatiaFrames('event: ev\ndata: {quebrado\n\n');
  assert.equal(frames.length, 0);
});

// ── 2. O anel ────────────────────────────────────────────────────────────────
test("anel: guarda N e o (N+1)-ésimo derruba o mais antigo", () => {
  const a = criaAnel(3);
  for (let i = 1; i <= 4; i++) empurra(a, ev({ seq: i }));
  assert.deepEqual(lista(a).map(e => e.seq), [4, 3, 2], "do mais novo para o mais velho");
});

test("anel: a volta do índice não duplica nem perde (o off-by-one clássico)", () => {
  const a = criaAnel(4);
  for (let i = 1; i <= 11; i++) empurra(a, ev({ seq: i }));
  const v = lista(a).map(e => e.seq);
  assert.deepEqual(v, [11, 10, 9, 8]);
  assert.equal(new Set(v).size, v.length);
});

test("anel: empurrar NÃO aloca — é a razão de não ser slice(-N)", () => {
  const a = criaAnel(3), buf = a.buf;
  for (let i = 0; i < 10; i++) empurra(a, ev({ seq: i }));
  assert.equal(a.buf, buf, "o mesmo buffer, sempre: nada de uma pausa de GC por segundo");
});

test("chave: é estável e não colide no mesmo milissegundo", () => {
  assert.notEqual(chaveDe(ev({ shard: 0, seq: 1 })), chaveDe(ev({ shard: 1, seq: 1 })));
  assert.notEqual(chaveDe(ev({ seq: 1 })), chaveDe(ev({ seq: 2 })));
  assert.equal(chaveDe(ev({ seq: 7 })), chaveDe(ev({ seq: 7 })));
});

// ── 3. Grupos e texto ────────────────────────────────────────────────────────
test("grupo: todo kind cai em ALGUM filtro — kind novo não pode sumir da tela", () => {
  const kinds = ["entrou", "saiu", "caiu", "kill", "hazard", "morte", "chat", "report",
    "marco", "fim", "sala+", "sala-", "lacuna", "inventado_amanha"];
  for (const k of kinds) assert.ok(["entra", "abate", "chat", "sis"].includes(grupoDe(k)), k);
  assert.equal(grupoDe("inventado_amanha"), "sis", "o default é sistema, nunca 'fora de todos'");
});

test("texto: cada kind produz frase legível, sem undefined vazando", () => {
  const casos = [
    ev({ kind: "entrou", quem: "Ana", conta: true }),
    ev({ kind: "saiu", quem: "Ana", por: "left", durouS: 134 }),
    ev({ kind: "caiu", quem: "Ana" }),
    ev({ kind: "kill", a: "Ana", b: "Bia", how: "eat" }),
    ev({ kind: "hazard", b: "Bia", how: "zone" }),
    ev({ kind: "morte", quem: "Ana", abates: 3, durouS: 90, score: 12 }),
    ev({ kind: "chat", quem: "Ana", txt: "oi" }),
    ev({ kind: "report", de: "Ana", alvo: "Bia" }),
    ev({ kind: "marco", how: "lead", a: "Ana" }),
    ev({ kind: "fim", campeao: "Ana", total: 12 }),
    ev({ kind: "sala+" }), ev({ kind: "sala-", por: "vazia" }),
    ev({ kind: "lacuna", n: 37 }), ev({ kind: "lacuna", n: -1 }), ev({ kind: "corte" }),
  ];
  for (const c of casos) {
    const t = textoDe(c);
    assert.ok(t && t.length, c.kind);
    assert.ok(!/undefined|NaN|\[object/.test(t), `${c.kind}: "${t}"`);
  }
});

test("texto: a lacuna diz o que é — silêncio aqui seria a pior falha do painel", () => {
  assert.match(textoDe(ev({ kind: "lacuna", n: 37 })), /37/);
  assert.match(textoDe(ev({ kind: "lacuna", n: -1 })), /reinici/);
});

// ── 4. Coalescência ──────────────────────────────────────────────────────────
test("coalesce: três iguais e adjacentes viram uma linha ×3", () => {
  const v = coalesce([ev({ at: 3000 }), ev({ at: 2000 }), ev({ at: 1000 })]);
  assert.equal(v.length, 1);
  assert.equal(v[0].n_, 3);
  assert.equal(v[0].at, 3000, "mostra o timestamp da CABEÇA (o mais recente da lista)");
});

test("coalesce: fora da janela NÃO junta", () => {
  const v = coalesce([ev({ at: 20000 }), ev({ at: 1000 })], 4000);
  assert.equal(v.length, 2);
});

test("coalesce: um evento diferente no meio QUEBRA a sequência (adjacência é escolha, não acidente)", () => {
  const v = coalesce([ev({ at: 3000 }), ev({ at: 2500, kind: "chat", quem: "X", txt: "oi" }), ev({ at: 2000 })]);
  assert.equal(v.length, 3, "senão a linha antiga saltaria para cima ao repetir");
});

test("coalesce: chat e denúncia NUNCA se juntam — cada linha é conteúdo próprio", () => {
  const c = { ...ev({ kind: "chat", quem: "Ana", txt: "oi" }) };
  const v = coalesce([{ ...c, at: 3000 }, { ...c, at: 2900 }]);
  assert.equal(v.length, 2);
});

test("coalesce: não muda a entrada (o anel é a verdade e não pode ser reescrito)", () => {
  const a = ev({ at: 3000 }), b = ev({ at: 2000 });
  coalesce([a, b]);
  assert.equal(a.n_, undefined);
});

test("limita: acima do teto vira UMA linha de resumo, e ela APARECE", () => {
  const v = [];
  for (let i = 0; i < ADMIN_BUS.TETO_S + 15; i++) v.push(ev({ at: 5000, seq: i }));
  const out = limita(v);
  assert.equal(out.length, ADMIN_BUS.TETO_S + 1);
  const r = out[out.length - 1];
  assert.equal(r.kind, "resumo");
  assert.equal(r.n_, 14, "log truncado em silêncio é log mentiroso");
});

// ── 5. Filtro ────────────────────────────────────────────────────────────────
test("filtra: por grupo", () => {
  const v = [ev({ kind: "kill" }), ev({ kind: "chat", quem: "A", txt: "oi" }), ev({ kind: "entrou", quem: "A" })];
  assert.equal(filtra(v, { grupos: new Set(["chat"]) }).length, 1);
  assert.equal(filtra(v, { grupos: new Set(["chat", "abate"]) }).length, 2);
  assert.equal(filtra(v, { grupos: new Set() }).length, 3, "nenhum grupo marcado = tudo");
});

test("filtra: por sala, por PREFIXO e sem caixa", () => {
  const v = [ev({ sala: "1ABC" }), ev({ sala: "2XY9" })];
  assert.equal(filtra(v, { sala: "1a" }).length, 1);
  assert.equal(filtra(v, { sala: "1ABC" }).length, 1);
  assert.equal(filtra(v, { sala: "9" }).length, 0);
});

test("filtra: nick SEM ACENTO — digitar 'kaua' tem que achar 'Kauã'", () => {
  const v = [ev({ kind: "entrou", quem: "Kauã" }), ev({ kind: "entrou", quem: "Bia" })];
  assert.equal(filtra(v, { nick: "kaua" }).length, 1);
  assert.equal(filtra(v, { nick: "KAUÃ" }).length, 1);
});

test("filtra: o aviso de lacuna NUNCA é filtrado", () => {
  const v = [ev({ kind: "lacuna", n: 5, sala: undefined })];
  assert.equal(filtra(v, { grupos: new Set(["chat"]), sala: "9ZZZ", nick: "ninguem" }).length, 1);
});

test("filtra: roda DEPOIS de coalescer — o ×3 sobrevive ao filtro de nick", () => {
  const v = coalesce([ev({ kind: "entrou", quem: "Ana", at: 3000 }),
    ev({ kind: "entrou", quem: "Ana", at: 2000 })]);
  const f = filtra(v, { nick: "ana" });
  assert.equal(f.length, 1);
  assert.equal(f[0].n_, 2, "filtrar antes separaria o grupo e a contagem mudaria com o filtro");
});

// ── 6. Sparkline ─────────────────────────────────────────────────────────────
test("spark: N amostras, N pontos, e o Y INVERTIDO (SVG cresce para baixo)", () => {
  const s = sparkPath([0, 10], { w: 60, h: 20 });
  assert.equal(s.length, 1);
  const p = s[0].split(" ");
  assert.equal(p.length, 2);
  assert.match(p[0], /^0,20/, "o menor valor fica embaixo (y = h)");
  assert.match(p[1], /^60,0/, "o maior fica em cima (y = 0)");
});

test("spark: SÉRIE CHATA não produz NaN — senão o polyline SOME sem erro no console", () => {
  for (const serie of [[5, 5, 5], [0, 0], [7]]) {
    const s = sparkPath(serie).join(" ");
    assert.ok(!/NaN/.test(s), `NaN em ${JSON.stringify(serie)}`);
    assert.ok(s.length, "e desenha alguma coisa (reta no meio)");
  }
});

test("spark: série vazia devolve nada, sem lançar", () => {
  assert.deepEqual(sparkPath([]), []);
  assert.deepEqual(sparkPath(null), []);
  assert.deepEqual(sparkPath([null, null]), []);
});

test("spark: `null` é LACUNA e QUEBRA a linha — nunca vira zero", () => {
  const s = sparkPath([10, null, 10]);
  assert.equal(s.length, 2, "dois segmentos: uma reconexão desenhada como 0 vira um apagão falso");
});

test("serie: a janela mantém o tamanho e o null sobrevive como lacuna", () => {
  let s = [];
  for (let i = 0; i < ADMIN_BUS.SERIE + 10; i++) s = empurraSerie(s, i);
  assert.equal(s.length, ADMIN_BUS.SERIE);
  assert.equal(s[s.length - 1], ADMIN_BUS.SERIE + 9);
  assert.equal(empurraSerie([1, 2], null)[2], null);
});

// ── 7. Reconexão e cursor ────────────────────────────────────────────────────
test("backoff: sobe e TRAVA no teto — nunca devolve undefined", () => {
  assert.equal(proxEspera(0), ADMIN_BUS.ESPERA_MS[0]);
  assert.equal(proxEspera(99), ADMIN_BUS.ESPERA_MS[ADMIN_BUS.ESPERA_MS.length - 1],
    "sem desistência: um painel que para de tentar é um painel que mente calado");
  assert.equal(proxEspera(-5), ADMIN_BUS.ESPERA_MS[0]);
});

test("terminal: só 401/403 — o resto reconecta", () => {
  assert.equal(terminal(401), true);
  assert.equal(terminal(403), true);
  for (const s of [500, 503, 429, 200, 0]) assert.equal(terminal(s), false, String(s));
});

test("cursor: escreve compacto e avança pelo MAIOR seq de cada shard", () => {
  const m = new Map();
  avancaCursor(m, [ev({ shard: 0, seq: 4 }), ev({ shard: 1, seq: 9 }), ev({ shard: 0, seq: 2 })]);
  assert.equal(m.get(0).seq, 4, "um lote fora de ordem não pode fazer o cursor ANDAR PARA TRÁS");
  assert.equal(m.get(1).seq, 9);
  assert.equal(escreveCursor(m), "0:4:0,1:9:0");
});

test("cursor: a lacuna (shard -1) não entra no cursor", () => {
  const m = new Map();
  avancaCursor(m, [{ shard: -1, kind: "corte", at: 1 }]);
  assert.equal(m.size, 0);
});

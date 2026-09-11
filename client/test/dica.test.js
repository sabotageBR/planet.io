// ── A DICA DO DIVIDIR ─────────────────────────────────────────────────────────
// `game/dica.js` é pura porque a decisão é o que precisa ser conferido e não há jsdom no projeto — o mesmo
// arranjo de `game/quality.js`, `ui/roundClock.js` e `admin/ordenar.js`.
// O que este arquivo trava é COMPORTAMENTO: a dica nunca anuncia um botão que o servidor recusa, some no
// primeiro split, e não vira parede.
// Rodar: node --test client/test/dica.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { SPLIT, EAT } from "@warspace/shared";
import { temPresa, temComivel, passoDica, passoMissao, DICA, DICA0, MISSAO, MISSAO0, MISSAO_VETERANO, ETAPA } from "../src/game/dica.js";

const GRANDE = SPLIT.MIN_R + 10;                 // posso dividir
const PEQUENO = SPLIT.MIN_R - 10;                // não posso
const comivel = GRANDE / EAT.RATIO - 1;          // raio que eu engulo com folga

test("sem poder dividir NÃO há dica, por maior que seja a presa ao lado", () => {
  const me = { x: 0, y: 0, r: PEQUENO };
  assert.equal(temPresa(me, [{ x: 10, y: 0, r: 1 }]), false,
    "com r < SPLIT.MIN_R o servidor recusa o split — anunciá-lo seria ensinar um botão morto");
});

test("presa só conta se for ENGOLÍVEL e estiver ao alcance de um salto", () => {
  const me = { x: 0, y: 0, r: GRANDE };
  assert.equal(temPresa(me, [{ x: 100, y: 0, r: comivel }]), true);
  assert.equal(temPresa(me, [{ x: 100, y: 0, r: GRANDE }]), false, "do meu tamanho eu não engulo");
  assert.equal(temPresa(me, [{ x: SPLIT.DIST + 1, y: 0, r: comivel }]), false, "fora do alcance do arremesso");
  assert.equal(temPresa(me, [{ x: SPLIT.DIST, y: 0, r: comivel }]), true, "na fronteira ainda vale");
  assert.equal(temPresa(me, []), false);
  assert.equal(temPresa(null, [{ x: 0, y: 0, r: 1 }]), false, "sem peça própria não há de onde saltar");
});

test("aparece com presa, fica no ar por DUR_MS e não reavalia enquanto está visível", () => {
  let e = DICA0;
  let r = passoDica(e, { pode: true, presa: true }, 1000);
  assert.equal(r.visivel, true); assert.equal(r.est.n, 1);
  e = r.est;
  r = passoDica(e, { pode: true, presa: false }, 1000 + DICA.DUR_MS - 1);
  assert.equal(r.visivel, true, "a presa fugir no meio não apaga a frase pela metade");
  r = passoDica(e, { pode: true, presa: false }, 1000 + DICA.DUR_MS);
  assert.equal(r.visivel, false);
});

test("DIVIDIR apaga na hora e não gasta aparição — a lição foi aprendida", () => {
  let e = passoDica(DICA0, { pode: true, presa: true }, 0).est;
  const r = passoDica(e, { pode: false, presa: true }, 100);
  assert.equal(r.visivel, false);
  assert.equal(r.est.ate, 0, "morrer, pausar, sair ou dividir apagam no mesmo caminho");
  assert.equal(r.est.n, 1, "o contador não anda: `pode:false` não é uma aparição");
});

test("respeita o intervalo entre aparições e o teto por vida", () => {
  let e = DICA0, agora = 0, vistas = 0;
  for (let i = 0; i < 400; i++) {
    const r = passoDica(e, { pode: true, presa: true }, agora);
    if (r.visivel && r.est.n > e.n) vistas++;
    e = r.est; agora += 500;
  }
  assert.equal(vistas, DICA.MAX, "não vira parede: o teto é por VIDA");
});

test("o intervalo é respeitado mesmo com presa o tempo todo", () => {
  let e = passoDica(DICA0, { pode: true, presa: true }, 0).est;
  const cedo = passoDica(e, { pode: true, presa: true }, DICA.DUR_MS + DICA.GAP_MS - 1);
  assert.equal(cedo.est.n, 1, "antes do intervalo não abre a segunda");
  const naHora = passoDica(e, { pode: true, presa: true }, DICA.DUR_MS + DICA.GAP_MS);
  assert.equal(naHora.est.n, 2);
});

test("estado zerado nasce invisível", () => {
  assert.deepEqual(DICA0, { n: 0, ate: 0, prox: 0 });
  assert.equal(passoDica(DICA0, { pode: true, presa: false }, 0).visivel, false);
});

// ── A MISSÃO DE SESSÃO 0 ─────────────────────────────────────────────────────
// Três etapas em cima do `passoDica`, que NÃO mudou uma linha: os sete testes acima são a prova disso, e
// o último bloco aqui dirige os dois em paralelo para travá-la.
// O que este bloco cobra: a ordem, a invariante de UMA faixa por vez, a festa saindo uma vez só, e o
// veterano da 2ª vida da sessão se comportando exatamente como o jogo se comportava antes da missão.

const CTX0 = { vivo: true, comidas: 0, comeuAlguem: false, comivel: false, pode: true, presa: false };
const ctx = o => ({ ...CTX0, ...o });

test("`banda` é SEMPRE uma string só — 'no máximo uma faixa por vez' é impossível de violar", () => {
  let est = MISSAO0;
  for (const c of [ctx({}), ctx({ comidas: 8 }), ctx({ comivel: true }), ctx({ presa: true }), ctx({ vivo: false })]) {
    const r = passoMissao(est, c, 1000); est = r.est;
    assert.equal(typeof r.banda, "string", "a forma do retorno é a invariante");
  }
});

test("a missão começa em COMA AS PEDRAS, sem depender de nada na tela", () => {
  const r = passoMissao(MISSAO0, ctx({}), 1000);
  assert.equal(r.banda, "comer", "a etapa 1 não espera presa nem tamanho: ela vale desde o nascimento");
});

test("8 pedras fecham a etapa 1 — 7 não", () => {
  assert.equal(passoMissao(MISSAO0, ctx({ comidas: MISSAO.COMIDAS - 1 }), 1000).festa, 0);
  const r = passoMissao(MISSAO0, ctx({ comidas: MISSAO.COMIDAS }), 1000);
  assert.equal(r.festa, ETAPA.COMER, "a festa sai no tick em que completa");
  assert.equal(r.banda, "comer", "e o texto FICA mais um instante — some depois de MISSAO.SOBRA_MS");
});

test("a festa sai UMA vez, mesmo comendo mais 12 pedras", () => {
  let est = passoMissao(MISSAO0, ctx({ comidas: 8 }), 1000).est, festas = 0;
  for (let t = 1000; t < 1000 + MISSAO.SOBRA_MS; t += 125) {
    const r = passoMissao(est, ctx({ comidas: 20 }), t); est = r.est; if (r.festa) festas++;
  }
  assert.equal(festas, 0, "nos ticks seguintes ela não repete — sem flag no chamador");
});

test("passada a sobra, sobe a etapa 2 — e ela só aparece com presa à vista", () => {
  let est = passoMissao(MISSAO0, ctx({ comidas: 8 }), 1000).est;
  const semPresa = passoMissao(est, ctx({ comidas: 8 }), 1000 + MISSAO.SOBRA_MS + 1);
  assert.equal(semPresa.banda, "", "sem ninguém comível na tela, a faixa mentiria");
  const comPresa = passoMissao(semPresa.est, ctx({ comidas: 8, comivel: true }), 1000 + MISSAO.SOBRA_MS + 2);
  assert.equal(comPresa.banda, "presa");
});

test("a etapa 2 tem PISO de tela: a presa saindo da AOI não faz a faixa piscar", () => {
  let est = passoMissao(MISSAO0, ctx({ comidas: 8 }), 1000).est;
  est = passoMissao(est, ctx({ comidas: 8, comivel: true }), 5000).est;   // subiu
  const sumiu = passoMissao(est, ctx({ comidas: 8, comivel: false }), 5100);
  assert.equal(sumiu.banda, "presa", "dentro do piso ela FICA, mesmo sem presa");
  const depois = passoMissao(sumiu.est, ctx({ comidas: 8, comivel: false }), 5000 + DICA.DUR_MS + 1);
  assert.equal(depois.banda, "", "passado o piso, some");
});

test("comer alguém fecha a etapa 2", () => {
  let est = passoMissao(MISSAO0, ctx({ comidas: 8 }), 1000).est;
  est = passoMissao(est, ctx({ comidas: 8, comivel: true }), 5000).est;
  const r = passoMissao(est, ctx({ comidas: 8, comeuAlguem: true }), 5100);
  assert.equal(r.festa, ETAPA.PRESA);
});

test("ATALHO: quem já comeu alguém na etapa 1 pula a 2", () => {
  let est = passoMissao(MISSAO0, ctx({ comidas: 8, comeuAlguem: true }), 1000).est;
  const r = passoMissao(est, ctx({ comidas: 8, comeuAlguem: true, presa: true }), 1000 + MISSAO.SOBRA_MS + 1);
  assert.equal(r.banda, "split", "ensinar o que já foi feito é ruído");
});

test("a etapa 3 é BYTE A BYTE o `passoDica` de hoje", () => {
  // dirigir os dois em paralelo com a mesma entrada: se a delegação se desviar, isto fica vermelho
  let m = MISSAO_VETERANO, d = DICA0;
  for (let t = 0; t < 90000; t += 125) {
    const presa = (t / 125) % 40 < 25;                       // liga e desliga a presa ao longo do tempo
    const rm = passoMissao(m, ctx({ presa }), t); m = rm.est;
    const rd = passoDica(d, { pode: true, presa }, t); d = rd.est;
    assert.equal(rm.banda === "split", rd.visivel, `divergiu em t=${t}`);
    assert.deepEqual(m.dica, d, `estado divergiu em t=${t}`);
  }
});

test("o VETERANO da 2ª vida da sessão se comporta como o jogo antes da missão", () => {
  const r = passoMissao(MISSAO_VETERANO, ctx({ comidas: 0, presa: true }), 1000);
  assert.equal(r.banda, "split", "comer grão e comer quem é menor ele já sabe");
  assert.equal(r.festa, 0, "e não há festa a repetir");
});

test("morto/pausado apaga tudo e NÃO gasta aparição", () => {
  let est = passoMissao(MISSAO_VETERANO, ctx({ presa: true }), 1000).est;
  const n = est.dica.n;
  const r = passoMissao(est, ctx({ vivo: false, presa: true }), 1100);
  assert.equal(r.banda, "");
  assert.equal(r.est.dica.n, n, "a mesma regra do `pode:false` de passoDica");
  assert.equal(r.est.ate, 0);
});

test("`passoMissao` é PURA: não muta o estado recebido", () => {
  const est = { ...MISSAO0, dica: { ...DICA0 } }, copia = JSON.parse(JSON.stringify(est));
  passoMissao(est, ctx({ comidas: 99, comivel: true, presa: true }), 1234);
  assert.deepEqual(est, copia);
});

test("`temComivel` vê o que `temPresa` recusa: a etapa 2 não pede o portão do split", () => {
  const novato = { x: 0, y: 0, r: PEQUENO };                 // não pode dividir
  const presa = [{ x: 100, y: 0, r: PEQUENO / EAT.RATIO - 1 }];
  assert.equal(temPresa(novato, presa), false, "dividir continua trancado — anunciá-lo seria mentir");
  assert.equal(temComivel(novato, presa), true, "mas COMER não pede portão nenhum: é só ser maior");
});

test("e `temComivel` continua exigindo ser ENGOLÍVEL", () => {
  const me = { x: 0, y: 0, r: 40 };
  assert.equal(temComivel(me, [{ x: 10, y: 0, r: 40 }]), false, "do meu tamanho eu não engulo");
  assert.equal(temComivel(me, [{ x: 10, y: 0, r: 30 }]), true);
});

// ── A DICA DO DIVIDIR ─────────────────────────────────────────────────────────
// `game/dica.js` é pura porque a decisão é o que precisa ser conferido e não há jsdom no projeto — o mesmo
// arranjo de `game/quality.js`, `ui/roundClock.js` e `admin/ordenar.js`.
// O que este arquivo trava é COMPORTAMENTO: a dica nunca anuncia um botão que o servidor recusa, some no
// primeiro split, e não vira parede.
// Rodar: node --test client/test/dica.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { SPLIT, EAT } from "@warspace/shared";
import { temPresa, passoDica, DICA, DICA0 } from "../src/game/dica.js";

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

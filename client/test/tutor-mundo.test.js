// ── O TUTORIAL RODANDO NUM `World` DE VERDADE, SEM NAVEGADOR ─────────────────
// `shared/physics` é o mesmo código nos dois lados e roda no `node --test`, então dá para montar o mundo
// do tutorial, avançar o `step()` e AFIRMAR que as três etapas fazem o que prometem — sem Pixi, sem DOM
// e sem socket. O molde da arena é `shared/test/novato.test.js`.
//
// O que este arquivo trava são exatamente os defeitos que não dariam erro nenhum:
//   · o mundo do tutorial nascer (ou VOLTAR a ficar) povoado;
//   · a supernova estilhaçar o próprio aluno;
//   · a etapa 3 abrir com o servidor ainda recusando o split — o botão na tela e o `return 0` em silêncio;
//   · a etapa 2 abrir com os 10 s de carência do tiro ainda correndo.
// node --test client/test/tutor-mundo.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "@warspace/shared/physics/index.js";
import { applySplit, applyFire } from "@warspace/shared/physics/rules.js";
import { STAR, SPLIT, MISSILE, PLAYER, EAT } from "@warspace/shared";
import { OPCOES_TUTORIAL, CENA, criaRoteiro, montaEtapa, preparaJogador } from "../src/game/net/tutorServer.js";
import { ETAPA, TUTOR0 } from "../src/game/tutor.js";

/** Uma bancada: o mundo do tutorial, o roteiro, e um `api` que só anota o que seria mandado. */
function banca() {
  const w = createWorld({ seed: OPCOES_TUTORIAL.seed, food: OPCOES_TUTORIAL.food, ...OPCOES_TUTORIAL.mundo });
  const jsons = [], alvos = [];
  let prox = 1;
  const api = {
    json: o => jsons.push(o),
    alvo({ x, y, r }) { const s = prox++; w.addPlayer(s, { x, y, r, isBot: true }); alvos.push(s); return s; },
    tiraAlvo(s) { w.removePlayer(s); },
  };
  const rot = criaRoteiro();
  rot.nasce(w, 0, api);
  return { w, api, rot, jsons, alvos, st: rot.estado() };
}
const anda = (w, rot, api, n) => { for (let i = 0; i < n; i++) { w.step(); rot.passo(w, api); } };
const vivas = ps => ps.pieces.filter(p => !p.dead);

test("O MUNDO DO TUTORIAL NASCE VAZIO — e continua vazio", () => {
  // `stars`/`asteroids` nunca eram repassados ao `createWorld` pelo LocalServer e caíam nos defaults:
  // 19 estrelas e 58 asteroides num tutorial que promete "ambiente controlado".
  const { w, rot, api } = banca();
  assert.equal(w.foodAlive, 0);
  assert.equal(w.asteroids.length, 0);
  assert.equal(w.holes.length, 0);
  anda(w, rot, api, CENA.NOVA_ESPERA - 10);
  assert.equal(w.foodAlive, 0, "a fase 11 do step não repõe nada por conta própria");
  assert.equal(w.asteroids.length, 0);
  // ⚠️ Depois da supernova HÁ comida, e é de propósito: o berçário (`STAR.NOVA_FOOD` = 16 grãos
  // permanentes) faz parte do prêmio da etapa 1. O que não pode é o MUNDO repor sozinho.
  anda(w, rot, api, 600);
  assert.equal(w.foodAlive, STAR.NOVA_FOOD, "só o berçário, e nem um grão a mais");
});

test("o jogador nasce no centro, com o tamanho de estreia e SEM ímã", () => {
  const { w } = banca();
  const ps = w.players.get(0), pc = vivas(ps)[0];
  assert.equal(pc.r, PLAYER.SPAWN_R);
  assert.equal(Math.round(pc.x), w.w / 2);
  // ⚠️ O ímã de nascença arrasta os cacos da supernova, e com ele o jogador ganha a etapa 1 SEM SE MOVER
  // — que é justamente o que a etapa 1 existe para ensinar.
  assert.equal(pc.magnetUntil, 0);
});

test("ETAPA 1: a estrela explode e o aluno SOBREVIVE", () => {
  const { w, rot, api } = banca();
  // ⚠️ A cena é montada no primeiro `passo()`, não no `nasce()`: quem ABRE a etapa é a máquina pura, e o
  // diretor só monta o que ela abriu. Um lugar só decide, sempre.
  anda(w, rot, api, 1);
  assert.equal(w.stars.filter(s => !s.dead).length, 1, "uma estrela, plantada pelo roteiro");
  let nova = -1;
  for (let i = 0; i < CENA.NOVA_ESPERA + 60; i++) {
    w.step(); rot.passo(w, api);
    if (nova < 0 && w.events.some(e => e.type === "SUPERNOVA")) nova = w.tick;
  }
  assert.ok(nova > 0, "a supernova aconteceu");
  assert.ok(nova <= CENA.NOVA_ESPERA + 30, "e no tempo prometido, não daqui a um minuto");
  const ps = w.players.get(0);
  // ⚠️ O MIOLO É LETAL: `blast·NOVA_SHATTER` ≈ 290 px na fase OLD, e quem tem r ≥ SHATTER_MIN_R lá dentro
  // queima 30% da massa e racha. A distância de `CENA.DIST` e a guarda de `NOVA_SAFE` são o que impede o
  // tutorial de abrir punindo quem obedeceu.
  assert.equal(ps.alive, true, "o aluno está vivo");
  assert.equal(vivas(ps).length, 1, "e INTEIRO — não foi estilhaçado pela própria lição");
  assert.equal(Math.round(w.massOf(0)), PLAYER.SPAWN_R * PLAYER.SPAWN_R, "com a massa intacta");
});

test("...e ela deixa massa de sobra para o portão do dividir", () => {
  const { w, rot, api } = banca();
  anda(w, rot, api, CENA.NOVA_ESPERA + 30);
  const cacos = w.ejected.filter(e => !e.dead);
  assert.equal(cacos.length, STAR.NOVA_PARTICLES);
  const total = cacos.reduce((s, e) => s + e.mass, 0);
  // 9 cacos passam de `SPLIT.MIN_R²` (3.600) e 17 passam de `BOT.NOVATO_MASS` (6.000), que é o portão
  // REAL. Com `EAT.EJECT_GAIN`=1 a reabsorção devolve 100%.
  assert.ok(total > 6000 * 1.2, "há mais que a meta inteira no chão: " + Math.round(total));
  assert.equal(EAT.EJECT_GAIN, 1, "e reabsorver devolve tudo");
});

test("OS CACOS NÃO EVAPORAM NO MEIO DA LIÇÃO", () => {
  // `STAR.NOVA_LIFE_TICKS` = 900 = 15 s. Um novato descobrindo o mouse não come 17 cacos nesse tempo, e a
  // etapa 1 se esvaziaria sozinha — justo para quem esta feature existe para atender.
  const { w, rot, api } = banca();
  anda(w, rot, api, CENA.NOVA_ESPERA + 30);
  const vida = w.ejected.find(e => !e.dead).life - w.tick;
  assert.ok(vida > STAR.NOVA_LIFE_TICKS, `os cacos vivem ${vida} ticks, não os ${STAR.NOVA_LIFE_TICKS} de série`);
  // ⚠️ Daqui em diante, SEM o roteiro: o 2º degrau de ajuda faz os cacos derivarem até o jogador parado,
  // ele come tudo, a etapa fecha e a limpeza da etapa 2 leva o resto — que é o comportamento CERTO, e não
  // o que este teste mede. O que se quer provar é a VIDA do caco, isolada.
  for (let i = 0; i < STAR.NOVA_LIFE_TICKS + 120; i++) w.step();
  assert.ok(w.ejected.filter(e => !e.dead).length > 0, "e continuam lá muito depois dos 15 s de série");
});

test("NENHUMA ESTRELA FANTASMA nasce depois da supernova", () => {
  // `rules.supernova` chama `w.queueStar(STAR.RESPAWN_TICKS)`, e a fila é drenada INCONDICIONALMENTE na
  // fase 11 — `stars:0` não a impede. Sem a limpeza, uma estrela aparece em ponto sorteado do mapa 10 s
  // depois, no meio da etapa 2 ou 3.
  const { w, rot, api, st } = banca();
  anda(w, rot, api, CENA.NOVA_ESPERA + 30);
  montaEtapa(w, api, ETAPA.TIRO, 0, st);
  assert.equal(w.starQueue.length, 0, "a fila foi esvaziada ao trocar de etapa");
  anda(w, rot, api, STAR.RESPAWN_TICKS + 120);
  assert.equal(w.stars.filter(s => !s.dead).length, 0, "e nenhuma estrela voltou");
});

test("ETAPA 2: o tiro FUNCIONA no primeiro tick", () => {
  // `applyFire` exige munição (o humano nasce com ZERO no servidor local) e `w.tick >= ps.fireCdUntil`,
  // que `_spawnPiece` grava como tick+600 = 10 SEGUNDOS a cada nascimento. Sem os dois carimbos o botão
  // MÍSSIL não responde e o novato aprende que ele está quebrado.
  const { w, rot, api, st } = banca();
  const ps = w.players.get(0);
  assert.equal(ps.fireCdUntil > w.tick || ps.ammo[0] === 0, true, "de fábrica ele não atiraria...");
  montaEtapa(w, api, ETAPA.TIRO, 0, st);
  assert.equal(ps.ammo[0], MISSILE.MAX_AMMO);
  assert.equal(ps.fireCdUntil, 0);
  assert.equal(applyFire(w, ps), true, "...e agora atira, no primeiro tick");
});

test("...e o alvo da etapa 2 não come nem é comido", () => {
  // A faixa é estreita e quebra para os dois lados: pequeno demais e a etapa se resolve encostando;
  // grande demais e o tutorial MATA quem está aprendendo.
  const { w, api, st } = banca();
  for (const rMe of [PLAYER.SPAWN_R, 60, 95, 140]) {
    setRaio(w, 0, rMe);
    montaEtapa(w, api, ETAPA.TIRO, 0, st);
    const alvo = w.players.get(st.alvo), ra = vivas(alvo)[0].r;
    assert.equal(ra <= rMe / EAT.RATIO, false, `r_me=${rMe}: o alvo (${ra.toFixed(1)}) seria comível`);
    assert.equal(ra >= rMe * EAT.RATIO, false, `r_me=${rMe}: o alvo (${ra.toFixed(1)}) comeria o aluno`);
    assert.ok(Math.abs(ra / rMe - CENA.ALVO_K) < 1e-9, "e a razão é a mesma em qualquer tamanho");
  }
});

test("ETAPA 3: O SPLIT FUNCIONA — as duas travas caem juntas", () => {
  // ⚠️ Este é o teste central da entrega. `applySplit > 0` prova de uma vez que `graceUntil` foi zerado
  // (senão `rules.js` devolve 0 em SILÊNCIO) e que o raio passou de `SPLIT.MIN_R`. Errar qualquer um dos
  // dois põe na tela um botão que o servidor recusa — o defeito que `game/dica.js` inteiro existe para
  // prevenir.
  const { w, api, st } = banca();
  const ps = w.players.get(0);
  assert.equal(applySplit(w, ps), 0, "de fábrica o novato NÃO divide (graça + tamanho)");
  montaEtapa(w, api, ETAPA.SPLIT, 0, st);
  assert.equal(ps.graceUntil, 0, "a graça acabou");
  assert.ok(vivas(ps)[0].r >= SPLIT.MIN_R, "e o tamanho passou do portão");
  assert.ok(applySplit(w, ps) > 0, "o split SAIU");
});

test("...e a PRESA cabe na METADE, não só no planeta inteiro", () => {
  // Com r=96 cada metade sai em 67,9 e engole até 59. Um alvo de 60 seria comível inteiro e INCOMÍVEL
  // pela metade que salta: o tutorial ensinaria o gesto e puniria quem o executasse.
  const { w, api, st } = banca();
  montaEtapa(w, api, ETAPA.SPLIT, 0, st);
  const ps = w.players.get(0), rMe = vivas(ps)[0].r;
  const presa = vivas(w.players.get(st.alvo))[0].r;
  const metade = rMe / Math.SQRT2;
  assert.ok(metade >= SPLIT.MIN_R * 0.9, `a metade (${metade.toFixed(1)}) continua um planeta de verdade`);
  assert.ok(presa <= metade / EAT.RATIO, `a presa (${presa}) cabe na metade (engole até ${(metade / EAT.RATIO).toFixed(1)})`);
});

test("a presa é MAIS RÁPIDA que o jogador e que cada metade — é a lição inteira", () => {
  // `vmax = 2110,6/r^0,449`: ser maior é a condição para comer E a condição para não alcançar. Se a presa
  // fosse mais lenta, perseguir funcionaria e a etapa 3 não ensinaria nada.
  const vmax = r => Math.min(460, Math.max(48, 2110.6 / Math.pow(r, 0.449)));
  const { w, api, st } = banca();
  montaEtapa(w, api, ETAPA.SPLIT, 0, st);
  const rMe = vivas(w.players.get(0))[0].r, presa = vivas(w.players.get(st.alvo))[0].r;
  assert.ok(vmax(presa) > vmax(rMe), "mais rápida que o planeta inteiro");
  assert.ok(vmax(presa) > vmax(rMe / Math.SQRT2), "e que cada metade depois do salto");
});

test("a presa fica dentro do alcance de UM salto, com folga", () => {
  const { w, api, st } = banca();
  montaEtapa(w, api, ETAPA.SPLIT, 0, st);
  const me = vivas(w.players.get(0))[0], p = vivas(w.players.get(st.alvo))[0];
  const d = Math.hypot(p.x - me.x, p.y - me.y);
  assert.ok(d < SPLIT.DIST, `${Math.round(d)} px < os ${SPLIT.DIST} do arremesso`);
  // ⚠️ E a folga é o perdão: a `SPLIT.DIST` exata o salto acerta com zero de margem.
  assert.ok(d < SPLIT.DIST * 0.75, "com folga de sobra para o ponteiro corrigir durante o voo");
});

test("cada etapa monta DENTRO do envelope de tela do pior aparelho", () => {
  // O menor raio visível medido é 520 px de meia-altura (celular deitado, sem o zoom de novato). Um alvo
  // a 900 px está FORA da tela de um celular em pé, e o tutorial mandaria procurar o que não se vê.
  const { w, api, st } = banca();
  const me = () => vivas(w.players.get(0))[0];
  for (const et of [ETAPA.NOVA, ETAPA.TIRO, ETAPA.SPLIT]) {
    montaEtapa(w, api, et, 0, st);
    const c = me();
    const alvo = et === ETAPA.NOVA ? w.stars.find(s => !s.dead) : vivas(w.players.get(st.alvo))[0];
    const d = Math.hypot(alvo.x - c.x, alvo.y - c.y);
    assert.ok(d <= 520, `etapa ${et}: ${Math.round(d)} px`);
  }
});

test("nenhuma etapa deixa lixo da anterior", () => {
  const { w, rot, api, st } = banca();
  anda(w, rot, api, CENA.NOVA_ESPERA + 60);
  assert.ok(w.ejected.filter(e => !e.dead).length > 0, "havia cacos");
  montaEtapa(w, api, ETAPA.TIRO, 0, st);
  assert.equal(w.ejected.filter(e => !e.dead).length, 0);
  assert.equal(w.stars.filter(s => !s.dead).length, 0);
  assert.equal(w.starQueue.length, 0);
  const alvo1 = st.alvo;
  montaEtapa(w, api, ETAPA.SPLIT, 0, st);
  assert.equal(w.players.has(alvo1), false, "o alvo da etapa 2 saiu de cena");
});

test("MORRER NO TUTORIAL É IMPOSSÍVEL — rodando o roteiro inteiro sem tocar em nada", () => {
  const { w, rot, api } = banca();
  anda(w, rot, api, 60 * 90);   // 90 segundos de mundo, o teto do tutorial inteiro
  const ps = w.players.get(0);
  assert.equal(ps.alive, true);
  assert.ok(w.massOf(0) >= PLAYER.SPAWN_R * PLAYER.SPAWN_R * 0.99, "e sem perder massa (decay desligado)");
});

/** Ajusta o raio da peça do jogador, para exercitar a faixa do alvo. */
function setRaio(w, slot, r) { const pc = vivas(w.players.get(slot))[0]; pc.r = r; pc.mass = r * r; }

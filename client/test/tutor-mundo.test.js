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
import { STAR, SPLIT, MISSILE, PLAYER, EAT, POWERUP, WORLD, zoomFor } from "@warspace/shared";
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
  // ⚠️ `>=` e não `===`: a cena planta a estrela a um VÃO fixo da SUPERFÍCIE do aluno, então os cacos
  // arremessados já chegam nele nos primeiros segundos — comer é a lição, e comer cedo é bom. O que
  // este teste prova é que ele não PERDEU massa: queimadura e estilhaço são o que a folga impede.
  assert.ok(w.massOf(0) >= PLAYER.SPAWN_R * PLAYER.SPAWN_R - 1, "e sem perder massa para o estouro");
});

test("A MARGEM DA EXPLOSÃO É FOLGADA, não raspada", () => {
  // ⚠️ Este teste existe porque a primeira versão sobrevivia por **10 px** — e só com o jogador
  // perfeitamente parado. Pondo a estrela em `STAR_PHASE.OLD`, `rules.tickStar` assume o inchaço e o faz
  // sobre a CONSTANTE `STAR.R`: o raio de 24 que o tutorial planta vira 80,4, o estouro salta de 192 para
  // 644 px e o miolo que estilhaça, de 86 para 290 — contra um aluno a 300. Em bancada o planeta do
  // tutorial virou DOIS na etapa que devia ensiná-lo a crescer. "Sobreviveu" não basta como asserção.
  const { w, rot, api } = banca();
  let ev = null;
  for (let i = 0; i < CENA.NOVA_ESPERA + 60 && !ev; i++) { w.step(); rot.passo(w, api); ev = w.events.find(e => e.type === "SUPERNOVA"); }
  assert.ok(ev, "a supernova aconteceu");
  const pc = vivas(w.players.get(0))[0];
  const d = Math.hypot(pc.x - ev.x, pc.y - ev.y), miolo = ev.r * STAR.NOVA_SHATTER;
  assert.ok(d > miolo * 1.8, `folga curta: ${Math.round(d)} px contra um miolo de ${Math.round(miolo)} px`);
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
  // ⚠️ Este é o teste central da entrega: `applySplit > 0` prova que o mundo foi montado de um jeito em
  // que o gesto que a etapa ENSINA realmente acontece. Um botão que a tela anuncia e o mundo recusa é o
  // defeito que `game/dica.js` inteiro existe para prevenir.
  // ⚠️ **AS "DUAS TRAVAS" DO TÍTULO NÃO SÃO MAIS AS DE ONTEM, e as duas caíram por decisão, não aqui.**
  //   · a GRAÇA deixou de travar o split: `BOT.NOVATO_SPLIT` nasce ligado (constants.js), então
  //     `applySplit` não olha mais `graceUntil`. Por isso o zero da graça é afirmado DIRETO, abaixo — se
  //     virasse só consequência de `applySplit>0`, a prova sumiria junto com o acoplamento.
  //   · o TAMANHO deixou de travar no nascimento: `PLAYER.SPAWN_R` subiu para 63, acima do portão de 60,
  //     justamente para dividir existir desde o primeiro segundo. Havia aqui um
  //     `assert.equal(applySplit(w,ps),0,"de fábrica o novato NÃO divide")` que era a redação antiga
  //     dessa regra — ele saiu porque a regra saiu, e não porque ficou inconveniente.
  // O que a etapa 3 ainda FAZ, e é o que continua travado: levar o raio bem ACIMA do portão, para que as
  // METADES também sirvam (é o teste irmão, logo abaixo) e o gesto não produza um cacho inútil.
  const { w, api, st } = banca();
  const ps = w.players.get(0);
  assert.ok(vivas(ps)[0].r >= SPLIT.MIN_R, "o tutorial nasce com a massa inicial do jogo, que já passa do portão");
  montaEtapa(w, api, ETAPA.SPLIT, 0, st);
  assert.equal(ps.graceUntil, 0, "a graça acabou");
  assert.ok(vivas(ps)[0].r > SPLIT.MIN_R * 1.4, "e o tamanho ficou com FOLGA sobre o portão, não colado nele");
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

test("cada etapa monta DENTRO do envelope de tela, COM O ALUNO NO TAMANHO MÁXIMO", () => {
  // ⚠️ **O que este teste cobra são as COMPONENTES, não a distância radial** — e ele foi reescrito depois
  // de o defeito acontecer em produção. A câmera mantém ~1920×1080 px de MUNDO visíveis, ou seja ±540 px
  // na vertical e ±960 na horizontal no desktop; em retrato, `CAM.PORTRAIT_K` dá ±375 na horizontal e
  // ±810 na vertical. O pior caso de cada eixo é, então, 375 (largura de retrato) e 540 (altura de
  // desktop) — e como o tutorial planta na DIAGONAL, cada eixo recebe só 71% da distância.
  // ⚠️ E ele mede com o aluno em `R_MAX`, que é o tamanho em que ele CHEGA à etapa 2: medindo com o
  // recém-nascido, a distância cresce depois por baixo do teste e a cena sai da tela em partida — foi
  // exatamente assim que o alvo da etapa 2 e a presa da etapa 3 passaram a nascer fora do enquadramento.
  const { w, api, st } = banca();
  const me = () => vivas(w.players.get(0))[0];
  for (const et of [ETAPA.NOVA, ETAPA.TIRO, ETAPA.SPLIT]) {
    setRaio(w, 0, CENA.R_MAX);
    const pc = me(); pc.x = w.w / 2; pc.y = w.h / 2;
    montaEtapa(w, api, et, 0, st);
    const c = me();
    const alvo = et === ETAPA.NOVA ? w.stars.find(s => !s.dead) : vivas(w.players.get(st.alvo))[0];
    // ⚠️ **O RAIO DO ALVO ENTRA NA CONTA**, e isto foi visto na tela: com só a distância entre os
    // centros, o alvo da etapa 2 (r≈100) nascia com o centro dentro do enquadramento e a metade de
    // baixo CORTADA pela borda. O que tem de caber é o planeta inteiro.
    const dx = Math.abs(alvo.x - c.x) + alvo.r, dy = Math.abs(alvo.y - c.y) + alvo.r;
    assert.ok(dx <= 329, `etapa ${et}: ${Math.round(dx)} px na horizontal (retrato vê ±329)`);
    assert.ok(dy <= 423, `etapa ${et}: ${Math.round(dy)} px na vertical (desktop vê ±423)`);
    // e o VÃO entre as superfícies existe: sem ele os dois planetas nascem colados
    const vao = Math.hypot(dx, dy) - c.r - alvo.r;
    assert.ok(vao > 100, `etapa ${et}: vão de ${Math.round(vao)} px — nasceram colados`);
  }
});

test("A ARENA CABE NA CÂMERA — com o `zoomFor` de verdade, em toda tela da matriz", () => {
  // ⚠️ **O defeito que este teste trava foi MEDIDO no navegador, não deduzido.** `zoomFor` tem um piso —
  // nunca afastar além de mostrar o mundo inteiro (`zmin = max(W/WORLD.w, H/WORLD.h)`) — e o cliente
  // escreve `WORLD.w` com o mundo DA SALA ao receber o `room`. Numa arena de 1.200 px esse piso vira um
  // TETO: medido numa janela de 1854×871, escala **1,545** e só **564 px de mundo na vertical** (±282 do
  // centro) contra uma coreografia que plantava tudo a 300 px. O alvo da etapa 2 e a presa da etapa 3
  // nasciam FORA DO ENQUADRAMENTO, o tutorial mandava atirar em algo que não estava na tela, e nada no
  // jogo acusava — nem um erro, nem um log.
  // ⚠️ O teste roda o `zoomFor` REAL com `WORLD` apontando para a arena do tutorial, porque é exatamente
  // isso que `game/index.js` faz no `m.t==="room"`. Uma reimplementação da fórmula aqui provaria só que
  // as duas cópias concordam.
  const salvo = { w: WORLD.w, h: WORLD.h };
  WORLD.w = OPCOES_TUTORIAL.mundo.w; WORLD.h = OPCOES_TUTORIAL.mundo.h;
  try {
    // a maior componente por eixo: coreografia diagonal, aluno no teto, alvo 1,05× ele
    const rAlvo = CENA.R_MAX * CENA.ALVO_K;
    const dist = Math.max(CENA.NOVA_D, CENA.DIST + CENA.R_MAX + rAlvo);
    const compH = dist * DIRS_H + rAlvo, compV = dist * DIRS_V + rAlvo;   // o alvo INTEIRO na tela
    const TELAS = [[1854, 871], [1920, 1080], [2560, 1440], [1366, 768], [836, 470], [390, 844], [844, 390]];
    for (const [W, H] of TELAS)
      for (const mult of [1, POWERUP.ZOOM_K]) {   // sem e COM o zoom de novato, que a graça liga
        const z = zoomFor(CENA.R_MAX, W, H, mult);
        assert.ok(H / z / 2 >= compV, `${W}×${H} (zoom ${mult}): só ${Math.round(H / z / 2)} px de meia-altura`);
        assert.ok(W / z / 2 >= compH, `${W}×${H} (zoom ${mult}): só ${Math.round(W / z / 2)} px de meia-largura`);
      }
  } finally { WORLD.w = salvo.w; WORLD.h = salvo.h; }
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

// ── A EXPLOSÃO É A ABERTURA, E A PRESA CORRE NUMA PISTA ──────────────────────
// Os dois defeitos que estes testes travam foram vistos JOGANDO, e nenhum dos dois dava erro:
//   · a etapa 1 abria com uma estrela parada e a instrução "coma os pedaços" sem um pedaço na tela;
//   · a presa da etapa 3 fugia em linha reta, o alvo era saturado eixo a eixo e ela encalhava num canto
//     da arena — o jogador chegava a pé e o salto, que é a lição, nunca acontecia.
import { AJUDA } from "../src/game/tutor.js";
import { TICK_HZ } from "@warspace/shared";

const emTicks = ms => Math.ceil(ms * TICK_HZ / 1000);
/** As componentes da direção em que o tutorial planta (30° da vertical — ver `DIRS` no diretor). */
const DIRS_H = .5, DIRS_V = .866;

/** Força o roteiro a abrir uma etapa: `montada:0` faz o passo seguinte montar a cena dela. */
function vaiPara(w, rot, api, etapa) {
  const st = rot.estado();
  st.etapa = { etapa, desde: 0, feito: 0, ajuda: 0, auto: 0 };
  st.montada = 0;
  w.step(); rot.passo(w, api);
  return st;
}

test("A SUPERNOVA É A ABERTURA DA ETAPA 1, não um evento no meio dela", () => {
  const { w, rot, api, st } = banca();
  w.step(); rot.passo(w, api);
  assert.equal(st.pre, true, "antes de estourar, a lição de mover ainda não começou");
  assert.equal(w.ejected.filter(e => !e.dead).length, 0, "e não há o que comer");
  assert.ok(CENA.NOVA_ESPERA <= 90, `${CENA.NOVA_ESPERA} ticks olhando uma estrela parada é espera demais`);
  anda(w, rot, api, CENA.NOVA_ESPERA + 4);
  assert.equal(st.pre, false, "estourou");
  assert.ok(w.ejected.filter(e => !e.dead).length > 10, "e os pedaços estão na tela");
});

test("O RELÓGIO DA AJUDA SÓ COMEÇA DEPOIS DA EXPLOSÃO", () => {
  // ⚠️ Sem o recarimbo de `desde` no estouro, os degraus contariam o tempo em que o jogador estava
  // ASSISTINDO à explosão — e a primeira muleta chegaria antes de a lição ter começado.
  const { w, rot, api, st } = banca();
  const d1 = emTicks(AJUDA[ETAPA.NOVA].d1);
  anda(w, rot, api, d1 + 10);
  assert.equal(st.etapa.ajuda, 0, "o relógio não é o da abertura do mundo");
  anda(w, rot, api, CENA.NOVA_ESPERA + 10);
  assert.equal(st.etapa.ajuda, 1, "mas ele corre: a ajuda chega, contada do estouro");
});

test("A PRESA FOGE EM CÍRCULO E NUNCA ENCOSTA NA BORDA", () => {
  // ⚠️ Este é o teste do defeito visto em partida: perseguida, ela ia para o canto e morria lá. O alvo
  // de fuga era `posição + direção·900` saturado ao mundo EIXO A EIXO, e cortar por eixo TORCE a
  // direção — o que sobrava apontava para o vértice. Hoje o alvo é um ponto da pista, que cabe na arena
  // por construção, e nenhum clamp entra na conta.
  const { w, rot, api } = banca();
  const st = vaiPara(w, rot, api, ETAPA.SPLIT);
  const presa = () => vivas(w.players.get(st.alvo))[0];
  let borda = Infinity, arco = 0, ant = null;
  for (let i = 0; i < emTicks(AJUDA[ETAPA.SPLIT].d1) - 20; i++) {
    const p = presa();
    w.setTarget(0, p.x, p.y);         // o jogador persegue — era isto que produzia o encalhe
    w.step(); rot.passo(w, api);
    const q = presa();
    borda = Math.min(borda, q.x, q.y, w.w - q.x, w.h - q.y);
    const a = Math.atan2(q.y - st.ancora.y, q.x - st.ancora.x);
    if (ant !== null) { let d = a - ant; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; arco += Math.abs(d); }
    ant = a;
  }
  assert.ok(borda > 80, `a presa chegou a ${Math.round(borda)} px da borda da arena`);
  assert.ok(arco > 1.5, `ela percorreu só ${arco.toFixed(2)} rad de pista — não está fugindo, está parada`);
});

test("...e ela nunca sai do alcance de UM SALTO, por mais que ele a persiga", () => {
  // ⚠️ É a outra metade da mesma regra, e ela caiu junto com a primeira versão da pista: perseguir tem
  // de continuar não funcionando, mas a presa tem de continuar PERSEGUÍVEL. Com a âncora fixa, o aluno
  // corria atrás dela, a pista ficava para trás e a presa passava a circular um ponto vazio — longe
  // dele, às vezes além do arremesso, e a etapa só fechava pelo teto.
  const { w, rot, api } = banca();
  const st = vaiPara(w, rot, api, ETAPA.SPLIT);
  const presa = () => vivas(w.players.get(st.alvo))[0];
  const me = () => vivas(w.players.get(0))[0];
  let maior = 0, menor = 1e9;
  for (let i = 0; i < emTicks(AJUDA[ETAPA.SPLIT].d1) - 20; i++) {
    const p = presa(); w.setTarget(0, p.x, p.y);     // ele persegue sem parar, que é o que um novato faz
    w.step(); rot.passo(w, api);
    const viva = w.players.get(st.alvo);
    // ⚠️ **A PERSEGUIÇÃO A PÉ NÃO PODE FUNCIONAR — e ela funcionava.** Medido: com a fuga quase toda
    // tangencial, a presa mantinha 403 px/s contra 272 do aluno e MESMO ASSIM era comida em 2,5 s. É a
    // curva de perseguição: quem corre em círculo percorre π·d de arco enquanto quem corta pelo miolo
    // percorre d — e π > 1,48. A componente RADIAL da fuga tem de bater a velocidade dele, não a
    // velocidade total. Sem esta asserção o tutorial ensina o salto e premia quem não o usa.
    assert.ok(viva && viva.alive, `a presa foi comida A PÉ no tick ${i} — o salto deixou de ser a lição`);
    const d = Math.hypot(presa().x - me().x, presa().y - me().y);
    maior = Math.max(maior, d); menor = Math.min(menor, d);
  }
  assert.ok(maior < SPLIT.DIST * .8, `a presa chegou a ${Math.round(maior)} px — o arremesso vai ${SPLIT.DIST}`);
  assert.ok(menor > CENA.R_MAX * .9, `ela chegou a ${Math.round(menor)} px do aluno — perto demais para a lição`);
});

test("...e no primeiro degrau de ajuda ela CONTINUA fugindo, só que mais perto", () => {
  // ⚠️ Uma presa que simplesmente PARA no primeiro degrau desfaz a lição: o jogador a alcança andando e
  // sai do tutorial sem ter dividido uma vez. Ela encolhe a pista; parar é só o degrau 2.
  const { w, rot, api } = banca();
  const st = vaiPara(w, rot, api, ETAPA.SPLIT);
  const presa = () => vivas(w.players.get(st.alvo))[0];
  const ate = t => { for (let i = 0; i < t; i++) { const p = presa(); w.setTarget(0, p.x, p.y); w.step(); rot.passo(w, api); } };
  ate(emTicks(AJUDA[ETAPA.SPLIT].d1) + 30);
  assert.equal(st.etapa.ajuda, 1);
  let arco = 0, ant = null;
  for (let i = 0; i < 120; i++) {
    const p = presa(); w.setTarget(0, p.x, p.y); w.step(); rot.passo(w, api);
    const q = presa(), a = Math.atan2(q.y - st.ancora.y, q.x - st.ancora.x);
    if (ant !== null) { let d = a - ant; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; arco += Math.abs(d); }
    ant = a;
  }
  assert.ok(arco > .4, `no degrau 1 ela percorreu ${arco.toFixed(2)} rad — parou de fugir`);
  const q = presa(), dAnc = Math.hypot(q.x - st.ancora.x, q.y - st.ancora.y);
  assert.ok(dAnc < st.orbR, `e a pista encolheu (${Math.round(dAnc)} px < ${Math.round(st.orbR)})`);
});

test("A ÂNCORA DA PISTA CABE INTEIRA NA ARENA, venha o jogador de onde vier", () => {
  // É ela que garante que nenhum ponto da órbita precise de clamp — e portanto que a direção da presa
  // nunca seja torcida por uma saturação de eixo, que foi o que a mandou para o canto.
  const { w, api, st } = banca();
  for (const [x, y] of [[100, 100], [w.w - 60, 80], [w.w / 2, w.h - 40], [40, w.h / 2]]) {
    const pc = vivas(w.players.get(0))[0]; pc.x = x; pc.y = y;
    montaEtapa(w, api, ETAPA.SPLIT, 0, st);
    const lim = CENA.MARGEM + st.orbR;
    assert.ok(st.ancora.x >= lim - 1e-6 && st.ancora.x <= w.w - lim + 1e-6, `âncora x=${st.ancora.x}`);
    assert.ok(st.ancora.y >= lim - 1e-6 && st.ancora.y <= w.h - lim + 1e-6, `âncora y=${st.ancora.y}`);
    const p = vivas(w.players.get(st.alvo))[0];
    assert.ok(Math.abs(Math.hypot(p.x - st.ancora.x, p.y - st.ancora.y) - st.orbR) < 1,
      "e a presa nasce SOBRE a pista, sem tranco no primeiro frame");
  }
});

test("UM MÍSSIL EM VOO NÃO PODE MATAR A ETAPA SEGUINTE", () => {
  // ⚠️ **Visto na tela, sem um erro sequer.** O teto da etapa 2 atira pelo aluno; o míssil vive
  // `MISSILE.LIFE_TICKS` e a troca de etapa acontece com ele no ar. Ele persegue a presa recém-plantada
  // — r=40, o menor corpo da cena —, estilhaça-a abaixo do piso e a mata. A etapa 3 ficava com `st.alvo`
  // apontando para um slot inexistente: sem presa, sem lição, e só fechando pelo teto.
  const { w, api, st } = banca();
  montaEtapa(w, api, ETAPA.TIRO, 0, st);
  const ps = w.players.get(0);
  preparaJogador(w, 0, { ammo: MISSILE.MAX_AMMO });
  const alvo = vivas(w.players.get(st.alvo))[0];
  w.setTarget(0, alvo.x, alvo.y);
  assert.equal(applyFire(w, ps), true, "o tiro saiu");
  assert.ok(w.missiles.filter(m => !m.dead).length > 0, "e há míssil no ar");
  montaEtapa(w, api, ETAPA.SPLIT, 0, st);
  assert.equal(w.missiles.filter(m => !m.dead).length, 0, "a troca de etapa limpou o ar");
  // ⚠️ o alvo do JOGADOR tem de voltar para cima dele: `applyFire` mira pelo `ps.tx/ty`, e deixá-lo
  // apontado para onde o míssil foi faria o aluno atravessar a cena e comer a presa a pé — um falso
  // negativo que esconderia exatamente o que o teste quer medir.
  const me = vivas(w.players.get(0))[0]; w.setTarget(0, me.x, me.y);
  for (let i = 0; i < 240; i++) { w.step(); }
  const presa = w.players.get(st.alvo);
  assert.ok(presa && presa.alive, "e a presa da etapa 3 continua viva 4 s depois");
});

test("...e se o alvo sumir mesmo assim, a etapa REMONTA em vez de travar", () => {
  const { w, rot, api } = banca();
  const st = vaiPara(w, rot, api, ETAPA.SPLIT);
  const antigo = st.alvo;
  assert.ok(antigo >= 0);
  w.removePlayer(antigo);                       // o jeito mais direto de reproduzir o slot fantasma
  w.step(); rot.passo(w, api);
  assert.ok(st.alvo >= 0, "há alvo de novo");
  const p = w.players.get(st.alvo);
  assert.ok(p && p.alive, "e ele está vivo — a lição voltou a existir");
});

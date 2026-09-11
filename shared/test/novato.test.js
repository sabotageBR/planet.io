// ── O PREENCHIMENTO NÃO COME QUEM ACABOU DE NASCER ────────────────────────────
// Medido em produção (14 dias, 4.256 contas novas): a PRIMEIRA vida tem mediana de 31 s, metade dela
// acaba em menos de 30, e o algoz mais comum é um BOT com 41.447 de massa contra 6.766 da vítima —
// razão 6,1×, aos 46 s. `BOT.SPAWN_GRACE_TICKS` já existia e cobria só metade do problema: em `bot.js`
// ela faz o cérebro não ESCOLHER o novato como presa, e nunca impediu a COLISÃO. O que este arquivo
// trava é a outra metade, que mora na física.
// node --test shared/test/novato.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, setR } from "../src/physics/index.js";
import { piecePair, pieceMissile, incomingMissile } from "../src/physics/rules.js";
import { BOT, ROOM, PLAYER, EAT, MISSILE, POWERUP, botRespawnR } from "../src/constants.js";
import { createRng } from "../src/rng.js";

/** Laboratório: sem comida, sem perigo, sem decaimento. */
const arena = () => createWorld({ seed: 7, food: 0, asteroids: false, holes: 0, stars: 0, decay: false });
/** Põe dois planetas encostados e resolve o par uma vez. Devolve se o pequeno morreu. */
const encosta = (w, grandeSlot, pequenoSlot) => {
  const A = w.players.get(grandeSlot).pieces[0], B = w.players.get(pequenoSlot).pieces[0];
  // ⚠️ 1 px de deslocamento, nunca zero: `piecePair` abre com `if(d2<=0)return` e o centro EXATO faz a
  // função sair antes de decidir qualquer coisa — um teste assim passa sem exercitar nada.
  B.x = A.x + 1; B.y = A.y;
  piecePair(w, A, B);
  return !!B.dead;
};

test("bot GIGANTE não engole o humano recém-nascido — ele atravessa", () => {
  const w = arena();
  w.addPlayer(0, { isBot: true, x: 5000, y: 5000 }); setR(w.players.get(0).pieces[0], 180);
  w.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(1).pieces[0], PLAYER.START_R);
  assert.equal(w.players.get(1).graceUntil > w.tick, true, "está sob a graça");
  assert.equal(encosta(w, 0, 1), false, "o novato sobreviveu ao contato");
});

// ⚠️ ESTE TESTE MUDOU DE CENÁRIO EM 07/09/2026, e a intenção dele é a mesma: a proteção NÃO é
// invulnerabilidade. O que mudou é o que a retira. Ela era um penhasco de relógio — aos 15,0 s o novato
// passava de intocável a comida, e o dado mostrava o degrau (pico de 6× na faixa 15-19 s). Hoje quem a
// retira é o TAMANHO: um algoz proporcional come na hora que quiser, e é isso que este teste trava.
test("passada a graça, o algoz PROPORCIONAL mata — a proteção não é invulnerabilidade", () => {
  const w = arena();
  w.addPlayer(0, { isBot: true, x: 5000, y: 5000 });
  w.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(1).pieces[0], PLAYER.START_R);
  setR(w.players.get(0).pieces[0], PLAYER.START_R * 1.9);   // 3,6× de massa: engole e NÃO é atropelamento
  w.tick = w.players.get(1).graceUntil + 1;
  assert.ok(w.players.get(0).pieces[0].mass < w.players.get(1).pieces[0].mass * BOT.NOVATO_RATIO);
  assert.equal(encosta(w, 0, 1), true, "acabada a graça, o grande come");
});

// ── ...E CONTRA GENTE A RÉGUA É OUTRA (`BOT.NOVATO_HUMANO`) ─────────────────
// Este par de testes ESTAVA escrito ao contrário — "entre PESSOAS a regra não muda: o jogo continua
// sendo o jogo" —, e mudou por pedido do dono com o Fit Test 1.20 na frente: a sala do Livre tem até 30
// humanos, então bastava UM deles para a proteção inteira não valer nada naquele encontro. O que NÃO
// mudou, e é o que o primeiro teste trava, é a briga apertada: contra gente vale só a RAZÃO DE MASSA,
// nunca a janela cega. Estendida cega, ela apagava o `EAT.RATIO` do jogo por um minuto e meio a cada
// respawn de qualquer pessoa da sala.
test("entre PESSOAS a briga apertada continua sendo o jogo: o proporcional come no tick 0", () => {
  const w = arena();
  w.addPlayer(0, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(0).pieces[0], PLAYER.START_R * 1.7);
  w.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(1).pieces[0], PLAYER.START_R);
  const g = w.players.get(0).pieces[0], p = w.players.get(1).pieces[0];
  assert.ok(w.players.get(1).graceUntil > w.tick, "o pequeno acabou de nascer");
  assert.ok(g.mass < p.mass * BOT.NOVATO_RATIO, "e o grande NÃO é atropelamento");
  assert.equal(encosta(w, 0, 1), true, "come, com graça ou sem — a janela cega é só contra preenchimento");
});

test("mas o ATROPELAMENTO humano atravessa: 4x de massa em cima de quem acabou de nascer", () => {
  const w = arena();
  w.addPlayer(0, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(0).pieces[0], 180);
  w.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(1).pieces[0], PLAYER.START_R);
  assert.equal(encosta(w, 0, 1), false, "atravessa: não há decisão que o novato pudesse ter tomado");
  // e o interruptor devolve o comportamento anterior, sem deploy
  const on = BOT.NOVATO_HUMANO;
  try {
    BOT.NOVATO_HUMANO = 0;
    const w2 = arena();
    w2.addPlayer(0, { isBot: false, x: 5000, y: 5000 }); setR(w2.players.get(0).pieces[0], 180);
    w2.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w2.players.get(1).pieces[0], PLAYER.START_R);
    assert.equal(encosta(w2, 0, 1), true, "desligado: gente come gente como sempre comeu");
  } finally { BOT.NOVATO_HUMANO = on; }
});

test("e o novato não fica imune ao contrário: ele engole o bot pequeno normalmente", () => {
  const w = arena();
  w.addPlayer(0, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(0).pieces[0], 180);
  w.addPlayer(1, { isBot: true, x: 5000, y: 5000 }); setR(w.players.get(1).pieces[0], PLAYER.START_R);
  assert.equal(encosta(w, 0, 1), true, "quem está sob a graça continua podendo comer");
});

test("a semente deixou de trazer um predador imbatível", () => {
  const [gig] = ROOM.SEED_R, massaGig = gig[0] * gig[0];
  const novato = PLAYER.START_R * PLAYER.START_R;
  assert.ok(massaGig < 40000, `o menor gigante da semente vale ${massaGig} de massa (era 40.000+)`);
  // ⚠️ ERA `=== 1`, "e é UM por sala, não dois". O segundo gigante voltou por decisão do dono, com o
  // Player Fit da Poki na frente (a sala precisa parecer cheia no tick 0), e o que mudou desde setembro
  // são as duas defesas que não existiam quando a cota caiu: `recemChegado` passou a valer na FÍSICA (o
  // gigante ATRAVESSA o novato em vez de comê-lo — é o teste logo acima) e `bonusHumano` tirou do grande
  // a preferência por presa humana. O tier continua sendo METADE do que era.
  // O guarda-corpo não é este teste, é o painel: a razão de massa do algoz em /admin → Retenção. Se ela
  // subir, o segundo sai de novo — e isso é um clique, não um deploy.
  assert.ok(ROOM.SEED_MIX[0] <= 2, `${ROOM.SEED_MIX[0]} gigantes na semente: acima de dois ninguém testou`);
  // ele continua sendo um gigante de verdade: come o novato de longe, o que é o ponto da ambientação
  assert.ok(gig[0] >= PLAYER.START_R * EAT.RATIO, "ainda é grande o bastante para engolir quem nasce");
  assert.ok(massaGig / novato > 20, "e a diferença continua enorme — o que mudou é a ordem de grandeza");
});

// ── ...E A GRAÇA DEIXOU DE SER UM PENHASCO ───────────────────────────────────
// Medido em 07/09/2026 nos jogadores do Fit Test da Poki: a primeira vida tinha um PICO de 6× na faixa
// 15-19 s (118 mortes contra 19 na faixa anterior), 88-93% comido — exatamente o fim de
// `SPAWN_GRACE_TICKS`. A proteção só ADIAVA: a 448 px/s o novato cruza 6.700 px nos 15 s e chega ao fim
// dela no meio da multidão. Passada a janela, o que segura o atropelamento é a RAZÃO DE MASSA.
test("passada a graça, o bot MUITO maior ainda atravessa quem é pequeno", () => {
  const w = arena();
  w.addPlayer(0, { isBot: true, x: 5000, y: 5000 }); setR(w.players.get(0).pieces[0], 180);
  w.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(1).pieces[0], PLAYER.START_R);
  w.tick = w.players.get(1).graceUntil + 1;   // a graça JÁ ACABOU
  const g = w.players.get(0).pieces[0], p = w.players.get(1).pieces[0];
  assert.ok(p.mass < BOT.NOVATO_MASS, "a pessoa ainda é pequena");
  assert.ok(g.mass > p.mass * BOT.NOVATO_RATIO, "e o bot é MUITO maior");
  assert.equal(encosta(w, 0, 1), false, "atravessa em vez de engolir");
});

test("a briga APERTADA continua existindo: abaixo de NOVATO_RATIO o bot come", () => {
  const w = arena();
  w.addPlayer(0, { isBot: true, x: 5000, y: 5000 });
  w.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(1).pieces[0], PLAYER.START_R);
  const p = w.players.get(1).pieces[0];
  // Massa entre EAT.RATIO² (1,32×) e NOVATO_RATIO (4×): engole, como sempre engoliu.
  setR(w.players.get(0).pieces[0], PLAYER.START_R * 1.7);
  const g = w.players.get(0).pieces[0];
  w.tick = w.players.get(1).graceUntil + 1;
  assert.ok(g.r >= p.r * EAT.RATIO, "é grande o bastante para engolir");
  assert.ok(g.mass < p.mass * BOT.NOVATO_RATIO, "e NÃO é atropelamento");
  assert.equal(encosta(w, 0, 1), true, "come normalmente");
});

test("quem já cresceu perde a proteção: acima de NOVATO_MASS o gigante come", () => {
  const w = arena();
  w.addPlayer(0, { isBot: true, x: 5000, y: 5000 }); setR(w.players.get(0).pieces[0], 400);
  w.addPlayer(1, { isBot: false, x: 5000, y: 5000 });
  const p = w.players.get(1).pieces[0];
  setR(p, Math.sqrt(BOT.NOVATO_MASS) + 20);          // passou do limiar de novato
  w.tick = w.players.get(1).graceUntil + 1;
  assert.ok(p.mass > BOT.NOVATO_MASS, "não é mais novato");
  assert.equal(encosta(w, 0, 1), true, "e volta a ser presa");
});

// ⚠️ O BURACO QUE A VERSÃO POR PEÇA DEIXAVA. Medido em 07/09/2026: 21% das mortes abaixo de
// `NOVATO_MASS` ainda tinham algoz com mais de 4× (razão mediana 6,0), e só podia ser bot DIVIDIDO —
// `max_mass` é o pico da vida, então um algoz registrado acima de 4× que escapou da regra estava em
// pedaços. Um bot de 30.000 partido em 16 tem peças de ~1.900: contra um novato de 2.000 nenhuma peça
// chega a 4×, e "dividir" virava o contorno da regra. Quem é gigante é o JOGADOR.
test("o gigante DIVIDIDO não contorna a regra: quem conta é a massa do jogador", () => {
  const w = arena();
  w.addPlayer(0, { isBot: true, x: 5000, y: 5000 });
  w.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(1).pieces[0], PLAYER.START_R);
  const gps = w.players.get(0), p = w.players.get(1).pieces[0];
  // Um gigante partido em 16 pelo caminho real do World: massa TOTAL enorme, cada PEÇA no tamanho de
  // uma briga honesta — que é exatamente a forma com que a versão por peça era contornada.
  setR(gps.pieces[0], PLAYER.START_R * 1.6);
  for (let i = 1; i < 16; i++) w._spawnPiece(gps, 5000 + i, 5000, PLAYER.START_R * 1.6);
  const vivas = gps.pieces.filter(x => !x.dead);
  assert.equal(vivas.length, 16, "o gigante está em 16 pedaços");
  assert.ok(w.massOf(0) > p.mass * BOT.NOVATO_RATIO, "o JOGADOR é muito maior");
  assert.ok(vivas[0].mass < p.mass * BOT.NOVATO_RATIO, "mas nenhuma PEÇA dele é");
  w.tick = w.players.get(1).graceUntil + 1;
  assert.equal(encosta(w, 0, 1), false, "atravessa: dividir não contorna a proteção");
});

// ⚠️ E CONTRA GENTE A PROTEÇÃO ACABA COM A JANELA, nunca depois dela. Contra preenchimento a razão de
// massa é PERMANENTE enquanto a pessoa for pequena (é o que apaga o atropelamento pelo resto da vida);
// contra gente ela vale só no minuto do nascimento. A diferença é de propósito: um bot grande é
// ambientação que a sala pôs ali, e um humano grande é alguém jogando.
test("passada a janela, gente come gente com qualquer diferença de tamanho", () => {
  const w = arena();
  w.addPlayer(0, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(0).pieces[0], 180);
  w.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(1).pieces[0], PLAYER.START_R);
  w.tick = w.players.get(1).graceUntil + 1;
  assert.equal(encosta(w, 0, 1), true, "acabada a janela do nascimento, o jogo é o jogo");
});

// ── ...MAS NADA DISSO VALE NO BATTLE ROYALE ──────────────────────────────────
// Visto em partida (07/09/2026): um jogador pequeno atravessando os grandes sem ser comido. No BR não
// existe novato — todo mundo começa igual, no mesmo tick, não há respawn, e ficar pequeno é RESULTADO da
// partida. A proteção transformava quem encolheu em fantasma, e como o modo é decidido por sobrevivência
// isso não é só estranho na tela: dá para chegar ao fim sem poder ser comido.
test("no BATTLE ROYALE não há proteção por massa: encolher não deixa ninguém fantasma", () => {
  const w = arena();
  w.zone = { t0: 0, t1: 100000, x0: 6000, y0: 6000, r0: 6000, x1: 6000, y1: 6000, r1: 500 };
  assert.ok(w.zoneNow(), "a arena está em modo Battle Royale");
  w.addPlayer(0, { isBot: true, x: 5000, y: 5000 }); setR(w.players.get(0).pieces[0], 180);
  w.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(1).pieces[0], PLAYER.START_R);
  const p = w.players.get(1).pieces[0];
  assert.ok(p.mass < BOT.NOVATO_MASS, "seria protegido no Livre");
  assert.ok(w.massOf(0) > p.mass * BOT.NOVATO_RATIO, "e o outro é MUITO maior");
  w.tick = w.players.get(1).graceUntil + 1;
  assert.equal(encosta(w, 0, 1), true, "no BR o grande come: pequeno é resultado, não novato");
});

test("e no LIVRE a mesma cena continua protegida — a guarda é do modo, não do tamanho", () => {
  const w = arena();                       // sem `w.zone`: modo Livre
  assert.equal(w.zoneNow(), null, "a arena está no Livre");
  w.addPlayer(0, { isBot: true, x: 5000, y: 5000 }); setR(w.players.get(0).pieces[0], 180);
  w.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(1).pieces[0], PLAYER.START_R);
  w.tick = w.players.get(1).graceUntil + 1;
  assert.equal(encosta(w, 0, 1), false, "atravessa, como no bloco acima");
});

// ── O INTERRUPTOR DO PAINEL ──────────────────────────────────────────────────
// Os três números viraram tunables (`shared/src/tunables.js`, grupo "Proteção do novato") porque a regra
// é decisão de PRODUTO: ela apaga um atropelamento que o jogador não tinha como evitar, e em troca põe na
// tela um gigante ATRAVESSANDO alguém — que num .io lê como defeito. Zerar `SPAWN_GRACE_S` e `NOVATO_MASS`
// tem que devolver o jogo de antes, INTEIRO, sem deploy e sem reiniciar sala nenhuma.
// ⚠️ O teste restaura os valores no `finally`: `constants.js` é um objeto de PROCESSO e não é congelado
// (é justamente o que faz o tunable custar zero no laço de 60 Hz), então deixar sujo contamina os testes
// que rodarem depois neste mesmo processo — e o `node --test` roda o arquivo inteiro num só.
test("zerar os dois pelo painel devolve o atropelamento — e religar o traz de volta", () => {
  const grace = BOT.SPAWN_GRACE_TICKS, massa = BOT.NOVATO_MASS;
  try {
    const cena = () => {
      const w = arena();
      w.addPlayer(0, { isBot: true, x: 5000, y: 5000 }); setR(w.players.get(0).pieces[0], 180);
      w.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(1).pieces[0], PLAYER.START_R);
      return w;   // no tick do nascimento: sob a graça de tempo E abaixo de NOVATO_MASS
    };
    assert.equal(encosta(cena(), 0, 1), false, "ligado: atravessa");
    BOT.SPAWN_GRACE_TICKS = 0; BOT.NOVATO_MASS = 0;
    assert.equal(encosta(cena(), 0, 1), true, "desligado: o gigante come no primeiro contato");
    BOT.SPAWN_GRACE_TICKS = grace; BOT.NOVATO_MASS = massa;
    assert.equal(encosta(cena(), 0, 1), false, "religado no mesmo processo, sem reiniciar nada");
  } finally { BOT.SPAWN_GRACE_TICKS = grace; BOT.NOVATO_MASS = massa; }
});

// ⚠️ DESLIGAR PELA METADE É PIOR QUE NÃO DESLIGAR, e é isto que o número mostra: zerando só a razão de
// massa, o novato continua intocável durante a graça e vira comida no instante em que ela vence. Era esse
// PENHASCO que o dado acusou (pico de 6× nas mortes na faixa 15-19 s, 118 contra 19 na faixa anterior).
test("zerar só NOVATO_MASS devolve o penhasco de relógio", () => {
  const massa = BOT.NOVATO_MASS;
  try {
    BOT.NOVATO_MASS = 0;
    const w = arena();
    w.addPlayer(0, { isBot: true, x: 5000, y: 5000 }); setR(w.players.get(0).pieces[0], 180);
    w.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(1).pieces[0], PLAYER.START_R);
    w.tick = w.players.get(1).graceUntil - 1;
    assert.equal(encosta(w, 0, 1), false, "um tick ANTES: intocável");
    const w2 = arena();
    w2.addPlayer(0, { isBot: true, x: 5000, y: 5000 }); setR(w2.players.get(0).pieces[0], 180);
    w2.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w2.players.get(1).pieces[0], PLAYER.START_R);
    w2.tick = w2.players.get(1).graceUntil;
    assert.equal(encosta(w2, 0, 1), true, "um tick DEPOIS: comida — é o degrau, e é por isso que são as duas ou nenhuma");
  } finally { BOT.NOVATO_MASS = massa; }
});

// ── E O MÍSSIL DO PREENCHIMENTO TAMBÉM ATRAVESSA ─────────────────────────────
// `MISSILE.SPAWN_CD_TICKS` impedia o novato de ATIRAR e nunca impediu de ser ALVO — e um teleguiado nasce
// muito além da AOI dele, ou seja chega sem ele nunca ter visto de onde. A regra é a MESMA da mordida
// (`recemChegado`), então ela herda os três parâmetros do painel e o interruptor deles.

/** Põe um míssil do bot `dono` em cima da peça de `alvo` e devolve se a peça foi ferida. */
const acerta = (w, dono, alvo) => {
  const pc = w.players.get(alvo).pieces[0], antes = pc.mass;
  const m = w.addMissile(pc.x + 1, pc.y, 0, 0, dono, alvo);
  pieceMissile(w, pc, m);
  return { feriu: pc.mass < antes - 1e-9, morreu: !!m.dead };
};

test("o míssil de um preenchimento não fere quem está sob a graça", () => {
  const w = arena();
  w.addPlayer(0, { x: 5000, y: 5000, r: 200, isBot: true });
  w.addPlayer(1, { x: 5600, y: 5000, r: PLAYER.START_R, isBot: false });
  const r = acerta(w, 0, 1);
  assert.equal(r.feriu, false, "ele atravessa: sem dano, sem evento, sem explosão falsa");
  assert.equal(r.morreu, false, "e o míssil segue em frente — nada de estouro em cima de quem não pode reagir");
});

test("passada a proteção, o mesmo míssil fere normalmente", () => {
  const w = arena();
  w.addPlayer(0, { x: 5000, y: 5000, r: 200, isBot: true });
  w.addPlayer(1, { x: 5600, y: 5000, r: PLAYER.START_R, isBot: false });
  w.tick = w.players.get(1).graceUntil + 1;                 // fora da graça de tempo
  setR(w.players.get(1).pieces[0], Math.sqrt(BOT.NOVATO_MASS) + 20);   // e fora da razão de massa
  const r = acerta(w, 0, 1);
  assert.equal(r.feriu, true, "a proteção é do NOVATO, não um escudo permanente contra bot");
});

test("o míssil segue a MESMA regra da mordida, inclusive entre pessoas", () => {
  // proporcional: fere, mesmo no tick do nascimento — a briga apertada continua sendo o jogo
  const w = arena();
  w.addPlayer(0, { x: 5000, y: 5000, r: PLAYER.START_R * 1.7, isBot: false });
  w.addPlayer(1, { x: 5600, y: 5000, r: PLAYER.START_R, isBot: false });
  assert.equal(acerta(w, 0, 1).feriu, true, "humano proporcional fere quem acabou de nascer");
  // atropelamento: atravessa, pelo mesmo `recemChegado` que decide a mordida
  const w2 = arena();
  w2.addPlayer(0, { x: 5000, y: 5000, r: 200, isBot: false });
  w2.addPlayer(1, { x: 5600, y: 5000, r: PLAYER.START_R, isBot: false });
  assert.equal(acerta(w2, 0, 1).feriu, false, "um teleguiado nasce muito além da AOI de quem nasceu agora");
});

test("A DEFESA DO NOVATO CONTINUA ENXERGANDO O MÍSSIL", () => {
  // `incomingMissile` é o SENSOR DA VÍTIMA: dele saem o alerta da seta na borda, a interceptação e a
  // auto-defesa. Pôr `recemChegado` ali cegaria justamente quem a regra existe para proteger.
  const w = arena();
  w.addPlayer(0, { x: 5000, y: 5000, r: 200, isBot: true });
  w.addPlayer(1, { x: 5600, y: 5000, r: PLAYER.START_R, isBot: false });
  const pc = w.players.get(1).pieces[0];
  const m = w.addMissile(pc.x - 400, pc.y, 400, 0, 0, 1);
  m.type = 0;
  assert.ok(incomingMissile(w, 1, pc.x, pc.y, MISSILE.ALERT_DIST), "o novato TEM que ver o que vem nele");
});

// ── A GRAÇA TEM TRÊS SAÍDAS, E ELA REINICIA A CADA VIDA ──────────────────────
// O pack 1.21 pediu as três por escrito: "a graça acaba no primeiro de: 90 s, ou o novato passar de
// NOVATO_MASS com folga, ou o novato matar alguém" — e "reinicia em todo spawn do humano, senão o
// auto-respawn nasce em cima de quem acabou de comer o tester e a sessão morre 5 s depois".
test("a PRIMEIRA vida tem o dobro de graça; da segunda em diante volta ao normal", () => {
  const w = arena();
  w.addPlayer(1, { isBot: false, x: 5000, y: 5000 });
  const ps = w.players.get(1);
  assert.equal(ps.vidas, 1, "acabou de nascer pela primeira vez");
  assert.equal(ps.graceUntil - w.tick, BOT.SPAWN_GRACE_1_TICKS, "a janela da estreia");
  w.tick = ps.graceUntil + 500;
  w.respawnPlayer(1);
  assert.equal(ps.vidas, 2);
  assert.equal(ps.graceUntil - w.tick, BOT.SPAWN_GRACE_TICKS, "a segunda vida usa a janela de sempre");
  assert.ok(BOT.SPAWN_GRACE_1_TICKS > BOT.SPAWN_GRACE_TICKS, "e a estreia é a maior das duas");
});

// ⚠️ O QUE O ABATE ENCERRA É A JANELA DO NASCIMENTO, e não a regra inteira: contra PREENCHIMENTO a razão
// de massa continua valendo enquanto a pessoa for pequena (é ela que apaga o atropelamento pelo resto da
// vida, e é anterior a 2026-09-11). Quem mede a janela sozinha é o algoz HUMANO, onde ela é a única
// régua — por isso o cenário deste teste usa gente dos dois lados.
test("MATAR ALGUÉM encerra a janela na hora: quem abate não é mais recém-chegado", () => {
  const w = arena();
  w.addPlayer(0, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(0).pieces[0], 180);
  w.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(1).pieces[0], PLAYER.START_R);
  w.addPlayer(2, { isBot: true, x: 5000, y: 5000 }); setR(w.players.get(2).pieces[0], 12);   // a isca
  assert.equal(encosta(w, 0, 1), false, "sob a janela, o atropelamento humano atravessa");
  const A = w.players.get(1).pieces[0], B = w.players.get(2).pieces[0];
  B.x = A.x + 1; B.y = A.y; piecePair(w, A, B);
  assert.equal(B.dead, true, "o novato engoliu a isca");
  assert.equal(w.players.get(1).graceUntil, 0, "e a janela foi embora com o abate");
  assert.equal(encosta(w, 0, 1), true, "caçador não é novato: o humano grande volta a comer");
});

test("CRESCER encerra a graça, mesmo com o relógio correndo", () => {
  const w = arena();
  w.addPlayer(0, { isBot: true, x: 5000, y: 5000 }); setR(w.players.get(0).pieces[0], 400);
  w.addPlayer(1, { isBot: false, x: 5000, y: 5000 });
  const p = w.players.get(1).pieces[0];
  assert.ok(w.players.get(1).graceUntil > w.tick, "o relógio ainda está correndo");
  setR(p, Math.sqrt(BOT.NOVATO_MASS) + 20);   // ficou do tamanho de um médio
  assert.equal(encosta(w, 0, 1), true, "quem cresceu deixa de ser intocável, mesmo dentro da janela");
});

test("a graça REINICIA a cada nascimento — é o que impede o auto-respawn de virar um atraso de 10 s", () => {
  const w = arena();
  w.addPlayer(0, { isBot: true, x: 5000, y: 5000 }); setR(w.players.get(0).pieces[0], 180);
  w.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(1).pieces[0], PLAYER.START_R);
  w.tick = w.players.get(1).graceUntil + 1;
  assert.equal(w.players.get(1).graceUntil > w.tick, false, "a vida anterior saiu da janela");
  w.respawnPlayer(1); setR(w.players.get(1).pieces[0], PLAYER.START_R);
  assert.equal(w.players.get(1).graceUntil > w.tick, true, "a vida nova entra na janela de novo");
  assert.equal(encosta(w, 0, 1), false, "e o gigante atravessa a vida 2 como atravessou a 1");
});

// ⚠️ O ÍMÃ DE NASCENÇA NÃO ARRASTA O PERIGO: "o ímã puxa a recompensa E o perigo" é escolha de quem
// pisou num 🧲, e o kit de boas-vindas dá um de graça a toda vida nova. Sem esta regra o novato ganhava
// uma escolha que nunca fez — uma estrela se arrastando até ele — e nem sabia que fora o próprio ímã.
test("sob a graça, o ímã de nascença não puxa a estrela", () => {
  const monta = graca => {
    const w = createWorld({ seed: 11, food: 0, asteroids: false, holes: 0, stars: 0, decay: false });
    const ps = w.addPlayer(0, { isBot: false, x: 5000, y: 5000, r: 40 }) && w.players.get(0);
    w.setTarget(0, 5000, 5000);
    ps.pieces[0].magnetUntil = 1e9;
    if (!graca) ps.graceUntil = 0;
    const st = w.spawnStar(true); st.x = 5000 + 40 * POWERUP.MAGNET_RANGE - 30; st.y = 5000;
    const x0 = st.x; w.step();
    return x0 - st.x;
  };
  assert.equal(monta(true), 0, "sob a graça a estrela não sai do lugar");
  assert.ok(monta(false) > 0, "e fora dela o ímã continua arrastando o perigo, como sempre arrastou");
});

// ── ...E A PRESA NÃO PODE ACABAR JUNTO COM A SEMENTE ─────────────────────────
// O tier ISCA vivia só em `SEED_MIX` — os treze primeiros planetas, no tick 0 —, e eles CRESCEM. Passados
// dois minutos, todo preenchimento que entra vem de `PLAYER.BOT_R` [24,58], e um novato de r=30 só engole
// `r <= 30/EAT.RATIO`: 6% daquela faixa. A sala ficava cheia e sem nada para comer, que é o outro lado do
// "81% das primeiras vidas terminam sem um único abate".
/** Fração dos preenchimentos novos que um recém-nascido consegue engolir. */
const comiveis = (seed, n = 4000) => { const rng = createRng(seed), lim = PLAYER.SPAWN_R / EAT.RATIO;
  let k = 0; for (let i = 0; i < n; i++) if (botRespawnR(rng) <= lim) k++; return k / n; };

test("o preenchimento que RENASCE também nasce isca, e a isca é comível por quem acabou de nascer", () => {
  const antes = ROOM.ISCA_P, medido = { com: 0, sem: 0 };
  try { medido.com = comiveis(4242); ROOM.ISCA_P = 0; medido.sem = comiveis(4242); }
  finally { ROOM.ISCA_P = antes; }
  // ⚠️ O CHÃO NÃO É ZERO, e é ele que mede o tamanho do problema: `PLAYER.BOT_R` começa em 24 e o novato
  // engole até 26,1, então ~6% da faixa de sempre já era comível — por acidente de intervalo, não por
  // desenho. É esse número que fazia 81% das primeiras vidas acabarem sem um único abate.
  assert.ok(medido.sem > 0 && medido.sem < .1, `sem ISCA_P, só ${(medido.sem * 100).toFixed(1)}% dos novos são presa`);
  assert.ok(medido.com > medido.sem + ROOM.ISCA_P - .05,
    `com ISCA_P=${ROOM.ISCA_P} a presa tem que subir de ${(medido.sem * 100).toFixed(1)}% para ~${((medido.sem + ROOM.ISCA_P) * 100).toFixed(0)}%, e deu ${(medido.com * 100).toFixed(1)}%`);
});

test("zerar ISCA_P devolve o comportamento anterior — a faixa de sempre, e só ela", () => {
  const antes = ROOM.ISCA_P;
  try {
    ROOM.ISCA_P = 0;
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) { const r = botRespawnR(rng);
      assert.ok(r >= PLAYER.BOT_R[0] && r <= PLAYER.BOT_R[1], `${r.toFixed(1)} fora da faixa de sempre`); }
  } finally { ROOM.ISCA_P = antes; }
});

test("e o teto da isca sai do JOGADOR: baixar a massa inicial no painel não a transforma em predador", () => {
  const spawn = PLAYER.SPAWN_R;
  try {
    PLAYER.SPAWN_R = 22;   // o dono do jogo baixou a massa inicial
    const rng = createRng(99), lim = PLAYER.SPAWN_R / EAT.RATIO;
    let iscas = 0;
    for (let i = 0; i < 2000; i++) if (botRespawnR(rng) <= lim) iscas++;
    assert.ok(iscas > 0, "a isca continua existindo com a massa inicial menor");
  } finally { PLAYER.SPAWN_R = spawn; }
});

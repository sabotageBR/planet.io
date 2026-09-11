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
import { BOT, ROOM, PLAYER, EAT, MISSILE } from "../src/constants.js";

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
  assert.equal(w.tick - w.players.get(1).spawnTick < BOT.SPAWN_GRACE_TICKS, true, "está sob a graça");
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
  w.tick = w.players.get(1).spawnTick + BOT.SPAWN_GRACE_TICKS + 1;
  assert.ok(w.players.get(0).pieces[0].mass < w.players.get(1).pieces[0].mass * BOT.NOVATO_RATIO);
  assert.equal(encosta(w, 0, 1), true, "acabada a graça, o grande come");
});

test("entre PESSOAS a regra não muda: o jogo continua sendo o jogo", () => {
  const w = arena();
  w.addPlayer(0, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(0).pieces[0], 180);
  w.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(1).pieces[0], PLAYER.START_R);
  assert.equal(encosta(w, 0, 1), true, "humano grande come humano pequeno, com graça ou sem");
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
  w.tick = w.players.get(1).spawnTick + BOT.SPAWN_GRACE_TICKS + 1;   // a graça JÁ ACABOU
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
  w.tick = w.players.get(1).spawnTick + BOT.SPAWN_GRACE_TICKS + 1;
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
  w.tick = w.players.get(1).spawnTick + BOT.SPAWN_GRACE_TICKS + 1;
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
  w.tick = w.players.get(1).spawnTick + BOT.SPAWN_GRACE_TICKS + 1;
  assert.equal(encosta(w, 0, 1), false, "atravessa: dividir não contorna a proteção");
});

test("entre PESSOAS nada mudou — a razão de massa não protege ninguém", () => {
  const w = arena();
  w.addPlayer(0, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(0).pieces[0], 180);
  w.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(1).pieces[0], PLAYER.START_R);
  w.tick = w.players.get(1).spawnTick + BOT.SPAWN_GRACE_TICKS + 1;
  assert.equal(encosta(w, 0, 1), true, "gente come gente, com qualquer diferença de tamanho");
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
  w.tick = w.players.get(1).spawnTick + BOT.SPAWN_GRACE_TICKS + 1;
  assert.equal(encosta(w, 0, 1), true, "no BR o grande come: pequeno é resultado, não novato");
});

test("e no LIVRE a mesma cena continua protegida — a guarda é do modo, não do tamanho", () => {
  const w = arena();                       // sem `w.zone`: modo Livre
  assert.equal(w.zoneNow(), null, "a arena está no Livre");
  w.addPlayer(0, { isBot: true, x: 5000, y: 5000 }); setR(w.players.get(0).pieces[0], 180);
  w.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(1).pieces[0], PLAYER.START_R);
  w.tick = w.players.get(1).spawnTick + BOT.SPAWN_GRACE_TICKS + 1;
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
    const nasceu = w.players.get(1).spawnTick;
    w.tick = nasceu + BOT.SPAWN_GRACE_TICKS - 1;
    assert.equal(encosta(w, 0, 1), false, "um tick ANTES: intocável");
    const w2 = arena();
    w2.addPlayer(0, { isBot: true, x: 5000, y: 5000 }); setR(w2.players.get(0).pieces[0], 180);
    w2.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w2.players.get(1).pieces[0], PLAYER.START_R);
    w2.tick = w2.players.get(1).spawnTick + BOT.SPAWN_GRACE_TICKS;
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
  w.tick = BOT.SPAWN_GRACE_TICKS + 1;                       // fora da graça de tempo
  setR(w.players.get(1).pieces[0], Math.sqrt(BOT.NOVATO_MASS) + 20);   // e fora da razão de massa
  const r = acerta(w, 0, 1);
  assert.equal(r.feriu, true, "a proteção é do NOVATO, não um escudo permanente contra bot");
});

test("entre PESSOAS o míssil nunca atravessa, nem no primeiro segundo", () => {
  const w = arena();
  w.addPlayer(0, { x: 5000, y: 5000, r: 200, isBot: false });   // humano grande
  w.addPlayer(1, { x: 5600, y: 5000, r: PLAYER.START_R, isBot: false });
  assert.equal(acerta(w, 0, 1).feriu, true, "proteger disso seria inventar invulnerabilidade num .io");
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

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
import { piecePair } from "../src/physics/rules.js";
import { BOT, ROOM, PLAYER, EAT } from "../src/constants.js";

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

test("passada a graça, o mesmo encontro mata — a proteção é temporária, não invulnerabilidade", () => {
  const w = arena();
  w.addPlayer(0, { isBot: true, x: 5000, y: 5000 }); setR(w.players.get(0).pieces[0], 180);
  w.addPlayer(1, { isBot: false, x: 5000, y: 5000 }); setR(w.players.get(1).pieces[0], PLAYER.START_R);
  w.tick = w.players.get(1).spawnTick + BOT.SPAWN_GRACE_TICKS + 1;
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
  assert.equal(ROOM.SEED_MIX[0], 1, "e é UM por sala, não dois");
  // ele continua sendo um gigante de verdade: come o novato de longe, o que é o ponto da ambientação
  assert.ok(gig[0] >= PLAYER.START_R * EAT.RATIO, "ainda é grande o bastante para engolir quem nasce");
  assert.ok(massaGig / novato > 20, "e a diferença continua enorme — o que mudou é a ordem de grandeza");
});

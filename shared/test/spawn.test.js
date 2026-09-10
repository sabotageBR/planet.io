// ── O NOVATO NASCE PERTO DE GENTE ─────────────────────────────────────────────
// `_playerSpot` existe desde sempre para dar o PRIMEIRO ENCONTRO sem esperar minutos, e nunca colocou
// ninguém em lugar nenhum: ela sorteia um ponto a até PLAYER_SPAWN_NEAR_R (360 px) de uma peça e, na
// mesma chamada, exigia ≥ PLAYER_SAFE (1500 px) de TODA peça viva — inclusive a âncora que ela mesma
// tinha escolhido. Contradição aritmética: as 40 tentativas falhavam SEMPRE, `s.ok` vinha false e o
// nascimento caía no sorteio cego do mapa inteiro. Medido antes do conserto: 0 acertos em 200 chamadas,
// e o novato nascendo a 3.911 px do único humano da sala.
// Nada quebrava, nada logava — por isso o teste. Ele fica vermelho se alguém devolver o `this.pieces`
// para a lista de `_farSpot`, que é a forma exata como o defeito nasceu.
// node --test shared/test/spawn.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../src/physics/index.js";
import { PLAYER, EAT } from "../src/constants.js";

/** Mundo pelado: o que se mede aqui é a ESCOLHA DO PONTO, não o cenário em volta. */
const arena = () => createWorld({ seed: 7, food: 0, asteroids: false, holes: 0, stars: 0, decay: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test("com um humano pequeno na sala, _playerSpot devolve um ponto", () => {
  const w = arena();
  w.addPlayer(1, { x: 6000, y: 6000, r: PLAYER.SPAWN_R, isBot: false });
  const ps = { slot: 2, isBot: false, pieces: [] };
  let ok = 0;
  for (let i = 0; i < 50; i++) if (w._playerSpot(ps, PLAYER.SPAWN_R)) ok++;
  assert.equal(ok, 50, "todas as chamadas têm que devolver ponto — 0/50 é o defeito de origem");
});

test("o novato nasce DENTRO da tela de quem já estava, e sem nascer em cima dele", () => {
  const w = arena();
  const ancora = w.addPlayer(1, { x: 6000, y: 6000, r: PLAYER.SPAWN_R, isBot: false });
  for (let i = 0; i < 30; i++) {
    const pc = w.addPlayer(100 + i, { r: PLAYER.SPAWN_R, isBot: false });
    const d = dist(pc, ancora);
    // 360 (disco) + 360 (o novato pode ser a âncora de si mesmo? não: só peças de OUTROS entram em `cand`)
    assert.ok(d <= 360 + PLAYER.SPAWN_R, `nasceu a ${Math.round(d)} px — devia estar dentro do disco`);
    assert.ok(d >= 220 - 1, `nasceu a ${Math.round(d)} px — perto demais da âncora`);
    w.removePlayer(100 + i);
  }
});

test("bot não é atraído e o Battle Royale nem passa por aqui", () => {
  const w = arena();
  w.addPlayer(1, { x: 6000, y: 6000, r: PLAYER.SPAWN_R, isBot: false });
  assert.equal(w._playerSpot({ slot: 9, isBot: true, pieces: [] }, PLAYER.SPAWN_R), null);
});

test("um GIGANTE não vira âncora, e continua cobrando os 1500 px", () => {
  const w = arena();
  // única peça da sala é grande demais para ser âncora → não há candidato
  w.addPlayer(1, { x: 6000, y: 6000, r: PLAYER.START_R * 5 + 1, isBot: false });
  assert.equal(w._playerSpot({ slot: 2, isBot: false, pieces: [] }, PLAYER.SPAWN_R), null);
  // com uma âncora válida ao lado de um gigante, o ponto escolhido tem que ficar longe do gigante
  const w2 = arena();
  w2.addPlayer(1, { x: 6000, y: 6000, r: PLAYER.SPAWN_R, isBot: false });
  const gig = w2.addPlayer(2, { x: 6700, y: 6000, r: 400, isBot: false });
  const ancora = w2.players.get(1).pieces[0];
  for (let i = 0; i < 40; i++) {
    const s = w2._playerSpot({ slot: 3, isBot: false, pieces: [] }, PLAYER.SPAWN_R);
    if (!s) continue;
    assert.ok(dist(s, gig) >= 1500, `ponto a ${Math.round(dist(s, gig))} px do gigante`);
    assert.ok(dist(s, ancora) <= 360, "e ainda dentro do disco da âncora");
  }
});

test("uma peça que NÃO me engole é companhia, não perigo: ela não cobra os 1500 px", () => {
  const w = arena();
  w.addPlayer(1, { x: 6000, y: 6000, r: PLAYER.SPAWN_R, isBot: false });
  // um vizinho do mesmo tamanho, colado na âncora: com a régua única de 1500 px isto bastava para reprovar
  w.addPlayer(2, { x: 6000, y: 6300, r: PLAYER.SPAWN_R, isBot: true });
  let ok = 0;
  for (let i = 0; i < 50; i++) if (w._playerSpot({ slot: 3, isBot: false, pieces: [] }, PLAYER.SPAWN_R)) ok++;
  assert.ok(ok > 25, `só ${ok}/50 — vizinho inofensivo não pode reprovar o nascimento`);
  // e o limiar é o do jogo: quem passa de r·EAT.RATIO volta a cobrar os 1500
  assert.ok(PLAYER.SPAWN_R * EAT.RATIO > PLAYER.SPAWN_R);
});

test("o encontro vem ANTES do berçário da supernova: comida não é o que falta ao novato", () => {
  const w = createWorld({ seed: 3, food: 0, asteroids: false, holes: 0, stars: 0, decay: false });
  w.addPlayer(1, { x: 6000, y: 6000, r: PLAYER.SPAWN_R, isBot: false });
  // uma cratera fresca no outro canto do mapa
  w.novas.push({ x: 1500, y: 1500, at: w.tick });
  const ancora = w.players.get(1).pieces[0];
  const pc = w.addPlayer(2, { r: PLAYER.SPAWN_R, isBot: false });
  assert.ok(dist(pc, ancora) <= 360 + PLAYER.SPAWN_R,
    "com gente E berçário disponíveis, quem ganha é a gente");
});

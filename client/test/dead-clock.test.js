// ── A TELA DE MORTE NÃO PODE RENASCER SOZINHA, NEM FICAR PRESA ───────────────
// Dois defeitos opostos, e o mesmo latch resolve os dois. Sem armamento, a aba esquecida renasce a cada 5 s
// para sempre (o pedido que originou isto). Com um armamento que ANDA a cada gesto, quem mexe o mouse na
// tela de morte nunca renasce — a contagem reiniciaria antes de vencer. Ver client/src/ui/deadClock.js.
// node --test client/test/dead-clock.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { morteZero, passoMorte, prazoDe } from '../src/ui/deadClock.js';

const RESP = 5000, T = 1_000_000;

test('recém-nascido não está armado: prazo 0 = a tela nunca renasce sozinha', () => {
  assert.equal(prazoDe(morteZero(), RESP), 0);
  assert.equal(prazoDe(null, RESP), 0);
});

test('gesto ANTES da morte não arma nada', () => {
  const st = passoMorte(morteZero(), { tipo: 'atividade', now: T });
  assert.equal(st.armAt, 0, 'mexer o mouse jogando não pode valer para a morte seguinte');
  assert.equal(prazoDe(st, RESP), 0);
});

test('morreu e ficou parado: continua sem prazo, para sempre', () => {
  const st = passoMorte(morteZero(), { tipo: 'morte', now: T });
  assert.equal(st.deadAt, T);
  assert.equal(prazoDe(st, RESP), 0, 'é isto que quebra o laço morre-renasce da aba esquecida');
});

test('o primeiro gesto depois da morte arma, e o prazo sai dele', () => {
  let st = passoMorte(morteZero(), { tipo: 'morte', now: T });
  st = passoMorte(st, { tipo: 'atividade', now: T + 2000 });
  assert.equal(st.armAt, T + 2000);
  assert.equal(prazoDe(st, RESP), T + 2000 + RESP, 'a contagem parte do GESTO, não da morte');
});

test('O LATCH: gesto repetido não re-arma — senão a contagem nunca vence', () => {
  let st = passoMorte(morteZero(), { tipo: 'morte', now: T });
  st = passoMorte(st, { tipo: 'atividade', now: T + 1000 });
  const prazo = prazoDe(st, RESP);
  for (let i = 1; i <= 10; i++) st = passoMorte(st, { tipo: 'atividade', now: T + 1000 + i * 200 });
  assert.equal(st.armAt, T + 1000, 'dez movimentos depois, o armamento é o do PRIMEIRO');
  assert.equal(prazoDe(st, RESP), prazo, 'e o prazo não andou junto com o mouse');
});

test('atividade sem mudança devolve o MESMO objeto (o React compara por identidade)', () => {
  const morto = passoMorte(morteZero(), { tipo: 'morte', now: T });
  const armado = passoMorte(morto, { tipo: 'atividade', now: T + 500 });
  assert.equal(passoMorte(armado, { tipo: 'atividade', now: T + 900 }), armado);
  const vivo = morteZero();
  assert.equal(passoMorte(vivo, { tipo: 'atividade', now: T }), vivo);
  assert.equal(passoMorte(vivo, { tipo: 'vida', now: T }), vivo);
});

test('a morte SEGUINTE não herda o armamento da anterior', () => {
  let st = passoMorte(morteZero(), { tipo: 'morte', now: T });
  st = passoMorte(st, { tipo: 'atividade', now: T + 1000 });
  st = passoMorte(st, { tipo: 'vida', now: T + 6000 });
  st = passoMorte(st, { tipo: 'morte', now: T + 20000 });
  assert.equal(st.armAt, 0, 'é o defeito que pulava a tela inteira do fim de rodada, na versão desta tela');
  assert.equal(prazoDe(st, RESP), 0);
});

test('renascer zera os dois', () => {
  let st = passoMorte(morteZero(), { tipo: 'morte', now: T });
  st = passoMorte(st, { tipo: 'atividade', now: T + 1000 });
  st = passoMorte(st, { tipo: 'vida', now: T + 6000 });
  assert.deepEqual(st, { deadAt: 0, armAt: 0 });
});

test('o tempo do respawn é o do /admin, não um número cravado', () => {
  let st = passoMorte(morteZero(), { tipo: 'morte', now: T });
  st = passoMorte(st, { tipo: 'atividade', now: T });
  assert.equal(prazoDe(st, 5000), T + 5000);
  assert.equal(prazoDe(st, 30000), T + 30000);
});

// ── O PISO DA TELA: o defeito de PROVENIÊNCIA que fazia a tela de morte não aparecer ──────────────
// Ele não é conforto de UI. O par `{deadAt,armAt}` chega à tela por um store COM THROTTLE (200 ms),
// enquanto `screen:"dead"` vem do store `app`, sem throttle — então no PRIMEIRO render o par lido é o de
// ANTES desta morte. Junte a isso que `game/index.js` não zerava `morte` em `join`/`leave` (só o
// `{t:"alive"}` zerava) e o par de antes podia ser um armamento de OUTRA VIDA, já vencido: o efeito rodava
// `tick()` síncrono na montagem, o prazo já estava no passado e o respawn saía no primeiro frame.
test('sem piso, um armamento vencido de outra vida dispara o respawn na hora', () => {
  // exatamente o que a tela lia: o par velho (armado há 40 s) no primeiro render da morte NOVA
  const velho = { deadAt: T, armAt: T + 1000 };
  const agora = T + 40000;
  assert.ok(prazoDe(velho, RESP) < agora, 'este é o estado que produzia o sumiço da tela');
  // com o piso, nada vence antes de a tela ter estado `minMs` na frente
  assert.equal(prazoDe(velho, RESP, agora, 1500), agora + 1500);
});

test('o piso não atrasa o caso normal — quem manda continua sendo o armamento', () => {
  let st = passoMorte(morteZero(), { tipo: 'morte', now: T });
  st = passoMorte(st, { tipo: 'atividade', now: T });
  // tela apareceu 1,2 s depois da morte; 1200+1500 < 5000, então o prazo continua sendo armAt+RESP
  assert.equal(prazoDe(st, RESP, T + 1200, 1500), T + RESP);
});

test('tela que ainda não apareceu não tem prazo nenhum', () => {
  let st = passoMorte(morteZero(), { tipo: 'morte', now: T });
  st = passoMorte(st, { tipo: 'atividade', now: T });
  assert.equal(prazoDe(st, RESP, 0, 1500), 0, '`telaAt` 0 = a espera de ROUND.DEAD_DELAY_MS ainda corre');
  // e sem piso configurado (o admin zerou) o comportamento antigo volta inteiro
  assert.equal(prazoDe(st, RESP, 0, 0), T + RESP);
});

test('desarmado continua sem prazo, com ou sem piso', () => {
  const so_morto = passoMorte(morteZero(), { tipo: 'morte', now: T });
  assert.equal(prazoDe(so_morto, RESP, T + 1200, 1500), 0, 'sem gesto, ninguém renasce sozinho');
});

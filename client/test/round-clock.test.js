// ── A CONTAGEM DO FIM DE RODADA NÃO PODE NASCER VENCIDA ──────────────────────
// O que estes testes travam é o defeito que pulava a tela inteira do BIG CRUNCH na SEGUNDA virada de
// rodada da mesma carga da página: o instante em que o placar ficou pronto era guardado sem dizer de que
// rodada era, e a virada seguinte o lia — 15 s no passado — como se fosse dela. `play({})` saía no
// primeiro tique, ~100 ms depois do `roundEnd`, e o jogador caía numa sala nova sem placar, sem campeão e
// sem contagem. Ver `client/src/ui/roundClock.js`.
// node --test client/test/round-clock.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { chaveDe, prazoDe } from '../src/ui/roundClock.js';

const AGORA = 1_000_000;
const rodada = (code, at, nextInMs = 15000) => ({ code, at, nextInMs });

test('a chave distingue duas rodadas, inclusive na MESMA sala', () => {
  assert.equal(chaveDe(rodada('1ABC', 10)), chaveDe(rodada('1ABC', 10)));
  assert.notEqual(chaveDe(rodada('1ABC', 10)), chaveDe(rodada('1ABC', 20)));
  assert.notEqual(chaveDe(rodada('1ABC', 10)), chaveDe(rodada('2XYZ', 10)));
  assert.equal(chaveDe(null), '');
});

test('com o placar já montado, a contagem parte DELE (a abertura não come os 15 s)', () => {
  const r = rodada('1ABC', AGORA), k = chaveDe(r);
  const pronto = { chave: k, at: AGORA + 2000 };          // 2 s de abertura
  assert.equal(prazoDe(r, k, pronto, AGORA), AGORA + 2000 + 15000);
});

test('sem o placar montado ainda, a contagem parte da CHEGADA do roundEnd', () => {
  const r = rodada('1ABC', AGORA), k = chaveDe(r);
  assert.equal(prazoDe(r, k, { chave: k, at: 0 }, AGORA), AGORA + 15000);
});

// ── O TESTE QUE IMPORTA ──────────────────────────────────────────────────────
test('o instante da rodada ANTERIOR nunca vence a contagem da atual', () => {
  const a = rodada('1ABC', AGORA), ka = chaveDe(a);
  const prontoA = { chave: ka, at: AGORA + 2000 };         // a 1ª rodada terminou e marcou o seu instante
  const depois = AGORA + 60000;                            // um minuto de jogo
  const b = rodada('2XYZ', depois), kb = chaveDe(b);
  // Este é o passo em que o React ainda não aplicou o `setPronto` da rodada nova: `pronto` é o de A.
  const prazo = prazoDe(b, kb, prontoA, depois);
  assert.ok(prazo > depois, `o prazo tem que estar no FUTURO, veio ${prazo - depois} ms`);
  assert.equal(prazo, depois + 15000, 'e vale a contagem inteira, a partir da chegada desta rodada');
});

test('o mesmo vale quando a sala nova por acaso repete o código da anterior', () => {
  const a = rodada('1ABC', AGORA), ka = chaveDe(a);
  const prontoA = { chave: ka, at: AGORA + 2000 };
  const depois = AGORA + 60000, b = rodada('1ABC', depois), kb = chaveDe(b);
  assert.equal(prazoDe(b, kb, prontoA, depois), depois + 15000);
});

test('nextInMs ausente cai nos 15 s, e sem rodada não há prazo a vencer', () => {
  const r = { code: '1ABC', at: AGORA }, k = chaveDe(r);
  assert.equal(prazoDe(r, k, { chave: '', at: 0 }, AGORA), AGORA + 15000);
  assert.equal(prazoDe(null, '', { chave: '', at: 0 }, AGORA), AGORA);
});

// ── A regra que decide se a equipe ACABOU ─────────────────────────────────────
// Só um 404 desfaz o lobby. O resto é passageiro — e foi tratar tudo como fim que fazia a tela de
// equipe se fechar sozinha em 1 s quando a chamada caía no shard errado (ver refreshParty).
// `api/client.js` é importável em node: nada nele toca no DOM fora de try/catch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, NetworkError, isGone, isUnreachable } from '../src/api/client.js';

test('só o 404 do dono desfaz a equipe', () => {
  assert.equal(isGone(new ApiError(404, 'not_found', 'lobby não encontrado ou expirado')), true);
  assert.equal(isGone(new ApiError(503, 'peer_unreachable', 'o shard da equipe não respondeu')), false, 'shard irmão mudo: a equipe continua lá');
  assert.equal(isGone(new NetworkError('rede')), false);
  assert.equal(isGone(new ApiError(500, 'unreachable', 'Servidor indisponível')), false);
  assert.equal(isGone(new ApiError(409, 'started', 'a equipe já entrou em partida')), false);
});

test('o 503 do irmão continua contando como "servidor fora" para o resto do cliente', () => {
  assert.equal(isUnreachable(new ApiError(503, 'peer_unreachable', 'o shard da equipe não respondeu')), true);
});

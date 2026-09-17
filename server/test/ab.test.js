// ── O BRAÇO DO A/B: DA CONTA, NUNCA DO SLOT NEM DA VIDA ──────────────────────
// `BOT.NOVATO_MANSO='metade'` dá a regra só às contas de id ÍMPAR, e a leitura é feita DEPOIS, por SQL
// (`user_id % 2`, em `scripts/poki-coorte.mjs`). Isso só vale alguma coisa se o braço que o servidor
// APLICA for o mesmo que o banco CALCULA — e os três jeitos de isso quebrar são mudos:
//   1. `users.id` é BIGINT e chega como STRING do driver (a lição de `hostUserId`);
//   2. o respawn (`Sim.revive`) não pode trocar a pessoa de braço no meio da sessão;
//   3. o slot é RECICLADO: quem entra depois não pode herdar o braço de quem saiu.
// node --test server/test/ab.test.js   (não precisa de banco)
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.LOG_LEVEL='silent';
const {Sim,bracoAB}=await import('../src/sim/Sim.js');

test('bracoAB: ímpar é 1, par é 0 — número, string de BIGINT e ausência de conta', ()=>{
  assert.equal(bracoAB(7),1);assert.equal(bracoAB(8),0);
  assert.equal(bracoAB('7'),1,'o driver entrega BIGINT como string');
  assert.equal(bracoAB('90071992547409'),1);assert.equal(bracoAB('90071992547408'),0);
  assert.equal(bracoAB(null),0,'sem conta (modo unsaved) é CONTROLE');
  assert.equal(bracoAB(undefined),0);assert.equal(bracoAB('abc'),0);
});

test('o braço chega ao PlayerState, sobrevive ao respawn e NÃO passa para quem recicla o slot', ()=>{
  const sim=new Sim({seed:1});
  sim.addHuman(0,{name:'Impar',userId:7});
  const ps=sim.world.players.get(0);
  assert.equal(ps.ab,1,'conta 7 → braço 1');
  const gp=sim.players.get(0);gp.dead=true;
  assert.ok(sim.revive(0),'a cena presume que o revive aceita');
  assert.equal(sim.world.players.get(0).ab,1,'vida nova, MESMA pessoa: o braço não muda');
  sim.addHuman(0,{name:'Par',userId:'8'});   // o mesmo slot, outra conta (o `addHuman` recicla)
  assert.equal(sim.world.players.get(0).ab,0,'o slot reciclado é de outra conta — herdar o braço sujaria o A/B em silêncio');
  sim.addHuman(1,{name:'SemConta'});
  assert.equal(sim.world.players.get(1).ab,0);
  sim.addBot(2,{name:'Bot'});
  assert.equal(sim.world.players.get(2).ab,0,'preenchimento não tem braço');
});

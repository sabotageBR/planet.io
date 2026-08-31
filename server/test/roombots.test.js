// ── A SALA NÃO NASCE CHEIA ───────────────────────────────────────────────────
// Ela abria com os 15 preenchimentos no MESMO tick — quinze planetas surgindo juntos no instante em que o
// jogador entra, que é a coisa mais fácil de notar num .io. Aqui prova-se que a sala abre com poucos e vai
// enchendo com o tempo, e que ela PARA no alvo (o Livre repõe bot morto sozinho, então uma chegada que não
// se esgota viraria população infinita).
// node --test server/test/roombots.test.js   (não precisa de banco)
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.LOG_LEVEL='silent';
const {Room}=await import('../src/rooms/Room.js');
const {ROOM,MODE,TICK_HZ}=await import('@warspace/shared/constants.js');

const mudo={info(){},warn(){},error(){},debug(){}};
const sala=(bots=15)=>new Room({code:'TST0',shard:0,seed:7,hooks:null,log:mudo,
  metrics:{inc(){},add(){}},config:{roomMax:30,roomBots:bots},mode:MODE.FREE});
const anda=(r,ticks)=>{for(let i=0;i<ticks;i++)r.step();};

test('abre com o punhado inicial, não com a sala cheia', () => {
  const r=sala(15); r.start();
  assert.equal(r.sim.botCount(),ROOM.BOT_SEED,'a porta abre com BOT_SEED');
  assert.ok(ROOM.BOT_SEED<15,'e o alvo é bem maior que o punhado');
});

test('vai enchendo aos poucos: meio minuto não enche a sala', () => {
  const r=sala(15); r.start();
  const antes=r.sim.botCount();
  anda(r,ROOM.BOT_JOIN_TICKS[1]+1);          // o MAIOR intervalo possível: aí alguém já entrou com certeza
  assert.ok(r.sim.botCount()>antes,'passado um intervalo, alguém entrou');
  anda(r,30*TICK_HZ);
  // O intervalo é sorteado, então a conta é de RITMO, não de contagem exata: em 30 s cabem no máximo
  // 30/6 = 5 chegadas. O que importa é que a sala AINDA não esteja cheia — se estivesse, a chegada
  // gradual não estaria acontecendo, e o jogador veria a mesma multidão instantânea de antes.
  assert.ok(r.sim.botCount()<15,`meio minuto depois ainda não encheu (tem ${r.sim.botCount()})`);
  assert.ok(r.sim.botCount()>=antes+1,'mas cresceu');
});

test('para no alvo e não passa dele', () => {
  const r=sala(15); r.start();
  anda(r,60*TICK_HZ*5);                       // 5 minutos: tempo de sobra para encher
  assert.equal(r.sim.botCount(),15,'chegou ao alvo');
  anda(r,60*TICK_HZ*2);
  assert.equal(r.sim.botCount(),15,'e ficou nele');
});

test('cada preenchimento entra com nome próprio', () => {
  const r=sala(15); r.start(); anda(r,60*TICK_HZ*5);
  const nomes=[...r.sim.players.values()].filter(p=>p.isBot).map(p=>p.name);
  assert.equal(new Set(nomes.map(n=>n.toLowerCase())).size,nomes.length,'sem nick repetido na sala');
});

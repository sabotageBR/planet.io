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
const {ROOM,MODE,TICK_HZ,PLAYER}=await import('@warspace/shared/constants.js');

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

// ── ...E NÃO NASCE TODA PEQUENA ──────────────────────────────────────────────
// Os preenchimentos nasciam todos na mesma faixa, do tamanho de quem acabou de entrar: a sala nova
// PARECIA nova. Aqui prova-se que a abertura tem planeta de todo tamanho e que isso se esgota — quem
// chega depois da janela entra pequeno, como gente que chegou agora.
const raios=r=>[...r.sim.players.values()].filter(p=>p.isBot)
  .map(p=>{const pc=r.sim.world.piecesOf(p.slot)[0];return pc?pc.r:0;});
const [GIG,MED]=ROOM.SEED_R;

test('a sala abre EM ANDAMENTO: gigante, médio e pequeno na semente', () => {
  const r=sala(15); r.start();
  const rs=raios(r);
  assert.equal(rs.length,ROOM.BOT_SEED,'a semente inteira nasceu no start');
  assert.ok(rs.some(x=>x>=GIG[0]&&x<=GIG[1]),`nenhum gigante em ${rs}`);
  assert.ok(rs.some(x=>x>=MED[0]&&x<=MED[1]),`nenhum médio em ${rs}`);
  assert.ok(rs.some(x=>x<=PLAYER.BOT_R[1]),`nenhum pequeno em ${rs}`);
  // e o pequeno é MINORIA: "alguns gigantes, outros médios e alguns poucos pequenos"
  assert.ok(rs.filter(x=>x<=PLAYER.BOT_R[1]).length*2<rs.length,'pequeno não pode ser a maioria');
});

test('a cota não depende de sorte: toda sala abre em andamento', () => {
  for(const seed of [1,7,42,99,1234,55555]){
    const r=new Room({code:'TST0',shard:0,seed,hooks:null,log:mudo,
      metrics:{inc(){},add(){}},config:{roomMax:30,roomBots:15},mode:MODE.FREE});
    r.start();
    const rs=raios(r);
    assert.ok(rs.some(x=>x>=GIG[0]),`seed ${seed}: sala sem gigante (${rs.map(Math.round)})`);
    assert.ok(rs.some(x=>x>=MED[0]&&x<GIG[0]),`seed ${seed}: sala sem médio (${rs.map(Math.round)})`);
  }
});

test('a mistura se esgota: quem chega depois da janela entra pequeno', () => {
  // sala com alvo GRANDE de propósito: com 15 a sala enche antes dos 2 min da janela e não sobra
  // ninguém para chegar depois — que é justamente o caso que este teste precisa observar.
  const r=sala(25); r.start();
  anda(r,ROOM.SEED_WINDOW_TICKS+1);
  const antes=r.sim.botCount();
  assert.ok(antes>ROOM.BOT_SEED,'a chegada gradual aconteceu durante a janela');
  // quem entrar DAQUI para a frente não pode mais nascer grande
  const conhecidos=new Set([...r.sim.players.values()].filter(p=>p.isBot).map(p=>p.slot));
  anda(r,ROOM.BOT_JOIN_TICKS[1]+1);
  const novos=[...r.sim.players.values()].filter(p=>p.isBot&&!conhecidos.has(p.slot));
  assert.ok(novos.length,'alguém entrou depois da janela');
  for(const gp of novos){const pc=r.sim.world.piecesOf(gp.slot)[0];
    assert.ok(pc.r<=PLAYER.BOT_R[1],`${gp.name} entrou com r=${Math.round(pc.r)} fora da janela`);}
});

test('a mesma semente dá a mesma sala', () => {
  const a=sala(15),b=sala(15); a.start(); b.start();
  assert.deepEqual(raios(a),raios(b));
});

// ── O PLACAR FINAL: O CAMPEÃO É A MAIOR MASSA, E QUEM MAIS PONTUOU É CITADO ──
// `_mergeBoard` junta o placar do MUNDO (vivos por massa) com o roster da SALA e tira os destaques. O
// cartão "Campeão" saiu (ele já é o degrau maior do pódio e agora tem faixa própria) e o lugar virou
// "mais pontos" — o `score` sempre viajou no roundEnd e nunca aparecia na tela.
test('destaques: campeão é a maior massa VIVA, pontuador é o maior score da sala', () => {
  const r=sala(0);
  const linha=(k,o)=>r.roster.set(k,{key:k,name:k,registered:false,skinId:0,level:1,isBot:false,
    lives:1,kills:0,deaths:0,food:0,score:0,mass:0,slot:-1,left:false,...o});
  linha('gordo',{slot:1,score:10});          // vivo e enorme, mas quase não pontuou
  linha('pontudo',{slot:2,score:999});       // vivo, pequeno, pontuou a rodada inteira
  linha('morto',{slot:3,score:5000,left:true});   // pontuou mais que todo mundo, mas não está no fim
  const {board,destaques}=r._mergeBoard([{slot:1,mass:900000,score:10},{slot:2,mass:1200,score:999}]);
  assert.equal(destaques.campeao.name,'gordo','campeão = maior massa viva');
  assert.equal(board[0].name,'gordo','e ele é o 1º do placar');
  assert.equal(destaques.pontuador.name,'morto','mais pontos vale para a SALA, não só para quem sobrou');
  assert.equal(destaques.pontuador.score,5000);
});

test('destaques: sem ninguém pontuando, o cartão fica vazio em vez de mentir', () => {
  const r=sala(0);
  r.roster.set('zero',{key:'zero',name:'zero',registered:false,skinId:0,level:1,isBot:false,
    lives:1,kills:0,deaths:0,food:0,score:0,mass:0,slot:1,left:false});
  const {destaques}=r._mergeBoard([{slot:1,mass:900,score:0}]);
  assert.equal(destaques.pontuador,null);
});

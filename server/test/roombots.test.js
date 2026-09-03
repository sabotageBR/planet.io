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
const {setR}=await import('@warspace/shared/physics/body.js');

const mudo={info(){},warn(){},error(){},debug(){}};
const sala=(bots=15)=>new Room({code:'TST0',shard:0,seed:7,hooks:null,log:mudo,
  metrics:{inc(){},add(){}},config:{},roomMax:30,roomBots:bots,mode:MODE.FREE});
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

// ── ...E COM BANDEIRA VARIADA ────────────────────────────────────────────────
// A bandeira do preenchimento existe para dizer que a sala é internacional, e só diz isso se as bandeiras
// forem diferentes. `botCountry` sorteia cada bot numa roleta em que o BR pesa 46 de 100, então a mesma
// bandeira sair 6 ou 7 vezes numa sala de 15 é o valor ESPERADO — foi o que apareceu em produção. O teto
// de ROOM.PAIS_TETO_DIV é o que impede uma cor só de tomar o placar.
const bandeiras=r=>{const m=new Map();
  for(const p of r.sim.players.values())if(p.isBot)m.set(p.country,(m.get(p.country)||0)+1);
  return m;};
const teto=n=>1+Math.floor((n-1)/ROOM.PAIS_TETO_DIV);   // o teto é medido no NASCIMENTO do último bot

test('nenhuma bandeira toma a sala', () => {
  for(const seed of [1,7,42,99,1234,55555]){
    const r=new Room({code:'TST0',shard:0,seed,hooks:null,log:mudo,
      metrics:{inc(){},add(){}},config:{},roomMax:30,roomBots:15,mode:MODE.FREE});
    r.start(); anda(r,60*TICK_HZ*5);
    const m=bandeiras(r),n=[...m.values()].reduce((a,b)=>a+b,0);
    assert.equal(n,15,`seed ${seed}: a sala não encheu`);
    for(const [c,k] of m)
      assert.ok(k<=teto(n),`seed ${seed}: ${k} bots com a bandeira ${c} (teto ${teto(n)})`);
    assert.ok(m.size>=5,`seed ${seed}: só ${m.size} bandeiras em 15 planetas`);
    // e a bandeira volta ao sorteio quando a vaga volta: sem isso a sala vira lista negra de países
    r.trimBots(15);
    assert.equal([...bandeiras(r).values()].reduce((a,b)=>a+b,0),0);
    assert.equal(r.paisesBot.size,0,`seed ${seed}: sala esvaziada e a contagem de bandeiras ficou para trás`);}
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
      metrics:{inc(){},add(){}},config:{},roomMax:30,roomBots:15,mode:MODE.FREE});
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
  // ⚠️ TICK A TICK, medindo o raio no INSTANTE em que o slot aparece. Andar o bloco inteiro e só então
  // olhar mede o raio de quem já passou 14 s COMENDO — o teste passava por sorte e só denunciava a
  // sorte quando a ordem do mundo mudava (foi assim que ele caiu com a grade de comida nova).
  const novos=[];
  for(let i=0;i<ROOM.BOT_JOIN_TICKS[1]+1;i++){r.step();
    for(const gp of r.sim.players.values()){if(!gp.isBot||conhecidos.has(gp.slot))continue;
      conhecidos.add(gp.slot);const pc=r.sim.world.piecesOf(gp.slot)[0];novos.push({nome:gp.name,r:pc?pc.r:0});}}
  assert.ok(novos.length,'alguém entrou depois da janela');
  for(const b of novos)assert.ok(b.r<=PLAYER.BOT_R[1],`${b.nome} entrou com r=${Math.round(b.r)} fora da janela`);
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

// ── O CAMPEÃO É QUEM ESTÁ MAIOR, E MORRER UMA VEZ NÃO PODE APAGAR ALGUÉM DO PLACAR ──────────────────
// Visto em produção, no Livre: a tela de BIG CRUNCH coroou um preenchimento com 92 mil enquanto o humano
// vivo, com muito mais massa, não aparecia nem entre os cinco maiores — e ainda levava os QUATRO
// destaques, que saem do roster. A causa era `left`: o `leave` o escrevia e ninguém o desescrevia, e no
// Livre morrer é `leave`+`join`. Uma morte grudava a marca até o fim da rodada, e `_mergeBoard` a lê como
// "não está mais aqui": a linha ia para o resto, com massa ZERO, atrás de todos os vivos.
// O teste tem que passar pelo caminho REAL (join/leave/join/endRound) — com o roster montado à mão, como
// nos dois testes acima, este defeito é invisível por construção.
const sessaoFalsa=(userId,tok)=>({room:null,slot:-1,pid:0,known:new Set(),rect:null,specSlot:-1,avatar:null,
  userId,resumeToken:tok,isAdmin:false,sessionId:null,json:[],sendJson(m){this.json.push(m);},send(){return true;}});

test('quem morreu e voltou continua no placar — e é o campeão se estiver maior', () => {
  const r=sala(2); r.start();
  const s1=sessaoFalsa(9,'tok-snoop');
  r.join(s1,{name:'SnoopDog',registered:true,userId:9});
  r.sim.players.get(s1.slot).score=100000;
  r.leave(s1,'left');                                    // o botão DE NOVO: fecha o socket e abre outro
  const s2=sessaoFalsa(9,'tok-snoop');
  const slot=r.join(s2,{name:'SnoopDog',registered:true,userId:9});
  const pc=r.sim.world.piecesOf(slot)[0];setR(pc,900);   // e nesta vida ele vira o maior da sala
  anda(r,5);
  const vivos=r.sim.leaderboard();
  assert.equal(vivos[0].slot,slot,'o maior planeta vivo da sala é ele (premissa do teste)');
  r.endRound('time');
  const fim=s2.json.filter(m=>m.t==='roundEnd').pop();
  assert.ok(fim,'a sala mandou o roundEnd');
  assert.equal(fim.champion.name,'SnoopDog','campeão = maior massa viva, mesmo tendo morrido antes');
  assert.equal(fim.board[0].name,'SnoopDog','e ele é o 1º do placar');
  assert.ok(fim.board[0].mass>0,'com a massa de verdade, não zerada como quem saiu');
  assert.equal(fim.board[0].left,false,'a linha não pode ficar marcada como "saiu da sala"');
});

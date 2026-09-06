// ── ASSISTIR A UMA SALA EM ANDAMENTO ─────────────────────────────────────────
// O jogo só tinha espectador-por-MORTE: `{t:"spectate"}` já resolvia câmera, AOI e troca de alvo, e o que
// faltava era a porta de entrada — `acceptsJoin()` recusa o Battle Royale em andamento com `'started'`, que
// é exatamente o caso de uso. O espectador é uma sessão COM slot e SEM corpo (o mesmo `spawn:false` do
// lobby do BR), e o que este arquivo trava é o que separa ASSISTIR de JOGAR: ele não ocupa vaga, não
// aparece no placar de ninguém, não reserva nick e não vira uma linha em `matches`.
// node --test server/test/espectador.test.js   (não precisa de banco)
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.LOG_LEVEL='silent';
const {Room}=await import('../src/rooms/Room.js');
const {ROOM,MODE}=await import('@warspace/shared/constants.js');

const mudo={info(){},warn(){},error(){},debug(){}};
const sala=(mode=MODE.FREE,extra={})=>{
  const r=new Room({code:'TST0',shard:0,seed:7,hooks:null,log:mudo,metrics:{inc(){},add(){},spawn(){}},
    config:{},roomMax:4,roomBots:0,mode,...extra});
  r.start();return r;};
const sessao=()=>({ws:{},sendJson(){},send(){return true;},known:new Map(),detach(){},
  name:'',userId:null,key:null,level:0,avatar:null,country:null,sessionId:null,unsaved:true,isAdmin:false,
  slot:-1,room:null,pid:0,rect:null,specSlot:-1,espectador:false,lastActiveAt:Date.now()});
// ⚠️ `s.name` é escrito pelo `wsServer` antes do join, não pela Room — o `hostRoster` lê a SESSÃO.
const entra=(r,nome)=>{const s=sessao();s.name=nome;r.join(s,{name:nome});return s;};
const assiste=(r,nome)=>{const s=sessao();s.name=nome;r.joinSpec(s,{name:nome});return s;};

test('assistir NÃO ocupa vaga: a sala continua com as vagas que tinha', () => {
  const r=sala();
  entra(r,'jogador');
  assert.equal(r.humanCount,1);
  assiste(r,'olheiro');
  assert.equal(r.humanCount,1,'quem assiste não é jogador');
  assert.equal(r.specCount,1);
  assert.equal(r.sessions.size,2,'mas tem sessão e slot, como qualquer um');
  assert.ok(!r.isFull());
});

test('a sala cheia de JOGADORES ainda aceita quem quer olhar', () => {
  const r=sala();
  for(let i=0;i<4;i++)entra(r,'j'+i);
  assert.ok(r.isFull(),'4 de 4');
  assert.ok(r.acceptsSpectator());
  assiste(r,'olheiro');
  assert.equal(r.specCount,1);
});

test('o Battle Royale em andamento recusa JOGADOR e aceita ESPECTADOR', () => {
  const r=sala(MODE.BR);
  r.phase='live';                        // largou
  assert.equal(r.joinRefusal(),'started','a porta do jogador continua fechada — é o contrato do modo');
  assert.ok(r.acceptsSpectator(),'a do espectador não é a mesma porta');
});

test('o teto de espectadores existe e a resposta é recusa, não fila', () => {
  const r=sala();
  for(let i=0;i<ROOM.SPEC_MAX;i++)assiste(r,'o'+i);
  assert.equal(r.specCount,ROOM.SPEC_MAX);
  assert.ok(!r.acceptsSpectator(),'no teto, a porta fecha');
});

test('sala PARADA ou acabada não aceita espectador — não há o que ver', () => {
  const r=sala(); r.stop();
  assert.ok(!r.acceptsSpectator());
  r.start(); assert.ok(r.acceptsSpectator());
  r.over=true; assert.ok(!r.acceptsSpectator());
});

test('não aparece no PLAYERS nem no placar de quem está jogando', () => {
  const r=sala();
  const j=entra(r,'jogador'); assiste(r,'olheiro');
  const info=r.sim.playersInfo();
  assert.equal(info.length,1,'só o jogador vai ao fio');
  assert.equal(info[0].slot,j.slot);
  assert.equal(r.sim.humanCount(),1,'e o lobby do BR não o conta como gente');
  assert.ok(!r.sim.leaderboard().some(l=>l.slot!==j.slot),'sem corpo, ele nunca entra no placar');
});

test('assistir NÃO reserva o nick — dá para entrar depois com o mesmo nome', () => {
  const r=sala();
  assiste(r,'Messi');
  assert.ok(!r.nickTaken('Messi'),'reservando, quem assistiu não conseguiria JOGAR a seguinte');
});

test('nasce morto: é isso que lhe dá câmera, arquibancada e isenção do ceifador', () => {
  const r=sala();
  const s=assiste(r,'olheiro');
  const gp=r.sim.players.get(s.slot);
  assert.equal(gp.dead,true);
  assert.equal(gp.spectator,true);
  assert.equal(r.sim.world.piecesOf(s.slot).length,0,'sem corpo no mapa');
});

test('a câmera nasce apontada para alguém, não para o meio do mapa', () => {
  const r=sala();
  entra(r,'jogador'); r.step();
  const s=assiste(r,'olheiro');
  assert.ok(s.specSlot>=0,'`spectateTargetFor` roda no joinSpec');
});

test('sair não escreve roster, nem feed, nem "saiu" — ele não disputou nada', () => {
  const r=sala();
  entra(r,'jogador'); r.step();
  const s=assiste(r,'olheiro');
  const antesRoster=r.roster?r.roster.size:0;
  r.leave(s,'left');
  assert.equal(r.specCount,0);
  assert.equal(r.sessions.has(s.slot),false);
  assert.equal(r.sim.players.has(s.slot),false);
  if(r.roster)assert.equal(r.roster.size,antesRoster,'o placar da sala não ganhou uma linha de quem só olhou');
});

test('a coroa da sala NUNCA vai para quem só assiste', () => {
  const r=sala(MODE.FREE,{hostUserId:53,hostNick:'dono'});
  const olheiro=sessao(); olheiro.userId=99; olheiro.connectedAt=1;
  r.joinSpec(olheiro,{name:'olheiro',userId:99});
  const j=sessao(); j.userId=77; j.connectedAt=2;
  r.join(j,{name:'jogador',userId:77});
  r.hostLeftAt=1;                                  // o dono saiu e a carência venceu
  r._hostTick(Date.now()+9e6);
  assert.equal(r.hostUserId,77,'a coroa é de quem está jogando, não de quem está olhando');
});

test('o roster do dono não lista espectador — não há o que expulsar', () => {
  const r=sala(MODE.FREE,{hostUserId:53,hostNick:'dono'});
  entra(r,'jogador'); assiste(r,'olheiro');
  const lista=r.hostRoster();
  assert.equal(lista.length,1);
  assert.equal(lista[0].name,'jogador');
});

test('a contagem PÚBLICA da sala não conta quem assiste', () => {
  const r=sala();
  entra(r,'jogador'); assiste(r,'olheiro');
  assert.equal(r.info().players,1,'senão o "12/30" da tela de Salas contaria gente fora do mapa');
  assert.equal(r.adminInfo().specs,1,'mas o painel vê quantos são');
});

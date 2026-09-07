// ── O CONVITE DE BATTLE ROYALE NÃO PODE INTERROMPER SEM TETO ──────────────────
// `RoomManager.create` avisa o cluster INTEIRO a cada sala de BR pública que nasce, e a sala de BR fecha
// na largada — ou seja cada onda de partidas cria salas novas. Com `BR.LOBBY_TICKS` de 30 s, quem estava
// jogando o Livre levava um card por minuto, sempre, sem cooldown, sem dedupe e sem memória de recusa.
// Aqui trava-se o teto POR SESSÃO (`BR.INVITE_CD_MS`) e as duas invariantes que já existiam: o convite
// só sai em sala do Livre, e só para quem tem socket.
// node --test server/test/brinvite.test.js   (não precisa de banco)
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.LOG_LEVEL='silent';
const {Room}=await import('../src/rooms/Room.js');
const {MODE,BR}=await import('@warspace/shared/constants.js');

const mudo={info(){},warn(){},error(){},debug(){}};
const sala=(mode=MODE.FREE)=>new Room({code:'TST0',shard:0,seed:7,hooks:null,log:mudo,
  metrics:{inc(){},add(){}},config:{},roomMax:30,roomBots:0,mode});
/** Uma sessão só com o que `brInvite` toca: o socket e o carimbo do último convite. */
const sessao=(ws=true)=>({ws:ws?{}:null,brInviteAt:0,brMudo:false,recebidos:[],sendJson(m){this.recebidos.push(m);}});
const povoa=(r,ns)=>{ns.forEach((s,i)=>r.sessions.set(i,s));return ns;};

test('o primeiro convite sai para todo mundo que tem socket', () => {
  const r=sala(), [a,b,c]=povoa(r,[sessao(),sessao(),sessao(false)]);
  assert.equal(r.brInvite('ABCD'),2,'os dois conectados; quem está sem socket não conta');
  assert.equal(a.recebidos[0].t,'brStart');
  assert.equal(a.recebidos[0].room,'ABCD');
  assert.equal(c.recebidos.length,0);
  assert.ok(b.brInviteAt>0,'o carimbo é escrito em quem RECEBEU');
});

test('o segundo convite dentro do cooldown não interrompe ninguém', () => {
  const r=sala(), [a]=povoa(r,[sessao()]);
  assert.equal(r.brInvite('ABCD'),1);
  assert.equal(r.brInvite('EFGH'),0,'outra sala de BR, mesma pessoa, poucos ms depois: nada');
  assert.equal(a.recebidos.length,1);
});

test('passado o cooldown, ele volta a receber', () => {
  const r=sala(), [a]=povoa(r,[sessao()]);
  r.brInvite('ABCD');
  a.brInviteAt=Date.now()-BR.INVITE_CD_MS-1;      // o relógio da sessão, andado à mão
  assert.equal(r.brInvite('EFGH'),1);
  assert.equal(a.recebidos.length,2);
  assert.equal(a.recebidos[1].room,'EFGH');
});

test('o teto é POR SESSÃO, não por sala: quem entrou agora recebe na hora', () => {
  const r=sala(), [velho]=povoa(r,[sessao()]);
  r.brInvite('ABCD');
  const novo=sessao(); r.sessions.set(9,novo);    // chegou depois do convite anterior
  assert.equal(r.brInvite('EFGH'),1,'só o novato — o veterano ainda está no cooldown');
  assert.equal(novo.recebidos.length,1);
  assert.equal(velho.recebidos.length,1);
});

test('convite NÃO sai em sala que já é de Battle Royale', () => {
  const r=sala(MODE.BR), [a]=povoa(r,[sessao()]);
  assert.equal(r.brInvite('ABCD'),0,'quem já está num BR não precisa ser convidado a outro');
  assert.equal(a.recebidos.length,0);
  assert.equal(a.brInviteAt,0,'e o relógio dele nem é tocado');
});

test('o TTL continua vindo no pacote — é ele que faz o card sumir sozinho', () => {
  const r=sala(), [a]=povoa(r,[sessao()]);
  r.brInvite('ABCD');
  assert.equal(a.recebidos[0].ttlMs,BR.INVITE_TTL_MS);
  const r2=sala(), [b]=povoa(r2,[sessao()]);
  r2.brInvite('ABCD',{ttlMs:5000});
  assert.equal(b.recebidos[0].ttlMs,5000);
});

// ── SILENCIAR: É DESTA SALA, E ACABA COM A SESSÃO ────────────────────────────
// `Session.brMudo` é escrito pelo `{t:"brMute"}` do card. O alcance não precisa de relógio nem de memória
// porque a SESSÃO é o alcance: ela nasce com o socket e morre com ele, então entrar em outra sala do Livre
// é uma sessão nova e o jogador volta a ser avisado. Não confundir com a pref `brInvite` da CONTA, que é
// "nunca mais, em lugar nenhum", vive no banco e é decidida no cliente.
test('quem silenciou não recebe mais convite nesta sala', () => {
  const r=sala(), [a,b]=povoa(r,[sessao(),sessao()]);
  a.brMudo=true;
  assert.equal(r.brInvite('ABCD'),1,'só o outro é interrompido');
  assert.equal(a.recebidos.length,0);
  assert.equal(b.recebidos.length,1);
});

test('silenciar não gasta o cooldown de quem calou', () => {
  const r=sala(), [a]=povoa(r,[sessao()]);
  a.brMudo=true; r.brInvite('ABCD');
  assert.equal(a.brInviteAt,0,'quem não recebe não tem relógio a queimar');
});

test('o silêncio é da SESSÃO: entrar noutra sala volta a avisar', () => {
  const r=sala(), [a]=povoa(r,[sessao()]);
  a.brMudo=true;
  assert.equal(r.brInvite('ABCD'),0);
  // outra sala do Livre = outro socket = outra Session (wsServer cria uma por conexão)
  const r2=sala(), [nova]=povoa(r2,[sessao()]);
  assert.equal(r2.brInvite('EFGH'),1,'a marca não viaja: ninguém a carrega de uma sala para a outra');
  assert.equal(nova.recebidos.length,1);
});

test('silenciar um não cala a sala', () => {
  const r=sala(), ns=povoa(r,[sessao(),sessao(),sessao()]);
  ns[1].brMudo=true;
  assert.equal(r.brInvite('ABCD'),2);
});

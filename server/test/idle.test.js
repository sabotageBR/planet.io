// ── QUEM DEIXA A ABA ABERTA SAI DA SALA ──────────────────────────────────────
// O jogador ausente não some sozinho: ele ocupa vaga, vira comida de graça e — no Livre, onde a tela de
// morte renascia SOZINHA a cada 5 s — entrava em sala após sala, para sempre. O que se prova aqui é a
// remoção E, principalmente, as ISENÇÕES: o morto do Battle Royale (que o jogo CONVIDA a ficar assistindo o
// pódio) e o dono da sala (cuja sala existe para esperar os amigos chegarem pelo link) não podem ser
// removidos por ficarem parados olhando.
// `housekeeping(now)` recebe o instante por parâmetro, então três minutos custam uma soma — sem relógio
// real, sem setTimeout e sem banco.
// node --test server/test/idle.test.js   (não precisa de banco)
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.LOG_LEVEL='silent';
const {Room}=await import('../src/rooms/Room.js');
const {MODE,NET}=await import('@warspace/shared/constants.js');

const mudo={info(){},warn(){},error(){},debug(){}};
const sala=(extra={})=>new Room({code:'TST0',shard:0,seed:7,hooks:null,log:mudo,
  metrics:{inc(){},add(){}},config:{},roomMax:30,roomBots:0,mode:MODE.FREE,...extra});
/** O molde de `quit.test.js`, mais os dois campos que a inatividade lê. */
const sessaoFalsa=(o={})=>({room:null,slot:-1,pid:0,known:new Set(),rect:null,specSlot:-1,avatar:null,
  userId:null,resumeToken:'tok',isAdmin:false,sessionId:null,kicked:false,ws:{},disconnectedAt:0,json:[],
  lastActiveAt:0,idleWarnedAt:0,name:'Fulano',
  marcaAtivo(now=Date.now()){this.lastActiveAt=now;this.idleWarnedAt=0;},
  sendJson(m){this.json.push(m);},send(){return true;},
  error(code,msg,extra){this.kicked=true;this.json.push({t:'error',code,...(extra||{})});},
  detach(){this.ws=null;this.disconnectedAt=Date.now();},...o});
const T0=1_000_000;
/** Entra na sala com o relógio em T0 (é o que `Room.join` faria via `Session.attach`). */
const entra=(r,o={})=>{const s=sessaoFalsa(o);r.join(s,{name:o.name||'Fulano'});s.marcaAtivo(T0);return s;};
const de=(s,t)=>s.json.filter(m=>m.t===t);

test('parado além do limite: sai da sala com ROOM_IDLE',()=>{
  const r=sala();r.start();const s=entra(r);
  r.housekeeping(T0+NET.IDLE_MS-1);
  assert.equal(r.sessions.size,1,'um milissegundo antes ainda está dentro');
  r.housekeeping(T0+NET.IDLE_MS);
  const err=de(s,'error')[0];
  assert.ok(err,'levou um error');
  assert.equal(err.code,'ROOM_IDLE');
  assert.ok(err.min>0,'o texto da tela precisa do número de minutos');
  assert.ok(s.kicked,'kicked=true, senão ele volta pelo resume em 10 s');
  assert.equal(r.sessions.size,0,'e saiu da sala');
});

test('o aviso sai UMA vez, com o tempo restante certo',()=>{
  const r=sala();r.start();const s=entra(r);
  const t=T0+NET.IDLE_MS-NET.IDLE_WARN_MS;
  for(let i=0;i<10;i++)r.housekeeping(t+i*1000);        // dez passadas do laço de 1 Hz
  const avisos=de(s,'idle');
  assert.equal(avisos.length,1,'uma faixa, não uma por segundo');
  assert.equal(avisos[0].inMs,NET.IDLE_WARN_MS,'o número da tela é exato, mesmo o laço sendo de 1 Hz');
  assert.equal(r.sessions.size,1,'e ninguém foi removido ainda');
});

test('mexeu no meio do aviso: não sai, e um silêncio NOVO avisa de novo',()=>{
  const r=sala();r.start();const s=entra(r);
  const t=T0+NET.IDLE_MS-NET.IDLE_WARN_MS;
  r.housekeeping(t);
  assert.equal(de(s,'idle').length,1);
  s.marcaAtivo(t+1000);                                  // voltou ao teclado
  r.housekeeping(t+2000);
  assert.equal(r.sessions.size,1,'continua na sala');
  assert.equal(s.idleWarnedAt,0,'o aviso foi desarmado junto');
  r.housekeeping(t+1000+NET.IDLE_MS-NET.IDLE_WARN_MS);   // parou de novo
  assert.equal(de(s,'idle').length,2,'o segundo silêncio produz um aviso novo');
});

test('BATTLE ROYALE: o morto fica para ver o pódio',()=>{
  const r=sala({mode:MODE.BR});r.start();
  const s=entra(r);r.phase='live';
  const gp=r.sim.players.get(s.slot);gp.dead=true;
  r.housekeeping(T0+NET.IDLE_MS*3);
  assert.equal(r.sessions.size,1,'assistir não é inatividade — o jogo promete isso na tela');
  assert.equal(de(s,'error').length,0);
});

test('LIVRE: o morto parado SAI (é o caso do pedido)',()=>{
  const r=sala();r.start();const s=entra(r);
  const gp=r.sim.players.get(s.slot);gp.dead=true;
  r.housekeeping(T0+NET.IDLE_MS);
  assert.equal(r.sessions.size,0);
  assert.equal(de(s,'error')[0].code,'ROOM_IDLE');
});

test('o dono da sala não é removido: ela existe para esperar os amigos',()=>{
  const r=sala({hostUserId:53,hostNick:'dono',private:true});r.start();
  const s=entra(r,{userId:53,name:'dono'});
  assert.ok(r.isHost(s),'é o dono mesmo');
  r.housekeeping(T0+NET.IDLE_MS*3);
  assert.equal(r.sessions.size,1);
});

test('no LOBBY ninguém é removido: não há o que fazer lá',()=>{
  const r=sala({mode:MODE.BR});r.start();const s=entra(r);
  r.phase='lobby';
  r.housekeeping(T0+NET.IDLE_MS*3);
  assert.equal(r.sessions.size,1);
});

test('rodada acabada: assistir ao pódio do BIG CRUNCH não é inatividade',()=>{
  const r=sala();r.start();const s=entra(r);
  r.over=true;
  r.housekeeping(T0+NET.IDLE_MS*3);
  assert.equal(r.sessions.size,1);
});

test('IDLE_KICK desligado não remove ninguém',()=>{
  const antes=NET.IDLE_KICK;NET.IDLE_KICK=false;
  try{const r=sala();r.start();const s=entra(r);
    r.housekeeping(T0+NET.IDLE_MS*3);
    assert.equal(r.sessions.size,1,'o interruptor do /admin tem que desligar de verdade');
    assert.equal(de(s,'idle').length,0,'e nem avisar');
  }finally{NET.IDLE_KICK=antes;}
});

test('sessão SEM socket sai pelo caminho do resume, não pelo da inatividade',()=>{
  const r=sala();r.start();const s=entra(r);
  s.ws=null;s.disconnectedAt=T0;
  r.housekeeping(T0+NET.RESUME_MS+1);
  assert.equal(r.sessions.size,0,'saiu');
  assert.equal(de(s,'error').length,0,'e sem error: quem caiu a rede não é expulso, expira');
});

test('preenchimento nenhum é tocado: bot não tem sessão',()=>{
  const r=sala({roomBots:15});r.start();
  const antes=r.sim.botCount();
  assert.ok(antes>0,'a sala abriu com preenchimentos');
  r.housekeeping(T0+NET.IDLE_MS*5);
  assert.equal(r.sim.botCount(),antes,'o servidor não pode expulsar os próprios bots');
});

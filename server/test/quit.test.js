// ── PLANETA EXPLODE AO QUITAR ─────────────────────────────────────────────────
// Só o quit VOLUNTÁRIO ({t:'quit'} → wsServer → Room.leave(session,'left',true)) estoura o planeta e
// espalha a massa inteira como pelotas sem dono (ver rules.explodeQuit). Kick/ban do dono e o timeout de
// reconexão continuam removendo em silêncio, como sempre — os dois chamam leave(session,'left') SEM o
// terceiro parâmetro, e `explode` default é `false`. A causa gravada no banco (`cause`) continua 'left'
// nos três casos: só o parâmetro NOVO (`explode`) muda, de propósito separado de `cause` (ver o aviso em
// Room.hostKick sobre o CHECK de matches.cause).
// node --test server/test/quit.test.js   (não precisa de banco)
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.LOG_LEVEL='silent';
const {Room}=await import('../src/rooms/Room.js');
const {MODE,NET}=await import('@warspace/shared/constants.js');
const {setR}=await import('@warspace/shared/physics/body.js');

const mudo={info(){},warn(){},error(){},debug(){}};
const sala=(extra={})=>new Room({code:'TST0',shard:0,seed:7,hooks:null,log:mudo,
  metrics:{inc(){},add(){}},config:{},roomMax:30,roomBots:0,mode:MODE.FREE,...extra});
const sessaoFalsa=()=>({room:null,slot:-1,pid:0,known:new Set(),rect:null,specSlot:-1,avatar:null,
  userId:null,resumeToken:'tok',isAdmin:false,sessionId:null,kicked:false,ws:{},disconnectedAt:0,json:[],
  sendJson(m){this.json.push(m);},send(){return true;},
  error(code){this.kicked=true;this.json.push({t:'error',code});},
  detach(){this.ws=null;this.disconnectedAt=Date.now();}});

test('quit voluntário: o planeta estoura e a massa inteira vira pelotas sem dono',()=>{
  const r=sala();r.start();
  const s=sessaoFalsa();const slot=r.join(s,{name:'Fulano'});
  const pc=r.sim.world.piecesOf(slot)[0];setR(pc,300);const m0=pc.mass;
  r.leave(s,'left',true);
  const pel=r.sim.world.ejected.filter(e=>e.owner===-1);
  assert.ok(pel.length>0,'espalhou fragmentos');
  assert.ok(Math.abs(pel.reduce((a,e)=>a+e.mass,0)-m0)<1e-6,'a massa inteira virou pelotas, nada evapora');
  assert.equal(r.sim.world.piecesOf(slot).length,0,'a peça foi removida do mundo, como sempre');});

test('kick/ban do dono: remove em silêncio, sem explosão',()=>{
  const r=sala();r.start();
  const s=sessaoFalsa();const slot=r.join(s,{name:'Fulano'});
  const pc=r.sim.world.piecesOf(slot)[0];setR(pc,300);
  r.hostKick(s.pid);
  const pel=r.sim.world.ejected.filter(e=>e.owner===-1);
  assert.equal(pel.length,0,'nenhum fragmento: kick continua silencioso, exatamente como antes');
  assert.equal(r.sim.world.piecesOf(slot).length,0,'e a peça foi removida do mesmo jeito');});

test('timeout de reconexão (housekeeping): remove em silêncio, sem explosão',()=>{
  const r=sala();r.start();
  const s=sessaoFalsa();const slot=r.join(s,{name:'Fulano'});
  const pc=r.sim.world.piecesOf(slot)[0];setR(pc,300);
  r.detach(s);s.disconnectedAt=Date.now()-(NET.RESUME_MS+1000);   // como se a graça de reconexão já tivesse vencido
  r.housekeeping(Date.now());
  const pel=r.sim.world.ejected.filter(e=>e.owner===-1);
  assert.equal(pel.length,0,'nenhum fragmento: a queda de rede continua silenciosa');
  assert.equal(r.sessions.has(slot),false,'e a sessão realmente expirou');});

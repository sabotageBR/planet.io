// ── SALA COM DONO: criar com opções, tempo SEM FIM, sala privada, expulsar e banir ────────────
// Precisa de BANCO: só conta registrada pode ser dona (é ela que expulsa e bane, e quem troca de identidade
// a cada entrada não pode ter esse poder), e resolver a conta do token é uma ida ao Postgres.
// node --test server/test/host.test.js
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import WebSocket from 'ws';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(!process.env.DATABASE_URL){try{for(const l of readFileSync(path.join(ROOT,'.env'),'utf8').split('\n')){const m=/^\s*([A-Z_]+)=(.*)$/.exec(l);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim();}}catch{}}
process.env.LOG_LEVEL=process.env.TEST_LOG||'silent';process.env.SHARD='0';process.env.SHARDS='1';process.env.PEERS='';
const {startServer}=await import('../src/index.js');
const {decodeMessage,MSG}=await import('@warspace/shared/protocol/index.js');
const {MODE,ROUND,ZONE_TOTAL_TICKS,TICK_HZ,roundTicksOf}=await import('@warspace/shared/constants.js');
const LOG=process.env.LOG_LEVEL;
let srv,base,wsUrl,temBanco=false;

class C{
  constructor(url){this.json=[];this.waiters=[];this.slot=-1;this.closed=null;
    const ws=this.ws=new WebSocket(url);
    ws.on('message',(d,bin)=>{if(bin){const m=decodeMessage(d);if(m&&m.type===MSG.PLAYERS)this.players=m.players;}
      else this.json.push(JSON.parse(d.toString()));this._wake();});
    ws.on('close',c=>{this.closed=c;this._wake();});ws.on('error',()=>{});}
  send(o){try{this.ws.send(JSON.stringify(o));}catch{}}
  // ⚠️ esperar o `open` não é zelo: `ws.send` antes dele LANÇA, e um try/catch em volta engole a mensagem —
  // o join nunca sairia e o teste morreria de timeout dizendo "room", que não é o defeito.
  open(){return new Promise((res,rej)=>{if(this.ws.readyState===1)return res();this.ws.once('open',res);this.ws.once('error',rej);});}
  _wake(){const w=this.waiters;this.waiters=[];for(const f of w)f();}
  async until(p,ms=8000,label='condição'){const t0=Date.now();for(;;){const v=p();if(v)return v;if(Date.now()-t0>ms)throw new Error(`timeout: ${label}`);
    await new Promise(r=>{this.waiters.push(r);setTimeout(r,25);});}}
  of(t,from=0){for(let i=from;i<this.json.length;i++)if(this.json[i].t===t)return this.json[i];return null;}
  async join(o){await this.open();const n=this.json.length;
    this.send({t:'join',token:o.tok,fallbackNick:o.nick||'Teste',view:{w:1280,h:720},room:o.room||null,mode:o.mode|0});
    const r=await this.until(()=>this.of('room',n)||this.of('error',n),8000,'room');
    if(r.t==='error')throw new Error(`join: ${r.code} ${r.message}`);this.slot=r.slot;this.room=r;return r;}
  close(){try{this.ws.close();}catch{}}
}
const api=(p,o={})=>fetch(base+p,{headers:{'content-type':'application/json',authorization:`Bearer ${o.tok||''}`,'x-forwarded-for':o.ip||'10.7.7.7'},...o})
  .then(async r=>({status:r.status,body:await r.json().catch(()=>null)}));
const post=(p,body,o={})=>api(p,{method:'POST',body:JSON.stringify(body||{}),...o});
let nIp=0;
/** Conta REGISTRADA nova (guest + claim): é a única que pode ser dona de sala. */
async function conta(nick){
  const ip=`10.8.${(nIp>>8)&255}.${(nIp++)&255}`;
  const g=await fetch(base+'/api/auth/guest',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':ip},body:'{}'});
  if(g.status!==201)return null;
  const tok=(await g.json()).token;
  const c=await fetch(base+'/api/auth/claim',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${tok}`,'x-forwarded-for':ip},
    body:JSON.stringify({nick,password:'senha-de-teste-123'})});
  return c.ok?tok:null;}
async function convidado(){
  const ip=`10.9.${(nIp>>8)&255}.${(nIp++)&255}`;
  const g=await fetch(base+'/api/auth/guest',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':ip},body:'{}'});
  return g.status===201?(await g.json()).token:null;}

before(async()=>{
  srv=await startServer({port:0,logLevel:LOG,migrateOnStart:false});
  base=`http://127.0.0.1:${srv.port}`;wsUrl=`ws://127.0.0.1:${srv.port}/ws/0`;
  const t=await conta('DonoTeste'+Date.now().toString(36).slice(-5));temBanco=!!t;
});
after(async()=>{await srv.close();});
const sala=code=>srv.rooms.rooms.get(code);
const pulaSemBanco=()=>{if(!temBanco){console.log('# sem banco: os testes de dono de sala foram pulados');return true;}return false;};

// ── 1. quem pode ser dono ──────────────────────────────────────────────────────────────────
test('só conta REGISTRADA abre sala: sem token é 401, convidado é 403',async()=>{
  if(pulaSemBanco())return;
  assert.equal((await post('/api/rooms',{mode:0,minutes:30})).status,403,'sem Bearer não há conta');
  const g=await convidado();
  const r=await post('/api/rooms',{mode:0,minutes:30},{tok:g});
  assert.equal(r.status,403,'convidado não vira dono: quem expulsa e bane precisa de identidade que dure');
  assert.equal(r.body.error,'need_account');});

// ── 2. as opções chegam à sala ─────────────────────────────────────────────────────────────
test('a duração escolhida vira os ticks da sala, e a validação é a MESMA do shared',async()=>{
  if(pulaSemBanco())return;
  const tok=await conta('Anfitriao'+Date.now().toString(36).slice(-5));
  const r=await post('/api/rooms',{mode:MODE.FREE,minutes:10},{tok});
  assert.equal(r.status,200);
  assert.equal(sala(r.body.room.code).roundTicks,10*60*TICK_HZ);
  // duração fora da lista é recusada, e a lista é a de shared/constants.js
  assert.equal((await post('/api/rooms',{mode:MODE.FREE,minutes:45},{tok})).status,409);
  // ⚠️ no Battle Royale não há SEM FIM: o tempo é a rede de segurança da zona
  assert.equal(roundTicksOf(MODE.BR,0),null,'BR não aceita sem fim');
  assert.equal((await post('/api/rooms',{mode:MODE.BR,minutes:0},{tok})).status,409);
  assert.ok(roundTicksOf(MODE.BR,10)>=ZONE_TOTAL_TICKS,'e o piso do BR é derivado da zona, não copiado');});

// ── 3. SEM FIM: o bug do `0 >= 0` e a cascata de BIG CRUNCH ────────────────────────────────
test('tempo infinito: a rodada não acaba no primeiro tick e não sai um aviso de fim de mundo',async()=>{
  if(pulaSemBanco())return;
  const tok=await conta('Eterno'+Date.now().toString(36).slice(-5));
  const r=await post('/api/rooms',{mode:MODE.FREE,minutes:0},{tok});
  assert.equal(r.status,200);
  const room=sala(r.body.room.code);
  assert.equal(room.roundTicks,0,'0 é a representação de SEM FIM');
  assert.equal(room.roundLeft(),null,'e roundLeft devolve null, que é diferente de 0 (acabou)');
  const c=new C(wsUrl);await c.join({tok,nick:'Eterno',room:room.code});
  // roda MUITO mais do que o `roundStart` + qualquer duração: `0>=0` teria acabado no tick 0
  await new Promise(r2=>setTimeout(r2,900));
  assert.ok(room.sim.tick>30,'a sala andou');
  assert.equal(room.over,false,'a sala SEM FIM não termina sozinha');
  assert.equal(c.of('roundEnd'),null,'e ninguém recebe fim de rodada');
  const feed=c.json.filter(j=>j.t==='feed').flatMap(j=>j.v||[]);
  assert.equal(feed.filter(l=>l.how==='crunch').length,0,'nem a cascata de avisos de BIG CRUNCH');
  assert.equal(c.room.round.ticks,0,'o cliente recebe ticks:0 e desliga o relógio da rodada');
  assert.ok(c.room.round.dayTicks>0,'mas o DIA continua vindo, senão o céu pararia de girar');
  c.close();});

// ── 4. sala privada ────────────────────────────────────────────────────────────────────────
test('sala privada: fora da lista e do automático, mas entra quem tem o código',async()=>{
  if(pulaSemBanco())return;
  const tok=await conta('Reservado'+Date.now().toString(36).slice(-5));
  const r=await post('/api/rooms',{mode:MODE.FREE,minutes:30,private:true},{tok});
  const code=r.body.room.code;
  assert.equal(sala(code).private,true);
  const lista=(await api('/api/rooms')).body.rooms.map(x=>x.code);
  assert.ok(!lista.includes(code),'não aparece em /api/rooms');
  assert.notEqual((await api('/api/auto?mode=0')).body.code,code,'nem no automático');
  assert.ok(!srv.rooms.listRooms().some(x=>x.code===code),'nem em /internal/rooms, que é o que os irmãos veem');
  // mas o código é o convite, e ele funciona
  const c=new C(wsUrl);const j=await c.join({tok,nick:'Reservado',room:code});
  assert.equal(j.code,code);assert.equal(j.host,true,'e quem criou entra como dono');
  assert.equal(j.private,true);
  c.close();});

// ── 5. expulsar e banir ────────────────────────────────────────────────────────────────────
test('expulsar: só o dono pode, o expulso cai, e banido não volta nem pelo código',async()=>{
  if(pulaSemBanco())return;
  const tok=await conta('Chefe'+Date.now().toString(36).slice(-5));
  const code=(await post('/api/rooms',{mode:MODE.FREE,minutes:30,private:true},{tok})).body.room.code;
  const dono=new C(wsUrl);await dono.join({tok,nick:'Chefe',room:code});
  const gt=await convidado();
  const vis=new C(wsUrl);await vis.join({tok:gt,nick:'Visita',room:code});
  const room=sala(code);
  const host=await dono.until(()=>dono.of('host'),4000,'painel do dono');
  await dono.until(()=>(dono.of('host')&&dono.json.filter(j=>j.t==='host').pop().roster.length===2),4000,'os dois no roster');
  const roster=dono.json.filter(j=>j.t==='host').pop().roster;
  // ⚠️ o roster é de JOGADOR, não de administrador: nada de sessionId, userId ou IP
  for(const l of roster)for(const proibido of ['sessionId','userId','ip','key','resumeToken'])
    assert.equal(l[proibido],undefined,`o roster do dono não pode levar ${proibido}`);
  assert.equal(roster.length,room.sessions.size,'e só humanos: com bots na sala, iterar sessions é o que respeita o anonBots');
  const alvo=roster.find(l=>!l.host);
  // quem NÃO é dono não expulsa ninguém
  vis.send({t:'room',act:'kick',pid:roster.find(l=>l.host).pid});
  await new Promise(r=>setTimeout(r,150));
  assert.equal(room.sessions.size,2,'a recusa não pode ter efeito colateral nenhum');
  // o dono bane
  dono.send({t:'room',act:'ban',pid:alvo.pid});
  await vis.until(()=>vis.of('error'),4000,'o expulso recebe o erro');
  assert.equal(vis.of('error').code,'ROOM');
  await dono.until(()=>room.sessions.size===1,4000,'e sai da sala');
  assert.equal(room.bans.size,1);
  // e não volta, nem digitando o código
  const volta=new C(wsUrl);
  await assert.rejects(()=>volta.join({tok:gt,nick:'Visita',room:code}),/banid/i,'banido não volta pelo código');
  volta.close();vis.close();dono.close();void host;});

// ── 6. o ceifador não pode comer a sala do dono ────────────────────────────────────────────
test('sala com dono sobrevive à carência do ceifador (é ela que espera os amigos)',async()=>{
  if(pulaSemBanco())return;
  const tok=await conta('Paciente'+Date.now().toString(36).slice(-5));
  const code=(await post('/api/rooms',{mode:MODE.FREE,minutes:30,private:true},{tok})).body.room.code;
  const room=sala(code);
  assert.ok(room.holdUntil>Date.now()+60000,'a carência nasce com a sala');
  room.lastHumanAt=Date.now()-ROUND.BREAK_MS-999999;room.running=false;   // finge sala vazia há muito tempo
  await new Promise(r=>setTimeout(r,1200));
  assert.ok(sala(code),'com a carência valendo, a sala continua de pé');
  room.holdUntil=Date.now()-1;
  await new Promise(r=>setTimeout(r,1200));
  assert.equal(sala(code),undefined,'vencida a carência, o ceifador leva');});

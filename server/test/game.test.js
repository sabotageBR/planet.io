// ── Teste de integração do servidor de jogo: join → snapshots/AOI → input → split/eject → ping →
//    2ª sessão → rate limit → resume → morte (dead + rewards) → /healthz → soak 10 s ──
// Usa o Postgres de dev (.env na raiz); sem banco o servidor sobe em modo unsaved e o teste segue.
// node --test server/test/game.test.js
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import WebSocket from 'ws';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(!process.env.DATABASE_URL){try{for(const l of readFileSync(path.join(ROOT,'.env'),'utf8').split('\n')){const m=/^\s*([A-Z_]+)=(.*)$/.exec(l);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim();}}catch{}}
process.env.LOG_LEVEL=process.env.TEST_LOG||'silent';process.env.SHARD='0';process.env.SHARDS='1';process.env.PEERS='';
// ⚠️ o `.env` da raiz é lido logo acima, e assim que ele ganhou um GOOGLE_CLIENT_ID de verdade o
// `deepEqual` de /api/config lá embaixo passou a quebrar por causa do AMBIENTE. Fixar aqui faz o
// teste afirmar o estado DESLIGADO de propósito — que é o contrato que ele quer travar.
process.env.GOOGLE_CLIENT_ID='';
const {startServer}=await import('../src/index.js');
const {decodeMessage,encodeInput,MSG,KIND,PIECE_FLAG,PLAYER_FLAG,INPUT_FLAG,ERROR_CODE,SELF_FLAG,PROTOCOL_VERSION}=await import('@warspace/shared/protocol/index.js');
const {FOOD,NET,BOT_NAMES,SNAPSHOT_EVERY,BLACKHOLE,WORLD,ROOM}=await import('@warspace/shared/constants.js');
const {rectHas,viewRect}=await import('@warspace/shared/camera.js');
const {setR}=await import('@warspace/shared/physics/body.js');
const {newCode,shardOf,isValidCode,normalizeCode}=await import('../src/rooms/codes.js');
const {Bucket}=await import('../src/net/Session.js');
const LOG=process.env.LOG_LEVEL;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let srv,base,wsUrl,token=null,unsavedMode=false;
// Um convidado NOVO por cliente. O IP varia porque o limitador de `/api/auth/guest` é 5/h/IP.
let nIp=0;
async function novoToken(){
  if(unsavedMode||!token)return token||'pt_sem_banco';   // servidor sem banco: quem diferencia é o fallbackNick
  try{const ip=`10.9.${(nIp>>8)&255}.${(nIp++)&255}`;
    const r=await fetch(base+'/api/auth/guest',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':ip},body:'{}'});
    if(r.status===201)return (await r.json()).token;}catch{}
  return token;}
const startAt=port=>startServer({port:port??0,logLevel:LOG,migrateOnStart:false});

// ── cliente de teste: decodifica tudo, mantém o mundo conhecido (creates/updates/removes) ──
class Client{
  constructor(url=wsUrl){this.url=url;this.json=[];this.snaps=[];this.players=null;this.lb=null;this.events=[];this.pongs=[];this.known=new Map();this.waiters=[];this.closeCode=null;this.slot=-1;this.seq=1;this.bytes=0;this.reconnect();}
  /** socket novo com os mesmos handlers (resume) */
  reconnect(){const ws=this.ws=new WebSocket(this.url);this.closeCode=null;this.known.clear();
    ws.on('message',(d,isBin)=>{if(isBin){const m=decodeMessage(d);if(!m)return;this.bytes+=d.length;
        if(m.type===MSG.SNAPSHOT){m.bytes=d.length;this.snaps.push(m);for(const c of m.creates)this.known.set(c.id,c);for(const u of m.updates){const e=this.known.get(u.id);if(e){if(u.x!=null){e.x=u.x;e.y=u.y;}if(u.r!=null)e.r=u.r;if(u.flags!=null)e.flags=u.flags;}}for(const r of m.removes)this.known.delete(r.id);}
        else if(m.type===MSG.PLAYERS)this.players=m.players;else if(m.type===MSG.LEADERBOARD)this.lb=m.rows;else if(m.type===MSG.EVENT)this.events.push(m);else if(m.type===MSG.PONG)this.pongs.push(m);}
      else this.json.push(JSON.parse(d.toString()));this._wake();});
    ws.on('close',c=>{if(this.ws===ws){this.closeCode=c;this._wake();}});ws.on('error',()=>{});return this;}
  open(){return new Promise((res,rej)=>{this.ws.once('open',res);this.ws.once('error',rej);});}
  send(o){this.ws.send(JSON.stringify(o));}
  input(tx,ty,flags=0){this.ws.send(encodeInput({seq:this.seq++,tx,ty,flags,clientTick:0}));}
  _wake(){const w=this.waiters;this.waiters=[];for(const f of w)f();}
  async until(pred,ms=6000,label='condição'){const t0=Date.now();for(;;){const v=pred();if(v)return v;if(Date.now()-t0>ms)throw new Error(`timeout esperando ${label}`);await new Promise(r=>{this.waiters.push(r);setTimeout(r,40);});}}
  jsonOf(t,from=0){for(let i=from;i<this.json.length;i++)if(this.json[i].t===t)return this.json[i];return null;}
  // ⚠️ UM TOKEN POR CLIENTE. O nick é único POR SALA, e o nick de uma conta é o da CONTA — dois clientes
  // com o mesmo token são a mesma pessoa e o servidor recusa o segundo (que é o certo: impede o mesmo
  // jogador ter dois planetas na mesma sala). Quem quiser testar a MESMA pessoa passa `tok` na mão.
  async join(nick,room=null,view={w:1920,h:1080},tok=null){const n=this.json.length;
    if(!tok){if(!this.token)this.token=await novoToken();tok=this.token;}else this.token=tok;
    this.send({t:'join',token:tok,fallbackNick:nick,room,view});
    const r=await this.until(()=>this.jsonOf('room',n)||this.jsonOf('error',n),6000,'room');if(r.t==='error')throw new Error(`join: ${r.code} ${r.message}`);this.slot=r.slot;this.room=r;return r;}
  mine(){return[...this.known.values()].filter(e=>e.kind===KIND.PIECE&&(e.flags&PIECE_FLAG.ME));}
  ofKind(k){let n=0;for(const e of this.known.values())if(e.kind===k)n++;return n;}
  last(){return this.snaps[this.snaps.length-1];}
  close(){this.ws.close();}
}
const roomOf=code=>srv.rooms.rooms.get(code);
const humans=ps=>ps.filter(p=>!(p.flags&PLAYER_FLAG.BOT));

before(async()=>{
  srv=await startAt();base=`http://127.0.0.1:${srv.port}`;wsUrl=`ws://127.0.0.1:${srv.port}/ws/0`;
  try{const r=await fetch(base+'/api/auth/guest',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'10.9.9.9'},body:'{}'});if(r.status===201)token=(await r.json()).token;}catch{}
  if(!token){await srv.close();srv=await startServer({port:0,databaseUrl:'',logLevel:LOG});base=`http://127.0.0.1:${srv.port}`;wsUrl=`ws://127.0.0.1:${srv.port}/ws/0`;token='pt_sem_banco';unsavedMode=true;
    console.log('  (banco indisponível: suíte em modo unsaved)');}
});
after(async()=>{await srv.close();});

test('unitários: códigos de sala e token bucket',()=>{
  const c=newCode(3);assert.equal(c.length,4);assert.equal(c[0],'3');assert.equal(shardOf(c),3);assert.ok(isValidCode(c));assert.equal(normalizeCode(' 1abc '),'1ABC');assert.equal(normalizeCode('1AB'),null);assert.equal(shardOf('ZZZZ'),35);
  const b=new Bucket(10,3),t=1e6;   // relógio fixo: com performance.now() real, (t+100)−t nem sempre dá 100 exato
  let ok=0;for(let i=0;i<5;i++)if(b.take(t))ok++;assert.equal(ok,3);assert.ok(b.take(t+100));assert.ok(!b.take(t+100));
});

let A,B,roomCode;
test('join: room + PLAYERS com bots + snapshots com criações na AOI',async()=>{
  A=new Client();await A.open();const r=await A.join('Alice');roomCode=r.code;
  assert.equal(r.protocol,PROTOCOL_VERSION);assert.equal(shardOf(r.code),0);assert.match(r.sessionId,/^[0-9a-f-]{36}$/);assert.match(r.resumeToken,/^[0-9a-f]{32}$/);assert.deepEqual(r.world,{w:WORLD.w,h:WORLD.h});
  await A.until(()=>A.players,3000,'PLAYERS');
  // ⚠️ A sala não nasce cheia: abre com ROOM.BOT_SEED e vai enchendo (Room._chegadaBots). O que o env
  // manda é o ALVO, e é ele que se confere aqui — contar a população no primeiro PLAYERS mediria o
  // relógio da chegada, não a configuração.
  const bots=A.players.filter(p=>p.flags&PLAYER_FLAG.BOT);
  assert.equal(roomOf(roomCode).botCount,srv.config.roomBots,'o alvo continua vindo do env');
  assert.ok(bots.length>=ROOM.BOT_SEED&&bots.length<=srv.config.roomBots,`preenchimento entre a semente e o alvo (${bots.length})`);
  // O Livre passou a usar APELIDO de gente (realNicks), como o Battle Royale: os 60 nomes temáticos de
  // BOT_NAMES denunciavam o preenchimento pelo nome. O ◆ continua vindo no fio — o que muda é só o nome.
  assert.ok(bots.every(p=>p.name&&p.name.length<=16),'nick de preenchimento fora do formato');
  assert.equal(new Set(bots.map(p=>p.name)).size,bots.length,'dois preenchimentos com o mesmo nick');
  assert.ok(bots.some(p=>!BOT_NAMES.includes(p.name)),'os nomes continuam saindo do catálogo temático');
  const me=A.players.find(p=>p.slot===A.slot);assert.ok(me);assert.equal(me.flags&PLAYER_FLAG.BOT,0);
  await A.until(()=>A.snaps.length>=3,3000,'3 snapshots');
  const first=A.snaps[0];assert.ok(first.creates.some(c=>c.kind===KIND.PIECE&&(c.flags&PIECE_FLAG.ME)&&c.owner===A.slot),'peça própria com ME no 1º snapshot');
  assert.equal(first.updates.length,0);assert.equal(first.removes.length,0);assert.ok(first.self.mass>=800&&first.self.mass<1100,`massa inicial ${first.self.mass}`);   // 30²=900, ±: come algum grão nos primeiros ticks, ou leva uma lasca se uma rocha passar raspando (o cinturão está vivo)
  const food=A.ofKind(KIND.FOOD),known=A.known.size;
  assert.ok(food>0&&food<FOOD.COUNT,`comida conhecida ${food} (nunca as ${FOOD.COUNT})`);assert.ok(known>=5&&known<=600,`entidades conhecidas ${known}`);
  // AOI: tudo que o servidor tem dentro do retângulo interno da sessão é conhecido; nada conhecido fora do externo
  const room=roomOf(roomCode),s=room.sessions.get(A.slot),w=room.sim.world;assert.ok(s.rect);
  const pulled=f=>w.holes.some(h=>{const ri=h.r*BLACKHOLE.INFLUENCE*h.k,dx=h.x-f.x,dy=h.y-f.y;
    return dx*dx+dy*dy<ri*ri;});                                                         // sendo puxada: anda entre um snapshot e o outro
  // o retângulo de criação é o INTERNO (AOI_PAD); entre ele e s.rect (AOI_PAD_OUT) fica a faixa de histerese, que
  // por projeto ainda não foi criada — medir contra s.rect punia justamente essa faixa (~20% da área)
  const rin=viewRect(s.cx,s.cy,s.scale,s.view.w,s.view.h,NET.AOI_PAD);
  let inRect=0,missing=0;for(const f of w.food)if(rectHas(rin,f.x,f.y,-f.r*2)&&!pulled(f)){inRect++;if(!A.known.has(f.id))missing++;}
  assert.ok(inRect>0);assert.ok(missing<=2,`comida faltando na AOI interna: ${missing}/${inRect}`);
  for(const a of w.asteroids)if(rectHas(rin,a.x,a.y,-a.r))assert.ok(A.known.has(a.id),'asteroide na AOI conhecido');
  for(const h of w.holes)if(rectHas(rin,h.x,h.y,-h.r))assert.ok(A.known.has(h.id),'buraco negro na AOI conhecido');
  console.log(`  AOI: ${known} entidades conhecidas (${food} comida, ${A.ofKind(KIND.ASTEROID)} asteroides, ${A.ofKind(KIND.BLACKHOLE)} buracos); 1º snapshot ${first.bytes} bytes`);
});
test('input: mover para a direita → x da peça cresce e ackSeq acompanha',async()=>{
  const p0=A.mine()[0];assert.ok(p0);const x0=p0.x;const n=A.snaps.length;
  const iv=setInterval(()=>A.input(WORLD.w,p0.y),33);
  try{await A.until(()=>A.snaps.length>n+12,3000,'snapshots');}finally{clearInterval(iv);}
  const p1=A.mine()[0];assert.ok(p1.x>x0+100,`x ${x0.toFixed(0)} → ${p1.x.toFixed(0)}`);
  assert.equal(A.last().ackSeq,A.seq-1);
});
test('eject e split: entidade EJECT aparece; depois 2 peças próprias',async()=>{
  // o raio inicial (START_R) fica abaixo de SPLIT.MIN_R/EJECT.MIN_R (regra do agar): engorda a peça no mundo antes
  for(const pc of roomOf(roomCode).sim.world.piecesOf(A.slot))setR(pc,120);
  await A.until(()=>A.mine()[0]&&A.mine()[0].r>100,3000,'peça grande');
  const p=A.mine()[0];A.input(p.x+400,p.y,INPUT_FLAG.EJECT);
  await A.until(()=>A.ofKind(KIND.EJECT)>0,3000,'EJECT');
  A.input(p.x+400,p.y,INPUT_FLAG.SPLIT);
  await A.until(()=>A.mine().length===2,3000,'2 peças');
  assert.ok(A.events.some(e=>e.slotA===A.slot),'evento (SPLIT) do próprio slot recebido');
});
test('ping → PONG com clientTime e serverTick',async()=>{
  A.send({t:'ping',c:4242});const p=await A.until(()=>A.pongs.find(x=>x.clientTime===4242),2000,'PONG');assert.ok(p.serverTick>0);
});
test('segunda sessão na mesma sala: PLAYERS com 2 humanos nos dois lados',async()=>{
  B=new Client();await B.open();const r=await B.join('Bob',roomCode);assert.equal(r.code,roomCode);assert.notEqual(r.slot,A.slot);
  await B.until(()=>B.players&&humans(B.players).length===2,3000,'2 humanos em B');
  await A.until(()=>humans(A.players).length===2,3000,'2 humanos em A');
  assert.equal(roomOf(roomCode).humanCount,2);assert.deepEqual((await (await fetch(base+'/api/rooms')).json()).rooms[0].players,2);
  await B.until(()=>B.snaps.length>=2,3000,'snapshots de B');
});
test('rate limit: 200 inputs de uma vez → error RATE + close 4429',async()=>{
  const C=new Client();await C.open();await C.join('Spam',roomCode);
  for(let i=0;i<200;i++)C.input(3600,3600);
  await C.until(()=>C.closeCode!=null,3000,'close');
  assert.equal(C.jsonOf('error').code,'RATE');assert.equal(C.closeCode,ERROR_CODE.RATE);assert.ok(srv.metrics.rateLimitHits>0);
  await A.until(()=>humans(A.players).length===2||roomOf(roomCode).humanCount===3,100).catch(()=>{});
});
test('resume: reconecta dentro da graça → mesmo slot, snapshots voltam',async()=>{
  const {sessionId,resumeToken,slot}=B.room;B.close();await B.until(()=>B.closeCode!=null,2000,'close B');
  await sleep(150);const room=roomOf(roomCode);assert.ok(room.sessions.has(slot),'jogador continua no mundo durante a graça');assert.equal(room.sessions.get(slot).ws,null);
  const n=B.json.length;B.reconnect();await B.open();B.send({t:'resume',sessionId,resumeToken,view:{w:1280,h:720}});
  const r=await B.until(()=>B.jsonOf('room',n)||B.jsonOf('error',n),3000,'room');assert.equal(r.t,'room');assert.equal(r.slot,slot);assert.equal(r.sessionId,sessionId);B.room=r;
  await B.until(()=>B.mine().length>0,3000,'peça própria após resume');assert.equal(room.sessions.get(slot).ws.readyState,1);
  const bad=new Client();await bad.open();bad.send({t:'resume',sessionId,resumeToken:'0'.repeat(32)});await bad.until(()=>bad.closeCode!=null,3000,'close');assert.equal(bad.jsonOf('error').code,'ROOM_EXPIRED');
});
test('morte: dead + rewards; PLAYERS marca DEAD; join de novo recomeça com sessionId novo',async()=>{
  const room=roomOf(roomCode),bot=[...room.sim.players.values()].find(p=>p.isBot);const n=A.json.length;
  assert.ok(room.sim.kill(A.slot,{bySlot:bot.slot}));
  const dead=await A.until(()=>A.jsonOf('dead',n),3000,'dead');assert.equal(dead.by,bot.name);assert.equal(dead.byHole,false);assert.ok(dead.score>=0&&dead.durationS>=0&&dead.maxMass>=900);
  const rw=await A.until(()=>A.jsonOf('rewards',n),8000,'rewards');assert.equal(typeof rw.saved,'boolean');assert.ok(Array.isArray(rw.achievements));
  if(!unsavedMode)assert.equal(rw.saved,true,'com banco a partida é salva');
  await A.until(()=>A.players.find(p=>p.slot===A.slot)?.flags&PLAYER_FLAG.DEAD,3000,'flag DEAD');
  await A.until(()=>A.last().self.flags&SELF_FLAG.DEAD,3000,'self DEAD');assert.equal(A.mine().length,0);
  console.log(`  rewards: ${JSON.stringify(rw)}`);
  const old=A.room.sessionId;A.known.clear();const r=await A.join('Alice',roomCode);assert.equal(r.code,roomCode);assert.notEqual(r.sessionId,old);
  await A.until(()=>A.mine().length>0,3000,'viva de novo');
});
test('resync: sessão que esqueceu o known avisa o cliente e recria tudo',async()=>{
  const room=roomOf(roomCode),sess=[...room.sessions.values()].find(x=>x.slot===A.slot);
  assert.ok(sess,'sessão de A');
  const antes=A.known.size;assert.ok(antes>10,`cliente conhecia ${antes} entidades`);
  sess.known.clear();sess.resync=true;   // simula o socket congestionado (snapshot.js: bufferedAmount > MAX_BUFFERED)
  const n=A.snaps.length;
  const snap=await A.until(()=>A.snaps.slice(n).find(s=>s.self.flags&SELF_FLAG.RESYNC),4000,'snapshot com RESYNC');
  assert.ok(snap.creates.length>10,`recria tudo (${snap.creates.length} creates)`);
  assert.ok(snap.creates.some(c=>c.kind===KIND.PIECE&&(c.flags&PIECE_FLAG.ME)),'peça própria recriada');
  await A.until(()=>A.known.size>10,4000,'mundo reconstruído');
});

test('/healthz: tick p99, overruns, db, protocol',async()=>{
  const h=await (await fetch(base+'/healthz')).json();assert.equal(h.ok,true);assert.equal(h.shard,0);assert.ok(h.rooms>=1);assert.ok(h.players>=2);
  assert.equal(typeof h.tick.p99,'number');assert.equal(typeof h.tick.overruns,'number');assert.equal(typeof h.loopLagMs.p99,'number');assert.ok(['ok','down','none'].includes(h.db));assert.equal(h.protocol,PROTOCOL_VERSION);assert.ok(h.net.outKBps>0);
  const cfg=await (await fetch(base+'/api/config')).json();
  // `googleClientId` vazio é o interruptor do login com Google: o cliente só desenha o botão quando vem preenchido.
  assert.deepEqual(cfg,{shards:1,shard:0,roomMax:srv.config.roomMax,protocol:PROTOCOL_VERSION,googleClientId:''});
  // o bloco de métricas da fala gerada sobe junto — é por ele que dá para ver, em produção, se a LLM está
  // realmente falando ou se a sala inteira caiu no repertório fixo
  assert.equal(typeof h.llm,'object');assert.equal(typeof h.llm.ask,'number');assert.equal(typeof h.llm.fallback,'number');
  assert.equal((await (await fetch(base+'/internal/rooms')).json()).rooms[0].code,roomCode);
  assert.equal((await (await fetch(base+'/api/auto')).json()).code,roomCode);
  assert.equal((await fetch(base+'/nada')).status,404);
});
test('sem banco: join unsaved, rewards saved:false, FULL, VERSION, sala por código',async()=>{
  const s2=await startServer({port:0,databaseUrl:'',logLevel:LOG,roomMax:1,roomBots:3});const url=`ws://127.0.0.1:${s2.port}/ws/0`;
  try{
    const X=new Client(url);await X.open();const r=await X.join('Xavier','0ABC',{w:1280,h:720},'pt_qualquer');assert.equal(r.code,'0ABC');
    await X.until(()=>X.players&&X.players.length===4,3000,'3 bots + 1');
    const Y=new Client(url);await Y.open();await assert.rejects(Y.join('Yara','0ABC',{w:1280,h:720},'pt_x'),/FULL/);await Y.until(()=>Y.closeCode!=null,2000,'close');assert.equal(Y.closeCode,ERROR_CODE.FULL);
    const Z=new Client(url);await Z.open();Z.send({t:'join',token:'pt_x',fallbackNick:'Zé',protocol:99,view:{w:1,h:1}});await Z.until(()=>Z.closeCode!=null,2000,'close');assert.equal(Z.jsonOf('error').code,'VERSION');assert.equal(Z.closeCode,ERROR_CODE.VERSION);
    const Q=new Client(url);await Q.open();const rq=await Q.join('Quim','1ZZZ',{w:1280,h:720},'pt_x');assert.notEqual(rq.code,'1ZZZ','código de outro shard → sala automática');assert.notEqual(rq.code,'0ABC','0ABC está cheia');
    s2.rooms.rooms.get('0ABC').sim.kill(X.slot,{cause:'blackhole'});const d=await X.until(()=>X.jsonOf('dead'),3000,'dead');assert.equal(d.byHole,true);assert.equal(d.by,null);
    const rw=await X.until(()=>X.jsonOf('rewards'),3000,'rewards');assert.equal(rw.saved,false);
    const h=await (await fetch(`http://127.0.0.1:${s2.port}/healthz`)).json();assert.equal(h.db,'none');assert.equal(h.rooms,2);
    X.close();Q.close();
  }finally{await s2.close();}
});
test('soak 10 s: 3 clientes + bots → overruns 0, tick p99 < 3.5 ms',async()=>{
  const cs=[A,B,new Client()];await cs[2].open();await cs[2].join('Carol',roomCode);
  const room=roomOf(roomCode);assert.equal(room.sessions.size,3);
  const before=srv.metrics.snapshot(),bytes0=srv.metrics.bytesOutTotal,snaps0=cs.map(c=>c.snaps.length);const t0=Date.now();
  const iv=setInterval(()=>{for(const c of cs){const p=c.mine()[0];if(!p)continue;const r=Math.random();c.input(Math.random()*7200,Math.random()*7200,r<.02?INPUT_FLAG.SPLIT:r<.06?INPUT_FLAG.EJECT:0);}},33);
  await sleep(10000);clearInterval(iv);
  const m=srv.metrics.snapshot(),secs=(Date.now()-t0)/1000;
  const sizes=cs.flatMap((c,i)=>c.snaps.slice(snaps0[i]).map(s=>s.bytes)),avg=sizes.reduce((a,b)=>a+b,0)/sizes.length,max=Math.max(...sizes);
  console.log(`  tick p50 ${m.tick.p50} ms · p99 ${m.tick.p99} ms · max ${m.tick.max} ms · overruns ${m.tick.overruns} · lag p99 ${m.loopLagMs.p99} ms`);
  console.log(`  saída ${((srv.metrics.bytesOutTotal-bytes0)/1024/secs).toFixed(1)} KB/s p/ 3 clientes · snapshots ${sizes.length} (média ${avg.toFixed(0)} B, máx ${max} B) · ${m.net.inMsgps} msg/s · players na sala: ${room.sim.players.size}`);
  assert.equal(m.tick.overruns-before.tick.overruns,0);   // a garantia dura é esta: nenhum tick estourou os 16,7 ms
  assert.ok(m.tick.p99<3.5,`tick p99 ${m.tick.p99} ms`);   // teto medido depois de FOOD.COUNT ir a 5000 (era 2 ms com 1500): p50 ~0,7 · p99 2,5–3,3assert.ok(sizes.length>=3*20*8,'≥ 20 Hz de snapshots por cliente');
  for(const c of cs)assert.equal(c.closeCode,null,'nenhum cliente derrubado');
  cs[2].close();
});
test('rodada: fim do mundo manda roundEnd com campeão e placar, aposenta a sala e a próxima é outra',async()=>{
  const s2=await startServer({port:0,logLevel:LOG,migrateOnStart:false,roundTicks:180});   // rodada de 3 s
  try{
    const url=`ws://127.0.0.1:${s2.port}/ws/0`,C=new Client(url);await C.open();
    const r=await C.join('Efêmero',null,{w:1280,h:720});
    assert.ok(r.round&&r.round.ticks===180&&r.round.dayStart===5&&r.round.breakMs>0,'o room traz o bloco round');
    assert.equal(r.round.start,0);
    const end=await C.until(()=>C.jsonOf('roundEnd'),9000,'roundEnd');
    assert.ok(end.champion,'campeão definido');assert.ok(end.board.length>1,'placar com linhas');
    assert.equal(end.board[0].slot,end.champion.slot,'o campeão é o 1º do placar (maior massa viva)');
    assert.ok(end.board.every((b,i)=>i===0||b.mass<=end.board[i-1].mass),'placar ordenado por massa');
    assert.ok(end.board.some(b=>b.slot===C.slot),'apareço no placar');assert.ok(end.nextInMs>0);
    const room=s2.rooms.rooms.get(r.code);assert.ok(room.over&&room.roundLeft()===0,'sala aposentada');
    const C2=new Client(url);await C2.open();const r2=await C2.join('Efêmero',null,{w:1280,h:720});
    assert.notEqual(r2.code,r.code,'a próxima sala é outra');assert.ok(r2.round.start<=s2.rooms.rooms.get(r2.code).sim.tick);
    C.close();C2.close();
  }finally{await s2.close();}
});
// A ÚNICA regra de unicidade de nick que sobrou depois da migração 0009. No mundo o nick é livre — dois
// jogadores podem se chamar "Messi", com a caricatura do Messi —, mas na MESMA sala não: o kill feed, o
// chat e o placar passariam a mentir. O caminho que importa é o do CÓDIGO (é por ele que a EQUIPE entra,
// porque `Party.start` manda todos para a mesma sala); pelo automático o matchmaking desvia sozinho.
// ⚠️ Servidor PRÓPRIO: o teste mexe em `usedNicks` e no ciclo de vida de uma sala, e as salas do servidor
// compartilhado deste arquivo são as que os outros testes contam jogador por jogador.
test('nick livre no mundo, ÚNICO na sala: dois "Messi" só não jogam juntos',async t=>{
  if(unsavedMode)return t.skip('sem banco');
  const s2=await startServer({port:0,logLevel:LOG,migrateOnStart:false});
  try{
    const url=`ws://127.0.0.1:${s2.port}/ws/0`,sala=c=>s2.rooms.rooms.get(c);
    const batiza=async(tok,nick)=>{const r=await fetch(base+'/api/me',{method:'PATCH',
      headers:{'content-type':'application/json',authorization:`Bearer ${tok}`},body:JSON.stringify({nick})});
      assert.equal(r.status,200,'o banco aceita o nick repetido: ele não é mais único');};
    const t1=await novoToken(),t2=await novoToken();
    await batiza(t1,'Messi');await batiza(t2,'Messi');
    const M1=new Client(url);await M1.open();const r1=await M1.join('Messi',null,{w:1280,h:720},t1);
    assert.equal(sala(r1.code).sim.players.get(M1.slot).name,'Messi');
    // 1) pelo CÓDIGO, na sala do outro: recusa — com o nick e a sugestão, para o cliente ter o que oferecer
    const M2=new Client(url);await M2.open();
    await assert.rejects(M2.join('Messi',r1.code,{w:1280,h:720},t2),/NICK_IN_ROOM/);
    const e=M2.jsonOf('error');assert.equal(e.nick,'Messi');assert.match(e.suggestion,/_\d{4}$/);
    await M2.until(()=>M2.closeCode!=null,2000,'close');assert.equal(M2.closeCode,ERROR_CODE.NICK_IN_ROOM);
    // 2) sem código, o automático PULA a sala ocupada e ele entra como Messi em outra
    const M3=new Client(url);await M3.open();const r3=await M3.join('Messi',null,{w:1280,h:720},t2);
    assert.notEqual(r3.code,r1.code,'o matchmaking desviou da sala onde o nick está em uso');
    assert.equal(sala(r3.code).sim.players.get(M3.slot).name,'Messi');
    // 3) e quando o primeiro sai, o nome volta a ficar livre naquela sala (usedNicks é limpo no leave)
    M1.close();await sleep(100);const q=sala(r1.code);
    for(const ss of q.sessions.values())ss.disconnectedAt-=NET.RESUME_MS+1;
    q.housekeeping(Date.now());assert.equal(q.nickTaken('messi'),false);
    M3.close();
  }finally{await s2.close();}
});
test('saída: fecha os sockets, salas expiram as sessões',async()=>{
  A.close();B.close();await sleep(100);const room=roomOf(roomCode);assert.equal(room.humanCount,3,'A, B e Carol na graça');assert.ok([...room.sessions.values()].every(s=>!s.ws));
  for(const s of room.sessions.values())s.disconnectedAt-=NET.RESUME_MS+1;room.housekeeping(Date.now());assert.equal(room.humanCount,0);
  assert.equal(room.sim.humanCount(),0);assert.ok(room.sim.botCount()>=ROOM.BOT_SEED,'o preenchimento fica na sala depois que os humanos saem');
});

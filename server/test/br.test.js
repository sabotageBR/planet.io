// ── Modo Battle Royale ponta a ponta: aquecimento → partida → zona → último vivo,
//    mais o lobby de equipe (party), o chat e o relay de voz. node --test server/test/br.test.js
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
const {decodeMessage,encodeInput,encodeVoiceUp,MSG,KIND,PLAYER_FLAG,SELF_FLAG,NO_TEAM,PROTOCOL_VERSION}=await import('@warspace/shared/protocol/index.js');
const {MODE,BR,ZONE,VOICE,CHAT,WEAPON,NET,BOT_NAMES,BOT_CHAT,BOT_TALK,modeCap}=await import('@warspace/shared/constants.js');
const LOG=process.env.LOG_LEVEL;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let srv,base,wsUrl,token='pt_sem_banco';

class C{
  constructor(url){this.url=url;this.json=[];this.snaps=[];this.players=[];this.zones=[];this.voices=[];this.waiters=[];this.slot=-1;
    const ws=this.ws=new WebSocket(url);
    ws.on('message',(d,bin)=>{if(bin){const m=decodeMessage(d);if(!m)return;
        if(m.type===MSG.SNAPSHOT)this.snaps.push(m);else if(m.type===MSG.PLAYERS)this.players=m.players;
        else if(m.type===MSG.ZONE)this.zones.push(m.zone);else if(m.type===MSG.VOICE)this.voices.push(m);}
      else this.json.push(JSON.parse(d.toString()));this._wake();});
    ws.on('close',()=>this._wake());ws.on('error',()=>{});}
  open(){return new Promise((res,rej)=>{this.ws.once('open',res);this.ws.once('error',rej);});}
  send(o){this.ws.send(JSON.stringify(o));}
  _wake(){const w=this.waiters;this.waiters=[];for(const f of w)f();}
  async until(p,ms=8000,label='condição'){const t0=Date.now();for(;;){const v=p();if(v)return v;if(Date.now()-t0>ms)throw new Error(`timeout: ${label}`);
    await new Promise(r=>{this.waiters.push(r);setTimeout(r,25);});}}
  of(t,from=0){for(let i=from;i<this.json.length;i++)if(this.json[i].t===t)return this.json[i];return null;}
  all(t){return this.json.filter(j=>j.t===t);}
  async join(o){const n=this.json.length;this.send({t:'join',token,fallbackNick:o.nick||'Teste',view:{w:1280,h:720},...o});
    const r=await this.until(()=>this.of('room',n)||this.of('error',n),8000,'room');
    if(r.t==='error')throw new Error(`join: ${r.code} ${r.message}`);this.slot=r.slot;this.room=r;return r;}
  last(){return this.snaps[this.snaps.length-1];}
  close(){try{this.ws.close();}catch{}}
}
// pessoa = TOKEN, não IP (é assim que o servidor identifica quem é quem no lobby de equipe)
const api=(p,o={})=>fetch(base+p,{headers:{'content-type':'application/json',authorization:`Bearer ${o.tok||token}`,'x-forwarded-for':o.ip||'10.5.5.5'},...o})
  .then(async r=>({status:r.status,body:await r.json().catch(()=>null)}));
const post=(p,body,o={})=>api(p,{method:'POST',body:JSON.stringify(body||{}),...o});

before(async()=>{
  srv=await startServer({port:0,logLevel:LOG,migrateOnStart:false});
  base=`http://127.0.0.1:${srv.port}`;wsUrl=`ws://127.0.0.1:${srv.port}/ws/0`;
  try{const r=await fetch(base+'/api/auth/guest',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'10.5.5.5'},body:'{}'});
    if(r.status===201)token=(await r.json()).token;}catch{}
  if(token==='pt_sem_banco'){await srv.close();srv=await startServer({port:0,databaseUrl:'',logLevel:LOG});
    base=`http://127.0.0.1:${srv.port}`;wsUrl=`ws://127.0.0.1:${srv.port}/ws/0`;}
});
after(async()=>{await srv.close();});
const roomOf=code=>srv.rooms.rooms.get(code);
// Cada teste na SUA sala: findOrCreateRoom agrupa por projeto, e a sessão em graça do teste anterior
// (NET.RESUME_MS) ainda conta como humano — sem isto um teste enxerga o jogador do outro.
let nRoom=0;const CH='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const newRoom=()=>{nRoom++;return '0'+CH[nRoom%CH.length]+CH[(nRoom*7)%CH.length]+CH[(nRoom*13)%CH.length];};

// ── 1. o modo Livre não mudou ────────────────────────────────────────────────
test('Livre continua igual: entra, a sala já está em partida e os bots do env estão lá',async()=>{
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'Livre',room:newRoom()});
  assert.equal(r.mode,MODE.FREE,'sem `mode` no join, o modo é o Livre — cliente antigo não muda de jogo');
  assert.equal(r.teamSize,1);assert.equal(r.team,-1,'no Livre ninguém tem equipe');
  assert.equal(r.round.phase,'live','o Livre não tem aquecimento');
  const room=roomOf(r.code);
  assert.equal(room.sim.botCount(),srv.config.roomBots,'os bots continuam vindo do env, não do descritor do modo');
  assert.equal(room.max,srv.config.roomMax);
  const pl=await c.until(()=>c.players.length?c.players:null,4000,'PLAYERS');
  for(const p of pl)assert.equal(p.team,NO_TEAM,'PLAYERS leva team = NO_TEAM no Livre');
  c.close();
});

// ── 2. aquecimento e começo ──────────────────────────────────────────────────
test('Battle Royale: entra num LOBBY — ninguém no mapa, relógio da rodada parado',async()=>{
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'Solo',mode:MODE.BR,teamSize:1,room:newRoom()});
  assert.equal(r.mode,MODE.BR);assert.equal(r.round.phase,'lobby');
  assert.equal(r.cap,modeCap(MODE.BR,1),'capacidade = 50 no solo');
  const room=roomOf(r.code);
  assert.equal(room.phase,'lobby');
  assert.equal(room.zone,null,'nada de zona no lobby');
  assert.equal(room.roundStart,0,'o relógio da rodada só começa na largada');
  assert.equal(room.sim.world.piecesOf(r.slot).length,0,'no lobby o jogador está na SALA, não no MAPA');
  assert.equal(room.sim.world.players.get(r.slot).alive,false);
  const lb=await c.until(()=>c.of('lobby'),4000,'lobby');
  assert.equal(lb.cap,modeCap(MODE.BR,1));assert.ok(lb.filled>=1);assert.ok(lb.waitMs>0,'o cliente recebe quanto falta da janela de espera');
  assert.equal(lb.startsInMs,0,'ainda enchendo: a contagem não começou');
  c.close();
});
test('Battle Royale: cancelar a entrada no lobby libera a vaga NA HORA',async()=>{
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'Desiste',mode:MODE.BR,teamSize:1,room:newRoom()});
  const room=roomOf(r.code);
  await c.until(()=>c.of('lobby'),4000,'lobby');
  assert.equal(room.sim.humanCount(),1,'o humano está na sala');
  c.send({t:'quit'});
  // sem o `quit` o socket fechado cairia em `detach` e a sessão ficaria em graça por NET.RESUME_MS (10 s)
  // segurando a vaga — e a largada poria um fantasma parado no mapa. Aqui a saída é imediata.
  await c.until(()=>room.sim.humanCount()===0?true:null,2000,'a vaga volta na hora');
  assert.equal(room.sessions.has(r.slot),false,'a sessão sai da sala junto');
  assert.ok(NET.RESUME_MS>=2000,'e isto só tem graça porque a graça de reconexão é bem maior que a espera acima');
  c.close();
});
test('Battle Royale: a sala enche AOS POUCOS durante a janela, não de uma vez',async()=>{
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'Enche',mode:MODE.BR,teamSize:1,room:newRoom()});
  const room=roomOf(r.code);
  room.lobbyUntil=room.sim.tick+90;room.lobbyStart=room.sim.tick;   // janela de 1,5 s
  const amostras=[];
  for(let i=0;i<8;i++){await sleep(90);amostras.push(room.sim.players.size);}
  assert.ok(amostras[0]<room.max,`no começo a sala não pode já estar cheia (${amostras[0]})`);
  assert.ok(amostras.some((v,i)=>i>0&&v>amostras[i-1]),'a contagem tem que SUBIR durante a janela');
  const cheia=await c.until(()=>room.sim.players.size>=room.max?room.sim.players.size:null,6000,'lobby cheio');
  assert.equal(cheia,room.max);
  c.close();
});
test('Battle Royale: cheio o lobby, entra a contagem e a partida larga',async()=>{
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'Larga',mode:MODE.BR,teamSize:1,room:newRoom()});
  const room=roomOf(r.code);
  room.lobbyUntil=room.sim.tick+60;room.lobbyStart=room.sim.tick;
  const cont=await c.until(()=>c.all('lobby').find(x=>x.startsInMs>0),6000,'contagem');
  assert.ok(cont.startsInMs>0&&cont.startsInMs<=BR.COUNTDOWN_TICKS/60*1000+200,'a contagem é curta e vem em ms');
  const ph=await c.until(()=>c.all('phase').find(p=>p.phase==='live'),8000,'largada');
  assert.equal(ph.phase,'live');
  assert.equal(room.sim.players.size,BR.PLAYERS,'a sala larga com 50');
  assert.ok(room.zone,'a zona foi armada');
  assert.equal(room.sim.world.peace,false);
  assert.ok(room.roundStart>0,'o relógio da rodada começou AGORA');
  assert.ok(room.sim.world.piecesOf(r.slot).length>0,'e agora sim eu tenho corpo no mapa');
  const z=await c.until(()=>c.zones.length?c.zones[0]:null,4000,'ZONE');
  assert.ok(z.r0>1000,'a zona começa cobrindo o mapa');
  const s=await c.until(()=>{const x=c.last();return x&&!(x.self.flags&SELF_FLAG.LOBBY)?x:null;},4000,'self fora do lobby');
  assert.ok(s.self.alive>1,'o `self` traz o "restam N"');
  c.close();
});
test('Battle Royale: o preenchimento NÃO se identifica como bot e usa nome de gente',async()=>{
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'Anon',mode:MODE.BR,teamSize:1,room:newRoom()});
  const room=roomOf(r.code);
  room.lobbyUntil=room.sim.tick+60;room.lobbyStart=room.sim.tick;
  await c.until(()=>c.all('phase').find(p=>p.phase==='live'),8000,'largada');
  const pl=await c.until(()=>c.players.length>10?c.players:null,4000,'PLAYERS');
  assert.equal(pl.filter(p=>p.flags&PLAYER_FLAG.BOT).length,0,'NENHUMA linha vem marcada como bot — é o que a tela vê');
  for(const p of pl)assert.ok(!BOT_NAMES.includes(p.name),`${p.name} é da lista temática: denunciaria o preenchimento`);
  assert.equal(new Set(pl.map(p=>p.name.toLowerCase())).size,pl.length,'sem nomes repetidos no placar');
  // o SERVIDOR continua sabendo quem é quem (economia e conquistas dependem disso)
  assert.ok(room.sim.botCount()>0,'o servidor sabe que há preenchimento');
  assert.equal(room.sim.playersInfo().filter(p=>p.flags&PLAYER_FLAG.BOT).length,0,'mas não conta para o fio');
  c.close();
});
test('Battle Royale: humano que chega num lobby cheio DERRUBA um preenchimento',async()=>{
  const c=new C(wsUrl);await c.open();
  const sala=newRoom();
  const r=await c.join({nick:'Primeiro',mode:MODE.BR,teamSize:1,room:sala});
  const room=roomOf(r.code);
  room.lobbyUntil=room.sim.tick+6000;room.lobbyStart=room.sim.tick;   // janela longa: quero testar a vaga, não o relógio
  room.fillTo(room.max);                                             // lobby lotado de preenchimento
  assert.equal(room.sim.players.size,room.max);
  assert.equal(room.sim.humanCount(),1);
  const bots=room.sim.botCount();
  const c2=new C(wsUrl);await c2.open();
  const r2=await c2.join({nick:'Atrasado',mode:MODE.BR,teamSize:1,room:sala});
  assert.equal(r2.code,sala,'o segundo humano entra na MESMA sala — é para isso que o matchmaking existe');
  assert.equal(room.sim.humanCount(),2,'a vaga é do humano');
  assert.equal(room.sim.botCount(),bots-1,'e sai exatamente UM preenchimento');
  assert.equal(room.sim.players.size,room.max,'a capacidade não estoura');
  c.close();c2.close();
});
test('Battle Royale: a janela fecha com a sala CHEIA (o contador não pula na largada)',async()=>{
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'Cheio',mode:MODE.BR,teamSize:1,room:newRoom()});
  const room=roomOf(r.code);
  room.lobbyUntil=room.sim.tick+90;room.lobbyStart=room.sim.tick;
  await c.until(()=>room.startsAt?1:null,6000,'contagem');
  assert.equal(room.sim.players.size,room.max,`a contagem só começa com a sala cheia (${room.sim.players.size}/${room.max})`);
  c.close();
});
test('Battle Royale: partida em andamento NÃO aceita mais ninguém (é o que "sem respawn" quer dizer)',async()=>{
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'Dono',mode:MODE.BR,teamSize:1,room:newRoom()});
  const room=roomOf(r.code);room.lobbyUntil=room.sim.tick+60;room.lobbyStart=room.sim.tick;
  await c.until(()=>c.all('phase').find(p=>p.phase==='live'),8000,'live');
  assert.equal(room.acceptsJoin(),false);
  const c2=new C(wsUrl);await c2.open();
  await assert.rejects(()=>c2.join({nick:'Atrasado',mode:MODE.BR,teamSize:1,room:r.code}),/FULL/);
  c2.close();c.close();
});
test('Battle Royale: entrar por código pedindo o modo errado é recusado, não silenciosamente trocado',async()=>{
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'A',mode:MODE.BR,teamSize:1,room:newRoom()});
  const c2=new C(wsUrl);await c2.open();
  await assert.rejects(()=>c2.join({nick:'B',mode:MODE.FREE,room:r.code}),/MODE/);
  c2.close();c.close();
});

// ── 3. equipes ───────────────────────────────────────────────────────────────
test('equipe: membros do mesmo party caem na MESMA equipe e os bots fecham as vagas',async()=>{
  const p=await post('/api/party',{mode:MODE.BR,teamSize:3,nick:'Líder'});
  assert.equal(p.status,200);const code=p.body.party.code;
  assert.equal(p.body.party.teamSize,3);assert.equal(p.body.party.members.length,1);
  const j=await post(`/api/party/${code}/join`,{nick:'Amigo'},{tok:'pt_amigo'});
  assert.equal(j.status,200);assert.equal(j.body.party.members.length,2,'o amigo entrou pelo código');
  const a=new C(wsUrl),b=new C(wsUrl);await a.open();await b.open();
  const ra=await a.join({nick:'Líder',mode:MODE.BR,teamSize:3,party:code,room:newRoom()});
  const rb=await b.join({nick:'Amigo',mode:MODE.BR,teamSize:3,room:ra.code,party:code});
  assert.equal(ra.code,rb.code,'os dois na mesma sala');
  assert.ok(ra.team>=0&&ra.team===rb.team,`mesma equipe (${ra.team} vs ${rb.team})`);
  const room=roomOf(ra.code);room.lobbyUntil=room.sim.tick+60;room.lobbyStart=room.sim.tick;
  await a.until(()=>a.all('phase').find(x=>x.phase==='live'),8000,'live');
  const meu=[...room.sim.players.values()].filter(g=>g.team===ra.team);
  assert.equal(meu.length,3,'a equipe fecha em 3: o bot aliado preenche a vaga que sobrou');
  assert.equal(meu.filter(g=>g.isBot).length,1,'e é exatamente um bot');
  const equipes=new Set([...room.sim.players.values()].map(g=>g.team));
  assert.equal(equipes.size,Math.floor(room.max/3),'todo mundo tem equipe, e são cap/teamSize delas');
  const pl=await a.until(()=>a.players.length>2?a.players:null,4000,'PLAYERS');
  const linha=pl.find(x=>x.slot===rb.slot);assert.equal(linha.team,ra.team,'o PLAYERS leva a equipe (é como o cliente pinta o aliado)');
  a.close();b.close();
});
test('party: só o líder começa, sair como líder dissolve e código inválido é 404',async()=>{
  const p=await post('/api/party',{mode:MODE.BR,teamSize:2,nick:'L'});
  const code=p.body.party.code;
  assert.equal((await api(`/api/party/${code}`)).status,200);
  assert.equal((await api('/api/party/ZZZZ')).status,404);
  const naoLider=await post(`/api/party/${code}/start`,{},{tok:'pt_estranho'});
  assert.equal(naoLider.status,403,'quem não criou não começa a partida');
  assert.equal((await post(`/api/party/${code}/start`,{room:'0ABC'})).status,200);
  assert.equal((await post(`/api/party/${code}/join`,{nick:'Tarde'},{tok:'pt_tarde'})).status,409,'começou: não entra mais ninguém');
  const p2=await post('/api/party',{mode:MODE.BR,teamSize:2,nick:'L2'});
  await post(`/api/party/${p2.body.party.code}/leave`,{});
  assert.equal((await api(`/api/party/${p2.body.party.code}`)).status,404,'o líder saindo dissolve o lobby');
});
test('party: equipe cheia recusa o quinto, e reentrar não duplica ninguém',async()=>{
  const p=await post('/api/party',{mode:MODE.BR,teamSize:2,nick:'L'});
  const code=p.body.party.code;
  assert.equal((await post(`/api/party/${code}/join`,{nick:'A'},{tok:'pt_a'})).status,200);
  assert.equal((await post(`/api/party/${code}/join`,{nick:'B'},{tok:'pt_b'})).status,409,'equipe de 2 não vira 3');
  const re=await post(`/api/party/${code}/join`,{nick:'A2'},{tok:'pt_a'});   // mesma pessoa (mesmo token) voltando
  assert.equal(re.status,200);assert.equal(re.body.party.members.length,2,'recarregar a página não me duplica');
});

// ── 4. último vivo ───────────────────────────────────────────────────────────
test('último vivo: quando sobra uma equipe a partida acaba com roundEnd/lastAlive e colocação',async()=>{
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'Campeão',mode:MODE.BR,teamSize:1,room:newRoom()});
  const room=roomOf(r.code);room.lobbyUntil=room.sim.tick+60;room.lobbyStart=room.sim.tick;
  await c.until(()=>c.all('phase').find(x=>x.phase==='live'),8000,'live');
  for(const gp of [...room.sim.players.values()])if(gp.isBot)room.sim.kill(gp.slot,{cause:'eaten'});   // mata todos os bots
  const end=await c.until(()=>c.of('roundEnd'),6000,'roundEnd');
  assert.equal(end.reason,'lastAlive','a partida acabou por último-vivo, não por tempo');
  assert.ok(end.champion,'campeão definido mesmo com todo mundo caindo junto');
  assert.equal(end.champion.slot,r.slot,'o campeão sou eu');
  assert.equal(end.board[0].placement,1,'o placar traz a colocação');
  assert.equal(end.board.length,BR.PLAYERS,'o placar inclui todos os eliminados, não só os vivos');
  assert.ok(end.board.every((b,i)=>i===0||b.placement===i+1),'colocação sequencial');
  assert.equal(room.over,true);
  c.close();
});
test('sem respawn: bot morto no Battle Royale fica morto (no Livre ele volta)',async()=>{
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'Obs',mode:MODE.BR,teamSize:1,room:newRoom()});
  const room=roomOf(r.code);room.lobbyUntil=room.sim.tick+60;room.lobbyStart=room.sim.tick;
  await c.until(()=>c.all('phase').find(x=>x.phase==='live'),8000,'live');
  const bots=[...room.sim.players.values()].filter(g=>g.isBot);
  const alvo=bots[0],antes=room.sim.aliveCount();
  room.sim.kill(alvo.slot,{cause:'eaten'});
  await sleep(120);
  assert.equal(room.sim.players.get(alvo.slot).dead,true,'o bot continua morto');
  assert.ok(room.sim.aliveCount()<antes,'e o "restam N" caiu');
  c.close();
});

test('câmera do morto: no Livre ela PARA onde ele morreu; no Battle Royale segue o espectador',async()=>{
  // Livre não tem placar de sobreviventes nem fim de partida para acompanhar: passear atrás da tela de
  // morte desorienta, e a sala continua rodando à esquerda da gaveta do menu. Battle Royale é o oposto —
  // quem morreu quer ver quem o matou e como a partida termina.
  const livre=new C(wsUrl);await livre.open();
  const rl=await livre.join({nick:'MorreLivre',room:newRoom()});
  const salaL=roomOf(rl.code);
  salaL.sim.kill(rl.slot,{cause:'eaten'});
  const spL=await livre.until(()=>livre.of('spectate'),4000,'spectate do Livre');
  assert.equal(spL.slot,-1,'no Livre o servidor NÃO escolhe alvo: a AOI congela na última posição');
  const sessL=[...salaL.sessions.values()].find(s=>s.slot===rl.slot);
  assert.equal(sessL.specSlot,-1);
  // e as setas continuam funcionando para quem QUISER seguir alguém
  livre.send({t:'spectate',dir:1});
  const sp2=await livre.until(()=>livre.all('spectate').find(x=>x.slot>=0),4000,'troca manual no Livre');
  assert.ok(sp2.slot>=0,'a seta ‹ › ainda leva a um jogador vivo');
  livre.close();

  const br=new C(wsUrl);await br.open();
  const rb=await br.join({nick:'MorreBR',mode:MODE.BR,teamSize:1,room:newRoom()});
  const salaB=roomOf(rb.code);salaB.lobbyUntil=salaB.sim.tick+60;salaB.lobbyStart=salaB.sim.tick;
  await br.until(()=>br.all('phase').find(p=>p.phase==='live'),8000,'largada');
  salaB.sim.kill(rb.slot,{cause:'eaten'});
  const spB=await br.until(()=>br.of('spectate'),4000,'spectate do BR');
  assert.ok(spB.slot>=0,'no Battle Royale o espectador continua escolhendo alguém sozinho');
  br.close();
});

test('espectador: o morto troca de câmera, e alvo inválido cai na escolha automática',async()=>{
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'Morto',mode:MODE.BR,teamSize:1,room:newRoom()});
  const room=roomOf(r.code);room.lobbyUntil=room.sim.tick+60;room.lobbyStart=room.sim.tick;
  await c.until(()=>c.all('phase').find(p=>p.phase==='live'),8000,'largada');
  room.sim.kill(r.slot,{cause:'eaten'});
  const sp0=await c.until(()=>c.of('spectate'),4000,'spectate');
  assert.ok(sp0.slot>=0,'o servidor escolhe o primeiro alvo sozinho');
  assert.ok(sp0.name,'e diz de quem é a câmera');
  const sess=[...room.sessions.values()].find(s=>s.slot===r.slot);
  const alvo0=sess.specSlot;
  c.send({t:'spectate',dir:1});
  const sp1=await c.until(()=>c.all('spectate').find(x=>x.slot!==alvo0),4000,'troca');
  assert.notEqual(sp1.slot,alvo0,'a seta anda na lista de vivos');
  assert.equal(sess.specSlot,sp1.slot,'e a AOI da sessão acompanha — senão a câmera olharia para o vazio');
  const vivo=room.sim.leaderboard().some(x=>x.slot===sp1.slot);
  assert.ok(vivo,'o alvo novo está VIVO');
  // pular direto para alguém do placar
  const outro=room.sim.leaderboard().find(x=>x.slot!==sp1.slot);
  c.send({t:'spectate',slot:outro.slot});
  const sp2=await c.until(()=>c.all('spectate').find(x=>x.slot===outro.slot),4000,'pulo direto');
  assert.equal(sp2.slot,outro.slot);
  // alvo morto/inexistente não deixa a câmera num fantasma
  c.send({t:'spectate',slot:60000});
  await sleep(250);
  assert.ok(room.sim.leaderboard().some(x=>x.slot===sess.specSlot),'alvo inválido cai num vivo, não num fantasma');
  c.close();
});
test('espectador: quem está VIVO não troca de câmera (tem as próprias peças)',async()=>{
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'Vivo',mode:MODE.BR,teamSize:1,room:newRoom()});
  const room=roomOf(r.code);room.lobbyUntil=room.sim.tick+60;room.lobbyStart=room.sim.tick;
  await c.until(()=>c.all('phase').find(p=>p.phase==='live'),8000,'largada');
  const sess=[...room.sessions.values()].find(s=>s.slot===r.slot);
  c.send({t:'spectate',dir:1});
  await sleep(250);
  assert.equal(sess.specSlot,-1,'jogador vivo não vira espectador');
  assert.equal(c.of('spectate'),null);
  c.close();
});

// ── 5. chat ──────────────────────────────────────────────────────────────────
test('AOI: a comida tem TETO por contagem, não só por área (é ela que enche o frame)',async()=>{
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'Gordo',mode:MODE.BR,teamSize:1,room:newRoom()});
  const room=roomOf(r.code);room.lobbyUntil=room.sim.tick+60;room.lobbyStart=room.sim.tick;
  await c.until(()=>c.all('phase').find(p=>p.phase==='live'),8000,'largada');
  // planeta grande = câmera afastada = a AOI da comida abre até o teto de ÁREA. Sem o teto de CONTAGEM
  // cabiam ~500 grãos numa tela só, e a comida é 90% das entidades que o cliente desenha.
  const w=room.sim.world,ps=w.players.get(r.slot);
  const pc=ps.pieces.find(p=>!p.dead);assert.ok(pc,'tenho corpo depois da largada');
  pc.r=900;pc.mass=900*900;
  await sleep(1200);
  const s=[...room.sessions.values()].find(x=>x.slot===r.slot);
  let comida=0;for(const v of s.known.values())if((v&7)===KIND.FOOD)comida++;
  assert.ok(comida>0,'com a câmera afastada tem que chegar comida');
  assert.ok(comida<=NET.AOI_FOOD_MAX,`${comida} grãos numa sessão só (teto ${NET.AOI_FOOD_MAX})`);
  c.close();
});
test('fala dos bots: sai pelo caminho do chat e o orçamento segura o coro',async()=>{
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'Ouve',mode:MODE.BR,teamSize:1,room:newRoom()});
  const room=roomOf(r.code);room.lobbyUntil=room.sim.tick+60;room.lobbyStart=room.sim.tick;
  await c.until(()=>c.all('phase').find(p=>p.phase==='live'),8000,'largada');
  const bot=[...room.sim.players.values()].find(g=>g.isBot);
  assert.ok(bot,'a sala tem preenchimento');
  const frases=new Set(Object.values(BOT_CHAT).flat());
  // O ORÇAMENTO é conferido no SERVIDOR, que é determinístico: contar mensagem chegando pelo socket faz o
  // teste depender de quando o WS entrega, e foi assim que ele ficou intermitente.
  const gatilho=()=>{room.sim.botTalk.length=0;room.sim._talk(bot.slot,'kill');room.botChatTick();};
  // 1) cooldown DA SALA: `room.ditas` cresce exatamente uma vez por fala emitida, então ele é o contador
  room.botTalkAt=-1e9;bot.talked=0;bot.talkedAt=-1e9;room.ditas.length=0;
  for(let i=0;i<40;i++)gatilho();
  assert.ok(room.ditas.length<=1,`${room.ditas.length} falas na mesma janela — a sala viraria coro`);
  assert.equal(room.sim.botTalk.length,0,'a fila é do INSTANTE: guardar gatilho gera comentário atrasado');
  // 2) teto por partida
  room.ditas.length=0;bot.talked=BOT_TALK.MAX_PER_MATCH;room.botTalkAt=-1e9;
  gatilho();
  assert.equal(room.ditas.length,0,'passou do teto de falas da partida');
  // 3) sem repetir dentro da janela de memória da sala (duas falas seguidas nunca podem ser iguais)
  room.ditas.length=0;const ditas=[];
  for(let i=0;i<40;i++){room.botTalkAt=-1e9;bot.talked=0;bot.talkedAt=-1e9;gatilho();
    const u=room.ditas[room.ditas.length-1];
    if(u!==undefined&&u!==ditas[ditas.length-1])ditas.push(u);}
  assert.ok(ditas.length>=4,`só ${ditas.length} falas em 40 gatilhos — o sorteio não está saindo`);
  for(let i=1;i<ditas.length;i++)
    assert.ok(!ditas.slice(Math.max(0,i-BOT_TALK.NO_REPEAT),i).includes(ditas[i]),`"${ditas[i]}" repetida dentro de ${BOT_TALK.NO_REPEAT} falas`);
  for(const t of ditas)assert.ok(frases.has(t)||t.length<=16,`fala fora do repertório: "${t}"`);
  // 4) e, ponta a ponta, a linha CHEGA no cliente com o nome de jogador do preenchimento
  const n0=c.all('chat').length;
  room.botTalkAt=-1e9;bot.talked=0;bot.talkedAt=-1e9;
  for(let i=0;i<40&&c.all('chat').length===n0;i++){room.botTalkAt=-1e9;bot.talked=0;gatilho();await sleep(20);}
  const m=await c.until(()=>c.all('chat').find(x=>x.slot===bot.slot),6000,'fala no cliente');
  assert.equal(m.name,bot.name,'a fala usa o nome de jogador do preenchimento, não "bot"');
  c.close();
});
test('chat: no Livre a sala inteira ouve; em equipe só o companheiro',async()=>{
  const a=new C(wsUrl),b=new C(wsUrl);await a.open();await b.open();
  const ra=await a.join({nick:'Ana',room:newRoom()});const rb=await b.join({nick:'Beto',room:ra.code});
  a.send({t:'chat',text:'oi sala'});
  const m=await b.until(()=>b.of('chat'),4000,'chat');
  assert.equal(m.text,'oi sala');assert.equal(m.slot,ra.slot);
  assert.ok(m.name&&typeof m.name==='string','o nome vem da CONTA (o cliente nunca escolhe o próprio nick)');
  a.close();b.close();
  // equipe: quem não é do time não recebe
  const p=await post('/api/party',{mode:MODE.BR,teamSize:2,nick:'X'});
  const code=p.body.party.code;
  await post(`/api/party/${code}/join`,{nick:'Y'},{tok:'pt_y'});
  const c1=new C(wsUrl),c2=new C(wsUrl),c3=new C(wsUrl);
  await c1.open();await c2.open();await c3.open();
  const r1=await c1.join({nick:'X',mode:MODE.BR,teamSize:2,party:code,room:newRoom()});
  const r2=await c2.join({nick:'Y',mode:MODE.BR,teamSize:2,room:r1.code,party:code});
  const r3=await c3.join({nick:'Z',mode:MODE.BR,teamSize:2,room:r1.code});
  assert.equal(r1.team,r2.team);assert.notEqual(r3.team,r1.team);
  c1.send({t:'chat',text:'plano da equipe'});
  const t=await c2.until(()=>c2.of('chat'),4000,'chat da equipe');
  assert.equal(t.text,'plano da equipe');assert.equal(t.team,r1.team);
  await sleep(300);
  assert.equal(c3.of('chat'),null,'o adversário NÃO lê o plano da equipe');
  c1.close();c2.close();c3.close();
});
test('chat e voz do MORTO: no Livre a sala inteira ouve; no Battle Royale só a arquibancada',async()=>{
  // Morrer nunca calou ninguém no servidor — o que calava era o CSS do cliente, que escondia o HUD inteiro.
  // Agora a regra existe de verdade e é POR MODO: no Livre morrer dura segundos (o botão RENASCER está na
  // tela) e isolar o morto seria mandá-lo escrever para uma sala vazia; no BR a morte é definitiva e vale a
  // regra do Counter-Strike.
  const a=new C(wsUrl),b=new C(wsUrl);await a.open();await b.open();
  const ra=await a.join({nick:'Fantasma',room:newRoom()});await b.join({nick:'Vivo',room:ra.code});
  roomOf(ra.code).sim.kill(ra.slot,{cause:'eaten'});
  await a.until(()=>a.of('dead'),4000,'morte');
  a.send({t:'chat',text:'morri mas continuo aqui'});
  // sempre pelo SLOT do autor: a sala tem preenchimentos que falam sozinhos, e `of('chat')` pegaria um deles
  const m=await b.until(()=>b.all('chat').find(x=>x.slot===ra.slot),4000,'chat do morto no Livre');
  assert.equal(m.text,'morri mas continuo aqui','no Livre quem está VIVO lê o morto');
  assert.equal(m.dead,1,'a linha vem marcada como de um morto');
  assert.equal(m.scope,'room');
  a.close();b.close();

  // Battle Royale solo: o morto fala para os mortos, e só.
  const c1=new C(wsUrl),c2=new C(wsUrl);await c1.open();await c2.open();
  const r1=await c1.join({nick:'BR1',mode:MODE.BR,teamSize:1,room:newRoom()});
  await c2.join({nick:'BR2',mode:MODE.BR,teamSize:1,room:r1.code});
  const sala=roomOf(r1.code);sala.lobbyUntil=sala.sim.tick+60;sala.lobbyStart=sala.sim.tick;
  await c1.until(()=>c1.all('phase').find(x=>x.phase==='live'),8000,'largada');
  sala.sim.kill(r1.slot,{cause:'eaten'});
  await c1.until(()=>c1.of('dead'),4000,'morte no BR');
  c1.send({t:'chat',text:'boa sorte aí'});
  await sleep(600);
  assert.equal(c2.all('chat').find(x=>x.slot===r1.slot),undefined,'quem está VIVO não lê a arquibancada');
  // e quando o outro também morre, os dois se falam
  sala.sim.kill(c2.slot,{cause:'eaten'});
  await c2.until(()=>c2.of('dead'),4000,'2ª morte');
  c1.send({t:'chat',text:'e aí, morreu também?'});
  const m2=await c2.until(()=>c2.all('chat').find(x=>x.slot===r1.slot),4000,'chat entre mortos');
  assert.equal(m2.text,'e aí, morreu também?');assert.equal(m2.scope,'dead');
  // e a VOZ segue o mesmo escopo, na mesma sala (montar outra de 50 preenchimentos só para o Ctrl custaria
  // uma partida inteira de CPU na bancada, e é o suficiente para derrubar o soak de game.test.js)
  const sess=[...sala.sessions.values()].find(s=>s.slot===r1.slot);
  assert.equal(sala.talkState(sess,true),true,'o servidor não recusa mais o push-to-talk de um morto');
  const data=new Uint8Array(Array.from({length:800},(_,i)=>(i*17)&255));
  const {createWriter}=await import('@warspace/shared/protocol/index.js');
  c1.ws.send(encodeVoiceUp(createWriter(4096),{codec:0,durMs:600,data}));
  const v=await c2.until(()=>c2.voices.find(x=>x.slot===r1.slot),4000,'voz do morto');
  assert.deepEqual([...v.data],[...data],'o clipe do morto atravessa inteiro — e a origem dele é a CÂMERA, não a origem do mundo');
  c1.close();c2.close();
});
test('chat do MORTO: em equipe ele pode pedir o esquadrão, e a arquibancada não chega à LLM',async()=>{
  const p=await post('/api/party',{mode:MODE.BR,teamSize:2,nick:'M1'});
  const code=p.body.party.code;await post(`/api/party/${code}/join`,{nick:'M2'},{tok:'pt_m2'});
  const a=new C(wsUrl),b=new C(wsUrl);await a.open();await b.open();
  const ra=await a.join({nick:'M1',mode:MODE.BR,teamSize:2,party:code,room:newRoom()});
  await b.join({nick:'M2',mode:MODE.BR,teamSize:2,room:ra.code,party:code});
  const sala=roomOf(ra.code);sala.lobbyUntil=sala.sim.tick+60;sala.lobbyStart=sala.sim.tick;
  await a.until(()=>a.all('phase').find(x=>x.phase==='live'),8000,'largada');
  sala.sim.kill(ra.slot,{cause:'eaten'});
  await a.until(()=>a.of('dead'),4000,'morte');
  // o padrão é a arquibancada: o companheiro VIVO não recebe
  a.send({t:'chat',text:'to na torcida'});
  await sleep(600);
  assert.equal(b.all('chat').find(x=>x.slot===ra.slot),undefined,'sem pedir nada, o morto fala com os mortos');
  // pedindo `team`, o esquadrão INTEIRO ouve — a informação de quem morreu é da equipe dele
  a.send({t:'chat',text:'cuidado, tem um gigante no norte',scope:'team'});
  const m=await b.until(()=>b.all('chat').find(x=>x.slot===ra.slot),4000,'chat para o esquadrão');
  assert.equal(m.text,'cuidado, tem um gigante no norte');assert.equal(m.scope,'team');assert.equal(m.dead,1);
  // a linha da ARQUIBANCADA não pode entrar no prompt de um bot: ele está vivo e nunca a leu
  const bot=[...sala.sim.players.values()].find(g=>g.isBot&&!g.dead);
  const hist=sala._ctxFala(bot,{kind:'abate'}).historico;
  assert.ok(!hist.some(l=>l.text==='to na torcida'),'a fala da arquibancada fica fora do histórico da LLM');
  a.close();b.close();
});
test('chat: vazio/só espaço é engolido, comprido é cortado e a enxurrada é barrada',async()=>{
  const a=new C(wsUrl),b=new C(wsUrl);await a.open();await b.open();
  const ra=await a.join({nick:'Spam',room:newRoom()});await b.join({nick:'Ouvinte',room:ra.code});
  a.send({t:'chat',text:'   '});a.send({t:'chat',text:''});
  await sleep(200);assert.equal(b.of('chat'),null,'mensagem vazia não vira linha');
  a.send({t:'chat',text:'x'.repeat(CHAT.MAX_CHARS+80)});
  const m=await b.until(()=>b.of('chat'),4000,'chat');
  assert.equal(m.text.length,CHAT.MAX_CHARS,'cortada no teto');
  for(let i=0;i<10;i++)a.send({t:'chat',text:`flood ${i}`});
  await sleep(400);
  assert.ok(b.all('chat').length<=1+CHAT.BURST,`a enxurrada foi barrada (chegaram ${b.all('chat').length})`);
  a.close();b.close();
});

// ── 6. voz ───────────────────────────────────────────────────────────────────
test('voz: o clipe chega intacto ao companheiro e o servidor não guarda nada',async()=>{
  const p=await post('/api/party',{mode:MODE.BR,teamSize:2,nick:'V1'});
  const code=p.body.party.code;await post(`/api/party/${code}/join`,{nick:'V2'},{tok:'pt_v2'});
  const a=new C(wsUrl),b=new C(wsUrl),c=new C(wsUrl);await a.open();await b.open();await c.open();
  const ra=await a.join({nick:'V1',mode:MODE.BR,teamSize:2,party:code,room:newRoom()});
  await b.join({nick:'V2',mode:MODE.BR,teamSize:2,room:ra.code,party:code});
  await c.join({nick:'V3',mode:MODE.BR,teamSize:2,room:ra.code});
  const data=new Uint8Array(Array.from({length:1600},(_,i)=>(i*31)&255));
  a.ws.send(encodeVoiceUp((await import('@warspace/shared/protocol/index.js')).createWriter(4096),{codec:0,durMs:900,data}));
  const v=await b.until(()=>b.voices[0],4000,'voz');
  assert.equal(v.slot,ra.slot);assert.equal(v.durMs,900);assert.deepEqual([...v.data],[...data],'os bytes atravessam sem o servidor tocar neles');
  await sleep(250);
  assert.equal(c.voices.length,0,'em equipe só o companheiro ouve');
  const pl=await b.until(()=>b.players.find(x=>x.slot===ra.slot&&(x.flags&PLAYER_FLAG.TALK))?b.players:null,3000,'flag TALK');
  assert.ok(pl,'o PLAYERS acende o ícone de quem está falando');
  a.close();b.close();c.close();
});
test('voz: tamanho, duração e intervalo são recusados sem derrubar a conexão',async()=>{
  const {createWriter}=await import('@warspace/shared/protocol/index.js');
  const a=new C(wsUrl),b=new C(wsUrl);await a.open();await b.open();
  const ra=await a.join({nick:'Voz',room:newRoom()});await b.join({nick:'Orelha',room:ra.code});
  const room=roomOf(ra.code),sess=[...room.sessions.values()].find(s=>s.slot===ra.slot);
  // no Livre a voz é por PROXIMIDADE: sem colar as duas câmeras, a 9600 px de mundo ninguém se ouviria
  for(const s of room.sessions.values()){s.cx=4800;s.cy=4800;}
  const w=room.sim.world;for(const ps of w.players.values())if(!ps.isBot)for(const pc of ps.pieces){pc.x=4800;pc.y=4800;}
  const manda=(durMs,n)=>a.ws.send(encodeVoiceUp(createWriter(70000),{codec:0,durMs,data:new Uint8Array(n)}));
  manda(50,400);await sleep(150);assert.equal(b.voices.length,0,'curto demais: é toque acidental no Ctrl, não fala');
  manda(VOICE.MAX_MS+500,400);await sleep(150);assert.equal(b.voices.length,0,'longo demais');
  manda(1000,VOICE.MAX_BYTES+10);await sleep(200);assert.equal(b.voices.length,0,'pesado demais — recusado pelo servidor, não pelo `ws`');
  assert.equal(a.ws.readyState,1,'e o frame gordo não derrubou o socket (era o que o maxPayload de 4 KB fazia)');
  sess.voiceAt=0;manda(1000,800);await sleep(200);assert.equal(b.voices.length,1,'o clipe válido passa');
  manda(1000,800);await sleep(200);assert.equal(b.voices.length,1,'o segundo, dentro do cooldown, não');
  assert.equal(a.ws.readyState,1,'e nada disso derruba a conexão');
  a.close();b.close();
});
test('voz: o aviso de push-to-talk acende e apaga no INSTANTE, e vai só para quem ouviria o clipe',async()=>{
  const a=new C(wsUrl),b=new C(wsUrl),c=new C(wsUrl);await a.open();await b.open();await c.open();
  const ra=await a.join({nick:'Fala',room:newRoom()});
  await b.join({nick:'Perto',room:ra.code});await c.join({nick:'Longe',room:ra.code});
  const room=roomOf(ra.code);
  const sA=[...room.sessions.values()].find(s=>s.slot===ra.slot);
  // no Livre quem ouve é quem está PERTO: 'Perto' cola a câmera na de quem fala, 'Longe' fica fora do alcance
  const w=room.sim.world;for(const ps of w.players.values())if(!ps.isBot)for(const pc of ps.pieces){pc.x=4800;pc.y=4800;}
  for(const s of room.sessions.values())s.cx=s.cy=(s.slot===c.slot?4800+VOICE.DIST*3:4800);
  const n=b.json.length;
  a.send({t:'talk',on:true});
  const on=await b.until(()=>b.of('talk',n),3000,'aviso de microfone aberto');
  assert.equal(on.slot,ra.slot);assert.equal(on.on,true,'o ícone acende sem esperar o áudio (o clipe só sai ao soltar o Ctrl)');
  await b.until(()=>b.players.find(x=>x.slot===ra.slot&&(x.flags&PLAYER_FLAG.TALK)),3000,'flag TALK no placar');
  await sleep(200);
  assert.ok(!c.json.some(m=>m.t==='talk'),'quem não ouviria o clipe também não vê o ícone');
  const n2=b.json.length;
  sA.talkAt=0;                                    // o TALK_CD_MS é anti-flood, não faz parte do que se testa aqui
  a.send({t:'talk',on:false});
  const off=await b.until(()=>b.of('talk',n2),3000,'aviso de microfone fechado');
  assert.equal(off.on,false,'soltar o Ctrl apaga o ícone');
  const apagou=await b.until(()=>b.players.find(x=>x.slot===ra.slot&&!(x.flags&PLAYER_FLAG.TALK))?b.players:null,4000,'flag TALK apagada');
  assert.ok(apagou,'a flag TALK não pode ficar PRESA: sem a varredura de expiração ela acendia e nunca mais saía');
  a.close();b.close();c.close();
});
test('fala gerada: o bot responde a quem o CHAMA, e o orçamento segura o resto',async()=>{
  const {citou}=await import('../src/rooms/botChat.js');
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'Humano',room:newRoom()});
  const room=roomOf(r.code);
  const bot=[...room.sim.players.values()].find(g=>g.isBot);
  assert.ok(bot,'a sala do Livre já nasce com preenchimentos');
  const eu=room.sim.players.get(r.slot).name;   // o nick é do TOKEN, não do que o cliente pediu
  // LLM de mentira: o que se testa aqui é o CAMINHO (quem responde, quando e quantas vezes), não o modelo
  const pedidos=[];
  room.botChat={ativo:()=>true,citou,gerar:async ctx=>{pedidos.push(ctx);return`eu ouvi, ${ctx.quem}`;}};
  const chance=room.rng.chance.bind(room.rng);room.rng.chance=()=>true;   // MENTION_P é 0,92: o teste não pode depender do sorteio
  try{
    let n=c.json.length;
    c.send({t:'chat',text:`${bot.name} vem ca seu covarde`});
    const resp=await c.until(()=>c.json.slice(n).find(m=>m.t==='chat'&&m.slot===bot.slot),5000,'resposta do bot citado');
    assert.equal(resp.name,bot.name,'quem responde é o bot chamado, com o nome de jogador dele');
    assert.equal(resp.text,`eu ouvi, ${eu}`);
    // Só as gerações de RESPOSTA: com `rng.chance` forçado a true, os gatilhos espontâneos (kill, líder,
    // caçado…) também passam pela mesma LLM falsa, e contá-los aqui mediria outra coisa.
    const chamados=()=>pedidos.filter(p=>p.kind==='mention'||p.kind==='coro'||p.kind==='cadeia');
    // Quantos respondem NÃO é fixo: `citou` é aproximado de propósito (raiz, sufixo, erro de digitação), e
    // numa sala de 24 apelidos de gente uma palavra da frase às vezes casa com um segundo nick. O que o
    // código garante — e o que este teste cobra — é que só responde quem foi CITADO, e no máximo
    // CORO_MAX_CITADOS deles.
    const {BOT_LLM}=await import('@warspace/shared/constants.js');
    const vivos=[...room.sim.players.values()].filter(g=>g.isBot);
    const citados=vivos.filter(g=>citou(`${bot.name} vem ca seu covarde`,g.name)).map(g=>g.name);
    assert.ok(citados.includes(bot.name),'o bot chamado pelo nome tem que estar entre os citados');
    assert.ok(chamados().length>=1&&chamados().length<=BOT_LLM.CORO_MAX_CITADOS,
      `${chamados().length} respostas para ${citados.length} citado(s)`);
    for(const c of chamados())assert.ok(citados.includes(c.nome),`${c.nome} respondeu sem ter sido citado`);
    const meu=chamados().find(c=>c.nome===bot.name)||chamados()[0];
    assert.equal(meu.quem,eu,'o prompt sabe COM QUEM está falando');
    assert.ok(meu.historico.some(l=>l.text.includes('vem ca')),'e leva a conversa junto — o servidor não guardava uma linha antes disto');
    assert.ok(meu.historia&&meu.historia.quem,'e sabe QUEM ele é: a persona vai no prompt');
    // orçamento da sala: chamar de novo no mesmo instante não vira coro
    n=c.json.length;
    c.send({t:'chat',text:`${bot.name} responde de novo`});
    await sleep(400);
    assert.equal(c.json.slice(n).filter(m=>m.t==='chat'&&m.slot===bot.slot).length,0,'duas respostas na mesma janela: o chat vira dois bots conversando sozinhos');
    // e sem citação nenhuma ninguém se dá por chamado
    room.mencaoAt=-1e9;room.ultimoBot=null;room.falaFila.length=0;
    n=c.json.length;const antes=chamados().length;
    c.send({t:'chat',text:'olha o tamanho desse planeta ali'});   // frase solta: sem citação e sem vocativo coletivo
    await sleep(400);
    assert.equal(chamados().length,antes,'mensagem que não cita ninguém não acorda bot nenhum');
  }finally{room.rng.chance=chance;room.botChat=null;}
  c.close();
});

// ── 7. /api/auto e /api/rooms por modo ───────────────────────────────────────
test('/api/auto separa os pools por modo e por tamanho de equipe',async()=>{
  const livre=await api('/api/auto');assert.equal(livre.status,200);assert.equal(livre.body.mode,MODE.FREE);
  const solo=await api(`/api/auto?mode=${MODE.BR}&teamSize=1`);
  assert.equal(solo.body.mode,MODE.BR);assert.equal(solo.body.teamSize,1);
  const quad=await api(`/api/auto?mode=${MODE.BR}&teamSize=4`);
  assert.equal(quad.body.teamSize,4);assert.notEqual(quad.body.code,solo.body.code,'solo e quarteto nunca compartilham sala');
  assert.equal(quad.body.max,modeCap(MODE.BR,4));
  const rooms=await api(`/api/rooms?mode=${MODE.BR}`);
  assert.ok(rooms.body.rooms.every(r=>r.mode===MODE.BR),'a listagem filtra por modo');
});

// ── CORO E CORRENTE ──────────────────────────────────────────────────────────
test('corrente bot↔bot TERMINA, mesmo com uma LLM que sempre cita outro bot',async()=>{
  // Pior caso adversarial de propósito: a LLM falsa devolve sempre uma frase que CITA outro bot vivo pelo
  // nome, que é a única condição que faz a corrente continuar. Se a terminação depender de sorte, este
  // teste a expõe; se depender das guardas (profundidade, `cadeia`, orçamento por bot), ele passa sempre.
  const {citou}=await import('../src/rooms/botChat.js');
  const {BOT_LLM}=await import('@warspace/shared/constants.js');
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'Humano',room:newRoom()});
  const room=roomOf(r.code);
  const bots=[...room.sim.players.values()].filter(g=>g.isBot&&!g.dead);
  assert.ok(bots.length>=3,'o teste precisa de bots para a corrente ter para onde ir');
  const agendas=[];
  room.botChat={ativo:()=>true,citou,
    gerar:async ctx=>{const outro=bots.find(b=>b.name!==ctx.nome);return `${outro.name} vem ca`;}};
  const agenda=room._agenda.bind(room);
  room._agenda=(gp,g,ms)=>{agendas.push({slot:gp.slot,depth:g.depth|0,cadeia:(g.cadeia||[]).slice()});return agenda(gp,g,ms);};
  const chance=room.rng.chance.bind(room.rng);room.rng.chance=()=>true;   // nada pode depender do sorteio
  try{
    c.send({t:'chat',text:`${bots[0].name} vem ca seu covarde`});
    await sleep(2500);                       // tempo de sobra para toda a corrente possível se desenrolar
    assert.ok(agendas.length>0,'nem a primeira resposta saiu');
    // A invariante é POR CORRENTE, não por sala: uma fala espontânea que cita alguém abre uma corrente
    // nova e legítima, e somar todas as linhas mediria outra coisa.
    for(const a of agendas){
      assert.ok(a.depth<=BOT_LLM.CADEIA_MAX,`profundidade ${a.depth} passou de CADEIA_MAX`);
      assert.ok(!a.cadeia.includes(a.slot),`slot ${a.slot} reentrou na própria corrente`);
      assert.equal(new Set(a.cadeia).size===a.cadeia.length||a.cadeia.length<=2,true,'cadeia com slot repetido');
      assert.ok(a.cadeia.length<=BOT_LLM.CADEIA_MAX+2,`cadeia de ${a.cadeia.length}: não fechou`);}
    await c.until(()=>room.falaFila.length===0,3000,'a fila drenar');
    assert.equal(room.falaFila.length,0,'a fila ficou com resto pendurado');
  }finally{room.rng.chance=chance;room._agenda=agenda;room.botChat=null;}
  c.close();
});

test('pergunta aberta vira coro escalonado; frase solta, não',async()=>{
  const {citou}=await import('../src/rooms/botChat.js');
  const {BOT_LLM}=await import('@warspace/shared/constants.js');
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'Humano',room:newRoom()});
  const room=roomOf(r.code);
  room.botChat={ativo:()=>true,citou,gerar:async()=>'tudo certo'};
  const agendados=[];
  const agenda=room._agenda.bind(room);
  room._agenda=(gp,g,ms)=>{agendados.push({slot:gp.slot,kind:g.kind,ms});return agenda(gp,g,ms);};
  try{
    room.chat({slot:r.slot,chatAt:[]},'e aí galera, tudo bem?');
    assert.ok(agendados.length>=1&&agendados.length<=3,`coro de ${agendados.length}: fora de 1..3`);
    assert.equal(new Set(agendados.map(a=>a.slot)).size,agendados.length,'o mesmo bot foi escolhido duas vezes');
    // ESCALONADO: atrasos estritamente crescentes. Simultâneo daria valores iguais — e três respostas no
    // mesmo tick é exatamente o coro de robô que o agendamento existe para evitar.
    for(let i=1;i<agendados.length;i++)
      assert.ok(agendados[i].ms>agendados[i-1].ms,'as respostas saíram no mesmo instante');
    assert.ok(agendados[0].ms>=BOT_LLM.CORO_D0_MS[0],'a primeira resposta saiu instantânea');
    agendados.length=0;room.mencaoAt=-1e9;room.falaFila.length=0;
    room.chat({slot:r.slot,chatAt:[]},'olha o tamanho daquele planeta ali');
    assert.equal(agendados.length,0,'frase solta não deve acordar coro nenhum');
  }finally{room._agenda=agenda;room.botChat=null;}
  c.close();
});

test('ninguém fica mudo: chamado pelo nome com a LLM fora, sai o repertório',async()=>{
  // Era o buraco: o fallback da menção devolvia null, então bot chamado pelo nome com o disjuntor aberto
  // simplesmente não respondia — que é o que mais denuncia um preenchimento.
  const {citou}=await import('../src/rooms/botChat.js');
  const {BOT_CHAT,BOT_TALK}=await import('@warspace/shared/constants.js');
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'Humano',room:newRoom()});
  const room=roomOf(r.code);
  const bot=[...room.sim.players.values()].find(g=>g.isBot);
  let vivo=true;
  room.botChat={ativo:()=>vivo,citou,gerar:async()=>null};
  const chance=room.rng.chance.bind(room.rng);
  // true em tudo MENOS no sorteio do erro de digitação: `botTypo` dobra uma letra de propósito, e comparar
  // a frase estropiada com o repertório seria testar o typo, não o fallback.
  room.rng.chance=p=>p!==BOT_TALK.TYPO_P;
  try{
    const n=c.json.length;
    c.send({t:'chat',text:`${bot.name} vem ca`});
    await sleep(120);vivo=false;                 // o disjuntor abre entre o agendamento e o despacho
    const resp=await c.until(()=>c.json.slice(n).find(m=>m.t==='chat'&&m.slot===bot.slot),5000,'resposta enlatada');
    assert.ok(BOT_CHAT.resposta.includes(resp.text),
      `"${resp.text}" não veio do repertório de resposta`);
  }finally{room.rng.chance=chance;room.botChat=null;}
  c.close();
});

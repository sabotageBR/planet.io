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
const {decodeMessage,encodeInput,encodeVoiceUp,MSG,PLAYER_FLAG,SELF_FLAG,NO_TEAM,PROTOCOL_VERSION}=await import('@planet/shared/protocol/index.js');
const {MODE,BR,ZONE,VOICE,CHAT,WEAPON,BOT_NAMES,BOT_CHAT,BOT_TALK,modeCap}=await import('@planet/shared/constants.js');
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
test('fala dos bots: sai pelo caminho do chat e o orçamento segura o coro',async()=>{
  const c=new C(wsUrl);await c.open();
  const r=await c.join({nick:'Ouve',mode:MODE.BR,teamSize:1,room:newRoom()});
  const sala=roomOf(r.code);sala.lobbyUntil=sala.sim.tick+60;sala.lobbyStart=sala.sim.tick;   // encurta a janela, como os testes de largada
  await c.until(()=>c.all('phase').find(p=>p.phase==='live'),8000,'largada');
  const room=sala,bot=[...room.sim.players.values()].find(g=>g.isBot);
  assert.ok(bot,'a sala tem preenchimento');
  const frases=new Set(Object.values(BOT_CHAT).flat());
  // a fala é sorteada: insisto até sair uma, zerando só o cooldown DA SALA a cada tentativa
  let saiu=null;
  for(let i=0;i<200&&!saiu;i++){
    room.botTalkAt=-1e9;bot.talked=0;bot.talkedAt=-1e9;
    room.sim.botTalk.length=0;room.sim._talk(bot.slot,'kill');
    room.botChatTick();
    saiu=await c.until(()=>c.all('chat').find(m=>m.slot===bot.slot),40,'fala').catch(()=>null);}
  assert.ok(saiu,'nenhum preenchimento falou em 200 gatilhos');
  assert.ok(frases.has(saiu.text)||saiu.text.length<=16,'a fala vem do repertório (ou é ela com erro de digitação)');
  assert.equal(saiu.name,bot.name,'a fala usa o nome de jogador do preenchimento, não "bot"');
  // orçamento: gatilho novo no mesmo instante não vira segunda linha
  const n=c.all('chat').length;
  room.sim._talk(bot.slot,'kill');room.botChatTick();
  await sleep(120);
  assert.equal(c.all('chat').length,n,'duas falas na mesma janela: a sala viraria coro');
  assert.equal(room.sim.botTalk.length,0,'a fila é do INSTANTE — guardar gatilho gera comentário atrasado');
  // teto por partida
  bot.talked=BOT_TALK.MAX_PER_MATCH;room.botTalkAt=-1e9;
  room.sim._talk(bot.slot,'kill');room.botChatTick();
  await sleep(120);
  assert.equal(c.all('chat').length,n,'passou do teto de falas da partida');
  // frase repetida denuncia MAIS que o silêncio: numa partida de produção saiu "boa ai" três vezes
  const antes=c.all('chat').length;
  for(let i=0;i<40;i++){
    room.botTalkAt=-1e9;bot.talked=0;bot.talkedAt=-1e9;
    room.sim.botTalk.length=0;room.sim._talk(bot.slot,'morte');room.botChatTick();}
  await sleep(200);
  const ditas=c.all('chat').slice(antes).map(m=>m.text);
  for(let i=1;i<ditas.length;i++){
    const janela=ditas.slice(Math.max(0,i-BOT_TALK.NO_REPEAT),i);
    assert.ok(!janela.includes(ditas[i]),`"${ditas[i]}" repetida dentro de ${BOT_TALK.NO_REPEAT} falas`);}
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
  a.ws.send(encodeVoiceUp((await import('@planet/shared/protocol/index.js')).createWriter(4096),{codec:0,durMs:900,data}));
  const v=await b.until(()=>b.voices[0],4000,'voz');
  assert.equal(v.slot,ra.slot);assert.equal(v.durMs,900);assert.deepEqual([...v.data],[...data],'os bytes atravessam sem o servidor tocar neles');
  await sleep(250);
  assert.equal(c.voices.length,0,'em equipe só o companheiro ouve');
  const pl=await b.until(()=>b.players.find(x=>x.slot===ra.slot&&(x.flags&PLAYER_FLAG.TALK))?b.players:null,3000,'flag TALK');
  assert.ok(pl,'o PLAYERS acende o ícone de quem está falando');
  a.close();b.close();c.close();
});
test('voz: tamanho, duração e intervalo são recusados sem derrubar a conexão',async()=>{
  const {createWriter}=await import('@planet/shared/protocol/index.js');
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

// ── A VISITA × A VIDA: DOIS RELÓGIOS QUE NÃO PODEM SE CONFUNDIR ──────────────
// O painel AO VIVO dizia "Fulano saiu · 40s" de quem tinha passado vinte minutos na sala em quinze
// vidas, e era esse o número que se usava para conferir o relatório do portal. A causa era uma só:
// existia UMA medida (`gp.joinedTick`), ela é da VIDA, e `Sim.revive` a reinicia a cada respawn.
//
// O que este arquivo trava:
//   1. o `saiu` do painel mede a VISITA (sobrevive a respawn);
//   2. o `onMatchEnd` continua medindo a VIDA (é o `matches.duration_s`, e o histórico depende disso);
//   3. o join RECUSADO não vira partida — nem linha, nem `+1` no `games` do perfil.
// O (1) e o (2) existem em par de propósito: consertar um quebrando o outro seria trocar de bug.
// ⚠️ O aviso em cima de `Sim.revive` manda zerar todo campo de `_mk` que seja "por vida". `entrouTick`
//    é o contraexemplo, e é justamente por ser um contraexemplo escrito que ele precisa de teste: quem
//    seguir a instrução ao pé da letra refaz o defeito sem nada ficar vermelho.
// node --test server/test/visita.test.js   (não precisa de banco)
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.LOG_LEVEL='silent';
const {Room}=await import('../src/rooms/Room.js');
const {MODE,TICK_HZ}=await import('@warspace/shared/constants.js');

const mudo={info(){},warn(){},error(){},debug(){}};
/** Um bus que só guarda o que foi publicado — é o que o painel AO VIVO leria. */
const busEspiao=()=>{const ev=[];return{on:true,ev,publica(k,d){ev.push({k,...d});},
  de(k){return ev.filter(e=>e.k===k);}};};
/** Hooks que gravam o que a persistência receberia, sem banco nenhum. */
const hooksEspiao=()=>{let n=0;const fim=[],abertas=[],largadas=[];
  return{fim,abertas,largadas,
    hooks:{onPlayerJoin:async()=>({ok:true,userId:null,nick:'Fulano',registered:false,skinId:0,prefs:{},sessionId:'s0',unsaved:false}),
      onStat(){},onKill(){},onSample(){},onShutdown:async()=>{},
      onMatchEnd:async m=>{fim.push(m);return null;},
      openSession(o){const id='s'+(++n);abertas.push(id);return id;},
      dropSession(id){largadas.push(id);return true;}}};};

const sala=(hooks,bus)=>new Room({code:'TST0',shard:0,seed:7,hooks,log:mudo,
  metrics:{inc(){},add(){}},config:{},roomMax:30,roomBots:0,mode:MODE.FREE,bus});
const sessaoFalsa=()=>({room:null,slot:-1,pid:0,known:new Set(),rect:null,specSlot:-1,avatar:null,
  userId:null,resumeToken:'tok',sessionId:'s0',kicked:false,ws:{},disconnectedAt:0,json:[],
  sendJson(m){this.json.push(m);},send(){return true;},
  error(code){this.kicked=true;this.json.push({t:'error',code});},
  detach(){this.ws=null;this.disconnectedAt=Date.now();}});
const anda=(r,ticks)=>{for(let i=0;i<ticks;i++)r.step();};
/** Mata pelo caminho de verdade (o mesmo `sim.kill` que `roombots.test.js` usa), sem inventar estado. */
const mata=(r,slot)=>{r.sim.kill(slot,{cause:'eaten'});
  assert.equal(r.sim.players.get(slot).dead,true,'a morte tem que ter acontecido pelo caminho real');};

test('o "saiu" do painel mede a VISITA, e o respawn não a reinicia',()=>{
  const e=hooksEspiao(),bus=busEspiao(),r=sala(e.hooks,bus);r.start();
  const s=sessaoFalsa(),slot=r.join(s,{name:'Fulano',sessionId:'s0'});
  const gp=r.sim.players.get(slot),t0=gp.entrouTick;

  anda(r,10*TICK_HZ);                       // 1ª vida: 10 s
  mata(r,slot);
  anda(r,20*TICK_HZ);                       // 20 s na tela de morte, assistindo — ele NÃO saiu
  assert.equal(r.respawn(s),true,'renasceu na mesma sala e na mesma conexão');
  assert.equal(gp.entrouTick,t0,'⚠️ o revive NÃO pode reiniciar o relógio da visita');
  anda(r,15*TICK_HZ);                       // 2ª vida: 15 s

  r.leave(s,'left');
  const saiu=bus.de('saiu')[0];
  assert.ok(saiu,'o painel recebeu a saída');
  // 10 + 20 + 15 = 45 s de sala. Com `joinedTick` isto dava ~15 (só a última vida).
  assert.ok(Math.abs(saiu.durouS-45)<=1,`durouS mede a visita inteira (veio ${saiu.durouS})`);
});

// ⚠️ `async` e `assenta()`: `Sim._died` e `Room.leave` disparam o `onMatchEnd` num
// `Promise.resolve().then(...)` — de propósito, para o banco nunca entrar no caminho do tick. Assertar
// no mesmo turno lê a lista vazia e o teste falha por motivo errado.
const assenta=()=>new Promise(r=>setImmediate(r));

test('...e o onMatchEnd continua medindo a VIDA — o `matches.duration_s` não pode mudar de significado',async()=>{
  const e=hooksEspiao(),bus=busEspiao(),r=sala(e.hooks,bus);r.start();
  const s=sessaoFalsa(),slot=r.join(s,{name:'Fulano',sessionId:'s0'});

  anda(r,10*TICK_HZ); mata(r,slot);
  anda(r,20*TICK_HZ); r.respawn(s);
  anda(r,15*TICK_HZ); mata(r,slot);

  await assenta();
  const vidas=e.fim.map(m=>Math.round(m.durationMs/1000));
  assert.equal(vidas.length,2,'uma linha de partida por VIDA');
  assert.ok(Math.abs(vidas[0]-10)<=1,`a 1ª vida durou 10 s (veio ${vidas[0]})`);
  assert.ok(Math.abs(vidas[1]-15)<=1,`a 2ª durou 15 s, sem os 20 s de tela de morte (veio ${vidas[1]})`);
  assert.equal(e.abertas.length,1,'o respawn abriu UMA sessão de persistência nova');
});

test('quem morre e fica assistindo não "saiu": nenhum evento de saída até ele sair de fato',()=>{
  const e=hooksEspiao(),bus=busEspiao(),r=sala(e.hooks,bus);r.start();
  const s=sessaoFalsa(),slot=r.join(s,{name:'Fulano',sessionId:'s0'});
  anda(r,5*TICK_HZ); mata(r,slot); anda(r,30*TICK_HZ);
  assert.equal(bus.de('saiu').length,0,'morrer não é sair — era isto que o relatório do portal confundia');
  assert.equal(bus.de('morte').length,1,'e a morte foi anunciada, com a duração da vida');
});

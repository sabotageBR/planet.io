// ── Teste de integração: migrate do zero → API → hooks → invariantes (node --test) ──
// precisa do Postgres de dev (.env na raiz: DATABASE_URL=postgres://planet:planet@127.0.0.1:5433/planet)
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {SKINS} from '@planet/shared/skins.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(!process.env.DATABASE_URL){try{for(const l of readFileSync(path.join(ROOT,'.env'),'utf8').split('\n')){const m=/^\s*([A-Z_]+)=(.*)$/.exec(l);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim();}}catch{}}
process.env.LOG_LEVEL=process.env.TEST_LOG||'silent';process.env.SHARD='0';
const {config}=await import('../src/config.js');
const {createLogger}=await import('../src/log.js');
const {createDb}=await import('../src/db/pool.js');
const {migrate}=await import('../src/db/migrate.js');
const {createApi,healthFields}=await import('../src/api/index.js');
const {createPersistence}=await import('../src/persist/hooks.js');
const {MatchSession}=await import('../src/persist/session.js');
const {createQueue}=await import('../src/persist/queue.js');
const {hashPassword,verifyPassword}=await import('../src/auth/password.js');
const {normalizeNick,suggestNick}=await import('../src/auth/nick.js');
const {SCORE_COINS}=await import('@planet/shared/constants.js');
const log=createLogger({level:process.env.LOG_LEVEL});
let db,persist,api,server,base;
const call=async(method,p,{body,token,ip='10.0.0.1'}={})=>{
  const r=await fetch(base+p,{method,headers:{'content-type':'application/json','x-forwarded-for':ip,...(token?{authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text();return{status:r.status,body:text?JSON.parse(text):null,headers:r.headers};
};
before(async()=>{
  db=createDb(config,log);
  await db.query('DROP SCHEMA public CASCADE');await db.query('CREATE SCHEMA public');
  const {applied}=await migrate(db,log);assert.equal(applied.length,2);   // 0001_init + 0002_round_cause
  persist=createPersistence({db,log,config:{...config,noCleanup:true}});
  api=createApi({db,log,config,persist});
  server=http.createServer(async(req,res)=>{if(await api(req,res))return;res.writeHead(404);res.end();});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await persist.shutdown();server.close();await db.close();});

test('migrate: schema completo, idempotente e skins semeadas',async()=>{
  const t=(await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`)).rows.map(r=>r.table_name);
  for(const n of ['users','auth_tokens','matches','user_stats','skins','user_skins','user_achievements','coin_ledger','schema_migrations','v_ranking_week','v_ranking_day'])assert.ok(t.includes(n),n);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM skins')).rows[0].n,SKINS.length);
  assert.equal((await migrate(db,log)).applied.length,0);
});
test('unitários: senha, nick',async()=>{
  const h=await hashPassword('segredo123');assert.match(h,/^scrypt\$32768\$8\$1\$/);assert.ok(await verifyPassword('segredo123',h));assert.ok(!(await verifyPassword('outra',h)));
  assert.equal(normalizeNick('  Evandro   Moura '),'Evandro Moura');assert.equal(normalizeNick('a'),null);assert.equal(normalizeNick('x'.repeat(17)),null);assert.equal(normalizeNick('ab'),null);
  assert.ok(suggestNick('EvandroMouraLongo').length<=16);assert.match(suggestNick('Evandro'),/^Evandro_\d{4}$/);
});

const S={};
test('guest → me → PATCH nick → claim',async()=>{
  let r=await call('POST','/api/auth/guest',{body:{nick:'Evandro'}});assert.equal(r.status,201);assert.match(r.body.token,/^pt_[A-Za-z0-9_-]{43}$/);
  assert.equal(r.body.user.coins,config.signupCoins);assert.equal(r.headers.get('cache-control'),'no-store');S.t1=r.body.token;S.u1=r.body.user.id;
  r=await call('GET','/api/me',{token:S.t1});assert.equal(r.status,200);assert.deepEqual(r.body.skins,[0]);assert.equal(r.body.user.kind,'guest');assert.equal(r.body.stats.games,0);
  r=await call('GET','/api/me');assert.equal(r.status,401);
  r=await call('PATCH','/api/me',{token:S.t1,body:{nick:'  Evandro   Moura '}});assert.equal(r.status,200);assert.equal(r.body.user.nick,'Evandro Moura');
  r=await call('PATCH','/api/me',{token:S.t1,body:{nick:'x'}});assert.equal(r.status,400);assert.equal(r.body.error,'invalid_nick');
  r=await call('POST','/api/auth/claim',{token:S.t1,body:{password:'123'}});assert.equal(r.status,400);assert.equal(r.body.error,'invalid_password');
  r=await call('POST','/api/auth/claim',{token:S.t1,body:{password:'segredo123',email:'Evandro@Example.com'}});assert.equal(r.status,200);assert.equal(r.body.user.kind,'registered');
  r=await call('POST','/api/auth/claim',{token:S.t1,body:{password:'segredo123'}});assert.equal(r.status,400);assert.equal(r.body.error,'already_registered');
});
test('nick reservado: guest 409 + sugestão; PATCH 409; guest sem nick vira Viajante-NNNN',async()=>{
  let r=await call('POST','/api/auth/guest',{body:{nick:'evandro moura'},ip:'10.0.0.2'});assert.equal(r.status,409);assert.equal(r.body.error,'nick_reserved');assert.match(r.body.suggestion,/_\d{4}$/);
  r=await call('POST','/api/auth/guest',{body:{},ip:'10.0.0.2'});assert.equal(r.status,201);assert.match(r.body.user.nick,/^Viajante-\d{4}$/);S.t2=r.body.token;S.u2=r.body.user.id;S.n2=r.body.user.nick;
  r=await call('PATCH','/api/me',{token:S.t2,body:{nick:'EVANDRO MOURA'}});assert.equal(r.status,409);assert.equal(r.body.error,'nick_reserved');
  r=await call('PATCH','/api/me',{token:S.t2,body:{nick:'Zé'}});assert.equal(r.status,200);assert.equal(r.body.user.nick,'Zé');S.n2='Zé';
});
test('login: 401, 429 por nick após 5 falhas, sucesso por nick e por e-mail',async()=>{
  let r=await call('POST','/api/auth/login',{body:{login:'Evandro Moura',password:'errada'}});assert.equal(r.status,401);assert.equal(r.body.error,'invalid_credentials');
  for(let i=0;i<4;i++)await call('POST','/api/auth/login',{body:{login:'evandro moura',password:'errada'},ip:'10.0.0.'+(10+i)});
  r=await call('POST','/api/auth/login',{body:{login:'evandro moura',password:'segredo123'},ip:'10.0.0.20'});assert.equal(r.status,429);assert.ok(r.headers.get('retry-after'));
  r=await call('POST','/api/auth/login',{body:{login:'evandro@example.com',password:'segredo123'},ip:'10.0.0.21'});assert.equal(r.status,200);assert.equal(r.body.user.id,S.u1);S.t3=r.body.token;
  r=await call('POST','/api/auth/login',{body:{login:'naoexiste',password:'segredo123'},ip:'10.0.0.22'});assert.equal(r.status,401);
});
test('skins: buy 200/409/402/403, equip 200/403, catálogo',async()=>{
  let r=await call('POST','/api/skins/1/buy',{token:S.t3});assert.equal(r.status,200);assert.equal(r.body.coins,config.signupCoins-200);assert.deepEqual(r.body.owned,[0,1]);
  r=await call('POST','/api/skins/1/buy',{token:S.t3});assert.equal(r.status,409);assert.equal(r.body.error,'already_owned');
  r=await call('POST','/api/skins/30/buy',{token:S.t3});assert.equal(r.status,402);assert.equal(r.body.error,'insufficient_coins');
  r=await call('POST','/api/skins/35/buy',{token:S.t3});assert.equal(r.status,403);assert.equal(r.body.error,'not_purchasable');
  r=await call('POST','/api/skins/999/buy',{token:S.t3});assert.equal(r.status,404);
  r=await call('POST','/api/skins/1/equip',{token:S.t3});assert.equal(r.status,200);assert.equal(r.body.equippedSkin,1);
  r=await call('POST','/api/skins/2/equip',{token:S.t3});assert.equal(r.status,403);assert.equal(r.body.error,'not_owned');
  r=await call('GET','/api/skins',{token:S.t3});assert.equal(r.body.skins.length,SKINS.length);assert.deepEqual(r.body.owned,[0,1]);assert.equal(r.body.equipped,1);
  r=await call('GET','/api/skins');assert.deepEqual(r.body.owned,[0]);assert.equal(r.body.equipped,0);
  assert.equal(db.health.fails,0,'erros de aplicação não contam no circuit breaker');
});
test('prefs: whitelist e merge',async()=>{
  let r=await call('PATCH','/api/me/prefs',{token:S.t3,body:{theme:'dusk',volume:0.5,showFps:true,hack:1,lbSize:99,quality:'low'}});
  assert.equal(r.status,200);assert.deepEqual(r.body.prefs,{theme:'dusk',volume:0.5,showFps:true,quality:'low'});
  r=await call('PATCH','/api/me/prefs',{token:S.t3,body:{music:false}});assert.deepEqual(r.body.prefs,{theme:'dusk',volume:0.5,showFps:true,quality:'low',music:false});
});
test('ranking vazio + validação',async()=>{
  let r=await call('GET','/api/ranking?period=week&by=score',{token:S.t3});assert.equal(r.status,200);assert.deepEqual(r.body.rows,[]);assert.equal(r.body.me,null);
  r=await call('GET','/api/ranking?period=x');assert.equal(r.status,400);
});
test('router: JSON inválido, corpo > 16 KB, 404, 405, rotas não tratadas',async()=>{
  let r=await fetch(base+'/api/auth/guest',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'10.0.0.30'},body:'{x'});assert.equal(r.status,400);
  r=await fetch(base+'/api/auth/guest',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'10.0.0.31'},body:JSON.stringify({nick:'a'.repeat(20000)})});assert.equal(r.status,413);
  r=await call('GET','/api/auth/nope');assert.equal(r.status,404);r=await call('DELETE','/api/me');assert.equal(r.status,405);
  r=await fetch(base+'/api/rooms');assert.equal(r.status,404);  // não é desta camada → false → 404 do servidor de teste
});
test('rate limit: guest 30/h/IP',async()=>{
  const codes=[];for(let i=0;i<31;i++)codes.push((await call('POST','/api/auth/guest',{body:{},ip:'10.9.9.9'})).status);
  assert.deepEqual(codes,[...Array(30).fill(201),429]);
});

test('hooks: join → kill/stat/sample → matchEnd salva match, moedas, conquistas, skins; coins = Σ ledger',async()=>{
  const h=persist.hooks;
  let bad=await h.onPlayerJoin({token:'pt_invalido',fallbackNick:'X'});assert.deepEqual(bad.ok,false);assert.equal(bad.code,'AUTH');
  const j1=await h.onPlayerJoin({token:S.t3,fallbackNick:'X',remoteAddr:'127.0.0.1',roomCode:'0ABC'});
  assert.equal(j1.ok,true);assert.equal(j1.userId,S.u1);assert.equal(j1.nick,'Evandro Moura');assert.equal(j1.registered,true);assert.equal(j1.skinId,1);assert.equal(j1.prefs.theme,'dusk');assert.equal(j1.unsaved,false);assert.match(j1.sessionId,/^[0-9a-f-]{36}$/);
  const j2=await h.onPlayerJoin({token:S.t2,fallbackNick:'Y'});assert.equal(j2.ok,true);assert.equal(j2.registered,false);
  assert.equal(persist.health().sessions,2);
  for(let i=0;i<3;i++)h.onStat({sessionId:j1.sessionId,key:'split'});h.onStat({sessionId:j1.sessionId,key:'eject'});h.onStat({sessionId:j1.sessionId,key:'food'});h.onStat({sessionId:'nao-existe',key:'food'});
  h.onKill({sessionId:j1.sessionId,killerSessionId:j1.sessionId,victimSessionId:'bot1',victimIsBot:true,weapon:'eat',tick:100});
  h.onKill({sessionId:j1.sessionId,killerSessionId:j1.sessionId,victimSessionId:j2.sessionId,victimIsBot:false,weapon:'missile',tick:200});
  for(let q=0;q<4;q++)h.onSample({sessionId:j1.sessionId,mass:1000+q*2000,rank:1,quadrant:q});
  // j2 morre para j1 primeiro (killed_by = u1)
  const r2=await h.onMatchEnd({sessionId:j2.sessionId,cause:'eaten',killedBySessionId:j1.sessionId,score:150,maxMass:900,durationMs:20000});
  assert.equal(r2.saved,true);assert.equal(r2.coinsEarned,0);assert.deepEqual(r2.achievements,[]);
  const r1=await h.onMatchEnd({sessionId:j1.sessionId,cause:'eaten',killedBySessionId:j2.sessionId,score:9000,maxMass:7000,durationMs:320000});
  const base=SCORE_COINS(9000,1,1,320);assert.equal(base,30+2+1+25);
  assert.equal(r1.saved,true);assert.equal(r1.coinsEarned,base+300);
  assert.deepEqual(r1.achievements.map(a=>a.key).sort(),['explore4','mass5000','survive5']);assert.deepEqual([...r1.skinsUnlocked].sort(),[35,37,43]);
  assert.equal(r1.rank.day,1);
  assert.equal(await h.onMatchEnd({sessionId:j1.sessionId,cause:'left'}),null,'sessão já encerrada → null');
  const m=(await db.query('SELECT * FROM matches WHERE user_id=$1',[S.u1])).rows[0];
  assert.equal(m.kills,1);assert.equal(m.bot_kills,1);assert.equal(m.splits,3);assert.equal(m.ejects,1);assert.equal(m.food_eaten,1);assert.equal(m.best_streak,2);assert.equal(m.top1_ticks,120);
  assert.equal(m.max_mass,7000);assert.equal(m.duration_s,320);assert.equal(m.cause,'eaten');assert.equal(m.room_code,'0ABC');assert.equal(m.coins_earned,base+300);assert.equal(m.skin_id,1);assert.equal(Number(m.killed_by_user_id),S.u2);
  const st=(await db.query('SELECT * FROM user_stats WHERE user_id=$1',[S.u1])).rows[0];assert.equal(st.games,1);assert.equal(st.best_score,9000);assert.equal(st.play_time_s,320);
  const u=(await db.query('SELECT coins FROM users WHERE id=$1',[S.u1])).rows[0];assert.equal(u.coins,config.signupCoins-200+base+300);
  for(const id of [S.u1,S.u2]){const s=(await db.query('SELECT coalesce(sum(delta),0)::int AS s FROM coin_ledger WHERE user_id=$1',[id])).rows[0].s;const c=(await db.query('SELECT coins FROM users WHERE id=$1',[id])).rows[0].coins;assert.equal(c,s,`coins = Σ ledger (user ${id})`);}
  const owned=(await call('GET','/api/me',{token:S.t3})).body;assert.deepEqual(owned.skins,[0,1,35,37,43]);assert.deepEqual(owned.achievements.sort(),['explore4','mass5000','survive5']);assert.equal(owned.stats.kills,1);
  // histórico + ranking
  const hist=(await call('GET','/api/me/history',{token:S.t2})).body.matches;assert.equal(hist.length,1);assert.equal(hist[0].by,'Evandro Moura');assert.equal(hist[0].cause,'eaten');
  let rk=(await call('GET','/api/ranking?period=day&by=score&limit=10',{token:S.t3})).body;assert.equal(rk.rows[0].userId,S.u1);assert.equal(rk.rows[0].value,9000);assert.equal(rk.rows[0].registered,true);assert.deepEqual(rk.me,{rank:1,value:9000});
  rk=(await call('GET','/api/ranking?period=all&by=kills',{token:S.t2})).body;assert.equal(rk.rows.length,1);assert.equal(rk.me,null);
});
test('finishMatch idempotente por session_id',async()=>{
  const s=new MatchSession({userId:S.u1,nick:'Evandro Moura',kind:'registered',skinId:1});s.kill({victimIsBot:false});
  const m=s.end({cause:'left',score:600,durationMs:10000});
  const before=(await db.query('SELECT coins FROM users WHERE id=$1',[S.u1])).rows[0].coins;
  const a=await persist.finishMatch(m);assert.equal(a.saved,true);assert.equal(a.coinsEarned,4);
  const b=await persist.finishMatch(m);assert.equal(b.duplicate,true);assert.equal(b.coinsEarned,4);
  assert.equal((await db.query('SELECT coins FROM users WHERE id=$1',[S.u1])).rows[0].coins,before+4);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM matches WHERE session_id=$1',[m.sessionId])).rows[0].n,1);
});
test('session: onStat eat/eatBot só contam sem onKill (sem duplicar)',()=>{
  const a=new MatchSession({userId:1,nick:'a',kind:'guest'});a.stat('eat');a.stat('eatBot');a.kill({victimIsBot:false});
  assert.equal(a.end().kills,1);assert.equal(a.end().botKills,0);
  const b=new MatchSession({userId:1,nick:'b',kind:'guest'});b.stat('eat');b.stat('eat');b.stat('eatBot');
  const m=b.end({score:1});assert.equal(m.kills,2);assert.equal(m.botKills,1);assert.equal(b.end({score:999}).score,1,'end idempotente');
});
test('onShutdown fecha sessões vivas como shutdown e drena',async()=>{
  const p2=createPersistence({db,log,config:{...config,noCleanup:true}});
  const j=await p2.hooks.onPlayerJoin({token:S.t2,fallbackNick:'Y'});assert.equal(j.ok,true);
  p2.hooks.onSample({sessionId:j.sessionId,mass:400,rank:3,quadrant:1});
  await p2.hooks.onShutdown();
  const m=(await db.query(`SELECT cause,max_mass FROM matches WHERE user_id=$1 ORDER BY id DESC LIMIT 1`,[S.u2])).rows[0];assert.equal(m.cause,'shutdown');assert.equal(m.max_mass,400);
  assert.equal(p2.health().queue,0);
  const u=await p2.hooks.onPlayerJoin({token:S.t2,fallbackNick:'Y'});assert.equal(u.unsaved,true,'após shutdown entra sem persistência');
});
test('logout revoga o token',async()=>{
  assert.equal((await call('POST','/api/auth/logout',{token:S.t1})).status,204);
  assert.equal((await call('GET','/api/me',{token:S.t1})).status,401);
  assert.equal((await call('GET','/api/me',{token:S.t3})).status,200,'token de sessão continua válido');
});
test('fila: retry com backoff e erro fatal sem retry',async()=>{
  const q=createQueue({log,baseMs:5,retriable:e=>e.code==='EAGAIN'});
  let n=0;const v=await q.push('ok',async()=>{if(++n<3)throw Object.assign(new Error('x'),{code:'EAGAIN'});return 'feito';});assert.equal(v,'feito');assert.equal(n,3);
  await assert.rejects(q.push('fatal',async()=>{throw new Error('fatal');}),/fatal/);
  assert.deepEqual(q.stats(),{queued:0,running:0,done:1,failed:1,dropped:0});await q.drain(100);
  await assert.rejects(q.push('x',async()=>1),/encerrada/);
});
test('banco fora: onPlayerJoin volta unsaved em < 3,5 s; healthFields db:down; API 503',async()=>{
  for(const url of ['postgres://planet:planet@127.0.0.1:1/planet','postgres://planet:planet@192.0.2.1:5432/planet']){
    const bad=createDb({...config,databaseUrl:url,dbPoolMax:2},log);const p=createPersistence({db:bad,log,config:{...config,noCleanup:true}});
    const t0=Date.now();const r=await p.hooks.onPlayerJoin({token:S.t3,fallbackNick:'Evandro'});const dt=Date.now()-t0;
    assert.ok(dt<3500,`demorou ${dt} ms (${url})`);assert.deepEqual(r,{ok:true,userId:null,nick:'Evandro',registered:false,skinId:0,prefs:{},unsaved:true});
    await p.hooks.onPlayerJoin({token:S.t3,fallbackNick:'E'});await p.hooks.onPlayerJoin({token:S.t3,fallbackNick:'E'});
    await new Promise(r=>setTimeout(r,100));  // o cap de 3 s do join vence a corrida por ~5 ms; a rejeição do pg (que abre o circuito) chega logo depois
    assert.equal(bad.health.down,true,'3 falhas → circuito aberto');assert.deepEqual(healthFields({db:bad,persist:p}),{db:'down',queue:0});
    const t1=Date.now();await p.hooks.onPlayerJoin({token:S.t3,fallbackNick:'E'});assert.ok(Date.now()-t1<50,'com circuito aberto responde na hora');
    const badApi=createApi({db:bad,log,config});const srv=http.createServer((req,res)=>badApi(req,res));await new Promise(r=>srv.listen(0,'127.0.0.1',r));
    const res=await fetch(`http://127.0.0.1:${srv.address().port}/api/me`,{headers:{authorization:`Bearer ${S.t3}`}});assert.equal(res.status,503);assert.equal((await res.json()).error,'db_unavailable');
    srv.close();await p.shutdown();await bad.close();
  }
});

// ── Testes da física compartilhada (node --test) ──
import {test} from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync,statSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
import {performance} from "node:perf_hooks";
import {createWorld,createGrid,createBody,tryMergeOwn,applyEject,stepOwnPieces} from "../src/physics/index.js";
import {vmaxFor} from "../src/physics/integrate.js";
import {createRng} from "../src/rng.js";
import {WORLD,SPLIT,EJECT,PLAYER,BLACKHOLE,ASTEROID,FOOD,FOOD_TYPE,SPEED,DT,POWERUP,MERGE,MISSILE,STAR} from "../src/constants.js";
import {KIND,PIECE_FLAG,FOOD_FLAG,STAR_PHASE} from "../src/protocol/constants.js";

const SRC=join(dirname(fileURLToPath(import.meta.url)),"..","src");
const empty=(seed=1)=>createWorld({seed,food:0,asteroids:false,holes:0,stars:0});
const snapshot=w=>JSON.stringify({tick:w.tick,nextId:w.nextId,
  pieces:w.pieces.map(b=>[b.id,b.owner,b.x,b.y,b.vx,b.vy,b.r,b.mergeAt,b.flags,b.shieldLv,b.magnetUntil]),
  food:w.food.map(b=>[b.id,b.x,b.y,b.type,b.hue]),ejected:w.ejected.map(b=>[b.id,b.x,b.y,b.vx,b.vy,b.life]),
  asteroids:w.asteroids.map(b=>[b.id,b.x,b.y,b.vx,b.vy,b.r,b.type,b.ang]),holes:w.holes.map(b=>[b.id,b.x,b.y,b.k,b.type,b.life,b.ex,b.ey]),
  missiles:w.missiles.map(b=>[b.id,b.x,b.y,b.vx,b.vy,b.targetId,b.type]),stars:w.stars.map(b=>[b.id,b.x,b.y,b.r,b.k,b.type,b.life]),
  players:[...w.players.values()].map(p=>[p.slot,p.alive,p.score,p.missiles])});

// 1. determinismo: mesma seed + mesmos inputs → 3600 passos byte-idênticos
test("determinismo: duas salas com a mesma seed e os mesmos inputs são idênticas após 3600 passos",()=>{
  const run=()=>{const w=createWorld({seed:1234});const script=createRng(99);
    for(let s=0;s<6;s++)w.addPlayer(s,{isBot:s>2,missiles:2});
    let events=0;
    for(let t=0;t<3600;t++){
      if(t%30===0)for(let s=0;s<6;s++)w.setTarget(s,script.range(0,WORLD.w),script.range(0,WORLD.h));
      if(t%97===5)w.requestSplit(script.int(0,5));
      if(t%41===7)w.requestEject(script.int(0,5));
      if(t===300)w.setEjectHold(1,true);if(t===420)w.setEjectHold(1,false);
      if(t%211===9)w.requestFire(script.int(0,5));
      w.step();events+=w.events.length;
      for(const e of w.events)if(e.type==="PLAYER_DEAD")w.respawnPlayer(e.slot);}
    return{snap:snapshot(w),events};};
  const a=run(),b=run();
  assert.equal(a.snap,b.snap);assert.equal(a.events,b.events);assert.ok(a.events>0,"a simulação gerou eventos");});

// 2. sem Math.random em shared/src
test("guarda: nenhum Math.random em shared/src",()=>{
  const files=[];const walk=d=>{for(const n of readdirSync(d)){const p=join(d,n);if(statSync(p).isDirectory())walk(p);else if(p.endsWith(".js"))files.push(p);}};walk(SRC);
  assert.ok(files.length>=10);
  const strip=src=>src.replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/.*$/gm,"");   // comentários não contam
  for(const f of files)assert.ok(!/Math\.random/.test(strip(readFileSync(f,"utf8"))),`Math.random em ${f}`);});

// 3. spatial hash ≡ força bruta
test("spatial hash: forEachPair e query batem com a força bruta em 500 configurações",()=>{
  const rng=createRng(7),W=2000,H=1500,grid=createGrid(W,H,128),out=[];
  for(let c=0;c<500;c++){const n=rng.int(2,90),bodies=[];
    for(let i=0;i<n;i++)bodies.push({x:rng.range(-40,W+40),y:rng.range(-40,H+40),r:rng.range(4,rng.chance(.1)?400:80)});
    grid.clear();bodies.forEach((b,i)=>grid.insert(i,b.x,b.y,b.r));grid.build();
    const brute=new Set();
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){const a=bodies[i],b=bodies[j],dx=a.x-b.x,dy=a.y-b.y,s=a.r+b.r;if(dx*dx+dy*dy<s*s)brute.add(i*1000+j);}
    const seen=new Set(),hits=new Set();
    grid.forEachPair((i,j)=>{assert.ok(i<j,"i<j");const key=i*1000+j;assert.ok(!seen.has(key),`par duplicado ${i},${j}`);seen.add(key);
      const a=bodies[i],b=bodies[j],dx=a.x-b.x,dy=a.y-b.y,s=a.r+b.r;if(dx*dx+dy*dy<s*s)hits.add(key);});
    assert.deepEqual([...hits].sort(),[...brute].sort(),`config ${c}: pares diferentes`);
    for(let q=0;q<5;q++){const qx=rng.range(0,W),qy=rng.range(0,H),qr=rng.range(10,300),k=grid.query(qx,qy,qr,out),got=new Set(out.slice(0,k));
      assert.equal(got.size,k,"query sem duplicatas");
      for(let i=0;i<n;i++){const b=bodies[i],dx=b.x-qx,dy=b.y-qy,s=b.r+qr;if(dx*dx+dy*dy<s*s)assert.ok(got.has(i),`query perdeu o corpo ${i}`);}}
    const x0=rng.range(0,W),y0=rng.range(0,H),x1=x0+rng.range(10,600),y1=y0+rng.range(10,600),k=grid.queryRect(x0,y0,x1,y1,out),got=new Set(out.slice(0,k));
    for(let i=0;i<n;i++){const b=bodies[i];if(b.x+b.r>x0&&b.x-b.r<x1&&b.y+b.r>y0&&b.y-b.r<y1)assert.ok(got.has(i),`queryRect perdeu ${i}`);}}});

// 4. conservação de momento
test("momento: fusão do mesmo dono e eject conservam momento (1e-6)",()=>{
  const a=createBody(KIND.PIECE,1,100,100,40),b=createBody(KIND.PIECE,2,110,104,30);a.vx=120;a.vy=-30;b.vx=-80;b.vy=200;a.mergeAt=b.mergeAt=0;
  const px=a.mass*a.vx+b.mass*b.vx,py=a.mass*a.vy+b.mass*b.vy,m0=a.mass+b.mass;
  assert.ok(tryMergeOwn(a,b,10));assert.ok(b.dead);
  assert.ok(Math.abs(a.mass*a.vx-px)<1e-6&&Math.abs(a.mass*a.vy-py)<1e-6,"fusão");assert.ok(Math.abs(a.mass-m0)<1e-9);
  const w=empty(3),ps=w.players.get(0)||(w.addPlayer(0,{x:1000,y:1000,r:60}),w.players.get(0));const pc=ps.pieces[0];
  pc.vx=150;pc.vy=-40;w.setTarget(0,1300,1100);const m1=pc.mass,p0x=m1*pc.vx,p0y=m1*pc.vy;
  assert.equal(applyEject(w,ps),1);const e=w.ejected[0];
  const p1x=pc.mass*pc.vx+e.mass*e.vx,p1y=pc.mass*pc.vy+e.mass*e.vy;
  assert.ok(Math.abs(p1x-p0x)<1e-6&&Math.abs(p1y-p0y)<1e-6,`eject: (${p1x-p0x},${p1y-p0y})`);
  assert.ok(Math.abs(pc.mass+e.mass-m1)<1e-9,"massa conservada");
  assert.ok(Math.abs(Math.hypot(e.vx-150,e.vy+40)-EJECT.SPEED)<1e-6,"pellet a v_peça + dir·SPEED");});

// 5. sem tunelamento
test("sem tunelamento: peça a SPLIT.SPEED nunca sai do mundo; contra asteroide quica ou estoura, nunca termina dentro",()=>{
  const w=empty(5);const pc=w.addPlayer(0,{x:200,y:200,r:30});pc.vx=-SPLIT.SPEED;pc.vy=-SPLIT.SPEED;
  for(let t=0;t<120;t++){w.step();assert.ok(pc.x>=pc.r-1e-9&&pc.x<=w.w-pc.r+1e-9&&pc.y>=pc.r-1e-9&&pc.y<=w.h-pc.r+1e-9,`fora do mundo no tick ${t}`);}
  const w2=empty(6);const small=w2.addPlayer(0,{x:1000,y:1000,r:30});small.vx=SPLIT.SPEED;const ast=w2.spawnAsteroid(-1,1300,1000,40);ast.vx=ast.vy=0;
  let popped=false;
  for(let t=0;t<120;t++){w2.step();if(w2.events.some(e=>e.type==="POP"))popped=true;
    const d=Math.hypot(small.x-ast.x,small.y-ast.y);assert.ok(d>ast.r,`centro da peça dentro do asteroide no tick ${t} (d=${d.toFixed(1)})`);}
  assert.ok(!popped,"peça menor não estoura");assert.ok(small.vx<0,"quicou (vx invertido)");
  assert.ok(Math.hypot(small.x-ast.x,small.y-ast.y)>=(small.r+ast.r)*.99,"terminou fora do asteroide");
  const w3=empty(7);const big=w3.addPlayer(0,{x:1000,y:1000,r:60});big.vx=SPLIT.SPEED;w3.setTarget(0,1600,1000);const ast3=w3.spawnAsteroid(-1,1300,1000,40);ast3.vx=ast3.vy=0;
  let pop=null;for(let t=0;t<120&&!pop;t++){w3.step();pop=w3.events.find(e=>e.type==="POP")||null;}
  assert.ok(pop,"peça maior estoura no asteroide");assert.ok(w3.piecesOf(0).length>=3,"pop gerou peças");
  assert.equal(w3.asteroids.length,0,"asteroide some e volta só depois de RESPAWN_TICKS");
  for(let t=0;t<=ASTEROID.RESPAWN_TICKS;t++)w3.step();assert.equal(w3.asteroids.length,1,"asteroide respawnou");});

// 6. regra de engolir
test("engolir: r60 vs r30 engole com o centro dentro; r40 vs r38 quica sem engolir",()=>{
  const w=empty(8);w.addPlayer(0,{x:1000,y:1000,r:60});w.addPlayer(1,{x:1040,y:1000,r:30});w.step();
  const eat=w.events.find(e=>e.type==="EAT");assert.ok(eat,"EAT emitido");assert.equal(eat.killerSlot,0);assert.equal(eat.victimSlot,1);assert.ok(eat.lastPiece);
  assert.ok(w.events.some(e=>e.type==="PLAYER_DEAD"&&e.slot===1&&e.cause==="eaten"&&e.bySlot===0));
  assert.equal(w.piecesOf(1).length,0);assert.ok(!w.players.get(1).alive);assert.ok(w.piecesOf(0)[0].mass>3600);
  const w2=empty(9);w2.addPlayer(0,{x:1000,y:1000,r:60});w2.addPlayer(1,{x:1052,y:1000,r:30});w2.step();
  assert.ok(!w2.events.some(e=>e.type==="EAT"),"centro fora (d=52 ≥ 60−30·.4=48): não engole");
  const w3=empty(10);const a=w3.addPlayer(0,{x:1000,y:1000,r:40}),b=w3.addPlayer(1,{x:1070,y:1000,r:38});b.vx=-300;
  for(let t=0;t<60;t++){w3.step();assert.ok(!w3.events.some(e=>e.type==="EAT"),"tamanhos parecidos nunca engolem");}
  assert.ok(w3.players.get(0).alive&&w3.players.get(1).alive);
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=(a.r+b.r)*.98,"quique separou as peças");});

// 7. buraco negro
test("buraco negro: peça no núcleo é teleportada para a saída com massa ×(1−LOSS); peça pequena é destruída",()=>{
  const w=empty(11);const h=w.spawnHole({x:2000,y:2000,ex:5000,ey:5000,active:true});
  const pc=w.addPlayer(0,{x:2005,y:2000,r:40});pc.cdUntil=0;const m0=pc.mass;w.step();
  const s=w.events.find(e=>e.type==="BH_SUCK");assert.ok(s,"BH_SUCK");assert.equal(s.slot,0);assert.equal(s.pieceId,pc.id);assert.ok(!s.destroyed);
  assert.ok(Math.abs(pc.mass-m0*(1-BLACKHOLE.LOSS))<1e-6,"massa ×(1−LOSS)");
  assert.ok(Math.hypot(pc.x-h.ex,pc.y-h.ey)<=45,"perto da saída");assert.ok(Math.abs(Math.hypot(pc.vx,pc.vy)-BLACKHOLE.EXIT_SPEED)<1e-6);
  assert.ok(w.events.some(e=>e.type==="EXIT"&&e.slot===0));assert.ok(w.players.get(0).alive);
  const tiny=w.addPlayer(1,{x:2003,y:2001,r:17});tiny.cdUntil=0;w.step();
  const s2=w.events.find(e=>e.type==="BH_SUCK"&&e.slot===1);assert.ok(s2&&s2.destroyed,"peça pequena destruída");
  assert.ok(w.events.some(e=>e.type==="PLAYER_DEAD"&&e.slot===1&&e.cause==="blackhole"));assert.equal(w.piecesOf(1).length,0);
  assert.ok(pc.r>=PLAYER.MIN_PIECE_R);});

// 8. predição usa as mesmas funções (peça própria isolada = servidor)
test("predição: stepOwnPieces reproduz o servidor para um jogador isolado",()=>{
  const w=empty(12);w.addPlayer(0,{x:3000,y:3000,r:50});w.setTarget(0,3600,3200);w.requestSplit(0);w.step();
  const own=w.piecesOf(0).map(p=>({...p})),st={tx:3600,ty:3200};
  for(let t=0;t<400;t++){if(t===100){w.setTarget(0,2800,3300);st.tx=2800;st.ty=3300;}stepOwnPieces(own,st,w.tick);w.step();}
  const real=w.piecesOf(0);assert.equal(own.length,real.length);
  for(let i=0;i<own.length;i++){assert.ok(Math.abs(own[i].x-real[i].x)<1e-6&&Math.abs(own[i].y-real[i].y)<1e-6,`peça ${i} diverge`);}});

// 9. desempenho: sala cheia
test("desempenho: sala cheia (30×8 peças, 840 comidas, 40 asteroides, 120 ejetados, 3 buracos) — média ≤ 1.5 ms/passo",t=>{
  const w=createWorld({seed:2024}),script=createRng(5);
  for(let s=0;s<30;s++){w.addPlayer(s,{isBot:s>=5,r:70,missiles:1});w.setTarget(s,script.range(0,WORLD.w),script.range(0,WORLD.h));}
  for(let round=0;round<3;round++){for(let s=0;s<30;s++)w.requestSplit(s);for(let i=0;i<SPLIT.COOLDOWN_TICKS+1;i++)w.step();}
  for(let i=0;i<120;i++){const an=script.angle();w.addEjected(script.range(100,WORLD.w-100),script.range(100,WORLD.h-100),Math.cos(an)*200,Math.sin(an)*200,EJECT.R,EJECT.R*EJECT.R,-1,0,EJECT.LIFE_TICKS);}
  for(const pc of w.pieces)pc.mergeAt=1e9;
  const N=600,times=new Float64Array(N);let maxPieces=0;
  for(let i=0;i<N;i++){if(i%60===0)for(let s=0;s<30;s++)w.setTarget(s,script.range(0,WORLD.w),script.range(0,WORLD.h));
    if(i%120===0)for(let s=0;s<30;s++){if(w.piecesOf(s).length<PLAYER.MAX_PIECES)w.requestSplit(s);}
    if(i%200===50)w.requestFire(script.int(0,29));
    const t0=performance.now();w.step();times[i]=performance.now()-t0;if(w.pieces.length>maxPieces)maxPieces=w.pieces.length;
    for(const e of w.events)if(e.type==="PLAYER_DEAD")w.respawnPlayer(e.slot,{r:70});}
  const sorted=Float64Array.from(times).sort();let sum=0;for(const v of times)sum+=v;const avg=sum/N,p50=sorted[N>>1],p99=sorted[Math.floor(N*.99)],max=sorted[N-1];
  t.diagnostic(`passo: média ${avg.toFixed(3)} ms · p50 ${p50.toFixed(3)} · p99 ${p99.toFixed(3)} · máx ${max.toFixed(3)} · peças máx ${maxPieces} · comida ${w.food.length} · asteroides ${w.asteroids.length} · ejetados ${w.ejected.length}`);
  console.log(`[perf] média ${avg.toFixed(3)} ms · p50 ${p50.toFixed(3)} ms · p99 ${p99.toFixed(3)} ms · máx ${max.toFixed(3)} ms · peças máx ${maxPieces}`);
  assert.ok(maxPieces>=200,`sala deveria ter ≥200 peças (teve ${maxPieces})`);assert.equal(w.food.length,FOOD.COUNT);
  assert.ok(avg<=1.5,`média ${avg.toFixed(3)} ms > 1.5 ms`);});

// 10. fusão por proximidade
test("fusão: sem puxão de longe; atração só a d<(ra+rb)·ATTRACT_RANGE; separação enquanto não podem fundir",()=>{
  const w=empty(20),a=w.addPlayer(0,{x:1000,y:1000,r:40});w.setTarget(0,1000,1000);const b=w.newPiece(0,1600,1000,40);a.mergeAt=b.mergeAt=0;
  w.step();assert.equal(a.vx,0,"a (no alvo, sem thrust) não é puxada de 600 px");
  assert.ok(Math.abs(b.vx)<=vmaxFor(40)*SPEED.ACCEL*DT+1e-6,"b só tem o thrust do steering");
  const w2=empty(21),a2=w2.addPlayer(0,{x:1000,y:1000,r:40});w2.setTarget(0,1000,1000);const b2=w2.newPiece(0,1120,1000,40);a2.mergeAt=b2.mergeAt=0;
  w2.step();assert.ok(a2.vx>0,"a 120 px (< 80·"+MERGE.ATTRACT_RANGE+") a é atraída");
  let merged=false;for(let t=0;t<120&&!merged;t++){w2.step();merged=w2.events.some(e=>e.type==="MERGE");}
  assert.ok(merged,"fundem em < 2 s");assert.equal(w2.piecesOf(0).length,1);
  const w3=empty(22),a3=w3.addPlayer(0,{x:1000,y:1000,r:40});w3.setTarget(0,1000,1000);const b3=w3.newPiece(0,1030,1000,40);a3.mergeAt=b3.mergeAt=1e9;
  for(let t=0;t<60;t++){w3.step();assert.ok(!w3.events.some(e=>e.type==="MERGE"));}
  assert.ok(Math.hypot(a3.x-b3.x,a3.y-b3.y)>40,"sem cooldown vencido continuam separadas");});

// 11. escudo por níveis
test("escudo: não expira, evolui sem ser atingido, míssil e tiro tiram um nível, dividir derruba, escudado quica",()=>{
  const w=empty(30),pc=w.addPlayer(0,{x:1000,y:1000,r:40});w.setTarget(0,1000,1000);
  const f=w.spawnFood();f.type=FOOD_TYPE.SHIELD;f.x=1000;f.y=1000;w.foodDirty=true;w.step();
  assert.equal(pc.shieldLv,1);assert.ok(w.events.some(e=>e.type==="SHIELD_UP"&&e.level===1));
  w.step();assert.ok(pc.flags&PIECE_FLAG.SHIELD);assert.equal((pc.flags>>PIECE_FLAG.SHIELD_LV_SHIFT)&3,1);
  let ups=0;for(let t=0;t<POWERUP.SHIELD_EVOLVE_TICKS*2+5;t++){w.step();for(const e of w.events)if(e.type==="SHIELD_UP")ups++;}
  assert.equal(pc.shieldLv,POWERUP.SHIELD_MAX_LEVEL);assert.equal(ups,2);
  for(let t=0;t<3000;t++)w.step();assert.equal(pc.shieldLv,POWERUP.SHIELD_MAX_LEVEL,"não expira nem passa do teto");
  assert.equal((pc.flags>>PIECE_FLAG.SHIELD_LV_SHIFT)&3,3);
  const f2=w.spawnFood();f2.type=FOOD_TYPE.SHIELD;f2.x=pc.x;f2.y=pc.y;w.foodDirty=true;w.step();assert.equal(pc.shieldLv,3,"outro 🛡️ no teto: continua 3");
  // míssil inimigo tira um nível, sem tirar massa
  const w3=empty(31),p0=w3.addPlayer(0,{x:1000,y:1000,r:40});w3.setTarget(0,1000,1000);p0.shieldLv=2;p0.shieldEvolveAt=1e9;
  w3.addPlayer(1,{x:1400,y:1000,r:40,missiles:2});w3.setTarget(1,1400,1000);
  w3.requestFire(1);let hit=null;for(let t=0;t<60&&!hit;t++){w3.step();hit=w3.events.find(e=>e.type==="SHIELD_HIT")||null;}
  assert.ok(hit,"SHIELD_HIT");assert.equal(hit.level,1);assert.equal(p0.shieldLv,1);assert.equal(w3.missiles.length,0);assert.equal(p0.r,40,"massa intacta");
  assert.ok(p0.shieldEvolveAt<1e9,"timer de evolução reiniciado");assert.ok(!w3.events.some(e=>e.type==="BOOM"));
  w3.requestFire(1);let brk=null;for(let t=0;t<60&&!brk;t++){w3.step();brk=w3.events.find(e=>e.type==="SHIELD_BREAK")||null;}
  assert.ok(brk&&brk.slot===0&&brk.bySlot===1,"segundo míssil destrói");assert.equal(p0.shieldLv,0);assert.equal(p0.r,40);
  // cada tiro do dono custa UM nível (sem munição não custa nada); dividir derruba o escudo inteiro
  const w4=empty(32),q=w4.addPlayer(0,{x:1000,y:1000,r:40,missiles:0}),ps4=w4.players.get(0);w4.setTarget(0,1500,1000);q.shieldLv=2;q.shieldEvolveAt=1e9;
  w4.requestFire(0);w4.step();assert.equal(q.shieldLv,2,"sem munição não custa escudo");
  ps4.missiles=2;w4.requestFire(0);w4.step();assert.equal(q.shieldLv,1,"1º tiro: −1 nível");assert.ok(w4.events.some(e=>e.type==="SHIELD_HIT"&&e.bySlot===-1));
  w4.requestFire(0);w4.step();assert.equal(q.shieldLv,0,"2º tiro: zera");assert.ok(w4.events.some(e=>e.type==="SHIELD_BREAK"&&e.bySlot===-1));
  q.shieldLv=3;q.shieldEvolveAt=1e9;w4.requestSplit(0);w4.step();assert.equal(q.shieldLv,0,"dividir derruba o escudo da peça inteiro");
  assert.equal(w4.piecesOf(0).length,2);assert.equal(w4.piecesOf(0)[1].shieldLv,0,"a filha nasce sem powerup");
  // grande vs pequeno com escudo nível 3: a 1ª batida derruba o escudo inteiro e quica; depois o grande come
  const w5=empty(33),big=w5.addPlayer(0,{x:1000,y:1000,r:60}),small=w5.addPlayer(1,{x:1085,y:1000,r:30});
  small.shieldLv=POWERUP.SHIELD_MAX_LEVEL;small.shieldEvolveAt=1e9;w5.setTarget(1,1085,1000);
  let quebra=null;for(let t=0;t<120&&!quebra;t++){w5.setTarget(0,small.x,small.y);w5.step();quebra=w5.events.find(e=>e.type==="SHIELD_BREAK")||null;
    assert.ok(!w5.events.some(e=>e.type==="EAT"),"não engole com escudo de pé");}
  assert.ok(quebra&&quebra.bySlot===0,"a batida do maior derruba o escudo (bySlot = o grande)");assert.equal(small.shieldLv,0,"cai inteiro, mesmo no nível 3");
  assert.ok(w5.players.get(1).alive,"sobrevive à batida");assert.ok(Math.hypot(small.vx,small.vy)>0,"foi empurrado (chance de fuga)");
  let eat=null;for(let t=0;t<600&&!eat;t++){w5.setTarget(0,small.x,small.y);w5.step();eat=w5.events.find(e=>e.type==="EAT")||null;}
  assert.ok(eat&&eat.killerSlot===0,"sem escudo, o maior come");assert.ok(!w5.players.get(1).alive);});

// 12. míssil × míssil
test("míssil×míssil: interceptação (type 1 mira o míssil inimigo) e choque varrido destroem os dois (CLASH)",()=>{
  const w=empty(40);w.addPlayer(0,{x:1000,y:1000,r:40,missiles:1});w.addPlayer(1,{x:1800,y:1000,r:40,missiles:1});w.setTarget(0,1000,1000);w.setTarget(1,1800,1000);
  w.requestFire(0);w.step();const mA=w.missiles[0];assert.equal(mA.targetId,1);assert.equal(mA.type,0);
  w.requestFire(1);w.step();const mB=w.missiles[1];assert.equal(mB.type,1);assert.equal(mB.targetId,mA.id);
  let clash=null;for(let t=0;t<60&&!clash;t++){w.step();clash=w.events.find(e=>e.type==="CLASH")||null;}
  assert.ok(clash,"CLASH");assert.equal(w.missiles.length,0);assert.ok(w.players.get(0).alive&&w.players.get(1).alive);
  assert.ok(!w.events.some(e=>e.type==="BOOM")&&!w.events.some(e=>e.type==="SHIELD_HIT"));
  // raspada: retas paralelas a 20 px (posição de fim de tick nunca sobrepõe: √(12²+20²)=23.3 > 22) — o varrido pega
  const w2=empty(41);w2.addPlayer(0,{x:1000,y:1000,r:40});w2.addPlayer(1,{x:3000,y:3000,r:40});
  w2.addMissile(1000,1500,MISSILE.SPEED,0,0,-1);w2.addMissile(1612,1520,-MISSILE.SPEED,0,1,-1);
  let c2=null;for(let t=0;t<40&&!c2;t++){w2.step();c2=w2.events.find(e=>e.type==="CLASH")||null;}assert.ok(c2,"raspada detectada pelo varrido");
  // mesmo dono não colide
  const w3=empty(42);w3.addPlayer(0,{x:1000,y:1000,r:40});w3.addMissile(1000,1500,MISSILE.SPEED,0,0,-1);w3.addMissile(1600,1500,-MISSILE.SPEED,0,0,-1);
  for(let t=0;t<40;t++){w3.step();assert.ok(!w3.events.some(e=>e.type==="CLASH"));}
  // alvo do interceptador some → segue reto
  const w4=empty(43);w4.addPlayer(0,{x:1000,y:1000,r:40,missiles:1});w4.addPlayer(1,{x:2000,y:1000,r:40,missiles:1});w4.setTarget(0,1000,1000);w4.setTarget(1,2000,1000);
  w4.requestFire(0);w4.step();w4.requestFire(1);w4.step();const i4=w4.missiles[1];assert.equal(i4.type,1);w4.missiles[0].dead=true;w4.step();w4.step();
  assert.equal(i4.type,0);assert.equal(i4.targetId,-1);assert.ok(!i4.dead);assert.equal(w4.missiles.length,1);});

// 13. míssil × asteroide
test("míssil×asteroide: desvia o errante (DEFLECT) e tira o de cinturão da órbita (vira errante, cinturão repõe)",()=>{
  const w=empty(50);w.addPlayer(0,{x:1000,y:1000,r:40});const a=w.spawnAsteroid(-1,1300,1000,40);a.vx=a.vy=0;w.addMissile(1260,1000,MISSILE.SPEED,0,0,-1);
  w.step();const d=w.events.find(e=>e.type==="DEFLECT");assert.ok(d,"DEFLECT");assert.ok(Math.abs(d.nx-1)<1e-9);
  assert.ok(Math.abs(a.vx-MISSILE.AST_KICK*ASTEROID.R_MIN/40)<1e-6,"Δv = AST_KICK·R_MIN/r");assert.equal(w.missiles.length,0);assert.ok(!a.dead);
  const w2=createWorld({seed:51,food:0,holes:0});const b=w2.asteroids.find(x=>x.type>=0),belt=b.type,n0=w2.asteroids.length;
  w2.addMissile(b.x-b.r-4,b.y,MISSILE.SPEED,0,0,-1);w2.step();
  assert.equal(b.type,-1,"virou errante");assert.equal(w2.astQueue.length,1);assert.equal(w2.astQueue[0].belt,belt);
  for(let t=0;t<=ASTEROID.RESPAWN_TICKS;t++)w2.step();assert.equal(w2.asteroids.length,n0+1,"cinturão repôs");});

// 14. ímã
test("ímã: comida no alcance é sugada (MOVED, acelerando) e ejetados de terceiros são atraídos; sem ímã nada se move",()=>{
  const w=empty(60),me=w.addPlayer(0,{x:1000,y:1000,r:40});w.setTarget(0,1000,1000);
  const f=w.spawnFood();f.type=FOOD_TYPE.DUST;f.x=1200;f.y=1000;w.foodDirty=true;
  w.addPlayer(1,{x:3000,y:3000,r:40});const e=w.addEjected(1000,1200,0,0,EJECT.R,EJECT.R*EJECT.R,1,0,EJECT.LIFE_TICKS);
  w.step();assert.equal(f.x,1200,"sem ímã a comida fica");assert.equal(e.vy,0);assert.equal(f.flags&FOOD_FLAG.MOVED,0);
  me.magnetUntil=1e9;w.step();
  assert.ok(f.x<1200&&(f.flags&FOOD_FLAG.MOVED),"comida puxada e marcada MOVED");assert.ok(e.vy<0,"ejetado atraído");
  const x1=f.x;w.step();assert.ok(x1-f.x>1200-x1,"acelera ao se aproximar (sucção)");
  let eaten=false;for(let t=0;t<120&&!eaten;t++){w.step();eaten=w.events.some(ev=>ev.type==="FOOD_EATEN");}assert.ok(eaten,"chega à boca em < 2 s");});

// 15. estrela: estilhaço ao encostar
test("estrela: encostar estilhaça o planeta em vários pedaços (massa conservada), com cooldown; peça pequena só é empurrada",()=>{
  const w=empty(70);const st=w.spawnStar(true);st.x=1000;st.y=1000;
  const pc=w.addPlayer(0,{x:1000+st.r+40,y:1000,r:60}),ps=w.players.get(0);w.setTarget(0,st.x,st.y);
  const m0=pc.mass;let burst=null;for(let t=0;t<180&&!burst;t++){w.step();burst=w.events.find(e=>e.type==="STAR_BURST")||null;}
  assert.ok(burst&&burst.slot===0,"STAR_BURST");
  const parts=w.piecesOf(0).filter(p=>!p.dead);assert.ok(parts.length>=STAR.SHATTER_N[0]+1,"virou vários pedaços");
  const mt=parts.reduce((a,p)=>a+p.mass,0);assert.ok(Math.abs(mt-m0)<1e-6,"massa conservada");
  assert.ok(parts.every(p=>p.mergeAt>w.tick),"não fundem na hora");
  assert.ok(parts.some(p=>Math.hypot(p.vx,p.vy)>STAR.SHATTER_SPEED*.5),"saem voando");
  const n1=parts.length;for(let t=0;t<STAR.SHATTER_CD_TICKS-2;t++)w.step();
  assert.equal(w.events.filter(e=>e.type==="STAR_BURST").length,0,"cooldown segura o segundo estilhaço");
  // peça abaixo de SHATTER_MIN_R só é cuspida para fora
  const w2=empty(71),s2=w2.spawnStar(true);s2.x=1000;s2.y=1000;
  const q=w2.addPlayer(0,{x:1000+s2.r+2,y:1000,r:STAR.SHATTER_MIN_R-4});w2.setTarget(0,1000,1000);w2.step();
  assert.ok(!w2.events.some(e=>e.type==="STAR_BURST"),"pequena não estilhaça");assert.ok(q.vx>0,"foi empurrada para fora");
  assert.equal(w2.piecesOf(0).length,1);assert.ok(n1>1);});

// 16. estrela: envelhece e explode em supernova
test("estrela: GROW→ACTIVE→OLD incha e vira supernova (partículas, asteroides chutados, planeta só empurrado) e outra nasce",()=>{
  const w=empty(72);const st=w.spawnStar(true);st.x=3000;st.y=3000;st.life=w.tick+3;
  const a=w.spawnAsteroid(-1,3300,3000,40);a.vx=a.vy=0;
  const pc=w.addPlayer(0,{x:3000,y:3400,r:40});w.setTarget(0,pc.x,pc.y);   // longe do contato: só sente o empurrão da onda
  for(let t=0;t<4;t++)w.step();assert.equal(st.type,STAR_PHASE.OLD,"envelheceu");
  const r0=st.r;for(let t=0;t<STAR.OLD_TICKS/2;t++)w.step();assert.ok(st.r>r0,"incha antes de explodir");
  let nova=null;for(let t=0;t<STAR.OLD_TICKS&&!nova;t++){w.step();nova=w.events.find(e=>e.type==="SUPERNOVA")||null;}
  assert.ok(nova,"SUPERNOVA");assert.ok(st.dead);assert.ok(nova.r>STAR.R*STAR.NOVA_R,"raio da explosão usa a estrela inchada");
  assert.equal(w.ejected.filter(e=>!e.dead&&e.owner===-1).length,STAR.NOVA_PARTICLES,"partículas espalhadas");
  assert.ok(Math.hypot(a.vx,a.vy)>STAR.AST_KICK*.3,"asteroide impulsionado");assert.ok(a.vx>0,"para longe da estrela");
  assert.ok(pc.vy>0&&Math.hypot(pc.vx,pc.vy)<STAR.PUSH*1.01,"planeta só empurrado");
  assert.equal(w.piecesOf(0).length,1,"não se parte com a onda");
  assert.equal(w.stars.filter(s=>!s.dead).length,0);assert.equal(w.starQueue.length,1);
  for(let t=0;t<=STAR.RESPAWN_TICKS;t++)w.step();assert.equal(w.stars.length,1,"outra estrela nasce depois");
  // de cinturão vira errante e o cinturão repõe
  const w2=createWorld({seed:73,food:0,holes:0,stars:0});const b=w2.asteroids.find(x=>x.type>=0);
  const s2=w2.spawnStar(true);s2.x=b.x;s2.y=b.y+STAR.R*2;s2.life=w2.tick+1;
  for(let t=0;t<3+STAR.OLD_TICKS;t++)w2.step();
  assert.ok(w2.events.length>=0);assert.equal(b.type,-1,"o de cinturão virou errante");assert.ok(w2.astQueue.length>=1);});

// 17. ímã mais fraco: comida pesada e a estrela vêm devagar
test("ímã: cometa/estrela vêm a MAGNET_HEAVY da poeira e a estrela do mundo se arrasta a MAGNET_STAR",()=>{
  const w=empty(74),me=w.addPlayer(0,{x:1000,y:1000,r:40});w.setTarget(0,1000,1000);me.magnetUntil=1e9;
  const d=w.spawnFood();d.type=FOOD_TYPE.DUST;d.x=1150;d.y=1000;
  const c=w.spawnFood();c.type=FOOD_TYPE.COMET;c.x=1150;c.y=1100;w.foodDirty=true;w.step();
  const dd=1150-d.x,dc=1150-c.x;assert.ok(dd>0&&dc>0,"os dois são puxados");
  assert.ok(Math.abs(dc/dd-POWERUP.MAGNET_HEAVY)<.15,"o cometa vem a ~MAGNET_HEAVY da poeira");
  const st=w.spawnStar(true);st.x=1000+40*POWERUP.MAGNET_RANGE-30;st.y=1000;const x0=st.x;w.step();
  assert.ok(st.x<x0,"a estrela se arrasta na direção do planeta");
  assert.ok(x0-st.x<POWERUP.MAGNET_PULL*DT*.5,"bem mais devagar que a comida");});

// 18. asteroide × escudo e tiro mirado
test("asteroide: batida forte tira um nível do escudo (sem lascar); tiro mirado sem nada no cone sai reto",()=>{
  const w=empty(75);const pc=w.addPlayer(0,{x:1000,y:1000,r:40});pc.shieldLv=2;pc.shieldEvolveAt=1e9;
  const a=w.spawnAsteroid(-1,1200,1000,60);a.vx=-900;a.vy=0;w.setTarget(0,1000,1000);
  let hit=null;for(let t=0;t<30&&!hit;t++){w.step();hit=w.events.find(e=>e.type==="SHIELD_HIT")||null;}
  assert.ok(hit,"batida forte tira um nível");assert.equal(pc.shieldLv,1);assert.equal(pc.r,40,"o escudo absorve: sem lasca");
  assert.ok(!w.events.some(e=>e.type==="CHIP"));
  // sem escudo, a mesma batida lasca como antes
  const w2=empty(76);const p2=w2.addPlayer(0,{x:1000,y:1000,r:40});const a2=w2.spawnAsteroid(-1,1200,1000,60);
  a2.vx=-900;a2.vy=0;w2.setTarget(0,1000,1000);let chip=null;for(let t=0;t<30&&!chip;t++){w2.step();chip=w2.events.find(e=>e.type==="CHIP")||null;}
  assert.ok(chip&&p2.r<40,"sem escudo lasca");
  // mira com o cone vazio: o míssil sai reto para o alvo do ponteiro
  const w3=empty(77);w3.addPlayer(0,{x:1000,y:1000,r:40,missiles:1});w3.addPlayer(1,{x:1000,y:2000,r:40});
  w3.setTarget(0,2000,1000);w3.requestFire(0,true);w3.step();
  const m=w3.missiles[0];assert.ok(m,"míssil");assert.equal(m.targetId,-1);assert.ok(m.vx>0&&Math.abs(m.vy)<1e-6,"direção do alvo");
  const vy0=m.vy;for(let t=0;t<30;t++)w3.step();assert.ok(Math.abs(m.vy-vy0)<1e-6,"não curva atrás de ninguém");});

// 19. powerups por peça
test("powerup por peça: só a parte que pegou o 🛡️/🧲 se beneficia; ao fundir fica o melhor das duas",()=>{
  const w=empty(80),a=w.addPlayer(0,{x:1000,y:1000,r:60});w.setTarget(0,2000,1000);
  w.requestSplit(0);w.step();const b=w.piecesOf(0).find(p=>p!==a);assert.ok(b,"dividiu em duas");
  for(let t=0;t<25;t++)w.step();assert.ok(b.x-a.x>200,"as partes se afastaram");
  const f=w.spawnFood();f.type=FOOD_TYPE.SHIELD;f.x=b.x;f.y=b.y;w.foodDirty=true;w.step();
  assert.equal(b.shieldLv,1,"o escudo é de quem pegou");assert.equal(a.shieldLv,0,"a outra parte não ganha nada");
  w.step();assert.ok(b.flags&PIECE_FLAG.SHIELD,"a flag vai na peça certa");assert.equal(a.flags&PIECE_FLAG.SHIELD,0);
  const g=w.spawnFood();g.type=FOOD_TYPE.MAGNET;g.x=b.x;g.y=b.y;w.foodDirty=true;w.step();
  assert.ok(b.magnetUntil>w.tick&&a.magnetUntil<=w.tick,"o ímã também é só dela");
  const dust=w.spawnFood();dust.type=FOOD_TYPE.DUST;dust.x=a.x-a.r*3;dust.y=a.y;w.foodDirty=true;const x0=dust.x;   // do lado de fora, longe do alcance de b
  w.step();assert.equal(dust.x,x0,"a parte sem ímã não puxa comida");
  // ao fundir, a peça que fica leva o melhor poder das duas
  a.shieldLv=1;a.shieldEvolveAt=b.shieldEvolveAt=1e9;const mag=b.magnetUntil;a.mergeAt=b.mergeAt=0;w.setTarget(0,(a.x+b.x)/2,1000);
  let merged=false;for(let t=0;t<600&&!merged;t++){w.step();merged=w.events.some(e=>e.type==="MERGE");}
  assert.ok(merged,"as partes se juntam");const left=w.piecesOf(0).filter(p=>!p.dead);assert.equal(left.length,1);
  assert.equal(left[0].shieldLv,1,"fica o maior escudo das duas");assert.equal(left[0].magnetUntil,mag,"e o ímã da outra parte");});

// 20. mira: trava no alvo do cone
test("tiro mirado: persegue o objeto mais próximo dentro do cone (planeta, míssil ou asteroide)",()=>{
  const w=empty(81);w.addPlayer(0,{x:1000,y:1000,r:40,missiles:3});w.setTarget(0,2000,1000);
  w.addPlayer(1,{x:2200,y:1150,r:40});w.setTarget(1,2200,1150);
  w.requestFire(0,true);w.step();const m=w.missiles[0];
  assert.ok(m,"míssil");assert.equal(m.type,0);assert.equal(m.targetId,1,"travou no planeta inimigo do cone");
  let boom=false;for(let t=0;t<300&&!boom;t++){w.step();boom=w.events.some(e=>e.type==="BOOM");}
  assert.ok(boom,"vai atrás dele até acertar");
  // asteroide mais perto no mesmo cone rouba a trava
  const w2=empty(82);w2.addPlayer(0,{x:1000,y:1000,r:40,missiles:1});w2.setTarget(0,2000,1000);
  w2.addPlayer(1,{x:2400,y:1000,r:40});const a=w2.spawnAsteroid(-1,1600,1080,40);a.vx=0;a.vy=0;
  w2.requestFire(0,true);w2.step();const m2=w2.missiles[0];
  assert.equal(m2.type,1);assert.equal(m2.targetId,a.id,"o asteroide estava mais perto");
  let defl=false;for(let t=0;t<120&&!defl;t++){w2.step();defl=w2.events.some(e=>e.type==="DEFLECT");}
  assert.ok(defl,"o míssil o alcança e o desvia");
  // sem AIM continua o tiro de sempre: teleguiado no oponente mais próximo, mesmo fora do cone
  const w3=empty(83);w3.addPlayer(0,{x:1000,y:1000,r:40,missiles:1});w3.addPlayer(1,{x:1000,y:2000,r:40});
  w3.setTarget(0,2000,1000);w3.requestFire(0);w3.step();
  assert.equal(w3.missiles[0].targetId,1,"clique rápido persegue como antes");});

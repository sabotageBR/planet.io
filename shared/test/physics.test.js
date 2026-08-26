// ── Testes da física compartilhada (node --test) ──
import {test} from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync,statSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
import {performance} from "node:perf_hooks";
import {createWorld,createGrid,createBody,tryMergeOwn,applyEject,stepOwnPieces} from "../src/physics/index.js";
import {createRng} from "../src/rng.js";
import {WORLD,SPLIT,EJECT,PLAYER,BLACKHOLE,ASTEROID,FOOD} from "../src/constants.js";
import {KIND} from "../src/protocol/constants.js";

const SRC=join(dirname(fileURLToPath(import.meta.url)),"..","src");
const empty=(seed=1)=>createWorld({seed,food:0,asteroids:false,holes:0});
const snapshot=w=>JSON.stringify({tick:w.tick,nextId:w.nextId,
  pieces:w.pieces.map(b=>[b.id,b.owner,b.x,b.y,b.vx,b.vy,b.r,b.mergeAt,b.flags]),
  food:w.food.map(b=>[b.id,b.x,b.y,b.type,b.hue]),ejected:w.ejected.map(b=>[b.id,b.x,b.y,b.vx,b.vy,b.life]),
  asteroids:w.asteroids.map(b=>[b.id,b.x,b.y,b.vx,b.vy,b.r,b.type,b.ang]),holes:w.holes.map(b=>[b.id,b.x,b.y,b.k,b.type,b.life,b.ex,b.ey]),
  missiles:w.missiles.map(b=>[b.id,b.x,b.y,b.vx,b.vy,b.targetId]),
  players:[...w.players.values()].map(p=>[p.slot,p.alive,p.score,p.missiles,p.speedUntil,p.magnetUntil,p.shieldUntil])});

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
  const own=w.piecesOf(0).map(p=>({...p})),st={tx:3600,ty:3200,speedUntil:0};
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

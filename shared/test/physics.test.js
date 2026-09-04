// ── Testes da física compartilhada (node --test) ──
import {test} from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync,statSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
import {performance} from "node:perf_hooks";
import {createWorld,createGrid,createBody,setR,addBoost,boostLeft,velX,velY,tryMergeOwn,applyEject,stepOwnPieces,incomingMissile} from "../src/physics/index.js";
import {zoomFor,focusOf,aoiScaleFood,zoomSpan,clampZoom} from "../src/camera.js";
import {vmaxFor} from "../src/physics/integrate.js";
import {createRng} from "../src/rng.js";
import {WORLD,TICK_HZ,CAM,SPLIT,BOOST,BOUNCE,EJECT,ejectR,EJECT_MASS,FRAG,fragR,PLAYER,BLACKHOLE,ASTEROID,FOOD,FOOD_TYPE,isWeaponFood,EAT,SPEED,DT,POWERUP,MERGE,MISSILE,STAR,BOT,ZOOM} from "../src/constants.js";
import {KIND,PIECE_FLAG,FOOD_FLAG,STAR_PHASE,INPUT_FLAG,FRAG_KIND} from "../src/protocol/constants.js";
import {BotBrain} from "../src/bot.js";
import {starShatter,STUCK_STAR,STUCK_ASTEROID} from "../src/physics/rules.js";

const SRC=join(dirname(fileURLToPath(import.meta.url)),"..","src");
const empty=(seed=1)=>createWorld({seed,food:0,asteroids:false,holes:0,stars:0,decay:false});   // laboratório: sem decaimento, que mexeria em toda asserção de massa exata (há teste próprio para ele)
const arma=w=>{for(const ps of w.players.values())ps.fireCdUntil=0;return w;};   // pula a carência de spawn (MISSILE.SPAWN_CD_TICKS) — ela tem teste próprio
const LOCAL_CHIP_MIN=1;   // LOCAL.CHIP_N[0] de rules.js (LOCAL não é exportado por constants.js)
const snapshot=w=>JSON.stringify({tick:w.tick,nextId:w.nextId,
  pieces:w.pieces.map(b=>[b.id,b.owner,b.x,b.y,b.vx,b.vy,b.r,b.mergeAt,b.flags,b.shieldLv,b.magnetUntil]),
  food:w.food.map(b=>[b.id,b.x,b.y,b.type,b.hue]),ejected:w.ejected.map(b=>[b.id,b.x,b.y,b.vx,b.vy,b.life]),
  asteroids:w.asteroids.map(b=>[b.id,b.x,b.y,b.vx,b.vy,b.r,b.type,b.ang]),holes:w.holes.map(b=>[b.id,b.x,b.y,b.k,b.type,b.life]),
  missiles:w.missiles.map(b=>[b.id,b.x,b.y,b.vx,b.vy,b.targetId,b.type]),stars:w.stars.map(b=>[b.id,b.x,b.y,b.vx,b.vy,b.r,b.k,b.type,b.life,b.hits,b.hue]),
  players:[...w.players.values()].map(p=>[p.slot,p.alive,p.score,p.ammo[0]])});

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
      if(t%211===9){arma(w);w.requestFire(script.int(0,5));}
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
  w.setTarget(0,1300,1000);const m1=pc.mass;   // a peça não tem velocidade: o pellet sai à (velocidade padrão + SPEED)
  assert.equal(applyEject(w,ps),1);const e=w.ejected[0];
  assert.ok(Math.abs(pc.mass+e.mass-m1)<1e-9,"massa conservada");
  assert.ok(Math.abs(Math.hypot(e.vx,e.vy)-(vmaxFor(Math.sqrt(m1))+EJECT.SPEED))<1,"pellet a vmax + SPEED, na direção do ponteiro");
  assert.ok(e.vx>0&&Math.abs(e.vy)<1e-6,"para o lado do ponteiro");
  const recuo=boostLeft(pc);assert.ok(pc.vx<0&&Math.abs(recuo-EJECT.RECOIL_DIST*e.mass/pc.mass)<1e-6,`recuo = RECOIL_DIST·(m_pellet/m_peça) px: ${recuo.toFixed(2)}`);});

// 5. sem tunelamento
test("sem tunelamento: peça no impulso máximo nunca sai do mundo; contra asteroide quica ou estoura, nunca termina dentro",()=>{
  const w=empty(5);const pc=w.addPlayer(0,{x:200,y:200,r:30});addBoost(pc,-Math.SQRT1_2,-Math.SQRT1_2,SPLIT.DIST);
  for(let t=0;t<120;t++){w.step();assert.ok(pc.x>=pc.r-1e-9&&pc.x<=w.w-pc.r+1e-9&&pc.y>=pc.r-1e-9&&pc.y<=w.h-pc.r+1e-9,`fora do mundo no tick ${t}`);}
  const w2=empty(6);const small=w2.addPlayer(0,{x:1000,y:1000,r:30});addBoost(small,1,0,SPLIT.DIST);const ast=w2.spawnAsteroid(-1,1300,1000,40);ast.vx=ast.vy=0;
  let bounced=false;
  for(let t=0;t<120;t++){w2.step();if(velX(small)<0)bounced=true;   // velocidade REAL = impulso + direção
    const d=Math.hypot(small.x-ast.x,small.y-ast.y);assert.ok(d>ast.r,`centro da peça dentro do asteroide no tick ${t} (d=${d.toFixed(1)})`);}
  assert.equal(w2.piecesOf(0).filter(p=>!p.dead).length,1,"peça menor não se parte");assert.ok(bounced,"quicou (a velocidade real inverteu em algum momento)");
  assert.equal(w2.asteroids.filter(a=>!a.dead).length,0,"e a rocha EXPLODIU no contato: não fica batendo de novo");
  assert.ok(small.x<ast.x-ast.r,"voltou para o lado de cá: não atravessou");
  assert.ok(Math.hypot(small.x-ast.x,small.y-ast.y)>=(small.r+ast.r)*.99,"terminou fora do asteroide");
  const w3=empty(7);const big=w3.addPlayer(0,{x:1000,y:1000,r:60});addBoost(big,1,0,SPLIT.DIST);w3.setTarget(0,1600,1000);const ast3=w3.spawnAsteroid(-1,1300,1000,40);ast3.vx=ast3.vy=0;
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
  const w3=empty(10);const a=w3.addPlayer(0,{x:1000,y:1000,r:40}),b=w3.addPlayer(1,{x:1070,y:1000,r:38});addBoost(b,-1,0,BOUNCE.DIST_MAX);
  w3.setTarget(0,1000,1000);w3.setTarget(1,1070,1000);   // ponteiro em cima de cada uma: sem o steering elas voltariam a se encostar
  for(let t=0;t<60;t++){w3.step();assert.ok(!w3.events.some(e=>e.type==="EAT"),"tamanhos parecidos nunca engolem");}
  assert.ok(w3.players.get(0).alive&&w3.players.get(1).alive);
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=(a.r+b.r)*.9,"quique separou as peças");});

// 7. buraco negro
test("buraco negro: quem cabe no núcleo é esmagado e vira pellets; quem é maior que a bola passa por cima",()=>{
  const w=empty(11);const h=w.spawnHole({x:2000,y:2000,active:true});const lim=h.r*h.k*BLACKHOLE.CRUSH_K;
  const pc=w.addPlayer(0,{x:2005,y:2000,r:40});pc.cdUntil=0;const m0=pc.mass;w.step();
  const s=w.events.find(e=>e.type==="BH_SUCK");assert.ok(s,"BH_SUCK");assert.equal(s.slot,0);assert.equal(s.pieceId,pc.id);assert.ok(s.destroyed);
  assert.ok(w.events.some(e=>e.type==="PLAYER_DEAD"&&e.slot===0&&e.cause==="blackhole"),"não há mais teleporte: é esmagada");
  assert.equal(w.piecesOf(0).length,0);
  const pel=w.ejected.filter(e=>e.owner===-1);
  assert.equal(pel.length,BLACKHOLE.SPAGHETTI_N,"a massa virou pellets");
  assert.ok(Math.abs(pel.reduce((a,e)=>a+e.mass,0)-m0)<1e-6,"e eles somam EXATAMENTE a massa da peça: nada evapora");
  const big=w.addPlayer(1,{x:2005,y:2000,r:lim+1});big.cdUntil=0;const bm=big.mass;
  for(let t=0;t<60;t++)w.step();
  assert.ok(w.players.get(1).alive&&!big.dead,"maior que rc·CRUSH_K: atravessa o núcleo e nada acontece");
  assert.ok(Math.abs(big.mass-bm)<1e-6,"e não perde massa nenhuma");
  assert.ok(Math.hypot(big.vx,big.vy)>1,"mas a gravidade continua puxando o gigante");});

// 8. predição usa as mesmas funções (peça própria isolada = servidor)
test("predição: stepOwnPieces reproduz o servidor para um jogador isolado",()=>{
  const w=createWorld({seed:12,food:0,asteroids:false,holes:0,stars:0});   // COM decaimento: a paridade tem que guardar o decayPiece do predict.js também
  w.addPlayer(0,{x:3000,y:3000,r:90});w.setTarget(0,3600,3200);w.requestSplit(0);w.step();
  const own=w.piecesOf(0).map(p=>({...p})),st={tx:3600,ty:3200};
  for(let t=0;t<400;t++){if(t===100){w.setTarget(0,2800,3300);st.tx=2800;st.ty=3300;}stepOwnPieces(own,st,w.tick);w.step();}
  const real=w.piecesOf(0);assert.equal(own.length,real.length);
  for(let i=0;i<own.length;i++){assert.ok(Math.abs(own[i].x-real[i].x)<1e-6&&Math.abs(own[i].y-real[i].y)<1e-6,`peça ${i} diverge`);}});

// 8b. predição COM o W segurado: era a maior fonte de erro do jogo
test("predição: com o W segurado a peça própria continua batendo com o servidor (o recuo entrou no stepOwnPieces)",()=>{
  const w=createWorld({seed:12,food:0,asteroids:false,holes:0,stars:0});
  w.addPlayer(0,{x:2000,y:4800,r:220});w.setTarget(0,9000,4800);w.requestSplit(0);w.step();
  const ps=w.players.get(0);w.setEjectHold(0,true);
  const own=w.piecesOf(0).map(p=>({...p})),st={tx:9000,ty:4800};
  const ej={hold:true,req:false,cdUntil:ps.ejectCdUntil,holdAt:ps.ejectHoldAt};   // espelho do PlayerState (o cliente reancora pelo self.ejectCd)
  let pior=0,piorR=0,n=0;
  for(let t=0;t<400;t++){
    stepOwnPieces(own,st,w.tick,undefined,undefined,undefined,null,ej);w.step();
    for(const e of w.ejected)e.dead=true;   // a pelota é entidade do servidor: o cliente não a prevê nem a recolhe
    const real=w.piecesOf(0);assert.equal(own.length,real.length,`contagem divergiu no tick ${t}`);
    for(let i=0;i<own.length;i++){pior=Math.max(pior,Math.hypot(own[i].x-real[i].x,own[i].y-real[i].y));piorR=Math.max(piorR,Math.abs(own[i].r-real[i].r));}
    if(own[0].r<ps.pieces[0].r)n++;}
  assert.ok(pior<1e-6,`posição diverge ${pior.toFixed(3)} px (sem prever o eject dava ~106 px/s de erro)`);
  assert.ok(piorR<1e-6,`raio diverge ${piorR.toExponential(2)}: a massa da pelota também tem que sair na predição`);
  assert.ok(own[0].r<100,`o planeta esvaziou de verdade durante o teste (r final ${own[0].r.toFixed(0)})`);});

// 9. desempenho: sala cheia
// ⚠️ O TETO CONTINUA 1,5 ms COM O MAPA DE 12000, e isso foi MEDIDO, não presumido — mede com a máquina
// QUIETA. Um servidor de dev e um Chrome headless rodando junto multiplicam o número por três e levam a
// afrouxar um teto que não precisava ser afrouxado (aconteceu). Com a bancada limpa:
//     mundo 9600 / 2500 grãos → 0,62 ms   ·   mundo 12000 / 3900 grãos → 0,75 ms
// ou seja **+15% para +56% de área**, com o dobro de folga até o teto. Isolando só a comida no mundo de
// 12000: 2500 → 0,65 · 3200 → 0,65 · 3900 → 0,75 — ela é ~90% das entidades e ainda assim custa pouco,
// porque o que domina o tick é o custo FIXO. Foi ele que o `GRID_CELL` (128 → 160) segurou: a contagem de
// células ficou igual (75×75), então o `cellStart.fill(0)` de DOIS grids e o `forEachPair` sobre
// `cols×rows` — que rodam mesmo com o mapa vazio — não cresceram com o mundo.
test("desempenho: sala cheia (30×16 peças, mundo e população de produção, 120 ejetados) — média ≤ 1.5 ms/passo",t=>{
  const w=createWorld({seed:2024}),script=createRng(5);
  for(let s=0;s<30;s++){w.addPlayer(s,{isBot:s>=5,r:280,missiles:1});w.setTarget(s,script.range(0,WORLD.w),script.range(0,WORLD.h));}
  for(let round=0;round<3;round++){for(let s=0;s<30;s++)w.requestSplit(s);for(let i=0;i<SPLIT.COOLDOWN_TICKS+1;i++)w.step();}
  for(let i=0;i<120;i++){const an=script.angle();w.addEjected(script.range(100,WORLD.w-100),script.range(100,WORLD.h-100),Math.cos(an)*200,Math.sin(an)*200,EJECT.R_MIN,EJECT.R_MIN*EJECT.R_MIN,-1,0,EJECT.LIFE_TICKS);}
  for(const pc of w.pieces)pc.mergeAt=1e9;
  const N=600,times=new Float64Array(N);let maxPieces=0;
  for(let i=0;i<N;i++){if(i%60===0)for(let s=0;s<30;s++)w.setTarget(s,script.range(0,WORLD.w),script.range(0,WORLD.h));
    if(i%120===0)for(let s=0;s<30;s++){if(w.piecesOf(s).length<PLAYER.MAX_PIECES)w.requestSplit(s);}
    if(i%200===50){arma(w);w.requestFire(script.int(0,29));}
    const t0=performance.now();w.step();times[i]=performance.now()-t0;if(w.pieces.length>maxPieces)maxPieces=w.pieces.length;
    for(const e of w.events)if(e.type==="PLAYER_DEAD")w.respawnPlayer(e.slot,{r:280});}
  const sorted=Float64Array.from(times).sort();let sum=0;for(const v of times)sum+=v;const avg=sum/N,p50=sorted[N>>1],p99=sorted[Math.floor(N*.99)],max=sorted[N-1];
  t.diagnostic(`passo: média ${avg.toFixed(3)} ms · p50 ${p50.toFixed(3)} · p99 ${p99.toFixed(3)} · máx ${max.toFixed(3)} · peças máx ${maxPieces} · comida ${w.food.length} · asteroides ${w.asteroids.length} · ejetados ${w.ejected.length}`);
  console.log(`[perf] média ${avg.toFixed(3)} ms · p50 ${p50.toFixed(3)} ms · p99 ${p99.toFixed(3)} ms · máx ${max.toFixed(3)} ms · peças máx ${maxPieces}`);
  assert.ok(maxPieces>=200,`sala deveria ter ≥200 peças (teve ${maxPieces})`);assert.equal(w.food.length,FOOD.COUNT);
  assert.ok(avg<=1.5,`média ${avg.toFixed(3)} ms > 1.5 ms (⚠️ mede com a máquina quieta: dev server e Chrome headless triplicam este número)`);});

// 10. fusão por proximidade
test("fusão: não há atração entre peças próprias (elas se juntam pelo ponteiro) e nenhuma ganha impulso ao fundir",()=>{
  const w=empty(20),a=w.addPlayer(0,{x:1000,y:1000,r:40});w.setTarget(0,1000,1000);const b=w.newPiece(0,1600,1000,40);a.mergeAt=b.mergeAt=0;
  w.step();assert.equal(a.vx,0,"a (no alvo) não é puxada de 600 px");
  assert.equal(b.vx,0,"e b tampouco ganha impulso: no agar não existe atração entre as próprias peças");
  assert.ok(b.x<1600,"b anda para o ponteiro na velocidade padrão, não puxada");
  const w2=empty(21),a2=w2.addPlayer(0,{x:1000,y:1000,r:40});w2.setTarget(0,1000,1000);const b2=w2.newPiece(0,1120,1000,40);a2.mergeAt=b2.mergeAt=0;
  let merged=false;for(let t=0;t<120&&!merged;t++){w2.step();merged=w2.events.some(e=>e.type==="MERGE");}
  assert.ok(merged,"fundem em < 2 s, só com o steering");assert.equal(w2.piecesOf(0).length,1);
  assert.equal(boostLeft(w2.piecesOf(0)[0]),0,"e a peça que fica NÃO sai com embalo (era a atração que dava o impulso)");
  const w3=empty(22),a3=w3.addPlayer(0,{x:1000,y:1000,r:40});w3.setTarget(0,1000,1000);const b3=w3.newPiece(0,1030,1000,40);a3.mergeAt=b3.mergeAt=1e9;
  for(let t=0;t<60;t++){w3.step();assert.ok(!w3.events.some(e=>e.type==="MERGE"));}
  assert.ok(Math.hypot(a3.x-b3.x,a3.y-b3.y)>40,"sem cooldown vencido continuam separadas");});

// 11. escudo por níveis
test("escudo: não expira, evolui sem ser atingido, míssil e tiro tiram um nível, dividir derruba, escudado quica",()=>{
  const w=empty(30),pc=w.addPlayer(0,{x:1000,y:1000,r:40});w.setTarget(0,1000,1000);
  const f=w.spawnFood();f.type=FOOD_TYPE.SHIELD;f.x=1000;f.y=1000;w.moveFood(f);w.step();
  assert.equal(pc.shieldLv,1);assert.ok(w.events.some(e=>e.type==="SHIELD_UP"&&e.level===1&&e.up===true));
  w.step();assert.ok(pc.flags&PIECE_FLAG.SHIELD);assert.equal((pc.flags>>PIECE_FLAG.SHIELD_LV_SHIFT)&3,1);
  let ups=0;for(let t=0;t<POWERUP.SHIELD_EVOLVE_TICKS*2+5;t++){w.step();for(const e of w.events)if(e.type==="SHIELD_UP"){assert.equal(e.up,true,"a evolução por TEMPO sempre sobe");ups++;}}
  assert.equal(pc.shieldLv,POWERUP.SHIELD_MAX_LEVEL);assert.equal(ups,2);
  for(let t=0;t<3000;t++)w.step();assert.equal(pc.shieldLv,POWERUP.SHIELD_MAX_LEVEL,"não expira nem passa do teto");
  assert.equal((pc.flags>>PIECE_FLAG.SHIELD_LV_SHIFT)&3,3);
  const f2=w.spawnFood();f2.type=FOOD_TYPE.SHIELD;f2.x=pc.x;f2.y=pc.y;w.moveFood(f2);w.step();assert.equal(pc.shieldLv,3,"outro 🛡️ no teto: continua 3");
  // ⚠️ o EVENTO continua saindo (é ele que toca o som e desenha o anel, e comer no teto reinicia o timer),
  // mas marcado `up:false` — é o que faz o cliente calar o texto "ESCUDO 3", que ali não diz mais nada
  const noTeto=w.events.filter(e=>e.type==="SHIELD_UP");
  assert.equal(noTeto.length,1,"o 🛡️ no teto continua emitindo o evento");
  assert.equal(noTeto[0].up,false,"mas dizendo que NÃO subiu");
  // míssil inimigo tira um nível, sem tirar massa
  const w3=empty(31),p0=w3.addPlayer(0,{x:1000,y:1000,r:40});w3.setTarget(0,1000,1000);p0.shieldLv=2;p0.shieldEvolveAt=1e9;
  w3.addPlayer(1,{x:1400,y:1000,r:40,missiles:2});w3.setTarget(1,1400,1000);
  arma(w3);w3.requestFire(1);let hit=null;for(let t=0;t<60&&!hit;t++){w3.step();hit=w3.events.find(e=>e.type==="SHIELD_HIT")||null;}
  assert.ok(hit,"SHIELD_HIT");assert.equal(hit.level,1);assert.equal(p0.shieldLv,1);assert.equal(w3.missiles.length,0);assert.equal(p0.r,40,"massa intacta");
  assert.ok(p0.shieldEvolveAt<1e9,"timer de evolução reiniciado");assert.ok(!w3.events.some(e=>e.type==="BOOM"));
  w3.requestFire(1);let brk=null;for(let t=0;t<60&&!brk;t++){w3.step();brk=w3.events.find(e=>e.type==="SHIELD_BREAK")||null;}
  assert.ok(brk&&brk.slot===0&&brk.bySlot===1,"segundo míssil destrói");assert.equal(p0.shieldLv,0);assert.equal(p0.r,40);
  // cada tiro do dono custa UM nível (sem munição não custa nada); dividir derruba o escudo inteiro
  const w4=empty(32),q=w4.addPlayer(0,{x:1000,y:1000,r:90,missiles:0}),ps4=w4.players.get(0);w4.setTarget(0,1500,1000);q.shieldLv=2;q.shieldEvolveAt=1e9;
  arma(w4);w4.requestFire(0);w4.step();assert.equal(q.shieldLv,2,"sem munição não custa escudo");
  ps4.ammo[0]=2;w4.requestFire(0);w4.step();assert.equal(q.shieldLv,1,"1º tiro: −1 nível");assert.ok(w4.events.some(e=>e.type==="SHIELD_HIT"&&e.bySlot===-1));
  w4.requestFire(0);w4.step();assert.equal(q.shieldLv,0,"2º tiro: zera");assert.ok(w4.events.some(e=>e.type==="SHIELD_BREAK"&&e.bySlot===-1));
  q.shieldLv=3;q.shieldEvolveAt=1e9;w4.requestSplit(0);w4.step();assert.equal(q.shieldLv,0,"dividir derruba o escudo da peça inteiro");
  assert.equal(w4.piecesOf(0).length,2);assert.equal(w4.piecesOf(0)[1].shieldLv,0,"a filha nasce sem powerup");
  // ── TIRO DEFENSIVO: sob mira, o gatilho NÃO cobra escudo ──
  // O custo era cobrado antes de o jogo saber que tiro ia sair, então quem estava sob mira pagava duas
  // vezes pelo mesmo míssil: perdia o escudo justo para poder se defender dele.
  // (mundos separados: o 1º tiro de um lado transforma o tiro do outro em interceptação, e aí a montagem
  //  do caso deixaria de ser a que se quer medir)
  const w6=empty(34),d0=w6.addPlayer(0,{x:1000,y:1000,r:40,missiles:3});
  w6.addPlayer(1,{x:1900,y:1000,r:40,missiles:0});
  w6.setTarget(0,1000,1000);w6.setTarget(1,1900,1000);arma(w6);
  d0.shieldLv=3;d0.shieldEvolveAt=1e9;
  w6.requestFire(0);w6.step();
  assert.equal(d0.shieldLv,2,"sem ninguém mirando em mim, atirar continua custando um nível");
  const w6b=empty(36),b0=w6b.addPlayer(0,{x:1000,y:1000,r:40,missiles:3});
  w6b.addPlayer(1,{x:1900,y:1000,r:40,missiles:2});   // 900 px: dentro de INTERCEPT_DIST
  w6b.setTarget(0,1000,1000);w6b.setTarget(1,1900,1000);arma(w6b);
  b0.shieldLv=3;b0.shieldEvolveAt=1e9;
  w6b.requestFire(1);w6b.step();const entrante=w6b.missiles.find(m=>m.owner===1);
  assert.ok(entrante&&entrante.targetId===0,"o inimigo mira em mim");
  w6b.requestFire(0);w6b.step();
  assert.equal(b0.shieldLv,3,"sob mira: o interceptador NÃO cobra escudo");
  const inter=w6b.missiles.find(m=>m.owner===0&&m.type===1);
  assert.ok(inter&&inter.targetId===entrante.id,"e o tiro saiu mesmo, como interceptação");
  // ⚠️ o entrante agora está COBERTO: o próximo tiro vai no atacante (ofensivo) e volta a cobrar — sem
  // isto, bastaria um míssil qualquer por perto para atirar de graça pelo resto da partida
  w6b.requestFire(0);w6b.step();
  assert.equal(b0.shieldLv,2,"entrante já coberto: o tiro é ofensivo e cobra");
  // tiro MIRADO escolhe o alvo pelo cursor (pode ser ofensivo), então cobra mesmo sob mira
  const w7=empty(35),e0=w7.addPlayer(0,{x:1000,y:1000,r:40,missiles:2});
  w7.addPlayer(1,{x:1900,y:1000,r:40,missiles:1});
  w7.setTarget(0,1000,1000);w7.setTarget(1,1900,1000);arma(w7);
  e0.shieldLv=2;e0.shieldEvolveAt=1e9;
  w7.requestFire(1);w7.step();assert.ok(w7.missiles.some(m=>m.owner===1&&m.targetId===0));
  w7.requestFire(0,true);w7.step();
  assert.equal(e0.shieldLv,1,"tiro mirado cobra escudo mesmo sob mira");

  // o escudo NÃO protege de ser comido: ele defende de míssil e de asteroide, e nada mais
  const w5=empty(33),big=w5.addPlayer(0,{x:1000,y:1000,r:60}),small=w5.addPlayer(1,{x:1085,y:1000,r:30});
  small.shieldLv=POWERUP.SHIELD_MAX_LEVEL;small.shieldEvolveAt=1e9;w5.setTarget(1,1085,1000);
  let eat=null;for(let t=0;t<600&&!eat;t++){w5.setTarget(0,small.x,small.y);w5.step();eat=w5.events.find(e=>e.type==="EAT")||null;}
  assert.ok(eat&&eat.killerSlot===0,"o maior come mesmo com o escudo no nível 3");
  assert.ok(!w5.players.get(1).alive,"e o pequeno morre");
  assert.ok(!w5.events.some(e=>e.type==="SHIELD_BREAK"),"o escudo nem entra na conta do engolir");});

// 11b. carência de tiro do spawn
test("carência de tiro: ninguém nasce atirando — MISSILE.SPAWN_CD_TICKS a cada nascimento, e o `self` leva o resto",()=>{
  const w=empty(34),ps=(w.addPlayer(0,{x:1000,y:1000,r:40,missiles:3}),w.players.get(0));
  w.setTarget(0,1000,1000);w.addPlayer(1,{x:2000,y:1000,r:40});
  assert.equal(ps.fireCdUntil,w.tick+MISSILE.SPAWN_CD_TICKS,"a carência começa no nascimento");
  w.requestFire(0);w.step();
  assert.equal(w.missiles.length,0,"na carência não sai tiro");assert.equal(ps.ammo[0],3,"e nem gasta a munição");
  while(w.tick<ps.fireCdUntil)w.step();
  w.requestFire(0);w.step();
  assert.equal(w.missiles.length,1,"passados os 10 s, atira");assert.equal(ps.ammo[0],2);
  // renascer devolve a carência (senão bastava morrer para voltar armado)
  const pc=w.piecesOf(0)[0];w.killPiece(pc,"test",-1);const novo=w.respawnPlayer(0,{x:1000,y:1000,r:40});
  assert.ok(novo&&ps.fireCdUntil===w.tick+MISSILE.SPAWN_CD_TICKS,"renasceu: carência de novo");
  ps.ammo[0]=1;w.requestFire(0);w.step();assert.equal(w.missiles.filter(m=>!m.dead).length,1,"e não atira de novo (o míssil vivo é o de antes)");
  assert.equal(ps.ammo[0],1,"munição intacta");
  // o tamanho NÃO é mais critério: r=START_R atira, desde que a carência tenha passado
  const w2=empty(35),p2=w2.addPlayer(0,{x:1000,y:1000,r:PLAYER.START_R,missiles:1}),ps2=w2.players.get(0);
  w2.setTarget(0,1000,1000);w2.addPlayer(1,{x:3000,y:1000,r:40});ps2.fireCdUntil=0;
  w2.requestFire(0);w2.step();assert.equal(w2.missiles.length,1,"planeta recém-nascido de r=30 atira, passada a carência");
  // e o escudo também não tem piso de tamanho
  const p3=w2.piecesOf(0)[0],f=w2.spawnFood();f.type=FOOD_TYPE.SHIELD;f.x=p3.x;f.y=p3.y;w2.moveFood(f);w2.step();
  assert.equal(p3.shieldLv,1,"qualquer tamanho pega escudo");assert.ok(f.dead);});

// 12. míssil × míssil
test("míssil×míssil: interceptação (type 1 mira o míssil inimigo) e choque varrido destroem os dois (CLASH)",()=>{
  const w=empty(40);w.addPlayer(0,{x:1000,y:1000,r:40,missiles:1});w.addPlayer(1,{x:1800,y:1000,r:40,missiles:1});w.setTarget(0,1000,1000);w.setTarget(1,1800,1000);
  arma(w);w.requestFire(0);w.step();const mA=w.missiles[0];assert.equal(mA.targetId,1);assert.equal(mA.type,0);
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
  // alvo do interceptador some → vai atrás de QUEM ATIROU (antes virava tiro perdido voando reto até expirar)
  const w4=empty(43);w4.addPlayer(0,{x:1000,y:1000,r:40,missiles:1});w4.addPlayer(1,{x:2000,y:1000,r:40,missiles:1});w4.setTarget(0,1000,1000);w4.setTarget(1,2000,1000);
  arma(w4);w4.requestFire(0);w4.step();w4.requestFire(1);w4.step();const i4=w4.missiles[1];
  assert.equal(i4.type,1);assert.equal(i4.srcSlot,0,"guardou o dono do míssil que ia interceptar");
  w4.missiles[0].dead=true;w4.step();w4.step();
  assert.equal(i4.type,0);assert.equal(i4.targetId,0,"órfão re-mira no atacante");assert.ok(!i4.dead);assert.equal(w4.missiles.length,1);});

// 14b. dois tiros contra o MESMO míssil entrante
test("dois tiros no mesmo entrante: o 1º intercepta e o 2º vai no ATACANTE (nenhum vira tiro perdido)",()=>{
  const w=empty(44);w.addPlayer(0,{x:1000,y:1000,r:40,missiles:2});w.addPlayer(1,{x:1900,y:1000,r:40,missiles:1});   // 900 px: dentro de INTERCEPT_DIST
  w.setTarget(0,1000,1000);w.setTarget(1,1900,1000);arma(w);
  w.requestFire(1);w.step();const inimigo=w.missiles[0];
  assert.equal(inimigo.owner,1);assert.equal(inimigo.targetId,0,"o inimigo mira em mim");
  w.requestFire(0);w.step();const m1=w.missiles[1];
  assert.equal(m1.type,1);assert.equal(m1.targetId,inimigo.id,"1º tiro: intercepta de frente");
  w.requestFire(0);w.step();const m2=w.missiles[2];
  assert.equal(m2.type,0);assert.equal(m2.targetId,1,"2º tiro: o entrante já tem interceptador, então vai no atacante");
  // e o predicado cru continua enxergando o entrante (o bot e o alerta não usam a flag)
  assert.equal(incomingMissile(w,0,1000,1000,MISSILE.INTERCEPT_DIST),inimigo,"sem `livres`, o entrante continua contando");
  assert.equal(incomingMissile(w,0,1000,1000,MISSILE.INTERCEPT_DIST,true),null,"com `livres`, ele já está coberto");});

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
  const w=empty(60),me=w.addPlayer(0,{x:1000,y:1000,r:40});me.magnetUntil=0;w.setTarget(0,1000,1000);   // desliga a carga de nascimento para isolar o "sem ímã"
  const f=w.spawnFood();f.type=FOOD_TYPE.DUST;f.x=1200;f.y=1000;w.moveFood(f);
  w.addPlayer(1,{x:3000,y:3000,r:40});const e=w.addEjected(1000,1200,0,0,EJECT.R_MIN,EJECT.R_MIN*EJECT.R_MIN,1,0,EJECT.LIFE_TICKS);
  w.step();assert.equal(f.x,1200,"sem ímã a comida fica");assert.equal(e.vy,0);assert.equal(f.flags&FOOD_FLAG.MOVED,0);
  me.magnetUntil=1e9;w.step();
  assert.ok(f.x<1200&&(f.flags&FOOD_FLAG.MOVED),"comida puxada e marcada MOVED");assert.ok(e.vy<0,"ejetado atraído");
  const x1=f.x;w.step();assert.ok(x1-f.x>1200-x1,"acelera ao se aproximar (sucção)");
  let eaten=false;for(let t=0;t<120&&!eaten;t++){w.step();eaten=w.events.some(ev=>ev.type==="FOOD_EATEN");}assert.ok(eaten,"chega à boca em < 2 s");});

// 15. estrela: estilhaço ao encostar
test("estrela: encostar QUEIMA STAR.BURN da massa e estilhaça o resto, com cooldown; peça pequena só é empurrada",()=>{
  const w=empty(70);const st=w.spawnStar(true);st.x=1000;st.y=1000;
  const pc=w.addPlayer(0,{x:1000+st.r+40,y:1000,r:60}),ps=w.players.get(0);w.setTarget(0,st.x,st.y);
  const m0=pc.mass;let burst=null;for(let t=0;t<180&&!burst;t++){w.step();burst=w.events.find(e=>e.type==="STAR_BURST")||null;}
  assert.ok(burst&&burst.slot===0,"STAR_BURST");
  const parts=w.piecesOf(0).filter(p=>!p.dead);assert.ok(parts.length>=STAR.SHATTER_N[0]+1,"virou vários pedaços");
  const mt=parts.reduce((a,p)=>a+p.mass,0);
  assert.ok(mt<m0,"a estrela DESTRÓI massa (era o buraco do jogo: atropelar estrela saía de graça)");
  assert.ok(Math.abs(mt-m0*(1-STAR.BURN))<1e-6,"queimou exatamente STAR.BURN, e o resto foi repartido");
  assert.equal(w.ejected.filter(e=>!e.dead).length,0,"a massa queimada SOME: não vira fragmento para o dono recolher");
  assert.ok(burst.burn>0&&Math.abs(burst.burn-m0*STAR.BURN)<1e-6,"o evento leva quanto queimou (o FX/som usa isso)");
  assert.ok(parts.every(p=>p.mergeAt>w.tick),"não fundem na hora");
  assert.ok(parts.some(p=>boostLeft(p)>STAR.SHATTER_DIST*.5),"saem voando");
  const n1=parts.length;for(let t=0;t<STAR.SHATTER_CD_TICKS-2;t++)w.step();
  assert.equal(w.events.filter(e=>e.type==="STAR_BURST").length,0,"cooldown segura o segundo estilhaço");
  // peça abaixo de STAR.PASS_R ATRAVESSA: não estilhaça, não é empurrada e — o que faz o esconderijo
  // existir — não detona a estrela. Antes ela era cuspida (PUSH_TOUCH) e matava o abrigo mesmo assim.
  const w2=empty(71),s2=w2.spawnStar(true);s2.x=1000;s2.y=1000;
  const q=w2.addPlayer(0,{x:1000+s2.r+2,y:1000,r:STAR.PASS_R-4});const mq=q.mass;w2.setTarget(0,1000,1000);
  for(let t=0;t<30;t++)w2.step();
  assert.ok(!w2.events.some(e=>e.type==="STAR_BURST"),"pequena não estilhaça");
  assert.equal(boostLeft(q),0,"não foi cuspida para fora: ela ENTRA");
  assert.ok(!w2.events.some(e=>e.type==="SUPERNOVA")&&!s2.dead,"e a estrela continua viva — senão o esconderijo se desfaz no primeiro uso");
  assert.ok(Math.abs(q.mass-mq)<1e-6,"nem queima");
  assert.ok(Math.hypot(q.x-s2.x,q.y-s2.y)<s2.r,"chegou a ficar DENTRO do disco");
  assert.equal(w2.piecesOf(0).length,1);assert.ok(n1>1);
  // e o limiar é de verdade: um fio acima de PASS_R a estrela cobra como sempre
  const w4=empty(75),s4=w4.spawnStar(true);s4.x=1000;s4.y=1000;
  const q4=w4.addPlayer(0,{x:1000+s4.r+2,y:1000,r:STAR.PASS_R+2});w4.setTarget(0,1000,1000);
  let b4=null;for(let t=0;t<30&&!b4;t++){w4.step();b4=w4.events.find(e=>e.type==="STAR_BURST")||null;}
  assert.ok(b4,"acima de PASS_R continua queimando");assert.ok(s4.dead,"e a estrela explode no contato");
  // o escudo NÃO salva da estrela (ele defende só de míssil e asteroide), e encostar faz a estrela EXPLODIR
  const w3=empty(74),s3=w3.spawnStar(true);s3.x=1000;s3.y=1000;
  const p3=w3.addPlayer(0,{x:1000+s3.r+40,y:1000,r:60});p3.shieldLv=2;p3.shieldEvolveAt=1e9;w3.setTarget(0,s3.x,s3.y);
  let nova=null;for(let t=0;t<180&&!nova;t++){w3.step();nova=w3.events.find(e=>e.type==="SUPERNOVA")||null;}
  assert.ok(nova,"encostou: a estrela explode");assert.ok(s3.dead,"e morre");
  assert.equal(p3.shieldLv,2,"o escudo continua de pé: ele não tem nada a ver com estrela");
  assert.ok(w3.events.some(e=>e.type==="STAR_BURST"),"e a peça estilhaça assim mesmo");});

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
  assert.ok(pc.vy>0&&boostLeft(pc)<STAR.PUSH_DIST*1.01,"planeta só empurrado");
  assert.equal(w.piecesOf(0).length,1,"não se parte com a onda");
  assert.equal(w.stars.filter(s=>!s.dead).length,0);assert.equal(w.starQueue.length,1);
  for(let t=0;t<=STAR.RESPAWN_TICKS;t++)w.step();assert.equal(w.stars.length,1,"outra estrela nasce depois");
  // de cinturão vira errante e o cinturão repõe. A estrela fica DENTRO do sopro mas fora do alcance da rocha
  // (350 px para fora do anel: a rocha orbita, e a estrela ainda incha até R·SWELL) — encostando, a trombada
  // meteoro×estrela racharia a estrela antes de ela envelhecer (ver o teste 32).
  const w2=createWorld({seed:73,food:0,holes:0,stars:0});const b=w2.asteroids.find(x=>x.type>=0);
  const bt=w2.belts[b.type],bl=Math.hypot(b.x-bt.cx,b.y-bt.cy)||1;
  const s2=w2.spawnStar(true);s2.x=b.x+(b.x-bt.cx)/bl*350;s2.y=b.y+(b.y-bt.cy)/bl*350;s2.life=w2.tick+1;
  for(let t=0;t<3+STAR.OLD_TICKS;t++)w2.step();
  assert.ok(w2.events.length>=0);assert.equal(b.type,-1,"o de cinturão virou errante");assert.ok(w2.astQueue.length>=1);});

// 17. ímã mais fraco: comida pesada e a estrela vêm devagar
test("ímã: cometa/estrela vêm a MAGNET_HEAVY da poeira e a estrela do mundo se arrasta a MAGNET_STAR",()=>{
  const w=empty(74),me=w.addPlayer(0,{x:1000,y:1000,r:40});w.setTarget(0,1000,1000);me.magnetUntil=1e9;
  const d=w.spawnFood();d.type=FOOD_TYPE.DUST;d.x=1150;d.y=1000;w.moveFood(d);
  const c=w.spawnFood();c.type=FOOD_TYPE.COMET;c.x=1150;c.y=1100;w.moveFood(c);w.step();
  const dd=1150-d.x,dc=1150-c.x;assert.ok(dd>0&&dc>0,"os dois são puxados");
  assert.ok(Math.abs(dc/dd-POWERUP.MAGNET_HEAVY)<.15,"o cometa vem a ~MAGNET_HEAVY da poeira");
  const st=w.spawnStar(true);st.x=1000+40*POWERUP.MAGNET_RANGE-30;st.y=1000;const x0=st.x;w.step();
  assert.ok(st.x<x0,"a estrela se arrasta na direção do planeta");
  assert.ok(x0-st.x<POWERUP.MAGNET_PULL*DT*.5,"bem mais devagar que a comida");});

// 18. asteroide × escudo e tiro mirado
test("asteroide: o escudo paga pela VELOCIDADE da batida (1/2/3 níveis) e rápida demais estoura o planeta; tiro mirado sem nada no cone sai reto",()=>{
  // a rocha custa níveis conforme ASTEROID.SHIELD_VN, e enquanto o escudo aguenta não há lasca nem pop
  const bate=(vRocha,rPc=40,lv=3)=>{const w=empty(750+vRocha);const pc=w.addPlayer(0,{x:1000,y:1000,r:rPc});
    pc.magnetUntil=0;   // a carga de nascimento puxaria a rocha e mudaria a velocidade de impacto
    pc.shieldLv=lv;pc.shieldEvolveAt=1e9;const a=w.spawnAsteroid(-1,1200,1000,60);a.vx=-vRocha;a.vy=0;
    w.setTarget(0,1000,1000);   // parado: a velocidade de aproximação é só a da rocha
    const ev=[];for(let t=0;t<40;t++){w.step();ev.push(...w.events.map(e=>e.type));}
    return{lv:pc.shieldLv,r:pc.r,ev,pecas:w.piecesOf(0).filter(p=>!p.dead).length,impulso:boostLeft(pc)};};
  const devagar=bate(300);assert.equal(devagar.lv,2,"devagar (≥SHIELD_VN[0]): 1 nível");
  const media=bate(600);assert.equal(media.lv,1,"velocidade média (≥SHIELD_VN[1]): 2 níveis");
  const fraca=bate(100);assert.equal(fraca.lv,3,"muito devagar: nem arranha o escudo");
  for(const r of [devagar,media,fraca]){assert.equal(r.r,40,"o escudo absorve: sem lasca");assert.ok(!r.ev.includes("CHIP"));
    assert.equal(r.pecas,1,"e sem estourar: o escudo segura o vírus");}
  // rápida demais: leva o escudo INTEIRO e ainda estoura o planeta (a rocha atravessa como se não houvesse escudo)
  const rapida=bate(1400,90);
  assert.equal(rapida.lv,0,"rápida demais: o escudo inteiro vai embora");
  assert.ok(rapida.ev.includes("POP")&&rapida.pecas>1,`e o planeta estoura assim mesmo (${rapida.pecas} peças)`);
  // com o escudo de pé a batida EMPURRA por pouco tempo e a velocidade volta ao padrão
  const w0=empty(749),p0=w0.addPlayer(0,{x:1000,y:1000,r:40});p0.magnetUntil=0;p0.shieldLv=3;p0.shieldEvolveAt=1e9;
  const a0=w0.spawnAsteroid(-1,1200,1000,60);a0.vx=-300;a0.vy=0;w0.setTarget(0,1000,1000);
  let pico=0,quando=-1;for(let t=0;t<200;t++){w0.step();const b=boostLeft(p0);if(b>pico){pico=b;quando=t;}}
  assert.ok(pico>0&&pico<=BOUNCE.DIST_MAX+1e-6,`o empurrão existe e tem teto: ${pico.toFixed(0)} px`);
  assert.equal(boostLeft(p0),0,"e some sozinho: a velocidade volta ao padrão do jogo");
  const w=empty(75);const pc=w.addPlayer(0,{x:1000,y:1000,r:40});pc.magnetUntil=0;pc.shieldLv=2;pc.shieldEvolveAt=1e9;
  const a=w.spawnAsteroid(-1,1200,1000,60);a.vx=-300;a.vy=0;w.setTarget(0,1000,1000);
  let hit=null;for(let t=0;t<30&&!hit;t++){w.step();hit=w.events.find(e=>e.type==="SHIELD_HIT")||null;}
  assert.ok(hit,"batida emite SHIELD_HIT");assert.equal(pc.shieldLv,1);assert.equal(pc.r,40,"o escudo absorve: sem lasca");
  assert.ok(!w.events.some(e=>e.type==="CHIP"));
  // sem escudo, a mesma batida lasca como antes
  const w2=empty(76);const p2=w2.addPlayer(0,{x:1000,y:1000,r:40});p2.magnetUntil=0;const a2=w2.spawnAsteroid(-1,1200,1000,60);
  a2.vx=-900;a2.vy=0;w2.setTarget(0,1000,1000);let chip=null;for(let t=0;t<30&&!chip;t++){w2.step();chip=w2.events.find(e=>e.type==="CHIP")||null;}
  assert.ok(chip&&p2.r<40,"sem escudo lasca");
  // mira com o cone vazio: o míssil sai reto para o alvo do ponteiro
  const w3=empty(77);w3.addPlayer(0,{x:1000,y:1000,r:40,missiles:1});w3.addPlayer(1,{x:1000,y:2000,r:40});
  arma(w3);w3.setTarget(0,2000,1000);w3.requestFire(0,true);w3.step();
  const m=w3.missiles[0];assert.ok(m,"míssil");assert.equal(m.targetId,-1);assert.ok(m.vx>0&&Math.abs(m.vy)<1e-6,"direção do alvo");
  const vy0=m.vy;for(let t=0;t<30;t++)w3.step();assert.ok(Math.abs(m.vy-vy0)<1e-6,"não curva atrás de ninguém");});

// 19. powerups por peça
test("powerup por peça: só a parte que pegou o 🛡️/🧲 se beneficia; ao fundir fica o melhor das duas",()=>{
  const w=empty(80),a=w.addPlayer(0,{x:1000,y:1000,r:60});a.magnetUntil=0;w.setTarget(0,2000,1000);   // sem a carga de nascimento, "a" fica de fato sem ímã até o teste dar um
  w.requestSplit(0);w.step();const b=w.piecesOf(0).find(p=>p!==a);assert.ok(b,"dividiu em duas");
  for(let t=0;t<25;t++)w.step();assert.ok(b.x-a.x>120,"as partes se afastaram");
  const f=w.spawnFood();f.type=FOOD_TYPE.SHIELD;f.x=b.x;f.y=b.y;w.moveFood(f);w.step();
  assert.equal(b.shieldLv,1,"o escudo é de quem pegou");assert.equal(a.shieldLv,0,"a outra parte não ganha nada");
  w.step();assert.ok(b.flags&PIECE_FLAG.SHIELD,"a flag vai na peça certa");assert.equal(a.flags&PIECE_FLAG.SHIELD,0);
  const g=w.spawnFood();g.type=FOOD_TYPE.MAGNET;g.x=b.x;g.y=b.y;w.moveFood(g);w.step();
  assert.ok(b.magnetUntil>w.tick&&a.magnetUntil<=w.tick,"o ímã também é só dela");
  const dust=w.spawnFood();dust.type=FOOD_TYPE.DUST;dust.x=a.x-a.r*3;dust.y=a.y;w.moveFood(dust);const x0=dust.x;   // do lado de fora, longe do alcance de b
  w.step();assert.equal(dust.x,x0,"a parte sem ímã não puxa comida");
  // ao fundir, a peça que fica leva o melhor poder das duas
  a.shieldLv=1;a.shieldEvolveAt=b.shieldEvolveAt=1e9;const mag=b.magnetUntil;a.mergeAt=b.mergeAt=0;w.setTarget(0,(a.x+b.x)/2,1000);
  let merged=false;for(let t=0;t<600&&!merged;t++){w.step();merged=w.events.some(e=>e.type==="MERGE");}
  assert.ok(merged,"as partes se juntam");const left=w.piecesOf(0).filter(p=>!p.dead);assert.equal(left.length,1);
  assert.equal(left[0].shieldLv,1,"fica o maior escudo das duas");assert.equal(left[0].magnetUntil,mag,"e o ímã da outra parte");});

// 20. mira: trava na bolinha mais próxima do PONTEIRO e troca quando o mouse anda
test("tiro mirado: trava na bolinha mais próxima do ponteiro e TROCA de alvo quando o mouse anda",()=>{
  const w=empty(81);w.addPlayer(0,{x:1000,y:1000,r:40,missiles:2});
  w.addPlayer(1,{x:2200,y:1150,r:40});w.setTarget(1,2200,1150);
  const a=w.spawnAsteroid(-1,1300,1000,40);a.vx=a.vy=0;arma(w);
  // o asteroide está MUITO mais perto de quem atira, mas o cursor está em cima do inimigo: quem manda é o cursor
  w.setTarget(0,2200,1150);w.requestFire(0,true);w.step();
  const m=w.missiles[0];assert.ok(m,"míssil");
  assert.equal(m.type,0);assert.equal(m.targetId,1,"o ponteiro manda, não a distância até a peça");
  // mesmo jogador, mouse do outro lado: o alvo troca sozinho
  w.setTarget(0,a.x,a.y);w.requestFire(0,true);w.step();
  const m2=w.missiles[1];assert.ok(m2,"2º míssil");
  assert.equal(m2.type,1);assert.equal(m2.targetId,a.id,"mexeu o mouse, mudou a bolinha mirada");
  let defl=false;for(let t=0;t<120&&!defl;t++){w.step();defl=w.events.some(e=>e.type==="DEFLECT");}
  assert.ok(defl,"e vai atrás dela até desviá-la");
  // cursor no vazio (nada a menos de AIM_PICK dele): não trava, o míssil sai reto
  const w2=empty(82);w2.addPlayer(0,{x:1000,y:1000,r:40,missiles:1});w2.addPlayer(1,{x:5000,y:5000,r:40});
  arma(w2);w2.setTarget(0,1000+MISSILE.AIM_PICK*2,1000);w2.requestFire(0,true);w2.step();
  assert.equal(w2.missiles[0].targetId,-1,"cursor no vazio: o míssil segue reto");
  // sem AIM continua o tiro de sempre: teleguiado no oponente mais próximo, mesmo longe do ponteiro
  const w3=empty(83);w3.addPlayer(0,{x:1000,y:1000,r:40,missiles:1});w3.addPlayer(1,{x:1000,y:2000,r:40});
  arma(w3);w3.setTarget(0,2000,1000);w3.requestFire(0);w3.step();
  assert.equal(w3.missiles[0].targetId,1,"clique rápido persegue como antes");});

// 21. estrela apanha de míssil/partícula e racha
test("estrela: míssil e partícula empurram; no 3º hit ela EXPLODE e morre (não se multiplica)",()=>{
  const w=empty(84),st=w.spawnStar(true);st.x=3000;st.y=3000;st.life=1e9;st.vx=st.vy=0;
  const shoot=()=>w.addMissile(st.x-st.r-260,st.y,MISSILE.SPEED,0,9,-1);
  const until=(type,n=90)=>{for(let t=0;t<n;t++){w.step();const e=w.events.find(x=>x.type===type);if(e)return e;}return null;};
  shoot();const h1=until("STAR_HIT");
  assert.ok(h1,"STAR_HIT");assert.equal(st.hits,1);assert.ok(st.vx>0,"empurrada na direção do tiro");
  assert.equal(w.missiles.filter(m=>!m.dead).length,0,"o míssil morre no impacto");
  const vx1=st.vx;for(let t=0;t<60;t++)w.step();assert.ok(st.vx<vx1&&st.vx>0,"desliza e freia (STAR.DRAG)");
  // partícula ejetada também empurra e conta hit
  const e=w.addEjected(st.x-st.r-20,st.y,EJECT.SPEED,0,EJECT.R_MIN,EJECT.R_MIN*EJECT.R_MIN,-1,0,600);
  const h2=until("STAR_HIT",20);assert.ok(h2,"partícula conta hit");assert.equal(st.hits,2);assert.ok(e.dead,"a partícula é consumida");
  shoot();const sp=until("SUPERNOVA");
  assert.ok(sp,"no 3º hit ela EXPLODE");assert.ok(st.dead,"e morre");
  assert.equal(w.stars.filter(x=>!x.dead).length,0,"não deixa estrelinhas para trás: nada se multiplica");
  assert.equal(w.starQueue.length,1,"e uma estrela nova entra na fila — a população volta a STAR.COUNT, nunca sobe");});

// 22. split: o arremesso é o BOOST do agar — distância fixa, com freio, e sem tirar o controle
test("split: o filho é arremessado SPLIT.DIST px, o boost SEMPRE chega a zero e o ponteiro nunca perde o controle",()=>{
  const w=empty(86),a=w.addPlayer(0,{x:3000,y:3000,r:120});w.setTarget(0,9000,3000);   // ponteiro na direção do arremesso: o pior caso
  for(let t=0;t<60;t++)w.step();                                                        // já na velocidade padrão
  w.requestSplit(0);const b0=w.piecesOf(0).length;w.step();
  const b=w.piecesOf(0).find(p=>p!==a);assert.ok(b&&w.piecesOf(0).length===b0+1,"dividiu");
  assert.equal(boostLeft(a),0,"quem fica não é empurrado (no agar o split não tem recuo)");
  const bl=boostLeft(b);assert.ok(bl>SPLIT.DIST*.95&&bl<=SPLIT.DIST+1e-6,`o filho sai com SPLIT.DIST de impulso (menos o tick já integrado): ${bl.toFixed(1)}`);
  for(let t=0;t<180;t++)w.step();
  assert.equal(boostLeft(b),0,"em 3 s o arremesso acabou — com o dedo apontado para lá ele NÃO se sustenta");
  const sep=()=>Math.hypot(b.x-a.x,b.y-a.y),s1=sep();
  for(let t=0;t<150;t++)w.step();
  assert.ok(Math.abs(sep()-s1)<b.r,"e daí as duas andam juntas, na mesma velocidade padrão");
  // controle durante o arremesso: o boost é SOMADO ao ponteiro, não o substitui
  const wc=empty(88),m=wc.addPlayer(0,{x:5000,y:5000,r:120});wc.setTarget(0,9000,5000);
  for(let t=0;t<60;t++)wc.step();wc.requestSplit(0);wc.step();
  const f=wc.piecesOf(0).find(p=>p!==m);wc.setTarget(0,5000,9000);   // vira 90° no meio do arremesso
  const y0=f.y;for(let t=0;t<20;t++)wc.step();
  assert.ok(f.y-y0>40,`dá para virar a peça durante o arremesso (andou ${(f.y-y0).toFixed(0)} px no eixo novo)`);
  // a distância do arremesso é ABSOLUTA: 780 px do planeta inteiro à peça já dividida três vezes
  const salto=R=>{const ww=empty(87),mm=ww.addPlayer(0,{x:1200,y:4800,r:R});ww.setTarget(0,9500,4800);
    for(let t=0;t<90;t++)ww.step();
    ww.requestSplit(0);ww.step();const ff=ww.piecesOf(0).find(p=>p!==mm);const d0=ff.x-mm.x;
    for(let t=0;t<400;t++)ww.step();
    return(ff.x-mm.x)-d0;};   // deslocamento EXTRA do filho = o que o boost rendeu
  const saltos=[240,170,120,85,60].map(salto);
  for(const k of saltos)assert.ok(k>SPLIT.DIST*.9&&k<SPLIT.DIST*1.1,`salto fora da faixa: ${k.toFixed(0)} px (${saltos.map(x=>x.toFixed(0)).join(", ")})`);
  assert.ok(Math.max(...saltos)-Math.min(...saltos)<SPLIT.DIST*.1,`e é o mesmo em qualquer tamanho: ${saltos.map(x=>x.toFixed(0)).join(", ")}`);});

// 22b. comer transfere 100% da massa (EAT.GAIN=1) e a peça só para de crescer virando peças novas
test("comer: a massa da vítima entra inteira; passar de MAX_R vira auto-split, nunca teto silencioso",()=>{
  const w=empty(88),A2=w.addPlayer(0,{x:3000,y:3000,r:120}),B2=w.addPlayer(1,{x:3040,y:3000,r:60});
  w.setTarget(0,3040,3000);w.setTarget(1,3040,3000);
  const m0=A2.mass+B2.mass;
  let ate=false;for(let t=0;t<60&&!ate;t++){w.step();ate=w.events.some(e=>e.type==="EAT");}
  assert.ok(ate,"comeu");assert.ok(Math.abs(A2.mass-m0)<1e-6,`massa somada inteira: ${A2.mass.toFixed(1)} vs ${m0.toFixed(1)}`);
  // auto-split: uma peça acima de MAX_R vira n+1 peças abaixo do teto, sem perder massa
  const w2=empty(89),p=w2.addPlayer(0,{x:5000,y:5000,r:PLAYER.MAX_R});w2.setTarget(0,5000,5000);
  setR(p,PLAYER.MAX_R*2);const M=p.mass;w2.step();
  const pcs=w2.piecesOf(0);assert.ok(pcs.length>1,`repartiu (${pcs.length} peças)`);
  assert.ok(pcs.every(x=>x.r<=PLAYER.MAX_R),"toda peça abaixo do teto");
  assert.ok(Math.abs(pcs.reduce((t,x)=>t+x.mass,0)-M)<1e-6,"sem perder massa");
  // Com as MAX_PIECES ocupadas não há para onde repartir: o raio é cortado, mas o excesso é CUSPIDO.
  // ⚠️ Este era o único ponto do jogo, fora do DECAY, em que massa de jogador evaporava — em silêncio.
  const w3=empty(90),q=w3.addPlayer(0,{x:5000,y:5000,r:200});w3.setTarget(0,5000,5000);q.mergeAt=1e9;
  for(let i=1;i<PLAYER.MAX_PIECES;i++){const x=w3.newPiece(0,600+(i%4)*700,600+((i/4)|0)*700,40);x.mergeAt=1e9;}
  assert.equal(w3.piecesOf(0).length,PLAYER.MAX_PIECES,"sem vaga de peça");
  setR(q,PLAYER.MAX_R*1.5);const M3=w3.piecesOf(0).reduce((t,x)=>t+x.mass,0);
  const ej0=w3.ejected.reduce((t,e)=>t+e.mass,0);
  w3.step();
  assert.ok(Math.abs(q.r-PLAYER.MAX_R)<1e-6,`sem vaga, o raio é cortado em MAX_R (ficou ${q.r.toFixed(1)})`);
  const M3b=w3.piecesOf(0).reduce((t,x)=>t+x.mass,0),ej1=w3.ejected.reduce((t,e)=>t+e.mass,0);
  const perdido=M3-M3b-(ej1-ej0);
  assert.ok(Math.abs(perdido)<M3*.004,`o excesso vira fragmento, não evapora (sumiram ${perdido.toFixed(1)} de ${M3.toFixed(0)})`);
  assert.ok(ej1>ej0,"e os fragmentos existem de verdade");});

// 23. buraco negro: puxa de longe, espirala e cospe com impulso
test("buraco negro: puxa desde a borda da influência, espirala e esmaga no núcleo",()=>{
  const w=empty(87),h=w.spawnHole({x:3000,y:3000,active:true});h.k=1;h.seed=.2;
  const ri=h.r*BLACKHOLE.INFLUENCE,pc=w.addPlayer(0,{x:3000+ri*.95,y:3000,r:40});
  pc.cdUntil=0;w.setTarget(0,pc.x,pc.y);w.step();
  assert.ok(pc.vx<-1,"na borda já é puxado para o buraco");
  assert.ok(Math.abs(pc.vy)>Math.abs(pc.vx)*.2,"com parte tangencial: espirala, não cai reto");
  w.setTarget(0,h.x,h.y);   // decidiu entrar (parado na borda o thrust segura a peça a ~200 px do núcleo)
  let suck=null;for(let t=0;t<900&&!suck;t++){w.step();suck=w.events.find(e=>e.type==="BH_SUCK")||null;}
  assert.ok(suck&&suck.destroyed,"chega ao núcleo e é esmagada");
  assert.equal(w.piecesOf(0).length,0,"não sai do outro lado: morre ali");
  // fora da influência nada acontece
  const w2=empty(88),h2=w2.spawnHole({x:3000,y:3000,active:true});h2.k=1;
  const far=w2.addPlayer(0,{x:3000+h2.r*BLACKHOLE.INFLUENCE*1.2,y:3000,r:40});w2.setTarget(0,far.x,far.y);
  for(let t=0;t<60;t++)w2.step();assert.ok(Math.hypot(far.vx,far.vy)<1,"fora do alcance ninguém puxa");});

// 24. predição com buraco negro
test("predição: stepOwnPieces com os buracos do cliente reproduz o servidor perto de um buraco",()=>{
  const w=empty(89),h=w.spawnHole({x:3000,y:3000,active:true});h.k=1;h.seed=.7;
  const R=200;   // planeta grande = lento, e nascendo a meio raio de influência: fica lá tempo suficiente para a gravidade pesar
  const pc=w.addPlayer(0,{x:3000+h.r*BLACKHOLE.INFLUENCE*.5,y:3200,r:R});pc.cdUntil=1e9;   // sem sucção: só a gravidade
  const tx=pc.x+400,ty=pc.y;w.setTarget(0,tx,ty);
  const mine=[createBody(KIND.PIECE,pc.id,pc.x,pc.y,pc.r)];mine[0].owner=0;
  const holes=[{x:h.x,y:h.y,r:h.r,k:h.k,seed:h.seed}];
  for(let t=0;t<120;t++){w.step();holes[0].x=h.x;holes[0].y=h.y;stepOwnPieces(mine,{tx,ty},w.tick,DT,w.w,w.h,holes);}   // o cliente acompanha a deriva do buraco pelos snapshots
  assert.ok(Math.hypot(mine[0].x-pc.x,mine[0].y-pc.y)<1,"posição prevista bate com a do servidor");
  const noHoles=[createBody(KIND.PIECE,pc.id+1,3000+h.r*BLACKHOLE.INFLUENCE*.5,3200,R)];noHoles[0].owner=0;
  const w2=empty(89);const h2=w2.spawnHole({x:3000,y:3000,active:true});h2.k=1;h2.seed=.7;
  const pc2=w2.addPlayer(0,{x:3000+h2.r*BLACKHOLE.INFLUENCE*.5,y:3200,r:R});pc2.cdUntil=1e9;w2.setTarget(0,tx,ty);
  for(let t=0;t<120;t++){w2.step();stepOwnPieces(noHoles,{tx,ty},w2.tick,DT,w2.w,w2.h);}
  assert.ok(Math.hypot(noHoles[0].x-pc2.x,noHoles[0].y-pc2.y)>20,"sem os buracos a predição erraria feio");});

// 25. supernova: o miolo machuca
test("supernova: no miolo estilhaça quem está perto — o escudo não salva (só míssil e asteroide)",()=>{
  const mk=(seed,shield)=>{const w=empty(seed),st=w.spawnStar(true);st.x=3000;st.y=3000;st.life=w.tick+1;
    const pc=w.addPlayer(0,{x:3000,y:3000+STAR.R*STAR.SWELL+120,r:60});w.setTarget(0,pc.x,pc.y);   // parada, dentro do miolo mas sem encostar
    pc.shieldLv=shield;if(shield)pc.shieldEvolveAt=1e9;
    let nova=null;for(let t=0;t<STAR.OLD_TICKS+10&&!nova;t++){w.step();nova=w.events.find(e=>e.type==="SUPERNOVA")||null;}
    assert.ok(nova,"supernova");assert.ok(Math.hypot(pc.x-3000,pc.y-3000)<nova.r*STAR.NOVA_SHATTER,"a peça estava no miolo");
    return w;};
  const wA=mk(92,0);
  assert.ok(wA.piecesOf(0).filter(p=>!p.dead).length>1,"sem escudo: estilhaçou");
  assert.ok(wA.events.some(e=>e.type==="STAR_BURST"),"STAR_BURST");
  const wB=mk(93,2),left=wB.piecesOf(0).filter(p=>!p.dead);
  assert.ok(left.length>1,"com escudo TAMBÉM estilhaça: ele defende só de míssil e asteroide");
  assert.equal(left[0].shieldLv,2,"e o escudo nem é consumido");
  assert.ok(wB.events.some(e=>e.type==="STAR_BURST"),"STAR_BURST");});

// 26. mira em estrela + estrela velha estoura no tiro
test("estrela: o tiro mirado trava nela e, se já está inchando (OLD), a supernova vem na hora",()=>{
  const w=empty(94),st=w.spawnStar(true);st.x=3000;st.y=3000;st.life=w.tick+1;
  w.addPlayer(0,{x:3000-900,y:3000,r:40,missiles:1});w.setTarget(0,3000,3000);
  for(let t=0;t<3;t++)w.step();assert.equal(st.type,STAR_PHASE.OLD,"já está inchando");
  arma(w);w.requestFire(0,true);w.step();
  const m=w.missiles[0];assert.ok(m,"míssil");assert.equal(m.type,1);assert.equal(m.targetId,st.id,"a mira travou na estrela");
  let nova=null;for(let t=0;t<STAR.OLD_TICKS&&!nova;t++){w.step();nova=w.events.find(e=>e.type==="SUPERNOVA")||null;}
  assert.ok(nova,"explodiu ao levar o tiro");
  assert.ok(!w.events.some(e=>e.type==="STAR_SPLIT"),"não racha em estrelinhas: estoura de vez");
  assert.ok(st.dead&&w.tick<STAR.OLD_TICKS,"e bem antes da hora dela");});

// 27. bots: o cérebro compartilhado (servidor e LocalServer usam este)
test("bot: joga sozinho — anda, come, foge do perigo e continua determinístico",()=>{
  const N=8;
  const play=seed=>{const w=createWorld({seed}),rng=createRng(seed*13+1),brains=[];
    const emit=(slot,{tx,ty,flags})=>{w.setTarget(slot,tx,ty);
      if(flags&INPUT_FLAG.SPLIT)w.requestSplit(slot);if(flags&INPUT_FLAG.EJECT)w.requestEject(slot);
      if(flags&INPUT_FLAG.FIRE)w.requestFire(slot,(flags&INPUT_FLAG.AIM)!==0);};
    for(let s=0;s<N;s++){w.addPlayer(s,{r:rng.range(PLAYER.BOT_R[0],PLAYER.BOT_R[1]),isBot:true,missiles:1});brains.push(new BotBrain(w,s,rng,emit));}
    const start=[];for(let s=0;s<N;s++){const p=w.piecesOf(s)[0];start.push({x:p.x,y:p.y,m:p.mass});}
    for(let t=0;t<1800;t++){for(const b of brains)b.act(w.tick);w.step();}
    return{w,brains,start};};
  const {w,brains,start}=play(2100);
  let moved=0,grew=0;
  for(let s=0;s<N;s++){const ps=w.players.get(s);assert.ok(ps,"o bot continua na sala");
    for(const p of ps.pieces){if(p.dead)continue;
      assert.ok(p.x>=0&&p.x<=w.w&&p.y>=0&&p.y<=w.h,"dentro do mundo");
      if(Math.hypot(p.x-start[s].x,p.y-start[s].y)>400)moved++;
      if(p.mass>start[s].m)grew++;}}
  assert.ok(moved>=N/2,`a maioria saiu do lugar (${moved}/${N})`);
  assert.ok(grew>0,"pelo menos um engordou comendo");
  assert.ok(brains.every(b=>BOT.PERSONAS.includes(b.p)),"cada bot tem uma personalidade");
  // dois mundos com a mesma seed jogam a mesma partida (o cérebro não pode ter aleatoriedade fora do rng)
  const A=play(2101),B=play(2101),key=x=>x.w.pieces.map(p=>`${p.owner}:${p.x.toFixed(3)}:${p.y.toFixed(3)}:${p.r.toFixed(3)}`).join("|");
  assert.equal(key(A),key(B),"determinístico");});

// 28. asteroide: bola de sinuca no raspão, vírus no miolo
test("asteroide: rocha de raspão ricocheteia no planeta grande; vindo para o miolo, entra e estoura",()=>{
  const roda=(offY,ticks=240)=>{const w=empty(95),pc=w.addPlayer(0,{x:3000,y:3000,r:90});w.setTarget(0,3000,3000);
    const a=w.spawnAsteroid(-1,3700,3000+offY,32);a.vx=-600;a.vy=0;
    const ev=[];let dentro=0,pico=0;
    for(let t=0;t<ticks;t++){w.step();ev.push(...w.events.map(e=>e.type));pico=Math.max(pico,boostLeft(pc));
      if(!a.dead&&Math.hypot(a.x-pc.x,a.y-pc.y)<pc.r*.8)dentro++;}
    return{w,pc,a,ev,dentro,pico};};
  // raspão: passa a 105 px do centro (dentro do contato, fora da mira do miolo r·POP_DIST≈74)
  const r1=roda(105);
  assert.equal(r1.w.piecesOf(0).filter(p=>!p.dead).length,1,"de raspão o planeta não se parte");
  assert.equal(r1.w.asteroids.filter(a=>!a.dead).length,0,"mas a rocha explodiu no contato (não sobra para bater de novo)");
  assert.equal(r1.dentro,0,"e não atravessa o planeta como antes");
  assert.ok(r1.a.vy>100,`a rocha foi DESVIADA para fora (sinuca de raspão): vy ${r1.a.vy.toFixed(0)} px/s`);
  assert.ok(Math.abs(r1.a.vx)<560,`e perdeu parte do avanço: vx ${r1.a.vx.toFixed(0)} (vinha a -600)`);
  assert.ok(r1.pico>0,"o planeta também sente o impacto (empurrão ponderado pela massa)");
  assert.ok(r1.pico<=BOUNCE.DIST_MAX+1e-6,`e o empurrão tem TETO de ${BOUNCE.DIST_MAX} px: a trombada é curta, não vira embalo (pico ${r1.pico.toFixed(0)})`);
  assert.equal(boostLeft(r1.pc),0,"e no fim não sobra nada: a velocidade voltou a ser a padrão");
  // miolo: mesma rocha, mesma velocidade, mirando o centro → vírus como sempre foi
  const r2=roda(0);
  assert.ok(r2.ev.includes("POP"),"vindo para o miolo, estoura");
  assert.ok(r2.w.piecesOf(0).filter(p=>!p.dead).length>=3,"e parte o planeta em vários pedaços");});

// 29. ímã: puxa a rocha também
test("ímã: asteroide é atraído (rocha pequena mais rápido que a grande); sem ímã não se move",()=>{
  const puxa=(r,magnet)=>{const w=empty(97),pc=w.addPlayer(0,{x:3000,y:3000,r:80});w.setTarget(0,3000,3000);
    pc.magnetUntil=magnet?w.tick+POWERUP.TICKS:0;
    const a=w.spawnAsteroid(-1,3000+pc.r*POWERUP.MAGNET_RANGE*.9,3000,r);a.vx=a.vy=0;   // longe, mas dentro do alcance: não encosta no planeta
    for(let t=0;t<40;t++)w.step();return -a.vx;};   // velocidade adquirida na direção do planeta
  assert.ok(Math.abs(puxa(30,false))<1e-6,"sem ímã a rocha fica parada");
  const pequena=puxa(30,true),grande=puxa(60,true);
  assert.ok(pequena>30,`a rocha pequena vem (${pequena.toFixed(0)} px/s)`);
  assert.ok(grande>0&&grande<pequena*.7,`a grande vem bem mais devagar (${grande.toFixed(0)} vs ${pequena.toFixed(0)} px/s)`);});

// 30. buraco negro: o que ele engole atravessa e a massa cobrada fica na entrada
test("buraco negro: comida engolida é reposta, pellet engolido some, e o esmagado vira pellets fora da influência",()=>{
  const w=empty(98),h=w.spawnHole({x:4000,y:4000,active:true});
  const f=w.spawnFood({x:h.x+20,y:h.y});const antes=w.food.length;
  let crush=null;for(let t=0;t<120&&!crush;t++){w.step();crush=w.events.find(e=>e.type==="FOOD_CRUSH")||null;}
  assert.ok(crush&&f.dead,"a comida foi engolida");
  assert.equal(w.food.length,antes,"a contagem de comida não cai: a reposição a devolve em outro canto do mapa");
  const w2=empty(99),h2=w2.spawnHole({x:4000,y:4000,active:true});
  const pel0=w2.addEjected(h2.x+15,h2.y,0,0,EJECT.R_MIN,EJECT.R_MIN*EJECT.R_MIN,-1,0,EJECT.LIFE_TICKS);
  for(let t=0;t<120&&!pel0.dead;t++)w2.step();
  assert.ok(pel0.dead,"o pellet é engolido (não atravessa mais)");
  assert.equal(w2.ejected.filter(e=>!e.dead).length,0,"e nada sai do outro lado");
  const w3=empty(100),h3=w3.spawnHole({x:4000,y:4000,active:true});
  const pc=w3.addPlayer(0,{x:h3.x-200,y:h3.y,r:90});w3.setTarget(0,h3.x,h3.y);const m0=pc.mass;
  let suck=null;for(let t=0;t<600&&!suck;t++){w3.step();suck=w3.events.find(e=>e.type==="BH_SUCK")||null;}
  assert.ok(suck&&suck.destroyed,"r=90 ainda cabe no buraco (limite rc·CRUSH_K = 91,2): esmagado");
  const pel=w3.ejected.filter(e=>e.owner===-1);
  assert.equal(pel.length,BLACKHOLE.SPAGHETTI_N,"a massa INTEIRA virou pellets");
  assert.ok(Math.abs(pel.reduce((s,e)=>s+e.mass,0)-m0)<1e-6,"e eles somam exatamente a massa que a peça tinha");
  const ri3=h3.r*BLACKHOLE.INFLUENCE*h3.k;
  assert.ok(pel.every(e=>Math.hypot(e.x-h3.x,e.y-h3.y)>ri3),"nascem fora da influência: o buraco não os engole de volta");
  for(let t=0;t<300;t++)w3.step();
  assert.equal(w3.ejected.filter(e=>e.owner===-1).length,BLACKHOLE.SPAGHETTI_N,"e continuam lá 5 s depois, para alguém pegar");});

// 31. supernova: a estrela morta deixa um berçário
test("supernova: além das partículas, semeia um cacho de comida permanente onde a estrela estava",()=>{
  const w=empty(101);const st=w.spawnStar(true);st.x=4000;st.y=4000;st.life=w.tick+1;
  const antes=w.food.length;
  let nova=null;for(let t=0;t<STAR.OLD_TICKS+10&&!nova;t++){w.step();nova=w.events.find(e=>e.type==="SUPERNOVA")||null;}
  assert.ok(nova,"explodiu");
  assert.equal(w.food.length-antes,STAR.NOVA_FOOD,"semeou o cacho");
  const raio=nova.r*STAR.NOVA_FOOD_R*1.1;
  assert.ok(w.food.every(f=>Math.hypot(f.x-4000,f.y-4000)<raio),"tudo dentro do cacho, no lugar da estrela");
  for(let t=0;t<900;t++)w.step();
  assert.equal(w.food.filter(f=>!f.dead).length,STAR.NOVA_FOOD,"comida não expira: o berçário fica");});

// 31b. o berçário é DESTINO DE NASCIMENTO: quem entra no Livre cai onde a estrela acabou de morrer
test("nascimento: o humano nasce no berçário da supernova recente; bot não, e a janela expira",()=>{
  // explode uma estrela num ponto conhecido e mede onde o próximo humano nasce
  const boom=(seed,x,y)=>{const w=empty(seed);const st=w.spawnStar(true);st.x=x;st.y=y;st.life=w.tick+1;
    for(let t=0;t<STAR.OLD_TICKS+10&&!w.novas.length;t++)w.step();
    assert.equal(w.novas.length,1,"a cratera foi registrada");return w;};
  const perto=(pc,x,y)=>Math.hypot(pc.x-x,pc.y-y)<=STAR.NOVA_SPOT_R;

  const w=boom(201,4000,4000);
  const pc=w.addPlayer(1,{isBot:false});
  assert.ok(perto(pc,4000,4000),"o humano nasce dentro do disco da cratera");

  // bot NÃO é atraído: ele limparia o cacho antes de o humano chegar
  const w2=boom(202,4000,4000);
  let fora=0;for(let s=1;s<=12;s++){const b=w2.addPlayer(s,{isBot:true});if(!perto(b,4000,4000))fora++;}
  assert.ok(fora>=10,`bot ignora o berçário (${fora}/12 nasceram fora)`);

  // janela vencida → volta ao sorteio uniforme do mapa inteiro
  const w3=boom(203,4000,4000);
  w3.tick+=STAR.NOVA_SPOT_TICKS+1;
  let longe=0;for(let s=1;s<=12;s++){if(!perto(w3.addPlayer(s,{isBot:false}),4000,4000))longe++;}
  assert.ok(longe>=10,`passada a janela, ninguém é atraído (${longe}/12 fora)`);

  // cratera OCUPADA é recusada: o PLAYER_SAFE do _farSpot continua sendo cobrado
  const w4=boom(204,4000,4000);
  const dono=w4.addPlayer(1,{isBot:false,x:4000,y:4000,r:300});
  assert.ok(dono,"plantou um gordo em cima da cratera");
  const pc4=w4.addPlayer(2,{isBot:false});
  assert.ok(Math.hypot(pc4.x-dono.x,pc4.y-dono.y)>=STAR.NOVA_SPOT_R,"o recém-chegado não nasce em cima dele");

  // supernova de TROMBADA não registra: sem prêmio, a cratera está vazia
  const w5=empty(205);const s5=w5.spawnStar(true);s5.x=3000;s5.y=3000;
  const p5=w5.addPlayer(1,{isBot:false,x:3000-s5.r-40,y:3000,r:120});p5.vx=900;
  for(let t=0;t<120&&!s5.dead;t++)w5.step();
  assert.ok(s5.dead,"a estrela morreu na trombada");
  assert.equal(w5.novas.length,0,"e não virou destino de nascimento");});

// ── 32. meteoro × estrela: os dois se partem em pedaços menores arremessados ──
test("meteoro×estrela: a estrela EXPLODE e morre, a rocha morre junto — nada se multiplica; pedrisco só ricocheteia",()=>{
  const w=empty(120),st=w.spawnStar(true);st.x=3000;st.y=3000;
  const astes0=w.asteroids.filter(x=>!x.dead).length;
  const a=w.spawnAsteroid(-1,3600,3000,50);a.vx=-600;a.vy=0;
  let sm=null;for(let t=0;t<80&&!sm;t++){w.step();sm=w.events.find(e=>e.type==="SMASH")||null;}
  assert.ok(sm&&sm.starId===st.id,"SMASH");
  assert.ok(a.dead,"a rocha morre no estouro");assert.ok(st.dead,"a estrela morre");
  assert.ok(w.events.some(e=>e.type==="SUPERNOVA"),"ela EXPLODE (supernova), não racha");
  assert.equal(w.stars.filter(s=>!s.dead).length,0,"nenhuma estrela filha: a população não sobe");
  assert.equal(w.starQueue.length,1,"e a sala repõe UMA no lugar");
  assert.ok(w.asteroids.filter(x=>!x.dead).length<=astes0,"e a rocha não virou vários cacos");
  // pedrisco: só quica, ninguém se parte
  const w2=empty(121),s2=w2.spawnStar(true);s2.x=3000;s2.y=3000;
  const p=w2.spawnAsteroid(-1,3600,3000,ASTEROID.SMASH_MIN_R-4);p.vx=-600;p.vy=0;
  for(let t=0;t<80;t++)w2.step();
  assert.ok(!w2.events.some(e=>e.type==="SMASH"),"pedrisco não racha");
  assert.ok(!p.dead&&p.vx>0,"ele ricocheteia");assert.equal(w2.stars.filter(x=>!x.dead).length,1,"a estrela continua inteira");
  // estrela ainda nascendo (GROW, k < ARM_K) é inerte
  const w3=empty(122),s3=w3.spawnStar(false);s3.x=3000;s3.y=3000;s3.k=0;
  const q=w3.spawnAsteroid(-1,3000,3000,50);q.vx=q.vy=0;w3.step();
  assert.ok(!w3.events.some(e=>e.type==="SMASH")&&!q.dead,"estrela em GROW não reage");});

// ── 33. estrela nunca nasce em cima de um cinturão (senão o cinturão vira moedor de estrela) ──
test("estrela: nasce fora do anel de todo cinturão (BELT_SAFE)",()=>{
  for(let seed=1;seed<=20;seed++){const w=createWorld({seed,food:0,holes:0});
    for(const st of w.stars)for(const b of w.belts){const d=Math.hypot(st.x-b.cx,st.y-b.cy);
      assert.ok(Math.abs(d-b.rad)>=ASTEROID.BELT_SAFE,`seed ${seed}: estrela a ${Math.abs(d-b.rad).toFixed(0)} px do anel`);}}});

// ── 34. conservação: o que sai do planeta volta inteiro ──
test("massa: cuspir↔reabsorver fecha em zero e o fragmento carrega a massa real (score por √mass)",()=>{
  const w=empty(123),pc=w.addPlayer(0,{x:2000,y:2000,r:80}),ps=w.players.get(0),m0=pc.mass;
  w.setTarget(0,3000,2000);assert.equal(applyEject(w,ps),1);
  const e=w.ejected[0];assert.ok(Math.abs(pc.mass+e.mass-m0)<1e-9,"a pelota leva exatamente o que saiu");
  assert.equal(e.type,FRAG_KIND.PLAIN,"pelota comum");
  let ok=false;for(let t=0;t<600&&!ok;t++){w.setTarget(0,e.x,e.y);w.step();ok=e.dead;}
  assert.ok(ok,"recolhida");assert.ok(Math.abs(pc.mass-m0)<1e-9,`sem perda ao recuperar (${(pc.mass-m0).toFixed(6)})`);
  // fragmento gordo vale mais para QUEM PEGAR do que um comum
  const w2=empty(124),A=w2.addPlayer(0,{x:1000,y:1000,r:40}),B=w2.addPlayer(1,{x:5000,y:5000,r:40}),m=A.mass;
  w2.addEjected(1000,1000,0,0,fragR(4000),4000,-1,0,1800,FRAG_KIND.RICH);
  w2.addEjected(5000,5000,0,0,EJECT.R_MIN,EJECT_MASS,-1,0,900,FRAG_KIND.PLAIN);
  w2.setTarget(0,1000,1000);w2.setTarget(1,5000,5000);w2.step();
  assert.ok(Math.abs(A.mass-m-4000)<1e-9&&Math.abs(B.mass-m-EJECT_MASS)<1e-9,"cada um cresce a massa do seu fragmento");
  assert.ok(A.mass-m>(B.mass-m)*10,"o gordo engorda MUITO mais");});

test("massa: lasca de asteroide e dano de míssil não evaporam massa (e no piso MIN_PIECE_R não criam)",()=>{
  // lasca: a peça não pode estourar a rocha, senão vira pop (que já conservava)
  const w=empty(125),pc=w.addPlayer(0,{x:2000,y:2000,r:86}),m0=pc.mass;
  const a=w.spawnAsteroid(-1,2000+86+80,2000,80);a.vx=-900;a.vy=0;w.setTarget(0,2000,2000);
  let chip=null;for(let t=0;t<40&&!chip;t++){w.step();chip=w.events.find(e=>e.type==="CHIP")||null;}
  assert.ok(chip,"CHIP");
  const frag=w.ejected.filter(e=>!e.dead);assert.ok(frag.length>=LOCAL_CHIP_MIN,"soltou fragmento");
  assert.ok(Math.abs(pc.mass+frag.reduce((s,e)=>s+e.mass,0)-m0)<1e-9,"lasca conserva");
  assert.ok(frag.every(e=>Math.abs(e.r-fragR(e.mass))<1e-9),"o raio visual sai da massa (é ele que diz o valor)");
  // peça no piso: não perde e portanto não cria fragmento nenhum (antes nascia massa do nada)
  const w2=empty(126),q=w2.addPlayer(0,{x:2000,y:2000,r:PLAYER.MIN_PIECE_R});
  const a2=w2.spawnAsteroid(-1,2200,2000,40);a2.vx=-900;a2.vy=0;w2.setTarget(0,2000,2000);
  for(let t=0;t<40;t++)w2.step();
  assert.equal(w2.ejected.length,0,"no piso não sai fragmento");assert.equal(q.r,PLAYER.MIN_PIECE_R);
  // míssil: os HIT_DEBRIS cacos somam exatamente o que foi arrancado
  const w3=empty(127),big=w3.addPlayer(0,{x:2000,y:2000,r:250}),sh=w3.addPlayer(1,{x:2600,y:2000,r:40});
  const ps1=w3.players.get(1);ps1.ammo[0]=1;w3.setTarget(0,2000,2000);w3.setTarget(1,2000,2000);arma(w3);w3.requestFire(1,true);
  const mb=big.mass;let boom=null;for(let t=0;t<200&&!boom;t++){w3.step();boom=w3.events.find(e=>e.type==="BOOM")||null;}
  assert.ok(boom,"BOOM");
  const d=w3.ejected.filter(e=>!e.dead&&e.owner===0);assert.equal(d.length,MISSILE.HIT_DEBRIS,"HIT_DEBRIS cacos");
  const minhas=w3.piecesOf(big.owner).filter(p=>!p.dead).reduce((t,p)=>t+p.mass,0);   // o tiro ESTILHAÇA: a massa fica repartida entre as peças
  assert.ok(Math.abs(minhas+d.reduce((s,e)=>s+e.mass,0)-mb)<1e-6,"míssil conserva");
  assert.ok(d.every(e=>e.type===FRAG_KIND.RICH),"caco de planetão é gordo");
  // ⚠️ E o caco tem que ESCAPAR. O teste acima já existia e passava; o que faltava era este: os cacos
  // nasciam no CENTRO da peça, em todas as direções e com 146 px de alcance — ou seja DENTRO de qualquer
  // planeta com r>146 —, e com 20 ticks de imunidade o dono reengolia tudo 0,33 s depois. A conservação
  // estava certa e o DANO era zero: o míssil emprestava massa em vez de arrancar.
  const dist=d.map(e=>Math.hypot(e.x-big.x,e.y-big.y));
  assert.ok(Math.min(...dist)>=big.r,`o caco nasce FORA da peça (mais perto: ${Math.min(...dist).toFixed(0)} px de r=${big.r.toFixed(0)})`);
  const mis=w3.missiles[0]||boom,lado=d.every(e=>((e.x-big.x)*(big.x-boom.x)+(e.y-big.y)*(big.y-boom.y))>0);
  assert.ok(lado,"e todos saem do lado OPOSTO ao míssil, não de volta para quem atirou");
  assert.ok(d.every(e=>e.cdUntil>w3.tick+EJECT.OWNER_IMMUNE_TICKS),"com imunidade que escala com o raio, não os 20 ticks fixos");});

// ── 35. fragmento de supernova: vale mais e vem marcado para brilhar ──
test("supernova: os fragmentos valem NOVA_PART_MASS pelotas e vêm marcados FRAG_KIND.NOVA",()=>{
  const w=empty(128),st=w.spawnStar(true);st.x=4000;st.y=4000;st.life=w.tick+1;
  let nova=null;for(let t=0;t<STAR.OLD_TICKS+10&&!nova;t++){w.step();nova=w.events.find(e=>e.type==="SUPERNOVA")||null;}
  assert.ok(nova,"SUPERNOVA");
  const f=w.ejected.filter(e=>!e.dead&&e.owner===-1);
  assert.equal(f.length,STAR.NOVA_PARTICLES,"partículas espalhadas");
  assert.ok(f.every(e=>e.type===FRAG_KIND.NOVA),"marcados NOVA (o cliente os desenha brilhando)");
  assert.ok(f.every(e=>Math.abs(e.mass-EJECT_MASS*STAR.NOVA_PART_MASS)<1e-9),"valem NOVA_PART_MASS pelotas comuns");
  assert.ok(f[0].mass>EJECT_MASS&&f[0].r>EJECT.R_MIN,"maiores e mais valiosos que uma pelota comum");
  // e nem o fragmento de supernova escapa do buraco negro: quem cai no núcleo é engolido, não atravessa
  const w2=empty(129),h=w2.spawnHole({x:2000,y:2000,active:true});
  const g=w2.addEjected(2000+h.r*.5,2000,0,0,20,1500,-1,0,900,FRAG_KIND.NOVA);
  for(let t=0;t<120&&!g.dead;t++)w2.step();
  assert.ok(g.dead,"engolido pelo buraco");
  assert.equal(w2.ejected.filter(e=>!e.dead).length,0,"e nada sai do outro lado");});

// 38. câmera: a fórmula do cliente do agar.io
test("câmera: zoom = min(64/ΣR,1)^0.4 × resolução — soma dos raios, potência e mesma área de mundo em qualquer tela",()=>{
  const W=1920,H=1080,z=r=>zoomFor(r,W,H);
  assert.ok(Math.abs(z(PLAYER.START_R)-1)<1e-9,"no raio inicial a escala é 1 (ΣR < CAM.BASE, o min() satura)");
  assert.ok(Math.abs(z(CAM.BASE)-1)<1e-9,"e continua 1 até ΣR = CAM.BASE");
  for(const [r,e] of [[128,Math.pow(.5,.4)],[256,Math.pow(.25,.4)]])
    assert.ok(Math.abs(z(r)-e)<1e-9,`potência .4 em ΣR=${r}`);
  assert.ok(z(100)>z(200)&&z(200)>z(400),"cresceu, afastou");
  assert.ok(z(1000)/z(10000)<3,"lei de potência: 10× de raio afasta menos de 3× (com 1/r seriam 10×)");
  // é a SOMA: 4 peças de 200 afastam mais que uma de 200 (dividir mostra mais mundo, como no agar)
  const {sumR:s1}=focusOf([{x:0,y:0,r:200}]),{sumR:s4}=focusOf([0,1,2,3].map(i=>({x:i*500,y:0,r:200})));
  assert.equal(s4,800);assert.ok(z(s4)<z(s1),"4 peças = mais zoom out que 1");
  // mesma ÁREA de mundo visível em qualquer tela (regra anti-widescreen do agar)
  const area=(w,h)=>{const s=zoomFor(300,w,h);return[w/s,h/s];};
  const [aw,ah]=area(1920,1080),[bw,bh]=area(1280,720),[cw,ch]=area(1080,1920);
  assert.ok(Math.abs(aw-bw)<1e-6&&Math.abs(ah-bh)<1e-6,"tela menor mostra o mesmo mundo");
  assert.ok(Math.abs(ch-ah)<1e-6,"retrato: a MAIOR dimensão da tela mostra o mesmo que a maior da paisagem");
  assert.ok(cw<aw,"e a menor mostra menos — ninguém ganha visão por esticar a janela");
  // a CÂMERA é livre (piso = mostrar o mundo inteiro): o gigante precisa afastar para ver as próprias peças
  const zf=zoomFor(1e6,W,H);
  assert.ok(W/zf<=WORLD.w+1e-6&&H/zf<=WORLD.h+1e-6,"a janela para no mundo inteiro");
  // quem tem teto é a AOI da COMIDA, e só ela: é o que evita mandar o mapa inteiro de comida para um cliente
  assert.ok(aoiScaleFood(zf,W,H)>zf,"no zoom afastado a AOI da comida é MAIS fechada que a câmera");
  assert.ok(W/aoiScaleFood(zf,W,H)<=WORLD.w*CAM.AOI_FOOD_VIEW+1e-6,`a janela da comida para em ${Math.round(CAM.AOI_FOOD_VIEW*100)}% do mundo`);
  const perto=zoomFor(300,W,H);assert.equal(aoiScaleFood(perto,W,H),perto,"e no zoom normal a comida usa a visão de verdade");});

// 38b. zoom MANUAL pela roda: uma faixa em torno do automático, com a largura vindo da MASSA
test("zoom manual: a faixa cresce com a massa, é log-simétrica, engole lixo e nunca fura o piso do mundo",()=>{
  const W=1920,H=1080,ESCADA=[PLAYER.START_R,64,128,300,600,1000,3578,16000,1e6];
  // 1) a faixa é função da massa: o recém-nascido quase não mexe, o planetão mexe muito
  assert.ok(Math.abs(zoomSpan(PLAYER.START_R)-(1+ZOOM.MIN))<1e-9,"abaixo de CAM.BASE a faixa é a mínima (±10%)");
  assert.ok(Math.abs(zoomSpan(CAM.BASE)-(1+ZOOM.MIN))<1e-9,"e continua a mínima até ΣR = CAM.BASE, como o próprio zoomFor");
  for(let i=1;i<ESCADA.length;i++)assert.ok(zoomSpan(ESCADA[i])>=zoomSpan(ESCADA[i-1]),`a faixa não pode encolher quando a massa cresce (ΣR=${ESCADA[i]})`);
  assert.ok(zoomSpan(1e12)<=1+ZOOM.MIN+ZOOM.K+1e-9,"e tem teto");
  // ⚠️ o teto É o POWERUP.ZOOM_K, e isso é o orçamento de AOI: o afastamento máximo da roda é o mesmo
  // afastamento para o qual a área enviada já foi dimensionada e medida. Mexer em ZOOM.K sem saber disso
  // sobe o pico de entidades de toda sala — peça, asteroide, estrela e míssil vêm pela visão INTEIRA.
  assert.ok(Math.abs((1+ZOOM.MIN+ZOOM.K)-POWERUP.ZOOM_K)<1e-9,"o teto da faixa é POWERUP.ZOOM_K — o único afastamento já dimensionado");
  // 2) log-simétrica: o que se pode afastar, pode-se aproximar
  for(const r of ESCADA)assert.ok(Math.abs(zoomSpan(r)*(1/zoomSpan(r))-1)<1e-12,"in = 1/out");
  // 3) ANTI-CHEAT: lixo vira 1. Um NaN escapando daqui viraria um viewRect de NaN — uma AOI que não contém nada.
  for(const lixo of [NaN,0,-1,-Infinity,Infinity,"abc",undefined,null,{},[]])
    assert.equal(clampZoom(lixo,300),1,`clampZoom(${String(lixo)}) tem que virar 1`);
  assert.equal(clampZoom(99,PLAYER.START_R),zoomSpan(PLAYER.START_R),"pedir 99 dá exatamente o batente da faixa, nem um pixel a mais");
  for(const r of ESCADA)for(const f of [.01,.5,1,2,99])
    assert.equal(clampZoom(clampZoom(f,r),r),clampZoom(f,r),"idempotente: é o que autoriza clampar duas vezes (Session e snapshot)");
  // 4) o piso do mundo é intransponível, com qualquer fator
  for(const r of ESCADA)for(const f of [.1,.5,1,2,10]){const z=zoomFor(r,W,H,1,f);
    assert.ok(W/z<=WORLD.w+1e-6&&H/z<=WORLD.h+1e-6,`a janela para no mundo inteiro (ΣR=${r}, manual=${f})`);}
  // 5) ⚠️ APROXIMAR FUNCIONA MESMO NO PISO. É o teste da ordem: o fator da roda vem DEPOIS do piso, e o do
  //    powerup ANTES. Trocar a ordem mata a funcionalidade em silêncio justo para o planetão, que é quem
  //    passa o tempo todo encostado no piso — ele giraria a roda e não aconteceria nada.
  const gigante=16000;
  assert.ok(Math.abs(zoomFor(gigante,W,H)-Math.max(W/WORLD.w,H/WORLD.h))<1e-12,"o gigante já está no piso");
  assert.ok(zoomFor(gigante,W,H,1,1/zoomSpan(gigante))>zoomFor(gigante,W,H),"e ainda assim consegue APROXIMAR");
  assert.equal(zoomFor(gigante,W,H,1,zoomSpan(gigante)),zoomFor(gigante,W,H),"afastar, no piso, não faz nada — já se vê o mundo inteiro");
  // 6) compatível: com manual=1 (e sem o argumento) tudo é bit a bit o que era antes
  for(const r of ESCADA)for(const m of [1,POWERUP.ZOOM_K])
    assert.equal(zoomFor(r,W,H,m),zoomFor(r,W,H,m,1),"o 5º argumento é aditivo");
  // 7) longe do piso os dois fatores multiplicam — o powerup dormente continua compondo
  const g=zoomSpan(300);
  assert.ok(Math.abs(zoomFor(300,W,H,POWERUP.ZOOM_K,g)-zoomFor(300,W,H)/(POWERUP.ZOOM_K*g))<1e-9,"powerup × roda");
  // 8) a AOI da comida acompanha o afastamento — e NÃO encolhe quando o jogador aproxima
  assert.ok(aoiScaleFood(.05,W,H,1,g)<aoiScaleFood(.05,W,H),"afastou: o piso da comida desce junto, senão o anel de fora vem sem um grão");
  assert.equal(aoiScaleFood(.05,W,H,1,1/g),aoiScaleFood(.05,W,H),"aproximou: a AOI NÃO encolhe (a AOI pode sobrar; faltar, nunca)");});

// 39. velocidade padrão: sem inércia, sem embalo de graça
test("velocidade: é SEMPRE a padrão do tamanho — vira na hora, não acelera, não acumula embalo de ninguém",()=>{
  for(const r of [30,60,120,290,1000]){
    const w=empty(200+r),p=w.addPlayer(0,{x:4800,y:4800,r});w.setTarget(0,9500,4800);
    w.step();const x0=p.x;w.step();
    assert.ok(Math.abs((p.x-x0)*TICK_HZ-vmaxFor(r))<1e-6,`r=${r}: anda exatamente vmaxFor(r) no 1º tick (sem rampa de aceleração)`);
    for(let t=0;t<120;t++)w.step();
    const x1=p.x;w.step();
    assert.ok(Math.abs((p.x-x1)*TICK_HZ-vmaxFor(r))<1e-6,`r=${r}: e continua na mesma velocidade em regime`);
    w.setTarget(0,100,4800);const x2=p.x;w.step();
    assert.ok(Math.abs((x2-p.x)*TICK_HZ-vmaxFor(r))<1e-6,`r=${r}: inverter a direção é IMEDIATO — velocidade cheia no sentido contrário já no 1º tick`);
    assert.equal(boostLeft(p),0,`r=${r}: e andar não gera impulso nenhum`);}
  // a rampa dos últimos SPEED.RAMP px evita tremer em cima do ponteiro
  const w=empty(199),p=w.addPlayer(0,{x:1000,y:1000,r:60});w.setTarget(0,1000+SPEED.RAMP/2,1000);
  const x0=p.x;w.step();assert.ok((p.x-x0)*TICK_HZ<vmaxFor(60),"a meio RAMP do alvo já vai mais devagar");
  w.setTarget(0,p.x,p.y);const x1=p.x;for(let t=0;t<10;t++)w.step();
  assert.ok(Math.abs(p.x-x1)<1e-9,"em cima do ponteiro fica PARADA (sem inércia para escorregar)");
  // todo empurrão do jogo entra no canal de impulso e SEMPRE chega a zero
  const w2=empty(198),q=w2.addPlayer(0,{x:4800,y:4800,r:60});
  addBoost(q,1,0,SPLIT.DIST);const d0=q.x;
  let ticks=0;while(boostLeft(q)>0&&ticks<600){w2.setTarget(0,q.x,q.y);w2.step();ticks++;}   // ponteiro colado na peça: isola o canal de impulso do de direção
  assert.ok(ticks<600,`o impulso acaba sozinho (${(ticks/TICK_HZ).toFixed(2)} s)`);
  assert.ok(Math.abs((q.x-d0)-SPLIT.DIST)<SPLIT.DIST*.05,`e rende a distância pedida: ${(q.x-d0).toFixed(0)} de ${SPLIT.DIST} px`);});

// 40. o ímã tem teto de tamanho: planetão não vira aspirador de tela
test("ímã: acima de POWERUP.MAGNET_MAX_R a peça não pega nem usa o ímã",()=>{
  const pega=r=>{const w=empty(300+r),pc=w.addPlayer(0,{x:3000,y:3000,r});w.setTarget(0,3000,3000);
    const f=w.spawnFood();f.type=FOOD_TYPE.MAGNET;f.x=3000;f.y=3000;w.moveFood(f);const m0=pc.mass;w.step();w.step();   // 2 passos: o flag é escrito na integração do tick seguinte ao que comeu
    return{ativo:pc.magnetUntil>w.tick,flag:!!(pc.flags&PIECE_FLAG.MAGNET),ganhou:pc.mass-m0};};
  const pequeno=pega(POWERUP.MAGNET_MAX_R-40);
  assert.ok(pequeno.ativo&&pequeno.flag,"abaixo do teto o ímã liga normalmente");
  const grande=pega(POWERUP.MAGNET_MAX_R+40);
  assert.ok(!grande.ativo,"acima do teto a peça come o powerup mas NÃO ganha o ímã");
  assert.ok(!grande.flag,"e o HUD não mostra ímã ligado");
  assert.ok(grande.ganhou>0,"mas o grão vira COMIDA: sumir sem dar nada é o pior jeito de um powerup falhar");
  // quem já tinha o ímã e cresceu além do teto para de sugar
  const w=empty(299),pc=w.addPlayer(0,{x:3000,y:3000,r:POWERUP.MAGNET_MAX_R-20});w.setTarget(0,3000,3000);
  pc.magnetUntil=w.tick+POWERUP.TICKS;
  // dentro do alcance EFETIVO, que tem teto absoluto (MAGNET_RANGE_MAX) além do r·MAGNET_RANGE
  const alcance=Math.min(pc.r*POWERUP.MAGNET_RANGE,POWERUP.MAGNET_RANGE_MAX);
  const longe=w.spawnFood({x:3000+alcance*.8,y:3000});longe.type=FOOD_TYPE.DUST;   // nasceu já na posição: a grade o inseriu no spawn
  const x0=longe.x;w.step();assert.ok(longe.x<x0,"no tamanho certo, o ímã puxa a comida");
  setR(pc,POWERUP.MAGNET_MAX_R+60);const x1=longe.x;
  for(let t=0;t<10;t++)w.step();
  assert.ok(Math.abs(longe.x-x1)<1e-9,"depois de crescer além do teto, para de puxar");
  // e o ALCANCE tem teto ABSOLUTO: é ele, e não mais o teto de tamanho, que impede o aspirador de tela
  const w2=empty(298),p2=w2.addPlayer(0,{x:3000,y:3000,r:POWERUP.MAGNET_MAX_R-20});w2.setTarget(0,3000,3000);
  p2.magnetUntil=w2.tick+POWERUP.TICKS;
  assert.ok(p2.r*POWERUP.MAGNET_RANGE>POWERUP.MAGNET_RANGE_MAX,"neste raio o r·RANGE já passaria do teto");
  const fora=w2.spawnFood({x:3000+POWERUP.MAGNET_RANGE_MAX+80,y:3000});fora.type=FOOD_TYPE.DUST;
  const xf=fora.x;for(let t=0;t<10;t++)w2.step();
  assert.ok(Math.abs(fora.x-xf)<1e-9,"comida além de MAGNET_RANGE_MAX não é puxada, por maior que seja o planeta");});

// 41. decaimento: o gigante murcha se parar de comer; o pequeno não sente
test("decaimento: massa ×(1−PLAYER.DECAY) por segundo, com piso em START_R — é o que tira a imortalidade do gigante",()=>{
  const roda=(r0,segs)=>{const w=createWorld({seed:400,food:0,asteroids:false,holes:0,stars:0});
    const p=w.addPlayer(0,{x:4800,y:4800,r:r0});w.setTarget(0,4800,4800);
    for(let t=0;t<segs*TICK_HZ;t++)w.step();return p;};
  const gigante=roda(1000,60),esperado=1e6*Math.pow(1-PLAYER.DECAY/TICK_HZ,60*TICK_HZ);
  assert.ok(Math.abs(gigante.mass-esperado)/esperado<.01,`o gigante murcha: ${Math.round(gigante.mass).toLocaleString("pt-BR")} (esperado ~${Math.round(esperado).toLocaleString("pt-BR")})`);
  assert.ok(gigante.mass<1e6*.9,"em 1 minuto já perdeu mais de 10%");
  const pequeno=roda(PLAYER.START_R,60);
  assert.equal(pequeno.r,PLAYER.START_R,"quem está no tamanho de nascença não murcha (piso em START_R)");
  const medio=roda(PLAYER.START_R+2,600);
  assert.ok(Math.abs(medio.r-PLAYER.START_R)<1e-6,"e o piso segura: por mais que passe o tempo, ninguém some");
  // a taxa é RELATIVA: em 1 s o gigante perde ~1000× mais massa que a peça pequena
  const perde=r0=>{const a=roda(r0,0),m0=a.mass;const w=createWorld({seed:401,food:0,asteroids:false,holes:0,stars:0});
    const p=w.addPlayer(0,{x:4800,y:4800,r:r0});w.setTarget(0,4800,4800);const mi=p.mass;
    for(let t=0;t<TICK_HZ;t++)w.step();return mi-p.mass;};
  const g=perde(1000),q=perde(40);
  assert.ok(g>1500&&g<2500,`o gigante perde ~2.000 de massa por segundo (perdeu ${Math.round(g)})`);
  assert.ok(q<10,`e a peça pequena quase nada (perdeu ${q.toFixed(1)})`);});

// 42. o tiro parte o alvo (arma anti-gigante) e a rocha explode ao encostar
test("tiro: além de tirar massa, ESTILHAÇA a peça; e a rocha sempre explode no contato",()=>{
  const w=empty(402),alvo=w.addPlayer(0,{x:3000,y:3000,r:200});w.setTarget(0,3000,3000);
  const atirador=w.addPlayer(1,{x:3600,y:3000,r:40,missiles:3});w.setTarget(1,3000,3000);
  const m0=alvo.mass;
  arma(w);w.requestFire(1);let boom=null;for(let t=0;t<90&&!boom;t++){w.step();boom=w.events.find(e=>e.type==="BOOM")||null;}
  assert.ok(boom,"o míssil acerta");
  const pcs=w.piecesOf(0).filter(p=>!p.dead);
  assert.ok(pcs.length>1,`o tiro PARTE o alvo em vários (ficaram ${pcs.length} peças)`);
  assert.ok(pcs.length<=MISSILE.SHATTER_N[1]+1,"dentro de MISSILE.SHATTER_N");
  const total=pcs.reduce((t,p)=>t+p.mass,0),cacos=w.ejected.filter(e=>e.owner===0&&!e.dead).reduce((t,e)=>t+e.mass,0);
  assert.ok(Math.abs(total+cacos-m0)<1e-6,"e nada evapora: o que saiu virou caco comível");
  assert.ok(total<m0,"o alvo perdeu massa de verdade");});

// 43. cuspir (W): pelota proporcional ao planeta, com teto de população, e custa massa de verdade
test("eject: a pelota é proporcional a quem cospe, segurar o W esvazia o planeta e a população tem teto",()=>{
  // o raio da pelota acompanha o do planeta, com piso e teto
  const pelota=r=>{const w=empty(500+r),p=w.addPlayer(0,{x:3000,y:3000,r});w.setTarget(0,9000,3000);
    const ps=w.players.get(0);assert.equal(applyEject(w,ps),1);const e=w.ejected[w.ejected.length-1];
    return{r:e.r,mass:e.mass};};
  assert.ok(Math.abs(pelota(EJECT.MIN_R).r-EJECT.R_MIN)<1e-6,"no menor planeta que pode cuspir, a pelota é a mínima");
  assert.ok(Math.abs(pelota(300).r-300*EJECT.R_K)<1e-6,"no meio, é R_K do raio do planeta");
  assert.equal(pelota(2000).r,EJECT.R_MAX,"e satura em R_MAX (a pelota não pode virar um planeta)");
  assert.ok(pelota(300).mass>pelota(120).mass*4,"planeta maior cospe pelota MUITO mais valiosa (massa vai com r²)");
  // segurar o W esvazia de verdade — com raio fixo um planetão perdia 0,7% em 10 s
  const w=empty(501),p=w.addPlayer(0,{x:1000,y:4800,r:600});p.r=600;p.mass=360000;
  const ps=w.players.get(0);w.setTarget(0,9000,4800);const m0=p.mass;
  let n=0;for(let t=0;t<600;t++){ps.ejectHold=true;w.step();n+=w.events.filter(e=>e.type==="EJECT").length;}
  assert.ok(n>=80,`cospe sem parar enquanto segura (${n} em 10 s)`);
  assert.ok(p.mass<m0*.3,`e o planeta esvazia de verdade: ${Math.round(m0)} → ${Math.round(p.mass)}`);
  // teto de população: nenhuma rajada pode encher o mundo de pelotas
  const w2=empty(502);for(let i=0;i<EJECT.MAX+200;i++)w2.addEjected(3000+i%50,3000,0,0,9,105,-1,0,EJECT.LIFE_TICKS);
  assert.ok(w2.ejected.filter(e=>!e.dead).length<=EJECT.MAX,`a lista para em EJECT.MAX (${EJECT.MAX})`);});

// 33. cuspir: a força cresce com o hold
test("cuspir: a força SOBE enquanto o W está segurado, satura em RAMP_N e zera na pausa",()=>{
  const w=empty(90);w.addPlayer(0,{x:4000,y:4000,r:220});const ps=w.players.get(0);w.setTarget(0,9000,4000);
  const vel=[],seen=new Set();
  const colher=()=>{for(const e of w.ejected)if(!e.dead&&!seen.has(e.id)){seen.add(e.id);vel.push(Math.hypot(e.vx,e.vy));}};
  w.setEjectHold(0,true);
  for(let t=0;t<EJECT.HOLD_TICKS*(EJECT.RAMP_N+2);t++){w.step();colher();}
  assert.ok(vel.length>=EJECT.RAMP_N,`saíram cusparadas bastantes para a rampa saturar (${vel.length})`);
  assert.equal(ps.ejectRamp,EJECT.RAMP_N,"a rampa satura em RAMP_N e não passa disso");
  const v0=vel[0],vN=vel[vel.length-1];
  assert.ok(vN>v0*1.5,`a última sai MUITO mais forte que a primeira (${v0.toFixed(0)} → ${vN.toFixed(0)} px/s) — antes eram idênticas`);
  // alcance: o ejetado integra com arrasto puro, então distância = v/DRAG. É isso que desfaz o amontoado.
  assert.ok((vN-v0)/EJECT.DRAG>300,"a diferença de alcance entre a 1ª e a última passa de 300 px");
  // soltar o W zera a força
  w.setEjectHold(0,false);assert.equal(ps.ejectRamp,0,"soltou o W: a força recomeça do início");
  for(let t=0;t<EJECT.COOLDOWN_TICKS+1;t++)w.step();
  w.requestEject(0);w.step();colher();
  assert.ok(vel[vel.length-1]<vN*.75,"e o toque avulso depois da pausa sai fraco de novo");});

// 34. estrela: quem trombou não leva o prêmio da supernova
test("estrela: a supernova de quem TROMBOU não larga prêmio (nem fragmento nem berçário)",()=>{
  // morte natural (fim da fase OLD): prêmio completo, como sempre
  const w=empty(91),st=w.spawnStar(true);st.x=3000;st.y=3000;st.life=w.tick+2;
  for(let t=0;t<600&&!st.dead;t++)w.step();
  assert.ok(st.dead,"a estrela morreu de velha");
  assert.equal(w.ejected.filter(e=>!e.dead).length,STAR.NOVA_PARTICLES,"prêmio completo: os fragmentos brilhantes caem");
  assert.equal(w.food.filter(f=>!f.dead).length,STAR.NOVA_FOOD,"e o berçário fica no lugar da estrela");
  // trombada de planeta: a MESMA explosão, sem prêmio nenhum
  const w2=empty(92),s2=w2.spawnStar(true);s2.x=3000;s2.y=3000;s2.life=1e9;
  w2.addPlayer(0,{x:3000+s2.r+40,y:3000,r:80});w2.setTarget(0,s2.x,s2.y);
  let nova=null;for(let t=0;t<180&&!nova;t++){w2.step();nova=w2.events.find(e=>e.type==="SUPERNOVA")||null;}
  assert.ok(nova&&s2.dead,"trombou: a estrela explodiu e morreu igual");
  assert.equal(w2.ejected.filter(e=>!e.dead).length,0,"mas quem pagou a queimadura NÃO leva os fragmentos");
  assert.equal(w2.food.filter(f=>!f.dead).length,0,"nem o berçário — senão atropelar volta a compensar");});

// 35. alerta: o predicado de "míssil vindo em mim" é um só
test("incomingMissile: pega só o teleguiado inimigo que está MIRANDO em mim e se APROXIMANDO",()=>{
  const w=empty(93);w.addPlayer(0,{x:3000,y:3000,r:40});w.addPlayer(1,{x:6000,y:3000,r:40});
  const vindo=w.addMissile(4200,3000,-MISSILE.SPEED,0,1,0);         // do inimigo, mirando em mim, se aproximando
  const indo=w.addMissile(4400,3000,MISSILE.SPEED,0,1,0);            // mirando em mim, mas se afastando
  const outro=w.addMissile(3300,3000,-MISSILE.SPEED,0,1,1);          // perto, mas mirando em OUTRO slot
  const meu=w.addMissile(3200,3000,-MISSILE.SPEED,0,0,0);            // meu próprio míssil
  outro.type=meu.type=indo.type=vindo.type=0;
  assert.equal(incomingMissile(w,0,3000,3000,MISSILE.ALERT_DIST),vindo,"só o que vem em cima de mim conta");
  assert.equal(incomingMissile(w,0,3000,3000,900),null,"e só dentro do alcance pedido");
  vindo.dead=true;
  assert.equal(incomingMissile(w,0,3000,3000,MISSILE.ALERT_DIST),null,"morreu, acabou o alerta");});

// ── OS QUATRO POWERUPS DE JOGADOR (FOOD_TYPE 11..14) ─────────────────────────
test("powerups de jogador: auto-defesa, +1 munição, zoom e comida em dobro",()=>{
  // helper: põe uma comida do tipo pedido em cima da peça e roda um passo
  const pega=(w,pc,type)=>{const f=w.spawnFood();f.type=type;f.x=pc.x;f.y=pc.y;f.r=FOOD.SPECIAL_R;w.moveFood(f);w.step();};

  // 1) AMMO_PLUS FURA o teto da arma — é a feature inteira, e é o que o separa da munição comum
  const w1=empty(60),p1=w1.addPlayer(0,{x:1000,y:1000,r:40,missiles:MISSILE.MAX_AMMO}),ps1=w1.players.get(0);
  w1.setTarget(0,1000,1000);
  pega(w1,p1,FOOD_TYPE.AMMO);
  assert.equal(ps1.ammo[0],MISSILE.MAX_AMMO,"munição comum respeita o teto");
  pega(w1,p1,FOOD_TYPE.AMMO_PLUS);
  assert.equal(ps1.ammo[0],MISSILE.MAX_AMMO+1,"o raro passa por cima do teto");

  // 2) FEAST dobra a COMIDA — e só ela: fragmento continua devolvendo o que saiu (conservação de massa)
  const w2=empty(61),p2=w2.addPlayer(0,{x:1000,y:1000,r:40}),ps2=w2.players.get(0);
  w2.setTarget(0,1000,1000);
  const grao=()=>{const f=w2.spawnFood();f.type=FOOD_TYPE.DUST;f.r=10;f.mass=100;f.x=p2.x;f.y=p2.y;w2.moveFood(f);
    const antes=p2.mass;w2.step();return p2.mass-antes;};
  const normal=grao();
  pega(w2,p2,FOOD_TYPE.FEAST);
  assert.ok(ps2.feastUntil>w2.tick,"o powerup ficou ativo");
  const dobro=grao();
  assert.ok(Math.abs(dobro-normal*POWERUP.FEAST_K)<1e-6,`comida em dobro: ${dobro} ≠ ${normal}×${POWERUP.FEAST_K}`);

  // 3) ZOOM: é o `zoomFor` que muda, e ele alimenta TAMBÉM a AOI do servidor — por isso o teste é sobre a
  //    função, não sobre a câmera do cliente. Escala menor = mais mundo na tela.
  const z1=zoomFor(300,1920,1080),z2=zoomFor(300,1920,1080,POWERUP.ZOOM_K);
  assert.ok(Math.abs(z2-z1/POWERUP.ZOOM_K)<1e-9,"o powerup divide a escala");
  assert.ok(zoomFor(1e9,1920,1080,POWERUP.ZOOM_K)>=Math.max(1920/WORLD.w,1080/WORLD.h),"e nunca fura o piso de mostrar o mundo inteiro");
  // o piso da comida tem que acompanhar, senão o anel de fora do zoom vem sem um grão sequer
  assert.ok(aoiScaleFood(.05,1920,1080,POWERUP.ZOOM_K)<aoiScaleFood(.05,1920,1080),"o piso da AOI de comida também afasta");

  // 4) AUTO-DEFESA: com um teleguiado vindo em cima, o gatilho é puxado sozinho — gastando munição
  const w4=empty(62),d0=w4.addPlayer(0,{x:1000,y:1000,r:40,missiles:2}),ps4=w4.players.get(0);
  w4.addPlayer(1,{x:1900,y:1000,r:40,missiles:1});
  w4.setTarget(0,1000,1000);w4.setTarget(1,1900,1000);arma(w4);
  pega(w4,d0,FOOD_TYPE.AUTODEF);
  assert.equal(ps4.autoDefN,1,"powerup na mão: UMA carga");
  const antesAmmo=ps4.ammo[0];
  for(let t=0;t<30;t++)w4.step();
  assert.equal(ps4.ammo[0],antesAmmo,"sem entrante, ninguém atira sozinho");
  w4.requestFire(1);w4.step();
  assert.ok(w4.missiles.some(m=>m.owner===1&&m.targetId===0),"o inimigo mirou em mim");
  let meu=null;for(let t=0;t<POWERUP.AUTODEF_SCAN_TICKS*3&&!meu;t++){w4.step();meu=w4.missiles.find(m=>m.owner===0)||null;}
  assert.ok(meu,"a auto-defesa puxou o gatilho");
  assert.equal(meu.type,1,"e o tiro saiu como INTERCEPTAÇÃO");
  assert.equal(ps4.ammo[0],antesAmmo-1,"gastou munição do cinto (é o tiro do jogador, adiantado)");
  assert.equal(ps4.autoDefN,0,"usou, perdeu: a carga é gasta no tiro que saiu");
  assert.equal(d0.shieldLv,0);
  // pegar de novo ACUMULA, até AUTODEF_MAX: travar em 1 fazia o segundo grão não valer nada — o jogador ia
  // buscar, encostava e o número continuava "1x", que é um powerup que não faz nada ao ser pego.
  for(let i=0;i<POWERUP.AUTODEF_MAX+2;i++)pega(w4,d0,FOOD_TYPE.AUTODEF);
  assert.equal(ps4.autoDefN,POWERUP.AUTODEF_MAX,"a carga acumula, e para no teto");

  // 5) sem o powerup, nada disso acontece
  const w5=empty(63),e0=w5.addPlayer(0,{x:1000,y:1000,r:40,missiles:2}),ps5=w5.players.get(0);
  w5.addPlayer(1,{x:1900,y:1000,r:40,missiles:1});
  w5.setTarget(0,1000,1000);w5.setTarget(1,1900,1000);arma(w5);
  w5.requestFire(1);w5.step();
  for(let t=0;t<60;t++)w5.step();
  assert.equal(ps5.ammo[0],2,"sem auto-defesa o jogador não atira sozinho");

  // 6) o powerup morre com o jogador: renascer não pode devolver o que era da vida anterior
  const w6=empty(64),f0=w6.addPlayer(0,{x:1000,y:1000,r:40}),ps6=w6.players.get(0);
  w6.setTarget(0,1000,1000);
  pega(w6,f0,FOOD_TYPE.ZOOM);pega(w6,f0,FOOD_TYPE.FEAST);
  assert.ok(ps6.zoomUntil>w6.tick&&ps6.feastUntil>w6.tick);
  w6.respawnPlayer(0,{r:PLAYER.START_R});
  assert.equal(ps6.zoomUntil,0,"vida nova, zoom zerado");
  assert.equal(ps6.feastUntil,0,"vida nova, banquete zerado");
  assert.equal(ps6.autoDefN,0,"vida nova, auto-defesa zerada");});

// ── FAIXAS DO ENUM DE COMIDA ─────────────────────────────────────────────────
// Três testes de faixa dependem da ORDEM do FOOD_TYPE, e um deles (`é arma`) deixou de poder ser um `>=`
// quando os powerups de jogador entraram depois das armas. Aqui é onde isso fica travado.
test("comida: as faixas do enum continuam valendo (base, especial, arma)",()=>{
  for(let t=FOOD_TYPE.DUST;t<=FOOD_TYPE.ROCK;t++)assert.ok(!isWeaponFood(t),`${t} é comida base, não arma`);
  for(const t of [FOOD_TYPE.W_BURST,FOOD_TYPE.W_CLUSTER,FOOD_TYPE.W_NOVA])assert.ok(isWeaponFood(t),`${t} é arma`);
  for(const t of [FOOD_TYPE.AUTODEF,FOOD_TYPE.AMMO_PLUS,FOOD_TYPE.ZOOM,FOOD_TYPE.FEAST]){
    assert.ok(!isWeaponFood(t),`${t} é powerup, NÃO arma — com um \`>=W_BURST\` ele viraria um no-op silencioso`);
    assert.ok(t>=FOOD_TYPE.AMMO,`${t} tem que continuar do lado "especial" da faixa (o atlas do cliente usa isso)`);
    assert.ok(t>FOOD_TYPE.ROCK,`${t} não pode ser reescrito como comida base`);}
  assert.equal(FOOD.TYPES.length,Object.keys(FOOD_TYPE).length,"FOOD.TYPES e FOOD_TYPE têm que andar juntos");});

// ── O PREÇO QUE NÃO CABE EM PEÇAS ────────────────────────────────────────────
// Os jogadores descobriram que, dividido nas 16 peças, dá para atravessar estrela e cinturão quase de
// graça: o estilhaço não acontece por falta de vaga, e isso falhava em SILÊNCIO (`shatterPiece` devolvia
// um `false` que ninguém lia). Pior no asteroide, onde a lasca comum é reembolso: 4% que voltam como
// fragmento do próprio dono, nascido ATRÁS dele — o lado para onde o quique já o empurra — a 97 px.
// Agora o preço vira massa, cada perigo na moeda dele, e sempre com evento na tela.
const enche=(w,slot,x,y,n=PLAYER.MAX_PIECES)=>{for(let i=1;i<n;i++){const q=w.newPiece(slot,x+400+(i%4)*260,y+400+((i/4)|0)*260,PLAYER.MIN_PIECE_R+2);q.mergeAt=1e9;}};
/** Junta os eventos de N passos: `w.events` é esvaziado a cada `step`. */
const roda=(w,n,filtro=()=>true)=>{const out=[];for(let t=0;t<n;t++){w.step();for(const e of w.events)if(filtro(e))out.push(e);}return out;};

test("estrela com as 16 peças ocupadas: queima BURN_STUCK em vez de BURN, e avisa (STUCK)",()=>{
  // Direto na regra, e não por uma colisão de verdade: o contato com a estrela dispara a supernova, que
  // estilhaça TODAS as peças no miolo no mesmo tick — o cenário "com vaga" enche sozinho e os dois casos
  // ficariam indistinguíveis. O que está sob teste aqui é a decisão, não o caminho até ela.
  const monta=lotado=>{const w=empty(701),pc=w.addPlayer(0,{x:4000,y:4000,r:120});w.setTarget(0,4000,4000);pc.mergeAt=1e9;
    if(lotado)enche(w,0,4000,4000);
    const st=w.spawnStar(true,{x:4200,y:4000});st.k=1;const ps=w.players.get(0),m0=pc.mass;
    starShatter(w,ps,pc,st,1,0);
    // a queimadura vem do EVENTO: `pc.mass` depois disso já passou pelo estilhaço, que reparte o que sobrou
    const burst=w.events.find(e=>e.type==="STAR_BURST");
    return{m0,queimado:burst?burst.burn:0,stuck:w.events.find(e=>e.type==="STUCK")||null,
      pecas:w.piecesOf(0).filter(p=>!p.dead).length};};
  const livre=monta(false),cheio=monta(true);
  assert.ok(livre.pecas>1,"com vaga a estrela ESTILHAÇA");
  assert.equal(cheio.pecas,PLAYER.MAX_PIECES,"sem vaga não há como estilhaçar");
  assert.ok(Math.abs(livre.queimado-livre.m0*STAR.BURN)<1e-6,"com vaga, a queimadura é a de sempre");
  assert.ok(Math.abs(cheio.queimado-cheio.m0*STAR.BURN_STUCK)<1e-6,
    `sem vaga ela cobra a outra metade em massa: ${cheio.queimado.toFixed(0)} contra ${livre.queimado.toFixed(0)}`);
  assert.ok(cheio.stuck&&cheio.stuck.cause===STUCK_STAR,"com aviso na tela — o silêncio era o bug");
  assert.ok(!livre.stuck,"e sem aviso quando o preço foi pago em pedaços, como sempre");});

test("asteroide com as 16 peças ocupadas: atravessar CUSTA, e a massa não volta de graça",()=>{
  const monta=lotado=>{
    const w=empty(702),pc=w.addPlayer(0,{x:4000,y:4000,r:150});w.setTarget(0,4000,4000);pc.mergeAt=1e9;
    if(lotado)enche(w,0,4000,4000);
    const a=w.spawnAsteroid(-1,4000+320,4000,ASTEROID.R_MIN);a.vx=-1200;a.vy=0;
    const m0=pc.mass,ev=roda(w,40,e=>e.type==="STUCK"||e.type==="POP"||e.type==="CHIP");
    return{perdeu:m0-pc.mass,m0,cacos:w.ejected.filter(e=>!e.dead&&e.owner===0),
      stuck:ev.find(e=>e.type==="STUCK")||null,pecas:w.piecesOf(0).filter(p=>!p.dead).length,pc};};
  const livre=monta(false),cheio=monta(true);
  assert.ok(livre.pecas>1,"com vaga a rocha ESTOURA a peça");
  assert.equal(cheio.pecas,PLAYER.MAX_PIECES,"sem vaga não há como estourar");
  assert.ok(cheio.perdeu>cheio.m0*ASTEROID.CHIP*1.5,
    `e passar por cima deixou de custar a lasca de 4%: perdeu ${(cheio.perdeu/cheio.m0*100).toFixed(0)}%`);
  assert.ok(cheio.stuck&&cheio.stuck.cause===STUCK_ASTEROID,"com aviso na tela");
  assert.ok(cheio.cacos.length>0,"a massa vira fragmento (nada evapora)");
  const perto=cheio.cacos.map(e=>Math.hypot(e.x-cheio.pc.x,e.y-cheio.pc.y));
  assert.ok(Math.min(...perto)>=cheio.pc.r*.9,`e nasce fora da peça, não dentro dela (${Math.min(...perto).toFixed(0)} px de r=${cheio.pc.r.toFixed(0)})`);
  assert.ok(cheio.cacos.every(e=>e.cdUntil>EJECT.OWNER_IMMUNE_TICKS),"com imunidade do dono, e ela escala com o raio");});

test("+1 munição: EMPRESTA uma bala acima do teto, e só uma",()=>{
  const w=empty(703),pc=w.addPlayer(0,{x:3000,y:3000,r:40,missiles:0});w.setTarget(0,3000,3000);
  const ps=w.players.get(0);
  const pega=type=>{const f=w.spawnFood();f.type=type;f.x=pc.x;f.y=pc.y;f.r=FOOD.SPECIAL_R;w.moveFood(f);w.step();};
  for(let i=0;i<MISSILE.MAX_AMMO+3;i++)pega(FOOD_TYPE.AMMO);
  assert.equal(ps.ammo[0],MISSILE.MAX_AMMO,"a munição comum para no teto da arma");
  for(let i=0;i<6;i++)pega(FOOD_TYPE.AMMO_PLUS);
  assert.equal(ps.ammo[0],MISSILE.MAX_AMMO+MISSILE.AMMO_OVER,
    "o powerup empresta UMA bala acima do teto — nunca as 9 que apareceram em produção");
  arma(w);w.requestFire(0);w.step();
  assert.equal(ps.ammo[0],MISSILE.MAX_AMMO,"gastou o empréstimo: o teto normal volta a valer");
  pega(FOOD_TYPE.AMMO);
  assert.equal(ps.ammo[0],MISSILE.MAX_AMMO,"e munição comum não recupera a quarta bala");});

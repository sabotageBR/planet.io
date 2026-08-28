// ── Testes dos modos: zona que encolhe, equipes e armas (node --test) ─────────
// A zona e o "aliado" são regras de FÍSICA (não do bot nem do servidor), então é aqui que elas se provam.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createWorld,stepOwnPieces} from "../src/physics/index.js";
import {sameTeam,zoneBurn,outOfZone,zoneMass,applyFire,ammoOf,ownedMask} from "../src/physics/rules.js";
import {createZone,stepZone,zoneAt,zoneR} from "../src/zone.js";
import {createRng} from "../src/rng.js";
import {WORLD,ZONE,PLAYER,DT,EJECT,MISSILE,WEAPON,WEAPONS,FOOD_TYPE,MODE,MODES,modeOf,modeCap,BR,BOT_NAMES,botNick,weaponOf,weaponOfFood} from "../src/constants.js";
import {KIND} from "../src/protocol/constants.js";

const empty=(seed=1,o={})=>createWorld({seed,food:0,asteroids:false,holes:0,stars:0,decay:false,...o});
const arma=w=>{for(const ps of w.players.values())ps.fireCdUntil=0;return w;};   // chamar SEMPRE depois dos addPlayer: é _spawnPiece que arma a carência
const massa=(w,slot)=>Math.round(w.massOf(slot)*1e6)/1e6;

// ── 1. modos ────────────────────────────────────────────────────────────────
test("MODES: o Livre é o jogo de sempre e id inválido cai nele",()=>{
  const free=modeOf(MODE.FREE);
  assert.equal(free.key,"free");assert.equal(free.respawnBots,true);assert.equal(free.lastAlive,false);
  assert.equal(free.zone,false);assert.equal(free.weapons,false);assert.equal(free.lobby,false);assert.equal(free.anonBots,false);
  assert.equal(modeOf(99).key,"free","modo desconhecido (cliente antigo) NUNCA cai num modo estranho");
  assert.equal(modeOf(undefined).key,"free");
  const br=modeOf(MODE.BR);
  assert.equal(br.lastAlive,true);assert.equal(br.respawnBots,false);assert.equal(br.zone,true);
  assert.equal(br.lobby,true,"o battle royale entra por um LOBBY, não direto no mapa");
  assert.equal(br.anonBots,true,"e o preenchimento não se identifica como bot");
  assert.deepEqual(br.teamSizes,BR.TEAM_SIZES);});
test("botNick: apelidos de gente, sem repetir, e cabendo no limite de nick",()=>{
  const rng=createRng(7),usados=new Set(),nomes=[];
  for(let i=0;i<BR.PLAYERS;i++)nomes.push(botNick(rng,usados));
  assert.equal(new Set(nomes.map(n=>n.toLowerCase())).size,BR.PLAYERS,"50 nomes sem repetição");
  for(const n of nomes){assert.ok(n.length>=2&&n.length<=16,`nick fora de 2..16: ${n}`);
    assert.ok(!BOT_NAMES.includes(n),`${n} é da lista TEMÁTICA — essa denuncia o bot no battle royale`);}
  // um nick já em uso na sala nunca é reaproveitado (o humano chega antes e reserva o dele)
  const u2=new Set(["lucas"]),n2=[];const r2=createRng(3);
  for(let i=0;i<60;i++)n2.push(botNick(r2,u2));
  assert.ok(!n2.some(n=>n.toLowerCase()==="lucas"),"não repete o nick de quem já está na sala");});
test("modeCap: a capacidade fecha no tamanho de equipe (equipe incompleta não entra em campo)",()=>{
  assert.equal(modeCap(MODE.BR,1),50);assert.equal(modeCap(MODE.BR,2),50);
  assert.equal(modeCap(MODE.BR,3),48);assert.equal(modeCap(MODE.BR,4),48);
  for(const t of BR.TEAM_SIZES)assert.equal(modeCap(MODE.BR,t)%t,0,`cap divisível por ${t}`);
  assert.equal(modeCap(MODE.BR,0),modeOf(MODE.BR).max,"teamSize 0 não divide por zero");});

// ── 2. zona ─────────────────────────────────────────────────────────────────
test("zona: a máquina fecha em 21 300 ticks e o círculo novo SEMPRE cabe dentro do anterior",()=>{
  const total=ZONE.HOLD_TICKS.reduce((a,b)=>a+b,0)+ZONE.SHRINK_TICKS.reduce((a,b)=>a+b,0);
  assert.equal(total,21300);
  assert.equal(ZONE.R.length,ZONE.STAGES+1,"um raio por etapa mais o final");
  for(let i=1;i<ZONE.R.length;i++)assert.ok(ZONE.R[i]<ZONE.R[i-1],`R[${i}] menor que o anterior`);
  for(const seed of [1,7,42,999,123456]){
    const rng=createRng(seed);let z=createZone(0),ant=null,viradas=0;
    for(let t=0;t<total+600;t++){
      const ev=stepZone(z,t,rng);const c=zoneAt(z,t);
      if(ev){viradas++;
        if(ant){const d=Math.hypot(c.x-ant.x,c.y-ant.y);
          assert.ok(d+c.r<=ant.r+1e-6,`seed ${seed} t=${t}: o círculo novo saiu do anterior (${d.toFixed(1)}+${c.r.toFixed(1)} > ${ant.r.toFixed(1)})`);}
        ant={x:c.x,y:c.y,r:c.r};}}
    assert.equal(z.done,true,`seed ${seed}: a zona tem que terminar`);
    assert.equal(viradas,ZONE.STAGES*2-1,"uma virada por hold e uma por shrink (o último hold vira o `done`)");
    const fim=zoneAt(z,total+600);
    assert.ok(Math.abs(fim.r-zoneR(ZONE.STAGES))<1e-6,"para no menor raio");
    assert.ok(fim.x>=fim.r-1e-6&&fim.x<=WORLD.w-fim.r+1e-6,"o miolo final fica DENTRO da arena");
    assert.ok(fim.y>=fim.r-1e-6&&fim.y<=WORLD.h-fim.r+1e-6);}});
test("zona: determinística — mesma seed, mesma sequência de círculos",()=>{
  const roda=()=>{const rng=createRng(2024),z=createZone(0),out=[];
    for(let t=0;t<22000;t++){if(stepZone(z,t,rng)){const c=zoneAt(z,t);out.push([t,c.x,c.y,c.r]);}}return JSON.stringify(out);};
  assert.equal(roda(),roda());});
test("zona: fora dela a peça queima e MORRE no piso (~21 s a partir de START_R)",()=>{
  const w=empty(3);w.addPlayer(0,{x:1000,y:1000});
  w.setZone({x0:8000,y0:8000,r0:500,x1:8000,y1:8000,r1:500,t0:0,t1:Infinity});
  const pc=w.piecesOf(0)[0];assert.ok(outOfZone(pc,w.zoneNow()),"a peça está fora");
  let t=0;const ps=w.players.get(0);
  while(ps.alive&&t<60*60){w.setTarget(0,pc.x,pc.y);w.step();t++;}
  assert.equal(ps.alive,false,"a zona mata sozinha — é o que fecha a partida");
  const s=t/60;assert.ok(s>15&&s<30,`morreu em ${s.toFixed(1)} s (esperado ~21 s: tempo de correr, não de acampar)`);
  const dead=w.events.find(e=>e.type==="PLAYER_DEAD");
  assert.ok(dead&&dead.cause==="zone","a morte tem que sair com cause 'zone'");});
test("zona: DENTRO dela ninguém queima, e a queimadura não mexe em quem está no piso",()=>{
  const w=empty(4);w.addPlayer(0,{x:4800,y:4800});
  w.setZone({x0:4800,y0:4800,r0:2000,x1:4800,y1:2000,r1:2000,t0:0,t1:600});
  const m0=massa(w,0);for(let i=0;i<300;i++){w.setTarget(0,4800,4800);w.step();}
  assert.equal(massa(w,0),m0,"dentro do círculo a massa não se mexe (sem decaimento neste mundo)");
  const zc=w.zoneNow();assert.ok(zc.y<4800&&zc.y>2000,"o círculo está interpolando para o destino");});
test("zona: a predição do cliente usa a MESMA conta do servidor (paridade 1e-9)",()=>{
  const w=createWorld({seed:5,food:0,asteroids:false,holes:0,stars:0});
  w.addPlayer(0,{x:1000,y:1000,r:200});
  w.setZone({x0:8000,y0:8000,r0:400,x1:8000,y1:8000,r1:400,t0:0,t1:Infinity});
  const pc=w.piecesOf(0)[0];
  const espelho=[{...pc}],st={tx:1000,ty:1000};
  for(let i=0;i<120;i++){w.setTarget(0,1000,1000);w.step();
    stepOwnPieces(espelho,st,w.tick-1,DT,w.w,w.h,null,null,w.zoneNow());}
  assert.ok(Math.abs(espelho[0].mass-pc.mass)<1e-9,`massa divergiu: ${espelho[0].mass} vs ${pc.mass}`);
  assert.ok(Math.abs(espelho[0].r-pc.r)<1e-9,"o RAIO é o que aparece na tela: divergir aqui faz a peça pulsar na borda");});
test("zona: o gás ARRANCA pelotas da peça, para FORA, e a transferência é exata",()=>{
  const w=empty(31);w.addPlayer(0,{x:1000,y:1000,r:150});
  w.setZone({x0:8000,y0:8000,r0:500,x1:8000,y1:8000,r1:500,t0:0,t1:Infinity});
  const pc=w.piecesOf(0)[0],cx=8000,cy=8000;
  // `pc.shed` é a massa EM TRÂNSITO: já saiu da peça (a conta é contínua, para a predição do cliente
  // espelhá-la) e ainda não virou pelota. Contá-la é o que prova que nada evapora pelo caminho.
  const total=()=>massa(w,0)+pc.shed+w.ejected.reduce((a,e)=>a+(e.dead?0:e.mass),0);
  const antes=total();
  // janela curta: dentro da vida da pelota, nada expira, então o que sai da peça tem que estar no chão
  for(let i=0;i<180;i++){w.setTarget(0,1000,1000);w.step();}
  const pelotas=w.ejected.filter(e=>!e.dead);
  assert.ok(pelotas.length>=4,`o gás tem que soltar pelotas (soltou ${pelotas.length})`);
  assert.ok(massa(w,0)<antes,"e a peça encolheu");
  assert.ok(Math.abs(total()-antes)<1e-6,`transferência exata: ${total()} vs ${antes}`);
  // saem para LONGE do centro da zona: recuperá-las custa entrar mais fundo no gás
  const dPeca=Math.hypot(pc.x-cx,pc.y-cy);
  const maisLonge=pelotas.filter(e=>Math.hypot(e.x-cx,e.y-cy)>dPeca).length;
  assert.ok(maisLonge>=pelotas.length*.7,`a maioria tem que sair para fora (${maisLonge}/${pelotas.length})`);
  for(const e of pelotas)assert.equal(e.owner,0,"a pelota é minha: dá para voltar e pegar, pagando o preço");});
test("zona: quem morre no gás larga TUDO ali, sem dono",()=>{
  const w=empty(32);w.addPlayer(0,{x:1000,y:1000});
  w.setZone({x0:8000,y0:8000,r0:400,x1:8000,y1:8000,r1:400,t0:0,t1:Infinity});
  const ps=w.players.get(0);let t=0;
  while(ps.alive&&t<60*60){w.setTarget(0,1000,1000);w.step();t++;}
  assert.equal(ps.alive,false);
  const perto=w.ejected.filter(e=>!e.dead&&Math.hypot(e.x-1000,e.y-1000)<900);
  assert.ok(perto.length>=4,`o espólio fica onde ele caiu (${perto.length} pelotas)`);
  const semDono=perto.filter(e=>e.owner===-1);
  assert.ok(semDono.length>=ZONE.SHED_N_DEATH,`a morte larga ${ZONE.SHED_N_DEATH} pelotas SEM DONO — quem chegar primeiro leva (achei ${semDono.length})`);});
test("zona: a cadência de desprendimento respeita o teto de população dos ejetados",()=>{
  const w=empty(33);
  for(let i=0;i<12;i++)w.addPlayer(i,{x:900+i*30,y:900,r:180});   // 12 planetões queimando ao mesmo tempo
  w.setZone({x0:8000,y0:8000,r0:400,x1:8000,y1:8000,r1:400,t0:0,t1:Infinity});
  let pico=0;
  for(let i=0;i<600;i++){for(let s=0;s<12;s++)w.setTarget(s,900,900);w.step();
    pico=Math.max(pico,w.ejected.filter(e=>!e.dead).length);}
  assert.ok(pico<=EJECT.MAX,`a população de ejetados não pode estourar o teto (pico ${pico} de ${EJECT.MAX})`);
  assert.ok(pico>20,`mas tem que soltar de verdade (pico ${pico})`);});
test("zoneMass/outOfZone: o critério é o CENTRO da peça dentro do círculo",()=>{
  const zc={x:0,y:0,r:100};
  assert.equal(outOfZone({x:99,y:0},zc),false);assert.equal(outOfZone({x:101,y:0},zc),true);
  assert.equal(outOfZone({x:0,y:0},zc),false);
  assert.ok(zoneMass(1000,DT)<1000&&zoneMass(1000,DT)>=999,"um tick queima pouco (0,1%); o que mata é a insistência");});

// ── 3. equipes ──────────────────────────────────────────────────────────────
test("sameTeam: sem equipe ninguém é aliado; no aquecimento todo mundo é",()=>{
  const w=empty(6);w.addPlayer(0);w.addPlayer(1);
  assert.equal(sameTeam(w,0,1),false,"modo Livre: team -1 dos dois lados NÃO faz aliança");
  assert.equal(sameTeam(w,0,0),true,"o próprio dono é sempre 'aliado'");
  assert.equal(sameTeam(w,-1,-1),false,"míssil sem dono não é aliado de ninguém");
  w.players.get(0).team=2;w.players.get(1).team=2;assert.equal(sameTeam(w,0,1),true);
  w.players.get(1).team=3;assert.equal(sameTeam(w,0,1),false);
  w.peace=true;assert.equal(sameTeam(w,0,1),true,"aquecimento: a espera não precisa de regra própria");
  w.peace=false;assert.equal(sameTeam(w,0,1),false);});
test("aliado NÃO come aliado, por maior que seja — e inimigo do mesmo tamanho come",()=>{
  const monta=team=>{const w=empty(7);
    w.addPlayer(0,{x:4000,y:4000,r:200,team});w.addPlayer(1,{x:4120,y:4000,r:30,team});
    for(let i=0;i<20;i++){w.setTarget(0,4000,4000);w.setTarget(1,4000,4000);w.step();}
    return w;};
  const aliados=monta(1);
  assert.equal(aliados.players.get(1).alive,true,"o companheiro pequeno tem que sobreviver colado no gigante");
  const inimigos=monta(-1);
  assert.equal(inimigos.players.get(1).alive,false,"sem equipe, o gigante come normalmente");});
test("aliados se separam sem quique: nada de empurrão de graça entre companheiros",()=>{
  const w=empty(8);
  w.addPlayer(0,{x:4000,y:4000,r:60,team:1});w.addPlayer(1,{x:4050,y:4000,r:60,team:1});
  const a=w.piecesOf(0)[0],b=w.piecesOf(1)[0];
  for(let i=0;i<5;i++){w.setTarget(0,4000,4000);w.setTarget(1,4050,4000);w.step();}
  assert.equal(a.vx,0);assert.equal(a.vy,0);assert.equal(b.vx,0);assert.equal(b.vy,0);
  assert.ok(Math.hypot(b.x-a.x,b.y-a.y)>50,"a separação posicional continua acontecendo");});
test("míssil não fere aliado, não trava nele e não é interceptado por companheiro",()=>{
  const w=empty(9);
  w.addPlayer(0,{x:3000,y:4000,r:60,team:1,missiles:3});w.addPlayer(1,{x:3400,y:4000,r:60,team:1,missiles:3});
  w.addPlayer(2,{x:6000,y:4000,r:60,team:2,missiles:3});arma(w);
  const alvo=w.piecesOf(1)[0],m0=alvo.mass;
  w.setTarget(0,3400,4000);w.requestFire(0,true);   // mira NO companheiro
  for(let i=0;i<120;i++){w.setTarget(0,3400,4000);w.setTarget(1,3400,4000);w.setTarget(2,6000,4000);w.step();}
  assert.equal(alvo.mass,m0,"o tiro mirado não pode arrancar massa do companheiro");
  assert.equal(w.players.get(1).alive,true);});
test("partículas: a cusparada vai direto para o companheiro, sem cooldown e sem perda",()=>{
  const w=empty(10);
  w.addPlayer(0,{x:4000,y:4000,r:120,team:1});w.addPlayer(1,{x:4200,y:4000,r:80,team:1});
  const total=()=>massa(w,0)+massa(w,1)+w.ejected.reduce((a,e)=>a+(e.dead?0:e.mass),0);
  const antes=total(),m0=massa(w,0),m1=massa(w,1);
  w.setTarget(0,5000,4000);w.requestEject(0);w.step();   // cospe NA DIREÇÃO do companheiro, que está colado
  assert.ok(w.events.some(e=>e.type==="EJECT"),"cuspiu");
  assert.ok(w.events.some(e=>e.type==="EJECT_EATEN"),"o companheiro recolhe NO MESMO TICK: a imunidade é só do DONO da pelota");
  assert.ok(massa(w,0)<m0,"quem cuspiu perdeu massa");
  assert.ok(massa(w,1)>m1,"o companheiro ganhou");
  assert.ok(Math.abs(total()-antes)<1e-6,"transferência sem perda: é isto que faz 'compartilhar partículas' funcionar de graça");
  // e o DONO não reengole na hora: a imunidade continua valendo para ele
  const w2=empty(10);w2.addPlayer(0,{x:4000,y:4000,r:120});
  w2.setTarget(0,4001,4000);w2.requestEject(0);w2.step();
  assert.equal(w2.ejected.filter(e=>!e.dead).length,1,"a própria pelota, cuspida em cima de si, sobrevive ao tick");});

// ── 4. armas ────────────────────────────────────────────────────────────────
test("WEAPONS: a tabela é coerente e cada arma tem uma comida própria",()=>{
  assert.equal(WEAPONS.length,WEAPON.NOVA+1);
  assert.equal(WEAPONS.find(x=>x.key==="mine"),undefined,"a mina saiu do jogo");
  WEAPONS.forEach((x,i)=>assert.equal(x.id,i,"o índice é o id (weaponOf indexa direto)"));
  assert.equal(WEAPONS[WEAPON.MISSILE].weight,0,"o míssil fica fora do sorteio: ele já cai como AMMO");
  const foods=new Set();for(const x of WEAPONS){assert.ok(!foods.has(x.food),`comida repetida: ${x.food}`);foods.add(x.food);}
  for(let i=1;i<WEAPONS.length;i++){assert.equal(weaponOfFood(WEAPONS[i].food),i);
    assert.ok(WEAPONS[i].food>=FOOD_TYPE.W_BURST,"arma entra no FIM do enum de comida (world/cliente testam faixas)");}
  assert.equal(weaponOfFood(FOOD_TYPE.DUST),-1);
  assert.equal(weaponOf(99).id,WEAPON.MISSILE,"arma desconhecida cai no míssil");});
test("cinto: a arma pega entra E vem na mão, sem jogar fora a que eu já tinha",()=>{
  const w=empty(11);w.addPlayer(0,{x:4000,y:4000,r:100,missiles:2});
  const ps=w.players.get(0),pc=w.piecesOf(0)[0];
  assert.equal(ps.weapon,WEAPON.MISSILE);assert.equal(ammoOf(ps),2);
  const solta=type=>{const f=w.spawnFood();f.type=type;f.x=pc.x;f.y=pc.y;w.foodDirty=true;w.step();};
  solta(FOOD_TYPE.W_BURST);
  assert.equal(ps.weapon,WEAPON.BURST,"pegar uma arma já a coloca na mão (pegar e não ver nada acontecer é pior que não pegar)");
  assert.equal(ammoOf(ps),WEAPONS[WEAPON.BURST].ammo);
  assert.equal(ps.ammo[WEAPON.MISSILE],2,"e o míssil continua no cinto, com a munição dele");
  solta(FOOD_TYPE.AMMO);
  assert.equal(ammoOf(ps),WEAPONS[WEAPON.BURST].ammo,"AMMO abastece a arma NA MÃO, respeitando o teto dela");});
test("chavear: Q anda pelas armas com munição, e o míssil está sempre na roda",()=>{
  const w=empty(41);w.addPlayer(0,{x:4000,y:4000,r:100,missiles:0});
  const ps=w.players.get(0),pc=w.piecesOf(0)[0];
  w.requestSwap(0);w.step();
  assert.equal(ps.weapon,WEAPON.MISSILE,"só o míssil no cinto: trocar não muda nada");
  const f=w.spawnFood();f.type=FOOD_TYPE.W_BURST;f.x=pc.x;f.y=pc.y;w.foodDirty=true;w.step();
  assert.equal(ps.weapon,WEAPON.BURST);
  w.requestSwap(0);w.step();
  assert.equal(ps.weapon,WEAPON.MISSILE,"volta para o míssil mesmo com munição zero — é a arma base, não dá para ficar preso fora dela");
  w.requestSwap(0);w.step();
  assert.equal(ps.weapon,WEAPON.BURST,"e volta para a rajada: a roda é circular");
  assert.equal(ownedMask(ps),(1<<WEAPON.MISSILE)|(1<<WEAPON.BURST),"o bitmask do HUD diz o que dá para chavear");});
test("chavear: arma que zerou sai da roda (mas o míssil fica)",()=>{
  const w=empty(42);w.addPlayer(0,{x:4000,y:4000,r:100,missiles:1});
  const ps=w.players.get(0);
  ps.ammo[WEAPON.BURST]=1;ps.weapon=WEAPON.BURST;arma(w);
  w.setTarget(0,5000,4000);w.requestFire(0);w.step();
  assert.equal(ps.ammo[WEAPON.BURST],0,"gastou a última rajada");
  w.requestSwap(0);w.step();
  assert.equal(ps.weapon,WEAPON.MISSILE);
  w.requestSwap(0);w.step();
  assert.equal(ps.weapon,WEAPON.MISSILE,"a rajada vazia saiu da roda");});
test("RAJADA: sai um leque de projéteis retos, gasta 1 de munição e não estilhaça o alvo",()=>{
  const w=empty(12);w.addPlayer(0,{x:4000,y:4000,r:100});w.addPlayer(1,{x:5000,y:4000,r:300});arma(w);
  const ps=w.players.get(0);ps.weapon=WEAPON.BURST;ps.ammo[WEAPON.BURST]=WEAPONS[WEAPON.BURST].ammo;
  w.setTarget(0,5000,4000);w.requestFire(0);w.step();
  assert.equal(w.missiles.filter(m=>!m.dead).length,WEAPONS[WEAPON.BURST].n,"n projéteis de uma vez");
  assert.equal(ammoOf(ps),WEAPONS[WEAPON.BURST].ammo-1,"custa UMA munição, não uma por projétil");
  for(const m of w.missiles)assert.equal(m.hue,WEAPON.BURST,"o projétil carrega a arma (é o que vai no fio)");
  const antes=w.piecesOf(1).length,m0=w.massOf(1);
  let bateu=false;
  for(let i=0;i<90&&!bateu;i++){w.setTarget(0,4000,4000);w.setTarget(1,5000,4000);w.step();   // parados: quem anda vira almoço do maior
    bateu=w.events.some(e=>e.type==="BOOM");}
  assert.ok(bateu,"os projéteis chegam ao alvo");
  assert.equal(w.piecesOf(1).length,antes,"a Rajada arranha e empurra; PARTIR o alvo é do míssil e do cacho");
  const arrancado=m0-w.massOf(1);
  assert.ok(arrancado>0,`tira massa (${Math.round(m0)} → ${Math.round(w.massOf(1))})`);
  // a massa arrancada não evapora: vira fragmento no chão. Alvo parado recolhe tudo de volta em OWNER_IMMUNE_TICKS —
  // é a conservação de FRAG, e é por isso que a Rajada pune quem FOGE, não quem senta em cima dos próprios cacos.
  const chao=w.ejected.reduce((a,e)=>a+(e.dead?0:e.mass),0);
  assert.ok(Math.abs(chao-arrancado)<1e-6,`a massa arrancada tem que estar no chão: ${chao} vs ${arrancado}`);});
test("CACHO: abre perto do alvo e os filhos NÃO abrem de novo (nada de bomba de população)",()=>{
  const w=empty(13);w.addPlayer(0,{x:2000,y:4000,r:100,missiles:3});w.addPlayer(1,{x:4000,y:4000,r:300});arma(w);
  const ps=w.players.get(0);ps.weapon=WEAPON.CLUSTER;ps.ammo[WEAPON.CLUSTER]=1;
  w.setTarget(0,4000,4000);w.requestFire(0);w.step();
  assert.equal(w.missiles.filter(m=>!m.dead).length,1,"sai UM míssil");
  let pico=1;
  for(let i=0;i<200;i++){w.setTarget(0,2000,4000);w.setTarget(1,4000,4000);w.step();
    pico=Math.max(pico,w.missiles.filter(m=>!m.dead).length);}
  assert.ok(pico>=WEAPONS[WEAPON.CLUSTER].n,`o cacho tem que abrir (pico ${pico})`);
  assert.ok(pico<=WEAPONS[WEAPON.CLUSTER].n+1,`abriu demais (pico ${pico}) — filho abrindo filho vira cascata`);});
test("NOVA: empurra e estilhaça inimigo perto, e não encosta em mim nem no aliado",()=>{
  const w=empty(14);
  // o miolo da Nova é blast·core ≈ 306 px: o inimigo entra nele, o companheiro fica fora do miolo mas dentro do sopro
  w.addPlayer(0,{x:4000,y:4000,r:120,team:1});w.addPlayer(1,{x:4000,y:4300,r:120,team:1});w.addPlayer(2,{x:4250,y:4000,r:120,team:2});arma(w);
  const ps=w.players.get(0);ps.weapon=WEAPON.NOVA;ps.ammo[WEAPON.NOVA]=1;
  const meu=w.piecesOf(0).length,ali=w.piecesOf(1).length;
  w.setTarget(0,9000,4000);w.requestFire(0);w.step();
  assert.equal(w.piecesOf(0).length,meu,"a minha nova não me estilhaça");
  assert.equal(w.piecesOf(1).length,ali,"nem o companheiro");
  assert.ok(w.piecesOf(2).length>ali,"o inimigo no miolo é partido");
  assert.ok(w.events.some(e=>e.type==="SUPERNOVA"),"reusa a onda que o cliente já sabe desenhar");});
test("armas só caem no Battle Royale (o mundo Livre nunca sorteia uma)",()=>{
  const livre=createWorld({seed:16,asteroids:false,holes:0,stars:0});
  assert.equal(livre.food.some(f=>f.type>=FOOD_TYPE.W_BURST),false,"modo Livre: nenhuma arma no chão");
  const sv=createWorld({seed:16,asteroids:false,holes:0,stars:0,weapons:true});
  assert.ok(sv.food.some(f=>f.type>=FOOD_TYPE.W_BURST),"Battle Royale larga arma");
  const tipos=new Set(sv.food.filter(f=>f.type>=FOOD_TYPE.W_BURST).map(f=>f.type));
  assert.ok(tipos.size>=3,`a raridade tem que espalhar os tipos (saíram ${tipos.size})`);
  const n=sv.food.filter(f=>f.type>=FOOD_TYPE.W_BURST).length;
  assert.ok(n>10&&n<300,`população de armas fora da faixa: ${n} de ${sv.food.length}`);});
test("a carência de tiro do nascimento continua valendo para TODAS as armas",()=>{
  const w=empty(17);w.addPlayer(0,{x:4000,y:4000,r:100});
  const ps=w.players.get(0);
  for(const id of [WEAPON.MISSILE,WEAPON.BURST,WEAPON.CLUSTER,WEAPON.NOVA]){
    ps.weapon=id;ps.ammo[id]=2;ps.fireCdUntil=w.tick+MISSILE.SPAWN_CD_TICKS;
    assert.equal(applyFire(w,ps),false,`${WEAPONS[id].key} atirou dentro da carência`);
    assert.equal(ammoOf(ps),2,"e nem gastou munição");}});

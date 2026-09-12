// ── Testes dos modos: zona que encolhe, equipes e armas (node --test) ─────────
// A zona e o "aliado" são regras de FÍSICA (não do bot nem do servidor), então é aqui que elas se provam.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createWorld,stepOwnPieces} from "../src/physics/index.js";
import {sameTeam,zoneBurn,outOfZone,zoneExposure,zoneMass,zoneBurnRate,applyFire,ammoOf,ownedMask} from "../src/physics/rules.js";
import {createZone,stepZone,zoneAt,zoneR} from "../src/zone.js";
import {createRng} from "../src/rng.js";
import {WORLD,ZONE,ZONE_TOTAL_TICKS,TICK_HZ,roundTicksOf,PLAYER,DT,EJECT,MISSILE,WEAPON,WEAPONS,FOOD,FOOD_TYPE,isWeaponFood,POWERUP,STAR,MODE,MODES,modeOf,modeCap,BR,BOT_NAMES,botNick,weaponOf,weaponOfFood,BOT_NICKS} from "../src/constants.js";
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
test("BOT_NICKS: lista grande, sem repetidos e sem apelido que se confunde com valor vazio",()=>{
  assert.ok(BOT_NICKS.length>=250,`só ${BOT_NICKS.length} bases: com poucas, o jogador vê a MESMA escalação de nomes toda partida`);
  assert.equal(new Set(BOT_NICKS.map(n=>n.toLowerCase())).size,BOT_NICKS.length,"base repetida na lista");
  // "null" chegou a entrar na lista como apelido de gamer e apareceu no placar e no chat de produção como
  // se fosse um erro do jogo. Nome que se confunde com valor vazio nunca vale a piada.
  const proibidos=new Set(["null","undefined","nan","true","false","none","nil","(null)",""]);
  for(const n of BOT_NICKS){
    assert.ok(!proibidos.has(n.toLowerCase()),`${n} se confunde com valor vazio no placar, no chat e no log`);
    assert.ok(n.trim()===n&&n.length>=2&&n.length<=14,`base fora do formato: "${n}"`);}
});
test("modeCap: a capacidade fecha no tamanho de equipe (equipe incompleta não entra em campo)",()=>{
  assert.equal(modeCap(MODE.BR,1),50);assert.equal(modeCap(MODE.BR,2),50);
  assert.equal(modeCap(MODE.BR,3),48);assert.equal(modeCap(MODE.BR,4),48);
  for(const t of BR.TEAM_SIZES)assert.equal(modeCap(MODE.BR,t)%t,0,`cap divisível por ${t}`);
  assert.equal(modeCap(MODE.BR,0),modeOf(MODE.BR).max,"teamSize 0 não divide por zero");});

// ── 2. zona ─────────────────────────────────────────────────────────────────
test("zona: a máquina fecha em 33 000 ticks e o círculo novo SEMPRE cabe dentro do anterior",()=>{
  const total=ZONE.HOLD_TICKS.reduce((a,b)=>a+b,0)+ZONE.SHRINK_TICKS.reduce((a,b)=>a+b,0);
  // 10 min 25 s: os 8 min 20 s de sempre × 1,25, porque o mapa cresceu 25% de lado. O tempo tem que
  // acompanhar a TRAVESSIA, senão quem está na borda simplesmente não chega e o gás vira a assassina
  // principal — que é o que `bot.test.js` mede e recusa.
  // ⚠️ 33 000 e não 37 500: a PRIMEIRA parada caiu de 2 min 05 para 50 s, para o jogador entender cedo
  // que o círculo fecha. As outras cinco etapas não mudaram.
  assert.equal(total,33000,"9 min 10 s: o fechamento inteiro");
  assert.ok(total<BR.ROUND_TICKS,"a zona tem que fechar ANTES do teto da partida, senão o BR acaba sem decidir nada");
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
    for(let t=0;t<31000;t++){if(stepZone(z,t,rng)){const c=zoneAt(z,t);out.push([t,c.x,c.y,c.r]);}}return JSON.stringify(out);};
  assert.equal(roda(),roda());});
// o gás ENDURECE conforme o círculo fecha: quem mede o tempo de sobrevida tem que dizer EM QUE RAIO,
// senão o número não quer dizer nada. Aqui rodam os dois extremos da rampa na mesma peça.
// ⚠️ `r:BR.SPAWN_R` EXPLÍCITO, e não o default de `addPlayer`: a zona é mecânica do BATTLE ROYALE, e o
// default é `PLAYER.SPAWN_R` — o tamanho do LIVRE, que passou a nascer acima de `SPLIT.MIN_R`. Medir uma
// coisa com o parâmetro da outra fazia este teste virar vermelho por uma mudança que não é dele: o tempo
// no gás é ln(M/MIN_PIECE_R²)/taxa, ou seja PROPORCIONAL à massa de partida, e os números abaixo (≈13 s
// e ≈6 s) foram escolhidos para a massa 900 com que se larga no BR.
const morreEmS=(seed,raio)=>{const w=empty(seed);w.addPlayer(0,{x:1000,y:1000,r:BR.SPAWN_R});
  w.setZone({x0:8000,y0:8000,r0:raio,x1:8000,y1:8000,r1:raio,t0:0,t1:Infinity});
  const pc=w.piecesOf(0)[0];assert.ok(outOfZone(pc,w.zoneNow()),"a peça está fora");
  let t=0;const ps=w.players.get(0);
  while(ps.alive&&t<120*60){w.setTarget(0,pc.x,pc.y);w.step();t++;}
  assert.equal(ps.alive,false,"a zona mata sozinha — é o que fecha a partida");
  const dead=w.events.find(e=>e.type==="PLAYER_DEAD");
  assert.ok(dead&&dead.cause==="zone","a morte tem que sair com cause 'zone'");
  return t/60;};
test("zona: fora dela a peça queima e MORRE no piso — e o gás ENDURECE quando o círculo fecha",()=>{
  const apertado=morreEmS(3,500);                       // fim de partida: taxa saturada em BURN·BURN_K
  const aberto=morreEmS(3,ZONE.R[0]*WORLD.w);           // começo: taxa base
  assert.ok(apertado>4&&apertado<9,`no círculo apertado morreu em ${apertado.toFixed(1)} s (esperado ~6 s: ficar no gás no fim é a morte, não uma jogada de tempo)`);
  assert.ok(aberto>9&&aberto<18,`no círculo da etapa 0 morreu em ${aberto.toFixed(1)} s (esperado ~13 s: tempo de correr, não de acampar)`);
  assert.ok(aberto>apertado*1.7,`a rampa tem que ser sentida: ${aberto.toFixed(1)} s no começo contra ${apertado.toFixed(1)} s no fim`);});
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
  assert.ok(Math.abs(espelho[0].r-pc.r)<1e-9,"o RAIO é o que aparece na tela: divergir aqui faz a peça pulsar na borda");
  // ⚠️ E ENCAVALADA na linha, que é o caso em que a conta da lente entra. O teste acima só cobria a peça
  // inteiramente fora, onde a exposição é 1 e qualquer implementação acerta.
  const w2=createWorld({seed:6,food:0,asteroids:false,holes:0,stars:0});
  w2.addPlayer(0,{x:5000,y:5000,r:200});
  w2.setZone({x0:5150,y0:5000,r0:300,x1:5150,y1:5000,r1:300,t0:0,t1:Infinity});
  const q=w2.piecesOf(0)[0],esp2=[{...q}],st2={tx:5000,ty:5000};
  assert.ok(zoneExposure(q,w2.zoneNow())>.02&&zoneExposure(q,w2.zoneNow())<.98,"a peça está mesmo em cima da linha");
  for(let i=0;i<120;i++){w2.setTarget(0,5000,5000);w2.step();
    stepOwnPieces(esp2,st2,w2.tick-1,DT,w2.w,w2.h,null,null,w2.zoneNow());}
  assert.ok(Math.abs(esp2[0].mass-q.mass)<1e-9,`encavalada, massa divergiu: ${esp2[0].mass} vs ${q.mass}`);
  assert.ok(q.mass<esp2[0].mass+1e-9&&q.r<200,"e queimou de verdade, só que menos que se estivesse toda fora");});

// ── A FINAL DO BATTLE ROYALE ────────────────────────────────────────────────
// O teste-manchete da mudança: com o critério do CENTRO, o gigante ficava com o corpo cobrindo o círculo
// inteiro e não queimava nada. Medindo a FATIA, ele derrete até caber — e quem já cabe não sente nada.
test("zona: o gigante que não CABE derrete até caber; quem cabe não sente nada",()=>{
  const R=ZONE.R[ZONE.STAGES]*WORLD.w;
  const roda=r=>{const w=empty(41);w.addPlayer(0,{x:5000,y:5000,r});
    w.setZone({x0:5000,y0:5000,r0:R,x1:5000,y1:5000,r1:R,t0:0,t1:Infinity});
    const pc=w.piecesOf(0)[0],m0=pc.mass;
    for(let i=0;i<60*60;i++){w.setTarget(0,5000,5000);w.step();if(!w.players.get(0).alive)break;}
    return{pc,m0,vivo:w.players.get(0).alive};};
  const gigante=roda(PLAYER.MAX_R);
  assert.ok(gigante.vivo,"ele não MORRE parado no meio do círculo — ele encolhe");
  // para exatamente na banda morta: 1 − R²/r² = EXPOSE_MIN ⇒ r = R/√(1−EXPOSE_MIN)
  const parada=R/Math.sqrt(1-ZONE.EXPOSE_MIN);
  assert.ok(Math.abs(gigante.pc.r-parada)<R*.02,`para quando cabe (r=${gigante.pc.r.toFixed(0)}, esperado ~${parada.toFixed(0)}, R=${R.toFixed(0)})`);
  assert.ok(gigante.pc.r>R*.5,"sem passar do ponto: exposição zero, queimadura zero");
  // ⚠️ e não pode chegar a um EQUILÍBRIO reengolindo o que o gás arranca: a pelota tem que limpar o planeta
  assert.ok(gigante.m0-gigante.pc.mass>gigante.m0*.3,"o gás cobrou de verdade do gigante");
  const pequeno=roda(200);
  assert.equal(pequeno.pc.mass,pequeno.m0,"quem cabe no círculo não perde um grama");});
test("zona: o círculo final é um teto de MASSA da sala (Σr² ≤ R²)",()=>{
  const R=ZONE.R[ZONE.STAGES]*WORLD.w;
  assert.ok(R>PLAYER.START_R*8,`o círculo final tem que caber uma briga (R=${R.toFixed(0)} px)`);
  assert.ok(R<PLAYER.MAX_R,"e NÃO pode caber um planeta no teto — senão o gigante volta a ser invencível");
  for(let i=1;i<ZONE.R.length;i++){const k=(ZONE.R[i]/ZONE.R[i-1])**2;
    assert.ok(Math.abs(k-.5)<.06,`etapa ${i}: cada fechamento tira ~metade da ÁREA (deu ${(k*100).toFixed(0)}%)`);}});
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
test("zona: colher DENTRO do gás vale ZONE.GAS_GAIN — acampar na beirada era renda líquida",()=>{
  // ⚠️ O par de mundos é o mecanismo do teste: mesma peça, mesma pelota, mesma distância. O que muda é
  // só onde está o círculo — longe (peça 100% exposta) contra em cima dela (peça 100% dentro).
  const monta=(seed,zx,zy)=>{
    const w=empty(seed);w.addPlayer(0,{x:1000,y:1000,r:120});
    w.setZone({x0:zx,y0:zy,r0:600,x1:zx,y1:zy,r1:600,t0:0,t1:Infinity});
    const pc=w.piecesOf(0)[0];
    // pelota parada colada na peça, SEM dono (owner -1) para não pegar o cooldown de reabsorção
    const e=w.addEjected(pc.x+pc.r*.4,pc.y,0,0,10,400,-1,0,600,0);
    return{w,pc,e,m0:pc.mass};};
  const fora=monta(90,8000,8000),dentro=monta(91,1000,1000);
  for(const c of [fora,dentro]){c.w.setTarget(0,c.pc.x,c.pc.y);c.w.step();
    assert.ok(c.e.dead,"a pelota foi absorvida nos dois casos");}
  // dentro do círculo o ganho é o de sempre; exposto, é a fração declarada
  const gDentro=dentro.pc.mass-dentro.m0;
  assert.ok(Math.abs(gDentro-400)<1e-6,`dentro do círculo a massa volta INTEIRA (veio ${gDentro})`);
  // fora, a peça também está queimando no mesmo tick — então compara-se o GANHO da absorção, medido
  // contra uma peça gêmea que não come nada
  const ctrl=monta(90,8000,8000);ctrl.e.dead=true;ctrl.w.setTarget(0,ctrl.pc.x,ctrl.pc.y);ctrl.w.step();
  const gFora=fora.pc.mass-ctrl.pc.mass;
  assert.ok(Math.abs(gFora-400*ZONE.GAS_GAIN)<1e-3,`exposto ao gás vale ZONE.GAS_GAIN (esperado ${400*ZONE.GAS_GAIN}, veio ${gFora})`);
  // e no modo LIVRE (sem zona) nada disso existe
  const livre=empty(92);livre.addPlayer(0,{x:1000,y:1000,r:120});
  const lp=livre.piecesOf(0)[0],lm=lp.mass;
  const le=livre.addEjected(lp.x+lp.r*.4,lp.y,0,0,10,400,-1,0,600,0);
  livre.setTarget(0,lp.x,lp.y);livre.step();
  assert.ok(le.dead&&Math.abs(lp.mass-lm-400)<1e-6,"sem zona o ganho é intocado");});
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
// ⚠️ O critério deixou de ser o CENTRO e passou a ser a FATIA do disco que está no gás. Com o centro, o
// gigante da final ficava com o corpo cobrindo o círculo inteiro e não queimava um grama — invencível
// justamente no momento em que o círculo devia decidir a partida.
test("zoneExposure: a queimadura mede a FATIA do disco que está no gás, não o centro",()=>{
  const zc={x:0,y:0,r:100};
  assert.equal(zoneExposure({x:0,y:0,r:10},zc),0,"cabe inteira: não queima");
  assert.equal(zoneExposure({x:80,y:0,r:10},zc),0,"encostando por dentro: ainda cabe");
  assert.equal(zoneExposure({x:300,y:0,r:10},zc),1,"inteira fora: queima cheio");
  assert.equal(zoneExposure({x:110,y:0,r:10},zc),1,"tangente por fora já é 1");
  const meio=zoneExposure({x:100,y:0,r:10},zc);
  assert.ok(Math.abs(meio-.5)<.06,`metade fora ≈ metade da queimadura (deu ${meio.toFixed(3)})`);
  // o caso que motivou tudo: o CÍRCULO dentro da peça (gigante no fim do Battle Royale)
  const gigante=zoneExposure({x:0,y:0,r:1000},zc);
  assert.ok(Math.abs(gigante-(1-100*100/(1000*1000)))<1e-9,"o círculo dentro da peça expõe 1 − R²/r²");
  assert.ok(gigante>.98,"ou seja: o gigante que não cabe queima quase tudo, em vez de nada");
  // monotônica em d, que é o que impede a peça de piscar entre queimar e não queimar
  let ant=-1;for(let d=0;d<=220;d+=5){const e=zoneExposure({x:d,y:0,r:30},zc);
    assert.ok(e>=ant-1e-12,`monotônica em d (d=${d})`);ant=e;}
  // `outOfZone` virou o teste BARATO: "alguma parte minha está no gás?" — é o aviso do HUD, não a conta
  assert.equal(outOfZone({x:0,y:0,r:10},zc),false);
  assert.equal(outOfZone({x:95,y:0,r:10},zc),true,"a BORDA no gás já acende o aviso");
  assert.ok(zoneMass(1000,DT)<1000&&zoneMass(1000,DT)>=998,"um tick queima pouco (0,17%); o que mata é a insistência");
  assert.equal(zoneMass(1000,DT,undefined,0),1000,"exposição zero, queimadura zero");
  assert.ok(zoneMass(1000,DT,undefined,.5)>zoneMass(1000,DT,undefined,1),"meia exposição, meia queimadura");});
test("zoneBurnRate: a taxa do gás sobe conforme o círculo fecha, entre BURN e BURN·BURN_K",()=>{
  const r0=ZONE.R[0]*WORLD.w,rn=ZONE.R[ZONE.R.length-1]*WORLD.w;
  assert.ok(Math.abs(zoneBurnRate(r0)-ZONE.BURN)<1e-12,"no raio da etapa 0 é a taxa base");
  assert.ok(Math.abs(zoneBurnRate(rn)-ZONE.BURN*ZONE.BURN_K)<1e-12,"no menor círculo é a taxa cheia");
  assert.equal(zoneBurnRate(r0*2),ZONE.BURN,"acima do raio inicial não desce abaixo da base");
  assert.equal(zoneBurnRate(0),ZONE.BURN*ZONE.BURN_K,"abaixo do menor círculo não passa do teto");
  let ant=0;for(let r=rn;r<=r0;r+=(r0-rn)/20){const v=zoneBurnRate(r);if(ant)assert.ok(v<=ant,"monotônica: círculo maior nunca queima mais");ant=v;}
  // é o RAIO que carrega a rampa, e não a etapa, porque o raio é o que o cliente já tem em mãos:
  // mandar a etapa pelo fio seria protocolo novo para um número que dá para derivar dos dois lados
  assert.ok(zoneMass(1000,DT,rn)<zoneMass(1000,DT,r0),"a mesma massa derrete mais rápido no círculo apertado");});

// ── 2b. a comida segue a zona ───────────────────────────────────────────────
// É o que dá VIRADA a quem chega pequeno no fim: o grão vale massa ABSOLUTA, então um tapete no
// círculo apertado engorda quem tem 900 de massa e mal cobre o decaimento de quem tem 200 000.
const dist=(a,b)=>Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2);
test("comida: com a zona ligada o mundo estoca o CÍRCULO, não o mapa",()=>{
  const w=createWorld({seed:31,asteroids:false,holes:0,stars:0});
  assert.equal(w.food.length,FOOD.COUNT,"sem zona é o mapa inteiro, como sempre foi");
  assert.equal(w.foodTarget(),FOOD.COUNT,"e o alvo é o de sempre — o modo Livre não muda nada");
  const zc={x:4800,y:4800,r:1200};
  w.setZone({x0:zc.x,y0:zc.y,r0:zc.r,x1:zc.x,y1:zc.y,r1:zc.r,t0:0,t1:Infinity});
  for(let i=0;i<900;i++)w.step();
  const vivos=w.food.filter(f=>!f.dead);
  const fora=vivos.filter(f=>dist(f,zc)>zc.r);
  assert.equal(fora.length,0,`o gás come a comida também: nenhum grão vivo lá fora (achei ${fora.length})`);
  assert.equal(vivos.length,w.foodTarget(),`a população converge para o alvo do círculo (${vivos.length} de ${w.foodTarget()})`);});
test("comida: quanto menor o círculo, MAIS densa ela fica — é daí que sai a virada do pequeno",()=>{
  const w=createWorld({seed:32,asteroids:false,holes:0,stars:0});
  const densidade=r=>{w.setZone({x0:4800,y0:4800,r0:r,x1:4800,y1:4800,r1:r,t0:0,t1:Infinity});
    return Math.PI*r*r/w.foodTarget();};   // px² por grão: MENOR = mais denso
  const mapa=WORLD.w*WORLD.h/FOOD.COUNT;
  const g=densidade(ZONE.R[2]*WORLD.w),m=densidade(ZONE.R[4]*WORLD.w),p=densidade(ZONE.R[6]*WORLD.w);
  assert.ok(g<mapa,`etapa 2 já é mais densa que o mapa de hoje (${g|0} contra ${mapa|0} px² por grão)`);
  assert.ok(m<g&&p<m,`a densidade tem que subir a cada fechamento (${g|0} → ${m|0} → ${p|0} px² por grão)`);
  assert.ok(w.foodTarget()>=ZONE.FOOD_MIN,"e o piso garante que o círculo final nunca fica vazio");
  w.setZone({x0:4800,y0:4800,r0:WORLD.w,x1:4800,y1:4800,r1:WORLD.w,t0:0,t1:Infinity});
  assert.equal(w.foodTarget(),FOOD.COUNT,"com o círculo cobrindo o mapa o teto manda: nada muda no começo da partida");});
test("comida: o círculo tem RENDA, não torneira — repor na hora era fonte infinita para quem cobre o círculo",()=>{
  const w=createWorld({seed:34,asteroids:false,holes:0,stars:0});
  const r=ZONE.R[5]*WORLD.w;
  w.setZone({x0:4800,y0:4800,r0:r,x1:4800,y1:4800,r1:r,t0:0,t1:Infinity});
  for(let i=0;i<1200;i++)w.step();
  const alvo=w.foodTarget(),vivos=()=>w.food.filter(f=>!f.dead).length;
  assert.equal(vivos(),alvo,"partiu do círculo cheio");
  for(const f of w.food)w.killFood(f);   // um gigante que cobre o círculo varreu tudo neste tick
  w.step();
  const cota=Math.ceil(alvo*DT/ZONE.FOOD_FILL_S)||1;
  assert.ok(vivos()<=cota,`num tick só o círculo repõe a cota (${vivos()} de ${alvo}, cota ${cota})`);
  assert.ok(vivos()>0,"mas repõe: renda não é seca");
  for(let i=0;i<ZONE.FOOD_FILL_S*60+30;i++)w.step();
  assert.equal(vivos(),alvo,`em ~${ZONE.FOOD_FILL_S}s o círculo volta ao cheio`);
  // medido numa partida de 49 bots: sem esta cota o consumo da sala ia de ~200 grãos/s a 7 579/s nos
  // últimos 30 s, e o líder saía de 355 mil para 1,02 milhão de massa em 15 s — o tapete engordava o
  // gigante, não o pequeno. O modo Livre não tem zona e continua repondo na hora.
  const livre=createWorld({seed:34,food:50,asteroids:false,holes:0,stars:0});
  for(const f of livre.food)livre.killFood(f);livre.step();
  assert.equal(livre.food.filter(f=>!f.dead).length,50,"sem zona a reposição é instantânea, como sempre foi");});
test("comida: nunca nasce em cima de estrela — grão dentro do disco é isca, não comida",()=>{
  const w=createWorld({seed:33,asteroids:false,holes:0,stars:STAR.COUNT});
  w.setZone({x0:4800,y0:4800,r0:2400,x1:4800,y1:4800,r1:2400,t0:0,t1:Infinity});
  for(let i=0;i<900;i++)w.step();
  let pior=Infinity,n=0;
  for(const f of w.food){if(f.dead)continue;n++;
    for(const st of w.stars){if(st.dead)continue;const d=dist(f,st)-st.r;if(d<pior)pior=d;}}
  assert.ok(n>100,`o mundo tem que ter comida para o teste valer (${n})`);
  assert.ok(pior>=FOOD.STAR_CLEAR-1,`grão a ${pior.toFixed(0)} px da borda da estrela (mínimo ${FOOD.STAR_CLEAR})`);
  assert.ok(FOOD.STAR_CLEAR+STAR.R<FOOD.NEAR_HAZARD_R[0],"a folga cabe debaixo do anel de perigo: risco × recompensa continua inteiro");});

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
  // ⚠️ O INIMIGO É PROPORCIONAL (r 45 × r 30 = 2,25× de massa), e não o gigante de antes: desde o 1.21 a
  // proteção do novato vale contra GENTE pela razão de massa (`BOT.NOVATO_HUMANO`), então um r=200 em
  // cima de um recém-nascido ATRAVESSA — e este teste é sobre EQUIPE, não sobre novato. Com o par
  // proporcional ele volta a medir só o que o nome dele diz.
  const monta=(team,rg)=>{const w=empty(7);
    w.addPlayer(0,{x:4000,y:4000,r:rg,team});w.addPlayer(1,{x:4120,y:4000,r:30,team});
    for(let i=0;i<20;i++){w.setTarget(0,4000,4000);w.setTarget(1,4000,4000);w.step();}
    return w;};
  const aliados=monta(1,200);
  assert.equal(aliados.players.get(1).alive,true,"o companheiro pequeno tem que sobreviver colado no gigante");
  const inimigos=monta(-1,45);
  assert.equal(inimigos.players.get(1).alive,false,"sem equipe, o maior come normalmente");
  const atropelo=monta(-1,200);
  assert.equal(atropelo.players.get(1).alive,true,"e o ATROPELAMENTO atravessa: é a proteção do novato, não a equipe");});
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
  const solta=type=>{const f=w.spawnFood();f.type=type;f.x=pc.x;f.y=pc.y;w.moveFood(f);w.step();};
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
  const f=w.spawnFood();f.type=FOOD_TYPE.W_BURST;f.x=pc.x;f.y=pc.y;w.moveFood(f);w.step();
  assert.equal(ps.weapon,WEAPON.BURST);
  w.requestSwap(0);w.step();
  assert.equal(ps.weapon,WEAPON.MISSILE,"volta para o míssil mesmo com munição zero — é a arma base, não dá para ficar preso fora dela");
  w.requestSwap(0);w.step();
  assert.equal(ps.weapon,WEAPON.BURST,"e volta para a rajada: a roda é circular");
  assert.equal(ownedMask(ps),(1<<WEAPON.MISSILE)|(1<<WEAPON.BURST),"o bitmask do HUD diz o que dá para chavear");});
test("trava: depois do Q, arma do chão só ABASTECE — nunca arranca da mão o que o jogador escolheu",()=>{
  const w=empty(43);w.addPlayer(0,{x:4000,y:4000,r:100,missiles:1});
  const ps=w.players.get(0),pc=w.piecesOf(0)[0];
  const solta=type=>{const f=w.spawnFood();f.type=type;f.x=pc.x;f.y=pc.y;w.moveFood(f);w.step();};
  solta(FOOD_TYPE.W_BURST);
  assert.equal(ps.weapon,WEAPON.BURST,"o PRIMEIRO contato com armas continua equipando (não há escolha a respeitar ainda)");
  assert.equal(ps.weaponPin,false,"e não trava nada: quem escolheu foi o jogo, não o jogador");
  w.requestSwap(0);w.step();
  assert.equal(ps.weapon,WEAPON.MISSILE,"o jogador escolheu o míssil");
  assert.equal(ps.weaponPin,true,"a partir daqui a escolha é dele");
  solta(FOOD_TYPE.W_CLUSTER);
  assert.equal(ps.weapon,WEAPON.MISSILE,"pisar num cacho NÃO arranca o míssil da mão");
  assert.equal(ps.ammo[WEAPON.CLUSTER],WEAPONS[WEAPON.CLUSTER].ammo,"mas o cacho entrou no cinto, cheio");
  assert.equal(ownedMask(ps),(1<<WEAPON.MISSILE)|(1<<WEAPON.BURST)|(1<<WEAPON.CLUSTER),"e o HUD mostra as três");
  // o único estado ruim que a trava poderia criar: preso numa arma VAZIA pisando numa cheia
  ps.ammo[WEAPON.MISSILE]=0;
  solta(FOOD_TYPE.W_BURST);
  assert.equal(ps.weapon,WEAPON.BURST,"travado numa arma sem munição, a arma nova volta para a mão");
  // e morrer devolve tudo ao começo
  w.respawnPlayer(0);
  assert.equal(ps.weaponPin,false,"vida nova, escolha nova");});
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
  assert.equal(livre.food.some(f=>isWeaponFood(f.type)),false,"modo Livre: nenhuma arma no chão");   // `>=W_BURST` deixou de servir: os powerups de jogador (11..14) entraram DEPOIS das armas e caem nos dois modos
  const sv=createWorld({seed:16,asteroids:false,holes:0,stars:0,weapons:true});
  assert.ok(sv.food.some(f=>isWeaponFood(f.type)),"Battle Royale larga arma");
  const tipos=new Set(sv.food.filter(f=>isWeaponFood(f.type)).map(f=>f.type));
  // a NOVA saiu do sorteio (weight 0, como o míssil): sobram Rajada e Cacho. O código dela continua
  // vivo e testado logo acima — o que acabou é a chance de ela CAIR.
  assert.equal(tipos.size,2,`a raridade tem que espalhar os tipos que existem (saíram ${tipos.size})`);
  assert.equal(tipos.has(FOOD_TYPE.W_NOVA),false,"a Nova não cai mais no Battle Royale");
  assert.equal(WEAPONS[WEAPON.NOVA].weight,0,"e é o peso 0 que a tira do sorteio, sem apagar a arma");
  const n=sv.food.filter(f=>isWeaponFood(f.type)).length;
  assert.ok(n>10&&n<300,`população de armas fora da faixa: ${n} de ${sv.food.length}`);});
test("a carência de tiro do nascimento continua valendo para TODAS as armas",()=>{
  const w=empty(17);w.addPlayer(0,{x:4000,y:4000,r:100});
  const ps=w.players.get(0);
  for(const id of [WEAPON.MISSILE,WEAPON.BURST,WEAPON.CLUSTER,WEAPON.NOVA]){
    ps.weapon=id;ps.ammo[id]=2;ps.fireCdUntil=w.tick+MISSILE.SPAWN_CD_TICKS;
    assert.equal(applyFire(w,ps),false,`${WEAPONS[id].key} atirou dentro da carência`);
    assert.equal(ammoOf(ps),2,"e nem gastou munição");}});

// ── ESTRELAS SEGUEM A ZONA ───────────────────────────────────────────────────
// Elas nasciam sorteadas no mapa INTEIRO, então no círculo fechado não havia nenhuma: o perigo que faz o
// jogador desviar saía da partida justo quando ela fica interessante.
test("estrela: com zona ligada ela nasce DENTRO do círculo",()=>{
  const w=createWorld({seed:71,food:0,asteroids:false,holes:0,stars:0,weapons:true});
  const cx=4800,cy=4800,r=3200;
  w.setZone({x0:cx,y0:cy,r0:r,x1:cx,y1:cy,r1:r,t0:0,t1:Infinity});
  // Recusar é um resultado legítimo — o círculo tem área finita e STAR.MIN_SEP não é de graça. O que NÃO
  // pode acontecer é nascer fora: era o ponto de fallback do `_farSpot` largando a estrela no gás.
  let dentro=0;
  for(let i=0;i<12;i++){const st=w.spawnStar(true);if(!st)continue;
    const d=Math.hypot(st.x-cx,st.y-cy);
    assert.ok(d<=r-ZONE.STAR_PAD+1,`estrela ${i} a ${d.toFixed(0)} px do centro (círculo ${r}, folga ${ZONE.STAR_PAD})`);
    dentro++;}
  assert.ok(dentro>=5,`só ${dentro} estrelas nasceram num círculo de ${r} px — o sorteio não está achando lugar`);
  // sem zona nada muda: o sorteio é o do mapa inteiro, e é isso que mantém o modo Livre idêntico
  const livre=createWorld({seed:71,food:0,asteroids:false,holes:0,stars:0});
  const st=livre.spawnStar(true);
  assert.ok(st,"sem zona a estrela sempre nasce (o fallback do mapa inteiro sempre serviu)");});

test("estrela: o círculo pequeno não ganha estrela nova — e o gás leva a que ficou para trás",()=>{
  const w=createWorld({seed:72,food:0,asteroids:false,holes:0,stars:0,weapons:true});
  const cx=4800,cy=4800,peq=ZONE.STAR_MIN_R-100;
  w.setZone({x0:cx,y0:cy,r0:peq,x1:cx,y1:cy,r1:peq,t0:0,t1:Infinity});
  // a estrela esteriliza r+FOOD.STAR_CLEAR de comida em volta; num círculo apertado isso é um quarto do
  // tapete, que é justamente a virada do jogador pequeno. Por isso o respawn ADIA em vez de insistir.
  w.queueStar(1);
  const antes=w.stars.length;
  for(let t=0;t<ZONE.STAR_RETRY_TICKS-2;t++)w.step();
  assert.equal(w.stars.length,antes,"círculo menor que STAR_MIN_R não recebe estrela");
  assert.equal(w.starQueue.length,1,"e o pedido continua na fila — não se perde a estrela para sempre");
  // agora o círculo abre: a mesma fila entrega
  w.setZone({x0:cx,y0:cy,r0:3000,x1:cx,y1:cy,r1:3000,t0:0,t1:Infinity});
  let nasceu=false;
  for(let t=0;t<ZONE.STAR_RETRY_TICKS+60&&!nasceu;t++){w.step();nasceu=w.stars.length>antes;}
  assert.ok(nasceu,"com espaço, a fila volta a entregar");

  // a que o círculo deixou para trás some e VOLTA para a fila (senão a população cairia para sempre)
  const w2=createWorld({seed:73,food:0,asteroids:false,holes:0,stars:0,weapons:true});
  w2.setZone({x0:cx,y0:cy,r0:4000,x1:cx,y1:cy,r1:4000,t0:0,t1:Infinity});
  const fora=w2.spawnStar(true,{x:cx+3600,y:cy});
  assert.ok(fora&&!fora.dead);
  w2.setZone({x0:cx,y0:cy,r0:900,x1:cx,y1:cy,r1:900,t0:0,t1:Infinity});   // o círculo fechou por cima dela
  const naFila=w2.starQueue.length;
  for(let t=0;t<w2.stars.length*3+8&&!fora.dead;t++)w2.step();
  assert.ok(fora.dead,"a estrela que ficou no gás some");
  assert.ok(w2.starQueue.length>naFila,"e entra na fila de volta");
  assert.equal(w2.events.some(e=>e.type==="SUPERNOVA"),false,"sumiço silencioso: explodir no gás premiaria ninguém e assustaria o outro lado do mapa");});

// ── SORTEIO PONDERADO DOS POWERUPS ───────────────────────────────────────────
test("powerup: a tabela de pesos manda, e os dois raros são mesmo raros",()=>{
  const w=createWorld({seed:74,asteroids:false,holes:0,stars:0});
  const conta=new Map();
  for(const f of w.food)if(f.type>=FOOD_TYPE.AMMO&&!isWeaponFood(f.type)&&f.type!==FOOD_TYPE.AMMO)
    conta.set(f.type,(conta.get(f.type)|0)+1);
  const total=[...conta.values()].reduce((a,b)=>a+b,0);
  assert.ok(total>40,`só ${total} powerups em ${w.food.length} comidas — a banda POWER_P sumiu`);
  for(const [t] of POWERUP.DROP)assert.ok((conta.get(t)|0)>0,`o tipo ${t} nunca saiu no sorteio`);
  const comuns=(conta.get(FOOD_TYPE.MAGNET)|0)+(conta.get(FOOD_TYPE.SHIELD)|0);
  const raros=(conta.get(FOOD_TYPE.AMMO_PLUS)|0)+(conta.get(FOOD_TYPE.FEAST)|0);
  assert.ok(comuns>raros*2,`ímã+escudo (${comuns}) têm que ser bem mais comuns que os raros (${raros})`);
  // e o sorteio gasta UM draw só: dois deslocariam o stream do mulberry32 e mudariam todo o resto do mundo
  const a=createWorld({seed:75,asteroids:false,holes:0,stars:0});
  const b=createWorld({seed:75,asteroids:false,holes:0,stars:0});
  assert.deepEqual(a.food.map(f=>f.type),b.food.map(f=>f.type),"o mundo continua determinístico pela semente");});

// ── A GAIOLA DE LARGADA ──────────────────────────────────────────────────────
// Ela reusa `w.peace` (que já fazia todo mundo virar aliado) e acrescenta o que faltava: as guardas da fase
// 1 e da fase 7 do `World.step`. O que este bloco cobre é o CONTRATO do pedido — "eles se trombam, não tem
// luta nesse octógono e nem powerup" —, item por item.
const gaiola=(seed=1)=>{const w=empty(seed);w.cage={x:WORLD.w/2,y:WORLD.h/2,ap:BR.CAGE_AP*WORLD.w};w.peace=true;return w;};

test("gaiola: ninguém come, atira, divide, cospe nem pega powerup",()=>{
  const w=gaiola(21),cg=w.cage;
  const grande=w.addPlayer(0,{x:cg.x,y:cg.y,r:200}),pequeno=w.addPlayer(1,{x:cg.x+150,y:cg.y,r:30});
  arma(w);
  w.setTarget(0,cg.x+150,cg.y);w.setTarget(1,cg.x,cg.y);
  const ps0=w.players.get(0),ps1=w.players.get(1);
  const m1=w.massOf(1),am0=ammoOf(ps0);
  for(let t=0;t<120;t++){
    w.requestSplit(0);w.requestEject(0);ps0.fireReq=true;w.step();}
  assert.ok(w.players.has(1)&&pequeno&&!pequeno.dead,"o grande NÃO comeu o pequeno colado nele");
  assert.equal(massa(w,1),Math.round(m1*1e6)/1e6,"e não tirou um grama dele");
  assert.equal(w.piecesOf(0).length,1,"o split não sai");
  assert.equal(w.ejected.length,0,"a cusparada não sai");
  assert.equal(w.missiles.length,0,"o tiro não sai");
  assert.equal(ammoOf(ps0),am0,"e a munição fica intacta — o pedido não foi só engolido, ele nem foi cobrado");
  // POWERUP: a comida fica no chão, viva, esperando a gaiola abrir
  const f=w.spawnFood();f.type=FOOD_TYPE.SHIELD;f.x=cg.x;f.y=cg.y;f.r=FOOD.SPECIAL_R;w.moveFood(f);
  for(let t=0;t<20;t++)w.step();
  assert.equal(grande.shieldLv,0,"o escudo não é pego");
  assert.ok(!f.dead,"⚠️ e a comida CONTINUA VIVA: consumi-la sem efeito seria pior que não consumir");});

test("gaiola: eles se TROMBAM — o quique existe, e é o de inimigo",()=>{
  // Sob `peace` todo mundo é aliado, e aliado usa `separateOwn`: separação POSICIONAL, sem impulso, sem
  // evento, ou seja sem som e sem faísca. O pedido é literalmente "eles se trombam", então dentro da gaiola
  // o contato vira o quique de inimigo — e é essa diferença que este teste trava.
  const bate=cage=>{const w=empty(31);w.peace=true;if(cage)w.cage={x:WORLD.w/2,y:WORLD.h/2,ap:BR.CAGE_AP*WORLD.w};
    const cx=WORLD.w/2,cy=WORLD.h/2;
    const a=w.addPlayer(0,{x:cx-90,y:cy,r:40}),b=w.addPlayer(1,{x:cx+90,y:cy,r:40});
    w.setTarget(0,cx+4000,cy);w.setTarget(1,cx-4000,cy);
    // o PICO, e não o valor final: o impulso do quique é um empurrão que sempre chega a zero (é o canal de
    // boost, ver integrate.js), então medir só no fim mediria o decaimento, não a trombada.
    let pico=0,eventos=0;
    for(let t=0;t<60;t++){w.step();
      pico=Math.max(pico,Math.hypot(a.vx,a.vy)+Math.hypot(b.vx,b.vy));
      for(const e of w.events)if(e.type==="BOUNCE")eventos++;}
    return{pico,eventos};};
  const com=bate(true),sem=bate(false);
  assert.ok(com.pico>1,`na gaiola a trombada empurra de verdade (pico ${com.pico.toFixed(2)})`);
  assert.equal(sem.pico,0,"e fora dela o aquecimento continua mudo, como sempre foi");
  assert.equal(sem.eventos,0,"`separateOwn` não emite evento nenhum — é o que a deixa sem som e sem faísca");});

test("gaiola: o gás não age, porque a zona ainda NÃO EXISTE",()=>{
  // Isto sai por AUSÊNCIA e não por `if`: `Room.begin` monta a gaiola e só `Room.largar` chama `createZone`.
  // É a razão de a zona nascer no segundo tempo da largada, e não no primeiro.
  const w=gaiola(44),cg=w.cage;
  assert.equal(w.zoneNow(),null,"sem zona, `zoneBurn` nem é chamada no step");
  const pc=w.addPlayer(0,{x:cg.x,y:cg.y}),m0=pc.mass;
  for(let t=0;t<120;t++)w.step();
  assert.ok(Math.abs(pc.mass-m0)<1e-9,"e ninguém queima dentro do octógono");});

// ── A ZONA E O TETO DA PARTIDA ANDAM JUNTOS ──────────────────────────────────
test("zona × rodada: o teto da partida cabe a zona INTEIRA mais a folga de decisão",()=>{
  // Isto vivia só num comentário ("os dois andam JUNTOS"), e a primeira vez que alguém encurtou uma etapa
  // da zona o piso de duração do BR se mexeu sozinho — abrindo a opção de 10 min com 50 s para o círculo
  // final decidir a partida. Agora a folga é um número, e este teste é quem a segura.
  assert.ok(BR.ROUND_TICKS>=ZONE_TOTAL_TICKS+BR.DECIDE_TICKS,
    `${BR.ROUND_TICKS} < ${ZONE_TOTAL_TICKS}+${BR.DECIDE_TICKS}: a partida acabaria por tempo antes de o círculo decidir`);
  assert.equal(roundTicksOf(MODE.BR,10),null,"10 min continua recusado no Battle Royale");
  assert.ok(roundTicksOf(MODE.BR,20),"e 20 continua valendo — o jogador não vê diferença nenhuma");
  // e a gaiola cabe folgada dentro da primeira parada, com tempo de explorar antes do primeiro aviso
  assert.ok(ZONE.HOLD_TICKS[0]>=BR.CAGE_TICKS+TICK_HZ*20,
    "a etapa 0 tem que sobreviver à gaiola e ainda dar tempo de andar antes do aviso do gás");});

test("zona: NÃO há guarda de etapa — o gás da etapa 0 queima como qualquer outro",()=>{
  // O pedido "o gás inicial também machuca" já era verdade no código, e o que estava errado era o
  // COMENTÁRIO (escrito quando o mapa tinha 9 600 de lado, e onde o círculo inicial de fato o cobria).
  // Com 12 000, sobram quatro orelhas de gás nos cantos desde o primeiro tick.
  const r0=ZONE.R[0]*WORLD.w;
  assert.ok(r0<Math.hypot(WORLD.w/2,WORLD.h/2),"o círculo da etapa 0 NÃO alcança os cantos do mapa");
  const w=empty(77),pc=w.addPlayer(0,{x:200,y:200});   // canto do mapa, fora do círculo inicial
  w.setZone({x0:WORLD.w/2,y0:WORLD.h/2,r0,x1:WORLD.w/2,y1:WORLD.h/2,r1:r0,t0:0,t1:Infinity});
  const zc=w.zoneNow();
  assert.ok(outOfZone(pc,zc),"e o canto FICA fora dele");
  const m0=pc.mass;w.setTarget(0,200,200);
  for(let t=0;t<60;t++)w.step();
  assert.ok(pc.mass<m0,"queima já na etapa 0: não existe guarda de etapa em lugar nenhum");});

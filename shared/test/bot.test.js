// ── ARENA: um Battle Royale inteiro de bots, sem servidor nem rede ───────────
// O cérebro não tem como ser testado por asserção pontual ("nesta posição ele devia virar à esquerda"):
// o que importa é o COMPORTAMENTO agregado de uma sala inteira. Então a arena roda a partida de verdade —
// World + zone.js + BotBrain, o mesmo caminho do servidor — e mede o que denunciaria um script:
// ponteiro que gira 180° num quadro, sala que morre de gás, ninguém que ataca, todo mundo igual.
import test from "node:test";
import assert from "node:assert/strict";
import {createWorld} from "../src/physics/world.js";
import {BotBrain} from "../src/bot.js";
import {createRng} from "../src/rng.js";
import {createZone,stepZone} from "../src/zone.js";
import {INPUT_FLAG} from "../src/protocol/constants.js";
import {BOT,BR,PLAYER,FOOD,STAR,SPEED,TICK_HZ,ZONE,ROOM} from "../src/constants.js";

const TURN_MAX=BOT.SKILLS.reduce((a,s)=>Math.max(a,s.turn),0);
const JIT=BOT.HAND.JITTER_STEP*BOT.SKILLS.reduce((a,s)=>Math.max(a,s.jitter),0);

/** Roda uma partida e devolve tudo que dá para medir dela. */
function arena({seed=1,n=40,ticks=7200,zone=true,team=0,weapons=true,respawn=false}={}){
  const w=createWorld({seed,food:FOOD.COUNT,asteroids:true,stars:STAR.COUNT,holes:0,weapons});
  const rng=createRng(seed*104729+7);
  const uso={split:0,fire:0,swap:0,eject:0,parado:0,inputs:0},giro=[],ang=new Map();
  const emit=(slot,c)=>{
    const ps=w.players.get(slot);if(!ps)return;
    uso.inputs++;ultima.set(slot,c.flags);
    if(c.flags&INPUT_FLAG.SPLIT)uso.split++;
    if(c.flags&INPUT_FLAG.FIRE)uso.fire++;
    if(c.flags&INPUT_FLAG.SWAP)uso.swap++;
    if(c.flags&(INPUT_FLAG.EJECT|INPUT_FLAG.EJECT_HOLD))uso.eject++;
    // a peça só FREIA quando o ponteiro está dentro de SPEED.RAMP: é assim que o bot "para"
    const pc=ps.pieces.find(p=>!p.dead);
    if(pc){if(Math.hypot(c.tx-pc.x,c.ty-pc.y)<SPEED.RAMP)uso.parado++;
      const a=Math.atan2(c.ty-pc.y,c.tx-pc.x),prev=ang.get(slot);
      if(prev!==undefined&&ps.pieces.filter(p=>!p.dead).length===1){
        let d=a-prev;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;giro.push(Math.abs(d));}
      ang.set(slot,a);}
    w.setTarget(slot,c.tx,c.ty);
    if(c.flags&INPUT_FLAG.SPLIT)w.requestSplit(slot);
    if(c.flags&INPUT_FLAG.EJECT)w.requestEject(slot);
    w.setEjectHold(slot,(c.flags&INPUT_FLAG.EJECT_HOLD)!==0);
    if(c.flags&INPUT_FLAG.SWAP)w.requestSwap(slot);
    if(c.flags&INPUT_FLAG.FIRE)w.requestFire(slot,(c.flags&INPUT_FLAG.AIM)!==0);};
  // ⚠️ Um anel PRÓPRIO da arena, e não o da largada de verdade: `BR.SPAWN_RING` deixou de existir quando a
  // largada virou o octógono, e esta bancada não quer a gaiola — ela quer os bots espalhados desde o tick 0
  // para medir caça, fuga e leitura da zona. O número é o que o anel valia (.44 do lado do mapa).
  const brains=[],ring=Math.min(w.w,w.h)*.44;
  for(let s=0;s<n;s++){const a=s/n*Math.PI*2;
    w.addPlayer(s,{r:BR.SPAWN_R,isBot:true,missiles:BR.START_AMMO,team:team?Math.floor(s/team):-1,
      x:w.w/2+Math.cos(a)*ring,y:w.h/2+Math.sin(a)*ring});
    brains.push(new BotBrain(w,s,rng,emit));}
  const z=zone?createZone(0):null;if(z)w.setZone(z);
  // escudo perdido: a QUEM atribuir. applyFire cobra um nível por puxão de gatilho e applySplit cobra um
  // nível de cada peça que divide — os dois com bySlot −1, então o evento não distingue. Quem distingue é
  // a flag que o bot pediu NESTE tick. Conta a DIFERENÇA de níveis, então vale para os dois preços.
  const esc={split:0,fire:0,outro:0},shAntes=new Array(n).fill(0),ultima=new Map();
  const shield=s=>{const ps=w.players.get(s);if(!ps)return 0;let t=0;for(const p of ps.pieces)if(!p.dead)t+=p.shieldLv;return t;};
  const morte=[],gas=new Map(),vivo=new Map();
  let ms=0,eat=0,splitEat=0;const splitAt=new Map();
  for(let i=0;i<ticks;i++){
    if(z)stepZone(z,w.tick,rng);
    const t0=process.hrtime.bigint();
    for(const b of brains){const ps=w.players.get(b.slot);if(ps&&ps.alive)b.act(w.tick);}
    ms+=Number(process.hrtime.bigint()-t0)/1e6;
    for(const b of brains){const ps=w.players.get(b.slot);if(ps&&ps.alive&&(ps.splitReq))splitAt.set(b.slot,w.tick);}
    for(let s=0;s<n;s++)shAntes[s]=shield(s);
    w.step();
    for(let s=0;s<n;s++){const d=shAntes[s]-shield(s);if(d<=0)continue;const f=ultima.get(s)|0;
      if(f&INPUT_FLAG.SPLIT)esc.split+=d;else if(f&INPUT_FLAG.FIRE)esc.fire+=d;else esc.outro+=d;}
    for(const e of w.events){
      if(e.type==="EAT"){eat++;const t=splitAt.get(e.killerSlot);if(t!==undefined&&w.tick-t<180)splitEat++;}
      if(e.type==="PLAYER_DEAD"){morte.push({slot:e.slot,tick:w.tick,cause:e.cause,skill:brains[e.slot].s.id});
      if(respawn){w.respawnPlayer(e.slot,{r:rng.range(PLAYER.BOT_R[0],PLAYER.BOT_R[1])});brains[e.slot].reset();}}}
    const zc=w.zoneNow();
    for(const b of brains){const ps=w.players.get(b.slot);if(!ps||!ps.alive)continue;
      const k=b.s.id;vivo.set(k,(vivo.get(k)|0)+1);
      if(zc){const pc=ps.pieces.find(p=>!p.dead);if(!pc)continue;
        const dx=pc.x-zc.x,dy=pc.y-zc.y;if(dx*dx+dy*dy>zc.r*zc.r)gas.set(k,(gas.get(k)|0)+1);}}
    let viv=0;for(const p of w.players.values())if(p.alive)viv++;
    if(viv<=1)break;}
  giro.sort((a,b)=>a-b);
  return{w,brains,morte,uso,esc,gas,vivo,eat,splitEat,ms,ticks:w.tick,
    giro:{p50:giro[giro.length>>1]||0,p99:giro[Math.floor(giro.length*.99)]||0},
    vivos:[...w.players.values()].filter(p=>p.alive).length};
}
const chave=w=>w.pieces.map(p=>`${p.owner}:${p.x.toFixed(3)}:${p.y.toFixed(3)}:${p.r.toFixed(3)}`).join("|");

// ⚠️ TRÊS partidas, não uma — a MESMA lição do teste da zona, logo abaixo, e pelo mesmo motivo. Com
// `seed:3` sozinha o piso de 10 mortes ficava a UMA morte da borda, então qualquer mudança que mexesse no
// mundo virava o teste vermelho sem nada estar quebrado. Foi o que aconteceu quando o clique rápido passou
// a escolher o alvo pela DIREÇÃO (MISSILE.AHEAD_K): medido sobre 12 sementes, a regra nova mata MAIS — 190
// mortes contra 180, e ZERO por gás contra 3 —, e mesmo assim na semente 3 isolada ela dá 9 contra 11.
// Somando três sementes a amostra triplica e o vermelho volta a significar alguma coisa. O custo é ~3 s.
test("arena: a sala se resolve na porrada, não no gás", ()=>{
  const morte=[arena({seed:3}),arena({seed:17}),arena({seed:5})].flatMap(a=>a.morte);
  const c={};for(const m of morte)c[m.cause]=(c[m.cause]|0)+1;
  assert.ok(morte.length>=30,`poucas mortes (${morte.length} em 3 partidas): os bots não estão se enfrentando`);
  const gas=c.zone||0;
  assert.ok(gas/morte.length<.35,`gás matou ${gas}/${morte.length} — a zona não pode ser a assassina principal`);
  assert.ok((c.eaten||0)>=morte.length*.5,"a maioria das mortes tem que ser de ser comido");
});

test("arena: o salto é usado e converte em abate", ()=>{
  const a=arena({seed:17});
  assert.ok(a.uso.split>0,"nenhum split: o bot perdeu o único fechador que existe em campo aberto");
  assert.ok(a.splitEat>0,"nenhum abate depois de um salto: o bot está saltando à toa");
});

test("mão: o ponteiro nunca gira 180° num quadro", ()=>{
  const a=arena({seed:5,ticks:3600});
  const teto=TURN_MAX+JIT*2+1e-6;
  assert.ok(a.giro.p99<=teto,`p99 do giro ${a.giro.p99.toFixed(3)} rad/tick acima do teto da perícia ${teto.toFixed(3)}`);
  assert.ok(a.giro.p50>0,"ponteiro congelado: o tremor não está rodando");
  assert.ok(a.uso.parado/a.uso.inputs>.002,"o bot nunca freia — humano para o tempo todo");
});

// ⚠️ TRÊS partidas, não uma. "Bot ruim toma mais gás que o bom" é uma propriedade ESTATÍSTICA, e uma
// semente só é uma amostra: medido sobre 24 sementes, ela vale em ~17 delas (71 %) — ou seja, o teste com
// `seed:11` passava por sorte e virava vermelho a cada mudança que mexesse no mundo (a composição da comida,
// por exemplo), sem nada estar quebrado. Somando três partidas a diferença fica clara e estável: verificado
// em sete janelas de três sementes consecutivas, o agregado vale em TODAS — antes e depois desta mudança.
// O custo é ~3 arenas em vez de 1, e é o preço de o vermelho significar alguma coisa.
// ⚠️ ESTE roda mais tempo que os outros, e tem que rodar. A zona só COMEÇA a fechar no tick 6000 e a
// primeira etapa só termina em 9600 (ZONE.HOLD_TICKS/SHRINK_TICKS), então nos 7200 ticks padrão da arena
// o círculo ainda cobre o mapa inteiro e ninguém encosta no gás: não há o que medir.
test("zona: os bots leem o círculo e não morrem no gás", ()=>{
  const T=ZONE.HOLD_TICKS[0]+ZONE.SHRINK_TICKS[0]+ZONE.HOLD_TICKS[1]+ZONE.SHRINK_TICKS[1];
  const rodadas=[arena({seed:11,ticks:T}),arena({seed:12,ticks:T}),arena({seed:13,ticks:T})];
  let fora=0,total=0;for(const a of rodadas)for(const [k,v] of a.vivo){total+=v;fora+=a.gas.get(k)|0;}
  assert.ok(fora/total<.05,`${(100*fora/total).toFixed(1)}% do tempo no gás — os bots não estão lendo a zona`);
  // ── o que ESTAVA aqui e saiu ──
  // Havia uma segunda asserção: "o bot ruim tem que tomar MAIS gás que o bom". Ela passava, mas não era
  // verdade — passava porque três sementes sobre uma amostra minúscula de gás dão o sinal que quiserem.
  // Medido com OITO sementes e a zona rodada até o terceiro círculo, a taxa de tempo no gás por perícia é
  //     ruim .00509 · medio .01000 · bom .00953 · fera .00590
  // ou seja, nem monotônica: quem toma mais gás é o MEIO da tabela. E faz sentido — tempo no gás não mede
  // a mão, mede o quanto o bot se afasta do centro para caçar, e é o mediano que se arrisca sem saber
  // recuar. O ruim fica perto e passivo; a fera vai longe e volta na hora. Um teste que afirma o contrário
  // do que o sistema faz é pior que teste nenhum: ele trava a implementação no acaso de uma semente.
});

test("perícia: a sala tem gente de todos os níveis", ()=>{
  const rng=createRng(4242),w=createWorld({seed:1,food:0,asteroids:false,stars:0,holes:0}),vistos=new Map();
  for(let s=0;s<400;s++){w.addPlayer(s,{r:30,isBot:true});
    const b=new BotBrain(w,s,rng,()=>{});vistos.set(b.s.id,(vistos.get(b.s.id)|0)+1);w.removePlayer(s);}
  for(const s of BOT.SKILLS)assert.ok((vistos.get(s.id)|0)>0,`perícia ${s.id} nunca sorteada`);
  assert.ok(vistos.get("medio")>vistos.get("fera"),"a maioria tem que ser mediana, não fera");
});

test("cinto: o bot troca de arma", ()=>{
  const a=arena({seed:23});
  assert.ok(a.uso.swap>0,"nenhuma troca de arma: o cinto ficou parado");
});

test("equipe: companheiro recebe massa (a cusparada de terceiro é comível na hora)", ()=>{
  // ⚠️ VÁRIAS SEMENTES, e não uma. O que o teste quer dizer é "bot de equipe passa massa ao companheiro",
  // não "com a semente 5 isso acontece": cuspir é uma decisão rara e situacional, e QUALQUER mudança na
  // física desloca o stream do rng da arena e pode fazer aquela partida específica não ter o momento certo
  // — foi o que aconteceu quando o kit de boas-vindas entrou (o banquete muda a massa de todo mundo desde
  // o tick 0). Afrouxar para `>=0` seria apagar o teste; varrer sementes mantém o que ele afirma.
  const sementes=[5,6,7,11];
  const usos=sementes.map(seed=>arena({seed,n:40,team:4,ticks:4800}).uso.eject);
  assert.ok(usos.some(n=>n>0),
    `ninguém passou massa para o companheiro em nenhuma das sementes ${sementes.join(",")} (ejeções: ${usos.join(",")})`);
});

test("determinismo: mesma semente, mesma partida", ()=>{
  const A=arena({seed:77,n:20,ticks:900}),B=arena({seed:77,n:20,ticks:900});
  assert.equal(chave(A.w),chave(B.w));
});

test("custo: o cérebro cabe no orçamento do tick", ()=>{
  const a=arena({seed:31,n:50,ticks:3600});
  const porTick=a.ms/a.ticks;
  assert.ok(porTick<2,`${porTick.toFixed(3)} ms/tick só de bots — o passo inteiro tem 16,7 ms para 60 Hz`);
});

// ── CENAS SINTÉTICAS: as peças plantadas à mão ───────────────────────────────
// A arena mede a SALA, e há duas regras que ela não consegue provar porque uma sala só de bots quase não
// produz a cena: um jogador GRANDE e PARTIDO, e um bot blindado diante de uma presa de tamanho exato.
// (Medido: o bocado aparece em 0,7 % do tempo de caça da arena.) Aqui o mundo é pelado, as peças são postas
// na mão e o `emit` é vazio — ninguém se move, a cena fica de pé e só a DECISÃO é medida. Custa milissegundos
// e é 100 % determinístico: sem isto, as duas regras voltariam a quebrar em silêncio.

/** Mundo pelado: sem comida, sem perigo, sem decaimento. Só os planetas que o teste planta. */
const palco=(seed=9)=>createWorld({seed,food:0,asteroids:false,stars:0,holes:0,weapons:false,decay:false});
/** Cérebro com perícia e estilo FIXOS — sem isso quem decide o teste é o sorteio da perícia. */
function cerebro(w,slot,emit=()=>{},skill=3,persona=0){
  const b=new BotBrain(w,slot,createRng(4242),emit);
  b.s=BOT.SKILLS[skill];b.p=BOT.PERSONAS[persona];return b;}

test("salto: o escudo é PREÇO e não veto — a MESMA presa vale sem blindagem e não vale com ela", ()=>{
  // ganho = (rb/ra)² da minha massa; preço = HUNT.SPLIT_GAIN sem escudo e HUNT.SPLIT_GAIN_SHIELD com ele.
  // Os raios saem da fórmula, não de números escolhidos: `magra` fica ENTRE os dois preços de propósito, que
  // é o único ponto onde a regra se vê.
  const ra=200,rDe=g=>Math.round(ra*Math.sqrt(g));
  const magra=rDe((BOT.HUNT.SPLIT_GAIN+BOT.HUNT.SPLIT_GAIN_SHIELD)/2),gorda=rDe(BOT.HUNT.SPLIT_GAIN_SHIELD*2);
  const cena=(rb,lv,ticks=900)=>{
    const w=palco();
    w.addPlayer(0,{r:ra,isBot:true,x:2000,y:2000});
    w.addPlayer(1,{r:rb,isBot:true,x:2500,y:2000});
    // ⚠️ o que prova a decisão é a FLAG EMITIDA, não `wantSplit`: o `act` zera o desejo no mesmo tick em que
    // o converte em INPUT_FLAG.SPLIT. E o emit não APLICA nada — a cena tem que ficar de pé.
    let pediu=false;
    const b=cerebro(w,0,(s,c)=>{if(c.flags&INPUT_FLAG.SPLIT)pediu=true;}),pc=w.piecesOf(0)[0];
    for(let i=0;i<ticks;i++){
      pc.shieldLv=lv;pc.shieldEvolveAt=1e9;                 // o escudo é a ÚNICA variável da cena
      w.setTarget(0,2000,2000);w.setTarget(1,2500,2000);    // os dois parados: sem alvo eles correm para (0,0)
      b.act(w.tick);if(pediu)return true;
      w.step();}
    return false;};
  assert.ok(cena(magra,0),`presa de r=${magra} não armou o salto SEM escudo (ganho ${(magra*magra/(ra*ra)).toFixed(3)} ≥ ${BOT.HUNT.SPLIT_GAIN})`);
  assert.ok(!cena(magra,3),`a mesma presa armou o salto COM escudo 3: a blindagem tem que cobrar ${BOT.HUNT.SPLIT_GAIN_SHIELD}`);
  assert.ok(cena(gorda,3),`presa de r=${gorda} não armou o salto com escudo — o preço não pode virar veto de novo`);
});

test("bocado: o pedaço solto de um gigante é presa — e o gigante inteiro não é", ()=>{
  // O pedido literal: "se um player tem pedaços pequenos e é grande, o bot pode caçar esses pequenos pedaços".
  // O guarda fica longe do pedaço (mais que HUNT.BITE_CLEAR), senão morder é entregar as duas metades.
  const gx=2000,mx=5000,bx=5200,pequeno=45;
  const cena=comPedacos=>{
    const w=palco(11);
    w.addPlayer(0,{r:120,isBot:true,x:bx,y:2000});
    w.addPlayer(1,{r:300,isBot:true,x:gx,y:2000});
    if(comPedacos)for(const dy of [-300,0,300])w.newPiece(1,mx,2000+dy,pequeno);
    const b=cerebro(w,0);
    // ⚠️ o gigante mira a PRÓPRIA peça grande: um alvo em cima dos pedaços os faria convergir e FUNDIR,
    // e um r=45·√3 já não caberia no predicado de comer — a cena se desmontaria sozinha.
    for(let i=0;i<60;i++){w.setTarget(0,bx,2000);w.setTarget(1,gx,2000);b.act(w.tick);w.step();}
    return b;};
  const com=cena(true);
  assert.equal(com.mode,"hunt","com pedaços comíveis por perto o gigante vira PRESA, não só ameaça");
  assert.equal(com.target,1,"a caça é do DONO do pedaço: o alvo público continua sendo o slot");
  assert.ok(com.tpid>=0,"o alvo tem que ser a PEÇA (tpid), senão ele foi atrás do centróide do gigante");
  const alvo=com.w.entityById.get(com.tpid);
  assert.ok(alvo&&alvo.r===pequeno,`mordeu a peça errada (r=${alvo?alvo.r:"?"}): tem que ser a pequena, não a de 300`);
  // ⚠️ Controle negativo: sem ele, o teste acima passaria por um bot que simplesmente caça tudo.
  assert.notEqual(cena(false).mode,"hunt","sem pedaço comível o mesmo gigante NÃO pode virar presa");
});

test("arena Livre: o salto virou ataque de verdade, e o escudo não vaza mais no gatilho", ()=>{
  // ⚠️ A arena nasceu Battle Royale (weapons+zone) e o modo Livre — o que o pedido citou — nunca era medido.
  // Aqui vai o Livre de verdade: sem zona, sem armas especiais e COM respawn de bot, como Sim._died faz.
  // ⚠️ DOZE sementes, não três, e o motivo é medição: o salto é um evento RARO (média 6,8 por sala de 24
  // bots) e o total de UMA sala vai de **1 a 15** — com três, este assert é uma loteria que reprova código
  // correto. Foi o que aconteceu quando o split passou a cobrar UM nível de escudo em vez do escudo
  // inteiro: as três sementes caíram de 21 para 14 e acusaram uma regressão que não existe — nas doze, os
  // dois lados dão exatamente **81 saltos**, e o tempo em modo hunt nem se mexe (1351 contra 1357). Doze
  // arenas custam 8,4 s.
  const rs=[11,12,13,14,15,16,17,18,19,20,21,22].map(seed=>arena({seed,n:ROOM.BOTS,zone:false,weapons:false,respawn:true}));
  const soma=f=>rs.reduce((a,r)=>a+f(r),0);
  const split=soma(r=>r.uso.split),fire=soma(r=>r.uso.fire);
  // piso do denominador ANTES de qualquer razão: razão sobre amostra minúscula é o que derrubou o assert
  // removido lá em cima.
  // O piso fica ENTRE os dois cérebros, não colado no medido: o cérebro anterior dava ~1,7 saltos por sala
  // (~20 aqui) e este dá 81. .15 por bot é 2,2× o de lá e 1,9× abaixo daqui — larga o bastante para o
  // ruído da arena, que é grande, e apertada o bastante para acusar a volta de um veto no salto.
  assert.ok(split>=rs.length*ROOM.BOTS*.15,`só ${split} saltos em ${rs.length} salas de ${ROOM.BOTS}: o bot voltou a não atacar dividindo`);
  assert.ok(soma(r=>r.splitEat)>0,"nenhum abate depois de um salto: está saltando à toa");
  assert.ok(fire/split<12,`${(fire/split).toFixed(1)} mísseis por salto — o míssil voltou a ser a única coisa que o bot faz`);
  // ESTRUTURAL, não calibrado: applyFire só cobra escudo quando o tiro NÃO é interceptação, ou seja todo
  // nível pago no gatilho é um tiro que ninguém precisava dar. O bot só pode pagar escudo por escolha: saltar.
  const eSplit=soma(r=>r.esc.split),eFire=soma(r=>r.esc.fire);
  // medido: 81 níveis no gatilho antes, 0 depois — o bot só paga escudo por ESCOLHA, que é saltar.
  assert.ok(eFire<=eSplit*.25,`escudo queimado no gatilho (${eFire}) contra o gasto no salto (${eSplit}): o vazamento voltou`);
});

test("manso: o preenchimento NÃO foge de quem está sob a graça — e volta a fugir no primeiro abate", ()=>{
  // `BOT.NOVATO_MANSO` (o 1º abate é de graça). A asserção primária é `press`: ele sai de uma soma, não de um
  // sorteio, então a cena não depende do rng do cérebro. `mode` é a secundária — é o que o jogador VÊ.
  // Bot r=40 no slot 0; a "pessoa" r=60 (massa 3.600 < NOVATO_MASS) a 300 px, recém-nascida.
  const antes=BOT.NOVATO_MANSO;
  const cena=(modo,{ab=0,gente=true,semGraca=false,zona=false}={})=>{
    BOT.NOVATO_MANSO=modo;
    const w=palco(13);
    w.addPlayer(0,{r:40,isBot:true,x:3000,y:3000});
    w.addPlayer(1,{r:60,isBot:!gente,x:3300,y:3000,ab});
    if(semGraca)w.players.get(1).graceUntil=0;          // exatamente o que `rules.eatPiece` faz com quem abateu
    if(zona)w.setZone({x0:3000,y0:3000,r0:9000,x1:3000,y1:3000,r1:9000,t0:0,t1:Infinity});   // há Battle Royale rolando
    const b=cerebro(w,0,()=>{},3,2);                    // persona 2: `flee` 1, sem viés de estilo
    for(let i=0;i<60;i++){w.setTarget(0,3000,3000);w.setTarget(1,3300,3000);b.act(w.tick);w.step();}
    return b;};
  try{
    assert.ok(BOT.NOVATO_MASS>3600&&BOT.SPAWN_GRACE_TICKS>0,"a cena presume a graça de fábrica: sem ela não há o que medir");
    const off=cena("off");
    assert.ok(off.press>0,"`off` é o comportamento de SEMPRE: a pessoa maior é ameaça");
    assert.equal(off.mode,"flee");assert.equal(off.target,1);
    const todos=cena("todos");
    assert.equal(todos.press,0,"`todos`: quem está sob a graça não conta como ameaça");
    assert.notEqual(todos.mode,"flee","...e portanto o bot não foge dela");
    // a 2ª metade: perto dela ele ANDA DEVAGAR (alvo dentro de SPEED.RAMP = fração da velocidade). Só não fugir
    // deixava a isca vagando a vmax, ~1,39× mais rápida que quem tem de alcançá-la.
    const passo=b=>{const pc=b.w.piecesOf(0)[0];return Math.hypot(b.tx-pc.x,b.ty-pc.y);};
    assert.ok(passo(todos)<=SPEED.RAMP*BOT.MANSO_K+1e-6,`manso tem que andar a ${BOT.MANSO_K} da velocidade (alvo a ${passo(todos).toFixed(1)} px da peça)`);
    assert.ok(passo(off)>SPEED.RAMP,"...e em `off` o bot corre como sempre");
    assert.ok(cena("metade",{ab:0}).press>0,"`metade`: o braço 0 é o CONTROLE — o bot foge como sempre");
    assert.equal(cena("metade",{ab:1}).press,0,"`metade`: só o braço 1 recebe a regra");
    assert.ok(cena("todos",{semGraca:true}).press>0,"o primeiro abate zera a graça — e o bot VOLTA a fugir (um abate, não uma sala mansa)");
    assert.ok(cena("todos",{gente:false}).press>0,"controle negativo: bot × bot não muda");
    assert.ok(cena("todos",{zona:true}).press>0,"no Battle Royale a sala inteira nasce sob graça: lá a regra NÃO vale");
  }finally{BOT.NOVATO_MANSO=antes;}
});

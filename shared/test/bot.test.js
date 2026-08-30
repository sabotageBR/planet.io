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
import {BOT,BR,PLAYER,FOOD,STAR,SPEED,TICK_HZ,ZONE} from "../src/constants.js";

const TURN_MAX=BOT.SKILLS.reduce((a,s)=>Math.max(a,s.turn),0);
const JIT=BOT.HAND.JITTER_STEP*BOT.SKILLS.reduce((a,s)=>Math.max(a,s.jitter),0);

/** Roda uma partida e devolve tudo que dá para medir dela. */
function arena({seed=1,n=40,ticks=7200,zone=true,team=0}={}){
  const w=createWorld({seed,food:FOOD.COUNT,asteroids:true,stars:STAR.COUNT,holes:0,weapons:true});
  const rng=createRng(seed*104729+7);
  const uso={split:0,fire:0,swap:0,eject:0,parado:0,inputs:0},giro=[],ang=new Map();
  const emit=(slot,c)=>{
    const ps=w.players.get(slot);if(!ps)return;
    uso.inputs++;
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
  const brains=[],ring=Math.min(w.w,w.h)*BR.SPAWN_RING;
  for(let s=0;s<n;s++){const a=s/n*Math.PI*2;
    w.addPlayer(s,{r:PLAYER.START_R,isBot:true,missiles:BR.START_AMMO,team:team?Math.floor(s/team):-1,
      x:w.w/2+Math.cos(a)*ring,y:w.h/2+Math.sin(a)*ring});
    brains.push(new BotBrain(w,s,rng,emit));}
  const z=zone?createZone(0):null;if(z)w.setZone(z);
  const morte=[],gas=new Map(),vivo=new Map();
  let ms=0,eat=0,splitEat=0;const splitAt=new Map();
  for(let i=0;i<ticks;i++){
    if(z)stepZone(z,w.tick,rng);
    const t0=process.hrtime.bigint();
    for(const b of brains){const ps=w.players.get(b.slot);if(ps&&ps.alive)b.act(w.tick);}
    ms+=Number(process.hrtime.bigint()-t0)/1e6;
    for(const b of brains){const ps=w.players.get(b.slot);if(ps&&ps.alive&&(ps.splitReq))splitAt.set(b.slot,w.tick);}
    w.step();
    for(const e of w.events){
      if(e.type==="EAT"){eat++;const t=splitAt.get(e.killerSlot);if(t!==undefined&&w.tick-t<180)splitEat++;}
      if(e.type==="PLAYER_DEAD")morte.push({slot:e.slot,tick:w.tick,cause:e.cause,skill:brains[e.slot].s.id});}
    const zc=w.zoneNow();
    for(const b of brains){const ps=w.players.get(b.slot);if(!ps||!ps.alive)continue;
      const k=b.s.id;vivo.set(k,(vivo.get(k)|0)+1);
      if(zc){const pc=ps.pieces.find(p=>!p.dead);if(!pc)continue;
        const dx=pc.x-zc.x,dy=pc.y-zc.y;if(dx*dx+dy*dy>zc.r*zc.r)gas.set(k,(gas.get(k)|0)+1);}}
    let viv=0;for(const p of w.players.values())if(p.alive)viv++;
    if(viv<=1)break;}
  giro.sort((a,b)=>a-b);
  return{w,brains,morte,uso,gas,vivo,eat,splitEat,ms,ticks:w.tick,
    giro:{p50:giro[giro.length>>1]||0,p99:giro[Math.floor(giro.length*.99)]||0},
    vivos:[...w.players.values()].filter(p=>p.alive).length};
}
const chave=w=>w.pieces.map(p=>`${p.owner}:${p.x.toFixed(3)}:${p.y.toFixed(3)}:${p.r.toFixed(3)}`).join("|");

test("arena: a sala se resolve na porrada, não no gás", ()=>{
  const a=arena({seed:3});
  const c={};for(const m of a.morte)c[m.cause]=(c[m.cause]|0)+1;
  assert.ok(a.morte.length>=10,`poucas mortes (${a.morte.length}): os bots não estão se enfrentando`);
  const gas=c.zone||0;
  assert.ok(gas/a.morte.length<.35,`gás matou ${gas}/${a.morte.length} — a zona não pode ser a assassina principal`);
  assert.ok((c.eaten||0)>=a.morte.length*.5,"a maioria das mortes tem que ser de ser comido");
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
  const a=arena({seed:5,n:40,team:4,ticks:4800});
  assert.ok(a.uso.eject>0,"ninguém passou massa para o companheiro");
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

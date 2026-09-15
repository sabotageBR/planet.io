// ── A BANCADA DO NOVATO: DE QUE IDADE MORRE QUEM ACABOU DE CHEGAR ────────────────
// Uma sala do Livre inteira, sem servidor e sem rede — World + BotBrain, o mesmo caminho de `shared/test/bot.test.js`
// —, com HUMANOS pilotados por um cérebro de bot da pior perícia ("ruim"). Ela existe por causa de um
// histograma de produção: nas vidas 2+ dos jogadores da Poki, as mortes por bot saltam de ~20 para 124 por
// segundo aos 48 s de vida — três segundos depois de a graça de 45 s acabar — e só voltam ao normal perto
// dos 60 s. Um Fit Test custa dias e 500 jogadores; esta bancada responde em um minuto se uma mudança na
// proteção apaga o pico ou só o empurra para frente.
//
// ⚠️ ELA ESPELHA O PAINEL DE PRODUÇÃO, não os padrões do código — `admin_settings` vence `constants.js`, e
// medir com os padrões é medir outro jogo. Os números estão em `PROD`, logo abaixo; confira-os no banco
// antes de acreditar numa conclusão.
// ⚠️ O humano daqui não é um humano: é o cérebro "ruim", que foge e caça melhor que um novato de celular.
// Serve para COMPARAR duas regras na mesma sala, nunca para prever a retenção.
//
// ⚠️ **O QUE ELA JÁ RESPONDEU (15/09/2026, 12 salas × 15 min × 8 novatos):** o degrau dos 45 s era
// real (vidas 2+: 17 mortes por bot aos 40–45 s contra 44 aos 45–50) — e uma SAÍDA GRADUAL da janela
// (liberar primeiro os predadores de tamanho parecido, e não fechar com um encostado) apagou o degrau
// mas NÃO as mortes: 683 → 670, só empurradas para os 55–75 s. O código foi desfeito. O que corta é o
// TETO DE MASSA do novato, que já existe no painel e estava em 0: `--massa 6000` → 596 mortes,
// `12000` → 397 (−42%, vida mediana 68 → 112 s), `20000` → 345. O ganho satura perto de 12 mil.
//
//   node scripts/novato-bancada.mjs [--seeds 6] [--min 12] [--humanos 5] [--massa 12000]
// @ts-check
import {createWorld} from "../shared/src/physics/world.js";
import {BotBrain} from "../shared/src/bot.js";
import {createRng} from "../shared/src/rng.js";
import {INPUT_FLAG} from "../shared/src/protocol/constants.js";
import {BOT,PLAYER,FOOD,STAR,SPEED,SPLIT,ROOM,MISSILE,TICK_HZ,botSpawnR} from "../shared/src/constants.js";

const arg=(k,d)=>{const i=process.argv.indexOf("--"+k);return i>0?+process.argv[i+1]:d;};
const SEEDS=arg("seeds",6),MIN=arg("min",12),HUM=arg("humanos",5),WARM=arg("aquece",4);

// O painel de produção em 15/09/2026 (tabela `admin_settings`). Sem isto a bancada mede os padrões do código.
const PROD={NOVATO_MASS:0,SPAWN_MASS:2100,SPEED_MUL:1.5,SPLIT_MIN_R:44,BOTS:50,SPAWN_CD:0};
BOT.NOVATO_MASS=PROD.NOVATO_MASS;PLAYER.SPAWN_R=Math.sqrt(PROD.SPAWN_MASS);SPEED.MUL=PROD.SPEED_MUL;
SPLIT.MIN_R=PROD.SPLIT_MIN_R;MISSILE.SPAWN_CD_TICKS=PROD.SPAWN_CD;
// A alavanca que se quer comparar: o teto de massa do novato (`BOT.NOVATO_MASS`, o mesmo do painel).
const massa=arg("massa",-1);
if(massa>=0)BOT.NOVATO_MASS=massa;

function sala(seed){
  const w=createWorld({seed,food:FOOD.COUNT,asteroids:true,stars:STAR.COUNT,holes:0,weapons:false});
  const rng=createRng(seed*7919+3),n=PROD.BOTS;
  const emit=(slot,c)=>{const ps=w.players.get(slot);if(!ps)return;
    w.setTarget(slot,c.tx,c.ty);
    if(c.flags&INPUT_FLAG.SPLIT)w.requestSplit(slot);
    if(c.flags&INPUT_FLAG.EJECT)w.requestEject(slot);
    w.setEjectHold(slot,(c.flags&INPUT_FLAG.EJECT_HOLD)!==0);
    if(c.flags&INPUT_FLAG.FIRE)w.requestFire(slot,(c.flags&INPUT_FLAG.AIM)!==0);};
  const brains=new Map(),humano=new Set(),nasceu=new Map(),vidas=new Map();
  const cerebro=(slot,ruim)=>{const b=new BotBrain(w,slot,rng,emit);if(ruim)b.s=BOT.SKILLS[0];brains.set(slot,b);};
  // os bots primeiro, e a sala AQUECE sem ninguém: é numa sala que já está rodando que o novato chega
  for(let s=0;s<n-HUM;s++){w.addPlayer(s,{isBot:true,r:botSpawnR(rng,s,0)});cerebro(s,false);}
  const mortes=[],pendente=new Map(),ultimoEat=new Map();
  const total=(WARM+MIN)*60*TICK_HZ;
  for(let i=0;i<total;i++){
    const t=w.tick;
    // os humanos chegam depois do aquecimento, espaçados — como numa sala de verdade
    if(i>=WARM*60*TICK_HZ){const k=Math.floor((i-WARM*60*TICK_HZ)/(20*TICK_HZ));
      for(let h=0;h<Math.min(HUM,k+1);h++){const slot=n-HUM+h;
        if(!humano.has(slot)){humano.add(slot);w.addPlayer(slot,{isBot:false});cerebro(slot,true);nasceu.set(slot,t);vidas.set(slot,1);}}}
    for(const [slot,at] of pendente)if(t>=at){pendente.delete(slot);
      w.respawnPlayer(slot,humano.has(slot)?{}:{r:botSpawnR(rng,0,0)});brains.get(slot).reset();
      if(humano.has(slot)){nasceu.set(slot,t);vidas.set(slot,vidas.get(slot)+1);}}
    for(const b of brains.values()){const ps=w.players.get(b.slot);if(ps&&ps.alive)b.act(t);}
    w.step();
    for(const e of w.events){
      if(e.type==="EAT"&&e.lastPiece)ultimoEat.set(e.victimSlot,e.killerSlot);
      if(e.type!=="PLAYER_DEAD")continue;
      if(humano.has(e.slot)){const k=ultimoEat.get(e.slot);
        mortes.push({idade:(w.tick-nasceu.get(e.slot))/TICK_HZ,vida:vidas.get(e.slot),cause:e.cause,
          algoz:k==null?"-":humano.has(k)?"humano":"bot"});
        pendente.set(e.slot,w.tick+Math.round((vidas.get(e.slot)===1?1.2:4)*TICK_HZ));}
      else pendente.set(e.slot,w.tick+1);}}
  return mortes;
}

const todas=[];let horas=0;
for(let s=1;s<=SEEDS;s++){const m=sala(s);todas.push(...m);horas+=HUM*MIN/60;}
const bot=todas.filter(m=>m.algoz==="bot");
const faixa=(arr,a,b)=>arr.filter(m=>m.idade>=a&&m.idade<b).length;
const v2=bot.filter(m=>m.vida>1),v1=bot.filter(m=>m.vida===1);
console.log(`NOVATO_MASS=${BOT.NOVATO_MASS}  salas=${SEEDS} × ${MIN} min × ${HUM} novatos`);
console.log(`mortes de novato: ${todas.length}  (por bot ${bot.length}, por humano ${todas.filter(m=>m.algoz==="humano").length})  → ${(todas.length/horas).toFixed(1)} por hora-jogador`);
console.log("vidas 2+, mortes por bot por faixa de idade (s):");
let lin="";for(let a=30;a<90;a+=5)lin+=`${a}-${a+5}:${faixa(v2,a,a+5)}  `;console.log("  "+lin);
console.log(`  pico 45-60 s = ${faixa(v2,45,60)}  contra 30-45 s = ${faixa(v2,30,45)} e 60-75 s = ${faixa(v2,60,75)}`);
console.log("1ª vida, mortes por bot por faixa de idade (s):");
lin="";for(let a=75;a<135;a+=5)lin+=`${a}-${a+5}:${faixa(v1,a,a+5)}  `;console.log("  "+lin);
const idades=todas.map(m=>m.idade).sort((a,b)=>a-b);
console.log(`vida mediana até morrer: ${idades.length?idades[idades.length>>1].toFixed(0):"—"} s`);

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
// ⚠️ **E O QUE ELA PASSOU A MEDIR (17/09/2026): O PRIMEIRO ABATE.** O banco mostrou que quem vai embora não
// está morrendo — 54% das primeiras vidas reais acabam com o jogador fechando a aba VIVO, e 81% sem um
// único abate. `--manso` liga `BOT.NOVATO_MANSO` (o preenchimento não foge de quem está sob a graça) e a
// saída ganha "% de vidas com o 1º abate em ≤60 s". Em `metade` os novatos de índice ímpar são o braço 1
// e os pares o controle, NA MESMA SALA — que é como o A/B roda em produção.
//
//   node scripts/novato-bancada.mjs [--seeds 6] [--min 12] [--humanos 5] [--massa 12000] [--manso off|metade|todos]
// @ts-check
import {createWorld} from "../shared/src/physics/world.js";
import {BotBrain} from "../shared/src/bot.js";
import {createRng} from "../shared/src/rng.js";
import {INPUT_FLAG} from "../shared/src/protocol/constants.js";
import {BOT,PLAYER,FOOD,STAR,SPEED,SPLIT,ROOM,MISSILE,TICK_HZ,botSpawnR} from "../shared/src/constants.js";

const arg=(k,d)=>{const i=process.argv.indexOf("--"+k);return i>0?+process.argv[i+1]:d;};
const argS=(k,d)=>{const i=process.argv.indexOf("--"+k);return i>0?String(process.argv[i+1]):d;};   // `arg` faz `+valor`: serve para número, não para nome
const SEEDS=arg("seeds",6),MIN=arg("min",12),HUM=arg("humanos",5),WARM=arg("aquece",4);

// O painel de produção em 17/09/2026 (tabela `admin_settings`). Sem isto a bancada mede os padrões do código.
// (Em 15/09 era NOVATO_MASS 0 e SPEED_MUL 1.5 — os números do cabeçalho acima foram tirados com aqueles.)
const PROD={NOVATO_MASS:12000,SPAWN_MASS:2100,SPEED_MUL:1,SPLIT_MIN_R:44,BOTS:50,SPAWN_CD:0};
BOT.NOVATO_MASS=PROD.NOVATO_MASS;PLAYER.SPAWN_R=Math.sqrt(PROD.SPAWN_MASS);SPEED.MUL=PROD.SPEED_MUL;
SPLIT.MIN_R=PROD.SPLIT_MIN_R;MISSILE.SPAWN_CD_TICKS=PROD.SPAWN_CD;
// A alavanca que se quer comparar: o teto de massa do novato (`BOT.NOVATO_MASS`, o mesmo do painel).
const massa=arg("massa",-1);
if(massa>=0)BOT.NOVATO_MASS=massa;
// A outra alavanca: o preenchimento não foge de quem está sob a graça (`BOT.NOVATO_MANSO`, o mesmo do painel).
const MANSO=argS("manso","off");
if(!BOT.NOVATO_MANSOS.some(o=>o.v===MANSO)){console.error(`--manso tem que ser um destes: ${BOT.NOVATO_MANSOS.map(o=>o.v).join(", ")}`);process.exit(1);}
BOT.NOVATO_MANSO=MANSO;

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
  // uma linha por VIDA de novato: a graça (e com ela o manso) rearma a cada nascimento, então a unidade é a vida
  /** @type {{slot:number,vida:number,ab:number,nasceu:number,abate:number|null}[]} */const lista=[];const vidaDe=new Map();
  const abre=slot=>{const v={slot,vida:vidas.get(slot),ab:w.players.get(slot).ab|0,nasceu:w.tick,abate:null};lista.push(v);vidaDe.set(slot,v);};
  const total=(WARM+MIN)*60*TICK_HZ;
  for(let i=0;i<total;i++){
    const t=w.tick;
    // os humanos chegam depois do aquecimento, espaçados — como numa sala de verdade
    if(i>=WARM*60*TICK_HZ){const k=Math.floor((i-WARM*60*TICK_HZ)/(20*TICK_HZ));
      for(let h=0;h<Math.min(HUM,k+1);h++){const slot=n-HUM+h;
        if(!humano.has(slot)){humano.add(slot);w.addPlayer(slot,{isBot:false,ab:h&1});cerebro(slot,true);nasceu.set(slot,t);vidas.set(slot,1);abre(slot);}}}
    for(const [slot,at] of pendente)if(t>=at){pendente.delete(slot);
      w.respawnPlayer(slot,humano.has(slot)?{}:{r:botSpawnR(rng,0,0)});brains.get(slot).reset();
      if(humano.has(slot)){nasceu.set(slot,t);vidas.set(slot,vidas.get(slot)+1);abre(slot);}}
    for(const b of brains.values()){const ps=w.players.get(b.slot);if(ps&&ps.alive)b.act(t);}
    w.step();
    for(const e of w.events){
      if(e.type==="EAT"&&e.lastPiece)ultimoEat.set(e.victimSlot,e.killerSlot);
      // QUALQUER bocado, não só a última peça: é o mesmo fato que zera a graça em `rules.eatPiece`
      if(e.type==="EAT"&&humano.has(e.killerSlot)){const v=vidaDe.get(e.killerSlot);if(v&&v.abate==null)v.abate=(w.tick-v.nasceu)/TICK_HZ;}
      if(e.type!=="PLAYER_DEAD")continue;
      if(humano.has(e.slot)){const k=ultimoEat.get(e.slot);
        mortes.push({idade:(w.tick-nasceu.get(e.slot))/TICK_HZ,vida:vidas.get(e.slot),cause:e.cause,
          algoz:k==null?"-":humano.has(k)?"humano":"bot"});
        pendente.set(e.slot,w.tick+Math.round((vidas.get(e.slot)===1?1.2:4)*TICK_HZ));}
      else pendente.set(e.slot,w.tick+1);}}
  // só as vidas que TIVERAM 60 s de simulação pela frente: as nascidas no último minuto não podem ser cobradas
  return {mortes,vidas:lista.filter(v=>v.nasceu<=w.tick-60*TICK_HZ)};
}

const todas=[],vidasTodas=[];let horas=0;
for(let s=1;s<=SEEDS;s++){const r=sala(s);todas.push(...r.mortes);vidasTodas.push(...r.vidas);horas+=HUM*MIN/60;}
const bot=todas.filter(m=>m.algoz==="bot");
const faixa=(arr,a,b)=>arr.filter(m=>m.idade>=a&&m.idade<b).length;
const v2=bot.filter(m=>m.vida>1),v1=bot.filter(m=>m.vida===1);
console.log(`NOVATO_MASS=${BOT.NOVATO_MASS}  NOVATO_MANSO=${BOT.NOVATO_MANSO}  salas=${SEEDS} × ${MIN} min × ${HUM} novatos`);
console.log(`mortes de novato: ${todas.length}  (por bot ${bot.length}, por humano ${todas.filter(m=>m.algoz==="humano").length})  → ${(todas.length/horas).toFixed(1)} por hora-jogador`);
console.log("vidas 2+, mortes por bot por faixa de idade (s):");
let lin="";for(let a=30;a<90;a+=5)lin+=`${a}-${a+5}:${faixa(v2,a,a+5)}  `;console.log("  "+lin);
console.log(`  pico 45-60 s = ${faixa(v2,45,60)}  contra 30-45 s = ${faixa(v2,30,45)} e 60-75 s = ${faixa(v2,60,75)}`);
console.log("1ª vida, mortes por bot por faixa de idade (s):");
lin="";for(let a=75;a<135;a+=5)lin+=`${a}-${a+5}:${faixa(v1,a,a+5)}  `;console.log("  "+lin);
const idades=todas.map(m=>m.idade).sort((a,b)=>a-b);
console.log(`vida mediana até morrer: ${idades.length?idades[idades.length>>1].toFixed(0):"—"} s`);
// ── O PRIMEIRO ABATE ── (a métrica do `--manso`: de quantas vidas sai um abate no primeiro minuto)
const med=a=>{const o=a.slice().sort((x,y)=>x-y);return o.length?o[o.length>>1].toFixed(0)+" s":"—";};
const linhaAbate=(rot,vs)=>{const com=vs.filter(v=>v.abate!=null),cedo=com.filter(v=>v.abate<=60);
  console.log(`  ${rot.padEnd(22)} vidas ${String(vs.length).padStart(4)}  · 1º abate ≤60 s: ${(vs.length?100*cedo.length/vs.length:0).toFixed(1).padStart(5)}%  · algum abate: ${(vs.length?100*com.length/vs.length:0).toFixed(1).padStart(5)}%  · mediana até o 1º: ${med(com.map(v=>v.abate))}`);};
console.log("primeiro abate do novato, por VIDA:");
const bracos=BOT.NOVATO_MANSO==="metade"?[[0,"controle (ab 0)"],[1,"manso (ab 1)"]]:[[-1,"todos"]];
for(const [ab,rot] of bracos){const vs=vidasTodas.filter(v=>ab<0||v.ab===ab);
  linhaAbate(rot+" · 1ª vida",vs.filter(v=>v.vida===1));linhaAbate(rot+" · vidas 2+",vs.filter(v=>v.vida>1));}

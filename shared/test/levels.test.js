// XP/nível/K-D: as propriedades que, quebradas, aparecem como "a barra encheu e eu não subi de nível".
import test from "node:test";
import assert from "node:assert/strict";
import {xpForLevel,levelFromXp,levelProgress,matchXp,kdOf,isDeath,DEATH_CAUSES,LEVEL,XP} from "../src/levels.js";

test("levelFromXp é o inverso EXATO de xpForLevel em toda a curva",()=>{
  // É esta a propriedade que o arredondamento de xpForLevel quebra sem as correções de ±1 — e o sintoma
  // seria o jogador ver a barra cheia sem subir de nível.
  for(let L=1;L<=LEVEL.MAX;L++){
    assert.equal(levelFromXp(xpForLevel(L)),L,`nível ${L}`);
    if(L>1)assert.equal(levelFromXp(xpForLevel(L)-1),L-1,`véspera do nível ${L}`);
  }
});

test("a curva é monotônica, começa em 0 e para no teto",()=>{
  assert.equal(xpForLevel(1),0);
  for(let L=2;L<=LEVEL.MAX;L++)assert.ok(xpForLevel(L)>xpForLevel(L-1),`nível ${L} não cresceu`);
  assert.equal(levelFromXp(0),1);
  assert.equal(levelFromXp(-5),1);
  assert.equal(levelFromXp(xpForLevel(LEVEL.MAX)*10),LEVEL.MAX);
  assert.equal(levelFromXp(NaN),1);
});

test("a progressão nunca sai de [0,1] e satura no nível máximo",()=>{
  for(const xp of [0,1,84,85,5000,xpForLevel(30),xpForLevel(LEVEL.MAX)+7]){
    const p=levelProgress(xp);
    assert.ok(p.pct>=0&&p.pct<=1,`pct fora de [0,1] em ${xp}`);
    assert.ok(p.need>=1);assert.ok(p.into>=0);
  }
  assert.equal(levelProgress(xpForLevel(LEVEL.MAX)).pct,1);
});

test("matchXp: teto, piso e a curva ancorada nas partidas de referência",()=>{
  const mediana={durationS:240,score:4000,kills:1,botKills:2,food:250,top1Ticks:0};
  const boa={durationS:720,score:25000,kills:5,botKills:6,food:900,top1Ticks:10800};
  assert.ok(matchXp(mediana)>50&&matchXp(mediana)<110,`vida mediana deu ${matchXp(mediana)}`);
  assert.ok(matchXp(boa)>200&&matchXp(boa)<400,`vida boa deu ${matchXp(boa)}`);
  assert.ok(matchXp(boa)>matchXp(mediana));
  assert.equal(matchXp({durationS:99999,score:9e9,kills:999,botKills:999,food:9e6,top1Ticks:9e6}),XP.CAP);
  assert.equal(matchXp(null),0);
  assert.ok(matchXp({durationS:0,score:0,kills:0,botKills:0,food:0,top1Ticks:0})>=0);
});

test("o bônus de colocação só vale onde colocação SIGNIFICA alguma coisa",()=>{
  const base={durationS:60,score:0,kills:0,botKills:0,food:0,top1Ticks:0};
  // No Livre a Sim manda placement mesmo fora do último-vivo: é lixo, e sem a guarda daria bônus de
  // campeão para quem morreu cedo.
  assert.equal(matchXp({...base,cause:"eaten",placement:1,players:30}),matchXp(base));
  // Battle Royale e fim de rodada, sim — e só com sala de gente.
  assert.ok(matchXp({...base,mode:1,cause:"eliminated",placement:1,players:30})>matchXp(base));
  assert.equal(matchXp({...base,mode:1,cause:"eliminated",placement:1,players:3}),matchXp(base));
});

test("K/D não divide por zero e trata 0 mortes como os jogos tratam",()=>{
  assert.equal(kdOf(5,0),5);assert.equal(kdOf(0,0),0);assert.equal(kdOf(10,4),2.5);assert.equal(kdOf(-3,-1),0);
});

test("a política de morte cobre todo `cause` do CHECK de matches",()=>{
  // Se alguém acrescentar uma causa nova sem classificá-la, o ranking de K/D silenciosamente ignoraria
  // aquelas mortes. Este teste é o que cobra a classificação.
  const TODAS=["eaten","blackhole","left","shutdown","round","zone","eliminated","survived"];
  const VIVO=["left","shutdown","round","survived"];
  for(const c of TODAS)assert.equal(isDeath(c),!VIVO.includes(c),`causa ${c}`);
  for(const c of DEATH_CAUSES)assert.ok(TODAS.includes(c),`DEATH_CAUSES tem ${c}, que não existe no CHECK`);
  assert.equal(isDeath("inventada"),false);
});

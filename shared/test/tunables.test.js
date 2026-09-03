// ── Parâmetros alteráveis em runtime (painel /admin) ──
// O que está sob teste aqui não é "o setter funciona": é que escrever no objeto de `constants.js` CHEGA à
// física, no laço, sem indireção nenhuma — que é a premissa inteira do mecanismo (ver shared/src/tunables.js).
import {test} from "node:test";
import assert from "node:assert/strict";
import {createWorld} from "../src/physics/index.js";
import {POWERUP,FOOD,FOOD_TYPE,PLAYER,BOT_LLM,ROUND,MODES,MODE,TICK_HZ} from "../src/constants.js";
import {PIECE_FLAG} from "../src/protocol/constants.js";
import {listTunables,applyTunable,resetTunable,readTunable,TUNABLE_BY_KEY,GRUPOS} from "../src/tunables.js";

const empty=(seed=1)=>createWorld({seed,food:0,asteroids:false,holes:0,stars:0,decay:false});
/** Uma peça de raio `r` come um ímã: ela ganha o poder? (2 passos — o flag sai na integração seguinte) */
const pegaIma=r=>{const w=empty(400+Math.round(r)),pc=w.addPlayer(0,{x:3000,y:3000,r});w.setTarget(0,3000,3000);
  const f=w.spawnFood();f.type=FOOD_TYPE.MAGNET;f.x=3000;f.y=3000;f.r=FOOD.SPECIAL_R;w.moveFood(f);w.step();w.step();
  return{ativo:pc.magnetUntil>w.tick,flag:!!(pc.flags&PIECE_FLAG.MAGNET)};};

test("tunables: o teto do ímã é dito em MASSA e chega à física no tick seguinte",()=>{
  const chave='POWERUP.MAGNET_MAX_R';
  try{
    // O padrão: 100 mil de massa (√100000 ≈ 316 px de raio)
    assert.ok(Math.abs(readTunable(chave)-100000)<400,`o padrão é ~100 mil de massa (deu ${readTunable(chave)})`);
    assert.ok(pegaIma(300).ativo,"uma peça de r=300 (massa 90 mil) pega o ímã");
    assert.ok(!pegaIma(350).ativo,"uma de r=350 (massa 122 mil) não pega");
    // O admin sobe para 250 mil: a MESMA peça de r=350 passa a pegar, sem reiniciar nada
    applyTunable(chave,250000);
    assert.ok(Math.abs(POWERUP.MAGNET_MAX_R-500)<1e-6,"a constante VIVA foi escrita (√250000 = 500 px)");
    assert.ok(pegaIma(350).ativo,"e a física enxerga na hora — é a premissa do mecanismo inteiro");
    assert.ok(!pegaIma(520).ativo,"o teto novo continua sendo um teto");
    // E o reset volta ao valor de constants.js, capturado no import
    resetTunable(chave);
    assert.ok(Math.abs(readTunable(chave)-100000)<400,"restaurar devolve o padrão do arquivo");
    assert.ok(!pegaIma(350).ativo,"e a física volta junto");
  }finally{resetTunable(chave);}});

test("tunables: a lista branca é o mecanismo — nada fora dela é gravável",()=>{
  assert.throws(()=>applyTunable('PLAYER.MAX_PIECES',99),/unknown_key/,"chave fora da lista é recusada");
  assert.throws(()=>applyTunable('__proto__',1),/unknown_key/);
  assert.throws(()=>applyTunable('POWERUP.MAGNET_MAX_R',-5),/out_of_range/,"abaixo do mínimo");
  assert.throws(()=>applyTunable('POWERUP.MAGNET_MAX_R',1e12),/out_of_range/,"acima do máximo");
  assert.throws(()=>applyTunable('POWERUP.MAGNET_MAX_R','muito'),/out_of_range/,"texto não é número");
  assert.equal(PLAYER.MAX_PIECES,16,"e nada disso encostou na constante");});

test("tunables: todo descritor é coerente (faixa contém o padrão, e o escopo é declarado)",()=>{
  const gs=new Set(GRUPOS.map(g=>g[0]));
  for(const t of listTunables()){
    assert.ok(t.label,`${t.key}: precisa de rótulo — a UI é montada a partir daqui`);
    assert.ok(gs.has(t.grupo),`${t.key}: o grupo '${t.grupo}' não está em GRUPOS, e a seção não seria desenhada`);
    if(t.type==='opt'){
      assert.ok(t.options&&t.options.length>1,`${t.key}: uma escolha com menos de duas opções não é escolha`);
      assert.ok(t.options.some(o=>o.v===t.def),`${t.key}: o padrão tem que ser uma das opções`);
      for(const o of t.options)assert.ok(o.v&&o.label,`${t.key}: toda opção precisa de id e rótulo`);
    }else{
      assert.ok(t.min<=t.def&&t.def<=t.max,`${t.key}: o padrão (${t.def}) tem que caber na faixa ${t.min}–${t.max}`);
      assert.ok(t.unit,`${t.key}: número sem unidade é número que o admin não sabe ler`);}
    assert.ok(t.scope==='server'||t.scope==='both'||t.scope==='wire',`${t.key}: escopo tem que ser 'server', 'both' ou 'wire'`);
    // ⚠️ 'both' significa que a FÍSICA do cliente lê o número, e ele tem a própria cópia do bundle: a rota
    // do painel RECUSA essas chaves (501) em vez de gravar um valor que só metade do jogo enxerga.
    // 'wire' também é lido pelo cliente, mas o servidor ENTREGA o valor no JSON `room`/`phase`, então os
    // dois lados ficam com o mesmo número — e por isso ela é gravável.
  }
  assert.ok(TUNABLE_BY_KEY.get('PLAYER.MAX_R').scope==='both',"PLAYER.MAX_R é lido pela predição do cliente");
  assert.ok(TUNABLE_BY_KEY.get('POWERUP.MAGNET_MAX_R').scope==='server',"o ímã é 100% servidor (predict.js não o consome)");});

test("tunables: a ESCOLHA tem lista branca própria — só um id declarado entra",()=>{
  const chave='BOT_LLM.ESTILO';
  try{
    assert.equal(readTunable(chave),BOT_LLM.ESTILO,"o padrão sai de constants.js");
    applyTunable(chave,'ofensa');
    assert.equal(BOT_LLM.ESTILO,'ofensa',"a constante VIVA foi escrita, como nos numéricos");
    // ⚠️ Esta é a razão de o tipo existir: sem ele o valor passaria por `Number()`, viraria NaN e seria
    // recusado — o painel diria "salvo" e o parâmetro não valeria nada.
    assert.throws(()=>applyTunable(chave,'sarcastico'),/out_of_range/,"id fora da lista de opções");
    assert.throws(()=>applyTunable(chave,7),/out_of_range/,"número também não é um id declarado");
    assert.equal(BOT_LLM.ESTILO,'ofensa',"e nenhuma das recusas encostou na constante");
    resetTunable(chave);
    assert.equal(BOT_LLM.ESTILO,'misto',"restaurar devolve o padrão do arquivo");
  }finally{resetTunable(chave);}});

// ── DURAÇÃO DA SALA DO LIVRE ────────────────────────────────────────────────
// Ela é dita em MINUTOS (como em todo o resto do jogo: o dono de sala escolhe minutos e `roundTicksOf`
// converte) e guardada em ticks. E o descritor do modo tem que ACOMPANHAR: ele copiava `ROUND.TICKS` na
// carga do módulo, e uma cópia congelada faria `modeOf(FREE).roundTicks` anunciar a duração antiga para
// sempre depois do primeiro clique no painel — sem erro em lugar nenhum.
test("tunables: a duração do Livre é dita em minutos, e o descritor do modo não fica para trás",()=>{
  const chave='ROUND.TICKS';
  try{
    assert.equal(readTunable(chave),30,"o padrão do arquivo são 30 min");
    assert.equal(MODES[MODE.FREE].roundTicks,ROUND.TICKS,"o modo Livre lê a constante viva, não uma cópia");
    applyTunable(chave,45);
    assert.equal(ROUND.TICKS,45*60*TICK_HZ,"minutos entram, ticks saem");
    assert.equal(MODES[MODE.FREE].roundTicks,45*60*TICK_HZ,"e o descritor do modo acompanha");
    assert.throws(()=>applyTunable(chave,0),/out_of_range/,"SEM FIM é escolha do DONO da sala, não o padrão do shard");
    resetTunable(chave);
    assert.equal(readTunable(chave),30,"restaurar devolve o padrão do arquivo");
  }finally{resetTunable(chave);}});

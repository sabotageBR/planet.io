// ── Parâmetros alteráveis em runtime (painel /admin) ──
// O que está sob teste aqui não é "o setter funciona": é que escrever no objeto de `constants.js` CHEGA à
// física, no laço, sem indireção nenhuma — que é a premissa inteira do mecanismo (ver shared/src/tunables.js).
import {test} from "node:test";
import assert from "node:assert/strict";
import {createWorld} from "../src/physics/index.js";
import {POWERUP,FOOD,FOOD_TYPE,PLAYER} from "../src/constants.js";
import {PIECE_FLAG} from "../src/protocol/constants.js";
import {listTunables,applyTunable,resetTunable,readTunable,TUNABLE_BY_KEY} from "../src/tunables.js";

const empty=(seed=1)=>createWorld({seed,food:0,asteroids:false,holes:0,stars:0,decay:false});
/** Uma peça de raio `r` come um ímã: ela ganha o poder? (2 passos — o flag sai na integração seguinte) */
const pegaIma=r=>{const w=empty(400+Math.round(r)),pc=w.addPlayer(0,{x:3000,y:3000,r});w.setTarget(0,3000,3000);
  const f=w.spawnFood();f.type=FOOD_TYPE.MAGNET;f.x=3000;f.y=3000;f.r=FOOD.SPECIAL_R;w.foodDirty=true;w.step();w.step();
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
  for(const t of listTunables()){
    assert.ok(t.min<=t.def&&t.def<=t.max,`${t.key}: o padrão (${t.def}) tem que caber na faixa ${t.min}–${t.max}`);
    assert.ok(t.label&&t.unit,`${t.key}: precisa de rótulo e unidade — a UI é montada a partir daqui`);
    assert.ok(t.scope==='server'||t.scope==='both',`${t.key}: escopo tem que ser 'server' ou 'both'`);
    // ⚠️ 'both' significa que o CLIENTE também lê o número, e ele tem a própria cópia do bundle: a rota do
    // painel RECUSA essas chaves (501) em vez de gravar um valor que só metade do jogo enxerga.
  }
  assert.ok(TUNABLE_BY_KEY.get('PLAYER.MAX_R').scope==='both',"PLAYER.MAX_R é lido pela predição do cliente");
  assert.ok(TUNABLE_BY_KEY.get('POWERUP.MAGNET_MAX_R').scope==='server',"o ímã é 100% servidor (predict.js não o consome)");});

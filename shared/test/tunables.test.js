// ── Parâmetros alteráveis em runtime (painel /admin) ──
// O que está sob teste aqui não é "o setter funciona": é que escrever no objeto de `constants.js` CHEGA à
// física, no laço, sem indireção nenhuma — que é a premissa inteira do mecanismo (ver shared/src/tunables.js).
import {test} from "node:test";
import assert from "node:assert/strict";
import {createWorld} from "../src/physics/index.js";
import {POWERUP,FOOD,FOOD_TYPE,PLAYER,BR,BOT_LLM,ROUND,MODES,MODE,TICK_HZ,ENTRY_PANELS} from "../src/constants.js";
import {PIECE_FLAG} from "../src/protocol/constants.js";
import {listTunables,applyTunable,resetTunable,readTunable,TUNABLE_BY_KEY,GRUPOS,aplicaWire,wireValues} from "../src/tunables.js";

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
    }else if(t.type==='bool'){
      assert.equal(typeof t.def,'boolean',`${t.key}: padrão de um bool tem que ser boolean`);
      // Os dois estados vêm do DESCRITOR desde que "Exibindo/Oculto" deixou de ser cravado no painel.
      assert.ok(t.onLabel&&t.offLabel,`${t.key}: um interruptor precisa dizer o que é ligado e o que é desligado`);
    }else if(t.type==='multi'){
      assert.ok(t.options&&t.options.length>1,`${t.key}: uma múltipla escolha com menos de duas opções não é escolha`);
      for(const o of t.options)assert.ok(o.v&&o.label,`${t.key}: toda opção precisa de id e rótulo`);
      assert.equal(typeof t.def,'string',`${t.key}: o valor de um multi é CSV canônico, não array (ver o memo de server/src/tunables.js)`);
      for(const id of String(t.def).split(',').filter(Boolean))
        assert.ok(t.options.some(o=>o.v===id),`${t.key}: o padrão tem '${id}', que não está nas opções`);
      assert.ok(!/\s/.test(t.def),`${t.key}: o CSV canônico não tem espaço — ele é comparado por igualdade`);
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

// ── O TIPO QUE `aplicaWire` NÃO TRATA É DESCARTADO EM SILÊNCIO ──────────────────────────────────────
// Este teste existe por causa de um defeito que ficou DORMENTE: `aplicaWire` só tinha ramo para 'opt' e
// para número, e um booleano caía no ramo numérico — `Number(true)` é 1, mas `t.min`/`t.max` são
// `undefined`, toda comparação dá falso e o valor some sem erro nenhum. Não doía porque nenhum tunable
// 'wire' era booleano; o primeiro que fosse cairia exatamente ali, com o painel dizendo "salvo" para
// sempre. A trava não é "o bool funciona": é que NENHUM tipo novo entre em 'wire' sem passar por aqui.
test("tunables: todo tipo de escopo 'wire' chega ao cliente — nenhum é descartado em silêncio",()=>{
  const RAIZES={};
  const wires=listTunables().filter(t=>t.scope==='wire');
  assert.ok(wires.length,"há tunables 'wire' para conferir");
  for(const t of wires){
    const [raiz,campo]=t.key.split('.');
    RAIZES[raiz]=RAIZES[raiz]||{};
    // um valor RECONHECIDAMENTE diferente do padrão, por tipo
    const outro=t.type==='bool'?!t.def
      :t.type==='opt'?(t.options.find(o=>o.v!==t.def)||t.options[0]).v
      :t.type==='multi'?t.options.map(o=>o.v).join(',')
      :(t.def===t.min?t.max:t.min);
    RAIZES[raiz][campo]='intocado';
    aplicaWire({[t.key]:outro},RAIZES);
    assert.notEqual(RAIZES[raiz][campo],'intocado',
      `${t.key} (${t.type}): aplicaWire NÃO escreveu nada — o valor foi descartado em silêncio, que é o defeito que este teste tranca`);
    if(t.type==='bool')assert.equal(RAIZES[raiz][campo],outro,`${t.key}: um bool tem que chegar como boolean, não como 1`);
  }
});

test("tunables: o valor de uma múltipla escolha é CANÔNICO — mesma escolha, mesmo texto",()=>{
  // Sem isso "a,b" e "b,a" seriam dois valores para o mesmo estado, e o memo `aplicados.get(key)===v` de
  // server/src/tunables.js pararia de casar: os 12–24 pods reaplicariam e logariam a cada 30 s, para sempre.
  const t=listTunables().find(x=>x.type==='multi');
  if(!t)return;   // ainda não há nenhum: o teste passa a valer quando o primeiro nascer
  const ids=t.options.map(o=>o.v);
  const direto=applyTunable(t.key,ids.join(','));
  const avesso=applyTunable(t.key,[...ids].reverse().join(','));
  assert.equal(avesso,direto,`${t.key}: a ordem do que chega não pode mudar o valor gravado`);
  assert.equal(applyTunable(t.key,`${ids[0]},${ids[0]}`),ids[0],`${t.key}: repetição é dobrada num id só`);
  assert.equal(applyTunable(t.key,`${ids[0]},naoexiste`),ids[0],`${t.key}: id fora da lista é descartado, sem recusar a gravação inteira`);
  assert.equal(applyTunable(t.key,''),'',`${t.key}: nenhuma escolha é estado válido`);
  resetTunable(t.key);
});

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

test("tunables: o BOOL da tela de Modos escreve na constante viva, sem passar por Number()",()=>{
  const chave='ENTRY_PANELS.BR';
  try{
    assert.equal(readTunable(chave),true,"o padrão é visível");
    applyTunable(chave,false);
    assert.equal(ENTRY_PANELS.BR,false,"a constante VIVA foi escrita");
    // ⚠️ Coisas que PARECEM boolean e não são: string 'false' é truthy em JS, e é exatamente o que um
    // <input type=checkbox> desatento mandaria se lesse `.value` em vez de `.checked` no admin.
    applyTunable(chave,'false');
    assert.equal(ENTRY_PANELS.BR,true,"'false' (string) é truthy — !! não faz parsing, só coage");
    applyTunable(chave,0);
    assert.equal(ENTRY_PANELS.BR,false,"0 é falsy");
    resetTunable(chave);
    assert.equal(ENTRY_PANELS.BR,true,"restaurar devolve o padrão do arquivo");
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

// ── A MASSA COM QUE SE NASCE ─────────────────────────────────────────────────
// Duas chaves, e o que este teste realmente trava é a TERCEIRA constante: `PLAYER.START_R` continua sendo o
// piso do decaimento e a régua do jogo, e ela é a única das três que `predict.js` lê (via `decayPiece`).
// Se um dia alguém "simplificar" as duas em uma só, é aqui que a física do cliente vai reclamar.
test("tunables: a massa inicial é dita em MASSA, são DUAS (Livre e BR), e nenhuma é o piso do decaimento",()=>{
  try{
    assert.equal(readTunable('PLAYER.SPAWN_R'),900,"o padrão do arquivo é a massa 900 de sempre");
    assert.equal(readTunable('BR.SPAWN_R'),900);
    applyTunable('PLAYER.SPAWN_R',3600);
    assert.equal(PLAYER.SPAWN_R,60,"massa entra, raio sai — a mesma tradução do teto do ímã");
    assert.equal(PLAYER.START_R,30,"⚠️ o PISO DO DECAIMENTO não se move: é ele que `predict.js` lê");
    assert.equal(BR.SPAWN_R,30,"e o Livre não arrasta o Battle Royale junto — é para isso que são duas");
    // e a peça nasce com o tamanho novo, pelo caminho de verdade
    const w=empty(931),pc=w.addPlayer(0);
    assert.ok(Math.abs(pc.r-60)<1e-6,"o default de `addPlayer` é o parâmetro, não a régua");
    assert.throws(()=>applyTunable('BR.SPAWN_R',10000),/out_of_range/,"o teto do BR é a densidade do octógono");
    assert.throws(()=>applyTunable('PLAYER.SPAWN_R',256),/out_of_range/,"nascer no chão em que a peça morre no gás não é uma opção");
    assert.equal(TUNABLE_BY_KEY.get('PLAYER.SPAWN_R').scope,'server',"nenhum leitor mora em predict.js");
    assert.equal(TUNABLE_BY_KEY.get('BR.SPAWN_R').scope,'server');
  }finally{resetTunable('PLAYER.SPAWN_R');resetTunable('BR.SPAWN_R');}});

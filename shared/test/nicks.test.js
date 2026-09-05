// O nick sorteado para o JOGADOR. A lista é o CHÃO da tela inicial (a LLM é a primeira escolha, ver
// server/src/auth/nickPool.js), e cada invariante aqui fecha um furo que só apareceria em produção.
import test from "node:test";
import assert from "node:assert/strict";
import {PLAYER_NICKS,BOT_NICKS,BOT_NAMES,playerNick} from "../src/constants.js";
import {eggSkinFor} from "../src/eggs.js";
import {baseNick} from "../src/util.js";
import {createRng} from "../src/rng.js";

const FORMATO=/^[A-Za-z0-9_]{2,16}$/;

test("a lista é ASCII, sem duplicata e no formato que o servidor aceita",()=>{
  assert.ok(PLAYER_NICKS.length>=100,`lista curta demais: ${PLAYER_NICKS.length}`);
  const vistos=new Set();
  for(const n of PLAYER_NICKS){
    assert.match(n,FORMATO,`fora do formato: ${n}`);
    // ASCII sem acento: o nick atravessa `normalizeNick` (NFKC), a peneira de `recusa()` e o fio, e um
    // "ó" aqui viraria uma diferença de normalização em algum dos três.
    assert.equal(n,n.normalize("NFKD").replace(/[̀-ͯ]/g,""),`tem acento: ${n}`);
    assert.ok(baseNick(n).length>=2,`sem raiz: ${n}`);
    const k=n.toLowerCase();
    assert.ok(!vistos.has(k),`duplicado: ${n}`);vistos.add(k);
  }
});

test("NENHUM nome de pessoa: nada casa com um easter egg de caricatura",()=>{
  // O furo é literal: o egg é decidido pelo NICK (persist/hooks.js), então uma base que casasse poria a
  // caricatura de uma celebridade num jogador que só clicou em PLAY NOW.
  for(const n of PLAYER_NICKS)assert.equal(eggSkinFor(n),null,`vira caricatura: ${n}`);
  // e os quatro formatos de `playerNick` também não — `baseNick` desmonta o enfeite antes de comparar
  for(const n of PLAYER_NICKS)
    for(const v of [n,n+"42",n+"_190",n.toUpperCase()])
      assert.equal(eggSkinFor(v),null,`vira caricatura: ${v}`);
});

test("DISJUNTA das listas de preenchimento: senão a sala recusa a entrada do jogador",()=>{
  // `Room.nickTaken` recusa com NICK_IN_ROOM quem chega com um nick já em uso na sala — e a sala está
  // cheia de bots tirados de BOT_NICKS. Uma base compartilhada seria uma recusa aleatória na entrada.
  const bots=new Set(BOT_NICKS.map(s=>s.toLowerCase()));
  const temas=new Set(BOT_NAMES.map(s=>s.toLowerCase()));
  for(const n of PLAYER_NICKS){
    const k=n.toLowerCase();
    assert.ok(!bots.has(k),`também é nick de bot: ${n}`);
    assert.ok(!temas.has(k),`também é nome temático de bot: ${n}`);
  }
});

test("playerNick: quatro formatos, cabe em 16 e registra em `usados` por dentro",()=>{
  const rng=createRng(12345),usados=new Set();
  const saiu=[];
  for(let i=0;i<400;i++){
    const n=playerNick(rng,usados);
    assert.ok(n.length<=16,`passou de 16: ${n}`);
    assert.match(n,FORMATO,`fora do formato: ${n}`);
    assert.ok(usados.has(n.toLowerCase()),`não registrou em usados: ${n}`);
    saiu.push(n);
  }
  assert.equal(new Set(saiu.map(s=>s.toLowerCase())).size,saiu.length,"repetiu um nick");
  // os quatro formatos aparecem: base pura, base+dígitos, base_dígitos e CAIXA ALTA
  assert.ok(saiu.some(n=>PLAYER_NICKS.includes(n)),"nenhuma base pura");
  assert.ok(saiu.some(n=>/[a-z]\d+$/.test(n)),"nenhum com dígito colado");
  assert.ok(saiu.some(n=>/_\d+$/.test(n)),"nenhum com underline");
  assert.ok(saiu.some(n=>n===n.toUpperCase()&&/[A-Z]{3,}/.test(n)),"nenhum em caixa alta");
});

test("playerNick NUNCA devolve um nick que está em uso naquele momento",()=>{
  // É a promessa da rota `GET /api/nick`: `usados` é a união dos `usedNicks` das salas do shard.
  // Com a lista inteira ocupada ele ainda tem que devolver ALGO — o paraquedas numerado.
  const usados=new Set();
  for(const n of PLAYER_NICKS)
    for(const v of [n,n.toUpperCase()])usados.add(v.toLowerCase());
  const rng=createRng(7);
  for(let i=0;i<50;i++){
    const n=playerNick(rng,usados);
    assert.ok(n,"não devolveu nada");
    assert.match(n,FORMATO,`fora do formato: ${n}`);
  }
  // e com um punhado ocupado ele simplesmente desvia
  const rng2=createRng(99),poucos=new Set(PLAYER_NICKS.slice(0,20).map(s=>s.toLowerCase()));
  for(let i=0;i<200;i++){
    const n=playerNick(rng2,poucos);
    assert.ok(!PLAYER_NICKS.slice(0,20).some(b=>b.toLowerCase()===n.toLowerCase()),`entregou um ocupado: ${n}`);
  }
});

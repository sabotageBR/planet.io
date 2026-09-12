// ── A POLÍTICA DE DESPEJO DO TextureCache ─────────────────────────────────────
// Só a política, que é pura: o cache em si precisa de `document` e do Pixi, e o que quebrou o jogo não foi
// o canvas — foi a CONTA. Os dois defeitos aqui trancados foram MEDIDOS no navegador, com o código real:
// com dois céus vivos (os 12 s de `PREWARM_S` antes de cada virada de tema, 10,6 MB cada a 1920×1080), uma
// única assadura nova destruía 24 texturas no mesmo frame; com três, 32. Cada uma delas voltava à tela nos
// frames seguintes e tinha de ser reassada e resubida para a GPU — a "travada de alguns frames".
import test from "node:test";
import assert from "node:assert/strict";
import {alvoDeDespejo,planoDeDespejo} from "../src/game/renderer/TextureCache.js";

const MB=1048576, TETO=48*MB, PISO=16*MB, CEU=1920*1080*4*1.34;   // 10,6 MB: um céu de tela cheia
/** n entradas de 256² (351 KB), todas usadas pela última vez no frame `last`. */
const entradas=(n,last)=>Array.from({length:n},(_,i)=>({key:`t${i}`,e:{last,bytes:256*256*4*1.34}}));

test("o alvo é do CACHE, não do total: o céu não pode espremer quem não pode liberá-lo", () => {
  // sem céu, o alvo é o de sempre — 85% do teto
  assert.equal(alvoDeDespejo(TETO,0,PISO), TETO*.85);
  // com DOIS céus o alvo cai, mas continua sendo uma conta sobre o cache
  assert.equal(alvoDeDespejo(TETO,2*CEU,PISO), TETO*.85-2*CEU);
  // com TRÊS (o crossfade), `teto*.85 - externo` daria 9 MB: aí quem manda é o piso, senão o cache é
  // levado abaixo do conjunto de trabalho de um frame e todo despejo vira reassadura garantida
  assert.equal(alvoDeDespejo(TETO,3*CEU,PISO), PISO);
  assert.ok(TETO*.85-3*CEU < PISO, "o cenário do piso tem que ser o de três céus, senão o teste não prova nada");
});

test("ninguém paga a conta inteira num frame: o despejo é parcelado", () => {
  // 80 texturas paradas há 200 frames e um alvo lá embaixo: a versão antiga levava todas de uma vez
  const fora=planoDeDespejo(entradas(80,0),{frame:200,bytes:80*256*256*4*1.34,alvo:0,max:6});
  assert.equal(fora.length,6,"o teto por frame é o que impede a avalanche de reassaduras");
});

test("a carência cede sob pressão, e na ordem: 120, depois 30, depois 3 frames", () => {
  const bytes=256*256*4*1.34;
  const lista=[{key:"velha",e:{last:0,bytes}},{key:"media",e:{last:175,bytes}},{key:"nova",e:{last:199,bytes}}];
  // frame 200: "velha" tem 200 de idade (>120), "media" tem 25 (>3, não >30), "nova" tem 1 (não sai nunca)
  const fora=planoDeDespejo(lista,{frame:200,bytes:3*bytes,alvo:0,max:9});
  assert.deepEqual(fora.map(x=>x.key),["velha","media"],"a de 1 frame de idade está sendo desenhada AGORA");
});

test("chegando ao alvo, para — despejar de graça é só comprar reassadura", () => {
  const bytes=1*MB;
  const fora=planoDeDespejo(entradas(20,0).map(x=>({...x,e:{...x.e,bytes}})),
    {frame:200,bytes:20*MB,alvo:17*MB,max:100});
  assert.equal(fora.length,3,"3 MB acima do alvo = 3 texturas, e nem uma a mais");
});

test("cada entrada sai UMA vez, mesmo cabendo em duas carências", () => {
  // uma parada há 200 frames casa com >120, >30 e >3: sem o controle de vistos ela seria contada três vezes
  // e o `bytes` da simulação despencaria, fazendo o plano parar cedo demais e devolver menos do que precisa
  const bytes=1*MB;
  const fora=planoDeDespejo(entradas(10,0).map(x=>({...x,e:{...x.e,bytes}})),
    {frame:200,bytes:10*MB,alvo:5*MB,max:100});
  assert.equal(new Set(fora.map(x=>x.key)).size, fora.length, "chave repetida no plano");
  assert.equal(fora.length,5);
});

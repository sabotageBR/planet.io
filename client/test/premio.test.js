// ── O PRÊMIO DA TELA DE MORTE ──────────────────────────────────────────────────
// Quatro mecânicas pedidas, UM bloco na tela — e é a prioridade entre elas que este arquivo trava. A regra
// não é arbitrária: anunciar uma OFERTA por cima de um prêmio que o jogador acabou de conquistar troca a
// comemoração por uma venda, e é o tipo de coisa que ninguém percebe até estar em produção.
//
// ⚠️ O `games` É O QUINTO ARGUMENTO E OS TESTES ANTIGOS NÃO O PASSAVAM — com o default 0, toda chamada de
// conta logada sem a skin do tutorial cai no PROGRESSO, que é o estado novo. Os testes de oferta abaixo
// passam `PARTIDAS` explicitamente: o que eles sempre quiseram medir é a oferta de anúncio, e ela agora
// vive depois da barra. É por isso que quatro deles mudaram de assinatura e nenhum de intenção.
import { test } from "node:test";
import assert from "node:assert/strict";
import { escolhePremio } from "../src/ui/premio.js";
import { AD_GIFT_SKINS, AD_REWARD_SKINS, PROGRESSO, SKIN_TUTORIAL, skinById } from "@warspace/shared";

const R = ids => ({ skinsUnlocked: ids });
/** Quem já cumpriu a progressão: é o estado em que a oferta de anúncio volta a ser a regra. */
const FEITO = PROGRESSO.PARTIDAS;

test("a skin destravada na partida ganha da oferta de anúncio", () => {
  const p = escolhePremio(R([35]), [], true, true);
  assert.equal(p.tipo, "skin");
  assert.equal(p.id, 35);
});

test("mais de uma destravada: mostra a de MAIOR id (a família mais difícil)", () => {
  assert.equal(escolhePremio(R([35, 74, 44]), [], true, true).id, 74);
});

test("sem prêmio, oferece a PRIMEIRA da pool que falta — e é determinístico", () => {
  const p1 = escolhePremio(null, [], true, true, FEITO), p2 = escolhePremio(null, [], true, true, FEITO);
  assert.equal(p1.tipo, "anuncio");
  assert.equal(p1.id, AD_GIFT_SKINS[0], "a ordem da pool É a ordem da oferta");
  assert.equal(p1.id, p2.id, "duas chamadas, a mesma oferta: nada de sorteio entre a morte e o clique");
  const p3 = escolhePremio(null, [AD_GIFT_SKINS[0]], true, true, FEITO);
  assert.equal(p3.id, AD_GIFT_SKINS[1], "quem já tem a primeira recebe a seguinte");
});

test("sem SDK de anúncio não há oferta — botão morto é pior que botão nenhum", () => {
  assert.equal(escolhePremio(null, [], false, true, FEITO), null);
});

test("convidado local não recebe oferta: não há onde guardar a skin", () => {
  assert.equal(escolhePremio(null, [], true, false), null);
});

test("pool esgotada: nada a oferecer, e o bloco some", () => {
  assert.equal(escolhePremio(null, AD_GIFT_SKINS, true, true, FEITO), null);
});

// ── A BARRA "JOGUE N PARTIDAS" ───────────────────────────────────────────────────────────────────
test("sem a skin do tutorial e abaixo do alvo, o bloco é a BARRA", () => {
  const p = escolhePremio(null, [], true, true, 1);
  assert.equal(p.tipo, "progresso");
  assert.equal(p.id, SKIN_TUTORIAL);
  assert.equal(p.feitas, 1);
  assert.equal(p.alvo, PROGRESSO.PARTIDAS);
});

test("a barra vem ANTES da oferta de anúncio, e isso é o ponto", () => {
  // `pedagioLiberado` cala a oferta nas duas primeiras vidas — exatamente as duas em que a promessa do fim
  // do tutorial precisa ser lembrada. Invertida a ordem, o jogador veria a barra pela primeira vez já em
  // 2/3 e a mecânica chegaria depois de quase cumprida.
  assert.equal(escolhePremio(null, [], true, true, 0).tipo, "progresso");
});

test("quem já tem a skin nunca vê a barra — a oferta assume", () => {
  const p = escolhePremio(null, [SKIN_TUTORIAL], true, true, 0);
  assert.equal(p.tipo, "anuncio", "com a skin na mão o progresso não faz sentido nenhum");
});

test("cumprido o alvo, a barra some mesmo sem a skin ter chegado", () => {
  // Acontece de verdade: banco fora na partida que concederia. Uma barra parada em 5/3 para sempre é pior
  // que barra nenhuma, então o `>=` a encerra e a oferta assume.
  assert.equal(escolhePremio(null, [], true, true, FEITO + 2).tipo, "anuncio");
});

test("convidado local não vê a barra: não há onde guardar a skin prometida", () => {
  assert.equal(escolhePremio(null, [], false, false, 0), null);
});

test("a barra não depende de SDK de anúncio — ela é do jogo, não do portal", () => {
  assert.equal(escolhePremio(null, [], false, true, 0).tipo, "progresso");
});

test("a skin destravada ganha da barra — comemoração antes de cobrança", () => {
  assert.equal(escolhePremio(R([SKIN_TUTORIAL]), [], true, true, 0).tipo, "skin");
});

test("a skin do tutorial saiu da pool do anúncio", () => {
  // Deixá-la nas duas portas tornaria a barra decorativa: ninguém espera três partidas por algo que um
  // vídeo de 30 s entrega. E Terra/Lua continuam lá, que é o que mantém o `rewardedBreak` com chamador.
  assert.ok(!AD_GIFT_SKINS.includes(SKIN_TUTORIAL), "a skin de progressão não pode ser vendida por vídeo");
  assert.ok(AD_GIFT_SKINS.length > 0, "sem pool não há rewardedBreak, e a Poki cobra isso por escrito");
});

test("as duas pools são DISJUNTAS — é o que deixa as duas regras conviverem", () => {
  // As mascotes seguem a regra da migração 0012 (o anúncio destrava a COMPRA, as moedas continuam); a pool
  // de presente é DADA. Uma skin nas duas listas teria duas regras ao mesmo tempo, e a Loja passaria a
  // mentir — que foi exatamente o motivo de a 0011 ser derrubada.
  const cruz = AD_GIFT_SKINS.filter(id => AD_REWARD_SKINS.includes(id));
  assert.deepEqual(cruz, [], `skin com duas regras de anúncio: ${cruz.join(",")}`);
});

test("toda skin da pool de presente existe e é comprável por moedas", () => {
  // Se ela não estivesse à venda, "ganhar" não teria com o que ser comparado — e o jogador não saberia o
  // que recebeu. Também é o que mantém a economia legível: é uma skin de ~4 partidas boas, não um exclusivo.
  for (const id of AD_GIFT_SKINS) {
    const s = skinById(id);
    assert.equal(s.id, id, `a skin ${id} não existe no catálogo`);
    assert.ok(s.price > 0, `a skin ${id} (${s.name}) não tem preço: não dá para dizer o que ela vale`);
    assert.ok(!s.unlockKey, `a skin ${id} é de conquista — dá-la por anúncio esvazia a conquista`);
  }
});

test("skin destravada que o catálogo não conhece é ignorada, não quebra a tela", () => {
  // Rollout: um pod com catálogo mais novo pode mandar um id que esta build não tem.
  assert.equal(escolhePremio(R([9999]), [...AD_GIFT_SKINS, SKIN_TUTORIAL], true, true, FEITO), null);
});

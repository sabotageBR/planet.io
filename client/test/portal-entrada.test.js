// ── ENTRAR DIRETO NA PARTIDA: por PLATAFORMA, decidido no /admin ───────────────
// A regra saiu de uma constante de build (`ENTRA_DIRETO = PORTAL`) e virou uma múltipla escolha do painel,
// entregue em `/api/config`. O que se prova aqui é o contrato do CLIENTE, que é quem compara — o servidor
// não sabe de que portal veio a aba (o `PORTAL_ID` é constante de BUILD, `users.origin` é um domínio
// gravado uma vez, e vários portais servem de subdomínio por jogo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { entraDiretoEm, tutorialEm, plataformaAtual, ENTRA_DIRETO_PADRAO } from "../src/portal/flags.js";
import { PLATAFORMAS, ENTRY, TUTORIAL } from "@warspace/shared";

test("plataforma: fora de um portal, esta build é o site", () => {
  // No `node --test` não há `__PORTAL__` nem `window`, então PORTAL e BOUNTY são falsos: é o build do site.
  assert.equal(plataformaAtual(), "site");
  assert.equal(ENTRA_DIRETO_PADRAO, false, "e o padrão de build do site é NÃO entrar direto");
});

test("lista ausente: vale o comportamento de BUILD, nunca 'pede o nome'", () => {
  // `/api/config` é disparado sem `await` no boot, então o primeiro clique pode chegar antes da lista. E um
  // pod de build anterior não manda o campo. Nos dois casos o certo é o que a build já fazia — um zip que
  // deixa de entrar direto por uma env faltando é reprova de certificação em silêncio.
  assert.equal(entraDiretoEm(undefined), ENTRA_DIRETO_PADRAO);
  assert.equal(entraDiretoEm(null), ENTRA_DIRETO_PADRAO);
});

test("a lista decide, e a comparação é por id exato", () => {
  assert.equal(entraDiretoEm("site"), true, "o site marcado passa a entrar direto");
  assert.equal(entraDiretoEm("poki,crazy"), false, "sem o site na lista, não");
  assert.equal(entraDiretoEm(""), false, "lista vazia é uma resposta: nenhuma plataforma");
  // ⚠️ nada de `includes` sobre a string crua: "sit" não pode casar com "site", nem "site2" com "site".
  assert.equal(entraDiretoEm("sit,sites,website"), false, "prefixo/sufixo não casa — a comparação é por item");
});

test("o padrão do painel reproduz o que a constante de build fazia", () => {
  // Todos os portais, e não o site. Se este teste quebrar, alguém mudou o comportamento de estreia sem dizer.
  const ids = new Set(String(ENTRY.DIRETO).split(","));
  assert.ok(!ids.has("site"), "o site NÃO entra direto por padrão: lá nomear o planeta é a única coisa que se pede");
  for (const p of PLATAFORMAS)
    if (p.v !== "site" && p.v !== "bountyboard")
      assert.ok(ids.has(p.v), `${p.v} é um portal e deveria estar no padrão`);
});

test("toda plataforma declarada tem id e rótulo, e os ids são únicos", () => {
  // A lista é a MESMA para o descritor do painel, para o cliente e para o empacotador: um id repetido faria
  // duas linhas do painel gravarem no mesmo lugar.
  const ids = PLATAFORMAS.map(p => p.v);
  assert.equal(new Set(ids).size, ids.length, "ids duplicados na lista de plataformas");
  for (const p of PLATAFORMAS) assert.ok(p.v && p.label, `plataforma sem id ou rótulo: ${JSON.stringify(p)}`);
});

// ── O TUTORIAL DE ESTREIA: o mesmo mecanismo, com o PADRÃO INVERTIDO ──────────
// `tutorialEm` é o gêmeo de `entraDiretoEm` e difere num ponto só — e o ponto é o que importa.

test("o tutorial nasce DESLIGADO em toda plataforma", () => {
  // O padrão de um tunable reproduz o comportamento de HOJE, e hoje não há tutorial em lugar nenhum
  // (client/src/game/dica.js:8 diz isso por escrito). Quem o liga é o dono do jogo, no painel.
  assert.equal(TUTORIAL.PLATAFORMAS, "");
  assert.equal(tutorialEm(TUTORIAL.PLATAFORMAS), false);
});

test("SEM A LISTA NÃO MOSTRA — e é aqui que ele difere do entraDiretoEm", () => {
  // `entraDiretoEm` cai no padrão de BUILD porque lá o erro seguro é entrar direto. Aqui o erro seguro é
  // o oposto: um jogador sem tutorial joga; um jogador preso num tutorial que não consegue terminar
  // (servidor fora, boot que falhou, pod de build anterior que não manda o campo) fica olhando nada.
  assert.equal(tutorialEm(undefined), false);
  assert.equal(tutorialEm(null), false);
});

test("marcada a plataforma desta aba, o tutorial liga", () => {
  assert.equal(tutorialEm("site"), true);
  assert.equal(tutorialEm("poki,crazy,site"), true);
  assert.equal(tutorialEm("poki,crazy"), false, "outra plataforma não liga o desta");
  assert.equal(tutorialEm(""), false, "lista vazia é um estado válido: ninguém");
});

test("a comparação é por ITEM, nunca `includes` na string crua", () => {
  // A mesma armadilha do matcher de CORS: `"site".includes("sit")` é verdade, e um id parcial não pode
  // ligar a plataforma inteira.
  assert.equal(tutorialEm("sit"), false);
  assert.equal(tutorialEm("sites"), false);
  assert.equal(tutorialEm("bountyboard"), false, "o prefixo de outro id também não casa");
});

test("todo id que o painel oferece é comparável — nenhum com espaço ou vazio", () => {
  // `canon` ordena e filtra pela lista de `PLATAFORMAS`, e `tutorialEm` faz `split(",")` sem `trim`: um id
  // com espaço no catálogo nunca casaria, em silêncio.
  for (const p of PLATAFORMAS) assert.equal(p.v, p.v.trim(), p.v);
  assert.equal(PLATAFORMAS.some(p => !p.v), false);
  assert.equal(PLATAFORMAS.some(p => p.v === "site"), true, "o site É uma plataforma: foi o pedido");
});

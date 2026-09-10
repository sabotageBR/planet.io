// ── ENTRAR DIRETO NA PARTIDA: por PLATAFORMA, decidido no /admin ───────────────
// A regra saiu de uma constante de build (`ENTRA_DIRETO = PORTAL`) e virou uma múltipla escolha do painel,
// entregue em `/api/config`. O que se prova aqui é o contrato do CLIENTE, que é quem compara — o servidor
// não sabe de que portal veio a aba (o `PORTAL_ID` é constante de BUILD, `users.origin` é um domínio
// gravado uma vez, e vários portais servem de subdomínio por jogo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { entraDiretoEm, plataformaAtual, ENTRA_DIRETO_PADRAO } from "../src/portal/flags.js";
import { PLATAFORMAS, ENTRY } from "@warspace/shared";

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

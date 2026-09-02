// ── O DICIONÁRIO NÃO PODE APODRECER ───────────────────────────────────────────
// Tradução estraga em silêncio: chave que ninguém traduziu cai no pt-BR e passa despercebida, chave
// renomeada no pt-BR deixa um órfão no en/es, e um molde `{n}` perdido faz o NÚMERO sumir da frase sem
// erro nenhum. Os três defeitos são mudos, e é isto aqui que os torna barulhentos.
// node --test client/test/i18n.test.js
import test from "node:test";
import assert from "node:assert/strict";
import PT from "../src/i18n/pt-BR.js";
import { resolveLang, getLabels, setLang, LANGS, BASE_LANG, preenche } from "../src/i18n/index.js";
import { SKINS, FAMILIES } from "@warspace/shared";

/** Caminhos-folha ordenados: {a:{b:"x"},c:"y"} → ["a.b","c"]. Array é folha (é lista, não dicionário). */
export function folhas(o, pre = "") {
  const out = [];
  for (const k of Object.keys(o)) { const v = o[k], p = pre ? pre + "." + k : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...folhas(v, p)); else out.push(p); }
  return out.sort();
}
const pega = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const moldes = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

const OUTROS = LANGS.filter(l => l !== BASE_LANG);
const dicts = new Map([[BASE_LANG, PT]]);
test("carrega todos os idiomas", async () => {
  for (const id of OUTROS) dicts.set(id, (await import(`../src/i18n/${id}.js`)).default);
  assert.equal(dicts.size, LANGS.length);
});

test("todo idioma tem EXATAMENTE as chaves do pt-BR", () => {
  const base = folhas(PT), setBase = new Set(base);
  for (const id of OUTROS) {
    const meu = new Set(folhas(dicts.get(id)));
    assert.deepEqual(base.filter(p => !meu.has(p)), [], `${id}: chaves NÃO traduzidas`);
    assert.deepEqual([...meu].filter(p => !setBase.has(p)), [], `${id}: chaves órfãs (renomeadas no pt-BR?)`);
  }
});

test("todo valor é string não-vazia", () => {
  for (const [id, d] of dicts) for (const p of folhas(d)) {
    const v = pega(d, p);
    if (Array.isArray(v)) { assert.ok(v.length && v.every(x => typeof x === "string" && x), `${id}: ${p}`); continue; }
    assert.equal(typeof v, "string", `${id}: ${p} não é texto`);
    assert.ok(v.length, `${id}: ${p} está vazio`);
  }
});

test("os {moldes} sobrevivem à tradução", () => {
  // "Nível {n}" traduzido como "Level" não quebra NADA: o replace vira no-op e o número some da tela.
  for (const id of OUTROS) { const d = dicts.get(id);
    for (const p of folhas(PT)) assert.deepEqual(moldes(pega(d, p)), moldes(pega(PT, p)), `${id}: moldes de "${p}"`); }
});

test("resolveLang: pref manda, senão o navegador, senão pt-BR", () => {
  const TABELA = [
    ["auto", ["pt-BR"], "pt-BR"], ["auto", ["pt-PT"], "pt-BR"], ["auto", ["en-US", "pt"], "en"],
    ["auto", ["es-419"], "es"],
    // idioma que não falamos → INGLÊS, não português: um alemão entende inglês muito mais provavelmente
    ["auto", ["de", "fr"], "en"], ["auto", ["ja"], "en"], ["auto", [], "en"],
    // ⚠️ mas a lista inteira do navegador é varrida antes de desistir: o brasileiro que mora na Alemanha
    // tem ["de","pt-BR"] e continua caindo no português
    ["auto", ["de", "pt-BR"], "pt-BR"], ["auto", ["fr-CA", "es-MX"], "es"],
    ["es", ["en-US"], "es"],      ["klingon", ["en"], "en"],   // valor inválido cai no automático
  ];
  for (const [pref, tags, esperado] of TABELA)
    assert.equal(resolveLang(pref, tags), esperado, `${pref} + [${tags}]`);
});

// ⚠️ OURO. As 11 chaves que os três temas sobrescreviam eram CÓDIGO MORTO na base (`currentTheme()`
// nunca é nulo, então o que a tela mostrava era sempre a versão do tema). Ao dobrá-las para dentro do
// dicionário é fácil "consolidar" e trocar PÓDIO por PLACAR sem ninguém notar — em cinco telas de uma vez.
test("os três temas continuam dizendo o que sempre disseram", () => {
  const COMUM = { title: "WARSPACE.IO", play: "JOGAR", playAuto: "🚀 JOGAR (AUTO)", lbTitle: "PÓDIO",
    dead: "KABOOM!", respawn: "DE NOVO!", reconnTitle: "SINAL FRACO!",
    reconnSub: "Procurando o satélite… tentativa {n}/5", back: "◄", create: "➕ Criar sala", top5: "TOP 5 HOJE" };
  const POR_TEMA = {
    dawn:   { tagline: "Conquiste a galáxia antes do dia clarear!",   deadSub: "— você virou poeira de manhã cedo —" },
    sunset: { tagline: "Conquiste a galáxia antes do sol se pôr!",    deadSub: "— você virou poeira no fim da tarde —" },
    dusk:   { tagline: "Conquiste a galáxia antes que a noite caia!", deadSub: "— você virou poeira ao anoitecer —" },
  };
  for (const [tema, esperado] of Object.entries(POR_TEMA)) {
    const L = getLabels(tema);
    for (const [k, v] of Object.entries({ ...COMUM, ...esperado })) assert.equal(L[k], v, `${tema}.${k}`);
  }
});

test("preenche: molde sem valor fica literal (é o que o teste de moldes protege)", () => {
  assert.equal(preenche("tentativa {n}/5", { n: 3 }), "tentativa 3/5");
  assert.equal(preenche("nível {n}", {}), "nível {n}");
});

test("setLang troca o dicionário; valor inválido cai no automático", async () => {
  assert.equal(await setLang("es"), "es");
  assert.equal(getLabels().opt.lang_auto, dicts.get("es").opt.lang_auto);
  // ⚠️ O esperado sai do próprio `resolveLang("auto")`, e não de uma constante: o Node 22 TEM um
  // `navigator.language` (o locale da máquina), então cravar "en" aqui faria o teste passar ou falhar
  // conforme o idioma de quem roda. Quem prova o fallback em si é a tabela do teste acima, com as tags
  // passadas na mão.
  assert.equal(await setLang("klingon"), resolveLang("auto"));
});

// ⚠️ OURO DO CATÁLOGO. As descrições de conquista passaram a existir em DOIS lugares: o gerador
// `f.desc(g)` de shared/achievements.js (que continua indo no log e no payload do servidor) e o molde
// do dicionário. Duas verdades divergem na primeira correção — a não ser que alguém as compare.
test("o molde pt-BR diz exatamente o que o gerador de shared/achievements.js diz", async () => {
  await setLang("pt-BR");
  const { achDesc, achTitle, tierName, skinName, skinDesc, rarityLabel } = await import("../src/i18n/catalog.js");
  const { FAMILIES, TIERS, ACHIEVEMENTS, SKINS, RARITY_LABELS } = await import("@warspace/shared");
  for (const f of FAMILIES) for (const g of f.goals)
    assert.equal(achDesc(f.id, g), f.desc(g), `família ${f.id}, meta ${g}`);
  for (const t of TIERS) assert.equal(tierName(t.id), t.name);
  for (const a of ACHIEVEMENTS) assert.equal(achTitle(a.key), a.title, a.key);
  for (const s of SKINS) { assert.equal(skinName(s), s.name, "skin " + s.id); assert.equal(skinDesc(s), s.desc, "skin " + s.id); }
  for (const r of Object.keys(RARITY_LABELS)) assert.equal(rarityLabel(r), RARITY_LABELS[r]);
});

test("toda skin e toda família têm entrada em todo idioma", () => {
  for (const [id, d] of dicts) {
    for (const s of SKINS) { assert.ok(d.skins[s.id] && d.skins[s.id].n, `${id}: skin ${s.id} sem nome`);
      assert.ok(d.skins[s.id].d, `${id}: skin ${s.id} sem descrição`); }
    for (const k of Object.keys(d.skins)) assert.ok(SKINS.some(s => s.id === +k), `${id}: skin ${k} traduzida não existe`);
    for (const f of FAMILIES) { assert.ok(d.ach.fam[f.id], `${id}: família ${f.id} sem título`);
      assert.ok(d.ach.desc[f.id], `${id}: família ${f.id} sem descrição`); }
  }
});

// ⚠️ Um GRUPO novo com o nome de uma chave que já existe transforma uma string em objeto — e o React
// morre com "Objects are not valid as a React child" na primeira tela que a use. Aconteceu com `prefs`,
// que é ao mesmo tempo o rótulo "Opções" do menu e o nome natural do grupo da tela de Opções.
// Esta lista é a única fonte de "quem pode ser objeto"; qualquer outro grupo novo falha aqui.
test("nenhuma chave de topo vira grupo por acidente", () => {
  const GRUPOS = new Set(["weapons", "killFeed", "fx", "awards", "periods", "metrics", "stats", "causes",
    "sortBy", "powerups", "powerupHints", "themes", "opt", "err", "fmt", "ord", "keys", "rarity", "ach", "skins"]);
  for (const [id, d] of dicts) for (const [k, v] of Object.entries(d)) {
    const ehGrupo = !!v && typeof v === "object";
    assert.equal(ehGrupo, GRUPOS.has(k), `${id}: "${k}" ${ehGrupo ? "virou grupo e não está na lista" : "está na lista mas não é grupo"}`);
  }
});

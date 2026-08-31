// ── IDIOMA ────────────────────────────────────────────────────────────────────
// Gêmeo de `theme/index.js`, de propósito: uma função PURA resolve o id ('auto' → navegador), `setLang`
// aplica e avisa por evento, e quem desenha assina o evento. Idioma e tema são dois eixos independentes
// que se encontram num lugar só — `getLabels()`, e portanto `useLabels()`.
//
// ⚠️ O pt-BR é o único carregado de forma ESTÁTICA: ele é o chão de toda chave que faltar numa tradução.
// Os outros vêm por `import()` (o mesmo padrão de `/admin` e `?sfx` em main.jsx), então quem joga em
// português não baixa um byte de espanhol — medido, um dicionário completo dá ~29 KB.
import base from "./pt-BR.js";

// ⚠️ SÃO DOIS papéis, e misturá-los num `DEFAULT_LANG` só escondia a diferença:
//   BASE_LANG     = o dicionário CARREGADO ESTATICAMENTE, chão de toda chave que faltar numa tradução e
//                   única lista de países escrita à mão. É o pt-BR, e continua sendo.
//   FALLBACK_LANG = o idioma de quem chega com um navegador que não falamos. Um alemão entendendo inglês
//                   é muito mais provável que um alemão entendendo português — este é um jogo .io, o
//                   público é o mundo, e o inglês é a língua franca dele.
// Quem fala português continua caindo no português: o casamento por raiz ("pt-PT" → "pt-BR") acontece
// ANTES de chegar aqui.
export const BASE_LANG = "pt-BR";
export const FALLBACK_LANG = "en";
export const LANGS = ["pt-BR", "en", "es"];       // idioma novo = uma entrada aqui + um arquivo ao lado
export const LANG_PREFS = ["auto", ...LANGS];
// O nome de cada idioma fica NO PRÓPRIO idioma: quem fala inglês procura "English" na lista, não "Inglês".
export const LANG_NAMES = { "pt-BR": "Português", en: "English", es: "Español" };
const CARGA = { en: () => import("./en.js"), es: () => import("./es.js") };
const DICT = { [BASE_LANG]: base };
const CHAVE = "warspace_lang";   // o idioma tem que estar decidido ANTES do 1º paint (ver bootLang)

// Merge profundo GENÉRICO em vez da lista de grupos que existia aqui: a lista tinha que ser lembrada a
// cada grupo novo, e esquecer um não dava erro — fazia o grupo inteiro ser SUBSTITUÍDO por um pedaço
// dele (foi assim que `weapons` e `powerupHints` ficaram anos fora dela). Array é substituído, nunca
// mesclado: `places` é uma lista ordenada, não um dicionário.
const ehObj = v => !!v && typeof v === "object" && !Array.isArray(v);
function funde(a, b) {
  if (!b) return a;
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = ehObj(a[k]) && ehObj(b[k]) ? funde(a[k], b[k]) : b[k];
  return out;
}

const navTags = () => (typeof navigator === "undefined" ? []
  : navigator.languages && navigator.languages.length ? [...navigator.languages]
  : navigator.language ? [navigator.language] : []);

/**
 * 'auto' → o primeiro de `navigator.languages` que casar (exato e depois pela raiz, então "pt-PT" e
 * "es-419" acham casa); id conhecido → ele mesmo; ninguém casou → FALLBACK_LANG (inglês). Pura e sem
 * relógio: ao contrário do tema, o idioma do navegador não muda no meio da sessão.
 *
 * ⚠️ A varredura é pela LISTA INTEIRA do navegador antes de desistir. Quem tem `["de","pt-BR"]` — um
 * brasileiro morando na Alemanha — cai no português na segunda volta, e não no inglês da desistência.
 */
export function resolveLang(pref = "auto", tags = navTags()) {
  if (pref && pref !== "auto" && LANGS.includes(pref)) return pref;
  for (const tag of tags || []) {
    if (LANGS.includes(tag)) return tag;
    const raiz = String(tag).toLowerCase().split("-")[0];
    const achou = LANGS.find(l => l.toLowerCase().split("-")[0] === raiz);
    if (achou) return achou;
  }
  return FALLBACK_LANG;
}

let idAtual = BASE_LANG, prefAtual = "auto", cache = new Map(), primeira = true;   // antes de resolver, o que está em memória é o base
export const currentLang = () => idAtual;
export const currentLangPref = () => prefAtual;

/**
 * Os textos prontos: base ← idioma ← tema. O tema entra por ÚLTIMO porque é ele que muda a tagline com
 * a hora do dia; vem de `html[data-theme]` (e não de `currentTheme()`) para este módulo não depender do
 * de tema — os dois são chamados do mesmo lugar e um import cruzado só criaria um ciclo.
 */
export function getLabels(themeId) {
  const th = themeId || (typeof document !== "undefined" ? document.documentElement.dataset.theme : "") || "";
  const ck = idAtual + "|" + th;
  let v = cache.get(ck);
  if (!v) { const dic = funde(base, DICT[idAtual]); v = funde(dic, dic.themes && dic.themes[th]); cache.set(ck, v); }
  return v;
}

/** Preenche `{n}` e afins. Molde que a tradução perdeu fica literal na tela — é o que o teste pega. */
export const preenche = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? String(p[k]) : m)) : s);
/** Um texto por caminho pontuado ("err.full"). Devolve `alt` quando a chave não existe — é assim que a
 *  mensagem pt-BR do servidor continua servindo para um código que o dicionário ainda não conhece. */
export function t(caminho, params, alt) {
  let v = getLabels();
  for (const p of String(caminho).split(".")) { v = v && v[p]; if (v == null) break; }
  return typeof v === "string" ? preenche(v, params) : alt;
}

function aplica() {
  cache.clear();
  if (typeof document !== "undefined") {
    document.documentElement.lang = idAtual;
    // O TÍTULO DA ABA também é texto de UI. Ele nasce cravado no index.html (é o que o buscador lê e o
    // que aparece antes de o bundle subir); daqui em diante quem manda é o idioma do jogador.
    const t = getLabels().pageTitle; if (t) document.title = t;
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("warspace:lang", { detail: { id: idAtual } }));
}

/** Aplica a preferência ('auto' inclusive), carregando o dicionário se preciso. Idempotente. */
export async function setLang(pref = "auto") {
  prefAtual = pref || "auto";
  try { localStorage.setItem(CHAVE, prefAtual); } catch { /* aba anônima, cota cheia: só perde o atalho */ }
  const id = resolveLang(prefAtual);
  // `primeira` força a aplicação inicial mesmo quando o idioma resolvido já é o ativo: é ela que escreve
  // o `lang` do <html> e o título da aba no boot de quem fala português — sem isso os dois só acertariam
  // por acaso, porque vêm cravados no index.html.
  if (id === idAtual && DICT[id]) { if (primeira) { primeira = false; aplica(); } return id; }
  primeira = false;
  if (!DICT[id] && CARGA[id]) {
    // rede fora no meio da troca: fica no idioma anterior em vez de derrubar a tela
    try { DICT[id] = (await CARGA[id]()).default; } catch { return idAtual; }
  }
  // Carga falhou (rede fora no meio da troca): fica no único dicionário garantido, o base. Não é a
  // melhor língua para quem pediu inglês — é a única que existe sem uma segunda ida à rede.
  idAtual = DICT[id] ? id : BASE_LANG;
  aplica();
  return idAtual;
}

/**
 * Chamado por `main.jsx` ANTES do primeiro render. As prefs do jogador só chegam depois do `GET /api/me`,
 * então sem este atalho em localStorage a primeira tela sairia sempre em português para quem escolheu
 * outro idioma — é o mesmo papel do `data-theme="dawn"` cravado no index.html.
 */
export function bootLang(esperaMs = 600) {
  let pref = "auto";
  try { pref = localStorage.getItem(CHAVE) || "auto"; } catch { /* idem */ }
  const p = setLang(pref);
  // ⚠️ Com TETO. O dicionário é um chunk à parte, e num 3G ruim esperar por ele deixaria a tela BRANCA —
  // o que é pior que o flash que este atalho existe para evitar. Estourado o prazo, a tela sobe em pt-BR e
  // o `setLang` segue seu caminho: quando chegar, o evento `warspace:lang` retraduz tudo sozinho.
  return Promise.race([p, new Promise(r => setTimeout(r, esperaMs))]);
}

// ── O CATÁLOGO NO IDIOMA DO JOGADOR ───────────────────────────────────────────
// `shared/` (skins, conquistas, países) é a fonte pt-BR e não sabe que existe idioma: é ele que alimenta
// o `seedSkins` do banco e o payload do servidor. Aqui é a camada que traduz na hora de desenhar — e ela
// é só função pura sobre o dicionário, sem estado.
import { FAMILY_BY_ID, TIER_BY_ID, ACHIEVEMENT_BY_KEY, countryName } from "@warspace/shared";
import { currentLang, getLabels, preenche, BASE_LANG } from "./index.js";
import { fmt } from "../ui/format.js";

const t = () => getLabels();
/** Nome e descrição de uma skin. Cai no catálogo pt-BR quando a tradução ainda não tem a entrada. */
export const skinName = s => (s ? (t().skins[s.id] || {}).n || s.name : "");
export const skinDesc = s => (s ? (t().skins[s.id] || {}).d || s.desc : "");
export const rarityLabel = r => t().rarity[r] || r;
export const tierName = id => t().ach.tier[id] || id;

/** "Sobrevivente III" — família + numeral. Família de tier único não recebe numeral. */
export function achTitle(key) {
  const a = ACHIEVEMENT_BY_KEY.get(key); if (!a) return key;
  if (a.secret) return t().ach.secretTitle;
  const f = FAMILY_BY_ID.get(a.family), tr = TIER_BY_ID.get(a.tier);
  const nome = t().ach.fam[a.family] || a.family;
  return f && f.single ? nome : `${nome} ${tr ? tr.roman : ""}`.trim();
}
export const achFamTitle = famId => t().ach.fam[famId] || famId;
/**
 * A descrição de um nível da família. A CONTA que transforma a meta em unidade humana (segundos →
 * minutos, ticks → minutos) mora em `descArg`, no shared — aqui só se escolhe o molde e se formata o
 * número no locale ativo. `_one` é a variante de singular, para as famílias cuja 1ª meta é 1.
 */
export function achDesc(famId, meta) {
  const f = FAMILY_BY_ID.get(famId); if (!f) return "";
  const n = f.descArg ? f.descArg(meta) : meta;
  const D = t().ach.desc;
  const molde = (n === 1 && f.one && D[famId + "_one"]) || D[famId] || "";
  return preenche(molde, { n: n == null ? "" : fmt(n) });
}
/** Descrição de uma conquista pela chave ("survive.g"). */
export function achDescOf(key) {
  const a = ACHIEVEMENT_BY_KEY.get(key); if (!a) return "";
  return a.secret ? t().ach.secretDesc : achDesc(a.family, a.goal);
}

// ── PAÍSES ────────────────────────────────────────────────────────────────────
// 255 nomes × cada idioma seriam 510 traduções à mão para um dado que o navegador já tem. O `pt-BR`
// continua saindo da lista versionada (é ela que o servidor valida e que serve de chão); os outros saem
// do ICU. Navegador sem `Intl.DisplayNames` cai na lista, ou seja, no comportamento de hoje.
const NOMES = new Map();
export function countryNameIn(code, lang = currentLang()) {
  if (!code) return "";
  if (lang === BASE_LANG) return countryName(code);   // a lista versionada de countries.js é o pt-BR
  let d = NOMES.get(lang);
  if (d === undefined) { try { d = new Intl.DisplayNames([lang], { type: "region" }); } catch { d = null; } NOMES.set(lang, d); }
  if (d) { try { const n = d.of(code); if (n && n !== code) return n; } catch { /* código fora do ICU */ } }
  return countryName(code);
}

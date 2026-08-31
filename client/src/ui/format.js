// ── NÚMEROS, TEMPO E DATA no idioma ativo ─────────────────────────────────────
// O locale era `"pt-BR"` cravado em cada linha daqui — e o id de idioma do jogo JÁ é uma tag BCP-47
// ("pt-BR", "en", "es"), então não há tabela de conversão: `currentLang()` serve direto ao Intl.
// Quem chama isto também chama `useLabels()`, então re-renderiza sozinho quando o idioma muda.
import { currentLang, getLabels, preenche } from "../i18n/index.js";

export const fmt = n => Math.round(+n || 0).toLocaleString(currentLang());
export const fmtTime = s => { s = Math.round(+s || 0); const m = Math.floor(s / 60), h = Math.floor(m / 60);
  return h ? preenche(getLabels().fmt.hm, { h, m: m % 60 }) : `${m}:${String(s % 60).padStart(2, "0")}`; };
export const fmtDate = v => { const d = new Date(v); if (isNaN(d)) return "—"; const lo = currentLang();
  return d.toLocaleDateString(lo, { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString(lo, { hour: "2-digit", minute: "2-digit" }); };
// ORDINAL: "1º" só existe em português. Em inglês são QUATRO formas (1st/2nd/3rd/4th) e quem sabe qual
// é `Intl.PluralRules` com type:"ordinal" — dado, não uma cascata de `if` escrita à mão. O dicionário
// carrega as quatro categorias; em pt e es as quatro são iguais, e é assim que deve ser.
const REGRAS = new Map();
export function ord(n) {
  if (n == null) return "—";
  const lo = currentLang(); let r = REGRAS.get(lo);
  if (!r) { r = new Intl.PluralRules(lo, { type: "ordinal" }); REGRAS.set(lo, r); }
  const O = getLabels().ord;
  return preenche(O[r.select(n)] || O.other, { n });
}

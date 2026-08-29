// ── A ARTE DA MARCA, em UM lugar só ───────────────────────────────────────────
// warspace.io: o planeta anelado, com o anel passando ATRÁS e voltando pela FRENTE — é essa passagem
// que dá profundidade — e o projétil correndo nele, que é o que separa a marca de "mais um planeta".
//
// Três lugares precisam do MESMO desenho: o componente React (`Logo.jsx`), o `theme/preview.js` (que
// duplica o DOM das telas à mão e não passa pelo transform de JSX) e o gerador de assets
// (`scripts/brand-assets.mjs`, que assa favicon, ícones e cartão de compartilhamento). Duas cópias de
// um logo divergem na primeira correção — e aí o ícone da aba deixa de ser a marca do jogo.
//
// Por isso a arte é uma FUNÇÃO de paleta: dentro do app ela recebe `var(--…)` e a marca se re-tinge
// com o tema do relógio; no favicon, que é um arquivo solto e não enxerga o CSS da página, ela recebe
// as cores literais. Mesma geometria, dois destinos.
//
// Só paths, nada de texto: é este símbolo que vira o favicon, e favicon não pode depender de fonte
// carregada. O nome ao lado dele é texto de verdade, em `--font-display`.

/** @typedef {{ink:string,a1:string,a2:string,tx:string}} Paleta */
export const PALETA_CSS = { ink: "var(--line,#141026)", a1: "var(--accent,#ffc22e)", a2: "var(--accent2,#ff6b4a)", tx: "var(--text,#fff5c2)" };
/** Paleta do tema `dawn`, para os arquivos soltos (favicon/ícones/og) que não enxergam os tokens. */
export const PALETA_FIXA = { ink: "#141026", a1: "#ffc22e", a2: "#ff6b4a", tx: "#fff5c2" };

/**
 * O interior do `<svg viewBox="0 0 64 64">` da marca, como markup.
 * @param {Paleta} [p]
 */
export function logoArt(p = PALETA_CSS) {
  const { ink, a1, a2, tx } = p;
  return `<g transform="rotate(-20 32 34)">
  <ellipse cx="32" cy="34" rx="27" ry="9" fill="none" stroke="${ink}" stroke-width="9.5"/>
  <ellipse cx="32" cy="34" rx="27" ry="9" fill="none" stroke="${a2}" stroke-width="4"/></g>
<circle cx="32" cy="31" r="17" fill="${a1}" stroke="${ink}" stroke-width="4"/>
<ellipse cx="25.5" cy="24.5" rx="5" ry="3.2" transform="rotate(-32 25.5 24.5)" fill="#fff" opacity=".45"/>
<g transform="rotate(-20 32 34)">
  <path d="M5 34a27 9 0 0 0 54 0" fill="none" stroke="${ink}" stroke-width="9.5" stroke-linecap="round"/>
  <path d="M5 34a27 9 0 0 0 54 0" fill="none" stroke="${a2}" stroke-width="4" stroke-linecap="round"/>
  <circle cx="59" cy="34" r="5" fill="${tx}" stroke="${ink}" stroke-width="3"/></g>`;
}

/** SVG completo e independente (favicon, ícones, qualquer arquivo solto). */
export const logoSvgFile = (p = PALETA_FIXA) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n${logoArt(p)}\n</svg>\n`;

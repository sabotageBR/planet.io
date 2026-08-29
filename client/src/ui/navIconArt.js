// ── ÍCONES DA TELA INICIAL, em UM lugar só ────────────────────────────────────
// Os seis botões da entrada usavam EMOJI injetado por `content:` no CSS de cada tema, com a cor do
// círculo cravada fora dos tokens — e o botão "Modos", que nasceu depois dos mockups, não tinha
// nenhum: caía num círculo azul vazio. Emoji também muda de desenho a cada sistema operacional, o que
// é justamente o que faz uma tela parecer improvisada.
//
// Traço de 24×24 em `currentColor`, no molde do `TalkRing` (Hud.jsx): a cor vem do botão, então os três
// temas do relógio pintam sozinhos. Markup em .js puro (não JSX) porque `theme/preview.js`, que
// duplica o DOM das telas para o `theme-preview.html`, também precisa deles — e o preview não passa
// pelo transform de JSX.
const D = {
  // escolha de modo: quatro opções sobre a mesa
  modes: `<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="2"/>
<rect x="3.5" y="13" width="7.5" height="7.5" rx="2"/><rect x="13" y="13" width="7.5" height="7.5" rx="2"/>`,
  // salas: antena no ar, com as ondas de quem está transmitindo agora
  lobby: `<path d="M12 21v-7"/><circle cx="12" cy="11" r="2.4"/><path d="M7.6 6.6a7 7 0 0 0 0 8.8M16.4 6.6a7 7 0 0 1 0 8.8"/>`,
  // ranking: troféu com as duas alças
  rank: `<path d="M7 4h10v5.5a5 5 0 0 1-10 0Z"/><path d="M7 6H4.2v1.8a3.2 3.2 0 0 0 3 3.2M17 6h2.8v1.8a3.2 3.2 0 0 1-3 3.2"/><path d="M12 14.5V18M8.5 20h7"/>`,
  // perfil: o busto de sempre — aqui o reconhecimento vale mais que a invenção
  profile: `<circle cx="12" cy="8" r="3.8"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>`,
  // loja: sacola com alça
  shop: `<path d="M5.6 8h12.8l-1.1 12H6.7Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>`,
  // opções: controles deslizantes (a engrenagem vira borrão a 20 px; três cursores não)
  prefs: `<path d="M4 7h8M16 7h4M4 12h4M12 12h8M4 17h8M16 17h4"/><circle cx="14" cy="7" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="14" cy="17" r="2"/>`,
};
export const NAV_ICON_KEYS = Object.keys(D);
/** O interior do `<svg viewBox="0 0 24 24">` do ícone; string vazia para chave desconhecida. */
export const navIconArt = k => D[k] || "";
/** SVG completo, para quem monta markup por string (theme/preview.js). */
export const navIconSvg = (k, cls = "nav-svg") =>
  `<svg class="${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${navIconArt(k)}</svg>`;

// ── PONTE DO TEMA ─────────────────────────────────────────────────────────────
// Único ponto do shell que sabe de onde vem o módulo de tema (client/src/theme/index.js):
//   applyTheme(id) · resolveThemeId(pref) · startThemeClock(getPref, onChange?) · currentTheme() · THEMES
//   currentTheme() → {id,name,layout:{nav:'drawer'|'sheet'},labels,rarityColor,textures,effects,hud}
//   applyTheme() põe html[data-theme] e dispara o evento `planet:theme` em window.
// all.css = base (estrutura) + os três temas escopados por html[data-theme].
export * from "../theme/index.js";
import "../theme/all.css";

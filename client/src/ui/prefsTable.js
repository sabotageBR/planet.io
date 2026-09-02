// ── TABELA DE PREFERÊNCIAS ────────────────────────────────────────────────────
// Mesmos grupos de mockups/v2/src/data.js, mas só com as chaves da whitelist de PATCH /api/me/prefs
// (sens/trails/fx/parallax ficaram de fora). O padrão de cada uma está em state/app.js PREF_DEFAULTS.
//
// ⚠️ Aqui só moram CHAVES e TIPOS. O texto (55 strings) morava cravado neste arquivo e era o único
// dicionário do cliente que nenhuma tradução alcançaria — hoje sai do grupo `prefs` de i18n/*.js, pela
// convenção `prefs[chave]` para o rótulo da linha e `prefs[chave_valor]` para o de cada opção.
// Duas exceções, porque não são texto de UI: as TECLAS (o rótulo é a tecla física, grupo `keys`) e os
// nomes de IDIOMA, que ficam sempre no próprio idioma — quem fala inglês procura "English" na lista.
import { ACTION_KEYS } from "@warspace/shared";
import { LANG_PREFS } from "../i18n/index.js";
import { SEM_VOZ } from "../portal/flags.js";
export const PREFS = [
  { id: "controls", items: [
    { key: "joystick", type: "toggle" },
    { key: "rightSplit", type: "toggle" },
    { key: "holdEject", type: "toggle" },
    { key: "wheelZoom", type: "toggle" },
    { key: "keySplit", type: "select", opts: ACTION_KEYS, kind: "key" },
    { key: "keyEject", type: "select", opts: ACTION_KEYS, kind: "key" } ] },
  { id: "graphics", items: [
    { key: "theme", type: "select", opts: ["auto", "dawn", "sunset", "dusk"] },
    { key: "quality", type: "select", opts: ["auto", "low", "high"] },
    { key: "showGrid", type: "toggle" } ] },
  { id: "sound", items: [
    { key: "muted", type: "toggle" },
    { key: "sound", type: "toggle" },
    { key: "music", type: "toggle" },
    { key: "musicVolume", type: "range", min: 0, max: 100 },
    { key: "ambience", type: "toggle" },
    { key: "volume", type: "range", min: 0, max: 100 },
    // ⚠️ Sob SEM_VOZ estas duas SOMEM: no pacote de portal o push-to-talk não abre (ver portal/flags.js),
    // e um par de controles que não liga nada é pior que controle nenhum.
    ...(SEM_VOZ ? [] : [{ key: "voice", type: "toggle" },
    { key: "voiceVolume", type: "range", min: 0, max: 100 }]) ] },
  { id: "ui", items: [
    { key: "lang", type: "select", opts: LANG_PREFS, kind: "lang" },
    { key: "showNames", type: "toggle" },
    { key: "showMinimap", type: "toggle" },
    { key: "showFps", type: "toggle" },
    { key: "lbSize", type: "select", opts: [5, 8, 10], kind: "num" },
    { key: "chat", type: "toggle" },
    // Os três modelos da tela de fim de rodada e a abertura dela (ver PREF_DEFAULTS em state/app.js).
    { key: "deadStyle", type: "select", opts: ["duelo", "balanco", "sala"] },
    { key: "roundStyle", type: "select", opts: ["podio", "cinema", "dossie"] },
    { key: "roundIntro", type: "toggle" } ] },
  { id: "a11y", items: [
    { key: "colorblind", type: "select", opts: ["off", "deutan", "protan", "tritan"] },
    { key: "reduceMotion", type: "toggle" },
    { key: "bigText", type: "toggle" } ] },
];

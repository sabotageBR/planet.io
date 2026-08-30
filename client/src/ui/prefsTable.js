// ── TABELA DE PREFERÊNCIAS ────────────────────────────────────────────────────
// Mesmos grupos de mockups/v2/src/data.js, mas só com as chaves da whitelist de PATCH /api/me/prefs
// (sens/trails/fx/parallax ficaram de fora). `v` = padrão (também em state/app.js PREF_DEFAULTS).
import { ACTION_KEYS, KEY_LABEL } from "@warspace/shared";
// As opções de tecla saem da lista COMPARTILHADA: a mesma que o Keyboard.js casa e que o servidor
// valida. Montada aqui, uma tecla nova aparece nos três lugares de uma vez.
const KEY_OPTS = ACTION_KEYS.map(k => [k, KEY_LABEL[k] || k]);
export const PREFS = [
  { id: "controls", title: "Controles", items: [
    { key: "joystick", label: "Joystick virtual (celular)", type: "toggle" },
    { key: "rightSplit", label: "Botão direito divide", type: "toggle" },
    { key: "holdEject", label: "Segurar a tecla ejeta contínuo", type: "toggle" },
    { key: "keySplit", label: "Tecla de dividir", type: "select", opts: KEY_OPTS },
    { key: "keyEject", label: "Tecla de ejetar", type: "select", opts: KEY_OPTS } ] },
  { id: "graphics", title: "Gráficos", items: [
    { key: "theme", label: "Tema", type: "select", opts: [["auto", "Automático (hora local)"], ["dawn", "Amanhecer"], ["sunset", "Crepúsculo"], ["dusk", "Anoitecer"]] },
    { key: "quality", label: "Qualidade", type: "select", opts: [["auto", "Automática"], ["low", "Baixa"], ["high", "Alta"]] },
    { key: "showGrid", label: "Grade do mapa", type: "toggle" } ] },
  { id: "sound", title: "Som", items: [
    { key: "sound", label: "Efeitos sonoros", type: "toggle" },
    { key: "music", label: "Música", type: "toggle" },
    { key: "musicVolume", label: "Volume da música", type: "range", min: 0, max: 100 },
    { key: "ambience", label: "Ambiência", type: "toggle" },
    { key: "volume", label: "Volume", type: "range", min: 0, max: 100 },
    { key: "voice", label: "Voz dos jogadores (Ctrl para falar)", type: "toggle" },
    { key: "voiceVolume", label: "Volume da voz", type: "range", min: 0, max: 100 } ] },
  { id: "ui", title: "Interface", items: [
    { key: "showNames", label: "Mostrar nomes", type: "toggle" },
    { key: "showMinimap", label: "Minimapa", type: "toggle" },
    { key: "showFps", label: "Mostrar FPS e ping", type: "toggle" },
    { key: "lbSize", label: "Linhas do placar", type: "select", opts: [[5, "5"], [8, "8"], [10, "10"]] },
    { key: "chat", label: "Chat", type: "toggle" } ] },
  { id: "a11y", title: "Acessibilidade", items: [
    { key: "colorblind", label: "Modo daltonismo", type: "select", opts: [["off", "Desligado"], ["deutan", "Deuteranopia"], ["protan", "Protanopia"], ["tritan", "Tritanopia"]] },
    { key: "reduceMotion", label: "Reduzir movimento", type: "toggle" },
    { key: "bigText", label: "Texto maior", type: "toggle" } ] },
];

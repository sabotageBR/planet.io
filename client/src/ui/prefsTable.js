// ── TABELA DE PREFERÊNCIAS ────────────────────────────────────────────────────
// Mesmos grupos de mockups/v2/src/data.js, mas só com as chaves da whitelist de PATCH /api/me/prefs
// (sens/trails/fx/parallax ficaram de fora). `v` = padrão (também em state/app.js PREF_DEFAULTS).
export const PREFS = [
  { id: "controls", title: "Controles", items: [
    { key: "joystick", label: "Joystick virtual (celular)", type: "toggle" },
    { key: "rightSplit", label: "Botão direito divide", type: "toggle" },
    { key: "holdEject", label: "Segurar W ejeta contínuo", type: "toggle" } ] },
  { id: "graphics", title: "Gráficos", items: [
    { key: "theme", label: "Tema", type: "select", opts: [["auto", "Automático (hora local)"], ["dawn", "Amanhecer"], ["sunset", "Crepúsculo"], ["dusk", "Anoitecer"]] },
    { key: "quality", label: "Qualidade", type: "select", opts: [["auto", "Automática"], ["low", "Baixa"], ["high", "Alta"]] },
    { key: "showGrid", label: "Grade do mapa", type: "toggle" } ] },
  { id: "sound", title: "Som", items: [
    { key: "sound", label: "Efeitos sonoros", type: "toggle" },
    { key: "music", label: "Música", type: "toggle" },
    { key: "ambience", label: "Ambiência", type: "toggle" },
    { key: "volume", label: "Volume", type: "range", min: 0, max: 100 } ] },
  { id: "ui", title: "Interface", items: [
    { key: "showNames", label: "Mostrar nomes", type: "toggle" },
    { key: "showMinimap", label: "Minimapa", type: "toggle" },
    { key: "showFps", label: "Mostrar FPS e ping", type: "toggle" },
    { key: "lbSize", label: "Linhas do placar", type: "select", opts: [[5, "5"], [8, "8"], [10, "10"]] } ] },
  { id: "a11y", title: "Acessibilidade", items: [
    { key: "colorblind", label: "Modo daltonismo", type: "select", opts: [["off", "Desligado"], ["deutan", "Deuteranopia"], ["protan", "Protanopia"], ["tritan", "Tritanopia"]] },
    { key: "reduceMotion", label: "Reduzir movimento", type: "toggle" },
    { key: "bigText", label: "Texto maior", type: "toggle" } ] },
];

// ── ESTADO DO SHELL ───────────────────────────────────────────────────────────
// Só UI: sessão (usuário/skins/prefs/stats/conquistas/online), tela, overlays, sala, toast, modo,
// última partida e recompensas. A simulação vive no módulo do jogo (hudStore), não aqui.
import { createStore } from "./store.js";

export const SCREENS = ["entry", "lobby", "rank", "profile", "shop", "prefs", "game", "dead", "round"];
export const NAV_SCREENS = ["entry", "lobby", "rank", "profile", "shop", "prefs"];

/** Whitelist de PATCH /api/me/prefs (docs/spec/api.md) com os padrões do cliente. */
export const PREF_DEFAULTS = Object.freeze({
  quality: "auto", showNames: true, showMass: true, showGrid: true, showMinimap: true, showFps: true,
  sound: true, music: false, volume: 70, joystick: false, holdEject: true, rightSplit: true,
  theme: "auto", reduceMotion: false, bigText: false, colorblind: "off", lbSize: 8,
});
export const PREF_KEYS = Object.keys(PREF_DEFAULTS);
export const normalizePrefs = p => { const o = { ...PREF_DEFAULTS }; if (p) for (const k of PREF_KEYS) if (p[k] !== undefined && p[k] !== null) o[k] = p[k]; o.volume = +o.volume; o.lbSize = +o.lbSize || 8; return o; };

export const EMPTY_STATS = Object.freeze({ games: 0, kills: 0, botKills: 0, splits: 0, ejects: 0, bestScore: 0, bestMass: 0, playTime: 0, bestStreak: 0 });
/** Aceita camelCase e snake_case vindos do servidor. */
export function normalizeStats(s) {
  if (!s) return EMPTY_STATS;
  const pick = (...ks) => { for (const k of ks) if (s[k] != null) return +s[k] || 0; return 0; };
  return { games: pick("games", "matches"), kills: pick("kills"), botKills: pick("botKills", "bot_kills"), splits: pick("splits"), ejects: pick("ejects"),
    bestScore: pick("bestScore", "best_score"), bestMass: pick("bestMass", "best_mass"), playTime: pick("playTime", "play_time", "playTimeS", "play_time_s"), bestStreak: pick("bestStreak", "best_streak") };
}

export const initialState = {
  booted: false, bootError: null,
  session: { user: null, skins: [0], prefs: { ...PREF_DEFAULTS }, stats: EMPTY_STATS, achievements: [], online: null, server: null, dayRank: null },
  screen: "entry",
  overlays: { account: false, reconn: false },
  reconnAttempt: 0,
  room: null,            // código da sala atual (do evento `room` do jogo)
  pendingJoin: null,     // {room, n} — GameHost faz o join quando muda
  conn: "idle",          // idle|connecting|connected|reconnecting|closed
  toast: null,           // {msg, n}
  mode: "desktop",       // desktop|portrait|landscape (body[data-mode])
  lastMatch: null,       // {by, byHole, score, maxMass, kills, durationS, room, at}
  roundResult: null,     // {code, champion, board:[{slot,name,mass,score,kills,isBot,registered}], nextInMs, at} — fim do mundo
  rewards: null,         // {saved, coinsEarned, coins, achievements, skinsUnlocked, rank:{day}}
  rewardsPending: false,
  rooms: [], roomsAt: 0,
  top5: [],
  config: null,
};
export const app = createStore(initialState);

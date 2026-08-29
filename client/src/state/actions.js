// ── AÇÕES DO SHELL ────────────────────────────────────────────────────────────
// Tudo que muda o estado passa por aqui (telas, sessão, prefs, loja, conta, partida).
import { api, isUnreachable } from "../api/client.js";
import { app, normalizePrefs, normalizeStats, PREF_DEFAULTS, PREF_KEYS, SCREENS } from "./app.js";
import { applyTheme, resolveThemeId, startThemeClock } from "../app/theme.js";
import { LABELS } from "../ui/labels.js";
import { skinById } from "@warspace/shared";
import { clockRef, gameRef } from "./game.js";

const Q = new URLSearchParams(location.search);
const NICK_RE = /^.{2,16}$/;

// ── toast / navegação / overlays ─────────────────────────────────────────────
let toastN = 0, toastT = null;
export function toast(msg, ms = 1800) {
  clearTimeout(toastT); app.update({ toast: { msg: String(msg), n: ++toastN } });
  toastT = setTimeout(() => app.update({ toast: null }), ms);
}
export function go(screen) {
  if (!SCREENS.includes(screen)) return;
  app.update(s => ({ ...s, screen, overlays: { account: false, reconn: s.overlays.reconn && screen === "game" } }));
}
export const openAccount = () => app.update(s => ({ ...s, overlays: { ...s.overlays, account: true } }));
export const closeAccount = () => app.update(s => ({ ...s, overlays: { ...s.overlays, account: false } }));
export const setReconn = (on, attempt) => app.update(s => ({ ...s, overlays: { ...s.overlays, reconn: !!on }, reconnAttempt: on ? (attempt || s.reconnAttempt || 1) : 0 }));
/** Esc: fecha modal → tira foco do input → volta à entrada (fora do jogo). */
export function escape() {
  const s = app.get();
  if (s.overlays.account) { closeAccount(); return true; }
  const a = document.activeElement;
  if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) { a.blur(); return true; }
  if (s.screen !== "game" && s.screen !== "dead" && s.screen !== "entry") { go("entry"); return true; }
  return false;
}

// ── sessão ───────────────────────────────────────────────────────────────────
export function applySession(me) {
  const prefs = normalizePrefs(me.prefs);
  app.update(s => ({ ...s, session: { ...s.session, user: me.user, skins: me.skins && me.skins.length ? me.skins : [0], prefs,
    stats: normalizeStats(me.stats), achievements: me.achievements || [], online: api.online, server: api.server } }));
  applyPrefsSideEffects(prefs);
}
export const patchUser = patch => app.update(s => ({ ...s, session: { ...s.session, user: { ...(s.session.user || {}), ...patch } } }));

let themeClock = null, lastThemePref = null;
const themePref = () => app.get().session.prefs.theme || "auto";
/** Efeitos imediatos das prefs: tema (aplica já; o relógio reavalia 'auto' a cada minuto/foco), body[data-reduce|bigtext|colorblind]. */
export function applyPrefsSideEffects(prefs) {
  const b = document.body.dataset;
  b.reduce = prefs.reduceMotion ? "1" : "0"; b.bigtext = prefs.bigText ? "1" : "0"; b.colorblind = prefs.colorblind || "off";
  if (prefs.theme !== lastThemePref) { lastThemePref = prefs.theme; applyTheme(resolveThemeId(prefs.theme || "auto"), { fade: true }); }   // trocar o tema na mão também passa pelo fade
  if (!themeClock) themeClock = startThemeClock(themePref, null, { getHour: () => clockRef.get().hour });   // dentro da partida o céu segue o relógio da rodada
}

export async function boot() {
  try { applySession(await api.bootstrap()); }
  catch (e) { app.update({ bootError: e.message || String(e) }); applyPrefsSideEffects(PREF_DEFAULTS); }
  app.update({ booted: true });
  if (api.server === false) toast(LABELS.offlineNote, 3200); else if (api.online === false) toast(LABELS.noDbNote, 3200);
  loadConfig(); loadTop5(); loadRooms();
  const conv = Q.get("party");
  if (conv) { history.replaceState(null, "", location.pathname); joinParty(conv); return; }   // link de convite: cai direto no lobby da equipe do amigo
  devQuery();
}
/** ?screen=<id> (entry|account|lobby|rank|profile|shop|prefs|game|dead|round|reconn) — atalho de desenvolvimento. */
function devQuery() {
  const s = Q.get("screen"); if (s) mostrarTela(s);
  // A matriz de responsividade (scripts/responsive-check.mjs) precisa passar por `dead` e `round`, que não
  // têm botão de navegação nenhum — e recarregar a página com ?screen= a cada uma das ~400 combinações
  // levaria minutos. Em DEV, o mesmo atalho fica pendurado no window.
  if (import.meta.env.DEV) { window.__tela = mostrarTela; window.__hudDemo = hudDemo; }
}
/**
 * HUD de mentira, só em DEV. A matriz de responsividade precisa MEDIR a tela `game` — mas sem partida o
 * placar tem 0 linhas, o kill feed está vazio e o bloco de massa não tem número: os três ficam com altura
 * zero, o `vis()` da sonda os descarta, e a coluna direita inteira passava despercebida pelas ~400
 * combinações. Aqui a tela vira "game" de verdade (o `Hud` só some quando `screen!=="game"`) e o hudStore
 * recebe dados no pior formato plausível: nomes longos, números grandes, feed cheio.
 */
function hudDemo() {
  const g = gameRef.get().game;
  app.update({ screen: "game", played: true });
  if (!g || !g.hudStore) return;
  const nome = i => ["Fodao","Stellara","Astrophex","Hydraxis","Darkion","Meteora","Nexaris","Volcanix","Nebulox","Quasara","xXcapitaoXx","trovao_137"][i % 12];
  const lb = Array.from({ length: 12 }, (_, i) => ({ slot: i, name: nome(i), mass: 183273 - i * 12000, level: 60 - i * 3, isBot: i % 3 === 0, registered: i % 4 === 0, me: i === 0, rank: i + 1 }));
  const quem = i => ({ slot: i, name: nome(i), level: 40 - i * 5, me: i === 0, bot: false, ally: i === 1 });
  const agora = Date.now();
  const feed = [
    { id: 1, at: agora, k: "kill", how: "missile", a: quem(0), b: quem(1), assist: null, mine: true },
    { id: 2, at: agora, k: "kill", how: "eat", byHow: "star", a: quem(2), b: quem(3), assist: quem(4), mine: false },
    { id: 3, at: agora, k: "hazard", how: "zone", a: null, b: quem(5), assist: null, mine: false },
    { id: 4, at: agora, k: "sys", how: "lead", a: quem(0), b: null, assist: null, n: 0, mine: true },
    { id: 5, at: agora, k: "sys", how: "crunch", a: null, b: null, assist: null, n: 300, mine: false },
    { id: 6, at: agora, k: "kill", how: "cluster", a: quem(6), b: quem(7), assist: null, mine: false },
  ];
  g.hudStore.update(h => ({ ...h, mass: 183273, score: 139933, rank: 1, coins: 2087, ammo: 3, weapon: 0, owned: 3,
    powerups: { magnet: 12, shield: 3 }, lb, feed, room: "253A", ping: 49, fps: 60,
    clock: { h: 16, m: 16, leftS: 2276 }, alive: 24 }));
}
function mostrarTela(s) {
  if (s === "account") { go("entry"); openAccount(); }
  else if (s === "game") play({});
  else if (s === "reconn") { play({}); setTimeout(() => setReconn(true, 2), 400); }
  else if (s === "dead" || s === "round") {
    if (!import.meta.env.DEV) return;
    app.update({ room: "1ABC", played: true, lastMatch: { by: "Nebulox", byHole: false, score: 6900, maxMass: 4820, kills: 3, durationS: 372, room: "1ABC", at: Date.now() }, rewards: null, rewardsPending: true, screen: "dead" });
    if (s === "round") app.update({ room: "1ABC", roundResult: { code: "1ABC", mySlot: 3, at: Date.now(), nextInMs: 15000,
      champion: { slot: 1, name: "Vortexia", mass: 12400, isBot: true },
      board: [{ slot: 1, name: "Vortexia", mass: 12400, isBot: true, skinId: 30 }, { slot: 3, name: "Você", mass: 8200, skinId: 18 }, { slot: 5, name: "Drakonis", mass: 3100, isBot: true, skinId: 34 },
        { slot: 7, name: "Cosmara", mass: 2400, isBot: true, skinId: 13 }, { slot: 9, name: "Stellara", mass: 1800, isBot: true, skinId: 26 }, { slot: 11, name: "Graviton", mass: 900, isBot: true, skinId: 20 }] }, rewards: null, rewardsPending: true, screen: "round" });
    setTimeout(() => onRewards({ saved: true, coinsEarned: 54, coins: (app.get().session.user || {}).coins + 54 || 54, achievements: [], skinsUnlocked: [], rank: { day: 35 } }), 1200);
  }
  else go(s);
}

// ── dados de apoio ───────────────────────────────────────────────────────────
export async function loadConfig() { try { app.update({ config: await api.config() }); } catch { /* opcional */ } }
export async function loadTop5() {
  try { const r = await api.ranking("day", "score", 5);
    app.update(s => ({ ...s, top5: r.rows || [], session: { ...s.session, dayRank: r.me ? r.me.rank : null } })); }
  catch { /* opcional */ }
}
export async function loadRooms() {
  try { const r = await api.rooms(); app.update({ rooms: r.rooms || [], roomsAt: Date.now() }); }
  catch { /* opcional */ }
}
export async function loadSkins() {
  try { const r = await api.skins(); if (!r) return;
    app.update(s => ({ ...s, session: { ...s.session, skins: r.owned && r.owned.length ? r.owned : s.session.skins, user: s.session.user && r.equipped != null ? { ...s.session.user, equippedSkin: r.equipped } : s.session.user } })); }
  catch { /* opcional */ }
}
export async function loadHistory(limit = 20) {
  try { const r = await api.history(limit); return r.matches || []; } catch { return []; }
}

// ── nick / conta ─────────────────────────────────────────────────────────────
/** PATCH /api/me {nick}. Devolve {ok, suggestion?}. */
export async function setNick(nick) {
  nick = String(nick || "").replace(/\s+/g, " ").trim();
  const cur = (app.get().session.user || {}).nick;
  if (nick === cur) return { ok: true };
  if (!NICK_RE.test(nick)) { toast(LABELS.nickShort); return { ok: false }; }
  try { const r = await api.setNick(nick); patchUser(r && r.user ? r.user : { nick }); toast(LABELS.nickSaved); return { ok: true }; }
  catch (e) { toast(e.message + (e.suggestion ? ` · ${e.suggestion}` : ""), 3000); return { ok: false, suggestion: e.suggestion, error: e }; }
}
export async function claim({ nick, password, email }) {
  const cur = (app.get().session.user || {}).nick;
  if (nick && nick !== cur) { const r = await setNick(nick); if (!r.ok) throw r.error || new Error(LABELS.nickShort); }
  const r = await api.claim({ password, email });
  if (r && r.user) patchUser(r.user); else patchUser({ kind: "registered" });
  closeAccount(); toast(LABELS.claimed); return r;
}
export async function login({ login: l, password }) {
  await api.login({ login: l, password });
  applySession(await api.bootstrap());
  closeAccount(); toast(LABELS.loggedIn); loadTop5();
}
/**
 * País do ranking regional. Otimista (a lista responde na hora) e reverte no erro, como as ações da loja.
 * `null` limpa: entrar no recorte é opcional, e sair também tem que ser.
 */
export async function setCountry(country) {
  const antes = app.get().session.user;
  app.update(s => ({ ...s, session: { ...s.session, user: { ...s.session.user, country: country || null } } }));
  try { const r = await api.setCountry(country); app.update(s => ({ ...s, session: { ...s.session, user: { ...s.session.user, ...(r.user || {}) } } })); }
  catch (e) { app.update(s => ({ ...s, session: { ...s.session, user: antes } })); toast(e.message || "não deu para salvar o país"); }
}
export async function logout() {
  await api.logout(); applySession(await api.bootstrap()); toast(LABELS.loggedOut); go("entry");
}

// ── preferências ─────────────────────────────────────────────────────────────
let prefsT = null, prefsDirty = {};
const schedule = () => { clearTimeout(prefsT); prefsT = setTimeout(() => flushPrefs(), 600); };
export function setPref(key, val) {
  if (!PREF_KEYS.includes(key)) return;
  app.update(s => ({ ...s, session: { ...s.session, prefs: { ...s.session.prefs, [key]: val } } }));
  applyPrefsSideEffects(app.get().session.prefs);
  prefsDirty[key] = val; schedule();
}
export async function flushPrefs() {
  clearTimeout(prefsT); const d = prefsDirty; prefsDirty = {};
  if (!Object.keys(d).length) return true;
  try { await api.setPrefs(d); return true; } catch (e) { toast(e.message, 2500); return false; }
}
export async function savePrefs() {
  const p = app.get().session.prefs; PREF_KEYS.forEach(k => { prefsDirty[k] = p[k]; });
  if (await flushPrefs()) toast(LABELS.saved);
}
export function resetPrefs() {
  app.update(s => ({ ...s, session: { ...s.session, prefs: { ...PREF_DEFAULTS } } }));
  applyPrefsSideEffects(PREF_DEFAULTS); PREF_KEYS.forEach(k => { prefsDirty[k] = PREF_DEFAULTS[k]; }); schedule();
}

// ── loja (UI otimista) ───────────────────────────────────────────────────────
export async function equipSkin(id) {
  const before = app.get().session.user; if (!before) return;
  if (!app.get().session.skins.includes(id)) { toast(LABELS.lockedToast); return; }
  patchUser({ equippedSkin: id });
  try { const r = await api.equip(id); if (r && r.equippedSkin != null) patchUser({ equippedSkin: r.equippedSkin }); toast(LABELS.equippedToast); }
  catch (e) { patchUser({ equippedSkin: before.equippedSkin }); toast(e.message, 2500); }
}
export async function buySkin(id) {
  const s = app.get().session, sk = skinById(id); if (!s.user) return;
  if (s.skins.includes(id)) return equipSkin(id);
  if (sk.rarity === "secret") { toast(LABELS.secretToast); return; }
  if (sk.unlockKey || sk.price <= 0) { toast(LABELS.lockedToast + ": " + sk.desc); return; }
  if (s.user.coins < sk.price) { toast(LABELS.poorToast); return; }
  const snapshot = { coins: s.user.coins, skins: s.skins, equipped: s.user.equippedSkin };
  app.update(st => ({ ...st, session: { ...st.session, skins: [...st.session.skins, id], user: { ...st.session.user, coins: st.session.user.coins - sk.price, equippedSkin: id } } }));
  try {
    const r = await api.buy(id);
    app.update(st => ({ ...st, session: { ...st.session, skins: r && r.owned ? r.owned : st.session.skins, user: { ...st.session.user, coins: r && typeof r.coins === "number" ? r.coins : st.session.user.coins } } }));
    toast(LABELS.bought);
    try { await api.equip(id); } catch { patchUser({ equippedSkin: snapshot.equipped }); }
  } catch (e) {
    app.update(st => ({ ...st, session: { ...st.session, skins: snapshot.skins, user: { ...st.session.user, coins: snapshot.coins, equippedSkin: snapshot.equipped } } }));
    toast(e.message, 2500);
  }
}

// ── partida ──────────────────────────────────────────────────────────────────
/** Entra numa sala: `room` explícito, senão GET /api/auto (offline → sala local do stub). */
export async function play({ room, mode, teamSize, party } = {}) {
  const st = app.get();
  const md = mode != null ? mode | 0 : st.gameMode | 0, ts = teamSize != null ? teamSize | 0 : st.teamSize || 1;
  const pt = party !== undefined ? party : (st.party ? st.party.code : null);
  let code = room ? String(room).toUpperCase() : null;
  if (!code) { try { const a = await api.auto({ mode: md, teamSize: ts }); if (a && a.code) code = a.code; } catch (e) { if (!isUnreachable(e)) toast(e.message, 2500); } }
  app.update(s => ({ ...s, screen: "game", played: true, rewards: null, rewardsPending: false, overlays: { account: false, reconn: false }, conn: "connecting",
    gameMode: md, teamSize: ts,
    pendingJoin: { room: code, mode: md, teamSize: ts, party: pt, n: (s.pendingJoin ? s.pendingJoin.n : 0) + 1 } }));
}
// ── modos e lobby de equipe ────────────────────────────────────────────────
export function setMode(mode, teamSize = 1) { app.update({ gameMode: mode | 0, teamSize: teamSize | 0 || 1 }); }
const meNick = () => (app.get().session.user || {}).nick || "Viajante";
const meSkin = () => (app.get().session.user || {}).equippedSkin | 0;
export async function createParty(teamSize) {
  try { const r = await api.partyCreate({ mode: 1, teamSize, nick: meNick(), skinId: meSkin() });
    app.update({ party: r.party, partyMe: r.you || null, partyError: null, gameMode: 1, teamSize: r.party.teamSize, screen: "party" }); return r.party; }
  catch (e) { toast(e.message, 2800); return null; }
}
export async function joinParty(code) {
  const c = String(code || "").trim().toUpperCase();
  if (c.length !== 4) { toast(LABELS.partyCode + ": 4 caracteres"); return null; }
  try { const r = await api.partyJoin(c, { nick: meNick(), skinId: meSkin() });
    app.update({ party: r.party, partyMe: r.you || null, partyError: null, gameMode: 1, teamSize: r.party.teamSize, screen: "party" }); return r.party; }
  catch (e) { toast(e.message, 2800); return null; }
}
/** Recarrega o lobby (a tela faz polling a 1 Hz — é um lobby, não precisa de WebSocket). */
export async function refreshParty() {
  const p = app.get().party; if (!p) return;
  try { const r = await api.partyGet(p.code); app.update({ party: r.party, partyMe: r.you || app.get().partyMe });
    // o líder já começou: quem estava esperando entra na MESMA sala
    if (r.party.started && r.party.room && app.get().screen === "party") play({ room: r.party.room, mode: 1, teamSize: r.party.teamSize, party: r.party.code }); }
  catch { app.update({ party: null, partyError: "gone" }); toast(LABELS.partyGone || "A equipe se desfez.", 2500); go("modes"); }
}
export async function leaveParty() {
  const p = app.get().party; if (!p) { go("modes"); return; }
  try { await api.partyLeave(p.code); } catch { /* já expirou */ }
  app.update({ party: null, partyMe: null }); go("modes");
}
/** O líder começa: escolhe a sala e avisa o lobby, para os companheiros caírem no mesmo código. */
export async function startParty() {
  const p = app.get().party; if (!p) return;
  let code = null;
  try { const a = await api.auto({ mode: 1, teamSize: p.teamSize }); if (a && a.code) code = a.code; } catch { /* cai no auto do play */ }
  try { await api.partyStart(p.code, code); } catch (e) { toast(e.message, 2500); return; }
  play({ room: code, mode: 1, teamSize: p.teamSize, party: p.code });
}
export function leaveGame(screen = "lobby") {
  app.update(s => ({ ...s, screen, overlays: { account: false, reconn: false }, pendingJoin: null, conn: "idle", reconnAttempt: 0 }));
}
let rewardsT = null;
/** Callback do jogo: fim da rodada — {code, champion, board, nextInMs, tick}. Mostra o placar da sala. */
export function onRoundEnd(r) {
  clearTimeout(rewardsT);
  app.update(s => ({ ...s, screen: "round", roundResult: { ...r, at: Date.now() }, rewards: null, rewardsPending: true }));
  rewardsT = setTimeout(() => { if (app.get().rewardsPending) app.update({ rewardsPending: false }); }, 5000);
}
/** Callback do jogo: {by, byHole, score, maxMass, kills, durationS}. */
export function onDead(info) {
  const s = app.get();
  app.update({ lastMatch: { ...info, room: s.room, at: Date.now() }, rewards: null, rewardsPending: true, screen: "dead" });
  clearTimeout(rewardsT); rewardsT = setTimeout(() => { if (app.get().rewardsPending) app.update({ rewardsPending: false }); }, 5000);
}
/** Callback do jogo: {saved, coinsEarned, coins, achievements:[{key,title}], skinsUnlocked:[id], rank:{day}} */
export function onRewards(r) {
  clearTimeout(rewardsT);
  app.update(s => {
    const sess = { ...s.session };
    if (r && sess.user) {
      const coins = typeof r.coins === "number" ? r.coins : (sess.user.coins || 0) + (r.coinsEarned || 0);
      sess.user = { ...sess.user, coins };
      if (r.achievements && r.achievements.length) sess.achievements = [...new Set([...sess.achievements, ...r.achievements.map(a => (a && a.key) || a)])];
      if (r.skinsUnlocked && r.skinsUnlocked.length) sess.skins = [...new Set([...sess.skins, ...r.skinsUnlocked])];
      if (r.rank && r.rank.day != null) sess.dayRank = r.rank.day;
      if (r.rank && r.rank.country) sess.countryRank = r.rank.country;
      // XP/nível: o servidor manda o total e o nível já derivados (a curva mora em shared/src/levels.js),
      // então aqui só se guarda — nada de recalcular e arriscar duas verdades.
      if (r.xp) sess.stats = { ...sess.stats, xp: r.xp.total, level: r.xp.level,
        levelInto: r.xp.into, levelNeed: r.xp.need, levelPct: r.xp.pct };
    }
    return { ...s, session: sess, rewards: r || null, rewardsPending: false };
  });
  // Subir de nível é a única coisa desta tela que o jogador não vai ver de novo: merece um aviso próprio.
  if (r && r.xp && r.xp.leveledUp) toast(`${LABELS.levelUp} ${LABELS.levelWord} ${r.xp.level}`, 3200);
  if (api.online === false && app.get().lastMatch) {
    const m = app.get().lastMatch, u = app.get().session.user;
    const p = api.localMatchEnd({ endedAt: new Date(m.at).toISOString(), score: m.score, maxMass: m.maxMass, kills: m.kills, durationS: m.durationS, cause: m.byHole ? "blackhole" : "eaten", by: m.by, coinsEarned: r ? r.coinsEarned : 0, roomCode: m.room }, r ? { ...r, coins: u ? u.coins : 0 } : null);
    if (p) app.update(s => ({ ...s, session: { ...s.session, stats: normalizeStats(p.stats) } }));
  }
}
/** Callback do jogo: {state:'connecting'|'connected'|'reconnecting'|'closed'|'error', room?, attempt?, code?, message?} */
export function onConnection(ev) {
  const st = ev && ev.state;
  if (st === "connected") app.update(s => ({ ...s, conn: "connected", room: ev.room || s.room, overlays: { ...s.overlays, reconn: false }, reconnAttempt: 0 }));
  else if (st === "connecting") app.update(s => ({ ...s, conn: "connecting", room: ev.room || s.room }));
  else if (st === "reconnecting") app.update(s => ({ ...s, conn: "reconnecting", reconnAttempt: ev.attempt || 1, overlays: { ...s.overlays, reconn: true } }));
  else if (st === "closed" || st === "error") {
    const s = app.get();
    app.update({ conn: "closed", overlays: { ...s.overlays, reconn: false } });
    if (s.screen === "game") { toast(ev.message || (ev.code === "FULL" ? LABELS.roomFull : LABELS.connLost), 3000); leaveGame("lobby"); }
    else if (ev.message) toast(ev.message, 3000);
  }
}

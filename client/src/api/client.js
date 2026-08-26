// ── CLIENTE HTTP (/api/*) ─────────────────────────────────────────────────────
// Bearer token em localStorage.planet_token. Sem servidor (fetch falha ou o proxy do Vite
// devolve 503 {error:"unreachable"}) o cliente cai em MODO OFFLINE: perfil de convidado local
// em localStorage.planet_local_profile, e as chamadas que mudam estado operam nele.
import { SKINS, skinById, isPurchasable } from "@planet/shared";

const TOKEN_KEY = "planet_token", LOCAL_KEY = "planet_local_profile";

export class ApiError extends Error {
  constructor(status, code, message, data) { super(message || code); this.status = status; this.code = code; this.data = data || {}; this.suggestion = this.data.suggestion; }
}
export class NetworkError extends Error {}
export const isUnreachable = e => e instanceof NetworkError || (e instanceof ApiError && (e.code === "unreachable" || e.status === 502 || e.status === 503 || e.status === 504));

const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* privado */ } } };
export const getToken = () => ls.get(TOKEN_KEY);
const setToken = t => ls.set(TOKEN_KEY, t);

async function request(method, path, body, { auth = true } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const tok = getToken(); if (auth && tok) headers.Authorization = "Bearer " + tok;
  let res;
  try { res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" }); }
  catch (e) { throw new NetworkError(e.message || "rede"); }
  if (res.status === 204) return null;
  const text = await res.text(); let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON */ }
  if (!res.ok) {
    if (data && data.error) throw new ApiError(res.status, data.error, data.message || data.error, data);
    throw new ApiError(res.status, res.status >= 500 ? "unreachable" : "http_" + res.status, res.status >= 500 ? "Servidor indisponível" : "Erro " + res.status);
  }
  return data;
}

// ── perfil local (offline) ───────────────────────────────────────────────────
const rand4 = () => String(1000 + Math.floor(Math.random() * 9000));
function freshProfile() {
  return { user: { id: "local", nick: "Viajante-" + rand4(), kind: "guest", coins: 0, equippedSkin: 0, createdAt: new Date().toISOString() },
    skins: [0], prefs: {}, stats: { games: 0, kills: 0, botKills: 0, splits: 0, ejects: 0, bestScore: 0, bestMass: 0, playTime: 0, bestStreak: 0 }, achievements: [], matches: [] };
}
function localProfile() {
  const raw = ls.get(LOCAL_KEY);
  if (raw) { try { const p = JSON.parse(raw); if (p && p.user) return { ...freshProfile(), ...p }; } catch { /* corrompido */ } }
  const p = freshProfile(); saveLocal(p); return p;
}
function saveLocal(p) { ls.set(LOCAL_KEY, JSON.stringify(p)); return p; }
const offline = (code, message) => new ApiError(0, code, message);
const NO_SERVER = () => offline("offline", "Servidor indisponível — isso precisa de conexão com o servidor.");

export const api = {
  /** null até o bootstrap; depois true (servidor respondeu) ou false (modo offline). */
  online: null,   // serviço de contas (banco) disponível?
  server: null,   // servidor de jogo alcançável (/api/config)?
  get token() { return getToken(); },
  get: p => request("GET", p),
  post: (p, b) => request("POST", p, b === undefined ? {} : b),
  patch: (p, b) => request("PATCH", p, b),

  /** GET /api/me (401 → POST /api/auth/guest → guarda token → me). Sem servidor → perfil local. */
  async bootstrap() {
    try {
      let me = null;
      if (getToken()) {
        try { await request("GET", "/api/config", undefined, { auth: false }); api.server = true; } catch (e) { api.server = false; }
      try { me = await request("GET", "/api/me"); }
        catch (e) { if (e instanceof ApiError && e.status === 401) setToken(null); else throw e; }
      }
      if (!me) { const g = await request("POST", "/api/auth/guest", {}, { auth: false }); setToken(g.token); me = await request("GET", "/api/me"); }
      api.online = true; return me;
    } catch (e) {
      // servidor sem banco (rotas de conta ausentes) ou fora do ar → perfil local
      if (isUnreachable(e) || (e instanceof ApiError && e.status === 404)) { api.online = false; return localProfile(); }
      throw e;
    }
  },
  async guest(nick) {
    if (!api.online) { const p = localProfile(); if (nick) p.user.nick = nick; saveLocal(p); return { token: null, user: p.user }; }
    const r = await request("POST", "/api/auth/guest", nick ? { nick } : {}, { auth: false }); setToken(r.token); return r;
  },
  async claim({ password, email }) {
    if (!api.online) throw NO_SERVER();
    const body = { password }; if (email) body.email = email;
    return request("POST", "/api/auth/claim", body);
  },
  async login({ login, password }) {
    if (!api.online) throw NO_SERVER();
    const r = await request("POST", "/api/auth/login", { login, password }, { auth: false }); setToken(r.token); return r;
  },
  async logout() {
    if (api.online) { try { await request("POST", "/api/auth/logout"); } catch { /* token já inválido */ } }
    setToken(null);
  },
  async setNick(nick) {
    if (!api.online) { const p = localProfile(); p.user.nick = nick; saveLocal(p); return { user: p.user }; }
    return request("PATCH", "/api/me", { nick });
  },
  async setPrefs(prefs) {
    if (!api.online) { const p = localProfile(); p.prefs = { ...p.prefs, ...prefs }; saveLocal(p); return { prefs: p.prefs }; }
    return request("PATCH", "/api/me/prefs", prefs);
  },
  async history(limit = 20, before) {
    if (!api.online) return { matches: localProfile().matches || [] };
    return request("GET", `/api/me/history?limit=${limit}${before ? "&before=" + encodeURIComponent(before) : ""}`);
  },
  async skins() {
    if (!api.online) { const p = localProfile(); return { skins: SKINS, owned: p.skins, equipped: p.user.equippedSkin }; }
    return request("GET", "/api/skins");
  },
  async buy(id) {
    if (!api.online) {
      const p = localProfile(), s = skinById(id);
      if (p.skins.includes(id)) throw offline("already_owned", "Você já tem essa skin.");
      if (!isPurchasable(s)) throw offline("not_purchasable", "Essa skin não está à venda.");
      if (p.user.coins < s.price) throw offline("insufficient_coins", "Moedas insuficientes.");
      p.user.coins -= s.price; p.skins.push(id); saveLocal(p); return { coins: p.user.coins, owned: p.skins };
    }
    return request("POST", `/api/skins/${id}/buy`);
  },
  async equip(id) {
    if (!api.online) { const p = localProfile(); if (!p.skins.includes(id)) throw offline("not_owned", "Você não tem essa skin."); p.user.equippedSkin = id; saveLocal(p); return { equippedSkin: id }; }
    return request("POST", `/api/skins/${id}/equip`);
  },
  async ranking(period = "all", by = "score", limit = 50) {
    if (!api.online) return { period, by, rows: [], me: null };
    return request("GET", `/api/ranking?period=${period}&by=${by}&limit=${limit}`);
  },
  async rooms() { if (!api.online) return { rooms: [] }; return request("GET", "/api/rooms"); },
  async auto() { if (!api.online) return null; return request("GET", "/api/auto"); },
  async config() { if (!api.online) return { shards: 1, shard: 0, roomMax: 30, protocol: 1 }; return request("GET", "/api/config"); },

  /** Só no modo offline: acumula uma partida no perfil local (o stub do jogo chama via actions). */
  localMatchEnd(match, rewards) {
    if (api.online) return;
    const p = localProfile();
    p.matches = [{ id: Date.now(), ...match }, ...(p.matches || [])].slice(0, 20);
    p.stats.games = (p.stats.games || 0) + 1; p.stats.kills = (p.stats.kills || 0) + (match.kills || 0);
    p.stats.bestScore = Math.max(p.stats.bestScore || 0, match.score || 0); p.stats.bestMass = Math.max(p.stats.bestMass || 0, match.maxMass || 0);
    p.stats.playTime = (p.stats.playTime || 0) + (match.durationS || 0);
    if (rewards) { p.user.coins = rewards.coins; (rewards.achievements || []).forEach(a => { if (!p.achievements.includes(a.key)) p.achievements.push(a.key); }); (rewards.skinsUnlocked || []).forEach(id => { if (!p.skins.includes(id)) p.skins.push(id); }); }
    saveLocal(p); return p;
  },
};

// ── CLIENTE HTTP (/api/*) ─────────────────────────────────────────────────────
// Bearer token em localStorage.warspace_token. Sem servidor (fetch falha ou o proxy do Vite
// devolve 503 {error:"unreachable"}) o cliente cai em MODO OFFLINE: perfil de convidado local
// em localStorage.warspace_local_profile, e as chamadas que mudam estado operam nele.
import { SKINS, skinById, isPurchasable } from "@warspace/shared";
import { apiUrl } from "./base.js";

const TOKEN_KEY = "warspace_token", LOCAL_KEY = "warspace_local_profile";
const KEYS_V1 = { warspace_token: "planet_token", warspace_local_profile: "planet_local_profile" };

export class ApiError extends Error {
  constructor(status, code, message, data) { super(message || code); this.status = status; this.code = code; this.data = data || {}; this.suggestion = this.data.suggestion; }
}
export class NetworkError extends Error {}
export const isUnreachable = e => e instanceof NetworkError || (e instanceof ApiError && (e.code === "unreachable" || e.status === 502 || e.status === 503 || e.status === 504));
// O recurso ACABOU de verdade? Só um 404 diz isso. Rede caída, 5xx e o 503 de um shard irmão mudo são
// passageiros — tratá-los como fim é o que desfazia a equipe do jogador a cada piscada (ver refreshParty).
export const isGone = e => e instanceof ApiError && e.status === 404;

const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* privado */ } } };
// planet.io → warspace.io: as chaves mudaram de nome. Sem esta passagem, todo jogador com sessão aberta
// seria deslogado e perderia o perfil offline no dia do rename — o token vive só aqui, não há como recuperá-lo.
// Roda uma vez por carga, antes de qualquer leitura: se a chave nova ainda não existe e a velha existe, muda de nome.
(() => { for (const [novo, velho] of Object.entries(KEYS_V1)) { const v = ls.get(velho); if (v != null && ls.get(novo) == null) ls.set(novo, v); if (v != null) ls.set(velho, null); } })();
export const getToken = () => ls.get(TOKEN_KEY);
const setToken = t => ls.set(TOKEN_KEY, t);

async function request(method, path, body, { auth = true, raw = false, contentType = null } = {}) {
  const headers = { Accept: "application/json" };
  // `raw`: o corpo vai como está (um Blob de imagem). Serializar em base64 dentro de JSON custaria 33% a
  // mais e estouraria o teto de corpo do router — a rota do avatar tem limite próprio justamente por isso.
  if (body !== undefined) headers["Content-Type"] = raw ? (contentType || "application/octet-stream") : "application/json";
  const tok = getToken(); if (auth && tok) headers.Authorization = "Bearer " + tok;
  let res;
  // `apiUrl` é a costura ÚNICA: os ~30 literais "/api/…" abaixo continuam literais, e no pacote de
  // portal ganham a origem absoluta de uma vez só (client/src/api/base.js).
  try { res = await fetch(apiUrl(path), { method, headers, body: body === undefined ? undefined : (raw ? body : JSON.stringify(body)), cache: "no-store" }); }
  catch (e) { throw new NetworkError(e.message || "rede"); }
  if (res.status === 204) return null;
  const text = await res.text(); let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON */ }
  if (!res.ok) {
    if (data && data.error) throw new ApiError(res.status, data.error, data.message || data.error, data);
    // O código é o que o cliente traduz (i18n/errors.js); a mensagem daqui é só o paraquedas do paraquedas.
    // `http` leva o status no `data` para o molde "Erro {n}" — antes o código era "http_404", que nenhum
    // dicionário conseguiria cobrir sem uma entrada por status.
    throw new ApiError(res.status, res.status >= 500 ? "unreachable" : "http", res.status >= 500 ? "Servidor indisponível" : "Erro " + res.status, { status: res.status });
  }
  return data;
}

// ── perfil local (offline) ───────────────────────────────────────────────────
const rand4 = () => String(1000 + Math.floor(Math.random() * 9000));
function freshProfile() {
  return { user: { id: "local", nick: "Viajante-" + rand4(), kind: "guest", coins: 0, equippedSkin: 0, country: null, avatar: null, createdAt: new Date().toISOString() },
    skins: [0], prefs: {}, stats: { games: 0, kills: 0, botKills: 0, splits: 0, ejects: 0, bestScore: 0, bestMass: 0, playTime: 0, bestStreak: 0,
      foodEaten: 0, deaths: 0, kd: 0, xp: 0, level: 1 }, achievements: [], matches: [] };
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
  /**
   * Adota um Bearer que veio de FORA (hoje: o save na nuvem do Playgama, client/src/portal/pg.js).
   * Só troca o token — quem refaz a sessão é `applySession(await api.bootstrap())`, e um token inválido
   * cai sozinho no 401 de lá, que o limpa e cria um convidado novo.
   */
  adota(t) { setToken(t || null); },
  get: p => request("GET", p),
  post: (p, b) => request("POST", p, b === undefined ? {} : b),
  patch: (p, b) => request("PATCH", p, b),

  /** GET /api/me (401 → POST /api/auth/guest → guarda token → me). Sem servidor → perfil local. */
  async bootstrap() {
    try {
      // ⚠️ A sonda é INCONDICIONAL. Ela morava dentro do `if (getToken())`, então quem chegava SEM token
      // nunca a fazia: `api.server` ficava `null`, o `boot()` caía no ramo do `api.online===false` e o
      // aviso da tela era "servidor sem banco" — mentira, o servidor inteiro estava fora. Quem já tinha
      // token via a outra metade do defeito: caía em modo local sem que nada dissesse por quê. Custa
      // zero: `loadConfig()` pede a MESMA rota logo depois.
      try { await request("GET", "/api/config", undefined, { auth: false }); api.server = true; } catch { api.server = false; }
      let me = null;
      if (getToken()) {
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
  /**
   * Entra com a conta do PORTAL (CrazyGames). O SDK deles dá um JWT de 1 h e o servidor o verifica —
   * ver server/src/auth/crazygames.js. Mandamos o Bearer atual de propósito: se for um convidado, o
   * servidor PROMOVE aquela conta em vez de criar outra, e ninguém perde moedas nem skins ao entrar.
   */
  async crazyLogin(userToken) {
    const r = await request("POST", "/api/auth/crazygames", { userToken }, { auth: true });
    if (r && r.token) setToken(r.token);
    return r;
  },
  async guest(nick) {
    if (!api.online) { const p = localProfile(); if (nick) p.user.nick = nick; saveLocal(p); return { token: null, user: p.user }; }
    const r = await request("POST", "/api/auth/guest", nick ? { nick } : {}, { auth: false }); setToken(r.token); return r;
  },
  async claim({ login, password, email }) {
    if (!api.online) throw NO_SERVER();
    const body = { password }; if (login) body.login = login; if (email) body.email = email;
    return request("POST", "/api/auth/claim", body);
  },
  async login({ login, password }) {
    if (!api.online) throw NO_SERVER();
    const r = await request("POST", "/api/auth/login", { login, password }, { auth: false }); setToken(r.token); return r;
  },
  /** POST /api/auth/google {idToken}. Manda o Bearer atual DE PROPÓSITO: é o que promove o convidado
   *  em vez de abrir uma segunda conta, preservando moedas, skins e histórico de quem já jogou. */
  async google(idToken, nick) {
    if (!api.online) throw NO_SERVER();
    const body = { idToken }; if (nick) body.nick = nick;
    const r = await request("POST", "/api/auth/google", body); setToken(r.token); return r;
  },
  async logout() {
    if (api.online) { try { await request("POST", "/api/auth/logout"); } catch { /* token já inválido */ } }
    setToken(null);
  },
  async setNick(nick) {
    if (!api.online) { const p = localProfile(); p.user.nick = nick; saveLocal(p); return { user: p.user }; }
    return request("PATCH", "/api/me", { nick });
  },
  /**
   * O nick que a tela inicial põe no campo. Vem do servidor porque só ele tem a LLM e só ele sabe quais
   * nomes estão EM USO agora (a união dos `usedNicks` das salas do shard).
   * ⚠️ TRÊS respostas, não duas, e é o que faz o interruptor do /admin existir:
   *   • `"Quasar42"` → a sugestão;
   *   • `null` do SERVIDOR → o parâmetro está DESLIGADO, e o campo fica vazio (o comportamento de sempre);
   *   • `undefined` → a chamada falhou (offline, `?local=1`, servidor fora), e só aí vale a lista local.
   * Devolver `null` nos dois casos faria o desligado cair no chão local, ou seja o interruptor não
   * desligaria nada.
   */
  async nickSugerido() {
    if (!api.online) return undefined;
    try { const r = await request("GET", "/api/nick", undefined, { auth: false }); return r && r.nick ? r.nick : null; }
    catch { return undefined; }
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
  /** Marca o anúncio DAQUELA mascote como assistido (não concede posse — só destrava `buy`). Offline
   *  não tem autoridade pra registrar nada. */
  async watchAd(id) {
    if (!api.online) throw offline("offline", "Isso precisa de conta.");
    return request("POST", `/api/skins/${id}/watch-ad`);
  },
  /** O anúncio da TELA DE MORTE: DÁ a skin (pool própria, `AD_GIFT_SKINS`) e equipa. Regra diferente da
   *  do `watchAd` acima, que só destrava a compra das mascotes — as duas pools são disjuntas. */
  async adGift(id, equip = true) {
    if (!api.online) throw offline("offline", "Isso precisa de conta.");
    return request("POST", `/api/skins/${id}/ad-gift`, { equip });
  },
  async equip(id) {
    if (!api.online) { const p = localProfile(); if (!p.skins.includes(id)) throw offline("not_owned", "Você não tem essa skin."); p.user.equippedSkin = id; saveLocal(p); return { equippedSkin: id }; }
    return request("POST", `/api/skins/${id}/equip`);
  },
  async ranking(period = "all", by = "score", limit = 50, country = null) {
    if (!api.online) return { period, by, country, rows: [], me: null };
    return request("GET", `/api/ranking?period=${period}&by=${by}&limit=${limit}${country ? `&country=${country}` : ""}`);
  },
  /** País do ranking regional. `null` limpa — entrar no recorte é opcional, e sair também. */
  async setCountry(country) {
    if (!api.online) { const p = localProfile(); p.user.country = country || null; saveLocal(p); return { user: p.user }; }
    return request("PATCH", "/api/me", { country: country || null });
  },
  /**
   * Sobe a foto da skin "Retrato". Vai o Blob CRU, não base64 nem multipart: 12 KB em base64 estouram o
   * teto de JSON do router, e o servidor tem uma rota com limite próprio justamente para isto.
   */
  async uploadAvatar(blob) {
    if (!api.online) throw offline("offline", "Sem servidor: a foto precisa de conta.");
    return request("POST", "/api/me/avatar", blob, { raw: true, contentType: blob.type });
  },
  async removeAvatar() { if (!api.online) return {}; return request("DELETE", "/api/me/avatar"); },
  /** URL pública da foto de alguém. O hash entra na query: foto nova = URL nova, então o cache é eterno. */
  // ⚠️ passa por `apiUrl`: quem consome isto é um `fetch` (theme/avatars.js), não um `<img>` — logo é
  // sujeito a CORS, e o erro cai num `catch{}` mudo. Foto que some sem log é o pior defeito possível.
  avatarUrl(userId, v) { return apiUrl(`/api/avatar/${userId}${v ? `?v=${v}` : ""}`); },
  async rooms() { if (!api.online) return { rooms: [] }; return request("GET", "/api/rooms"); },
  async auto({ mode = 0, teamSize = 1 } = {}) { if (!api.online) return null; return request("GET", `/api/auto?mode=${mode | 0}&teamSize=${teamSize | 0}`); },
  // ── sala com dono (o jogador escolhe modo, duração e privacidade, e manda o código a quem quiser) ──
  // Criar não roteia entre shards: quem responde cria na própria memória, com um código do próprio shard, e
  // o 1º char do código leva o WS ao pod certo sozinho. Consultar ROTEIA (só o dono do código conhece a sala).
  async roomCreate({ mode, teamSize, minutes, private: priv }) { return request("POST", "/api/rooms", { mode, teamSize, minutes, private: !!priv }); },
  async roomGet(code) { return request("GET", `/api/room/${encodeURIComponent(code)}`); },
  // ── lobby de equipe (código de convite) ──
  // Mora no servidor de JOGO, não na API de persistência: é estado de sala (memória do shard, com TTL) e
  // funciona para convidado — quem identifica a pessoa é o hash do mesmo token `pt_…` do jogo.
  async partyCreate({ mode, teamSize, nick, skinId }) { return request("POST", "/api/party", { mode, teamSize, nick, skinId }); },
  async partyGet(code) { return request("GET", `/api/party/${encodeURIComponent(code)}`); },
  async partyJoin(code, { nick, skinId }) { return request("POST", `/api/party/${encodeURIComponent(code)}/join`, { nick, skinId }); },
  async partyLeave(code) { return request("POST", `/api/party/${encodeURIComponent(code)}/leave`, {}); },
  async partyStart(code, room) { return request("POST", `/api/party/${encodeURIComponent(code)}/start`, { room }); },
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

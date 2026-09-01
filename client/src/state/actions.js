// ── AÇÕES DO SHELL ────────────────────────────────────────────────────────────
// Tudo que muda o estado passa por aqui (telas, sessão, prefs, loja, conta, partida).
import { api, isUnreachable, isGone } from "../api/client.js";
import { app, normalizePrefs, normalizeStats, PREF_DEFAULTS, PREF_KEYS, SCREENS } from "./app.js";
import { applyTheme, resolveThemeId, startThemeClock } from "../app/theme.js";
import { getLabels, setLang, currentLangPref, preenche } from "../i18n/index.js";
import { errText } from "../i18n/errors.js";
import { skinById } from "@warspace/shared";
import { clockRef, gameRef, getGame } from "./game.js";
import { partidaIniciada } from "../app/analytics.js";
import { nickSorteado } from "../util/nick.js";
import { portal } from "../portal/index.js";
import { PORTAL } from "../portal/flags.js";
import { silenciaAnuncio } from "../audio/index.js";

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
  app.update(s => ({ ...s, prevScreen: s.screen === screen ? s.prevScreen : s.screen, screen,
    overlays: { account: false, pause: false, reconn: s.overlays.reconn && screen === "game" } }));
}
// O modal tem DUAS abas de novo (criar conta · entrar), então `overlays.account` volta a carregar QUAL
// delas abre — "claim" | "login", as duas truthy, que é o que `App.jsx` lê para montar o overlay.
export const openAccount = (tab) => app.update(s => ({ ...s, overlays: { ...s.overlays, account: tab === "claim" ? "claim" : "login" } }));
export const setPause = on => app.update(s => ({ ...s, overlays: { ...s.overlays, pause: !!on } }));
export const togglePause = () => { const s = app.get(); if (s.screen !== "game" && !s.overlays.pause) return; setPause(!s.overlays.pause); };
// ── O QUE ACONTECE ENQUANTO UM ANÚNCIO DE PORTAL RODA ──
// Cala o som (sem tocar em `prefs.muted` — ver `silenciaAnuncio` em audio/index.js) e, na volta, se o
// jogador estiver em partida, levanta o menu de pausa: os portais exigem que o retorno caia numa tela que
// só sai por ação dele, e o `Pause` já é exatamente isso — sai no clique do RETOMAR e larga o COMANDO sem
// derrubar a conexão. Registrado no módulo, uma vez, e não em componente: anúncio não espera montagem.
if (PORTAL) {
  // convite aceito no portal: cai direto na sala do amigo, pelo mesmo `play()` do link `?sala=`
  portal.aoEntrarNaSala(code => { if (code) entrarPorConvite(code); });
  // trocou de conta no site deles enquanto jogava: refaz a identidade
  portal.aoTrocarConta(() => { entraPeloPortal(); });
  portal.aoPausar(() => silenciaAnuncio(true));
  portal.aoRetomar(() => { silenciaAnuncio(false);
    const s = app.get(); if (s.screen === "game" && !s.overlays.pause) setPause(true); });
}
export const closeAccount = () => app.update(s => ({ ...s, overlays: { ...s.overlays, account: false } }));
export const setReconn = (on, attempt) => app.update(s => ({ ...s, overlays: { ...s.overlays, reconn: !!on }, reconnAttempt: on ? (attempt || s.reconnAttempt || 1) : 0 }));
/**
 * Esc: fecha modal → tira foco do input → abre/fecha a PAUSA (no jogo) → volta à entrada (fora dele).
 * ⚠️ A cadeia é resolvida AQUI, num lugar só. Há outros listeners de Escape na árvore (Chat, Shop, Dead), e
 * todos são `keydown` na JANELA: a ordem entre eles é a de REGISTRO, e como esses componentes montam DEPOIS
 * do App o de cá roda PRIMEIRO — apostar em aninhamento aqui é apostar errado. Quem cede a vez é
 * `e.defaultPrevented`, checado no listener de App.jsx: quem consumiu o Esc marca o evento. Com o campo do
 * chat em foco quem marca é o `onKeyDown` do <input>, handler React ancorado no #app — abaixo da janela na
 * bolha, portanto sempre antes daqui. Sem isso o Esc do chat abria a pausa: o campo já tinha perdido o foco
 * e a guarda de INPUT abaixo não via mais nada.
 */
export function escape() {
  const s = app.get();
  if (s.overlays.account) { closeAccount(); return true; }
  const a = document.activeElement;
  if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) { a.blur(); return true; }
  if (s.overlays.pause) { setPause(false); return true; }
  if (s.screen === "game") { setPause(true); return true; }
  if (s.screen === "party") { leaveParty(); return true; }   // sair sem avisar deixa o lobby órfão até o TTL, com os amigos olhando uma equipe que não existe
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

let themeClock = null, lastThemePref = null, lastLangPref = null;
const themePref = () => app.get().session.prefs.theme || "auto";
/** Efeitos imediatos das prefs: idioma, tema (aplica já; o relógio reavalia 'auto' a cada minuto/foco), body[data-reduce|bigtext|colorblind]. */
export function applyPrefsSideEffects(prefs) {
  const b = document.body.dataset;
  b.reduce = prefs.reduceMotion ? "1" : "0"; b.bigtext = prefs.bigText ? "1" : "0"; b.colorblind = prefs.colorblind || "off";
  if (prefs.theme !== lastThemePref) { lastThemePref = prefs.theme; applyTheme(resolveThemeId(prefs.theme || "auto"), { fade: true }); }   // trocar o tema na mão também passa pelo fade
  // O idioma vem do mesmo lugar que o tema, mas SEM relógio: `navigator.language` não muda no meio da
  // sessão. `setLang` é assíncrono (o dicionário é um chunk à parte) e avisa a tela sozinho pelo evento,
  // então ninguém aqui precisa esperar por ele — a única coisa que não pode é chamá-lo a cada render.
  if (prefs.lang !== lastLangPref) { lastLangPref = prefs.lang; setLang(prefs.lang || "auto"); }
  if (!themeClock) themeClock = startThemeClock(themePref, null, { getHour: () => clockRef.get().hour });   // dentro da partida o céu segue o relógio da rodada
}

/**
 * CONTA DO PORTAL. A CrazyGames exige que quem já está logado no site DELES seja reconhecido aqui sem
 * ter que fazer nada — e que quem não está possa jogar como convidado do mesmo jeito. O JWT deles vale
 * 1 h e não é guardado: quem o troca pelo nosso token é o servidor (`/api/auth/crazygames`).
 * ⚠️ Mandamos o Bearer atual junto: se for um convidado, o servidor PROMOVE aquela conta em vez de criar
 * outra — senão quem jogou antes de logar perderia moedas e skins no primeiro login.
 * ⚠️ Falhar aqui não pode derrubar o boot: sem isso o jogador fica como convidado, que é um estado
 * legítimo e previsto por eles.
 */
async function entraPeloPortal() {
  if (!PORTAL) return;
  try {
    const t = await portal.identidade(); if (!t) return;
    const r = await api.crazyLogin(t);
    if (r && r.user) applySession(await api.bootstrap());
  } catch (e) { console.warn("[portal] login:", e && e.message); }
}
/** Botão de login do portal (só sai de um clique do jogador — é o que o SDK deles exige). */
export async function loginDoPortal() {
  try { const t = await portal.pedirLogin(); if (!t) return;
    await api.crazyLogin(t); applySession(await api.bootstrap()); toast(getLabels().welcome || "", 1800); }
  catch (e) { toast(errText(e), 3000); }
}
/** Botão "tentar de novo" da tela de servidor fora: refaz o boot inteiro. */
export async function tentarDeNovo() { app.update({ servidorFora: false, booted: false }); await boot(); }

export async function boot() {
  try { applySession(await api.bootstrap()); }
  // ⚠️ O idioma sobrevive ao boot que falhou. Este ramo reaplica os PADRÕES, e `lang` é a única pref que
  // também mora fora do perfil (o atalho de localStorage que o `bootLang` lê antes do 1º render): sem
  // preservá-la aqui, um servidor fora do ar fazia o jogador que escolheu inglês ver o padrão "auto"
  // gravado por cima da escolha dele — e o idioma voltava para o do navegador no F5 seguinte.
  catch (e) { app.update({ bootError: e.message || String(e) }); applyPrefsSideEffects({ ...PREF_DEFAULTS, lang: currentLangPref() }); }
  app.update({ booted: true });
  await entraPeloPortal();
  // ⚠️ No pacote de portal, servidor fora NÃO pode virar um toast de 3 s e uma partida contra bots: ali
  // não existe "modo local" que faça sentido (o jogador clicou num .io para jogar com gente), e o
  // silêncio faz o jogo PARECER que funcionou. Vira uma tela que fica.
  if (PORTAL && api.server === false) app.update({ servidorFora: true });
  else if (api.server === false) toast(getLabels().offlineNote, 3200);
  else if (api.online === false) toast(getLabels().noDbNote, 3200);
  loadConfig(); loadTop5(); loadRooms();
  const conv = Q.get("party");
  if (conv) { history.replaceState(null, "", location.pathname); joinParty(conv); return; }   // link de convite: cai direto no lobby da equipe do amigo
  // Convite para a SALA de alguém. ⚠️ Consulta o modo ANTES de entrar: sem isso o convidado entraria com o
  // modo do estado dele, e o servidor recusaria com `MODE` — um link que não funciona sem dizer por quê.
  const sala = Q.get("sala");
  if (sala) { history.replaceState(null, "", location.pathname); entrarPorConvite(sala); return; }
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
    // os três FORMATOS de powerup, que é o que a matriz precisa medir: tempo (anel + segundos), nível
    // (o escudo) e CARGA (a auto-defesa, que não tem relógio nenhum e fica até ser usada)
    powerups: { magnet: 12, shield: 3, feast: 2, autodef: 1 }, lb, feed, room: "253A", ping: 49, fps: 60,
    clock: { h: 16, m: 16, leftS: 2276 }, alive: 24 }));
}
function mostrarTela(s) {
  if (s === "account") { go("entry"); openAccount(); }
  else if (s === "game") play({});
  else if (s === "reconn") { play({}); setTimeout(() => setReconn(true, 2), 400); }
  else if (s === "dead" || s === "round") {
    if (!import.meta.env.DEV) return;
    app.update({ room: "1ABC", played: true, conn: "connected", lastMatch: { by: "Nebulox", byHole: false, score: 6900, maxMass: 4820, kills: 3, durationS: 372, room: "1ABC", at: Date.now() }, rewards: null, rewardsPending: true, screen: "dead" });
    if (s === "round") { const linhas = [{ slot: 1, name: "Vortexia", mass: 12400, score: 9100, food: 610, kills: 4, kd: 2, isBot: true, skinId: 30 },
      { slot: 3, name: "Você", mass: 8200, score: 11800, food: 840, kills: 3, kd: 1.5, skinId: 18 }, { slot: 5, name: "Drakonis", mass: 3100, score: 4200, food: 300, kills: 6, kd: 3, isBot: true, skinId: 34 },
      { slot: 7, name: "Cosmara", mass: 2400, score: 3100, food: 210, kills: 1, kd: .5, isBot: true, skinId: 13 }, { slot: 9, name: "Stellara", mass: 1800, score: 2400, food: 160, kills: 0, kd: 0, isBot: true, skinId: 26 },
      { slot: 11, name: "Graviton", mass: 900, score: 1200, food: 90, kills: 0, kd: 0, isBot: true, skinId: 20 }];
      // com `destaques` a sonda de responsividade passa a medir também a FAIXA do campeão e a fileira de
      // quatro cartões — sem eles o `.awards` simplesmente não existe no DOM e as 432 combinações passavam
      // por cima da metade da tela.
      app.update({ room: "1ABC", roundResult: { code: "1ABC", mySlot: 3, at: Date.now(), nextInMs: 15000, total: linhas.length,
        champion: linhas[0], board: linhas,
        destaques: { campeao: linhas[0], pontuador: linhas[1], glutao: linhas[1], carrasco: linhas[2], letal: linhas[2] } }, rewards: null, rewardsPending: true, screen: "round" }); }
    // A sonda de responsividade mede o HUD DE ESPECTADOR que agora existe atrás destas telas (chat + o
    // bloco de "assistindo"). Sem semear o hudStore o painel tem altura zero, o `vis()` o descarta, e as
    // ~400 combinações passariam sem ver a única coisa nova na tela.
    const g = gameRef.get().game;
    if (g && g.hudStore) { const t = Date.now();
      g.hudStore.update(h => ({ ...h, dead: true, map: false, room: "1ABC", spec: { slot: 1, name: "Nebulox", vivos: 12 },
        chat: [{ slot: 2, name: "Stellara", text: "quem pegou o buraco negro?", at: t, mine: false },
          { slot: 3, name: "xXcapitaoXx", text: "fui eu, desculpa aí", at: t, mine: false, dead: true },
          { slot: -1, name: null, text: "🎤 Meteora", at: t, mine: false }] })); }
    setTimeout(() => onRewards({ saved: true, coinsEarned: 54, coins: (app.get().session.user || {}).coins + 54 || 54, achievements: [], skinsUnlocked: [], rank: { day: 35 } }), 1200);
  }
  else go(s);
}

// ── dados de apoio ───────────────────────────────────────────────────────────
export async function loadConfig() { try { app.update({ config: await api.config() }); } catch { /* opcional */ } }
export async function loadTop5() {
  try { const r = await api.ranking("day", "score", 5);
    app.update(s => ({ ...s, top5: r.rows || [], top5At: Date.now(), session: { ...s.session, dayRank: r.me ? r.me.rank : null } })); }
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
  if (!NICK_RE.test(nick)) { toast(getLabels().nickShort); return { ok: false }; }
  try { const r = await api.setNick(nick); patchUser(r && r.user ? r.user : { nick }); app.update({ nomeado: true }); toast(getLabels().nickSaved); return { ok: true }; }
  catch (e) { toast(errText(e, "nick") + (e.suggestion ? ` · ${e.suggestion}` : ""), 3000); return { ok: false, suggestion: e.suggestion, error: e }; }
}
/**
 * Reivindicar a conta. O que se escolhe aqui é o USUÁRIO (o nome de entrar), não o nick: ele congela no
 * cadastro e é o único nome único do jogo. O nick continua sendo editado na tela inicial — e é livre.
 */
export async function claim({ login, password, email }) {
  const r = await api.claim({ login, password, email });
  if (r && r.user) patchUser(r.user); else patchUser({ kind: "registered" });
  closeAccount(); toast(getLabels().claimed); return r;
}
export async function login({ login: l, password }) {
  await api.login({ login: l, password });
  applySession(await api.bootstrap());
  closeAccount(); toast(getLabels().loggedIn); loadTop5();
}
/** Entrar com Google. `credential` é o id_token que o GSI devolve; o desfecho é o mesmo do `login`. */
export async function loginGoogle(credential) {
  await api.google(credential);
  applySession(await api.bootstrap());
  closeAccount(); toast(getLabels().loggedIn); loadTop5();
}
/**
 * País do ranking regional. Otimista (a lista responde na hora) e reverte no erro, como as ações da loja.
 * `null` limpa: entrar no recorte é opcional, e sair também tem que ser.
 */
export async function setCountry(country) {
  const antes = app.get().session.user;
  app.update(s => ({ ...s, session: { ...s.session, user: { ...s.session.user, country: country || null } } }));
  try { const r = await api.setCountry(country); app.update(s => ({ ...s, session: { ...s.session, user: { ...s.session.user, ...(r.user || {}) } } })); }
  catch (e) { app.update(s => ({ ...s, session: { ...s.session, user: antes } })); toast(errText(e)); }
}
export async function logout() {
  await api.logout(); applySession(await api.bootstrap()); toast(getLabels().loggedOut); go("entry");
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
/**
 * MUDO, o interruptor de urgência. Passa pelo `setPref` como qualquer outra preferência — então persiste,
 * respeita a whitelist do servidor e reaproveita o `applyPrefsSideEffects`, que é quem avisa o motor de
 * áudio. Devolve o estado novo para quem quiser avisar o jogador.
 */
export function toggleMute() {
  const m = !app.get().session.prefs.muted;
  setPref("muted", m);
  return m;
}
export async function flushPrefs() {
  clearTimeout(prefsT); const d = prefsDirty; prefsDirty = {};
  if (!Object.keys(d).length) return true;
  try { await api.setPrefs(d); return true; } catch (e) { toast(errText(e), 2500); return false; }
}
export async function savePrefs() {
  const p = app.get().session.prefs; PREF_KEYS.forEach(k => { prefsDirty[k] = p[k]; });
  // salvou = acabou: volta para quem abriu as Opções. Só no SUCESSO — se o PATCH falhou, sair da tela
  // esconderia o erro e o jogador não teria como tentar de novo.
  if (!await flushPrefs()) return;
  toast(getLabels().saved);
  const s = app.get(), volta = s.prevScreen && s.prevScreen !== "prefs" ? s.prevScreen : "entry";
  go(volta);
}
export const closeLevelUp = () => app.update({ levelUp: null });
export function resetPrefs() {
  app.update(s => ({ ...s, session: { ...s.session, prefs: { ...PREF_DEFAULTS } } }));
  applyPrefsSideEffects(PREF_DEFAULTS); PREF_KEYS.forEach(k => { prefsDirty[k] = PREF_DEFAULTS[k]; }); schedule();
}

// ── loja (UI otimista) ───────────────────────────────────────────────────────
export async function equipSkin(id) {
  const before = app.get().session.user; if (!before) return;
  if (!app.get().session.skins.includes(id)) { toast(getLabels().lockedToast); return; }
  patchUser({ equippedSkin: id });
  try { const r = await api.equip(id); if (r && r.equippedSkin != null) patchUser({ equippedSkin: r.equippedSkin }); toast(getLabels().equippedToast); }
  catch (e) { patchUser({ equippedSkin: before.equippedSkin }); toast(errText(e), 2500); }
}
export async function buySkin(id) {
  const s = app.get().session, sk = skinById(id); if (!s.user) return;
  if (s.skins.includes(id)) return equipSkin(id);
  if (sk.rarity === "secret") { toast(getLabels().secretToast); return; }
  if (sk.unlockKey || sk.price <= 0) { toast(getLabels().lockedToast + ": " + sk.desc); return; }
  if (s.user.coins < sk.price) { toast(getLabels().poorToast); return; }
  const snapshot = { coins: s.user.coins, skins: s.skins, equipped: s.user.equippedSkin };
  app.update(st => ({ ...st, session: { ...st.session, skins: [...st.session.skins, id], user: { ...st.session.user, coins: st.session.user.coins - sk.price, equippedSkin: id } } }));
  try {
    const r = await api.buy(id);
    app.update(st => ({ ...st, session: { ...st.session, skins: r && r.owned ? r.owned : st.session.skins, user: { ...st.session.user, coins: r && typeof r.coins === "number" ? r.coins : st.session.user.coins } } }));
    toast(getLabels().bought);
    try { await api.equip(id); } catch { patchUser({ equippedSkin: snapshot.equipped }); }
  } catch (e) {
    app.update(st => ({ ...st, session: { ...st.session, skins: snapshot.skins, user: { ...st.session.user, coins: snapshot.coins, equippedSkin: snapshot.equipped } } }));
    toast(errText(e), 2500);
  }
}

// ── partida ──────────────────────────────────────────────────────────────────
/** Devolve o cursor ao campo da tela inicial. Os 60 ms esperam o React montar a Entrada. */
export const focaNome = () => setTimeout(() => { const el = document.getElementById("nameIn"); if (el) { el.focus(); el.select(); } }, 60);
/**
 * ⚠️ NINGUÉM ENTRA SEM NOMEAR O PLANETA. O campo da tela inicial nasce VAZIO de propósito — o
 * `Viajante-NNNN` é placa sorteada pelo servidor (`randomGuestNick`), não escolha de ninguém —, e sem
 * esta guarda o jogador entrava com a placa: o pedido do placeholder era enfeite.
 * A validação mora no `play()`, e não no botão JOGAR, porque `play()` é a porta ÚNICA — Modos, Salas
 * (auto, código e lista), o respawn da tela de morte e a entrada automática depois do BIG CRUNCH passam
 * todos por aqui. Validar no botão cobriria um caminho de seis.
 * ⚠️ `leaveGame` e não `go` quando já se está em partida: o respawn é chamado com a conexão VIVA, e
 * trocar de tela sem derrubá-la deixaria um socket de jogo pendurado atrás do menu.
 */
export function semNome(pedido = null) {
  // ⚠️ NO PACOTE DE PORTAL A GUARDA NÃO VALE, e não é descuido: eles exigem, por escrito, que o jogador
  // novo caia direto no jogo ("new users should land in gameplay immediately", no máximo 1 clique). Aqui
  // o primeiro clique em JOGAR não fazia NADA além de um toast pedindo um nome — o revisor da CrazyGames
  // travava na tela inicial. A placa sorteada vira o nome de estreia (é o que todo .io faz) e o campo
  // continua ali, na mesma tela, para quem quiser trocar antes ou depois de jogar.
  if (PORTAL) return false;
  const st = app.get(), u = st.session.user || {};
  if (st.nomeado || !nickSorteado(u.nick)) return false;
  app.update({ pendingPlay: pedido });
  toast(getLabels().nickAsk, 3500);
  if (st.screen === "game") leaveGame("entry"); else go("entry");
  focaNome(); return true;
}
/** Entra numa sala: `room` explícito, senão GET /api/auto (offline → sala local do stub). */
export async function play({ room, mode, teamSize, party } = {}) {
  if (semNome({ room, mode, teamSize, party })) return;
  // ── ANÚNCIO DE PORTAL ──
  // Ponto ÚNICO, e de propósito: `play()` é a porta por onde passam Modos, Salas (auto, código e lista),
  // o convite, a largada de equipe, o respawn da tela de morte e a entrada automática depois do BIG
  // CRUNCH. O tipo sai de `played`, que já existe e já significa "já entrou em partida nesta carga":
  // a primeira é preroll, as seguintes são midroll (a fachada guarda o intervalo mínimo).
  // ⚠️ É aqui e não no instante da MORTE: atrás da tela de morte a rodada continua correndo e o jogador
  //    está assistindo de propósito (troca de câmera, mapa, sala ao vivo) — cobrir isso com anúncio é o
  //    que a regra dos portais proíbe. No respawn não há partida rodando, então "pausado e mudo" é
  //    verdade por construção. E nada disso pode PENDURAR o botão: a fachada sempre resolve.
  if (PORTAL) await portal.anuncio(app.get().played ? "midroll" : "preroll");
  const st = app.get();
  const md = mode != null ? mode | 0 : st.gameMode | 0, ts = teamSize != null ? teamSize | 0 : st.teamSize || 1;
  const pt = party !== undefined ? party : (st.party ? st.party.code : null);
  let code = room ? String(room).toUpperCase() : null;
  if (!code) { try { const a = await api.auto({ mode: md, teamSize: ts }); if (a && a.code) code = a.code; } catch (e) { if (!isUnreachable(e)) toast(errText(e), 2500); } }
  app.update(s => ({ ...s, screen: "game", played: true, rewards: null, rewardsPending: false, overlays: { account: false, reconn: false, pause: false }, conn: "connecting",
    gameMode: md, teamSize: ts,
    pendingPlay: null,
    pendingJoin: { room: code, mode: md, teamSize: ts, party: pt, n: (s.pendingJoin ? s.pendingJoin.n : 0) + 1 } }));
  partidaIniciada({ mode: md, teamSize: ts, party: pt });
  if (PORTAL) portal.jogoComecou();
}
// ── modos e lobby de equipe ────────────────────────────────────────────────
export function setMode(mode, teamSize = 1) { app.update({ gameMode: mode | 0, teamSize: teamSize | 0 || 1 }); }
const meNick = () => (app.get().session.user || {}).nick || "Viajante";
const meSkin = () => (app.get().session.user || {}).equippedSkin | 0;
/**
 * Abre uma sala DA PESSOA: ela escolhe o modo, a duração (0 = sem fim, só no Livre) e se é privada, e entra
 * como dona — podendo expulsar e banir. Só conta registrada: quem tem esse poder precisa de uma identidade
 * que dure mais que uma aba, e o servidor recusa com `need_account`.
 */
/** Link de convite (`?sala=ABCD`): descobre o modo da sala e entra nela. */
export async function entrarPorConvite(code) {
  const c = String(code || "").trim().toUpperCase();
  if (c.length !== 4) return;
  try { const r = await api.roomGet(c); const m = r.room.mode | 0, ts = r.room.teamSize || 1;
    app.update({ gameMode: m, teamSize: ts });
    play({ room: c, mode: m, teamSize: ts, party: null }); }
  catch (e) { toast(errText(e, "room"), 3000); go("lobby"); }
}
export async function criarSala({ mode = 0, teamSize = 1, minutes = 30, private: priv = false } = {}) {
  try { const r = await api.roomCreate({ mode, teamSize, minutes, private: priv });
    app.update({ gameMode: mode, teamSize });
    play({ room: r.room.code, mode, teamSize, party: null }); return r.room; }
  catch (e) { toast(errText(e, "room"), 3000); return null; }
}
/** Dono da sala: expulsar (`kick`) ou banir da sala (`ban`). Quem autoriza é o servidor. */
export const hostAct = (act, pid) => { const g = getGame(); if (g) g.hostAct(act, pid); };
export async function createParty(teamSize) {
  try { const r = await api.partyCreate({ mode: 1, teamSize, nick: meNick(), skinId: meSkin() });
    app.update({ party: r.party, partyMe: r.you || null, partyError: null, gameMode: 1, teamSize: r.party.teamSize, screen: "party" }); return r.party; }
  catch (e) { toast(errText(e, "party"), 2800); return null; }
}
export async function joinParty(code) {
  const c = String(code || "").trim().toUpperCase();
  if (c.length !== 4) { toast(getLabels().partyCode + ": " + preenche(getLabels().fmt.chars, { n: 4 })); return null; }
  try { const r = await api.partyJoin(c, { nick: meNick(), skinId: meSkin() });
    app.update({ party: r.party, partyMe: r.you || null, partyError: null, gameMode: 1, teamSize: r.party.teamSize, screen: "party" }); return r.party; }
  catch (e) { toast(errText(e, "party"), 2800); return null; }
}
/**
 * Recarrega o lobby (a tela faz polling a 1 Hz — é um lobby, não precisa de WebSocket).
 * SÓ um 404 desfaz a equipe: é a resposta do shard DONO dizendo que o lobby acabou (líder saiu, TTL
 * venceu, o pod voltou vazio). Qualquer outra falha — rede, 5xx, o 503 de um shard irmão mudo — é
 * passageira, e tratá-la como fim era o que fechava a tela de equipe sozinha, em um segundo.
 * `atualizando` porque o `useInterval` dispara a cada 1 s sem esperar a chamada anterior: com o salto
 * entre shards as respostas podem chegar fora de ordem, e um 200 velho reviveria a equipe já desfeita.
 */
let atualizando = false;
export async function refreshParty() {
  const p = app.get().party; if (!p || atualizando) return;
  atualizando = true;
  try { const r = await api.partyGet(p.code); app.update({ party: r.party, partyMe: r.you || app.get().partyMe, partyError: null });
    // o líder já começou: quem estava esperando entra na MESMA sala
    if (r.party.started && r.party.room && app.get().screen === "party") play({ room: r.party.room, mode: 1, teamSize: r.party.teamSize, party: r.party.code }); }
  catch (e) {
    if (!isGone(e)) { app.update({ partyError: "stale" }); return; }
    app.update({ party: null, partyMe: null, partyError: "gone" }); toast(getLabels().partyGone, 2500); go("modes"); }
  finally { atualizando = false; }
}
export async function leaveParty() {
  const p = app.get().party; if (!p) { go("modes"); return; }
  try { await api.partyLeave(p.code); } catch { /* já expirou */ }
  app.update({ party: null, partyMe: null, partyError: null }); go("modes");
}
/** O líder começa: escolhe a sala e avisa o lobby, para os companheiros caírem no mesmo código. */
export async function startParty() {
  const p = app.get().party; if (!p) return;
  let code = null;
  try { const a = await api.auto({ mode: 1, teamSize: p.teamSize }); if (a && a.code) code = a.code; } catch { /* toast abaixo */ }
  // sem sala não se começa: o servidor gravaria `room:null` e os companheiros ficariam presos para sempre
  // esperando o `started && room` do polling — o líder entraria na partida sozinho e ninguém saberia.
  if (!code) { toast(getLabels().partyNoRoom, 2500); return; }
  try { await api.partyStart(p.code, code); } catch (e) { toast(errText(e, "party"), 2500); return; }
  play({ room: code, mode: 1, teamSize: p.teamSize, party: p.code });
}
export function leaveGame(screen = "lobby") {
  if (PORTAL) { portal.jogoParou(); portal.saiuDaSala(); }
  app.update(s => ({ ...s, screen, overlays: { account: false, reconn: false, pause: false }, pendingJoin: null, conn: "idle", reconnAttempt: 0 }));
}
let rewardsT = null, levelUpN = 0;
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
  // Subir de nível e destravar conquista são as duas coisas que o jogador não vai ver de novo — e as
  // duas passavam batidas: o nível saía num toast de 3,2 s dividindo a fila com todo o resto, e a
  // conquista não saía em lugar NENHUM (nem na tela de morte, nem no pódio; só aparecia no Perfil, se
  // ele fosse lá procurar). `r.xp.gained` chegava e era jogado fora. Agora as duas viram um cartão só.
  if (r) {
    const novas = (r.achievements || []).map(a => (a && a.key) || a).filter(Boolean);
    const subiu = !!(r.xp && r.xp.leveledUp);
    if (subiu || novas.length) app.update({ levelUp: { subiu,
      level: r.xp ? r.xp.level : 0, gained: r.xp ? r.xp.gained : 0,
      into: r.xp ? r.xp.into : 0, need: r.xp ? r.xp.need : 1, pct: r.xp ? r.xp.pct : 0,
      achievements: novas, n: ++levelUpN } });
  }
  if (api.online === false && app.get().lastMatch) {
    const m = app.get().lastMatch, u = app.get().session.user;
    const p = api.localMatchEnd({ endedAt: new Date(m.at).toISOString(), score: m.score, maxMass: m.maxMass, kills: m.kills, durationS: m.durationS, cause: m.byHole ? "blackhole" : "eaten", by: m.by, coinsEarned: r ? r.coinsEarned : 0, roomCode: m.room }, r ? { ...r, coins: u ? u.coins : 0 } : null);
    if (p) app.update(s => ({ ...s, session: { ...s.session, stats: normalizeStats(p.stats) } }));
  }
}
/** Callback do jogo: {state:'connecting'|'connected'|'reconnecting'|'closed'|'error', room?, attempt?, code?, message?} */
export function onConnection(ev) {
  const st = ev && ev.state;
  if (st === "connected") { app.update(s => ({ ...s, conn: "connected", room: ev.room || s.room, overlays: { ...s.overlays, reconn: false }, reconnAttempt: 0 }));
    // o portal precisa saber em que sala o jogador está para oferecer "entrar com o amigo" (o Full da
    // CrazyGames). O código da nossa sala já é único no jogo inteiro, que é o que eles pedem do roomId.
    if (PORTAL && ev.room) portal.sala(ev.room, true); }
  else if (st === "connecting") app.update(s => ({ ...s, conn: "connecting", room: ev.room || s.room }));
  else if (st === "reconnecting") app.update(s => ({ ...s, conn: "reconnecting", reconnAttempt: ev.attempt || 1, overlays: { ...s.overlays, reconn: true } }));
  else if (st === "closed" || st === "error") {
    const s = app.get();
    app.update({ conn: "closed", overlays: { ...s.overlays, reconn: false } });
    // NICK_IN_ROOM não é "deu erro": é "troque o nome". Desde que o nick ficou livre (dois "Messi" são
    // legais no mundo) isso deixou de ser raro — e cai bem no caminho de EQUIPE, onde todos entram pelo
    // mesmo código. Mandar para a tela de Salas era um beco: a frase não diz onde se troca o nome.
    if (s.screen === "game" && ev.code === "NICK_IN_ROOM") {
      toast(errText(ev) + (ev.suggestion ? ` · ${ev.suggestion}` : ""), 4000); leaveGame("entry"); focaNome();
    }
    // no portal, "não deu para conectar" também é a tela que fica: o toast some e o jogador acha que
    // clicou errado. `UNREACHABLE`/`LOST` são a queda de rede; o resto continua sendo erro de sala.
    else if (PORTAL && (ev.code === "UNREACHABLE" || ev.code === "LOST")) { leaveGame("entry"); app.update({ servidorFora: true }); }
    else if (s.screen === "game") { toast(errText(ev), 3000); leaveGame("lobby"); }
    else if (ev.code || ev.message) toast(errText(ev), 3000);
  }
}

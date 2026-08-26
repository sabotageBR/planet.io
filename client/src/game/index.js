// ── MOTOR DO JOGO — STUB ──────────────────────────────────────────────────────
// Substituído pelo renderer PixiJS. O shell só depende deste contrato:
//
//   createGame({container, hud, prefs, theme, onDead, onRewards, onConnection}) →
//     { join({token, fallbackNick, room}), leave(), setPrefs(p), setTheme(t), resize(), destroy(), hudStore }
//
//   container  : <div id="game"> — o motor põe o canvas dentro.
//   hud        : <div id="hud"> — os botões touch (#t-split/#t-eject/#t-fire) disparam CustomEvent
//                `planet:action` {detail:{action:'split'|'eject'|'fire', phase:'down'|'up'}} que borbulha até aqui.
//   onDead     : ({by, byHole, score, maxMass, kills, durationS}) → shell abre a tela de morte.
//   onRewards  : ({saved, coinsEarned, coins, achievements:[{key,title}], skinsUnlocked:[id], rank:{day}}) (mensagem `rewards`).
//   onConnection: ({state:'connecting'|'connected'|'reconnecting'|'closed'|'error', room?, attempt?, code?, message?}).
//   hudStore   : {subscribe(fn), get()} com
//     {mass, score, rank, coins, ammo, powerups:{speed,magnet,shield} (segundos restantes), splitCd, ejectCd (0..1, fração
//      RESTANTE: 0 = pronto), lb:[{slot,name,mass,isBot,registered,me,rank}], room, ping, fps, dead}
//     `coins` pode ser null (o HUD cai para session.user.coins). Emitir a ≤ 20 Hz; o HUD já se protege (throttleStore).
//
// Este stub desenha um canvas 2D estático com "motor do jogo em construção" e finge o hudStore (massa oscilando,
// placar falso, cooldowns) para o HUD ser desenvolvido. Extra só do stub: `debug.die()`, `debug.rewards()`, `debug.reconn(n)`.
import { createStore } from "../state/store.js";

const NAMES = ["Nebulox", "Vortexia", "Cosmara", "Drakonis", "Stellara", "Graviton", "Quasara", "Pulsaris", "Meteora", "Darkion"];
const HUMANS = ["luana_x", "Kaique", "MarcosVP", "nina.s", "Rafa", "theo_br"];
const initialHud = () => ({ mass: 0, score: 0, rank: 0, coins: null, ammo: 0, powerups: { speed: 0, magnet: 0, shield: 0 }, splitCd: 0, ejectCd: 0, lb: [], room: null, ping: 0, fps: 0, dead: false });

export function createGame({ container, hud, prefs = {}, theme = null, onDead, onRewards, onConnection }) {
  const canvas = document.createElement("canvas");
  canvas.className = "game-canvas"; canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const hudStore = createStore(initialHud());
  let raf = 0, joined = false, room = null, nick = "", t0 = 0, lastHud = 0, lastLb = 0, frames = 0, fpsT = 0, fps = 60, kills = 0, maxMass = 0, dead = false;
  let curPrefs = { ...prefs }, curTheme = theme;
  const others = Array.from({ length: 9 }, (_, i) => ({ slot: i + 1, name: i % 3 === 0 ? HUMANS[(i * 5 + 2) % HUMANS.length] : NAMES[i % NAMES.length], isBot: i % 3 !== 0, registered: i % 3 === 0 && i % 2 === 0, base: 4200 - i * 380, phase: i * 1.3 }));
  const dots = Array.from({ length: 60 }, (_, i) => ({ x: Math.random(), y: Math.random(), r: 1 + (i % 3), s: .02 + (i % 5) * .01 }));

  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1), w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    draw(performance.now());
  }
  function draw(now) {
    const W = canvas.width, H = canvas.height, dpr = W / Math.max(1, container.clientWidth || innerWidth);
    const css = getComputedStyle(document.documentElement);
    const bg = css.getPropertyValue("--bg").trim() || "#1b2450", fg = css.getPropertyValue("--text").trim() || "#fff5c2", ac = css.getPropertyValue("--accent").trim() || "#ffc22e";
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const t = (now - t0) / 1000;
    ctx.fillStyle = fg; ctx.globalAlpha = .35;
    for (const d of dots) { const x = ((d.x + t * d.s * .1) % 1) * W, y = d.y * H; ctx.beginPath(); ctx.arc(x, y, d.r * dpr, 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (joined) { ctx.strokeStyle = ac; ctx.lineWidth = 4 * dpr; ctx.beginPath(); ctx.arc(W / 2, H / 2, (48 + Math.sin(t * 2) * 6) * dpr, 0, 6.283); ctx.stroke(); }
    ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `bold ${22 * dpr}px ${css.getPropertyValue("--font-ui").trim() || "system-ui, sans-serif"}`;
    ctx.fillText("motor do jogo em construção", W / 2, H / 2 + 90 * dpr);
    ctx.font = `${13 * dpr}px system-ui, sans-serif`; ctx.globalAlpha = .7;
    ctx.fillText(joined ? `stub · sala ${room} · ${nick} · tema ${(curTheme && curTheme.id) || "?"}` : "stub · fora da partida", W / 2, H / 2 + 116 * dpr);
    ctx.globalAlpha = 1;
  }
  function tickHud(now) {
    const t = (now - t0) / 1000, s = hudStore.get();
    const mass = dead ? 0 : Math.round(900 + t * 45 + Math.sin(t * .8) * 220); maxMass = Math.max(maxMass, mass);
    const lbDue = now - lastLb > 500;
    let lb = s.lb;
    if (lbDue) { lastLb = now;
      const rows = others.map(o => ({ slot: o.slot, name: o.name, mass: Math.round(o.base + Math.sin(t * .5 + o.phase) * 300), isBot: o.isBot, registered: o.registered, me: false }));
      if (!dead) rows.push({ slot: 0, name: nick, mass, isBot: false, registered: false, me: true });
      rows.sort((a, b) => b.mass - a.mass); lb = rows.map((r, i) => ({ ...r, rank: i + 1 })); }
    const me = lb.find(r => r.me);
    hudStore.set({ ...s, mass, score: Math.round(mass * 1.6), rank: me ? me.rank : 0, lb,
      powerups: { speed: Math.max(0, s.powerups.speed - .1), magnet: Math.max(0, s.powerups.magnet - .1), shield: Math.max(0, s.powerups.shield - .1) },
      splitCd: Math.max(0, s.splitCd - .1 / .4), ejectCd: Math.max(0, s.ejectCd - .1 / .12), ping: 20 + Math.round(Math.abs(Math.sin(t)) * 12), fps, dead });
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    frames++; if (now - fpsT > 1000) { fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; }
    draw(now);
    if (joined && now - lastHud >= 100) { lastHud = now; tickHud(now); }
  }
  const act = a => { if (!joined || dead) return; const s = hudStore.get();
    if (a === "split" && s.splitCd <= 0) hudStore.set({ ...s, splitCd: 1 });
    else if (a === "eject" && s.ejectCd <= 0) hudStore.set({ ...s, ejectCd: 1 });
    else if (a === "fire" && s.ammo > 0) hudStore.set({ ...s, ammo: s.ammo - 1 }); };
  const onAction = e => { if (e.detail && e.detail.phase === "down") act(e.detail.action); };
  const inInput = () => document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  const onKey = e => { if (!joined || inInput()) return;
    if (e.code === "Space") { e.preventDefault(); act("split"); } else if (e.code === "KeyW") act("eject"); else if (e.code === "KeyF") act("fire"); };
  const onPointer = e => { if (!joined || dead) return; if (e.button === 2) { if (curPrefs.rightSplit !== false) act("split"); } else act(hudStore.get().ammo > 0 ? "fire" : "eject"); };
  const onCtx = e => e.preventDefault();
  if (hud) hud.addEventListener("planet:action", onAction);
  addEventListener("keydown", onKey); canvas.addEventListener("pointerdown", onPointer); canvas.addEventListener("contextmenu", onCtx);
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null; if (ro) ro.observe(container);

  const game = {
    hudStore,
    join({ token, fallbackNick, room: code } = {}) {
      joined = true; dead = false; kills = 0; maxMass = 0; room = code || "0DEV"; nick = fallbackNick || "Viajante"; t0 = performance.now(); lastHud = lastLb = 0;
      hudStore.set({ ...initialHud(), room, ammo: 2, powerups: { speed: 12, magnet: 0, shield: 0 } });
      onConnection && onConnection({ state: "connecting", room });
      setTimeout(() => { if (joined) onConnection && onConnection({ state: "connected", room, token: !!token }); }, 250);
      if (!raf) raf = requestAnimationFrame(frame);
      resize();
    },
    leave() { joined = false; dead = false; hudStore.set({ ...initialHud(), room }); draw(performance.now()); },
    setPrefs(p) { curPrefs = { ...curPrefs, ...(p || {}) }; },
    setTheme(t) { curTheme = t; draw(performance.now()); },
    resize,
    destroy() {
      cancelAnimationFrame(raf); raf = 0; joined = false;
      if (hud) hud.removeEventListener("planet:action", onAction);
      removeEventListener("keydown", onKey); canvas.removeEventListener("pointerdown", onPointer); canvas.removeEventListener("contextmenu", onCtx);
      if (ro) ro.disconnect(); canvas.remove();
    },
    // só no stub
    debug: {
      die(by = NAMES[Math.floor(Math.random() * NAMES.length)], byHole = false) {
        if (!joined || dead) return; dead = true; const s = hudStore.get(); hudStore.set({ ...s, dead: true });
        const durationS = Math.round((performance.now() - t0) / 1000);
        onDead && onDead({ by, byHole, score: s.score, maxMass, kills, durationS });
        setTimeout(() => game.debug.rewards(durationS), 1200);
      },
      rewards(durationS = 0) {
        const coinsEarned = Math.min(500, Math.floor(hudStore.get().score / 300) + kills * 2 + (durationS >= 300 ? 25 : 0));
        onRewards && onRewards({ saved: false, coinsEarned, coins: null, achievements: [], skinsUnlocked: [], rank: { day: null } });
      },
      reconn(n = 1) { onConnection && onConnection({ state: n > 0 ? "reconnecting" : "connected", attempt: n, room }); },
    },
  };
  if (!raf) raf = requestAnimationFrame(frame);
  resize();
  return game;
}

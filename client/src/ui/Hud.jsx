// HUD sobre o canvas: chips (sala, relógio do espaço + contagem do fim do mundo, ping/fps), placar,
// massa/pontos, munição, powerups, cooldowns, botões touch.
// Lê o hudStore do jogo (throttle 20 Hz) e a sessão (moedas/nick/prefs). Os botões touch emitem
// CustomEvent `planet:action` {action, phase} que borbulha até #hud (o motor escuta ali).
import React, { useMemo, useSyncExternalStore } from "react";
import { useStore, throttleStore } from "../state/store.js";
import { app } from "../state/app.js";
import { gameRef } from "../state/game.js";
import { leaveGame } from "../state/actions.js";
import { useLabels, useTheme } from "../hooks/useTheme.js";
import { fmt } from "./format.js";

const EMPTY = { mass: 0, score: 0, rank: 0, coins: null, ammo: 0, fireCd: 0, powerups: { magnet: 0, shield: 0 }, splitCd: 0, ejectCd: 0, lb: [], room: null, ping: 0, fps: 0, dead: false, clock: null };
const EMPTY_STORE = { get: () => EMPTY, subscribe: () => () => {} };
const PW_ICON = { magnet: "🧲", shield: "🛡️" };
const emit = (el, action, phase) => el.dispatchEvent(new CustomEvent("planet:action", { bubbles: true, detail: { action, phase } }));
function press(action) {
  return {
    onPointerDown: e => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ok */ } emit(e.currentTarget, action, "down"); },
    onPointerUp: e => emit(e.currentTarget, action, "up"),
    onPointerCancel: e => emit(e.currentTarget, action, "up"),
    onContextMenu: e => e.preventDefault(),
  };
}

export default function Hud() {
  const LB = useLabels(), th = useTheme();
  const LV = th && th.hud && th.hud.cell && th.hud.cell.powerups ? th.hud.cell.powerups.shieldLevels : null;
  const screen = useStore(app, s => s.screen), room = useStore(app, s => s.room), session = useStore(app, s => s.session);
  const game = useStore(gameRef, s => s.game);
  const store = useMemo(() => (game && game.hudStore ? throttleStore(game.hudStore, 50) : EMPTY_STORE), [game]);
  const h = useSyncExternalStore(store.subscribe, store.get, store.get) || EMPTY;
  const user = session.user || {}, prefs = session.prefs;
  const lbSize = +prefs.lbSize || 8, rows = h.lb || [];
  let shown = rows.slice(0, lbSize); const meRow = rows.find(r => r.me); if (meRow && !shown.includes(meRow)) shown = [...shown, meRow];
  const lbMax = rows.reduce((m, r) => Math.max(m, r.mass || 0), 1);
  const coins = h.coins != null ? h.coins : user.coins || 0;
  // fireCd: carência de tiro do spawn (MISSILE.SPAWN_CD_TICKS) em segundos — enquanto corre, a contagem regressiva
  // fica EM CIMA do ícone da arma e o botão apaga como se não houvesse munição (o clique vira ejeção)
  const ammo = h.ammo || 0, fireCd = Math.ceil(h.fireCd || 0), armed = ammo > 0 && !fireCd, pw = Object.entries(h.powerups || {}).filter(([, v]) => v > 0);
  const splitReady = !(h.splitCd > 0), ejectReady = !(h.ejectCd > 0);
  return <div id="hud" className={screen === "game" ? "" : "hidden"}>
    <div id="hud-top">
      <span className="chip" id="h-room"><i>{LB.room}</i> <b id="v-room">{h.room || room || "—"}</b></span>
      {h.clock ? <span className="chip" id="h-clock"><i>🕒</i> <b>{String(h.clock.h).padStart(2, "0")}:{String(h.clock.m).padStart(2, "0")}</b> <i>⏳</i> <b>{Math.floor(h.clock.leftS / 60)}:{String(Math.floor(h.clock.leftS % 60)).padStart(2, "0")}</b></span> : null}
      <span className="chip" id="h-net" style={prefs.showFps ? undefined : { display: "none" }}><b id="v-ping">{h.ping || 0}</b><i>{LB.ping}</i> <b id="v-fps">{h.fps || 0}</b><i>{LB.fps}</i></span>
      <button className="btn-mini" id="h-exit" data-go="lobby" onClick={() => leaveGame("lobby")}>{LB.exit}</button>
    </div>
    <div className="panel" id="hud-lb"><div className="ph">{LB.lbTitle}</div><div id="lb-rows">
      {shown.map(r => <div key={r.slot != null ? r.slot : r.name} className={"lb-row" + (r.me ? " mine" : "") + (r.rank <= 3 ? " top" : "")} style={{ "--p": ((r.mass || 0) / lbMax).toFixed(3) }}>
        <span className="lb-pos">{r.rank}</span>
        <span className="lb-name">{r.name}{r.isBot ? <> <i className="bot">{LB.botTag}</i></> : null}{r.registered ? <> <i className="reg">{LB.regTag}</i></> : null}</span>
        <b className="lb-val">{fmt(r.mass)}</b></div>)}
    </div></div>
    <div className="panel" id="hud-score">
      <div className="score-big"><span id="v-mass">{fmt(h.mass)}</span></div>
      <div className="score-sub">{LB.massLabel}</div>
      <div className="score-row"><span className="k">{LB.scoreLabel}</span> <b id="v-score">{fmt(h.score)}</b></div>
      <div className="score-row"><span className="k">{LB.youLabel}</span> <b id="v-name">{user.nick || ""}</b></div>
      <div className="score-row"><span className="k">{LB.coinIcon}</span> <b id="v-coins">{fmt(coins)}</b></div>
    </div>
    <div id="hud-status">
      <div className={"chip" + (armed ? "" : " empty")} id="hud-ammo"><i>🚀</i> {fireCd ? <b className="fire-cd">{fireCd}s</b> : <b id="v-ammo">{ammo}</b>} <span>{fireCd ? LB.fireCd : LB.ammo}</span></div>
      <div id="hud-pw">{pw.map(([k, v]) => k === "shield"
        ? <span key={k} className={"pw pw-shield lv-" + v} style={LV && LV[v - 1] ? { background: LV[v - 1].color } : undefined}><i>{PW_ICON.shield}</i>{LB.powerups.shield} <b>{LB.shieldLevel} {v} {"★".repeat(v)}</b></span>
        : <span key={k} className={"pw pw-" + k}><i>{PW_ICON[k] || "✦"}</i>{LB.powerups[k] || k} <b>{Math.ceil(v)}s</b></span>)}</div>
    </div>
    <div id="hud-cd">
      <div className={"cd" + (splitReady ? " ready" : "")} id="cd-split" style={{ "--p": (1 - (h.splitCd || 0)).toFixed(2) }}><i className="cd-fill"></i><span>{LB.split}</span><em>{LB.keySplit}</em></div>
      <div className={"cd" + (ejectReady ? " ready" : "")} id="cd-eject" style={{ "--p": (1 - (h.ejectCd || 0)).toFixed(2) }}><i className="cd-fill"></i><span>{LB.eject}</span><em>{LB.keyEject}</em></div>
    </div>
    <div id="touch">
      <button className={"tbtn" + (splitReady ? "" : " cd")} id="t-split" {...press("split")}><span>{LB.split}</span></button>
      <button className={"tbtn" + (ejectReady ? "" : " cd")} id="t-eject" {...press("eject")}><span>{LB.eject}</span></button>
      <button className={"tbtn" + (armed ? "" : " empty") + (fireCd ? " cd" : "")} id="t-fire" {...press("fire")}><span>{LB.fire}</span><b id="t-ammo">{ammo}</b>{fireCd ? <em className="fire-cd">{fireCd}</em> : null}</button>
    </div>
  </div>;
}

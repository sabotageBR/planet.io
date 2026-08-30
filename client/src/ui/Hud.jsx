// HUD sobre o canvas: chips (sala, relógio do espaço + contagem do fim do mundo, ping/fps), placar,
// massa/pontos, munição, powerups, cooldowns, botões touch.
// Lê o hudStore do jogo (throttle 20 Hz) e a sessão (moedas/nick/prefs). Os botões touch emitem
// CustomEvent `warspace:action` {action, phase} que borbulha até #hud (o motor escuta ali).
import React, { useMemo, useSyncExternalStore } from "react";
import { useStore, throttleStore } from "../state/store.js";
import { app } from "../state/app.js";
import { gameRef } from "../state/game.js";
import { leaveGame } from "../state/actions.js";
import { useLabels, useTheme } from "../hooks/useTheme.js";
import { fmt } from "./format.js";
import Chat from "./Chat.jsx";
import KillFeed from "./KillFeed.jsx";
import { Nick } from "./bits.jsx";
import { WEAPON_ICON } from "./icons.js";
import BrLobby from "./BrLobby.jsx";
import { MODE, weaponOf, KEY_LABEL } from "@warspace/shared";
import { keysOf } from "../game/input/Keyboard.js";   // a legenda tem que dizer a tecla que está DE FATO ligada (inclusive a do desempate de colisão)

const EMPTY = { mass: 0, score: 0, rank: 0, coins: null, ammo: 0, fireCd: 0, powerups: { magnet: 0, shield: 0, autodef: 0, zoom: 0, feast: 0 }, splitCd: 0, ejectCd: 0, lb: [], room: null, ping: 0, fps: 0, dead: false, map: false, clock: null,
  mode: 0, teamSize: 1, team: -1, phase: "live", alive: 0, weapon: 0, owned: 1, zoneHurt: false, talk: null, chat: [], feed: [], lobby: null };
const TALK_MSG = { cd: "micCooldown", denied: "micDenied", unsupported: "micUnsupported", audio: "micFail", fail: "micFail" };   // motivo → chave da label
/** Anel do push-to-talk: o arco encolhe com o tempo que sobra do clipe. */
function TalkRing({ k }) {
  const R = 22, C = 2 * Math.PI * R, resta = Math.max(0, 1 - k);
  return <svg className="talk-ring" viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
    <circle cx="28" cy="28" r={R} className="tr-bg" />
    <circle cx="28" cy="28" r={R} className={"tr-arc" + (resta < .25 ? " low" : "")}
      strokeDasharray={C} strokeDashoffset={C * (1 - resta)} transform="rotate(-90 28 28)" />
  </svg>;
}
const EMPTY_STORE = { get: () => EMPTY, subscribe: () => () => {} };
const PW_ICON = { magnet: "🧲", shield: "🛡️", autodef: "🛰️", zoom: "🔭", feast: "🍀" };
const emit = (el, action, phase) => el.dispatchEvent(new CustomEvent("warspace:action", { bubbles: true, detail: { action, phase } }));
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
  const nivel = (session.stats && session.stats.level) | 0;
  // fireCd: carência de tiro do spawn (MISSILE.SPAWN_CD_TICKS) em segundos — enquanto corre, a contagem regressiva
  // fica EM CIMA do ícone da arma e o botão apaga como se não houvesse munição (o clique vira ejeção)
  const ammo = h.ammo || 0, fireCd = Math.ceil(h.fireCd || 0), armed = ammo > 0 && !fireCd, pw = Object.entries(h.powerups || {}).filter(([, v]) => v > 0);
  const splitReady = !(h.splitCd > 0), ejectReady = !(h.ejectCd > 0);
  // Teclas configuráveis: `#hud-cd` desenha a legenda, e uma legenda que mente é pior que nenhuma.
  const teclas = keysOf(prefs), kSplit = KEY_LABEL[teclas.split] || LB.keySplit, kEject = KEY_LABEL[teclas.eject] || LB.keyEject;
  const br = h.mode === MODE.BR, noLobby = !!h.lobby;
  const arma = weaponOf(h.weapon || 0), armaIco = WEAPON_ICON[h.weapon | 0] || WEAPON_ICON[0];
  const falando = h.talk && h.talk.on;
  // Por que o Ctrl "não fez nada": cooldown, permissão negada, navegador sem captura. O mic guardava esse
  // motivo desde sempre e NINGUÉM o lia — segurar a tecla nos 3 s seguintes a uma fala parecia bug.
  const talkAviso = h.talk && !h.talk.on ? h.talk.hint : null;
  // cinto: as armas com munição (bit 0 = míssil, sempre presente). Com mais de uma, o chip vira botão de troca.
  const cinto = WEAPON_ICON.map((_, i) => i).filter(i => ((h.owned | 1) >> i) & 1);
  const podeTrocar = cinto.length > 1;
  // Três estados, não dois. `spec` é o HUD de quem MORREU (e do pódio do fim de rodada): some tudo menos o
  // chat e o mapa — quem morreu continua na sala, lê, escreve e fala. Antes o `hidden` levava o #hud inteiro,
  // e era essa única linha que deixava o morto mudo (o servidor sempre aceitou a fala dele).
  const espectando = screen === "dead" || screen === "round";
  return <div id="hud" className={screen === "game" ? "" : espectando ? "spec" + (h.map ? " map" : "") : "hidden"}>
    <div id="hud-top">
      <span className="chip" id="h-room"><i>{LB.room}</i> <b id="v-room">{h.room || room || "—"}</b></span>
      {h.clock ? <span className="chip" id="h-clock"><i>🕒</i> <b>{String(h.clock.h).padStart(2, "0")}:{String(h.clock.m).padStart(2, "0")}</b> <i>⏳</i> <b>{Math.floor(h.clock.leftS / 60)}:{String(Math.floor(h.clock.leftS % 60)).padStart(2, "0")}</b></span> : null}
      <span className="chip" id="h-net" style={prefs.showFps ? undefined : { display: "none" }}><b id="v-ping">{h.ping || 0}</b><i>{LB.ping}</i> <b id="v-fps">{h.fps || 0}</b><i>{LB.fps}</i></span>
      <button className="btn-mini" id="h-exit" data-go="lobby" onClick={() => leaveGame("lobby")}>{LB.exit}</button>
    </div>
    {/* Coluna DIREITA (kill feed · meu placar · top 10), no arranjo do Counter-Strike. É uma caixa flex de
        verdade — e não `display:contents` como a coluna esquerda —, porque aqui os três blocos empilham
        SEMPRE, em qualquer modo, e uma caixa real resolve isso sem depender do que cada tema escreveu. */}
    <div id="hud-right">
    <KillFeed h={h} />
    <div className="panel" id="hud-score">
      <div className="score-big"><span id="v-mass">{fmt(h.mass)}</span></div>
      <div className="score-sub">{LB.massLabel}</div>
      <div className="score-row"><span className="k">{LB.scoreLabel}</span> <b id="v-score">{fmt(h.score)}</b></div>
      <div className="score-row"><span className="k">{LB.youLabel}</span> <b id="v-name">{user.nick || ""}</b>{nivel > 0 ? <i className="lvl">{nivel}</i> : null}</div>
      <div className="score-row"><span className="k">{LB.coinIcon}</span> <b id="v-coins">{fmt(coins)}</b></div>
    </div>
    <div className="panel" id="hud-lb"><div className="ph">{LB.lbTitle}</div><div id="lb-rows">
      {shown.map(r => <div key={r.slot != null ? r.slot : r.name} className={"lb-row" + (r.me ? " mine" : "") + (r.ally ? " ally" : "") + (r.rank <= 3 ? " top" : "")} style={{ "--p": ((r.mass || 0) / lbMax).toFixed(3) }}>
        <span className="lb-pos">{r.rank}</span>
        <span className="lb-name">{r.talking ? <i className="talk-dot">🎤</i> : null}{r.level > 0 ? <i className="lvl">{r.level}</i> : null}{r.name}{r.isBot ? <> <i className="bot">{LB.botTag}</i></> : null}{r.registered ? <> <i className="reg">{LB.regTag}</i></> : null}</span>
        <b className="lb-val">{fmt(r.mass)}</b></div>)}
    </div></div>
    </div>
    {/* Coluna esquerda: no DESKTOP este div é `display:contents` e some da conta (cada bloco fica exatamente
        onde o tema o coloca). No DEDO ele vira uma pilha flex — porque #hud-status CRESCE com os powerups
        ativos, e qualquer `bottom` fixo para o chat voltava a colidir assim que um ímã entrava. */}
    <div id="hud-left">
    <Chat h={h} persist={espectando} />
    <div id="hud-status">
      <button className={"chip belt" + (armed ? "" : " empty") + (podeTrocar ? " swap" : "")} id="hud-ammo"
        title={podeTrocar ? `${LB.swapWeapon} (${LB.keySwap})` : undefined} {...press("swap")}>
        <i>{armaIco}</i> {fireCd ? <b className="fire-cd">{fireCd}s</b> : <b id="v-ammo">{ammo}</b>} <span>{fireCd ? LB.fireCd : (LB.weapons[arma.key] || LB.ammo)}</span>
        {podeTrocar ? <em className="belt-alt">{cinto.map(w => <span key={w} className={"belt-ico" + (w === (h.weapon | 0) ? " on" : "")}>{WEAPON_ICON[w]}</span>)}</em> : null}
      </button>
      <div id="hud-pw">{pw.map(([k, v]) => k === "shield"
        ? <span key={k} className={"pw pw-shield lv-" + v} style={LV && LV[v - 1] ? { background: LV[v - 1].color } : undefined}><i>{PW_ICON.shield}</i>{LB.powerups.shield} <b>{LB.shieldLevel} {v} {"★".repeat(v)}</b></span>
        : <span key={k} className={"pw pw-" + k}><i>{PW_ICON[k] || "✦"}</i>{LB.powerups[k] || k} <b>{Math.ceil(v)}s</b></span>)}</div>
    </div>
    </div>
    {br && !noLobby ? <div id="hud-mode" className={h.zoneHurt ? "hurt" : ""}>
      <span className="chip alive"><i>💀</i> <b>{h.alive || 0}</b> <span>{LB.aliveLeft}</span></span>
      {h.zoneHurt ? <span className="chip zone-out">{LB.zoneOut}</span> : null}
    </div> : null}
    <BrLobby lobby={h.lobby} />
    {falando ? <div id="talk"><TalkRing k={h.talk.k} /><span>{LB.talkOn}</span></div>
      : talkAviso ? <div id="talk" className="hint"><span>{LB[TALK_MSG[talkAviso]] || LB.talkHint}</span></div> : null}
    <div id="hud-cd">
      <div className={"cd" + (splitReady ? " ready" : "")} id="cd-split" style={{ "--p": (1 - (h.splitCd || 0)).toFixed(2) }}><i className="cd-fill"></i><span>{LB.split}</span><em>{kSplit}</em></div>
      <div className={"cd" + (ejectReady ? " ready" : "")} id="cd-eject" style={{ "--p": (1 - (h.ejectCd || 0)).toFixed(2) }}><i className="cd-fill"></i><span>{LB.eject}</span><em>{kEject}</em></div>
    </div>
    <div id="touch">
      <button className={"tbtn" + (splitReady ? "" : " cd")} id="t-split" {...press("split")}><span>{LB.split}</span></button>
      <button className={"tbtn" + (ejectReady ? "" : " cd")} id="t-eject" {...press("eject")}><span>{LB.eject}</span></button>
      <button className={"tbtn" + (armed ? "" : " empty") + (fireCd ? " cd" : "")} id="t-fire" {...press("fire")}><span>{LB.fire}</span><b id="t-ammo">{ammo}</b>{fireCd ? <em className="fire-cd">{fireCd}</em> : null}</button>
      <button className={"tbtn talk" + (falando ? " on" : "") + (talkAviso === "cd" ? " cd" : "")} id="t-talk" {...press("talk")}><span>🎤</span></button>
      {podeTrocar ? <button className="tbtn swap" id="t-swap" {...press("swap")}><span>{armaIco}</span><em>⇄</em></button> : null}
    </div>
  </div>;
}

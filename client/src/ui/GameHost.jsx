// Monta createGame() em #game, encaminha prefs/tema, faz join/leave conforme o estado do shell.
import React, { useEffect, useRef } from "react";
import { createGame } from "../game/index.js";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { setGame, getGame } from "../state/game.js";
import { onDead, onRewards, onRoundEnd, onConnection } from "../state/actions.js";
import { api } from "../api/client.js";
import { currentTheme } from "../app/theme.js";
import { useTheme } from "../hooks/useTheme.js";

export default function GameHost() {
  const ref = useRef(null), joined = useRef(false);
  const screen = useStore(app, s => s.screen), pending = useStore(app, s => s.pendingJoin), prefs = useStore(app, s => s.session.prefs);
  const theme = useTheme();

  useEffect(() => {
    const game = createGame({ container: ref.current, hud: document.getElementById("hud"), prefs: app.get().session.prefs, theme: currentTheme(), onDead, onRewards, onRoundEnd, onConnection });
    setGame(game);
    if (import.meta.env.DEV) window.__game = game;
    // debounce pelo mesmo motivo do ResizeObserver em game/index.js: `resize` reenvia `{t:"view"}` e
    // arrastar a borda da janela estourava o balde de JSON do servidor, derrubando a conexão com RATE
    let t = 0;
    const onResize = () => { clearTimeout(t); t = setTimeout(() => game.resize(), 150); };
    addEventListener("resize", onResize); addEventListener("orientationchange", onResize);
    return () => { clearTimeout(t); removeEventListener("resize", onResize); removeEventListener("orientationchange", onResize); if (getGame() === game) setGame(null); game.destroy(); };
  }, []);

  useEffect(() => {
    const game = getGame(); if (!game || !pending) return;
    const user = app.get().session.user || {};
    game.join({ token: api.token, fallbackNick: user.nick || "Viajante", room: pending.room || null, mode: pending.mode | 0, teamSize: pending.teamSize || 1, party: pending.party || null }); joined.current = true;
  }, [pending]);

  useEffect(() => { const game = getGame(); if (game && joined.current && screen !== "game" && screen !== "dead" && screen !== "round") { joined.current = false; game.leave(); } }, [screen]);
  useEffect(() => { const game = getGame(); if (game) game.setPrefs(prefs); }, [prefs]);
  useEffect(() => { const game = getGame(); if (game) game.setTheme(theme); }, [theme]);

  return <div id="game" ref={ref} />;
}

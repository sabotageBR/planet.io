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
  const pause = useStore(app, s => s.overlays.pause);
  const tab = useStore(app, s => s.overlays.tab);
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
    // ⚠️ `skinId` só é preenchido pelo TUTORIAL (`entraNoTutorial`), e por isso vai como `?? null`: o
    // fallback de `game/index.js` é `skinId != null ? skinId : user.equippedSkin`, então um `undefined`
    // daqui já cairia na skin da conta — mas um `0` não, e 0 é um id válido (o Planeta Padrão). Deixar o
    // campo explícito é o que mantém as duas leituras honestas.
    game.join({ token: api.token, fallbackNick: user.nick || "Viajante", room: pending.room || null, mode: pending.mode | 0, teamSize: pending.teamSize || 1, party: pending.party || null, spec: !!pending.spec, tutorial: !!pending.tutorial, skinId: pending.skinId == null ? null : pending.skinId | 0 }); joined.current = true;
  }, [pending]);

  // ⚠️ `spec` entra na lista: sair dela chama `game.leave()`, e quem está assistindo tem uma conexão viva
  // exatamente como quem joga. Sem a linha, o espectador seria desconectado no primeiro render.
  useEffect(() => { const game = getGame(); if (game && joined.current && screen !== "game" && screen !== "dead" && screen !== "round" && screen !== "spec") { joined.current = false; game.leave(); } }, [screen]);
  useEffect(() => { const game = getGame(); if (game) game.setPrefs(prefs); }, [prefs]);
  // Com o menu de pausa aberto o motor larga o CONTROLE (o alvo passa a ser o próprio centróide e as ações
  // são recusadas). A partida continua rodando no servidor — ver o cabeçalho de ui/Pause.jsx.
  useEffect(() => { const game = getGame(); if (game) game.setPaused(pause); }, [pause]);
  // ⚠️ O painel do TAB é o OPOSTO da pausa: ele só liga a montagem do roster no `pushHud` (que a 8 Hz não
  // vale a pena com o painel fechado) e NÃO toca no controle. O jogo continua vivo por baixo dele.
  useEffect(() => { const game = getGame(); if (game && game.setRoster) game.setRoster(tab); }, [tab]);
  useEffect(() => { const game = getGame(); if (game) game.setTheme(theme); }, [theme]);

  return <div id="game" ref={ref} />;
}

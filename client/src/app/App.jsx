// Shell: canvas do jogo + HUD + 8 telas + 2 overlays + toast, na mesma ordem de DOM do mockup.
import React, { useEffect } from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { boot, escape } from "../state/actions.js";
import { useViewportMode } from "../hooks/useViewportMode.js";
import GameHost from "../ui/GameHost.jsx";
import Hud from "../ui/Hud.jsx";
import Entry from "../ui/Entry.jsx";
import Lobby from "../ui/Lobby.jsx";
import Modes from "../ui/Modes.jsx";
import Party from "../ui/Party.jsx";
import Rank from "../ui/Rank.jsx";
import Profile from "../ui/Profile.jsx";
import Shop from "../ui/Shop.jsx";
import Prefs from "../ui/Prefs.jsx";
import Dead from "../ui/Dead.jsx";
import Round from "../ui/Round.jsx";
import AccountModal from "../ui/AccountModal.jsx";
import ReconnOverlay from "../ui/ReconnOverlay.jsx";
import Toast from "../ui/Toast.jsx";
import { sfx } from "../audio/index.js";

let booted = false; // StrictMode monta o efeito duas vezes em dev
export default function App() {
  useViewportMode();
  const hoverRef = React.useRef(null);
  const screen = useStore(app, s => s.screen), overlays = useStore(app, s => s.overlays), online = useStore(app, s => s.session.online);
  useEffect(() => { if (!booted) { booted = true; boot(); } }, []);
  useEffect(() => { document.body.dataset.screen = screen; }, [screen]);
  useEffect(() => { document.body.dataset.online = online == null ? "" : online ? "1" : "0"; }, [online]);
  useEffect(() => {
    const onKey = e => { if (e.code === "Escape" && escape()) e.preventDefault(); };
    addEventListener("keydown", onKey); return () => removeEventListener("keydown", onKey);
  }, []);
  // Som das telas por DELEGAÇÃO: um listener só, em vez de espalhar `sfx()` por dez componentes. O canvas do
  // jogo (#game) fica de fora — lá quem manda é o som da partida, e um clique de UI no meio do tiroteio confunde.
  useEffect(() => {
    const alvo = e => { const t = e.target.closest?.("button,.btn,[role=button],.skin-card,.tab"); return t && !t.closest("#game") && !t.disabled ? t : null; };
    const onDown = e => { if (alvo(e)) sfx("uiClick"); };
    const onOver = e => { const t = alvo(e); if (t && t !== hoverRef.current) { hoverRef.current = t; sfx("uiHover"); } };
    const onOut = e => { if (hoverRef.current && !e.relatedTarget?.closest?.("button,.btn,[role=button],.skin-card,.tab")) hoverRef.current = null; };
    addEventListener("pointerdown", onDown, true); addEventListener("pointerover", onOver, true); addEventListener("pointerout", onOut, true);
    return () => { removeEventListener("pointerdown", onDown, true); removeEventListener("pointerover", onOver, true); removeEventListener("pointerout", onOut, true); };
  }, []);
  return <>
    <GameHost />
    <Hud />
    <Entry on={screen === "entry"} />
    <Lobby on={screen === "lobby"} />
      <Modes on={screen === "modes"} />
      <Party on={screen === "party"} />
    <Rank on={screen === "rank"} />
    <Profile on={screen === "profile"} />
    <Shop on={screen === "shop"} />
    <Prefs on={screen === "prefs"} />
    <Dead on={screen === "dead"} />
    <Round on={screen === "round"} />
    <AccountModal on={overlays.account} />
    <ReconnOverlay on={overlays.reconn} />
    <Toast />
  </>;
}

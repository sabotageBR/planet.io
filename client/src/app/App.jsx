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
import Rank from "../ui/Rank.jsx";
import Profile from "../ui/Profile.jsx";
import Shop from "../ui/Shop.jsx";
import Prefs from "../ui/Prefs.jsx";
import Dead from "../ui/Dead.jsx";
import AccountModal from "../ui/AccountModal.jsx";
import ReconnOverlay from "../ui/ReconnOverlay.jsx";
import Toast from "../ui/Toast.jsx";

let booted = false; // StrictMode monta o efeito duas vezes em dev
export default function App() {
  useViewportMode();
  const screen = useStore(app, s => s.screen), overlays = useStore(app, s => s.overlays), online = useStore(app, s => s.session.online);
  useEffect(() => { if (!booted) { booted = true; boot(); } }, []);
  useEffect(() => { document.body.dataset.screen = screen; }, [screen]);
  useEffect(() => { document.body.dataset.online = online == null ? "" : online ? "1" : "0"; }, [online]);
  useEffect(() => {
    const onKey = e => { if (e.code === "Escape" && escape()) e.preventDefault(); };
    addEventListener("keydown", onKey); return () => removeEventListener("keydown", onKey);
  }, []);
  return <>
    <GameHost />
    <Hud />
    <Entry on={screen === "entry"} />
    <Lobby on={screen === "lobby"} />
    <Rank on={screen === "rank"} />
    <Profile on={screen === "profile"} />
    <Shop on={screen === "shop"} />
    <Prefs on={screen === "prefs"} />
    <Dead on={screen === "dead"} />
    <AccountModal on={overlays.account} />
    <ReconnOverlay on={overlays.reconn} />
    <Toast />
  </>;
}

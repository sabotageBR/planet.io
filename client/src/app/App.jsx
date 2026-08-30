// Shell: canvas do jogo + HUD + 8 telas + 2 overlays + toast, na mesma ordem de DOM do mockup.
import React, { useEffect } from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { boot, escape, toggleMute } from "../state/actions.js";
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
import LevelUp from "../ui/LevelUp.jsx";
import { Nav } from "../ui/bits.jsx";
import { sfx } from "../audio/index.js";

// As telas de MENU, as que ganham a barra. `party` entra marcando "modes", que é de onde se chega nela.
const NAV_TELAS = new Set(["modes", "party", "lobby", "rank", "profile", "shop", "prefs"]);
let booted = false; // StrictMode monta o efeito duas vezes em dev
export default function App() {
  useViewportMode();
  const hoverRef = React.useRef(null);
  const screen = useStore(app, s => s.screen), overlays = useStore(app, s => s.overlays), online = useStore(app, s => s.session.online);
  const played = useStore(app, s => s.played), conn = useStore(app, s => s.conn);
  useEffect(() => { if (!booted) { booted = true; boot(); } }, []);
  useEffect(() => { document.body.dataset.screen = screen; }, [screen]);
  // "center" = o menu fica centralizado, com o céu inteiro atrás.
  // "rail"   = o menu vira gaveta à direita e a CÂMERA ENCOLHE para a esquerda, em vez de ficar
  //            escondida atrás dela. Quem faz a conta é ui.css.
  // O que decide é haver uma CENA VIVA atrás do menu, não "já jogou alguma vez": `played` só era
  // escrito como `true` e nunca voltava, então sair da partida deixava a gaveta à direita com o
  // canvas VAZIO à esquerda — uma gaveta que não é aparte de nada. `leaveGame` zera a conexão,
  // e é ela que responde a pergunta certa.
  const rail = played && conn !== "idle" && conn !== "closed";
  useEffect(() => { document.body.dataset.shell = rail ? "rail" : "center"; }, [rail]);
  useEffect(() => { document.body.dataset.online = online == null ? "" : online ? "1" : "0"; }, [online]);
  useEffect(() => {
    // ⚠️ `digitando` não é firula: o chat é um <input> dentro do HUD, e sem esta guarda escrever "amanha"
    // mutaria o jogo no meio da palavra. Modificador junto também sai fora (Ctrl+M é atalho do navegador).
    const digitando = e => { const t = e.target, n = t && t.tagName;
      return n === "INPUT" || n === "TEXTAREA" || n === "SELECT" || (t && t.isContentEditable); };
    const onKey = e => {
      if (e.code === "Escape" && escape()) return e.preventDefault();
      if (e.code === "KeyM" && !e.ctrlKey && !e.metaKey && !e.altKey && !digitando(e)) {
        e.preventDefault(); toggleMute();
      }
    };
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
    {/* A BARRA DE NAVEGAÇÃO É UMA SÓ, e mora aqui. Antes cada tela renderizava a sua DENTRO da caixa, e o
        resultado dependia da altura do conteúdo: os temas a colam com `position:sticky;bottom:0`, então em
        "Salas" (conteúdo curto) ela grudava no fundo de um retângulo baixo, no meio da tela, e em "Perfil"
        (conteúdo longo, caixa no teto) ia parar quase no rodapé da janela. Três telas irmãs, três lugares.
        Pior: "Modos" e "Equipe" simplesmente não a renderizavam, e a barra SUMIA.
        Fora da caixa ela fica sempre no mesmo lugar, do mesmo tamanho, em todas as telas. A entrada é a
        única exceção, e de propósito: lá a navegação são os seis botões grandes do próprio cartão. */}
    {NAV_TELAS.has(screen) ? <Nav cur={screen === "party" ? "modes" : screen} /> : null}
    <AccountModal on={overlays.account} />
    <ReconnOverlay on={overlays.reconn} />
    <Toast />
    <LevelUp />
  </>;
}

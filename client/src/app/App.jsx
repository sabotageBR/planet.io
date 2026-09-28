// Shell: canvas do jogo + HUD + 8 telas + 2 overlays + toast, na mesma ordem de DOM do mockup.
import React, { useEffect } from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { boot, escape, toggleMute, setRoster } from "../state/actions.js";
import { useViewportMode } from "../hooks/useViewportMode.js";
import GameHost from "../ui/GameHost.jsx";
import Scene from "../ui/Scene.jsx";
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
import Spectate from "../ui/Spectate.jsx";
import AccountModal from "../ui/AccountModal.jsx";
import Pause from "../ui/Pause.jsx";
import ReconnOverlay from "../ui/ReconnOverlay.jsx";
import Offline from "../ui/Offline.jsx";
import PortalLogin from "../ui/PortalLogin.jsx";
import Toast from "../ui/Toast.jsx";
import LevelUp from "../ui/LevelUp.jsx";
import Roster from "../ui/Roster.jsx";
import { sfx } from "../audio/index.js";
import { SEM_MENU, ENXUTO } from "../portal/flags.js";

let booted = false; // StrictMode monta o efeito duas vezes em dev
export default function App() {
  useViewportMode();
  const hoverRef = React.useRef(null);
  const screen = useStore(app, s => s.screen), overlays = useStore(app, s => s.overlays), online = useStore(app, s => s.session.online);
  const played = useStore(app, s => s.played), conn = useStore(app, s => s.conn);
  // ⚠️ O CLARÃO DA MORTE SEM TELA. Quando a primeira morte renasce sozinha (portal/primeiraVida.js) não
  // há modal nenhum entre uma vida e outra, e sem UM retorno de tela o planeta simplesmente reaparece
  // noutro canto — o jogador não entende que morreu, o que é pior que o cartão que se acabou de tirar.
  // O som já existe (o `EVENT.DEATH` toca `death` pelo motor), então o que faltava era a imagem.
  // ⚠️ `key` no contador e não um booleano com timer: assim duas mortes seguidas reanimam de verdade, e
  // o elemento sai do DOM sozinho quando a animação acaba (`onAnimationEnd`). Zero é "nunca houve".
  const flash = useStore(app, s => s.flash);
  const [clarao, setClarao] = React.useState(0);
  useEffect(() => { if (flash) setClarao(flash); }, [flash]);
  useEffect(() => { if (!booted) { booted = true; boot(); } }, []);
  useEffect(() => { document.body.dataset.screen = screen; }, [screen]);
  // ⚠️ O PACOTE ENXUTO (portal/flags.js) é decidido por CSS a partir deste atributo: o CSS dos temas não
  // sabe de portal nenhum, e um `if` por rótulo espalhado nos componentes divergiria no primeiro conserto.
  useEffect(() => { if (ENXUTO) document.body.dataset.pacote = "poki"; }, []);
  // "center" = o menu fica centralizado, com o céu inteiro atrás.
  // "rail"   = o menu vira gaveta à direita e a CÂMERA ENCOLHE para a esquerda, em vez de ficar
  //            escondida atrás dela. Quem faz a conta é ui.css.
  // O que decide é haver uma CENA VIVA atrás do menu, não "já jogou alguma vez": `played` só era
  // escrito como `true` e nunca voltava, então sair da partida deixava a gaveta à direita com o
  // canvas VAZIO à esquerda — uma gaveta que não é aparte de nada. `leaveGame` zera a conexão,
  // e é ela que responde a pergunta certa.
  // ⚠️ O BIG CRUNCH sai da gaveta. `conn` continua "connected" quando a rodada acaba (o socket só cai
  // depois), então o pódio caía no `rail` e ficava espremido em 480 px com um mundo VAZIO ao lado — a
  // sala foi aposentada, não há mais partida para acompanhar. Fora do rail ele ganha a caixa inteira e
  // o cenário atrás, que é o lugar de uma tela de resultado.
  const rail = played && conn !== "idle" && conn !== "closed" && screen !== "round";
  useEffect(() => { document.body.dataset.shell = rail ? "rail" : "center"; }, [rail]);
  useEffect(() => { document.body.dataset.online = online == null ? "" : online ? "1" : "0"; }, [online]);
  useEffect(() => {
    // ⚠️ `digitando` não é firula: o chat é um <input> dentro do HUD, e sem esta guarda escrever "amanha"
    // mutaria o jogo no meio da palavra. Modificador junto também sai fora (Ctrl+M é atalho do navegador).
    const digitando = e => { const t = e.target, n = t && t.tagName;
      return n === "INPUT" || n === "TEXTAREA" || n === "SELECT" || (t && t.isContentEditable); };
    const onKey = e => {
      // `defaultPrevented`: quem estava por baixo (o campo do chat) já gastou este Esc. O handler React do
      // <input> roda no #app, ou seja ANTES de qualquer listener de janela, então a marca já chegou aqui.
      if (e.code === "Escape" && !e.defaultPrevented && escape()) return e.preventDefault();
      if (e.code === "KeyM" && !e.ctrlKey && !e.metaKey && !e.altKey && !digitando(e)) {
        e.preventDefault(); toggleMute();
      }
      // ⚠️ O TAB mora AQUI e não no teclado do jogo, pelo mesmo motivo do KeyM ao lado: é atalho de UI, não
      // ação de jogo — não passa por `canAct`, não entra no INPUT e vale com o jogador morto. E o
      // `preventDefault` não é opcional: sem ele o navegador tabula pelos botões do HUD e o `keyup` pode
      // chegar em outro elemento, deixando o painel grudado.
      if (e.code === "Tab" && !digitando(e) && app.get().screen === "game") { e.preventDefault(); setRoster(true); }
    };
    const onUp = e => { if (e.code === "Tab") setRoster(false); };
    // ⚠️ O `blur` fecha o painel: Alt+Tab com ele aberto nunca entrega o `keyup`, e ele ficaria para sempre.
    const onBlur = () => setRoster(false);
    addEventListener("keydown", onKey); addEventListener("keyup", onUp); addEventListener("blur", onBlur);
    return () => { removeEventListener("keydown", onKey); removeEventListener("keyup", onUp); removeEventListener("blur", onBlur); };
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
    {/* ⚠️ NO PACOTE A TELA INICIAL E O CENÁRIO NÃO SÃO MONTADOS, e o ganho é o DOWNLOAD, não o tamanho do
        zip. `#cena` já era `display:none` no portal — mas `<img src>` em subárvore oculta é BAIXADO assim
        mesmo, e o logo ainda ia com `fetchPriority="high"`: MEDIDO, 217 KB (logo 68 + planetas 105 +
        lua 35 + míssil 8) disputando banda com o bundle e o handshake do WS, exatamente na janela que o
        Player Fit mede. Sem montar, nenhum `<img>` existe e nada é pedido.
        ⚠️ E os arquivos CONTINUAM no zip — conferido com `unzip -l` depois do `portal-pack.mjs`. O Rollup
        não dobra `SEM_MENU` através da fronteira de módulo para decidir tree-shaking de um componente,
        então não prometa aqui a poda que o `GoogleButton` consegue por outro caminho. Três deles nem
        poderiam sair: `planeta-*`/`lua` são a arte das skins de mascote (theme/faces.js). */}
    {SEM_MENU ? null : <Scene />}
    <Hud />
    {clarao ? <div id="morte-flash" key={clarao} onAnimationEnd={() => setClarao(0)} /> : null}
    {SEM_MENU ? null : <Entry on={screen === "entry"} />}
    <Lobby on={screen === "lobby"} />
      <Modes on={screen === "modes"} />
      <Party on={screen === "party"} />
    <Rank on={screen === "rank"} />
    <Profile on={screen === "profile"} />
    <Shop on={screen === "shop"} />
    <Prefs on={screen === "prefs"} />
    <Dead on={screen === "dead"} />
    <Round on={screen === "round"} />
    <Spectate on={screen === "spec"} />
    {/* A BARRA DE NAVEGAÇÃO É UMA SÓ, e mora dentro da CAIXA da tela (ver `Screen` em ui/bits.jsx): é uma
        barra do painel, não da janela. No desktop ela fica no rodapé do cartão central; no celular em pé a
        caixa É a folha de rodapé, então a barra continua colada embaixo, que é o certo nos dois casos. */}
    <AccountModal on={overlays.account} />
    <Pause on={overlays.pause} />
    <ReconnOverlay on={overlays.reconn} />
    <Offline />
    <PortalLogin />
    <Toast />
    <Roster on={overlays.tab} />
    <LevelUp />
  </>;
}

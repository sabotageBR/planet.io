// ── MENU DE PAUSA (Esc): sair, mexer no som e nos gráficos sem largar a partida ───────────────
// É OVERLAY, não tela, e a diferença não é de estilo: navegar para `prefs` durante o jogo faz o GameHost
// chamar `game.leave()` (a conexão CAI) e o Hud esconder o #hud inteiro. Aqui `screen` continua em "game".
//
// ⚠️ A partida NÃO pausa, e nem deve: é multijogador e o servidor é autoritativo — o planeta continua no
// mundo, sendo comido se estiver na hora errada. O que para é o COMANDO (ver `pausado` em game/index.js):
// sem isso o alvo continuaria seguindo o mouse por cima do modal, porque o ponteiro do jogo é lido na
// JANELA (ver o cabeçalho de input/Pointer.js) e nenhum overlay o impede de chegar. O nome "pausa" é o que
// o jogador chama isto; o que ele ganha é largar o controle sem largar a sala.
//
// As prefs saem da MESMA tabela da tela de Opções (`PREFS` + `PrefRow`), num subconjunto: o que alguém quer
// mexer no meio de uma partida é som, nitidez e movimento — não a tecla de dividir.
import React, { useMemo, useSyncExternalStore } from "react";
import { useStore, throttleStore } from "../state/store.js";
import { app } from "../state/app.js";
import { gameRef } from "../state/game.js";
import { setPause, leaveGame, flushPrefs, hostAct, toast } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { PREFS } from "./prefsTable.js";
import { PrefRow } from "./Prefs.jsx";
import { Nick } from "./bits.jsx";
import { linkConvite } from "../util/convite.js";

// as chaves que valem em partida, na ordem em que se procura por elas
const RAPIDAS = ["muted", "volume", "music", "musicVolume", "quality", "reduceMotion", "showNames", "showMinimap"];
const ITENS = RAPIDAS.map(k => PREFS.flatMap(g => g.items).find(it => it.key === k)).filter(Boolean);

const EMPTY = {}, EMPTY_STORE = { subscribe: () => () => {}, get: () => EMPTY };
export default function Pause({ on }) {
  const LB = useLabels(); const prefs = useStore(app, s => s.session.prefs);
  const room = useStore(app, s => s.room);
  // o painel do dono vem do motor (o servidor só o manda para quem É o dono), não do estado da UI
  const game = useStore(gameRef, s => s.game);
  const store = useMemo(() => (game && game.hudStore ? throttleStore(game.hudStore, 250) : EMPTY_STORE), [game]);
  const h = useSyncExternalStore(store.subscribe, store.get, store.get) || EMPTY;
  // fechar dá flush nas prefs: `setPref` persiste com 600 ms de debounce, e voltar ao jogo e fechar a aba
  // dentro desse tempo perderia a escolha sem nada na tela dizendo por quê.
  const fecha = () => { flushPrefs(); setPause(false); };
  return <div className={"overlay" + (on ? " on" : "")} id="s-pause"
    onClick={e => { if (e.target === e.currentTarget) fecha(); }}>
    {on ? <div className="card modal pause" role="dialog" aria-modal="true" aria-label={LB.pauseTitle}>
      <div className="modal-title">{LB.pauseTitle}</div>
      {h.host ? <HostPanel host={h.host} room={room} LB={LB} /> : null}
      <div className="pause-prefs">{ITENS.map(it => <PrefRow key={it.key} it={it} v={prefs[it.key]} pfx="pause-" />)}</div>
      <div className="modal-actions pause-actions">
        <button className="btn-secondary" id="pause-exit" data-go="lobby" onClick={() => { flushPrefs(); leaveGame("lobby"); }}>{LB.exitMatch}</button>
        <button className="btn-primary" id="pause-resume" onClick={fecha} autoFocus>{LB.resume}</button>
      </div>
    </div> : null}</div>;
}

/**
 * O PAINEL DO DONO, dentro do mesmo menu. Não é um segundo overlay de propósito: o dono já vem aqui para
 * ajustar som ou sair, e um painel próprio no HUD teria de resolver de novo tudo o que este já resolveu —
 * o `#hud` some fora de `screen==="game"`, e um modal de tela cheia não impede o planeta de seguir o mouse.
 * ⚠️ O identificador de cada linha é o `pid`, um handle OPACO por sala. Nunca o slot (recicla, e o painel
 * expulsaria a pessoa errada) e nunca o sessionId (é metade da credencial de `resume`).
 */
function HostPanel({ host, room, LB }) {
  const outros = (host.roster || []).filter(l => !l.host);
  const convite = () => { const url = linkConvite("sala", room || "");
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast(LB.hostInvite), () => toast(url, 4000));
    else toast(url, 4000); };
  return <section className="pause-host">
    <div className="ph">{LB.hostPanel} {room ? <button className="btn-mini" onClick={convite}>{room} ⧉</button> : null}</div>
    {outros.length
      ? <ul className="host-list">{outros.map(l => <li key={l.pid}>
          <Nick p={l} />
          <span className="host-acts">
            <button className="btn-mini" onClick={() => hostAct("kick", l.pid)}>{LB.hostKick}</button>
            <button className="btn-mini danger" onClick={() => hostAct("ban", l.pid)}>{LB.hostBan}</button>
          </span></li>)}</ul>
      : <span className="hint">{LB.hostNobody}</span>}
    {host.bans && host.bans.length ? <span className="hint">{LB.hostBanned}: {host.bans.map(b => b.nick).join(", ")}</span> : null}
  </section>;
}

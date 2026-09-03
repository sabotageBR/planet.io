// ── QUEM ESTÁ NA SALA (o painel do TAB) ──────────────────────────────────────
// Segurar TAB abre; soltar fecha. E o JOGO CONTINUA VIVO por baixo: o planeta segue o mouse, a rodada
// corre, o gás fecha. Isso é o ponto inteiro do componente e é por isso que ele NÃO passa por
// `setPause` — quem congela o planeta é `game.setPaused`, que faz o `enviarInput` mandar o alvo em cima
// do próprio centróide (game/index.js). Aqui é overlay puro de leitura.
//
// ⚠️ NÃO CUSTA UM BYTE DE PROTOCOLO. O `MSG.PLAYERS` já traz a sala INTEIRA fora da AOI (slot, nome,
// skin, nível, país, equipe, morto) e o `MSG.LEADERBOARD` traz a massa de todos os vivos a 2 Hz — o
// mesmo par que o placar do HUD já cruza. O que faltava era montar a lista com os MORTOS junto, e isso
// é `view.players`, não o placar.
//
// ⚠️ `anonBots` sai de graça: no Battle Royale o servidor não manda `PLAYER_FLAG.BOT`, então `isBot` já
// chega falso e o ◆ não aparece — sem uma linha aqui. NÃO inventar uma segunda fonte para isso.
import React, { useMemo, useSyncExternalStore } from "react";
import { useStore, throttleStore } from "../state/store.js";
import { app } from "../state/app.js";
import { gameRef } from "../state/game.js";
import { useLabels } from "../hooks/useTheme.js";
import { Nick } from "./bits.jsx";
import { fmt } from "./format.js";

const EMPTY = {}, EMPTY_STORE = { get: () => EMPTY, subscribe: () => () => {} };

export default function Roster({ on }) {
  const LB = useLabels();
  const room = useStore(app, s => s.room);
  const game = useStore(gameRef, s => s.game);
  // 250 ms: a lista muda quando alguém entra, morre ou passa alguém — nada disso pede 8 Hz, e o painel
  // fica aberto por segundos. É o mesmo intervalo do painel de pausa.
  const store = useMemo(() => (game && game.hudStore ? throttleStore(game.hudStore, 250) : EMPTY_STORE), [game]);
  const h = useSyncExternalStore(store.subscribe, store.get, store.get) || EMPTY;
  if (!on) return null;
  const linhas = h.roster || [];
  const vivos = linhas.filter(l => !l.dead).length;
  return <div className="overlay on" id="s-roster" aria-hidden="true">
    <div className="card roster">
      <div className="modal-title">{LB.rosterTitle}{room ? <i className="rs-sala">{room}</i> : null}</div>
      <div className="rs-conta">{vivos}/{linhas.length}</div>
      <div className="rs-lista">{linhas.map((l, i) => <div key={l.slot}
        className={"rs-row" + (l.me ? " me" : "") + (l.dead ? " morto" : "") + (l.ally ? " ally" : "")}>
        <span className="rs-pos">{l.dead ? "☠" : i + 1}</span>
        <Nick p={l} />
        <em className="rs-massa">{l.dead ? "—" : fmt(l.mass)}</em>
      </div>)}</div>
    </div>
  </div>;
}

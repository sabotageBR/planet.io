// ── ASSISTIR A UMA SALA EM ANDAMENTO ─────────────────────────────────────────
// O jogo só tinha espectador-por-MORTE. A máquina toda já existia — `{t:"spectate"}` escolhe o alvo, a AOI
// da sessão o segue (`net/snapshot.js`) e o `#hud.spec` já é o HUD de quem assiste —, e o que faltava era a
// porta: `acceptsJoin()` recusa o Battle Royale em andamento com `'started'`, que é exatamente a partida que
// alguém quer ver. Quem abre a porta é `Room.acceptsSpectator`/`joinSpec`, no servidor.
//
// ⚠️ ESTA TELA É UMA BARRA, não um cartão. O ponto inteiro de assistir é VER a sala, e um painel no meio da
// tela taparia o que se veio olhar — é a mesma razão pela qual o convite de BR não é um modal. Ela mora no
// rodapé, com o que se usa: de quem é a câmera (‹ ›), o mapa para escolher outro, e sair.
//
// ⚠️ O ESPECTADOR NUNCA VIRA JOGADOR SOZINHO. Nem quando abre vaga, nem no fim da rodada — sair é decisão
// dele, e é isso que dispensa promover uma sessão sem corpo a jogador no meio da partida (e a corrida pela
// vaga que viria junto). Quem quer jogar clica em SAIR e entra pela porta de sempre.
import React, { useEffect, useMemo } from "react";
import { useSyncExternalStore } from "react";
import { leaveGame } from "../state/actions.js";
import { gameRef } from "../state/game.js";
import { useStore, throttleStore } from "../state/store.js";
import { useLabels } from "../hooks/useTheme.js";

const EMPTY = {}, EMPTY_STORE = { subscribe: () => () => {}, get: () => EMPTY };

export default function Spectate({ on }) {
  const LB = useLabels();
  const game = useStore(gameRef, s => s.game);
  // O mesmo throttle da tela de morte: o HUD emite a 60 Hz e esta barra tem cinco campos.
  const store = useMemo(() => (game && game.hudStore ? throttleStore(game.hudStore, 200) : EMPTY_STORE), [game]);
  const h = useSyncExternalStore(store.subscribe, store.get, store.get) || {};
  const spec = h.spec, mapa = h.map || "";
  const trocar = dir => { if (game && game.spectate) game.spectate({ dir }); };
  const verMapa = modo => { if (game && game.toggleMap) game.toggleMap(modo); };
  // As setas do teclado valem aqui pelo mesmo motivo que valem na tela de morte, e com as mesmas DUAS
  // guardas: a de campo de texto (quem assiste continua com o chat aberto) e a de `e.repeat` — segurar a
  // seta estourava o balde de JSON e encerrava a conexão. Ver o comentário em ui/Dead.jsx.
  useEffect(() => {
    if (!on || !game || !game.spectate) return;
    const kd = e => { if (e.repeat) return; const a = document.activeElement; if (a && /INPUT|TEXTAREA/.test(a.tagName)) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); trocar(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); trocar(1); }
      else if (e.key === "m" || e.key === "M") { e.preventDefault(); verMapa("map"); }
      else if (e.key === "l" || e.key === "L") { e.preventDefault(); verMapa("live"); }
      else if (e.key === "Escape" && game.showMap && mapa) { e.preventDefault(); game.showMap(""); } };
    addEventListener("keydown", kd); return () => removeEventListener("keydown", kd);
  }, [on, game, mapa]);
  // Saiu da tela: fecha o mapa, senão ele volta aberto na próxima vez.
  useEffect(() => { if (!on && game && game.showMap) game.showMap(""); }, [on, game]);
  if (!on) return null;
  return <div id="s-spec" className="spec-bar" role="region" aria-label={LB.watchTitle}>
    <div className="sb-quem">
      <button className="spec-arrow" onClick={() => trocar(-1)} aria-label={LB.specPrev}>‹</button>
      <div className="spec-who"><i>{LB.watching}</i><b>{(spec && spec.name) || "—"}</b></div>
      <button className="spec-arrow" onClick={() => trocar(1)} aria-label={LB.specNext}>›</button>
    </div>
    <div className="sb-acoes">
      <button className={"btn-secondary" + (mapa === "map" ? " on" : "")} onClick={() => verMapa("map")}>{mapa === "map" ? LB.mapClose : LB.mapOpen}</button>
      <button className={"btn-secondary" + (mapa === "live" ? " on" : "")} onClick={() => verMapa("live")}>{mapa === "live" ? LB.liveClose : LB.liveOpen}</button>
      <button className="btn-primary" data-go="lobby" onClick={() => leaveGame("lobby")}>{LB.watchLeave}</button>
    </div>
  </div>;
}

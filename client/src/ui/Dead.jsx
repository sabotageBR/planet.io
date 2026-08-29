import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import { useStore, throttleStore } from "../state/store.js";
import { app } from "../state/app.js";
import { gameRef } from "../state/game.js";
import { play, leaveGame } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { fmt, fmtTime, ord } from "./format.js";
import { sfx } from "../audio/index.js";

const EMPTY_SPEC = { get: () => ({ spec: null }), subscribe: () => () => {} };

export default function Dead({ on }) {
  const LB = useLabels();
  const m = useStore(app, s => s.lastMatch), r = useStore(app, s => s.rewards), pending = useStore(app, s => s.rewardsPending), before = useStore(app, s => s.session.dayRank);
  const after = r && r.rank ? r.rank.day : null;
  // de quem é a cena que continua rodando atrás da tela: o servidor escolhe, mas o morto pode trocar
  const game = useStore(gameRef, s => s.game);
  const store = useMemo(() => (game && game.hudStore ? throttleStore(game.hudStore, 200) : EMPTY_SPEC), [game]);
  const h = useSyncExternalStore(store.subscribe, store.get, store.get) || {};
  const spec = h.spec, mapa = !!h.map;
  const trocar = dir => { if (game && game.spectate) game.spectate({ dir }); };
  const verMapa = () => { if (game && game.toggleMap) game.toggleMap(); };
  useEffect(() => {   // as setas do teclado também trocam (o motor ignora tudo com foco num campo de texto)
    if (!on || !game || !game.spectate) return;
    const kd = e => { const a = document.activeElement; if (a && /INPUT|TEXTAREA/.test(a.tagName)) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); trocar(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); trocar(1); }
      else if (e.key === "m" || e.key === "M") { e.preventDefault(); verMapa(); }
      // Esc fecha o mapa em vez de sair da tela: aqui ele é o "voltar" mais próximo
      else if (e.key === "Escape" && game.showMap) { e.preventDefault(); game.showMap(false); } };
    addEventListener("keydown", kd); return () => removeEventListener("keydown", kd);
  }, [on, game]);
  useEffect(() => { if (!on && game && game.showMap) game.showMap(false); }, [on, game]);   // saiu da tela, fecha o mapa
  useEffect(() => { if (on) sfx("deadScreen"); }, [on]);   // a tela de KABOOM tem som próprio (o `death` é o do mundo, lá atrás)
  return <div className={"screen" + (on ? " on" : "")} id="s-dead">{on && m ? <div className="card dead-card">
    <div className="dead-icon">{LB.deadIcon}</div>
    <div className="dead-title">{LB.dead}</div>
    <div className="dead-sub">{LB.deadSub}</div>
    {m.byZone
      ? <div className="dead-by zone"><b id="d-by">{LB.deadByZone}</b></div>
      : <div className="dead-by"><span id="d-by-lab">{m.byHole ? LB.suckedBy : LB.eatenBy}</span><b id="d-by">{m.by || "—"}</b></div>}
    {m.placement ? <div className="dead-place"><b>{ord(m.placement)}</b><i>{LB.placementWord} {m.players ? `de ${m.players}` : ""}</i></div> : null}
    <div className="dead-stats">
      <div><b id="d-mass">{fmt(m.maxMass)}</b><i>{LB.massLabel}</i></div>
      <div><b id="d-kills">{m.kills || 0}</b><i>{LB.killsWord}</i></div>
      <div><b id="d-time">{fmtTime(m.durationS)}</b><i>{LB.timeWord}</i></div>
      <div><b id="d-coins" className={pending ? "pending" : ""}>{r ? "+" + (r.coinsEarned || 0) : pending ? LB.saving : "—"}</b><i>{LB.coinsEarned}</i></div>
    </div>
    <div className="dead-rank"><span>{LB.rankWord}</span><b id="d-rank">
      {pending && !r ? LB.saving : after != null ? (before != null && before !== after ? <>{ord(before)} <span className="arrow">→</span> {ord(after)}</> : ord(after)) : before != null ? ord(before) : (r && r.saved === false ? LB.noRank : "—")}</b></div>
    {spec && spec.slot >= 0 ? <div className="dead-spec">
      <button className="spec-arrow" onClick={() => trocar(-1)} aria-label={LB.specPrev}>‹</button>
      <div className="spec-who"><i>{LB.watching}</i><b>{spec.name || "—"}</b></div>
      <button className="spec-arrow" onClick={() => trocar(1)} aria-label={LB.specNext}>›</button>
    </div> : null}
    {/* o mapa é o radar ampliado: mostra TODOS os vivos (vêm do placar, não da AOI) e clicar num deles
        troca a câmera — o mesmo `spectate` das setas, escolhido no lugar em vez de um a um */}
    <button className={"btn-secondary dead-map" + (mapa ? " on" : "")} onClick={verMapa}>{mapa ? LB.mapClose : LB.mapOpen}</button>
    <div className="dead-actions"><button className="btn-primary" data-go="play" onClick={() => play({ room: m.room })}>{LB.respawn}</button><button className="btn-secondary" data-go="lobby" onClick={() => leaveGame("lobby")}>{LB.toLobby}</button></div>
  </div> : null}</div>;
}

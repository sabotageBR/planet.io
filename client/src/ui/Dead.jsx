import React, { useEffect } from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { play, leaveGame } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { fmt, fmtTime, ord } from "./format.js";
import { sfx } from "../audio/index.js";

export default function Dead({ on }) {
  const LB = useLabels();
  const m = useStore(app, s => s.lastMatch), r = useStore(app, s => s.rewards), pending = useStore(app, s => s.rewardsPending), before = useStore(app, s => s.session.dayRank);
  const after = r && r.rank ? r.rank.day : null;
  useEffect(() => { if (on) sfx("deadScreen"); }, [on]);   // a tela de KABOOM tem som próprio (o `death` é o do mundo, lá atrás)
  return <div className={"screen" + (on ? " on" : "")} id="s-dead">{on && m ? <div className="card dead-card">
    <div className="dead-icon">{LB.deadIcon}</div>
    <div className="dead-title">{LB.dead}</div>
    <div className="dead-sub">{LB.deadSub}</div>
    <div className="dead-by"><span id="d-by-lab">{m.byHole ? LB.suckedBy : LB.eatenBy}</span><b id="d-by">{m.by || "—"}</b></div>
    <div className="dead-stats">
      <div><b id="d-mass">{fmt(m.maxMass)}</b><i>{LB.massLabel}</i></div>
      <div><b id="d-kills">{m.kills || 0}</b><i>{LB.killsWord}</i></div>
      <div><b id="d-time">{fmtTime(m.durationS)}</b><i>{LB.timeWord}</i></div>
      <div><b id="d-coins" className={pending ? "pending" : ""}>{r ? "+" + (r.coinsEarned || 0) : pending ? LB.saving : "—"}</b><i>{LB.coinsEarned}</i></div>
    </div>
    <div className="dead-rank"><span>{LB.rankWord}</span><b id="d-rank">
      {pending && !r ? LB.saving : after != null ? (before != null && before !== after ? <>{ord(before)} <span className="arrow">→</span> {ord(after)}</> : ord(after)) : before != null ? ord(before) : (r && r.saved === false ? LB.noRank : "—")}</b></div>
    <div className="dead-actions"><button className="btn-primary" data-go="play" onClick={() => play({ room: m.room })}>{LB.respawn}</button><button className="btn-secondary" data-go="lobby" onClick={() => leaveGame("lobby")}>{LB.toLobby}</button></div>
  </div> : null}</div>;
}

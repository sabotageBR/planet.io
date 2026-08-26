// Fim do mundo: placar da sala, campeão e contagem para a próxima (entra sozinho ao zerar).
import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { play, leaveGame } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { fmt } from "./format.js";

export default function Round({ on }) {
  const LB = useLabels();
  const r = useStore(app, s => s.roundResult), rew = useStore(app, s => s.rewards), pending = useStore(app, s => s.rewardsPending);
  const [left, setLeft] = useState(0), fired = useRef(false);
  useEffect(() => {
    if (!on || !r) return;
    fired.current = false;
    const end = (r.at || Date.now()) + (r.nextInMs || 15000);
    const tick = () => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000)); setLeft(s);
      if (s <= 0 && !fired.current) { fired.current = true; play({}); }
    };
    tick(); const t = setInterval(tick, 250); return () => clearInterval(t);
  }, [on, r]);
  if (!on || !r) return <div className={"screen" + (on ? " on" : "")} id="s-round" />;
  const champ = r.champion, mine = r.mySlot;
  return <div className="screen on" id="s-round"><div className="card dead-card">
    <div className="dead-icon">{LB.roundIcon}</div>
    <div className="dead-title">{LB.roundTitle}</div>
    <div className="dead-sub">{LB.roundSub}</div>
    <div className="dead-by"><span>{LB.champion}</span><b>{champ ? champ.name : "—"}</b></div>
    <div className="dead-stats">
      <div><b>{champ ? fmt(champ.mass) : "—"}</b><i>{LB.massLabel}</i></div>
      <div><b>{r.board.length}</b><i>{LB.playersWord}</i></div>
      <div><b>{left}s</b><i>{LB.nextRoom}</i></div>
      <div><b className={pending ? "pending" : ""}>{rew ? "+" + (rew.coinsEarned || 0) : pending ? LB.saving : "—"}</b><i>{LB.coinsEarned}</i></div>
    </div>
    <table>
      <thead><tr><th>{LB.posWord}</th><th>{LB.youLabel}</th><th className="num">{LB.massLabel}</th></tr></thead>
      <tbody>{r.board.map((b, i) => <tr key={b.slot} className={b.slot === mine ? "mine" : ""}>
        <td>{i + 1}</td>
        <td>{b.name}{b.isBot ? <> <i className="bot">{LB.botTag}</i></> : null}{b.registered ? <> <i className="reg">{LB.regTag}</i></> : null}</td>
        <td className="num">{fmt(b.mass)}</td>
      </tr>)}</tbody>
    </table>
    <div className="dead-actions">
      <button className="btn-primary" data-go="play" onClick={() => { fired.current = true; play({}); }}>{LB.enterNow}</button>
      <button className="btn-secondary" data-go="lobby" onClick={() => { fired.current = true; leaveGame("lobby"); }}>{LB.toLobby}</button>
    </div>
  </div></div>;
}

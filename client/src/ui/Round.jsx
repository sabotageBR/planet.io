// BIG CRUNCH: pódio dos 3 primeiros, placar do resto e contagem para a próxima sala (entra sozinho ao zerar).
import React, { useEffect, useRef, useState } from "react";
import { skinById } from "@planet/shared";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { play, leaveGame } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import SkinPreview from "./SkinPreview.jsx";
import { fmt } from "./format.js";
import { sfx } from "../audio/index.js";

const ORDER = [1, 0, 2];   // 2º | 1º | 3º
export default function Round({ on }) {
  const LB = useLabels();
  const r = useStore(app, s => s.roundResult), rew = useStore(app, s => s.rewards), pending = useStore(app, s => s.rewardsPending);
  const [left, setLeft] = useState(0), fired = useRef(false);
  useEffect(() => { if (on && r) sfx("podium"); }, [on, r]);   // pódio: três notas subindo
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
  const board = r.board || [], mine = r.mySlot, rest = board.slice(3), places = LB.places || ["1º", "2º", "3º"];
  return <div className="screen on" id="s-round"><div className="card dead-card">
    <div className="dead-icon">{LB.roundIcon}</div>
    <div className="dead-title">{LB.roundTitle}</div>
    <div className="dead-sub">{LB.roundSub}</div>
    <div className="podium">{ORDER.map(i => { const b = board[i];
      return <div key={i} className={"step p" + (i + 1) + (b ? "" : " empty") + (b && b.slot === mine ? " me" : "")}>
        <SkinPreview skin={skinById(b ? b.skinId : 0)} r={i === 0 ? 32 : 26} size={112} className="" />
        <b>{b ? b.name : "—"}</b>
        <i>{b ? fmt(b.mass) : "—"}</i>
        <div className="base">{places[i]}</div>
      </div>; })}</div>
    <div className="dead-stats">
      <div><b>{board.length}</b><i>{LB.playersWord}</i></div>
      <div><b>{left}s</b><i>{LB.nextRoom}</i></div>
      <div><b className={pending ? "pending" : ""}>{rew ? "+" + (rew.coinsEarned || 0) : pending ? LB.saving : "—"}</b><i>{LB.coinsEarned}</i></div>
    </div>
    {rest.length ? <table>
      <thead><tr><th>{LB.posWord}</th><th>{LB.youLabel}</th><th className="num">{LB.massLabel}</th></tr></thead>
      <tbody>{rest.map((b, i) => <tr key={b.slot} className={b.slot === mine ? "mine" : ""}>
        <td>{i + 4}</td>
        <td>{b.name}{b.isBot ? <> <i className="bot">{LB.botTag}</i></> : null}{b.registered ? <> <i className="reg">{LB.regTag}</i></> : null}</td>
        <td className="num">{fmt(b.mass)}</td>
      </tr>)}</tbody>
    </table> : null}
    <div className="dead-actions">
      <button className="btn-primary" data-go="play" onClick={() => { fired.current = true; play({}); }}>{LB.enterNow}</button>
      <button className="btn-secondary" data-go="lobby" onClick={() => { fired.current = true; leaveGame("lobby"); }}>{LB.toLobby}</button>
    </div>
  </div></div>;
}

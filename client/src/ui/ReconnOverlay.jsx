import React from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { sairDaPartida } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";

export default function ReconnOverlay({ on }) {
  const LB = useLabels(); const n = useStore(app, s => s.reconnAttempt);
  return <div className={"overlay" + (on ? " on" : "")} id="s-reconn">{on ? <div className="card modal reconn" role="alertdialog" aria-live="assertive">
    <div className="spinner"></div>
    <div className="modal-title rc-title">{LB.reconnTitle}</div>
    <div className="rc-sub" id="rc-sub">{LB.reconnSub.replace("{n}", String(n || 1))}</div>
    <button className="btn-secondary" data-go="lobby" onClick={sairDaPartida}>{LB.toLobby}</button>
  </div> : null}</div>;
}

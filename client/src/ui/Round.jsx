// BIG CRUNCH: pódio dos 3 primeiros, placar do resto e contagem para a próxima sala (entra sozinho ao zerar).
import React, { useEffect, useRef, useState } from "react";
import { skinById } from "@warspace/shared";
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
  const d = r.destaques || null;
  return <div className="screen on" id="s-round"><div className="card dead-card">
    <div className="dead-icon">{LB.roundIcon}</div>
    <div className="dead-title">{r.reason === "lastAlive" ? LB.lastAliveTitle : LB.roundTitle}</div>
    <div className="dead-sub">{r.reason === "lastAlive"
      ? (r.champTeam != null ? `${LB.champTeam} ${r.champTeam + 1}` : (r.champion ? r.champion.name : LB.roundSub))
      : LB.roundSub}</div>
    <div className="podium">{ORDER.map(i => { const b = board[i];
      return <div key={i} className={"step p" + (i + 1) + (b ? "" : " empty") + (b && b.slot === mine ? " me" : "")}>
        <SkinPreview skin={skinById(b ? b.skinId : 0)} r={i === 0 ? 32 : 26} size={112} className="" />
        <b>{b ? b.name : "—"}</b>
        <i>{b ? fmt(b.mass) : "—"}</i>
        <div className="base">{places[i]}</div>
      </div>; })}</div>
    {/* Os quatro destaques da SALA, calculados no servidor sobre o roster inteiro — inclusive quem já tinha
        saído. "Maior K/D" só considera quem passou de ROUND.AWARD_MIN_KILLS abates: numa rodada de 30 min
        quase ninguém passa de cinco, e sem o piso o prêmio seria sempre de quem fez um e não morreu. */}
    {d ? <div className="awards">
      {[["champion", "🏆", d.campeao, b => fmt(b.mass)],
        ["food", "🍬", d.glutao, b => fmt(b.food)],
        ["kills", "⚔️", d.carrasco, b => fmt(b.kills)],
        ["kd", "🎯", d.letal, b => (b.kd || 0).toFixed(2)]].map(([k, ico, b, val]) =>
        <div key={k} className={"award" + (b && b.slot === mine ? " me" : "") + (b ? "" : " empty")}>
          <i className="aw-ico">{ico}</i>
          <span className="aw-k">{LB.awards[k]}</span>
          {b ? <SkinPreview skin={skinById(b.skinId)} r={14} size={56} className="aw-skin" /> : null}
          <b className="aw-name">{b ? b.name : "—"}</b>
          <em className="aw-val">{b ? val(b) : ""}</em>
        </div>)}
    </div> : null}
    <div className="dead-stats">
      <div><b>{r.total || board.length}</b><i>{LB.playersWord}</i></div>
      <div><b>{left}s</b><i>{LB.nextRoom}</i></div>
      <div><b className={pending ? "pending" : ""}>{rew ? "+" + (rew.coinsEarned || 0) : pending ? LB.saving : "—"}</b><i>{LB.coinsEarned}</i></div>
    </div>
    {rest.length ? <table>
      <thead><tr><th>{LB.posWord}</th><th>{LB.youLabel}</th><th className="num">{LB.massLabel}</th>
        <th className="num c-food">{LB.stats.foodEaten}</th><th className="num c-kills">{LB.stats.kills}</th><th className="num c-kd">{LB.stats.kd}</th></tr></thead>
      <tbody>{rest.map((b, i) => <tr key={b.key || b.slot} className={(b.slot === mine ? "mine" : "") + (b.left ? " left" : "")}>
        <td>{i + 4}</td>
        <td>{b.level > 0 ? <i className="lvl">{b.level}</i> : null}{b.name}{b.isBot ? <> <i className="bot">{LB.botTag}</i></> : null}{b.registered ? <> <i className="reg">{LB.regTag}</i></> : null}
          {/* quem saiu no meio continua no placar: jogou a rodada, e o nome fica */}
          {b.left ? <> <i className="left-tag">{LB.leftTag}</i></> : null}</td>
        <td className="num">{fmt(b.mass)}</td>
        <td className="num c-food">{fmt(b.food || 0)}</td>
        <td className="num c-kills">{fmt(b.kills || 0)}</td>
        <td className="num c-kd">{(b.kd || 0).toFixed(2)}</td>
      </tr>)}</tbody>
    </table> : null}
    <div className="dead-actions">
      <button className="btn-primary" data-go="play" onClick={() => { fired.current = true; play({}); }}>{LB.enterNow}</button>
      <button className="btn-secondary" data-go="lobby" onClick={() => { fired.current = true; leaveGame("lobby"); }}>{LB.toLobby}</button>
    </div>
  </div></div>;
}

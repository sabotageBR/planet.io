import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { useLabels } from "../hooks/useTheme.js";
import { Nav, ScreenHeader, Screen } from "./bits.jsx";
import { fmt, ord } from "./format.js";

const PERIODS = ["all", "week", "day"], METRICS = ["score", "mass", "kills"];
export default function Rank({ on }) {
  return <Screen id="rank" on={on} className="rank-wrap">{on ? <Body /> : null}</Screen>;
}
function Body() {
  const LB = useLabels(); const user = useStore(app, s => s.session.user);
  const [period, setPeriod] = useState("all"), [by, setBy] = useState("score");
  const [data, setData] = useState({ rows: [], me: null, loading: true });
  useEffect(() => { let alive = true; setData(d => ({ ...d, loading: true }));
    api.ranking(period, by, 50).then(r => { if (alive) setData({ rows: r.rows || [], me: r.me || null, loading: false }); }).catch(() => { if (alive) setData({ rows: [], me: null, loading: false }); });
    return () => { alive = false; }; }, [period, by]);
  const myId = user && user.id;
  return <>
    <Nav cur="rank" /><ScreenHeader title={LB.rankTitle} />
    <div className="toggles">
      <div className="seg" id="rk-period">{PERIODS.map(p => <button key={p} data-p={p} className={p === period ? "on" : ""} onClick={() => setPeriod(p)}>{LB.periods[p]}</button>)}</div>
      <div className="seg" id="rk-metric">{METRICS.map(m => <button key={m} data-m={m} className={m === by ? "on" : ""} onClick={() => setBy(m)}>{LB.metrics[m]}</button>)}</div>
    </div>
    <div className="card rank-table"><table id="rk-table">
      <thead><tr><th className="c-rank">#</th><th className="c-nick">{LB.youLabel}</th><th className="c-val num" id="rk-valh">{LB.metrics[by]}</th><th className="c-delta num">Δ</th></tr></thead>
      <tbody>{data.rows.map(r => { const me = r.me || (myId != null && r.userId === myId), d = r.delta || 0;
        return <tr key={r.userId || r.rank} className={(me ? "me" : "") + (r.rank <= 3 ? ` top top${r.rank}` : "")}>
          <td className="c-rank">{r.rank}</td><td className="c-nick">{r.nick}{r.registered ? <> <i className="reg">{LB.regTag}</i></> : null}</td>
          <td className="c-val num">{fmt(r.value)}</td><td className={"c-delta num" + (d > 0 ? " up" : d < 0 ? " down" : "")}>{d > 0 ? "▲" + d : d < 0 ? "▼" + (-d) : "·"}</td></tr>; })}
        {!data.rows.length ? <tr className="empty"><td colSpan={4} className="dim">{data.loading ? LB.loading : LB.noRank}</td></tr> : null}</tbody>
    </table></div>
    <div className="card rank-me" id="rk-me"><span>{LB.you}</span><b>{data.me && data.me.rank != null ? ord(data.me.rank) : LB.noRank}</b><span>{data.me ? `${fmt(data.me.value)} ${LB.metrics[by].toLowerCase()}` : ""}</span></div>
  </>;
}

import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { useLabels } from "../hooks/useTheme.js";
import { ScreenHeader, Screen } from "./bits.jsx";
import { fmt, ord } from "./format.js";
import { flagOf, countryName, kdOf } from "@warspace/shared";

const PERIODS = ["all", "week", "day"], METRICS = ["xp", "score", "mass", "kills", "food", "kd"];
export default function Rank({ on }) {
  return <Screen id="rank" on={on} className="rank-wrap">{on ? <Body /> : null}</Screen>;
}
function Body() {
  const LB = useLabels(); const user = useStore(app, s => s.session.user);
  const [period, setPeriod] = useState("all"), [by, setBy] = useState("xp");
  const pais = user && user.country;
  const [scope, setScope] = useState("global");
  const country = scope === "country" ? pais : null;
  const [data, setData] = useState({ rows: [], me: null, loading: true });
  useEffect(() => { let alive = true; setData(d => ({ ...d, loading: true }));
    api.ranking(period, by, 50, country).then(r => { if (alive) setData({ rows: r.rows || [], me: r.me || null, loading: false }); }).catch(() => { if (alive) setData({ rows: [], me: null, loading: false }); });
    return () => { alive = false; }; }, [period, by, country]);
  // sem país escolhido não dá para entrar no recorte regional — o botão fica desabilitado com a dica
  useEffect(() => { if (scope === "country" && !pais) setScope("global"); }, [scope, pais]);
  const myId = user && user.id, convidado = !!user && user.kind !== "registered";
  return <>
    <ScreenHeader title={LB.rankTitle} />
    <div className="toggles">
      <div className="seg" id="rk-period">{PERIODS.map(p => <button key={p} data-p={p} className={p === period ? "on" : ""} onClick={() => setPeriod(p)}>{LB.periods[p]}</button>)}</div>
      <div className="seg" id="rk-metric">{METRICS.map(m => <button key={m} data-m={m} className={m === by ? "on" : ""} onClick={() => setBy(m)}>{LB.metrics[m]}</button>)}</div>
      <div className="seg" id="rk-scope">
        <button className={scope === "global" ? "on" : ""} onClick={() => setScope("global")}>{LB.scopeGlobal}</button>
        <button className={scope === "country" ? "on" : ""} disabled={!pais} title={pais ? countryName(pais) : LB.noCountry}
          onClick={() => pais && setScope("country")}>{pais ? `${flagOf(pais)} ${countryName(pais)}` : LB.scopeCountry}</button>
      </div>
    </div>
    <div className="card rank-table"><table id="rk-table">
      {/* A coluna Δ saiu: ela lia `r.delta`, que o servidor NUNCA mandou — era um "·" fixo ocupando espaço
          que agora vale mais como nível, partículas e K/D, que é o que o jogador pediu para ver. */}
      <thead><tr><th className="c-rank">#</th><th className="c-nick">{LB.youLabel}</th>
        <th className="c-lvl num">{LB.stats.level}</th><th className="c-food num">{LB.stats.foodEaten}</th>
        <th className="c-kills num">{LB.stats.kills}</th><th className="c-kd num">{LB.stats.kd}</th>
        <th className="c-val num" id="rk-valh">{LB.metrics[by]}</th></tr></thead>
      <tbody>{data.rows.map(r => { const me = r.me || (myId != null && r.userId === myId);
        return <tr key={r.userId || r.rank} className={(me ? "me" : "") + (r.rank <= 3 ? ` top top${r.rank}` : "")}>
          <td className="c-rank">{r.rank}</td>
          <td className="c-nick">{r.country ? <i className="flag" title={countryName(r.country)}>{flagOf(r.country)}</i> : null}{r.nick}</td>
          <td className="c-lvl num">{r.level}</td><td className="c-food num">{fmt(r.foodEaten)}</td>
          <td className="c-kills num">{fmt(r.kills)}</td><td className="c-kd num">{kdOf(r.kills, r.deaths).toFixed(2)}</td>
          <td className="c-val num">{by === "kd" ? Number(r.value).toFixed(2) : fmt(r.value)}</td></tr>; })}
        {!data.rows.length ? <tr className="empty"><td colSpan={7} className="dim">{data.loading ? LB.loading : LB.noRank}</td></tr> : null}</tbody>
    </table></div>
    {/* O ranking é só de CONTA (ver repos/ranking.js): o convidado escolhe outro nick a cada entrada, e um
        pódio feito disso não diz de quem é a marca. Ele não perde nada — o `user_stats` continua somando
        por `user_id` e o histórico inteiro aparece no dia em que ele registrar —, mas precisa LER isso
        aqui, senão "sem posição" parece defeito. */}
    {convidado
      ? <div className="card rank-me guest" id="rk-me"><span>{LB.you}</span><b>{LB.noRank}</b><span className="hint">{LB.rankGuest}</span></div>
      : <div className="card rank-me" id="rk-me"><span>{LB.you}</span><b>{data.me && data.me.rank != null ? ord(data.me.rank) : LB.noRank}</b><span>{data.me ? `${by === "kd" ? Number(data.me.value).toFixed(2) : fmt(data.me.value)} ${LB.metrics[by].toLowerCase()}` : ""}</span></div>}
  </>;
}

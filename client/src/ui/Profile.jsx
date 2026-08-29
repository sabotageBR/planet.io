import React, { useEffect, useState } from "react";
import { skinById, ACHIEVEMENTS, ACHIEVEMENT_GOALS, COUNTRIES, POPULAR, flagOf, countryName } from "@planet/shared";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { openAccount, loadHistory, logout, setCountry } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { Nav, ScreenHeader, Screen, Select } from "./bits.jsx";
import SkinPreview from "./SkinPreview.jsx";
import { fmt, fmtTime, fmtDate, ord } from "./format.js";

export default function Profile({ on }) {
  return <Screen id="profile" on={on} className="profile-wrap">{on ? <Body /> : null}</Screen>;
}
function Body() {
  const LB = useLabels(); const session = useStore(app, s => s.session);
  const user = session.user || {}, st = session.stats, sk = skinById(user.equippedSkin ?? 0), guest = user.kind !== "registered";
  const [hist, setHist] = useState(null);
  useEffect(() => { let alive = true; loadHistory(20).then(m => { if (alive) setHist(m); }); return () => { alive = false; }; }, [user.id]);
  // `foodEaten` era gravado no banco desde sempre e nunca chegou à tela — agora chega, junto com mortes e K/D.
  const stats = [["games", st.games], ["kills", st.kills], ["deaths", st.deaths], ["kd", (st.kd || 0).toFixed(2)],
    ["foodEaten", fmt(st.foodEaten)], ["bestScore", fmt(st.bestScore)], ["bestMass", fmt(st.bestMass)],
    ["playTime", fmtTime(st.playTime)], ["bestStreak", st.bestStreak]];
  const listaPaises = [...POPULAR, ...COUNTRIES.map(([c]) => c).filter(c => !POPULAR.includes(c))];
  const cause = h => { const c = h.cause || (h.by ? "eaten" : "left"); return { c, label: LB.causes[c] || c }; };
  return <>
    <Nav cur="profile" /><ScreenHeader title={LB.profileTitle} />
    <div className="card profile-head">
      <SkinPreview skin={sk} r={40} />
      <div className="pf-meta"><b className="v-nick pf-nick">{user.nick}</b><i className="v-kind pf-kind" data-kind={guest ? "guest" : "registered"}>{guest ? LB.guest : LB.registered}</i><span className="coinbar">{LB.coinIcon} <b className="v-coins">{fmt(user.coins)}</b></span></div>
      {guest ? <button className="btn-secondary pf-claim" data-go="account" onClick={openAccount}>{LB.claim}</button>
        : <button className="btn-secondary pf-logout" onClick={() => logout().catch(e => console.warn(e))}>{LB.logout}</button>}
    </div>
    {/* NÍVEL: a barra é o progresso dentro do nível atual — `levelInto/levelNeed` vêm prontos do servidor,
        derivados do XP por uma curva que mora num lugar só (shared/src/levels.js). */}
    <div className="card pf-level">
      <div className="lv-head"><b className="lv-n">{LB.levelWord} {st.level}</b>
        <span className="hint">{fmt(st.levelInto)} / {fmt(st.levelNeed)} {LB.xpWord}</span></div>
      <span className="lv-bar"><i style={{ "--p": Math.max(0, Math.min(1, st.levelPct || 0)) }} /></span>
      <div className="lv-country">
        <Select id="pf-country" label={LB.countryLabel} value={user.country || ""}
          onChange={e => setCountry(e.target.value || null)}>
          <option value="">—</option>
          {listaPaises.map(c => <option key={c} value={c}>{flagOf(c)} {countryName(c)}</option>)}
        </Select>
        {!user.country ? <span className="hint">{LB.countryHint}</span> : null}
      </div>
    </div>
    <div className="stat-cards" id="pf-stats">{stats.map(([k, v]) => <div className="stat card" key={k}><b>{v}</b><i>{LB.stats[k]}</i></div>)}</div>
    <div className="card pf-hist"><div className="ph">{LB.history}</div><table id="pf-table">
      <thead><tr><th>data</th><th>sala</th><th className="num">massa</th><th className="num">{LB.killsWord}</th><th className="num">pos.</th><th className="num">{LB.timeWord}</th><th className="num">{LB.coinIcon}</th><th>fim</th></tr></thead>
      <tbody>{(hist || []).map(h => { const { c, label } = cause(h); return <tr key={h.id || h.endedAt}>
        <td>{fmtDate(h.endedAt || h.when)}</td><td className="code">{h.roomCode || h.room || "—"}</td><td className="num">{fmt(h.maxMass ?? h.mass)}</td><td className="num">{h.kills ?? 0}</td>
        <td className="num">{ord(h.rank)}</td><td className="num">{fmtTime(h.durationS ?? h.dur)}</td><td className="num">+{h.coinsEarned ?? h.coins ?? 0}</td>
        <td className={"cause " + c}>{label}{h.by ? <> <i>{h.by}</i></> : null}</td></tr>; })}
        {hist && !hist.length ? <tr className="empty"><td colSpan={8} className="dim">{LB.noHistory}</td></tr> : null}
        {!hist ? <tr className="empty"><td colSpan={8} className="dim">{LB.loading}</td></tr> : null}</tbody>
    </table></div>
    <div className="card pf-ach"><div className="ph">{LB.achievements}</div><div className="ach-grid" id="pf-ach">
      {ACHIEVEMENTS.map(a => { const done = session.achievements.includes(a.key), goal = ACHIEVEMENT_GOALS[a.key];
        const pr = done ? 1 : goal ? Math.min(1, (st[goal[0]] || 0) / goal[1]) : 0;
        return <div key={a.key} className={"ach" + (done ? " done" : "") + (a.secret ? " secret" : "")}>
          <span className="ach-ico">{a.icon}</span>
          <div className="ach-body"><b>{a.secret && !done ? "???" : a.title}</b><i>{a.secret && !done ? "Segredo oculto" : a.desc}{goal && !done ? ` · ${fmt(st[goal[0]] || 0)}/${goal[1]}` : ""}</i>
            <span className="ach-bar"><i style={{ "--p": pr }}></i></span></div>
          <em className="ach-coins">+{a.coins}</em></div>; })}
    </div></div>
  </>;
}

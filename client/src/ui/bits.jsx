// Pedaços compartilhados: Nav, ScreenHeader, Field, MiniRank, Screen — mesmo DOM de mockups/v2/src/engine2.js.
import React from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { go } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { fmt } from "./format.js";

export function Nav({ cur }) {
  const LB = useLabels();
  const NAV = [["entry", LB.home], ["lobby", LB.rooms], ["rank", LB.ranking], ["profile", LB.profile], ["shop", LB.shop], ["prefs", LB.prefs]];
  return <nav className="nav">{NAV.map(([s, l]) =>
    <button key={s} className={"nav-btn" + (s === cur ? " on" : "")} data-go={s} data-nav={s} onClick={() => go(s)}><i className="nav-ico"></i><span>{l}</span></button>)}</nav>;
}
export function ScreenHeader({ title }) {
  const LB = useLabels(); const user = useStore(app, s => s.session.user);
  return <header className="sh">
    <button className="btn-mini back" data-go="entry" onClick={() => go("entry")}>{LB.back}</button>
    <h1 className="stitle">{title}</h1>
    <span className="coinbar sh-coins">{LB.coinIcon} <b className="v-coins">{fmt(user ? user.coins : 0)}</b></span>
  </header>;
}
export function Field({ id, label, type = "text", ...rest }) {
  return <div className="field"><label htmlFor={id}>{label}</label><input id={id} type={type} {...rest} /></div>;
}
/** Top N do ranking diário (.mini-rank > .mr-row). */
export function MiniRank({ id, rows, n = 5 }) {
  const LB = useLabels();
  return <div className="mini-rank" id={id}>{(rows || []).slice(0, n).map(r =>
    <div className="mr-row" key={r.userId || r.rank}><span className="mr-pos">{r.rank}</span>
      <span className="mr-nick">{r.nick}{r.registered ? <> <i className="reg">{LB.regTag}</i></> : null}</span><b className="mr-val">{fmt(r.value)}</b></div>)}
    {!rows || !rows.length ? <div className="mr-row dim"><span className="mr-nick">{LB.noRank}</span></div> : null}</div>;
}
export function Screen({ id, on, className, children }) {
  return <div className={"screen" + (on ? " on" : "")} id={"s-" + id}>{on ? (className ? <div className={"wrap " + className}>{children}</div> : children) : null}</div>;
}

import React from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { setPref, savePrefs, resetPrefs } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { Nav, ScreenHeader, Screen } from "./bits.jsx";
import { PREFS } from "./prefsTable.js";

export default function Prefs({ on }) {
  return <Screen id="prefs" on={on} className="prefs-wrap">{on ? <Body /> : null}</Screen>;
}
function Body() {
  const LB = useLabels(); const prefs = useStore(app, s => s.session.prefs);
  const coerce = (it, raw) => (typeof it.opts[0][0] === "number" ? +raw : raw);
  return <>
    <Nav cur="prefs" /><ScreenHeader title={LB.prefsTitle} />
    <div className="prefs-groups" id="prefs-groups">
      {PREFS.map(gp => <section className="card pg" id={"pg-" + gp.id} key={gp.id}><h2>{gp.title}</h2>
        {gp.items.map(it => { const v = prefs[it.key];
          return <div className="pref-row" key={it.key}><label htmlFor={"pref-" + it.key}>{it.label}</label>
            {it.type === "toggle" ? <button id={"pref-" + it.key} className="toggle" role="switch" aria-checked={!!v} data-pref={it.key} onClick={() => setPref(it.key, !v)}><i></i></button>
              : it.type === "select" ? <select id={"pref-" + it.key} data-pref={it.key} value={String(v)} onChange={e => setPref(it.key, coerce(it, e.target.value))}>{it.opts.map(([k, l]) => <option key={k} value={String(k)}>{l}</option>)}</select>
              : <span className="range"><input id={"pref-" + it.key} type="range" min={it.min} max={it.max} value={+v || 0} data-pref={it.key} onChange={e => setPref(it.key, +e.target.value)} /><b>{+v || 0}</b></span>}
          </div>; })}
      </section>)}
    </div>
    <div className="prefs-foot"><button className="btn-secondary" id="pf-reset" onClick={resetPrefs}>{LB.reset}</button><button className="btn-primary" id="pf-save" onClick={savePrefs}>{LB.save}</button></div>
  </>;
}

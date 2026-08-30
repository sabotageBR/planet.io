import React from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { setPref, savePrefs, resetPrefs } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { ScreenHeader, Screen } from "./bits.jsx";
import { PREFS } from "./prefsTable.js";

export default function Prefs({ on }) {
  return <Screen id="prefs" on={on} className="prefs-wrap">{on ? <Body /> : null}</Screen>;
}
const coerce = (it, raw) => (typeof it.opts[0][0] === "number" ? +raw : raw);
/**
 * UMA linha de preferência (toggle · select · range). Exportada porque o menu de PAUSA (ui/Pause.jsx) mostra
 * um punhado das mesmas prefs por cima do jogo — duas cópias do mesmo widget divergiriam na primeira
 * correção, e o `id`/`data-pref` que o CSS dos temas usa é justamente o que não pode divergir.
 * `pfx` diferencia os ids quando as duas telas estão montadas ao mesmo tempo (o `htmlFor` exige id único).
 */
export function PrefRow({ it, v, pfx = "pref-" }) {
  const id = pfx + it.key;
  return <div className="pref-row"><label htmlFor={id}>{it.label}</label>
    {it.type === "toggle" ? <button id={id} className="toggle" role="switch" aria-checked={!!v} data-pref={it.key} onClick={() => setPref(it.key, !v)}><i></i></button>
      : it.type === "select" ? <select id={id} data-pref={it.key} value={String(v)} onChange={e => setPref(it.key, coerce(it, e.target.value))}>{it.opts.map(([k, l]) => <option key={k} value={String(k)}>{l}</option>)}</select>
      : <span className="range"><input id={id} type="range" min={it.min} max={it.max} value={+v || 0} data-pref={it.key} onChange={e => setPref(it.key, +e.target.value)} /><b>{+v || 0}</b></span>}
  </div>;
}
function Body() {
  const LB = useLabels(); const prefs = useStore(app, s => s.session.prefs);
  return <>
    <ScreenHeader title={LB.prefsTitle} />
    <div className="prefs-groups" id="prefs-groups">
      {PREFS.map(gp => <section className="card pg" id={"pg-" + gp.id} key={gp.id}><h2>{gp.title}</h2>
        {gp.items.map(it => <PrefRow key={it.key} it={it} v={prefs[it.key]} />)}
      </section>)}
    </div>
    <div className="prefs-foot"><button className="btn-secondary" id="pf-reset" onClick={resetPrefs}>{LB.reset}</button><button className="btn-primary" id="pf-save" onClick={savePrefs}>{LB.save}</button></div>
  </>;
}

import React from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { setPref, savePrefs, resetPrefs } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { ScreenHeader, Screen } from "./bits.jsx";
import { PREFS } from "./prefsTable.js";
import { LANG_NAMES } from "../i18n/index.js";
import { PORTAL } from "../portal/flags.js";

export default function Prefs({ on }) {
  return <Screen id="prefs" on={on} className="prefs-wrap">{on ? <Body /> : null}</Screen>;
}
const coerce = (it, raw) => (it.kind === "num" ? +raw : raw);
/**
 * O rótulo de uma OPÇÃO. Três origens, porque nem toda opção é texto de UI: tecla é a tecla física
 * (grupo `keys`), idioma fica sempre no próprio idioma (`English`, não `Inglês`) e número é o número.
 * O resto segue a convenção `prefs[chave_valor]`, com o valor cru de reserva — assim uma opção nova
 * aparece na tela mesmo antes de alguém escrever o texto dela.
 */
const rotulo = (LB, it, v) => it.kind === "key" ? (LB.keys[v] || v)
  : it.kind === "lang" ? (v === "auto" ? LB.opt.lang_auto : LANG_NAMES[v] || v)
  : it.kind === "num" ? String(v)
  : (LB.opt[it.key + "_" + v] || String(v));
/**
 * UMA linha de preferência (toggle · select · range). Exportada porque o menu de PAUSA (ui/Pause.jsx) mostra
 * um punhado das mesmas prefs por cima do jogo — duas cópias do mesmo widget divergiriam na primeira
 * correção, e o `id`/`data-pref` que o CSS dos temas usa é justamente o que não pode divergir.
 * `pfx` diferencia os ids quando as duas telas estão montadas ao mesmo tempo (o `htmlFor` exige id único).
 */
export function PrefRow({ it, v, pfx = "pref-" }) {
  const LB = useLabels(), id = pfx + it.key;
  return <div className="pref-row"><label htmlFor={id}>{LB.opt[it.key] || it.key}</label>
    {it.type === "toggle" ? <button id={id} className="toggle" role="switch" aria-checked={!!v} data-pref={it.key} onClick={() => setPref(it.key, !v)}><i></i></button>
      : it.type === "select" ? <select id={id} data-pref={it.key} value={String(v)} onChange={e => setPref(it.key, coerce(it, e.target.value))}>{it.opts.map(k => <option key={k} value={String(k)}>{rotulo(LB, it, k)}</option>)}</select>
      : <span className="range"><input id={id} type="range" min={it.min} max={it.max} value={+v || 0} data-pref={it.key} onChange={e => setPref(it.key, +e.target.value)} /><b>{+v || 0}</b></span>}
  </div>;
}
function Body() {
  const LB = useLabels(); const prefs = useStore(app, s => s.session.prefs);
  return <>
    <ScreenHeader title={LB.prefsTitle} />
    <div className="prefs-groups" id="prefs-groups">
      {PREFS.map(gp => <section className="card pg" id={"pg-" + gp.id} key={gp.id}><h2>{LB.opt["g_" + gp.id]}</h2>
        {gp.items.map(it => <PrefRow key={it.key} it={it} v={prefs[it.key]} />)}
      </section>)}
    </div>
    <div className="prefs-foot"><button className="btn-secondary" id="pf-reset" onClick={resetPrefs}>{LB.reset}</button><button className="btn-primary" id="pf-save" onClick={savePrefs}>{LB.save}</button></div>
    {/* A política de privacidade é uma página ESTÁTICA (client/public/privacy.html), fora do bundle: ela
        tem que abrir mesmo com o jogo fora do ar. ⚠️ E não aparece no pacote de portal — link que tira o
        jogador do iframe é justamente o que eles proíbem; lá a URL vai no formulário deles. */}
    {!PORTAL ? <div className="prefs-legal"><a href="/privacy.html" target="_blank" rel="noopener">{LB.privacy}</a></div> : null}
  </>;
}

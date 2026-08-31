import React, { useEffect, useState } from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { claim, login, closeAccount , setCountry } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { errText } from "../i18n/errors.js";
import { COUNTRIES, POPULAR, flagOf, countryName } from "@warspace/shared";
import { Field, Select } from "./bits.jsx";
import GoogleButton from "./GoogleButton.jsx";
import { nickSorteado } from "../util/nick.js";

const PAISES = [...POPULAR, ...COUNTRIES.map(([c]) => c).filter(c => !POPULAR.includes(c))];
/** Sugestão pelo idioma do navegador ("pt-BR" → "BR"). Só PREENCHE o campo; quem salva é o usuário. */
const paisSugerido = () => { const p = (navigator.language || "").split("-")[1]; return p && PAISES.includes(p.toUpperCase()) ? p.toUpperCase() : ""; };
/** O nick vira sugestão de usuário — MENOS o `Viajante-NNNN` sorteado (ver util/nick.js). */
const sugereLogin = nick => (nickSorteado(nick) ? "" : nick);
export default function AccountModal({ on }) {
  return <div className={"overlay" + (on ? " on" : "")} id="s-account" onClick={e => { if (e.target === e.currentTarget) closeAccount(); }}>{on ? <Body /> : null}</div>;
}
function Body() {
  const LB = useLabels(); const user = useStore(app, s => s.session.user) || {};
  const [tab, setTab] = useState(app.get().overlays.account === "login" ? "login" : "claim");   // o Body só monta com o modal aberto, então ler UMA vez na montagem é o estado certo
  const [c, setC] = useState({ login: sugereLogin(user.nick), pass: "", pass2: "", mail: "", pais: user.country || paisSugerido() });
  const [l, setL] = useState({ login: "", pass: "" });
  const [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => { setC(x => (x.login ? x : { ...x, login: sugereLogin(user.nick) })); }, [user.nick]);
  const fail = e => { setErr({ msg: errText(e, "nick"), suggestion: e.suggestion }); setBusy(false); };
  const doClaim = async () => { setErr(null);
    if (c.login.trim().length < 2 || c.login.trim().length > 16) return setErr({ msg: LB.loginShort });
    if (c.pass.length < 6) return setErr({ msg: LB.passShort });
    if (c.pass !== c.pass2) return setErr({ msg: LB.passMismatch });
    setBusy(true);
    try { await claim({ login: c.login.trim(), password: c.pass, email: c.mail.trim() || undefined });
      if (c.pais) await setCountry(c.pais);   // depois do claim: o país é do PERFIL, não da criação da conta
      setBusy(false); } catch (e) { fail(e); } };
  const doLogin = async () => { setErr(null); if (!l.login.trim() || !l.pass) return setErr({ msg: LB.loginShort });
    setBusy(true); try { await login({ login: l.login.trim(), password: l.pass }); setBusy(false); } catch (e) { fail(e); } };
  const error = err ? <p className="form-error" role="alert">{err.msg}{err.suggestion ? <> <button type="button" className="btn-link" onClick={() => { setC(x => ({ ...x, login: err.suggestion })); setErr(null); }}>{LB.useSuggestion}: {err.suggestion}</button></> : null}</p> : null;
  return <div className="card modal account" role="dialog" aria-modal="true">
    <div className="modal-title">{LB.accountTitle}</div>
    {/* Acima das abas de propósito: entrar com Google resolve as duas (reivindicar e entrar). */}
    <div className="gsi-block"><GoogleButton /><div className="or-sep"><span>{LB.orSep}</span></div></div>
    <div className="tabs"><button data-tab="claim" className={tab === "claim" ? "on" : ""} onClick={() => { setTab("claim"); setErr(null); }}>{LB.claimTab}</button><button data-tab="login" className={tab === "login" ? "on" : ""} onClick={() => { setTab("login"); setErr(null); }}>{LB.loginTab}</button></div>
    <form className={"tab tab-claim" + (tab === "claim" ? " on" : "")} onSubmit={e => { e.preventDefault(); doClaim(); }}>
      <p className="hint">{LB.claimNote}</p>
      <Field id="ac-login" label={LB.loginUser} value={c.login} maxLength={16} autoComplete="username" onChange={e => setC({ ...c, login: e.target.value })} />
      <p className="hint">{LB.loginUserHint}</p>
      <Field id="ac-pass" label={LB.password} type="password" value={c.pass} autoComplete="new-password" onChange={e => setC({ ...c, pass: e.target.value })} />
      <Field id="ac-pass2" label={LB.password2} type="password" value={c.pass2} autoComplete="new-password" onChange={e => setC({ ...c, pass2: e.target.value })} />
      <Field id="ac-mail" label={LB.email} type="email" value={c.mail} autoComplete="email" onChange={e => setC({ ...c, mail: e.target.value })} />
      {/* País: opcional e só isso — é o que abre o ranking REGIONAL. Vem pré-selecionado pelo idioma do
          navegador, mas quem confirma é a pessoa: adivinhar e salvar sozinho seria decidir por ela. */}
      <Select id="ac-country" label={LB.countryLabel} value={c.pais} onChange={e => setC({ ...c, pais: e.target.value })}>
        <option value="">—</option>
        {PAISES.map(k => <option key={k} value={k}>{flagOf(k)} {countryName(k)}</option>)}
      </Select>
      {tab === "claim" ? error : null}
      <div className="modal-actions"><button type="button" className="btn-secondary" data-go="account-close" onClick={closeAccount}>{LB.cancel}</button><button type="submit" className="btn-primary" data-go="account-claim" disabled={busy}>{LB.confirm}</button></div>
    </form>
    <form className={"tab tab-login" + (tab === "login" ? " on" : "")} onSubmit={e => { e.preventDefault(); doLogin(); }}>
      <p className="hint">{LB.loginNote}</p>
      <Field id="lg-login" label={LB.loginUser} value={l.login} autoComplete="username" onChange={e => setL({ ...l, login: e.target.value })} />
      <Field id="lg-pass" label={LB.password} type="password" value={l.pass} autoComplete="current-password" onChange={e => setL({ ...l, pass: e.target.value })} />
      {tab === "login" ? error : null}
      <div className="modal-actions"><button type="button" className="btn-secondary" data-go="account-close" onClick={closeAccount}>{LB.cancel}</button><button type="submit" className="btn-primary" data-go="account-login" disabled={busy}>{LB.login}</button></div>
    </form>
  </div>;
}

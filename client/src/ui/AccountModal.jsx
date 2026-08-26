import React, { useEffect, useState } from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { claim, login, closeAccount } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { Field } from "./bits.jsx";

export default function AccountModal({ on }) {
  return <div className={"overlay" + (on ? " on" : "")} id="s-account" onClick={e => { if (e.target === e.currentTarget) closeAccount(); }}>{on ? <Body /> : null}</div>;
}
function Body() {
  const LB = useLabels(); const user = useStore(app, s => s.session.user) || {};
  const [tab, setTab] = useState("claim");
  const [c, setC] = useState({ nick: user.nick || "", pass: "", pass2: "", mail: "" });
  const [l, setL] = useState({ nick: "", pass: "" });
  const [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => { setC(x => ({ ...x, nick: user.nick || "" })); }, [user.nick]);
  const fail = e => { setErr({ msg: e.message || String(e), suggestion: e.suggestion }); setBusy(false); };
  const doClaim = async () => { setErr(null);
    if (c.nick.trim().length < 2 || c.nick.trim().length > 16) return setErr({ msg: LB.nickShort });
    if (c.pass.length < 6) return setErr({ msg: LB.passShort });
    if (c.pass !== c.pass2) return setErr({ msg: LB.passMismatch });
    setBusy(true); try { await claim({ nick: c.nick.trim(), password: c.pass, email: c.mail.trim() || undefined }); setBusy(false); } catch (e) { fail(e); } };
  const doLogin = async () => { setErr(null); if (!l.nick.trim() || !l.pass) return setErr({ msg: LB.nickShort });
    setBusy(true); try { await login({ login: l.nick.trim(), password: l.pass }); setBusy(false); } catch (e) { fail(e); } };
  const error = err ? <p className="form-error" role="alert">{err.msg}{err.suggestion ? <> <button type="button" className="btn-link" onClick={() => { setC(x => ({ ...x, nick: err.suggestion })); setErr(null); }}>{LB.useSuggestion}: {err.suggestion}</button></> : null}</p> : null;
  return <div className="card modal account" role="dialog" aria-modal="true">
    <div className="modal-title">{LB.accountTitle}</div>
    <div className="tabs"><button data-tab="claim" className={tab === "claim" ? "on" : ""} onClick={() => { setTab("claim"); setErr(null); }}>{LB.claimTab}</button><button data-tab="login" className={tab === "login" ? "on" : ""} onClick={() => { setTab("login"); setErr(null); }}>{LB.loginTab}</button></div>
    <form className={"tab tab-claim" + (tab === "claim" ? " on" : "")} onSubmit={e => { e.preventDefault(); doClaim(); }}>
      <p className="hint">{LB.claimNote}</p>
      <Field id="ac-nick" label={LB.nick} value={c.nick} maxLength={16} autoComplete="username" onChange={e => setC({ ...c, nick: e.target.value })} />
      <Field id="ac-pass" label={LB.password} type="password" value={c.pass} autoComplete="new-password" onChange={e => setC({ ...c, pass: e.target.value })} />
      <Field id="ac-pass2" label={LB.password2} type="password" value={c.pass2} autoComplete="new-password" onChange={e => setC({ ...c, pass2: e.target.value })} />
      <Field id="ac-mail" label={LB.email} type="email" value={c.mail} autoComplete="email" onChange={e => setC({ ...c, mail: e.target.value })} />
      {tab === "claim" ? error : null}
      <div className="modal-actions"><button type="button" className="btn-secondary" data-go="account-close" onClick={closeAccount}>{LB.cancel}</button><button type="submit" className="btn-primary" data-go="account-claim" disabled={busy}>{LB.confirm}</button></div>
    </form>
    <form className={"tab tab-login" + (tab === "login" ? " on" : "")} onSubmit={e => { e.preventDefault(); doLogin(); }}>
      <p className="hint">{LB.loginNote}</p>
      <Field id="lg-nick" label={LB.nick} value={l.nick} autoComplete="username" onChange={e => setL({ ...l, nick: e.target.value })} />
      <Field id="lg-pass" label={LB.password} type="password" value={l.pass} autoComplete="current-password" onChange={e => setL({ ...l, pass: e.target.value })} />
      {tab === "login" ? error : null}
      <div className="modal-actions"><button type="button" className="btn-secondary" data-go="account-close" onClick={closeAccount}>{LB.cancel}</button><button type="submit" className="btn-primary" data-go="account-login" disabled={busy}>{LB.login}</button></div>
    </form>
  </div>;
}

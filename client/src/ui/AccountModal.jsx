import React, { useEffect, useState } from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { claim, login, closeAccount } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { errText } from "../i18n/errors.js";
import { Field } from "./bits.jsx";
import GoogleButton from "./GoogleButton.jsx";
import { nickSorteado } from "../util/nick.js";

// ── MODAL DE CONTA: CRIAR CONTA · ENTRAR ──────────────────────────────────────
// O cadastro por senha VOLTOU, e simples: e-mail, usuário, senha e a confirmação — nada mais. O país
// saiu do formulário porque ele é do PERFIL (é o que abre o ranking regional) e pedi-lo na criação da
// conta transforma quatro campos em cinco por um dado que ninguém precisa dar agora.
// ⚠️ Nada disso mexeu em servidor: `claim()` em state/actions.js e `POST /api/auth/claim` continuavam
// inteiros e dormentes desde que a aba saiu (o molde de BLACKHOLE.COUNT=0), e é neles que ela reentra.
// ⚠️ O e-mail é OPCIONAL no servidor e OBRIGATÓRIO aqui, de propósito: o jogo não tem "esqueci a senha"
// (docs — reset via SQL), então uma conta com senha e sem e-mail é uma conta sem volta possível. Quem
// não quiser dar e-mail tem o Google logo acima, que resolve a conta inteira num clique.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;   // peneira de FORMATO; quem valida é o servidor
/** O nick vira sugestão de usuário — MENOS o `Viajante-NNNN` sorteado (ver util/nick.js). */
const sugereLogin = nick => (nickSorteado(nick) ? "" : nick);
export default function AccountModal({ on }) {
  return <div className={"overlay" + (on ? " on" : "")} id="s-account" onClick={e => { if (e.target === e.currentTarget) closeAccount(); }}>{on ? <Body /> : null}</div>;
}
function Body() {
  const LB = useLabels(); const user = useStore(app, s => s.session.user) || {};
  const [tab, setTab] = useState(app.get().overlays.account === "claim" ? "claim" : "login");   // o Body só monta com o modal aberto, então ler UMA vez na montagem é o estado certo
  const [c, setC] = useState({ mail: "", login: sugereLogin(user.nick), pass: "", pass2: "" });
  const [l, setL] = useState({ login: "", pass: "" });
  const [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => { setC(x => (x.login ? x : { ...x, login: sugereLogin(user.nick) })); }, [user.nick]);
  const fail = e => { setErr({ msg: errText(e, "nick"), suggestion: e.suggestion }); setBusy(false); };
  // A ordem da peneira é a ordem dos campos na tela: quem lê o erro tem que achar o campo olhando de cima.
  const doClaim = async () => { setErr(null);
    const mail = c.mail.trim(), nome = c.login.trim();
    if (!EMAIL_RE.test(mail)) return setErr({ msg: LB.err.invalid_email });
    if (nome.length < 2 || nome.length > 16) return setErr({ msg: LB.loginShort });
    if (c.pass.length < 6) return setErr({ msg: LB.passShort });
    if (c.pass !== c.pass2) return setErr({ msg: LB.passMismatch });
    setBusy(true);
    try { await claim({ login: nome, password: c.pass, email: mail }); setBusy(false); } catch (e) { fail(e); } };
  const doLogin = async () => { setErr(null); if (!l.login.trim() || !l.pass) return setErr({ msg: LB.loginShort });
    setBusy(true); try { await login({ login: l.login.trim(), password: l.pass }); setBusy(false); } catch (e) { fail(e); } };
  const error = err ? <p className="form-error" role="alert">{err.msg}{err.suggestion ? <> <button type="button" className="btn-link" onClick={() => { setC(x => ({ ...x, login: err.suggestion })); setErr(null); }}>{LB.useSuggestion}: {err.suggestion}</button></> : null}</p> : null;
  return <div className="card modal account" role="dialog" aria-modal="true">
    <div className="modal-title">{LB.accountTitle}</div>
    {/* Acima das abas de propósito: entrar com Google resolve as duas (criar e entrar) num clique. O
        separador vai como PROP para sumir junto com o botão quando não há Google (ver GoogleButton). */}
    <GoogleButton sep={LB.orSep} />
    <div className="tabs"><button data-tab="claim" className={tab === "claim" ? "on" : ""} onClick={() => { setTab("claim"); setErr(null); }}>{LB.claimTab}</button><button data-tab="login" className={tab === "login" ? "on" : ""} onClick={() => { setTab("login"); setErr(null); }}>{LB.loginTab}</button></div>
    {/* `tab on` continua: `.tab{display:none}` / `.tab.on{display:flex}` (base.css) e o modo paisagem dos
        temas estilizam `.modal .tab.on` em duas colunas. Sem a classe, o formulário some no celular. */}
    <form className={"tab tab-claim" + (tab === "claim" ? " on" : "")} onSubmit={e => { e.preventDefault(); doClaim(); }}>
      <p className="hint">{LB.claimNote}</p>
      <Field id="ac-mail" label={LB.email} type="email" value={c.mail} autoComplete="email" onChange={e => setC({ ...c, mail: e.target.value })} />
      <Field id="ac-login" label={LB.loginUser} value={c.login} maxLength={16} autoComplete="username" onChange={e => setC({ ...c, login: e.target.value })} />
      <p className="hint">{LB.loginUserHint}</p>
      <Field id="ac-pass" label={LB.password} type="password" value={c.pass} autoComplete="new-password" onChange={e => setC({ ...c, pass: e.target.value })} />
      <Field id="ac-pass2" label={LB.password2} type="password" value={c.pass2} autoComplete="new-password" onChange={e => setC({ ...c, pass2: e.target.value })} />
      {tab === "claim" ? error : null}
      <div className="modal-actions"><button type="button" className="btn-secondary" data-go="account-close" onClick={closeAccount}>{LB.cancel}</button><button type="submit" className="btn-primary" data-go="account-claim" disabled={busy}>{LB.claim}</button></div>
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

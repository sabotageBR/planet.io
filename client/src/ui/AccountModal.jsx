import React, { useState } from "react";
import { login, closeAccount } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { errText } from "../i18n/errors.js";
import { Field } from "./bits.jsx";
import GoogleButton from "./GoogleButton.jsx";

// ── MODAL DE CONTA: SÓ ENTRAR ─────────────────────────────────────────────────
// A aba "Reivindicar" (criar conta com usuário e senha) SAIU, junto com o CTA que a chamava na tela
// inicial e no Perfil. Quem cria conta agora é o Google, que resolve tudo num clique e não pede senha
// nova a ninguém. O que NÃO podia sair é o formulário de ENTRAR: quem já tem conta com senha continua
// entrando por aqui — é a única porta de volta para essas contas, e apagá-la trancaria gente para fora.
// ⚠️ `claim()` em state/actions.js e `POST /api/auth/claim` continuam INTEIROS e dormentes (o molde de
// BLACKHOLE.COUNT=0): a aba volta reinserindo o formulário, sem tocar em servidor nem em banco.
export default function AccountModal({ on }) {
  return <div className={"overlay" + (on ? " on" : "")} id="s-account" onClick={e => { if (e.target === e.currentTarget) closeAccount(); }}>{on ? <Body /> : null}</div>;
}
function Body() {
  const LB = useLabels();
  const [l, setL] = useState({ login: "", pass: "" });
  const [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  const doLogin = async () => { setErr(null); if (!l.login.trim() || !l.pass) return setErr({ msg: LB.loginShort });
    setBusy(true); try { await login({ login: l.login.trim(), password: l.pass }); setBusy(false); } catch (e) { setErr({ msg: errText(e, "nick") }); setBusy(false); } };
  return <div className="card modal account" role="dialog" aria-modal="true">
    <div className="modal-title">{LB.accountTitle}</div>
    {/* Acima do formulário de propósito: entrar com Google é o caminho curto, e agora é também o único
        jeito de CRIAR conta. O separador continua fazendo sentido — abaixo dele está a outra opção. */}
    <div className="gsi-block"><GoogleButton /><div className="or-sep"><span>{LB.orSep}</span></div></div>
    {/* `tab on` continua: `.tab{display:none}` / `.tab.on{display:flex}` (base.css) e o modo paisagem dos
        temas estilizam `.modal .tab.on` em duas colunas. Sem a classe, o formulário some no celular. */}
    <form className="tab tab-login on" onSubmit={e => { e.preventDefault(); doLogin(); }}>
      <p className="hint">{LB.loginNote}</p>
      <Field id="lg-login" label={LB.loginUser} value={l.login} autoComplete="username" onChange={e => setL({ ...l, login: e.target.value })} />
      <Field id="lg-pass" label={LB.password} type="password" value={l.pass} autoComplete="current-password" onChange={e => setL({ ...l, pass: e.target.value })} />
      {err ? <p className="form-error" role="alert">{err.msg}</p> : null}
      <div className="modal-actions"><button type="button" className="btn-secondary" data-go="account-close" onClick={closeAccount}>{LB.cancel}</button><button type="submit" className="btn-primary" data-go="account-login" disabled={busy}>{LB.login}</button></div>
    </form>
  </div>;
}

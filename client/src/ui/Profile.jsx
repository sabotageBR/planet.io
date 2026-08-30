import React from "react";
import { skinById, ACHIEVEMENTS, ACHIEVEMENT_GOALS, ACHIEVEMENT_BY_KEY, FAMILIES, TIERS, COUNTRIES, POPULAR, flagOf, countryName } from "@warspace/shared";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { openAccount, logout, setCountry } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { Nav, ScreenHeader, Screen, Select } from "./bits.jsx";
import SkinPreview from "./SkinPreview.jsx";
import AvatarPicker from "./AvatarPicker.jsx";
import { fmt, fmtTime } from "./format.js";

export default function Profile({ on }) {
  return <Screen id="profile" on={on} className="profile-wrap">{on ? <Body /> : null}</Screen>;
}
function Body() {
  const LB = useLabels(); const session = useStore(app, s => s.session);
  const user = session.user || {}, st = session.stats, sk = skinById(user.equippedSkin ?? 0), guest = user.kind !== "registered";
  // `foodEaten` era gravado no banco desde sempre e nunca chegou à tela — agora chega, junto com mortes e K/D.
  const stats = [["games", st.games], ["kills", st.kills], ["deaths", st.deaths], ["kd", (st.kd || 0).toFixed(2)],
    ["foodEaten", fmt(st.foodEaten)], ["bestScore", fmt(st.bestScore)], ["bestMass", fmt(st.bestMass)],
    ["playTime", fmtTime(st.playTime)], ["bestStreak", st.bestStreak]];
  // 83 = "Retrato". Só quem a possui vê o campo: para os outros seria um controle que não faz nada.
  const temRetrato = session.skins.includes(83);
  const listaPaises = [...POPULAR, ...COUNTRIES.map(([c]) => c).filter(c => !POPULAR.includes(c))];
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
      {/* a foto é do JOGADOR, não da loja: quem já comprou a Retrato troca a imagem aqui, junto do
          nick e do país, sem ter que reencontrar a skin numa grade de 94. */}
      {temRetrato ? <AvatarPicker /> : null}
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
    <div className="card pf-ach"><div className="ph">{LB.achievements}</div><div className="ach-fams" id="pf-ach">
      {FAMILIES.map(f => <Familia key={f.id} f={f} owned={session.achievements} st={st} />)}
      {/* as secretas continuam soltas: não têm família nem meta visível — são o que são */}
      <div className="ach-secrets">{ACHIEVEMENTS.filter(a => a.secret).map(a => {
        const done = session.achievements.includes(a.key);
        return <div key={a.key} className={"ach secret" + (done ? " done" : "")} title={done ? a.title : LB.secretToast}>
          <span className="ach-ico">{a.icon}</span></div>; })}</div>
    </div></div>
  </>;
}

/**
 * Uma FAMÍLIA: os quatro metais lado a lado. O selo conquistado acende com a cor do metal, o PRÓXIMO
 * mostra a meta e a barra, e os depois dele ficam apagados. Antes eram 53 cartões soltos em coluna —
 * a mesma informação, mas sem dizer que "Sobrevivente II" vem depois de "Sobrevivente I".
 */
function Familia({ f, owned, st }) {
  const feitos = TIERS.map(t => owned.includes(`${f.id}.${t.id}`));
  const prox = feitos.indexOf(false);   // -1 = família completa
  const alvo = prox >= 0 && prox < f.goals.length ? ACHIEVEMENT_BY_KEY.get(`${f.id}.${TIERS[prox].id}`) : null;
  const meta = alvo ? ACHIEVEMENT_GOALS[alvo.key] : null;
  const tem = meta ? (st[meta[0]] || 0) : 0;
  return <div className={"ach-fam" + (prox < 0 || prox >= f.goals.length ? " full" : "")}>
    <span className="ach-ico">{f.icon}</span>
    <div className="ach-body">
      <b>{f.title}</b>
      <i>{alvo ? alvo.desc : f.desc(f.goals[f.goals.length - 1])}</i>
      {meta ? <span className="ach-bar"><i style={{ "--p": Math.min(1, tem / meta[1]) }}></i></span> : null}
      {meta ? <span className="ach-num">{fmt(tem)} / {fmt(meta[1])}</span> : null}
    </div>
    <div className="ach-tiers">{f.goals.map((g, i) =>
      <span key={i} className={"ach-tier" + (feitos[i] ? " on" : "") + (i === prox ? " next" : "")}
        style={{ "--tc": TIERS[i].color }} title={`${TIERS[i].name} · ${f.desc(g)} · +${TIERS[i].coins}`}>
        {feitos[i] ? TIERS[i].icon : <i className="tier-dot" />}</span>)}</div>
  </div>;
}

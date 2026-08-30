// Pedaços compartilhados: Nav, ScreenHeader, Field, MiniRank, Screen — mesmo DOM de mockups/v2/src/engine2.js.
import React from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { go } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { fmt } from "./format.js";
import NavIcon from "./NavIcons.jsx";

// ⚠️ O `<i className="nav-ico">` era VAZIO: o desenho vinha de `content:` emoji no CSS de cada tema, e
// os três só definiam SEIS chaves — faltando justo `modes`, que nasceu depois dos mockups. Resultado: um
// círculo colorido vazio em Opções, Loja, Ranking, Perfil e Salas. A tela inicial já tinha sido
// consertada (Entry.jsx usa <NavIcon>), mas esta barra ficou para trás, e duas fontes de ícone divergem
// na primeira adição. Agora o `<i>` só carrega o círculo do tema e o desenho é o MESMO SVG da entrada
// (traço em `currentColor`, então se re-tinge com o relógio); o emoji é suprimido em styles/ui.css.
export function Nav({ cur }) {
  const LB = useLabels();
  const NAV = [["entry", LB.home], ["modes", LB.modesShort], ["lobby", LB.rooms], ["rank", LB.ranking], ["profile", LB.profile], ["shop", LB.shop], ["prefs", LB.prefs]];
  return <nav className="nav">{NAV.map(([s, l]) =>
    <button key={s} className={"nav-btn" + (s === cur ? " on" : "")} data-go={s} data-nav={s} onClick={() => go(s)}><i className="nav-ico"><NavIcon k={s} /></i><span>{l}</span></button>)}</nav>;
}
/** `onBack`: a tela de equipe precisa AVISAR o servidor antes de sair (senão o lobby fica órfão). */
export function ScreenHeader({ title, onBack = null }) {
  const LB = useLabels(); const user = useStore(app, s => s.session.user);
  return <header className="sh">
    <button className="btn-mini back" data-go="entry" onClick={onBack || (() => go("entry"))}>{LB.back}</button>
    <h1 className="stitle">{title}</h1>
    <span className="coinbar sh-coins">{LB.coinIcon} <b className="v-coins">{fmt(user ? user.coins : 0)}</b></span>
  </header>;
}
export function Field({ id, label, type = "text", ...rest }) {
  return <div className="field"><label htmlFor={id}>{label}</label><input id={id} type={type} {...rest} /></div>;
}
/** Irmão do Field para listas (país). Mesmo DOM, para o CSS dos temas pegar os dois. */
export function Select({ id, label, children, ...rest }) {
  return <div className="field"><label htmlFor={id}>{label}</label><select id={id} {...rest}>{children}</select></div>;
}
/**
 * Um NOME de jogador com o badge de nível — a MESMA marcação no placar, no kill feed e no chat. Um só
 * componente porque três lugares que precisam concordar sobre como um nick se parece acabam discordando.
 * `level 0` (bot, convidado, sala sem persistência) simplesmente não desenha badge.
 */
export function Nick({ p, tag = null }) {
  if (!p) return null;
  return <span className={"kf-who" + (p.me ? " me" : "") + (p.ally ? " ally" : "")}>
    {p.level > 0 ? <i className="lvl" title={`nível ${p.level}`}>{p.level}</i> : null}
    <b className="nk">{p.name}</b>{tag}</span>;
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

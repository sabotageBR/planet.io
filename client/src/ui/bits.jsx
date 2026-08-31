// Pedaços compartilhados: Nav, ScreenHeader, Field, MiniRank, Screen — mesmo DOM de mockups/v2/src/engine2.js.
import React from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { go } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { fmt } from "./format.js";
import NavIcon from "./NavIcons.jsx";
import { flagOf } from "@warspace/shared";
import { countryNameIn } from "../i18n/catalog.js";

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
 * Um NOME de jogador com a bandeira e o badge de nível — a MESMA marcação no placar, no kill feed e no
 * chat. Um só componente porque três lugares que precisam concordar sobre como um nick se parece acabam
 * discordando. `level 0` (bot, convidado, sala sem persistência) e `country` nulo simplesmente não
 * desenham nada: TODO jogador da sala tem país (o preenchimento também — ver Room.broadcastFlags), e uma
 * única bandeira acesa entre 49 vazias diria quem é gente antes de qualquer outra coisa.
 */
export function Nick({ p, tag = null }) {
  const LB = useLabels();
  if (!p) return null;
  return <span className={"kf-who" + (p.me ? " me" : "") + (p.ally ? " ally" : "")}>
    {p.country ? <i className="flag" title={countryNameIn(p.country)}>{flagOf(p.country)}</i> : null}
    {p.level > 0 ? <i className="lvl" title={`${LB.levelWord} ${p.level}`}>{p.level}</i> : null}
    <b className="nk">{p.name}</b>{tag}</span>;
}
/** Top N do ranking diário (.mini-rank > .mr-row). */
export function MiniRank({ id, rows, n = 5 }) {
  const LB = useLabels();
  return <div className="mini-rank" id={id}>{(rows || []).slice(0, n).map(r =>
    <div className="mr-row" key={r.userId || r.rank}><span className="mr-pos">{r.rank}</span>
      <span className="mr-nick">{r.nick}</span><b className="mr-val">{fmt(r.value)}</b></div>)}
    {!rows || !rows.length ? <div className="mr-row dim"><span className="mr-nick">{LB.noRank}</span></div> : null}</div>;
}
// As telas de MENU, as que ganham a barra. `party` entra marcando "modes", que é de onde se chega nela.
// A ENTRADA fica de fora de propósito: lá a navegação são os seis botões grandes do próprio cartão.
export const NAV_TELAS = new Set(["modes", "party", "lobby", "rank", "profile", "shop", "prefs"]);
/**
 * A caixa de uma tela — e, dentro dela, a BARRA DE NAVEGAÇÃO.
 *
 * ⚠️ A barra já morou aqui, saiu para o rodapé da janela e voltou. O motivo de ter saído era real: os temas
 * a colam com `order:99;position:sticky;bottom:0`, ou seja no fundo do SCROLLPORT da caixa — e a caixa tinha
 * altura do CONTEÚDO, então em "Salas" (curta) a barra parava no meio da janela e em "Perfil" (longa) ia
 * para o rodapé. Três telas irmãs, três lugares.
 * O conserto disso não era tirar a barra da caixa: era dar à CAIXA uma altura determinada, que é o que
 * `styles/ui.css` faz agora fora do retrato (top e bottom fixos, conteúdo rolando por dentro de um bloco
 * elástico). Com a caixa sempre do mesmo tamanho, a barra fica sempre no mesmo pixel — e volta a ser o que
 * os três temas sempre desenharam, inclusive as regras de retrato e paisagem que continuavam lá, intactas.
 * De quebra, isso desfaz o efeito colateral que a saída dela causou: `.lobby-hero`, `.prefs-foot` e
 * `.rank-me` são `sticky;bottom:74px` — 74 px é a ALTURA DA BARRA, e sem ela por baixo os três passaram a
 * pairar sobre o conteúdo, cortando a lista de salas, os grupos de preferências e as linhas do ranking.
 */
export function Screen({ id, on, className, children }) {
  const nav = NAV_TELAS.has(id) ? <Nav cur={id === "party" ? "modes" : id} /> : null;
  return <div className={"screen" + (on ? " on" : "")} id={"s-" + id}>
    {on ? (className ? <div className={"wrap " + className}>{children}{nav}</div> : <>{children}{nav}</>) : null}</div>;
}

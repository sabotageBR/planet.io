// LOJA: busca, ordenação, filtro de raridade/"adquiridas", grade de cartões e MODAL de confirmação.
// O painel de detalhe ficava embaixo da grade, fora da vista de quem tinha acabado de clicar num cartão:
// selecionar e confirmar aconteciam a uma tela de distância um do outro, e ninguém descobria que ainda
// faltava confirmar. O modal põe as duas coisas no mesmo lugar — e mantém a trava original: clicar num
// cartão nunca gasta moeda, só abre a pergunta.
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { SKINS, skinById, RARITY_LABELS, RARITY_ORDER, RARITY_COLORS } from "@warspace/shared";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { buySkin, equipSkin, loadSkins, toast } from "../state/actions.js";
import { sfx } from "../audio/index.js";
import { useLabels, useTheme } from "../hooks/useTheme.js";
import { ScreenHeader, Screen } from "./bits.jsx";
import SkinPreview from "./SkinPreview.jsx";
import AvatarPicker from "./AvatarPicker.jsx";
import { fmt } from "./format.js";

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");   // busca sem acento
export default function Shop({ on }) {
  return <Screen id="shop" on={on} className="shop-wrap">{on ? <Body /> : null}</Screen>;
}
function Body() {
  const LB = useLabels(), theme = useTheme(), RC = (theme && theme.rarityColor) || RARITY_COLORS; const session = useStore(app, s => s.session);
  const user = session.user || {}, owned = session.skins, coins = user.coins || 0, eqId = user.equippedSkin ?? 0, eq = skinById(eqId);
  const [filter, setFilter] = useState("all"), [q, setQ] = useState(""), [sort, setSort] = useState("rarity"), [mineOnly, setMineOnly] = useState(false);
  const [sel, setSel] = useState(null);   // null = modal fechado; clicar num cartão é que o abre
  useEffect(() => { loadSkins(); }, []);
  const nivel = (session.stats && session.stats.level) | 0 || 1;
  // A ordem importa: NÍVEL antes de MOEDA. "Junte 16 mil moedas" para uma skin que ela ainda não pode
  // comprar de jeito nenhum é a informação errada.
  const stateOf = s => { const own = owned.includes(s.id);
    return s.id === eqId ? "eq" : own ? "owned" : s.rarity === "secret" ? "secret" : s.unlockKey ? "locked"
      : (s.levelReq || 0) > nivel ? "lowlevel" : s.price > coins ? "poor" : "buyable"; };
  const list = useMemo(() => {
    const nq = norm(q);
    const out = SKINS.filter(s => (filter === "all" || s.rarity === filter) && (!mineOnly || owned.includes(s.id)) && (!nq || norm(s.name).includes(nq)));
    const ri = s => RARITY_ORDER.indexOf(s.rarity);
    out.sort(sort === "price" ? (a, b) => a.price - b.price || ri(a) - ri(b)
      : sort === "name" ? (a, b) => a.name.localeCompare(b.name, "pt-BR")
      : (a, b) => ri(a) - ri(b) || a.price - b.price);
    return out;
  }, [filter, q, sort, mineOnly, owned]);
  // As `secret` (easter eggs e conquistas ocultas) saem da conta: ninguém as compra nem as ganha pela
  // loja, e com elas no denominador a barra de progresso nunca chegaria a 100%.
  const TOTAL_VIS = SKINS.filter(s => s.rarity !== "secret").length;
  const ownedVis = owned.filter(id => { const s = skinById(id); return s && s.rarity !== "secret"; }).length;
  const rotulo = (s, st) => st === "eq" ? "" : st === "owned" ? LB.equip : st === "secret" ? "???" : st === "locked" ? s.desc
    : st === "lowlevel" ? `🔒 ${LB.levelReq.replace("{n}", s.levelReq)}` : `${LB.coinIcon} ${fmt(s.price)}`;
  return <>
    <ScreenHeader title={LB.shopTitle} />
    <div className="card shop-eq"><SkinPreview skin={eq} r={40} />
      <div className="skinmeta"><b id="s-skin">{eq.name}</b><i id="s-rar" style={{ color: RC[eq.rarity] }}>{RARITY_LABELS[eq.rarity]}</i><span className="hint" id="s-count">{ownedVis}/{TOTAL_VIS} {LB.unlocked}</span></div>
      <span className="badge">{LB.equipped}</span></div>
    <div className="shop-prog"><i style={{ width: Math.round(ownedVis / TOTAL_VIS * 100) + "%" }} /></div>
    <div className="shop-tools">
      <input type="search" value={q} placeholder={LB.shopSearch} onChange={e => setQ(e.target.value)} aria-label={LB.shopSearch} />
      <select value={sort} onChange={e => setSort(e.target.value)} aria-label={LB.sortBy.rarity}>
        {["rarity", "price", "name"].map(k => <option key={k} value={k}>{LB.sortBy[k]}</option>)}
      </select>
    </div>
    {/* "Adquiridas" é um filtro como qualquer outro e agora mora com os outros. Como toggle solto na barra
        de ferramentas ele competia por espaço com a busca e o seletor de ordem, e era o primeiro a ser
        cortado quando o painel encolhia. */}
    <div className="filters" id="shop-filters">
      <button data-f="all" className={filter === "all" && !mineOnly ? "on" : ""} onClick={() => { setFilter("all"); setMineOnly(false); }}>{LB.filterAll}</button>
      <button data-f="mine" className={mineOnly ? "on" : ""} onClick={() => setMineOnly(v => !v)}>{LB.onlyMine}</button>
      {RARITY_ORDER.map(r => <button key={r} data-f={r} className={filter === r ? "on" : ""} style={{ "--rc": RC[r] }} onClick={() => setFilter(r)}>{RARITY_LABELS[r]}</button>)}
    </div>
    <div className="shop-grid" id="shop-grid">{list.map(s => { const st = stateOf(s), sec = st === "secret";
      return <div key={s.id} className={"skin-card " + st} data-skin={s.id} data-rar={s.rarity} style={{ "--rc": RC[s.rarity] }}
        onClick={() => setSel(s.id)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(s.id); } }}>
        <span className="rar-dot" />
        {st === "eq" ? <span className="badge">{LB.equipped}</span> : null}
        {/* a Retrato é a única skin que precisa de algo além da compra — a foto. Sem esta marca nada na
            grade dizia isso, e o jogador pagava 25 mil moedas sem saber que ainda havia um passo. */}
        {s.pattern === "avatar" ? <span className="badge av">{LB.avatarBadge}</span> : null}
        <SkinPreview skin={s} r={36} className="" secret={sec} />
        <b>{sec ? LB.secret : s.name}</b><i>{RARITY_LABELS[s.rarity]}</i>
        <em>{rotulo(s, st)}</em></div>; })}
      {list.length ? null : <div className="hint">{LB.noSkins}</div>}</div>
    <div className="shop-note hint">{LB.shopNote}</div>
    {sel != null ? <SkinModal id={sel} stateOf={stateOf} onClose={() => setSel(null)} /> : null}
  </>;
}

/** A pergunta: skin grande, o que ela é, e as duas saídas. Fecha sozinho depois de equipar/comprar. */
function SkinModal({ id, stateOf, onClose }) {
  const LB = useLabels(), theme = useTheme(), RC = (theme && theme.rarityColor) || RARITY_COLORS;
  const session = useStore(app, s => s.session), nivel = (session.stats && session.stats.level) | 0 || 1;
  const cur = skinById(id), st = stateOf(cur);
  useEffect(() => { const kd = e => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    addEventListener("keydown", kd); return () => removeEventListener("keydown", kd); }, [onClose]);
  const act = () => {
    if (st === "owned") { sfx("equip"); equipSkin(cur.id); return onClose(); }
    if (st === "buyable") { sfx("buy"); buySkin(cur.id); return onClose(); }
    sfx("error");   // sem moeda / secreta / travada: o "não pode" tem que soar diferente do "pode"
    if (st === "lowlevel") return toast(LB.lowlevelToast.replace("{n}", cur.levelReq).replace("{v}", nivel));
    if (st === "poor") return toast(LB.poorToast);
    if (st === "secret") return toast(LB.secretToast);
    if (st === "locked") return toast(LB.lockedToast + ": " + cur.desc);
  };
  const actLabel = st === "eq" ? LB.equipped : st === "owned" ? LB.equip : st === "secret" ? "???" : st === "locked" ? LB.locked
    : st === "lowlevel" ? `🔒 ${LB.levelReq.replace("{n}", cur.levelReq)}` : `${LB.coinIcon} ${fmt(cur.price)}`;
  const pergunta = st === "owned" ? LB.skinConfirmEquip : st === "buyable" ? LB.skinConfirmBuy : "";
  // ⚠️ PORTAL, e não é preciosismo: o `.overlay` é `position:absolute` e o bloco contentor dele seria o
  // `.wrap` da loja, que é absoluto, ROLA e ainda tem `transform:translateX(-50%)`. Daí os dois defeitos:
  // o `top:50%` do modal centrava no meio da CAIXA (não da tela) e o modal descia junto com a rolagem da
  // grade. `position:fixed` não resolveria — um `transform` no ancestral também captura elementos fixos.
  // Montado na raiz, o ancestral posicionado passa a ser `#app{position:fixed;inset:0}` e o CSS que já
  // existe (base.css `.overlay` + ui.css `.card.modal`) centra sozinho, como já faz no AccountModal.
  return createPortal(<div className="overlay on" id="s-skinmodal" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="card modal skin-modal" style={{ "--rc": RC[cur.rarity] }} role="dialog" aria-modal="true" aria-label={cur.name}>
      <SkinPreview skin={cur} r={48} className="" secret={st === "secret"} />
      <div className="sm-info"><b>{st === "secret" ? LB.secret : cur.name}</b>
        <i>{RARITY_LABELS[cur.rarity]}</i><span>{cur.desc}</span>
        {pergunta ? <em className="sm-ask">{pergunta}</em> : null}</div>
      {/* a foto vem AQUI, não escondida no fim da tela: quem acabou de equipar a Retrato está olhando
          exatamente para este cartão, e é este o momento em que a foto faz sentido */}
      {cur.pattern === "avatar" && (st === "eq" || st === "owned") ? <AvatarPicker /> : null}
      <div className="sm-actions">
        <button className="btn-secondary" onClick={onClose}>{LB.cancel}</button>
        <button className="btn-primary act" disabled={st === "eq"} onClick={act}>{actLabel}</button>
      </div>
    </div>
  </div>, document.getElementById("app"));
}

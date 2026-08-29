// LOJA: busca, ordenação, filtro de raridade/"só as minhas", grade de cartões e painel de detalhe
// (comprar/equipar só pelo botão do painel — clicar no cartão apenas seleciona, para ninguém gastar moeda sem querer).
import React, { useEffect, useMemo, useState } from "react";
import { SKINS, skinById, RARITY_LABELS, RARITY_ORDER, RARITY_COLORS } from "@planet/shared";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { buySkin, equipSkin, loadSkins, toast } from "../state/actions.js";
import { sfx } from "../audio/index.js";
import { useLabels, useTheme } from "../hooks/useTheme.js";
import { Nav, ScreenHeader, Screen } from "./bits.jsx";
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
  const [filter, setFilter] = useState("all"), [q, setQ] = useState(""), [sort, setSort] = useState("rarity"), [mineOnly, setMineOnly] = useState(false), [sel, setSel] = useState(eqId);
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
  const cur = skinById(sel), curSt = stateOf(cur);
  const act = () => { if (curSt === "owned") { sfx("equip"); return equipSkin(cur.id); } if (curSt === "buyable") { sfx("buy"); return buySkin(cur.id); }
    sfx("error");   // sem moeda / secreta / travada: o "não pode" tem que soar diferente do "pode"
    if (curSt === "lowlevel") return toast(LB.lowlevelToast.replace("{n}", cur.levelReq).replace("{v}", nivel));
    if (curSt === "poor") return toast(LB.poorToast); if (curSt === "secret") return toast(LB.secretToast); if (curSt === "locked") return toast(LB.lockedToast + ": " + cur.desc); };
  const actLabel = curSt === "eq" ? LB.equipped : curSt === "owned" ? LB.equip : curSt === "secret" ? "???" : curSt === "locked" ? LB.locked
    : curSt === "lowlevel" ? `\uD83D\uDD12 ${LB.levelReq.replace("{n}", cur.levelReq)}` : `${LB.coinIcon} ${fmt(cur.price)}`;
  return <>
    <Nav cur="shop" /><ScreenHeader title={LB.shopTitle} />
    <div className="card shop-eq"><SkinPreview skin={eq} r={40} />
      <div className="skinmeta"><b id="s-skin">{eq.name}</b><i id="s-rar" style={{ color: RC[eq.rarity] }}>{RARITY_LABELS[eq.rarity]}</i><span className="hint" id="s-count">{ownedVis}/{TOTAL_VIS} {LB.unlocked}</span></div>
      <span className="badge">{LB.equipped}</span></div>
    <div className="shop-prog"><i style={{ width: Math.round(ownedVis / TOTAL_VIS * 100) + "%" }} /></div>
    <div className="shop-tools">
      <input type="search" value={q} placeholder={LB.shopSearch} onChange={e => setQ(e.target.value)} aria-label={LB.shopSearch} />
      <select value={sort} onChange={e => setSort(e.target.value)} aria-label={LB.sortBy.rarity}>
        {["rarity", "price", "name"].map(k => <option key={k} value={k}>{LB.sortBy[k]}</option>)}
      </select>
      <button className={"toggle" + (mineOnly ? " on" : "")} onClick={() => setMineOnly(v => !v)}>{LB.onlyMine}</button>
    </div>
    <div className="filters" id="shop-filters">
      <button data-f="all" className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>{LB.filterAll}</button>
      {RARITY_ORDER.map(r => <button key={r} data-f={r} className={filter === r ? "on" : ""} style={{ "--rc": RC[r] }} onClick={() => setFilter(r)}>{RARITY_LABELS[r]}</button>)}
    </div>
    <div className="shop-grid" id="shop-grid">{list.map(s => { const st = stateOf(s), sec = st === "secret";
      return <div key={s.id} className={"skin-card " + st + (s.id === sel ? " sel" : "")} data-skin={s.id} data-rar={s.rarity} style={{ "--rc": RC[s.rarity] }}
        onClick={() => setSel(s.id)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(s.id); } }}>
        <span className="rar-dot" />
        {st === "eq" ? <span className="badge">{LB.equipped}</span> : null}
        <SkinPreview skin={s} r={36} className="" secret={sec} />
        <b>{sec ? LB.secret : s.name}</b><i>{RARITY_LABELS[s.rarity]}</i>
        <em>{st === "eq" ? "" : st === "owned" ? LB.equip : sec ? "???" : st === "locked" ? s.desc
          : st === "lowlevel" ? `\uD83D\uDD12 ${LB.levelReq.replace("{n}", s.levelReq)}` : `${LB.coinIcon} ${fmt(s.price)}`}</em></div>; })}
      {list.length ? null : <div className="hint">{LB.noSkins}</div>}</div>
    <div className="card shop-detail" style={{ "--rc": RC[cur.rarity] }}>
      <SkinPreview skin={cur} r={38} className="" secret={curSt === "secret"} />
      <div className="info"><b>{curSt === "secret" ? LB.secret : cur.name}</b><i>{RARITY_LABELS[cur.rarity]}</i><span>{cur.desc}</span></div>
      <button className="act" disabled={curSt === "eq"} onClick={act}>{actLabel}</button>
    </div>
    {/* A skin "Retrato" é a única que precisa de um recurso do jogador além da compra: a foto. */}
    {cur.pattern === "avatar" && (curSt === "eq" || curSt === "owned") ? <AvatarPicker /> : null}
    <div className="shop-note hint">{LB.shopNote}</div>
  </>;
}

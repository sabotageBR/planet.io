import React, { useEffect, useState } from "react";
import { SKINS, skinById, RARITY_LABELS, RARITY_ORDER, RARITY_COLORS } from "@planet/shared";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { buySkin, equipSkin, loadSkins, toast } from "../state/actions.js";
import { useLabels, useTheme } from "../hooks/useTheme.js";
import { Nav, ScreenHeader, Screen } from "./bits.jsx";
import SkinPreview from "./SkinPreview.jsx";
import { fmt } from "./format.js";

export default function Shop({ on }) {
  return <Screen id="shop" on={on} className="shop-wrap">{on ? <Body /> : null}</Screen>;
}
function Body() {
  const LB = useLabels(), theme = useTheme(), RC = (theme && theme.rarityColor) || RARITY_COLORS; const session = useStore(app, s => s.session);
  const user = session.user || {}, owned = session.skins, coins = user.coins || 0, eqId = user.equippedSkin ?? 0, sk = skinById(eqId);
  const [filter, setFilter] = useState("all");
  useEffect(() => { loadSkins(); }, []);
  const list = SKINS.filter(s => filter === "all" || s.rarity === filter);
  const stateOf = s => { const own = owned.includes(s.id);
    return s.id === eqId ? "eq" : own ? "owned" : s.rarity === "secret" ? "secret" : s.unlockKey ? "locked" : s.price > coins ? "poor" : "buyable"; };
  const click = (s, st) => { if (st === "eq") return; if (st === "owned") return equipSkin(s.id); if (st === "buyable") return buySkin(s.id);
    if (st === "poor") return toast(LB.poorToast); if (st === "secret") return toast(LB.secretToast); return toast(LB.lockedToast + ": " + s.desc); };
  return <>
    <Nav cur="shop" /><ScreenHeader title={LB.shopTitle} />
    <div className="card shop-eq"><SkinPreview skin={sk} r={40} />
      <div className="skinmeta"><b id="s-skin">{sk.name}</b><i id="s-rar" style={{ color: RC[sk.rarity] }}>{RARITY_LABELS[sk.rarity]}</i><span className="hint" id="s-count">{owned.length}/{SKINS.length} {LB.unlocked}</span></div>
      <span className="badge">{LB.equipped}</span></div>
    <div className="filters" id="shop-filters">
      <button data-f="all" className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>{LB.filterAll}</button>
      {RARITY_ORDER.map(r => <button key={r} data-f={r} className={filter === r ? "on" : ""} style={{ "--rc": RC[r] }} onClick={() => setFilter(r)}>{RARITY_LABELS[r]}</button>)}
    </div>
    <div className="shop-grid" id="shop-grid">{list.map(s => { const st = stateOf(s), sec = st === "secret";
      return <div key={s.id} className={"skin-card " + st} data-skin={s.id} data-rar={s.rarity} style={{ "--rc": RC[s.rarity] }} onClick={() => click(s, st)} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); click(s, st); } }}>
        {st === "eq" ? <span className="badge">{LB.equipped}</span> : null}
        <SkinPreview skin={s} r={36} className="" secret={sec} />
        <b>{sec ? LB.secret : s.name}</b><i>{RARITY_LABELS[s.rarity]}</i>
        <em>{st === "eq" ? "" : st === "owned" ? LB.equip : sec ? "???" : st === "locked" ? s.desc : `${LB.coinIcon} ${fmt(s.price)}`}</em></div>; })}</div>
    <div className="shop-note hint">{LB.shopNote}</div>
  </>;
}

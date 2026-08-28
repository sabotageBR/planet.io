import React, { useEffect, useState } from "react";
import { skinById, RARITY_LABELS, RARITY_COLORS } from "@planet/shared";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { go, play, openAccount, setNick, loadRooms, loadTop5 } from "../state/actions.js";
import { useLabels, useTheme } from "../hooks/useTheme.js";
import { useInterval } from "../hooks/useInterval.js";
import { Field, MiniRank, Screen } from "./bits.jsx";
import SkinPreview from "./SkinPreview.jsx";
import { fmt } from "./format.js";

export default function Entry({ on }) {
  return <Screen id="entry" on={on} className="entry-wrap">{on ? <Body /> : null}</Screen>;
}
function Body() {
  const LB = useLabels(), theme = useTheme(), RC = (theme && theme.rarityColor) || RARITY_COLORS;
  const session = useStore(app, s => s.session), top5 = useStore(app, s => s.top5), rooms = useStore(app, s => s.rooms);
  const user = session.user || {}, sk = skinById(user.equippedSkin ?? 0), guest = user.kind !== "registered";
  const [nick, setNickLocal] = useState(user.nick || "");
  useEffect(() => { setNickLocal(user.nick || ""); }, [user.nick]);
  useInterval(() => { loadRooms(); loadTop5(); }, 5000, true);
  const commit = async () => { if (nick.trim() !== (user.nick || "")) { const r = await setNick(nick); if (!r.ok) setNickLocal(user.nick || ""); } };
  const links = [["modes", LB.modesShort], ["lobby", LB.rooms], ["rank", LB.ranking], ["profile", LB.profile], ["shop", LB.shop], ["prefs", LB.prefs]];
  return <>
    <div className="brand-block"><div className="brand">{LB.title}</div><div className="tagline">{LB.tagline}</div></div>
    <div className="card entry-main">
      <div className="coinbar">{LB.coinIcon} <b className="v-coins">{fmt(user.coins)}</b> <span>{LB.coinWord}</span></div>
      <Field id="nameIn" label={LB.nameLabel} maxLength={16} autoComplete="off" value={nick}
        onChange={e => setNickLocal(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      <div className="skinrow"><SkinPreview skin={sk} r={40} />
        <div className="skinmeta"><b id="m-skin">{sk.name}</b><i id="m-rar" style={{ color: RC[sk.rarity] || "#999" }}>{RARITY_LABELS[sk.rarity] || sk.rarity}</i></div>
        <button className="btn-mini" data-go="shop" onClick={() => go("shop")}>{LB.swap}</button></div>
      <button className="btn-primary" data-go="modes" onClick={() => { commit(); go("modes"); }}>{LB.play}</button>   {/* o JOGAR agora abre a escolha de modo; o play() ficou para o fim do funil */}
      <div className="entry-links">{links.map(([s, l]) => <button key={s} className="btn-secondary" data-go={s} onClick={() => go(s)}>{l}</button>)}</div>
      <div className="guest-note" data-kind={guest ? "guest" : "registered"}>
        <span className="gn-txt">{guest ? LB.guestNote : LB.registered}{session.online === false ? ` · ${session.server === false ? LB.offlineNote : LB.noDbNote}` : ""}</span>
        {guest ? <button className="btn-link" data-go="account" onClick={openAccount}>{LB.claim}</button> : null}
      </div>
      <div className="hint">{LB.hint}</div>
    </div>
    <aside className="card entry-side">
      <div className="ph">{LB.top5}</div><MiniRank id="entry-top5" rows={top5} n={5} />
      <div className="ph">{LB.activeRooms}</div>
      <div className="mini-rooms" id="entry-rooms">
        {rooms.slice(0, 4).map(r => <div className="mr-row" key={r.code} onClick={() => play({ room: r.code })} role="button"><b className="code">{r.code}</b><span>{r.players}/{r.max}</span><span className="dim">{r.ping != null ? `${r.ping} ms` : `${r.bots} ${LB.botsWord}`}</span></div>)}
        {!rooms.length ? <div className="mr-row dim"><span>{LB.noRooms}</span></div> : null}
      </div>
    </aside>
  </>;
}

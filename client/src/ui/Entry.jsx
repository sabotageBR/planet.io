// ── TELA INICIAL ──────────────────────────────────────────────────────────────
// O marcador `entry-v2` no wrap é o que permite reescrever esta tela sem tocar em arquivo GERADO:
// os temas estilizam a entrada com `:where(html[data-theme=…]) .brand` (especificidade ZERO por
// desenho do port.js), então `.entry-v2 .brand` em styles/ui.css passa por cima sem um `!important` —
// e `ui.css` é escrito à mão, nunca sobrescrito por `node client/src/theme/port.js`.
// As cores continuam vindo dos tokens do tema, então a tela segue mudando com o relógio.
import React, { useEffect, useState } from "react";
import { skinById, RARITY_LABELS, RARITY_COLORS, KEY_LABEL } from "@warspace/shared";
import { keysOf } from "../game/input/Keyboard.js";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { go, play, openAccount, setNick, loadRooms, loadTop5 } from "../state/actions.js";
import GoogleButton from "./GoogleButton.jsx";
import { useLabels, useTheme } from "../hooks/useTheme.js";
import { useInterval } from "../hooks/useInterval.js";
import { Field, MiniRank, Screen } from "./bits.jsx";
import SkinPreview from "./SkinPreview.jsx";
import Logo from "./Logo.jsx";
import NavIcon from "./NavIcons.jsx";
import { fmt } from "./format.js";

export default function Entry({ on }) {
  return <Screen id="entry" on={on} className="entry-wrap entry-v2">{on ? <Body /> : null}</Screen>;
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
  // A dica é a primeira coisa que alguém lê: com as teclas configuráveis, cravar "ESPAÇO/W" nela seria
  // mentir para exatamente quem foi lá trocar.
  const tk = keysOf(session.prefs);
  const dica = LB.hint.replaceAll("{s}", KEY_LABEL[tk.split] || tk.split).replaceAll("{e}", KEY_LABEL[tk.eject] || tk.eject);
  return <>
    <div className="brand-block">
      <Logo title={LB.title} />
      <div className="tagline">{LB.tagline}</div>
    </div>
    <div className="card entry-main">
      <div className="coinbar">{LB.coinIcon} <b className="v-coins">{fmt(user.coins)}</b> <span>{LB.coinWord}</span></div>
      {/* skin e nick num bloco só: são a MESMA decisão — com quem eu entro. Separados, a tela virava
          uma pilha de controles soltos, e era a pilha que parecia amadora, não cada peça. */}
      <div className="entry-id">
        <button className="id-skin" data-go="shop" onClick={() => go("shop")} title={LB.swap} aria-label={LB.swap}>
          <SkinPreview skin={sk} r={40} />
          <span className="id-swap">{LB.swap}</span>
        </button>
        <div className="id-fields">
          <Field id="nameIn" label={LB.nameLabel} maxLength={16} autoComplete="off" value={nick}
            onChange={e => setNickLocal(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
          <div className="skinmeta"><b id="m-skin">{sk.name}</b><i id="m-rar" style={{ color: RC[sk.rarity] || "#999" }}>{RARITY_LABELS[sk.rarity] || sk.rarity}</i></div>
        </div>
      </div>
      <button className="btn-primary" data-go="modes" onClick={() => { commit(); go("modes"); }}>{LB.play}</button>
      <div className="entry-links">{links.map(([s, l]) =>
        <button key={s} className="btn-secondary" data-go={s} onClick={() => go(s)}><NavIcon k={s} /><span>{l}</span></button>)}</div>
      <div className="guest-note" data-kind={guest ? "guest" : "registered"}>
        <span className="gn-txt">{guest ? LB.guestNote : LB.registered}{session.online === false ? ` · ${session.server === false ? LB.offlineNote : LB.noDbNote}` : ""}</span>
        {guest ? <button className="btn-link" data-go="account" onClick={openAccount}>{LB.claim}</button> : null}
        {guest ? <GoogleButton type="icon" /> : null}
      </div>
      <div className="hint">{dica}</div>
    </div>
    {/* Esta coluna existia, era consultada a cada 5 s e os TRÊS temas a escondiam com display:none.
        Ou some o pedido de rede, ou ela aparece — e o que ela mostra (quem está ganhando, onde tem
        gente jogando agora) é exatamente o que convence alguém a entrar. */}
    <aside className="card entry-side">
      <div className="side-block">
        <div className="ph">{LB.top5}</div><MiniRank id="entry-top5" rows={top5} n={5} />
      </div>
      <div className="side-block">
        <div className="ph">{LB.activeRooms}</div>
        <div className="mini-rooms" id="entry-rooms">
          {rooms.slice(0, 4).map(r => <div className="mr-row" key={r.code} onClick={() => play({ room: r.code })} role="button" tabIndex={0}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); play({ room: r.code }); } }}>
            <b className="code">{r.code}</b><span>{r.players}/{r.max}</span><span className="dim">{r.ping != null ? `${r.ping} ms` : `${r.bots} ${LB.botsWord}`}</span></div>)}
          {!rooms.length ? <div className="mr-row dim"><span>{LB.noRooms}</span></div> : null}
        </div>
      </div>
    </aside>
  </>;
}

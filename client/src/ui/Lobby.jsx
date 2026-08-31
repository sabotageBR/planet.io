import React, { useState } from "react";
import { skinById } from "@warspace/shared";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { play, loadRooms, loadTop5, toast } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { preenche } from "../i18n/index.js";
import { useInterval } from "../hooks/useInterval.js";
import { ScreenHeader, MiniRank, Screen } from "./bits.jsx";
import SkinPreview from "./SkinPreview.jsx";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export default function Lobby({ on }) {
  return <Screen id="lobby" on={on} className="lobby-wrap">{on ? <Body /> : null}</Screen>;
}
function Body() {
  const LB = useLabels();
  const session = useStore(app, s => s.session), rooms = useStore(app, s => s.rooms), top5 = useStore(app, s => s.top5), config = useStore(app, s => s.config);
  const user = session.user || {}, sk = skinById(user.equippedSkin ?? 0), guest = user.kind !== "registered";
  const [code, setCode] = useState("");
  useInterval(loadRooms, 5000, true);
  useInterval(loadTop5, 30000, true);
  const enter = () => { if (code.length !== 4) { toast(LB.roomCode + ": " + preenche(LB.fmt.chars, { n: 4 })); return; } play({ room: code }); };
  const create = () => {
    const shard = config && config.shard != null ? String(config.shard) : "0";
    let c = shard; for (let i = 0; i < 3; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    play({ room: c });
  };
  return <>
    <ScreenHeader title={LB.lobbyTitle} />
    <div className="card lobby-hero">
      <div className="me-chip"><SkinPreview skin={sk} r={20} size={56} className="skinprev-sm" /><div><b className="v-nick">{user.nick}</b><i className="v-kind" data-kind={guest ? "guest" : "registered"}>{guest ? LB.guest : LB.registered}</i></div></div>
      <button className="btn-primary" data-go="play" onClick={() => play({})}>{LB.playAuto}</button><span className="hint">{LB.autoNote}</span>
      <div className="code-row">
        <input id="codeIn" maxLength={4} placeholder={LB.roomCode} autoComplete="off" value={code}
          onChange={e => setCode(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 4))} onKeyDown={e => { if (e.key === "Enter") enter(); }} />
        <button className="btn-secondary" data-go="play" onClick={enter}>{LB.enter}</button>
        <button className="btn-secondary" data-go="play" onClick={create}>{LB.create}</button></div>
    </div>
    <div className="card room-list" id="room-list">
      <div className="room-row head"><span className="code">{LB.roomCode}</span><span className="shard">{LB.shard}</span><span className="pl">{LB.youLabel}s</span><span className="bots">{LB.botsWord}</span><span className="ping">{LB.ping}</span><span className="act"></span></div>
      {rooms.map(r => { const full = r.players >= r.max; return <div className={"room-row" + (full ? " full" : "")} data-code={r.code} key={r.code}>
        <b className="code">{r.code}</b><span className="shard">{r.shard}</span>
        <span className="pl"><i className="bar" style={{ "--p": r.max ? r.players / r.max : 0 }}></i>{r.players}/{r.max}</span><span className="bots">{r.bots}</span><span className="ping">{r.ping != null ? r.ping : "—"}</span>
        <span className="act"><button className="btn-mini" data-go="play" data-room={r.code} disabled={full} onClick={() => play({ room: r.code })}>{LB.enter}</button></span></div>; })}
      {!rooms.length ? <div className="room-row empty dim" style={{ display: "block" }}><span className="hint">{LB.noRooms}</span></div> : null}
    </div>
    <aside className="card lobby-side"><div className="ph">{LB.top5}</div><MiniRank id="lobby-top5" rows={top5} n={5} /></aside>
  </>;
}

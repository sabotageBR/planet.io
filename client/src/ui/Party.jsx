// Lobby de equipe: o código de convite, quem já entrou e o botão de começar.
// Polling a 1 Hz do GET /api/party/:code — é uma tela de espera, não precisa de WebSocket. Quando o LÍDER
// começa, o `started`/`room` do lobby chega no polling dos outros e cada um entra sozinho na MESMA sala
// (mesmo padrão do Round.jsx, que já entra numa sala nova quando o contador zera).
// As vagas que sobrarem viram BOT ALIADO no começo da partida — é o "autopreencher".
import React, { useState } from "react";
import { skinById } from "@warspace/shared";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { refreshParty, leaveParty, startParty, toast } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { useInterval } from "../hooks/useInterval.js";
import { Screen, ScreenHeader } from "./bits.jsx";
import SkinPreview from "./SkinPreview.jsx";

export default function Party({ on }) {
  return <Screen id="party" on={on} className="party-wrap">{on ? <Body /> : null}</Screen>;
}
function Body() {
  const LB = useLabels();
  const party = useStore(app, s => s.party), me = useStore(app, s => s.partyMe);
  const [copied, setCopied] = useState(false);
  useInterval(refreshParty, 1000, true);
  if (!party) return <><ScreenHeader title={LB.partyTitle} /><div className="hint">{LB.waitingFriends}</div></>;
  const link = `${location.origin}/?party=${party.code}`;
  const lider = !!(me && me.leader);   // só o líder começa a partida (o servidor também recusa, com 403)
  const vagas = Math.max(0, party.teamSize - party.members.length);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(link); } catch { /* sem permissão: o código na tela já serve */ }
    setCopied(true); toast(LB.linkCopied); setTimeout(() => setCopied(false), 1600);
  };
  return <>
    <ScreenHeader title={LB.partyTitle} />
    <div className="card party-card">
      <div className="party-code"><span>{LB.partyCode}</span><b>{party.code}</b>
        <button className="btn-mini" onClick={copiar}>{copied ? LB.linkCopied : LB.copyLink}</button></div>
      <div className="party-slots">
        {party.members.map(m => <div className={"party-slot" + (me && m.key === me.key ? " mine" : "")} key={m.key}>
          <SkinPreview skin={skinById(m.skinId ?? 0)} r={18} size={48} className="skinprev-sm" />
          <b>{m.nick}</b>{m.leader ? <i>{LB.partyLeader}</i> : null}
        </div>)}
        {Array.from({ length: vagas }, (_, i) => <div className="party-slot empty" key={"v" + i}>
          <span className="slot-dot">🤖</span><b>{LB.botAlly}</b>
        </div>)}
      </div>
      <div className="hint">{LB.partyHint}</div>
      <div className="party-actions">
        {lider ? <button className="btn-primary" onClick={startParty}>{LB.startMatch}</button>
               : <span className="hint waiting">{LB.waitingFriends}</span>}
        <button className="btn-secondary" onClick={leaveParty}>{LB.leaveParty}</button>
      </div>
    </div>
  </>;
}

// Escolha do modo: o funil que estava faltando entre a Entrada e o `play()`.
// LIVRE é o jogo de sempre (um clique e entra). SOBREVIVÊNCIA solo entra direto na fila (que é o aquecimento
// dentro de uma sala de verdade). EM EQUIPE passa pelo lobby de convite (Party.jsx), porque aí o jogador
// precisa de um código para mandar aos amigos antes de qualquer sala existir.
// Offline (`api.server === false`) o Sobrevivência fica desabilitado: o `?local=1` só sabe rodar o Livre.
import React, { useState } from "react";
import { MODE, SURVIVAL } from "@planet/shared";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { api } from "../api/client.js";
import { play, setMode, createParty, joinParty } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { Screen, ScreenHeader } from "./bits.jsx";

export default function Modes({ on }) {
  return <Screen id="modes" on={on} className="modes-wrap">{on ? <Body /> : null}</Screen>;
}
function Body() {
  const LB = useLabels();
  const teamSize = useStore(app, s => s.teamSize);
  const [code, setCode] = useState("");
  const offline = api.server === false;
  const ts = teamSize > 1 ? teamSize : 2;
  const SIZES = [[2, LB.duo], [3, LB.trio], [4, LB.quad]];
  return <>
    <ScreenHeader title={LB.modesTitle} />
    <div className="modes">
      <button className="mode-card" data-mode="free" onClick={() => { setMode(MODE.FREE, 1); play({ mode: MODE.FREE, teamSize: 1, party: null }); }}>
        <i className="mode-ico">🪐</i>
        <b>{LB.modeFree}</b>
        <span>{LB.modeFreeSub}</span>
      </button>
      <button className={"mode-card" + (offline ? " off" : "")} data-mode="solo" disabled={offline}
        onClick={() => { setMode(MODE.SURVIVAL, 1); play({ mode: MODE.SURVIVAL, teamSize: 1, party: null }); }}>
        <i className="mode-ico">☄️</i>
        <b>{LB.modeSolo}</b>
        <span>{LB.modeSoloSub}</span>
        <em className="mode-tag">{SURVIVAL.PLAYERS} · {LB.soloWord}</em>
      </button>
      <div className={"mode-card team" + (offline ? " off" : "")} data-mode="team">
        <i className="mode-ico">🛰️</i>
        <b>{LB.modeTeam}</b>
        <span>{LB.modeTeamSub}</span>
        <div className="team-sizes" role="radiogroup" aria-label={LB.teamSizeLabel}>
          {SIZES.map(([n, l]) => <button key={n} className={"chip-btn" + (ts === n ? " on" : "")} disabled={offline}
            onClick={() => setMode(MODE.SURVIVAL, n)}>{l}</button>)}
        </div>
        <button className="btn-primary" disabled={offline} onClick={() => createParty(ts)}>{LB.createParty}</button>
        <div className="code-row">
          <input maxLength={4} placeholder={LB.partyCode} autoComplete="off" value={code} disabled={offline}
            onChange={e => setCode(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 4))}
            onKeyDown={e => { if (e.key === "Enter") joinParty(code); }} />
          <button className="btn-secondary" disabled={offline} onClick={() => joinParty(code)}>{LB.joinParty}</button>
        </div>
      </div>
    </div>
    {offline ? <div className="hint">{LB.offlineNote}</div> : null}
  </>;
}

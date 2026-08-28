// Lobby do Battle Royale: a sala ENCHENDO à vista, e depois a contagem regressiva.
// Fica por cima do canvas (dentro do #hud) porque no lobby ninguém está no mapa — não há o que olhar atrás,
// e a espera é a tela. O servidor manda o estado a 2 Hz em MILISSEGUNDOS (no lobby não há snapshot, então o
// relógio de tick do cliente nunca sincronizaria); quem faz o número descer liso é o motor, descontando o
// tempo desde que a mensagem chegou.
// Os participantes aparecem um a um, na ordem em que chegam — é o preenchimento gradual do servidor que dá
// o ritmo, e este componente só desenha o que recebe.
import React from "react";
import { skinById } from "@planet/shared";
import { useLabels } from "../hooks/useTheme.js";
import SkinPreview from "./SkinPreview.jsx";

const MOSTRA = 24;   // teto de chips desenhados: 50 SkinPreview por frame é canvas demais para uma tela de espera

export default function BrLobby({ lobby }) {
  const LB = useLabels();
  if (!lobby) return null;
  const { filled = 0, cap = 0, startsInMs = 0, waitMs = 0, roster = [] } = lobby;
  const contando = startsInMs > 0;
  const seg = Math.ceil((contando ? startsInMs : waitMs) / 1000);
  const pct = cap ? Math.min(1, filled / cap) : 0;
  // eu sempre apareço; o resto entra na ordem de chegada até o teto
  const eu = roster.find(r => r.me);
  const outros = roster.filter(r => !r.me).slice(0, MOSTRA - (eu ? 1 : 0));
  const chips = eu ? [eu, ...outros] : outros;
  const restam = Math.max(0, filled - chips.length);
  return <div id="br-lobby" className={contando ? "go" : ""}>
    <div className="brl-card">
      <div className="brl-title">{LB.brLobbyTitle}</div>
      <div className="brl-count"><b>{filled}</b><span>/{cap}</span></div>
      <div className="brl-bar"><i style={{ "--p": pct.toFixed(3) }} /></div>
      <div className="brl-sub">{contando ? LB.brStarting : LB.brWaiting}</div>
      <div className={"brl-clock" + (contando ? " big" : "")}>{seg}</div>
      <div className="brl-roster">
        {chips.map(r => <div className={"brl-chip" + (r.me ? " me" : "")} key={r.slot}>
          <SkinPreview skin={skinById(r.skinId ?? 0)} r={14} size={36} className="skinprev-sm" />
          <b>{r.name}</b>
        </div>)}
        {restam > 0 ? <div className="brl-chip more">+{restam}</div> : null}
      </div>
      <div className="brl-hint">{LB.brHint}</div>
    </div>
  </div>;
}

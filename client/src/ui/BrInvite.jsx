// ── CONVITE DE BATTLE ROYALE: alguém começou um BR, e este jogador está no modo Livre ──────────
// Card pequeno, não bloqueante (o jogo continua rodando atrás) — ao contrário dos modais de tela cheia
// (AccountModal/Shop/Pause), aqui o jogador está NO MEIO de uma partida do Livre.
// Expira sozinho pelo `at+ttlMs` do servidor, no mesmo padrão de Notice.jsx.
import React, { useEffect, useState } from "react";
import { play } from "../state/actions.js";
import { getGame } from "../state/game.js";
import { MODE } from "@warspace/shared";
import { useLabels } from "../hooks/useTheme.js";

export default function BrInvite({ b }) {
  const LB = useLabels();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!b) return;
    const resta = b.at + b.ttlMs - performance.now();
    if (resta <= 0) return;
    const t = setTimeout(() => tick(x => x + 1), resta + 30);
    return () => clearTimeout(t);
  }, [b]);
  if (!b || performance.now() > b.at + b.ttlMs) return null;
  const fecha = () => { const g = getGame(); if (g) g.dismissBrInvite(); };
  const entra = () => { fecha(); play({ room: b.room, mode: MODE.BR, teamSize: 1, party: null }); };
  return <div id="br-invite" className="card" role="dialog" aria-label={LB.brInviteTitle}>
    <b>{LB.brInviteTitle}</b>
    <span>{LB.brInviteBody}</span>
    <div className="bi-actions">
      <button className="btn-secondary" onClick={fecha}>{LB.brInviteNo}</button>
      <button className="btn-primary" onClick={entra} autoFocus>{LB.brInviteYes}</button>
    </div>
  </div>;
}

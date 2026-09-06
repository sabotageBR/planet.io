// ── CONVITE DE BATTLE ROYALE: alguém começou um BR, e este jogador está no modo Livre ──────────
// Card pequeno, não bloqueante (o jogo continua rodando atrás) — ao contrário dos modais de tela cheia
// (AccountModal/Shop/Pause), aqui o jogador está NO MEIO de uma partida do Livre.
// Expira sozinho pelo `at+ttlMs` do servidor, no mesmo padrão de Notice.jsx.
import React, { useEffect, useState } from "react";
import { play, setPref } from "../state/actions.js";
import { getGame } from "../state/game.js";
import { app } from "../state/app.js";
import { useStore } from "../state/store.js";
import { MODE } from "@warspace/shared";
import { useLabels } from "../hooks/useTheme.js";

export default function BrInvite({ b }) {
  const LB = useLabels();
  const prefs = useStore(app, s => s.session.prefs);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!b) return;
    const resta = b.at + b.ttlMs - performance.now();
    if (resta <= 0) return;
    const t = setTimeout(() => tick(x => x + 1), resta + 30);
    return () => clearTimeout(t);
  }, [b]);
  // ⚠️ A PREF É LIDA AQUI, e não no motor: `brInvite:false` tem que valer para o card que JÁ chegou (o
  // jogador acabou de desligar nas Opções com um convite na tela), e o servidor continua mandando — o
  // cooldown de `Room.brInvite` reduz a frequência, mas quem decide se aparece é quem está olhando.
  if (!b || prefs.brInvite === false || performance.now() > b.at + b.ttlMs) return null;
  const fecha = () => { const g = getGame(); if (g) g.dismissBrInvite(); };
  const entra = () => { fecha(); play({ room: b.room, mode: MODE.BR, teamSize: 1, party: null }); };
  // "Nunca" é a mesma pref das Opções, escrita daqui. É o lugar em que ela é óbvia: quem quer desligar o
  // aviso está olhando para ele, no meio de uma partida, e não vai abrir um menu para procurá-la.
  const nunca = () => { fecha(); setPref("brInvite", false); };
  return <div id="br-invite" className="card" role="dialog" aria-label={LB.brInviteTitle}>
    <b>{LB.brInviteTitle}</b>
    <span>{LB.brInviteBody}</span>
    <div className="bi-actions">
      <button className="bi-nunca" onClick={nunca} title={LB.brInviteNeverTip}>{LB.brInviteNever}</button>
      <button className="btn-secondary" onClick={fecha}>{LB.brInviteNo}</button>
      {/* ⚠️ SEM `autoFocus`. Ele roubava o teclado no meio de uma partida do Livre: o card sobe sozinho, sem
          ninguém ter pedido, e a partir dali um Espaço (dividir) virava "clicar em Entrar" e mandava o
          jogador para outra sala. Foco que se toma de quem está jogando é foco tomado na pior hora. */}
      <button className="btn-primary" onClick={entra}>{LB.brInviteYes}</button>
    </div>
  </div>;
}

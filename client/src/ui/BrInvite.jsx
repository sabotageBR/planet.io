// ── CONVITE DE BATTLE ROYALE: alguém começou um BR, e este jogador está no modo Livre ──────────
// Card pequeno, não bloqueante (o jogo continua rodando atrás) — ao contrário dos modais de tela cheia
// (AccountModal/Shop/Pause), aqui o jogador está NO MEIO de uma partida do Livre.
// Expira sozinho pelo `at+ttlMs` do servidor, no mesmo padrão de Notice.jsx.
import React, { useEffect, useState } from "react";
import { play } from "../state/actions.js";
import { getGame } from "../state/game.js";
import { app } from "../state/app.js";
import { useStore } from "../state/store.js";
import { MODE, BR } from "@warspace/shared";
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
  // SILENCIAR É DESTA SALA, e a escolha do alcance é o ponto. Este botão já foi a pref `brInvite` da conta
  // — "nunca mais, em lugar nenhum" —, e isso é grande demais para uma decisão tomada no meio de uma
  // partida, com um card na frente: quem só queria sossego AGORA desligava o aviso para sempre e só
  // descobriria como voltar atrás procurando em Opções. Hoje ele vale enquanto o jogador estiver nesta
  // sala; na próxima do Livre ele é avisado de novo e pode calar de novo lá. Quem quer o "nunca mais"
  // continua tendo: é a pref, nas Opções e no menu do Esc.
  // ⚠️ Quem corta é o SERVIDOR (`Session.brMudo`, via `{t:"brMute"}`), não esta tela — o alcance "esta
  // sala" é a própria SESSÃO, que nasce com o socket e morre com ele. Nada a expirar, nada a lembrar.
  const silencia = () => { const g = getGame(); if (g) g.muteBrInvite(); };
  return <div id="br-invite" className="card" role="dialog" aria-label={LB.brInviteTitle}>
    <b>{LB.brInviteTitle}</b>
    <span>{LB.brInviteBody}</span>
    <div className="bi-actions">
      {/* O BOTÃO é 'agora não, NESTA sala' (Session.brMudo, memória, morre com o socket); a pref
          `brInvite` das Opções é 'nunca mais' (banco). `BR.INVITE_MUTE` é o interruptor do /admin
          sobre o primeiro — e a pref continua de pé com ele desligado, senão o jogador ficaria sem
          saída nenhuma, contra o que os portais pedem por escrito. */}
      {BR.INVITE_MUTE ?
      <button className="bi-mudo" onClick={silencia} title={LB.brInviteMuteTip}>{LB.brInviteMute}</button> : null}
      <button className="btn-secondary" onClick={fecha}>{LB.brInviteNo}</button>
      {/* ⚠️ SEM `autoFocus`. Ele roubava o teclado no meio de uma partida do Livre: o card sobe sozinho, sem
          ninguém ter pedido, e a partir dali um Espaço (dividir) virava "clicar em Entrar" e mandava o
          jogador para outra sala. Foco que se toma de quem está jogando é foco tomado na pior hora. */}
      <button className="btn-primary" onClick={entra}>{LB.brInviteYes}</button>
    </div>
  </div>;
}

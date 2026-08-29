// ── KILL FEED (estilo Counter-Strike), no alto da coluna DIREITA ──────────────
// Uma linha por morte: matador → ícone de COMO → vítima. As linhas em que EU apareço (matando, morrendo ou
// dando assistência) vêm destacadas, que é o que faz o feed valer a atenção num canto da tela.
//
// ⚠️ Uma coisa que o jogo obriga a contar direito: `killPiece` só é chamado com `eaten`, `zone` e
// `blackhole` — míssil, estrela, asteroide e supernova NUNCA matam sozinhos (todos param no piso
// MIN_PIECE_R). Eles AMOLECEM. Por isso `how` (com o quê) e o matador são campos separados, e existe a
// assistência: a linha honesta é "⭐ · Fulano devorou Beltrano", não "Beltrano morreu na estrela".
//
// As linhas somem pela IDADE (FEED.TTL_MS), com o mesmo relógio de 1 Hz que o Chat usa — sem ele a última
// linha ficaria eterna até chegar outra.
import React, { useEffect, useState } from "react";
import { FEED } from "@warspace/shared";
import { useLabels } from "../hooks/useTheme.js";
import { HOW_ICON, SYS_ICON } from "./icons.js";
import { Nick } from "./bits.jsx";

export default function KillFeed({ h }) {
  const LB = useLabels();
  const linhas = h.feed || [];
  const [, setTick] = useState(0);
  useEffect(() => { if (!linhas.length) return; const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, [linhas.length]);
  const agora = Date.now();
  const vivas = linhas.filter(l => agora - l.at < FEED.TTL_MS);
  if (!vivas.length) return null;
  const F = LB.killFeed || {};
  const sysText = l => (F["sys_" + l.how] || l.how).replace("{n}", l.how === "crunch" ? crunchLabel(l.n) : (l.a && l.a.name) || l.n);
  return <div id="kill-feed">
    {/* mais nova em cima, como no CS */}
    {[...vivas].reverse().map(l => l.k === "sys"
      ? <div key={l.id} className={"kf-row kf-sys" + (l.mine ? " mine" : "")}>
          <i className="kf-ico">{SYS_ICON[l.how] || "•"}</i><span>{sysText(l)}</span></div>
      : <div key={l.id} className={"kf-row" + (l.mine ? " mine" : "") + (l.a && l.a.ally ? " ally" : "")}>
          {l.a ? <Nick p={l.a} /> : <span className="kf-who dim">{F.world || "o espaço"}</span>}
          {/* Com assistência, os DOIS ícones aparecem: o que amoleceu (esmaecido) e o que finalizou. */}
          <span className="kf-how" title={(l.assist ? `${F[l.byHow] || l.byHow} ${F.assist} · ` : "") + (F[l.how] || l.how)}>
            {l.assist ? <><i className="kf-ico assist">{HOW_ICON[l.byHow] || "•"}</i><span className="kf-plus">+</span></> : null}
            <i className="kf-ico">{HOW_ICON[l.how] || "•"}</i></span>
          {l.b ? <Nick p={l.b} /> : null}</div>)}
  </div>;
}
const crunchLabel = s => s >= 60 ? `${Math.round(s / 60)} min` : `${s}s`;

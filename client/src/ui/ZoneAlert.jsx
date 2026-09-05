// ── AVISOS REFORÇADOS DO GÁS ───────────────────────────────────────────────
// ZoneWarnBanner: contagem escalonada (10s/3s) ANTES do fechamento começar — client-side puro, computado
// de `zoneIn` (que já chega a 8 Hz global). ZoneAlarmFlash: o instante em que o gás REALMENTE começa a se
// mover — vem do servidor (`zoneMove`, room-wide, sem filtro de AOI) porque só ele sabe.
import React, { useEffect, useState } from "react";
import { preenche } from "../i18n/index.js";
import { useLabels } from "../hooks/useTheme.js";

const TTL_MS = 2600;
export function ZoneWarnBanner({ w }) {
  const LB = useLabels();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!w) return;
    const resta = w.at + TTL_MS - performance.now();
    if (resta <= 0) return;
    const t = setTimeout(() => tick(x => x + 1), resta + 30);
    return () => clearTimeout(t);
  }, [w]);
  if (!w || performance.now() > w.at + TTL_MS) return null;
  return <div className={"zone-warn-banner" + (w.sec <= 3 ? " urgent" : "")} role="status" aria-live="assertive">
    {preenche(LB.zoneWarnAt, { n: Math.round(w.sec) })}
  </div>;
}
// `key={at}` força o React a REMONTAR o elemento a cada disparo, reiniciando a animação CSS do zero —
// sem timer nenhum em JS: a animação termina em opacidade 0 (animation-fill-mode:forwards) sozinha.
export function ZoneAlarmFlash({ at }) {
  if (!at) return null;
  return <div key={at} className="zone-alarm-flash" aria-hidden="true" />;
}

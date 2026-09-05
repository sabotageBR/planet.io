// ── "VOCÊ VAI SAIR DA SALA" ───────────────────────────────────────────────────
// A faixa dos últimos segundos antes de o servidor remover quem está ausente. Ninguém pode ser removido sem
// ter tido a chance de reagir — e reagir aqui é literalmente mexer o mouse, então a faixa some sozinha no
// primeiro gesto (quem a apaga é `marcaAtivo`, no motor, no mesmo instante em que o `{t:"awake"}` sai).
//
// ⚠️ SLOT PRÓPRIO, não o `notice`. Aquele é o aviso que o /admin difunde: ele só EXPIRA, este é CANCELÁVEL,
// e dividir o mesmo campo faria um aviso de manutenção apagar este — e vice-versa — sem nada acusando.
// ⚠️ `alert`/`aria-live="assertive"`, e não `status`: isto interrompe, não informa.
// ⚠️ A contagem é do CLIENTE, a partir do `inMs` que veio pronto. O laço do servidor é de 1 Hz, mas ele
// calcula o prazo exato, então o número na tela está certo mesmo com a amostragem grossa — é o mesmo truque
// do `startsInMs` do lobby.
import React, { useEffect, useState } from "react";
import { preenche } from "../i18n/index.js";
import { useLabels } from "../hooks/useTheme.js";

export default function IdleWarn({ n }) {
  const LB = useLabels();
  const [, tick] = useState(0);
  const resta = n ? n.at + n.inMs - performance.now() : 0;
  useEffect(() => {
    if (!n || resta <= 0) return;
    const t = setTimeout(() => tick(x => x + 1), 250);
    return () => clearTimeout(t);
  });
  if (!n || resta <= 0) return null;
  return <div id="idle-warn" className="notice warn" role="alert" aria-live="assertive">
    <i aria-hidden="true">💤</i><span>{preenche(LB.idleWarn, { n: Math.ceil(resta / 1000) })}</span>
  </div>;
}

// ── AVISO GLOBAL: a faixa que o painel /admin manda para quem está jogando ────
// Ela existe porque o chat é fácil de não ver no meio de uma partida — e a mesma mensagem também entra
// como linha de sistema no chat (game/index.js), para quem estiver olhando para lá. Duas saídas, uma
// fonte: quem viu numa não precisa da outra.
// Expira sozinha pelo `at + ttlMs` que veio do servidor. `role="status"` + `aria-live` porque um aviso
// que só existe visualmente não é um aviso para quem usa leitor de tela.
import React, { useEffect, useState } from "react";

export default function Notice({ n }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!n) return;
    const resta = n.at + n.ttlMs - performance.now();
    if (resta <= 0) return;
    const t = setTimeout(() => tick(x => x + 1), resta + 30);
    return () => clearTimeout(t);
  }, [n]);
  if (!n || performance.now() > n.at + n.ttlMs) return null;
  return <div id="notice" className={"notice " + (n.level === "warn" ? "warn" : "info")} role="status" aria-live="polite">
    <i aria-hidden="true">{n.level === "warn" ? "⚠️" : "📣"}</i><span>{n.text}</span>
  </div>;
}

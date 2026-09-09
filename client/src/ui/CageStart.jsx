// ── A CONTAGEM 3·2·1 DA GAIOLA DE LARGADA (Battle Royale) ────────────────────
// Um número grande no meio da tela e uma linha de rodapé, e nada mais: ao contrário do lobby (que é uma
// TELA, porque ali ninguém está no mapa), aqui o jogador precisa VER o octógono e os 49 planetas em volta.
// Por isso não há cartão, não há véu e o overlay é `pointer-events:none` — tapar a largada seria o oposto
// do que ela existe para fazer.
// O número desce sozinho a partir de {ms,at}, no mesmo contrato de `lobby.startsInMs`: o HUD roda a 8 Hz, e
// um segundo mudando com 125 ms de atraso lê como travamento. Nada de state por frame — um rAF escrevendo
// `textContent` num ref, que é o que este componente inteiro faz.
import React, { useEffect, useRef } from "react";
import { useLabels } from "../hooks/useTheme.js";

export default function CageStart({ c }) {
  const LB = useLabels();
  const num = useRef(null);
  useEffect(() => {
    if (!c || !num.current) return;
    let raf = 0;
    const passo = () => {
      const el = num.current; if (!el) return;
      const resta = c.ms - (performance.now() - c.at);
      // ⚠️ `ceil` e piso em 1: com `round` o "1" aparece por meio segundo e some antes de o octógono abrir,
      // e o jogador lê a contagem terminando em 2. O zero quem mostra é a gaiola sumindo.
      el.textContent = String(Math.max(1, Math.ceil(resta / 1000)));
      raf = requestAnimationFrame(passo);
    };
    passo();
    return () => cancelAnimationFrame(raf);
  }, [c]);
  if (!c) return null;
  return <div id="cage-start" aria-hidden="true">
    <div className="cs-titulo">{LB.brCageTitle}</div>
    <div className="cs-num" ref={num} />
    <div className="cs-dica">{LB.brCageHint}</div>
  </div>;
}

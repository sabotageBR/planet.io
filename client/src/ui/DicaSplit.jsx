// ── A DICA DO DIVIDIR ─────────────────────────────────────────────────────────
// Aparece colada ao rodapé da área de jogo quando o jogador PODE dividir e tem presa ao alcance de um
// salto, e some no primeiro split. A decisão inteira mora em `game/dica.js` (pura e testada); aqui só se
// desenha o que ela mandou. O porquê está lá: sem dividir, a física não deixa alcançar ninguém.
// ⚠️ `key={d.at}` REMONTA o elemento a cada aparição, reiniciando a animação de entrada do zero — é o
// mesmo motivo do `key` de `ZoneAlarmFlash` e do `<RoundIntro>`.
import React from "react";
import { preenche } from "../i18n/index.js";
import { useLabels } from "../hooks/useTheme.js";

export default function DicaSplit({ d, tecla }) {
  const LB = useLabels();
  if (!d) return null;
  // No dedo o comando é um BOTÃO, não uma tecla: citar "Espaço" num celular é a mesma mentira que a dica
  // da tela inicial já comete ao dizer "mouse = mover" para quem não tem mouse.
  const txt = d.dedo ? LB.hintSplitTouch : preenche(LB.hintSplit, { k: tecla });
  return <div key={d.at} className="dica-split" role="status" aria-live="polite">{txt}</div>;
}

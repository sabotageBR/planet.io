// ── A FAIXA DA MISSÃO DE SESSÃO 0 ────────────────────────────────────────────
// Uma linha de texto colada ao rodapé da área de jogo, e no máximo UMA por vez — isso não é disciplina
// daqui: `passoMissao` (game/dica.js) devolve `banda` como uma string só, então é impossível violar.
// Três etapas: coma as pedras · coma o planeta pequeno · divida para alcançar. A decisão inteira mora
// naquele módulo (puro e testado); aqui só se desenha o que ela mandou.
//
// ⚠️ `key={d.id + d.at}` e não só `d.at`: a TROCA DE ETAPA tem que remontar o elemento para a animação de
// entrada rodar de novo — e dois instantes podem coincidir. É o mesmo motivo do `key` de `ZoneAlarmFlash`
// e do `<RoundIntro>`.
// ⚠️ Só a etapa 3 cita um COMANDO, e ela tem a variante de dedo: citar "Espaço" num celular é a mesma
// mentira que a dica da tela inicial já comete ao dizer "mouse = mover" para quem não tem mouse. As duas
// primeiras não citam tecla nem botão, então valem iguais nos dois.
import React from "react";
import { preenche } from "../i18n/index.js";
import { useLabels } from "../hooks/useTheme.js";

export default function DicaSplit({ d, tecla }) {
  const LB = useLabels();
  if (!d) return null;
  const txt = d.id === "comer" ? LB.hintEat
    : d.id === "presa" ? LB.hintPrey
      : d.dedo ? LB.hintSplitTouch : preenche(LB.hintSplit, { k: tecla });
  return <div key={d.id + d.at} className={"dica-split dica-" + d.id} role="status" aria-live="polite">{txt}</div>;
}

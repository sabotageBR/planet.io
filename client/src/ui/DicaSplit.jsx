// ── A FAIXA DA MISSÃO DE SESSÃO 0 ────────────────────────────────────────────
// Colada ao rodapé da área de jogo, e no máximo UMA por vez — isso não é disciplina daqui: `passoMissao`
// (game/dica.js) devolve `banda` como uma string só, então é impossível violar. Três etapas: coma as
// partículas · coma o planeta pequeno · divida para alcançar. A decisão inteira mora naquele módulo (puro e
// testado); aqui só se desenha o que ela mandou.
//
// ⚠️ ELA VIROU DESENHO (28/09/2026, a recusa do Web Fit Test da Poki: "players on Poki really don't like
// reading"): grãos → planeta, com a barra das 8 partículas; planeta → planeta menor com o ANEL VERDE (o mesmo
// verde do anel que o novato vê em volta de quem ele come no mundo — `Planets.js`); e a tecla (ou o botão do
// dedo) com o arco do salto, que é o mesmo arco do tutorial. A frase continua existindo, no `aria-label`, e
// fora do pacote (`ENXUTO`) ela ainda aparece ao lado do desenho.
// ⚠️ `key={d.id + d.at}` e não só `d.at`: a TROCA DE ETAPA tem que remontar o elemento para a animação de
// entrada rodar de novo — e dois instantes podem coincidir. É o mesmo motivo do `key` de `ZoneAlarmFlash`
// e do `<RoundIntro>`.
// ⚠️ Só a etapa 3 cita um COMANDO, e ela tem a variante de dedo: a tecla num celular é a mesma mentira que a
// dica da tela inicial já cometeu ao dizer "mouse = mover" para quem não tem mouse. No dedo quem é apontado é o
// botão DE VERDADE (`#t-split.dica` pulsa), e o desenho aqui só repete a forma dele.
import React from "react";
import { preenche } from "../i18n/index.js";
import { useLabels } from "../hooks/useTheme.js";
import { ENXUTO } from "../portal/flags.js";
import { Glifo } from "./tutorPecas.jsx";

/** A seta "isto vira aquilo", no mesmo traço dos três desenhos. */
const Seta = ({ x }) => <path d={`M${x} 16h13m-5-5 5 5-5 5`} className="ds-seta" />;

/** O QUE fazer em cada etapa, sem uma palavra. SVG inline — nada de imagem nova no pacote. */
function Desenho({ d, tecla }) {
  if (d.id === "comer") return <svg className="ds-svg" viewBox="0 0 96 32" aria-hidden="true">
    <circle cx="9" cy="12" r="4" className="ds-grao a" /><circle cx="20" cy="21" r="3.6" className="ds-grao b" /><circle cx="22" cy="9" r="3.2" className="ds-grao c" />
    <Seta x={33} /><circle cx="72" cy="16" r="13" className="ds-eu" />
  </svg>;
  if (d.id === "presa") return <svg className="ds-svg" viewBox="0 0 96 32" aria-hidden="true">
    <circle cx="15" cy="16" r="13" className="ds-eu" /><Seta x={35} />
    <circle cx="74" cy="16" r="7" className="ds-presa" /><circle cx="74" cy="16" r="11.5" className="ds-anel" />
  </svg>;
  return <>
    {d.dedo ? <svg className="ds-btn" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" className="ds-btn-fundo" /><circle cx="11" cy="16" r="5" className="ds-eu" /><circle cx="22" cy="16" r="5" className="ds-eu" />
    </svg> : <Glifo p={{ tipo: "tecla", rotulo: tecla }} />}
    <svg className="ds-svg" viewBox="0 0 96 32" aria-hidden="true">
      <circle cx="12" cy="22" r="9" className="ds-eu" />
      <path d="M22 17 Q46 -3 70 14" className="ds-arco" /><path d="M63 9l7 5-8 3" className="ds-seta" />
      <circle cx="82" cy="20" r="6.5" className="ds-presa" />
    </svg>
  </>;
}

export default function DicaSplit({ d, tecla }) {
  const LB = useLabels();
  if (!d) return null;
  const txt = d.id === "comer" ? LB.hintEat
    : d.id === "presa" ? LB.hintPrey
      : d.dedo ? LB.hintSplitTouch : preenche(LB.hintSplit, { k: tecla });
  const pct = d.id === "comer" && d.alvo ? Math.round(100 * Math.min(1, (d.n || 0) / d.alvo)) : -1;
  return <div key={d.id + d.at} className={"dica-split dica-" + d.id} role="status" aria-live="polite" aria-label={txt}>
    <Desenho d={d} tecla={tecla} />
    {pct >= 0 ? <i className="ds-barra" aria-hidden="true"><i style={{ width: pct + "%" }} /></i> : null}
    {ENXUTO ? null : <span className="ds-txt">{txt}</span>}
  </div>;
}

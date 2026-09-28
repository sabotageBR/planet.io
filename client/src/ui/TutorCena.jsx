// ── TUTORIAL · O MODELO CENA — "mostre, não diga" ────────────────────────────
// O modelo PADRÃO (`ui/tutorEstilo.js`). Desde 28/09/2026 ele NÃO TEM TEXTO NENHUM na tela, e isso é a
// resposta literal à recusa do Web Fit Test da Poki: "players on Poki really don't like reading so onboarding
// needs to be visual instead of textual explanations" — e o guia deles diz o mesmo ("walls of text
// intimidate… use images, animations, and gestures").
//
// ⚠️ **A INSTRUÇÃO SAIU DA FAIXA E FOI PARA O MUNDO.** Havia aqui uma tirinha de três quadros (gesto ▸ ação ▸
// resultado), a palavra gigante (MOVA · DIVIDA), um "SUA VEZ!" e uma frase. Tudo isso era uma explicação
// DESENHADA LONGE da coisa explicada. Hoje o gesto é desenhado ONDE ele tem de ser feito, pela camada
// `renderer/layers/Guia.js` (a decisão é pura, em `game/guia.js`): a mão ou o cursor tocando a estrela, o
// rastro indo até os pedaços, o arco tracejado até a presa. Aqui sobram só as peças que não cabem no mundo:
//   · a TRILHA das etapas (bolas, sem o "1/2" escrito) e o PULAR como ícone;
//   · a BARRA da etapa 1 (o progresso contínuo — a massa dos cacos);
//   · o SELO ✓ da etapa que fechou;
//   · no MOUSE, a TECLA de dividir no rodapé (no dedo quem pulsa é o botão DE VERDADE, `data-alvo`).
// ⚠️ A frase continua EXISTINDO para o leitor de tela (`aria-label`): quem não vê o gesto precisa ouvi-lo.
// O clássico (`?tutor=classico`, ui/Tutor.jsx) segue com o texto de sempre.
// ⚠️ `#tutor` e `data-etapa`/`data-alvo` são API (ver o cabeçalho de `tutorPecas.jsx`).
import React from "react";
import { ETAPA, posicaoDaEtapa } from "../game/tutor.js";
import { falaDoTutor, promptDoTutor, alvoDoTutor } from "./tutorFala.js";
import { Trilha, Pular, PromptRodape, useEntraSozinho } from "./tutorPecas.jsx";

export default function TutorCena({ d, T, tecla }) {
  useEntraSozinho(!!d.fim && !d.demo);

  // ── FIM: NÃO HÁ TELA. Acabou a última lição, entra na sala (`useEntraSozinho`, com `TUTOR.FIM_MS` = 0) ──
  // O parabéns e a PROMESSA DA SKIN são a faixa de `TutorParabens.jsx`, por cima da primeira partida.
  if (d.fim) return null;

  const n = d.etapa;
  const [, txt] = falaDoTutor(d, T, tecla);   // só para o leitor de tela — ver o cabeçalho
  const p = promptDoTutor(d, T, tecla);
  const barra = n === ETAPA.NOVA && !d.pre
    ? <i className="tc-barra" role="progressbar" aria-valuenow={Math.round(d.pct * 100)} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: Math.round(d.pct * 100) + "%" }} /></i> : null;

  return <>
  <div id="tutor" data-style="cena" data-etapa={n} data-alvo={alvoDoTutor(d) || undefined}>
    <div className="tc-palco" role="status" aria-live="polite" aria-label={txt}>
      <div className="tc-topo"><Trilha pos={posicaoDaEtapa(n)} T={T} semPasso /><Pular T={T} icone /></div>
      {barra}
      {/* O SELO: o elogio da etapa que acabou de fechar, sem uma palavra — o ✓ grande e o som da `festa`.
          ⚠️ `key` = a etapa elogiada: o selo da 2 é OUTRO elemento que o da 1, então a entrada toca de novo. */}
      {d.ok && d.ok.n ? <div id="tutor-selo" key={d.ok.n} aria-hidden="true"><i>✓</i></div> : null}
    </div>
  </div>
  {/* a TECLA de dividir no rodapé, para quem joga no MOUSE — o único lugar onde o jogo pode dizer qual tecla
      é (no desktop não existe botão na tela). No dedo quem faz esse papel é o botão real, pulsando.
      ⚠️ IRMÃO do `#tutor`, nunca filho: `#tut-prompt` é absoluto com `bottom`, e o `#tutor` é colado no TOPO. */}
  {!d.dedo && n === ETAPA.SPLIT ? <PromptRodape p={p} semRotulo /> : null}
  </>;
}

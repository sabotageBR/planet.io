// ── TUTORIAL · O MODELO CENA — "mostre, não diga" ────────────────────────────
// O modelo PADRÃO (`ui/tutorEstilo.js`): escolhido pelo dono do jogo entre três candidatos jogados em
// bancada (os outros dois — `legenda` e `sargento` — saíram do código).
//
// A ideia: uma TIRINHA de três quadros — GESTO ▸ AÇÃO ▸ RESULTADO — que ensina sem depender de ler. O
// público da Poki é o mundo (e muita criança), e a UI só existe em três idiomas: um desenho de "aperte
// isto → acontece aquilo → você ganha isto" atravessa qualquer língua. A palavra gigante (MOVA · ATIRE ·
// DIVIDA) e a frase continuam lá para quem lê.
// O elenco é fixo (ver `ARTE` em `tutorPecas.jsx`): o MARTE é você — é o planeta que o aluno está
// pilotando — e a TERRA é o outro, com a mesma cara que o alvo tem no mundo.
//
// ⚠️ **A TIRINHA É ESTÁTICA, E A ANIMAÇÃO SÓ ACENDE UM QUADRO POR VEZ.** Não é economia: deitado, cada
// quadro tem ~44 px de altura, e uma animação livre nesse tamanho vira borrão. E `body[data-reduce="1"] *`
// zera toda duração de animação — então o estado PARADO tem de ler sozinho, como uma tirinha de jornal.
// O estilo-base de cada quadro é o legível; o "apagado" só existe DENTRO do keyframe.
// ⚠️ **QUAL tirinha aparece é decisão PURA** (`cenaDoTutor`, em `tutorFala.js`). A etapa 3 JÁ TEVE dois
// tempos (uma tirinha só com o objetivo, e a do salto 5 s depois) — saiu: o dono do jogo viu o aluno sem
// saber qual botão apertar, e hoje o salto e a tecla aparecem desde o segundo zero.
// ⚠️ **NO MOUSE, AS ETAPAS DE UM BOTÃO SÓ GANHAM O PROMPT GRANDE NO RODAPÉ** (`PromptRodape`): o quadro do
// gesto tem ~60 px e a tecla dentro dele sai com letra de 12 — serve para a tirinha LER como sequência, não
// para alguém achar a tecla no meio de uma perseguição. No dedo não: lá quem é destacado é o botão DE
// VERDADE do HUD, pulsando e com seta (`data-alvo`), e uma réplica apertável longe dele é o convite errado.
// ⚠️ O quadro do GESTO reusa o `Glifo` — o mesmo desenho do par mouse/dedo do clássico (metade esquerda do
// mouse acesa, a TECLA que o jogador configurou, a réplica do botão do HUD). Nenhuma decisão nova aqui.
import React from "react";
import { ETAPA } from "../game/tutor.js";
import { falaDoTutor, promptDoTutor, alvoDoTutor, verboDoTutor, cenaDoTutor, seloDoTutor, formaDoCartao } from "./tutorFala.js";
import { Glifo, Mascote, Trilha, Pular, PromptRodape, useEntraSozinho } from "./tutorPecas.jsx";

const TIT_ETAPA = { [ETAPA.NOVA]: "novaTit", [ETAPA.TIRO]: "tiroTit", [ETAPA.SPLIT]: "splitTit" };

/** A seta "vai até lá", em SVG para sair nítida em qualquer tamanho (glifo de fonte varia por sistema). */
function Vai() {
  return <svg className="tc-vai" viewBox="0 0 26 12" aria-hidden="true">
    <path d="M1 6h20M16 1.5 22 6l-6 4.5" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

/** O miolo dos quadros 2 e 3 de cada cena. O quadro 1 é sempre o GESTO. */
function Acao({ cena }) {
  if (cena === "nova") return <><Mascote quem="marte" className="tc-eu" /><Vai /><i className="tc-pts" /></>;
  if (cena === "tiro") return <><Mascote quem="marte" className="tc-eu p" /><Mascote quem="missil" className="tc-missil" /><Mascote quem="terra" className="tc-ele" /></>;
  // salto: o planeta PARTE em dois e uma metade voa (o arco tracejado) até a presa
  return <><Mascote quem="marte" className="tc-eu p" /><span className="tc-arco"><Mascote quem="marte" className="tc-eu pp" /></span><Mascote quem="terra" className="tc-ele p" /></>;
}
function Resultado({ cena }) {
  if (cena === "nova") return <><Mascote quem="marte" className="tc-eu g" /><b className="tc-mais">+</b></>;
  if (cena === "tiro") return <><i className="tc-bum" /><Mascote quem="terra" className="tc-ele quebra" /><i className="tc-pts cacos" /></>;
  // o salto termina com você tendo COMIDO. O ✓ é forma, não só cor.
  return <><Mascote quem="marte" className="tc-eu g" /><b className="tc-ok">✓</b></>;
}

/**
 * A tirinha. `p` é o prompt (o GESTO do quadro 1); `viva` liga o acende-apaga sequencial.
 * A `espera` é um quadro só — a estrela inchando —, sem gesto: enquanto ela não estoura não há o que fazer.
 */
function Tira({ cena, p, viva }) {
  if (!cena) return null;
  if (cena === "espera") return <div className="tc-tira um" data-cena="espera" aria-hidden="true">
    <div className="tc-q"><i className="tc-estrela" /></div>
  </div>;
  return <div className={"tc-tira" + (viva ? " viva" : "")} data-cena={cena} aria-hidden="true">
    <div className="tc-q q1"><Glifo p={p} /></div>
    <i className="tc-sep">▸</i>
    <div className="tc-q q2"><Acao cena={cena} /></div>
    <i className="tc-sep">▸</i>
    <div className="tc-q q3"><Resultado cena={cena} /></div>
  </div>;
}

export default function TutorCena({ d, T, tecla }) {
  useEntraSozinho(!!d.fim && !d.demo);

  // ── FIM: NÃO HÁ TELA. Acabou a 3ª lição, entra na sala (`useEntraSozinho`, com `TUTOR.FIM_MS` = 0) ──
  // ⚠️ **AQUI MORAVAM DUAS TELAS DE PARADA, e elas saíram juntas**: o cartão de PARABÉNS (3 s) e, logo abaixo,
  // a de "ETAPA COMPLETA" (3,2 s de tela cheia, três vezes, com o HUD inteiro escondido) — 12,6 s de espera
  // obrigatória num tutorial de ~60 s, em quatro pontos de saída. É a tela de "Level Complete": a parada
  // entre duas fases é onde o jogador decide ir embora (ver `TUTOR` em game/tutor.js).
  // O parabéns e a PROMESSA DA SKIN não se perderam — viraram a faixa de `TutorParabens.jsx`, por cima da
  // primeira partida, que é o instante em que o Marte Bravo é de fato tirado do jogador.
  if (d.fim) return null;

  const n = d.etapa;
  // o elogio da etapa que acabou de fechar: um SELO que não bloqueia nada, por cima da etapa seguinte
  const selo = seloDoTutor(d, T);

  // ── EM CURSO ──
  const cena = cenaDoTutor(d), forma = formaDoCartao(d);
  const [tit, txt] = falaDoTutor(d, T, tecla);
  const p = promptDoTutor(d, T, tecla);
  // na `espera` a palavra grande é o próprio aviso ("A ESTRELA VAI EXPLODIR!") — mandar MOVER antes de
  // existir o que comer é pedir o impossível na primeira frase do jogo
  const grande = cena === "espera" ? tit : verboDoTutor(d, T);
  // o sobretítulo só aparece quando o título NÃO é o padrão da etapa — hoje, o diagnóstico da etapa 3
  // ("CORRENDO VOCÊ NUNCA ALCANÇA"), que é metade da lição e não pode se perder atrás do verbo
  const sobre = cena !== "espera" && tit !== T[TIT_ETAPA[n]] ? tit : "";
  const barra = n === ETAPA.NOVA && !d.pre
    ? <i className="tc-barra" role="progressbar" aria-valuenow={Math.round(d.pct * 100)} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: Math.round(d.pct * 100) + "%" }} /></i> : null;

  // ⚠️ O PULAR MORA NUMA LINHA DE CABEÇALHO, EM FLUXO, ao lado da trilha — e não absoluto no canto, como
  // no clássico: em pé o cartão ocupa a largura inteira, e o Pular absoluto caía por cima do terceiro
  // quadro da tirinha (visto na primeira captura). Em fluxo não há colisão possível, em largura nenhuma.
  return <>
  <div id="tutor" data-style="cena" data-etapa={n} data-forma={forma} data-alvo={alvoDoTutor(d) || undefined}>
    <div className="tc-palco">
      <div className="tc-topo"><Trilha etapa={n} T={T} /><Pular T={T} /></div>
      {forma === "pilula"
        // a PÍLULA: o jogador já entendeu (comeu o primeiro pedaço) — a tirinha sai da frente do jogo
        ? <div className="tc-pilula" role="status" aria-live="polite">
            <b className="tc-verbo">{grande}</b>
            <span className="tc-txt" key={txt}>{txt}</span>
            {barra}
          </div>
        : <div className="tc-cartao" key={"c" + cena}>
            <Tira cena={cena} p={p} viva />
            <div className="tc-lado" role="status" aria-live="polite">
              {sobre ? <b className="tc-sobre">{sobre}</b> : null}
              <b className="tc-verbo">{grande}{p && cena !== "espera" ? <em className="tc-vez">{T.cenaSuaVez}</em> : null}</b>
              <span className="tc-txt" key={txt}>{txt}</span>
            </div>
            {barra}
          </div>}
      {/* O SELO mora EM FLUXO, logo abaixo do cartão da lição: assim ele nunca cobre a tirinha nem depende de
          adivinhar a altura dela em cada forma de tela (o cartão muda de altura entre pílula, aberto, em pé
          e deitado). ⚠️ `key` = a etapa elogiada: o selo da 2 é OUTRO elemento que o da 1, então a animação
          de entrada toca de novo em vez de o texto trocar em silêncio. */}
      {selo ? <div id="tutor-selo" key={d.ok.n} role="status" aria-live="polite">
        <i>✓</i><span><b>{selo[0]}</b>{selo[1] ? <em>{selo[1]}</em> : null}</span>
      </div> : null}
    </div>
  </div>
  {/* o DESTAQUE do botão para quem joga no mouse — só nas etapas de UM botão (o clique do tiro, a tecla do
      dividir); na etapa 1 o gesto é mover, e a tirinha basta.
      ⚠️ IRMÃO do `#tutor`, nunca filho: `#tut-prompt` é `position:absolute` com `bottom`, e o `#tutor` é um
      ancestral posicionado colado no TOPO — dentro dele, o "rodapé" seria o rodapé da faixa de cima. */}
  {!d.dedo && n !== ETAPA.NOVA ? <PromptRodape p={p} /> : null}
  </>;
}

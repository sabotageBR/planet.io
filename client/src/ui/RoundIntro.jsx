// ── A ABERTURA DO FIM DE RODADA ───────────────────────────────────────────────────────────────────
// O placar aparecia de um frame para o outro: a rodada acabava e a tela já estava lá, com o campeão
// desenhado num ícone de 34 px ao lado do nome. Trinta minutos de sala terminavam sem um instante de
// fim. Aqui o fim tem tempo — o universo é sugado para um ponto (é literalmente o que o BIG CRUNCH é),
// estoura, e do estouro nasce o planeta que venceu, grande. Só então o placar monta.
//
// ⚠️ NADA disto é state do React: as fases são `animation-delay` de CSS num DOM montado uma vez. Um
// `setState` por fase re-renderizaria a tela inteira quatro vezes no meio da animação — a última coisa
// que se quer enquanto o navegador está compondo 20 camadas. Os únicos timers são os três SONS e o
// `onDone`, e todos morrem no mesmo cleanup, que é também o caminho do "pular".
// ⚠️ PULAR é obrigatório, não cortesia: quem joga sala atrás de sala vê isto cem vezes por sessão.
// Qualquer clique ou tecla encerra na hora — e quem desligou a abertura (`prefs.roundIntro`) ou pediu
// menos movimento (`reduceMotion`) nem chega a montar este componente.
// ⚠️ O contador da próxima sala só começa quando isto acaba (ver Round.jsx): senão a animação comeria
// 2 s dos 15 que o jogador tem para decidir se entra agora ou volta ao lobby.
import React, { useEffect, useMemo, useRef } from "react";
import { skinById } from "@warspace/shared";
import SkinPreview from "./SkinPreview.jsx";
import { useLabels } from "../hooks/useTheme.js";
import { fmt } from "./format.js";
import { sfx } from "../audio/index.js";

export const INTRO_MS = 2000;
const RISCOS = 18;
// Os três tempos que o CSS também usa: sucção, estouro, nascimento. Mudar um aqui pede mudar o
// `animation-delay` gêmeo no bloco "ABERTURA DO FIM DE RODADA" de styles/ui.css — som e imagem
// separados por 100 ms já se leem como defeito.
const SONS = [[0, "suck"], [880, "bigCrunch"], [1280, "podium"]];

export default function RoundIntro({ champ, title, onDone }) {
  const LB = useLabels();
  // `onDone` muda de identidade a cada render do pai; o efeito roda UMA vez, então ele lê a versão atual
  // por ref em vez de listar a função como dependência (o que remontaria a animação no meio dela).
  const fim = useRef(onDone); fim.current = onDone;
  useEffect(() => {
    let vivo = true;
    const acabou = () => { if (vivo) { vivo = false; fim.current(); } };
    const ts = SONS.map(([ms, k]) => setTimeout(() => sfx(k), ms));
    ts.push(setTimeout(acabou, INTRO_MS));
    addEventListener("pointerdown", acabou); addEventListener("keydown", acabou);
    return () => { vivo = false; ts.forEach(clearTimeout);
      removeEventListener("pointerdown", acabou); removeEventListener("keydown", acabou); };
  }, []);
  // Os riscos que convergem para o ponto: ângulo, distância e atraso ligeiramente diferentes por índice.
  // Regulares demais viram um asterisco girando; é a irregularidade que faz aquilo parecer matéria caindo.
  const riscos = useMemo(() => Array.from({ length: RISCOS }, (_, i) => ({
    a: (i * 360 / RISCOS) + (i % 3) * 5, d: 34 + (i % 4) * 8, atraso: (i % 6) * 60 })), []);
  return <div className="rd-intro" aria-hidden="true">
    <div className="ri-void" />
    <div className="ri-campo">{riscos.map((r, i) =>
      <i key={i} className="ri-risco" style={{ "--a": r.a + "deg", "--d": r.d + "vmin", animationDelay: r.atraso + "ms" }} />)}</div>
    <div className="ri-titulo">{title}</div>
    <div className="ri-flash" />
    <div className="ri-onda" />
    <div className="ri-onda o2" />
    {champ ? <div className="ri-heroi">
      <div className="ri-disco"><SkinPreview skin={skinById(champ.skinId)} r={30} size={360} className="" /></div>
      <b className="ri-nome">{champ.name}</b>
      <em className="ri-massa">{fmt(champ.mass)}</em>
    </div> : null}
    <span className="ri-skip">{LB.skipHint}</span>
  </div>;
}

// ── O PARABÉNS DO TUTORIAL, POR CIMA DA PRIMEIRA PARTIDA ─────────────────────
// O tutorial não tem mais tela de fim. Ela JÁ FOI um cartão com botão (que prendia 24% de quem chegava —
// a contagem congelava no primeiro `pointermove`), depois um cartão de 3 s sem botão, e hoje não existe:
// acabou a terceira lição, entra na sala (`TUTOR.FIM_MS` = 0, game/tutor.js). Junto com as três telas de
// "ETAPA COMPLETA" eram 12,6 s de parada obrigatória num tutorial de ~60 s — a tela de "Level Complete",
// quatro vezes, e a parada entre duas fases é onde o jogador decide ir embora.
//
// O que NÃO podia se perder é a PROMESSA DA SKIN: o tutorial é jogado com o Marte Bravo e a primeira sala
// de verdade o troca pela skin equipada — sem uma linha dizendo como ficar com ele, a troca de planeta lê
// como defeito. "A promessa é feita no instante da perda", e esse instante é a ENTRADA NA SALA: é aqui,
// por cima dela, que a faixa mora. Ela cobre o handshake (o "entrando…") e os primeiros segundos da partida.
//
// ⚠️ **AVISA, NÃO PEDE CLIQUE** — a regra do `#notice`, no mesmo canto dele: `pointer-events:none`, sem botão,
//    some pelo prazo. Nada do HUD é escondido: a partida já começou.
// ⚠️ **QUEM A APOSENTA É O RELÓGIO DO HUD, não um timer daqui**: `Hud.jsx` é reavaliado a 8 Hz enquanto há
//    partida, então `Date.now() >= ate` basta — um `setTimeout` próprio seria um segundo relógio para a
//    mesma pergunta. `ate` mora no TOPO do store (`app.parabensAte`), fora de `overlays`, que `play()`
//    reescreve inteiro — e quem o escreve (`saiDoTutorial`) chama `play()` na linha seguinte.
// ⚠️ Só em `screen:"game"`: se a primeira vida acabar antes do prazo, a faixa não sobe por cima da tela de morte.
import React from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { useLabels } from "../hooks/useTheme.js";
import { Promessa } from "./tutorPecas.jsx";

export default function TutorParabens() {
  const LB = useLabels();
  const ate = useStore(app, s => s.parabensAte), screen = useStore(app, s => s.screen), conn = useStore(app, s => s.conn);
  if (!ate || screen !== "game" || Date.now() >= ate) return null;
  const T = LB.tutor || {};
  return <div id="tutor-parabens" role="status" aria-live="polite">
    <b className="tpb-tit">{T.fimTitulo}</b>
    <span className="tpb-sub">{conn === "connected" ? T.fimSub : T.fimIndo}</span>
    <Promessa T={T} />
  </div>;
}

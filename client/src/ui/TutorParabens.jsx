// ── A FAIXA DA SKIN EM TESTE, POR CIMA DA PARTIDA ────────────────────────────
// Duas caras de UM aviso, e as duas sem uma frase na tela (a Poki recusou o Web Fit Test de 28/09 por texto:
// "players on Poki really don't like reading"):
//   · FIM DO TUTORIAL (`app.parabensAte`): o ✓ grande + o Marte · ○○○ · 🎁 — "você terminou, e este planeta
//     vira seu em 3 partidas". Cobre o handshake (com a rodinha enquanto a sala não conecta) e os primeiros
//     segundos da partida.
//   · MORTE SEM TELA (`app.pipsAte`, escrito em `onDead`): o Marte · ●○○ · 🎁 com a bolinha NOVA estourando.
//     A primeira morte do pacote não abre tela (portal/primeiraVida.js), e sem isto a partida que ela fechou
//     contaria em silêncio — a barra só apareceria na tela de morte da SEGUNDA, já em 2 de 3.
// A frase existe, inteira, no `aria-label`: quem usa leitor de tela ouve a promessa que os outros veem.
//
// ⚠️ O PLANETA NÃO TROCA MAIS NA ENTRADA DA SALA: nas primeiras `PROGRESSO.PARTIDAS` partidas o servidor põe
//    a skin do tutorial por cima da de nascença (a SKIN EM TESTE de `persist/hooks.js`), e a concessão a
//    equipa. A faixa deixou de ser o consolo de uma perda e virou o placar de uma promessa.
// ⚠️ **AVISA, NÃO PEDE CLIQUE** — a regra do `#notice`, no mesmo canto dele: `pointer-events:none`, sem
//    botão, some pelo prazo.
// ⚠️ **QUEM A APOSENTA É O RELÓGIO DO HUD, não um timer daqui**: `Hud.jsx` é reavaliado a 8 Hz enquanto há
//    partida, então `Date.now() >= ate` basta — um `setTimeout` próprio seria um segundo relógio para a
//    mesma pergunta. Os dois prazos moram no TOPO do store, fora de `overlays`, que `play()` reescreve inteiro.
// ⚠️ Só em `screen:"game"`: se a vida acabar antes do prazo, a faixa não sobe por cima da tela de morte.
// ⚠️ `indo` (a sala ainda não conectou) esconde o RESTO do HUD por CSS: entre o fim do tutorial e o primeiro
//    snapshot da sala os blocos da partida mostrariam números velhos do tutorial ou zeros — ver `ui.css`.
import React from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { useLabels } from "../hooks/useTheme.js";
import { preenche } from "../i18n/index.js";
import { skinName } from "../i18n/catalog.js";
import { PROGRESSO, SKIN_TUTORIAL } from "@warspace/shared";
import { TrilhaSkin } from "./tutorPecas.jsx";

export default function TutorParabens() {
  const LB = useLabels();
  const ate = useStore(app, s => s.parabensAte), pips = useStore(app, s => s.pipsAte);
  const screen = useStore(app, s => s.screen), conn = useStore(app, s => s.conn);
  const skins = useStore(app, s => s.session.skins), games = useStore(app, s => (s.session.stats || {}).games | 0);
  const agora = Date.now(), fim = !!ate && agora < ate, morte = !fim && !!pips && agora < pips;
  if (screen !== "game" || (!fim && !morte)) return null;
  const T = LB.tutor || {};
  const tem = (skins || []).includes(SKIN_TUTORIAL), alvo = PROGRESSO.PARTIDAS, feitas = Math.max(0, Math.min(alvo, games));
  // a morte que já não tem o que prometer (a skin é dele, ou a conta já passou do alvo) não mostra nada
  if (morte && (tem || feitas >= alvo)) return null;
  const indo = fim && conn !== "connected";
  const promessa = tem ? "" : preenche(T.fimPromessa, { n: alvo, s: skinName(SKIN_TUTORIAL) }) + ` (${feitas}/${alvo})`;
  const frase = [fim ? T.fimTitulo : "", promessa].filter(Boolean).join(" ");
  return <div id="tutor-parabens" className={(fim ? "fim" : "pips") + (indo ? " indo" : "")}
    role="status" aria-live="polite" aria-label={frase}>
    {fim ? <i className="tpb-ok" aria-hidden="true">✓</i> : null}
    {tem ? null : <TrilhaSkin feitas={feitas} alvo={alvo} nova={morte ? feitas - 1 : -1} />}
    {indo ? <i className="tpb-roda" aria-hidden="true" /> : null}
  </div>;
}

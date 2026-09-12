// ── O TUTORIAL DE ESTREIA, NA TELA ───────────────────────────────────────────
// Duas caras num arquivo só, e as duas são OVERLAY dentro do `#hud` — nunca uma tela em `SCREENS`. Uma
// tela nova deixaria o HUD inteiro `hidden` (`Hud.jsx`), faria o `GameHost` chamar `game.leave()` no
// primeiro render, prenderia a cortina `#boot` por 10 s no pacote e pararia o relógio de sessão do
// portal. O molde é `CageStart.jsx` (em curso) e `BrLobby.jsx` (o cartão de fim).
//
// ⚠️ O PRIMEIRO FRAME JÁ É A ARENA. Sem cartão de abertura, sem "Bem-vindo", sem botão de começar: o
// funil do Fit Test 1.12 leu 17% de abandono numa tela antes de jogar, e foi por isso que a tela inicial
// deixou de existir no pacote. Um tutorial que ABRE com um modal é a mesma tela de volta.
// ⚠️ TODA instrução vem em par mouse/dedo. No dedo, tocar no canvas NÃO atira — dirige o planeta. Dizer
// "clique para atirar" a quem tem dedo faz o planeta virar, nada explodir, e o jogador concluir que o
// tutorial mente. `d.dedo` vem do mesmo getter que arma o direcional virtual.
// ⚠️ `pointer-events:none` no bloco em curso, com `auto` só no botão: o `#hud` inteiro é `none` porque os
// painéis engoliam o alvo do jogador e congelavam o movimento.
import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { useLabels } from "../hooks/useTheme.js";
import { preenche } from "../i18n/index.js";
import { ETAPA, ETAPAS } from "../game/tutor.js";
import { escolhePremio } from "./premio.js";
import { saiDoTutorial, ganharSkinAnuncio } from "../state/actions.js";
import { portal } from "../portal/index.js";
import { api } from "../api/client.js";
import SkinPreview from "./SkinPreview.jsx";

/** Segundos da contagem do botão de entrar na sala. Promessa, não ameaça — ver o `pausa` abaixo. */
const CONTA_S = 12;

/**
 * A frase da vez. PURA e exportada: é a única parte disto que dá para conferir sem jsdom, e ela tem seis
 * pares mouse/dedo que falham em SILÊNCIO se trocados.
 * @param {{etapa:number,ajuda:number,festa:number,auto:boolean,dedo:boolean}} d @param {*} T os labels
 */
export function fraseDoTutor(d, T) {
  const dedo = !!d.dedo;
  if (d.festa) return d.etapa === ETAPA.NOVA ? T.novaFeito
    : d.etapa === ETAPA.TIRO ? (d.auto ? T.tiroAuto : T.tiroFeito) : T.splitFeito;
  if (d.etapa === ETAPA.NOVA) {
    if (d.ajuda >= 2) return T.novaPuxa;
    if (d.ajuda >= 1) return dedo ? T.novaAjudaDedo : T.novaAjudaMouse;
    return d.pct > 0 ? (dedo ? T.novaRumo : T.novaMouse) : (dedo ? T.novaDedo : T.novaMouse);
  }
  if (d.etapa === ETAPA.TIRO) {
    if (d.ajuda >= 2) return dedo ? T.tiroAjudaDedo : T.tiroAjudaMouse;
    if (d.ajuda >= 1) return T.tiroAjuda;
    return dedo ? T.tiroDedo : T.tiroMouse;
  }
  if (d.etapa === ETAPA.SPLIT) {
    if (d.ajuda >= 2) return T.splitAjuda;
    if (d.ajuda >= 1) return T.splitNao;
    return T.splitCaca;
  }
  return "";
}

export default function Tutor({ d, tecla }) {
  const LB = useLabels();
  if (!d) return null;
  const T = LB.tutor || {};
  if (d.fim) return <Fim T={T} LB={LB} />;
  const feitas = d.etapa - 1 + (d.festa ? 1 : 0);
  // ⚠️ Na etapa 3 a frase do salto é a DO JOGO (`hintSplit`/`hintSplitTouch`), literalmente: já está
  // traduzida, já está testada, e o tutorial passa a ensinar exatamente a frase que a primeira vida de
  // verdade vai repetir no rodapé.
  const txt = d.etapa === ETAPA.SPLIT && d.ajuda >= 1 && !d.festa
    ? (d.dedo ? LB.hintSplitTouch : preenche(LB.hintSplit, { k: tecla }))
    : fraseDoTutor(d, T);
  return <div id="tutor" data-etapa={d.etapa}>
    <div className="tut-topo">
      {/* ⚠️ NENHUM ESTADO VAI SÓ NA COR: o número acompanha os segmentos. Medido com o validador de
          paleta, o verde e o âmbar dos tokens ficam com ΔE 6,7 em protanopia. */}
      <div className="tut-bar" role="progressbar" aria-valuenow={feitas} aria-valuemin={0} aria-valuemax={ETAPAS}>
        {Array.from({ length: ETAPAS }, (_, i) =>
          <i key={i} className={i < feitas ? "on" : i === feitas ? "now" : ""} style={{ "--p": i === feitas ? (d.pct || 0).toFixed(3) : "1" }} />)}
      </div>
      <b className="tut-passo">{preenche(T.passo, { n: Math.min(d.etapa, ETAPAS), t: ETAPAS })}</b>
      <button className="tut-sair" onClick={() => saiDoTutorial({ fim: false })}>{T.pular}</button>
    </div>
    {/* `key` no texto: sem ele a faixa não reanima quando a frase troca e a mudança passa despercebida */}
    <div className="tut-fala" key={txt} role="status" aria-live="polite">{txt}</div>
  </div>;
}

/**
 * O cartão de fim. Aqui sim há véu e `pointer-events:auto` — é o único momento em que a tela pede uma
 * decisão, e a salva de fogos já está saindo do planeta dele por trás.
 */
function Fim({ T, LB }) {
  const skins = useStore(app, s => s.session.skins);
  const [pedindo, setPedindo] = useState(false);
  const [resta, setResta] = useState(CONTA_S);
  const premio = useRef(null), pausa = useRef(false);
  // A oferta é decidida UMA vez, no mount — o molde de `DeadPrize`. Reavaliá-la a cada render a faria
  // trocar quando a skin chegasse, e uma oferta que muda entre a promessa e o clique é a forma mais
  // rápida de o jogador achar que foi enganado.
  if (premio.current === null) {
    // ⚠️ `api.online === true`, e NÃO `user.id`: o perfil local tem `id:"local"`, que é truthy. Sem esta
    // linha, um portal com SDK vivo e banco fora faria o jogador assistir 30 s de vídeo para levar um
    // toast de erro — a pior primeira impressão que este jogo consegue produzir.
    const s = app.get().session;
    premio.current = escolhePremio(null, s.skins, portal.temRecompensa && api.online === true, true) || false;
  }
  useEffect(() => {
    // ⚠️ A contagem PAUSA no primeiro gesto sobre o cartão e para de vez durante o vídeo: uma contagem
    // que come um clique é o pior defeito possível numa tela de prêmio.
    const t = setInterval(() => setResta(r => (pausa.current || pedindo ? r : r - 1)), 1000);
    return () => clearInterval(t);
  }, [pedindo]);
  useEffect(() => { if (resta <= 0) saiDoTutorial({ fim: true }); }, [resta]);

  const p = premio.current;
  const tem = p && (skins || []).includes(p.id);
  return <div id="tutor-fim" onPointerMove={() => { pausa.current = true; }}>
    <div className="tut-card">
      <div className="tut-fim-tit">{T.fimTitulo}</div>
      <ul className="tut-ok">
        <li>{T.fimMover}</li><li>{T.fimAtirar}</li><li>{T.fimDividir}</li>
      </ul>
      {/* ⚠️ Esta linha é o remédio do maior risco de UX da feature: o tutorial termina com o planeta
          grande e a sala começa pequena de novo. Dito, é o jogo; não dito, é o jogo piorando. */}
      <p className="tut-nota">{T.fimNota}</p>
      {p && !tem ? <div className="dd-premio">
        <div className="dp-disco"><SkinPreview skin={p.skin} r={30} size={112} className="" /></div>
        <div className="dp-txt"><i>{LB.prizeOffer}</i><b>{p.skin.name}</b></div>
        <button className="btn-primary dp-ad" disabled={pedindo}
          onClick={async () => { setPedindo(true); try { await ganharSkinAnuncio(p.id); } finally { setPedindo(false); } }}>
          {pedindo ? LB.saving : LB.prizeWatch}
        </button>
      </div> : null}
      {tem ? <p className="tut-ganhou">{LB.prizeEquipNote}</p> : null}
      <button className="btn-primary tut-ir" onClick={() => saiDoTutorial({ fim: true })}>
        {T.fimJogar}{pausa.current || pedindo ? "" : ` · ${Math.max(0, resta)}`}
      </button>
    </div>
  </div>;
}

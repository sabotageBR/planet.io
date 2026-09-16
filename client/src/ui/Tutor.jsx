// ── O TUTORIAL DE ESTREIA, NA TELA ───────────────────────────────────────────
// Três caras num arquivo só, e as três são OVERLAY dentro do `#hud` — nunca uma tela em `SCREENS`. Uma
// tela nova deixaria o HUD inteiro `hidden` (`Hud.jsx`), faria o `GameHost` chamar `game.leave()` no
// primeiro render, prenderia a cortina `#boot` por 10 s no pacote e pararia o relógio de sessão do portal.
//
//   1. EM CURSO — a trilha 1·2·3 com o contador "N/3", a barra da etapa 1, o título, a instrução em
//      letra grande e o PROMPT DE BOTÃO;
//   2. ETAPA COMPLETA — a tela que aparece, comemora e fecha sozinha (`celebra`, a janela de `SOBRA_MS`);
//   3. FIM — o cartão com a oferta da skin e a passagem para a sala.
//
// ⚠️ O PRIMEIRO FRAME JÁ É A ARENA. Sem cartão de abertura e sem botão de começar: o funil do Fit Test
// 1.12 leu 17% de abandono numa tela antes de jogar, e foi por isso que a tela inicial deixou de existir
// no pacote. Um tutorial que ABRE com um modal é a mesma tela de volta.
// ⚠️ TODA instrução vem em par mouse/dedo, e o PROMPT também. No dedo, tocar no canvas NÃO atira — dirige
// o planeta; dizer "clique para atirar" a quem tem dedo faz o planeta virar, nada explodir, e o jogador
// concluir que o tutorial mente. `d.dedo` vem do mesmo getter que arma o direcional virtual.
// ⚠️ `pointer-events:none` no bloco em curso, com `auto` só no botão: o `#hud` inteiro é `none` porque os
// painéis engoliam o alvo do jogador e congelavam o movimento.
import React, { useEffect, useRef } from "react";
import { app } from "../state/app.js";
import { useLabels } from "../hooks/useTheme.js";
import { preenche } from "../i18n/index.js";
import { ETAPA, ETAPAS, TUTOR } from "../game/tutor.js";
// ⚠️ As duas decisões (qual frase, qual botão) moram num `.js` à parte: o `node --test` não carrega
// `.jsx`, e uma função de decisão que ninguém testa é onde o par mouse/dedo se inverte em silêncio.
import { falaDoTutor, promptDoTutor } from "./tutorFala.js";
import { saiDoTutorial } from "../state/actions.js";
import { PROGRESSO, SKIN_TUTORIAL, skinById } from "@warspace/shared";

/** O título de cada etapa, para a tela de "completa" poder anunciar a próxima. */
const TIT_ETAPA = { [ETAPA.NOVA]: "novaTit", [ETAPA.TIRO]: "tiroTit", [ETAPA.SPLIT]: "splitTit" };

/** O desenho do prompt: um mouse, uma tecla ou o botão do HUD. SVG inline — nada de imagem nova. */
function Prompt({ p }) {
  if (!p) return null;
  const mouse = p.tipo === "mouse-mover" || p.tipo === "mouse-clique";
  return <div id="tut-prompt" className={"tut-btn tut-btn-" + p.tipo} aria-hidden="true">
    {mouse ? <svg viewBox="0 0 40 60" aria-hidden="true" className="tut-mouse">
      <rect x="4" y="4" width="32" height="52" rx="16" className="tm-corpo" />
      {/* a metade ESQUERDA acesa é a resposta a "qual botão na tela" */}
      {p.tipo === "mouse-clique"
        ? <path d="M4 20 V20 A16 16 0 0 1 20 4 V20 Z" className="tm-esq" />
        : null}
      <line x1="20" y1="4" x2="20" y2="20" className="tm-div" />
      <line x1="4" y1="20" x2="36" y2="20" className="tm-div" />
      {p.tipo === "mouse-mover"
        ? <g className="tm-setas"><path d="M20 34 l-7 7 h4 v8 h6 v-8 h4 Z" /></g>
        : null}
    </svg> : null}
    {p.tipo === "tecla" ? <kbd className="tut-tecla">{p.rotulo}</kbd> : null}
    {p.tipo === "toque" ? <svg viewBox="0 0 40 60" aria-hidden="true" className="tut-mouse">
      <circle cx="20" cy="26" r="11" className="tm-toque" />
      <circle cx="20" cy="26" r="17" className="tm-onda" />
    </svg> : null}
    {p.tipo === "hud" ? <span className="tut-hud-btn">{p.rotulo}</span> : null}
    {p.tipo !== "tecla" && p.tipo !== "hud" ? <b>{p.rotulo}</b> : null}
  </div>;
}

export default function Tutor({ d, tecla }) {
  const LB = useLabels();
  if (!d) return null;
  const T = LB.tutor || {};
  if (d.fim) return <Fim T={T} demo={!!d.demo} />;
  if (d.celebra) return <Completa d={d} T={T} />;
  const [tit, txt] = falaDoTutor(d, T, tecla);
  // ⚠️ **O PROMPT MORA NO RODAPÉ, LONGE DA INSTRUÇÃO, E ISSO NÃO É ESTÉTICA.** Empilhados no topo eles
  // desciam até o meio da tela e TAPAVAM o planeta e os pedaços — ou seja, a explicação cobria a coisa
  // explicada. Com a instrução em cima e o prompt embaixo, o miolo da tela (onde o jogo acontece) fica
  // livre; e no dedo o prompt ainda cai ao lado dos botões de toque reais, que é para onde ele aponta.
  return <>
    <div id="tutor" data-etapa={d.etapa}>
      <Trilha etapa={d.etapa} T={T} />
      {/* ⚠️ A BARRA SÓ EXISTE NA ETAPA 1, e isso é escolha: lá o `pct` é contínuo (sai da massa) e diz
          quanto falta; nas outras duas a etapa é UM gesto, então a barra ficaria parada em zero por
          dez segundos — uma barra que não anda enquanto o jogador tenta lê como "não estou
          registrando o que você faz", que é o oposto do que ela existe para dizer. */}
      {d.etapa === ETAPA.NOVA && !d.pre ? <div className="tut-barra"
        role="progressbar" aria-valuenow={Math.round(d.pct * 100)} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: Math.round(d.pct * 100) + "%" }} />
      </div> : null}
      <div className="tut-fala" key={tit + txt} role="status" aria-live="polite">
        <b className="tut-tit">{tit}</b>
        <span className="tut-txt">{txt}</span>
      </div>
      <button className="tut-sair" onClick={() => saiDoTutorial({ fim: false })}>{T.pular}</button>
    </div>
    <Prompt p={promptDoTutor(d, T, tecla)} />
  </>;
}

/**
 * A trilha 1·2·3. Três bolas NUMERADAS ligadas por um traço — o vocabulário de tutorial que o pedido
 * nomeia ("uma barra que tem 3 etapas, 1,2,3").
 * ⚠️ NENHUM ESTADO VAI SÓ NA COR: o número está sempre lá e a etapa feita vira ✓. Medido com o validador
 * de paleta, o verde e o âmbar dos tokens ficam com ΔE 6,7 em protanopia.
 */
function Trilha({ etapa, T }) {
  // ⚠️ `pos`, e não `n`: o `map` abaixo declara o próprio `n`, e um homônimo aqui fora seria sombreado
  // dentro dele. É a mesma classe de defeito que o `marco`/`degrau` de `game/index.js` custou caro.
  const pos = Math.min(Math.max(etapa, 1), ETAPAS);
  return <div className="tut-trilha" role="progressbar" aria-valuenow={pos} aria-valuemin={1} aria-valuemax={ETAPAS}>
    {/* ⚠️ O "1/3" É TEXTO, ao lado das bolas, e não substitui nenhuma delas: as bolas dizem o CAMINHO
        (onde já esteve, onde está, quanto falta) e o número diz a POSIÇÃO sem depender de contar
        círculos numa tela de 360 px com um planeta andando por baixo. É o mesmo princípio de "nenhum
        estado vai só na cor" aplicado à forma. */}
    <b className="tut-passo">{preenche(T.passo, { n: pos, t: ETAPAS })}</b>
    {Array.from({ length: ETAPAS }, (_, i) => {
      const n = i + 1, st = n < etapa ? "ok" : n === etapa ? "now" : "off";
      return <React.Fragment key={n}>
        {i ? <i className={"tut-liga " + (n <= etapa ? "ok" : "")} /> : null}
        <b className={"tut-bola " + st}>{st === "ok" ? "✓" : n}</b>
      </React.Fragment>;
    })}
  </div>;
}

/**
 * A TELA DE "PASSOU DE ETAPA". Ela aparece, comemora e **fecha sozinha** — é o pedido literal ("aparece
 * uma comemoração que passou de nível, a tela fecha e começa a segunda etapa").
 *
 * ⚠️ SEM BOTÃO, de propósito: é uma celebração, não uma decisão. Um botão aqui pediria um clique para
 * receber um elogio, e ainda precisaria de um caminho de volta ao servidor para encurtar a janela.
 * ⚠️ Quem a segura é `celebra` (a janela de `SOBRA_MS` em `game/tutor.js`), não um timer local: o relógio
 * do tutorial é o do MUNDO, e um `setTimeout` aqui descolaria da etapa seguinte se o render congelasse.
 */
function Completa({ d, T }) {
  const n = d.etapa;
  return <div id="tutor-ok" role="status" aria-live="assertive">
    <div className="tok-card">
      <div className="tok-selo">✓</div>
      <div className="tok-tit">{preenche(T.feito, { n })}</div>
      <div className="tok-sub">{T["feito" + n] || ""}</div>
      {d.auto ? <div className="tok-auto">{T.tiroAuto}</div> : null}
      {/* ⚠️ Dizer O QUE VEM é o que transforma três lições soltas numa sequência: a tela fecha sozinha, e
          sem esta linha a etapa seguinte começa com o jogador ainda olhando para o elogio da anterior. */}
      {n < ETAPAS ? <div className="tok-prox">{preenche(T.prox, { s: T[TIT_ETAPA[n + 1]] || "" })}</div> : null}
      <Trilha etapa={Math.min(n + 1, ETAPAS)} T={T} />
    </div>
  </div>;
}

/**
 * O FIM DO TUTORIAL: parabéns, a promessa da skin, e ENTRA SOZINHO. Sem cartão, sem botão, sem véu que
 * capture o ponteiro — nada aqui pede decisão, e essa é a mudança inteira.
 *
 * ⚠️ **ISTO ERA UM CARTÃO COM BOTÃO, E ELE PRENDIA UM QUARTO DE QUEM CHEGAVA ATÉ AQUI.** Medido no painel
 * da Poki (1.30, 15-16/09): de 851 jogadores que completam as três lições, só **647 emitem `tutor_done`**
 * — 204 pessoas (24%) somem na última tela, que é a maior perda única do tutorial inteiro (as três etapas
 * perdem 113, 172 e 117). A causa era uma linha: a contagem regressiva chamava `saiDoTutorial` sozinha,
 * mas `pausa.current` virava `true` no primeiro `onPointerMove` sobre o cartão e **nunca voltava a false**.
 * No dedo — 81% do tráfego — qualquer toque dispara `pointermove`, então o caso NORMAL do celular era a
 * contagem congelar e o jogador ficar olhando uma tela que esperava um clique que ele não sabia dever dar.
 * A intenção original ("uma contagem que come um clique é o pior defeito numa tela de prêmio") estava
 * certa sobre o prêmio; o conserto foi tirar o prêmio e o clique daqui, não consertar a pausa.
 *
 * ⚠️ **A PROMESSA PRECISA SER FEITA NESTE INSTANTE**, e é a única informação além do parabéns. O tutorial é
 * jogado com `SKIN_TUTORIAL` e a primeira sala de verdade devolve o jogador à skin equipada: sem uma linha
 * dizendo como ficar com ela, a troca de planeta lê como defeito. A barra nasce no valor REAL
 * (`stats.games`), que num tutorial de estreia é zero mas não é zero para quem o refez pelo `?tutorial=1`.
 *
 * ⚠️ A contagem **não pausa por nada** e o disparo é guardado por um ref: `saiDoTutorial` chama `play()`,
 * que é assíncrono, e sem a guarda um segundo tick entraria na sala duas vezes.
 */
function Fim({ T, demo }) {
  const foi = useRef(false);
  const games = ((app.get().session || {}).stats || {}).games | 0;
  const alvo = PROGRESSO.PARTIDAS, feitas = Math.max(0, Math.min(alvo, games));
  const temSkin = ((app.get().session || {}).skins || []).includes(SKIN_TUTORIAL);
  // ⚠️ `demo` desarma o relógio, e não é zelo: `?screen=tutor:fim` e a matriz de responsividade montam
  // esta tela para MEDI-LA, e sem a guarda ela entraria numa sala de verdade três segundos depois — a
  // sonda mediria outra tela e o `?screen=` seria inutilizável para conferir esta de olho.
  useEffect(() => {
    if (demo) return;
    const t = setTimeout(() => { if (!foi.current) { foi.current = true; saiDoTutorial({ fim: true }); } }, TUTOR.FIM_MS);
    return () => clearTimeout(t);
  }, [demo]);
  return <div id="tutor-fim">
    <div className="tf-tit">{T.fimTitulo}</div>
    <div className="tf-sub">{T.fimSub}</div>
    {/* Quem já tem a skin não recebe promessa nenhuma — prometer o que a pessoa já possui é o jeito mais
        rápido de a tela perder a credibilidade. */}
    {temSkin ? null : <div className="tf-prom">
      <span className="ach-bar" role="progressbar" aria-valuemin={0} aria-valuemax={alvo} aria-valuenow={feitas}>
        <i style={{ "--p": feitas / alvo }} />
      </span>
      <span>{preenche(T.fimPromessa, { n: alvo, s: skinById(SKIN_TUTORIAL).name })}</span>
    </div>}
    <div className="tf-indo">{T.fimIndo}</div>
  </div>;
}

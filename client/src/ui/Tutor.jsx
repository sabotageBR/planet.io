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
import React from "react";
import { app } from "../state/app.js";
import { useLabels } from "../hooks/useTheme.js";
import { preenche } from "../i18n/index.js";
import { ETAPA, ETAPAS } from "../game/tutor.js";
// ⚠️ As duas decisões (qual frase, qual botão) moram num `.js` à parte: o `node --test` não carrega
// `.jsx`, e uma função de decisão que ninguém testa é onde o par mouse/dedo se inverte em silêncio.
import { falaDoTutor, promptClassico, alvoDoTutor } from "./tutorFala.js";
import { saiDoTutorial } from "../state/actions.js";
import { PROGRESSO, SKIN_TUTORIAL, skinById } from "@warspace/shared";
// ── OS DOIS MODELOS (ui/tutorEstilo.js) ──
// O PADRÃO é o `cena` (a tirinha — `TutorCena.jsx`), escolhido pelo dono do jogo entre três candidatos
// jogados em bancada. Este arquivo continua sendo o dono do CLÁSSICO — a tela anterior, que todos os ⚠️
// daqui descrevem e que fica alcançável por `?tutor=classico` enquanto o Fit Test não disser que o `cena`
// não é pior. O que os dois dividem mora em `tutorPecas.jsx` (a trilha, o desenho do botão, o prompt do
// rodapé, o relógio do fim): duas cópias divergiriam no primeiro conserto.
// ⚠️ **`?tutor=` É LIDO NA CARGA DO MÓDULO, e não dá para ser de outro jeito**: quando o destino do boot é
// o tutorial, `state/actions.js` faz `history.replaceState(null,"",location.pathname)` ANTES do primeiro
// render — lido dentro do componente, `location.search` já viria vazio e o modelo pedido cairia no padrão
// sem aviso. É o mesmo molde do `?dead=` de `Dead.jsx`, e funciona porque `App → Hud → Tutor` é import
// estático: o módulo carrega antes de o boot rodar.
import { estiloDe } from "./tutorEstilo.js";
import { Trilha, PromptRodape, useEntraSozinho } from "./tutorPecas.jsx";
import TutorCena from "./TutorCena.jsx";

const Q = typeof location !== "undefined" ? new URLSearchParams(location.search).get("tutor") : null;
/** Um lookup só, e nenhum `if (estilo === …)` espalhado pela tela: o que não estiver aqui é o clássico. */
const MODELOS = { cena: TutorCena };

/** O título de cada etapa, para a tela de "completa" poder anunciar a próxima. */
const TIT_ETAPA = { [ETAPA.NOVA]: "novaTit", [ETAPA.TIRO]: "tiroTit", [ETAPA.SPLIT]: "splitTit" };

export default function Tutor({ d, tecla }) {
  const LB = useLabels();
  if (!d) return null;
  const T = LB.tutor || {};
  // `d.estilo` só existe na BANCADA (`tutorDemo`, que o grava no objeto do hudStore) e ganha da URL — ver
  // o porquê em `estiloDe`. No jogo de verdade vale o `?tutor=`, e sem ele o padrão.
  const M = MODELOS[estiloDe({ demo: d.estilo, q: Q })];
  if (M) return <M d={d} T={T} tecla={tecla} />;
  if (d.fim) return <Fim T={T} demo={!!d.demo} />;
  if (d.celebra) return <Completa d={d} T={T} />;
  const [tit, txt] = falaDoTutor(d, T, tecla);
  // ⚠️ **O PROMPT MORA NO RODAPÉ, LONGE DA INSTRUÇÃO, E ISSO NÃO É ESTÉTICA.** Empilhados no topo eles
  // desciam até o meio da tela e TAPAVAM o planeta e os pedaços — ou seja, a explicação cobria a coisa
  // explicada. Com a instrução em cima e o prompt embaixo, o miolo da tela (onde o jogo acontece) fica
  // livre; e no dedo o prompt ainda cai ao lado dos botões de toque reais, que é para onde ele aponta.
  return <>
    <div id="tutor" data-style="classico" data-etapa={d.etapa} data-alvo={alvoDoTutor(d) || undefined}>
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
    <PromptRodape p={promptClassico(d, T, tecla)} />
  </>;
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
  return <div id="tutor-ok" data-style="classico" role="status" aria-live="assertive">
    <div className="tok-card">
      <div className="tok-selo">✓</div>
      <div className="tok-tit">{preenche(T.feito, { n })}</div>
      <div className="tok-sub">{T["feito" + n] || ""}</div>
      {d.auto && n === ETAPA.TIRO ? <div className="tok-auto">{T.tiroAuto}</div> : null}
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
  const games = ((app.get().session || {}).stats || {}).games | 0;
  const alvo = PROGRESSO.PARTIDAS, feitas = Math.max(0, Math.min(alvo, games));
  const temSkin = ((app.get().session || {}).skins || []).includes(SKIN_TUTORIAL);
  // ⚠️ `demo` desarma o relógio, e não é zelo: `?screen=tutor:fim` e a matriz de responsividade montam
  // esta tela para MEDI-LA, e sem a guarda ela entraria numa sala de verdade três segundos depois — a
  // sonda mediria outra tela e o `?screen=` seria inutilizável para conferir esta de olho.
  // O relógio em si (o `setTimeout` com guarda de ref) é o MESMO dos quatro modelos: `useEntraSozinho`.
  useEntraSozinho(!demo);
  return <div id="tutor-fim" data-style="classico">
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

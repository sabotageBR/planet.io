// ── O TUTORIAL DE ESTREIA, NA TELA ───────────────────────────────────────────
// UMA cara só, e ela é OVERLAY dentro do `#hud` — nunca uma tela em `SCREENS`. Uma tela nova deixaria o
// HUD inteiro `hidden` (`Hud.jsx`), faria o `GameHost` chamar `game.leave()` no primeiro render, prenderia
// a cortina `#boot` por 10 s no pacote e pararia o relógio de sessão do portal.
//
//   EM CURSO — a trilha 1·2·3 com o contador "N/3", a barra da etapa 1, o título, a instrução em letra
//   grande e o PROMPT DE BOTÃO.
//   ⚠️ Já foram TRÊS caras: havia a tela cheia de "ETAPA COMPLETA" (3,2 s, três vezes) e o cartão de
//   PARABÉNS (3 s). As duas saíram — eram 12,6 s de parada obrigatória em quatro pontos de saída (ver
//   `TUTOR` em game/tutor.js). O elogio virou o selo de `TutorCena.jsx` e o parabéns, a faixa de
//   `TutorParabens.jsx` por cima da primeira partida.
//
// ⚠️ O PRIMEIRO FRAME JÁ É A ARENA. Sem cartão de abertura e sem botão de começar: o funil do Fit Test
// 1.12 leu 17% de abandono numa tela antes de jogar, e foi por isso que a tela inicial deixou de existir
// no pacote. Um tutorial que ABRE com um modal é a mesma tela de volta.
// ⚠️ TODA instrução vem em par mouse/dedo, e o PROMPT também. No dedo, tocar no canvas NÃO atira — dirige
// o planeta; dizer "clique para atirar" a quem tem dedo faz o planeta virar, nada explodir, e o jogador
// concluir que o tutorial mente. `d.dedo` vem do mesmo getter que arma o direcional virtual.
// ⚠️ `pointer-events:none` no bloco em curso, com `auto` só no botão: o `#hud` inteiro é `none` porque os
// painéis engoliam o alvo do jogador e congelavam o movimento.
import React, { useEffect } from "react";
import { useLabels } from "../hooks/useTheme.js";
import { ETAPA, SEQUENCIA, posicaoDaEtapa } from "../game/tutor.js";
// ⚠️ As duas decisões (qual frase, qual botão) moram num `.js` à parte: o `node --test` não carrega
// `.jsx`, e uma função de decisão que ninguém testa é onde o par mouse/dedo se inverte em silêncio.
import { falaDoTutor, promptClassico, alvoDoTutor } from "./tutorFala.js";
import { saiDoTutorial, preparaSaida } from "../state/actions.js";
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

export default function Tutor({ d, tecla }) {
  const LB = useLabels();
  // ⚠️ A SAÍDA ADIANTADA (`preparaSaida`): quando a ÚLTIMA etapa começa, o nick e a sala da primeira partida
  // já vão sendo pedidos — são dois passos de rede que o fim faria em série, com a tela vazia. Aqui, e não
  // num modelo, porque os dois modelos passam por este componente. A dependência é um BOOLEANO: `d` é objeto
  // novo a 8 Hz. `demo` fica de fora — a bancada monta a última etapa sem querer entrar em sala nenhuma.
  const ultima = !!d && d.etapa === SEQUENCIA[SEQUENCIA.length - 1] && !d.demo;
  useEffect(() => { if (ultima) preparaSaida(); }, [ultima]);
  if (!d) return null;
  const T = LB.tutor || {};
  // `d.estilo` só existe na BANCADA (`tutorDemo`, que o grava no objeto do hudStore) e ganha da URL — ver
  // o porquê em `estiloDe`. No jogo de verdade vale o `?tutor=`, e sem ele o padrão.
  const M = MODELOS[estiloDe({ demo: d.estilo, q: Q })];
  if (M) return <M d={d} T={T} tecla={tecla} />;
  if (d.fim) return <Fim demo={!!d.demo} />;
  const [tit, txt] = falaDoTutor(d, T, tecla);
  // ⚠️ **O PROMPT MORA NO RODAPÉ, LONGE DA INSTRUÇÃO, E ISSO NÃO É ESTÉTICA.** Empilhados no topo eles
  // desciam até o meio da tela e TAPAVAM o planeta e os pedaços — ou seja, a explicação cobria a coisa
  // explicada. Com a instrução em cima e o prompt embaixo, o miolo da tela (onde o jogo acontece) fica
  // livre; e no dedo o prompt ainda cai ao lado dos botões de toque reais, que é para onde ele aponta.
  return <>
    <div id="tutor" data-style="classico" data-etapa={d.etapa} data-alvo={alvoDoTutor(d) || undefined}>
      <Trilha pos={posicaoDaEtapa(d.etapa)} T={T} />
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
 * O FIM DO TUTORIAL: NÃO HÁ TELA — entra na sala na hora (`useEntraSozinho`, `TUTOR.FIM_MS` = 0).
 *
 * ⚠️ **AQUI MORAVAM AS DUAS TELAS DE PARADA DO TUTORIAL**: a de "ETAPA COMPLETA" (3,2 s de tela cheia, três
 * vezes) e a de PARABÉNS (3 s). Saíram juntas — 12,6 s de espera obrigatória em quatro pontos de saída, a
 * tela de "Level Complete" do estudo de caso que a própria Poki divulga (ver `TUTOR` em game/tutor.js).
 * O parabéns e a promessa da skin viraram a faixa de `TutorParabens.jsx`, por cima da primeira partida.
 * ⚠️ A história desta tela continua valendo como aviso: ela JÁ FOI um cartão com botão, e prendia 24% de quem
 * chegava até ela (medido na 1.30: 851 completavam as três lições e só 647 emitiam `tutor_done`), porque a
 * contagem congelava no primeiro `pointermove`. Toda parada aqui custou gente; a saída foi não parar.
 * ⚠️ `demo` desarma o relógio: a bancada (`?screen=tutor:…`) e a matriz montam o tutorial para MEDI-LO, e
 * sem a guarda entrariam numa sala de verdade. O disparo é guardado por um ref (`play()` é assíncrono).
 */
function Fim({ demo }) { useEntraSozinho(!demo); return null; }

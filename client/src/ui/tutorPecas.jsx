// ── AS PEÇAS QUE OS MODELOS DO TUTORIAL DIVIDEM ──────────────────────────────
// Quatro modelos da mesma aula (ui/tutorEstilo.js) e UM lugar para o que não é de nenhum deles: a trilha
// 1·2·3, o desenho do botão que se aperta, o Pular, a promessa da skin e o relógio que entra na sala
// sozinho. O que cada modelo tem de próprio é o ARRANJO — se uma destas peças ganhasse quatro cópias,
// elas divergiriam no primeiro conserto (a lição de `useSpec`/`SpecBar`).
//
// ⚠️ **UM ID É API, E TODO MODELO O RESPEITA** — `#tutor`. Ele não é só um nome: carrega o que o HUD faz
// enquanto o tutorial está no ar, por `:has()` (o fim do bloco do tutorial em `styles/ui.css`), e a matriz
// de responsividade o lê por id: aula em curso = some o ruído (placar, feed, chat, topo), FICAM `#touch` e
// `#hud-cd`. (Já foram três: `#tutor-ok` e `#tutor-fim` eram as duas telas cheias — "etapa completa" e
// parabéns —, que escondiam TUDO por baixo. Saíram com as telas: o tutorial não para mais o jogo para
// elogiar. O elogio é o selo `#tutor-selo`, filho do `#tutor`, e o parabéns é `TutorParabens.jsx`.)
// ⚠️ `data-etapa` no `#tutor` também é API: é ele que esconde o bloco de arma nas etapas 1 e 3. Esquecê-lo
// devolve o "0 MÍSSIL" na lição de MOVER, em silêncio.
// ⚠️ **NENHUM COMPONENTE É DEFINIDO DENTRO DE OUTRO.** `h.tutor` é um objeto NOVO a cada 125 ms
// (`game/index.js` monta `{...tutor,dedo}` no literal do `hudStore.set`), então o modelo re-renderiza a
// 8 Hz; um componente declarado dentro do corpo de outro seria um TIPO novo a cada render, o React
// desmontaria e remontaria o nó, e a animação e o `<img>` reiniciariam oito vezes por segundo.
// ⚠️ **GLIFO DECORATIVO NUNCA É `<button>`, `<a>` NEM `role="button"`**: `ui.css` devolve
// `pointer-events:auto` a esses três dentro do `#hud`. Uma réplica de botão que capture o toque é um botão
// que não faz nada NO LUGAR de um toque que dirigiria o planeta — e ainda entraria no critério de 44 px.
import React, { useEffect, useRef } from "react";
import { app } from "../state/app.js";
import { preenche } from "../i18n/index.js";
import { ETAPAS, TUTOR } from "../game/tutor.js";
import { saiDoTutorial } from "../state/actions.js";
import { PROGRESSO, SKIN_TUTORIAL, skinById } from "@warspace/shared";
// A MESMA arte do cenário do menu, dos cartões de Modos e das três skins de mascote: importada por módulo,
// o Vite emite UM asset compartilhado — zero byte a mais no zip de portal.
import marte from "../assets/scene/planeta-laranja.webp";
import terra from "../assets/scene/planeta-azul.webp";
import missil from "../assets/scene/missil.webp";

/**
 * OS TRÊS MASCOTES, E CADA UM TEM UM PAPEL FIXO no tutorial inteiro — no mundo e na tela:
 *   MARTE = VOCÊ (é a `SKIN_TUTORIAL`, o planeta com que o aluno joga);
 *   TERRA = O OUTRO (o alvo da etapa 2 e a presa da 3 nascem com essa skin — `game/net/tutorServer.js`).
 * Papel fixo é o que deixa um desenho de 40 px dizer "este é você" sem uma palavra.
 */
export const ARTE = {
  marte: { src: marte, w: 619, h: 640 },
  terra: { src: terra, w: 640, h: 616 },
  missil: { src: missil, w: 256, h: 130 },   // não é personagem: é o míssil do cenário, para a tirinha do tiro
};

/** Um mascote. `width`/`height` do ARQUIVO reservam a proporção antes de a imagem chegar. */
export function Mascote({ quem, className }) {
  const a = ARTE[quem];
  return <img className={className} src={a.src} width={a.w} height={a.h} alt="" aria-hidden="true"
    draggable={false} decoding="async" />;
}

/**
 * A trilha das etapas: bolas NUMERADAS ligadas por um traço — o vocabulário de tutorial que se lê sem
 * uma palavra.
 * ⚠️ Recebe a POSIÇÃO (1-based, `posicaoDaEtapa` em game/tutor.js), nunca o NÚMERO da etapa: os números são
 * nomes do funil (`tutor_nova|tiro|split`) e deixaram de ser a ordem quando o tiro saiu da sequência — com o
 * número, a etapa de dividir (3) acenderia as duas bolas como feitas.
 * ⚠️ NENHUM ESTADO VAI SÓ NA COR: o número está sempre lá e a etapa feita vira ✓. Medido com o validador
 * de paleta, o verde e o âmbar dos tokens ficam com ΔE 6,7 em protanopia.
 * `semPasso`: sem o "1/2" escrito ao lado (o modelo `cena`, que não tem texto nenhum).
 */
export function Trilha({ pos, T, semPasso = false }) {
  // ⚠️ `atual`, e não `n`: o `map` abaixo declara o próprio `n`, e um homônimo aqui fora seria sombreado
  // dentro dele. É a mesma classe de defeito que o `marco`/`degrau` de `game/index.js` custou caro.
  const atual = Math.min(Math.max(pos | 0, 1), ETAPAS + 1), vis = Math.min(atual, ETAPAS);
  return <div className="tut-trilha" role="progressbar" aria-valuenow={vis} aria-valuemin={1} aria-valuemax={ETAPAS}>
    {/* ⚠️ O "1/2" É TEXTO, ao lado das bolas, e não substitui nenhuma delas: as bolas dizem o CAMINHO e o
        número diz a POSIÇÃO sem depender de contar círculos numa tela de 360 px. O modelo `cena` o dispensa. */}
    {semPasso ? null : <b className="tut-passo">{preenche(T.passo, { n: vis, t: ETAPAS })}</b>}
    {Array.from({ length: ETAPAS }, (_, i) => {
      const n = i + 1, st = n < atual ? "ok" : n === atual ? "now" : "off";
      return <React.Fragment key={n}>
        {i ? <i className={"tut-liga " + (n <= atual ? "ok" : "")} /> : null}
        <b className={"tut-bola " + st}>{st === "ok" ? "✓" : n}</b>
      </React.Fragment>;
    })}
  </div>;
}

/**
 * O DESENHO do que apertar — um mouse, uma tecla, um toque ou o botão do HUD —, sem invólucro nenhum: quem
 * decide onde ele mora (rodapé, dentro de uma pílula, num balão, num quadro de tirinha) é o modelo.
 * `p` é o retorno de `promptDoTutor`. SVG inline — nada de imagem nova.
 */
export function Glifo({ p }) {
  if (!p) return null;
  if (p.tipo === "tecla") return <kbd className="tut-tecla">{p.rotulo}</kbd>;
  if (p.tipo === "hud") return <span className="tut-hud-btn">{p.rotulo}</span>;
  if (p.tipo === "toque") return <svg viewBox="0 0 40 60" aria-hidden="true" className="tut-mouse">
    <circle cx="20" cy="26" r="11" className="tm-toque" />
    <circle cx="20" cy="26" r="17" className="tm-onda" />
  </svg>;
  return <svg viewBox="0 0 40 60" aria-hidden="true" className="tut-mouse">
    <rect x="4" y="4" width="32" height="52" rx="16" className="tm-corpo" />
    {/* a metade ESQUERDA acesa é a resposta a "qual botão na tela" */}
    {p.tipo === "mouse-clique" ? <path d="M4 20 V20 A16 16 0 0 1 20 4 V20 Z" className="tm-esq" /> : null}
    <line x1="20" y1="4" x2="20" y2="20" className="tm-div" />
    <line x1="4" y1="20" x2="36" y2="20" className="tm-div" />
    {p.tipo === "mouse-mover" ? <g className="tm-setas"><path d="M20 34 l-7 7 h4 v8 h6 v-8 h4 Z" /></g> : null}
  </svg>;
}

/**
 * O PROMPT DO RODAPÉ: o desenho GRANDE do que apertar, pulsando, com o rótulo embaixo (`#tut-prompt`).
 *
 * É o "destaque do botão" de quem joga no MOUSE, onde não existe botão nenhum na tela para pulsar — no dedo
 * quem faz esse papel é o botão REAL do HUD (`alvoDoTutor` → `data-alvo`), e por isso os dois modelos só
 * montam isto quando não há botão de verdade a apontar: uma réplica apertável longe do botão real convida
 * a criança a tocar NELA (ver `promptClassico`, em `tutorFala.js`).
 * ⚠️ No RODAPÉ, longe da instrução, e isso não é estética: empilhados no topo eles desciam até o meio da
 * tela e tapavam o planeta — a explicação cobrindo a coisa explicada.
 */
export function PromptRodape({ p, semRotulo = false }) {
  if (!p) return null;
  return <div id="tut-prompt" className={"tut-btn tut-btn-" + p.tipo} aria-hidden="true">
    <Glifo p={p} />
    {!semRotulo && p.tipo !== "tecla" && p.tipo !== "hud" ? <b>{p.rotulo}</b> : null}
  </div>;
}

/**
 * O Pular: discreto e presente do segundo zero, e a ÚNICA coisa clicável do tutorial inteiro — nenhum
 * clique é EXIGIDO em modelo nenhum. Nunca primário e nunca um ✕ sozinho (✕ lê como "fechar o jogo").
 */
export function Pular({ T, icone = false }) {
  // `icone`: ⏩ desenhado (o modelo `cena` não tem texto) — o nome continua no `aria-label`/`title`
  return <button className={"tut-sair" + (icone ? " ico" : "")} onClick={() => saiDoTutorial({ fim: false })}
    aria-label={T.pular} title={icone ? T.pular : undefined}>
    {icone ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5v13l8.5-6.5zM12.5 5.5v13L21 12z" /></svg> : T.pular}</button>;
}

/**
 * A SAÍDA DO FIM: `TUTOR.FIM_MS` (hoje ZERO — não há tela de fim) depois de `ativo` virar verdadeiro, entra
 * na primeira sala SOZINHO. O `setTimeout` fica mesmo com zero: ele tira o `play()` de dentro do commit do React.
 *
 * ⚠️ **A DEPENDÊNCIA É UM BOOLEANO, NUNCA `d`.** `h.tutor` é objeto novo a cada 125 ms; um
 * `useEffect(…,[d])` desmontaria e remontaria o `setTimeout` a 8 Hz e NINGUÉM sairia do parabéns — uma
 * tela que espera para sempre, sem botão, que é exatamente o defeito que prendia 24% de quem chegava aqui.
 * ⚠️ Guarda de ref porque `saiDoTutorial` chama `play()`, que é assíncrono: sem ela um segundo disparo
 * entraria na sala duas vezes.
 * ⚠️ Chamado no TOPO do modelo, incondicionalmente (regra dos hooks) — o modelo fica montado nas três
 * caras, e é `ativo` que liga o relógio quando o `fim` chega.
 */
export function useEntraSozinho(ativo) {
  const foi = useRef(false);
  useEffect(() => {
    if (!ativo) return;
    const t = setTimeout(() => { if (!foi.current) { foi.current = true; saiDoTutorial({ fim: true }); } }, TUTOR.FIM_MS);
    return () => clearTimeout(t);
  }, [ativo]);
}

/**
 * A PROMESSA DA SKIN, com o MARTE ao lado: "jogue 3 partidas e o Marte Bravo é seu". O tutorial é jogado
 * com ele e a primeira sala de verdade o tira do jogador — sem esta linha a troca de planeta lê como
 * defeito. Quem a desenha hoje é a faixa de `TutorParabens.jsx`, por cima da primeira partida. Mostrar o PRÓPRIO mascote aqui é o que liga a frase ao planeta que ele acabou de pilotar.
 * Quem já tem a skin não recebe promessa nenhuma: prometer o que a pessoa já possui é o jeito mais rápido
 * de a tela perder a credibilidade.
 */
export function Promessa({ T }) {
  const sess = app.get().session || {};
  if ((sess.skins || []).includes(SKIN_TUTORIAL)) return null;
  const alvo = PROGRESSO.PARTIDAS, feitas = Math.max(0, Math.min(alvo, (sess.stats || {}).games | 0));
  return <div className="tp-prom">
    <Mascote quem="marte" className="tp-prom-arte" />
    <div className="tp-prom-txt">
      <span>{preenche(T.fimPromessa, { n: alvo, s: skinById(SKIN_TUTORIAL).name })}</span>
      <span className="ach-bar" role="progressbar" aria-valuemin={0} aria-valuemax={alvo} aria-valuenow={feitas}>
        <i style={{ "--p": feitas / alvo }} />
      </span>
    </div>
  </div>;
}

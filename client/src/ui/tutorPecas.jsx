// ── AS PEÇAS QUE OS MODELOS DO TUTORIAL DIVIDEM ──────────────────────────────
// Quatro modelos da mesma aula (ui/tutorEstilo.js) e UM lugar para o que não é de nenhum deles: a trilha
// 1·2·3, o desenho do botão que se aperta, o Pular, a promessa da skin e o relógio que entra na sala
// sozinho. O que cada modelo tem de próprio é o ARRANJO — se uma destas peças ganhasse quatro cópias,
// elas divergiriam no primeiro conserto (a lição de `useSpec`/`SpecBar`).
//
// ⚠️ **TRÊS IDS SÃO API, E TODO MODELO OS RESPEITA** — `#tutor`, `#tutor-ok` e `#tutor-fim`. Eles não são
// só nomes: carregam o que o HUD faz enquanto o tutorial está no ar, por `:has()` (o fim do bloco do
// tutorial em `styles/ui.css`), e a matriz de responsividade os lê por id.
//   `#tutor`     = aula em curso: some o ruído (placar, feed, chat, topo), FICAM `#touch` e `#hud-cd`;
//   `#tutor-ok`  = modal de tela cheia: some TUDO por baixo;
//   `#tutor-fim` = idem, e nada captura o ponteiro.
// Um modelo que queira comemorar SEM cobrir o jogo (o `legenda`) renderiza a comemoração como `#tutor`, e
// é o id — não um `if` no CSS — que mantém os botões de toque na tela.
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
 * A trilha 1·2·3. Três bolas NUMERADAS ligadas por um traço — o vocabulário de tutorial que o pedido
 * nomeia ("uma barra que tem 3 etapas, 1,2,3").
 * ⚠️ NENHUM ESTADO VAI SÓ NA COR: o número está sempre lá e a etapa feita vira ✓. Medido com o validador
 * de paleta, o verde e o âmbar dos tokens ficam com ΔE 6,7 em protanopia.
 */
export function Trilha({ etapa, T }) {
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
export function PromptRodape({ p }) {
  if (!p) return null;
  return <div id="tut-prompt" className={"tut-btn tut-btn-" + p.tipo} aria-hidden="true">
    <Glifo p={p} />
    {p.tipo !== "tecla" && p.tipo !== "hud" ? <b>{p.rotulo}</b> : null}
  </div>;
}

/**
 * O Pular: discreto e presente do segundo zero, e a ÚNICA coisa clicável do tutorial inteiro — nenhum
 * clique é EXIGIDO em modelo nenhum. Nunca primário e nunca um ✕ sozinho (✕ lê como "fechar o jogo").
 */
export function Pular({ T }) {
  return <button className="tut-sair" onClick={() => saiDoTutorial({ fim: false })}>{T.pular}</button>;
}

/**
 * O RELÓGIO DO FIM: `TUTOR.FIM_MS` depois de `ativo` virar verdadeiro, entra na primeira sala SOZINHO.
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
 * defeito. Mostrar o PRÓPRIO mascote aqui é o que liga a frase ao planeta que ele acabou de pilotar.
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

/**
 * "entrando…" com a barra que ENCHE em `FIM_MS`: a tela não tem botão, e a barra é o que diz ao jogador
 * que ele não precisa fazer nada — sem ela, três segundos parados diante de um parabéns leem como "e
 * agora, onde eu clico?".
 * ⚠️ A barra é ENFEITE: quem entra na sala é `useEntraSozinho`, por `setTimeout`. `body[data-reduce="1"] *`
 * zera toda duração de animação, então NADA aqui pode depender do fim de uma animação de CSS.
 */
export function Contagem({ T, demo }) {
  return <div className="tp-conta" data-demo={demo ? "1" : undefined}>
    <span>{T.fimIndo}</span>
    <i style={{ "--ms": TUTOR.FIM_MS + "ms" }} />
  </div>;
}

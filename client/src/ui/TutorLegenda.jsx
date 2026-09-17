// ── TUTORIAL · MODELO 1 · LEGENDA — "o jogo nunca é coberto" ─────────────────
// ⚠️ PROVISÓRIO: um dos três candidatos de `ui/tutorEstilo.js`. Se não for o escolhido, sai este arquivo,
// o bloco `[data-style="legenda"]` de `styles/ui.css` e as entradas `tutor:legenda:*` da matriz.
//
// A ideia: TUDO numa faixa só, no topo — três segmentos (o progresso) e uma pílula (a instrução, com o
// desenho do botão DENTRO da frase). O rodapé e o miolo da tela ficam 100% livres, mais do que no
// clássico, e a comemoração de etapa NÃO é um cartão: é a própria pílula virando selo, sem véu, com o
// jogador dirigindo o tempo todo.
//
// ⚠️ **A COMEMORAÇÃO RENDERIZA COMO `#tutor`, NÃO `#tutor-ok`, e o id É a decisão.** `#tutor-ok` é o modal
// de tela cheia: `#hud:has(#tutor-ok) > *:not(#tutor-ok)` esconde TUDO por baixo, inclusive os botões de
// toque — e aqui o ponto é o jogador não perder o controle nem por 3 s. Com `#tutor` valem as regras da
// aula em curso (some o ruído, ficam `#touch` e `#hud-cd`), sem um `if` a mais no CSS.
// ⚠️ **O SELO FICA PELA JANELA INTEIRA DE `celebra`, e nunca some por animação**: `body[data-reduce="1"] *`
// zera toda duração, então um selo que "some em 1 s" por keyframe nasceria invisível para quem ligou
// "menos movimento". Quem o tira da tela é o mundo (`SOBRA_MS`), como no clássico.
// ⚠️ SEGMENTO NÃO É ESTADO SÓ POR COR: cada um leva o número, e o feito vira ✓ — a regra da `Trilha`.
import React from "react";
import { preenche } from "../i18n/index.js";
import { ETAPA, ETAPAS } from "../game/tutor.js";
import { falaDoTutor, promptDoTutor, alvoDoTutor } from "./tutorFala.js";
import { Glifo, Passo, Pular, Promessa, Contagem, useEntraSozinho } from "./tutorPecas.jsx";

const TIT_ETAPA = { [ETAPA.NOVA]: "novaTit", [ETAPA.TIRO]: "tiroTit", [ETAPA.SPLIT]: "splitTit" };

/**
 * Os três segmentos. `feitas` = quantas etapas já fecharam; `atual` = a que está em curso (0 = nenhuma);
 * `pct` só enche o segmento atual na etapa 1, que é a única com progresso contínuo (sai da massa) — nas
 * outras ele PULSA, porque uma barra parada em zero enquanto o jogador tenta lê como "não estou vendo o
 * que você faz".
 */
function Segmentos({ feitas, atual, pct }) {
  const pos = Math.min(Math.max(atual || feitas, 1), ETAPAS);
  return <div className="tl-segs" role="progressbar" aria-valuenow={pos} aria-valuemin={1} aria-valuemax={ETAPAS}>
    {Array.from({ length: ETAPAS }, (_, i) => {
      const n = i + 1, st = n <= feitas ? "ok" : n === atual ? "now" : "off";
      const w = st === "ok" ? 100 : st === "now" ? Math.round((pct || 0) * 100) : 0;
      return <span key={n} className={"tl-seg " + st + (st === "now" && !(pct > 0) ? " pulsa" : "")}>
        <i style={{ width: w + "%" }} />
        <em>{st === "ok" ? "✓" : n}</em>
      </span>;
    })}
  </div>;
}

export default function TutorLegenda({ d, T, tecla }) {
  useEntraSozinho(!!d.fim && !d.demo);

  if (d.fim) return <div id="tutor-fim" data-style="legenda">
    <Segmentos feitas={ETAPAS} atual={0} pct={0} />
    <div className="tf-tit">{T.fimTitulo}</div>
    <div className="tf-sub">{T.fimSub}</div>
    <Promessa T={T} />
    <Contagem T={T} demo={!!d.demo} />
  </div>;

  const n = d.etapa, ok = !!d.celebra;
  const [tit, txt] = ok ? [preenche(T.feito, { n }), T["feito" + n] || ""] : falaDoTutor(d, T, tecla);
  const p = ok ? null : promptDoTutor(d, T, tecla);
  // `tecla` e `hud` já trazem o rótulo DENTRO do desenho; só o mouse e o toque precisam dele por extenso
  const rotulo = p && p.tipo !== "tecla" && p.tipo !== "hud" ? p.rotulo : "";
  return <div id="tutor" data-style="legenda" data-etapa={n} data-ok={ok ? "1" : undefined}
    data-alvo={(!ok && alvoDoTutor(d)) || undefined}>
    <div className="tl-topo">
      <Passo etapa={ok ? Math.min(n + 1, ETAPAS) : n} T={T} />
      <Segmentos feitas={ok ? n : n - 1} atual={ok ? 0 : n} pct={n === ETAPA.NOVA && !d.pre ? d.pct : 0} />
      <Pular T={T} />
    </div>
    {/* a pílula anima FORTE só quando muda de etapa ou vira selo; a troca de frase dentro dela é um fade */}
    <div className={"tl-pilula" + (ok ? " ok" : "")} key={(ok ? "ok" : "e") + n}
      role="status" aria-live={ok ? "assertive" : "polite"}>
      {ok ? <span className="tl-selo">✓</span> : p ? <span className="tl-glifo"><Glifo p={p} /></span> : null}
      <span className="tl-txts">
        <b className="tl-tit">{tit}{rotulo ? <i className="tl-rot"> · {rotulo}</i> : null}</b>
        <span className="tl-txt" key={txt}>{txt}</span>
        {ok && d.auto && n === ETAPA.TIRO ? <span className="tl-auto">{T.tiroAuto}</span> : null}
        {/* dizer O QUE VEM é o que costura três lições numa sequência — e aqui não há cartão para fazê-lo */}
        {ok && n < ETAPAS ? <b className="tl-prox">{preenche(T.prox, { s: T[TIT_ETAPA[n + 1]] || "" })}</b> : null}
      </span>
    </div>
  </div>;
}

// ── TUTORIAL · MODELO 2 · SARGENTO — "alguém está te ensinando" ──────────────
// ⚠️ PROVISÓRIO: um dos três candidatos de `ui/tutorEstilo.js`. Se não for o escolhido, sai este arquivo,
// o bloco `[data-style="sargento"]` de `styles/ui.css`, as chaves `sgt*` do i18n e as entradas
// `tutor:sargento:*` da matriz.
//
// A ideia: a LUA SOLDADO (o mascote de capacete) dá as ordens num balão de quadrinho, e as três etapas
// são três MEDALHAS. Uma instrução que sai da boca de um personagem é lida como fala, não como aviso de
// sistema — e é o vocabulário que uma criança já conhece de qualquer jogo de celular.
// Os três mascotes têm papel fixo (ver `ARTE` em `tutorPecas.jsx`): a Lua ENSINA, o Marte é VOCÊ e a
// Terra é O OUTRO — por isso o balão das etapas 2 e 3 mostra a Terra: é o retrato de quem o "NELE" de
// "ATIRE NELE" quer dizer, e é a mesma cara que o alvo tem no mundo.
//
// ⚠️ **UM NÓ SÓ NAS TRÊS CARAS — o `id` troca NO MESMO elemento.** É o que mantém o `<img>` do mascote
// montado (sem recarregar nem piscar) e deixa a medalha ACENDER em vez de aparecer acesa. Para o CSS do
// HUD nada muda: as regras `:has(#tutor-ok)` olham o id que estiver valendo.
// ⚠️ O DESENHO DO BOTÃO VAI DENTRO DO BALÃO, AO LADO DO TEXTO — nunca empilhado embaixo: empilhado, o
// bloco desce até o meio da tela e tapa o planeta, que é o defeito que separou a instrução do prompt no
// clássico. Aqui o rodapé inteiro fica livre.
// ⚠️ O balão anima FORTE só quando muda de etapa ou de cara (`key`); a troca de frase dentro da etapa 1
// (que acontece duas ou três vezes) é um fade — um estouro a cada frase distrai de quem está jogando.
// ⚠️ A comemoração NÃO diz "BOA!": o canvas já estoura essa palavra no `festeja` (game/index.js), e sem
// véu pesado o jogador vê as duas.
import React from "react";
import { preenche } from "../i18n/index.js";
import { ETAPA, ETAPAS } from "../game/tutor.js";
import { falaDoTutor, promptDoTutor, alvoDoTutor } from "./tutorFala.js";
import { Glifo, Mascote, Passo, Pular, Promessa, Contagem, useEntraSozinho } from "./tutorPecas.jsx";

const TIT_ETAPA = { [ETAPA.NOVA]: "novaTit", [ETAPA.TIRO]: "tiroTit", [ETAPA.SPLIT]: "splitTit" };

/**
 * As três medalhas. Cheia ★ contra vazada ☆ é diferença de FORMA — não depende de distinguir verde de
 * âmbar (ΔE 6,7 em protanopia). `nova` marca a que acabou de ser ganha, para só ela animar.
 */
function Medalhas({ feitas, atual, nova, T }) {
  const pos = Math.min(Math.max(atual || feitas, 1), ETAPAS);
  return <div className="ts-medalhas" role="progressbar" aria-valuenow={pos} aria-valuemin={1} aria-valuemax={ETAPAS}>
    {Array.from({ length: ETAPAS }, (_, i) => {
      const n = i + 1, st = n <= feitas ? "ok" : n === atual ? "now" : "off";
      return <b key={n} className={"ts-medalha " + st + (n === nova ? " nova" : "")}>{st === "ok" ? "★" : "☆"}</b>;
    })}
    <Passo etapa={pos} T={T} />
  </div>;
}

export default function TutorSargento({ d, T, tecla }) {
  useEntraSozinho(!!d.fim && !d.demo);
  const face = d.fim ? "fim" : d.celebra ? "ok" : "aula";
  const n = Math.min(Math.max(d.etapa, 1), ETAPAS);
  const [tit, txt] = face === "aula" ? falaDoTutor(d, T, tecla)
    : face === "ok" ? [preenche(T.sgtFeito, { n }), T["feito" + n] || ""]
    : [T.sgtFim, T.fimSub];
  const p = face === "aula" ? promptDoTutor(d, T, tecla) : null;
  const rotulo = p && p.tipo !== "tecla" && p.tipo !== "hud" ? p.rotulo : "";
  // o retrato de "quem": a Terra nas duas etapas que têm um OUTRO; na 1 o assunto são os pedaços
  const quem = face === "aula" && !d.pre && d.etapa !== ETAPA.NOVA ? (d.etapa === ETAPA.TIRO ? "mira" : "presa") : "";
  return <div id={face === "fim" ? "tutor-fim" : face === "ok" ? "tutor-ok" : "tutor"}
    data-style="sargento" data-face={face} data-etapa={d.etapa}
    data-alvo={(face === "aula" && alvoDoTutor(d)) || undefined}>
    <div className="ts-palco">
      <div className="ts-cabeca">
        <Mascote quem="lua" className="ts-mascote" />
        <Medalhas T={T} feitas={face === "fim" ? ETAPAS : face === "ok" ? n : n - 1}
          atual={face === "aula" ? n : 0} nova={face === "ok" ? n : 0} />
      </div>
      <div className="ts-balao" key={face + n} role="status" aria-live={face === "aula" ? "polite" : "assertive"}>
        <div className="ts-txts">
          <b className="ts-tit">{tit}</b>
          <span className="ts-txt" key={txt}>{txt}</span>
          {face === "ok" && d.auto && n === ETAPA.TIRO ? <span className="ts-auto">{T.tiroAuto}</span> : null}
          {face === "ok" && n < ETAPAS
            ? <b className="ts-prox">{preenche(T.prox, { s: T[TIT_ETAPA[n + 1]] || "" })}</b> : null}
          {face === "fim" ? <><Promessa T={T} /><Contagem T={T} demo={!!d.demo} /></> : null}
        </div>
        {quem ? <span className={"ts-quem " + quem}><Mascote quem="terra" className="ts-quem-arte" /></span> : null}
        {p ? <span className="ts-glifo"><Glifo p={p} />{rotulo ? <b>{rotulo}</b> : null}</span> : null}
      </div>
    </div>
    {face === "aula" ? <Pular T={T} /> : null}
  </div>;
}

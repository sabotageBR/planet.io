// FIM DE RODADA: abertura, campeão em tamanho de campeão, placar da sala e a contagem para a próxima.
//
// ── TRÊS MODELOS, OS MESMOS DADOS ────────────────────────────────────────────────────────────────
// `prefs.roundStyle` escolhe entre `podio`, `cinema` e `dossie`. Eles não são três telas: são três
// ARRANJOS das mesmas peças (campeão · pódio · destaques · números · placar), e nenhum esconde
// informação que outro mostre — o cartão do resto do placar é idêntico nos três, só muda onde ele
// começa (o que a tela de cima já desenhou não se repete embaixo).
//   podio  — o pódio de sempre, com o 1º lugar em tamanho de campeão em vez de um ícone.
//   cinema — a tela é do vencedor: planeta enorme, glória atrás, nome grande; 2º e 3º viram fichas.
//   dossie — o relatório da partida: campeão e a ficha dele à esquerda, os maiores e os destaques à
//            direita, em barras comparáveis.
// ⚠️ `?round=1|2|3` na URL passa por cima da pref. É para COMPARAR os três lado a lado sem gastar um
// PATCH de prefs a cada troca — em produção ninguém chega nesse parâmetro por acaso, e ele não grava
// nada.
//
// ── O PLANETA DO CAMPEÃO ─────────────────────────────────────────────────────────────────────────
// Ele era desenhado com 34 px na faixa e 86 px no degrau do pódio, o mesmo tamanho de um chip do HUD.
// Agora o tamanho vem de `--champ-d` (styles/ui.css), que muda por modelo e por forma de tela. Duas
// notas sobre o canvas, porque a conta não é óbvia: `paintSkin` escala por `cv.width/112`, então o
// `r` é sempre na medida de 112 e quem cresce é o `size` (a resolução) — subir o `r` junto estoura o
// anel das skins com aro para fora do canvas, que CORTA. E o disco ocupa ~57 % do canvas: o resto é a
// folga do aro, que o CSS recupera deixando o canvas transbordar o bloco.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { skinById } from "@warspace/shared";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { play, leaveGame } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import SkinPreview from "./SkinPreview.jsx";
import RoundIntro from "./RoundIntro.jsx";
import { fmt, ord } from "./format.js";
import { sfx } from "../audio/index.js";

const ESTILOS = ["podio", "cinema", "dossie"];
// Quantas linhas a tela de cima já mostrou — a tabela do resto começa depois delas.
const CORTE = { podio: 3, cinema: 3, dossie: 5 };
const ORDER = [1, 0, 2];   // 2º | 1º | 3º
const Q = typeof location !== "undefined" ? new URLSearchParams(location.search).get("round") : null;
const estiloDe = p => (Q && (ESTILOS[+Q - 1] || (ESTILOS.includes(Q) ? Q : null)))
// ⚠️ O padrão está em DOIS lugares e eles têm que concordar: `PREF_DEFAULTS` (state/app.js), que é o
// que o jogador recebe, e este fallback, que vale quando a pref chega com lixo ou ainda não chegou.
  || (ESTILOS.includes(p && p.roundStyle) ? p.roundStyle : "dossie");

// ── peças ─────────────────────────────────────────────────────────────────────
const Planeta = ({ b, size = 112, r = 30, cls = "" }) => <SkinPreview skin={skinById(b ? b.skinId : 0)} r={r} size={size} className={cls} />;
const soma = (t, k) => t.reduce((a, b) => a + (+b[k] || 0), 0);
/**
 * O bloco do campeão: disco grande, glória atrás, coroa, nome e massa. `--champ-d` dá o tamanho.
 * ⚠️ VITÓRIA DE ESQUADRÃO MOSTRA O ESQUADRÃO INTEIRO (`time`): quem venceu um Battle Royale em dupla
 * via a tela anunciar UM vencedor e o companheiro sumir justamente do lugar onde ele mais devia estar.
 * Os planetas entram lado a lado (o CSS reduz `--champ-d` por `data-n`, senão dois de 340 px não cabem
 * na coluna do dossiê), e a ficha passa a SOMAR a equipe — menos o K/D, que é razão e não soma: ali
 * vale o total de abates sobre o total de mortes.
 */
function Champ({ b, mine, LB, ficha, kicker, time = null }) {
  const t = time && time.length > 1 ? time : null;
  if (!b && !t) return null;
  const meu = t ? t.some(x => x.slot === mine) : b.slot === mine;
  const massa = t ? soma(t, "mass") : b.mass;
  const nums = t
    ? [["score", soma(t, "score")], ["kills", soma(t, "kills")], ["food", soma(t, "food")],
       ["kd", (soma(t, "kills") / Math.max(1, soma(t, "deaths"))).toFixed(2)]]
    : [["score", b.score || 0], ["kills", b.kills || 0], ["food", b.food || 0], ["kd", (b.kd || 0).toFixed(2)]];
  return <div className={"champ" + (t ? " time" : "") + (meu ? " me" : "")} data-n={t ? t.length : 1}>
    {t ? <div className="ct-linha"><i className="cp-coroa">{LB.champCrown}</i>{t.map(x =>
      <div key={x.key || x.slot} className={"ct-m" + (x.slot === mine ? " me" : "")}>
        <div className="cp"><i className="cp-gloria" /><i className="cp-halo" /><Planeta b={x} size={360} cls="" /></div>
        <b className="ct-nome">{x.level > 0 ? <i className="lvl">{x.level}</i> : null}{x.name}</b>
        <em className="ct-massa">{fmt(x.mass)}</em>
      </div>)}</div>
      : <div className="cp"><i className="cp-gloria" /><i className="cp-halo" /><Planeta b={b} size={360} cls="" /><i className="cp-coroa">{LB.champCrown}</i></div>}
    <span className="cp-k">{kicker || LB.champion}</span>
    {t ? null : <b className="cp-nome">{b.level > 0 ? <i className="lvl">{b.level}</i> : null}{b.name}</b>}
    <em className="cp-massa">{fmt(massa)}<small>{LB.massLabel}</small></em>
    {ficha ? <div className="cp-ficha">{nums.map(([k, v]) =>
      <div key={k}><b>{typeof v === "string" ? v : fmt(v)}</b><i>{LB.metrics[k]}</i></div>)}</div> : null}
  </div>;
}
/**
 * Degraus 2º·1º·3º. O do meio recebe o planeta grande — o campeão já é o assunto da tela.
 * ⚠️ `simples` quando a vitória é de EQUIPE: aí o bloco do esquadrão já está logo acima, com coroa e
 * glória, e repetir tudo no degrau punha as mesmas duas pessoas duas vezes na mesma tela, com duas
 * coroas. Os degraus continuam (são "os maiores PLANETAS", que segue verdade nos dois modos), só param
 * de disputar o destaque.
 */
const Podio = ({ board, mine, LB, simples = false }) => <div className={"podium v2" + (simples ? " simples" : "")}>{ORDER.map(i => { const b = board[i], herói = i === 0 && !simples;
  return <div key={i} className={"step p" + (i + 1) + (b ? "" : " empty") + (b && b.slot === mine ? " me" : "")}>
    <div className={herói ? "cp" : "st-disco"}>{herói ? <><i className="cp-gloria" /><i className="cp-halo" /></> : null}<Planeta b={b} size={herói ? 360 : 160} cls="" />{herói ? <i className="cp-coroa">{LB.champCrown}</i> : null}</div>
    <b>{b ? b.name : "—"}</b>
    <i>{b ? fmt(b.mass) : "—"}</i>
    {/* ⚠️ A POSIÇÃO É A DO PLACAR (`pos`), não o índice do degrau: numa vitória de equipe estes três
        são os melhores DEPOIS dela, e renumerá-los a partir de 1 poria um "1º" embaixo de quem não
        ganhou a partida. Sem equipe, `pos` é o próprio índice+1 e nada muda. */}
    <div className="base">{ord(b ? b.pos || i + 1 : i + 1)}</div>
  </div>; })}</div>;
/** 2º e 3º como fichas lado a lado. ⚠️ `de` é 1 no normal (o 1º está no bloco do campeão) e 0 quando
    quem está em cima é a EQUIPE — aí a lista já vem sem ela e o primeiro item é o melhor de fora. */
const Vices = ({ board, mine, de = 1 }) => <div className="vices">{[de, de + 1].map(i => { const b = board[i];
  return <div key={i} className={"vice" + (b && b.slot === mine ? " me" : "") + (b ? "" : " empty")}>
    <span className="vc-pos">{ord(b ? b.pos || i + 1 : i + 1)}</span>
    <div className="vc-disco"><Planeta b={b} size={160} cls="" /></div>
    <b>{b ? b.name : "—"}</b>
    <em>{b ? fmt(b.mass) : "—"}</em>
  </div>; })}</div>;
/** Os quatro destaques da sala. `linhas` os deita (dossiê); `faixa` os comprime numa fileira (cinema). */
const AWARDS = [["score", "⭐", "pontuador", b => fmt(b.score || 0)], ["food", "🍬", "glutao", b => fmt(b.food)],
  ["kills", "⚔️", "carrasco", b => fmt(b.kills)], ["kd", "🎯", "letal", b => (b.kd || 0).toFixed(2)]];
const Awards = ({ d, mine, LB, mod = "" }) => <div className={"awards " + mod}>{AWARDS.map(([k, ico, campo, val]) => { const b = d[campo];
  return <div key={k} className={"award" + (b && b.slot === mine ? " me" : "") + (b ? "" : " empty")}>
    <i className="aw-ico">{ico}</i>
    <span className="aw-k">{LB.awards[k]}</span>
    {b ? <Planeta b={b} size={112} cls="aw-skin" /> : null}
    <b className="aw-name">{b ? b.name : "—"}</b>
    <em className="aw-val">{b ? val(b) : ""}</em>
  </div>; })}</div>;
/** Top N em barras proporcionais à massa do 1º (dossiê): é o que faz "ganhou por quanto" ser legível. */
const Barras = ({ board, mine, LB, n = 5 }) => { const topo = board[0] ? board[0].mass || 1 : 1;
  return <div className="barras"><div className="ph">{LB.boardTop}</div>
    {board.slice(0, n).map((b, i) => <div key={b.key || b.slot} className={"bar" + (b.slot === mine ? " me" : "")}>
      <span className="br-pos">{ord(i + 1)}</span>
      <Planeta b={b} size={112} cls="br-skin" />
      <b className="br-nome">{b.name}</b>
      <span className="br-trilho"><i style={{ width: Math.max(3, Math.round((b.mass / topo) * 100)) + "%" }} /></span>
      <em className="br-val">{fmt(b.mass)}</em>
    </div>)}</div>; };

export default function Round({ on }) {
  const LB = useLabels();
  const r = useStore(app, s => s.roundResult), rew = useStore(app, s => s.rewards), pending = useStore(app, s => s.rewardsPending);
  const prefs = useStore(app, s => s.session.prefs);
  const estilo = estiloDe(prefs);
  // A abertura é pulável, desligável (`roundIntro`) e obedece a "reduzir movimento". `prontoAt` é o
  // instante em que o placar de fato apareceu: é dele que a contagem para a próxima sala parte, senão
  // a animação comeria 2 dos 15 segundos que o jogador tem para decidir.
  const quer = prefs.roundIntro !== false && !prefs.reduceMotion;
  const [intro, setIntro] = useState(false), [prontoAt, setProntoAt] = useState(0);
  const [left, setLeft] = useState(0), fired = useRef(false);
  const chave = r ? (r.code || "") + ":" + (r.at || 0) : "";
  useEffect(() => { if (!on || !r) { setIntro(false); return; }
    setIntro(quer); if (!quer) { setProntoAt(Date.now()); sfx("podium"); } else setProntoAt(0);
  }, [on, chave]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!on || !r || intro) return;
    fired.current = false;
    const end = (prontoAt || r.at || Date.now()) + (r.nextInMs || 15000);
    const tick = () => { const s = Math.max(0, Math.ceil((end - Date.now()) / 1000)); setLeft(s);
      if (s <= 0 && !fired.current) { fired.current = true; play({}); } };
    tick(); const t = setInterval(tick, 250); return () => clearInterval(t);
  }, [on, r, intro, prontoAt]);
  const board = useMemo(() => (r && r.board) || [], [r]);
  if (!on || !r) return <div className={"screen" + (on ? " on" : "")} id="s-round" />;
  const mine = r.mySlot, corte = CORTE[estilo];
  const br = r.reason === "lastAlive";
  // O CAMPEÃO é quem tinha a maior massa no instante do BIG CRUNCH (o servidor ordena os VIVOS e manda
  // `board[0]`); no Battle Royale é quem sobrou. Ele aparece grande nos TRÊS modelos — inclusive no BR,
  // onde ele é ainda mais o assunto. Por isso o subtítulo de lá parou de repetir o nome: quem tem nome
  // de campeão na tela é o bloco do campeão. O que o subtítulo ainda diz, e o bloco não pode dizer, é a
  // EQUIPE — uma vitória de esquadrão não cabe num planeta só.
  const champ = r.champion || board[0] || null;
  // A EQUIPE CAMPEÃ inteira, do maior para o menor. Sai do próprio `board` (que agora carrega `team`),
  // então não custou um campo novo no `roundEnd` — e o companheiro que morreu antes do fim continua na
  // lista, com massa 0: ele ganhou a partida junto.
  const equipe = r.champTeam != null ? board.filter(b => b.team === r.champTeam).sort((a, b) => b.mass - a.mass) : null;
  const time = equipe && equipe.length > 1 ? equipe : null;
  // ── QUEM JÁ APARECEU EM CIMA NÃO APARECE DE NOVO ──────────────────────────────────────────────
  // Numa vitória de esquadrão o bloco da equipe já mostrou os membros, e o pódio (ou as fichas de
  // vice) os repetia logo abaixo — as mesmas duas pessoas duas vezes, coladas. Aqui o topo passa a ser
  // "os maiores DEPOIS da equipe campeã", com a posição REAL de cada um, e a tabela do resto começa
  // depois de tudo o que já foi desenhado.
  // ⚠️ O dossiê fica de fora: lá o bloco de cima é "OS MAIORES DA SALA", um ranking geral em barras —
  // ali o campeão no topo é a informação, não repetição.
  // ⚠️ Sem equipe (`time` null) as três linhas abaixo colapsam no `board.slice(corte)` de sempre.
  const idDe = b => b.key || "s" + b.slot;
  const posto = board.map((b, i) => ({ ...b, pos: b.placement || i + 1 }));
  const filtra = time && estilo !== "dossie";
  const fora = filtra ? posto.filter(b => b.team !== r.champTeam) : posto;
  const topo = fora.slice(0, corte);
  const jaVi = new Set(filtra ? [...time.map(idDe), ...topo.map(idDe)] : topo.map(idDe));
  const rest = posto.filter(b => !jaVi.has(idDe(b)));
  const titulo = br ? LB.lastAliveTitle : LB.roundTitle;
  const sub = br ? LB.lastAliveSub : LB.roundSub;
  // Numa vitória de ESQUADRÃO o planeta grande é o último de pé DAQUELA equipe, e chamá-lo de "campeão
  // da sala" contradiz a linha de cima. O rótulo acima do nome vira a equipe — que é a única coisa que
  // um planeta só não consegue dizer.
  const kicker = br && r.champTeam != null ? `${LB.champTeam} ${r.champTeam + 1}` : LB.champion;
  // ⚠️ `key`: os timers da abertura vivem num `useEffect([])`, que NÃO roda de novo quando o React reusa
  // o componente. Sem a chave, um segundo `roundEnd` chegando durante a abertura do primeiro herdaria os
  // timers velhos — a animação recomeçaria e seria cortada no meio pelo `onDone` da anterior.
  if (intro) return <div className="screen on" id="s-round" data-style={estilo}>
    <RoundIntro key={chave} champ={champ} title={titulo} onDone={() => { setIntro(false); setProntoAt(Date.now()); }} />
  </div>;
  const d = r.destaques || null;
  const cabeca = <>
    <div className="dead-icon">{LB.roundIcon}</div>
    <div className="dead-title">{titulo}</div>
    <div className="dead-sub">{sub}</div>
  </>;
  const numeros = <div className="dead-stats">
    <div><b>{r.total || board.length}</b><i>{LB.playersWord}</i></div>
    <div><b>{left}s</b><i>{LB.nextRoom}</i></div>
    <div><b className={pending ? "pending" : ""}>{rew ? "+" + (rew.coinsEarned || 0) : pending ? LB.saving : "—"}</b><i>{LB.coinsEarned}</i></div>
  </div>;
  const acoes = <div className="dead-actions">
    <button className="btn-primary" data-go="play" onClick={() => { fired.current = true; play({}); }}>{LB.enterNow}</button>
    <button className="btn-secondary" data-go="lobby" onClick={() => { fired.current = true; leaveGame("lobby"); }}>{LB.toLobby}</button>
  </div>;
  return <div className="screen on" id="s-round" data-style={estilo}><div className="card dead-card">
    {cabeca}
    {estilo === "podio" ? <>
      {/* No pódio a equipe entra ACIMA dos degraus: eles continuam sendo "os maiores PLANETAS", que é
          verdade nos dois modos — o que faltava era dizer quem ganhou a partida. */}
      {time ? <Champ b={champ} mine={mine} LB={LB} kicker={kicker} time={time} /> : null}
      {/* ⚠️ O rótulo só existe quando a equipe está em cima: aí os degraus mostram 3º·4º·5º (a posição
          REAL), e um pódio com "3º" no degrau maior sem uma linha explicando é enigma, não informação. */}
      {time ? <div className="ph pos-rest">{LB.bestOfRest}</div> : null}
      <Podio board={topo} mine={mine} LB={LB} simples={!!time} />
      {d ? <Awards d={d} mine={mine} LB={LB} /> : null}
    </> : estilo === "cinema" ? <>
      <Champ b={champ} mine={mine} LB={LB} kicker={kicker} time={time} ficha />
      {time ? <div className="ph pos-rest">{LB.bestOfRest}</div> : null}
      <Vices board={topo} mine={mine} de={time ? 0 : 1} />
      {d ? <Awards d={d} mine={mine} LB={LB} mod="faixa" /> : null}
    </> : <>
      <div className="dossie">
        <Champ b={champ} mine={mine} LB={LB} kicker={kicker} time={time} ficha />
        <div className="ds-col">
          <Barras board={posto} mine={mine} LB={LB} />
          {d ? <Awards d={d} mine={mine} LB={LB} mod="linhas" /> : null}
        </div>
      </div>
    </>}
    {numeros}
    {acoes}
  </div>
  {/* O resto do placar é o SEGUNDO cartão — o mesmo par de painéis da tela inicial, e pelo mesmo motivo:
      empilhar uma tabela de seis colunas dentro do cartão do pódio fazia a caixa rolar por dentro. Ele
      já nascia condicional, então numa rodada de três jogadores some sozinho. */}
  {rest.length ? <div className="card round-side"><div className="ph">{LB.restOfBoard}</div><table>
      <thead><tr><th>{LB.posWord}</th><th>{LB.youLabel}</th><th className="num">{LB.massLabel}</th>
        <th className="num c-food">{LB.stats.foodEaten}</th><th className="num c-kills">{LB.stats.kills}</th><th className="num c-kd">{LB.stats.kd}</th></tr></thead>
      <tbody>{rest.map((b, i) => <tr key={b.key || b.slot} className={(b.slot === mine ? "mine" : "") + (b.left ? " left" : "")}>
        <td>{b.placement || i + corte + 1}</td>
        <td>{b.level > 0 ? <i className="lvl">{b.level}</i> : null}{b.name}{b.isBot ? <> <i className="bot">{LB.botTag}</i></> : null}{b.registered ? <> <i className="reg">{LB.regTag}</i></> : null}
          {/* quem saiu no meio continua no placar: jogou a rodada, e o nome fica */}
          {b.left ? <> <i className="left-tag">{LB.leftTag}</i></> : null}</td>
        <td className="num">{fmt(b.mass)}</td>
        <td className="num c-food">{fmt(b.food || 0)}</td>
        <td className="num c-kills">{fmt(b.kills || 0)}</td>
        <td className="num c-kd">{(b.kd || 0).toFixed(2)}</td>
      </tr>)}</tbody>
    </table></div> : null}
  </div>;
}

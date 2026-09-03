// KABOOM: a tela de morte — quem te matou, o que a vida rendeu e a sala que continua sem você.
//
// ── TRÊS MODELOS, OS MESMOS DADOS ────────────────────────────────────────────────────────────────
// `prefs.deadStyle` escolhe entre `duelo`, `balanco` e `sala`, no mesmo molde de `roundStyle`
// (ui/Round.jsx). Não são três telas: são três respostas à pergunta que o jogador faz ao morrer, e
// ela não é a mesma para todo mundo —
//   duelo   — "quem me pegou, e quão maior ele era?": os dois planetas frente a frente.
//   balanco — "essa vida foi boa?": os números contra o SEU recorde, que é a única régua honesta.
//   sala    — "e agora, o que está acontecendo lá?": os maiores vivos e quantos restam, para quem
//             vai ficar assistindo até o fim (no Battle Royale isso é metade da partida).
// Os três mantêm o mesmo rodapé: DE NOVO · lobby, e abaixo mapa · tempo real. `?dead=1|2|3` na URL passa por
// cima da pref, para comparar os três sem gastar um PATCH por troca.
//
// ── O QUE A TELA NÃO MOSTRAVA ────────────────────────────────────────────────────────────────────
// Quem te matou era um NOME numa pílula preta — a informação mais importante da tela era a mais
// pobre, sem planeta, sem tamanho, sem nível, enquanto o pódio do fim de rodada já desenhava o
// campeão inteiro. Hoje o `bySlot` viaja no JSON `dead` (ele já existia no `info` do servidor e
// parava no `Room.js`) e o planeta do algoz é desenhado com a skin de verdade. E o `score` da
// partida chegava em `lastMatch` desde sempre sem NENHUM componente lê-lo — o mesmo defeito que o
// `score` do `roundEnd` tinha.
import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import { skinById, MODE } from "@warspace/shared";
import { useStore, throttleStore } from "../state/store.js";
import { app } from "../state/app.js";
import { gameRef } from "../state/game.js";
import { play, leaveGame, respawnAqui } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import SkinPreview from "./SkinPreview.jsx";
import { fmt, fmtTime, ord } from "./format.js";
import { preenche } from "../i18n/index.js";
import { sfx } from "../audio/index.js";

const EMPTY_SPEC = { get: () => ({ spec: null }), subscribe: () => () => {} };
const ESTILOS = ["duelo", "balanco", "sala"];
const Q = typeof location !== "undefined" ? new URLSearchParams(location.search).get("dead") : null;
const estiloDe = p => (Q && (ESTILOS[+Q - 1] || (ESTILOS.includes(Q) ? Q : null)))
  || (ESTILOS.includes(p && p.deadStyle) ? p.deadStyle : "duelo");
// `r` é sempre medido na escala de 112 (paintSkin escala por cv.width/112) e quem cresce é o `size`:
// subir o `r` estoura o aro das skins com anel para fora do canvas, que corta. Ver Round.jsx.
const Planeta = ({ skinId, size = 240 }) => <SkinPreview skin={skinById(skinId | 0)} r={30} size={size} className="" />;

export default function Dead({ on }) {
  const LB = useLabels();
  const m = useStore(app, s => s.lastMatch), r = useStore(app, s => s.rewards), pending = useStore(app, s => s.rewardsPending), before = useStore(app, s => s.session.dayRank);
  const prefs = useStore(app, s => s.session.prefs);
  const estilo = estiloDe(prefs);
  const after = r && r.rank ? r.rank.day : null;
  // de quem é a cena que continua rodando atrás da tela: o servidor escolhe, mas o morto pode trocar
  const game = useStore(gameRef, s => s.game);
  const store = useMemo(() => (game && game.hudStore ? throttleStore(game.hudStore, 200) : EMPTY_SPEC), [game]);
  const h = useSyncExternalStore(store.subscribe, store.get, store.get) || {};
  const spec = h.spec, mapa = h.map || "";   // "" fechado · "map" o radar ampliado · "live" a sala em tempo real
  const trocar = dir => { if (game && game.spectate) game.spectate({ dir }); };
  const verMapa = modo => { if (game && game.toggleMap) game.toggleMap(modo); };
  useEffect(() => {   // as setas do teclado também trocam (o motor ignora tudo com foco num campo de texto)
    if (!on || !game || !game.spectate) return;
    const kd = e => { const a = document.activeElement; if (a && /INPUT|TEXTAREA/.test(a.tagName)) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); trocar(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); trocar(1); }
      else if (e.key === "m" || e.key === "M") { e.preventDefault(); verMapa("map"); }
      // ⚠️ A vista ao vivo é o L, e não mais o T: o T virou a tecla de abrir o CHAT (ui/Chat.jsx), e quem
      // morreu continua falando — as duas não podiam disputar a mesma letra.
      else if (e.key === "l" || e.key === "L") { e.preventDefault(); verMapa("live"); }
      // Esc fecha o mapa em vez de sair da tela: aqui ele é o "voltar" mais próximo
      else if (e.key === "Escape" && game.showMap) { e.preventDefault(); game.showMap(""); } };
    addEventListener("keydown", kd); return () => removeEventListener("keydown", kd);
  }, [on, game]);
  useEffect(() => { if (!on && game && game.showMap) game.showMap(""); }, [on, game]);   // saiu da tela, fecha o mapa
  useEffect(() => { if (on) sfx("deadScreen"); }, [on]);   // a tela de KABOOM tem som próprio (o `death` é o do mundo, lá atrás)
  if (!on || !m) return <div className={"screen" + (on ? " on" : "")} id="s-dead" />;

  const linhas = h.lb || [];
  // O ALGOZ AO VIVO: o placar traz todos os vivos a 2 Hz, fora da AOI, então a massa dele continua
  // subindo na tela enquanto ele joga. Quando ele não está lá (saiu, morreu, ou quem matou foi o
  // cenário) sobra o nome, que é o que a tela sempre teve.
  const algoz = m.bySlot >= 0 ? linhas.find(l => l.slot === m.bySlot) : null;
  const perigo = m.byZone ? "zone" : m.byHole ? "hole" : null;
  const vezes = algoz && m.maxMass > 0 ? algoz.mass / m.maxMass : 0;
  const recMass = +m.recMass || 0, recScore = +m.recScore || 0;
  const novoMass = m.maxMass > 0 && m.maxMass > recMass, novoScore = (m.score || 0) > 0 && m.score > recScore;

  // ── peças ────────────────────────────────────────────────────────────────
  const cabeca = <>
    <div className="dead-icon">{LB.deadIcon}</div>
    <div className="dead-title">{LB.dead}</div>
    <div className="dead-sub">{LB.deadSub}</div>
  </>;
  /** Quem te matou, com planeta. Sem algoz (gás, buraco) o disco vira o ÍCONE do perigo: inventar um
      planeta para o cenário seria mentir sobre quem estava do outro lado. */
  const algozBloco = tam => <div className={"dd-alvo" + (perigo ? " perigo" : "")}>
    <div className="dd-disco">{perigo
      ? <i className="dd-ico">{perigo === "zone" ? "☁️" : "🕳️"}</i>
      : <Planeta skinId={m.bySkin} size={tam} />}</div>
    <span className="dd-k">{perigo === "zone" ? LB.deadByZone : m.byHole ? LB.suckedBy : LB.eatenBy}</span>
    {perigo ? null : <b className="dd-nome">{m.byLevel > 0 ? <i className="lvl">{m.byLevel}</i> : null}{m.by || "—"}</b>}
    {algoz ? <em className="dd-massa">{fmt(algoz.mass)}</em> : null}
  </div>;
  const eu = tam => <div className="dd-alvo eu">
    <div className="dd-disco"><Planeta skinId={m.mySkin} size={tam} /></div>
    <span className="dd-k">{LB.you}</span>
    <b className="dd-nome">{m.myLevel > 0 ? <i className="lvl">{m.myLevel}</i> : null}{m.myName || "—"}</b>
    <em className="dd-massa">{fmt(m.maxMass)}</em>
  </div>;
  const moedas = <b id="d-coins" className={pending ? "pending" : ""}>{r ? "+" + (r.coinsEarned || 0) : pending ? LB.saving : "—"}</b>;
  const numeros = <div className="dead-stats">
    <div><b id="d-mass">{fmt(m.maxMass)}</b><i>{LB.massLabel}</i></div>
    <div><b id="d-kills">{m.kills || 0}</b><i>{LB.killsWord}</i></div>
    <div><b id="d-time">{fmtTime(m.durationS)}</b><i>{LB.timeWord}</i></div>
    <div>{moedas}<i>{LB.coinsEarned}</i></div>
  </div>;
  const rank = <div className="dead-rank"><span>{LB.rankWord}</span><b id="d-rank">
    {pending && !r ? LB.saving : after != null ? (before != null && before !== after ? <>{ord(before)} <span className="arrow">→</span> {ord(after)}</> : ord(after)) : before != null ? ord(before) : (r && r.saved === false ? LB.noRank : "—")}</b></div>;
  const colocacao = m.placement ? <div className="dead-place"><b>{ord(m.placement)}</b><i>{LB.placementWord} {m.players ? preenche(LB.fmt.of, { n: m.players }) : ""}</i></div> : null;
  const espectador = spec && spec.slot >= 0 ? <div className="dead-spec">
    <button className="spec-arrow" onClick={() => trocar(-1)} aria-label={LB.specPrev}>‹</button>
    <div className="spec-who"><i>{LB.watching}</i><b>{spec.name || "—"}</b></div>
    <button className="spec-arrow" onClick={() => trocar(1)} aria-label={LB.specNext}>›</button>
  </div> : null;
  /* DUAS vistas da mesma fonte: o placar traz TODOS os vivos com posição (2 Hz), fora da AOI.
     MAPA é o radar ampliado — um instrumento, para escolher quem assistir (clicar num blip troca a
     câmera, o mesmo `spectate` das setas). TEMPO REAL é a SALA: ocupa o espaço todo, o blip vira o
     planeta na cor da skin, com nome e massa, e a posição é interpolada entre as amostras. */
  /* ⚠️ OS DOIS BOTÕES SÃO CAMINHOS DIFERENTES, e a diferença é o que separa "renasci" de "entrei de novo".
     No LIVRE o jogador morto NUNCA saiu da sala: o socket está aberto, o slot é dele e o chat funciona.
     Renascer é `respawnAqui()` → `{t:"respawn"}` na mesma conexão. Antes era `play({room})`, que chama
     `game.join()` → `game.leave(true)` → `{t:"quit"}` e FECHA o socket: daí saíam um "Fulano saiu" e um
     "Fulano entrou" no feed para quem só tinha clicado aqui, e — pior — uma janela de até 3 s em que o
     nick dele voltava para o bolo e um preenchimento podia tomá-lo, devolvendo-lhe `NICK_IN_ROOM` na
     própria sala em que ele estava. Recusado, `respawnAqui` cai sozinho no `play` de antes.
     No BATTLE ROYALE não há renascer — é o que "sem respawn" quer dizer —, e apontar para a MESMA sala
     roubava do jogador a tela final inteira: o `quit` tirava a sessão da sala, o join seguinte esbarrava
     em `acceptsJoin()` (que ali nunca aceita) e, quando o `endRound` difundia o pódio, aquela sessão já
     não estava em `room.sessions`. Por isso lá o botão é "outra partida" (sala nova) e a dica diz que
     ficar rende o pódio. */
  const semRespawn = h.mode === MODE.BR;
  const rodape = <>
    <div className="dead-actions">
      <button className="btn-primary" data-go="play"
        onClick={() => (semRespawn ? play({}) : respawnAqui(m.room))}>{semRespawn ? LB.newMatch : LB.respawn}</button>
      <button className="btn-secondary" data-go="lobby" onClick={() => leaveGame("lobby")}>{LB.toLobby}</button>
    </div>
    <div className="dead-views">
      <button className={"btn-secondary dead-map" + (mapa === "map" ? " on" : "")} onClick={() => verMapa("map")}>{mapa === "map" ? LB.mapClose : LB.mapOpen}</button>
      <button className={"btn-secondary dead-live" + (mapa === "live" ? " on" : "")} onClick={() => verMapa("live")}>{mapa === "live" ? LB.liveClose : LB.liveOpen}</button>
    </div>
    {semRespawn ? <div className="hint dead-hint">{LB.brWatchHint}</div> : null}
  </>;
  /** Uma linha do balanço: número grande, e a barra só quando existe um recorde para comparar. */
  const linha = (k, valor, atual, rec, novo) => <div className={"dd-linha" + (novo ? " novo" : "")} key={k}>
    <span className="dl-k">{k}</span><b className="dl-v">{valor}</b>
    {rec > 0 ? <>
      <span className="dl-trilho"><i style={{ width: Math.max(2, Math.min(100, Math.round((atual / Math.max(rec, atual)) * 100))) + "%" }} /></span>
      <em className="dl-rec">{novo ? LB.newRecord : LB.recordWord + " " + fmt(rec)}</em>
    </> : null}
  </div>;

  return <div className="screen on" id="s-dead" data-style={estilo}><div className="card dead-card">
    {cabeca}
    {estilo === "duelo" ? <>
      {/* O confronto: eu à esquerda, quem me pegou à direita, e no meio o quanto ele era maior. É a
          leitura que o jogador faz sozinho quando morre — a tela só passou a respondê-la. */}
      <div className="dd-duelo">
        {eu(200)}
        <div className="dd-vs">{perigo ? "☠" : "⚔"}{vezes >= 1.15 ? <em>{preenche(LB.timesBigger, { n: vezes.toFixed(1) })}</em> : null}</div>
        {algozBloco(240)}
      </div>
      {colocacao}
      {numeros}
      {rank}
      {espectador}
    </> : estilo === "balanco" ? <>
      {/* A régua honesta é o recorde DE QUEM MORREU, não o do servidor: 927 de massa não diz nada
          sozinho, e "927 contra os seus 4.820" diz tudo. `recMass`/`recScore` são fotografados em
          `onDead` ANTES de a conta ser atualizada (ver state/actions.js). */}
      <div className="dd-quem">
        <div className="dd-mini">{perigo ? <i className="dd-ico">{perigo === "zone" ? "☁️" : "🕳️"}</i> : <Planeta skinId={m.bySkin} size={112} />}</div>
        <span>{perigo === "zone" ? LB.deadByZone : m.byHole ? LB.suckedBy : LB.eatenBy}</span>
        {perigo ? null : <b>{m.by || "—"}</b>}
        {algoz ? <em>{fmt(algoz.mass)}</em> : null}
      </div>
      <div className="dd-balanco">
        {linha(LB.massLabel, fmt(m.maxMass), m.maxMass || 0, recMass, novoMass)}
        {linha(LB.scoreLabel, fmt(m.score || 0), m.score || 0, recScore, novoScore)}
        {linha(LB.killsWord, String(m.kills || 0), 0, 0, false)}
        {linha(LB.timeWord, fmtTime(m.durationS), 0, 0, false)}
      </div>
      {colocacao}
      <div className="dead-stats duo"><div>{moedas}<i>{LB.coinsEarned}</i></div>
        <div><b>{pending && !r ? LB.saving : after != null ? ord(after) : before != null ? ord(before) : "—"}</b><i>{LB.rankWord}</i></div></div>
      {espectador}
    </> : <>
      {/* A sala continua sem você — e é isso que o morto fica olhando. As linhas vêm do PLACAR (todos
          os vivos, 2 Hz, fora da AOI), então quem lidera e quantos restam são o estado de AGORA, não
          uma foto do instante da morte. Clicar numa linha troca a câmera, como no mapa. */}
      <div className="dd-quem">
        <div className="dd-mini">{perigo ? <i className="dd-ico">{perigo === "zone" ? "☁️" : "🕳️"}</i> : <Planeta skinId={m.bySkin} size={112} />}</div>
        <span>{perigo === "zone" ? LB.deadByZone : m.byHole ? LB.suckedBy : LB.eatenBy}</span>
        {perigo ? null : <b>{m.by || "—"}</b>}
      </div>
      {numeros}
      {linhas.length ? <div className="dd-sala">
        <div className="ph">{LB.leadersNow}{h.alive ? <em>{LB.aliveLeft} {h.alive}</em> : null}</div>
        {linhas.slice(0, 5).map((l, i) => <button key={l.slot} className={"dd-vivo" + (l.slot === m.bySlot ? " algoz" : "") + (spec && spec.slot === l.slot ? " vendo" : "")}
          onClick={() => { if (game && game.spectate) game.spectate({ slot: l.slot }); }}>
          <span className="dv-pos">{ord(i + 1)}</span>
          <b className="dv-nome">{l.level > 0 ? <i className="lvl">{l.level}</i> : null}{l.name}</b>
          <span className="dv-trilho"><i style={{ width: Math.max(3, Math.round((l.mass / Math.max(1, linhas[0].mass)) * 100)) + "%" }} /></span>
          <em className="dv-massa">{fmt(l.mass)}</em>
        </button>)}
      </div> : null}
      {colocacao}
      {rank}
      {espectador}
    </>}
    {rodape}
  </div></div>;
}

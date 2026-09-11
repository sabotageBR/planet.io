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
import React, { useEffect, useRef, useState } from "react";
import { skinById, MODE, ROUND, TICK_HZ } from "@warspace/shared";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { play, sairDaPartida, respawnAqui } from "../state/actions.js";
import { SpecBar, SpecWho, useSpec } from "./SpecBar.jsx";
import { prazoDe } from "./deadClock.js";
import { estiloDe } from "./deadEstilo.js";
import { SEM_MENU } from "../portal/flags.js";
import { useLabels } from "../hooks/useTheme.js";
import SkinPreview from "./SkinPreview.jsx";
import DeadPrize from "./DeadPrize.jsx";
import { fmt, fmtTime, ord } from "./format.js";
import { preenche } from "../i18n/index.js";
import { sfx } from "../audio/index.js";

const Q = typeof location !== "undefined" ? new URLSearchParams(location.search).get("dead") : null;
// `r` é sempre medido na escala de 112 (paintSkin escala por cv.width/112) e quem cresce é o `size`:
// subir o `r` estoura o aro das skins com anel para fora do canvas, que corta. Ver Round.jsx.
const Planeta = ({ skinId, size = 240 }) => <SkinPreview skin={skinById(skinId | 0)} r={30} size={size} className="" />;

export default function Dead({ on }) {
  const LB = useLabels();
  const m = useStore(app, s => s.lastMatch), r = useStore(app, s => s.rewards), pending = useStore(app, s => s.rewardsPending), before = useStore(app, s => s.session.dayRank);
  const prefs = useStore(app, s => s.session.prefs);
  const after = r && r.rank ? r.rank.day : null;
  // De quem é a cena que continua rodando atrás da tela: o servidor escolhe, mas o morto pode trocar. Todo
  // o estado de quem assiste (throttle, setas, teclado com as duas guardas) mora em ui/SpecBar.jsx — é o
  // MESMO de ui/Spectate.jsx, e era o mesmo código escrito duas vezes.
  const { game, h, spec, mapa, trocar, verMapa } = useSpec(on);
  // ⚠️ DEPOIS do `useSpec`, porque agora o estilo depende do MODO — e o modo vem de `h.mode`, o mesmo que
  // decide o `semRespawn` lá embaixo. Lendo de fontes diferentes sairia um cartão mínimo com "OUTRA
  // PARTIDA" dentro. A regra inteira (quem ganha de quem) mora em `ui/deadEstilo.js`, pura e testada.
  const estilo = estiloDe(prefs, { q: Q, portal: SEM_MENU, modo: h.mode, br: MODE.BR });
  useEffect(() => { if (on) sfx("deadScreen"); }, [on]);   // a tela de KABOOM tem som próprio (o `death` é o do mundo, lá atrás)
  // ── RECOLHER: o cartão sai da frente e vira uma barra ────────────────────────────────────────────
  // O pedido veio do Battle Royale no celular, onde o cartão tapava a partida inteira — e o jogo promete o
  // contrário na própria tela (`LB.brWatchHint`: "fique para ver o pódio"). Mas o botão existe em TODOS os
  // modos e formas de tela: um controle que só aparece em algumas é uma segunda lista para manter em dia
  // (o argumento de Hud.jsx:104-107), e no frame de portal de 540 px o desktop precisa dele tanto quanto.
  // ⚠️ O estado é LOCAL e não é pref: pref viaja com a CONTA (a lição de `lbShow`/`lbShowPortrait`) e esta
  // decisão é por MORTE — o cartão é o relatório daquela vida. O reset é por `on`, nunca por `h.deadAt`:
  // o par `{deadAt,armAt}` chega com throttle de 200 ms e no primeiro render ainda é o da morte ANTERIOR
  // (ver o bloco do respawn, mais abaixo).
  const [min, setMin] = useState(false);
  // `deadMin` só é escrito pelo caminho de demo (`mostrarTela("dead:<estilo>@min")`, que já é DEV-only):
  // é o que deixa a matriz de responsividade medir o estado recolhido, que de outro modo só existiria
  // depois de um clique que a sonda não dá. Em produção o campo é `undefined` e a tela nasce aberta.
  useEffect(() => { setMin(on ? !!app.get().deadMin : false); }, [on]);
  // O espelho no `body` é o que deixa o CSS devolver a tela ao jogo (a gaveta encolhe a zero no desktop).
  // Cleanup obrigatório: sem ele o atributo sobrevive à tela e a gaveta some no menu.
  // ⚠️ ELE CARREGA O ESTILO, e não só o `min`: o `kaboom` é um cartão CENTRADO e pequeno, então ele
  // precisa do mesmo tratamento que o recolhido — devolver a largura ao jogo em vez de virar uma gaveta
  // de 480 px com um número dentro (`--rail-w` só é zero em `[data-screen="game"]`). O valor `"min"`
  // continua significando o que sempre significou; quem lê é o CSS.
  useEffect(() => {
    document.body.dataset.dead = on ? (min ? "min" : estilo) : "";
    return () => { document.body.dataset.dead = ""; };
  }, [on, min, estilo]);
  // ── RESPAWN AUTOMÁTICO (Livre), MAS SÓ DEPOIS DE UM SINAL DE VIDA ───────────────────────────────
  // A contagem já foi incondicional: abria no instante da morte e renascia sozinha 5 s depois, sem que
  // ninguém clicasse em nada — o botão era o espelho dela, não a causa. Uma aba esquecida aberta virava um
  // jogador que morre, renasce, morre e renasce para sempre, ocupando vaga, servindo de comida de graça e
  // poluindo o placar e o kill feed de todas as salas por onde passasse.
  // Hoje quem arma é o primeiro GESTO depois da morte (game/input/Activity.js → `morte` no motor →
  // `deadAt`/`armAt` no HUD). Sem gesto, `prazoDe` devolve 0 e a tela simplesmente espera.
  // ⚠️ `performance.now()`, NUNCA `Date.now()`: `armAt` nasce do relógio monotônico do motor. Round.jsx usa
  // `Date.now()` porque o `at` de lá vem de lá — misturar os dois dá um prazo com décadas de erro.
  // ⚠️ `-1` é "esperando gesto" e `0` é "venceu, o respawn está saindo": com um valor só para os dois o
  // botão pisca o rótulo curto no frame do disparo.
  // ⚠️ As deps são `armAt`, que é um LATCH (muda uma vez por morte). Depender de "última atividade" — um
  // número que anda a 8 Hz — reiniciaria a contagem a cada movimento do mouse e ela nunca venceria.
  // O tempo continua vindo de `ROUND.RESPAWN_TICKS` pelo canal `wire`, e o clique continua renascendo na
  // hora, armado ou não. BR nunca conta: lá não existe respawn.
  const [restante, setRestante] = useState(-1);
  const fired = useRef(false);
  // ⚠️ QUANDO A TELA APARECEU — e é isso que vira o PISO de `prazoDe`. O par `{deadAt,armAt}` chega aqui
  // pelo store com THROTTLE (200 ms), enquanto `screen:"dead"` vem do store `app`, sem throttle: no
  // primeiro render o par lido é o de ANTES desta morte. Quando ele era um armamento de outra vida (o que
  // acontecia depois de toda re-entrada por `play()`), o `tick()` síncrono da montagem via um prazo já
  // vencido e chamava `respawnAqui` no primeiro frame — a tela de morte não chegava a aparecer. O piso
  // torna isso impossível, seja qual for o par que chegar. Escrito UMA vez por exibição, no molde do latch
  // de `deadClock.js`: andando a cada render, ele empurraria o respawn para sempre.
  const telaAt = useRef(0);
  useEffect(() => {
    if (!on) telaAt.current = 0;   // saiu da tela: a próxima exibição carimba de novo
    if (!on || !m || h.mode === MODE.BR) { setRestante(-1); return; }
    if (!telaAt.current) telaAt.current = performance.now();
    const end = prazoDe({ deadAt: h.deadAt || 0, armAt: h.armAt || 0 },
      Math.max(1000, Math.round((ROUND.RESPAWN_TICKS || 300) / TICK_HZ) * 1000),
      telaAt.current, ROUND.DEAD_MIN_MS || 0);
    if (!end) { setRestante(-1); return; }
    fired.current = false;
    const tick = () => { const s = Math.max(0, Math.ceil((end - performance.now()) / 1000)); setRestante(s);
      if (s <= 0 && !fired.current) { fired.current = true; respawnAqui(m && m.room); } };
    tick(); const t = setInterval(tick, 250); return () => clearInterval(t);
  }, [on, h.deadAt, h.armAt, h.mode]);
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
  // duas metades: o `kaboom` fica só com o estouro e o título — o subtítulo ("a galáxia continua sem
  // você") é sabor, e sabor é a primeira coisa que sai de um cartão que existe para ter UM toque
  const cabecaMin = <>
    <div className="dead-icon">{LB.deadIcon}</div>
    <div className="dead-title">{LB.dead}</div>
  </>;
  const cabeca = <>{cabecaMin}<div className="dead-sub">{LB.deadSub}</div></>;
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
  /* O botão que tira o jogador desta tela. Extraído porque a barra RECOLHIDA usa o mesmo: o `useEffect` de
     respawn continua correndo recolhido, e um respawn automático disparando sem o contador à vista seria
     surpresa — o jogador estaria assistindo à partida e voltaria ao jogo do nada. */
  const botaoPrimario = <button className="btn-primary" data-go="play"
    onClick={() => (semRespawn ? play({}) : respawnAqui(m.room))}>
    {semRespawn ? LB.newMatch : (restante > 0 ? `${LB.respawn} · ${preenche(LB.fmt.s, { n: restante })}` : LB.respawn)}</button>;
  /* ⚠️ A DICA VEM ANTES DO RODAPÉ, e o rodapé é UM bloco só. Antes eram três irmãos soltos no fim do
     cartão, e por isso a AÇÃO rolava junto com o conteúdo: medido em 24 das 34 combinações da matriz, com
     o RENASCER até 184 px abaixo da dobra no frame da Poki e 5 px num iPad mini. Conselho pode rolar;
     botão não. Quem gruda o `.dead-foot` no rodapé de quem rola é o CSS (ui.css, bloco "O RODAPÉ DE AÇÃO
     NÃO ROLA"), e aqui o que importa é ele ser o ÚLTIMO FILHO do cartão — que é o scrollport nos três
     shells desta tela. */
  const rodape = <>
    {/* O PRÊMIO vem logo acima do rodapé de ação: é a informação que o jogador leva desta tela, e fica
        colada nos botões — que agora grudam. Ele COLAPSA quando não há nada (nem skin destravada nem
        oferta), e nesse caso a tela fica exatamente como era. Ver ui/premio.js para a prioridade. */}
    <DeadPrize on={on} />
    {/* Desarmado, a dica diz o que fazer — e o botão continua clicável, renascendo na hora (o clique é um
        `pointerdown`, então ele mesmo arma). Quem não mexer em nada não renasce mais sozinho, que é o
        ponto. No BR a dica é outra: lá o certo é FICAR. */}
    {semRespawn ? <div className="hint dead-hint">{LB.brWatchHint}</div>
      : restante < 0 ? <div className="hint dead-hint">{LB.respawnArm}</div> : null}
    <div className="dead-foot">
      <div className="dead-actions">
        {botaoPrimario}
        <button className="btn-secondary" data-go="lobby" onClick={sairDaPartida}>{LB.toLobby}</button>
      </div>
      <div className="dead-views">
        <button className={"btn-secondary dead-map" + (mapa === "map" ? " on" : "")} onClick={() => verMapa("map")}>{mapa === "map" ? LB.mapClose : LB.mapOpen}</button>
        <button className={"btn-secondary dead-live" + (mapa === "live" ? " on" : "")} onClick={() => verMapa("live")}>{mapa === "live" ? LB.liveClose : LB.liveOpen}</button>
        <button className="btn-secondary dead-min" onClick={() => setMin(true)}
          title={LB.deadCollapse} aria-label={LB.deadCollapse}>{LB.deadCollapseIcon}</button>
      </div>
    </div>
  </>;
  /** Uma linha do balanço: número grande, e a barra só quando existe um recorde para comparar. */
  const linha = (k, valor, atual, rec, novo) => <div className={"dd-linha" + (novo ? " novo" : "")} key={k}>
    <span className="dl-k">{k}</span><b className="dl-v">{valor}</b>
    {rec > 0 ? <>
      <span className="dl-trilho"><i style={{ width: Math.max(2, Math.min(100, Math.round((atual / Math.max(rec, atual)) * 100))) + "%" }} /></span>
      <em className="dl-rec">{novo ? LB.newRecord : LB.recordWord + " " + fmt(rec)}</em>
    </> : null}
  </div>;

  /* ── KABOOM: A TELA DE MORTE DE UM TOQUE (pacote de portal, modo Livre) ──────────────────────────
     O estouro, UM número e o DE NOVO ocupando a largura. Sai tudo o que é RELATÓRIO — os três modelos,
     o ranking do dia, o recorde, a colocação, o prêmio, as duas vistas e o "voltar ao lobby".
     ⚠️ O número é o SCORE e não a massa: `maxMass` já esteve no HUD a partida inteira, e a pergunta de
     quem vai clicar em DE NOVO é "quanto eu fiz", não "quanto eu era".
     ⚠️ `LB.dead` JÁ É "KABOOM!" — nenhuma chave de i18n nova, nos três dicionários.
     ⚠️ Ele vem ANTES do recolhido e não tem botão para lá: um cartão deste tamanho não tapa a partida,
     então o estado recolhido não teria o que resolver. E não monta `DeadPrize` nem `SpecBar` — não é a
     mesma tela com `display:none`, é um quarto modelo, e por isso não paga o custo deles.
     ⚠️ TRADE-OFF DECLARADO: sai a oferta de anúncio recompensado do caminho de morte mais frequente do
     jogo. A receita não zera (o midroll do respawn continua, com `PORTAL.MIN_AD_MS` entre eles), mas é
     isto que está sendo trocado por retenção. */
  if (estilo === "kaboom") return <div className="screen on" id="s-dead" data-style="kaboom">
    <div className="card dead-card">
      {cabecaMin}
      <div className="kb-num"><b>{fmt(m.score || 0)}</b><i>{LB.scoreLabel}</i></div>
      <div className="dead-foot"><div className="dead-actions">{botaoPrimario}</div></div>
    </div>
  </div>;

  /* RECOLHIDO: sai o cartão, entra a barra — a MESMA de quem assiste a uma sala em andamento. Fica o que
     se usa daqui em diante: de quem é a câmera, as duas vistas, o botão que tira desta tela, e o RESUMO
     que traz o cartão de volta. O LOBBY não vem: são quatro alvos de 44 px em 360 px de largura, e sair
     do jogo é um toque a mais que sempre coube no cartão. */
  if (min) return <div className="screen on" id="s-dead" data-style={estilo} data-min="1">
    <SpecBar id="s-dead-min" rotulo={LB.dead} quem={spec && spec.slot >= 0 ? <SpecWho spec={spec} trocar={trocar} LB={LB} /> : null}>
      <button className={"btn-secondary" + (mapa === "map" ? " on" : "")} onClick={() => verMapa("map")}>{mapa === "map" ? LB.mapClose : LB.mapOpen}</button>
      <button className={"btn-secondary" + (mapa === "live" ? " on" : "")} onClick={() => verMapa("live")}>{mapa === "live" ? LB.liveClose : LB.liveOpen}</button>
      <button className="btn-secondary" onClick={() => setMin(false)}>{LB.deadSummary}</button>
      {botaoPrimario}
    </SpecBar>
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

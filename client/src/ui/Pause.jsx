// ── MENU DE PAUSA (Esc): sair, mexer no som e nos gráficos sem largar a partida ───────────────
// É OVERLAY, não tela, e a diferença não é de estilo: navegar para `prefs` durante o jogo faz o GameHost
// chamar `game.leave()` (a conexão CAI) e o Hud esconder o #hud inteiro. Aqui `screen` continua em "game".
//
// ⚠️ A partida NÃO pausa, e nem deve: é multijogador e o servidor é autoritativo — o planeta continua no
// mundo, sendo comido se estiver na hora errada. O que para é o COMANDO (ver `pausado` em game/index.js):
// sem isso o alvo continuaria seguindo o mouse por cima do modal, porque o ponteiro do jogo é lido na
// JANELA (ver o cabeçalho de input/Pointer.js) e nenhum overlay o impede de chegar. O nome "pausa" é o que
// o jogador chama isto; o que ele ganha é largar o controle sem largar a sala.
//
// As prefs saem da MESMA tabela da tela de Opções (`PREFS` + `PrefRow`), num subconjunto: o que alguém quer
// mexer no meio de uma partida é som, nitidez e movimento — não a tecla de dividir.
import React, { useMemo, useSyncExternalStore } from "react";
import { useStore, throttleStore } from "../state/store.js";
import { app } from "../state/app.js";
import { gameRef } from "../state/game.js";
import { setPause, sairDaPartida, flushPrefs, hostAct, toast, setNick, equipSkin, loadTop5 } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { PREFS } from "./prefsTable.js";
import { PrefRow } from "./Prefs.jsx";
import { Nick, Field, MiniRank } from "./bits.jsx";
import { linkConvite } from "../util/convite.js";
import { PORTAL, SEM_MENU } from "../portal/flags.js";
import { portal } from "../portal/index.js";
import { skinById } from "@warspace/shared";
import { skinName } from "../i18n/catalog.js";
import SkinPreview from "./SkinPreview.jsx";
import { nickSorteado } from "../util/nick.js";

// as chaves que valem em partida, na ordem em que se procura por elas
// ⚠️ `brInvite` entra aqui porque a pergunta "como faço isto parar?" nasce EM PARTIDA, com o card na
// tela — e o Esc é o único menu que se abre sem sair da sala. O card também tem o "Nunca" próprio; são
// dois caminhos para a MESMA chave, não duas verdades.
const RAPIDAS = ["muted", "volume", "music", "musicVolume", "quality", "reduceMotion", "showNames", "showMinimap", "brInvite"];
const ITENS = RAPIDAS.map(k => PREFS.flatMap(g => g.items).find(it => it.key === k)).filter(Boolean);

const EMPTY = {}, EMPTY_STORE = { subscribe: () => () => {}, get: () => EMPTY };
export default function Pause({ on }) {
  const LB = useLabels(); const prefs = useStore(app, s => s.session.prefs);
  const room = useStore(app, s => s.room);
  // o painel do dono vem do motor (o servidor só o manda para quem É o dono), não do estado da UI
  const game = useStore(gameRef, s => s.game);
  const store = useMemo(() => (game && game.hudStore ? throttleStore(game.hudStore, 250) : EMPTY_STORE), [game]);
  const h = useSyncExternalStore(store.subscribe, store.get, store.get) || EMPTY;
  // fechar dá flush nas prefs: `setPref` persiste com 600 ms de debounce, e voltar ao jogo e fechar a aba
  // dentro desse tempo perderia a escolha sem nada na tela dizendo por quê.
  const fecha = () => { flushPrefs(); setPause(false); };
  return <div className={"overlay" + (on ? " on" : "")} id="s-pause"
    onClick={e => { if (e.target === e.currentTarget) fecha(); }}>
    {on ? <div className="card modal pause" role="dialog" aria-modal="true" aria-label={LB.pauseTitle}>
      <div className="modal-title">{LB.pauseTitle}</div>
      {h.host ? <HostPanel host={h.host} room={room} LB={LB} /> : null}
      {/* ⚠️ NO PACOTE ESTE É O ÚNICO MENU QUE EXISTE, então o que era da tela inicial vem para cá — mas
          DENTRO do overlay, nunca por `go()`: `GameHost.jsx` chama `game.leave()` assim que `screen` sai
          de `game|dead|round|spec`, ou seja "abrir a loja" seria sair da partida com outro nome.
          Colapsado por padrão para a altura do cartão não mudar (a matriz não mede overlay). */}
      {SEM_MENU ? <EuBloco LB={LB} /> : null}
      <div className="pause-prefs">{ITENS.map(it => <PrefRow key={it.key} it={it} v={prefs[it.key]} pfx="pause-" />)}</div>
      <div className="modal-actions pause-actions">
        <button className="btn-secondary" id="pause-exit" data-go="lobby" onClick={() => { flushPrefs(); sairDaPartida(); }}>{LB.exitMatch}</button>
        <button className="btn-primary" id="pause-resume" onClick={fecha} autoFocus>{LB.resume}</button>
      </div>
    </div> : null}</div>;
}

/**
 * QUEM EU SOU — o que era da tela inicial, agora dentro da pausa (só no pacote, ver `SEM_MENU`).
 *
 * Três coisas, e são exatamente as que alguém abre um menu para fazer num `.io`: trocar o NOME do
 * planeta, trocar a SKIN (entre as que já tem) e ver quem está ganhando hoje. A loja completa fica de
 * fora por enquanto: ela é uma grade com modal próprio, e empilhá-la aqui é o oposto de "sem inflar a
 * tela" — quando entrar, entra como um quarto `<details>` com a grade extraída de `Shop.jsx`.
 *
 * ⚠️ **O NOME DO PLANETA ABRE POR PADRÃO; O TOP 5, NÃO.** Trocar o nome é a razão nº 1 de alguém abrir
 * este menu num `.io`, e escondê-la atrás de um clique numa seta fazia o menu do pacote parecer só uma
 * mesa de som. O TOP 5 continua fechado, e não por simetria: o `onToggle` dele é o que dispara
 * `loadTop5()` na PRIMEIRA abertura — `loadTop5` saiu do caminho crítico do boot do pacote junto com
 * `loadRooms`, e abri-lo por padrão devolveria ao boot o pedido de rede que foi tirado dele.
 * ⚠️ **O motivo do fechado-por-padrão continua de pé, e quem o cobre hoje é outro.** Com os blocos
 * abertos o RETOMAR saía da dobra num frame de portal de 470 px — o mesmo defeito que a tela de morte
 * levou 24 de 34 combinações da matriz para admitir. O que segura agora é `.pause-actions`
 * (`position:sticky;bottom:0;margin-top:auto`, ui.css) sobre um cartão que rola (`overflow:auto`), ou
 * seja a ação está ANCORADA e não depende mais de o conteúdo caber. ⚠️ E isso tem que ser conferido de
 * OLHO: a matriz de responsividade percorre TELAS e não mede overlay — aqui não há rede automática.
 */
function EuBloco({ LB }) {
  const session = useStore(app, s => s.session);
  const top5 = useStore(app, s => s.top5);
  const sugerido = useStore(app, s => s.nickSugerido);
  const user = session.user || {};
  const nickDoUsuario = nickSorteado(user.nick) ? sugerido : user.nick;
  const [nick, setNickLocal] = React.useState(nickDoUsuario);
  const tocou = React.useRef(false);
  // mesma guarda de ui/Entry.jsx: a sugestão do servidor chega DEPOIS e não pode apagar o que a pessoa
  // acabou de escrever — `tocou` só vira true por gesto dela
  React.useEffect(() => { if (!tocou.current) setNickLocal(nickDoUsuario); }, [nickDoUsuario]);
  const commit = async () => { const v = (nick || "").trim(); if (!v || v === (user.nick || "")) return;
    const r = await setNick(v); if (!r.ok) setNickLocal(nickDoUsuario); };
  const minhas = (session.skins || []).map(id => skinById(id | 0)).filter(Boolean);
  return <>
    <details className="pause-eu" open>
      <summary>{LB.nameLabel} · {LB.swap}</summary>
      <div className="pause-id">
        {/* ⚠️ `size` é o CANVAS e `r` é medido na escala de 112 (`k = cv.width/112`, ver SkinPreview):
            o disco sai com `r*size/112`. Sem o `size` o padrão é 112 — um planeta de 112 px dentro de um
            menu de pausa, que foi exatamente o que a primeira versão desenhou. */}
        <SkinPreview skin={skinById(user.equippedSkin | 0)} r={40} size={72} />
        <Field id="pauseNome" label={LB.nameLabel} placeholder={LB.namePlaceholder} maxLength={16} autoComplete="off" value={nick || ""}
          onChange={e => { tocou.current = true; setNickLocal(e.target.value); }} onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      </div>
      {minhas.length > 1 ? <div className="pause-skins">{minhas.map(sk =>
        <button key={sk.id} className={"skin-mini" + (sk.id === (user.equippedSkin | 0) ? " on" : "")}
          onClick={() => equipSkin(sk.id)} title={skinName(sk)} aria-label={skinName(sk)}>
          <SkinPreview skin={sk} r={40} size={38} /></button>)}</div> : null}
    </details>
    <details className="pause-rank" onToggle={e => { if (e.currentTarget.open) loadTop5(); }}>
      <summary>{LB.top5}</summary>
      <MiniRank id="pause-top5" rows={top5} n={5} />
    </details>
  </>;
}

/**
 * O PAINEL DO DONO, dentro do mesmo menu. Não é um segundo overlay de propósito: o dono já vem aqui para
 * ajustar som ou sair, e um painel próprio no HUD teria de resolver de novo tudo o que este já resolveu —
 * o `#hud` some fora de `screen==="game"`, e um modal de tela cheia não impede o planeta de seguir o mouse.
 * ⚠️ O identificador de cada linha é o `pid`, um handle OPACO por sala. Nunca o slot (recicla, e o painel
 * expulsaria a pessoa errada) e nunca o sessionId (é metade da credencial de `resume`).
 */
function HostPanel({ host, room, LB }) {
  const outros = (host.roster || []).filter(l => !l.host);
  // ⚠️ No portal o convite é o LINK DELES (`inviteLink`), que abre o jogo na página deles já na sala —
  // é o que a CrazyGames chama de "copying direct invite links within your game". Fora dali, o de sempre.
  const convite = async () => { const url = (PORTAL && await portal.convite(room || "")) || linkConvite("sala", room || "");
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast(LB.hostInvite), () => toast(url, 4000));
    else toast(url, 4000); };
  // ⚠️ SEM `portal.convite` O BOTÃO NÃO PODE EXISTIR, e isto é certificação, não estética: o fallback
  // `linkConvite` copia uma URL de **warspace.io de dentro do iframe deles**, contra a regra escrita de
  // "nenhuma URL própria dentro do jogo" (§6.1 da GameDistribution — foi por uma lista dessas que as
  // caricaturas saíram do pacote uma vez). Só a CrazyGames implementa `convite`; na Poki ele devolvia
  // `null` e o botão virava exatamente esse problema. O predicado é o mesmo molde de `temRecompensa`.
  const podeConvidar = room && (!PORTAL || portal.temConvite);
  return <section className="pause-host">
    <div className="ph">{LB.hostPanel} {podeConvidar ? <button className="btn-mini" onClick={convite}>{room} ⧉</button> : null}</div>
    {outros.length
      ? <ul className="host-list">{outros.map(l => <li key={l.pid}>
          <Nick p={l} />
          <span className="host-acts">
            <button className="btn-mini" onClick={() => hostAct("kick", l.pid)}>{LB.hostKick}</button>
            <button className="btn-mini danger" onClick={() => hostAct("ban", l.pid)}>{LB.hostBan}</button>
          </span></li>)}</ul>
      : <span className="hint">{LB.hostNobody}</span>}
    {host.bans && host.bans.length ? <span className="hint">{LB.hostBanned}: {host.bans.map(b => b.nick).join(", ")}</span> : null}
  </section>;
}

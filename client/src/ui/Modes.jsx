// Escolha do modo: o funil que estava faltando entre a Entrada e o `play()`.
// DOIS cartões grandes, com os mascotes do jogo: LIVRE (Marte à esquerda, a Lua à direita e o JOGAR entre
// os dois) e BATTLE ROYALE, que absorveu o cartão de EQUIPE — Solo virou o primeiro dos quatro chips
// (1·Solo, 2·Dupla, 3·Trio, 4·Quarteto), porque
// "solo" e "em dupla" nunca foram dois MODOS, eram o mesmo battle royale com outro tamanho de esquadrão, e
// tê-los como cartões irmãos fazia a tela ter quatro escolhas onde há duas. Solo cai direto no lobby de
// matchmaking; 2+ passa antes pelo lobby de convite (Party.jsx), porque aí o jogador precisa de um código
// para mandar aos amigos antes de qualquer sala existir.
// "Sala sua" saiu da grade e virou um BOTÃO que revela o cartão: é a escolha menos usada da tela e ocupava
// um quarto dela — e com quatro cartões a caixa passava dos 1.300 px, cortando o último pela metade.
// Offline (`api.server === false`) o Battle Royale fica desabilitado: o `?local=1` só sabe rodar o Livre.
import React, { useState } from "react";
import { MODE, BR, ROUND, roundTicksOf } from "@warspace/shared";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { api } from "../api/client.js";
import { play, setMode, createParty, joinParty, criarSala } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { preenche } from "../i18n/index.js";
import { Screen, ScreenHeader } from "./bits.jsx";
// Os mascotes JÁ ESTÃO no bundle, em WebP, e são os mesmos que o cenário de fundo usa (`ui/Scene.jsx`):
// importados por módulo, o Vite emite UM asset compartilhado — mesma URL, mesmo cache, zero byte a mais no
// zip de portal. ⚠️ Nada de PNG em `client/public/`: a `base:"./"` do build de portal não conserta
// referência absoluta a `public/`, e os originais somam 1,86 MB.
import marte from "../assets/scene/planeta-laranja.webp";
import terra from "../assets/scene/planeta-azul.webp";
import lua from "../assets/scene/lua.webp";

export default function Modes({ on }) {
  return <Screen id="modes" on={on} className="modes-wrap">{on ? <Body /> : null}</Screen>;
}
function Body() {
  const LB = useLabels();
  const teamSize = useStore(app, s => s.teamSize);
  const user = useStore(app, s => s.session.user) || {};
  const [code, setCode] = useState("");
  // "Sala sua" virou BOTÃO: o cartão de criação é a coisa menos usada da tela e ocupava um quarto dela.
  const [abrirSala, setAbrirSala] = useState(false);
  const offline = api.server === false;
  // ⚠️ `1` passa a ser válido: Solo deixou de ser cartão e virou o primeiro chip do Battle Royale. Antes
  // isto era `teamSize > 1 ? teamSize : 2`, e com aquela linha o chip "Solo" nunca acenderia.
  const ts = teamSize >= 1 && teamSize <= 4 ? teamSize : 1;
  const SIZES = [[1, LB.soloWord], [2, LB.duo], [3, LB.trio], [4, LB.quad]];
  // ⚠️ O caminho RAMIFICA, e não pode ser unificado: `createParty` NÃO passa por `play()` — ele faz o POST
  // e vai para a tela de equipe, e quem chama `play()` depois é a largada em Party.jsx. É dentro de `play()`
  // que vivem o `semNome()` e o ANÚNCIO de portal, então mandar equipe por lá daria dois prerolls, e não
  // mandar o solo por lá é reprova de certificação.
  const entrarBR = () => { setMode(MODE.BR, ts);
    if (ts > 1) createParty(ts); else play({ mode: MODE.BR, teamSize: 1, party: null }); };
  const entrarLivre = () => { setMode(MODE.FREE, 1); play({ mode: MODE.FREE, teamSize: 1, party: null }); };
  return <>
    <ScreenHeader title={LB.modesTitle} />
    {/* ⚠️ ABRIR "Sala sua" ESCONDE OS DOIS CARTÕES. Eles não são alternativa ao formulário: quem clicou
        em CRIAR SUA SALA já escolheu o modo lá dentro (o primeiro controle do cartão é justamente
        Livre × Battle Royale), então deixá-los no ar oferece a mesma decisão duas vezes, com dois
        botões de entrar competindo na mesma tela — e empurra o formulário para fora da caixa. */}
    {abrirSala ? null : <div className="modes duo">
      {/* ⚠️ LIVRE DEIXOU DE SER <button> pelo mesmo motivo do Battle Royale: ele ganhou um JOGAR de
          verdade dentro dele, e botão dentro de botão é HTML inválido e prende o foco. O que se perde é
          "clicar em qualquer lugar do cartão entra"; o que se ganha é a MESMA chamada à ação nos dois
          cartões, no mesmo ponto da tela — antes o Livre era o único cartão sem botão nenhum, e quem
          chegava procurava o JOGAR que só o vizinho tinha. */}
      <div className="mode-card grande" data-mode="free">
        <b>{LB.modeFree}</b>
        <span>{LB.modeFreeSub}</span>
        {/* Os dois mascotes ENTRARAM NA FILEIRA do botão, em vez de ficarem no absoluto: com dois deles
            no mesmo cartão o de baixo passava por cima do JOGAR em tela estreita, e o `overflow:hidden`
            esconde o excesso mas não impede a colisão. Marte à esquerda, a Lua à direita, o botão entre
            os dois — e a Lua saiu do botão de "Sala sua", senão ela aparecia duas vezes na mesma tela. */}
        <div className="free-row">
          <img className="mode-mascote" src={marte} alt="" aria-hidden="true" width="448" height="463" decoding="async" />
          <button className="btn-primary" data-go="play" onClick={entrarLivre}>{LB.play}</button>
          <img className="mode-mascote" src={lua} alt="" aria-hidden="true" width="256" height="321" decoding="async" />
        </div>
      </div>
      {/* ⚠️ BATTLE ROYALE deixou de ser <button> porque passou a ter controles dentro: botão dentro de botão
          é HTML inválido e prende o foco — é a mesma razão de "Em equipe" e "Sala sua" já serem <div>. */}
      <div className={"mode-card grande br" + (offline ? " off" : "")} data-mode="br">
        <img className="mode-mascote" src={terra} alt="" aria-hidden="true" width="448" height="431" decoding="async" />
        <b>{LB.modeSolo}</b>
        <span>{LB.modeSoloSub}</span>
        <em className="mode-tag">{preenche(LB.fmt.planets, { n: BR.PLAYERS })}</em>
        <div className="team-sizes" role="radiogroup" aria-label={LB.teamSizeLabel}>
          {SIZES.map(([n, l]) => <button key={n} role="radio" aria-checked={ts === n}
            className={"chip-btn" + (ts === n ? " on" : "")} disabled={offline}
            onClick={() => setMode(MODE.BR, n)}>{n} · {l}</button>)}
        </div>
        <button className="btn-primary" data-go="play" disabled={offline} onClick={entrarBR}>{ts > 1 ? LB.createParty : LB.play}</button>
        <div className="code-row">
          <input maxLength={4} placeholder={LB.partyCode} autoComplete="off" value={code} disabled={offline}
            onChange={e => setCode(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 4))}
            onKeyDown={e => { if (e.key === "Enter") joinParty(code); }} />
          <button className="btn-secondary" disabled={offline} onClick={() => joinParty(code)}>{LB.joinParty}</button>
        </div>
      </div>
    </div>}
    {/* ⚠️ Fora da grade agora que ela tem só DOIS cartões: um terceiro item deixaria um buraco do tamanho
        dele à direita. E o botão continua VISÍVEL para quem não tem conta, desabilitado e com o porquê ao
        lado — some o botão, some a explicação, e o jogador não descobre por que não pode abrir sala. */}
    <button className={"btn-secondary own-toggle" + (abrirSala ? " on" : "")} aria-expanded={abrirSala} aria-controls="own-card"
      onClick={() => setAbrirSala(v => !v)}>{abrirSala ? LB.ownClose : LB.ownOpen}</button>
    {abrirSala ? <SalaPropria offline={offline} registrada={user.kind === "registered"} LB={LB} /> : null}
    {offline ? <div className="hint">{LB.offlineNote}</div> : null}
    {/* ⚠️ A LEGENDA DOS POWERUPS morava aqui e foi para a AJUDA, em Opções (ui/Prefs.jsx). Esta é a tela
        de ESCOLHER O MODO — quatro cartões que já não cabem numa janela de notebook —, e uma tabela de
        cinco linhas de texto explicativo no fim dela empurrava "Sala sua" para fora da vista e fazia a
        caixa rolar por cima do cabeçalho. Quem quer ler o que é o trevo tem tempo; quem está escolhendo
        o modo, não. */}
  </>;
}
/**
 * ABRIR UMA SALA SUA. É o quarto cartão: as três primeiras escolhas põem o jogador numa sala que o servidor
 * escolhe; esta cria a sala DELE, com o modo, a duração e a privacidade que ele quiser — e o deixa como dono,
 * podendo expulsar e banir.
 * ⚠️ Só CONTA REGISTRADA, e o motivo é dito na tela: o dono expulsa e bane, e quem troca de identidade a cada
 * entrada não pode ter esse poder. Sem isso o botão daria 403 e o jogador não teria como saber por quê.
 * ⚠️ "Sem fim" só existe no Livre — no Battle Royale o tempo é a rede de segurança da zona, e quem responde
 * isso é `roundTicksOf` (shared), a MESMA função que a rota usa para validar. Duas listas divergiriam.
 */
function SalaPropria({ offline, registrada, LB }) {
  const [modo, setModo] = useState(MODE.FREE);
  const [min, setMin] = useState(30);
  const [priv, setPriv] = useState(true);
  const bloqueado = offline || !registrada;
  const tempos = ROUND.CHOICES_MIN.filter(m => roundTicksOf(modo, m) !== null);
  const minOk = tempos.includes(min) ? min : tempos[tempos.length - 1];
  return <div id="own-card" className={"card mode-card own" + (bloqueado ? " off" : "")} data-mode="own">
    <b>{LB.ownRoom}</b>
    <span>{LB.ownRoomSub}</span>
    <div className="own-row" role="radiogroup" aria-label={LB.modesShort}>
      {[[MODE.FREE, LB.modeFree], [MODE.BR, LB.modeSolo]].map(([id, l]) =>
        <button key={id} className={"chip-btn" + (modo === id ? " on" : "")} disabled={bloqueado} onClick={() => setModo(id)}>{l}</button>)}
    </div>
    <div className="own-row" role="radiogroup" aria-label={LB.ownTime}>
      {tempos.map(m => <button key={m} className={"chip-btn" + (minOk === m ? " on" : "")} disabled={bloqueado}
        onClick={() => setMin(m)}>{m ? preenche(LB.fmt.min, { n: m }) : "∞"}</button>)}
    </div>
    <label className="own-priv"><span>{LB.ownPrivate}</span>
      <button className="toggle" role="switch" aria-checked={priv} disabled={bloqueado} onClick={() => setPriv(!priv)}><i></i></button></label>
    {/* A chave não muda só quem ENTRA: fechada, a sala não recebe preenchimento nenhum (é do dono e de
        quem ele convidar); aberta, ele entra sozinho e os bots chegam devagar. Sem esta linha o jogador
        descobre a diferença só depois de abrir a sala — ver `semBots` em server/src/rooms/Room.js. */}
    <span className="hint own-note">{priv ? LB.ownPrivateNote : LB.ownPublicNote}</span>
    <button className="btn-primary" disabled={bloqueado} onClick={() => criarSala({ mode: modo, teamSize: 1, minutes: minOk, private: priv })}>{LB.ownCreate}</button>
    {!registrada && !offline ? <span className="hint">{LB.ownNeedAccount}</span> : null}
  </div>;
}

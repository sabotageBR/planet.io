// Escolha do modo: o funil que estava faltando entre a Entrada e o `play()`.
// LIVRE é o jogo de sempre (um clique e entra). BATTLE ROYALE solo cai direto no lobby de matchmaking, que
// enche com quem estiver procurando na mesma hora. EM EQUIPE passa antes pelo lobby de convite (Party.jsx),
// porque aí o jogador precisa de um código para mandar aos amigos antes de qualquer sala existir.
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

export default function Modes({ on }) {
  return <Screen id="modes" on={on} className="modes-wrap">{on ? <Body /> : null}</Screen>;
}
function Body() {
  const LB = useLabels();
  const teamSize = useStore(app, s => s.teamSize);
  const user = useStore(app, s => s.session.user) || {};
  const [code, setCode] = useState("");
  const offline = api.server === false;
  const ts = teamSize > 1 ? teamSize : 2;
  const SIZES = [[2, LB.duo], [3, LB.trio], [4, LB.quad]];
  return <>
    <ScreenHeader title={LB.modesTitle} />
    <div className="modes">
      <button className="mode-card" data-mode="free" onClick={() => { setMode(MODE.FREE, 1); play({ mode: MODE.FREE, teamSize: 1, party: null }); }}>
        <i className="mode-ico">🪐</i>
        <b>{LB.modeFree}</b>
        <span>{LB.modeFreeSub}</span>
      </button>
      <button className={"mode-card" + (offline ? " off" : "")} data-mode="solo" disabled={offline}
        onClick={() => { setMode(MODE.BR, 1); play({ mode: MODE.BR, teamSize: 1, party: null }); }}>
        <i className="mode-ico">☄️</i>
        <b>{LB.modeSolo}</b>
        <span>{LB.modeSoloSub}</span>
        <em className="mode-tag">{BR.PLAYERS} · {LB.soloWord}</em>
      </button>
      <div className={"mode-card team" + (offline ? " off" : "")} data-mode="team">
        <i className="mode-ico">🛰️</i>
        <b>{LB.modeTeam}</b>
        <span>{LB.modeTeamSub}</span>
        <div className="team-sizes" role="radiogroup" aria-label={LB.teamSizeLabel}>
          {SIZES.map(([n, l]) => <button key={n} className={"chip-btn" + (ts === n ? " on" : "")} disabled={offline}
            onClick={() => setMode(MODE.BR, n)}>{l}</button>)}
        </div>
        <button className="btn-primary" disabled={offline} onClick={() => createParty(ts)}>{LB.createParty}</button>
        <div className="code-row">
          <input maxLength={4} placeholder={LB.partyCode} autoComplete="off" value={code} disabled={offline}
            onChange={e => setCode(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 4))}
            onKeyDown={e => { if (e.key === "Enter") joinParty(code); }} />
          <button className="btn-secondary" disabled={offline} onClick={() => joinParty(code)}>{LB.joinParty}</button>
        </div>
      </div>
      {/* ⚠️ "Sala sua" entra na MESMA grade, e não solto embaixo dela: fora, ele era uma quarta linha de
          largura inteira e a tela passava dos 1.300 px de altura — o cartão "Em equipe" ficava cortado ao
          meio pela borda da caixa e ninguém via que havia mais coisa abaixo. Dentro, ele divide a segunda
          fileira com "Em equipe" (os dois altos, os dois com controles) e a tela cabe. */}
      <SalaPropria offline={offline} registrada={user.kind === "registered"} LB={LB} />
    </div>
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
  return <div className={"card mode-card own" + (bloqueado ? " off" : "")} data-mode="own">
    <i className="mode-ico">🔑</i>
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
    <button className="btn-primary" disabled={bloqueado} onClick={() => criarSala({ mode: modo, teamSize: 1, minutes: minOk, private: priv })}>{LB.ownCreate}</button>
    {!registrada && !offline ? <span className="hint">{LB.ownNeedAccount}</span> : null}
  </div>;
}

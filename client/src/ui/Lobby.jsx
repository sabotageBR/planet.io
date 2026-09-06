import React, { useState } from "react";
import { skinById, MODE } from "@warspace/shared";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { play, loadRooms, loadTop5, toast, assistir } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { preenche } from "../i18n/index.js";
import { useInterval } from "../hooks/useInterval.js";
import { ScreenHeader, MiniRank, Screen } from "./bits.jsx";
import { fmtTime } from "./format.js";
import SkinPreview from "./SkinPreview.jsx";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export default function Lobby({ on }) {
  return <Screen id="lobby" on={on} className="lobby-wrap">{on ? <Body /> : null}</Screen>;
}
function Body() {
  const LB = useLabels();
  const session = useStore(app, s => s.session), rooms = useStore(app, s => s.rooms), top5 = useStore(app, s => s.top5), config = useStore(app, s => s.config);
  const user = session.user || {}, sk = skinById(user.equippedSkin ?? 0), guest = user.kind !== "registered";
  const [code, setCode] = useState("");
  useInterval(loadRooms, 5000, true);
  useInterval(loadTop5, 30000, true);
  const enter = () => { if (code.length !== 4) { toast(LB.roomCode + ": " + preenche(LB.fmt.chars, { n: 4 })); return; } play({ room: code }); };
  const create = () => {
    const shard = config && config.shard != null ? String(config.shard) : "0";
    let c = shard; for (let i = 0; i < 3; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    play({ room: c });
  };
  return <>
    <ScreenHeader title={LB.lobbyTitle} />
    <div className="card lobby-hero">
      <div className="me-chip"><SkinPreview skin={sk} r={20} size={56} className="skinprev-sm" /><div><b className="v-nick">{user.nick}</b><i className="v-kind" data-kind={guest ? "guest" : "registered"}>{guest ? LB.guest : LB.registered}</i></div></div>
      <button className="btn-primary" data-go="play" onClick={() => play({})}>{LB.playAuto}</button><span className="hint">{LB.autoNote}</span>
      <div className="code-row">
        <input id="codeIn" maxLength={4} placeholder={LB.roomCode} autoComplete="off" value={code}
          onChange={e => setCode(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 4))} onKeyDown={e => { if (e.key === "Enter") enter(); }} />
        <button className="btn-secondary" data-go="play" onClick={enter}>{LB.enter}</button>
        <button className="btn-secondary" data-go="play" onClick={create}>{LB.create}</button></div>
    </div>
    <div className="card room-list" id="room-list">
      {/* ⚠️ A coluna de BOTS saiu. Ela dizia, em números, que os adversários daquela sala não são gente — e
          numa sala de 1 humano + 15 preenchimentos ela era o dado mais visível da linha. O que ficou é o que
          ajuda a escolher: código, shard, quão cheia está, ping. */}
      <div className="room-row head"><span className="code">{LB.roomCode}</span><span className="mode">{LB.roomModeCol}</span><span className="shard">{LB.shard}</span><span className="pl">{LB.youLabel}s</span><span className="tempo">{LB.roomTimeCol}</span><span className="act"></span></div>
      {rooms.map(r => {
        // ⚠️ Quem decide se dá para entrar é o SERVIDOR (`acceptsJoin` → `open`), não a contagem: uma sala de
        // Battle Royale em andamento tem vaga de sobra e mesmo assim está trancada. `open` ausente é shard
        // irmão em build antiga (a lista agrega os peers) — aí vale a conta velha.
        const fechada = r.open === undefined ? r.players >= r.max : r.open === false;
        const motivo = r.closed || (fechada ? (r.mode === MODE.BR && r.phase !== "lobby" ? "started" : "full") : null);
        const dentro = Math.min(r.players + (r.bots || 0), r.max);
        // `round` é o que sobra da rodada em segundos: null = sala sem fim (é opção do dono no Livre), e no
        // lobby do BR o relógio ainda não começou a correr. `lockInMs` é o contrário: quanto falta para
        // TRANCAR — vale no lobby (a janela de espera) e na janela de entrada tardia do BR (antes do 1º
        // fechamento do gás), e por isso vem ANTES do `round` de sempre: só uma sala já trancada exibe o
        // relógio da rodada, porque aí não há mais contagem de entrada para mostrar.
        const tempo = r.lockInMs != null ? preenche(LB.roomLockIn, { n: Math.ceil(r.lockInMs / 1000) })
          : r.phase === "lobby" ? LB.roomWaiting : r.round == null ? LB.roomEndless : fmtTime(r.round);
        return <div className={"room-row" + (fechada ? " full" : "") + (motivo === "started" ? " locked" : "")} data-code={r.code} key={r.code}>
        <b className="code">{r.code}</b>
        <span className="mode" data-mode={r.mode === MODE.BR ? "br" : "free"}>{r.mode === MODE.BR ? LB.roomBr : LB.roomFree}</span>
        <span className="shard">{r.shard}</span>
        {/* quantos estão DENTRO, humanos e preenchimento no mesmo número — sem os bots, uma sala movimentada
            aparecia como "1/30" e parecia deserta. */}
        <span className="pl"><i className="bar" style={{ "--p": r.max ? dentro / r.max : 0 }}></i>{dentro}/{r.max}</span>
        <span className="tempo">{tempo}</span>
        {/* Trancada MOSTRA o cadeado em vez de sumir com a linha: some, o jogador não entende por que a sala
            que ele viu há 5 s não está mais lá. E o clique leva o modo DA SALA junto — na lista se escolhe
            uma sala, não um modo, e sem isso um servidor antigo ainda recusaria por divergência. */}
        {/* ⚠️ TRANCADA POR "JÁ COMEÇOU" VIRA "ASSISTIR", e a distinção com "cheia" é o ponto: uma sala de
            Battle Royale em andamento tem vaga de sobra e mesmo assim recusa jogador — mas há o que VER
            nela, que é justamente o que o cadeado escondia. Cheia continua com o cadeado: ali não há vaga
            nem partida decidida para acompanhar, e um espectador a mais não muda isso.
            O botão chama `assistir()`, nunca `play()`: aquele manda `spec:true` no join e cai em
            `Room.joinSpec`, que é uma porta diferente da de quem vai jogar. */}
        <span className="act">{fechada
          ? motivo === "started"
            ? <button className="btn-mini spec" data-go="spec" data-room={r.code} title={LB.roomLocked} onClick={() => assistir({ room: r.code })}>{LB.watch}</button>
            : <span className="lock" title={LB.roomFullTag}>🔒</span>
          : <button className="btn-mini" data-go="play" data-room={r.code} onClick={() => play({ room: r.code, mode: r.mode, teamSize: r.teamSize || 1 })}>{LB.enter}</button>}</span></div>; })}
      {!rooms.length ? <div className="room-row empty dim" style={{ display: "block" }}><span className="hint">{LB.noRooms}</span></div> : null}
    </div>
    <aside className="card lobby-side"><div className="ph">{LB.top5}</div><MiniRank id="lobby-top5" rows={top5} n={5} /></aside>
  </>;
}

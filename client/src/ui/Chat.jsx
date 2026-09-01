// Painel de chat, à ESQUERDA e por cima do canvas (dentro de #hud, então some sozinho fora da partida).
// Enter abre o campo, Esc fecha. Enquanto o campo tem foco o teclado do jogo fica mudo — quem faz isso é o
// `inInput()` do game/input/Keyboard.js, de graça: digitar "espaço" não divide o planeta.
// As linhas somem sozinhas depois de CHAT.FADE_MS: o chat não pode virar uma parede permanente em cima do jogo.
// O escopo (sala ou equipe) é decidido no SERVIDOR pelo modo; aqui só se mostra qual é — MENOS para quem
// morreu no Battle Royale, que escolhe entre a arquibancada (TODOS, o padrão) e o esquadrão (EQUIPE).
import React, { useEffect, useRef, useState } from "react";
import { CHAT, MODE } from "@warspace/shared";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { gameRef } from "../state/game.js";
import { useLabels } from "../hooks/useTheme.js";

export default function Chat({ h, persist = false }) {
  const LB = useLabels();
  const prefs = useStore(app, s => s.session.prefs);
  const game = useStore(gameRef, s => s.game);
  const [open, setOpen] = useState(false), [text, setText] = useState("");
  const [tick, setTick] = useState(0);
  const [paraEquipe, setParaEquipe] = useState(false);   // morto no BR: TODOS (padrão) ↔ EQUIPE
  // Clicar num NOME abre as duas saídas que o jogo não tinha: silenciar (local, ver game/index.js) e
  // denunciar (vai ao servidor). Antes, contra alguém insuportável, só existia desligar o chat inteiro
  // nas Opções — desistir da sala por causa de uma pessoa. Um menu por linha, e não um botão fixo em
  // cada uma: o chat tem 4 linhas de altura e vive em cima do jogo.
  const [alvo, setAlvo] = useState(null);
  const [avisou, setAvisou] = useState(false);
  const inp = useRef(null);
  const linhas = h.chat || [], mudos = h.mudos || [];
  // Enter abre; o listener é da janela porque o painel não tem foco enquanto se joga
  useEffect(() => {
    if (prefs.chat === false) return;
    const kd = e => {
      const alvo = document.activeElement, digitando = alvo && /INPUT|TEXTAREA/.test(alvo.tagName);
      if (e.code === "Enter" && !digitando) { e.preventDefault(); setOpen(true); setTimeout(() => inp.current && inp.current.focus(), 0); }
      // ⚠️ `preventDefault` não é enfeite: é o que diz ao Esc de App.jsx que este já foi gasto em sair do
      // chat. Sem ele o campo perdia o foco aqui e o `escape()` de lá, vendo o foco JÁ no body, abria o
      // menu de pausa — voltar do chat para o jogo custava dois Esc.
      else if (e.code === "Escape" && digitando) { e.preventDefault(); setOpen(false); setText(""); alvo.blur(); }
    };
    addEventListener("keydown", kd); return () => removeEventListener("keydown", kd);
  }, [prefs.chat]);
  // relógio só para o fade: as linhas somem pela idade, e sem isto elas ficariam eternas até chegar outra
  useEffect(() => { if (!linhas.length) return; const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, [linhas.length]);
  if (prefs.chat === false) return null;
  const agora = Date.now();
  // `persist`: na tela de morte o chat NÃO desbota. O fade existe para o chat não virar parede em cima do
  // jogo — atrás da tela de morte não há jogo, e quem parou de jogar quer justamente ler a conversa.
  const vivas = persist || open ? linhas : linhas.filter(l => agora - l.at < CHAT.FADE_MS);
  const equipe = h.mode === MODE.BR && h.team >= 0;
  const escolhe = !!h.dead && equipe;   // só o morto de equipe do BR tem o que escolher
  const escopo = escolhe && paraEquipe ? "team" : escolhe ? "all" : null;
  const enviar = () => {
    const t = text.trim();
    if (t && game && game.sendChat) game.sendChat(t, escopo);
    setText(""); setOpen(false); if (inp.current) inp.current.blur();
  };
  return <div id="chat" className={(open ? "open" : "") + (vivas.length || persist ? "" : " quiet")}>
    <div className="chat-head"><b>{LB.chatTitle}</b>
      {escolhe
        ? <button className={"chat-scope pick" + (paraEquipe ? " team" : "")} onClick={() => setParaEquipe(v => !v)}
            title={LB.chatScopeHint}>{paraEquipe ? LB.chatTeam : LB.chatAll}</button>
        : equipe ? <i className="chat-scope">{LB.chatTeam}</i> : null}
      {mudos.length ? <button className="chat-mudos" onClick={() => game && game.unmuteAll()}
        title={LB.unmuteAll}>🔇 {mudos.length}</button> : null}</div>
    <div className="chat-lines" data-n={vivas.length}>
      {vivas.map((l, i) => <div key={l.at + ":" + i} className={"chat-line" + (l.mine ? " mine" : "") + (l.slot < 0 ? " sys" : "") + (l.dead ? " dead" : "")}>
        {l.slot >= 0
          ? (l.mine
            ? <b>{l.dead ? LB.chatDeadTag : ""}{l.name}</b>
            : <b><button className="chat-nick" onClick={() => { setAvisou(false); setAlvo({ slot: l.slot, name: l.name }); }}
                title={LB.playerActions}>{l.dead ? LB.chatDeadTag : ""}{l.name}</button></b>)
          : null}<span>{l.text}</span>
      </div>)}
    </div>
    {alvo
      ? <div className="chat-alvo">
          <b>{alvo.name}</b>
          {avisou
            ? <i>{LB.reportSent}</i>
            : <>
              <button onClick={() => { if (game) game.mute(alvo.slot, true); setAlvo(null); }}>{LB.mutePlayer}</button>
              <button className="warn" onClick={() => { if (game) game.report(alvo.slot); setAvisou(true); }}>{LB.reportPlayer}</button>
            </>}
          <button className="x" onClick={() => setAlvo(null)}>✕</button>
        </div>
      : null}
    {open
      ? <input ref={inp} className="chat-input" maxLength={CHAT.MAX_CHARS} placeholder={LB.chatPlaceholder} value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); enviar(); } else if (e.key === "Escape") { e.preventDefault(); setOpen(false); setText(""); e.currentTarget.blur(); } }}
          onBlur={() => setOpen(false)} />
      : <button className="chat-open" onClick={() => { setOpen(true); setTimeout(() => inp.current && inp.current.focus(), 0); }}>{dedo() ? LB.chatHintTouch : LB.chatHint}</button>}
  </div>;
}
// "Enter para falar" num aparelho que não tem Enter. Legenda que mente é pior que legenda nenhuma — é a
// mesma razão de `keysOf(prefs)` existir para o #hud-cd. `body[data-pointer]` é escrito pelo app (a medida
// fina é decisão do CSS), então lê-se de lá em vez de duplicar um matchMedia aqui.
const dedo = () => typeof document !== "undefined" && document.body.dataset.pointer === "coarse";

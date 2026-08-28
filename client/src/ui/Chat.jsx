// Painel de chat, à ESQUERDA e por cima do canvas (dentro de #hud, então some sozinho fora da partida).
// Enter abre o campo, Esc fecha. Enquanto o campo tem foco o teclado do jogo fica mudo — quem faz isso é o
// `inInput()` do game/input/Keyboard.js, de graça: digitar "espaço" não divide o planeta.
// As linhas somem sozinhas depois de CHAT.FADE_MS: o chat não pode virar uma parede permanente em cima do jogo.
// O escopo (sala ou equipe) é decidido no SERVIDOR pelo modo; aqui só se mostra qual é.
import React, { useEffect, useRef, useState } from "react";
import { CHAT, MODE } from "@planet/shared";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { gameRef } from "../state/game.js";
import { useLabels } from "../hooks/useTheme.js";

export default function Chat({ h }) {
  const LB = useLabels();
  const prefs = useStore(app, s => s.session.prefs);
  const game = useStore(gameRef, s => s.game);
  const [open, setOpen] = useState(false), [text, setText] = useState("");
  const [tick, setTick] = useState(0);
  const inp = useRef(null);
  const linhas = h.chat || [];
  // Enter abre; o listener é da janela porque o painel não tem foco enquanto se joga
  useEffect(() => {
    if (prefs.chat === false) return;
    const kd = e => {
      const alvo = document.activeElement, digitando = alvo && /INPUT|TEXTAREA/.test(alvo.tagName);
      if (e.code === "Enter" && !digitando) { e.preventDefault(); setOpen(true); setTimeout(() => inp.current && inp.current.focus(), 0); }
      else if (e.code === "Escape" && digitando) { setOpen(false); setText(""); alvo.blur(); }
    };
    addEventListener("keydown", kd); return () => removeEventListener("keydown", kd);
  }, [prefs.chat]);
  // relógio só para o fade: as linhas somem pela idade, e sem isto elas ficariam eternas até chegar outra
  useEffect(() => { if (!linhas.length) return; const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, [linhas.length]);
  if (prefs.chat === false) return null;
  const agora = Date.now();
  const vivas = linhas.filter(l => open || agora - l.at < CHAT.FADE_MS);
  const equipe = h.mode === MODE.SURVIVAL && h.team >= 0;
  const enviar = () => {
    const t = text.trim();
    if (t && game && game.sendChat) game.sendChat(t);
    setText(""); setOpen(false); if (inp.current) inp.current.blur();
  };
  return <div id="chat" className={(open ? "open" : "") + (vivas.length ? "" : " quiet")}>
    <div className="chat-head"><b>{LB.chatTitle}</b>{equipe ? <i className="chat-scope">{LB.chatTeam}</i> : null}</div>
    <div className="chat-lines" data-n={vivas.length}>
      {vivas.map((l, i) => <div key={l.at + ":" + i} className={"chat-line" + (l.mine ? " mine" : "") + (l.slot < 0 ? " sys" : "")}>
        {l.slot >= 0 ? <b>{l.name}</b> : null}<span>{l.text}</span>
      </div>)}
    </div>
    {open
      ? <input ref={inp} className="chat-input" maxLength={CHAT.MAX_CHARS} placeholder={LB.chatPlaceholder} value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); enviar(); } else if (e.key === "Escape") { setOpen(false); setText(""); e.currentTarget.blur(); } }}
          onBlur={() => setOpen(false)} />
      : <button className="chat-open" onClick={() => { setOpen(true); setTimeout(() => inp.current && inp.current.focus(), 0); }}>{LB.chatHint}</button>}
  </div>;
}

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
import React from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { setPause, leaveGame, flushPrefs } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { PREFS } from "./prefsTable.js";
import { PrefRow } from "./Prefs.jsx";

// as chaves que valem em partida, na ordem em que se procura por elas
const RAPIDAS = ["muted", "volume", "music", "musicVolume", "quality", "reduceMotion", "showNames", "showMinimap"];
const ITENS = RAPIDAS.map(k => PREFS.flatMap(g => g.items).find(it => it.key === k)).filter(Boolean);

export default function Pause({ on }) {
  const LB = useLabels(); const prefs = useStore(app, s => s.session.prefs);
  // fechar dá flush nas prefs: `setPref` persiste com 600 ms de debounce, e voltar ao jogo e fechar a aba
  // dentro desse tempo perderia a escolha sem nada na tela dizendo por quê.
  const fecha = () => { flushPrefs(); setPause(false); };
  return <div className={"overlay" + (on ? " on" : "")} id="s-pause"
    onClick={e => { if (e.target === e.currentTarget) fecha(); }}>
    {on ? <div className="card modal pause" role="dialog" aria-modal="true" aria-label={LB.pauseTitle}>
      <div className="modal-title">{LB.pauseTitle}</div>
      <div className="pause-prefs">{ITENS.map(it => <PrefRow key={it.key} it={it} v={prefs[it.key]} pfx="pause-" />)}</div>
      <div className="modal-actions pause-actions">
        <button className="btn-secondary" id="pause-exit" data-go="lobby" onClick={() => { flushPrefs(); leaveGame("lobby"); }}>{LB.exitMatch}</button>
        <button className="btn-primary" id="pause-resume" onClick={fecha} autoFocus>{LB.resume}</button>
      </div>
    </div> : null}</div>;
}

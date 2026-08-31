// ── SERVIDOR FORA (só no pacote de portal) ────────────────────────────────────
// No site, servidor fora vira modo local: o jogador continua com o perfil dele, joga contra bots e o
// aviso é um toast. Num portal isso não serve — ele clicou num .io para jogar com gente, e um
// single-player silencioso PARECE que funcionou, que é o pior desfecho possível.
// ⚠️ O texto não diz "você está offline": a internet dele está boa, o servidor é que é nosso. Dizer o
//    contrário manda a pessoa reiniciar o roteador por causa de um problema que é do nosso lado.
import React from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { tentarDeNovo } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";

export default function Offline() {
  const LB = useLabels(); const on = useStore(app, s => s.servidorFora);
  return <div className={"overlay" + (on ? " on" : "")} id="s-offline">{on ? <div className="card modal reconn" role="alertdialog" aria-live="assertive">
    <div className="modal-title rc-title">{LB.serverDownTitle}</div>
    <div className="rc-sub">{LB.serverDownSub}</div>
    <button className="btn-primary" onClick={tentarDeNovo}>{LB.retry}</button>
  </div> : null}</div>;
}

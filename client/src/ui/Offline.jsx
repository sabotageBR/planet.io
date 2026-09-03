// ── O AVISO QUE FICA: servidor fora, ou ESTA build para trás ───────────────────
// No site, servidor fora vira modo local: o jogador continua com o perfil dele, joga contra bots e o
// aviso é um toast. Num portal isso não serve — ele clicou num .io para jogar com gente, e um
// single-player silencioso PARECE que funcionou, que é o pior desfecho possível.
// ⚠️ O texto não diz "você está offline": a internet dele está boa, o servidor é que é nosso. Dizer o
//    contrário manda a pessoa reiniciar o roteador por causa de um problema que é do nosso lado.
// O segundo motivo (`desatualizado`) é a outra ponta da compatibilidade de versão: o servidor não tranca
// mais ninguém por causa do protocolo (ele ECOA a versão do cliente), então quando ainda assim chega aqui
// é porque a build local ficou para trás DE VERDADE — e num portal recarregar não conserta, porque o
// bundle é uma cópia hospedada por eles. Por isso o texto e o botão mudam com o motivo.
import React from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { tentarDeNovo } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { PORTAL } from "../portal/flags.js";

export default function Offline() {
  const LB = useLabels();
  const fora = useStore(app, s => s.servidorFora), velho = useStore(app, s => s.desatualizado);
  const on = fora || velho;
  const titulo = velho ? LB.outdatedTitle : LB.serverDownTitle;
  const sub = velho ? (PORTAL ? LB.outdatedSubPortal : LB.outdatedSub) : LB.serverDownSub;
  // No site a saída é recarregar: o bundle novo está a um GET de distância. No portal o reload traz o
  // MESMO arquivo, então o que sobra é refazer o boot — o servidor pode ter voltado a aceitar esta versão.
  const recarrega = velho && !PORTAL;
  return <div className={"overlay" + (on ? " on" : "")} id="s-offline">{on ? <div className="card modal reconn" role="alertdialog" aria-live="assertive">
    <div className="modal-title rc-title">{titulo}</div>
    <div className="rc-sub">{sub}</div>
    <button className="btn-primary" onClick={recarrega ? () => location.reload() : tentarDeNovo}>{recarrega ? LB.reload : LB.retry}</button>
  </div> : null}</div>;
}

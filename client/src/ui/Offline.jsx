// ── O AVISO QUE FICA: servidor fora, build para trás, ou removido por inatividade ──
// No site, servidor fora vira modo local: o jogador continua com o perfil dele, joga contra bots e o
// aviso é um toast. Num portal isso não serve — ele clicou num .io para jogar com gente, e um
// single-player silencioso PARECE que funcionou, que é o pior desfecho possível.
// ⚠️ O texto não diz "você está offline": a internet dele está boa, o servidor é que é nosso. Dizer o
//    contrário manda a pessoa reiniciar o roteador por causa de um problema que é do nosso lado.
// O segundo motivo (`desatualizado`) é a outra ponta da compatibilidade de versão: o servidor não tranca
// mais ninguém por causa do protocolo (ele ECOA a versão do cliente), então quando ainda assim chega aqui
// é porque a build local ficou para trás DE VERDADE — e num portal recarregar não conserta, porque o
// bundle é uma cópia hospedada por eles. Por isso o texto e o botão mudam com o motivo.
// O terceiro (`expulsoInativo`) é o único que não é falha de nada: o servidor removeu o jogador da sala
// porque ele passou minutos sem um gesto. Ele cabe aqui pela mesma razão dos outros dois — um toast de 3 s
// some antes de a pessoa voltar ao teclado, e quem foi removido por estar ausente é, por definição, quem
// não estava olhando. A saída dele é JOGAR: a flag é limpa e a vida segue.
import React from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { tentarDeNovo, play } from "../state/actions.js";
import { preenche } from "../i18n/index.js";
import { useLabels } from "../hooks/useTheme.js";
import { PORTAL } from "../portal/flags.js";

export default function Offline() {
  const LB = useLabels();
  const fora = useStore(app, s => s.servidorFora), velho = useStore(app, s => s.desatualizado);
  const parado = useStore(app, s => s.expulsoInativo);
  const on = fora || velho || parado > 0;
  const titulo = parado ? LB.idleTitle : velho ? LB.outdatedTitle : LB.serverDownTitle;
  const sub = parado ? preenche(LB.idleSub, { n: parado })
    : velho ? (PORTAL ? LB.outdatedSubPortal : LB.outdatedSub) : LB.serverDownSub;
  // No site a saída é recarregar: o bundle novo está a um GET de distância. No portal o reload traz o
  // MESMO arquivo, então o que sobra é refazer o boot — o servidor pode ter voltado a aceitar esta versão.
  const recarrega = velho && !PORTAL;
  // A inatividade não é falha: não há o que "tentar de novo" nem o que recarregar — há uma partida para
  // jogar. Por isso o botão dela entra na sala em vez de refazer o boot.
  const acao = parado ? () => { app.update({ expulsoInativo: 0 }); play({}); }
    : recarrega ? () => location.reload() : tentarDeNovo;
  return <div className={"overlay" + (on ? " on" : "")} id="s-offline">{on ? <div className="card modal reconn" role="alertdialog" aria-live="assertive">
    <div className="modal-title rc-title">{titulo}</div>
    <div className="rc-sub">{sub}</div>
    <button className="btn-primary" onClick={acao}>{parado ? LB.play : recarrega ? LB.reload : LB.retry}</button>
  </div> : null}</div>;
}

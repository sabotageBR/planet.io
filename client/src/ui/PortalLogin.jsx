// ── ENTRAR COM A CONTA DO PORTAL ──────────────────────────────────────────────
// A CrazyGames exige, na letra: botão de login "in the top right corner, not as the main CTA", o prompt
// só abrindo se o jogador CLICAR, e dá para jogar como convidado sem login nenhum. Este botão é isso, e
// nada além disso — quem entra logado no site deles nem chega a vê-lo, porque o `boot()` já trocou o
// token deles pelo nosso antes do primeiro render (ver `entraPeloPortal` em state/actions.js).
//
// ⚠️ Só existe no pacote de portal (`PORTAL`) e só quando o SDK diz que HÁ conta a oferecer
//    (`isUserAccountAvailable` é falso quando eles embutem o jogo em domínio de terceiro).
// ⚠️ E some assim que a conta deixa de ser convidada: a partir daí o jogador já é ele mesmo aqui.
import React, { useEffect, useState } from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { loginDoPortal } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { PORTAL } from "../portal/flags.js";
import { portal } from "../portal/index.js";

export default function PortalLogin() {
  const LB = useLabels();
  const kind = useStore(app, s => (s.session.user || {}).kind);
  const tela = useStore(app, s => s.screen);
  const [tem, setTem] = useState(false);
  // o SDK responde depois do primeiro render; uma consulta só, quando ele fica pronto
  useEffect(() => { if (PORTAL) portal.pronto.then(() => setTem(portal.temConta)); }, []);
  if (!PORTAL || !tem || kind !== "guest" || tela === "game") return null;
  return <button className="portal-login" onClick={loginDoPortal}>{LB.portalLogin}</button>;
}

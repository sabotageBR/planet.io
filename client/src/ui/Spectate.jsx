// ── ASSISTIR A UMA SALA EM ANDAMENTO ─────────────────────────────────────────
// O jogo só tinha espectador-por-MORTE. A máquina toda já existia — `{t:"spectate"}` escolhe o alvo, a AOI
// da sessão o segue (`net/snapshot.js`) e o `#hud.spec` já é o HUD de quem assiste —, e o que faltava era a
// porta: `acceptsJoin()` recusa o Battle Royale em andamento com `'started'`, que é exatamente a partida que
// alguém quer ver. Quem abre a porta é `Room.acceptsSpectator`/`joinSpec`, no servidor.
//
// ⚠️ O ESPECTADOR NUNCA VIRA JOGADOR SOZINHO. Nem quando abre vaga, nem no fim da rodada — sair é decisão
// dele, e é isso que dispensa promover uma sessão sem corpo a jogador no meio da partida (e a corrida pela
// vaga que viria junto). Quem quer jogar clica em SAIR e entra pela porta de sempre.
//
// A BARRA em si (e o estado de quem assiste) mora em ui/SpecBar.jsx: ela é a mesma da tela de morte
// recolhida, e era o mesmo código escrito duas vezes.
import React from "react";
import { leaveGame } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { SpecBar, SpecWho, useSpec } from "./SpecBar.jsx";

export default function Spectate({ on }) {
  const LB = useLabels();
  const { spec, mapa, trocar, verMapa } = useSpec(on);
  if (!on) return null;
  return <SpecBar id="s-spec" rotulo={LB.watchTitle} quem={<SpecWho spec={spec} trocar={trocar} LB={LB} />}>
    <button className={"btn-secondary" + (mapa === "map" ? " on" : "")} onClick={() => verMapa("map")}>{mapa === "map" ? LB.mapClose : LB.mapOpen}</button>
    <button className={"btn-secondary" + (mapa === "live" ? " on" : "")} onClick={() => verMapa("live")}>{mapa === "live" ? LB.liveClose : LB.liveOpen}</button>
    <button className="btn-primary" data-go="lobby" onClick={() => leaveGame("lobby")}>{LB.watchLeave}</button>
  </SpecBar>;
}

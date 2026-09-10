// ── O PRÊMIO DA TELA DE MORTE ─────────────────────────────────────────────────
// UM bloco para as três mecânicas pedidas — a skin que a partida DESTRAVOU, a skin por DESEMPENHO (que
// chega pela mesma porta: as duas são `rewards.skinsUnlocked`) e a oferta de ANÚNCIO. Empilhar três blocos
// numa tela que estava com os botões fora da dobra seria desfazer o item 1 para entregar o item 4; quem
// escolhe qual aparece é `ui/premio.js`, puro e testado.
//
// ⚠️ ALTURA ESTÁVEL, e é por isso que o `coins` e a decisão são congelados no MOUNT. As recompensas chegam
// ~0,5-1 s DEPOIS da tela (fila + transação no Postgres), e `onRewards` reescreve `session.user.coins` no
// mesmo movimento: sem congelar, o bloco NASCE depois do primeiro frame e empurra o rodapé para baixo —
// exatamente o defeito que o rodapé sticky acabou de fechar. O molde é `recMass`/`recScore`, fotografados
// em `onDead` pelo mesmo motivo.
// ⚠️ Quando a skin CHEGA, ela SUBSTITUI a oferta no mesmo nó (não empilha), e quando não vem nada o bloco
// COLAPSA — colapsar aproxima o rodapé, nunca o afasta.
import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { escolhePremio } from "./premio.js";
import { ganharSkinAnuncio } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import SkinPreview from "./SkinPreview.jsx";
import * as portal from "../portal/index.js";

export default function DeadPrize({ on }) {
  const LB = useLabels();
  const r = useStore(app, s => s.rewards);
  const skins = useStore(app, s => s.session.skins);
  const [pedindo, setPedindo] = useState(false);
  // A OFERTA é decidida UMA vez, na abertura da tela. Reavaliá-la a cada render a faria trocar quando as
  // recompensas chegassem (elas mexem em `coins` e em `skins`), e uma oferta que muda entre a morte e o
  // clique é a forma mais rápida de o jogador achar que foi enganado.
  const oferta = useRef(null);
  useEffect(() => {
    if (!on) { oferta.current = null; setPedindo(false); return; }
    const s = app.get().session;
    oferta.current = escolhePremio(null, s.skins, portal.temRecompensa, !!(s.user && s.user.id));
  }, [on]);
  if (!on) return null;
  // A skin destravada ganha da oferta — e ela só é conhecida quando `rewards` chega.
  const premio = escolhePremio(r, skins, false, false) || oferta.current;
  if (!premio) return null;

  const ganhou = premio.tipo === "skin";
  const jaTem = (skins || []).includes(premio.id);
  return <div className={"dd-premio" + (ganhou ? " ganhou" : "")}>
    <div className="dp-disco"><SkinPreview skin={premio.skin} r={30} size={112} className="" /></div>
    <div className="dp-txt">
      <i>{ganhou ? LB.prizeUnlocked : LB.prizeOffer}</i>
      <b>{premio.skin.name}</b>
      {/* ⚠️ O texto do equipar não é enfeite: a skin da VIDA é resolvida no join, e `Room.respawn` repassa
          a da vida anterior — ela aparece na PRÓXIMA vida. Um botão que parece não fazer nada é pior que
          botão nenhum, então a tela DIZ isso em vez de deixar o jogador descobrir. */}
      {ganhou || jaTem ? <em>{LB.prizeEquipNote}</em> : null}
    </div>
    {ganhou || jaTem ? null
      : <button className="btn-primary dp-ad" disabled={pedindo}
          onClick={async () => { setPedindo(true); try { await ganharSkinAnuncio(premio.id); } finally { setPedindo(false); } }}>
          {pedindo ? LB.saving : LB.prizeWatch}
        </button>}
  </div>;
}

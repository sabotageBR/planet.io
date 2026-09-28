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
import { pedagioLiberado } from "../portal/primeiraVida.js";
import { ganharSkinAnuncio } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { preenche } from "../i18n/index.js";
import { skinName } from "../i18n/catalog.js";
import SkinPreview from "./SkinPreview.jsx";
// ⚠️ `{ portal }`, NUNCA `* as portal`: a fachada é um OBJETO exportado com esse nome, então a importação
// de namespace faz `portal.temRecompensa` ler um export que não existe — `undefined`, em silêncio, e a
// oferta de anúncio NUNCA aparecia em portal nenhum. Quem acusou foi o empacotador (o Rollup avisa
// "temRecompensa is not exported by src/portal/index.js"); nada quebrava em dev, e este era o único
// arquivo do projeto que importava a fachada assim.
import { portal } from "../portal/index.js";

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
    const a = app.get(), s = a.session;
    // ⚠️ ZERO ANÚNCIO NAS DUAS PRIMEIRAS VIDAS, RECOMPENSADO INCLUSIVE (`pedagioLiberado`): é o mesmo
    // portão do midroll, e vale aqui porque o custo do pedido é o mesmo — o jogador que ainda não sabe se
    // gosta do jogo levando uma proposta de vídeo. O PRÊMIO (uma skin que a partida destravou) não passa
    // por isto: ele é um fato consumado, não uma venda.
    const pedagio = pedagioLiberado({ mortes: a.mortes, kills: a.kills, sessaoMs: performance.now() });
    // ⚠️ `stats.games` JÁ inclui a partida que acabou de acontecer: `onDead` o incrementa de forma otimista
    // antes de agendar esta tela, porque o `{t:"rewards"}` com o número autoritativo chega ~1 s DEPOIS dela
    // abrir. Sem aquele incremento a barra mostraria sempre o passo anterior — 0/3 na morte que fez a 1ª.
    oferta.current = escolhePremio(null, s.skins, pedagio && portal.temRecompensa,
      !!(s.user && s.user.id), (s.stats || {}).games | 0);
  }, [on]);
  if (!on) return null;
  // A skin destravada ganha da oferta — e ela só é conhecida quando `rewards` chega.
  // ⚠️ `logado:false` aqui é o que mantém esta chamada sendo SÓ o detector do ramo 1: com `true` ela
  // devolveria o progresso e passaria por cima do que foi congelado no mount, voltando a trocar o bloco
  // debaixo do jogador — que é o defeito que o congelamento existe para fechar.
  const premio = escolhePremio(r, skins, false, false) || oferta.current;
  if (!premio) return null;

  const ganhou = premio.tipo === "skin";
  const progresso = premio.tipo === "progresso";
  const jaTem = (skins || []).includes(premio.id);
  // O PROGRESSO é o mesmo nó, com a mesma altura: disco + texto, e a barra no lugar do botão. Trocar a
  // altura entre os estados moveria o rodapé sticky, que é o que `min-height:64px` existe para impedir.
  if (progresso) {
    const p = Math.max(0, Math.min(1, premio.feitas / premio.alvo));
    return <div className="dd-premio prog">
      <div className="dp-disco"><SkinPreview skin={premio.skin} r={30} size={112} className="" /></div>
      <div className="dp-txt">
        <i>{preenche(LB.prizeProgress, { n: premio.alvo })}</i>
        <b>{skinName(premio.skin)}</b>
        {/* A barra é o markup do Perfil (`.ach-bar` + `--p`), para as duas telas falarem a mesma língua. */}
        <span className="ach-bar" role="progressbar" aria-valuemin={0} aria-valuemax={premio.alvo}
          aria-valuenow={premio.feitas}><i style={{ "--p": p }} /></span>
      </div>
      <div className="dp-passo">{premio.feitas}<span>/{premio.alvo}</span></div>
    </div>;
  }
  return <div className={"dd-premio" + (ganhou ? " ganhou" : "")}>
    <div className="dp-disco"><SkinPreview skin={premio.skin} r={30} size={112} className="" /></div>
    <div className="dp-txt">
      <i>{ganhou ? LB.prizeUnlocked : LB.prizeOffer}</i>
      <b>{skinName(premio.skin)}</b>
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

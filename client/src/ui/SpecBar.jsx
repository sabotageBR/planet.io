// ── A BARRA DE QUEM ASSISTE ───────────────────────────────────────────────────
// Extraída, e não copiada uma terceira vez: `ui/Dead.jsx` e `ui/Spectate.jsx` já eram o MESMO código duas
// vezes — o mesmo throttle de 200 ms sobre o `hudStore`, o mesmo par de setas, o mesmo listener de teclado
// com as mesmas duas guardas. A terceira cópia (a tela de morte recolhida) divergiria na primeira correção,
// e as guardas de teclado são justamente o tipo de detalhe que se perde numa cópia.
//
// ⚠️ ELA É UMA BARRA, NÃO UM CARTÃO, e isso é o desenho: o ponto inteiro de assistir é VER a sala, e um
// painel no meio da tela tapa o que se veio olhar. Mora no rodapé, com o que se usa — de quem é a câmera,
// o mapa para escolher outro, e a saída.
import React, { useEffect, useMemo } from "react";
import { useSyncExternalStore } from "react";
import { gameRef } from "../state/game.js";
import { useStore, throttleStore } from "../state/store.js";

const EMPTY = {}, EMPTY_STORE = { subscribe: () => () => {}, get: () => EMPTY };

/**
 * O estado de quem assiste: quem está na câmera, que vista está aberta, e os dois comandos.
 * @param {boolean} on a tela que usa a barra está no ar? (fora dela o teclado não é ouvido)
 */
export function useSpec(on) {
  const game = useStore(gameRef, s => s.game);
  // O HUD emite a 60 Hz e a barra tem cinco campos: sem throttle, cinco re-renders por frame.
  const store = useMemo(() => (game && game.hudStore ? throttleStore(game.hudStore, 200) : EMPTY_STORE), [game]);
  const h = useSyncExternalStore(store.subscribe, store.get, store.get) || {};
  const mapa = h.map || "";
  const trocar = dir => { if (game && game.spectate) game.spectate({ dir }); };
  const verMapa = modo => { if (game && game.toggleMap) game.toggleMap(modo); };
  useEffect(() => {
    if (!on || !game || !game.spectate) return;
    // ⚠️ AS DUAS GUARDAS SÃO OBRIGATÓRIAS, e nenhuma é zelo.
    // `e.repeat` PRIMEIRO: cada seta vira um {t:"spectate"}, que divide com o `view` e o `ping` o balde de
    // NET.RATE_JSON (5/s, burst 10) — e três rejeições em 10 s ENCERRAM a conexão. O auto-repeat do teclado
    // dispara ~25 vezes por segundo, então SEGURAR a seta derrubava o jogador em menos de 1 s.
    // A de campo de texto: quem assiste continua com o chat aberto, e "M" no meio de uma palavra abriria o
    // mapa em vez de escrever a letra.
    const kd = e => { if (e.repeat) return; const a = document.activeElement; if (a && /INPUT|TEXTAREA/.test(a.tagName)) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); trocar(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); trocar(1); }
      else if (e.key === "m" || e.key === "M") { e.preventDefault(); verMapa("map"); }
      // A vista ao vivo é o L, e não o T: o T abre o CHAT, e quem morreu continua falando.
      else if (e.key === "l" || e.key === "L") { e.preventDefault(); verMapa("live"); }
      else if (e.key === "Escape" && game.showMap && mapa) { e.preventDefault(); game.showMap(""); } };
    addEventListener("keydown", kd); return () => removeEventListener("keydown", kd);
  }, [on, game, mapa]);
  // Saiu da tela: fecha o mapa, senão ele volta aberto na próxima vez.
  useEffect(() => { if (!on && game && game.showMap) game.showMap(""); }, [on, game]);
  return { game, h, spec: h.spec, mapa, trocar, verMapa };
}

/** ‹ de quem é a câmera ›. O mesmo bloco nos três lugares que assistem. */
export const SpecWho = ({ spec, trocar, LB }) => <div className="sb-quem">
  <button className="spec-arrow" onClick={() => trocar(-1)} aria-label={LB.specPrev}>‹</button>
  <div className="spec-who"><i>{LB.watching}</i><b>{(spec && spec.name) || "—"}</b></div>
  <button className="spec-arrow" onClick={() => trocar(1)} aria-label={LB.specNext}>›</button>
</div>;

/** A barra em si: quem se assiste à esquerda, as ações à direita. */
export const SpecBar = ({ id, rotulo, children, quem }) =>
  <div id={id} className="spec-bar" role="region" aria-label={rotulo}>
    {quem}
    <div className="sb-acoes">{children}</div>
  </div>;

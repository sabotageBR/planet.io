// ── O CENÁRIO DAS TELAS DE MENU ───────────────────────────────────────────────
// Fundo estrelado + planetas, lua e mísseis flutuando, atrás do painel. É o que o jogador vê antes de
// entrar e depois que a rodada acaba.
//
// ⚠️ Componente BURRO de propósito: sem hooks, sem store, sem props — ele monta uma vez e nunca
// re-renderiza. Tudo o que muda (qual fundo, quais sprites aparecem, quando ele some) é decidido por CSS
// a partir de `html[data-theme]` e `body[data-shell|data-screen|data-mode]`, que já existem. Um
// componente que reagisse ao tema re-montaria seis `<img>` a cada virada do relógio, e o navegador
// perderia a decodificação de cada uma.
//
// ⚠️ Ele mora ENTRE o `#game` e o `#hud` (ver App.jsx) com `z-index:1`: acima do canvas do Pixi, abaixo
// de HUD, telas e overlays. Não pode ganhar `transform`/`filter` — isso tornaria o `#app` um bloco
// contentor e capturaria o modal da loja, que é um portal (ver Shop.jsx).
import React from "react";
import logo from "../assets/scene/logo.webp";
import planetaL from "../assets/scene/planeta-laranja.webp";
import planetaR from "../assets/scene/planeta-azul.webp";
import lua from "../assets/scene/lua.webp";
import missil from "../assets/scene/missil.webp";

// width/height são os do arquivo: sem eles o navegador não reserva a caixa e a página salta quando a
// imagem chega. `aria-hidden` porque isto é decoração — quem lê a tela por áudio não ganha nada aqui.
export default function Scene() {
  return <div id="cena" aria-hidden="true">
    <img className="sprite logo"      src={logo}     alt="" width="992" height="360" fetchPriority="high" decoding="async" />
    <img className="sprite planeta-l" src={planetaL} alt="" width="619" height="640" decoding="async" />
    <img className="sprite planeta-r" src={planetaR} alt="" width="640" height="616" decoding="async" />
    <img className="sprite lua"       src={lua}      alt="" width="486" height="609" decoding="async" />
    <img className="sprite missil"    src={missil}   alt="" width="256" height="130" decoding="async" />
    <img className="sprite missil-2"  src={missil}   alt="" width="256" height="130" decoding="async" />
  </div>;
}

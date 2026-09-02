// ── GamePix (a porta de DESENVOLVEDOR; a de publisher é o /ads.txt, ver docs/spec/portais.md) ──────
// O zip sobe em my.gamepix.com e o jogo passa a rodar em
// `https://games.builds.gamepix.com/<gameId>/<version>/index.html?…&lang=…&namespace=…`, dentro do
// player deles (`play.gamepix.com/<namespace>/embed`). MEDIDO: o `GameFrame` do player monta essa URL a
// partir de `CDNGamesSrc`, e a API pública (`api.gamepix.com/v3/games/ns/<namespace>`) entrega o
// `gameId` e a `version` que entram nela.
//
// ⚠️ `GamePix.loaded()` É O PORTÃO DE TUDO. Enquanto ele não completa, TODO o resto do SDK responde
//    `METHOD_BEFORE_LOADED` e ainda loga um ERROR — `interstitialAd()` resolve na hora com
//    `{success:false}` e nenhum anúncio jamais toca. É a falha mais cara possível aqui, porque é
//    silenciosa e do lado deles: o jogo funciona, o revisor não vê anúncio nenhum. Daí o `carregado()`,
//    memoizado, chamado pelo `carregou()` da fachada E esperado dentro do `anuncio()`.
//    (Dentro do player ele espera o `LOADED_EXECUTED` do pai, com um relógio próprio de 10 s.)
// ⚠️ `on.pause`/`on.resume`/`on.soundOn`/`on.soundOff` são NOSSOS — o SDK nasce com eles indefinidos e
//    escreve "pause not defined" no console quando o player manda pausar e ninguém escutou. Não são
//    eventos: são quatro campos que se ATRIBUEM (é o que fazem os jogos que já estão lá).
// ⚠️ `gameStop()` NÃO é o par de `gameAction()`: em modo de teste (localhost, `file:` ou a QA tool
//    deles, que se anuncia por `window.name`/`referrer`) ele DESENHA O ANÚNCIO — o mesmo overlay preto
//    com "skip ad" do `interstitialAd()`. Como a fachada chama `jogoParou()` logo ANTES de todo
//    anúncio, ligá-lo aqui daria dois anúncios seguidos na tela do revisor. Fica de fora, de propósito.
// ⚠️ O arquivo é `gpx.js`, não `gamepix.js`, pela mesma regra que proíbe `ads.js` aqui: o nome vira a
//    URL do chunk e há filtro de bloqueador que casa palavra de publicidade no caminho.
import { carregaScript } from "./script.js";
import { silenciaAnuncio } from "../audio/index.js";
const SRC = import.meta.env.VITE_GPX_SDK_URL || "https://integration.gamepix.com/sdk/v3/gamepix.sdk.js";
const gp = () => window.GamePix || null;

export async function criar({ pausou, retomou }) {
  if (!(await carregaScript(SRC, "gamepix-sdk"))) return null;
  const g = gp(); if (!g || typeof g.interstitialAd !== "function") return null;

  let meuAnuncio = false;   // o anúncio em curso foi pedido por NÓS?
  let mudoDoSite = false;   // o mudo do PLAYER deles, que tem prioridade sobre o ajuste interno
  let pronto = null;
  const carregado = () => (pronto || (pronto = Promise.resolve()
    .then(() => (g.loaded ? g.loaded() : null)).catch(() => {})));

  // ⚠️ Enquanto o anúncio é NOSSO, os quatro calam a boca: a fachada já cala o som e levanta a tela de
  // pausa em volta dele, e o SDK dispara `on.pause`/`on.resume` no meio disso. Repassar os dois
  // caminhos é a receita do bug que a CrazyGames ensinou — a ordem entre o `retomou()` da fachada e o
  // do SDK decide se o jogador fica mudo para sempre. Quem devolve o estado do site, por último, é
  // `reaplica()`. O que sobra para os callbacks é o que só o player sabe: a aba escondida e o botão de
  // som DELES.
  g.on = g.on || {};
  g.on.pause = () => { if (!meuAnuncio) pausou(); };
  g.on.resume = () => { if (!meuAnuncio) retomou(); };
  g.on.soundOff = () => { mudoDoSite = true; if (!meuAnuncio) silenciaAnuncio(true); };
  g.on.soundOn = () => { mudoDoSite = false; if (!meuAnuncio) silenciaAnuncio(false); };

  return {
    carregou() { carregado(); },
    // GAME_ACTION é só um evento de sessão no player deles (não abre anúncio, não pausa)
    jogoComecou() { try { if (g.gameAction) g.gameAction(); } catch { /* medir não derruba o jogo */ } },
    reaplica() { meuAnuncio = false; silenciaAnuncio(mudoDoSite); },
    async anuncio() {
      await carregado();
      meuAnuncio = true;
      // `interstitialAd()` SEMPRE resolve `{success,message}` e nunca rejeita: sem player pai vem
      // `"GamePix Player not found"` na hora, e dentro dele a promessa fecha no `INTERSTITIAL_AD_EXECUTED`
      // do pai. O relógio de `PORTAL.AD_MS` da fachada cobre o caso de o pai nunca responder.
      try { await g.interstitialAd(); } catch { /* nunca pode segurar o botão JOGAR */ }
    },
  };
}

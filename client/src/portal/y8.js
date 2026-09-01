// ── Y8 ────────────────────────────────────────────────────────────────────────
// O zip sobe pelo painel de desenvolvedor (developer.y8.com, aba Builds) e o jogo passa a rodar em
// `https://storage.y8.com/y8-studio/html5/<estúdio>/<jogo>/index.html` — MEDIDO num jogo de lá, e é
// ESSA a origem que precisa estar em `ALLOWED_ORIGINS`. `www.y8.com` é só a página em volta do iframe;
// quem faz as chamadas à nossa API é o documento de dentro.
//
// ⚠️ O SDK deles é a **Ad Placement API do Google** (AFP) com outra roupa: `preloadAdBreaks`, os quatro
//    `type` ("start"|"pause"|"next"|"browse") e o `adBreakDone(info)` com `breakStatus` vêm de lá. Daí
//    o mapa preroll→"start" e midroll→"next": "start" é, na definição deles, o anúncio de ENTRADA da
//    sessão, que é exatamente o que `play()` faz na primeira vez.
// ⚠️ O `y8sdk.ready` PODE JÁ TER PASSADO quando este módulo roda — o adaptador é um chunk sob demanda e
//    o script pode vir do cache. Por isso o listener é registrado ANTES do `carregaScript` e, depois
//    dele, ainda se chama `emitReadyEvent()`, que existe na API deles só para esse caso. Sem as duas
//    coisas o `await` fica pendurado, e promessa pendurada aqui é o botão JOGAR morto — o pior defeito
//    que este diretório pode produzir. Quem tampa de vez é o `PORTAL.SDK_MS` da fachada.
// ⚠️ `autoLogin: false` é decisão, não descuido: o snippet do painel pede `true`, mas a conta aqui é a
//    do warspace.io e nós não consumimos o `onAuth` — pedir uma autenticação para jogar o resultado
//    fora é chamada de rede e risco de UI de graça. Integrar a conta do Y8 de verdade é outro trabalho,
//    do tamanho do que a CrazyGames pediu (ver `server/src/auth/crazygames.js`).
// ⚠️ Este adaptador NÃO usa `pausou`/`retomou`. Diferente da GD — que pausa o jogo por conta própria
//    com `SDK_GAME_PAUSE` —, o Y8 só anuncia quando NÓS chamamos, e a fachada já cala o som antes e
//    levanta a tela de pausa depois. Repetir daqui seria fazer o mesmo trabalho duas vezes.
import { carregaScript } from "./script.js";
const SRC = import.meta.env.VITE_Y8_SDK_URL || "https://cdn.y8.com/minimal-sdk/2-0/y8.min.js";
const APP_ID = import.meta.env.VITE_Y8_APP_ID || "";
const GAME_ID = import.meta.env.VITE_Y8_GAME_ID || "";
const TIPO = { preroll: "start", midroll: "next" };

export async function criar() {
  if (!APP_ID || !GAME_ID) return null;
  const pronto = new Promise(ok => window.addEventListener("y8sdk.ready", () => ok(), { once: true }));
  if (!(await carregaScript(SRC, "y8-sdk"))) return null;
  try { if (window.y8 && window.y8.emitReadyEvent) window.y8.emitReadyEvent(); } catch { /* já pronto */ }
  await pronto;
  const sdk = window.y8 && window.y8.sdk ? window.y8.sdk() : null;
  if (!sdk || typeof sdk.init !== "function") return null;
  // `sound:"on"` é o que a Ad Placement API chama de "o jogo está com som neste momento" — e está: quem
  // cala é a fachada, no `aoPausar`, um instante antes do anúncio aparecer.
  try { sdk.init({ appId: APP_ID, autoLogin: false },
    { gameId: GAME_ID, preloadAdBreaks: "on", sound: "on", onReady() {} }); }
  catch { return null; }

  return {
    anuncio(tipo) {
      if (typeof sdk.showAd !== "function") return Promise.resolve();
      return new Promise(ok => {
        let vivo = true; const fecha = () => { if (vivo) { vivo = false; ok(); } };
        // TRÊS saídas independentes, e nenhuma basta sozinha: `afterAd` só sai quando um anúncio de
        // fato tocou, `adBreakDone` sai SEMPRE (inclusive no "não havia anúncio") e a promessa pode
        // rejeitar antes das duas. A quarta é o relógio da fachada.
        try {
          Promise.resolve(sdk.showAd({
            type: TIPO[tipo] || "next", name: tipo === "preroll" ? "start-game" : "respawn",
            afterAd: fecha, adBreakDone: fecha,
          })).then(fecha, fecha);
        } catch { fecha(); }
      });
    },
  };
}

// ── CrazyGames ────────────────────────────────────────────────────────────────
// Eles hospedam os arquivos e o servidor multiplayer continua sendo o nosso — é o modelo que a própria
// documentação deles descreve. O SDK aqui é mais explícito que o da GD: além do anúncio, ele quer saber
// quando o jogo CARREGA e quando a PARTIDA começa e termina, e usa isso para escolher a hora de anunciar
// e para medir. Por isso `jogoComecou/Parou` existem na fachada mesmo sem equivalente na GD.
//
// ⚠️ O anúncio deles exige, na letra da doc: "mute the audio and pause the game when the ad starts
//    (adStarted callback), and unmute the audio and continue the game when the ad finishes/fails".
//    Quem faz isso é a fachada, pelos callbacks daqui — e `adFinished` e `adError` são o MESMO desfecho
//    para nós: o jogador entra na partida de um jeito ou de outro.
// ⚠️ `requestAd` erra com `adsDisabledBasicLaunch` (jogo ainda em Basic Launch), `unfilled`, `adblock`,
//    `adCooldown` e `other`. Nenhum deles pode segurar o botão JOGAR — daí tudo cair no mesmo `fim`.
// ⚠️ `settings.muteAudio` é o mudo DO SITE deles, e a doc diz que ele tem prioridade sobre o ajuste
//    interno do jogo. Ele muda enquanto se joga (o jogador clica no alto-falante da página), e não há
//    evento documentado — daí a leitura periódica barata. Vai pelo mesmo caminho do mudo de anúncio
//    (`silenciaAnuncio`), que zera o master sem tocar em `prefs.muted`, que é escolha do jogador.
import { carregaScript } from "./script.js";
import { silenciaAnuncio } from "../audio/index.js";
const SRC = import.meta.env.VITE_CRAZY_SDK_URL || "https://sdk.crazygames.com/crazygames-sdk-v3.js";
const MUTE_MS = 2000;
const sdk = () => (window.CrazyGames && window.CrazyGames.SDK) || null;

export async function criar({ pausou, retomou }) {
  if (!(await carregaScript(SRC, "crazygames-sdk"))) return null;
  const s = sdk(); if (!s) return null;
  try { if (s.init) await s.init(); } catch { return null; }
  try { if (s.game && s.game.loadingStart) s.game.loadingStart(); } catch { /* medir não derruba o jogo */ }

  // o mudo do site deles; `emAnuncio` evita que a vigia devolva o som no meio de um anúncio
  let mudo = false, emAnuncio = false;
  setInterval(() => {
    const g = sdk(); const q = !!(g && g.game && g.game.settings && g.game.settings.muteAudio);
    if (q === mudo || emAnuncio) return;
    mudo = q; silenciaAnuncio(q);
  }, MUTE_MS);

  return {
    carregou() { const g = sdk(); if (g && g.game && g.game.loadingStop) g.game.loadingStop(); },
    jogoComecou() { const g = sdk(); if (g && g.game && g.game.gameplayStart) g.game.gameplayStart(); },
    jogoParou() { const g = sdk(); if (g && g.game && g.game.gameplayStop) g.game.gameplayStop(); },
    anuncio() {
      const g = sdk();
      if (!g || !g.ad || !g.ad.requestAd) return Promise.resolve();
      return new Promise(ok => {
        const fim = () => { emAnuncio = false; retomou(); if (mudo) silenciaAnuncio(true); ok(); };
        try { emAnuncio = true; g.ad.requestAd("midgame", { adStarted: pausou, adFinished: fim, adError: fim }); }
        catch { fim(); }
      });
    },
  };
}

// ── CrazyGames ────────────────────────────────────────────────────────────────
// Eles hospedam os arquivos e o servidor multiplayer continua sendo o nosso — é o modelo que a própria
// documentação deles descreve para jogos .io. O SDK aqui é mais explícito que o da GD: além do anúncio,
// ele quer saber quando o jogo carregou e quando a PARTIDA começa e termina, e usa isso para escolher a
// hora de anunciar. Por isso `jogoComecou/Parou` existem na fachada mesmo sem equivalente na GD.
// ⚠️ Conferir a versão do SDK no portal de desenvolvedor antes de submeter: a URL vem por env de build.
import { carregaScript } from "./script.js";
const SRC = import.meta.env.VITE_CRAZY_SDK_URL || "https://sdk.crazygames.com/crazygames-sdk-v3.js";
const sdk = () => (window.CrazyGames && window.CrazyGames.SDK) || null;

export async function criar({ pausou, retomou }) {
  if (!(await carregaScript(SRC, "crazygames-sdk"))) return null;
  const s = sdk(); if (!s) return null;
  try { if (s.init) await s.init(); } catch { return null; }
  return {
    carregou() { const g = sdk(); if (g && g.game && g.game.loadingStop) g.game.loadingStop(); },
    jogoComecou() { const g = sdk(); if (g && g.game && g.game.gameplayStart) g.game.gameplayStart(); },
    jogoParou() { const g = sdk(); if (g && g.game && g.game.gameplayStop) g.game.gameplayStop(); },
    anuncio() {
      const g = sdk();
      if (!g || !g.ad || !g.ad.requestAd) return Promise.resolve();
      return new Promise(ok => {
        // adFinished e adError são o MESMO desfecho para nós: o jogador entra na partida de um jeito ou
        // de outro. O que muda é só o áudio, e disso cuida o `retomou`.
        const fim = () => { retomou(); ok(); };
        try { g.ad.requestAd("midgame", { adStarted: pausou, adFinished: fim, adError: fim }); }
        catch { fim(); }
      });
    },
  };
}

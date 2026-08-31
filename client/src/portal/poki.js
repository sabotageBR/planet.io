// ── Poki ──────────────────────────────────────────────────────────────────────
// ⚠️ ANTES DE EMPACOTAR PARA A POKI: peça na página de Settings do jogo a CSP customizada liberando
//    `https://warspace.io` e `wss://warspace.io`. Eles servem o jogo sob uma CSP estrita, e sem essa
//    liberação TUDO vira "Refused to connect" — e você vai passar o dia depurando um CORS que está
//    certo. É a única exigência de infraestrutura que este portal tem a mais que os outros.
// A Poki também quer política de privacidade publicada; ela mora no site, e o link vai no formulário
// deles — nunca dentro do jogo (link de saída é proibido em portal).
import { carregaScript } from "./script.js";
const SRC = import.meta.env.VITE_POKI_SDK_URL || "https://game-cdn.poki.com/scripts/v2/poki-sdk.js";
const sdk = () => window.PokiSDK || null;

export async function criar({ pausou, retomou }) {
  if (!(await carregaScript(SRC, "poki-sdk"))) return null;
  const s = sdk(); if (!s) return null;
  try { if (s.init) await s.init(); } catch { return null; }
  return {
    carregou() { const g = sdk(); if (g && g.gameLoadingFinished) g.gameLoadingFinished(); },
    jogoComecou() { const g = sdk(); if (g && g.gameplayStart) g.gameplayStart(); },
    jogoParou() { const g = sdk(); if (g && g.gameplayStop) g.gameplayStop(); },
    anuncio() {
      const g = sdk();
      if (!g || !g.commercialBreak) return Promise.resolve();
      // O `commercialBreak` recebe o callback de "vai começar" e resolve no fim — com ou sem anúncio.
      return Promise.resolve(g.commercialBreak(pausou)).catch(() => {}).finally(retomou);
    },
  };
}

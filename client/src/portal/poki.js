// ── Poki ──────────────────────────────────────────────────────────────────────
// ⚠️ ANTES DE EMPACOTAR PARA A POKI: peça em Settings → Custom Content Security Policy a liberação de
//    `https://warspace.io` e `wss://warspace.io`. Isto NÃO é precaução — foi medido no preview: o
//    documento do jogo (`<gameId>.gdn.poki.com/<buildId>/index.html`) chega com
//    `default-src 'self' … https://game-cdn.poki.com/scripts/ … wss://netlib.poki.io` e NENHUM
//    `connect-src`, então todo `fetch` e todo WebSocket para cá morre no navegador, antes de sair.
//    A assinatura que separa isto de um problema nosso é ZERO requisição a warspace.io no painel de
//    rede: CORS recusado aparece lá (resposta chega, header falta), CSP nem deixa nascer. Sem a
//    liberação o jogador vê a tela de `servidorFora` e você passa o dia depurando um CORS que está
//    certo — `*.poki.com` já cobre os três hosts deles. Ver docs/spec/portais.md.
// A Poki também quer política de privacidade publicada; ela mora no site, e o link vai no formulário
// deles — nunca dentro do jogo (link de saída é proibido em portal).
import { carregaScript } from "./script.js";
const SRC = import.meta.env.VITE_POKI_SDK_URL || "https://game-cdn.poki.com/scripts/v2/poki-sdk.js";
const sdk = () => window.PokiSDK || null;

export async function criar({ pausou, retomou }) {
  if (!(await carregaScript(SRC, "poki-sdk"))) return null;
  const s = sdk(); if (!s) return null;
  try { if (s.init) await s.init(); } catch { return null; }
  // ⚠️ O PAR DA CARGA ESTAVA PELA METADE: só o `gameLoadingFinished` saía (de `main.jsx`, pela fachada),
  // e sem o começo a Poki não tem de onde medir quanto o jogo demorou a abrir — que é metade do que o
  // painel deles mostra ("time in game, loading, and ads"). Sai daqui, e não da fachada, porque este é
  // o instante mais cedo que existe de qualquer jeito: `medir()` já documenta que o SDK deles não
  // aceita timestamp, então antecipar a chamada na fachada não anteciparia a MEDIDA.
  try { if (s.gameLoadingStart) s.gameLoadingStart(); } catch { /* nunca derruba o jogo */ }
  return {
    carregou() { const g = sdk(); if (g && g.gameLoadingFinished) g.gameLoadingFinished(); },
    // ⚠️ O PREROLL DA POKI NUNCA ACONTECE, e isso é DELES, não nosso. Medido no console do SDK real:
    // `commercialBreak not possible before gameplayStart` — eles recusam qualquer comercial antes do
    // primeiro `gameplayStart`, e o nosso preroll sai em `play()`, que é justamente antes. A fachada não
    // percebe (o `commercialBreak` resolve normalmente) e o jogo segue; o efeito prático é que a PRIMEIRA
    // partida de cada carga entra sem anúncio. Não há o que consertar aqui: inverter a ordem é
    // `gameplayStart` sem jogo, que eles cobram por escrito. Os midrolls do respawn funcionam.
    jogoComecou() { const g = sdk(); if (g && g.gameplayStart) g.gameplayStart(); },
    jogoParou() { const g = sdk(); if (g && g.gameplayStop) g.gameplayStop(); },
    anuncio() {
      const g = sdk();
      if (!g || !g.commercialBreak) return Promise.resolve();
      // O `commercialBreak` recebe o callback de "vai começar" e resolve no fim — com ou sem anúncio.
      return Promise.resolve(g.commercialBreak(pausou)).catch(() => {}).finally(retomou);
    },
    // Anúncio RECOMPENSADO (`rewardedBreak`, distinto do `commercialBreak`): a Promise resolve o
    // booleano "assistiu até o fim?" — é o ÚNICO sinal de sucesso, não há onReward/onError separados.
    // Quem decide se isso vale uma recompensa é a fachada (`portal/index.js`), que também cuida da
    // pausa/retomada; aqui só se repassa a chamada.
    recompensa() {
      const g = sdk();
      if (!g || !g.rewardedBreak) return Promise.resolve(false);
      return Promise.resolve(g.rewardedBreak()).catch(() => false);
    },
    // Game Events da Poki: `measure(categoria, oQue, acao)` — `start`/`complete`/`fail` = Progress,
    // `visible`/`interact` = Interaction, qualquer outro valor = Other. Nunca usar "/" ou "^" nos três
    // argumentos (reservados pela Poki). Ver docs/spec/portais.md.
    // ⚠️ LINK EXTERNO PASSA PELO SDK, sempre. A regra deles tem duas metades que parecem se contradizer:
    // a política de privacidade tem que ser alcançável DE DENTRO do jogo, e link que tira o jogador do
    // iframe é proibido. `openExternalLink` é a saída que eles próprios definem — quem decide o que
    // fazer (nova aba, modal, pausar o jogo) é o portal, não nós.
    linkExterno(url) {
      const g = sdk();
      if (g && g.openExternalLink) { try { g.openExternalLink(url); return true; } catch { /* nunca derruba */ } }
      return false;
    },
    medir(categoria, oQue, acao) {
      const g = sdk();
      if (g && g.measure) try { g.measure(categoria, oQue, acao); } catch { /* nunca derruba o jogo */ }
    },
  };
}

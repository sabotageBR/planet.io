// ── Bounty Board (bountyboard.gg/arcade) ──────────────────────────────────────
// O único "portal" daqui que NÃO recebe um .zip: o Arcade deles tem dois trilhos e só um serve para um
// `.io` com servidor próprio.
//   • build ENVIADO   → `sandbox="allow-scripts allow-pointer-lock"`, ORIGEM OPACA (medido no player e
//     escrito na doc: "hosted builds run on an opaque origin ... localStorage/sessionStorage/cookies all
//     THROW"). Ali toda chamada nossa sairia com `Origin: null`, que o CORS recusa por construção — e
//     tem que continuar recusando —, e o token, as prefs e o idioma morreriam no primeiro acesso.
//   • URL EXTERNA     → eles enquadram https://warspace.io com
//     `sandbox="allow-scripts allow-same-origin allow-pointer-lock"`: origem real, armazenamento vivo,
//     API e WS na MESMA origem. É este o trilho, e por isso o "pacote" da Bounty Board é o SITE.
// Consequência: este adaptador vive no bundle do SITE e só acorda quando `BOUNTY` é verdade.
//
// ⚠️ REGRA 1 DELES, na letra: "The SDK is never load-bearing". Nada aqui pode segurar o boot, então
//    `init()` sai sem `await` e todo método é um no-op quando o SDK falta (bloqueador, rede, versão).
// ⚠️ `lockToHost()` fica de fora DE PROPÓSITO: ele BLOQUEIA o jogo quando não reconhece o embutidor, e
//    isso é uma forma nova de o nosso próprio site quebrar sozinho. Anti-rehosting não vale esse preço.
// ⚠️ CICLO DE VIDA PELO STORE, no molde de `app/analytics.js`. Os ganchos de portal do jogo
//    (`play()`, `leaveGame()`) são guardados por `if (PORTAL)`, e aqui PORTAL é FALSO — este é o site.
//    Assinar o `app` cobre os mesmos momentos sem espalhar `if` por arquivo nenhum e sem depender de
//    montagem de componente: entrar em partida, pausar, morrer e o BIG CRUNCH são todos escritas no
//    store.
// ⚠️ `gameOver` UMA VEZ POR VIDA (regra 2 deles) — quem garante isso é o `rodada`, que só é aberto pelo
//    `gameplayStart`. Morrer e o fim de rodada chegam no MESMO update (screen + lastMatch/roundResult),
//    então a ordem "parou de jogar → acabou" sai de graça, num pass só; e o campeão que NÃO morreu tem
//    o `gameOver` do fim de rodada, enquanto quem já morreu não ganha um segundo.
// ⚠️ Placar deles é INTEIRO e com teto de plausibilidade por jogo: `Math.trunc`, e nunca a massa (que
//    passa de um milhão) — o `score` da vida é o mesmo número que o nosso ranking usa.
import { carregaScript } from "./script.js";
import { app } from "../state/app.js";
const SRC = import.meta.env.VITE_BB_SDK_URL || "https://www.bountyboard.gg/arcade-sdk/v1.js";
const bb = () => window.BBArcade || null;

export async function criar() {
  if (!(await carregaScript(SRC, "bb-arcade-sdk"))) return null;
  const s = bb(); if (!s || typeof s.gameplayStart !== "function") return null;
  // fire-and-forget: `init()` resolve sozinho (ou em ~1,5 s num embutidor que não responde) e a doc
  // manda explicitamente não esperar por ele.
  try { Promise.resolve(s.init()).catch(() => {}); } catch { /* SDK pela metade */ }
  const chama = (m, ...a) => { try { const g = bb(); if (g && typeof g[m] === "function") g[m](...a); } catch { /* nunca derruba o jogo */ } };

  let jogando = false, rodada = false, ultimaMorte = null, ultimoFim = null;
  const abre = () => { if (jogando) return; jogando = true; rodada = true; chama("gameplayStart"); };
  const para = () => { if (!jogando) return; jogando = false; chama("gameplayStop"); };
  const acaba = n => { if (!rodada) return; rodada = false; chama("gameOver", Math.trunc(+n || 0)); };
  /** Meu score no fim de rodada: a linha do placar do meu slot, ou o `mine` que o servidor anexa a quem não coube nele. */
  const meuFim = r => { const b = (r && r.board) || [], m = b.find(x => x && x.slot === r.mySlot);
    return (m && m.score) || (r && r.mine && r.mine.score) || 0; };

  const passo = st => {
    // "Menus, pauses, death prompts, and ad breaks are not active play" (regra 3 deles)
    if (st.screen === "game" && !st.overlays.pause) abre(); else para();
    if (st.lastMatch && st.lastMatch !== ultimaMorte) { ultimaMorte = st.lastMatch; acaba(st.lastMatch.score); }
    if (st.roundResult && st.roundResult !== ultimoFim) { ultimoFim = st.roundResult; acaba(meuFim(st.roundResult)); }
  };
  app.subscribe(passo);
  // ⚠️ E o estado de AGORA: o SDK é um script de terceiro e a assinatura só existe depois que ele
  // carrega. Numa rede ruim o jogador entra em partida antes disso, e sem esta linha o `gameplayStart`
  // dessa primeira vida sairia só no próximo update do store — ou nunca.
  passo(app.get());

  return {
    // o `#boot` já saiu e a tela inicial está montada: é o "primeira cena jogável" deles
    carregou() { chama("gameLoadingFinished"); },
  };
}

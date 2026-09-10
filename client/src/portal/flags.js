// ── AS FLAGS DO PACOTE DE PORTAL ──────────────────────────────────────────────
// Ficam num arquivo SÓ delas porque o valor precisa virar CONSTANTE de build: é a poda do Rollup em cima
// destas comparações que faz o chunk do /admin não ser emitido no zip do portal — e é o `portal-pack.mjs`
// que confere isso a cada pacote, em vez de a gente acreditar.
//
// PORTAL      o pacote está hospedado por um portal (qualquer um deles).
// PORTAL_ID   qual — decide o adaptador de anúncio.
// SEM_CONTA   O INTERRUPTOR. A regra 7 da GameDistribution proíbe coleta de dados e login sem acordo à
//             parte. A decisão foi manter conta, Google e foto e assumir o risco; se reprovarem, isto
//             vira 1 e o pacote seguinte já sai sem nada disso — sem retrabalho e sem tocar no site.
// ⚠️ VÊM DE `define` (vite.config.js), e não de `import.meta.env`, por um motivo medido: estes módulos
// também são importados FORA do Vite — `theme/patterns.js` chega aqui pelo `faces.js`, e
// `client/test/textures.test.js` assa o catálogo inteiro num `node --test`. Com `import.meta.env.VITE_X`
// o teste morre ("Cannot read properties of undefined"); com a leitura defensiva o teste passa mas o
// valor deixa de ser LITERAL, o Rollup para de podar e o zip da GameDistribution sai com os adaptadores
// da Poki e da CrazyGames dentro (foi o que a guarda do `portal-pack.mjs` pegou). O `define` resolve os
// dois: no build vira texto literal e dobra; no Node o identificador não existe e o `typeof` devolve o
// padrão sem lançar.
export const PORTAL = typeof __PORTAL__ !== "undefined" && __PORTAL__ === "1";
export const PORTAL_ID = typeof __PORTAL_ID__ !== "undefined" ? __PORTAL_ID__ : "";
export const SEM_CONTA = typeof __PORTAL_STRICT__ !== "undefined" && __PORTAL_STRICT__ === "1";
export const ENTRA_DIRETO_PADRAO = PORTAL;
/**
 * QUAL PLATAFORMA É ESTA ABA — um id de `PLATAFORMAS` (shared/src/constants.js), resolvido num lugar só.
 * ⚠️ A ORDEM importa: `BOUNTY` vem ANTES de `site` porque o build da Bounty Board É um build de site
 * (`PORTAL` é falso lá — eles enquadram https://warspace.io). Sem essa ordem ele cairia em `site` e nunca
 * poderia ser marcado sozinho no painel. `?bb=1` continua sendo o jeito de provar isso em 127.0.0.1.
 */
export const plataformaAtual = () => (PORTAL ? PORTAL_ID || "" : BOUNTY ? "bountyboard" : "site");
/**
 * ENTRA_DIRETO — o clique em JOGAR entra na partida sem passar pela guarda do nome (`semNome()` em
 * state/actions.js, `jogar()` em ui/Entry.jsx).
 *
 * Deixou de ser constante de build e virou decisão do /admin (`ENTRY.DIRETO`, uma múltipla escolha de
 * plataformas que chega em `/api/config`). O motivo é o de sempre com portal: mudar uma constante de build
 * significa um pacote novo, e um pacote novo significa entrar na fila de revisão deles.
 *
 * ⚠️ QUEM COMPARA É O CLIENTE. O servidor não sabe de que portal veio esta aba: `users.origin` é gravado
 * uma vez, no primeiro guest, e é um DOMÍNIO — e vários portais servem de subdomínio por jogo. Quem sabe é
 * o `PORTAL_ID`, que é constante de BUILD. Então a LISTA vem de lá e a comparação acontece aqui.
 * ⚠️ SEM A LISTA, VALE O COMPORTAMENTO DE BUILD (o de hoje). `/api/config` é disparado sem `await` no boot
 * e o clique pode vir antes; não pisca porque isto é lido DENTRO do clique, nunca renderizado. A janela de
 * erro é de um clique, num jogador, e o seguinte já está certo.
 * ⚠️ ID DE BUILD DESCONHECIDO (um `vite build --mode portal` na mão, sem `VITE_PORTAL_ID`) cai no padrão
 * de build, nunca em "pede o nome": um zip que deixa de entrar direto por causa de uma env faltando é
 * reprova de certificação em silêncio.
 * @param {string|null|undefined} lista o CSV de `/api/config` (`config.entraDireto`)
 */
export function entraDiretoEm(lista) {
  if (lista == null) return ENTRA_DIRETO_PADRAO;
  const id = plataformaAtual();
  if (!id) return ENTRA_DIRETO_PADRAO;
  return String(lista).split(",").includes(id);
}
/**
 * ⚠️ HISTÓRICO, e o preço da guarda foi MEDIDO no funil da Poki (Fit Test de 09-set, 1.12): **17% de
 *    abandono em `menu/entry`** — 85 dos 500 fecharam a aba na tela inicial sem jogar um segundo, cada um
 *    entrando na média de playtime como ZERO. Isto já foi `PORTAL_ID === "crazy"` e depois `PORTAL`; o que
 *    destravou a generalização foi `ENTRY.NICK_AUTO` passar a entregar o campo preenchido com um nick de
 *    gente — entrar direto é entrar COM nome, e o campo continua na tela inicial para trocar.
 * ⚠️ DEPENDÊNCIA NÃO CODIFICADA: isto só funciona com `ENTRY.NICK_AUTO` ligado. Desligá-lo no painel
 *    devolve o `Viajante-NNNN` a todos os portais, em silêncio.
 */
/**
 * SEM_VOZ — o push-to-talk não existe no pacote de portal, e são duas razões independentes:
 *  • MODERAÇÃO. O servidor é relay puro (não decodifica, não grava, não loga), então não há como
 *    responder a um relatório de abuso nem o que auditar. Poki e CrazyGames classificam o catálogo em
 *    PEGI 12 e exigem, para voz, moderação ativa ou retenção — e nós não temos nem uma nem outra.
 *  • O IFRAME DELES NÃO DÁ A PERMISSÃO. Medido: o GameFlare embute com `allow="autoplay; fullscreen"`,
 *    sem `microphone`. Ali o `getUserMedia` do K morre em "Permissions policy violation" no console do
 *    revisor e o jogador leva um toast dizendo que "o navegador bloqueou" — o jogo mentindo sobre uma
 *    coisa que nunca ia funcionar. ⚠️ O harness `portal/iframe.html` PEDE microfone e por isso nunca
 *    reproduziu isso; ele foi corrigido junto.
 * Deriva de PORTAL de propósito: se um portal um dia aceitar voz, isto vira um campo de perfil como o
 * `strict`, e não um `if` novo espalhado pelo cliente. O chat de TEXTO continua, com a peneira do
 * servidor (server/src/palavrao.js).
 */
/**
 * BOUNTY — o site foi ENQUADRADO pelo player da Bounty Board (bountyboard.gg).
 *
 * ⚠️ É a única "distribuição" que NÃO é um zip, e o motivo é medido, não gosto: no Arcade deles um
 *    build enviado roda com `sandbox="allow-scripts allow-pointer-lock"` — ORIGEM OPACA —, e a doc
 *    própria confirma ("hosted builds run on an opaque origin ... localStorage/sessionStorage/cookies
 *    all THROW"). Ali o `Origin` de toda chamada seria `null`, que `server/src/http/cors.js` recusa por
 *    construção e tem que continuar recusando. O rail certo para um `.io` com servidor próprio é o
 *    "external URL embed", em que eles enquadram https://warspace.io com
 *    `sandbox="allow-scripts allow-same-origin allow-pointer-lock"`: origem real, armazenamento vivo,
 *    API e WS na MESMA origem (nem CORS entra na história). Ver docs/spec/portais.md.
 * ⚠️ Leitura ÚNICA, no módulo: nem `window.top` nem o pai mudam no meio da vida da página — é o mesmo
 *    argumento do `EMBUTIDO` de ui/GoogleButton.jsx.
 * ⚠️ `?bb=1` liga isto à força. Sem ele não há como PROVAR a integração antes de submeter: a detecção
 *    depende de o ancestral ser bountyboard.gg, e isso não se falsifica em 127.0.0.1. É o mesmo tipo de
 *    interruptor de bancada que `?local=1`, `?bench` e `?sfx` já são; fora de um embutidor deles o SDK
 *    resolve tudo como no-op, então ligá-lo por engano não muda nada além de esconder a voz.
 * ⚠️ `ancestorOrigins` PRIMEIRO e `referrer` como reserva: o Firefox não tem a lista, e o iframe deles
 *    manda `referrerPolicy="origin"` (medido no bundle do player), então o referrer chega como a
 *    origem crua — que é exatamente o que se quer comparar. Sufixo de domínio, nunca `includes`: é a
 *    mesma armadilha do matcher de CORS (`bountyboard.gg.evil.tld`).
 */
export const daBounty = u => { try { const h = new URL(u).hostname.toLowerCase();
  return h === "bountyboard.gg" || h.endsWith(".bountyboard.gg"); } catch { return false; } };
export const BOUNTY = (() => {
  if (typeof window === "undefined") return false;
  try {
    if (/[?&]bb=1\b/.test(window.location.search)) return true;
    if (window.top === window.self) return false;
    const a = window.location.ancestorOrigins;
    if (a && a.length) return daBounty(a[a.length - 1]) || daBounty(a[0]);
    return daBounty(document.referrer);
  } catch { return false; }
})();
/** ⚠️ O `allow` do iframe deles é `fullscreen; autoplay; gamepad; pointer-lock; accelerometer;
 *  gyroscope; magnetometer; xr-spatial-tracking` — MEDIDO, e sem `microphone`. Mesmo caso do GameFlare,
 *  então a voz sai pelo mesmo interruptor em vez de um `if` novo espalhado pelo cliente. */
export const SEM_VOZ = PORTAL || BOUNTY;

// ── PORTAL: a fachada neutra ──────────────────────────────────────────────────
// GameDistribution, CrazyGames e Poki cada um tem o seu SDK, e o jogo não pode saber de nenhum deles.
// Aqui mora o vocabulário comum — anúncio, pausa, "carreguei", "comecei a jogar" — e cada adaptador
// traduz. itch.io não tem SDK: é a ausência de adaptador, e tudo vira no-op.
//
// ⚠️ NADA AQUI REJEITA, E TUDO TEM RELÓGIO. O SDK é a primeira coisa que um bloqueador de anúncio
//    derruba; `showAd` às vezes não rejeita quando não há preenchimento; e um portal pode simplesmente
//    não responder. Uma promessa pendurada na frente do botão JOGAR é a pior falha que este arquivo
//    pode produzir — pior que não ter anúncio nenhum. É o mesmo princípio de `app/analytics.js`
//    ("medir nunca pode derrubar o jogo") e do `.catch` de `api/google.js`.
//
// ⚠️ O `import()` é um SWITCH sobre literais, nunca `import(\`./${id}.js\`)`: com variável o Rollup vira
//    a chamada num glob e o zip da GameDistribution sairia com o código da Poki dentro.
//
// ⚠️ Nenhum arquivo daqui pode se chamar `ads.js`/`ad.js`/`banner.js`: o nome vai para a URL do chunk
//    (`assets/ads-<hash>.js`) e há filtro de bloqueador que casa isso na URL — o `import()` rejeitaria.
//    Pelo mesmo motivo as classes de CSS levam prefixo `portal-` (ver o que `ad-wrap` fez com o /admin).
import { PORTAL, PORTAL_ID } from "./flags.js";
import { PORTAL as P } from "@warspace/shared";

const nada = () => {};
const prazo = (p, ms, saida) => new Promise(res => {
  let vivo = true; const fim = v => { if (vivo) { vivo = false; res(v); } };
  const t = setTimeout(() => fim(saida), ms);
  Promise.resolve(p).then(v => { clearTimeout(t); fim(v); }, () => { clearTimeout(t); fim(saida); });
});

const carrega = () => {
  if (!PORTAL) return null;
  if (PORTAL_ID === "gd") return import("./gd.js");
  if (PORTAL_ID === "crazy") return import("./crazy.js");
  if (PORTAL_ID === "poki") return import("./poki.js");
  return null;   // itch.io e qualquer id desconhecido: o jogo roda igual, sem anúncio
};

let sdk = null, ultimoAd = 0;
const aoPausar = [], aoRetomar = [];
const avisa = lista => { for (const cb of lista) { try { cb(); } catch { /* um ouvinte quebrado não derruba os outros */ } } };

/** Resolve quando o SDK respondeu OU desistiu — nunca rejeita, nunca demora mais que `PORTAL.SDK_MS`. */
const pronto = (async () => {
  const mod = carrega(); if (!mod) return null;
  sdk = await prazo(mod.then(m => m.criar({ pausou: () => avisa(aoPausar), retomou: () => avisa(aoRetomar) })).catch(() => null), P.SDK_MS, null);
  return sdk;
})();

export const portal = {
  /** Há adaptador vivo? (site, dev, itch.io e SDK bloqueado → false) */
  get ativo() { return !!sdk; },
  pronto,
  /** O jogo terminou de carregar (CrazyGames e Poki contam isso; a GD não tem equivalente). */
  async carregou() { await pronto; if (sdk && sdk.carregou) try { sdk.carregou(); } catch { /* nunca derruba */ } },
  /**
   * Anúncio antes de entrar em partida. `tipo` é "preroll" (a primeira desta carga) ou "midroll".
   * SEMPRE resolve, e respeita o intervalo mínimo — quem chama não precisa lembrar de nada disso.
   */
  async anuncio(tipo = "midroll") {
    await pronto;
    if (!sdk || !sdk.anuncio) return;
    const agora = Date.now();
    if (tipo !== "preroll" && agora - ultimoAd < P.MIN_AD_MS) return;
    ultimoAd = agora;
    avisa(aoPausar);
    try { await prazo(sdk.anuncio(tipo), P.AD_MS, null); }
    catch { /* sem preenchimento, bloqueado, o que for: joga do mesmo jeito */ }
    finally { avisa(aoRetomar); }
  },
  /** Começou/parou de jogar de fato (o SDK usa isso para escolher a hora do anúncio e medir sessão). */
  async jogoComecou() { await pronto; if (sdk && sdk.jogoComecou) try { sdk.jogoComecou(); } catch { /**/ } },
  async jogoParou() { await pronto; if (sdk && sdk.jogoParou) try { sdk.jogoParou(); } catch { /**/ } },
  /** O anúncio começou / acabou. Quem liga o áudio e a tela de pausa é `state/actions.js`. */
  aoPausar(cb) { aoPausar.push(cb || nada); },
  aoRetomar(cb) { aoRetomar.push(cb || nada); },

  // ── CONTA DO PORTAL ────────────────────────────────────────────────────────
  // A CrazyGames exige que o jogador logado LÁ seja reconhecido AQUI ("new logged-in users are
  // automatically registered & logged into the game"), que dê para jogar como convidado sem login, e
  // que o nome dele apareça no jogo. Quem troca o JWT deles pelo nosso token é `state/actions.js`.
  /** JWT curto do portal, ou null (sem SDK, sem conta disponível, ou ninguém logado). NUNCA guardar. */
  async identidade() { await pronto; if (!sdk || !sdk.identidade) return null;
    try { return await sdk.identidade(); } catch { return null; } },
  /** Dá para oferecer login? (falso quando o portal embute o jogo em domínio de terceiro) */
  get temConta() { return !!(sdk && sdk.temConta && sdk.temConta()); },
  /** Abre o modal de login DELES. Só pode ser chamado a partir de um clique do jogador. */
  async pedirLogin() { await pronto; if (sdk && sdk.pedirLogin) try { return await sdk.pedirLogin(); } catch { /* cancelou */ } return null; },
  /** O jogador entrou/saiu/trocou de conta no portal enquanto jogava. */
  aoTrocarConta(cb) { pronto.then(() => { if (sdk && sdk.aoTrocarConta) sdk.aoTrocarConta(cb); }); },

  // ── SALA (o "Full" da CrazyGames: convidar e ser convidado pelos amigos) ────
  /** Estou nesta sala, e ela aceita (ou não) mais gente. */
  sala(codigo, aberta) { if (sdk && sdk.sala) try { sdk.sala(codigo, aberta); } catch { /**/ } },
  /** Saí da sala. */
  saiuDaSala() { if (sdk && sdk.saiuDaSala) try { sdk.saiuDaSala(); } catch { /**/ } },
  /** Um amigo aceitou o convite: o callback recebe o código da sala. */
  aoEntrarNaSala(cb) { pronto.then(() => { if (sdk && sdk.aoEntrarNaSala) sdk.aoEntrarNaSala(cb); }); },
  /** Link de convite DO PORTAL (é ele que abre o jogo na página deles, já na sala). */
  async convite(codigo) { await pronto; if (!sdk || !sdk.convite) return null;
    try { return await sdk.convite(codigo); } catch { return null; } },
};
export default portal;

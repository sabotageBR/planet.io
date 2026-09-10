// ── PORTAL: a fachada neutra ──────────────────────────────────────────────────
// GameDistribution, CrazyGames, Poki e Playgama cada um tem o seu SDK, e o jogo não pode saber de nenhum deles.
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
import { PORTAL, PORTAL_ID, BOUNTY } from "./flags.js";
import { PORTAL as P } from "@warspace/shared";

const nada = () => {};
const prazo = (p, ms, saida) => new Promise(res => {
  let vivo = true; const fim = v => { if (vivo) { vivo = false; res(v); } };
  const t = setTimeout(() => fim(saida), ms);
  Promise.resolve(p).then(v => { clearTimeout(t); fim(v); }, () => { clearTimeout(t); fim(saida); });
});

const carrega = () => {
  // ⚠️ A Bounty Board é o único que NÃO é um pacote: eles enquadram o SITE (o build enviado deles roda
  // em origem opaca, onde nem o `Origin` nem o `localStorage` sobrevivem — ver portal/flags.js). Por
  // isso o adaptador dela mora do lado do `!PORTAL`, e é a poda em cima destas constantes que mantém
  // cada bundle com um adaptador só: no zip `PORTAL` é `true` e esta linha some; no site `PORTAL_ID` é
  // `""` e somem as de baixo.
  if (!PORTAL) return BOUNTY ? import("./bb.js") : null;
  if (PORTAL_ID === "gd") return import("./gd.js");
  if (PORTAL_ID === "crazy") return import("./crazy.js");
  if (PORTAL_ID === "poki") return import("./poki.js");
  if (PORTAL_ID === "y8") return import("./y8.js");
  if (PORTAL_ID === "gm") return import("./gm.js");
  if (PORTAL_ID === "playgama") return import("./pg.js");
  if (PORTAL_ID === "gamepix") return import("./gpx.js");
  return null;   // itch.io e qualquer id desconhecido: o jogo roda igual, sem anúncio
};

// `emJogo` é o TRINCO DO ESCRITOR ÚNICO — "a última coisa que o SDK ouviu foi um start" —, e é ele que
// garante, por construção, que nunca sai start-após-start nem stop-após-stop (item que a Poki cobra por
// escrito). `emAnuncio` é o portão do commercial break: "It should not be possible to fire any SDK events
// during midrolls", também na letra deles. Ver `jogoComecou` lá embaixo para o que acontece com um start
// que chega no meio de um anúncio — ele é ADIADO, nunca descartado.
let sdk = null, ultimoAd = 0, emJogo = false, emAnuncio = false, comecouNoAd = false, pediuCarregou = false;
/** Game Events que chegaram no meio de um anúncio e esperam o fim dele. Ver `medir`. */
const filaMedir = [];
const aoPausar = [], aoRetomar = [];
const avisa = lista => { for (const cb of lista) { try { cb(); } catch { /* um ouvinte quebrado não derruba os outros */ } } };

/**
 * Resolve quando o SDK respondeu OU desistiu — nunca rejeita, nunca demora mais que `PORTAL.SDK_MS`.
 *
 * ⚠️ O PRAZO É PARA QUEM ESPERA, NÃO PARA O ADAPTADOR. Isto era um `await prazo(...)` e ponto: passando
 *    de 6 s, o adaptador era JOGADO FORA — para sempre, na sessão inteira. E 6 s não é folgado quando se
 *    soma o download do SDK de terceiro, o `initialize()` dele (que ainda busca config e o pedaço da
 *    plataforma no CDN deles) e a primeira carga de tudo isso sem cache: é exatamente o caso do REVISOR
 *    do portal. Sintoma: nenhum anúncio, nenhuma mensagem de ciclo de vida, nenhum placar — e nada no
 *    console dizendo por quê. Foi o que a QA Tool do Playgama devolveu como "No advertising is
 *    implemented". Agora o prazo só decide quanto tempo o botão JOGAR espera; o adaptador que chega
 *    atrasado é INSTALADO do mesmo jeito e vale de lá em diante.
 * ⚠️ E o `carregou()` é REPETIDO nesse caso: ele sai uma vez só, do `main.jsx`, e quem chegou depois
 *    dele perderia o "o jogo carregou" — que em vários SDKs é o marco que libera o anúncio.
 */
let venceu = false;   // o prazo acabou? (é o que separa "chegou atrasado" de "chegou a tempo")
const pronto = (async () => {
  const mod = carrega(); if (!mod) return null;
  const feito = mod.then(m => m.criar({ pausou: () => avisa(aoPausar), retomou: () => avisa(aoRetomar) })).catch(() => null);
  // ⚠️ O `venceu` não é detalhe: sem ele, o adaptador que chega A TEMPO leva o `carregou()` DUAS vezes —
  // uma aqui e outra por quem estava esperando o `pronto`. Vários SDKs recusam o segundo (o Playgama
  // rejeita a promessa do `game_ready` repetido), e isso é ruído no console do revisor.
  feito.then(s => { if (!s || sdk) return; sdk = s;
    if (venceu && pediuCarregou && s.carregou) { try { s.carregou(); } catch { /* nunca derruba o jogo */ } } });
  sdk = await prazo(feito, P.SDK_MS, null);
  venceu = true;
  return sdk;
})();

export const portal = {
  /** Há adaptador vivo? (site, dev, itch.io e SDK bloqueado → false) */
  get ativo() { return !!sdk; },
  /**
   * Este portal tem ANÚNCIO RECOMPENSADO de verdade?
   * ⚠️ `ativo` NÃO responde isso, e a diferença estava custando um botão morto: `ativo` é "há um adaptador
   * de portal", e só a Poki implementa `recompensa()` — nos outros seis (GD, CrazyGames, Y8, GameMonetize,
   * Playgama, GamePix) o botão da Loja aparecia e o clique caía num `return false` silencioso. É o defeito
   * que o próprio comentário de Shop.jsx descreve ("um botão morto é pior que escondê-lo") aplicado ao
   * lugar errado. Quem oferece recompensa pergunta AQUI.
   */
  get temRecompensa() { return !!(sdk && sdk.recompensa); },
  pronto,
  /** O jogo terminou de carregar (CrazyGames e Poki contam isso; a GD não tem equivalente). */
  async carregou() { pediuCarregou = true; await pronto; if (sdk && sdk.carregou) try { sdk.carregou(); } catch { /* nunca derruba */ } },
  /**
   * Anúncio antes de entrar em partida. `tipo` é "preroll" (a primeira desta carga) ou "midroll".
   * SEMPRE resolve, e respeita o intervalo mínimo — quem chama não precisa lembrar de nada disso.
   */
  async anuncio(tipo = "midroll") {
    await pronto;
    if (!sdk || !sdk.anuncio) return;
    // ⚠️ PREROLL NÃO É UNIVERSAL. A GameDistribution EXIGE (§2.1); a CrazyGames PROÍBE, na letra:
    // "advertisements should not appear before the user has experienced a reasonable amount of
    // gameplay". Isto era um `await portal.anuncio("preroll")` igual para todos, em `play()` — ou seja,
    // o revisor da CrazyGames levava um anúncio antes de ver um único frame do jogo. Quem declara é o
    // ADAPTADOR (`semPreroll`) e não uma flag de build: a regra é do SDK, e é junto dele que ela vive.
    if (tipo === "preroll" && sdk.semPreroll) return;
    const agora = Date.now();
    if (tipo !== "preroll" && agora - ultimoAd < P.MIN_AD_MS) return;
    ultimoAd = agora;
    // ⚠️ O gameplay TEM que fechar antes de pedir anúncio. `gameplayStart` sem `gameplayStop` é item de
    // QA da CrazyGames e requisito escrito da Poki, e o pareamento ficou quebrado por muito tempo: só
    // `leaveGame()` chamava `jogoParou()`, então a MORTE, a pausa e o fim de rodada nunca fechavam nada —
    // a tela de morte inteira contava como jogo ativo no painel deles. Isto aqui fechava metade do
    // buraco (o anúncio) e escondia a outra metade; quem a fechou foi `portal/sessao.js`, derivando os
    // dois eventos do STORE. Aqui sobrou o que é mesmo do anúncio: fechar antes e não deixar nada sair
    // durante — reabrir é do store, porque é ele que sabe se já há tela de jogo de volta.
    // ⚠️ INCONDICIONAL, e sem guardar `voltar`. Quem REABRE o gameplay deixou de ser esta função e passou
    // a ser `portal/sessao.js`, pela escrita de `screen:"game"` que `play()`/`respawnAqui()` fazem DEPOIS
    // do `await` daqui — reabrir aqui devolveria o `gameplayStart` com a tela de morte ainda no ar.
    emAnuncio = true; comecouNoAd = false;
    await portal.jogoParou();
    avisa(aoPausar);
    try { await prazo(sdk.anuncio(tipo), P.AD_MS, null); }
    catch { /* sem preenchimento, bloqueado, o que for: joga do mesmo jeito */ }
    finally {
      avisa(aoRetomar);
      // ⚠️ DEPOIS do `avisa`, e é o conserto de um bug real: o adaptador da CrazyGames re-mutava o áudio
      // (o mudo do SITE deles, que tem prioridade por contrato) dentro do próprio callback de fim, ou
      // seja ANTES desta linha — e o `avisa(aoRetomar)` desmutava por cima. Quem tinha desligado o som na
      // página deles voltava a ouvir o jogo, para sempre, depois do primeiro anúncio. Quem reaplica
      // estado de portal é o portal, e por último.
      if (sdk.reaplica) try { sdk.reaplica(); } catch { /**/ }
      emAnuncio = false;
      // primeiro o que estava represado, depois o gameplay: a ordem no Event Log deles fica a real
      while (filaMedir.length) { const m = filaMedir.shift(); portal.medir(m[0], m[1], m[2]); }
      if (comecouNoAd) { comecouNoAd = false; await portal.jogoComecou(); }
    }
  },
  /**
   * Anúncio RECOMPENSADO: devolve `true` só se o jogador assistiu até o fim (aí sim vale conceder o
   * prêmio), `false` em qualquer outro caso — sem SDK, sem preenchimento, cancelado, ou o `AD_MS`
   * estourou. ⚠️ SEM `MIN_AD_MS`: a Poki é explícita ("don't add internal cooldowns — we manage ad
   * frequency"), e o gatilho aqui é um CLIQUE do jogador pedindo a recompensa, não um preroll/midroll
   * automático — o mesmo motivo pelo qual isto nunca deve virar um `setInterval`/cooldown nosso.
   */
  async recompensa() {
    await pronto;
    if (!sdk || !sdk.recompensa) return false;
    emAnuncio = true; comecouNoAd = false;
    await portal.jogoParou();
    avisa(aoPausar);
    let assistiu = false;
    try { assistiu = await prazo(sdk.recompensa(), P.AD_MS, false); }
    catch { /* o adaptador pode lançar antes de devolver a promessa */ }
    finally {
      avisa(aoRetomar);
      if (sdk.reaplica) try { sdk.reaplica(); } catch { /**/ }
      emAnuncio = false;
      // primeiro o que estava represado, depois o gameplay: a ordem no Event Log deles fica a real
      while (filaMedir.length) { const m = filaMedir.shift(); portal.medir(m[0], m[1], m[2]); }
      if (comecouNoAd) { comecouNoAd = false; await portal.jogoComecou(); }
    }
    return !!assistiu;
  },
  /**
   * Evento customizado do portal (hoje: Game Events da Poki). Nunca bloqueia quem chama — dispara
   * assim que o SDK ficar pronto, e vira no-op nos portais sem suporte. ⚠️ Isto significa que um
   * evento chamado ANTES do SDK carregar (ex.: o mount da tela de Entrada) pode chegar à Poki alguns
   * segundos depois do instante real — limitação do próprio SDK deles, que não aceita timestamp.
   */
  medir(categoria, oQue, acao) {
    // ⚠️ ENFILEIRA DURANTE O ANÚNCIO. "It should not be possible to fire any SDK events during midrolls
    // or rewarded videos" é requisito escrito da Poki, e isto foi MEDIDO falhando no Inspector deles: um
    // marco de sessão que vence no meio do comercial, ou um `play()` disparado por trás dele, cuspia
    // `Measure` entre o `Commercial break` e o `Gameplay start`. Enfileirar (e não descartar) porque o
    // evento continua verdadeiro — o que muda é a hora em que ele pode sair, e o SDK deles não aceita
    // timestamp de qualquer forma, o que este arquivo já documenta.
    if (emAnuncio) { filaMedir.push([categoria, oQue, acao]); return; }
    pronto.then(() => { if (sdk && sdk.medir) try { sdk.medir(categoria, oQue, acao); } catch { /**/ } });
  },
  /**
   * Começou/parou de jogar de fato. Quem decide isto é `portal/sessao.js`, olhando o store — e não os
   * chamadores, que é o que deixava a MORTE sem `gameplayStop` (o único fechamento era `leaveGame`).
   *
   * ⚠️ ADIA, NUNCA DESCARTA. Um start que chega durante o commercial break não pode ir ao SDK ("it should
   *    not be possible to fire any SDK events during midrolls"), mas descartá-lo deixaria o jogo rodando
   *    com o gameplay fechado para sempre. `comecouNoAd` guarda o pedido e o `finally` do anúncio o solta.
   *    Hoje isso é cinto de segurança — a tela só vira `game` DEPOIS do `await` do anúncio —, e é
   *    justamente por isso que ele tem que existir: a garantia era de ORDEM, e ordem não é invariante.
   * ⚠️ E as guardas ficam DEPOIS do `await pronto`. Movê-las para antes parece otimização e perde
   *    transições: com duas trocas rápidas antes de o SDK existir, é a fila de microtasks que preserva a
   *    ordem, e checar cedo faz a segunda decidir com o estado da primeira ainda por aplicar.
   */
  async jogoComecou() { await pronto; if (emAnuncio) { comecouNoAd = true; return; } if (emJogo) return; emJogo = true;
    if (sdk && sdk.jogoComecou) try { sdk.jogoComecou(); } catch { /**/ } },
  async jogoParou() { await pronto; if (!emJogo) return; emJogo = false;
    if (sdk && sdk.jogoParou) try { sdk.jogoParou(); } catch { /**/ } },
  /**
   * Abrir uma página EXTERNA (hoje só a política de privacidade). Devolve `true` se o portal cuidou
   * disso; `false` quer dizer "abra você mesmo", que é o caso do site e de quem não tem SDK.
   * ⚠️ Nunca `window.open` direto num portal: tirar o jogador do iframe é reprova, e vários SDKs
   * bloqueiam pop-up de dentro do jogo de qualquer forma.
   */
  linkExterno(url) { try { return !!(sdk && sdk.linkExterno && sdk.linkExterno(url)); } catch { return false; } },
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

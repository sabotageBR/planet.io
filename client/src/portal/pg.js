// ── Playgama (o "Playgama Bridge") ────────────────────────────────────────────
// Oitavo portal, e o primeiro cujo SDK é uma FACHADA como esta: o Bridge existe para publicar o mesmo
// zip em dezenas de plataformas (`PLATFORM_ID` traz vk, yandex, crazy_games, game_distribution, poki,
// y8, youtube…), e ele descobre onde está pelo HOSTNAME — daí o `platform_id=playgama` que eles
// penduram na URL do jogo. Do nosso lado nada disso importa: só o vocabulário de sempre.
//
// ⚠️ O ARQUIVO É `pg.js` pela mesma regra que proíbe `ads.js` aqui: o nome vira a URL do chunk e há
//    filtro de bloqueador que casa palavra de publicidade no caminho.
// ⚠️ O PREROLL VOLTOU, e não foi capricho: a certificação deles reprova com "No advertising is
//    implemented — certification requires at least one type of advertising". A doc pede para não chamar
//    `showInterstitial()` "at game start", e o nosso preroll não é a largada do JOGO: é o clique em
//    JOGAR, ou seja a passagem do menu para a partida — literalmente o "level transition" que eles dão
//    como exemplo de hora certa. Se a plataforma já tiver anunciado sozinha, o teto deles devolve
//    `failed` e a fachada segue: anúncio duplicado é o que NÃO acontece.
// ⚠️ E o teto deles precisou sair do caminho no config: `initialInterstitialDelay` conta a partir do
//    `game_ready` e vale 60 s por padrão, ou seja o PRIMEIRO anúncio de toda sessão era recusado antes
//    de existir. Quem espaça anúncio aqui é `PORTAL.MIN_AD_MS` (2 min), na fachada.
// ⚠️ NADA DE STRING DE EVENTO CRAVADA: o Bridge publica `EVENT_NAME`, `PLATFORM_MESSAGE` e
//    `INTERSTITIAL_STATE` no próprio objeto (medido no bundle deles), e ler dali é o que sobrevive a
//    uma renomeação da versão `stable` — que é servida por eles, não fixada por nós.
// ⚠️ `platform.sendMessage(GAME_READY)` REJEITA na segunda chamada (medido: `if(#jt)return
//    Promise.reject()`), e uma rejeição sem `catch` é ruído no console do revisor, que é justamente o
//    que a lista de requisitos técnicos deles proíbe ("no technical messages, errors, or crashes").
// ⚠️ O `playgama-bridge-config.json` fica AO LADO do index.html e quem o escreve é o empacotador — o
//    Bridge o busca sozinho em `./playgama-bridge-config.json` na inicialização, e sem ele a carga
//    falha com CONFIG_LOAD_FAILED no console (defaults aplicados, jogo funcionando, revisor lendo erro).
import { carregaScript } from "./script.js";
import { silenciaAnuncio } from "../audio/index.js";
import { aoAcabarAVida } from "./vidas.js";
import { app } from "../state/app.js";
import { api } from "../api/client.js";
import { applySession } from "../state/actions.js";
const SRC = import.meta.env.VITE_PG_SDK_URL || "https://bridge.playgama.com/v2/stable/playgama-bridge.js";
const ponte = () => window.bridge || window.playgamaBridge || null;
/**
 * O id do placar SaaS deles, e ele tem que existir com ESTE nome no painel
 * (developer.playgama.com → o cartão do jogo → aba Leaderboards, o mesmo lugar de onde sai o
 * `saas.publicToken` que o empacotador grava no config). Medido na API deles: um id que não existe
 * responde `404 {"message":"Leaderboard not found"}` — a promessa rejeita e ninguém no jogo fica
 * sabendo, que é o modo de falha silenciosa de sempre.
 */
const PLACAR = "score";
/** Uma chave só, um blob: é o que a Storage deles guarda por JOGADOR (na nuvem, quando a plataforma tem). */
const CHAVE = "warspace";

export async function criar({ pausou, retomou }) {
  if (!(await carregaScript(SRC, "playgama-bridge"))) return null;
  const b = ponte(); if (!b || typeof b.initialize !== "function") return null;
  try { await b.initialize(); } catch { return null; }

  const EV = b.EVENT_NAME || {}, MSG = b.PLATFORM_MESSAGE || {}, ST = b.INTERSTITIAL_STATE || {};
  let pendente = null;   // o `ok` da promessa de anúncio em curso, ou null
  let meuAnuncio = false;
  const fecha = () => { const p = pendente; pendente = null; if (p) p(); };
  const escuta = (nome, cb) => { try { if (nome && b.on) b.on(nome, cb); } catch { /* SDK pela metade */ } };
  const recado = m => { try { if (m && b.platform) Promise.resolve(b.platform.sendMessage(m)).catch(() => {}); } catch { /**/ } };
  const audioDaPlataforma = () => { try { return b.platform ? b.platform.isAudioEnabled !== false : true; } catch { return true; } };

  escuta(EV.INTERSTITIAL_STATE_CHANGED, e => { if (e === ST.CLOSED || e === ST.FAILED) fecha(); });
  // ⚠️ PAUSA E ÁUDIO SÃO AGREGADOS, E O NOSSO PRÓPRIO ANÚNCIO ENTRA NA CONTA. O Bridge junta cinco
  // fontes ("interstitial", "rewarded", "visibility", "platform", "rate") num estado só, então pedir um
  // intersticial dispara os dois eventos — e a fachada JÁ cala o som e levanta a tela de pausa em volta
  // do anúncio. Repassar os dois caminhos seria a receita do bug que a CrazyGames nos ensinou: a ordem
  // entre o `retomou()` da fachada e o evento do SDK decide se o jogador fica mudo para sempre. Enquanto
  // o anúncio é NOSSO os eventos são ignorados, e quem devolve o estado da plataforma no fim é
  // `reaplica()`, chamado por último. O que sobra aqui é o que só o portal sabe: aba escondida, o mudo
  // da PÁGINA deles (que tem prioridade sobre o ajuste interno, como na CrazyGames) e pausa do site.
  escuta(EV.PAUSE_STATE_CHANGED, p => { if (meuAnuncio) return; if (p) pausou(); else retomou(); });
  escuta(EV.AUDIO_STATE_CHANGED, ligado => { if (!meuAnuncio) silenciaAnuncio(!ligado); });
  silenciaAnuncio(!audioDaPlataforma());

  // ── PLACAR SaaS ────────────────────────────────────────────────────────────
  // O `score` da vida, uma vez por vida (`portal/vidas.js`, o mesmo contador da Bounty Board), e nunca
  // a massa — o placar deles é inteiro e o score é o número que o nosso próprio ranking usa.
  // ⚠️ Três coisas fazem isto existir, e faltando UMA o resultado é o mesmo silêncio: o
  // `saas.publicToken` no config (do painel deles), o bloco `saas.leaderboards.platforms` (que é o que
  // liga o adaptador SaaS — sem ele o Bridge tenta o placar NATIVO da plataforma) e o placar criado no
  // painel com o id `PLACAR`.
  // ⚠️ `setScore` REJEITA para convidado (medido no bundle deles: sem `playerId` nem sai da máquina), e
  // isso é o caso NORMAL — a maioria de quem joga num portal não está logada nele.
  aoAcabarAVida(n => { try { const lb = b.leaderboards;
    if (lb && typeof lb.setScore === "function") Promise.resolve(lb.setScore(PLACAR, n)).catch(() => {}); } catch { /* nunca derruba o jogo */ } });

  // ── PROGRESSO NA NUVEM DELES (a Storage do Bridge) ─────────────────────────
  // A certificação reprova com "The game did not save progress — the platform did not detect any
  // attempt to save data", e a doc é explícita: nada de `localStorage` direto, tudo pela Storage, senão
  // "the data won't reach cloud saves".
  // ⚠️ O QUE É "PROGRESSO" AQUI: moedas, nível, skins e conquistas moram no NOSSO Postgres, atrás da
  // credencial da sessão — então o que preserva progresso é ELA, não uma cópia dos números (que o
  // servidor recalcularia por cima na partida seguinte). Daí o blob ser `{v,t,n}` e não um save de jogo.
  // ⚠️ SÓ CONVIDADO. Guardar na plataforma a credencial de uma conta REGISTRADA seria delegar a ela um
  // acesso que vale muito mais que o save — e quem tem login não precisa disto: entra pelo login em
  // qualquer aparelho. Ao registrar, o blob é reescrito SEM a credencial.
  // ⚠️ RESTAURA SÓ EM CONTA EM BRANCO. Quando o SDK fica pronto o boot já criou um convidado local
  // (~200 ms contra os segundos do Bridge), então "não tem sessão" nunca acontece; o que existe é "tem
  // um convidado que nunca jogou". Aí adotar o da nuvem é o certo — é o mesmo jogador voltando em outro
  // aparelho. Havendo progresso local, a sessão de agora manda e a nuvem vira espelho dela.
  const guarda = (() => { let ultimo = null; return () => {
    const st = b.storage; if (!st || !st.set) return;
    const u = (app.get().session.user) || {}, t = u.kind === "registered" ? "" : (api.token || "");
    if (t === ultimo) return; ultimo = t;
    try { Promise.resolve(st.set(CHAVE, JSON.stringify({ v: 1, t, n: u.nick || "" }))).catch(() => {}); } catch { /**/ }
  }; })();
  (async () => {
    try {
      const st = b.storage; if (!st || !st.get) return;
      const u = (app.get().session.user) || {};
      const branco = u.kind !== "registered" && !u.login && !u.email && !(u.coins | 0);
      if (branco) {
        const bruto = await st.get(CHAVE);
        const d = JSON.parse((Array.isArray(bruto) ? bruto[0] : bruto) || "null");
        if (d && d.t && d.t !== api.token) { api.adota(d.t); applySession(await api.bootstrap()); }
      }
    } catch { /* nuvem fora: segue com o convidado local, que é o comportamento de sempre */ }
    guarda();
    app.subscribe(guarda);   // trocou de conta (convidado → registrada, ou a adotada agora): grava de novo
  })();

  return {
    carregou() { recado(MSG.GAME_READY); },
    jogoComecou() { recado(MSG.GAMEPLAY_STARTED); },
    jogoParou() { recado(MSG.GAMEPLAY_STOPPED); },
    // o mudo da PÁGINA deles vence o nosso; a fachada chama isto depois do `retomou()`
    reaplica() { meuAnuncio = false; silenciaAnuncio(!audioDaPlataforma()); },
    anuncio() {
      const ad = b.advertisement;
      // `isInterstitialSupported` é `false` na plataforma MOCK (é onde o Bridge cai fora dos portais
      // dele), e aí não há anúncio nenhum a esperar: resolver na hora é a resposta certa.
      if (!ad || !ad.isInterstitialSupported || typeof ad.showInterstitial !== "function") return Promise.resolve();
      return new Promise(ok => {
        pendente = ok; meuAnuncio = true;
        // ⚠️ Eles têm um intervalo mínimo PRÓPRIO (`minimumDelayBetweenInterstitial`, 60 s de padrão, e
        // o empacotador o alinha com `PORTAL.MIN_AD_MS` no config): pedir cedo demais não trava — o
        // estado vai direto para FAILED, que já é uma das saídas do listener acima.
        try { ad.showInterstitial(); } catch { fecha(); }
      });
    },
  };
}

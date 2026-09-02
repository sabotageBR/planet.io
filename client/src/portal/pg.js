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
import { setLangDaPlataforma } from "../i18n/index.js";
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
/** Teto da LEITURA da nuvem deles: ela viaja por postMessage e pode nunca ser respondida. */
const STORAGE_MS = 4000;

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

  // ── IDIOMA DA PLATAFORMA ───────────────────────────────────────────────────
  // ⚠️ Quem escolhe o idioma num portal é ELE, não o navegador — e a certificação reprova nas duas
  // pontas: "Default locale is not English. The game started in another language" e "Localization error
  // for Spanish … language parameter was ignored on initialization". O `?lang=` já foi lido antes do
  // primeiro paint (`bootLang`); aqui vem a fonte boa, que só existe depois do SDK. Passa por
  // `setLangDaPlataforma` porque a tag deles pode ser "es-ES" ou "pt-PT", e não um id nosso — e porque
  // ela REGISTRA o idioma: num portal o 'auto' das prefs passa a resolver para ele, e não para o
  // navegador (sem isso o `GET /api/me`, que chega com `lang:"auto"`, desfazia a escolha da plataforma
  // 200 ms depois do boot). Escolha explícita do jogador nas Opções continua ganhando.
  // ⚠️ E LÊ MAIS DE UMA VEZ. Medido no adaptador da QA Tool deles: o getter `platformLanguage` AVISA a
  // ferramenta que o jogo leu ("get_language") e, enquanto ela não responde, devolve o idioma do
  // NAVEGADOR. Ou seja, a primeira leitura — a única que existia aqui — chega cedo demais e traz o
  // palpite, não a escolha; é a resposta seguinte que traz o "es" com que eles testam a localização.
  // Reler algumas vezes nos primeiros segundos é barato e resolve sem inventar evento que o SDK não tem.
  { let ultimaTag = "";
    const leIdioma = () => { try { const tag = b.platform && b.platform.language;
      if (tag && String(tag) !== ultimaTag) { ultimaTag = String(tag); setLangDaPlataforma(tag); } } catch { /* idioma nunca derruba o jogo */ } };
    leIdioma(); for (const ms of [400, 1200, 3000, 6000]) setTimeout(leIdioma, ms); }

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
  // ⚠️ SÓ MUTA SE ELA DISSER NÃO, e a assimetria é de propósito: `mudoDeAnuncio(true)` zera o master E
  // TRAVA O `resume()`, então um mudo aplicado no boot é o mais caro de todos — uma plataforma que
  // comece "desligada" e não mande o evento de volta deixa o jogo mudo para sempre, e "No audio. The
  // game should not be completely silent" é um dos findings da certificação deles. Medido no Bridge: o
  // estado nasce ENABLED (o agregador começa vazio), então na prática esta linha não dispara no boot —
  // ela existe para a plataforma que já entra muda por escolha do jogador. Desligar o mudo é sempre o
  // EVENTO acima (ou o `reaplica()` depois de um anúncio nosso).
  if (!audioDaPlataforma()) silenciaAnuncio(true);

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
  // ⚠️ GRAVA NO FIM DE CADA PARTIDA, e não só quando a credencial muda. A primeira versão tinha um
  // `if (t === ultimo) return` que valia para tudo: como a credencial não muda depois do boot, a
  // gravação acontecia UMA vez, no segundo em que o SDK ficava pronto — e a certificação continuou
  // dizendo "the platform did not detect any attempt to save data". A doc deles pede gravar "on
  // meaningful state change (level complete, purchase, settings change)", e o nosso momento é o fim da
  // vida: é quando moedas, nível e recorde mudam de verdade. O dedupe fica só no caminho do STORE, que
  // dispara a cada toast e cada preferência.
  const blob = () => { const s = app.get().session, u = s.user || {}, st = s.stats || {};
    return JSON.stringify({ v: 1, t: u.kind === "registered" ? "" : (api.token || ""), n: u.nick || "",
      // espelho, nunca verdade: quem manda nestes números é o servidor. Estão aqui para o save ter o que
      // um humano reconhece como progresso quando abrir o painel deles.
      c: u.coins | 0, s: +st.bestScore || 0, at: Date.now() });
  };
  const guarda = () => { const st = b.storage; if (!st || !st.set) return;
    try { Promise.resolve(st.set(CHAVE, blob())).catch(() => {}); } catch { /**/ } };
  // ⚠️ GRAVA ANTES DE LER, e a ordem aqui é o conserto de uma falha MUDA. O `get` da Storage deles não
  // é local: no `qa_tool` (e em toda plataforma que implementa o Bridge por postMessage) ele MANDA um
  // `get_data_from_storage` para a página de fora e fica esperando a resposta — e uma resposta que não
  // vem pendura a promessa para sempre, sem erro e sem log. Com o `guarda()` depois do `await`, um
  // silêncio do outro lado apagava a ÚNICA gravação do boot, e a certificação continuava dizendo "the
  // platform did not detect any attempt to save data" com o código do save inteiro no lugar. Agora a
  // gravação é a primeira coisa que acontece, e o `get` tem relógio.
  const idAgora = () => { const u = (app.get().session.user) || {};
    return (u.kind === "registered" ? "r" : "g") + (u.id || "") + ":" + (api.token || ""); };
  guarda();
  const idBoot = idAgora();
  const prazo = (p, ms) => Promise.race([Promise.resolve(p), new Promise(r => setTimeout(() => r(null), ms))]);
  (async () => {
    try {
      const st = b.storage; if (!st || !st.get) return;
      // ⚠️ O `get` é INCONDICIONAL: a ordem que eles pedem é "no game start, storage.get(...) for the
      // keys you need" e é ela que a certificação observa. Quem é condicional é o USO do que voltou.
      const bruto = await prazo(st.get(CHAVE), STORAGE_MS);
      const u = (app.get().session.user) || {};
      const branco = u.kind !== "registered" && !u.login && !u.email && !(u.coins | 0);
      if (branco) {
        const d = JSON.parse((Array.isArray(bruto) ? bruto[0] : bruto) || "null");
        if (d && d.t && d.t !== api.token) { api.adota(d.t); applySession(await api.bootstrap()); }
      }
    } catch { /* nuvem fora: segue com o convidado local, que é o comportamento de sempre */ }
    // Daqui em diante, no store, só quando a IDENTIDADE muda (convidado → registrada, ou a que acabou
    // de ser adotada da nuvem). ⚠️ `ultimo` nasce da identidade de AGORA, nunca de `null`: senão a
    // primeira notificação do store repetiria o `set` do boot, e duas gravações idênticas em sequência
    // são ruído no log de quem revisa.
    let ultimo = idAgora();
    if (ultimo !== idBoot) guarda();   // a adoção trocou a sessão: a nuvem precisa saber
    app.subscribe(() => { const id = idAgora(); if (id === ultimo) return; ultimo = id; guarda(); });
  })();
  aoAcabarAVida(() => guarda());

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

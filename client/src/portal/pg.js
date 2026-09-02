// ── Playgama (o "Playgama Bridge") ────────────────────────────────────────────
// Oitavo portal, e o primeiro cujo SDK é uma FACHADA como esta: o Bridge existe para publicar o mesmo
// zip em dezenas de plataformas (`PLATFORM_ID` traz vk, yandex, crazy_games, game_distribution, poki,
// y8, youtube…), e ele descobre onde está pelo HOSTNAME — daí o `platform_id=playgama` que eles
// penduram na URL do jogo. Do nosso lado nada disso importa: só o vocabulário de sempre.
//
// ⚠️ O ARQUIVO É `pg.js` pela mesma regra que proíbe `ads.js` aqui: o nome vira a URL do chunk e há
//    filtro de bloqueador que casa palavra de publicidade no caminho.
// ⚠️ SEM PREROLL, e a regra é DELES, na letra da doc: "Do not call showInterstitial() at game start;
//    platforms that allow it show it automatically, and calling it explicitly can result in duplicate
//    ads." É o mesmo `semPreroll` da CrazyGames, e é o adaptador que declara — a fachada não sabe.
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
const SRC = import.meta.env.VITE_PG_SDK_URL || "https://bridge.playgama.com/v2/stable/playgama-bridge.js";
const ponte = () => window.bridge || window.playgamaBridge || null;

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

  return {
    semPreroll: true,
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

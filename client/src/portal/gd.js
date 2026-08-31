// ── GameDistribution ──────────────────────────────────────────────────────────
// Preroll e midroll são OBRIGATÓRIOS lá (§2.1 do guia deles), e durante o anúncio o jogo tem que estar
// pausado e mudo, com uma tela de pausa na volta que só sai por ação do jogador. Quem cuida do áudio e
// da tela é `state/actions.js`, pelos callbacks daqui — este arquivo só fala com o SDK.
//
// ⚠️ `window.GD_OPTIONS` tem que existir ANTES do script: ele lê o objeto na carga.
// ⚠️ `SDK_GAME_START` é AMBÍGUO — ele também sai quando o SDK termina de inicializar, sem anúncio
//    nenhum. Por isso só fecha uma promessa PENDENTE; sem essa guarda o primeiro preroll resolveria
//    antes de o anúncio existir, e o jogador entraria na partida por cima dele.
// ⚠️ A URL do script e o gameId vêm de env de build (o painel da GD mostra as duas na aba UPLOAD).
//    Nada de URL de SDK cravada aqui: ela muda e a gente não fica sabendo.
import { carregaScript } from "./script.js";
const SRC = import.meta.env.VITE_GD_SDK_URL || "https://html5.api.gamedistribution.com/main.min.js";
const GAME_ID = import.meta.env.VITE_GD_GAME_ID || "";

export async function criar({ pausou, retomou }) {
  if (!GAME_ID) return null;
  let pendente = null;   // o `ok` da promessa de anúncio em curso, ou null
  const fecha = () => { const p = pendente; pendente = null; if (p) { retomou(); p(); } };

  window.GD_OPTIONS = {
    gameId: GAME_ID,
    onEvent(e) {
      const n = e && e.name;
      if (n === "SDK_GAME_PAUSE") pausou();
      else if (n === "SDK_GAME_START" || n === "SDK_ERROR") fecha();
    },
  };
  if (!(await carregaScript(SRC, "gamedistribution-jssdk"))) return null;

  return {
    anuncio() {
      const gd = window.gdsdk;
      if (!gd || typeof gd.showAd !== "function") return Promise.resolve();
      return new Promise(ok => {
        pendente = ok;
        // `showAd` rejeita quando não há preenchimento — e às vezes nem isso; quem garante o fim é o
        // `SDK_GAME_START` acima, e por último o relógio da fachada (PORTAL.AD_MS).
        Promise.resolve(gd.showAd()).catch(() => { fecha(); });
      });
    },
  };
}

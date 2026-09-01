// ── GameMonetize ──────────────────────────────────────────────────────────────
// O zip sobe pelo painel deles e o jogo passa a rodar em `https://html5.gamemonetize.co/<gameId>/` —
// MEDIDO no feed público (`gamemonetize.com/feed.php`), que é a fonte de verdade sobre onde o jogo
// realmente mora. ⚠️ Repare no **`.co`**: o site é `gamemonetize.com`, mas o jogo é servido do `.co`, e
// liberar só o `.com` em `ALLOWED_ORIGINS` deixaria o pacote carregar bonito e não conectar.
//
// ⚠️ O SDK é o da GameDistribution de primeira geração, com outro nome: mesmo `window.SDK_OPTIONS` lido
//    na CARGA (por isso ele é escrito ANTES do script), mesmos `SDK_GAME_PAUSE`/`SDK_GAME_START` e a
//    mesma ambiguidade — `SDK_GAME_START` também sai quando o SDK termina de inicializar, SEM anúncio
//    nenhum. Daí a guarda de `gd.js` repetida aqui: só fecha promessa PENDENTE. Sem ela o primeiro
//    preroll resolveria antes de o anúncio existir e o jogador entraria na partida por cima dele.
// ⚠️ A DIFERENÇA para a GD, e é a que importa: `showBanner()` (o nome é herdado, mas é o INTERSTICIAL)
//    não devolve promessa nenhuma. Na GD o `showAd()` rejeitava quando não havia preenchimento e isso
//    era uma segunda saída; aqui sobram DUAS — o evento e o relógio de `PORTAL.AD_MS` da fachada. É por
//    isso que o relógio da fachada não é luxo: sem preenchimento e sem evento, ele é o único jeito de o
//    botão JOGAR voltar a funcionar.
// ⚠️ O arquivo se chama `gm.js`, não `gamemonetize.js`, pelo mesmo motivo de não existir `ads.js` aqui:
//    o nome vira a URL do chunk (`assets/gm-<hash>.js`) e há filtro de bloqueador que casa palavra de
//    publicidade no CAMINHO. O `import()` rejeitaria e o adaptador sumiria — em silêncio.
// ⚠️ E o id do <script> é `gamemonetize-sdk`, o MESMO que o carregador deles usa: é o que impede duas
//    cópias do SDK na página se algum dia o snippet oficial for parar no HTML também.
import { carregaScript } from "./script.js";
const SRC = import.meta.env.VITE_GM_SDK_URL || "https://api.gamemonetize.com/sdk.js";
const GAME_ID = import.meta.env.VITE_GM_GAME_ID || "";

export async function criar({ pausou, retomou }) {
  if (!GAME_ID) return null;
  let pendente = null;   // o `ok` da promessa de anúncio em curso, ou null
  const fecha = () => { const p = pendente; pendente = null; if (p) { retomou(); p(); } };

  window.SDK_OPTIONS = {
    gameId: GAME_ID,
    onEvent(e) {
      const n = e && e.name;
      if (n === "SDK_GAME_PAUSE") pausou();
      else if (n === "SDK_GAME_START" || n === "SDK_ERROR") fecha();
    },
  };
  if (!(await carregaScript(SRC, "gamemonetize-sdk"))) return null;

  return {
    anuncio() {
      // o SDK deles publica um global de nome genérico (`window.sdk`); conferir o método antes de
      // chamar é o que impede um TypeError quando um bloqueador entrega um objeto pela metade
      const s = window.sdk;
      if (!s || typeof s.showBanner !== "function") return Promise.resolve();
      return new Promise(ok => {
        pendente = ok;
        try { s.showBanner(); } catch { fecha(); }
      });
    },
  };
}

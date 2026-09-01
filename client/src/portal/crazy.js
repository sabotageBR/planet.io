// ── CrazyGames ────────────────────────────────────────────────────────────────
// Eles hospedam os arquivos e o servidor multiplayer continua sendo o nosso — é o modelo que a própria
// documentação deles descreve. O SDK aqui é mais explícito que o da GD: além do anúncio, ele quer saber
// quando o jogo CARREGA e quando a PARTIDA começa e termina, e usa isso para escolher a hora de anunciar
// e para medir. Por isso `jogoComecou/Parou` existem na fachada mesmo sem equivalente na GD.
//
// ⚠️ O anúncio deles exige, na letra da doc: "mute the audio and pause the game when the ad starts
//    (adStarted callback), and unmute the audio and continue the game when the ad finishes/fails".
//    Quem faz isso é a fachada, pelos callbacks daqui — e `adFinished` e `adError` são o MESMO desfecho
//    para nós: o jogador entra na partida de um jeito ou de outro.
// ⚠️ `requestAd` erra com `adsDisabledBasicLaunch` (jogo ainda em Basic Launch), `unfilled`, `adblock`,
//    `adCooldown` e `other`. Nenhum deles pode segurar o botão JOGAR — daí tudo cair no mesmo `fim`.
// ⚠️ `settings.muteAudio` é o mudo DO SITE deles, e a doc diz que ele tem prioridade sobre o ajuste
//    interno do jogo. Ele muda enquanto se joga (o jogador clica no alto-falante da página), e não há
//    evento documentado — daí a leitura periódica barata. Vai pelo mesmo caminho do mudo de anúncio
//    (`silenciaAnuncio`), que zera o master sem tocar em `prefs.muted`, que é escolha do jogador.
import { carregaScript } from "./script.js";
import { silenciaAnuncio } from "../audio/index.js";
const SRC = import.meta.env.VITE_CRAZY_SDK_URL || "https://sdk.crazygames.com/crazygames-sdk-v3.js";
const MUTE_MS = 2000;
const sdk = () => (window.CrazyGames && window.CrazyGames.SDK) || null;

export async function criar({ pausou, retomou }) {
  if (!(await carregaScript(SRC, "crazygames-sdk"))) return null;
  const s = sdk(); if (!s) return null;
  try { if (s.init) await s.init(); } catch { return null; }
  try { if (s.game && s.game.loadingStart) s.game.loadingStart(); } catch { /* medir não derruba o jogo */ }

  // o mudo do site deles; `emAnuncio` evita que a vigia devolva o som no meio de um anúncio
  let mudo = false, emAnuncio = false;
  setInterval(() => {
    const g = sdk(); const q = !!(g && g.game && g.game.settings && g.game.settings.muteAudio);
    if (q === mudo || emAnuncio) return;
    mudo = q; silenciaAnuncio(q);
  }, MUTE_MS);

  const mod = () => sdk() || {};   // nome diferente do `g` local dos métodos abaixo, de propósito
  return {
    // ── conta (requisito "account integration" deles) ──
    // ⚠️ `getUserToken()` é chamado TODA VEZ que o jogo inicia, e o token NUNCA é guardado: ele vale 1 h
    //    e quem o troca pelo nosso é o servidor. `isUserAccountAvailable` é falso quando a CrazyGames
    //    embute o jogo em domínio de terceiro — aí não há login a oferecer, e o convidado é o caminho.
    temConta() { const u = mod().user; return !!(u && u.isUserAccountAvailable); },
    async identidade() { const u = mod().user;
      if (!u || !u.isUserAccountAvailable || !u.getUserToken) return null;
      const usr = u.getUser ? await u.getUser().catch(() => null) : null;
      if (!usr) return null;   // ninguém logado no portal: joga como convidado, que eles exigem permitir
      return await u.getUserToken(); },
    async pedirLogin() { const u = mod().user; if (!u || !u.showAuthPrompt) return null;
      await u.showAuthPrompt(); return this.identidade(); },
    aoTrocarConta(cb) { const u = mod().user; if (u && u.addAuthListener) u.addAuthListener(() => { cb(); }); },

    // ── sala (o "Full": convidar e ser convidado) ──
    // `roomId` tem que ser único no jogo inteiro a qualquer momento — o nosso código de sala já é isso.
    // `inviteParams` volta para quem aceita o convite, e é dali que sai o código no `aoEntrarNaSala`.
    sala(codigo, aberta) { const j = mod().game; if (!j || !j.updateRoom) return;
      j.updateRoom({ roomId: String(codigo), isJoinable: !!aberta, inviteParams: { sala: String(codigo) } }); },
    saiuDaSala() { const j = mod().game; if (j && j.leftRoom) j.leftRoom(); },
    aoEntrarNaSala(cb) { const j = mod().game; if (!j || !j.addJoinRoomListener) return;
      j.addJoinRoomListener(p => { const c = p && (p.sala || p.roomName); if (c) cb(String(c).toUpperCase()); }); },
    async convite(codigo) { const j = mod().game; if (!j || !j.inviteLink) return null;
      return await j.inviteLink({ sala: String(codigo) }); },

    carregou() { const g = sdk(); if (g && g.game && g.game.loadingStop) g.game.loadingStop(); },
    jogoComecou() { const g = sdk(); if (g && g.game && g.game.gameplayStart) g.game.gameplayStart(); },
    jogoParou() { const g = sdk(); if (g && g.game && g.game.gameplayStop) g.game.gameplayStop(); },
    // ⚠️ Eles PROÍBEM anúncio antes do primeiro gameplay ("should not appear before the user has
    // experienced a reasonable amount of gameplay"), e o jogo mandava preroll em todo portal por igual.
    // Quem lê isto é a fachada.
    semPreroll: true,
    // ⚠️ Reaplicar o mudo DO SITE é a última coisa a acontecer, e por isso mora aqui e não no callback de
    // fim do anúncio: lá ele rodava ANTES do `avisa(aoRetomar)` da fachada, que desmutava por cima — e
    // quem tinha desligado o som na página deles voltava a ouvir o jogo para sempre. Pelo mesmo motivo o
    // `retomou()` saiu do `fim`: quem retoma é a fachada, e chamar duas vezes era o que escondia a ordem.
    reaplica() { if (mudo) silenciaAnuncio(true); },
    anuncio() {
      const g = sdk();
      if (!g || !g.ad || !g.ad.requestAd) return Promise.resolve();
      return new Promise(ok => {
        const fim = () => { emAnuncio = false; ok(); };
        try { emAnuncio = true; g.ad.requestAd("midgame", { adStarted: pausou, adFinished: fim, adError: fim }); }
        catch { fim(); }
      });
    },
  };
}

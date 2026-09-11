// ── O SDK DA POKI, FALSO, PARA A BANCADA ─────────────────────────────────────
// Não é mock de teste: é um MEDIDOR. Ele existe para responder, sem gastar uma das duas submissões
// diárias do Player Fit Test, a única pergunta que o painel deles não devolve — **o nosso
// `gameplayStart` sai com interação atrás?**
//
// ⚠️ A REGRA É DELES E ESTÁ NO CÓDIGO, NÃO NA DOC. Lido no bundle real (`poki-sdk-core-<hash>.js`), o
//    SDK anexa `interaction: getRecentInteraction()` a todo `gameplayStart`, e o Inspector
//    (`inspector.poki.dev/main.js`) reprova com `const {interaction}=e.payload.data; if(!interaction)`.
//    O rastreador é literalmente isto, e é o que este arquivo replica verbatim:
//        startTrackingInteractions = () => { window.addEventListener("pointerdown", h);
//                                            document.addEventListener("keydown",  h); }
//        getRecentInteraction     = () => { if (performance.now() - ultimo < 5000) return interacao }
//    Ou seja: `pointermove` NÃO conta, e uma chamada mais de 5 s depois do input também não.
//
// ⚠️ POR QUE ELE NASCEU: o Fit Test 1.21 moveu ~34 sessões do bin 1–2 min para o 0–1 min sem que nada
//    no caminho até o primeiro input tivesse mudado. O suspeito é a primeira morte, que passou a
//    renascer sozinha em 1,2 s — e um respawn automático não tem gesto do jogador, então o
//    `gameplayStart` do outro lado saía INVÁLIDO. Este arquivo é o que transforma isso de palpite em
//    leitura.
//
// USO (ver docs/spec/portais.md):
//   WARSPACE_API_BASE=http://127.0.0.1:3002 VITE_POKI_SDK_URL=./poki-sdk.js \
//     node scripts/portal-pack.mjs poki
//   cp scripts/poki-stub.js portal/poki/dist/poki-sdk.js
//   python3 -m http.server 4173 --directory portal
//   ...e no console: `__sdkResumo()` — ou `__sdkLog` para a sequência crua.
(function () {
  "use strict";
  var t0 = performance.now(), log = [];
  // ── o rastreador de interação, verbatim ──
  var ultimo = -1e9, interacao = null;
  function bate(e) { ultimo = performance.now(); interacao = { type: e.type }; }
  window.addEventListener("pointerdown", bate);
  document.addEventListener("keydown", bate);
  function getRecentInteraction() { if (performance.now() - ultimo < 5000) return interacao; }

  function reg(nome, extra) {
    var l = { t: Math.round(performance.now() - t0), nome: nome };
    if (extra) for (var k in extra) l[k] = extra[k];
    log.push(l);
    var cor = l.veredito === "INVALIDO" ? "color:#e33;font-weight:bold" : "color:#888";
    console.log("%c[sdk] " + (l.t / 1000).toFixed(2) + "s " + nome + (l.veredito ? " " + l.veredito : "")
      + (l.arg ? " " + l.arg : ""), cor);
    return l;
  }

  window.PokiSDK = {
    init: function () { reg("init"); return Promise.resolve(); },
    gameLoadingStart: function () { reg("gameLoadingStart"); },
    gameLoadingFinished: function () { reg("gameLoadingFinished"); },
    // ⚠️ É AQUI QUE A BANCADA GANHA O DIA: o veredito é o MESMO `if(!interaction)` do Inspector deles.
    gameplayStart: function () {
      var i = getRecentInteraction();
      reg("gameplayStart", { veredito: i ? "VALIDO" : "INVALIDO",
        arg: i ? "(" + i.type + ", há " + Math.round(performance.now() - ultimo) + "ms)"
               : (ultimo < 0 ? "(nunca houve input)" : "(último input há " + Math.round(performance.now() - ultimo) + "ms)") });
    },
    gameplayStop: function () { reg("gameplayStop"); },
    commercialBreak: function (aoPausar) { reg("commercialBreak");
      if (aoPausar) try { aoPausar(); } catch (e) {}
      return Promise.resolve(); },
    rewardedBreak: function () { reg("rewardedBreak"); return Promise.resolve(true); },
    measure: function (c, o, a) { reg("measure", { arg: c + "/" + o + "/" + a }); },
    openExternalLink: function (u) { reg("openExternalLink", { arg: u }); },
  };

  window.__sdkLog = log;
  /** O que interessa numa linha: a sequência, e se algum `gameplayStart` saiu sem interação. */
  window.__sdkResumo = function () {
    var starts = log.filter(function (l) { return l.nome === "gameplayStart"; });
    var maus = starts.filter(function (l) { return l.veredito === "INVALIDO"; });
    return { eventos: log.length, gameplayStart: starts.length, invalidos: maus.length,
      seq: log.map(function (l) { return (l.t / 1000).toFixed(2) + "s " + l.nome
        + (l.veredito ? " " + l.veredito : "") + (l.arg ? " " + l.arg : ""); }) };
  };
  console.log("%c[sdk] stub da Poki no ar — __sdkResumo() para o veredito", "color:#2ee6ff");
})();

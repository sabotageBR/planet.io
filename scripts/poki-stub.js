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
// ⚠️ **E O SEGUNDO MEDIDOR: O RELÓGIO DO PLAYER FIT TEST** (`__sdkFit()`), também lido no bundle deles
//    (`poki-sdk-core-1712989e….js`, a função que o `?playerfit_test_id=` liga e que manda a
//    `mystery-game-tile.poki.io/v0/metric` a cada 10 s). É ESTE número que vira "average playtime" e
//    "engaged players" no painel — e ele tem uma regra que nenhuma doc conta:
//        setInterval(()=>{ const l=performance.now();
//          if(!o){ n=l; if(l-Math.max(Vd,Yd())>6e4) o=!0 }     // 60 s sem sinal → timed_out
//          envia({duration:n,total_duration:l,timed_out:o,have_interaction:Yd()>0,…}) },1e4)
//    `Yd()` = o último `pointerdown`/`keydown` do MESMO rastreador de BOLHA de cima; `Vd` = o último evento
//    RASTREADO do SDK (`gameplayStart/Stop`, `commercialBreak`, `rewardedBreak`, `gameLoadingFinished` — o
//    `measure()` NÃO: ele mora no carregador e não passa pelo `track`). E **`o` nunca volta a false**: 60 s
//    sem um toque/tecla que o SDK VEJA e a duração daquele jogador fica CONGELADA para sempre, jogue ele o
//    quanto jogar. `pointermove` não conta — dirigir com o mouse é invisível.
//    Por que isto importa AQUI: o `down` do direcional de toque (`client/src/game/input/Joystick.js`) dava
//    `stopPropagation()` em captura, então NO CELULAR o SDK nunca via o toque que dirige o planeta — o
//    relógio deles congelava ~60 s depois do último botão do tutorial, em ~2m10, que é a média que o painel
//    devolveu em TODA rodada. Quem mede o antes/depois é `scripts/poki-fit-bancada.mjs`.
//    `window.__fitTimeoutMs`/`__fitTickMs` (antes do script) encurtam os 60 s/10 s para a bancada.
//
// USO (ver docs/spec/portais.md):
//   WARSPACE_API_BASE=http://127.0.0.1:3002 VITE_POKI_SDK_URL=./poki-sdk.js \
//     node scripts/portal-pack.mjs poki
//   cp scripts/poki-stub.js portal/poki/dist/poki-sdk.js
//   python3 -m http.server 4173 --directory portal
//   ...e no console: `__sdkResumo()` e `__sdkFit()` — ou `__sdkLog` para a sequência crua.
(function () {
  "use strict";
  var t0 = performance.now(), log = [];
  // ── o rastreador de interação, verbatim ──
  var ultimo = -1e9, interacao = null, Qd = 0;
  function bate(e) { ultimo = performance.now(); Qd = ultimo; interacao = { type: e.type }; }
  window.addEventListener("pointerdown", bate);
  document.addEventListener("keydown", bate);
  function getRecentInteraction() { if (performance.now() - ultimo < 5000) return interacao; }

  // ── o relator do Player Fit Test, verbatim (ver o cabeçalho) ──
  var Vd = 0, fitN = 0, fitO = false, fitEm = 0;
  var RASTREADOS = { gameLoadingFinished: 1, gameplayStart: 1, gameplayStop: 1, commercialBreak: 1, rewardedBreak: 1 };
  var FIT_TIMEOUT = +window.__fitTimeoutMs || 6e4, FIT_TICK = +window.__fitTickMs || 1e4;
  setInterval(function () {
    var l = performance.now();
    if (!fitO) { fitN = l; if (l - Math.max(Vd, Qd) > FIT_TIMEOUT) { fitO = true; fitEm = l;
      console.log("%c[sdk] FIT TEST: timed_out aos " + (l / 1000).toFixed(1) + "s — a duração CONGELOU (último sinal há "
        + Math.round((l - Math.max(Vd, Qd)) / 1000) + "s)", "color:#e33;font-weight:bold"); } }
  }, FIT_TICK);
  /** O que o painel deles leria deste jogador AGORA. `duration` é o que entra na média e no "engaged". */
  window.__sdkFit = function () { var l = performance.now();
    return { duration: Math.round((fitO ? fitN : l) / 1000), total: Math.round(l / 1000), timedOut: fitO,
      congelouAos: fitO ? Math.round(fitEm / 1000) : null, haveInteraction: Qd > 0,
      ultimoSinalHa: Math.round((l - Math.max(Vd, Qd)) / 1000), timeoutS: FIT_TIMEOUT / 1000 }; };

  function reg(nome, extra) {
    if (RASTREADOS[nome]) Vd = performance.now();
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

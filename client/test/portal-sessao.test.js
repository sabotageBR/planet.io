// ── O RELÓGIO DA SESSÃO DO PORTAL ─────────────────────────────────────────────
// `passoSessao` é a conta que a Poki lê. O funil anterior media a VIDA e por isso o painel deles
// dizia "saiu em segundos" sobre quem estava na sala há dez minutos; o que este teste trava é o que
// separa uma coisa da outra — o tempo é da SESSÃO, corre enquanto o jogador está retido (partida,
// tela de morte, pódio), para quando ele volta ao menu, e cada marco sai UMA vez.
// node --test client/test/portal-sessao.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { passoSessao, MARCOS, SESSAO0 } from "../src/portal/sessao.js";

const S = n => n * 1000;

test("os marcos são os combinados, em ordem crescente", () => {
  assert.deepEqual(MARCOS, [60, 180, 300]);
  assert.deepEqual([...MARCOS].sort((a, b) => a - b), MARCOS);
});

test("parado no menu, o relógio não anda e nada vence", () => {
  let est = SESSAO0;
  for (const t of [0, S(60), S(600), S(3600)]) {
    const r = passoSessao(est, false, t); est = r.est;
    assert.deepEqual(r.marcos, [], `t=${t}`);
    assert.equal(r.emMs, null);          // fora da sala não se agenda nada
    assert.equal(est.acum, 0);
  }
});

test("retido, cada marco sai uma vez e na hora certa", () => {
  let est = passoSessao(SESSAO0, true, 0).est;
  assert.equal(passoSessao(est, true, 0).emMs, S(60), "o primeiro prazo é o primeiro marco");

  let r = passoSessao(est, true, S(59)); est = r.est;
  assert.deepEqual(r.marcos, [], "59 s ainda não é 60");
  assert.equal(r.emMs, S(1));

  r = passoSessao(est, true, S(60)); est = r.est;
  assert.deepEqual(r.marcos, [60]);
  assert.equal(r.emMs, S(120), "o prazo passa a ser o que falta para 180");

  r = passoSessao(est, true, S(61)); est = r.est;
  assert.deepEqual(r.marcos, [], "não repete o que já saiu");

  r = passoSessao(est, true, S(180)); est = r.est;
  assert.deepEqual(r.marcos, [180]);

  r = passoSessao(est, true, S(300)); est = r.est;
  assert.deepEqual(r.marcos, [300]);
  assert.equal(r.emMs, null, "depois do último marco não há mais o que agendar");

  r = passoSessao(est, true, S(9999));
  assert.deepEqual(r.marcos, [], "e nunca mais sai nada");
});

test("um salto longo cobre todos os marcos vencidos, na ordem, sem pular nenhum", () => {
  const est = passoSessao(SESSAO0, true, 0).est;
  const r = passoSessao(est, true, S(400));
  assert.deepEqual(r.marcos, [60, 180, 300]);
  assert.equal(r.emMs, null);
});

test("o tempo no menu NÃO conta: sair e voltar continua de onde parou", () => {
  // 40 s em partida, 10 min no menu, mais 25 s de volta = 65 s de sessão → o marco de 60 vence agora.
  let r = passoSessao(SESSAO0, true, 0);           // entrou
  r = passoSessao(r.est, false, S(40));            // saiu para o menu com 40 s
  assert.deepEqual(r.marcos, []);
  assert.equal(r.est.acum, S(40));
  r = passoSessao(r.est, true, S(640));            // voltou 10 min depois
  assert.deepEqual(r.marcos, [], "os 600 s de menu não contaram");
  assert.equal(r.est.acum, S(40));
  assert.equal(r.emMs, S(20), "faltam 20 s para o primeiro marco");
  r = passoSessao(r.est, true, S(665));
  assert.deepEqual(r.marcos, [60]);
});

test("a tela de morte e o pódio contam — é o ponto todo", () => {
  // o chamador decide o predicado; aqui se prova que `retido` verdadeiro faz o tempo correr igual,
  // venha ele de `game`, de `dead` ou de `round`.
  let est = passoSessao(SESSAO0, true, 0).est;
  const r = passoSessao(est, true, S(200));        // 200 s sem sair da sala, morrendo ou não
  assert.deepEqual(r.marcos, [60, 180]);
});

test("relógio que anda para trás não desconta tempo", () => {
  // `Date.now()` pode recuar (ajuste de NTP, aba suspensa). Recuar o acumulado faria um marco já
  // reportado voltar a ser devido — e o SDK recusa evento repetido.
  let r = passoSessao(SESSAO0, true, S(100));
  r = passoSessao(r.est, true, S(50));
  assert.ok(r.est.acum >= 0);
  assert.deepEqual(r.marcos, []);
});

test("é pura: não escreve no estado que recebe", () => {
  const est = { acum: S(59), desde: 0, feitos: 0 }, copia = { ...est };
  passoSessao(est, true, S(120));
  assert.deepEqual(est, copia);
});

// ── A SEQUÊNCIA QUE CHEGA AO SDK ──────────────────────────────────────────────
// É este o teste que trava o defeito do relatório da Poki. Eles cobram duas coisas por escrito:
// `gameplayStop()` em TODA interrupção (pausa, menu, fim de nível, morte) e nenhum evento repetido
// ("a gameplayStart() cannot follow another gameplayStart()"). O jogo cumpria nenhuma das duas — o
// único fechamento era `leaveGame()`, então a tela de morte inteira contava como jogo ativo.
import { iniciaSessaoPortal } from "../src/portal/sessao.js";
import { PORTAL } from "@warspace/shared";

/** Um store com a mesma forma do `app` (get/subscribe/update), sem React e sem o resto do jogo. */
const storeFalso = (st0) => {
  let st = st0; const subs = new Set();
  return { get: () => st, subscribe(f) { subs.add(f); return () => subs.delete(f); },
    vai(p) { st = { ...st, ...p, overlays: { ...st.overlays, ...(p.overlays || {}) } }; for (const f of subs) f(st); } };
};
// ⚠️ `conn` continua no estado por REALISMO (`play()` escreve `screen:"game"` e `conn:"connecting"` no
// mesmo update, e `onConnection` fecha depois), mas `ATIVO` NÃO o lê mais — ver o bloco em sessao.js.
const TELA0 = { screen: "entry", conn: "idle", overlays: { pause: false, tab: false, account: false, reconn: false } };
/** O passo "entrei na partida e o WS confirmou" — o par que `play()` + `onConnection` produzem. */
const jogando = () => ({ screen: "game", conn: "connected" });

// ⚠️ O GESTO É INJETADO. A Poki exige `gameplayStart` no PRIMEIRO INPUT do jogador, então o detector real
// (`Activity.js`) escuta o DOM — que não existe aqui. `"GESTO"` no meio de um roteiro dispara o latch; por
// padrão ele já está armado antes do primeiro passo, que é o que todo roteiro anterior a esta regra
// presumia (no site o clique em JOGAR arma, e no pacote o jogador mexe no mouse assim que a arena abre).
const roteiro = (passos, { gestoAntes = true } = {}) => {
  const store = storeFalso(TELA0), log = [];
  const alvo = { comecou: () => log.push("start"), parou: () => log.push("stop"), medir: () => {} };
  let dispara = () => {};
  const off = iniciaSessaoPortal(alvo, store, () => 0, cb => { dispara = cb; return () => {}; });
  if (gestoAntes) dispara();
  for (const p of passos) { if (p === "GESTO") dispara(); else store.vai(p); }
  off();
  return log;
};

// ── A MORTE SEM TELA NÃO É UMA INTERRUPÇÃO ───────────────────────────────────
// Foi o defeito que custou o Fit Test 1.21, e ele não tinha teste nenhum: o campo (então chamado `morto`)
// era escrito `true` em TODA morte, então a primeira — a que renasce sozinha em 1,2 s, sem modal, sem
// menu e sem anúncio — passou a emitir um `gameplayStop` e, logo depois, um `gameplayStart` que o SDK
// deles recusa por não ter `pointerdown`/`keydown` atrás (o respawn é automático: não há gesto nenhum).
// Quem declara a interrupção é `onDead`, com `interrompido: !sozinho`; aqui se trava o efeito disso.
test("a morte que renasce sozinha não fecha o gameplay: o SDK vê UMA partida contínua", () => {
  const log = roteiro([
    jogando(),                                        // entrou
    { interrompido: false },                          // MORREU, e a morte não abre tela: `screen` fica "game"
    { flash: 1 },                                     // o clarão
    { screen: "game", interrompido: false },          // renasceu 1,2 s depois
  ]);
  assert.deepEqual(log, ["start"],
    "nenhum stop/start no meio — é o par que produzia o `gameplayStart` sem interação");
});

test("...mas a morte QUE ABRE TELA fecha, que é o requisito escrito da Poki", () => {
  const log = roteiro([
    jogando(),
    { interrompido: true },                           // 2ª morte em diante: o cartão vem, e antes dele o stop
    { screen: "dead" },                               // ...a tela sobe 1,2 s depois (ROUND.DEAD_DELAY_MS)
  ]);
  assert.deepEqual(log, ["start", "stop"],
    "`interrompido` é o que antecipa o stop em ROUND.DEAD_DELAY_MS, e ele tem que continuar saindo");
});

test("a sessão típica: entrar, morrer, renascer, fim de rodada, sair", () => {
  const log = roteiro([
    jogando(),                       // entrou na partida
    { screen: "dead" },                       // MORREU — o `stop` que nunca saía
    { screen: "dead" },                       // continua assistindo: nada novo
    jogando(),                       // renasceu
    { screen: "round" },                      // BIG CRUNCH
    { screen: "lobby" },                      // saiu
  ]);
  assert.deepEqual(log, ["start", "stop", "start", "stop"]);
});

test("a pausa é interrupção — a Poki pede isso na letra", () => {
  assert.deepEqual(roteiro([
    jogando(), { overlays: { pause: true } }, { overlays: { pause: false } }, { screen: "lobby" },
  ]), ["start", "stop", "start", "stop"]);
});

test("o painel do TAB NÃO para o jogo: o planeta continua seguindo o mouse por baixo dele", () => {
  assert.deepEqual(roteiro([
    jogando(), { overlays: { tab: true } }, { overlays: { tab: false } },
  ]), ["start"]);
});

test("nunca sai start-após-start nem stop-após-stop, em nenhum roteiro", () => {
  const roteiros = [
    [jogando(), jogando(), jogando()],
    [{ screen: "dead" }, { screen: "round" }, { screen: "lobby" }, { screen: "entry" }],
    [jogando(), { overlays: { pause: true } }, { screen: "dead" }, { overlays: { pause: false } },
     jogando(), jogando(), { screen: "shop" }],
  ];
  for (const r of roteiros) {
    const log = roteiro(r);
    for (let i = 1; i < log.length; i++) assert.notEqual(log[i], log[i - 1], `repetiu em ${JSON.stringify(log)}`);
  }
});

test("nada é emitido enquanto o jogador está fora da partida", () => {
  assert.deepEqual(roteiro([{ screen: "modes" }, { screen: "lobby" }, { screen: "shop" }, { screen: "dead" }]), []);
});

test("o funil abre UMA vez por carga, na primeira vez que ele entra na sala", () => {
  const store = storeFalso(TELA0), m = [];
  // gesto no-op: este teste é do FUNIL, que mede presença e não depende de input nenhum
  const off = iniciaSessaoPortal({ comecou(){}, parou(){}, medir: (c, o, a) => m.push(`${c}/${o}/${a}`) }, store, () => 0, () => () => {});
  store.vai(jogando()); store.vai({ screen: "dead" }); store.vai(jogando());
  off();
  assert.deepEqual(m, ["session/60s/start", "session/180s/start", "session/300s/start"]);
});

// ── ASSISTIR NÃO É GAMEPLAY ───────────────────────────────────────────────────
// `spec` (assistir a uma sala em andamento) entrou no RETIDO — quem assiste está aqui, e deixá-lo de fora
// faria o funil contar como evasão quem foi ver uma partida. Mas ele NÃO pode entrar no ATIVO: um
// `gameplayStart()` sem partida é justamente o que os dois portais cobram por escrito ("a gameplayStart()
// cannot follow another gameplayStart()", e o par tem que descrever jogo de verdade). Este teste existe
// porque a distinção mora numa linha só, e trocá-la não quebra nada visível.
test("assistir não emite gameplay: é RETIDO, não é ATIVO", () => {
  assert.deepEqual(roteiro([{ screen: "spec" }, { screen: "spec" }, { screen: "lobby" }]), []);
});

test("sair de assistir para jogar abre o gameplay UMA vez", () => {
  assert.deepEqual(roteiro([
    { screen: "spec" },     // estava assistindo
    { screen: "lobby" },    // saiu
    jogando(),     // agora entrou de verdade
    { screen: "dead" },
  ]), ["start", "stop"]);
});

test("a espera de ROUND.DEAD_DELAY_MS não produz evento nenhum a mais", () => {
  // Durante a espera entre a morte e a tela, `screen` continua "game" — o jogador está vendo o próprio
  // planeta estourar. O `stop` sai UMA vez, quando a tela finalmente entra.
  assert.deepEqual(roteiro([
    jogando(),     // jogando
    jogando(),     // morreu, mas a tela ainda não subiu (a espera)
    { screen: "dead" },     // a tela entrou
    { screen: "lobby" },
  ]), ["start", "stop"]);
});

// ── O GAMEPLAY NÃO PODE SER REFÉM DO NOSSO SERVIDOR ──────────────────────────
// Isto já foi o contrário: `ATIVO` cobrava `conn === "connected"` para não contar o handshake do join
// (até `JOIN_TIMEOUT_MS`, 3 s) como playtime. A intenção era boa e o efeito foi grave — enquanto a
// conexão não fechasse, o evento mais importante do SDK simplesmente NÃO EXISTIA. Medido em bancada com
// um SDK instrumentado e o servidor fora: `gameLoadingStart` · `gameLoadingFinished` ·
// `connect/match/fail`, e nada mais, nunca. No Inspector da Poki isso é o caso NORMAL: o Restart deles
// recarrega o jogo enquanto a sessão anterior ainda segura o nick por `NET.RESUME_MS` (10 s), o join é
// recusado três ou quatro vezes seguidas, e o checklist reprova em "Is a gameplayStart() event fired at
// the start of gameplay?". A 1.13, que passava, não tinha esta condição.
//
// ⚠️ ESTES DOIS TESTES SÃO A MEMÓRIA DESSA DECISÃO. Eles afirmavam o oposto, palavra por palavra, e é
// por isso que a reversão não podia ser só apagar uma condição: quem reintroduzir o `conn` os deixa
// vermelhos e lê aqui o porquê. O preço aceito é ~1-3 s de handshake dentro do playtime.

// ── O PRIMEIRO INPUT ─────────────────────────────────────────────────────────
// Regra ESCRITA da Poki: *"gameplayStart() must fire on the player's first input (not on load)"*
// (developers.poki.com/guide/requirements-quality). Até a 1.13 ela era cumprida por acidente de fluxo —
// o jogador clicava em JOGAR na tela inicial e ESSE era o input. O boot direto da 1.14 tirou o clique, e
// o evento virou um evento de carga: exatamente o que o parêntese deles proíbe, e o item que o Inspector
// marcava em vermelho enquanto tudo o mais parecia certo no Event Log.

test("SEM GESTO NÃO HÁ GAMEPLAY: entrar na arena sozinho não abre o evento", () => {
  assert.deepEqual(roteiro([jogando()], { gestoAntes: false }), [],
    "gameplayStart na carga é o que a Poki proíbe na letra");
  assert.deepEqual(roteiro([jogando(), "GESTO"], { gestoAntes: false }), ["start"],
    "e o gesto o abre, ainda que a tela já estivesse lá");
});

test("o gesto é LATCH da carga: depois dele, despausar não espera input novo", () => {
  assert.deepEqual(roteiro([jogando(), "GESTO", { overlays: { pause: true } }, { overlays: { pause: false } }],
    { gestoAntes: false }), ["start", "stop", "start"]);
});

test("gesto FORA da partida não abre gameplay nenhum — quem decide SE há jogo continua sendo a tela", () => {
  assert.deepEqual(roteiro(["GESTO", { screen: "shop" }, { screen: "dead" }], { gestoAntes: false }), []);
});

test("o gameplay abre com a TELA, não com o WS — nem que a conexão nunca feche", () => {
  assert.deepEqual(roteiro([{ screen: "game", conn: "connecting" }]), ["start"],
    "esperar o `connected` faz o gameplayStart deixar de existir quando o join é recusado");
  // e o caso do Inspector: entra, o join falha, o pacote tenta de novo — o par continua coerente.
  assert.deepEqual(roteiro([{ screen: "game", conn: "connecting" }, { conn: "closed" }, { conn: "connecting" }]),
    ["start"], "o start sai UMA vez: quem impede a repetição é o trinco `emJogo` da fachada");
});

test("uma RECONEXÃO não fecha o gameplay: quem fecha é sair da tela", () => {
  // Ela FOI tratada como interrupção enquanto o `conn` valia. Sem ele, cair e voltar não produz mais
  // stop/start — e é o certo: o planeta continua na sala, o jogador continua olhando para ele, e o
  // overlay de reconexão é do jogo, não do portal. Quem interrompe de verdade continua interrompendo:
  // a pausa, a morte, o pódio e sair (os testes acima).
  assert.deepEqual(roteiro([jogando(), { conn: "reconnecting" }, { conn: "connected" }]), ["start"]);
  assert.deepEqual(roteiro([jogando(), { overlays: { pause: true } }]), ["start", "stop"]);
});

test("mas a RETIDÃO não depende da conexão: quem está reconectando continua na sala", () => {
  // o funil de sessão mede quem está AQUI, não quem está jogando — é a distinção que o arquivo inteiro
  // existe para manter, e o `conn` não pode vazar para ela
  const store = storeFalso(TELA0), marcos = [];
  const alvo = { comecou: () => {}, parou: () => {}, medir: (c, o, a) => marcos.push(`${c}/${o}/${a}`) };
  let t = 0;
  const off = iniciaSessaoPortal(alvo, store, () => t, () => () => {});   // sem gesto: o funil não o exige
  store.vai({ screen: "game", conn: "connecting" });
  assert.ok(marcos.some(m => m === "session/60s/start"), "o relógio da sessão abre com a tela, não com o WS");
  off();
});

// ── A JANELA DE INTERAÇÃO: O START ADIADO ────────────────────────────────────
// Isto é a correção de raiz do defeito que custou o Fit Test 1.21 e reapareceu inteiro na cauda da
// 1.26. O `gesto` era um LATCH de uma vez por carga de página, então do SEGUNDO `gameplayStart` em
// diante ninguém conferia recência — e o SDK deles confere em TODOS: ele anexa
// `interaction: getRecentInteraction()`, vazio passados 5 s, e o validador é `if(!interaction) FALHA`.
// Os três caminhos abaixo são os que foram medidos saindo INVÁLIDOS em campo, e nenhum tinha teste:
// o roteiro antigo ia `game → dead → game → round → lobby` e parava — a reentrada `round → game`
// (`ui/Round.jsx`, um `setInterval` depois de ~17 s de pódio) nunca era exercitada.
const relogio = () => { const r = { t: 0 }; r.agora = () => r.t; r.anda = ms => { r.t += ms; }; return r; };
/** Como `roteiro`, mas com o tempo na mão: `["ANDA", ms]` avança o relógio, `"GESTO"` dispara um input. */
const roteiroT = passos => {
  const store = storeFalso(TELA0), log = [], rel = relogio();
  const alvo = { comecou: () => log.push("start"), parou: () => log.push("stop"), medir: () => {} };
  let dispara = () => {};
  const off = iniciaSessaoPortal(alvo, store, rel.agora, cb => { dispara = cb; return () => {}; });
  for (const p of passos) {
    if (p === "GESTO") dispara();
    else if (Array.isArray(p) && p[0] === "ANDA") rel.anda(p[1]);
    else store.vai(p);
  }
  off();
  return log;
};

test("o BIG CRUNCH reentra na sala sozinho: o start ESPERA o gesto em vez de sair inválido", () => {
  // `ui/Round.jsx` chama `play({})` por `setInterval` depois de ROUND.BREAK_MS (15 s) + a abertura de
  // 2 s. Não há clique nenhum nesse caminho — é o propósito da tela —, então o start nascia com
  // `interaction` vazio e o relógio de playtime deles parava justo em quem já estava engajado.
  const log = roteiroT([
    "GESTO", jogando(),          // jogou a rodada inteira
    { screen: "round" },         // BIG CRUNCH: stop
    ["ANDA", 17000],             // pódio + abertura, sem um único pointerdown
    jogando(),                   // reentrou sozinho na sala nova
  ]);
  assert.deepEqual(log, ["start", "stop"], "o segundo start NÃO pode sair aqui: não há interação atrás dele");

  const comGesto = roteiroT([
    "GESTO", jogando(), { screen: "round" }, ["ANDA", 17000], jogando(),
    "GESTO",                     // ...e o primeiro toque na sala nova solta o que estava pendente
  ]);
  assert.deepEqual(comGesto, ["start", "stop", "start"], "adiar, nunca descartar");
});

test("o respawn automático da tela de morte também espera — `armAt` vem de `pointermove`", () => {
  // `ui/deadClock.js` arma a contagem com `game/input/Activity.js`, que conta movimento de mouse (8 px).
  // A Poki NÃO conta `pointermove`. Num `.io` o jogador dirige com o mouse, então ele pode passar a
  // partida inteira sem um `pointerdown` — foi medido `último input há 29190ms` na bancada.
  const log = roteiroT([
    "GESTO", jogando(),
    { screen: "dead", interrompido: true },   // 2ª morte em diante: o cartão vem
    ["ANDA", 8000],                           // ele lê o cartão mexendo o mouse, sem clicar
    { screen: "game", interrompido: false },  // a contagem venceu e renasceu sozinho
  ]);
  assert.deepEqual(log, ["start", "stop"]);
});

test("gesto RECENTE vale, gesto velho não — e a janela é menor que a do SDK", () => {
  assert.ok(PORTAL.INTERACAO_MS < 5000,
    "a janela do `getRecentInteraction` é 5000 ms; a nossa tem que ser menor, nunca igual");
  // dentro da janela: o clique que abriu a tela ainda conta
  assert.deepEqual(roteiroT(["GESTO", ["ANDA", PORTAL.INTERACAO_MS - 1], jogando()]), ["start"]);
  // fora dela: é o caso do midroll, que separa o clique do `screen:"game"` por até PORTAL.AD_MS
  assert.deepEqual(roteiroT(["GESTO", ["ANDA", PORTAL.INTERACAO_MS], jogando()]), []);
});

test("sem NENHUM gesto nada sai, como antes — o boot direto não produz start de carga", () => {
  // a regra escrita deles: "gameplayStart() must fire on the player's first input (not on load)"
  assert.deepEqual(roteiroT([jogando(), ["ANDA", 60000], jogando()]), []);
});

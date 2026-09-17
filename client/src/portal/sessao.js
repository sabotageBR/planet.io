// ── A SESSÃO, VISTA DO STORE ──────────────────────────────────────────────────
// Duas coisas que o portal precisa saber e que o jogo não estava contando direito: QUANDO o jogador
// está de fato jogando (o par `gameplayStart`/`gameplayStop`) e HÁ QUANTO TEMPO ele está aqui.
//
// ⚠️ ISTO NASCEU DE UM RELATÓRIO ERRADO DA POKI. O funil que existia (`survival/60s|120s|180s`) abria
//    em `onConnection` e fechava em `onDead` com o `durationS` da VIDA — e, desde que renascer virou
//    `{t:"respawn"}` na MESMA conexão, o `start` nunca mais reabria: um QA que ficava 12 minutos e
//    morria 14 vezes mandava 3 aberturas e 42 fechamentos, quase todos `fail`, cada um com 15–40 s.
//    Num agar morrer em menos de um minuto é a vida NORMAL de um planeta, não abandono — mas no painel
//    deles aquilo lia, literalmente, "saíram em poucos segundos", enquanto o /admin mostrava a mesma
//    gente na sala. Vida não é sessão, e era esse o erro: aqui se mede a SESSÃO.
//
// ⚠️ SÃO DOIS PREDICADOS, E CONFUNDI-LOS DESFAZ AS DUAS MEDIDAS:
//      · jogo ATIVO   = `screen==="game"` SEM a pausa por cima  → é o que o SDK chama de gameplay, e a
//        Poki exige na letra ("gameplayStop() must fire on any gameplay interruption (pause, menu
//        open, level end, cutscene)"). Tela de morte e pódio NÃO são jogo ativo.
//      · sessão RETIDA = `screen` em `game|dead|round`          → é o que o funil conta, porque quem
//        está na tela de morte assistindo, ou lendo o pódio, continua NA SALA. Contar só o jogo ativo
//        devolveria o mesmo defeito que este arquivo existe para consertar.
//
// ⚠️ PELO STORE, e não por `if (PORTAL)` espalhado nos chamadores — é o molde de `app/analytics.js` e
//    de `portal/bb.js`, que já resolvia isto assim para a Bounty Board e nunca valeu para os pacotes.
//    Entrar em partida, pausar, morrer, o BIG CRUNCH e sair são todos ESCRITAS NO STORE, então uma
//    assinatura cobre os cinco sem depender de montagem de componente e sem esquecer um caminho novo.
// ⚠️ Fala com a FACHADA (`portal.jogoComecou`/`jogoParou`/`medir`), nunca com um SDK: assim vale para
//    todos os portais de uma vez, e no site — onde não há adaptador — é no-op por construção. A Bounty
//    Board não duplica porque `bb.js` fala DIRETO com o SDK dela e não expõe `jogoComecou`/`jogoParou`.
import { app } from "../state/app.js";
import { portal } from "./index.js";

/** Os marcos do funil, em segundos. `60` é "passou da primeira morte"; `180` é a pergunta dos 3 minutos. */
export const MARCOS = [60, 180, 300];

/** @typedef {{acum:number,desde:number|null,feitos:number}} EstSessao */
/** O relógio zerado. `desde` null = não está contando; `feitos` = índice do próximo marco. */
export const SESSAO0 = { acum: 0, desde: null, feitos: 0 };

/**
 * O passo do relógio da sessão — PURA, porque é a conta que precisa ser conferida e não há jsdom aqui
 * (o molde é `game/quality.js`, `ui/roundClock.js` e `admin/ordenar.js`).
 *
 * Fecha o intervalo aberto, decide quais marcos venceram AGORA e diz em quanto tempo cai o próximo —
 * o store não muda de segundo em segundo, então quem acorda o marco é um `setTimeout` com esse prazo.
 *
 * @param {EstSessao} est estado anterior
 * @param {boolean} retido o jogador está na sala neste instante?
 * @param {number} agora `Date.now()`
 * @returns {{est:EstSessao, marcos:number[], emMs:number|null}}
 */
export function passoSessao(est, retido, agora) {
  const acum = est.desde != null ? est.acum + Math.max(0, agora - est.desde) : est.acum;
  const marcos = []; let feitos = est.feitos | 0;
  while (feitos < MARCOS.length && acum >= MARCOS[feitos] * 1000) marcos.push(MARCOS[feitos++]);
  // ⚠️ `desde` só reabre quando RETIDO: é isto que faz o tempo no menu não contar. Quem sai da sala e
  // volta continua de onde parou — a sessão é da carga da página, não da partida.
  return { est: { acum, desde: retido ? agora : null, feitos },
    marcos, emMs: retido && feitos < MARCOS.length ? MARCOS[feitos] * 1000 - acum : null };
}

// ⚠️ **O GATILHO É O PRIMEIRO INPUT DO JOGADOR, E ISSO É REGRA ESCRITA DA POKI**, não interpretação:
// *"gameplayStart() must fire on the player's first input (not on load)"*
// (developers.poki.com/guide/requirements-quality). É o item que o Inspector deles marca em vermelho, e
// o que o tornou um defeito NOSSO foi o boot direto: até a 1.13 o jogador clicava em JOGAR na tela
// inicial, e esse clique ERA o primeiro input — o evento saía certo por acidente de fluxo. Sem a tela,
// o jogo entra na arena sozinho e `gameplayStart` virou um evento de CARGA, exatamente o que a frase
// deles proíbe entre parênteses. Foi por isso que quebrou na 1.14 e nenhum conserto de ordem resolveu.
// ⚠️ **NÃO é uma segunda verdade sobre "estou jogando"** — o medo que manteve isto sem conserto por três
// entregas. `screen`/`pause` continuam dizendo SE há gameplay; o gesto diz QUANDO ele começou, que é uma
// pergunta diferente e é a única que o SDK faz. E é um LATCH por carga de página: depois do primeiro
// gesto, despausar volta a abrir o gameplay na hora, sem esperar gesto nenhum.
// ⚠️ O que conta como input é a definição DELES — `pointerdown` ou `keydown`, nos 5 s anteriores à
// chamada —, e não a nossa. Ver o bloco de `GESTO` mais abaixo: pendurar isto em movimento de mouse
// (o sinal mais natural num `.io`) reprova o checklist do mesmo jeito, com o evento saindo no log.
// ⚠️ **NO SITE ISTO É INERTE**, sem um `if (PORTAL)`: `iniciaSessaoPortal()` roda no boot, então o clique
// em JOGAR da tela inicial já arma o latch antes de existir `screen:"game"`.
// ⚠️ **CONSEQUÊNCIA ACEITA**: uma aba aberta e esquecida na arena não produz `gameplayStart` nenhum. É o
// que a regra deles diz, e de quebra tira do playtime exatamente o tempo que não é jogo.
//
// ⚠️ **`conn === "connected"` JÁ ESTEVE AQUI E ERA A TENTATIVA ERRADA DE RESOLVER ISTO.** A ideia era não
// contar o handshake do join (até `JOIN_TIMEOUT_MS` = 3 s) como playtime; o que ela fez foi tornar o
// evento refém do nosso servidor — enquanto a conexão não fechasse, `gameplayStart` não existia. Medido
// na bancada com o servidor fora: `gameLoadingStart` · `gameLoadingFinished` · `connect/match/fail` e
// mais nada, nunca. No Inspector isso é o caso NORMAL (o Restart deles recarrega enquanto a sessão
// anterior ainda segura o nick por `NET.RESUME_MS`, e o join é recusado 3 a 6 vezes). O gesto resolve o
// handshake de graça: ninguém dá input antes de ver a arena.
// ⚠️ `!st.interrompido` É O TERCEIRO TERMO, e ele nasceu com a primeira morte sem tela
// (portal/primeiraVida.js): até aqui a prova de que o jogador tinha morrido era `screen` deixar de ser
// "game", e com o respawn automático ela nunca deixa. Sem esta parcela, morrer e abrir a tela de morte
// passaria inteiro como gameplay ativo — contra o requisito escrito da Poki ("gameplayStop() must fire
// on any gameplay interruption (pause, menu open, level end, cutscene)").
//
// ⚠️ **MAS A MORTE SEM TELA NÃO É UMA INTERRUPÇÃO, E TRATÁ-LA COMO SE FOSSE CUSTOU O FIT TEST 1.21.**
// Ela chamava-se `morto` e era escrita `true` em TODA morte, então a primeira — a que renasce sozinha em
// `PORTAL.RESPAWN_1_MS` (1,2 s), sem modal, sem menu e sem anúncio — passou a emitir um `gameplayStop` e,
// logo em seguida, um `gameplayStart`. E esse start sai INVÁLIDO por construção: o SDK deles anexa
// `interaction: getRecentInteraction()`, que exige um `pointerdown`/`keydown` nos últimos 5 s, e no
// respawn automático **não há gesto nenhum** — no celular, com o rumo travado (`game/input/Joystick.js`),
// o jogador chega a passar um minuto sem um único `pointerdown`. Antes disso a morte abria a tela e o
// respawn só era ARMADO por um gesto real (`ui/deadClock.js`), então o start seguinte sempre tinha um.
// Aqueles 1,2 s são os mesmos `ROUND.DEAD_DELAY_MS` que sempre foram tela "game" com o jogador morto e
// nunca emitiram evento nenhum: o que se mede aqui é a INTERRUPÇÃO, e quem a declara é `onDead`
// (`interrompido: !sozinho`), não o fato de haver um cadáver.
const ATIVO = (st, gesto) => gesto && st.screen === "game" && !st.interrompido && !st.overlays.pause;
// ⚠️ `spec` (assistir a uma sala em andamento) conta como RETIDO pelo mesmo motivo que `dead` e `round`
// contam: o relógio é da CARGA DA PÁGINA e mede quem está AQUI, não quem está jogando — quem assiste está
// na sala, olhando o jogo. Fora daqui, quem entrasse para ver uma partida apareceria como evasão no funil,
// que é exatamente o defeito de medição que este arquivo existe para ter consertado.
// ⚠️ Em `ATIVO` ele NÃO entra: assistir não é gameplay, e chamar `gameplayStart` sem partida é o tipo de
// coisa que os portais cobram por escrito.
const RETIDO = st => st.screen === "game" || st.screen === "dead" || st.screen === "round" || st.screen === "spec";

/**
 * A faixa do tempo na sala antes do primeiro gesto, em segundos. Nome e não número pelo mesmo motivo de
 * `faixaIdade` (portal/marcos.js): `measure` só tem strings, e o histograma do painel é feito de nomes.
 * @param {number} s
 */
const FAIXAS_GESTO = [[5, "0_5s"], [15, "5_15s"], [30, "15_30s"], [60, "30_60s"]];
export const faixaGesto = s => { const n = +s || 0;
  for (const [ate, id] of FAIXAS_GESTO) if (n < ate) return id;
  return "60s_mais"; };

/**
 * `touch` ou `mouse`, pela MESMA pergunta que arma o direcional virtual (`(pointer: coarse)`). A demora
 * até o primeiro gesto só faz sentido cortada por aparelho: no dedo o primeiro toque já é `pointerdown`.
 * `null` fora do navegador — o teste roda no Node, e aí nada é emitido.
 */
const APARELHO = () => {
  try { return typeof matchMedia === "function" ? (matchMedia("(pointer: coarse)").matches ? "touch" : "mouse") : null; }
  catch { return null; }
};

/** O destino padrão: a fachada. Injetável só para o teste poder LER a sequência que chega ao SDK. */
const FACHADA = { comecou: () => portal.jogoComecou(), parou: () => portal.jogoParou(),
  medir: (c, o, a) => portal.medir(c, o, a) };

/**
 * O PRIMEIRO GESTO HUMANO, uma vez por carga de página. Injetável para o teste — não há jsdom aqui, e o
 * que precisa ser conferido é a DECISÃO (o gameplay não abre sem gesto), não os listeners do navegador.
 *
 * ⚠️ **ESTES DOIS EVENTOS, E SÓ ELES, PORQUE SÃO OS DOIS QUE O SDK DELES ESCUTA.** Isto não é escolha
 * nossa: `PokiSDK.gameplayStart()` anexa ao evento um campo `interaction` vindo de
 * `getRecentInteraction()`, e o Inspector reprova o item quando ele vem vazio — o validador, lido no
 * bundle deles, é literalmente `const {interaction}=e.payload.data; if(!interaction) FALHA`. E o
 * rastreador do SDK é:
 *     startTrackingInteractions = () => { window.addEventListener("pointerdown", h);
 *                                         document.addEventListener("keydown",  h); }
 *     getRecentInteraction     = () => { if (performance.now() - ultimo < 5000) return interacao }
 * Ou seja: **`pointerdown` ou `keydown`, e no máximo 5 s antes da chamada.** `pointermove` NÃO conta —
 * e foi nele que este gatilho esteve pendurado, o que fez o checklist reprovar exatamente igual, com o
 * evento saindo no log e tudo. Num `.io` isso é contraintuitivo (mexer o mouse É jogar), mas quem define
 * "interação" aqui é o medidor, não nós.
 *
 * ⚠️ **NÃO é `Activity.js`**, e a diferença é o ponto: aquele responde "ainda tem alguém do outro lado?"
 * e por isso conta movimento de mouse, que é o sinal mais comum de presença. Aqui a pergunta é outra —
 * "o SDK vai considerar isto uma interação?" —, e a resposta tem que ESPELHAR a definição deles. Duas
 * perguntas diferentes, dois detectores; unificá-los é o que quebrou.
 *
 * ⚠️ **CAPTURA + `setTimeout(0)`, e as duas metades são obrigatórias.** Captura porque na bolha um
 * `stopPropagation()` esconde o evento, e no dedo o toque pode ser o único input que existe.
 * ⚠️ **E O NOSSO LADO NÃO BASTAVA: o SDK DELES escuta na BOLHA.** O direcional virtual dava
 * `stopPropagation()` em captura, então este detector via o toque (e mandava o `gameplayStart`) e o
 * rastreador da Poki NÃO — no celular o evento saía com `interaction` vazio, INVÁLIDO, e o relógio do
 * Player Fit Test congelava para quem só dirige. Hoje o direcional MARCA o evento em vez de pará-lo (ver o
 * fim de `game/input/Joystick.js`); quem mede é `scripts/poki-fit-bancada.mjs`. E o `setTimeout` porque em captura NÓS rodamos ANTES do
 * listener do SDK, que é de bolha — chamar `gameplayStart()` ali dentro o faria ler o `interaction` de
 * antes deste gesto, ou seja vazio. O timeout devolve o controle depois do despacho inteiro, e 0 ms cabe
 * com folga nos 5 s. (O próprio SDK usa `setTimeout(...,0)` dentro do `gameplayStart` pelo mesmo motivo.)
 *
 * @param {() => void} cb @returns {() => void} cancelar
 */
const GESTO = cb => {
  const fora = () => {
    removeEventListener("pointerdown", bate, true);
    document.removeEventListener("keydown", bate, true);
  };
  const bate = () => { fora(); setTimeout(cb, 0); };
  addEventListener("pointerdown", bate, true);
  document.addEventListener("keydown", bate, true);
  return fora;
};

/**
 * Liga a assinatura. Uma vez por carga da página, de `main.jsx`. Devolve a função de cancelar.
 *
 * ⚠️ NENHUM EVENTO DO SDK PODE SAIR DURANTE UM ANÚNCIO (requisito escrito da Poki), e quem garante isso
 *    é a ORDEM que já existe em `state/actions.js`: `play()` e `respawnAqui()` pedem o anúncio ANTES de
 *    escrever `screen:"game"`, então enquanto o comercial roda o predicado é falso e nada é emitido. O
 *    `setPause(true)/(false)` que a fachada dispara em volta do anúncio cai em cima de um gameplay já
 *    fechado, ou seja no-op nos dois sentidos.
 * ⚠️ E o par continua idempotente do outro lado (`emJogo`, em portal/index.js), então mesmo que dois
 *    caminhos peçam a mesma coisa o SDK nunca vê start-após-start nem stop-após-stop — que é o outro
 *    item que eles cobram por escrito.
 */
export function iniciaSessaoPortal(alvo = FACHADA, store = app, agora = Date.now, esperaGesto = GESTO, aparelho = APARELHO) {
  let est = SESSAO0, estJ = SESSAO0, jogando = false, abriu = false, abriuJ = false, t = null, gesto = false;
  // ⚠️ **DOIS RELÓGIOS LADO A LADO, e a distância entre eles é a pergunta.** `session/*` conta PRESENÇA
  // (partida, tela de morte, pódio); `gameplay/*` conta só o tempo entre o `gameplayStart` e o
  // `gameplayStop` que ESTE arquivo manda ao SDK. Medido nos Fit Tests 1.26–1.29, a nossa presença acima
  // de 3 min fica 2 a 8 pontos acima do "engaged players" da Poki, e a documentação deles não diz como o
  // playtime é contado. Com os dois no mesmo painel de eventos, o que bater com o número deles responde.
  const conta = () => {
    clearTimeout(t); t = null;
    const st = store.get(), retido = RETIDO(st), ag = agora();
    // Os três marcos abrem juntos na primeira vez que ele entra — é o que dá o denominador do funil.
    if (retido && !abriu) { abriu = true; for (const m of MARCOS) alvo.medir("session", m + "s", "start");
      const ap = aparelho(); if (ap) alvo.medir("device", ap, "complete"); }
    if (jogando && !abriuJ) { abriuJ = true; for (const m of MARCOS) alvo.medir("gameplay", m + "s", "start"); }
    const r = passoSessao(est, retido, ag), rj = passoSessao(estJ, jogando, ag);
    est = r.est; estJ = rj.est;
    // ⚠️ Só `complete`, nunca `fail`: num funil de progressão quem não completou É a evasão, e foi o
    // `fail` explícito da versão anterior que encheu o painel deles de abandono que não existiu.
    for (const m of r.marcos) alvo.medir("session", m + "s", "complete");
    for (const m of rj.marcos) alvo.medir("gameplay", m + "s", "complete");
    const em = Math.min(r.emMs ?? Infinity, rj.emMs ?? Infinity);
    if (em !== Infinity) t = setTimeout(conta, Math.max(50, em));
  };
  const passo = st => {
    const a = ATIVO(st, gesto);
    // ⚠️ Só na TRANSIÇÃO. A fachada já é idempotente, mas o `passo` roda a cada escrita no store e cada
    // chamada dela custa um `await pronto` — e, mais importante, é a transição que se lê num log de QA.
    // (A ordem com `conta()` não importa: `passoSessao` fecha o intervalo pelo `desde` que abriu, e o
    // valor novo só decide se ele reabre.)
    if (a !== jogando) { jogando = a; if (a) alvo.comecou(); else alvo.parou(); }
    conta();
  };
  const off = store.subscribe(passo);
  // ⚠️ O gesto NÃO passa pelo store, e é decisão: ele não é estado de tela — nada no jogo o desenha, e
  // pô-lo lá faria toda a UI re-renderizar no primeiro movimento do mouse. Ele só reavalia o passo.
  const offGesto = esperaGesto(() => {
    // ⚠️ QUANTO TEMPO NA SALA ANTES DO PRIMEIRO CLIQUE OU TECLA. É o tempo que o SDK deles não chama de
    // jogo (mover o mouse não é interação), e é a pergunta que decide se vale reordenar o tutorial: no
    // computador a lição da supernova só pede para MOVER. A faixa usa a PRESENÇA acumulada, não o relógio
    // da página, porque o tempo de carga não é o que se quer medir. Uma vez por carga, como o latch.
    if (!gesto) alvo.medir("gesture", faixaGesto(passoSessao(est, RETIDO(store.get()), agora()).est.acum / 1000), "complete");
    gesto = true; passo(store.get()); });
  // ⚠️ E o estado de AGORA: o adaptador é um chunk sob demanda com script de terceiro dentro, e numa
  // rede ruim o jogador chega à partida antes de isto rodar (o mesmo argumento de `portal/vidas.js`).
  passo(store.get());
  return () => { clearTimeout(t); t = null; off(); offGesto(); };
}

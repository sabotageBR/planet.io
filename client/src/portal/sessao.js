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

// ⚠️ `conn === "connected"` É A TERCEIRA CONDIÇÃO, e ela endereça o item 2 da auditoria do Player Fit
// ("gameplayStart no primeiro input") sem criar uma segunda verdade sobre "estou jogando" — o erro que
// já custou o `gameplayStop` da morte. `play()` escreve `screen:"game"` e `conn:"connecting"` no MESMO
// update, então sem ela o relógio do SDK começava no HANDSHAKE do join (até `JOIN_TIMEOUT_MS` = 3 s),
// que é exatamente o tempo em que o jogador NÃO pode dar input nenhum. O campo já existe e já é escrito
// por `onConnection` (state/actions.js): zero plumbing, e continua sendo UMA expressão.
// ⚠️ Efeito de borda declarado: uma RECONEXÃO passa a produzir `stop`/`start`. Isso É "gameplay
// interruption" pela letra deles ("must fire on any gameplay interruption"), e `emJogo` impede repetição.
const ATIVO = st => st.screen === "game" && !st.overlays.pause && st.conn === "connected";
// ⚠️ `spec` (assistir a uma sala em andamento) conta como RETIDO pelo mesmo motivo que `dead` e `round`
// contam: o relógio é da CARGA DA PÁGINA e mede quem está AQUI, não quem está jogando — quem assiste está
// na sala, olhando o jogo. Fora daqui, quem entrasse para ver uma partida apareceria como evasão no funil,
// que é exatamente o defeito de medição que este arquivo existe para ter consertado.
// ⚠️ Em `ATIVO` ele NÃO entra: assistir não é gameplay, e chamar `gameplayStart` sem partida é o tipo de
// coisa que os portais cobram por escrito.
const RETIDO = st => st.screen === "game" || st.screen === "dead" || st.screen === "round" || st.screen === "spec";

/** O destino padrão: a fachada. Injetável só para o teste poder LER a sequência que chega ao SDK. */
const FACHADA = { comecou: () => portal.jogoComecou(), parou: () => portal.jogoParou(),
  medir: (c, o, a) => portal.medir(c, o, a) };

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
export function iniciaSessaoPortal(alvo = FACHADA, store = app, agora = Date.now) {
  let est = SESSAO0, jogando = false, abriu = false, t = null;
  const conta = () => {
    clearTimeout(t); t = null;
    const st = store.get(), retido = RETIDO(st);
    // Os três marcos abrem juntos na primeira vez que ele entra — é o que dá o denominador do funil.
    if (retido && !abriu) { abriu = true; for (const m of MARCOS) alvo.medir("session", m + "s", "start"); }
    const r = passoSessao(est, retido, agora());
    est = r.est;
    // ⚠️ Só `complete`, nunca `fail`: num funil de progressão quem não completou É a evasão, e foi o
    // `fail` explícito da versão anterior que encheu o painel deles de abandono que não existiu.
    for (const m of r.marcos) alvo.medir("session", m + "s", "complete");
    if (r.emMs != null) t = setTimeout(conta, Math.max(50, r.emMs));
  };
  const passo = st => {
    const a = ATIVO(st);
    // ⚠️ Só na TRANSIÇÃO. A fachada já é idempotente, mas o `passo` roda a cada escrita no store e cada
    // chamada dela custa um `await pronto` — e, mais importante, é a transição que se lê num log de QA.
    if (a !== jogando) { jogando = a; if (a) alvo.comecou(); else alvo.parou(); }
    conta();
  };
  const off = store.subscribe(passo);
  // ⚠️ E o estado de AGORA: o adaptador é um chunk sob demanda com script de terceiro dentro, e numa
  // rede ruim o jogador chega à partida antes de isto rodar (o mesmo argumento de `portal/vidas.js`).
  passo(store.get());
  return () => { clearTimeout(t); t = null; off(); };
}

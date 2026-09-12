// ── AS MARCAS DE ESTREIA ──────────────────────────────────────────────────────
// Duas perguntas com a mesma forma — "esta pessoa já viu isto?" — e um lugar só para respondê-las:
//   · o TUTORIAL de estreia, por DISPOSITIVO (`localStorage`): uma vez na vida, não uma por aba;
//   · a MISSÃO de sessão 0 (a faixa de três etapas no rodapé do HUD), por SESSÃO (`sessionStorage`).
//
// ⚠️ TODO acesso vem com try/catch, e não é zelo: `localStorage` **LANÇA** em janela anônima e em origem
// OPACA — e origem opaca é o caso vivo da Bounty Board, cuja própria doc diz que "localStorage/
// sessionStorage/cookies all THROW". Um `getItem` cru aqui derruba o BOOT INTEIRO no primeiro portal que
// sirva em sandbox. Sem storage, a degradação é o tutorial reaparecer — nunca o jogo não abrir.
//
// ⚠️ ELES MORAM JUNTOS PORQUE SE CRUZAM, e o cruzamento é uma regra de produto que não se adivinha:
// **concluir o tutorial marca a missão como feita; PULAR não.** Quem concluiu já aprendeu a comer, a
// atirar e a dividir, e entra na primeira vida direto na etapa 3 (a dica do dividir, que é a única que
// ele ainda não viu em partida de verdade). Quem PULOU não aprendeu nada — e é exatamente ele que mais
// precisa de "coma as partículas" e "coma o planeta pequeno" no rodapé.
// ⚠️ Sem isto o cruzamento acontece SOZINHO e para o lado errado: `game.leave()` chama `fimDaVida()`
// sempre que havia partida, e sair do tutorial passa por `play()` → `game.join()` → `leave(true)`. Ou
// seja, o default do código é justamente punir quem pulou.
// @ts-check

/** A marca do TUTORIAL, por dispositivo. O `_v1` é para uma versão futura do tutorial poder reaparecer. */
const TUTOR_KEY = "warspace_tutor_v1";
/** A marca da MISSÃO, por sessão. A chave é a MESMA que `game/index.js` sempre usou — não é um segundo lugar. */
export const MISSAO_KEY = "warspace_missao_v1";

const leu = (st, k) => { try { return st.getItem(k) === "1"; } catch { return false; } };
const poe = (st, k) => { try { st.setItem(k, "1"); } catch { /* anônima/opaca: a marca só não persiste */ } };

/** Este dispositivo já viu o tutorial de estreia? */
export const tutorVisto = () => (typeof localStorage === "undefined" ? false : leu(localStorage, TUTOR_KEY));

/**
 * Marca o tutorial como visto.
 *
 * ⚠️ Chamada na ABERTURA, nunca no fim. Uma tela de estreia que reaparece a cada F5 — ou a cada erro de
 * JS no meio dela — é a pior falha possível deste arquivo, e o preço de errar para o outro lado é o
 * jogador perder 40 s de tutorial num reload. É uma tentativa por pessoa.
 */
export const marcaTutor = () => { if (typeof localStorage !== "undefined") poe(localStorage, TUTOR_KEY); };

/** A missão de sessão 0 já foi (ou já não vale)? */
export const missaoFeita = () => (typeof sessionStorage === "undefined" ? false : leu(sessionStorage, MISSAO_KEY));
/** Marca a missão como feita — só para quem CONCLUIU o tutorial, ou ao fim de uma vida de verdade. */
export const marcaMissao = () => { if (typeof sessionStorage !== "undefined") poe(sessionStorage, MISSAO_KEY); };

// ── QUAL MODELO DA TELA DE MORTE ─────────────────────────────────────────────
// Quatro arranjos dos mesmos dados (ui/Dead.jsx), e a escolha é uma decisão com TRÊS fontes que precisam
// ser resolvidas numa ordem só. Pura pelo mesmo motivo de `ui/deadClock.js` e `game/quality.js`: não há
// jsdom no projeto, e o que precisa ser conferido é a ordem — não o desenho.
//
//   duelo   — "quem me pegou, e quão maior ele era?"
//   balanco — "essa vida foi boa?", contra o recorde de quem morreu
//   sala    — "e agora, o que está acontecendo lá?", para quem vai ficar assistindo
//   kaboom  — o cartão de UM TOQUE do pacote de portal: o estouro, um número e o DE NOVO
// @ts-check

export const ESTILOS = ["duelo", "balanco", "sala", "kaboom"];

/**
 * ⚠️ A ORDEM DOS TRÊS TESTES É A REGRA, e cada um tem um dono:
 *  1. `?dead=` é o atalho de QA e da matriz de responsividade — tem que ganhar até do pacote, senão os
 *     outros três modelos deixam de ser mensuráveis no build que mais precisa ser medido.
 *  2. o PACOTE impõe o `kaboom`, ignorando a pref: é a decisão do dono, e a pref viaja com a CONTA (um
 *     jogador que escolheu `dossie` no site levaria o relatório inteiro para dentro do Fit Test).
 *  3. a pref, e o `duelo` como chão.
 *
 * ⚠️ `kaboom` NÃO VALE NO BATTLE ROYALE, e não é esquecimento: lá o jogo promete o pódio na própria tela
 * de morte (`LB.brWatchHint`, "fique para ver o pódio no fim") e o botão é "OUTRA PARTIDA", não "DE
 * NOVO". Um cartão de um número só apagaria metade da partida — e é o mesmo `h.mode` que decide o
 * `semRespawn` de `Dead.jsx`, então os dois TÊM que ler a mesma fonte: discordando, sai um cartão mínimo
 * com "OUTRA PARTIDA" dentro.
 *
 * @param {{deadStyle?:string}|null|undefined} prefs
 * @param {{q?:string|null,portal?:boolean,modo?:number,br?:number}} [ctx]
 * @returns {string}
 */
export function estiloDe(prefs, { q = null, portal = false, modo = 0, br = 1 } = {}) {
  const doQ = q && (ESTILOS[+q - 1] || (ESTILOS.includes(q) ? q : null));
  if (doQ) return doQ;
  if (portal && modo !== br) return "kaboom";
  const p = prefs && prefs.deadStyle;
  return ESTILOS.includes(p) ? p : "duelo";
}

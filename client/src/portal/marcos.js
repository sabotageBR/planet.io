// ── OS MARCOS DA PRIMEIRA VIDA, NO FUNIL DO PORTAL ────────────────────────────
// O painel da Poki mostra `loading`, `match` e os três `session/*` — e nada entre eles. Quando o Fit
// Test 1.20 disse "a coluna de 1–2 min piorou", não havia um único evento para dizer O QUE acontece
// nesse minuto: o jogador comeu alguma coisa? chegou a encontrar uma presa? morreu de quê, e quando?
// Sem isso, a versão seguinte é palpite.
//
// ⚠️ UMA VEZ POR CARGA DA PÁGINA, e não por vida: a pergunta é "esta PESSOA chegou a fazer X?", que é
//    o que separa quem fica de quem sai (medido: quem faz um abate na 1ª vida chega a 3 min em 54% das
//    vezes, contra 22%). Por vida eles virariam contagem de partidas, que o `match` já dá.
// ⚠️ SÓ `complete`, nunca `fail` — a lição de `portal/sessao.js`: num funil de progressão quem não
//    completou É a evasão, e o `fail` explícito enche o painel deles de abandono que não existiu.
// ⚠️ A IDADE DA MORTE VAI NA FAIXA, não num número: `measure(categoria, oQue, acao)` tem três strings e
//    nenhuma delas é numérica, então o histograma é feito de nomes — que é como ele aparece no painel.
// ⚠️ NO SITE ISTO É NO-OP por construção: `portal.medir` sem adaptador não faz nada, e nenhum chamador
//    precisa de um `if (PORTAL)` (o molde é `portal/sessao.js`).
// @ts-check
import { portal } from "./index.js";

const CAT = "life";
const feitos = new Set();

/** Faixas do `first_death`, em segundos. A primeira é a que o Fit Test mede. */
const FAIXAS = [[30, "0_30s"], [60, "30_60s"], [120, "60_120s"]];
export const faixaIdade = s => { const n = +s || 0;
  for (const [ate, id] of FAIXAS) if (n < ate) return id;
  return "120s_mais"; };

/**
 * Marca `oQue` — e só na PRIMEIRA vez nesta carga da página.
 * @param {string} oQue @returns {boolean} saiu agora?
 */
export function marco(oQue) {
  if (feitos.has(oQue)) return false;
  feitos.add(oQue);
  portal.medir(CAT, oQue, "complete");
  return true;
}

/** Marca `oQue` toda vez (o respawn, que é contagem e não marco). */
export function evento(oQue) { portal.medir(CAT, oQue, "complete"); }

/** Só para o teste: esquece o que já saiu. */
export function _zera() { feitos.clear(); }

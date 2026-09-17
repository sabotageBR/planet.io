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

// ── O PORTÃO DO TUTORIAL ──
// ⚠️ **METADE DESTES MARCOS MEDIA O TUTORIAL E NÃO A PARTIDA, e ninguém tinha como notar.** O tutorial de
// estreia é uma PARTIDA (LocalServer, mesmo motor, mesmos eventos): comer a presa da etapa 3 é um
// `EVENT.EAT` de verdade → `first_kill`; cruzar `NOVATO_MASS` na etapa 1 faz o `graceTick` de lá mandar
// `{t:"grace",why:"mass"}` → `grace_end_mass`. E como o marco é "uma vez por carga", ele saía ALI e nunca
// mais na sala real. Lido no painel da 1.31: `first_kill` em 321 de 537 cargas (60%) — contra **19%** de
// primeiras vidas com abate no nosso banco, para a mesma gente. O número que devia separar quem fica de
// quem sai tinha virado "chegou à etapa 3 do tutorial".
// ⚠️ O `barrado` vem ANTES do `feitos.add`: barrar não pode QUEIMAR o marco, senão o conserto troca um
//    defeito pelo outro (o marco deixaria de sair no tutorial E na partida).
// ⚠️ Os `tutor_*` passam — eles SÃO do tutorial. Quem liga e desliga é o motor (`game/index.js`, no
//    `join`, a porta única de toda entrada), porque é ele que sabe se o servidor do outro lado é o roteiro.
let tutorial = false;
/** O motor avisa: a partida que está entrando é o tutorial? */
export const portaoTutorial = v => { tutorial = !!v; };
/** Estou no tutorial? (quem pergunta é o funil de conexão, em `state/actions.js`) */
export const noTutorial = () => tutorial;
const barrado = oQue => tutorial && !String(oQue).startsWith("tutor_");

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
  if (barrado(oQue) || feitos.has(oQue)) return false;
  feitos.add(oQue);
  portal.medir(CAT, oQue, "complete");
  return true;
}

/** Marca `oQue` toda vez (o respawn, que é contagem e não marco). */
export function evento(oQue) { if (barrado(oQue)) return; portal.medir(CAT, oQue, "complete"); }

/**
 * A PRIMEIRA morte desta carga, e a faixa de idade DELA.
 * ⚠️ Eram duas chamadas soltas de `marco()`, e a segunda deduplicava por STRING: `first_death_0_30s` e
 * `first_death_120s_mais` são nomes diferentes, então cada FAIXA nova que uma morte posterior visitasse
 * saía de novo. No painel da 1.31 as quatro faixas somavam 252 para 159 `first_death` — o histograma
 * dizia "em que faixas esta pessoa já morreu", não "com que idade foi a primeira morte". A faixa só sai
 * junto com o marco.
 * @param {number} durS idade da VIDA que acabou, em segundos
 */
export function marcoMorte(durS) { if (marco("first_death")) marco("first_death_" + faixaIdade(durS)); }

/** Só para o teste: esquece o que já saiu. */
export function _zera() { feitos.clear(); tutorial = false; }

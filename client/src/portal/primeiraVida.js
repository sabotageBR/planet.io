// ── A PRIMEIRA VIDA, NO PACOTE DE PORTAL ──────────────────────────────────────
// Duas decisões que o jogo tomava sem olhar para nada: QUANDO a tela de morte aparece e QUANDO o
// jogador paga um anúncio. As duas moram aqui, puras, pelo mesmo motivo de `game/quality.js`,
// `ui/roundClock.js` e `portal/sessao.js`: o que precisa ser conferido é a DECISÃO, e não há jsdom no
// projeto para exercitar os componentes que a consomem.
//
// ⚠️ O DIAGNÓSTICO É DO FIT TEST 1.20, e ele é específico: a coluna de 0–1 min MELHOROU (185 → 155
// sessões — é o boot direto funcionando) e a de 1–2 min PIOROU (132 → 177), com os engajados parados em
// 20%. Ou seja, quem o 1.20 trouxe para dentro está morrendo no minuto seguinte e indo embora. Entre a
// morte e a decisão de fechar a aba há exatamente uma tela, e ela é um modal com o placar de uma vida de
// 40 segundos — no instante em que a pessoa ainda não sabe que morrer é normal num agar.
// ⚠️ PRIMEIRA MORTE, E SÓ ELA. Da segunda em diante a tela de morte volta inteira, com o botão, o
// recorde e o contador: quem morreu duas vezes já sabe o que aconteceu, e é ali que ele escolhe.
// ⚠️ NADA DISTO VALE NO SITE nem no Battle Royale — lá não existe respawn, e "renascer sozinho" não tem
// para onde apontar. Quem responde por isso é o chamador, que passa `portal` e `modo`.
// @ts-check
import { MODE, PORTAL as P } from "@warspace/shared";

/**
 * A morte passa direto para uma vida nova, sem tela?
 *
 * @param {{portal:boolean,modo:number,mortes:number}} ctx `mortes` JÁ inclui a que acabou de acontecer
 */
export function renasceSozinho({ portal, modo, mortes }) {
  return !!portal && (modo | 0) === MODE.FREE && mortes <= P.VIDAS_SEM_TELA;
}

/**
 * O jogador já pode pagar um anúncio?
 *
 * ⚠️ "Zero anúncio na 1ª e na 2ª vida" é o pedido literal, e o motivo é de funil: um midroll no primeiro
 * restart cobra pedágio de quem ainda não sabe se quer o jogo — e o restart é justamente o passo que o
 * 1.21 existe para tornar barato. Passadas as duas vidas grátis ele ainda espera um SINAL de que a
 * pessoa ficou: um abate (o gesto que mais separa quem fica de quem sai — 54% × 22% aos 3 min) ou o
 * relógio de `PORTAL.FIRST_AD_MS`.
 * ⚠️ É SÓ PARA O MIDROLL. O preroll de `play()` é anterior à primeira vida e alguns portais o EXIGEM por
 * escrito (a GameDistribution, §2.1) — barrá-lo aqui seria trocar uma reprova por outra. Quem não quer
 * preroll declara `semPreroll` no próprio adaptador, que é onde a regra do SDK mora.
 * ⚠️ O relógio é o da CARGA DA PÁGINA, não o da sessão retida de `portal/sessao.js`: aquele para no menu,
 * e aqui o que se quer saber é "faz três minutos que esta pessoa abriu o jogo?".
 *
 * @param {{mortes:number,kills:number,sessaoMs:number}} ctx
 */
export function pedagioLiberado({ mortes, kills, sessaoMs }) {
  if ((mortes | 0) < P.VIDAS_SEM_AD) return false;
  return (kills | 0) > 0 || (sessaoMs | 0) >= P.FIRST_AD_MS;
}

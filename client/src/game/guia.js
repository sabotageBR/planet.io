// ── O GUIA NO MUNDO: qual gesto desenhar, e onde ──────────────────────────────
// A instrução do tutorial saiu da faixa de texto e foi para o MUNDO (28/09/2026, depois da recusa do Web Fit
// Test da Poki: "onboarding needs to be visual instead of textual explanations"). Este módulo decide O QUE a
// camada `renderer/layers/Guia.js` desenha — ela só desenha.
//
// PURO, pelo motivo de `game/tutor.js`, `game/dica.js` e `ui/tutorFala.js`: não há jsdom no projeto, e o que
// precisa ser conferido é a ESCOLHA. As posições entram prontas (`{x,y,r}`), então o teste não precisa de
// `WorldView` nem de Pixi.
//
// ⚠️ UM GUIA POR VEZ, e a forma do retorno garante isso: é UM objeto ou `null`. Dois gestos na tela ao mesmo
// tempo ("toque aqui" e "vá até ali") são o jogador tendo de escolher qual obedecer.
// @ts-check
import { ETAPA } from "./tutor.js";
import { EAT } from "@warspace/shared";

/**
 * O corpo mais perto de `eu` numa lista — aceita os da `WorldView` (`rx,ry,rr`) e os crus (`x,y,r`).
 * @param {{x:number,y:number}} eu
 * @param {Array<any>|null|undefined} lista
 * @returns {{x:number,y:number,r:number}|null}
 */
export function maisPerto(eu, lista) {
  if (!eu || !lista || !lista.length) return null;
  let melhor = null, d2m = Infinity;
  for (const o of lista) {
    if (!o) continue;
    const x = o.rx != null ? o.rx : o.x, y = o.ry != null ? o.ry : o.y;
    const dx = x - eu.x, dy = y - eu.y, d2 = dx * dx + dy * dy;
    if (d2 < d2m) { d2m = d2; melhor = { x, y, r: (o.rr != null ? o.rr : o.r) || 0 }; }
  }
  return melhor;
}

/**
 * O GUIA DO TUTORIAL.
 *   `toque` — a estrela esperando o TOQUE que a detona (a mão/o cursor em cima dela);
 *   `ir`    — da borda do planeta até o caco mais perto (o gesto de mover, desenhado);
 *   `salto` — o arco tracejado do planeta até a presa (o gesto de dividir, desenhado).
 *
 * ⚠️ Na etapa 1 o `ir` SAI quando o jogador já entendeu (passou do primeiro terço da massa) e VOLTA se a
 * ajuda chegar (`ajuda>=1`): um rastro apontando para quem já está comendo é a tela dizendo que não viu.
 * ⚠️ Nada durante a festa (`celebra`) e nada no fim: o selo ✓ é o único retorno ali.
 * ⚠️ `tocou` vem do CLIENTE (quem sabe do toque é o motor, na hora): o `pre` do servidor ainda fica
 * verdadeiro por 0,8 s de inchaço depois dele, e a mão continuar tocando ali lê como "não pegou".
 *
 * @param {{etapa:number,pre?:boolean,pct?:number,ajuda?:number,celebra?:boolean,fim?:boolean,tocou?:boolean}|null} d
 * @param {{x:number,y:number,r:number}|null} eu a MAIOR peça própria
 * @param {{estrela?:{x:number,y:number,r:number}|null,cacos?:Array<any>,presa?:{x:number,y:number,r:number}|null}} mundo
 * @returns {null|{tipo:"toque",x:number,y:number,r:number}|{tipo:"ir"|"salto",x0:number,y0:number,r0:number,x:number,y:number,r:number}}
 */
export function guiaDoTutor(d, eu, mundo) {
  if (!d || d.fim || d.celebra || !eu) return null;
  const m = mundo || {};
  if (d.etapa === ETAPA.NOVA) {
    if (d.pre) {
      const s = m.estrela;
      return !d.tocou && s ? { tipo: "toque", x: s.x, y: s.y, r: s.r } : null;
    }
    if ((d.pct || 0) >= .35 && (d.ajuda | 0) < 1) return null;
    const c = maisPerto(eu, m.cacos);
    return c ? { tipo: "ir", x0: eu.x, y0: eu.y, r0: eu.r, x: c.x, y: c.y, r: c.r } : null;
  }
  if (d.etapa === ETAPA.SPLIT) {
    const p = m.presa;
    return p ? { tipo: "salto", x0: eu.x, y0: eu.y, r0: eu.r, x: p.x, y: p.y, r: p.r } : null;
  }
  return null;
}

// ── O NOVATO NA PARTIDA: onde está a presa ────────────────────────────────────
// Medido nas primeiras vidas da Poki (25/09): 54% terminam com o jogador SAINDO VIVO, e 80% sem um abate. Ele
// não estava morrendo — estava sem saber o que fazer, num mapa em que a comida mais perto costuma estar fora
// da tela. Esta é a decisão do guia da PARTIDA; a camada `Guia.js` desenha a seta.
// ⚠️ Houve aqui um `anelDeRisco` (verde em quem ele come, vermelho com pontas em quem o come, desenhado em
// `Planets.js`). Ele SAIU em 28/09 por decisão do dono do jogo: as pontas liam como raios, e não tinha sido pedido.

/** Até que NÍVEL o jogador recebe a seta. Nível 5 são ~1.600 XP — várias sessões de estreia. */
export const NOVATO_NIVEL = 5;

/**
 * A PRESA FORA DA TELA: a comida mais perto que o novato NÃO está vendo, para a seta na borda (`presa` em
 * `Guia.js`). Nada se há comida NA TELA — ali o próprio planeta está à vista, e a seta apontando para
 * fora brigaria com ele pelo olho.
 * ⚠️ Duas fontes, porque nenhuma basta: as peças da AOI têm o RAIO de verdade (mas a AOI é pouco maior que a
 * tela), e o placar tem TODOS os vivos (mas só a massa total). Do placar, só entra quem é comível por
 * inteiro — `√massa` é o maior raio que qualquer peça dele pode ter, então a conta é conservadora: a seta
 * nunca leva o novato até alguém que ele não consegue comer.
 * @param {{x:number,y:number,r:number}|null} eu a MAIOR peça própria
 * @param {Array<{x:number,y:number,r:number}>} pecas peças alheias da AOI (sem aliados)
 * @param {Array<{x:number,y:number,mass:number,slot:number}>} rows o placar (todos os vivos)
 * @param {Set<number>} fora os slots que não contam (eu, aliados)
 * @param {{x0:number,y0:number,x1:number,y1:number}} tela o retângulo visível, em coordenadas de mundo
 * @returns {null|{tipo:"presa",x:number,y:number,r:number}}
 */
export function presaForaDaTela(eu, pecas, rows, fora, tela) {
  if (!eu || !tela) return null;
  const lim = eu.r / EAT.RATIO, na = (x, y) => x >= tela.x0 && x <= tela.x1 && y >= tela.y0 && y <= tela.y1;
  let alvo = null, d2m = Infinity;
  const ve = (x, y, r) => { const dx = x - eu.x, dy = y - eu.y, d2 = dx * dx + dy * dy; if (d2 < d2m) { d2m = d2; alvo = { tipo: "presa", x, y, r }; } };
  for (const p of pecas || []) {
    if (!(p.r <= lim)) continue;
    if (na(p.x, p.y)) return null;   // há comida na tela: ela já está à vista
    ve(p.x, p.y, p.r);
  }
  for (const w of rows || []) {
    if (fora && fora.has(w.slot)) continue;
    const r = Math.sqrt(Math.max(0, w.mass || 0));
    if (!(r > 0 && r <= lim) || na(w.x, w.y)) continue;
    ve(w.x, w.y, r);
  }
  return alvo;
}

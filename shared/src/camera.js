// ── Câmera: zoom por massa e retângulo de visão (usado no cliente e na AOI do servidor) ──
// @ts-check
import {CAM,WORLD,ZOOM} from "./constants.js";
import {clamp} from "./util.js";
/**
 * Escala (px de tela por px de mundo) — a fórmula do cliente do agar.io, ver o bloco CAM em constants.js:
 * `min(BASE/ΣR, 1)^EXP × max(H/REF_H, W/REF_W)`, com piso em mostrar o mundo inteiro.
 * `mult` é o powerup de ZOOM (POWERUP.ZOOM_K): escala MENOR = mais mundo na tela, então ele DIVIDE.
 * ⚠️ A divisão vem antes do piso. Depois dele, o powerup furaria o "mostrar o mundo inteiro" e apareceria
 * vazio além da borda do mapa.
 * ⚠️ E ele tem que ser passado nos DOIS consumidores — a câmera do cliente e a AOI do snapshot
 * (server/src/net/snapshot.js) —, senão o jogador afasta e recebe uma borda sem nada dentro.
 * `manual` é a RODA (`zoomSpan`), e ele entra num lugar diferente de propósito — ver abaixo.
 * @param {number} sumR soma dos raios de TODAS as peças próprias @param {number} W @param {number} H tela em px
 * @param {number} [mult] fator de afastamento do powerup (1 = sem powerup)
 * @param {number} [manual] fator da roda: >1 afasta, <1 aproxima (1 = zoom automático)
 */
export function zoomFor(sumR,W,H,mult=1,manual=1){
  const k=sumR>CAM.BASE?CAM.BASE/sumR:1;
  // CAM.K é o botão do /admin (tunable 'wire'): 1 = a câmera de sempre, >1 afasta, <1 aproxima. Ele entra
  // ANTES do piso, junto do powerup, porque é enquadramento de JOGO e não pode mostrar além do mapa — a
  // roda, que é escolha do jogador, continua vindo depois.
  const z=Math.pow(k,CAM.EXP)*Math.max(H/CAM.REF_H,W/CAM.REF_W)/((mult>1?mult:1)*(CAM.K>0?CAM.K:1));
  const zmin=Math.max(W/WORLD.w,H/WORLD.h);   // piso: mostrar o mundo inteiro. O teto de custo é da AOI (aoiScaleFood), não da câmera
  const zp=z<zmin?zmin:z;
  if(!(manual>0)||manual===1)return zp;
  // ⚠️ O FATOR DA RODA VEM DEPOIS DO PISO, e o do powerup vem ANTES. Não é descuido, e trocar a ordem mata a
  // funcionalidade em silêncio justamente para quem ela existe. O piso morde a partir de ΣR ≈ 3578 (1920×1080):
  // dali para cima o automático JÁ é `zmin`, e um `zp/manual` calculado antes dele voltaria a ser clampado em
  // `zmin` — o planetão giraria a roda e não aconteceria nada. São coisas de naturezas diferentes: o powerup é
  // efeito de JOGO e nunca pode mostrar além do mapa; a roda é ENQUADRAMENTO, e enquadrar tem que continuar
  // funcionando depois que o automático encostou no piso.
  const zm=zp/manual;
  return zm<zmin?zmin:zm;}   // afastar nunca fura o piso; aproximar sobe a escala e nem chega perto dele
/**
 * ZOOM MANUAL: o quanto a roda pode AFASTAR para uma massa (>= 1; aproximar é o inverso, `1/zoomSpan`).
 * A escala final fica entre `zoomFor/span` e `zoomFor*span` — uma faixa em torno do automático, nunca um
 * valor absoluto: quem manda no enquadramento continua sendo a fórmula do agar.
 *
 * O eixo é `u = 1 - min(BASE/ΣR,1)^EXP`, que NÃO é um número novo: é o `k^EXP` que o `zoomFor` já calcula,
 * lido do outro lado — "quanto de zoom a massa já consumiu" (0 até ΣR=BASE, .67 num PLAYER.MAX_R). Por herdar
 * dele, a faixa herda de graça a lei de potência (crescer 10× não abre 10× de faixa), a mesma área de mundo em
 * qualquer tela e a monotonicidade.
 *
 * A faixa é LOG-SIMÉTRICA (`in = 1/out`): o que se pode afastar, pode-se aproximar. Uma constante em vez de duas.
 *
 * ⚠️ É a MESMA função nos dois lados. O cliente clampa para desenhar e o servidor clampa para montar a AOI
 * (net/snapshot.js) com o ΣR de VERDADE — é isso que faz os dois enquadrarem a mesma coisa sem um byte novo de
 * protocolo, e é isso que impede um cliente adulterado de pedir o mapa inteiro.
 * @param {number} sumR soma dos raios das peças próprias
 */
export function zoomSpan(sumR){const k=sumR>CAM.BASE?CAM.BASE/sumR:1;
  return 1+ZOOM.MIN+ZOOM.K*(1-Math.pow(k,CAM.EXP));}
/**
 * Fator do jogador preso à faixa que a massa dele permite. É o ponto de anti-cheat, então engole lixo sem
 * reclamar: NaN, 0, negativo, Infinity, string, null e undefined viram 1 — um `NaN` escapando daqui viraria um
 * `viewRect` de NaN, e uma AOI que não contém nada (ou tudo).
 * Idempotente de propósito: `clampZoom(clampZoom(f))===clampZoom(f)`, o que autoriza clampar duas vezes
 * (Session + snapshot) sem medo.
 */
export function clampZoom(f,sumR){const n=+f;if(!(n>0)||!Number.isFinite(n))return 1;
  const s=zoomSpan(sumR);return clamp(n,1/s,s);}
/** Centro, maior raio, dispersão e SOMA dos raios de um conjunto de peças. @param {Array<{x:number,y:number,r:number}>} pieces */
export function focusOf(pieces){let sx=0,sy=0,big=0,sum=0;for(const p of pieces){sx+=p.x;sy+=p.y;sum+=p.r;if(p.r>big)big=p.r;}
  const n=pieces.length||1,cx=sx/n,cy=sy/n;let spread=0;for(const p of pieces){const d=Math.hypot(p.x-cx,p.y-cy);if(d>spread)spread=d;}
  return{cx,cy,bigR:big,spread,sumR:sum};}
/**
 * Escala a usar para a AOI da COMIDA: nunca menor que a que mostra AOI_FOOD_VIEW do mundo. A câmera pode afastar
 * o quanto precisar (o gigante tem que ver as próprias peças), mas mandar as 2500 comidas do mapa inteiro para
 * um cliente só é o que derruba o snapshot — e, no zoom afastado, cada pelota tem 1–2 px na tela.
 * ⚠️ O piso é PRÓPRIO e não acompanha a câmera sozinho, então o powerup de ZOOM tem que dividi-lo também.
 * O mesmo vale para a roda (`manual`) — mas SÓ quando ela AFASTA: `manual>1?manual:1` é o `max(1,f)` que
 * impede a AOI de ENCOLHER quando o jogador aproxima. Estreitar renderia quase nada (a comida já tem piso de
 * área e teto de contagem) e custaria caro: cada entalhe para dentro viraria um REMOVE+CREATE de tudo em
 * volta, e "sumir é pior que faltar".
 * Sem isso o jogador afastado por powerup vê um anel largo SEM COMIDA NENHUMA: o piso em 1920×1080 é 0,364,
 * e a escala de qualquer um acima de ΣR ~250 já cai abaixo disso ao ser dividida por 1,5. Parece bug, e é.
 * O custo não explode junto: NET.AOI_FOOD_MAX limita a CONTAGEM, então o anel fica esparso, não caro.
 */
export const aoiScaleFood=(scale,W,H,mult=1,manual=1)=>{const m=(mult>1?mult:1)*(manual>1?manual:1);
  const min=Math.max(W/(WORLD.w*CAM.AOI_FOOD_VIEW),H/(WORLD.h*CAM.AOI_FOOD_VIEW))/m;return scale>min?scale:min;};
/** Retângulo do mundo visível para (centro, escala, tamanho da tela), expandido por `pad` (fração). */
export function viewRect(cx,cy,scale,W,H,pad=0){const hw=W/(2*scale)*(1+pad),hh=H/(2*scale)*(1+pad);return{x0:cx-hw,y0:cy-hh,x1:cx+hw,y1:cy+hh};}
export const rectHas=(r,x,y,rad)=>x+rad>r.x0&&x-rad<r.x1&&y+rad>r.y0&&y-rad<r.y1;

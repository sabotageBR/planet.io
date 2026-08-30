// ── Câmera: zoom por massa e retângulo de visão (usado no cliente e na AOI do servidor) ──
// @ts-check
import {CAM,WORLD} from "./constants.js";
/**
 * Escala (px de tela por px de mundo) — a fórmula do cliente do agar.io, ver o bloco CAM em constants.js:
 * `min(BASE/ΣR, 1)^EXP × max(H/REF_H, W/REF_W)`, com piso em mostrar o mundo inteiro.
 * `mult` é o powerup de ZOOM (POWERUP.ZOOM_K): escala MENOR = mais mundo na tela, então ele DIVIDE.
 * ⚠️ A divisão vem antes do piso. Depois dele, o powerup furaria o "mostrar o mundo inteiro" e apareceria
 * vazio além da borda do mapa.
 * ⚠️ E ele tem que ser passado nos DOIS consumidores — a câmera do cliente e a AOI do snapshot
 * (server/src/net/snapshot.js) —, senão o jogador afasta e recebe uma borda sem nada dentro.
 * @param {number} sumR soma dos raios de TODAS as peças próprias @param {number} W @param {number} H tela em px
 * @param {number} [mult] fator de afastamento (1 = sem powerup)
 */
export function zoomFor(sumR,W,H,mult=1){
  const k=sumR>CAM.BASE?CAM.BASE/sumR:1;
  const z=Math.pow(k,CAM.EXP)*Math.max(H/CAM.REF_H,W/CAM.REF_W)/(mult>1?mult:1);
  const zmin=Math.max(W/WORLD.w,H/WORLD.h);   // piso: mostrar o mundo inteiro. O teto de custo é da AOI (aoiScaleFood), não da câmera
  return z<zmin?zmin:z;}
/** Centro, maior raio, dispersão e SOMA dos raios de um conjunto de peças. @param {Array<{x:number,y:number,r:number}>} pieces */
export function focusOf(pieces){let sx=0,sy=0,big=0,sum=0;for(const p of pieces){sx+=p.x;sy+=p.y;sum+=p.r;if(p.r>big)big=p.r;}
  const n=pieces.length||1,cx=sx/n,cy=sy/n;let spread=0;for(const p of pieces){const d=Math.hypot(p.x-cx,p.y-cy);if(d>spread)spread=d;}
  return{cx,cy,bigR:big,spread,sumR:sum};}
/**
 * Escala a usar para a AOI da COMIDA: nunca menor que a que mostra AOI_FOOD_VIEW do mundo. A câmera pode afastar
 * o quanto precisar (o gigante tem que ver as próprias peças), mas mandar as 2500 comidas do mapa inteiro para
 * um cliente só é o que derruba o snapshot — e, no zoom afastado, cada pelota tem 1–2 px na tela.
 * ⚠️ O piso é PRÓPRIO e não acompanha a câmera sozinho, então o powerup de ZOOM tem que dividi-lo também.
 * Sem isso o jogador afastado por powerup vê um anel largo SEM COMIDA NENHUMA: o piso em 1920×1080 é 0,364,
 * e a escala de qualquer um acima de ΣR ~250 já cai abaixo disso ao ser dividida por 1,5. Parece bug, e é.
 * O custo não explode junto: NET.AOI_FOOD_MAX limita a CONTAGEM, então o anel fica esparso, não caro.
 */
export const aoiScaleFood=(scale,W,H,mult=1)=>{const m=mult>1?mult:1;
  const min=Math.max(W/(WORLD.w*CAM.AOI_FOOD_VIEW),H/(WORLD.h*CAM.AOI_FOOD_VIEW))/m;return scale>min?scale:min;};
/** Retângulo do mundo visível para (centro, escala, tamanho da tela), expandido por `pad` (fração). */
export function viewRect(cx,cy,scale,W,H,pad=0){const hw=W/(2*scale)*(1+pad),hh=H/(2*scale)*(1+pad);return{x0:cx-hw,y0:cy-hh,x1:cx+hw,y1:cy+hh};}
export const rectHas=(r,x,y,rad)=>x+rad>r.x0&&x-rad<r.x1&&y+rad>r.y0&&y-rad<r.y1;

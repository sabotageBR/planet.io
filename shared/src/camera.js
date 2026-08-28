// ── Câmera: zoom por massa e retângulo de visão (usado no cliente e na AOI do servidor) ──
// @ts-check
import {CAM,WORLD} from "./constants.js";
/**
 * Escala (px de tela por px de mundo) — a fórmula do cliente do agar.io, ver o bloco CAM em constants.js:
 * `min(BASE/ΣR, 1)^EXP × max(H/REF_H, W/REF_W)`, com piso em mostrar o mundo inteiro.
 * @param {number} sumR soma dos raios de TODAS as peças próprias @param {number} W @param {number} H tela em px
 */
export function zoomFor(sumR,W,H){
  const k=sumR>CAM.BASE?CAM.BASE/sumR:1;
  const z=Math.pow(k,CAM.EXP)*Math.max(H/CAM.REF_H,W/CAM.REF_W);
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
 */
export const aoiScaleFood=(scale,W,H)=>{const min=Math.max(W/(WORLD.w*CAM.AOI_FOOD_VIEW),H/(WORLD.h*CAM.AOI_FOOD_VIEW));return scale>min?scale:min;};
/** Retângulo do mundo visível para (centro, escala, tamanho da tela), expandido por `pad` (fração). */
export function viewRect(cx,cy,scale,W,H,pad=0){const hw=W/(2*scale)*(1+pad),hh=H/(2*scale)*(1+pad);return{x0:cx-hw,y0:cy-hh,x1:cx+hw,y1:cy+hh};}
export const rectHas=(r,x,y,rad)=>x+rad>r.x0&&x-rad<r.x1&&y+rad>r.y0&&y-rad<r.y1;

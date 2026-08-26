// ── Câmera: zoom por massa e retângulo de visão (usado no cliente e na AOI do servidor) ──
// @ts-check
import {clamp} from "./util.js";
/** Escala (px de tela por px de mundo) para o maior raio e a dispersão das peças. */
export function zoomFor(bigR,spread,portrait=false){const base=portrait?46:58;return clamp(base/(bigR+spread*.3),.3,1.25);}
/** Centro e dispersão de um conjunto de peças. @param {Array<{x:number,y:number,r:number}>} pieces */
export function focusOf(pieces){let sx=0,sy=0,big=0;for(const p of pieces){sx+=p.x;sy+=p.y;if(p.r>big)big=p.r;}
  const n=pieces.length||1,cx=sx/n,cy=sy/n;let spread=0;for(const p of pieces){const d=Math.hypot(p.x-cx,p.y-cy);if(d>spread)spread=d;}
  return{cx,cy,bigR:big,spread};}
/** Retângulo do mundo visível para (centro, escala, tamanho da tela), expandido por `pad` (fração). */
export function viewRect(cx,cy,scale,W,H,pad=0){const hw=W/(2*scale)*(1+pad),hh=H/(2*scale)*(1+pad);return{x0:cx-hw,y0:cy-hh,x1:cx+hw,y1:cy+hh};}
export const rectHas=(r,x,y,rad)=>x+rad>r.x0&&x-rad<r.x1&&y+rad>r.y0&&y-rad<r.y1;

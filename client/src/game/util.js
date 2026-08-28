// ── util do módulo do jogo ────────────────────────────────────────────────────
import {Color} from "pixi.js";

const _col=new Map();
/** cor CSS ("#rrggbb" | "rgba(...)") → {c:number, a:alpha} (cache) */
export function colorOf(s){let v=_col.get(s);if(v)return v;const c=new Color(s||"#fff");v={c:c.toNumber(),a:c.alpha};_col.set(s,v);return v;}
/** seed u16 (ou id) → ângulo determinístico */
export const seedAngle=s=>((s*2654435761)>>>0)/4294967296*6.2832;
export const seedUnit=s=>((s*2654435761)>>>0)/4294967296;
/** parâmetro de query (?x=1) */
export const Q=typeof location!=="undefined"?new URLSearchParams(location.search):new URLSearchParams();
export const qflag=k=>Q.has(k)&&Q.get(k)!=="0"&&Q.get(k)!=="false";
/** modo do body (desktop|portrait|landscape) */
export const bodyMode=()=>(typeof document!=="undefined"&&document.body.dataset.mode)||"desktop";
/**
 * Polilinha tracejada: emite segmentos [x1,y1,x2,y2,...] no array `out` a partir de pontos {x,y},
 * com padrão [on,off]. Sem dash → um único caminho contínuo (out = pontos).
 */
export function dashPolyline(pts,dash,out){out.length=0;if(pts.length<2)return out;
  if(!dash){for(const p of pts)out.push(p.x,p.y);return out;}
  const on=dash[0],off=dash[1]||on;let pen=true,rem=on;
  for(let i=1;i<pts.length;i++){let ax=pts[i-1].x,ay=pts[i-1].y;const bx=pts[i].x,by=pts[i].y;let len=Math.hypot(bx-ax,by-ay);
    while(len>0){const step=Math.min(len,rem),ux=(bx-ax)/len,uy=(by-ay)/len,nx=ax+ux*step,ny=ay+uy*step;
      if(pen)out.push(ax,ay,nx,ny);ax=nx;ay=ny;len-=step;rem-=step;if(rem<=0){pen=!pen;rem=pen?on:off;}}}
  return out;}

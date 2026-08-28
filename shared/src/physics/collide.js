// ── COLISÃO: quique por impulso (+Baumgarte), separação e fusão de peças do mesmo dono ──
// @ts-check
import {MERGE} from "../constants.js";
import {setMass,velX,velY} from "./body.js";

/**
 * Impulso elástico entre dois círculos, com correção posicional `posCorr` (fração da penetração, repartida
 * pelo inverso da massa). A velocidade de aproximação soma impulso + direção (`velX/velY`).
 * Para asteroide/estrela o impulso é a velocidade de verdade; **para uma peça ele cai
 * no canal de IMPULSO**, e por isso quem chama com peça usa `rules.bouncePiece`, que põe teto de
 * BOUNCE.DIST_MAX px no empurrão. Retorna a velocidade normal de aproximação (px/s), ou 0 se já se afastavam.
 * @param {import("./body.js").Body} A @param {import("./body.js").Body} B
 */
export function resolveBounce(A,B,e,posCorr){
  const dx=B.x-A.x,dy=B.y-A.y,d2=dx*dx+dy*dy;if(d2<1e-8)return 0;
  const d=Math.sqrt(d2),nx=dx/d,ny=dy/d,ia=1/A.mass,ib=1/B.mass,im=ia+ib,pen=A.r+B.r-d;
  if(pen>0){const c=pen*posCorr/im;A.x-=nx*c*ia;A.y-=ny*c*ia;B.x+=nx*c*ib;B.y+=ny*c*ib;}
  const vn=(velX(B)-velX(A))*nx+(velY(B)-velY(A))*ny;if(vn>=0)return 0;   // total = impulso + direção: quem CORRE contra a rocha bate de verdade
  const j=-(1+e)*vn/im;A.vx-=j*nx*ia;A.vy-=j*ny*ia;B.vx+=j*nx*ib;B.vy+=j*ny*ib;
  return -vn;}

/**
 * Separação de duas peças do mesmo dono: SÓ posicional (correção MERGE.SEP_CORR da sobreposição abaixo de
 * (ra+rb)·SEPARATE), como o `resolveCollision` do agar.io. Sem impulso: empurrar as próprias peças com
 * velocidade era uma das fontes de embalo de graça. Retorna true se agiu.
 * @param {import("./body.js").Body} a @param {import("./body.js").Body} b
 */
export function separateOwn(a,b){
  const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy,min=(a.r+b.r)*MERGE.SEPARATE;
  if(d2>=min*min||d2<1e-8)return false;
  const d=Math.sqrt(d2),nx=dx/d,ny=dy/d,push=(min-d)*MERGE.SEP_CORR;
  a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;
  return true;}

/**
 * Funde b em a se ambos podem (tick ≥ mergeAt) e d < max(r)·MERGE.DIST. Junta o impulso pela massa
 * (média ponderada, momento conservado) e a posição pelo centro de massa; a massa é somada SEM teto.
 * Os powerups das duas **se juntam** na peça que fica (é o que faz valer a pena reunir as partes):
 * vale o MAIOR nível de escudo e o MAIOR tempo de ímã das duas. Marca b.dead. Retorna true se fundiu.
 * @param {import("./body.js").Body} a @param {import("./body.js").Body} b
 */
export function tryMergeOwn(a,b,tick){
  if(a.mergeAt>tick||b.mergeAt>tick)return false;
  const dx=b.x-a.x,dy=b.y-a.y,mr=(a.r>b.r?a.r:b.r)*MERGE.DIST;if(dx*dx+dy*dy>=mr*mr)return false;
  const ma=a.mass,mb=b.mass,m=ma+mb;
  a.vx=(a.vx*ma+b.vx*mb)/m;a.vy=(a.vy*ma+b.vy*mb)/m;a.x=(a.x*ma+b.x*mb)/m;a.y=(a.y*ma+b.y*mb)/m;
  setMass(a,m);   // sem teto: fundir não evapora massa; se passar de MAX_R o autoSplit reparte no mesmo tick
  if((b.shieldLv|0)>(a.shieldLv|0)){a.shieldLv=b.shieldLv;a.shieldEvolveAt=b.shieldEvolveAt;}   // powerups: fica o melhor dos dois (reunir nunca fabrica poder)
  if(b.magnetUntil>a.magnetUntil)a.magnetUntil=b.magnetUntil;
  b.dead=true;return true;}

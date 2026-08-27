// ── COLISÃO: quique por impulso (+Baumgarte), separação e fusão de peças do mesmo dono ──
// @ts-check
import {MERGE,PLAYER,DT} from "../constants.js";
import {setMass} from "./body.js";

/**
 * Impulso elástico entre dois círculos com massa `mass` e correção posicional `posCorr`
 * (fração da penetração, distribuída pelo inverso da massa). Retorna a velocidade normal de
 * aproximação (px/s) se houve impulso; 0 se estavam se afastando ou coincidentes.
 * @param {import("./body.js").Body} A @param {import("./body.js").Body} B
 */
export function resolveBounce(A,B,e,posCorr){
  const dx=B.x-A.x,dy=B.y-A.y,d2=dx*dx+dy*dy;if(d2<1e-8)return 0;
  const d=Math.sqrt(d2),nx=dx/d,ny=dy/d,ia=1/A.mass,ib=1/B.mass,im=ia+ib,pen=A.r+B.r-d;
  if(pen>0){const c=pen*posCorr/im;A.x-=nx*c*ia;A.y-=ny*c*ia;B.x+=nx*c*ib;B.y+=ny*c*ib;}
  const vn=(B.vx-A.vx)*nx+(B.vy-A.vy)*ny;if(vn>=0)return 0;
  const j=-(1+e)*vn/im;A.vx-=j*nx*ia;A.vy-=j*ny*ia;B.vx+=j*nx*ib;B.vy+=j*ny*ib;
  return -vn;}

/**
 * Separação suave de duas peças do mesmo dono: correção MERGE.SEP_CORR da sobreposição
 * (abaixo de (ra+rb)·SEPARATE) + impulso igual MERGE.SEP_E na normal. Retorna true se agiu.
 * @param {import("./body.js").Body} a @param {import("./body.js").Body} b
 */
export function separateOwn(a,b){
  const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy,min=(a.r+b.r)*MERGE.SEPARATE;
  if(d2>=min*min||d2<1e-8)return false;
  const d=Math.sqrt(d2),nx=dx/d,ny=dy/d,push=(min-d)*MERGE.SEP_CORR;
  a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;
  const vn=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
  if(vn<0){const e=MERGE.SEP_E;a.vx+=vn*nx*e;a.vy+=vn*ny*e;b.vx-=vn*nx*e;b.vy-=vn*ny*e;}
  return true;}

/**
 * Funde b em a se ambos podem (tick ≥ mergeAt) e d < max(r)·MERGE.DIST. Conserva momento
 * (v = média ponderada pela massa; posição = centro de massa); a massa é somada com teto
 * PLAYER.MAX_R. Os powerups das duas **se juntam** na peça que fica (é o que faz valer a pena reunir as partes):
 * vale o MAIOR nível de escudo e o MAIOR tempo de ímã das duas. Marca b.dead. Retorna true se fundiu.
 * @param {import("./body.js").Body} a @param {import("./body.js").Body} b
 */
export function tryMergeOwn(a,b,tick){
  if(a.mergeAt>tick||b.mergeAt>tick)return false;
  const dx=b.x-a.x,dy=b.y-a.y,mr=(a.r>b.r?a.r:b.r)*MERGE.DIST;if(dx*dx+dy*dy>=mr*mr)return false;
  const ma=a.mass,mb=b.mass,m=ma+mb,cap=PLAYER.MAX_R*PLAYER.MAX_R;
  a.vx=(a.vx*ma+b.vx*mb)/m;a.vy=(a.vy*ma+b.vy*mb)/m;a.x=(a.x*ma+b.x*mb)/m;a.y=(a.y*ma+b.y*mb)/m;
  setMass(a,m>cap?cap:m);
  if((b.shieldLv|0)>(a.shieldLv|0)){a.shieldLv=b.shieldLv;a.shieldEvolveAt=b.shieldEvolveAt;}   // powerups: fica o melhor dos dois (reunir nunca fabrica poder)
  if(b.magnetUntil>a.magnetUntil)a.magnetUntil=b.magnetUntil;
  b.dead=true;return true;}

/**
 * Atração entre duas peças do mesmo dono que JÁ podem fundir: a d < (ra+rb)·MERGE.ATTRACT_RANGE cada uma
 * ganha Δv = n·ATTRACT_A·DT·(1−d/alcance) rumo à outra (simétrico, independe da massa). Fora do alcance
 * nada acontece — as partes só se juntam pelo steering natural até ficarem perto. Retorna true se agiu.
 * @param {import("./body.js").Body} a @param {import("./body.js").Body} b
 */
export function attractOwn(a,b){
  const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy,range=(a.r+b.r)*MERGE.ATTRACT_RANGE;
  if(d2>=range*range||d2<1e-8)return false;
  const d=Math.sqrt(d2),k=MERGE.ATTRACT_A*DT*(1-d/range)/d;
  a.vx+=dx*k;a.vy+=dy*k;b.vx-=dx*k;b.vy-=dy*k;return true;}

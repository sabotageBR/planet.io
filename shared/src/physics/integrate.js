// ── INTEGRAÇÃO: thrust/arrasto/regime de arremesso/paredes (unidades px, s, px/s) ──
// @ts-check
import {SPEED,WALL,WORLD,DT} from "../constants.js";
import {PIECE_FLAG} from "../protocol/constants.js";
import {clamp} from "../util.js";

const DRAG_F=Math.exp(-SPEED.DRAG*DT),LAUNCH_F=Math.exp(-SPEED.LAUNCH_DRAG*DT);   // fatores por tick em 60 Hz
/** Velocidade máxima de uma peça pelo raio: clamp(K/r, MIN, MAX). */
export const vmaxFor=r=>clamp(SPEED.K/r,SPEED.MIN,SPEED.MAX);

/**
 * Integra uma peça: thrust em direção a (tx,ty), arrasto, regime de arremesso (emerge da
 * velocidade: |v| > vmax·LAUNCH_THRESH → LAUNCH_DRAG, steer ×LAUNCH_STEER, sem clamp), paredes (WALL.E).
 * Seta/limpa PIECE_FLAG.LAUNCH. Retorna true se estava em arremesso.
 * @param {import("./body.js").Body} pc
 */
export function integratePiece(pc,tx,ty,vmaxMul,dt=DT,w=WORLD.w,h=WORLD.h){
  const vmax=vmaxFor(pc.r)*vmaxMul;let vx=pc.vx,vy=pc.vy;
  const launch=vx*vx+vy*vy>vmax*vmax*SPEED.LAUNCH_THRESH*SPEED.LAUNCH_THRESH;
  const dx=tx-pc.x,dy=ty-pc.y,len2=dx*dx+dy*dy;
  if(len2>SPEED.STOP_DIST*SPEED.STOP_DIST){const k=vmax*SPEED.ACCEL*dt*(launch?SPEED.LAUNCH_STEER:1)/Math.sqrt(len2);vx+=dx*k;vy+=dy*k;}
  const f=dt===DT?(launch?LAUNCH_F:DRAG_F):Math.exp(-(launch?SPEED.LAUNCH_DRAG:SPEED.DRAG)*dt);vx*=f;vy*=f;
  if(!launch){const s2=vx*vx+vy*vy;if(s2>vmax*vmax){const s=vmax/Math.sqrt(s2);vx*=s;vy*=s;}}
  let x=pc.x+vx*dt,y=pc.y+vy*dt;const r=pc.r;
  if(x<r){x=r;if(vx<0)vx*=-WALL.E;}else if(x>w-r){x=w-r;if(vx>0)vx*=-WALL.E;}
  if(y<r){y=r;if(vy<0)vy*=-WALL.E;}else if(y>h-r){y=h-r;if(vy>0)vy*=-WALL.E;}
  pc.x=x;pc.y=y;pc.vx=vx;pc.vy=vy;
  pc.flags=launch?pc.flags|PIECE_FLAG.LAUNCH:pc.flags&~PIECE_FLAG.LAUNCH;
  return launch;}

/**
 * Integra um corpo livre (ejetado, asteroide, míssil): arrasto exponencial `drag` (1/s, 0 = nenhum),
 * paredes com restituição `wallE`. Retorna true se tocou uma parede.
 * @param {import("./body.js").Body} b
 */
export function integrateFree(b,drag,wallE,dt=DT,w=WORLD.w,h=WORLD.h){
  if(drag>0){const f=Math.exp(-drag*dt);b.vx*=f;b.vy*=f;}
  let x=b.x+b.vx*dt,y=b.y+b.vy*dt;const r=b.r;let hit=false;
  if(x<r){x=r;if(b.vx<0)b.vx*=-wallE;hit=true;}else if(x>w-r){x=w-r;if(b.vx>0)b.vx*=-wallE;hit=true;}
  if(y<r){y=r;if(b.vy<0)b.vy*=-wallE;hit=true;}else if(y>h-r){y=h-r;if(b.vy>0)b.vy*=-wallE;hit=true;}
  b.x=x;b.y=y;return hit;}

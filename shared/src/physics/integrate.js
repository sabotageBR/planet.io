// ── INTEGRAÇÃO: os dois canais de movimento do agar.io (direção + impulso) + paredes ──
// A peça NÃO tem velocidade de andar. Cada tick soma dois deslocamentos:
//   1. direção  = û(ponteiro) · vmax(r) · min(d,RAMP)/RAMP · dt   → instantâneo, sem inércia nem arrasto
//   2. impulso  = o canal de boost guardado em (vx,vy), que decai sempre e some sozinho
// Assim a velocidade é SEMPRE a padrão do tamanho: quique, fusão e gravidade empurram por um instante e
// devolvem o controle, em vez de virar embalo acumulado. Ver o bloco SPEED/BOOST em constants.js.
// @ts-check
import {SPEED,BOOST,WALL,WORLD,DT} from "../constants.js";
import {PIECE_FLAG} from "../protocol/constants.js";
import {clamp} from "../util.js";

const BOOST_F=Math.exp(-BOOST.K*DT),BOOST_STEP=(1-BOOST_F)/BOOST.K,STOP2=BOOST.STOP*BOOST.STOP;
// A VELOCIDADE DE REFERÊNCIA, capturada no LOAD com os números literais do agar: é a âncora em torno da
// qual `SPEED.EXP` gira. Fica num `const` de módulo (e não em constants.js) porque é DERIVADA — cravá-la
// à mão criaria uma segunda verdade que envelhece na primeira vez que alguém mexer em K ou EXP aqui.
const V_REF=SPEED.K/Math.pow(SPEED.REF_R,SPEED.EXP);
// K ancorado: só é recalculado quando o expoente sai do padrão, então o caminho quente (uma chamada por
// peça por tick) continua com UM `Math.pow`, e com EXP no padrão `_k` é o `SPEED.K` literal — a conta
// fica byte a byte a de antes desta mudança.
let _exp=SPEED.EXP,_k=SPEED.K;
/**
 * Velocidade padrão de uma peça pelo raio: clamp(K/r^EXP, MIN, MAX) · MUL — a curva do agar.io (EXP=.449).
 * `MUL` entra DEPOIS do clamp (senão MIN/MAX viram teto invisível do botão) e `EXP` gira em torno de
 * `SPEED.REF_R`, para os dois parâmetros do painel serem ortogonais — ver o bloco SPEED em constants.js.
 */
export const vmaxFor=r=>{
  if(SPEED.EXP!==_exp){_exp=SPEED.EXP;_k=V_REF*Math.pow(SPEED.REF_R,_exp);}
  return clamp(_k/Math.pow(r,_exp),SPEED.MIN,SPEED.MAX)*SPEED.MUL;};

/**
 * Integra uma peça: impulso (boost) + direção (ponteiro) + paredes (WALL.E reflete o impulso, como o
 * `clipVelocity` do agar). Retorna true se ainda havia impulso — é o PIECE_FLAG.LAUNCH.
 * @param {import("./body.js").Body} pc
 */
export function integratePiece(pc,tx,ty,dt=DT,w=WORLD.w,h=WORLD.h){
  let vx=pc.vx,vy=pc.vy,sx=0,sy=0;
  // ── 1. impulso: passo = ∫v·e^(−K·t) = v·(1−f)/K (exato, então o percurso total é |v0|/K) ──
  const boost=vx*vx+vy*vy>STOP2;
  if(boost){const f=dt===DT?BOOST_F:Math.exp(-BOOST.K*dt),step=dt===DT?BOOST_STEP:(1-f)/BOOST.K;
    sx=vx*step;sy=vy*step;
    const s2=sx*sx+sy*sy,cap=BOOST.MAX_STEP*(dt/DT);   // teto por passo: o mesmo anti-tunelamento do agar
    if(s2>cap*cap){const k=cap/Math.sqrt(s2);sx*=k;sy*=k;}
    vx*=f;vy*=f;if(vx*vx+vy*vy<=STOP2){vx=0;vy=0;}}
  else{vx=0;vy=0;}
  // ── 2. direção: velocidade PADRÃO na hora, com a rampa dos últimos RAMP px ──
  const dx=tx-pc.x,dy=ty-pc.y,d2=dx*dx+dy*dy;
  if(d2>1e-12){const d=Math.sqrt(d2),v=vmaxFor(pc.r)*(d<SPEED.RAMP?d/SPEED.RAMP:1)/d;
    pc.svx=dx*v;pc.svy=dy*v;sx+=dx*v*dt;sy+=dy*v*dt;}   // svx/svy: a velocidade de direção deste tick, para a colisão enxergar o quanto a peça está correndo
  else{pc.svx=0;pc.svy=0;}
  // ── 3. posição e paredes ──
  let x=pc.x+sx,y=pc.y+sy;const r=pc.r;
  if(x<r){x=r;if(vx<0)vx*=-WALL.E;}else if(x>w-r){x=w-r;if(vx>0)vx*=-WALL.E;}
  if(y<r){y=r;if(vy<0)vy*=-WALL.E;}else if(y>h-r){y=h-r;if(vy>0)vy*=-WALL.E;}
  pc.x=x;pc.y=y;pc.vx=vx;pc.vy=vy;
  pc.flags=boost?pc.flags|PIECE_FLAG.LAUNCH:pc.flags&~PIECE_FLAG.LAUNCH;
  return boost;}

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

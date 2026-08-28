// ── ZONA QUE ENCOLHE (modo Battle Royale) ────────────────────────────────────
// Círculo que fecha em ZONE.STAGES etapas: HOLD_TICKS[i] parada em R[i], depois SHRINK_TICKS[i]
// interpolando até R[i+1]. Fora dele a peça QUEIMA ZONE.BURN da massa por segundo, sem piso — no
// MIN_PIECE_R ela morre. É o que força o encontro e fecha a partida; sem isso 50 jogadores num mapa
// de 9600² se espalham e a fase final vira caça ao acampado no canto.
// Determinístico: todo sorteio sai do rng da sala e só acontece na virada de fase, então o estado é
// função do tick. O cliente NÃO roda esta máquina — ele recebe o círculo pronto (MSG.ZONE) e interpola.
// @ts-check
import {ZONE,WORLD} from "./constants.js";

/**
 * @typedef {object} Zone
 * @property {number} stage etapa atual (0..ZONE.STAGES)
 * @property {boolean} shrinking parada (false) ou fechando (true)
 * @property {number} x0 @property {number} y0 @property {number} r0 círculo de origem da interpolação
 * @property {number} x1 @property {number} y1 @property {number} r1 círculo de destino
 * @property {number} t0 @property {number} t1 ticks de início e fim da fase
 * @property {boolean} done já fechou tudo (fica parada no menor raio)
 */

/** Raio da etapa `i` em px. @param {number} i */
export const zoneR=i=>{const a=ZONE.R,r=(i<0?a[0]:i>=a.length?a[a.length-1]:a[i])*WORLD.w;return r>ZONE.MIN_R?r:ZONE.MIN_R;};

/**
 * Sorteia o centro do círculo seguinte: no máximo ZONE.DRIFT·(r−rn) do centro atual, então ele SEMPRE
 * cabe dentro do atual (uma zona que pulasse para trás mataria quem já estava dentro). Quando o círculo
 * já cabe no mapa, o centro também é preso às paredes — senão o miolo final fica meio fora da arena.
 * @param {{next:()=>number,angle:()=>number}} rng
 */
function nextCenter(rng,cx,cy,r,rn){
  const reach=(r-rn)*ZONE.DRIFT,a=rng.angle(),d=reach>0?reach*Math.sqrt(rng.next()):0;
  let x=cx+Math.cos(a)*d,y=cy+Math.sin(a)*d;
  const mx=WORLD.w-rn,my=WORLD.h-rn;
  if(rn<WORLD.w/2){x=x<rn?rn:x>mx?mx:x;}
  if(rn<WORLD.h/2){y=y<rn?rn:y>my?my:y;}
  return{x,y};}

/** Zona nova: etapa 0 parada, centrada no mapa. @param {number} tick */
export function createZone(tick){
  const r=zoneR(0),x=WORLD.w/2,y=WORLD.h/2;
  return{stage:0,shrinking:false,x0:x,y0:y,r0:r,x1:x,y1:y,r1:r,t0:tick,t1:tick+ZONE.HOLD_TICKS[0],done:false};}

/**
 * Avança a máquina de fases. Devolve `"shrink"` quando um fechamento acabou de começar, `"hold"` quando
 * uma parada começou e `""` quando nada mudou (é o gatilho do aviso e do som).
 * @param {Zone} z @param {number} tick @param {{next:()=>number,angle:()=>number}} rng
 */
export function stepZone(z,tick,rng){
  if(z.done||tick<z.t1)return"";
  if(z.shrinking){                                   // acabou de fechar: parada da etapa seguinte
    const i=z.stage+1;
    z.stage=i;z.shrinking=false;
    z.x0=z.x1;z.y0=z.y1;z.r0=z.r1;
    z.t0=z.t1;z.t1=z.t0+(ZONE.HOLD_TICKS[i]||ZONE.HOLD_TICKS[ZONE.HOLD_TICKS.length-1]);
    if(i>=ZONE.STAGES){z.done=true;z.t1=Infinity;}
    return z.done?"":"hold";}
  const i=z.stage;                                   // acabou a parada: sorteia o círculo seguinte e fecha
  const rn=zoneR(i+1),c=nextCenter(rng,z.x0,z.y0,z.r0,rn);
  z.shrinking=true;z.x1=c.x;z.y1=c.y;z.r1=rn;
  z.t0=z.t1;z.t1=z.t0+ZONE.SHRINK_TICKS[i];
  return"shrink";}

/** Círculo no tick (interpolação linear entre origem e destino). @param {Zone} z @param {number} tick */
export function zoneAt(z,tick,out={x:0,y:0,r:0}){
  const span=z.t1-z.t0;
  let u=span>0&&Number.isFinite(span)?(tick-z.t0)/span:1;
  u=u<0?0:u>1?1:u;
  out.x=z.x0+(z.x1-z.x0)*u;out.y=z.y0+(z.y1-z.y0)*u;out.r=z.r0+(z.r1-z.r0)*u;
  return out;}

/** Ticks até o próximo fechamento começar (Infinity se já acabou) — o HUD desenha essa contagem. */
export const zoneNextIn=(z,tick)=>z.done?Infinity:(z.shrinking?z.t1-tick+(ZONE.HOLD_TICKS[z.stage+1]||0):z.t1-tick);

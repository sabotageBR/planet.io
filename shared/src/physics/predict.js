// ── PREDIÇÃO (cliente): avança SÓ as peças próprias com as mesmas funções do servidor ──
// integração (thrust/arrasto/arremesso/paredes) → por par próprio: separação enquanto uma das duas não
// pode fundir, atração curta (attractOwn) quando ambas podem → fusões próprias. Sem colisões com terceiros, sem split/eject.
// Só muda os objetos do array recebido (fundidas são removidas dele, na ordem).
// @ts-check
import {DT,WORLD,SPEED} from "../constants.js";
import {integratePiece} from "./integrate.js";
import {separateOwn,tryMergeOwn,attractOwn} from "./collide.js";

/**
 * @param {import("./body.js").Body[]} pieces  peças próprias (mutadas no lugar)
 * @param {{tx:number,ty:number,speedUntil?:number}} state  alvo e powerup de velocidade (ticks absolutos)
 * @param {number} tick
 */
export function stepOwnPieces(pieces,state,tick,dt=DT,w=WORLD.w,h=WORLD.h){
  const mul=(state.speedUntil||0)>tick?SPEED.POWER_SPEED:1,n=pieces.length;
  for(let i=0;i<n;i++)integratePiece(pieces[i],state.tx,state.ty,mul,dt,w,h);
  if(n>1){
    for(let i=0;i<n;i++){const a=pieces[i],am=a.mergeAt<=tick;for(let j=i+1;j<n;j++){const b=pieces[j];if(am&&b.mergeAt<=tick)attractOwn(a,b);else separateOwn(a,b);}}
    for(let i=0;i<n;i++){const a=pieces[i];if(a.dead||a.mergeAt>tick)continue;for(let j=i+1;j<n;j++){const b=pieces[j];if(!b.dead)tryMergeOwn(a,b,tick);}}
    let k=0;for(let i=0;i<n;i++)if(!pieces[i].dead)pieces[k++]=pieces[i];pieces.length=k;}
  return pieces;}

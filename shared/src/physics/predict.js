// ── PREDIÇÃO (cliente): avança SÓ as peças próprias com as mesmas funções do servidor ──
// gravidade dos buracos negros (pullBody, mesma do servidor: sem ela a peça fica borrachuda perto do buraco) →
// integração (thrust/arrasto/arremesso/paredes) → por par próprio: separação enquanto uma das duas não
// pode fundir (só posicional, sem atração) → fusões próprias. Sem colisões com terceiros, sem split/eject;
// a sucção/teleporte do horizonte continua só no servidor.
// Só muda os objetos do array recebido (fundidas são removidas dele, na ordem).
// @ts-check
import {DT,WORLD,BLACKHOLE} from "../constants.js";
import {integratePiece} from "./integrate.js";
import {decayPiece} from "./body.js";
import {separateOwn,tryMergeOwn} from "./collide.js";
import {pullBody} from "./rules.js";

/**
 * @param {import("./body.js").Body[]} pieces  peças próprias (mutadas no lugar)
 * @param {{tx:number,ty:number}} state  alvo do ponteiro (px, mundo)
 * @param {number} tick
 * @param {{x:number,y:number,r:number,k:number}[]|null} [holes]  buracos negros vistos pelo cliente (k = influenceR/(r·INFLUENCE))
 */
export function stepOwnPieces(pieces,state,tick,dt=DT,w=WORLD.w,h=WORLD.h,holes=null){
  const n=pieces.length;
  for(let i=0;i<n;i++){integratePiece(pieces[i],state.tx,state.ty,dt,w,h);decayPiece(pieces[i],dt);}   // mesmo decaimento do servidor, senão a predição diverge
  if(holes)for(let j=0;j<holes.length;j++){const hb=holes[j],ri=hb.r*BLACKHOLE.INFLUENCE*hb.k,rc=hb.r*hb.k;if(ri<10)continue;   // depois da integração, como no servidor (passo 6)
    for(let i=0;i<n;i++)pullBody(hb,pieces[i],1,rc,ri);}
  if(n>1){
    for(let i=0;i<n;i++){const a=pieces[i],am=a.mergeAt<=tick;for(let j=i+1;j<n;j++){const b=pieces[j];if(!am||b.mergeAt>tick)separateOwn(a,b);}}
    for(let i=0;i<n;i++){const a=pieces[i];if(a.dead||a.mergeAt>tick)continue;for(let j=i+1;j<n;j++){const b=pieces[j];if(!b.dead)tryMergeOwn(a,b,tick);}}
    let k=0;for(let i=0;i<n;i++)if(!pieces[i].dead)pieces[k++]=pieces[i];pieces.length=k;}
  return pieces;}

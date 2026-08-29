// ── PREDIÇÃO (cliente): avança SÓ as peças próprias com as mesmas funções do servidor ──
// CUSPARADA (fase 1 do servidor, antes de integrar: perde a massa da pelota e leva o recuo) →
// gravidade dos buracos negros (pullBody, mesma do servidor: sem ela a peça fica borrachuda perto do buraco) →
// integração (thrust/arrasto/arremesso/paredes) → por par próprio: separação enquanto uma das duas não
// pode fundir (só posicional, sem atração) → fusões próprias. Sem colisões com terceiros, sem split;
// a sucção/teleporte do horizonte continua só no servidor.
// O eject entrou porque era a maior fonte de erro de predição do jogo: 12,35 px de recuo por cusparada,
// 8,57 vezes por segundo = 106 px/s que o cliente não enxergava. A câmera segue as peças próprias, então
// cada correção do servidor sacudia a tela inteira — era o "travamento" de segurar o W.
// Só muda os objetos do array recebido (fundidas são removidas dele, na ordem).
// @ts-check
import {DT,WORLD,BLACKHOLE,EJECT,PLAYER} from "../constants.js";
import {integratePiece} from "./integrate.js";
import {decayPiece,setMass} from "./body.js";
import {separateOwn,tryMergeOwn} from "./collide.js";
import {pullBody,ejectPiece,outOfZone,zoneMass} from "./rules.js";

/**
 * @param {import("./body.js").Body[]} pieces  peças próprias (mutadas no lugar)
 * @param {{tx:number,ty:number}} state  alvo do ponteiro (px, mundo)
 * @param {number} tick
 * @param {{x:number,y:number,r:number,k:number}[]|null} [holes]  buracos negros vistos pelo cliente (k = influenceR/(r·INFLUENCE))
 * @param {{hold:boolean,req:boolean,cdUntil:number,holdAt:number}|null} [ej]  agenda da cusparada, ESPELHO do
 *   PlayerState do servidor (ejectHold/ejectReq/ejectCdUntil/ejectHoldAt). Mutado no lugar: o chamador o carrega
 *   entre os ticks e o reancora a cada snapshot pelo `self.ejectCd`, que já vem no fio.
 * @param {{x:number,y:number,r:number}|null} [zc]  círculo da zona no tick (Battle Royale). A queimadura precisa
 *   estar aqui pelo mesmo motivo do decaimento: ela muda o RAIO, e sem prever o servidor corrigiria 20×/s numa
 *   peça que está encolhendo — a peça pulsaria de tamanho na borda. A MORTE continua só do servidor (chega pelo
 *   REMOVE do snapshot), exatamente como o esmagamento do buraco negro: aqui a massa só encosta no piso.
 */
export function stepOwnPieces(pieces,state,tick,dt=DT,w=WORLD.w,h=WORLD.h,holes=null,ej=null,zc=null){
  const n=pieces.length;
  if(ej){let go=ej.req;                                                    // mesma ordem da fase 1 do World.step
    if(ej.hold&&tick>=ej.holdAt){go=true;ej.holdAt=tick+EJECT.HOLD_TICKS;}   // o hold avança mesmo se o cooldown barrar
    if(go&&tick>=ej.cdUntil){ej.cdUntil=tick+EJECT.COOLDOWN_TICKS;
      for(let i=0;i<n;i++)ejectPiece(pieces[i],state.tx,state.ty);}
    ej.req=false;}
  const floor=PLAYER.MIN_PIECE_R*PLAYER.MIN_PIECE_R;
  for(let i=0;i<n;i++){const pc=pieces[i];integratePiece(pc,state.tx,state.ty,dt,w,h);decayPiece(pc,dt);   // mesmo decaimento do servidor, senão a predição diverge
    if(zc&&outOfZone(pc,zc)){const m=zoneMass(pc.mass,dt,zc.r);setMass(pc,m>floor?m:floor);}}
  if(holes)for(let j=0;j<holes.length;j++){const hb=holes[j],ri=hb.r*BLACKHOLE.INFLUENCE*hb.k,rc=hb.r*hb.k;if(ri<10)continue;   // depois da integração, como no servidor (passo 6)
    for(let i=0;i<n;i++)pullBody(hb,pieces[i],1,rc,ri);}
  if(n>1){
    for(let i=0;i<n;i++){const a=pieces[i],am=a.mergeAt<=tick;for(let j=i+1;j<n;j++){const b=pieces[j];if(!am||b.mergeAt>tick)separateOwn(a,b);}}
    for(let i=0;i<n;i++){const a=pieces[i];if(a.dead||a.mergeAt>tick)continue;for(let j=i+1;j<n;j++){const b=pieces[j];if(!b.dead)tryMergeOwn(a,b,tick);}}
    let k=0;for(let i=0;i<n;i++)if(!pieces[i].dead)pieces[k++]=pieces[i];pieces.length=k;}
  return pieces;}

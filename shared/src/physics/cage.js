// ── OCTÓGONO DE LARGADA (Battle Royale) ──────────────────────────────────────
// A gaiola dos primeiros segundos: um octógono regular, testado como OITO SEMIPLANOS. As normais estão em
// múltiplos de 45°, então os lados ficam de frente para os eixos e para as diagonais — é o octógono de
// "topo chato", que na tela lê como uma arena e não como um losango.
//
// ⚠️ ESTAS FUNÇÕES SÃO ESPELHADAS: o servidor as chama em `physics/world.js` (fase 2, logo depois de
// `integratePiece`) e o cliente em `physics/predict.js`, na MESMA posição do laço. Conter de um lado só é o
// pior defeito possível aqui — a peça própria bateria numa parede que o outro lado não tem, e a correção do
// snapshot chegaria 20×/s acima de `NET.SNAP_DIST` (120 px) **com a câmera junto**, porque ela segue as
// peças próprias. É o mesmo motivo de a queimadura do gás viver em `rules.js` e não só no servidor.
//
// ⚠️ DUAS PASSADAS, e não é preciosismo: corrigir contra o semiplano k empurra o corpo 0,707·excesso na
// direção dos vizinhos k±1, e uma passada só deixa até ~2 px para fora perto de um vértice. Dezesseis
// produtos escalares por peça por tick é ruído no perfil (são 50 peças); um planeta pendurado no canto da
// gaiola, não.
// @ts-check
import {WALL} from "../constants.js";

export const CAGE_N=8;
const CN=new Float64Array(CAGE_N),SN=new Float64Array(CAGE_N);
for(let k=0;k<CAGE_N;k++){const a=k*Math.PI/4;CN[k]=Math.cos(a);SN[k]=Math.sin(a);}
/** Circunraio (centro→VÉRTICE) a partir do apótema — é o que o DESENHO quer; a física nunca usa. */
export const cageVertexR=ap=>ap/Math.cos(Math.PI/CAGE_N);

/**
 * Contém o corpo dentro do octógono: posição presa ao semiplano e impulso REFLETIDO por `e`, exatamente
 * como as paredes do mundo em `integratePiece`. Devolve true se encostou.
 * @param {import("./body.js").Body} b @param {{x:number,y:number,ap:number}} cg
 */
export function clampCage(b,cg,e=WALL.E){
  const lim=cg.ap-b.r;if(lim<=0)return false;   // peça maior que a gaiola: não há o que conter
  let hit=false;
  for(let p=0;p<2;p++)for(let k=0;k<CAGE_N;k++){
    const nx=CN[k],ny=SN[k],d=(b.x-cg.x)*nx+(b.y-cg.y)*ny;
    if(d<=lim)continue;
    const over=d-lim;b.x-=nx*over;b.y-=ny*over;
    const vn=b.vx*nx+b.vy*ny;if(vn>0){b.vx-=(1+e)*vn*nx;b.vy-=(1+e)*vn*ny;}
    hit=true;}
  return hit;}

/**
 * O alvo do ponteiro trazido para DENTRO da gaiola. Sem isto os 50 — e principalmente o cérebro dos bots,
 * que mira o mapa inteiro — apontam para fora e ficam TODOS grudados na parede, imóveis: a gaiola, que
 * existe para ser uma multidão fervendo, leria como 50 planetas travados. Com o alvo dentro,
 * `integratePiece` freia sozinho na chegada (a rampa `min(d,RAMP)/RAMP`) e ninguém rama a parede.
 *
 * ⚠️ O RECORTE É DO RAIO, NUNCA DOS SEMIPLANOS — e isto foi MEDIDO, não deduzido. Clampar o alvo semiplano
 * a semiplano (que é o certo para o CORPO, logo acima, onde a correção é perpendicular à parede) TORCE a
 * direção nos cantos: um planeta em (cx+90) mirando 4 000 px à esquerda recebia um alvo em `cx−124` em vez
 * de `cx−720` — a 214 px dele, ou seja DENTRO da rampa de frenagem —, e ele atravessava a gaiola a passo
 * de tartaruga sem nunca encostar em ninguém. É exatamente a lição que `qPos`/`World.setTarget` já
 * carregam sobre o recorte ao mundo, num octógono em vez de num quadrado.
 * ⚠️ O alvo cai no círculo INSCRITO (raio = apótema), que está sempre dentro do octógono: na diagonal ele
 * fica ~8 % mais perto do que a parede real. Isso não custa nada — o que o motor usa é a DIREÇÃO, e ela
 * sai exata; a distância só importa dentro dos últimos `SPEED.RAMP` px, e lá o alvo já está longe.
 * ⚠️ Idempotente de propósito: conter um ponto que já está dentro é no-op, então dá para escrever o
 * resultado de volta em `ps.tx/ty` sem acumular erro tick após tick.
 * ⚠️ E é o apótema CHEIO, sem descontar raio: isto é um PONTO, não um corpo.
 */
export function clampCagePoint(cg,x,y,out={x:0,y:0}){
  const dx=x-cg.x,dy=y-cg.y,d2=dx*dx+dy*dy;
  if(d2<=cg.ap*cg.ap){out.x=x;out.y=y;return out;}
  const k=cg.ap/Math.sqrt(d2);out.x=cg.x+dx*k;out.y=cg.y+dy*k;return out;}

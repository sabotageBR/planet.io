// ── CORPO: objeto de forma fixa para todas as entidades (monomórfico para o V8) ──
// @ts-check
import {PLAYER,BOOST} from "../constants.js";

/**
 * @typedef {object} Body
 * @property {number} kind       KIND.*
 * @property {number} id         u32 incremental por mundo
 * @property {number} x
 * @property {number} y
 * @property {number} vx         px/s — PEÇA: canal de IMPULSO (boost), não a velocidade de andar (ver integrate.js)
 * @property {number} vy         px/s
 * @property {number} svx        PEÇA: velocidade de DIREÇÃO do tick (û·vmax·rampa), escrita por integratePiece.
 * @property {number} svy        Não vai no fio: quem simula a peça recalcula. É a velocidade "de verdade" dela,
 *                               e é o que a colisão usa — sem isso um planeta correndo contra uma rocha parada
 *                               teria velocidade relativa zero e não sentiria a batida.
 * @property {number} r          px — peça/asteroide/comida: r²=mass; ejetado: visual (mass pode ser maior, ver EJECT.MASS_FACTOR)
 * @property {number} mass
 * @property {number} owner      slot do dono (peça, ejetado, míssil) ou -1
 * @property {number} mergeAt    peça: tick a partir do qual pode fundir
 * @property {number} flags      peça: PIECE_FLAG.*; comida: FOOD_FLAG.* (interno)
 * @property {number} cdUntil    peça: imune à sucção até; ejetado: dono não come até; buraco: próxima mudança de deriva; estrela: próximo hit de partícula
 * @property {number} chipUntil  peça: próxima lasca permitida (cooldown por peça)
 * @property {number} hits       estrela: tiros/partículas levados (STAR.HITS_TO_SPLIT racha a estrela).
 *                              MÍSSIL: a ARMA de ORIGEM (WEAPON.*), porque o filho do Cacho tem `hue` de
 *                              míssil simples de propósito — significado por kind, como `hue` e `type`.
 * @property {number} magnetUntil     peça: ímã ativo até este tick (powerup POR PEÇA; fundir soma o tempo restante)
 * @property {number} shieldLv        peça: nível do escudo 0..POWERUP.SHIELD_MAX_LEVEL (não expira; fundir soma até o teto)
 * @property {number} shieldEvolveAt  peça: tick em que o escudo sobe um nível se ela não for atingida
 * @property {number} seed       só visual (forma do asteroide, brilho da comida, giro do buraco)
 * @property {number} type       comida: FOOD_TYPE; asteroide: índice do cinturão (-1 = errante); buraco: BH_PHASE; míssil: 0 alvo é slot, 1 alvo é id de entidade (míssil ou asteroide)
 * @property {number} hue        comida: 0..FOOD.HUES-1 (matiz quantizado); asteroide: variante visual; estrela: 1 = filha extra de um racha (não repõe a população)
 * @property {number} targetId   míssil: slot do alvo (type 0) ou id da entidade perseguida — míssil ou asteroide (type 1); -1 sem alvo
 * @property {number} targetPc   míssil type 0: id da PEÇA mirada (tiro mirado). -1 = o dono, tanto faz qual peça
 * @property {number} srcSlot    míssil interceptador: slot de QUEM ATIROU o míssil perseguido — quando o alvo some, ele vai atrás do atacante em vez de virar tiro perdido; -1 sem
 * @property {number} life       ejetado/míssil: tick de expiração; buraco: tick em que a fase atual termina
 * @property {number} ax         asteroide: empurrão acumulado em x ("vírus atirador")
 * @property {number} ay         asteroide: empurrão acumulado em y
 * @property {number} ang        asteroide de cinturão: ângulo orbital; buraco: direção da deriva
 * @property {number} orbitR     asteroide de cinturão: raio orbital
 * @property {number} k          buraco: intensidade 0..1 (GROW/ACTIVE/FADE)
 * @property {number} shed       peça: massa queimada pelo gás ainda não arrancada em pelota (só servidor —
 *                               a predição do cliente reduz a massa, mas não cria fragmento)
 * @property {boolean} dead      removido na compactação ordenada do fim do passo
 */

/** Cria um corpo com todos os campos (sempre a mesma forma). @returns {Body} */
export function createBody(kind,id,x,y,r){
  return{kind,id,x,y,vx:0,vy:0,svx:0,svy:0,r,mass:r*r,owner:-1,mergeAt:0,flags:0,cdUntil:0,chipUntil:0,hits:0,magnetUntil:0,shieldLv:0,shieldEvolveAt:0,seed:0,type:0,hue:0,targetId:-1,targetPc:-1,srcSlot:-1,life:0,
    ax:0,ay:0,ang:0,orbitR:0,k:0,shed:0,
    // `fi` só é usado pela COMIDA: é o slot dela em `world.food`, e a grade de pontos guarda esse
    // número. Nasce em -1 porque `world.killFood` e `moveFood` perguntam por ele antes de mexer na
    // grade — corpo que não é comida simplesmente nunca entra lá.
    fi:-1,dead:false};}
/** Define a massa e recalcula o raio (r=√m). @param {Body} b */
export function setMass(b,m){b.mass=m;b.r=Math.sqrt(m);}
/** Define o raio e recalcula a massa (m=r²). @param {Body} b */
export function setR(b,r){b.r=r;b.mass=r*r;}
/**
 * Soma massa. SEM teto por padrão: quem passa de PLAYER.MAX_R é repartido pelo autoSplit (regra do agar.io) em vez
 * de ter o ganho descartado em silêncio — era isso que travava o crescimento na parede dos 84 100 (MAX_R antigo).
 * @param {Body} b
 */
export function addMass(b,dm,maxR=Infinity){let m=b.mass+dm;const cap=maxR*maxR;if(m>cap)m=cap;setMass(b,m);}
/**
 * Empurra o corpo `dist` px na direção unitária (ux,uy) — canal de IMPULSO do agar.io (`setBoost`).
 * O canal decai sempre (BOOST.K), então `dist` é literalmente o que o corpo vai percorrer a mais: todo
 * empurrão do jogo (split, pop, estilhaço, quique, saída do buraco) é declarado em PIXELS por causa disso.
 * @param {Body} b
 */
export const addBoost=(b,ux,uy,dist)=>{const v=dist*BOOST.K;b.vx+=ux*v;b.vy+=uy*v;};
/**
 * Decaimento por tick: a peça perde PLAYER.DECAY da massa por segundo, com piso em START_R (ninguém murcha
 * abaixo do tamanho de nascença). É o `playerDecayRate` do agar (`size = √(size²·(1−rate))`).
 * @param {Body} b
 */
export function decayPiece(b,dt){const min=PLAYER.START_R;if(b.r<=min)return;
  const m=b.mass*(1-PLAYER.DECAY*dt),floor=min*min;setMass(b,m>floor?m:floor);}
/** Velocidade real de um corpo: impulso + direção (só a peça tem direção). @param {Body} b */
export const velX=b=>b.vx+b.svx,velY=b=>b.vy+b.svy;
/** Impulso do corpo em px: o quanto ainda falta ele ser empurrado. @param {Body} b */
export const boostLeft=b=>Math.sqrt(b.vx*b.vx+b.vy*b.vy)/BOOST.K;
/**
 * Limita o impulso do corpo a `maxDist` px sem mudar a direção. Usado no quique: a rocha continua
 * empurrando enquanto encosta, e sem teto o solavanco de um tick vira embalo de vários.
 * @param {Body} b
 */
export function capBoost(b,maxDist){const m=maxDist*BOOST.K,v2=b.vx*b.vx+b.vy*b.vy;
  if(v2>m*m){const k=m/Math.sqrt(v2);b.vx*=k;b.vy*=k;}}
/** Distância² entre centros. @param {Body} a @param {Body} b */
export const dist2b=(a,b)=>{const dx=a.x-b.x,dy=a.y-b.y;return dx*dx+dy*dy;};
/** Círculos se sobrepõem? @param {Body} a @param {Body} b */
export const overlaps=(a,b)=>{const s=a.r+b.r;return dist2b(a,b)<s*s;};
/** Quantos corpos vivos há no array. @param {Body[]} arr */
export function liveCount(arr){let n=0;for(let i=0;i<arr.length;i++)if(!arr[i].dead)n++;return n;}
/** Primeiro corpo vivo do array (ou null). @param {Body[]} arr */
export function firstLive(arr){for(let i=0;i<arr.length;i++)if(!arr[i].dead)return arr[i];return null;}

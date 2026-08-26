// ── Codec das mensagens binárias (docs/spec/protocol.md § Cliente → servidor / Servidor → cliente) ──
// @ts-check
// Convenções: encoders recebem um Writer, fazem reset() e devolvem uma vista dos bytes escritos —
// válida até o próximo encode com o mesmo writer (a Room serializa uma vez e manda a todos).
// encodeSnapshot não aloca nada além da vista de saída. Decoders devolvem objetos simples em
// unidades de mundo (px, px/s). Contadores (seq/ackSeq/clientTick/tick) dão wrap; magnitudes saturam.
import {WORLD} from "../constants.js";
import {MSG,KIND,UPD,NAME_MAX_BYTES,INPUT_BYTES} from "./constants.js";
import {qPos,dqPos,qR,dqR,qV,dqV,qTicks8} from "./quant.js";
import {createReader} from "./reader.js";
/** @typedef {import("./writer.js").Writer} Writer */
/** @typedef {import("./reader.js").Reader} Reader */
/** @typedef {import("./dto.js").EntityCreate} EntityCreate */
/** @typedef {import("./dto.js").EntityUpdate} EntityUpdate */
/** @typedef {import("./dto.js").EntityRemove} EntityRemove */
/** @typedef {import("./dto.js").SelfState} SelfState */
/** @typedef {import("./dto.js").Snapshot} Snapshot */
/** @typedef {import("./dto.js").PlayerInfo} PlayerInfo */
/** @typedef {import("./dto.js").Input} Input */
/** @typedef {import("./dto.js").LeaderboardRow} LeaderboardRow */
/** @typedef {import("./dto.js").GameEvent} GameEvent */
/** @typedef {import("./dto.js").Pong} Pong */
/** @typedef {ArrayBuffer|ArrayBufferView} Bytes */

const W=WORLD.w,H=WORLD.h;
const u8c=v=>v>0?(v>255?255:Math.round(v)):0,u16c=v=>v>0?(v>65535?65535:Math.round(v)):0,u32c=v=>v>0?(v>4294967295?4294967295:Math.round(v)):0;
/** @type {never[]} */const EMPTY=[];
/** @type {SelfState} */const SELF0={flags:0,missiles:0,powerBits:0,speedT:0,magnetT:0,shieldLv:0,score:0,splitCd:0,ejectCd:0,rank:0,mass:0};
/** @param {Reader} rd @param {number} type */
const expect=(rd,type)=>{const t=rd.u8();if(t!==type)throw new Error(`tipo de mensagem 0x${t.toString(16)} ≠ 0x${type.toString(16)}`);};

// ── INPUT (0x01, 10 bytes) ───────────────────────────────────────────────────
/** @param {Input} inp @param {Uint8Array} [out] @returns {Uint8Array} */
export function encodeInput(inp,out=new Uint8Array(INPUT_BYTES)){
  const seq=inp.seq&0xFFFF,tx=qPos(inp.tx,W),ty=qPos(inp.ty,H),ct=inp.clientTick&0xFFFF;
  out[0]=MSG.INPUT;out[1]=seq&255;out[2]=seq>>8;out[3]=tx&255;out[4]=tx>>8;out[5]=ty&255;out[6]=ty>>8;out[7]=inp.flags&255;out[8]=ct&255;out[9]=ct>>8;
  return out;}
/** @param {Reader} rd @returns {Input} */
function readInput(rd){expect(rd,MSG.INPUT);return{seq:rd.u16(),tx:dqPos(rd.u16(),W),ty:dqPos(rd.u16(),H),flags:rd.u8(),clientTick:rd.u16()};}
/** @param {Bytes} view */
export const decodeInput=view=>readInput(createReader(view));

// ── SNAPSHOT (0x10) ──────────────────────────────────────────────────────────
/** @param {Writer} w @param {EntityCreate} e */
function writeCreate(w,e){w.u8(e.kind).u32(e.id>>>0).u16(qPos(e.x,W)).u16(qPos(e.y,H)).u16(qR(e.r));
  switch(e.kind){
    case KIND.PIECE:w.u16(e.owner|0).i16(qV(e.vx)).i16(qV(e.vy)).u8(e.flags|0);break;
    case KIND.FOOD:w.u8(e.type|0).u8(e.hue|0);break;
    case KIND.EJECT:w.u16(e.owner|0).u8(e.hue|0).i16(qV(e.vx)).i16(qV(e.vy));break;
    case KIND.ASTEROID:w.u16(e.seed|0).i16(qV(e.vx)).i16(qV(e.vy));break;
    case KIND.BLACKHOLE:w.u16(e.seed|0).u16(u16c(e.influenceR)).u8(e.phase|0);break;
    case KIND.MISSILE:w.u16(e.owner|0).u16(e.target|0).i16(qV(e.vx)).i16(qV(e.vy));break;
    default:throw new Error(`kind desconhecido: ${e.kind}`);}}
/** @param {Reader} rd @returns {EntityCreate} */
function readCreate(rd){const kind=rd.u8(),id=rd.u32(),x=dqPos(rd.u16(),W),y=dqPos(rd.u16(),H),r=dqR(rd.u16());
  switch(kind){
    case KIND.PIECE:return{kind,id,x,y,r,owner:rd.u16(),vx:dqV(rd.i16()),vy:dqV(rd.i16()),flags:rd.u8()};
    case KIND.FOOD:return{kind,id,x,y,r,type:rd.u8(),hue:rd.u8()};
    case KIND.EJECT:return{kind,id,x,y,r,owner:rd.u16(),hue:rd.u8(),vx:dqV(rd.i16()),vy:dqV(rd.i16())};
    case KIND.ASTEROID:return{kind,id,x,y,r,seed:rd.u16(),vx:dqV(rd.i16()),vy:dqV(rd.i16())};
    case KIND.BLACKHOLE:return{kind,id,x,y,r,seed:rd.u16(),influenceR:rd.u16(),phase:rd.u8()};
    case KIND.MISSILE:return{kind,id,x,y,r,owner:rd.u16(),target:rd.u16(),vx:dqV(rd.i16()),vy:dqV(rd.i16())};
    default:throw new Error(`kind desconhecido: ${kind}`);}}
/** @param {Writer} w @param {EntityUpdate} u */
function writeUpdate(w,u){const m=u.mask|0;w.u32(u.id>>>0).u8(m);
  if(m&UPD.X_Y)w.u16(qPos(u.x,W)).u16(qPos(u.y,H));
  if(m&UPD.R)w.u16(qR(u.r));
  if(m&UPD.V)w.i16(qV(u.vx)).i16(qV(u.vy));
  if(m&UPD.FLAGS)w.u8(u.flags|0);
  if(m&UPD.EXTRA)w.u8(u.phase|0).u16(u16c(u.influenceR));}
/** @param {Reader} rd @returns {EntityUpdate} */
function readUpdate(rd){const id=rd.u32(),mask=rd.u8();/** @type {EntityUpdate} */const u={id,mask};
  if(mask&UPD.X_Y){u.x=dqPos(rd.u16(),W);u.y=dqPos(rd.u16(),H);}
  if(mask&UPD.R)u.r=dqR(rd.u16());
  if(mask&UPD.V){u.vx=dqV(rd.i16());u.vy=dqV(rd.i16());}
  if(mask&UPD.FLAGS)u.flags=rd.u8();
  if(mask&UPD.EXTRA){u.phase=rd.u8();u.influenceR=rd.u16();}
  return u;}
/** @param {Writer} w @param {SelfState} s */
function writeSelf(w,s){w.u8(s.flags|0).u8(u8c(s.missiles)).u8(s.powerBits|0).u16(u16c(s.speedT)).u16(u16c(s.magnetT)).u8(u8c(s.shieldLv)).u8(0)
  .u32(u32c(s.score)).u8(qTicks8(s.splitCd)).u8(qTicks8(s.ejectCd)).u16(u16c(s.rank)).u32(u32c(s.mass));}
/** @param {Reader} rd @returns {SelfState} */
function readSelf(rd){return{flags:rd.u8(),missiles:rd.u8(),powerBits:rd.u8(),speedT:rd.u16(),magnetT:rd.u16(),shieldLv:rd.u8()+rd.u8()*0,score:rd.u32(),splitCd:rd.u8(),ejectCd:rd.u8(),rank:rd.u16(),mass:rd.u32()};}
/** @param {Writer} w @param {Partial<Snapshot>&{tick:number,ackSeq:number}} s @returns {Uint8Array} */
export function encodeSnapshot(w,s){
  const cr=s.creates||EMPTY,up=s.updates||EMPTY,rm=s.removes||EMPTY;
  if(cr.length>65535||up.length>65535||rm.length>65535)throw new RangeError("snapshot: mais de 65535 entradas");
  w.reset().u8(MSG.SNAPSHOT).u32(s.tick>>>0).u16(s.ackSeq&0xFFFF).u16(cr.length).u16(up.length).u16(rm.length);
  for(let i=0;i<cr.length;i++)writeCreate(w,cr[i]);
  for(let i=0;i<up.length;i++)writeUpdate(w,up[i]);
  for(let i=0;i<rm.length;i++)w.u32(rm[i].id>>>0).u8(rm[i].reason|0);
  writeSelf(w,s.self||SELF0);
  return w.toBuffer();}
/** @param {Reader} rd @returns {Snapshot} */
function readSnapshot(rd){expect(rd,MSG.SNAPSHOT);
  const tick=rd.u32(),ackSeq=rd.u16(),nC=rd.u16(),nU=rd.u16(),nR=rd.u16();
  const creates=new Array(nC);for(let i=0;i<nC;i++)creates[i]=readCreate(rd);
  const updates=new Array(nU);for(let i=0;i<nU;i++)updates[i]=readUpdate(rd);
  const removes=new Array(nR);for(let i=0;i<nR;i++)removes[i]={id:rd.u32(),reason:rd.u8()};
  return{tick,ackSeq,creates,updates,removes,self:readSelf(rd)};}
/** @param {Bytes} view */
export const decodeSnapshot=view=>readSnapshot(createReader(view));

// ── PLAYERS (0x11) ───────────────────────────────────────────────────────────
/** @param {Writer} w @param {PlayerInfo[]} ps @returns {Uint8Array} */
export function encodePlayers(w,ps){if(ps.length>65535)throw new RangeError("players: mais de 65535 linhas");
  w.reset().u8(MSG.PLAYERS).u16(ps.length);
  for(let i=0;i<ps.length;i++){const p=ps[i];w.u16(p.slot|0).u8(p.flags|0).u8(p.skinId|0).str8(p.name||"",NAME_MAX_BYTES).u32(u32c(p.score));}
  return w.toBuffer();}
/** @param {Reader} rd @returns {PlayerInfo[]} */
function readPlayers(rd){expect(rd,MSG.PLAYERS);const n=rd.u16(),ps=new Array(n);
  for(let i=0;i<n;i++)ps[i]={slot:rd.u16(),flags:rd.u8(),skinId:rd.u8(),name:rd.str8(),score:rd.u32()};return ps;}
/** @param {Bytes} view */
export const decodePlayers=view=>readPlayers(createReader(view));

// ── LEADERBOARD (0x12) ───────────────────────────────────────────────────────
/** @param {Writer} w @param {LeaderboardRow[]} rows @returns {Uint8Array} */
export function encodeLeaderboard(w,rows){if(rows.length>255)throw new RangeError("leaderboard: mais de 255 linhas");
  w.reset().u8(MSG.LEADERBOARD).u8(rows.length);
  for(let i=0;i<rows.length;i++)w.u16(rows[i].slot|0).u32(u32c(rows[i].mass));
  return w.toBuffer();}
/** @param {Reader} rd @returns {LeaderboardRow[]} */
function readLeaderboard(rd){expect(rd,MSG.LEADERBOARD);const n=rd.u8(),rows=new Array(n);
  for(let i=0;i<n;i++)rows[i]={slot:rd.u16(),mass:rd.u32()};return rows;}
/** @param {Bytes} view */
export const decodeLeaderboard=view=>readLeaderboard(createReader(view));

// ── EVENT (0x13) ─────────────────────────────────────────────────────────────
/** @param {Writer} w @param {GameEvent} e @returns {Uint8Array} */
export function encodeEvent(w,e){
  return w.reset().u8(MSG.EVENT).u8(e.kind|0).u16(qPos(e.x,W)).u16(qPos(e.y,H)).u16(qR(e.r)).u16(e.slotA|0).u16(e.slotB|0).u32(e.extra>>>0).toBuffer();}
/** @param {Reader} rd @returns {GameEvent} */
function readEvent(rd){expect(rd,MSG.EVENT);return{kind:rd.u8(),x:dqPos(rd.u16(),W),y:dqPos(rd.u16(),H),r:dqR(rd.u16()),slotA:rd.u16(),slotB:rd.u16(),extra:rd.u32()};}
/** @param {Bytes} view */
export const decodeEvent=view=>readEvent(createReader(view));

// ── PONG (0x14) ──────────────────────────────────────────────────────────────
/** @param {Writer} w @param {Pong} p @returns {Uint8Array} */
export function encodePong(w,p){return w.reset().u8(MSG.PONG).u32(p.clientTime>>>0).u32(p.serverTick>>>0).toBuffer();}
/** @param {Reader} rd @returns {Pong} */
function readPong(rd){expect(rd,MSG.PONG);return{clientTime:rd.u32(),serverTick:rd.u32()};}
/** @param {Bytes} view */
export const decodePong=view=>readPong(createReader(view));

// ── Despacho pelo primeiro byte ──────────────────────────────────────────────
/**
 * Decodifica qualquer mensagem binária; `null` para tipo desconhecido ou buffer vazio.
 * @param {Bytes} src
 * @returns {({type:number}&(Input|Snapshot|Pong|GameEvent|{players:PlayerInfo[]}|{rows:LeaderboardRow[]}))|null}
 */
export function decodeMessage(src){const rd=createReader(src);if(rd.remaining()<1)return null;const t=rd.u8();rd.pos=0;
  switch(t){
    case MSG.INPUT:return{type:t,...readInput(rd)};
    case MSG.SNAPSHOT:return{type:t,...readSnapshot(rd)};
    case MSG.PLAYERS:return{type:t,players:readPlayers(rd)};
    case MSG.LEADERBOARD:return{type:t,rows:readLeaderboard(rd)};
    case MSG.EVENT:return{type:t,...readEvent(rd)};
    case MSG.PONG:return{type:t,...readPong(rd)};
    default:return null;}}

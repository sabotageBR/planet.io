// ── CÓDIGOS DE SALA: 1º caractere = shard (base36) + 3 de CODE_CHARS (sem 0/O/1/I) ──
// @ts-check
import {ROOM} from '@planet/shared/constants.js';
export const CODE_CHARS='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_RE=new RegExp(`^[0-9A-Z]{${ROOM.CODE_LEN}}$`);
export const shardChar=shard=>(shard|0).toString(36).toUpperCase();
/** @param {number} shard @param {{next:()=>number}} [rng] */
export function newCode(shard,rng){let c=shardChar(shard);const r=rng?rng.next:Math.random;
  for(let i=1;i<ROOM.CODE_LEN;i++)c+=CODE_CHARS[Math.floor(r()*CODE_CHARS.length)];return c;}
/** Normaliza (trim + maiúsculas); null se não tem a forma de um código. */
export const normalizeCode=code=>{if(code==null)return null;const c=String(code).trim().toUpperCase();return CODE_RE.test(c)?c:null;};
export const isValidCode=code=>normalizeCode(code)!==null;
/** Shard embutido no código (-1 se inválido). */
export function shardOf(code){const c=normalizeCode(code);return c?parseInt(c[0],36):-1;}

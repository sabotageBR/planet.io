// ── Quantização do fio (docs/spec/protocol.md § Quantização) ─────────────────
// @ts-check
// Posição u16 sobre o mundo, raio em décimos (u16), velocidade i16 px/s, ticks u8.
// Valores não finitos (NaN/undefined) viram 0 em vez de propagar; magnitudes saturam.
/** Posição em px → u16. @param {number} x @param {number} max largura/altura do mundo */
export const qPos=(x,max)=>{const u=Math.round(x/max*65535);return u>0?(u>65535?65535:u):0;};
/** u16 → posição em px. @param {number} u @param {number} max */
export const dqPos=(u,max)=>u/65535*max;
/** Raio em px → u16 em décimos (máx 6553.5 px). @param {number} r */
export const qR=r=>{const u=Math.round(r*10);return u>0?(u>65535?65535:u):0;};
/** @param {number} u */
export const dqR=u=>u/10;
/** Velocidade px/s → i16 (clamp ±32767). @param {number} v */
export const qV=v=>{const i=Math.round(v);return i>0?(i>32767?32767:i):i<0?(i<-32767?-32767:i):0;};
/** @param {number} i */
export const dqV=i=>i;
/** Ticks → u8 saturado (cooldowns). @param {number} n */
export const qTicks8=n=>{const t=Math.round(n);return t>0?(t>255?255:t):0;};

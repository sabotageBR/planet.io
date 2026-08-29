// @ts-check
export const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const lerp=(a,b,t)=>a+(b-a)*t;
export const dist2=(ax,ay,bx,by)=>{const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy;};
export const massToR=m=>Math.sqrt(m);
export const rToMass=r=>r*r;
// direção (nx,ny ∈ [-1,1]) + magnitude vn (u16) empacotadas no `extra` u32 de um EVENT: [nx u8 | ny u8 | vn u16]
export const packDir=(nx,ny,vn)=>((Math.round((nx||0)*127)+128)&255|((Math.round((ny||0)*127)+128)&255)<<8|(Math.min(65535,Math.round(vn||0))<<16))>>>0;
export const unpackDir=x=>({nx:((x&255)-128)/127,ny:(((x>>>8)&255)-128)/127,vn:x>>>16});

// ── NOMES ────────────────────────────────────────────────────────────────────
// Moraram em server/src/rooms/botChat.js até os easter eggs precisarem da MESMA raiz no shared
// (`eggs.js` casa o nick do jogador). Uma fonte só: o botChat reexporta daqui.
/** Reduz a comparável: sem acento, minúsculo, só letras e números (o resto vira espaço). */
export function normalizar(s){
  return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
/**
 * A RAIZ de um apelido. `botNick` monta os nicks em cinco formatos (`base`, `base42`, `base_137`, `BASE`,
 * `xXbaseXx`) — quem escreve no chat digita a raiz, não o enfeite: quem chama "Trovao_137" chama de
 * "trovao". Sem desmontar isso, metade das menções passaria batida.
 */
export function baseNick(nick){
  let n=normalizar(nick).replace(/\s+/g,'');
  const xx=n.match(/^xx(.+)xx$/);if(xx&&xx[1].length>=3)n=xx[1];   // xXbaseXx → xxbasexx depois de normalizar
  n=n.replace(/[0-9]+$/,'');                                     // base42 / base_137
  return n;}

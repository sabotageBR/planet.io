// ── RNG determinístico (mulberry32). shared/ nunca usa o gerador nativo do JS. ──
// @ts-check
/** @param {number} seed */
export function mulberry32(seed){let a=seed|0;return function(){a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
/** Cria um gerador com helpers. @param {number} seed */
export function createRng(seed){const r=mulberry32(seed);
  return{next:r,range:(a,b)=>a+r()*(b-a),int:(a,b)=>a+Math.floor(r()*(b-a+1)),pick:arr=>arr[Math.floor(r()*arr.length)],angle:()=>r()*Math.PI*2,chance:p=>r()<p};}
export function hashString(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}

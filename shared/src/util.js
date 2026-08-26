// @ts-check
export const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const lerp=(a,b,t)=>a+(b-a)*t;
export const dist2=(ax,ay,bx,by)=>{const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy;};
export const massToR=m=>Math.sqrt(m);
export const rToMass=r=>r*r;

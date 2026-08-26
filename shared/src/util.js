// @ts-check
export const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const lerp=(a,b,t)=>a+(b-a)*t;
export const dist2=(ax,ay,bx,by)=>{const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy;};
export const massToR=m=>Math.sqrt(m);
export const rToMass=r=>r*r;
// direção (nx,ny ∈ [-1,1]) + magnitude vn (u16) empacotadas no `extra` u32 de um EVENT: [nx u8 | ny u8 | vn u16]
export const packDir=(nx,ny,vn)=>((Math.round((nx||0)*127)+128)&255|((Math.round((ny||0)*127)+128)&255)<<8|(Math.min(65535,Math.round(vn||0))<<16))>>>0;
export const unpackDir=x=>({nx:((x&255)-128)/127,ny:(((x>>>8)&255)-128)/127,vn:x>>>16});

// ── CÂMERA: foco/zoom do shared/camera com suavização 1−exp(−dt/τ) (τ 120 ms pos, 200 ms zoom) ──
import {focusOf,zoomFor,viewRect,WORLD,clamp} from "@planet/shared";

export function createCamera(){
  let first=true,drift=0;
  const cam={x:WORLD.w/2,y:WORLD.h/2,scale:.5,tx:WORLD.w/2,ty:WORLD.h/2,tscale:.5,W:1,H:1,
    /** pieces: peças próprias (rx,ry,rr); vazio → deriva lenta */
    update(pieces,dt,portrait){
      if(pieces.length){const f=focusOf(pieces.map(p=>({x:p.rx,y:p.ry,r:p.rr})));cam.tx=f.cx;cam.ty=f.cy;cam.tscale=zoomFor(f.bigR,f.spread,portrait);}
      else{drift+=dt*.1;cam.tx=clamp(cam.tx+Math.cos(drift)*40*dt,400,WORLD.w-400);cam.ty=clamp(cam.ty+Math.sin(drift)*40*dt,400,WORLD.h-400);cam.tscale=.42;}
      if(first){cam.x=cam.tx;cam.y=cam.ty;cam.scale=cam.tscale;first=false;return;}
      const kp=1-Math.exp(-dt/.12),ks=1-Math.exp(-dt/.2);
      cam.x+=(cam.tx-cam.x)*kp;cam.y+=(cam.ty-cam.y)*kp;cam.scale+=(cam.tscale-cam.scale)*ks;},
    rect(pad=0){return viewRect(cam.x,cam.y,cam.scale,cam.W,cam.H,pad);},
    /** tela → mundo */
    toWorld(sx,sy){return{x:cam.x+(sx-cam.W/2)/cam.scale,y:cam.y+(sy-cam.H/2)/cam.scale};},
    reset(){first=true;},
  };
  return cam;}

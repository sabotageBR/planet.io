// ── CÂMERA: foco/zoom do shared/camera com a suavização do agar.io ──
// No cliente do agar é `viewX=(viewX+x)/2` por frame (50%!) e `scale=(9·scale+s)/10` (10%), ou seja
// τ = dt/ln2 = 24 ms na posição e dt/ln(10/9) = 158 ms no zoom. A câmera fica GRUDADA no planeta e só o
// zoom respira. Com os 120 ms que havia antes na posição ela nadava atrás — era o que sobrava de diferente
// depois de a fórmula do zoom já estar igual.
// Sem peças próprias há dois casos: `hold` (morto/fim de rodada, dentro da sala) CONGELA onde estava — o AOI do
// servidor também congela no ponto da morte (server/src/net/snapshot.js), então passear faria a cena esvaziar nas
// bordas, e parada ela mostra exatamente o que o servidor está mandando da sala. Fora da sala (lobby) a câmera
// passeia devagar, que é o fundo vivo do menu.
import {focusOf,zoomFor,viewRect,WORLD,CAM,clamp} from "@warspace/shared";

export function createCamera(){
  let first=true,drift=0;
  const cam={x:WORLD.w/2,y:WORLD.h/2,scale:.5,tx:WORLD.w/2,ty:WORLD.h/2,tscale:.5,W:1,H:1,
    /**
     * pieces: peças próprias (rx,ry,rr); vazio → congela (hold) ou passeia (lobby).
     * `mult`: powerup de ZOOM (POWERUP.ZOOM_K). ⚠️ O MESMO fator vai para a AOI do snapshot no servidor —
     * afastar só aqui daria mais tela do que o servidor está mandando, e a borda viria vazia.
     * Só o ramo das peças o usa: no lobby o zoom é fixo, e para quem morreu o `self` não traz powerup.
     */
    update(pieces,dt,hold=false,mult=1){
      if(pieces.length){const f=focusOf(pieces.map(p=>({x:p.rx,y:p.ry,r:p.rr})));cam.tx=f.cx;cam.ty=f.cy;cam.tscale=zoomFor(f.sumR,cam.W,cam.H,mult);}
      else if(!hold){drift+=dt*.1;cam.tx=clamp(cam.tx+Math.cos(drift)*40*dt,400,WORLD.w-400);cam.ty=clamp(cam.ty+Math.sin(drift)*40*dt,400,WORLD.h-400);cam.tscale=zoomFor(CAM.BASE*6,cam.W,cam.H);}   // lobby: um zoom de "planeta médio", coerente com a fórmula
      if(first){cam.x=cam.tx;cam.y=cam.ty;cam.scale=cam.tscale;first=false;return;}
      const kp=1-Math.exp(-dt/CAM.TAU_POS),ks=1-Math.exp(-dt/CAM.TAU_ZOOM);
      cam.x+=(cam.tx-cam.x)*kp;cam.y+=(cam.ty-cam.y)*kp;cam.scale+=(cam.tscale-cam.scale)*ks;},
    rect(pad=0){return viewRect(cam.x,cam.y,cam.scale,cam.W,cam.H,pad);},
    /** tela → mundo */
    toWorld(sx,sy){return{x:cam.x+(sx-cam.W/2)/cam.scale,y:cam.y+(sy-cam.H/2)/cam.scale};},
    reset(){first=true;},
  };
  return cam;}

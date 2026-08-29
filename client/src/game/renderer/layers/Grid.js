// ── GRADE (TilingSprite de um tile assado do tema) + BORDA do mundo (Graphics, tracejada) ──
import {Container,TilingSprite,Graphics,Texture} from "pixi.js";
import {WORLD} from "@warspace/shared";
import {colorOf,dashPolyline} from "../../util.js";

export function createGrid(R){
  const root=new Container(),ts=new TilingSprite({texture:Texture.WHITE,width:WORLD.w,height:WORLD.h}),border=new Graphics();root.addChild(ts,border);
  const seg=[];
  let gridKey="";
  function setTheme(){const th=R.theme,g=th.world.grid;gridKey=`${th.id}:grid`;
    ts.texture=R.cache.raw(gridKey,g.step,g.step,2,(c,w,h)=>{c.strokeStyle=g.color;c.lineWidth=g.width;c.beginPath();c.moveTo(g.width/2,0);c.lineTo(g.width/2,h);c.moveTo(0,g.width/2);c.lineTo(w,g.width/2);c.stroke();});
    ts.width=WORLD.w;ts.height=WORLD.h;
    border.clear();const W=WORLD.w,H=WORLD.h;
    for(const b of th.world.border){const col=colorOf(b.color);
      if(b.dash){dashPolyline([{x:0,y:0},{x:W,y:0},{x:W,y:H},{x:0,y:H},{x:0,y:0}],b.dash,seg);
        for(let i=0;i<seg.length;i+=4){border.moveTo(seg[i],seg[i+1]);border.lineTo(seg[i+2],seg[i+3]);}border.stroke({width:b.width,color:col.c,alpha:col.a,cap:"butt"});}
      else{border.rect(0,0,W,H).stroke({width:b.width,color:col.c,alpha:col.a});}}}
  // a grade cobre a tela inteira (é a camada mais cara em máquina fraca): sai no modo econômico
  return{root,setTheme,render(f){R.cache.keepAlive(gridKey);ts.visible=f.showGrid&&!R.econ;},destroy(){root.destroy({children:true});}};}

// ── MIRA DO MÍSSIL: reta pontilhada + ponta de seta enquanto a mira está armada (botão segurado) ──
// Só existe na tela de quem está mirando (nada vai no fio). f.aim = {x0,y0,x1,y1,lock} em px de mundo
// (null = escondida); `lock` = {x,y,r} do alvo que o míssil deve perseguir (anel), null se o cone está vazio.
// Estilo em theme.effects.aim {color,width,dash,head,alpha,pulse}.
import {Graphics} from "pixi.js";
import {colorOf,dashPolyline} from "../../util.js";

const seg=[];
export function createAim(R){
  const g=new Graphics();
  return{root:g,setTheme(){},
    render(f){const a=f.aim;g.clear();
      if(!a){g.visible=false;return;}
      g.visible=true;const st=R.theme.effects.aim,col=colorOf(st.color),al=col.a*(st.alpha[0]+(st.alpha[1]-st.alpha[0])*(.5+.5*Math.sin(f.t*st.pulse)));
      dashPolyline([{x:a.x0,y:a.y0},{x:a.x1,y:a.y1}],st.dash,seg);
      for(let i=0;i<seg.length;i+=4){g.moveTo(seg[i],seg[i+1]);g.lineTo(seg[i+2],seg[i+3]);}
      const an=Math.atan2(a.y1-a.y0,a.x1-a.x0),h=st.head;
      g.moveTo(a.x1-Math.cos(an-.4)*h,a.y1-Math.sin(an-.4)*h);g.lineTo(a.x1,a.y1);g.lineTo(a.x1-Math.cos(an+.4)*h,a.y1-Math.sin(an+.4)*h);
      if(a.lock){const lr=a.lock.r*1.3+h*.5;g.moveTo(a.lock.x+lr,a.lock.y);g.circle(a.lock.x,a.lock.y,lr);}   // travado: o míssil vai atrás deste
      g.stroke({width:st.width,color:col.c,alpha:al,cap:"round",join:"round"});},
    destroy(){g.destroy();},
  };}

// ── ALERTA: seta na borda da tela apontando de ONDE vem o míssil teleguiado que mira em mim ──
// Camada puramente local, como a mira: nada disto vai no fio. `f.threat = {nx,ny,k}` — direção normalizada do
// míssil e `k` (0..1) de quão perto ele está; quanto maior o k, maior a seta e mais rápido o pisca (o som do
// alerta acelera junto, no mesmo k). O `k` vem do SERVIDOR (`self.threat`): o míssil nasce muito além da AOI,
// e um aviso puramente client-side só apareceria com menos de 2 s de sobra.
// A seta é desenhada em px de MUNDO, na borda da janela visível — por isso vive no mesmo container do jogo e
// não precisa de uma camada de tela nova.
// Estilo em theme.effects.threat {color,width,size,margin,alpha,pulse}.
import {Graphics} from "pixi.js";
import {colorOf} from "../../util.js";

export function createThreat(R){
  const g=new Graphics();
  return{root:g,setTheme(){},
    render(f){const t=f.threat,cam=f.cam;g.clear();
      if(!t||!cam||!cam.scale){g.visible=false;return;}
      g.visible=true;const st=R.theme.effects.threat,col=colorOf(st.color);
      // onde a direção do míssil fura a janela: o menor avanço que bate numa das duas bordas
      const hw=cam.W/(2*cam.scale),hh=cam.H/(2*cam.scale),m=st.margin/cam.scale;
      const ax=Math.abs(t.nx),ay=Math.abs(t.ny);
      const d=Math.min(ax>1e-4?(hw-m)/ax:Infinity,ay>1e-4?(hh-m)/ay:Infinity);
      if(!Number.isFinite(d)||d<=0){g.visible=false;return;}
      const cx=t.nx,cy=t.ny,x=cam.x+cx*d,y=cam.y+cy*d,s=(st.size+st.size*.7*t.k)/cam.scale;
      const pulso=.5+.5*Math.sin(f.t*st.pulse*(1+5*t.k));
      const al=col.a*(st.alpha[0]+(st.alpha[1]-st.alpha[0])*pulso);
      // chevron apontando para FORA: a ponta indica de onde vem o tiro
      const tx=x+cx*s*.5,ty=y+cy*s*.5,bx=x-cx*s,by=y-cy*s,px=-cy*s*.9,py=cx*s*.9;
      g.moveTo(bx+px,by+py);g.lineTo(tx,ty);g.lineTo(bx-px,by-py);
      g.stroke({width:(st.width*(1+t.k))/cam.scale,color:col.c,alpha:al,cap:"round",join:"round"});},
    destroy(){g.destroy();},
  };}

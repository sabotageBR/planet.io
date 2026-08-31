// ── MÍSSEIS: sprite girado pela velocidade + rastro de pontos (theme.effects.missileTrail) ──
import {Container,Sprite,Graphics} from "pixi.js";
import {rectHas} from "@warspace/shared";
import {colorOf} from "../../util.js";

// ⚠️ MIN_PX é um piso em PIXELS DE TELA, no molde do NAME_MIN_PX de layers/Planets.js. O míssil tem raio FIXO
// em MUNDO (MISSILE.R=11) e vive dentro do container que leva `world.scale.set(cam.scale)`, então ele encolhe
// junto com a câmera — e a do gigante encosta no piso do zoom (0,2 em 1920×1080), onde o sprite inteiro dá ~11 px
// de tela e some no meio do jogo. O fator `k` só AMPLIA (>=1), então quem está pequeno não sente nada: o míssil
// segue com o tamanho de mundo de sempre e o piso só passa a mandar de ΣR ~230 para cima. O rastro escala pelo
// MESMO k — ele é parte do míssil, e deixá-lo para trás daria um foguete grande puxando um fiapo invisível.
const TRAIL_MAX=14,MIN_PX=40;
export function createMissiles(R){
  const root=new Container(),trail=new Graphics();root.addChild(trail);const byId=new Map();let frame=0;
  return{root,setTheme(){},
    render(f){frame++;const th=R.theme,TX=th.textures,MT=th.effects.missileTrail,FL=th.effects.missileFlame,MK=TX.scale.missile,view=f.view,rect=f.rect,t=f.t,zoom=f.cam&&f.cam.scale>0?f.cam.scale:1;
      trail.clear();const col=colorOf(MT.color);
      for(const e of view.missiles){let rec=byId.get(e.id);
        if(!rec){const sp=new Sprite();sp.anchor.set(.5);root.addChild(sp);rec={sp,pts:[],f:0,lx:e.rx,ly:e.ry};byId.set(e.id,rec);}
        rec.f=frame;if(Math.hypot(e.rx-rec.lx,e.ry-rec.ly)>2){rec.pts.push({x:e.rx,y:e.ry});rec.lx=e.rx;rec.ly=e.ry;if(rec.pts.length>TRAIL_MAX)rec.pts.shift();}
        const k=Math.max(1,MIN_PX/(2*e.rr*MK*zoom)),d=e.rr*MK*k;   // k>=1: o piso só AMPLIA, nunca encolhe
        const sp=rec.sp;if(!rectHas(rect,e.rx,e.ry,Math.max(e.rr*8,d))){sp.visible=false;continue;}sp.visible=true;
        sp.texture=R.cache.get(TX.key("missile"),64,(c,s)=>TX.missile(c,s,{}));sp.width=d*2*(1+Math.sin(t*FL.speed)*FL.amp*.15);sp.height=d*2;
        sp.position.set(e.rx,e.ry);sp.rotation=Math.atan2(e.vy||0,e.vx||1);sp.alpha=e.alpha;
        const n=rec.pts.length;for(let i=0;i<n;i++){if((n-1-i)%MT.every)continue;const a=(i+1)/n,p=rec.pts[i];trail.circle(p.x,p.y,Math.max(.5,e.rr*MT.radiusK*k*a));trail.fill({color:col.c,alpha:col.a*a*MT.alphaK*e.alpha});}}
      for(const [id,rec] of byId)if(rec.f!==frame){rec.sp.destroy();byId.delete(id);}},
    count(){return byId.size;},
    destroy(){root.destroy({children:true});byId.clear();},
  };}

// ── FUNDO (espaço de tela): bake do tema por resolução + parallax (ParticleContainer) + props ──
// Estrelas do parallax: quadradinho 4×4 do atlas tingido, posição/alfa dinâmicos com wrap no
// tile do tema e fade por altura (bandLayers.fade). Estrelas grandes: 2 variantes do mesmo atlas.
// Props (planetas de cenário): sprites em espaço de MUNDO (inseridos no container world pelo Renderer).
import {Container,Sprite,ParticleContainer,Particle,Texture,CanvasSource} from "pixi.js";
import {WORLD,rectHas} from "@planet/shared";

export function createBackground(R){
  const root=new Container(),props=new Container(),bg=new Sprite(Texture.EMPTY);root.addChild(bg);
  let stars=null,atlas=null,band=null,bgTex=null,bgKey="",metas=[],propSprites=[];
  function bakeBg(){const th=R.theme,W=R.W,H=R.H;if(W<2||H<2)return;let res=Math.min(R.res,1.5);const mp=W*H*res*res;if(mp>3.5e6)res=Math.sqrt(3.5e6/(W*H));
    const key=`${th.id}:${W}x${H}:${res.toFixed(2)}`;if(key===bgKey)return;bgKey=key;
    const c=document.createElement("canvas");c.width=Math.round(W*res);c.height=Math.round(H*res);const x=c.getContext("2d");x.scale(res,res);th.textures.background(x,W,H,{});
    const old=bgTex;bgTex=new Texture({source:new CanvasSource({resource:c,resolution:res,scaleMode:"linear"})});bg.texture=bgTex;bg.width=W;bg.height=H;if(old)old.destroy(true);}
  function rebuild(){const th=R.theme,TX=th.textures;band=TX.bandLayers({WW:WORLD.w,WH:WORLD.h});
    atlas=R.cache.atlas(`${th.id}:bgatlas`,[{key:"sq",size:4,draw:c=>{c.fillStyle="#fff";c.fillRect(-2,-2,4,4);}},
      {key:"s0",size:32,draw:(c,s)=>TX.star(c,s,{variant:0})},{key:"s1",size:32,draw:(c,s)=>TX.star(c,s,{variant:1})}]);
    for(const s of propSprites)s.destroy();propSprites=[];props.removeChildren();
    band.props.forEach((p,i)=>{const sp=new Sprite(R.cache.get(TX.key("prop",{i}),256,(c,s)=>TX.prop(c,s,{prop:p,i})));sp.anchor.set(.5);sp.position.set(p.x,p.y);
      const d=p.r*TX.scale.prop(p);sp.width=sp.height=d*2;sp.alpha=band.propsAlpha!=null?band.propsAlpha:.55;sp._r=d;props.addChild(sp);propSprites.push(sp);});
    rebuildStars();}
  function rebuildStars(){if(!band)return;if(stars){root.removeChild(stars);stars.destroy();stars=null;}metas=[];
    const T=band.tile,nx=Math.ceil(R.W/T)+1,ny=Math.ceil(R.H/T)+1,sq=atlas.frames.get("sq");
    stars=new ParticleContainer({dynamicProperties:{position:true,color:true,vertex:false,rotation:false,uvs:false},texture:atlas.texture});
    for(const l of band.layers)for(const s of l.stars)for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){
      const p=new Particle({texture:sq,anchorX:.5,anchorY:.5,scaleX:s.s/4,scaleY:s.s/4,tint:l.color});stars.addParticle(p);metas.push({p,l,s,i,j,big:false});}
    const B=band.bigStars;for(const s of B.stars)for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){
      const p=new Particle({texture:atlas.frames.get(s.v?"s1":"s0"),anchorX:.5,anchorY:.5,scaleX:s.s/32,scaleY:s.s/32});stars.addParticle(p);metas.push({p,l:B,s,i,j,big:true});}
    root.addChild(stars);}
  return{root,props,
    setTheme(){bgKey="";bakeBg();rebuild();},
    resize(){bakeBg();rebuildStars();},
    render(f){const cam=f.cam,W=R.W,H=R.H;if(!band)return;
      const on=!R.econ&&f.parallax;stars.visible=on;
      if(on){const T=band.tile,Y0=H*band.fade.y0,FD=H*band.fade.d;let lf=null,ox=0,oy=0;
        for(const m of metas){const l=m.l;if(l!==lf){lf=l;ox=((-cam.x*l.f*cam.scale)%T+T)%T;oy=((-cam.y*l.f*cam.scale)%T+T)%T;}
          const x=(m.s.x+ox)%T+m.i*T,y=(m.s.y+oy)%T+m.j*T,lim=m.big?Y0-FD*.5:Y0;
          if(y>lim||x>W+20||y<-20){m.p.alpha=0;continue;}m.p.x=x;m.p.y=y;m.p.alpha=(m.big?l.alpha:m.s.a)*Math.min(1,(Y0-y)/FD);}}
      const showProps=R.econLevel<2;for(const sp of propSprites)sp.visible=showProps&&rectHas(f.rect,sp.x,sp.y,sp._r);},
    destroy(){root.destroy({children:true});props.destroy({children:true});if(bgTex)bgTex.destroy(true);},
  };}

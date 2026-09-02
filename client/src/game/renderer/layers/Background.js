// ── FUNDO (espaço de tela): bake do tema por resolução + parallax (ParticleContainer) + props ──
// Estrelas do parallax: quadradinho 4×4 do atlas tingido, posição/alfa dinâmicos com wrap no
// tile do tema e fade por altura (bandLayers.fade). Estrelas grandes: 2 variantes do mesmo atlas.
// Props (planetas de cenário): sprites em espaço de MUNDO (inseridos no container world pelo Renderer).
// TROCA DE TEMA: o céu velho fica num sprite por cima (`prev`) e some em ROUND.FADE_MS enquanto o novo aparece —
// o fade é SÓ do fundo. HUD, telas e o jogo (o container `world`, irmão deste) não piscam.
import {Container,Sprite,ParticleContainer,Particle,Texture,CanvasSource} from "pixi.js";
import {WORLD,ROUND,rectHas} from "@warspace/shared";

/** Receita do atlas do parallax (quadradinho + 2 estrelas grandes) — compartilhada com o pré-aquecimento. */
const starItems=TX=>[{key:"sq",size:4,draw:c=>{c.fillStyle="#fff";c.fillRect(-2,-2,4,4);}},
  {key:"s0",size:32,draw:(c,s)=>TX.star(c,s,{variant:0})},{key:"s1",size:32,draw:(c,s)=>TX.star(c,s,{variant:1})}];
export function createBackground(R){
  const root=new Container(),props=new Container(),bg=new Sprite(Texture.EMPTY),prev=new Sprite(Texture.EMPTY);root.addChild(bg,prev);
  prev.visible=false;
  let stars=null,atlas=null,atlasKey="",band=null,bgTex=null,bgKey="",metas=[],propSprites=[],propKeys=[],bgDirty=false;
  let prevTex=null,fade=0,handoff=false;   // handoff: a próxima bake é troca de tema (guarda o céu velho em vez de destruí-lo)
  let ready=null;   // céu do PRÓXIMO tema, já assado (prewarm): na virada é só trocar a referência
  /** Resolução do bake do céu: teto de 3,5 Mpx (o canvas é do tamanho da tela). */
  function resFor(W,H){let res=Math.min(R.res,1.5);const mp=W*H*res*res;return mp>3.5e6?Math.sqrt(3.5e6/(W*H)):res;}
  const skyKey=(th,W,H,res)=>`${th.id}:${W}x${H}:${res.toFixed(2)}`;
  /** Assa o céu de um tema (canvas do tamanho da tela) e devolve {key,tex}. */
  function bakeSky(th,W,H){const res=resFor(W,H),key=skyKey(th,W,H,res);
    const c=document.createElement("canvas");c.width=Math.round(W*res);c.height=Math.round(H*res);const x=c.getContext("2d");x.scale(res,res);th.textures.background(x,W,H,{});
    return{key,tex:new Texture({source:new CanvasSource({resource:c,resolution:res,scaleMode:"linear"})})};}
  function bakeBg(){const th=R.theme,W=R.W,H=R.H;if(W<2||H<2)return;
    const key=skyKey(th,W,H,resFor(W,H));if(key===bgKey)return;
    // ⚠️ `ready=null` cru VAZAVA: quando a chave não bate (é o caso da troca de RESOLUÇÃO, que muda `resFor`),
    // o céu pré-assado era largado sem destruir — uma textura de tela cheia por vez.
    const serve=ready&&ready.key===key,made=serve?ready:bakeSky(th,W,H);
    if(ready&&!serve)ready.tex.destroy(true);
    ready=null;   // pré-assado na virada = custo zero aqui
    bgKey=made.key;
    const old=bgTex;bgTex=made.tex;bg.texture=bgTex;bg.width=W;bg.height=H;
    if(old&&handoff){dropPrev();prevTex=old;prev.texture=old;prev.width=W;prev.height=H;prev.alpha=1;prev.visible=true;fade=1;}   // crossfade: o céu velho sai por cima
    else if(old)old.destroy(true);
    handoff=false;}
  function dropPrev(){if(prevTex){prev.texture=Texture.EMPTY;prevTex.destroy(true);prevTex=null;}prev.visible=false;fade=0;}
  function rebuild(){const th=R.theme,TX=th.textures;band=TX.bandLayers({WW:WORLD.w,WH:WORLD.h});
    atlasKey=`${th.id}:bgatlas`;atlas=R.cache.atlas(atlasKey,starItems(TX));
    for(const s of propSprites)s.destroy();propSprites=[];props.removeChildren();propKeys=[];
    band.props.forEach((p,i)=>{const pk=TX.key("prop",{i});propKeys.push(pk);const sp=new Sprite(R.cache.get(pk,256,(c,s)=>TX.prop(c,s,{prop:p,i})));sp.anchor.set(.5);sp.position.set(p.x,p.y);
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
    setTheme(){handoff=!!bgTex;bakeBg();rebuild();if(fade>0&&stars)stars.alpha=0;},
    /**
     * Deixa o céu do próximo tema pronto (assado fora da virada). Chamado alguns segundos antes da troca:
     * é o que faz a virada do céu não custar nada — o bake do fundo é o canvas de tela cheia, o item mais caro.
     */
    prewarm(th){const W=R.W,H=R.H;if(!th||W<2||H<2||th.id===R.theme.id)return;
      const key=skyKey(th,W,H,resFor(W,H));if(bgKey===key||(ready&&ready.key===key))return;
      if(ready)ready.tex.destroy(true);
      ready=bakeSky(th,W,H);
      R.cache.warmAtlas(`${th.id}:bgatlas`,starItems(th.textures));},
    resize(){bgKey="";if(ready){ready.tex.destroy(true);ready=null;}bakeBg();rebuildStars();},   // tela mudou de tamanho: o pré-assado não serve mais
    /**
     * Só a RESOLUÇÃO mudou (troca de nível econômico). É outra coisa que o resize e por isso tem caminho
     * próprio: `R.W/R.H` são pixels de CSS e NÃO mudam aqui, então `rebuildStars()` — que recria o
     * ParticleContainer inteiro (~1800 partículas em 1080p) — era trabalho jogado fora, pago no frame em que
     * o FPS já estava ruim. O céu é reassado no `render`, que é o mesmo tick em que a tela é redesenhada:
     * `bakeBg` só troca a referência DEPOIS de assar o novo, então o céu velho fica na tela até lá.
     */
    setRes(){bgDirty=true;},
    render(f){const cam=f.cam,W=R.W,H=R.H;if(!band)return;
      if(bgDirty){bgDirty=false;bgKey="";bakeBg();}   // resolução nova: assa aqui, no tick do desenho
      R.cache.keepAlive(atlasKey);   // o atlas do parallax fica preso ao ParticleContainer das estrelas
      // ⚠️ Os props pegam a textura UMA vez, em rebuild(), e nunca mais a repedem: sem este carimbo eles são
      // o único consumidor que a eviction pode destruir estando em uso (hoje os três temas devolvem
      // `props:[]`, então o defeito está dormente — mas a eviction sob pressão o acordaria).
      for(const k of propKeys)R.cache.keepAlive(k);
      if(fade>0){fade-=f.dt*1000/Math.max(80,ROUND.FADE_MS||600);   // troca de tema: só o céu faz o fade
        if(fade<=0)dropPrev();else{prev.alpha=fade;if(stars)stars.alpha=1-fade;}}
      const on=!R.econ&&f.parallax;stars.visible=on;
      if(on){const T=band.tile,Y0=H*band.fade.y0,FD=H*band.fade.d;let lf=null,ox=0,oy=0;
        for(const m of metas){const l=m.l;if(l!==lf){lf=l;ox=((-cam.x*l.f*cam.scale)%T+T)%T;oy=((-cam.y*l.f*cam.scale)%T+T)%T;}
          const x=(m.s.x+ox)%T+m.i*T,y=(m.s.y+oy)%T+m.j*T,lim=m.big?Y0-FD*.5:Y0;
          if(y>lim||x>W+20||y<-20){m.p.alpha=0;continue;}m.p.x=x;m.p.y=y;m.p.alpha=(m.big?l.alpha:m.s.a)*Math.min(1,(Y0-y)/FD);}}
      const showProps=R.econLevel<2;for(const sp of propSprites)sp.visible=showProps&&rectHas(f.rect,sp.x,sp.y,sp._r);},
    /**
     * Bytes das texturas de céu, que NÃO passam pelo TextureCache (são assadas e destruídas à mão aqui).
     * São o item mais caro do jogo — até três coexistem (atual + crossfade + pré-assado) — e ficavam fora do
     * orçamento e do `texMB` do ?stats, que por isso mentia justamente sobre o que estoura a memória.
     */
    bytes(){let n=0;for(const t of [bgTex,prevTex,ready&&ready.tex]){const src=t&&t.source;
      if(src)n+=(src.pixelWidth||src.width||0)*(src.pixelHeight||src.height||0)*4*1.34;}return n;},
    destroy(){dropPrev();if(ready)ready.tex.destroy(true);root.destroy({children:true});props.destroy({children:true});if(bgTex)bgTex.destroy(true);},
  };}

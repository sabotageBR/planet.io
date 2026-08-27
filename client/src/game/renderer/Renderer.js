// ── RENDERER: Pixi Application (webgl; canvas como reserva) + camadas ───────────────────────
// stage: bg (tela: fundo assado + parallax) › world (transformação da câmera: props, grade, borda,
// buracos, estrelas, comida, ejetados, asteroides, mísseis, trilhas, planetas, mira, fx). Culling manual por
// retângulo da câmera em cada camada; sem filtros; texturas só via TextureCache/tema.
import {Application,Container} from "pixi.js";
import {createTextureCache} from "./TextureCache.js";
import {createBackground} from "./layers/Background.js";
import {createGrid} from "./layers/Grid.js";
import {createFood} from "./layers/Food.js";
import {createEjected} from "./layers/Ejected.js";
import {createHazards} from "./layers/Hazards.js";
import {createPlanets} from "./layers/Planets.js";
import {createMissiles} from "./layers/Missiles.js";
import {createAim} from "./layers/Aim.js";
import {createFx} from "./layers/Fx.js";

export async function createRenderer({container,theme,prefs}){
  const app=new Application();
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const base={resolution:dpr,autoDensity:true,resizeTo:container,antialias:false,backgroundAlpha:0,autoStart:false,sharedTicker:false,powerPreference:"high-performance"};
  let kind="webgl";
  try{await app.init({...base,preference:"webgl"});}
  catch(e){console.warn("[render] WebGL indisponível, tentando canvas:",e&&e.message);kind="canvas";await app.init({...base,preference:"canvas"});}
  const canvas=app.canvas;canvas.className="game-canvas";canvas.style.cssText="display:block;width:100%;height:100%;touch-action:none;cursor:crosshair;user-select:none;-webkit-user-select:none";
  container.appendChild(canvas);
  const upload=tex=>{const r=app.renderer;if(r.prepare&&r.prepare.upload)r.prepare.upload(tex);else if(r.texture&&r.texture.initSource)r.texture.initSource(tex.source);};
  const R={app,canvas,kind,cache:createTextureCache({budgetMB:48,upload}),theme,prefs:{fx:true,...prefs},W:app.screen.width,H:app.screen.height,res:dpr,econ:false,econLevel:0,ambient:null};
  const bg=createBackground(R),grid=createGrid(R),food=createFood(R),ejected=createEjected(R),hazards=createHazards(R),planets=createPlanets(R),missiles=createMissiles(R),aim=createAim(R),fx=createFx(R);
  R.ambient=(kind,f)=>fx.ambient(kind,f);   // camadas pedem efeitos contínuos (ímã) sem conhecer a camada de fx
  const world=new Container();
  const layers=[bg,grid,food,ejected,hazards,planets,missiles,aim,fx];
  function mount(){world.removeChildren();world.addChild(bg.props,grid.root,hazards.holes,hazards.stars,food.root,ejected.root,hazards.asteroids,missiles.root,planets.trails,planets.root,aim.root,fx.root);}
  function setTheme(t){R.theme=t;R.cache.invalidate();for(const l of layers)l.setTheme();mount();}
  setTheme(theme);app.stage.addChild(bg.root,world);
  const rd={app,R,canvas,cache:R.cache,fx,planets,kind,
    get W(){return R.W;},get H(){return R.H;},
    setTheme,
    resize(){app.resize();const w=app.screen.width,h=app.screen.height;if(w!==R.W||h!==R.H){R.W=w;R.H=h;bg.resize();}},
    /** resolução de render (abaixo de 1 = econômico: menos pixels, leve borrão) */
    setResolution(r){r=Math.max(.5,Math.min(2,r));if(app.renderer.resolution===r)return;app.renderer.resolution=r;R.res=r;app.resize();bg.resize();},
    setEcon(lv){R.econ=lv>0;R.econLevel=lv|0;fx.setBudget(lv?(lv>1?.25:.5):1);},
    /** Aquece as texturas de planeta das skins presentes (tiers 128/256; a própria também em 512 e na variante isMe). */
    warmPlanets(skins,meSkin){const TX=R.theme.textures;
      for(const sk of skins)for(const size of [128,256])R.cache.warm(TX.key("planet",{skin:sk,isMe:false},size),size,(c,s)=>TX.planet(c,s,{skin:sk,isMe:false}));
      if(meSkin)for(const size of [128,256,512])R.cache.warm(TX.key("planet",{skin:meSkin,isMe:true},size),size,(c,s)=>TX.planet(c,s,{skin:meSkin,isMe:true}));},
    /** f: {view,cam,now,dt,t,rt,rect,aim,parallax,showGrid,showNames,showMass,showTrails} */
    render(f){R.cache.tick();const cam=f.cam;world.position.set(R.W/2-cam.x*cam.scale,R.H/2-cam.y*cam.scale);world.scale.set(cam.scale);
      for(const l of layers)l.render(f);app.render();},
    counts(){const h=hazards.counts();return{planets:planets.count(),food:food.count(),ejected:ejected.count(),asteroids:h.asteroids,holes:h.holes,stars:h.stars,missiles:missiles.count(),fx:fx.count(),textures:R.cache.size,texMB:(R.cache.bytes/1048576).toFixed(1)};},
    /** estimativa de draw calls: cada camada com textura própria = 1 batch; planetas quebram por tier/skin */
    drawCallsEstimate(){const c=rd.counts();return 1+(R.econ?0:1)+1+1+Math.min(c.holes,3)*2+Math.min(c.stars,3)*2+1+1+Math.min(c.asteroids,3)+Math.min(c.missiles,2)+1+Math.min(c.planets,8)*2+Math.min(c.fx,4);},
    destroy(){for(const l of layers)l.destroy();R.cache.destroy();app.destroy(true,{children:true});},
  };
  return rd;}

// ── RENDERER: Pixi Application (webgl; canvas como reserva) + camadas ───────────────────────
// stage: bg (tela: fundo assado + parallax) › world (transformação da câmera: props, grade, borda,
// buracos, estrelas, comida, ejetados, asteroides, mísseis, trilhas, planetas, rumo, mira, fx).
// Culling manual por retângulo da câmera em cada camada; sem filtros; texturas só via TextureCache/tema.
import {Application,Container} from "pixi.js";
import {createTextureCache} from "./TextureCache.js";
import {createBackground} from "./layers/Background.js";
import {createGrid} from "./layers/Grid.js";
import {createFood,foodAtlas} from "./layers/Food.js";
import {createEjected,ejectedAtlas} from "./layers/Ejected.js";
import {createHazards,BH_TEX} from "./layers/Hazards.js";
import {createPlanets} from "./layers/Planets.js";
import {createMissiles} from "./layers/Missiles.js";
import {createAim} from "./layers/Aim.js";
import {createThreat} from "./layers/Threat.js";
import {createHeading} from "./layers/Heading.js";
import {createZone} from "./layers/Zone.js";
import {createCage} from "./layers/Cage.js";
import {createFx} from "./layers/Fx.js";

export async function createRenderer({container,theme,prefs}){
  const app=new Application();
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const base={resolution:dpr,autoDensity:true,resizeTo:container,antialias:false,backgroundAlpha:0,autoStart:false,sharedTicker:false,powerPreference:"high-performance"};
  let kind="webgl";
  try{await app.init({...base,preference:"webgl"});}
  catch(e){console.warn("[render] WebGL indisponível, tentando canvas:",e&&e.message);kind="canvas";await app.init({...base,preference:"canvas"});}
  // ⚠️ `preference` é uma PREFERÊNCIA: o Pixi cai para canvas 2D por conta própria, sem lançar, quando o
  // WebGL não está disponível — então o `catch` acima não é o único caminho para o fallback, e `kind` ficava
  // dizendo "webgl" com o CanvasRenderer no ar. Isso aparece no overlay ?stats, que é ferramenta de
  // diagnóstico: mentir ali manda quem investiga uma queda de fps para o lado errado (visto em máquina sem
  // WebGL, com 3 fps e o overlay jurando webgl). Quem sabe a verdade é o renderer que ficou de pé.
  kind=app.renderer.name||kind;
  // ⚠️ O CanvasRenderer NÃO TEM o pipe de malha (medido: ele traz sprite/graphics/particle/tilingSprite/
  // bitmapText, e nenhum "mesh"). O blob dos planetas é um MeshPlane, então na primeira peça grande da tela
  // `renderPipes.mesh` vinha undefined e o `app.render()` passava a LANÇAR — todo frame. E como não há
  // try/catch no laço, tudo o que vem depois do render é pulado: HUD congelado, som mudo e, ironia, o
  // próprio econCheck nunca rodando. Ou seja: justamente na máquina sem WebGL, que é quem mais precisa da
  // degradação automática, ela era a primeira coisa a morrer.
  const temMesh=!!(app.renderer.renderPipes&&app.renderer.renderPipes.mesh);
  const canvas=app.canvas;canvas.className="game-canvas";canvas.style.cssText="display:block;width:100%;height:100%;touch-action:none;cursor:crosshair;user-select:none;-webkit-user-select:none";
  container.appendChild(canvas);
  const upload=tex=>{const r=app.renderer;if(r.prepare&&r.prepare.upload)r.prepare.upload(tex);else if(r.texture&&r.texture.initSource)r.texture.initSource(tex.source);};
  const R={app,canvas,kind,cache:createTextureCache({budgetMB:48,upload}),theme,prefs:{fx:true,...prefs},W:app.screen.width,H:app.screen.height,res:dpr,econ:false,econLevel:0,texCap:512,lost:false,mesh:temMesh,ambient:null};
  const bg=createBackground(R),grid=createGrid(R),food=createFood(R),ejected=createEjected(R),hazards=createHazards(R),planets=createPlanets(R),missiles=createMissiles(R),aim=createAim(R),zone=createZone(R),cage=createCage(R),threat=createThreat(R),heading=createHeading(R),fx=createFx(R);
  R.ambient=(kind,f)=>fx.ambient(kind,f);   // camadas pedem efeitos contínuos (ímã) sem conhecer a camada de fx
  const world=new Container();
  const layers=[bg,grid,food,ejected,hazards,planets,missiles,aim,zone,cage,threat,heading,fx];   // `cage` logo depois de `zone`: elas nunca coexistem (a zona só nasce quando a gaiola abre), e a ordem documenta a sucessão
  function mount(){world.removeChildren();world.addChild(bg.props,grid.root,hazards.holes,hazards.stars,
    food.glow,ejected.glow,   // os halos vão POR BAIXO dos corpos: o brilho vaza para fora do disco, não por cima dele
    food.root,ejected.root,hazards.asteroids,missiles.root,planets.trails,planets.root,
    hazards.starsFront,   // a estrela por CIMA dos planetas: quem cabe nela (STAR.PASS_R) se esconde lá dentro
    heading.root,   // a seta de rumo acima do próprio planeta (e de quem se escondeu na estrela): é instrumento, não corpo
    aim.root,zone.root,cage.root,threat.root,fx.root);}
  // A troca de tema NÃO invalida o cache: as chaves de textura já são prefixadas com o id do tema, então os
  // temas convivem, voltar a um céu já visto é acerto de cache e nada é reassado dentro do frame da virada.
  // Quem segura textura sem pedi-la por frame chama cache.keepAlive() (ver TextureCache).
  let themed=false;
  function setTheme(t){if(!t||(themed&&t===R.theme))return;themed=true;R.theme=t;for(const l of layers)l.setTheme();mount();}
  setTheme(theme);app.stage.addChild(bg.root,world);
  // ── CONTEXTO WEBGL ────────────────────────────────────────────────────────────────────────
  // Perder o contexto é normal em máquina apertada (o navegador o mata quando a memória de GPU estoura);
  // ficar perdido é que não pode. O Pixi só restaura sozinho quando a perda foi FORÇADA por ele
  // (GlContextSystem: `if(this._contextLossForced)`) — numa perda real ele chama preventDefault() e não faz
  // mais nada, sem avisar ninguém. O jogo seguia girando o rAF, contando 60+ fps e chamando um `app.render()`
  // cujas chamadas GL viraram no-ops: canvas VAZIO (ele é backgroundAlpha:0, então aparece o fundo do CSS)
  // com o HUD, que é DOM, vivo e atualizado. Era exatamente esse o sintoma relatado.
  const loseExt=()=>{const c=app.renderer.context;return c&&c.extensions&&c.extensions.loseContext;};
  let tentativas=0;
  function onLost(e){e.preventDefault();   // sem isto o navegador nem se dispõe a restaurar
    if(R.lost)return;R.lost=true;
    console.warn("[render] contexto WebGL perdido (memória de GPU); pedindo restauração");
    const ext=loseExt();
    // até 3 tentativas, espaçadas: se a memória ainda está estourada, restaurar na hora só perde o contexto
    // de novo em seguida. Passado isso, o contexto volta quando o navegador quiser (o handler continua de pé).
    if(ext&&ext.restoreContext&&tentativas<3){tentativas++;setTimeout(()=>{try{ext.restoreContext();}catch{}},300*tentativas);}}
  function onRestored(){
    // Tudo o que vivia na GPU morreu junto. As texturas do cache são reassadas sob demanda (todo desenho as
    // repede pela chave), mas quem as SEGURA sem repedir — atlas de comida/ejetados/parallax e o tile da
    // grade — aponta para fontes mortas: por isso o caminho é invalidar e deixar `setTheme` remontar as
    // camadas, e não confiar no re-upload. `cache.invalidate()` existia desde sempre e nunca teve chamador.
    R.cache.invalidate();
    const th=R.theme;themed=false;R.theme=null;setTheme(th);
    bg.resize();   // os céus não estão no cache: zera a chave e reassa
    R.lost=false;tentativas=0;
    console.warn("[render] contexto WebGL restaurado; texturas reassadas");}
  canvas.addEventListener("webglcontextlost",onLost,false);
  canvas.addEventListener("webglcontextrestored",onRestored,false);
  const rd={app,R,canvas,cache:R.cache,fx,planets,kind,
    get W(){return R.W;},get H(){return R.H;},
    setTheme,
    resize(){app.resize();const w=app.screen.width,h=app.screen.height;if(w!==R.W||h!==R.H){R.W=w;R.H=h;bg.resize();}},
    /** resolução de render (abaixo de 1 = econômico: menos pixels, leve borrão) */
    setResolution(r){r=Math.max(.5,Math.min(2,r));if(app.renderer.resolution===r)return;app.renderer.resolution=r;R.res=r;app.resize();bg.setRes();},
    /** `texCap`: no nível mínimo o planetão para de assar 512² (1,34 MB) para uma tela que está em res .6. */
    setEcon(lv){R.econ=lv>0;R.econLevel=lv|0;R.texCap=lv>1?256:512;fx.setBudget(lv?(lv>1?.25:.5):1);},
    /**
     * O mundo mudou de tamanho (o servidor mandou o `world:{w,h}` da sala, ver game/index.js). Quase tudo
     * lê `WORLD.w` por chamada e acompanha sozinho; quem GUARDA o tamanho são duas camadas: a grade (o
     * TilingSprite tem largura própria e a borda é assada) e o fundo (as faixas de parallax são montadas
     * a partir das dimensões). Sem esta chamada elas ficariam do tamanho velho — a borda tracejada da
     * arena passaria por dentro do mapa, e ninguém entenderia por quê.
     */
    worldResized(){grid.setTheme();bg.setTheme();},
    /** Aquece as texturas de planeta das skins presentes (tiers 128/256; a própria também em 512 e na variante isMe). */
    warmPlanets(skins,meSkin,th=R.theme){const TX=th.textures,cap=R.texCap;
      for(const sk of skins)for(const size of [128,256])if(size<=cap)R.cache.warm(TX.key("planet",{skin:sk,isMe:false},size),size,(c,s)=>TX.planet(c,s,{skin:sk,isMe:false}));
      if(meSkin)for(const size of [128,256,512])if(size<=cap)R.cache.warm(TX.key("planet",{skin:meSkin,isMe:true},size),size,(c,s)=>TX.planet(c,s,{skin:meSkin,isMe:true}));},
    /**
     * Deixa o PRÓXIMO céu pronto antes da virada: o fundo é assado na hora (é o item caro) e os atlas de comida
     * e de ejetados entram na fila do cache (2 por frame). Com isso a troca de tema não assa nada e não trava.
     */
    prewarmTheme(th,skins=[],meSkin=null){if(!th||th===R.theme)return;
      bg.prewarm(th);
      const fa=foodAtlas(th),ea=ejectedAtlas(th);R.cache.warmAtlas(fa.key,fa.items);R.cache.warmAtlas(ea.key,ea.items);
      rd.warmHazards(th);rd.warmPlanets(skins,meSkin,th);},
    /** Buraco negro: uma textura 512 por tema, mas é o desenho mais caro do jogo — sem aquecer, ela é assada
     *  sincronamente no primeiro frame em que um buraco entra na tela, e isso é um engasgo visível. */
    warmHazards(th=R.theme){const TX=th.textures;R.cache.warm(TX.key("blackHole",{},BH_TEX),BH_TEX,(c,s)=>TX.blackHole(c,s,{}));},
    /** f: {view,cam,now,dt,t,rt,rect,aim,threat,heading,zone,cage,glow,parallax,wobble,showGrid,showNames,showTrails,idle} */
    /** `idle`: canvas vivo, sem partida (o menu está na frente) — some a moldura da arena, fica o céu. */
    render(f){if(R.lost)return;   // sem contexto não há o que desenhar, e insistir a 60 Hz é trabalho puro
      R.cache.setExternal(bg.bytes());R.cache.tick();const cam=f.cam;world.position.set(R.W/2-cam.x*cam.scale,R.H/2-cam.y*cam.scale);world.scale.set(cam.scale);
      for(const l of layers)l.render(f);app.render();},
    counts(){const h=hazards.counts();return{planets:planets.count(),food:food.count(),ejected:ejected.count(),asteroids:h.asteroids,holes:h.holes,stars:h.stars,missiles:missiles.count(),fx:fx.count(),textures:R.cache.size,texMB:((R.cache.bytes+bg.bytes())/1048576).toFixed(1)};},
    /** estimativa de draw calls: cada camada com textura própria = 1 batch; planetas quebram por tier/skin.
     * Os dois containers de halo (comida e fragmentos) somam 2 batches — não um por partícula. */
    drawCallsEstimate(){const c=rd.counts();return 1+(R.econ?0:1)+1+1+1+2+Math.min(c.holes,3)*2+Math.min(c.stars,3)*2+1+1+Math.min(c.asteroids,3)+Math.min(c.missiles,2)+1+Math.min(c.planets,8)*2+Math.min(c.fx,4);},
    /** Força a perda do contexto — é como se verifica a recuperação sem ter de estourar a memória de fato. */
    loseContext(){const ext=loseExt();if(ext)ext.loseContext();else console.warn("[render] sem WEBGL_lose_context");},
    destroy(){canvas.removeEventListener("webglcontextlost",onLost);canvas.removeEventListener("webglcontextrestored",onRestored);
      for(const l of layers)l.destroy();R.cache.destroy();app.destroy(true,{children:true});},
  };
  return rd;}

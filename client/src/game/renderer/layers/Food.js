// ── COMIDA: ParticleContainer sobre um atlas (tipos × matizes + especiais/armas) ─────────
// Partícula por id; culling = escala 0. Animações do tema (world.foodAnim): pulso da estrela,
// balanço dos especiais. Rock/comet giram por um ângulo fixo derivado do id (a comida não tem seed no fio).
// BRILHO: um SEGUNDO ParticleContainer, com a mesma partícula por id, texturado com o halo assado
// (theme.textures.glow) e desenhado em blendMode "add" POR BAIXO do corpo. São dois containers e dois draw
// calls no total — não um por partícula —, e é assim que se consegue o brilho somado dos .io modernos sem
// filtro nem blur, que aqui são proibidos (custam render target e derrubam o fps).
// O halo respira devagar (GLOW_PULSE) e some no modo econômico e com "menos movimento": é enfeite, e enfeite
// é a primeira coisa que sai quando o frame aperta.
import {ParticleContainer,Particle} from "pixi.js";
import {FOOD_TYPE,FOOD,rectHas} from "@warspace/shared";
import {seedAngle,seedUnit} from "../../util.js";

const SIZE=64,GLOW_K=1.9,GLOW_PULSE={amp:.12,speed:.0022};   // GLOW_K: o halo é bem maior que o corpo — é o vazamento que dá o brilho
/** Receita do atlas de comida de um tema (também usada no pré-aquecimento do próximo céu). */
const SPECIALS=[FOOD_TYPE.AMMO,FOOD_TYPE.MERGE,FOOD_TYPE.MAGNET,FOOD_TYPE.SHIELD,FOOD_TYPE.W_BURST,FOOD_TYPE.W_CLUSTER,FOOD_TYPE.W_NOVA,
  FOOD_TYPE.AUTODEF,FOOD_TYPE.AMMO_PLUS,FOOD_TYPE.ZOOM,FOOD_TYPE.FEAST];   // faltar aqui não dá erro: a bolinha cai no quadro "0:0" do atlas e é desenhada como POEIRA
export function foodAtlas(th){const TX=th.textures,items=[];
  for(let t=FOOD_TYPE.DUST;t<=FOOD_TYPE.ROCK;t++)for(let h=0;h<FOOD.HUES;h++){items.push({key:t+":"+h,size:SIZE,draw:(c,s)=>TX.food(c,s,{type:t,hue:h})});
    items.push({key:"g"+t+":"+h,size:SIZE,draw:(c,s)=>TX.glow(c,s,{color:th.foodColor({type:t,hue:h})})});}
  for(const t of SPECIALS){items.push({key:t+":0",size:SIZE,draw:(c,s)=>TX.food(c,s,{type:t,hue:0})});
    items.push({key:"g"+t+":0",size:SIZE,draw:(c,s)=>TX.glow(c,s,{color:th.foodColor({type:t,hue:0})})});}
  return{key:`${th.id}:food`,items};}
export function createFood(R){
  let pc=null,gc=null,atlas=null,atlasKey="";const byId=new Map();let frame=0;
  function setTheme(){const {key,items}=foodAtlas(R.theme);atlasKey=key;
    const a=R.cache.atlas(key,items);if(a===atlas)return;   // céu já visitado: o atlas continua no cache, nada a refazer
    atlas=a;
    const mk=add=>{const c=new ParticleContainer({dynamicProperties:{position:true,vertex:true,color:true,rotation:false,uvs:false},texture:atlas.texture});
      if(add)c.blendMode="add";return c;};
    const old=pc,oldG=gc;pc=mk(false);gc=mk(true);
    if(old){old.parent&&old.parent.addChildAt(pc,old.parent.getChildIndex(old));old.parent&&old.parent.removeChild(old);old.destroy();}
    if(oldG){oldG.parent&&oldG.parent.addChildAt(gc,oldG.parent.getChildIndex(oldG));oldG.parent&&oldG.parent.removeChild(oldG);oldG.destroy();}
    byId.clear();L.root=pc;L.glow=gc;}
  const keyOf=e=>(e.type>=FOOD_TYPE.AMMO?e.type+":0":e.type+":"+(e.hue%FOOD.HUES));
  const L={root:null,glow:null,setTheme,
    render(f){frame++;R.cache.keepAlive(atlasKey);   // o atlas vive preso ao ParticleContainer: sem isto a eviction pode destruí-lo em uso
      const view=f.view,FA=R.theme.world.foodAnim,K=R.theme.textures.scale.food,t=f.t,rect=f.rect;
      const brilho=!!f.glow;gc.visible=brilho;
      for(const e of view.food){let rec=byId.get(e.id);
        if(!rec){const k=keyOf(e),tex=atlas.frames.get(k)||atlas.frames.get("0:0"),p=new Particle({texture:tex,anchorX:.5,anchorY:.5});
          if(e.type===FOOD_TYPE.ROCK||e.type===FOOD_TYPE.COMET)p.rotation=seedAngle(e.id);pc.addParticle(p);
          const gtex=atlas.frames.get("g"+k)||tex,g=new Particle({texture:gtex,anchorX:.5,anchorY:.5});gc.addParticle(g);
          rec={p,g,seed:seedUnit(e.id)*6.28,f:0};byId.set(e.id,rec);}
        rec.f=frame;const p=rec.p,g=rec.g;
        if(!rectHas(rect,e.rx,e.ry,e.rr*3)){if(p.scaleX!==0){p.scaleX=p.scaleY=0;g.scaleX=g.scaleY=0;}continue;}
        const special=e.type>=FOOD_TYPE.AMMO,pulse=e.type===FOOD_TYPE.STAR?1+Math.sin(t*FA.starPulse.speed+rec.seed)*FA.starPulse.amp:1;
        const s=e.rr*K*pulse*2/SIZE,y=e.ry+(special?Math.sin(t*FA.bob.speed+rec.seed)*FA.bob.amp:0);
        p.scaleX=p.scaleY=s;p.x=e.rx;p.y=y;p.alpha=e.alpha;
        if(brilho){const gp=1+Math.sin(t*GLOW_PULSE.speed+rec.seed)*GLOW_PULSE.amp;   // o halo respira: parado ele vira adesivo
          g.scaleX=g.scaleY=s*GLOW_K*gp;g.x=e.rx;g.y=y;g.alpha=e.alpha*(special?1:.85);}
        else if(g.scaleX!==0)g.scaleX=g.scaleY=0;}
      for(const [id,rec] of byId)if(rec.f!==frame){pc.removeParticle(rec.p);gc.removeParticle(rec.g);byId.delete(id);}},
    count(){return byId.size;},
    destroy(){if(pc)pc.destroy();if(gc)gc.destroy();byId.clear();},
  };
  return L;}

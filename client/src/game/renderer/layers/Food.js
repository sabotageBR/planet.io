// ── COMIDA: ParticleContainer sobre um atlas (4 tipos × 12 matizes + 4 especiais) ─────────
// Partícula por id; culling = escala 0. Animações do tema (world.foodAnim): pulso da estrela,
// balanço dos especiais. Rock/comet giram por um ângulo fixo derivado do id (a comida não tem seed no fio).
import {ParticleContainer,Particle} from "pixi.js";
import {FOOD_TYPE,FOOD,rectHas} from "@planet/shared";
import {seedAngle,seedUnit} from "../../util.js";

const SIZE=64;
export function createFood(R){
  let pc=null,atlas=null;const byId=new Map();let frame=0;
  function setTheme(){const th=R.theme,TX=th.textures,items=[];
    for(let t=FOOD_TYPE.DUST;t<=FOOD_TYPE.ROCK;t++)for(let h=0;h<FOOD.HUES;h++)items.push({key:t+":"+h,size:SIZE,draw:(c,s)=>TX.food(c,s,{type:t,hue:h})});
    for(let t=FOOD_TYPE.AMMO;t<=FOOD_TYPE.SHIELD;t++)items.push({key:t+":0",size:SIZE,draw:(c,s)=>TX.food(c,s,{type:t,hue:0})});
    atlas=R.cache.atlas(`${th.id}:food`,items);
    const old=pc;pc=new ParticleContainer({dynamicProperties:{position:true,vertex:true,color:true,rotation:false,uvs:false},texture:atlas.texture});
    if(old){old.parent&&old.parent.addChildAt(pc,old.parent.getChildIndex(old));old.parent&&old.parent.removeChild(old);old.destroy();}
    byId.clear();L.root=pc;}
  const keyOf=e=>(e.type>=FOOD_TYPE.AMMO?e.type+":0":e.type+":"+(e.hue%FOOD.HUES));
  const L={root:null,setTheme,
    render(f){frame++;const view=f.view,FA=R.theme.world.foodAnim,K=R.theme.textures.scale.food,t=f.t,rect=f.rect;
      for(const e of view.food){let rec=byId.get(e.id);
        if(!rec){const tex=atlas.frames.get(keyOf(e))||atlas.frames.get("0:0"),p=new Particle({texture:tex,anchorX:.5,anchorY:.5});
          if(e.type===FOOD_TYPE.ROCK||e.type===FOOD_TYPE.COMET)p.rotation=seedAngle(e.id);pc.addParticle(p);rec={p,seed:seedUnit(e.id)*6.28,f:0};byId.set(e.id,rec);}
        rec.f=frame;const p=rec.p;
        if(!rectHas(rect,e.rx,e.ry,e.rr*3)){if(p.scaleX!==0)p.scaleX=p.scaleY=0;continue;}
        const special=e.type>=FOOD_TYPE.AMMO,pulse=e.type===FOOD_TYPE.STAR?1+Math.sin(t*FA.starPulse.speed+rec.seed)*FA.starPulse.amp:1;
        const s=e.rr*K*pulse*2/SIZE;p.scaleX=p.scaleY=s;p.x=e.rx;p.y=e.ry+(special?Math.sin(t*FA.bob.speed+rec.seed)*FA.bob.amp:0);p.alpha=e.alpha;}
      for(const [id,rec] of byId)if(rec.f!==frame){pc.removeParticle(rec.p);byId.delete(id);}},
    count(){return byId.size;},
    destroy(){if(pc)pc.destroy();byId.clear();},
  };
  return L;}

// ── MASSA EJETADA: ParticleContainer sobre um atlas com a cor de cada skin (cor do dono) ────
import {ParticleContainer,Particle} from "pixi.js";
import {SKINS,rectHas} from "@planet/shared";

const SIZE=40;
export function createEjected(R){
  let pc=null,atlas=null;const byId=new Map();let frame=0;
  function setTheme(){const th=R.theme,TX=th.textures,colors=[...new Set(SKINS.map(s=>s.color))];
    atlas=R.cache.atlas(`${th.id}:ejected`,colors.map(color=>({key:color,size:SIZE,draw:(c,s)=>TX.ejected(c,s,{color})})));
    const old=pc;pc=new ParticleContainer({dynamicProperties:{position:true,vertex:true,color:true,rotation:false,uvs:false},texture:atlas.texture});
    if(old){old.parent&&old.parent.addChildAt(pc,old.parent.getChildIndex(old));old.parent&&old.parent.removeChild(old);old.destroy();}
    byId.clear();L.root=pc;}
  const L={root:null,setTheme,
    render(f){frame++;const view=f.view,K=R.theme.textures.scale.ejected,rect=f.rect;
      for(const e of view.ejected){let rec=byId.get(e.id);
        if(!rec){const pl=view.playerOf(e.owner),col=pl?pl.skin.color:SKINS[0].color,tex=atlas.frames.get(col)||atlas.frames.get(SKINS[0].color);
          const p=new Particle({texture:tex,anchorX:.5,anchorY:.5});pc.addParticle(p);rec={p,f:0};byId.set(e.id,rec);}
        rec.f=frame;const p=rec.p;
        if(!rectHas(rect,e.rx,e.ry,e.rr*2)){if(p.scaleX!==0)p.scaleX=p.scaleY=0;continue;}
        const s=e.rr*K*2/SIZE;p.scaleX=p.scaleY=s;p.x=e.rx;p.y=e.ry;p.alpha=e.alpha;}
      for(const [id,rec] of byId)if(rec.f!==frame){pc.removeParticle(rec.p);byId.delete(id);}},
    count(){return byId.size;},
    destroy(){if(pc)pc.destroy();byId.clear();},
  };
  return L;}

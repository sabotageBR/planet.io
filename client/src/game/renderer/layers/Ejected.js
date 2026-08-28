// ── FRAGMENTOS: ParticleContainer sobre um atlas com a cor de cada skin (cor do dono) ───────
// O TAMANHO na tela é o valor: o servidor manda r=fragR(mass), então o pedaço de um planetão chega gordo.
// O `hue` do create traz o tier (FRAG_KIND): NOVA usa a frame brilhante (o brilho é assado no atlas — não há
// filtro nem blend no cliente) e lateja; RICH (pedaço gordo) só respira. Como `uvs` NÃO é dinâmico no
// ParticleContainer, a frame é escolhida na criação da partícula — que é justo quando o tier já se conhece.
import {ParticleContainer,Particle} from "pixi.js";
import {SKINS,rectHas,FRAG_KIND} from "@planet/shared";
import {seedUnit} from "../../util.js";

const SIZE=40;
/** Receita do atlas de fragmentos de um tema (uma cor por skin + a frame brilhante da supernova). */
export function ejectedAtlas(th){const TX=th.textures,colors=[...new Set(SKINS.map(s=>s.color))];
  const items=colors.map(color=>({key:color,size:SIZE,draw:(c,s)=>TX.ejected(c,s,{color})}));
  items.push({key:"nova",size:SIZE,draw:(c,s)=>TX.ejected(c,s,{color:null,glow:true})});
  return{key:`${th.id}:ejected`,items};}
export function createEjected(R){
  let pc=null,atlas=null,atlasKey="";const byId=new Map();let frame=0;
  function setTheme(){const {key,items}=ejectedAtlas(R.theme);atlasKey=key;
    const a=R.cache.atlas(key,items);if(a===atlas)return;   // céu já visitado: reaproveita
    atlas=a;
    const old=pc;pc=new ParticleContainer({dynamicProperties:{position:true,vertex:true,color:true,rotation:false,uvs:false},texture:atlas.texture});
    if(old){old.parent&&old.parent.addChildAt(pc,old.parent.getChildIndex(old));old.parent&&old.parent.removeChild(old);old.destroy();}
    byId.clear();L.root=pc;}
  const L={root:null,setTheme,
    render(f){frame++;R.cache.keepAlive(atlasKey);   // idem Food: o atlas está preso ao ParticleContainer
      const view=f.view,K=R.theme.textures.scale.ejected,rect=f.rect,EA=R.theme.world.ejectAnim,t=f.t;
      for(const e of view.ejected){let rec=byId.get(e.id);
        if(!rec){const nova=e.hue===FRAG_KIND.NOVA;
          const pl=nova?null:view.playerOf(e.owner),col=pl?pl.skin.color:SKINS[0].color;
          const tex=atlas.frames.get(nova?"nova":col)||atlas.frames.get(SKINS[0].color);
          const p=new Particle({texture:tex,anchorX:.5,anchorY:.5});pc.addParticle(p);
          rec={p,f:0,tier:e.hue|0,seed:seedUnit(e.id)*6.28};byId.set(e.id,rec);}   // tier, não a config: a receita do pulso é lida por frame (o tema pode ter trocado)
        rec.f=frame;const p=rec.p;
        if(!rectHas(rect,e.rx,e.ry,e.rr*2)){if(p.scaleX!==0)p.scaleX=p.scaleY=0;continue;}
        const an=rec.tier===FRAG_KIND.NOVA?EA.novaPulse:rec.tier===FRAG_KIND.RICH?EA.richPulse:null;
        const pul=an?1+Math.sin(t*an.speed+rec.seed)*an.amp:1;
        const s=e.rr*K*pul*2/SIZE;p.scaleX=p.scaleY=s;p.x=e.rx;p.y=e.ry;p.alpha=e.alpha;}
      for(const [id,rec] of byId)if(rec.f!==frame){pc.removeParticle(rec.p);byId.delete(id);}},
    count(){return byId.size;},
    destroy(){if(pc)pc.destroy();byId.clear();},
  };
  return L;}

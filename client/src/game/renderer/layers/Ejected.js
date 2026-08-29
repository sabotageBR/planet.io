// ── FRAGMENTOS: ParticleContainer sobre um atlas com a cor de cada skin (cor do dono) ───────
// O TAMANHO na tela é o valor: o servidor manda r=fragR(mass), então o pedaço de um planetão chega gordo.
// O `hue` do create traz o tier (FRAG_KIND): NOVA usa a frame brilhante (o brilho é assado no atlas — não há
// filtro nem blend no cliente) e lateja; RICH (pedaço gordo) só respira.
// POOL: as partículas entram no container uma vez e NUNCA saem — a livre fica com escala 0 e é reaproveitada.
// Antes era `addParticle`/`removeParticle` a cada pelota, e segurando o W isso dá 137 entradas + 137 saídas por
// segundo: `_childrenDirty` ficava verdadeiro em TODO frame e o Pixi re-serializava e re-enviava à GPU o buffer
// ESTÁTICO das 600 partículas 60 vezes por segundo (ParticleBuffer.update com uploadStatic), mais o
// `indexOf`+`splice` num array de 600. Com o pool o estático sobe uma vez por marca d'água e só o dinâmico
// (posição/escala/cor/uv) roda por frame. O pool CRESCE sob demanda e não encolhe: quem nunca cospe em rajada
// não paga o custo de 600.
// `uvs` virou dinâmico porque a frame agora muda ao reaproveitar um slot (cada dono tem a sua cor) — são 4
// floats a mais no upload que já acontece, contra o buffer inteiro que ele evita.
import {ParticleContainer,Particle} from "pixi.js";
import {SKINS,rectHas,FRAG_KIND} from "@warspace/shared";
import {seedUnit} from "../../util.js";

const SIZE=40,GLOW_K=2.0,GLOW_PULSE={amp:.14,speed:.0026};   // o halo do fragmento é ainda maior que o da comida: pedaço de planeta no chão tem que CHAMAR
/** Receita do atlas de fragmentos de um tema (uma cor por skin + a frame brilhante da supernova). */
export function ejectedAtlas(th){const TX=th.textures,colors=[...new Set(SKINS.map(s=>s.color))];
  const items=[];
  for(const color of colors){items.push({key:color,size:SIZE,draw:(c,s)=>TX.ejected(c,s,{color})});
    items.push({key:"g"+color,size:SIZE,draw:(c,s)=>TX.glow(c,s,{color})});}
  items.push({key:"nova",size:SIZE,draw:(c,s)=>TX.ejected(c,s,{color:null,glow:true})});
  items.push({key:"gnova",size:SIZE,draw:(c,s)=>TX.glow(c,s,{color:"#ffe08a",k:1})});   // o estilhaço de supernova já brilha no corpo; aqui o halo vai no máximo
  return{key:`${th.id}:ejected`,items};}
export function createEjected(R){
  let pc=null,gc=null,atlas=null,atlasKey="";const byId=new Map();let frame=0;
  const pool=[],gpool=[],livre=[];   // pool: todas as partículas do container (na ordem em que entraram); livre: índices ociosos
  function setTheme(){const {key,items}=ejectedAtlas(R.theme);atlasKey=key;
    const a=R.cache.atlas(key,items);if(a===atlas)return;   // céu já visitado: reaproveita
    atlas=a;
    const mk=add=>{const c=new ParticleContainer({dynamicProperties:{position:true,vertex:true,color:true,rotation:false,uvs:true},texture:atlas.texture});
      if(add)c.blendMode="add";return c;};
    const old=pc,oldG=gc;pc=mk(false);gc=mk(true);
    if(old){old.parent&&old.parent.addChildAt(pc,old.parent.getChildIndex(old));old.parent&&old.parent.removeChild(old);old.destroy();}
    if(oldG){oldG.parent&&oldG.parent.addChildAt(gc,oldG.parent.getChildIndex(oldG));oldG.parent&&oldG.parent.removeChild(oldG);oldG.destroy();}
    byId.clear();pool.length=0;gpool.length=0;livre.length=0;L.root=pc;L.glow=gc;}
  /** Um slot livre do pool (cria mais um se acabou; o container só cresce). O halo anda no MESMO índice. */
  function pega(tex,gtex){
    if(livre.length){const i=livre.pop();pool[i].texture=tex;gpool[i].texture=gtex;return i;}
    const p=new Particle({texture:tex,anchorX:.5,anchorY:.5});p.scaleX=p.scaleY=0;pc.addParticle(p);pool.push(p);
    const g=new Particle({texture:gtex,anchorX:.5,anchorY:.5});g.scaleX=g.scaleY=0;gc.addParticle(g);gpool.push(g);
    return pool.length-1;}
  const L={root:null,glow:null,setTheme,
    render(f){frame++;R.cache.keepAlive(atlasKey);   // idem Food: o atlas está preso ao ParticleContainer
      const view=f.view,K=R.theme.textures.scale.ejected,rect=f.rect,EA=R.theme.world.ejectAnim,t=f.t;
      const brilho=!!f.glow;gc.visible=brilho;
      for(const e of view.ejected){let rec=byId.get(e.id);
        if(!rec){const nova=e.hue===FRAG_KIND.NOVA;
          const pl=nova?null:view.playerOf(e.owner),col=pl?pl.skin.color:SKINS[0].color;
          const tex=atlas.frames.get(nova?"nova":col)||atlas.frames.get(SKINS[0].color);
          const gtex=atlas.frames.get(nova?"gnova":"g"+col)||atlas.frames.get("g"+SKINS[0].color)||tex;
          rec={i:pega(tex,gtex),f:0,tier:e.hue|0,seed:seedUnit(e.id)*6.28};byId.set(e.id,rec);}   // tier, não a config: a receita do pulso é lida por frame (o tema pode ter trocado)
        rec.f=frame;const p=pool[rec.i],g=gpool[rec.i];
        if(!rectHas(rect,e.rx,e.ry,e.rr*2)){if(p.scaleX!==0){p.scaleX=p.scaleY=0;g.scaleX=g.scaleY=0;}continue;}
        const an=rec.tier===FRAG_KIND.NOVA?EA.novaPulse:rec.tier===FRAG_KIND.RICH?EA.richPulse:null;
        const pul=an?1+Math.sin(t*an.speed+rec.seed)*an.amp:1;
        const s=e.rr*K*pul*2/SIZE;p.scaleX=p.scaleY=s;p.x=e.rx;p.y=e.ry;p.alpha=e.alpha;
        if(brilho){const gp=1+Math.sin(t*GLOW_PULSE.speed+rec.seed)*GLOW_PULSE.amp;
          g.scaleX=g.scaleY=s*GLOW_K*gp;g.x=e.rx;g.y=e.ry;g.alpha=e.alpha*(rec.tier===FRAG_KIND.PLAIN?.8:1);}
        else if(g.scaleX!==0)g.scaleX=g.scaleY=0;}
      for(const [id,rec] of byId)if(rec.f!==frame){pool[rec.i].scaleX=pool[rec.i].scaleY=0;gpool[rec.i].scaleX=gpool[rec.i].scaleY=0;livre.push(rec.i);byId.delete(id);}},
    count(){return byId.size;},
    destroy(){if(pc)pc.destroy();if(gc)gc.destroy();byId.clear();pool.length=0;gpool.length=0;livre.length=0;},
  };
  return L;}

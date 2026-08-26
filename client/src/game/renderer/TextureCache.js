// ── CACHE DE TEXTURAS: receitas do tema (canvas) → Texture com mipmaps; LRU por bytes ──────
// Chave = theme.textures.key(kind,params,size) + tamanho. Tiers 128/256/512 (theme.textures.tier).
// Só entradas sem uso há ≥ 2 s são despejadas (os sprites pedem a textura a cada frame pela chave,
// então nunca seguram uma textura destruída). invalidate() zera tudo (troca de tema).
// warm(key,size,draw) enfileira um aquecimento: tick() assa ≤ WARM_PER_FRAME por frame e chama
// `upload(tex)` (o Renderer sobe para a GPU na hora — em Pixi v8 o upload+mipmaps aconteceria no 1º
// draw, e o pico só mudaria de lugar).
import {Texture,CanvasSource,Rectangle} from "pixi.js";

const WARM_PER_FRAME=2;
export function createTextureCache({budgetMB=48,upload=null}={}){
  const map=new Map(),queue=[];let bytes=0,frame=0;
  const mk=(canvas,resolution=1)=>new Texture({source:new CanvasSource({resource:canvas,autoGenerateMipmaps:true,scaleMode:"linear",resolution})});
  const cache={
    get bytes(){return bytes;},get size(){return map.size;},get pending(){return queue.length;},
    tick(){frame++;for(let i=0;i<WARM_PER_FRAME&&queue.length;i++){const q=queue.shift();if(map.has(q.key))continue;const tex=cache.get(q.key,q.size,q.draw);if(upload)try{upload(tex);}catch{/* sem GPU: fica para o 1º draw */}}},
    /** Enfileira (se ainda não existe) uma textura para assar nos próximos frames. */
    warm(key,size,draw){if(map.has(key))return;for(const q of queue)if(q.key===key)return;queue.push({key,size,draw});},
    /** Textura quadrada `size`; draw(ctx,size) recebe o contexto já transladado ao centro. */
    get(key,size,draw){let e=map.get(key);if(e){e.last=frame;return e.tex;}
      const c=document.createElement("canvas");c.width=c.height=size;const x=c.getContext("2d");x.translate(size/2,size/2);draw(x,size);
      const tex=mk(c);e={tex,bytes:size*size*4*1.34,last:frame};map.set(key,e);bytes+=e.bytes;evict();return tex;},
    /** Textura livre (ex.: tile da grade) com resolução própria; draw(ctx,w,h) sem translação. */
    raw(key,w,h,resolution,draw){let e=map.get(key);if(e){e.last=frame;return e.tex;}
      const c=document.createElement("canvas");c.width=Math.round(w*resolution);c.height=Math.round(h*resolution);const x=c.getContext("2d");x.scale(resolution,resolution);draw(x,w,h);
      const tex=mk(c,resolution);e={tex,bytes:c.width*c.height*4*1.34,last:frame};map.set(key,e);bytes+=e.bytes;evict();return tex;},
    /**
     * Atlas: várias receitas num só canvas (uma fonte de textura → ParticleContainer). items: [{key,size,draw}].
     * Devolve {texture, frames: Map key→Texture}. Cache pela `key` do atlas.
     */
    atlas(key,items){let e=map.get(key);if(e){e.last=frame;return e.atlas;}
      const cell=items.reduce((m,i)=>Math.max(m,i.size),1),cols=Math.max(1,Math.min(items.length,Math.floor(2048/cell))),rows=Math.ceil(items.length/cols);
      const c=document.createElement("canvas");c.width=cols*cell;c.height=rows*cell;const x=c.getContext("2d");
      const src=new CanvasSource({resource:c,autoGenerateMipmaps:true,scaleMode:"linear"}),frames=new Map();
      items.forEach((it,i)=>{const cx=(i%cols)*cell,cy=Math.floor(i/cols)*cell,off=(cell-it.size)/2;
        x.save();x.translate(cx+off+it.size/2,cy+off+it.size/2);it.draw(x,it.size);x.restore();
        frames.set(it.key,new Texture({source:src,frame:new Rectangle(cx+off,cy+off,it.size,it.size)}));});
      const atlas={texture:new Texture({source:src}),frames,cell};
      e={tex:atlas.texture,atlas,bytes:c.width*c.height*4*1.34,last:frame};map.set(key,e);bytes+=e.bytes;evict();return atlas;},
    invalidate(){for(const e of map.values())destroy(e);map.clear();queue.length=0;bytes=0;},
    destroy(){cache.invalidate();},
  };
  function destroy(e){try{if(e.atlas)for(const t of e.atlas.frames.values())t.destroy(false);e.tex.destroy(true);}catch{}}
  function evict(){if(bytes<=budgetMB*1048576)return;
    const old=[...map.entries()].filter(([,e])=>frame-e.last>120).sort((a,b)=>a[1].last-b[1].last);
    for(const [k,e] of old){map.delete(k);bytes-=e.bytes;destroy(e);if(bytes<=budgetMB*1048576*.85)break;}}
  return cache;}

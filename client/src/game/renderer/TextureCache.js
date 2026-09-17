// ── CACHE DE TEXTURAS: receitas do tema (canvas) → Texture com mipmaps; LRU por bytes ──────
// Chave = theme.textures.key(kind,params,size) + tamanho. Tiers 128/256/512 (theme.textures.tier).
// Só entradas sem uso há ≥ 2 s são despejadas (os sprites pedem a textura a cada frame pela chave,
// então nunca seguram uma textura destruída). Quem NÃO pede por frame — atlas de comida/ejetados/parallax
// e o tile da grade, presos a um ParticleContainer/TilingSprite — tem que chamar keepAlive() por frame,
// senão a eviction destrói uma textura em uso. A troca de tema NÃO invalida nada: as chaves já são
// prefixadas com o id do tema, então os temas convivem e o LRU descarta o que ninguém usa.
// warm(key,size,draw) enfileira um aquecimento: tick() assa ≤ WARM_PER_FRAME por frame e chama
// `upload(tex)` (o Renderer sobe para a GPU na hora — em Pixi v8 o upload+mipmaps aconteceria no 1º
// draw, e o pico só mudaria de lugar).
import {Texture,CanvasSource,Rectangle} from "pixi.js";
// ⚠️ Instrumentado no MISS, nunca na chamada: `get` é chamado por planeta por frame (~200×), e medir as
// 200 para achar as 2 que assam é fabricar custo. Ver o cabeçalho de perf.js.
import {perf} from "../perf.js";

// ⚠️ `WARM_MS`: O ORÇAMENTO DA FILA É DE TEMPO, NÃO DE CONTAGEM. "2 por frame" deixava duas texturas de 512²
// (4–12 ms cada, com o upload e os mipmaps) caírem no MESMO frame — até 24 ms de assadura "orçada". Agora a
// fila assa até estourar `WARM_MS`, com o mínimo de UMA por frame (senão ela nunca esvaziaria numa máquina
// lenta) e o teto de `WARM_PER_FRAME` (as de 128² custam ~0,5 ms: sem teto, 8 delas num frame é desperdício
// de upload). A primeira da fila sempre sai; o que o tempo decide é se vem uma SEGUNDA.
const WARM_PER_FRAME=4,WARM_MS=4,POR_FRAME=6,PISO=16,IDADES=[120,30,3];   // POR_FRAME: texturas despejadas por frame · PISO: MB que o cache nunca desce abaixo (ver alvoDeDespejo)
/**
 * O ALVO É DO CACHE, NUNCA DO TOTAL — e é aqui que morava o engasgo de alguns frames.
 * `externo` (os céus do Background, 10,6 MB cada a 1920×1080) não passa por este cache e NÃO tem como ser
 * liberado por ele. Medindo `bytes+externo` contra `teto*.85`, o cache era espremido pela memória de outra
 * pessoa: nos 12 s em que o céu do próximo tema convive com o atual (`PREWARM_S`, client/game/index.js), o
 * alvo caía de 40,8 MB para 19,6 MB e a PRIMEIRA assadura seguinte — um planeta cruzando de tier, r=44 ou
 * r=120 — destruía 24 texturas de uma vez (32 durante o crossfade, com três céus). Tudo o que voltasse à
 * tela no frame seguinte tinha de ser reassado e RESUBIDO para a GPU. MEDIDO no navegador com este código.
 * O `piso` é o conjunto de trabalho de um frame: abaixo dele, despejar não economiza nada que a GPU sinta e
 * só compra reassadura. Ele pode deixar o total passar do teto quando há três céus — por 600 ms, e é troca
 * consciente: reassar em cascata é pior que 4 MB acima da marca.
 */
export const alvoDeDespejo=(teto,externo,piso)=>Math.max(piso,teto*.85-externo);
/**
 * QUEM SAI, em ordem de carência, com TETO POR FRAME. A carência cede sob pressão — 120, 30 e por fim 3
 * frames —, porque despejar algo com 3 frames de idade é seguro pelo contrato do cache: quem desenha repede
 * a textura pela chave todo frame (e quem a segura sem repedir carimba com keepAlive), então o pior caso é
 * reassar, e perder o contexto é muito pior que reassar.
 * ⚠️ O QUE NÃO É SEGURO É REASSAR TUDO NO MESMO FRAME. `max` existe por isso: a conta é paga em prestações,
 * e como o despejo também roda uma vez por frame no `tick()` (e não só quando alguém assa), parcelar não
 * atrasa a devolução de memória — antes, um conjunto quente que parasse de assar ficava acima do teto para
 * sempre, porque `evict` só era chamado na criação.
 * Pura de propósito: é a política, e é o que client/test/textura-cache.test.js tranca.
 * @param {{key:string,e:{last:number,bytes:number}}[]} entradas
 * @param {{frame:number,bytes:number,alvo:number,max:number}} o
 */
export function planoDeDespejo(entradas,{frame,bytes,alvo,max}){
  const fora=[],vistos=new Set();let b=bytes;
  for(const idade of IDADES){
    const velhas=entradas.filter(x=>!vistos.has(x.key)&&frame-x.e.last>idade).sort((a,c)=>a.e.last-c.e.last);
    for(const x of velhas){fora.push(x);vistos.add(x.key);b-=x.e.bytes;
      if(b<=alvo||fora.length>=max)return fora;}}
  return fora;}
/**
 * EM QUE ORDEM PROCURAR UM SUBSTITUTO quando o tier pedido ainda não foi assado, PURA. Primeiro os MAIORES
 * (reduzir uma textura fica nítido; ampliar borra), do mais próximo ao mais distante; depois os menores.
 * @param {number} size o tier que faltou @param {number[]} [tiers] @returns {number[]}
 */
export function ordemDeTiers(size,tiers=[128,256,512]){
  const maiores=tiers.filter(t=>t>size).sort((a,b)=>a-b),menores=tiers.filter(t=>t<size).sort((a,b)=>b-a);
  return maiores.concat(menores);}
export function createTextureCache({budgetMB=48,upload=null,agora=()=>performance.now()}={}){
  const map=new Map(),queue=[];let bytes=0,frame=0,externo=0,evictFrame=-1;
  const mk=(canvas,resolution=1)=>new Texture({source:new CanvasSource({resource:canvas,autoGenerateMipmaps:true,scaleMode:"linear",resolution})});
  const cache={
    get bytes(){return bytes;},get size(){return map.size;},get pending(){return queue.length;},
    /**
     * Memória de textura que NÃO passa por aqui mas divide a mesma GPU: hoje são os céus do Background
     * (até três de tela cheia ao mesmo tempo, ~14 MB cada). Sem isto o orçamento media só metade do consumo
     * real e o teto de 48 MB era uma conta sobre o item errado.
     */
    setExternal(n){externo=n>0?n:0;},
    tick(){frame++;evict();if(!queue.length)return;const t0=agora();
      for(let i=0;i<WARM_PER_FRAME&&queue.length;i++){if(i&&agora()-t0>=WARM_MS)break;   // a 1ª sempre sai; as seguintes, só dentro do orçamento
        const q=queue.shift();if(map.has(q.key)){i--;continue;}
        const tex=q.atlasItems?cache.atlas(q.key,q.atlasItems).texture:cache.get(q.key,q.size,q.draw);
        if(upload)try{upload(tex);}catch{/* sem GPU: fica para o 1º draw */}}},
    /** Marca a entrada como viva neste frame (para quem segura a textura sem pedi-la de novo). */
    keepAlive(key){const e=map.get(key);if(e)e.last=frame;},
    /**
     * A textura SE JÁ EXISTE (e a carimba como viva); null se não. É o que deixa quem desenha escolher entre
     * assar AGORA, dentro do frame, e mostrar um substituto enquanto a fila assa — ver `layers/Planets.js`.
     */
    peek(key){const e=map.get(key);if(!e)return null;e.last=frame;return e.tex;},
    /**
     * Enfileira (se ainda não existe) uma textura para assar nos próximos frames.
     * `urgente`: vai para a FRENTE da fila — é o que está na tela AGORA com um substituto; sem isto ela
     * esperaria atrás das ~100 entradas do pré-aquecimento de uma sala cheia.
     */
    warm(key,size,draw,urgente=false){if(map.has(key))return;
      for(let i=0;i<queue.length;i++)if(queue[i].key===key){if(urgente&&i){const q=queue.splice(i,1)[0];queue.unshift(q);}return;}
      if(urgente)queue.unshift({key,size,draw});else queue.push({key,size,draw});},
    /** Textura quadrada `size`; draw(ctx,size) recebe o contexto já transladado ao centro. */
    get(key,size,draw){let e=map.get(key);if(e){e.last=frame;return e.tex;}
      perf.ini("assaTextura");
      const c=document.createElement("canvas");c.width=c.height=size;const x=c.getContext("2d");x.translate(size/2,size/2);draw(x,size);
      const tex=mk(c);e={tex,bytes:size*size*4*1.34,last:frame};map.set(key,e);bytes+=e.bytes;
      perf.fim("assaTextura");evict();return tex;},
    /** Textura livre (ex.: tile da grade) com resolução própria; draw(ctx,w,h) sem translação. */
    raw(key,w,h,resolution,draw){let e=map.get(key);if(e){e.last=frame;return e.tex;}
      const c=document.createElement("canvas");c.width=Math.round(w*resolution);c.height=Math.round(h*resolution);const x=c.getContext("2d");x.scale(resolution,resolution);draw(x,w,h);
      const tex=mk(c,resolution);e={tex,bytes:c.width*c.height*4*1.34,last:frame};map.set(key,e);bytes+=e.bytes;evict();return tex;},
    /** Enfileira um atlas para ser assado nos próximos frames (mesmo orçamento do warm). */
    warmAtlas(key,items){if(map.has(key))return;for(const q of queue)if(q.key===key)return;queue.push({key,atlasItems:items});},
    /**
     * Atlas: várias receitas num só canvas (uma fonte de textura → ParticleContainer). items: [{key,size,draw}].
     * Devolve {texture, frames: Map key→Texture}. Cache pela `key` do atlas.
     */
    atlas(key,items){let e=map.get(key);if(e){e.last=frame;return e.atlas;}
      perf.ini("assaAtlas");
      const cell=items.reduce((m,i)=>Math.max(m,i.size),1),cols=Math.max(1,Math.min(items.length,Math.floor(2048/cell))),rows=Math.ceil(items.length/cols);
      const c=document.createElement("canvas");c.width=cols*cell;c.height=rows*cell;const x=c.getContext("2d");
      const src=new CanvasSource({resource:c,autoGenerateMipmaps:true,scaleMode:"linear"}),frames=new Map();
      items.forEach((it,i)=>{const cx=(i%cols)*cell,cy=Math.floor(i/cols)*cell,off=(cell-it.size)/2;
        x.save();x.translate(cx+off+it.size/2,cy+off+it.size/2);it.draw(x,it.size);x.restore();
        frames.set(it.key,new Texture({source:src,frame:new Rectangle(cx+off,cy+off,it.size,it.size)}));});
      const atlas={texture:new Texture({source:src}),frames,cell};
      e={tex:atlas.texture,atlas,bytes:c.width*c.height*4*1.34,last:frame};map.set(key,e);bytes+=e.bytes;
      perf.fim("assaAtlas");evict();return atlas;},
    invalidate(){for(const e of map.values())destroy(e);map.clear();queue.length=0;bytes=0;evictFrame=-1;},
    destroy(){cache.invalidate();},
  };
  function destroy(e){try{if(e.atlas)for(const t of e.atlas.frames.values())t.destroy(false);e.tex.destroy(true);}catch{}}
  // ⚠️ O ORÇAMENTO JÁ FOI MOLE — a carência única de 120 frames podia devolver lista VAZIA (basta tudo estar
  // sendo desenhado) e `bytes` passava dos 48 MB sem teto nenhum, até o navegador matar o contexto. A
  // carência que cede sob pressão resolveu aquilo e criou o oposto: um despejo em avalanche. As duas
  // pressões moram em `alvoDeDespejo` e `planoDeDespejo`, lá em cima, que é onde a política é explicada.
  function evict(){const teto=budgetMB*1048576;if(bytes+externo<=teto)return;
    // uma varredura por frame: com o conjunto quente acima do teto, nada é liberado e sem esta guarda cada
    // `get` pagaria três varreduras ordenadas do mapa inteiro — o remédio custaria mais que a doença.
    if(evictFrame===frame)return;evictFrame=frame;
    const alvo=alvoDeDespejo(teto,externo,PISO*1048576);if(bytes<=alvo)return;
    perf.ini("despejo");
    for(const {key,e} of planoDeDespejo([...map.entries()].map(([key,e])=>({key,e})),{frame,bytes,alvo,max:POR_FRAME})){
      map.delete(key);bytes-=e.bytes;destroy(e);}
    perf.fim("despejo");}
  return cache;}

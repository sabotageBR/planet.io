// ── SPATIAL HASH: grade uniforme (célula 128 px) com counting sort em Int32Array ──
// Zero alocação por tick em regime: os buffers só crescem (×2) quando o mundo cresce.
// insert() registra o AABB do item em todas as células que ele cobre; build() faz o
// prefix-sum; query()/queryRect() deduplicam por carimbo; forEachPair() reporta cada par
// (i<j) exatamente uma vez — só na célula mínima comum aos dois AABBs.
// @ts-check
// 160 e não 128: a célula acompanha o LADO do mundo (9600/128 = 75 colunas; 12000/160 = 75 também). O
// `clear()` faz `cellStart.fill(0)` a cada tick em DOIS grids e o `forEachPair` varre `cols×rows` mesmo
// com o mapa vazio — manter a célula em 128 num mundo 25% maior custaria 56% a mais de custo FIXO por tick,
// por sala, sem melhorar a resolução do broad-phase (o maior corpo continua sendo do mesmo tamanho).
export const GRID_CELL=160;

/**
 * @typedef {object} Grid
 * @property {number} cols
 * @property {number} rows
 * @property {number} cell
 * @property {()=>void} clear
 * @property {(idx:number,x:number,y:number,r:number)=>void} insert
 * @property {()=>void} build
 * @property {(x:number,y:number,r:number,out:number[]|Int32Array)=>number} query
 * @property {(x0:number,y0:number,x1:number,y1:number,out:number[]|Int32Array)=>number} queryRect
 * @property {(cb:(i:number,j:number)=>void)=>void} forEachPair
 * @property {()=>number} size
 */

/**
 * GRADE DE PONTOS: o item mora numa célula SÓ (a do centro) e entra, sai e se muda em O(1).
 *
 * Existe por causa da COMIDA, que é 90 % das entidades do mundo e a única população que muda todo
 * tick. Com a grade de cima (counting sort), um único grão comido obrigava a refazer os 3900 —
 * medido: **~1 rebuild por tick, 120 µs cada, 36 a 61 % do laço da sala**, e era o maior item do
 * perfil, muito à frente do cérebro dos preenchimentos (1,2 %). Aqui não há `build()`: comer é um
 * `remove`, repor é um `insert`, e o ímã que arrasta um grão só paga alguma coisa quando ele
 * atravessa a fronteira de uma célula.
 *
 * ⚠️ **O item é registrado pelo CENTRO, não pelo AABB** — daí o `pad`, que é o maior raio que um item
 * pode ter (`FOOD.R_MAX`): a consulta cresce o retângulo por ele para não perder o grão cujo centro
 * caiu na célula vizinha mas cuja borda alcança o alvo. Todo consumidor já filtra pela distância real
 * depois (`world.js` na colisão e no ímã, `bot.js:_bestFood`), então o `pad` só pode pecar por
 * excesso, nunca por falta.
 * ⚠️ **Não há carimbo de deduplicação** (o `stamp`/`bump` da outra grade) porque um item está em UMA
 * célula: a mesma varredura não pode devolvê-lo duas vezes. É metade do motivo de a consulta ser mais
 * barata que a antiga, e some no dia em que alguém resolver inserir um item em várias células.
 * ⚠️ **Os índices têm que ser ESTÁVEIS.** Ela guarda o índice do item no array do dono, então o array
 * não pode ser compactado por baixo dela — em `world.js` isso é a free list de `foodFree`, e é a razão
 * de `_compact` ter deixado a comida de fora.
 * @param {number} w @param {number} h @param {number} [cell] @param {number} [pad] maior raio de um item
 */
export function createPointGrid(w,h,cell=GRID_CELL,pad=0){
  const cols=Math.max(1,Math.ceil(w/cell)),rows=Math.max(1,Math.ceil(h/cell)),ncell=cols*rows,inv=1/cell;
  const head=new Int32Array(ncell).fill(-1);
  let cap=1024,next=new Int32Array(cap).fill(-1),prev=new Int32Array(cap).fill(-1),onde=new Int32Array(cap).fill(-1);
  let n=0;
  const grow=need=>{let c=cap;while(c<need)c*=2;
    const nx=new Int32Array(c).fill(-1);nx.set(next);next=nx;
    const pv=new Int32Array(c).fill(-1);pv.set(prev);prev=pv;
    const on=new Int32Array(c).fill(-1);on.set(onde);onde=on;cap=c;};
  const cx=x=>{const c=(x*inv)|0;return c<0?0:c>=cols?cols-1:c;};
  const cy=y=>{const c=(y*inv)|0;return c<0?0:c>=rows?rows-1:c;};
  const liga=(idx,c)=>{const h0=head[c];next[idx]=h0;prev[idx]=-1;if(h0>=0)prev[h0]=idx;head[c]=idx;onde[idx]=c;};
  const desliga=idx=>{const c=onde[idx];if(c<0)return;const p=prev[idx],x=next[idx];
    if(p>=0)next[p]=x;else head[c]=x;
    if(x>=0)prev[x]=p;
    onde[idx]=-1;next[idx]=-1;prev[idx]=-1;};
  function insert(idx,x,y){if(idx>=cap)grow(idx+1);if(onde[idx]>=0)desliga(idx);else n++;liga(idx,cy(y)*cols+cx(x));}
  function remove(idx){if(idx>=cap||onde[idx]<0)return;desliga(idx);n--;}
  /** Só paga quando o item TROCA de célula — que é o caso raro de um grão arrastado pelo ímã. */
  function move(idx,x,y){if(idx>=cap||onde[idx]<0)return insert(idx,x,y);
    const c=cy(y)*cols+cx(x);if(c===onde[idx])return;desliga(idx);liga(idx,c);}
  function queryCells(x0,y0,x1,y1,out){let k=0;
    for(let yy=y0;yy<=y1;yy++){const row=yy*cols;
      for(let xx=x0;xx<=x1;xx++){for(let i=head[row+xx];i>=0;i=next[i])out[k++]=i;}}
    return k;}
  const query=(x,y,r,out)=>{const p=r+pad;return queryCells(cx(x-p),cy(y-p),cx(x+p),cy(y+p),out);};
  const queryRect=(x0,y0,x1,y1,out)=>queryCells(cx(x0-pad),cy(y0-pad),cx(x1+pad),cy(y1+pad),out);
  function clear(){head.fill(-1);next.fill(-1);prev.fill(-1);onde.fill(-1);n=0;}
  return{cols,rows,cell,pad,insert,remove,move,query,queryRect,clear,size:()=>n};}

/** @param {number} w @param {number} h @param {number} [cell] @returns {Grid} */
export function createGrid(w,h,cell=GRID_CELL){
  const cols=Math.max(1,Math.ceil(w/cell)),rows=Math.max(1,Math.ceil(h/cell)),ncell=cols*rows,inv=1/cell;
  const cellStart=new Int32Array(ncell+1),cursor=new Int32Array(ncell+1);
  let cap=1024,ranges=new Int32Array(cap*4),stamp=new Int32Array(cap),items=new Int32Array(cap),entries=new Int32Array(cap*4);
  let n=0,nEnt=0,curStamp=0;
  const grow=need=>{while(cap<need)cap*=2;
    const r2=new Int32Array(cap*4);r2.set(ranges);ranges=r2;const s2=new Int32Array(cap);s2.set(stamp);stamp=s2;const i2=new Int32Array(cap);i2.set(items);items=i2;};
  const growEnt=need=>{let c=entries.length;while(c<need)c*=2;const e2=new Int32Array(c);e2.set(entries);entries=e2;};
  const cx=x=>{const c=(x*inv)|0;return c<0?0:c>=cols?cols-1:c;};
  const cy=y=>{const c=(y*inv)|0;return c<0?0:c>=rows?rows-1:c;};
  const bump=()=>{curStamp++;if(curStamp>=0x7fffffff){stamp.fill(0);curStamp=1;}};

  function clear(){n=0;nEnt=0;cellStart.fill(0);}
  function insert(idx,x,y,r){if(idx>=cap||n>=cap)grow(Math.max(idx+1,n+1));
    const x0=cx(x-r),x1=cx(x+r),y0=cy(y-r),y1=cy(y+r),o=idx*4;ranges[o]=x0;ranges[o+1]=y0;ranges[o+2]=x1;ranges[o+3]=y1;items[n++]=idx;
    for(let yy=y0;yy<=y1;yy++){const row=yy*cols+1;for(let xx=x0;xx<=x1;xx++)cellStart[row+xx]++;}
    nEnt+=(x1-x0+1)*(y1-y0+1);}
  function build(){for(let c=0;c<ncell;c++)cellStart[c+1]+=cellStart[c];
    if(nEnt>entries.length)growEnt(nEnt);cursor.set(cellStart);
    for(let k=0;k<n;k++){const idx=items[k],o=idx*4,x0=ranges[o],y0=ranges[o+1],x1=ranges[o+2],y1=ranges[o+3];
      for(let yy=y0;yy<=y1;yy++){const row=yy*cols;for(let xx=x0;xx<=x1;xx++)entries[cursor[row+xx]++]=idx;}}}
  function queryCells(x0,y0,x1,y1,out){bump();let k=0;
    for(let yy=y0;yy<=y1;yy++){const row=yy*cols;for(let xx=x0;xx<=x1;xx++){const c=row+xx;
      for(let e=cellStart[c],end=cellStart[c+1];e<end;e++){const idx=entries[e];if(stamp[idx]!==curStamp){stamp[idx]=curStamp;out[k++]=idx;}}}}
    return k;}
  function query(x,y,r,out){return queryCells(cx(x-r),cy(y-r),cx(x+r),cy(y+r),out);}
  function queryRect(x0,y0,x1,y1,out){return queryCells(cx(x0),cy(y0),cx(x1),cy(y1),out);}
  function forEachPair(cb){
    for(let yy=0;yy<rows;yy++)for(let xx=0;xx<cols;xx++){const c=yy*cols+xx,s=cellStart[c],e=cellStart[c+1];if(e-s<2)continue;
      for(let a=s;a<e;a++){const i=entries[a],oi=i*4,ix0=ranges[oi],iy0=ranges[oi+1];
        for(let b=a+1;b<e;b++){const j=entries[b],oj=j*4,jx0=ranges[oj],jy0=ranges[oj+1];
          const mx=ix0>jx0?ix0:jx0,my=iy0>jy0?iy0:jy0;                 // célula mínima comum aos dois AABBs
          if(mx===xx&&my===yy){if(i<j)cb(i,j);else cb(j,i);}}}}}
  return{cols,rows,cell,clear,insert,build,query,queryRect,forEachPair,size:()=>n};}

// ── SPATIAL HASH: grade uniforme (célula 128 px) com counting sort em Int32Array ──
// Zero alocação por tick em regime: os buffers só crescem (×2) quando o mundo cresce.
// insert() registra o AABB do item em todas as células que ele cobre; build() faz o
// prefix-sum; query()/queryRect() deduplicam por carimbo; forEachPair() reporta cada par
// (i<j) exatamente uma vez — só na célula mínima comum aos dois AABBs.
// @ts-check
export const GRID_CELL=128;

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

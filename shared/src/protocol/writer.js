// ── Escritor binário crescível, little-endian (reutilize: reset() + toBuffer()) ──
// @ts-check
const enc=new TextEncoder();
/**
 * @typedef {object} Writer
 * @property {number} pos posição atual (gravável para remendar cabeçalhos)
 * @property {()=>Writer} reset
 * @property {(v:number)=>Writer} u8
 * @property {(v:number)=>Writer} u16
 * @property {(v:number)=>Writer} u32
 * @property {(v:number)=>Writer} i16
 * @property {(v:number)=>Writer} i32
 * @property {(v:number)=>Writer} f32
 * @property {(b:Uint8Array)=>Writer} bytes
 * @property {(s:string,max?:number)=>Writer} str8 u8 len + utf-8 (truncado em ≤ max bytes, na fronteira do code point)
 * @property {()=>Uint8Array} toBuffer vista (sem cópia) dos `pos` bytes escritos; válida até o próximo reset()/crescimento
 */
/** @param {number} [initialSize] @returns {Writer} */
export function createWriter(initialSize=4096){
  let buf=new ArrayBuffer(initialSize>0?initialSize:64),dv=new DataView(buf),u8=new Uint8Array(buf),pos=0;
  const ensure=n=>{if(pos+n<=buf.byteLength)return;let cap=buf.byteLength*2;while(cap<pos+n)cap*=2;
    const nb=new ArrayBuffer(cap),nu=new Uint8Array(nb);nu.set(u8);buf=nb;dv=new DataView(nb);u8=nu;};
  /** @type {Writer} */
  const w={
    get pos(){return pos;},set pos(p){pos=p;},
    reset(){pos=0;return w;},
    u8(v){ensure(1);dv.setUint8(pos,v);pos+=1;return w;},
    u16(v){ensure(2);dv.setUint16(pos,v,true);pos+=2;return w;},
    u32(v){ensure(4);dv.setUint32(pos,v,true);pos+=4;return w;},
    i16(v){ensure(2);dv.setInt16(pos,v,true);pos+=2;return w;},
    i32(v){ensure(4);dv.setInt32(pos,v,true);pos+=4;return w;},
    f32(v){ensure(4);dv.setFloat32(pos,v,true);pos+=4;return w;},
    bytes(b){ensure(b.length);u8.set(b,pos);pos+=b.length;return w;},
    str8(s,max=255){if(max>255)max=255;ensure(1+max);const n=enc.encodeInto(s,u8.subarray(pos+1,pos+1+max)).written;dv.setUint8(pos,n);pos+=1+n;return w;},
    toBuffer(){return new Uint8Array(buf,0,pos);},
  };
  return w;}

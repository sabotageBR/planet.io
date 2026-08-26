// ── Leitor binário little-endian; RangeError ao ler além do fim ──────────────
// @ts-check
const dec=new TextDecoder();
/**
 * @typedef {object} Reader
 * @property {number} pos
 * @property {()=>number} remaining
 * @property {()=>number} u8
 * @property {()=>number} u16
 * @property {()=>number} u32
 * @property {()=>number} i16
 * @property {()=>number} i32
 * @property {()=>number} f32
 * @property {(n:number)=>Uint8Array} bytes vista (sem cópia) de n bytes
 * @property {()=>string} str8 u8 len + utf-8
 */
/** Aceita ArrayBuffer, Uint8Array/Buffer (respeita byteOffset) ou DataView. @param {ArrayBuffer|ArrayBufferView} src @returns {Reader} */
export function createReader(src){
  const dv=src instanceof ArrayBuffer?new DataView(src):new DataView(src.buffer,src.byteOffset,src.byteLength);
  const u8=new Uint8Array(dv.buffer,dv.byteOffset,dv.byteLength),len=dv.byteLength;let pos=0;
  const need=n=>{if(pos+n>len)throw new RangeError(`leitura de ${n} byte(s) em ${pos} passa do fim (${len})`);};
  /** @type {Reader} */
  const r={
    get pos(){return pos;},set pos(p){pos=p;},
    remaining(){return len-pos;},
    u8(){need(1);return dv.getUint8(pos++);},
    u16(){need(2);const v=dv.getUint16(pos,true);pos+=2;return v;},
    u32(){need(4);const v=dv.getUint32(pos,true);pos+=4;return v;},
    i16(){need(2);const v=dv.getInt16(pos,true);pos+=2;return v;},
    i32(){need(4);const v=dv.getInt32(pos,true);pos+=4;return v;},
    f32(){need(4);const v=dv.getFloat32(pos,true);pos+=4;return v;},
    bytes(n){need(n);const b=u8.subarray(pos,pos+n);pos+=n;return b;},
    str8(){const n=r.u8();need(n);const s=dec.decode(u8.subarray(pos,pos+n));pos+=n;return s;},
  };
  return r;}

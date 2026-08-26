// ── SESSION: socket + slot + seq/ack + AOI conhecida + token buckets + resume ────
// Vive além do socket: na queda fica NET.RESUME_MS sem ws (o jogador segue no mundo sem thrust);
// `resume` válido religa outro ws na mesma Session (known zera → recria tudo).
// @ts-check
import {randomBytes} from 'node:crypto';
import {NET,WORLD} from '@planet/shared/constants.js';
import {ERROR_CODE} from '@planet/shared/protocol/constants.js';
import {NO_REWARDS} from '../sim/hooks.js';
const VIOLATIONS=3,VIOLATION_WINDOW_MS=10000,VIEW_MIN=240,VIEW_MAX=8192;
/** Token bucket: `rate` fichas/s até `burst`. */
export class Bucket{
  constructor(rate,burst){this.rate=rate;this.burst=burst;this.tokens=burst;this.last=performance.now();}
  take(now=performance.now()){const t=this.tokens+(now-this.last)*this.rate/1000;this.tokens=t>this.burst?this.burst:t;this.last=now;
    if(this.tokens>=1){this.tokens-=1;return true;}return false;}
}
export class Session{
  /** @param {{ws:any,metrics:any,log?:any,remoteAddr?:string|null,userAgent?:string|null}} o */
  constructor({ws,metrics,log=null,remoteAddr=null,userAgent=null}){
    this.ws=ws;this.metrics=metrics;this.log=log;this.remoteAddr=remoteAddr;this.userAgent=userAgent;
    this.slot=-1;this.room=null;this.sessionId=null;this.userId=null;this.name='';this.unsaved=true;
    this.resumeToken=randomBytes(16).toString('hex');
    /** @type {Map<number,number>} id → kind | (carimbo da passada << 3) */this.known=new Map();this.stamp=0;
    this.view={w:1280,h:720};this.cx=WORLD.w/2;this.cy=WORLD.h/2;this.scale=1;this.rect=null;
    this.inputs=new Bucket(NET.RATE_INPUTS,NET.RATE_BURST);this.json=new Bucket(NET.RATE_JSON,NET.RATE_JSON*2);
    /** @type {number[]} */this.violations=[];this.lastPong=Date.now();this.disconnectedAt=0;this.pendingRewards=null;this.joining=false;this.kicked=false;this.connectedAt=Date.now();}
  get connected(){return !!this.ws&&this.ws.readyState===1;}
  setView(w,h){w=Number(w),h=Number(h);if(Number.isFinite(w))this.view.w=w<VIEW_MIN?VIEW_MIN:w>VIEW_MAX?VIEW_MAX:w;if(Number.isFinite(h))this.view.h=h<VIEW_MIN?VIEW_MIN:h>VIEW_MAX?VIEW_MAX:h;}
  /** Envia a vista binária sem copiar. Devolve false se o socket ficou com bytes pendentes (o chamador troca de writer). */
  send(view){const ws=this.ws;if(!ws||ws.readyState!==1)return true;
    ws.send(Buffer.from(view.buffer,view.byteOffset,view.byteLength));this.metrics.bytesOut(view.byteLength);return ws.bufferedAmount===0;}
  /** Envia uma cópia (mensagens pequenas fora do writer da sala). */
  sendCopy(view){const ws=this.ws;if(!ws||ws.readyState!==1)return;ws.send(Buffer.from(view));this.metrics.bytesOut(view.byteLength);}
  sendJson(obj){const ws=this.ws;if(!ws||ws.readyState!==1)return;const s=JSON.stringify(obj);ws.send(s);this.metrics.bytesOut(s.length);}
  /** `error {code,message,suggestion?}` + close com o código de ERROR_CODE. */
  error(code,message,extra){this.sendJson({t:'error',code,message,...(extra||{})});this.kicked=true;const ws=this.ws;if(!ws)return;
    try{ws.close(ERROR_CODE[code]||4400,code);}catch{}}
  /** Registra uma violação de taxa; true quando estourou (VIOLATIONS em VIOLATION_WINDOW_MS). */
  violation(now=Date.now()){const v=this.violations;v.push(now);if(v.length>VIOLATIONS)v.shift();this.metrics.rateLimitHit();
    return v.length>=VIOLATIONS&&now-v[0]<=VIOLATION_WINDOW_MS;}
  deliverRewards(r){const msg={t:'rewards',...(r||NO_REWARDS)};if(this.connected)this.sendJson(msg);else this.pendingRewards=msg;}
  detach(){this.ws=null;this.disconnectedAt=Date.now();}
  attach(ws){this.ws=ws;this.disconnectedAt=0;this.known.clear();this.rect=null;this.lastPong=Date.now();this.violations.length=0;
    this.inputs=new Bucket(NET.RATE_INPUTS,NET.RATE_BURST);this.json=new Bucket(NET.RATE_JSON,NET.RATE_JSON*2);
    if(this.pendingRewards){const m=this.pendingRewards;this.pendingRewards=null;this.sendJson(m);}}
}

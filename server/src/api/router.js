// ── ROUTER mínimo (tabela [método, regex, handler], JSON ≤ 16 KB, bearer, erros) ──
// @ts-check
import {isDbUnavailable} from '../db/pool.js';
import {LIMITS} from '../auth/ratelimit.js';
import {hashToken} from '../auth/tokens.js';
export const BODY_MAX=16*1024;
export class ApiError extends Error{constructor(status,error,message,extra){super(message||error);this.status=status;this.error=error;this.extra=extra;}}
export const err=(status,error,message,extra)=>new ApiError(status,error,message,extra);
export const clientIp=req=>{const xf=req.headers['x-forwarded-for'];const ip=xf?String(xf).split(',')[0].trim():req.socket.remoteAddress||'?';return ip.replace(/^::ffff:/,'');};
export const bearer=req=>{const h=req.headers.authorization;if(!h)return null;const m=/^Bearer\s+(\S+)$/i.exec(String(h));return m?m[1]:null;};
export function readJson(req){
  return new Promise((resolve,reject)=>{
    const len=Number(req.headers['content-length']||0);if(len>BODY_MAX)return reject(err(413,'payload_too_large','corpo acima de 16 KB'));
    const chunks=[];let size=0;
    req.on('data',c=>{size+=c.length;if(size>BODY_MAX){reject(err(413,'payload_too_large','corpo acima de 16 KB'));req.destroy();return;}chunks.push(c);});
    req.on('end',()=>{if(!size)return resolve({});try{const v=JSON.parse(Buffer.concat(chunks).toString('utf8'));resolve(v&&typeof v==='object'&&!Array.isArray(v)?v:{});}catch{reject(err(400,'bad_json','JSON inválido'));}});
    req.on('error',reject);
  });
}
export function sendJson(res,status,body,headers){
  const data=body===undefined?'':JSON.stringify(body);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(data),...headers});
  res.end(data);
}
/**
 * @param {{log:any,limiter:any,prefixes:RegExp}} o
 * Handler: async (ctx) → body (200) | [status, body?] ; ctx = {req,res,params,query,body,token,ip,userAgent}
 * Rota: {method, re, handler, rate?:{scope:'ip'|'token',lim}} — rate default 60/min/IP
 */
export function createRouter({log,limiter,prefixes}){
  const routes=[];
  const add=(method,re,handler,opts={})=>{routes.push({method,re,handler,...opts});return add;};
  async function handle(req,res){
    const url=new URL(req.url||'/','http://x');const path=url.pathname;
    if(!prefixes.test(path))return false;
    let matched=null,methodMismatch=false;
    for(const r of routes){const m=r.re.exec(path);if(!m)continue;if(r.method!==req.method){methodMismatch=true;continue;}matched={r,m};break;}
    try{
      if(!matched)throw methodMismatch?err(405,'method_not_allowed','método não permitido'):err(404,'not_found','rota não encontrada');
      const {r,m}=matched;const ip=clientIp(req),token=bearer(req);
      const rate=r.rate||{scope:'ip',lim:LIMITS.default};
      if(limiter){const key=rate.scope==='token'?`t:${r.re.source}:${token?hashToken(token).slice(0,24):ip}`:`ip:${r.rate?r.re.source:'*'}:${ip}`;
        if(!limiter.take(key,rate.lim))throw err(429,'rate_limited','muitas requisições; tente de novo em instantes',{retryAfter:limiter.retryAfterS(key,rate.lim)});}
      const body=(req.method==='POST'||req.method==='PATCH'||req.method==='PUT')?await readJson(req):{};
      const ctx={req,res,params:m.groups||{},query:url.searchParams,body,token,ip,userAgent:req.headers['user-agent']||null};
      const out=await r.handler(ctx);
      if(Array.isArray(out))sendJson(res,out[0],out[1]);else sendJson(res,200,out??{});
    }catch(e){
      if(e instanceof ApiError){const h=e.extra&&e.extra.retryAfter?{'Retry-After':String(e.extra.retryAfter)}:undefined;sendJson(res,e.status,{error:e.error,message:e.message,...(e.extra&&!e.extra.retryAfter?e.extra:{})},h);}
      else if(isDbUnavailable(e)){log.warn('api: banco indisponível:',e.message);sendJson(res,503,{error:'db_unavailable',message:'banco indisponível; tente de novo em instantes'});}
      else{log.error('api:',req.method,path,e);sendJson(res,500,{error:'internal',message:'erro interno'});}
    }
    return true;
  }
  return{add,handle,routes};
}

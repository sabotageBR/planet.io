// ── HTTP: /healthz, /internal/rooms, /api/config|rooms|auto → API da persistência → estáticos (dev) → 404 ──
// @ts-check
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {PROTOCOL_VERSION} from '@planet/shared/protocol/constants.js';
import {sendJson} from '../api/router.js';
import {fetchPeerRooms} from './peers.js';
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.ico':'image/x-icon','.png':'image/png','.jpg':'image/jpeg',
  '.svg':'image/svg+xml','.json':'application/json','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.map':'application/json','.txt':'text/plain','.webmanifest':'application/manifest+json'};
const byPlayers=(a,b)=>b.players-a.players;
/**
 * @param {{config:any,rooms:any,persistApi:any,health:()=>any,log:any}} o
 * @returns {(req:any,res:any)=>Promise<void>}
 */
export function createHttpHandler({config,rooms,persistApi,health,log}){
  const staticDir=config.staticDir?path.resolve(config.staticDir):null;
  const allRooms=async()=>rooms?rooms.allRooms():(config.peers.length?fetchPeerRooms(config.peers,{log}):[]);
  async function serveStatic(p,res){
    const rel=p==='/'?'index.html':decodeURIComponent(p).replace(/^\/+/,'');let file=path.resolve(staticDir,rel);
    if(file!==staticDir&&!file.startsWith(staticDir+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
    try{const st=await stat(file);if(st.isDirectory())file=path.join(file,'index.html');}
    catch{if(path.extname(file))return notFound(res);file=path.join(staticDir,'index.html');}   // SPA: rota sem extensão → index.html
    try{const data=await readFile(file);res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':path.extname(file)==='.html'?'no-cache':'public, max-age=3600'});res.end(data);}
    catch{notFound(res);}}
  const notFound=res=>sendJson(res,404,{error:'not_found',message:'rota não encontrada'});
  return async function handler(req,res){
    try{
      const url=new URL(req.url||'/','http://x'),p=url.pathname;
      if(p==='/healthz')return sendJson(res,200,health());
      if(p==='/internal/rooms')return sendJson(res,200,{shard:config.shard,rooms:rooms?rooms.listRooms():[]});
      if(p==='/api/config')return sendJson(res,200,{shards:config.shards,shard:config.shard,roomMax:config.roomMax,protocol:PROTOCOL_VERSION});
      if(p==='/api/rooms')return sendJson(res,200,{rooms:(await allRooms()).sort(byPlayers)});
      if(p==='/api/auto'){const open=(await allRooms()).filter(r=>r.players<r.max).sort(byPlayers);
        if(open[0])return sendJson(res,200,open[0]);if(rooms)return sendJson(res,200,rooms.findOrCreateRoom().info());
        return sendJson(res,503,{error:'no_game',message:'nenhum shard de jogo disponível'});}
      if(!persistApi&&/^\/api\/(auth|me|skins|ranking)(\/|\?|$)/.test(req.url||"")){   // sem banco: o cliente cai em modo offline
        res.writeHead(503,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify({error:"unreachable",message:"servidor sem banco de dados"}));return;}
      if(persistApi&&await persistApi(req,res))return;
      if(staticDir&&(req.method==='GET'||req.method==='HEAD'))return serveStatic(p,res);
      notFound(res);
    }catch(e){log.error('http:',req.method,req.url,e);if(!res.headersSent)sendJson(res,500,{error:'internal',message:'erro interno'});}
  };
}

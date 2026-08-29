// ── HTTP: /healthz, /internal/rooms, /api/config|rooms|auto → API da persistência → estáticos (dev) → 404 ──
// @ts-check
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {PROTOCOL_VERSION} from '@planet/shared/protocol/constants.js';
import {sendJson,readJson,bearer,clientIp} from '../api/router.js';
import {hashToken} from '../auth/tokens.js';
import {createPartyManager} from '../rooms/Party.js';
import {fetchPeerRooms} from './peers.js';
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.ico':'image/x-icon','.png':'image/png','.jpg':'image/jpeg',
  '.svg':'image/svg+xml','.json':'application/json','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.map':'application/json','.txt':'text/plain','.webmanifest':'application/manifest+json'};
const byPlayers=(a,b)=>b.players-a.players;
/**
 * @param {{config:any,rooms:any,persistApi:any,health:()=>any,log:any}} o
 * @returns {(req:any,res:any)=>Promise<void>}
 */
export function createHttpHandler({config,rooms,persistApi,health,log,parties=null}){
  const staticDir=config.staticDir?path.resolve(config.staticDir):null;
  // O lobby de equipe mora AQUI, junto de /api/rooms|auto, e não na API de persistência: ele é estado de sala
  // (memória do shard, com TTL), tem que funcionar sem banco e vale para convidado. Quem identifica a pessoa é
  // o hash do token — o mesmo `pt_…` do jogo —, então o guest entra numa equipe sem criar conta.
  const party=parties||createPartyManager({config,log});
  const keyOf=req=>{const t=bearer(req);return t?hashToken(t).slice(0,24):null;};   // sem token não há identidade: dois jogadores atrás do mesmo NAT virariam a mesma pessoa
  const nickOf=b=>String(b&&b.nick||'Viajante').normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,16)||'Viajante';
  // `you` diz a quem perguntou se ELE é o líder e qual membro é ele: o cliente não conhece a própria chave
  // (é o hash do token, que fica só no servidor), então sem isto a tela não sabe quem pode começar a partida.
  const partyOut=(res,r,key)=>{
    if(r&&r.error)return sendJson(res,r.error==='not_found'?404:r.error==='not_leader'?403:409,{error:r.error,message:r.message});
    if(r&&r.party&&key)r={...r,you:{key,leader:r.party.leader===key}};
    return sendJson(res,200,r);};
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
      // `googleClientId` vazio é o interruptor do login com Google: o cliente só desenha o botão quando ele
      // vem preenchido, então sem credencial nada aparece e a rota nem é procurada.
      if(p==='/api/config')return sendJson(res,200,{shards:config.shards,shard:config.shard,roomMax:config.roomMax,
        protocol:PROTOCOL_VERSION,googleClientId:config.googleClientId||''});
      if(p==='/api/rooms'){const all=(await allRooms()).sort(byPlayers),md=url.searchParams.get('mode');
        return sendJson(res,200,{rooms:md==null?all:all.filter(r=>(r.mode|0)===(+md|0))});}
      if(p==='/api/auto'){
        // ?mode= e ?teamSize=: o Battle Royale tem pool próprio por tamanho de equipe, senão o jogador cairia
        // numa sala de outro formato. O filtro é `open` (= Room.acceptsJoin), não `players<max`: no Battle Royale
        // uma sala com vaga mas já EM PARTIDA não recebe mais ninguém, e o peer só nos conta o que o info() diz.
        const mode=+(url.searchParams.get('mode')||0)|0,teamSize=+(url.searchParams.get('teamSize')||1)|0;
        const open=(await allRooms()).filter(r=>(r.open!==undefined?r.open:r.players<r.max)&&(r.mode|0)===mode&&(mode===0||(r.teamSize|0)===teamSize)).sort(byPlayers);
        if(open[0])return sendJson(res,200,open[0]);if(rooms)return sendJson(res,200,rooms.findOrCreateRoom({mode,teamSize}).info());
        return sendJson(res,503,{error:'no_game',message:'nenhum shard de jogo disponível'});}
      // ── lobby de equipe (código de convite) ──
      if(p==='/api/party'&&req.method==='POST'){const b=await readJson(req),key=keyOf(req);
        if(!key)return sendJson(res,401,{error:'unauthorized',message:'entre como convidado antes de criar uma equipe'});
        return partyOut(res,party.create({key,nick:nickOf(b),skinId:b.skinId|0,registered:!!bearer(req),mode:b.mode|0,teamSize:b.teamSize|0}),key);}
      const mp=/^\/api\/party\/([0-9A-Za-z]{4})(?:\/(join|leave|start))?$/.exec(p);
      if(mp){const code=mp[1].toUpperCase(),act=mp[2];
        if(!act&&req.method==='GET'){const g=party.get(code);
          if(!g)return sendJson(res,404,{error:'not_found',message:'lobby não encontrado ou expirado'});
          return partyOut(res,{party:party.view(g)},keyOf(req));}
        if(act&&req.method==='POST'){const b=await readJson(req),key=keyOf(req);
          if(!key)return sendJson(res,401,{error:'unauthorized',message:'entre como convidado antes de usar uma equipe'});
          if(act==='join')return partyOut(res,party.join(code,{key,nick:nickOf(b),skinId:b.skinId|0,registered:!!bearer(req)}),key);
          if(act==='leave')return partyOut(res,party.leave(code,key),key);
          return partyOut(res,party.start(code,key,b.room||null),key);}
        return sendJson(res,405,{error:'method_not_allowed',message:'método não permitido'});}
      if(!persistApi&&/^\/api\/(auth|me|skins|ranking)(\/|\?|$)/.test(req.url||"")){   // sem banco: o cliente cai em modo offline
        res.writeHead(503,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify({error:"unreachable",message:"servidor sem banco de dados"}));return;}
      if(persistApi&&await persistApi(req,res))return;
      if(staticDir&&(req.method==='GET'||req.method==='HEAD'))return serveStatic(p,res);
      notFound(res);
    }catch(e){log.error('http:',req.method,req.url,e);if(!res.headersSent)sendJson(res,500,{error:'internal',message:'erro interno'});}
  };
}

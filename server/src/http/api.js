// ── HTTP: /healthz, /internal/rooms|party, /api/config|rooms|auto|party → API da persistência → estáticos (dev) → 404 ──
// @ts-check
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {PROTOCOL_VERSION} from '@warspace/shared/protocol/constants.js';
import {modeOf,roundTicksOf,ROOM,ENTRY_PANELS,ENTRY,playerNick} from '@warspace/shared/constants.js';
import {createRng} from '@warspace/shared/rng.js';
import {sendJson,readJson,bearer,clientIp} from '../api/router.js';
import {sessionKey} from '../auth/tokens.js';
import {createPartyManager} from '../rooms/Party.js';
import {escolheSala} from '../rooms/matchmaking.js';
import {shardOf,newCode} from '../rooms/codes.js';
import {fetchPeerRooms,askPeers} from './peers.js';
import {createAdminHttp} from './admin.js';
import {createCors} from './cors.js';
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.ico':'image/x-icon','.png':'image/png','.jpg':'image/jpeg',
  '.svg':'image/svg+xml','.json':'application/json','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.map':'application/json','.txt':'text/plain','.webmanifest':'application/manifest+json'};
const byPlayers=(a,b)=>b.players-a.players;
/**
 * @param {{config:any,rooms:any,persistApi:any,health:()=>any,log:any}} o
 * @returns {(req:any,res:any)=>Promise<void>}
 */
export function createHttpHandler({config,rooms,persistApi,health,log,parties=null,bus=null,metrics=null,nickPool=null}){
  // O painel /admin é o único consumidor de `/internal/admin/*`, que NÃO é publicado no Ingress.
  const adminHttp=createAdminHttp({rooms,config,log,persistApi,bus,metrics});
  // CORS: o cliente pode estar hospedado por um portal, em outro domínio. Fica AQUI, no topo do
  // handler, porque `setHeader` antes do roteamento é mesclado por todo `writeHead` de baixo — um
  // ponto só cobre o sendJson, o avatar (headers próprios E o 304), o 503 sem banco e os estáticos.
  const cors=createCors({config,log});
  const staticDir=config.staticDir?path.resolve(config.staticDir):null;
  // O lobby de equipe mora AQUI, junto de /api/rooms|auto, e não na API de persistência: ele é estado de sala
  // (memória do shard, com TTL), tem que funcionar sem banco e vale para convidado. Quem identifica a pessoa é
  // o hash do token — o mesmo `pt_…` do jogo —, então o guest entra numa equipe sem criar conta.
  const party=parties||createPartyManager({config,log});
  const keyOf=req=>sessionKey(bearer(req));   // sem token não há identidade: dois jogadores atrás do mesmo NAT virariam a mesma pessoa
  const nickOf=b=>String(b&&b.nick||'Viajante').normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,16)||'Viajante';
  // `you` diz a quem perguntou se ELE é o líder e qual membro é ele: o cliente não conhece a própria chave
  // (é o hash do token, que fica só no servidor), então sem isto a tela não sabe quem pode começar a partida.
  const partyOut=(res,r,key)=>{
    if(r&&r.error)return sendJson(res,r.error==='not_found'?404:r.error==='not_leader'?403:409,{error:r.error,message:r.message});
    if(r&&r.party&&key)r={...r,you:{key,leader:r.party.leader===key}};
    return sendJson(res,200,r);};
  const allRooms=async()=>rooms?rooms.allRooms():(config.peers.length?fetchPeerRooms(config.peers,{log}):[]);
  /** A CONTA por trás do Bearer, e só se for registrada. Sem banco não há conta — e aí não há dono de sala. */
  async function contaDe(req){const t=bearer(req);
    if(!t||!persistApi||!persistApi.repos||!persistApi.repos.tokens)return null;
    const u=await persistApi.repos.tokens.resolve(t).catch(()=>null);
    return u&&u.kind==='registered'?u:null;}
  /** Código livre DESTE shard (o 1º char é o dono; ver rooms/codes.js). */
  function novoCodigo(){let c=newCode(config.shard);while(rooms.rooms.has(c))c=newCode(config.shard);return c;}
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
      if(cors(req,res,p))return;   // era preflight: já respondeu 204. Senão, só marcou os headers e segue
      if(p==='/healthz')return sendJson(res,200,health());
      if(p==='/internal/rooms')return sendJson(res,200,{shard:config.shard,rooms:rooms?rooms.listRooms():[]});
      // BR começando: o shard que criou a sala avisa os irmãos para acordarem o Livre LOCAL deles. Nunca
      // reencaminha (como /internal/rooms) e não é publicado no Ingress — só RoomManager.create() chama
      // isto, nunca um cliente. Por isso não exige Bearer: não é ação de admin, é eco de um evento do
      // próprio cluster.
      if(p==='/internal/br-start'){
        if(req.method!=='POST')return sendJson(res,405,{error:'method_not_allowed',message:'método não permitido'});
        const b=await readJson(req),room=String(b&&b.room||'').toUpperCase();
        if(!room)return sendJson(res,400,{error:'bad_room',message:'código da sala não veio'});
        const r=rooms?rooms.broadcastBrStart(room):{delivered:0,rooms:0};
        return sendJson(res,200,{shard:config.shard,...r});}
      // `googleClientId` vazio é o interruptor do login com Google: o cliente só desenha o botão quando ele
      // vem preenchido, então sem credencial nada aparece e a rota nem é procurada.
      // ⚠️ `ROOM.MAX`, não `config.roomMax`: o tamanho da sala virou parâmetro do painel e o env só o
      // semeia no boot. Anunciando o número do env, a tela mostraria a capacidade que a sala NÃO tem.
      // `entryPanels`: mesmo padrão — a tela "Escolha o Modo" é decidida ANTES de qualquer sala/WS
      // existir, então o valor não pode esperar pelo `room` (mecanismo `wire`); ver ENTRY_PANELS em
      // shared/src/constants.js.
      if(p==='/api/config')return sendJson(res,200,{shards:config.shards,shard:config.shard,roomMax:ROOM.MAX,
        protocol:PROTOCOL_VERSION,googleClientId:config.googleClientId||'',
        entryPanels:{free:ENTRY_PANELS.FREE,br:ENTRY_PANELS.BR,own:ENTRY_PANELS.OWN,order:ENTRY_PANELS.ORDER}});
      // ── NICK SORTEADO PARA A TELA INICIAL ────────────────────────────────────────────────────
      // Mora aqui, e não em `server/src/api/`, por três razões que se somam: esta é a única camada
      // que tem o `rooms` — e é ele que responde "está em uso NAQUELE MOMENTO"; o `cors()` do topo do
      // handler já cobre `/api/*`, então a rota vale nos pacotes de portal sem uma linha a mais; e o
      // `createHttpHandler` é construído DEPOIS do balde no boot (`server/src/index.js`), enquanto o
      // `createApi` vem antes e obrigaria a reordenar o composition root.
      // ⚠️ Ela não entra no `PREFIXES` de `server/src/api/index.js` — aquele gate só vale para o que
      // o `createApi` monta, e uma rota daqui listada lá seria roteada para o router errado.
      if(p==='/api/nick'){
        // ⚠️ `null` é uma RESPOSTA, não uma falha: é assim que o interruptor do /admin chega ao
        // cliente. Ele distingue os dois casos — `{nick:null}` deixa o campo vazio (o comportamento
        // de sempre), a requisição FALHAR é que o manda para a lista fixa local.
        if(!ENTRY.NICK_AUTO)return sendJson(res,200,{nick:null});
        // Os nicks vivos deste shard: humanos e preenchimentos, que é o que `Room.nickTaken` consulta
        // na entrada. Sem esta união, o sorteio entrega um nome que a sala vai recusar.
        const usados=new Set();
        if(rooms)for(const r of rooms.rooms.values())for(const n of r.usedNicks)usados.add(n);
        // O balde primeiro; `null` dele é a resposta NORMAL (sem LLM, disjuntor aberto ou balde vazio).
        // ⚠️ Semente do relógio, e não do rng de uma sala: aqui não há determinismo a preservar —
        // isto não é estado de partida, e duas pessoas entrando no mesmo tick não podem sair com o
        // mesmo nome.
        const nick=(nickPool&&nickPool.take(usados))||playerNick(createRng((Date.now()^(Math.random()*1e9))|0),usados);
        return sendJson(res,200,{nick});}
      if(p==='/api/rooms'&&req.method!=='POST'){const all=(await allRooms()).sort(byPlayers),md=url.searchParams.get('mode');
        return sendJson(res,200,{rooms:md==null?all:all.filter(r=>(r.mode|0)===(+md|0))});}
      // ── SALA COM DONO ────────────────────────────────────────────────────────────────────────
      // Criar é a ÚNICA operação de sala que não precisa de roteamento: quem recebe cria na própria memória,
      // com um código do próprio shard, e o 1º char do código leva o cliente ao `/ws/<shard>` certo sozinho.
      // Encaminhar isto seria sortear shard sem motivo. É o mesmo desenho do `POST /api/party`.
      // ⚠️ Só CONTA REGISTRADA: o dono expulsa e bane, e quem troca de identidade a cada entrada não pode ter
      // esse poder. Como isso exige resolver o token no banco, a rota depende dele — e diz isso com 503, no
      // molde do `admin_disabled`, em vez de fingir que funcionou.
      if(p==='/api/rooms'&&req.method==='POST'){
        if(!rooms)return sendJson(res,503,{error:'no_game',message:'nenhum shard de jogo disponível'});
        const dono=await contaDe(req);
        if(!dono)return sendJson(res,403,{error:'need_account',message:'crie uma conta para abrir uma sala sua'});
        const b=await readJson(req),mode=modeOf(b.mode|0),teamSize=mode.teamSizes.includes(b.teamSize|0)?b.teamSize|0:mode.teamSizes[0];
        const rt=roundTicksOf(mode.id,b.minutes);
        if(rt===null)return sendJson(res,409,{error:'bad_time',message:'duração inválida para este modo'});
        const room=rooms.create(novoCodigo(),{mode:mode.id,teamSize,roundTicks:rt,private:!!b.private,hostUserId:dono.id,hostNick:dono.nick});
        return sendJson(res,200,{room:room.info(),you:{host:true}});}
      // Consultar uma sala pelo código (o link de convite precisa saber o MODO antes de entrar: sem isso o
      // convidado entra com o modo do estado dele e toma o erro MODE). Esta ROTEIA — a sala é do shard do 1º
      // char do código, e só ele a conhece.
      const mr=/^\/(api|internal)\/room\/([0-9A-Za-z]{4})$/.exec(p);
      if(mr){const int=mr[1]==='internal',code=mr[2].toUpperCase();
        const local=rooms&&rooms.rooms.get(code);   // ⚠️ NUNCA getRoom: ele CRIA a sala e um código errado materializaria uma fantasma
        if(local)return sendJson(res,200,{room:local.info()});
        if(int||!config.peers.length||shardOf(code)===config.shard)return sendJson(res,404,{error:'not_found',message:'sala não encontrada'});
        const r=await askPeers(config.peers,{path:`/internal/room/${code}`,log});
        if(!r)return sendJson(res,503,{error:'peer_unreachable',message:'shard indisponível; tente de novo'});
        return sendJson(res,r.status,r.body);}
      if(p==='/api/auto'){
        // ?mode= e ?teamSize=: o Battle Royale tem pool próprio por tamanho de equipe, senão o jogador cairia
        // numa sala de outro formato. Quem escolhe é `escolheSala` (rooms/matchmaking.js, pura e testada):
        // ela agrupa até `ROOM.SOFT` por sala e `ROOM.SHARD_SOFT` por shard, e daí em diante ESPALHA.
        // ⚠️ Isto aqui era `a sala mais cheia do CLUSTER`, e essa linha só é inofensiva com um shard: com
        // vários ela é um atrator que empilha o cluster inteiro num pod — ver o cabeçalho do módulo.
        // `null` = "crie uma neste shard", e é `findOrCreateRoom` (que aplica o MESMO teto de agrupamento)
        // quem decide entre reusar uma sala local com folga e abrir outra.
        const mode=+(url.searchParams.get('mode')||0)|0,teamSize=+(url.searchParams.get('teamSize')||1)|0;
        const sala=escolheSala(await allRooms(),{mode,teamSize,shard:config.shard});
        if(sala)return sendJson(res,200,sala);
        if(rooms)return sendJson(res,200,rooms.findOrCreateRoom({mode,teamSize}).info());
        return sendJson(res,503,{error:'no_game',message:'nenhum shard de jogo disponível'});}
      // ── lobby de equipe (código de convite) ──
      if(p==='/api/party'&&req.method==='POST'){const b=await readJson(req),key=keyOf(req);
        if(!key)return sendJson(res,401,{error:'unauthorized',message:'entre como convidado antes de criar uma equipe'});
        return partyOut(res,party.create({key,nick:nickOf(b),skinId:b.skinId|0,registered:!!bearer(req),mode:b.mode|0,teamSize:b.teamSize|0}),key);}
      // `/internal/party/*` é ESTA MESMA rota, pela via entre pods (como /internal/rooms; o Ingress não a
      // publica). Ela NUNCA reencaminha (`int`) — é isso que impede três shards se repassando em círculo.
      const mp=/^\/(api|internal)\/party\/([0-9A-Za-z]{4})(?:\/(join|leave|start))?$/.exec(p);
      if(mp){const int=mp[1]==='internal',code=mp[2].toUpperCase(),act=mp[3];
        if(act?req.method!=='POST':req.method!=='GET')return sendJson(res,405,{error:'method_not_allowed',message:'método não permitido'});
        const b=act?await readJson(req):null,key=keyOf(req);   // corpo e identidade ANTES do desvio: 401 não gera tráfego interno
        if(act&&!key)return sendJson(res,401,{error:'unauthorized',message:'entre como convidado antes de usar uma equipe'});
        // O lobby vive na MEMÓRIA do shard que gerou o código (1º char), e o Ingress balanceia /api entre os
        // 3 pods: sem este desvio, 2 em cada 3 chamadas caíam no pod errado, voltavam 404, e a tela de equipe
        // se fechava sozinha em 1 s. Repassa-se o `Authorization`, nunca a `key` pronta: `hashToken` é sha256
        // sem segredo, então o irmão chega na MESMA chave — e a porta interna não vira passe de impersonação.
        const dono=shardOf(code);
        if(!int&&dono!==config.shard&&dono<config.shards&&config.peers.length){
          const r=await askPeers(config.peers,{path:`/internal/party/${code}${act?'/'+act:''}`,method:req.method,body:b,auth:req.headers.authorization||null,log});
          // irmão mudo ≠ equipe desfeita: 503, NUNCA 404 — só o 404 faz o cliente desfazer a equipe
          if(!r)return sendJson(res,503,{error:'peer_unreachable',message:'o shard da equipe não respondeu'});
          return sendJson(res,r.status,r.body);}
        if(!act){const g=party.get(code);
          if(!g)return sendJson(res,404,{error:'not_found',message:'lobby não encontrado ou expirado'});
          return partyOut(res,{party:party.view(g)},key);}
        if(act==='join')return partyOut(res,party.join(code,{key,nick:nickOf(b),skinId:b.skinId|0,registered:!!bearer(req)}),key);
        if(act==='leave')return partyOut(res,party.leave(code,key),key);
        return partyOut(res,party.start(code,key,b.room||null),key);}
      // ⚠️ ANTES do `persistApi`: `/api/admin/rooms|broadcast` mexem em memória de SALA, que só existe aqui.
      // O router de persistência tem as outras rotas de /api/admin (contas, parâmetros, auditoria).
      if(await adminHttp(req,res,p,sendJson,readJson))return;
      if(!persistApi&&/^\/api\/(auth|me|skins|ranking)(\/|\?|$)/.test(req.url||"")){   // sem banco: o cliente cai em modo offline
        res.writeHead(503,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify({error:"unreachable",message:"servidor sem banco de dados"}));return;}
      if(persistApi&&await persistApi(req,res))return;
      if(staticDir&&(req.method==='GET'||req.method==='HEAD'))return serveStatic(p,res);
      notFound(res);
    }catch(e){log.error('http:',req.method,req.url,e);if(!res.headersSent)sendJson(res,500,{error:'internal',message:'erro interno'});}
  };
}

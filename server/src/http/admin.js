// ── PAINEL /admin, a parte que mexe em SALA: listar, kick, fechar e o aviso global ────────────
// Estas rotas vivem no servidor de JOGO (e não em server/src/api/) porque tudo aqui é memória de sala —
// o mesmo corte que já separa `/api/me` de `/api/rooms|party`.
//
// DOIS PADRÕES ENTRE SHARDS, e trocá-los é o bug mais silencioso possível:
//   · sala (listar/detalhe/kick/fechar) → ROTEIA PELO DONO. O 1º char do código diz o shard, então só um
//     pod conhece aquela sala. Difundir faria dois pods responderem sobre a mesma coisa.
//   · aviso global → DIFUNDE (tellPeers). Não há dono: todos aplicam, e as falhas voltam na resposta,
//     senão o administrador manda um aviso que metade da base não recebeu e acha que mandou.
// `/internal/admin/*` NUNCA reencaminha (é o que impede três pods se repassando em círculo) e não é
// publicado no Ingress — mas o Bearer é revalidado no destino de qualquer forma: um erro futuro de rota
// no Ingress não pode virar um endpoint de kick aberto.
// @ts-check
import {shardOf} from '../rooms/codes.js';
import {askPeers,tellPeers} from './peers.js';
import {createColetor,leCursor} from '../admin/coletor.js';
import {hashToken} from '../auth/tokens.js';
import {NOTICE,ADMIN_BUS} from '@warspace/shared/constants.js';

/** Mesmo saneamento do chat da sala (Room.chat), feito UMA vez na rota e não uma vez por sala. */
const limpa=t=>String(t||'').normalize('NFKC').replace(/\p{C}/gu,'').replace(/\s+/g,' ').trim().slice(0,NOTICE.MAX_CHARS);

// ── ORDENAÇÃO DAS DUAS ROTAS EM MEMÓRIA ───────────────────────────────────────
// Elas não têm SQL: a lista é a memória viva dos pods, agregada entre shards. Então a ordenação é um
// comparador no processo, aplicado no ponto de SAÍDA (ver os dois usos abaixo). Nenhuma paginação — o
// conjunto vem inteiro, e ordená-lo ordena tudo; não há fronteira a declarar. A única incompletude
// possível é um shard mudo, e a faixa `.ad-shards` do painel já diz qual.
// ⚠️ Lista branca aqui também, pelo mesmo motivo de sempre: `by` desconhecido é recusado, nunca cai
// calado numa coluna que a tela não está anunciando.
const ORDEM_SALAS=new Map([['code',r=>r.code],['shard',r=>r.shard|0],['mode',r=>r.mode|0],
  ['phase',r=>String(r.phase||'')],['humans',r=>r.humans|0],['bots',r=>r.bots|0],['round',r=>r.round==null?-1:r.round|0]]);
// `state` é COMPOSTO e por isso é declarado: vivo e conectado primeiro. Um cabeçalho que ordena por um
// critério que a coluna não mostra é a mesma mentira que a lista branca existe para evitar, em miniatura.
const ORDEM_JOGADORES=new Map([['slot',p=>p.slot|0],['name',p=>String(p.name||'').toLowerCase()],
  ['level',p=>p.level|0],['mass',p=>p.mass|0],['state',p=>(p.alive?2:0)+(p.connected?1:0)],['ip',p=>String(p.ip||'')]]);
/** `by`/`dir` da query, com padrão por rota. Valor fora da lista cai no padrão — aqui NÃO se recusa com
 *  400 porque estas rotas não têm o router de erros do `api/`, e a resposta ecoa o `by` que VALEU. */
function ordemQuery(req,lista,padBy,padDir){
  const q=new URL(req.url||'/','http://x').searchParams;
  const by=q.get('by'),dir=q.get('dir');
  return{by:by&&lista.has(by)?by:padBy,dir:dir==='asc'||dir==='desc'?dir:padDir};}
/** Desempate por `code`/`slot` para a lista não dançar debaixo do cursor no polling de 5 s do painel. */
function ordena(arr,lista,by,dir,desempate){
  const f=lista.get(by),k=dir==='asc'?1:-1;
  return arr.slice().sort((a,b)=>{const x=f(a),y=f(b);
    if(x<y)return -k;if(x>y)return k;
    const dx=desempate(a),dy=desempate(b);return dx<dy?-1:dx>dy?1:0;});}
const ordenaSalas=(req,arr)=>{const {by,dir}=ordemQuery(req,ORDEM_SALAS,'humans','desc');
  return{lista:ordena(arr,ORDEM_SALAS,by,dir,r=>String(r.code||'')),by,dir};};
const ordenaJogadores=(req,arr)=>{if(!Array.isArray(arr))return arr;
  const {by,dir}=ordemQuery(req,ORDEM_JOGADORES,'slot','asc');
  return ordena(arr,ORDEM_JOGADORES,by,dir,p=>p.slot|0);};

/**
 * @param {{rooms:any,config:any,log:any,persistApi:any}} o
 * @returns {(req:any,res:any,p:string,sendJson:Function,readJson:Function)=>Promise<boolean>}
 */
export function createAdminHttp({rooms,config,log,persistApi,bus=null,metrics=null}){
  const coletor=bus?createColetor({config,rooms,bus,metrics,log}):null;
  /**
   * MEMO DA RESOLUÇÃO DO BEARER — só para a porta `/internal`.
   * ⚠️ Ele existe por causa do fluxo ao vivo: `/internal/*` revalida o Bearer no destino (invariante do
   * cabeçalho deste arquivo, e não se mexe nela), e `tokens.resolve` é um SELECT. Com 2 admins olhando o
   * painel são ~46 requisições internas por segundo — ou seja 46 SELECTs/s de puro overhead num pool de
   * 5 conexões, disputando com a persistência de partida.
   * ⚠️ O TTL é exatamente o atraso entre revogar um token e a porta interna perceber. 10 s é menor que os
   * 30 s que o poll de tunables já aceita. A porta EXTERNA nunca lê este memo.
   */
  /** @type {Map<string,{u:any,ate:number}>} */const memo=new Map();
  /** Só entra quem tem `is_admin` E um token do PAINEL (kind 'admin'). Ver server/src/api/admin.js. */
  async function admin(req,cache=false){
    const t=/^Bearer\s+(\S+)$/i.exec(req.headers.authorization||'');
    if(!t||!persistApi||!persistApi.repos||!persistApi.repos.tokens)return null;
    const k=cache?hashToken(t[1]):null,agora=Date.now();
    if(k){const c=memo.get(k);if(c&&c.ate>agora)return c.u;}
    const u=await persistApi.repos.tokens.resolve(t[1]).catch(()=>null);
    const ok=u&&u.is_admin&&u.token_kind==='admin'?u:null;
    if(k){memo.set(k,{u:ok,ate:agora+ADMIN_BUS.AUTH_TTL_MS});
      if(memo.size>64)for(const [kk,vv] of memo)if(vv.ate<=agora)memo.delete(kk);}
    return ok;}
  /** ⚠️ `rooms.getRoom` CRIA a sala se o código for deste shard: um código errado no painel materializaria
   *  uma sala fantasma com 15 bots. Aqui é sempre leitura do Map. */
  const salaLocal=code=>rooms.rooms.get(String(code||'').toUpperCase());
  const audita=(o)=>{const a=persistApi&&persistApi.repos&&persistApi.repos.audit;if(a)a.log(o);};

  /**
   * Abre o SSE do painel. Quatro headers e duas linhas que parecem enfeite e não são:
   * ⚠️ `X-Accel-Buffering: no` — o nginx bufferiza resposta proxeada por padrão, e sem este header os
   *    eventos chegam em blocos de 4 KB. O sintoma no painel é "nada por três minutos e aí 200 linhas de
   *    uma vez". Não dá para trocar por annotation: `proxy-buffering: off` valeria para o `/api` inteiro,
   *    e este Ingress divide o controller com dezenas de domínios.
   * ⚠️ `no-transform` — impede compressão no proxy. O `gzip-types` padrão do v0.47 não inclui
   *    `text/event-stream`, mas depender de um default que qualquer um muda num ConfigMap é a receita de
   *    "parou de funcionar e ninguém sabe por quê".
   * ⚠️ `flushHeaders()` — sem ele o Node segura o cabeçalho até o primeiro corpo, e o nginx nem abre a
   *    resposta para o navegador.
   * ⚠️ `setTimeout(0)` nos dois — o `server.requestTimeout` do Node mata requisição em 300 s por padrão.
   *    Funciona perfeito por quatro minutos em dev e morre em produção, sem erro nenhum.
   */
  function abreStream(req,res,auth){
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8',
      'Cache-Control':'no-cache, no-store, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
    if(res.flushHeaders)res.flushHeaders();
    req.setTimeout(0);res.setTimeout(0);
    if(res.socket&&res.socket.setNoDelay)res.socket.setNoDelay(true);
    const since=leCursor(new URL(req.url||'/','http://x').searchParams.get('since'));
    res.write(`retry: ${ADMIN_BUS.ESPERA_MS[0]}\n\n`);
    coletor.liga(res,{since,authorization:auth});
    const fim=()=>coletor.desliga(res);
    req.on('close',fim);req.on('error',fim);res.on('error',fim);}

  // Só as rotas de SALA são daqui. As de conta, parâmetro e auditoria vivem no router de persistência
  // (server/src/api/admin.js) — devolver `false` é o que as deixa seguir para lá.
  // ⚠️ `live`/`kpis` TÊM que entrar aqui. Ausentes, a requisição escorre para o router de persistência,
  // `PREFIXES` casa `/api/admin/`, nenhuma rota casa, e sai um 404 de JSON — o painel mostra "erro 404" e
  // NÃO há uma linha de log em lugar nenhum. É a mesma armadilha que docs/spec/admin.md:36-38 documenta
  // para o `PREFIXES`, vista do outro lado, e é por isso que o teste espera 403 e nunca 404.
  const MINHAS=/^\/(api|internal)\/admin\/(rooms(\/|$)|broadcast$|tunables$|live$|kpis$)/;
  return async function handleAdmin(req,res,p,sendJson,readJson){
    if(!MINHAS.test(p))return false;
    const interno=p.startsWith('/internal/');
    if(!persistApi){sendJson(res,503,{error:'admin_disabled',message:'servidor sem banco: painel indisponível'});return true;}
    const adm=await admin(req,interno);
    if(!adm){sendJson(res,403,{error:'forbidden',message:'acesso restrito'});return true;}
    const auth=req.headers.authorization||null;

    // ── FLUXO AO VIVO ────────────────────────────────────────────────────────
    // O fragmento interno é o anel DESTE pod, cru. Quem agrega, ordena e vira SSE é o coletor do pod que
    // recebeu o `/api/admin/live` — o mesmo desenho de `/internal/admin/rooms` logo abaixo.
    if(p==='/internal/admin/live'){
      if(req.method!=='GET'){sendJson(res,405,{error:'method_not_allowed',message:'método não permitido'});return true;}
      if(!bus){sendJson(res,200,{shard:config.shard,epoch:0,seq:0,perdidos:0,ev:[]});return true;}
      const q=new URL(req.url||'/','http://x').searchParams;
      sendJson(res,200,bus.desde(+q.get('since')||0,+q.get('epoch')||undefined));return true;}
    if(p==='/internal/admin/kpis'||p==='/api/admin/kpis'){
      if(req.method!=='GET'){sendJson(res,405,{error:'method_not_allowed',message:'método não permitido'});return true;}
      if(!coletor){sendJson(res,503,{error:'no_game',message:'este pod não tem salas'});return true;}
      sendJson(res,200,coletor.fragmento());return true;}
    if(p==='/api/admin/live'){
      if(req.method!=='GET'){sendJson(res,405,{error:'method_not_allowed',message:'método não permitido'});return true;}
      if(!coletor){sendJson(res,503,{error:'no_game',message:'este pod não tem salas'});return true;}
      // ⚠️ TETO POR POD com 503, e não 429: isto é uma afirmação de capacidade DESTE pod, e o painel
      // simplesmente reconecta e cai noutro (o `/api` é balanceado). Um 429 diria "espere", que é a
      // orientação errada. O rate limit de ABERTURA, esse sim, é por token.
      if(coletor.clientes.size>=ADMIN_BUS.MAX_STREAMS){
        sendJson(res,503,{error:'too_many_streams',message:'muitos painéis neste shard; tente de novo'});return true;}
      const lim=persistApi.limiter,tk=/^Bearer\s+(\S+)$/i.exec(auth||'');
      if(lim&&tk&&!lim.take('adm:live:'+hashToken(tk[1]).slice(0,24),ADMIN_BUS.ABRE)){
        sendJson(res,429,{error:'rate_limited',message:'muitas reconexões; espere um pouco'});return true;}
      abreStream(req,res,auth);return true;}

    // ── parâmetros: o irmão só é AVISADO; o valor vem do banco (ver server/src/tunables.js) ──
    if(interno&&p==='/internal/admin/tunables'&&req.method==='POST'){
      const t=persistApi.repos.tunables;
      const n=t?await t.load():0;
      sendJson(res,200,{ok:true,aplicados:n});return true;}

    // ── salas: agrega o que cada pod conhece ──
    if(p==='/api/admin/rooms'||p==='/internal/admin/rooms'){
      if(req.method!=='GET'){sendJson(res,405,{error:'method_not_allowed',message:'método não permitido'});return true;}
      const minhas=[...rooms.rooms.values()].map(r=>r.adminInfo());
      // ⚠️ O FRAGMENTO INTERNO SAI CRU. Ordená-lo seria trabalho jogado fora (quem agrega reordena tudo) e,
      // pior, sugeriria uma garantia que ele não dá — a ordem final é do agregador.
      if(interno){sendJson(res,200,{shard:config.shard,rooms:minhas});return true;}
      const rs=config.peers.length?await tellPeers(config.peers,{path:'/internal/admin/rooms',method:'GET',auth,log}):[];
      const outras=rs.filter(r=>r.body&&Array.isArray(r.body.rooms)).flatMap(r=>r.body.rooms);
      // ⚠️ A ordenação é DEPOIS do concat e no ponto de SAÍDA — nunca em `Room.adminInfo`. É isso que a
      // torna imune a rollout com versões mistas: quem ordena é sempre o pod que recebeu o pedido, e um
      // irmão em build antiga continua devolvendo o fragmento dele do mesmo jeito.
      // ⚠️ E o caminho de shard único (dev, sem peers) passa por AQUI, junto com o agregado: separá-los
      // fazia o dev sair numa ordem e a produção em outra.
      const ord=ordenaSalas(req,minhas.concat(outras));
      sendJson(res,200,{rooms:ord.lista,by:ord.by,dir:ord.dir,
        shards:[{shard:config.shard,ok:true},...rs.map(r=>({shard:r.body&&r.body.shard,peer:r.peer,ok:!r.error&&r.status===200}))]});
      return true;}

    // ── uma sala: detalhe, kick, fechar. SEMPRE pelo dono do código. ──
    const m=/^\/(api|internal)\/admin\/rooms\/([0-9A-Za-z]{4})(?:\/(kick|close))?$/.exec(p);
    if(m){
      const code=m[2].toUpperCase(),act=m[3];
      if(act?req.method!=='POST':req.method!=='GET'){sendJson(res,405,{error:'method_not_allowed',message:'método não permitido'});return true;}
      const body=act?await readJson(req):null;
      const dono=shardOf(code);
      if(!interno&&dono!==config.shard&&dono<config.shards&&config.peers.length){
        const r=await askPeers(config.peers,{path:`/internal/admin/rooms/${code}${act?'/'+act:''}`,method:req.method,body,auth,log});
        if(!r){sendJson(res,503,{error:'peer_unreachable',message:'o shard dessa sala não respondeu'});return true;}
        // Também aqui a ordem é aplicada no ponto de SAÍDA, depois do askPeers: ordenando no shard DONO,
        // uma sala cujo código pertence a um pod em build antiga voltaria sem ordem e sem sinal — e com 12
        // shards você acertaria 1 em 12 ao testar, que é a pior taxa possível para um bug ser notado.
        if(!act&&r.body&&r.body.room)r.body.room.players=ordenaJogadores(req,r.body.room.players);
        sendJson(res,r.status,r.body);return true;}
      const room=salaLocal(code);
      if(!room){sendJson(res,404,{error:'not_found',message:'sala não encontrada'});return true;}
      if(!act){const info=room.adminInfo({players:true});info.players=ordenaJogadores(req,info.players);
        sendJson(res,200,{room:info});return true;}
      if(act==='kick'){
        const slot=body.slot|0,s=room.sessions.get(slot);
        // O slot RECICLA entre a listagem e o clique: sem conferir o sessionId, o admin removeria quem
        // acabou de entrar no lugar de quem ele viu na tela.
        if(!s||(body.sessionId&&s.sessionId!==body.sessionId)){
          sendJson(res,409,{error:'slot_changed',message:'esse jogador já não está nesse slot'});return true;}
        const nome=s.name||'';
        s.error('ROOM',String(body.reason||'').slice(0,120)||'removido por um administrador');
        // ⚠️ `'left'`, não `'kicked'`: `Room.leave` grava `matches.cause`, cujo CHECK (migração 0003) não
        // conhece 'kicked' — a partida falharia com 23514 dentro de um `.catch(log.warn)`, em silêncio.
        // O kick fica registrado em `admin_audit`, que é onde ele importa.
        room.leave(s,'left');
        log.warn(`admin #${adm.id} removeu ${nome} da sala ${code}`);
        audita({adminId:adm.id,action:'kick',target:code,detail:{slot,name:nome},ip:null});
        sendJson(res,200,{ok:true,name:nome});return true;}
      const n=room.sessions.size;
      // ⚠️ `endRound` ANTES de despejar: sem ele a sala virava `over` MUDA — ninguém recebia `roundEnd`,
      // a partida de quem estava lá não era fechada pela persistência normal (só pelo `leave`), e o
      // jogador via um erro fatal em vez do placar. Fechar uma sala é um FIM DE RODADA por outro motivo,
      // e `endRound` é o ponto único que já sabe montar campeão, placar e destaques.
      room.endRound('closed');
      for(const s of [...room.sessions.values()]){s.error('ROOM','sala encerrada por um administrador');room.leave(s,'left');}
      room.endedAt=Date.now();
      log.warn(`admin #${adm.id} fechou a sala ${code} (${n} jogador(es))`);
      audita({adminId:adm.id,action:'room_close',target:code,detail:{kicked:n},ip:null});
      sendJson(res,200,{ok:true,kicked:n});return true;}

    // ── aviso global: DIFUNDE. Não há dono; todos aplicam. ──
    if(p==='/api/admin/broadcast'||p==='/internal/admin/broadcast'){
      if(req.method!=='POST'){sendJson(res,405,{error:'method_not_allowed',message:'método não permitido'});return true;}
      const b=await readJson(req);
      const text=limpa(b.text),level=b.level==='warn'?'warn':'info';
      if(!text){sendJson(res,400,{error:'bad_text',message:'escreva a mensagem'});return true;}
      const ttlMs=Math.max(2000,Math.min(60000,(b.ttlMs|0)||NOTICE.TTL_MS));
      let entregues=0,salas=0;
      for(const r of rooms.rooms.values()){const n=r.notice(text,{level,ttlMs});if(n){entregues+=n;salas++;}}
      // ⚠️ A auditoria vem ANTES do desvio dos peers, e é do pedido EXTERNO: o `/internal` é a mesma ação
      // vista de outro pod, e registrá-la de novo transformaria um aviso em três linhas de log idênticas.
      if(!interno){log.warn(`admin #${adm.id} mandou aviso global: ${JSON.stringify(text)}`);
        audita({adminId:adm.id,action:'broadcast',detail:{text,level},ip:null});}
      if(interno||!config.peers.length){sendJson(res,200,{shard:config.shard,delivered:entregues,rooms:salas});return true;}
      const rs=await tellPeers(config.peers,{path:'/internal/admin/broadcast',method:'POST',body:{text,level,ttlMs},auth,log});
      sendJson(res,200,{delivered:entregues+rs.reduce((t,r)=>t+(((r.body&&r.body.delivered)|0)),0),
        rooms:salas+rs.reduce((t,r)=>t+(((r.body&&r.body.rooms)|0)),0),
        shards:[{shard:config.shard,delivered:entregues,ok:true},
          ...rs.map(r=>({shard:r.body&&r.body.shard,peer:r.peer,delivered:(r.body&&r.body.delivered)|0,ok:!r.error&&r.status===200}))]});
      return true;}

    sendJson(res,404,{error:'not_found',message:'rota administrativa desconhecida'});return true;
  };
}

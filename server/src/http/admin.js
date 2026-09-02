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
import {NOTICE} from '@warspace/shared/constants.js';

/** Mesmo saneamento do chat da sala (Room.chat), feito UMA vez na rota e não uma vez por sala. */
const limpa=t=>String(t||'').normalize('NFKC').replace(/\p{C}/gu,'').replace(/\s+/g,' ').trim().slice(0,NOTICE.MAX_CHARS);

/**
 * @param {{rooms:any,config:any,log:any,persistApi:any}} o
 * @returns {(req:any,res:any,p:string,sendJson:Function,readJson:Function)=>Promise<boolean>}
 */
export function createAdminHttp({rooms,config,log,persistApi}){
  /** Só entra quem tem `is_admin` E um token do PAINEL (kind 'admin'). Ver server/src/api/admin.js. */
  async function admin(req){
    const t=/^Bearer\s+(\S+)$/i.exec(req.headers.authorization||'');
    if(!t||!persistApi||!persistApi.repos||!persistApi.repos.tokens)return null;
    const u=await persistApi.repos.tokens.resolve(t[1]).catch(()=>null);
    return u&&u.is_admin&&u.token_kind==='admin'?u:null;}
  /** ⚠️ `rooms.getRoom` CRIA a sala se o código for deste shard: um código errado no painel materializaria
   *  uma sala fantasma com 15 bots. Aqui é sempre leitura do Map. */
  const salaLocal=code=>rooms.rooms.get(String(code||'').toUpperCase());
  const audita=(o)=>{const a=persistApi&&persistApi.repos&&persistApi.repos.audit;if(a)a.log(o);};

  // Só as rotas de SALA são daqui. As de conta, parâmetro e auditoria vivem no router de persistência
  // (server/src/api/admin.js) — devolver `false` é o que as deixa seguir para lá.
  const MINHAS=/^\/(api|internal)\/admin\/(rooms(\/|$)|broadcast$|tunables$)/;
  return async function handleAdmin(req,res,p,sendJson,readJson){
    if(!MINHAS.test(p))return false;
    const interno=p.startsWith('/internal/');
    if(!persistApi){sendJson(res,503,{error:'admin_disabled',message:'servidor sem banco: painel indisponível'});return true;}
    const adm=await admin(req);
    if(!adm){sendJson(res,403,{error:'forbidden',message:'acesso restrito'});return true;}
    const auth=req.headers.authorization||null;

    // ── parâmetros: o irmão só é AVISADO; o valor vem do banco (ver server/src/tunables.js) ──
    if(interno&&p==='/internal/admin/tunables'&&req.method==='POST'){
      const t=persistApi.repos.tunables;
      const n=t?await t.load():0;
      sendJson(res,200,{ok:true,aplicados:n});return true;}

    // ── salas: agrega o que cada pod conhece ──
    if(p==='/api/admin/rooms'||p==='/internal/admin/rooms'){
      if(req.method!=='GET'){sendJson(res,405,{error:'method_not_allowed',message:'método não permitido'});return true;}
      const minhas=[...rooms.rooms.values()].map(r=>r.adminInfo());
      if(interno||!config.peers.length){sendJson(res,200,{shard:config.shard,rooms:minhas});return true;}
      const rs=await tellPeers(config.peers,{path:'/internal/admin/rooms',method:'GET',auth,log});
      const outras=rs.filter(r=>r.body&&Array.isArray(r.body.rooms)).flatMap(r=>r.body.rooms);
      sendJson(res,200,{rooms:minhas.concat(outras),
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
        sendJson(res,r.status,r.body);return true;}
      const room=salaLocal(code);
      if(!room){sendJson(res,404,{error:'not_found',message:'sala não encontrada'});return true;}
      if(!act){sendJson(res,200,{room:room.adminInfo({players:true})});return true;}
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

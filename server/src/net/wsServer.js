// ── WS: upgrade em /ws/<n>, join/resume/view/ping (JSON) e INPUT (binário), heartbeat, rate limit ──
// Join: hooks.onPlayerJoin (3 s; falha → modo unsaved) → sala (código ou automática) → slot → `room` (com o
// bloco `round`: tick de início e duração da rodada, de onde o cliente tira o relógio do espaço) →
// PLAYERS → snapshots. Queda: Room.detach (graça NET.RESUME_MS); `resume` religa o socket novo na
// Session antiga. Rate limit por sessão (inputs RATE_INPUTS/s burst RATE_BURST; JSON RATE_JSON/s):
// 3 violações em 10 s → error RATE + close 4429.
// @ts-check
import {randomUUID} from 'node:crypto';
import {WebSocketServer} from 'ws';
import {NET,WORLD,MODE,modeOf,VOICE} from '@warspace/shared/constants.js';
import {wireValues} from '@warspace/shared/tunables.js';
import {eggSkinFor} from '@warspace/shared/eggs.js';
import {PROTOCOL_VERSION,MSG,VOICE_UP_HEADER_BYTES} from '@warspace/shared/protocol/constants.js';
import {decodeInput,decodeVoiceUp,encodePong,createWriter} from '@warspace/shared/protocol/index.js';
import {Session} from './Session.js';
import {clientIp} from '../api/router.js';
import {sessionKey} from '../auth/tokens.js';
import {suggestNick} from '../auth/nick.js';
import {createOriginMatcher} from '../http/cors.js';
// MAX_PAYLOAD tem que caber o maior clipe de voz (VOICE.MAX_BYTES + cabeçalho): com os 4 KB de antes o `ws`
// derrubava o frame — e a conexão junto — antes de o servidor poder recusá-lo. A folga é pequena de propósito:
// o INPUT tem 10 bytes e o JSON de controle é minúsculo, então este teto existe só para a voz.
const JOIN_TIMEOUT_MS=3000,MAX_PAYLOAD=VOICE.MAX_BYTES+VOICE_UP_HEADER_BYTES+64,WS_PATH=/^\/ws(\/\d+)?\/?$/;
const withTimeout=(p,ms)=>new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),ms);Promise.resolve(p).then(v=>{clearTimeout(t);res(v);},e=>{clearTimeout(t);rej(e);});});
const unsaved=nick=>{const n=String(nick||'Viajante').slice(0,16)||'Viajante';
  // mesmo easter egg do caminho com banco (persist/hooks.js): ele depende só do nick
  return{ok:true,userId:null,nick:n,registered:false,skinId:eggSkinFor(n)||0,level:0,avatar:null,prefs:{},sessionId:null,unsaved:true};};
const NICK_RE=/^[\p{L}\p{N} _.\-]{2,16}$/u;
const cleanNick=n=>{const s=String(n??'').normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,16);return NICK_RE.test(s)?s:'Viajante';};
/** @param {{server:any,config:any,rooms:any,hooks:any,log:any,metrics:any}} o */
export function createWsServer({server,config,rooms,hooks,log,metrics}){
  const wss=new WebSocketServer({noServer:true,perMessageDeflate:false,maxPayload:MAX_PAYLOAD,clientTracking:false});
  // O WS não é sujeito a CORS — o handshake é um upgrade HTTP e sempre atravessou origens. Isso é o que
  // faz o cliente hospedado em portal conectar sem uma linha de servidor; é TAMBÉM o que deixa qualquer
  // site do mundo abrir socket aqui. O predicado é o MESMO do /api (duas listas divergiriam no primeiro
  // portal novo) e a estreia é em `warn`, porque a origem real de cada portal não é adivinhável: fecha-se
  // depois de LER o log. ⚠️ Origem AUSENTE é sempre aceita — o `ws` só a manda quando o chamador pede,
  // então é assim que a suíte inteira (game/br/host/roombots) continua conectando. E seja honesto sobre o
  // que isto compra: barra o drive-by de navegador, não barra script, que simplesmente omite o header.
  const origemOk=createOriginMatcher(config.allowedOrigins||[],log);
  const checaOrigem=config.wsOriginCheck||'off';
  /** @type {Set<Session>} sessões com socket */const live=new Set();
  const pongWriter=createWriter(64);let shuttingDown=false;
  server.on('upgrade',(req,socket,head)=>{
    const p=new URL(req.url||'/','http://x').pathname;
    if(!WS_PATH.test(p)||shuttingDown){socket.write(`HTTP/1.1 ${shuttingDown?503:404} ${shuttingDown?'Service Unavailable':'Not Found'}\r\nConnection: close\r\n\r\n`);socket.destroy();return;}
    const origem=req.headers.origin;
    if(origem&&checaOrigem!=='off'&&(config.allowedOrigins||[]).length&&!origemOk(origem)){
      if(checaOrigem==='warn')log.warn('ws: origem não listada',{origem});
      else{socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));});
  wss.on('connection',(ws,req)=>{
    let s=new Session({ws,metrics,log,remoteAddr:clientIp(req),userAgent:req.headers['user-agent']||null});live.add(s);
    const roomMsg=room=>({t:'room',code:room.code,shard:room.shard,slot:s.slot,sessionId:s.sessionId,resumeToken:s.resumeToken,protocol:PROTOCOL_VERSION,
      tick:room.sim.tick,world:{w:WORLD.w,h:WORLD.h},round:room.roundInfo(),
      // Os parâmetros do /admin que o CLIENTE lê (câmera, arte da estrela). Meia dúzia de números num JSON
      // que já é mandado uma vez por join — o mesmo argumento do `days` em `Room.roundInfo`, e pelo mesmo
      // motivo: sem isto o painel mudaria o número só no servidor e o jogo enquadraria diferente dos dois
      // lados, em silêncio. `Room.broadcastPhase` reemite, para valer no meio da rodada.
      tun:wireValues(),
      mode:room.modeId,teamSize:room.teamSize,cap:room.max,team:(room.sim.players.get(s.slot)||{team:-1}).team,
      private:!!room.private,host:room.isHost(s)});   // JSON: modo, equipe e dono da sala não custam versão de protocolo
    const rate=()=>{if(s.violation())s.error('RATE','muitas mensagens; conexão encerrada');};
    async function join(msg){
      if(s.joining)return;
      if(shuttingDown)return s.error('ROOM_RESTART','servidor reiniciando; tente de novo em instantes');
      if(msg.protocol!=null&&msg.protocol!==PROTOCOL_VERSION)return s.error('VERSION',`protocolo ${msg.protocol} incompatível (servidor ${PROTOCOL_VERSION}); recarregue a página`);
      s.joining=true;
      try{
        if(msg.view)s.setView(msg.view.w,msg.view.h,msg.view.z);
        const fallbackNick=cleanNick(msg.fallbackNick);let res;
        try{res=await withTimeout(hooks.onPlayerJoin({token:msg.token,fallbackNick,remoteAddr:s.remoteAddr,userAgent:s.userAgent,roomCode:msg.room||null}),JOIN_TIMEOUT_MS);}
        catch(e){log.warn(`join sem persistência (${s.remoteAddr}): ${e&&e.message}`);res=unsaved(fallbackNick);}
        if(!res)res=unsaved(fallbackNick);
        if(s.ws!==ws||ws.readyState!==1)return;                       // fechou enquanto esperava
        if(!res.ok)return s.error(res.code||'AUTH',res.message||'não autorizado',res.suggestion?{suggestion:res.suggestion}:undefined);
        // modo e tamanho de equipe: id desconhecido cai no Livre (modeOf), tamanho inválido cai no 1º válido do modo
        const mode=modeOf(msg.mode|0),teamSize=mode.teamSizes.includes(msg.teamSize|0)?msg.teamSize|0:mode.teamSizes[0];
        const party=typeof msg.party==='string'&&msg.party?msg.party.toUpperCase().slice(0,8):null;
        const opts={mode:mode.id,teamSize};
        let room=null;
        if(msg.room){room=rooms.getRoom(msg.room,opts);
          // `acceptsJoin` é a porta única: cobre cheia, terminada E partida já em andamento (Battle Royale)
          if(room&&!room.acceptsJoin()){if(res.sessionId)hooks.onMatchEnd({sessionId:res.sessionId,cause:'left',score:0,maxMass:0,durationMs:0});return s.error('FULL',`sala ${room.code} indisponível`);}
          if(room&&room.modeId!==mode.id){if(res.sessionId)hooks.onMatchEnd({sessionId:res.sessionId,cause:'left',score:0,maxMass:0,durationMs:0});return s.error('MODE',`a sala ${room.code} é de outro modo`);}}
        const nick=res.nick||fallbackNick;
        // Sair da sala ANTES de escolher a próxima: se ele já está numa sala, o próprio nick dele está em
        // `usedNicks` e o matchmaking descartaria a sala em que ele acabou de jogar.
        if(s.room)s.room.leave(s,'left');                            // join de novo (depois de morrer): sai da sala atual
        if(!room)room=rooms.findOrCreateRoom({...opts,nick,userId:res.userId??null,key:sessionKey(msg.token)});
        // ⚠️ NICK ÚNICO POR SALA — desde a 0009 é a ÚNICA regra de unicidade que existe, e por isso ela
        // deixou de ser rara: dois "Messi" agora são legais no mundo. Dois planetas com o mesmo nome
        // deixam o kill feed, o chat e o placar mentindo, então a recusa fica. Quem entrou pelo automático
        // nunca chega aqui (`findOrCreateRoom` já pulou a sala); quem chega é quem veio por CÓDIGO — e o
        // caminho de EQUIPE é exatamente esse, porque `Party.start` manda todo mundo para o mesmo código.
        // Daí a `suggestion`: sem ela o cliente só tinha um toast e nenhuma saída.
        if(room.nickTaken(nick)){
          if(res.sessionId)hooks.onMatchEnd({sessionId:res.sessionId,cause:'left',score:0,maxMass:0,durationMs:0});
          return s.error('NICK_IN_ROOM',`já há alguém chamado "${nick}" nessa sala`,{nick,suggestion:suggestNick(nick)});}
        // BANIDO pelo dono da sala. Fica AQUI, ao lado do nick, e não em `acceptsJoin()`: aquele é chamado
        // pelo matchmaking e refletido em `info().open`, onde ainda não há jogador nenhum para identificar.
        if(room.banned({userId:res.userId??null,key:sessionKey(msg.token)})){
          if(res.sessionId)hooks.onMatchEnd({sessionId:res.sessionId,cause:'left',score:0,maxMass:0,durationMs:0});
          return s.error('ROOM_BANNED','você foi banido dessa sala');}
        s.sessionId=res.sessionId||randomUUID();s.userId=res.userId??null;s.key=sessionKey(msg.token);s.name=nick;s.unsaved=!!res.unsaved;
        s.level=res.level|0;s.avatar=res.avatar||null;s.country=res.country||null;
        room.join(s,{name:s.name,registered:!!res.registered,skinId:res.skinId|0,sessionId:s.sessionId,userId:s.userId,level:s.level,country:s.country,party});
        s.sendJson(roomMsg(room));room.sendPlayers(s);room.sendHost(s);
        if(room.avatars&&room.avatars.size)room.broadcastAvatars();   // quem entra precisa saber quem já tem foto
        room.broadcastFlags();                                        // e quem já está na sala precisa ver a bandeira do novato
        log.info(`${s.name} entrou na sala ${room.code} (slot ${s.slot}, ${room.humanCount}/${room.max}${s.unsaved?', sem persistência':''})`);
      }catch(e){log.error('join:',e);s.error('ROOM','falha ao entrar na sala');}
      finally{s.joining=false;}}
    function resume(msg){
      const old=rooms.findSession(msg.sessionId);
      if(!old||!old.room||old.resumeToken!==msg.resumeToken||(!old.ws&&Date.now()-old.disconnectedAt>NET.RESUME_MS))return s.error('ROOM_EXPIRED','sessão expirada; entre de novo');
      const prev=old.ws;live.delete(s);if(s.room)s.room.leave(s,'left');s=old;live.add(old);
      old.room.resume(old,ws);if(msg.view)old.setView(msg.view.w,msg.view.h,msg.view.z);
      if(prev&&prev!==ws){try{prev.terminate();}catch{}}                 // outra aba roubou a sessão
      old.sendJson(roomMsg(old.room));old.room.sendPlayers(old);const dead=old.room.deadMsg(old.slot);if(dead)old.sendJson(dead);
      log.info(`${old.name} retomou a sessão na sala ${old.room.code} (slot ${old.slot})`);}
    function onJson(data){
      if(!s.json.take())return rate();metrics.msgIn();
      let msg;try{msg=JSON.parse(data.toString('utf8'));}catch{return;}if(!msg||typeof msg!=='object')return;
      switch(msg.t){
        case 'join':join(msg);break;
        case 'resume':resume(msg);break;
        case 'view':s.setView(msg.w,msg.h,msg.z);break;   // `z` é o zoom manual da roda: clampado pela MASSA no snapshot, nunca aqui
        case 'ping':s.sendCopy(encodePong(pongWriter,{clientTime:Number(msg.c)>>>0,serverTick:s.room?s.room.sim.tick:0}));break;
        case 'chat':if(s.room&&s.slot>=0)s.room.chat(s,msg.text,msg.scope);break;   // `scope` só é lido de quem já morreu (ver Room._escopoFala)
        case 'talk':if(s.room&&s.slot>=0)s.room.talkState(s,!!msg.on);break;   // push-to-talk abriu/fechou (o clipe vem depois, em binário)
        // DENÚNCIA de um jogador. Não é ação de dono nem de admin: qualquer um pode, contra qualquer um —
        // é o par do SILENCIAR, que é local (client/src/game/index.js). Aqui só se REGISTRA: ninguém é
        // expulso por denúncia, senão a denúncia vira arma. Ver `Room.report`.
        case 'report':if(s.room&&s.slot>=0)s.room.report(s,msg.slot|0);break;
        // SAIR de propósito ≠ cair a conexão. O `close` do socket cai em `Room.detach`, que segura a sessão
        // por NET.RESUME_MS (10 s) esperando um `resume` — certíssimo para quem perdeu a rede, e errado para
        // quem apertou "cancelar": no lobby do battle royale o slot continuava ocupado, contava como humano
        // na largada e o jogador era posto no mapa parado. Quem avisa que está indo embora vai embora agora.
        // AÇÕES DO DONO DA SALA. Vão por WS, e não por HTTP, porque o dono já está DENTRO da sala: o socket
        // dele foi aberto em `/ws/<shardOf(code)>`, ou seja já está no shard que conhece a sala. Não há o que
        // rotear — a armadilha do `askPeers` simplesmente não existe deste lado. E a identidade já foi
        // resolvida no join, então não há um segundo Bearer para validar.
        case 'room':{
          if(!s.room||s.slot<0||!s.room.isHost(s))break;
          const r=s.room;
          if(msg.act==='kick'||msg.act==='ban')r.hostKick(msg.pid|0,{ban:msg.act==='ban'});
          r.sendHost(s);break;}
        case 'quit':if(s.room&&s.slot>=0)s.room.leave(s,'left');break;
        // trocar de câmera só faz sentido para quem já morreu: quem está vivo tem as próprias peças
        case 'spectate':{if(!s.room||s.slot<0)break;const gp=s.room.sim.players.get(s.slot);
          if(gp&&gp.dead)s.room.spectatePick(s,{slot:msg.slot|0||-1,dir:msg.dir|0});break;}}}
    /**
     * Binário: despacha pelo PRIMEIRO BYTE. Antes só havia INPUT, então bastava compará-lo; agora o cliente
     * também sobe clipes de voz (VOICE_UP), que são bytes opacos — o servidor valida e reenvia sem decodificar.
     */
    function onInput(data){
      if(!s.inputs.take())return rate();metrics.msgIn();
      if(!s.room||s.slot<0||data.length<1)return;
      if(data[0]===MSG.INPUT){let inp;try{inp=decodeInput(data);}catch{return;}s.room.sim.applyInput(s.slot,inp);return;}
      if(data[0]===MSG.VOICE_UP){let v;try{v=decodeVoiceUp(data);}catch{return;}s.room.voice(s,v);}}
    ws.on('message',(data,isBinary)=>{s.lastPong=Date.now();if(isBinary)onInput(data);else onJson(data);});
    ws.on('pong',()=>{s.lastPong=Date.now();});
    ws.on('error',e=>log.debug('ws:',e&&e.message));
    ws.on('close',()=>{if(s.ws!==ws)return;live.delete(s);if(s.room)s.room.detach(s);else s.ws=null;});
  });
  // ── heartbeat ──
  const hb=setInterval(()=>{const now=Date.now();for(const s of live){const ws=s.ws;if(!ws)continue;
    if(now-s.lastPong>NET.DEAD_MS){try{ws.terminate();}catch{}continue;}if(ws.readyState===1){try{ws.ping();}catch{}}}},NET.HEARTBEAT_MS);hb.unref();
  function close(){shuttingDown=true;clearInterval(hb);for(const s of live){const ws=s.ws;if(!ws)continue;try{ws.close(1001,'shutdown');}catch{}}wss.close();}
  return{wss,live,close,get shuttingDown(){return shuttingDown;}};
}

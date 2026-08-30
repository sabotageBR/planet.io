// ── ROOM MANAGER: salas deste shard, agendamento, ceifador e agregação com os irmãos ──
// Sala que terminou a rodada (`over`) sai da distribuição (ninguém entra mais) e é removida BREAK_MS depois.
// findOrCreateRoom → a sala mais cheia com vaga (agrupa em vez de espalhar); getRoom(code) entra por
// código e cria se o código for deste shard. Sem humanos: para o laço após ROOM.STOP_AFTER_MS e
// remove após ROOM.REMOVE_AFTER_MS; ao voltar a ser usada, religa e completa os bots.
// @ts-check
import {randomInt} from 'node:crypto';
import {ROOM,ROUND,MODE,modeOf} from '@warspace/shared/constants.js';
import {Room} from './Room.js';
import {newCode,normalizeCode,shardOf} from './codes.js';
import {fetchPeerRooms} from '../http/peers.js';
/** @param {{config:any,hooks:any,log:any,metrics:any,scheduler:any}} o */
export function createRoomManager({config,hooks,log,metrics,scheduler,botChat=null}){
  /** @type {Map<string,Room>} */const rooms=new Map();
  const onRewards=(sessionId,rewards)=>{const s=findSession(sessionId);if(s)s.deliverRewards(rewards);};
  function start(room){if(room.running)return;room.start();scheduler.add(room);}
  function stop(room){room.stop();scheduler.remove(room);}
  function create(code,{mode=MODE.FREE,teamSize=1,roundTicks=null,private:priv=false,hostUserId=null,hostNick=null}={}){
    const room=new Room({code,shard:config.shard,seed:randomInt(1,0x7fffffff),hooks,log,metrics,config,onRewards,mode,teamSize,botChat,
      roundTicks,private:priv,hostUserId,hostNick});
    rooms.set(code,room);start(room);
    log.info(`sala criada: ${code} ${modeOf(mode).key}${teamSize>1?`/${teamSize}`:''}${priv?' privada':''}${hostNick?` de ${hostNick}`:''} (${rooms.size} sala(s))`);return room;}
  /**
   * A sala mais cheia que ainda ACEITA gente (`acceptsJoin`: sem vaga, terminada ou já em partida ficam de fora),
   * dentro do mesmo modo e tamanho de equipe — agrupa em vez de espalhar, que é o que faz a espera do
   * Battle Royale encher rápido. Nenhuma dá: cria uma.
   * `nick` (opcional) exclui as salas onde esse nome já está em uso: nick é único POR SALA.
   */
  function findOrCreateRoom({mode=MODE.FREE,teamSize=1,nick=null,userId=null,key=null}={}){
    const quem={userId,key};
    let best=null;
    for(const r of rooms.values()){if(r.modeId!==mode||(mode!==MODE.FREE&&r.teamSize!==teamSize))continue;
      // sala PRIVADA está fora do automático: é para isso que ela existe. Entra-se por código, que é o convite.
      if(r.private)continue;
      // e quem foi banido dela não pode ser jogado de volta lá — ficaria preso num erro, sem entender por quê
      if(r.banned(quem))continue;
      // ⚠️ pula a sala onde o nick JÁ ESTÁ EM USO. Duas pessoas com o mesmo nome na mesma sala é o que a
      // regra proíbe, e o JOGAR (AUTO) é justamente quem não escolheu a sala — barrá-lo aqui seria fechar a
      // porta por uma coincidência que o próprio matchmaking pode evitar mandando-o para a sala do lado.
      if(nick&&r.nickTaken(nick))continue;
      if(r.acceptsJoin()&&(!best||r.humanCount>best.humanCount))best=r;}
    if(best){start(best);return best;}
    let code=newCode(config.shard);while(rooms.has(code))code=newCode(config.shard);return create(code,{mode,teamSize});}
  /** Sala pelo código: existente (mesmo cheia — quem chama decide), ou nova se o código é deste shard; null se é de outro shard/inválido. */
  function getRoom(code,opts={}){const c=normalizeCode(code);if(!c)return null;const r=rooms.get(c);if(r)return r.over?null:(start(r),r);   // sala que explodiu: quem chama cai na automática
    if(shardOf(c)!==config.shard)return null;return create(c,opts);}
  // ⚠️ O filtro de PRIVADA mora aqui, e não em `Room.info()`, e isso tira a sala de TRÊS lugares de uma vez:
  // `/api/rooms`, `/internal/rooms` (logo, da agregação dos irmãos) e `/api/auto`, que filtra `allRooms()`.
  // Em `info()` ele quebraria o painel do administrador, que é construído em cima do mesmo objeto.
  const listRooms=()=>[...rooms.values()].filter(r=>!r.private).map(r=>r.info());
  async function allRooms(){const mine=listRooms();if(!config.peers.length)return mine;return mine.concat(await fetchPeerRooms(config.peers,{log}));}
  function findSession(sessionId){if(!sessionId)return null;for(const r of rooms.values())for(const s of r.sessions.values())if(s.sessionId===sessionId)return s;return null;}
  const playerCount=()=>{let n=0;for(const r of rooms.values())n+=r.humanCount;return n;};
  // ── ceifador (1 s): expira sessões em graça; para/remove salas vazias ──
  const timer=setInterval(()=>{const now=Date.now();
    for(const r of rooms.values()){r.housekeeping(now);
      if(r.over&&now-r.endedAt>ROUND.BREAK_MS+5000){for(const s of [...r.sessions.values()])r.leave(s,'left');stop(r);rooms.delete(r.code);log.info(`sala ${r.code} encerrada (rodada terminada)`);continue;}
      if(r.humanCount>0)continue;const idle=now-r.lastHumanAt;
      if(r.running&&idle>=ROOM.STOP_AFTER_MS){stop(r);log.info(`sala ${r.code} parada (sem humanos há ${Math.round(idle/1000)} s)`);}
      // ⚠️ só o REMOVE é adiado numa sala com dono. Parar continua valendo (e `getRoom` religa), o que de
      // quebra congela o relógio da rodada enquanto ninguém está lá; o que não pode é a sala privada ser
      // APAGADA em 35 s — ela existe justamente para esperar os amigos chegarem pelo link.
      if(!r.running&&idle>=ROOM.REMOVE_AFTER_MS&&now>=r.holdUntil){rooms.delete(r.code);log.info(`sala ${r.code} removida`);}}},1000);timer.unref();
  function close(){clearInterval(timer);for(const r of rooms.values())stop(r);}
  return{rooms,create,findOrCreateRoom,getRoom,listRooms,allRooms,findSession,playerCount,start,stop,close};
}

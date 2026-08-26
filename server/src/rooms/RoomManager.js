// ── ROOM MANAGER: salas deste shard, agendamento, ceifador e agregação com os irmãos ──
// Sala que terminou a rodada (`over`) sai da distribuição (ninguém entra mais) e é removida BREAK_MS depois.
// findOrCreateRoom → a sala mais cheia com vaga (agrupa em vez de espalhar); getRoom(code) entra por
// código e cria se o código for deste shard. Sem humanos: para o laço após ROOM.STOP_AFTER_MS e
// remove após ROOM.REMOVE_AFTER_MS; ao voltar a ser usada, religa e completa os bots.
// @ts-check
import {randomInt} from 'node:crypto';
import {ROOM,ROUND} from '@planet/shared/constants.js';
import {Room} from './Room.js';
import {newCode,normalizeCode,shardOf} from './codes.js';
import {fetchPeerRooms} from '../http/peers.js';
/** @param {{config:any,hooks:any,log:any,metrics:any,scheduler:any}} o */
export function createRoomManager({config,hooks,log,metrics,scheduler}){
  /** @type {Map<string,Room>} */const rooms=new Map();
  const onRewards=(sessionId,rewards)=>{const s=findSession(sessionId);if(s)s.deliverRewards(rewards);};
  function start(room){if(room.running)return;room.start();scheduler.add(room);}
  function stop(room){room.stop();scheduler.remove(room);}
  function create(code){const room=new Room({code,shard:config.shard,seed:randomInt(1,0x7fffffff),hooks,log,metrics,config,onRewards});rooms.set(code,room);start(room);
    log.info(`sala criada: ${code} (${rooms.size} sala(s))`);return room;}
  /** A sala mais cheia com vaga (salas que já explodiram ficam de fora), ou uma nova. */
  function findOrCreateRoom(){let best=null;for(const r of rooms.values())if(!r.over&&!r.isFull()&&(!best||r.humanCount>best.humanCount))best=r;
    if(best){start(best);return best;}
    let code=newCode(config.shard);while(rooms.has(code))code=newCode(config.shard);return create(code);}
  /** Sala pelo código: existente (mesmo cheia — quem chama decide), ou nova se o código é deste shard; null se é de outro shard/inválido. */
  function getRoom(code){const c=normalizeCode(code);if(!c)return null;const r=rooms.get(c);if(r)return r.over?null:(start(r),r);   // sala que explodiu: quem chama cai na automática
    if(shardOf(c)!==config.shard)return null;return create(c);}
  const listRooms=()=>[...rooms.values()].map(r=>r.info());
  async function allRooms(){const mine=listRooms();if(!config.peers.length)return mine;return mine.concat(await fetchPeerRooms(config.peers,{log}));}
  function findSession(sessionId){if(!sessionId)return null;for(const r of rooms.values())for(const s of r.sessions.values())if(s.sessionId===sessionId)return s;return null;}
  const playerCount=()=>{let n=0;for(const r of rooms.values())n+=r.humanCount;return n;};
  // ── ceifador (1 s): expira sessões em graça; para/remove salas vazias ──
  const timer=setInterval(()=>{const now=Date.now();
    for(const r of rooms.values()){r.housekeeping(now);
      if(r.over&&now-r.endedAt>ROUND.BREAK_MS+5000){for(const s of [...r.sessions.values()])r.leave(s,'left');stop(r);rooms.delete(r.code);log.info(`sala ${r.code} encerrada (rodada terminada)`);continue;}
      if(r.humanCount>0)continue;const idle=now-r.lastHumanAt;
      if(r.running&&idle>=ROOM.STOP_AFTER_MS){stop(r);log.info(`sala ${r.code} parada (sem humanos há ${Math.round(idle/1000)} s)`);}
      if(!r.running&&idle>=ROOM.REMOVE_AFTER_MS){rooms.delete(r.code);log.info(`sala ${r.code} removida`);}}},1000);timer.unref();
  function close(){clearInterval(timer);for(const r of rooms.values())stop(r);}
  return{rooms,findOrCreateRoom,getRoom,listRooms,allRooms,findSession,playerCount,start,stop,close};
}

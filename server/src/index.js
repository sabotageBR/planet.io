// ── COMPOSITION ROOT: config → log → db → migrate → persistência → salas/scheduler → http+ws → SIGTERM ──
// ROLE=both (padrão) | game (sem API da persistência; hooks continuam) | api (sem ws/salas).
// startServer(overrides) sobe tudo e devolve {port, rooms, …, close()} (testes usam port:0).
// @ts-check
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {PROTOCOL_VERSION} from '@planet/shared/protocol/constants.js';
import {config as baseConfig} from './config.js';
import {createLogger} from './log.js';
import {createDb} from './db/pool.js';
import {migrate} from './db/migrate.js';
import {createPersistence} from './persist/hooks.js';
import {createApi,healthFields} from './api/index.js';
import {NOOP_HOOKS} from './sim/hooks.js';
import {createMetrics} from './metrics.js';
import {Scheduler} from './loop.js';
import {createRoomManager} from './rooms/RoomManager.js';
import {createWsServer} from './net/wsServer.js';
import {createHttpHandler} from './http/api.js';
/** @param {Partial<typeof baseConfig>} [overrides] */
export async function startServer(overrides={}){
  const cfg=Object.freeze({...baseConfig,...overrides});
  const log=createLogger({level:cfg.logLevel,shard:cfg.shard}),metrics=createMetrics();
  // ── banco e persistência (opcionais: sem DATABASE_URL ou com o banco fora o jogo roda em modo unsaved) ──
  let db=null,persist=null,hooks=NOOP_HOOKS,persistApi=null;
  if(cfg.databaseUrl){
    db=createDb(cfg,log);
    if(cfg.migrateOnStart){try{await migrate(db,log);}catch(e){log.error('migração falhou (seguindo sem banco):',e&&e.message);}}
    persist=createPersistence({db,log,config:cfg});hooks=persist.hooks;
    if(cfg.role!=='game')persistApi=createApi({db,log,config:cfg,persist});
  }else log.warn('DATABASE_URL vazio: jogo sem persistência (rewards saved:false)');
  // ── salas + laço ──
  const game=cfg.role!=='api';
  const scheduler=game?new Scheduler({metrics,log}):null;
  const rooms=game?createRoomManager({config:cfg,hooks,log,metrics,scheduler}):null;
  const health=()=>({ok:true,shard:cfg.shard,role:cfg.role,rooms:rooms?rooms.rooms.size:0,players:rooms?rooms.playerCount():0,...metrics.snapshot(),
    ...(db?healthFields({db,persist}):{db:'none',queue:0}),protocol:PROTOCOL_VERSION});
  // ── http + ws ──
  const server=http.createServer(createHttpHandler({config:cfg,rooms,persistApi,health,log}));
  server.keepAliveTimeout=65000;
  const ws=game?createWsServer({server,config:cfg,rooms,hooks,log,metrics}):null;
  await new Promise((res,rej)=>{server.once('error',rej);server.listen(cfg.port,()=>{server.off('error',rej);res(undefined);});});
  const addr=server.address(),port=typeof addr==='object'&&addr?addr.port:cfg.port;
  log.info(`planet.io v2 | shard ${cfg.shard}/${cfg.shards} | porta ${port} | role ${cfg.role} | db ${db?(db.health.down?'down':'ok'):'nenhum'}`+
    (cfg.staticDir?` | estáticos ${cfg.staticDir}`:'')+(cfg.peers.length?` | peers ${cfg.peers.join(', ')}`:''));
  // ── encerramento: para de aceitar, fecha ws, onMatchEnd('shutdown') via persistência, fecha pool ──
  let closing=null;
  function close(){if(closing)return closing;closing=(async()=>{
    if(ws)ws.close();
    server.close();if(typeof server.closeAllConnections==='function')server.closeAllConnections();
    if(rooms)rooms.close();if(scheduler)scheduler.stop();
    if(persist){try{await persist.shutdown();}catch(e){log.warn('shutdown da persistência falhou:',e&&e.message);}}
    if(db){try{await db.close();}catch{}}
    log.info('encerrado');})();return closing;}
  return{port,server,config:cfg,log,metrics,scheduler,rooms,db,persist,hooks,ws,health,close};
}
// ── CLI: node server/src/index.js ────────────────────────────────────────────
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const srv=await startServer();
  const stop=async sig=>{srv.log.info(`${sig}: encerrando`);const t=setTimeout(()=>process.exit(1),15000);t.unref();await srv.close();process.exit(0);};
  process.once('SIGTERM',()=>stop('SIGTERM'));process.once('SIGINT',()=>stop('SIGINT'));
}

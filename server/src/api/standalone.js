// ── Entrada de dev: só a API em PORT (curl sem o servidor do jogo) ─────────────
// node --env-file=../.env src/api/standalone.js
// @ts-check
import http from 'node:http';
import {config} from '../config.js';
import {log} from '../log.js';
import {createDb} from '../db/pool.js';
import {migrate} from '../db/migrate.js';
import {createPersistence} from '../persist/hooks.js';
import {createApi} from './index.js';
import {sendJson} from './router.js';
import {createCors} from '../http/cors.js';
const db=createDb(config,log);
if(config.migrateOnStart){try{await migrate(db,log);}catch(e){log.error('migração falhou (seguindo sem banco):',e.message);}}
const persist=createPersistence({db,log,config});
const api=createApi({db,log,config,persist});
const cors=createCors({config,log});   // mesma camada do handler completo (ver http/cors.js)
const server=http.createServer(async(req,res)=>{
  try{
    if(cors(req,res,new URL(req.url||'/','http://x').pathname))return;
    if(await api(req,res))return;
    if(req.url==='/healthz')return sendJson(res,200,{ok:true,shard:config.shard,mode:'api-standalone',...api.healthFields()});
    sendJson(res,404,{error:'not_found',message:'rota não encontrada (só /api/auth|me|skins|ranking aqui)'});
  }catch(e){log.error('http:',e);if(!res.headersSent)sendJson(res,500,{error:'internal',message:'erro interno'});}
});
const port=Number(process.env.API_PORT||config.port);
server.listen(port,()=>log.info(`API standalone em http://localhost:${port} (shard ${config.shard}, db ${db.health.down?'down':'ok'})`));
const stop=async sig=>{log.info(`${sig}: encerrando`);server.close();await persist.shutdown();await db.close();process.exit(0);};
process.once('SIGTERM',()=>stop('SIGTERM'));process.once('SIGINT',()=>stop('SIGINT'));

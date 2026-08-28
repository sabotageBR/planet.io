// ── CONFIG (env → objeto único; defaults de dev) ──────────────────────────────
// @ts-check
import {ROUND,SURVIVAL} from '@planet/shared/constants.js';
const env=process.env;
const str=(k,d)=>env[k]!=null&&env[k]!==''?env[k]:d;
const num=(k,d)=>{const v=Number(env[k]);return env[k]!=null&&env[k]!==''&&Number.isFinite(v)?v:d;};
const bool=(k,d)=>env[k]==null||env[k]===''?d:/^(1|true|yes|on)$/i.test(env[k]);
const list=(k)=>str(k,'').split(',').map(s=>s.trim()).filter(Boolean);
// identidade do shard: no k8s vem do nome do pod do StatefulSet (planet-server-2 → 2)
const podName=str('POD_NAME','');
const shard=env.SHARD!=null&&env.SHARD!==''?num('SHARD',0):Number((podName.match(/-(\d+)$/)||[,0])[1])||0;
const shards=Math.max(1,num('SHARDS',1));
const port=num('PORT',3001);
const peerHost=str('PEER_HOST','');const peerName=str('PEER_NAME','planet-server');
// PEERS explícito (dev) ou derivado do headless service do StatefulSet
const peers=env.PEERS?list('PEERS')
  :Array.from({length:shards},(_,i)=>i).filter(i=>i!==shard).map(i=>peerHost?`${peerName}-${i}.${peerHost}:${port}`:null).filter(Boolean);
const role=str('ROLE','both');
if(!['game','api','both'].includes(role))throw new Error(`ROLE inválido: ${role} (game|api|both)`);
export const config=Object.freeze({
  databaseUrl:str('DATABASE_URL',''),
  dbPoolMax:Math.max(1,num('DB_POOL_MAX',5)),
  migrateOnStart:bool('MIGRATE_ON_START',false),
  port,shard,shards,podName,peerHost,peerName,peers,
  roomMax:num('ROOM_MAX',30),
  roomBots:num('ROOM_BOTS',15),
  roundTicks:Math.max(60,num('ROUND_TICKS',ROUND.TICKS)),   // duração da rodada em ticks (os testes usam rodadas curtas)
  warmupTicks:Math.max(60,num('WARMUP_TICKS',SURVIVAL.WARMUP_TICKS)),   // espera do Sobrevivência (mesmo motivo: testar sem esperar 45 s)
  logLevel:str('LOG_LEVEL','info'),
  role,
  staticDir:str('STATIC_DIR',''),
  signupCoins:num('SIGNUP_COINS',500),
  tz:str('DB_TZ','America/Sao_Paulo'),
});
export default config;

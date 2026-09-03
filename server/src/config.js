// ── CONFIG (env → objeto único; defaults de dev) ──────────────────────────────
// @ts-check
import {ROUND,BR,BOT_LLM,ROOM} from '@warspace/shared/constants.js';
const env=process.env;
const str=(k,d)=>env[k]!=null&&env[k]!==''?env[k]:d;
const num=(k,d)=>{const v=Number(env[k]);return env[k]!=null&&env[k]!==''&&Number.isFinite(v)?v:d;};
const bool=(k,d)=>env[k]==null||env[k]===''?d:/^(1|true|yes|on)$/i.test(env[k]);
const list=(k)=>str(k,'').split(',').map(s=>s.trim()).filter(Boolean);
// identidade do shard: no k8s vem do nome do pod do StatefulSet (warspace-server-2 → 2)
const podName=str('POD_NAME','');
const shard=env.SHARD!=null&&env.SHARD!==''?num('SHARD',0):Number((podName.match(/-(\d+)$/)||[,0])[1])||0;
const shards=Math.max(1,num('SHARDS',1));
const port=num('PORT',3001);
const peerHost=str('PEER_HOST','');const peerName=str('PEER_NAME','warspace-server');
// PEERS explícito (dev) ou derivado do headless service do StatefulSet
const peers=env.PEERS?list('PEERS')
  :Array.from({length:shards},(_,i)=>i).filter(i=>i!==shard).map(i=>peerHost?`${peerName}-${i}.${peerHost}:${port}`:null).filter(Boolean);
const role=str('ROLE','both');
if(!['game','api','both'].includes(role))throw new Error(`ROLE inválido: ${role} (game|api|both)`);
// Origem do WS: o mesmo molde do ROLE (valida no boot, não em runtime). São TRÊS estados de propósito —
// o navegador sempre manda `Origin` no handshake, então uma lista incompleta não vira erro de CORS: vira
// "o jogo não conecta". `warn` existe para MEDIR a lista real antes de fechá-la. Ver http/cors.js.
const wsOriginCheck=str('WS_ORIGIN_CHECK','off');
if(!['off','warn','on'].includes(wsOriginCheck))throw new Error(`WS_ORIGIN_CHECK inválido: ${wsOriginCheck} (off|warn|on)`);
export const config=Object.freeze({
  databaseUrl:str('DATABASE_URL',''),
  dbPoolMax:Math.max(1,num('DB_POOL_MAX',5)),
  migrateOnStart:bool('MIGRATE_ON_START',false),
  port,shard,shards,podName,peerHost,peerName,peers,
  // ⚠️ O padrão sai da CONSTANTE, não de um número copiado aqui: os dois viraram parâmetro do painel e o
  // env os semeia no boot. Com `30`/`15` cravados, mudar `ROOM` em constants.js não mudaria nada em dev.
  roomMax:num('ROOM_MAX',ROOM.MAX),
  roomBots:num('ROOM_BOTS',ROOM.BOTS),
  roundTicks:Math.max(60,num('ROUND_TICKS',ROUND.TICKS)),   // duração da rodada em ticks (os testes usam rodadas curtas)
  // 0 = usa o mundo do build. Semeia `WORLD.LADO`, que o BOOT copia para `WORLD.w/h` antes de a porta abrir
  // (ver server/src/index.js). Trocar o mundo com salas rodando não tem conserto, por isso não é live.
  worldSide:num('WORLD_SIDE',0),
  lobbyTicks:Math.max(60,num('LOBBY_TICKS',BR.LOBBY_TICKS)),   // janela do lobby do Battle Royale (mesmo motivo do ROUND_TICKS: testar sem esperar 30 s)
  logLevel:str('LOG_LEVEL','info'),
  // fala dos bots por LLM (Ollama). Sem OLLAMA_URL fica desligada e o chat usa o repertório fixo de sempre —
  // é por isso que os testes não precisam de rede nem de flag: eles simplesmente não têm a variável.
  ollamaUrl:str('OLLAMA_URL',''),
  ollamaModel:str('OLLAMA_MODEL',BOT_LLM.MODELO),
  ollamaTimeoutMs:num('OLLAMA_TIMEOUT_MS',BOT_LLM.TIMEOUT_MS),
  ollamaMaxInflight:Math.max(1,num('OLLAMA_MAX_INFLIGHT',BOT_LLM.MAX_INFLIGHT)),
  googleClientId:str('GOOGLE_CLIENT_ID',''),   // vazio = /api/auth/google devolve 503 e o botão não aparece
  // O id que a CrazyGames dá ao jogo no painel deles. É ele que amarra o JWT do jogador A ESTE jogo
  // (o `gameId` do token) — sem ele a rota /api/auth/crazygames responde 503, como a do Google.
  crazyGameId:str('CRAZY_GAME_ID',''),
  adminToken:str('ADMIN_TOKEN',''),
  // Contas promovidas a administrador no boot. SÓ PROMOVE, nunca rebaixa: rebaixar por ConfigMap
  // significa que apagar uma vírgula tranca todo mundo para fora do painel. Rebaixar é ação do /admin.
  adminEmails:list('ADMIN_EMAILS'),   // moderação de avatar (DELETE /api/avatar/:id); vazio = rota desligada
  botChatLlm:bool('BOT_CHAT_LLM',!!str('OLLAMA_URL','')),
  role,
  // Origens que podem falar com /api de fora (os portais que hospedam o cliente). VAZIA = camada
  // desligada, e desligada é o comportamento de sempre, byte a byte. Aceita origem exata ou sufixo
  // (`https://*.itch.zone`) — portal com subdomínio instável é a regra, não a exceção.
  allowedOrigins:list('ALLOWED_ORIGINS'),
  wsOriginCheck,
  staticDir:str('STATIC_DIR',''),
  signupCoins:num('SIGNUP_COINS',500),
  tz:str('DB_TZ','America/Sao_Paulo'),
});
export default config;

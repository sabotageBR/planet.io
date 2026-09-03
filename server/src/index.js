// ── COMPOSITION ROOT: config → log → db → migrate → persistência → salas/scheduler → http+ws → SIGTERM ──
// ROLE=both (padrão) | game (sem API da persistência; hooks continuam) | api (sem ws/salas).
// startServer(overrides) sobe tudo e devolve {port, rooms, …, close()} (testes usam port:0).
// @ts-check
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {PROTOCOL_VERSION} from '@warspace/shared/protocol/constants.js';
import {ROUND,WORLD,ROOM} from '@warspace/shared/constants.js';
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
import {createOllama,seedModelo} from './llm/ollama.js';
import {createBotChat} from './rooms/botChat.js';
import {createBotNames} from './rooms/botNames.js';
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
  // ── A DURAÇÃO DA SALA DO LIVRE: o env semeia, o painel manda ──
  // Mesmo contrato do modelo da LLM logo abaixo. `ROUND_TICKS` continua sendo a escolha do OPERADOR com que
  // os pods SOBEM; `Room.js` lê a constante viva, e `admin_settings` a sobrescreve 30 s depois. Sem esta
  // linha o env seria ignorado (regressão silenciosa nos testes, que encurtam a rodada por aqui).
  ROUND.TICKS=cfg.roundTicks;
  // Mesmo contrato para o TAMANHO DA SALA e a QUANTIDADE DE PREENCHIMENTOS do modo Livre: o env é a
  // escolha do operador com que os pods sobem, `Room.js` lê a constante viva e `admin_settings` a
  // sobrescreve ≤30 s depois. ⚠️ Vale para as salas CRIADAS daí em diante — a que já roda fixou os dois
  // no construtor —, e baixar o número de bots não expulsa ninguém: `trimBots` só roda no lobby do BR.
  ROOM.MAX=cfg.roomMax;ROOM.BOTS=cfg.roomBots;
  // ── O TAMANHO DO MUNDO: o env semeia, o painel manda, e QUEM APLICA É O BOOT ──
  // Mesmo contrato do `ROUND.TICKS` acima, com uma diferença que é a razão de ele existir em dois campos:
  // `WORLD.LADO` é o lado DESEJADO (o que o /admin grava) e `WORLD.w/h` é o mundo de AGORA. Trocar o mundo
  // com salas rodando não tem conserto — a zona já foi sorteada, os cinturões já nasceram, e os clientes
  // daquelas salas já quantizaram posições na escala velha —, então a aplicação espera o processo subir.
  // O `await` da linha abaixo é o que garante "antes da primeira sala": `tunablesReady` é uma consulta ao
  // banco, resolve em milissegundos, e o listener só abre depois.
  if(cfg.worldSide)WORLD.LADO=cfg.worldSide;
  // ── fala dos bots pela LLM (opcional) ──
  // O aquecimento NÃO é esperado: carregar o modelo leva ~27 s e o servidor não pode ficar de portas
  // fechadas por causa disso. Até ele terminar, as salas usam o repertório fixo — que é o mesmo caminho
  // de quando o Ollama não existe, então não há um segundo comportamento para manter.
  const game=cfg.role!=='api';
  let botChat=null,botNames=null;
  if(game&&cfg.botChatLlm&&cfg.ollamaUrl){
    // ── O ENV É A SEMENTE; DEPOIS QUEM MANDA É O PAINEL ──
    // `OLLAMA_MODEL` continua sendo a escolha do OPERADOR no boot, mas o modelo virou tunable
    // (`BOT_LLM.MODELO`), e a ordem de precedência é a de todo tunable: padrão de `constants.js` → env aqui
    // → `admin_settings`, que `tunables.load()` aplica logo abaixo. ⚠️ Um nome que não está na lista fechada
    // é ACRESCENTADO a ela em vez de recusado: o operador pode ter subido um modelo que este código não
    // conhece, e um `<select>` sem o valor em uso mostraria ao admin um modelo que o servidor não está
    // usando. ⚠️ `resetTunable` volta ao padrão do CÓDIGO, não a este env — que é o que "voltar ao padrão"
    // quer dizer no resto do painel.
    seedModelo(cfg.ollamaModel,log);
    const llm=createOllama({url:cfg.ollamaUrl,timeoutMs:cfg.ollamaTimeoutMs,
      maxInflight:cfg.ollamaMaxInflight,metrics,log});
    metrics.llmSource(()=>llm.inflight,()=>llm.breakerOpen);
    botChat=createBotChat({llm,log,metrics});
    // O BALDE DE APELIDOS divide a MESMA instância de `llm` com a fala: mesmo disjuntor, mesmo teto de
    // gerações em voo, mesmas métricas. Ele é raro (só quando o balde cai do piso) e não tem prazo, então
    // não usa `force`: se `ok()` recusar porque a fala está ocupando o teto, ele tenta no próximo
    // intervalo — a fala é do INSTANTE e tem preferência, um apelido pode esperar 20 s.
    botNames=createBotNames({llm,log,metrics});botNames.start();
    // ⚠️ AQUECER DEPOIS DOS TUNABLES, senão aquece o modelo ERRADO: o do env, enquanto o painel já escolheu
    // outro no banco. Medido em produção — "ollama pronto: gpt-oss" com `BOT_LLM.MODELO = qwen` aplicado 40 ms
    // antes, e aí a primeira fala paga os ~27 s de load que este aquecimento existe para pagar sozinho.
    // O `Promise.resolve` cobre o shard de jogo puro (`role='game'`), que não monta a API e não tem promessa.
    Promise.resolve(persistApi&&persistApi.tunablesReady)
      .then(()=>{log.info(`fala dos bots por LLM: ${llm.model} em ${cfg.ollamaUrl} (até ${cfg.ollamaMaxInflight} ao mesmo tempo)`);
        return llm.warmup();}).catch(()=>{});}
  else if(game&&cfg.ollamaUrl)log.info('BOT_CHAT_LLM desligado: a fala dos bots usa o repertório fixo');
  // ── salas + laço ──
  const scheduler=game?new Scheduler({metrics,log}):null;
  const rooms=game?createRoomManager({config:cfg,hooks,log,metrics,scheduler,botChat,botNames}):null;
  const health=()=>({ok:true,shard:cfg.shard,role:cfg.role,rooms:rooms?rooms.rooms.size:0,players:rooms?rooms.playerCount():0,...metrics.snapshot(),
    ...(db?healthFields({db,persist}):{db:'none',queue:0}),protocol:PROTOCOL_VERSION});
  // ── http + ws ──
  const server=http.createServer(createHttpHandler({config:cfg,rooms,persistApi,health,log}));
  server.keepAliveTimeout=65000;
  const ws=game?createWsServer({server,config:cfg,rooms,hooks,log,metrics}):null;
  // ⚠️ O MUNDO É FIXADO AQUI, antes de a porta abrir — ou seja, antes de existir a primeira sala. Esperar
  // os tunables é o que faz o número do painel valer: `WORLD.LADO` já foi semeado pelo env acima e o
  // `admin_settings` o sobrescreve nesta promessa (uma consulta, milissegundos). Depois desta linha
  // ninguém mais mexe em `WORLD.w/h` no processo, e é isso que mantém `protocol/codec.js` — que agora lê a
  // constante a cada chamada — de acordo com o mundo de cada sala.
  await Promise.resolve(persistApi&&persistApi.tunablesReady).catch(()=>{});
  if(WORLD.LADO>0&&WORLD.LADO!==WORLD.w){log.info(`mundo: ${WORLD.w} → ${WORLD.LADO} px de lado`);WORLD.w=WORLD.h=WORLD.LADO;}
  else WORLD.LADO=WORLD.w;
  await new Promise((res,rej)=>{server.once('error',rej);server.listen(cfg.port,()=>{server.off('error',rej);res(undefined);});});
  const addr=server.address(),port=typeof addr==='object'&&addr?addr.port:cfg.port;
  log.info(`warspace.io v2 | shard ${cfg.shard}/${cfg.shards} | porta ${port} | role ${cfg.role} | db ${db?(db.health.down?'down':'ok'):'nenhum'}`+
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

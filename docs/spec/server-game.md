# Servidor de jogo v2 — arquitetura (`server/src/`)

```
index.js        composition root: config → log → db (pool) → migrate (MIGRATE_ON_START) → persistence → rooms → http+ws → SIGTERM
config.js/log.js         (persistência: já existem)
loop.js         UM Scheduler 60 Hz por processo: acumulador performance.now(), setTimeout+setImmediate, cap 5 passos, conta overruns
metrics.js      ring buffers (600 amostras): tick ms p50/p99/max, loopLag, bytes out/s, msgs in/s, rateLimitHits
sim/Sim.js      World (shared/physics) + estado de jogo por slot {slot,sessionId,userId,name,registered,skinId,isBot,dead,score,stats,input:{seq,tx,ty,flags},missiles…}
                consome world.events → score, kills, mortes, respawn de bots, eventos de alto nível; chama hooks (docs/spec/hooks.md)
sim/bots.js     BotBrain: wander/hunt/flee + evitar buracos negros e asteroides maiores; produz input como humano (applyInput)
sim/hooks.js    NOOP_HOOKS
rooms/codes.js  newCode(shard) (1º char = shard base36 + 3 de "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"), shardOf(code)
rooms/Room.js   {code, shard, sim, sessions: Map<slot,Session>, snapshotter, createdAt}; step(tick): sim.step(); a cada SNAPSHOT_EVERY → snapshots; a cada LEADERBOARD_EVERY → leaderboard
rooms/RoomManager.js  findOrCreateRoom (mais cheia com vaga), getRoom(code) (cria se for do shard local), listRooms, reap (30 s sem humanos → para; 35 s → remove)
net/Session.js  ws + slot + seq/ack + known:Set<id> + AOI rect + token bucket + view{w,h} + resumeToken + lastSeen
net/wsServer.js upgrade em /ws/<shard> (o nginx já roteia), dispatch join/resume/view/ping (JSON) e INPUT (binário), heartbeat, rate limit, close codes
net/snapshot.js por sessão: AOI (shared/camera.viewRect + NET.AOI_PAD/AOI_PAD_OUT com histerese), CREATE/UPDATE-se-mudou/REMOVE, self block; usa encodeSnapshot do shared/protocol
http/api.js     /healthz, /internal/rooms, /api/config, /api/rooms, /api/auto (+ estáticos só com STATIC_DIR) e monta createApi() da persistência para /api/auth|me|skins|ranking
http/peers.js   fetch dos irmãos (PEERS ou PEER_HOST) com timeout 1200 ms
```

## Join
1. `join {token, room?, view, fallbackNick}` → `hooks.onPlayerJoin({token, fallbackNick, remoteAddr, userAgent})` (timeout 3 s).
   `ok:false` → `error {code, message, suggestion}` + close (ERROR_CODE). 
2. sala = `getRoom(room) || findOrCreateRoom()`; cheia → `error FULL`.
3. `slot` = menor livre; `sim.addPlayer(slot, {name: nick, registered, skinId, isBot:false, sessionId, userId})`.
4. envia `room {code, shard, slot, sessionId, resumeToken, protocol, tick, world}` → `PLAYERS` completo → snapshots começam.
5. Mesmo usuário em duas abas: permitido (dois slots).

## Input
`INPUT` binário: valida `seq` (u16 com wrap: aceita se `(seq - lastSeq) & 0xffff` ∈ (0, 32768)); `tx,ty` dequantizados;
flags one-shot: `SPLIT`/`EJECT`/`FIRE` executadas uma vez por seq nova (o cliente repete a flag até o ack — o servidor
ignora repetições porque só processa seq > lastSeq); `EJECT_HOLD` liga/desliga repetição (a cada EJECT.HOLD_TICKS).
Cooldowns só no servidor (`World.requestSplit/Eject/Fire` já checam). Rate limit: NET.RATE_INPUTS/s, burst NET.RATE_BURST.
`FIRE` e `SPLIT` derrubam o escudo do jogador (SHIELD_BREAK). `FIRE` mira, nesta ordem: míssil inimigo que persegue este slot a
< MISSILE.INTERCEPT_DIST e se aproximando (interceptação, `type 1`), senão o oponente vivo mais próximo.

## Regras (shared/physics/rules.js — o servidor não tem regra própria)
- **Escudo por níveis**: pegar 🛡️ = +1 nível (teto POWERUP.SHIELD_MAX_LEVEL), reinicia o timer; não expira; sobe um nível a cada
  SHIELD_EVOLVE_TICKS sem ser atingido (SHIELD_UP). Míssil inimigo explode no escudo sem tirar massa e tira 1 nível (SHIELD_HIT;
  0 → SHIELD_BREAK). Escudado nunca é engolido: o grande quica (E_SHIELD). Bots com escudo não atiram nem dividem.
- **Fusão**: por par de peças do mesmo dono — separação enquanto uma não pode fundir; quando ambas podem, atração só a
  d < (ra+rb)·MERGE.ATTRACT_RANGE (sem puxão global ao centróide); merge pareado a d < max(r)·MERGE.DIST.
- **Ímã**: comida a d < r·MAGNET_RANGE anda a MAGNET_PULL·(1+(MAGNET_NEAR−1)·(1−d/alcance)) px/s e é marcada MOVED (UPDATE X_Y
  no snapshot); ejetados de terceiros (ou próprios após cdUntil) ganham MAGNET_EJECT_A px/s². Flag PIECE_FLAG.MAGNET para todos verem.
- **Mísseis**: míssil × míssil de donos diferentes com teste varrido (O(n²) sobre w.missiles, fora da grade) → ambos morrem (CLASH);
  míssil × asteroide → o míssil morre e o asteroide ganha Δv = AST_KICK·min(1, R_MIN/r) na direção do míssil; asteroide de cinturão
  vira errante e o cinturão reagenda um substituto (DEFLECT).

## Morte / saída
- `PLAYER_DEAD` do world → `dead` JSON `{by, byHole, score, maxMass, kills, durationS}` → `hooks.onMatchEnd(...)` → quando resolver, `rewards` JSON; o jogador fica no mundo como morto até `join` de novo (novo sessionId) ou sair.
- Socket fecha com sessão viva → jogador fica `NET.RESUME_MS` sem thrust (comível); `resume` válido religa (known reset); expirado → `onMatchEnd('left')` + removePlayer.
- SIGTERM: para de aceitar joins, `onMatchEnd('shutdown')` para todas as sessões vivas, `hooks.onShutdown()` (drena ≤ 10 s), fecha ws e pool.

## Bots
`ROOM.BOTS` por sala, nomes de BOT_NAMES, skinId aleatório (rng da sala), `BOT.*` do constants; renascem no lugar com `score*RESPAWN_SCORE`.
Não têm Session nem hooks. `registered` false, `flags BOT`.

## /healthz
`{ok:true, shard, rooms, players, tick:{p50,p99,max,overruns}, loopLagMs:{p50,p99}, net:{outKBps,inMsgps,rateLimitHits}, db, queue, protocol}` — sempre 200 (readiness não depende do banco).

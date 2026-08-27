# Servidor de jogo v2 — arquitetura (`server/src/`)

```
index.js        composition root: config → log → db (pool) → migrate (MIGRATE_ON_START) → persistence → rooms → http+ws → SIGTERM
config.js/log.js         (persistência: já existem)
loop.js         UM Scheduler 60 Hz por processo: acumulador performance.now(), setTimeout+setImmediate, cap 5 passos, conta overruns
metrics.js      ring buffers (600 amostras): tick ms p50/p99/max, loopLag, bytes out/s, msgs in/s, rateLimitHits
sim/Sim.js      World (shared/physics) + estado de jogo por slot {slot,sessionId,userId,name,registered,skinId,isBot,dead,score,stats,input:{seq,tx,ty,flags},missiles…}
                consome world.events → score, kills, mortes, respawn de bots, eventos de alto nível; chama hooks (docs/spec/hooks.md)
sim/bots.js     BotBrain: wander/hunt/flee + evitar buracos negros, estrelas e asteroides maiores; produz input como humano (applyInput)
sim/hooks.js    NOOP_HOOKS
rooms/codes.js  newCode(shard) (1º char = shard base36 + 3 de "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"), shardOf(code)
rooms/Room.js   {code, shard, sim, sessions, snapshotter, createdAt, roundStart, over}; step(tick): fim da rodada → endRound(); senão sim.step(); a cada SNAPSHOT_EVERY → snapshots; a cada LEADERBOARD_EVERY → leaderboard
rooms/RoomManager.js  findOrCreateRoom (mais cheia com vaga, ignorando as que já acabaram), getRoom(code), listRooms, reap (30 s sem humanos → para; 35 s → remove; sala terminada → remove BREAK_MS depois)
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
`FIRE` custa **um nível** do escudo da peça que atira (a 1ª viva; SHIELD_HIT, 0 → SHIELD_BREAK) e `SPLIT` derruba o escudo inteiro
**da peça que dividiu**. Com `AIM` (o jogador segurou o botão) o míssil **trava no objeto mais próximo dentro do cone**
±MISSILE.AIM_CONE em volta de `tx,ty`, até AIM_RANGE — peça de outro dono (`type 0`, alvo = slot), míssil inimigo ou asteroide
(`type 1`, alvo = id) — e só sai reto se não houver nada no cone. Sem AIM, `FIRE` mira nesta ordem: míssil inimigo que persegue
este slot a < MISSILE.INTERCEPT_DIST e se aproximando (interceptação, `type 1`), senão o oponente vivo mais próximo.

## Regras (shared/physics/rules.js — o servidor não tem regra própria)
- **Powerup é da PEÇA**: ímã e escudo ficam no corpo (`Body.magnetUntil`, `shieldLv`, `shieldEvolveAt`), não no jogador — com o
  planeta dividido, quem pegou o powerup é a única parte que se beneficia. Peça nova (split, pop de asteroide, estilhaço de estrela)
  nasce **sem** powerup; ao fundir, a peça que fica leva o **melhor** dos dois (maior nível de escudo, maior tempo de ímã).
  O bloco `self` manda o melhor das peças só para o HUD.
- **Escudo por níveis**: pegar 🛡️ = +1 nível **naquela peça** (teto POWERUP.SHIELD_MAX_LEVEL), reinicia o timer; não expira; sobe um
  nível a cada SHIELD_EVOLVE_TICKS sem a peça ser atingida (SHIELD_UP). Míssil inimigo explode no escudo sem tirar massa e tira 1 nível (SHIELD_HIT;
  0 → SHIELD_BREAK) — é contra míssil que o escudo serve. **A regra do maior comer o menor prevalece**: a primeira batida de quem
  pode engolir derruba o escudo inteiro (qualquer nível) e quica com E_SHIELD (chance de fuga); da batida seguinte em diante come
  normalmente. Disparar tira um nível e dividir derruba o escudo daquela peça. Bots com escudo (o da peça que atira) não atiram nem dividem.
- **Fusão**: por par de peças do mesmo dono — separação enquanto uma não pode fundir; quando ambas podem, atração só a
  d < (ra+rb)·MERGE.ATTRACT_RANGE (sem puxão global ao centróide); merge pareado a d < max(r)·MERGE.DIST. A peça que fica herda o
  melhor powerup das duas (ver acima).
- **Asteroide**: batida forte (vn ≥ ASTEROID.SHIELD_VN) com escudo tira 1 nível em vez de lascar; batida fraca com escudo não faz nada;
  sem escudo, lasca como antes (CHIP).
- **Estrelas** (STAR.*): perigo estático em 3 fases — GROW (rampa de `k`; só arma acima de ARM_K), ACTIVE e OLD (incha até R·SWELL).
  Encostar empurra a peça (PUSH_TOUCH) e, fora do cooldown de contato e com r ≥ SHATTER_MIN_R, **estilhaça** em SHATTER_N+1 pedaços a
  SHATTER_SPEED com a massa conservada (STAR_BURST). No fim do OLD vira **supernova** num raio r·NOVA_R: NOVA_PARTICLES ejetados sem
  dono, asteroides chutados com AST_KICK·(1−d/blast)·min(1,R_MIN/r) (os de cinturão viram errantes e o cinturão repõe) e peças
  empurradas com PUSH·(1−d/blast) — só empurrão. A estrela morre e outra nasce RESPAWN_TICKS depois.
  **Levar tiro empurra**: míssil (sempre) e partícula ejetada (fora do cooldown HIT_CD_TICKS) somem no impacto, empurram a estrela
  (HIT_PUSH/EJECT_PUSH, escalados por STAR.R/r — ela desliza com arrasto STAR.DRAG) e contam um hit (STAR_HIT). Em HITS_TO_SPLIT hits
  ela **racha** (STAR_SPLIT): sopro em r·SPLIT_BLAST (peças empurradas e asteroides chutados, sem estilhaçar) e SPLIT_N estrelas
  menores (r·SPLIT_R) saindo em leque a SPLIT_SPEED, já ACTIVE e com vida curta. Só a 1ª filha herda o lugar da mãe na população
  (as outras têm `hue=1` e não enfileiram respawn), então a contagem volta sozinha a STAR.COUNT.
- **Buracos negros** (BLACKHOLE.*): dentro do raio de influência (CORE_R·INFLUENCE·k ≈ 570 px) tudo é puxado com a = min(G/d², A_MAX)·k
  (por isso quanto mais perto, mais forte — na borda dá para escapar remando, a partir de ~200 px não dá) mais uma parte tangencial
  a·SWIRL (sentido fixo pelo seed do buraco) que faz **espiralar** em vez de cair reto. No núcleo a peça perde LOSS da massa e é
  cuspida na saída pareada a EXIT_SPEED (BH_SUCK + EXIT); peça abaixo de MIN_PIECE_R é destruída. O cliente prevê a MESMA gravidade
  nas peças próprias (`stepOwnPieces(...,holes)`), senão a peça ficaria borrachuda perto do buraco.
- **Arremesso** (`integratePiece`): acima de vmax·LAUNCH_THRESH a peça entra no regime de arremesso (steer ×LAUNCH_STEER, sem clamp) e
  o arrasto CRESCE acima de LAUNCH_KNEE_V px/s — LAUNCH_DRAG+LAUNCH_K·(|v|−KNEE_V)/KNEE_V. O joelho é absoluto (não em vmax), então o
  pico do split/pop/estilhaço/saída do buraco some em ~0,15 s para qualquer tamanho: sai muito rápido, freia rápido e para perto.
- **Powerups**: só ímã (temporário, POWERUP.TICKS) e escudo (níveis), os dois **por peça**. O powerup de velocidade foi removido — a velocidade máxima vem só do raio (`vmaxFor`).
- **Ímã** (só a peça que o pegou atrai): comida a d < r·MAGNET_RANGE anda a MAGNET_PULL·(1+(MAGNET_NEAR−1)·(1−d/alcance)) px/s e é marcada MOVED (UPDATE X_Y
  no snapshot) — cometa e estrela (comida pesada) a MAGNET_HEAVY disso; ejetados de terceiros (ou próprios após cdUntil) ganham
  MAGNET_EJECT_A px/s²; a estrela do mundo se arrasta a MAGNET_STAR (vem para cima de você). Flag PIECE_FLAG.MAGNET para todos verem.
- **Mísseis**: míssil × míssil de donos diferentes com teste varrido (O(n²) sobre w.missiles, fora da grade) → ambos morrem (CLASH);
  míssil × asteroide → o míssil morre e o asteroide ganha Δv = AST_KICK·min(1, R_MIN/r) na direção do míssil; asteroide de cinturão
  vira errante e o cinturão reagenda um substituto (DEFLECT).

## Rodada (fim do mundo)
Cada sala vive `config.roundTicks` (env `ROUND_TICKS`, padrão ROUND.TICKS = 1 h). O bloco `round` do JSON `room`
(`{start,ticks,dayStart,breakMs}`) é tudo que o cliente precisa: dele saem o relógio do espaço (a rodada = ROUND.DAYS dias
começando às `dayStart`, ou seja um dia a cada 15 min e 12 trocas de céu por sala, cada uma com fade) e a contagem para o fim. Ao acabar: `Room.endRound()` →
`Sim.endRound()` fecha a partida de todo humano vivo (mesma persistência da morte, `cause:'round'`, sem `dead`) e devolve o
placar (vivos por massa; o 1º é o campeão, bots incluídos; humanos já mortos entram no fim). Vai um `roundEnd` para todas as
sessões, a sala fica `over` (não recebe mais ninguém, não simula) e o RoomManager a remove BREAK_MS depois — o cliente entra
sozinho numa sala nova quando o contador do placar zera.

## Morte / saída
- `PLAYER_DEAD` do world → `dead` JSON `{by, byHole, score, maxMass, kills, durationS}` → `hooks.onMatchEnd(...)` → quando resolver, `rewards` JSON; o jogador fica no mundo como morto até `join` de novo (novo sessionId) ou sair.
- Socket fecha com sessão viva → jogador fica `NET.RESUME_MS` sem thrust (comível); `resume` válido religa (known reset); expirado → `onMatchEnd('left')` + removePlayer.
- SIGTERM: para de aceitar joins, `onMatchEnd('shutdown')` para todas as sessões vivas, `hooks.onShutdown()` (drena ≤ 10 s), fecha ws e pool.

## Bots
`ROOM.BOTS` por sala, nomes de BOT_NAMES, skinId aleatório (rng da sala), `BOT.*` do constants; renascem no lugar com `score*RESPAWN_SCORE`.
Não têm Session nem hooks. `registered` false, `flags BOT`.

## /healthz
`{ok:true, shard, rooms, players, tick:{p50,p99,max,overruns}, loopLagMs:{p50,p99}, net:{outKBps,inMsgps,rateLimitHits}, db, queue, protocol}` — sempre 200 (readiness não depende do banco).

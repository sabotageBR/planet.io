# Servidor de jogo v2 — arquitetura (`server/src/`)

```
index.js        composition root: config → log → db (pool) → migrate (MIGRATE_ON_START) → persistence → rooms → http+ws → SIGTERM
config.js/log.js         (persistência: já existem)
loop.js         UM Scheduler 60 Hz por processo: acumulador performance.now(), setTimeout+setImmediate, cap 5 passos, conta overruns
metrics.js      ring buffers (600 amostras): tick ms p50/p99/max, loopLag, bytes out/s, msgs in/s, rateLimitHits
sim/Sim.js      World (shared/physics) + estado de jogo por slot {slot,sessionId,userId,name,registered,skinId,isBot,dead,score,stats,input:{seq,tx,ty,flags},missiles…}
                consome world.events → score, kills, mortes, respawn de bots, eventos de alto nível; chama hooks (docs/spec/hooks.md)
                (o BotBrain vive em shared/src/bot.js: o LocalServer do cliente usa o mesmo cérebro)
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
  separação SÓ posicional (sem atração entre peças próprias); merge pareado a d < max(r)·MERGE.DIST. A peça que fica herda o
  melhor powerup das duas (ver acima).
- **Cuspir (W)**: a pelota tem raio `ejectR(pc.r)` = `EJECT.R_K` do raio de quem cospe, com piso `R_MIN` e teto
  `R_MAX`, e massa `r²·MASS_FACTOR`. Assim qualquer tamanho se esvazia em ~34 cusparadas (com o raio fixo de
  antes, um planeta de 360 mil precisava de 3.419) — o mesmo efeito com muito menos corpos. `EJECT.MAX` limita a
  população (era a ÚNICA lista dinâmica sem teto: asteroide tem `astCap`, comida tem `FOOD.COUNT`) matando o mais
  antigo, e segurar o W com 16 peças ia a ~2.000 pelotas vivas. A imunidade do dono (`ownerImmune`) soma
  `r/vmax(r)` em ticks: fixa em .33 s o planetão alcançava a própria cusparada e reengolia — medido, 63 de 86
  voltavam e 10 s de W tiravam .7% da massa; agora tiram 88%.
- **Decaimento** (`PLAYER.DECAY`, o `playerDecayRate` do agar): toda peça perde .2% da massa por segundo, com piso
  em `START_R`, aplicado no passo (`world.js`) e espelhado em `predict.js` (a paridade de 1e-6 é o guarda). É o que
  impede o gigante de ser imortal — antes, nenhuma ameaça tirava massa dele com o tempo.
- **Carência de tiro do spawn** (`MISSILE.SPAWN_CD_TICKS` = 600 ticks = 10 s): todo nascimento (`_spawnPiece`, e
  portanto também o respawn) arma `ps.fireCdUntil = tick + SPAWN_CD_TICKS`, e `applyFire` recusa antes disso — sem
  atirar e **sem gastar munição**. Sem ela, quem nasce sai do spawn metralhando: não tem massa a perder e o míssil é
  justamente a arma anti-gigante. É por TEMPO, não por tamanho — planeta pequeno pode atirar, só precisa sobreviver
  os 10 s. Vale para bot também (o `bot.js` checa o mesmo campo para não gastar input à toa). O que falta vai no
  `self` do snapshot como `fireCd` (u16 ticks, protocolo 7) e o HUD desenha a contagem regressiva **em cima do ícone
  da arma**; enquanto corre, o botão de míssil apaga e o clique vira ejeção, igual a quando falta munição.
- **Escudo defende SÓ de míssil e asteroide**: não impede mais de ser comido (`piecePair` perdeu o ramo que
  interceptava antes do `eatPiece`) e não salva de estrela nem de supernova.
- **Colisão de rocha = explosão**: em `pieceAsteroid` a rocha SEMPRE morre no contato (POP + respawn). Antes ela
  sobrevivia ao quique em cinco caminhos e ficava batendo sem parar no mesmo planeta.
- **Míssil estilhaça** (`shatterPiece`, `MISSILE.SHATTER_N`/`SHATTER_DIST`): além dos `HIT_SHRINK` de dano, o tiro
  parte o alvo em 3–6 pedaços — é o que dá a alguém a chance de desmontar um planetão.
- **Estrela: nada se multiplica.** Míssil/partícula empurram e contam hit; em `STAR.HITS_TO_SPLIT` ela **explode
  (supernova) e morre**, e o meteoro grande que trombar nela também a faz explodir (a rocha morre no estouro).
  Antes ela rachava em `SPLIT_N` estrelas menores e a rocha em `SMASH_N` cacos — um motor de população: a sala de 5
  estrelas chegava a 16 sozinha, e com jogadores atirando (cada 3 acertos triplicando) o mapa lotava e o cliente caía
  para 6 fps. O berçário da supernova também **realoca** comida em vez de somar: para cada pelota do cacho some uma
  de longe, senão a população subia para sempre (o laço de reposição só enche até `FOOD.COUNT`, nunca corta).
- **Ímã com teto de tamanho** (`POWERUP.MAGNET_MAX_R`): acima desse raio a peça não pega nem usa o ímã. O alcance é
  `r·MAGNET_RANGE`, então num planetão passava de 1500 px e sugava a tela inteira.
- **Asteroide × escudo — o preço é a VELOCIDADE da batida** (`shieldTierFor`, `ASTEROID.SHIELD_VN = [220,520,900]`):
  devagar tira **1 nível**, média **2**, e rápida demais tira o escudo **inteiro E estoura o planeta** (nessa faixa a
  rocha atravessa como se não houvesse escudo). Abaixo do 1º limiar o escudo nem sente. Enquanto ele aguenta, a rocha
  **não lasca e não estoura** — só empurra, e o empurrão é curto (boost com teto `BOUNCE.DIST_MAX`, some sozinho).
  A velocidade de aproximação soma o quanto o PLANETA está correndo contra a rocha (`velX/velY` = impulso + direção),
  não só a dela: correr para cima de uma pedra parada é uma batida de verdade;
  sem escudo, lasca como antes (CHIP).
  **Sinuca**: quando a peça é maior que a rocha, ela só ATRAVESSA (para estourar) se a trajetória relativa da rocha mirar o miolo —
  o parâmetro de impacto (distância do centro da peça à reta que a rocha percorre) tem que ser menor que r·POP_DIST. De raspão a
  rocha ricocheteia por `resolveBounce` com e=ASTEROID.E, impulso ponderado pela massa: a pedra sai voando, o planeta quase não sente.
- **Estrelas** (STAR.*): perigo estático em 3 fases — GROW (rampa de `k`; só arma acima de ARM_K), ACTIVE e OLD (incha até R·SWELL).
  Encostar empurra a peça (PUSH_TOUCH) e, fora do cooldown de contato e com r ≥ SHATTER_MIN_R, **estilhaça** em SHATTER_N+1 pedaços a
  SHATTER_DIST px com a massa conservada (STAR_BURST) — a não ser que ela tenha **escudo**, que cai inteiro (SHIELD_BREAK) e segura o
  estilhaço. No fim do OLD vira **supernova** num raio r·NOVA_R: NOVA_PARTICLES ejetados sem dono, asteroides chutados com
  AST_KICK·(1−d/blast)·min(1,R_MIN/r) (os de cinturão viram errantes e o cinturão repõe) e peças empurradas com PUSH·(1−d/blast).
  Cada fragmento da supernova vale NOVA_PART_MASS pelotas comuns e vai marcado FRAG_KIND.NOVA — o cliente os desenha **brilhando e
  latejando**: é o melhor troco do mapa, e estar por perto na hora certa é o prêmio de ter arriscado.
  No **miolo** (d < blast·NOVA_SHATTER) a onda machuca como o contato: escudo cai inteiro e salva, sem escudo a peça estilhaça.
  A estrela morre e outra nasce RESPAWN_TICKS depois.
  **Levar tiro empurra**: míssil (sempre) e partícula ejetada (fora do cooldown HIT_CD_TICKS) somem no impacto, empurram a estrela
  (HIT_PUSH/EJECT_PUSH, escalados por STAR.R/r — ela desliza com arrasto STAR.DRAG) e contam um hit (STAR_HIT). Se ela já está em
  **OLD**, o hit não conta: a supernova acontece **na hora** (dá para adiantar a explosão com um míssil — e a mira trava em estrela).
  Em HITS_TO_SPLIT hits
  ela **racha** (STAR_SPLIT): sopro em r·SPLIT_BLAST (peças empurradas e asteroides chutados, sem estilhaçar) e SPLIT_N estrelas
  menores (r·SPLIT_R) saindo em leque a SPLIT_SPEED, já ACTIVE e com vida curta. Só a 1ª filha herda o lugar da mãe na população
  (as outras têm `hue=1` e não enfileiram respawn), então a contagem volta sozinha a STAR.COUNT.
  **Meteoro × estrela** (SMASH): rocha com r ≥ ASTEROID.SMASH_MIN_R que encosta numa estrela armada parte os dois — a rocha vira
  SMASH_N cacos de r·SMASH_R arremessados para trás a SMASH_SPEED (se era de cinturão, o cinturão repõe) e a estrela **racha** pelo
  mesmo `starSplit`, cujo sopro já chuta os cacos para longe das filhas. Rocha menor apenas ricocheteia. O maior caco possível
  (R_MAX·SMASH_R ≈ 28) fica **abaixo** de SMASH_MIN_R de propósito: sem isso um caco trombaria numa filha e a cascata apagaria as
  estrelas do mapa. Pela mesma razão a estrela agora **nasce a ≥ ASTEROID.BELT_SAFE do anel de qualquer cinturão** — dentro de um,
  o cinturão viraria um moedor e a população nunca pararia de repor.
- **Comida no buraco**: a que cai no núcleo é engolida e a reposição normal a devolve em outro canto do mapa, então
  FOOD.COUNT nunca cai. A supernova deixa NOVA_FOOD comidas permanentes onde a estrela estava: a estrela morta vira berçário.
- **Fragmentos e conservação de massa** (FRAG.*, `fragR`/`fragLife`): tudo que é arrancado de um planeta vira massa ejetada com
  **valor variável** — só o ejetado pode ter `mass ≠ r²` (`World.addEjected`), e o raio é `fragR(mass)`, então **o tamanho na tela
  é o valor**. Conservam exatamente: split, merge, pop de asteroide, estilhaço de estrela, a lasca (CHIP), o dano de míssil
  (os HIT_DEBRIS cacos somam o que foi arrancado — acertar um planetão deixa uma colheita gorda no chão) e o esmagamento no
  buraco negro (SPAGHETTI_N pellets com a massa INTEIRA da peça). Reabsorver devolve a massa **inteira** (EAT.EJECT_GAIN = 1): cuspir e recolher fecha em zero, e a
  pontuação do fragmento sai de √mass (o raio satura em FRAG.R_MAX e mentiria sobre o valor). A massa é medida **depois** do piso
  MIN_PIECE_R, então uma peça no mínimo não perde nada e também não cospe fragmento — antes ela criava massa do nada.
  Acima de FRAG.RICH_MASS o fragmento é "gordo": dura o dobro, o ímã o arrasta a FRAG.MAGNET_HEAVY e um asteroide **não** o engole
  (a rocha comer um pedaço de planeta seria o maior sumidouro do jogo). O fio manda o tier no `hue` do EJECT (FRAG_KIND).
  Comer jogador conserva massa também (EAT.GAIN = 1, a regra do agar.io `size = √(s1²+s2²)`): a vítima entra INTEIRA.
  Continuam sendo fonte/sumidouro **de propósito**: a comida que o mundo repõe sem parar, o
  berçário da supernova e o fragmento que a própria estrela queima (`ejectStar`).
- **Buracos negros** (BLACKHOLE.*): dentro do raio de influência (CORE_R·INFLUENCE·k ≈ 380 px) tudo é puxado com a = min(G/d², A_MAX)·k
  (por isso quanto mais perto, mais forte — na borda dá para escapar remando, a partir de ~200 px não dá) mais uma parte tangencial
  a·SWIRL (sentido fixo pelo seed do buraco) que faz **espiralar** em vez de cair reto. **Não há mais teleporte.** Quem chega ao
  núcleo é ESMAGADO: morre (`cause:"blackhole"`, evento BH_SUCK) e a massa **inteira** vira SPAGHETTI_N pellets sem dono num anel
  a SPAGHETTI_R do raio de influência — logo fora do alcance da sucção, senão o buraco os engoliria de volta em segundos e
  ninguém aproveitaria. Quem ronda a boca do buraco lucra.
  **O tamanho é a defesa**: só é esmagada a peça com `r < rc·CRUSH_K` (rc = CORE_R·k; CRUSH_K = 2.4 → ~91 px, massa 8.281).
  Acima disso ela atravessa o núcleo e **nada acontece** — mas continua sendo puxada como todo mundo, porque o campo é
  do buraco, não da vítima. CRUSH_K é o mesmo número de `textures.scale.blackHole` e do `rK` do anel tracejado do horizonte
  no cliente: é o que faz "seu planeta cabe dentro do tracejado? você morre" ser verdade na tela.
  Pellet, míssil e asteroide errante que chegam ao núcleo simplesmente somem (o míssil com BOOM, a rocha com POP).
  O cliente prevê a MESMA gravidade nas peças próprias (`stepOwnPieces(...,holes)`), senão a peça ficaria borrachuda perto
  do buraco — mas **nunca** o esmagamento: a peça própria some pelo REMOVE.SUCKED do snapshot.
- **Movimento: dois canais, sem velocidade de jogador** (`integratePiece`). É o modelo do agar.io:
  1. **direção** — `pos += û(ponteiro)·vmaxFor(r)·min(d,SPEED.RAMP)/SPEED.RAMP·dt`, instantâneo. Sem inércia, sem
     aceleração, sem arrasto: a peça anda SEMPRE na velocidade padrão do seu tamanho e inverte a direção no mesmo tick.
     `vmaxFor = clamp(K/r^EXP, MIN, MAX)` com os números literais de lá (`2.1106/size^0.449`, K = 2110,6).
  2. **impulso** — o canal de BOOST guardado em `Body.vx/vy` (`body.addBoost`), que decai a `BOOST.K` e **sempre chega
     a zero**. Como o decaimento é exponencial puro, o corpo percorre exatamente `|v|/BOOST.K` px: por isso todo empurrão
     do jogo é declarado em PIXELS (`SPLIT.DIST`, `LOCAL.POP_DIST`, `STAR.SHATTER_DIST`,
     `BOUNCE.DIST_MAX`). `BOOST.K = −ln(.9)/0.04` é o `boostDistance ×0,9 por tick de 40 ms` do agar em 60 Hz, e
     `BOOST.MAX_STEP` é o teto de 78 px/tick de lá (anti-tunelamento).
  O modelo antigo guardava velocidade acumulada: trombada de asteroide, quique e fusão viravam embalo que durava
  segundos, e o arremesso do split roubava o controle do ponteiro (`LAUNCH_STEER`). Nada disso existe mais.
- **Quique** (`rules.bouncePiece`): a correção posicional é a de sempre e o impulso elástico do `resolveBounce` cai no
  canal de boost da peça, com **teto de `BOUNCE.DIST_MAX` px** — a rocha dá o solavanco e a velocidade padrão volta.
  Entre peças próprias não há impulso nenhum: só separação posicional, e **não existe atração** (era ela que dava o
  empurrão ao reintegrar). As partes se juntam sozinhas porque todas correm para o mesmo ponteiro e a menor é mais rápida.
- **Arremesso do split**: o filho recebe `addBoost(SPLIT.DIST)` = 780 px, o pai não é empurrado, e o ponteiro mantém
  **controle total** durante o arremesso (o boost é somado ao movimento, não o substitui). Medido: 744–779 px de r=60 a
  r=240, ou seja a mesma distância em qualquer tamanho, com o impulso terminando em zero.
- **Divisão e teto** (`applySplit`/`autoSplit`): cada peça r ≥ SPLIT.MIN_R (60, o `playerMinSplitSize`) vira duas de r/√2, até
  PLAYER.MAX_PIECES = 16. A espera para voltar a fundir é `mergeTicks(r)` = max(30 s, 0,2·r s), a fórmula do agar — dividir é um
  compromisso longo, não um golpe grátis. Passar de PLAYER.MAX_R (1000, a mesma proporção mundo/célula do agar: 9600/1000 ≈ 14142/1500)
  **não trava o crescimento**: `autoSplit` reparte a peça em ⌊mass/MAX_R²⌋ filhos em leque. Só com as 16 peças ocupadas é que o raio
  é cortado — é o único ponto do jogo em que massa de jogador se perde. Antes o teto era 290 (massa 84 100) e `addMass` descartava
  o ganho em silêncio: o jogador simplesmente parava de comer por volta dos 80 mil.
- **Powerups**: ímã (temporário, POWERUP.TICKS) e escudo (níveis) são **por peça**; **fusão** (FOOD_TYPE.MERGE, o índice que era do
  powerup de velocidade) zera o `mergeAt` de TODAS as peças do dono — quem foi picado por estrela ou asteroide se junta na hora.
  A velocidade máxima vem só do raio (`vmaxFor`); não há powerup de velocidade.
- **Comida**: FOOD.COUNT no mundo todo, reposta na hora. FOOD.NEAR_HAZARD_P dela nasce num anel (NEAR_HAZARD_R) em volta de uma
  estrela ou buraco negro e nunca como poeira — é sempre cometa/rocha graúda ou powerup: chegar perto do perigo compensa.
- **Ímã** (só a peça que o pegou atrai): comida a d < r·MAGNET_RANGE anda a MAGNET_PULL·(1+(MAGNET_NEAR−1)·(1−d/alcance)) px/s e é marcada MOVED (UPDATE X_Y
  no snapshot) — cometa e estrela (comida pesada) a MAGNET_HEAVY disso; ejetados de terceiros (ou próprios após cdUntil) ganham
  MAGNET_EJECT_A px/s²; **asteroides** ganham MAGNET_AST px/s² escalados por min(1,R_MIN/r) (rocha pequena vem voando, rocha grande
  se arrasta); a estrela do mundo se arrasta a MAGNET_STAR (vem para cima de você). O ímã não escolhe o que puxa: traz comida e
  perigo junto. Flag PIECE_FLAG.MAGNET para todos verem.
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

O cérebro é **um só** (`shared/src/bot.js`), usado pelo Sim e pelo LocalServer do cliente: ele só produz `{tx,ty,flags}` — quem aplica
é o `emit` de quem o criou (`sim.applyInput` no servidor, o World no LocalServer) — e toda aleatoriedade sai do rng recebido, então
continua determinístico. Modos: **flee** (alguém maior perto) > **intercept** (míssil vindo: vira e derruba com outro míssil) >
**hunt** (presa; divide só quando o salto do split alcança de verdade e usa tiro mirado) > **food** (melhor comida do alcance por
valor/distância, pela grade de comida — powerup e munição valem mais que poeira, e os **fragmentos** entram na mesma conta valendo
√mass: um pedaço de planetão no chão vale mais que qualquer grão) > **wander**. Perigo colado (buraco negro, estrela
armada, asteroide que ele estouraria) é override em cima de qualquer modo, e a fuga escolhe entre BOT.DIRS direções a que menos o
joga contra parede ou perigo. Cada bot sorteia uma **personalidade** (BOT.PERSONAS) que pesa caça, fuga, coleta e frequência de
míssil. Humano que acabou de nascer não é escolhido como presa por BOT.SPAWN_GRACE_TICKS.

## /healthz
`{ok:true, shard, rooms, players, tick:{p50,p99,max,overruns}, loopLagMs:{p50,p99}, net:{outKBps,inMsgps,rateLimitHits}, db, queue, protocol}` — sempre 200 (readiness não depende do banco).

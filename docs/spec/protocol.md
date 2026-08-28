# Protocolo de rede planet.io v2

Transporte: WebSocket em `/ws/<shard>`. Mensagens de **controle** são JSON (texto); mensagens de **jogo** são
binárias (`ArrayBuffer`, little-endian, `DataView`). `PROTOCOL_VERSION = 9` (em `shared/src/protocol/constants.js`). **v9**: MODOS DE JOGO — o PLAYERS ganhou `team`, o `self` ganhou `weapon`/`alive` (22 → 24 bytes), o create de MISSILE ganhou `weapon` e entraram as mensagens `ZONE`, `VOICE` e `VOICE_UP`. **v8**: o `self` ganhou `threat`/`threatDir` (alerta de míssil teleguiado vindo em mim), 20 → 22 bytes. **v7**: o `self` ganhou `fireCd` (carência de tiro do spawn), 18 → 20 bytes. **v6**: o LEADERBOARD passou a levar x,y de TODOS os vivos. **v5**: o `hue` do EJECT deixou de carregar o `skinId` do dono (que o cliente nunca leu — a cor sai do `owner`) e passou a carregar o **tier do fragmento** (`FRAG_KIND`).
Slots: cada jogador da sala tem um `slot` u16 estável enquanto está na sala. Ids de entidade: u32 incrementais por sala.

## Quantização
- Posição: `u16 = round(x / WORLD_W * 65535)` (idem y com WORLD_H). Decodifica `x = u16 / 65535 * WORLD_W`.
- Raio: `r10 = u16 round(r*10)`.
- Velocidade: `i16 = round(v)` em px/s, clamp ±32767.
- Ticks/tempos: u32 tick da simulação (60 Hz); cooldowns em ticks (u8 = min(255, ticks)).

## Cliente → servidor
JSON:
- `{"t":"join","token":"pt_…","room":"1ABC"|null,"view":{"w":1280,"h":720},"fallbackNick":"Evandro","mode":0|1,"teamSize":1..4,"party":"0ABC"|null}`
  - `mode`: `MODE.FREE` (0, padrão) ou `MODE.BR` (1). Id desconhecido cai no Livre — cliente antigo nunca muda de jogo.
  - `party`: código do lobby de equipe; todos os membros caem na MESMA sala e na MESMA equipe (`Room._teamFor`).
- `{"t":"chat","text":"…"}` — o ESCOPO é do servidor (sala no Livre e no Battle Royale solo; equipe em equipe).
- `{"t":"spectate","dir":1|-1}` ou `{"t":"spectate","slot":7}` — só de quem já morreu: troca a câmera. `dir` anda na lista de VIVOS por massa (a mesma do placar); alvo morto/inexistente cai na escolha automática do servidor, em vez de deixar a câmera num fantasma.
- `{"t":"resume","sessionId":"uuid","resumeToken":"hex","view":{"w","h"}}`
- `{"t":"view","w":…,"h":…}` (resize)
- `{"t":"ping","c":<performance.now() u32>}`

Binário `VOICE_UP` (0x02): `u8 0x02 | u8 codec | u16 durMs | u16 len | bytes`. Clipe de push-to-talk (Ctrl). `codec 0` = µ-law 8 kHz mono. O servidor NÃO decodifica: valida tamanho (`VOICE.MAX_BYTES`), duração (`MIN_MS`..`MAX_MS`), o cooldown do jogador (`CD_MS`) e o teto da sala (`ROOM_CPS`), e relaya. O `maxPayload` do WS acompanha `VOICE.MAX_BYTES` — com os 4 KB de antes o `ws` derrubava o frame e a conexão junto.

Binário `INPUT` (10 bytes): `u8 0x01 | u16 seq | u16 tx | u16 ty | u8 flags | u16 clientTick(low)`.
`flags`: `SPLIT=1, EJECT=2, EJECT_HOLD=4, FIRE=8, AIM=16` (AIM acompanha FIRE: tiro **mirado** — o míssil trava no objeto mais próximo dentro do cone ±MISSILE.AIM_CONE em volta de `tx,ty` (peça inimiga, míssil inimigo ou asteroide, até AIM_RANGE) e só vai reto se o cone estiver vazio). `tx,ty` quantizados como posição. Ações são one-shot por `seq`: o
servidor processa cada `seq` uma vez (guarda `lastSeq`); o cliente reenvia a flag nos inputs seguintes até `ackSeq >= seq`.
Taxa: ≤ 30 Hz e só quando muda (>2 px ou flag); keepalive a 10 Hz.

## Servidor → cliente
JSON:
- `{"t":"room","code":"1ABC","shard":1,"slot":3,"sessionId":"uuid","resumeToken":"hex","protocol":9,"tick":123,"world":{"w":9600,"h":9600},"round":{"start":0,"ticks":216000,"dayStart":5,"breakMs":15000,"phase":"live"|"lobby","startsAt":<tick>},"mode":0,"teamSize":1,"cap":30,"team":-1}`
  - `phase`/`startsAt`: no Battle Royale a sala nasce em **lobby** — o jogador está na SALA, não no MAPA (sem peça, sem snapshot). `startsAt` é o TICK da largada, e só existe depois que a contagem começa.
  - `team`: minha equipe (−1 = sem equipe). Quem é aliado de quem sai daqui e do `team` de cada linha do PLAYERS.
- `{"t":"lobby","code":"1ABC","mode":1,"teamSize":1,"filled":37,"cap":50,"humans":2,"startsInMs":0,"waitMs":11500}` (2 Hz) — a sala ENCHENDO. Vai em **milissegundos**, não em ticks: no lobby não há snapshot nenhum, então o relógio de tick do cliente nunca sincronizaria e uma contagem em ticks ficaria parada. `startsInMs > 0` = a contagem regressiva já começou; `waitMs` é o que resta da janela de espera.
- `{"t":"phase","phase":"live","round":{…},"players":12,"cap":50,"teamSize":2,"mode":1}` — a LARGADA: a sala completou, sorteou as equipes, fez todo mundo nascer num anel e armou a zona.
- `{"t":"chat","slot":3,"name":"Evandro","team":2|null,"text":"…","at":1699999999}` — já filtrado pelo escopo do modo.
  - `round`: tick de início e duração da rodada (1 h). O cliente deriva daí o **relógio do espaço** (a rodada = `ROUND.DAYS` dias, começando em `dayStart` → um dia a cada 15 min, 12 trocas de céu) e a contagem para o fim do mundo — nada mais vai no fio.
- `{"t":"roundEnd","code":"1ABC","reason":"time"|"lastAlive","mode":0,"teamSize":1,"champion":{…},"champTeam":null,"board":[{"slot","name","mass","score","kills","isBot","registered","skinId","team","placement"}],"nextInMs":15000,"tick":216000}` — o BIG CRUNCH: campeão = maior planeta vivo (1ª linha do placar); a sala é aposentada e o cliente entra numa nova depois de `nextInMs`.
- `{"t":"error","code":"VERSION"|"FULL"|"AUTH"|"NICK_RESERVED"|"RATE"|"ROOM","message":"pt-BR","suggestion":"Nick_4821"?}` → o servidor fecha o socket (código 4400+).
- `{"t":"rewards","saved":true,"coinsEarned":54,"coins":2504,"achievements":[{"key","title"}],"skinsUnlocked":[35],"rank":{"day":37}}` (após a morte; `saved:false` sem banco)
- `{"t":"dead","by":"Nome","byHole":false,"byZone":false,"score":6900,"maxMass":4820,"kills":3,"durationS":372,"placement":7,"players":50}` — `byZone`: a zona alcançou; `placement`/`players` só no Battle Royale.
- `{"t":"spectate","slot":7,"name":"Nome","vivos":31}` (ou `slot:-1`) — logo depois do `dead` e sempre que o alvo muda: de quem é a cena que
  continua rodando atrás da tela de morte (quem matou, se ainda vivo; senão o líder). O cliente leva a câmera para esse slot e a
  **AOI da sessão acompanha o mesmo jogador** (server/src/net/snapshot.js), então o que se vê é a sala de verdade e não um pedaço
  parado de espaço. Sem alvo vivo (`slot:-1`) a câmera congela onde estava.

Binário (primeiro byte = tipo):
- `0x10 SNAPSHOT`: `u8 | u32 tick | u16 ackSeq | u16 nCreate | u16 nUpdate | u16 nRemove | creates | updates | removes | self`
  - create: `u8 kind | u32 id | u16 x | u16 y | u16 r10 |` + por kind:
    - `PIECE=1`: `u16 ownerSlot | i16 vx | i16 vy | u8 flags(SHIELD=1,LAUNCH=2,MERGING=4,ME=8,MAGNET=16; bits 5–6 = nível do escudo 1..3)` — ímã e escudo são **por peça**: estas flags são a fonte (duas partes do mesmo planeta podem estar diferentes)
    - `FOOD=2`: `u8 type (0 dust,1 comet,2 star,3 rock,4 ammo,5 fusão,6 magnet,7 shield) | u8 hue(0..11)` — o 5 era o powerup de velocidade (removido) e hoje é o de **fusão**
    - `EJECT=3`: `u16 ownerSlot | u8 fragKind | i16 vx | i16 vy` — **fragmento**, não pelota de tamanho fixo: o `r` do
      cabeçalho é `fragR(mass)` (`shared/constants.js`), então **o tamanho na tela é o valor** — o pedaço arrancado de
      um planetão chega gordo e engorda muito mais quem o pegar. A massa em si nunca vai no fio (o servidor é quem a
      credita). `fragKind` = `FRAG_KIND`: `0 PLAIN` (pelota comum), `1 RICH` (pedaço gordo, `mass ≥ FRAG.RICH_MASS`:
      o ímã o arrasta devagar e ele dura o dobro), `2 NOVA` (estilhaço de supernova — o cliente usa a frame
      brilhante do atlas e o faz latejar). A **cor** continua vindo do `ownerSlot` (skin do dono); `65535` = sem dono.
    - `ASTEROID=4`: `u16 seed | i16 vx | i16 vy`
    - `BLACKHOLE=5`: `u16 seed | u16 influenceR | u8 phase(0 grow,1 active,2 fade)`
    - `STAR=7`: `u16 seed | u16 haloR (= r·STAR.HALO·k; k dá a rampa de nascimento) | u8 phase(0 grow,1 active,2 old — inchando para a supernova)`
    - `MISSILE=6`: `u16 ownerSlot | u16 targetSlot (65535 = sem alvo ou alvo é outro míssil) | i16 vx | i16 vy | u8 weapon` — `weapon` = `WEAPON.*` (o `hue` do corpo, que é livre no míssil): é o que faz a Rajada e o Cacho terem sprite e som próprios
  - update: `u32 id | u8 mask` + campos presentes na ordem: `X_Y=1 (u16 x,u16 y)`, `R=2 (u16 r10)`, `V=4 (i16 vx,i16 vy)`, `FLAGS=8 (u8)`, `EXTRA=16 (u8 phase + u16 influenceR — buraco negro e estrela)`
  - remove: `u32 id | u8 reason (0 LEFT_AOI,1 EATEN,2 MERGED,3 POPPED,4 EXPIRED,5 SUCKED,6 DESPAWN)`
  - self: `u8 flags(DEAD=1,RESYNC=2 — descarte as entidades conhecidas antes de aplicar este snapshot) | u8 missiles | u8 powerupBits(magnet=1,shield=2) | u16 magnetT | u8 shieldLv(0..3; o escudo não expira) | u32 score | u8 splitCd | u8 ejectCd | u16 fireCd(carência de tiro do spawn, ticks) | u16 rank | u32 mass | u8 threat | u8 threatDir` (22 bytes)
    - `weapon`: a arma equipada (uma por jogador; pegar outra troca e reabastece) — `missiles` é a munição DELA. `alive`: quantos jogadores ainda estão vivos (o "restam N" do Battle Royale).
    - `flags` ganhou `LOBBY=4` (a partida não começou) e `ZONE_HURT=8` (estou fora da zona, queimando).
    - `threat`: 0 = nada vindo; 1..255 = quão perto está o míssil teleguiado que mira NESTE slot e está se aproximando (255 = colado), medido em `MISSILE.ALERT_DIST`. `threatDir`: ângulo peça→míssil em 1/256 de volta.
      Vem do servidor de propósito: a AOI de um jogador pequeno tem meia-largura ~1250 px e o míssil nasce muito além disso, então um alerta puramente client-side chegaria com menos de 2 s de sobra. Dentro da AOI o cliente prefere a direção do míssil de verdade (é exata) e só usa `threatDir` fora dela.
    `magnetT`/`shieldLv`/`powerupBits` são o **melhor** entre as peças próprias (resumo para o HUD) — quem tem o powerup de fato é cada peça, pelas flags dela. `missiles` é do jogador.
- `0x11 PLAYERS` (no join e quando muda): `u8 | u16 n | [u16 slot | u8 flags(BOT=1,DEAD=2,REG=4,TALK=8) | u8 skinId | u8 team | u8 nameLen | nameLen bytes utf8 | u32 score]`
  - `team`: 255 (`NO_TEAM`) = sem equipe. É por aqui que o cliente pinta o aliado, separa o radar e escolhe quem ouve a voz. `TALK` acende o ícone de quem está falando.
  - ⚠️ No Battle Royale o flag `BOT` **nunca é setado** (`anonBots` no descritor do modo): o preenchimento entra com nome de jogador e o cliente não tem como distingui-lo. Como o `◆` do placar e a cor do radar saem desse flag, os dois param de distinguir sozinhos. O servidor continua sabendo (kills × botKills, economia, conquistas).
- `0x12 LEADERBOARD` (2 Hz): `u8 | u8 n | [u16 slot | u32 mass | u16 x | u16 y]` — **todos os vivos da sala**, não só o top 10.
  É o ÚNICO dado posicional fora da AOI, e é dele que sai o radar com todos os inimigos (o snapshot só conhece a janela
  da sessão). O HUD corta no top 10 e anexa a própria linha pelo `rank` do bloco `self`.
- `0x13 EVENT`: `u8 | u8 kind(0 EAT,1 POP,2 MERGE,3 SPLIT,4 BH_SUCK,5 DEATH,6 CHIP,7 BOUNCE,8 BOOM,9 EXIT (sem emissor: o buraco não teleporta mais; o slot NÃO é renumerado para não versionar o protocolo),10 SHOOT,11 SHIELD_BREAK,12 CLASH,13 DEFLECT,14 SHIELD_HIT,15 SHIELD_UP,16 STAR_BURST,17 SUPERNOVA,18 STAR_HIT,19 STAR_SPLIT,20 SMASH,21 ZONE_SHRINK,22 ZONE_BURN) | u16 x | u16 y | u16 r10 | u16 slotA | u16 slotB | u32 extra`
  - `extra`: BOUNCE/CHIP/SHOOT/DEFLECT/SHIELD_HIT/STAR_HIT/SMASH = `packDir(nx,ny,vn)` (`shared/util.js`: u8 nx, u8 ny, u16 vn — em SHIELD_HIT vn = nível restante, em STAR_HIT vn = hits levados); SHIELD_UP = nível; EAT = pieceId (o cliente usa o slotA para achar quem comeu e animar a absorção); DEATH = score; STAR_BURST/SUPERNOVA/STAR_SPLIT = id da estrela (em SUPERNOVA/STAR_SPLIT `r` é o raio da onda); SMASH = `packDir(nx,ny,0)` com a direção da batida do meteoro (`r` = raio da rocha que se partiu).
  - Eventos são filtrados pela AOI da sessão; o cliente atrasa os que não envolvem o próprio slot pelo atraso de interpolação (casam com o sumiço da entidade).
- `0x14 PONG`: `u8 | u32 clientTime | u32 serverTick`
- `0x15 ZONE` (2 Hz, junto do LEADERBOARD): `u8 | u16 x0 | u16 y0 | u16 r0_10 | u16 x1 | u16 y1 | u16 r1_10 | u32 t0 | u32 t1` — o círculo de ORIGEM, o de DESTINO e os ticks das pontas; o cliente interpola. Parada = origem igual ao destino; `t1 = 0xffffffff` = fechou de vez. A máquina de fases (`shared/src/zone.js`) é só do servidor.
- `0x16 VOICE`: `u8 | u16 slot | u8 codec | u16 durMs | u16 x | u16 y | u16 len | bytes` — clipe relayado. Companheiro de equipe ouve sempre; no Livre e no solo ouvem os `VOICE.LISTENERS` mais próximos dentro de `VOICE.DIST`, e o cliente faz volume/estéreo pela distância com o MESMO cálculo dos efeitos.

## Snapshots e AOI
Sim 60 Hz; snapshot a cada 3 ticks (20 Hz). Área de interesse por sessão = retângulo da câmera (`shared/camera.viewRect`)
expandido 30% (histerese: sai a 45%). `Session.known` guarda ids conhecidos → CREATE ao entrar, UPDATE só se mudou
(comida só quando o ímã/buraco negro a moveu — `FOOD_FLAG.MOVED` → X_Y), REMOVE(LEFT_AOI) ao sair, REMOVE(motivo) ao morrer. Comida tem id estável.
Estrela entra na AOI pelo halo (`max(r, r·HALO·k)`) e manda X_Y (o ímã a arrasta), R (incha na fase OLD) e EXTRA (fase + halo).
Socket congestionado (> 256 KB pendentes): a sessão pula o snapshot e esquece o `known`; o snapshot seguinte vai com `self.flags RESYNC`
para o cliente descartar tudo e recriar (sem isso o que já fora enviado nunca receberia REMOVE e viraria entidade fantasma permanente).

## Predição / interpolação (cliente)
Próprias peças: predição com `shared/physics` (thrust, drag, paredes, separação/merge próprios); ao receber snapshot com
`ackSeq`, substitui pelo estado do servidor e reaplica inputs `seq > ackSeq`; erro residual vira `visualOffset` decaindo
`exp(-dt/0.1s)`; `|Δ| > 120 px` → snap. A peça própria é renderizada INTERPOLADA entre o passo anterior e o atual
(`px + (x−px)·alpha`, alpha = fração do passo acumulada; atraso ≤ 16 ms) — sem isso o acumulador de 60 Hz dá 0/1/2 passos
por frame e a peça treme (muito visível com zoom 1.25× no início). Relógio do servidor: mediana das últimas 8 medições,
usado com slew ≤ 0.02 tick/frame; atraso de interpolação rampa 0.05 tick/frame. Outros: buffer de 10 snapshots, render a
−100 ms (adaptativo até 150), lerp x/y/r; extrapola ≤100 ms; remove com fade após 1 s sem update. REMOVE EATEN/SUCKED/
POPPED/MERGED some no mesmo frame em que tRender alcança o tick da remoção (efeito local: explosão/faísca); EXPIRED/DESPAWN
têm fade de 0,2 s; LEFT_AOI some na hora.

## Sessão
`join` → `room` (slot, sessionId, resumeToken) → `PLAYERS` → snapshots. Queda: 10 s no mundo sem thrust; `resume`
válido religa (reset de `known`). Heartbeat `ws.ping` 5 s / terminate 15 s. Rate limit por sessão: inputs 40/s (burst 60),
JSON 5/s; 3 violações em 10 s → `error RATE`.

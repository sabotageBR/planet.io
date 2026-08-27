# Protocolo de rede planet.io v2

Transporte: WebSocket em `/ws/<shard>`. Mensagens de **controle** são JSON (texto); mensagens de **jogo** são
binárias (`ArrayBuffer`, little-endian, `DataView`). `PROTOCOL_VERSION = 4` (em `shared/src/protocol/constants.js`).
Slots: cada jogador da sala tem um `slot` u16 estável enquanto está na sala. Ids de entidade: u32 incrementais por sala.

## Quantização
- Posição: `u16 = round(x / WORLD_W * 65535)` (idem y com WORLD_H). Decodifica `x = u16 / 65535 * WORLD_W`.
- Raio: `r10 = u16 round(r*10)`.
- Velocidade: `i16 = round(v)` em px/s, clamp ±32767.
- Ticks/tempos: u32 tick da simulação (60 Hz); cooldowns em ticks (u8 = min(255, ticks)).

## Cliente → servidor
JSON:
- `{"t":"join","token":"pt_…","room":"1ABC"|null,"view":{"w":1280,"h":720},"fallbackNick":"Evandro"}`
- `{"t":"resume","sessionId":"uuid","resumeToken":"hex","view":{"w","h"}}`
- `{"t":"view","w":…,"h":…}` (resize)
- `{"t":"ping","c":<performance.now() u32>}`

Binário `INPUT` (10 bytes): `u8 0x01 | u16 seq | u16 tx | u16 ty | u8 flags | u16 clientTick(low)`.
`flags`: `SPLIT=1, EJECT=2, EJECT_HOLD=4, FIRE=8, AIM=16` (AIM acompanha FIRE: tiro **mirado** — o míssil trava no objeto mais próximo dentro do cone ±MISSILE.AIM_CONE em volta de `tx,ty` (peça inimiga, míssil inimigo ou asteroide, até AIM_RANGE) e só vai reto se o cone estiver vazio). `tx,ty` quantizados como posição. Ações são one-shot por `seq`: o
servidor processa cada `seq` uma vez (guarda `lastSeq`); o cliente reenvia a flag nos inputs seguintes até `ackSeq >= seq`.
Taxa: ≤ 30 Hz e só quando muda (>2 px ou flag); keepalive a 10 Hz.

## Servidor → cliente
JSON:
- `{"t":"room","code":"1ABC","shard":1,"slot":3,"sessionId":"uuid","resumeToken":"hex","protocol":4,"tick":123,"world":{"w":7200,"h":7200},"round":{"start":0,"ticks":36000,"dayStart":5,"breakMs":15000}}`
  - `round`: tick de início e duração da rodada (10 min). O cliente deriva daí o **relógio do espaço** (a rodada inteira = um dia, começando em `dayStart`) e a contagem para o fim do mundo — nada mais vai no fio.
- `{"t":"roundEnd","code":"1ABC","champion":{…},"board":[{"slot","name","mass","score","kills","isBot","registered","skinId"}],"nextInMs":15000,"tick":36000}` — o mundo explodiu: campeão = maior planeta vivo (1ª linha do placar); a sala é aposentada e o cliente entra numa nova depois de `nextInMs`.
- `{"t":"error","code":"VERSION"|"FULL"|"AUTH"|"NICK_RESERVED"|"RATE"|"ROOM","message":"pt-BR","suggestion":"Nick_4821"?}` → o servidor fecha o socket (código 4400+).
- `{"t":"rewards","saved":true,"coinsEarned":54,"coins":2504,"achievements":[{"key","title"}],"skinsUnlocked":[35],"rank":{"day":37}}` (após a morte; `saved:false` sem banco)
- `{"t":"dead","by":"Nome","byHole":false,"score":6900,"maxMass":4820,"kills":3,"durationS":372}`

Binário (primeiro byte = tipo):
- `0x10 SNAPSHOT`: `u8 | u32 tick | u16 ackSeq | u16 nCreate | u16 nUpdate | u16 nRemove | creates | updates | removes | self`
  - create: `u8 kind | u32 id | u16 x | u16 y | u16 r10 |` + por kind:
    - `PIECE=1`: `u16 ownerSlot | i16 vx | i16 vy | u8 flags(SHIELD=1,LAUNCH=2,MERGING=4,ME=8,MAGNET=16; bits 5–6 = nível do escudo 1..3)` — ímã e escudo são **por peça**: estas flags são a fonte (duas partes do mesmo planeta podem estar diferentes)
    - `FOOD=2`: `u8 type (0 dust,1 comet,2 star,3 rock,4 ammo,6 magnet,7 shield; 5 vago — powerup de velocidade removido) | u8 hue(0..11)`
    - `EJECT=3`: `u16 ownerSlot | u8 hue | i16 vx | i16 vy`
    - `ASTEROID=4`: `u16 seed | i16 vx | i16 vy`
    - `BLACKHOLE=5`: `u16 seed | u16 influenceR | u8 phase(0 grow,1 active,2 fade)`
    - `STAR=7`: `u16 seed | u16 haloR (= r·STAR.HALO·k; k dá a rampa de nascimento) | u8 phase(0 grow,1 active,2 old — inchando para a supernova)`
    - `MISSILE=6`: `u16 ownerSlot | u16 targetSlot (65535 = sem alvo ou alvo é outro míssil) | i16 vx | i16 vy`
  - update: `u32 id | u8 mask` + campos presentes na ordem: `X_Y=1 (u16 x,u16 y)`, `R=2 (u16 r10)`, `V=4 (i16 vx,i16 vy)`, `FLAGS=8 (u8)`, `EXTRA=16 (u8 phase + u16 influenceR — buraco negro e estrela)`
  - remove: `u32 id | u8 reason (0 LEFT_AOI,1 EATEN,2 MERGED,3 POPPED,4 EXPIRED,5 SUCKED,6 DESPAWN)`
  - self: `u8 flags(DEAD=1,RESYNC=2 — descarte as entidades conhecidas antes de aplicar este snapshot) | u8 missiles | u8 powerupBits(magnet=1,shield=2) | u16 magnetT | u8 shieldLv(0..3; o escudo não expira) | u32 score | u8 splitCd | u8 ejectCd | u16 rank | u32 mass` (18 bytes)
    `magnetT`/`shieldLv`/`powerupBits` são o **melhor** entre as peças próprias (resumo para o HUD) — quem tem o powerup de fato é cada peça, pelas flags dela. `missiles` é do jogador.
- `0x11 PLAYERS` (no join e quando muda): `u8 | u16 n | [u16 slot | u8 flags(BOT=1,DEAD=2,REG=4) | u8 skinId | u8 nameLen | nameLen bytes utf8 | u32 score]`
- `0x12 LEADERBOARD` (2 Hz): `u8 | u8 n | [u16 slot | u32 mass]`
- `0x13 EVENT`: `u8 | u8 kind(0 EAT,1 POP,2 MERGE,3 SPLIT,4 BH_SUCK,5 DEATH,6 CHIP,7 BOUNCE,8 BOOM,9 EXIT,10 SHOOT,11 SHIELD_BREAK,12 CLASH,13 DEFLECT,14 SHIELD_HIT,15 SHIELD_UP,16 STAR_BURST,17 SUPERNOVA) | u16 x | u16 y | u16 r10 | u16 slotA | u16 slotB | u32 extra`
  - `extra`: BOUNCE/CHIP/SHOOT/DEFLECT/SHIELD_HIT = `packDir(nx,ny,vn)` (`shared/util.js`: u8 nx, u8 ny, u16 vn — em SHIELD_HIT vn = nível restante); SHIELD_UP = nível; EAT = pieceId; DEATH = score; STAR_BURST/SUPERNOVA = id da estrela (em SUPERNOVA `r` é o raio da explosão).
  - Eventos são filtrados pela AOI da sessão; o cliente atrasa os que não envolvem o próprio slot pelo atraso de interpolação (casam com o sumiço da entidade).
- `0x14 PONG`: `u8 | u32 clientTime | u32 serverTick`

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

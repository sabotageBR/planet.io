# API HTTP warspace.io v2 (`/api/*`, qualquer shard responde)

JSON; erros `{error:'code', message:'pt-BR'}`; `Cache-Control: no-store`; body ≤ 16 KB; `Authorization: Bearer pt_…` onde marcado 🔒.
Token opaco (`pt_` + 32 bytes base64url), guardado como sha256 em `auth_tokens`. Sem JWT, sem SESSION_SECRET.

**CORS** (`server/src/http/cors.js`, env `ALLOWED_ORIGINS`; vazia = fechado, que é o default): o cliente também roda
hospedado por portais de jogos, no domínio deles. Superfície = `/api/*` **menos** `/api/admin/*` (o painel é sempre
same-origin). Origem permitida (exata ou sufixo `https://*.itch.zone`) recebe o eco em `Access-Control-Allow-Origin`
+ `Vary: Origin`; origem desconhecida recebe a resposta normal **sem** o header (nunca 403 — o navegador manda
`Origin` em todo POST same-origin). `OPTIONS` é respondido com 204 antes do roteamento, com
`Allow-Headers: Authorization, Content-Type` e `Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS`.
`GET /api/avatar/:id` é a exceção: sai com `*` e sem `Vary`, porque é público e `immutable` por um ano.
⚠️ **Nada disso manda `Allow-Credentials`, e o `*` do avatar só é seguro porque não existe cookie no projeto** —
a auth é Bearer em localStorage. Antes do primeiro `Set-Cookie`, revise esse arquivo.
O WebSocket não é sujeito a CORS e sempre atravessou origens; `WS_ORIGIN_CHECK` (`off|warn|on`) é um gate separado
no handshake, e origem AUSENTE é sempre aceita.

| método | rota | body | resposta |
|---|---|---|---|
| POST | `/api/auth/guest` | `{nick?}` | 201 `{token,user}` · 400 `invalid_nick` · 429 |
| POST | `/api/auth/claim` 🔒 | `{login?,password,email?}` | `{user}` · 400 `already_registered`/`invalid_login` · 409 `login_taken {suggestion}`/`email_taken` |
| POST | `/api/auth/login` | `{login,password}` | `{token,user}` · 401 `invalid_credentials` · 429 — `login` é o USUÁRIO congelado no claim ou o e-mail |
| POST | `/api/auth/logout` 🔒 | — | 204 |
| POST | `/api/auth/crazygames` (🔒 opcional) | `{userToken, nick?}` | `{token,user}` · 401 `invalid_credentials` · 503 `crazygames_disabled` — o JWT do SDK deles, verificado por nós (RS256 contra `sdk.crazygames.com/publicKey.json`); identidade = `userId`, e o `username` vira `display_name` |
| POST | `/api/auth/google` (🔒 opcional) | `{idToken, nick?}` | `{token,user}` · 401 `invalid_credentials` · 409 `email_taken` · 503 `google_disabled` — conta de Google não tem senha, logo não tem `login` |
| GET | `/api/me` 🔒 | — | `{user:{id,nick,login?,kind,coins,equippedSkin,createdAt}, skins:[ids], prefs, stats, achievements:[keys]}` |
| PATCH | `/api/me` 🔒 | `{nick}` | `{user}` · 400 `invalid_nick` — o nick é LIVRE, não há 409 |
| PATCH | `/api/me/prefs` 🔒 | `{…}` (whitelist: quality, showNames, showMass, showGrid, showMinimap, showFps, sound, music, ambience, volume, musicVolume, chat, voice, voiceVolume, joystick, holdEject, rightSplit, keySplit/keyEject (`KeyboardEvent.code` de `ACTION_KEYS`), theme('auto'|'dawn'|'sunset'|'dusk'), lang('auto'|'pt-BR'|'en'|'es'), reduceMotion, bigText, colorblind, lbSize) | `{prefs}` |
| GET | `/api/me/history?limit=20&before=<id>` 🔒 | — | `{matches:[{id,endedAt,score,maxMass,kills,durationS,cause,coinsEarned,roomCode,by}]}` |
| GET | `/api/skins` (🔒 opcional) | — | `{skins:[catálogo], owned:[ids], equipped, adReward}` — `adReward` é a skin resgatada por anúncio, ou `null` |
| POST | `/api/skins/:id/buy` 🔒 | — | `{coins, owned}` · 402 `insufficient_coins` · 409 `already_owned` · 403 `not_purchasable` |
| POST | `/api/skins/reward-ad` 🔒 | `{skinId}` (uma de `AD_REWARD_SKINS`, hoje as 3 mascote) | `{owned}` · 400 `bad_request` (skin fora da lista) · 409 `already_owned` · 409 `already_claimed` — 1 recompensa por CONTA, o cliente já assistiu o `rewardedBreak` do portal antes de chamar |
| POST | `/api/skins/:id/equip` 🔒 | — | `{equippedSkin}` · 403 `not_owned` |
| GET | `/api/ranking?period=all\|week\|day&by=score\|mass\|kills\|total\|food\|xp\|kd&limit=50&country=BR` (🔒 opcional) | — | `{period,by,rows:[{rank,userId,nick,name,registered,country,level,xp,kills,deaths,foodEaten,value}], me:{rank,value}\|null}` — `name` é o nome da CONTA (o do Google); o cliente ordena sempre por `xp` |
| GET | `/api/config` | — | `{shards, shard, roomMax, protocol, googleClientId}` |
| GET | `/api/rooms?mode=` · `/api/auto?mode=&teamSize=` | — | `{rooms:[{code,shard,mode,teamSize,phase,open,players,max,bots,round,private,host}]}` · a sala. `round` é `null` numa sala SEM FIM (diferente de `0`, que é "acabou"); salas **privadas não aparecem** aqui nem no automático |
| POST | `/api/rooms` 🔒 | `{mode,teamSize,minutes,private}` | `{room,you:{host:true}}` · 403 `need_account` (convidado não pode ser dono) · 409 `bad_time` · 503 `no_game`. `minutes` vem de `ROUND.CHOICES_MIN`; **0 = sem fim, e só no Livre** (no Battle Royale o tempo é a rede de segurança da zona, e o piso é `ZONE_TOTAL_TICKS`) |
| GET | `/api/room/:code` | — | `{room}` · 404 `not_found` · 503 `peer_unreachable`. É o link de convite: o cliente precisa do MODO antes de entrar. **Roteia pelo dono** do código (`askPeers`), como o party |
| POST | `/api/party` 🔒 | `{mode,teamSize,nick,skinId}` | `{party,you:{key,leader}}` · 401 sem token · 409 `bad_team_size` |
| GET | `/api/party/:code` | — | `{party,you}` · 404 `not_found` · 503 `peer_unreachable` (o shard dono não respondeu) |
| POST | `/api/party/:code/join` 🔒 | `{nick,skinId}` | `{party,you}` · 409 `full`/`started` · 404 · 503 |
| POST | `/api/party/:code/leave` 🔒 | — | `{ok,dissolved?}` (o líder saindo dissolve o lobby) · 503 |
| POST | `/api/party/:code/start` 🔒 | `{room}` | `{party}` · 403 `not_leader` · 503 |
| **PAINEL** | **`/api/admin/*`** — ver `docs/spec/admin.md` | | |
| GET | `/healthz` | — | `{ok, shard, rooms, players, tick:{p50,p99,max,overruns}, loopLagMs:{p50,p99}, net:{outKBps,inMsgps,rateLimitHits}, db:'ok'\|'down', queue, protocol}` |

Regras de **nick**: 2–16 chars, NFKC, espaços colapsados — e mais nada. Ele é LIVRE: dois jogadores podem se
chamar "Messi" (com a caricatura do Messi, que sai do nick). A ÚNICA unicidade é POR SALA, no join de WS
(`NICK_IN_ROOM`), porque nick repetido faz o kill feed, o chat e o placar mentirem. Guest sem nick → `Viajante-NNNN`.
Regras de **login** (o nome de ENTRAR): mesmas do nick, sem `@`, ÚNICO case-insensitive (`users_login_uq`). Nasce no
`claim` — do corpo, ou do nick da hora quando o corpo não manda — e NÃO muda mais (só pelo `/admin`); sugestão
`Nick_NNNN` no 409. Conta de Google e convidado não têm login. Era o nick que carregava isso até a migração 0009.
**Login com Google** (`/api/auth/google`): o cliente manda o `id_token` do Google Identity Services e o
servidor o valida contra o `tokeninfo` (`aud` = o nosso clientId, `iss`, `exp`, `email_verified`). Não há
troca de *code*, então o `client_secret` não existe deste lado. `googleClientId` vazio em `/api/config` é o
interruptor: a rota devolve 503 e o cliente nem baixa o SDK. Quatro caminhos, nesta ordem: (1) identidade
`(provider,subject)` conhecida → entra; (2) o e-mail verificado já é de uma conta → a identidade é ligada
ÀQUELA conta (senão o INSERT bateria em `users_email_uq` e a rota devolvia 500); (3) veio `Bearer` de um
**guest** → aquele guest é promovido, preservando moedas, skins e histórico; (4) senão, conta nova com o
mesmo bônus de boas-vindas. O nick vindo do Google é CORTADO para caber em 16 e ganha sufixo se colidir —
entrar com Google não falha por causa do nome; um `nick` explícito no corpo continua estrito.

Rate limit em memória por pod: guest 5/h/IP · login 10/15min/IP e 5 falhas/15min/nick · claim/PATCH 10/min/token · demais 60/min/IP.
Economia (servidor): `coins = ⌊score/300⌋ + 2·kills + 1·botKills + (duração ≥ 300 s ? 25 : 0)`, cap 500/partida; +100 por conquista nova.
No **Battle Royale** soma o bônus de COLOCAÇÃO (`PLACE_COINS`: 250 no 1º, 120 até o 3º, 60 até o 10º, 20 na metade de cima):
lá o que vale é onde você parou, não a massa — sem ele, 2º de 50 pagaria o mesmo que 49º.
Conquistas (fim de partida): survive5 (≥300 s), mass5000, streak5 (≥5 abates na vida), top1_3min (≥ 3·60·60 ticks em 1º),
explore4 (4 quadrantes), eat50/eatbots10/split100/eject200/games10 (cumulativos em user_stats); secret1–4 = false.
Battle Royale (só com `players ≥ 10`, para vencer numa sala de 3 não valer o mesmo): br_win (1º), br_top10, br_team_win (1º em equipe).

**Lobby de equipe** (`/api/party*`): mora no servidor de JOGO, não na API de persistência — é estado de sala
(memória do shard, TTL de 20 min), funciona **sem banco** e vale para convidado. A pessoa é identificada pelo
hash do mesmo token `pt_…` (nunca pelo IP: dois jogadores atrás do mesmo NAT virariam a mesma pessoa). O código
reusa `rooms/codes.js`, cujo 1º char é o shard, então o CÓDIGO diz quem é o dono do lobby. Como o Ingress
balanceia `/api` entre os pods, quem recebe a chamada e não é o dono **encaminha** para os irmãos em
`/internal/party/*` (rota não publicada, que nunca reencaminha) repassando o `Authorization`, e devolve a
resposta do dono. Irmão fora do ar vira `503 peer_unreachable` — **nunca 404**, que é o que faz o cliente
desfazer a equipe. Sem isso 2 em cada 3 chamadas caíam no pod errado e a tela de equipe se fechava sozinha.

Sem banco (`DATABASE_URL` ausente ou Secret `warspace-db` faltando): as rotas de conta respondem `503 {error:"unreachable"}` e o
cliente usa um perfil local (`localStorage`), mas continua entrando nas salas reais (`api.server` = `/api/config` ok; `api.online` = contas ok).

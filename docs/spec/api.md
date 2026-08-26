# API HTTP planet.io v2 (`/api/*`, qualquer shard responde)

JSON; erros `{error:'code', message:'pt-BR'}`; `Cache-Control: no-store`; body ≤ 16 KB; `Authorization: Bearer pt_…` onde marcado 🔒.
Token opaco (`pt_` + 32 bytes base64url), guardado como sha256 em `auth_tokens`. Sem JWT, sem SESSION_SECRET.

| método | rota | body | resposta |
|---|---|---|---|
| POST | `/api/auth/guest` | `{nick?}` | 201 `{token,user}` · 409 `nick_reserved {suggestion}` · 429 |
| POST | `/api/auth/claim` 🔒 | `{password,email?}` | `{user}` · 400 `already_registered` · 409 `nick_reserved` |
| POST | `/api/auth/login` | `{login,password}` | `{token,user}` · 401 `invalid_credentials` · 429 |
| POST | `/api/auth/logout` 🔒 | — | 204 |
| GET | `/api/me` 🔒 | — | `{user:{id,nick,kind,coins,equippedSkin,createdAt}, skins:[ids], prefs, stats, achievements:[keys]}` |
| PATCH | `/api/me` 🔒 | `{nick}` | `{user}` · 409 `nick_reserved {suggestion}` |
| PATCH | `/api/me/prefs` 🔒 | `{…}` (whitelist: quality, showNames, showMass, showGrid, showMinimap, showFps, sound, music, volume, joystick, holdEject, rightSplit, theme('auto'|'dawn'|'sunset'|'dusk'), reduceMotion, bigText, colorblind, lbSize) | `{prefs}` |
| GET | `/api/me/history?limit=20&before=<id>` 🔒 | — | `{matches:[{id,endedAt,score,maxMass,kills,durationS,cause,coinsEarned,roomCode,by}]}` |
| GET | `/api/skins` (🔒 opcional) | — | `{skins:[catálogo], owned:[ids], equipped}` |
| POST | `/api/skins/:id/buy` 🔒 | — | `{coins, owned}` · 402 `insufficient_coins` · 409 `already_owned` · 403 `not_purchasable` |
| POST | `/api/skins/:id/equip` 🔒 | — | `{equippedSkin}` · 403 `not_owned` |
| GET | `/api/ranking?period=all\|week\|day&by=score\|mass\|kills\|total&limit=50` (🔒 opcional) | — | `{period,by,rows:[{rank,userId,nick,registered,value}], me:{rank,value}\|null}` |
| GET | `/api/config` | — | `{shards, shard, roomMax, protocol}` |
| GET | `/api/rooms` · `/api/auto` | — | `{rooms:[{code,shard,players,max,bots}]}` · `{code,shard,players,max,bots}` |
| GET | `/healthz` | — | `{ok, shard, rooms, players, tick:{p50,p99,max,overruns}, loopLagMs:{p50,p99}, net:{outKBps,inMsgps,rateLimitHits}, db:'ok'\|'down', queue, protocol}` |

Regras de nick: 2–16 chars, NFKC, espaços colapsados; registrado único case-insensitive; guest não pode usar nick de
registrado (checado em guest/PATCH/join) — sugestão `Nick_NNNN`; guest sem nick → `Viajante-NNNN`.
Rate limit em memória por pod: guest 5/h/IP · login 10/15min/IP e 5 falhas/15min/nick · claim/PATCH 10/min/token · demais 60/min/IP.
Economia (servidor): `coins = ⌊score/300⌋ + 2·kills + 1·botKills + (duração ≥ 300 s ? 25 : 0)`, cap 500/partida; +100 por conquista nova.
Conquistas (fim de partida): survive5 (≥300 s), mass5000, streak5 (≥5 abates na vida), top1_3min (≥ 3·60·60 ticks em 1º),
explore4 (4 quadrantes), eat50/eatbots10/split100/eject200/games10 (cumulativos em user_stats); secret1–4 = false.

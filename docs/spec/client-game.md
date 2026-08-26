# Cliente de jogo v2 — `client/src/game/` (PixiJS v8)

Contrato com o app React (já usado pelo shell): 
`createGame({container, hud, prefs, theme, onDead, onRewards, onConnection, onError})` →
`{join({token,fallbackNick,room}), leave(), setPrefs(p), setTheme(t), resize(), destroy(), hudStore}`.
`hudStore` = `{subscribe(fn), get()}` com `{mass,score,rank,coins,ammo,powerups:{speed,magnet,shield},splitCd,ejectCd,lb:[{slot,name,mass,isBot,registered,me,rank}],room,ping,fps,dead}` atualizado a 8 Hz.
`onConnection(state)`: `'connecting'|'open'|'reconnecting'|'closed'` (+ tentativa); `onDead(info)` com o JSON `dead`; `onRewards(rewards)`.

```
game/index.js          createGame (orquestra tudo abaixo)
game/net/Connection.js ws `${wss}://${host}/ws/${shard}`; join/resume; heartbeat; backoff 0.5→4 s; PROTOCOL_VERSION mismatch → recarrega
game/net/InputSender.js 30 Hz on-change (>2 px ou flag), keepalive 10 Hz, seq u16, fila de ações até ack
game/state/SnapshotBuffer.js  últimos 10 snapshots por tick; relógio do servidor (EMA); entidades por id com histórico
game/state/Interpolator.js    outros: render a tRender = tickEstimado − NET.INTERP_DELAY (adaptativo ≤ INTERP_MAX); lerp x/y/r; extrapola ≤ EXTRAP_MAX; fade após 1 s
game/state/Predictor.js       próprias peças: shared/physics/predict.js stepOwnPieces + replay de inputs > ackSeq; visualOffset decai exp(−dt/0.1); snap > NET.SNAP_DIST
game/state/WorldView.js       entidades prontas para render (pos/r/alpha) + players (PLAYERS msg) + leaderboard + self
game/renderer/Renderer.js     Pixi Application (webgl, resolution min(dpr,2), autoDensity, resizeTo container, antialias false, backgroundAlpha 0)
game/renderer/Camera.js       shared/camera focusOf/zoomFor; suavização 1−exp(−dt/τ) (τ 120 ms pos, 200 ms zoom); zoom base retrato
game/renderer/TextureCache.js theme.textures.* → canvas → Texture (mipmaps); tiers 128/256/512 por raio; atlas de comida/ejetados p/ ParticleContainer; invalida ao trocar tema
game/renderer/layers/Background.js  bake do fundo por resolução (theme.textures.background) + camadas parallax (theme.bandLayers) + big stars + props (silhuetas do mundo)
game/renderer/layers/Grid.js        TilingSprite do tile de grade (theme) — respeita prefs.showGrid
game/renderer/layers/Food.js / Ejected.js   ParticleContainer
game/renderer/layers/Hazards.js     asteroides (rotate por seed+tick), buracos negros (núcleo + anel girando + anel de influência)
game/renderer/layers/Planets.js     pool: body sprite (tier), ring, BitmapText nome/massa (prefs.showNames/showMass), arco de merge, anéis de powerup; trilha (theme.hud.trail) como Graphics polilinha
game/renderer/layers/Missiles.js, Fx.js (theme.effects.fx(kind,k,params) → primitivas Graphics/Text; pool ≤ 32)
game/input/{Pointer,Keyboard,Touch,actions}.js  pointer events unificados; Space split, W eject (hold), F/clique míssil, botão direito split (prefs.rightSplit); botões DOM #t-split/#t-eject/#t-fire (o HUD React chama game.action('split'|'eject'|'fire', pressed))
game/hud/Minimap.js     canvas 2D pequeno (10 Hz) desenhado no #radar (DOM) conforme theme.hud.radar
game/bench.js           ?bench (mundo local do shared com bots, pior caso) e ?stats overlay
```

Regras: nenhuma cor fora de `theme/`; texturas assadas só via `theme.textures`; nada de filtros/blur por frame; culling manual por retângulo da câmera; modo econômico automático (frame > 20 ms por 2 s → resolution 1, parallax off, fx reduzidos).
Metas: ≤ 5 ms/frame desktop, ≤ 10 ms mobile, ≤ 40 draw calls, texturas ≤ 48 MB.

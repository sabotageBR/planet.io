# Motor do jogo v2 — `client/src/game/` (PixiJS 8)

Contrato com o shell React (inalterado): `createGame({container,hud,prefs,theme,onDead,onRewards,onConnection})` →
`{join({token,fallbackNick,room,local?,skinId?}), leave(), setPrefs, setTheme, resize, destroy, hudStore}` (ver cabeçalho de `index.js`).

```
index.js                orquestra: rede → buffer/predição/interpolação → WorldView → câmera → renderer; HUD 8 Hz; radar 10 Hz; modo econômico
net/Connection.js       ws /ws/<shard> (shard = 1º char do código, base36) ou socket falso; join/resume; backoff 0.5→4 s ×5; ping 1 Hz; VERSION → reload
net/InputSender.js      INPUT 30 Hz on-change (>2 px/flag), keepalive 10 Hz, seq u16, flags pendentes até ack, EJECT_HOLD, histórico p/ replay
net/LocalServer.js      servidor na página (World do shared + bots + codec real) — ?local=1, offline (api.online===false), ?bench, ?lag=ms
state/SnapshotBuffer.js entidades por id (últimas 10 amostras) + relógio do servidor (EMA)
state/Interpolator.js   outros: tRender = est − 100 ms (adaptativo ≤ 150), lerp x/y/r, extrapola ≤ 100 ms, fade 1 s
state/Predictor.js      próprias peças: stepOwnPieces a 60 Hz + replay dos inputs após o snapshot; visualOffset exp(−dt/0.1); snap > 120 px
state/WorldView.js      players (PLAYERS), placar (LEADERBOARD), self, listas por tipo prontas p/ render
renderer/               Renderer (Pixi Application), Camera, TextureCache (tema → canvas → Texture, LRU 48 MB), layers/*
input/                  Pointer (mouse+toque no canvas), Keyboard (Space/W/F), Touch (warspace:action do HUD), actions
hud/Minimap.js          #radar (canvas 2D no #hud) conforme theme.hud.radar
bench.js                overlay ?bench / ?stats
```

## Dev

- `cd client && npx vite --port 5173` → `http://localhost:5173/?screen=game&local=1` joga contra o servidor local (sem backend).
  Sem `local=1`, com o backend fora do ar o app entra em modo offline e o motor também usa o LocalServer.
- `?bench` — pior caso (8 peças próprias, ~400 comidas visíveis, 40 asteroides, 3 buracos, bots ao redor) + overlay de tempos
  (update/render, p95), draw calls estimados, contagens, texturas.
- `?stats` — o mesmo overlay numa partida real: RTT, offset do relógio, atraso de interpolação, buffer, bytes/s, correção média da predição.
- `?lag=80` — latência simulada (ida e volta) no LocalServer. `?theme=dawn|sunset|dusk` força o tema. `?seed=N` semente do mundo local.
- `window.__game.debug.stats()` expõe conn/buffer/interp/predictor/view/cam/renderer.

## Regras

Nenhuma cor fora de `theme/`; sprites só via `theme.textures` (TextureCache); sem filtros/blur; culling manual pelo retângulo da câmera;
modo econômico automático (frame > 20 ms por 2 s → resolução 1, parallax off, fx pela metade; reavalia em 30 s).

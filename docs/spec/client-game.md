# Cliente de jogo v2 — `client/src/game/` (PixiJS v8)

Contrato com o app React (já usado pelo shell): 
`createGame({container, hud, prefs, theme, onDead, onRewards, onRoundEnd, onConnection, onError})` →
`{join({token,fallbackNick,room}), leave(), setPrefs(p), setTheme(t), resize(), destroy(), hudStore}`.
`hudStore` = `{subscribe(fn), get()}` com `{mass,score,rank,coins,ammo,powerups:{magnet (s),shield (nível 0..3)},splitCd,ejectCd,lb:[…],room,ping,fps,dead,clock:{h,m,leftS}}` atualizado a 8 Hz (os powerups são o melhor entre as próprias peças — cada peça tem o seu).
`clock` = relógio do espaço da rodada + contagem para o fim do mundo (derivados do tick do servidor e do bloco `round` do JSON `room`);
o shell publica a hora em `state/game.js clockRef` e o relógio de tema (`startThemeClock({getHour})`) troca o céu por ela — na rodada de
1 h passam ROUND.DAYS (4) dias, então são 12 trocas de céu, cada uma com o crossfade do céu em `renderer/layers/Background.js` (só o fundo dissolve).
A virada não pausa nada: o cache de texturas não é invalidado (as chaves já têm o id do tema), as fontes bitmap são instaladas com
`skipKerning` (o kerning do Pixi é O(n²)) e o céu seguinte é assado antes da hora (`renderer.prewarmTheme`, disparado pelo relógio da
rodada) — medido: ~2 ms na troca, contra ~1,3 s antes.
`onRoundEnd({champion,board,nextInMs,mySlot})` abre o BIG CRUNCH com o pódio dos 3 primeiros (`ui/Round.jsx`).
`onConnection(state)`: `'connecting'|'open'|'reconnecting'|'closed'` (+ tentativa); `onDead(info)` com o JSON `dead`; `onRewards(rewards)`.
O JSON `spectate` (depois da morte) diz de quem é a cena que continua rodando atrás da tela de KABOOM: a câmera vai para esse slot.

```
game/index.js          createGame (orquestra tudo abaixo)
game/net/Connection.js ws `${wss}://${host}/ws/${shard}`; join/resume; heartbeat; backoff 0.5→4 s; PROTOCOL_VERSION mismatch → recarrega
game/net/InputSender.js 30 Hz on-change (>2 px ou flag), keepalive 10 Hz, seq u16, fila de ações até ack; nada antes do 1º setTarget (evita o puxão para (0,0))
game/state/SnapshotBuffer.js  últimos 10 snapshots por tick; relógio do servidor (mediana de 8 + slew ≤ 0.02 tick/frame); entidades por id com histórico
game/state/Interpolator.js    outros: render a tRender = tickEstimado − NET.INTERP_DELAY (adaptativo ≤ INTERP_MAX, rampa); lerp x/y/r; extrapola ≤ EXTRAP_MAX; fade após 1 s; REMOVE EATEN/SUCKED/POPPED/MERGED → some no frame + onVanish(e) (fx vanish/spark)
game/state/Predictor.js       próprias peças: shared/physics/predict.js stepOwnPieces + replay de inputs > ackSeq; render interpolado entre passos (px + (x−px)·alpha); visualOffset = renderizado − interpolado, decai exp(−dt/0.1); snap > NET.SNAP_DIST; ressincroniza se o lead (RTT) muda
game/state/WorldView.js       entidades prontas para render (pos/r/alpha) + players (PLAYERS msg) + leaderboard + self
game/renderer/Renderer.js     Pixi Application (webgl, resolution min(dpr,2), autoDensity, resizeTo container, antialias false, backgroundAlpha 0)
game/renderer/Camera.js       shared/camera focusOf/zoomFor (fórmula do agar: min(CAM.BASE/ΣR,1)^.4 × max(H/1080,W/1920));
                              suavização 1−exp(−dt/τ) com o τ do agar: CAM.TAU_POS 24 ms (lá é (view+x)/2 por frame) e TAU_ZOOM 158 ms;
                              sem peças próprias: dentro da sala CONGELA (morto/BIG CRUNCH — a AOI do servidor também congela ou segue o `spectate`), no lobby passeia devagar
game/renderer/TextureCache.js theme.textures.* → canvas → Texture (mipmaps); tiers 128/256/512 por raio; atlas de comida/ejetados p/ ParticleContainer; invalida ao trocar tema; warm() assa ≤ 2/frame + upload GPU (skins da sala ao receber PLAYERS)
game/renderer/layers/Background.js  bake do fundo por resolução (theme.textures.background) + camadas parallax (theme.bandLayers) + big stars + props (silhuetas do mundo)
game/renderer/layers/Grid.js        TilingSprite do tile de grade (theme) — respeita prefs.showGrid
game/renderer/layers/Food.js / Ejected.js   ParticleContainer
game/renderer/layers/Hazards.js     asteroides (rotate por seed+tick), buracos negros (núcleo + anel de influência) e estrelas (sprite jovem/velha pulsando + coroa tracejada no halo; k = haloR/(r·HALO) dá a rampa de nascimento)
game/renderer/layers/Planets.js     blob: com espaço na tela o body vira MeshPlane 9×9 e os vértices são deslocados por frame — beirada
                                    ondulando (peso r⁴, ~2% do raio) + squash na direção do movimento; só nas maiores (WOB_MAX/WOB_MIN_PX),
                                    desligado no modo econômico e com reduceMotion (custo medido: +0,44 ms/frame no ?bench)
                                    pool: body sprite (tier), ring, BitmapText do nome (prefs.showNames; a massa NÃO é escrita no planeta — só HUD/placar), arco de merge, anéis de powerup pelas flags DE CADA PEÇA (escudo por nível: theme.hud.cell.powerups.shieldLevels; ímã → R.ambient); trilha (theme.hud.trail) como Graphics polilinha
game/renderer/layers/Missiles.js, Aim.js (reta pontilhada + seta do tiro mirado e anel no alvo travado, só local), Fx.js (theme.effects.fx(kind,k,params) → primitivas Graphics/Text; pool ≤ 32; add(kind,f,delayMs) atrasa efeitos de terceiros; spark() faíscas ≤ 64 num Graphics; ambient() → theme.effects.ambient)
  Absorção: no EVENT.EAT o motor acha a peça de quem comeu (`nearestPieceOf`), manda `tx/ty/tr` no efeito `eat`, guarda o destino para o `vanish` da vítima (ela voa para lá em vez de só explodir) e chama `planets.pop(id)` — o vencedor incha e achata por 280 ms. Fim da rodada = efeito `bigCrunch` (anéis colapsando) no lugar do antigo clarão de supernova.
game/input/{Pointer,Keyboard,Touch,actions}.js  pointer events unificados; Space split, W eject (hold), botão direito split (prefs.rightSplit);
                       míssil no botão esquerdo/F: a mira ARMA depois de 160 ms segurando (só aí aparece a reta) e SOLTAR dispara com FIRE|AIM (o míssil persegue o alvo do cone); clique rápido = tiro teleguiado de sempre, sem reta; sem munição o down ejeta
game/input/Joystick.js  analógico virtual, só no dedo (`(pointer: coarse)` + prefs.joystick): base dinâmica na metade esquerda, metade direita só mira. Alvo = centróide + û·(SPEED.RAMP·k + spread·JOY.SPREAD_K), encurtado pelo RAIO até caber no mundo. ⚠️ O espalhamento entra porque a rampa do motor é medida por PEÇA e o alvo é UM só: com o alvo a 32 px do centróide, o jogador dividido tinha as peças correndo umas contra as outras (8% da velocidade, e ZERO com o eixo do split alinhado ao rumo). E o corte é do RAIO porque `qPos` e `World.setTarget` saturam por EIXO, o que TORCE a direção perto da borda.
game/input/Wheel.js     roda/pinça → passos de zoom (`stepsFromWheel`, pura: normaliza deltaMode e acumula o trackpad)
game/hud/Minimap.js     canvas 2D pequeno (10 Hz) desenhado no #radar (DOM) conforme theme.hud.radar;
                        os INIMIGOS vêm do LEADERBOARD (todos os vivos, com x,y, a 2 Hz) e não da AOI: o radar mostra o mapa
                        inteiro, com o ponto do tamanho do planeta; perigos e peças próprias continuam vindo da cena
game/bench.js           ?bench (mundo local do shared com bots, pior caso) e ?stats overlay
```

Regras: nenhuma cor fora de `theme/`; texturas assadas só via `theme.textures`; nada de filtros/blur por frame; culling manual por retângulo da câmera; modo econômico automático em 2 níveis pelo tempo REAL entre frames (> 20 ms por 1 s sobe; < 18 ms por 2 s + backoff desce): nível 1 = resolution .8 + sem grade/parallax/trilhas + fx pela metade; nível 2 = resolution .6 + sem props (Opções → Gráficos → Qualidade força Alta/Baixa). Medido no pior caso com render por software: 13 → 37 fps. Antes o gatilho usava o custo de CPU do frame, que não enxerga a GPU, e nunca ligava (fx reduzidos).
Metas: ≤ 5 ms/frame desktop, ≤ 10 ms mobile, ≤ 40 draw calls, texturas ≤ 48 MB.

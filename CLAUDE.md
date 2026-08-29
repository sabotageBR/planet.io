# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
export PATH=$HOME/.local/opt/node22/bin:$PATH   # Node 22 local (o sistema tem 18); .nvmrc = 22
npm install                  # workspaces: shared, server, client
cp .env.example .env         # DATABASE_URL etc. (Postgres de dev: sudo -n docker start planet-pg → 127.0.0.1:5433 planet/planet)
npm run migrate              # aplica server/src/db/migrations/*.sql + seed de skins (também roda no boot com MIGRATE_ON_START=1)
npm run dev                  # server em :3001 (node --watch) + Vite em :5173 com proxy de /api e /ws
npm test                     # node --test: shared/test (física, protocolo) + server/test (persistência, jogo)
                             # ⚠️ persist.test.js faz DROP SCHEMA: exige DATABASE_URL em host LOCAL (guarda no
                             # topo do arquivo). Rode: DATABASE_URL=postgres://planet:planet@127.0.0.1:5433/planet npm test
npm run build                # client/dist (vite build)
./scripts/db-secret.sh       # cria o Secret warspace-db (DATABASE_URL do .env) no cluster
node scripts/brand-assets.mjs       # assa favicon/ícones/og/manifest a partir da marca
./scripts/build-push.sh      # builda (contexto = raiz, -f server/Dockerfile / client/Dockerfile) e publica evandromoura/warspace-io-{server,client}
./scripts/deploy.sh          # aplica k8s/ + Ingress em warspace.io (WARSPACE_HOST=... troca o host, NO_INGRESS=1 pula)
```

Dev sem servidor: o cliente cai em modo offline (perfil local em `localStorage`) e `?local=1` roda um servidor
falso na própria página (`client/src/game/net/LocalServer.js`) — **só o modo Livre**; a tela de modos desabilita
Battle Royale offline. `LOBBY_TICKS=600` no servidor encurta o lobby do Battle Royale para testar. `?bench` = pior caso de render; `?stats` = overlay de rede;
`?sfx` = mesa de som (toca todo o `KIT`, sem entrar em partida).
Mockups aprovados continuam em `mockups/v2/` (CommonJS; `node mockups/v2/src/build.js`) — são a referência visual.

## Layout

```
shared/src/    constants.js (ÚNICA fonte de tunables) · skins.js (94 skins) · achievements.js · levels.js (XP/nível/K-D) · countries.js · eggs.js (nick → skin) · rng.js · camera.js · util.js · zone.js · bot.js
               physics/ (body, spatial-hash, integrate, collide, rules, world, predict) · protocol/ (constants, quant, writer, reader, codec, dto)
server/src/    index.js (composition root + startServer) · loop.js (scheduler 60 Hz) · metrics.js
               llm/ollama.js · rooms/botChat.js · rooms/botPersonas.js (histórias, server-only) · rooms/feed.js (marcos do kill feed)
               sim/ (Sim, hooks) · rooms/ (codes, Room, RoomManager, Party) · net/ (Session, wsServer, snapshot) · http/ (api, peers)
               config.js · log.js · db/ (pool, migrate, migrations/) · auth/ (tokens, password, nick, ratelimit) · repos/ · api/ (router + rotas) · persist/ (session, rewards, queue, hooks)
client/src/    main.jsx · app/ (App, theme bridge) · ui/ (telas React + Round.jsx, Modes/Party/Chat/KillFeed/AvatarPicker, icons.js
               Logo.jsx + logoArt.js = a marca · NavIcons.jsx + navIconArt.js = os ícones da entrada) · util/image.js · api/client.js · state/ (store) · hooks/
               audio/ (index.js motor: 4 barramentos, prioridade de vozes, loops · kit.js receitas · mic.js push-to-talk · audition.js a mesa de som do ?sfx)
               theme/ (index.js + dawn|sunset|dusk: tokens/hud/screens.css gerados por port.js, index.js com textures/effects/hud) · styles/base.css
               game/ (index.js createGame · net/ · state/ · renderer/ · input/ · hud/ · bench.js)
docs/spec/     protocol.md · api.md · hooks.md · server-game.md · client-game.md      docs/design/  telas.md · theme-time.md · rodada-1.md · som.md · modos.md
k8s/           00-namespace · 05-config (ConfigMap) · 10-server (StatefulSet 3 shards, envFrom ConfigMap+Secret) · 20-client
               30-ingress (warspace.io: /ws/0|1|2 por shard, /api no Service agregador, / no cliente; + o 301 de www) · 40-backup
scripts/       build-push.sh · deploy.sh · db-secret.sh · k8s_apply.py (apply via API; Secret, --exists)
legacy         server/legacy/server.cjs e client/legacy/ — versão v1, só referência
```

## Arquitetura

- **Autoridade no servidor, física compartilhada.** `shared/physics` roda a 60 Hz no servidor (`World.step`) e no cliente só para as
  próprias peças (`predict.js`). Determinística: `mulberry32` por sala, tick inteiro, sem gerador nativo. Spatial hash de 128 px.
  Regras: engolir só com `EAT.RATIO` (1.15) e centro dentro; senão quique elástico;
  **conservação de massa** (`FRAG`, `fragR`/`fragLife` em constants): tudo que é arrancado de um planeta (split, lasca, míssil,
  pedágio do buraco negro) vira fragmento com a massa REAL que saiu — só o ejetado pode ter `mass ≠ r²`, e o raio é `fragR(mass)`,
  então o tamanho na tela é o valor e o pedaço de um planetão engorda muito mais quem o pegar; reabsorver devolve tudo
  (`EAT.EJECT_GAIN` = 1) e a massa é medida DEPOIS do piso `MIN_PIECE_R` (senão a peça no mínimo criava massa do nada);
  acima de `FRAG.RICH_MASS` o fragmento dura o dobro, o ímã o arrasta devagar e asteroide não o engole; o tier vai no `hue` do
  EJECT (`FRAG_KIND`, o cliente desenha o de supernova brilhando). Comer jogador também conserva (`EAT.GAIN` = 1, o `√(s1²+s2²)` do agar: a vítima entra inteira). Fonte/sumidouro de propósito:
  a comida reposta sem parar e o berçário da supernova;
  asteroides (cinturões + errantes: pop/chip/alimentar/atirar;
  a rocha SEMPRE explode ao encostar (nunca fica batendo de novo) e com escudo o preço é a VELOCIDADE da batida (`ASTEROID.SHIELD_VN` = [220,520,900] → 1, 2 ou 3 níveis; no topo a rocha
  leva o escudo inteiro E estoura o planeta, e abaixo do 1º limiar nem sente) — enquanto o escudo aguenta não há lasca
  nem pop, só o empurrão curto do quique; a rocha só ENTRA para estourar se a trajetória dela mirar o miolo
  (parâmetro de impacto < r·POP_DIST) — de raspão ela ricocheteia com impulso pela massa, efeito bola de sinuca, em vez de atravessar); estrelas (perigo que **QUEIMA `STAR.BURN` da massa** e estilhaça o resto de quem encosta — a massa queimada SOME do mundo, é a
  única coisa fora do `PLAYER.DECAY` que destrói massa, e sem ela atropelar estrela era LUCRO para o gigante, que se repartia,
  fundia de volta e ainda colhia o berçário; a supernova causada por uma TROMBADA não larga prêmio (`RAM_REWARD`) — e **ela explode e morre no contato** — e,
  ao envelhecer, vira supernova: espalha fragmentos brilhantes que valem `NOVA_PART_MASS` pelotas, chuta os asteroides,
  empurra os planetas por perto e, no miolo `NOVA_SHATTER`,
  estilhaça quem está lá como se tivesse encostado; **míssil e partícula a empurram** e em `STAR.HITS_TO_SPLIT` hits ela **EXPLODE e morre** (um tiro nela já inchando,
  fase OLD, adianta a supernova). Nada de rachar em estrelas menores: isso era um MOTOR DE POPULAÇÃO — cada acerto
  triplicava as estrelas, e com jogadores atirando o mapa virava um mar de estrelas a 6 fps;
  **meteoro grande** (r ≥ `ASTEROID.SMASH_MIN_R`) que trombar nela faz a estrela explodir e morrer, e a rocha morre
  junto — também sem multiplicar; a estrela nasce longe do anel dos cinturões (`BELT_SAFE`), senão vira moedor);
  buracos negros (**DESLIGADOS por enquanto**: `BLACKHOLE.COUNT = 0`, porque a mecânica não ficou boa; o perigo foi para as estrelas,
  `STAR.COUNT` = 12. O código continua inteiro e volta trocando o número — todos os consumidores são laços sobre `w.holes`, que viram
  no-op com a lista vazia. Como era: força ∝ 1/d² com parte tangencial `SWIRL` = espiral, influência `CORE_R·INFLUENCE` ≈ 380 px; **não há
  teleporte**: quem chega ao núcleo é ESMAGADO — morre e a massa INTEIRA volta como `SPAGHETTI_N` pellets comíveis num anel
  logo FORA da influência. Mas só quem cabe: peça com `r ≥ rc·CRUSH_K` (2.4, o mesmo número de `textures.scale.blackHole`
  e do anel tracejado do horizonte — "cabe dentro do tracejado? morre") passa por cima e nada acontece, embora a gravidade
  continue puxando todo mundo; comida engolida é reposta em outro canto, pellet/míssil/errante somem no núcleo;
  o cliente prevê a mesma gravidade nas peças próprias, nunca o esmagamento);
  **arremesso** (split/pop/estilhaço/saída do buraco/quique): tudo é o canal de IMPULSO, declarado em PIXELS —
  `SPLIT.DIST` 780, `LOCAL.POP_DIST`, `STAR.SHATTER_DIST`, `BOUNCE.DIST_MAX` 120 (ver Movimento);
  **cuspir (W)** cospe uma pelota PROPORCIONAL a quem cuspiu (`ejectR`: `EJECT.R_K` do raio, com piso/teto) e com FORÇA CRESCENTE
  enquanto a tecla fica segurada (`ejectRamp`, `EJECT.SPEED`→`SPEED_MAX`): como o ejetado integra com arrasto puro, o alcance é
  `v/DRAG` e vai de 351 a 811 px, então sai um RASTRO — com a velocidade fixa de antes toda pelota parava a 292 px e segurar o W
  só empilhava um monte no mesmo lugar — com o
  raio fixo de antes um planeta de 360 mil precisava de 3.419 cusparadas para se esvaziar e segurar o W só enchia a
  tela de pontinhos; a lista de ejetados ganhou teto (`EJECT.MAX`, era a única população dinâmica sem um) e a
  imunidade do dono soma `r/vmax(r)`, senão o planetão alcançava a própria cusparada e reengolia tudo;
  powerups = ímã e escudo **por peça** — quem pegou é a única parte que ganha (Body.magnetUntil/shieldLv),
  peça nova nasce limpa e a fusão fica com o melhor dos dois — mais o de **fusão** (`FOOD_TYPE.MERGE`, o índice 5 que era do de velocidade),
  que zera o `mergeAt` de todas as peças do dono; mísseis (**carência de `MISSILE.SPAWN_CD_TICKS` = 10 s a cada nascimento antes do 1º tiro** — senão o recém-nascido
  sai do spawn metralhando, sem nada a perder; vai no `self` como `fireCd` e o HUD desenha a contagem regressiva em cima
  do ícone da arma; homing no jogador, interceptação de míssil inimigo ou **tiro mirado** quando o
  jogador segura o botão — trava na **bolinha mais próxima do PONTEIRO** (`aimScore` = distância do cursor à borda dela, dentro de
  `AIM_PICK` do cursor e `AIM_RANGE` da peça): peça, míssil, asteroide ou estrela. Era um cone em volta da flecha escolhendo o mais
  próximo da PEÇA, e varrer o mouse dentro dele não trocava nada; agora o alvo segue o cursor e o cliente refaz a mesma conta todo
  frame (`lockOn`), então o anel pula junto — e o ESPAÇO com o tiro carregado CANCELA em vez de dividir (o `down` do tiro não manda
  nada ao servidor, então cancelar é local). **Alerta de míssil vindo em mim**: `self.threat`/`threatDir` (protocolo 8) — tem que vir
  do servidor porque o míssil nasce muito além da AOI —, com seta na borda da tela (`layers/Threat.js`), blip no radar e bipe que acelera; míssil×míssil varrido = CLASH;
  míssil desvia asteroide = DEFLECT); ímã (com teto de tamanho `POWERUP.MAGNET_MAX_R`: o alcance é r·MAGNET_RANGE e num planetão sugava a tela inteira) suga comida e ejetados
  (comida movida recebe UPDATE; cometa/estrela mais devagar; **asteroides também**, escalados por R_MIN/r; a estrela-perigo se arrasta até você); escudo por níveis 1–3 (não expira,
  evolui sem ser atingido, míssil/tiro/batida forte de asteroide tiram um nível, dividir derruba inteiro; contra quem pode engolir só
  segura a 1ª batida — ela derruba o escudo inteiro e quica, depois o maior come); fusão por par (atração só perto, sem puxão ao centróide).
  Regras novas = `rules.js` + `predict.js` (peças próprias) + tradução de eventos em `Sim._consume` E `LocalServer.step`.
- **Movimento = o do agar.io: DOIS canais, e o jogador não tem velocidade** (`physics/integrate.js`).
  (1) **direção**: `pos += û(ponteiro)·vmaxFor(r)·min(d,RAMP)/RAMP·dt`, instantâneo — sem inércia, sem aceleração, sem arrasto:
  a peça anda SEMPRE na velocidade padrão do tamanho e inverte a direção no mesmo tick. `vmaxFor = K/r^0,449` com os números
  literais de lá (K = 2110,6). (2) **impulso**: o canal de boost em `Body.vx/vy` (`body.addBoost`, `BOOST.K = −ln(.9)/0,04`,
  o ×0,9 por tick de 40 ms do agar) que **sempre chega a zero** e percorre exatamente `|v|/BOOST.K` px — por isso todo empurrão
  é uma DISTÂNCIA. Quique tem teto (`bouncePiece` → `BOUNCE.DIST_MAX`), e entre peças próprias não há impulso nem atração:
  era a atração que dava embalo ao reintegrar. Nada de velocidade acumulada = nada de embalo de graça.
- **Resto do modelo do agar** (divisão/teto/câmera): `r/√2` nas duas metades, até `PLAYER.MAX_PIECES`=16, `SPLIT.MIN_R`=60
  (=`EJECT.MIN_R`), fusão em `max(30 s, 0,2·r s)`, arremesso de 780 px absolutos com controle total do ponteiro durante ele.
  `PLAYER.MAX_R`=1000 (mesma proporção mundo/célula do agar) e passar dele **não trava**: `rules.autoSplit` reparte em
  ⌊mass/MAX_R²⌋ filhos; só sem vaga de peça o raio é cortado. Câmera (`shared/camera.js`):
  `min(CAM.BASE/ΣR, 1)^0.4 × max(H/1080, W/1920)` com suavização `CAM.TAU_POS`/`TAU_ZOOM`. A câmera é LIVRE (piso =
  mostrar o mundo inteiro); quem tem teto é a **AOI da comida** (`camera.aoiScaleFood`, `CAM.AOI_FOOD_VIEW`) — juntar
  os dois deixou o jogo injogável, porque o gigante não conseguia afastar para ver as próprias peças (24 ms / 158 ms — o
  `(view+x)/2` e `(9·scale+s)/10` por frame do cliente de lá): a SOMA dos raios (dividir afasta a câmera), lei de potência
  (crescer 10× afasta 2,5×, não 10×), mesma área de mundo em qualquer tela e piso em mostrar o mundo inteiro.
- **Placar e radar**: `LEADERBOARD` (2 Hz) leva `{slot,mass,x,y}` de **todos os vivos** — é o único dado posicional fora da AOI.
  O HUD mostra o top 10 + a própria colocação (`self.rank`) e o radar desenha TODOS os inimigos do mapa, não só os da janela.
- **O que segura o gigante**: `PLAYER.DECAY` (.002/s, o `playerDecayRate` do agar) — cada peça perde essa fração da
  massa por segundo, com piso em `START_R`. A taxa é relativa: 1,8/s numa peça de 900 e 2.000/s numa de 1.000.000.
  Sem isso NADA tirava massa dele com o tempo (pop/estilhaço/supernova só repartem, e lasca/míssil/buraco devolvem
  a massa como fragmento que ele mesmo recolhe). O míssil é a arma anti-gigante: além do dano, **estilhaça** a peça
  (`shatterPiece`, `MISSILE.SHATTER_N`). E o **escudo defende só de míssil e asteroide** — não impede de ser comido,
  nem salva de estrela/supernova.
- **Espectador** (`{t:"spectate",slot}`): ao morrer, o servidor escolhe quem o jogador assiste (quem o matou, se vivo; em equipe o companheiro; senão o líder) e
  **a AOI da sessão passa a seguir esse jogador**; o cliente leva a câmera para o mesmo slot. Sem alvo vivo, a câmera congela onde estava
  (nunca passeia: o que aparece atrás da tela de morte tem que ser exatamente o que o servidor está mandando).
  O morto **troca de câmera** pelas setas ‹ › da tela de morte ou do teclado: o cliente manda `{t:"spectate",dir:±1}`
  (anda na lista de vivos por massa, a mesma do placar) ou `{slot}` para pular direto. Quem valida é o servidor —
  alvo morto cai na escolha automática, e jogador vivo não vira espectador.
- **Fio binário** (`docs/spec/protocol.md`): snapshots a 20 Hz com AOI por sessão (create/update/remove por id), `self`, PLAYERS,
  LEADERBOARD, EVENT, PONG; INPUT de 10 bytes a ≤30 Hz com `seq`/`ackSeq`. JSON só para controle (join/resume/room/error/dead/spectate/rewards).
  Cliente: interpolação a −100 ms para os outros, predição + reconciliação para si (`visualOffset` decai; snap > 120 px) com a
  peça própria renderizada interpolada entre passos (sem isso treme a 60/120 Hz); relógio com mediana+slew; removidas somem
  no frame com efeito (`onVanish`); efeitos de terceiros atrasados pelo atraso de interpolação; skins aquecidas no PLAYERS.
- **O input NÃO sai do laço de render** (`enviarInput` + timer a `NET.INPUT_HZ` em `game/index.js`): saindo de dentro do
  frame, uma travada de render deixava o servidor sem alvo novo, ele seguia movendo a peça na direção velha e o snapshot
  seguinte corrigia tudo de uma vez — os três sintomas ("volta atrás", atraso do mouse e travada) eram UM só. Pelo mesmo
  motivo o teto do passo da predição é `.25` e não `.1`: tinha que bater com o do acumulador do `Predictor`, senão uma
  travada de 300 ms fazia o servidor andar 300 ms e a predição só 100, e a diferença passava de `NET.SNAP_DIST`.
  **A AOI da comida tem teto por CONTAGEM** (`NET.AOI_FOOD_MAX`), não só por área: `aoiScaleFood` limita a área, mas com a
  câmera afastada cabiam ~500 grãos numa tela só e a comida é 90 % das entidades. Medido no Battle Royale: pico de 510
  entidades, 443 delas comida, contra 128–185 estáveis no Livre. O corte cai no anel de FORA (grão de 1–2 px) e quem já é
  conhecido nunca some — sumir é pior que faltar.
- **Responsividade**: `body[data-mode]` tem QUATRO valores (`desktop|tablet|landscape|portrait`, com histerese de 40 px) e
  `body[data-pointer]` (`coarse|fine`) diz separadamente se o ponteiro é o dedo — tamanho e capacidade de entrada são coisas
  diferentes, e juntá-las fazia tablet deitado receber o layout de desktop. Medida fina é decisão do CSS (o primeiro paint já
  sai certo). `#hud` tem `inset:0` + `padding:env(safe-area-inset-*)` (o padding vira o contêiner dos filhos absolutos, então
  o notch é resolvido para todos os blocos de uma vez) e `pointer-events:none` — os painéis engoliam o ponteiro e congelavam
  o alvo do jogador. No dedo, a coluna esquerda (`#hud-left`) vira pilha (`display:contents` no desktop), porque o bloco de
  arma cresce com os powerups e offset fixo voltava a colidir. **Onde escrever**: estrutura vai nos mockups → `port.js`
  (conserta os 3 temas de uma vez); o que os mockups não têm — área segura, modo tablet, analógico, alvo de 44 px, `#s-round` —
  vai em `client/src/styles/ui.css`, à mão. Quem prova é `node scripts/responsive-check.mjs` (12 aparelhos × 11 telas × 3 temas:
  transbordo, clipado sem rolagem, alvo < 44 px, HUD sobreposto) mais `client/test/viewport.test.js` (a classificação, que o CDP
  não consegue emular). O analógico virtual é `game/input/Joystick.js`, ligado por `prefs.joystick`, e só vale no dedo.
- **Modos de jogo** (`MODE`/`MODES` em constants, `docs/design/modos.md`): **Livre** é o jogo de sempre e não mudou.
  **Battle Royale** é sala de 50, **sem respawn**, com **zona que encolhe** (`shared/src/zone.js`; fora dela a peça
  queima `ZONE.BURN`/s e MORRE no piso — a única coisa que mata sozinha) e vitória do último vivo. A massa queimada
  não evapora: é ARRANCADA em pelotas de verdade a cada `ZONE.SHED_TICKS`, jogadas para FORA (longe do centro da
  zona), então dá para ver quem está no gás se desfazendo e buscar o espólio custa entrar mais fundo. Quem morre
  lá larga tudo sem dono. A conta de massa segue contínua (é a que `predict.js` espelha); `Body.shed` é a massa
  em trânsito, e a entrega em pedaços existe por causa do teto `EJECT.MAX`. Solo ou equipe
  de 2/3/4, com convite por **código** (`rooms/Party.js`, memória com TTL, funciona sem banco e para convidado).
  Entra por um **LOBBY** (`phase:'lobby'`): o jogador está na SALA, não no MAPA (`addPlayer({spawn:false})`), vê o
  contador subir e os nomes chegando, e a largada vem quando enche ou a janela `BR.LOBBY_TICKS` fecha. Os
  participantes chegam AOS POUCOS (curva `progresso^FILL_EXP` com jitter) porque encher de uma vez entrega o jogo;
  a vaga é sempre do humano (quem chega derruba um preenchimento). Nenhum snapshot nessa fase — sem peça não há o
  que enquadrar —, então o estado do lobby vai em JSON e em MILISSEGUNDOS. `Room.roundStart`, que nascia 0 e nunca
  era escrito, é o gancho: escrevê-lo na largada ajusta relógio, contagem e céu sozinho.
  **Todo preenchimento usa apelido de gente** (`realNicks`, os dois modos): os 60 nomes temáticos de
  `BOT_NAMES` denunciavam o bot pelo NOME antes de qualquer movimento denunciar. `anonBots` é coisa separada
  e continua só no BR — no Livre o ◆ do placar segue aparecendo.
  **O preenchimento não se identifica** (`anonBots`): nome de jogador (`BOT_NICKS`/`botNick`) e o flag `PLAYER_FLAG.BOT`
  NÃO vai no fio — como o `◆` do placar e a cor do radar saem dele, os dois param de distinguir sem uma linha de
  cliente. O servidor continua sabendo (kills × botKills, economia, conquistas); quem não sabe é a tela.
  **Aliado é regra de FÍSICA** (`rules.sameTeam`, nos 6 pontos de
  decisão), não do bot; compartilhar partículas já funcionava de graça (o cooldown do ejetado é só do DONO).
  **Armas** (`WEAPONS`): míssil + Rajada/Cacho/Nova, em cima de mecânica existente (a Nova é o laço da supernova).
  O jogador CARREGA VÁRIAS: `ps.ammo[arma]` é a munição de cada uma, `ps.weapon` a que está na mão, e a troca é
  `INPUT_FLAG.SWAP` (tecla Q / chip do HUD / botão de toque) — coube num bit que já sobrava, o INPUT segue com
  10 bytes. O míssil nunca sai do cinto, nem zerado. `acceptsJoin()` é a porta única de entrada da sala.
  **Vitória tem fogos**: quem vence vê a salva sair do próprio planeta (`fireworkPrims` em theme/util.js —
  física compartilhada, paleta por tema; traço em vez de ponto, arrasto, gravidade, cor em 3 tempos, cintilação).
- **Chat e voz** (`CHAT`/`VOICE` em constants): chat de sala ou de equipe (o escopo é do servidor), painel na
  faixa esquerda do HUD. Voz é push-to-talk no **Ctrl**, clipes curtos em **µ-law 8 kHz** — não Opus, porque o
  Safari não decodifica o webm que o Chrome grava e metade da sala ficaria muda. O servidor é relay puro (não
  decodifica, não guarda) e o áudio toca num 4º barramento, fora do teto de vozes. ⚠️ o `maxPayload` do WS
  acompanha `VOICE.MAX_BYTES`: com 4 KB o `ws` derrubava o frame e a conexão junto.
  **Quem está falando aparece no mundo**, em tempo real: o clipe só sai quando a tecla é SOLTA, então o ícone
  não pode esperar por ele. O cliente manda `{t:"talk",on}` no instante do Ctrl e o servidor (`Room.talkState`)
  repassa `{t:"talk",slot,on}` para os MESMOS ouvintes do clipe (`Room._ouvintes`) — quem não ouviria o áudio
  não vê o ícone. JSON de controle, sem versionar o fio binário. O desenho é um sprite assado
  (`theme/util.js:paintTalk`) acima do planeta, em `layers/Planets.js`, com tamanho constante em tela
  (`1/cam.scale`, como a seta de `layers/Threat.js`) e só na MAIOR peça do dono.
  `mic.state` é um GETTER derivado: era um campo, e `stop()` chamava `onState(null)` sem zerá-lo — o `pushHud`
  (8 Hz) relia o objeto velho 125 ms depois e a barra de progresso voltava CONGELADA para não sair mais.
  A flag `PLAYER_FLAG.TALK` do placar tem varredura de expiração (`Room._expiraFala`, 2 Hz): ela é calculada ao
  vivo, mas o PLAYERS só é DIFUNDIDO quando algo marca `playersDirty` — sem isso o 🎤 acendia e ficava preso.
- **Rodada de 1 h** (`ROUND` em constants; `ROUND_TICKS` no env): a sala vale `ROUND.DAYS` (4) dias do "relógio do espaço"
  (começa 05:00; um dia a cada 15 min → 12 trocas de céu, cada uma com o **crossfade do céu** feito dentro do Pixi por
  `renderer/layers/Background.js` — só o fundo dissolve; HUD, telas e o jogo continuam visíveis); no fim vem o
  **BIG CRUNCH**, o maior planeta vivo é o campeão, vai um `roundEnd` com o placar, a sala é aposentada e o cliente entra sozinho
  numa sala nova depois de 15 s (`ui/Round.jsx` mostra o pódio dos 3 primeiros + o resto do placar).
- **Salas por shard** como na v1: código `1ABC` → shard 1 (1º char base36); o Ingress roteia `/ws/<shard>` para `warspace-server-<shard>`;
  `/api/*` balanceado (qualquer shard responde, tudo stateless no Postgres). `findOrCreateRoom` enche a sala mais cheia com vaga.
- **Identidade**: token opaco `pt_…` (sha256 no banco), guest por padrão (`POST /api/auth/guest`), reivindicar com senha (scrypt nativo)
  trava o nick; `join {token}` — nick/skin nunca vêm do cliente. Banco fora → modo sem persistência (`unsaved`), o tick nunca espera o banco
  (fila com retry, circuit-breaker). Moedas/conquistas só no servidor (`persist/rewards.js`).
- **Casca da tela** (`body[data-shell]`, escrito por `App.jsx`; regras em `client/src/styles/ui.css`): na PRIMEIRA carga do navegador
  o menu é `center` — centralizado de verdade e com rolagem (os temas o deixavam preso em `flex-start` + `8vh` com `overflow:hidden`,
  então em tela baixa o botão JOGAR ficava fora do alcance). Depois da primeira partida (`app.played`) vira `rail`: gaveta à direita e
  **a câmera encolhe para a esquerda** em vez de ficar escondida atrás dela. Quem faz isso é `--rail-w` no `#game` e no `#hud` — e só
  funcionou porque o `inset:0` INLINE que `game/index.js` escrevia no container saiu: estilo inline ganha de qualquer folha. Encolher o
  `#game` basta, porque o Pixi é criado com `resizeTo:container` e o `ResizeObserver` já refaz câmera, zoom, AOI e o `{t:"view"}`.
  Celular em pé nunca vira gaveta (lá o certo é a folha de rodapé, que é o que os temas fazem). **Modais são centralizados nos três
  temas** fora do celular em pé: o "às vezes no meio, às vezes embaixo" era o RELÓGIO — só o `dusk` (20h–05h) os transformava em folha,
  e o mesmo modal mudava de lugar conforme a hora. `#s-round` (o pódio do BIG CRUNCH) **não tinha uma linha de CSS em arquivo nenhum** e
  caía cortado no canto; agora herda o tratamento de `#s-dead`. `scripts/responsive-check.mjs` cobre `dead`, `round` e `entry@rail`.
- **A MARCA** (`client/src/ui/logoArt.js` + `Logo.jsx`, `scripts/brand-assets.mjs`): warspace.io. O título era texto
  com emoji (`🪐 PLANET.IO`) girado e com sombra dura; agora é SVG inline pintado por TOKEN, então a marca se re-tinge
  com o relógio junto com o resto da tela — coisa que emoji nunca fez. A arte mora num `.js` puro porque TRÊS lugares
  precisam do mesmo desenho: o componente React, o `theme/preview.js` (que duplica o DOM à mão e não passa pelo
  transform de JSX) e o gerador de assets — duas cópias de um logo divergem na primeira correção, e aí o ícone da aba
  deixa de ser a marca do jogo. Símbolo em PATH e wordmark em TEXTO, nunca o contrário: o símbolo é o que vira favicon
  e não pode depender de fonte carregada.
  `node scripts/brand-assets.mjs` assa favicon, `icon-{180,192,512}.png`, `og.png` e o manifest a partir dela —
  ⚠️ os PNG saem do Chrome headless, cuja VIEWPORT é ~87 px mais baixa que o `--window-size`: o script desenha num
  bloco de tamanho exato e RECORTA, em vez de tentar adivinhar a compensação.
- **Tela inicial v2** (`Entry.jsx` + a seção `TELA INICIAL v2` de `client/src/styles/ui.css`): o marcador `entry-v2`
  no wrap é o que permite reescrever a tela sem tocar em arquivo gerado. Os temas a estilizam com
  `:where(html[data-theme=…]) #s-entry .entry-wrap` — o `:where` é zero, mas o `#s-entry` não, e `ui.css` é importado
  ANTES dos temas em `theme/all.css`, então empate PERDE: a classe extra leva os seletores a (1,2,0) e ganha sem um
  `!important` na tela inteira. As regras do rail continuam em (1,3,1) e seguem mandando. Quatro coisas que denunciavam
  amadorismo saíram: emoji injetado por `content:` no lugar de ícone (agora `navIconArt.js`, traço em `currentColor` —
  e o botão "Modos", que nasceu depois dos mockups, ganhou o dele: não tinha nenhum); `'Trebuchet MS'` como fonte da
  marca (agora `--font-display`, Archivo Black auto-hospedada em `client/public/fonts`); o `aside.entry-side` que era
  consultado a cada 5 s e escondido com `display:none` nos TRÊS temas; e a navegação por teclado sem foco visível.
  ⚠️ Só a DISPLAY é webfont: `--font-ui` alimenta o `BitmapFont.install` do Pixi (`renderer/layers/Planets.js`), e uma
  fonte que ainda não carregou faria o nome dos planetas ser assado errado num atlas que não é refeito depois.
  Os seis botões usam `repeat(auto-fit,minmax(62px,1fr))`, que responde ao CONTÊINER: na gaveta do celular deitado
  seis colunas fixas davam alvo de 37 px, e um `@media` não veria isso — a viewport ali tem 667 px de largura.
- **Câmera de quem morreu**: no Battle Royale segue o espectador de sempre (quem te matou, ou o companheiro vivo). No **Livre ela fica
  PARADA onde o jogador morreu** (`spectateTargetFor(s,-2)`): ali não há placar nem fim de partida para acompanhar, e passear atrás da
  tela de morte desorienta. As setas ‹ › continuam funcionando nos dois modos.
- **Temas por horário** (`docs/design/theme-time.md`): `dawn` 05–16h, `sunset` 16–20h, `dusk` 20–05h; pref `theme: auto|dawn|sunset|dusk`.
  `html[data-theme]` troca o CSS; o Pixi rebaka texturas via `theme.textures.*`. Nenhuma cor fora de `client/src/theme/`.
- **Bots** (`shared/src/bot.js`, `ROOM.BOTS`): um cérebro só para o servidor e o LocalServer — produz `{tx,ty,flags}` como um humano e
  aplica pelo `emit` de quem o criou (o `botInput` do LocalServer tem que aceitar TODAS as flags, senão o bot offline diverge em silêncio).
  Três camadas: **decisão** (`_think`, a cada `THINK_TICKS`) varre o mundo uma vez e escolhe a intenção por **utilidade** — flee · hunt ·
  food · zone · hold · intercept · wander — com histerese (`BOT.STICK`) e compromisso mínimo (`BOT.COMMIT`), porque cascata fixa dava o
  vaivém que denuncia script; **ação** (`act`, todo tick) só faz conta O(1), com o perigo colado relido a cada `BOT.HAZ_TTL` ticks
  (varrer estrelas+asteroides todo tick × 49 bots era o maior custo fixo do cérebro); **mão** (`_hand`) traduz a intenção em ponteiro com
  tempo de reação, velocidade angular limitada, tremor e "flick" para mirar. Duas coisas que a matemática obriga: **perseguir nunca
  alcança** (`vmax ∝ r^-0,449` + `EAT.RATIO`: a presa é sempre mais rápida), então `hunt` mede o arco de fuga dela (`_openness`) e
  aproxima pelo lado que FECHA esse arco (`_approach`, com pinça de equipe tirada só da geometria), e o salto é o único fechador em
  campo aberto; e **a zona entrega o futuro** (`w.zone.x1,y1,r1,t1`), então `_zonePlan` compara o tempo de viagem com o que resta e sai
  na hora certa em vez de reagir queimando. `BOT.PERSONAS` dá o estilo e `BOT.SKILLS` dá a MÃO (4 níveis com peso: ~18 % ruins, 46 %
  medianos, 28 % bons, 8 % feras) — 50 adversários igualmente competentes é o maior denunciador de bot que existe. Graça de spawn para
  humanos. Quem valida é `shared/test/bot.test.js`: uma arena headless roda a partida inteira e mede o que denunciaria um script.
- **Fala dos bots** (`BOT_CHAT`/`BOT_TALK`, `Room.botChatTick`): o cérebro NÃO fala (o LocalServer não tem chat) — quem fala é a sala,
  a partir de gatilhos que o `Sim` já enxerga (`sim.botTalk`: abate, morte, virada da zona, largada; o gatilho leva `quem`, o outro
  lado do evento). Tudo é orçamento — cooldown de sala, cooldown por bot, teto por partida, probabilidade por gatilho —, o padrão é o
  silêncio, e a fila é do INSTANTE (guardar gatilho vira comentário atrasado). Sai pelo mesmo `_pushChat` do humano, então respeita o
  escopo do modo.
  **A frase pode vir de uma LLM** (`BOT_LLM`, `server/src/llm/ollama.js` + `server/src/rooms/botChat.js`, env `OLLAMA_URL`/
  `OLLAMA_MODEL`/`BOT_CHAT_LLM`): o repertório fixo continua sendo o CHÃO — é o que sai sem a variável, com o serviço fora ou quando a
  resposta demora —, e o que a LLM acrescenta é reagir ao que foi DITO, responder a quem chama e falar no idioma da conversa.
  `Room._pushChat` guarda as últimas `CHAT.KEEP` linhas (o servidor nunca guardou nenhuma): sem histórico não há conversa para ler.
  **Nada disso pode esperar**: `botChatTick` roda dentro do `step()` e o Scheduler percorre TODAS as salas do processo no mesmo laço de
  60 Hz — a geração é disparada e esquecida, quem publica é o callback, e ele revalida tudo (sala viva, fase, bot vivo) e descarta o
  que passou de `STALE_MS`. O orçamento é gasto ANTES do disparo, senão dois gatilhos no mesmo tick viram coro.
  **Coro, corrente e fila** (`BOT_LLM.CORO_*`/`CADEIA_*`, `Room.falaFila`): uma pergunta jogada para a sala
  ("e aí galera?") acorda de 1 a 3 bots com atrasos ESCALONADOS (0,3–3 s) — três respostas no mesmo tick é
  coro de robô; chegando em tempos diferentes parece gente digitando. O agendamento é por `atTick` e drenado
  dentro do `step()`: nada de `setTimeout`, que não é determinístico, não é testável com o rng da sala e não
  revalida nada. ⚠️ A invariante "a fala é do INSTANTE" continua literal — `sim.botTalk` segue esvaziado todo
  tick e **nenhum kind de EVENTO entra na fila**; ela só transporta os conversacionais, onde 0,5–3 s não é
  atraso. `CORO_WAIT_MS` (espera proposital) e `STALE_MS` (latência da geração) são relógios DIFERENTES e
  somá-los seria confundir uma feature com uma falha. Bot responde a bot com **corrente curta**: a reentrada
  fica em `publica()` dentro de `_falar` (e não no `_pushChat`, que é o difusor comum), continua só quando a
  linha GERADA cita alguém pelo nome — e a frase do repertório nunca cita, então a corrente morre sozinha ali.
  Termina por cinco razões independentes: profundidade limitada, exigência de citação, `CADEIA_P`, o conjunto
  `cadeia` (que proíbe repetir slot) e os orçamentos por bot.
  **A LLM sabe o que o bot está VIVENDO**: `estadoLinha` lê `gp.brain` (mode/target/press/zu — que o `_think`
  já preenchia e ninguém lia, custo zero) e `agressorLinha` lê `gp.mem`, um anel de 6 carimbado em
  `Sim._consume` nos eventos que já traziam `bySlot`. Quando o agressor É de quem ele foge, as duas viram UMA
  oração ("you are running away from Evandro and he keeps shooting you") — é dela que sai o "me deixa em paz,
  evandro!", e duas frases dizendo quase o mesmo gastam token e diluem a mais forte do prompt. Cada bot tem
  uma HISTÓRIA (`rooms/botPersonas.js`, **server-only**: `shared/bot.js` vai para o bundle do `?local=1`).
  ⚠️ O palavreado é limitado na PENEIRA (`OFENSA` em `botChat.js`), não só no SYSTEM: medindo na bancada
  (`scripts/llm-bench.mjs`), o modelo obedecia na maioria das vezes e escapava numa a cada dez — e "na maioria
  das vezes" não serve para o que aparece na tela de uma sala de 50.
  Responder a quem CHAMA tem orçamento próprio, bem mais folgado (ser chamado pelo nome e ficar mudo é o que não passa por gente), e a
  menção é aproximada (`citou`: raiz do nick, sufixo de diminutivo, apelido cortado, 1–2 letras de erro). O pecado grave é o FALSO
  positivo — responder a quem não chamou É poluir o chat —, então há lista de palavras comuns e uma VARREDURA em
  `server/test/botchat.test.js` medindo a taxa contra os nomes e frases reais. O idioma é DETECTADO no servidor (`detectaIdioma`) e
  nomeado no prompt: dizer "responda no idioma da mensagem" acertava quase sempre, e "quase" devolvia português para quem escreveu em
  espanhol. Carregar o modelo custa ~27 s e responder ~0,5 s — daí `keep_alive`, `warmup()` no boot e o disjuntor REAQUECER enquanto
  está aberto.
- **Kill feed estilo CS** (`FEED` em constants, `server/src/rooms/feed.js`, `client/src/ui/KillFeed.jsx`): "quem matou
  quem" no topo-DIREITO, com o placar e a massa logo abaixo; radar e chat na ESQUERDA. Vai em **JSON de
  controle** (`{t:"feed",v:[…]}`) difundido à sala INTEIRA, sem AOI — o EVENT binário tem 13 bytes fixos com o
  `extra` já ocupado pelo score, marco de rodada não tem x/y, e difundir `EVENT.DEATH` faria o cliente
  instanciar efeito e SOM de mortes do outro lado do mapa. Só SLOTS viajam (o nome sai de `view.playerOf`), o
  que faz o feed herdar o `anonBots` do BR de graça.
  ⚠️ **Arma nenhuma mata sozinha**: `w.killPiece` só é chamado em 3 lugares de `rules.js` — `zone` (:68),
  `eaten` (:129) e `blackhole` (:445, dormente). Míssil, estrela, asteroide e supernova param no piso
  `MIN_PIECE_R` e apenas AMOLECEM. Por isso `how` (com o quê) e o matador são campos separados, e existe a
  ASSISTÊNCIA: a linha honesta é "⭐ amoleceu · Fulano devorou". Quem sabe disso é `Sim._lastHit`, um carimbo
  escrito dentro do `switch` que o `_consume` já percorre (uma escrita em Map, sem laço novo), lido em
  `_died` com TTL de `FEED.HIT_TTL_TICKS`. Para isso a física teve que passar a dizer a ARMA: `weapon` no
  BOOM/SHIELD_*, `q.hits=WEAPON.CLUSTER` no `clusterSplit` (o filho do cacho tem `hue` de míssil simples DE
  PROPÓSITO, senão se abriria de novo) e o evento `NOVA_HIT`, que não existia — sem ele a arma mais cara do
  jogo era a única sem crédito no feed.
- **Progressão** (`shared/src/levels.js`, migrações 0004–0006): XP por partida (`matchXp`, função pura no
  molde de `achievements.js`) e nível DERIVADO do XP (`levelFromXp`) — nunca guardado, senão vira uma segunda
  verdade que envelhece na primeira mudança de curva. Curva `85·(L−1)^2.12`: nível 2 na primeira vida, 10 em
  ~9 h, 30 em ~109 h, 50 em ~330 h. `xp`/`deaths` vivem em `user_stats` (e não em `users`, que é lido com
  `SELECT *` em todo join de WS); o nível chega ao jogo por um `u8 level` no PLAYERS (**PROTOCOL_VERSION 11**)
  e acende o badge no placar, no chat e no feed de uma vez. K/D **não** é coluna: é expressão
  `kills/GREATEST(deaths,1)` com piso de qualificação (`KD_MIN_KILLS`/`KD_MIN_GAMES`) — materializar um
  derivado é criar um número que mente. Ranking global e por PAÍS (`users.country`); ⚠️ o país entra na CHAVE
  do cache de 10 s de `api/ranking.js`, senão a primeira resposta regional é servida ao mundo inteiro.
  `POST /api/auth/google` existe, é testada e devolve **503 sem `GOOGLE_CLIENT_ID`** — e `/api/config` só
  expõe o clientId quando ele existe, então sem credencial o botão nem aparece.
- **Placar da SALA** (`Room.roster`): a rodada do Livre caiu para **30 min** (`ROUND.TICKS` 108000, `DAYS` 2 —
  o dia do espaço continua com 15 min; ⚠️ quem manda em produção é o env `ROUND_TICKS`, e `roundInfo()` passou
  a mandar `days` porque cliente novo com env velho desenhava o céu na metade da velocidade). No fim vêm
  QUATRO destaques (campeão · mais partículas · mais abates · maior K/D, este com piso de
  `ROUND.AWARD_MIN_KILLS`). O roster existe porque `Sim.endRound` itera `sim.players`, onde só está quem
  ficou: `Room.leave` remove do mundo, e no Livre **morrer e renascer é `leave` + `join` num slot NOVO**.
  Chave estável: `u<userId>` → `r<resumeToken>` → `n<nick>` → `b<slot>`; **nunca `sessionId`**, que é por VIDA
  e agruparia errado justamente no respawn. `_rosterFold` é idempotente por vida (`gp.rosterFolded`) e ACUMULA.
- **Skins novas** (75–93): 8 lendárias com `levelReq` (10–50) que são EMBLEMAS, não texturas de planeta — é o
  que as faz legíveis a 24 px; a skin **Retrato** (83), que põe a FOTO do jogador dentro do disco; e 10
  caricaturas de easter egg (84–93, `rarity:"secret"`, escondidas da loja e recusadas pela compra), escolhidas
  pelo NICK em `shared/src/eggs.js` — casamento EXATO da raiz (`baseNick`), porque prefixo fazia "modinha"
  virar Modi. O egg é decidido em `persist/hooks.js` e `wsServer.unsaved`, vale só para AQUELA vida e **nunca**
  escreve em `users.equipped_skin_id`; `prefs.eggs:false` desliga. ⚠️ `seedSkins` tem uma faca: um pod com o
  `shared/skins.js` ANTIGO faz `UPDATE skins SET active=false` nas skins novas — os 3 shards têm que estar na
  MESMA imagem antes de qualquer skin nova ficar comprável.
- **A foto do jogador**: recortada em círculo e reduzida no CLIENTE (`util/image.js`, ≤256 px, escada de
  qualidade WebP até caber em `AVATAR.MAX_BYTES`), validada no servidor pelo CABEÇALHO
  (`api/imagemeta.js` lê PNG/VP8/VP8L/VP8X à mão — nenhuma biblioteca nova) e guardada em `bytea` numa tabela
  SEPARADA de `users`. Sobe em corpo CRU numa rota com teto próprio (`raw:{max}` no router): base64 dentro de
  JSON estouraria o `BODY_MAX`, e subir o teto global enfraqueceria todas as rotas por causa de uma. O que
  fecha o buraco do arquivo disfarçado não é o validador: é a RESPOSTA (`Content-Type` do sniff + `nosniff` +
  CSP `default-src 'none'`). No render, a versão da foto entra na CHAVE da textura — assim não há invalidação
  nenhuma: enquanto o bitmap não chega desenha-se a silhueta, e quando chega a chave muda e o cache assa a nova.
- **Som** (`client/src/audio/`, `docs/design/som.md`): sintetizado no WebAudio — osciladores e ruído filtrado, nenhum arquivo.
  O `kind` do efeito visual é a chave do som, então evento novo com efeito já sai com áudio; volume por distância da câmera,
  estéreo pela posição e intervalo mínimo por tipo. Três princípios: **ataque+corpo+cauda** por receita, a **altura codifica o
  tamanho** (tudo que é meu sai a `pitch=1/(1+massK·1,1)`) e a fila de grãos sobe uma **escada pentatônica**.
  Três barramentos (sfx/amb/ui), **prioridade de vozes** (no teto, o som novo ROUBA a de menor prioridade — antes o alerta e a
  própria morte sumiam justo quando a tela enchia) e **contínuos** (`startLoop/setLoop/stopLoop`): alerta de míssil que acelera,
  ímã, carga da mira e a ambiência de 3 camadas (pad afinado pela minha massa, tensão perto de estrela, pulso do fim da rodada).
  Som de tela por delegação num listener só em `App.jsx`. Opções → Som: efeitos, música (o pad), **ambiência** (nova) e volume.
  **`?sfx` abre a mesa de som**: toda receita com botão, os contínuos com controle de intensidade — é por onde o pacote é aprovado de ouvido.
- **Skins (75)**: `shared/src/skins.js` guarda `pattern`/`accent` e `client/src/theme/patterns.js` desenha a textura procedural
  dentro do disco (listras, crateras, continentes, lava, gelo, galáxia, xadrez, escamas, olho…) — nada de imagem, tudo assado uma vez
  por (skin, tier). O mesmo módulo desenha o buraco negro (`paintHole`) e a estrela (`paintNova`).
- **Brilho das partículas** (estilo wormate.io): comida e fragmentos ganham um halo ADITIVO — um segundo
  `ParticleContainer` com `blendMode:"add"` por baixo do corpo, sobre o halo assado (`paintGlow` em `theme/util.js`).
  São 2 draw calls no total, não um por partícula, e nada de filtro/blur (proibidos: custam render target).
  A queda do gradiente é rápida de propósito — halo largo e opaco satura para branco e a tela vira névoa.
  Some no modo econômico e com "menos movimento".
- **Render (PixiJS v8)**: sprites assados por (skin, tier 128/256/512), ParticleContainer para comida/ejetados, fundo em cache por resolução,
  culling manual, HUD e minimapa em DOM (mesmos ids/classes dos mockups — o CSS dos temas depende disso).
  **Troca de tema sem pausa**: o cache NÃO é invalidado (as chaves já têm o id do tema, então os céus convivem e voltar a um é acerto),
  as fontes bitmap usam `skipKerning` (o kerning do Pixi é O(n²) — era ele que congelava a tela) e o céu seguinte é assado
  `PREWARM_S` antes da virada (`renderer.prewarmTheme`, disparado pelo relógio da rodada em `game/index.js`). Quem segura textura sem
  pedi-la por frame (atlas de comida/ejetados/parallax, tile da grade) chama `cache.keepAlive()`, senão a eviction a destrói em uso.
- **Blob dos planetas**: o corpo vira `MeshPlane` (grade 9×9 com a mesma textura assada) e os vértices são deslocados por frame —
  ondulação sutil na beirada (peso r⁴, ~2% do raio) + squash na direção do movimento, sem girar a arte. Cada malha é um draw call,
  então só as maiores da tela viram blob (`WOB_MAX`, `WOB_MIN_PX`) e nada disso acontece no modo econômico ou com "menos movimento".

## Convenções

- Estilo denso: uma instrução por linha separada por `;`, comentários de seção `// ── SEÇÃO ──`, comentários e UI em pt-BR. `// @ts-check` + JSDoc em `shared/`.
- Constantes só em `shared/src/constants.js`; textos de UI em `client/src/ui/labels.js` (+ `labels` do tema).
- Mensagens de commit: uma linha, imperativo, sem corpo.
- Não versionar `.env`; o Secret do banco vive só no cluster.

## Kubernetes

⚠️ **`npm test` já apagou o banco de PRODUÇÃO uma vez.** `server/test/persist.test.js` faz `DROP SCHEMA public
CASCADE` no `before` (é o preço de testar a migração do zero) e, sem `DATABASE_URL` no ambiente, lia o `.env` da
raiz — que aponta para produção. Hoje há uma guarda no topo do arquivo: host não-local só com `ALLOW_REMOTE_DB=1`.
Nunca remova essa guarda; se um dia precisar rodar contra staging, passe a variável explicitamente.

Cluster do Evandro: `https://192.168.12.50:6443` (k8s 1.21, 4 nós), ingress-nginx v0.47, cert-manager `letsencrypt-prod`, sem storage dinâmico,
imagens no Docker Hub. Kubeconfig em `~/.config/OpenLens/kubeconfigs/68c0dd84-fd6a-43f2-bc30-26daccdf7ef4`; `docker` exige `sudo -n`
(`DOCKER_CMD="sudo -n docker"`). Namespace `warspace`; NodePort `30800` (`http://192.168.12.50:30800`). Postgres de produção: `192.168.10.10:5432/planet` — **PostgreSQL 9.6** (sem IDENTITY, sem
`gen_random_uuid`; migrations usam `bigserial`; testar SQL novo contra ele: `npm -w server test` com o `.env` de produção recria o schema
do zero, use só com o banco vazio). Secret `warspace-db` criado via `./scripts/db-secret.sh`. Escalar shards: `replicas` no StatefulSet + `SHARDS` no ConfigMap + um Service por pod novo.

## Arestas conhecidas

- ⚠️ **O certificado Let's Encrypt não sai sozinho neste cluster.** O cert-manager faz um *self-check*
  do desafio HTTP-01 ANTES de chamar a ACME, e de dentro do cluster o IP público
  (`177.190.160.19:80`) dá `connection timed out` — o roteador não faz hairpin NAT. O desafio fica
  `pending` para sempre mesmo respondendo **200 de fora**. Não é do warspace: há 11 desafios presos
  assim desde 2026-07-30 (`j4call`, `itm`) e um desde 2024. A correção é split-horizon no CoreDNS —
  um bloco `hosts` mapeando o domínio para `10.110.179.230` (ClusterIP do `ingress-nginx-controller`),
  **antes do `forward`**, senão o forward atende primeiro. Sem isso o jogo funciona em HTTPS com o
  certificado autoassinado do nginx, e o navegador avisa.

- Sem "esqueci a senha" (reset via SQL). O merge de contas passou a existir SÓ no caminho do Google (um guest
  com Bearer é promovido em vez de virar conta nova); nos outros continua sem.
- ⚠️ **`npm run dev` na raiz lê o `.env` da raiz, que aponta para PRODUÇÃO** — e com `MIGRATE_ON_START=1` isso
  APLICA migrações lá. Para trabalhar no banco de dev, passe `DATABASE_URL` explicitamente em TODO comando
  (é a mesma armadilha do `npm test`, que já apagou o banco uma vez).
- Mockups são a fonte visual; mudança de tema visual = editar `mockups/v2/src/theme.toon-<id>.js` e rodar `client/src/theme/port.js`.
  `client/src/styles/base.css` e os `screens.css`/`hud.css` dos temas são GERADOS por esse script — o que nasceu depois dos mockups
  (transição de cor do HUD na troca de tema, pódio do BIG CRUNCH e a loja nova) mora em `client/src/styles/ui.css`, escrito à mão e fora do port.js.
  O `port.js` já converte o `canvas#game` do mockup nas duas linhas de `#game` do app (o canvas do app mora dentro de um
  `<div id="game">`) — isto era um conserto manual depois de cada geração e hoje sai pronto.
- O fundo é só céu + estrelas: `bandLayers()` devolve `props:[]` nos 3 temas e `textures.background()` não desenha mais os planetas
  distantes (dawn) nem as calotas de montes no horizonte (dusk) — as bolas confundiam com planeta de verdade e os montes viravam
  calombos escuros. `textures.prop`/`scale.prop` seguem lá se um dia quisermos cenário de volta.

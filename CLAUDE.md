# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
export PATH=$HOME/.local/opt/node22/bin:$PATH   # Node 22 local (o sistema tem 18); .nvmrc = 22
npm install                  # workspaces: shared, server, client
cp .env.example .env         # DATABASE_URL etc. (Postgres de dev: sudo -n docker start planet-pg → 127.0.0.1:5433 planet/planet)
npm run migrate              # aplica server/src/db/migrations/*.sql + seed de skins (também roda no boot com MIGRATE_ON_START=1)
npm run dev                  # server em :3001 (node --watch) + Vite em :5173 com proxy de /api e /ws
npm test                     # node --test: shared/test (física, protocolo) + client/test + server/test (persistência, jogo)
                             # ⚠️ persist.test.js faz DROP SCHEMA: exige DATABASE_URL em host LOCAL (guarda no
                             # topo do arquivo). Rode: DATABASE_URL=postgres://planet:planet@127.0.0.1:5433/planet npm test
npm run build                # client/dist (vite build)
./scripts/db-secret.sh       # cria o Secret warspace-db (DATABASE_URL do .env) no cluster
# PAINEL /admin: rota da MESMA SPA (client/src/admin/, chunk sob demanda). O 1º administrador nasce do env
# ADMIN_EMAILS (k8s/05-config) no boot — SÓ PROMOVE — ou de um UPDATE users SET is_admin=true. docs/spec/admin.md
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
shared/src/    constants.js (ÚNICA fonte de tunables; ZOOM/roundTicksOf/ZONE_TOTAL_TICKS) · tunables.js (a lista BRANCA do que o /admin pode mudar em runtime)
               skins.js (94 skins) · achievements.js · levels.js (XP/nível/K-D) · countries.js · eggs.js (nick → skin) · rng.js · camera.js · util.js · zone.js · bot.js
               physics/ (body, spatial-hash, integrate, collide, rules, world, predict) · protocol/ (constants, quant, writer, reader, codec, dto)
server/src/    index.js (composition root + startServer) · loop.js (scheduler 60 Hz) · metrics.js
               llm/ollama.js · rooms/botChat.js · rooms/botPersonas.js (histórias, server-only) · rooms/feed.js (marcos do kill feed)
               sim/ (Sim, hooks) · rooms/ (codes, Room, RoomManager, Party) · net/ (Session, wsServer, snapshot) · http/ (api, peers)
               config.js · log.js · tunables.js (parâmetros do painel) · db/ (pool, migrate, migrations/) · auth/ (tokens, password, nick, ratelimit)
               repos/ (+ settings, audit) · api/ (router + rotas, incl. admin.js) · http/admin.js (salas/kick/aviso) · persist/ (session, rewards, queue, hooks)
client/src/    main.jsx (3 entradas: jogo · /admin · ?sfx) · app/ (App, theme bridge) · admin/ (o painel: mount/api/admin.css)
               i18n/ (index.js o motor · pt-BR|en|es.js os dicionários · errors.js código→texto · catalog.js skins/conquistas/países)
               assets/scene/ (a arte do cenário do menu: logo + 5 sprites + 3 fundos, WebP)
               ui/ (telas React + Round.jsx, Modes/Party/Chat/KillFeed/Notice/AvatarPicker/Pause (o menu do Esc + o painel do dono), icons.js
               Logo.jsx + logoArt.js = a marca · NavIcons.jsx + navIconArt.js = os ícones da entrada) · util/image.js · api/client.js · state/ (store) · hooks/
               audio/ (index.js motor: 4 barramentos, prioridade de vozes, loops · kit.js receitas · mic.js push-to-talk · audition.js a mesa de som do ?sfx)
               theme/ (index.js + dawn|sunset|dusk: tokens/hud/screens.css gerados por port.js, index.js com textures/effects/hud) · styles/base.css
               game/ (index.js createGame · net/ · state/ · renderer/ · input/ (Pointer·Keyboard·Touch·Joystick·Wheel) · hud/ · bench.js)
docs/spec/     protocol.md · api.md · admin.md · hooks.md · server-game.md · client-game.md      docs/design/  telas.md · theme-time.md · rodada-1.md · som.md · modos.md
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
  a comida reposta sem parar, o berçário da supernova e (só no BR) a comida que fica no gás e morre;
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
  que zera o `mergeAt` de todas as peças do dono; e mais QUATRO **por jogador** (`FOOD_TYPE` 11–14, em `PlayerState`
  ao lado de `fireCdUntil`, zerados no nascimento pelo mesmo caminho): **auto-defesa** (`rules.autoDefend`, chamado na
  fase 1 do `step` como `else` do tiro manual — com um teleguiado entrante ainda descoberto, puxa o gatilho por você
  chamando o MESMO `applyFire`, então cadência, munição, alvo e crédito saem de graça; gasta munição e tem cadência
  PRÓPRIA porque o míssil tem `cd` 0, e a varredura é escalonada por slot — `incomingMissile` com `livres` é O(M²) e
  50 jogadores × 60 Hz seria o maior custo fixo do tick), **+1 munição** (raro: fura o teto da arma, o único lugar que
  passa por cima dele, e não guarda estado nenhum), **zoom** (afasta a câmera em `POWERUP.ZOOM_K`; ⚠️ `zoomFor`
  alimenta TAMBÉM a AOI do snapshot — e `aoiScaleFood` tem piso PRÓPRIO, então os dois recebem o fator, senão o anel de
  fora vem sem um grão — **mas ele SAIU do sorteio**: afastar a câmera era a única coisa que um powerup fazia com o
  que o jogador VÊ, e isso não é vantagem, é mudar o jogo embaixo dele no meio de uma briga. O código fica
  dormente como `BLACKHOLE.COUNT=0` e a Nova, e volta acrescentando a linha em `POWERUP.DROP`) e **banquete**
  (raro: comida vale `FEAST_K`; só a COMIDA — encostar no ganho de fragmento quebraria a conservação de massa).
  ⚠️ **A auto-defesa é CARGA, não tempo** (`PlayerState.autoDefN`, 0 ou 1; era `autoDefUntil` em ticks): 15 s de
  escudo automático é um relógio invisível que não dá para planejar — ou o jogador descobre que acabou no
  instante em que o míssil chega, ou nem percebe que existiu. A carga fica lá, eterna, até o dia em que salva a
  vida dele; usou, perdeu, e **não acumula**. Foi o que levou o **PROTOCOL_VERSION a 13**: o `self` continua com
  o mesmo u16, mas ele deixou de significar tempo. ⚠️ O **ímã** subiu de `MAGNET_MAX_R` 160 → 420 px, porque 160
  é um raio que qualquer partida decente passa em minutos: o powerup virava item morto justamente para quem
  jogava bem. O que segurava o teto lá embaixo era o ALCANCE (r·MAGNET_RANGE passava de 1500 px num planetão);
  agora quem o limita é `MAGNET_RANGE_MAX` (900 px absolutos), e em r=160 o alcance dá 880 — para quem já pegava
  ímã, nada muda. Serem por JOGADOR não é preguiça: câmera, cinto e economia não são de meia
  bolinha, e o `PIECE_FLAG` só tinha um bit livre. ⚠️ `type>=W_BURST` DEIXOU de significar "é arma" (os quatro entraram
  DEPOIS das armas no enum denso): quem responde isso agora é `isWeaponFood()`, e sem ele os powerups cairiam no ramo
  de arma e sumiriam sem efeito nenhum — em silêncio, que é o pior jeito de quebrar; mísseis (**o tiro DEFENSIVO não cobra escudo**: `applyFire` cobrava um nível ANTES do `switch` que decide o tipo de
  tiro, e a decisão "isto é um interceptador" só nasce depois, em `fireHoming` — ou seja, exatamente quando o tiro
  existia para salvar alguém, ele derrubava a outra coisa que o salvaria. Hoje o entrante é calculado UMA vez em
  `applyFire` e passado adiante, e o predicado tem que ser o MESMO de `fireHoming` (`livres`, sem mira, arma
  teleguiada): sem o `livres`, um entrante já coberto manteria o desconto e o tiro sairia no ATACANTE — ofensivo — de
  graça. O bot também parou de recusar a interceptação com escudo na mão (era consequência do custo, não uma escolha);
  **carência de `MISSILE.SPAWN_CD_TICKS` = 10 s a cada nascimento antes do 1º tiro** — senão o recém-nascido
  sai do spawn metralhando, sem nada a perder; vai no `self` como `fireCd` e o HUD desenha a contagem regressiva em cima
  do ícone da arma; homing no jogador, interceptação de míssil inimigo ou **tiro mirado** quando o
  jogador segura o botão — trava na **bolinha mais próxima do PONTEIRO** (`aimScore` = distância do cursor à borda dela, dentro de
  `AIM_PICK` do cursor e `AIM_RANGE` da peça): peça, míssil, asteroide ou estrela. Era um cone em volta da flecha escolhendo o mais
  próximo da PEÇA, e varrer o mouse dentro dele não trocava nada; agora o alvo segue o cursor e o cliente refaz a mesma conta todo
  frame (`lockOn`), então o anel pula junto — e o ESPAÇO com o tiro carregado CANCELA em vez de dividir (o `down` do tiro não manda
  nada ao servidor, então cancelar é local). **Alerta de míssil vindo em mim**: `self.threat`/`threatDir` (protocolo 8) — tem que vir
  do servidor porque o míssil nasce muito além da AOI —, com seta na borda da tela (`layers/Threat.js`), blip no radar e bipe que acelera; míssil×míssil varrido = CLASH;
  míssil desvia asteroide = DEFLECT); ímã (com teto de tamanho `POWERUP.MAGNET_MAX_R`: o alcance é r·MAGNET_RANGE e num planetão sugava a tela inteira) suga comida e ejetados
  (comida movida recebe UPDATE; cometa/estrela mais devagar; **asteroides também**, escalados por R_MIN/r; a estrela-perigo se arrasta até você); escudo por níveis 1–3 (o texto que sobe ao pegar diz **"ESCUDO 1/2/3"**, não "NÍVEL": com o nível do JOGADOR
  existindo e tendo badge próprio, "NÍVEL 2!" lia como se ele tivesse subido de nível; não expira,
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
  **O morto continua na sala, com HUD próprio** (`#hud.spec`, escrito por `Hud.jsx`): ficar mudo depois de morrer
  nunca foi regra, era `className={screen==="game"?"":"hidden"}` levando o `#hud` INTEIRO — e o `<Chat>` mora lá
  dentro. Hoje `dead` e `round` são um TERCEIRO estado: some tudo o que é de quem joga (arma, powerups,
  cooldowns, toque, placar, feed) e ficam as duas coisas de quem assiste — o chat (que ali **não desbota**: o
  `CHAT.FADE_MS` existe para não virar parede em cima do jogo, e atrás da tela de morte não há jogo) e o mapa.
  **Mapa grande** = o RADAR ampliado (`Minimap.setBig`), não a câmera afastada: o radar já desenha o mapa
  inteiro porque os inimigos vêm do PLACAR (todos os vivos, 2 Hz) e não da AOI, enquanto afastar a câmera só
  mostraria vazio — a AOI tem teto (`VIEW_MIN/VIEW_MAX` em `net/Session.js`). No tamanho grande cabe o NOME de
  cada planeta, e **clicar num deles é o mesmo `{t:"spectate",slot}`** das setas. Só com o jogador morto: mapa
  completo em partida seria vantagem tática. O céu continua virando com o relógio da rodada por trás de tudo
  isso — `roundTick` chama `setRoundHour`/`prewarmNextSky` ANTES da guarda `if(!renderer||dead)`, e o
  `GameHost` não desconecta em `dead`/`round`.
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
  queima `zoneBurnRate(r)` da massa/s e MORRE no piso — a única coisa que mata sozinha) e vitória do último vivo.
  O gás ENDURECE conforme o círculo fecha: de `ZONE.BURN` (.10/s, raio da etapa 0) a `ZONE.BURN·BURN_K` (.22/s, no
  menor círculo), interpolado pelo RAIO ATUAL — que os dois lados já têm, então a rampa não custou byte de
  protocolo; do tamanho inicial ao piso são 12,6 s no começo e 5,7 s no fim (eram 21 s fixos, e aí atravessar o gás
  em diagonal era atalho). **A COMIDA SEGUE A ZONA**: `spawnFood` sorteia dentro do círculo, o alvo de população é
  `foodTarget() = clamp(π·r²/ZONE.FOOD_AREA, FOOD_MIN, FOOD.COUNT)`, o que fica no gás MORRE
  (`_cullFoodOutOfZone`, `ZONE.FOOD_SCAN` grãos por tick) e a reposição tem RENDA (`ZONE.FOOD_FILL_S`: a
  população inteira a cada 2 s), não torneira — repor na hora é inofensivo em 92 M px² e é FONTE INFINITA num
  círculo de 480 px, onde o líder cobre quase tudo e reengole cada grão no tick seguinte: medido com 49 bots, o
  consumo ia de ~200 para 7 579 grãos/s nos últimos 30 s e o líder saía de 355 mil para 1,02 MILHÃO em 15 s — o
  tapete engordava o gigante. Com a renda o pequeno não perde nada (ele só alcança ~43 grãos/s) e em 60 s no
  círculo apertado ele faz 32–53× enquanto o gigante faz 0,97–2,8×. Enquanto o círculo é grande o teto manda e nada muda; do
  meio para o fim a densidade sobe 15× (49 px entre grãos) e é daí que sai a VIRADA do pequeno — o grão dá massa
  ABSOLUTA, então vale 2 % para quem tem 900 de massa e 0,01 % para quem tem 200 000, que ainda perde `PLAYER.DECAY`
  por segundo. Sem isso o círculo final era um deserto de 20 grãos e a última fase premiava tamanho acumulado, não
  jogada.
  ⚠️ **A zona fecha em 30 000 ticks (8 min 20 s), não em 21 300**: as três primeiras etapas ganharam quase
  todo o tempo extra e as duas últimas não mudaram — o começo deixou de ser corrido e o fim continua tenso.
  `BR.ROUND_TICKS` subiu junto (27 000 → 36 000), e os dois andam SEMPRE juntos: alongar a zona sem alongar o
  teto faz a partida acabar por tempo antes de o círculo fechar, que é o único jeito de o Battle Royale
  terminar sem ter decidido nada. Em produção quem manda é o env `ROUND_TICKS` (`k8s/05-config`). O piso de
  comida do círculo final caiu (`FOOD_MIN` 60 → 28): 60 grãos num círculo de 144 px é 2,2× a densidade do
  resto do fim, e era um colchão. E a renda de reposição afrouxou (`FOOD_FILL_S` 2 → 3) — é ela que engorda
  o gigante no aperto, e o pequeno nunca alcançou esse fluxo mesmo. ⚠️ `shared/test/bot.test.js` teve que
  rodar MAIS tempo por causa disso: nos 7200 ticks padrão da arena o círculo ainda cobre o mapa e ninguém
  encosta no gás.
  **A ESTRELA TAMBÉM SEGUE A ZONA** (`ZONE.STAR_*`): ela nascia sorteada no mapa inteiro, então o
  círculo fechado não tinha nenhuma e o perigo saía da partida justo quando ela fica interessante. Um
  predicado "está dentro do círculo?" não resolveria — com o círculo em 480 px de 9600, o ponto uniforme
  acerta 0,8 % das vezes e o `_farSpot` DEVOLVE a última tentativa —, então quem mudou foi a AMOSTRAGEM:
  polar dentro do disco (`d=√u·r`), o mesmo caminho que a comida já usava. `MIN_SEP` afrouxa junto com o
  raio (1400 px de folga não cabem num círculo de 1400) e, abaixo de `ZONE.STAR_MIN_R`, o respawn **ADIA**
  em vez de insistir: cada estrela esteriliza um disco de `r+FOOD.STAR_CLEAR` (246 px), que num círculo de
  480 é 26 % da área — justo o tapete que é a virada do pequeno. A que fica no gás some em silêncio e volta
  para a fila.
  A comida também nunca nasce EM CIMA de estrela (`FOOD.STAR_CLEAR` da borda, e a estrela nova varre o que
  estava ali): grão debaixo do disco é isca, cobra `STAR.BURN` e não dá escolha. A massa queimada
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
  **Armas** (`WEAPONS`): míssil + Rajada/Cacho, em cima de mecânica existente. A **Nova saiu** (`weight 0`, como o
  míssil, que já cai como munição): onda de 900 px centrada em MIM, sem mira e sem contra-jogo, resolvia sozinha a
  briga de fim de partida — justo onde o círculo apertado devia decidir no encontro. O código fica dormente e
  testado, como o `BLACKHOLE.COUNT`, e volta trocando o número.
  O jogador CARREGA VÁRIAS: `ps.ammo[arma]` é a munição de cada uma, `ps.weapon` a que está na mão, e a troca é
  `INPUT_FLAG.SWAP` (tecla Q / chip do HUD / botão de toque) — coube num bit que já sobrava, o INPUT segue com
  10 bytes. O míssil nunca sai do cinto, nem zerado. `acceptsJoin()` é a porta única de entrada da sala.
  **Vitória tem fogos**: quem vence vê a salva sair do próprio planeta (`fireworkPrims` em theme/util.js —
  física compartilhada, paleta por tema; traço em vez de ponto, arrasto, gravidade, cor em 3 tempos, cintilação).
- **O PREÇO QUE NÃO CABE EM PEÇAS** (`shatterBlock` em `rules.js`, `EVENT.STUCK`, **PROTOCOL_VERSION 14**):
  estrela, míssil e asteroide cobram METADE do preço PARTINDO o alvo — e com as `PLAYER.MAX_PIECES`
  ocupadas isso simplesmente não acontecia, **em silêncio** (`shatterPiece` devolvia um `false` que
  ninguém lia). Foi o que levou os jogadores a se picarem em 16 de propósito para atravessar cinturão e
  estrela quase de graça. Agora `shatterBlock` distingue os DOIS motivos, que não valem a mesma coisa:
  **sem vaga** é escolha do jogador (vira PREÇO — `STAR.BURN_STUCK` .55, `MISSILE.STUCK_SHRINK` .82,
  `ASTEROID.CHIP_STUCK` .22) e **massa mínima** é o piso do jogo (não pode virar castigo). Sempre com
  retorno na tela: o evento `STUCK` tem efeito, som e ícone. ⚠️ Na estrela isso já era MEIO pago — ela
  queima `BURN` mesmo com 16 peças; o exploit de verdade era o ASTEROIDE, onde a lasca comum é
  **reembolso**: 4 % que voltam como fragmento do próprio dono, nascido ATRÁS dele (o lado para onde o
  quique empurra) e a 97 px, dentro do próprio planeta.
- **O DANO DE MÍSSIL ERA UM EMPRÉSTIMO** (`pieceMissile`, `MISSILE.DEBRIS_DIST/DEBRIS_SPREAD`): os
  `HIT_DEBRIS` cacos nasciam no CENTRO da peça, em TODAS as direções (o spread era 2π) e a 540 px/s — como
  o ejetado integra com arrasto puro, o alcance é `v/DRAG` = **146 px**, ou seja DENTRO de qualquer planeta
  com r > 146 —, e com 20 ticks de imunidade o dono engolia de volta os 19 % que o tiro tinha arrancado.
  O teste de conservação de massa passava; ninguém testava se o caco ESCAPA. Agora a massa RESVALA: sai do
  lado OPOSTO ao míssil, nasce na BORDA, viaja `DEBRIS_DIST` px além dela e usa `ownerImmune(r)` (12 s num
  r=1000). Nada evapora — só deixa de ser bumerangue. O mesmo remédio vale para a lasca sem vaga, para a
  pelota que o gás arranca e para o excesso do `autoSplit`.
- **`autoSplit` deixou de DESTRUIR massa** (`rules.js`): sem vaga de peça, o excesso acima de `MAX_R`
  virava `setR(pc,cap)` e sumia — era o único ponto do jogo, fora do `PLAYER.DECAY`, em que massa de
  jogador evaporava, e em silêncio. Hoje ele é cuspido em `PLAYER.OVER_N` fragmentos.
- **A ZONA MEDE A FATIA DO DISCO, não o centro** (`zoneExposure` em `rules.js`; `predict.js` usa a MESMA
  função, então o protocolo não muda). O critério era "meu centro está dentro do círculo?" — e com o raio
  final de 144 px contra um teto de peça de 1000, o gigante ficava com o corpo cobrindo a arena inteira
  sem queimar um grama: fisicamente invencível no exato momento em que o círculo devia decidir a partida.
  Medindo a exposição ele **derrete até caber**, e quem já cabe não sente nada. Três atalhos antes de
  qualquer `acos` (cabe inteira · inteira fora · o CÍRCULO dentro da peça, que é `1 − R²/r²` e é o caso do
  gigante) mantêm o custo por tick: ~50 µs no pior caso absoluto, contra 1,5 ms de orçamento.
  ⚠️ A cauda de `ZONE.R` mudou junto (final .015 → **.08**, 144 → 768 px) — sem isso a cura mata o
  paciente: o teto geométrico seria 20 736 de massa para a SALA INTEIRA. 768 px é ~um arremesso de split
  de raio: cabe a briga, não cabe o planeta. E cada etapa passou a tirar METADE da área, então a pressão é
  constante do começo ao fim. O teto de massa do fim virou geométrico e de graça: `Σr² ≤ R²` = 590 mil
  para a sala toda. `ZONE.FOOD_MIN` subiu junto (28 → 1200), senão o tapete de comida do círculo final —
  que é a virada do jogador pequeno — sumia com o raio maior. E `bot.js:_zonePlan` desconta o próprio raio,
  senão o bot passa a partida com a borda no gás.
  ⚠️ A pelota que o gás arranca também precisou LIMPAR o planeta (`ZONE.SHED_DIST`): com velocidade fixa
  ela rendia 70 px de alcance, o gigante a reengolia e chegava a um EQUILÍBRIO — parava de encolher
  exatamente onde a zona devia estar cobrando dele.
- **NICK LIVRE, ÚNICO SÓ POR SALA** (`Room.nickTaken`, erro `NICK_IN_ROOM`; migração **0009**): o nick era
  único no mundo inteiro entre contas registradas (`users_nick_registered_uq`) e isso nunca foi uma regra de
  JOGO — nick é nome de planeta, e **qualquer um tem que poder ser o Messi**, com a caricatura do Messi (o
  egg de `eggs.js` sai do nick). A única regra que o jogo precisa é por SALA: dois planetas com o mesmo nome
  fazem o kill feed, o chat e o placar mentirem — quem morreu não sabe por quem. `usedNicks` é consultado na
  entrada e **limpo na saída**, senão a sala vira lista negra e quem sai não volta com o próprio nome; o
  `JOGAR (AUTO)` pula as salas onde o nick está em uso, então a recusa só aparece para quem entrou por
  CÓDIGO — e o caminho de EQUIPE é justamente esse (`Party.start` manda todos para o mesmo código), por isso
  a recusa passou a levar `suggestion` e o cliente devolve o jogador à tela INICIAL, com o campo de nome em
  foco, em vez de despejá-lo na tela de Salas com um toast.
  ⚠️ **Quem segurava a unicidade global não era o jogo: era o LOGIN.** `POST /api/auth/login` aceita "nick ou
  e-mail + senha" e o e-mail é OPCIONAL no cadastro — para a maioria das contas o nick ERA o login. Então o
  nick se partiu em dois: **`users.login`** é o nome de ENTRADA, nasce no `claim` (do corpo, ou do nick da
  hora quando o corpo não manda — é o que mantém o cliente velho funcionando no rollout), é ÚNICO
  (`users_login_uq`, parcial em `login IS NOT NULL`) e **não muda mais**; o `nick` é o nome de jogo, livre.
  Ninguém perdeu o acesso: o backfill gravou `login=nick`, então toda conta continua entrando com o nome de
  sempre. Conta de Google e convidado ficam com `login` NULL — não entram por senha, não reservam nome.
  ⚠️ `byLogin` ganhou `password_hash IS NOT NULL` (sem isso uma conta de Google com o mesmo e-mail entrava no
  `LIMIT 1` e derrubava o login de quem tem senha) e um degrau `login IS NULL AND lower(nick)=…`, que é
  COMPATIBILIDADE de rollout: conta reivindicada por um pod velho fica sem login e, sem e-mail, ficaria
  trancada para sempre. ⚠️ O `login` vai no `toPublic` e o **Perfil o mostra**: o nick se troca num `onBlur`
  da tela inicial, e sem essa linha o jogador volta dias depois sem saber com que nome entra.
  ⚠️ Saiu junto o `EXISTS(...) AS nick_reserved` do `RESOLVE_SQL` (`auth/tokens.js`) — uma subconsulta em
  TODA chamada autenticada e em TODO join de WS — e o `ERROR_CODE.NICK_RESERVED` (4409) ficou **dormente**,
  como `BLACKHOLE.COUNT=0`: nenhum servidor novo o emite, mas um pod velho emite durante o rollout e o
  cliente precisa saber traduzi-lo. ⚠️ Um `UPDATE users … WHERE nick=…` deixou de identificar UMA conta —
  `docs/spec/admin.md` promovia o primeiro admin assim.
  ⚠️ Como o nick de uma conta é o da CONTA, a regra de sala também impede a mesma pessoa ter dois planetas
  na mesma sala — e foi por isso que os testes passaram a criar um token por cliente.
- **Todo jogador tem PAÍS, inclusive o preenchimento** (`botCountry` em constants, `Room.broadcastFlags`,
  JSON `flags`): o humano já tinha bandeira no ranking, e uma sala de 50 com UMA bandeira acesa apontava
  quem era gente antes de qualquer comportamento denunciar. O país do bot é sorteado pelo rng da sala e
  **coerente com o nome** (um "Savannah" com bandeira do Brasil é mais estranho que bandeira nenhuma). Vai
  em JSON de controle, no molde de `broadcastAvatars` e pelo mesmo motivo: 2 bytes por linha em TODO
  broadcast de PLAYERS, para um dado que muda quando alguém entra ou sai, é caro.
  ⚠️ O `xX…Xx` saiu de `botNick`: é a assinatura de um gerador, não de uma pessoa. `baseNick` continua
  desfazendo o padrão porque HUMANOS ainda escolhem nicks assim.
- **ZOOM MANUAL NA RODA** (`zoomSpan`/`clampZoom` em `shared/src/camera.js`, `ZOOM` em constants,
  `client/src/game/input/Wheel.js`): a câmera era 100 % automática. A roda agora escolhe dentro de uma
  FAIXA em torno do `zoomFor`, e a largura da faixa vem da MASSA — ver mais mundo é VANTAGEM, e dá-la de
  graça ao pequeno inverteria o único preço que crescer cobra aqui (o planetão é lento, mas vê longe). O
  novato ganha ±10 %, o gigante ~±42 %, e **o teto é `POWERUP.ZOOM_K`**: não é gosto, é o único
  afastamento para o qual a AOI já foi dimensionada e medida — peça, asteroide, estrela e míssil vêm pela
  visão INTEIRA. ⚠️ O fator do powerup entra ANTES do piso do mundo e o da roda DEPOIS, e trocar isso
  mata a funcionalidade em silêncio justo para o planetão, que vive encostado no piso (ΣR ≈ 3578 em
  1920×1080): ele giraria a roda e nada aconteceria. ⚠️ Vai no `{t:"view",w,h,z}`, que agora tem
  **emissor único** no cliente — resize e roda dividem o balde de `NET.RATE_JSON` (5/s), cujas 3
  rejeições em 10 s ENCERRAM a conexão. ⚠️ Quem clampa é o SERVIDOR, com o ΣR de verdade
  (`net/snapshot.js`), e **não pune quem manda fora da faixa**: um cliente honesto fica fora dela o tempo
  todo (mandou o `z` com o ΣR de 200 ms atrás). Na AOI o fator é `max(1,f)` — aproximar nunca encolhe a
  área enviada —, com marca d'água de `ZOOM.GRACE_TICKS` no sentido que encolhe, porque a câmera é
  suavizada (3τ ≈ 470 ms) e a AOI é instantânea. Volta ao automático pelo **detent** (um passo que
  cruzaria o 1 para nele), pela tecla **0** ou pelo **botão do meio**, que já era interceptado e não fazia
  nada. `Digit0` pode ser tecla fixa porque não está em `ACTION_KEYS`.
- **O NOME NÃO SAI EM CIMA DA CARICATURA** (`layers/Planets.js`): o rótulo mora no CENTRO do disco
  (`nameY:()=>0`), que nas 35 skins de easter egg é onde ficam o nariz e a boca. O predicado é
  **`skin.face`** e não `rarity==="secret"` — as skins 45–48 também são secretas e são `pattern:"plain"`,
  e pela raridade quatro skins sem rosto nenhum perderiam o nome de graça. A skin Retrato (a FOTO do
  jogador) mantém o nome, por decisão.
- **MENU DE PAUSA NO ESC** (`ui/Pause.jsx`, `overlays.pause`): é OVERLAY, não tela — navegar para `prefs`
  durante a partida faz `GameHost.jsx` chamar `game.leave()` (a conexão CAI) e o `Hud` esconder o `#hud`
  inteiro. As prefs saem da MESMA tabela de Opções (`PREFS` + `PrefRow`, extraído de `Prefs.jsx`), num
  subconjunto: em partida ninguém quer trocar a tecla de dividir. ⚠️ A partida **não pausa** (é
  multijogador e o servidor é autoritativo); o que para é o COMANDO — `canAct`, o teclado e, sobretudo,
  o `enviarInput` mandando o alvo em cima do próprio centróide, pelo mesmo caminho do `roundOver`: sem
  isso o planeta continuaria seguindo o mouse por cima do modal, porque o ponteiro é lido na JANELA.
  ⚠️ A cadeia do Esc é resolvida num lugar só (`escape()` em `state/actions.js`): os outros listeners são
  todos `keydown` na janela, em bolha, então vale a ordem de REGISTRO — o do `Chat` é neto e vem antes,
  que é o certo (quem digita quer sair do campo, não abrir um menu).
- **SALA COM DONO** (`docs/design/modos.md`): o jogador abre a sala DELE — modo, duração e privacidade — e
  entra como dono, podendo expulsar e banir. ⚠️ **Só conta registrada**: quem expulsa precisa de uma
  identidade que dure mais que uma aba. ⚠️ **`roundTicks: 0` é SEM FIM**, e a representação escolhe-se
  sozinha porque `roundTick` no cliente já tinha o ramo `!round.ticks`. Ela exigiu QUATRO guardas, e três
  delas são coerção silenciosa: `0>=0` acabaria a rodada no primeiro tick (`Room.js`); `null>n` é FALSO
  para todo limiar, então UMA chamada dispararia a cascata inteira de avisos de BIG CRUNCH (`feed.js`);
  `null<60` é VERDADEIRO, e a urgência ficaria em 1 desde o primeiro segundo, com a TRILHA presa no
  clímax para sempre (`game/index.js`); e `roundTicks||…` comeria o 0 no construtor. ⚠️ O céu continua
  girando: `roundInfo()` passou a mandar **`dayTicks`**, porque a hora do espaço saía de `ticks/days` e
  sem `ticks` ela PARARIA justo na sala que dura mais. ⚠️ **Sem fim só no Livre** — no BR o tempo é a rede
  de segurança da zona, e `roundTicksOf` recusa abaixo de `ZONE_TOTAL_TICKS`, derivado das etapas.
  ⚠️ **Kick e ban vão por WS**: o socket do dono já está no shard que conhece a sala, então não há o que
  rotear; só o `GET /api/room/:code` do link de convite usa `askPeers`. ⚠️ O roster do dono tem só
  HUMANOS (iterar `sessions` respeita o `anonBots` por construção) e **não** é o `adminInfo`, que leva
  `sessionId`, `userId` e IP — o dono é jogador, não administrador; o handle é um `pid` opaco por sala,
  nunca o slot (recicla). ⚠️ `users.id` é BIGINT e o driver o entrega como STRING: sem `Number()` no
  `hostUserId`, `'53'===53` é falso e o dono simplesmente não seria dono, sem erro nenhum.
  ⚠️ O ceifador não recolhe a sala do dono enquanto `ROOM.HOST_HOLD_MS` não vencer (ela existe para
  esperar os amigos), e o filtro de PRIVADA mora em `RoomManager.listRooms` — não em `Room.info()`, que é
  a base do `adminInfo`.
- **PAINEL /admin** (`docs/spec/admin.md`): rota da MESMA SPA, chunk sob demanda (`main.jsx`, o padrão do
  `?sfx`) — nenhuma linha de infraestrutura muda. Um admin é uma CONTA (`users.is_admin`, migração 0008),
  porque o `RESOLVE_SQL` do token já faz `SELECT u.*` e a coluna chega de graça, e porque sem identidade
  não há auditoria que sirva. ⚠️ O token do painel é de outro `kind` (`admin`, 12 h): roubar a aba do jogo
  de um administrador NÃO abre o painel. ⚠️ `server/src/api/index.js` tem um `PREFIXES` que é um gate
  silencioso — rota `/api/admin/*` ausente dele não chega ao handler e cai em 404 sem uma linha de log.
  ⚠️ E há DOIS padrões de fan-out que não podem ser trocados: sala **roteia pelo dono** (`askPeers`),
  aviso e parâmetro **difundem** (`tellPeers`, que devolve o que CADA irmão respondeu, com as falhas — um
  broadcast feito com `askPeers` entregaria a um shard e diria "ok").
- **Parâmetros de jogo em runtime** (`shared/src/tunables.js` + `admin_settings`): lista BRANCA, nada fora
  dela é gravável. Escrever custa ZERO no laço de 60 Hz porque `world.js` faz `const PW=POWERUP` — isso
  aliasa o OBJETO, e os objetos de `constants.js` não são congelados. O **banco é a verdade**; o push
  entre irmãos só pede que releiam. ⚠️ Chave `scope:'both'` responde **501**: o cliente tem a própria cópia
  do bundle, e mudar de um lado só faria `predict.js` divergir. É por PROCESSO, não por sala.
  O caso pedido é o **teto do ímã**, dito em MASSA (100 000 = √ → 316 px de raio), que é o número que o
  jogador lê no HUD.
- **Chat e voz** (`CHAT`/`VOICE` em constants): chat de sala ou de equipe (o escopo é do servidor), painel na
  faixa esquerda do HUD. **Quem morreu continua falando** — texto e voz —, e o escopo é UMA função
  (`Room._escopoFala`), porque três caminhos precisam da mesma resposta: a linha, o ícone do 🎤 e o clipe.
  Vivo, a regra do modo. Morto: no **Livre** ele fala com a sala inteira (marcado ☠), porque morrer ali dura
  segundos e os preenchimentos renascem no mesmo tick — isolá-lo seria mandá-lo escrever para uma sala vazia;
  no **Battle Royale** vale a regra do Counter-Strike (morto → mortos), e ele pode PEDIR `scope:"team"` para
  alcançar o esquadrão inteiro, vivos incluídos: a informação de quem morreu é da equipe dele. O pedido fica na
  SESSÃO (`session.chatScope`) porque a voz não tem onde carregá-lo. ⚠️ A linha de escopo `dead` **não entra no
  prompt da LLM** (`_ctxFala` filtra): quem responde é sempre um bot VIVO, e ele devolveria para a sala inteira
  uma resposta a algo que nenhum vivo leu. ⚠️ E a fala de um morto sai da **câmera** dele (`_origemFala`), não de
  `_centro`: sem peça no mundo aquilo devolveria a origem do mapa e a voz não alcançaria ninguém. Voz é push-to-talk no **Ctrl**, clipes curtos em **µ-law 8 kHz** — não Opus, porque o
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
  ⚠️ **Uma coisa NÃO é stateless: o lobby de equipe** (`rooms/Party.js`), que vive na memória do pod que gerou o código —
  e essa premissa escrita aqui é o que quebrou o modo em equipe em produção por meses: com `/api` balanceado, 2 em cada 3
  chamadas caíam num pod que não conhece o código, voltavam 404, e o cliente fechava a tela de equipe em 1 s. O código diz
  quem é o dono (1º char), então quem recebe e não é o dono ENCAMINHA para os irmãos (`http/api.js` → `/internal/party/*`,
  via `askPeers`), repassando o `Authorization` — `hashToken` é sha256 sem segredo, então o irmão chega na MESMA `key`.
  A rota interna **nunca reencaminha** (é o que impede laço entre shards) e irmão mudo é **503, nunca 404**: só o 404 faz
  o cliente desfazer a equipe. Perguntar a todos é seguro até para mutação porque o guarda de `Party.get` recusa quem não
  é dono antes de tocar em nada. Quem prova é `server/test/party-shards.test.js`, que sobe DOIS shards no mesmo processo —
  os testes de party de `br.test.js` fixam `SHARDS=1` e por isso nunca viram o bug.
- **Identidade**: token opaco `pt_…` (sha256 no banco), guest por padrão (`POST /api/auth/guest`), reivindicar com senha (scrypt nativo)
  trava o nick; `join {token}` — nick/skin nunca vêm do cliente. Banco fora → modo sem persistência (`unsaved`), o tick nunca espera o banco
  (fila com retry, circuit-breaker). Moedas/conquistas só no servidor (`persist/rewards.js`).
- **Casca da tela** (`body[data-shell]`, escrito por `App.jsx`; regras em `client/src/styles/ui.css`): na PRIMEIRA carga do navegador
  o menu é `center` — centralizado de verdade e com rolagem (os temas o deixavam preso em `flex-start` + `8vh` com `overflow:hidden`,
  então em tela baixa o botão JOGAR ficava fora do alcance). Com uma partida VIVA atrás vira `rail`: gaveta à direita e
  **a câmera encolhe para a esquerda** em vez de ficar escondida atrás dela. Quem decide é `played && conn` fora de
  `idle`/`closed`, não `played` sozinho: ele só era escrito como `true` e nunca voltava, então sair da partida deixava a
  gaveta à direita com o canvas VAZIO à esquerda — uma gaveta que não é aparte de nada. `leaveGame` zera a conexão e o
  menu volta ao centro sozinho; morrer e o fim de rodada mantêm `connected` e seguem na gaveta, que é onde o espectador
  tem o que ver ao lado. Quem faz isso é `--rail-w` no `#game` e no `#hud` — e só
  funcionou porque o `inset:0` INLINE que `game/index.js` escrevia no container saiu: estilo inline ganha de qualquer folha. Encolher o
  `#game` basta, porque o Pixi é criado com `resizeTo:container` e o `ResizeObserver` já refaz câmera, zoom, AOI e o `{t:"view"}`.
  Celular em pé nunca vira gaveta (lá o certo é a folha de rodapé, que é o que os temas fazem). **Modais são centralizados nos três
  temas** fora do celular em pé: o "às vezes no meio, às vezes embaixo" era o RELÓGIO — só o `dusk` (20h–05h) os transformava em folha,
  e o mesmo modal mudava de lugar conforme a hora. `#s-round` (o pódio do BIG CRUNCH) **não tinha uma linha de CSS em arquivo nenhum** e
  caía cortado no canto; agora herda o tratamento de `#s-dead`.
  **TODA TELA NO MESMO LUGAR**: o mesmo bug dos modais, uma camada acima. A POSIÇÃO de cada tela vinha do tema, e o tema
  vem do relógio — `dawn`/`sunset` colam `.screen .wrap` como gaveta à direita (`screens.css:49`), `dusk` cola a MESMA
  regra como folha no rodapé. Na mesma sessão, "Modos" abria encostado no topo e cortado embaixo, "Salas" boiava no
  rodapé, e só a tela inicial (a única com regra própria em `ui.css`) ficava centrada: três ancoragens para painéis
  irmãos, trocando sozinhas às 16h e às 20h. Agora todas são a MESMA caixa — `--screen-top`, `width:min(520px,100%)`,
  altura pelo conteúdo, rolagem por dentro, alinhadas de cima para baixo. O que continua do tema é a SUPERFÍCIE; o que
  se unifica é a ancoragem e a moldura (que na gaveta/folha era de três lados e agora fecha, porque a caixa não encosta
  em borda nenhuma). `#s-dead`/`#s-round` entram por NOME: não têm `.wrap`, montam o `.screen` à mão.
  A **tela inicial** virou coluna única na mesma caixa (`"brand" "main" "side"`): era um grid de duas colunas, e por
  isso o cartão principal abria fora do eixo em que todas as outras telas abrem — comparar as duas lado a lado era o que
  denunciava. O TOP 5 desceu para baixo do cartão, e por isso deixou de sumir no celular deitado: ali ele agora cabe.
  Nessa tela quem rola é o `.screen`, não o `.wrap` — sem moldura não há caixa por dentro da qual rolar, e uma barra de
  rolagem interna comeria 15 px justo da medida que tem que bater com a das outras telas.
  `scripts/responsive-check.mjs` cobre `dead`, `round`, `entry@rail` e `shop@rail` (a gaveta com o conteúdo mais largo
  do jogo — 432 combinações).
- **A BARRA DE NAVEGAÇÃO VOLTOU PARA DENTRO DA CAIXA** (`Screen` em `ui/bits.jsx`), que é onde os TRÊS
  temas sempre a desenharam (`order:99;position:sticky;bottom:0`, mais as variantes de retrato e paisagem).
  O motivo de ela ter saído era real e continua escrito abaixo — mas o conserto não era tirá-la da caixa:
  era dar à CAIXA uma **altura determinada** (`top` E `bottom` fixos em `ui.css`, em vez de `height:auto` +
  `max-height`). Com a caixa idêntica em todas as telas, a barra fica no mesmo pixel em todas elas.
  E isso desfaz de uma vez o estrago colateral da saída: `.lobby-hero`, `.prefs-foot` e `.rank-me` são
  `position:sticky;bottom:74px` nos temas — 74 px é a ALTURA DA BARRA —, e sem ela por baixo os três
  pairavam OPACOS sobre o conteúdo: a tabela de Salas cortada ao meio, os botões de Preferências flutuando
  no meio dos grupos e a faixa "Você 1º" cobrindo as linhas do Ranking eram **o mesmo defeito**, três vezes.
  No celular em pé a caixa É a folha de rodapé, então a barra dentro dela continua colada embaixo — que é
  exatamente o que o pedido "no desktop ela tem que ficar no painel central" queria dizer.
  O texto abaixo é o histórico de por que ela chegou a sair:
- **(histórico) A BARRA DE NAVEGAÇÃO ESTEVE em `App.jsx`**: antes cada tela renderizava a sua DENTRO da caixa, e
  o resultado dependia da altura do conteúdo. Os temas a colam com `order:99;position:sticky;bottom:0`
  (`screens.css:32`), ou seja, no fundo do SCROLLPORT da caixa: em "Salas" (conteúdo curto) ela grudava no
  fundo de um retângulo baixo, no meio da tela; em "Perfil" (caixa no teto, rolando) ia parar quase no rodapé
  da janela. E as margens negativas (`-16px`/`-22px`) a faziam sangrar para fora do padding, o que dava a ela
  a largura "grande" de uma tela e a "pequena" de outra. Pior: **"Modos" e "Equipe" não a renderizavam** — a
  barra simplesmente SUMIA, e isso nunca foi CSS, era `Modes.jsx` sem `<Nav>`. Fora da caixa ela é sempre a
  mesma: `#app>nav.nav` (1,1,1, que ganha do `:where` dos temas) presa no rodapé, altura em `--nav-h`, e a
  caixa das telas desconta essa altura do teto. Na gaveta ela vira a barra DA gaveta (`width:var(--drawer-w)`),
  senão taparia o jogo que continua vivo à esquerda. A tela inicial fica de fora de propósito: lá a navegação
  são os seis botões do próprio cartão.
- **O modal da loja precisa de PORTAL** (`Shop.jsx` → `createPortal(…, #app)`, o primeiro do projeto): o
  `.overlay` é `position:absolute` e o bloco contentor dele era o `.wrap` da loja — que é absoluto, ROLA e
  ainda tem `transform:translateX(-50%)`. Daí os dois sintomas: o `top:50%` centrava no meio da CAIXA (não da
  tela) e o modal descia junto com a rolagem da grade. ⚠️ `position:fixed` NÃO resolve: um `transform` no
  ancestral também captura elementos fixos. Montado na raiz, o ancestral vira `#app{position:fixed;inset:0}` e
  o CSS que já existe centra sozinho — é o mesmo caminho de `AccountModal` e `ReconnOverlay`.
- **O NOME É LEGENDA, NÃO TATUAGEM** (`labels.nameY` nos três `theme/*/index.js`, `layers/Planets.js`,
  `theme/util.js:paintNameBand`): ele nascia no CENTRO exato do disco (`nameY:()=>0`) — que é onde mora o
  nariz e a boca. Com as 35 caricaturas isso virou insustentável: o Trump perdia a boca e o Ronaldinho
  perdia o sorriso, justo a parte pela qual a ilustração existe. Agora é legenda de foto no rodapé
  (`nameY:(fs,r)=>r*.62`), sobre uma FAIXA em degradê recortada no círculo. A faixa é **sprite de textura
  assada por tema**, gêmeo do ícone de fala: o `gfx` de cada peça é limpo todo frame e um degradê ali
  pediria um `FillGradient` novo por raio; assar dentro da textura do PLANETA seria mais barato ainda, mas
  ela apareceria com "mostrar nomes" desligado — uma faixa escura sem nada escrito. Três números que a
  mudança obrigou: **`nameFill`** é campo PRÓPRIO (miolo translúcido, a arte aparecendo por dentro da
  letra) porque `nameColor` também pinta o ícone de push-to-talk e mexer num só desbotaria os dois —
  `"rgba(255,255,255,0)"` vaza a letra de vez; **`strokeWidth` caiu de `s*.2` para `s*.11`**, porque aquele
  contorno de 20 % existia para o texto sobre a arte NUA e, a 11 px de tela, fechava os buracos das letras
  e virava mancha — quem separa agora é a faixa; e **`NAME_MIN_PX`** (10), o primeiro piso em pixels de
  TELA (o único que havia era `minR:13`, de raio de MUNDO, então com a câmera afastada o nome saía com 4–6
  px). O texto também passou a CABER (`nameFitK`): `size` dava 0,34·r e um nick de 10 letras pedia ~1,87·r.
  ⚠️ O fator é FROUXO (.92) por medição: com .74, um nick de 13 letras num planeta de r=54 era espremido a
  9 px e SUMIA — trocava um defeito por outro. ⚠️ A largura é medida uma vez por nome **com a escala
  forçada a 1**: medir sem zerar lê a largura já escalada do frame anterior e o texto encolhe a cada quadro
  até desaparecer, em silêncio. ⚠️ Trocar o estilo da fonte exige trocar o NOME do atlas (`pn3-<tema>`),
  que é a chave do cache. ⚠️ E `nameY` recebe o RAIO agora: `theme/preview.js` chama a mesma função e com
  um argumento só devolveria `NaN`.
- **A COLUNA DIREITA: ordem fixa e neon roxo** (`Hud.jsx`, `ui.css`). Duas coisas separadas, uma captura:
  (a) **o kill feed era o PRIMEIRO da pilha** e ele nasce e morre (`KillFeed.jsx` devolve `null` sem linha
  viva), então a cada abate o cartão de massa e o placar desciam e voltavam. Agora a ordem é massa → top 10
  → feed, e o feed recebe só a SOBRA (`flex:0 1 auto` com `min-height:0`, sem o qual um filho flex nunca
  encolhe abaixo do próprio conteúdo). Nada acima dele se mexe, por construção.
  (b) **o marrom nunca foi uma cor escolhida**: era `color-mix(--accent 52%, transparent)` — dourado
  TRANSLÚCIDO — composto sobre o céu escuro do alto da tela; a cor do painel dependia do que passasse
  atrás e virava outra às 16h e às 20h. A superfície agora é própria e FIXA nos três horários, na
  linguagem neon que o projeto já tinha escrita e nunca portou (`mockups/v2/src/theme.toon-neon.js`:
  #0d0b1f, #1c1440, aro #8b5cff, dado #2ee6ff). Três papéis: ROXO é superfície, DOURADO é mérito (pódio e
  badge de nível — que o chat e o feed também usam, então retintá-lo só aqui criaria duas cores para o
  mesmo selo) e CIANO é número. Sem `backdrop-filter`: o HUD é DOM sobre um canvas a 60 fps e um blur de
  fundo obriga a reler o backdrop a cada quadro.
  ⚠️ Três armadilhas que custaram uma passada cada: `border` TEM que vir com estilo (o tema faz `border:0`
  em `#hud-lb`, e por isso o `border-width:2px` que morava no `ui.css` era inerte — o placar nunca teve
  borda); a COR do texto ainda desce do tema (`color:var(--line)`, quase preto, em `#hud-score`,
  `.lb-pos` e `.lb-row.mine`), e sobre o escuro novo isso é texto invisível; e **a largura da coluna é a do
  FEED, não a dos painéis** — `#hud-right` é `overflow:hidden`, então filho mais largo que ela tem o começo
  DECEPADO, e como a coluna é alinhada à direita o que se perde é o nome de quem matou. Alargar só o
  `#kill-feed` não resolve nada.
- **O feed dura 22 s e morre em DEGRADÊ** (`FEED.TTL_MS`, `#kill-feed .kf-row:nth-child` em `ui.css`): a
  linha sumia inteira em 9 s e quem estava olhando o jogo perdia o abate. Agora a mais nova fica opaca e as
  de baixo desbotam conforme as novas as empurram, até o corte em `FEED.ROWS`. ⚠️ As quatro regras de
  `nth-child(n+k)` têm a MESMA especificidade e valem para "desta linha em diante": quem manda é a ORDEM,
  e reordená-las inverte o degradê. ⚠️ O feed também deixou de obedecer à largura dos painéis para caber
  dois nicks (12ch cada) — e isso só funciona com `min-width:0` descendo até o `.nk`, porque item de flex
  nasce com `min-width:auto` e não encolhe abaixo do conteúdo. ⚠️ No RETRATO nada disso vale: 375 px não
  têm largura para o feed largo (a matriz mediu 42 px em cima do chat) nem altura para 4 linhas (elas
  batiam nos botões de toque, porque `overflow:hidden` esconde o excesso mas NÃO encolhe a caixa do filho,
  que é o que colide).

- **Placar do HUD: UMA TABELA, não dez pílulas** (`#hud-right`, regras em `client/src/styles/ui.css`): era uma
  pilha de balõezinhos independentes, cada linha com fundo, borda, sombra dura, rabinho de quadrinho e
  LARGURA PRÓPRIA (`min-width:172px`, 204 na 1ª). Dez larguras diferentes empilhadas à direita davam uma
  borda serrilhada e — o que importa — os números da massa não se alinhavam entre si, que é a única coisa
  que um placar existe para deixar comparar. Hoje é uma grade de três colunas (`18px 1fr auto`) num cartão
  translúcido só, largura fixa, nome com reticências, e a linha PRÓPRIA separada por um filete quando vem
  de fora do top N (sem ele o placar mente, colando o 15º logo abaixo do 8º). ⚠️ Mexer só em `ui.css` e com
  `#hud #x` (2,0,0): o `hud.css` dos temas é GERADO pelo `port.js` e a próxima passada apagaria a mão, e
  empatar em (1,0,0) com o tema PERDE (ui.css é importado antes). ⚠️ Sem superfície por linha o texto fica
  direto sobre o jogo, então `text-shadow` — sem ele o placar some no céu claro do `dawn` ao meio-dia.
  ⚠️ **Um comentário CSS não pode conter um fecha-comentário.** Havia `theme/*/hud.css` escrito dentro de um
  `/* … */`: o `*/` do caminho FECHA o comentário ali, e a primeira regra depois dele é engolida em
  silêncio. Foi assim que `body{--nav-h:74px}` deixou de existir e todo `calc()` que dependia da variável
  virou `max-height:none`. Cite caminhos com `<id>`, nunca com asterisco-barra.
- **Munição, carga e ímã: os três tetos** — `AMMO_PLUS` era `addAmmo(ps,1)` cru, sem comparação nenhuma: o
  único lugar do jogo que passa por cima do teto passava por cima dele SEMPRE, e a munição subia sem fim
  (**9 mísseis** com `MAX_AMMO` 3, visto em produção). Hoje ele EMPRESTA uma bala (`MISSILE.AMMO_OVER`) —
  gastou, o teto normal volta a valer. A **auto-defesa** passou a ACUMULAR até `POWERUP.AUTODEF_MAX` (3):
  travada em 1, o segundo grão pego não fazia nada, e powerup que não muda nada ao ser pego é pior que
  powerup nenhum. E o **teto do ímã** virou 100 mil de MASSA (`MAGNET_MAX_R` = √100000 ≈ 316 px) — dito em
  massa porque é o número do HUD, e é a primeira chave parametrizável pelo painel. ⚠️ Pegar ímã acima do
  teto CONSUMIA o grão e não dava nada (evento emitido, som tocado, efeito nenhum): agora vira comida.
  ⚠️ E `Room.js` escrevia `ps.missiles=BR.START_AMMO` num campo que não existe desde que a munição virou
  `ps.ammo[]` por arma — **ninguém largava o Battle Royale com a bala inicial**.
- **A MIRA FICA TRAVADA 3 s depois de soltar** (`MISSILE.AIM_HOLD_TICKS`, `ps.aimLock*`): mirar CUSTA
  movimento (o alvo é escolhido pelo cursor), então acertar a mira e ter que refazê-la inteira para mandar
  o segundo míssil no MESMO planeta era pagar duas vezes pelo mesmo trabalho. O alvo NÃO viaja no fio (o
  INPUT são 10 bytes fixos), então a trava mora no `PlayerState` e o cliente redesenha o anel pela mesma
  conta — os dois chegam ao mesmo alvo sozinhos, sem protocolo novo. A interceptação de um teleguiado
  entrante continua ganhando dela: defesa vem antes de escolha ofensiva.
- **Powerups: ÍCONE COM O NÚMERO, não chip com rótulo** (`#hud-pw`, `Hud.jsx`): eram pílulas com o nome por
  extenso ("🧲 Ímã 6s"), e em partida ninguém lê palavra — some no ruído e a lista cresce de largura
  empurrando o chat. Hoje cada um é um DISCO de 44 px com o número num badge por cima. Três formas, uma
  gramática: TEMPO tem anel que esvazia (o `Ring` que o push-to-talk já usava, agora genérico), CARGA tem só
  o número (a auto-defesa não tem relógio), e o ESCUDO mostra o nível. ⚠️ O disco é redondo e o fundo é
  NEUTRO: na primeira versão o quadrado tinha o fundo na cor do powerup e o anel na MESMA cor — o anel
  existia, girava certo e era invisível. A cor identifica no anel e no aro, nunca no fundo atrás dele.
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
- **Preferências e controles** (`client/src/state/app.js` → `ui/prefsTable.js` → whitelist em
  `server/src/api/me.js`; chave nova precisa dos TRÊS, fora da whitelist o servidor descarta em silêncio):
  ⚠️ `holdEject` e `rightSplit` passaram um tempo **dentro de um comentário `//`** no `PREF_DEFAULTS` — como
  `PREF_KEYS = Object.keys(...)`, as chaves não existiam, `normalizePrefs` descartava o que o servidor
  devolvia e `setPref` recusava a escrita: os dois toggles da aba Controles eram botões mortos. O
  **joystick virtual agora nasce LIGADO** (o `game/index.js` só o arma com `(pointer: coarse)`, então no
  mouse continua letra morta) e as teclas de **dividir e ejetar são configuráveis** (`keySplit`/`keyEject`,
  `KeyboardEvent.code` da lista compartilhada `ACTION_KEYS` — o `code` é a POSIÇÃO física, então vale em
  ABNT, QWERTY e AZERTY). O `MAP` do `input/Keyboard.js` deixou de ser constante de módulo e é montado por
  instância, com desempate quando as duas caem na mesma tecla. ⚠️ As legendas que o HUD desenha em
  `#hud-cd` e a dica da tela inicial saem de `keysOf(prefs)`: legenda que mente é pior que legenda nenhuma.
- **Ícone da barra de navegação** (`ui/bits.jsx` + `navIconArt.js`): existiam DOIS sistemas de ícone e só um
  tinha sido consertado. A tela inicial usa `<NavIcon>` (SVG em `currentColor`); a barra `Nav` das telas
  internas usava um `<i class="nav-ico">` VAZIO, com o desenho vindo de `content:` emoji no CSS de cada
  tema — e os três definiam só seis chaves, faltando justo `modes`, que nasceu depois dos mockups. Daí o
  círculo colorido vazio em Opções, Loja, Ranking, Perfil e Salas. Hoje o `<i>` só carrega o círculo do tema
  e o desenho é o mesmo SVG da entrada; o emoji é suprimido em `ui.css` com especificidade acima de (0,3,0),
  que é o que a regra do tema vale.
- **Câmera de quem morreu**: no Battle Royale segue o espectador de sempre (quem te matou, ou o companheiro vivo). No **Livre ela fica
  PARADA onde o jogador morreu** (`spectateTargetFor(s,-2)`): ali não há placar nem fim de partida para acompanhar, e passear atrás da
  tela de morte desorienta. As setas ‹ › continuam funcionando nos dois modos.
- **Salvar preferências VOLTA para quem abriu** (`app.prevScreen`, escrito por `go()`): Opções é alcançável da entrada e
  da `<Nav>`, então cravar "volta para a entrada" erraria metade das vezes. Só volta no SUCESSO do `PATCH` — sair da tela
  com erro esconderia o erro e o jogador não teria como tentar de novo.
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
- **O SALTO DO BOT É ECONOMIA, não veto** (`BOT.HUNT.SPLIT_*`, a derivação inteira em `constants.js`): o bot
  quase não atacava dividindo — 12 mísseis para cada salto —, e a causa era UMA linha: `_plan` vetava o salto
  com `!shield`. Medido numa arena de Livre (24 sementes × 7200 ticks × 24 bots), esse veto barrava **73–81 %
  do tempo de caça**, porque o escudo não expira e sobe um nível a cada `SHIELD_EVOLVE_TICKS`: quem pegava um
  nunca mais dividia. E estava errado por um fator de 2 a 7 — o escudo vale ~9 % da massa na janela de 30 s
  da fusão (0,5 absorção × `1−MISSILE.HIT_SHRINK²`) contra um salto que rende até 32 % (`(rb/ra)²`, teto em
  `1/(√2·EAT.RATIO·SPLIT_MARGIN)`). Hoje é PREÇO: `ganho ≥ SPLIT_GAIN` sem escudo, `≥ SPLIT_GAIN_SHIELD` com
  ele, tudo × `SPLIT_GAIN_N` por peça já aberta. Resultado: **3,5× mais saltos, 2,5× mais abates por salto,
  míssil:salto de 12,1 para 1,9**, com massa média parada (−1 %) e o custo do cérebro CAINDO.
  ⚠️ O preço **não** escala com o nível do escudo (foi tentado, é pior — com ~0,5 míssil chegando na janela, o
  2º e o 3º nível quase nunca são usados, e cobrar por eles fecha o portão justo em quem tem tamanho para
  saltar). ⚠️ Dois defeitos mudos saíram junto: `SPLIT.MIN_R` **nunca era checado** (a flag saía, queimava
  `splitCdUntil` e não nascia peça) e `c.n<MAX_PIECES` era o guarda errado, porque `applySplit` DOBRA as peças
  elegíveis. ⚠️ E a leitura de escudo virou UMA passada com TRÊS respostas, porque as regras são diferentes:
  `applyFire` cobra um nível da PRIMEIRA peça viva, `applySplit` derruba o escudo INTEIRO de cada peça com
  `r ≥ SPLIT.MIN_R`. ⚠️ **Testado e descartado** (medido, os dois PIORAM): segurar o ponteiro na presa durante
  os `BOT.JUMP_TICKS` do arremesso — `_approach` JÁ devolve a antecipação dentro do alcance do salto — e só
  apertar com a mira dentro de `SPLIT_CONE`, que raramente fecha antes de o `_plan` seguinte desarmar o
  desejo. As duas constantes ficam dormentes, como `BLACKHOLE.COUNT`.
- **O bot só paga escudo por ESCOLHA** (o tiro, em `bot.js`): ele destruía o próprio escudo **92× no gatilho
  para cada 1× no salto** — `applyFire` cobra um nível por puxão quando o tiro não é interceptação, e havia
  dois furos: o modo `flee` era o único ISENTO da guarda de escudo (tiro cego para trás, blindagem queimada) e
  o `intercept` atirava a cada 30 ticks sem reconferir se ainda havia entrante DESCOBERTO — depois do primeiro
  interceptador o tiro virava ofensivo. Os dois passaram a exigir o MESMO predicado que dá o desconto em
  `applyFire` (`incomingMissile(...,livres)`), e o tiro de descarte do modo `food` passou a exigir alguém
  dentro de `BOT.MISSILE_MIN_D`. Níveis de escudo queimados no gatilho: **241 → 0**; os mísseis caíram pela
  metade sem tocar em `FIRE_CD`, e nenhum tiro removido tinha alvo escolhido.
- **O bot enxerga PEÇA, não só jogador** (`_pecas`/`_alvo` em `bot.js`): `centroid()` reduzia cada inimigo à
  MAIOR peça, então um gigante partido era só ameaça e os pedaços comíveis eram invisíveis. Uma passada por
  `o.pieces` dá as duas coisas que o centróide não dá: o **GUARDA** (a peça mais próxima que me engole — de
  quem se foge, já que o centro de um sujeito espalhado é espaço VAZIO, medido em 15 % dos encontros) e o
  **BOCADO** (a maior peça que eu engulo depois do salto). O bocado vira presa quando está a mais de
  `HUNT.BITE_CLEAR` do guarda, com nota × `BITE_PENALTY` — é presa de segunda, colada a quem me come.
  `_alvo` devolve a PEÇA na mesma forma do `centroid`, então `_approach`, `_lead`, `_bestWeapon` e o predicado
  do salto não sabem a diferença, e `this.target` continua sendo o SLOT (é o que `Room._estado`/`_humor` leem
  para o prompt da LLM). ⚠️ Buffers DEDICADOS (`this._o`, `this._t`): `_thirdParty` e `_approach` escrevem em
  `TMP` por dentro, e a presa virtual ali seria aliasing silencioso. ⚠️ `press` continua saindo do CENTRÓIDE —
  ele é contrato (`Room.js` lê `press>1.5`, a fala lê `>1.2`), e medi-lo pela peça o infla.
  ⚠️ Numa sala só de bots o bocado aparece em ~1 % do tempo de caça (bot dividido é raro), então quem prova
  isso são as CENAS SINTÉTICAS de `bot.test.js` — mundo pelado, peças plantadas à mão, com controle negativo.
  A arena de lá também passou a rodar o **Livre** (`{zone:false,weapons:false,respawn:true}`): ela nasceu
  Battle Royale e o modo citado no pedido nunca era medido.
- **Tela de morte: MAPA e TEMPO REAL** — duas vistas da mesma fonte (o placar traz TODOS os vivos com
  posição, a 2 Hz, fora da AOI). MAPA é o radar ampliado, um instrumento para escolher quem assistir;
  TEMPO REAL ocupa o espaço todo, o blip vira o planeta na COR DA SKIN com nome e massa, e a posição é
  interpolada entre as amostras — sem isso cada blip anda aos saltos meia vez por segundo. A interpolação
  mora em `WorldView.lbRows(suave)` e melhora o radar pequeno de brinde, sem um byte novo de rede.
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
  ⚠️ **O bot LEVA TEMPO PARA DIGITAR** (`BOT_LLM.DIGITA_CPS`, `Room._digitaTick`). A linha do modelo saía
  INTEIRA no instante em que ele terminava, então uma frase de 45 letras chegava tão rápido quanto um
  "kkkk" — que é o jeito mais barato de denunciar que ali não tem gente. Agora ela espera `len/CPS` antes
  de aparecer, agendada no MESMO relógio de tick do resto (nada de `setTimeout`: não é determinístico, não
  é testável com o rng da sala e não revalida nada). Isto é DEPOIS da geração, então fica FORA do
  `CORO_WAIT_MS` — somá-los faria toda menção virar `stale` e o bot ficar MUDO, o oposto do pedido. E
  `ditas` é escrito no DISPARO, não na publicação: é ele que impede a repetição ao SORTEAR a próxima.
  ⚠️ **A persona `narrador` SAIU** (`rooms/botPersonas.js`). Ela dizia literalmente `'you talk about
  yourself in the third person, like a sports commentator'` — e era a causa dos bots escrevendo "Manu
  ignora o lixo Lula e foca no combo58". O SYSTEM manda `'You are typing, not narrating'`, e a persona,
  por ser específica e vir depois, ganhava: as duas se contradiziam e uma tinha que sair. Saiu a que fazia
  o bot parecer um bot. `sanitiza` também passou a cortar o próprio nome quando vem como prefixo de turno
  ("Manu: cala a boca" → "cala a boca"), porque o histórico vai para o prompt no formato `Nome: texto`.
  **A LLM sabe o que o bot está VIVENDO**: `estadoLinha` lê `gp.brain` (mode/target/press/zu — que o `_think`
  já preenchia e ninguém lia, custo zero) e `agressorLinha` lê `gp.mem`, um anel de 6 carimbado em
  `Sim._consume` nos eventos que já traziam `bySlot`. Quando o agressor É de quem ele foge, as duas viram UMA
  oração ("you are running away from Evandro and he keeps shooting you") — é dela que sai o "me deixa em paz,
  evandro!", e duas frases dizendo quase o mesmo gastam token e diluem a mais forte do prompt. Cada bot tem
  uma HISTÓRIA (`rooms/botPersonas.js`, **server-only**: `shared/bot.js` vai para o bundle do `?local=1`).
  ⚠️ O palavreado é limitado na PENEIRA (`OFENSA` em `botChat.js`), não só no SYSTEM: medindo na bancada
  (`scripts/llm-bench.mjs`), o modelo obedecia na maioria das vezes e escapava numa a cada dez — e "na maioria
  das vezes" não serve para o que aparece na tela de uma sala de 50.
  ⚠️ **O bot agora sabe onde está.** O prompt levava a vida dele e ignorava a sala: `c.modo` era montado em
  `_ctxFala` e NUNCA lido, o placar virava só um ordinal ("mid-table"), a zona virava um booleano e o kill
  feed não chegava — ele comentava a própria vida numa sala que, para ele, não tinha mais ninguém nem
  relógio. Entraram `partidaLinha` (quantos restam, o quanto ele é menor que o líder, quantos segundos para o
  gás fechar) e `feedLinha` (as últimas mortes, em texto). Nada disso custa consulta nova: `leaderboard()` é
  cacheado por tick, `zoneNextIn` é aritmética, e o feed vem de um anel escrito no difusor, onde os slots
  viram nome de graça. O atraso proposital da resposta caiu (`CORO_D0_MS` [300,900] → [150,500]): esperar
  mais de um segundo pela primeira letra não parece gente digitando, parece fila — e abaixo de ~150 ms
  também não, aí é rápido demais para quem teria que ler e escrever.
  Responder a quem CHAMA tem orçamento próprio, bem mais folgado (ser chamado pelo nome e ficar mudo é o que não passa por gente), e a
  menção é aproximada (`citou`: raiz do nick, sufixo de diminutivo, apelido cortado, 1–2 letras de erro). O pecado grave é o FALSO
  positivo — responder a quem não chamou É poluir o chat —, então há lista de palavras comuns e uma VARREDURA em
  `server/test/botchat.test.js` medindo a taxa contra os nomes e frases reais. O idioma é DETECTADO no servidor (`detectaIdioma`) e
  nomeado no prompt: dizer "responda no idioma da mensagem" acertava quase sempre, e "quase" devolvia português para quem escreveu em
  espanhol. Carregar o modelo custa ~27 s e responder ~0,5 s — daí `keep_alive`, `warmup()` no boot e o disjuntor REAQUECER enquanto
  está aberto.
- **IDIOMA** (`client/src/i18n/`, pref `lang`): pt-BR, inglês e espanhol; `auto` lê `navigator.languages`.
  ⚠️ **BASE e FALLBACK são coisas diferentes**, e juntá-las num `DEFAULT_LANG` só escondia a diferença:
  `BASE_LANG` (pt-BR) é o dicionário carregado ESTATICAMENTE — o chão de toda chave que faltar numa
  tradução e a única lista de países escrita à mão —, enquanto `FALLBACK_LANG` (**inglês**) é o idioma de
  quem chega com um navegador que não falamos. Um alemão entende inglês muito mais provavelmente que
  português, e num .io o público é o mundo. Quem fala português continua caindo no português: o
  casamento por raiz ("pt-PT" → "pt-BR") acontece antes da desistência, e a lista INTEIRA do navegador é
  varrida — o brasileiro morando na Alemanha tem `["de","pt-BR"]` e cai no português na segunda volta.
  ⚠️ O teste do `setLang` não pode cravar "en" para valor inválido: **o Node 22 tem `navigator.language`
  próprio** (o locale da máquina), então o esperado sai do próprio `resolveLang("auto")` — quem prova o
  fallback é a tabela com as tags passadas na mão.
  O motor é o GÊMEO do de tema — `resolveLang` é pura como `resolveThemeId`, `setLang` aplica e avisa por
  `warspace:lang` como `applyTheme` faz com `warspace:theme` —, e os dois eixos se encontram num lugar só:
  `useLabels()`, que assina os DOIS eventos. Por isso trocar o idioma nas Opções retraduz a tela inteira sem
  reload e sem um `useEffect` nos 24 componentes. ⚠️ O snapshot tem que ser REFERÊNCIA ESTÁVEL (`getLabels`
  memoiza por (idioma, tema)), senão o React 19 entra em laço de render.
  ⚠️ O pt-BR é ESTÁTICO e os outros vêm por `import()` (~19 KB de chunk cada, 8 KB comprimidos), no mesmo
  padrão de `/admin` e `?sfx`. `bootLang()` roda ANTES do primeiro render lendo `localStorage.warspace_lang`
  — porque as prefs só chegam com o `GET /api/me` e sem esse atalho todo estrangeiro veria a tela em
  português por 200 ms — mas **com teto de 600 ms**: se o chunk demorar, a tela sobe em pt-BR e o evento a
  retraduz quando chegar. Tela branca é pior que flash.
  ⚠️ **O texto do TEMA e o da tela de Opções mudaram de casa**: os três `theme/*/index.js` repetiam as mesmas
  11 chaves (só `tagline` e `deadSub` divergiam) e `prefsTable.js` tinha 55 strings cravadas — nos dois casos
  era impossível traduzir sem carregar 3 idiomas em cada arquivo. Hoje são os grupos `themes` e `opt` do
  dicionário; `prefsTable.js` guarda só chaves e tipos, e o rótulo de cada opção segue a convenção
  `opt[chave_valor]`. ⚠️ Grupo novo NÃO pode ter o nome de uma chave que já existe: `prefs` era o rótulo
  "Opções" do menu, virou objeto e o React morreu com "Objects are not valid as a React child". O teste
  "nenhuma chave de topo vira grupo por acidente" existe por causa disso.
  ⚠️ **O ERRO DO SERVIDOR agora é traduzido pelo CÓDIGO** (`i18n/errors.js`), e o `message` pt-BR virou o
  último paraquedas — era o contrário (`toast(e.message)` em 18 pontos), e bastava algo dar errado para a
  tela ficar bilíngue. Não foi preciso tocar nos 18: o `ApiError` já carregava o código, então a tradução
  entra no CONSTRUTOR. Isso obrigou a quebrar códigos que o servidor reusava com sentidos diferentes —
  `ROOM` valia por cinco coisas, e "você foi banido" viraria "não deu para entrar" (ver docs/spec/protocol.md).
  O `ctx` de `errText` desempata o resto (`not_found` é sala, equipe OU conta).
  ⚠️ **O catálogo de `shared/` não sabe que existe idioma**: `skins.js` e `achievements.js` seguem sendo a
  fonte pt-BR (é ela que alimenta o `seedSkins` do banco e o payload do servidor), e a tradução é uma camada
  em cima (`i18n/catalog.js`). No pt-BR o grupo `skins` é DERIVADO do catálogo em uma linha — repetir 238
  textos criaria uma segunda verdade que diverge na primeira skin nova. As descrições de conquista viraram
  moldes `{n}`, e a CONTA que produz o número (segundos→minutos) ficou em `descArg`, no shared. Um teste-ouro
  compara `achDesc(pt-BR)` com o gerador de lá para as duas verdades não se separarem.
  ⚠️ **Os 255 países saem de `Intl.DisplayNames`**, com a lista versionada de `countries.js` como chão: são
  510 traduções à mão que o navegador já tem. A ORDEM alfabética muda com o idioma, então o `<select>` do
  Perfil reordena pelo nome exibido.
  ⚠️ `format.js` segue o locale ativo (o id do idioma JÁ é uma tag BCP-47, sem tabela de conversão) e o
  ORDINAL virou `Intl.PluralRules` com `type:"ordinal"` — "1º" só existe em português, em inglês são quatro
  formas. Foi ele que aposentou o array `places` do pódio, e com isso o dicionário ficou sem nenhum array.
  Quem impede a tradução de apodrecer é `client/test/i18n.test.js`: paridade exata de chaves, moldes `{n}`
  que precisam sobreviver, o ouro dos temas e o do catálogo.
- **A PORTA DE ENTRADA NÃO ANUNCIA SALA VAZIA** (`ui/Entry.jsx`): a lista de SALAS ATIVAS saiu da tela
  inicial. Num jogo que está começando ela só sabia dizer duas coisas, e as duas afastam quem chega:
  "nenhuma sala ativa" — ninguém está jogando — e, quando havia sala, `{n} bots`, ou seja, que os
  adversários não são gente. O segundo cartão ficou com o TOP 5 do dia, que é o oposto: mostra que
  alguém jogou e quanto fez. A tela de **Salas** continua com a lista inteira, para quem for procurá-la.
  ⚠️ O `loadRooms` saiu do `useInterval` da entrada junto com a lista — pedir de 5 em 5 segundos uma
  lista que ninguém desenha é exatamente o defeito que a coluna escondida pelos temas já tinha. E a
  guarda anti-pisca do cartão passou de `roomsAt` para **`top5At`** (novo em `state/app.js`), senão ela
  dependeria de um pedido que não é mais feito.
- **A SALA NÃO NASCE CHEIA** (`ROOM.BOT_SEED`/`BOT_JOIN_TICKS`, `Room._chegadaBots`): ela abria com os 15
  preenchimentos no MESMO tick, e quinze planetas surgindo juntos no instante em que você entra é a coisa
  mais fácil de notar num .io. Agora a porta abre com `BOT_SEED` (6) e um novo entra a cada 6–14 s
  sorteados, até o alvo — a sala leva ~2 min para encher, que é o tempo que uma sala de verdade levaria.
  ⚠️ Sala VAZIA seria pior que sala com bot (não há o que perseguir nem de quem fugir), e por isso existe
  a semente. ⚠️ Só vale no **Livre**: no Battle Royale quem preenche é o LOBBY, com a curva própria dele
  (`BR.FILL_EXP`), e lá `botCount` é 0 justamente porque o preenchimento não passa por aqui. ⚠️ No Livre o
  bot RENASCE ao morrer (`mode.respawnBots`), então a população não cai e a chegada se esgota sozinha
  depois que a sala enche — não é um relógio que fica acordando para sempre. Quem prova é
  `server/test/roombots.test.js`, que também trava o "para no alvo e não passa dele".
- **...E NÃO NASCE TODA PEQUENA** (`ROOM.SEED_R`/`SEED_MIX`/`SEED_WINDOW_TICKS`, `botSpawnR`,
  `Room.topUpBots`): a outra metade do mesmo defeito. Os preenchimentos nasciam TODOS na faixa
  `PLAYER.BOT_R` ([24,58], do tamanho de quem acabou de entrar), então a sala nova continuava PARECENDO
  nova — e `docs/design/modos.md` já prometia o contrário ("entrada: direto, sala em andamento"). A
  abertura passa a ter planeta de todo tamanho: `SEED_MIX` diz QUANTOS de cada tier há na semente
  (2 gigantes de r 200–250 e 3 médios de r 80–150 dos 6; o resto é o pequeno de sempre). ⚠️ É COTA, não
  probabilidade: com sorteio independente uma sala em cada vinte sai só de bolinhas, e a sensação de
  "isto já estava rolando" não pode depender de sorte. E são NÚMEROS, não frações — fração mente aqui
  (`.25` de 6 arredonda para 2, que é 33%) e ninguém consegue pedir um gigante a menos mexendo nela.
  ⚠️ **GIGANTE SÓ NA SEMENTE**: ele é o veterano que já estava lá quando você chegou, e um planeta de
  250 de raio nascendo no minuto 3 dentro da câmera de quem já cresceu é o pop-in que o `BOT_SEED`
  existe para evitar, voltando pela porta dos fundos. Quem chega depois entra no máximo MÉDIO, com a
  chance decaindo pelo `f` — e `f` é o MENOR entre um relógio (`SEED_WINDOW_TICKS`, 2 min) e o quanto a
  sala ainda tem de vaga. Só o relógio não servia: a sala enche em ~93 s contra uma janela de 120 s,
  então o decaimento nunca chegava a zero e ele ainda ficava amarrado, em silêncio, ao env `ROOM_BOTS` e
  ao `BOT_JOIN_TICKS`. ⚠️ O bot grande NÃO ganha `score` nem `food` de presente: o score só aparece na
  tela no cartão "mais pontos" do BIG CRUNCH, e dar pontos de graça a um preenchimento tornaria mentiroso
  justamente o prêmio que o jogador tem chance real de disputar. Ele chegou grande; o que fizer daqui em
  diante é o que conta. ⚠️ O **nível** do preenchimento passou a acompanhar o tamanho (`Room._nivelBot`):
  um planeta de 62 mil de massa com "nível 3" ao lado do nick é a mesma denúncia que o nome de catálogo
  era. ⚠️ E `PLAYER.DECAY` desfaz a semente sozinha — a faixa gigante perde massa líquida e murcha para
  a casa dos 150 de raio em 10–15 min se não comer: a semente é um ESTADO INICIAL, não um regime.
  O `?local=1` usa a MESMA `botSpawnR`, decaindo pelo índice (lá os bots nascem todos no mesmo tick, e
  passar `f=1` para os 24 daria o dobro de gigantes do servidor).
- **CENÁRIO DAS TELAS DE MENU** (`ui/Scene.jsx` + o bloco `CENÁRIO` de `styles/ui.css`): fundo estrelado com
  planetas, lua e mísseis flutuando atrás do painel. Antes o fundo do menu era o CANVAS DO PIXI (o céu do
  jogo, parado) com um véu do tema por cima — a cor do menu dependia da hora sobre um céu que ninguém estava
  jogando. O `#cena` mora ENTRE o `#game` e o `#hud`, com `z-index:1`.
  ⚠️ Ele é desligado por INVERSÃO, não por lista de telas: nasce ligado e sai em `rail` (há partida VIVA
  atrás — a gaveta existe para ver a sala continuar ao lado), `game` e `dead`. Assim uma tela de menu nova o
  ganha de graça. ⚠️ O **BIG CRUNCH saiu do rail** (`App.jsx`): `conn` continua "connected" quando a rodada
  acaba, então o pódio caía na gaveta de 480 px com um mundo vazio ao lado — a sala já foi aposentada.
  ⚠️ `--screen-top` deixou de ser um número e passou a ser A ALTURA DO LOGO (`--ws-logo-h`). O mockup cravava
  `clamp(200px,28vh,260px)`, que é o RESULTADO da conta a 1920 px; em tela baixa ele joga o painel para fora
  da janela. E o `min(…,44vh)` do logo é a peça central: a ALTURA da janela limita o logo, e o logo limita o
  topo da caixa. **Celular deitado não ganha offset nenhum** — com 375 px de altura contra o
  `min-height:min(420px,100%)` da caixa, qualquer topo empurra a barra de navegação (e com ela os três
  `sticky;bottom:74px` dos temas) para fora. Lá o logo sai do cenário e a marca volta para dentro do cartão.
  ⚠️ Três fundos, um por tema, e as três `url()` moram em `ui.css` porque `theme/*/screens.css` é GERADO.
  O véu vem na MESMA declaração da arte, então fica sob os sprites e sob os cartões sem escurecer o logo.
  ⚠️ O `#s-round` virou DOIS cartões (pódio + resto do placar) e precisou desfazer a ancoragem absoluta que
  o bloco "TODA TELA NO MESMO LUGAR" dá ao `.dead-card` — um filho absoluto sai do flex, e o pódio pousava
  por cima do outro cartão. A regra que desfaz repete a cadeia daquele bloco e **tem que vir depois dele**.
  ⚠️ `scripts/responsive-check.mjs` ganhou um 5º critério ("a caixa cabe na janela") porque os quatro
  antigos NÃO pegavam isto: um ancestral `overflow:hidden` com conteúdo transbordando para baixo tem
  `scrollHeight>clientHeight`, e a sonda o classificava como "rola". Ele só acusa quando não há ancestral
  rolável — senão reprovaria a tela inicial, que é alta de propósito. **Sem crase em comentário dentro da
  sonda: ela é um template literal.**
- **A MARCA É A ARTE, o SÍMBOLO é o ícone** (`ui/Logo.jsx`, `assets/scene/logo.webp`): o wordmark 3D dourado
  substituiu o SVG por token na tela e no `og.png`. ⚠️ Ele **não vira favicon**: é um wordmark DEITADO
  (742×269) e a 32 px seria um borrão de 32×12. Quem continua virando favicon, ícone de app e prévia dos
  temas é o símbolo de `logoArt.js` — desenhado em paths justamente para caber em 16 px. Uma marca, dois usos.
- **Kill feed estilo CS** (`FEED` em constants, `server/src/rooms/feed.js`, `client/src/ui/KillFeed.jsx`): "quem matou
  quem" no FIM da coluna direita, abaixo da massa e do placar (ver "A COLUNA DIREITA"); radar e chat na ESQUERDA. Vai em **JSON de
  controle** (`{t:"feed",v:[…]}`) difundido à sala INTEIRA, sem AOI — o EVENT binário tem 13 bytes fixos com o
  `extra` já ocupado pelo score, marco de rodada não tem x/y, e difundir `EVENT.DEATH` faria o cliente
  instanciar efeito e SOM de mortes do outro lado do mapa. Só SLOTS viajam (o nome sai de `view.playerOf`), o
  que faz o feed herdar o `anonBots` do BR de graça.
  ⚠️ **Arma nenhuma mata sozinha**: `w.killPiece` só é chamado em 3 lugares de `rules.js` — `zone` (:68),
  `eaten` (:129) e `blackhole` (:445, dormente). Míssil, estrela, asteroide e supernova param no piso
  `MIN_PIECE_R` e apenas AMOLECEM. Por isso `how` (com o quê) e o matador são campos separados, e existe a
  ASSISTÊNCIA: a linha honesta é "⭐ amoleceu · Fulano devorou" — e a linha leva o VERBO ("Fulano 🍴 matou
  Beltrano"), porque só o ícone entre dois nomes obriga o leitor a adivinhar a direção.
  ⚠️ **`drenaFeed` devolvia `null` no caso NORMAL.** `let out=fila` é apelido do mesmo array, e o
  `fila.length=0` do fim esvaziava o próprio retorno: 1 a 4 linhas — o que acontece em quase todo abate —
  saíam como `null` e `Room.broadcastFeed` desistia. Só passava o lote de 5+ (supernova, fecho do gás), e
  o ramo do teto escapava por acidente porque o `.slice()` dele já era cópia. O `?local=1` copiava e não
  tinha o defeito: por isso o feed funcionava offline e sumia em produção, sem erro e sem log. Hoje é
  `fila.slice()` e há `server/test/feed.test.js` cobrindo 1..N. **Quem morreu continua vendo o feed**
  (`ui.css`, `#hud.spec`): é a informação mais óbvia de quem acabou de morrer.
  ⚠️ **O `at` da linha é carimbado na CHEGADA, com o relógio do navegador.** Ele vinha do `Date.now()` do
  SERVIDOR e era comparado com o `Date.now()` do cliente em `KillFeed.jsx`: com o relógio do pod atrasado
  mais que `FEED.TTL_MS` (9 s), toda linha nascia vencida e o feed sumia INTEIRO — sem erro, sem log e sem
  sintoma. O `at` só serve para a expiração por idade, então misturar dois relógios nunca fez sentido. Quem sabe disso é `Sim._lastHit`, um carimbo
  escrito dentro do `switch` que o `_consume` já percorre (uma escrita em Map, sem laço novo), lido em
  `_died` com TTL de `FEED.HIT_TTL_TICKS`. Para isso a física teve que passar a dizer a ARMA: `weapon` no
  BOOM/SHIELD_*, `q.hits=WEAPON.CLUSTER` no `clusterSplit` (o filho do cacho tem `hue` de míssil simples DE
  PROPÓSITO, senão se abriria de novo) e o evento `NOVA_HIT`, que não existia — sem ele a arma mais cara do
  jogo era a única sem crédito no feed (a Nova saiu do sorteio depois; o crédito continua lá, dormente com ela).
- **Conquistas em FAMÍLIAS de 4 níveis** (`shared/src/achievements.js`, migração 0007): eram 19 medalhas soltas de meta
  única — quem cumpria "Sobreviva 5 minutos" no primeiro dia nunca mais tinha o que perseguir ali, e dois pares
  (`survive5`/`survive10`, `mass5000`/`mass10000`) já eram níveis da mesma coisa com nomes diferentes: a estrutura
  existia, sem se assumir. Agora são 13 famílias × até 4 tiers (Bronze·Prata·Ouro·Diamante, 100/250/600/1500 moedas),
  chave `familia.tier` (`survive.b` … `survive.d`). `ACHIEVEMENTS` continua sendo uma lista PLANA — a UI, o servidor e a
  loja iteram sobre ela e não sabem que é gerada —, e `unlockedAchievements` virou um laço sobre `FAMILIES × TIERS`: a
  cascata de `if`s escritos à mão era o lugar exato onde uma conquista nova era esquecida. `per:"match"` lê o resumo da
  partida (recordes de uma vida), `per:"stats"` lê o acumulado. **A migração 0007 esvazia `user_achievements`** (decisão
  de projeto: recomeçar do zero) — as moedas já pagas ficam, porque vivem no `coin_ledger`, e as skins já concedidas
  ficam, porque vivem em `user_skins`; o que volta ao zero é só o carimbo. ⚠️ As 12 skins `earned` apontam para as
  chaves NOVAS (`unlockKey`), e três contadores nasceram em `user_stats` (`br_wins`, `br_top10`, `br_team_wins`), com
  backfill a partir de `matches`. O piso `players>=10` do Battle Royale está em TRÊS lugares que precisam concordar sem
  se chamarem (`achievements.js`, `brCounters` em `repos/matches.js` e o backfill da migração): vencer com 3 na sala não
  é vencer com 50. `explore` é família de tier ÚNICO — 4 quadrantes é o mapa inteiro, não escala, e forçar quatro níveis
  seria inventar meta que ninguém persegue. No Perfil cada família é UMA linha com os quatro selos: o conquistado aceso
  na cor do metal, o próximo com a barra e o número, os demais apagados. ⚠️ `newAchievements` lê `stats` dos DOIS jeitos
  (`brWins ?? br_wins`): a linha crua do `upsertStats` vem em snake_case do Postgres e o `statsToPublic` devolve
  camelCase — ler só um faz a família inteira contar ZERO em silêncio.
- **O cartão de fim de partida** (`client/src/ui/LevelUp.jsx`, `app.levelUp`): subir de nível e destravar conquista são
  as duas coisas que o jogador não vai ver de novo, e as duas passavam batidas. O nível saía num `toast` de 3,2 s — a
  mesma fila de UM item que "Preferências salvas" usa, então qualquer outra mensagem o derrubava — e a conquista não
  saía em lugar NENHUM: nem em `Dead.jsx`, nem no pódio; só aparecia no Perfil, se o jogador fosse lá procurar.
  `r.xp.gained` chegava do servidor e era jogado fora. Agora as duas viram um cartão só, com o nível grande, o XP e as
  medalhas da partida. ⚠️ **Não existe level-up em tempo real**: o XP é creditado no fim da partida, dentro da transação
  de `finishMatch` (`persist/hooks.js`), então o cartão aparece quando o `{t:"rewards"}` chega — que é o instante em que
  o nível de fato subiu. Sons próprios (`levelUp`, `achievement`), e o `achievement` é irmão menor de propósito: uma
  partida pode render quatro medalhas, e quatro fanfarras seguidas viram barulho.
- **Economia: o teto era SALÁRIO** (`SCORE_COINS`/`PLACE_COINS` em constants, `TIERS` em achievements):
  medido em produção numa conta de 17 partidas, 692 moedas por partida contra um teto de 750 — todo mundo
  batia o teto sempre, e a diferença entre jogar bem e jogar mal desaparecia. Com `score/300` isso é
  aritmética: uma partida decente passa de 150 mil pontos, o que já dá 500 sozinho, e os abates viravam
  enfeite. O divisor foi para 1200, o teto para 200 e o abate deixou de valer dobrado; a colocação do BR
  acompanhou (250→120 no 1º), senão o BR viraria a fonte fácil que o Livre deixou de ser. As conquistas
  caíram pela metade (50/125/300/750): elas pagam uma vez na vida, mas as 53 juntas somavam 30 500 moedas.
  Hoje a curva discrimina — 17 numa partida fraca, ~97 numa média, 200 só na excepcional. ⚠️ Os testes de
  `persist.test.js` derivam os valores da FÓRMULA, nunca de constantes copiadas.
- **O ranking mostra o NOME DA CONTA e perdeu o filtro de métrica** (`ui/Rank.jsx`, `repos/ranking.js`):
  o segmento de seis botões (Nível/Pontos/Massa/Abates/Partículas/K/D) reordenava a MESMA tabela — que já
  mostra os cinco números em colunas, lado a lado —, então trocar a ordenação não mostrava nada de novo:
  mostrava a mesma coisa de outro jeito, e três fileiras de botões empilhadas comiam metade da caixa. A
  ordenação ficou no NÍVEL, que é o número que resume uma conta. E o nome exibido passou a ser
  `users.display_name` (o que veio do Google, guardado na migração 0008): o nick o jogador troca a cada
  entrada, e `auth/google.js` SEMPRE extraiu esse nome — ele só era usado para derivar um nick e jogado
  fora. ⚠️ De quebra, `repos/ranking.js` não mandava `level` e a coluna "Nível" saía VAZIA para todo mundo;
  agora é derivada de `levelFromXp` (nível nunca é guardado — seria uma segunda verdade).
- **O ranking é só de CONTA** (`repos/ranking.js`, `CONTA()`): ele sempre somou por `user_id`, então trocar
  de nick nunca fez ninguém perder posição — o que faltava era o contrário. O convidado escolhe um nick novo
  a cada entrada e pode ter quantos quiser; um pódio construído sobre isso não diz de QUEM é a marca. O
  filtro é `kind='registered'` e não `email IS NOT NULL` porque o que separa é ter conta que DURA, e um
  claim só com senha dura igual (o argumento antigo — "é ele que trava o nick" — morreu com a 0009: o nick
  é livre e quem é único agora é o `login`; duas contas podem aparecer com o mesmo nick no pódio, e quem as
  distingue é a coluna do nome da conta). ⚠️ É filtro de
  EXIBIÇÃO: `user_stats` continua somando por `user_id`, e o histórico inteiro aparece no dia em que a conta
  existir. A tela diz isso ao convidado (`LB.rankGuest`), senão "sem posição" parece defeito.
- **MUDO** (`prefs.muted`, tecla **M**, chip `#h-mute` no HUD): interruptor de urgência, separado de
  `sound`/`music`/`ambience`, que são gosto. Zera o MASTER — leva junto a voz dos outros, que tem barramento
  próprio — sem apagar nenhuma das outras escolhas. ⚠️ A tecla ignora `<input>`: o chat é um campo dentro do
  HUD e escrever "amanha" mutaria o jogo no meio da palavra.
- **A borda do mundo é desenhada em PIXELS DE TELA** (`renderer/layers/Grid.js`): ela vive em coordenadas de
  MUNDO dentro do container que leva `world.scale.set(cam.scale)` todo frame, e a câmera NUNCA para (a
  suavização de `Camera.js` persegue o alvo sem chegar nele). Uma linha de 6 px de mundo com um planeta
  grande vira ~1,8 px, e o tracejado de 40/26 px vira 12/8 px — tudo reamostrado num subpixel diferente a
  cada quadro. Isso é a cintilação. Dividindo largura e traço pelo zoom (com `REF=.5`, que é o zoom em que
  os números do tema foram escolhidos), a borda tem a mesma medida em tela em qualquer afastamento. O
  redesenho é por PATAMAR (`REBAKE_K`, 4 %), não por frame: `dashPolyline` percorre o perímetro inteiro.
- **Fogos sem o círculo branco** (`theme/util.js:fireworkPrims`): o clarão era uma estrela branca MAIS um
  anel que crescia até 3·R0 — um aro perfeito, de espessura constante, expandindo por cima do estouro. Nada
  em fogo de artifício tem essa forma: ela é onda de choque de desenho animado, e chamava mais atenção que as
  faíscas. Hoje o clarão é miolo denso + coroa curta de raios, os dois presos ao centro. Ganhou também a
  **segunda florada** (um terço das faíscas estoura de novo no meio do voo, em V — é o "pistil" das peças de
  verdade, e é o que dá duas camadas de profundidade) e a **chuva** final, que antes era um apagão seco.
  ⚠️ E o planeta do campeão PARA no fim da rodada (`enviarInput` com `roundOver`): parar de mandar input não
  resolveria — sem alvo novo o servidor segue movendo a peça na direção velha para sempre —, o que para é
  mandar o alvo em cima de onde ela já está.
- **Progressão** (`shared/src/levels.js`, migrações 0004–0006): XP por partida (`matchXp`, função pura no
  molde de `achievements.js`) e nível DERIVADO do XP (`levelFromXp`) — nunca guardado, senão vira uma segunda
  verdade que envelhece na primeira mudança de curva. Curva `85·(L−1)^2.12`: nível 2 na primeira vida, 10 em
  ~9 h, 30 em ~109 h, 50 em ~330 h. `xp`/`deaths` vivem em `user_stats` (e não em `users`, que é lido com
  `SELECT *` em todo join de WS); o nível chega ao jogo por um `u8 level` no PLAYERS (**PROTOCOL_VERSION 11**)
  e acende o badge no placar, no chat e no feed de uma vez. K/D **não** é coluna: é expressão
  `kills/GREATEST(deaths,1)` com piso de qualificação (`KD_MIN_KILLS`/`KD_MIN_GAMES`) — materializar um
  derivado é criar um número que mente. Ranking global e por PAÍS (`users.country`); ⚠️ o país entra na CHAVE
  do cache de 10 s de `api/ranking.js`, senão a primeira resposta regional é servida ao mundo inteiro.
- **Entrar com Google** (`auth/google.js` · `api/auth.js` · `client/src/api/google.js` + `ui/GoogleButton.jsx`):
  **LIGADO** — o clientId está no ConfigMap `warspace-config` e no `.env`. É o fluxo do Google Identity
  Services: o cliente manda o `id_token` e o servidor o VALIDA contra o `tokeninfo` (`aud`/`iss`/`exp`/
  `email_verified`). **Não há troca de *code*, então o `client_secret` não existe deste lado** e não entra
  em Secret nenhum — o client_id é público por definição, vai no HTML. `googleClientId` vazio em
  `/api/config` continua sendo o ÚNICO interruptor: sem ele a rota é 503, o botão não renderiza e o SDK do
  Google **nem é baixado** (a carga é sob demanda, em `api/google.js` — script de terceiro em toda carga da
  página, para um botão que a maioria não usa, é custo de graça). Quatro caminhos, nesta ordem: identidade
  `(provider,subject)` conhecida · **e-mail verificado que já é de uma conta → a identidade vai para AQUELA
  conta** · Bearer de guest → promove o guest · senão conta nova. Os dois do meio existem porque a rota,
  ligada, tinha dois becos: o `INSERT` esbarrava em `users_email_uq` e virava **500**, e `normalizeNick`
  RECUSA acima de 16 caracteres em vez de cortar, então um nome como "Alexandre Fernandes Silva" derrubava
  a entrada inteira com 400 — agora o nome do Google é cortado e ganha sufixo se colidir, e só um `nick`
  explícito no corpo continua estrito. ⚠️ Casar por e-mail CONFIA no e-mail de `users`, e o que entra por
  `/api/auth/claim` **nunca foi verificado por nós**: o conserto de raiz é verificar o e-mail no claim.
  ⚠️ `server/test/game.test.js` lê o `.env` da raiz e trava `/api/config` com `deepEqual`, então ele fixa
  `GOOGLE_CLIENT_ID=''` no topo — sem isso o `.env` preenchido quebra o teste pelo AMBIENTE.
- **Placar da SALA** (`Room.roster`): a rodada do Livre caiu para **30 min** (`ROUND.TICKS` 108000, `DAYS` 2 —
  o dia do espaço continua com 15 min; ⚠️ quem manda em produção é o env `ROUND_TICKS`, e `roundInfo()` passou
  a mandar `days` porque cliente novo com env velho desenhava o céu na metade da velocidade). No fim vêm
  QUATRO destaques (mais pontos · mais partículas · mais abates · maior K/D, este último com piso de
  `ROUND.AWARD_MIN_KILLS`). O roster existe porque `Sim.endRound` itera `sim.players`, onde só está quem
  ficou: `Room.leave` remove do mundo, e no Livre **morrer e renascer é `leave` + `join` num slot NOVO**.
  Chave estável: `u<userId>` → `r<resumeToken>` → `n<nick>` → `b<slot>`; **nunca `sessionId`**, que é por VIDA
  e agruparia errado justamente no respawn. `_rosterFold` é idempotente por vida (`gp.rosterFolded`) e ACUMULA.
- **O CAMPEÃO É UMA FAIXA, E QUEM MAIS PONTUOU GANHOU O CARTÃO DELE** (`Room._mergeBoard` → `destaques
  .pontuador`, `.champ-banner` em `ui/Round.jsx` + `styles/ui.css`): o campeão é quem tem a MAIOR MASSA no
  instante do BIG CRUNCH — `vivos.sort` por massa e `board[0]`, o que sempre foi —, mas ele aparecia três
  vezes na mesma tela (degrau maior do pódio, um dos quatro cartões de destaque e, no Battle Royale, o
  subtítulo) e em nenhuma delas em tamanho de campeão. Agora é uma FAIXA logo abaixo do título, e o cartão
  que ela liberou virou **mais pontos** — o `score` viajava no `roundEnd` em toda linha do board desde
  sempre e NENHUM componente do cliente o lia. Ele é o único destaque que não mede tamanho nem violência
  (sobe com cada grão, cada fragmento e cada planeta comido), e por isso é o que um humano tem chance real
  de disputar contra 15 preenchimentos que passaram 30 min acumulando. ⚠️ A faixa sai de `r.champion`, e
  não de `d.campeao`: o `?local=1` não manda `destaques`, e no fim por morte simultânea é o `champion` que
  carrega o fallback do `lastAlive`. ⚠️ E ela NÃO aparece no Battle Royale, onde o subtítulo já diz quem (ou
  qual equipe) venceu — numa vitória de equipe a faixa mostraria um nome só, contradizendo a linha de cima.
  ⚠️ A chave `LB.champion` ("CAMPEÃO DA SALA") existia no dicionário e não era usada por ninguém; quem saiu
  foi `awards.champion`. O payload de demonstração de `actions.js` (`mostrarTela("round")`) ganhou
  `destaques` para a sonda de `scripts/responsive-check.mjs` medir a faixa e a fileira — sem eles o
  `.awards` nem existe no DOM e as 432 combinações passavam por cima de metade da tela.
- **Loja: a confirmação onde o clique aconteceu** (`ui/Shop.jsx`): clicar num cartão abre um MODAL com a skin grande, o
  preço e as duas saídas. O painel de detalhe ficava embaixo da grade, fora da vista de quem tinha acabado de clicar:
  selecionar e confirmar aconteciam a uma tela de distância um do outro, e ninguém descobria que ainda faltava
  confirmar. A trava original continua — clicar num cartão nunca gasta moeda, só abre a pergunta. "Adquiridas" saiu da
  barra de ferramentas e virou um chip do filtro, ao lado de "Todas": como toggle solto ele competia por espaço com a
  busca e o seletor de ordem, e era o primeiro a ser cortado quando o painel encolhia. ⚠️ Os TRÊS temas fixam
  `.shop-grid{grid-template-columns:repeat(3,1fr)}`, anulando o `auto-fill` de `base.css` — três colunas fixas respondem
  à largura da TELA, não à do painel, e na gaveta de 480 px os cartões transbordavam com barra de rolagem horizontal;
  `ui.css` devolve o `auto-fill` com especificidade maior. A skin **Retrato** ganhou selo próprio na grade (ela é a
  única que pede algo além da compra — a foto), o `AvatarPicker` mudou para DENTRO do modal e também para o Perfil, junto
  do nick e do país: trocar a foto não deveria exigir reencontrar uma skin numa grade de 94.
- **Skins novas** (75–118): 8 lendárias com `levelReq` (10–50) que são EMBLEMAS, não texturas de planeta — é o
  que as faz legíveis a 24 px; a skin **Retrato** (83), que põe a FOTO do jogador dentro do disco; e **35
  caricaturas de easter egg** (84–118, `rarity:"secret"`, escondidas da loja e recusadas pela compra),
  escolhidas pelo NICK em `shared/src/eggs.js` — casamento EXATO da raiz (`baseNick`), porque prefixo fazia
  "modinha" virar Modi. O egg é decidido em `persist/hooks.js` e `wsServer.unsaved`, vale só para AQUELA vida
  e **nunca** escreve em `users.equipped_skin_id`; `prefs.eggs:false` desliga. ⚠️ `seedSkins` tem uma faca: um
  pod com o `shared/skins.js` ANTIGO faz `UPDATE skins SET active=false` nas skins novas — os 3 shards têm que
  estar na MESMA imagem antes de qualquer skin nova ficar comprável.
- **As caricaturas são ILUSTRAÇÃO, não canvas** (`client/public/faces/*.webp`, 256², ~15 KB cada;
  `client/src/theme/faces.js`): houve aqui um rosto procedural montado com elipses e recolorido por
  personagem, e ele saiu inteiro. O motivo é medível: dez caricaturas feitas de elipses saem parecidas entre
  si e nenhuma parece com quem devia — o que identifica uma pessoa é justamente o que uma elipse não tem.
  O carregador é gêmeo de `theme/avatars.js` e pelo mesmo motivo: `paintPattern` é SÍNCRONO (roda dentro de
  `cache.get`/`warm`), então o bitmap tem que chegar decodificado em `P.face`. Enquanto não chega, desenha o
  disco liso da cor da skin — nunca `false`, que cairia no emoji fantasma e poria uma bandeira no lugar de um
  rosto. A CHAVE da textura carrega "a arte já chegou?" (`faceKey`), e é ela que faz o planeta se reassar
  sozinho quando o bitmap fica pronto: o TextureCache não tem `drop(key)`. ⚠️ A **prévia** da loja é um canvas
  pintado UMA vez, então precisa de aviso próprio (`onFaceReady`), senão a grade fica no disco liso para
  sempre. ⚠️ Raiz de egg com menos de 4 letras ou com dígito no fim NUNCA casa (`baseNick` corta o dígito,
  `MIN_ROOT`=4): `cr7`, `r9`, `mj23` e `ney` foram removidos por isso — raiz que não casa é promessa que o
  jogo não cumpre. Quem prova é a varredura de `shared/test/eggs.test.js`.
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
  Som de tela por delegação num listener só em `App.jsx`. Opções → Som: efeitos, música, **ambiência** e volume.
  **A TRILHA** (`buildMusica` em `audio/index.js`, 5º barramento `music`): peça ORIGINAL na linguagem do minimalismo
  sinfônico — órgão de tubos, ostinato de colcheias que não para, harmonia modal que gira em vez de resolver (i–VI–III–VII
  em lá eólio) e forma por ACUMULAÇÃO. Três seções escolhidas por um número só, `intensity`: menu (drone + coral, sem
  pulso), partida (entra o ostinato) e clímax (órgão cheio, sub, métrica acelerando 52→84 BPM). A intensidade sai do que
  o jogo JÁ manda para a ambiência (`game/index.js`, 5 Hz): o MAIOR entre massa, perigo e relógio da rodada — a trilha
  acompanha o que está mais quente, não a média, que deixaria o clímax morno para sempre. ⚠️ Três coisas que o motor não
  tinha: (a) um **relógio musical** — só havia `setTargetAtTime` e `start(t0)` absolutos —, daí o agendador look-ahead
  (`setInterval` de 40 ms agendando 180 ms à frente contra `ctx.currentTime`); (b) um **barramento próprio**: a trilha ia
  pelo `amb`, então dividia interruptor com a ambiência e o `duck()` do alerta de míssil abaixava os efeitos e deixava a
  música por cima, o contrário do que se quer; (c) o `build()` terminava no bloco da ambiência **sem `if`** — era o
  `else` implícito, e `startLoop("music")` teria criado uma SEGUNDA ambiência inteira, sem erro. As notas chamam `tubo()`
  direto e não `play()`: passar pelo teto de 24 vozes faria a trilha ser roubada no meio de um compasso. `stopLoop` chama
  `L.stop()` (o `setInterval` sobreviveria a toda troca de sala) e `resume()` ressuscita `music` como já ressuscitava
  `ambience`. `musicVolume` é pref nova (cliente + whitelist do servidor), no molde de `voice`/`voiceVolume`. Na mesa
  `?sfx` a trilha tem painel próprio com o eixo de intensidade e as três seções isoladas — contínuo não entra sozinho na
  lista, que é fixa. ⚠️ No menu o ostinato nem é AGENDADO: com o ganho em zero as notas continuavam a ser criadas, oito
  osciladores mudos por compasso, para sempre, na tela onde o jogo está parado.
  ⚠️ **A voz nunca tocou**: `playVoice()` usava `VOICE_HZ` e `VOICE_DUCK`, e nenhuma das duas existia — nem declarada,
  nem importada. Toda chamada lançava `ReferenceError` em silêncio. Hoje saem de `VOICE.RATE_HZ` e de uma constante ao
  lado de `DUCK`.
  **`?sfx` abre a mesa de som**: toda receita com botão, os contínuos com controle de intensidade — é por onde o pacote é aprovado de ouvido.
- **Skins (75)**: `shared/src/skins.js` guarda `pattern`/`accent` e `client/src/theme/patterns.js` desenha a textura procedural
  dentro do disco (listras, crateras, continentes, lava, gelo, galáxia, xadrez, escamas, olho…) — nada de imagem, tudo assado uma vez
  por (skin, tier). O mesmo módulo desenha o buraco negro (`paintHole`) e a estrela (`paintNova`).
- **Escudo e ímã: BORDA NEON, não anel girando** (`renderer/layers/Planets.js`): eram arcos TRACEJADOS
  girando em volta do planeta (`dashArc` + `pw.spin`) e, no nível 3, um SEGUNDO anel atrás do primeiro —
  dois círculos rodando em sentidos opostos em cima da arte da skin. Cada um era legível sozinho;
  empilhados viravam ruído, e num planetão o aro passava a impressão de ser outro corpo em órbita. Hoje é
  uma circunferência contínua colada na peça (`r+3`), com um traço largo e translúcido por fora (o vidro do
  neon) e um fio saturado por dentro (o tubo): não gira, não pisca, só respira. Quem identifica é a COR, e
  é ela que muda com o nível — `SHIELD_LV` nos três temas perdeu `rings`/`spin`/`dash` e ficou discreto.
- **O nome do planeta fica no CENTRO** (`labels.nameY:()=>0` nos três temas). Ele já foi para o rodapé, com
  uma tarja escura atrás, porque no centro caía em cima do nariz das caricaturas — e ficou pior: um planeta
  com o nome pendurado embaixo lê como legenda de foto, não como um planeta que se chama assim. O que
  resolve o rosto é a LETRA, não a posição: `nameFill` translúcido com contorno opaco deixa a arte aparecer
  por dentro dela. A tarja saiu (`bandAlpha:0`); `NAME_MIN_PX` e `nameFitK` ficaram, porque são correções
  de legibilidade independentes de onde o nome está.
- **O ponteiro do jogo é lido na JANELA, não no canvas** (`game/input/Pointer.js`): o `#hud` é
  `pointer-events:none`, mas todo elemento dele que precisa de clique tem `auto` — e passar o mouse sobre o
  chat, sobre um botão ou sobre um chip do HUD fazia o canvas parar de receber `pointermove` e o alvo do
  jogador CONGELAVA. Era isso que tornava impossível ter hover no HUD sem quebrar o controle. Na janela o
  alvo nunca congela (as coordenadas continuam do canvas, pelo `getBoundingClientRect`), e `down`/`up`
  continuam no canvas porque são cliques de JOGO. É o que destravou o balão de ajuda dos powerups.
- **Sair do jogo não deixa cenário para trás** (`idle` no `render`, `hold` da câmera): o canvas continua
  montado depois do `leave()`, e sem peças próprias a câmera entrava no ramo do lobby e PASSEAVA pelo mundo
  vazio — a borda tracejada do mundo cortando o fundo do menu na diagonal. Parada e sem a moldura da arena
  (grade e borda), o que fica atrás do menu é o CÉU, que é o fundo que a tela inicial sempre teve.
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
- Constantes só em `shared/src/constants.js`; **todo texto de UI em `client/src/i18n/<idioma>.js`** — o pt-BR é
  a base e o chão de qualquer chave que falte nos outros. Nada de string na tela fora dali (as exceções vivas
  são o painel `/admin` e as ferramentas de dev `?sfx`/`theme-preview`, fora do escopo por decisão).
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

- ✅ **O certificado Let's Encrypt saiu — e o conserto foi split-horizon no CoreDNS** (2026-08-29).
  O cert-manager faz um *self-check* do desafio HTTP-01 ANTES de chamar a ACME, e de dentro do cluster
  o IP público (`177.190.160.19:80`) dá `connection timed out` — o roteador não faz hairpin NAT. O desafio
  ficava `pending` para sempre mesmo respondendo **200 de fora**. Não era do warspace: havia 11 desafios
  presos assim desde 2026-07-30 (`j4call`, `itm`) e um desde 2024.
  O que foi feito, no ConfigMap `kube-system/coredns` (é a ÚNICA coisa do projeto fora do namespace
  `warspace`, por isso vai com backup):

  ```
      hosts {
         10.110.179.230 warspace.io www.warspace.io
         fallthrough
      }
  ```

  `10.110.179.230` é o ClusterIP do `ingress-nginx-controller`. O `fallthrough` é o que mantém todo o resto
  intacto — sem ele o bloco vira um buraco negro de DNS para o cluster inteiro. No CoreDNS **v1.8.0** daqui,
  o `plugin.cfg` já ordena `hosts` antes de `kubernetes` e de `forward`, então a posição no Corefile não
  decide nada: quem decide é o plugin existir. Aplicar com `kubectl patch --type merge` só em
  `data.Corefile` (o objeto é do `kubeadm`; um `apply --force` tomaria a posse do campo), depois
  `rollout restart deploy/coredns`. Os DOIS certificados (apex e www) fecharam em menos de um minuto.
  **Acesso ao nó:** `ssh naldo@192.168.12.50` (senha; não há chave publicada e não há `sshpass` na máquina
  de dev), `kubectl` em `/usr/bin/kubectl` e kubeconfig root-only em `/etc/kubernetes/admin.conf` — ou seja,
  tudo é `sudo kubectl --kubeconfig /etc/kubernetes/admin.conf …`. Senha nenhuma mora neste repositório.
  ⚠️ O mesmo bloco resolveria os outros domínios presos do cluster; aqui entraram só os dois do warspace.

- Sem "esqueci a senha" (reset via SQL). O merge de contas existe SÓ no caminho do Google, por duas portas: um
  guest com Bearer é promovido em vez de virar conta nova, e um e-mail verificado que já pertence a alguém leva
  a identidade para aquela conta. Nos outros caminhos continua sem.
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

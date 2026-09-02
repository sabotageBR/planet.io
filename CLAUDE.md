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
node scripts/brand-assets.mjs       # assa favicon/ícones/og/manifest + as 3 thumbnails de catálogo (brand/)
node scripts/portal-pack.mjs gd|crazy|poki|itch|y8|gm|gameflare|playgama|gamepix|all  # o .zip do cliente para os portais (docs/spec/portais.md)
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
client/src/    api/base.js (a ÚNICA fonte de "onde mora o servidor") · portal/ (flags + fachada de anúncio + 1 adaptador por portal)
               main.jsx (3 entradas: jogo · /admin · ?sfx) · app/ (App, theme bridge) · admin/ (o painel: mount/api/admin.css)
               i18n/ (index.js o motor · pt-BR|en|es.js os dicionários · errors.js código→texto · catalog.js skins/conquistas/países)
               assets/scene/ (a arte do cenário do menu: logo + 5 sprites + 3 fundos, WebP)
               ui/ (telas React + Round.jsx/RoundIntro.jsx (o fim de rodada: 3 modelos + a abertura), Modes/Party/Chat/KillFeed/Notice/AvatarPicker/Pause (o menu do Esc + o painel do dono), icons.js
               Logo.jsx + logoArt.js = a marca · NavIcons.jsx + navIconArt.js = os ícones da entrada) · util/image.js · api/client.js · state/ (store) · hooks/
               audio/ (index.js motor: 4 barramentos, prioridade de vozes, loops · kit.js receitas · mic.js push-to-talk · audition.js a mesa de som do ?sfx)
               theme/ (index.js + dawn|sunset|dusk: tokens/hud/screens.css gerados por port.js, index.js com textures/effects/hud) · styles/base.css
               game/ (index.js createGame · quality.js (a política de nível econômico, pura) · net/ · state/ · renderer/ · input/ (Pointer·Keyboard·Touch·Joystick·Wheel) · hud/ · bench.js)
docs/spec/     protocol.md · api.md · admin.md · hooks.md · server-game.md · client-game.md · portais.md      docs/design/  telas.md · theme-time.md · rodada-1.md · som.md · modos.md
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
- **O ALVO É UM SÓ, MAS A RAMPA É POR PEÇA** (`joyTarget` em `game/input/Joystick.js`, `JOY.SPREAD_K`): quem
  produz alvo tem que mirar LONGE, e o analógico era o único lugar do jogo que não fazia isso. `integratePiece`
  mede `min(d,SPEED.RAMP)/RAMP` de CADA peça até o alvo, e `World.setTarget` guarda UM ponto por jogador — com
  uma peça as duas coisas são a mesma (a peça está em cima do centróide, `d = RAMP·k`, e o curso do polegar
  vira a velocidade: analógico de verdade). Dividido, `SPLIT.DIST`=780 põe cada peça a ~390 px do centróide e
  um alvo a 32 px dele cai DENTRO do cacho: todas correm a `vmax` cheia PARA O CENTRO. Medido, o grupo andava a
  **8 % da velocidade** com o eixo do split perpendicular ao rumo e a **ZERO** com ele alinhado — as duas
  metades uma contra a outra, presas pelo `separateOwn` até a fusão (~57 s). Era o "no celular, dividido, o
  movimento fica extremamente lento", e no mouse nunca apareceu porque o cursor já mora a centenas de px (os
  bots também já sabiam: `BOT.HAND.DIST` é 620 px). Hoje `d = RAMP·k + spread·SPREAD_K` — com `spread` = 0 a
  conta colapsa em `RAMP·k` e quem não dividiu não sente nada. O preço, geometricamente inevitável com alvo
  único: dividido o analógico deixa de graduar a velocidade (dar meio curso a peças espalhadas exigiria
  `d ≤ RAMP` para TODAS ao mesmo tempo). Isso consertou de graça o split e o eject, que saíam PARA TRÁS nas
  peças da frente (`rules.js` chama `dirTo(pc.x,pc.y,ps.tx,ps.ty)`).
  ⚠️ **O recorte ao mundo é do RAIO, nunca do EIXO.** `qPos` (`protocol/quant.js`) e `World.setTarget` saturam
  eixo a eixo, e por eixo o corte TORCE a direção: medido, centróide em (9000,4800) com o polegar a 25,8° e o
  alvo a 2372 px vira **59,9°** — 34 graus de erro, o jogador empurra para a direita e anda na diagonal. Não
  aparecia antes porque o alvo nunca saía do mundo: ficava a 32 px do jogador.
  ⚠️ **Soltar o analógico com as peças dispersas as faz CONVERGIR, e é o certo**: não existe alvo único que
  pare peças espalhadas (o motor só freia dentro de `RAMP` de cada uma), e convergir é o gesto de reagrupar.
  ⚠️ Um efeito de borda que NÃO é regressão: o tiro MIRADO (segurar 160 ms) usa `ps.tx/ty` como cursor
  (`aimTarget`, `AIM_PICK`=700 px do ponto), e no dedo esse "cursor" é o alvo de MOVIMENTO — a mira da metade
  direita do analógico só move a retícula local, nunca chegou ao servidor. Dividido, ele deixa de travar no
  que está colado em mim e passa a travar à frente, na direção da marcha. Não se perde nada: o CLIQUE RÁPIDO
  é teleguiado e escolhe o inimigo mais próximo de quem atira sozinho, sem olhar o alvo — antes o mirado era
  redundante com ele, agora os dois fazem coisas diferentes. Com uma peça, `d ≤ 32` e nada disso muda.
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
  **O APELIDO DO PREENCHIMENTO PODE VIR DA LLM** (`server/src/rooms/botNames.js`): `botNick` sorteia uma
  das 373 bases de `BOT_NICKS` em quatro formatos, e o país vinha DEPOIS, derivado do nick — com coerência
  só para as 76 raízes de `US_ROOTS`, então um "Kaua73" saía com bandeira do Japão. Agora a ordem se
  inverte: sorteia-se o PAÍS e pedem-se apelidos DELE, metade nome de gente daquela língua e metade zoeira
  (`ninja_do_acai`, `cafe_com_leite`, `pibe_loco`), que é o que uma sala de verdade tem.
  ⚠️ A LLM NUNCA é consultada no nascimento de um bot: o lobby do BR pede até 50 nicks num ÚNICO tick e o
  `step()` é de todas as salas a 60 Hz. Ela enche um BALDE em segundo plano (o molde de `tunables.js`: um
  `setInterval` escreve num objeto que o laço lê síncrono) e quem nasce tira do balde. `take()` devolver
  `null` é a resposta NORMAL — e aí vale `botNick`, que continua sendo o CHÃO e a única verdade offline
  (`shared` vai para o bundle do `?local=1`, que não tem servidor com quem falar).
  ⚠️ O ponto de injeção é UM só: `Room._botNome()`, que cobre o Livre e o lobby do BR sem tocar em
  `_nasceBot`/`topUpBots`/`fillTo`. `botNick` registra em `usedNicks` por DENTRO; o caminho do balde tem
  que registrar à mão, senão saem dois preenchimentos com o mesmo nome.
  ⚠️ **DETERMINISMO**: servir do balde pula os 2–3 sorteios de `botNick` e desloca todo o stream do rng da
  sala (`botSpawnR`, `skinId`, `pickPersona`, `botCountry`). Isso é inofensivo porque **o balde só existe
  com a LLM configurada** e a suíte roda sem `OLLAMA_URL` — sem ela o caminho é byte a byte o de sempre, e
  é por isso que os testes de semente de `roombots.test.js` continuam valendo sem uma linha alterada.
  ⚠️ O **VALIDADOR** (`recusa()`) é obrigatório e todas as suas regras já existiam — como asserção de teste
  sobre as listas ESTÁTICAS, nenhuma como função que rodasse em produção. A que mais importa é
  `eggSkinFor(n)===null`: o prompt pede "nada de celebridades" e o modelo escapa uma em dez, e um
  preenchimento chamado "messi" ganharia a caricatura do Messi no `_quemE` e seria tratado como ele no chat
  — o oposto exato de passar por gente. As outras: formato 2..16, `baseNick(n).length>=2` (sem raiz o bot
  fica surdo ao próprio nome, porque `citou` compara a raiz), a lista `COMUNS` (nick que é palavra comum faz
  o bot responder a quem NÃO o chamou) e os valores que se confundem com campo vazio.
  ⚠️ `recusa()` **não apara** a string: valida o que vai ser usado. Aparando, `" pad "` passaria e o
  chamador gravaria o nick com espaços — quem apara é `parseLote`, antes de chamar.
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
  ⚠️ **UMA BANDEIRA NÃO PODE TOMAR A SALA** (`ROOM.PAIS_TETO_DIV`, `Room._paisesCheios`, `botCountry` com
  `evita`): a bandeira existe para dizer que a sala é internacional, e só diz isso se elas forem
  DIFERENTES. Duas causas somadas faziam o contrário. (a) `botCountry` sorteia cada bot numa roleta em que
  o BR pesa 46 de 100 — a mesma bandeira sair 6 ou 7 vezes em 15 não é azar, é o valor esperado. (b) O
  BALDE de apelidos era pior: o lote é de UM país só, era grande (24), único em voo e servido em LIFO, e
  então a sala INTEIRA nascia da mesma remessa — medido em produção, 7 de 7 portuguesas, sem erro e sem
  log. O conserto tem quatro peças e nenhuma sozinha basta: teto por bandeira na SALA que sobe com o
  tamanho dela (`1+⌊bots/5⌋`), lotes pequenos e SIMULTÂNEOS de países diferentes (`NICK_FILL_PAR`),
  reabastecimento por número de BANDEIRAS e não só de apelidos (`NICK_PAISES_MIN` — um balde cheio de duas
  bandeiras rende dois preenchimentos, porque a sala recusa o resto) e um `take` que RODA entre as
  bandeiras que tem. Medido depois: 6 bandeiras em 15 planetas, com o nome coerente com o país
  (`nottebionda8` 🇮🇹, `harry_wolf` 🇬🇧, `caipirinha9` 🇧🇷).
  ⚠️ Quem aplica o teto é a PRÓPRIA roleta (`botCountry` recebe as bandeiras cheias e reparte o peso delas
  entre as outras), e **não** um laço de re-sorteio: re-sortear é estatística — com o BR em 46 %, uma
  tentativa azarada em cada 500 fura o teto sem que ninguém entenda por quê (aconteceu, e o teste pegou).
  Filtrando, o teto é garantido e o consumo do rng da sala continua sendo UM sorteio por bot, que é o que
  mantém "a mesma semente dá a mesma sala".
  ⚠️ `_paisesCheios` mede o tamanho da sala pela SOMA de `paisesBot`, não por `sim.botCount()`: ele é
  chamado nos DOIS lados do nascimento (em `_botNome`, antes de o bot existir, e em `_nasceBot`, depois do
  `addBot`), e com o contador do Sim o mesmo bot media a sala com dois tamanhos e ganhava um degrau de
  teto de brinde. E `trimBots` DECREMENTA — sem isso a sala vira lista negra de países.
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
- **A FOLHA DO PAINEL É UM SISTEMA, EM CINCO CAMADAS** (`client/src/admin/admin.css`: tokens → primitivos
  → componentes → telas → responsivo; a ORDEM é o mecanismo, e por isso nada ali precisa de `!important`).
  Ela cresceu uma tela por vez, e o resultado era que cada tela tinha inventado o próprio vocabulário para
  as mesmas coisas: quatro formas de cabeçalho, quatro idiomas de badge, cinco formas de DOM para "está
  vazio", três superfícies de cartão. Isso não aparece lendo uma tela — só lendo as cinco. Os tokens de
  cor eram os únicos que existiam (havia nove cores cravadas fora deles, doze tamanhos de fonte e sete
  raios); agora há escala de espaço, raio e tipografia.
  ⚠️ **`ad-wrap` É UM NOME PROIBIDO**: um filtro cosmético de bloqueador de anúncios esconde exatamente
  essa classe (é como o mercado publicitário chama o contêiner de anúncio), e a tela INTEIRA do painel
  sumia — com o DOM montado, sem erro no console e sem nenhuma regra correspondente em
  `document.styleSheets`, porque o bloqueador injeta fora do documento. `getComputedStyle` dizia
  `display:none` e nenhuma folha da página mandava aquilo. Medido no navegador, um a um: `ad-topo`,
  `ad-lista`, `ad-tab`, `ad-form`, `ad-split`, `ad-cab` e até `ad-banner`, `ads` e `ad` passam — só
  `ad-wrap` cai. O prefixo `ad-` continua seguro; o que não pode é a palavra inteira. Hoje é `ad-centro`.
  ⚠️ Os tokens continuam declarados em `.ad,.ad-login` e **não** em `:root`: a mesma página carrega o CSS
  do jogo (`main.jsx` importa `App.jsx` e `theme.js` estaticamente), e `--bg`/`--line`/`--ok` são os
  MESMOS nomes dos tokens de tema — na raiz eles repintariam o jogo. Quem prova que não há vazamento é
  medir o painel com `data-theme` em `dawn`/`sunset`/`dusk`: 9 alvos × 11 propriedades têm que dar
  idêntico, porque o painel é o único lugar do projeto que NÃO obedece ao relógio.
  ⚠️ `--top-h` é APLICADO à barra, e é só por isso que o `top` do título de seção grudado fica certo por
  construção — antes havia um `47px` cravado que nem batia com a altura real (~55). E como a barra agora
  QUEBRA em duas linhas abaixo de 700 px (sem isso a página inteira ganhava barra horizontal, e o
  `user-scalable=no` do `index.html` impede o pinch-zoom que compensaria), a altura deixa de ser uma só:
  por isso o sticky vira `static` no mesmo ponto de quebra. Medido: 55 → 89 → 123 px.
  ⚠️ O wrapper de rolagem (`.ad-rolo`) fica EM VOLTA da tabela, nunca acima dela na árvore: `overflow` num
  ancestral mata as duas stickies (a barra e o título de seção) em silêncio. E nada de `position:sticky`
  no `th` — quem cria o contexto de rolagem é o `.ad-rolo`, que rola só na horizontal, então o cabeçalho
  grudaria num contêiner que nunca rola na vertical. Quem rola aqui é a PÁGINA.
  ⚠️ `cursor:pointer` era global à classe `.ad-tab`, então "Partidas recentes", "Sessões" e a Auditoria
  inteira — que não respondem a clique nenhum — exibiam mão e destaque de hover. Quem convida agora é o
  modificador `.click`. E `.previa.info` NÃO EXISTIA: o JSX gera `previa info`, só `.warn` tinha regra, e
  o nível informativo saía sem cor nenhuma, em silêncio.
  ⚠️ Toda classe nova leva prefixo (`ad-`/`pm-`): `base.css` já define `.card`, `.badge`, `.chip`, `.mono`,
  `.wrap`, `.tab`, `.modal`… e `.badge` lá é `position:absolute`.
- **Parâmetros de jogo em runtime** (`shared/src/tunables.js` + `admin_settings`): lista BRANCA, nada fora
  dela é gravável. Escrever custa ZERO no laço de 60 Hz porque `world.js` faz `const PW=POWERUP` — isso
  aliasa o OBJETO, e os objetos de `constants.js` não são congelados. O **banco é a verdade**; o push
  entre irmãos só pede que releiam. ⚠️ Chave `scope:'both'` responde **501**: o cliente tem a própria cópia
  do bundle, e mudar de um lado só faria `predict.js` divergir. É por PROCESSO, não por sala.
  O caso pedido é o **teto do ímã**, dito em MASSA (100 000 = √ → 316 px de raio), que é o número que o
  jogador lê no HUD.
  ⚠️ O descritor ganhou **`grupo`** e **`type`**, e a tela é montada inteira a partir dele: as seções saem
  de `GRUPOS` (a ORDEM da lista é a ordem na tela) e o controle desenhado sai do tipo. Parâmetro novo
  aparece na seção certa, com o controle certo, sem uma linha de painel — e um `grupo` errado cai em
  "Outros" em vez de sumir. `type:'opt'` é o primeiro tunable que NÃO é número (o tipo de conversa dos
  bots): ele não afrouxa a lista branca, tem uma **segunda** lista branca por dentro (as `options`), e
  `min/max/step` ficam de fora porque um `<select>` não tem faixa. ⚠️ Ele obrigou a tirar o `Number()` de
  DOIS lugares que o presumiam — `server/src/tunables.js` (o load, que reconcilia a cada 30 s) e o `PUT`
  de `api/admin.js` (que gravava o corpo cru): com qualquer um deles, o painel diria "salvo", o banco
  guardaria `NaN` e o parâmetro voltaria sozinho ao padrão, sem erro em lugar nenhum.
- **QUAL MODELO ATENDE OS BOTS é um tunable** (`BOT_LLM.MODELO`/`MODELOS`, padrão **`gpt-oss:20b`**;
  `seedModelo` em `server/src/llm/ollama.js`): era só `OLLAMA_MODEL` no ConfigMap, ou seja editar YAML,
  aplicar e reiniciar os três shards para uma decisão que só se toma OLHANDO a sala falar (um modelo é mais
  rápido, outro é mais engraçado, outro obedece melhor ao teto de palavras). A lista de opções nomeia só o
  que existe na máquina do Ollama — pedir um modelo ausente é trocar a fala dos bots por 404 em silêncio.
  ⚠️ **O cliente não fecha o nome no closure**: `createOllama` deixou de receber `model` e lê
  `BOT_LLM.MODELO` a cada chamada, o mesmo aliasing de objeto da física — assim a troca vale na fala
  seguinte, sem recriar o cliente e sem zerar o disjuntor, o teto de gerações em voo e as métricas. Fechado
  na criação, o painel diria "salvo" e o servidor seguiria chamando o modelo antigo para sempre.
  ⚠️ **O env é SEMENTE, não verdade** (padrão do código → `OLLAMA_MODEL` no boot → `admin_settings`), e um
  nome fora da lista é ACRESCENTADO a ela em vez de recusado: a máquina do Ollama pode ter um modelo que
  este código não conhece, e um `<select>` sem o valor em uso mostraria ao admin um modelo que o servidor
  não está usando. Como `options` é a lista de `constants.js` por REFERÊNCIA, o acréscimo já vale para a
  validação do PUT. `Restaurar` volta ao padrão do CÓDIGO, nunca ao env.
  ⚠️ Trocar **não reaquece sozinho**: o modelo novo paga o load (~27 s) na primeira fala, e nesse
  meio-tempo a sala usa o repertório fixo — o mesmo chão de sempre, não um segundo comportamento.
  ⚠️ **O AQUECIMENTO ESPERA OS TUNABLES** (`handler.tunablesReady`, exposto por `api/index.js`): o
  `llm.warmup()` do boot corria solto e aquecia o modelo do ENV enquanto o banco já mandava outro — visto
  no log de produção, "ollama pronto: gpt-oss" com `BOT_LLM.MODELO = qwen` aplicado 40 ms antes. O
  aquecimento existe justamente para a primeira fala do dia não pagar os ~27 s de load; aquecendo o modelo
  errado ele paga do mesmo jeito. `Promise.resolve(...)` cobre o shard `role='game'`, que não monta a API.
  ⚠️ **`think:false` NÃO CALA TODO MUNDO** (`BOT_LLM.THINK`, o interruptor do painel; `perfil()` em
  `llm/ollama.js`): o gpt-oss é raciocinador nativo e, medido, devolve `content` **VAZIO** mesmo com
  `num_predict` folgado (198 tokens) — ele ignora o pedido, o raciocínio come a cota e a fala nem começa.
  HTTP 200, sala inteira no repertório fixo, nenhum erro em log. Por isso cada entrada de `MODELOS` declara
  `think` + `reserva` (tokens que o raciocínio come antes da primeira letra, SOMADOS a todo `num_predict`
  pelo cliente — o chamador continua pedindo o tamanho da FALA), e o padrão do interruptor é `auto`.
- **O TAMANHO DA FALA VALE PELO MENOR DOS DOIS TETOS, e metade dele não era ditada** (`montaSystem` em
  `rooms/botChat.js`): a queixa veio de fora, literal — "aumentei para 140 e continuaram falando pouco".
  Duas causas independentes, nenhuma visível. (a) **`MAX_CHARS` nunca entrou no SYSTEM**: só `MAX_WORDS`
  era ditado, e como a peneira RECUSA em vez de cortar, um teto que só vive nela não alonga a fala — ele
  apenas decide o que morre. É o mesmo argumento que já estava escrito aqui para o teto de palavras,
  valendo para a outra metade. (b) **`num_predict` não acompanhava**: 48 tokens fixos contra um teto de
  painel que vai a 140 caracteres, então a fala longa saía CORTADA (`done_reason:'length'`) para ser
  recusada em seguida; agora é derivado (`max(NUM_PREDICT, ⌈MAX_CHARS·0,7⌉)`, ~0,7 token por caractere em
  pt-BR). É TETO, não alvo: o modelo para no `stop`, então folga não custa latência. Medido pelo caminho
  real: média 41 → 60 chars, maior 55 → 88, aceitação 7/8 → 8/8. ⚠️ E o que MORDE é o de PALAVRAS — 12
  palavras cabem em ~70 chars, então mexer só no de caracteres é inerte; os rótulos do painel dizem isso.
  ⚠️ O máximo de `MAX_CHARS` é 140 porque a peneira faz `min(MAX_CHARS, CHAT.MAX_CHARS)`: oferecer mais no
  painel seria oferecer um número que não faz nada.
- **A DURAÇÃO DA SALA DO LIVRE É PARÂMETRO DO PAINEL** (`ROUND.TICKS`, grupo "Salas", dita em MINUTOS
  como o ímã é dito em massa): era só o env `ROUND_TICKS`, e `Room.js` lia `config.roundTicks||ROUND.TICKS`
  — com o env sempre preenchido, tornar a constante tunável não valeria nada, porque o ConfigMap venceria
  o painel em toda sala nova. Hoje o env SEMEIA `ROUND.TICKS` no boot (`startServer`) e a sala lê a
  constante viva. ⚠️ `MODES[FREE].roundTicks` virou **getter**: era uma cópia feita na carga do módulo, e
  cópia congelada faria o descritor do modo anunciar a duração antiga para sempre depois do primeiro
  clique. ⚠️ Vale para as salas CRIADAS daí em diante (a que roda fixou no construtor) e **só no Livre**:
  no BR o tempo é a rede de segurança da zona. ⚠️ O DIA DO CÉU acompanha (`roundInfo` manda
  `roundTicks/ROUND.DAYS`), então dobrar a duração dobra o dia do relógio do espaço — consequência
  declarada, porque o céu tem que virar um número inteiro de vezes por sala.
- **TAMANHO E TIPO DA FALA DOS BOTS** (`BOT_LLM.MAX_WORDS`/`MAX_CHARS`/`ESTILO`, `montaSystem` em
  `rooms/botChat.js`): a queixa era literal — linhas longas e bem construídas denunciam o bot antes de
  qualquer outra coisa. Os tetos caíram (16/110 → **12/85**) e os três viraram parâmetro do painel.
  ⚠️ **O teto tem que ser DITADO ao modelo, não só peneirado**, e é por isso que o `SYSTEM` deixou de ser
  const de módulo e passa a ser montado a cada geração: `sanitiza` RECUSA a linha grande em vez de
  cortá-la, então baixar o número sem contar ao modelo não encurtaria a fala — trocaria a fala por uma
  frase enlatada, deixando o bot mais MUDO em vez de mais breve. O "usually" do prompt é ~3/4 do teto
  duro: é essa folga que mantém a taxa de veto baixa. Duas medidas porque nenhuma sozinha basta (12
  palavras compridas passam de 85 chars; 85 chars cabem 20 palavrinhas). ⚠️ `MAX_CHARS` ficou ABAIXO de
  `HIST_CHARS` e nada quebrou — a desigualdade que o teste travava valia enquanto a fala CRESCIA; o corte
  do histórico existe para a linha do HUMANO, que vai até `CHAT.MAX_CHARS`. O **ESTILO** é o par
  id→inglês no molde exato de PERSONA/PERICIA: o id mora em `constants.js` (o painel precisa dele para o
  `<select>`) e a frase em `ESTILO_PROMPT`, server-only pelo mesmo motivo de `botPersonas.js` — `shared/`
  vai inteiro para o bundle do `?local=1`, e instrução de LLM não tem o que fazer lá. O padrão `misto` é
  o pedido literal: frase curta, ofensa, piada ou comentário curto.
- **O FILTRO DE PALAVRÃO É ESCOLHA, E O PADRÃO É LIVRE** (`CHAT.FILTRO`, combo em /admin → Chat;
  `server/src/palavrao.js`): mascarar a linha de quem joga é decisão de PRODUTO, não de engenharia — num
  .io xingar faz parte, e o pedido do dono do jogo foi literal. Três níveis (`livre` · `pesado` · `tudo`,
  este último é o comportamento de estreia descrito abaixo) e o padrão é `livre`: a linha sai como foi
  escrita. O que os portais pedem POR ESCRITO continua de pé em qualquer nível e não passa por aqui — o
  jogador SILENCIA (`game.mute`, do cliente) e DENUNCIA (`Room.report`), e o dono da sala tem kick e ban.
  Antes de mandar um pacote para revisão, subir para `pesado` é um clique, sem deploy.
  ⚠️ **DUAS COISAS NÃO SEGUEM O NÍVEL**, e não é censura escondida — é escopo. (1) O que o **SERVIDOR
  GERA**: um slur na boca de um preenchimento não é liberdade de ninguém, é o nosso processo inventando a
  palavra. Por isso a lista **`ODIO`** (slur racial/homofóbico/transfóbico/capacitista + estupro) saiu de
  `GRAVE` e barra o bot em TODOS os níveis — xingar pesado ele pode, inventar slur não. (2) O **NICK**
  (`nickProibido`, em `auth/nick.js`), que fica no placar, no feed e no radar a partida inteira e é
  escolhido a frio: "chat livre" é uma decisão, "qualquer coisa no pódio" é outra.
  ⚠️ **O PROMPT ACOMPANHA O NÍVEL**, senão a liberação é meia: com a peneira solta e o `SYSTEM` ainda
  pedindo comedimento, o modelo obedece — a peneira nem chega a ser exercida e o preenchimento fica mais
  contido que as pessoas da sala. No `livre` a linha dura do prompt vira só o ÓDIO.
  ⚠️ As regex são montadas UMA vez, na carga; o nível só escolhe entre elas. `_pushChat` roda em toda
  linha de todas as salas do shard, e um `new RegExp` com 60 alternativas ali seria trabalho por mensagem
  para um valor que muda uma vez por mês.
- **(o comportamento de estreia, hoje o nível `tudo`) A MODERAÇÃO ESTAVA DO LADO ERRADO** (`server/src/palavrao.js`, `Room.report`, `game.mute`): havia
  peneira de palavrão no jogo, mas só na saída da LLM (`sanitiza`) — o PREENCHIMENTO era censurado e a
  PESSOA não. A linha de um humano ia para a sala inteira depois de três transformações mecânicas
  (normalizar NFKC, tirar caractere de controle, cortar em `CHAT.MAX_CHARS`), e não havia denylist
  nenhuma. Poki e CrazyGames classificam o catálogo em PEGI 12 e pedem, por escrito, que o jogador
  consiga se proteger de outro; aqui não havia nem filtro, nem silenciar, nem denunciar — só desligar o
  chat INTEIRO nas Opções, que é desistir da sala por causa de uma pessoa.
  A lista é UMA (senão diverge na primeira correção) e os dois lados a usam diferente, porque o custo do
  erro é diferente: o **bot RECUSA** a linha (`temGrave` — ele tem repertório fixo para cair, então
  recusar não o deixa mudo) e o **humano é MASCARADO** (`mascara`, `merda` → `m****`), porque linha que
  some em silêncio parece chat quebrado e a pessoa só reescreve com outra grafia.
  ⚠️ Três grupos, não um: `GRAVE` (insulto sexual, slur, xingamento de família) recusa no bot e mascara
  no humano; `LEVE` (palavrão de todo dia) só mascara — o SYSTEM autoriza "mild swearing" de propósito, e
  recusar isso do bot trocaria fala gerada por frase enlatada, deixando-o mais MUDO em vez de mais limpo;
  e `AMBIGUO` (`pinto`, `rola`, `bunda`, `piranha`, `macaco`) **só recusa do bot** — ali o falso positivo
  custa uma frase enlatada, e mascarar "o Pinto entrou" ou "a bola rola" na fala de uma pessoa é pior que
  o palavrão que se queria pegar. ⚠️ `fuck` e `shit` **nunca estiveram** na lista original, que era
  pt-BR-cêntrica; são os mais prováveis num portal internacional.
  ⚠️ No **NICK** se RECUSA, não se mascara (`normalizeNick`): ele fica no placar, no feed, no chat e no
  radar a partida inteira, e um `Fulano****` no pódio é pior que pedir outro nome no instante da escolha.
  Vale para o `login`, que passa pela mesma função.
  ⚠️ **SILENCIAR é do CLIENTE** (`mudos` em `game/index.js`): não precisa de rede, funciona sem banco,
  vale no `?local=1` e ninguém descobre que foi silenciado. Cala as DUAS bocas — a linha nem entra no
  `chatLog` (guardada, ela reapareceria, porque o fade é por IDADE) e o clipe de voz é descartado em
  `onVoice`. Vale por SALA: o slot é reciclado, então `leave()` limpa — carregar para a sala seguinte
  silenciaria um desconhecido.
  ⚠️ **DENUNCIAR só REGISTRA** (`Room.report`): ninguém é expulso, silenciado ou punido por denúncia,
  senão ela vira arma e numa sala de 50 é a primeira coisa que alguém descobre. Vai ao servidor porque só
  ele sabe quem é a pessoa atrás do slot e só ele tem as últimas falas dela — `chatLog`, que já existia
  para o prompt da LLM, é o contexto sem o qual "fulano denunciou beltrano" é uma linha que ninguém julga
  depois. Cooldown de `CHAT.REPORT_CD_MS` por sessão: sem ele o botão é um flood de log.
  ⚠️ **A VOZ NÃO VAI NO PACOTE DE PORTAL** (`SEM_VOZ` em `portal/flags.js`), por duas razões
  independentes: o servidor é relay puro (não decodifica, não grava, não loga), então não há o que
  moderar nem o que auditar; e o iframe deles não dá a permissão — medido, o GameFlare embute com
  `allow="autoplay; fullscreen"`, e ali o `getUserMedia` do K morre em "Permissions policy violation" no
  console do revisor enquanto o jogador leva um toast dizendo que "o navegador bloqueou". Os dois
  controles de voz somem da tela de Opções junto (`prefsTable.js`): interruptor que não liga nada é pior
  que interruptor nenhum. ⚠️ O harness `portal/iframe.html` PEDIA microfone e por isso nunca reproduziu
  isso — ele tem que ser o `allow` mais POBRE que já se mediu num portal, não o mais generoso.
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
  `_centro`: sem peça no mundo aquilo devolveria a origem do mapa e a voz não alcançaria ninguém. Voz é push-to-talk no **K** (era o Ctrl: ele é MODIFICADOR — o
  navegador o reserva (Ctrl+W fecha a aba, Ctrl+roda dá zoom na página) e o sistema também, então
  segurá-lo por segundos com a outra mão sobre WASD fazia toda tecla do jogo virar atalho em potencial;
  era por isso que o `keydown` do `talk` precisava de `preventDefault`, que saiu junto — letra solta não
  tem default a cancelar. `KeyK` pode ser FIXA porque não está em `ACTION_KEYS`, o mesmo argumento do
  `Digit0`), clipes curtos em **µ-law 8 kHz** — não Opus, porque o
  Safari não decodifica o webm que o Chrome grava e metade da sala ficaria muda. O servidor é relay puro (não
  decodifica, não guarda) e o áudio toca num 4º barramento, fora do teto de vozes. ⚠️ o `maxPayload` do WS
  acompanha `VOICE.MAX_BYTES`: com 4 KB o `ws` derrubava o frame e a conexão junto.
  **Quem está falando aparece no mundo**, em tempo real: o clipe só sai quando a tecla é SOLTA, então o ícone
  não pode esperar por ele. O cliente manda `{t:"talk",on}` no instante do K e o servidor (`Room.talkState`)
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
  numa sala nova depois de 15 s (`ui/Round.jsx`: abertura de 2 s, campeão grande e um dos três modelos de placar).
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
- **O CLIENTE PODE MORAR FORA DAQUI** (`docs/spec/portais.md`, `client/src/portal/`, `server/src/http/cors.js`):
  os portais de jogo (GameDistribution, CrazyGames, Poki, itch.io, Y8, GameMonetize, GameFlare) pedem um **.zip com `index.html` na
  raiz** e hospedam os arquivos no domínio DELES, num iframe — o servidor multiplayer continua sendo
  warspace.io. O zip é só `client/dist`, e é isso que o `scripts/portal-pack.mjs` monta.
  ⚠️ **O modo de falha era MENTIR DUAS VEZES**: a sonda de `/api/config` morava dentro do
  `if (getToken())`, então quem tinha token caía em `createLocalServer()` e jogava sozinho ("Sem
  servidor: jogando em modo local"), e quem chegava novo nem sondava — `api.server` ficava `null` e a
  tela dizia **"Servidor sem banco"**, que é falso, o servidor inteiro estava fora. A sonda virou
  incondicional (conserta o site também) e, no pacote de portal, servidor fora deixou de virar
  single-player calado: vira `servidorFora` + `ui/Offline.jsx`, uma tela que FICA. ⚠️ Esse campo é de
  TOPO e não entra em `overlays`: `go()` e `play()` reescrevem aquele objeto inteiro, e este aviso
  precisa do contrário — grudar até o servidor voltar.
  ⚠️ **`base:"./"` só no build de portal.** Global quebraria `/admin/<sub>`, que é URL viva no site: com
  base relativa o script de `/admin/usuarios` resolveria para `/admin/assets/…` → painel branco. E o que
  a base relativa NÃO conserta são as referências absolutas a `client/public/`: por isso as duas
  `.woff2` da marca mudaram para `client/src/assets/fonts/` (de onde o bundler as hasheia) e o
  `fetch("/faces/…")` das 35 caricaturas passou a usar `import.meta.env.BASE_URL` — que **já termina em
  `/`**, então a interpolação vai sem barra própria.
  ⚠️ **`client/src/api/base.js` é a única fonte de "onde mora o servidor"**, e o contrato é que **base
  vazia = concatenação com string vazia**: o site emite `/api/me` byte a byte como antes, sem um `if` em
  runtime. O `wsUrl` deriva o esquema da BASE e não de `location.protocol` — senão a verificação local,
  servida em `http://127.0.0.1`, tentaria `ws://` contra um servidor `wss://` e você culparia o servidor.
  ⚠️ **NUNCA criar `client/.env`** (sem sufixo de modo): ele valeria para o `npm run build` de dentro do
  `client/Dockerfile` e toda chamada de produção viraria cross-origin, em silêncio.
  ⚠️ **PREROLL NÃO É UNIVERSAL, e `gameplayStart` precisa de `gameplayStop`** (`portal/index.js`): a GD
  EXIGE preroll (§2.1) e a CrazyGames PROÍBE — *"advertisements should not appear before the user has
  experienced a reasonable amount of gameplay"* —, e o jogo mandava o mesmo `anuncio("preroll")` para
  todos, ou seja o revisor deles levava anúncio antes de ver um frame. Quem declara é o ADAPTADOR
  (`semPreroll` em `crazy.js`), não uma flag de build: a regra é do SDK e mora junto dele. E o par
  start/stop estava quebrado onde ninguém olha — só `leaveGame()` chamava `jogoParou()`, então respawn e
  fim de rodada passavam por `play()` e o SDK recebia N × start para 1 × stop numa sessão normal. O
  estado (`emJogo`) é da FACHADA e o `anuncio()` fecha e reabre o gameplay em volta do anúncio, então
  nenhum chamador precisa lembrar disso.
  ⚠️ **O MUDO DO SITE DELES SÓ DURAVA ATÉ O PRIMEIRO ANÚNCIO.** `crazy.js` re-mutava dentro do próprio
  callback de fim (`if(mudo)silenciaAnuncio(true)`) e o `finally` da fachada chamava `avisa(aoRetomar)`
  DEPOIS, desmutando por cima — quem tinha desligado o som na página da CrazyGames voltava a ouvir o
  jogo para sempre, contra um requisito escrito ("muteAudio has priority"). Hoje o adaptador expõe
  `reaplica()` e a fachada o chama por último; o `retomou()` duplicado saiu do `fim`, e era ele que
  escondia a ordem.
  ⚠️ **NO PACOTE, O BOTÃO JOGAR ENTRA NA PARTIDA** (`semNome` em `state/actions.js`, `jogar()` em
  `Entry.jsx`): a CrazyGames exige que o jogador novo caia direto no jogo (máx. 1 clique), e aqui o
  PRIMEIRO clique não fazia nada além de um toast pedindo um nome — depois vinha a tela de Modos, e só
  então a partida. São 3 cliques, 1 campo de texto e 2 telas antes do primeiro frame. Sob `PORTAL` a
  guarda do nome não vale (a placa sorteada vira o nome de estreia, como em todo .io) e o botão chama
  `play()` no modo padrão. No site nada muda: escolher o modo antes de entrar é o que a tela inicial
  sempre ofereceu.
  ⚠️ **Anúncio (preroll + midroll) tem UM ponto de chamada: `play()`** — a porta única por onde passam
  Modos, Salas, convite, equipe, o respawn da morte e a sala nova do BIG CRUNCH —, e o tipo sai de
  `played`, que já existia. É no RESPAWN e nunca no instante da morte: atrás da tela de morte a rodada
  continua correndo e o jogador está assistindo de propósito. ⚠️ `audio.suspend()` **não** cala o jogo
  durante o anúncio (`sfx()` chama `resume()` a cada clique, e o `wakeAudio` está no `pointerdown` da
  JANELA): quem cala é `silenciaAnuncio`, uma flag que entra no `masterVol()` **e** trava o `resume()` —
  e nunca `prefs.muted`, que é escolha persistida do jogador. ⚠️ Nada de arquivo chamado `ads.js` (o
  nome vai para a URL do chunk e o bloqueador o mata) nem `import(`./${id}.js`)` (vira glob no Rollup e
  o zip da GD sai com o código da Poki dentro).
  ⚠️ **AS CARICATURAS NÃO VÃO NO PACOTE — o risco deixou de ser hipótese.** As regras dos portais
  proíbem "IP sem direitos de posse" e "uso explícito de política", e as 35 são de pessoas reais, 11
  delas políticos: num jogo chamado WARspace, Putin e Zelensky com bandeira no mesmo catálogo são o
  pior par possível. Elas já tinham sido cortadas uma vez, a decisão foi voltar atrás e manter o jogo
  igual em todo lugar — e então a CrazyGames e a GameMonetize reprovaram, esta última com a palavra
  "AI-generated", que é exatamente o que 35 caricaturas geradas parecem. O corte tem DUAS metades e
  nenhuma serve sozinha: `!PORTAL` em `faceFile()` (só ela deixaria os 35 arquivos dentro do zip, e o
  NOME entrega a identidade sem ninguém abrir a imagem — `07_putin.webp`) e `"faces"` na PODA do
  empacotador (só ela faria o cliente pedir `faces/*.webp` e encher de 404 o console do revisor).
  ⚠️ Quem pergunta é **`faceFile(skin)`, nunca `skin.face`** — o campo do catálogo continua lá, e três
  lugares o liam direto. O que importa é `layers/Planets.js`: ele decide o NOME do planeta por esse
  predicado (o rótulo mora no centro do disco e cairia em cima do nariz), então lendo o campo cru as 35
  skins viravam discos lisos **e anônimos** no portal. No site nada muda.
  Pela mesma lista ("URLs dentro do jogo") o texto de servidor fora
  deixou de citar o domínio. As thumbnails do catálogo são **JPG** — o Chrome headless só tira PNG, então o PIL
  converte no mesmo passo do recorte, achatando o alfa sobre o fundo (JPEG não tem alfa: sem o `paste` o
  transparente sai PRETO).
  ⚠️ **O QUE O REVISOR LÊ ANTES DE VER O JOGO É O `index.html`, e ele estava contra nós**
  (`htmlDoPortal()` em `client/vite.config.js`): o plugin tirava GA, manifest, apple-touch-icon e og —
  e deixava passar as três linhas que decidem a primeira impressão. `lang="pt-BR"`, um `<title>` em
  português e uma `description` que dizia **"agar.io espacial multiplayer"**: no zip mandado para a
  revisão, o produto se declarava clone de outro jogo, num idioma que o revisor não fala, e ainda
  citava o próprio domínio (a §6.1 proíbe URL dentro do jogo). A CrazyGames reprovou com *"the concept
  is quite close to existing titles"* — palavra por palavra, o que aquelas linhas diziam. Pelo mesmo
  motivo o cartão do modo Livre deixou de dizer "o jogo de sempre" (`modeFreeSub`, nos três
  dicionários): é o primeiro texto que se lê na tela de Modos, e é o cartão em que se clica.
  ⚠️ **A TELA DE CARGA é inline, no `index.html`** (`#boot`), e vale para o site também: o `#app` nasce
  vazio sobre `background:#000` e o bundle são ~308 KB gz mais um RTT do dicionário — em 4G throttled
  (que é como um QA de portal testa) isso é tela preta por 6–10 s, que se lê como "não carregou". Nada
  de imagem ali: o logo é um `.webp` hasheado pelo bundler, ou seja chega DEPOIS do que a tela existe
  para cobrir. Quem a remove é `tiraBoot()` em `main.jsx`, nas **três** entradas — esquecer numa delas
  deixa o `/admin` atrás de uma cortina que nunca sai.
  ⚠️ **As flags do pacote vêm de `define`, não de `import.meta.env`**, e isso foi MEDIDO: com
  `import.meta.env.VITE_X` o `node --test` de texturas morre (ele chega em `faces.js` sem Vite), e com a
  leitura defensiva o valor deixa de ser literal, o Rollup para de podar e o zip da GameDistribution sai
  com os adaptadores da Poki e da CrazyGames dentro. Quem pegou isso foi a guarda do `portal-pack.mjs` —
  que é o motivo de as guardas existirem.
  ⚠️ **CORS num ponto SÓ**: o topo do `handler` de `server/src/http/api.js`, com `setHeader` — que o Node
  MESCLA em todo `writeHead` de baixo, então cobre o `sendJson`, os headers próprios do avatar, o 304
  dele e o 503 de "sem banco". No `sendJson` não daria: ele nem recebe o `req`, e `/api/config` — a
  primeira chamada do boot — nem passa por lá. Superfície é `/api/*` menos `/api/admin`; o avatar sai com
  `*` (é público e `immutable`, e o eco fragmentaria o cache); e **nada disso é seguro se um dia existir
  cookie no projeto**. Origem desconhecida recebe a resposta normal SEM o header — 403 derrubaria o jogo
  no dia em que a própria origem saísse da lista, porque o navegador manda `Origin` em todo POST
  same-origin.
- **Y8** (`client/src/portal/y8.js`, `docs/spec/portais.md`): quinto portal, mesmo molde — o que ele
  acrescenta são duas armadilhas próprias. ⚠️ A origem a liberar é **`storage.y8.com`** (medida: um zip
  de estúdio roda em `storage.y8.com/y8-studio/html5/<estúdio>/<jogo>/index.html`), NÃO `www.y8.com`,
  que é só a página em volta do iframe — errar isso dá o sintoma pior de todos: carrega, desenha o
  menu e o JOGAR não conecta. Quem trava é `server/test/cors.test.js`, que lê o `k8s/05-config.yaml` de
  verdade e confere a origem real de CADA portal empacotado. ⚠️ O SDK deles é a **Ad Placement API do
  Google** com outra roupa (`preloadAdBreaks`, `type:start|pause|next|browse`, `adBreakDone.breakStatus`),
  daí `preroll→"start"` e `midroll→"next"`; e o `y8sdk.ready` PODE JÁ TER PASSADO quando o chunk carrega,
  então o listener vai antes do script e ainda se chama `emitReadyEvent()` depois. `autoLogin:false`
  contra o snippet do painel: não consumimos o `onAuth`, e autenticar para jogar fora o resultado é
  chamada de rede de graça.
- **GameMonetize** (`client/src/portal/gm.js`): sexto portal, e o que ele ensina é que **a origem do
  jogo não se deduz do domínio do site**. O site é `gamemonetize.com`; o jogo roda em
  `https://html5.gamemonetize.co/<gameId>/` — **`.co`** —, medido no feed público deles, e liberar só o
  `.com` daria o sintoma de sempre (carrega, menu bonito, JOGAR não conecta). ⚠️ O SDK é o da GD de
  PRIMEIRA geração com outro nome: mesmo `window.SDK_OPTIONS` lido na carga e o mesmo `SDK_GAME_START`
  ambíguo, então a guarda de "só fecha promessa PENDENTE" de `gd.js` está repetida ali. ⚠️ E
  `showBanner()` — que apesar do nome é o INTERSTICIAL — não devolve promessa: sobram duas saídas (o
  evento e o `PORTAL.AD_MS` da fachada) contra três na GD. ⚠️ O arquivo é `gm.js` pela mesma regra do
  `ads.js`: o nome vira URL de chunk e bloqueador casa palavra de publicidade no caminho.
- **GameFlare** (`scripts/portal-pack.mjs`, perfil `gameflare`): sétimo portal, e o primeiro depois do
  itch.io **sem SDK nenhum** — o que ele ensina é que "portal sem integração" não quer dizer "portal
  sem armadilha". A armadilha é a mesma dos outros e de novo em outro lugar: o jogo NÃO roda no
  domínio do site. `www.gameflare.com` é o portal, `distribution.gameflare.com` é o invólucro que os
  publishers embutem, e o nosso código roda em **`data.gameflare.com`** —
  `/games/<id>/<hash>/index.html`, medido no feed público deles (`feed.json`, 164 jogos) abrindo os
  invólucros e lendo o `<iframe>` de dentro. ⚠️ E o caminho tem **dois níveis**, então a `base:"./"`
  do build de portal é o que separa carregar de página branca. ⚠️ Quem anuncia é a PÁGINA DELES (o
  `gameflare-asdk.min.js` roda o preroll no invólucro antes de criar o iframe), então não existe
  `portal/gameflare.js`: a fachada devolve `null` para id desconhecido e tudo vira no-op. O SDK que
  eles oferecem é OPCIONAL e é de **sitelock**, não de anúncio — integrá-lo travaria o jogo nos
  domínios deles sem trazer receita. ⚠️ O iframe deles não tem `sandbox` (medido no ATRIBUTO), então
  a origem chega de verdade e não como `null`, que o matcher recusa por construção; o `allow` é
  `"autoplay; fullscreen"`, sem `microphone` — o push-to-talk não existe lá. ⚠️ O aviso "nenhum chunk
  de adaptador" do empacotador deixou de citar `"itch"` pelo nome e passou a sair de `semSdk` no
  perfil: com o literal, o portal novo herdaria um alarme falso a cada build.
- **Playgama** (`client/src/portal/pg.js`, perfil `playgama`): oitavo portal, e o primeiro cujo SDK é
  uma FACHADA como a nossa — o *Bridge* existe para publicar o mesmo zip em dezenas de plataformas
  (`PLATFORM_ID` traz vk, yandex, crazy_games, game_distribution, poki, y8, youtube). ⚠️ **A origem é
  um SUBDOMÍNIO POR JOGO**, medido na API pública deles (`/api/v1/games/<hru>` → `game_url`):
  `https://<hru>.games.playgama.com/<build>/__patch__/<patch>/index.html?platform_id=playgama` — o
  apex é só o portal, e liberá-lo daria o sintoma de sempre (carrega, menu bonito, JOGAR não conecta);
  e o caminho tem TRÊS níveis, então a `base:"./"` é o que separa carregar de página branca. ⚠️ O
  `?platform_id=` **não é enfeite**: o Bridge resolve a plataforma por `forciblySetPlatformId` → esse
  parâmetro → predicado de hostname → `mock`, e não existe predicado para o Playgama — por isso o
  nosso config NUNCA escreve `forciblySetPlatformId`, que travaria em Playgama um zip que eles
  redistribuem. ⚠️ O `playgama-bridge-config.json` é escrito pelo EMPACOTADOR ao lado do index.html
  (campo `extras` do perfil, o primeiro do script): em `client/public/` ele iria para o site e para os
  outros sete pacotes, e sem ele o Bridge loga `CONFIG_LOAD_FAILED` no console do revisor. O único
  valor lá dentro é `minimumDelayBetweenInterstitial`, DERIVADO de `PORTAL.MIN_AD_MS` — o Bridge tem
  relógio próprio (60 s) e, desalinhado, reprova em `failed` anúncios que a fachada achou legítimos.
  ⚠️ **Sem preroll**, e a regra é deles ("calling it explicitly can result in duplicate ads"): é o
  mesmo `semPreroll` da CrazyGames. ⚠️ Pausa e áudio são AGREGADOS lá (cinco fontes num estado só) e o
  NOSSO intersticial entra na conta — repassar os dois caminhos é a receita do bug que a CrazyGames
  ensinou, então enquanto o anúncio é nosso os eventos são ignorados e quem devolve o estado da
  plataforma, por último, é `reaplica()`. ⚠️ `platform.sendMessage('game_ready')` REJEITA na segunda
  chamada (medido no bundle deles): sem `.catch()` é rejeição não tratada no console, contra o
  requisito técnico de "no technical messages, errors". ⚠️ Nada de string de evento cravada —
  `EVENT_NAME`/`PLATFORM_MESSAGE`/`INTERSTITIAL_STATE` vêm do próprio `window.bridge`, que é servido
  por eles em `bridge.playgama.com/v2/stable` e pode mudar sem nos avisar.
- **GamePix, a porta de DESENVOLVEDOR** (`client/src/portal/gpx.js`, perfil `gamepix`): a mesma empresa
  do `/ads.txt` do site, a outra porta — lá warspace.io é uma PROPRIEDADE que monetiza, aqui é um JOGO
  do catálogo, e as duas não se parecem em nada. ⚠️ **A origem não é nem o site nem o player**:
  `www.gamepix.com` é o portal, `play.gamepix.com/<ns>/embed` é o player que embute, e o nosso código
  roda em **`games.builds.gamepix.com/<gameId>/<version>/index.html`** — medido no `GameFrame` do
  bundle do player (`CDNGamesSrc`) e conferido baixando o index.html de um jogo publicado (que traz o
  SDK deles na 1ª linha do `<head>`). São DOIS níveis de caminho, então a `base:"./"` de novo é o que
  separa carregar de página branca. ⚠️ **`GamePix.loaded()` é o portão de TUDO, e o modo de falha é
  MUDO**: sem ele, todo método responde `METHOD_BEFORE_LOADED` e `interstitialAd()` resolve na hora com
  `{success:false}` — jogo funcionando, revisor sem ver anúncio, e nada no console do jogo explicando.
  O adaptador memoiza esse `loaded()`, chamado pelo `carregou()` da fachada E esperado dentro do
  `anuncio()`. ⚠️ `on.pause`/`on.resume`/`on.soundOn`/`on.soundOff` são CAMPOS que se atribuem (o SDK
  nasce com os quatro indefinidos e loga "pause not defined"), não eventos que se assinam; o par de som
  é o botão do PLAYER e tem prioridade sobre o ajuste interno, como o `muteAudio` da CrazyGames.
  Enquanto o anúncio é NOSSO os quatro calam a boca, e quem devolve o estado do site por último é
  `reaplica()`. ⚠️ **`gameStop()` não é o par de `gameAction()`**: em modo de teste ele DESENHA o
  anúncio, e a fachada chama `jogoParou()` logo antes de todo anúncio — ligá-lo daria dois anúncios
  seguidos na tela do revisor. ⚠️ E o modo de teste (localhost/`file:`/a QA tool deles, detectada por
  `window.name`/`referrer`) é FEATURE: servido em 127.0.0.1 o SDK desenha o anúncio falso sozinho, então
  aqui dá para verificar o caminho do anúncio sem subir o zip — o único portal em que isso é possível.
- **BOUNTY BOARD: O PACOTE É O SITE** (`client/src/portal/bb.js`, `BOUNTY` em `portal/flags.js`): o
  Arcade deles tem DOIS trilhos e só um serve para um `.io` com servidor próprio — medido no bundle do
  player, onde o iframe do jogo nasce com `sandbox="allow-scripts allow-pointer-lock"` para um ZIP
  enviado e `allow-scripts allow-same-origin allow-pointer-lock` para uma URL EXTERNA. ⚠️ **Zip ali é
  origem OPACA**, e isso mata o jogo por dois caminhos independentes: `Origin: null` em toda chamada
  (que `http/cors.js` recusa por construção, e tem que continuar recusando) e `localStorage` que
  **lança** — onde moram token, prefs e idioma. A doc deles diz o mesmo ("hosted builds run on an opaque
  origin … localStorage/sessionStorage/cookies all THROW"). Por isso `portal-pack.mjs bountyboard`
  RECUSA, com o motivo escrito, e o que se submete é `https://warspace.io`: eles enquadram o site, a
  origem é a nossa e **não há uma linha de `ALLOWED_ORIGINS` a mexer** — o único portal em que o CORS
  não entra na história. ⚠️ **`allow-forms` não está no sandbox e o `submit` NEM É DISPARADO** (medido em
  Chrome: o clique no `type="submit"` e o Enter morrem antes do evento): dentro do player deles os
  botões CRIAR CONTA e ENTRAR do `AccountModal` não fariam NADA, em silêncio — hoje são `type="button"`
  + `onClick`, e o Enter é um `keydown` com `preventDefault` (que também mata a submissão implícita no
  site, então cada caminho dispara uma vez em todo lugar). ⚠️ O `allow` deles não tem `microphone`, daí
  `SEM_VOZ = PORTAL || BOUNTY`. ⚠️ **O ciclo de vida do SDK vem do STORE** (o molde de `app/analytics.js`)
  e não de `if (PORTAL)` espalhados, porque aqui PORTAL é FALSO: `screen`+`lastMatch`/`roundResult` caem
  no MESMO update, então "parou de jogar → acabou" sai em ordem num pass só, e o `gameOver` uma vez por
  vida é garantido pela rodada que o `gameplayStart` abre. ⚠️ `lockToHost()` fica de fora: ele BLOQUEIA o
  jogo quando não reconhece o embutidor, ou seja é uma forma nova de o nosso site quebrar sozinho.
  ⚠️ `?bb=1` liga a detecção à força — sem ele não há como provar a integração antes de submeter, porque
  o ancestral não se falsifica em 127.0.0.1.
- **`/ads.txt` É DO SITE, E O `try_files` MENTIA SOBRE ELE** (`client/public/ads.txt`,
  `docs/spec/portais.md`): o GamePix tem uma segunda porta além do catálogo de jogos — a de *publisher*,
  onde warspace.io é a propriedade `24C97` —, e o que ela pede não é zip: é o `ads.txt` do IAB na RAIZ do
  domínio. O conteúdo não se escreve à mão (878 linhas do template deles, `{id}` trocado na 1ª linha, byte
  a byte igual porque quem confere é um robô). ⚠️ A armadilha vale para TODA verificação de domínio que
  ainda vier: sem o arquivo em `client/public/`, o `try_files $uri $uri/ /index.html` do `client/nginx.conf`
  responde **200 com o `index.html`** — não um 404 —, então o robô do outro lado lê a página do jogo como
  se fosse o arquivo e reprova sem dizer por quê. ⚠️ E ele é PODADO do pacote de portal: ads.txt só é lido
  na raiz de um domínio, e dentro do zip ele declararia os parceiros de anúncio de uma rede concorrente no
  jogo que se manda para a revisão de outra.
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
  do jogo — 576 combinações, com os três modelos do fim de rodada e os três da tela de morte).
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
- **EM PÉ, O PLACAR SAI DA ÁREA DE JOGO** (`#h-rank` em `Hud.jsx`, o bloco homônimo em `ui.css`): no celular
  em pé o cartão de massa e o top 10 ocupavam a coluna direita do topo até quase a metade da tela — medido,
  290 px de altura sobre 240 de largura, bem onde o polegar direito trabalha e bem em cima do que o jogador
  precisa VER. No desktop a lateral é sobra; em pé ela é o jogo. As duas coisas que se consulta no meio de
  uma partida — o meu tamanho e se estou ganhando — viram UM chip na faixa do topo (`1º 52.020`), e a coluna
  fica só com o kill feed (290 → 82 px). O placar inteiro continua no desktop, no deitado e na tela de morte.
  ⚠️ **A FAIXA DO TOPO TINHA METADE DA LARGURA DA TELA**, e essa era a causa raiz — a mesma que já havia
  levado o MS/FPS e a hora do relógio para fora dali. Ela é `left:50%` SEM `right`: para um absolutamente
  posicionado, o shrink-to-fit mede do `left` até o fim do contêiner, ou seja 50%, e o
  `max-width:calc(100% - 16px)` é um TETO que nunca chega a valer. Medido em headless: 188 px de faixa num
  iPhone SE de 375 (375/2), 180 em 360, 195 em 390, contra 215 px de chips — só o Pro Max (430/2 = 215)
  cabia, raspando, que é por que o defeito parecia intermitente. Com `left:8px;right:8px` ela passa a ter a
  largura inteira.
  ⚠️ **E aí o RADAR virou o problema**: ele é 92 px no retrato, canto superior esquerdo com margem 12, ou
  seja ocupa x 12..112 e y 12..112 — exatamente por onde a faixa larga agora passa. Com `left:50%` a faixa
  nunca chegava ali, mas isso era ACIDENTE do shrink-to-fit, não desenho. Espremer a faixa entre o radar e a
  borda não resolve: sobrariam 234 px no Galaxy S8 para 296 px de chips, e o que restava para cortar já era
  tudo jogo (o código da sala é como se convida alguém, e mute/menu são alvos de 44 px). Quem desce é o
  RADAR: `position.marginTop:{portrait:60}` nos três `theme/<id>/index.js`, lido por `Minimap.layout()` no
  mesmo molde de `size`. Ele continua no canto dele, 44 px mais abaixo, sobre área que estava vazia — e a
  faixa cabe com 48 a 118 px de folga em 360–430 px.
  ⚠️ `--radar-top` nasceu junto com isso: o chat mora logo abaixo do radar por `calc(12px + var(--radar-h))`,
  e aquele `12px` cravado deixou de ser verdade no instante em que a margem do topo passou a variar.
  ⚠️ **O PLACAR RECOLHE, e a escolha é POR FORMA DE TELA** (`lbShow` / `lbShowPortrait`): duas chaves de
  pref, não um tri-estado nem um booleano só. As prefs viajam com a CONTA, então uma chave única faria
  recolher no desktop reabrir o placar no celular do jogador — desfazendo à distância exatamente o padrão
  que existe para não tapar a área de jogo dele. Os padrões são opostos porque as telas são: `true` no
  desktop/tablet/deitado (a lateral é sobra) e `false` em pé. Quem alterna são DOIS alvos: em pé, o próprio
  chip `#h-rank` do topo; no resto, o cabeçalho do painel, que virou `<button>` — ele já era a única coisa
  do placar que não é dado, e recolhido é o que sobra para trazê-lo de volta (sumir inteiro deixaria o
  jogador sem como desfazer). No deitado o RÓTULO sai e fica só o chevron, por 14 px de altura em vez de 26.
  ⚠️ `body[data-mode="landscape"] #hud #hud-right .ph{display:none}` teve que sair: escondia o cabeçalho
  para poupar altura, e desde que ele é o botão isso tirava do deitado justamente o controle que a tela com
  menos altura mais precisa. ⚠️ E no DEDO ele volta aos 44 px (`body[data-pointer="coarse"]`): o que se
  poupa ali é pixel de TEXTO, não área de clique — `scripts/responsive-check.mjs` pegou o `.ph 190x14`.
  ⚠️ O modo vem de `app.mode` (o store que `useViewportMode` escreve na MESMA linha do `body[data-mode]`),
  nunca do atributo do body: ler o DOM daqui seria uma segunda verdade que o React não sabe observar.
  ⚠️ O chip é renderizado SEMPRE e escondido por CSS fora do retrato — `Hud.jsx` é reavaliado a 8 Hz, e um nó
  que entra e sai do DOM ao girar o aparelho pisca. E `#hud.spec` já escondia massa e placar por conta
  própria (`#hud-right > *:not(#kill-feed)`), então o espectador não mudou.
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
  Os botões usam `repeat(auto-fit,minmax(52px,1fr))`, que responde ao CONTÊINER: na gaveta do celular deitado
  seis colunas fixas davam alvo de 37 px, e um `@media` não veria isso — a viewport ali tem 667 px de largura.
  ⚠️ **OPÇÕES SAIU DA GRADE e virou um ícone no topo do cartão**, ao lado do chip de moedas
  (`.entry-top`/`.entry-opt` em `Entry.jsx` + `ui.css`). Como o número de colunas sai da largura do
  CARTÃO, no celular em pé cabiam cinco e o 6º alvo caía sozinho numa segunda fileira: uma linha
  inteira do cartão para o atalho menos usado — e o único dos seis que não é destino de jogo. Lá em
  cima ele é um ícone no canto (36 px, 44 no dedo), com `LB.prefs` em `title`+`aria-label` no mesmo
  padrão do `.id-skin`, e o cartão perde a linha sem ninguém reposicionar nada, porque `.entry-main`
  é flex em coluna. ⚠️ O DESENHO continua sendo o de CURSORES, não uma engrenagem: é o mesmo
  `navIconArt.prefs` da barra `Nav` das telas internas (um destino, um símbolo), e o motivo escrito lá
  — engrenagem vira borrão a 20 px — não mudou. ⚠️ O piso da grade caiu junto (62 → **52 px**): com
  cinco botões, 62 px só rende fileira única a partir de ~340 px de largura interna de cartão, e num
  Galaxy S8 sobram ~296 px — o ganho da linha não chegaria justo aos aparelhos mais estreitos, que são
  os que precisavam dele. Nada de `repeat(5,1fr)`: coluna FIXA foi exatamente o que deu os 37 px.
  ⚠️ O `align-self:flex-end` do `.coinbar` virou `center`: ele empurrava o chip para a direita quando
  era uma LINHA inteira da coluna, e dentro da fileira nova passaria a significar "encostado embaixo".
  ⚠️ E o RÓTULO virou `clamp(8.6px,2.4vw,9.5px)`: num aparelho de 360 px o botão fica com 56,8 px e
  sobram 44,8 para a letra — **os 3 px de BORDA de cada lado contam tanto quanto o padding** —, e
  "RANKING" pede 48,3, saindo "RANKI…". O `clamp` só age onde a viewport É o contêiner (celular em pé);
  na gaveta ela tem 667 px, o clamp devolve os 9,5 px de sempre e lá continuam quatro colunas largas.
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
  `OLLAMA_MODEL`/`BOT_CHAT_LLM`; ⚠️ o MODELO é o tunable `BOT_LLM.MODELO`, e o env só o semeia no boot): o repertório fixo continua sendo o CHÃO — é o que sai sem a variável, com o serviço fora ou quando a
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
  fica em `publica()` dentro de `_falar` (e não no `_pushChat`, que é o difusor comum).
  ⚠️ **A CORRENTE DEIXOU DE EXIGIR VOCATIVO** (`CADEIA_SOLTA_P`, `CADEIA_MAX` 2 → 5). Ela só continuava
  quando a linha GERADA citava alguém pelo nome — e numa conversa de gente a maioria das linhas NÃO tem
  vocativo ("kkkk", "nem vi", "tu ta doido"), então toda conversa morria no SEGUNDO elo. Hoje a linha sem
  nome continua na metade das vezes, e é `CADEIA_SOLTA_P` — não o `CADEIA_MAX` — o botão de "conversa mais
  longa": o MAX só diz onde ela é cortada à força.
  Termina por SEIS razões independentes: profundidade limitada por `CADEIA_MAX` (a ÚNICA que não é sorteio,
  e portanto a prova de que acaba); `CADEIA_P`/`CADEIA_SOLTA_P`; a **JANELA** de `CADEIA_JANELA` elos; os
  orçamentos por bot; o **ORÇAMENTO DE CONVERSA**; e a marca `solta`.
  ⚠️ A **JANELA** substituiu o conjunto `cadeia` que proibia repetir slot: com `CADEIA_MAX=5` aquilo exigia
  CINCO bots distintos por conversa — revezamento, não conversa. A janela de 2 proíbe o que incomoda
  (A→B→A no mesmo fôlego) e libera o que parece gente (A→B→C→A).
  ⚠️ O **ORÇAMENTO DE CONVERSA** (`Room.conversa`, `CONVERSA_MAX_GER`) nasceu com ela: uma linha de humano
  podia pedir 15 gerações (5 elos × coro de 3). O teto por BOT não segura (são bots diferentes) e o
  `MAX_INFLIGHT_ROOM` também não — ele só ENFILEIRA. Ele estrangula o elo bot↔bot e o CORO, **nunca a
  menção dirigida de um humano**: ser chamado pelo nome e ficar mudo é o pecado que este arquivo combate,
  e um teto de custo não pode reintroduzi-lo.
  ⚠️ E a **marca `solta`** existe porque toda fala espontânea já nasce como raiz de cadeia (`botChatTick` →
  `_falar` → `_digitaTick` → `_encadeia`, com `depth=1`). Sem ela, cada "peguei" de bot viraria o começo de
  um papo entre bots por cima do jogo.
  ⚠️ Dois COOLDOWNS tiveram que se separar, e sem isso nada acima aparece na tela: o de bot dentro da
  corrente é `CADEIA_BOT_CD_TICKS` (2 s) e não os 10 s da MENÇÃO — um elo chega 1–4 s depois do anterior, e
  com o cooldown longo valendo ali afrouxar a janela seria um NO-OP; e o `mencaoAt` da SALA parou de ser
  refrescado a cada elo (`if(!depth)`), porque numa corrente de 5 ele fechava a porta por 15–25 s para o
  próximo humano que chamasse um bot pelo nome — os bots conversando e o jogador ignorado.
  ⚠️ `gp.mencaoAt??-1e9`, nunca `||`: o tick **0 é falsy**, e com `||` o cooldown por bot simplesmente não
  existia para quem falou no primeiro tick da sala.
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
  **A LLM SABE COM QUEM ESTÁ FALANDO** (`elencoLinha` em `botChat.js`, `Room._quemE`, `eggDe` em
  `shared/src/eggs.js`): o prompt sabia o que o bot estava vivendo e não sabia quem era NINGUÉM — os nomes
  entravam como etiquetas vazias. Agora vai um bloco `[who is who]` com as pessoas que o prompt já cita (o
  próprio bot, quem falou com ele, o líder, o alvo, o agressor): a **caricatura**, o país (em INGLÊS, por
  `Intl.DisplayNames` — o prompt inteiro é inglês e "from Brasil" é a única linha que destoa) e o nível
  quando é alto. Só quem tem o que dizer entra; o resto não gasta um caractere.
  ⚠️ A caricatura é **FATO, não palpite**: `eggSkinFor(nick)` decide a skin daquela vida em
  `persist/hooks.js`, e o resultado mora em `gp.skinId` — o servidor SEMPRE soube que quem se chama "messi"
  está com a cara do Messi, e nunca tinha contado a ninguém. `EGG_BY_SKIN` existia, era exportado e **não
  tinha um único consumidor**; `eggDe()` é ele. Vai o campo `real` (o nome CANÔNICO), nunca `nome`: metade
  dos rótulos de skin é apelido — "Bruxo" não diz nada a um modelo, "Ronaldinho Gaúcho" diz tudo.
  ⚠️ O resto da associação com o mundo real é **inferência da LLM, autorizada no SYSTEM**: ela já sabia que
  "pizzalover" é comida e que "coringa" é personagem; o que faltava era a permissão. Medido na bancada, com
  o país junto ela chega a "vai chorar no italiano" e a chamar o Messi de "la pulga".
  ⚠️ `isBot` NÃO entra no elenco, e o SYSTEM proíbe dizer que alguém é bot: no Battle Royale o `anonBots`
  tirou o `PLAYER_FLAG.BOT` do fio justamente para o placar e o radar não entregarem o preenchimento, e uma
  linha de chat desfaria isso de graça.
  ⚠️ A **PENEIRA ganhou política e meta-bot** (`POLITICA`, `BOT_META` em `sanitiza`). O jogo tem caricaturas
  de Trump, Lula, Bolsonaro, Putin, Zelensky e Milei e a graça é a PERSONA, não a manchete — e o SYSTEM é um
  PEDIDO, que o modelo escapa uma em dez. Mora na peneira pelo mesmo motivo de `OFENSA`. ⚠️ "esquerda" e
  "direita" ficaram DE FORA: são direções dentro do jogo ("vem pela esquerda"), e vetá-las comeria fala
  legítima o dia inteiro. Pelo mesmo motivo "lula roubou tudo" PASSA — o único termo político dela é o nome,
  e "roubou" é palavra de partida. A peneira pega o vocabulário INEQUÍVOCO; o resto é com o SYSTEM.
  ⚠️ E o teto da SAÍDA separou-se do corte do HISTÓRICO (`MAX_CHARS` 110 / `HIST_CHARS` 90), que eram a mesma
  constante em dois papéis: a fala precisou de espaço para a piada com referência caber (a peneira RECUSA,
  não corta — teto apertado não encurtava a fala, trocava-a por uma frase enlatada), e o prompt não podia
  crescer junto. ⚠️ `PROMPT_MAX_CHARS` foi para 1900 porque **já estava estourado**: o teste montava um
  cenário sem `feed`/`modo`/`lider`/`zonaS`, media 1225 e aprovava, enquanto a produção mandava 1531 contra
  um teto de 1500. Um teto só vale o que o pior caso do teste vale.
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
  ⚠️ **SEM LLM, QUEM É CHAMADO PELO NOME NÃO FICA MAIS MUDO.** `_botResponde` abria com `!bc.ativo()` — e
  `ativo()` é "disjuntor fechado E gerações em voo < teto", ou seja uma condição de **OCUPAÇÃO** usada como
  condição de **EXISTÊNCIA**. Bastavam 4 gerações em voo em QUALQUER sala do shard para quem fosse chamado
  em qualquer outra ficar calado, e `BOT_CHAT.resposta`/`_fraseResposta` — que existem exatamente para isso,
  e cujo comentário afirmava que rodavam — nunca eram alcançados. Quem escolhe entre gerar e enlatar é
  `_filaTick`, no despacho, onde a informação é atual. O contrato por `kind`: `mention` sempre enlata,
  `coro` enlata mas com UM só (três frases fixas para um "e aí galera" é o coro de robô que o escalonamento
  evita), `reply` e `cadeia` continuam calados (aí a frase fixa É responder fora de contexto).
  ⚠️ E a linha ENLATADA também passa pelo `digitaFila`: com o disjuntor aberto ela vira a resposta padrão da
  sala, e sair INSTANTÂNEA enquanto as geradas levam 0,5–3,4 s é a assinatura de bot que `DIGITA_CPS` existe
  para apagar. O item vai marcado `fixa` para não encadear — repertório não cita ninguém e não conversa.
  **O BOT PUXA ASSUNTO** (`Room._iniciativaTick`, `BOT_TALK.SILENCIO_TICKS`): a conversa só nascia de um
  humano digitar, e uma sala em que ninguém NUNCA começa nada é tão estranha quanto uma em que ninguém fala.
  Com 45 s de silêncio, humano presente e **nada em voo** (fila de fala, de digitação ou geração — sala com
  fala na fila não está calada, está esperando alguém terminar de digitar), um bot abre conversa. ⚠️ O
  assunto NÃO é inventado: sai de `escolheAssunto` (pura, em `botChat.js`) sobre o que está acontecendo — o
  gás, a fofoca fresca do feed, o líder que disparou, os poucos que restam. ⚠️ Quem puxa também não é
  sorteio: é o líder, ou o bot mais PERTO de um humano — o planeta que a pessoa tem na tela. ⚠️ Não passa
  por `botChatTick` (lá um item é sorteado da leva e o resto vai fora, e a iniciativa perderia a loteria
  para qualquer abate do mesmo tick) e tem orçamento próprio, com metade do teto de conversa.
  ⚠️ `botChatTick` passou a sortear **PELO PESO** de `BOT_TALK.P`: o sorteio era uniforme e o `P` só era
  conferido DEPOIS, então um gatilho frequente e de baixo valor (o míssil, que acerta o tempo todo)
  ganhava a loteria, derrubava um `kill` do mesmo tick e ainda tinha 90% de chance de não sair — o
  resultado líquido era MENOS fala, e pior. O peso decide QUAL; o `chance` continua decidindo SE.
  ⚠️ Os gatilhos `tiro` e `escudo` eram MORTOS: tinham pool em `BOT_CHAT`, probabilidade em `BOT_TALK.P` e
  tradução em `evento()`, e nenhum `_talk` os emitia. Ligados em `Sim._consume`, e **só quando quem atirou é
  gente** (a fala serve para quem vai LER; e `BOOM` é o evento mais frequente da sala, então sem esse filtro
  ele apagaria `kill`, `morte` e `lider` da loteria).
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
- **A TELA DE FIM DE RODADA TEM ABERTURA, CAMPEÃO GRANDE E TRÊS MODELOS** (`ui/Round.jsx` +
  `ui/RoundIntro.jsx`, o bloco "FIM DE RODADA v2" de `styles/ui.css`, prefs `roundStyle`/`roundIntro`):
  trinta minutos de sala terminavam num corte seco — o placar já estava lá no primeiro frame — e o
  campeão, que é o assunto da tela, era desenhado com **34 px** na faixa e 86 px no degrau do pódio, o
  tamanho de um chip do HUD. Agora o fim tem tempo e tem tamanho.
  **A ABERTURA** dura 2 s: o universo é sugado para um ponto (é literalmente o que o BIG CRUNCH é),
  estoura, e do estouro nasce o planeta que venceu; só então o placar monta em cascata.
  ⚠️ As fases são `animation-delay` de CSS num DOM montado UMA vez, não state: um `setState` por fase
  re-renderizaria a tela inteira quatro vezes no meio da animação. Os únicos timers são os três sons
  (`suck` 0 ms · `bigCrunch` 880 ms · `podium` 1280 ms) e o `onDone`, e todos morrem no mesmo cleanup,
  que é também o caminho do "pular" — qualquer clique ou tecla encerra na hora.
  ⚠️ **`key={chave}` no `<RoundIntro>`**: os timers vivem num `useEffect([])`, que NÃO roda de novo
  quando o React REUSA o componente. Sem a chave, um segundo `roundEnd` durante a abertura do primeiro
  herda os timers velhos e a animação nova é cortada no meio pelo `onDone` da anterior — foi medido
  assim, com dois `mostrarTela("round")` em sequência.
  ⚠️ A contagem para a próxima sala parte de `prontoAt` (o instante em que o placar apareceu), não de
  `r.at`: senão a animação comeria 2 dos 15 segundos que o jogador tem para decidir.
  **OS TRÊS MODELOS** são três ARRANJOS das mesmas peças, e nenhum esconde o que outro mostra — só muda
  onde a tabela do resto começa (`CORTE`), porque o que a tela de cima já desenhou não se repete
  embaixo. `podio` é o pódio de sempre com o 1º em tamanho de campeão (e por isso a FAIXA saiu: o
  campeão aparecia três vezes na mesma tela); `cinema` entrega a tela ao vencedor e rebaixa 2º e 3º a
  fichas; `dossie` é o relatório em duas colunas, e é o único em que se COMPARA — a barra diz "ganhou
  por quanto", que nem o pódio nem a faixa diziam, e por isso é ele o PADRÃO (escolhido de olho, com os
  três medidos lado a lado). ⚠️ O padrão mora em DOIS lugares que têm que concordar: `PREF_DEFAULTS` em
  `state/app.js`, que é o que o jogador recebe, e o fallback de `estiloDe` em `ui/Round.jsx`, que vale
  quando a pref vem com lixo ou ainda não chegou do `GET /api/me`. A largura da caixa muda por modelo redefinindo
  `--screen-w` no próprio `#s-round[data-style]`, sem um `width` novo: o bloco "TODA TELA NO MESMO
  LUGAR" já lê a variável. `?round=1|2|3` passa por cima da pref para comparar os três sem gastar um
  PATCH por troca.
  ⚠️ **O TAMANHO DO PLANETA NÃO SE MUDA PELO `r`** (`--champ-d`): `paintSkin` escala por `cv.width/112`,
  então o `r` é sempre medido na escala de 112 e quem cresce é o `size` (a resolução). Subir o `r` junto
  estoura o aro das skins com anel (`1,85·r`) para fora do canvas, que CORTA. E o disco ocupa ~57 % do
  canvas — o resto é a folga do aro —, então o CSS deixa o canvas transbordar o bloco em 132 %, centrado
  por absoluto, e o disco fica com ~75 % de `--champ-d`. Pelo mesmo motivo o `.cp` tem `margin-bottom`:
  sem a folga o disco pousa em cima do próprio nome.
  ⚠️ **A MESMA CONTA CONDENAVA AS MINIATURAS**, e isso era um defeito ANTIGO: os cartões de destaque
  pediam `r=14, size=56` num canvas de 28 px, ou seja um disco de **7 px** — na tela aquilo lê como
  sujeira, não como planeta. Hoje é `r=30` com o canvas maior e margem negativa devolvendo o espaço, e
  a fileira não mudou de altura.
  ⚠️ **`<i>` GENÉRICO É ARMADILHA DE CASCATA**: a coroa do pódio é um `<i>` dentro do degrau, e
  `#s-round .podium.v2 .p1 i` — escrita para a MASSA — a capturava por especificidade ((1,3,1) contra
  (1,1,0) de `#s-round .cp-coroa`), deixando-a com 16 px e a cor do número, em silêncio. Hoje as duas
  regras do degrau são de FILHO DIRETO (`.p1>b`, `.p1>i`), e a coroa leva `opacity:1` explícito porque
  `.podium .step i` a deixava com 72 %.
  ⚠️ No Battle Royale o campeão passou a aparecer grande também (antes ele era suprimido para não
  repetir o subtítulo). Quem mudou foi o SUBTÍTULO, que parou de repetir o nome; numa vitória de
  ESQUADRÃO o rótulo acima do nome vira a EQUIPE, que é a única coisa que um planeta só não diz.
  ⚠️ A sonda (`scripts/responsive-check.mjs`) mede os TRÊS (`round:podio|cinema|dossie` via
  `mostrarTela`, que sob esse sufixo também DESLIGA a abertura — com ela no ar a sonda mediria o
  overlay) e espera 900 ms em vez de 420: a cascata de entrada acaba em 760 ms, e medir no meio dela lê
  um `translateY` de transição como transbordo. São 504 combinações.
- **VITÓRIA DE ESQUADRÃO MOSTRA O ESQUADRÃO** (`Room._rosterFold`/`_mergeBoard`, `Champ` com `time` em
  `ui/Round.jsx`): quem vencia um Battle Royale em dupla via a tela final anunciar UM vencedor, e o
  companheiro sumia justamente do lugar onde ele mais devia estar. A causa era muda e ficou anos no ar:
  `Sim.endRound` SEMPRE mandou `team` na linha do placar, mas quem monta o placar que vai ao cliente é
  o `_mergeBoard` da Room — e ele reconstrói as linhas a partir do roster, onde `team` não existia.
  Resultado: `champion.team` era `undefined`, `champTeam` saía **null em toda vitória de equipe**, e
  nem o subtítulo nem o bloco do campeão sabiam que havia uma equipe. Nada quebrava, nada logava.
  Agora o roster guarda `team` (então vale também para quem saiu antes do fim) e a linha o carrega.
  A EQUIPE INTEIRA sai do próprio `board` (`filter(b=>b.team===champTeam)`), sem um campo novo no
  `roundEnd`, e o companheiro que morreu antes continua na lista com massa 0 — ele ganhou junto.
  ⚠️ Os discos encolhem por `data-n` (dois de 340 px não cabem na coluna do dossiê), e isso pediu DUAS
  variáveis: `--champ-d0` é o tamanho escolhido por modelo e forma de tela, `--champ-d` é o que o `.cp`
  lê. `--champ-d:calc(var(--champ-d)*.66)` seria ciclo e a declaração inteira cairia em silêncio.
  ⚠️ `.ct-m` tem LARGURA FIXA: com `auto`, quem manda na caixa é o NOME, e o `.cp` de dentro (que é
  `min(--champ-d,100%)`) encolhe junto — dois planetas da mesma equipe saíam de tamanhos diferentes só
  porque um nick era mais curto.
  ⚠️ A ficha SOMA a equipe, menos o K/D: ele é razão, não soma — ali vale o total de abates sobre o
  total de mortes.
  ⚠️ No modelo `podio` o degrau do 1º perde coroa e glória quando a vitória é de equipe (`simples`):
  o bloco do esquadrão já está logo acima, e sem isso as mesmas duas pessoas apareciam duas vezes na
  mesma tela, com duas coroas.
  ⚠️ **E O RANKING PARA DE REPETIR QUEM JÁ ESTÁ EM CIMA**: no `podio` e no `cinema` os membros da
  equipe campeã saem dos degraus/fichas, que passam a ser "os maiores DEPOIS dela" (`LB.bestOfRest`),
  e a tabela do resto começa depois de tudo o que já foi desenhado — `jaVi`, um conjunto de ids, no
  lugar do `board.slice(corte)`. ⚠️ A posição vem de `b.pos` (o `placement` do servidor), NUNCA do
  índice do degrau: renumerar a partir de 1 poria um "1º" embaixo de quem não ganhou a partida. E o
  rótulo só aparece com equipe, porque um pódio com "3º" no degrau maior sem uma linha explicando é
  enigma, não informação. ⚠️ O `dossie` fica de fora do filtro: lá o bloco de cima é "OS MAIORES DA
  SALA", um ranking geral em barras — ali o campeão no topo é a informação, não repetição. Sem equipe,
  as três linhas colapsam no `board.slice(corte)` de sempre.
  ⚠️ O teste (`server/test/br.test.js`) compara por SLOT e não por nick: o nick nunca vem do cliente
  (sai da conta, e um token de teste sem conta ganha um "Viajante-NNNN").
- **A TELA DE MORTE TAMBÉM TEM TRÊS MODELOS, E QUEM TE MATOU GANHOU UM PLANETA** (`ui/Dead.jsx`, o
  bloco "TELA DE MORTE v2" de `styles/ui.css`, pref `deadStyle`): quem te matou era um NOME numa
  pílula preta — a informação mais importante da tela era a mais pobre, sem planeta, sem tamanho e sem
  nível, enquanto o pódio do fim de rodada já desenhava o campeão inteiro. E o `score` da partida
  chegava em `lastMatch` desde sempre **sem nenhum componente lê-lo**, o mesmo defeito que o `score` do
  `roundEnd` tinha.
  Os três modelos respondem à pergunta que se faz ao morrer, que não é a mesma para todo mundo:
  `duelo` põe os dois planetas frente a frente com o "2,6× você" no meio; `balanco` mede a vida contra
  o SEU recorde (a única régua honesta: "927" não diz nada, "927 contra os seus 4.820" diz tudo);
  `sala` mostra quem está na frente AGORA e quantos restam, para quem vai ficar assistindo — no Battle
  Royale isso é metade da partida, e clicar numa linha troca a câmera.
  ⚠️ **O `bySlot` já existia e parava no `Room.js`**: `Sim._died` sempre montou o `info` com ele, e a
  mensagem `dead` mandava só o nome. Com o slot, o cliente resolve skin e nível pelo PLAYERS (que traz
  a sala inteira, não só a AOI) em `game/index.js`. A skin do MORTO vem do mesmo lugar e **não** de
  `session.user.equipped_skin_id`: a skin daquela vida é decidida no servidor (o easter egg por nick
  mora em `gp.skinId`), e só o PLAYERS a conhece.
  ⚠️ **A massa do algoz é AO VIVO**, do `lb` do hudStore (todos os vivos, 2 Hz, fora da AOI): ela
  continua subindo na tela enquanto ele joga, e é isso que faz o "quanto ele era maior" doer.
  ⚠️ **O RECORDE VIAJA NA FOTO DA PARTIDA** (`recMass`/`recScore` em `onDead`), não é lido da conta na
  hora de desenhar: `session.stats` vem do `GET /api/me` do boot e `onRewards` não mexe em
  `bestMass`/`bestScore` — sem isso a segunda partida da sessão compararia com o recorde de antes da
  PRIMEIRA e diria "RECORDE!" de novo, com um número menor.
  ⚠️ **A entrada tem impacto mas não é uma abertura**: morrer é frequente, e um pedágio de 2 s a cada
  morte seria o oposto de melhorar a tela. O conteúdo já está pronto no primeiro frame e só CHEGA
  batendo (450 ms), com o 💥 estourando junto.
  ⚠️ **Os quatro números deixaram de ser um arco-íris**: os temas pintam cada `.dead-stats div` de uma
  cor (azul · dourado · verde · roxo) e ainda os rotacionam 2° alternando o sentido — quatro cores sem
  significado nenhum. Superfície única, e o dourado fica reservado para o que é mérito (as moedas). E
  a fileira deixou de quebrar em 3+1: o tema fixa DUAS colunas dentro de `width:min(320px,100%)`.
  ⚠️ **O disco tem teto de 74% da coluna, não 100%**: o canvas é absoluto e mede 132% do bloco (ver o
  fim de rodada), então um disco com a largura inteira do `.dd-alvo` — que no duelo é um terço da
  caixa — empurra 16% para cada lado, e o cartão ganhava barra de rolagem horizontal na gaveta.
- **A TELA DE MODOS: DOIS POR DOIS, E A LEGENDA DOS POWERUPS FOI PARA A AJUDA** (`ui/Modes.jsx`,
  `ui/Prefs.jsx`): eram QUATRO cartões numa caixa de 520 px, empilhados em quatro fileiras, e a tela
  passava de 1.300 px de altura — "Em equipe" ficava cortado ao meio pela borda e ninguém via que
  havia mais coisa abaixo. Três mudanças, e nenhuma sozinha resolvia: a caixa ficou mais larga
  (`#s-modes{--screen-w:min(760px,100%)}`, redefinindo a variável que o bloco "TODA TELA NO MESMO
  LUGAR" já lê), "Sala sua" entrou DENTRO da grade `.modes` (fora, era uma quarta fileira de largura
  inteira; dentro, divide a segunda fileira com "Em equipe" — os dois altos, os dois com controles) e
  os cartões encolheram no que era folga (ícone, padding, entrelinha).
  ⚠️ A LEGENDA DOS POWERUPS saiu daqui e virou a seção **Ajuda** da tela de Opções. Ela é cinco linhas
  de texto explicativo no fim da tela em que se está com PRESSA de entrar; quem quer saber o que é o
  trevo tem tempo, quem está escolhendo o modo não tem. O componente é o mesmo e sai da MESMA fonte do
  balão do HUD (`LB.powerups` + `LB.powerupHints`) — o que mudou de casa foi o `PW_LEGENDA` e o
  prefixo dos seletores (`#s-modes .pw-legenda` → `#s-prefs`).
- **O CABEÇALHO GRUDADO DEIXAVA O CONTEÚDO APARECER ACIMA DELE** (`.screen .wrap>.sh::after` em
  `ui.css`): `.sh` é `position:sticky;top:0` dentro de um `.wrap` que ROLA e tem `padding-top:18px`.
  Sticky mede contra o SCROLLPORT e o padding faz parte dele, então o cabeçalho grudado para 18 px
  abaixo do topo da caixa e o conteúdo passa por essa faixa — foi assim que "Em equipe" apareceu
  cortado em cima do título "ESCOLHA O MODO". Vale para TODAS as telas com cabeçalho, não só Modos.
  ⚠️ O conserto é um pseudo-elemento que estende o fundo do cabeçalho para cima, e **não** margem ou
  padding negativos: o `.sh` recebe `padding:6px 0 10px` dos temas, que são GERADOS pelo `port.js`, e
  reescrever isso à mão é trabalho que a próxima geração desfaz. Ele é invisível quando nada está
  grudado porque o fundo do `.sh` é o MESMO do `.wrap` nos três temas — medido, não suposto.
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
- **A TELA PISCAVA PORQUE O CONSERTO ERA APLICADO NA HORA ERRADA** (`game/quality.js`, `aplicaEcon` em
  `game/index.js`, `Background.setRes`): o sintoma era o canvas INTEIRO vazio — sem céu, sem grade, sem
  planetas — com o HUD vivo e o contador marcando 70 fps. Esses dois fatos juntos já dizem o mecanismo: o
  HUD é DOM e é escrito DEPOIS de `renderer.render(...)`, e não há try/catch em lugar nenhum do laço, então
  se o render lançasse o HUD congelaria. Ele estava vivo ⇒ o render retornava sem desenhar. E o canvas é
  `backgroundAlpha:0`, então "não desenhar" mostra o fundo do CSS.
  Eram DUAS causas somadas. (a) `econCheck` roda no FIM do frame e ali mesmo chamava `setEcon` →
  `setResolution` → `app.resize()`, que troca o backing store e **limpa o canvas**: o buraco durava até o
  render do frame seguinte — que ainda por cima carregava o `bg.resize()`, ou seja o bake do céu de tela
  cheia, o item mais caro do jogo, no instante em que o FPS já estava ruim. Hoje `econCheck` só MARCA o
  nível e quem aplica é `aplicaEcon`, na ABERTURA do frame: resize e render caem no mesmo tick e o
  navegador nunca chega a compor um quadro vazio. (b) A perda de contexto WebGL, abaixo.
  ⚠️ **O rebake da troca realimentava o gatilho**: o frame longo que a própria correção produz era lido
  como lentidão pela medição seguinte, que subia o nível de novo — uma queda virava uma ESCADA de trocas,
  cada degrau piscando. Por isso `QUALITY.SEGURA_MS` (carência de 1,5 s depois de qualquer troca), que é a
  peça sem a qual a histerese não fecha.
  ⚠️ `bg.resize()` no caminho da RESOLUÇÃO era duplamente errado: ele chama `rebuildStars()`, que recria o
  ParticleContainer inteiro (~1800 partículas em 1080p) e depende de `R.W/R.H` — que são pixels de CSS e
  **não mudam** quando só a resolução muda —, e destrói o `ready`, sabotando o pré-aquecimento do céu da
  próxima virada. Daí `setRes()`, um caminho separado do resize de janela.
  ⚠️ E `bakeBg` VAZAVA uma textura de tela cheia por troca de resolução: `ready=null` cru, sem destruir,
  quando a chave do pré-assado não batia — que é exatamente o caso quando `resFor` muda.
  ⚠️ A decisão virou função PURA (`quality.js`, tabela em `client/test/quality.test.js`), no molde de
  `modeFor`: ela vivia colada ao laço em cinco variáveis soltas, e por isso a oscilação que o jogador via
  não tinha como ser conferida.
- **PERDER O CONTEXTO WEBGL É NORMAL; FICAR PERDIDO É QUE NÃO PODE** (`onLost`/`onRestored` em
  `renderer/Renderer.js`): não havia UMA linha tratando `webglcontextlost` no cliente, e o Pixi 8 só
  restaura sozinho quando a perda foi FORÇADA por ele (`GlContextSystem`: `if(this._contextLossForced)`).
  Numa perda real — o navegador matando o contexto porque a memória de GPU estourou — ele chama
  `preventDefault()` e não faz mais nada, sem avisar a aplicação. O jogo seguia girando o rAF, contando
  fps e chamando um `app.render()` cujas chamadas GL viraram no-ops silenciosas: canvas vazio, HUD vivo.
  Agora a perda pede `restoreContext()` (3 tentativas espaçadas — restaurar na hora, com a memória ainda
  estourada, só perde o contexto de novo) e a volta chama o **`cache.invalidate()` que existia desde
  sempre e nunca teve chamador**, remonta as camadas pelo caminho de `setTheme` e reassa o céu.
  ⚠️ Invalidar e remontar não é exagero: quem SEGURA textura sem repedir por frame (os atlas de
  comida/ejetados/parallax e o tile da grade) apontaria para fontes mortas — confiar no re-upload cobriria
  só metade dos consumidores.
  ⚠️ `__warspace.loseContext()` existe para conferir isso sem ter de estourar a memória de verdade. É a
  parte que faltava: o defeito durou porque não havia como reproduzi-lo.
- **O ORÇAMENTO DE TEXTURA MEDIA A COISA ERRADA** (`cache.setExternal`, `IDADES` em `TextureCache.js`,
  `Background.bytes()`): a meta escrita é "texturas ≤ 48 MB" e ela era falsa por dois motivos ao mesmo
  tempo. Os **céus não passam pelo TextureCache** (são assados e destruídos à mão, e até TRÊS coexistem —
  atual + crossfade + pré-assado —, ~14 MB cada), então o item mais caro do jogo ficava fora da conta e
  fora do `texMB` do `?stats`, que por isso mentia justamente sobre o que estoura a memória. E a eviction
  só considerava entradas paradas há mais de 120 frames: bastava tudo estar sendo desenhado para a lista
  vir VAZIA, nada ser despejado e `bytes` crescer sem teto — o orçamento era decoração. Hoje a carência
  CEDE sob pressão (120 → 30 → 3 frames), o que é seguro pelo contrato do cache (quem desenha repede a
  textura pela chave todo frame), com UMA varredura por frame — sem essa guarda, com o conjunto quente
  acima do teto, cada `get` pagaria três varreduras ordenadas do mapa inteiro e o remédio custaria mais
  que a doença.
  ⚠️ Isso ACORDA um defeito que estava dormente: os props de cenário (`Background.js`) pegam a textura uma
  vez em `rebuild()` e nunca mais a repedem nem a carimbam — são o único consumidor sem `keepAlive`. Hoje
  os três temas devolvem `props:[]`, mas a eviction agressiva os destruiria em uso. O carimbo entrou junto.
  ⚠️ `R.texCap` é o teto de tier do modo econômico: `theme/util.js:tier` é função só do RAIO, então no
  nível mínimo (res .6) o planetão continuava assando e segurando 512² ≈ 1,34 MB para uma tela que desenha
  com pouco mais da metade dos pixels.
- **O `kind` DO OVERLAY MENTIA, E O CANVAS 2D QUEBRAVA O JOGO INTEIRO** (`Renderer.js`, `R.mesh`):
  `preference:"webgl"` é uma PREFERÊNCIA — o Pixi cai para canvas 2D por conta própria, **sem lançar**, e
  o `catch` do `app.init` não é o único caminho para o fallback. `kind` ficava dizendo "webgl" com o
  CanvasRenderer no ar, e isso aparece no `?stats`, que é ferramenta de diagnóstico: medido numa máquina
  sem WebGL, 3 fps com o overlay jurando webgl. Quem sabe a verdade é `app.renderer.name`.
  ⚠️ E o **CanvasRenderer não tem o pipe de malha** (medido: ele traz sprite/graphics/particle/
  tilingSprite/bitmapText, e nenhum "mesh"). O blob dos planetas é um `MeshPlane`, então na primeira peça
  grande da tela `renderPipes.mesh` vinha undefined e o `app.render()` passava a LANÇAR — todo frame. Como
  não há try/catch no laço e o `raf` é re-agendado na primeira linha, o laço sobrevivia mas tudo abaixo do
  erro era pulado: HUD congelado, som mudo e, ironia, o próprio `econCheck` nunca rodando. Ou seja,
  justamente na máquina sem WebGL — que é quem mais precisa da degradação automática — ela era a primeira
  coisa a morrer.
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

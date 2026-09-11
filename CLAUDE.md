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
# A aba AO VIVO é o fluxo de eventos do cluster inteiro (SSE agregado). Ver de fora, sem navegador:
#   curl -N -H "authorization: Bearer <token do painel>" https://warspace.io/api/admin/live
node scripts/loadtest.mjs --n 150 --dur 90    # N clientes DE VERDADE (guest → WS → join → INPUT 20 Hz) contra produção
# ⚠️ o alvo é --host (não --url), e --tokens aponta o cache de contas: contra um servidor LOCAL, use um
#   cache próprio, senão ele reusa os tokens de PRODUÇÃO e todo join volta 4401.
node scripts/prof-room.mjs --bots 15 --humanos 10   # onde vai o tempo de UMA sala (cérebro · World.step · _consume)
node scripts/brand-assets.mjs       # assa favicon/ícones/og/manifest + as 3 thumbnails de catálogo (brand/)
DATABASE_URL=... node scripts/skin-art.mjs [--dry]   # sobe a arte de client/public/faces/ para o banco (uma vez por ambiente)
node scripts/responsive-check.mjs [url]   # a matriz de layout (17 aparelhos × 3 temas × 20 telas, 7 critérios)
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
               skins.js (122 skins) · achievements.js · levels.js (XP/nível/K-D) · countries.js · eggs.js (nick → skin) · rng.js · camera.js · util.js · zone.js · bot.js
               physics/ (body, spatial-hash, integrate, collide, rules, world, predict) · protocol/ (constants, quant, writer, reader, codec, dto)
server/src/    index.js (composition root + startServer) · loop.js (scheduler 60 Hz) · metrics.js
               llm/ollama.js · rooms/botChat.js · rooms/botPersonas.js (histórias, server-only) · rooms/feed.js (marcos do kill feed)
               sim/ (Sim, hooks) · rooms/ (codes, Room, RoomManager, Party) · net/ (Session, wsServer, snapshot) · http/ (api, peers)
               config.js · log.js · tunables.js (parâmetros do painel) · db/ (pool, migrate, migrations/) · auth/ (tokens, password, nick, ratelimit)
               repos/ (+ settings, audit) · api/ (router + rotas, incl. admin.js) · http/admin.js (salas/kick/aviso) · persist/ (session, rewards, queue, hooks)
client/src/    api/base.js (a ÚNICA fonte de "onde mora o servidor") · portal/ (flags + fachada de anúncio + 1 adaptador por portal
               + sessao.js, o ciclo gameplayStart/Stop e o funil de sessão derivados do store)
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
  próprias peças (`predict.js`). Determinística: `mulberry32` por sala, tick inteiro, sem gerador nativo. Spatial hash de 160 px (a célula acompanha o LADO do mundo: 12000/160 = 75 colunas, o mesmo de 9600/128).
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
  `STAR.COUNT` = 19. O código continua inteiro e volta trocando o número — todos os consumidores são laços sobre `w.holes`, que viram
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
  (comida movida recebe UPDATE; cometa/estrela mais devagar; **asteroides também**, escalados por R_MIN/r; a estrela-perigo se arrasta até você); escudo por níveis 1–3 (o texto que sobe ao pegar diz **"ESCUDO 1/2/3"** e só sai quando o nível SUBIU DE VERDADE — comer um 🛡️ no teto continua com anel e som, porque ele reinicia o timer de evolução, mas "ESCUDO 3" ali não dizia mais nada; quem carrega isso é o bit 8 do `extra` do `SHIELD_UP`, protocolo 15 — e o texto mora no i18n (`fx.shield`), não cravado nos três temas; não "NÍVEL": com o nível do JOGADOR
  existindo e tendo badge próprio, "NÍVEL 2!" lia como se ele tivesse subido de nível; não expira,
  evolui sem ser atingido, míssil/tiro/batida forte de asteroide/**dividir** tiram um nível cada; contra quem pode engolir só
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
  `PLAYER.MAX_R`=1250 (mesma proporção mundo/célula do agar: 12000/1250 = 9,6) e passar dele **não trava**: `rules.autoSplit` reparte em
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
  ⚠️ **"Soltar o analógico faz as peças CONVERGIREM" DEIXOU DE SER VERDADE** — soltar não produz mais alvo
  nenhum, porque o rumo fica travado (bloco abaixo). O que continua verdade é o motivo: não existe alvo único
  que PARE peças espalhadas, já que o motor só freia dentro de `RAMP` de cada uma.
  ⚠️ Um efeito de borda que NÃO é regressão: o tiro MIRADO (segurar 160 ms) usa `ps.tx/ty` como cursor
  (`aimTarget`, `AIM_PICK`=700 px do ponto), e no dedo esse "cursor" é o alvo de MOVIMENTO — a mira do dedo
  só move a retícula local, nunca chegou ao servidor. Dividido, ele deixa de travar no
  que está colado em mim e passa a travar à frente, na direção da marcha. Não se perde nada: o CLIQUE RÁPIDO
  é teleguiado e escolhe o inimigo mais próximo de quem atira sozinho, sem olhar o alvo — antes o mirado era
  redundante com ele, agora os dois fazem coisas diferentes. Com uma peça, `d ≤ 32` e nada disso muda.
- **NO DEDO, SOLTAR NÃO PARA: O RUMO FICA TRAVADO** (`createRumo`/`cursoK` em `game/input/Joystick.js`,
  `renderer/layers/Heading.js`, `theme.hud.heading`): o analógico virou o DIRECIONAL do agar.io mobile.
  O que havia era um analógico com base e manopla desenhadas em DOM sob o polegar, valendo só na metade
  esquerda da tela, e o planeta andava enquanto o dedo estivesse encostado — soltar PARAVA, porque o `up`
  zerava o curso e `enviarInput` passava a mandar o alvo em cima do próprio centróide. O preço era o jogo
  inteiro: a mão tinha de morar em cima da tela, tapando exatamente a bola que o jogador precisa ver.
  Cinco regras: **(1)** qualquer parte da tela dirige — não há base, nem lado certo de encostar; **(2)**
  NADA é desenhado sob o dedo, e quem confirma o comando é uma seta colada ao PLANETA, ou seja o indicador
  passou a morar onde o jogador está OLHANDO; **(3)** o rumo SOBREVIVE ao dedo, e segue até ser substituído;
  **(4)** travado vai sempre a `k=1` — enquanto o dedo está no chão o curso ainda gradua a velocidade, mas um
  rumo travado a meia força seria um planeta lento sem nada na tela explicando por quê; **(5)** TOCAR SEM
  ARRASTAR também dirige, apontando o rumo do planeta para o ponto tocado.
  ⚠️ **A regra 5 conserta um buraco que as outras quatro abriram juntas.** `st.tem` (há rumo) só era escrito
  DENTRO do `move`, e só depois de o dedo passar de `MORTO·RAIO` = 5,2 px; o `down` não cria rumo de
  propósito (senão o toque dá solavanco de parada) e o `up` só agia `if(st.tem)`. Um toque limpo não era um
  planeta lento — era **zero**, e como a regra 2 não desenha nada sob o dedo, a tela ficava inteiramente
  inerte: nem movimento, nem retorno de que o jogo tinha visto o dedo. Visto em teste de leitura de tela
  ("ficam clicando na tela e não anda"). Tocar onde se quer ir é o modelo mental de quem chega do celular, e
  esse gesto estava LIVRE: no dedo o toque no canvas não atira (`actions.button` ignora `type==="touch"`) e o
  `down` do volante já dá `stopPropagation`. O medidor do banco só pega quem nunca se moveu na vida inteira
  (`food_eaten<=2` são 1,7% das primeiras vidas), então isto não aparecia como epidemia — o que ele não pega
  é quem perde os primeiros 15–20 s tateando, com a mediana de primeira vida em ~50 s.
  ⚠️ **A referência é o CENTRO DA CÂMERA, não o centróide**: `Renderer.js` desenha `cam.x,cam.y` em
  `W/2,H/2`, então o centro do canvas É o planeta na tela — e é para onde o jogador está apontando, que é o
  que importa num gesto. `TOQUE_MIN` (40 px de TELA) é o análogo da zona morta: tocar em cima do próprio
  planeta não diz para onde ir, e ali a direção é imprecisão de polegar.
  ⚠️ **`up()` SEM argumentos não converte, e isso é o contrato de `release()`**: a pinça e a pausa largam o
  dedo sem que o jogador tenha pedido rumo nenhum. Pelo mesmo motivo `pointercancel` ganhou handler PRÓPRIO
  — gesto que o navegador tomou não é toque deliberado.
  ⚠️ É **só no dedo**, por duas guardas independentes que já existiam: `down` sai cedo em
  `pointerType==="mouse"` e `game/index.js` só arma o direcional com `(pointer: coarse)` e `prefs.joystick`.
  No mouse o cursor já É o controle.
  ⚠️ **NÃO EXISTE GESTO DE PARADA**, e isso é decisão, não esquecimento: quem quer parar aponta para outro
  lado, como no agar.io. As únicas coisas que param o planeta continuam sendo a pausa, o fim de rodada e a
  morte (todas mandando o alvo em cima do centróide, em `enviarInput`) — mais o NASCIMENTO, que começa sem
  rumo nenhum. Daí os dois `joy.reset()` obrigatórios: `join()` e `{t:"alive"}`. Sem eles o planeta nasce
  correndo na direção da vida anterior, e no BR isso é a largada inteira jogada fora.
  ⚠️ **A condição do `enviarInput` é `tem` (HÁ RUMO), não `on` (há dedo no chão)** — trocar as duas devolve
  o comportamento antigo em silêncio, sem erro nenhum.
  ⚠️ **`down` NÃO pode zerar o rumo e `move` respeita a ZONA MORTA**: zerar no toque faria o planeta dar um
  solavanco de parada toda vez que a mão encostasse, e sem a zona morta o tremor do dedo pousando apagaria
  o rumo travado. As duas coisas são o mesmo defeito visto de dois lados.
  ⚠️ **O 2º dedo mira, mas a regra é de PAPÉIS, não de ordem de chegada** (uma vaga de volante, uma de
  mira): com o rumo travado o estado normal é NENHUM dedo no canvas, então o dedo que ia mirar seria lido
  como *primeiro* e viraria o planeta para o alvo. Por isso `joy.setAiming(on)`, alimentado pelo MESMO
  `onAim` que arma a reta de mira — enquanto o jogador mira, o próximo dedo é o da mira, e o seguinte volta
  a ser o volante.
  ⚠️ **A pinça precisou avisar que começou** (`onPinch` → `joy.release()`): enquanto o direcional valia só
  na metade esquerda, uma pinça do lado direito não mexia no rumo; agora que qualquer dedo dirige, o
  primeiro dedo dela é o volante e dar zoom viraria o planeta junto. `release()` larga o DEDO mantendo o
  rumo — é também o que a pausa usa, porque com o modal na frente o `pointerup` pode nunca chegar.
  ⚠️ **A seta é do RUMO COMANDADO, não da velocidade real**, é UMA só (a maior peça: com 16 pedaços, 16
  setas viram confete, o mesmo argumento do ícone de push-to-talk) e é exclusiva do DEDO — no mouse o
  cursor já é o indicador. Ela **não** sai no modo econômico nem com `reduceMotion`: é informação de
  CONTROLE, e o celular fraco é justamente o aparelho que acabou de perder a base+manopla. A geometria é
  assada UMA vez em `setTheme`, num espaço onde 1 = 1 px de TELA, e por frame só se escreve
  `position`/`rotation`/`scale(1/cam.scale)`/`alpha` — e o afastamento SOMA `r` de MUNDO com a folga de
  TELA; fração do raio poria a seta a 176 px de um planeta de r=587, lendo como outro corpo em órbita.
  ⚠️ **Nada disto toca no servidor, no protocolo ou na física**: o INPUT segue com os mesmos 10 bytes e o
  `PROTOCOL_VERSION` não sobe — mudou só COMO o cliente escolhe o `(tx,ty)` que já mandava. Por isso pode
  subir sozinho, sem sincronizar shards e cliente.
  ⚠️ A pref continua sendo `joystick` (mesma chave, mesma whitelist); o que mudou foi o RÓTULO nos três
  dicionários, porque "Joystick virtual" deixou de descrever o que existe. Desligada, o jogador cai no
  arrastar-direto do `Pointer.js`, que continua parando ao soltar — é a alternativa "controle direto".
- **Modos de jogo** (`MODE`/`MODES` em constants, `docs/design/modos.md`): **Livre** é o jogo de sempre e não mudou.
  **Battle Royale** é sala de 50, **sem respawn**, com **zona que encolhe** (`shared/src/zone.js`; fora dela a peça
  queima `zoneBurnRate(r)` da massa/s e MORRE no piso — a única coisa que mata sozinha) e vitória do último vivo.
  O gás ENDURECE conforme o círculo fecha: de `ZONE.BURN` (.10/s, raio da etapa 0) a `ZONE.BURN·BURN_K` (.22/s, no
  menor círculo), interpolado pelo RAIO ATUAL — que os dois lados já têm, então a rampa não custou byte de
  protocolo; do tamanho inicial ao piso são 12,6 s no começo e 5,7 s no fim (eram 21 s fixos, e aí atravessar o gás
  em diagonal era atalho). **A COMIDA SEGUE A ZONA**: `spawnFood` sorteia dentro do círculo, o alvo de população é
  `foodTarget() = clamp(π·r²/ZONE.FOOD_AREA, FOOD_MIN, FOOD.COUNT)`, o que fica no gás MORRE
  (`_cullFoodOutOfZone`, `ZONE.FOOD_SCAN` grãos por tick) e a reposição tem RENDA (`ZONE.FOOD_FILL_S`: a
  população inteira a cada 2 s), não torneira — repor na hora é inofensivo em 144 M px² e é FONTE INFINITA num
  círculo de 480 px, onde o líder cobre quase tudo e reengole cada grão no tick seguinte: medido com 49 bots, o
  consumo ia de ~200 para 7 579 grãos/s nos últimos 30 s e o líder saía de 355 mil para 1,02 MILHÃO em 15 s — o
  tapete engordava o gigante. Com a renda o pequeno não perde nada (ele só alcança ~43 grãos/s) e em 60 s no
  círculo apertado ele faz 32–53× enquanto o gigante faz 0,97–2,8×. Enquanto o círculo é grande o teto manda e nada muda; do
  meio para o fim a densidade sobe 15× (49 px entre grãos) e é daí que sai a VIRADA do pequeno — o grão dá massa
  ABSOLUTA, então vale 2 % para quem tem 900 de massa e 0,01 % para quem tem 200 000, que ainda perde `PLAYER.DECAY`
  por segundo. Sem isso o círculo final era um deserto de 20 grãos e a última fase premiava tamanho acumulado, não
  jogada.
  ⚠️ **A zona fecha em 33 000 ticks (9 min 10 s), e a PRIMEIRA PARADA caiu de 2 min 05 para 50 s**
  (`ZONE.HOLD_TICKS[0]` 7 500 → 3 000): dois minutos parados no começo ensinam o contrário do que o modo
  precisa ensinar, que é que o círculo VAI fechar. Com 50 s o jogador tem ~45 s depois da gaiola, ouve o
  aviso reforçado aos 0:40 e vê o gás andar aos 0:50; as outras cinco etapas não mudaram. ⚠️ Isso obrigou a
  escrever um número que só vivia em comentário: **`BR.DECIDE_TICKS`** (125 s, o que já valia: 45 000 −
  37 500), a folga entre o círculo fechar e a sala acabar por tempo — e `roundTicksOf` passou a recusar
  abaixo de `ZONE_TOTAL_TICKS + DECIDE_TICKS`. Sem ele, encurtar uma etapa da zona movia o PISO de duração
  do BR sozinho e a opção de 10 min voltava, com 50 s para o último círculo decidir a partida. Com a folga
  declarada, o piso continua em 20 min e o jogador não vê diferença.
  ⚠️ **O GÁS DA ETAPA 0 MACHUCA DESDE SEMPRE — o que estava errado era o comentário.** Não há guarda de
  etapa em lugar nenhum (`world.js` chama `zoneBurn` sempre que existe círculo; a única porta é
  `EXPOSE_MIN`). O que mudou foi o MAPA: o texto que dizia "cobre o mapa" foi escrito com `WORLD.w`=9600, e
  com 12 000 o centro→canto é 8 485 px contra os 7 440 do círculo inicial — sobram quatro "orelhas" de gás
  nos cantos (4,5 M px², 3,1 % da arena) desde o primeiro tick. O que o gás inicial não é, hoje, é
  ENCONTRADO: a largada é no octógono do centro, a 2 160 px da orelha mais próxima. Encolher `ZONE.R[0]`
  resolveria isso e **não foi feito de propósito**: `zoneBurnRate` ancora a rampa nesse número, então mexer
  nele muda a queimadura de TODAS as etapas do meio (medido: −17 % em r=5400) — é rebalanceamento de BR, e
  `predict.js` espelha a conta.
  ⚠️ (histórico) **A zona fechava em 37 500 ticks (10 min 25 s)**: as três primeiras etapas ganharam quase
  todo o tempo extra e as duas últimas não mudaram — o começo deixou de ser corrido e o fim continua tenso.
  `BR.ROUND_TICKS` subiu junto (36 000 → 45 000), e os dois andam SEMPRE juntos: alongar a zona sem alongar o
  teto faz a partida acabar por tempo antes de o círculo fechar, que é o único jeito de o Battle Royale
  terminar sem ter decidido nada. Em produção quem manda é o env `ROUND_TICKS` (`k8s/05-config`). O piso de
  comida do círculo final caiu (`FOOD_MIN` 60 → 28): 60 grãos num círculo de 144 px é 2,2× a densidade do
  resto do fim, e era um colchão. E a renda de reposição afrouxou (`FOOD_FILL_S` 2 → 3) — é ela que engorda
  o gigante no aperto, e o pequeno nunca alcançou esse fluxo mesmo. ⚠️ `shared/test/bot.test.js` teve que
  rodar MAIS tempo por causa disso: nos 7200 ticks padrão da arena o círculo ainda cobre o mapa e ninguém
  encosta no gás.
  **A ESTRELA TAMBÉM SEGUE A ZONA** (`ZONE.STAR_*`): ela nascia sorteada no mapa inteiro, então o
  círculo fechado não tinha nenhuma e o perigo saía da partida justo quando ela fica interessante. Um
  predicado "está dentro do círculo?" não resolveria — com o círculo em 600 px de 12000, o ponto uniforme
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
- **O BATTLE ROYALE LARGA NUM OCTÓGONO** (`BR.CAGE_*`, `shared/src/physics/cage.js`, `Room.begin`/
  `largar`, `renderer/layers/Cage.js`, `ui/CageStart.jsx`): os 50 nascem PRESOS num octógono no centro por
  `BR.CAGE_TICKS` (3 s), com contagem 3·2·1. Lá dentro eles se TROMBAM e nada mais — não há comer, atirar,
  dividir, cuspir, powerup, comida nem gás. O anel de largada (`BR.SPAWN_RING`, .44 = 5 280 px) SAIU: ele
  espalhava os 50 tão longe uns dos outros que ninguém via ninguém largar, e a largada é justamente o
  instante em que um battle royale se apresenta.
  ⚠️ **`begin()` virou DOIS TEMPOS**: `begin()` completa a sala, posiciona e liga a contagem; `largar()`
  abre a gaiola e arma a zona. A `phase` continua indo de `lobby` a `live` num passo só, e isso é decisão —
  é `phase!=='lobby'` que faz o `step()` chegar ao `_flush`, e o SNAPSHOT é o que desenha o octógono. Um
  terceiro valor obrigaria a revisitar `respawn`, `joinRefusal`, `info`, o placar, o feed e o `phase` do
  cliente, por nada.
  ⚠️ **NÃO CUSTOU UM BYTE DE PROTOCOLO.** O QUE ela é sai da constante (`BR.CAGE_AP`, que os dois lados
  leem, como `WORLD.w` e `ZONE.R`); o QUANDO sai de `SELF_FLAG.LOBBY` — um bit que `Sim.self` escreve desde
  sempre a partir de `w.peace` e que **nunca chegava ao cliente**, porque no lobby o `Room.step` retorna
  antes do `_flush`; e a contagem sai de `round.startsAt`, tick absoluto que o cliente já lia.
  `PROTOCOL_VERSION` não subiu.
  ⚠️ Ela **reusa `w.peace`** (que já fazia todo mundo virar aliado e portanto já desligava comer, míssil e
  mira nos seis pontos de `sameTeam`). O que faltava eram as guardas da **fase 1** (split, eject, swap,
  tiro, auto-defesa) e da **fase 7 INTEIRA** — não só o `eatFood`: o ímã de nascença arrastaria comida em
  espiral para dentro do octógono sem ninguém poder comê-la, e powerup com som e sem efeito é o pior jeito
  de um powerup falhar. **O gás não age por AUSÊNCIA, não por `if`**: a zona só nasce no `largar()`.
  ⚠️ **"Eles se trombam" é uma exceção escrita em `piecePair`**: sob `peace` todo mundo é aliado, e aliado
  usa `separateOwn` — posicional, sem impulso, sem evento, ou seja sem som e sem faísca. Dentro da gaiola o
  contato vira o quique de INIMIGO, que é o que faz 50 planetas apertados parecerem uma multidão.
  ⚠️ **A contenção é de OITO SEMIPLANOS e é ESPELHADA em `predict.js`**, na mesma posição do laço. É o caso
  mais grave de paridade do jogo porque ela muda a POSIÇÃO: conter só no servidor faria a peça própria
  atravessar a parede e voltar 20×/s acima de `NET.SNAP_DIST`, com a câmera junto. Duas passadas por tick —
  uma só deixa ~2 px de escape perto de um vértice.
  ⚠️ **O ALVO é recortado pelo RAIO, nunca pelos semiplanos**, e isso foi MEDIDO: recortar face a face (que
  é o certo para o CORPO) TORCE a direção nos cantos — um planeta logo à direita do centro mirando 4 000 px
  à esquerda recebia um alvo a 214 px dele, dentro da rampa de frenagem, e atravessava a gaiola a passo de
  tartaruga sem encostar em ninguém. É a mesma lição de `qPos`/`World.setTarget` sobre o recorte ao mundo,
  num octógono em vez de num quadrado. E conter o alvo de ALGUMA forma é obrigatório: sem isso os 50 — e
  principalmente os bots, que miram o mapa inteiro — ficam todos grudados na parede, imóveis.
  ⚠️ De carona, `predict.js` passou a **saturar o alvo ao MUNDO** antes de tudo, como `World.setTarget`
  sempre fez: o alvo daqui vem de `cam.toWorld(cursor)` e passa das bordas quando a câmera está encostada
  nelas. Sem gaiola isso só torcia a direção de leve; com ela, dois pontos diferentes caem em lados
  diferentes do octógono.
  ⚠️ **A câmera abre pelo caminho que já existe** (`ps.zoomUntil`, o powerup de zoom): sem isso um
  recém-nascido enquadra 1920×1080 px e o octógono (1 559 px de vértice a vértice) sai da tela — e reusar
  aquele campo é o que faz câmera e AOI abrirem JUNTAS, porque `net/snapshot.js` lê o mesmo número.
  ⚠️ **Os bots não foram tocados**: as duas guardas da fase 1 resolvem os dois sintomas, e qualquer coisa
  em `bot.js` seria uma segunda fonte de verdade sobre a gaiola.
- **E A PORTA DO BR FECHA NA LARGADA** (`Room.acceptsJoin`): existiu uma "janela de entrada tardia" — com a
  zona na etapa 0 e parada (~125 s), a sala continuava aceitando jogadores. Ela saiu por decisão de
  produto ("acabou a contagem para entrar, já era"), e o que sobrou é a regra que o modo sempre prometeu.
  Quem chega depois entra pela porta do ESPECTADOR (`acceptsSpectator`), que continua aberta: assistir uma
  partida em andamento é o caso de uso; entrar nela, não. ⚠️ `findOrCreateRoom` e `matchmaking.escolheSala`
  **não precisaram de uma linha** — os dois já liam `acceptsJoin()`, e é isso que torna a mudança uma
  remoção. `_lockInMs` ficou com uma janela só (o lobby) e `BR.JOIN_GRACE_TICKS`, declarada e nunca lida,
  foi apagada. Efeito de produto a MEDIR, não a ajustar preventivamente: o BR passa a criar mais salas por
  onda, e o convite no Livre (`announceBrStartCluster`) pode ficar mais frequente.
- **QUANTOS RESTAM E QUANTO FALTA PARA O GÁS MORAM NO TOPO** (`#hud-br` em `ui/Hud.jsx`, o bloco homônimo
  de `styles/ui.css`): eram dois chips de 12 px no RODAPÉ (`#hud-mode`), cujo comentário dizia "o topo e as
  laterais já estão ocupados". Continuam ocupados — o que mudou foi a hierarquia: num battle royale essas
  duas coisas não são metainformação, são o jogo, e sem elas à vista o jogador não sente o cerco fechando.
  ⚠️ **IRMÃO de `#hud-top`, na linha de BAIXO — nunca um chip dentro dela.** A conta escrita no próprio
  `ui.css` mede a faixa em ~390 px de chips numa tela de 414: o primeiro chip a mais a quebra em duas
  linhas, e a segunda cai em cima do kill feed. `--top-h` é a altura reservada à faixa e `--brh` a do bloco;
  os dois variam por `data-mode` e o RADAR soma os dois no retrato (`Minimap.js`, porque aquele canvas é
  posicionado por estilo INLINE e CSS não o alcança) — junto com `--radar-top`, de onde o chat deriva o
  próprio `top`. ⚠️ E o gatilho de re-layout do radar teve que incluir "há BR no topo?" na chave: com
  `m!==mode` só, entrar numa partida não o reposicionaria.
  ⚠️ **Zero bytes de protocolo e zero chaves de i18n**: `self.alive` (20 Hz) e `zone.t1` (do `MSG.ZONE`,
  room-wide) já chegavam, e `aliveLeft`/`zoneCloses`/`zoneShrinking`/`zoneOut` já existiam nos três
  dicionários. ⚠️ Ele **fica para o MORTO** (`:not(#hud-br)` na lista do `#hud.spec`): quem morreu no BR
  continua na sala assistindo, e "restam N" com o relógio do gás é o que dá sentido a assistir — e ele nem
  precisa de guarda contra o "⚠ NO GÁS", porque `Sim.self` já zera `ZONE_HURT` para quem está morto.
  ⚠️ **PISO DE LARGURA nos dois números** (`min-width:2ch`/`4ch`): `tabular-nums` só resolve o DÍGITO, e a
  mudança de CASA (12→9, 1:00→59) encolhe a caixa e faz o separador andar de um lado para o outro — a 34 px
  isso lê como a tela tremendo. ⚠️ **Sem `aria-live`**: isto muda a cada 125 ms; quem anuncia o gás em
  marcos discretos é o `ZoneWarnBanner`, que já tem `aria-live="assertive"`.
  ⚠️ **E a matriz de responsividade NUNCA tinha medido esse bloco**: `hudDemo` (`state/actions.js`) enchia
  `alive:24` mas **nunca setava `mode`**, então `Hud.jsx` não o desenhava — e `'hud-mode'` estava na lista
  de ids de `scripts/responsive-check.mjs` desde sempre, como no-op silencioso, sobre ~600 combinações.
- **A MASSA INICIAL SÃO DOIS PARÂMETROS** (`PLAYER.SPAWN_R` e `BR.SPAWN_R`, grupo "Jogador"), ditos em
  MASSA no painel como o teto do ímã. `PLAYER.START_R` se partiu em duas coisas que sempre foram
  diferentes: `SPAWN_R` é o tamanho com que se NASCE (e são dois, porque os modos não são o mesmo jogo — a
  largada do BR agora acontece dentro de um octógono), e `START_R` continua sendo o **piso do decaimento**
  (`body.js:decayPiece`) e a RÉGUA contra a qual `SPLIT.MIN_R` (60), `STAR.PASS_R` (40) e
  `PLAYER_SPAWN_NEAR_MAX_R` (×5) foram escolhidos.
  ⚠️ **`START_R` não é tunable e não pode ser**: `decayPiece` é chamada por `predict.js`, ou seja é física
  do CLIENTE — escopo `both`, que a rota recusa com 501. Os dois `SPAWN_R` são `server` porque nenhum
  leitor deles mora lá.
  ⚠️ **O piso NÃO acompanha, de propósito**: quem nasce acima dele murcha de volta se não comer, como já
  acontece hoje com quem passa de 900 — e a taxa é de 11,5 min de massa 3 600 até 900, mais que uma partida
  inteira de BR. Fazer o piso seguir o parâmetro compraria uma regra que ninguém sente e pagaria com o
  parâmetro inteiro.
  ⚠️ **Quatro limiares moram dentro das faixas** e cruzar um muda o jogo em silêncio: 1 600
  (`STAR.PASS_R`, acima disso o recém-nascido não cabe mais na estrela), 3 600 (`SPLIT.MIN_R` — daqui para
  cima ele nasce PODENDO dividir, a mesma alavanca do portão do dividir), 6 000 (`BOT.NOVATO_MASS`) e
  100 000 (o ímã de graça do nascimento). O teto do BR é 3 600 e é GEOMÉTRICO: é a densidade do octógono
  falando (massa 900 = 8,2 % da área dele; 3 600 = 33 %).
  ⚠️ **Defeito preexistente encontrado e NÃO consertado aqui**: `PLAYER.DECAY` está declarado `server` mas
  `decayPiece` roda no `predict.js` — ele é, de fato, `both`. Mexer nele no painel faz a peça própria
  divergir do servidor em massa, em silêncio. Merece issue própria; o que importa é não copiar o
  precedente.
- **EM QUE LÍNGUA O PREENCHIMENTO FALA É UM TUNABLE** (`BOT_LLM.IDIOMA`, grupo "Fala dos bots"): `auto`
  (padrão) · `pt-BR` · `en` · `es`. Em `auto` nada muda — o bot responde na língua de quem falou com ele
  (`detectaIdioma`), a disciplina do `BOT_LLM.THINK`. ⚠️ **Travado é travado**: a regra "responda no idioma
  da mensagem" SAI do prompt inteiro, e o detector é PULADO — deixá-la como exceção faria um `hi bro`
  perdido virar a sala em inglês, ou seja um parâmetro que o primeiro estrangeiro desliga. ⚠️ **Só os
  três**, e não é limitação do detector: `sanitiza` peneira em pt/en/es (a lista `ODIO` barra a fala do bot
  em TODO nível de `CHAT.FILTRO`) e a UI só existe nesses três — um quarto entregaria bot sem peneira, em
  silêncio. As três listas (`IDIOMAS`, `IDIOMA_NOME`, `MARCAS`) são um conjunto só, e há teste. ⚠️ **Não é
  o país do bot**: `botNames.js` sorteia a bandeira e pede apelidos dela, e só — ligar país→fala faria
  metade da sala responder em português independentemente do que a PESSOA escreveu.
- **A RETENÇÃO CORTA POR PLATAFORMA, E A TELA ABRE EM 1 HORA** (`?origem=` +
  `GET /api/admin/retencao/origens`; `getPref`/`setPref` em `client/src/admin/api.js`): ver
  `docs/spec/admin.md`. Dois pontos que não podem ser desfeitos por engano: o valor do filtro vai como
  **`$1`** (por isso `ler(sql)` virou `ler(sql,params)`) — validar contra o próprio banco *pareceria* lista
  branca e seria "o atacante escreveu o valor aceito", já que `users.origin` é o cabeçalho `Origin` de quem
  criou a conta; e o **`JANELA_PADRAO` do servidor continua `14d`**, porque ele é o fallback de "não
  perguntei nada" e movê-lo viraria o `modo` de toda chamada sem parâmetro em silêncio. Quem prefere 1 hora
  é a TELA, e a escolha do operador manda.
- **O MAPA É 12000×12000** (`WORLD` em constants; era 9600, +25% de lado e +56% de área). É edição de
  BUILD, e o cliente tem cópia própria do bundle — dois valores diferentes corrompem `qPos/dqPos` e toda
  posição do fio sai deslocada, em silêncio; os 3 shards e o cliente têm que subir na MESMA imagem.
  ⚠️ Este bloco já disse "**nunca** tunable: `codec.js` captura `const W=WORLD.w` no LOAD DO MÓDULO", e as
  duas metades estão obsoletas há tempo — `WORLD.LADO` É tunable (grupo "Salas") e `codec.js` lê `WORLD.w`
  a CADA chamada. O texto novo foi acrescentado 35 linhas abaixo sem apagar o velho, e o mesmo par
  contraditório vivia em `shared/src/constants.js`. O que continua verdade é a consequência: dois valores
  diferentes corrompem tudo em silêncio. O que é FRAÇÃO acompanha
  sozinho (a zona, o anel de largada do BR, o piso da câmera, a quantização, a grade, o radar, o fundo);
  o que é CONTAGEM ou DISTÂNCIA foi escalado à mão, cada um com o expoente certo — **s² para população**
  (`FOOD.COUNT` 2500→3900, `ASTEROID.BELTS` 4→6 e `WANDERERS` 18→28, `MAX_EXTRA` 6→9, `STAR.COUNT` 12→19,
  `ZONE.FOOD_MIN` 1200→1875) e **s para alcance e tempo** (`PLAYER.MAX_R` 1000→1250, as duas listas de
  `ZONE.HOLD/SHRINK_TICKS`, `BR.ROUND_TICKS` 36000→45000, `VOICE.DIST` 3200→4000, `MISSILE.LIFE_TICKS`
  500→625 e os alcances de alerta e mira, `GRID_CELL` 128→160).
  ⚠️ **`CAM.AOI_FOOD_VIEW` vai no sentido CONTRÁRIO** (.55 → .44): ela é a fatia do MUNDO que a AOI da
  comida pode cobrir, então mantê-la faria a janela crescer 25% em px e a varredura de células 56% — o
  orçamento de rede não cresce com o mapa.
  ⚠️ O que NÃO escala: `NET.AOI_FOOD_MAX` (é teto de rede), `FOOD.MARGIN/STAR_CLEAR/NEAR_HAZARD_R` e
  `ASTEROID.BELT_RADIUS` (geometria LOCAL do perigo), `STAR.MIN_SEP/SAFE_SPAWN`, `ZONE.MIN_R/FOOD_AREA`
  (densidade, não tamanho) e `SPLIT.DIST`/`EJECT`/`BOUNCE`, que são o modelo do agar.
  ⚠️ **O piso da câmera muda de comportamento, não só de valor**: `zmin` cai de .2 para .16 e passa a
  morder em ΣR ≈ 6245 (era 3578), ou seja o gigante afasta mais antes de bater nele — e peça, asteroide,
  estrela e míssil vêm pela visão INTEIRA, sem teto de contagem. É o maior risco de rede do mapa maior e
  não aparece em teste nenhum: medir com `?stats` numa sala cheia.
  ⚠️ **O menor Battle Royale possível subiu de 10 para 20 min**: `roundTicksOf` recusa abaixo de
  `ZONE_TOTAL_TICKS` **mais `BR.DECIDE_TICKS`** (33 000 + 7 500 = 40 500). A tela de "Sala sua" já filtra
  por essa função, então o chip de 10 min some sozinho — mas um teste que cravasse 10 quebra, e é isso que
  ele deve fazer.
  ⚠️ Custo medido do tick (arena de `physics.test.js`, **com a máquina quieta**): média 0,62 → **0,75 ms**,
  ou seja +15% para +56% de área, com o dobro de folga até o teto de 1,5 ms. O `GRID_CELL` maior é o que
  segura o custo FIXO (`cellStart.fill(0)` em dois grids por tick, mais o `forEachPair` sobre `cols×rows`,
  que rodam mesmo com o mapa vazio) — é ele que domina, não a população.
  ⚠️ **Medir com a bancada limpa.** Um `npm run dev` e um Chrome headless rodando junto TRIPLICAM esse
  número (1,5 → 2,1 ms) e levam a afrouxar um teto que não precisava ser afrouxado. Aconteceu nesta mesma
  mudança: o teto chegou a subir para 2,0 ms com uma justificativa inteira escrita em cima de uma medição
  contaminada, e voltou para 1,5 quando os processos foram fechados. O mesmo vale para o soak de
  `server/test/game.test.js`, que nesta máquina já falha no commit ANTERIOR a qualquer alteração.
- **O TAMANHO DO MUNDO É PARÂMETRO DO /admin, E É O ÚNICO QUE NÃO VALE NA HORA** (`WORLD.LADO`, grupo
  "Salas"; env `WORLD_SIDE` semeia). `LADO` é o lado DESEJADO — o que o painel grava — e `WORLD.w/h` é o
  mundo de AGORA; quem copia um no outro é o BOOT (`startServer`, depois de `tunablesReady` e **antes** de
  a porta abrir, ou seja antes de existir a primeira sala). Trocar o mundo com salas rodando não tem
  conserto: a zona já foi sorteada, os cinturões já nasceram e os clientes daquelas salas já quantizaram
  posições na escala velha.
  ⚠️ **`protocol/codec.js` passou a ler `WORLD.w` a CADA chamada**, em vez de capturá-lo na carga do módulo.
  Sem isso, um pod com o mundo mudado e um bundle antigo quantizariam em escalas diferentes e TODA posição
  do fio sairia deslocada, com fator de erro constante e nada na tela dizendo por quê.
  ⚠️ **O cliente obedece o `world:{w,h}` da sala** (`game/index.js`, no `m.t==="room"`). O campo existia
  desde sempre e era decorativo — `wsServer` já o mandava e o cliente lia a própria constante. Ele chega
  ANTES de qualquer snapshot, que é o que faz a quantização bater. Câmera, radar, grade, analógico e
  predição já liam a constante por chamada; quem GUARDA o tamanho são a grade (o TilingSprite e a borda
  assada) e o fundo (as faixas de parallax) — daí `renderer.worldResized()`.
  ⚠️ **Mexer nele não reescala nada em volta**: comida, cinturões, estrelas e os tempos da zona continuam
  nos números do build. Mundo maior com a mesma população = mapa mais vazio. É ferramenta de teste, não um
  botão de "mundo maior" pronto — o mundo maior de verdade é a tabela de escalas do bloco acima.
- **A VERSÃO É NEGOCIADA, NÃO IMPOSTA** (`PROTOCOL_MIN`=11 ao lado do `PROTOCOL_VERSION`; `wsServer.join`,
  `Connection.handleJson`): o join DECLARA a versão do cliente, o servidor aceita a faixa
  `[PROTOCOL_MIN..PROTOCOL_VERSION]` e o `room` **ECOA a versão do cliente** em vez de anunciar a dele.
  Quem não declara — toda build publicada até a v15 — entra, e o campo SAI do `room`: ausente é
  "não checado", que é o que a guarda dos dois lados sempre significou.
  ⚠️ **A trava do servidor era CÓDIGO MORTO.** `wsServer.js` só conferia `msg.protocol` e o cliente NUNCA
  mandava o campo — o texto que ficou aqui por meses ("`wsServer` recusa o join") descrevia algo que nunca
  aconteceu em produção. Quem recusava era o CLIENTE, sozinho, ao ver um número diferente no `room`, e com
  `location.reload()` em 1 s: no site isso conserta (o nginx serve o `index.html` com `no-cache`), mas no
  zip de um PORTAL o reload traz a MESMA build congelada — laço infinito. E a recusa vinha DEPOIS de
  `room.join()`, então cada volta do laço deixava um planeta fantasma segurando slot por `NET.RESUME_MS`.
  ⚠️ **O piso é 11 porque a v11 foi a única inserção NO MEIO de um registro** (`level`, no PLAYERS): um
  leitor v10 o lê como o `u8 len` do `str8` e desalinha a linha e todas as seguintes. Da v12 para cá tudo é
  campo no FIM do `self` (o `readSnapshot` o lê por último e não confere comprimento, então a cauda que o
  cliente não conhece fica sem leitor), kind no FIM do EVENT, ou bit novo em campo existente. **Regra:**
  aditivo sobe só o VERSION; tamanho, ordem ou reinterpretação que o leitor antigo não mascara sobe o MIN.
  ⚠️ **A v15 é o "aditivo" que não era**: o bit 0x100 foi para um `extra` que o leitor v14 lê CRU, então
  ele mostra "ESCUDO 257". Bit novo só é aditivo se o leitor antigo JÁ mascarava.
  ⚠️ **No cliente, os dois sentidos não são a mesma coisa** — tratá-los como um só foi o defeito. Servidor
  À FRENTE = a minha build é velha: recarrega UMA vez (marca em `sessionStorage`, com guarda porque em
  origem opaca ele LANÇA) e depois vira a tela `OUTDATED`, que FICA. Servidor ATRÁS = rollout em curso: o
  Deployment do cliente sobe em segundos e o StatefulSet dos 12–24 shards é sequencial (minutos), então o
  cliente NOVO sorteia um shard velho pelo `/api/config` — ali recarregar não conserta nada, e o que se
  faz é pedir OUTRO SHARD (`onStale` em `game/index.js`, refazendo a consulta, que é balanceada).
  `scripts/deploy.sh` também publica o cliente só DEPOIS dos shards, o que é redundância proposital.
  ⚠️ **O `protocol` de `/api/config` existia desde sempre e ninguém o lia.** Agora que o servidor não força
  mais ninguém a recarregar, é ele quem empurra a atualização — no BOOT, e não no meio de uma partida.
  ⚠️ **Quem ainda não tem conserto é o mundo**: build anterior a 12000 não obedece o `world:{w,h}` do
  `room` e joga na escala errada. No site o boot a recarrega; num portal, só quando eles aceitarem zip novo.
  A distribuição de versões dos joins está no `/healthz` (`metrics.join`) — é a única medida de quanta
  gente ainda está atrás.
- **O PEQUENO ATRAVESSA A ESTRELA E SE ESCONDE LÁ DENTRO** (`STAR.PASS_R`, `rules.starPass`): abaixo de
  40 px de raio a peça não é empurrada, não queima, não estilhaça e — o que faz o esconderijo existir —
  **não detona a estrela**. `pieceStar` chamava `supernova(...,rammed)` de forma INCONDICIONAL, então o
  pedaço mínimo já não estilhaçava (`SHATTER_MIN_R`) mas matava o abrigo mesmo assim: a mecânica se
  autodestruía no primeiro uso. Contra o gigante é assimétrico de propósito — ele não cabe, e entrar lhe
  custa `BURN` e a estrela.
  ⚠️ **É RAIO ABSOLUTO, e os dois lados do número são escolhidos**: 40 > `PLAYER.START_R` (30), então quem
  acabou de nascer cabe; e 40 < `SPLIT.MIN_R/√2` (42,43), que é o MENOR raio que um jogador consegue
  produzir de propósito — acima dele "esconder-se" viraria um botão do médio (picar-se em 16 pedacinhos),
  o mesmo exploit que `shatterBlock`/`STUCK` existe para fechar. Fração do raio da estrela seria elegante
  (é o que `BLACKHOLE.CRUSH_K` faz), mas ela INCHA até `R·SWELL`=80,5 na fase OLD e o buraco cresceria
  junto, abrindo a brecha sozinho.
  ⚠️ **O miolo da supernova NÃO poupa o passante**, e é o contra-jogo: quem se escondeu é cuspido quando a
  estrela morre, e acima de `SHATTER_MIN_R` estilhaça junto. Um abrigo que ninguém consegue arrombar não é
  abrigo, é invulnerabilidade.
  ⚠️ **Sem espelho em `predict.js`** — ele não menciona estrela em nenhuma das 47 linhas —, e a mudança
  ainda apaga de graça um erro que existia: o `addBoost` de `PUSH_TOUCH_DIST` (160 px) passa de
  `NET.SNAP_DIST` (120), ou seja encostar em estrela DAVA snap no cliente.
  ⚠️ **O bot precisou aprender** (`temeEstrela` em `bot.js`): o medo era `r·HALO·STAR_FEAR` sem olhar o
  PRÓPRIO raio, nos três lugares (`_openness`, `_mapDangers`, `_nearestHazard`). Sem isso um bot pequeno
  fugindo recusaria justamente o único lugar que o salva. O molde é a linha do buraco negro logo ao lado
  ("só assusta quem ele consegue esmagar").
  ⚠️ **E precisou de uma camada de render** (`hazards.starsFront`, montada DEPOIS de `planets.root` em
  `Renderer.js`): a estrela é desenhada por baixo dos corpos (o halo tem que vazar por baixo), então o
  planeta escondido aparecia inteiro POR CIMA dela e a mecânica não lia na tela. É a metade quente do
  MESMO sprite (nenhuma textura nova), repetida acima dos planetas com alfa baixo — o mesmo espírito da
  promessa `CRUSH_K == textures.scale.blackHole`.
  ⚠️ **Mas ela SAI de cima de quem não cabe na estrela** (`tapado` em `layers/Hazards.js`). Ela nasceu
  aplicada a TODO planeta, e aí um planetão passando perto era pintado por baixo dela: o grande parecia
  entrar ATRÁS da estrela. Ele não cabe lá dentro — tem que TAPÁ-LA, e a cena precisa dizer isso. O teste
  é o MESMO da física, e é por isso que `STAR.PASS_R` virou tunable de escopo `wire`: com `server`, mudar
  o parâmetro faria o planeta ser tapado numa faixa e atravessar em outra.
- **O JOGADOR NASCE NO BERÇÁRIO DA SUPERNOVA** (`World.novas`, `_novaSpot`, `STAR.NOVA_SPOT_*`): quem
  entra numa sala do Livre nasce com 900 de massa num mapa de 144 M px² e leva minutos até achar comida em
  quantidade. A estrela que acabou de morrer deixou `NOVA_FOOD` grãos permanentes e `NOVA_PARTICLES`
  fragmentos gordos num raio de ~300 px — e ninguém era mandado para lá porque **não existia registro de
  supernova**: `starQueue` guarda só `{at}` e o evento é efêmero.
  ⚠️ **Só a AMOSTRAGEM muda, nunca o filtro**: o `zc` do `_farSpot` (o argumento que a zona do BR já
  usava) vira o disco da cratera, e `STAR.SAFE_SPAWN`, `ASTEROID.SAFE_SPAWN` e `PLAYER_SAFE` continuam
  sendo cobrados linha por linha. É o `PLAYER_SAFE` (1500) que resolve sozinho o medo óbvio de "nascer
  onde todo mundo quer estar": cratera ocupada reprova nas 40 tentativas e o laço passa para a próxima —
  e é por isso também que dois humanos não caem na mesma.
  ⚠️ **Bot não é atraído**: no Livre eles renascem sem parar e limpariam o cacho antes de o humano chegar.
  O berçário existe para ser ENCONTRADO, não para virar ração. E não vale no BR (guarda `!zoneNow()`),
  onde a largada põe todo mundo no anel com x/y explícitos.
  ⚠️ **Supernova de trombada não entra na lista**: com `RAM_REWARD` false ela não larga nem cacho nem
  fragmento, e mandar o novato para uma cratera vazia — onde ainda por cima alguém acabou de passar — é o
  oposto do que isto existe para fazer. A janela é `NOVA_LIFE_TICKS`, porque o prêmio que EXPIRA são os
  fragmentos; `NOVA_SPOT_R` 420 deixa o cacho dentro da AOI, então ele nasce VENDO o que ganhou.
  ⚠️ Nada de protocolo e nada em `predict.js` (que não conhece spawn nem estrela): `world.novas` nunca sai
  do servidor, e o `?local=1` herda o comportamento de graça porque roda o `World` inteiro na página.
- **O NOVATO NASCE PERTO DE GENTE, E ESSA MECÂNICA NUNCA TINHA RODADO** (`World._playerSpot`,
  `PLAYER_SPAWN_NEAR_MIN`; ela agora vem ANTES de `_novaSpot` em `_spawnPiece`): a função existe há
  tempo para dar o PRIMEIRO ENCONTRO sem esperar minutos, e **colocou zero jogadores em zero lugares**.
  Ela sorteia um ponto a até `PLAYER_SPAWN_NEAR_R` (360 px) de uma peça âncora e, na MESMA chamada,
  exigia ≥ `PLAYER_SAFE` (1500 px) de toda peça viva — inclusive a âncora que ela mesma acabara de
  escolher. É contradição aritmética: as 40 tentativas de `_farSpot` falhavam SEMPRE, `s.ok` vinha false
  e o nascimento caía no sorteio cego do mapa inteiro. Medido antes do conserto: **0 acertos em 200
  chamadas**, com o novato nascendo a 3.911 px do único humano da sala; numa sala do Livre com 25
  humanos e 25 bots, **82% dos nascimentos eram sorteio cego** e 18% iam para o berçário. Depois: 21%
  cego, 12% berçário, **67% ao lado de uma pessoa**.
  ⚠️ **Nada quebrava e nada logava** — é o modo de falha que `s.ok` foi criado para expor e que ninguém
  leu. `_novaSpot` tem a MESMA forma e está CERTA: lá o centro do disco é uma cratera, não uma peça,
  então "1500 px de toda peça" é satisfazível. O defeito é exclusivo de quem ancora numa PEÇA.
  ⚠️ **São DUAS RÉGUAS, e é isso que `_farSpot` não sabe fazer**: aquele argumento cobra a mesma
  distância de todo mundo. Agora um `pred` varre as peças com dois números — `PLAYER_SPAWN_NEAR_MIN`
  (220 px) para a âncora e para quem NÃO me engole (`r <= r·EAT.RATIO`), `PLAYER_SAFE` para quem engole.
  Cobrando os 1500 de todo mundo o predicado ainda reprovava ~2/3 das salas cheias, pelo tamanho do
  disco: com 50 planetas em 144 M px² o vizinho mais próximo de qualquer um está a ~849 px.
  ⚠️ **O ENCONTRO PASSOU NA FRENTE DO BERÇÁRIO**, e o motivo é dado: comida não é o que falta. Medido no
  teste da Poki de 10/09 (533 primeiras vidas) — quem sai antes de 1 min já comeu 52 grãos e cresceu de
  900 para 2.198, **sai VIVO em 76,4% das vezes** e sem um abate em 95,4%. Ele está comendo e indo
  embora. E o encontro é justamente o que retém: quem MORREU na 1ª vida chega aos 3 min em **36,7%**
  contra **25,5%** de quem saiu vivo, e renasce mais (50,8% × 42,4%). O berçário continua sendo o degrau
  seguinte e volta a mandar sozinho quando não há humano novo na sala — que é quando não há encontro a
  oferecer.
  ⚠️ **A mediana diz o resto da história em dois números**: quem sai vivo da 1ª vida sai aos **51 s**;
  quem morre, morre aos **68 s**. O encontro que prenderia o jogador chega DEPOIS de ele já ter ido.
  ⚠️ **Não vira spawn camping**: a âncora tem que ter `r <= PLAYER_SPAWN_NEAR_MAX_R` (150), então quem
  cresce sai do papel sozinho — e um camper que come novatos passa de 150 rápido. E quem pode engolir é
  sempre MAIS LENTO (`vmax ∝ r^-0,449`): a 220 px, um r=150 anda a 215 px/s contra os 447 do recém-nascido.
  ⚠️ **A ORDEM DO RNG MUDOU** (as tentativas de `_farSpot` agora acertam cedo em vez de gastar 40): a
  mesma semente não dá mais a mesma sala. Não toca em fio nem em `predict.js` — nascimento não é predito.
  ⚠️ `shared/test/spawn.test.js` trava os dois sentidos, e foi conferido por MUTAÇÃO: devolvendo
  `this.pieces`/`PLAYER_SAFE` para a lista de `_farSpot`, 4 dos 6 testes ficam vermelhos.
- **...E NUMA SALA RECÉM-ABERTA ELE NASCIA LONGE DE TUDO, PORQUE TODO MUNDO ERA BOT** (`SPAWN_ISCA` e o
  balde `iscas` em `_playerSpot`): o bloco acima consertou o encontro e continuou cego ao caso da ESTREIA.
  `_playerSpot` filtra `if(!o||o.isBot||!o.alive)continue`, e na sala que acabou de abrir **não há um
  humano** — a lista de âncoras sai vazia, a função devolve `null` e o nascimento cai no sorteio cego, que
  cobra `PLAYER_SAFE` (1500 px) de TODA peça viva. Ou seja: o jogador que chega primeiro nasce
  garantidamente longe dos 13 planetas que a semente acabou de pôr no mapa. **Sem isto, aumentar
  `BOT_SEED` não muda um pixel do que ele vê.**
  ⚠️ **É um SEGUNDO balde, consultado só quando não há humano** (`cand.length ? cand : iscas`): gente
  continua ganhando de preenchimento, sempre. Não é um `||` no filtro — seria trocar uma pessoa por um bot.
  ⚠️ **Só preenchimento que EU ENGULO** (`pc.r <= r/EAT.RATIO`), nunca um que me engole: o ponto é dar o
  primeiro alvo, e nascer colado num predador é o atropelamento que `recemChegado` existe para apagar.
  ⚠️ **O que a isca entrega é PRESENÇA NA TELA E UMA PERSEGUIÇÃO, não um abate** — e isso é honestidade,
  não limitação: `vmax ∝ r^-0,449` faz a isca ser MAIS RÁPIDA que o novato e `FLEE_DIST` a faz fugir. O
  abate vem do portão do dividir, que já é tunable. E **não** se passa persona/perícia ao cérebro para
  fabricar "agressividade baixa": um planeta de r=23 NÃO PODE caçar um de r=30 (`HUNT_RATIO` 1,3 contra
  `EAT.RATIO` 1,15) — o tamanho já dá a propriedade, e forçá-la custaria três assinaturas.
- **A SEMENTE GANHOU UM TIER DE ISCA, E "O PEQUENO" NUNCA FOI COMÍVEL** (`ROOM.SEED_R` com um terceiro
  par `[20,26]`, `SEED_MIX:[2,4]`, `BOT_SEED:13`, `botSpawnR`): a sala abria com 6 preenchimentos, dos
  quais os "pequenos" nasciam em `PLAYER.BOT_R`=[24,58] — e quem nasce com r=30 só engole `r ≤ 26,1`, ou
  seja **6,2% daquela faixa**. Sete "pequenos" davam 0,43 comíveis esperados: o novato tinha vizinhos e
  nenhum bocado. Hoje são 13 na abertura (2 gigantes + 4 médios + **7 iscas**) e sobram 19 vagas para a
  chegada gradual.
  ⚠️ **O TETO DA ISCA SAI DO JOGADOR, NÃO DE UM NÚMERO SOLTO**:
  `teto = min(faixa[1], PLAYER.SPAWN_R/EAT.RATIO)`. Cravar [20,26] faria a isca virar PREDADOR no dia em
  que alguém baixasse a massa inicial no painel — em silêncio, e justamente para quem a isca existe. E
  `rng.range` gasta um `next()` em qualquer faixa, então o teto **não desloca o stream** do rng da sala.
  ⚠️ **Os 2 gigantes voltaram, e `SEED_R[0]` FICA em [140,180]** — não voltar para [200,250], que é o tier
  de 40–62 mil de massa que o histograma acusou como algoz. O que mudou foi só a COTA, e isso só é seguro
  agora porque `recemChegado` passou a valer na FÍSICA e `bonusHumano` tirou a preferência do grande por
  caçar gente: os dois consertos não existiam quando a cota caiu de 2 para 1. `shared/test/novato.test.js`
  afirmava `SEED_MIX[0]===1` como memória escrita de uma decisão medida — virou `<=2`, **com o comentário
  reescrito**: mudar o número sem mudar o porquê deixaria o teste mentindo sobre si mesmo.
  ⚠️ **NUNCA O ÚNICO VIVO**: `_chegadaBots` ganhou um piso que FURA o relógio quando
  `bots + humanos < botSeed`. O buraco real é a sala que esvaziou de bots pelo trim e depois esvaziou de
  gente — o próximo a entrar ficaria sozinho por segundos. Na sala do DONO `botSeed` é zero, então lá nada
  muda (é o `abreEmAndamento`, e ele continua mandando).
  ⚠️ **`admin_settings` VENCE `constants.js`**, e este é o risco nº 1 da entrega: toda chave tocada aqui
  que já tenha linha no banco precisa ser APAGADA, senão a mudança é invisível e se procura o defeito no
  código. `ROOM.BOTS=32` já estava lá.
- **O MÍSSIL DO PREENCHIMENTO NÃO ACERTA QUEM ESTÁ SOB A GRAÇA** (`recemChegado` em `fireHoming` e em
  `pieceMissile`; `BOT.SPAWN_GRACE_TICKS` 2700 = 45 s): `MISSILE.SPAWN_CD_TICKS` impedia o novato de
  ATIRAR e nunca de ser ALVO — a proteção que `recemChegado` dá contra ser engolido não cobria a arma que
  alcança o mapa inteiro. São **dois** pontos porque um só não basta: `fireHoming` faz a situação deixar
  de existir (o bot nem escolhe o alvo) e `pieceMissile` é a garantia FÍSICA, que cobre Cacho e Rajada.
  ⚠️ **NUNCA em `incomingMissile`**: ela é o SENSOR DA VÍTIMA, e cegá-la desligaria o alerta na borda da
  tela, a interceptação e a auto-defesa **do próprio novato** — o oposto exato do que a regra faz.
  ⚠️ **Nunca tirar o alvo de um míssil EM VOO**: vira errante e acerta terceiros. A decisão é no
  lançamento, e só lá.
  ⚠️ **Não existe `BOT.NOVATO_MISSIL`**: a regra monta nos mesmos três números da proteção do novato e
  herda o interruptor deles — "desligar pela metade é pior que não desligar" vale aqui igual.
- **COLHER DENTRO DO GÁS VALE METADE** (`ZONE.GAS_GAIN`, `rules.gasGain`): acampar na beirada era RENDA
  LÍQUIDA, e o laço se fechava sozinho — `zoneBurn` arranca `pc.shed` e cospe pelotas para FORA, e passada
  a imunidade `pieceEject` devolvia 100% (`EAT.EJECT_GAIN`=1). Quem ficava no gás queimava e recolhia a
  própria queimadura indefinidamente, enquanto o círculo apertava em cima de quem estava jogando o jogo.
  Vale para a comida também, e para o SCORE junto: descontar só a massa deixaria o campista subindo no
  placar de graça.
  ⚠️ O desconto é **linear na exposição**, não degrau (`exp=1` dá exatamente .5): a borda fica monótona e
  não oscila a 60 Hz — é a mesma razão de `ZONE.EXPOSE_MIN` existir.
  ⚠️ **Quem paga é a exposição do COMEDOR**, nunca a posição do fragmento: com peça de até `MAX_R` de raio
  e círculo final de 960 px, um gigante com o centro fora engoliria caco de dentro — é o mesmo erro que
  fez `zoneExposure` substituir o critério do centro.
  ⚠️ Isto faz do gás o **quarto sumidouro de massa** do jogo, ao lado de `PLAYER.DECAY`, `STAR.BURN` e da
  comida que morre no gás. O `zc` já estava em escopo no `step` (`world.js`), então não custou lookup nem
  protocolo; e `predict.js` não prediz absorção (`Predictor` reescreve `r`/`mass` do snapshot), então não
  há espelho a manter. **Não mexer em `zoneBurnRate`/`zoneMass`/`zoneExposure`**: essas três SÃO espelhadas
  e qualquer mudança nelas quebra a paridade de 1e-9.
- **A ARMA FICA TRAVADA NO QUE O Q ESCOLHEU** (`ps.weaponPin`): `eatFood` fazia DUAS coisas na mesma linha
  — abastecer o cinto (sempre desejável) e EQUIPAR —, então pisar numa Rajada arrancava da mão a arma que
  o jogador tinha acabado de escolher, no meio de uma briga e sem nada que ele pudesse fazer. Agora o
  pickup só reequipa enquanto o jogador **nunca** apertou o Q.
  ⚠️ O pin é armado no ramo de `swapWeapon` que troca DE VERDADE, nunca no `swapReq` nem no topo da
  função: o Q com uma arma só no cinto é um no-op, e depois dele o jogador ainda tem que ver a PRIMEIRA
  arma que pisar vir para a mão ("pegar e não ver nada acontecer é pior que não pegar").
  ⚠️ `||ammoOf(ps)<=0` fecha o único estado ruim que a trava cria: travado numa arma VAZIA, pisando numa
  cheia e continuando sem tiro.
  ⚠️ **Não custa protocolo**: `PlayerState` não é serializado (o fio só leva o `self` de tamanho fixo), e o
  precedente é `aimLockId`/`aimLockUntil`. Zera em `_spawnPiece`, que é o caminho ÚNICO cobrindo
  `addPlayer`, `respawnPlayer` e a largada do BR. O bot troca pelo mesmo `INPUT_FLAG.SWAP`, então o pin
  vale para ele também — e `_bestWeapon` volta a pedir a troca sozinho.
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
  ⚠️ A cauda de `ZONE.R` mudou junto (final .015 → **.08**, hoje 960 px no mapa de 12000) — sem isso a cura mata o
  paciente: o teto geométrico seria 20 736 de massa para a SALA INTEIRA. 960 px é ~um arremesso de split
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
- **O TAB MOSTRA QUEM ESTÁ NA SALA, COM O JOGO VIVO POR BAIXO** (`ui/Roster.jsx`, `overlays.tab`):
  segurar abre, soltar fecha, e o planeta continua seguindo o mouse o tempo todo. É o ponto inteiro do
  painel, e é por isso que ele **NUNCA** passa por `setPause`: quem congela o planeta é `game.setPaused`,
  que faz o `enviarInput` mandar o alvo em cima do próprio centróide.
  ⚠️ **Não custa um byte de protocolo**: o `MSG.PLAYERS` já traz a sala INTEIRA fora da AOI (slot, nome,
  skin, nível, país, equipe, morto) e o `MSG.LEADERBOARD` traz a massa de todos os vivos a 2 Hz — o mesmo
  par que o placar do HUD já cruza. O que faltava era juntar os MORTOS, e eles estão em `view.players`.
  ⚠️ **O roster só é montado com o painel ABERTO** (`game.setRoster`): `pushHud` roda a 8 Hz, e 50 objetos
  por tick de HUD para uma tela quase sempre fechada é trabalho jogado fora.
  ⚠️ **A tecla mora em `App.jsx`, ao lado do KeyM**, e não no teclado do jogo: é atalho de UI, não ação —
  não passa por `canAct`, não entra no INPUT e vale com o jogador morto. `preventDefault` é obrigatório
  (sem ele o navegador tabula pelos botões do HUD e o `keyup` chega em outro elemento, deixando o painel
  grudado), e há um `blur` da janela porque Alt+Tab nunca entrega o `keyup`.
  ⚠️ O overlay é **`pointer-events:none`** e **sem `backdrop-filter`**: capturar o ponteiro congelaria o
  alvo do jogador (o mesmo motivo do `#hud` inteiro), e borrar uma partida em andamento para ler uma lista
  é o oposto do que o painel existe para fazer.
  ⚠️ `anonBots` sai de graça: no BR o servidor não manda `PLAYER_FLAG.BOT`, então `isBot` já chega falso.
  Não inventar uma segunda fonte.
  ⚠️ O Esc fecha o TAB ANTES de abrir a pausa (`escape()` em `state/actions.js`), senão o menu subiria por
  cima do painel.
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
  ⚠️ **QUEM PREENCHE A SALA DO DONO É O CONVITE, NÃO O SERVIDOR** (`Room.semBots`/`abreEmAndamento`/
  `botSeed`, `ROOM.HOST_BOT_JOIN_TICKS`). "Só por convite" quer dizer o que está escrito: FECHADA, a sala
  não ganha um bot — nem no Livre (`botCount` = 0) nem no lobby do Battle Royale, e lá a guarda mora
  DENTRO de `fillTo`, que é o caminho único dos três chamadores (a largada, o passo do lobby e o fecho da
  janela); a partida começa quando a janela fecha, com quem chegou. ABERTA, ela também **não nasce em
  andamento**: `ROOM.BOT_SEED` e os tamanhos grandes existem para contar "isto já estava rolando" a quem
  cai numa sala que o SERVIDOR escolheu, e na sala que o próprio jogador acabou de abrir a história é
  falsa — ele está olhando e veria os seis nascerem de uma vez, dois deles gigantes. Então a semente é
  ZERO, ele entra sozinho e os preenchimentos chegam a cada 15–35 s (contra 6–14 s da automática): ele
  está esperando os amigos, e uma sala que se enche de bot em dois minutos é uma sala sem vaga para eles.
  ⚠️ **Zerar a semente não basta**: `botSpawnR` decide o tier pelo `f`, e é `abreEmAndamento` zerando a
  `janela` de `topUpBots` que o faz cair no `[24,58]` de sempre pelos DOIS ramos — sem isso o primeiro
  que chegasse ainda viria da cota de `SEED_MIX`, ou seja um gigante nascendo na frente do dono.
  ⚠️ Quem distingue a sala do dono da automática é **`hostUserId`**, nunca `private` sozinho: a sala de
  EQUIPE também é fechada e continua precisando de preenchimento.
  ⚠️ A tela DIZ isso (`ownPrivateNote`/`ownPublicNote`, sob a chave): sem a linha, o jogador só descobre
  a diferença depois de abrir a sala.
  ⚠️ O ceifador não recolhe a sala do dono enquanto `ROOM.HOST_HOLD_MS` não vencer (ela existe para
  esperar os amigos), e o filtro de PRIVADA mora em `RoomManager.listRooms` — não em `Room.info()`, que é
  a base do `adminInfo`.
- **AS TABELAS DO /admin ORDENAM NO SERVIDOR, E O RODAPÉ É PARTE DA MESMA ENTREGA** (`?by=&dir=`, o
  componente `Th` de `mount.jsx`, `ORDEM_USERS`/`ORDEM_AUDIT` nos repos): nenhuma tabela ordenava, e as
  duas rotas com paginação keyset pronta (`/users`, `/audit`) tinham `limit`/`before`/`next` que o cliente
  nunca usou. O contrato copia `repos/ranking.js`, que já era o ÚNICO lugar do servidor a interpolar SQL.
  ⚠️ **Lista branca em `Map`, nunca objeto literal**: com objeto, `?by=constructor` é truthy, `.expr` sai
  indefinido e a rota devolve **500** em vez de 400 — um 500 alcançável por qualquer URL. Há teste.
  ⚠️ **Nunca fallback silencioso**: `by` desconhecido é 400. Um cabeçalho dizendo "moedas ▼" sobre uma
  lista ordenada por id é exatamente o defeito que isto existe para não criar. E a resposta **ECOA**
  `{by,dir}` — a tela desenha o indicador a partir do que o servidor FEZ, o que também é a defesa de
  rollout (pod velho não ecoa, o indicador não aparece, ninguém vê ordenação falsa).
  ⚠️ **Ordenar sem mostrar a fronteira é trocar uma mentira por outra, PIOR**: o `ORDER BY` roda sobre o
  conjunto inteiro, então a tela fica CERTA — e mesmo assim um admin que rola até o fim de uma lista
  ordenada por "visto" conclui "ninguém está inativo há mais de X" tendo visto 50 de 5000, sem nada contra
  o que conferir. Por isso o rodapé (`mostrando N · há mais · Carregar mais`) entra na MESMA entrega.
  "Há mais" sai de pedir `limit+1` e devolver `limit` — nenhuma segunda consulta, e conserta de quebra o
  `next` que vinha preenchido na ÚLTIMA página.
  ⚠️ **Keyset e ordenação não se misturam**: `before` é `id<$n`, que só é posição quando a ordem é por id.
  `by=id` mantém o SQL de antes; qualquer outra ordem vira OFFSET com teto (400 `offset_max`), e `before`
  junto de outro `by` é **400 `cursor_conflict`**, nunca ignorado. O OFFSET é barato justamente aí: sem
  índice o Postgres já ordena para responder a página 1, então a sétima só paga o descarte.
  ⚠️ **As duas rotas em MEMÓRIA** (`/rooms`, `/rooms/:code`) ordenam no ponto de SAÍDA, depois do
  `concat`/`askPeers` — nunca em `Room.adminInfo`. É isso que as torna imunes a versão mista: quem ordena
  é sempre o pod que recebeu. O fragmento `/internal` sai CRU, e `/rooms` tem DOIS pontos de saída
  externos (shard único/dev e agregado) — ordenar só um faz o dev divergir da produção.
  ⚠️ **Leitura não audita**, e não é só coerência: `admin_audit` não tem retenção por decisão, e uma linha
  por clique de cabeçalho afogaria as de `ban`/`kick`, que são a razão da tabela existir.
  ⚠️ **`<button>` dentro do `th`, nunca `th` clicável**: `role="button"` num `th` destrói a semântica de
  tabela e mata o próprio `aria-sort`. `cursor:pointer` mora em `.ad-ord` (a lição de `admin.css:178`), e
  ⚠️ **`th.n{text-align:right}` PARA de funcionar** com conteúdo `inline-flex` — daí `.ad-tab th.n
  .ad-ord{width:100%;justify-content:flex-end}`, senão a coluna de números fica com o cabeçalho à esquerda.
  ⚠️ **O polling de Salas era uma armadilha**: `useEffect(…,[])` fecha sobre a ordenação INICIAL, então a
  tela reordenava no clique e voltava sozinha ao padrão 5 s depois, sem erro. `[by,dir]` nas dependências.
  ⚠️ As duas tabelas do detalhe (Partidas, Sessões) ordenam **no cliente** (`admin/ordenar.js`, puro e
  testável sem jsdom) porque o conjunto é FECHADO por `LIMIT 10/20` — e só é honesto porque o `h3` declara
  o recorte ("10 últimas"). Elas também não tinham `<thead>`: duas colunas numéricas sem rótulo.
- **A JANELA DA RETENÇÃO TROCA A PERGUNTA, E POR ISSO TROCA OS TÍTULOS** (`JANELAS` em
  `repos/analytics.js`, `?janela=`, `GET /api/admin/retencao/janelas`): o filtro era `?days=` costurado como
  `now()-($1||' days')::interval` nas SEIS consultas, e "dia atual" simplesmente não cabe nesse molde — é
  `>= date_trunc('day',now())`, um instante, não um intervalo. Daí a lista branca em `Map` (com objeto
  literal, `?janela=constructor` é truthy e a rota devolve 500 — o mesmo argumento de `ORDEM_USERS`).
  ⚠️ **Abaixo de um dia a BASE muda**: cinco dos seis painéis filtravam por `users.created_at`, e numa hora
  isso é o conjunto vazio POR CONSTRUÇÃO, não por falta de jogadores. No modo `atividade` a base é quem
  JOGOU na janela (`matches.ended_at`), o `funil` agrupa por hora e perde a coluna "jogaram" (seria 100%: a
  base É quem jogou), `primeira`/`histograma`/`algoz` medem as VIDAS da janela em vez do `n=1` de cada
  conta, e `coortes` SOME — ele compara `dia+interval '1 day'`, é diário por definição, e três colunas de
  zero se leem como "ninguém volta". `visita` é o único que não muda: ele sempre mediu atividade.
  ⚠️ **Os títulos saem do `modo` que a resposta ECOA**, nunca do que o cliente pediu — mesmo contrato do eco
  de `by`/`dir` das tabelas, e a mesma defesa de rollout: pod antigo não ecoa e a tela não anuncia um modo
  que não valeu. ⚠️ E a chave do memo virou a JANELA: com `'r'+days`, `1h` e `1 dia` colidiriam e por 60 s a
  tela mostraria o número do período errado, sem erro nenhum.
- **A FAIXA DE SHARDS DA TELA DE SALAS SÓ CONTA QUEM EXISTE** (`shardDoPeer`/`aPerguntar` em
  `http/admin.js`): `config.peers` sai de `SHARDS` (24 no ConfigMap) e quem decide quantos pods há é o HPA
  (`minReplicas: 3`). `/api/admin/rooms` perguntava a 23 irmãos a cada 5 s — 21 deles nomes que nem resolvem
  no DNS — e REPORTAVA cada falha como um chip: 21 shards "sem resposta" num cluster saudável, enquanto o
  KPI da aba AO VIVO, que já filtrava, mostrava `3/3`. O par vem do `coletor.js`, onde o motivo já estava
  escrito. ⚠️ **No aviso global a ENTREGA continua indo a TODOS os peers** — um pod que o HPA acabou de
  subir tem que receber; a sonda decide só o que se REPORTA. Filtrar a entrega trocaria um chip errado por
  uma sala que não foi avisada.
- **O PAINEL MOSTRA HÁ QUANTO TEMPO CADA JOGADOR ESTÁ NA SALA, E SÃO DOIS RELÓGIOS** (`desdeS`/`vidaS` em
  `Room.adminInfo`, `ORDEM_JOGADORES`): `desdeS` é a VISITA (`gp.entrouTick`, que o respawn não zera) e
  `vidaS` é a VIDA (`gp.joinedTick`, o `matches.duration_s`). ⚠️ É o mesmo erro que o `durouS` do `saiu` já
  cometeu: medindo pela vida, o painel dizia "40 s" de quem estava na sala havia vinte minutos em quinze
  vidas. `server/test/visita.test.js` trava os dois sentidos.
- **O DETALHE DA SALA SE ATUALIZA SOZINHO** (o 2º `useEffect` de `Salas`, em `client/src/admin/mount.jsx`):
  a LISTA já tinha o `setInterval` de 5 s; o DETALHE era o único painel da tela que só mudava por clique — e
  é justamente ele que tem os números vivos (massa, os três relógios, quem caiu, quem está assistindo).
  Ficava parado na foto do instante em que a sala foi aberta.
  ⚠️ **A dependência é `sel.code`, NUNCA `sel`**: o objeto é trocado a cada resposta, então com ele o efeito
  se desmontaria e remontaria a cada volta, reiniciando o intervalo para sempre. É a mesma armadilha do
  `[ord.by,ord.dir]` da lista, de outro jeito.
  ⚠️ **Sem chamada imediata na montagem**: quem abre já buscou (o clique, ou o `ordenarJogadores`), e uma
  chamada ali seria um segundo fetch em cima do primeiro a cada troca de ordenação.
  ⚠️ O refetch do relógio é **silencioso**: erro não vira toast (uma falha de rede a cada 5 s encheria a
  tela de avisos iguais para quem não pediu nada) e **404 FECHA o detalhe** — a sala acabou enquanto o
  administrador olhava, e insistir num painel de uma sala que não existe mais é pior que fechá-lo.
- **...E O DETALHE DA SALA TAMBÉM MOSTRA O TERCEIRO** (`users.adminBrief`, `fichaJogadores` em
  `http/admin.js`): a linha de cada jogador ganhou `total` (o acumulado da CONTA, `user_stats.play_time_s`)
  e `origem` (de onde ela veio, traduzida pelo mesmo `portais.js` da lista de contas). São TRÊS relógios
  lado a lado e cada um responde a outra pergunta: `na sala` é esta visita, `vida` é esta vida e `total` é
  "é gente nova ou veterano?" — que é o que muda o que se faz com o resto da linha.
  ⚠️ **Vêm do BANCO, não da memória do shard**, e são coladas no ponto de SAÍDA — depois do `askPeers`,
  nunca no shard dono. É o mesmo argumento que já valia para a ordenação: feito no dono, uma sala cujo
  código pertencesse a um pod em build antiga voltaria sem as colunas e sem sinal nenhum, e com 24 shards
  você acertaria 1 em 24 ao testar. ⚠️ E é ordenar DEPOIS de colar: `by=total` e `by=origem` leem campos
  que não existem antes disso. ⚠️ O salto interno PULA a consulta (`fichaJogadores(...,interno)`): sem
  isso o pod dono consulta e o de entrada consulta de novo, dobrando a leitura a cada 5 s de polling só
  para jogar a primeira fora. ⚠️ UMA consulta para a sala inteira (`= ANY`), nunca uma por linha: são até
  30 jogadores e o painel repete o fetch a cada 5 s. ⚠️ Falha do banco não derruba o detalhe — as duas
  colunas saem "—" e o resto responde; o painel de salas é ferramenta de operação e tem que abrir
  justamente quando o banco está ruim.
- **DE ONDE A CONTA VEIO, na lista de contas** (`users.origin`, `client/src/admin/portais.js`): a coluna
  existia no banco desde a 0010 e só o funil da retenção a lia. Agora ela ordena, entra no detalhe e **casa
  na busca livre** — digitar "poki" filtra por origem, o que dispensa um `<select>` que envelheceria no
  portal seguinte. ⚠️ **Quem traduz o domínio em "Poki" é o PAINEL, não o servidor**: o valor guardado é o
  `Origin` CRU, e um portal novo aparece no banco antes de qualquer código nosso conhecer o nome dele — o
  desconhecido sai pelo próprio host, que ainda diz de onde veio. Casamento por host exato ou sufixo, nunca
  `includes` (a lição do `cors.js`), e **isto não é um portão**: quem decide quem fala com a API continua
  sendo o `ALLOWED_ORIGINS`.
- **OS FILTROS DE `/admin/usuarios` NÃO FUNCIONAVAM, E ERAM DUAS LINHAS DE FRONT** (`mount.jsx`): (a)
  `onClick={buscar}` passava o EVENTO do clique como primeiro argumento de `buscar(cursor=null)`; o evento é
  truthy, então o botão caía no ramo de "carregar mais" e **emendava** a lista em vez de trocá-la — o
  sintoma é indistinguível de "o filtro não funciona" (escolher `banidos`, clicar, e ver as linhas antigas
  continuarem no topo). Pelo Enter sempre funcionou, e era isso que fazia o defeito parecer intermitente.
  (b) O `useEffect` dependia só de `[ord.by,ord.dir]`, então trocar `kind`/`banned` no `<select>` mudava o
  state e não refazia a busca. O servidor estava certo o tempo todo, e com teste.
- **A TELA DE RETENÇÃO** (`repos/analytics.js`, `GET /api/admin/retencao`, migração 0010): "o jogador fica
  3 minutos?" era pergunta sem resposta — não por falta de dado, mas por falta de quem perguntasse.
  ⚠️ **A resposta é a VISITA, não a vida**: `matches` guarda uma linha por VIDA, e no Livre morrer e
  renascer abre outra. A visita é reconstruída agrupando as partidas por intervalo (>30 min = visita nova)
  com `lag()` + soma cumulativa — sem coluna nova e sem evento novo.
  ⚠️ O que a 0010 acrescentou é só o que faltava: `killer_kind` (o que separa "morreu para um bot" de
  "morreu para o cenário" — `killed_by_user_id` é NULL nos dois), `killer_mass` (a razão com `max_mass` é
  o número que acusa ou inocenta os dois gigantes que a sala semeia), `how` (já resolvido em
  `Sim._feedMorte` para o kill feed e **jogado fora**) e `users.origin` (fatiar o funil por portal).
  ⚠️ `ADD COLUMN` sem DEFAULT, zero backfill, zero CHECK: no PG 9.6 isso é metadado, e o ALTER roda no
  BOOT do pod — passando de 3 s os joins caem em `unsaved` e a partida deixa de ser gravada EM SILÊNCIO.
  ⚠️ **`purgeOrphanGuests` apagava a coorte da pergunta**: agora quem JOGOU nunca é apagado (o horizonte
  real nunca foi 30 dias — o token de device dura 365 e desliza).
  ⚠️ O pool é **o mesmo do jogo**: `days` limitado a 90, `statement_timeout` local e memo de 60 s. Um
  `days=365` curioso é um incidente.
  ⚠️ Os contadores de `metrics.js` (`vida`, `spawn`) existem porque enxergam o que o BANCO não grava
  (banco fora, `unsaved`) — mas são por POD e zeram no restart: sanidade, não medição.
  ⚠️ `_spawnPiece` ignora o `s.ok` do `_farSpot` há sempre; em vez de consertar às cegas, `metrics.spawn`
  MEDE. Baseline tirada com o spawn quebrado mede o bug, não o jogo.
- **VIDA, SESSÃO E VISITA SÃO TRÊS COISAS, E O JOGO MEDIA A VIDA NAS TRÊS** (`portal/sessao.js`,
  `gp.entrouTick`, o CTE da `visita` em `repos/analytics.js`): a Poki mandou testadores, o `/admin` AO
  VIVO mostrava todos retidos jogando, e o relatório DELES dizia que saíram em poucos segundos. Não era
  a tela de morte informando errado — era a MORTE, tratada como fim de sessão em TRÊS lugares
  independentes, e nos três a causa é a mesma: `matches` guarda uma linha por VIDA, e num agar a vida
  dura 15–40 s.
  ⚠️ **(1) O funil da Poki.** `survival/60s|120s|180s` abria em `onConnection` e fechava em `onDead` com
  o `durationS` da vida. Como renascer virou `{t:"respawn"}` na MESMA conexão, o `start` nunca mais
  reabria: 3 aberturas para N×3 fechamentos, quase todos `fail`. Hoje é `session/60s|180s|300s`, o
  relógio é da CARGA DA PÁGINA, corre enquanto o jogador está RETIDO (`game`/`dead`/`round` — tela de
  morte e pódio contam, ele está na sala) e só existe `complete`: num funil de progressão quem não
  completou É a evasão, e era o `fail` explícito que enchia o painel de abandono que não existiu.
  ⚠️ **(2) O `durouS` do painel AO VIVO** saía de `gp.joinedTick`, que `Sim.revive` zera — "saiu · 40s"
  de quem ficou vinte minutos em quinze vidas. Nasceu `gp.entrouTick`, escrito no nascimento e nunca
  mais: `joinedTick` continua sendo a VIDA (é o `matches.duration_s`, e os quatro consumidores dele não
  mudaram) e `entrouTick` é a VISITA. ⚠️ O aviso em cima de `Sim.revive` manda zerar todo campo de `_mk`
  que seja por vida — `entrouTick` é o CONTRAEXEMPLO, está escrito lá, e `server/test/visita.test.js`
  existe porque quem seguir a instrução ao pé da letra refaz o bug sem nada ficar vermelho.
  ⚠️ **(3) A visita da tela de Retenção** era `sum(duration_s)`: quem morria aos 30 s, assistia 4 min e
  morria aos 30 s aparecia como UM MINUTO — o tempo entre as vidas era usado para AGRUPAR e nunca
  somado, ou seja a tela descontava justamente a parte da sessão em que a pessoa está lá olhando. Agora
  há dois relógios lado a lado (`s_visita` de parede e `s_jogo`), e a distância entre eles é a tela de
  morte, o pódio e o anúncio. ⚠️ O fim de uma vida é `started_at + duration_s`, **nunca `ended_at`**:
  aquele é o `now()` do INSERT e a fila tem backoff de até ~5 min, o que encolhia o intervalo percebido
  e grudava visitas separadas. ⚠️ E `GREATEST(..., sum(duration_s))` porque duas abas da mesma conta
  jogam ao mesmo tempo — sem ele a tela mostra visita mais curta que o tempo jogado, e ninguém explica.
  ⚠️ **O join RECUSADO não é uma vida** (`hooks.dropSession`): a sessão nasce em `onPlayerJoin`, antes de
  se saber a sala, e os becos do `wsServer` fechavam com `onMatchEnd({durationMs:0})` — linha real em
  `matches` que ainda somava 1 no `games` do perfil, e que virava "a primeira vida" do novato porque as
  consultas tomam a de menor `id`. Duas saídas de lá não fechavam NADA (o socket que cai esperando e o
  `catch`), e essas eram piores: a sessão ficava no Map até o `onShutdown` gravá-la com a duração do
  PROCESSO INTEIRO. Hoje há uma variável `aberta` no escopo do join e um descarte único no `finally`,
  zerada no `room.join` — as sete saídas ficam cobertas por construção, e não por lembrança.
- **O QUE MATAVA O NOVATO ERA A PRÓPRIA SALA** (`ROOM.SEED_R`/`SEED_MIX`, `BOT.SPAWN_GRACE_TICKS`,
  `recemChegado` em `physics/rules.js`, `bonusHumano` em `bot.js`): a Poki mandou testadores e o
  relatório dizia que eles saíam em segundos. A primeira suspeita foi de medição — e havia mesmo um
  defeito de medição, grande, consertado no bloco acima —, mas as GRAVAÇÕES de tela deles (jogadores
  reais, build já corrigido) mostravam 17 s, 31 s, 36 s, 38 s, 1 min 15, 2 min 19. O abandono era real,
  e o painel de Errors deles inocentava a técnica: `webglcontextlost` em 4 gameplays e `Failed to fetch`
  em 13, ambos com impacto estimado <1%.
  ⚠️ **Quem acusou foi o nosso próprio `algoz`** (a consulta que `docs/spec/admin.md` descreve como "o
  número que acusa ou inocenta os dois gigantes que a sala semeia"). Em 14 dias, 4.256 contas novas:
  mediana da PRIMEIRA vida **31 s**, 49% dela abaixo de 30 s, 75% sem passar do primeiro minuto. E o
  algoz mais comum, com 1.428 mortes, é um PREENCHIMENTO de **41.447 de massa contra 6.766** — razão
  6,1×, aos 46 s. Aqueles 41 mil são exatamente `SEED_R[0]`: r 200–250 é massa 40.000–62.500.
  ⚠️ **Três causas somadas, e nenhuma sozinha explicava**: a sala semeava DOIS gigantes desse tamanho
  para parecer "em andamento"; `HUMAN_BONUS` (1,5) fazia todo bot, inclusive esse, PREFERIR a presa
  humana; e a graça de spawn era de 7 s e só impedia o bot de ESCOLHER o novato — nunca impediu a
  colisão, então o recém-nascido que andasse para cima do gigante morria igual.
  ⚠️ O conserto foi nas três: `SEED_R[0]` caiu para r 140–180 (~metade da massa) e `SEED_MIX` de 2 para
  1 gigante; `bonusHumano(r)` só dá o bônus abaixo de `BOT.HUNT.BONUS_MAX_R`, então o grande escolhe
  pelo que está perto e gordo como qualquer um; e `SPAWN_GRACE_TICKS` foi a 15 s **e passou a valer na
  FÍSICA** — `recemChegado` em `piecePair` impede um bot de engolir humano sob graça, e o grande
  ATRAVESSA (sem quique: chutar pelo mapa alguém que não pode revidar é o mesmo defeito de outro jeito).
  ⚠️ **Só BOT × HUMANO, e nesse sentido.** Entre pessoas nada muda — proteger disso seria inventar
  invulnerabilidade num .io —, e quem está sob a graça continua podendo comer. `shared/test/novato.test.js`
  trava os quatro sentidos, e o teste é sensível: tirar a linha de `piecePair` o deixa vermelho.
  ⚠️ **Nada disso é espelhado em `predict.js`**: ele prevê as peças PRÓPRIAS e não decide quem come quem.
  ⚠️ E o que NÃO é o problema: pela origem Poki, das 2.512 contas que jogaram num dia, 685 (27%) passaram
  de 3 min somando vidas e 1.377 voltaram para uma segunda. O jogo prende quem sobrevive ao primeiro
  minuto — o funil quebra ANTES disso, e é por isso que a alavanca é o primeiro encontro, não o resto.
- **O PRIMEIRO ENCONTRO TINHA DOIS DEFEITOS, E CONSERTAR UM REVELOU O OUTRO** (`BOT.NOVATO_MASS`/
  `NOVATO_RATIO`, `rules.recemChegado`, `bot.js:novatoProtegido`; medido em 07/09/2026 nos jogadores dos
  Fit Tests da Poki). O bloco acima trata do primeiro; este é o que apareceu depois dele.
  ⚠️ **(1) O NOVATO NÃO ENCONTRAVA NINGUÉM.** Dos que jogam UMA vida só (45% de todos), **61,8% saíam
  VIVOS** — `cause='left'`, aos 53 s, tendo crescido de 900 para 4.006 de massa —, com **81% sem um
  abate e 79% sem nunca apertar dividir**. Não era dificuldade: era um mapa vazio. A conta: 12000×12000
  com 32 planetas, e um celular em pé (390×844, ΣR=30, `CAM.PORTRAIT_K` 1.12) enxerga 0,47% do mapa →
  **0,15 outros planetas na tela**, ou seja 87% do tempo sozinho. O agar.io (14142, ~200 planetas) dá
  **0,67**. Por isso subir `ROOM.BOTS` de 24 para 32 não mediu nada: levou de 0,11 para 0,15, e os dois
  são "ninguém". A densidade sobe por `ROOM.BOTS`, por `CAM.PORTRAIT_K` (área ∝ pk²) e por `WORLD.LADO`
  — este último só no BOOT e ⚠️ sem reescalar comida, cinturões nem estrelas, então o perigo adensa junto.
  ⚠️ **(2) RESOLVIDO O ENCONTRO, O NOVATO PASSOU A SER ATROPELADO.** Com 50 planetas e `PORTRAIT_K` 1.5,
  o encontro subiu de 63% para 86% de primeiras vidas comidas e o largar-por-tédio caiu pela metade
  (54,2% → 33,5%) — mas a mediana da 1ª vida caiu de 35 s para 25 s, os abates zerados SUBIRAM (91,1% →
  95,8%) e o algoz mediano passou a ter **8× a massa** da vítima, com 45,8% acima de 10× e **79,6% deles
  sendo preenchimento**, contra uma vítima de 1.560. Trocar "morre de tédio sozinho" por "é atropelado em
  25 s" não é progresso.
  ⚠️ **A GRAÇA POR TEMPO ERA UM PENHASCO, e o histograma mostrava o degrau**: pico de **6×** na faixa
  15–19 s (118 mortes contra 19 na faixa anterior), 88–93% comido — exatamente `SPAWN_GRACE_TICKS` (900
  = 15 s). Ela não ensinava nada, só adiava: a 448 px/s um novato cruza 6.700 px em 15 s e chega ao fim
  dela no meio da multidão. Hoje ela deixou de acabar só por TEMPO — passada a janela, vale a RAZÃO DE
  MASSA (`NOVATO_RATIO` 4×) enquanto a pessoa estiver abaixo de `NOVATO_MASS` (6000, r≈77).
  ⚠️ **4× e não 2×**: `EAT.RATIO` é 1,15 de RAIO = 1,32 de massa, então entre 1,32× e 4× o bot continua
  comendo — a briga apertada é o jogo, e o que a regra mata é só o atropelamento, onde não havia decisão
  que o jogador pudesse ter tomado. E continua **só BOT × HUMANO**: entre pessoas nada muda.
  ⚠️ **E A RAZÃO DE MASSA É DO LIVRE, SÓ DELE** (guarda `w.zoneNow()`, a mesma que tira o berçário da
  supernova do BR em `world.js:345`). No Battle Royale **não existe novato**: todo mundo começa igual, no
  mesmo tick, não há respawn, e ficar pequeno é RESULTADO da partida, não a condição de quem acabou de
  chegar. Sem a guarda, quem encolhe vira FANTASMA e atravessa a sala inteira — visto em partida, e não é
  só estranho na tela: o BR é decidido por sobrevivência, então dava para chegar ao fim sem poder ser
  comido. A graça por TEMPO continua valendo nos dois modos (é pré-existente e, na largada do BR, todos
  têm a mesma massa, então ela não decide nada).
  ⚠️ **A COMPARAÇÃO É ENTRE OS JOGADORES, NUNCA ENTRE AS PEÇAS — e isto já esteve errado aqui.** A
  primeira versão comparava as peças que colidem, com o argumento de que "um bot gigante partido em 16
  tem cada peça no tamanho de briga honesta". O dado desmentiu no mesmo dia: 21% das mortes abaixo de
  `NOVATO_MASS` continuavam com algoz acima de 4× (razão mediana 6,0) — e era DEDUTÍVEL, porque
  `max_mass` é o pico da vida, então um algoz registrado acima de 4× que escapou da regra só pode ter
  estado dividido. Um bot de 30.000 em 16 pedaços tem peças de ~1.900, e contra um novato de 2.000
  nenhuma chega ao teto: "dividir" virava o contorno da regra. Quem é gigante é o JOGADOR.
  ⚠️ O preço, aceito: o gigante dividido não engole o novato que estiver entre as peças dele — ele
  atravessa, como já atravessava inteiro. A alternativa era deixar a técnica mais básica do agar servir
  de contorno para a única proteção que o novato tem.
  ⚠️ **`bot.js` TEM QUE CONCORDAR** (`novatoProtegido` espelha `recemChegado`): divergindo, o gigante
  persegue alguém que ele só vai ATRAVESSAR, e um planetão colado no novato sem nada acontecer lê pior
  que ser comido. Ele usa `massOf` pelo mesmo motivo — com a aproximação por `r²` da maior peça, o bot
  partido voltaria a escolher como presa justamente quem ele não pode comer.
  ⚠️ `massOf` percorre as peças, então nas duas as chamadas vêm DEPOIS das guardas baratas: o par de
  colisão só chega nelas quando um preenchimento está prestes a engolir uma pessoa.
  ⚠️ Sem espelho em `predict.js`, que prevê as peças PRÓPRIAS e não decide quem come quem.
  ⚠️ **OS TRÊS NÚMEROS SÃO TUNABLES** (grupo "Proteção do novato": `BOT.SPAWN_GRACE_S`, `BOT.NOVATO_MASS`,
  `BOT.NOVATO_RATIO`), e isso é decisão de PRODUTO, não conveniência: a regra apaga um atropelamento que o
  jogador não tinha como evitar, e em troca põe na tela um gigante ATRAVESSANDO alguém — que num .io lê
  como defeito. Os dois lados são reais, e nenhum número decide sozinho o segundo, então quem decide é o
  dono do jogo com o painel de Retenção na frente (mediana da primeira vida, % que sai sem um abate, razão
  de massa do algoz) — sem deploy e sem reiniciar sala nenhuma.
  ⚠️ O interruptor é o MÍNIMO ZERO dos dois primeiros: `SPAWN_GRACE_S`=0 mata a graça por tempo
  (`tick-spawnTick<0` é falso) e `NOVATO_MASS`=0 mata a razão de massa (`ms<0` é falso). `NOVATO_RATIO` não
  desliga nada — ele é o QUANTO, e o sentido inverte fácil: número MAIOR é MENOS proteção. Piso 1,5 porque
  `EAT.RATIO` (1,15 de raio = 1,32 de massa) já é o chão em que qualquer planeta engole.
  ⚠️ **DESLIGAR PELA METADE É PIOR QUE NÃO DESLIGAR**: zerar só a razão devolve o PENHASCO de relógio —
  intocável até os 15 s, comida no tick seguinte. São as duas ou nenhuma, e `shared/test/novato.test.js`
  trava os dois sentidos (o interruptor devolve o atropelamento e religa; zerar só um devolve o degrau).
  ⚠️ Escopo `server`, apesar de a regra morar em `physics/rules.js`: `predict.js` importa `DT, WORLD,
  BLACKHOLE, EJECT, PLAYER` e nada mais. E `bot.js:novatoProtegido` lê o MESMO objeto `BOT`, então o cérebro
  acompanha a troca no mesmo tick — sem isso o bot perseguiria alguém que ele só vai atravessar.
- **A PRIMEIRA VIDA GANHOU UMA MISSÃO DE TRÊS ETAPAS** (`passoMissao` em `game/dica.js`): coma as pedras →
  coma o planeta pequeno → divida. A dica do dividir ensinava a ÚLTIMA coisa que um novato precisa saber, e
  só aparecia para quem já tinha chegado ao portão — um terço deles. As duas etapas antes dela são as que
  o resto nunca recebia.
  ⚠️ **A INVARIANTE É A FORMA DO RETORNO**: `banda` é uma STRING SÓ, então "no máximo uma faixa de texto
  por vez" deixou de ser disciplina do chamador e virou impossível de violar.
  ⚠️ `passoDica` e `temPresa` **não mudaram uma linha** — a etapa 3 é a dica de hoje, DELEGADA, e o teste
  que já existia é a prova. `temComivel` é o mesmo laço SEM o portão do split (comer alguém menor não pede
  `SPLIT.MIN_R`, pede só ser maior).
  ⚠️ **CONTAR AS 8 PEDRAS É NO CLIENTE, no evento que já toca o som** (`onVanish`, `KIND.FOOD` +
  `REMOVE.EATEN` + proximidade de `own0`): não existe contagem de comida no protocolo (o `self` é de
  tamanho fixo e `EVENT.EAT` é só de peça de JOGADOR), e aquela linha já era a única que sabe dizer "fui EU
  que comi este grão". Separar as duas produziria uma faixa que completa sem o jogador ter ouvido nada.
  **Massa e score foram descartados com conta**: `EAT.FOOD_GAIN` sobre grãos de 36 a 225 de massa, DOBRADO
  pelo banquete de nascença, dá 8 grãos valendo de 46 a 576 — 12,5× de espalhamento sobre uma base de 900;
  ~12,5% dos grãos (munição, powerup) não dão massa nenhuma; e `PLAYER.DECAY` faz a massa andar PARA TRÁS.
  ⚠️ "Comi alguém" é `EVENT.EAT` com `slotA === view.mySlot` — `slotA` é QUEM COMEU, o evento sai para toda
  peça engolida (morder um pedaço de alguém dividido conta) e não há falso positivo (peça própria é
  `MERGE`, aliado não é comível).
  ⚠️ **"Só na primeira vida da sessão" é o OPOSTO do que `dicaEst` faz**, e a conciliação é: o zeramento
  por vida CONTINUA sendo o mecanismo — o que muda é o VALOR INICIAL, lido de um `sessionStorage` com
  try/catch (ele LANÇA em janela anônima e em origem opaca; sem storage a missão reaparece, que é a
  degradação aceitável). A marca é escrita na morte e no `leave`, este **guardado por `was`**: `join()`
  chama `game.leave(true)` na primeira linha, e sem a guarda a própria entrada marcaria a sessão.
  ⚠️ O veterano entra na **etapa 3**, nunca em "fim": as etapas 1 e 2 ensinam o óbvio para quem já viveu,
  mas a dica do dividir está em produção com dado medido atrás dela.
  ⚠️ **`#t-split.dica` passou a exigir `h.dica.id === "split"`**, e essa linha é a regressão mais provável
  da entrega inteira: a classe liga o pulso do botão de DIVIDIR, e enquanto a única dica do jogo era a do
  split isso acertava por acidente. Com três etapas, "coma as pedras" faria o botão pulsar para um novato
  de r=30 — anunciando um comando que o servidor recusa.
- **O PORTÃO DO DIVIDIR ESTAVA ACIMA DO TETO DO NOVATO** (`SPLIT.MIN_R` virou tunable de escopo `wire`,
  grupo "Proteção do novato"; a dica em `client/src/game/dica.js` + `ui/DicaSplit.jsx`): a física torna o
  salto OBRIGATÓRIO para matar alguém — `vmax = 2110,6/r^0,449` faz a presa ser sempre mais rápida que o
  predador (ser maior é a condição para comer, e ser maior é ser mais lento), então perseguir não é
  difícil, é IMPOSSÍVEL. É o mesmo argumento que `bot.js:_plan` já usava para tratar o salto como a arma
  principal. Só que `MIN_R`=60 exige **massa 3.600** e o jogador nasce com 900.
  ⚠️ **Medido nos jogadores da Poki (554 primeiras vidas): o pico de massa mediano é 2.214, e 64,6% NUNCA
  chegam a poder dividir.** Entre esses, **97,8% não fazem um único abate** — não por falta de habilidade,
  mas porque a única ferramenta de alcance está trancada. Dos 35,4% que chegam ao portão, só 25,5% usam;
  o produto disso (≈9%) bate com os 10% que "mataram alguém na 1ª vida", que é o grupo que fica (54%
  chegam a 3 min, contra 22% de quem não fez nada).
  ⚠️ O número não vira decisão de engenharia: `SPLIT.MIN_R` é PARÂMETRO, como os três da proteção do
  novato e pelo mesmo motivo — baixá-lo dá a mecânica central a quem ainda está decidindo se fica, e em
  troca põe peças menores em campo. Quem decide é o dono do jogo com o painel de Retenção na frente.
  ⚠️ **Escopo `wire`, não `server`**: quem aplica `MIN_R` é `rules.applySplit` e `bot.js`, mas a DICA roda
  no cliente e precisa do MESMO número — anunciar um botão que o servidor recusa é pior que não ensinar.
  `predict.js` importa `DT, WORLD, BLACKHOLE, EJECT, PLAYER` e **não** SPLIT, então isto não é física do
  cliente: é o caso de `CAM.K` e `STAR.PASS_R`. Por isso `SPLIT` entrou em `RAIZES_WIRE` (`game/index.js`).
  ⚠️ **O piso é 44 e é derivado**: o filho de um split tem `r/√2`, e abaixo de 44 ele nasceria MENOR que
  `PLAYER.START_R` (30) — o jogador produziria de propósito uma peça menor que um recém-nascido.
  ⚠️ **Dependência cruzada com `STAR.PASS_R`**, hoje em 0 (o esconderijo na estrela está desligado): se ele
  voltar a valer 40, `MIN_R` abaixo de **56,6** devolve o exploit de se picar para caber dentro da estrela
  — é o `40 < SPLIT.MIN_R/√2` de `constants.js:545`. Mexer num obriga a conferir o outro.
  ⚠️ **A DICA só aparece para quem PODE dividir** (`r >= SPLIT.MIN_R`) e com presa ENGOLÍVEL dentro de
  `SPLIT.DIST` — os dois números são do jogo, e sem eles a frase mentiria. Ela some no primeiro split
  (`dividiu`, por VIDA, zerado nos MESMOS pontos que `morte`/`brMudo`: `join`, `leave` e `{t:"alive"}`) e
  tem teto de `DICA.MAX` por vida, senão vira parede.
  ⚠️ `SPLIT.MIN_R` é lido A CADA CHAMADA em `dica.js`, nunca capturado na carga do módulo: o `aplicaWire`
  do `room` o reescreve em cima do objeto de `constants.js`, e capturado o cliente anunciaria o portão do
  BUILD enquanto o servidor usa o do painel.
  ⚠️ A varredura da presa é sobre `view.pieces` (a AOI que o render já percorre) e roda a 8 Hz dentro do
  `pushHud` — não é laço novo no frame. Aliado sai fora: saltar no companheiro não é a lição.
  ⚠️ O CSS anima `opacity` e **`translate`**, nunca `transform`: o elemento se posiciona com
  `translateX(-50%)`, e um keyframe terminando em `transform:none` o apagaria para sempre — é o defeito
  que jogou a tela de morte metade para fora do celular.
  ⚠️ E o que a dica NÃO resolve: os 64,6% que não alcançam o portão. Para eles não há frase que ajude —
  só o parâmetro.
- **PAINEL /admin** (`docs/spec/admin.md`): rota da MESMA SPA, chunk sob demanda (`main.jsx`, o padrão do
  `?sfx`) — nenhuma linha de infraestrutura muda. Um admin é uma CONTA (`users.is_admin`, migração 0008),
  porque o `RESOLVE_SQL` do token já faz `SELECT u.*` e a coluna chega de graça, e porque sem identidade
  não há auditoria que sirva. ⚠️ O token do painel é de outro `kind` (`admin`, 12 h): roubar a aba do jogo
  de um administrador NÃO abre o painel. ⚠️ `server/src/api/index.js` tem um `PREFIXES` que é um gate
  silencioso — rota `/api/admin/*` ausente dele não chega ao handler e cai em 404 sem uma linha de log.
  ⚠️ E há DOIS padrões de fan-out que não podem ser trocados: sala **roteia pelo dono** (`askPeers`),
  aviso e parâmetro **difundem** (`tellPeers`, que devolve o que CADA irmão respondeu, com as falhas — um
  broadcast feito com `askPeers` entregaria a um shard e diria "ok").
- **O PAINEL AO VIVO** (`server/src/admin/{bus,coletor}.js`, `client/src/admin/{AoVivo.jsx,vivo.js}`,
  `ADMIN_BUS` em constants; a spec inteira em `docs/spec/admin.md`): o `/admin` tinha UMA atualização
  automática — a tela de Salas, `setInterval(…,5000)` — e nenhum EVENTO. Quem entrou, quem matou quem, quem
  falou e quem denunciou já existiam e morriam dentro do pod, e o `metrics.snapshot()` (tick p99, KB/s,
  joins por versão, curva de vida) só saía pelo `/healthz`, por pod, sem ninguém consultar. A tela nova é
  uma torre de controle: KPIs em cima, e embaixo shards · salas · o fluxo. UM SSE (`/api/admin/live`) num
  shard qualquer, que vira COLETOR e pergunta aos 23 irmãos a cada segundo por `tellPeers`.
  ⚠️ **`bus.on` É UM CAMPO, NÃO UMA FUNÇÃO, e essa distinção é o desenho inteiro.**
  `bus.publica('kill',{a,b})` ALOCA o literal no ponto de chamada ANTES de entrar na função, então um guard
  interno não salva nada no caminho de 60 Hz. No quente é `if(bus.on){bus.publica(...)}` — leitura de campo,
  o objeto nem nasce; no frio (join/leave/chat/report) o guard interno basta. O barramento nasce DORMINDO, a
  própria coleta é o sinal de "tem alguém olhando", e um relógio de 1 Hz o rebaixa depois de `AWAKE_MS`.
  Sem ninguém no painel, o custo em produção é uma comparação por linha de feed.
  ⚠️ **Ele escuta `Sim._feed`, NUNCA `Room.broadcastFeed`.** Aquele passa por `drenaFeed`, que corta em
  `FEED.MAX_PER_FLUSH`=4 e DESCARTA o resto — num fecho de gás as linhas descartadas são justamente as que
  o administrador quer ver. O teto é de UI do JOGO (não virar parede no canto da tela) e continua sendo;
  o painel não pode herdá-lo. `server/test/feed.test.js` trava a ordem "espelho antes do corte".
  ⚠️ **`joined`/`left` do feed não são publicados**: o painel tem `entrou`/`saiu` próprios, que sabem mais
  (conta, duração, abates, e a CAUSA — que distingue kick de desistência). Com os dois, cada entrada virava
  duas linhas, uma mais pobre. E a guarda `_voltouAgora` não vale aqui: o re-join em laço é exatamente o
  padrão que o administrador procura.
  ⚠️ **`epoch|0` NÃO CABE**: o epoch é um `Date.now()` e passa de 2³¹, então truncá-lo faz o cursor nunca
  mais bater e o painel anuncia `lacuna:-1` ("este shard reiniciou") UMA VEZ POR SEGUNDO, num pod que não
  reiniciou. Medido em dev antes de ir ao ar. Pelo mesmo espírito, cursor ZERO é ESTREIA e não atraso —
  senão abrir o painel pediria 24 anéis cheios e ainda diria "perdi 1024 eventos" a quem chegou agora.
  ⚠️ **A ordem entre shards é arbitrária dentro da janela de 1 s**, total só DENTRO de um shard: ordenar
  por `at` faria o fluxo ANDAR PARA TRÁS, porque os relógios dos 24 pods não são sincronizados o bastante.
  ⚠️ **`X-Accel-Buffering: no`** (senão o nginx entrega em blocos de 4 KB: "nada por três minutos e aí 200
  linhas") e **`req/res.setTimeout(0)`** (o `requestTimeout` do Node mata em 300 s — funciona quatro
  minutos em dev e morre em produção sem erro). E **`fetch`+`ReadableStream`, nunca `EventSource`**: ele
  não manda `Authorization`, e token de 12 h com poder de kick na query string vai parar no access log.
  ⚠️ **O laço de fan-in é por POD, não por stream** — é isso que faz dez abas de F5 custarem O(1); o teto
  de streams responde 503 (capacidade: reconecte noutro shard) e não 429 ("espere"), porque o `/api` é
  balanceado. Nada de `ADMIN_BUS` é tunable: um painel que ajusta o próprio transporte é um jeito de se
  trancar para fora do painel.
  ⚠️ **NENHUM ESTADO VAI SÓ NA COR** (`client/src/admin/vivo.js`, o bloco `ICONE`). Medido com o validador
  de paleta: o verde `#3ddc5f` e o âmbar `#ffb020` dos tokens ficam com ΔE **6,7** em protanopia — quem
  enxerga assim não distingue os dois. Então o número ou a palavra sempre dizem (`24/24`, `ok`/`com
  falha`), e cada linha tem ícone E frase. ⚠️ E os ícones são **glifos de TEXTO**: `⚔`, `☠`, `💬`, `⚠` e
  `🏆` têm apresentação EMOJI, e a fonte de emoji desenha em cores PRÓPRIAS — ela IGNORA o `color` do CSS,
  e a codificação por grupo simplesmente deixa de existir, sem nada acusar (além de o `⚔` virar um "x"
  borrado a 13 px). ⚠️ O prefixo CSS é **`lv-`, nunca `live-`**: `.live`/`.live-*` estão nas mesmas listas
  cosméticas de bloqueador que já apagaram a tela inteira uma vez pelo `ad-wrap`.
  ⚠️ O flush é de 4 Hz sobre um anel em `useRef` — o stream NUNCA chama `setState` —, e a aba escondida
  para de RENDERIZAR, nunca de receber. E há um **cão de guarda**: um SSE morre sem evento nenhum (proxy
  ocioso, aba congelada, wifi trocando) e sem ele a torre congela numa foto que o operador ACREDITA, que é
  pior que a tela em branco. O heartbeat `:` conta como toque, senão uma noite calma derruba a conexão.
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
- **A TELA DE PARÂMETROS TEM ABAS LATERAIS** (`Parametros` em `client/src/admin/mount.jsx`, o bloco
  "AS ABAS DOS GRUPOS" de `admin.css`): a lista passou de 28 para 40 parâmetros em 10 grupos, e uma página
  corrida punha o teto do ímã ao lado do tamanho do mundo como se fossem a mesma decisão. As abas saem do
  MESMO descritor que já dava as seções (`GRUPOS`), então grupo novo aparece sem uma linha de painel — e
  cada aba mostra quantos itens tem e quantos estão fora do padrão.
  ⚠️ **Com BUSCA no ar a aba é ignorada** e todos os grupos que casam aparecem: quem digita num campo
  "filtrar…" espera achar a chave onde quer que ela esteja, não "nada com esse nome" porque o resultado
  caiu na aba de trás.
  ⚠️ A aba ativa é resolvida a cada render contra a lista VISÍVEL (`visiveis.includes(aba)`): o `carregar()`
  troca `grupos` inteiro depois de cada gravação, e um grupo que sumiu deixaria a tela vazia.
  ⚠️ `minmax(0,1fr)` na coluna da direita, nunca `1fr`: item de grid nasce com `min-width:auto` e a grade
  de cartões empurraria a largura da PÁGINA em vez de encolher.
  ⚠️ O `sticky` da coluna de abas só funciona por causa do conserto do `#app{overflow}` na camada 1 — antes
  dele, toda sticky do painel morria em silêncio.
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
- **...E ELE SÓ APARECE PARA O ADMINISTRADOR** (`ENTRA_SAI` em `client/src/ui/KillFeed.jsx`): para quem
  joga, "entrou/saiu" nunca respondeu a uma pergunta — numa sala do Livre o vaivém é constante e essas
  linhas empurram para fora justamente o que interessa, porque `drenaFeed` corta em `FEED.MAX_PER_FLUSH`
  e a coluna tem quatro linhas de altura. ⚠️ Quem modera continua vendo por DOIS caminhos independentes:
  a aba AO VIVO do painel tem `entrou`/`saiu` próprios (que sabem mais — conta, duração, abates e a
  causa) e o administrador que está DENTRO da partida continua com a linha no canto da tela, que é onde
  ele está olhando. ⚠️ O corte é no CLIENTE e não em `Room._pushFeed`: no servidor o feed é um só,
  difundido à sala inteira, e filtrar por sessão custaria uma fila por jogador para poupar ~60 bytes por
  entrada — e o administrador jogando se perderia junto. ⚠️ Os outros `sys` (`start`, `few`, `zone`,
  `crunch`, `lead`) continuam valendo para todo mundo: o filtro nomeia `joined`/`left`, nunca `k==='sys'`.
- **O LOG DE QUEM ENTRA E QUEM SAI** (`Room.join`/`leave` → `{k:'sys',how:'joined'|'left'}` no feed): reusa
  o kill feed, que já é JSON de controle sem AOI, já tem a linha de SISTEMA com ícone e molde de texto, e
  já mora no canto direito. Nenhuma linha de `KillFeed.jsx` mudou.
  ⚠️ **É de GENTE por construção**: preenchimento nunca passa por `join`/`leave` (nasce em `_nasceBot`), o
  mesmo mecanismo que mantém o roster do dono limpo — e é isso que preserva o `anonBots` do BR sem um
  filtro a escrever. **Não** instrumentar `trimBots`/`_nasceBot`.
  ⚠️ **A linha de SAÍDA leva o `name` junto** (`it.name` ganha do `playerOf` em `pushFeed`): quem saiu já
  não está em `view.players`, e o PLAYERS sem o slot pode chegar antes da leva do feed.
  ⚠️ **`FEED.JOIN_QUIET_MS` existe porque no Livre RENASCER É `leave`+`join`** — o botão DE NOVO fecha o
  socket e abre outro —, então sem a guarda cada morte de cada jogador produzia duas linhas. A chave é a de
  `_rosterKey` (a mesma que resolve "a mesma pessoa entre vidas") e a guarda mora DENTRO de `join`/`leave`,
  nunca nos chamadores: há três caminhos até lá (o quit, o re-join que troca de sala e o roubo de sessão
  pelo `resume`). Queda de rede **não** é saída: ela cai em `detach` e só vira `leave` no `housekeeping`.
  ⚠️ `drenaFeed` descarta `sys` primeiro (teto `MAX_PER_FLUSH`): num fecho de gás com 4 abates é o
  "entrou/saiu" que some. É o comportamento certo.
  ⚠️ **A frase "no Livre RENASCER É `leave`+`join`" DEIXOU DE SER VERDADE** — ver o bloco abaixo. O
  `JOIN_QUIET_MS` continua, mas cobrindo só trocar de sala e o roubo de sessão pelo `resume`; e o
  `joined` passou a ser suprimido no LOBBY também, que é o simétrico do `left` (o `_avisaAdmins` fica
  FORA dessa guarda: "entrou gente" vale igual na fase de espera).
- **A ARQUIBANCADA PREFERE GENTE** (`Room.humanosVivos`, lido por `spectateTargetFor` e `spectatePick`):
  a câmera andava pelo PLACAR, que conta o preenchimento — e no Livre ele é a maioria esmagadora da sala,
  então as setas ‹ › gastavam quase todas as paradas num robô. Assistir a um bot é assistir a ninguém: o
  nome não diz nada a quem olha e não há o que aprender.
  ⚠️ **Mas há RECUO, e ele não é preguiça**: sem NENHUM humano vivo, a lista volta a ser o placar inteiro.
  No Battle Royale a sala é de 50 e o `anonBots` tira o `PLAYER_FLAG.BOT` do fio de propósito — depois que
  o último humano morre a partida CONTINUA e ainda há o que ver, indistinguível de gente para quem está
  olhando; sem o recuo, quem entrou pelo botão "Assistir" ficaria diante de uma câmera parada até o fim da
  rodada, que é pior que assistir a um bot. "Somente humanos" vale sempre que houver um humano — nunca ao
  preço de uma tela parada. Foi isto que `server/test/br.test.js` cobrou, e é decisão de produto.
  ⚠️ `alive` de `spectateTargetFor` deixou de ser "tem peça viva" e passou a ser "está na lista": as duas
  já eram equivalentes (`leaderboard` só traz quem tem peça viva) e assim o filtro vale nos TRÊS caminhos
  de uma vez — o `prefer` (quem me matou), o companheiro de equipe e a busca automática. É o que faz quem
  morreu para um preenchimento não ficar olhando o preenchimento.
  ⚠️ Espectador não entra na própria lista: ele nasce sem peça (`spawn:false`) e `leaderboard` pula quem
  não tem peça viva — uma arquibancada de dez não vira dez alvos de câmera.
  ⚠️ `Sim.leaderboard` é MEMOIZADO por tick: no mesmo tick de um join a lista ainda é a de antes dele.
  Vale para o teste (que precisa de um `step()`) e não para a produção, onde o join e a troca de câmera
  caem em ticks diferentes.
- **ASSISTIR A UMA SALA EM ANDAMENTO** (`Room.acceptsSpectator`/`joinSpec`, `{t:"join",spec:true}`,
  `ui/Spectate.jsx`; `docs/design/modos.md`): morrer virava câmera desde sempre; ENTRAR só para olhar, não —
  e a sala de Battle Royale é justamente a que recusa entrada depois da largada, ou seja a partida mais
  interessante de acompanhar era a única que não dava para ver. O espectador é uma sessão **com slot e sem
  corpo** (o mesmo `addPlayer({spawn:false})` do lobby do BR) e **nasce `dead`** — não é gambiarra: `gp.dead`
  já É o estado de quem assiste, e é ele que dá de graça as QUATRO coisas que fariam falta (a troca de
  câmera do `wsServer`, a arquibancada do `_escopoFala`, o `if(gp.isBot||gp.dead)continue` do `endRound` e a
  isenção do ceifador). Um terceiro estado exigiria tocar nos quatro, e cada um falha em silêncio.
  ⚠️ **A PORTA É OUTRA, nunca `acceptsJoin()`**: se fossem a mesma, abrir uma abriria a outra e o BR voltaria
  a aceitar JOGADORES no meio da rodada. ⚠️ Não ocupa vaga (`humanCount`/`isFull` contam sessões
  não-espectadoras — contá-lo faria uma sala de 25+5 parecer cheia E encolheria o preenchimento, porque
  `botAlvo` é `botCount-humanCount`), não entra no `PLAYERS` nem no placar, **não reserva o nick** (senão
  quem assistiu uma partida não conseguiria ENTRAR na seguinte com o próprio nome) e **a sessão de
  persistência é DESCARTADA** pelo caminho dos becos de recusa: assistir não é uma vida e não pode virar
  linha em `matches`. ⚠️ Teto por sala (`ROOM.SPEC_MAX`) porque ele custa um snapshot por tick, o item mais
  caro POR SESSÃO do laço — sem número, uma sala que virou assunto acumularia olheiros até o tick estourar e
  quem pagaria é quem está jogando; no teto a resposta é recusa, nunca fila. Ele é ISENTO do ceifador de
  inatividade (fica parado de propósito — é o que veio fazer), e quem segura o custo é o teto.
  ⚠️ **`salaViva`, nunca `getRoom`**: aquele MATERIALIZA a sala quando o código é deste shard, e um código
  errado viraria uma sala fantasma com preenchimento dentro para alguém que só queria olhar (é a mesma regra
  que o painel /admin segue por escrito). ⚠️ **Ele nunca vira jogador sozinho** — nem na vaga que abre, nem
  no fim da rodada: sair é decisão dele, e é isso que dispensa promover uma sessão sem corpo no meio da
  partida. ⚠️ JSON de controle, então o `PROTOCOL_VERSION` **não sobe**: servidor antigo ignora `spec` e
  devolve o `ROOM_STARTED` de sempre.
  ⚠️ **Pré-requisito, e ele era um defeito de verdade**: `net/Session.js` tinha um `//` que engolia
  `this.cx`, `this.cy`, `this.scale`, `this.rect` e `this.specSlot` — cinco campos NUNCA inicializados no
  construtor (a mesma armadilha de `holdEject`/`rightSplit` no `PREF_DEFAULTS`). Ficava mascarado porque
  `Room.join` escreve `rect`/`specSlot` e tira `cx/cy` da primeira PEÇA; **sem peça** (o lobby do BR, e agora
  o espectador) `viewRect` recebe `undefined`, devolve `NaN` e o snapshot sai VAZIO, em silêncio.
- **A TELA DE MORTE ESPERA PARA APARECER, E DEIXOU DE SUMIR** (`ROUND.DEAD_DELAY_MS`/`DEAD_MIN_MS`,
  `ui/deadClock.js`, `actions.onDead`): dois pedidos, UM relógio. (a) Ela subia no MESMO tick da mensagem,
  cobrindo exatamente o quadro em que o planeta estoura; agora `onDead` grava `lastMatch` na hora e AGENDA o
  `screen:"dead"`, com a câmera já no alvo que o servidor escolheu — e o timer é CANCELADO no fim de rodada,
  na queda/kick, ao sair da sala e ao entrar noutra, senão a morte sobe por cima de um pódio.
  (b) **Às vezes ela não aparecia e o jogador reentrava no ato**, e a causa é de PROVENIÊNCIA: `game/index.js`
  nunca zerava `morte` em `join`/`leave` (só o `{t:"alive"}` zerava), então toda re-entrada por `play()` — o
  fallback de `respawnAqui`, o "OUTRA PARTIDA" do BR, a sala nova do BIG CRUNCH — carregava um `{deadAt,armAt}`
  VENCIDO para a vida seguinte. E o par chega à tela por um store COM THROTTLE (200 ms) enquanto
  `screen:"dead"` vem do store `app`, SEM throttle: no primeiro render o par lido é o de ANTES da morte. O
  efeito roda `tick()` síncrono na montagem, o prazo já estava no passado e o respawn saía no primeiro frame.
  ⚠️ O conserto é em TRÊS camadas e nenhuma basta sozinha: `morte=morteZero()` no `join`/`leave` (a origem),
  o PISO de `prazoDe(st,ms,telaAt,minMs)` (nada vence antes de a tela ter estado `minMs` na frente, seja qual
  for o par que chegou) e o carimbo `telaAt` da exibição. `client/test/dead-clock.test.js` fica vermelho se o
  piso sair — foi conferido por mutação.
- **O CONVITE DE BATTLE ROYALE PODE SER DESLIGADO, E TEM TETO** (pref `brInvite`, `BR.INVITE_CD_MS`,
  `ui/BrInvite.jsx`): toda sala de BR pública criada em QUALQUER shard manda um card para TODA sessão do
  Livre (`RoomManager.announceBrStartCluster`), e a sala de BR fecha na largada — cada onda cria salas novas.
  Com `LOBBY_TICKS` de 30 s, quem jogava o Livre levava um card por minuto, sem cooldown, sem dedupe e sem
  memória de recusa (`dismissBrInvite` só apagava o da vez). Entraram TRÊS coisas ortogonais, e a diferença
  entre elas é o ALCANCE: um teto **por sessão** no servidor (`Session.brInviteAt`, "com que frequência no
  máximo"), o **silêncio desta sala** (`Session.brMudo`, via `{t:"brMute"}` — o botão do card) e a **pref de
  conta** `brInvite` ("nunca mais, em lugar nenhum", nas Opções e no menu do Esc).
  ⚠️ **O botão do card já foi a pref, e isso era grande demais.** Quem só queria sossego AGORA desligava o
  aviso para sempre, com um card na frente no meio de uma partida, e só descobriria como voltar atrás
  procurando em Opções. Hoje ele vale enquanto o jogador estiver NESTA sala; na próxima do Livre ele é
  avisado de novo e pode calar de novo lá. Quem quer o "nunca mais" continua tendo — só não o toma sem
  querer. O rótulo mudou junto nos três dicionários (`brInviteNever` → `brInviteMute`): uma chave chamada
  "Nunca" guardando "não nesta sala" é exatamente a mentira que este arquivo existe para não deixar passar.
  ⚠️ **A SESSÃO É O ALCANCE, e é isso que dispensa relógio e memória**: ela nasce com o socket e morre com
  ele (o `wsServer` cria uma `new Session` por conexão), então trocar de sala zera o silêncio por
  construção. Um `resume` reata a MESMA sessão, então cair a rede não desfaz o silêncio da sala em que ele
  está. E `Room.brInvite` pula o mudo ANTES de gastar o cooldown: quem não recebe não tem relógio a queimar.
  ⚠️ **Só LIGA, nunca desliga**: desfazer é trocar de sala. Um `{t:"brMute",on:false}` seria uma segunda
  verdade sobre um estado que o jogador não vê em lugar nenhum.
  ⚠️ O cliente guarda uma CÓPIA local (`brMudo` em `game/index.js`, zerada no `join`/`leave` ao lado do
  `morte`) só para o `brStart` que já estava EM VOO quando o jogador clicou não reabrir o card. Quem corta
  de verdade é o servidor. ⚠️ A pref continua sendo lida no CLIENTE, e é isso que a faz valer para o card
  que JÁ está na tela. ⚠️ E **saiu o `autoFocus`** do botão Entrar: ele roubava o teclado no meio de uma
  partida do Livre, e a partir dali um Espaço (dividir) virava "ir para outra sala".
- **RENASCER NÃO É ENTRAR DE NOVO** (`{t:"respawn"}` → `Room.respawn` → `Sim.revive` → `{t:"alive"}`):
  o botão DE NOVO do Livre fechava o socket e abria outro, e o feed dizia "Fulano saiu / Fulano entrou"
  para quem não tinha saído de lugar nenhum — o jogador morto CONTINUA na sala, com o socket aberto e o
  chat funcionando. O `FEED.JOIN_QUIET_MS` (20 s) era um curativo que não cobria quem ficava lendo a
  tela de morte, que é o caso normal.
  ⚠️ **O feed era o sintoma MENOS grave.** Entre o `quit` e a re-entrada há até 3 s (o
  `await hooks.onPlayerJoin`, `JOIN_TIMEOUT_MS`), e nesse intervalo o nick sai de `usedNicks`: um
  preenchimento podia tomá-lo e o jogador levava `NICK_IN_ROOM` **na própria sala em que estava**. Some
  a isso uma linha nova no roster por vida e o handshake inteiro pago à toa.
  ⚠️ **`Sim.revive` é a dona da lista do que uma vida nova zera, e essa lista é o risco todo**: antes,
  "vida nova" era um `GamePlayer` saído de `_mk`, então tudo nascia zerado de graça. Esquecer
  `rosterFolded=false` faz a 2ª vida nunca entrar no pódio; esquecer `kills/deaths/food/score` faz o
  `_rosterFold` da morte seguinte contar tudo DUAS vezes. Campo novo em `_mk` que seja por vida entra lá.
  ⚠️ **Sessão de persistência NOVA** (`hooks.openSession`, a generalização do `openUnsavedSession`):
  `matches` guarda uma linha por VIDA. A da vida anterior já foi fechada pelo `onMatchEnd` da morte e
  `MatchSession.end` é idempotente, então não há nada a desfazer. O cliente TEM que atualizar o
  `sessionId` no `{t:"alive"}`, senão um `resume` posterior manda o da vida morta e cai em `ROOM_EXPIRED`.
  ⚠️ **`respawnAqui()` refaz o que `play()` fazia e não é entrar na sala**: o anúncio de portal e o
  `match_start` do GA moram lá dentro porque `play()` era a porta única. Sem isso o midroll do
  RENASCIMENTO — a maioria deles numa sessão — sumiria da receita em silêncio.
  ⚠️ Recusado (BR, sala acabada, socket caído), o cliente **cai no `play({room})` de antes**: o caminho
  velho continua inteiro e é a rede. E `{t:"alive"}` **não é um `room` disfarçado** — repetir o
  tratamento dele apagaria `chatLog`/`feedLog`, ou seja a conversa de quem estava falando na tela de morte.
  ⚠️ JSON de controle não sobe `PROTOCOL_VERSION` (o precedente é o `{t:"talk"}`): cliente antigo nunca
  manda `respawn` e ignora `alive` no `else if`, e continua renascendo pelo caminho velho.
- **...E O RESPAWN SÓ CONTA DEPOIS DE UM SINAL DE VIDA** (`ui/deadClock.js`, `game/input/Activity.js`,
  `Room._idleTick`, `{t:"awake"}`/`{t:"idle"}`, `NET.IDLE_*`): a tela de morte renascia SOZINHA — o efeito
  armava a contagem no instante da morte e chamava `respawnAqui()` cinco segundos depois, sem que ninguém
  clicasse em nada; o botão "DE NOVO! · 5s" era o espelho dela, não a causa. Uma aba esquecida aberta virava
  um jogador que morre, renasce, morre e renasce **para sempre**, ocupando vaga, virando comida de graça e
  poluindo o placar e o kill feed de toda sala por onde passava. Hoje quem arma é o primeiro GESTO depois da
  morte, e o servidor remove quem não age há `NET.IDLE_MS`, avisando `NET.IDLE_WARN_MS` antes.
  ⚠️ **SÃO TRÊS RELÓGIOS DE SESSÃO E ELES NÃO MEDEM A MESMA COISA**: `NET.DEAD_MS` (15 s) é o SOCKET morto,
  `NET.RESUME_MS` (10 s) é a sessão SEM socket esperando o `resume`, e `NET.IDLE_MS` (3 min) é o socket vivo
  com a PESSOA ausente. `lastPong` serve aos dois primeiros e a nenhum do terceiro — ele é renovado por
  QUALQUER mensagem, inclusive o keepalive de 10 Hz que o cliente manda com o mouse parado. Consolidá-lo com
  `lastActiveAt` desliga a remoção por inatividade em silêncio: ninguém mais é removido, e nada acusa.
  ⚠️ **O LATCH é o miolo do lado do cliente** (`passoMorte`): `armAt` é escrito UMA vez por morte. Se
  andasse a cada gesto, quem ficasse mexendo o mouse na tela de morte nunca renasceria — e o par
  `{deadAt,armAt}` viaja no MESMO objeto justamente para ser impossível o armamento de uma morte disparar o
  respawn da seguinte (é o defeito que `roundClock.js` documenta, nesta tela).
  ⚠️ **O ALVO DO INPUT NÃO É SINAL DE PRESENÇA, e isto foi MEDIDO no navegador**: o planeta com o mouse
  largado fora do centro NUNCA alcança o cursor — a câmera persegue o planeta, então o ponto de MUNDO sob o
  mesmo pixel foge junto — e um jogador ausente engordou de 926 para 11.076 em 38 s sem tocar em nada,
  parecendo ativo o tempo todo. Por isso existe o `{t:"awake"}`, que o cliente manda no primeiro gesto (e uma
  vez após o `room`): o PRIMEIRO deles declara uma capacidade, e a partir dele o servidor ignora o alvo e
  confia só no gesto. Build antiga não manda, continua medida pelo alvo e não é removida por engano.
  ⚠️ **DUAS ISENÇÕES, e nenhuma é preguiça**: o morto do BATTLE ROYALE fica (o jogo promete isso por escrito
  na própria tela dele, `LB.brWatchHint`, e ele já não ocupa vaga — a sala não aceita mais ninguém), e o DONO
  da sala fica (ela existe para esperar os amigos chegarem pelo link; removê-lo entrega a coroa a um estranho
  pelo `_hostTick` justo enquanto os convidados não chegaram). No LIVRE o morto parado É removido — é o caso
  do pedido, e ele é quase autoevidente: com o armamento, "3 min morto" quer dizer "nunca houve gesto".
  ⚠️ **Bot nenhum passa pelo ceifador**, e é estrutural: `this.sessions` só tem humanos. Não "consertar"
  iterando `sim.players` — o servidor passaria a expulsar os próprios preenchimentos.
  ⚠️ A remoção usa o par canônico de `hostKick` (`session.error` + `leave(...,'left')`) pelas mesmas duas
  razões escritas lá; o 4º parâmetro `motivo` existe só para o fluxo AO VIVO do /admin poder distinguir
  "saiu", "expulso pelo dono" e "ficou inativo" — o `cause` não serve porque vai para o banco, onde o CHECK
  de `matches.cause` não conhece palavra nova.
  ⚠️ **`#hud.spec` esconde `#notice`**, e `.spec` é exatamente a tela de MORTE: sem o `:not(#idle-warn)` em
  `ui.css` a faixa do aviso ficaria `display:none` justo no caso principal, sem erro no console.
  ⚠️ E `actions.js` só tratava desconexão com erro em `screen==="game"` — na tela de morte (`"dead"`) a
  expulsão caía num toast de 3 s e deixava a tela pendurada com o socket fechado. Já valia para o kick e o
  ban do dono; passou a incluir `dead` e `round`.
- **ENTROU GENTE DE VERDADE, E SÓ O ADMIN É AVISADO** (`Room._avisaAdmins`, `{t:'adm'}`): faixa `#notice` +
  som + linha de chat, mais a **notificação do sistema** quando a permissão já foi concedida. O alcance é o
  SHARD (`RoomManager` passa o `Map rooms` para cada sala); o cluster inteiro exigiria `tellPeers` e uma
  rota interna, e um aviso não vale essa superfície.
  ⚠️ **A sessão de WS não sabia que era de um admin**: o `RESOLVE_SQL` do token já faz `SELECT u.*`, mas
  `persist/hooks.js` monta o retorno campo a campo e a coluna era descartada. Agora `isAdmin` viaja até
  `Session` — e serve só para RECEBER: kick, ban e parâmetros continuam exigindo `token_kind==='admin'`,
  que é o que impede roubar a aba do jogo de um administrador.
  ⚠️ **Nada de `sessionId`/`userId`/IP na mensagem**: o `sessionId` é metade da credencial de `resume`, e o
  lugar de dado de identificação é o `adminInfo`, que só sai por HTTP autenticado.
  ⚠️ **A permissão do navegador é pedida por um BOTÃO** (Opções → Administração, visível só para admin, com
  `isAdmin` acrescentado ao `toPublic`): `requestPermission()` exige gesto do usuário e no iframe de um
  portal ela nem existe. O jogo nunca pede sozinho, e a faixa é sempre o chão.
- **TAMANHO DA SALA E PREENCHIMENTOS SÃO PARÂMETROS** (`ROOM.MAX`/`ROOM.BOTS`, grupo "Salas"): mesmo
  contrato do `ROUND.TICKS` — o env semeia no boot, `Room.js` lê a CONSTANTE VIVA e `admin_settings` a
  sobrescreve em ≤30 s. Lendo `config.roomMax` o ConfigMap venceria o painel em toda sala nova.
  ⚠️ `MODES[FREE].max`/`.bots` viraram **getters** pelo mesmo motivo do `roundTicks`: cópia feita na carga
  do módulo anunciaria o número antigo para sempre.
  ⚠️ `/api/config` passou a anunciar `ROOM.MAX`, não o env — senão a tela mostra a capacidade que a sala
  não tem.
  ⚠️ O override explícito vive nas OPÇÕES da sala (`new Room({roomMax,roomBots})`), não no `config`: quem
  monta sala à mão (os testes) precisa de um número próprio sem depender de estado global de processo.
  ⚠️ Vale para as salas CRIADAS daí em diante, e **baixar bots não expulsa ninguém** — `trimBots` só roda no
  lobby do BR e no Livre o bot morto renasce.
- **O CHAT NÃO EXISTE NO TELEFONE ENQUANTO SE JOGA** (`ehCelular` em `hooks/useViewportMode.js`, o
  `escondido` de `ui/Chat.jsx`): no celular o painel mora POR CIMA da área de jogo (é `position:absolute`
  dentro de `#hud`) e a área de jogo do celular é a tela inteira — cada linha que chega tapa o canto onde
  o planeta está, e o campo de texto ainda abre o teclado virtual do sistema, que come metade da tela no
  meio de uma partida. No desktop nada disso acontece: lá o chat ocupa uma sobra.
  ⚠️ **`persist` MANTÉM o chat** (morto, pódio ou assistindo), de propósito: o que atrapalha é a
  GAMEPLAY, e atrás da tela de morte não há gameplay para atrapalhar — é justamente o momento em que se
  lê e se responde. É a mesma fronteira que o `persist` já usava para não desbotar as linhas.
  ⚠️ **O ADMINISTRADOR continua vendo**, no telefone e jogando: quem modera precisa ler a sala de onde
  estiver, e o chat é o único caminho de moderação DENTRO da partida (silenciar e denunciar saem do
  clique no nome, ali dentro). `isAdmin` só chega ao cliente quando é verdade (`repos/users.js`).
  ⚠️ **`ehCelular` é o `mode`, nunca `data-pointer`**: `coarse` responde "é dedo?" e casaria com um iPad,
  que tem 1180 px de largura e espaço de sobra para um painel no canto. O que atrapalha é a tela PEQUENA,
  e `modeFor` já separou as duas coisas — `tablet` fica de fora por isso.
  ⚠️ Uma variável só (`escondido`) para as DUAS portas — o listener de teclado e o render —, senão o T
  continuaria abrindo um painel que não está na tela.
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
  ⚠️ **O PRAZO DO SDK É PARA QUEM ESPERA, NÃO PARA O ADAPTADOR** (`portal/index.js`): o `prazo(...,
  PORTAL.SDK_MS)` jogava o adaptador FORA quando ele passava de 6 s — para o resto da sessão. E 6 s não
  é folgado somando o download do SDK de terceiro, o `initialize()` dele (que ainda busca config e o
  pedaço da plataforma no CDN deles) e tudo isso SEM cache, que é exatamente a primeira carga do
  REVISOR. O sintoma é mudo: nenhum anúncio, nenhuma mensagem de ciclo de vida, nenhum placar, e nada no
  console. Hoje o prazo só decide quanto o botão JOGAR espera; o adaptador atrasado é instalado do mesmo
  jeito, e o `carregou()` (que sai UMA vez, do `main.jsx`) é REPETIDO para ele — em vários SDKs é esse
  marco que libera o anúncio.
  ⚠️ **PREROLL NÃO É UNIVERSAL, e `gameplayStart` precisa de `gameplayStop`** (`portal/index.js`): a GD
  EXIGE preroll (§2.1) e a CrazyGames PROÍBE — *"advertisements should not appear before the user has
  experienced a reasonable amount of gameplay"* —, e o jogo mandava o mesmo `anuncio("preroll")` para
  todos, ou seja o revisor deles levava anúncio antes de ver um frame. Quem declara é o ADAPTADOR
  (`semPreroll` em `crazy.js`), não uma flag de build: a regra é do SDK e mora junto dele. E o par
  start/stop estava quebrado onde ninguém olha — só `leaveGame()` chamava `jogoParou()`, então respawn e
  fim de rodada passavam por `play()` e o SDK recebia N × start para 1 × stop numa sessão normal.
  ⚠️ **A POKI TAMBÉM ENTROU NO `semPreroll`, e o custo de não estar era o CHECKLIST INTEIRO.** Medido no
  console do SDK real: `commercialBreak not possible before gameplayStart` — eles RECUSAM qualquer
  comercial antes do primeiro `gameplayStart`, e o nosso preroll saía em `play()`, que é justamente
  antes. Isso ficou aqui escrito por meses como inofensivo ("a primeira partida de cada carga entra sem
  anúncio"), e não era: o **Inspector deles lê a ORDEM**, então o primeiro evento de anúncio da sessão
  era um `commercialBreak` inválido, ANTES de existir gameplay, e o item *"Is a gameplayStart() event
  fired at the start of gameplay?"* ficava vermelho com o fluxo quebrado no primeiro passo — era ali que
  a submissão travava. Declará-lo **não custa receita nenhuma**: o anúncio suprimido é exatamente o que a
  Poki já rejeitava, e os midrolls do respawn (de onde a receita sai) não mudam. O que se ganha é a ordem
  que eles esperam (`gameLoadingFinished` → `gameplayStart` → … → `gameplayStop` → `commercialBreak` →
  `gameplayStart`) e a arena sem o pedágio do `prazo()` do anúncio, que é o aceite do "< 1 s".
  ⚠️ **O CONSERTO DE ENTÃO ERA MEIO CONSERTO, e o texto que ficou aqui ("o `anuncio()` fecha e REABRE o
  gameplay em volta do anúncio, então nenhum chamador precisa lembrar disso") descrevia exatamente o
  buraco que sobrou.** Fechar em volta do anúncio conserta o anúncio; a MORTE, a PAUSA e o fim de rodada
  continuavam sem `gameplayStop` nenhum, ou seja a tela de morte inteira contava como jogo ATIVO. Hoje o
  ciclo é derivado do STORE (`portal/sessao.js`, o molde que `bb.js` já usava para a Bounty Board e que
  valia só no site), e `play`/`respawnAqui`/`leaveGame` **não chamam mais nada de ciclo** — uma segunda
  verdade sobre "estou jogando" foi o que deixou a morte de fora. Na fachada sobrou o que é do anúncio:
  `emJogo` virou o trinco do ESCRITOR ÚNICO (é ele que garante que o SDK nunca vê start-após-start nem
  stop-após-stop, item que os dois portais cobram por escrito) e `emAnuncio` é o portão do commercial
  break — um start que chegue no meio dele é ADIADO até o `finally`, nunca descartado, senão o jogo
  seguiria com o gameplay fechado para sempre. Quem reabre é a tela virar `game`, que acontece DEPOIS
  do `await` do anúncio: reabrir na fachada devolvia o `gameplayStart` com a tela de morte no ar.
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
  ⚠️ **O PREROLL VOLTOU, e o config precisou de `initialInterstitialDelay: 0`**: a QA Tool deles
  reprovou com "No advertising is implemented", e as duas causas eram nossas — o adaptador declarava
  `semPreroll` (a doc pede para não anunciar "at game start", mas o nosso preroll é o clique em JOGAR, o
  "level transition" que eles dão como exemplo) e o teto DELES, contado a partir do `game_ready` e
  valendo 60 s por padrão, recusava o primeiro anúncio de toda sessão antes de ele existir. Quem espaça
  anúncio continua sendo `PORTAL.MIN_AD_MS`, na fachada.
  ⚠️ **PROGRESSO NA STORAGE DELES** (`bridge.storage`), pela outra reprovação ("the platform did not
  detect any attempt to save data"). O que preserva progresso aqui é a CREDENCIAL da sessão, não uma
  cópia de moedas/nível — eles vivem no nosso Postgres —, então o blob é `{v,t,n}`. **Só para
  convidado**: entregar à plataforma o Bearer de uma conta registrada seria delegar um acesso que vale
  mais que o save, e quem tem login entra por ele em qualquer aparelho. E só RESTAURA em conta em
  branco: quando o SDK fica pronto o boot já criou um convidado local (~200 ms contra segundos), então
  o caso real não é "sem sessão", é "convidado que nunca jogou".
  ⚠️ **O placar SaaS precisa de TRÊS coisas, e faltando uma o silêncio é o mesmo**: o
  `saas.publicToken` (painel → aba Leaderboards), o bloco `saas.leaderboards.platforms` (é ele que liga
  o adaptador SaaS; sem ele o Bridge tenta o placar NATIVO, que no Playgama não existe — e `qa_tool` é
  uma plataforma à parte, que precisa estar na lista) e o placar criado no painel com o id que o jogo
  manda (`score`). Medido: id inexistente responde `404 Leaderboard not found`, e `setScore` REJEITA
  para quem não está logado na plataforma — o caso normal num portal.
  ⚠️ Pausa e áudio são AGREGADOS lá (cinco fontes num estado só) e o
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
  ⚠️ **ERA ELA QUE FAZIA A TELA ROLAR DE LADO NO CELULAR**, por 2 px, em TODA tela com barra. Duas causas
  somadas, e nenhuma sozinha bastava. (a) O sangramento era `-18px` cravado, e em RETRATO os três temas dão
  `padding:0 16px` ao `.wrap` (18 px no resto) — a barra passava 2 px do padding box. Hoje o número é
  `--wrap-pad`, declarado nos dois casos no mesmo bloco de `ui.css`: separados foi exatamente como
  divergiram. (b) O `.wrap` em retrato é **grid de `1fr`**, e item de grid nasce com `min-width:auto`: a
  barra não encolhia abaixo do próprio conteúdo e a TRILHA crescia para caber. Num Galaxy S8 (360 px) os
  sete botões pedem 352 px (308 de botão + 24 de vão + 20 de padding) contra 350 de caixa, então a trilha
  ia a 320 e a barra a 352. `min-width:0` corta a propagação e um aperto lateral em retrato
  (`padding-inline:6px;gap:2px`, o mesmo remédio que a gaveta deitada já usava) faz a barra CABER de
  verdade — 47 px de alvo, acima do piso de 44. Medido depois: trilha 318, barra 350, `scrollWidth ==
  clientWidth` em 360/375/390/430.
  ⚠️ **A matriz não pegava isso, e agora pega** (critério 6 de `scripts/responsive-check.mjs`): o critério 1
  mede `document.documentElement.scrollWidth`, e aqui o documento NÃO transbordava — quem ganhou eixo
  horizontal foi a caixa, que é `overflow:auto`. Nenhuma tela do jogo tem conteúdo horizontal, então
  qualquer contêiner com `overflow-x:auto|scroll` e sobra é defeito. `hidden`/`clip` ficam de fora: eles
  CORTAM (é o caso do `#cena`, que planta sprites fora da tela de propósito) e quem cobra corte é o
  critério "clipado".
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
- **NO DEDO A MIRA SÓ ARMA DEPOIS DE SEGURAR DE VERDADE** (`MISSILE.AIM_MS` 160 / `AIM_MS_TOUCH` 420,
  tunables de escopo `wire`; `dedo()` injetado em `game/input/actions.js`): o limiar era um `const` de
  MÓDULO com 160 ms, e 160 ms no mouse é um "segurar" deliberado — no polegar está dentro da cauda de um
  TOQUE. O `#t-fire` do HUD passa por `press("fire")` → `Touch.js` → `act()` **sem** a guarda
  `if(type==="touch")return` que protege o canvas, então ali quem decide é só a duração.
  ⚠️ **O preço de armar sem querer é DUPLO, e a segunda metade é a que ninguém liga à mira**: (1) o clique
  rápido é TELEGUIADO e `fireHoming` varre a sala inteira sem limite de alcance — mirado sem alvo dentro
  de `AIM_PICK` (700 px do "cursor", que no dedo é o alvo de MOVIMENTO) o míssil sai RETO, ou seja o tiro
  que acertaria em qualquer canto do mapa vira um foguete burro; e (2) `setAim(true)` chama `onAim(true)`
  → `joy.setAiming(true)`, e pela regra de PAPÉIS do direcional **o próximo dedo vai para a MIRA, não para
  o volante** — enquanto o polegar segura o fogo, o outro dedo não dirige. É literalmente o sintoma "no
  celular o planeta não anda", produzido pelo botão de atirar.
  ⚠️ **`wire` e não `server`**: quem aplica é o CLIENTE. O precedente está ao lado (`AIM_HOLD_TICKS` já é
  `wire`) e **`MISSILE` já está em `RAIZES_WIRE`**, então não há o risco da falha muda de raiz ausente.
  ⚠️ **Lido A CADA CHAMADA**, nunca capturado na carga do módulo — é o antipadrão que `SPLIT.MIN_R`
  documenta, e `client/test/actions.test.js` o trava mutando a constante entre dois toques.
  ⚠️ `dedo` é um GETTER (`()=>…`), não um valor: ele vem do MESMO `matchMedia("(pointer: coarse)")` que
  arma o direcional, e o ponteiro pode mudar no meio da sessão (tablet com teclado). Congelado na criação,
  o limiar do mouse valeria para sempre num aparelho que virou dedo.
  ⚠️ 420 ms é PONTO DE PARTIDA, e é por isso que nasce tunable: o número final sai da medição. A única
  relação que importa é `AIM_MS_TOUCH > AIM_MS`, e invertê-los devolve o defeito — as faixas dos tunables
  a garantem e há teste.
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
  `applyFire` cobra um nível da PRIMEIRA peça viva, `applySplit` cobra um nível de cada peça com
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
- **NO PACOTE DE PORTAL A TELA INICIAL NÃO EXISTE** (`SEM_MENU` em `portal/flags.js`, o desvio no fim de
  `boot()`, `sairDaPartida()` em `state/actions.js`): o boot termina na ARENA. Sem Entry e sem `#cena` —
  **durante a partida** o menu inteiro (nick, skin, ranking, opções, sair) mora atrás do Esc/☰, em
  `ui/Pause.jsx`; quem SAI da partida cai na tela de Modos, que é o menu do pacote (ver abaixo).
  ⚠️ O motivo é medido: o funil da Poki 1.12 leu **17% de abandono em `menu/entry`** — 85 de 500 fecharam
  a aba na tela inicial sem jogar um segundo, cada um entrando na média de playtime como ZERO. O tester
  já clicou "Play" no site DELES; o nosso cartão é a segunda porta.
  ⚠️ **O `await entraPeloPortal()` saiu do caminho crítico**: ele abre com `portal.identidade()`, que por
  dentro é `await pronto` — a promessa do SDK de terceiro, com teto de `PORTAL.SDK_MS` (6 s). A Poki não
  implementa `identidade`, então o boot esperava o SDK inteiro **para receber `null`**, e tudo depois dele
  herdava a espera. Isso era o gargalo do "arena visível em menos de 1 s".
  ⚠️ **A CORTINA `#boot` FICA ATÉ A ARENA ABRIR** (`main.jsx`). No site o primeiro render já tem o que
  mostrar; aqui não há tela nenhuma entre a cortina e o primeiro frame, e tirá-la no render descobriria um
  shell vazio pelo tempo do guest + handshake. A rede de segurança (`SDK_MS + 4000`) não é opcional:
  cortina presa é pior que qualquer tela feia. As três telas-que-ficam (`servidorFora`, `desatualizado`,
  `expulsoInativo`) entram na condição, senão o `Offline.jsx` ficaria escondido atrás dela.
  ⚠️ **`screen` nasce em `"boot"`, e ele fica FORA de `SCREENS`** — aquela é a lista branca de `go()`, e é
  isso que torna `go("boot")` impossível por construção (o precedente é `"spec"`). **Não usar `"game"`**:
  `ATIVO`/`RETIDO` de `portal/sessao.js` passariam a valer antes de existir partida — `gameplayStart` sem
  jogo (que a Poki cobra por escrito) e o funil contando o carregamento da página.
  ⚠️ **Os SETE botões de sair chamam `sairDaPartida()`**, nunca `leaveGame` direto: sete `if (PORTAL)`
  divergem no primeiro conserto (a lição de `useSpec`/`SpecBar`).
  ⚠️ **SAIR DA PARTIDA LEVA À TELA DE MODOS, e isso é a correção de um BECO SEM SAÍDA que esta entrega
  criou.** `destinoDaSaida` devolvia `{tipo:'jogar'}`: "leave the match" RE-ENTRAVA no Livre, ou seja o
  botão de sair reiniciava a partida em vez de sair dela — e como a tela de Modos é o **único** lugar do
  cliente que oferece o Battle Royale, o modo inteiro ficou inalcançável no pacote, sem erro, sem log e
  sem nada na tela dizendo por quê. O invariante nunca foi "nenhum caminho sai da arena"; é "nenhum
  caminho termina numa tela que não está MONTADA" — e `modes` está (`App.jsx` a monta sem guarda; quem
  não monta são `Entry` e `Scene`). O BOOT continua terminando na arena, que é o item medido; SAIR é um
  gesto deliberado e merece a escolha do modo.
  ⚠️ **`entry` é DESVIADA, não bloqueada** (em `go()` e em `leaveGame()`): o `go("entry")` do `escape()`,
  o "voltar" de todo `ScreenHeader` e o beco de `UNREACHABLE`/`LOST` continuam levando a algum lugar —
  `modes` —, sem espalhar `if (SEM_MENU)` por sete arquivos. E a guarda que sobrou em `go()` é pela tela
  de **ORIGEM** (`screen === "boot"`, que é o Esc apertado durante o boot, encontrado em bancada); pela de
  DESTINO ela bloqueava o menu inteiro, e foi exatamente isso que trancou o Battle Royale.
  ⚠️ Sem "Início" na `Nav` e sem "Voltar" no cabeçalho de Modos (`semVoltar`): com `entry` desviada para
  `modes`, os dois seriam controles que não fazem nada — e ali a tela de Modos É o início.
  ⚠️ **UM `quit` DELIBERADO DEIXOU DE SER LIDO COMO QUEDA** (`saindo` em `game/index.js`). `game.leave()`
  fecha o socket de propósito e o `Connection` avisava `closed` como avisaria uma queda — indistinguível
  para quem ouve. No site era inofensivo (quem sai muda de tela); aqui, enquanto sair era RE-ENTRAR, o
  fechamento da re-entrada era lido como queda e disparava outra: o Inspector mostrava `connect/match/fail`
  em rajada. **Medido e consertado no mesmo dia.**
  ⚠️ **O que NÃO foi possível**: a poda do Rollup. `Entry`/`Scene` continuam no zip (conferido com
  `unzip -l`) porque o Rollup não dobra a constante através da fronteira de módulo para tree-shaking de um
  componente JSX. O ganho é o DOWNLOAD: não montados, eles não produzem um `<img>`, e os ~217 KB de arte
  de menu deixam de ser baixados na janela que o Player Fit mede. Três daqueles arquivos nem poderiam sair
  (`planeta-*`/`lua` são a arte das skins de mascote).
  ⚠️ **`ENTRY.DIRETO` vira letra morta no pacote**: sem Entry não há para onde mandar quem não nomeou o
  planeta, então `semNome()` sai cedo. O tunable continua valendo para `site` e `bountyboard`.
- **A TELA DE MORTE DO PACOTE É UM TOQUE** (`kaboom`, o 4º modelo de `ui/Dead.jsx`; a escolha em
  `ui/deadEstilo.js`): o estouro, UM número (o score) e o DE NOVO de largura cheia. Sai o relatório
  inteiro — ranking do dia, recorde, colocação, prêmio, as duas vistas e o "voltar ao lobby".
  ⚠️ A ORDEM da escolha é a regra: `?dead=` primeiro (o atalho de QA tem de ganhar até do pacote, senão os
  outros três modelos deixam de ser mensuráveis na build que mais precisa ser medida), o PACOTE depois, a
  pref por último. E **o `kaboom` não vale no Battle Royale**: lá o jogo promete o pódio na própria tela.
  ⚠️ **Ele NÃO é gaveta.** `--rail-w` só é zero em `[data-screen="game"]`, então em `dead` o `#game`
  encolhe 480 px para abrir espaço a um painel de altura cheia — aqui isso daria uma gaveta de 480 px com
  um número dentro. O caminho já existia e é o do recolhido: o espelho em `body[data-dead]`, que passou a
  carregar o ESTILO.
  ⚠️ **O respawn automático caiu para 2 s** (`ROUND.RESPAWN_TICKS` 300 → 120): num agar a vida mediana é
  de 15–40 s, e cinco segundos de cartão a cada morte é uma fatia grande do primeiro minuto. Com 2 s o
  PISO de `DEAD_MIN_MS` (1,5 s) passa a morder para quem já estava com a mão no mouse na hora da morte —
  não é conflito, é o piso fazendo o que existe para fazer; abaixo de 1,5 s aqui a contagem exibida mente.
  ⚠️ **`respawnAqui` passou a compartilhar o trinco de `play()`**, e não era zelo: o primeiro clique manda
  `{t:"respawn"}` ANTES do `await` do anúncio, então o `{t:"alive"}` chega durante o comercial e zera o
  `dead`; um segundo clique (o botão fica com o FOCO por trás do anúncio) achava `g.respawn()` falso e caía
  no `play({room})` — socket fechado e reaberto, "saiu/entrou" no feed e um `match_start` a mais.
- **O JOGAR ENTRA NA PARTIDA, NÃO NA TELA DE MODOS** (`ui/Entry.jsx`): o caminho até o primeiro frame era
  nomear o planeta · JOGAR · escolher o modo · JOGAR de novo — duas telas e dois cliques para uma decisão
  que a esmagadora maioria não toma. O Livre É o jogo; quem quer battle royale ou esquadrão continua a UM
  clique, no botão "Modos" da grade logo abaixo. **A exigência do NOME fica** (é a decisão de a549880).
  ⚠️ `pendingPlay` continua sendo o PRIMEIRO ramo: quem chegou por link de convite (`?sala=`) ou clicou em
  renascer sem ter nomeado o planeta foi trazido para cá com o pedido guardado, e mandá-lo para uma sala
  qualquer do Livre faria o link do amigo terminar no lugar errado. O ramo `ENTRA_DIRETO` (CrazyGames)
  também fica: é comportamento certificado, não se mexe de passagem.
  ⚠️ O `data-go` virou `"game"` — ele descreve o DESTINO (é o que `theme/preview.js` e a sonda de
  responsividade leem), e daqui já não se vai para Modos. O botão da grade mantém o `"modes"`.
  ⚠️ Efeito colateral declarado: o funil do GA perde o passo `/tela/modes` no caminho principal. Não é
  regressão, é a tela deixando de existir no meio do caminho — não "consertar" essa queda depois.
- **A LISTA DE SALAS MOSTRA MODO E TEMPO, E A TRANCADA APARECE TRANCADA** (`ui/Lobby.jsx`): `Room.info()`
  já mandava `mode`, `phase`, `open` e `round` (segundos restantes; `null` = sem fim) e o cliente ignorava
  os quatro, desenhando no lugar uma coluna `ping` que o servidor **nunca preencheu** — "—" a vida toda.
  ⚠️ Quem decide se dá para entrar é o SERVIDOR (`open`), não a contagem de jogadores: uma sala de BR em
  andamento tem vaga de sobra e mesmo assim está trancada. `open === undefined` é shard irmão em build
  antiga (a lista agrega os peers) e cai na conta velha.
  ⚠️ **Trancada MOSTRA cadeado, não some da lista**: sumir faz o jogador procurar a sala que ele viu 5 s
  atrás. E o clique leva o `mode` DA SALA junto — na lista se escolhe uma sala, não um modo.
  ⚠️ **A recusa por MODO saiu do `wsServer`**: era um erro `MODE` para quem entrasse por código com outro
  modo selecionado, ou seja recusava justamente quem tinha acabado de escolher a sala com o dedo. O `opts`
  continua sendo usado — mas só quando a sala precisa ser CRIADA (botão "Criar sala", link de convite).
  ⚠️ **O grid tem TRÊS casos, e o do meio faltava**: desktop, retrato e a GAVETA, que é desktop com largura
  de celular (~435 px). Com seis colunas o botão "Entrar" saía 55 px para FORA e a `.lobby-wrap` ganhava
  rolagem horizontal — o critério 6 de `responsive-check.mjs`, que o documento não acusa porque quem
  transborda é o contêiner. Some o `.shard` na gaveta e no retrato: entre "de que shard é" e "quanto
  falta", quem ajuda a ESCOLHER é o tempo.
  ⚠️ E o comentário que dizia "no retrato a regra do base.css vale sozinha" **estava errado desde antes**:
  `body #room-list .room-row` é (1,1,1) e `body[data-mode="portrait"] .room-row` é (0,2,1) — o ID ganha, e
  o retrato vinha usando o template do desktop com uma coluna sobrando.
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
  ⚠️ **`left` PRECISA DO SIMÉTRICO** (`Room._rosterVolta`, chamado no `join`): ele era escrito no `leave` e
  nunca desescrito — e no Livre morrer É `leave`+`join`, então UMA morte grudava a marca na pessoa até o
  fim da rodada. Em `_mergeBoard` isso vale exatamente `vivo=false`: a linha ia para o `resto` com massa
  ZERO, atrás de TODOS os vivos, e o BIG CRUNCH coroava o maior preenchimento enquanto quem tinha o maior
  planeta da sala não aparecia nem entre os cinco maiores. O que tornava o defeito ilegível é que ele
  ainda levava os QUATRO destaques, que saem do roster e não da massa — a mesma tela dizia, ao mesmo
  tempo, que o jogador foi o melhor em tudo e que não estava no placar. Visto em produção com 50 abates.
  ⚠️ O `slot` volta junto: a linha guarda o da última vida DOBRADA, e a nova só é dobrada na morte
  seguinte ou no `endRound` — até lá `porSlot.get(r.slot)` leria um slot já reciclado por outra pessoa.
  ⚠️ Quem prova é `server/test/roombots.test.js` pelo caminho REAL (join/leave/join/endRound): os dois
  testes de `_mergeBoard` montam o roster À MÃO, e com roster fabricado este defeito é invisível.
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
  ⚠️ A contagem para a próxima sala parte de `pronto` (o instante em que o placar apareceu), não de
  `r.at`: senão a animação comeria 2 dos 15 segundos que o jogador tem para decidir.
  ⚠️ **E ESSE INSTANTE TEM QUE CARREGAR A RODADA A QUE PERTENCE** (`{chave,at}`, `ui/roundClock.js`):
  guardado como número solto, ele PULAVA a tela inteira na SEGUNDA virada de rodada da mesma carga da
  página — o jogador via o mundo explodir e caía direto numa sala nova, sem placar, sem campeão e sem
  contagem. O mecanismo é a ordem de execução do React: o `setPronto` do efeito que reinicia a tela só
  vale no render SEGUINTE, então o efeito da CONTAGEM, no mesmo passo, ainda lia o `at` da rodada
  ANTERIOR — um instante 15 s no passado — e o primeiro `tick()` chamava `play({})`. Medido em dev:
  `roundEnd` às 113,1 s e o `quit` às 113,2 s, contra os ~17 s certos. E **o defeito ALTERNAVA** (1ª
  virada boa, 2ª pulada, 3ª boa), porque o passo que disparava cedo ainda deixava o zero gravado para a
  seguinte — o que explica por que ele sobreviveu desde `65431a0`: quem testa uma rodada nunca o vê.
  ⚠️ O prazo virou **função pura** (`prazoDe`, no molde de `game/quality.js` e `admin/ordenar.js`)
  porque o defeito é de PROVENIÊNCIA, não de aritmética, e não há jsdom no projeto para exercitar o
  componente. Quem prova é `client/test/round-clock.test.js`, cujo teste central é literalmente "o
  instante da rodada anterior nunca vence a contagem da atual".
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
- **ANIMAÇÃO DE ENTRADA NÃO ESCREVE `transform` EM QUEM SE POSICIONA COM `transform`** (`dd-bate` e
  `ri-fade` em `ui.css`): a tela de morte saía **METADE PARA FORA** do celular — medido, `left:195px`
  com o cartão de 390 px numa tela de 390, nos três temas — e a causa não estava em nenhuma regra de
  layout. O cartão é POSICIONADO por transform (em retrato os três temas o colam como folha de rodapé
  com `left:50%;transform:translateX(-50%)`, e o bloco "TODA TELA NO MESMO LUGAR" faz o mesmo no
  centro), e a batida de 450 ms terminava em `transform:none` com fill-mode **`both`** — que MANTÉM o
  valor final depois do fim. Valor animado ganha da cascata, então o translate sumia para sempre.
  Hoje a batida anima **`scale`**, a propriedade individual, que COMPÕE com o `transform` em vez de
  substituí-lo; onde ela não existir, perde-se o pulo e nunca o cartão.
  ⚠️ **O irmão era o `.ri-skip`** ("toque para pular", da abertura do BIG CRUNCH): mesma `ri-fade`
  terminando em `transform:none` sobre um `translateX(-50%)`, com o texto parando fora do eixo. Ela
  passou a animar **`translate`**, e aí não há nem o desvio geométrico do `scale` — translações
  comutam, então `translate:0 6px` e `transform:translateX(-50%)` dão a mesma matriz em qualquer
  ordem. As irmãs que usam `transform` em keyframe continuam válidas porque nenhuma delas se
  posiciona assim (`dd-estoura`, `rd-sobe`, `ds-cresce`, `lvup-pop`, o resto do `ri-*`) — e quando o
  elemento se posiciona assim, o outro remédio é repetir o translate em CADA keyframe, que é o que
  `noticeIn` e `ws-flutua-logo` sempre fizeram.
  ⚠️ **A matriz não pegava isso, e agora pega** (o critério 5 de `scripts/responsive-check.mjs` ganhou
  a LARGURA): o documento não transbordava, porque o `.screen` é `overflow:hidden` (critério 1); a
  varredura de "clipado" para no primeiro ancestral rolável, que é o próprio cartão (critério 4); e o
  6 cobra quem ROLA de lado, não quem está fora do lugar. O critério 5 media só topo e rodapé. A
  cobrança lateral não tem o `podeRolar` do eixo vertical: nenhuma tela do jogo rola na horizontal,
  então sobra lateral é sempre defeito.
- **OS DOIS CARTÕES DA TELA DE MODOS TÊM O MESMO DESENHO** (`ui/Modes.jsx`, `ui.css`): planeta pequeno no
  alto à direita, texto ao lado dele e um JOGAR da largura do cartão embaixo. O do Livre era o ÚNICO da
  tela sem botão nenhum — o clique era no cartão inteiro —, e ao lado de um vizinho com um JOGAR grande e
  amarelo isso lê como "este aqui ainda não está pronto".
  ⚠️ **Ele deixou de ser `<button>`** pelo mesmo motivo do Battle Royale: botão dentro de botão é HTML
  inválido e prende o foco. Perde-se "clicar em qualquer lugar entra"; o `<button>` de dentro mantém o
  teclado, que era a razão de ser um botão.
  ⚠️ **Quem impõe a posição do mascote é o cartão do BATTLE ROYALE**: lá o planeta não pode descer, porque
  abaixo dele há quatro chips, um botão e um campo de código, e ele passaria por cima do campo. O do Livre
  segue o mesmo lugar por SIMETRIA — um mascote grande no rodapé de um cartão e outro pequeno no topo do
  vizinho lia como dois componentes diferentes lado a lado.
  ⚠️ **O JOGAR do Livre tem que ser filho DIRETO do cartão**: a largura sai de `.btn-primary{width:100%}`
  do `base.css`, e é ela que faz o botão ocupar o mesmo espaço que o do vizinho. A altura é
  `margin-block:auto` — a grade estica os dois cartões ao mesmo tamanho e o do Livre tem duas linhas de
  texto contra os seis blocos do outro, então sem isso ele ficava colado no topo com um palmo de vazio
  embaixo; centrado na sobra, pousa na mesma faixa do JOGAR do Battle Royale.
  ⚠️ **Houve aqui uma versão com os DOIS mascotes na mesma fileira** (Marte · JOGAR · Lua) e ela saiu: o
  cartão deixava de rimar com o vizinho, e a Lua tinha de sair do botão de "Sala sua" e do `#cena` para
  não aparecer duas vezes na tela. Hoje cada mascote aparece uma vez e em um lugar só — Marte e Terra nos
  cartões, a Lua no botão (30 px, colada ao rótulo) e no cenário.
  ⚠️ **Abrir "Sala sua" ESCONDE os dois cartões.** Eles não são alternativa ao formulário: o primeiro
  controle dele é justamente Livre × Battle Royale, então deixá-los no ar oferece a mesma decisão duas
  vezes, com dois botões de entrar competindo — e empurra o formulário para fora da caixa. O botão vira
  o caminho de volta e troca o rótulo (`ownClose`).
- **A TELA DE MODOS: DOIS CARTÕES COM MASCOTE** (`ui/Modes.jsx`, o bloco "TELA DE MODOS" de `ui.css`).
  Eram QUATRO — Livre · Solo · Em equipe · Sala sua — e a tela passava dos 1.300 px de altura: o último
  cartão ficava cortado ao meio pela borda da caixa e ninguém via que havia mais coisa abaixo. Duas fusões
  resolveram: **"Em equipe" virou os chips do Battle Royale** (`1 · Solo`, `2 · Dupla`, `3 · Trio`,
  `4 · Quarteto`), porque solo e dupla nunca foram dois MODOS — é o mesmo battle royale com outro tamanho
  de esquadrão, e tê-los como cartões irmãos fazia a tela ter quatro escolhas onde há duas; e **"Sala sua"
  virou um BOTÃO** que revela o cartão, por ser a escolha menos usada e ocupar um quarto da tela.
  ⚠️ **`ts` mudou de semântica**: era `teamSize>1?teamSize:2` porque solo era outro cartão, e com aquela
  linha o chip "Solo" nunca acenderia. Hoje 1 é válido, e o botão RAMIFICA — `createParty` para 2+ e
  `play()` para solo. Isso não pode ser unificado: `createParty` **não passa por `play()`**, e é dentro
  de `play()` que vivem o `semNome()` e o ANÚNCIO de portal. Mandar equipe por lá daria dois prerolls;
  não mandar o solo por lá é reprova de certificação.
  ⚠️ **O cartão do BR deixou de ser `<button>`**: ele passou a ter chips, botão e campo de código dentro,
  e botão dentro de botão é HTML inválido e prende o foco — a mesma razão de "Em equipe" já ser `<div>`.
  ⚠️ **Os mascotes já estavam no bundle** (`assets/scene/planeta-laranja|planeta-azul|lua.webp`, os mesmos
  do cenário de fundo): importados por módulo, o Vite emite UM asset compartilhado — mesma URL, mesmo
  cache, zero byte a mais no zip de portal. Os PNG do kit somam 1,86 MB e **não** podem ir para
  `client/public/`: a `base:"./"` do build de portal não conserta referência absoluta a `public/`.
  ⚠️ **Os planetas do FUNDO somem nesta tela** (`body[data-screen="modes"] #cena .planeta-l/-r`): são os
  MESMOS mascotes, e ver o Marte duas vezes — um no cartão e outro flutuando atrás dele — lê como erro de
  montagem. A lua e os mísseis ficam, porque não se repetem ali.
  ⚠️ **A grade é `auto-fit`, não `1fr 1fr`**: ela tem que responder ao CONTÊINER. Na GAVETA o
  `--screen-w:760px` não vale (quem manda é o `--drawer-w` do tema) e com duas colunas fixas o botão do
  cartão do BR ficava com 41 px de largura no iPhone SE deitado — medido pela matriz, que ganhou
  `modes@rail` justamente porque essa combinação **não era medida**.
  ⚠️ A LEGENDA DOS POWERUPS continua na AJUDA, em Opções, pelo motivo de sempre: quem está escolhendo o
  modo tem pressa, quem quer saber o que é o trevo tem tempo.
- **(histórico) A TELA DE MODOS: DOIS POR DOIS, E A LEGENDA DOS POWERUPS FOI PARA A AJUDA** (`ui/Modes.jsx`,
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
- **Skins novas** (75–121): 8 lendárias com `levelReq` (10–50) que são EMBLEMAS, não texturas de planeta — é o
  que as faz legíveis a 24 px; a skin **Retrato** (83), que põe a FOTO do jogador dentro do disco; e **35
  caricaturas de easter egg** (84–118, `rarity:"secret"`, escondidas da loja e recusadas pela compra),
  escolhidas pelo NICK em `shared/src/eggs.js` — casamento EXATO da raiz (`baseNick`), porque prefixo fazia
  "modinha" virar Modi. O egg é decidido em `persist/hooks.js` e `wsServer.unsaved`, vale só para AQUELA vida
  e **nunca** escreve em `users.equipped_skin_id`; `prefs.eggs:false` desliga. ⚠️ `seedSkins` tem uma faca: um
  pod com o `shared/skins.js` ANTIGO faz `UPDATE skins SET active=false` nas skins novas — os 3 shards têm que
  estar na MESMA imagem antes de qualquer skin nova ficar comprável.
- **AS TRÊS SKINS DE MASCOTE** (119–121: Marte Bravo, Terra Brava e Lua Soldado; `pattern:"mascote"` +
  `mascot` em `skins.js`, `mascote()` em `theme/patterns.js`, o bloco `MASCOTES` de `theme/faces.js`):
  os personagens do jogo viraram skin compráveis. Passam pela MESMA máquina das caricaturas — mesmo
  cache, mesma chave, mesmo "assa liso agora e reassa quando o bitmap chegar" — e a pergunta continua
  sendo respondida por **`faceFile(sk)`**, que agora conhece as duas famílias: são QUATRO consumidores
  (a textura do planeta, a chave do cache, a prévia da loja e a decisão de não escrever o nome do
  jogador em cima da arte), e duas respostas para a mesma pergunta divergiriam na primeira correção.
  ⚠️ **Elas NÃO são cortadas no pacote de portal.** O `!PORTAL` de `faceFile` existe porque as 35
  caricaturas são de pessoas reais; estas são personagens NOSSOS, e é justamente por isso que servem de
  skin premium num portal. Medido no zip da Poki: o `define` poda o ramo da caricatura e o compilado
  vira `t=>t&&t.mascot?…:null`.
  ⚠️ **A arte é a MESMA do cenário e dos cartões da tela de modos, sem cópia em `public/`:**
  `new URL("../assets/scene/x.webp", import.meta.url)` é reescrito pelo Vite para o asset hasheado — o
  mesmo arquivo que o `import` de `Scene.jsx`/`Modes.jsx` emite —, então o zip não engorda um byte
  (medido: um arquivo por mascote, duas referências no bundle). ⚠️ `new URL` e **não** `import`:
  `faces.js` está na cadeia de import dos três temas e `client/test/textures.test.js` os carrega no
  `node --test`, onde importar um `.webp` derruba o loader; `new URL` é aritmética de URL, o Node a
  avalia sem tocar no arquivo.
  ⚠️ **O desenho é diferente do da caricatura**, e por duas razões: a arte tem fundo TRANSPARENTE (o
  disco da cor da skin vai por baixo, senão o personagem é um recorte flutuando) e não é quadrada, então
  o `drawImage(-r,-r,r*2,r*2)` de lá esticaria as três de um jeito cada. É `contain`, e o **fator é por
  personagem** (`MASC_FIT`): Marte e Terra SÃO a esfera e entram em 2.06 (no 2 exato sobrava um fio da
  cor da skin em volta deles); a Lua é esfera COM CAPACETE, e em 2.06 a cúpula caía fora do círculo e
  era decepada pelo recorte — ela entra em 1.8, e a faixa que sobra ao lado não custa nada porque a cor
  da skin é o mesmo cinza dela.
  ⚠️ **A ARTE SUBIU DE RESOLUÇÃO POR CAUSA DELAS** (`client/src/assets/scene/*.webp`, reencodadas do kit
  original em `warspace_poki/characters/*.png` com o maior lado em **640**, q82): os arquivos existiam
  para o CENÁRIO do menu, onde nenhum passa de ~190 px, e por isso estavam em 256–448. Como skin a conta
  é outra — o baker desenha a arte com o maior lado em `2.06·r` e no tier de 512 isso dá **527 px**, ou
  seja a Lua (256 px de largura) era ampliada **2,06×** e o planetão saía com o traço borrado. Medido
  lado a lado a 527 px: contorno, crateras e os rebites do capacete. Custo: +49 KB no zip de portal
  (775 → 824 KB), e de brinde o cenário deixa de ser mole em tela de dpr 3.
  ⚠️ Os atributos `width`/`height` dos `<img>` de `Scene.jsx` e `Modes.jsx` acompanham o ARQUIVO: eles
  reservam a proporção antes de a imagem chegar, e desencontrados dão salto de layout na carga.
  ⚠️ `seedSkins` continua sendo a faca de sempre: um pod com o `shared/skins.js` ANTIGO faz
  `UPDATE skins SET active=false` nas três — os shards têm que subir na MESMA imagem.
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
- **CINCO ARTES DE ESTRELA, ESCOLHIDAS NO /admin** (`paintNovaV` em `theme/patterns.js`, `STAR.LAYOUT`):
  a arte era uma função só com UM booleano (`old`), e as 12 estrelas do mapa dividiam duas texturas por
  tema — idênticas entre si, distinguidas só pela rotação inicial. Agora são cinco identidades
  (clássica · anã manchada · azul com jatos · binária · pulsar) e o painel troca ao vivo.
  ⚠️ **A VARIANTE ENTRA NA CHAVE DO CACHE** (`case "nova"` nos três temas): o `TextureCache` não tem
  `drop(key)`, então sem ela a troca no painel devolveria a textura anterior — em silêncio.
  ⚠️ `paintNova` **manteve a assinatura** (quatro chamadores) e `paintNovaV` despacha: quebrar a assinatura
  de uma função de tema custaria mais do que ela vale.
  ⚠️ O escopo é `wire`, não `server`: quem desenha é o CLIENTE. Com `server` o painel diria "salvo" e a
  tela continuaria igual, para sempre.
  ⚠️ Nada de `createConicGradient`/`filter`/`Path2D`/`ImageData` nessas funções: `client/test/textures.test.js`
  usa um contexto 2D falso via Proxy onde qualquer método passa — o teste ficaria verde e o jogo quebraria.
- **O CÍRCULO DE MATERIAIS ANTES DA SUPERNOVA** (`effects.star.nursery`, `layers/Hazards.js`): a transição
  ACTIVE→OLD era uma troca INSTANTÂNEA de textura — os 8 s mais dramáticos do ciclo eram "a bola fica
  vermelha de repente e incha devagar", sem nada dizendo que ela vai explodir. Agora um anel de matéria
  FECHA e ACELERA conforme ela incha, no molde exato das faíscas do buraco negro (achatado por `ryK`, com
  brilho por `cy`, para ter plano em vez de virar um círculo chapado).
  ⚠️ **O progresso da fase OLD é DERIVADO do raio**, sem um byte novo de protocolo: `r` cresce de `STAR.R`
  até `STAR.R·SWELL` e chega quantizado a 0,1 px, então `p` tem precisão ~0,003.
  ⚠️ Sai no modo econômico: é leitura, não informação que falte em outro lugar.
- **A SUPERNOVA DEIXOU DE SER UM ANEL BRANCO** (`supernovaPrims` em `theme/util.js`): eram TRÊS `ring`
  concêntricos crescendo — literalmente o "anel de espessura constante expandindo" que `fireworkPrims` foi
  reescrito para eliminar, com o comentário de lá explicando que ele é assinatura de desenho animado e
  chama mais atenção que as faíscas. O conserto tinha sido feito uma vez, noutro efeito, e nunca propagado.
  Hoje a explosão fala a mesma língua: rastro (traço do ponto anterior ao atual), arrasto que satura
  (`(1−e^{−λu})/λ`, abre rápido e freia), cor em três tempos e um clarão preso ao CENTRO.
  ⚠️ Ela **não** herda a gravidade nem a chuva dos fogos: aquilo é pirotecnia vista do chão, e aqui é uma
  estrela morrendo no vácuo — não há "para baixo".
  ⚠️ Um `ORA` que não existia no tema `dusk` passou pelo import e só quebraria NA PARTIDA (identificador
  dentro de um `case` só é avaliado quando o efeito acontece). Daí a folha de texturas ter ganhado os
  efeitos de estrela e a supernova em quatro tempos: **é a única forma de ver esses efeitos fora de
  partida**, e `drawPrims` também ganhou o `case "arc"` que faltava — sem ele o `stuck` sumia da prévia.
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
- **QUALIDADE NASCE EM ALTA, E A BAIXA DEIXOU DE SER ILEGÍVEL** (`ECON_K`/`resDe`/`nivelDeBoot` em
  `game/index.js`, `NAME_MIN_PX` em `layers/Planets.js`). O nível econômico trocava
  `app.renderer.resolution` por **.8 ou .6 ABSOLUTOS** enquanto o CSS mantinha o canvas esticado a 100% —
  ou seja, não era "80% da nitidez", era 0,8 pixel de framebuffer por pixel de CSS. A perda é a razão
  `dpr/res`: num celular dpr 3 dá **3,75× de ampliação** no nível 1 e **5,0×** no nível 2. Aplicado ao nome
  do planeta, o piso `NAME_MIN_PX` era medido em px de CSS, então no pior caso permitido o "em" tinha 6 px
  de DEVICE, o contorno (11% do em) ficava SUB-PIXEL e o miolo é translúcido de propósito (`nameFill` .68,
  para a arte aparecer por dentro) — contorno que some + miolo transparente + ampliação linear = a mancha.
  Três consertos: a resolução virou FATOR do dpr com piso em 1 (`ECON_K=[1,.7,.5]`), o piso do nome passou
  a ser medido em px de DEVICE (`fs*cam.scale*R.res`), e o BOOT nasce no nível 0.
  ⚠️ **O dedo deixou de ser motivo para começar no 1.** Ele existia para poupar ~1 s de frame pesado na
  entrada, e o preço era a partida INTEIRA borrada em todo celular — 1 s de gagueira contra 100% do tempo
  ilegível. Com o fator relativo o nível 1 também parou de ser ilegível, então o argumento perdeu as duas
  pontas. O que faz cair agora é EVIDÊNCIA DURA já medida no `createRenderer` e que não alimentava decisão
  nenhuma: `renderer.kind!=="webgl"` (o Pixi caiu para canvas 2D) ou `!R.mesh` (sem o pipe de malha).
  `hardwareConcurrency`/`deviceMemory` são palpite e por isso só chegam ao nível 1.
  ⚠️ **Voltar para "Automática" REASSENTA.** O ramo era `if(!econLevel)`, ou seja quem estava em "Baixa" e
  voltava para "Automática" ficava preso no nível 2 até a política descer dois degraus — e descer exige 2 s
  de frames rápidos MAIS o backoff, que começa em 30 s e dobra. Clicava e não acontecia nada por meio minuto.
  ⚠️ Nada disso mora em `quality.js`: a política continua PURA e conferida em tabela, e toda detecção de
  capacidade fica no chamador. O chip **"-18%"** da tela é o `#h-zoom` (o zoom manual da roda) e nunca teve
  relação com qualidade; o HUD, o placar e o radar são DOM/canvas próprio e não são tocados por `R.res`.
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

- **O "JOGAR (AUTO)" AGRUPA ATÉ O TETO E DEPOIS ESPALHA** (`server/src/rooms/matchmaking.js`,
  `ROOM.SOFT`/`ROOM.SHARD_SOFT`, `RoomManager.findOrCreateRoom`): a regra era `abertas.sort(byPlayers)[0]`
  — **a sala mais cheia do CLUSTER INTEIRO** —, e essa linha só é inofensiva com um shard. Com vários ela
  é um ATRATOR: quem entra vai para a mais cheia, o que a deixa mais cheia; quando ela lota, a segunda
  mais cheia é vizinha dela no MESMO pod (nasceu quando aquele pod atendeu), e o shard inteiro é
  escolhido de novo. Medido em produção em 2026-09-05: **55 humanos e 4 salas no shard 2, a 1198m de
  CPU** (uma delas com 50 humanos + 15 preenchimentos), contra **1 humano em cada um dos outros dois
  shards, ociosos a 159m e 377m** — o jogo travando com dois terços da frota parada, e quem entrava caindo
  justamente na sala pior. Agora são dois tetos: `SOFT` (jogadores por sala) e `SHARD_SOFT` (planetas por
  shard); abaixo deles agrupa-se na mais cheia, acima abre-se outra sala.
  ⚠️ **`SHARD_SOFT` é CARGA PONDERADA, não contagem de planeta**, e a unidade é "um jogador humano".
  Medido em produção com a carga já distribuída (38h/0b/2 salas → 943m · 9h/26b/4 → 537m · 16h/93b/6 →
  953m), o sistema resolve em **sessão ≈ 21m, preenchimento ≈ 2m e SALA ≈ 76m de custo fixo** — ou seja
  uma sala vazia custa quase QUATRO jogadores, e isso confirma o profiling que já estava escrito aqui (o
  caro é o snapshot por sessão e a grade da comida por sala; o cérebro do bot é 1,2% do tick). Contar bot
  como planeta inteiro faria o pod recusar gente que ele aguenta; ignorá-lo deixaria passar o pior caso —
  o lobby de Battle Royale com 2 pessoas e 48 bots. Havia QUATRO desses no mesmo pod.
  ⚠️ **É teto de ENTRADA, nunca de permanência**: ninguém é removido de uma sala por ela passar do SOFT, e
  a sala continua ABERTA (`acceptsJoin` não mudou) — código, convite e equipe entram até `ROOM.MAX`, que é
  o que faz o amigo cair na sala do amigo mesmo cheia. O que muda é só para onde vai o PRÓXIMO que clicar
  em JOGAR.
  ⚠️ **Os dois caminhos precisam concordar**: `/api/auto` (a porta de toda entrada do cliente, via
  `play()`) e o `findOrCreateRoom` do `wsServer` (join sem código). Consertar só o primeiro deixaria o
  segundo empilhando em silêncio.
  ⚠️ **O HPA NÃO CONSERTA ISTO, e é o contrário: ele fica cego.** Ele escala por CPU MÉDIA
  (`AverageValue: 700m`), e 1198+377+159 dá média 578m — abaixo do alvo, ou seja "está tudo bem" com um pod
  saturado. E mesmo subindo não adiantaria: **um shard novo só recebe quem entrar DEPOIS**, e com o auto
  mandando todo mundo para a sala mais cheia ele nasceria vazio e ficaria vazio (é o que o shard 0, com um
  jogador, provava). Autoescala não é substituta de distribuição — ela só passa a valer alguma coisa
  depois que a carga se espalha.
  ⚠️ `escolheSala` é PURA e devolve `null` para "crie uma NESTE shard" — quem cria é o pod que atendeu, e
  como o Ingress balanceia `/api` entre os pods, a escolha do shard novo já sai sorteada de graça. Não há
  rota para criar sala num irmão, e não precisa haver.
- **O PREENCHIMENTO É O QUE FALTA, NÃO UMA COTA FIXA** (`Room.botAlvo`, `Sim.botGate`, `Room._trimTick`,
  `ROOM.BOT_TRIM_TICKS`): `ROOM.BOTS` era o alvo ABSOLUTO, então a sala com **50 humanos carregava os 15
  preenchimentos do mesmo jeito** — 15 cérebros, 15 planetas e 15 linhas de placar que ninguém pediu, no
  pod que já estava saturado. O alvo passou a ser `BOTS − humanos`: sala vazia continua abrindo com a
  semente de sempre (`ROOM.BOT_SEED`, que é o que impede uma sala sem nada para perseguir) e sala com
  gente vai ficando só com gente.
  ⚠️ **A queda é por ATRITO primeiro**: o bot que morre não volta se estiver acima do alvo (`botGate`, no
  `_died`), e só o excedente que sobra é REMOVIDO — um a cada `BOT_TRIM_TICKS`, o mais LONGE de qualquer
  humano. Arrancar quinze planetas de uma vez, dentro da tela de quem está jogando, seria trocar um
  defeito de custo por um defeito de tela.
  ⚠️ **Toda saída de bot tem que devolver o nick e a bandeira** (`Room._esqueceBot`), e é por isso que ela
  virou função própria: são DUAS saídas agora (o trim e o portão da morte), e a que esquecesse a limpeza
  faria a sala virar lista negra de nomes e de países — em silêncio.
  ⚠️ **Só o LIVRE.** No Battle Royale quem preenche é o LOBBY (`fillTo`), com curva própria: lá o
  preenchimento não é ambientação, é o adversário da partida.
  ⚠️ `have` em `topUpBots` DEIXOU de ser monotônico (era a premissa escrita ali). O cinto de segurança
  continua sendo o `f`, que decai com o tick da sala e zera em `SEED_WINDOW_TICKS` — ninguém vê um gigante
  nascer no minuto 25 porque a sala esvaziou.
- **QUANTA GENTE CABE: ~50 POR SHARD, E O TETO É UM CORE** (`scripts/loadtest.mjs`, medido em produção
  em 2026-09-03 com o cluster limpo). O gerador abre N sessões completas — guest pela API, WS no shard,
  `join`, INPUT a 20 Hz, ping a 1 Hz — e mede do lado de fora: RTT, bytes, snapshots, quedas. Escada:
  1 jogador (1 sala com 13 preenchimentos) = **~300m de CPU**; 50 jogadores (3 salas, 17 por shard) =
  **~680m**; 150 jogadores = **974–993m dos 1000m do limite**, com o RTT p95 saindo de 96 para 209 ms e
  desconexões por `RATE`. Banda: **3–6 KB/s por jogador**, ou seja rede não é o gargalo — CPU é.
  ⚠️ **Subir `limits.cpu` NÃO ajuda**: o servidor é Node single-thread, então um shard é um core por
  construção e já encosta nele. Quem escala é o número de SHARDS (processos), e cada um novo custa
  `replicas` + `SHARDS` no ConfigMap + um Service + um path de Ingress.
  **Feito: 3 → 12 shards, e 500 jogadores entram.** Medido em 2026-09-03 com o gerador acima:
  **500 de 500 dentro, 167 s estáveis, ZERO quedas, RTT p50 37 ms / p95 92 ms**, 9 616 snapshots/s e
  3,2 MB/s de banda. Custo: **8,5–9,6 cores dos 12**, o shard mais carregado em 790–918m de 1000m, e
  **565–606 Mi somando os DOZE pods** (~50 Mi cada, contra 512 Mi de limite) — memória nunca foi o
  gargalo, e o Postgres também não (`max_connections` 600, 12×5 do pool).
  ⚠️ **`/ws/1` casaria `/ws/10`.** Os paths do Ingress são `pathType: Prefix`, que no nginx vira
  prefixo de string: os de DOIS dígitos são declarados PRIMEIRO em `k8s/30-ingress.yaml`, e o
  roteamento foi conferido shard a shard (conectar em `/ws/N` e ler o `shard` do JSON `room` — o 1º
  char do código da sala confirma: shard 10 abre sala "A…", shard 11 abre "B…"). Sem essa prova, o
  sintoma seria um jogador entrando na sala do shard errado, em silêncio.
  ⚠️ **O rollout do StatefulSet é SEQUENCIAL** (11 → 0, ~20 s por pod): durante ele, um shard por vez
  fica sem endpoint e o ingress responde 503 naquele `/ws/N`. Uma varredura dos 12 no meio de um
  rollout acusa "1 shard roteando errado" a cada rodada, em shards diferentes — não é roteamento, é o
  rollout. Espere `12/12 prontos` antes de medir qualquer coisa.
- **AUTOESCALA: SOBE SOZINHA, DESCE NA MÃO** (`k8s/50-hpa.yaml`, `autoscaling/v2beta2` — o cluster é
  1.21 e `autoscaling/v2` só existe a partir do 1.23). O HPA do servidor vai de 12 a 24 shards por CPU
  média de **700m** (o ponto em que o RTT começou a subir nas medições), com `scaleUp` de no máximo 4
  pods/min e **`scaleDown: Disabled`**: tirar um pod não redistribui carga, MATA as partidas que estão
  na memória dele. Reduzir shard é manutenção em janela, nunca reação a dois minutos de CPU baixa.
  Provado ponta a ponta baixando o alvo para 300m sob 500 jogadores: **12 → 16 → 20 → 24 em três
  minutos**, a CPU média caindo de 660m para 400m, e os 24 `/ws/N` roteando certo depois (os shards
  novos abrem salas "C…", "D…" — o 1º char do código é o índice em base36).
  ⚠️ **`AverageValue`, nunca `Utilization`**: a porcentagem é sobre o REQUEST (200m), então um pod em
  750m — o normal com sala cheia — apareceria como 375% e o HPA iria ao teto na primeira partida.
  ⚠️ **O HPA só mexe em `replicas`**: Service `warspace-server-<n>` e path `/ws/<n>` do Ingress são
  PRÉ-CRIADOS até 24. Sem eles o pod novo sobe e fica inalcançável, sem erro em lugar nenhum — e
  `SHARDS` no ConfigMap é o mesmo TETO (24) para que os shards de pé já conheçam como peer quem o HPA
  subir depois; índice ainda sem pod só não resolve no DNS, o que falha rápido.
  ⚠️ **`replicas` SAIU dos dois manifestos** (StatefulSet e Deployment do cliente) porque declarado nos
  dois lugares cada deploy desfaria a escala do HPA. **E isso tem uma armadilha que só se aprende
  errando**: com server-side apply, tirar o campo do manifesto o REMOVE do objeto e o default (1) passa
  a valer — foi assim que 12 shards viraram UM no meio de um deploy. Por isso `scripts/k8s_apply.py`
  agora LÊ o `replicas` vivo do cluster e o reinjeta quando o manifesto não o declara: o deploy ficou
  cego para a escala em vez de destruí-la.
  ⚠️ **O jogador honesto é desconectado quando o servidor engasga**: com o tick atrasado, os INPUT
  acumulados chegam em rajada, o balde de `NET.RATE_INPUTS` (40/s, burst 60) estoura e 3 violações em
  10 s fecham a conexão com 4429. Ou seja, a saturação não degrada — ela EXPULSA, e expulsa mais quem
  manda a 30 Hz (o cliente de verdade) do que quem manda a 20.
  ⚠️ **500 contas de teste não se criam pela API**: `/api/auth/guest` é 30/h por IP e o IP está cego
  (ver o bloco abaixo), então o teto real é 90/h no site inteiro. O gerador cacheia os tokens em disco
  e REUSA cada conta em vários sockets — o que o servidor recusa é o mesmo nick DENTRO de uma sala, e
  `findOrCreateRoom` já desvia disso sozinho.
- **O CUSTO DE UMA SALA É A GRADE DA COMIDA, NÃO OS BOTS** (`ensureFoodGrid` em `physics/world.js`,
  `scripts/prof-room.mjs` + `--cpu-prof`): a suspeita óbvia estava errada. O cérebro dos preenchimentos
  é **1,2%** do tempo; o maior item isolado é a reconstrução da grade espacial da comida — **3900 grãos
  reinseridos ~1× por tick, 120 µs cada, 36% a 61% do laço da sala**. A causa é `foodDirty`: basta UM
  grão ser comido (e sempre é, todo tick, com 30 jogadores na sala) para a grade inteira ser refeita,
  porque ela guarda ÍNDICES em `this.food` e o `_compact` do fim do tick reordena o array.
  **CONSERTADO** com `createPointGrid` (`physics/spatial-hash.js`): a comida ganhou grade PRÓPRIA em que
  o grão mora numa célula só (a do centro) e entra, sai e se muda em O(1) — comer é um `remove`, repor é
  um `insert`, e o ímã só paga quando o grão atravessa a fronteira de uma célula. Não há `build()`, e
  também não há carimbo de deduplicação (um item numa célula só não pode voltar duas vezes na mesma
  varredura). Medido: **0,339 → 0,162 ms por tick (−52 %, 2,1× mais sala por core)**, e o processo
  inteiro com 50 jogadores caiu de **18–20 % para 13–14 %** de um core — menos que o tick porque a outra
  metade do trabalho é rede, que não mudou. O teto teórico era 0,131; a diferença é o custo novo de
  `remove`/`move` e da consulta expandida.
  ⚠️ **O índice do grão tem que ser ESTÁVEL**, e é por isso que a comida deixou de compactar: `_compact`
  não toca mais em `this.food` (morrer abre um buraco que `foodFree` reusa) e quem apaga o `entityById`
  do grão morto é um laço próprio, porque era o `cp()` quem fazia isso.
  ⚠️ **`world.food` deixou de ser "os grãos vivos"**: ele tem os buracos da free list. Quem quer a
  população usa `world.foodAlive` (contador), e o laço de reposição parou de varrer 3900 posições por
  tick só para contar — era um segundo O(n) escondido ao lado do rebuild.
  ⚠️ **Quem mexe em comida à mão TEM que avisar**: `killFood(f)` é a única porta de saída (marcar `dead`
  na mão deixa um fantasma na grade e um slot que ninguém reusa) e `moveFood(f)` é obrigatório depois de
  escrever `f.x/f.y`. Foi exatamente isso que quebrou 18 pontos dos testes de `shared`, e é o preço
  honesto da estrutura: a grade não adivinha mais.
  ⚠️ **A ordem de visita mudou**, então a mesma semente NÃO dá mais a mesma sala de antes. Não quebra
  fio nem cliente (comida não é predita), mas quebrou um teste que media o raio do bot recém-chegado
  DEPOIS de 14 s — ele passava por sorte, e agora mede no tick do nascimento.
  ⚠️ `ensureFoodGrid()` ficou como **no-op** de propósito: os três chamadores a pediam antes de
  consultar e um deles é `shared/bot.js`, que vai para o bundle do `?local=1` — removê-la obrigaria a
  subir cliente e servidor no mesmo minuto.
  ⚠️ Depois dela vem o snapshot (`visitFood`/`visit` em `net/snapshot.js`, ~19%), que é custo POR SESSÃO
  e legítimo. `world.step`, `spatial-hash` e `_compact` fecham a conta; `Sim._consume` é 0,5%.
- **"POR IP" NÃO É POR PESSOA NESTE CLUSTER, E ISSO ERA UM TETO GLOBAL** (`auth/ratelimit.js`,
  `config.trustClientIp`): o ingress-nginx registra `10.32.0.1` para TODO MUNDO — medido batendo em
  cada nó pelo NodePort e lendo o log do controller, com o IP público conferido do lado de fora. O
  Service dele é `externalTrafficPolicy: Cluster` e o kube-proxy faz SNAT ANTES de o pacote chegar ao
  controller, então o IP do cliente já morreu quando o `X-Forwarded-For` é escrito. Com isso todo
  limite "por IP" virou um balde único dividido por todos os jogadores do mundo: provado com 400
  requisições a `/api/ranking`, **342 levaram 429** vindas de uma máquina só. E o pior caso não é esse
  — é `guest` (30/h por shard = **90 contas novas por hora no site inteiro**): num portal com tráfego,
  o 91º jogador da hora não consegue entrar, e nada no log diz que foi isso.
  ⚠️ **RESOLVIDO no mesmo dia, dos DOIS lados.** Na INFRA (ver Arestas): o controller do ingress foi
  fixado no `kube-master` — o nó por onde o tráfego entra — e o Service dele virou
  `externalTrafficPolicy: Local`, que é o que tira o SNAT do caminho. Medido depois: o log do ingress e
  o do jogo passaram a registrar o endereço público de verdade. No CÓDIGO, `config.trustClientIp`
  (`TRUST_CLIENT_IP`, hoje `1` no ConfigMap) diz se o endereço identifica uma pessoa; com ele falso o
  router escala os limites de IP por `IP_CEGO_K`, porque um balde coletivo tem que ser dimensionado
  pelo SHARD. `scope:'token'` fica de fora — a chave dele já é a pessoa.
  ⚠️ **O interruptor tem que acompanhar o ingress**: revertê-lo para `Cluster` sem baixar
  `TRUST_CLIENT_IP` devolve o teto global em silêncio. Prova dos dois estados, com 400 requisições de
  UMA máquina a `/api/ranking`: cego + escala = 400 passam; IP real + `TRUST_CLIENT_IP=1` = **178
  passam e 222 levam 429** (60/min × 3 shards), ou seja o abuso volta a punir só quem abusa.
  ⚠️ E só é seguro porque o ingress-nginx está com `use-forwarded-headers` DESLIGADO: ele SUBSTITUI o
  `X-Forwarded-For` pelo `remote_addr`, então o cliente não forja o próprio IP (foi tentado e medido).
  Ligar aquilo lá e este aqui ao mesmo tempo devolveria a forja a qualquer um. O teste de
  `persist.test.js` cobre as duas metades.

- **A AÇÃO DA TELA NÃO ROLA, E O CRITÉRIO QUE PROVA ISSO É NOVO** (`.dead-foot` em `ui.css`, critério 7 de
  `scripts/responsive-check.mjs`, `body[data-h]` em `useViewportMode.js`): a queixa era "no frame da Poki
  os botões não aparecem", e a causa NÃO era falta de rolagem — as três telas rolam. É a AÇÃO que rolava
  junto com o conteúdo, e os dois critérios da matriz que deviam pegar isso são estruturalmente cegos a
  ele: o de "clipado" PARA no primeiro ancestral rolável (que é o próprio cartão de morte) e o de "a caixa
  cabe" só vale quando NÃO há como rolar. A matriz voltava zero problemas com o RENASCER 184 px fora da
  vista. Medido depois de o critério 7 nascer: **24 de 34 combinações reprovavam**, e não só no frame de
  portal — iPhone SE, Galaxy S8 e até o iPad mini (5 px).
  ⚠️ **O conserto é UM só para as duas telas, mas o LUGAR muda porque o scrollport muda**: em `#s-dead`
  quem rola é o CARTÃO (os três temas lhe dão `overflow:auto`), em `#s-round` é a TELA. É exatamente a
  distinção que o revert de `ui.css:2102` descobriu ao contrário — sticky dentro de um cartão alto que não
  rola pousa por cima do próprio conteúdo. Por isso o `.dead-foot` é sempre o ÚLTIMO FILHO DE QUEM ROLA.
  ⚠️ **`min-height:min(420px,100%)` era o defeito de raiz da barra de navegação**, e ele é pré-existente:
  numa janela de 375 px o `100%` dá um piso de 375 px numa caixa que começa em `top:var(--screen-top)`.
  Medido no iPhone SE deitado: caixa de 15 a 390 numa janela de 375, com a `nav` (que é `sticky;bottom:0`
  dentro dela) parando **10 px FORA da tela**, em TODAS as telas com barra. O `min-height` vencia o
  `max-height` da regra de cima, que já fazia a conta certa. Hoje é
  `min(420px,calc(100% - var(--screen-top)*2))` — a mesma conta das duas pontas, escrita uma vez.
  ⚠️ **`ui.css:674` (o teto de 64% da folha de morte) era CÓDIGO MORTO**: sem `[data-style]` ele vale
  (1,2,1) e EMPATA com `:where(html[data-theme=…]) body[data-mode="portrait"] #s-dead .dead-card` dos três
  temas — e empate perde por ORDEM, porque `ui.css` é importado ANTES deles. Quem valia era o `max-height:90%`
  do tema, e é por isso que a folha tapava a partida inteira no celular apesar de o número existir aqui.
  O `[data-style]`, que `Dead.jsx` sempre escreve, leva o seletor a (1,3,1) e o faz existir.
  ⚠️ **`body[data-h="short"]` é a TERCEIRA dimensão** (`ehBaixa`, limiar 640 com a mesma histerese do resto):
  `data-mode` diz a FORMA e `data-pointer` a ENTRADA, e nenhum dos dois responde "cabe?" — 960×540 e
  1920×1080 são o MESMO `data-mode`. `@media` está fora pela regra da casa e porque o CDP da sonda fixa
  atributo, não media query. Ele acende também no celular DEITADO, e isso é correto: quem precisar do caso
  combinado escreve `[data-h][data-mode]`, que ganha por especificidade.
  ⚠️ **`#s-dead` é `pointer-events:none`** com `auto` no cartão e na barra: `.screen` é `absolute;inset:0`
  sem `pointer-events:none` (base.css) e o cartão é transparente nos três temas — ele já engolia HOJE todo
  clique destinado ao chat e ao radar de quem está assistindo.
- **A TELA DE MORTE RECOLHE PARA UMA BARRA** (`ui/SpecBar.jsx`, `body[data-dead="min"]`): no Battle Royale
  do celular o cartão tapava a partida inteira — e o jogo promete o contrário na própria tela
  (`LB.brWatchHint`). O botão existe em TODOS os modos e formas de tela: um controle que só aparece em
  algumas é uma segunda lista para manter em dia, e no frame de portal de 540 px o desktop precisa dele
  tanto quanto. Recolhido no desktop, `--rail-w:0` devolve a largura ao jogo (o ResizeObserver refaz câmera,
  zoom, AOI e `{t:"view"}` sozinho).
  ⚠️ A barra é **EXTRAÍDA**, não copiada: `Dead.jsx` e `Spectate.jsx` já eram o mesmo código duas vezes — o
  mesmo throttle de 200 ms, o mesmo par de setas e o mesmo listener de teclado com as MESMAS duas guardas
  (`e.repeat`, que evitava derrubar a conexão pelo balde de JSON, e a de campo de texto). Uma terceira
  cópia divergiria na primeira correção.
  ⚠️ O estado é `useState` LOCAL e não pref: pref viaja com a CONTA (a lição de `lbShow`) e a decisão é por
  MORTE. O reset é por `on`, nunca por `h.deadAt` — aquele par chega com throttle e no primeiro render é o
  da morte ANTERIOR.
- **O REPERTÓRIO FIXO DOS BOTS SAIU DE `constants.js`** (`server/src/rooms/botFrases.js`, três línguas):
  a queixa era "está soltando frases em português mesmo configurado em inglês", e o prompt já era 100%
  inglês — `BOT_LLM.IDIOMA` já funcionava. O que vazava era tudo o que **não passa pelo modelo**: o
  repertório fixo, que é o CHÃO e sai sempre que a LLM cai (disjuntor, teto de gerações, fila cheia — e
  ela cai muito mais do que se imagina), e os 12 **bordões** das personas, que entram LITERAIS no SYSTEM:
  com o idioma travado em inglês o prompt mandava, na mesma frase, escrever em inglês e terminar com
  "anota ai". O modelo obedecia aos dois.
  ⚠️ **UMA função decide a língua dos dois caminhos** (`idiomaDaFala`): dois caminhos decidindo isso
  separadamente é como se produz um bot que responde ao mesmo "hey bro" em inglês com a LLM de pé e em
  português quando ela cai. Em `auto` a ordem é a mesma de `montaPrompt` (mensagem dirigida → chat recente
  → pt-BR), e **só linha de HUMANO entra na detecção da sala**: o bot lendo a própria fala trava a sala na
  língua do chão para sempre.
  ⚠️ Os bordões foram TRADUZIDOS, não desligados: sem a risada a persona `zoeiro` e sem o "ok" a `mudo`
  deixam de ser personagens, e a persona é a única coisa que separa um preenchimento de outro na fala.
  ⚠️ O bloco de IDIOMA (`MARCAS`, `detectaIdioma`, `IDIOMA_NOME`, `idiomaFixo`) mudou de casa junto, para
  `botFrases.js`, e `botChat.js` o RE-EXPORTA: sem isso os dois módulos se importariam em ciclo.
- **O MÍSSIL MIRADO VAI NA PEÇA MIRADA** (`Body.targetPc`, `chasePiece` em `rules.js`): `aimTarget` VARRE
  peças mas gravava só `p.owner`, e `homeMissile`/`clusterSplit`/`aimLockAlive` resolviam com
  `firstLive(t.pieces)` — a PRIMEIRA peça viva por ordem de criação. Contra um jogador dividido em 8 o
  míssil ia atrás de outra bolinha, possivelmente do outro lado do mapa, enquanto o anel do cliente estava
  desenhado na peça certa (`lockOn` sempre soube qual era). **Só o servidor estava errado.**
  ⚠️ **`PROTOCOL_VERSION` fica em 15**: o pino é estado de servidor, como `aimLockId` e `weaponPin`, e o
  `e.target` do fio continua sendo o SLOT. Nada aditivo, nada reinterpretado.
  ⚠️ Alvo perdido: sem pino → `firstLive`, byte a byte o de sempre (é o que torna a mudança um NO-OP para o
  clique rápido, a auto-defesa, a interceptação e o bot); pino vivo → a peça mirada; pino morto → RE-FIXA na
  peça viva mais próxima do mesmo dono (na fusão a sobrevivente está encostada, então não há salto).
  ⚠️ **A guarda `!t.alive` não é decoração**: `World.removePlayer` faz `players.delete(slot)` enquanto os
  mísseis lançados continuam vivos — sem ela um quit banal derruba o tick da sala.
  ⚠️ **`incomingMissile` precisou entrar na mesma entrega**: os três chamadores passam `firstLive(pieces)`
  como referência, então um míssil mirado numa peça distante seria medido contra a peça errada e o alerta
  `self.threat`, a interceptação, a auto-defesa e o medo do bot ficariam cegos JUSTAMENTE para o tiro que
  esta mudança passou a mirar melhor. E o teste que "provaria" que não: com um alvo de UMA peça só,
  `firstLive` É a peça mirada e ele passa por construção, antes e depois — não prova nada.
- **O KIT DE BOAS-VINDAS** (`POWERUP.SPAWN_MAGNET_TICKS`/`SPAWN_FEAST_TICKS`, `_spawnPiece`): "o dobro do
  ímã" é o dobro da DURAÇÃO — o nascimento só entrega tempo, e o comentário antigo que falava em "1 carga"
  estava errado desde sempre. 420 → 840 ticks, mais o banquete por 600. Constantes PRÓPRIAS e não
  `TICKS*2`, no precedente de `PLAYER.SPAWN_R` × `START_R`: separar "o valor da mecânica" do "valor com que
  se nasce" é o que torna o segundo ajustável sem mexer no primeiro.
  ⚠️ **`Room.largar()` re-carimba os DOIS**: durante os `BR.CAGE_TICKS` de gaiola a fase 7 inteira sai sob
  `peace`, então nem atrair nem dobrar comida é possível e o kit queimaria sozinho antes da largada.
  ⚠️ **Custo de tick medido, com a bancada limpa: 0,557 → 0,671 ms** (+20%, teto 1,5). Com um Chrome
  headless rodando junto o mesmo teste dá 1,03 e depois 1,64 — a contaminação quase triplica, e é ela que
  leva a afrouxar um teto que não precisava ser afrouxado.
  ⚠️ **Dois testes quebraram e nenhum era o esperado**: `physics.test.js` media a referência de comida
  ANTES do banquete (a linha `normal` já saía dobrada, porque `addPlayer` passa por `_spawnPiece`), e
  `bot.test.js` tinha uma asserção presa a UMA semente — a cusparada de equipe é rara e situacional, e
  qualquer mudança de física desloca o stream do rng. Varrer sementes mantém o que o teste afirma.
- **SKIN COM ARTE VINDA DO BANCO** (migração 0014, `skin_art`, `SKIN_ART` em constants): as 35 caricaturas
  saíram da build e passaram a ser servidas do Postgres, e o /admin ganhou uma tela para criar skin nova
  sem tocar no código.
  ⚠️ **`skinId` É u8 NO FIO** (`encodePlayers` faz `.u8(p.skinId)` e `Sim.js` mascara com `&255`): o
  catálogo de código para em 127, então a faixa de banco é **128-255 e são 128 vagas, para sempre**. Um
  `ID_MIN=1000` faria a skin 1024 chegar ao cliente como 0 (Planeta Padrão) e a 1075 como 51 — colidindo
  com uma skin de código, em silêncio, para o dono e para a sala inteira. Há teste travando que nenhuma
  skin de CÓDIGO invada a faixa. Subir para u16 é inserção no MEIO do registro: sobe o `PROTOCOL_MIN` e
  derruba todo zip de portal congelado — é para uma janela em que os pacotes sejam reenviados de qualquer
  jeito.
  ⚠️ **`seedSkins` ganhou `AND source='code'`**, e essa linha é o que torna o painel possível: sem ela o
  primeiro pod a bootar DESATIVA toda skin criada no /admin (ela não está no bundle, por definição) e a
  compra passa a dar 404 sem uma linha de log. A faca de sempre continua valendo para as de código.
  ⚠️ **A arte NÃO viaja em base64**, e isso cumpre melhor o "carregado somente 1 vez" do pedido: base64 num
  JSON é 1,33× o tamanho, não é cacheável por item e obrigaria TODO jogador a baixar a arte de TODAS as
  skins em todo boot. Com bytes por URL carimbada com o hash + `immutable` de um ano, o navegador nem
  refaz a requisição. O molde inteiro é o avatar (0005), inclusive `nosniff` + CSP `default-src 'none'` —
  é a RESPOSTA, e não o validador, que fecha o buraco do arquivo disfarçado.
  ⚠️ **`paintPattern` decide ANTES do switch.** O despacho é por `sk.pattern`, então uma skin com arte no
  banco cairia no case do padrão PROCEDURAL dela (uma lendária continuaria desenhando a coroa) ou, sendo
  `plain`, no `return false` que leva ao emoji fantasma. Marcar a arte fora do `pattern` e esperar que
  `faceFile` resolvesse não funciona: aquele governa o DOWNLOAD e a CHAVE do cache, nunca o desenho.
  Sem o bitmap ele CAI no pattern de sempre — o degrade certo, e não um flash de disco liso.
  ⚠️ **A CHAVE do cache carrega o HASH** (`#84:abc123`): arte trocada no painel = chave nova = textura
  reassada no frame seguinte, sem F5 e sem `drop(key)`, que o TextureCache não tem.
  ⚠️ **A prévia do painel tem rota PRÓPRIA**: a pública exige `active`, e o fluxo prescrito é "sobe a arte →
  confere → ativa" — com uma rota só, a janela em que o admin precisa da prévia é exatamente a janela em
  que ela responde 404.
  ⚠️ **A rota de arte precisa de `rate` próprio**: sem ele ela cai no balde compartilhado de 60/min por IP
  (a chave `ip:*:<ip>`), que divide com `/api/config`, `/api/rooms` e `/api/ranking` — e `warmFaces`
  dispara um GET por skin distinta da sala, até 50 num Battle Royale.
  ⚠️ **As caricaturas VOLTAM a aparecer nos portais** (o `!PORTAL` de `faceFile` saiu), por decisão do dono
  do jogo. É o conteúdo que a CrazyGames reprovou ("IP sem direitos de posse", "uso explícito de política")
  e que a GameMonetize chamou de "AI-generated"; onze das 35 são políticos. O que o código faz é deixar a
  decisão REVERSÍVEL sem deploy. Os arquivos de `client/public/faces/` ficam como reserva até a migração
  provar em produção, e saem num commit seguinte.
- **QUATRO PARÂMETROS DE TELA NO /admin** (`FEED.SHOW`, `BR.INVITE_MUTE`, e o painel do BR e o XP sem
  interruptor): o kill feed nasce ESCONDIDO e o admin o religa; o botão "Silenciar" do convite de BR pode
  sumir. Os dois são `bool` de escopo **'wire'** — o feed e o card só existem DENTRO de uma sala, e o JSON
  `room` chega antes de qualquer snapshot (o molde `entryPanels` existe porque a tela de Modos é decidida
  ANTES de haver sala; não é o caso aqui).
  ⚠️ **`aplicaWire` DESCARTAVA `type:'bool'` EM SILÊNCIO** (`Number(true)` é 1 contra `min`/`max`
  indefinidos): o defeito estava dormente porque nenhum tunable `wire` era booleano, e estes dois caem
  exatamente nele. Há teste travando que nenhum tipo entre em `wire` sem passar por `aplicaWire` — ele
  falha com a mensagem certa quando o ramo é removido.
  ⚠️ **O feed continua visível para quem está ASSISTINDO** e para o ADMIN dentro da partida: `ui.css:505`
  deixa o feed ser a única coisa que sobra na coluna direita do morto, e escondê-lo esvaziaria a tela que o
  recolher acabou de criar.
  ⚠️ **`--brh` TEM que ser fiel à altura real do painel do BR**: chat, coluna direita e radar penduram
  offsets nele. Declarado baixo demais (56 contra uma altura real de ~61), os três SOBEM e passam a colidir
  com o próprio painel — a matriz pegou isso na primeira tentativa, com três colisões novas em `dead:duelo`.
  ⚠️ **A pref `brInvite` volta ao padrão APAGANDO a chave** (migração 0013), nunca gravando `true`: o padrão
  mora num lugar só (`PREF_DEFAULTS`) e `normalizePrefs` trata ausência como padrão. Gravar criaria uma
  segunda verdade que sobrevive à próxima mudança de padrão.
- **O PRÊMIO DA TELA DE MORTE** (`ui/premio.js`, `ui/DeadPrize.jsx`, `AD_GIFT_SKINS`): três mecânicas num
  bloco só, com prioridade "skin destravada > oferta de anúncio > nada" — empilhar três blocos numa tela
  que estava com os botões fora da dobra seria desfazer um pedido para entregar outro.
  ⚠️ **`skinsUnlocked` já chegava ao cliente e NENHUM componente o lia** — ele só engordava `sess.skins` em
  silêncio. Metade da máquina já existia.
  ⚠️ **`skinsForAchievements([...owned,...fresh])`, e não só `fresh`**: `achievements.unlock` devolve apenas
  as chaves realmente inseridas, então uma skin amarrada a uma conquista que a conta JÁ TINHA nunca era
  concedida. Uma linha, auto-corretiva (o `grantMany` devolve só o que inseriu).
  ⚠️ **Os tiers escolhidos são os ALCANÇÁVEIS**: `survive.d` (30 min numa vida) e `top1.g` (25 min em 1º)
  são inatingíveis numa rodada do Livre de 30 min — para o primeiro seria preciso entrar no tick 0 E
  sobreviver a rodada inteira, e o automático manda o jogador para a sala mais CHEIA com vaga.
  ⚠️ **DUAS regras de anúncio, e elas convivem porque as POOLS são disjuntas**: as três mascotes seguem o
  que a migração 0012 estabeleceu ao derrubar a 0011 — o anúncio DESTRAVA a compra, as moedas continuam;
  `AD_GIFT_SKINS` (raras de 600-900, ids que já existem) é DADA. Misturar as duas nas mesmas skins faria a
  Loja mentir, que foi exatamente o motivo de a 0011 cair. Há teste travando a disjunção.
  ⚠️ **`portal.temRecompensa` NÃO é `portal.ativo`**, e a diferença estava custando um botão morto: só a
  Poki implementa `recompensa()`, e nos outros seis portais o botão da Loja aparecia e o clique caía num
  `return false` silencioso. Os TRÊS pontos que liam `ativo` passaram a ler o novo.
  ⚠️ **O cartão de XP e o bloco de prêmio disputam a mesma tela**, e a condicional virou UM predicado: o
  `.lvup-wrap` é `inset:0;z-index:40` por 6,5 s e engoliria o primeiro clique. Ele também não aparece mais
  no BIG CRUNCH — ali ele cobre o resultado da sala.
- **ENTRA_DIRETO É MÚLTIPLA ESCOLHA DO /admin** (`ENTRY.DIRETO`, `PLATAFORMAS`, `entraDiretoEm`): deixou de
  ser a constante de build `PORTAL`. O tipo `multi` é o quarto do painel, com valor CANÔNICO em CSV —
  ordenado pela lista declarada, sem repetição. CSV e não array porque com string o `admin_settings.value`
  continua sendo a forma do `opt`, o memo `aplicados.get(key)===v` casa por VALOR (com array ele nunca
  casa e os 12-24 pods reaplicam e logam a cada 30 s) e a auditoria continua legível.
  ⚠️ **QUEM FILTRA É O CLIENTE**, e são três razões: `users.origin` é gravado UMA vez, no primeiro guest
  (quem criou a conta no site e depois joga na Poki carrega `warspace.io` para sempre); ele é um DOMÍNIO,
  não um id de portal; e vários portais servem de subdomínio POR JOGO. Quem sabe a plataforma é o
  `PORTAL_ID`, que é constante de BUILD — então a LISTA vem por `/api/config` e a comparação acontece lá.
  ⚠️ **Sem a lista, vale o comportamento de BUILD.** `/api/config` é disparado sem `await` no boot e o
  clique pode vir antes; não pisca porque o valor é lido DENTRO do clique, nunca renderizado.
  ⚠️ **A dependência não codificada continua**: isto só funciona com `ENTRY.NICK_AUTO` ligado — sem ele
  todo mundo entra como "Viajante-NNNN", que foi o argumento que segurou a generalização por meses.
- **A COROA DO MAIOR DO MAPA** (`paintCrown`, `proximoLider` em `WorldView.js`): molde exato do ícone de
  push-to-talk — sprite de tamanho CONSTANTE EM TELA na maior peça do líder, apoiado no aro. O líder sai do
  LEADERBOARD que já chega a 2 Hz com todos os vivos: **zero byte de protocolo**.
  ⚠️ **Histerese de 2%**: dois gigantes dentro da precisão um do outro trocam de topo a cada amostra, e sem
  folga a coroa piscaria meia vez por segundo — justo no duelo em que os dois estão na tela. O preço,
  declarado: ela pode discordar do "1º" do HUD por até 2% e por uma amostra.
  ⚠️ **Ela aparece no PRÓPRIO planeta** quando eu sou o líder: é a única coisa na tela que me diz o que
  todo mundo está vendo sobre mim — que eu sou o alvo. E não obedece ao modo econômico nem a
  `reduceMotion`: não anima, custa um sprite, e esconder quem está ganhando num aparelho fraco é amarrar
  informação de jogo ao hardware.
  ⚠️ **TRÊS pontas, e não as cinco da skin `crown`**: aquela é desenhada num disco de 128-512 px; esta vive
  a ~26 px de tela, e a 5 px por dente cinco pontas viram serrilha.
- **O NOME DO PLANETA FICOU MAIOR** (`size` .26 → .30, `nameFill` .68 → .82, `strokeWidth` .11 → .13,
  `NAME_MIN_PX` 10 → 11, nos TRÊS temas): o calibre está no próprio arquivo — a fonte avança ~.55 em por
  caractere, então `nameFitK` só morde acima de 3.345/m letras (12,9 com .26, 11,2 com .30), e o aumento
  chega inteiro a todo nick de até 11 letras. A translucidez do miolo existia para a arte da CARICATURA
  aparecer por dentro da letra — e skin com rosto não desenha nome desde o `!fc` de `Planets.js`.
  ⚠️ **O ATLAS TEVE que mudar de nome** (`pn3-` → `pn4-`): `nameFill` e `strokeWidth` são assados DENTRO do
  BitmapFont e a instalação é pulada por `Cache.has`. Em produção a página é nova e o atlas seria regerado
  de qualquer jeito — quem paga é o DEV, com o HMR devolvendo o atlas velho e a mudança "não funcionando".

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

- ✅ **O IP DO JOGADOR VOLTOU A CHEGAR — o controller do ingress mora no nó de ENTRADA e o Service é
  `Local`** (2026-09-03). Era assim que se perdia: `ingress-nginx-controller` é NodePort (30021/31066)
  e estava em `externalTrafficPolicy: Cluster` com o controller no `kube-worker-2`, enquanto o tráfego
  público entra pelo `kube-master` — o kube-proxy fazia SNAT para levá-lo até o pod e a origem morria
  ali, ANTES de o nginx escrever o `X-Forwarded-For`. Prova: batendo em cada nó pelo NodePort, o log do
  controller registrava `10.32.0.1`, `10.46.0.0` e `10.40.0.0` (a bridge de pods do nó de entrada) e
  nunca o endereço real — nem entrando pelo próprio nó do pod, porque com `Cluster` o SNAT é sempre.
  O conserto tem DUAS peças e a ordem importa: **primeiro** o controller vai para o master
  (`nodeSelector` + toleration a `node.kubernetes.io/unschedulable`), **depois** o Service vira `Local`.
  Invertido, o site cai na hora: com `Local` um nó sem pod do controller RECUSA a conexão, e são 41
  domínios de 12 namespaces pendurados nesse ingress (j4call, itm, gk, gv, igmash, nettools…).
  ⚠️ **A toleration não é enfeite**: o master é `cordon`ado de propósito, e é ela que mantém o pod lá
  (um `cordon` não expulsa quem já está, mas sem ela o pod não VOLTA depois de qualquer recriação).
  Nada de descordonar o master para resolver isso — com ele agendável, o rollout seguinte empilhou os
  três shards do jogo nele (foi o que aconteceu, e virou a `podAntiAffinity` de `k8s/10-server.yaml`).
  ⚠️ **O preço é redundância de ENTRADA**: com `Local`, só o master atende: se o pod do ingress cair,
  os 41 domínios caem juntos, sem o fallback que o `Cluster` dava. Reverter é um patch
  (`externalTrafficPolicy: Cluster`) — e aí `TRUST_CLIENT_IP` tem que voltar a 0 no mesmo movimento.
  ⚠️ Antes disso **nenhum log deste cluster tinha IP de cliente** (jogo, ingress e auditoria do /admin),
  e era por isso que os limites por IP eram tetos globais — ver o bloco em Arquitetura.
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

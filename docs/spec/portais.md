# Portais de jogo (o cliente hospedado fora de warspace.io)

GameDistribution, CrazyGames, Poki, itch.io, Y8, GameMonetize e GameFlare distribuem jogos HTML5 e pedem **um
.zip com
`index.html` na raiz**. O zip é só o **cliente**: eles hospedam os arquivos estáticos no domínio deles,
dentro de um `<iframe>`, e o servidor multiplayer continua sendo warspace.io. É o modelo normal de um
`.io` em portal — a CrazyGames diz na documentação que hospeda só os arquivos, a Poki aceita servidor
externo mediante liberação de CSP, e a GameDistribution tem a exceção por escrito (§3.1 do guia deles):
*"We do not permit external hosting of games, except for Real Multiplayer games"*.

```
node scripts/portal-pack.mjs gd|crazy|poki|itch|y8|gm|gameflare|all   → portal/warspace-<id>.zip
node scripts/brand-assets.mjs                         → brand/thumb-*.jpg (5 tamanhos de catálogo)
```

## As quatro coisas que mudam no pacote

| | site | pacote de portal |
|---|---|---|
| `base` do Vite | `/` | `./` (o portal serve de `https://html5.gamedistribution.com/<id>/`) |
| origem da API/WS | relativa (`location.host`) | absoluta, assada no bundle (`VITE_API_BASE`) |
| sourcemap | sim | **não** (entrega protocolo e predição a quem quiser trapacear) |
| Google Analytics | sim | **não** (regra 7 deles cita o produto pelo nome) |
| `lang` / `<title>` / `description` | pt-BR | **inglês**, sem citar outro jogo e sem citar o domínio |
| `faces/` (as 35 caricaturas) | sim | **não** (ver "O que NÃO vai no pacote") |

Tudo o mais é o mesmo código. O que decide é `client/src/portal/flags.js`, alimentado pelo `define` do
`vite.config.js`: os valores viram texto literal no bundle e o Rollup poda em cima deles — é isso que faz
o chunk do `/admin` e os adaptadores dos outros portais nem serem emitidos. ⚠️ Não use `import.meta.env`
ali: fora do Vite (o `node --test` de texturas chega em `faces.js`) ele não existe, e a leitura defensiva
que conserta o teste mata a poda — o zip da GD sai com o código da Poki dentro. Quem pegou isso foi a
guarda do `portal-pack.mjs`.

## O interruptor

`VITE_PORTAL_STRICT=1` (o campo `strict` de cada perfil em `scripts/portal-pack.mjs`) esconde cadastro
por Google, foto de perfil e a skin **Retrato**. Hoje está **desligado**: a decisão foi manter a conta e
assumir o risco da regra 7 ("any collection or storing of data from a game is strictly prohibited …
login requirements are not permitted unless permission is granted under a separate agreement").
Reprovou? Vira `true` e o pacote seguinte já sai limpo, sem retrabalho e sem tocar no site.

## Anúncios

Preroll e midroll são obrigatórios na GameDistribution (§2.1), com o jogo **pausado e mudo** durante o
anúncio e uma tela de pausa na volta que só sai por ação do jogador.

- **Ponto único: `play()`** (`client/src/state/actions.js`), a porta por onde passam Modos, Salas,
  convite, equipe, o respawn da tela de morte e a sala nova depois do BIG CRUNCH. O tipo sai de
  `played`, que já significa "já entrou em partida nesta carga": a primeira é preroll, as seguintes são
  midroll, com o intervalo mínimo de `PORTAL.MIN_AD_MS` guardado pela fachada.
- **No respawn, nunca no instante da morte**: atrás da tela de morte a rodada continua correndo e o
  jogador está assistindo de propósito (troca de câmera, mapa, sala ao vivo). No respawn não há partida
  rodando, então "pausado e mudo" é verdade por construção, sem gambiarra.
- **Áudio**: `silenciaAnuncio()` (`client/src/audio/index.js`). ⚠️ `suspend()` **não** resolve — `sfx()`
  chama `resume()` a cada clique de UI, os caminhos de `play()` religam o contexto quando o veem parado,
  e o `wakeAudio` do jogo está pendurado no `pointerdown` da JANELA: um clique em cima do anúncio traria
  o som de volta por baixo dele. Por isso a flag entra no `masterVol()` **e** trava o `resume()`. E nada
  disso toca em `prefs.muted`, que é escolha do jogador, é persistida e tem tecla própria.
- **A tela da volta** é o `Pause` que já existe: sai só no clique do RETOMAR e larga o comando sem
  derrubar a conexão.

⚠️ **Nada rejeita e tudo tem relógio** (`PORTAL.SDK_MS`, `PORTAL.AD_MS`). O SDK é a primeira coisa que
um bloqueador derruba, e `showAd` às vezes não rejeita quando não há preenchimento — uma promessa
pendurada na frente do botão JOGAR é pior que anúncio nenhum.

⚠️ **Nomes**: nada de `ads.js`/`ad.js`/`banner.js` (o nome vai para a URL do chunk e há filtro de
bloqueador que casa isso na URL — o `import()` rejeitaria), e classes de CSS com prefixo `portal-`. Ver
o que `ad-wrap` fez com o painel /admin.

⚠️ O `import()` do adaptador é um **switch sobre literais**. Com `` import(`./${id}.js`) `` o Rollup
vira a chamada num glob e o zip da GameDistribution sai com o código da Poki dentro.

## O servidor

`ALLOWED_ORIGINS` e a camada de `server/src/http/cors.js` — ver `docs/spec/api.md`. O WebSocket não
precisou de nada (handshake não é sujeito a CORS); `WS_ORIGIN_CHECK` é um gate separado, que estreia em
`warn`. **O servidor vai ao ar primeiro**: um zip publicado antes do CORS pega o revisor exatamente no
estado que não conecta.

## Falha honesta

No site, servidor fora vira modo local com um toast. No pacote de portal isso não pode acontecer: o
jogador clicou num `.io` para jogar com gente, e um single-player silencioso **parece que funcionou**.
`servidorFora` (campo de topo do estado, nunca dentro de `overlays` — `go()` e `play()` reescrevem
aquele objeto inteiro) levanta `ui/Offline.jsx`, que fica até o servidor voltar.

## O que NÃO vai no pacote (e por quê)

As *Prohibited Practices* da GameDistribution batem em coisas que o jogo tem no site:

- **As 35 caricaturas** (`client/public/faces/`) **NÃO vão** no pacote. Elas são de pessoas reais e caem
  em duas regras ao mesmo tempo — *"use of intellectual properties without proper ownership rights"*
  (direito de imagem: Messi, Neymar, Elon Musk…) e *"explicit use of … politics"* (Trump, Lula,
  Bolsonaro, Putin, Zelensky, Milei, Macron, Xi, Modi). Chegou a valer o contrário, por decisão, com o
  risco escrito aqui — e o risco se realizou: CrazyGames e GameMonetize reprovaram, esta última citando
  "AI-generated games", que é o que 35 caricaturas geradas parecem antes de qualquer outra coisa.
  ⚠️ O corte tem DUAS metades e nenhuma serve sozinha: `!PORTAL` em `faceFile()`
  (`client/src/theme/faces.js`) e `"faces"` na `PODA` do `portal-pack.mjs`. Só a guarda deixaria os 35
  arquivos dentro do zip, onde o NOME já entrega a identidade (`07_putin.webp` ao lado de
  `12_zelensky.webp`); só a poda faria o cliente pedir `faces/*.webp` e encher de 404 o console do
  revisor. ⚠️ E quem pergunta é `faceFile(skin)`, **nunca** `skin.face`: o campo do catálogo continua lá,
  e `layers/Planets.js` decide por ele se o planeta ganha NOME — lendo o campo cru, as 35 skins virariam
  discos lisos e anônimos no portal. Medido: o zip da Poki caiu de 1,32 MB / 63 arquivos para 757 KB / 26.
- **URL dentro do jogo**: *"placing contact details or website URLs within the game itself"*. O texto da
  tela de servidor fora dizia "o servidor do warspace.io"; agora diz "o servidor do jogo".
- **Google Analytics** é citado nominalmente na mesma lista, junto de "any outgoing links".
- **O botão "entrar com Google" também sai** — do pacote inteiro, não só de dentro de iframe. A origem de
  um portal não é registrável nas "Origens JavaScript autorizadas" do client_id, e a tentativa suja o
  console do revisor: `403` no `button?type=icon…` e «[GSI_LOGGER]: The given origin is not allowed for
  the given client ID» (medido no revision da GameDistribution, aberto em aba de topo).

## As thumbnails

**JPG** (não PNG), nos tamanhos exatos **512×384, 512×512 e 200×120** — mais **1280×720** e **1280×550**,
que eles recomendam. Sem bordas arredondadas, sem distorção, e "combine colors, shapes and characters":
por isso `scripts/brand-assets.mjs` monta a cena com os planetas do menu, o míssil (movimento) e o céu,
em vez de só a marca. ⚠️ A de 200×120 sai **sem tipografia**: a 120 px de altura qualquer texto vira
mancha, e é a que mais aparece nas grades dos publishers.

## CrazyGames: conta e sala (o "Full")

Eles pedem mais que a GD, e o jogo atende:

- **Conta**: `SDK.user.getUserToken()` a cada carga → `POST /api/auth/crazygames`, que verifica o JWT
  (RS256, chave em `sdk.crazygames.com/publicKey.json`, com cache e re-fetch) e liga a identidade
  `provider='crazygames'` — a mesma tabela do Google, sem migração. Bearer de convidado é PROMOVIDO, para
  ninguém perder moedas e skins no primeiro login. O `username` deles vira `display_name`, que é o nome
  que o jogo mostra (requisito: *"CrazyGames usernames must be displayed in-game"*).
  ⚠️ O perfil `crazy` do empacotador vai com **`strict: true`**, e não é escolha: eles proíbem
  *"logging out and allowing login with external options (Facebook, Google, email)"*.
  ⚠️ Botão de login no canto superior direito, nunca como CTA principal (`ui/PortalLogin.jsx`), e o
  prompt só abre por clique. Sem login, joga-se como convidado — eles exigem que isso continue possível.
- **Sala**: `updateRoom({roomId, isJoinable, inviteParams})` quando a conexão abre, `leftRoom()` ao sair,
  `addJoinRoomListener` para o amigo que aceita o convite (cai no mesmo `entrarPorConvite` do link
  `?sala=`) e `inviteLink` no botão de convite. O `roomId` é o nosso código de sala, que já é único no
  jogo inteiro — que é exatamente o que eles exigem dele.
- **Áudio**: `game.settings.muteAudio` é o mudo do site deles e tem prioridade sobre o ajuste interno;
  vai pelo mesmo caminho do mudo de anúncio, sem tocar em `prefs.muted`.

## As regras que reprovam

Do guia da GameDistribution, as que encostam no código: **§2.1** preroll+midroll obrigatórios, jogo
pausado e mudo, tela de pausa na volta · **§3.3** iframe e fullscreen sem cortes, 800×600 como tamanho
padrão · **§4.1** idioma padrão inglês (o `resolveLang` já cai em inglês para quem não fala pt/es) ·
**§5.1** thumbnails em JPG, 512×512, 512×384 e 200×120 · **§5.3** descrição e instruções em inglês, 200–500
caracteres · **§6.1** nenhum link de saída, o que inclui o convite de sala (no pacote ele é só o
CÓDIGO) · **§6.3** nenhuma referência a app store · **§7** nada de coleta de dados nem tracker de
terceiro.

Falta publicar uma **política de privacidade** (a Poki exige e o upload de foto pede uma). Ela mora no
site e a URL vai no formulário do portal — nunca como link dentro do jogo, que é a §6.1.

## Verificar antes de subir

1. `node scripts/portal-pack.mjs gd` — as guardas do script abortam em Google Analytics no bundle,
   caminho absoluto, sourcemap, origem que não foi injetada e mais de um adaptador.
2. Servir o pacote **num subcaminho** de outra origem e jogar de verdade contra a produção:
   `python3 -m http.server 4173 --directory portal` e abrir `http://127.0.0.1:4173/gd/dist/`.
   ⚠️ Servir na raiz passa mesmo com a base quebrada — é o subcaminho que reproduz o portal.
3. No DevTools: nenhum 404 de asset · o `OPTIONS` antes do `POST /api/auth/guest` · **exercitar PATCH e
   DELETE** (trocar uma preferência, remover um avatar), que é onde um CORS só com GET/POST quebra
   depois de ter passado no boot · WS em 101 · `faces/*.webp` vindo do pacote · e um `fetch` explícito
   em `/api/avatar/<id>`, porque a foto falha dentro de um `catch{}` mudo.
4. Num `<iframe>` de 800×600, não em aba de topo: aba de topo esconde storage particionado, autoplay e
   permissões — exatamente o que quebra num portal.
5. Por fim, o link de revisão da própria GD (`https://revision.gamedistribution.com/<id>/?correlator=…`).

## GamePix: o `ads.txt` é do SITE, não do pacote

O GamePix tem duas portas, e elas não se parecem. Pela porta de *desenvolvedor* (Games Catalog) vale
tudo o que está acima. Pela de *publisher* (**Properties**) o domínio é registrado como propriedade —
warspace.io é a `24C97` — e aí o que eles pedem não é zip nenhum: é o arquivo **`/ads.txt` na raiz do
domínio**, que é o padrão do IAB para dizer quem está autorizado a vender o inventário de anúncio de um
site. Sem ele a propriedade fica `ads.txt: NOT VALID` / `Status: PENDING` e não monetiza.

O conteúdo **não se escreve à mão**: é o template deles, servido em
`https://my.gamepix.com/assets/<data>-property-ads-v2.txt` (878 linhas, 39 KB), com `{id}` trocado pelo
id da propriedade na primeira linha. É exatamente o que o botão *Verify ads.txt* → *Copy* entrega no
painel. Ele vive em **`client/public/ads.txt`**, byte a byte igual ao deles — nada de comentário nosso
no meio, porque quem confere é um robô que compara linhas.

⚠️ **O `try_files` faz um arquivo ausente virar a SPA, com 200.** É a armadilha de verdade aqui: sem o
arquivo, `GET /ads.txt` respondia `200 text/html` com o `index.html` inteiro, e o robô do GamePix lia
aquilo como um ads.txt inválido — não um 404, um 200 mentindo. Vale para toda verificação de domínio
que ainda vier (Search Console, outra rede de anúncio): o arquivo tem que EXISTIR em `client/public/`,
senão o nginx responde a página do jogo e o erro do outro lado não diz nada disso.

⚠️ **Ele é podado do pacote de portal** (`PODA` em `scripts/portal-pack.mjs`). Um ads.txt só é lido na
raiz de um domínio; dentro do zip ele iria para `html5.gamedistribution.com/<id>/ads.txt`, onde ninguém
o lê — mas onde estaria declarando, no jogo que se manda para a revisão de um portal, os parceiros de
anúncio de uma rede concorrente.

⚠️ **A lista envelhece.** A primeira linha carrega `#gpx-last-updated-<data>` e o painel acende
"You are required to PUBLISH AND UPDATE your Ads.txt" quando eles mexem nela. Atualizar é rebaixar o
template, trocar o `{id}` e publicar o cliente de novo.

## Y8 (`developer.y8.com`)

Painel próprio (BETA), separado do `y8.com/upload` antigo: **Basic Info · SDK Initialization · Builds ·
QA · Leaderboard · Achievements**, com *Request Review* no alto. O jogo é `war_space`, **Game ID
`281845`** e **App ID `6a94f08b7d2d9d6de36661db`** — os dois saem da aba *SDK Initialization* e são
coisas diferentes: o App ID identifica o estúdio/aplicativo (`appConfig`) e o Game ID identifica este
jogo no inventário de anúncio (`adConfig`). O build vai em *Builds* → **Drag & drop ZIP**, com
**"Adapts to any size or aspect ratio"** marcado, que é o nosso caso ("Games must be responsive to be
approved on Y8").

⚠️ **A origem que importa é `storage.y8.com`, e foi MEDIDA.** Um zip de estúdio passa a rodar em
`https://storage.y8.com/y8-studio/html5/<estúdio>/<jogo>/index.html` — quem faz as chamadas à nossa API
é esse documento, não a página `www.y8.com` em volta do iframe. Liberar `www.y8.com` seria a resposta
errada, e o sintoma seria o pior possível: o pacote carrega, desenha o menu e o JOGAR não conecta.
`https://*.y8.com` cobre os dois e o apex. Quem trava isso é
`server/test/cors.test.js`, que lê o `k8s/05-config.yaml` de verdade e confere a origem real de cada
portal empacotado — a prova negativa foi feita: tirar a entrada reprova o teste.

⚠️ **O SDK deles é a Ad Placement API do Google (AFP) com outra roupa.** `preloadAdBreaks`, os quatro
`type` (`start|pause|next|browse`) e o `adBreakDone(info)` com `breakStatus` vêm de lá — o que explica o
mapa `preroll→"start"` e `midroll→"next"`. Duas consequências práticas: o dinheiro é AdSense (no modelo
AFP quem paga é o Google, na conta do desenvolvedor) e o `type:"start"` é, por definição, o anúncio de
ENTRADA da sessão, que é exatamente o que `play()` faz na primeira vez.

⚠️ **`autoLogin: false`, contra o snippet do painel.** Eles geram `autoLogin: true` + `onAuth(...)`, mas
a conta aqui é a do warspace.io e nós não consumimos o `onAuth`: pedir uma autenticação para jogar o
resultado fora é chamada de rede e risco de UI de graça. Integrar a conta do Y8 de verdade é outro
trabalho, do tamanho do que a CrazyGames pediu (`server/src/auth/crazygames.js`) — e é o que
destravaria as abas *Leaderboard* e *Achievements* do painel deles, hoje vazias por escolha.

⚠️ **O adaptador não usa `pausou`/`retomou`.** Diferente da GD, que pausa o jogo sozinha com
`SDK_GAME_PAUSE`, o Y8 só anuncia quando nós chamamos — e a fachada já cala o som antes e levanta a tela
de pausa depois. O que o adaptador precisa garantir é o CONTRÁRIO: que a promessa sempre termine. São
quatro saídas independentes (`afterAd`, `adBreakDone`, a promessa do `showAd` e o relógio da fachada),
porque `afterAd` só sai quando um anúncio de fato tocou e `adBreakDone` é o único que sai sempre.

⚠️ **O `y8sdk.ready` pode já ter passado.** O adaptador é um chunk sob demanda e o script vem do cache:
o listener é registrado ANTES do `carregaScript` e, depois dele, ainda se chama `emitReadyEvent()` — que
existe na API deles exatamente para isso.

## GameMonetize (`gamemonetize.com`)

**Game ID `73u3oghoe3br3wpmg3yswmos8pkb3gt1`** (o hash de 32 caracteres do painel deles), empacotado com
`node scripts/portal-pack.mjs gm`.

⚠️ **O jogo roda no `.co`, não no `.com`.** O site é `gamemonetize.com`, mas o feed público deles
(`gamemonetize.com/feed.php`, que é a fonte de verdade sobre onde cada jogo mora) devolve
`https://html5.gamemonetize.co/<gameId>/` — e o gameId É o caminho. Liberar só `*.gamemonetize.com` em
`ALLOWED_ORIGINS` daria o sintoma de sempre: carrega, desenha o menu, o JOGAR não conecta. Estão
liberados os dois TLDs, e `server/test/cors.test.js` trava a origem medida.

⚠️ **O SDK é o da GameDistribution de primeira geração com outro nome**: o mesmo `window.SDK_OPTIONS`
lido na CARGA (por isso ele é escrito antes do script), os mesmos `SDK_GAME_PAUSE`/`SDK_GAME_START` e a
mesma ambiguidade — o `SDK_GAME_START` também sai quando o SDK termina de inicializar, sem anúncio
nenhum. A guarda de `gd.js` está repetida em `gm.js` por isso: só fecha promessa PENDENTE.

⚠️ **`showBanner()` é o intersticial** (o nome é herdado) e **não devolve promessa**. Na GD o `showAd()`
rejeitava sem preenchimento, e isso era uma segunda saída; aqui sobram duas — o evento e o relógio de
`PORTAL.AD_MS`. É o adaptador com menos rede de segurança dos seis, e é por isso que o relógio da
fachada não é luxo.

⚠️ **O arquivo é `gm.js`, não `gamemonetize.js`**, pela mesma regra que proíbe `ads.js` aqui: o nome vira
a URL do chunk e há filtro de bloqueador que casa palavra de publicidade no caminho. E o id do `<script>`
é `gamemonetize-sdk`, o mesmo do carregador oficial, para nunca haver duas cópias do SDK na página.

## GameFlare (`distribution.gameflare.com/developers/`)

Sétimo portal, e o **primeiro depois do itch.io a não ter SDK nenhum a integrar**. A plataforma por trás é
a GameArter (mesma empresa); a porta de desenvolvedor é `distribution.gameflare.com/developers/`.

O que eles pedem, na letra do FAQ deles:

> *"We accept any HTML5-based games. If you need to connect users to your server (for example in
> multiplayer game), the game must support secure (https) protocol."*
> *"What do you need to upload your game? Only game files. Screenshots are optional."*

Ou seja: multiplayer com servidor externo é aceito **por escrito**, e a única exigência técnica é HTTPS —
que warspace.io já é. Não há formulário de SDK, não há id de jogo a assar no bundle, e o perfil do
empacotador é `env: {}` como o do itch.io.

⚠️ **A ORIGEM É `data.gameflare.com`, e não é o domínio do site.** Há três hosts em volta e só um importa:

| host | o que é |
|---|---|
| `www.gameflare.com` | o portal deles, a página em volta |
| `distribution.gameflare.com` | o invólucro que os publishers embutem (`/embed/<slug>/`) |
| **`data.gameflare.com`** | **os arquivos do jogo — é aqui que o nosso código roda** |

Medido no feed público deles (`distribution.gameflare.com/feed.json`, 164 jogos), abrindo os invólucros e
lendo o `<iframe>` de dentro. Um jogo HTML5 é servido de:

```
https://data.gameflare.com/games/<id>/<hash>/index.html
```

(`splatcha` → `/games/11428/Cxe71CTmnSNgbj/`, `tic-tac-foe` → `/games/11239/Xws6h9FgL5JHGr/`,
`platform-kid` → `/games/11216/H5lIVLuXBJRTTJ/`.) Liberar `www.` ou `distribution.` daria o sintoma de
sempre — carrega, desenha o menu e o JOGAR não conecta. `ALLOWED_ORIGINS` leva `https://*.gameflare.com`,
que cobre os três e o `cdn.gameflare.com` de jogos mais antigos.

⚠️ Repare no CAMINHO, não só no host: `/games/<id>/<hash>/` é **dois níveis de subcaminho**, então a
`base:"./"` do build de portal não é luxo aqui — com base absoluta o `/assets/…` é 404 e a página fica
branca. Verificado servindo o pacote em `127.0.0.1:4173/games/11428/Cxe71CTmnSNgbj/`: 18 recursos, zero
falha.

⚠️ **Quem anuncia é a PÁGINA DELES, não o jogo.** O invólucro carrega `gameflare-asdk.min.js` e roda o
preroll no `#adsense-container` antes de criar o iframe do jogo — por isso o iframe fica em `/loading/`
enquanto o anúncio toca. Não há nada a chamar do nosso lado, e é por isso que não existe
`client/src/portal/gameflare.js`: a fachada devolve `null` para id desconhecido e todo `anuncio()` vira
no-op, exatamente como no itch.io. O SDK que eles oferecem é **opcional** e é de **sitelock**
("*Simple sitelock integration · It is optional*"), não de anúncio — integrá-lo travaria o jogo nos
domínios deles sem trazer receita nenhuma.

⚠️ O iframe deles **não tem `sandbox`** (medido no atributo, não no palpite), então a origem chega como
`https://data.gameflare.com` de verdade e não como `null` — que o nosso matcher recusa por construção. O
`allow` é `"autoplay; fullscreen"`: **sem `microphone`**, então o push-to-talk do K não existe lá (degrada
sozinho, `audio/mic.js`), e sem `clipboard-write`, que é por que o convite cai no caminho de mostrar a URL.

Revenue share: 85 % para o desenvolvedor nos sites do GameFlare, 50 % nos sites dos publishers da rede
deles. Pagamento mensal, mínimo de 50 €.

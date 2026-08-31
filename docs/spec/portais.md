# Portais de jogo (o cliente hospedado fora de warspace.io)

GameDistribution, CrazyGames, Poki e itch.io distribuem jogos HTML5 e pedem **um .zip com
`index.html` na raiz**. O zip é só o **cliente**: eles hospedam os arquivos estáticos no domínio deles,
dentro de um `<iframe>`, e o servidor multiplayer continua sendo warspace.io. É o modelo normal de um
`.io` em portal — a CrazyGames diz na documentação que hospeda só os arquivos, a Poki aceita servidor
externo mediante liberação de CSP, e a GameDistribution tem a exceção por escrito (§3.1 do guia deles):
*"We do not permit external hosting of games, except for Real Multiplayer games"*.

```
node scripts/portal-pack.mjs gd|crazy|poki|itch|all   → portal/warspace-<id>.zip
node scripts/brand-assets.mjs                         → brand/thumb-*.jpg (5 tamanhos de catálogo)
```

## As quatro coisas que mudam no pacote

| | site | pacote de portal |
|---|---|---|
| `base` do Vite | `/` | `./` (o portal serve de `https://html5.gamedistribution.com/<id>/`) |
| origem da API/WS | relativa (`location.host`) | absoluta, assada no bundle (`VITE_API_BASE`) |
| sourcemap | sim | **não** (entrega protocolo e predição a quem quiser trapacear) |
| Google Analytics | sim | **não** (regra 7 deles cita o produto pelo nome) |

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

- **As 35 caricaturas** (`client/public/faces/`) são de pessoas reais, e caem em duas regras ao mesmo
  tempo: *"use of intellectual properties without proper ownership rights"* (direito de imagem — Messi,
  Neymar, Elon Musk…) e *"explicit use of … politics"* (Trump, Lula, Bolsonaro, Putin, Zelensky, Milei,
  Macron, Xi, Modi). No pacote, `faceFile()` devolve null e o planeta cai no disco liso da skin — o mesmo
  caminho que já existia enquanto a arte não chegava. O empacotador ainda apaga a pasta (−624 KB). O
  easter egg continua valendo no site.
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

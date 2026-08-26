# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                  # only dependency is `ws`
npm run dev                  # STATIC_DIR=client node server/server.js — http://localhost:3000
./scripts/build-push.sh      # builda e publica evandromoura/planet-io-{server,client} (após docker login)
./scripts/deploy.sh          # aplica k8s/ no cluster (namespace planet); PLANET_HOST=... inclui o Ingress
```

There is no build step, no test suite, no linter. Verification is manual: `npm run dev` and open
http://localhost:3000. To exercise multiplayer, open two browser tabs — each tab generates its own
random `player_<uid>`, so they join as distinct players in the same room.

## Layout

```
client/   index.html, game.js  — front (React via Babel em runtime) + Dockerfile/nginx.conf
server/   server.js            — simulação autoritativa, WebSocket, API de salas + Dockerfile
k8s/      manifestos (namespace planet, StatefulSet de shards, client, ingress)
scripts/  build-push.sh, deploy.sh
mockups/  protótipos visuais descartáveis (6 modelos + o híbrido escolhido); fonte em mockups/src
```

## Arquitetura

### Front e back separados

O `server/server.js` **não serve mais os estáticos em produção** — só quando `STATIC_DIR` está
setado (modo dev). No cluster, o nginx do `client/` é a porta de entrada: serve os arquivos,
proxia `/api/*` para `planet-server-api` e `/ws/<shard>` para o pod daquele shard.

### Salas distribuídas por shard

Cada pod do backend é um shard com identidade estável (StatefulSet `planet-server-0/1/2`).
**O código da sala carrega o shard no primeiro caractere** (`1ABC` → shard 1), então o cliente sabe
em qual pod conectar sem estado compartilhado. `GET /api/rooms` agrega as salas de todos os shards
consultando os irmãos pelo DNS do headless service (`PEERS`/`PEER_HOST`) — não há Redis nem banco.

Endpoints: `/healthz`, `/internal/rooms` (interno), `/api/config`, `/api/rooms`, `/api/auto`.
Env: `SHARD`/`POD_NAME`, `SHARDS`, `PEERS` (explícito) ou `PEER_HOST`+`PEER_NAME`, `ROOM_MAX`,
`ROOM_BOTS`, `PORT`, `STATIC_DIR`.

### No bundler — index.html transpila em runtime

`client/index.html` puxa React 18 UMD e `@babel/standalone` do unpkg, faz `fetch` de `game.js` como
**texto**, remove a linha de import do React e o `export default` com regex, roda
`Babel.transform(..., {presets:[['react',{runtime:'classic'}]]})` e avalia o resultado dentro de um
closure que fornece `useState/useEffect/useRef/useCallback` como locais.

Consequências para qualquer edição em `client/game.js`:
- Manter exatamente a única linha `import { ... } from "react"` e o único `export default function PlanetIO()`.
  Qualquer outro `import`/`export` sobrevive à regex e estoura no eval.
- Só aqueles quatro hooks estão em escopo. Outras APIs do React via `React.*`.
- Nenhum pacote npm no cliente; a página também precisa de rede para o unpkg.
- O transform tem que continuar em `{presets:[['react',{runtime:'classic'}]]}`. O Babel 8 (o que o
  unpkg serve hoje) usa o runtime automático por padrão, injeta `import {jsx as _jsx}` e o script
  morre com "Cannot use import statement outside a module" — página em branco, erro só no console.

### Netcode autoritativo

`GameServer._tick()` roda a cada 16ms e emite o **mundo inteiro** (`players`, `food`, `viruses`,
`ejected`, `missiles`, `leaderboard`), que a `Room` serializa uma vez e manda para todos os sockets.
Não há delta, interpolação nem predição — `stateRef.current` é substituído por inteiro a cada tick.

Mensagens cliente → servidor (`WsClient.clientSend`): `join {id,name,skinId,room?}`, `move {tx,ty}`,
`split {tx,ty}`, `eject {tx,ty}`, `fire {}`. O `id` das mensagens que não são `join` é sobrescrito
no servidor com o id do socket.
Servidor → cliente: `room` (confirmação da sala), `gameState` (uma vez, no join), `tick`, `eaten`.

Pegadinhas que vêm de transmitir os objetos vivos:
- Tudo que estiver acessível a partir de um player/food/virus é serializado e enviado a cada tick.
  **Nunca guarde referência circular nem handle de DOM/socket em objeto do mundo** — o handler de
  tick engole o throw do `JSON.stringify` e o frame some para todo mundo (crash real, commit 7ad6d89).
- Campos com `_` são internos do servidor (`_tx/_ty`, `_missiles`, `_powerups`, `_state/_huntId/_fleeFromId`
  dos bots) mas vão no fio mesmo assim, e o HUD lê `me._missiles`. Renomear um exige mexer nos dois lados.

### Constantes duplicadas

`WORLD_W/WORLD_H`, `FOOD_COUNT`, `VIRUS_COUNT`, `MAX_PIECES`, `SPLIT_SPEED`, `MERGE_TIME_BASE`,
`FRICTION`, `EJECT_*`, `BOT_NAMES` e a tabela de skins existem **nos dois arquivos** e precisam ser
mudadas nos dois. `client/game.js` tem o `SKINS` completo (name, emoji, rarity, price, colors,
`unlockKey`); `server/server.js` guarda uma cópia reduzida `{id, color}` indexada igual — skin nova
precisa de `id` correspondente nos dois arrays, senão o jogador cai na skin 0.

### Salas e bots

`findOrCreateRoom()` devolve a sala **mais cheia com vaga** (agrupa jogadores em vez de espalhar);
`getRoom(code)` entra por código e cria a sala se o código for do shard local. Cada sala tem seu
`GameServer` com `ROOM_BOTS` bots. Os bots rodam wander/hunt/flee reavaliado a cada 25–70 ticks e
passam pelos mesmos caminhos dos humanos (`_splitPlayer`, `fire`). Bots renascem no lugar quando
comidos; humanos recebem `dead=true` e o evento `eaten`. A sala para o loop 30s depois do último
cliente sair e é removida do mapa pouco depois.

### Renderização (modelo "Neon Cinematográfico")

O desenho do canvas vive na seção `── TEMA ──` de `client/game.js`. **Regra de performance que não
pode ser quebrada**: nada de `shadowBlur` nem `createRadialGradient` por objeto dentro do laço.
Planeta, comida, vírus e massa ejetada são **sprites assados uma vez** (`sprite(key,size,draw)`,
com `tierOf(r)` escolhendo 128/256/512px por faixa de tamanho) e depois só `drawImage`.
O fundo (gradiente + nebulosa) é um canvas em cache por resolução; o parallax de estrelas são
`fillRect` de 1px com wrap; scanlines/vinheta/grão são overlay **CSS** em `client/index.html`
(`body::before/::after`), não canvas. `drawScene` faz culling de viewport — só desenha o que cabe
na tela. Medido: ~3ms/quadro em jogo normal e ~6ms no pior caso (orçamento de 60fps = 16,7ms).
Os protótipos em `mockups/` têm modo `?bench` (pior caso) e `?bench&leve` para medir de novo.

A cor da comida é quantizada em 12 matizes no servidor de propósito: é o que mantém o cache de
sprite pequeno. Não volte para `hsl(${Math.random()*360},...)`.

### Estado do cliente

A simulação vive em `stateRef` (ref, nunca state — o laço de render lê direto). React state é só
para UI: `screen` (`menu`/`shop`/`game`/`dead`), leaderboard, score, `gameMeta` e a lista de salas.

`gameMeta` (moedas, skins compradas, equipada, conquistas) é **só em memória** — sem localStorage e
sem persistência no servidor, some no reload. Compras na loja são maquete. Conquistas são checadas
no cliente dentro do handler de `tick`.

Cooldowns de dividir/ejetar, câmera, minimapa, botões DIVIDIR/EJETAR e o FPS são desenhados
imperativamente no fim do laço (`drawHud`) — não são componentes React. A geometria dos botões vem
de `hudButtons(W,H)`, usada tanto pelo desenho quanto pelo clique: mexeu em uma, mexeu nas duas.

## Convenções

- Estilo denso proposital: uma instrução por linha separada por `;`, pouco espaço em branco,
  comentários de seção `// ── SEÇÃO ──`. Acompanhe em vez de reformatar.
- Todo texto de interface é pt-BR; mantenha novos textos em pt-BR.
- Mensagens de commit: uma linha, imperativo, sem corpo.

## Kubernetes

Cluster do Evandro: `https://192.168.12.50:6443` (k8s 1.21, 4 nós com Docker), ingress-nginx v0.47
sem IngressClass, cert-manager com ClusterIssuer `letsencrypt-prod`, sem storage dinâmico e sem
registry privado (imagens vêm do Docker Hub). Kubeconfig em
`~/.config/OpenLens/kubeconfigs/68c0dd84-fd6a-43f2-bc30-26daccdf7ef4`.

O namespace é `planet`. Sem domínio, o teste é pelo NodePort `30800`
(`http://192.168.12.50:30800`); com domínio, `PLANET_HOST=... ./scripts/deploy.sh` aplica o Ingress
com TLS automático. Escalar shards significa mexer em três lugares: `replicas` e `SHARDS` no
StatefulSet, um Service por pod novo e o bloco `location ~ ^/ws/(\d+)$` já cobre qualquer índice.

## Arestas conhecidas

- `gameMeta` sem persistência (some no reload).
- O `finalScore` da tela de morte usa `p.score` do servidor, não a massa.
- Não há autenticação: qualquer cliente pode entrar em qualquer sala com o código.

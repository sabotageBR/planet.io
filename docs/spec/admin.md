# Painel de administração (`/admin`)

Uma rota da **mesma SPA** (`client/src/admin/`, chunk carregado sob demanda em `main.jsx`, no mesmo padrão
do `?sfx`). Nada de infraestrutura muda: o nginx do cliente já faz `try_files … /index.html`, então
`/admin` sempre serviu esta página. Quem só joga não baixa um byte do painel.

## Identidade

**Um admin é uma CONTA** (`users.is_admin`, migração 0008), não um login paralelo. Poderia ser uma tabela
à parte, mas `auth/tokens.js` resolve o Bearer com `SELECT u.*` — a coluna chega de graça em toda chamada
autenticada e em todo join de WS, sem uma segunda consulta. É o mesmo argumento que a migração 0005 usou
para `country`. E sem identidade não há auditoria que sirva: um log dizendo "admin" em vez de
"#42 evandro" não responde nada quando há dois moderadores.

**O token do painel é de outro tipo.** `POST /api/admin/login` emite um token `kind='admin'` (TTL 12 h), e
`requireAdmin` exige **as duas coisas**: `is_admin === true` **e** `token_kind === 'admin'`. É isso que
impede que roubar a aba do jogo de um administrador abra o painel — e que sair do painel deslogue do jogo.

⚠️ `POST /api/admin/login` devolve o **mesmo** `401 invalid_credentials` para senha errada e para conta
não-admin, sempre pagando o `dummyHash()`. Sem isso a rota vira um oráculo de quem é administrador.

**O primeiro admin** nasce pelo env `ADMIN_EMAILS` (`k8s/05-config.yaml`), reconciliado no boot — e ele
**só promove, nunca rebaixa**: rebaixar por ConfigMap significa que apagar uma vírgula tranca todo mundo
para fora. Rebaixar é ação do painel, auditada, com dois pisos: ninguém se rebaixa, e o último admin não
cai. Só vale para conta **registrada** (com senha), porque o painel entra pelo mesmo scrypt do jogo.

## Onde cada rota mora

| Camada | Rotas | Por quê |
|---|---|---|
| `server/src/api/admin.js` (router de persistência) | login/logout/me · contas · ban · moedas · tokens · promover · parâmetros · auditoria | tudo é linha de banco |
| `server/src/http/admin.js` (servidor de JOGO) | `rooms`, `rooms/:code[/kick\|close]`, `broadcast`, `live`, `kpis` | tudo é memória de sala |

⚠️ **`live` e `kpis` não poderiam morar no router de persistência nem se quisessem**: `createRouter`
responde UMA vez e sai (`sendJson(res,200,out)`), sem caminho de streaming a não ser o `RAW` do avatar — e
usá-lo seria reimplementar SSE dentro de um router feito para não streamar, com o rate limit por
requisição pesando numa conexão de uma hora.

É o mesmo corte que já separa `/api/me` de `/api/rooms`/`/api/party`.

⚠️ **`server/src/api/index.js` tem um `PREFIXES` que é um gate silencioso.** Uma rota `/api/admin/*`
ausente dele não chega ao handler: cai em 404 (ou no `staticDir`, em dev), sem uma linha de log. O teste
`server/test/admin.test.js` espera **401**, nunca 404, justamente para travar isso.

## Rotas

🛡 = `Authorization: Bearer pt_…` de token `kind='admin'` de usuário `is_admin`.

| método | rota | body | resposta |
|---|---|---|---|
| POST | `/api/admin/login` | `{login,password}` | `{token,admin}` · 401 `invalid_credentials` · 429 |
| POST | `/api/admin/logout` 🛡 | — | 204 |
| GET | `/api/admin/me` 🛡 | — | `{admin}` · 403 `forbidden` |
| GET | `/api/admin/users?q=&kind=&banned=&limit=&before=` 🛡 | — | `{users:[…],next}` — **sem e-mail** (é do detalhe), **com `origin`** |
| GET | `/api/admin/users/:id` 🛡 | — | `{user,tokens,ledger,matches}` · 404 |
| PATCH | `/api/admin/users/:id` 🛡 | `{nick?,login?,country?}` | `{user}` · 400 `bad_nick`/`bad_login` · 409 `login_taken` |
| POST | `/api/admin/users/:id/ban` 🛡 | `{days,reason}` — `days:0` desbane | `{user}` · 409 `self_ban` |
| POST | `/api/admin/users/:id/coins` 🛡 | `{delta,reason}` | `{coins}` · 402 `insufficient_coins` |
| POST | `/api/admin/users/:id/tokens/revoke` 🛡 | — | `{revoked}` |
| POST | `/api/admin/users/:id/admin` 🛡 | `{on}` | `{user}` · 409 `last_admin`/`self_demote` |
| GET | `/api/admin/settings` 🛡 | — | `{tunables:[{key,label,unit,scope,min,max,def,value,changed}]}` |
| PUT | `/api/admin/settings/:key` 🛡 | `{value}` | `{key,value,applied}` · 400 `unknown_key`/`out_of_range` · 501 `client_side` |
| DELETE | `/api/admin/settings/:key` 🛡 | — | `{key,value,applied}` |
| GET | `/api/admin/audit?limit=&before=&adminId=` 🛡 | — | `{rows:[…]}` |
| GET | `/api/admin/rooms` 🛡 | — | `{rooms:[…],shards:[{shard,ok}]}` — agregado dos pods que EXISTEM |
| GET | `/api/admin/rooms/:code` 🛡 | — | `{room:{…,players:[…]}}` · 404 · 503 `peer_unreachable` |
| POST | `/api/admin/rooms/:code/kick` 🛡 | `{slot,sessionId,reason?}` | `{ok,name}` · 409 `slot_changed` |
| POST | `/api/admin/rooms/:code/close` 🛡 | — | `{ok,kicked}` |
| POST | `/api/admin/broadcast` 🛡 | `{text,level,ttlMs?}` | `{delivered,rooms,shards:[…]}` |
| GET | `/api/admin/live?since=` 🛡 | — | **SSE** (`text/event-stream`) · 503 `too_many_streams` · 429 |
| GET | `/api/admin/kpis` 🛡 | — | o fragmento de KPI DESTE pod (para `curl` e para a 1ª pintura) |
| GET | `/api/admin/retencao?janela=` 🛡 | — | os 6 painéis + o eco `{janela,modo,rotulo}` · 400 `bad_janela` |
| GET | `/api/admin/retencao/janelas` 🛡 | — | `{janelas:[{id,rotulo,modo}],padrao}` — a lista branca |

### A faixa de shards só conta quem EXISTE

`config.peers` sai de `SHARDS` (24 no ConfigMap) e quem decide quantos pods há é o HPA (`minReplicas: 3`).
Sem filtro, `/api/admin/rooms` perguntava a 23 irmãos a cada 5 s — 21 deles nomes que nem resolvem no DNS —
e **reportava cada falha como um chip**: a tela de Salas anunciava 21 shards "sem resposta" num cluster
saudável, enquanto o KPI da aba AO VIVO, que já filtrava, mostrava `3/3`.

Ela passou a usar o mesmo par `shardDoPeer`/`aPerguntar` do coletor (`server/src/admin/coletor.js`), agora
também em `createAdminHttp`: um peer só entra na faixa **depois de responder uma vez**, e um desconhecido é
re-sondado a cada `ADMIN_BUS.SONDA_MS`. É isso que devolve sentido ao chip vermelho — ele passa a significar
"um shard que existia e ficou mudo", que é a única coisa que o administrador precisa ver ali.

⚠️ **No aviso global a ENTREGA continua indo a todos os peers.** Um pod que o HPA acabou de subir e com quem
ninguém falou ainda tem que receber o aviso; filtrar a entrega pela sonda seria trocar um chip errado na tela
por uma sala que não foi avisada. O que a sonda decide lá é só o que se **reporta**.

### Os TRÊS relógios de um jogador na sala

`Room.adminInfo({players:true})` leva `desdeS` (a VISITA — `gp.entrouTick`, que o respawn **não** zera) e
`vidaS` (a VIDA — `gp.joinedTick`, que é o `matches.duration_s`). O terceiro, `totalS`, não é da sala: é o
acumulado da CONTA (`user_stats.play_time_s`), e vem do banco. Os três estão na tabela e os três ordenam
(`ORDEM_JOGADORES`, chaves `desde`, `vida` e `total`).

Cada um responde a outra pergunta: **na sala** é esta visita, **vida** é esta vida e **total** é "é gente
nova ou é veterano?" — que é o que muda o que se faz com o resto da linha.

⚠️ **`entrouTick`, NUNCA `joinedTick`**, e é o mesmo erro que o `durouS` do `saiu` já cometeu: medindo pela
vida, o painel dizia "40 s" de quem estava na sala havia vinte minutos em quinze vidas.
`server/test/visita.test.js` trava os dois sentidos.

A linha também leva `spectator`, e a coluna "estado" diz **assiste** para quem entrou só para ver.

### As duas metades da tela se atualizam sozinhas

A lista de salas e o detalhe do selecionado batem no servidor a cada 5 s. O detalhe usa `sel.code` como
dependência do efeito (nunca o objeto `sel`, que é trocado a cada resposta e reiniciaria o intervalo para
sempre), não busca na montagem (quem abriu já buscou) e é **silencioso**: erro não vira toast, e um 404
fecha o painel — a sala acabou enquanto o administrador olhava.

### Origem e tempo total: o que só o banco sabe

`totalS` e `origem` são coladas por `fichaJogadores` (`http/admin.js`) a partir de `users.adminBrief(ids)`
— **uma** consulta para a sala inteira (`= ANY`), nunca uma por linha: são até 30 jogadores e o painel
repete o fetch do detalhe a cada 5 s. `origem` é o `users.origin` cru, e quem o traduz em "Poki" é o
painel (`client/src/admin/portais.js`), pelo mesmo motivo da lista de contas: um portal novo aparece no
banco antes de qualquer código nosso conhecer o nome dele.

⚠️ A colagem roda no ponto de **SAÍDA**, depois do `askPeers`, e não no shard dono — mesmo argumento da
ordenação: feito no dono, uma sala cujo código pertencesse a um pod em build antiga voltaria sem as
colunas e sem sinal nenhum. E ordenar vem **depois** de colar, senão `by=total` e `by=origem` ordenariam
por um campo que ainda não existe.

⚠️ O salto interno (`/internal/admin/rooms/<code>`) **pula** a consulta: sem isso o pod dono consulta e o
pod de entrada consulta de novo, dobrando a leitura a cada 5 s de polling só para jogar a primeira fora.

⚠️ Falha do banco não derruba o detalhe: as duas colunas saem "—" e o resto da sala continua respondendo.
O painel de salas é ferramenta de operação — ele tem que abrir quando o banco está ruim, que é justamente
quando se quer olhar.

Rate limit: leitura 120/min/token, mutação 20/min/token, login com o mesmo balde de `/api/auth/login`.

## Entre os três shards

Dois padrões, e **trocá-los é o bug mais silencioso possível**:

| Operação | Padrão | Por quê |
|---|---|---|
| Sala (listar detalhe/kick/fechar) | **roteia pelo DONO** — `shardOf(code)` + `askPeers` | o 1º char do código diz o shard; só um pod conhece aquela sala |
| Aviso global e parâmetros | **difunde** — `tellPeers` | não há dono: todos aplicam |

`askPeers` existe para **achar o dono** de um recurso e por isso descarta os 404 e devolve UMA resposta —
usá-lo num broadcast entregaria a mensagem a um shard e a rota diria "ok". Por isso existe `tellPeers`, que
devolve o que **cada** irmão respondeu, **incluindo as falhas**: a resposta HTTP diz ao administrador que o
shard 2 não recebeu, em vez de deixá-lo achar que mandou.

Invariantes herdadas do lobby de equipe: `/internal/*` **nunca reencaminha**, não é publicado no Ingress, e
o Bearer é **revalidado no destino** (defesa em profundidade: um erro futuro de rota no Ingress não pode
virar um endpoint de kick aberto).

## A tela AO VIVO (o fluxo de eventos)

O painel tinha UMA atualização automática — a tela de Salas, a cada 5 s — e nenhum evento: quem entrou,
quem matou quem, quem falou e quem denunciou morriam dentro do pod. A tela AO VIVO é a torre de controle:
KPIs no topo, e embaixo shards · salas · o fluxo.

```
navegador ──SSE──> shard qualquer (COLETOR; /api é balanceado)
                        └── tellPeers ──> GET /internal/admin/live?since=&epoch=   (1 Hz)
```

- **`server/src/admin/bus.js`** — anel de `ADMIN_BUS.RING` por pod, `seq` monotônico e `epoch` do boot.
- **`server/src/admin/coletor.js`** — o fan-in, o anel agregado da retomada e o SSE.

**O que faz o custo ser zero em produção sem ninguém olhando:** o barramento nasce **dormindo**, e
`bus.on` é um **CAMPO, não uma função**. `bus.publica('kill',{a,b})` aloca o objeto literal ANTES de entrar
na função, então um guard interno não salvaria nada no caminho de 60 Hz. A regra:

```js
if(bus.on){bus.publica(...)}   // caminho quente (Sim._feed): leitura de campo, o literal nem nasce
bus.publica(...)               // caminho frio (join/leave/chat/report): o guard interno basta
```

A própria coleta é o sinal de "tem alguém no painel" (`desde()` chama `acorda()`); 15 s sem leitura e um
relógio próprio rebaixa `on`. Consequência declarada: **a primeira coleta depois do silêncio volta quase
vazia**, porque o anel estava dormindo.

⚠️ **O painel escuta `Sim._feed`, NUNCA `Room.broadcastFeed`.** Aquele passa por `drenaFeed`, que corta em
`FEED.MAX_PER_FLUSH` (4) e **descarta o resto** — uma supernova que mata oito no mesmo tick entrega quatro
linhas ao jogo e joga quatro fora, e são exatamente as que o administrador quer ver. O teto é de UI do jogo
e continua sendo. `server/test/feed.test.js` trava isso.

⚠️ **`joined`/`left` do feed NÃO são publicados**: o painel tem `entrou`/`saiu` próprios, que sabem mais
(se é conta, quanto durou, quantos abates, e a causa — que distingue kick de desistência). Publicar os dois
fazia cada entrada virar duas linhas, uma delas mais pobre. Visto na primeira medição com jogadores reais.

⚠️ **O `durouS` do `saiu` é a VISITA; o do `morte` é a VIDA.** São dois relógios e a diferença é o
respawn: `Sim.revive` reinicia `gp.joinedTick` (que é o `matches.duration_s`, uma linha por vida), então
enquanto o painel media por ele a linha dizia "Fulano saiu · 40s" de quem tinha passado vinte minutos na
sala em quinze vidas — e era esse o número que se usava para conferir o relatório de um portal. Quem
responde "há quanto tempo esta PESSOA está aqui" é `gp.entrouTick`, escrito no nascimento e nunca mais.
No Battle Royale ele inclui a espera do lobby, de propósito: o jogador está na sala desde lá.
`server/test/visita.test.js` trava os dois sentidos.

⚠️ **A guarda `_voltouAgora` não vale aqui.** No feed ela impede que o respawn vire "saiu/entrou"; no painel
o administrador QUER ver o re-join — alguém entrando e saindo em laço é o padrão que ele procura.

⚠️ **O cursor leva `epoch`, e ele NÃO cabe em 32 bits.** É um `Date.now()`: `epoch|0` o trunca, o cursor
nunca mais bate e o painel recebe `lacuna:-1` ("este shard reiniciou") **uma vez por segundo**, num pod que
não reiniciou. Foi medido em dev antes de ir ao ar; há teste no `adminbus.test.js`.

⚠️ **Cursor ZERO é ESTREIA, não atraso**: entrega os últimos `ADMIN_BUS.ESTREIA` e não marca lacuna. Sem
essa distinção, abrir o painel pediria 24 anéis cheios de uma vez e ainda anunciaria "perdi 1024 eventos" a
quem não tinha o que perder.

⚠️ **A ordem entre shards é arbitrária dentro da janela de 1 s** — total só DENTRO de um shard. Ordenar por
`at` faria o fluxo andar para trás: os relógios dos 24 pods não são sincronizados o bastante.

⚠️ **`X-Accel-Buffering: no`** na resposta, senão o nginx bufferiza e os eventos chegam em blocos de 4 KB
("nada por três minutos e aí 200 linhas"). Não dá para trocar por annotation: `proxy-buffering: off` valeria
para o `/api` inteiro, e este Ingress divide o controller com dezenas de domínios. Junto vão
`no-transform`, `flushHeaders()` e **`req/res.setTimeout(0)`** — o `requestTimeout` do Node mata a conexão
em 300 s por padrão, o que funciona quatro minutos em dev e morre em produção sem erro nenhum.

⚠️ **Autenticação por `fetch` + `ReadableStream`, não `EventSource`**: ele não manda header
`Authorization`, e token na query string iria para o access log do nginx, para o histórico e para o
`Referer` — é credencial de 12 h com poder de kick e ban. O preço é escrever a reconexão à mão, o que aqui
é ganho: a retomada é pelo cursor `{shard,seq,epoch}`, não pelo palpite de um `Last-Event-ID`.

⚠️ **Memo de 10 s na resolução do Bearer, SÓ no `/internal`.** Com 2 admins são ~46 requisições internas por
segundo, e `/internal` revalida o token no destino — 46 SELECTs/s num pool de 5 conexões, disputando com a
persistência de partida. O TTL é o atraso entre revogar um token e a porta interna perceber, e é menor que
os 30 s que o poll de tunables já aceita. A porta externa nunca lê o memo.

**Limites:** teto de `ADMIN_BUS.MAX_STREAMS` por pod respondendo **503** (`too_many_streams`) e não 429 —
é afirmação de capacidade daquele pod, e o painel reconecta e cai noutro, já que o `/api` é balanceado; um
429 diria "espere", que é o conselho errado. A abertura tem rate limit por token. E a defesa principal é
estrutural: **o laço de fan-in é por POD, não por stream**, então dez abas de F5 custam O(1).

⚠️ Nada de `ADMIN_BUS` é tunable: um painel que ajusta o próprio transporte é um jeito de se trancar para
fora do painel — o mesmo argumento que faz `ADMIN_EMAILS` só promover.

⚠️ O painel **nunca** usa `RoomManager.getRoom`, que CRIA a sala se o código for deste shard — um código
digitado errado materializaria uma sala fantasma com 15 bots. Sempre `rooms.rooms.get(code)`.

⚠️ O kick usa `cause:'left'`, não `'kicked'`: `Room.leave` grava `matches.cause`, cujo CHECK (migração
0003) não conhece `'kicked'` — a gravação falharia com 23514 dentro de um `.catch(log.warn)`, em silêncio.
O kick fica registrado em `admin_audit`, que é onde ele importa.

## Aviso global

JSON de controle — **`PROTOCOL_VERSION` não muda** (mesmo caminho de `avatars` e `talk`):

```json
{"t":"notice","text":"Manutenção em 10 minutos.","level":"warn","at":…,"ttlMs":12000}
```

`Room.notice()` difunde para as sessões da sala. **Não passa por `_pushChat`**, de propósito: ele exige um
GamePlayer e alimenta o `chatLog`, que é o prompt da LLM dos bots — um aviso de manutenção ali faria os
preenchimentos comentarem a manutenção. No cliente ele sai em **dois lugares de uma fonte só**: a faixa
`ui/Notice.jsx` e uma linha de sistema no chat (`chatSys`, que já existia).

**Limitação declarada:** quem está no MENU não está em sala nenhuma e **não recebe**. A saída (um aviso
fixo em `/api/config`, que todo cliente lê no boot) fica para quando for preciso.

## Parâmetros de jogo em runtime

`shared/src/tunables.js` é uma **lista branca** — nada fora dela é gravável, nem por um `key` vindo do
corpo de uma requisição. O valor cai direto no objeto de `constants.js`, e isso **custa zero no laço de
60 Hz**: `physics/world.js` faz `const PW=POWERUP` e lê `PW.MAGNET_MAX_R` dentro do tick, o que aliasa o
OBJETO — escrever no campo é visto por todos os leitores no tick seguinte, sem indireção nenhuma. (A
alternativa, um `getTunable()` dentro do laço, é a única versão com custo por tick real.)

O caso pedido: **o teto do ímã**. O admin digita **massa** (100 000); a física guarda **raio** (√100000 ≈
316). `mass = r²` é a convenção do jogo, e a massa é o número que o jogador lê no HUD. Mexer nele muda só
QUEM pode usar o ímã — o alcance é `min(r·5.5, MAGNET_RANGE_MAX)` e já satura nos 900 px absolutos.

- **O banco é a verdade** (`admin_settings`). Os pods leem no boot e a cada 30 s; o push
  (`/internal/admin/tunables`) **não carrega valor**, só pede que o irmão releia — assim um pod que estava
  reiniciando converge sozinho e a porta interna não tem autoridade sobre nada.
- **`scope:'both'` responde 501.** Essas chaves o CLIENTE também lê, e ele tem a própria cópia do bundle:
  mudar de um lado só faria `predict.js` divergir acima de `NET.SNAP_DIST`. Recusar é honesto.
- **É por PROCESSO, não por sala.** Mudar o ímã muda para todas as salas do pod, inclusive uma no meio da
  rodada. Parametrizar por sala exigiria carregar um objeto por `Room→Sim→World→rules`, tocando toda
  assinatura da física e o predict — não vale por um punhado de números.

### O MODELO DA LLM é um tunable (`BOT_LLM.MODELO`, seção "Fala dos bots")

Qual modelo atende os bots era só `OLLAMA_MODEL` no ConfigMap: trocá-lo pedia editar YAML, aplicar e
reiniciar os três shards — para uma decisão que só se toma **olhando a sala falar** (um é mais rápido, outro
é mais engraçado, outro obedece melhor ao teto de palavras). Agora é um `<select>` do painel, no molde exato
de `BOT_LLM.ESTILO`, e a lista de opções nomeia só o que existe na máquina do Ollama — pedir um modelo
ausente é trocar a fala dos bots por 404 em silêncio. Padrão: **`gpt-oss:20b`**.

- **O cliente não fecha o nome no closure.** `llm/ollama.js` lê `BOT_LLM.MODELO` a cada chamada (o mesmo
  aliasing de objeto da física), então a troca vale na fala seguinte, **sem recriar o cliente** e sem zerar
  o disjuntor, o teto de gerações em voo ou as métricas. Fechado na criação, o painel diria "salvo" e o
  servidor seguiria chamando o modelo antigo para sempre.
- **O env é a SEMENTE, não a verdade.** `OLLAMA_MODEL` escreve no tunable no boot (`seedModelo`, chamado
  pelo composition root) e um nome fora da lista é **acrescentado** a ela em vez de recusado: a máquina do
  Ollama pode ter um modelo que este código não conhece, e um select sem o valor em uso mostraria ao admin
  um modelo que o servidor não está usando. Precedência: padrão do código → env → `admin_settings`.
- **`Restaurar` volta ao padrão do CÓDIGO**, nunca ao env — que é o que "voltar ao padrão" significa no
  resto do painel.
- **Trocar não reaquece sozinho.** O modelo novo paga o load (~27 s) na primeira fala, e nesse meio-tempo a
  sala usa o repertório fixo — o mesmo chão de sempre, não um segundo comportamento.
- **`Raciocinar antes de falar` (`BOT_LLM.THINK`)**: `auto` (o que cada modelo aceita) · `sim` · `não`.
  ⚠️ Medido: o gpt-oss com `think:false` devolve `content` **vazio** mesmo com cota folgada de tokens — ele
  ignora o pedido, pensa assim mesmo e a fala nem começa. HTTP 200, sala inteira no repertório fixo, sem uma
  linha de log. Por isso `auto` é o padrão e o rótulo da opção `não` diz o preço.

### A DURAÇÃO DA SALA DO LIVRE (`ROUND.TICKS`, seção "Salas")

Dita em **minutos** — como em todo o resto do jogo (o dono de sala escolhe minutos e `roundTicksOf`
converte); o admin não tem por que fazer a conta de 60 Hz. Padrão 30 min.

- **Vale para as salas CRIADAS daí em diante.** A que já está rodando fixou a duração no construtor;
  encurtar a rodada de quem está no meio dela terminaria a partida no clique.
- **Só o Livre.** No Battle Royale o tempo é a rede de segurança da zona, e uma sala que acaba antes de o
  círculo fechar é o único jeito daquele modo terminar sem ter decidido nada.
- **O env é semente**, como no modelo: `ROUND_TICKS` escreve em `ROUND.TICKS` no boot e `Room.js` lê a
  constante viva — lendo `config.roundTicks` o ConfigMap venceria o painel em toda sala nova.
- **O dia do céu acompanha**: `roundInfo()` manda `roundTicks/ROUND.DAYS`, então dobrar a duração dobra o
  dia do relógio do espaço. É consequência declarada — o céu tem que virar um número inteiro de vezes por
  sala, senão a última troca fica pela metade.

### O FILTRO DE PALAVRÃO (`CHAT.FILTRO`, seção "Chat")

`livre` (padrão) · `pesado` · `tudo`. Mascarar a linha de quem joga é decisão de produto, e num .io xingar
faz parte; o que os portais pedem por escrito não passa por aqui e vale em qualquer nível — silenciar
(cliente), denunciar (`Room.report`) e o kick/ban do dono da sala. **Antes de mandar um pacote para revisão
de portal, subir para `pesado` é um clique, sem deploy.**

Duas coisas não seguem o nível, e não é censura escondida — é escopo:

- **O que o servidor GERA.** A lista `ODIO` (slur racial/homofóbico/transfóbico/capacitista) saiu de `GRAVE`
  e barra a fala do bot em todos os níveis: xingar pesado ele pode, inventar slur não. O `SYSTEM` acompanha
  o nível pelo mesmo motivo — com a peneira solta e o prompt ainda pedindo comedimento, o modelo obedece e o
  preenchimento fica mais contido que a sala.
- **O nick** (`nickProibido`): fica no placar, no feed e no radar a partida inteira e é escolhido a frio.

### O TAMANHO DA FALA: vale o MENOR dos dois tetos

`MAX_WORDS` e `MAX_CHARS` são tetos independentes e **o que morde primeiro é o de palavras**: 12 palavras
cabem em ~70 caracteres, então subir só `MAX_CHARS` para 140 não alonga nada. Os rótulos do painel dizem
isso. Duas correções entraram junto com a queixa ("aumentei para 140 e continuaram falando pouco"):

- **`MAX_CHARS` não era DITADO ao modelo** — só `MAX_WORDS` entrava no `SYSTEM`. Como a peneira RECUSA em
  vez de cortar, um teto que só vive nela não alonga a fala: ele apenas decide o que morre.
- **`num_predict` não acompanhava.** Era 48 tokens fixos enquanto o teto do painel ia a 140 caracteres, e a
  fala longa saía cortada (`done_reason:'length'`) para ser recusada em seguida. Agora é derivado de
  `MAX_CHARS`. Medido pelo caminho real do jogo: média da linha 41 → 60 chars, maior 55 → 88, aceitação
  7/8 → 8/8.

## A tela de RETENÇÃO: a janela troca a PERGUNTA

O filtro era `?days=` costurado como `now() - ($1||' days')::interval` nas seis consultas. Ele respondia bem
"o novato de ontem ficou 3 minutos?" e não respondia nada sobre AGORA — e **"dia atual" não cabe naquele
molde**: é `>= date_trunc('day',now())`, um instante, não um intervalo. É isso que obrigou a trocar o
parâmetro por um fragmento de **lista branca em `Map`** (`JANELAS`, em `repos/analytics.js`) — com objeto
literal, `?janela=constructor` é truthy e a rota devolveria 500, o mesmo argumento de `ORDEM_USERS`.

| janela | corte | modo |
|---|---|---|
| `1h` · `3h` | `now()-interval '1 hour'` · `'3 hours'` | atividade |
| `hoje` | `date_trunc('day',now())` | atividade |
| `7d` · `14d` · `30d` · `90d` | `now()-interval 'N days'` | coorte |

⚠️ **Abaixo de um dia, a BASE deixa de ser a coorte de contas novas.** Cinco dos seis painéis filtravam por
`users.created_at`, e numa hora isso é quase sempre o conjunto vazio — por construção, não por falta de
jogadores. No modo `atividade` a base passa a ser **quem jogou na janela** (`matches.ended_at`):

- `funil` agrupa por **hora**, e a coluna "jogaram" some (seria 100% por construção: a base É quem jogou);
- `primeira`/`histograma`/`algoz` medem **as vidas da janela**, não o `n=1` de cada conta — e os títulos da
  tela mudam junto, senão a mesma frase passaria a cobrir dois recortes diferentes;
- `coortes` **some**: ele compara `dia + interval '1 day'`, ou seja é diário por definição. Numa hora daria
  uma linha com D1/D7/D30 zerados — três colunas de zero que se leem como "ninguém volta";
- `visita` não muda: ele sempre filtrou por atividade, e é por isso que é o único que continua dizendo algo
  numa janela de uma hora.

⚠️ **A resposta ECOA `{janela,modo,rotulo}` e a tela desenha os títulos a partir do que o servidor FEZ.** É
o mesmo contrato do eco de `by`/`dir` das tabelas ordenáveis, e a mesma defesa de rollout: um pod antigo não
ecoa, e o painel não anuncia um modo que não valeu.

⚠️ **A chave do memo é a JANELA.** Com o `'r'+days` de antes, `1h` e `1 dia` colidiriam — e por 60 s a tela
mostraria, sem erro nenhum, o número do período errado.

⚠️ `?days=N` continua aceito e é traduzido para a menor janela que o cobre: durante um rollout, um painel
antigo fala com um pod novo. O teto de 90 dias que ele impunha continua valendo por construção — não há
entrada maior na lista.

⚠️ **Fuso:** `now()` e `date_trunc` são do relógio do POSTGRES e a tela formata em pt-BR. "Dia atual" pode
não ser o dia do operador, e o rótulo diz isso.

## De onde a conta veio

`users.origin` (migração 0010) é o cabeçalho `Origin` do `POST /api/auth/guest` — o domínio CRU
(`https://html5.gamemonetize.co`), não um id de portal. Ele existia desde a 0010 e só era lido pelo funil da
retenção; agora é coluna ordenável na lista de contas, entra no detalhe e **casa na busca livre** (digitar
"poki" filtra por origem, o que dispensa um `<select>` que envelheceria no portal seguinte).

⚠️ **Quem traduz para "Poki" é o PAINEL** (`client/src/admin/portais.js`, puro e testável sem jsdom), não o
servidor: um portal novo aparece no banco antes de qualquer código nosso conhecer o nome dele, e o
desconhecido sai pelo próprio host — que ainda diz de onde veio. O casamento é por host exato ou sufixo de
domínio, nunca por `includes`, pela mesma razão do `cors.js`. E isto **não é um portão**: quem decide quem
fala com a API continua sendo o `ALLOWED_ORIGINS` do ConfigMap.

## Assistir a uma sala pelo painel

O botão **Assistir** do detalhe de uma sala abre `/?sala=<code>&assistir=1` numa aba nova. Ele DELEGA: o
painel é um chunk da mesma SPA, mas nunca monta o Pixi nem abre WebSocket de sala, e embutir uma partida
aqui significaria carregar o jogo inteiro no painel — o oposto do motivo de ele ser carregado sob demanda.
O administrador entra como espectador comum (ver `docs/spec/protocol.md`): sem corpo, sem vaga, sem aparecer
no placar de ninguém e sem virar linha em `matches`.

## Segurança

- `toAdmin()` (em `repos/users.js`) é uma **allowlist explícita** de colunas, nunca `...u`: é por um spread
  distraído ali que `password_hash` vaza. O e-mail entra no detalhe e **não** na lista.
- Toda ação mutante grava em `admin_audit` (dentro da transação onde há uma). Ações: `login`, `ban`,
  `unban`, `coins`, `edit`, `promote`, `demote`, `revoke_tokens`, `kick`, `room_close`, `broadcast`,
  `setting`, `setting_reset`.
- Banir **revoga as sessões**: banir sem derrubar quem já está conectado não bane nada. O `banned_until` é
  verificado em exatamente dois lugares — `persist/hooks.js` (barra o join de WS nos 3 shards, sem estado
  em memória) e `requireUser` (senão o banido continua comprando skins).
- O token do painel vive em `localStorage.warspace_admin_token`, **nunca** em `warspace_token`.
- `X-Robots-Tag: noindex` em `/admin` (`client/nginx.conf`).

## Verificar

```bash
DATABASE_URL=postgres://planet:planet@127.0.0.1:5433/planet npm test   # server/test/admin.test.js
```
Promover a primeira conta em dev:
```sql
-- por e-mail ou por id, NUNCA por nick: o nick deixou de ser único na 0009 e um WHERE nick=… pode
-- promover mais de uma conta de uma vez.
UPDATE users SET is_admin=true WHERE email='voce@exemplo.com';
```

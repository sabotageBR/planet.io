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
| `server/src/http/admin.js` (servidor de JOGO) | `rooms`, `rooms/:code[/kick\|close]`, `broadcast` | tudo é memória de sala |

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
| GET | `/api/admin/users?q=&kind=&banned=&limit=&before=` 🛡 | — | `{users:[…],next}` — **sem e-mail** (é do detalhe) |
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
| GET | `/api/admin/rooms` 🛡 | — | `{rooms:[…],shards:[{shard,ok}]}` — agregado dos 3 pods |
| GET | `/api/admin/rooms/:code` 🛡 | — | `{room:{…,players:[…]}}` · 404 · 503 `peer_unreachable` |
| POST | `/api/admin/rooms/:code/kick` 🛡 | `{slot,sessionId,reason?}` | `{ok,name}` · 409 `slot_changed` |
| POST | `/api/admin/rooms/:code/close` 🛡 | — | `{ok,kicked}` |
| POST | `/api/admin/broadcast` 🛡 | `{text,level,ttlMs?}` | `{delivered,rooms,shards:[…]}` |

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

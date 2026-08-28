# Modos de jogo: Livre e Battle Royale

## O que existe

| | **Livre** (`MODE.FREE`) | **Battle Royale** (`MODE.BR`) |
|---|---|---|
| sala | 30 humanos + 15 bots (env) | 50 no total (humanos primeiro, bots completam) |
| entrada | direto, sala em andamento | **LOBBY** que enche à vista, depois contagem e largada |
| respawn | sim (humano e bot) | não — quem morre assiste |
| fim | 1 h (BIG CRUNCH) | última equipe (ou último jogador) de pé |
| zona | não | sim, fecha em ~6 min |
| armas | só o míssil | míssil + 4 armas com raridade |
| equipe | não | solo ou 2/3/4, sem fogo amigo |
| chat | sala | equipe (solo: sala) |

O descritor está em `shared/src/constants.js` (`MODE`, `MODES`, `modeOf`, `modeCap`). **Nada de `if (modo === …)`
espalhado**: sala, Sim e regras leem os mesmos campos (`warmup`, `respawnBots`, `lastAlive`, `zone`, `weapons`, `chat`).

## O lobby

Não há fila fora da sala nem tela de "procurando partida" mentindo sobre o que acontece. A sala de battle
royale nasce na fase `lobby`: o jogador **está na sala mas não no mapa** (`World.addPlayer({spawn:false})`),
vê o contador subir — 1/50, 12/50, 37/50 —, os nomes chegando um a um, e quando enche (ou a janela de
`BR.LOBBY_TICKS` fecha) vem a contagem regressiva e a largada, com todo mundo nascendo junto num anel.

Por que os participantes chegam AOS POUCOS: encher instantaneamente entrega o jogo, e encher tudo no último
segundo também. A curva é `progresso^FILL_EXP` (lenta no começo, acelerando), com jitter na cadência —
chegadas em intervalos exatos são o outro jeito de denunciar que não é gente. Se a fila atrasa em 2 ou mais,
ela alcança na hora: sem isso a janela fechava em 40/50 e o número dava um pulo feio na largada.

**A vaga é sempre do humano.** Quem entra num lobby já cheio derruba um preenchimento (`Room.join` →
`trimBots(1)`). Sem isso, dois amigos que procuram com 10 s de diferença cairiam em salas separadas — o
oposto do que o matchmaking existe para fazer.

Quem dá o ritmo é `Room.lobbyTick()`; nenhum snapshot é enviado nessa fase (sem peça não há o que enquadrar,
e o foco da AOI de um jogador sem corpo seria NaN). O estado do lobby vai num JSON próprio, em
**milissegundos** e a 2 Hz: sem snapshot o relógio de tick do cliente nunca sincroniza, então uma contagem
em ticks ficaria parada na tela. Quem suaviza o número é o cliente.

O gancho que fez isso caber: `Room.roundStart` nascia 0 e **nunca era escrito**. Escrevê-lo na largada faz
relógio do espaço, contagem do fim e troca de céu se ajustarem sozinhos.

## Os outros 49 não se apresentam

O preenchimento entra com **nome de jogador** (`BOT_NICKS` + `botNick`: "Lipe", "sniper3", "xXraposaXx",
"BARAO") e **sem o flag `PLAYER_FLAG.BOT` no fio** (`anonBots` no descritor do modo). Como o `◆` do placar e
a cor do radar saem justamente desse flag, os dois param de distinguir sozinhos — nenhuma linha de cliente
precisou mudar.

É o padrão do gênero, e a alternativa é pior: marcar "◆ bot" ao lado de 40 dos 50 nomes transformaria a
partida numa tela de treino. O **servidor continua sabendo** quem é quem — `kills` × `botKills`, economia e
conquistas não mudaram uma linha. Quem não sabe é a TELA.

Duas armadilhas que a lista de nomes evita: a lista temática do modo Livre (`BOT_NAMES`: "Nebulox",
"Vortexia") tem 20 nomes e todos do mesmo tema — numa sala de 50 a farsa cairia na primeira olhada no
placar, por repetição e por estilo. E nomes limpos demais também denunciam: gente de verdade usa número,
underline e caixa maluca, então `botNick` mistura cinco formatos.

## Aliado é regra de FÍSICA

`rules.sameTeam(w,a,b)` é a única fonte da resposta, consultada nos seis pontos de decisão: `piecePair`,
`pieceMissile`, `missileMissile`, `incomingMissile`, `aimTarget` e a busca de alvo do `applyFire`. O cérebro do
bot só **otimiza o comportamento** (não escolhe companheiro como presa); quem impede de comer e de acertar é a física.

Aliados que se tocam usam `separateOwn` — separação só posicional, sem impulso, igual a peças do mesmo dono.
Dar quique entre companheiros transformaria correr em grupo num pinball.

**Compartilhar partículas já funcionava**: `pieceEject` só impõe cooldown ao DONO da pelota, e `EAT.EJECT_GAIN` é 1.
Cuspir W para o companheiro entrega a massa inteira, no mesmo tick. Não foi preciso escrever regra nenhuma.

`w.peace` (o mundo em paz) fica ligado durante o lobby como cinto de segurança: ninguém tem peça ali, mas se
um dia alguém nascer cedo por engano, não vira almoço antes de a partida existir.

## A zona

`shared/src/zone.js`: círculo que fecha em `ZONE.STAGES` etapas (parada → fechamento), **21 300 ticks ≈ 5 min 55 s**
no total. Determinística (o rng da sala, só na virada de fase) e testada: o círculo novo **sempre cabe dentro do
velho** — uma zona que pulasse para trás mataria quem já estava dentro.

Fora dela a peça queima `ZONE.BURN` da massa por segundo e, no piso `MIN_PIECE_R`, **morre** (`cause:'zone'`). É a
única coisa do jogo que mata sozinha, e é o que fecha a partida. A conta usa o CENTRO da peça: "meu ponto está
dentro do círculo?" é o que o jogador lê na tela.

**A massa queimada não evapora: ela é ARRANCADA em pelotas.** A cada `ZONE.SHED_TICKS` (2,5×/s) o que foi
queimado sai como um fragmento de verdade, jogado para **fora** — na direção que se afasta do centro da zona.
Duas coisas saem de graça daí: ver alguém no gás perdendo pedaços é o aviso mais claro que existe, e a massa
continua no mundo para quem tiver coragem de entrar atrás dela. A direção é o que faz o preço ser real —
buscar o espólio custa ir MAIS FUNDO no gás. Quem morre lá dentro larga tudo no lugar, **sem dono**.

A conta de massa continua contínua (é a que `predict.js` espelha, e a paridade é testada); só a *entrega* é em
pedaços, por causa do teto `EJECT.MAX`: soltar a cada tick, com meia sala no gás no fim da partida, estouraria a
população e despejaria os fragmentos de todo mundo. O acumulador `Body.shed` é a massa em trânsito — já saiu da
peça, ainda não virou pelota — e é contá-la que prova que nada se perde pelo caminho.

A queimadura roda na física compartilhada e **também na predição** (`stepOwnPieces` recebe o círculo): ela muda o
RAIO, e sem prever, a correção do servidor chegaria 20×/s numa peça que está encolhendo — ela pulsaria de tamanho
justo na borda, que é onde o jogador mais olha.

## Armas

O jogador **carrega várias** e troca com uma tecla (`Q`, o botão de toque, ou clicando no chip da arma):
`ps.ammo[arma]` guarda a munição de cada uma e `ps.weapon` diz qual está na mão. O míssil é a arma base e nunca
sai do cinto — nem quando zera, senão daria para ficar preso numa arma vazia sem poder voltar. Pegar uma arma
já a coloca na mão (pegar e não ver nada acontecer é pior que não pegar) e a comida `AMMO` abastece a que está
na mão. Coube num BIT do INPUT que já sobrava, então ele continua com 10 bytes.

| id | nome | raridade | o que faz | o que reaproveita |
|---|---|---|---|---|
| 0 | Míssil | comum | o de sempre (homing, dano, estilhaço) | — |
| 1 | Rajada | comum | 6 projéteis retos, arranham e empurram | `addMissile` × n |
| 2 | Cacho | raro | vira 4 homing perto do alvo | `homeMissile` |
| 3 | Nova | épico | onda que empurra e estilhaça o miolo, sem me atingir | o laço da `supernova` |

(A **Mina gravitacional** existiu por uma rodada e saiu a pedido: reacendia o buraco negro, que já tinha sido
desligado por não ficar bom. O código do BLACKHOLE continua dormente onde estava.)

Cada uma custou ~10 linhas porque nenhuma inventou sistema novo. As comidas entram em `FOOD_TYPE` **8..10**
(no fim: três testes de faixa dependem da ordem do enum) e a raridade é a tabela de peso `WEAPON_DROPS` em `world.js`.

## Chat

JSON no WS (`{t:"chat",text}` → `{t:"chat",slot,name,team,text,at}`). O escopo é do servidor, pelo `chat` do modo.
Rate limit PRÓPRIO (`CHAT.RATE_MS`/`BURST`) por cima do balde de JSON da sessão: aquele protege o servidor, este
protege a tela dos outros. Sem histórico — quem entra não recebe o que já passou.

Painel numa faixa vertical à ESQUERDA, no meio: os cantos esquerdos já são do placar e do bloco de massa nos três
temas. Enter abre, Esc fecha, e o `inInput()` do teclado do jogo já garante que digitar não divide o planeta.

## Voz (Ctrl)

Push-to-talk: segurar grava, soltar manda. O servidor é **relay puro** — valida tamanho/duração/cooldown/teto da
sala e reenvia os bytes, sem decodificar e sem guardar nada.

**µ-law 8 kHz mono, não Opus.** `MediaRecorder` grava webm/opus no Chrome/Firefox e mp4/aac no Safari, e o Safari
não decodifica webm: um clipe do Chrome sairia MUDO para metade da sala. µ-law é 4× mais gordo (40 KB nos 5 s do
teto) e em troca é 100% previsível — o `AudioBuffer` é montado à mão, sem `decodeAudioData`. O byte `codec` do fio
está reservado para trocar por Opus quando valer a pena.

Quem ouve: companheiro de equipe sempre (volume cheio); no Livre e no solo, os `VOICE.LISTENERS` mais próximos
dentro de `VOICE.DIST`, com volume e estéreo pela distância — o mesmo cálculo dos efeitos, reusado literalmente.

O áudio toca num **quarto barramento** (`voice`), fora do teto de 24 vozes: perder a fala do companheiro justo
quando a tela enche é o pior momento possível para perdê-la. É o mesmo motivo do barramento do alerta.

⚠️ O `maxPayload` do WebSocket acompanha `VOICE.MAX_BYTES`. Com os 4 KB de antes o `ws` derrubava o frame **e a
conexão junto**, antes de o servidor poder recusá-lo.

## Brilho das partículas

Comida e fragmentos ganharam um halo aditivo (estilo wormate.io): um SEGUNDO `ParticleContainer` com
`blendMode:"add"` por baixo do corpo, texturado com o halo assado (`paintGlow` em `theme/util.js`). São **dois
draw calls no total**, não um por partícula, e nada de filtro ou blur — que são proibidos aqui porque custam
render target. Some no modo econômico e com "menos movimento": é enfeite, e enfeite é o primeiro a sair.

A queda do gradiente é rápida de propósito. Na primeira tentativa (halo largo e opaco) o aditivo saturava para
branco e a tela virava névoa leitosa — sumia o contraste que faz enxergar a comida.

## Ganhar tem fogos

Quem termina a partida como campeão vê a **salva sair do próprio planeta** — que é justamente quem fica na tela
atrás do pódio. São 14 foguetes agendados com o `delayMs` que o `fx` já aceita, em cadência irregular, com
altura, inclinação, carga e cor sorteadas: salva regular soa a efeito repetido, e é a irregularidade que faz
parecer show.

A física está em `theme/util.js` (`fireworkPrims`) e é compartilhada pelos três céus — o que muda por tema é só
a paleta. O que faz parecer de verdade, em ordem: cada faísca é um **traço** do ponto anterior ao atual (fogo
real vira risco, não ponto); o raio **satura por arrasto**, então abre rápido e freia; a **gravidade** transforma
a esfera em sino e a derruba; a cor passa por **três tempos** (branco quente → carga → brasa); parte das faíscas
**cintila** em alta frequência; e o foguete **desacelera** até parar no ápice, que é onde estoura. O som
acompanha cada um — assobio no lançamento, estouro no ápice —, senão o áudio descola da imagem.

No modo Livre o BIG CRUNCH continua acontecendo (o mundo acaba por tempo); no battle royale, quem venceu não vê
o mundo explodir, vê os fogos.

## Morrer é virar câmera

Ao morrer, o servidor escolhe quem você assiste (quem te comeu, se vivo; em equipe, o companheiro; senão o
líder) e a AOI da sessão passa a seguir esse jogador — o que aparece atrás da tela de morte é a sala de
verdade, não um pedaço parado de espaço.

Agora dá para **trocar**: as setas ‹ › da tela de morte (e as do teclado) andam pela lista de VIVOS ordenada
por massa — a mesma do placar, então "próximo" na tela é "próximo" aqui —, e `{t:'spectate',slot}` pula direto
para alguém. Quem decide continua sendo o SERVIDOR: alvo morto ou inexistente cai na escolha automática, em vez
de deixar a câmera olhando para um fantasma. Jogador vivo não vira espectador — ele tem as próprias peças.

## O que ficou de fora

- **O `?local=1` e o modo offline continuam só Livre.** O `LocalServer` é uma segunda implementação da sala
  (duplica o `_consume` e o `self`), e a tela de modos desabilita Battle Royale com `api.server === false`.
- Filtro de palavrão, denúncia e moderação de servidor.
- Lista de amigos persistida (hoje o convite é o código do lobby, que basta e funciona para convidado).

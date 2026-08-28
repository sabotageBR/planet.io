# Modos de jogo, equipes, chat e voz

## O que existe

| | **Livre** (`MODE.FREE`) | **Sobrevivência** (`MODE.SURVIVAL`) |
|---|---|---|
| sala | 30 humanos + 15 bots (env) | 50 no total (humanos primeiro, bots completam) |
| entrada | direto, sala em andamento | **aquecimento** até lotar ou estourar o relógio |
| respawn | sim (humano e bot) | não — quem morre assiste |
| fim | 1 h (BIG CRUNCH) | última equipe (ou último jogador) de pé |
| zona | não | sim, fecha em ~6 min |
| armas | só o míssil | míssil + 4 armas com raridade |
| equipe | não | solo ou 2/3/4, sem fogo amigo |
| chat | sala | equipe (solo: sala) |

O descritor está em `shared/src/constants.js` (`MODE`, `MODES`, `modeOf`, `modeCap`). **Nada de `if (modo === …)`
espalhado**: sala, Sim e regras leem os mesmos campos (`warmup`, `respawnBots`, `lastAlive`, `zone`, `weapons`, `chat`).

## A espera É o aquecimento

Não há fila fora da sala. A sala de Sobrevivência nasce na fase `warmup`: o jogador **cai no mundo e come**, mas
ninguém morre e não há zona. Quando lota (ou o relógio estoura), `Room.begin()` completa com bots, sorteia as
equipes, reposiciona todo mundo num anel e arma a zona.

Por que assim: uma fila de verdade exigiria um estado de sessão **sem sala** e um segundo caminho de snapshot.
Aqui o join, a AOI, o HUD e a predição são exatamente os mesmos — e a espera vira jogo em vez de tela de espera.

O truque que faz isso caber: `Room.roundStart` nascia 0 e **nunca era escrito**. Agora ele é escrito em `begin()`,
e como relógio do espaço, contagem do fim e troca de céu do cliente saem todos dele, tudo se ajusta sozinho.

`w.peace` (o mundo em paz) faz TODO MUNDO virar aliado durante o aquecimento — a espera não precisou de uma
única regra própria, reusa o caminho de equipe.

## Aliado é regra de FÍSICA

`rules.sameTeam(w,a,b)` é a única fonte da resposta, consultada nos seis pontos de decisão: `piecePair`,
`pieceMissile`, `missileMissile`, `incomingMissile`, `aimTarget` e a busca de alvo do `applyFire`. O cérebro do
bot só **otimiza o comportamento** (não escolhe companheiro como presa); quem impede de comer e de acertar é a física.

Aliados que se tocam usam `separateOwn` — separação só posicional, sem impulso, igual a peças do mesmo dono.
Dar quique entre companheiros transformaria correr em grupo num pinball.

**Compartilhar partículas já funcionava**: `pieceEject` só impõe cooldown ao DONO da pelota, e `EAT.EJECT_GAIN` é 1.
Cuspir W para o companheiro entrega a massa inteira, no mesmo tick. Não foi preciso escrever regra nenhuma.

## A zona

`shared/src/zone.js`: círculo que fecha em `ZONE.STAGES` etapas (parada → fechamento), **21 300 ticks ≈ 5 min 55 s**
no total. Determinística (o rng da sala, só na virada de fase) e testada: o círculo novo **sempre cabe dentro do
velho** — uma zona que pulasse para trás mataria quem já estava dentro.

Fora dela a peça queima `ZONE.BURN` da massa por segundo e, no piso `MIN_PIECE_R`, **morre** (`cause:'zone'`). É a
única coisa do jogo que mata sozinha, e é o que fecha a partida. A conta usa o CENTRO da peça: "meu ponto está
dentro do círculo?" é o que o jogador lê na tela.

A queimadura roda na física compartilhada e **também na predição** (`stepOwnPieces` recebe o círculo): ela muda o
RAIO, e sem prever, a correção do servidor chegaria 20×/s numa peça que está encolhendo — ela pulsaria de tamanho
justo na borda, que é onde o jogador mais olha.

## Armas

Uma por jogador; pegar outra **troca** e reabastece. Por isso o INPUT continua com 10 bytes — não há seleção de arma.

| id | nome | raridade | o que faz | o que reaproveita |
|---|---|---|---|---|
| 0 | Míssil | comum | o de sempre (homing, dano, estilhaço) | — |
| 1 | Rajada | comum | 6 projéteis retos, arranham e empurram | `addMissile` × n |
| 2 | Mina | incomum | poço parado que puxa e estilhaça | o **BLACKHOLE inteiro**, dormente desde `COUNT:0` |
| 3 | Cacho | raro | vira 4 homing perto do alvo | `homeMissile` |
| 4 | Nova | épico | onda que empurra e estilhaça o miolo, sem me atingir | o laço da `supernova` |

Cada uma custou ~10 linhas porque nenhuma inventou sistema novo. As comidas entram em `FOOD_TYPE` **8..11**
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

## O que ficou de fora

- **O `?local=1` e o modo offline continuam só Livre.** O `LocalServer` é uma segunda implementação da sala
  (duplica o `_consume` e o `self`), e a tela de modos desabilita Sobrevivência com `api.server === false`.
- Filtro de palavrão, denúncia e moderação de servidor.
- Lista de amigos persistida (hoje o convite é o código do lobby, que basta e funciona para convidado).

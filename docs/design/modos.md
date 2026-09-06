# Modos de jogo: Livre e Battle Royale

## O que existe

| | **Livre** (`MODE.FREE`) | **Battle Royale** (`MODE.BR`) |
|---|---|---|
| sala | 30 humanos + 15 bots (env) | 50 no total (humanos primeiro, bots completam) |
| entrada | direto, sala em andamento | **LOBBY** que enche à vista, depois contagem e largada |
| respawn | sim (humano e bot) | não — quem morre assiste |
| fim | 1 h (BIG CRUNCH) | última equipe (ou último jogador) de pé |
| zona | não | sim, fecha em ~9 min, e cobra pela ÁREA EXPOSTA |
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

## A sala do Livre já estava andando

A tabela acima promete "entrada: direto, sala em andamento", e por muito tempo isso era meia verdade: a
sala nova abria com um punhado de preenchimentos, todos sorteados na mesma faixa de raio (`PLAYER.BOT_R`,
[24,58]) — ou seja, todos do tamanho de quem tinha acabado de entrar. Quem chegava via uma sala NOVA, que
é a coisa que menos convida a ficar num .io.

Hoje a abertura tem planeta de todo tamanho (`ROOM.SEED_R`/`SEED_MIX`, `botSpawnR`): dos `BOT_SEED` (6)
que já estão lá quando a porta abre, **2 são gigantes** (r 200–250, 40–62 mil de massa), **3 são médios**
(r 80–150) e **1 é pequeno**. O jogador entra com 900 de massa, em último no placar, com dois planetas
grandes e uma dúzia de médios à frente — que é exatamente a leitura de uma partida que começou sem ele.

Três decisões que sustentam isso:

- **É cota, não sorteio.** Sorteando cada bot de forma independente, uma sala em cada vinte sai só de
  bolinhas — e a sensação não pode depender de sorte. Os números vão declarados (`SEED_MIX:[2,3]`), não
  em fração: `.25` de 6 arredonda para 2, que é 33%, e ninguém consegue pedir "um gigante a menos"
  mexendo num número que mente.
- **Gigante só na semente.** Ele é o veterano que já estava lá. Um planeta de 250 de raio nascendo no
  minuto 3, dentro da câmera de quem já cresceu, é o pop-in que a chegada gradual existe para evitar —
  voltando pela porta dos fundos. Quem chega depois entra no máximo MÉDIO, e cada vez mais raro.
- **O decaimento é o menor entre dois relógios**: a janela de 2 min (`SEED_WINDOW_TICKS`) e o quanto a
  sala ainda tem de vaga. Só o tempo não bastava — a sala enche em ~93 s contra uma janela de 120 s, então
  a chance de vir grande nunca chegava a zero, e ainda ficava amarrada em silêncio ao env `ROOM_BOTS`.

O preenchimento grande **não** ganha pontuação nem contagem de partículas de presente: ele chegou grande,
e o que fizer daqui em diante é o que conta. O nível ao lado do nick acompanha o tamanho, porque um
planeta de 62 mil de massa com "nível 3" denuncia tão bem quanto um nome de catálogo. E `PLAYER.DECAY`
desfaz a semente sozinho: sem comer, o gigante murcha para a casa dos 150 de raio em 10–15 min. É um
estado inicial, não um regime.

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

## Os outros 49 também precisam JOGAR como gente

Esconder o flag `BOT` resolve o placar. O que denuncia depois é o comportamento, e eram quatro coisas:

**1. A mão era perfeita.** O movimento é `pos += û(ponteiro)·vmax`, sem inércia — apontar exato no alvo,
todo tick, dá perseguição geometricamente perfeita e inversão de 180° num quadro só. Medindo o giro do
ponteiro do cérebro antigo: **p95 = 3,08 rad/tick** (176°). Agora existe uma camada de mão entre a decisão e
o input — tempo de reação, velocidade angular limitada, tremor, e "flick" para mirar (mirar CUSTA movimento,
porque o `AIM` escolhe pelo cursor) — e o p95 caiu para **0,29 rad/tick**. Também aprendeu a **parar**:
apontar para dentro de `SPEED.RAMP` freia a peça, e o cérebro velho nunca fazia isso.

**2. Perseguir nunca alcança.** `vmax = K/r^0,449` e comer exige `EAT.RATIO`: **quem eu posso comer é sempre
mais rápido que eu**. O modo `hunt` antigo era correr atrás de quem nunca ia pegar. Os fechadores reais são o
salto (780 px), o míssil, o empurrão da Nova e **encurralar**. Então `hunt` agora mede o **arco de fuga** da
presa (`_openness`: das 8 direções em volta dela, quantas não dão em parede, gás ou estrela) e aproxima pelo
lado que **fecha** esse arco, empurrando a presa contra o que a prende. Em equipe a pinça sai de graça: se o
companheiro já está de um lado, este bot toma o outro — geometria pura, sem estado compartilhado.

**3. A zona era lida tarde demais.** O antigo só reagia **depois de já estar queimando**. Mas `w.zone` traz
`x1,y1,r1,t1` — o círculo de destino e o tick da chegada. `_zonePlan` compara o tempo de viagem
(`dist/vmaxFor(r)`) com o que resta e devolve uma **urgência**; acima da margem da perícia, ir para o seguro
domina qualquer outra intenção. Medido numa sala de 40 (com o gás brando de então, `ZONE.BURN` .06 e sem rampa):
o tempo de peça dentro do gás caiu de **2,76 % para 0,17 %**. Parte dos bots joga o **anel de dentro da borda** em vez do miolo, que é o que gente faz em BR.

**4. Todo mundo era igualmente competente.** `BOT.SKILLS` dá quatro níveis com peso — ~18 % ruins, 46 %
medianos, 28 % bons, 8 % feras — e o nível mexe em reação, velocidade da mão, tremor, antecipação, margem da
zona, taxa de erro e uso do cinto. Ortogonal a `BOT.PERSONAS`, que continua dando o estilo: 12 assinaturas.
**Nenhum bot é ótimo** — nem o "fera" tem `mistake` zero. Uma sala de 50 jogando todos no mesmo nível, com a
mesma pontaria e reagindo na mesma hora, denuncia mais que qualquer outra coisa.

A decisão deixou de ser cascata fixa e virou **utilidade com compromisso**: cada intenção é pontuada na mesma
escala, a atual ganha um bônus (`BOT.STICK`) e cada uma declara um mínimo de ticks (`BOT.COMMIT`). Sem isso o
bot decide caçar, desiste, decide de novo — o vaivém é a assinatura de script.

O orçamento de CPU não mudou de ordem: tudo que varre lista foi para o `_think` (amortizado), e o perigo
colado — que era varrido TODO tick para CADA bot — passou a ser relido a cada `BOT.HAZ_TTL`. Uma sala de 50
bots custa ~0,16 ms/tick de cérebro, dentro dos 16,7 ms do tick.

Quem valida é `shared/test/bot.test.js`: uma **arena headless** roda a partida inteira (World + `zone.js` +
`BotBrain`, o mesmo caminho do servidor) e mede o que denunciaria um script — a sala tem que se resolver na
porrada e não no gás, o salto tem que converter em abate, o ponteiro não pode girar 180° num quadro, o bot
ruim tem que tomar mais gás que o bom, e a mesma semente tem que dar a mesma partida.

## Eles falam, pouco

Uma sala de 50 pessoas calada a partida inteira é tão estranha quanto um bot correndo em linha reta — e fala
demais, repetida ou fora de hora denuncia **muito** mais que qualquer movimento. Por isso o padrão é o
silêncio e tudo é orçamento (`BOT_TALK`): cooldown de sala, cooldown por bot, teto de 3 falas por partida e
probabilidade por gatilho. Nada inventa assunto: cada linha vem de algo que **acabou** de acontecer — abate,
morte, virada da zona, largada, poucos vivos —, e a fila é do INSTANTE (guardar gatilho vira comentário
atrasado, que é pior que silêncio). Às vezes escapa uma letra dobrada (`botTypo`), como gente com pressa.

Quem fala é a **sala**, não o cérebro: `Sim` só enfileira o gatilho (`sim.botTalk`) e `Room.botChatTick`
decide. Tinha que ser assim — falar é evento de sala, o `LocalServer` do `?local=1` não tem chat, e a linha
sai pelo mesmo `_pushChat` do humano, então respeita o escopo do modo (equipe fala com a equipe).

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

`shared/src/zone.js`: círculo que fecha em `ZONE.STAGES` etapas (parada → fechamento), **32 000 ticks ≈ 8 min 53 s**
no total. Determinística (o rng da sala, só na virada de fase) e testada: o círculo novo **sempre cabe dentro do
velho** — uma zona que pulasse para trás mataria quem já estava dentro.

Fora dela a peça queima `zoneBurnRate(r)·exposição` da massa por segundo e, no piso `MIN_PIECE_R`, **morre**
(`cause:'zone'`). É a única coisa do jogo que mata sozinha, e é o que fecha a partida.

**A conta mede a FATIA DO DISCO que está no gás** (`zoneExposure`), não o centro. Com o critério do centro — e com
o raio final que a zona tinha (144 px) contra um teto de peça de 1000 — o gigante ficava com o corpo cobrindo a
arena inteira **sem queimar um grama**: fisicamente invencível no exato momento em que o círculo devia decidir a
partida. Medindo a exposição ele **derrete até caber**, e quem já cabe não sente nada. `outOfZone` virou o teste
barato ("alguma parte minha está no gás?"), que é o que acende o aviso do HUD.

A conta é fechada (a área da lente entre dois círculos) e tem três atalhos antes de qualquer `acos`: cabe inteira ·
está inteira fora · o CÍRCULO está dentro da peça (`1 − R²/r²`, o caso do gigante). Só quem está EM CIMA da linha
paga a conta cheia — ~50 µs no pior caso absoluto de 800 peças, contra 1,5 ms de orçamento por passo. É função pura
de `(dx,dy,r,R)`, então `predict.js` chega ao mesmo número **sem protocolo novo**. `ZONE.EXPOSE_MIN` (2 %) é banda
morta, não folga: sem ela a peça piscaria entre "no gás" e "na zona" a 60 Hz enquanto corre colada na linha.

**A cauda de `ZONE.R` mudou junto** (final `.015` → `.08`, ou seja 144 → **768 px**), e não é ajuste: sem isso a
cura mata o paciente. O teto geométrico de 144 px seria 20 736 de massa para a SALA INTEIRA — todo mundo derretido
ao tamanho de nascença, e a final vira cara ou coroa. 768 px é ≈ um arremesso de split (`SPLIT.DIST` 780) de raio:
cabe a briga, não cabe o planeta. E as razões entre etapas passaram a ser ~√.5, então **cada fechamento tira metade
da ÁREA** e a pressão é constante do começo ao fim. O teto de massa do fim sai de graça da geometria: para todos
caberem é preciso `Σr² ≤ R²`, ou seja **590 mil de massa para a sala toda** no último círculo — o gás cobra a
diferença de quem não cabe.

**O gás ENDURECE conforme o círculo fecha**: a taxa vai de `ZONE.BURN` (.10/s, no raio da etapa 0) a
`ZONE.BURN·ZONE.BURN_K` (.22/s, no menor círculo), interpolada pelo RAIO ATUAL. Do tamanho inicial até o piso são
12,6 s no começo da partida e 5,7 s no fim. Com a taxa branda de antes (21 s em qualquer etapa) atravessar o gás em
diagonal era atalho e ficar fora no fim era uma jogada de tempo; agora é a morte. A rampa sai do RAIO, e não da
etapa, porque o raio é o que o cliente já tem em mãos — a etapa teria que ir pelo fio para um número que os dois
lados sabem derivar.

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
justo na borda, que é onde o jogador mais olha. O raio do círculo entra na conta dos dois lados (é o que carrega a
rampa), e a paridade continua testada em 1e-9.

## A comida segue a zona

O círculo fechava e o mapa virava deserto: a reposição sorteava no mapa INTEIRO, então o grão comido dentro do
círculo renascia lá fora, no gás, onde ninguém vai buscá-lo. Com 2 500 grãos em 92,16 M px², o menor círculo
(r = 144 px) comportava **20 grãos**. A última fase não tinha do que crescer, e por isso premiava só quem já era
grande: a partida acabava por tamanho acumulado, sem jogada.

Agora o mundo estoca o **círculo**, não o mapa:

| | regra |
|---|---|
| onde nasce | `spawnFood` sorteia DENTRO do círculo (√ do disco = uniforme) |
| quanto | `foodTarget() = clamp(π·r²/ZONE.FOOD_AREA, ZONE.FOOD_MIN, FOOD.COUNT)` |
| o que sobra no gás | morre: `_cullFoodOutOfZone` varre `ZONE.FOOD_SCAN` grãos por tick |
| a que ritmo repõe | a população inteira a cada `ZONE.FOOD_FILL_S` (2 s) — renda, não torneira |

Enquanto o círculo é grande o TETO manda, então **o começo da partida é idêntico ao de hoje**. Depois o alvo cai
mais devagar que a área, e a densidade sobe a cada fechamento: de 36 864 px² por grão (192 px entre grãos) para
2 400 (49 px) nas etapas 4-5. A população TOTAL cai junto (2 500 → 302), o que alivia a rede em vez de pesar.

O porquê é uma coisa só: **o grão dá massa ABSOLUTA**. Um tapete no círculo apertado vale ~2 % por grão para quem
tem 900 de massa e 0,01 % para quem tem 200 000 — que ainda perde `PLAYER.DECAY` por segundo. Quem chega pequeno no
fim varre e cresce de verdade; quem chega gigante apenas empata com o próprio decaimento. É essa assimetria que
devolve virada à última fase.

A poda não é enfeite: sem ela a população ficava presa fora do círculo e o laço de reposição — que só ENCHE até o
alvo, nunca corta — parava de repor DENTRO, que é o oposto do que se quer. E ver o grão sumindo no gás é o mesmo
aviso que as pelotas arrancadas de quem está lá.

**A renda também não é enfeite, e essa é a parte contraintuitiva.** A reposição sempre foi INSTANTÂNEA, o que não
tem consequência nenhuma num mapa de 92 M px² — ninguém cobre o tabuleiro. Num círculo de 480 px o líder cobre
quase tudo, e aí cada grão que ele come renasce debaixo dele no mesmo tick: o tapete vira uma fonte infinita para
justamente quem não precisa dela. Medido numa partida inteira de 49 bots, com o tapete e sem a renda:

| | consumo da sala | massa do líder |
|---|---|---|
| partida toda | 60–270 grãos/s | cresce normal |
| últimos 30 s, sem renda | **7 579 grãos/s** | 355 mil → **1,02 milhão** em 15 s |
| últimos 30 s, com renda | 169 grãos/s | termina em 327 mil |

E o pequeno não perde nada com o teto, porque ele nunca esteve perto dele: varrendo o círculo da etapa 5 ele
alcança ~43 grãos/s. Medido na bancada, 60 s dentro do círculo apertado:

| | etapa 4 (r 1 152) | etapa 5 (r 480) |
|---|---|---|
| pequeno (massa 900) | **32×** | **53×** |
| gigante (massa 90 000) | 0,97× (perde para o decaimento) | 2,8× |

**Nunca em cima da estrela** (`FOOD.STAR_CLEAR`): todo ponto sorteado guarda 200 px da BORDA da estrela — que
acompanha o inchaço —, e a estrela que nasce varre a comida que estava no lugar dela (`World._varreComida`), porque
no começo do mundo a comida vem antes das estrelas. Grão debaixo do disco não é risco × recompensa: é isca, cobra
`STAR.BURN` (30 % da massa) e não dá escolha. A folga cabe debaixo de `NEAR_HAZARD_R[0]` (46+200 < 260), então o
anel de risco × recompensa continua inteiro.

## A estrela também segue a zona

Ela nascia sorteada no mapa INTEIRO (`World._farSpot` amostra `rng.range` de borda a borda), então no círculo
fechado não havia nenhuma: o perigo que faz o jogador desviar — e a arma de quem sabe empurrar uma — saía da
partida justo quando ela fica interessante. Um predicado "está dentro do círculo?" não resolveria: com o círculo
em 480 px de um mapa de 9600, um ponto uniforme cai dentro em **0,8 %** das vezes, e depois de 40 tentativas o
`_farSpot` devolvia a última — ou seja, a estrela nasceria no gás na maioria das vezes, calada.

| | |
|---|---|
| onde nasce | dentro do círculo, em polar (`d = √u·r`, uniforme no disco) — o mesmo caminho da comida |
| folga da borda | `ZONE.STAR_PAD` (360 px): colada no gás ela vira corredor sem saída, e o halo ficaria por cima do veneno |
| separação | `min(STAR.MIN_SEP, r·ZONE.STAR_SEP_K)` — 1400 px de folga não cabem num círculo de 1400 |
| quando desiste | círculo menor que `ZONE.STAR_MIN_R` (1200 px), ou nenhum ponto limpo: **adia** `ZONE.STAR_RETRY_TICKS` em vez de largar a estrela em cima de alguém |
| a que ficou no gás | morre em silêncio (`_cullStarsOutOfZone`) e volta para a fila — sem isso a população cairia para sempre |

**Por que o piso é generoso.** Cada estrela esteriliza um disco de `r + FOOD.STAR_CLEAR` onde comida não nasce e
a existente é varrida: 246 px (280 na inchada). Num círculo de 480 px isso é **26 % da área** — justamente o
tapete de comida que é a virada do jogador pequeno no fim. Em 1200 px o mesmo disco é 4 %, que é ruído.

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
| 3 | ~~Nova~~ | — | **fora do sorteio** (`weight 0`), código dormente | o laço da `supernova` |

(A **Mina gravitacional** existiu por uma rodada e saiu a pedido: reacendia o buraco negro, que já tinha sido
desligado por não ficar bom. O código do BLACKHOLE continua dormente onde estava.)

(A **Nova** saiu pelo mesmo caminho, e por um motivo de desenho: uma onda de 900 px centrada em MIM, que empurra
todo mundo e estilhaça no miolo sem me atingir, não MIRA e não tem contra-jogo — não dá para desviar do que sai de
dentro do outro —, e resolvia sozinha a briga de fim de partida, justo onde o círculo apertado devia obrigar ao
encontro. `weight 0` a tira do sorteio sem apagar nada: ela continua implementada e testada, e volta trocando o
número. O míssil também tem peso 0, por outro motivo — ele cai como `FOOD_TYPE.AMMO`.)

Cada uma custou ~10 linhas porque nenhuma inventou sistema novo. As comidas entram em `FOOD_TYPE` **8..10**
(no fim: três testes de faixa dependem da ordem do enum) e a raridade é a tabela de peso `WEAPON_DROPS` em
`world.js` — que filtra por `weight > 0`, e é assim que míssil e Nova ficam de fora do sorteio.

## Chat

JSON no WS (`{t:"chat",text}` → `{t:"chat",slot,name,team,text,at}`). O escopo é do servidor, pelo `chat` do modo.
Rate limit PRÓPRIO (`CHAT.RATE_MS`/`BURST`) por cima do balde de JSON da sessão: aquele protege o servidor, este
protege a tela dos outros. Sem histórico — quem entra não recebe o que já passou.

Painel numa faixa vertical à ESQUERDA, no meio: os cantos esquerdos já são do placar e do bloco de massa nos três
temas. Enter abre, Esc fecha, e o `inInput()` do teclado do jogo já garante que digitar não divide o planeta.

## Voz (K)

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

## Assistir a uma sala em andamento

Morrer virava câmera desde sempre; ENTRAR só para olhar, não. E a sala de Battle Royale é justamente a que
recusa entrada depois da largada (`acceptsJoin()` → `'started'`), ou seja a partida mais interessante de
acompanhar era a única que não dava para ver.

O espectador é uma sessão **com slot e sem corpo** — o mesmo `addPlayer({spawn:false})` que o lobby do BR já
usava —, e ele nasce `dead`. Não é gambiarra: `gp.dead` já É o estado de quem assiste, e é ele que dá de
graça as quatro coisas que fariam falta (a troca de câmera do `wsServer`, a arquibancada do `_escopoFala`, o
`if(gp.isBot||gp.dead)continue` do `endRound` e a isenção do ceifador de inatividade). Um terceiro estado —
"nem vivo nem morto" — exigiria tocar nos quatro, e cada um deles falha em silêncio quando esquecido.

- **A porta é OUTRA** (`Room.acceptsSpectator`/`joinSpec`), nunca `acceptsJoin()`: se fossem a mesma, abrir
  uma abriria a outra e o Battle Royale voltaria a aceitar JOGADORES no meio da rodada.
- **Não ocupa vaga**: `humanCount` e `isFull` contam sessões não-espectadoras. Contá-lo faria uma sala com
  25 jogadores e 5 olheiros parecer cheia — e ainda encolheria o preenchimento, porque `botAlvo` é
  `botCount - humanCount`.
- **Não aparece para ninguém**: fora do `PLAYERS`, fora do placar (sem corpo, `leaderboard()` já o pula),
  fora do roster e do pódio. É a mesma decisão do `anonBots`, pelo mesmo motivo.
- **Não reserva o nick**: reservando, quem assistiu uma partida não conseguiria ENTRAR na seguinte com o
  próprio nome, e a sala viraria lista negra por causa de quem só olhava.
- **Não é uma vida**: o `wsServer` descarta a sessão de persistência pelo mesmo caminho dos becos de recusa.
  Uma linha em `matches` com `duration_s=0` viraria "a primeira vida" de um novato no relatório de retenção.
- **Teto por sala** (`ROOM.SPEC_MAX`): ele custa um snapshot por tick, que é o item mais caro POR SESSÃO do
  laço. Sem número, uma sala que virou assunto acumularia olheiros até o tick estourar, e quem pagaria é
  quem está jogando. No teto a resposta é recusa, nunca fila. Sala PARADA ou terminada também não aceita —
  não há o que ver.
- **Ele é isento do ceifador de inatividade**, e tem que ser: quem assiste fica parado de propósito. Quem
  segura o custo é o teto, não o relógio.

Entra-se por dois lugares, e nenhum deles é o automático: a linha trancada por "já começou" da tela de
**Salas** (o 🔒 vira "Assistir"; "cheia" continua com o cadeado, porque ali não há partida decidida a
acompanhar) e o botão do painel **/admin**, que abre `/?sala=<code>&assistir=1`.

⚠️ **O espectador NUNCA vira jogador sozinho** — nem quando abre vaga, nem no fim da rodada. Sair é decisão
dele, e é isso que dispensa promover uma sessão sem corpo a jogador no meio da partida, com a corrida pela
vaga que viria junto. Quem quer jogar clica em SAIR e entra pela porta de sempre.

⚠️ A tela dele é uma **barra no rodapé** (`ui/Spectate.jsx`), não um cartão: o ponto de assistir é ver a
sala, e um painel no meio taparia o que se veio olhar. As setas ‹ ›, o mapa grande e o teclado são as MESMAS
peças da tela de morte — uma gramática só para os dois lugares em que se assiste.

## Sala com dono

As três escolhas da tela de modos põem o jogador numa sala que o SERVIDOR escolhe. A quarta cria a sala
**dele**: modo, duração e privacidade, e ele entra como dono — podendo expulsar e banir.

- **Só conta registrada** (`403 need_account`). O dono expulsa e bane, e quem troca de identidade a cada
  entrada não pode ter esse poder. É também a primeira moderação por jogador que este jogo tem — o item
  "moderação de servidor" da lista abaixo continua fora; o que entrou é moderação da PRÓPRIA sala.
- **Duração** de `ROUND.CHOICES_MIN`, com **0 = sem fim** e só no Livre. No Battle Royale o tempo é a rede
  de segurança da zona: `roundTicksOf` recusa qualquer valor abaixo de `ZONE_TOTAL_TICKS`, que é DERIVADO
  das etapas da zona — mexer nelas move o piso sozinho. Uma partida de BR que acaba por tempo antes de o
  círculo fechar é a única forma de o modo terminar sem ter decidido nada.
- **Sem fim** significa sem BIG CRUNCH, sem pódio e sem campeão: a sala vive até esvaziar. O relógio do
  espaço CONTINUA girando (o servidor manda `dayTicks` justamente para isso), e o que some é a contagem
  regressiva — o HUD mostra `∞`.
- **Privada** = fora de `/api/rooms`, de `/internal/rooms` e do automático. Entra-se pelo código, que É o
  convite — o mesmo contrato do lobby de equipe, e sem senha. ⚠️ Sala privada morta LIBERA o código:
  `getRoom` materializa uma sala nova, pública, para qualquer código deste shard. Não se conserta isso com
  uma lista persistente de códigos; é o preço de a sala ser memória.
- **Quem preenche a sala do dono é o CONVITE, não o servidor.** Privada, ela não recebe um bot: no Livre
  `botCount` nasce 0 e no Battle Royale a guarda mora dentro de `fillTo`, que é o caminho único dos três
  chamadores (a largada, o passo do lobby e o fecho da janela). ⚠️ E aí o lobby de um BR fechado com UM
  humano **espera** em vez de largar: `aliveTeams()<=1` é a condição de vitória e já estaria satisfeita
  antes do primeiro tick — o dono veria a largada e o pódio no mesmo segundo.
  Pública, ela também **não nasce em andamento**: a semente de `ROOM.BOT_SEED` e os tamanhos grandes
  existem para contar "isto já estava rolando" a quem cai numa sala que o SERVIDOR escolheu, e na sala que
  o próprio jogador acabou de abrir a história é falsa — ele está olhando e veria os seis nascerem de uma
  vez, dois deles gigantes. Lá a semente é ZERO, ele entra sozinho, todo mundo chega pequeno
  (`abreEmAndamento` zera o `f` de `botSpawnR`) e o intervalo é `ROOM.HOST_BOT_JOIN_TICKS` (15–35 s, contra
  6–14 s da automática): ele está esperando os amigos, e uma sala que se enche de bot em dois minutos é
  uma sala sem vaga para eles. ⚠️ Quem distingue a sala do dono da automática é `hostUserId`, nunca
  `private` sozinho — a sala de EQUIPE também é fechada e continua precisando de preenchimento.
- **O dono pode cair e voltar** (a comparação é por conta, não por sessão). Passado `ROOM.HOST_GRACE_MS` fora,
  a coroa vai ao humano mais antigo presente — uma sala de 20 pessoas sem ninguém que possa expulsar um
  invasor é pior que uma com dono improvisado. E o ceifador não recolhe a sala enquanto `ROOM.HOST_HOLD_MS`
  não vencer: ela existe para esperar os amigos chegarem pelo link.
- **Kick e ban vão por WS**, não por HTTP: o socket do dono já foi aberto em `/ws/<shardOf(code)>`, ou seja já
  está no shard que conhece a sala. Não há o que rotear — a armadilha `askPeers`×`tellPeers` não existe deste
  lado. Só a CONSULTA por código (`GET /api/room/:code`, o link de convite) roteia.
- **O ban vive e morre com a sala**: casa por conta e, para quem não tem conta, pelo hash do token. Não vai ao
  banco, pelo mesmo motivo que o lobby de equipe não vai.
- O painel do dono mora **dentro do menu de pausa** (Esc), e o roster tem só HUMANOS: iterar `room.sessions`
  respeita por construção o `anonBots` — um roster com bots entregaria justamente a resposta que o Battle
  Royale existe para esconder.

## O que ficou de fora

- **O `?local=1` e o modo offline continuam só Livre.** O `LocalServer` é uma segunda implementação da sala
  (duplica o `_consume` e o `self`), e a tela de modos desabilita Battle Royale com `api.server === false`.
- Filtro de palavrão, denúncia e moderação de servidor.
- Lista de amigos persistida (hoje o convite é o código do lobby, que basta e funciona para convidado).

## Fala dos bots pela LLM (Ollama)

O repertório fixo (`BOT_CHAT`) continua sendo o CHÃO: é o que sai sem `OLLAMA_URL`, com o serviço fora do ar
ou quando a resposta demora demais. O que a LLM acrescenta é o que uma lista não tem — reagir ao que foi
DITO, responder a quem chama pelo nome e falar no idioma da conversa.

- **Onde**: `server/src/llm/ollama.js` (cliente HTTP, sem dependência nova) e `server/src/rooms/botChat.js`
  (prompt, limpeza, detecção de menção). Ligados por `OLLAMA_URL` / `OLLAMA_MODEL` / `BOT_CHAT_LLM`.
  ⚠️ `OLLAMA_MODEL` é só a SEMENTE do boot: qual modelo atende é o tunable `BOT_LLM.MODELO` (padrão
  `gpt-oss:20b`), trocável no /admin sem reiniciar pod — ver `docs/spec/admin.md`.
- **Nunca bloqueia o tick**: `botChatTick` roda dentro do `step()` da sala e o Scheduler percorre todas as
  salas do processo no mesmo laço de 60 Hz. A geração é disparada e esquecida; quem publica é o callback,
  que revalida tudo (sala viva, fase, bot vivo, socket aberto) e DESCARTA o que passou de `BOT_LLM.STALE_MS`.
- **Dois orçamentos**. Espontâneo (comentar um evento): o de sempre, apertado — falar demais denuncia um bot
  mais que qualquer movimento. Menção (alguém te chamou): bem mais folgado, porque ser chamado pelo nome e
  ficar mudo é justamente o que não passa por gente. Sem citação nenhuma, só quem falou por último tem
  direito a uma réplica, e raramente (`REPLY_P`).
- **Menção aproximada** (`citou`): ninguém digita o apelido inteiro e certo no meio de uma partida. A
  comparação é por PALAVRA, sobre a raiz do nick (`botNick` monta `base`, `base42`, `base_137`, `BASE`,
  `xXbaseXx`), aceitando sufixo de diminutivo, apelido cortado e 1–2 letras de diferença. O pecado grave é o
  FALSO positivo — responder a quem não chamou é exatamente poluir o chat —, então há uma lista de palavras
  comuns e uma varredura em `server/test/botchat.test.js` que mede a taxa contra os nomes e as frases reais
  do jogo.
- **Idioma**: o system prompt é em inglês (a instrução é seguida com muito mais fidelidade assim) e a
  mensagem dirigida ao bot vai REPETIDA no fim do prompt, sozinha, com a ordem de idioma colada nela.
  Enterrada no histórico ela perdia: numa sala falando português, um "hey X, you are trash" voltava em
  português.
- **Modelo residente**: carregar custa ~27 s, responder custa ~0,5 s. Daí `keep_alive`, o `warmup()` no boot
  e o disjuntor REAQUECER enquanto está aberto — o motivo mais comum de estourar o prazo não é o serviço
  estar fora, é o modelo ter saído da memória.

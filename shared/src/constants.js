// ── CONSTANTES ÚNICAS (servidor e cliente importam daqui; nada duplicado) ─────
// Unidades: px, segundos, px/s. Passo fixo de 60 Hz.
// @ts-check
// ⚠️ EDIÇÃO DE BUILD: o cliente tem cópia própria do bundle e dois valores diferentes corrompem
// `qPos/dqPos` — TODA posição do fio sai deslocada, em silêncio. Cliente e servidor têm que subir na mesma
// imagem. (Este comentário já dizia "NUNCA TUNABLE" e que `codec.js` capturava `const W=WORLD.w` no LOAD
// DO MÓDULO: as duas metades ficaram obsoletas e contradiziam o bloco 10 linhas abaixo — hoje `WORLD.LADO`
// É tunable e `codec.js` lê `WORLD.w` a cada chamada, que é justamente o que deixa o cliente obedecer o
// `world` da sala e não quebrar com um pod de mundo diferente.)
// 9600 → 12000 (+25% de lado, +56% de área). O que é FRAÇÃO acompanha sozinho (zona, anel de largada do
// BR, piso da câmera, quantização, grade, radar, fundo); o que é CONTAGEM ou DISTÂNCIA teve que ser
// escalado à mão logo abaixo — cada um com o expoente certo, s² para população e s para alcance.
export const WORLD={w:12000,h:12000,LADO:12000};
// LADO é o lado do mundo para a PRÓXIMA vez que o processo subir, e é ele que o /admin edita — `w`/`h` são
// o mundo de AGORA. Os dois existem separados porque mudar o tamanho com salas rodando não tem conserto:
// a zona já foi sorteada, os cinturões já nasceram, e os clientes já quantizaram na escala velha. O boot
// (`startServer`) copia LADO para w/h antes de a primeira sala existir, e daí em diante ninguém mais mexe.
// ⚠️ O CLIENTE obedece o `world:{w,h}` que a sala manda no JSON `room` (`wsServer` já o mandava e ele era
// campo decorativo), e é por isso que `protocol/codec.js` passou a ler `WORLD.w` a cada chamada em vez de
// capturá-lo na carga do módulo: sem isso um pod com o mundo mudado e um bundle antigo deslocariam TODA
// posição do fio, com fator de erro constante e nada na tela dizendo por quê.
export const TICK_HZ=60,DT=1/60,SNAPSHOT_EVERY=3,LEADERBOARD_EVERY=30,SAMPLE_EVERY=30;
// SPEC_MAX: quantos ESPECTADORES uma sala aceita ao mesmo tempo, além dos jogadores. Espectador é uma
// sessão com slot e SEM corpo (o mesmo `spawn:false` do lobby do Battle Royale): ele não entra em
// `humanCount`, não conta para `isFull` e não tira vaga de ninguém — mas custa um snapshot por tick, que é
// o item mais caro POR SESSÃO do laço (ver o profiling em CLAUDE.md). Por isso ele tem teto próprio: sem
// número, uma sala que virou assunto acumularia espectadores até o tick estourar, e quem paga seria quem
// está jogando. Quando o teto enche, a resposta é `ROOM_FULL` — nunca uma fila.
export const ROOM={SPEC_MAX:10,MAX:30,BOTS:24,CODE_LEN:4,STOP_AFTER_MS:30000,REMOVE_AFTER_MS:35000,RESUME_GRACE_TICKS:600,
  HOST_HOLD_MS:120000,HOST_GRACE_MS:30000,
  // ── O AUTOMÁTICO AGRUPA ATÉ AQUI, E DAÍ EM DIANTE ESPALHA ──
  // `MAX` é o teto DURO de uma sala (quem entra por código ou convite vai até ele). Estes dois são os
  // tetos do JOGAR (AUTO), e existem porque agrupar sem freio derruba o servidor: `findOrCreateRoom`
  // manda o jogador para a sala MAIS CHEIA com vaga e `/api/auto` fazia o mesmo sobre o CLUSTER INTEIRO
  // — então a sala mais cheia do mundo era um ATRATOR, e o shard dela também. Medido em produção em
  // 2026-09-05 com `MAX` em 50: 55 humanos e 4 salas no shard 2 (1198m de CPU, o laço de 60 Hz
  // estourando o tick para todo mundo) contra UM humano em cada um dos outros dois shards, ociosos a
  // 159m e 377m. O jogo travava com o cluster a um terço da capacidade, e quem entrava caía justamente
  // na sala pior.
  // SOFT: quantos HUMANOS uma sala aceita pelo automático. Acima disso ela sai do pool e o jogador vai
  // para a próxima — ou para uma sala NOVA. Não fecha a porta: convite, código e equipe continuam
  // entrando até `MAX`, que é o que faz o amigo cair na sala do amigo mesmo cheia.
  // SHARD_SOFT: quanta CARGA um shard aceita pelo automático, somando as salas dele. É o teto que mede o
  // PROCESSO, e sem ele o SOFT sozinho não resolve nada: três salas de 20 no mesmo pod custam o mesmo que
  // uma de 60. A unidade é "um jogador humano" — 40 é a frota de sessões que cabe num core.
  // ⚠️ AS TRÊS COISAS QUE CUSTAM NÃO CUSTAM IGUAL, e tratá-las como planeta genérico erra nos dois
  // sentidos. Medido em produção em 2026-09-05, com a carga já distribuída pelos três shards:
  //   shard 0 · 38 humanos,  0 bots, 2 salas → 943m      shard 1 · 9 humanos, 26 bots, 4 salas → 537m
  //   shard 2 · 16 humanos, 93 bots, 6 salas → 953m
  // Resolvendo o sistema: SESSÃO ≈ 21m, BOT ≈ 2m e SALA ≈ 76m de custo FIXO. Daí os pesos abaixo,
  // normalizados na sessão — e eles confirmam o profiling que já estava escrito neste arquivo: o caro é
  // o SNAPSHOT (por sessão) e a GRADE DA COMIDA (por sala, e ela roda com a sala vazia); o cérebro do
  // preenchimento é 1,2% do tick. Ou seja UMA SALA custa quase quatro jogadores, e é por isso que a
  // conta cobra por sala — seis salas quase vazias no mesmo pod (o que havia no shard 2) pesam mais que
  // vinte pessoas jogando.
  // ⚠️ Contar bot como planeta inteiro faria o pod recusar gente que ele aguenta; ignorá-lo deixaria
  // passar o pior caso, o lobby de Battle Royale com 2 humanos e 48 preenchimentos.
  // ⚠️ Os dois são TETO DE ENTRADA, nunca de permanência: ninguém é removido de uma sala por ela passar
  // do SOFT — quem já está jogando fica. E não são recusa: sem nenhum shard abaixo do teto, o jogador
  // entra do mesmo jeito (na sala MENOS cheia), porque fila de espera num .io é o jogador indo embora.
  SOFT:20,SHARD_SOFT:40,CUSTO_BOT:.1,CUSTO_SALA:3.5,
  // ── PREENCHIMENTO É O QUE FALTA PARA A SALA PARECER VIVA, NÃO UMA COTA FIXA ──
  // `BOTS` era o alvo ABSOLUTO: uma sala com 50 humanos carregava os 15 preenchimentos do mesmo jeito —
  // 15 cérebros, 15 planetas e 15 linhas de placar que ninguém pediu, no pod que já estava saturado. O
  // alvo passa a ser o que FALTA (`BOTS - humanos`, ver `Room.botAlvo`): sala vazia continua abrindo com
  // a semente de sempre e sala com gente vai ficando só com gente.
  // ⚠️ A queda é por ATRITO, e é de propósito: o bot que morre não volta acima do alvo (o gate em
  // `Sim._died`), e só o excedente que sobra é removido — um por `BOT_TRIM_TICKS`, o mais LONGE de
  // qualquer humano. Tirar 15 planetas de uma vez, na frente de quem está jogando, seria trocar um
  // defeito de custo por um defeito de tela.
  BOT_TRIM_TICKS:120,
  // ── A SALA NÃO NASCE CHEIA ──
  // Ela nascia com os 15 preenchimentos no MESMO tick, e isso é a coisa mais fácil de notar num jogo .io:
  // quinze planetas surgindo juntos, do nada, no instante em que você entra. Gente de verdade chega aos
  // poucos — então o preenchimento chega aos poucos também. `BOT_SEED` são os que já estão lá quando a
  // porta abre (sala vazia é pior que sala com bot: não há o que perseguir e nem o que fugir), e um novo
  // entra a cada intervalo sorteado em `BOT_JOIN_TICKS`, até o alvo. Com 15 e 6-14 s, a sala leva de 1 a 3
  // minutos para encher — o mesmo tempo que uma sala de verdade levaria num horário morno.
  // ⚠️ Só vale no LIVRE: no Battle Royale quem preenche é o LOBBY, com a curva própria dele (BR.FILL_EXP),
  // e lá `botCount` é 0 justamente porque o preenchimento não passa por aqui.
  // ── ...E NÃO NASCE TODA PEQUENA ──
  // Os preenchimentos nasciam TODOS na mesma faixa (PLAYER.BOT_R), do tamanho de quem acabou de entrar —
  // então a sala nova parecia uma sala NOVA, que é o contrário do que a porta do Livre promete (entra-se
  // "direto, numa sala em andamento"). A abertura passa a ter planeta de todo tamanho: `SEED_R` são as
  // faixas de raio dos dois tiers GRANDES (gigante e médio; o pequeno continua sendo `PLAYER.BOT_R`, e
  // repetir [24,58] aqui só criaria uma segunda verdade) e `SEED_MIX` diz QUANTOS de cada um há na
  // SEMENTE — 2 gigantes e 3 médios dos BOT_SEED (6), o resto pequeno. Números, não frações: fração aqui
  // MENTE (`.25` de 6 arredonda para 2, que é 33%) e ninguém consegue pedir "um gigante a menos" mexendo
  // nela. E é COTA, não probabilidade: com sorteio independente uma sala em cada vinte sai só de
  // bolinhas, e a sensação de "isto já estava rolando" não pode depender de sorte.
  // `BOT_SEED` subiu de 3 para 6 pelo mesmo motivo: a semente deixou de ser o mínimo para a sala não
  // estar vazia e passou a ser a sala que já estava rolando — três planetas não contam essa história, e
  // a chegada gradual continua igual (faltam 9 para o alvo de 15). ⚠️ 7 é o teto prático: com 8 a sala
  // enche dentro da janela do teste de chegada gradual (server/test/roombots.test.js).
  // `SEED_WINDOW_TICKS` é o quanto a abertura ainda vale para quem CHEGA depois, e ele é METADE do
  // critério: quem manda é o MENOR entre esse relógio e o quanto a sala ainda tem de vaga. Só o relógio
  // não servia — a sala enche em ~93 s e a janela é de 120 s, então o decaimento nunca chegava a zero e
  // toda chegada vinha com chance de gigante; e ele ainda ficava amarrado ao env `ROOM_BOTS` e ao
  // `BOT_JOIN_TICKS` em silêncio. O enchimento se normaliza sozinho: cheia é cheia em qualquer ritmo.
  // ⚠️ O GIGANTE DA SEMENTE ERA O QUE MATAVA O NOVATO. Medido em produção (14 dias, 4.256 contas novas):
  // a PRIMEIRA vida tem mediana de 31 s, 49% dela morre em menos de 30 s, e o algoz mais comum é um
  // PREENCHIMENTO com 41.447 de massa contra 6.766 da vítima — razão 6,1×, em 46 s. Aqueles 41 mil são
  // exatamente esta faixa: r 200–250 é massa 40.000–62.500. Ou seja, a sala punha dois predadores
  // imbatíveis na frente de quem entra com 900 para parecer "já em andamento", e eles cobravam a conta
  // no primeiro minuto. O tier caiu para r 140–180 (19.600–32.400, ~metade) e a cota de gigantes de 2
  // para 1: a sala continua tendo planeta de todo tamanho — que é o ponto — sem ter dois deles.
  SEED_R:[[140,180],[80,150]],SEED_MIX:[1,3],SEED_WINDOW_TICKS:7200,
  BOT_SEED:6,BOT_JOIN_TICKS:[360,840],
  // ── A SALA DO DONO NÃO É A SALA AUTOMÁTICA ──
  // Ela não nasce "em andamento": quem abre uma sala sua entra SOZINHO e vê os preenchimentos chegarem.
  // A semente e os tamanhos grandes existem para contar "isto já estava rolando" a quem cai numa sala que
  // o SERVIDOR escolheu — na sala que o próprio jogador acabou de abrir essa história é falsa, e ele vê os
  // seis nascerem de uma vez no primeiro tick. Por isso lá a semente é ZERO, todo mundo chega pequeno e o
  // intervalo é este, bem mais largo: ele espera os amigos, e uma sala que se enche de bot em dois minutos
  // é uma sala que já não tem vaga para eles. Com 15 preenchimentos, 15–35 s dá de 4 a 9 minutos.
  HOST_BOT_JOIN_TICKS:[900,2100],
  // ── UMA BANDEIRA NÃO PODE TOMAR A SALA ──
  // A bandeira do preenchimento existe para dizer que a sala é INTERNACIONAL — e ela só diz isso se as
  // bandeiras forem DIFERENTES. `botCountry` sorteia cada bot de forma INDEPENDENTE numa roleta em que o
  // BR pesa 46 de 100, então a mesma bandeira sair 6 ou 7 vezes numa sala de 15 não é azar: é o valor
  // esperado. E o balde de apelidos da LLM levava isso ao extremo — ele pede um lote inteiro de UM país
  // só e servia em LIFO, então a sala inteira saía com a mesma bandeira (medido em produção: 7 de 7
  // portuguesas). Aqui o sorteio ganha um TETO por bandeira, que sobe com o tamanho da sala:
  // `1 + floor(bots/PAIS_TETO_DIV)`. Com 5 e uma sala de 15, nenhuma bandeira passa de 3 e há pelo menos
  // cinco países na mesa. ⚠️ É teto, não cota: quem escolhe continua sendo a roleta ponderada (a base do
  // jogo é brasileira e o placar tem que continuar parecendo com ela), só que ela não pode mais pintar a
  // sala inteira de uma cor só — e quem aplica o teto é a PRÓPRIA roleta (`botCountry` recebe as
  // bandeiras cheias e reparte o peso delas entre as outras), e não um laço de re-sorteio: re-sortear é
  // estatística, e uma tentativa azarada fura o teto de vez em quando sem que ninguém entenda por quê.
  PAIS_TETO_DIV:5};
// HOST_HOLD_MS: uma sala COM DONO não é recolhida enquanto essa carência não vencer. O ceifador padrão a
// apagaria em 35 s sem humanos — e uma sala privada existe justamente para esperar os amigos chegarem, então
// o comportamento normal a mataria antes de o segundo jogador abrir o link. Só o REMOVE é adiado: a sala
// continua sendo PARADA em STOP_AFTER_MS (`getRoom` a religa), o que de quebra congela o relógio da rodada
// enquanto ninguém está lá.
// HOST_GRACE_MS: o dono pode cair e voltar. Passado esse tempo fora, a coroa vai para o humano mais antigo
// que estiver na sala — sem isso uma sala privada com 20 pessoas fica sem quem possa expulsar um invasor.
export const ROUND={TICKS:108000,BREAK_MS:15000,DAY_START_H:5,WARN_S:10,DAYS:2,FADE_MS:600,BOARD_MAX:60,AWARD_MIN_KILLS:3,
  DAY_TICKS:54000,CHOICES_MIN:[10,20,30,60,0],RESPAWN_TICKS:300,DEAD_DELAY_MS:1200,DEAD_MIN_MS:1500};
// DEAD_DELAY_MS: quanto o jogo espera entre a MORTE e a tela de morte. Era zero — `onDead` escrevia
// `screen:"dead"` no mesmo tick da mensagem —, então o modal cobria exatamente o quadro em que o planeta
// estoura, que é a única coisa que a pessoa quer ver ali. A câmera já foi para o alvo que o servidor
// escolheu (`Room.spectateTargetFor`, chamado junto do `dead`), então a espera mostra a sala de verdade.
// DEAD_MIN_MS: o PISO de tempo com a tela na frente, contado de quando ela apareceu. Ele não é conforto:
// é o que impede o respawn automático de disparar no primeiro frame quando o par `{deadAt,armAt}` que
// chega à tela ainda é o de uma vida ANTERIOR (ver client/src/ui/deadClock.js). Sem ele existia uma morte
// em que a tela simplesmente não aparecia e o jogador reentrava no ato.
// RESPAWN_TICKS: quanto tempo a tela de morte espera antes de renascer SOZINHA no Livre (300 = 5 s a
// 60 Hz). ⚠️ Quem decide QUANDO renascer é o CLIENTE, não o servidor: `respawn` já aceitava o pedido a
// qualquer momento (era só o botão "DE NOVO" que faltava apertar), então isto só automatiza o clique —
// não é autoridade de jogo, é temporização de tela, e por isso é `wire` em tunables.js (chega pelo JSON
// `room`, no molde de `CAM.K`) em vez de `server`. O jogador continua podendo clicar "DE NOVO" a
// qualquer momento para pular a espera.
// DAY_TICKS: o dia do relógio do espaço em ticks (15 min), que até aqui só existia dividido — `TICKS/DAYS`.
// Ele precisou de nome próprio por causa da sala SEM FIM: lá não há `TICKS` de onde derivar, e sem um dia
// declarado o céu simplesmente PARARIA de girar justo na sala que dura mais.
// CHOICES_MIN: os tempos que o dono de sala pode escolher, em minutos. ⚠️ 0 é SEM FIM e só vale no Livre —
// no Battle Royale o tempo é a rede de segurança da zona (ver roundTicksOf).
// rodada de 30 min (108000 ticks a 60 Hz) = DAYS dias do relógio do espaço (dia de 15 min → 6 trocas de céu por sala),
// começando às DAY_START_H; a troca de tema é coberta por um fade de FADE_MS (client/src/theme/fade.js);
// no fim o mundo explode, define-se o campeão (maior planeta vivo) e o placar fica BREAK_MS antes da sala nova.
// WARN_S: segundos finais com a contagem gigante na tela.
// Era 1 h / 4 dias. Cortar para 30 min mantendo DAYS=4 dobraria a velocidade do céu (troca a cada 2,5 min),
// então DAYS cai junto para 2 e o DIA continua com os mesmos 15 min de sempre.
// ⚠️ TICKS aqui é o PADRÃO e a constante VIVA: o env ROUND_TICKS (k8s/05-config.yaml) o SEMEIA no boot
// (`startServer`), e daí em diante quem manda é o painel /admin, que o edita em MINUTOS. `Room.js` lê esta
// constante — não `config.roundTicks` —, senão o env venceria o painel para sempre e o parâmetro não valeria
// nada. Vale para as salas CRIADAS daí em diante; a que já está rodando fixou a duração no construtor. E DAYS é constante do CLIENTE enquanto os ticks vêm do SERVIDOR — por isso
// roundInfo() passou a mandar `days` no JSON: cliente novo com env velho desenharia o céu na metade da
// velocidade, e o jogador veria o relógio do espaço mentir sem ninguém saber por quê.
// BOARD_MAX: teto de linhas do placar da sala (com respawn, 30 min rendem mais de 100 participantes).
// AWARD_MIN_KILLS: piso para disputar "maior K/D" da sala — sem ele o prêmio é sempre de quem fez 1 e não morreu.
// ── MODOS DE JOGO ────────────────────────────────────────────────────────────
// O modo é um DESCRITOR, não um `if` espalhado: sala, Sim e regras leem os mesmos campos daqui.
// LIVRE é o jogo de sempre (respawn, rodada de 1 h, todo mundo contra todo mundo). BATTLE ROYALE é
// último-vivo: LOBBY que enche até BR.PLAYERS, contagem regressiva, largada, sem respawn, zona que
// encolhe e armas. `bots` aqui é só o DEFAULT — o servidor continua deixando o env mandar
// (config.roomBots), senão trocar este arquivo mudaria o balanço da sala livre em produção.
export const MODE={FREE:0,BR:1};
export const BR={PLAYERS:50,TEAM_SIZES:[1,2,3,4],MIN_HUMANS:1,
  LOBBY_TICKS:1800,COUNTDOWN_TICKS:300,FILL_EXP:1.7,ARRIVE_JITTER:.55,
  SPAWN_RING:.44,START_AMMO:1,ROUND_TICKS:45000,WEAPON_P:.05,JOIN_GRACE_TICKS:120,
  INVITE_TTL_MS:20000,   // quanto o convite "Battle Royale começando" fica na tela de quem está no Livre
  // QUANTO TEMPO SEM CONVIDAR A MESMA PESSOA DE NOVO. Não havia nada: toda sala de BR pública criada em
  // QUALQUER shard do cluster manda um card para TODA sessão do Livre (`RoomManager.announceBrStartCluster`
  // → `Room.brInvite`), e a sala de BR fecha na largada — ou seja, cada onda de partidas cria salas novas.
  // Com `LOBBY_TICKS` de 30 s, quem joga o Livre podia levar um card por minuto, sempre. O teto é por
  // SESSÃO e vive na `Session` (memória, como o resto do estado de sala): não é acumulável, não vai ao
  // banco e nasce zerado a cada conexão — o primeiro convite de quem acabou de entrar sai na hora.
  // ⚠️ Isto é ORTOGONAL à pref `brInvite` do jogador. Este número diz "com que frequência no máximo"; a
  // pref diz "eu não quero". Uma não substitui a outra: sem o teto, desligar vira a única saída para quem
  // só queria menos; sem a pref, quem não quer nada continua levando um card a cada 3 minutos.
  INVITE_CD_MS:180000};
// PLAYERS é o total (humanos + bots): a sala livre já roda 30 humanos + 15 bots = 45, então 50 é o MESMO
// regime de tick, não um salto de escala. Capacidade efetiva = PLAYERS − PLAYERS%teamSize (50/50/48/48):
// equipe incompleta contra equipes cheias não é dificuldade, é sorteio.
//
// O LOBBY (fase 'lobby') é uma tela de espera de verdade: ninguém está no mundo ainda, e o jogador vê a
// sala ENCHENDO. LOBBY_TICKS (30 s) é a janela em que os humanos que estão procurando battle royale caem
// na MESMA sala (findOrCreateRoom junta na mais cheia que ainda aceita). O resto das vagas é completado
// ao longo dessa janela, não de uma vez no fim: FILL_EXP > 1 deixa a curva lenta no começo e rápida no
// fim, que é como uma fila de verdade se comporta, e ARRIVE_JITTER quebra a cadência para as chegadas não
// saírem em intervalos exatos. Quando lota (ou a janela fecha), COUNTDOWN_TICKS (5 s) de contagem e larga.
// Vaga é sempre do humano: quem entra num lobby cheio DERRUBA um preenchimento (ver Room.join) — sem isso,
// dois amigos procurando com 10 s de diferença cairiam em salas separadas.
// ROUND_TICKS (10 min) é só a rede de segurança: a partida acaba por último-vivo bem antes, e a zona
// inteira (ZONE) fecha em 30 000 ticks ≈ 8 min 20 s. ⚠️ Os dois andam JUNTOS: alongar a zona sem alongar
// isto aqui faz a partida terminar por tempo antes de o círculo fechar, que é o único jeito de o Battle
// Royale acabar sem ter decidido nada. Em produção quem manda é o env ROUND_TICKS (k8s/05-config).
export const ZONE={STAGES:6,R:[.62,.45,.32,.225,.16,.113,.08],
  HOLD_TICKS:[7500,5625,4125,2250,1125,750],SHRINK_TICKS:[4500,3750,3000,2250,1500,1125],
  DRIFT:.45,BURN:.10,BURN_K:2.2,GAS_GAIN:.5,EXPOSE_MIN:.02,WARN_TICKS:180,MIN_R:60,SHED_TICKS:24,SHED_DIST:180,SHED_SPREAD:.85,SHED_MIN:1,SHED_N_DEATH:7,
  FOOD_AREA:2400,FOOD_MIN:1875,FOOD_SCAN:96,FOOD_FILL_S:3,
  STAR_PAD:360,STAR_MIN_R:1200,STAR_SEP_K:.5,STAR_RETRY_TICKS:300,STAR_SCAN:2};
/**
 * Quanto a zona leva para FECHAR de vez. DERIVADO das listas acima, nunca copiado: `BR.ROUND_TICKS` e a zona
 * andam sempre juntos, e é isto que faz mexer numa etapa mover o piso de duração da partida sozinho.
 * (Mora aqui, e não em zone.js, porque `roundTicksOf` precisa dele e constants.js é a raiz — não importa nada.)
 */
export const ZONE_TOTAL_TICKS=ZONE.HOLD_TICKS.reduce((a,b)=>a+b,0)+ZONE.SHRINK_TICKS.reduce((a,b)=>a+b,0);
// LIMIARES (em segundos) do aviso reforçado antes do PRÓXIMO fechamento começar. 3s é o WARN_TICKS que já
// existia (documentado, nunca consumido); 10s é novo — dá tempo de REAGIR, não só de reflexo. Mora aqui, e
// não em zone.js, pelo mesmo motivo de ZONE_TOTAL_TICKS: TICK_HZ é da raiz.
export const ZONE_WARN_AT_S=[10,ZONE.WARN_TICKS/TICK_HZ];
// GAS_GAIN: ACAMPAR NO GÁS ERA RENDA LÍQUIDA. O laço se fechava sozinho — `zoneBurn` arranca `pc.shed` e
// cospe pelotas para FORA, e passada a imunidade `pieceEject` devolvia 100% (EAT.EJECT_GAIN=1). Quem ficava
// na beirada queimava e recolhia a própria queimadura, indefinidamente, enquanto o círculo apertava em cima
// de quem estava jogando o jogo. Agora quem colhe EXPOSTO recebe metade, e o desconto acompanha a exposição
// (linear, não degrau: `exp=1` dá exatamente .5 e a borda fica monótona, sem oscilar a 60 Hz — é a mesma
// razão de EXPOSE_MIN existir). Vale para a comida também, e para o SCORE junto: descontar só a massa
// deixaria o campista subindo no placar de graça.
// ⚠️ Isto faz do gás o QUARTO sumidouro de massa do jogo, ao lado de PLAYER.DECAY, STAR.BURN e da comida
// que morre no gás. É o único deles que não some de vez: o valor é descontado no instante da absorção.
// ⚠️ Quem paga é a exposição do COMEDOR, nunca a posição do fragmento: com peça de até MAX_R de raio e
// círculo final de 768 px, um gigante com o centro fora engoliria caco de dentro — é o mesmo erro que fez
// `zoneExposure` substituir o critério do centro.
// zona = círculo. R é o RAIO como fração de WORLD.w: começa em .62 (5 952 px — cobre o mapa, cujo
// centro→canto é 6 788) e fecha em .08 (768 px). As razões entre etapas são ~√.5, ou seja **cada etapa tira
// metade da ÁREA**: a pressão é constante do começo ao fim, e o que muda é o tamanho de quem está dentro.
// ⚠️ O fim era .015 (144 px) e não fechava partida nenhuma. Uma peça no teto (MAX_R 1000) tem 48× a ÁREA do
// círculo inteiro — já na etapa 5, com 480 px, ela não cabia —, e como a queimadura olhava o CENTRO da peça,
// o gigante com o centro dentro do disco de 144 px não queimava NADA enquanto o corpo dele cobria a arena
// toda: fisicamente invencível no exato momento em que o círculo devia decidir a partida.
// 768 px é ~1 arremesso de split (SPLIT.DIST 780) de raio: cabe a briga, não cabe o planeta.
// E o teto de massa do fim virou GEOMÉTRICO, de graça: para todo mundo caber é preciso Σr² ≤ R², ou seja
// 590 mil de massa para a SALA INTEIRA no último círculo. O gás cobra a diferença de quem não cabe.
// EXPOSE_MIN: menos de 2% do disco fora não conta. É BANDA MORTA, não folga — sem ela, encostar a borda na
// linha já acenderia o aviso vermelho e começaria a arrancar pelotas, e a peça piscaria entre "no gás" e
// "na zona" a 60 Hz enquanto corre colada nela.
// Cada etapa i: HOLD_TICKS[i] parada em R[i], depois
// SHRINK_TICKS[i] interpolando até R[i+1]. DRIFT limita o deslocamento do centro a essa fração de
// (r−r_novo), então o círculo NOVO sempre cabe dentro do velho — ninguém é pego por uma zona que pulou
// para trás. BURN é a fração da massa por segundo × ÁREA EXPOSTA (ver zoneExposure em physics/rules.js): a
// pergunta deixou de ser "meu centro está fora?" e passou a ser "que fatia do meu disco está no gás?".
// .10/s é 50× o PLAYER.DECAY, e leva uma peça
// de START_R (massa 900) ao piso MIN_PIECE_R (256) em ~12 s — tempo de correr, não de acampar. Ao contrário
// da queimadura de estrela, esta NÃO tem piso: no piso a peça morre (é o que fecha a partida).
// BURN_K: o gás ENDURECE conforme o círculo fecha — a taxa vai de BURN (no raio da etapa 0) a BURN·BURN_K
// (no menor círculo), interpolada pelo RAIO ATUAL (ver zoneBurnRate em physics/rules.js). O raio é o que os
// dois lados já têm em mãos, então servidor e predição do cliente chegam ao mesmo número sem mandar a etapa
// pelo fio. No fim são .22/s: 5,7 s do START_R até o piso. Ficar no gás no fim da partida não é mais uma
// jogada de tempo, é a morte — e é o que impede o gigante de atravessar o gás em diagonal para cortar caminho.
// WARN_TICKS: aviso antes de cada fechamento começar.
// FOOD_*: A COMIDA SEGUE A ZONA. Sem isso a reposição caía uniformemente no mapa INTEIRO e o círculo final
// virava um deserto — no menor raio cabiam 20 grãos dos 2 500 —, então a última fase premiava só quem já
// era grande: ninguém pequeno tinha do que crescer, e a partida acabava por tamanho acumulado, não por
// jogada. Agora o mundo estoca o CÍRCULO: o alvo de população é `área/FOOD_AREA` (um grão a cada 2 400 px²,
// ~um a cada 49 px de distância média), com piso FOOD_MIN e teto FOOD.COUNT — enquanto o círculo é grande o
// teto manda e o mapa fica EXATAMENTE como é hoje. Como o alvo cai mais devagar que a área, a
// DENSIDADE sobe a cada fechamento — no fim é um tapete, e é dele que sai a virada: o grão dá massa
// ABSOLUTA (EAT.FOOD_GAIN), então vale ~2% para quem tem 900 de massa e 0,01% para quem tem 200 000, que
// ainda por cima perde PLAYER.DECAY por segundo. Quem varre o tapete cresce; quem já é gigante só empata.
// FOOD_SCAN é a varredura: por tick, esse tanto de grãos é conferido contra o círculo e o que ficou no gás
// MORRE (o gás come a comida também). Sem essa poda a população ficaria presa lá fora e o laço de reposição
// — que só ENCHE até o alvo, nunca corta — pararia de repor DENTRO, que é o oposto do que se quer aqui.
// FOOD_FILL_S: o círculo tem uma RENDA de comida (a população inteira a cada 2 s), não uma torneira. Sem
// esse teto a reposição é INSTANTÂNEA — o que é inofensivo num mapa de 92 M px², onde ninguém cobre o
// tabuleiro, e é uma fonte infinita num círculo de 480 px, onde o líder cobre quase tudo: cada grão que ele
// come renasce debaixo dele no mesmo tick. Medido numa partida inteira de 49 bots: o consumo da sala fica em
// 60–270 grãos/s a partida toda e EXPLODE para 7 579/s nos últimos 30 s, com o líder saindo de 355 mil para
// 1,02 MILHÃO de massa em 15 s. Ou seja, o tapete que era para dar chance ao pequeno estava engordando o
// gigante 10× mais rápido. Com a renda o teto é do CÍRCULO e todo mundo divide o mesmo fluxo — e como o
// pequeno só alcança ~43 grãos/s de qualquer jeito, quem o teto limita é justamente quem cobre o círculo.
// SHED_*: a massa queimada NÃO evapora — ela é ARRANCADA em pelotas, a cada SHED_TICKS (2,5×/s), jogadas
// para FORA (para longe do centro da zona), SHED_DIST px ALÉM DA BORDA da peça. Ver quem está no gás perdendo pedaços é o aviso
// mais claro que existe, e a massa continua no mundo: quem tiver coragem de entrar atrás dela, leva. Ir
// buscar custa entrar MAIS FUNDO no gás — a direção para fora é o que faz o preço ser real.
// A cadência (e o piso SHED_MIN, uma pelota inteira) existem por causa do teto EJECT.MAX: soltar a cada
// tick, com meia sala no gás no fim da partida, estouraria a população e despejaria os fragmentos dos outros.
// STAR_*: A ESTRELA TAMBÉM SEGUE A ZONA. Ela nascia sorteada no mapa inteiro, então no círculo fechado não
// havia nenhuma — o perigo que faz o jogador desviar (e a arma de quem sabe empurrar uma) simplesmente saía
// da partida na hora em que ela fica interessante. STAR_PAD é a folga da borda do círculo: uma estrela
// colada no gás é um corredor sem saída, e o halo dela (r·HALO, até 176 px na fase OLD) ficaria por cima do
// veneno. STAR_SEP_K afrouxa o STAR.MIN_SEP (1400 px) proporcionalmente ao raio ATUAL — 1400 de separação
// dentro de um círculo de 1400 é geometricamente impossível, e insistir só levaria ao ponto de fallback.
// STAR_MIN_R é o PISO em que se desiste, e ele é generoso de propósito: cada estrela esteriliza um disco de
// r+FOOD.STAR_CLEAR (246 px, 280 na inchada) onde comida não nasce e a existente é varrida, o que num
// círculo de 480 px é 26% da área — justo o tapete de comida que é a virada do jogador pequeno no fim.
// Em 1200 px o mesmo disco é 4%, que é ruído. STAR_RETRY_TICKS: a fila espera isso e tenta de novo, em vez
// de perder a estrela para sempre. STAR_SCAN: estrelas conferidas por tick contra o círculo (a lista tem 12).
// Peça pequena queima devagar e solta raro; planetão solta o tempo todo — que é exatamente a leitura certa.
export const MODES=[
  // ⚠️ `roundTicks` do Livre é GETTER, não cópia: ele virou parâmetro do painel (`ROUND.TICKS`, em minutos),
  // e um valor copiado aqui ficaria congelado no que valia quando o módulo carregou — o admin trocaria a
  // duração, as salas novas obedeceriam e este descritor seguiria anunciando a antiga, em silêncio.
  // ⚠️ `max` e `bots` também são GETTERS, pelo mesmo motivo do `roundTicks`: os dois viraram parâmetro do
  // painel, e uma cópia feita na carga do módulo faria este descritor anunciar para sempre o número antigo.
  {id:0,key:"free",label:"Livre",get max(){return ROOM.MAX;},get bots(){return ROOM.BOTS;},get roundTicks(){return ROUND.TICKS;},
    lobby:false,respawnBots:true,lastAlive:false,zone:false,weapons:false,chat:"room",teamSizes:[1],anonBots:false,realNicks:true},
  {id:1,key:"br",label:"Battle Royale",max:BR.PLAYERS,bots:BR.PLAYERS,roundTicks:BR.ROUND_TICKS,
    lobby:true,respawnBots:false,lastAlive:true,zone:true,weapons:true,chat:"team",teamSizes:BR.TEAM_SIZES,anonBots:true,realNicks:true},
];
// `realNicks` e `anonBots` são coisas SEPARADAS, e separá-las é o que permite escolher uma sem a outra:
//   realNicks → o nome vem de BOT_NICKS/botNick (apelidos de gente: "trovao_137", "xXzecaXx") em vez dos
//               60 nomes temáticos de BOT_NAMES ("Nebulox", "Cassiona"), que gritavam "isto é um bot"
//               mesmo com o ◆ escondido. Vale nos DOIS modos.
//   anonBots  → o flag BOT não vai no fio, então nem o ◆ do placar nem a cor do radar distinguem.
//               Só no Battle Royale: lá, mostrar "◆ bot" em 40 dos 50 nomes viraria uma tela de treino.
// No Livre o ◆ CONTINUA aparecendo (o jogo nunca escondeu que a sala tem preenchimento) — o que muda é o
// nome deixar de parecer catálogo de planeta. O servidor sempre soube quem é quem (economia, conquistas e
// `botKills` não mudam); quem não sabe, quando `anonBots` está ligado, é a TELA.
/** Descritor do modo (id inválido → Livre: o cliente antigo e o `?local=1` caem sempre no jogo de sempre). */
export const modeOf=id=>MODES[id]||MODES[MODE.FREE];
/** Capacidade da sala arredondada para baixo no tamanho de equipe. */
export const modeCap=(id,teamSize=1)=>{const m=modeOf(id),t=teamSize>0?teamSize|0:1;return m.max-m.max%t;};
// ── PAINÉIS DA TELA DE ENTRADA (teste A/B de engajamento nos portais) ────────────────────────
// Puramente de EXIBIÇÃO: não é um MODO (`MODE`/`MODES` acima) — "Criar sala" nem escolhe um modo
// sozinho, é OUTRA FORMA de entrar num Livre/BR (o jogador ainda escolhe MODE.FREE/MODE.BR lá
// dentro, ver SalaPropria em client/src/ui/Modes.jsx). É só se o CARTÃO aparece na tela "Escolha
// o Modo"; quem tem link direto, convite de equipe ou já está numa sala continua jogando
// normalmente com o painel desligado.
// Entregue por `/api/config`, não pelo `room`: a tela de Modos é escolhida ANTES de qualquer sala
// existir, então o mecanismo `wire` (que chega no JSON da sala) chegaria tarde demais. O
// precedente é ROOM.MAX, alguns tunables abaixo em shared/src/tunables.js — também escopo
// 'server' e também ecoado em `/api/config` (server/src/http/api.js) para a tela poder
// desenhar/decidir algo antes de entrar numa sala.
// ORDER é a posição relativa dos dois cartões QUANDO OS DOIS APARECEM: 'free_br' (padrão — Livre
// à esquerda, Battle Royale à direita) ou 'br_free' (invertido). Com um só visível, não tem efeito.
export const ENTRY_PANELS={FREE:true,BR:true,OWN:true,ORDER:'free_br'};
// ── TELA INICIAL ─────────────────────────────────────────────────────────────
// NICK_AUTO: a tela inicial sorteia um nick e já entrega o campo preenchido, em vez de deixá-lo vazio
// pedindo um nome. É de EXIBIÇÃO como o ENTRY_PANELS acima, e o interruptor existe porque a decisão é
// de produto e se toma OLHANDO a tela: pedir o nome converte pior num portal (é um formulário antes do
// primeiro frame) e converte melhor no site, onde o jogador chegou de propósito.
// ⚠️ Ele NÃO é ecoado por `/api/config`, e essa é a diferença para o ENTRY_PANELS. O consumidor aqui é
// `GET /api/nick`, que o cliente já chama no boot e que responde no instante EXATO em que a decisão é
// tomada; echoar o mesmo booleano no config criaria uma segunda verdade — e uma que CORRE, porque
// `loadConfig()` é disparado sem `await` (client/src/state/actions.js) e o campo já teria sido
// preenchido quando a resposta chegasse.
// ⚠️ Desligado, o comportamento é o de sempre: campo vazio, o placeholder pedindo o nome e a guarda
// `semNome()` segurando quem tentar entrar sem nomear o planeta.
export const ENTRY={NICK_AUTO:true};
/**
 * Minutos escolhidos pelo dono da sala → ticks de rodada. UM lugar, porque a rota, a tela e os testes têm
 * que concordar — e porque "nada de `if (modo === …)` espalhado" é regra escrita de docs/design/modos.md.
 * Devolve `0` para SEM FIM e `null` quando a escolha não vale para o modo.
 * ⚠️ No Battle Royale não há sem-fim e há PISO: a zona leva `zoneTotalTicks()` para fechar, e uma partida
 * que acaba por tempo antes disso é a única forma de o modo terminar sem ter decidido nada. O piso é
 * DERIVADO da zona (não copiado), então mexer em ZONE o move sozinho.
 * @param {number} modeId @param {number} min minutos (0 = sem fim)
 */
export function roundTicksOf(modeId,min){
  const m=Math.round(+min||0);if(m<0)return null;
  if(!ROUND.CHOICES_MIN.includes(m))return null;
  const t=m*60*TICK_HZ;
  if(modeOf(modeId).lastAlive){if(!m)return null;return t<ZONE_TOTAL_TICKS?null:t;}   // BR: sem fim não, e nunca menos que a zona
  return t;}
export const PLAYER={START_R:30,MIN_PIECE_R:16,MAX_R:1250,MAX_PIECES:16,BOT_R:[24,58],DECAY:.002,OVER_N:6,OVER_DIST:420};
// OVER_N/OVER_DIST: o que fazer com a massa acima de MAX_R quando NÃO HÁ VAGA de peça para repartir. Era
// `setR(pc,MAX_R)` e pronto — o único ponto do jogo, fora do DECAY, em que massa de JOGADOR simplesmente
// evaporava, e em silêncio. Agora o excesso vira OVER_N fragmentos arremessados OVER_DIST px além da borda,
// com a imunidade que escala com o raio. Conservação de massa é estrutural aqui: o que sai de um planeta
// tem que continuar existindo em algum lugar, e quem quiser de volta paga em posição.
// DECAY é o `playerDecayRate` do agar.io: cada peça perde essa fração da MASSA por segundo, com piso em START_R.
// Como a taxa é relativa, ela é desprezível para quem é pequeno (1,8/s numa peça de 900, contra os 20–40/s que
// ela ganha comendo poeira) e cara para quem é enorme (2.000/s numa de 1.000.000, meia-vida de 5,8 min). É o que
// impede o gigante de ser imortal: sem isso NADA no jogo tira massa dele com o tempo — pop, estilhaço e supernova
// só REPARTEM (massa conservada, e as peças voltam a fundir), e lasca/míssil/buraco devolvem a massa como
// fragmentos que ele mesmo recolhe. O único predador possível era alguém 1,15× maior.
// MAX_R/MAX_PIECES vêm do agar.io: lá a célula para em 1500 num mundo de 14142 (9,4×) e o jogador tem 16 células.
// Aqui o mundo é 9600, então 1000 mantém a MESMA proporção. Passar do teto NÃO trava o crescimento: a peça se
// divide sozinha (rules.autoSplit), e só com as 16 peças ocupadas é que o raio é cortado.
export const SPEED={K:2110.6,EXP:.449,MIN:48,MAX:460,RAMP:32};
export const BOOST={K:2.634,MAX_STEP:32.5,STOP:8};
export const JOY={SPREAD_K:6};
// ── ANALÓGICO: a distância do alvo tem que CRESCER com o espalhamento das peças ──────────────
// SPEED.RAMP é freio de chegada de UMA peça, e o alvo é UM ponto para o jogador inteiro (World.setTarget),
// mas `integratePiece` mede a distância de CADA peça até ele. Enquanto há uma peça só as duas coisas são a
// mesma: a peça está em cima do centróide, `d = RAMP·k`, e a rampa devolve exatamente o curso do polegar —
// analógico de verdade. Dividido, o alvo a 32 px do centróide cai DENTRO do aglomerado (SPLIT.DIST=780 põe
// cada peça a ~390 px dele) e todas correm a vmax cheia PARA O CENTRO, não na direção do polegar: medido, o
// grupo anda a 8% da velocidade com o eixo do split perpendicular ao rumo e a EXATAMENTE ZERO com ele
// alinhado — as duas metades correndo uma contra a outra, presas pelo separateOwn até a fusão (~57 s).
// SPREAD_K é o que faz o alvo dominar o espalhamento (`d = RAMP·k + spread·SPREAD_K`), como o mouse já faz
// de graça e como BOT.HAND.DIST (620 px) já fazia pelos bots. Com spread=0 a conta colapsa em RAMP·k, então
// quem não dividiu não sente nada. 6 é o equilíbrio: 98,7% da direção com o alvo a 2372 px (K=8 daria 99,2%
// a 6432 px, dois terços do mapa, e aí o clamp de borda passaria a atuar o tempo todo).
// ── MOVIMENTO: dois canais somados por tick, EXATAMENTE como no agar.io. Não existe velocidade de jogador. ──
// 1) DIREÇÃO: deslocamento instantâneo `û·vmax(r)·min(d,RAMP)/RAMP` por tick — sem inércia, sem aceleração,
//    sem arrasto. Vira na hora e nunca perde velocidade na curva: é a "velocidade padrão" do jogo.
//    vmax = K/r^EXP com K = 2.1106×40×25 e EXP = .449, os números literais do agar (`2.1106/size^0.449`).
//    RAMP=32 é o `min(dist,32)/32` de lá: só freia no último palmo, para não tremer parado.
// 2) IMPULSO (`Body.vx/vy`, ver body.addBoost): canal de BOOST que SEMPRE decai a zero. É a única coisa que
//    empurra — split, pop, estilhaço, saída do buraco, quique, gravidade. Como o decaimento é exponencial puro,
//    a peça percorre exatamente |v|/BOOST.K px: por isso todo empurrão é declarado em PIXELS, não em px/s.
//    BOOST.K = −ln(.9)/0.04 = 2,634 é o `boostDistance ×0,9 por tick de 40 ms` do agar, convertido para 60 Hz;
//    MAX_STEP é o teto de 78 px/tick de lá (anti-tunelamento), já em passo de 60 Hz.
// Foi o modelo de velocidade acumulada que fez o jogo ganhar embalo de graça: trombada de asteroide e fusão
// entre peças próprias somavam impulso e a peça saía planando. Aqui o empurrão sempre acaba e a velocidade
// volta sozinha ao padrão — e durante o arremesso o ponteiro continua com controle TOTAL.
export const SPLIT={DIST:780,MIN_R:60,COOLDOWN_TICKS:15,OFFSET:.6};
// arremesso do agar.io: uma DISTÂNCIA absoluta (`setBoost(780)`), igual para qualquer tamanho — o planeta
// pequeno voa dezenas de raios e o planetão menos de um. Quem fica não é empurrado (lá não há recuo), e como
// as duas metades andam na mesma velocidade padrão, o vão final é exatamente DIST.
// MIN_R=60 é o `playerMinSplitSize` do agar (lá 60 para um raio inicial de 32; aqui 60 para START_R=30).
export const EJECT={SPEED:1300,SPEED_MAX:3000,RAMP_N:12,RAMP_RESET_TICKS:30,RECOIL_DIST:410,R_K:.15,R_MIN:9,R_MAX:60,MAX:600,COOLDOWN_TICKS:6,MIN_R:60,MASS_FACTOR:1.3,OWNER_IMMUNE_TICKS:20,LIFE_TICKS:900,DRAG:3.7,HOLD_TICKS:7};
/** Raio da pelota cuspida, PELO TAMANHO de quem cospe (com piso e teto). */
export const ejectR=r=>{const v=r*EJECT.R_K;return v<EJECT.R_MIN?EJECT.R_MIN:v>EJECT.R_MAX?EJECT.R_MAX:v;};
// A pelota era de raio FIXO (9 px, massa 105): um planeta de 360.000 precisava de 3.419 cusparadas para se
// esvaziar, então segurar o W só enchia a tela de pontinhos sem mudar nada. Proporcional (R_K do raio), qualquer
// tamanho se esvazia em ~34 cusparadas — mesmo efeito com MUITO menos corpos.
// MAX é o teto de população, que faltava: ejetado era a ÚNICA população dinâmica sem limite (asteroide tem
// astCap, comida tem FOOD.COUNT). Segurando o W com 16 peças saíam 137 pelotas/s e, com 15 s de vida, o regime
// batia em ~2.057 vivas — quase a comida do mundo inteiro — e era isso que engasgava a imagem.
// HOLD_TICKS: 60/7 = 8,6 cusparadas/s enquanto a tecla está segurada (COOLDOWN_TICKS limita o toque avulso a 10/s).
// SPEED→SPEED_MAX: a pelota sai com FORÇA CRESCENTE enquanto o W está segurado (`ps.ejectRamp`, satura em RAMP_N).
// Como o ejetado integra com arrasto exponencial puro (integrateFree, sem o teto MAX_STEP do canal de impulso),
// o alcance é exatamente v/DRAG: 1300/3,7 = 351 px na 1ª e 3000/3,7 = 811 px da 12ª em diante. Com o SPEED fixo
// de antes TODA pelota parava a 292 px e segurar o W só empilhava um monte no mesmo lugar; agora sai um RASTRO
// que se estica. RAMP_RESET_TICKS: meio segundo sem cuspir e a força volta ao início (toque avulso sai sempre perto).
export const FRAG={R_MIN:5,R_MAX:24,RICH_MASS:600,LIFE_TICKS:900,RICH_LIFE_TICKS:1800,MAGNET_HEAVY:.45};
/** Massa da pelota MÍNIMA — a unidade de valor de todo fragmento (a cuspida de verdade escala com ejectR). */
export const EJECT_MASS=EJECT.R_MIN*EJECT.R_MIN*EJECT.MASS_FACTOR;
/** Raio VISUAL de um fragmento pela massa: o TAMANHO na tela é o que diz o valor (satura em R_MAX). */
export const fragR=m=>{const r=Math.sqrt(m);return r<FRAG.R_MIN?FRAG.R_MIN:r>FRAG.R_MAX?FRAG.R_MAX:r;};
/** Fragmento gordo dura o dobro: o pedaço de um planetão sumiria antes de dar tempo de dar meia-volta. */
export const fragLife=m=>m>=FRAG.RICH_MASS?FRAG.RICH_LIFE_TICKS:FRAG.LIFE_TICKS;
/** Quit voluntário: cada peça viva estoura como supernova (rules.explodeQuit), massa inteira em N pelotas
 * sem dono. NOVA_R é o mesmo papel de STAR.NOVA_R (raio de estouro = r·NOVA_R), mas 8× não escala para uma
 * peça no PLAYER.MAX_R (1250) — daria um estouro maior que a distância de segurança de spawn — daí o teto. */
export const QUIT={N:12,SPEED:600,NOVA_R:3,NOVA_R_MAX:900};
// fragmento = massa ejetada com VALOR VARIÁVEL: r² ≠ mass (só o ejetado tem essa liberdade, ver body.js). O que sai
// de um planeta grande (lasca, míssil, horizonte do buraco) carrega a massa real que ele perdeu, então vale mais
// para QUEM PEGAR do que um fragmento qualquer; acima de RICH_MASS ele fica "gordo" (vida dobrada e o ímã o
// arrasta a MAGNET_HEAVY — pedaço pesado vem devagar, igual cometa/estrela na comida).
export const MERGE={BASE_TICKS:1800,PER_R:12,DIST:.75,SEPARATE:.92,SEP_CORR:.2};
// a separação entre peças próprias é SÓ posicional (o `resolveCollision` do agar) e NÃO existe atração entre elas:
// era a atração (900 px/s²) que dava o empurrão ao reintegrar. Sem ela as partes se juntam sozinhas, porque
// todas correm para o mesmo ponteiro e a menor é mais rápida — exatamente como no agar.
/** Espera para voltar a fundir: max(30 s, 0,2·r s) — a fórmula do agar.io (`max(30, ⌊0.2·size⌋)` segundos). */
export const mergeTicks=r=>{const t=Math.floor(r*MERGE.PER_R);return t>MERGE.BASE_TICKS?t:MERGE.BASE_TICKS;};
export const EAT={RATIO:1.15,GAIN:1,CENTER:.4,FOOD_GAIN:.16,EJECT_GAIN:1,SCORE_FOOD:1,SCORE_PLAYER:8,SCORE_EJECT:2};
// GAIN é 1 (agar.io: `size=√(s1²+s2²)`, massa somada sem perda): comer um jogador dá EXATAMENTE a massa dele.
// EJECT_GAIN é 1 de propósito: massa ejetada/lascada/arrancada não evapora — quem recolher o fragmento recebe
// EXATAMENTE o que saiu do planeta (ver FRAG e os fragmentos de valor variável em physics/rules.js).
export const BOUNCE={E:.55,E_SHIELD:.9,POS_CORR:.3,FX_MIN_VN:96,PUSH_S:.3,DIST_MAX:120};
// quique: a correção posicional é a de sempre, mas o empurrão vira BOOST de `vn·PUSH_S` px (teto DIST_MAX).
// Curto de propósito: a trombada do asteroide tem que dar o solavanco e devolver a velocidade padrão na hora.
export const WALL={E:.4,E_AST:.9,E_EJECT:.5};
export const FOOD={COUNT:3900,R_MIN:6,R_MAX:15,SPECIAL_R:13,AMMO_P:.055,POWER_P:.07,HUES:12,MARGIN:40,NEAR_HAZARD_P:.22,NEAR_HAZARD_R:[260,620],STAR_CLEAR:200,
  TYPES:["dust","comet","star","rock","missile_ammo","powerup_merge","powerup_magnet","powerup_shield","w_burst","w_cluster","w_nova",
    "powerup_autodef","powerup_ammo_plus","powerup_zoom","powerup_feast"]};   // índice = FOOD_TYPE
export const FOOD_TYPE={DUST:0,COMET:1,STAR:2,ROCK:3,AMMO:4,MERGE:5,MAGNET:6,SHIELD:7,W_BURST:8,W_CLUSTER:9,W_NOVA:10,
  AUTODEF:11,AMMO_PLUS:12,ZOOM:13,FEAST:14};   // 5 era o powerup de velocidade (removido); hoje é o de FUSÃO
// As armas entram no MEIO (8..10) porque o enum é DENSO e três testes de faixa dependem da ordem:
// `type<=ROCK` ("é comida base, posso reescrever", world.js) e `type>=AMMO` ("é especial", world.js e o
// atlas do cliente). Índice novo no meio quebraria os três de uma vez, em silêncio.
// ⚠️ Os powerups 11..14 entraram DEPOIS das armas e por isso `type>=W_BURST` deixou de significar "é arma":
// era a quarta faixa implícita, usada em rules.eatFood, em bot.foodValue e em dois testes de modes.test.js,
// e sem `isWeaponFood` os quatro cairiam no ramo de arma — `weaponOfFood` devolveria −1, a comida sumiria
// e o powerup viraria um no-op SILENCIOSO. Faixa implícita que ganha nome deixa de ser armadilha.
export const isWeaponFood=t=>t>=FOOD_TYPE.W_BURST&&t<=FOOD_TYPE.W_NOVA;
// POWER_P subiu de .045 para .07 porque a banda dos powerups passou de 2 para 6 tipos: mantida em .045, o
// ímã e o escudo — que são os que o jogo ENSINA — cairiam de 2,25 % para menos de 1 % cada. A banda continua
// pequena perto da comida base (~87 %), e é dentro dela que POWERUP.DROP decide a raridade de cada um.
// risco × recompensa: NEAR_HAZARD_P da comida nasce num anel NEAR_HAZARD_R em volta de uma estrela ou buraco negro, e sempre
// como coisa boa (cometa/rocha ou powerup) — chegar perto do perigo tem que valer a pena
// STAR_CLEAR: e NUNCA em cima da estrela. É um ANEL, não um alvo: o grão que nasce dentro do disco (r 46, que
// incha até 80 no fim da vida, com halo 2,2×) é uma isca que cobra STAR.BURN (30% da massa) para ser pega —
// perigo sem escolha não é risco × recompensa, é armadilha. A folga é medida da BORDA da estrela (r + CLEAR),
// então ela acompanha o inchaço, e vale para TODO ponto sorteado — mapa, anel de perigo e círculo da zona.
// 200 px é escolhido para caber DEBAIXO de NEAR_HAZARD_R[0] (46+200 = 246 < 260): o anel de risco × recompensa
// continua inteiro, e ainda assim o grão fica bem fora do halo (2,2·46 = 101, 2,2·80 = 177 na estrela inchada).
// POP_DIST vale como MIRA: a rocha só entra (e estoura) se a trajetória dela passar a menos de r·POP_DIST do centro
// do planeta; de raspão ela ricocheteia com E (bola de sinuca), em vez de atravessar como acontecia antes.
/** Quantos níveis de escudo uma batida de rocha custa, pela velocidade de aproximação (0 = nem sente). */
export const shieldTierFor=vn=>{const T=ASTEROID.SHIELD_VN;return vn>=T[2]?3:vn>=T[1]?2:vn>=T[0]?1:0;};
export const ASTEROID={BELTS:6,PER_BELT:5,WANDERERS:28,R_MIN:30,R_MAX:62,MASS_R_MAX:80,BELT_RADIUS:[400,700],BELT_SPEED:[15,25],BELT_SPRING:.24,BELT_DAMP:.96,
  WANDER_SPEED:[20,60],POP_RATIO:1.1,POP_DIST:.82,CHIP:.04,CHIP_STUCK:.22,CHIP_STUCK_DIST:520,CHIP_CD_TICKS:30,FEED:1.6,SHOOT_AT:72,SHOOT_R:36,CHILD_R:28,CHILD_SPEED:540,
  E:.85,E_AST:.9,SAFE_SPAWN:500,RESPAWN_TICKS:300,MAX_EXTRA:9,SHIELD_VN:[220,520,900],
  SMASH_MIN_R:34,SMASH_R:.45,SMASH_N:[3,5],SMASH_SPEED:520,BELT_SAFE:520};
// CHIP_STUCK/CHIP_STUCK_DIST: a rocha que ESTOURARIA a peça (r > POP_RATIO·ra, mirando o miolo) e não tem
// vaga de peça para estourar. Isso caía na lasca comum — e a lasca comum é REEMBOLSO: 4% que voltam como
// fragmento do PRÓPRIO dono, nascido ATRÁS dele (a mesma direção para onde o quique o empurra) e a 97 px,
// dentro do próprio planeta, com imunidade fixa de 20 ticks. Atravessar cinturão dividido em 16 pedaços era
// literalmente de graça, e foi exatamente isso que os jogadores acharam. Sem vaga o preço vira massa: 22%
// arrancados e ARREMESSADOS CHIP_STUCK_DIST px para o OUTRO lado, com a imunidade que escala com o raio.
// Nada evapora — só deixa de ser bumerangue: voltar para buscar custa tempo, posição e o risco de outro
// chegar primeiro. Com vaga, nada muda: a rocha continua estourando a peça como sempre.
// SHIELD_VN: a batida na rocha custa escudo PELA VELOCIDADE do impacto (velocidade de aproximação, que já soma
// o quanto o planeta está correndo contra ela): 1 nível a partir de [0], 2 a partir de [1], 3 a partir de [2].
// Enquanto o escudo aguenta, a rocha NÃO arranca massa e NÃO estoura o planeta — ela só empurra e ricocheteia.
// No topo da tabela ela é rápida demais: leva o escudo inteiro E estoura a peça como se não houvesse escudo.
// trombada com estrela: só rocha r ≥ SMASH_MIN_R racha a estrela (a pequena ricocheteia) e vira SMASH_N cacos de
// r·SMASH_R a SMASH_SPEED. SMASH_R é baixo de propósito — o caco maior possível (R_MAX·.45 ≈ 28) fica ABAIXO de
// SMASH_MIN_R, então caco nenhum encadeia uma segunda trombada nas filhas da estrela que acabou de rachar.
// SMASH_SPEED na casa do CHILD_SPEED: asteroide integra com arrasto ZERO e quica na parede a WALL.E_AST, então
// caco arremessado a 1500 atravessaria o mapa para sempre. BELT_SAFE: estrela nasce longe do ANEL de todo
// cinturão (senão o cinturão vira moedor de estrela e a população nunca para de repor).
export const BLACKHOLE={COUNT:0,CORE_R:38,INFLUENCE:10,G:5.5e7,A_MAX:2200,SWIRL:.6,CRUSH_K:2.4,SPAGHETTI_N:7,SPAGHETTI_R:1.12,SPAGHETTI_V:90,CD_TICKS:60,
  GROW_TICKS:120,LIFE_TICKS:[2700,5400],FADE_TICKS:180,DRIFT:10,DRIFT_CHANGE_TICKS:240,MIN_SEP:1100,SAFE_SPAWN:900,FOOD_PULL:2.5,EJECT_PULL:1.6,AST_PULL:.5,MISSILE_PULL:.8};
// COUNT:0 — o buraco negro está DESLIGADO por enquanto (a mecânica não ficou boa); o código continua inteiro e
// volta trocando este número. Todos os ~25 consumidores são laços sobre `w.holes`, que viram no-op com a lista
// vazia. O perigo que ele fazia foi para as estrelas (STAR.COUNT).
// INFLUENCE: raio de influência = CORE_R·INFLUENCE·k (~380 px) — entrou nele, começa a ser puxado (a ∝ 1/d², teto A_MAX);
// G/A_MAX são fracos de propósito: com o puxão antigo (1.2e8, teto 5000) quem entrava na influência já não saía mais —
// hoje dá para rasar o horizonte, ganhar impulso e escapar, e é o SWIRL alto que transforma a queda em órbita;
// SWIRL: parte tangencial da aceleração (sentido fixo pelo seed do buraco) — é o que faz espiralar em vez de cair reto;
// CRUSH_K: NÃO existe mais teleporte. Quem chega ao núcleo é esmagado — mas só se `r < CORE_R·k·CRUSH_K` (~91 px),
// ou seja, só quem é MENOR que a bola do buraco na tela; o gigante atravessa e nada acontece (a gravidade continua
// puxando todo mundo). 2.4 é o MESMO número de `textures.scale.blackHole` nos 3 temas e do `rK` do anel tracejado
// do horizonte: é o que faz "seu planeta cabe dentro do tracejado? você morre" ser literalmente verdade na tela —
// mudar um sem o outro quebra a promessa visual;
// SPAGHETTI_*: a massa do esmagado não evapora, volta INTEIRA como SPAGHETTI_N partículas comíveis em volta do
// buraco. Elas nascem em SPAGHETTI_R do raio de INFLUÊNCIA, ou seja logo FORA do alcance da sucção — dentro dele
// o buraco as engoliria de volta em segundos e ninguém aproveitaria
export const STAR={COUNT:19,R:46,BURN:.30,RAM_REWARD:false,SWELL:1.75,ARM_K:.5,GROW_TICKS:120,LIFE_TICKS:[2400,4200],OLD_TICKS:480,RESPAWN_TICKS:600,HALO:2.2,
  SHATTER_MIN_R:24,SHATTER_N:[3,6],SHATTER_DIST:342,SHATTER_CD_TICKS:45,BURN_STUCK:.55,PUSH_TOUCH_DIST:160,PASS_R:40,LAYOUT:'0',
  NOVA_R:8,NOVA_SHATTER:.45,NOVA_PARTICLES:24,NOVA_FOOD:16,NOVA_FOOD_R:.3,NOVA_SPEED:[380,820],NOVA_PART_MASS:3,NOVA_LIFE_TICKS:900,AST_KICK:1500,PUSH_DIST:342,SAFE_SPAWN:700,MIN_SEP:1400,
  NOVA_SPOT_TICKS:900,NOVA_SPOT_R:420,NOVA_SPOT_KEEP:8,
  DRAG:1.4,HIT_PUSH:280,EJECT_PUSH:70,HITS_TO_SPLIT:3,HIT_CD_TICKS:30,SPLIT_N:3,SPLIT_R:.62,SPLIT_SPEED:520,SPLIT_BLAST:5,SPLIT_LIFE_TICKS:[900,1500]};
// LAYOUT: qual das CINCO artes de estrela está em uso (0 clássica · 1 anã manchada · 2 azul com jatos ·
// 3 binária · 4 pulsar). É `opt` porque é ESCOLHA entre coisas fechadas, não um número numa faixa, e é
// escopo `wire` porque quem desenha é o cliente e o servidor entrega o valor no JSON da sala.
// ⚠️ Os ids são STRING porque `applyTunable` valida `opt` comparando `String(v)` com a lista — um id
// numérico passaria a viajar como "0" e voltaria como 0, e a comparação falharia em silêncio.
// PASS_R: A PEÇA PEQUENA ATRAVESSA A ESTRELA E SE ESCONDE LÁ DENTRO. Abaixo deste raio ela não é empurrada,
// não queima, não estilhaça e — o que faz o esconderijo existir — NÃO detona a estrela. Sem essa última
// parte a mecânica se autodestruiria no primeiro uso: `pieceStar` chamava `supernova(...,rammed)` de forma
// incondicional, então o pedaço mínimo já não estilhaçava (SHATTER_MIN_R) mas matava o abrigo mesmo assim.
// Contra o gigante isso é assimétrico de propósito: ele não cabe, e se tentar entrar paga BURN e estoura a
// estrela — o pequeno perde o esconderijo, mas o grande pagou por isso.
// ⚠️ É RAIO ABSOLUTO, e os dois lados do número são escolhidos:
//   40 > PLAYER.START_R (30)  → quem acabou de nascer cabe; o abrigo serve para quem mais precisa dele.
//   40 < SPLIT.MIN_R/√2 (42,43) → é o MENOR raio que um jogador consegue produzir de propósito, e acima
//   dele "esconder-se" viraria um botão do médio (picar-se em 16 pedacinhos), que é exatamente o exploit
//   que shatterBlock/STUCK existe para fechar.
// Fração do raio da estrela seria elegante (é o que BLACKHOLE.CRUSH_K faz), mas ela INCHA até R·SWELL=80,5
// na fase OLD — o buraco cresceria junto e abriria a brecha sozinho justo no fim da vida dela.
// BURN_STUCK: com as PLAYER.MAX_PIECES ocupadas o estilhaço não acontece — e é POR ISSO que o jogador chega
// às 16 de propósito antes de atravessar uma estrela. O preço da estrela sempre foram DUAS coisas: BURN de
// massa E ser espalhado em 4..7 pedaços que não fundem por 30 s; em 16 peças ele só pagava a primeira, e a
// segunda sumia em silêncio. Sem vaga a estrela cobra a conta na moeda dela: .55 ≈ 1−(1−BURN)², a MESMA
// queimadura levada duas vezes. Continua sendo massa DESTRUÍDA (é a identidade da estrela) e continua com
// piso em MIN_PIECE_R — ninguém morre de estrela, nem em 16 peças.
// estrela: nasce em GROW (k rampa em GROW_TICKS), vive LIFE_TICKS em ACTIVE, incha até R·SWELL em OLD_TICKS e explode.
// Míssil (sempre) e partícula ejetada (fora do cooldown HIT_CD_TICKS) empurram a estrela — ela anda com arrasto DRAG — e contam um hit:
// em HITS_TO_SPLIT hits ela racha em SPLIT_N estrelas menores (r·SPLIT_R) a SPLIT_SPEED, com um sopro em r·SPLIT_BLAST (só empurrão).
// Um hit na fase OLD (a estrela já inchando) NÃO conta: ela explode na hora — dá para adiantar a supernova com um míssil.
// Encostar (com k ≥ ARM_K) QUEIMA BURN da massa da peça e estilhaça o que sobrou em SHATTER_N pedaços arremessados
// SHATTER_DIST px (cooldown SHATTER_CD_TICKS por peça; abaixo de SHATTER_MIN_R só empurra a PUSH_TOUCH). O escudo
// NÃO salva da estrela — ele só defende de míssil e asteroide.
// BURN é a primeira coisa do jogo que DESTRÓI massa: ela não vira fragmento nem pellet, some do mundo (piso em
// MIN_PIECE_R, então ninguém morre de estrela). Sem ela, atropelar estrela era LUCRO para o gigante — o estilhaço
// conserva massa (r/√(n+1)) e ele fundia de volta, e ainda colhia o berçário da supernova no mesmo lugar.
// RAM_REWARD:false = a supernova causada por uma TROMBADA de planeta não larga NOVA_PARTICLES nem NOVA_FOOD:
// quem pagou o pedágio não leva o prêmio junto. O empurrão, o AST_KICK e o estilhaço do miolo continuam (é perigo,
// não prêmio). Supernova de fim de vida ou de meteoro (SMASH) larga tudo, como sempre.
// Supernova: raio r·NOVA_R — NOVA_PARTICLES fragmentos brilhantes (que expiram) valendo NOVA_PART_MASS pelotas
// comuns cada (o prêmio de estar por perto quando a estrela morre) e NOVA_FOOD comidas PERMANENTES num cacho de
// raio blast·NOVA_FOOD_R (a estrela morta vira um berçário: ponto de interesse fixo no mapa),
// asteroides a AST_KICK e peças a PUSH; dentro de r·NOVA_R·NOVA_SHATTER
// (o miolo) é como encostar na estrela: o escudo cai inteiro e salva, sem escudo a peça estilhaça.
// NOVA_SPOT_*: o berçário virou DESTINO DE NASCIMENTO no Livre (World.novas + _spawnPiece). Quem entra na
// sala — ou renasce — cai perto de uma estrela que acabou de explodir, ou seja num lugar com comida farta,
// em vez de num ponto uniforme do mapa. O que muda é a AMOSTRAGEM e não o filtro: o mesmo _farSpot é
// chamado com o disco da cratera como `zc` (o argumento que a zona do BR já usava), então STAR.SAFE_SPAWN,
// ASTEROID.SAFE_SPAWN e PLAYER_SAFE continuam valendo linha por linha. É o PLAYER_SAFE (1500) que resolve
// sozinho o medo óbvio de "nascer onde todo mundo quer estar": cratera ocupada reprova nas 40 tentativas e
// o laço passa para a próxima — e é por isso também que dois humanos não caem na mesma.
// NOVA_SPOT_R 420: todo o espólio cabe em ~300 px (o cacho de comida tem blast·NOVA_FOOD_R = 110..193 px e
// os fragmentos alcançam v/DRAG = 103..222 px), então 420 dá folga ao sorteio e ainda deixa o prêmio dentro
// da AOI — ele nasce VENDO o que ganhou. `blast` (368..644) é o raio do SUSTO, não o do prêmio.
// NOVA_SPOT_TICKS 900 = NOVA_LIFE_TICKS, porque o prêmio que EXPIRA são os fragmentos; passado isso sobra só
// o berçário, que a essa altura provavelmente já foi colhido. Supernova de trombada não entra na lista:
// com RAM_REWARD false ela não larga nem cacho nem fragmento, e mandar o novato para uma cratera vazia —
// onde ainda por cima alguém acabou de passar — é o oposto do que isto existe para fazer.
/** As cinco artes de estrela, na ordem do `paintNovaV`. O `label` é o que o admin lê no `<select>`. */
export const STAR_LAYOUTS=[{v:'0',label:'Clássica (coroa de plasma)'},{v:'1',label:'Anã manchada'},
  {v:'2',label:'Azul com jatos'},{v:'3',label:'Binária'},{v:'4',label:'Pulsar'}];
export const MISSILE={SPEED:720,TURN:.07,LIFE_TICKS:625,MAX_AMMO:3,AMMO_OVER:1,R:11,SPAWN_CD_TICKS:600,HIT_SHRINK:.9,STUCK_SHRINK:.82,HIT_DEBRIS:5,DEBRIS_DIST:560,DEBRIS_SPREAD:.9,SHATTER_N:[3,6],SHATTER_DIST:342,
  INTERCEPT_DIST:1100,ALERT_DIST:3250,AST_KICK:420,AIM_PICK:700,AIM_RANGE:2750,AIM_HOLD_TICKS:180};
// DEBRIS_DIST/DEBRIS_SPREAD/STUCK_SHRINK: o impacto sem escudo era REEMBOLSO, não dano. Os HIT_DEBRIS cacos
// nasciam no CENTRO da peça, em TODAS as direções (o spread era 2π, e spillFrag com spread>=6.28 sorteia o
// ângulo) e a 540 px/s — como o ejetado integra com arrasto puro, o alcance é v/DRAG = 146 px, ou seja DENTRO
// de qualquer peça com r > 146 —, e com a imunidade fixa de 20 ticks o dono engolia de volta, 0,33 s depois,
// os 19% que o tiro tinha arrancado. O teste de conservação de massa passava; ninguém testou se o caco ESCAPA.
// Agora a massa RESVALA: sai do lado OPOSTO ao míssil (a mesma direção do estilhaço), nasce na BORDA e viaja
// DEBRIS_DIST px além dela, num leque de ±DEBRIS_SPREAD, com a imunidade que já escala com o tamanho
// (ownerImmune, a mesma da cusparada: 12 s num r=1000). Nada evapora — só deixa de ser bumerangue: quem
// quiser a massa de volta larga a posição, e quem estiver por perto leva.
// Distância em PIXELS como todo empurrão daqui (velocidade = DIST·DRAG), e somando o próprio raio para o
// caco limpar o planeta antes de começar a frear.
// STUCK_SHRINK entra no lugar de HIT_SHRINK quando o alvo NÃO TEM VAGA para estilhaçar (as 16 ocupadas):
// PARTIR o alvo é metade do dano do míssil, e quem não pode ser partido paga a outra metade em massa —
// .82 ≈ HIT_SHRINK², o mesmo tiro cobrado duas vezes (19% → 33% da peça). Alvo pequeno demais para partir
// (SHATTER_TOO_SMALL) NÃO paga: ali o piso MIN_PIECE_R já é o castigo.
// SPAWN_CD_TICKS: carência de 10 s a cada nascimento antes do primeiro tiro (vale para bot também). Sem ela o
// recém-nascido sai do spawn metralhando — não tem massa a perder e o míssil é a arma anti-gigante. É por TEMPO,
// não por tamanho: quem quiser atirar pequeno pode, só precisa sobreviver os 10 s primeiro. Vai no `self` do
// snapshot (fireCd, u16 ticks) para o HUD desenhar a contagem regressiva em cima do ícone da arma.   // INTERCEPT_DIST: míssil inimigo mirando em mim a menos disso vira o alvo do meu tiro; AST_KICK: Δv (px/s) dado a um asteroide r=R_MIN (escala R_MIN/r)
// ALERT_DIST: a que distância um míssil teleguiado mirando em mim já acende o alerta (~3,6 s de voo a SPEED).
// O aviso NÃO pode ser só do cliente: a AOI de um jogador pequeno tem meia-largura ~1250 px e o míssil nasce a
// até AIM_RANGE (ou a qualquer distância, sem mira), então ele apareceria na tela com menos de 2 s de sobra.
// Por isso a ameaça é medida no servidor e vai no `self` (threat/threatDir).
// AIM_HOLD_TICKS: a TRAVA SOBREVIVE 3 s ao soltar o botão. Mirar custa movimento (o alvo é escolhido pelo
// cursor), então acertar a mira e ter que refazê-la inteira para mandar o segundo míssil no MESMO planeta
// era pagar duas vezes pelo mesmo trabalho — e o jogo tem munição para isso. Enquanto a trava vive, um tiro
// comum sai no alvo travado, desde que ele continue vivo e dentro de AIM_RANGE. O alvo NÃO viaja no fio
// (o INPUT são 10 bytes fixos e o servidor refaz `aimTarget` no tick do tiro), então a trava mora no
// PlayerState e o cliente redesenha o anel pela mesma conta — os dois chegam ao mesmo alvo sozinhos.
// tiro mirado (segurar o botão): trava na bolinha mais próxima do PONTEIRO (aimScore), entre as que estão a até
// AIM_RANGE px de quem atira e a menos de AIM_PICK px do cursor; sem nada perto do cursor o míssil sai reto.
// Era um CONE de ±0,45 rad escolhendo o mais próximo da PEÇA: o ângulo só abria o portão e mexer o mouse dentro
// dele não trocava o alvo. Agora o alvo segue o cursor e troca sozinho quando ele passa por cima de outra bolinha.
export const WEAPON={MISSILE:0,BURST:1,CLUSTER:2,NOVA:3};
export const WEAPONS=[
  {id:0,key:"missile",label:"Míssil",  rarity:"comum",  weight:0, food:FOOD_TYPE.AMMO,     ammo:MISSILE.MAX_AMMO,cd:0,  shatter:true},
  {id:1,key:"burst",  label:"Rajada",  rarity:"comum",  weight:44,food:FOOD_TYPE.W_BURST,  ammo:4,cd:20, shatter:false,shrink:.975,n:6,spread:.17,speed:1180,life:96},
  {id:2,key:"cluster",label:"Cacho",   rarity:"raro",   weight:30,food:FOOD_TYPE.W_CLUSTER,ammo:2,cd:60, shatter:true,n:4,splitD:560,spread:.55},
  {id:3,key:"nova",   label:"Nova",    rarity:"épico",  weight:0, food:FOOD_TYPE.W_NOVA,   ammo:1,cd:150,blast:900,push:520,core:.34},
];
// ⚠️ A NOVA ESTÁ FORA DO SORTEIO (weight 0, como o míssil): ela não cai mais no Battle Royale, que é o único
// modo com armas — ou seja, está fora do jogo. Uma onda de 900 px de raio centrada em MIM, que empurra todo
// mundo e estilhaça no miolo sem me atingir, não é uma arma de battle royale: ela não MIRA, não tem contra-
// jogo (não dá para desviar do que sai de dentro do outro) e resolvia sozinha a briga de fim de partida, que
// é justamente onde o círculo apertado devia decidir no encontro. O código fica inteiro e dormente — o mesmo
// tratamento do FOOD_TYPE.MERGE e do BLACKHOLE.COUNT — e volta ao jogo trocando este número.
// O jogador CARREGA VÁRIAS e troca com uma tecla (INPUT_FLAG.SWAP): `ps.ammo[arma]` guarda a munição de cada
// uma e `ps.weapon` diz qual está na mão. O míssil é a arma base e nunca sai do cinto; as outras entram ao
// pegar a comida correspondente (que já equipa a nova, senão o jogador pega e não vê nada acontecer). O míssil (weight 0) fica fora do sorteio de arma —
// ele já cai como FOOD_TYPE.AMMO, que é a munição básica do jogo e existe nos dois modos.
// Todas reaproveitam mecânica que já existe, em vez de inventar sistema novo:
//   RAJADA  n projéteis retos e rápidos, sem homing e sem estilhaço (só HIT_SHRINK·shrink): é a arma de perto.
//   MINA    solta um poço de gravidade parado — é o BLACKHOLE inteiro, hoje dormente (COUNT:0), com `life`
//           curta, influência menor e o esmagamento DESLIGADO: ela puxa e estilhaça, não engole.
//   CACHO   míssil que, a splitD do alvo, vira n homing menores em leque — o anti-gigante caro.
//   NOVA    onda em `blast` centrada em MIM: empurra todos e estilhaça no miolo (shatter), sem me atingir.
//           É o laço de `supernova` (rules.js) com outro emissor.
// `weight` é o peso do sorteio dentro de BR.WEAPON_P (só o Battle Royale larga arma); `cd` é o
// intervalo entre tiros em ticks, além da carência de nascimento (MISSILE.SPAWN_CD_TICKS), que vale para todas.
/** Descritor da arma (id inválido → míssil: cliente antigo e modo Livre nunca veem outra coisa). */
export const weaponOf=id=>WEAPONS[id]||WEAPONS[WEAPON.MISSILE];
/** Arma que um powerup de comida entrega (-1 se a comida não é arma). */
export const weaponOfFood=t=>{for(let i=1;i<WEAPONS.length;i++)if(WEAPONS[i].food===t)return i;return -1;};
/** Peso do alvo do tiro mirado: distância do PONTEIRO à BORDA da bolinha (bola grande é mais fácil de agarrar). */
export const aimScore=(dx,dy,r)=>Math.sqrt(dx*dx+dy*dy)-r;
export const POWERUP={TICKS:420,MAGNET_MAX_R:316.2278,MAGNET_RANGE:5.5,MAGNET_RANGE_MAX:900,MAGNET_PULL:170,MAGNET_NEAR:2.2,MAGNET_EJECT_A:900,MAGNET_AST:420,MAGNET_HEAVY:.45,MAGNET_STAR:.12,
  SHIELD_MAX_LEVEL:3,SHIELD_EVOLVE_TICKS:900,
  AUTODEF_CD_TICKS:90,AUTODEF_SCAN_TICKS:6,AUTODEF_MAX:3,
  ZOOM_TICKS:900,ZOOM_K:1.5,
  FEAST_TICKS:600,FEAST_K:2,
  DROP:[[FOOD_TYPE.MAGNET,32],[FOOD_TYPE.SHIELD,32],[FOOD_TYPE.AUTODEF,22],[FOOD_TYPE.AMMO_PLUS,7],[FOOD_TYPE.FEAST,7]]};
// ⚠️ O ZOOM SAIU DO SORTEIO — não do código. Afastar a câmera é a única coisa que um powerup fazia com o
// que o jogador VÊ, e isso não é vantagem: é mudar o jogo embaixo dele no meio de uma briga, sem aviso e
// sem pedido. O código continua inteiro (`FOOD_TYPE.ZOOM`, o ramo de `eatFood`, `zoomFor`, o `zoomT` do
// `self` e o fator na AOI do snapshot), dormente do mesmo jeito que `BLACKHOLE.COUNT=0` e a Nova de peso
// zero — volta acrescentando a linha aqui, e nada mais.
// A AUTO-DEFESA deixou de ser TEMPO e virou CARGA (ver `autoDefN` em physics/world.js): 15 segundos de
// escudo automático era um relógio invisível que o jogador não tinha como planejar — ou ele descobria que
// tinha acabado no instante em que o míssil chegou, ou nem percebia que existiu. Uma carga é a mesma coisa
// dita de um jeito que se pode guardar: o ícone fica lá, eterno, até o dia em que salva a sua vida.
// AUTODEF_MAX: e agora ela ACUMULA até 3. Travar em 1 fazia o segundo powerup pego não valer nada — o
// jogador via o grão, ia buscar, encostava e o número continuava "1×". Powerup que não muda nada ao ser
// pego é pior que powerup que não existe. O `self` já é u16, então o teto poderia ser qualquer um; 3 é o
// mesmo do escudo, e três interceptações guardadas já é uma partida inteira coberta.
// ── OS QUATRO POWERUPS DE JOGADOR (11..14) ───────────────────────────────────
// Ímã e escudo são POR PEÇA porque são efeitos de corpo: quem pegou é quem sente. Estes quatro são por
// JOGADOR, e não por teimosia — câmera, cinto e economia não têm como ser de meia bolinha. Ficam em
// `PlayerState` ao lado de `fireCdUntil`, zerados no nascimento pelo mesmo caminho, e o `PIECE_FLAG`
// (que só tinha UM bit livre) fica intacto.
//   AUTODEF   com um teleguiado entrante ainda descoberto, PUXA O GATILHO por você — literalmente o mesmo
//             `applyFire`, então cadência, munição, alvo e crédito saem da mecânica que já existe. Gasta
//             munição (é o tiro do jogador, adiantado, não um tiro extra) e tem cadência PRÓPRIA:
//             o míssil tem `cd` 0 em WEAPONS, então sem AUTODEF_CD_TICKS ele esvaziaria o cinto num tick.
//             AUTODEF_SCAN_TICKS escalona a varredura por slot: `incomingMissile` com `livres` é O(M²), e
//             50 jogadores × 60 Hz seria o maior custo fixo do tick por causa de um powerup que quase
//             ninguém tem no momento. 6 ticks = 100 ms de latência, que ninguém percebe num míssil a 720 px/s.
//   AMMO_PLUS RARO. EMPRESTA uma bala ACIMA do teto da arma — e só uma (MISSILE.AMMO_OVER). ⚠️ Era
//             `addAmmo(ps,1)` cru: o único lugar que passa por cima do teto passava por cima dele SEMPRE, e
//             a munição subia sem fim (9 mísseis com MAX_AMMO 3, visto em produção). Ninguém pediu isso; é
//             o teto que não existia. Gastou a bala emprestada, o teto normal volta a valer e é preciso
//             achar outro powerup para ter a quarta de novo — que é a feature inteira.
//   ZOOM      AFASTA a câmera em ZOOM_K. ⚠️ Não é efeito de cliente: `zoomFor` alimenta TAMBÉM a AOI do
//             snapshot (server/src/net/snapshot.js), e afastar só de um lado desenharia uma borda vazia.
//   FEAST     RARO. A comida vale FEAST_K. Só a COMIDA (EAT.FOOD_GAIN): encostar no ganho de fragmento
//             quebraria a conservação de massa, que é estrutural aqui — o que sai de um planeta tem que
//             voltar exatamente igual.
// DROP é o peso DENTRO de FOOD.POWER_P (não soma probabilidade nova ao mapa, reparte a que já existe): os
// dois primeiros continuam sendo a maioria porque são os que o jogador aprende primeiro, e os dois raros
// somam 14 % da banda — ~0,5 % de toda a comida, que é o que faz alguém comemorar ao ver um.
// ímã: comida a d<r·MAGNET_RANGE anda a MAGNET_PULL·(1+(MAGNET_NEAR−1)·(1−d/alcance)) px/s; ejetados ganham MAGNET_EJECT_A px/s² (drag 3.7/s → ~240 px/s)
// MAGNET_MAX_R: acima desse raio a peça NÃO pega nem usa o ímã. O número é dito em RAIO porque é o que a
// física tem em mãos, mas ele foi ESCOLHIDO em massa: 316 = √100000, ou seja **o ímã vale até 100 mil de
// massa**, que é o número que o jogador lê no HUD. Passou disso, o grão de ímã vira comida comum (ver
// eatFood: ele não pode sumir sem dar nada, que era o que acontecia).
// Histórico: o teto já foi 160 (raio que qualquer partida decente passa em minutos — o ímã virava item morto
// para quem jogava bem) e depois 420. O que NUNCA foi trabalho deste número é conter o ALCANCE: quem faz
// isso é MAGNET_RANGE_MAX (900 px absolutos), e em r=316 o alcance calculado já dá 1738 → saturado em 900.
// Ou seja: mexer aqui muda só QUEM pode usar, nunca o quanto o ímã puxa. É a primeira chave parametrizável
// pelo painel /admin (ver shared/src/tunables.js), e é por isso que ela tinha de ser inofensiva a tudo o mais.
// cometa/estrela (comida pesada) andam a MAGNET_HEAVY disso; a estrela do mundo se arrasta a MAGNET_STAR (é um perigo enorme vindo até você)
// asteroides ganham MAGNET_AST px/s² escalados por R_MIN/r (rocha pequena vem voando, rocha grande se arrasta): o ímã
// puxa a recompensa E o perigo — ligar o ímã perto de um cinturão é escolha, não acidente
// escudo: não expira; nível 1..SHIELD_MAX_LEVEL (N mísseis para destruir), sobe 1 nível a cada SHIELD_EVOLVE_TICKS sem ser atingido; −1 nível ao disparar e ao dividir
// ímã e escudo valem POR PEÇA: só a parte que pegou o powerup se beneficia; ao fundir, os poderes das duas se juntam (escudo soma até o teto, ímã soma o tempo restante)
export const BOT={THINK_TICKS:[20,55],FLEE_RATIO:1.25,FLEE_DIST:760,HUNT_RATIO:1.3,HUNT_DIST:900,FOOD_DIST:520,MAX_PIECES:8,
  HOLE_AVOID:1.3,STAR_FEAR:2.6,RESPAWN_SCORE:.3,SPAWN_GRACE_TICKS:900,NOVATO_MASS:6000,NOVATO_RATIO:4,   /* 15 s — era 7 s, e ver `rules.piecePair`: agora ela também IMPEDE de ser comido */AIM_CHANCE:.75,DIRS:8,WALL_MARGIN:340,MISSILE_FEAR:900,AST_FEAR:2.4,WAYPOINT_DONE:110,FLEE_STEP:760,
  STICK:1.28,HAZ_TTL:6,DANG_N:6,FIRE_CD:[50,130],FEED_CD:40,MISSILE_MIN_D:1100,
  // Quanto dura o ARREMESSO do salto: o tick em que |v| do canal de impulso cai abaixo de BOOST.STOP.
  // DERIVADO, nunca cravado — o filho é dirigível o voo inteiro (integratePiece soma o ponteiro por cima
  // do boost), e é essa janela que o bot usa para segurar a mira na presa em vez de voltar ao flanco.
  JUMP_TICKS:Math.ceil(Math.log(SPLIT.DIST*BOOST.K/BOOST.STOP)/BOOST.K*TICK_HZ),
  COMMIT:{hunt:90,flee:45,food:60,zone:0,hold:150,intercept:30,wander:40},
  HAND:{DIST:620,JITTER_STEP:.05,JITTER_MAX:.28,FLICK:[8,15],STOP_R:26,LEAD_MAX:1.15,IDLE_TURN:.06},
  HUNT:{BONUS_MAX_R:150,ARC_DIRS:8,ARC_STEP:560,OPEN:.62,FLANK:.7,SPLIT_MARGIN:1.08,THIRD_R:900,TEAM_SIDE:.85,DODGE:1.05,
    SPLIT_GAIN:.04,SPLIT_GAIN_SHIELD:.09,SPLIT_GAIN_N:.6,SPLIT_OPEN:.62,SPLIT_CONE:.45,BITE_CLEAR:520,BITE_PENALTY:.6},
  GAS:{RING:.7,EDGE:.86,LOOT_R:.5,LOOT_MIN_R:120,LOOT_TICKS:150,LATE_ALIVE:8,LATE_PULL:1.5},
  PERSONAS:[{id:"cacador",hunt:1.15,flee:.85,food:.7,fire:1.4,edge:.5},{id:"fazendeiro",hunt:.8,flee:1.25,food:1.45,fire:.7,edge:.15},{id:"oportunista",hunt:1,flee:1,food:1,fire:1,edge:.32}],
  SKILLS:[{id:"ruim",   w:18,react:20,turn:.11,jitter:1.7,lead:.15,zoneMargin:.85,mistake:.22,split:.45,weapon:.30,flee:.80},
          {id:"medio",  w:46,react:13,turn:.20,jitter:1.0,lead:.55,zoneMargin:.65,mistake:.10,split:.75,weapon:.65,flee:1.00},
          {id:"bom",    w:28,react: 9,turn:.28,jitter:.55,lead:.80,zoneMargin:.52,mistake:.04,split:.92,weapon:.90,flee:1.15},
          {id:"fera",   w: 8,react: 6,turn:.36,jitter:.30,lead:.95,zoneMargin:.45,mistake:.015,split:1,  weapon:1,  flee:1.30}]};
// bot: PERSONAS dá o ESTILO (o que ele quer fazer), SKILLS dá a MÃO (quão bem ele faz). São ortogonais — 3 × 4 = 12
// assinaturas —, e é a SKILLS que faz uma sala de 50 parecer gente: 50 adversários igualmente competentes,
// reagindo na mesma hora e com a mesma pontaria, é o maior denunciador de bot que existe. `w` é o peso do
// sorteio: ~18 % ruins, 46 % medianos, 28 % bons, 8 % feras. NENHUM é ótimo — nem o "fera" tem mistake 0.
// react: ticks até uma decisão nova chegar na mão. turn: rad/tick que o ponteiro gira (a 0,11 uma inversão de
// 180° leva meio segundo; sem isso o bot troca de direção no mesmo quadro, coisa que mão humana não faz).
// jitter: multiplicador do tremor do ponteiro. lead: quanto ele acerta a ANTECIPAÇÃO do alvo (mirar onde a
// presa VAI estar, não onde está). zoneMargin: fração do orçamento de tempo em que ele decide correr para o
// círculo — 0,45 sai cedo, 0,85 sai em cima da hora e às vezes não chega. mistake: chance de escolher a 2ª
// melhor opção em vez da melhor. split/weapon: quanto usa o salto e o cinto de armas. flee: sensibilidade a perigo.
// STICK: bônus da opção ATUAL na comparação — é o que impede o vaivém (escolher caçar, desistir, caçar de novo)
// que denuncia script. COMMIT: ticks mínimos de cada intenção; só zona em urgência e perigo colado furam.
// HAZ_TTL: o perigo mais próximo é calculado no _think e revalidado por 6 ticks — _nearestHazard varria estrelas
// e asteroides TODO tick para CADA bot (~56×49 iterações), e era o maior custo fixo do cérebro.
// HAND.DIST: o ponteiro é um PONTO, mas acima de SPEED.RAMP (32 px) a distância não muda nada — 620 px é só um
// braço confortável. STOP_R: apontar para DENTRO desse raio FREIA a peça (é como o bot "para", coisa que o
// cérebro velho nunca fazia). FLICK: mirar custa movimento (o AIM escolhe pelo cursor), então atirar em algo
// fora da direção de marcha é um puxão curto do ponteiro e a volta — igualzinho ao humano.
//
// ── A ECONOMIA DO SALTO (HUNT.SPLIT_*) ──
// O salto de ataque era vetado por `!shield`, e isso estava errado por um fator de 2 a 7. Medido numa arena
// de Livre (8 sementes × 7200 ticks × 24 bots): **73 % do tempo de caça** ficava barrado por esse veto, e o
// bot passa a maior parte da partida blindado — o escudo não expira e sobe um nível a cada
// SHIELD_EVOLVE_TICKS, então quem pega um nunca mais dividia na vida. Os dois lados da conta, na MESMA
// unidade (fração da minha massa), que é todo o motivo de o preço ser dito em massa:
//   ganho de um salto  = (rb/ra)², com teto (1/(√2·EAT.RATIO·SPLIT_MARGIN))² = 32 % (EAT.GAIN=1: a presa entra inteira)
//   preço do escudo    = P(chegar míssil na janela de 30 s de mergeTicks) × (1 − MISSILE.HIT_SHRINK²) ≈ 0,23 × 19 % ≈ 4,4 %
// SPLIT_GAIN (.04) é o piso quando não há escudo a perder: abaixo disso a mordida não paga os 30 s dividido.
// SPLIT_GAIN_SHIELD (.09) é o preço COM escudo, e é o VALOR ESPERADO medido dele: um bot absorve ~0,5 míssil
// a cada 30 s (a janela em que a fusão o mantém dividido) e cada absorção poupa 1 − MISSILE.HIT_SHRINK² =
// 19 % da massa da peça → 0,49 × 19 % ≈ 9 %. Sem fator de segurança: é a conta, e foi também o melhor ponto
// medido numa varredura de .16/.12/.09 em 24 arenas (137 → 176 → 246 saltos, com a massa média parada).
// Exige `rb ≥ 0,30·ra`, ou seja o salto blindado só sai por uma presa que vale ≥ 9 % da minha massa — é o
// "só de forma estratégica" do pedido, e não um veto.
// ⚠️ O preço NÃO escala com o nível do escudo. Foi tentado e é PIOR (246 → 113 saltos): com só ~0,5 míssil
// chegando na janela, o 2º e o 3º nível quase nunca chegam a ser usados, então o valor ESPERADO é
// praticamente o mesmo dos três — e cobrar pelo nível fecha o portão justo nos bots que sobreviveram o
// bastante para chegar ao nível 3, que são exatamente os que têm tamanho para saltar.
// ⚠️ E O NÚMERO NÃO MUDOU QUANDO O SALTO PASSOU A LEVAR UM NÍVEL em vez do escudo inteiro (`applySplit`
// chama `hitShield`). Em teoria devia: .09 é o valor esperado de PERDER A BLINDAGEM, e quem salta com
// nível 2 ou 3 sai do salto ainda protegido — pelo mesmo Poisson(0,49) de cima o valor marginal do 2º
// nível é ~1,7 % e o do 3º ~0,25 %, os dois ABAIXO do piso .04, que já cobre sozinho os 30 s dividido.
// Cobrar só quando o salto ZERA o escudo (lv===1) foi ESCRITO e MEDIDO em 12 sementes da arena Livre:
// **81 saltos com a correção e 81 sem ela** — zero. A oportunidade também não muda (1351 contra 1357
// amostras em modo hunt), então o que decide o salto ali não é este número. Ficou o predicado simples.
// ⚠️ E foi essa medição que mostrou que **3 sementes não medem nada** neste eixo: por semente o total vai
// de 1 a 15 saltos, com média 6,8. Ver o piso de `bot.test.js`, que era loteria.
// ⚠️ E ele só ficou calibrável depois de tapar o vazamento do gatilho (ver o tiro em bot.js): enquanto o bot
// destruía o próprio escudo atirando, ele vivia desblindado e este número quase não era consultado.
// SPLIT_GAIN_N (.6) encarece cada salto seguinte (já dividido, o segundo renova o relógio de fusão e me
// expõe a predadores de 0,813·r).
// ⚠️ Quem NÃO relaxou foi o veto do TIRO: `applyFire` cobra um nível por puxão de gatilho, e o bot destrói o
// próprio escudo 92× no gatilho contra 1× no salto (medido quando o salto ainda levava os 3 níveis; com o
// salto a 1 nível a razão em NÍVEIS é ainda maior). Os dois usos precisam de leituras DIFERENTES — o tiro
// cobra da PRIMEIRA peça viva, o salto cobra um nível de TODA peça com r ≥ SPLIT.MIN_R.
// SPLIT_OPEN (.62) substitui um `.35` cravado no código. `open` mede parede+gás+estrelas, e no Livre não há
// zona num mapa de 9600²: o valor medido é 0,933, então aquele fator era 0,35 PERMANENTE. 0,62 preserva o
// bônus de arco fechado (0,62→1,0 quando open→0), que continua valendo no Battle Royale.
// SPLIT_CONE (.45 rad = 26°): o erro angular entre o ponteiro e a presa no instante do disparo tinha p50 0,38
// e p75 1,17 rad — 41 % dos saltos saíam torto, porque `applySplit` arremessa na direção do PONTEIRO e a mão
// do bot é filtrada por HAND/turn. Agora ele leva o ponteiro ao alvo e só então aperta, como gente.
// BITE_CLEAR (520 px) / BITE_PENALTY (.6): caçar um PEDAÇO pequeno de um jogador grande. O bocado só vale se
// estiver a mais de BITE_CLEAR do guarda (depois de morder eu estou a r/√2 e o guarda anda ~340 px no tempo
// do voo + engolir), e vale menos que uma presa limpa da mesma massa — é presa de segunda, colada a quem me come.
// HUNT.OPEN: fração do arco de fuga livre acima da qual a presa está em campo aberto e a caça não vale a pena.
// FLANK: quanto o bot desvia da linha reta para FECHAR o lado aberto (encurralar) em vez de correr atrás.
// SPLIT_MARGIN: folga sobre o predicado REAL de comer depois do salto (r/√2 ≥ 1,15·rb ⇒ rb ≤ r/1,626).
// HUNT.DODGE: quanto o leque de fuga gira (rad) quando o caçador já está no alcance do salto — correr reto
// para longe é correr para o ponto onde o arremesso CAI.
// GAS: RING/EDGE são frações do raio da zona (miolo alvo e anel de borda); LOOT_* é a incursão no gás atrás do
// espólio que a zona arranca; LATE_* aperta o jogo quando sobram poucos.
// ── NOMES ────────────────────────────────────────────────────────────────────
// BOT_NAMES é a lista TEMÁTICA do modo Livre, onde o bot é assumido (o HUD marca "◆" ao lado).
export const BOT_NAMES=["Nebulox","Vortexia","Cosmara","Drakonis","Stellara","Graviton","Quasara","Pulsaris","Meteora","Darkion",
  "Nexaris","Solaron","Astrophex","Hydraxis","Volcanix","Luminos","Aetheron","Aurorax","Voidrix","Pyronis",
  "Zephyrion","Orbitron","Cryonix","Magnetar","Helioxis","Terravox","Ionara","Perseida","Andromex","Cassiona",
  "Lyrandis","Vegara","Altairix","Rigelon","Betelgar","Procyon","Sirionis","Deneban","Mirzam","Alnitak",
  "Titania","Callistro","Ganymed","Europax","Iapetus","Umbriel","Oberonix","Tritonis","Charonis","Phobetor",
  "Deimara","Ceresix","Palladion","Vestara","Junonix","Erisara","Sednara","Makemax","Haumeia","Quaoron"];
// BOT_NICKS é a lista do Battle Royale, onde o preenchimento NÃO se identifica: são apelidos no estilo do
// que um jogador de verdade escolhe (pt-BR, com e sem número), e não nomes de nave espacial. Com 20 nomes
// temáticos numa sala de 50 a farsa cairia na primeira olhada no placar — repetidos, todos do mesmo tema.
// São 373 aqui, mais os quatro formatos de `botNick`. Com 50 por sala isso é folga de sobra dentro de UMA
// partida, mas o número grande é para as partidas SEGUIDAS: com 96 bases o jogador via a mesma escalação
// de nomes toda vez, que denuncia tanto quanto repetir dentro da sala.
export const BOT_NICKS=[
  "Lucas","Pedro","Gabi","Rafa","Bia","Thiago","Mari","Caio","Duda","Vitor","Lele","Bruno","Nanda","Igor","Manu","Leo",
  "Ju","Felipe","Carol","Diego","Alice","Murilo","Sofia","Enzo","Lara","Davi","Isa","Otavio","Nina","Arthur","Cleo","Tom",
  "Zeca","Kiko","Nando","Dede","Binho","Teteu","Gugu","Lipe","Mila","Rick","Cacau","Juca","Bel","Baiao","Tuca","Vivi",
  "Matheus","Gustavo","Larissa","Rodrigo","Camila","Fernando","Bruna","Ricardo","Paula","Andre","Jessica","Marcelo",
  "Renata","Vinicius","Amanda","Eduardo","Priscila","Guilherme","Tati","Rafael","Aline","Henrique","Debora","Fabio",
  "Natalia","Marcos","Luana","Alan","Simone","Wesley","Karol","Everton","Elis","Joao","Yasmin","Samuel","Livia",
  "Danilo","Nicole","Breno","Helena","Kaua","Antonia","Miguel","Valentina","Heitor","Cecilia","Bernardo","Maite",
  "Anthony","Agatha","Ryan","Rebeca","Erick","Milena","Kevin","Sabrina","Wallace","Taina","Jonas","Elaine",
  "Bibi","Fefe","Gigi","Lulu","Nene","Pipo","Tuti","Dudu","Fifi","Kaka","Mimi","Tico","Bento","Chico","Betinho",
  "Juninho","Neto","Sandro","Serginho","Toninho","Careca","Magrao","Loirinho","Moreno","Baiano","Mineiro","Gaucho",
  "Carioca","Paulista","Xande","Nandinho","Rafinha","Duda2","Lelezinho","Biel","Yuri","Kelvin","Jean","Rogerio",
  "ninja","dragao","lobo","tigre","corvo","raposa","panda","coruja","alpha","turbo","sombra","trovao","gelo","fenix",
  "kraken","vespa","cobra","falcao","urso","onca","piloto","capitao","mestre","doutor","chefe","rei","lorde","barao",
  "jacare","pirarucu","arara","tucano","jaguar","suricato","javali","morcego","escorpiao","aranha","formiga","abelha",
  "besouro","polvo","tubarao","enguia","baleia","golfinho","pinguim","foca","lontra","texugo","hiena","chacal",
  "leopardo","puma","gaviao","aguia","condor","albatroz","garca","pelicano","marreco","capivara","quati","tamandua",
  "pixel","glitch","turbo9","noob","pro","gamer","player","sniper","tank","rush","clutch","combo","hyper","mega",
  "rage","spawn","respawn","lagado","ping","fps","dourado","camper","tryhard","carry","smurf","boost","nerf","buff",
  "meta","kernel","patch","beta","hotfix","zerado","speedrun","noscope","tilt","spam","kite","poke","gank","farm",
  "jungle","supp","void","byte","hex","root","sudo","ctrl","esc","alt","cache","proxy","bug","combo9","nulo",
  "pastel","coxinha","brigadeiro","acai","tapioca","farofa","feijao","churrasco","pipoca","sorvete","goiaba","jabuti",
  "treta","zoeira","migue","perrengue","rolezinho","fominha","cascudo","sertao","zen","neo","max","ace","vex","jinx",
  // Nomes americanos: a sala é internacional (o chat detecta idioma e os bots respondem em inglês), e uma
  // escalação 100% pt-BR entregava que a lista era escrita por uma pessoa só. Entram no mesmo sorteio.
  "Mike","Jake","Tyler","Logan","Mason","Chase","Blake","Travis","Cody","Hunter","Wyatt","Trevor","Marcus","Xavier",
  "Preston","Garrett","Jared","Derek","Shane","Dustin","Chad","Brad","Colton","Bryce","Trent","Seth","Drew","Reed",
  "Ashley","Megan","Kaitlyn","Madison","Savannah","Brittany","Haley","Kelsey","Chelsea","Courtney","Paige","Sierra",
  "Devin","Grant","Cole","Nate","Zack","Brody","Dalton","Landon","Ethan","Mason2","Riley","Quinn","Casey","Jonah",   // ⚠️ "Jordan" saiu: casa com um easter egg de caricatura (shared/src/eggs.js), e um preenchimento com a cara de uma celebridade é o oposto de passar por gente
  "slyfox","bigmike","dukey","tank3","noodle","waffle","biscuit","pickle","nacho","donut","mustang","ranger",
  "buckeye","yankee","texan","cowboy","maverick","hoosier","rocket","skyler","blaze","dozer","ripper","gunner"];
// ── NACIONALIDADE DO PREENCHIMENTO ───────────────────────────────────────────
// O humano já tem país (`users.country`, que vira bandeira no ranking e no perfil); o bot não tinha nenhum,
// e uma sala de 50 com UMA bandeira acesa no meio de 49 vazias aponta exatamente quem é gente.
// A distribuição é ponderada e a maioria é BR porque a base é brasileira — mas o sorteio é COERENTE com o
// NOME: um "Savannah" com bandeira do Brasil é mais estranho que bandeira nenhuma, então `botCountry`
// recebe o nick e leva os nomes americanos para US/CA (ver US_ROOTS). Determinístico pelo rng da sala.
const BOT_COUNTRIES=[["BR",46],["US",14],["PT",6],["AR",6],["MX",5],["ES",4],["CO",4],["CL",3],["GB",3],
  ["FR",2],["IT",2],["DE",2],["CA",2],["JP",1]];
const BOT_COUNTRY_TOTAL=BOT_COUNTRIES.reduce((t,x)=>t+x[1],0);
const US_ROOTS=new Set(["mike","jake","tyler","logan","mason","chase","blake","travis","cody","hunter","wyatt",
  "trevor","marcus","xavier","preston","garrett","jared","derek","shane","dustin","chad","brad","colton","bryce",
  "trent","seth","drew","reed","ashley","megan","kaitlyn","madison","savannah","brittany","haley","kelsey",
  "chelsea","courtney","paige","sierra","devin","grant","cole","nate","zack","brody","dalton","landon","ethan",
  "riley","quinn","casey","jordan","slyfox","bigmike","dukey","tank","noodle","waffle","biscuit","pickle","nacho",
  "donut","mustang","ranger","buckeye","yankee","texan","cowboy","maverick","hoosier","rocket","skyler","blaze",
  "dozer","ripper","gunner"]);
/**
 * País de um preenchimento, sorteado pelo rng da sala e coerente com o nome.
 * `evita` são as bandeiras que já bateram o teto da SALA (ver ROOM.PAIS_TETO_DIV): a roleta simplesmente
 * as tira do tabuleiro e reparte o peso delas entre as outras. É por isso que ela é FILTRADA em vez de
 * re-sorteada até dar certo — com o BR pesando 46 de 100, "tenta de novo" é estatística, e uma tentativa
 * azarada em cada 500 fura o teto sem que ninguém entenda por quê. Filtrando, o teto é garantido e o
 * custo continua sendo UM sorteio por bot, que é o que mantém o determinismo por semente.
 * ⚠️ Com TODAS as bandeiras evitadas o veto é ignorado em vez de devolver nada: teto é teto, mas um bot
 * sem bandeira nenhuma seria pior que uma bandeira repetida.
 * @param {{next:()=>number,int:(a:number,b:number)=>number}} rng @param {string} nick
 * @param {Set<string>|null} [evita]
 */
export function botCountry(rng,nick,evita=null){
  const veta=c=>!!(evita&&evita.has(c));
  const raiz=String(nick||"").toLowerCase().replace(/[_\d]+$/,"");
  if(US_ROOTS.has(raiz)&&!(veta("US")&&veta("CA"))){   // as duas cheias: o nome americano cai na roleta geral
    if(!veta("US")&&!veta("CA"))return rng.next()<.82?"US":"CA";
    return veta("US")?"CA":"US";}
  let total=0;for(const [c,p] of BOT_COUNTRIES)if(!veta(c))total+=p;
  if(total<=0){evita=null;total=BOT_COUNTRY_TOTAL;}
  let r=rng.next()*total;
  for(const [c,p] of BOT_COUNTRIES){if(veta(c))continue;r-=p;if(r<=0)return c;}
  return "BR";}
/**
 * Apelido de preenchimento, determinístico pelo rng da sala. Mistura quatro formatos porque uma lista só de
 * nomes limpos também denuncia: gente de verdade usa número, underline e caixa maluca.
 * `usados` evita repetir (inclusive contra os nicks dos humanos que já estão na sala).
 * ⚠️ O quinto formato era `xX<nome>Xx` (10% dos nicks) e SAIU: ele é a assinatura de um gerador, não de uma
 * pessoa — três "xXalgumaXx" no mesmo placar entregam a farsa antes de qualquer movimento denunciar. Os 10%
 * foram redistribuídos entre os que sobraram. `baseNick` (shared/src/util.js) continua desfazendo o padrão,
 * porque HUMANOS ainda escolhem nicks assim e o `citou()` do chat precisa reconhecê-los.
 */
export function botNick(rng,usados){
  for(let t=0;t<40;t++){
    const base=BOT_NICKS[rng.int(0,BOT_NICKS.length-1)],r=rng.next();
    const n=r<.38?base
      :r<.70?base+rng.int(2,99)
      :r<.88?base+"_"+rng.int(10,999)
      :base.toUpperCase();
    if(!usados.has(n.toLowerCase())){usados.add(n.toLowerCase());return n.slice(0,16);}}
  return("j"+rng.int(1000,999999)).slice(0,16);}
// ── NICK SORTEADO PARA O JOGADOR (o chão, quando a LLM não responde) ─────────
// A tela inicial entrega o campo já preenchido (ver ENTRY.NICK_AUTO). A primeira escolha é a LLM
// (server/src/auth/nickPool.js); esta lista é o que vale sem ela — e ela é o único caminho no
// `?local=1` e com o servidor fora, que não têm com quem falar.
//
// ⚠️ NENHUM NOME DE PESSOA, e é o ponto da lista. `BOT_NICKS` é metade nome de gente de propósito
// (o preenchimento tem que passar por gente); aqui é o contrário — o jogador não pediu para se
// chamar Lucas, então o que se sorteia para ele é COISA: astronomia de um lado, apelido de jogo do
// outro. As duas famílias no mesmo sorteio, senão metade da sala nasce com cara de gerador.
//
// ⚠️ E ela é DISJUNTA de `BOT_NICKS`/`BOT_NAMES`, o que não é elegância: nick igual ao de um
// preenchimento na mesma sala faz `Room.nickTaken` RECUSAR a entrada do jogador (erro NICK_IN_ROOM).
// ⚠️ Nenhuma base pode casar com `eggSkinFor` — senão o jogador ganha a caricatura de uma
// celebridade sem ter pedido — nem com `COMUNS` (raiz que é palavra comum faz o bot responder a quem
// não o chamou) nem com `nickProibido`. `shared/test/nicks.test.js` varre as quatro.
// ⚠️ ASCII sem acento: o nick atravessa `normalizeNick`, a peneira de `recusa()` e o fio, e um "ó"
// aqui viraria uma diferença de normalização em algum desses três.
export const PLAYER_NICKS=[
  // ── astronomia e espaço ──
  "Quasar","Pulsar","Nebulosa","Cometa","Orbita","Meteoro","Cratera","Eclipse","Zenite","Vortex",
  "Aurora","Perihelio","Galaxia","Asteroide","Satelite","Plasma","Fotao","Cosmos","Nadir","Apogeu",
  "Perigeu","Umbra","Penumbra","Corona","Ecliptica","Zodiaco","Parsec","Supernova","Heliosfera","Exoplaneta",
  "Estelar","Sideral","Astral","Lunar","Solar","Boreal","Austral","Celeste","Etereo","Orion",
  "Pegaso","Hidra","Lira","Cisne","Fornax","Carina","Cetus","Lupus","Pyxis","Volans",
  "Andromeda","Perseu","Centauro","Bootes","Aquario","Canopus","Achernar","Bellatrix","Arcturus","Polaris",
  "Sirio","Vesper","Crateras","Magnetos","Ionosfera","Estratos","Albedo","Afelio","Sizigia","Libracao",
  // ── apelido de jogo: máquina, comida e bicho ──
  "Nitro","Laser","Radar","Reator","Turbina","Foguete","Blaster","Torpedo","Impacto","Colisao",
  "Bunker","Arsenal","Overdrive","Vetor","Nucleo","Reboot","Overflow","Payload","Firewall","Sandbox",
  "Cluster","Daemon","Quantum","Binario","Fractal","Entropia","Singular","Bitwise","Latencia","Pacote",
  "Empada","Pudim","Quindim","Moqueca","Bolinho","Pamonha","Rapadura","Cocada","Beiju","Canjica",
  "Bauru","Guarana","Cajuina","Pequi","Umbu","Jabuticaba","Mandioca","Chimarrao","Vatapa","Sarapatel",
  "Tatu","Preguica","Bugio","Sagui","Ariranha","Boto","Seriema","Anta","Cutia","Irara",
  "Jaguatirica","Muriqui","Guariba","Tambaqui","Traira","Lambari","Sucuri","Cangaco","Curiango","Gralha"];
/**
 * Nick sorteado para o JOGADOR. Gêmeo de `botNick` de propósito — mesmos quatro formatos, mesmo teto de
 * tentativas, mesmo registro em `usados` por dentro —, e o que muda é só a LISTA: aqui não entra nome de
 * pessoa. Duas listas, uma função: manter dois geradores divergentes seria inventar um segundo jeito de
 * fazer a mesma coisa.
 * ⚠️ `usados` são os nicks EM USO naquele momento (a união dos `usedNicks` das salas do shard, montada
 * pela rota `GET /api/nick`). Sem ele o sorteio entrega um nome que a sala vai recusar na entrada.
 * @param {{next:()=>number,int:(a:number,b:number)=>number}} rng @param {Set<string>} usados
 */
export function playerNick(rng,usados){
  for(let t=0;t<40;t++){
    const base=PLAYER_NICKS[rng.int(0,PLAYER_NICKS.length-1)],r=rng.next();
    const n=r<.38?base
      :r<.70?base+rng.int(2,99)
      :r<.88?base+"_"+rng.int(10,999)
      :base.toUpperCase();
    if(!usados.has(n.toLowerCase())){usados.add(n.toLowerCase());return n.slice(0,16);}}
  return("orbe"+rng.int(1000,999999)).slice(0,16);}
/**
 * TAMANHO de um preenchimento que ENTRA na sala (ver ROOM.SEED_R). O do respawn continua sendo
 * `PLAYER.BOT_R` puro: quem morre recomeça pequeno, como todo mundo.
 * `i` é quantos bots já estão na sala e `f` (1 → 0) é o quanto a abertura ainda vale.
 * Os `ROOM.BOT_SEED` primeiros seguem a COTA de `ROOM.SEED_MIX` — a sala tem que parecer em andamento
 * SEMPRE, e sorteio independente às vezes entrega seis bolinhas.
 * ⚠️ GIGANTE SÓ NA SEMENTE. Ele é o veterano que já estava lá quando você chegou; um planeta de 250 de
 * raio nascendo no minuto 3, dentro da câmera de quem já cresceu, é o pop-in que o `BOT_SEED` existe
 * para evitar — voltando pela porta dos fundos. Quem chega depois da abertura entra no máximo MÉDIO, com
 * a chance decaindo por `f`, e a mistura volta ao [24,58] de sempre sozinha.
 * ⚠️ `f <= 0` cala TAMBÉM a cota da semente, e não só o sorteio: é isso que faz um `f` zerado (um modo
 * que não é o Livre) devolver o tamanho de sempre pelos DOIS ramos, em vez de semear gigante calado.
 * ⚠️ O raio sai de `rng.range` DENTRO do tier: dois gigantes com o mesmo raio na mesma sala denunciariam
 * o gerador tão bem quanto o `xX…Xx` que saiu do `botNick`.
 * @param {{next:()=>number,range:(a:number,b:number)=>number}} rng @param {number} i @param {number} f
 */
export function botSpawnR(rng,i,f){
  const g=ROOM.SEED_MIX[0],m=ROOM.SEED_MIX[1],n=ROOM.BOT_SEED;let tier=2;
  if(f>0){
    if(i<n)tier=i<g?0:i<g+m?1:2;                                     // a semente: cota, sem sorteio
    else if(rng.next()<m/n*(f<1?f:1))tier=1;                         // depois dela: no máximo um médio, cada vez mais raro
  }
  const faixa=tier<2?ROOM.SEED_R[tier]:PLAYER.BOT_R;return rng.range(faixa[0],faixa[1]);}
// ── FALA DOS BOTS ────────────────────────────────────────────────────────────
// Uma sala de 50 pessoas que atravessa a partida inteira em silêncio é tão estranha quanto um bot correndo
// em linha reta. As falas são CURTAS, minúsculas e presas a um gatilho do jogo — nada de papo solto, que é
// o jeito mais fácil de denunciar. Quem fala é a SALA (server/src/rooms/Room.js), não o cérebro: falar é
// evento de sala, e o LocalServer do `?local=1` não tem chat. O padrão é o silêncio: o orçamento em
// BOT_TALK deixa passar pouca coisa.
export const BOT_CHAT={
  start:["bora","boa sorte","alguem ai","vamo","glhf","to dentro","partiu","primeira vez aqui","oi","salve"],
  kill:["boa","peguei","kkkk","foi","ez","acertei","sai fora","proximo","huum","valeu"],
  morte:["ah nao","kkkk","fui","boa ai","tava perdido","errei feio","de novo nao","travou","eita","foi mal"],
  zona:["o gas","corre","to fora","vem pro meio","ta fechando","fui pego","sai dai","cuidado com o gas"],
  poucos:["quantos faltam","ta apertado","chegando la","aguenta","top 5","calma ai","gg","boa sorte ai"],
  equipe:["vem","to fraco","cuidado","atras de voce","me segue","toma massa","juntos","corre","espera","to indo"],
  // Gatilhos novos: sem pool próprio o `||BOT_CHAT.kill` de _fraseFixa faria o bot dizer "peguei" ao LEVAR um míssil.
  tiro:["quem atirou","ei","para com isso","serio isso","vou lembrar disso","me erra","ta me caçando?","calma la"],
  escudo:["la se foi o escudo","perdi o escudo","ih","aguenta","to sem escudo","era meu escudo"],
  cacado:["me deixa","sai de mim","to encurralado","socorro","ta colado em mim","nao me segue"],
  lider:["to em primeiro","olha eu ai","cheguei","topo","vem me tirar dai","primeiro lugar"],
  // Resposta ENLATADA a quem chamou pelo nome. Existe porque ser chamado e ficar mudo é o que mais denuncia
  // um bot — e a LLM cai (disjuntor, teto de geração, fila cheia) com muito mais frequência do que se imagina.
  resposta:["fala ai","que isso mano","kkkk","calma ai","vem entao","pode vir","que foi","to aqui",
            "sei nao hein","fala serio","era so o que faltava","ta bom ne"],
  // A INICIATIVA: o bot PUXA assunto quando a sala está calada (Room._iniciativaTick). Sem LLM ela não
  // inventa assunto nenhum — só quebra o silêncio, que é o que uma frase enlatada sabe fazer honestamente.
  // Pool próprio é obrigatório: sem ele o `||BOT_CHAT.kill` de _fraseFixa faria o bot dizer "peguei" do nada.
  puxa:["alguem vivo ai","que silencio","essa sala ta quieta","quem ta ganhando","cade a galera",
        "ta osso essa partida","alguem viu esse gigante","to quase morrendo aqui"]};
export const BOT_TALK={ROOM_CD_TICKS:420,BOT_CD_TICKS:2400,MAX_PER_MATCH:3,NO_REPEAT:6,
  P:{start:.35,kill:.22,morte:.3,zona:.18,poucos:.3,equipe:.28,tiro:.10,escudo:.14,cacado:.06,lider:.12,puxa:.5},
  TYPO_P:.12,QUEUE_MAX:12,
  // ── INICIATIVA: quebrar o silêncio ──
  // Até aqui a conversa só nascia de um humano digitar, e uma sala em que ninguém NUNCA começa nada é tão
  // estranha quanto uma em que ninguém fala. Orçamento próprio (não passa por `botChatTick`, onde perderia
  // a loteria para qualquer abate do mesmo tick).
  SILENCIO_TICKS:2700,          // 45 s sem uma linha na sala. Abaixo de ~30 s isso atropela a conversa que
                                // estava só respirando entre uma resposta e outra
  INICIATIVA_CD_TICKS:3600,     // 60 s entre duas iniciativas da MESMA sala
  INICIATIVA_MAX_PER_MATCH:4};  // quatro vezes por rodada alguém quebra o gelo, não mais
// Gatilho novo NÃO aumenta o número de linhas: todos passam por botChatTick, que sorteia UM da fila e joga o
// resto fora, e por ROOM_CD_TICKS/BOT_CD_TICKS/MAX_PER_MATCH. O que ele aumenta é a chance de a única linha
// que sai ser sobre o que acabou de acontecer com AQUELE bot.
// ── FALA GERADA (Ollama) ─────────────────────────────────────────────────────
// O repertório acima continua sendo o CHÃO: é o que sai sem LLM configurada, com ela fora do ar ou quando a
// resposta demora. O que a LLM acrescenta é o que uma lista fixa não tem — reagir ao que foi DITO, responder
// a quem chama pelo nome (mesmo escrito errado) e falar no idioma da conversa.
// Os orçamentos são DOIS. O espontâneo (comentar um evento) é o de sempre e continua apertado: falar demais
// denuncia um bot muito mais que qualquer movimento. O de MENÇÃO é bem mais folgado — ser chamado pelo nome e
// ficar mudo é justamente o que não passa por gente —, mas ainda tem cooldown por bot e teto por partida.
export const BOT_LLM={
  TIMEOUT_MS:2500,      // o que não chegou aqui não chega a tempo de ser resposta
  STALE_MS:4000,        // e o que chega depois disto é comentário atrasado: vai fora (a fala é do INSTANTE)
  MAX_INFLIGHT:4,       // gerações ao mesmo tempo por PROCESSO (todas as salas do shard somam aqui); env OLLAMA_MAX_INFLIGHT
  MAX_INFLIGHT_ROOM:2,  // ...e por SALA: sem este, uma sala movimentada come o orçamento inteiro do shard
  HIST:8,               // linhas de chat que entram no prompt
  HIST_DIRIGIDA:6,      // quando falaram COM o bot, a linha dirigida vale mais que o backlog — mas 4 linhas
                        // deixavam o bot responder no vácuo, sem saber do que a sala estava falando
  // ⚠️ MAX_CHARS e HIST_CHARS eram a MESMA constante, em dois papéis diferentes: o teto do que o bot DIZ
  // e o corte de cada linha do HISTÓRICO que entra no prompt. Separá-las é o que deixa a fala crescer sem
  // engordar o prompt em um caractere — e o prompt já estava estourando PROMPT_MAX_CHARS sem ninguém ver.
  // ⚠️ O TETO NÃO É SÓ PENEIRA: ele é DITADO NO PROMPT (`montaSystem`, em rooms/botChat.js). Isto não é
  // detalhe — a peneira RECUSA em vez de cortar, então baixar o teto sem contar ao modelo não encurta a
  // fala: troca a fala por uma frase enlatada, e o bot fica mais MUDO em vez de mais breve. Com o número
  // no prompt, o admin que baixar isto no painel vê a fala encolher de verdade no minuto seguinte.
  // 12/85 (era 16/110): a queixa é literal — linhas longas e bem construídas denunciam o bot antes de
  // qualquer outra coisa. Ninguém digita 16 palavras no meio de uma partida. A folga entre o que o prompt
  // PEDE (~3/4 disto) e o que a peneira ACEITA é o que mantém a taxa de veto baixa.
  MAX_WORDS:12,MAX_CHARS:85,
  HIST_CHARS:90,               // ...e o corte de cada linha do histórico, que continua onde estava
  TEMP:1.05,NUM_PREDICT:48,
  // ── QUE TIPO DE CONVERSA É ESTA ──
  // O SYSTEM sempre pediu "seja engraçado e cheio de si", e só. Isso é um estilo — o problema é que era um
  // estilo CRAVADO: ajustar o tom da sala exigia deploy. Aqui ele vira uma escolha do painel, no molde de
  // PERSONA/PERICIA (o id mora no shared, a frase em inglês mora no servidor, em rooms/botChat.js).
  // ⚠️ Só o ID vive aqui. A frase do prompt é server-only pelo mesmo motivo de `botPersonas.js`:
  // `shared/` vai inteiro para o bundle do `?local=1`, e instrução de LLM não tem o que fazer lá.
  // ── QUAL MODELO ATENDE ──
  // O modelo era só `OLLAMA_MODEL` no ConfigMap: trocá-lo pedia editar YAML, aplicar e reiniciar os três
  // shards — para uma decisão que só se toma OLHANDO a sala falar (um modelo é mais rápido, outro é mais
  // engraçado, outro obedece melhor ao teto de palavras). Aqui ele vira escolha do painel, no molde exato
  // de ESTILO/ESTILOS: a lista é FECHADA (é a segunda lista branca de que fala tunables.js) e só nomeia o
  // que existe na máquina do Ollama — pedir um modelo ausente é trocar a fala dos bots por 404 em silêncio.
  // ⚠️ O env `OLLAMA_MODEL` continua valendo e é a SEMENTE do boot: ele escreve aqui antes da primeira sala
  // e ACRESCENTA a si mesmo à lista se for um nome novo (ver `server/src/index.js`), senão o painel abriria
  // com um `<select>` que não contém o valor que o servidor está usando. Depois disso quem manda é o banco.
  // ⚠️ Trocar o modelo NÃO reaquece sozinho: o novo paga o load (~27 s) na primeira fala, e nesse meio-tempo
  // a sala usa o repertório fixo — que é o mesmo chão de sempre, não um segundo comportamento.
  // ⚠️ `think:false` NÃO CALA TODO MUNDO, e o modo de falha é MUDO. O gpt-oss é um raciocinador nativo:
  // ele ignora o pedido, devolve o raciocínio no campo `thinking` e **`content` vem VAZIO** — medido, com
  // `num_predict:48` o raciocínio come os 48 tokens e a fala nem começa (`done_reason:'length'`). Ou seja:
  // trocar o modelo pelo painel deixaria a sala inteira no repertório fixo, com HTTP 200, sem erro e sem
  // log. Por isso cada entrada declara o que o CLIENTE precisa saber sobre ela:
  //  · `think` — o que vai no campo do Ollama. `false` desliga (qwen, gemma); `'low'` é o menor esforço de
  //    raciocínio que o gpt-oss aceita, e é o que o traz para ~900 ms, dentro do TIMEOUT_MS.
  //  · `reserva` — tokens que o raciocínio come ANTES da primeira letra da resposta. O cliente a SOMA a
  //    todo `num_predict`, então o chamador continua pedindo o tamanho da FALA (48 numa linha de chat, 180
  //    num lote de apelidos) sem saber que existe modelo que pensa antes de falar.
  // O INTERRUPTOR do raciocínio, pedido no painel. `auto` é o que a entrada do modelo declara e é o único
  // valor que sabe que o gpt-oss QUEBRA com `false`; os outros dois forçam, e o rótulo diz o preço.
  // ⚠️ MEDIDO, e é o motivo de `auto` ser o padrão: gpt-oss com `think:false` devolve `content` VAZIO
  // mesmo com num_predict folgado (198 tokens) — ele ignora o pedido, pensa assim mesmo e a fala nem
  // começa. HTTP 200, sala inteira no repertório fixo, nenhum erro em log. Nos modelos que obedecem
  // (qwen, gemma), desligar é o comportamento de sempre e economiza segundos.
  THINK:'auto',
  THINKS:[
    {v:'auto',label:'Automático — o que cada modelo aceita (recomendado)'},
    {v:'sim',label:'Sim — raciocina antes de falar (mais lento)'},
    {v:'nao',label:'Não — ⚠️ deixa o gpt-oss MUDO; use só com qwen ou gemma'},
  ],
  MODELO:'gpt-oss:20b',
  MODELOS:[
    {v:'gpt-oss:20b',label:'gpt-oss:20b — padrão',think:'low',reserva:150},
    {v:'qwen3.6:35b-a3b',label:'qwen3.6:35b-a3b — maior, mais lento',think:false,reserva:0},
    {v:'gemma4:12b-it-q8_0',label:'gemma4:12b-it-q8_0 — menor, mais rápido',think:false,reserva:0},
  ],
  ESTILO:'misto',
  // O rótulo é pt-BR e sai direto no painel /admin, que é exceção declarada ao i18n (ver CLAUDE.md).
  ESTILOS:[
    {v:'misto',label:'Misto — curtas, ofensas, piadas e comentários'},
    {v:'curta',label:'Só frases curtas'},
    {v:'ofensa',label:'Provocação e zoeira'},
    {v:'piada',label:'Piada com o nome do adversário'},
    {v:'comentario',label:'Comentário do que está acontecendo'},
    {v:'seco',label:'Seco — sem provocar ninguém'},
  ],
  MENTION_ROOM_CD_TICKS:150,   // 2,5 s: responder a quem chama é esperado, então a sala segura bem menos
  MENTION_BOT_CD_TICKS:600,    // 10 s por bot
  MENTION_P:.92,               // citado pelo nome, quase sempre responde
  REPLY_P:.16,                 // sem citação, só quem falou por último tem direito de réplica — e raramente
  MAX_MENTION_PER_MATCH:12,    // dobrado: uma conversa longa gasta 2–3 do mesmo bot numa cadeia só
  // ── CORO: quantos bots respondem à MESMA mensagem ──
  // Uma pergunta jogada para a sala ("e aí galera, tudo bem?") com UMA resposta parece script; com três
  // chegando em tempos diferentes parece gente digitando. Provocação dirigida a um bot continua sendo dele.
  CORO_N_W:[.35,.40,.25],      // pesos de 1, 2 ou 3 respostas numa pergunta aberta
  CORO_MAX_CITADOS:2,          // citados pelo nome: no máximo dois respondem
  // ⚠️ Este é o único atraso PROPOSITAL do caminho; o resto (TIMEOUT_MS) é latência da geração. Chamar
  // alguém pelo nome e esperar mais de um segundo pela primeira letra não parece gente digitando — parece
  // fila. Abaixo de ~150 ms também não: aí é rápido DEMAIS para quem teria que ler e escrever.
  CORO_D0_MS:[150,500],        // atraso da PRIMEIRA resposta (menção dirigida cai sempre nesta faixa)
  CORO_D_MS:[500,1100],        // acréscimo de cada resposta seguinte
  CORO_WAIT_MS:3500,           // item que envelheceu NA FILA é descartado antes de gastar geração
  // ── DIGITAR leva tempo, e é aí que mora o "não parece um bot" ──
  // O atraso acima é o de PENSAR (ver o que foi dito e começar a responder), e ele é curto de propósito.
  // O que faltava era o outro: a resposta aparecia INTEIRA no instante em que o modelo terminava, então uma
  // frase de 45 letras chegava tão rápido quanto um "kkkk" — e isso nenhuma pessoa faz. Agora a publicação
  // espera `len/CPS` (com piso e teto), como se o bot estivesse escrevendo.
  // ⚠️ Este relógio é DEPOIS da geração, e por isso NÃO pode entrar no CORO_WAIT_MS (que mede a idade do
  // item NA FILA, antes de gerar): somá-los faria toda menção virar `stale` e o bot ficaria MUDO, que é o
  // oposto do pedido. São dois relógios diferentes — um é espera proposital, o outro é falha de latência.
  DIGITA_CPS:14,               // caracteres por segundo de quem "está digitando"
  DIGITA_MIN_MS:450,           // um "kkkk" também não sai instantâneo
  DIGITA_MAX_MS:3400,          // e ninguém espera mais que isso por uma linha de chat de partida
  CORO_POP_MAX:2,              // itens despachados por tick (o step() é de 60 Hz e é de TODAS as salas)
  FILA_MAX:8,                  // fila de fala agendada por sala; cheia, o NOVO é descartado. Era 6, e com
                               // CONVERSA_MAX_GER=8 o amortecedor ficou apertado por construção
  // ── CORRENTE: bot respondendo a bot ──
  // Liberado, mas curto: só continua quando a linha CITA alguém pelo nome, e a profundidade é limitada.
  CADEIA_MAX:5,                // era 2. É a ÚNICA terminação que não depende de sorteio — a prova de que a
                               // corrente acaba. Todo o resto abaixo é probabilidade.
  CADEIA_P:.75,                // a linha CITOU alguém: quase sempre continua
  // A linha NÃO citou ninguém. Numa conversa de gente isso é a REGRA, não a exceção ("kkkk", "nem vi",
  // "tu ta doido") — exigir vocativo para continuar era o que matava a corrente no SEGUNDO elo, e é por
  // isso que uma conversa nunca passava de duas réplicas. Continuar sem ser chamado é mais fraco que ser
  // chamado, e a probabilidade tem que dizer isso: SOLTA_P < CADEIA_P.
  // ⚠️ É ESTE o botão de "conversa mais longa", não o CADEIA_MAX. Subir para .65 leva a cadeia média de
  // 2,6 para 3,2 elos; o CADEIA_MAX só define onde ela é cortada à força.
  CADEIA_SOLTA_P:.5,
  // Quantos elos um bot espera para voltar a falar. Com CADEIA_MAX=5, o "nunca repetir slot" de antes
  // exigia CINCO bots distintos por conversa — revezamento, não conversa. A janela de 2 proíbe o que
  // incomoda (A→B→A no mesmo fôlego) e libera o que parece gente (A→B→C→A). Com 1, A↔B↔A↔B ficaria
  // liberado, que é dois bots monopolizando a sala.
  CADEIA_JANELA:2,
  CADEIA_BOT_CD_TICKS:120,     // 2 s: o cooldown por bot DENTRO da corrente. Sem ele o de MENÇÃO (10 s)
                               // continuaria valendo nos elos, e o elo seguinte chega 1–4 s depois — ou
                               // seja, afrouxar a janela acima seria um NO-OP.
  // ── ORÇAMENTO DA CONVERSA ──
  // A cadeia longa transformou UMA linha de humano em várias gerações: com CADEIA_MAX=5 e coro de até 3,
  // uma frase podia pedir 15. O teto por BOT não segura (são bots diferentes) e MAX_INFLIGHT_ROOM também
  // não — ele só ENFILEIRA. Quem segura é este.
  CONVERSA_MAX_GER:8,          // gerações que UMA conversa inteira pode consumir
  CONVERSA_MAX_GER_BOT:4,      // ...e metade quando quem abriu foi a INICIATIVA: puxar assunto não dá o
                               // mesmo crédito que ser chamado por um humano
  CONVERSA_CD_TICKS:900,       // 15 s depois do último elo até a sala aceitar CORO novo. Menção dirigida
                               // NUNCA passa por aqui: ser chamado pelo nome e ficar mudo é o pecado.
  CADEIA_SCAN_MAX:24,          // teto de candidatos varridos por `citou` (Levenshtein por palavra)
  // ── MEMÓRIA CURTA do bot (quem atirou nele, quem o mordeu) ──
  MEM_N:6,                     // anel por bot; a leitura ignora o que passou do TTL, então não há varredura
  MEM_TTL_TICKS:900,           // 15 s: mais que isso e "o Evandro atirou em mim" já não é sobre agora
  MEM_QUENTE_TICKS:300,        // 5 s: dentro disto a fala é "acabou de atirar", não "vive atirando"
  // ── QUEM É QUEM ──
  // O prompt sabia o que o bot estava vivendo e não sabia quem era NINGUÉM: os nomes entravam como
  // strings vazias de sentido. O servidor, porém, JÁ SABE quando um jogador está vestido de personagem
  // real (shared/src/eggs.js decide a skin a partir do nick), e sabe o país e o nível de todo mundo.
  ELENCO_MAX:4,                // pessoas descritas por prompt. Medido: 284 chars no pior caso (4 com
                               // caricatura + país + nível), 91 no típico. Com 5 não cabe no teto.
  NIVEL_ALTO:20,               // daqui para cima o nível vira adjetivo no prompt; abaixo não diz nada
  FEED_KEEP:12,                // mortes recentes guardadas na sala (o kill feed em texto, para o prompt)
  FEED_HIST:3,                 // e quantas delas entram: o bot comenta o que a sala ACABOU de ver, não a partida inteira
  FEED_FRESCO_TICKS:900,       // 15 s: até aqui a última morte ainda é ASSUNTO. Passou disso, quem puxa
                               // conversa comentando um abate parece estar lendo o log, não jogando.
  PROMPT_MAX_CHARS:1900,       // teto do `user` no pior caso — prompt gordo é prompt lento (ver TIMEOUT_MS)
  // 1900 não é chute: é o pior caso MEDIDO (1815 chars) com a persona mais longa, o histórico cheio de
  // linhas no tamanho máximo, a mensagem dirigida inteira, o elenco com ELENCO_MAX pessoas e uma folga.
  // Existe para que acrescentar contexto ao prompt tenha que passar por um teste, em vez de engordar em
  // silêncio. ⚠️ E ele JÁ ESTAVA ESTOURADO em 1500: o teste montava um cenário sem `feed`, `modo`,
  // `lider` e `zonaS` — campos que `Room._ctxFala` passa SEMPRE —, media 1225 e dava tudo certo,
  // enquanto a produção mandava 1531. Um teto só vale o que o pior caso do teste vale.
  // ── BALDE DE APELIDOS (server/src/rooms/botNames.js) ──
  // A LLM também escreve os NOMES dos preenchimentos, para eles parecerem gente daquele país em vez de
  // sorteios de uma lista fixa. Ela nunca é consultada no nascimento do bot (o lobby do BR pede até 50
  // nicks num tick só): enche um balde em segundo plano, e `botNick` continua sendo o CHÃO.
  // ⚠️ O LOTE ENCOLHEU (24 → 8) E PASSOU A SER VÁRIOS AO MESMO TEMPO. Um lote é de UM país só — é essa a
  // inversão que a feature faz (sorteia-se o país e pedem-se nomes DELE) —, e com 24 por pedido o balde
  // ficava monocromático por muito tempo: como `take` servia em LIFO, uma sala inteira nascia com a mesma
  // bandeira. Oito de cada vez, com `NICK_FILL_PAR` pedidos em voo para países DIFERENTES, dá ao balde
  // três bandeiras quase juntas — mesmo total de apelidos por rodada, mesmo custo, sem o bloco de uma cor.
  NICK_LOTE:8,                 // apelidos por pedido. Um país por lote, sorteado pela distribuição de sempre
  NICK_FILL_PAR:3,             // pedidos SIMULTÂNEOS, cada um de um país que ainda não está no balde
  NICK_PAISES_MIN:5,           // ...e o balde também se reabastece com POUCAS BANDEIRAS, mesmo cheio: o
                               // que a sala consome não é apelido, é apelido COM bandeira, e um balde de
                               // 40 nomes de dois países só rende duas bandeiras (`Room._paisesCheios`
                               // recusa o resto e a sala cai no chão). Diversidade é critério de estoque.
  NICK_POOL_MIN:16,            // abaixo disto o balde se reabastece
  NICK_POOL_MAX:96,            // ...e para de encher aqui: 96 cobre duas salas de BR cheias
  NICK_FILL_MS:20000,          // de quanto em quanto se olha o balde. Não há pressa: quem chega e o encontra
                               // vazio simplesmente usa o nome de sempre, e ninguém percebe
  NICK_NUM_PREDICT:180,        // ⚠️ o default (NUM_PREDICT 48) é de UMA linha de chat e cortaria o lote no meio
  NICK_TIMEOUT_MS:25000,       // ⚠️ e este pedido NÃO tem prazo — é o oposto da fala, que é do INSTANTE
  NICK_TEMP:1.15,              // um pouco mais solto que a fala: repetir apelido é o defeito a evitar aqui
  KEEP_ALIVE:'30m',            // carregar o modelo custa ~27 s; descarregá-lo entre partidas seria fatal
  FAILS_OPEN:6,BREAKER_MS:30000};   // N falhas seguidas → desiste por um tempo, em vez de pagar o timeout a cada gatilho
// FAILS_OPEN subiu de 4 para 6 por causa do coro: três respostas que estourem o prazo já eram 3 falhas
// seguidas e quase abriam o disjuntor sozinhas. (Frase recusada pela PENEIRA não conta como falha: `sanitiza`
// roda no botChat, fora do cliente HTTP.)
// ROOM_CD_TICKS: 7 s entre duas falas QUAISQUER da sala — sem isso um abate múltiplo vira coro. BOT_CD_TICKS:
// 40 s por bot. MAX_PER_MATCH: ninguém fala mais que 3 vezes na partida inteira. TYPO_P: de vez em quando
// escapa uma letra dobrada ou trocada, que é como gente digita com pressa. NO_REPEAT: quantas frases
// recentes a sala lembra para não repetir — ouvir "boa ai" três vezes na mesma partida denuncia mais
// que o silêncio (aconteceu na primeira partida de produção). O sorteio EXCLUI as recentes em vez de
// tentar de novo: com tentativas, quatro sorteios seguidos podiam cair todos na mesma frase.
/** Erra a digitação de um jeito plausível (letra dobrada ou trocada com a vizinha). @param {{next:()=>number,int:(a:number,b:number)=>number}} rng */
export function botTypo(rng,txt){
  if(txt.length<3)return txt;
  const i=rng.int(0,txt.length-2);
  return rng.next()<.5?txt.slice(0,i)+txt[i]+txt.slice(i):txt.slice(0,i)+txt[i+1]+txt[i]+txt.slice(i+2);}
export const CAM={BASE:64,EXP:.4,K:1,PORTRAIT_K:1.12,REF_W:1920,REF_H:1080,TAU_POS:.024,TAU_ZOOM:.158,AOI_FOOD_VIEW:.44};
// PORTRAIT_K: no celular EM PÉ a largura manda no `max(H/REF_H,W/REF_W)` só de raspão — a tela é estreita
// e a proporção agar (mesma ÁREA de mundo em qualquer tela) mostra pouco mundo na HORIZONTAL, mesmo com
// K=1. É um segundo divisor, só ativo quando W<H (retrato: celular em pé, nunca desktop nem paisagem), que
// afasta um POUCO a câmera nesse caso — 1.12 é ~11% a menos de escala, deliberadamente pequeno (o pedido
// era "diminuir só um pouco"). Some no MESMO lugar de CAM.K (antes do piso do mundo), pelo mesmo motivo:
// enquadramento de jogo não pode mostrar além do mapa.
// K é o ÚNICO botão de zoom do /admin, e é multiplicador global: >1 afasta a câmera de todo mundo, <1
// aproxima. Um botão e não seis porque os outros candidatos são armadilhas — REF_W/REF_H carregam a regra
// anti-widescreen do agar ("a mesma área de mundo em qualquer tela", travada em teste) e ZOOM.MIN/ZOOM.K
// estão amarrados a POWERUP.ZOOM_K por outro teste (1+MIN+K = 1,5 = ZOOM_K), então mexer neles quebra uma
// promessa em vez de girar um botão. Entra ANTES do piso do mundo, junto do powerup.
// ⚠️ Escopo 'wire': o cliente também lê `zoomFor`, e o servidor entrega o valor no JSON da sala. Com um
// `scope:'server'` a AOI viria por um zoom e a tela desenharia por outro — que se lê como uma borda larga
// e vazia, exatamente o defeito que `aoiScaleFood` existe para não ter.
// zoom EXATO do cliente do agar.io:  S = Σ raio de TODAS as peças próprias;
//   escala = min(BASE/S, 1)^EXP × max(altura/REF_H, largura/REF_W)
// Três coisas importam aqui e nenhuma delas é o que havia antes (58/bigR):
// 1) é a SOMA dos raios, não o maior: dividir em 16 afasta a câmera de verdade, como no agar;
// 2) é lei de POTÊNCIA (.4), então crescer 10× em raio só afasta 2,5× — o planetão continua enorme na tela
//    (com 58/bigR ele virava uma bolinha e o mundo inteiro aparecia);
// 3) o multiplicador de resolução mantém a MESMA área de mundo visível em qualquer tela (é a regra anti-widescreen
//    do agar: tela mais larga não vê mais mundo), e substitui o antigo modo retrato.
// A CÂMERA é livre: o piso é só "mostrar o mundo inteiro". Quem tem teto é a AOI, e SÓ para a comida
// (AOI_FOOD_VIEW = fração da largura do mundo). Foram coisas separadas de propósito: colocar o teto na câmera
// deixou o jogo injogável — um jogador de 14 peças gigantes não conseguia afastar o bastante para ver as próprias
// partes, e elas cobriam a tela. A comida é 90% das entidades do snapshot e, no zoom afastado, cada pelota tem
// 1–2 px: é ela que custa caro e é ela que não faz falta longe. Peças, perigos e mísseis continuam vindo pela
// visão inteira — sem isso o gigante perderia de vista as próprias peças, que é justamente o bug que isto conserta.
// TAU_POS/TAU_ZOOM são a suavização do MESMO cliente, convertidas de "por frame" para tempo: lá é
// `viewX=(viewX+x)/2` (50% por frame → τ=dt/ln2=24 ms) e `scale=(9·scale+s)/10` (10% → τ=158 ms).
// A posição é quase instantânea de propósito: a câmera fica colada no planeta e só o zoom respira.
export const ZOOM={MIN:.10,K:.40,STEP:1.12,WHEEL_PX:100,PINCH_PX:25,ACC_MS:200,MAX_STEPS:3,
  VIEW_MS:350,GRACE_TICKS:30,ABS_MIN:.25,ABS_MAX:4};
// ZOOM MANUAL PELA RODA: uma FAIXA em torno do zoom automático, com a largura crescendo com a MASSA
// (`zoomSpan` em camera.js). O `zoomFor` continua mandando — a roda só multiplica o resultado dele —, e a
// faixa fecha sozinha quando o jogador encolhe.
// POR QUE A LARGURA É DA MASSA: enxergar mais mundo é VANTAGEM, e dá-la de graça a quem é pequeno inverte o
// único preço que crescer cobra aqui (o planetão é lento, mas vê longe). Atrelada ao ΣR, a roda é só a
// escolha de QUANTO usar do que ele já conquistou.
//   MIN  faixa de quem acabou de nascer (±10 %). Zero seria um controle que não responde, e o jogador
//        conclui que está quebrado.
//   K    o quanto a massa abre a faixa. ⚠️ `1 + MIN + K = 1,5 = POWERUP.ZOOM_K`, e isso NÃO é coincidência:
//        o teto do afastamento manual é exatamente o afastamento para o qual a AOI já foi dimensionada e
//        medida em produção (área 2,25×). Não é um orçamento de rede novo — é um que já passou. Subir K é
//        subir o pico de entidades de TODA sala: comida tem teto por área E por contagem (NET.AOI_FOOD_MAX),
//        mas peça, asteroide, estrela e míssil vêm pela visão inteira.
//   STEP passo por entalhe da roda (12 %): ~6 entalhes atravessam a faixa do planetão, que é o que uma mão
//        dá num gesto só. O recém-nascido tem 1,7 — na prática três posições: perto, automático, longe.
//   WHEEL_PX  quanto de `deltaY` normalizado vale UM passo (um entalhe do Chrome ≈ 100). PINCH_PX é o mesmo
//        para a pinça de trackpad (que chega como wheel+ctrlKey e espera ser mais fina). Sem esse acúmulo um
//        deslize de dois dedos — dezenas de eventos de 1–4 px — varreria a faixa inteira num quadro.
//   ACC_MS  o acumulador esquece depois disso parado, senão meia rolagem de um minuto atrás soma com a de agora.
//   MAX_STEPS  teto por EVENTO: um `deltaMode:2` (página) não pode varrer a faixa de uma vez.
//   VIEW_MS  throttle do `{t:"view"}`. ⚠️ Resize e zoom disputam o MESMO balde de NET.RATE_JSON (5/s), e 3
//        rejeições em 10 s ENCERRAM a conexão — foi assim que arrastar a janela derrubava o jogador antes do
//        debounce. Com 350 ms o pico é 2,9/s; com o ping de 1/s sobra folga e ainda há o burst de 10.
//   GRACE_TICKS  meio segundo em que a AOI do servidor NÃO encolhe depois de o jogador aproximar. A câmera do
//        cliente é suavizada por CAM.TAU_ZOOM (3τ ≈ 470 ms) e a AOI é instantânea: sem a marca d'água, voltar
//        ao automático abriria uma borda vazia a cada entalhe. É o ZOOM_GRACE_TICKS do powerup, pelo mesmo
//        motivo — a AOI pode SOBRAR; faltar, nunca.
//   ABS_MIN/ABS_MAX  sanidade do que vem do fio, aplicada na Session (que não conhece a massa). O clamp que
//        VALE é o do snapshot, pelo ΣR real: sem ele um cliente adulterado pediria o mapa inteiro.
// ⚠️ NÃO entra em tunables.js: chave de escopo `both` responde 501, e é exatamente o caso — o cliente tem a
// própria cópia do bundle, então mudar isto só no servidor faria a câmera e a AOI divergirem em silêncio.
export const NET={INPUT_HZ:30,KEEPALIVE_HZ:10,INTERP_DELAY_MS:100,INTERP_MAX_MS:150,EXTRAP_MAX_MS:100,SNAP_DIST:120,AOI_PAD:.3,AOI_PAD_OUT:.45,AOI_FOOD_MAX:300,
  RATE_INPUTS:40,RATE_BURST:60,RATE_JSON:5,SPEC_MS:350,HEARTBEAT_MS:5000,DEAD_MS:15000,RESUME_MS:10000,
  IDLE_KICK:true,IDLE_MS:180000,IDLE_WARN_MS:15000,IDLE_MOVE_PX:24,AWAKE_MS:20000};
// ── OS TRÊS RELÓGIOS DA SESSÃO, e eles NÃO medem a mesma coisa ───────────────
//   DEAD_MS   (15 s)  o SOCKET morreu: nada chegou, nem um pong. Quem mata é o heartbeat do wsServer.
//   RESUME_MS (10 s)  a sessão está SEM socket e ninguém veio buscá-la pelo `resume`. Quem mata é o
//                     housekeeping da Room, e é o prazo em que a pessoa pode cair a rede e voltar.
//   IDLE_MS   (3 min) o socket está VIVO e a pessoa não está: nenhum gesto humano há três minutos.
// ⚠️ `lastPong` NÃO serve para o terceiro, e a semelhança dos nomes é a armadilha: ele é renovado por
// QUALQUER mensagem (wsServer: `ws.on('message')`), inclusive o keepalive de 10 Hz que o InputSender manda
// com o mouse PARADO e o ping de 1 Hz do Connection. Ele mede socket vivo; quem mede pessoa presente é
// `Session.lastActiveAt`, escrito só pelo que é gesto (ver `marcaAtivo`). Juntar os dois desliga a
// expulsão por inatividade em silêncio — nada quebra, ninguém é expulso nunca mais.
// IDLE_KICK: o interruptor. Uma funcionalidade que EXPULSA gente tem que poder ser desligada num clique no
// /admin, sem deploy, no dia em que o primeiro falso positivo aparecer — o mesmo espírito de BLACKHOLE.COUNT=0.
// IDLE_MOVE_PX: quanto o ALVO (tx,ty, em px de MUNDO) precisa andar para valer como gesto. O cliente já só
// reenvia com >2 px, e 24 px filtra o tremor que a suavização da câmera (CAM.TAU_POS) imprime no alvo sem
// deixar passar movimento de verdade. ⚠️ É um piso honesto, não o sinal fino: com o mouse largado FORA do
// centro o planeta anda, a câmera vai junto e o ponto de MUNDO sob o mesmo pixel muda sozinho até bater na
// parede. Quem fecha esse buraco (e o do jogador MORTO, que não manda input nenhum) é o `{t:"awake"}`.
// AWAKE_MS: throttle do `{t:"awake"}` no cliente, em borda de ATAQUE (o primeiro gesto sai na hora, o resto
// é engolido). O balde de JSON é RATE_JSON=5/s e três rejeições em 10 s ENCERRAM a conexão — o mesmo balde
// que arrastar a janela já estourou uma vez; 0,05/s cabe com folga ao lado do `view` e do `ping`.
// SPEC_MS: throttle do `{t:"spectate"}`, o TERCEIRO inquilino do balde — e o único que não tinha nenhum.
// As setas ‹ › da tela de morte e da arquibancada (ui/Dead.jsx, ui/Spectate.jsx) ouvem `keydown` CRU, e o
// auto-repeat do teclado não é gesto: segurar a seta mandava uma mensagem por repetição. MEDIDO contra este
// mesmo balde, a 25/s o burst de 10 se esvazia em 900 ms e a 3ª rejeição encerra a conexão em 980 ms — o
// jogador lê "Too many messages" e volta para o menu no meio da partida. São DUAS defesas, porque uma só
// deixa metade do buraco: a guarda de `e.repeat` nos dois handlers (o molde é `input/Keyboard.js`) e este
// throttle na FONTE (`game.spectate`), que é quem também cobre clicar num nome do placar e no radar.
// ⚠️ 350 ms é o mesmo de ZOOM.VIEW_MS de propósito, e sobra: a roda é DESLIGADA enquanto se está morto
// (`createWheel({enabled:…&&!dead})`) e o `view` do laço de render mora dentro de `if(own.length)`, ou seja
// na arquibancada o `view` não concorre — fica o `ping` de 1/s e estes 2,9/s contra uma reposição de 5/s.
// AOI_FOOD_MAX: TETO de grãos que uma sessão conhece ao mesmo tempo. `aoiScaleFood` já limita a ÁREA, mas
// área não é contagem: com a câmera afastada de um planeta grande cabiam ~500 grãos na tela de uma vez, e a
// comida é 90 % das entidades. Medido numa sala de Battle Royale: pico de 510 entidades, 443 delas comida,
// contra 128–185 estáveis no Livre — é o que fazia o frame estourar e, por tabela, atrasar o input e sacudir
// a predição. O teto corta o ANEL DE FORA (o mais longe do jogador, onde o grão tem 1–2 px na tela): o que
// está perto entra sempre, e quem já é conhecido nunca some por causa do teto (sumir seria pior que faltar).
// ⚠️ REPORT_CD_MS é generoso de propósito (1 min): denunciar não é uma ação que se repete numa partida,
// e sem cooldown o botão vira flood de log. REPORT_LINES é o contexto anexado — as últimas falas do
// denunciado —, porque "fulano denunciou beltrano" sem texto é uma linha que ninguém julga depois.
export const CHAT={MAX_CHARS:140,RATE_MS:1500,BURST:3,FADE_MS:9000,KEEP:40,REPORT_CD_MS:60000,REPORT_LINES:5,
  // FILTRO: quanto da linha de uma PESSOA é mascarado (`server/src/palavrao.js` faz a conta). Xingar faz
  // parte de um .io, e mascarar o que o jogador escreve é decisão de PRODUTO — por isso o padrão é `livre`
  // e o resto é um clique no /admin. O que os portais pedem por escrito continua de pé em qualquer nível:
  // silenciar (do cliente), denunciar e o kick/ban do dono da sala.
  // ⚠️ O nível NÃO vale para o NICK nem para o ÓDIO na boca de um bot — ver o cabeçalho de palavrao.js.
  FILTRO:'livre',
  FILTROS:[
    {v:'livre',label:'Livre — a linha do jogador sai como foi escrita'},
    {v:'pesado',label:'Mascara o pesado — insulto sexual, família e slur'},
    {v:'tudo',label:'Mascara tudo — inclui palavrão do dia a dia (merda, porra)'},
  ]};
// ── AVISO GLOBAL (painel /admin) ────────────────────────────────────────────
// Uma faixa no HUD e uma linha de sistema no chat. JSON de controle, como `avatars` e `talk`, então o
// PROTOCOL_VERSION não muda. ⚠️ Ele NÃO passa por `Room._pushChat`, de propósito: `_pushChat` exige um
// GamePlayer (slot, nome, equipe) e alimenta o `chatLog`, que é o prompt da LLM dos bots — um aviso de
// manutenção ali faria os preenchimentos começarem a comentar a manutenção. Engraçado uma vez, ruim sempre.
// MAX_CHARS é maior que o do chat porque quem escreve é um administrador, não um jogador em partida.
export const NOTICE={MAX_CHARS:200,TTL_MS:12000,LEVELS:['info','warn']};

// ── FLUXO AO VIVO DO /admin ─────────────────────────────────────────────────
// O painel tinha UMA atualização automática (a tela de Salas, a cada 5 s) e nenhum evento: quem entrou,
// quem matou quem, quem falou e quem denunciou morriam dentro do pod. Isto é o barramento que os leva ao
// navegador de um administrador — anel por POD, lido por um shard COLETOR que agrega os irmãos e reemite
// como SSE numa conexão só (server/src/admin/bus.js e coletor.js).
//
// ⚠️ NADA DISTO É TUNABLE. O painel não pode ajustar o próprio transporte: um número errado aqui tranca o
// administrador para fora da tela que ele usaria para consertar o número. É o mesmo argumento que faz
// `ADMIN_EMAILS` só PROMOVER.
// ⚠️ `AWAKE_MS` tem que ser bem MAIOR que `FANIN_MS`: é a janela de vigília do anel, renovada por cada
// coleta. Se o pod dormir entre duas coletas, ele para de publicar e o painel perde eventos sem que nada
// acuse — 15 s contra 1 s cobre até um coletor travado por uma coleta inteira.
// ⚠️ `RING` é o quanto se pode ficar para trás. 24 salas × ~8 eventos/s de pico ≈ 200/s, então 1024 são
// ~5 s de folga contra uma coleta de 1 s. Passar disso é LACUNA declarada, nunca silêncio.
// ⚠️ `ESTREIA` é o lote de quem chega com cursor ZERO, e ele existe por DUAS razões que se somam: um
// coletor novo contra 24 anéis cheios pediria 24 576 eventos numa resposta só (megabytes, na primeira
// pintura da tela), e marcar isso como LACUNA diria "perdi 1024 eventos" a quem acabou de abrir o painel
// e não tinha o que perder. Cursor zero é ESTREIA, nunca atraso.
// ⚠️ `SONDA_MS` existe porque `config.peers` sai de `SHARDS` (24 no ConfigMap) mas quem decide quantos
// pods EXISTEM é o HPA — e ele vive em 3. Sem espaçar a sonda dos nomes que não resolvem, o coletor
// bateria em 21 pods inexistentes uma vez por segundo, para sempre. E eles também não entram no
// denominador do KPI de shards: "3/24 em vermelho" num cluster saudável é alarme falso permanente.
export const ADMIN_BUS={RING:1024,ESTREIA:40,AWAKE_MS:15000,FANIN_MS:1000,KPI_MS:3000,PING_MS:15000,SONDA_MS:15000,
  AUTH_TTL_MS:10000,MAX_STREAMS:4,ABRE:{n:12,win:60000},
  // Cliente: janela das sparklines (60 amostras a 1 Hz = o último minuto), tamanho do anel da tela,
  // cadência de publicação do React e o cão de guarda que detecta stream morto sem evento nenhum.
  SERIE:60,CLIENTE_RING:500,FLUSH_MS:250,COALESCE_MS:4000,TETO_S:20,
  CAO_MS:30000,ESPERA_MS:[500,1000,2000,4000,8000,15000]};

// ── KILL FEED (estilo Counter-Strike) ────────────────────────────────────────
// "Quem matou quem" no canto superior direito. Vai em JSON de controle (`{t:"feed",v:[...]}`), NÃO no fio
// binário: o EVENT tem 13 bytes fixos com o `extra` já ocupado pelo score da vítima (não cabe a arma), marco
// de rodada não tem x/y, e difundir EVENT.DEATH faria o cliente instanciar efeito e SOM de mortes do outro
// lado do mapa. Só SLOTS viajam — o cliente resolve o nome por view.playerOf(), o que de quebra faz o feed
// respeitar `anonBots` do Battle Royale sem uma linha a mais.
//
// ⚠️ Fato da física que decide o formato: `w.killPiece` só é chamado em TRÊS lugares (rules.js), com causa
// `eaten`, `zone` e `blackhole` — este último dormente. Míssil, estrela, asteroide e supernova NUNCA matam
// sozinhos: todos param no piso MIN_PIECE_R. Eles AMOLECEM, e quem finaliza é sempre uma boca (ou o gás).
// Por isso `how` (com o quê) e `a` (quem colheu) são campos separados, e existe `by` (a assistência): a
// linha honesta é "⭐ amoleceu · Fulano devorou", não "morreu na estrela".
export const FEED={KEEP:16,ROWS:8,TTL_MS:22000,HIT_TTL_TICKS:300,QUEUE_MAX:32,MAX_PER_FLUSH:4,
  LEAD_HOLD_TICKS:180,LEAD_MARGIN:.05,LEAD_CD_TICKS:1200,CRUNCH_AT_S:[600,300,60],STREAK_AT:[3,5,10],
  JOIN_QUIET_MS:20000};
// JOIN_QUIET_MS: a janela em que a MESMA pessoa voltando NÃO vira "saiu"/"entrou" no log. A chave é a de
// `_rosterKey` (a mesma que já resolve "a mesma pessoa entre vidas"), e a guarda mora DENTRO de
// `join`/`leave`, nunca nos chamadores.
// ⚠️ ELA NASCEU PARA O RESPAWN, E ESSE MOTIVO ACABOU. No Livre, renascer ERA `leave`+`join` num socket
// novo — o botão DE NOVO fechava a conexão e abria outra —, e sem a guarda cada morte produzia duas
// linhas. Hoje renascer é `{t:"respawn"}` na MESMA sessão (`Room.respawn`/`Sim.revive`): o jogador morto
// nunca saiu da sala, e a única forma honesta de não mentir no feed era parar de fazê-lo sair. Os 20 s
// também não bastavam — quem ficava lendo a tela de morte passava disso e as duas linhas saíam.
// O que sobrou para ela cobrir são os DOIS caminhos em que a pessoa sai de verdade e volta logo: trocar
// de sala com o jogo aberto (o re-join do `wsServer`) e o roubo de sessão pelo `resume`. Nos dois não há
// tela de morte para ficar lendo, então 20 s serve.
// ⚠️ Queda de rede não é saída — ela cai em `Room.detach`, que segura a sessão por `NET.RESUME_MS`, e só
// o `housekeeping` a converte em `leave` 10 s depois.
// KEEP/ROWS/TTL_MS: buffer do cliente, linhas na tela e quanto tempo cada uma dura. TTL era 9 s, e a linha
// sumia inteira e de uma vez — quem estava olhando o jogo perdia o abate. Hoje dura 22 s e a lista morre em
// DEGRADÊ (client/src/styles/ui.css, `#kill-feed .kf-row:nth-child`): a mais nova em cima, opaca, e as de
// baixo desbotando conforme as novas as empurram. Só cabe porque o feed desceu para o FIM da coluna direita,
// onde ele ocupa a sobra e não empurra mais o cartão de massa nem o placar. ⚠️ ROWS e o `nth-child` que
// esconde o excesso têm que concordar: são o mesmo número escrito em dois lugares.
// HIT_TTL_TICKS (5 s): o carimbo de "quem me amoleceu" vale por esse tempo; depois disso o abate é só "eat".
// QUEUE_MAX/MAX_PER_FLUSH: uma supernova ou o fecho final do gás mata muita gente no MESMO tick — o feed
// manda no máximo 4 por lote e descarta as mais velhas, senão a tela vira parede.
// LEAD_*: trocar de líder só é notícia se o novo segurar o topo por 3 s E passar o antigo por 5% de massa E
// a sala não tiver anunciado nos últimos 20 s. Sem os três, dois gigantes empatados enchem a tela a 2 Hz.

// ── AVATAR (a skin "Retrato": a foto do jogador dentro da bolinha) ───────────
// O cliente recorta em círculo e reduz para SIZE, e a busca de qualidade do WebP desce até caber em
// MAX_BYTES. 12 KB porque um rosto 256² em WebP q0,8 dá 6–10 KB — e o teto é o que torna viável guardar os
// bytes no Postgres, que é o ÚNICO armazenamento durável do cluster (StatefulSet sem PVC, sem storage
// dinâmico). O upload é ≤13 KB, bem abaixo do 1 MB padrão do nginx: nada de infra nova.
export const AVATAR={SIZE:256,MIN:64,MAX_BYTES:12*1024,MIME:["image/webp","image/png"],FALLBACK_SIZE:128};
// chat de sala (Livre e Battle Royale solo) ou de equipe (Battle Royale em equipe), pelo `chat` do MODE.
// Sem histórico no servidor: quem entra não recebe o que já passou. RATE_MS/BURST ficam POR CIMA do balde
// de JSON que a sessão já tem (NET.RATE_JSON), porque aquele existe para proteger o servidor e este para
// não deixar um jogador encher a tela dos outros. FADE_MS: a linha some sozinha — o painel não pode virar
// uma parede permanente em cima do jogo.
export const VOICE={MAX_MS:5000,MIN_MS:300,CD_MS:3000,TALK_CD_MS:250,RATE_HZ:8000,MAX_BYTES:44000,ROOM_CPS:4,LISTENERS:8,DIST:4000,PAN:2000};
// TALK_CD_MS: intervalo mínimo entre dois avisos de "abri o microfone" (JSON `talk`, o que acende o ícone em
// cima do planeta no INSTANTE do Ctrl). Não é o cooldown da FALA (CD_MS): é só o anti-flood de quem martela a
// tecla — cada aviso vira um PLAYERS difundido para a sala inteira.
// áudio curto de push-to-talk (Ctrl): o servidor é RELAY PURO — valida tamanho/duração/cooldown e reenvia
// os bytes, sem decodificar e sem gravar nada. Equipe ouve sempre; no Livre ouvem os LISTENERS mais
// próximos dentro de DIST, com volume e estéreo pela distância (o mesmo cálculo dos efeitos).
// RATE_HZ/formato: µ-law 8 bits a 8 kHz mono = 8 000 B/s, então MAX_MS dá 40 KB (MAX_BYTES tem a folga).
// É 4× mais gordo que Opus e é de propósito: MediaRecorder grava webm/opus no Chrome/Firefox e mp4/aac no
// Safari, e o Safari NÃO decodifica webm — um clipe de Chrome sairia mudo lá. µ-law monta o AudioBuffer na
// mão e toca em qualquer navegador. O byte `codec` do fio já está reservado para trocar por Opus depois.
// MIN_MS mata o toque acidental no Ctrl; CD_MS e ROOM_CPS (clipes por segundo na sala) seguram o abuso.
// ── MOEDAS DA PARTIDA ────────────────────────────────────────────────────────
// Medido em produção com uma conta de 17 partidas: 692 moedas por partida contra um teto de 750. Ou seja,
// o teto não era teto — era SALÁRIO: todo mundo o batia sempre, e a diferença entre jogar bem e jogar mal
// desaparecia. Com `score/300` isso é aritmética: uma partida decente passa de 150 mil pontos, o que já
// dá 500 sozinho, e os abates viravam enfeite. A esse ritmo o catálogo inteiro (307 mil) saía em 445
// partidas, e uma lendária de 30 mil custava 43 — não é preço de item raro, é o de uma tarde.
// O divisor sobe para 1200, o teto cai para 200 e o abate deixa de valer dobrado. A conta passa a ser
// ~180/partida, e aí o teto volta a ser o que devia: o lugar aonde só a partida excepcional chega.
export const SCORE_COINS=(score,kills,botKills,durationS)=>Math.min(200,Math.floor(score/1200)+kills+botKills+(durationS>=300?15:0));
/**
 * Bônus de colocação do Battle Royale: lá o placar não é a massa, é ONDE você parou. Sem isto, morrer em 2º
 * de 50 pagaria igual a morrer em 49º — e a corrida pelo topo, que é o modo inteiro, não valeria nada.
 * Vitória vale pouco mais da metade de um teto de partida; do 10º para baixo a curva some depressa.
 * ⚠️ Estes números andam JUNTO com SCORE_COINS: se o Livre aperta e o BR não, o BR vira a fonte fácil.
 */
export const PLACE_COINS=(placement,players)=>{
  if(!placement||!players||placement<1)return 0;
  if(placement===1)return 120;
  if(placement<=3)return 60;
  if(placement<=10)return 30;
  return placement<=Math.ceil(players/2)?10:0;};

// ── TECLAS CONFIGURÁVEIS (dividir / ejetar) ──────────────────────────────────
// `KeyboardEvent.code`, não `key`: o code é a POSIÇÃO física da tecla, então o mesmo padrão funciona
// em teclado ABNT, QWERTY e AZERTY sem uma linha de exceção. A lista mora aqui porque TRÊS lados
// precisam da mesma verdade e uma cópia divergiria na primeira adição: a tabela da tela de opções
// (client/src/ui/prefsTable.js), o MAP do teclado (client/src/game/input/Keyboard.js) e a whitelist
// do PATCH /api/me/prefs (server/src/api/me.js) — fora dela o servidor descarta em SILÊNCIO.
// KeyF (atirar), KeyQ (trocar de arma), Control (falar) e as setas (trocar de câmera) ficam de fora
// de propósito: são fixas, e deixá-las escolhíveis criaria colisão sem ganho nenhum.
export const ACTION_KEYS=["Space","KeyW","KeyE","KeyD","KeyC","KeyZ","ShiftLeft"];
/** Nome da tecla na tela (é o que o HUD desenha em `#hud-cd`, então tem que caber em duas ou três letras). */
export const KEY_LABEL={Space:"ESPAÇO",KeyW:"W",KeyE:"E",KeyD:"D",KeyC:"C",KeyZ:"Z",ShiftLeft:"SHIFT"};

// ── PORTAIS DE JOGO (o cliente hospedado fora daqui) ──────────────────────────
// O mesmo cliente é publicado como .zip em GameDistribution, CrazyGames, Poki e itch.io, que o servem do
// domínio deles num iframe. Deles vem a obrigação de anúncio (preroll antes da partida e midroll entre
// partidas), e daqui vêm os números.
// ⚠️ Não são `tunables`: o painel /admin muda o que roda NESTE servidor, e um zip já assado não relê nada.
// MIN_AD_MS   intervalo mínimo entre anúncios; a própria GameDistribution sugere 2 min.
// SDK_MS      espera pelo script do portal. Ele é a primeira coisa que um bloqueador derruba, e o jogo
//             não pode ficar de portas fechadas por causa disso — vencido o prazo, joga sem anúncio.
// AD_MS       teto de um anúncio. `showAd` às vezes nem rejeita quando não há preenchimento: sem este
//             relógio o botão JOGAR ficaria pendurado para sempre, que é a pior falha possível aqui.
export const PORTAL={MIN_AD_MS:120000,SDK_MS:6000,AD_MS:45000};

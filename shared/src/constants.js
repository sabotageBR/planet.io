// ── CONSTANTES ÚNICAS (servidor e cliente importam daqui; nada duplicado) ─────
// Unidades: px, segundos, px/s. Passo fixo de 60 Hz.
// @ts-check
export const WORLD={w:9600,h:9600};
export const TICK_HZ=60,DT=1/60,SNAPSHOT_EVERY=3,LEADERBOARD_EVERY=30,SAMPLE_EVERY=30;
export const ROOM={MAX:30,BOTS:24,CODE_LEN:4,STOP_AFTER_MS:30000,REMOVE_AFTER_MS:35000,RESUME_GRACE_TICKS:600};
export const ROUND={TICKS:216000,BREAK_MS:15000,DAY_START_H:5,WARN_S:10,DAYS:4,FADE_MS:600};
// rodada de 1 h (216000 ticks a 60 Hz) = DAYS dias do relógio do espaço (dia de 15 min → 12 trocas de céu por sala),
// começando às DAY_START_H; a troca de tema é coberta por um fade de FADE_MS (client/src/theme/fade.js);
// no fim o mundo explode, define-se o campeão (maior planeta vivo) e o placar fica BREAK_MS antes da sala nova.
// WARN_S: segundos finais com a contagem gigante na tela.
// ── MODOS DE JOGO ────────────────────────────────────────────────────────────
// O modo é um DESCRITOR, não um `if` espalhado: sala, Sim e regras leem os mesmos campos daqui.
// LIVRE é o jogo de sempre (respawn, rodada de 1 h, todo mundo contra todo mundo). BATTLE ROYALE é
// último-vivo: LOBBY que enche até BR.PLAYERS, contagem regressiva, largada, sem respawn, zona que
// encolhe e armas. `bots` aqui é só o DEFAULT — o servidor continua deixando o env mandar
// (config.roomBots), senão trocar este arquivo mudaria o balanço da sala livre em produção.
export const MODE={FREE:0,BR:1};
export const BR={PLAYERS:50,TEAM_SIZES:[1,2,3,4],MIN_HUMANS:1,
  LOBBY_TICKS:1800,COUNTDOWN_TICKS:300,FILL_EXP:1.7,ARRIVE_JITTER:.55,
  SPAWN_RING:.44,START_AMMO:1,ROUND_TICKS:27000,WEAPON_P:.05,JOIN_GRACE_TICKS:120};
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
// ROUND_TICKS (7,5 min) é só a rede de segurança: a partida acaba por último-vivo bem antes, e a zona
// inteira (ZONE) fecha em 21 300 ticks ≈ 5 min 55 s.
export const ZONE={STAGES:6,R:[.62,.45,.32,.21,.12,.05,.015],
  HOLD_TICKS:[3600,2700,2100,1500,900,600],SHRINK_TICKS:[2400,2100,1800,1500,1200,900],
  DRIFT:.45,BURN:.06,WARN_TICKS:180,MIN_R:60,SHED_TICKS:24,SHED_SPEED:260,SHED_SPREAD:.85,SHED_MIN:1,SHED_N_DEATH:7};
// zona = círculo. R é o RAIO como fração de WORLD.w: começa em .62 (5 952 px — cobre o mapa, cujo
// centro→canto é 6 788) e fecha em .015 (144 px). Cada etapa i: HOLD_TICKS[i] parada em R[i], depois
// SHRINK_TICKS[i] interpolando até R[i+1]. DRIFT limita o deslocamento do centro a essa fração de
// (r−r_novo), então o círculo NOVO sempre cabe dentro do velho — ninguém é pego por uma zona que pulou
// para trás. BURN é a fração da massa por segundo fora dela: .06/s é 30× o PLAYER.DECAY, e leva uma peça
// de START_R (massa 900) ao piso MIN_PIECE_R (256) em ~21 s — tempo de correr, não de acampar. Ao contrário
// da queimadura de estrela, esta NÃO tem piso: no piso a peça morre (é o que fecha a partida).
// WARN_TICKS: aviso antes de cada fechamento começar.
// SHED_*: a massa queimada NÃO evapora — ela é ARRANCADA em pelotas, a cada SHED_TICKS (2,5×/s), jogadas
// para FORA (para longe do centro da zona) a SHED_SPEED. Ver quem está no gás perdendo pedaços é o aviso
// mais claro que existe, e a massa continua no mundo: quem tiver coragem de entrar atrás dela, leva. Ir
// buscar custa entrar MAIS FUNDO no gás — a direção para fora é o que faz o preço ser real.
// A cadência (e o piso SHED_MIN, uma pelota inteira) existem por causa do teto EJECT.MAX: soltar a cada
// tick, com meia sala no gás no fim da partida, estouraria a população e despejaria os fragmentos dos outros.
// Peça pequena queima devagar e solta raro; planetão solta o tempo todo — que é exatamente a leitura certa.
export const MODES=[
  {id:0,key:"free",label:"Livre",max:ROOM.MAX,bots:ROOM.BOTS,roundTicks:ROUND.TICKS,
    lobby:false,respawnBots:true,lastAlive:false,zone:false,weapons:false,chat:"room",teamSizes:[1],anonBots:false},
  {id:1,key:"br",label:"Battle Royale",max:BR.PLAYERS,bots:BR.PLAYERS,roundTicks:BR.ROUND_TICKS,
    lobby:true,respawnBots:false,lastAlive:true,zone:true,weapons:true,chat:"team",teamSizes:BR.TEAM_SIZES,anonBots:true},
];
// `anonBots`: no Battle Royale o flag BOT **não vai no fio** e os preenchimentos usam nome de jogador
// (BOT_NICKS), então a sala parece cheia de gente. É o padrão do gênero, e a alternativa — mostrar "◆ bot"
// ao lado de 40 dos 50 nomes — transformaria a partida numa tela de treino. O servidor continua sabendo
// quem é quem (economia, conquistas e `botKills` não mudam); quem não sabe é a TELA.
/** Descritor do modo (id inválido → Livre: o cliente antigo e o `?local=1` caem sempre no jogo de sempre). */
export const modeOf=id=>MODES[id]||MODES[MODE.FREE];
/** Capacidade da sala arredondada para baixo no tamanho de equipe. */
export const modeCap=(id,teamSize=1)=>{const m=modeOf(id),t=teamSize>0?teamSize|0:1;return m.max-m.max%t;};
export const PLAYER={START_R:30,MIN_PIECE_R:16,MAX_R:1000,MAX_PIECES:16,BOT_R:[24,58],DECAY:.002};
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
export const FOOD={COUNT:2500,R_MIN:6,R_MAX:15,SPECIAL_R:13,AMMO_P:.055,POWER_P:.045,HUES:12,MARGIN:40,NEAR_HAZARD_P:.22,NEAR_HAZARD_R:[260,620],
  TYPES:["dust","comet","star","rock","missile_ammo","powerup_merge","powerup_magnet","powerup_shield","w_burst","w_cluster","w_nova"]};   // índice = FOOD_TYPE
export const FOOD_TYPE={DUST:0,COMET:1,STAR:2,ROCK:3,AMMO:4,MERGE:5,MAGNET:6,SHIELD:7,W_BURST:8,W_CLUSTER:9,W_NOVA:10};   // 5 era o powerup de velocidade (removido); hoje é o de FUSÃO
// As armas entram no FIM (8..11) porque o enum é DENSO e três testes de faixa dependem da ordem:
// `type<=ROCK` ("é comida base, posso reescrever", world.js) e `type>=AMMO` ("é especial", world.js e o
// atlas do cliente). Índice novo no meio quebraria os três de uma vez, em silêncio.
// risco × recompensa: NEAR_HAZARD_P da comida nasce num anel NEAR_HAZARD_R em volta de uma estrela ou buraco negro, e sempre
// como coisa boa (cometa/rocha ou powerup) — chegar perto do perigo tem que valer a pena
// POP_DIST vale como MIRA: a rocha só entra (e estoura) se a trajetória dela passar a menos de r·POP_DIST do centro
// do planeta; de raspão ela ricocheteia com E (bola de sinuca), em vez de atravessar como acontecia antes.
/** Quantos níveis de escudo uma batida de rocha custa, pela velocidade de aproximação (0 = nem sente). */
export const shieldTierFor=vn=>{const T=ASTEROID.SHIELD_VN;return vn>=T[2]?3:vn>=T[1]?2:vn>=T[0]?1:0;};
export const ASTEROID={BELTS:4,PER_BELT:5,WANDERERS:18,R_MIN:30,R_MAX:62,MASS_R_MAX:80,BELT_RADIUS:[400,700],BELT_SPEED:[15,25],BELT_SPRING:.24,BELT_DAMP:.96,
  WANDER_SPEED:[20,60],POP_RATIO:1.1,POP_DIST:.82,CHIP:.04,CHIP_CD_TICKS:30,FEED:1.6,SHOOT_AT:72,SHOOT_R:36,CHILD_R:28,CHILD_SPEED:540,
  E:.85,E_AST:.9,SAFE_SPAWN:500,RESPAWN_TICKS:300,MAX_EXTRA:6,SHIELD_VN:[220,520,900],
  SMASH_MIN_R:34,SMASH_R:.45,SMASH_N:[3,5],SMASH_SPEED:520,BELT_SAFE:520};
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
export const STAR={COUNT:12,R:46,BURN:.30,RAM_REWARD:false,SWELL:1.75,ARM_K:.5,GROW_TICKS:120,LIFE_TICKS:[2400,4200],OLD_TICKS:480,RESPAWN_TICKS:600,HALO:2.2,
  SHATTER_MIN_R:24,SHATTER_N:[3,6],SHATTER_DIST:342,SHATTER_CD_TICKS:45,PUSH_TOUCH_DIST:160,
  NOVA_R:8,NOVA_SHATTER:.45,NOVA_PARTICLES:24,NOVA_FOOD:16,NOVA_FOOD_R:.3,NOVA_SPEED:[380,820],NOVA_PART_MASS:3,NOVA_LIFE_TICKS:900,AST_KICK:1500,PUSH_DIST:342,SAFE_SPAWN:700,MIN_SEP:1400,
  DRAG:1.4,HIT_PUSH:280,EJECT_PUSH:70,HITS_TO_SPLIT:3,HIT_CD_TICKS:30,SPLIT_N:3,SPLIT_R:.62,SPLIT_SPEED:520,SPLIT_BLAST:5,SPLIT_LIFE_TICKS:[900,1500]};
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
export const MISSILE={SPEED:720,TURN:.07,LIFE_TICKS:500,MAX_AMMO:3,R:11,SPAWN_CD_TICKS:600,HIT_SHRINK:.9,HIT_DEBRIS:5,DEBRIS_SPEED:540,SHATTER_N:[3,6],SHATTER_DIST:342,
  INTERCEPT_DIST:1100,ALERT_DIST:2600,AST_KICK:420,AIM_PICK:700,AIM_RANGE:2200};
// SPAWN_CD_TICKS: carência de 10 s a cada nascimento antes do primeiro tiro (vale para bot também). Sem ela o
// recém-nascido sai do spawn metralhando — não tem massa a perder e o míssil é a arma anti-gigante. É por TEMPO,
// não por tamanho: quem quiser atirar pequeno pode, só precisa sobreviver os 10 s primeiro. Vai no `self` do
// snapshot (fireCd, u16 ticks) para o HUD desenhar a contagem regressiva em cima do ícone da arma.   // INTERCEPT_DIST: míssil inimigo mirando em mim a menos disso vira o alvo do meu tiro; AST_KICK: Δv (px/s) dado a um asteroide r=R_MIN (escala R_MIN/r)
// ALERT_DIST: a que distância um míssil teleguiado mirando em mim já acende o alerta (~3,6 s de voo a SPEED).
// O aviso NÃO pode ser só do cliente: a AOI de um jogador pequeno tem meia-largura ~1250 px e o míssil nasce a
// até AIM_RANGE (ou a qualquer distância, sem mira), então ele apareceria na tela com menos de 2 s de sobra.
// Por isso a ameaça é medida no servidor e vai no `self` (threat/threatDir).
// tiro mirado (segurar o botão): trava na bolinha mais próxima do PONTEIRO (aimScore), entre as que estão a até
// AIM_RANGE px de quem atira e a menos de AIM_PICK px do cursor; sem nada perto do cursor o míssil sai reto.
// Era um CONE de ±0,45 rad escolhendo o mais próximo da PEÇA: o ângulo só abria o portão e mexer o mouse dentro
// dele não trocava o alvo. Agora o alvo segue o cursor e troca sozinho quando ele passa por cima de outra bolinha.
export const WEAPON={MISSILE:0,BURST:1,CLUSTER:2,NOVA:3};
export const WEAPONS=[
  {id:0,key:"missile",label:"Míssil",  rarity:"comum",  weight:0, food:FOOD_TYPE.AMMO,     ammo:MISSILE.MAX_AMMO,cd:0,  shatter:true},
  {id:1,key:"burst",  label:"Rajada",  rarity:"comum",  weight:44,food:FOOD_TYPE.W_BURST,  ammo:4,cd:20, shatter:false,shrink:.975,n:6,spread:.17,speed:1180,life:96},
  {id:2,key:"cluster",label:"Cacho",   rarity:"raro",   weight:30,food:FOOD_TYPE.W_CLUSTER,ammo:2,cd:60, shatter:true,n:4,splitD:560,spread:.55},
  {id:3,key:"nova",   label:"Nova",    rarity:"épico",  weight:14,food:FOOD_TYPE.W_NOVA,   ammo:1,cd:150,blast:900,push:520,core:.34},
];
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
export const POWERUP={TICKS:420,MAGNET_MAX_R:160,MAGNET_RANGE:5.5,MAGNET_PULL:170,MAGNET_NEAR:2.2,MAGNET_EJECT_A:900,MAGNET_AST:420,MAGNET_HEAVY:.45,MAGNET_STAR:.12,
  SHIELD_MAX_LEVEL:3,SHIELD_EVOLVE_TICKS:900};
// ímã: comida a d<r·MAGNET_RANGE anda a MAGNET_PULL·(1+(MAGNET_NEAR−1)·(1−d/alcance)) px/s; ejetados ganham MAGNET_EJECT_A px/s² (drag 3.7/s → ~240 px/s)
// MAGNET_MAX_R: acima desse raio a peça NÃO pega nem usa o ímã. O alcance é r·MAGNET_RANGE, então num planetão
// ele passava de 1500 px e sugava a tela inteira — o powerup deixava de ser uma ajuda e virava um aspirador.
// cometa/estrela (comida pesada) andam a MAGNET_HEAVY disso; a estrela do mundo se arrasta a MAGNET_STAR (é um perigo enorme vindo até você)
// asteroides ganham MAGNET_AST px/s² escalados por R_MIN/r (rocha pequena vem voando, rocha grande se arrasta): o ímã
// puxa a recompensa E o perigo — ligar o ímã perto de um cinturão é escolha, não acidente
// escudo: não expira; nível 1..SHIELD_MAX_LEVEL (N mísseis para destruir), sobe 1 nível a cada SHIELD_EVOLVE_TICKS sem ser atingido; cai ao disparar/dividir
// ímã e escudo valem POR PEÇA: só a parte que pegou o powerup se beneficia; ao fundir, os poderes das duas se juntam (escudo soma até o teto, ímã soma o tempo restante)
export const BOT={THINK_TICKS:[20,55],FLEE_RATIO:1.25,FLEE_DIST:760,HUNT_RATIO:1.3,HUNT_DIST:900,FOOD_DIST:520,MAX_PIECES:8,SPLIT_P:.06,FIRE_P:.014,
  HOLE_AVOID:1.3,STAR_FEAR:2.6,RESPAWN_SCORE:.3,SPAWN_GRACE_TICKS:420,SPLIT_REACH:780,AIM_CHANCE:.75,DIRS:8,WALL_MARGIN:340,MISSILE_FEAR:900,AST_FEAR:2.4,WAYPOINT_DONE:110,FLEE_STEP:760,
  STICK:1.28,HAZ_TTL:6,DANG_N:6,FIRE_CD:[50,130],FEED_CD:40,
  COMMIT:{hunt:90,flee:45,food:60,zone:0,hold:150,intercept:30,wander:40},
  HAND:{DIST:620,JITTER_STEP:.05,JITTER_MAX:.28,FLICK:[8,15],STOP_R:26,LEAD_MAX:1.15,IDLE_TURN:.06},
  HUNT:{ARC_DIRS:8,ARC_STEP:560,OPEN:.62,FLANK:.7,SPLIT_MARGIN:1.08,THIRD_R:900,TEAM_SIDE:.85,DODGE:1.05},
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
// São 295 aqui, mais os cinco formatos de `botNick`. Com 50 por sala isso é folga de sobra dentro de UMA
// partida, mas o número grande é para as partidas SEGUIDAS: com 96 bases o jogador via a mesma escalação
// de nomes toda vez, que denuncia tanto quanto repetir dentro da sala.
export const BOT_NICKS=[
  "Lucas","Pedro","Gabi","Rafa","Bia","Thiago","Mari","Caio","Duda","Vitor","Lele","Bruno","Nanda","Igor","Manu","Leo",
  "Ju","Felipe","Carol","Diego","Alice","Murilo","Sofia","Enzo","Lara","Davi","Isa","Otavio","Nina","Arthur","Cleo","Tom",
  "Zeca","Kiko","Nando","Dede","Binho","Teteu","Gugu","Lipe","Mila","Rick","Cacau","Juca","Bel","Nego","Tuca","Vivi",
  "Matheus","Gustavo","Larissa","Rodrigo","Camila","Fernando","Bruna","Ricardo","Paula","Andre","Jessica","Marcelo",
  "Renata","Vinicius","Amanda","Eduardo","Priscila","Guilherme","Tati","Rafael","Aline","Henrique","Debora","Fabio",
  "Natalia","Marcos","Luana","Alan","Simone","Wesley","Karol","Everton","Elis","Joao","Yasmin","Samuel","Livia",
  "Danilo","Nicole","Breno","Helena","Kaua","Antonia","Miguel","Valentina","Heitor","Cecilia","Bernardo","Maite",
  "Anthony","Agatha","Ryan","Rebeca","Erick","Milena","Kevin","Sabrina","Wallace","Taina","Jonas","Elaine",
  "Bibi","Fefe","Gigi","Lulu","Nene","Pipo","Tuti","Dudu","Fifi","Kaka","Mimi","Tico","Bento","Chico","Betinho",
  "Juninho","Neto","Sandro","Serginho","Toninho","Careca","Magrao","Loirinho","Moreno","Baiano","Mineiro","Gaucho",
  "Carioca","Paulista","Xandao","Nandinho","Rafinha","Duda2","Lelezinho","Biel","Yuri","Kelvin","Jean","Ronaldo",
  "ninja","dragao","lobo","tigre","corvo","raposa","panda","coruja","alpha","turbo","sombra","trovao","gelo","fenix",
  "kraken","vespa","cobra","falcao","urso","onca","piloto","capitao","mestre","doutor","chefe","rei","lorde","barao",
  "jacare","piranha","arara","tucano","jaguar","suricato","javali","morcego","escorpiao","aranha","formiga","abelha",
  "besouro","polvo","tubarao","enguia","baleia","golfinho","pinguim","foca","lontra","texugo","hiena","chacal",
  "leopardo","puma","gaviao","aguia","condor","albatroz","garca","pelicano","marreco","capivara","quati","tamandua",
  "pixel","glitch","turbo9","noob","pro","gamer","player","sniper","tank","rush","clutch","combo","hyper","mega",
  "rage","spawn","respawn","lagado","ping","fps","headshot","camper","tryhard","carry","smurf","boost","nerf","buff",
  "meta","kernel","patch","beta","hotfix","zerado","speedrun","noscope","tilt","spam","kite","poke","gank","farm",
  "jungle","supp","void","null","byte","hex","root","sudo","ctrl","esc","alt","cache","proxy","bug","combo9",
  "pastel","coxinha","brigadeiro","acai","tapioca","farofa","feijao","churrasco","pipoca","sorvete","goiaba","jabuti",
  "treta","zoeira","migue","perrengue","rolezinho","fominha","cascudo","sertao","zen","neo","max","ace","vex","jinx"];
/**
 * Apelido de preenchimento, determinístico pelo rng da sala. Mistura três formatos porque uma lista só de
 * nomes limpos também denuncia: gente de verdade usa número, underline e caixa maluca.
 * `usados` evita repetir (inclusive contra os nicks dos humanos que já estão na sala).
 */
export function botNick(rng,usados){
  for(let t=0;t<40;t++){
    const base=BOT_NICKS[rng.int(0,BOT_NICKS.length-1)],r=rng.next();
    const n=r<.34?base
      :r<.62?base+rng.int(2,99)
      :r<.78?base+"_"+rng.int(10,999)
      :r<.9?base.toUpperCase()
      :"xX"+base+"Xx";
    if(!usados.has(n.toLowerCase())){usados.add(n.toLowerCase());return n.slice(0,16);}}
  return("j"+rng.int(1000,999999)).slice(0,16);}
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
  equipe:["vem","to fraco","cuidado","atras de voce","me segue","toma massa","juntos","corre","espera","to indo"]};
export const BOT_TALK={ROOM_CD_TICKS:420,BOT_CD_TICKS:2400,MAX_PER_MATCH:3,P:{start:.35,kill:.22,morte:.3,zona:.18,poucos:.3,equipe:.28},TYPO_P:.12,QUEUE_MAX:12};
// ROOM_CD_TICKS: 7 s entre duas falas QUAISQUER da sala — sem isso um abate múltiplo vira coro. BOT_CD_TICKS:
// 40 s por bot. MAX_PER_MATCH: ninguém fala mais que 3 vezes na partida inteira. TYPO_P: de vez em quando
// escapa uma letra dobrada ou trocada, que é como gente digita com pressa.
/** Erra a digitação de um jeito plausível (letra dobrada ou trocada com a vizinha). @param {{next:()=>number,int:(a:number,b:number)=>number}} rng */
export function botTypo(rng,txt){
  if(txt.length<3)return txt;
  const i=rng.int(0,txt.length-2);
  return rng.next()<.5?txt.slice(0,i)+txt[i]+txt.slice(i):txt.slice(0,i)+txt[i+1]+txt[i]+txt.slice(i+2);}
export const CAM={BASE:64,EXP:.4,REF_W:1920,REF_H:1080,TAU_POS:.024,TAU_ZOOM:.158,AOI_FOOD_VIEW:.55};
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
export const NET={INPUT_HZ:30,KEEPALIVE_HZ:10,INTERP_DELAY_MS:100,INTERP_MAX_MS:150,EXTRAP_MAX_MS:100,SNAP_DIST:120,AOI_PAD:.3,AOI_PAD_OUT:.45,
  RATE_INPUTS:40,RATE_BURST:60,RATE_JSON:5,HEARTBEAT_MS:5000,DEAD_MS:15000,RESUME_MS:10000};
export const CHAT={MAX_CHARS:140,RATE_MS:1500,BURST:3,FADE_MS:9000,KEEP:40};
// chat de sala (Livre e Battle Royale solo) ou de equipe (Battle Royale em equipe), pelo `chat` do MODE.
// Sem histórico no servidor: quem entra não recebe o que já passou. RATE_MS/BURST ficam POR CIMA do balde
// de JSON que a sessão já tem (NET.RATE_JSON), porque aquele existe para proteger o servidor e este para
// não deixar um jogador encher a tela dos outros. FADE_MS: a linha some sozinha — o painel não pode virar
// uma parede permanente em cima do jogo.
export const VOICE={MAX_MS:5000,MIN_MS:300,CD_MS:3000,RATE_HZ:8000,MAX_BYTES:44000,ROOM_CPS:4,LISTENERS:8,DIST:3200,PAN:1600};
// áudio curto de push-to-talk (Ctrl): o servidor é RELAY PURO — valida tamanho/duração/cooldown e reenvia
// os bytes, sem decodificar e sem gravar nada. Equipe ouve sempre; no Livre ouvem os LISTENERS mais
// próximos dentro de DIST, com volume e estéreo pela distância (o mesmo cálculo dos efeitos).
// RATE_HZ/formato: µ-law 8 bits a 8 kHz mono = 8 000 B/s, então MAX_MS dá 40 KB (MAX_BYTES tem a folga).
// É 4× mais gordo que Opus e é de propósito: MediaRecorder grava webm/opus no Chrome/Firefox e mp4/aac no
// Safari, e o Safari NÃO decodifica webm — um clipe de Chrome sairia mudo lá. µ-law monta o AudioBuffer na
// mão e toca em qualquer navegador. O byte `codec` do fio já está reservado para trocar por Opus depois.
// MIN_MS mata o toque acidental no Ctrl; CD_MS e ROOM_CPS (clipes por segundo na sala) seguram o abuso.
export const SCORE_COINS=(score,kills,botKills,durationS)=>Math.min(500,Math.floor(score/300)+2*kills+botKills+(durationS>=300?25:0));
/**
 * Bônus de colocação do Battle Royale: lá o placar não é a massa, é ONDE você parou. Sem isto, morrer em 2º
 * de 50 pagaria igual a morrer em 49º — e a corrida pelo topo, que é o modo inteiro, não valeria nada.
 * Vitória dobra o teto normal de moedas; do 10º para baixo a curva some depressa.
 */
export const PLACE_COINS=(placement,players)=>{
  if(!placement||!players||placement<1)return 0;
  if(placement===1)return 250;
  if(placement<=3)return 120;
  if(placement<=10)return 60;
  return placement<=Math.ceil(players/2)?20:0;};

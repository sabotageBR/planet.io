// ── PARÂMETROS ALTERÁVEIS EM RUNTIME (painel /admin) ─────────────────────────
// A LISTA BRANCA é o mecanismo inteiro: nada fora dela é gravável, nem por engano, nem por um `key` vindo
// do corpo de uma requisição. Isto não é um `eval` com persistência — é um conjunto fechado de números.
//
// COMO ESCREVER CUSTA ZERO: `physics/world.js` faz `const PW=POWERUP` e lê `PW.MAGNET_MAX_R` DENTRO do laço
// de 60 Hz. Isso aliasa o OBJETO, não o valor — e os objetos de `constants.js` não são congelados. Então
// escrever `POWERUP.MAGNET_MAX_R = novo` é visto por todos os leitores no tick seguinte, sem indireção,
// sem chamada de função e sem um import novo em `physics/`. A alternativa (um `getTunable()` dentro do
// laço) é a única versão com custo por tick real, e não compra nada.
//
// ⚠️ ESCOPO — são TRÊS, e a diferença entre os dois últimos é o que decide se a chave é editável.
//   'server'  só o servidor lê. Seguro por construção.
//   'both'    a FÍSICA do cliente lê (`predict.js`). Mudar de um lado só faz a peça dar elástico acima de
//             `NET.SNAP_DIST`, então a rota do painel RECUSA (501) em vez de fingir que funciona.
//   'wire'    o cliente lê, mas NÃO é física: é enquadramento (câmera) ou arte. O servidor ENTREGA o valor
//             no JSON `room` (`wireValues()` abaixo), e o cliente o aplica sobre os objetos de
//             `constants.js` — que não são congelados, o mesmo aliasing que a física já usa. A assimetria
//             que essas chaves causam enquanto a mensagem não chega é visual e recuperável (uma borda sem
//             comida por um snapshot), nunca autoridade divergente. O precedente literal é o `days` de
//             `Room.roundInfo`, que existe exatamente porque um número do servidor era constante do cliente.
// ⚠️ `predict.js` importa `DT, WORLD, BLACKHOLE, EJECT, PLAYER` — e mais nada. É por isso que `CAM`/`ZOOM`
// podem ser 'wire' e `PLAYER.MAX_R` não pode.
//
// ⚠️ É POR PROCESSO, não por sala. Mudar o ímã muda para todas as salas do pod, inclusive uma no meio da
// rodada. Parametrizar por sala exigiria carregar um objeto de tunables por Room→Sim→World→rules, tocando
// toda assinatura da física e o predict — não vale por um punhado de números.
// ⚠️ `ENTRY_PANELS` é 'server' pelo mesmo motivo de `ROOM.MAX`: o servidor decide, e `/api/config` ecoa
// o valor só para a tela poder desenhar antes de existir sala — não é física, não precisa de `wire`.
// @ts-check
import {POWERUP,MISSILE,PLAYER,BR,STAR,STAR_LAYOUTS,ASTEROID,ZONE,BOT,BOT_LLM,BOT_TALK,ROUND,CHAT,TICK_HZ,CAM,NET,ZOOM,WORLD,ROOM,SPLIT,ENTRY_PANELS,ENTRY,FEED,PLATAFORMAS} from "./constants.js";

/** @typedef {{key:string,label:string,unit:string,scope:'server'|'both'|'wire',type:'num'|'opt'|'bool'|'multi',grupo:string,
 *   min?:number,max?:number,step?:number,options?:{v:string,label:string}[],onLabel?:string,offLabel?:string,def:any,
 *   read:()=>any,write:(v:any)=>void}} Tunable */

// ── CATEGORIAS ───────────────────────────────────────────────────────────────
// A lista cresceu para além do que se lê de uma vez, e uma tabela corrida põe o teto do ímã ao lado do
// jeito de falar dos bots como se fossem a mesma decisão. O grupo é campo do DESCRITOR, e não uma lista
// paralela na UI: parâmetro novo cai numa seção existente sem que o painel saiba que ele nasceu.
// A ORDEM daqui é a ordem das seções na tela; um grupo sem nenhum parâmetro simplesmente não é desenhado.
export const GRUPOS=[
  ['powerups','Powerups'],
  ['armas','Armas'],
  ['perigos','Perigos do mapa'],
  ['zona','Zona (Battle Royale)'],
  ['jogador','Jogador'],
  ['novato','Proteção do novato'],
  ['camera','Câmera e área de interesse'],
  ['sala','Salas'],
  ['morte','Morte e respawn'],
  ['chat','Chat'],
  ['bots','Fala dos bots'],
  ['entrada','Tela inicial'],
  ['modos','Tela de Modos'],
  ['hud','HUD e avisos'],
];

/** Um número inteiro guardado numa constante, com a unidade que o ADMIN entende (ver o do ímã). */
const num=(grupo,key,label,unit,scope,min,max,step,obj,campo,{para=v=>v,de=v=>v}={})=>({
  key,label,unit,scope,grupo,type:'num',min,max,step,def:de(obj[campo]),
  read:()=>de(obj[campo]),write(v){obj[campo]=para(v);}});

/**
 * Uma ESCOLHA entre opções fechadas — o primeiro tunable que não é número.
 * ⚠️ Ele não afrouxa nada: a lista branca continua sendo o mecanismo, e aqui há uma segunda lista branca
 * por dentro (as `options`), então o que chega do corpo da requisição só pode ser um dos ids declarados.
 * `min`/`max`/`step` ficam de fora de propósito: um `<select>` não tem faixa, e inventar uma faria o
 * painel desenhar um controle que mente.
 */
const opt=(grupo,key,label,scope,options,obj,campo)=>({
  key,label,unit:'',scope,grupo,type:'opt',options,def:obj[campo],
  read:()=>obj[campo],write(v){obj[campo]=String(v);}});

/**
 * Um interruptor liga/desliga — sem faixa, sem opções, só um booleano guardado numa constante.
 * ⚠️ `on`/`off` são os RÓTULOS dos dois estados, e existem porque o painel os tinha CRAVADOS como
 * "Exibindo"/"Oculto": eles nasceram para `ENTRY_PANELS.*` e já mentiam para `NET.IDLE_KICK`, um
 * interruptor cujo sentido não é exibir coisa nenhuma. O par de exibição continua sendo o PADRÃO, então
 * nenhum descritor existente muda de linha.
 */
const bool=(grupo,key,label,scope,obj,campo,{on='Exibindo',off='Oculto'}={})=>({
  key,label,unit:'',scope,grupo,type:'bool',onLabel:on,offLabel:off,def:!!obj[campo],
  read:()=>!!obj[campo],write(v){obj[campo]=!!v;}});

/**
 * VÁRIAS escolhas de uma lista fechada, guardadas numa STRING CSV — o quarto tipo.
 *
 * ⚠️ CSV E NÃO ARRAY, e a decisão é o que barateia tudo o mais. Com string, `admin_settings.value`
 * continua sendo a mesma forma do `opt` (jsonb `{v:'…'}`), o memo `aplicados.get(key)===v` de
 * server/src/tunables.js casa por VALOR — com array ele NUNCA casaria, e os 12–24 pods reaplicariam e
 * logariam a cada 30 s, para sempre — e o `detail:{value}` da auditoria continua legível.
 *
 * ⚠️ O valor é CANÔNICO: `canon` filtra pela lista declarada (segunda lista branca, como no `opt`),
 * tira repetição e ORDENA pela ordem de `options`. Sem isso, "a,b" e "b,a" seriam dois valores
 * diferentes para o mesmo estado e o memo acima deixaria de funcionar.
 */
const canon=(v,options)=>{
  const querido=new Set(String(v==null?'':v).split(',').map(x=>x.trim()).filter(Boolean));
  return options.filter(o=>querido.has(o.v)).map(o=>o.v).join(',');};
const multi=(grupo,key,label,scope,options,obj,campo)=>({
  key,label,unit:'',scope,grupo,type:'multi',options,def:canon(obj[campo],options),
  read:()=>canon(obj[campo],options),write(v){obj[campo]=canon(v,options);}});

/** @type {Tunable[]} */
export const TUNABLES=[
  // ── POWERUPS ──
  // O caso pedido: o admin digita MASSA (100 000), a física guarda RAIO (316). `mass = r²` é a convenção
  // do jogo inteiro, e a massa é o número que o jogador lê no HUD — pedir raio aqui seria pedir tradução.
  // Mexer nele muda só QUEM pode usar o ímã: o ALCANCE é `min(r*5.5, MAGNET_RANGE_MAX)` e já satura nos
  // 900 px absolutos em qualquer valor razoável.
  num('powerups','POWERUP.MAGNET_MAX_R','Massa máxima para usar o ímã','massa','server',2500,1000000,500,POWERUP,'MAGNET_MAX_R',
    {para:m=>Math.sqrt(m),de:r=>Math.round(r*r)}),
  num('powerups','POWERUP.AUTODEF_MAX','Cargas de auto-defesa acumuláveis','cargas','server',1,9,1,POWERUP,'AUTODEF_MAX'),
  num('powerups','POWERUP.TICKS','Duração do ímã','ticks','server',60,3600,30,POWERUP,'TICKS'),
  num('powerups','POWERUP.FEAST_TICKS','Duração do banquete','ticks','server',60,3600,30,POWERUP,'FEAST_TICKS'),
  // ── O KIT DE BOAS-VINDAS ──
  // Ditos em SEGUNDOS, com o par {para,de} — o mesmo molde de `BOT.SPAWN_GRACE_S` e de `ROUND.TICKS` em
  // minutos: o admin pensa "14 segundos", a física guarda 840 ticks. 840/60 e 600/60 são inteiros exatos,
  // então `resetTunable` (que escreve `para(def)`) faz o caminho de volta sem drift.
  // ⚠️ Os DOIS tunables acima ficam em 'ticks' de propósito. Trocar a unidade deles MANTENDO a chave faria
  // a reconciliação reinterpretar uma linha já salva em `admin_settings` (420 ticks lidos como 420
  // segundos), recusá-la por faixa, e o override sumir sozinho — com um warn no log e nada na tela.
  // ⚠️ Mínimo ZERO nos dois: desligar o kit tem que ser possível sem deploy.
  num('powerups','POWERUP.SPAWN_MAGNET_TICKS','Ímã com que se nasce','segundos','server',0,60,1,POWERUP,'SPAWN_MAGNET_TICKS',
    {para:sg=>Math.round(sg*TICK_HZ),de:t=>Math.round(t/TICK_HZ)}),
  num('powerups','POWERUP.SPAWN_FEAST_TICKS','Banquete com que se nasce','segundos','server',0,60,1,POWERUP,'SPAWN_FEAST_TICKS',
    {para:sg=>Math.round(sg*TICK_HZ),de:t=>Math.round(t/TICK_HZ)}),
  // "O dobro de ganho" do pedido, literalmente. ⚠️ Vale para os DOIS banquetes (o do chão e o de nascença):
  // é a mesma constante lida em rules.js, e dois multiplicadores seriam duas verdades que divergem na
  // primeira correção.
  num('powerups','POWERUP.FEAST_K','Quanto o banquete multiplica a comida','×','server',1,4,.5,POWERUP,'FEAST_K'),
  // ── ARMAS ──
  num('armas','MISSILE.MAX_AMMO','Munição máxima do míssil','mísseis','server',1,9,1,MISSILE,'MAX_AMMO'),
  num('armas','MISSILE.AMMO_OVER','Balas emprestadas pelo powerup +1','mísseis','server',0,3,1,MISSILE,'AMMO_OVER'),
  num('armas','MISSILE.SPAWN_CD_TICKS','Carência de tiro ao nascer','ticks','server',0,3600,60,MISSILE,'SPAWN_CD_TICKS'),
  // ⚠️ 'wire' e não 'server': a duração da trava é a metade VISÍVEL do tiro mirado — o anel que fica na
  // tela depois de soltar o botão sai de `MISSILE.AIM_HOLD_TICKS` lido do BUNDLE do cliente
  // (game/index.js). Com escopo 'server' o painel movia a trava real e não movia o anel: o jogador via 3 s
  // e o servidor contava outro número, sem nada na tela explicando. Ver RAIZES_WIRE.
  num('armas','MISSILE.AIM_HOLD_TICKS','Duração da mira travada','ticks','wire',0,900,30,MISSILE,'AIM_HOLD_TICKS'),
  // ⚠️ Os dois limiares da mira, em ms. 'wire' porque quem os lê é o CLIENTE (`input/actions.js`) e não a
  // física — o precedente é a linha acima, e `MISSILE` já está em RAIZES_WIRE (game/index.js), sem o que
  // `aplicaWire` daria `continue` e o painel diria 'salvo' para sempre.
  // ⚠️ As faixas não se cruzam de propósito: o limiar do DEDO tem que ficar acima do limiar do mouse,
  // senão o celular volta a armar a mira por acidente — que é o defeito que estes dois números existem
  // para fechar.
  num('armas','MISSILE.AIM_MS','Tempo até a mira armar (mouse)','ms','wire',80,400,10,MISSILE,'AIM_MS'),
  num('armas','MISSILE.AIM_MS_TOUCH','Tempo até a mira armar (toque)','ms','wire',420,1200,20,MISSILE,'AIM_MS_TOUCH'),
  // ── PERIGOS DO MAPA ──
  num('perigos','STAR.BURN','Massa que a estrela queima','fração','server',0,.9,.01,STAR,'BURN'),
  // Quem cabe DENTRO da estrela atravessa e se esconde lá (ver o porquê do 40 em `STAR.PASS_R`).
  // ⚠️ `wire` e não `server`: a estrela não existe em `predict.js`, mas o CLIENTE lê este número para
  // decidir de quem a cobertura da estrela sai da frente (`tapado` em layers/Hazards.js). Com `server`,
  // mudar o parâmetro faria o planeta ser tapado numa faixa e atravessar em outra.
  num('perigos','STAR.PASS_R','Raio máximo para atravessar a estrela','px','wire',0,80,2,STAR,'PASS_R'),
  // A ARTE da estrela — escopo `wire` porque quem desenha é o CLIENTE, e o servidor entrega o valor no
  // JSON da sala. Com `server` o painel diria "salvo" e a tela continuaria igual, para sempre.
  opt('perigos','STAR.LAYOUT','Arte da estrela','wire',STAR_LAYOUTS,STAR,'LAYOUT'),
  num('perigos','STAR.BURN_STUCK','Queimadura da estrela sem vaga de peça','fração','server',0,.95,.01,STAR,'BURN_STUCK'),
  num('perigos','ASTEROID.CHIP','Lasca do asteroide','fração','server',0,.5,.01,ASTEROID,'CHIP'),
  num('perigos','ASTEROID.CHIP_STUCK','Lasca do asteroide sem vaga de peça','fração','server',0,.6,.01,ASTEROID,'CHIP_STUCK'),
  // ── ZONA ──
  num('zona','ZONE.BURN','Queimadura do gás (base)','fração/s','server',.01,.5,.01,ZONE,'BURN'),
  num('zona','ZONE.BURN_K','Multiplicador do gás no círculo final','×','server',1,5,.1,ZONE,'BURN_K'),
  // ── JOGADOR ──
  num('jogador','PLAYER.DECAY','Decaimento de massa por segundo','fração/s','server',0,.02,.0005,PLAYER,'DECAY'),
  // 'both' fica declarado para o dia em que houver entrega ao cliente — e a rota recusa até lá, em vez de
  // gravar um número que só metade do jogo enxerga.
  num('jogador','PLAYER.MAX_R','Raio máximo de uma peça','px','both',100,2000,10,PLAYER,'MAX_R'),
  // ── A MASSA COM QUE SE NASCE, e são DUAS porque os modos não são o mesmo jogo ──
  // No painel elas são ditas em MASSA (a convenção do jogo inteiro: `mass = r²`, e é a massa que o jogador
  // lê no HUD) e a física guarda RAIO — o mesmo par `{para,de}` do teto do ímã.
  // ⚠️ NENHUMA DAS DUAS É O PISO DO DECAIMENTO. Esse continua sendo `PLAYER.START_R` (massa 900), que não é
  // tunable porque `decayPiece` roda dentro do `predict.js`. Nascer acima do piso e murchar de volta em
  // ~11,5 min sem comer é a regra de sempre, agora com um começo mais alto (ver o bloco em constants.js).
  // ⚠️ QUATRO LIMIARES MORAM DENTRO DESTAS FAIXAS, e passar por um deles muda o jogo em silêncio:
  //   1 600 (r=40) = `STAR.PASS_R` → acima disso o recém-nascido NÃO CABE MAIS dentro da estrela. O 40 foi
  //                  escolhido acima de 30 justamente para o abrigo servir a quem mais precisa dele.
  //   3 600 (r=60) = `SPLIT.MIN_R` e `EJECT.MIN_R` → daqui para cima o jogador nasce PODENDO dividir e
  //                  cuspir. É a MESMA alavanca do portão do dividir, e os dois não se giram no escuro.
  //   6 000        = `BOT.NOVATO_MASS` → daqui para cima a proteção do novato não vale nem no nascimento.
  //   100 000      = `POWERUP.MAGNET_MAX_R²` → daqui para cima `_spawnPiece` não dá mais o ímã de graça.
  // O mínimo é 400 (r=20) e não 256: 256 é `MIN_PIECE_R²`, o chão em que a peça MORRE no gás — nascer
  // exatamente no chão da morte é um estado que ninguém deveria conseguir pedir.
  num('jogador','PLAYER.SPAWN_R','Massa ao nascer e ao renascer (Livre)','massa','server',400,10000,100,PLAYER,'SPAWN_R',
    {para:m=>Math.sqrt(m),de:r=>Math.round(r*r)}),
  // ⚠️ O TETO DO BR NÃO É O MESMO DO LIVRE, e o motivo é geométrico: os 50 largam PRESOS no octógono
  // (`BR.CAGE_AP`). Em massa 900 eles ocupam 8,2 % da área dele; em 3 600, 33 %; em 10 000, 91 % — uma
  // pilha sólida que a contenção passaria a largada inteira desentalando. O teto é a gaiola falando, e
  // coincide com `SPLIT.MIN_R`: a maior largada possível é a que já pode dividir.
  // ⚠️ E ele mexe no GÁS: o tempo do gás base (.10/s) até o piso `MIN_PIECE_R` é ln(M/256)/.10 — 12,6 s em
  // massa 900 e 26,4 s em 3 600. Engordar a largada é, literalmente, dar mais fôlego no gás.
  num('jogador','BR.SPAWN_R','Massa na largada (Battle Royale)','massa','server',400,3600,100,BR,'SPAWN_R',
    {para:m=>Math.sqrt(m),de:r=>Math.round(r*r)}),
  // ── PROTEÇÃO DO NOVATO ──
  // Os três números de `rules.recemChegado` — a regra que impede um PREENCHIMENTO de engolir uma pessoa
  // que acabou de chegar. Ela vale só no LIVRE (no Battle Royale `zoneNow()` a desliga) e só de bot para
  // gente: entre pessoas nada muda, e continua valendo "passou por cima, morreu".
  //
  // ⚠️ ELES ESTÃO AQUI PARA PODEREM SER DESLIGADOS SEM DEPLOY, e o mínimo 0 dos dois primeiros é a
  // chave: `SPAWN_GRACE_S`=0 mata a graça por tempo (`tick-spawnTick<0` é falso) e `NOVATO_MASS`=0 mata a
  // razão de massa (`ms<0` é falso). Com os dois em zero a regra deixa de existir, e o preenchimento volta
  // a atropelar como qualquer outro planeta. É uma decisão de PRODUTO — a regra apaga um atropelamento que
  // o jogador não tinha como evitar, e em troca põe na tela um gigante ATRAVESSANDO alguém, que num .io
  // lê como defeito. Quem decide é o dono do jogo, olhando o painel de Retenção (mediana da primeira
  // vida, % que sai sem um abate, razão de massa do algoz), não o gosto de quem escreveu o código.
  // ⚠️ **DESLIGAR PELA METADE É PIOR QUE NÃO DESLIGAR**: a graça por tempo sozinha é um PENHASCO — no
  // instante em que ela vence, o novato passa de intocável a comida, e o dado mostrou o degrau (pico de
  // 6× nas mortes na faixa 15-19 s, 118 contra 19 na faixa anterior). Zerar só a razão de massa devolve
  // esse degrau em vez de devolver o jogo. As duas, ou nenhuma.
  // ⚠️ Escopo 'server', e não 'both', apesar de a regra morar em `physics/rules.js`: `predict.js` importa
  // `DT, WORLD, BLACKHOLE, EJECT, PLAYER` e nada mais — ele prevê as peças PRÓPRIAS e não decide quem come
  // quem, então não há física de cliente para divergir.
  // ⚠️ `bot.js:novatoProtegido` ESPELHA a regra e lê o MESMO objeto `BOT`, então o cérebro acompanha a
  // troca no mesmo tick. É isso que impede o pior estado possível: o bot perseguindo alguém que ele só
  // vai atravessar (um planetão colado no novato sem nada acontecer lê pior que ser comido).
  num('novato','BOT.SPAWN_GRACE_S','Tempo em que o preenchimento não come quem nasceu (0 desliga)','segundos','server',0,60,1,BOT,'SPAWN_GRACE_TICKS',
    {para:s=>Math.round(s*TICK_HZ),de:t=>Math.round(t/TICK_HZ)}),
  // ⚠️ A PRIMEIRA VIDA TEM RELÓGIO PRÓPRIO, e ele NÃO é interruptor: quem desliga a graça por tempo
  // continua sendo `SPAWN_GRACE_S` (zero ali zera as duas, ver `World._spawnPiece`). Este número só diz
  // quanto a primeira vida ganha a mais — ela é a única em que a pessoa ainda não viu o jogo funcionar,
  // e é a que o Player Fit da Poki mede. Pô-lo no mesmo valor das outras apaga a distinção sem apagar a
  // proteção, que é o ajuste intermediário que se vai querer antes de desligar qualquer coisa.
  num('novato','BOT.SPAWN_GRACE_1_S','O mesmo, na PRIMEIRA vida de cada jogador','segundos','server',0,180,5,BOT,'SPAWN_GRACE_1_TICKS',
    {para:s=>Math.round(s*TICK_HZ),de:t=>Math.round(t/TICK_HZ)}),
  num('novato','BOT.NOVATO_MASS','Até que massa a pessoa ainda conta como novato (0 desliga)','massa','server',0,60000,500,BOT,'NOVATO_MASS'),
  // ⚠️ CONTRA GENTE A RÉGUA É SÓ A RAZÃO DE MASSA, nunca a janela cega — ver o bloco de
  // `rules.recemChegado`. Ligado, um humano com `NOVATO_RATIO` vezes a massa de quem acabou de nascer
  // ATRAVESSA em vez de comer, durante a janela do nascimento; desligado, a proteção volta a ser só
  // contra preenchimento, que é como ela nasceu. É o tunable com mais chance de precisar voltar atrás
  // depressa: ele é o único da regra que muda o que acontece entre duas PESSOAS.
  bool('novato','BOT.NOVATO_HUMANO','A proteção também vale quando quem atropela é gente','server',BOT,'NOVATO_HUMANO',{on:'Vale',off:'Só contra preenchimento'}),
  // ⚠️ DIVIDIR É A MECÂNICA QUE MATA, E TAMBÉM A QUE MAIS RÁPIDO MATA QUEM NÃO SABE USÁ-LA. Um playtest
  // gravado do 1.22 (KR) mostrou o ciclo inteiro em 64 s: split no primeiro minuto → cacho de pedacinhos
  // → recolhido por dois adversários. Travado, o split só libera quando a graça acaba — ou seja também
  // pelo primeiro ABATE e pela MASSA, não só pelo relógio. ⚠️ Ele NÃO substitui `SPLIT.MIN_R`, que é o
  // portão de TAMANHO e continua valendo depois: são duas perguntas diferentes ("já sou grande?" e "já
  // sei jogar?"), e hoje elas discordam — com `SPAWN_R` 2100 e `MIN_R` 44 o jogador NASCE podendo
  // dividir, que é como o caso KR chegou a existir.
  bool('novato','BOT.NOVATO_SPLIT','O recém-nascido pode dividir durante a graça','server',BOT,'NOVATO_SPLIT',{on:'Pode',off:'Travado até a graça acabar'}),
  // ⚠️ A câmera do novato abre por `ps.zoomUntil`, o campo do powerup de zoom — ou seja a AOI afasta
  // JUNTO, pelo mesmo fator, e o anel extra vem com conteúdo. Nos playtests do 1.22 em retrato o novato
  // enxergava o próprio sprite e um predador colado; no desktop 16:9, o mesmo jogo mostrava comida em
  // volta. Desligar devolve o enquadramento padrão do agar.
  bool('novato','BOT.NOVATO_ZOOM','A câmera do recém-nascido mostra mais mundo','server',BOT,'NOVATO_ZOOM',{on:'Mais aberta',off:'Padrão'}),
  // ⚠️ A OUTRA METADE DO PRIMEIRO MINUTO: a proteção diz de quem o novato não morre, e isto diz o que ele
  // tem para COMER. Zero devolve o comportamento anterior (a presa existia só nos treze planetas da
  // semente, no tick 0, e sumia junto com eles); em 1 toda reposição nasce comível, o que enche a sala de
  // planetinhas e tira do placar o degrau de tamanhos que a abertura existe para contar.
  num('novato','ROOM.ISCA_P','Com que frequência o preenchimento novo nasce comível por um novato','fração','server',0,1,.05,ROOM,'ISCA_P'),
  // ⚠️ O SENTIDO É FÁCIL DE INVERTER: número MAIOR = MENOS proteção. Ele é o quanto o preenchimento precisa
  // ser maior para a regra o considerar atropelamento e mandá-lo ATRAVESSAR; abaixo disso ele come normal.
  // O piso útil é 1,33 e não 1: `EAT.RATIO` é 1,15 de RAIO, ou seja 1,32 de massa — abaixo disso nenhum
  // planeta engole ninguém, e o número não faria nada. 4 foi escolhido para deixar a briga apertada viva.
  // ⚠️ O PORTÃO DO DIVIDIR. Medido nos jogadores da Poki: o pico de massa da PRIMEIRA vida tem mediana
  // 2.214, e `MIN_R`=60 exige 3.600 — ou seja **64,6% nunca chegam a poder dividir**, e entre esses 97,8%
  // não fazem um único abate. Não é coincidência: `vmax = K/r^0,449` faz a presa ser sempre MAIS RÁPIDA
  // que o predador, então o salto é o único jeito de alcançar alguém em campo aberto (o mesmo argumento
  // que `bot.js:_plan` já usa). Com o portão acima do teto do novato, a mecânica central do jogo fica
  // trancada justamente para quem ainda está decidindo se fica.
  // ⚠️ Escopo 'wire', não 'server': quem lê `MIN_R` é `rules.applySplit` e `bot.js` (servidor), mas a DICA
  // do cliente (`game/dica.js`) precisa do mesmo número para não anunciar um botão que o servidor recusa.
  // `predict.js` importa `DT, WORLD, BLACKHOLE, EJECT, PLAYER` e não SPLIT, então isto não é física do
  // cliente — é o mesmo caso de CAM.K e STAR.PASS_R.
  // ⚠️ O PISO É 44 e tem motivo: o filho de um split tem `r/√2`, e abaixo de 44 ele nasceria MENOR que
  // `PLAYER.START_R` (30) — o jogador produziria de propósito uma peça menor que um recém-nascido.
  // ⚠️ E há uma dependência cruzada com `STAR.PASS_R`, hoje em 0 (esconderijo desligado): se ele voltar a
  // valer 40, `MIN_R` abaixo de 56,6 devolve o exploit de se picar para caber dentro da estrela — o
  // comentário de `constants.js:545` explica por quê. Mexer num obriga a conferir o outro.
  num('novato','SPLIT.MIN_R','Raio mínimo para o jogador poder dividir','px','wire',44,120,1,SPLIT,'MIN_R'),
  num('novato','BOT.NOVATO_RATIO','Quantas vezes maior o preenchimento precisa ser para atravessar em vez de comer','× a massa da pessoa','server',1.5,20,.5,BOT,'NOVATO_RATIO'),
  // ── CÂMERA E ÁREA DE INTERESSE ──
  // O botão de zoom. 'wire' porque o CLIENTE também chama `zoomFor` — com 'server' a AOI viria por um zoom
  // e a tela desenharia por outro, o que se lê como uma borda larga e vazia.
  // ⚠️ Afastar custa ao QUADRADO: peça, asteroide, estrela e míssil vêm pela visão INTEIRA do snapshot, sem
  // teto de contagem (só a comida tem os dois tetos). Mexer com o `?stats` aberto numa sala cheia.
  num('camera','CAM.K','Afastamento global da câmera (1 = padrão)','×','wire',.5,2,.05,CAM,'K'),
  // Só entra quando a tela é mais alta que larga (celular em pé) — ver o comentário de CAM.PORTRAIT_K em
  // constants.js. 'wire' pelo mesmo motivo de CAM.K: quem desenha é o cliente.
  num('camera','CAM.PORTRAIT_K','Afastamento extra da câmera no celular em pé (1 = sem extra)','×','wire',1,1.5,.02,CAM,'PORTRAIT_K'),
  // Estas seis são o ORÇAMENTO da AOI, não o enquadramento: só o servidor as lê, então são 'server' puro.
  num('camera','CAM.AOI_FOOD_VIEW','Fatia do mundo que a AOI da comida cobre','fração','server',.15,1,.01,CAM,'AOI_FOOD_VIEW'),
  num('camera','NET.AOI_FOOD_MAX','Teto de grãos de comida por sessão','grãos','server',50,900,25,NET,'AOI_FOOD_MAX'),
  // ⚠️ AOI_PAD_OUT tem que continuar MAIOR que AOI_PAD: é a histerese que impede a entidade de entrar e
  // sair da AOI a cada snapshot. Invertidos, tudo pisca — e isso não cabe no descritor, é regra entre duas
  // chaves. As faixas abaixo não se cruzam de propósito.
  num('camera','NET.AOI_PAD','Folga da AOI ao ENTRAR','fração','server',0,.4,.02,NET,'AOI_PAD'),
  num('camera','NET.AOI_PAD_OUT','Folga da AOI ao SAIR (histerese)','fração','server',.42,1.5,.02,NET,'AOI_PAD_OUT'),
  num('camera','ZOOM.GRACE_TICKS','Carência da AOI ao aproximar','ticks','server',0,300,5,ZOOM,'GRACE_TICKS'),
  num('camera','ZOOM.ABS_MAX','Teto absoluto do zoom aceito no fio','×','server',1,16,.25,ZOOM,'ABS_MAX'),
  // ── SALAS ──
  // Quanto dura uma sala do LIVRE, em MINUTOS — que é como a duração é dita em todo o resto do jogo (o dono
  // de sala escolhe minutos, `roundTicksOf` converte). O admin não tem por que fazer a conta de 60 Hz.
  // ⚠️ Vale para as salas CRIADAS daí em diante: a que já está rodando fixou a duração no construtor, e
  // encurtar a rodada de quem está no meio dela terminaria a partida no clique.
  // ⚠️ Só o LIVRE. No Battle Royale o tempo é a rede de segurança da ZONA (`roundTicksOf` recusa abaixo de
  // `ZONE_TOTAL_TICKS`), e uma sala que acaba por tempo antes de o círculo fechar é o único jeito de aquele
  // modo terminar sem ter decidido nada.
  // ⚠️ O DIA DO CÉU ACOMPANHA: `roundInfo()` manda `roundTicks/ROUND.DAYS`, então dobrar a duração dobra o
  // dia do relógio do espaço (30 min = 2 dias de 15 min). É consequência declarada, não efeito colateral —
  // o céu tem que virar um número inteiro de vezes por sala, senão a última troca fica pela metade.
  num('sala','ROUND.TICKS','Duração da sala no modo Livre','minutos','server',5,120,5,ROUND,'TICKS',
    {para:m=>Math.round(m*60*TICK_HZ),de:t=>Math.round(t/(60*TICK_HZ))}),
  // O TAMANHO DO MUNDO, e ele é o único tunable que NÃO vale na hora: escreve em `WORLD.LADO` e só o BOOT
  // copia para `WORLD.w/h`. Mudar com salas rodando não tem conserto — a zona já foi sorteada, os cinturões
  // já nasceram e os clientes já quantizaram na escala velha —, então a gravação é imediata e a aplicação
  // espera o pod subir. O rótulo diz isso, porque um parâmetro que "não faz nada" sem explicação é pior que
  // parâmetro nenhum.
  // ⚠️ Mexer nele NÃO reescala nada em volta: a comida, os cinturões, as estrelas e os tempos da zona
  // continuam nos números do build. Mundo maior com a mesma população = mapa mais vazio, e mundo menor =
  // mais apertado. É ferramenta de teste, não um botão de "mundo maior" pronto.
  num('sala','WORLD.LADO','Lado do mundo (vale no próximo boot do servidor)','px','server',4000,24000,500,WORLD,'LADO'),
  // ⚠️ Só o LIVRE: no Battle Royale a capacidade sai do modo (`modeCap`, que fecha no tamanho de equipe) e
  // quem preenche é o lobby, com a curva própria dele.
  // ⚠️ Valem para as salas CRIADAS daí em diante — a que já roda fixou os dois no construtor. BAIXAR o
  // número de bots não expulsa GENTE: o que sai é o excedente de preenchimento, aos poucos (um a cada
  // `ROOM.BOT_TRIM_TICKS`, o mais longe de qualquer humano) e antes disso por atrito, morrendo sem voltar.
  // ⚠️ `ROOM.BOTS` é a lotação de preenchimento, não a população: o alvo de agora é o que FALTA para a
  // sala parecer viva (`Room.botAlvo` = BOTS − humanos), então uma sala cheia de gente fica sem nenhum.
  num('sala','ROOM.MAX','Jogadores por sala no modo Livre (vale nas salas novas)','jogadores','server',2,60,1,ROOM,'MAX'),
  num('sala','ROOM.BOTS','Preenchimentos por sala no modo Livre (vale nas salas novas)','bots','server',0,60,1,ROOM,'BOTS'),
  // ── A SEMENTE: COM QUANTOS, E DE QUE TAMANHO, A SALA ABRE ──
  // O Player Fit da Poki reprovou cinco vezes com ~21% acima de 3 min (o critério pede 25%), e o
  // diagnóstico medido é DENSIDADE: um celular em pé enxerga 0,47% do mapa, o que dava 0,15 outros
  // planetas na tela contra os 0,67 do agar.io. Esta é a alavanca mais direta disso, e ela precisa ser
  // ajustável OLHANDO o painel de Retenção — não a cada deploy.
  // ⚠️ `BOT_SEED` acima de `ROOM.BOTS` não quebra nada (o laço de `topUpBots` para no alvo), mas a cota
  // sai truncada: a sala abre com `ROOM.BOTS` e o enchimento gradual fica sem o que fazer.
  // ⚠️ A soma dos dois `SEED_MIX` tem que caber em `BOT_SEED` — o que sobra é a ISCA (o tier comível), e
  // ela é a razão de a sala cheia valer alguma coisa: sem isca, 81% das primeiras vidas terminam sem um
  // abate. Somando MAIS que a semente, a isca simplesmente deixa de existir, em silêncio.
  num('sala','ROOM.BOT_SEED','Preenchimentos com que a sala ABRE','bots','server',0,40,1,ROOM,'BOT_SEED'),
  // ⚠️ CHAVE COM ÍNDICE, e ela funciona porque as fábricas só fazem `obj[campo]`: `SEED_MIX` é um ARRAY,
  // e passá-lo como `obj` com o índice no lugar do campo não pede mecanismo novo. O ponto na chave só
  // teria significado em escopo 'wire' (`aplicaWire` faz `key.split('.')`) — estas são 'server', e
  // nenhuma pode virar 'wire' sem antes ganhar raiz em RAIZES_WIRE (game/index.js).
  num('sala','ROOM.SEED_MIX.0','Gigantes na semente','bots','server',0,4,1,ROOM.SEED_MIX,0),
  num('sala','ROOM.SEED_MIX.1','Médios na semente','bots','server',0,10,1,ROOM.SEED_MIX,1),
  // ⚠️ AS DUAS FAIXAS NÃO SE CRUZAM, pelo precedente de AOI_PAD/AOI_PAD_OUT logo acima: elas escrevem nos
  // dois lados do MESMO array, e invertidas o `rng.int(a,b)` de `_agendaBot` devolve um tick ABAIXO de
  // `a` — o relógio da chegada vence no PASSADO e entra um preenchimento por tick.
  num('sala','ROOM.BOT_JOIN_MIN_S','Espera mínima entre duas chegadas','segundos','server',1,6,1,ROOM.BOT_JOIN_TICKS,0,
    {para:s=>Math.round(s*TICK_HZ),de:t=>Math.round(t/TICK_HZ)}),
  num('sala','ROOM.BOT_JOIN_MAX_S','Espera máxima entre duas chegadas','segundos','server',7,40,1,ROOM.BOT_JOIN_TICKS,1,
    {para:s=>Math.round(s*TICK_HZ),de:t=>Math.round(t/TICK_HZ)}),
  // ── OS DOIS TETOS DO "JOGAR (AUTO)" ──
  // Estes valem NA HORA (não são copiados por sala nenhuma): quem os lê são `matchmaking.escolheSala` e
  // `RoomManager.findOrCreateRoom`, a cada entrada. São o freio do agrupamento — sem eles a sala mais
  // cheia do cluster é um atrator e todo mundo cai no mesmo pod, que foi o travamento de 2026-09-05.
  // ⚠️ Teto de ENTRADA, nunca de permanência: baixá-los não tira ninguém de sala nenhuma, só muda para
  // onde vai o PRÓXIMO. E `ROOM.SOFT` acima de `ROOM.MAX` é inerte (o teto duro morde primeiro).
  num('sala','ROOM.SOFT','Jogadores por sala antes de o automático abrir outra','jogadores','server',2,60,1,ROOM,'SOFT'),
  // Na unidade "um jogador humano": a conta soma a sessão (1), o preenchimento (`ROOM.CUSTO_BOT`) e a
  // sala em si (`ROOM.CUSTO_SALA`), que são as três coisas que custam — e não custam igual (a medição
  // está em constants.js). Contar só humanos deixaria o lobby de BR com 2 pessoas e 48 bots parecer uma
  // sala vazia; contar bot como planeta inteiro faria o pod recusar gente que ele aguenta.
  num('sala','ROOM.SHARD_SOFT','Carga por shard antes de o automático mandar para outro','jogadores','server',10,200,5,ROOM,'SHARD_SOFT'),
  // ── INATIVIDADE ──
  // Quem deixa a aba aberta ocupa vaga, vira comida de graça e polui o placar e o kill feed de toda sala por
  // onde passa — e, antes disto, renascia SOZINHO a cada 5 s, para sempre. Os três relógios da sessão estão
  // explicados no bloco de NET em constants.js; o que interessa aqui é que este mede PESSOA, não socket.
  // ⚠️ O interruptor vem primeiro de propósito: isto EXPULSA gente, e o dia em que expulsar quem não devia
  // o conserto tem que ser um clique, não um deploy. Desligado, o carimbo de atividade continua sendo feito
  // (é barato) e ninguém é removido.
  bool('sala','NET.IDLE_KICK','Expulsar quem fica sem jogar','server',NET,'IDLE_KICK'),
  // ⚠️ Em MINUTOS, como o ímã é dito em massa: o admin pensa "três minutos", a constante guarda 180000.
  // Não vale para o morto no Battle Royale (lá ficar assistindo o pódio é o jogo) nem para o dono da sala
  // (a sala dele existe para esperar os amigos chegarem pelo link) — ver `Room._idleTick`.
  num('sala','NET.IDLE_MIN','Tempo sem ação até ser removido da sala','minutos','server',1,30,1,NET,'IDLE_MS',
    {para:m=>Math.round(m*60000),de:ms=>Math.round(ms/60000)}),
  // Quanto antes a faixa de aviso aparece. Ninguém pode ser removido sem ter tido a chance de reagir — e o
  // aviso some no primeiro gesto, então o preço de errar para mais é zero.
  num('sala','NET.IDLE_WARN_S','Aviso antes de remover por inatividade','segundos','server',5,60,5,NET,'IDLE_WARN_MS',
    {para:s=>Math.round(s*1000),de:ms=>Math.round(ms/1000)}),
  // ── MORTE E RESPAWN ──
  // Quanto a tela de morte espera antes de renascer SOZINHA no Livre, em SEGUNDOS. `wire`, não `server`:
  // quem decide QUANDO renascer é o cliente (o pedido `{t:"respawn"}` já era aceito a qualquer momento),
  // então o valor só precisa chegar até a tela — pelo mesmo canal que `CAM.K` já usa (JSON `room`).
  num('morte','ROUND.RESPAWN_S','Tempo até o respawn automático no Livre','segundos','wire',1,30,1,ROUND,'RESPAWN_TICKS',
    {para:s=>Math.round(s*TICK_HZ),de:t=>Math.round(t/TICK_HZ)}),
  // A ESPERA ANTES DA TELA. Zero devolve o comportamento antigo (o modal no mesmo tick da morte), e é por
  // isso que o mínimo é 0 e não 1: quem quiser o de antes tem como pedir. `wire` pelo mesmo motivo do
  // vizinho — é temporização de TELA, não autoridade de jogo.
  num('morte','ROUND.DEAD_DELAY_MS','Espera entre morrer e a tela de morte','ms','wire',0,4000,100,ROUND,'DEAD_DELAY_MS'),
  // ⚠️ O PISO NÃO É CONFORTO: é ele que impede o respawn automático de disparar no primeiro frame com um
  // par `{deadAt,armAt}` de uma vida anterior. Baixá-lo a zero devolve o defeito de "às vezes a tela de
  // morte não aparece" — que é o que ele existe para fechar. Ver client/src/ui/deadClock.js.
  num('morte','ROUND.DEAD_MIN_MS','Piso de tempo com a tela de morte na frente','ms','wire',0,8000,100,ROUND,'DEAD_MIN_MS'),
  // ── CHAT ──
  // Quanto da linha de uma PESSOA é mascarado. O padrão é `livre` por decisão de produto (xingar faz parte
  // de um .io); os portais continuam atendidos por silenciar/denunciar/kick, que valem em qualquer nível.
  // ⚠️ Isto NÃO afrouxa duas coisas, e o motivo está no cabeçalho de `server/src/palavrao.js`: o NICK
  // (que fica na tela a partida inteira) e o ÓDIO na fala de um BOT (que é o servidor gerando, não um
  // jogador falando). Subir para `pesado` antes de mandar um pacote a revisão é um clique, sem deploy.
  opt('chat','CHAT.FILTRO','Filtro de palavrão no chat','server',CHAT.FILTROS,CHAT,'FILTRO'),
  // ── FALA DOS BOTS ──
  // ⚠️ TAMANHO DA FALA. Os dois tetos não são só peneira: `montaSystem` os DITA ao modelo. Baixá-los aqui
  // encurta a linha gerada de verdade; sem isso a peneira apenas RECUSARIA o que veio grande e o bot
  // ficaria mudo (caindo no repertório fixo), que é o contrário do que se quer. Palavras e caracteres são
  // dois tetos porque nenhum sozinho basta: 12 palavras compridas passam de 85 chars, e 85 chars cabem
  // 20 palavrinhas — e é a linha COMPRIDA, em qualquer das duas medidas, que denuncia o bot.
  // ⚠️ VALE O MENOR DOS DOIS, e os rótulos dizem isso porque a confusão já aconteceu: subir só o teto de
  // CARACTERES para 140 não alonga nada enquanto o de PALAVRAS estiver em 12 — 12 palavras cabem em ~70
  // chars, então o de caracteres nunca chega a valer. Quem quiser fala mais longa mexe nos DOIS.
  num('bots','BOT_LLM.MAX_WORDS','Tamanho da fala: palavras (é o teto que morde primeiro)','palavras','server',4,20,1,BOT_LLM,'MAX_WORDS'),
  // ⚠️ O máximo é 140 porque a peneira faz `min(MAX_CHARS, CHAT.MAX_CHARS)` — 140 é o teto de QUALQUER
  // linha de chat, do bot ou da pessoa. Oferecer mais no painel seria oferecer um número inerte.
  num('bots','BOT_LLM.MAX_CHARS','Tamanho da fala: caracteres (só vale se as palavras couberem)','chars','server',30,140,5,BOT_LLM,'MAX_CHARS'),
  // QUEM ATENDE. `llm/ollama.js` lê `BOT_LLM.MODELO` a cada chamada — o mesmo aliasing que a física faz com
  // POWERUP —, então a troca vale na fala seguinte, sem reiniciar pod e sem recriar o cliente (o disjuntor,
  // o teto de gerações em voo e as métricas continuam os mesmos). ⚠️ As `options` são a LISTA do objeto de
  // constants, por REFERÊNCIA: o boot acrescenta a ela o modelo do env quando é um nome novo, e é isso que
  // impede o painel de abrir com um select sem o valor em uso.
  opt('bots','BOT_LLM.MODELO','Modelo da LLM','server',BOT_LLM.MODELOS,BOT_LLM,'MODELO'),
  // ⚠️ `auto` respeita o que cada modelo aceita; `nao` no gpt-oss deixa a sala inteira no repertório fixo
  // (medido: `content` vazio, HTTP 200, sem log). O rótulo da opção diz isso — é a única forma de o painel
  // não parecer quebrado quando alguém a escolhe.
  opt('bots','BOT_LLM.THINK','Raciocinar antes de falar','server',BOT_LLM.THINKS,BOT_LLM,'THINK'),
  // O TIPO de conversa: entra como uma frase a mais no SYSTEM (ver ESTILO_PROMPT em rooms/botChat.js).
  opt('bots','BOT_LLM.ESTILO','Tipo de conversa','server',BOT_LLM.ESTILOS,BOT_LLM,'ESTILO'),
  // A LÍNGUA, no molde EXATO do estilo: o id mora aqui (o painel desenha o `<select>` com ele) e a frase que
  // vai ao modelo é server-only (`IDIOMA_NOME` em rooms/botChat.js). `montaSystem` é remontado a cada
  // geração, então a troca vale na fala SEGUINTE, sem reiniciar pod nenhum — que é o "em tempo real" do
  // pedido. `auto` é o comportamento de sempre; ver o bloco em constants.js para o resto.
  opt('bots','BOT_LLM.IDIOMA','Idioma da fala dos bots','server',BOT_LLM.IDIOMAS,BOT_LLM,'IDIOMA'),
  num('bots','BOT_LLM.DIGITA_CPS','Velocidade de digitação dos bots','car/s','server',3,60,1,BOT_LLM,'DIGITA_CPS'),
  // ── QUÃO FALANTE É A SALA ──
  // "Conversam demais" e "conversam de menos" é julgamento que só se faz OLHANDO uma sala cheia de gente
  // real, e não se quer um deploy por clique. Estes quatro são os botões dessa régua, do mais grosso para
  // o mais fino: quantas réplicas uma conversa pode ter, com que frequência ela continua sem vocativo,
  // quantas gerações ela pode gastar e quanto tempo de silêncio faz um bot puxar assunto.
  num('bots','BOT_LLM.CADEIA_MAX','Réplicas máximas de uma conversa','elos','server',1,8,1,BOT_LLM,'CADEIA_MAX'),
  num('bots','BOT_LLM.CADEIA_SOLTA_P','Continuar a conversa sem citar ninguém','probab.','server',0,1,.05,BOT_LLM,'CADEIA_SOLTA_P'),
  num('bots','BOT_LLM.CONVERSA_MAX_GER','Teto de falas geradas por conversa','falas','server',1,20,1,BOT_LLM,'CONVERSA_MAX_GER'),
  num('bots','BOT_TALK.SILENCIO_TICKS','Silêncio até um bot puxar assunto','ticks','server',600,7200,60,BOT_TALK,'SILENCIO_TICKS'),
  // ── TELA DE MODOS (teste A/B de engajamento) ──
  // Puramente de EXIBIÇÃO — ver o comentário de `ENTRY_PANELS` em constants.js. Ligar/desligar não
  // afeta quem já está numa sala, com link direto ou convite de equipe; só decide se o CARTÃO
  // aparece na tela "Escolha o Modo".
  bool('modos','ENTRY_PANELS.FREE','Mostrar o cartão do Livre','server',ENTRY_PANELS,'FREE'),
  bool('modos','ENTRY_PANELS.BR','Mostrar o cartão do Battle Royale','server',ENTRY_PANELS,'BR'),
  bool('modos','ENTRY_PANELS.OWN','Mostrar o botão de Sala sua','server',ENTRY_PANELS,'OWN'),
  opt('modos','ENTRY_PANELS.ORDER','Ordem dos cartões (com os dois visíveis)','server',
    [{v:'free_br',label:'Livre à esquerda · Battle Royale à direita'},
     {v:'br_free',label:'Battle Royale à esquerda · Livre à direita'}],
    ENTRY_PANELS,'ORDER'),
  // ── TELA INICIAL ──
  // Ver o comentário de `ENTRY` em constants.js. Desligado, o campo de nome volta a nascer VAZIO e a
  // guarda `semNome()` volta a segurar quem tentar entrar sem nomear o planeta — ou seja, o
  // comportamento de sempre, inteiro, num clique.
  // ⚠️ Quem lê este valor é a rota `GET /api/nick`, e NÃO o `/api/config` como os painéis acima: o
  // config é disparado sem `await` no boot do cliente, e o campo já estaria preenchido quando a
  // resposta chegasse.
  bool('entrada','ENTRY.NICK_AUTO','Sortear um nick por padrão na tela inicial','server',ENTRY,'NICK_AUTO'),
  // ⚠️ Escopo 'server' e NÃO 'wire': a decisão vale ANTES de existir sala, então o JSON `room` chegaria
  // tarde demais. É o mesmo argumento já escrito para `ENTRY_PANELS`, e o mesmo canal: `/api/config`.
  // O primeiro tunable de MÚLTIPLA ESCOLHA do projeto — ver a fábrica `multi` lá em cima.
  multi('entrada','ENTRY.DIRETO','Entrar direto na partida (pular a guarda do nome) nestas plataformas',
    'server',PLATAFORMAS,ENTRY,'DIRETO'),
  // ── HUD E AVISOS ──
  // Os dois são 'wire' e não 'server'+/api/config: o feed e o card de convite só existem DENTRO de uma
  // partida, e o JSON `room` chega antes de qualquer snapshot. O molde do `entryPanels` existe porque a
  // tela "Escolha o Modo" é decidida ANTES de haver sala — não é o caso aqui.
  // ⚠️ São os PRIMEIROS booleanos de escopo 'wire' do projeto, e é por isso que `aplicaWire` precisou
  // ganhar o ramo `bool`: sem ele os dois seriam descartados em silêncio no cliente e o painel diria
  // "salvo" para sempre. Há teste travando isso (shared/test/tunables.test.js).
  bool('hud','FEED.SHOW','Mostrar o kill feed durante a partida','wire',FEED,'SHOW',{on:'Aparecendo',off:'Escondido'}),
  bool('hud','BR.INVITE_MUTE','Botão de silenciar no convite de Battle Royale','wire',BR,'INVITE_MUTE',
    {on:'Aparecendo',off:'Escondido'}),
];
export const TUNABLE_BY_KEY=new Map(TUNABLES.map(t=>[t.key,t]));
/**
 * O que o painel desenha: a lista com o valor de agora, o padrão, a faixa (ou as opções) e o GRUPO.
 * Nada é hardcoded na UI — nem os rótulos, nem as seções, nem que controle desenhar.
 */
export const listTunables=()=>TUNABLES.map(t=>({key:t.key,label:t.label,unit:t.unit,scope:t.scope,
  type:t.type,grupo:t.grupo,min:t.min,max:t.max,step:t.step,options:t.options,
  onLabel:t.onLabel,offLabel:t.offLabel,def:t.def,value:t.read()}));
export const readTunable=key=>{const t=TUNABLE_BY_KEY.get(key);return t?t.read():null;};
/**
 * Os valores das chaves 'wire', prontos para ir no JSON `room`. É um objeto plano `{chave: valor}` — quem
 * o aplica no cliente é `aplicaWire`, e a chave É o caminho (`CAM.K`), então acrescentar tunable 'wire'
 * não pede uma linha em lugar nenhum dos dois lados.
 */
export const wireValues=()=>{const out={};
  for(const t of TUNABLES)if(t.scope==='wire')out[t.key]=t.read();
  return out;};
/**
 * Aplica no CLIENTE o que o servidor entregou. Escreve direto no objeto de `constants.js` (eles não são
 * congelados), então vale para todo leitor no frame seguinte, sem indireção e sem import novo.
 * ⚠️ A lista branca continua sendo o mecanismo: só chaves DECLARADAS como 'wire' são aceitas, e um número
 * fora da faixa é descartado — a mensagem vem do nosso servidor, mas o cliente não tem por que confiar
 * mais nela do que o painel confia no corpo de uma requisição.
 * @param {Record<string,any>} vals @param {Record<string,any>} raizes  ex.: {CAM, ZOOM, STAR}
 */
export function aplicaWire(vals,raizes){
  if(!vals)return;
  for(const [key,v] of Object.entries(vals)){
    const t=TUNABLE_BY_KEY.get(key);if(!t||t.scope!=='wire')continue;
    const [raiz,campo]=key.split('.');const obj=raizes[raiz];if(!obj)continue;
    if(t.type==='opt'){if(t.options.some(o=>o.v===String(v)))obj[campo]=String(v);continue;}
    // ⚠️ `bool` e `multi` PRECISAM de ramo próprio, e a falta deles era um defeito MUDO: sem isto o
    // booleano caía no ramo numérico abaixo, onde `Number(true)` é 1 mas `t.min`/`t.max` são
    // `undefined` — toda comparação dá falso e o valor é DESCARTADO em silêncio. Não doía só porque
    // nenhum tunable 'wire' era booleano ainda; o primeiro que fosse cairia exatamente aqui.
    if(t.type==='bool'){obj[campo]=!!v;continue;}
    if(t.type==='multi'){obj[campo]=canon(v,t.options);continue;}
    const n=Number(v);if(Number.isFinite(n)&&n>=t.min&&n<=t.max)obj[campo]=n;}}
/**
 * Aplica (validando faixa, ou a lista de opções). Devolve o valor efetivo; lança se a chave não existe
 * ou o valor não serve. ⚠️ `out_of_range` é o código dos DOIS casos de propósito: a rota do painel já o
 * traduz, e um id de opção fora da lista é literalmente um valor fora do domínio declarado.
 */
export function applyTunable(key,valor){
  const t=TUNABLE_BY_KEY.get(key);if(!t)throw new Error('unknown_key');
  if(t.type==='opt'){
    const v=String(valor);
    if(!t.options.some(o=>o.v===v))throw new Error('out_of_range');
    t.write(v);return t.read();}
  if(t.type==='bool'){t.write(!!valor);return t.read();}
  // Múltipla escolha: um id fora da lista é DESCARTADO (não recusa a gravação inteira), porque o corpo
  // pode vir de um painel de build anterior que ainda oferecia uma opção que saiu. Lista vazia é estado
  // válido — "nenhuma plataforma" é uma resposta, não um erro.
  if(t.type==='multi'){t.write(valor);return t.read();}
  const v=Number(valor);
  if(!Number.isFinite(v)||v<t.min||v>t.max)throw new Error('out_of_range');
  t.write(v);return t.read();}
/** Volta ao valor de `constants.js` — capturado NO IMPORT, antes de qualquer mutação. */
export function resetTunable(key){
  const t=TUNABLE_BY_KEY.get(key);if(!t)throw new Error('unknown_key');
  t.write(t.def);return t.read();}

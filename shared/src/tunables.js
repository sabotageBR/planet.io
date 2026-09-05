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
import {POWERUP,MISSILE,PLAYER,STAR,STAR_LAYOUTS,ASTEROID,ZONE,BOT_LLM,BOT_TALK,ROUND,CHAT,TICK_HZ,CAM,NET,ZOOM,WORLD,ROOM,ENTRY_PANELS,ENTRY} from "./constants.js";

/** @typedef {{key:string,label:string,unit:string,scope:'server'|'both'|'wire',type:'num'|'opt'|'bool',grupo:string,
 *   min?:number,max?:number,step?:number,options?:{v:string,label:string}[],def:any,
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
  ['camera','Câmera e área de interesse'],
  ['sala','Salas'],
  ['morte','Morte e respawn'],
  ['chat','Chat'],
  ['bots','Fala dos bots'],
  ['entrada','Tela inicial'],
  ['modos','Tela de Modos'],
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

/** Um interruptor liga/desliga — sem faixa, sem opções, só um booleano guardado numa constante. */
const bool=(grupo,key,label,scope,obj,campo)=>({
  key,label,unit:'',scope,grupo,type:'bool',def:!!obj[campo],
  read:()=>!!obj[campo],write(v){obj[campo]=!!v;}});

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
  // ── ARMAS ──
  num('armas','MISSILE.MAX_AMMO','Munição máxima do míssil','mísseis','server',1,9,1,MISSILE,'MAX_AMMO'),
  num('armas','MISSILE.AMMO_OVER','Balas emprestadas pelo powerup +1','mísseis','server',0,3,1,MISSILE,'AMMO_OVER'),
  num('armas','MISSILE.SPAWN_CD_TICKS','Carência de tiro ao nascer','ticks','server',0,3600,60,MISSILE,'SPAWN_CD_TICKS'),
  num('armas','MISSILE.AIM_HOLD_TICKS','Duração da mira travada','ticks','server',0,900,30,MISSILE,'AIM_HOLD_TICKS'),
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
  // ⚠️ `ROOM.BOT_SEED` (6) é quantos abrem a sala: com `ROOM.BOTS` abaixo disso a sala nasce com menos
  // que a semente e o enchimento gradual não tem o que fazer.
  num('sala','ROOM.MAX','Jogadores por sala no modo Livre (vale nas salas novas)','jogadores','server',2,60,1,ROOM,'MAX'),
  num('sala','ROOM.BOTS','Preenchimentos por sala no modo Livre (vale nas salas novas)','bots','server',0,60,1,ROOM,'BOTS'),
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
];
export const TUNABLE_BY_KEY=new Map(TUNABLES.map(t=>[t.key,t]));
/**
 * O que o painel desenha: a lista com o valor de agora, o padrão, a faixa (ou as opções) e o GRUPO.
 * Nada é hardcoded na UI — nem os rótulos, nem as seções, nem que controle desenhar.
 */
export const listTunables=()=>TUNABLES.map(t=>({key:t.key,label:t.label,unit:t.unit,scope:t.scope,
  type:t.type,grupo:t.grupo,min:t.min,max:t.max,step:t.step,options:t.options,def:t.def,value:t.read()}));
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
  const v=Number(valor);
  if(!Number.isFinite(v)||v<t.min||v>t.max)throw new Error('out_of_range');
  t.write(v);return t.read();}
/** Volta ao valor de `constants.js` — capturado NO IMPORT, antes de qualquer mutação. */
export function resetTunable(key){
  const t=TUNABLE_BY_KEY.get(key);if(!t)throw new Error('unknown_key');
  t.write(t.def);return t.read();}

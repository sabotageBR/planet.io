// ── ROOM: {code, shard, sim, sessions, writer}; step() é chamado pelo Scheduler ─
// A sala tem RODADA: `roundTicks` ticks (10 min) valendo um dia inteiro do relógio do espaço (o cliente
// deriva hora e contagem do tick + `round` do JSON `room`). No fim o mundo explode: `sim.endRound()` fecha
// a partida de todos (persistência normal, cause 'round'), vai um `roundEnd` com campeão e placar, a sala
// é aposentada (ninguém mais entra) e o cliente entra sozinho numa sala nova depois de ROUND.BREAK_MS.
// A cada passo: sim.step() → PLAYERS se mudou → dead/rewards (listeners) → a cada SNAPSHOT_EVERY
// snapshots por sessão + EVENTs por AOI → a cada LEADERBOARD_EVERY o placar. Um writer por sala:
// cada encode devolve uma vista reutilizada; se um socket ficou com bytes pendentes trocamos de
// writer (o antigo fica com o socket até drenar) em vez de copiar a cada envio.
// @ts-check
import {SNAPSHOT_EVERY,LEADERBOARD_EVERY,TICK_HZ,NET,BOT,BOT_NAMES,botNick,botCountry,botSpawnR,BOT_CHAT,BOT_TALK,BOT_LLM,botTypo,ROUND,ROOM,PLAYER,MODE,modeOf,modeCap,BR,CHAT,NOTICE,VOICE,FEED,WEAPON} from '@warspace/shared/constants.js';
import {createWriter,encodePlayers,encodeLeaderboard,encodeEvent,encodeZone,encodeVoice} from '@warspace/shared/protocol/index.js';
import {rectHas} from '@warspace/shared/camera.js';
import {createRng} from '@warspace/shared/rng.js';
import {kdOf} from '@warspace/shared/levels.js';
// O lookup REVERSO do easter egg: dado o skinId de um jogador, QUEM ele está vestindo. O servidor já
// decidiu isso a partir do nick (persist/hooks.js) e nunca tinha contado a ninguém — ver `_quemE`.
import {eggDe} from '@warspace/shared/eggs.js';
import {createZone,stepZone,zoneAt,zoneNextIn} from '@warspace/shared/zone.js';
import {EVENT} from '@warspace/shared/protocol/constants.js';
import {Sim} from '../sim/Sim.js';
import {createSnapshotter} from '../net/snapshot.js';
import {createFeed,drenaFeed} from './feed.js';
import {pickPersona} from './botPersonas.js';
import {mascara} from '../palavrao.js';
// `aberta` é função PURA (classifica a mensagem), então vem por import e não pelo objeto injetado: só a
// LLM é dependência de verdade, e um `botChat` falso de teste não deveria precisar reimplementá-la.
import {aberta,citou,escolheAssunto} from './botChat.js';
const WRITER_SIZE=32768,BOT_SKINS=35;   // bots usam skins 0..34 (compráveis; nada de "earned"/secretas)
export class Room{
  /** @param {{code:string,shard:number,seed:number,hooks:any,log:any,metrics:any,config:{roomMax:number,roomBots:number},onRewards?:Function}} o */
  constructor({code,shard,seed,hooks,log,metrics,config,onRewards=null,mode=MODE.FREE,teamSize=1,botChat=null,
    botNames=null,roundTicks=null,private:priv=false,hostUserId=null,hostNick=null}){
    this.code=code;this.shard=shard;this.seed=seed;this.rng=createRng(seed);this.log=log;this.metrics=metrics;
    this.mode=modeOf(mode);this.modeId=this.mode.id;
    this.teamSize=this.mode.teamSizes.includes(teamSize)?teamSize:this.mode.teamSizes[0];
    this.sim=new Sim({seed,hooks,log,rng:this.rng,mode:this.modeId});
    /** @type {Map<number,import('../net/Session.js').Session>} */this.sessions=new Map();
    this.createdAt=Date.now();this.lastHumanAt=Date.now();this.running=false;
    // Livre: o env continua mandando (roomMax/roomBots), senão publicar este arquivo mudaria o balanço em produção.
    // Battle Royale: quem manda é o modo, e a capacidade fecha no tamanho de equipe (modeCap).
    this.max=this.mode.lobby?modeCap(this.modeId,this.teamSize):config.roomMax;
    this.botCount=this.mode.lobby?0:config.roomBots;
    this._proxBot=Infinity;   // quem agenda a 1ª chegada é o `start()`; antes dele ninguém entra
    // ⚠️ `roundTicks!=null`, NUNCA `roundTicks||…`: **0 é o valor de SEM FIM**, e o `||` o transformaria em
    // silêncio na rodada do env. É a mesma armadilha do `config.roundTicks||ROUND.TICKS` que já estava aqui.
    this.roundTicks=roundTicks!=null?roundTicks:(this.mode.lobby?this.mode.roundTicks:(config.roundTicks||ROUND.TICKS));
    // ── SALA COM DONO ────────────────────────────────────────────────────────────────────────
    // `private`: fora do automático e de toda listagem pública — entra-se só pelo código, que É o convite
    // (o mesmo contrato do lobby de equipe). `hostUserId` é a identidade do dono: a CONTA, e não o hash do
    // token como no Party, porque só conta registrada pode ser dona e porque o userId sobrevive à troca de
    // aba, de token e a uma reconexão. `bans` vive e morre com a sala — ban de sala, sem banco e sem TTL.
    // ⚠️ `Number(...)`: o id de `users` é BIGINT e o driver do Postgres o entrega como STRING, enquanto
    // `session.userId` chega do hook já convertido (persist/hooks.js faz `Number(u.id)`). Sem normalizar,
    // `'53'===53` é falso e o dono da sala simplesmente NÃO seria dono — sem erro nenhum, só um painel que
    // nunca aparece.
    this.private=!!priv;this.hostUserId=hostUserId==null?null:Number(hostUserId);this.hostNick=hostNick||null;this.hostLeftAt=0;
    this.holdUntil=hostUserId?Date.now()+ROOM.HOST_HOLD_MS:0;
    /** @type {Map<string,{userId:number|null,key:string|null,nick:string,at:number}>} */this.bans=new Map();
    // handle OPACO do jogador para o painel do dono. Nunca o slot (recicla — é o 409 `slot_changed` que o
    // painel do admin precisa tratar), nunca o sessionId nem o resumeToken (são as duas metades da credencial
    // de `resume`), nunca a chave do token.
    this._pid=0;
    this.lobbyTicks=config.lobbyTicks||BR.LOBBY_TICKS;   // env LOBBY_TICKS: testar a largada sem esperar 30 s
    // lobby: ninguém está no MAPA ainda. `lobbyUntil` é a janela em que os humanos que procuram battle
    // royale caem juntos; `startsAt` só é escrito quando a contagem regressiva começa (0 = ainda enchendo).
    this.phase=this.mode.lobby?'lobby':'live';this.lobbyStart=0;this.lobbyUntil=0;this.startsAt=0;this.nextBotAt=0;this.zone=null;
    this.usedNicks=new Set();this.lobbyAt=0;this.flagsDirty=false;this.digitaFila=[];
    // ninguém tem peça no lobby, mas a paz fica ligada como cinto de segurança: se um dia alguém nascer
    // cedo por engano, não vira almoço antes de a partida existir
    this.sim.world.peace=this.phase==='lobby';
    /** @type {Map<string,number>} código de party → equipe (para os amigos caírem juntos) */this.parties=new Map();
    this.roundStart=0;this.over=false;this.endedAt=0;this.endReason='time';this.champion=null;this.voiceAt=0;this.voiceN=0;this.botTalkAt=-1e9;/** @type {string[]} */this.ditas=[];
    // fala gerada (Ollama): opcional em tudo — sem ela a sala volta ao repertório fixo de BOT_CHAT
    this.botChat=botChat;this.botNames=botNames;this.mencaoAt=-1e9;this.ultimoBot=null;
    this._paisBot=null;   // o país que veio junto do apelido do balde, entre `_botNome` e `_nasceBot`
    /**
     * Quantos preenchimentos VIVOS de cada bandeira (ver ROOM.PAIS_TETO_DIV). É por SALA porque a
     * diversidade é uma propriedade da MESA: o balde de apelidos é de processo e não sabe quem está onde,
     * e `botCountry` sorteia cada bot de forma independente. Sobe em `_nasceBot` e desce em `trimBots` —
     * o bot que MORRE no Livre renasce no mesmo `gp`, com a mesma bandeira, então não passa por aqui.
     * @type {Map<string,number>}
     */
    this.paisesBot=new Map();
    /**
     * ORÇAMENTO DA CONVERSA. A cadeia longa transformou UMA linha de humano em várias gerações: com
     * CADEIA_MAX=5 e coro de até 3, uma frase podia pedir 15. O teto por BOT não segura (são bots
     * diferentes) e MAX_INFLIGHT_ROOM também não — ele só ENFILEIRA, e a fila drena. Quem segura é este.
     * É UM registro, não um Map: o chat da sala é UM fluxo, e duas conversas de bots correndo em paralelo
     * por cima do mesmo jogo é exatamente o ruído que o resto do arquivo evita.
     * `ate` é o tick em que a sala volta a aceitar CORO novo; menção dirigida nunca passa por ele.
     * @type {{n:number,gastas:number,teto:number,ate:number,solta:boolean}}
     */
    this.conversa={n:0,gastas:0,teto:0,ate:0,solta:false};
    // O relógio do SILÊNCIO, para a INICIATIVA. `chatLog` carrega `at` em MILISSEGUNDOS e todo o resto da
    // fala é TICK — misturar os dois é exatamente como se erra isto.
    this.falaAt=0;this.iniciativaAt=-1e9;this.iniciativas=0;
    /** @type {{name:string,text:string,team:number,bot:boolean}[]} últimas CHAT.KEEP linhas: é o que a LLM lê como conversa */
    this.chatLog=[];
    /** Marcos do kill feed (troca de líder, BIG CRUNCH): o orçamento das linhas de SISTEMA. */
    this.feed=createFeed();
    /**
     * As últimas mortes, já em texto. O kill feed é a única coisa que a sala INTEIRA vê ao mesmo tempo, e
     * era justamente o que a fala dos bots não sabia: eles comentavam o que acontecia com ELES e ficavam
     * mudos sobre o que todo mundo tinha acabado de assistir. O anel é escrito no difusor, onde os slots
     * viram nome sem custo nenhum, e lido só quando há prompt para montar.
     * @type {string[]}
     */
    this.feedLog=[];this.feedAt=-1e9;   // quando a última morte entrou: é o que separa fofoca FRESCA de história velha
    /**
     * FILA DE FALA AGENDADA. Só transporta kinds CONVERSACIONAIS (`mention`, `coro`, `cadeia`) — os
     * gatilhos de EVENTO continuam sendo do instante (`sim.botTalk` é esvaziado todo tick, como sempre).
     * A diferença é que 0,5–3 s numa RESPOSTA não é atraso: é a pessoa digitando. Um "peguei!" três
     * segundos depois do abate, esse sim seria comentário atrasado — e por isso não passa por aqui.
     * Agendado por `atTick`, drenado dentro do step(): nada de setTimeout, que não é determinístico, não
     * é testável com o rng da sala e não revalidaria nada.
     * @type {{atTick:number,pushAt:number,slot:number,gp:any,g:any,fallback:Function}[]}
     */
    this.falaFila=[];
    this.gerando=0;                 // gerações em voo NESTA sala (o teto global é do processo)
    /** @type {Set<string>} personas já sorteadas nesta sala (não repetir enquanto houver pool) */
    this._personas=new Set();
    /** @type {Map<number,{userId:number,v:string}>} quem nesta sala tem foto (skin "Retrato") */
    this.avatars=new Map();
    /**
     * PLACAR DA SALA: quem PARTICIPOU da rodada, e não quem sobrou no fim.
     * @type {Map<string,{key:string,name:string,registered:boolean,skinId:number,level:number,isBot:boolean,
     *   lives:number,kills:number,deaths:number,food:number,score:number,mass:number,slot:number,left:boolean}>}
     *
     * Existe porque `Sim.endRound` itera `sim.players`, e ali só está quem continua no mundo: `Room.leave`
     * chama `sim.remove(slot)`, o housekeeping cai no mesmo lugar e — no Livre — MORRER E RENASCER é
     * `leave` + `join` num slot NOVO. Sem isto, uma rodada de 30 min termina sem metade dos participantes,
     * e quem jogou 25 min some do pódio por ter fechado a aba no fim.
     */
    this.roster=new Map();
    this.writer=createWriter(WRITER_SIZE);this.snapshotter=createSnapshotter(this);this._botName=this.rng.int(0,BOT_NAMES.length-1);this.onRewards=onRewards;
    this.sim.on('death',info=>{
      // ANTES de qualquer coisa: a vida acabou, e é agora que ela entra no placar da sala. Sem isto, quem
      // morre e renasce no Livre perderia tudo o que fez na vida anterior.
      const gpm=this.sim.players.get(info.slot);if(gpm)this._rosterFold(gpm);
      const s=this.sessions.get(info.slot);if(!s)return;
      s.sendJson({t:'dead',by:info.by,bySlot:info.bySlot,byHole:info.byHole,byZone:info.byZone,score:info.score,maxMass:info.maxMass,kills:info.kills,durationS:info.durationS,placement:info.placement,players:info.players});
      // Livre: a câmera fica PARADA onde o jogador morreu (`slot:-1` → a AOI congela na última posição) —
      // ali a partida não tem fim nem placar para acompanhar, e sair passeando atrás da tela de morte
      // desorienta. Battle Royale mantém o espectador: assiste quem te matou, ou o companheiro vivo.
      // Nos dois casos as setas ‹ › (spectatePick) continuam funcionando para quem quiser seguir alguém.
      this.spectateTargetFor(s,this.mode.lastAlive?info.bySlot:-2);});
    this.sim.on('rewards',({slot,sessionId,rewards})=>{const s=this.sessions.get(slot);
      if(s&&s.sessionId===sessionId)s.deliverRewards(rewards);else if(this.onRewards)this.onRewards(sessionId,rewards);});}
  // ── ciclo de vida ──
  start(){if(this.running)return;this.running=true;
    // A sala abre com POUCOS e vai enchendo (ver ROOM.BOT_SEED): quinze planetas nascendo no mesmo tick
    // era o jeito mais rápido de dizer ao jogador que aquilo ali não é gente.
    this.topUpBots(-1,ROOM.BOT_SEED);this._agendaBot();}
  stop(){this.running=false;}
  /**
   * @param {number} team @param {number} max quantos podem nascer AGORA (o resto fica para a chegada gradual)
   * O TAMANHO sai daqui porque só aqui se sabe quantos bots a sala já tem: `have` é o índice que faz a cota
   * de `botSpawnR` funcionar sem que este laço precise saber se está semeando (start) ou completando
   * (_chegadaBots) — os `ROOM.BOT_SEED` primeiros da sala SÃO a semente, por definição.
   * ⚠️ `f` decai com o tick da SALA, não com o relógio de parede: uma sala parada pelo ceifador (30 s sem
   * humanos) congela o tick, e ao religar ela volta a ser "nova" para quem chega — que é o certo.
   * ⚠️ E é zero fora do Livre: no Battle Royale quem preenche é o LOBBY (`fillTo`), que chama `_nasceBot`
   * sem `r` e continua com a faixa de sempre.
   * ⚠️ `have` só serve de índice porque `botCount()` NUNCA cai no Livre: `trimBots` é só do lobby
   * (`join`), o painel do dono não enxerga preenchimento e o bot morto RENASCE no mesmo slot. Se algum
   * dos três mudar, `have` volta a ficar abaixo de `BOT_SEED` e nasceria um gigante no minuto 25 — mas o
   * `f` do enchimento já estaria em zero a essa altura, e é ele o cinto de segurança.
   */
  topUpBots(team=-1,max=Infinity){let have=this.sim.botCount(),n=0;
    const janela=this.mode.respawnBots?1-this.sim.tick/ROOM.SEED_WINDOW_TICKS:0,vagas=this.botCount-ROOM.BOT_SEED;
    for(;have<this.botCount&&n<max;have++,n++){
      // a SEMENTE é a abertura por definição (só o relógio a limita); da sétima em diante manda o MENOR
      // entre o relógio e o quanto ainda falta encher — sala cheia é sala cheia em qualquer ritmo.
      const enche=vagas>0?(this.botCount-have)/vagas:0;
      const f=have<ROOM.BOT_SEED?janela:(janela<enche?janela:enche);
      this._nasceBot({name:this._botNome(),team,r:botSpawnR(this.rng,have,f)});}
    return n;}
  _agendaBot(){this._proxBot=this.sim.tick+this.rng.int(ROOM.BOT_JOIN_TICKS[0],ROOM.BOT_JOIN_TICKS[1]);}
  /**
   * UM preenchimento entrando, de tempos em tempos, até o alvo. Roda dentro do `step` e é O(1) enquanto a
   * sala está cheia — `botCount()` é um contador, não uma varredura.
   * ⚠️ No Livre o bot RENASCE quando morre (`mode.respawnBots`), então a população não cai e isto se
   * esgota sozinho depois que a sala enche: não é um relógio que fica acordando para sempre.
   */
  _chegadaBots(){
    if(this.sim.tick<this._proxBot||this.sim.botCount()>=this.botCount)return;
    this.topUpBots(-1,1);this._agendaBot();}
  /**
   * O nome de um preenchimento. `realNicks` (os dois modos) usa o gerador de APELIDOS — "trovao_137",
   * "xXzecaXx", "Bia" —, que é o que faz a sala parecer cheia de gente. Os 60 nomes temáticos de BOT_NAMES
   * ("Nebulox", "Cassiona") ficam de reserva: eles denunciavam o preenchimento pelo nome, mesmo quando o
   * resto do jogo não denunciava. `usedNicks` já carrega os nicks dos humanos, então não há colisão.
   */
  /**
   * O apelido de um preenchimento. Ponto de entrada ÚNICO — cobre o Livre (`topUpBots`) e o lobby do
   * Battle Royale (`fillTo`/`fillStep`) de uma vez.
   * O BALDE primeiro (server/src/rooms/botNames.js): apelidos escritos por LLM, que parecem de gente de um
   * país de verdade em vez de sorteios de uma lista fixa. Ele devolve `null` o tempo todo — sem OLLAMA_URL,
   * com o disjuntor aberto ou com o balde vazio — e aí vale `botNick`, que é o CHÃO e continua sendo a
   * única verdade offline (o `?local=1` importa `shared` e não tem servidor com quem falar).
   * ⚠️ `botNick` registra em `usedNicks` por DENTRO (constants.js); o caminho do balde tem que registrar
   * aqui, senão dois preenchimentos saem com o mesmo nome — e o placar com nome repetido é justamente o
   * que denuncia a farsa.
   * ⚠️ DETERMINISMO: servir do balde PULA os 2–3 sorteios que `botNick` consome, e todo o stream do rng da
   * sala desloca junto (`botSpawnR`, `skinId`, `_nivelBot`, `pickPersona`, `botCountry`). Isso é
   * inofensivo porque o balde só existe COM a LLM configurada, e a suíte roda sem OLLAMA_URL: sem ela o
   * caminho é byte a byte o de sempre, e é por isso que os testes de semente continuam valendo. Quem um
   * dia ligar a LLM no ambiente de teste vai ver `roombots.test.js` mudar — e o motivo está escrito aqui.
   */
  _botNome(){
    if(!this.mode.realNicks)return BOT_NAMES[this._botName++%BOT_NAMES.length];
    const g=this.botNames?this.botNames.take(this.usedNicks,this._paisesCheios()):null;
    if(g){this._paisBot=g.pais;this.usedNicks.add(g.nick.toLowerCase());return g.nick;}
    this._paisBot=null;   // ⚠️ zerar SEMPRE: sem isto um bot herdaria o país do bot anterior
    return botNick(this.rng,this.usedNicks);}
  /**
   * Um preenchimento nasce aqui, e não em `Sim.addBot`, porque nome, skin e HISTÓRIA são coisas da sala —
   * o Sim é construído nos testes sem nada disso. `level` é sorteado junto com o nome de gente: badge de
   * nível zerado ao lado de um apelido plausível seria o denunciador que o apelido acabou de tirar.
   */
  _nasceBot({name,team=-1,spawn=true,r=0}){
    const gp=this.sim.addBot(this.freeSlot(),{name,skinId:this.rng.int(0,BOT_SKINS-1),team,spawn,r,
      level:this._nivelBot(r)});
    gp.persona=pickPersona(this.rng,this._personas);
    // A bandeira ao lado do nick: o humano já tinha país, e 49 vazias apontavam quem era gente.
    // Quando o apelido veio do BALDE o país vem JUNTO com ele — a ordem se inverteu: sorteia-se o país e
    // pedem-se nomes DELE, em vez de adivinhar o país a partir do nome (que só acertava via US_ROOTS).
    gp.country=this._paisBot||this._paisBotSala(name);
    this._paisBot=null;
    this.paisesBot.set(gp.country,(this.paisesBot.get(gp.country)||0)+1);
    this.flagsDirty=true;
    return gp;}
  /**
   * As bandeiras que já bateram no teto desta sala (ver ROOM.PAIS_TETO_DIV). O teto sobe com o tamanho
   * da mesa: com 5 e uma sala de 15, nenhuma passa de 3 e há pelo menos cinco países no placar.
   * ⚠️ O tamanho sai da SOMA de `paisesBot` e não de `sim.botCount()`. Não é preciosismo: isto é chamado
   * nos dois lados do nascimento — em `_botNome`, antes de o bot existir, e em `_nasceBot`, depois de
   * `addBot` —, e com o contador do Sim o mesmo bot media a sala com dois tamanhos diferentes, subindo o
   * teto em um justamente no último a nascer.
   * @returns {Set<string>}
   */
  _paisesCheios(){let n=0;for(const k of this.paisesBot.values())n+=k;
    const teto=1+Math.floor(n/ROOM.PAIS_TETO_DIV),s=new Set();
    for(const [c,k] of this.paisesBot)if(k>=teto)s.add(c);
    return s;}
  /**
   * O país de um preenchimento cujo nome NÃO veio do balde: a roleta ponderada de sempre (`botCountry`,
   * que também mantém a coerência de US_ROOTS), com as bandeiras que já encheram FORA do tabuleiro. A
   * roleta devolve BR quase metade das vezes, e sem esse filtro uma sala de 15 sai com 6 ou 7 bandeiras
   * iguais — que é o oposto do que a bandeira do preenchimento existe para dizer.
   * ⚠️ Um sorteio só, como antes: o filtro é DENTRO da roleta, e não um laço de tentativas. Isso mantém
   * o consumo do rng da sala igual ao de sempre — e é o rng da sala que faz "a mesma semente dá a mesma
   * sala" continuar valendo.
   */
  _paisBotSala(name){return botCountry(this.rng,name,this._paisesCheios());}
  /**
   * Nível do preenchimento — o badge que aparece ao lado do nick no placar, no chat e no feed. Ele é
   * sorteado junto com o nome de gente pelo mesmo motivo (badge zerado entrega quem é quem), mas agora
   * ele também precisa CONCORDAR com o tamanho: um planeta de 62 mil de massa com "nível 3" pendurado é
   * exatamente a denúncia que o nome de catálogo era. Quem chegou grande jogou muito. As duas faixas se
   * sobrepõem de propósito — nível não é tabela de conversão de massa, é uma pista.
   * `r` 0 é "sem informação" (o lobby do Battle Royale, onde ninguém tem corpo ainda): faixa inteira.
   */
  _nivelBot(r){if(!this.mode.realNicks)return 0;
    if(!r)return this.rng.int(1,35);
    return r>=ROOM.SEED_R[1][0]?this.rng.int(12,35):this.rng.int(1,20);}
  /** Par que faltava do topUpBots: tira bots (o Battle Royale abre vaga para humano até o último segundo). */
  trimBots(n){let k=n;
    for(const gp of [...this.sim.players.values()])
      if(k>0&&gp.isBot){if(gp.name)this.usedNicks.delete(String(gp.name).toLowerCase());
        // a bandeira volta ao sorteio junto com a vaga: sem isto a sala vira lista negra de países
        if(gp.country){const n=(this.paisesBot.get(gp.country)||0)-1;
          if(n>0)this.paisesBot.set(gp.country,n);else this.paisesBot.delete(gp.country);}
        this.sim.remove(gp.slot);k--;this.flagsDirty=true;}   // Sim.remove marca as peças com REMOVE.DESPAWN, que o snapshot já traduz
    return n-k;}
  freeSlot(){let s=0;while(this.sim.players.has(s))s++;return s;}
  get humanCount(){return this.sessions.size;}
  isFull(){return this.sessions.size>=this.max;}
  /**
   * Porta ÚNICA de entrada da sala (o RoomManager e o wsServer perguntam só isto). No Livre é o `isFull` de
   * sempre; no Battle Royale ela fecha quando a partida começa — quem morreu não volta para a mesma sala,
   * vai para uma nova, que é exatamente o que "sem respawn" quer dizer.
   */
  acceptsJoin(){
    if(this.over)return false;
    // No LOBBY a vaga é sempre do humano: se está cheio de preenchimento, um deles sai (ver join). Sem isto
    // dois amigos que procuram com 10 s de diferença cairiam em salas separadas — o oposto do que o
    // matchmaking existe para fazer.
    if(this.phase==='lobby')return this.sessions.size<this.max;
    return !this.isFull()&&!this.mode.lobby;}
  info(){return{code:this.code,shard:this.shard,mode:this.modeId,teamSize:this.teamSize,phase:this.phase,open:this.acceptsJoin(),
    players:this.sessions.size,max:this.max,bots:this.sim.botCount(),round:this.roundLeft(),
    // ⚠️ o campo fica AQUI, mas o filtro é na LISTAGEM (RoomManager.listRooms): `adminInfo()` é construído em
    // cima deste objeto, e o painel tem que continuar vendo a sala privada.
    private:this.private,host:this.hostNick||null};}
  /** Bloco `round` do JSON `room`: tick de início, duração e hora do relógio do espaço no início. */
  roundInfo(){return{start:this.roundStart,ticks:this.roundTicks,dayStart:ROUND.DAY_START_H,breakMs:ROUND.BREAK_MS,
    // `days` vem do SERVIDOR de propósito. Os ticks da rodada saem do env (ROUND_TICKS) e os dias eram uma
    // constante do CLIENTE — cliente novo com env velho desenhava o relógio do espaço na metade da
    // velocidade, e nada na tela dizia por quê. Custa 1 número num JSON que já é mandado uma vez por join.
    days:ROUND.DAYS,
    // ⚠️ O DIA em ticks, explícito. O cliente derivava a hora do espaço de `ticks/days` — e numa sala SEM FIM
    // não há `ticks` de onde derivar, então o céu simplesmente PARARIA justo na sala que dura mais. Para
    // rodada finita o valor é idêntico ao que ele já calculava, então nada muda nas salas de sempre.
    dayTicks:this.roundTicks?Math.round(this.roundTicks/ROUND.DAYS):ROUND.DAY_TICKS,
    phase:this.phase,
    // TICK absoluto, não "faltam N ms": o cliente já sincroniza o relógio do servidor, e uma duração relativa
    // o obrigaria a saber há quanto tempo a mensagem chegou — que é justamente onde a contagem errava.
    startsAt:this.startsAt||0};}
  /** Segundos restantes da rodada (0 se já acabou). ⚠️ `null` = SEM FIM — e quem lê tem que distinguir de 0. */
  roundLeft(){if(!this.roundTicks)return null;
    const left=(this.roundStart+this.roundTicks-this.sim.tick)/TICK_HZ;return left>0?Math.round(left):0;}
  // ── sessões ──
  /**
   * O nick já está em uso NESTA sala? Dois planetas com o mesmo nome na mesma partida é ilegível: o kill
   * feed, o chat e o placar passam a mentir, e quem foi morto não sabe por quem.
   * ⚠️ `usedNicks` sempre existiu, mas era WRITE-ONLY para humanos — só o gerador de bots o lia, para não
   * repetir. Agora ele é consultado na entrada E limpo na saída (ver `leave`): sem a limpeza a sala vira
   * uma lista negra que só cresce, e quem sai não consegue voltar com o próprio nome.
   */
  nickTaken(name){const n=String(name||'').trim().toLowerCase();return !!n&&this.usedNicks.has(n);}
  /** Entra no menor slot livre. Devolve o slot. */
  join(session,{name,registered=false,skinId=0,sessionId=null,userId=null,level=0,country=null,party=null}){
    const lobby=this.phase==='lobby';
    if(lobby&&this.sim.players.size>=this.max)this.trimBots(1);   // a vaga é do humano
    const slot=this.freeSlot(),team=this._teamFor(party);
    this.usedNicks.add(String(name||'').toLowerCase());           // o preenchimento não pode repetir o nick de quem está na sala
    this.sim.addHuman(slot,{name,registered,skinId,sessionId,userId,team,level,spawn:!lobby});
    const gp=this.sim.players.get(slot);if(gp){gp.country=country||null;this.flagsDirty=true;}
    if(lobby&&!this.lobbyUntil){this.lobbyStart=this.sim.tick;this.lobbyUntil=this.sim.tick+this.lobbyTicks;}   // a janela começa no PRIMEIRO humano
    const pc=this.sim.world.piecesOf(slot)[0];if(pc){session.cx=pc.x;session.cy=pc.y;}
    session.room=this;session.slot=slot;session.pid=++this._pid;session.known.clear();session.rect=null;session.specSlot=-1;this.sessions.set(slot,session);this.lastHumanAt=Date.now();
    if(session.avatar&&session.userId)this._setAvatar(slot,session.userId,session.avatar);
    if(lobby)this.broadcastLobby();
    if(this.hostUserId!=null){const h=this.hostSession();if(h)this.sendHost(h);this.holdUntil=Date.now()+ROOM.HOST_HOLD_MS;}
    return slot;}
  /**
   * Sai de vez: onMatchEnd(cause) se ainda vivo, remove do mundo.
   * ⚠️ No LOBBY não há partida para encerrar — o jogador está na sala, não no mapa, e o `gp` existe e não
   * está morto, então a conta caía aqui do mesmo jeito: cancelar a entrada gravava uma partida de score 0
   * com a duração da sala de espera, e cinco desistências viravam cinco jogos no histórico de quem nunca
   * jogou. Isto vale para toda saída na fase de espera, inclusive a expiração por `housekeeping`.
   */
  leave(session,cause='left'){
    const slot=session.slot;if(this.sessions.get(slot)!==session)return;const gp=this.sim.players.get(slot);
    if(gp&&!gp.dead&&gp.sessionId&&this.phase!=='lobby'){const hooks=this.sim.hooks;
      Promise.resolve().then(()=>hooks.onMatchEnd({sessionId:gp.sessionId,cause,killedBySessionId:null,score:gp.score,maxMass:Math.round(gp.maxMass),durationMs:Math.round((this.sim.tick-gp.joinedTick)*1000/TICK_HZ)}))
        .catch(e=>this.log.warn(`onMatchEnd('${cause}') falhou:`,e&&e.message));}
    if(gp){this._rosterFold(gp);this._rosterLeft(gp);}   // ⚠️ antes do remove: depois dele o GamePlayer não existe mais
    if(gp&&gp.name)this.usedNicks.delete(String(gp.name).toLowerCase());   // sem isto a sala vira lista negra e quem sai não volta com o próprio nome
    this.flagsDirty=true;
    if(this.avatars.has(slot))this._setAvatar(slot,null,null);
    this.sim.remove(slot);this.sessions.delete(slot);session.room=null;session.slot=-1;session.known.clear();session.specSlot=-1;this.lastHumanAt=Date.now();
    if(this.hostUserId!=null){const h=this.hostSession();if(h)this.sendHost(h);}}
  /** Socket caiu: fica no mundo sem thrust (alvo = centróide) até resume ou expirar. */
  detach(session){if(this.sessions.get(session.slot)!==session)return;if(session.kicked)return this.leave(session,'left');session.detach();
    const w=this.sim.world,ps=w.players.get(session.slot);if(!ps||!ps.alive)return;
    let sx=0,sy=0,n=0;for(const pc of ps.pieces){if(pc.dead)continue;sx+=pc.x;sy+=pc.y;n++;}if(n)w.setTarget(session.slot,sx/n,sy/n);w.setEjectHold(session.slot,false);}
  /** Religa um socket novo numa sessão em graça (o wsServer manda `room` + PLAYERS em seguida). */
  resume(session,ws){session.attach(ws);}
  /**
   * Alvo de espectador de uma sessão morta: quem a matou (se ainda vivo) ou o líder da sala. Só manda o JSON
   * `spectate` quando o alvo muda — o cliente move a câmera para esse slot e a AOI (net/snapshot.js) o acompanha,
   * então o que aparece atrás da tela de morte é a sala de verdade, e não um pedaço parado de espaço.
   */
  spectateTargetFor(session,prefer=-1){
    const sim=this.sim,w=sim.world;
    const alive=sl=>{const ps=w.players.get(sl);return !!(ps&&ps.alive&&ps.pieces.some(p=>!p.dead));};
    let slot=prefer>=0&&alive(prefer)?prefer:-1;
    // prefer === -2: "não escolha ninguém" (câmera parada onde estava). Diferente de -1, que quer dizer
    // "não tenho preferência" e cai na busca automática logo abaixo.
    if(prefer===-2){session.specSlot=-1;
      session.sendJson({t:'spectate',slot:-1,name:null,vivos:sim.aliveCount()});   // sempre: é o que diz ao cliente que a câmera parou (e alimenta as setas da tela de morte)
      return -1;}
    if(slot<0&&this.teamCount>0){const mim=sim.players.get(session.slot);   // em equipe, morrer é virar câmera do companheiro (não de quem me comeu)
      if(mim&&mim.team>=0)for(const gp of sim.players.values())if(gp.team===mim.team&&gp.slot!==session.slot&&alive(gp.slot)){slot=gp.slot;break;}}
    if(slot<0){const lb=sim.top(1);if(lb.length&&alive(lb[0].slot))slot=lb[0].slot;}
    if(slot!==session.specSlot){session.specSlot=slot;const gp=slot>=0?sim.players.get(slot):null;
      session.sendJson({t:'spectate',slot,name:gp?gp.name:null,vivos:sim.aliveCount()});}
    return slot;}
  /**
   * O morto escolhe quem assistir. `slot` explícito (clicou no placar) ou `dir` ±1 para andar na lista de
   * VIVOS ordenada por massa — a mesma do placar, então "próximo" na tela é "próximo" aqui. Alvo inválido
   * ou morto cai na escolha automática de sempre, em vez de deixar a câmera parada num fantasma.
   */
  spectatePick(session,{slot=-1,dir=0}={}){
    const sim=this.sim,lb=sim.leaderboard();
    if(!lb.length)return this.spectateTargetFor(session,-1);
    if(dir){const i=lb.findIndex(r=>r.slot===session.specSlot);
      const n=lb.length,j=((i<0?0:i+dir)%n+n)%n;
      return this.spectateTargetFor(session,lb[j].slot);}
    return this.spectateTargetFor(session,slot);}
  /** JSON `dead` da vida atual (null se vivo). */
  deadMsg(slot){const gp=this.sim.players.get(slot);if(!gp||!gp.dead||!gp.deathInfo)return null;const i=gp.deathInfo;
    return{t:'dead',by:i.by,bySlot:i.bySlot,byHole:i.byHole,byZone:i.byZone,score:i.score,maxMass:i.maxMass,kills:i.kills,durationS:i.durationS,placement:i.placement,players:i.players};}
  /** Expira sessões sem socket há mais de NET.RESUME_MS (chamado a cada 1 s pelo RoomManager). */
  housekeeping(now){for(const s of this.sessions.values())if(!s.ws&&now-s.disconnectedAt>NET.RESUME_MS){this.leave(s,'left');this.log.info(`${s.name} saiu da sala ${this.code} (sessão expirada)`);}
    this._hostTick(now);}
  // ── SALA COM DONO: quem manda, quem entra e quem sai ───────────────────────────────────────
  /** É o dono? Compara a CONTA. ⚠️ O `!=null` não é firula: sem ele todo convidado (userId null) viraria dono. */
  isHost(session){return this.hostUserId!=null&&!!session&&session.userId===this.hostUserId;}
  /** A sessão do dono, se ele estiver aqui agora. */
  hostSession(){if(this.hostUserId==null)return null;for(const s of this.sessions.values())if(s.userId===this.hostUserId)return s;return null;}
  /**
   * O dono pode cair e voltar — a comparação é por CONTA, não por sessão, então voltar o devolve ao trono de
   * graça. Passada a carência, a coroa vai ao humano mais antigo presente: uma sala privada de 20 pessoas sem
   * ninguém que possa expulsar um invasor é pior do que uma com um dono improvisado.
   */
  _hostTick(now){
    if(this.hostUserId==null)return;
    if(this.hostSession()){this.hostLeftAt=0;this.holdUntil=now+ROOM.HOST_HOLD_MS;return;}
    if(!this.hostLeftAt){this.hostLeftAt=now;return;}
    if(now-this.hostLeftAt<ROOM.HOST_GRACE_MS)return;
    let novo=null;for(const s of this.sessions.values())if(s.userId!=null&&(!novo||s.connectedAt<novo.connectedAt))novo=s;
    this.hostLeftAt=0;
    if(!novo){this.hostUserId=null;this.hostNick=null;return;}   // ninguém a coroar: a sala volta a ser de todos
    this.hostUserId=novo.userId;this.hostNick=novo.name||null;this.holdUntil=now+ROOM.HOST_HOLD_MS;
    this.log.info(`sala ${this.code}: ${novo.name} virou dono (o anterior saiu)`);
    this.sendHost(novo);}
  /**
   * A lista que o dono vê. ⚠️ Só HUMANOS, e isso não é economia: iterar `sessions` respeita por construção o
   * `anonBots` do Battle Royale, onde o preenchimento não se identifica — um roster com bots entregaria ao
   * dono exatamente a resposta que o modo existe para esconder. E expulsar bot não significa nada (`trimBots`).
   * ⚠️ Também NÃO é `adminInfo({players:true})`: aquele leva sessionId, userId e IP. O dono é um jogador.
   */
  hostRoster(){const out=[];
    for(const s of this.sessions.values()){const gp=this.sim.players.get(s.slot);
      out.push({pid:s.pid,name:s.name,level:s.level|0,country:s.country||null,
        alive:!!(gp&&!gp.dead),connected:s.connected,host:this.isHost(s)});}
    return out;}
  bansList(){return [...this.bans.values()].map(b=>({nick:b.nick,at:b.at}));}
  /** Está banido desta sala? Casa por CONTA e, para quem não tem conta, pelo hash do token. */
  banned({userId=null,key=null}={}){if(!this.bans.size)return false;
    for(const b of this.bans.values()){if(userId!=null&&b.userId===userId)return true;if(key&&b.key===key)return true;}
    return false;}
  sessionByPid(pid){for(const s of this.sessions.values())if(s.pid===(pid|0))return s;return null;}
  /**
   * Expulsa (e opcionalmente bane) alguém. Mesmo caminho do painel do administrador.
   * ⚠️ A causa é `'left'`, NUNCA `'kicked'`: `Room.leave` grava `matches.cause`, cujo CHECK (migração 0003)
   * não conhece a palavra — a partida falharia com 23514 dentro de um catch, em silêncio.
   * ⚠️ `Session.error` marca `kicked=true`, e é isso que faz `Room.detach` tratar a queda como saída: sem
   * ele o expulso voltaria pelo `resume` em 10 s.
   */
  hostKick(pid,{ban=false}={}){
    const alvo=this.sessionByPid(pid);if(!alvo)return null;
    if(this.isHost(alvo))return null;   // o dono não se expulsa: entregaria a sala à transferência com um clique
    const nome=alvo.name||'';
    if(ban)this.bans.set(`p${pid}`,{userId:alvo.userId,key:alvo.key||null,nick:nome,at:Date.now()});
    // dois códigos porque são duas coisas: quem foi BANIDO não volta nem digitando o código, quem foi
    // expulso volta. Com o mesmo código o cliente traduzido diria a mesma frase para as duas.
    alvo.error(ban?'ROOM_BANNED':'ROOM_KICKED',ban?'você foi banido desta sala':'você foi removido da sala pelo dono');
    this.leave(alvo,'left');
    this.log.info(`sala ${this.code}: ${nome} foi ${ban?'banido':'removido'} pelo dono`);
    const h=this.hostSession();if(h)this.sendHost(h);
    return nome;}
  /** O painel do dono, só para ele. JSON de controle: não custa versão de protocolo, como `talk` e `flags`. */
  sendHost(session){if(!session||!session.connected||!this.isHost(session))return;
    session.sendJson({t:'host',you:true,private:this.private,roster:this.hostRoster(),bans:this.bansList()});}
  // ── equipes ──
  get teamCount(){return this.teamSize>1?Math.floor(this.max/this.teamSize):0;}
  /**
   * Equipe de quem está entrando. Membros do mesmo party caem na MESMA equipe (é para isso que o código de
   * convite existe); sem party, vai para a equipe menos cheia com vaga. Solo e Livre devolvem -1 = sem equipe,
   * e aí `sameTeam` responde false para todo mundo — o jogo de sempre.
   */
  _teamFor(party){
    if(this.teamCount<=0)return -1;
    if(party&&this.parties.has(party)){const t=this.parties.get(party);if(this._teamSize(t)<this.teamSize)return t;}
    let best=-1,bn=Infinity;
    for(let t=0;t<this.teamCount;t++){const n=this._teamSize(t);if(n<this.teamSize&&n<bn){bn=n;best=t;}}
    if(best<0)best=0;
    if(party)this.parties.set(party,best);
    return best;}
  _teamSize(t){let n=0;for(const gp of this.sim.players.values())if(!gp.isBot&&gp.team===t)n++;return n;}
  /**
   * Começa a partida de verdade: completa com bots (fechando as equipes que ficaram curtas), reposiciona todo
   * mundo num anel espaçado, arma a zona e SOLTA o `peace`. `roundStart` só é escrito aqui — no arquivo original
   * ele nascia 0 e nunca mudava, e é justamente esse campo que o relógio, a contagem e o céu do cliente derivam.
   */
  begin(){
    if(this.phase!=='lobby')return;
    const sim=this.sim,w=sim.world;
    // 1. fecha o que faltou (a curva do lobby já deve ter enchido quase tudo; isto é a borda)
    this.fillTo(this.max);   // PLAYERS é o TOTAL: humanos já ocupam parte das vagas
    // 2. todo mundo recomeça igual, num anel espaçado (companheiros lado a lado)
    const cx=w.w/2,cy=w.h/2,rad=Math.min(w.w,w.h)*BR.SPAWN_RING;
    const grupos=new Map();
    for(const gp of sim.players.values()){const k=gp.team>=0?`t${gp.team}`:`s${gp.slot}`;
      if(!grupos.has(k))grupos.set(k,[]);grupos.get(k).push(gp);}
    const n=grupos.size;let i=0;
    for(const arr of grupos.values()){const an=i/n*Math.PI*2+this.rng.next()*.05;i++;
      const gx=cx+Math.cos(an)*rad,gy=cy+Math.sin(an)*rad;
      arr.forEach((gp,j)=>{const off=j*90,a2=an+Math.PI/2;
        w.respawnPlayer(gp.slot,{x:gx+Math.cos(a2)*off,y:gy+Math.sin(a2)*off,r:PLAYER.START_R,score:0});
        const ps=w.players.get(gp.slot);if(ps)ps.ammo[WEAPON.MISSILE]=BR.START_AMMO;   // ⚠️ era `ps.missiles`, campo que não existe desde que a munição virou `ps.ammo[]` por arma: ninguém largava o BR com a bala inicial
        gp.score=0;gp.maxMass=0;gp.joinedTick=w.tick;});}
    // 3. a partida começa: relógio, zona e fim da paz
    this.roundStart=w.tick;this.zone=createZone(w.tick);w.setZone(this.zone);w.peace=false;this.phase='live';this.startsAt=0;
    this.feedLog.length=0;   // a fofoca é da RODADA: a sala é reaproveitada, e morte da partida passada não é assunto
    // ...e a conversa também, pelo mesmo motivo. Sem isto uma sala reaproveitada nasce com o orçamento
    // gasto e um `ate` no futuro, e os bots atravessam a rodada nova sem abrir um coro sequer.
    this.conversa={n:0,gastas:0,teto:0,ate:0,solta:false};
    this.iniciativaAt=-1e9;this.iniciativas=0;this.falaAt=sim.tick;
    sim.playersDirty=true;
    for(let i=0;i<3;i++)this._talkAlgum('start');   // largada: alguém diz alguma coisa, como em qualquer sala
    this._pushFeed({k:'sys',a:-1,b:-1,how:'start',by:null});
    this.broadcastPhase();this.broadcastZone();
    this.log.info(`sala ${this.code}: largada — ${sim.humanCount()} humano(s), ${sim.botCount()} preenchimento(s), equipes de ${this.teamSize}`);}
  _teamSizeAll(t){let n=0;for(const gp of this.sim.players.values())if(gp.team===t)n++;return n;}
  /**
   * Estado do LOBBY para a tela de espera. Vai em MILISSEGUNDOS, não em ticks: no lobby o cliente não
   * recebe snapshot nenhum (ninguém tem peça), então o relógio de tick dele nunca sincroniza — uma contagem
   * em ticks ficaria parada. A 2 Hz basta; quem suaviza o número é o cliente.
   */
  broadcastLobby(){
    const msg={t:'lobby',code:this.code,mode:this.modeId,teamSize:this.teamSize,
      filled:this.sim.players.size,cap:this.max,humans:this.sim.humanCount(),
      startsInMs:this.startsAt?Math.max(0,Math.round((this.startsAt-this.sim.tick)*1000/TICK_HZ)):0,
      waitMs:this.lobbyUntil?Math.max(0,Math.round((this.lobbyUntil-this.sim.tick)*1000/TICK_HZ)):0};
    for(const s of this.sessions.values())s.sendJson(msg);}
  /** A largada: o `room` de novo, com a fase nova (relógio, contagem e céu saem todos do bloco `round`). */
  broadcastPhase(){const msg={t:'phase',code:this.code,phase:this.phase,round:this.roundInfo(),
    players:this.sim.humanCount(),cap:this.max,teamSize:this.teamSize,mode:this.modeId};
    for(const s of this.sessions.values())s.sendJson(msg);}
  /**
   * Preenche até `n` jogadores com participantes controlados pelo servidor. No battle royale eles entram
   * com nome de gente (BOT_NICKS) e sem o flag BOT no fio — ver Sim.playersInfo e `anonBots` no MODES.
   * Em equipe, fecha primeiro os times incompletos, para ninguém jogar 2 contra 3.
   */
  fillTo(n){
    const sim=this.sim,lobby=this.phase==='lobby';
    const nome=()=>this._botNome();
    if(this.teamCount>0)
      for(let t=0;t<this.teamCount&&sim.players.size<n;t++){
        let falta=this.teamSize-this._teamSizeAll(t);
        while(falta-->0&&sim.players.size<n)
          this._nasceBot({name:nome(),team:t,spawn:!lobby});}
    while(sim.players.size<n)
      this._nasceBot({name:nome(),team:this._teamFor(null),spawn:!lobby});}
  /**
   * Um passo da máquina do lobby: chegam participantes, a sala enche à vista, e quando lota (ou a janela
   * fecha) começa a contagem regressiva. Sala sem humano nenhum não conta — o RoomManager a recolhe sozinho.
   */
  lobbyTick(){
    const sim=this.sim,tick=sim.tick;
    if(sim.humanCount()<BR.MIN_HUMANS){this.lobbyUntil=0;this.startsAt=0;return;}
    if(!this.lobbyUntil){this.lobbyStart=tick;this.lobbyUntil=tick+this.lobbyTicks;}
    if(!this.startsAt){
      this.fillStep(tick);
      if(tick>=this.lobbyUntil)this.fillTo(this.max);   // janela fechada: completa de uma vez, senão a contagem começaria em 49/50 e o número pularia na largada
      if(sim.players.size>=this.max||tick>=this.lobbyUntil){   // lotou, ou a janela fechou
        this.startsAt=tick+BR.COUNTDOWN_TICKS;this.broadcastLobby();
        this.log.info(`sala ${this.code}: lobby cheio (${sim.humanCount()} humano(s) de ${sim.players.size}) — largada em ${Math.round(BR.COUNTDOWN_TICKS/TICK_HZ)} s`);}}
    else if(tick>=this.startsAt){this.begin();return;}
    if(tick-this.lobbyAt>=TICK_HZ/2){this.lobbyAt=tick;this.broadcastLobby();}}   // 2 Hz: é uma tela, não uma simulação
  /**
   * Chegada dos participantes ao LONGO da janela, não de uma vez no fim. A curva é `progresso^FILL_EXP`
   * (lenta no começo, acelerando), que é como uma fila de verdade se comporta: encher instantaneamente
   * entrega o jogo, e encher tudo no último segundo também. O jitter quebra a cadência — chegadas em
   * intervalos exatos são o outro jeito de denunciar que não é gente.
   */
  fillStep(tick){
    const sim=this.sim,span=Math.max(1,this.lobbyUntil-this.lobbyStart);
    const k=Math.min(1,Math.max(0,(tick-this.lobbyStart)/span));
    const alvo=Math.round(this.max*Math.pow(k,BR.FILL_EXP));
    const falta=Math.min(alvo,this.max)-sim.players.size;
    if(falta<=0)return;
    // o jitter dá o RITMO, mas não pode atrasar a fila: com 2 ou mais em atraso, alcança na hora. Sem isso a
    // sala fechava a janela em 40/50 e o contador dava um pulo feio para 50 na largada.
    if(falta===1&&tick<this.nextBotAt)return;
    this.fillTo(sim.players.size+1);
    const passo=span/Math.max(1,this.max);
    this.nextBotAt=tick+Math.max(1,Math.round(passo*(1+(this.rng.next()*2-1)*BR.ARRIVE_JITTER)));}
  // ── zona ──
  broadcastZone(){if(this.zone)this.broadcast(encodeZone(this.writer,this.zone));}
  tickZone(){
    const ev=stepZone(this.zone,this.sim.tick,this.rng);
    if(!ev)return;
    this.broadcastZone();
    if(ev==='shrink'){const c=zoneAt(this.zone,this.sim.tick);
      this.sim.wireEvents.push({kind:EVENT.ZONE_SHRINK,x:c.x,y:c.y,r:this.zone.r1,slotA:0xffff,slotB:0xffff,extra:(this.zone.t1-this.zone.t0)>>>0});
      // a virada da zona é o gatilho natural de comentário (e, no fim, de "quantos faltam")
      const vivos=this.sim.aliveCount(),poucos=vivos<=BOT.GAS.LATE_ALIVE;
      this._talkAlgum(poucos?'poucos':'zona');
      this._pushFeed(poucos?{k:'sys',a:-1,b:-1,how:'few',by:null,n:vivos}:{k:'sys',a:-1,b:-1,how:'zone',by:null});}}
  /** Enfileira um gatilho de fala num preenchimento vivo qualquer (o orçamento decide se sai algo). */
  _talkAlgum(kind){const vivos=[];
    for(const gp of this.sim.players.values())if(gp.isBot&&!gp.dead)vivos.push(gp.slot);
    if(vivos.length)this.sim._talk(vivos[this.rng.int(0,vivos.length-1)],kind);}
  // ── chat ──
  /**
   * Para onde vai a fala de `gp` — a MESMA resposta serve ao texto, ao ícone do 🎤 e ao clipe de voz, e é por
   * isso que virou função em vez da expressão solta que vivia dentro do `_pushChat`.
   * Vivo: a regra do modo (`room` no Livre e no BR solo, `team` em equipe — lá o chat é ferramenta tática e
   * virar megafone de 50 pessoas o mataria). Morto:
   *   Livre → `room`. Morrer ali dura segundos (o botão RENASCER está na tela) e os preenchimentos renascem no
   *           MESMO tick: isolar o morto seria mandá-lo escrever para uma sala vazia.
   *   BR    → `dead` (a arquibancada, a regra do Counter-Strike), porque lá a morte é definitiva. O morto pode
   *           pedir `team` e falar com o esquadrão INTEIRO, vivos incluídos: a informação de quem morreu é da
   *           equipe dele, e é a única exceção deliberada à regra.
   */
  _escopoFala(gp,pedido){
    if(!gp.dead)return this.mode.chat==='team'&&gp.team>=0?'team':'room';
    if(!this.mode.lastAlive)return 'room';
    if(pedido==='team'&&gp.team>=0)return 'team';
    return 'dead';}
  /**
   * Uma linha de chat, no escopo que `_escopoFala` decidir.
   * Devolve false quando a mensagem foi engolida (vazia, longa demais ou fora do intervalo).
   */
  chat(session,text,scope){
    const gp=this.sim.players.get(session.slot);if(!gp)return false;
    // ⚠️ `mascara` por último, e é a única peneira que a linha de uma PESSOA tem. Até aqui ela chegava à
    // sala inteira depois de três transformações puramente mecânicas — normalizar, tirar caractere de
    // controle, cortar em MAX_CHARS —, ou seja, o preenchimento era censurado (`sanitiza`, botChat.js) e
    // quem joga não. Mascara em vez de recusar: linha que some em silêncio parece chat quebrado, e a
    // pessoa só reescreve com outra grafia. Ver o cabeçalho de server/src/palavrao.js.
    const msg=mascara(String(text||'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,CHAT.MAX_CHARS));
    if(!msg)return false;
    const now=Date.now();
    if(!session.chatAt)session.chatAt=[];
    session.chatAt=session.chatAt.filter(t=>now-t<CHAT.RATE_MS*CHAT.BURST);
    if(session.chatAt.length>=CHAT.BURST)return false;   // rate limit PRÓPRIO, além do balde de JSON: aquele protege o servidor, este protege a tela dos outros
    session.chatAt.push(now);
    // o pedido fica na SESSÃO porque a voz não tem onde carregá-lo: o clipe é binário e o `{t:"talk"}` só
    // leva um bit. Assim o Ctrl sai para os mesmos ouvintes da última linha escrita.
    if(scope==='team'||scope==='all')session.chatScope=scope;
    const escopo=this._escopoFala(gp,session.chatScope);
    this._pushChat(gp,msg,escopo);
    // escopo `dead` não fala com bot: o respondedor é sempre um bot VIVO (ver `_botResponde`), e ele
    // devolveria, na frente da sala inteira, uma resposta a uma linha que nenhum vivo leu.
    if(escopo!=='dead')this._botResponde(gp,msg);
    return true;}
  /**
   * DENÚNCIA de um jogador. O que ela faz é REGISTRAR, e só: ninguém é expulso, silenciado nem punido
   * por denúncia — senão a denúncia vira arma, e numa sala de 50 seria a primeira coisa que alguém
   * descobriria. Quem quer parar de ouvir alguém tem o SILENCIAR, que é local, instantâneo e não depende
   * de mais ninguém concordar (client/src/game/index.js).
   *
   * O registro sai daqui e não do cliente por dois motivos: o servidor é o único que sabe quem é a pessoa
   * atrás do slot (`session.userId`, que o cliente nunca vê) e é ele que tem as últimas linhas dela —
   * `chatLog` já existia, para o prompt da LLM, e é exatamente o contexto que uma denúncia sem texto não
   * tem. Sem isso, "fulano denunciou beltrano" é uma linha que ninguém consegue julgar depois.
   * ⚠️ Rate limit por sessão: sem ele a denúncia é um botão de flood de log.
   */
  report(session,slot){
    const gp=this.sim.players.get(session.slot);if(!gp)return false;
    if(slot===session.slot)return false;                       // denunciar a si mesmo não existe
    const alvo=this.sim.players.get(slot);if(!alvo)return false;
    const agora=Date.now();
    if(agora-(session.reportAt||0)<CHAT.REPORT_CD_MS)return false;
    session.reportAt=agora;
    // as últimas linhas DELE, que é o que dá para julgar depois; o resto da conversa não interessa
    const falas=this.chatLog.filter(l=>l.name===alvo.name).slice(-CHAT.REPORT_LINES).map(l=>l.text);
    this.log.warn(`denúncia na sala ${this.code}: ${gp.name} → ${alvo.name}`,
      JSON.stringify({sala:this.code,de:{nick:gp.name,userId:session.userId||null},
        alvo:{nick:alvo.name,bot:!!alvo.isBot,userId:alvo.userId||null},falas}));
    return true;}
  /** Sessões que recebem uma fala no escopo dado. Uma lista só, usada pelo texto e pela voz. */
  _destinos(gp,escopo){
    const out=[];
    for(const s of this.sessions.values()){if(!s.ws)continue;
      if(escopo==='team'){const o=this.sim.players.get(s.slot);if(!o||o.team!==gp.team)continue;}
      else if(escopo==='dead'){const o=this.sim.players.get(s.slot);if(!o||!o.dead)continue;}
      out.push(s);}
    return out;}
  /** Difusão de uma linha já validada. Caminho comum do humano e do preenchimento. */
  _pushChat(gp,msg,escopo){
    if(!escopo)escopo=this._escopoFala(gp,null);
    const out={t:'chat',slot:gp.slot,name:gp.name,team:gp.team<0?null:gp.team,text:msg,at:Date.now(),scope:escopo};
    if(gp.dead)out.dead=1;
    // Até aqui o servidor era só um repetidor e não guardava uma linha. Sem histórico não há conversa para
    // ler — e sem conversa a fala gerada não passa de outro repertório fixo, só que mais caro.
    // O `scope` vai junto: a linha da arquibancada não pode entrar no prompt de um bot vivo (ver `_botResponde`).
    this.chatLog.push({name:gp.name,text:msg,team:gp.team,bot:!!gp.isBot,scope:escopo});
    if(this.chatLog.length>CHAT.KEEP)this.chatLog.shift();
    // O relógio do SILÊNCIO (ver `_iniciativaTick`). Escopo `dead` não conta: a arquibancada não é a
    // sala falando, e uma sala em que só os mortos conversam continua calada para quem está jogando.
    if(escopo!=='dead')this.falaAt=this.sim.tick;
    for(const s of this._destinos(gp,escopo))s.sendJson(out);}
  /**
   * Fala dos preenchimentos. Uma sala de 50 pessoas que atravessa a partida inteira em silêncio é tão
   * estranha quanto um bot correndo em linha reta — mas fala demais, repetida ou fora de hora denuncia MUITO
   * mais que qualquer movimento. Por isso o padrão é o silêncio e tudo é orçamento: cooldown da sala,
   * cooldown por bot, teto por partida e probabilidade por gatilho. Nada aqui inventa assunto: cada linha
   * vem de um evento que acabou de acontecer (`sim.botTalk`).
   * Não fala quem não tem plateia (sala sem humano) nem antes da largada.
   */
  botChatTick(){
    const sim=this.sim,fila=sim.botTalk;
    if(!fila.length)return;
    const tick=sim.tick;
    if(this.phase!=='live'||!this.sessions.size){fila.length=0;return;}
    if(tick-this.botTalkAt<BOT_TALK.ROOM_CD_TICKS){fila.length=0;return;}   // a fila é do INSTANTE: guardar gera coro atrasado
    // O sorteio era UNIFORME e o `P` só era conferido DEPOIS: um gatilho frequente e de baixo valor (o
    // míssil, que acerta o tempo todo) ganhava a loteria, DERRUBAVA um `kill` do mesmo tick e ainda tinha
    // 90% de chance de não sair — o resultado líquido era MENOS fala, e pior. O peso decide QUAL; o
    // `chance` logo abaixo continua decidindo SE.
    let soma=0;for(const it of fila)soma+=BOT_TALK.P[it.kind]||.15;
    let r=this.rng.range(0,soma),g=fila[fila.length-1];
    for(const it of fila){r-=BOT_TALK.P[it.kind]||.15;if(r<=0){g=it;break;}}
    fila.length=0;
    const gp=sim.players.get(g.slot);if(!gp||!gp.isBot)return;
    if(gp.talked>=BOT_TALK.MAX_PER_MATCH||tick-(gp.talkedAt??-1e9)<BOT_TALK.BOT_CD_TICKS)return;
    if(!this.rng.chance(BOT_TALK.P[g.kind]||.15))return;
    // O orçamento é gasto AQUI, antes de qualquer coisa assíncrona: se a reserva esperasse a resposta da
    // LLM, dois gatilhos no mesmo tick passariam os dois pela porta e sairia o coro que tudo isto evita.
    gp.talked=(gp.talked|0)+1;gp.talkedAt=tick;this.botTalkAt=tick;
    this._falar(gp,g,()=>this._fraseFixa(gp,g.kind));}
  /** Uma frase do repertório: o CHÃO da fala (sem LLM, com ela fora, ou quando a resposta não presta). */
  _fraseFixa(gp,kind){
    const equipe=this.mode.chat==='team'&&gp.team>=0;
    const pool=BOT_CHAT[equipe&&this.rng.chance(.5)?'equipe':kind]||BOT_CHAT.kill;
    // Sorteia entre as frases que a sala NÃO disse há pouco. Era por tentativas (sorteia, se repetiu tenta de
    // novo) e escapava: quatro sorteios podiam cair todos no que acabou de sair. Filtrar antes é exato.
    const livres=pool.filter(f=>!this.ditas.includes(f)),lista=livres.length?livres:pool;
    const txt=lista[this.rng.int(0,lista.length-1)];
    return this.rng.chance(BOT_TALK.TYPO_P)?botTypo(this.rng,txt):txt;}
  /**
   * Publica uma fala do bot `gp`, gerada pela LLM quando dá, e pelo repertório quando não dá.
   * NADA aqui pode ser esperado: `botChatTick` roda dentro do `step()` da sala, e o Scheduler percorre
   * TODAS as salas do processo no mesmo laço de 60 Hz — um `await` no caminho travaria o servidor inteiro.
   * Por isso a geração é disparada e esquecida, e quem publica é o callback. Entre o pedido e a resposta a
   * partida andou: a sala pode ter acabado, o bot pode ter morrido, o socket pode ter caído. Tudo é
   * revalidado, e uma resposta que demorou demais é DESCARTADA — comentário atrasado é pior que silêncio.
   * E a linha pronta ainda espera o tempo de DIGITAR (`_digitaTick`), que é o que separa uma resposta de
   * gente de um `console.log` com atraso. A corrente bot↔bot nasce lá, que passou a ser o único ponto por
   * onde toda fala de bot passa.
   */
  _falar(gp,g,fallback){
    // O TEMPO DE DIGITAR. A linha do modelo saía inteira no instante em que ele terminava, e uma frase de 45
    // letras chegava tão rápido quanto um "kkkk" — que é o jeito mais barato de denunciar que ali não tem
    // gente. Agora ela espera `len/DIGITA_CPS` antes de aparecer, agendada no MESMO relógio de tick que o
    // resto (nada de setTimeout: não é determinístico, não é testável com o rng da sala e não revalida nada).
    // ⚠️ Este atraso é depois da geração, então fica FORA do CORO_WAIT_MS — ver o comentário em constants.
    const digitando=txt=>{if(!txt)return;
      // `ditas` é escrito AQUI, no instante em que a frase existe — não na publicação. É ele que impede a
      // repetição na hora de SORTEAR a próxima, e duas falas em digitação ao mesmo tempo podem sair iguais
      // se o registro esperar a publicação.
      this.ditas.push(txt);if(this.ditas.length>BOT_TALK.NO_REPEAT)this.ditas.shift();
      const ms=Math.min(BOT_LLM.DIGITA_MAX_MS,Math.max(BOT_LLM.DIGITA_MIN_MS,txt.length/BOT_LLM.DIGITA_CPS*1000));
      this.digitaFila.push({atTick:this.sim.tick+Math.round(ms/1000*TICK_HZ),slot:gp.slot,gp,txt,g});};
    if(!this.botChat||!this.botChat.ativo()){digitando(fallback());return;}
    const nasceu=Date.now(),slot=gp.slot;
    this.gerando++;
    this.botChat.gerar(this._ctxFala(gp,g)).then(txt=>{
      if(this.over||this.phase!=='live'||!this.sessions.size)return;
      if(this.sim.players.get(slot)!==gp||gp.dead)return;
      if(Date.now()-nasceu>BOT_LLM.STALE_MS)return;
      digitando(txt||fallback());
    }).catch(e=>{if(this.log)this.log.debug(`fala do bot falhou: ${e&&e.message}`);})
      .finally(()=>{this.gerando--;});}
  /** Drena o que já "acabou de digitar". Revalida tudo de novo: entre gerar e publicar a partida andou. */
  _digitaTick(){const fila=this.digitaFila,tick=this.sim.tick;let i=0;
    while(i<fila.length){const it=fila[i];
      if(it.atTick>tick){i++;continue;}
      fila.splice(i,1);
      if(this.over||this.phase!=='live'||!this.sessions.size)continue;
      const gp=it.gp;if(this.sim.players.get(it.slot)!==gp||gp.dead)continue;
      this.ultimoBot=gp;this._pushChat(gp,it.txt);
      if(!it.fixa)this._encadeia(gp,it.txt,it.g);}}   // repertório não cita ninguém: não abre corrente
  /** O que a LLM precisa saber para escrever uma linha: quem é o bot, o que aconteceu e o que o chat disse. */
  /**
   * O que o bot está VIVENDO agora. Sai inteiro de `gp.brain`, que o `_think` já preenche a cada
   * BOT.THINK_TICKS e que, até aqui, ninguém lia — custo ZERO. `target` é SLOT em hunt/flee (dá para virar
   * nome) e id de entidade em food/intercept (não dá, e nem interessa).
   */
  _estado(gp){
    const b=gp.brain;if(!b)return null;
    let alvo=null;
    if((b.mode==='flee'||b.mode==='hunt')&&b.target>=0){const o=this.sim.players.get(b.target);if(o)alvo=o.name;}
    return{modo:b.mode,alvo,press:b.press||0,zu:b.zu||0,open:b.open||0};}
  /**
   * Quem vem batendo nele, lido do anel `gp.mem`. Sem varredura de expiração: quem lê é que ignora o que
   * passou do TTL. Empate desempata a favor de HUMANO — é ele que está lendo o chat, e é dele que o
   * jogador quer ouvir o nome.
   */
  _agressor(gp){
    const m=gp.mem;if(!m||!m.n)return null;
    const t=this.sim.tick,cont=new Map();
    for(let i=0;i<m.n;i++){const e=m.buf[i];
      if(!e.k||e.slot<0||t-e.at>BOT_LLM.MEM_TTL_TICKS)continue;
      const c=cont.get(e.slot)||{n:0,at:-1,k:''};c.n++;if(e.at>c.at){c.at=e.at;c.k=e.k;}cont.set(e.slot,c);}
    let melhor=null,mSlot=-1;
    for(const [slot,c] of cont){
      const o=this.sim.players.get(slot);if(!o)continue;
      const humano=!o.isBot;
      if(!melhor||c.n>melhor.n||(c.n===melhor.n&&humano&&melhor.bot)){melhor={...c,bot:!humano};mSlot=slot;}}
    if(!melhor)return null;
    const o=this.sim.players.get(mSlot);
    return{nome:o.name,k:melhor.k,n:melhor.n,recente:t-melhor.at<=BOT_LLM.MEM_QUENTE_TICKS};}
  /** O que a LLM precisa saber: quem ele É, o que está vivendo, quem o está atacando e o que o chat disse. */
  _ctxFala(gp,g){
    const sim=this.sim,equipe=this.mode.chat==='team'&&gp.team>=0;
    // em equipe o chat é fechado: o bot não pode reagir ao que foi dito em outra equipe (nem soube dele).
    // `dead` cai pelo mesmo motivo: o bot que responde está VIVO e nunca leu a arquibancada.
    const hist=this.chatLog.filter(l=>l.scope!=='dead'&&(!equipe||l.team===gp.team)).slice(-BOT_LLM.HIST);
    const rows=sim.leaderboard(),rank=rows.findIndex(r=>r.slot===gp.slot)+1;
    // ── O QUE ELE VÊ DA PARTIDA ──
    // Tudo aqui já existia e era jogado fora: `modo` era montado e NUNCA lido pelo prompt, o placar só
    // virava um ordinal ("mid-table"), a zona só virava um booleano, e o kill feed não chegava. O bot
    // falava como quem está numa sala vazia. Nada disto custa consulta nova: `leaderboard()` é cacheado
    // por tick, `zoneNextIn` é aritmética sobre a zona que a sala já tem, e o feed vem do anel do difusor.
    const pf=this._panoDeFundo(gp);
    const estado=this._estado(gp),agressor=this._agressor(gp);
    return{nome:gp.name,
      persona:gp.brain?gp.brain.p.id:null,pericia:gp.brain?gp.brain.s.id:null,
      historia:gp.persona||null,
      rank:rank||0,vivos:pf.vivos,
      // "metade do tamanho do líder" é uma frase que o modelo sabe usar; "massa 4820" não é.
      fracLider:pf.fracLider,lider:pf.lider,zonaS:pf.zonaS,
      feed:this.feedLog.slice(-BOT_LLM.FEED_HIST),
      estado,agressor,
      // ── QUEM É QUEM ──
      // Só os nomes que JÁ entram no prompt. O bot falava com strings anônimas: sabia o que estava
      // vivendo e não fazia ideia de quem era ninguém — nem que o sujeito que ele está caçando se chama
      // "messi" e está com a CARA do Messi, coisa que o servidor decidiu e sempre soube.
      gente:this._quemE([gp.name,g.quem,pf.lider,estado&&estado.alvo,agressor&&agressor.nome,
        ...hist.slice(-3).map(l=>l.name)]),
      modo:this.mode.lastAlive?'battle royale, last one standing':'free-for-all',
      equipe,kind:g.kind,quem:g.quem||null,texto:g.texto||null,assunto:g.assunto||null,historico:hist};}
  /**
   * Quem é cada pessoa que o prompt vai citar, na ordem em que importam. O custo é um `Map.get` por nome
   * — são no máximo ELENCO_MAX — e o ganho é o bot deixar de conversar com etiquetas vazias.
   * A CARICATURA é FATO, não palpite: `eggSkinFor` decidiu a skin daquela vida a partir do nick (em
   * persist/hooks.js), então o servidor sabe que quem se chama "messi" está jogando com a cara do Messi.
   * O resto da associação com o mundo real é inferência da LLM, autorizada no SYSTEM.
   * ⚠️ `isBot` NÃO é colhido de propósito: no Battle Royale o preenchimento não se identifica
   * (`anonBots` tirou o PLAYER_FLAG.BOT do fio justamente para o placar e o radar não o entregarem), e
   * um bot dizendo "você é um bot" na tela desfaria isso de graça.
   */
  _quemE(nomes){
    const out=[],vistos=new Set();
    for(const nome of nomes){
      if(!nome||vistos.has(nome))continue;vistos.add(nome);
      const o=this._gpPorNome(nome);if(!o)continue;
      const egg=eggDe(o.skinId);
      if(!egg&&!o.country&&(o.level|0)<BOT_LLM.NIVEL_ALTO)continue;   // não tem nada a dizer: não gasta caractere
      out.push({nome,egg:egg?egg.real:null,pais:o.country||null,nivel:o.level|0});
      if(out.length>=BOT_LLM.ELENCO_MAX)break;}
    return out;}
  /** O GamePlayer de um nome. Os nomes são únicos por sala (`usedNicks`), então a busca é exata. */
  _gpPorNome(nome){
    for(const gp of this.sim.players.values())if(gp.name===nome)return gp;
    return null;}
  /**
   * Alguém escreveu no chat. Um bot responde quando é CHAMADO — e ninguém digita o apelido inteiro e certo
   * no meio de uma partida, então a comparação é por raiz, sufixo e distância (`botChat.citou`). Sem
   * citação nenhuma, só quem acabou de falar tem direito a uma réplica, e raramente: o padrão continua
   * sendo o silêncio, senão o chat vira dois bots conversando sozinhos por cima do jogo.
   * Sem LLM a sala NÃO fica muda: quem foi chamado pelo nome responde do repertório (`BOT_CHAT.resposta`),
   * porque ser chamado e não responder é o que mais denuncia um preenchimento. O que continua calado é o
   * que não faz sentido enlatar — a réplica sem vocativo e o elo de corrente —, porque aí a frase fixa É
   * responder fora de contexto, que é pior do que não responder.
   */
  _botResponde(autor,texto,o={}){
    // ⚠️ NÃO se checa `bc.ativo()` aqui, e essa linha era um BUG de dois anos de comentário: `ativo()` é
    // "disjuntor fechado E gerações em voo < teto", ou seja uma condição de OCUPAÇÃO usada como condição
    // de EXISTÊNCIA. Com 4 gerações em voo em QUALQUER sala do shard, quem fosse chamado pelo nome em
    // qualquer outra ficava MUDO — e `BOT_CHAT.resposta`/`_fraseResposta`, que existem exatamente para
    // esse caso, nunca eram alcançados. Quem escolhe entre gerar e enlatar é `_filaTick`, no despacho,
    // onde a informação é atual; aqui só se decide QUEM fala.
    if(this.phase!=='live'||this.over)return;
    const bc=this.botChat,sim=this.sim,tick=sim.tick,depth=o.depth|0,cadeia=o.cadeia||[];
    const cit=(bc&&bc.citou)||citou;   // honra o botChat falso dos testes E funciona com botChat===null
    // ── ORÇAMENTO DA CONVERSA ──
    if(depth&&this.conversa.gastas>=this.conversa.teto){this._m('conv');return;}
    if(!depth&&tick>=this.conversa.ate)   // a conversa anterior esfriou: esta linha abre outra
      this.conversa={n:this.conversa.n+1,gastas:0,teto:BOT_LLM.CONVERSA_MAX_GER,ate:0,solta:true};
    const equipe=this.mode.chat==='team'&&autor.team>=0;
    // Dentro da corrente o cooldown por bot é OUTRO. Com os 10 s da MENÇÃO valendo aqui, afrouxar a
    // janela abaixo não mudaria NADA: o elo seguinte chega 1–4 s depois e o bot ainda está de molho.
    const cd=depth?BOT_LLM.CADEIA_BOT_CD_TICKS:BOT_LLM.MENTION_BOT_CD_TICKS;
    // Numa corrente, quem JÁ ESTÁ nela vem primeiro: `CADEIA_SCAN_MAX` corta a varredura em 24 e, numa
    // sala de 50, o participante do elo anterior pode estar num slot alto e nunca entrar no pool.
    const ordem=depth?cadeia.filter(x=>x>=0).concat([...sim.players.keys()]):[...sim.players.keys()];
    const cands=[],visto=new Set();
    for(const slot of ordem){
      if(visto.has(slot))continue;visto.add(slot);
      const gp=sim.players.get(slot);
      if(!gp||!gp.isBot||gp.dead||gp.slot===autor.slot)continue;
      if(equipe&&gp.team!==autor.team)continue;                                   // não ouviu, não responde
      // A JANELA, não o conjunto inteiro: com CADEIA_MAX=5 o "nunca repetir slot" exigia CINCO bots
      // distintos por conversa, e conversa de gente não é revezamento — A e B trocam três frases e C
      // entra no meio. A janela proíbe o que incomoda (A→B→A no mesmo fôlego) e libera o que parece
      // gente (A→B→C→A).
      if(cadeia.slice(-BOT_LLM.CADEIA_JANELA).includes(gp.slot))continue;
      // ⚠️ `??` e não `||`: o tick 0 é FALSY, então `gp.mencaoAt||-1e9` dizia "nunca falou" para quem
      // acabou de falar no primeiro tick da sala — e o cooldown por bot simplesmente não existia ali.
      if(tick-(gp.mencaoAt??-1e9)<cd)continue;
      if((gp.mencoes|0)>=BOT_LLM.MAX_MENTION_PER_MATCH)continue;
      cands.push(gp);
      if(cands.length>=BOT_LLM.CADEIA_SCAN_MAX)break;}   // teto do custo de `citou` (Levenshtein por palavra × candidatos)
    if(!cands.length)return;
    const citados=cands.filter(gp=>cit(texto,gp.name));
    // ── quem responde, e quantos ──
    /** @type {{gp:any,kind:string}[]} */const escolhidos=[];
    if(citados.length){
      // Chamado pelo nome: quem foi chamado responde, e rápido. Até dois — três pessoas respondendo a
      // uma provocação dirigida a UMA delas é coro, não conversa.
      if(depth?this.rng.chance(BOT_LLM.CADEIA_P):this.rng.chance(BOT_LLM.MENTION_P)){
        const pool=citados.slice();
        const n=Math.min(pool.length,depth?1:BOT_LLM.CORO_MAX_CITADOS);
        for(let i=0;i<n;i++)escolhidos.push({gp:pool.splice(this.rng.int(0,pool.length-1),1)[0],kind:depth?'cadeia':'mention'});}
    }else if(depth){
      // ── CADEIA SOLTA ──
      // A linha gerada não citou ninguém. Numa conversa de gente isso é a REGRA, não a exceção ("kkkk",
      // "nem vi", "tu ta doido") — exigir vocativo para continuar era o que matava toda corrente no
      // SEGUNDO elo, e é a razão de uma conversa nunca ter passado de duas réplicas.
      // ⚠️ Só vale em conversa marcada `solta`: a que um HUMANO abriu, ou a da INICIATIVA. Sem essa
      // marca, cada "peguei" espontâneo de bot viraria o começo de um papo entre bots por cima do jogo —
      // toda fala espontânea já nasce como raiz de cadeia (botChatTick → _falar → _digitaTick → _encadeia).
      // ⚠️ E é sempre UM só: coro dentro de corrente é a receita de dois bots tomando a sala.
      if(o.solta&&this.rng.chance(BOT_LLM.CADEIA_SOLTA_P)){
        // Quem continua é quem JÁ ESTÁ na conversa; bot novo é o último recurso. Trocar de gente a cada
        // linha não é conversa, é revezamento — e denuncia mais rápido que o silêncio.
        const dentro=cands.filter(gp=>cadeia.includes(gp.slot));
        const pool=dentro.length?dentro:cands;
        escolhidos.push({gp:pool[this.rng.int(0,pool.length-1)],kind:'cadeia'});}
    }else{
      // O cooldown de SALA vale AQUI e só aqui: coro e réplica são a sala se OFERECENDO, e ser chamado
      // pelo NOME não passa por ele — é justamente o caso que não pode ficar mudo. (Antes ele era a
      // guarda de entrada do método, e barrava a menção junto.)
      if(tick-this.mencaoAt<BOT_LLM.MENTION_ROOM_CD_TICKS)return;
      if(this.conversa.gastas>=this.conversa.teto)return;   // conversa esgotada não abre coro novo
      // Ninguém citado. Pergunta jogada para a SALA vale coro; frase solta continua valendo só a réplica
      // rara de quem falou por último, exatamente como antes.
      const tipo=aberta(texto,false);
      if(tipo==='pergunta'){
        // ⚠️ Sem LLM o coro é de UM. Três frases ENLATADAS para um "e aí galera" é exatamente o coro de
        // robô que o escalonamento existe para evitar; uma só é o que uma pessoa faz.
        const vivo=!!(bc&&bc.ativo());
        const n=vivo?this._sorteiaCoro(cands.length):1;
        const pool=cands.slice();
        for(let i=0;i<n&&pool.length;i++)escolhidos.push({gp:pool.splice(this.rng.int(0,pool.length-1),1)[0],kind:'coro'});}
      // ⚠️ `reply` EXIGE LLM: é resposta a uma linha que não chamou ninguém, e frase enlatada aí é
      // literalmente "responder fora de contexto", que é pior do que não responder.
      else if(bc&&bc.ativo()&&this.ultimoBot&&cands.includes(this.ultimoBot)&&this.rng.chance(BOT_LLM.REPLY_P))
        escolhidos.push({gp:this.ultimoBot,kind:'reply'});}
    if(!escolhidos.length)return;
    // ── agendamento escalonado ──
    // Três respostas saindo no mesmo tick é coro de robô. Chegando com 0,3 s / 1,3 s / 2,6 s de diferença,
    // parece gente digitando em velocidades diferentes — que é o que são.
    let d=this.rng.range(BOT_LLM.CORO_D0_MS[0],BOT_LLM.CORO_D0_MS[1]);
    for(const {gp,kind} of escolhidos){
      // O orçamento é debitado AQUI, no agendamento — nunca no callback. Se esperasse a resposta, dois
      // gatilhos no mesmo tick passariam os dois pela porta.
      gp.mencaoAt=tick;gp.mencoes=(gp.mencoes|0)+1;
      // ⚠️ O cooldown de SALA é do que o HUMANO diz. Refrescá-lo a CADA ELO fechava a porta para o
      // próximo humano por 15–25 s numa corrente de 5: os bots conversando entre si e o jogador que
      // chamou um deles pelo nome sendo ignorado — o oposto exato do que este arquivo existe para evitar.
      if(!depth)this.mencaoAt=tick;
      this.conversa.gastas++;this.conversa.ate=tick+BOT_LLM.CONVERSA_CD_TICKS;
      this._agenda(gp,{kind,quem:autor.name,texto,depth,cadeia:cadeia.concat(autor.slot),
        solta:depth?!!o.solta:!autor.isBot},d);
      d+=this.rng.range(BOT_LLM.CORO_D_MS[0],BOT_LLM.CORO_D_MS[1]);}}
  /** 1, 2 ou 3 respostas, pelos pesos de CORO_N_W. */
  _m(ev){if(this.metrics&&this.metrics.llm)this.metrics.llm(ev);}
  _sorteiaCoro(max){
    const w=BOT_LLM.CORO_N_W;let r=this.rng.range(0,1),n=1;
    for(let i=0;i<w.length;i++){if(r<w[i]){n=i+1;break;}r-=w[i];}
    return Math.max(1,Math.min(max,n));}
  /**
   * Enfileira uma fala conversacional para daqui a `atrasoMs`. Fila cheia ⇒ publica o repertório NA HORA:
   * é melhor uma frase enlatada agora que silêncio depois de alguém chamar pelo nome.
   */
  _agenda(gp,g,atrasoMs){
    const fb=()=>this._fraseResposta(gp,g);
    if(this.falaFila.length>=BOT_LLM.FILA_MAX){this._m('drop');this._falarJa(gp,g,fb);return;}
    this.falaFila.push({atTick:this.sim.tick+Math.round(atrasoMs/1000*TICK_HZ),pushAt:Date.now(),slot:gp.slot,gp,g,fallback:fb});}
  /** Publica sem passar pela LLM (fila cheia, teto de geração, disjuntor aberto). */
  _falarJa(gp,g,fallback){
    const txt=fallback();if(!txt)return;
    this._m('fallback');
    this.ditas.push(txt);if(this.ditas.length>BOT_TALK.NO_REPEAT)this.ditas.shift();
    // A frase ENLATADA também leva tempo para digitar. Com o disjuntor aberto ela vira a resposta padrão
    // da sala, e sair INSTANTÂNEA enquanto as geradas levam 0,45–3,4 s é a assinatura de bot que o
    // DIGITA_CPS existe justamente para apagar. `fixa` impede o `_encadeia` no outro lado: repertório
    // não cita ninguém e não conversa.
    const ms=Math.min(BOT_LLM.DIGITA_MAX_MS,Math.max(BOT_LLM.DIGITA_MIN_MS,txt.length/BOT_LLM.DIGITA_CPS*1000));
    this.digitaFila.push({atTick:this.sim.tick+Math.round(ms/1000*TICK_HZ),slot:gp.slot,gp,txt,g,fixa:true});}
  /**
   * Resposta do repertório. A menção tinha fallback `null` — sem LLM o bot chamado pelo nome ficava MUDO,
   * que é justamente o que mais denuncia um preenchimento. Na corrente o silêncio continua sendo o certo:
   * frase enlatada de bot respondendo a bot é o pior caso de farsa que existe.
   */
  _fraseResposta(gp,g){
    if(g.kind==='cadeia')return null;
    const pool=BOT_CHAT.resposta,livres=pool.filter(f=>!this.ditas.includes(f)),lista=livres.length?livres:pool;
    const txt=lista[this.rng.int(0,lista.length-1)];
    return this.rng.chance(BOT_TALK.TYPO_P)?botTypo(this.rng,txt):txt;}
  /**
   * Corrente bot↔bot. Continua quando a linha GERADA cita alguém pelo nome e, mais raramente, mesmo quando
   * não cita (`CADEIA_SOLTA_P`) — porque numa conversa de gente a maioria das linhas NÃO tem vocativo, e
   * exigi-lo era o que matava toda corrente no segundo elo.
   * Termina por SEIS razões independentes: `depth` cresce e é limitado por CADEIA_MAX (a única que não é
   * sorteio, e portanto a prova de que acaba); `CADEIA_P`/`CADEIA_SOLTA_P`; a JANELA de `CADEIA_JANELA`
   * elos, que proíbe A→B→A; os orçamentos por bot; o ORÇAMENTO DE CONVERSA (`this.conversa`); e a marca
   * `solta`, que impede uma fala espontânea de virar papo entre bots.
   */
  _encadeia(gp,txt,g){
    const d=(g&&g.depth|0)+1;
    if(d>BOT_LLM.CADEIA_MAX)return;
    if(!this.botChat||!this.botChat.ativo())return;   // sem LLM não há corrente: o repertório não conversa
    // A cadeia NÃO ganha `gp.slot` aqui: quem fala vira o `autor` da chamada abaixo, e é `_botResponde` que
    // anexa o autor ao agendar. Anexar nos dois lugares punha o mesmo slot duas vezes na lista.
    this._botResponde(gp,txt,{depth:d,cadeia:(g&&g.cadeia)||[],solta:!!(g&&g.solta)});}
  /**
   * Drena a fila agendada. Roda dentro do step(), que é de 60 Hz e percorre TODAS as salas do processo —
   * daí o teto por tick. Nada aqui espera: quando não dá para gerar, publica o repertório e segue.
   */
  _filaTick(){
    const fila=this.falaFila;if(!fila.length)return;
    if(this.over||this.phase!=='live'||!this.sessions.size){fila.length=0;return;}
    const tick=this.sim.tick,agora=Date.now();let n=0;
    for(let i=0;i<fila.length&&n<BOT_LLM.CORO_POP_MAX;){
      const it=fila[i];
      if(it.atTick>tick){i++;continue;}
      fila.splice(i,1);n++;
      // Envelhecida NA FILA (sala engarrafada): descarta antes de gastar geração. Este relógio é o da
      // espera proposital; o STALE_MS de `_falar` mede a LATÊNCIA da geração. Somá-los seria confundir
      // uma feature com uma falha.
      if(agora-it.pushAt>BOT_LLM.CORO_WAIT_MS){this._m('stale');continue;}
      const gp=this.sim.players.get(it.slot);
      if(gp!==it.gp||!gp||gp.dead)continue;
      const podeGerar=this.gerando<BOT_LLM.MAX_INFLIGHT_ROOM&&this.botChat&&this.botChat.ativo();
      if(podeGerar)this._falar(gp,it.g,it.fallback);
      // Elo de corrente sem LLM não tem o que dizer (`_fraseResposta` devolve null para `cadeia`), e a
      // DEVOLUÇÃO não é preciosismo: o débito acontece no AGENDAMENTO, então sem ela o teto da conversa
      // encolhe a cada elo que morreu calado — e a conversa seguinte nasce com o orçamento já gasto.
      else if(it.g&&it.g.kind==='cadeia'){this._m('teto');
        gp.mencoes=Math.max(0,(gp.mencoes|0)-1);
        this.conversa.gastas=Math.max(0,this.conversa.gastas-1);}
      else{this._m('teto');this._falarJa(gp,it.g,it.fallback);}}}
  // ── voz ──
  /**
   * Relay de um clipe de áudio. O servidor NÃO decodifica e NÃO guarda nada: valida tamanho/duração/cooldown
   * e reenvia os bytes. Companheiro ouve sempre (volume cheio); no Livre e no solo ouvem os VOICE.LISTENERS
   * mais próximos dentro de VOICE.DIST, e o cliente faz volume/estéreo pela distância com o mesmo cálculo
   * dos efeitos. Devolve false quando o clipe foi recusado.
   */
  /** Centro (média das peças vivas) de um jogador: de onde o áudio "sai" e por onde a distância é medida. */
  _centro(slot){const ps=this.sim.world.players.get(slot);let x=0,y=0,n=0;
    if(ps)for(const pc of ps.pieces){if(pc.dead)continue;x+=pc.x;y+=pc.y;n++;}
    return n?{x:x/n,y:y/n}:{x:0,y:0};}
  /**
   * De ONDE sai a fala. Um morto não tem peça, e `_centro` devolveria a origem do mundo — a voz dele nasceria
   * no canto do mapa e não alcançaria ninguém, nem para o estéreo do ouvinte. Para ele a origem é a CÂMERA
   * (`session.cx/cy`, escrita pelo snapshotter): no Livre é onde ele morreu, no Battle Royale é quem ele
   * assiste. É o que faz "ouço os mortos que estão vendo a mesma briga que eu" ser verdade.
   */
  _origemFala(session,gp){
    if(gp.dead)return{x:session.cx||0,y:session.cy||0};
    return this._centro(gp.slot);}
  /**
   * Quem ouve `gp`, no MESMO escopo do texto dele (`_escopoFala`): em equipe, a equipe inteira; morto no BR,
   * a arquibancada; senão a sala. Dentro do escopo, `room` e `dead` ainda cortam por distância e pelo teto
   * VOICE.LISTENERS — um clipe tem até VOICE.MAX_BYTES e difundir para os 49 mortos de um BR seriam ~2 MB
   * por fala. Para um morto a distância sai da câmera dele, que segue quem ele assiste: na prática ele ouve
   * os mortos que estão vendo a mesma briga.
   * O ícone de "falando" usa a MESMA lista do clipe — quem não ouviria o áudio não vê o ícone.
   */
  _ouvintes(gp,x,y,escopo){
    if(!escopo)escopo=this._escopoFala(gp,null);
    const perto=escopo!=='team';
    /** @type {{s:any,d:number}[]} */const alvos=[];
    for(const s of this.sessions.values()){
      if(!s.ws||s.slot===gp.slot)continue;
      const o=this.sim.players.get(s.slot);if(!o)continue;
      if(escopo==='team'){if(o.team===gp.team)alvos.push({s,d:0});continue;}
      if(escopo==='dead'&&!o.dead)continue;
      const d=Math.hypot((s.cx||0)-x,(s.cy||0)-y);if(d<=VOICE.DIST)alvos.push({s,d});}
    if(perto&&alvos.length>VOICE.LISTENERS){alvos.sort((a,b)=>a.d-b.d);alvos.length=VOICE.LISTENERS;}
    return alvos;}
  /**
   * O microfone de alguém ABRIU ou FECHOU. Chega no instante do Ctrl, muito antes do clipe (que só é
   * enviado quando a tecla é solta) — é o que faz o ícone em cima do planeta acompanhar quem está falando
   * de verdade, em vez de acender depois, junto com o áudio.
   * Vai em JSON de controle: o fio binário não precisa de versão nova para dois bits de estado.
   */
  talkState(session,on){
    const gp=this.sim.players.get(session.slot);if(!gp)return false;
    const agora=Date.now();
    if(on){
      if(agora-(session.talkAt||0)<VOICE.TALK_CD_MS)return false;   // anti-flood de quem martela o Ctrl
      session.talkAt=agora;
      gp.talkUntil=this.sim.tick+Math.ceil(VOICE.MAX_MS*TICK_HZ/1000);}   // teto: se o `off` se perder, apaga sozinho
    else{
      if(!gp.talkUntil)return false;
      gp.talkUntil=0;}
    this.sim.playersDirty=true;   // o placar acende/apaga o 🎤 pela flag TALK — nos DOIS sentidos
    const c=this._origemFala(session,gp),out={t:'talk',slot:gp.slot,on:!!on};
    for(const a of this._ouvintes(gp,c.x,c.y,this._escopoFala(gp,session.chatScope)))a.s.sendJson(out);
    return true;}
  voice(session,{codec=0,durMs=0,data}){
    const gp=this.sim.players.get(session.slot);if(!gp||!data)return false;
    if(data.length>VOICE.MAX_BYTES||durMs<VOICE.MIN_MS||durMs>VOICE.MAX_MS)return false;
    const now=Date.now();
    if(now-(session.voiceAt||0)<VOICE.CD_MS)return false;
    if(now-this.voiceAt>=1000){this.voiceAt=now;this.voiceN=0;}
    if(this.voiceN>=VOICE.ROOM_CPS)return false;                     // teto da SALA: 50 pessoas falando ao mesmo tempo é ruído, não conversa
    session.voiceAt=now;this.voiceN++;
    if(!session.talkAt){gp.talkUntil=this.sim.tick+Math.ceil(durMs*TICK_HZ/1000);this.sim.playersDirty=true;}   // cliente que não avisa o Ctrl: o ícone sai pelo tempo do clipe
    const {x,y}=this._origemFala(session,gp);
    const view=encodeVoice(this.writer,{slot:session.slot,codec,durMs,x,y,data});
    let busy=false;for(const a of this._ouvintes(gp,x,y,this._escopoFala(gp,session.chatScope)))if(!a.s.send(view))busy=true;
    if(busy)this.rotateWriter();
    return true;}
  // ── envio ──
  rotateWriter(){this.writer=createWriter(WRITER_SIZE);}
  broadcast(view){let busy=false;for(const s of this.sessions.values())if(s.ws&&!s.send(view))busy=true;if(busy)this.rotateWriter();}
  broadcastPlayers(){this.broadcast(encodePlayers(this.writer,this.sim.playersInfo()));}
  sendPlayers(session){if(!session.send(encodePlayers(this.writer,this.sim.playersInfo())))this.rotateWriter();}
  broadcastLeaderboard(){this.broadcast(encodeLeaderboard(this.writer,this.sim.leaderboard()));}   // TODOS os vivos: o HUD corta no top 10, o radar usa a lista inteira
  /**
   * KILL FEED. Vai em JSON de controle e para a SALA INTEIRA, sem AOI: um abate do outro lado do mapa é
   * exatamente o que o feed existe para contar (é o único lugar do jogo em que isso vale — `flushEvents`
   * continua filtrando os EFEITOS por AOI, porque explosão do outro lado do mapa não se vê nem se ouve).
   * Só SLOTS viajam; o nome sai de `view.playerOf` no cliente, o que faz o feed herdar o `anonBots` do
   * Battle Royale de graça.
   */
  broadcastFeed(){
    const v=drenaFeed(this.sim.feed);if(!v)return;
    for(const it of v){const a=this._nomeDe(it.a),b=this._nomeDe(it.b);
      if(it.k!=='sys'&&b){this.feedLog.push(a?`${a} killed ${b}`:`${b} died`);this.feedAt=this.sim.tick;}}
    if(this.feedLog.length>BOT_LLM.FEED_KEEP)this.feedLog.splice(0,this.feedLog.length-BOT_LLM.FEED_KEEP);
    const msg={t:'feed',v,at:Date.now()};
    for(const s of this.sessions.values())if(s.ws)s.sendJson(msg);}
  /** Nome de um slot, ou null. Usado pelo `feedLog` — o resto do fio só carrega slots. */
  _nomeDe(slot){if(slot==null||slot<0)return null;const gp=this.sim.players.get(slot);return gp?gp.name:null;}
  /** Enfileira uma linha de SISTEMA (largada, liderança, BIG CRUNCH, zona). */
  _pushFeed(o){if(o)this.sim._feed(o);}
  /**
   * AVATARES da sala (a skin "Retrato"). JSON de controle, e não o fio: é uma skin de 25 mil moedas e
   * nível 30, então quatro bytes por linha em TODO broadcast de PLAYERS seriam pagar por zeros em 49 dos
   * 50 jogadores. Difundido só quando o conjunto MUDA — entrar e sair de sala são eventos raros.
   */
  /**
   * AVISO GLOBAL do painel /admin. Uma faixa no HUD e uma linha de sistema no chat de quem está NA SALA.
   * ⚠️ Não passa por `_pushChat`: ele exige um GamePlayer e alimenta o `chatLog`, que é o prompt da LLM —
   * um aviso de manutenção ali faria os preenchimentos comentarem a manutenção.
   * ⚠️ Quem está no MENU não está em sala nenhuma e não recebe. É a limitação conhecida deste desenho, e a
   * saída (um aviso fixo em `/api/config`, que todo cliente lê no boot) fica para quando for preciso.
   * Devolve quantas sessões receberam.
   */
  notice(text,{level='info',ttlMs=NOTICE.TTL_MS}={}){
    const msg={t:'notice',text,level,at:Date.now(),ttlMs};let n=0;
    for(const s of this.sessions.values())if(s.ws){s.sendJson(msg);n++;}
    return n;}
  /**
   * O que o painel /admin mostra de uma sala. ⚠️ NUNCA junte isto ao `info()`: aquele alimenta o
   * `/api/rooms` PÚBLICO, e a lista de jogadores (com sessionId e IP) não pode sair por lá.
   */
  adminInfo({players=false}={}){
    const base={...this.info(),shard:this.shard,phase:this.phase,humans:this.humanCount,
      bots:this.sim.botCount(),tick:this.sim.tick,over:!!this.over};
    if(!players)return base;
    const lista=[];
    for(const [slot,s] of this.sessions){const gp=this.sim.players.get(slot);
      lista.push({slot,sessionId:s.sessionId||null,userId:s.userId??null,name:s.name||'',
        registered:!!(gp&&gp.registered),level:s.level|0,country:gp?gp.country||null:null,
        mass:gp?Math.round(this.sim.world.massOf(slot)):0,alive:!!(gp&&!gp.dead),
        connected:!!s.ws,ip:s.remoteAddr||null});}
    return{...base,players:lista};}
  /**
   * BANDEIRAS da sala (país de cada jogador, humano e preenchimento). JSON de controle, no molde exato de
   * `broadcastAvatars` e pelo mesmo motivo: dois bytes por linha em TODO broadcast de PLAYERS (que sai
   * várias vezes por segundo) para um dado que muda quando alguém entra ou sai é pagar caro por nada.
   * Difundido só quando o conjunto MUDA. Um `country` nulo simplesmente não entra na lista.
   */
  broadcastFlags(){
    this.flagsDirty=false;
    const list=[];
    for(const gp of this.sim.players.values())if(gp.country)list.push({slot:gp.slot,c:gp.country});
    const msg={t:'flags',list};
    for(const s of this.sessions.values())if(s.ws)s.sendJson(msg);}
  broadcastAvatars(){
    const list=[];
    for(const [slot,a] of this.avatars)if(a&&a.userId&&a.v)list.push({slot,userId:a.userId,v:a.v});
    const msg={t:'avatars',list};
    for(const s of this.sessions.values())if(s.ws)s.sendJson(msg);}
  _setAvatar(slot,userId,v){
    const antes=this.avatars.get(slot);
    if(v&&userId){if(antes&&antes.v===v&&antes.userId===userId)return;this.avatars.set(slot,{userId,v});}
    else{if(!antes)return;this.avatars.delete(slot);}
    this.broadcastAvatars();}
  flushEvents(){const evs=this.sim.wireEvents;if(!evs.length)return;
    for(let i=0;i<evs.length;i++){const e=evs[i];const view=encodeEvent(this.writer,e);let busy=false;
      for(const s of this.sessions.values()){if(!s.ws)continue;
        let meu=e.slotA===s.slot||e.slotB===s.slot;   // o que aconteceu COMIGO sempre chega: sugado pelo buraco, a câmera já saltou para a saída e a AOI cortaria o efeito
        if(!meu&&this.teamCount>0){const mim=this.sim.players.get(s.slot);   // e o que acontece com o meu TIME também: é a informação que faz jogar junto
          if(mim&&mim.team>=0){const a=this.sim.players.get(e.slotA),b=this.sim.players.get(e.slotB);
            meu=!!((a&&a.team===mim.team)||(b&&b.team===mim.team));}}
        if(!meu&&(!s.rect||!rectHas(s.rect,e.x,e.y,0)))continue;
        if(!s.send(view))busy=true;}
      if(busy)this.rotateWriter();}
    evs.length=0;}
  /**
   * Identidade ESTÁVEL de um participante, em ordem de confiança. O `sessionId` NÃO serve: ele é por VIDA
   * (um MatchSession novo a cada join), então agruparia errado justamente no caso que importa — o mesmo
   * humano morrendo e renascendo. O `resumeToken` da Session, sim: nasce no construtor e sobrevive ao
   * re-join, que é como o modo sem persistência reconhece a mesma pessoa.
   */
  _rosterKey(gp){
    if(gp.userId!=null)return 'u'+gp.userId;
    if(gp.isBot)return 'b'+gp.slot;                       // o bot renasce no próprio slot
    const s=this.sessions.get(gp.slot);
    if(s&&s.resumeToken)return 'r'+s.resumeToken;
    return 'n'+String(gp.name||'').toLowerCase();}
  /**
   * Dobra a vida atual no roster. Idempotente POR VIDA (`gp.rosterFolded`): vida nova é GamePlayer novo, e
   * a marca vem limpa. Acumula em vez de sobrescrever, senão o respawn zeraria o que a vida anterior fez.
   */
  _rosterFold(gp){
    if(!gp||gp.rosterFolded)return;gp.rosterFolded=true;
    const k=this._rosterKey(gp),massa=Math.round(this.sim.world.massOf(gp.slot)||0);
    let r=this.roster.get(k);
    if(!r){r={key:k,name:gp.name,registered:!!gp.registered,skinId:gp.skinId|0,level:gp.level|0,isBot:!!gp.isBot,
      lives:0,kills:0,deaths:0,food:0,score:0,mass:0,slot:gp.slot,left:false};this.roster.set(k,r);}
    r.name=gp.name;r.skinId=gp.skinId|0;r.level=gp.level|0;r.slot=gp.slot;
    r.lives++;r.kills+=gp.kills+gp.botKills;r.deaths+=gp.deaths|0;r.food+=gp.food|0;
    r.score+=gp.score|0;if(massa>r.mass)r.mass=massa;
    return r;}
  /** Marca no roster que a pessoa não está mais na sala (a linha continua no placar, esmaecida). */
  _rosterLeft(gp){const r=this.roster.get(this._rosterKey(gp));if(r)r.left=true;}
  /**
   * Junta o placar do MUNDO (vivos por massa, o 1º é o campeão) com o roster da SALA, e tira os quatro
   * destaques. Vivos primeiro — "o campeão é o maior planeta vivo no BIG CRUNCH" é a semântica de sempre.
   */
  _mergeBoard(live){
    const porSlot=new Map(live.map(b=>[b.slot,b]));
    const vivos=[],resto=[];
    for(const r of this.roster.values()){
      const b=porSlot.get(r.slot),vivo=!!b&&!r.left;
      const linha={slot:r.slot,key:r.key,name:r.name,mass:vivo?b.mass:0,score:Math.max(r.score,vivo?b.score:0),
        kills:Math.max(r.kills,vivo?b.kills:0),deaths:r.deaths,food:r.food,
        kd:kdOf(Math.max(r.kills,vivo?b.kills:0),r.deaths),level:r.level,
        skinId:r.skinId,registered:r.registered,isBot:this.mode.anonBots?false:r.isBot,
        left:r.left,lives:r.lives};
      (vivo?vivos:resto).push(linha);}
    vivos.sort((a,b)=>b.mass-a.mass);resto.sort((a,b)=>b.score-a.score);
    const board=vivos.concat(resto);
    board.forEach((b,i)=>{b.placement=i+1;});
    const melhor=(cmp,filtro)=>{let m=null;for(const b of board){if(filtro&&!filtro(b))continue;if(!m||cmp(b,m)>0)m=b;}return m;};
    const destaques={
      campeao:board[0]||null,
      // MAIS PONTOS é o único destaque que não sai do tamanho nem da violência: pontua quem comeu muito
      // grão, quem catou fragmento, quem devorou gente — a rodada inteira num número só. Ele existe porque
      // o `score` sempre viajou no roundEnd e a tela NUNCA o mostrou; e ele ficou com o lugar do cartão
      // "Campeão", que era repetição do degrau maior do pódio, logo acima. O campeão continua no payload:
      // agora é a FAIXA em cima do pódio que o desenha.
      pontuador:melhor((a,b)=>a.score-b.score,b=>b.score>0),
      glutao:melhor((a,b)=>a.food-b.food,b=>b.food>0),
      carrasco:melhor((a,b)=>a.kills-b.kills,b=>b.kills>0),
      // Piso de abates: numa rodada de 30 min quase ninguém passa de 5, e sem ele "maior K/D" é sempre de
      // quem fez UM abate e não morreu — o que não é o prêmio que alguém quer ganhar nem ver ganhar.
      letal:melhor((a,b)=>a.kd-b.kd||a.kills-b.kills,b=>b.kills>=ROUND.AWARD_MIN_KILLS)};
    return{board:board.slice(0,ROUND.BOARD_MAX),destaques,total:board.length};}
  /** Fim do mundo: placar + campeão (maior planeta vivo), persistência de todos e sala aposentada. */
  endRound(reason='time'){
    if(this.over)return;this.over=true;this.endedAt=Date.now();this.endReason=reason;
    // O campeão é fotografado ANTES do endRound: `leaderboard()` só lista VIVOS, então uma morte simultânea
    // (dois últimos se comendo no mesmo tick, ou a zona levando os dois) deixava `champion` nulo.
    const ultimo=this.champion||(this.sim.leaderboard().length?null:null);
    const live=this.sim.endRound(reason);
    // Quem ainda estava no mundo entra no roster agora; quem saiu ou morreu já entrou no seu momento.
    for(const gp of this.sim.players.values())this._rosterFold(gp);
    const {board,destaques,total}=this._mergeBoard(live);
    let champion=board.length?board[0]:null;
    if(ultimo&&(!champion||champion.slot!==ultimo.slot))champion=board.find(b=>b.slot===ultimo.slot)||champion;
    const msg={t:'roundEnd',code:this.code,reason,mode:this.modeId,teamSize:this.teamSize,champion,
      champTeam:champion&&champion.team!=null?champion.team:null,
      board,destaques,total,nextInMs:ROUND.BREAK_MS,tick:this.sim.tick};
    // O board é cortado em ROUND.BOARD_MAX (com respawn, 30 min rendem mais de 100 participantes), mas
    // ninguém pode ficar de fora do PRÓPRIO placar: quem não coube vai anexado na mensagem da sessão dele.
    const noBoard=new Set(board.map(b=>b.key));
    for(const s of this.sessions.values()){
      const gp=this.sim.players.get(s.slot);
      const k=gp?this._rosterKey(gp):null,r=k&&!noBoard.has(k)?this.roster.get(k):null;
      s.sendJson(r?{...msg,mine:{name:r.name,kills:r.kills,deaths:r.deaths,food:r.food,kd:kdOf(r.kills,r.deaths),
        score:r.score,mass:r.mass,skinId:r.skinId,level:r.level,left:r.left}}:msg);}
    this.broadcastPlayers();
    this.log.info(`sala ${this.code}: fim (${reason}) — campeão ${champion?champion.name:'ninguém'} (${champion?Math.round(champion.mass):0})`);}
  // ── passo ──
  step(){
    const sim=this.sim;if(this.over)return;
    // ── AQUECIMENTO: a sala roda de verdade (o jogador cai no mundo e come), mas ninguém morre e não há zona.
    // É a fila do matchmaking sendo jogável, em vez de uma tela de espera com um contador. `w.peace` faz todo
    // mundo virar aliado, então a espera não precisou de nenhuma regra própria.
    // ── LOBBY: o mundo roda (comida, asteroides, estrelas ficam prontos), mas ninguém tem peça. O jogador
    // vê a sala ENCHENDO e a contagem. Nada de snapshot aqui: sem peça não há o que enquadrar, e o foco da
    // AOI de um jogador sem corpo seria NaN.
    if(this.phase==='lobby'){
      sim.step();
      if(sim.playersDirty){sim.playersDirty=false;this.broadcastPlayers();}
      if(this.flagsDirty)this.broadcastFlags();
      this.lobbyTick();
      return;}
    if(this.mode.zone&&this.zone)this.tickZone();
    // ⚠️ `this.roundTicks&&` não é redundante: com 0 (SEM FIM) a comparação `0>=0` é VERDADEIRA no primeiro
    // tick, e a sala do dono acabaria antes de existir. O fim continua alcançável por `lastAlive` e pelo
    // `close` do painel.
    if(this.roundTicks&&sim.tick-this.roundStart>=this.roundTicks){this.endRound('time');return;}
    this._chegadaBots();
    sim.step();
    if(sim.botTalk.length)this.botChatTick();
    if(this.falaFila.length)this._filaTick();
    if(this.digitaFila.length)this._digitaTick();   // o que já "acabou de digitar" entra no chat agora
    // Último vivo: fotografa quem sobrou ANTES de fechar, senão o placar de vivos já está vazio.
    if(this.mode.lastAlive&&sim.aliveTeams()<=1){
      const lb=sim.leaderboard();
      if(lb.length){const gp=sim.players.get(lb[0].slot);if(gp)this.champion={slot:gp.slot,team:gp.team};}
      this.endRound('lastAlive');return;}
    this._flush(sim);}
  /**
   * Apaga o "está falando" de quem estourou o prazo (morto incluído: ele fala, então a varredura não pode mais
   * apagar o 🎤 dele meio segundo depois de acender). A flag TALK é calculada ao vivo em `playersInfo`, mas o
   * PLAYERS só é DIFUNDIDO quando algo marca `playersDirty` — sem esta varredura o 🎤 acendia e ficava lá
   * até o próximo evento de sala (alguém entrar, morrer, trocar de equipe), que pode não vir nunca.
   * A 2 Hz, sobre ≤ 50 jogadores: mais barato que qualquer contabilidade incremental.
   */
  _expiraFala(sim,t){
    for(const gp of sim.players.values())
      if(gp.talkUntil&&t>=gp.talkUntil){gp.talkUntil=0;sim.playersDirty=true;}}
  /**
   * Estado de espírito dos preenchimentos, na MESMA passada de 2 Hz que já apaga o 🎤 — zero laço novo.
   * Dois gatilhos que não existem como evento de física: estar sendo caçado agora, e ter assumido a ponta.
   * Como tudo desemboca em `botChatTick` (que sorteia UM da fila e joga o resto fora), acrescentar gatilho
   * não aumenta o número de falas: aumenta a chance de a única que sai ser sobre algo que está acontecendo.
   */
  _humor(sim,t){
    if(this.phase!=='live'||!this.sessions.size)return;
    const lider=sim.leaderboard()[0];
    for(const gp of sim.players.values()){
      if(!gp.isBot||gp.dead||!gp.brain)continue;
      if(gp.brain.mode==='flee'&&gp.brain.press>1.5&&gp.brain.target>=0){
        const o=sim.players.get(gp.brain.target);
        if(o&&!o.isBot)sim._talk(gp.slot,'cacado',o.name);}   // só quando quem persegue é GENTE: é para ele que a fala serve
      if(lider&&lider.slot===gp.slot&&gp._eraLider!==true)sim._talk(gp.slot,'lider',null);
      gp._eraLider=lider&&lider.slot===gp.slot;}}
  /**
   * INICIATIVA: um preenchimento PUXA ASSUNTO. Até aqui a conversa só nascia de um humano digitar — e uma
   * sala em que ninguém NUNCA começa nada é tão estranha quanto uma em que ninguém fala. O que não pode
   * acontecer é o bot INVENTAR assunto: o que ele diz sai do que está acontecendo (o líder, o gás, quem
   * acabou de morrer), pela mesma `_ctxFala` de sempre.
   * ⚠️ Não passa por `botChatTick` de propósito: lá UM item é sorteado da leva e o resto vai fora, e a
   * iniciativa perderia a loteria para qualquer abate do mesmo tick. Orçamento próprio.
   */
  _iniciativaTick(sim,t){
    if(this.phase!=='live'||this.over||!this.botChat)return;
    if(!this.sessions.size)return;                                   // sem plateia, puxar assunto é falar sozinho
    if(this.iniciativas>=BOT_TALK.INICIATIVA_MAX_PER_MATCH)return;
    if(t-this.iniciativaAt<BOT_TALK.INICIATIVA_CD_TICKS)return;
    if(t-this.falaAt<BOT_TALK.SILENCIO_TICKS)return;                 // a sala está calada há SILENCIO_TICKS
    // ...e calada DE VERDADE: nada em voo. Uma sala com fala na fila não está em silêncio, está esperando
    // alguém terminar de digitar — e falar por cima disso é o coro que o resto do arquivo evita.
    if(this.falaFila.length||this.digitaFila.length||this.gerando)return;
    if(t<this.conversa.ate)return;                                   // a conversa anterior mal esfriou
    const gp=this._quemPuxa(sim,t);if(!gp)return;
    const a=escolheAssunto(this._panoDeFundo(gp));
    gp.talked=(gp.talked|0)+1;gp.talkedAt=t;this.botTalkAt=t;        // gasta o MESMO orçamento do espontâneo
    this.iniciativaAt=t;this.iniciativas++;
    // A iniciativa ABRE conversa — é para isso que ela existe —, com METADE do orçamento: quem puxou
    // assunto sozinho não tem o crédito de quem foi chamado por um humano.
    this.conversa={n:this.conversa.n+1,gastas:1,teto:BOT_LLM.CONVERSA_MAX_GER_BOT,ate:t+BOT_LLM.CONVERSA_CD_TICKS,solta:true};
    this._m('puxa');
    this._falar(gp,{kind:'puxa',assunto:a.assunto,quem:a.quem,solta:true},()=>this._fraseFixa(gp,'puxa'));}
  /**
   * QUEM PUXA: quem a sala está OLHANDO. O líder, se for preenchimento e couber no orçamento; senão o
   * preenchimento mais PERTO de um humano — é o planeta que a pessoa tem na tela, e uma linha dele lê como
   * alguém falando do lado. Sorteio puro poria a fala num bot do outro canto do mapa, sobre nada.
   * `leaderboard()` já traz x,y de TODOS os vivos e é cacheado por tick: custo zero.
   */
  _quemPuxa(sim,t){
    const rows=sim.leaderboard();
    const ok=gp=>gp&&gp.isBot&&!gp.dead&&(gp.talked|0)<BOT_TALK.MAX_PER_MATCH
      &&t-(gp.talkedAt??-1e9)>=BOT_TALK.BOT_CD_TICKS;
    const lider=rows.length?sim.players.get(rows[0].slot):null;
    if(ok(lider))return lider;
    const humanos=rows.filter(r=>{const g=sim.players.get(r.slot);return g&&!g.isBot;});
    if(!humanos.length)return null;
    let melhor=null,d2=Infinity;
    for(const r of rows){const gp=sim.players.get(r.slot);if(!ok(gp))continue;
      for(const h of humanos){const dx=r.x-h.x,dy=r.y-h.y,d=dx*dx+dy*dy;if(d<d2){d2=d;melhor=gp;}}}
    return melhor;}
  /**
   * Os números da PARTIDA que o assunto usa. Extraído de `_ctxFala` porque `escolheAssunto` precisa deles
   * ANTES de existir um gatilho — e repetir a conta criaria duas verdades sobre a mesma sala.
   */
  _panoDeFundo(gp){
    const sim=this.sim,rows=sim.leaderboard();
    const lider=rows.length?rows[0]:null,minha=rows.find(r=>r.slot===gp.slot);
    const zt=this.zone?zoneNextIn(this.zone,sim.tick):Infinity;
    return{vivos:sim.aliveCount(),
      fracLider:lider&&minha&&lider.mass>0?minha.mass/lider.mass:0,
      lider:lider&&lider.slot!==gp.slot?this._nomeDe(lider.slot):null,
      zonaS:Number.isFinite(zt)&&zt>0?Math.round(zt/TICK_HZ):0,
      feedFresco:sim.tick-this.feedAt<BOT_LLM.FEED_FRESCO_TICKS&&this.feedLog.length>0};}
  /** Envio por tick: PLAYERS se mudou, snapshots a 20 Hz, eventos por AOI e o placar a 2 Hz. */
  _flush(sim){
    const t=sim.tick;
    if(t%LEADERBOARD_EVERY===0){this._expiraFala(sim,t);this._humor(sim,t);this._iniciativaTick(sim,t);}
    if(sim.playersDirty){sim.playersDirty=false;this.broadcastPlayers();}
    if(t%SNAPSHOT_EVERY===0){this.snapshotter.beginTick();for(const s of this.sessions.values())this.snapshotter.send(s);this.flushEvents();sim.gone.clear();}
    else if(sim.wireEvents.length>=200)this.flushEvents();
    if(t%LEADERBOARD_EVERY===0){
      const rows=this.sim.leaderboard();
      this.broadcastLeaderboard();if(this.zone)this.broadcastZone();
      // Marcos: `leaderboard()` é cacheado por tick, então isto não custa varredura nenhuma.
      if(this.phase==='live'&&!this.over){
        this._pushFeed(this.feed.leadStep(rows,t));
        if(this.roundTicks)this._pushFeed(this.feed.crunchStep(this.roundLeft()));}}   // sem fim não há BIG CRUNCH para anunciar
    if(this.sim.feed.length)this.broadcastFeed();}

}

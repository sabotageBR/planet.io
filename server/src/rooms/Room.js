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
import {SNAPSHOT_EVERY,LEADERBOARD_EVERY,TICK_HZ,NET,BOT,BOT_NAMES,botNick,BOT_CHAT,BOT_TALK,BOT_LLM,botTypo,ROUND,ROOM,PLAYER,MODE,modeOf,modeCap,BR,CHAT,VOICE,FEED} from '@planet/shared/constants.js';
import {createWriter,encodePlayers,encodeLeaderboard,encodeEvent,encodeZone,encodeVoice} from '@planet/shared/protocol/index.js';
import {rectHas} from '@planet/shared/camera.js';
import {createRng} from '@planet/shared/rng.js';
import {kdOf} from '@planet/shared/levels.js';
import {createZone,stepZone,zoneAt} from '@planet/shared/zone.js';
import {EVENT} from '@planet/shared/protocol/constants.js';
import {Sim} from '../sim/Sim.js';
import {createSnapshotter} from '../net/snapshot.js';
import {createFeed,drenaFeed} from './feed.js';
import {pickPersona} from './botPersonas.js';
// `aberta` é função PURA (classifica a mensagem), então vem por import e não pelo objeto injetado: só a
// LLM é dependência de verdade, e um `botChat` falso de teste não deveria precisar reimplementá-la.
import {aberta} from './botChat.js';
const WRITER_SIZE=32768,BOT_SKINS=35;   // bots usam skins 0..34 (compráveis; nada de "earned"/secretas)
export class Room{
  /** @param {{code:string,shard:number,seed:number,hooks:any,log:any,metrics:any,config:{roomMax:number,roomBots:number},onRewards?:Function}} o */
  constructor({code,shard,seed,hooks,log,metrics,config,onRewards=null,mode=MODE.FREE,teamSize=1,botChat=null}){
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
    this.roundTicks=this.mode.lobby?this.mode.roundTicks:(config.roundTicks||ROUND.TICKS);
    this.lobbyTicks=config.lobbyTicks||BR.LOBBY_TICKS;   // env LOBBY_TICKS: testar a largada sem esperar 30 s
    // lobby: ninguém está no MAPA ainda. `lobbyUntil` é a janela em que os humanos que procuram battle
    // royale caem juntos; `startsAt` só é escrito quando a contagem regressiva começa (0 = ainda enchendo).
    this.phase=this.mode.lobby?'lobby':'live';this.lobbyStart=0;this.lobbyUntil=0;this.startsAt=0;this.nextBotAt=0;this.zone=null;
    this.usedNicks=new Set();this.lobbyAt=0;
    // ninguém tem peça no lobby, mas a paz fica ligada como cinto de segurança: se um dia alguém nascer
    // cedo por engano, não vira almoço antes de a partida existir
    this.sim.world.peace=this.phase==='lobby';
    /** @type {Map<string,number>} código de party → equipe (para os amigos caírem juntos) */this.parties=new Map();
    this.roundStart=0;this.over=false;this.endedAt=0;this.endReason='time';this.champion=null;this.voiceAt=0;this.voiceN=0;this.botTalkAt=-1e9;/** @type {string[]} */this.ditas=[];
    // fala gerada (Ollama): opcional em tudo — sem ela a sala volta ao repertório fixo de BOT_CHAT
    this.botChat=botChat;this.mencaoAt=-1e9;this.ultimoBot=null;
    /** @type {{name:string,text:string,team:number,bot:boolean}[]} últimas CHAT.KEEP linhas: é o que a LLM lê como conversa */
    this.chatLog=[];
    /** Marcos do kill feed (troca de líder, BIG CRUNCH): o orçamento das linhas de SISTEMA. */
    this.feed=createFeed();
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
      s.sendJson({t:'dead',by:info.by,byHole:info.byHole,byZone:info.byZone,score:info.score,maxMass:info.maxMass,kills:info.kills,durationS:info.durationS,placement:info.placement,players:info.players});
      // Livre: a câmera fica PARADA onde o jogador morreu (`slot:-1` → a AOI congela na última posição) —
      // ali a partida não tem fim nem placar para acompanhar, e sair passeando atrás da tela de morte
      // desorienta. Battle Royale mantém o espectador: assiste quem te matou, ou o companheiro vivo.
      // Nos dois casos as setas ‹ › (spectatePick) continuam funcionando para quem quiser seguir alguém.
      this.spectateTargetFor(s,this.mode.lastAlive?info.bySlot:-2);});
    this.sim.on('rewards',({slot,sessionId,rewards})=>{const s=this.sessions.get(slot);
      if(s&&s.sessionId===sessionId)s.deliverRewards(rewards);else if(this.onRewards)this.onRewards(sessionId,rewards);});}
  // ── ciclo de vida ──
  start(){if(this.running)return;this.running=true;this.topUpBots();}
  stop(){this.running=false;}
  topUpBots(team=-1){let have=this.sim.botCount();
    for(;have<this.botCount;have++)this._nasceBot({name:this._botNome(),team});}
  /**
   * O nome de um preenchimento. `realNicks` (os dois modos) usa o gerador de APELIDOS — "trovao_137",
   * "xXzecaXx", "Bia" —, que é o que faz a sala parecer cheia de gente. Os 60 nomes temáticos de BOT_NAMES
   * ("Nebulox", "Cassiona") ficam de reserva: eles denunciavam o preenchimento pelo nome, mesmo quando o
   * resto do jogo não denunciava. `usedNicks` já carrega os nicks dos humanos, então não há colisão.
   */
  _botNome(){return this.mode.realNicks?botNick(this.rng,this.usedNicks):BOT_NAMES[this._botName++%BOT_NAMES.length];}
  /**
   * Um preenchimento nasce aqui, e não em `Sim.addBot`, porque nome, skin e HISTÓRIA são coisas da sala —
   * o Sim é construído nos testes sem nada disso. `level` é sorteado junto com o nome de gente: badge de
   * nível zerado ao lado de um apelido plausível seria o denunciador que o apelido acabou de tirar.
   */
  _nasceBot({name,team=-1,spawn=true}){
    const gp=this.sim.addBot(this.freeSlot(),{name,skinId:this.rng.int(0,BOT_SKINS-1),team,spawn,
      level:this.mode.realNicks?this.rng.int(1,35):0});
    gp.persona=pickPersona(this.rng,this._personas);
    return gp;}
  /** Par que faltava do topUpBots: tira bots (o Battle Royale abre vaga para humano até o último segundo). */
  trimBots(n){let k=n;
    for(const gp of [...this.sim.players.values()])
      if(k>0&&gp.isBot){this.sim.remove(gp.slot);k--;}   // Sim.remove marca as peças com REMOVE.DESPAWN, que o snapshot já traduz
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
    players:this.sessions.size,max:this.max,bots:this.sim.botCount(),round:this.roundLeft()};}
  /** Bloco `round` do JSON `room`: tick de início, duração e hora do relógio do espaço no início. */
  roundInfo(){return{start:this.roundStart,ticks:this.roundTicks,dayStart:ROUND.DAY_START_H,breakMs:ROUND.BREAK_MS,
    // `days` vem do SERVIDOR de propósito. Os ticks da rodada saem do env (ROUND_TICKS) e os dias eram uma
    // constante do CLIENTE — cliente novo com env velho desenhava o relógio do espaço na metade da
    // velocidade, e nada na tela dizia por quê. Custa 1 número num JSON que já é mandado uma vez por join.
    days:ROUND.DAYS,
    phase:this.phase,
    // TICK absoluto, não "faltam N ms": o cliente já sincroniza o relógio do servidor, e uma duração relativa
    // o obrigaria a saber há quanto tempo a mensagem chegou — que é justamente onde a contagem errava.
    startsAt:this.startsAt||0};}
  /** Segundos restantes da rodada (0 se já acabou). */
  roundLeft(){const left=(this.roundStart+this.roundTicks-this.sim.tick)/TICK_HZ;return left>0?Math.round(left):0;}
  // ── sessões ──
  /** Entra no menor slot livre. Devolve o slot. */
  join(session,{name,registered=false,skinId=0,sessionId=null,userId=null,level=0,party=null}){
    const lobby=this.phase==='lobby';
    if(lobby&&this.sim.players.size>=this.max)this.trimBots(1);   // a vaga é do humano
    const slot=this.freeSlot(),team=this._teamFor(party);
    this.usedNicks.add(String(name||'').toLowerCase());           // o preenchimento não pode repetir o nick de quem está na sala
    this.sim.addHuman(slot,{name,registered,skinId,sessionId,userId,team,level,spawn:!lobby});
    if(lobby&&!this.lobbyUntil){this.lobbyStart=this.sim.tick;this.lobbyUntil=this.sim.tick+this.lobbyTicks;}   // a janela começa no PRIMEIRO humano
    const pc=this.sim.world.piecesOf(slot)[0];if(pc){session.cx=pc.x;session.cy=pc.y;}
    session.room=this;session.slot=slot;session.known.clear();session.rect=null;session.specSlot=-1;this.sessions.set(slot,session);this.lastHumanAt=Date.now();
    if(session.avatar&&session.userId)this._setAvatar(slot,session.userId,session.avatar);
    if(lobby)this.broadcastLobby();
    return slot;}
  /** Sai de vez: onMatchEnd(cause) se ainda vivo, remove do mundo. */
  leave(session,cause='left'){
    const slot=session.slot;if(this.sessions.get(slot)!==session)return;const gp=this.sim.players.get(slot);
    if(gp&&!gp.dead&&gp.sessionId){const hooks=this.sim.hooks;
      Promise.resolve().then(()=>hooks.onMatchEnd({sessionId:gp.sessionId,cause,killedBySessionId:null,score:gp.score,maxMass:Math.round(gp.maxMass),durationMs:Math.round((this.sim.tick-gp.joinedTick)*1000/TICK_HZ)}))
        .catch(e=>this.log.warn(`onMatchEnd('${cause}') falhou:`,e&&e.message));}
    if(gp){this._rosterFold(gp);this._rosterLeft(gp);}   // ⚠️ antes do remove: depois dele o GamePlayer não existe mais
    if(this.avatars.has(slot))this._setAvatar(slot,null,null);
    this.sim.remove(slot);this.sessions.delete(slot);session.room=null;session.slot=-1;session.known.clear();session.specSlot=-1;this.lastHumanAt=Date.now();}
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
    return{t:'dead',by:i.by,byHole:i.byHole,byZone:i.byZone,score:i.score,maxMass:i.maxMass,kills:i.kills,durationS:i.durationS,placement:i.placement,players:i.players};}
  /** Expira sessões sem socket há mais de NET.RESUME_MS (chamado a cada 1 s pelo RoomManager). */
  housekeeping(now){for(const s of this.sessions.values())if(!s.ws&&now-s.disconnectedAt>NET.RESUME_MS){this.leave(s,'left');this.log.info(`${s.name} saiu da sala ${this.code} (sessão expirada)`);}}
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
        const ps=w.players.get(gp.slot);if(ps)ps.missiles=BR.START_AMMO;
        gp.score=0;gp.maxMass=0;gp.joinedTick=w.tick;});}
    // 3. a partida começa: relógio, zona e fim da paz
    this.roundStart=w.tick;this.zone=createZone(w.tick);w.setZone(this.zone);w.peace=false;this.phase='live';this.startsAt=0;
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
   * Uma linha de chat. O escopo vem do MODE (`room` no Livre e no Battle Royale solo, `team` em equipe) — em
   * equipe o chat é a ferramenta tática e virar megafone de 50 pessoas o mataria. Morto lê, não escreve.
   * Devolve false quando a mensagem foi engolida (vazia, longa demais ou fora do intervalo).
   */
  chat(session,text){
    const gp=this.sim.players.get(session.slot);if(!gp)return false;
    const msg=String(text||'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,CHAT.MAX_CHARS);
    if(!msg)return false;
    const now=Date.now();
    if(!session.chatAt)session.chatAt=[];
    session.chatAt=session.chatAt.filter(t=>now-t<CHAT.RATE_MS*CHAT.BURST);
    if(session.chatAt.length>=CHAT.BURST)return false;   // rate limit PRÓPRIO, além do balde de JSON: aquele protege o servidor, este protege a tela dos outros
    session.chatAt.push(now);
    this._pushChat(gp,msg);
    this._botResponde(gp,msg);
    return true;}
  /** Difusão de uma linha já validada, no escopo do modo. Caminho comum do humano e do preenchimento. */
  _pushChat(gp,msg){
    const out={t:'chat',slot:gp.slot,name:gp.name,team:gp.team<0?null:gp.team,text:msg,at:Date.now()};
    // Até aqui o servidor era só um repetidor e não guardava uma linha. Sem histórico não há conversa para
    // ler — e sem conversa a fala gerada não passa de outro repertório fixo, só que mais caro.
    this.chatLog.push({name:gp.name,text:msg,team:gp.team,bot:!!gp.isBot});
    if(this.chatLog.length>CHAT.KEEP)this.chatLog.shift();
    const escopo=this.mode.chat==='team'&&gp.team>=0?'team':'room';
    for(const s of this.sessions.values()){if(!s.ws)continue;
      if(escopo==='team'){const o=this.sim.players.get(s.slot);if(!o||o.team!==gp.team)continue;}
      s.sendJson(out);}}
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
    const g=fila[this.rng.int(0,fila.length-1)];fila.length=0;
    const gp=sim.players.get(g.slot);if(!gp||!gp.isBot)return;
    if(gp.talked>=BOT_TALK.MAX_PER_MATCH||tick-(gp.talkedAt||-1e9)<BOT_TALK.BOT_CD_TICKS)return;
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
   */
  _falar(gp,g,fallback){
    const publica=txt=>{if(!txt)return;
      this.ditas.push(txt);if(this.ditas.length>BOT_TALK.NO_REPEAT)this.ditas.shift();
      this.ultimoBot=gp;this._pushChat(gp,txt);
      this._encadeia(gp,txt,g);};   // ← a corrente bot↔bot nasce AQUI, o único ponto por onde toda fala de bot passa
    if(!this.botChat||!this.botChat.ativo()){publica(fallback());return;}
    const nasceu=Date.now(),slot=gp.slot;
    this.gerando++;
    this.botChat.gerar(this._ctxFala(gp,g)).then(txt=>{
      if(this.over||this.phase!=='live'||!this.sessions.size)return;
      if(this.sim.players.get(slot)!==gp||gp.dead)return;
      if(Date.now()-nasceu>BOT_LLM.STALE_MS)return;
      publica(txt||fallback());
    }).catch(e=>{if(this.log)this.log.debug(`fala do bot falhou: ${e&&e.message}`);})
      .finally(()=>{this.gerando--;});}
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
    // em equipe o chat é fechado: o bot não pode reagir ao que foi dito em outra equipe (nem soube dele)
    const hist=this.chatLog.filter(l=>!equipe||l.team===gp.team).slice(-BOT_LLM.HIST);
    const rows=sim.leaderboard(),rank=rows.findIndex(r=>r.slot===gp.slot)+1;
    return{nome:gp.name,
      persona:gp.brain?gp.brain.p.id:null,pericia:gp.brain?gp.brain.s.id:null,
      historia:gp.persona||null,
      rank:rank||0,vivos:sim.aliveCount(),
      estado:this._estado(gp),agressor:this._agressor(gp),
      modo:this.mode.lastAlive?'battle royale, last one standing':'free-for-all',
      equipe,kind:g.kind,quem:g.quem||null,texto:g.texto||null,historico:hist};}
  /**
   * Alguém escreveu no chat. Um bot responde quando é CHAMADO — e ninguém digita o apelido inteiro e certo
   * no meio de uma partida, então a comparação é por raiz, sufixo e distância (`botChat.citou`). Sem
   * citação nenhuma, só quem acabou de falar tem direito a uma réplica, e raramente: o padrão continua
   * sendo o silêncio, senão o chat vira dois bots conversando sozinhos por cima do jogo.
   * Sem LLM não há resposta: o repertório fixo não sabe responder a nada, e responder fora de contexto é
   * pior do que não responder.
   */
  _botResponde(autor,texto,o={}){
    const bc=this.botChat;if(!bc||!bc.ativo()||this.phase!=='live'||this.over)return;
    const sim=this.sim,tick=sim.tick,depth=o.depth|0,cadeia=o.cadeia||[];
    // O cooldown de SALA vale para o que o humano diz; na corrente ele é pulado de propósito — quem
    // segura a corrente é a profundidade, e uma réplica que chega 7 s depois já não é réplica.
    if(!depth&&tick-this.mencaoAt<BOT_LLM.MENTION_ROOM_CD_TICKS)return;
    const equipe=this.mode.chat==='team'&&autor.team>=0;
    const cands=[];
    for(const gp of sim.players.values()){
      if(!gp.isBot||gp.dead||gp.slot===autor.slot)continue;
      if(equipe&&gp.team!==autor.team)continue;                                   // não ouviu, não responde
      if(cadeia.includes(gp.slot))continue;                                       // já falou nesta linha: nada de ping-pong A→B→A
      if(tick-(gp.mencaoAt||-1e9)<BOT_LLM.MENTION_BOT_CD_TICKS)continue;
      if((gp.mencoes|0)>=BOT_LLM.MAX_MENTION_PER_MATCH)continue;
      cands.push(gp);
      if(cands.length>=BOT_LLM.CADEIA_SCAN_MAX)break;}   // teto do custo de `citou` (Levenshtein por palavra × candidatos)
    if(!cands.length)return;
    const citados=cands.filter(gp=>bc.citou(texto,gp.name));
    // ── quem responde, e quantos ──
    /** @type {{gp:any,kind:string}[]} */const escolhidos=[];
    if(citados.length){
      // Chamado pelo nome: quem foi chamado responde, e rápido. Até dois — três pessoas respondendo a
      // uma provocação dirigida a UMA delas é coro, não conversa.
      if(depth?this.rng.chance(BOT_LLM.CADEIA_P):this.rng.chance(BOT_LLM.MENTION_P)){
        const pool=citados.slice();
        const n=Math.min(pool.length,depth?1:BOT_LLM.CORO_MAX_CITADOS);
        for(let i=0;i<n;i++)escolhidos.push({gp:pool.splice(this.rng.int(0,pool.length-1),1)[0],kind:depth?'cadeia':'mention'});}
    }else if(!depth){
      // Ninguém citado. Pergunta jogada para a SALA vale coro; frase solta continua valendo só a réplica
      // rara de quem falou por último, exatamente como antes.
      const tipo=aberta(texto,false);
      if(tipo==='pergunta'){
        const n=this._sorteiaCoro(cands.length);
        const pool=cands.slice();
        for(let i=0;i<n&&pool.length;i++)escolhidos.push({gp:pool.splice(this.rng.int(0,pool.length-1),1)[0],kind:'coro'});}
      else if(this.ultimoBot&&cands.includes(this.ultimoBot)&&this.rng.chance(BOT_LLM.REPLY_P))
        escolhidos.push({gp:this.ultimoBot,kind:'reply'});}
    if(!escolhidos.length)return;
    // ── agendamento escalonado ──
    // Três respostas saindo no mesmo tick é coro de robô. Chegando com 0,3 s / 1,3 s / 2,6 s de diferença,
    // parece gente digitando em velocidades diferentes — que é o que são.
    let d=this.rng.range(BOT_LLM.CORO_D0_MS[0],BOT_LLM.CORO_D0_MS[1]);
    for(const {gp,kind} of escolhidos){
      // O orçamento é debitado AQUI, no agendamento — nunca no callback. Se esperasse a resposta, dois
      // gatilhos no mesmo tick passariam os dois pela porta.
      gp.mencaoAt=tick;gp.mencoes=(gp.mencoes|0)+1;this.mencaoAt=tick;
      this._agenda(gp,{kind,quem:autor.name,texto,depth,cadeia:cadeia.concat(autor.slot)},d);
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
    this.ultimoBot=gp;this._pushChat(gp,txt);}
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
   * Corrente bot↔bot. Só continua quando a linha GERADA cita alguém pelo nome — e a frase do repertório
   * nunca cita ninguém, então a corrente morre sozinha ali, sem caso especial.
   * Termina por cinco razões independentes: `depth` cresce e é limitado; exige citação; `CADEIA_P` mata
   * parte das correntes; `cadeia` proíbe repetir slot; e os orçamentos por bot continuam valendo.
   */
  _encadeia(gp,txt,g){
    const d=(g&&g.depth|0)+1;
    if(d>BOT_LLM.CADEIA_MAX)return;
    if(!this.botChat||!this.botChat.ativo())return;   // sem LLM não há corrente: o repertório não conversa
    // A cadeia NÃO ganha `gp.slot` aqui: quem fala vira o `autor` da chamada abaixo, e é `_botResponde` que
    // anexa o autor ao agendar. Anexar nos dois lugares punha o mesmo slot duas vezes na lista.
    this._botResponde(gp,txt,{depth:d,cadeia:(g&&g.cadeia)||[]});}
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
   * Quem ouve `gp`: em equipe, a equipe inteira; senão os VOICE.LISTENERS mais próximos dentro de
   * VOICE.DIST. O ícone de "falando" usa a MESMA lista do clipe — quem não ouviria o áudio não vê o ícone.
   */
  _ouvintes(gp,x,y){
    const equipe=this.mode.chat==='team'&&gp.team>=0;
    /** @type {{s:any,d:number}[]} */const alvos=[];
    for(const s of this.sessions.values()){
      if(!s.ws||s.slot===gp.slot)continue;
      const o=this.sim.players.get(s.slot);if(!o)continue;
      if(equipe){if(o.team===gp.team)alvos.push({s,d:0});continue;}
      const d=Math.hypot((s.cx||0)-x,(s.cy||0)-y);if(d<=VOICE.DIST)alvos.push({s,d});}
    if(!equipe&&alvos.length>VOICE.LISTENERS){alvos.sort((a,b)=>a.d-b.d);alvos.length=VOICE.LISTENERS;}
    return alvos;}
  /**
   * O microfone de alguém ABRIU ou FECHOU. Chega no instante do Ctrl, muito antes do clipe (que só é
   * enviado quando a tecla é solta) — é o que faz o ícone em cima do planeta acompanhar quem está falando
   * de verdade, em vez de acender depois, junto com o áudio.
   * Vai em JSON de controle: o fio binário não precisa de versão nova para dois bits de estado.
   */
  talkState(session,on){
    const gp=this.sim.players.get(session.slot);if(!gp||gp.dead)return false;
    const agora=Date.now();
    if(on){
      if(agora-(session.talkAt||0)<VOICE.TALK_CD_MS)return false;   // anti-flood de quem martela o Ctrl
      session.talkAt=agora;
      gp.talkUntil=this.sim.tick+Math.ceil(VOICE.MAX_MS*TICK_HZ/1000);}   // teto: se o `off` se perder, apaga sozinho
    else{
      if(!gp.talkUntil)return false;
      gp.talkUntil=0;}
    this.sim.playersDirty=true;   // o placar acende/apaga o 🎤 pela flag TALK — nos DOIS sentidos
    const c=this._centro(gp.slot),out={t:'talk',slot:gp.slot,on:!!on};
    for(const a of this._ouvintes(gp,c.x,c.y))a.s.sendJson(out);
    return true;}
  voice(session,{codec=0,durMs=0,data}){
    const gp=this.sim.players.get(session.slot);if(!gp||gp.dead||!data)return false;
    if(data.length>VOICE.MAX_BYTES||durMs<VOICE.MIN_MS||durMs>VOICE.MAX_MS)return false;
    const now=Date.now();
    if(now-(session.voiceAt||0)<VOICE.CD_MS)return false;
    if(now-this.voiceAt>=1000){this.voiceAt=now;this.voiceN=0;}
    if(this.voiceN>=VOICE.ROOM_CPS)return false;                     // teto da SALA: 50 pessoas falando ao mesmo tempo é ruído, não conversa
    session.voiceAt=now;this.voiceN++;
    if(!session.talkAt){gp.talkUntil=this.sim.tick+Math.ceil(durMs*TICK_HZ/1000);this.sim.playersDirty=true;}   // cliente que não avisa o Ctrl: o ícone sai pelo tempo do clipe
    const {x,y}=this._centro(session.slot);
    const view=encodeVoice(this.writer,{slot:session.slot,codec,durMs,x,y,data});
    let busy=false;for(const a of this._ouvintes(gp,x,y))if(!a.s.send(view))busy=true;
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
    const msg={t:'feed',v,at:Date.now()};
    for(const s of this.sessions.values())if(s.ws)s.sendJson(msg);}
  /** Enfileira uma linha de SISTEMA (largada, liderança, BIG CRUNCH, zona). */
  _pushFeed(o){if(o)this.sim._feed(o);}
  /**
   * AVATARES da sala (a skin "Retrato"). JSON de controle, e não o fio: é uma skin de 25 mil moedas e
   * nível 30, então quatro bytes por linha em TODO broadcast de PLAYERS seriam pagar por zeros em 49 dos
   * 50 jogadores. Difundido só quando o conjunto MUDA — entrar e sair de sala são eventos raros.
   */
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
      this.lobbyTick();
      return;}
    if(this.mode.zone&&this.zone)this.tickZone();
    if(sim.tick-this.roundStart>=this.roundTicks){this.endRound('time');return;}
    sim.step();
    if(sim.botTalk.length)this.botChatTick();
    if(this.falaFila.length)this._filaTick();
    // Último vivo: fotografa quem sobrou ANTES de fechar, senão o placar de vivos já está vazio.
    if(this.mode.lastAlive&&sim.aliveTeams()<=1){
      const lb=sim.leaderboard();
      if(lb.length){const gp=sim.players.get(lb[0].slot);if(gp)this.champion={slot:gp.slot,team:gp.team};}
      this.endRound('lastAlive');return;}
    this._flush(sim);}
  /**
   * Apaga o "está falando" de quem estourou o prazo. A flag TALK é calculada ao vivo em `playersInfo`, mas o
   * PLAYERS só é DIFUNDIDO quando algo marca `playersDirty` — sem esta varredura o 🎤 acendia e ficava lá
   * até o próximo evento de sala (alguém entrar, morrer, trocar de equipe), que pode não vir nunca.
   * A 2 Hz, sobre ≤ 50 jogadores: mais barato que qualquer contabilidade incremental.
   */
  _expiraFala(sim,t){
    for(const gp of sim.players.values())
      if(gp.talkUntil&&(t>=gp.talkUntil||gp.dead)){gp.talkUntil=0;sim.playersDirty=true;}}
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
  /** Envio por tick: PLAYERS se mudou, snapshots a 20 Hz, eventos por AOI e o placar a 2 Hz. */
  _flush(sim){
    const t=sim.tick;
    if(t%LEADERBOARD_EVERY===0){this._expiraFala(sim,t);this._humor(sim,t);}
    if(sim.playersDirty){sim.playersDirty=false;this.broadcastPlayers();}
    if(t%SNAPSHOT_EVERY===0){this.snapshotter.beginTick();for(const s of this.sessions.values())this.snapshotter.send(s);this.flushEvents();sim.gone.clear();}
    else if(sim.wireEvents.length>=200)this.flushEvents();
    if(t%LEADERBOARD_EVERY===0){
      const rows=this.sim.leaderboard();
      this.broadcastLeaderboard();if(this.zone)this.broadcastZone();
      // Marcos: `leaderboard()` é cacheado por tick, então isto não custa varredura nenhuma.
      if(this.phase==='live'&&!this.over){
        this._pushFeed(this.feed.leadStep(rows,t));
        this._pushFeed(this.feed.crunchStep(this.roundLeft()));}}
    if(this.sim.feed.length)this.broadcastFeed();}

}

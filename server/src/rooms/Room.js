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
import {SNAPSHOT_EVERY,LEADERBOARD_EVERY,TICK_HZ,NET,BOT,BOT_NAMES,botNick,BOT_CHAT,BOT_TALK,BOT_LLM,botTypo,ROUND,ROOM,PLAYER,MODE,modeOf,modeCap,BR,CHAT,VOICE} from '@planet/shared/constants.js';
import {createWriter,encodePlayers,encodeLeaderboard,encodeEvent,encodeZone,encodeVoice} from '@planet/shared/protocol/index.js';
import {rectHas} from '@planet/shared/camera.js';
import {createRng} from '@planet/shared/rng.js';
import {createZone,stepZone,zoneAt} from '@planet/shared/zone.js';
import {EVENT} from '@planet/shared/protocol/constants.js';
import {Sim} from '../sim/Sim.js';
import {createSnapshotter} from '../net/snapshot.js';
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
    this.writer=createWriter(WRITER_SIZE);this.snapshotter=createSnapshotter(this);this._botName=this.rng.int(0,BOT_NAMES.length-1);this.onRewards=onRewards;
    this.sim.on('death',info=>{const s=this.sessions.get(info.slot);if(!s)return;
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
    for(;have<this.botCount;have++)this.sim.addBot(this.freeSlot(),{name:BOT_NAMES[this._botName++%BOT_NAMES.length],skinId:this.rng.int(0,BOT_SKINS-1),team});}
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
    phase:this.phase,
    // TICK absoluto, não "faltam N ms": o cliente já sincroniza o relógio do servidor, e uma duração relativa
    // o obrigaria a saber há quanto tempo a mensagem chegou — que é justamente onde a contagem errava.
    startsAt:this.startsAt||0};}
  /** Segundos restantes da rodada (0 se já acabou). */
  roundLeft(){const left=(this.roundStart+this.roundTicks-this.sim.tick)/TICK_HZ;return left>0?Math.round(left):0;}
  // ── sessões ──
  /** Entra no menor slot livre. Devolve o slot. */
  join(session,{name,registered=false,skinId=0,sessionId=null,userId=null,party=null}){
    const lobby=this.phase==='lobby';
    if(lobby&&this.sim.players.size>=this.max)this.trimBots(1);   // a vaga é do humano
    const slot=this.freeSlot(),team=this._teamFor(party);
    this.usedNicks.add(String(name||'').toLowerCase());           // o preenchimento não pode repetir o nick de quem está na sala
    this.sim.addHuman(slot,{name,registered,skinId,sessionId,userId,team,spawn:!lobby});
    if(lobby&&!this.lobbyUntil){this.lobbyStart=this.sim.tick;this.lobbyUntil=this.sim.tick+this.lobbyTicks;}   // a janela começa no PRIMEIRO humano
    const pc=this.sim.world.piecesOf(slot)[0];if(pc){session.cx=pc.x;session.cy=pc.y;}
    session.room=this;session.slot=slot;session.known.clear();session.rect=null;session.specSlot=-1;this.sessions.set(slot,session);this.lastHumanAt=Date.now();
    if(lobby)this.broadcastLobby();
    return slot;}
  /** Sai de vez: onMatchEnd(cause) se ainda vivo, remove do mundo. */
  leave(session,cause='left'){
    const slot=session.slot;if(this.sessions.get(slot)!==session)return;const gp=this.sim.players.get(slot);
    if(gp&&!gp.dead&&gp.sessionId){const hooks=this.sim.hooks;
      Promise.resolve().then(()=>hooks.onMatchEnd({sessionId:gp.sessionId,cause,killedBySessionId:null,score:gp.score,maxMass:Math.round(gp.maxMass),durationMs:Math.round((this.sim.tick-gp.joinedTick)*1000/TICK_HZ)}))
        .catch(e=>this.log.warn(`onMatchEnd('${cause}') falhou:`,e&&e.message));}
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
    const nome=()=>this.mode.anonBots?botNick(this.rng,this.usedNicks):BOT_NAMES[this._botName++%BOT_NAMES.length];
    if(this.teamCount>0)
      for(let t=0;t<this.teamCount&&sim.players.size<n;t++){
        let falta=this.teamSize-this._teamSizeAll(t);
        while(falta-->0&&sim.players.size<n)
          sim.addBot(this.freeSlot(),{name:nome(),skinId:this.rng.int(0,BOT_SKINS-1),team:t,spawn:!lobby});}
    while(sim.players.size<n)
      sim.addBot(this.freeSlot(),{name:nome(),skinId:this.rng.int(0,BOT_SKINS-1),team:this._teamFor(null),spawn:!lobby});}
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
      this._talkAlgum(this.sim.aliveCount()<=BOT.GAS.LATE_ALIVE?'poucos':'zona');}}
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
      this.ultimoBot=gp;this._pushChat(gp,txt);};
    if(!this.botChat||!this.botChat.ativo()){publica(fallback());return;}
    const nasceu=Date.now(),slot=gp.slot;
    this.botChat.gerar(this._ctxFala(gp,g)).then(txt=>{
      if(this.over||this.phase!=='live'||!this.sessions.size)return;
      if(this.sim.players.get(slot)!==gp||gp.dead)return;
      if(Date.now()-nasceu>BOT_LLM.STALE_MS)return;
      publica(txt||fallback());
    }).catch(e=>{if(this.log)this.log.debug(`fala do bot falhou: ${e&&e.message}`);});}
  /** O que a LLM precisa saber para escrever uma linha: quem é o bot, o que aconteceu e o que o chat disse. */
  _ctxFala(gp,g){
    const sim=this.sim,equipe=this.mode.chat==='team'&&gp.team>=0;
    // em equipe o chat é fechado: o bot não pode reagir ao que foi dito em outra equipe (nem soube dele)
    const hist=this.chatLog.filter(l=>!equipe||l.team===gp.team).slice(-BOT_LLM.HIST);
    return{nome:gp.name,
      persona:gp.brain?gp.brain.p.id:null,pericia:gp.brain?gp.brain.s.id:null,
      massa:Math.round(sim.world.massOf(gp.slot)||0),vivos:sim.aliveCount(),
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
  _botResponde(autor,texto){
    const bc=this.botChat;if(!bc||!bc.ativo()||this.phase!=='live'||this.over)return;
    const sim=this.sim,tick=sim.tick;
    if(tick-this.mencaoAt<BOT_LLM.MENTION_ROOM_CD_TICKS)return;
    const equipe=this.mode.chat==='team'&&autor.team>=0;
    const cands=[];
    for(const gp of sim.players.values()){
      if(!gp.isBot||gp.dead||gp.slot===autor.slot)continue;
      if(equipe&&gp.team!==autor.team)continue;                                   // não ouviu, não responde
      if(tick-(gp.mencaoAt||-1e9)<BOT_LLM.MENTION_BOT_CD_TICKS)continue;
      if((gp.mencoes|0)>=BOT_LLM.MAX_MENTION_PER_MATCH)continue;
      cands.push(gp);}
    if(!cands.length)return;
    const citados=cands.filter(gp=>bc.citou(texto,gp.name));
    let alvo=null,kind='mention';
    if(citados.length){
      if(!this.rng.chance(BOT_LLM.MENTION_P))return;
      alvo=citados[this.rng.int(0,citados.length-1)];}
    else if(this.ultimoBot&&cands.includes(this.ultimoBot)&&this.rng.chance(BOT_LLM.REPLY_P)){
      alvo=this.ultimoBot;kind='reply';}
    if(!alvo)return;
    alvo.mencaoAt=tick;alvo.mencoes=(alvo.mencoes|0)+1;this.mencaoAt=tick;
    this._falar(alvo,{kind,quem:autor.name,texto},()=>null);}
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
  /** Fim do mundo: placar + campeão (maior planeta vivo), persistência de todos e sala aposentada. */
  endRound(reason='time'){
    if(this.over)return;this.over=true;this.endedAt=Date.now();this.endReason=reason;
    // O campeão é fotografado ANTES do endRound: `leaderboard()` só lista VIVOS, então uma morte simultânea
    // (dois últimos se comendo no mesmo tick, ou a zona levando os dois) deixava `champion` nulo.
    const ultimo=this.champion||(this.sim.leaderboard().length?null:null);
    const board=this.sim.endRound(reason);
    let champion=board.length?board[0]:null;
    if(ultimo&&(!champion||champion.slot!==ultimo.slot))champion=board.find(b=>b.slot===ultimo.slot)||champion;
    const msg={t:'roundEnd',code:this.code,reason,mode:this.modeId,teamSize:this.teamSize,champion,
      champTeam:champion&&champion.team!=null?champion.team:null,
      board,nextInMs:ROUND.BREAK_MS,tick:this.sim.tick};   // a sala inteira: cortar deixava o humano de fora do próprio placar quando havia muito bot
    for(const s of this.sessions.values())s.sendJson(msg);
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
  /** Envio por tick: PLAYERS se mudou, snapshots a 20 Hz, eventos por AOI e o placar a 2 Hz. */
  _flush(sim){
    const t=sim.tick;
    if(t%LEADERBOARD_EVERY===0)this._expiraFala(sim,t);
    if(sim.playersDirty){sim.playersDirty=false;this.broadcastPlayers();}
    if(t%SNAPSHOT_EVERY===0){this.snapshotter.beginTick();for(const s of this.sessions.values())this.snapshotter.send(s);this.flushEvents();sim.gone.clear();}
    else if(sim.wireEvents.length>=200)this.flushEvents();
    if(t%LEADERBOARD_EVERY===0){this.broadcastLeaderboard();if(this.zone)this.broadcastZone();}}

}

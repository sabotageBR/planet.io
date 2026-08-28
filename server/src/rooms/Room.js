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
import {SNAPSHOT_EVERY,LEADERBOARD_EVERY,TICK_HZ,NET,BOT_NAMES,ROUND,ROOM,PLAYER,MODE,modeOf,modeCap,SURVIVAL,CHAT,VOICE} from '@planet/shared/constants.js';
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
  constructor({code,shard,seed,hooks,log,metrics,config,onRewards=null,mode=MODE.FREE,teamSize=1}){
    this.code=code;this.shard=shard;this.seed=seed;this.rng=createRng(seed);this.log=log;this.metrics=metrics;
    this.mode=modeOf(mode);this.modeId=this.mode.id;
    this.teamSize=this.mode.teamSizes.includes(teamSize)?teamSize:this.mode.teamSizes[0];
    this.sim=new Sim({seed,hooks,log,rng:this.rng,mode:this.modeId});
    /** @type {Map<number,import('../net/Session.js').Session>} */this.sessions=new Map();
    this.createdAt=Date.now();this.lastHumanAt=Date.now();this.running=false;
    // Livre: o env continua mandando (roomMax/roomBots), senão publicar este arquivo mudaria o balanço em produção.
    // Sobrevivência: quem manda é o modo, e a capacidade fecha no tamanho de equipe (modeCap).
    this.max=this.mode.warmup?modeCap(this.modeId,this.teamSize):config.roomMax;
    this.botCount=this.mode.warmup?0:config.roomBots;
    this.roundTicks=this.mode.warmup?this.mode.roundTicks:(config.roundTicks||ROUND.TICKS);
    this.warmupTicks=config.warmupTicks||SURVIVAL.WARMUP_TICKS;   // env WARMUP_TICKS: testar o começo da partida sem esperar 45 s
    this.phase=this.mode.warmup?'warmup':'live';this.warmupUntil=0;this.fullAt=0;this.zone=null;
    // a paz vale desde o tick ZERO do aquecimento: deixá-la para o primeiro step abria uma janela em que
    // quem entrasse podia ser comido antes de a partida existir
    this.sim.world.peace=this.phase==='warmup';
    /** @type {Map<string,number>} código de party → equipe (para os amigos caírem juntos) */this.parties=new Map();
    this.roundStart=0;this.over=false;this.endedAt=0;this.endReason='time';this.champion=null;this.voiceAt=0;this.voiceN=0;
    this.writer=createWriter(WRITER_SIZE);this.snapshotter=createSnapshotter(this);this._botName=this.rng.int(0,BOT_NAMES.length-1);this.onRewards=onRewards;
    this.sim.on('death',info=>{const s=this.sessions.get(info.slot);if(!s)return;
      s.sendJson({t:'dead',by:info.by,byHole:info.byHole,byZone:info.byZone,score:info.score,maxMass:info.maxMass,kills:info.kills,durationS:info.durationS,placement:info.placement,players:info.players});
      this.spectateTargetFor(s,info.bySlot);});   // a tela de morte mostra a sala continuando: assiste quem matou (ou o líder)
    this.sim.on('rewards',({slot,sessionId,rewards})=>{const s=this.sessions.get(slot);
      if(s&&s.sessionId===sessionId)s.deliverRewards(rewards);else if(this.onRewards)this.onRewards(sessionId,rewards);});}
  // ── ciclo de vida ──
  start(){if(this.running)return;this.running=true;this.topUpBots();}
  stop(){this.running=false;}
  topUpBots(team=-1){let have=this.sim.botCount();
    for(;have<this.botCount;have++)this.sim.addBot(this.freeSlot(),{name:BOT_NAMES[this._botName++%BOT_NAMES.length],skinId:this.rng.int(0,BOT_SKINS-1),team});}
  /** Par que faltava do topUpBots: tira bots (o Sobrevivência abre vaga para humano até o último segundo). */
  trimBots(n){let k=n;
    for(const gp of [...this.sim.players.values()])
      if(k>0&&gp.isBot){this.sim.remove(gp.slot);k--;}   // Sim.remove marca as peças com REMOVE.DESPAWN, que o snapshot já traduz
    return n-k;}
  freeSlot(){let s=0;while(this.sim.players.has(s))s++;return s;}
  get humanCount(){return this.sessions.size;}
  isFull(){return this.sessions.size>=this.max;}
  /**
   * Porta ÚNICA de entrada da sala (o RoomManager e o wsServer perguntam só isto). No Livre é o `isFull` de
   * sempre; no Sobrevivência ela fecha quando a partida começa — quem morreu não volta para a mesma sala,
   * vai para uma nova, que é exatamente o que "sem respawn" quer dizer.
   */
  acceptsJoin(){return !this.over&&!this.isFull()&&(this.phase!=='live'||!this.mode.warmup);}
  info(){return{code:this.code,shard:this.shard,mode:this.modeId,teamSize:this.teamSize,phase:this.phase,open:this.acceptsJoin(),
    players:this.sessions.size,max:this.max,bots:this.sim.botCount(),round:this.roundLeft()};}
  /** Bloco `round` do JSON `room`: tick de início, duração e hora do relógio do espaço no início. */
  roundInfo(){return{start:this.roundStart,ticks:this.roundTicks,dayStart:ROUND.DAY_START_H,breakMs:ROUND.BREAK_MS,
    phase:this.phase,
    // TICK absoluto, não "faltam N ms": o cliente já sincroniza o relógio do servidor, e uma duração relativa
    // o obrigaria a saber há quanto tempo a mensagem chegou — que é justamente onde a contagem errava.
    startsAt:this.phase==='warmup'?(this.fullAt||this.warmupUntil||0):0};}
  /** Segundos restantes da rodada (0 se já acabou). */
  roundLeft(){const left=(this.roundStart+this.roundTicks-this.sim.tick)/TICK_HZ;return left>0?Math.round(left):0;}
  // ── sessões ──
  /** Entra no menor slot livre. Devolve o slot. */
  join(session,{name,registered=false,skinId=0,sessionId=null,userId=null,party=null}){
    const slot=this.freeSlot(),team=this._teamFor(party);
    this.sim.addHuman(slot,{name,registered,skinId,sessionId,userId,team});
    if(this.mode.warmup&&!this.warmupUntil)this.warmupUntil=this.sim.tick+this.warmupTicks;   // o relógio da espera começa no PRIMEIRO humano
    const pc=this.sim.world.piecesOf(slot)[0];if(pc){session.cx=pc.x;session.cy=pc.y;}
    session.room=this;session.slot=slot;session.known.clear();session.rect=null;session.specSlot=-1;this.sessions.set(slot,session);this.lastHumanAt=Date.now();
    if(this.phase==='warmup')this.broadcastPhase();
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
    if(slot<0&&this.teamCount>0){const mim=sim.players.get(session.slot);   // em equipe, morrer é virar câmera do companheiro (não de quem me comeu)
      if(mim&&mim.team>=0)for(const gp of sim.players.values())if(gp.team===mim.team&&gp.slot!==session.slot&&alive(gp.slot)){slot=gp.slot;break;}}
    if(slot<0){const lb=sim.top(1);if(lb.length&&alive(lb[0].slot))slot=lb[0].slot;}
    if(slot!==session.specSlot){session.specSlot=slot;const gp=slot>=0?sim.players.get(slot):null;
      session.sendJson({t:'spectate',slot,name:gp?gp.name:null});}
    return slot;}
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
    if(this.phase!=='warmup')return;
    const sim=this.sim,w=sim.world;
    // 1. bots preenchem os buracos: primeiro as equipes incompletas, depois as vazias
    if(this.teamCount>0){
      for(let t=0;t<this.teamCount;t++){let falta=this.teamSize-this._teamSizeAll(t);
        while(falta-->0&&sim.players.size<SURVIVAL.PLAYERS)
          sim.addBot(this.freeSlot(),{name:BOT_NAMES[this._botName++%BOT_NAMES.length],skinId:this.rng.int(0,BOT_SKINS-1),team:t});}}
    else{this.botCount=sim.botCount()+Math.max(0,SURVIVAL.PLAYERS-sim.players.size);this.topUpBots(-1);}   // PLAYERS é o TOTAL: humanos já ocupam parte das vagas
    // 2. todo mundo recomeça igual, num anel espaçado (companheiros lado a lado)
    const cx=w.w/2,cy=w.h/2,rad=Math.min(w.w,w.h)*SURVIVAL.SPAWN_RING;
    const grupos=new Map();
    for(const gp of sim.players.values()){const k=gp.team>=0?`t${gp.team}`:`s${gp.slot}`;
      if(!grupos.has(k))grupos.set(k,[]);grupos.get(k).push(gp);}
    const n=grupos.size;let i=0;
    for(const arr of grupos.values()){const an=i/n*Math.PI*2+this.rng.next()*.05;i++;
      const gx=cx+Math.cos(an)*rad,gy=cy+Math.sin(an)*rad;
      arr.forEach((gp,j)=>{const off=j*90,a2=an+Math.PI/2;
        w.respawnPlayer(gp.slot,{x:gx+Math.cos(a2)*off,y:gy+Math.sin(a2)*off,r:PLAYER.START_R,score:0});
        const ps=w.players.get(gp.slot);if(ps)ps.missiles=SURVIVAL.START_AMMO;
        gp.score=0;gp.maxMass=0;gp.joinedTick=w.tick;});}
    // 3. a partida começa: relógio, zona e fim da paz
    this.roundStart=w.tick;this.zone=createZone(w.tick);w.setZone(this.zone);w.peace=false;this.phase='live';
    sim.playersDirty=true;
    this.broadcastPhase();this.broadcastZone();
    this.log.info(`sala ${this.code}: partida começou — ${sim.humanCount()} humano(s), ${sim.botCount()} bot(s), equipes de ${this.teamSize}`);}
  _teamSizeAll(t){let n=0;for(const gp of this.sim.players.values())if(gp.team===t)n++;return n;}
  /** O `room` de novo, agora com a fase nova: relógio, contagem e céu do cliente saem todos do bloco `round`. */
  broadcastPhase(){const msg={t:'phase',code:this.code,phase:this.phase,round:this.roundInfo(),
    players:this.sim.humanCount(),cap:this.max,teamSize:this.teamSize,mode:this.modeId};
    for(const s of this.sessions.values())s.sendJson(msg);}
  // ── zona ──
  broadcastZone(){if(this.zone)this.broadcast(encodeZone(this.writer,this.zone));}
  tickZone(){
    const ev=stepZone(this.zone,this.sim.tick,this.rng);
    if(!ev)return;
    this.broadcastZone();
    if(ev==='shrink'){const c=zoneAt(this.zone,this.sim.tick);
      this.sim.wireEvents.push({kind:EVENT.ZONE_SHRINK,x:c.x,y:c.y,r:this.zone.r1,slotA:0xffff,slotB:0xffff,extra:(this.zone.t1-this.zone.t0)>>>0});}}
  // ── chat ──
  /**
   * Uma linha de chat. O escopo vem do MODE (`room` no Livre e no Sobrevivência solo, `team` em equipe) — em
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
    const out={t:'chat',slot:session.slot,name:gp.name,team:gp.team<0?null:gp.team,text:msg,at:now};
    const escopo=this.mode.chat==='team'&&gp.team>=0?'team':'room';
    for(const s of this.sessions.values()){if(!s.ws)continue;
      if(escopo==='team'){const o=this.sim.players.get(s.slot);if(!o||o.team!==gp.team)continue;}
      s.sendJson(out);}
    return true;}
  // ── voz ──
  /**
   * Relay de um clipe de áudio. O servidor NÃO decodifica e NÃO guarda nada: valida tamanho/duração/cooldown
   * e reenvia os bytes. Companheiro ouve sempre (volume cheio); no Livre e no solo ouvem os VOICE.LISTENERS
   * mais próximos dentro de VOICE.DIST, e o cliente faz volume/estéreo pela distância com o mesmo cálculo
   * dos efeitos. Devolve false quando o clipe foi recusado.
   */
  voice(session,{codec=0,durMs=0,data}){
    const gp=this.sim.players.get(session.slot);if(!gp||gp.dead||!data)return false;
    if(data.length>VOICE.MAX_BYTES||durMs<VOICE.MIN_MS||durMs>VOICE.MAX_MS)return false;
    const now=Date.now();
    if(now-(session.voiceAt||0)<VOICE.CD_MS)return false;
    if(now-this.voiceAt>=1000){this.voiceAt=now;this.voiceN=0;}
    if(this.voiceN>=VOICE.ROOM_CPS)return false;                     // teto da SALA: 50 pessoas falando ao mesmo tempo é ruído, não conversa
    session.voiceAt=now;this.voiceN++;
    gp.talkUntil=this.sim.tick+Math.ceil(durMs*TICK_HZ/1000);this.sim.playersDirty=true;   // acende o ícone de "falando" no PLAYERS
    const w=this.sim.world,ps=w.players.get(session.slot);
    let x=0,y=0,nn=0;if(ps)for(const pc of ps.pieces){if(pc.dead)continue;x+=pc.x;y+=pc.y;nn++;}
    if(nn){x/=nn;y/=nn;}
    const view=encodeVoice(this.writer,{slot:session.slot,codec,durMs,x,y,data});
    const equipe=this.mode.chat==='team'&&gp.team>=0;
    /** @type {{s:any,d:number}[]} */const alvos=[];
    for(const s of this.sessions.values()){
      if(!s.ws||s.slot===session.slot)continue;
      const o=this.sim.players.get(s.slot);if(!o)continue;
      if(equipe){if(o.team===gp.team)alvos.push({s,d:0});continue;}
      const d=Math.hypot((s.cx||0)-x,(s.cy||0)-y);if(d<=VOICE.DIST)alvos.push({s,d});}
    if(!equipe&&alvos.length>VOICE.LISTENERS){alvos.sort((a,b)=>a.d-b.d);alvos.length=VOICE.LISTENERS;}
    let busy=false;for(const a of alvos)if(!a.s.send(view))busy=true;
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
    if(this.phase==='warmup'){
      sim.step();
      this._flush(sim);
      if(this.readyToStart())this.begin();
      return;}
    if(this.mode.zone&&this.zone)this.tickZone();
    if(sim.tick-this.roundStart>=this.roundTicks){this.endRound('time');return;}
    sim.step();
    // Último vivo: fotografa quem sobrou ANTES de fechar, senão o placar de vivos já está vazio.
    if(this.mode.lastAlive&&sim.aliveTeams()<=1){
      const lb=sim.leaderboard();
      if(lb.length){const gp=sim.players.get(lb[0].slot);if(gp)this.champion={slot:gp.slot,team:gp.team};}
      this.endRound('lastAlive');return;}
    this._flush(sim);}
  /** Envio por tick: PLAYERS se mudou, snapshots a 20 Hz, eventos por AOI e o placar a 2 Hz. */
  _flush(sim){
    const t=sim.tick;
    if(sim.playersDirty){sim.playersDirty=false;this.broadcastPlayers();}
    if(t%SNAPSHOT_EVERY===0){this.snapshotter.beginTick();for(const s of this.sessions.values())this.snapshotter.send(s);this.flushEvents();sim.gone.clear();}
    else if(sim.wireEvents.length>=200)this.flushEvents();
    if(t%LEADERBOARD_EVERY===0){this.broadcastLeaderboard();if(this.zone)this.broadcastZone();}}
  /**
   * A espera acabou? Lotou → FULL_START_TICKS de contagem; senão, WARMUP_TICKS desde o primeiro humano.
   * Sala vazia nunca começa (e o RoomManager a recolhe sozinho depois de ROOM.STOP_AFTER_MS).
   */
  readyToStart(){
    const n=this.sim.humanCount();
    if(n<SURVIVAL.MIN_HUMANS)return false;
    if(n>=this.max){if(!this.fullAt)this.fullAt=this.sim.tick+SURVIVAL.FULL_START_TICKS;return this.sim.tick>=this.fullAt;}
    this.fullAt=0;
    return this.warmupUntil>0&&this.sim.tick>=this.warmupUntil;}
}

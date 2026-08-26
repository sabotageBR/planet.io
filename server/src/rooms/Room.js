// ── ROOM: {code, shard, sim, sessions, writer}; step() é chamado pelo Scheduler ─
// A cada passo: sim.step() → PLAYERS se mudou → dead/rewards (listeners) → a cada SNAPSHOT_EVERY
// snapshots por sessão + EVENTs por AOI → a cada LEADERBOARD_EVERY o placar. Um writer por sala:
// cada encode devolve uma vista reutilizada; se um socket ficou com bytes pendentes trocamos de
// writer (o antigo fica com o socket até drenar) em vez de copiar a cada envio.
// @ts-check
import {SNAPSHOT_EVERY,LEADERBOARD_EVERY,TICK_HZ,NET,BOT_NAMES} from '@planet/shared/constants.js';
import {createWriter,encodePlayers,encodeLeaderboard,encodeEvent} from '@planet/shared/protocol/index.js';
import {rectHas} from '@planet/shared/camera.js';
import {createRng} from '@planet/shared/rng.js';
import {Sim} from '../sim/Sim.js';
import {createSnapshotter} from '../net/snapshot.js';
const WRITER_SIZE=32768,LB_ROWS=10,BOT_SKINS=35;   // bots usam skins 0..34 (compráveis; nada de "earned"/secretas)
export class Room{
  /** @param {{code:string,shard:number,seed:number,hooks:any,log:any,metrics:any,config:{roomMax:number,roomBots:number},onRewards?:Function}} o */
  constructor({code,shard,seed,hooks,log,metrics,config,onRewards=null}){
    this.code=code;this.shard=shard;this.seed=seed;this.rng=createRng(seed);this.log=log;this.metrics=metrics;
    this.sim=new Sim({seed,hooks,log,rng:this.rng});
    /** @type {Map<number,import('../net/Session.js').Session>} */this.sessions=new Map();
    this.createdAt=Date.now();this.lastHumanAt=Date.now();this.running=false;this.max=config.roomMax;this.botCount=config.roomBots;
    this.writer=createWriter(WRITER_SIZE);this.snapshotter=createSnapshotter(this);this._botName=this.rng.int(0,BOT_NAMES.length-1);this.onRewards=onRewards;
    this.sim.on('death',info=>{const s=this.sessions.get(info.slot);if(s)s.sendJson({t:'dead',by:info.by,byHole:info.byHole,score:info.score,maxMass:info.maxMass,kills:info.kills,durationS:info.durationS});});
    this.sim.on('rewards',({slot,sessionId,rewards})=>{const s=this.sessions.get(slot);
      if(s&&s.sessionId===sessionId)s.deliverRewards(rewards);else if(this.onRewards)this.onRewards(sessionId,rewards);});}
  // ── ciclo de vida ──
  start(){if(this.running)return;this.running=true;this.topUpBots();}
  stop(){this.running=false;}
  topUpBots(){let have=this.sim.botCount();for(;have<this.botCount;have++)this.sim.addBot(this.freeSlot(),{name:BOT_NAMES[this._botName++%BOT_NAMES.length],skinId:this.rng.int(0,BOT_SKINS-1)});}
  freeSlot(){let s=0;while(this.sim.players.has(s))s++;return s;}
  get humanCount(){return this.sessions.size;}
  isFull(){return this.sessions.size>=this.max;}
  info(){return{code:this.code,shard:this.shard,players:this.sessions.size,max:this.max,bots:this.botCount};}
  // ── sessões ──
  /** Entra no menor slot livre. Devolve o slot. */
  join(session,{name,registered=false,skinId=0,sessionId=null,userId=null}){
    const slot=this.freeSlot();this.sim.addHuman(slot,{name,registered,skinId,sessionId,userId});
    const pc=this.sim.world.piecesOf(slot)[0];if(pc){session.cx=pc.x;session.cy=pc.y;}
    session.room=this;session.slot=slot;session.known.clear();session.rect=null;this.sessions.set(slot,session);this.lastHumanAt=Date.now();return slot;}
  /** Sai de vez: onMatchEnd(cause) se ainda vivo, remove do mundo. */
  leave(session,cause='left'){
    const slot=session.slot;if(this.sessions.get(slot)!==session)return;const gp=this.sim.players.get(slot);
    if(gp&&!gp.dead&&gp.sessionId){const hooks=this.sim.hooks;
      Promise.resolve().then(()=>hooks.onMatchEnd({sessionId:gp.sessionId,cause,killedBySessionId:null,score:gp.score,maxMass:Math.round(gp.maxMass),durationMs:Math.round((this.sim.tick-gp.joinedTick)*1000/TICK_HZ)}))
        .catch(e=>this.log.warn(`onMatchEnd('${cause}') falhou:`,e&&e.message));}
    this.sim.remove(slot);this.sessions.delete(slot);session.room=null;session.slot=-1;session.known.clear();this.lastHumanAt=Date.now();}
  /** Socket caiu: fica no mundo sem thrust (alvo = centróide) até resume ou expirar. */
  detach(session){if(this.sessions.get(session.slot)!==session)return;if(session.kicked)return this.leave(session,'left');session.detach();
    const w=this.sim.world,ps=w.players.get(session.slot);if(!ps||!ps.alive)return;
    let sx=0,sy=0,n=0;for(const pc of ps.pieces){if(pc.dead)continue;sx+=pc.x;sy+=pc.y;n++;}if(n)w.setTarget(session.slot,sx/n,sy/n);w.setEjectHold(session.slot,false);}
  /** Religa um socket novo numa sessão em graça (o wsServer manda `room` + PLAYERS em seguida). */
  resume(session,ws){session.attach(ws);}
  /** JSON `dead` da vida atual (null se vivo). */
  deadMsg(slot){const gp=this.sim.players.get(slot);if(!gp||!gp.dead||!gp.deathInfo)return null;const i=gp.deathInfo;
    return{t:'dead',by:i.by,byHole:i.byHole,score:i.score,maxMass:i.maxMass,kills:i.kills,durationS:i.durationS};}
  /** Expira sessões sem socket há mais de NET.RESUME_MS (chamado a cada 1 s pelo RoomManager). */
  housekeeping(now){for(const s of this.sessions.values())if(!s.ws&&now-s.disconnectedAt>NET.RESUME_MS){this.leave(s,'left');this.log.info(`${s.name} saiu da sala ${this.code} (sessão expirada)`);}}
  // ── envio ──
  rotateWriter(){this.writer=createWriter(WRITER_SIZE);}
  broadcast(view){let busy=false;for(const s of this.sessions.values())if(s.ws&&!s.send(view))busy=true;if(busy)this.rotateWriter();}
  broadcastPlayers(){this.broadcast(encodePlayers(this.writer,this.sim.playersInfo()));}
  sendPlayers(session){if(!session.send(encodePlayers(this.writer,this.sim.playersInfo())))this.rotateWriter();}
  broadcastLeaderboard(){this.broadcast(encodeLeaderboard(this.writer,this.sim.top(LB_ROWS)));}
  flushEvents(){const evs=this.sim.wireEvents;if(!evs.length)return;
    for(let i=0;i<evs.length;i++){const e=evs[i];const view=encodeEvent(this.writer,e);let busy=false;
      for(const s of this.sessions.values()){if(!s.ws||!s.rect||!rectHas(s.rect,e.x,e.y,0))continue;if(!s.send(view))busy=true;}
      if(busy)this.rotateWriter();}
    evs.length=0;}
  // ── passo ──
  step(){
    const sim=this.sim;sim.step();const t=sim.tick;
    if(sim.playersDirty){sim.playersDirty=false;this.broadcastPlayers();}
    if(t%SNAPSHOT_EVERY===0){this.snapshotter.beginTick();for(const s of this.sessions.values())this.snapshotter.send(s);this.flushEvents();sim.gone.clear();}
    else if(sim.wireEvents.length>=200)this.flushEvents();
    if(t%LEADERBOARD_EVERY===0)this.broadcastLeaderboard();}
}

// ── SIM: World (shared/physics) + estado de jogo por slot ───────────────────────
// Consome world.events a cada passo → kills/streak, mortes (humano: `death` + onMatchEnd → `rewards`;
// fim de rodada: `endRound()` fecha a partida de todos sem `death` e devolve o placar final;
// bot: renasce com score·RESPAWN_SCORE), motivos de remoção para os snapshots (`gone`), eventos de
// alto nível para o fio (`wireEvents`, a Room filtra por AOI) e hooks de persistência.
// Pontuação: o World já aplica EAT.SCORE_PLAYER·r / SCORE_FOOD·r / SCORE_EJECT·r em ps.score; aqui só
// espelhamos (uma fonte só, sem contar duas vezes).
// @ts-check
import {createWorld} from '@planet/shared/physics/world.js';
import {TICK_HZ,SAMPLE_EVERY,PLAYER,BOT} from '@planet/shared/constants.js';
import {EVENT,REMOVE,PLAYER_FLAG,SELF_FLAG,POWER_BIT,INPUT_FLAG} from '@planet/shared/protocol/constants.js';
import {createRng} from '@planet/shared/rng.js';
import {packDir} from '@planet/shared/util.js';
import {NOOP_HOOKS} from './hooks.js';
import {BotBrain} from '@planet/shared/bot.js';

export const NO_SLOT=0xffff;
const LB_MAX=10,EVENTS_MAX=256;
/**
 * @typedef {object} GamePlayer
 * @property {number} slot
 * @property {string|null} sessionId
 * @property {number|null} userId
 * @property {string} name
 * @property {boolean} registered
 * @property {number} skinId
 * @property {boolean} isBot
 * @property {boolean} dead
 * @property {number} score
 * @property {number} kills
 * @property {number} botKills
 * @property {number} streak
 * @property {number} joinedTick
 * @property {number} maxMass
 * @property {number} top1Ticks
 * @property {Set<number>} quadrants
 * @property {{seq:number,tx:number,ty:number,flags:number}} lastInput
 * @property {boolean} gotInput
 * @property {BotBrain|null} brain
 * @property {any} deathInfo
 */
export class Sim{
  /** @param {{seed?:number,hooks?:any,log?:any,rng?:any}} [o] */
  constructor({seed=1,hooks=NOOP_HOOKS,log=null,rng=null}={}){
    this.world=createWorld({seed});this.hooks=hooks;this.log=log;this.rng=rng||createRng((seed^0x9e3779b9)>>>0);
    /** @type {Map<number,GamePlayer>} */this.players=new Map();
    /** @type {{kind:number,x:number,y:number,r:number,slotA:number,slotB:number,extra:number}[]} */this.wireEvents=[];
    /** @type {Map<number,number>} id → REMOVE.* desde o último snapshot */this.gone=new Map();
    this.playersDirty=true;
    this._listeners=new Map();this._lb=[];this._lbTick=-1;this._hit=new Map();this._statTick=new Map();this._deaths=[];}
  get tick(){return this.world.tick;}
  // ── emissor mínimo ──
  on(ev,fn){const l=this._listeners.get(ev);if(l)l.push(fn);else this._listeners.set(ev,[fn]);return this;}
  _emit(ev,arg){const l=this._listeners.get(ev);if(!l)return;for(const fn of l){try{fn(arg);}catch(e){if(this.log)this.log.error(`listener ${ev}:`,e);}}}
  // ── jogadores ──
  _mk(slot,o){return{slot,sessionId:o.sessionId||null,userId:o.userId??null,name:String(o.name||'Viajante'),registered:!!o.registered,skinId:o.skinId|0,isBot:!!o.isBot,
    dead:false,score:0,kills:0,botKills:0,streak:0,joinedTick:this.world.tick,maxMass:0,top1Ticks:0,quadrants:new Set(),lastInput:{seq:0,tx:0,ty:0,flags:0},gotInput:false,brain:null,deathInfo:null};}
  /** Humano: peça START_R longe de perigos. Devolve o GamePlayer (peça inicial em world.piecesOf(slot)[0]). */
  addHuman(slot,{name='Viajante',registered=false,skinId=0,sessionId=null,userId=null}={}){
    if(this.players.has(slot))this.remove(slot);
    this.world.addPlayer(slot,{r:PLAYER.START_R,isBot:false,missiles:0});
    const gp=this._mk(slot,{name,registered,skinId,sessionId,userId,isBot:false});this.players.set(slot,gp);this.playersDirty=true;return gp;}
  addBot(slot,{name,skinId=0}){
    if(this.players.has(slot))this.remove(slot);
    this.world.addPlayer(slot,{r:this.rng.range(PLAYER.BOT_R[0],PLAYER.BOT_R[1]),isBot:true,missiles:0});
    const gp=this._mk(slot,{name,skinId,isBot:true});gp.brain=new BotBrain(this.world,slot,this.rng,this._botInput);this.players.set(slot,gp);this.playersDirty=true;return gp;}
  /** Porta de entrada dos bots: o cérebro (shared/bot.js) só produz {tx,ty,flags} e cai no mesmo applyInput do humano. */
  _botInput=(slot,cmd)=>{this.applyInput(slot,cmd);};
  remove(slot){const gp=this.players.get(slot);if(!gp)return;
    for(const pc of this.world.piecesOf(slot))if(!pc.dead)this.gone.set(pc.id,REMOVE.DESPAWN);
    this.world.removePlayer(slot);this.players.delete(slot);this.playersDirty=true;}
  /**
   * INPUT de humano (seq u16 com wrap: aceita se (seq-lastSeq)&0xffff ∈ (0,32768)) ou de bot (seq null).
   * Flags one-shot SPLIT/EJECT/FIRE valem uma vez por seq nova; EJECT_HOLD liga/desliga a repetição.
   */
  applyInput(slot,{seq=null,tx=0,ty=0,flags=0}){
    const gp=this.players.get(slot);if(!gp||gp.dead)return false;
    if(seq!=null){const s=seq&0xffff;if(gp.gotInput){const d=(s-gp.lastInput.seq)&0xffff;if(!(d>0&&d<32768))return false;}gp.gotInput=true;gp.lastInput.seq=s;}
    const w=this.world,li=gp.lastInput;li.tx=tx;li.ty=ty;li.flags=flags;w.setTarget(slot,tx,ty);
    if(flags&INPUT_FLAG.SPLIT)w.requestSplit(slot);if(flags&INPUT_FLAG.EJECT)w.requestEject(slot);
    w.setEjectHold(slot,(flags&INPUT_FLAG.EJECT_HOLD)!==0);if(flags&INPUT_FLAG.FIRE)w.requestFire(slot,(flags&INPUT_FLAG.AIM)!==0);return true;}
  /** Mata o slot fora do passo (testes/admin): peças mortas + fluxo de morte normal. */
  kill(slot,{bySlot=-1,cause='eaten'}={}){const w=this.world,ps=w.players.get(slot),gp=this.players.get(slot);if(!ps||!gp||!ps.alive)return false;
    const pc=ps.pieces.find(p=>!p.dead);if(pc)this._hit.set(slot,{x:pc.x,y:pc.y,r:pc.r});
    for(const p of ps.pieces)if(!p.dead){p.dead=true;this.gone.set(p.id,cause==='blackhole'?REMOVE.SUCKED:REMOVE.EATEN);}
    ps.alive=false;this._died({type:'PLAYER_DEAD',slot,cause,bySlot});this._hit.clear();return true;}
  // ── passo ──
  step(){
    const w=this.world;
    for(const gp of this.players.values())if(gp.brain&&!gp.dead)gp.brain.act(w.tick);
    w.step();
    this._consume();
    for(const gp of this.players.values()){const ps=w.players.get(gp.slot);if(!ps)continue;gp.score=ps.score;if(ps.alive){const m=w.massOf(gp.slot);if(m>gp.maxMass)gp.maxMass=m;}}
    if(w.tick%SAMPLE_EVERY===0)this._sample();}
  _ev(kind,x,y,r,slotA,slotB,extra){const out=this.wireEvents;if(out.length>=EVENTS_MAX)return;out.push({kind,x,y,r,slotA,slotB,extra:extra>>>0});}
  _stat(slot,key,tick){const gp=this.players.get(slot);if(!gp||gp.isBot||!gp.sessionId)return;const k=slot*4+(key==='split'?0:key==='eject'?1:2);
    if(this._statTick.get(k)===tick)return;this._statTick.set(k,tick);this.hooks.onStat({sessionId:gp.sessionId,key});}
  _consume(){
    const w=this.world,ev=w.events,hooks=this.hooks,tick=w.tick,gone=this.gone,hit=this._hit,deaths=this._deaths;deaths.length=0;
    for(let i=0;i<ev.length;i++){const e=ev[i];switch(e.type){
      case 'EAT':{gone.set(e.pieceId,REMOVE.EATEN);hit.set(e.victimSlot,e);this._ev(EVENT.EAT,e.x,e.y,e.r,e.killerSlot,e.victimSlot,e.pieceId);
        if(e.lastPiece){const k=this.players.get(e.killerSlot),v=this.players.get(e.victimSlot);if(k&&v){if(v.isBot)k.botKills++;else k.kills++;k.streak++;
          if(!k.isBot&&k.sessionId)hooks.onKill({sessionId:k.sessionId,killerSessionId:k.sessionId,victimSessionId:v.sessionId,victimIsBot:v.isBot,weapon:'eat',tick});}}
        break;}
      case 'FOOD_EATEN':{gone.set(e.foodId,REMOVE.EATEN);const gp=this.players.get(e.slot);if(gp&&!gp.isBot&&gp.sessionId)hooks.onStat({sessionId:gp.sessionId,key:'food'});break;}
      case 'EJECT_EATEN':gone.set(e.ejectId,REMOVE.EATEN);break;
      case 'POP':gone.set(e.asteroidId,REMOVE.POPPED);this._ev(EVENT.POP,e.x,e.y,e.r,e.slot<0?NO_SLOT:e.slot,NO_SLOT,e.asteroidId);break;
      case 'MERGE':gone.set(e.mergedId,REMOVE.MERGED);this._ev(EVENT.MERGE,e.x,e.y,e.r,e.slot,NO_SLOT,e.pieceId);break;
      case 'SPLIT':this._ev(EVENT.SPLIT,e.x,e.y,e.r,e.slot,NO_SLOT,e.childId);this._stat(e.slot,'split',tick);break;
      case 'EJECT':this._stat(e.slot,'eject',tick);break;
      case 'BH_SUCK':{gone.set(e.pieceId,REMOVE.SUCKED);hit.set(e.slot,{x:e.fromX,y:e.fromY,r:e.r});
        this._ev(EVENT.BH_SUCK,e.fromX,e.fromY,e.r,e.slot,NO_SLOT,1);break;}
      // EVENT.EXIT (kind 9) ficou sem emissor quando o buraco deixou de teleportar; o slot NÃO é renumerado
      // (renumerar custa um PROTOCOL_VERSION novo sem ganho nenhum).
      case 'CHIP':this._ev(EVENT.CHIP,e.x,e.y,e.r,e.slot,NO_SLOT,packDir(e.nx,e.ny,0));break;
      case 'BOUNCE':this._ev(EVENT.BOUNCE,e.x,e.y,e.r,NO_SLOT,NO_SLOT,packDir(e.nx,e.ny,e.vn));break;
      case 'BOOM':this._ev(EVENT.BOOM,e.x,e.y,e.r,e.slot<0?NO_SLOT:e.slot,e.bySlot<0?NO_SLOT:e.bySlot,0);break;
      case 'SHOOT':this._ev(EVENT.SHOOT,e.x,e.y,0,NO_SLOT,NO_SLOT,packDir(e.nx,e.ny,0));break;
      case 'SHIELD_BREAK':this._ev(EVENT.SHIELD_BREAK,e.x,e.y,e.r,e.slot,e.bySlot<0?NO_SLOT:e.bySlot,0);break;
      case 'SHIELD_HIT':this._ev(EVENT.SHIELD_HIT,e.x,e.y,e.r,e.slot,e.bySlot<0?NO_SLOT:e.bySlot,packDir(e.nx,e.ny,e.level));break;
      case 'SHIELD_UP':this._ev(EVENT.SHIELD_UP,e.x,e.y,e.r,e.slot,NO_SLOT,e.level);break;
      case 'CLASH':this._ev(EVENT.CLASH,e.x,e.y,e.r,e.slotA,e.slotB,0);break;
      case 'DEFLECT':this._ev(EVENT.DEFLECT,e.x,e.y,e.r,e.bySlot<0?NO_SLOT:e.bySlot,NO_SLOT,packDir(e.nx,e.ny,0));break;
      case 'STAR_BURST':this._ev(EVENT.STAR_BURST,e.x,e.y,e.r,e.slot,NO_SLOT,e.starId);break;
      case 'STAR_HIT':this._ev(EVENT.STAR_HIT,e.x,e.y,e.r,e.slot<0?NO_SLOT:e.slot,NO_SLOT,packDir(e.nx,e.ny,e.hits));break;
      case 'STAR_SPLIT':this._ev(EVENT.STAR_SPLIT,e.x,e.y,e.r,NO_SLOT,NO_SLOT,e.starId);break;
      case 'SMASH':gone.set(e.asteroidId,REMOVE.POPPED);this._ev(EVENT.SMASH,e.x,e.y,e.r,NO_SLOT,NO_SLOT,packDir(e.nx,e.ny,0));break;
      case 'SUPERNOVA':this._ev(EVENT.SUPERNOVA,e.x,e.y,e.r,NO_SLOT,NO_SLOT,e.starId);break;
      case 'PLAYER_DEAD':deaths.push(e);break;}}
    for(let i=0;i<deaths.length;i++)this._died(deaths[i]);
    hit.clear();}
  _died(e){
    const gp=this.players.get(e.slot);if(!gp||gp.dead)return;const w=this.world,h=this._hit.get(e.slot),by=e.bySlot>=0?this.players.get(e.bySlot):null;
    const ps=w.players.get(e.slot);if(ps)gp.score=ps.score;
    this._ev(EVENT.DEATH,h?h.x:0,h?h.y:0,h?h.r:0,e.slot,by?by.slot:NO_SLOT,gp.score);
    gp.streak=0;this.playersDirty=true;
    if(gp.isBot){w.respawnPlayer(e.slot,{r:this.rng.range(PLAYER.BOT_R[0],PLAYER.BOT_R[1]),score:Math.floor(gp.score*BOT.RESPAWN_SCORE)});gp.score=Math.floor(gp.score*BOT.RESPAWN_SCORE);if(gp.brain)gp.brain.reset();return;}
    gp.dead=true;
    const byHole=e.cause==='blackhole',durationMs=Math.round((w.tick-gp.joinedTick)*1000/TICK_HZ),maxMass=Math.round(gp.maxMass);
    const info={slot:e.slot,by:by?by.name:null,bySlot:by?by.slot:-1,byHole,score:gp.score,maxMass,kills:gp.kills+gp.botKills,durationS:Math.round(durationMs/1000)};
    gp.deathInfo=info;this._emit('death',info);
    const sessionId=gp.sessionId,done=r=>this._emit('rewards',{slot:e.slot,sessionId,rewards:r||null});
    Promise.resolve().then(()=>this.hooks.onMatchEnd({sessionId,cause:byHole?'blackhole':'eaten',killedBySessionId:by&&!by.isBot?by.sessionId:null,score:gp.score,maxMass,durationMs}))
      .then(done,err=>{if(this.log)this.log.warn(`onMatchEnd (${gp.name}) falhou:`,err&&err.message);done(null);});}
  /**
   * Fim de rodada (o mundo explodiu): fecha a partida de todo humano vivo pelo mesmo caminho de persistência da morte
   * (`cause:'round'`, sem mandar `dead` — quem manda o placar é a Room) e devolve o placar final: vivos por massa
   * (o 1º é o campeão) e, no fim, os humanos que já tinham morrido.
   */
  endRound(){
    const w=this.world,rows=this.leaderboard(),board=[],seen=new Set();
    const row=(gp,mass)=>({slot:gp.slot,name:gp.name,mass,score:gp.score,kills:gp.kills+gp.botKills,isBot:gp.isBot,registered:gp.registered,skinId:gp.skinId});
    for(const r of rows){const gp=this.players.get(r.slot);if(!gp)continue;seen.add(gp.slot);board.push(row(gp,r.mass));}
    for(const gp of this.players.values())if(!gp.isBot&&!seen.has(gp.slot))board.push(row(gp,0));
    for(const gp of this.players.values()){
      if(gp.isBot||gp.dead)continue;
      const ps=w.players.get(gp.slot);if(ps){gp.score=ps.score;ps.alive=false;}
      gp.dead=true;const sessionId=gp.sessionId,maxMass=Math.round(gp.maxMass),durationMs=Math.round((w.tick-gp.joinedTick)*1000/TICK_HZ);
      const done=r=>this._emit('rewards',{slot:gp.slot,sessionId,rewards:r||null});
      Promise.resolve().then(()=>this.hooks.onMatchEnd({sessionId,cause:'round',killedBySessionId:null,score:gp.score,maxMass,durationMs}))
        .then(done,err=>{if(this.log)this.log.warn(`onMatchEnd (rodada, ${gp.name}) falhou:`,err&&err.message);done(null);});}
    this.playersDirty=true;return board;}
  _sample(){
    const w=this.world;
    for(const gp of this.players.values()){if(gp.isBot||gp.dead||!gp.sessionId)continue;const ps=w.players.get(gp.slot);if(!ps||!ps.alive)continue;
      let sx=0,sy=0,n=0;for(const pc of ps.pieces){if(pc.dead)continue;sx+=pc.x;sy+=pc.y;n++;}if(!n)continue;
      const q=(sx/n<w.w/2?0:1)+(sy/n<w.h/2?0:2),rank=this.rankOf(gp.slot);gp.quadrants.add(q);if(rank===1)gp.top1Ticks+=SAMPLE_EVERY;
      this.hooks.onSample({sessionId:gp.sessionId,mass:Math.round(w.massOf(gp.slot)),rank,quadrant:q});}}
  // ── consultas ──
  /** Todas as linhas vivas ordenadas por massa (cache por tick). */
  leaderboard(){const w=this.world;if(this._lbTick===w.tick)return this._lb;const rows=[];
    for(const ps of w.players.values()){if(!ps.alive)continue;
      let sx=0,sy=0,n=0;for(const pc of ps.pieces){if(pc.dead)continue;sx+=pc.x;sy+=pc.y;n++;}
      if(!n)continue;
      rows.push({slot:ps.slot,mass:Math.round(w.massOf(ps.slot)),x:sx/n,y:sy/n});}   // x,y: o mesmo centro que a câmera usa — é o que o radar desenha
    rows.sort((a,b)=>b.mass-a.mass);this._lb=rows;this._lbTick=w.tick;return rows;}
  top(n=LB_MAX){const lb=this.leaderboard();return lb.length>n?lb.slice(0,n):lb;}
  rankOf(slot){const lb=this.leaderboard();for(let i=0;i<lb.length;i++)if(lb[i].slot===slot)return i+1;return 0;}
  /** Bloco `self` do snapshot (preenche `out`). Ímã e escudo são por peça: o HUD mostra o MELHOR entre as próprias (cada peça leva o seu nas flags). */
  self(slot,out){const w=this.world,ps=w.players.get(slot),gp=this.players.get(slot),t=w.tick;
    if(!ps||!gp){out.flags=SELF_FLAG.DEAD;out.missiles=out.powerBits=out.magnetT=out.shieldLv=out.score=out.splitCd=out.ejectCd=out.rank=out.mass=0;return out;}
    let mt=0,sh=0;const arr=ps.pieces;
    for(let i=0;i<arr.length;i++){const pc=arr[i];if(pc.dead)continue;const m=pc.magnetUntil-t;if(m>mt)mt=m;if(pc.shieldLv>sh)sh=pc.shieldLv;}
    const sc=ps.splitCdUntil-t,ec=ps.ejectCdUntil-t;
    out.flags=gp.dead?SELF_FLAG.DEAD:0;out.missiles=ps.missiles;out.powerBits=(mt>0?POWER_BIT.magnet:0)|(sh>0?POWER_BIT.shield:0);
    out.magnetT=mt>0?mt:0;out.shieldLv=sh;out.score=ps.score;out.splitCd=sc>0?sc:0;out.ejectCd=ec>0?ec:0;
    out.rank=gp.dead?0:this.rankOf(slot);out.mass=gp.dead?0:Math.round(w.massOf(slot));return out;}
  /** Linhas do PLAYERS. */
  playersInfo(){const out=[];for(const gp of this.players.values())
    out.push({slot:gp.slot,flags:(gp.isBot?PLAYER_FLAG.BOT:0)|(gp.dead?PLAYER_FLAG.DEAD:0)|(gp.registered?PLAYER_FLAG.REG:0),skinId:gp.skinId&255,name:gp.name,score:gp.score});return out;}
  humanCount(){let n=0;for(const gp of this.players.values())if(!gp.isBot)n++;return n;}
  botCount(){let n=0;for(const gp of this.players.values())if(gp.isBot)n++;return n;}
}

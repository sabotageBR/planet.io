// ── SIM: World (shared/physics) + estado de jogo por slot ───────────────────────
// Consome world.events a cada passo → kills/streak, mortes (humano: `death` + onMatchEnd → `rewards`;
// fim de rodada: `endRound()` fecha a partida de todos sem `death` e devolve o placar final;
// bot: renasce com score·RESPAWN_SCORE), motivos de remoção para os snapshots (`gone`), eventos de
// alto nível para o fio (`wireEvents`, a Room filtra por AOI) e hooks de persistência.
// Pontuação: o World já aplica EAT.SCORE_PLAYER·r / SCORE_FOOD·r / SCORE_EJECT·r em ps.score; aqui só
// espelhamos (uma fonte só, sem contar duas vezes).
// @ts-check
import {createWorld} from '@planet/shared/physics/world.js';
import {TICK_HZ,SAMPLE_EVERY,PLAYER,BOT,BOT_TALK,BOT_LLM,FEED,MISSILE,MODE,modeOf,WEAPON,WEAPONS} from '@planet/shared/constants.js';
import {EVENT,REMOVE,PLAYER_FLAG,SELF_FLAG,POWER_BIT,INPUT_FLAG,NO_TEAM} from '@planet/shared/protocol/constants.js';
import {createRng} from '@planet/shared/rng.js';
import {kdOf} from '@planet/shared/levels.js';
import {packDir} from '@planet/shared/util.js';
import {NOOP_HOOKS} from './hooks.js';
import {BotBrain} from '@planet/shared/bot.js';
import {incomingMissile,ammoOf,ownedMask} from '@planet/shared/physics/rules.js';
import {firstLive} from '@planet/shared/physics/body.js';

export const NO_SLOT=0xffff;
const LB_MAX=10,EVENTS_MAX=256;
/** WEAPON.* → a chave que o kill feed e o hook de persistência usam. -2 (a rocha) e desconhecido caem em asteroide/míssil. */
const ARMA=['missile','burst','cluster','nova'];
const armaKey=w=>w===-2?'asteroid':(ARMA[w|0]||'missile');
/**
 * @typedef {object} GamePlayer
 * @property {number} slot
 * @property {string|null} sessionId
 * @property {number|null} userId
 * @property {string} name
 * @property {boolean} registered
 * @property {number} skinId
 * @property {number} team          equipe (-1 = sem equipe). A verdade da regra está no PlayerState do World; aqui é o espelho para o fio e o placar
 * @property {number} deathTick     tick em que morreu (-1 vivo) — é dele que sai a COLOCAÇÃO no Battle Royale
 * @property {number} placement     posição final (1 = campeão), preenchida no fim
 * @property {number} talkUntil     tick até quando o ícone de "falando" fica aceso
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
  constructor({seed=1,hooks=NOOP_HOOKS,log=null,rng=null,mode=MODE.FREE}={}){
    this.mode=modeOf(mode);this.modeId=this.mode.id;
    this.world=createWorld({seed,weapons:this.mode.weapons});this.hooks=hooks;this.log=log;this.rng=rng||createRng((seed^0x9e3779b9)>>>0);
    /** @type {Map<number,GamePlayer>} */this.players=new Map();
    /** @type {{kind:number,x:number,y:number,r:number,slotA:number,slotB:number,extra:number}[]} */this.wireEvents=[];
    /** @type {Map<number,number>} id → REMOVE.* desde o último snapshot */this.gone=new Map();
    /** @type {{slot:number,kind:string,quem:string|null}[]} fila de gatilhos de fala dos preenchimentos (a sala drena) */this.botTalk=[];
    this.playersDirty=true;
    /** @type {{k:string,a:number,b:number,how:string,by:number|null,n?:number}[]} fila do KILL FEED (a sala drena e difunde) */this.feed=[];
    /** @type {Map<number,{by:number,how:string,tick:number}>} último dano levado por slot: quem AMOLECEU antes de alguém colher */this._lastHit=new Map();
    this._listeners=new Map();this._lb=[];this._lbTick=-1;this._hit=new Map();this._statTick=new Map();this._deaths=[];this._elim=0;}
  get tick(){return this.world.tick;}
  // ── emissor mínimo ──
  on(ev,fn){const l=this._listeners.get(ev);if(l)l.push(fn);else this._listeners.set(ev,[fn]);return this;}
  _emit(ev,arg){const l=this._listeners.get(ev);if(!l)return;for(const fn of l){try{fn(arg);}catch(e){if(this.log)this.log.error(`listener ${ev}:`,e);}}}
  // ── jogadores ──
  _mk(slot,o){return{slot,sessionId:o.sessionId||null,userId:o.userId??null,name:String(o.name||'Viajante'),registered:!!o.registered,skinId:o.skinId|0,isBot:!!o.isBot,
    team:o.team==null?-1:o.team|0,deathTick:-1,placement:0,talkUntil:0,level:o.level|0,
    dead:false,score:0,kills:0,botKills:0,deaths:0,food:0,streak:0,joinedTick:this.world.tick,maxMass:0,top1Ticks:0,quadrants:new Set(),lastInput:{seq:0,tx:0,ty:0,flags:0},gotInput:false,brain:null,deathInfo:null,
    // ── fala (a Room é quem gasta; aqui só existem para o objeto ter FORMA estável) ──
    // Eram criados no primeiro uso lá na Room, o que deixava o GamePlayer polimórfico e não dava lugar
    // nenhum para documentar o que cada um significa.
    persona:null,mem:null,rosterFolded:false,
    talked:0,talkedAt:-1e9,mencaoAt:-1e9,mencoes:0};}
  /** Humano: peça START_R longe de perigos. Devolve o GamePlayer (peça inicial em world.piecesOf(slot)[0]). */
  addHuman(slot,{name='Viajante',registered=false,skinId=0,sessionId=null,userId=null,team=-1,level=0,spawn=true}={}){
    if(this.players.has(slot))this.remove(slot);
    this._lastHit.delete(slot);
    this.world.addPlayer(slot,{r:PLAYER.START_R,isBot:false,missiles:0,team,spawn});
    const gp=this._mk(slot,{name,registered,skinId,sessionId,userId,isBot:false,team,level});this.players.set(slot,gp);this.playersDirty=true;return gp;}
  addBot(slot,{name,skinId=0,team=-1,level=0,spawn=true}={}){
    if(this.players.has(slot))this.remove(slot);
    this.world.addPlayer(slot,{r:spawn?this.rng.range(PLAYER.BOT_R[0],PLAYER.BOT_R[1]):PLAYER.START_R,isBot:true,missiles:0,team,spawn});
    const gp=this._mk(slot,{name,skinId,isBot:true,team,level});gp.brain=new BotBrain(this.world,slot,this.rng,this._botInput);
    // Só bot ganha o anel de memória: são 6 objetos por bot, e 30 humanos não têm o que fazer com ele.
    gp.mem={i:0,n:0,buf:Array.from({length:BOT_LLM.MEM_N},()=>({k:'',slot:-1,at:0}))};
    this.players.set(slot,gp);this.playersDirty=true;return gp;}
  /** Equipe de um slot (a fonte é o PlayerState do World; o GamePlayer é só o espelho do fio). */
  setTeam(slot,team){const gp=this.players.get(slot),ps=this.world.players.get(slot);
    if(gp)gp.team=team;if(ps)ps.team=team;this.playersDirty=true;}
  /** Porta de entrada dos bots: o cérebro (shared/bot.js) só produz {tx,ty,flags} e cai no mesmo applyInput do humano. */
  _botInput=(slot,cmd)=>{this.applyInput(slot,cmd);};
  remove(slot){const gp=this.players.get(slot);if(!gp)return;
    for(const pc of this.world.piecesOf(slot))if(!pc.dead)this.gone.set(pc.id,REMOVE.DESPAWN);
    this.world.removePlayer(slot);this.players.delete(slot);this._lastHit.delete(slot);this.playersDirty=true;}
  /**
   * INPUT de humano (seq u16 com wrap: aceita se (seq-lastSeq)&0xffff ∈ (0,32768)) ou de bot (seq null).
   * Flags one-shot SPLIT/EJECT/FIRE valem uma vez por seq nova; EJECT_HOLD liga/desliga a repetição.
   */
  applyInput(slot,{seq=null,tx=0,ty=0,flags=0}){
    const gp=this.players.get(slot);if(!gp||gp.dead)return false;
    if(seq!=null){const s=seq&0xffff;if(gp.gotInput){const d=(s-gp.lastInput.seq)&0xffff;if(!(d>0&&d<32768))return false;}gp.gotInput=true;gp.lastInput.seq=s;}
    const w=this.world,li=gp.lastInput;li.tx=tx;li.ty=ty;li.flags=flags;w.setTarget(slot,tx,ty);
    if(flags&INPUT_FLAG.SPLIT)w.requestSplit(slot);if(flags&INPUT_FLAG.EJECT)w.requestEject(slot);
    w.setEjectHold(slot,(flags&INPUT_FLAG.EJECT_HOLD)!==0);if(flags&INPUT_FLAG.SWAP)w.requestSwap(slot);
    if(flags&INPUT_FLAG.FIRE)w.requestFire(slot,(flags&INPUT_FLAG.AIM)!==0);return true;}
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
  /**
   * Gatilho de fala de um preenchimento. É só uma FILA: quem decide se sai alguma coisa (e o orçamento) é a
   * sala, porque falar é evento de sala e não de física — o cérebro compartilhado nem enxerga chat.
   */
  _talk(slot,kind,quem=null){const gp=this.players.get(slot);if(!gp||!gp.isBot)return;
    // `quem` é o outro lado do evento (a vítima, o algoz). Não custa nada — o nome já está em escopo nos
    // dois pontos de chamada — e é a diferença entre "boa" e "ate mais, Zeca".
    if(this.botTalk.length<BOT_TALK.QUEUE_MAX)this.botTalk.push({slot,kind,quem:quem||null});}
  /**
   * KILL FEED. Fila de linhas já resolvidas; quem difunde é a Room (JSON de controle, não o fio binário).
   * Só SLOTS vão daqui — o cliente resolve o nome por `view.playerOf`, e é isso que faz o feed respeitar
   * `anonBots` do Battle Royale sem uma linha a mais.
   */
  _feed(o){if(this.feed.length<FEED.QUEUE_MAX)this.feed.push(o);}
  /**
   * Carimba o ÚLTIMO dano levado por `slot`. Chamado de dentro do `switch` que o `_consume` já percorre —
   * uma escrita em Map por evento que já estava sendo traduzido, sem laço novo e sem varredura.
   * É o que permite ao feed dizer "🚀 amoleceu · Fulano devorou" em vez de mentir "morreu de míssil":
   * `w.killPiece` só é chamado com `eaten`, `zone` e `blackhole` — arma nenhuma mata sozinha.
   */
  _mark(slot,by,how){if(slot<0)return;const t=this.world.tick,h=this._lastHit.get(slot);
    if(h){h.by=by;h.how=how;h.tick=t;}else this._lastHit.set(slot,{by,how,tick:t});}
  /**
   * Memória curta do BOT: o que aconteceu com ele e por causa de quem. Anel de BOT_LLM.MEM_N, escrita O(1)
   * e sem alocar. Não há varredura de expiração — quem LÊ (Room._agressor) ignora o que passou do TTL.
   * É daqui que sai o "me deixa em paz, evandro!": sem isto o bot não faz ideia de quem atirou nele.
   */
  _memo(slot,k,bySlot){if(bySlot<0||slot<0)return;const gp=this.players.get(slot);if(!gp||!gp.mem)return;
    const m=gp.mem,e=m.buf[m.i];e.k=k;e.slot=bySlot;e.at=this.world.tick;
    m.i=(m.i+1)%m.buf.length;if(m.n<m.buf.length)m.n++;}
  _ev(kind,x,y,r,slotA,slotB,extra){const out=this.wireEvents;if(out.length>=EVENTS_MAX)return;out.push({kind,x,y,r,slotA,slotB,extra:extra>>>0});}
  _stat(slot,key,tick){const gp=this.players.get(slot);if(!gp||gp.isBot||!gp.sessionId)return;const k=slot*4+(key==='split'?0:key==='eject'?1:2);
    if(this._statTick.get(k)===tick)return;this._statTick.set(k,tick);this.hooks.onStat({sessionId:gp.sessionId,key});}
  _consume(){
    const w=this.world,ev=w.events,hooks=this.hooks,tick=w.tick,gone=this.gone,hit=this._hit,deaths=this._deaths;deaths.length=0;
    for(let i=0;i<ev.length;i++){const e=ev[i];switch(e.type){
      case 'EAT':{gone.set(e.pieceId,REMOVE.EATEN);hit.set(e.victimSlot,e);this._ev(EVENT.EAT,e.x,e.y,e.r,e.killerSlot,e.victimSlot,e.pieceId);
        if(!e.lastPiece){this._mark(e.victimSlot,e.killerSlot,'eat');this._memo(e.victimSlot,'mordida',e.killerSlot);}
        if(e.lastPiece){const k=this.players.get(e.killerSlot),v=this.players.get(e.victimSlot);if(k&&v){if(v.isBot)k.botKills++;else k.kills++;k.streak++;this._talk(e.killerSlot,'kill',v.name);
          // `weapon` era 'eat' fixo. O carimbo de `_lastHit` já sabe com o que a vítima foi amolecida, então
          // a estatística de arma passa a existir de graça (e o kill feed usa a mesma conta).
          const lh0=this._lastHit.get(e.victimSlot);
          const arma=(lh0&&(tick-lh0.tick)<=FEED.HIT_TTL_TICKS&&lh0.by===e.killerSlot&&lh0.how!=='eat')?lh0.how:'eat';
          if(!k.isBot&&k.sessionId)hooks.onKill({sessionId:k.sessionId,killerSessionId:k.sessionId,victimSessionId:v.sessionId,victimIsBot:v.isBot,weapon:arma,tick});}}
        break;}
      case 'FOOD_EATEN':{gone.set(e.foodId,REMOVE.EATEN);const gp=this.players.get(e.slot);
        if(gp)gp.food++;   // o placar da SALA precisa disto para bot e para quem joga sem conta; o hook abaixo é só persistência
        if(gp&&!gp.isBot&&gp.sessionId)hooks.onStat({sessionId:gp.sessionId,key:'food'});break;}
      case 'EJECT_EATEN':gone.set(e.ejectId,REMOVE.EATEN);break;
      case 'POP':gone.set(e.asteroidId,REMOVE.POPPED);this._mark(e.slot,-1,'asteroid');this._ev(EVENT.POP,e.x,e.y,e.r,e.slot<0?NO_SLOT:e.slot,NO_SLOT,e.asteroidId);break;
      case 'MERGE':gone.set(e.mergedId,REMOVE.MERGED);this._ev(EVENT.MERGE,e.x,e.y,e.r,e.slot,NO_SLOT,e.pieceId);break;
      case 'SPLIT':this._ev(EVENT.SPLIT,e.x,e.y,e.r,e.slot,NO_SLOT,e.childId);this._stat(e.slot,'split',tick);break;
      case 'EJECT':this._stat(e.slot,'eject',tick);break;
      case 'BH_SUCK':{gone.set(e.pieceId,REMOVE.SUCKED);hit.set(e.slot,{x:e.fromX,y:e.fromY,r:e.r});
        this._ev(EVENT.BH_SUCK,e.fromX,e.fromY,e.r,e.slot,NO_SLOT,1);break;}
      // EVENT.EXIT (kind 9) ficou sem emissor quando o buraco deixou de teleportar; o slot NÃO é renumerado
      // (renumerar custa um PROTOCOL_VERSION novo sem ganho nenhum).
      case 'CHIP':this._mark(e.slot,-1,'asteroid');this._ev(EVENT.CHIP,e.x,e.y,e.r,e.slot,NO_SLOT,packDir(e.nx,e.ny,0));break;
      case 'BOUNCE':this._ev(EVENT.BOUNCE,e.x,e.y,e.r,NO_SLOT,NO_SLOT,packDir(e.nx,e.ny,e.vn));break;
      case 'BOOM':this._mark(e.slot,e.bySlot,armaKey(e.weapon));this._memo(e.slot,'tiro',e.bySlot);
        this._ev(EVENT.BOOM,e.x,e.y,e.r,e.slot<0?NO_SLOT:e.slot,e.bySlot<0?NO_SLOT:e.bySlot,0);break;
      case 'SHOOT':this._ev(EVENT.SHOOT,e.x,e.y,0,NO_SLOT,NO_SLOT,packDir(e.nx,e.ny,0));break;
      case 'SHIELD_BREAK':this._mark(e.slot,e.bySlot,armaKey(e.weapon));this._memo(e.slot,'escudo',e.bySlot);
        this._ev(EVENT.SHIELD_BREAK,e.x,e.y,e.r,e.slot,e.bySlot<0?NO_SLOT:e.bySlot,0);break;
      case 'SHIELD_HIT':this._mark(e.slot,e.bySlot,armaKey(e.weapon));this._memo(e.slot,'tiro',e.bySlot);
        this._ev(EVENT.SHIELD_HIT,e.x,e.y,e.r,e.slot,e.bySlot<0?NO_SLOT:e.bySlot,packDir(e.nx,e.ny,e.level));break;
      case 'SHIELD_UP':this._ev(EVENT.SHIELD_UP,e.x,e.y,e.r,e.slot,NO_SLOT,e.level);break;
      case 'CLASH':this._ev(EVENT.CLASH,e.x,e.y,e.r,e.slotA,e.slotB,0);break;
      case 'DEFLECT':this._ev(EVENT.DEFLECT,e.x,e.y,e.r,e.bySlot<0?NO_SLOT:e.bySlot,NO_SLOT,packDir(e.nx,e.ny,0));break;
      case 'STAR_BURST':this._mark(e.slot,-1,'star');this._ev(EVENT.STAR_BURST,e.x,e.y,e.r,e.slot,NO_SLOT,e.starId);break;
      case 'STAR_HIT':this._ev(EVENT.STAR_HIT,e.x,e.y,e.r,e.slot<0?NO_SLOT:e.slot,NO_SLOT,packDir(e.nx,e.ny,e.hits));break;
      case 'STAR_SPLIT':this._ev(EVENT.STAR_SPLIT,e.x,e.y,e.r,NO_SLOT,NO_SLOT,e.starId);break;
      case 'SMASH':gone.set(e.asteroidId,REMOVE.POPPED);this._ev(EVENT.SMASH,e.x,e.y,e.r,NO_SLOT,NO_SLOT,packDir(e.nx,e.ny,0));break;
      case 'SUPERNOVA':this._ev(EVENT.SUPERNOVA,e.x,e.y,e.r,NO_SLOT,NO_SLOT,e.starId);break;
      case 'ZONE_BURN':{if(e.died)gone.set(e.pieceId,REMOVE.EXPIRED);this._mark(e.slot,-1,'zone');
        this._ev(EVENT.ZONE_BURN,e.x,e.y,e.r,e.slot,NO_SLOT,Math.round(e.lost));break;}
      case 'NOVA_HIT':this._mark(e.slot,e.bySlot,'nova');this._memo(e.slot,'tiro',e.bySlot);break;
      case 'PLAYER_DEAD':deaths.push(e);break;}}
    for(let i=0;i<deaths.length;i++)this._died(deaths[i]);
    hit.clear();}
  /**
   * Uma morte vira UMA linha do kill feed. A causa base é o que a física diz (`zone`/`eaten`/`blackhole`);
   * o carimbo de `_lastHit`, se ainda fresco, refina:
   *   • mesmo algoz e arma → o ícone é a ARMA        ("Fodao 🚀 Stellara")
   *   • perigo do mapa (by −1) → o ícone é o PERIGO  ("Stellara ⭐ devorada por Fodao")
   *   • outro jogador amoleceu → ASSISTÊNCIA         (o `by` da linha)
   * Fora do TTL, é só "devorou" — porque a essa altura já não foi por causa daquele dano.
   */
  _feedMorte(e,gp,by){
    const t=this.world.tick,lh=this._lastHit.get(e.slot),fresco=lh&&(t-lh.tick)<=FEED.HIT_TTL_TICKS;
    let how=e.cause==='zone'?'zone':e.cause==='blackhole'?'hole':'eat',assist=-1,byHow=null;
    if(how==='eat'&&fresco){
      if(lh.by>=0&&lh.by===e.bySlot&&lh.how!=='eat')how=lh.how;
      else if(lh.by<0)how=lh.how;
      else if(lh.by>=0&&lh.by!==e.bySlot){assist=lh.by;byHow=lh.how;}}
    this._lastHit.delete(e.slot);
    // `byHow` é a arma de quem AMOLECEU: sem ela, a linha com assistência desenhava o mesmo ícone duas
    // vezes ("🍴🍴"), porque `how` continua sendo 'eat' — quem finalizou foi uma boca.
    this._feed({k:e.bySlot>=0?'kill':'hazard',a:by?by.slot:-1,b:e.slot,how,by:assist<0?null:assist,byHow:assist<0?null:byHow});
    if(by&&by.streak&&FEED.STREAK_AT.includes(by.streak))this._feed({k:'sys',a:by.slot,b:-1,how:'streak',by:null,n:by.streak});}
  _died(e){
    const gp=this.players.get(e.slot);if(!gp||gp.dead)return;const w=this.world,h=this._hit.get(e.slot),by=e.bySlot>=0?this.players.get(e.bySlot):null;
    const ps=w.players.get(e.slot);if(ps)gp.score=ps.score;
    this._ev(EVENT.DEATH,h?h.x:0,h?h.y:0,h?h.r:0,e.slot,by?by.slot:NO_SLOT,gp.score);
    gp.streak=0;gp.deaths++;this.playersDirty=true;this._talk(e.slot,e.cause==='zone'?'zona':'morte',by?by.name:null);
    this._memo(e.slot,'morte',e.bySlot);
    this._feedMorte(e,gp,by);
    // ⚠️ O feed sai ACIMA do respawn de bot: no modo Livre o bot renasce e o `return` abaixo engoliria a
    // linha — e abate de bot é a MAIORIA dos abates da sala.
    // Sem respawn (Battle Royale): o bot morre de vez, como todo mundo. É a ÚNICA linha que ressuscitava alguém.
    if(gp.isBot&&this.mode.respawnBots){w.respawnPlayer(e.slot,{r:this.rng.range(PLAYER.BOT_R[0],PLAYER.BOT_R[1]),score:Math.floor(gp.score*BOT.RESPAWN_SCORE)});gp.score=Math.floor(gp.score*BOT.RESPAWN_SCORE);if(gp.brain)gp.brain.reset();return;}
    gp.dead=true;gp.deathTick=w.tick;gp.placement=0;this._elim++;
    if(gp.isBot)return;   // bot eliminado não tem sessão, hooks nem tela de morte: o caminho abaixo é só de humano
    const byHole=e.cause==='blackhole',durationMs=Math.round((w.tick-gp.joinedTick)*1000/TICK_HZ),maxMass=Math.round(gp.maxMass);
    const info={slot:e.slot,by:by?by.name:null,bySlot:by?by.slot:-1,byHole,byZone:e.cause==='zone',score:gp.score,maxMass,kills:gp.kills+gp.botKills,durationS:Math.round(durationMs/1000),
      placement:this.mode.lastAlive?this.players.size-this._elim+1:0,players:this.mode.lastAlive?this.players.size:0};
    gp.deathInfo=info;this._emit('death',info);
    const sessionId=gp.sessionId,done=r=>this._emit('rewards',{slot:e.slot,sessionId,rewards:r||null});
    Promise.resolve().then(()=>this.hooks.onMatchEnd({sessionId,cause:e.cause==='zone'?'zone':byHole?'blackhole':this.mode.lastAlive?'eliminated':'eaten',
      killedBySessionId:by&&!by.isBot?by.sessionId:null,score:gp.score,maxMass,durationMs,mode:this.modeId,team:gp.team,placement:this._elim?this.players.size-this._elim+1:0,players:this.players.size}))
      .then(done,err=>{if(this.log)this.log.warn(`onMatchEnd (${gp.name}) falhou:`,err&&err.message);done(null);});}
  /**
   * Fim de rodada (o mundo explodiu): fecha a partida de todo humano vivo pelo mesmo caminho de persistência da morte
   * (`cause:'round'`, sem mandar `dead` — quem manda o placar é a Room) e devolve o placar final: vivos por massa
   * (o 1º é o campeão) e, no fim, os humanos que já tinham morrido.
   */
  endRound(reason='time'){
    const w=this.world,rows=this.leaderboard(),board=[],seen=new Set();
    // ⚠️ `isBot` era mandado cru mesmo com `anonBots`: o PLAYERS escondia o preenchimento a partida inteira
    // e o PÓDIO entregava os 40 no fim, com o ◆ que Round.jsx desenha. O placar segue a mesma regra da tela.
    const anon=this.mode.anonBots;
    const row=(gp,mass)=>({slot:gp.slot,name:gp.name,mass,score:gp.score,kills:gp.kills+gp.botKills,
      deaths:gp.deaths|0,food:gp.food|0,kd:kdOf(gp.kills+gp.botKills,gp.deaths|0),level:gp.level|0,
      isBot:gp.isBot&&!anon,registered:gp.registered,skinId:gp.skinId,team:gp.team<0?null:gp.team});
    for(const r of rows){const gp=this.players.get(r.slot);if(!gp)continue;seen.add(gp.slot);board.push(row(gp,r.mass));}
    // Mortos entram por ORDEM DE ELIMINAÇÃO invertida (quem caiu por último fica na frente): é o "7º de 50" do
    // Battle Royale. No Livre o bot renasce e nunca chega aqui, então a lista continua sendo só a de humanos.
    const mortos=[];
    for(const gp of this.players.values()){if(seen.has(gp.slot))continue;if(gp.isBot&&this.mode.respawnBots)continue;mortos.push(gp);}
    mortos.sort((a,b)=>b.deathTick-a.deathTick);
    for(const gp of mortos)board.push(row(gp,0));
    board.forEach((b,i)=>{b.placement=i+1;const gp=this.players.get(b.slot);if(gp)gp.placement=i+1;});
    for(const gp of this.players.values()){
      if(gp.isBot||gp.dead)continue;
      const ps=w.players.get(gp.slot);if(ps){gp.score=ps.score;ps.alive=false;}
      gp.dead=true;const sessionId=gp.sessionId,maxMass=Math.round(gp.maxMass),durationMs=Math.round((w.tick-gp.joinedTick)*1000/TICK_HZ);
      const done=r=>this._emit('rewards',{slot:gp.slot,sessionId,rewards:r||null});
      Promise.resolve().then(()=>this.hooks.onMatchEnd({sessionId,cause:reason==='lastAlive'?'survived':'round',killedBySessionId:null,score:gp.score,maxMass,durationMs,
        mode:this.modeId,team:gp.team,placement:gp.placement,players:board.length}))
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
  /**
   * Bloco `self` do snapshot (preenche `out`). Ímã e escudo são por peça: o HUD mostra o MELHOR entre as próprias
   * (cada peça leva o seu nas flags). `threat`/`threatDir` são o alerta de míssil teleguiado: têm que vir do
   * SERVIDOR porque a AOI de um jogador pequeno tem meia-largura ~1250 px e o míssil nasce muito mais longe —
   * client-side o aviso chegaria com menos de 2 s de sobra.
   */
  self(slot,out){const w=this.world,ps=w.players.get(slot),gp=this.players.get(slot),t=w.tick;
    if(!ps||!gp){out.flags=SELF_FLAG.DEAD;out.missiles=out.powerBits=out.magnetT=out.shieldLv=out.score=out.splitCd=out.ejectCd=out.fireCd=out.rank=out.mass=out.threat=out.threatDir=out.weapon=out.alive=0;out.owned=1;return out;}
    let mt=0,sh=0;const arr=ps.pieces;
    for(let i=0;i<arr.length;i++){const pc=arr[i];if(pc.dead)continue;const m=pc.magnetUntil-t;if(m>mt)mt=m;if(pc.shieldLv>sh)sh=pc.shieldLv;}
    const sc=ps.splitCdUntil-t,ec=ps.ejectCdUntil-t,fc=ps.fireCdUntil-t;
    out.flags=(gp.dead?SELF_FLAG.DEAD:0)|(w.peace?SELF_FLAG.LOBBY:0);out.weapon=ps.weapon|0;out.alive=this.aliveCount();out.owned=ownedMask(ps);
    const zc=w.zoneNow();if(zc&&!gp.dead){const me0=firstLive(ps.pieces);
      if(me0){const dx=me0.x-zc.x,dy=me0.y-zc.y;if(dx*dx+dy*dy>zc.r*zc.r)out.flags|=SELF_FLAG.ZONE_HURT;}}
    out.missiles=ammoOf(ps);out.powerBits=(mt>0?POWER_BIT.magnet:0)|(sh>0?POWER_BIT.shield:0);
    out.magnetT=mt>0?mt:0;out.shieldLv=sh;out.score=ps.score;out.splitCd=sc>0?sc:0;out.ejectCd=ec>0?ec:0;out.fireCd=fc>0?fc:0;
    out.rank=gp.dead?0:this.rankOf(slot);out.mass=gp.dead?0:Math.round(w.massOf(slot));
    out.threat=out.threatDir=0;const me=gp.dead?null:firstLive(ps.pieces);
    if(me){const m=incomingMissile(w,slot,me.x,me.y,MISSILE.ALERT_DIST);
      if(m){const dx=m.x-me.x,dy=m.y-me.y,d=Math.hypot(dx,dy);
        out.threat=1+Math.round(254*(1-Math.min(1,d/MISSILE.ALERT_DIST)));   // 255 = colado
        out.threatDir=Math.round(Math.atan2(dy,dx)/6.2831853*256)&255;}}
    return out;}
  /** Linhas do PLAYERS. */
  /**
   * Linhas do PLAYERS. No modo com `anonBots` (battle royale) o flag BOT **não vai no fio**: os
   * preenchimentos entram com nome de jogador e o cliente não tem como distingui-los. O servidor continua
   * sabendo (kills × botKills, economia, conquistas) — quem não sabe é a TELA.
   */
  playersInfo(){const out=[],t=this.world.tick,anon=this.mode.anonBots;
    for(const gp of this.players.values())
      out.push({slot:gp.slot,flags:((gp.isBot&&!anon)?PLAYER_FLAG.BOT:0)|(gp.dead?PLAYER_FLAG.DEAD:0)|(gp.registered?PLAYER_FLAG.REG:0)|(gp.talkUntil>t?PLAYER_FLAG.TALK:0),
        skinId:gp.skinId&255,team:gp.team<0?NO_TEAM:gp.team&255,level:gp.level&255,name:gp.name,score:gp.score});
    return out;}
  humanCount(){let n=0;for(const gp of this.players.values())if(!gp.isBot)n++;return n;}
  botCount(){let n=0;for(const gp of this.players.values())if(gp.isBot)n++;return n;}
  /** Quantos jogadores ainda estão vivos (é o "restam N" do HUD, e vai no `self`). */
  aliveCount(){return this.leaderboard().length;}
  /**
   * Quantas EQUIPES ainda têm alguém vivo. Sem equipe (Livre e Battle Royale solo) cada jogador é a própria
   * equipe, então isto vale como "quantos restam" e o teste de vitória é o mesmo nos dois casos.
   */
  aliveTeams(){const lb=this.leaderboard(),ts=new Set();
    for(const r of lb){const gp=this.players.get(r.slot);ts.add(gp&&gp.team>=0?`t${gp.team}`:`s${r.slot}`);}
    return ts.size;}
  /** A equipe (ou o slot) que ainda respira — quem vence por último-vivo. null se ninguém. */
  lastAliveKey(){const lb=this.leaderboard();if(!lb.length)return null;
    const gp=this.players.get(lb[0].slot);return gp&&gp.team>=0?{team:gp.team}:{slot:lb[0].slot};}
}

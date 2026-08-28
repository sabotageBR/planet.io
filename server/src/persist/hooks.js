// ── Persistência: implementa docs/spec/hooks.md (sim nunca espera o banco) ─────
// @ts-check
import {createTokens} from '../auth/tokens.js';
import {suggestNick} from '../auth/nick.js';
import {createUsers} from '../repos/users.js';
import {createLedger} from '../repos/ledger.js';
import {createSkins} from '../repos/skins.js';
import {createMatches} from '../repos/matches.js';
import {createAchievements} from '../repos/achievements.js';
import {createRanking} from '../repos/ranking.js';
import {MatchSession} from './session.js';
import {createQueue} from './queue.js';
import {matchCoins,achievementCoins,newAchievements,skinsForAchievements,achievementTitle} from './rewards.js';
const JOIN_TIMEOUT_MS=3000,DRAIN_MS=10000,CLEAN_LOCK=727002,HOUR=3600e3,DAY=24*HOUR;
const UNSAVED=(nick)=>({ok:true,userId:null,nick,registered:false,skinId:0,prefs:{},unsaved:true});
const NO_REWARDS=()=>({saved:false,coinsEarned:0,coins:null,achievements:[],skinsUnlocked:[],rank:null});
const withTimeout=(p,ms)=>new Promise((res,rej)=>{const t=setTimeout(()=>rej(Object.assign(new Error('timeout'),{code:'ETIMEDOUT'})),ms);p.then(v=>{clearTimeout(t);res(v);},e=>{clearTimeout(t);rej(e);});});
/**
 * @param {{db:any,log:any,config:any}} o
 * @returns {{hooks:any,health:()=>{queue:number,sessions:number,db:'ok'|'down'},sessions:Map<string,MatchSession>,finishMatch:Function,shutdown:()=>Promise<void>}}
 */
export function createPersistence({db,log,config}){
  const tokens=createTokens(db,log),users=createUsers(db),ledger=createLedger(db),skins=createSkins(db),matches=createMatches(db),achievements=createAchievements(db),ranking=createRanking(db);
  const queue=createQueue({log});
  /** @type {Map<string,MatchSession>} */
  const sessions=new Map();
  // sessões encerradas há pouco (sessionId → userId): killed_by ainda resolve se o matador saiu no mesmo instante
  const recent=new Map();const RECENT_MS=60e3;
  const forget=s=>{sessions.delete(s.sessionId);if(s.userId){recent.set(s.sessionId,{userId:s.userId,at:Date.now()});if(recent.size>5000)for(const [k,v] of recent){if(Date.now()-v.at>RECENT_MS)recent.delete(k);else break;}}};
  const userOf=sid=>{if(!sid)return null;const s=sessions.get(sid);if(s)return s.userId||null;const r=recent.get(sid);return r&&Date.now()-r.at<RECENT_MS?r.userId:null;};
  let shuttingDown=false;
  // ── join ──
  async function onPlayerJoin({token,fallbackNick,remoteAddr,userAgent,roomCode=null}={}){
    const fb=String(fallbackNick||'Viajante').slice(0,16)||'Viajante';
    if(shuttingDown)return UNSAVED(fb);
    if(db.health.down)return UNSAVED(fb);
    let u;
    try{u=await withTimeout(tokens.resolve(token),JOIN_TIMEOUT_MS);}
    catch(e){log.warn(`join sem persistência (${remoteAddr||'?'}): ${e.message}`);return UNSAVED(fb);}
    if(!u)return{ok:false,code:'AUTH',message:'token inválido ou expirado'};
    if(u.nick_reserved)return{ok:false,code:'NICK_RESERVED',message:'esse nick pertence a um jogador registrado',suggestion:suggestNick(u.nick)};
    const s=new MatchSession({userId:Number(u.id),nick:u.nick,kind:u.kind,skinId:u.equipped_skin_id,roomCode,shard:config.shard});
    sessions.set(s.sessionId,s);
    return{ok:true,userId:s.userId,nick:s.nick,registered:s.registered,skinId:s.skinId,prefs:u.prefs||{},sessionId:s.sessionId,unsaved:false};
  }
  /** sessão "sem banco" para quem entrou em modo unsaved e quer mesmo assim um sessionId/rewards {saved:false} */
  function openUnsavedSession({nick,roomCode=null}={}){const s=new MatchSession({userId:null,nick:nick||'Viajante',kind:'guest',roomCode,shard:config.shard});sessions.set(s.sessionId,s);return s.sessionId;}
  // ── contadores (fire-and-forget) ──
  const onStat=({sessionId,key})=>{const s=sessions.get(sessionId);if(s)s.stat(key);};
  const onKill=({killerSessionId,sessionId,victimIsBot})=>{const s=sessions.get(killerSessionId||sessionId);if(s)s.kill({victimIsBot:!!victimIsBot});};
  const onSample=({sessionId,mass,rank,quadrant})=>{const s=sessions.get(sessionId);if(s)s.sample({mass,rank,quadrant});};
  // ── fim da partida: uma transação ──
  async function finishMatch(m){
    const rewards=await db.tx(async c=>{
      const ins=await matches.insert(c,m);
      if(!ins.inserted){const u=await users.byId(m.userId,c);return{saved:true,duplicate:true,coinsEarned:ins.coinsEarned,coins:u?u.coins:null,achievements:[],skinsUnlocked:[]};}
      const stats=await matches.upsertStats(c,m);
      const owned=await achievements.keysFor(m.userId,c);
      const fresh=await achievements.unlock(c,m.userId,newAchievements(m,stats,owned),ins.id);
      const skinsUnlocked=await skins.grantMany(c,m.userId,skinsForAchievements(fresh),'achievement');
      let coins=null,earned=0;
      const base=matchCoins(m);if(base>0){coins=(await ledger.apply(c,{userId:m.userId,delta:base,reason:'match',refType:'match',refId:ins.id})).coins;earned+=base;}
      for(const k of fresh){const d=achievementCoins(k);coins=(await ledger.apply(c,{userId:m.userId,delta:d,reason:'achievement',refType:'achievement',refId:k})).coins;earned+=d;}
      if(coins==null){const u=await users.byId(m.userId,c);coins=u?u.coins:null;}
      await matches.setCoins(c,ins.id,earned);
      return{saved:true,matchId:ins.id,coinsEarned:earned,coins,achievements:fresh.map(k=>({key:k,title:achievementTitle(k)})),skinsUnlocked};
    });
    let day=null;try{const r=await ranking.rankOf({period:'day',by:'score',userId:m.userId});day=r?r.rank:null;}catch{}
    return{...rewards,rank:{day}};
  }
  async function onMatchEnd({sessionId,cause='left',killedBySessionId=null,score=0,maxMass=0,durationMs=null,mode=0,team=null,placement=0,players=0,teamSize=1}={}){
    const s=sessions.get(sessionId);if(!s)return null;
    forget(s);
    const m=s.end({cause,score,maxMass,durationMs,killedByUserId:userOf(killedBySessionId),mode,team,placement,players,teamSize});
    if(!m.userId)return NO_REWARDS();
    try{return await queue.push(`match ${m.sessionId.slice(0,8)} (#${m.userId})`,()=>finishMatch(m));}
    catch(e){log.warn(`match #${m.userId} não salvo: ${e.message}`);return NO_REWARDS();}
  }
  // ── shutdown: fecha sessões vivas como 'shutdown' e drena a fila ──
  async function onShutdown(){
    if(shuttingDown)return;shuttingDown=true;
    const live=[...sessions.values()];for(const s of live)forget(s);
    for(const s of live){const m=s.end({cause:'shutdown',score:0,maxMass:s.maxMass});if(m.userId)queue.push(`match ${m.sessionId.slice(0,8)} (#${m.userId}, shutdown)`,()=>finishMatch(m)).catch(()=>{});}
    if(live.length)log.info(`shutdown: ${live.length} sessão(ões) encerrada(s) como 'shutdown'`);
    await queue.drain(DRAIN_MS);
  }
  // ── limpeza periódica (só shard 0; pg_try_advisory_lock evita duelo entre pods) ──
  let lastTokens=0,lastGuests=0;
  async function cleanup(){
    if(db.health.down)return;
    const now=Date.now();const doTokens=now-lastTokens>=DAY,doGuests=now-lastGuests>=7*DAY;if(!doTokens&&!doGuests)return;
    try{
      await db.withClient(async c=>{
        const got=(await c.query('SELECT pg_try_advisory_lock($1) AS ok',[CLEAN_LOCK])).rows[0].ok;if(!got)return;
        try{
          if(doTokens){const n=await tokens.purgeExpired(c);lastTokens=now;log.info(`limpeza: ${n} token(s) expirado(s) removido(s)`);}
          if(doGuests){const n=await users.purgeOrphanGuests(c);lastGuests=now;log.info(`limpeza: ${n} guest(s) órfão(s) removido(s)`);}
        }finally{await c.query('SELECT pg_advisory_unlock($1)',[CLEAN_LOCK]).catch(()=>{});}
      });
    }catch(e){log.warn('limpeza falhou:',e.message);}
  }
  let cleanTimer=null;
  if(config.shard===0&&!config.noCleanup){cleanTimer=setInterval(cleanup,HOUR);cleanTimer.unref();setTimeout(cleanup,60e3).unref();}
  const health=()=>({queue:queue.size,sessions:sessions.size,db:db.health.down?'down':'ok',...queue.stats()});
  async function shutdown(){if(cleanTimer)clearInterval(cleanTimer);await onShutdown();}
  const hooks={onPlayerJoin,onStat,onKill,onSample,onMatchEnd,onShutdown};
  return{hooks,health,sessions,finishMatch,openUnsavedSession,cleanup,queue,shutdown};
}

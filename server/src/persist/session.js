// ── MatchSession: uma vida (join → morte/saída), vive fora do objeto do mundo ──
// @ts-check
import {randomUUID} from 'node:crypto';
import {SAMPLE_EVERY} from '@planet/shared/constants.js';
export class MatchSession{
  /** @param {{userId:number|null,nick:string,kind:string,skinId?:number,roomCode?:string|null,shard?:number}} o */
  constructor(o){
    this.sessionId=randomUUID();this.userId=o.userId??null;this.nick=o.nick;this.kind=o.kind||'guest';this.skinId=o.skinId||0;
    this.roomCode=o.roomCode||null;this.shard=o.shard||0;this.startedAt=Date.now();
    // contadores: onKill é a fonte de abates; onStat eat/eatBot só contam se a sim nunca chamar onKill (sem duplicar)
    this.kills=0;this.botKills=0;this.statKills=0;this.statBotKills=0;this.splits=0;this.ejects=0;this.food=0;
    this.streak=0;this.bestStreak=0;this.top1Ticks=0;this.quadrants=new Set();this.maxMass=0;this.ended=false;this.summary=null;
  }
  get registered(){return this.kind==='registered';}
  /** @param {'split'|'eject'|'eat'|'eatBot'|'food'} key */
  stat(key){if(this.ended)return;switch(key){case 'split':this.splits++;break;case 'eject':this.ejects++;break;case 'food':this.food++;break;case 'eat':this.statKills++;break;case 'eatBot':this.statBotKills++;break;}}
  kill({victimIsBot}){if(this.ended)return;if(victimIsBot)this.botKills++;else this.kills++;this.streak++;if(this.streak>this.bestStreak)this.bestStreak=this.streak;}
  sample({mass,rank,quadrant}){if(this.ended)return;if(mass>this.maxMass)this.maxMass=mass;if(rank===1)this.top1Ticks+=SAMPLE_EVERY;if(quadrant!=null)this.quadrants.add(quadrant);}
  /** idempotente: 1ª chamada fecha e gera o resumo; as seguintes devolvem o mesmo */
  end({cause='left',score=0,maxMass=0,durationMs=null,killedByUserId=null}={}){
    if(this.ended)return this.summary;this.ended=true;
    const viaKill=this.kills+this.botKills>0||this.statKills+this.statBotKills===0;
    const kills=viaKill?this.kills:this.statKills,botKills=viaKill?this.botKills:this.statBotKills;
    const ms=durationMs!=null?durationMs:Date.now()-this.startedAt;
    this.summary={sessionId:this.sessionId,userId:this.userId,nick:this.nick,roomCode:this.roomCode,shard:this.shard,skinId:this.skinId,startedAt:this.startedAt,
      durationMs:ms,durationS:Math.max(0,Math.round(ms/1000)),score:Math.max(0,Math.round(score||0)),maxMass:Math.max(0,Math.round(Math.max(maxMass||0,this.maxMass))),
      kills,botKills,splits:this.splits,ejects:this.ejects,food:this.food,bestStreak:this.bestStreak,top1Ticks:this.top1Ticks,quadrants:this.quadrants.size,cause,killedByUserId};
    return this.summary;
  }
}

// ── PARTY: lobby de equipe por CÓDIGO (o convite que vai por link) ────────────
// Em memória no shard, com TTL — nada no banco. O código reusa `codes.js`, cujo 1º char é o shard em base36,
// então quem cola o link do amigo cai no MESMO shard e, por consequência, na mesma sala: sem isso o convite
// levaria a pessoa a outro pod e ela nunca encontraria o grupo.
// Fluxo: create → (amigos) join → start; o `join` do WS lê `msg.party` e a Room põe todos na mesma equipe
// (Room._teamFor). Vaga que sobrar na equipe é preenchida por BOT aliado no começo da partida (autopreencher).
// Convidado (guest) participa: quem identifica é o token, não a conta.
// @ts-check
import {MODE,MODES,modeOf,BR} from '@planet/shared/constants.js';
import {newCode,normalizeCode,shardOf} from './codes.js';
const TTL_MS=20*60*1000,SWEEP_MS=30000;

/** @param {{config:any,log:any}} o */
export function createPartyManager({config,log}){
  /** @type {Map<string,{code:string,shard:number,mode:number,teamSize:number,leader:string,members:{key:string,nick:string,skinId:number,registered:boolean,at:number}[],createdAt:number,touchedAt:number,started:boolean,room:string|null}>} */
  const parties=new Map();

  const touch=p=>{p.touchedAt=Date.now();return p;};
  const view=p=>({code:p.code,shard:p.shard,mode:p.mode,teamSize:p.teamSize,leader:p.leader,started:p.started,room:p.room,
    members:p.members.map(m=>({key:m.key,nick:m.nick,skinId:m.skinId,registered:m.registered,leader:m.key===p.leader})),
    slots:p.teamSize,free:Math.max(0,p.teamSize-p.members.length)});

  /** Cria o lobby. `key` identifica a pessoa (hash do token) e vira o líder. */
  function create({key,nick,skinId=0,registered=false,mode=MODE.BR,teamSize=2}){
    const m=modeOf(mode),ts=m.teamSizes.includes(teamSize)?teamSize:2;
    if(ts<2)return{error:'bad_team_size',message:'equipe precisa de 2 a 4 jogadores'};
    let code=newCode(config.shard);while(parties.has(code))code=newCode(config.shard);
    const p={code,shard:config.shard,mode:m.id,teamSize:ts,leader:key,members:[{key,nick,skinId,registered,at:Date.now()}],
      createdAt:Date.now(),touchedAt:Date.now(),started:false,room:null};
    parties.set(code,p);log.info(`party criado: ${code} (${m.key}/${ts})`);
    return{party:view(p)};}

  function get(code){const c=normalizeCode(code);if(!c)return null;
    if(shardOf(c)!==config.shard)return null;   // código de outro shard: quem responde é o irmão (o cliente troca de host pelo 1º char)
    const p=parties.get(c);return p?touch(p):null;}

  function join(code,{key,nick,skinId=0,registered=false}){
    const p=get(code);if(!p)return{error:'not_found',message:'lobby não encontrado ou expirado'};
    if(p.started)return{error:'started',message:'a equipe já entrou em partida'};
    const ja=p.members.find(m=>m.key===key);
    if(ja){ja.nick=nick;ja.skinId=skinId;return{party:view(p)};}   // reentrar (recarregou a página) não duplica ninguém
    if(p.members.length>=p.teamSize)return{error:'full',message:'a equipe está cheia'};
    p.members.push({key,nick,skinId,registered,at:Date.now()});
    return{party:view(p)};}

  /** Sai. O líder saindo DISSOLVE o lobby: o código dele é o convite, e um convite órfão só confunde. */
  function leave(code,key){
    const p=get(code);if(!p)return{ok:true};
    if(p.leader===key){parties.delete(p.code);return{ok:true,dissolved:true};}
    p.members=p.members.filter(m=>m.key!==key);return{ok:true,party:view(p)};}

  /** Só o líder começa. `room` é o código da sala escolhida — todos os membros usam esse mesmo código no join. */
  function start(code,key,room){
    const p=get(code);if(!p)return{error:'not_found',message:'lobby não encontrado ou expirado'};
    if(p.leader!==key)return{error:'not_leader',message:'só quem criou a equipe pode começar'};
    p.started=true;p.room=room||null;return{party:view(p)};}

  const timer=setInterval(()=>{const now=Date.now();
    for(const p of parties.values())if(now-p.touchedAt>TTL_MS){parties.delete(p.code);log.debug(`party ${p.code} expirou`);}},SWEEP_MS);
  timer.unref();
  return{parties,create,get,join,leave,start,view,close(){clearInterval(timer);}};
}

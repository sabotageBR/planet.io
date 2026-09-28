// ── Persistência: implementa docs/spec/hooks.md (sim nunca espera o banco) ─────
// @ts-check
import {createTokens} from '../auth/tokens.js';
import {createUsers} from '../repos/users.js';
import {createLedger} from '../repos/ledger.js';
import {createSkins} from '../repos/skins.js';
import {createMatches} from '../repos/matches.js';
import {createAchievements} from '../repos/achievements.js';
import {createRanking} from '../repos/ranking.js';
import {MatchSession} from './session.js';
import {createQueue} from './queue.js';
import {matchCoins,achievementCoins,newAchievements,skinsForAchievements,achievementTitle,matchXp,matchDeaths} from './rewards.js';
import {levelFromXp,levelProgress} from '@warspace/shared/levels.js';
import {eggSkinFor} from '@warspace/shared/eggs.js';
import {SKIN_TUTORIAL} from '@warspace/shared/skins.js';
import {PROGRESSO} from '@warspace/shared/constants.js';
const JOIN_TIMEOUT_MS=3000,TESTE_MS=800,DRAIN_MS=10000,CLEAN_LOCK=727002,HOUR=3600e3,DAY=24*HOUR;
// Sem banco não há skin equipada nem nível — mas o EASTER EGG continua valendo: ele depende só do nick,
// e é justamente no modo sem persistência (e no ?local=1) que ele é mais visível.
const UNSAVED=(nick)=>({ok:true,userId:null,nick,registered:false,skinId:eggSkinFor(nick)||0,level:0,avatar:null,prefs:{},unsaved:true});
const NO_REWARDS=()=>({saved:false,coinsEarned:0,coins:null,achievements:[],skinsUnlocked:[],rank:null});
const withTimeout=(p,ms)=>new Promise((res,rej)=>{const t=setTimeout(()=>rej(Object.assign(new Error('timeout'),{code:'ETIMEDOUT'})),ms);p.then(v=>{clearTimeout(t);res(v);},e=>{clearTimeout(t);rej(e);});});
/** `metrics` é opcional: os testes montam a persistência sozinha, e um contador que falta não pode derrubar o fim de partida. */
const SEM_METRICS={vida(){},spawn(){}};
/**
 * @param {{db:any,log:any,config:any,metrics?:any}} o
 * @returns {{hooks:any,health:()=>{queue:number,sessions:number,db:'ok'|'down'},sessions:Map<string,MatchSession>,finishMatch:Function,shutdown:()=>Promise<void>}}
 */
export function createPersistence({db,log,config,metrics=SEM_METRICS}){
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
    // EASTER EGG: quem entra como "Bruxo" joga com a caricatura do Ronaldinho. Decidido AQUI, e não na
    // Room, para que `matches.skin_id` grave a skin realmente usada — e ele NUNCA escreve em
    // `users.equipped_skin_id`: é substituição de uma vida só, e trocar o nick devolve a skin comprada.
    // `prefs.eggs:false` desliga, para quem gastou 30 mil moedas e por acaso se chama Bruxo.
    const prefs=u.prefs||{};
    const egg=prefs.eggs===false?null:eggSkinFor(u.nick);
    // ⚠️ A SKIN EM TESTE: nas primeiras `PROGRESSO.PARTIDAS` partidas quem ainda está com a skin de
    // NASCENÇA (a que `nasceCom` sorteia entre as grátis/comuns) joga com o Marte Bravo — o planeta do
    // tutorial. Ele era TIRADO do jogador na entrada da primeira sala, e a troca de planeta no instante em
    // que a partida começa lia como defeito (visto nos playtests da Poki de 25/09). Agora ele fica, e a
    // concessão em `finishMatch` o torna definitivo sem que o planeta mude uma vez sequer.
    // ⚠️ Só por cima da skin de NASCENÇA, e quem diz isso é a ORIGEM da posse (`source='default'`), nunca a
    // lista de skins iniciais: as nove comuns estão nela E estão à venda, e quem comprou uma e a equipou
    // joga com a DELA. O easter egg continua ganhando — é uma escolha feita no nick.
    // ⚠️ Override de VIDA, como o egg: não escreve em `users.equipped_skin_id` (quem escreve é a concessão),
    // então a Loja continua dizendo a verdade sobre o que a conta tem equipado.
    // ⚠️ A consulta só existe nas 3 primeiras partidas da conta, e com teto próprio: falhou ou demorou, a
    // vida sai com a skin equipada — nunca um join mais lento por causa de um enfeite.
    let emTeste=false;
    if(egg==null&&(Number(u.games)|0)<PROGRESSO.PARTIDAS)
      try{emTeste=u.equipped_skin_id==null||await withTimeout(skins.isDefault(u.id,u.equipped_skin_id),TESTE_MS);}catch{emTeste=false;}
    const s=new MatchSession({userId:Number(u.id),nick:u.nick,kind:u.kind,skinId:egg!=null?egg:emTeste?SKIN_TUTORIAL:u.equipped_skin_id,roomCode,shard:config.shard});
    sessions.set(s.sessionId,s);
    return{ok:true,userId:s.userId,nick:s.nick,registered:s.registered,skinId:s.skinId,
      level:levelFromXp(Number(u.xp||0)),avatar:u.avatar_hash||null,country:u.country||null,prefs,sessionId:s.sessionId,unsaved:false};
  }
  /**
   * Abre uma VIDA nova para quem já está na sala. Duas usam isto:
   *  · `openUnsavedSession` — quem entrou em modo unsaved e mesmo assim quer sessionId e rewards {saved:false};
   *  · `Room.respawn` — renascer no Livre, que deixou de ser `leave`+`join` (ver `Sim.revive`). A sessão da
   *    vida anterior já foi fechada por `onMatchEnd` na morte (e `MatchSession.end` é idempotente), então
   *    aqui não há nada a desfazer: é só começar a contar de novo.
   * `userId` null é o caminho sem banco — `onMatchEnd` devolve NO_REWARDS e nada é gravado, como sempre.
   */
  function openSession({userId=null,nick='Viajante',kind='guest',skinId=0,roomCode=null}={}){
    const s=new MatchSession({userId,nick:nick||'Viajante',kind,skinId,roomCode,shard:config.shard});
    sessions.set(s.sessionId,s);return s.sessionId;}
  const openUnsavedSession=({nick,roomCode=null}={})=>openSession({nick,roomCode});
  /**
   * DESCARTA uma sessão sem gravar nada — o join foi RECUSADO e não houve partida.
   *
   * ⚠️ Isto existe porque `onPlayerJoin` abre a sessão ANTES de saber em que sala o jogador vai entrar
   * (e antes de qualquer recusa), e os três becos de `net/wsServer.js` — sala cheia/já começou, nick em
   * uso e banido — fechavam com `onMatchEnd({durationMs:0})`. Cada recusa gravava uma linha REAL em
   * `matches` com `duration_s=0` e `cause='left'`, e `repos/analytics.js` toma a linha de menor `id`
   * por usuário como "a primeira vida": a fantasma virava a estreia do novato, ou seja literalmente
   * "saiu em 0 segundos" de alguém que nunca entrou.
   * ⚠️ Não se inventa causa nova para marcá-la de outro jeito: o CHECK de `matches.cause` (migração
   * 0003) só conhece um punhado de palavras, e um valor fora dele quebra o INSERT com 23514 dentro de
   * um catch, em silêncio. O certo é não ter partida nenhuma para gravar.
   */
  const dropSession=sessionId=>{const s=sessionId&&sessions.get(sessionId);if(s)sessions.delete(sessionId);return !!s;};
  // ── contadores (fire-and-forget) ──
  const onStat=({sessionId,key})=>{const s=sessions.get(sessionId);if(s)s.stat(key);};
  const onKill=({killerSessionId,sessionId,victimIsBot})=>{const s=sessions.get(killerSessionId||sessionId);if(s)s.kill({victimIsBot:!!victimIsBot});};
  const onSample=({sessionId,mass,rank,quadrant})=>{const s=sessions.get(sessionId);if(s)s.sample({mass,rank,quadrant});};
  // ── fim da partida: uma transação ──
  async function finishMatch(m){
    const rewards=await db.tx(async c=>{
      // XP e mortes entram no MESMO objeto que já vai para as duas tabelas: a partida grava o que rendeu
      // (matches.xp) e o acumulado soma (user_stats.xp/deaths), tudo na transação que já existia.
      m.xp=matchXp(m);m.deaths=matchDeaths(m);
      const ins=await matches.insert(c,m);
      if(!ins.inserted){const u=await users.byId(m.userId,c);return{saved:true,duplicate:true,coinsEarned:ins.coinsEarned,coins:u?u.coins:null,achievements:[],skinsUnlocked:[]};}
      const stats=await matches.upsertStats(c,m);
      const owned=await achievements.keysFor(m.userId,c);
      const fresh=await achievements.unlock(c,m.userId,newAchievements(m,stats,owned),ins.id);
      // ⚠️ `[...owned,...fresh]` E NÃO SÓ `fresh`. `achievements.unlock` devolve apenas as chaves REALMENTE
      // inseridas (`ON CONFLICT DO NOTHING RETURNING key`), então uma skin amarrada a uma conquista que a
      // conta JÁ TINHA nunca era concedida — quem destravou `mass.s` antes de existir uma skin para ela
      // ficava sem a skin para sempre, e a única saída seria uma migração de backfill.
      // Não vira fonte infinita: `grantMany` (repos/skins.js) devolve só os ids que ele de fato inseriu,
      // então a partir da segunda partida a lista volta vazia sozinha. É auto-corretivo e custa uma linha.
      const skinsUnlocked=await skins.grantMany(c,m.userId,skinsForAchievements([...owned,...fresh]),'achievement');
      // ⚠️ A SKIN DO TUTORIAL, POR PARTIDAS JOGADAS. O jogador a experimenta no tutorial e a perde ao entrar
      // na primeira sala de verdade; `PROGRESSO.PARTIDAS` partidas a devolvem para sempre, e a barra da tela
      // de morte (`ui/premio.js`) mostra o que falta. `games` é o acumulado da CONTA e o tutorial não entra
      // nele — ele roda no `LocalServer` e não grava partida nenhuma —, então são três de verdade.
      // ⚠️ `source:'grant'` e NUNCA um `unlockKey` na skin: aquele campo a tiraria da venda por
      // `isPurchasable`, e a decisão é que ela CONTINUE comprável (2.100 moedas) para quem não quer esperar.
      // Também evitaria uma conquista "jogue 3 partidas" no Perfil ao lado da família `games`
      // ("Veterano: jogue 10 partidas"), que já existe e diria quase a mesma coisa.
      // ⚠️ Não vira fonte infinita nem custa uma consulta por partida a mais: `grantMany` devolve só o que
      // de fato inseriu, então da 4ª partida em diante a lista volta vazia sozinha — é o mesmo argumento
      // auto-corretivo escrito logo acima para as conquistas.
      // ⚠️ E ELA FICA EQUIPADA, mas só por cima da skin de NASCENÇA (`equipSeInicial`): nas partidas anteriores o
      // jogador já estava com ela (a skin em teste de `onPlayerJoin`), e sem a troca a partida seguinte à
      // concessão voltaria à skin sorteada — o planeta mudaria no instante exato em que virou DELE.
      // `equipped` viaja no payload porque o cliente guarda a skin equipada (`session.user.equippedSkin`)
      // e a Loja diria outra coisa até o próximo boot.
      let equipped=null;
      if((stats.games|0)>=PROGRESSO.PARTIDAS)
        for(const id of await skins.grantMany(c,m.userId,[SKIN_TUTORIAL],'grant')){skinsUnlocked.push(id);
          if(await users.equipSeInicial(m.userId,id,c))equipped=id;}
      let coins=null,earned=0;
      const base=matchCoins(m);if(base>0){coins=(await ledger.apply(c,{userId:m.userId,delta:base,reason:'match',refType:'match',refId:ins.id})).coins;earned+=base;}
      for(const k of fresh){const d=achievementCoins(k);coins=(await ledger.apply(c,{userId:m.userId,delta:d,reason:'achievement',refType:'achievement',refId:k})).coins;earned+=d;}
      if(coins==null){const u=await users.byId(m.userId,c);coins=u?u.coins:null;}
      await matches.setCoins(c,ins.id,earned);
      // O nível é DERIVADO do XP acumulado (nunca guardado), e `prevLevel` sai do total menos o ganho —
      // é assim que a tela sabe dizer "subiu de nível" sem precisar de um segundo campo no banco.
      const total=Number(stats.xp||0),level=levelFromXp(total),prev=levelFromXp(total-m.xp);
      const p=levelProgress(total);
      // ⚠️ `games` VIAJA PORQUE O CLIENTE NÃO TEM COMO SABER. `session.stats` só é escrito no boot pelo
      // `GET /api/me`, e nada depois disso o atualizava — uma barra de progresso pendurada nele ficaria
      // congelada a sessão inteira. O `onDead` o incrementa otimista para a tela abrir com o número certo;
      // este aqui é o autoritativo, e é o MESMO que decide a concessão acima (uma fonte só para os dois
      // lados da promessa).
      return{saved:true,matchId:ins.id,coinsEarned:earned,coins,achievements:fresh.map(k=>({key:k,title:achievementTitle(k)})),skinsUnlocked,games:stats.games|0,equipped,
        xp:{gained:m.xp,total,level,prevLevel:prev,leveledUp:level>prev,into:p.into,need:p.need,pct:p.pct}};
    });
    let day=null,pais=null;try{const r=await ranking.rankOf({period:'day',by:'score',userId:m.userId});day=r?r.rank:null;}catch{}
    // "3º do Brasil hoje" vale mais que "3.412º do mundo" — e é a única razão de alguém preencher o país.
    try{const u=await users.byId(m.userId);
      if(u&&u.country){const r=await ranking.rankOf({period:'day',by:'score',userId:m.userId,country:u.country});
        pais=r?{rank:r.rank,country:u.country}:null;}}catch{}
    return{...rewards,rank:{day,country:pais}};
  }
  async function onMatchEnd({sessionId,cause='left',killedBySessionId=null,score=0,maxMass=0,durationMs=null,mode=0,team=null,placement=0,players=0,teamSize=1,killerKind=null,killerMass=null,how=null}={}){
    const s=sessions.get(sessionId);if(!s)return null;
    forget(s);
    const m=s.end({cause,score,maxMass,durationMs,killedByUserId:userOf(killedBySessionId),mode,team,placement,players,teamSize,killerKind,killerMass,how});
    // ⚠️ O contador de produto vem ANTES do `if(!m.userId)`: ele é a única medida que enxerga a vida que o
    // BANCO não grava (banco fora, sessão `unsaved`, convidado sem persistência). Sem isto, um incidente de
    // banco apareceria na tela de retenção como queda de jogadores.
    metrics.vida(m);
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
  // `openSession` vai no objeto HOOKS (e não só no retorno) porque quem precisa dele é a `Room`, e ela só
  // enxerga `sim.hooks` — o `persistApi` fica do lado do HTTP.
  const hooks={onPlayerJoin,onStat,onKill,onSample,onMatchEnd,onShutdown,openSession,dropSession};
  return{hooks,health,sessions,finishMatch,openUnsavedSession,openSession,dropSession,cleanup,queue,shutdown};
}

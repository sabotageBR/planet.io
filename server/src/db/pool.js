// ── POOL PG (timeouts, timezone, circuit breaker) ─────────────────────────────
// @ts-check
import pg from 'pg';
export class DbDownError extends Error{constructor(msg='banco indisponível'){super(msg);this.code='DB_DOWN';}}
// erro de infraestrutura (rede/conexão/recurso) vs erro SQL (o banco respondeu)
export const isInfraError=e=>{if(!e||e.status)return false;const c=String(e.code||'');       // ApiError (status) nunca é infra
  if(c==='DB_DOWN'||/^(08|53|57)/.test(c)||/^E[A-Z]{3,}$/.test(c))return true;if(c)return false;
  return /timeout|terminated|connect|socket|closed|refused/i.test(e.message||'');};
export const isDbUnavailable=isInfraError;
const BREAK_AFTER=3,BREAK_MS=15000;
/**
 * @param {{databaseUrl:string,dbPoolMax:number,shard:number,tz?:string}} config
 * @param {{info:Function,warn:Function,error:Function,debug:Function}} log
 */
export function createDb(config,log){
  if(!config.databaseUrl)log.warn('DATABASE_URL vazio: toda consulta vai falhar (modo sem persistência)');
  const pool=new pg.Pool({connectionString:config.databaseUrl||'postgres://invalid',max:config.dbPoolMax,connectionTimeoutMillis:3000,idleTimeoutMillis:30000,
    statement_timeout:5000,application_name:`warspace-shard-${config.shard}`});
  pool.on('connect',c=>{c.query(`SET timezone='${(config.tz||'America/Sao_Paulo').replace(/'/g,'')}'`).catch(e=>log.warn('SET timezone falhou:',e.message));});
  pool.on('error',e=>log.warn('pool: conexão ociosa caiu:',e.message));
  let fails=0,downUntil=0,lastError=null;
  const isDown=()=>Date.now()<downUntil;
  const ok=()=>{if(fails>0)log.info('banco voltou');fails=0;};
  const fail=e=>{lastError=e;if(!isInfraError(e)){fails=0;return;}if(e.code==='DB_DOWN')return;fails++;
    if(fails>=BREAK_AFTER&&!isDown()){downUntil=Date.now()+BREAK_MS;log.warn(`banco fora: circuito aberto por ${BREAK_MS/1000}s (${e.message})`);}};
  const guard=()=>{if(isDown())throw new DbDownError();};
  async function query(text,params){guard();try{const r=await pool.query(text,params);ok();return r;}catch(e){fail(e);throw e;}}
  /** roda fn com um client dedicado (fora de transação) */
  async function withClient(fn){guard();let c;try{c=await pool.connect();}catch(e){fail(e);throw e;}
    let err=null;try{const r=await fn(c);ok();return r;}catch(e){err=e;fail(e);throw e;}finally{c.release(err&&isInfraError(err)?err:undefined);}}
  /** transação: fn(client) → commit; throw → rollback */
  const tx=fn=>withClient(async c=>{await c.query('BEGIN');try{const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}});
  const health={get ok(){return !isDown();},get down(){return isDown();},get lastError(){return lastError?lastError.message:null;},get fails(){return fails;}};
  return{query,withClient,tx,health,pool,close:()=>pool.end()};
}

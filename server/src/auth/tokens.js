// ── TOKENS opacos (pt_ + 32 bytes base64url; sha256 no banco; expiração deslizante) ──
// @ts-check
import {randomBytes,createHash} from 'node:crypto';
const DAY=86400e3;
// `admin` é o token do PAINEL, e o TTL curto não é a parte importante: o que importa é ele ser um KIND
// SEPARADO. `requireAdmin` exige is_admin **e** token_kind==='admin', então roubar a aba do jogo de um
// administrador não abre o painel — e sair do painel não desloga do jogo.
export const TOKEN_TTL_MS={device:365*DAY,session:30*DAY,admin:12*3600e3};
const SLIDE_AFTER_MS=3600e3;                       // renova expires_at/last_seen no máx. 1×/h por token
export const TOKEN_RE=/^pt_[A-Za-z0-9_-]{43}$/;
export const newToken=()=>'pt_'+randomBytes(32).toString('base64url');
export const hashToken=t=>createHash('sha256').update(t).digest('hex');
/**
 * Identidade de quem tem um token, SEM ir ao banco: o hash truncado. É o que permite reconhecer a mesma
 * pessoa entre chamadas mesmo sendo convidado, e é a chave que o lobby de equipe já usa (`keyOf`).
 * ⚠️ Não valida o formato de propósito — o modo sem banco (e os testes) usam tokens que não são `pt_…`.
 * ⚠️ Devolve `null` sem token, e quem compara tem que tratar isso: dois `null` iguais fariam de todo mundo
 * a mesma pessoa.
 */
export const sessionKey=t=>t?hashToken(t).slice(0,24):null;
export const ttlSql=kind=>kind==='admin'?`now()+interval '12 hours'`:`now()+interval '${kind==='device'?365:30} days'`;
// `st.xp` entra por LEFT JOIN em PK: custo zero numa query que já roda em todo join de WS, e é o que faz o
// badge de nível existir sem uma segunda ida ao banco no caminho mais quente do servidor.
// ⚠️ Aqui havia um EXISTS(...) AS nick_reserved — uma subconsulta por token resolvido, ou seja em TODA
// chamada autenticada e em TODO join de WS — só para barrar quem tivesse o nick de um registrado. O nick
// ficou livre na 0009 e a subconsulta saiu junto.
// ⚠️ `games` entra pelo MESMO LEFT JOIN do `xp` (custo zero): é ele que decide a SKIN EM TESTE no join
// (`persist/hooks.js`), e sem ele a regra custaria uma consulta a mais em todo join de WS.
const RESOLVE_SQL=`SELECT u.*, t.id AS token_id, t.kind AS token_kind, t.last_used_at AS token_used_at,
  COALESCE(st.xp,0) AS xp, COALESCE(st.games,0) AS games
  FROM auth_tokens t JOIN users u ON u.id=t.user_id
  LEFT JOIN user_stats st ON st.user_id=u.id
  WHERE t.token_hash=$1 AND t.revoked_at IS NULL AND t.expires_at>now()`;
/** @param {{query:Function}} db */
export function createTokens(db,log){
  /** emite token novo para o usuário; `c` opcional = client de transação */
  async function issue(userId,kind='device',userAgent=null,c=db){
    const token=newToken();
    await c.query(`INSERT INTO auth_tokens(user_id,token_hash,kind,expires_at,user_agent) VALUES($1,$2,$3,${ttlSql(kind)},$4)`,[userId,hashToken(token),kind,userAgent&&String(userAgent).slice(0,255)]);
    return token;
  }
  /** token → linha de users (+ token_id, token_kind) ou null; renova expiração deslizante */
  async function resolve(token){
    if(typeof token!=='string'||!TOKEN_RE.test(token))return null;
    const {rows}=await db.query(RESOLVE_SQL,[hashToken(token)]);const u=rows[0];if(!u)return null;
    if(Date.now()-new Date(u.token_used_at).getTime()>SLIDE_AFTER_MS){
      db.query(`UPDATE auth_tokens SET last_used_at=now(),expires_at=${ttlSql(u.token_kind)} WHERE id=$1`,[u.token_id]).catch(e=>log&&log.debug('slide token:',e.message));
      db.query(`UPDATE users SET last_seen_at=now() WHERE id=$1`,[u.id]).catch(()=>{});
    }
    return u;
  }
  async function revoke(token){if(typeof token!=='string'||!TOKEN_RE.test(token))return false;
    const r=await db.query(`UPDATE auth_tokens SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL`,[hashToken(token)]);return r.rowCount>0;}
  const revokeAll=userId=>db.query(`UPDATE auth_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`,[userId]);
  /** limpeza: tokens expirados/revogados há mais de 7 dias */
  const purgeExpired=(c=db)=>c.query(`DELETE FROM auth_tokens WHERE expires_at<now()-interval '7 days' OR revoked_at<now()-interval '7 days'`).then(r=>r.rowCount);
  return{issue,resolve,revoke,revokeAll,purgeExpired};
}

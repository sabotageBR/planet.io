// ── API HTTP: createApi({db,log,config,persist}) → async (req,res) => boolean ──
// @ts-check
import {createRouter,err} from './router.js';
import {createRateLimiter} from '../auth/ratelimit.js';
import {createTokens} from '../auth/tokens.js';
import {createUsers} from '../repos/users.js';
import {createLedger} from '../repos/ledger.js';
import {createSkins} from '../repos/skins.js';
import {createMatches} from '../repos/matches.js';
import {createAchievements} from '../repos/achievements.js';
import {createRanking} from '../repos/ranking.js';
import {createAvatars} from '../repos/avatars.js';
import {createIdentities} from '../repos/identities.js';
import {createGoogle} from '../auth/google.js';
import {createCrazyGames} from '../auth/crazygames.js';
import {mountAuth} from './auth.js';
import {mountMe} from './me.js';
import {mountSkins} from './skins.js';
import {mountRanking} from './ranking.js';
import {mountAvatar} from './avatar.js';
import {mountAdmin} from './admin.js';
import {createSettings} from '../repos/settings.js';
import {createAudit} from '../repos/audit.js';
import {createTunables} from '../tunables.js';
// rotas desta camada; /api/rooms|auto|config e /healthz ficam com o servidor do jogo
// ⚠️ ESTE REGEX É O GATE. Uma rota montada no router e ausente daqui simplesmente NÃO CHEGA ao handler:
// cai em 404 (ou no staticDir, em dev), sem uma linha de log. Toda família de rotas nova entra aqui.
const PREFIXES=/^\/api\/(auth\/|me(\/|$)|skins(\/|$)|ranking$|avatar\/|admin(\/|$))/;
/** campos para o /healthz do servidor do jogo */
export const healthFields=({db,persist}={})=>({db:db&&db.health.down?'down':'ok',queue:persist&&persist.health?persist.health().queue:0});
/**
 * @param {{db:any,log:any,config:any,persist?:any,limiter?:any,google?:any}} o
 * @returns {((req:any,res:any)=>Promise<boolean>) & {healthFields:()=>{db:string,queue:number},limiter:any,repos:any}}
 */
export function createApi({db,log,config,persist=null,limiter=createRateLimiter(),google:googleImpl=null}){
  const tokens=createTokens(db,log),users=createUsers(db),ledger=createLedger(db),skins=createSkins(db),matches=createMatches(db),achievements=createAchievements(db),ranking=createRanking(db),avatars=createAvatars(db),identities=createIdentities(db);
  const settings=createSettings(db),audit=createAudit(db,log),tunables=createTunables({settings,log});
  const optionalUser=async ctx=>ctx.token?await tokens.resolve(ctx.token):null;
  const requireUser=async ctx=>{if(!ctx.token)throw err(401,'unauthorized','faça login (Bearer)');const u=await tokens.resolve(ctx.token);if(!u)throw err(401,'unauthorized','token inválido ou expirado');return u;};
  const router=createRouter({log,limiter,prefixes:PREFIXES});
  // `google` injetável: é o gancho que deixa o teste exercitar o caminho FELIZ do login sem ir à rede
  // do Google (a validação real é uma ida ao `tokeninfo`). Em produção ninguém passa nada e nada muda.
  const google=googleImpl||createGoogle({config,log});
  const crazygames=createCrazyGames({config,log});
  const deps={db,log,config,users,tokens,ledger,skins,matches,achievements,ranking,avatars,identities,settings,audit,tunables,google,crazygames,limiter,requireUser,optionalUser};
  mountAuth(router,deps);mountMe(router,deps);mountSkins(router,deps);mountRanking(router,deps);mountAvatar(router,deps);mountAdmin(router,deps);
  // Parâmetros salvos entram ANTES da primeira sala existir; depois o poll reconcilia. E o `ADMIN_EMAILS`
  // é reconciliado no boot — SÓ PROMOVE: rebaixar por ConfigMap tranca o admin para fora por um typo.
  tunables.load().then(n=>{if(n)log.info(`tunables: ${n} parâmetro(s) do painel aplicados`);tunables.start();}).catch(()=>{});
  if(config.adminEmails&&config.adminEmails.length)users.promoteByEmails(config.adminEmails)
    .then(n=>{if(n)log.info(`admin: ${n} conta(s) promovida(s) por ADMIN_EMAILS`);
      else log.warn(`admin: ADMIN_EMAILS não promoveu ninguém (nenhuma conta REGISTRADA com esses e-mails)`);})
    .catch(e=>log.warn('admin: promoção por ADMIN_EMAILS falhou:',e&&e.message));
  const handler=(req,res)=>router.handle(req,res);
  handler.healthFields=()=>healthFields({db,persist});
  handler.limiter=limiter;handler.repos={users,tokens,ledger,skins,matches,achievements,ranking,avatars,settings,audit,tunables};handler.router=router;
  return handler;
}

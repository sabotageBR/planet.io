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
import {mountAuth} from './auth.js';
import {mountMe} from './me.js';
import {mountSkins} from './skins.js';
import {mountRanking} from './ranking.js';
import {mountAvatar} from './avatar.js';
// rotas desta camada; /api/rooms|auto|config e /healthz ficam com o servidor do jogo
const PREFIXES=/^\/api\/(auth\/|me(\/|$)|skins(\/|$)|ranking$|avatar\/)/;
/** campos para o /healthz do servidor do jogo */
export const healthFields=({db,persist}={})=>({db:db&&db.health.down?'down':'ok',queue:persist&&persist.health?persist.health().queue:0});
/**
 * @param {{db:any,log:any,config:any,persist?:any,limiter?:any}} o
 * @returns {((req:any,res:any)=>Promise<boolean>) & {healthFields:()=>{db:string,queue:number},limiter:any,repos:any}}
 */
export function createApi({db,log,config,persist=null,limiter=createRateLimiter()}){
  const tokens=createTokens(db,log),users=createUsers(db),ledger=createLedger(db),skins=createSkins(db),matches=createMatches(db),achievements=createAchievements(db),ranking=createRanking(db),avatars=createAvatars(db),identities=createIdentities(db);
  const optionalUser=async ctx=>ctx.token?await tokens.resolve(ctx.token):null;
  const requireUser=async ctx=>{if(!ctx.token)throw err(401,'unauthorized','faça login (Bearer)');const u=await tokens.resolve(ctx.token);if(!u)throw err(401,'unauthorized','token inválido ou expirado');return u;};
  const router=createRouter({log,limiter,prefixes:PREFIXES});
  const google=createGoogle({config,log});
  const deps={db,log,config,users,tokens,ledger,skins,matches,achievements,ranking,avatars,identities,google,limiter,requireUser,optionalUser};
  mountAuth(router,deps);mountMe(router,deps);mountSkins(router,deps);mountRanking(router,deps);mountAvatar(router,deps);
  const handler=(req,res)=>router.handle(req,res);
  handler.healthFields=()=>healthFields({db,persist});
  handler.limiter=limiter;handler.repos={users,tokens,ledger,skins,matches,achievements,ranking,avatars};handler.router=router;
  return handler;
}

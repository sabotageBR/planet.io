// ── /api/me, /api/me/prefs, /api/me/history ────────────────────────────────────
// @ts-check
import {err} from './router.js';
import {LIMITS} from '../auth/ratelimit.js';
import {normalizeNick,suggestNick,isReservedByOther} from '../auth/nick.js';
import {toPublic} from '../repos/users.js';
import {statsToPublic} from '../repos/matches.js';
const THEMES=['auto','dawn','sunset','dusk'],QUALITIES=['auto','low','medium','high'];
const bool=v=>typeof v==='boolean'?v:undefined;
/** whitelist de prefs: chave → validador (undefined = rejeita) */
export const PREFS={
  quality:v=>QUALITIES.includes(v)?v:undefined,
  showNames:bool,showMass:bool,showGrid:bool,showMinimap:bool,showFps:bool,sound:bool,music:bool,joystick:bool,holdEject:bool,rightSplit:bool,reduceMotion:bool,bigText:bool,
  volume:v=>typeof v==='number'&&v>=0&&v<=100?Math.round(v):undefined,   // 0..100, a mesma unidade do cliente (state/app.js e audio/index.js dividem por 100); com o antigo 0..1 o slider era descartado em silêncio e nunca persistia
  theme:v=>THEMES.includes(v)?v:undefined,
  colorblind:v=>typeof v==='boolean'?v:typeof v==='string'&&/^[a-z]{1,16}$/.test(v)?v:undefined,
  lbSize:v=>Number.isInteger(v)&&v>=3&&v<=20?v:undefined,
};
export function sanitizePrefs(input){
  if(!input||typeof input!=='object')return{};
  const out={};for(const [k,v] of Object.entries(input)){const f=PREFS[k];if(!f)continue;const x=f(v);if(x!==undefined)out[k]=x;}return out;
}
export function mountMe(router,{db,users,skins,matches,achievements,requireUser}){
  // GET /api/me 🔒
  router.add('GET',/^\/api\/me$/,async ctx=>{
    const me=await requireUser(ctx);
    const [owned,stats,ach]=await Promise.all([skins.ownedIds(me.id),matches.statsFor(me.id),achievements.keysFor(me.id)]);
    return{user:toPublic(me),skins:owned,prefs:me.prefs||{},stats:statsToPublic(stats),achievements:ach};
  });
  // PATCH /api/me {nick} 🔒
  router.add('PATCH',/^\/api\/me$/,async ctx=>{
    const me=await requireUser(ctx);
    const nick=normalizeNick(ctx.body.nick);if(!nick)throw err(400,'invalid_nick','nick deve ter de 2 a 16 caracteres');
    if(await isReservedByOther(db,nick,me.id))throw err(409,'nick_reserved','esse nick pertence a um jogador registrado',{suggestion:suggestNick(nick)});
    let u;try{u=await users.setNick(me.id,nick);}catch(e){if(e.code==='23505')throw err(409,'nick_reserved','esse nick pertence a um jogador registrado',{suggestion:suggestNick(nick)});throw e;}
    return{user:toPublic(u)};
  },{rate:{scope:'token',lim:LIMITS.tokenWrite}});
  // PATCH /api/me/prefs {…} 🔒
  router.add('PATCH',/^\/api\/me\/prefs$/,async ctx=>{
    const me=await requireUser(ctx);const patch=sanitizePrefs(ctx.body);
    const prefs=Object.keys(patch).length?await users.mergePrefs(me.id,patch):me.prefs||{};
    return{prefs};
  },{rate:{scope:'token',lim:LIMITS.tokenWrite}});
  // GET /api/me/history?limit&before 🔒
  router.add('GET',/^\/api\/me\/history$/,async ctx=>{
    const me=await requireUser(ctx);
    const limit=Math.min(100,Math.max(1,Number(ctx.query.get('limit'))||20));const b=ctx.query.get('before');const before=b&&/^\d+$/.test(b)?b:null;
    return{matches:await matches.history(me.id,{limit,before})};
  });
}

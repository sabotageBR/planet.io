// ── /api/me, /api/me/prefs, /api/me/history ────────────────────────────────────
// @ts-check
import {err} from './router.js';
import {LIMITS} from '../auth/ratelimit.js';
import {normalizeNick} from '../auth/nick.js';
import {toPublic} from '../repos/users.js';
import {statsToPublic} from '../repos/matches.js';
import {isCountry} from '@warspace/shared/countries.js';
import {ACTION_KEYS} from '@warspace/shared/constants.js';
const THEMES=['auto','dawn','sunset','dusk'],QUALITIES=['auto','low','medium','high'];
// Idioma da interface. A lista é a MESMA de client/src/i18n/index.js (LANG_PREFS) e vive duplicada aqui
// de propósito: o servidor não importa nada do cliente, e um enum de 4 itens não justifica uma volta
// pelo `shared`. Idioma novo = uma entrada aqui e outra lá — e o teste de prefs cobre o descompasso.
const LANGS=['auto','pt-BR','en','es'];
const bool=v=>typeof v==='boolean'?v:undefined;
/** whitelist de prefs: chave → validador (undefined = rejeita) */
export const PREFS={
  quality:v=>QUALITIES.includes(v)?v:undefined,
  showNames:bool,showMass:bool,showGrid:bool,showMinimap:bool,showFps:bool,sound:bool,music:bool,ambience:bool,joystick:bool,holdEject:bool,rightSplit:bool,reduceMotion:bool,bigText:bool,
  wheelZoom:bool,        // a roda do mouse dá zoom dentro da faixa que a massa permite
  chat:bool,voice:bool,   // chat e voz são desligáveis como todo o resto do som
  muted:bool,             // o mudo geral (tecla M): cala tudo sem apagar as escolhas acima
  eggs:bool,              // easter egg por nick (quem se chama Bruxo e comprou uma lendária pode desligar)
  volume:v=>typeof v==='number'&&v>=0&&v<=100?Math.round(v):undefined,
  musicVolume:v=>typeof v==='number'&&v>=0&&v<=100?Math.round(v):undefined,   // volume da trilha, separado do dos efeitos
  voiceVolume:v=>typeof v==='number'&&v>=0&&v<=100?Math.round(v):undefined,   // 0..100, a mesma unidade do cliente (state/app.js e audio/index.js dividem por 100); com o antigo 0..1 o slider era descartado em silêncio e nunca persistia
  theme:v=>THEMES.includes(v)?v:undefined,
  lang:v=>LANGS.includes(v)?v:undefined,
  colorblind:v=>typeof v==='boolean'?v:typeof v==='string'&&/^[a-z]{1,16}$/.test(v)?v:undefined,
  lbSize:v=>Number.isInteger(v)&&v>=3&&v<=20?v:undefined,
  lbShow:bool,lbShowPortrait:bool,   // placar aberto/recolhido; DUAS chaves porque os padrões e as telas são opostos (ver PREF_DEFAULTS)
  // teclas de dividir/ejetar: `KeyboardEvent.code` da lista compartilhada. Validar contra a lista (e não
  // com uma regex) é o que impede guardar um code que o cliente nunca vai casar — a ação ficaria sem
  // tecla e o jogador não teria como descobrir por quê.
  keySplit:v=>ACTION_KEYS.includes(v)?v:undefined,
  keyEject:v=>ACTION_KEYS.includes(v)?v:undefined,
};
export function sanitizePrefs(input){
  if(!input||typeof input!=='object')return{};
  const out={};for(const [k,v] of Object.entries(input)){const f=PREFS[k];if(!f)continue;const x=f(v);if(x!==undefined)out[k]=x;}return out;
}
export function mountMe(router,{users,skins,matches,achievements,requireUser}){
  // GET /api/me 🔒
  router.add('GET',/^\/api\/me$/,async ctx=>{
    const me=await requireUser(ctx);
    const [owned,stats,ach]=await Promise.all([skins.ownedIds(me.id),matches.statsFor(me.id),achievements.keysFor(me.id)]);
    return{user:toPublic(me),skins:owned,prefs:me.prefs||{},stats:statsToPublic(stats),achievements:ach};
  });
  // PATCH /api/me {nick?, country?} 🔒 — pelo menos um dos dois
  router.add('PATCH',/^\/api\/me$/,async ctx=>{
    const me=await requireUser(ctx);
    const temNick='nick' in (ctx.body||{}),temPais='country' in (ctx.body||{});
    if(!temNick&&!temPais)throw err(400,'bad_request','informe nick e/ou country');
    let u=me;
    // O nick é LIVRE desde a 0009: qualquer um pode ser o Messi (com a caricatura do Messi). A única
    // regra que sobrou é por SALA, e ela mora em `Room.nickTaken` — não aqui. Quem é único é o `login`,
    // que nasce no claim e não muda.
    if(temNick){
      const nick=normalizeNick(ctx.body.nick);if(!nick)throw err(400,'invalid_nick','nick deve ter de 2 a 16 caracteres');
      u=await users.setNick(me.id,nick);}
    if(temPais){
      // `null`/'' LIMPA: entrar no ranking regional é opcional, e sair dele também tem que ser.
      const c=ctx.body.country;
      if(c!=null&&c!==''&&!isCountry(String(c).toUpperCase()))throw err(400,'bad_country','country deve ser um código ISO de 2 letras');
      u=await users.setCountry(me.id,c==null||c===''?null:String(c).toUpperCase());}
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

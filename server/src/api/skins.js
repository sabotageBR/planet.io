// ── /api/skins, /api/skins/:id/buy, /api/skins/:id/equip ───────────────────────
// @ts-check
import {err} from './router.js';
import {SKINS,AD_REWARD_SKINS} from '@warspace/shared/skins.js';
import {InsufficientCoins} from '../repos/ledger.js';
import {levelFromXp} from '@warspace/shared/levels.js';
import {LIMITS} from '../auth/ratelimit.js';
const CATALOG=SKINS.map(s=>({id:s.id,name:s.name,emoji:s.emoji,rarity:s.rarity,price:s.price,color:s.color,ring:s.ring,glow:s.glow,desc:s.desc,...(s.levelReq?{levelReq:s.levelReq}:{}),...(s.unlockKey?{unlockKey:s.unlockKey}:{})}));
export function mountSkins(router,{db,users,skins,ledger,matches,requireUser,optionalUser,log}){
  // GET /api/skins (🔒 opcional)
  router.add('GET',/^\/api\/skins$/,async ctx=>{
    const me=await optionalUser(ctx);
    // O NÍVEL vem junto para a loja poder mostrar "🔒 Nv 20" sem uma segunda chamada. `u.xp` já veio do
    // RESOLVE_SQL do token — não há ida extra ao banco.
    return{skins:CATALOG,owned:me?await skins.ownedIds(me.id):[0],equipped:me?me.equipped_skin_id:0,
      level:me?levelFromXp(Number(me.xp||0)):0,
      // null = ainda não resgatou a recompensa de anúncio; senão a skin que escolheu (já vem em `owned` também).
      adReward:me?await skins.adRewardClaimed(me.id):null};
  });
  // POST /api/skins/:id/buy 🔒 → {coins,owned}
  router.add('POST',/^\/api\/skins\/(?<id>\d+)\/buy$/,async ctx=>{
    const me=await requireUser(ctx);const id=Number(ctx.params.id);
    const skin=await skins.byId(id);if(!skin)throw err(404,'skin_not_found','skin não existe');
    if(!(skin.price>0&&!skin.unlock_key))throw err(403,'not_purchasable','essa skin não está à venda');
    // Gate de NÍVEL, fora da transação de propósito: nível só SOBE, então uma leitura defasada só pode ser
    // mais rígida que a verdade — nunca mais frouxa. Dentro da transação seria uma query a mais no caminho
    // que já segura o saldo.
    if(skin.level_req>0){
      const lvl=levelFromXp(Number(me.xp||0));
      if(lvl<skin.level_req)throw err(403,'level_required',`precisa de nível ${skin.level_req} (você tem ${lvl})`,{levelReq:skin.level_req,level:lvl});}
    const out=await db.tx(async c=>{
      if(await skins.has(me.id,id,c))throw err(409,'already_owned','você já tem essa skin');
      let r;try{r=await ledger.apply(c,{userId:me.id,delta:-skin.price,reason:'skin_purchase',refType:'skin',refId:id});}
      catch(e){if(e instanceof InsufficientCoins)throw err(402,'insufficient_coins',`faltam moedas: custa ${skin.price}`);throw e;}
      await skins.grant(c,{userId:me.id,skinId:id,source:'purchase',ledgerId:r.ledgerId});
      return{coins:r.coins,owned:await skins.ownedIds(me.id,c)};
    });
    log.info(`compra: #${me.id} skin ${id} por ${skin.price}`);
    return out;
  });
  // POST /api/skins/reward-ad {skinId} 🔒 → {owned} — 1 recompensa por CONTA, escolhendo entre as
  // mascote. O SDK do portal (rewardedBreak) já decidiu do lado do cliente que o anúncio foi assistido
  // até o fim; aqui só cabe garantir que ninguém resgata duas vezes — é a única defesa real, porque o
  // servidor nunca confirma criptograficamente que o vídeo rodou.
  router.add('POST',/^\/api\/skins\/reward-ad$/,async ctx=>{
    const me=await requireUser(ctx);const id=Number(ctx.body&&ctx.body.skinId);
    if(!AD_REWARD_SKINS.includes(id))throw err(400,'bad_request','skin inválida para esta recompensa');
    const out=await db.tx(async c=>{
      if(await skins.has(me.id,id,c))throw err(409,'already_owned','você já tem essa skin');
      if(!(await skins.claimAdReward(c,{userId:me.id,skinId:id})))throw err(409,'already_claimed','você já resgatou sua recompensa de anúncio');
      await skins.grant(c,{userId:me.id,skinId:id,source:'grant'});
      return{owned:await skins.ownedIds(me.id,c)};
    });
    log.info(`recompensa de anúncio: #${me.id} skin ${id}`);
    return out;
  },{rate:{scope:'token',lim:LIMITS.tokenWrite}});
  // POST /api/skins/:id/equip 🔒 → {equippedSkin}
  router.add('POST',/^\/api\/skins\/(?<id>\d+)\/equip$/,async ctx=>{
    const me=await requireUser(ctx);const id=Number(ctx.params.id);
    if(!(await skins.has(me.id,id)))throw err(403,'not_owned','você não tem essa skin');
    return{equippedSkin:await users.setEquipped(me.id,id)};
  });
}

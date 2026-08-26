// ── /api/skins, /api/skins/:id/buy, /api/skins/:id/equip ───────────────────────
// @ts-check
import {err} from './router.js';
import {SKINS} from '@planet/shared/skins.js';
import {InsufficientCoins} from '../repos/ledger.js';
const CATALOG=SKINS.map(s=>({id:s.id,name:s.name,emoji:s.emoji,rarity:s.rarity,price:s.price,color:s.color,ring:s.ring,glow:s.glow,desc:s.desc,...(s.unlockKey?{unlockKey:s.unlockKey}:{})}));
export function mountSkins(router,{db,users,skins,ledger,requireUser,optionalUser,log}){
  // GET /api/skins (🔒 opcional)
  router.add('GET',/^\/api\/skins$/,async ctx=>{
    const me=await optionalUser(ctx);
    return{skins:CATALOG,owned:me?await skins.ownedIds(me.id):[0],equipped:me?me.equipped_skin_id:0};
  });
  // POST /api/skins/:id/buy 🔒 → {coins,owned}
  router.add('POST',/^\/api\/skins\/(?<id>\d+)\/buy$/,async ctx=>{
    const me=await requireUser(ctx);const id=Number(ctx.params.id);
    const skin=await skins.byId(id);if(!skin)throw err(404,'skin_not_found','skin não existe');
    if(!(skin.price>0&&!skin.unlock_key))throw err(403,'not_purchasable','essa skin não está à venda');
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
  // POST /api/skins/:id/equip 🔒 → {equippedSkin}
  router.add('POST',/^\/api\/skins\/(?<id>\d+)\/equip$/,async ctx=>{
    const me=await requireUser(ctx);const id=Number(ctx.params.id);
    if(!(await skins.has(me.id,id)))throw err(403,'not_owned','você não tem essa skin');
    return{equippedSkin:await users.setEquipped(me.id,id)};
  });
}

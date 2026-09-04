// ── REPO skins / user_skins ────────────────────────────────────────────────────
// @ts-check
import {STARTER_SKINS} from '@warspace/shared/skins.js';
/** A conta nova sorteia uma das 10 skins iniciais (grátis + as 9 comuns) para nascer equipada — não é
 *  física de sala (sem rng determinístico de propósito), então `Math.random()` basta, no mesmo padrão
 *  já usado por `randomGuestNick` (server/src/auth/nick.js). Injetável em `createApi` (`pickStarterSkin`)
 *  para o teste poder fixar o resultado sem depender de sorte. */
export const randomStarterSkin=()=>STARTER_SKINS[Math.floor(Math.random()*STARTER_SKINS.length)];
export function createSkins(db){
  const byId=(id,c=db)=>c.query(`SELECT * FROM skins WHERE id=$1 AND active`,[id]).then(r=>r.rows[0]||null);
  const ownedIds=(userId,c=db)=>c.query(`SELECT skin_id FROM user_skins WHERE user_id=$1 ORDER BY skin_id`,[userId]).then(r=>r.rows.map(x=>x.skin_id));
  const has=(userId,skinId,c=db)=>c.query(`SELECT 1 FROM user_skins WHERE user_id=$1 AND skin_id=$2`,[userId,skinId]).then(r=>r.rows.length>0);
  /** concede; devolve true se era nova */
  const grant=(c,{userId,skinId,source,ledgerId=null})=>c.query(`INSERT INTO user_skins(user_id,skin_id,source,ledger_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING skin_id`,[userId,skinId,source,ledgerId]).then(r=>r.rows.length>0);
  /** concede várias (conquistas); devolve ids realmente novos */
  async function grantMany(c,userId,skinIds,source){const out=[];for(const id of skinIds)if(await grant(c,{userId,skinId:id,source}))out.push(id);return out;}
  /** ids das skins mascote cujo anúncio a conta já assistiu (não implica posse — só destrava a compra) */
  const adWatchedIds=(userId,c=db)=>c.query(`SELECT skin_id FROM user_ad_watched WHERE user_id=$1 ORDER BY skin_id`,[userId]).then(r=>r.rows.map(x=>x.skin_id));
  const hasWatchedAd=(userId,skinId,c=db)=>c.query(`SELECT 1 FROM user_ad_watched WHERE user_id=$1 AND skin_id=$2`,[userId,skinId]).then(r=>r.rows.length>0);
  /** marca o anúncio DAQUELA skin como assistido; idempotente (assistir de novo não é erro) */
  const markAdWatched=(c,{userId,skinId})=>c.query(`INSERT INTO user_ad_watched(user_id,skin_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING skin_id`,[userId,skinId]).then(r=>r.rows.length>0);
  return{byId,ownedIds,has,grant,grantMany,adWatchedIds,hasWatchedAd,markAdWatched};
}

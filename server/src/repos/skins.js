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
  /** A skin é da conta desde o NASCIMENTO (`source='default'`)? É o que separa "nunca escolhi" de "comprei esta". */
  const isDefault=(userId,skinId,c=db)=>c.query(`SELECT 1 FROM user_skins WHERE user_id=$1 AND skin_id=$2 AND source='default'`,[userId,skinId]).then(r=>r.rowCount>0);
  async function grantMany(c,userId,skinIds,source){const out=[];for(const id of skinIds)if(await grant(c,{userId,skinId:id,source}))out.push(id);return out;}
  /** ids das skins mascote cujo anúncio a conta já assistiu (não implica posse — só destrava a compra) */
  const adWatchedIds=(userId,c=db)=>c.query(`SELECT skin_id FROM user_ad_watched WHERE user_id=$1 ORDER BY skin_id`,[userId]).then(r=>r.rows.map(x=>x.skin_id));
  const hasWatchedAd=(userId,skinId,c=db)=>c.query(`SELECT 1 FROM user_ad_watched WHERE user_id=$1 AND skin_id=$2`,[userId,skinId]).then(r=>r.rows.length>0);
  /** marca o anúncio DAQUELA skin como assistido; idempotente (assistir de novo não é erro) */
  const markAdWatched=(c,{userId,skinId})=>c.query(`INSERT INTO user_ad_watched(user_id,skin_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING skin_id`,[userId,skinId]).then(r=>r.rows.length>0);
  // ── A ARTE (bytea), gêmea de repos/avatars.js ──────────────────────────────────────────────────────
  // Duas leituras, e a separação NÃO é zelo: a pública exige `active` (é ela que tira do ar uma skin
  // desativada), e o painel PRECISA ver a arte de uma skin que ainda está desligada — porque o fluxo
  // prescrito é "sobe a arte, confere, ATIVA". Com uma rota só, o admin nunca veria o que acabou de subir.
  const artOf=(id,c=db)=>c.query(
    `SELECT a.mime,a.bytes,a.hash FROM skin_art a JOIN skins s ON s.id=a.skin_id
      WHERE a.skin_id=$1 AND a.status='ok' AND s.active`,[id]).then(r=>r.rows[0]||null);
  const artAdmin=(id,c=db)=>c.query(
    `SELECT mime,bytes,hash,status FROM skin_art WHERE skin_id=$1`,[id]).then(r=>r.rows[0]||null);
  /** Grava a arte e o PONTEIRO na mesma transação: `skins.art_hash` é o que o catálogo entrega ao cliente. */
  const putArt=async(c,{skinId,mime,bytes,w,h,hash})=>{
    await c.query(`INSERT INTO skin_art(skin_id,mime,bytes,w,h,size,hash) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (skin_id) DO UPDATE SET mime=EXCLUDED.mime,bytes=EXCLUDED.bytes,w=EXCLUDED.w,h=EXCLUDED.h,
        size=EXCLUDED.size,hash=EXCLUDED.hash,status='ok',updated_at=now()`,[skinId,mime,bytes,w,h,bytes.length,hash]);
    await c.query(`UPDATE skins SET art_hash=$2 WHERE id=$1`,[skinId,hash]);
    return hash;};
  /** Tirar do ar é UPDATE, nunca DELETE: a skin pode estar em `user_skins` de muita gente. */
  const setArtStatus=(id,status,c=db)=>c.query(
    `UPDATE skin_art SET status=$2,updated_at=now() WHERE skin_id=$1`,[id,status]);
  /**
   * O CATÁLOGO QUE O CLIENTE PRECISA SABER ALÉM DO BUNDLE: as skins de BANCO (que ele não conhece) e o
   * `art_hash` de TODAS (que é o que faz uma skin de código ser desenhada com imagem — o caminho das 35
   * caricaturas). `v` é a versão do conjunto: entra na chave da textura, e é o que faz uma troca de arte
   * ou de cor no painel aparecer sem F5.
   */
  const catalogo=(c=db)=>c.query(
    `SELECT id,name,rarity,price,unlock_key,level_req,color,accent,emoji,descr,art_hash,source
       FROM skins WHERE active AND (source='db' OR art_hash IS NOT NULL) ORDER BY id`).then(r=>r.rows);
  /** A lista do PAINEL: tudo, inclusive o que está desativado — é lá que se liga de novo. */
  const adminList=(c=db)=>c.query(
    `SELECT s.id,s.name,s.rarity,s.price,s.unlock_key,s.level_req,s.color,s.accent,s.emoji,s.descr,
            s.art_hash,s.source,s.active,a.w,a.h,a.size,a.status AS art_status
       FROM skins s LEFT JOIN skin_art a ON a.skin_id=s.id ORDER BY s.id`).then(r=>r.rows);
  const upsertDb=(c,s)=>c.query(
    `INSERT INTO skins(id,name,rarity,price,level_req,color,accent,emoji,descr,source,active)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'db',$10)
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,rarity=EXCLUDED.rarity,price=EXCLUDED.price,
       level_req=EXCLUDED.level_req,color=EXCLUDED.color,accent=EXCLUDED.accent,emoji=EXCLUDED.emoji,
       descr=EXCLUDED.descr,active=EXCLUDED.active
     WHERE skins.source='db' RETURNING *`,
    [s.id,s.name,s.rarity,s.price|0,s.levelReq|0,s.color,s.accent,s.emoji,s.desc,s.active!==false]).then(r=>r.rows[0]||null);
  /** Ativar/desativar. ⚠️ Só `source='db'`: uma skin de CÓDIGO é semeada a cada boot, então o painel
   *  diria "salvo" e o restart seguinte a religaria — um botão que se desfaz sozinho. */
  const setActive=(c,id,on)=>c.query(
    `UPDATE skins SET active=$2 WHERE id=$1 AND source='db' RETURNING id`,[id,!!on]).then(r=>r.rowCount);
  return{byId,ownedIds,has,isDefault,grant,grantMany,adWatchedIds,hasWatchedAd,markAdWatched,
    artOf,artAdmin,putArt,setArtStatus,catalogo,adminList,upsertDb,setActive};
}

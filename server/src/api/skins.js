// ── /api/skins, /api/skins/:id/buy, /api/skins/:id/equip ───────────────────────
// @ts-check
import {err,RAW} from './router.js';
import {SKINS,AD_REWARD_SKINS,AD_GIFT_SKINS} from '@warspace/shared/skins.js';
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
    return{skins:CATALOG,
      // ── O QUE O BUNDLE NÃO SABE ────────────────────────────────────────────────────────────────────
      // `db` traz as skins criadas no /admin (que esta build não conhece) e o `art_hash` de TODAS as que
      // têm arte — inclusive as de CÓDIGO, e é por aí que as 35 caricaturas saem do pacote: o id continua
      // o mesmo, o que muda é de onde a imagem vem.
      // ⚠️ MESCLA, não substitui: o bundle continua sendo a verdade de cor/emoji/desc das 128 de código.
      // Servir o catálogo inteiro do banco criaria uma segunda verdade, e um pod com bundle velho passaria
      // a servir um catálogo diferente do que a build desenha.
      // ⚠️ Falha de banco NÃO derruba a loja: sem `db` o cliente fica com o catálogo do bundle, que é
      // exatamente o comportamento de hoje. É o mesmo espírito do modo `unsaved`.
      db:await skins.catalogo().catch(()=>[]),
      owned:me?await skins.ownedIds(me.id):[0],equipped:me?me.equipped_skin_id:0,
      level:me?levelFromXp(Number(me.xp||0)):0,
      adWatched:me?await skins.adWatchedIds(me.id):[]};
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
    // Mascote pede os DOIS: o anúncio destrava a compra, mas quem compra ainda paga o preço normal
    // (abaixo). Mesmo espírito do gate de nível — fora da transação, é leitura pura.
    if(AD_REWARD_SKINS.includes(id)&&!(await skins.hasWatchedAd(me.id,id)))
      throw err(403,'ad_required','assista o anúncio antes de comprar essa skin');
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
  // POST /api/skins/:id/watch-ad 🔒 → {adWatched} — marca o anúncio DAQUELA skin como assistido; não
  // concede posse nenhuma (quem concede é /buy, que agora exige isto para as mascote). O SDK do portal
  // (rewardedBreak) já decidiu do lado do cliente que o anúncio foi assistido até o fim; aqui só cabe
  // registrar — é idempotente (assistir de novo não é erro), porque o servidor nunca confirma
  // criptograficamente que o vídeo rodou, então não há o que punir numa segunda chamada.
  router.add('POST',/^\/api\/skins\/(?<id>\d+)\/watch-ad$/,async ctx=>{
    const me=await requireUser(ctx);const id=Number(ctx.params.id);
    if(!AD_REWARD_SKINS.includes(id))throw err(400,'bad_request','skin inválida para esta recompensa');
    await skins.markAdWatched(db,{userId:me.id,skinId:id});
    log.info(`anúncio assistido: #${me.id} skin ${id}`);
    return{adWatched:await skins.adWatchedIds(me.id)};
  },{rate:{scope:'token',lim:LIMITS.tokenWrite}});
  // GET /api/skins/:id/art → os BYTES da arte. Gêmea de GET /api/avatar/:id, e de propósito: o par
  // ETag + `immutable` de um ano é o que cumpre o "carregado somente 1 vez" do pedido melhor do que base64
  // no JSON cumpriria — com base64, TODO jogador baixaria a arte de TODAS as skins em todo boot, inclusive
  // as que nunca vai ver, e nada disso seria cacheável por item.
  // ⚠️ `immutable` é seguro porque a URL do cliente carrega o HASH (`?v=…`): arte nova = URL nova.
  // ⚠️ `nosniff` + CSP `default-src 'none'`: é ESTA resposta, e não o validador de upload, que fecha o
  // buraco do arquivo disfarçado. O mesmo par do avatar, pelo mesmo motivo escrito lá.
  // ⚠️ `rate` PRÓPRIO: sem ele a rota cai no balde compartilhado de 60/min por IP (a chave `ip:*:<ip>` do
  // router), que ela divide com /api/config, /api/rooms e /api/ranking — e `warmFaces` dispara um GET por
  // skin DISTINTA da sala, até 50 num Battle Royale. Numa escola ou CGNAT isso derrubaria o boot de todo
  // mundo. São bytes públicos e `immutable`: o balde certo para eles é o do nginx.
  router.add('GET',/^\/api\/skins\/(?<id>\d+)\/art$/,async ctx=>{
    const row=await skins.artOf(Number(ctx.params.id));
    if(!row)throw err(404,'not_found','sem arte');
    const etag='"'+row.hash+'"';
    if(ctx.req.headers['if-none-match']===etag){ctx.res.writeHead(304,{ETag:etag,'Cache-Control':'public, max-age=31536000, immutable'});ctx.res.end();return RAW;}
    ctx.res.writeHead(200,{'Content-Type':row.mime,'Content-Length':row.bytes.length,ETag:etag,
      'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'",'Content-Disposition':'inline'});
    ctx.res.end(row.bytes);return RAW;
  },{rate:{scope:'ip',lim:{n:240,win:60e3}}});
  // POST /api/skins/:id/ad-gift 🔒 → {skins,equippedSkin} — o anúncio da TELA DE MORTE DÁ a skin.
  //
  // ⚠️ É UMA REGRA DIFERENTE DA DAS MASCOTES, de propósito, e as duas convivem porque as POOLS são
  // disjuntas: `AD_REWARD_SKINS` (as três mascote) segue o que a migração 0012 estabeleceu ao derrubar a
  // 0011 — o anúncio DESTRAVA a compra e as moedas continuam obrigatórias; `AD_GIFT_SKINS` (raras de
  // 600-900) é dado. Misturar as duas nas MESMAS skins faria a Loja mentir, e foi por isso que a 0011 caiu.
  // ⚠️ `source:'grant'` — o valor que o CHECK de `user_skins` sempre aceitou e que ninguém emitia. Ele é o
  // que separa, no banco, "ganhou" de "comprou" e de "conquistou", que é o que uma auditoria de economia
  // precisa distinguir depois.
  // ⚠️ IDEMPOTENTE pelo mesmo motivo da rota acima: o servidor não confirma que o vídeo rodou, então não
  // há o que punir numa segunda chamada. `grantMany` devolve só o que inseriu de fato, e `user_skins` tem
  // PK composta — a segunda vez não dá nada e não é erro.
  // ⚠️ E EQUIPA: foi o pedido. A skin da VIDA é resolvida no join (persist/hooks.js), e `Room.respawn`
  // repassa a da vida anterior — então ela aparece na PRÓXIMA vida, não nesta. Quem diz isso ao jogador é
  // o texto da tela (LB.prizeEquipNote), porque um botão que parece não fazer nada é pior que botão nenhum.
  router.add('POST',/^\/api\/skins\/(?<id>\d+)\/ad-gift$/,async ctx=>{
    const me=await requireUser(ctx);const id=Number(ctx.params.id);
    if(!AD_GIFT_SKINS.includes(id))throw err(400,'bad_request','skin inválida para esta recompensa');
    const skin=await skins.byId(id);if(!skin)throw err(404,'not_found','skin não encontrada');
    const equipar=ctx.body&&ctx.body.equip!==false;
    await db.tx(async c=>{
      await skins.grantMany(c,me.id,[id],'grant');
      if(equipar)await users.setEquipped(me.id,id,c);});
    log.info(`anúncio recompensado: #${me.id} ganhou a skin ${id}${equipar?' (equipada)':''}`);
    return{skins:await skins.ownedIds(me.id),equippedSkin:equipar?id:me.equipped_skin_id};
  },{rate:{scope:'token',lim:LIMITS.tokenWrite}});
  // POST /api/skins/:id/equip 🔒 → {equippedSkin}
  router.add('POST',/^\/api\/skins\/(?<id>\d+)\/equip$/,async ctx=>{
    const me=await requireUser(ctx);const id=Number(ctx.params.id);
    if(!(await skins.has(me.id,id)))throw err(403,'not_owned','você não tem essa skin');
    return{equippedSkin:await users.setEquipped(me.id,id)};
  });
}

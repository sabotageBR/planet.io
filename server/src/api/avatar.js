// ── /api/me/avatar (POST bytes crus, DELETE) e /api/avatar/:id (público) ───────
// A skin "Retrato" (id AVATAR_SKIN) põe a foto do jogador dentro do planeta. Comprar a skin destrava a
// CAPACIDADE; a foto é um recurso da conta, e mora no Postgres porque é o único armazenamento durável do
// cluster (StatefulSet sem PVC, sem storage dinâmico).
// @ts-check
import {createHash} from 'node:crypto';
import {err,RAW} from './router.js';
import {LIMITS} from '../auth/ratelimit.js';
import {AVATAR} from '@planet/shared/constants.js';
import {probeImage} from './imagemeta.js';

export function mountAvatar(router,{db,users,avatars,requireUser,config,log}){
  // POST /api/me/avatar 🔒 — corpo CRU (image/webp ou image/png), teto próprio
  router.add('POST',/^\/api\/me\/avatar$/,async ctx=>{
    const me=await requireUser(ctx);
    const buf=ctx.raw;
    if(!buf||!buf.length)throw err(400,'empty','nenhuma imagem recebida');
    if(buf.length>AVATAR.MAX_BYTES)throw err(413,'too_big',`a imagem tem que caber em ${AVATAR.MAX_BYTES} bytes`);
    // O tipo sai do CONTEÚDO, não do cabeçalho que o cliente mandou: é o cliente que estaria mentindo.
    const meta=probeImage(buf);
    if(!meta)throw err(415,'bad_image','só PNG ou WebP');
    if(ctx.contentType&&ctx.contentType!==meta.mime)throw err(415,'bad_image','o tipo declarado não bate com o arquivo');
    if(meta.w!==meta.h)throw err(400,'not_square','a imagem tem que ser quadrada');
    if(meta.w<AVATAR.MIN||meta.w>AVATAR.SIZE)throw err(400,'bad_size',`o lado tem que ficar entre ${AVATAR.MIN} e ${AVATAR.SIZE} px`);
    const hash=createHash('sha256').update(buf).digest('hex').slice(0,32);
    await db.tx(async c=>{
      await avatars.put(c,{userId:me.id,mime:meta.mime,bytes:buf,w:meta.w,h:meta.h,hash});
      await users.setAvatarHash(me.id,hash,c);});
    log.info(`avatar: #${me.id} subiu ${meta.mime} ${meta.w}px (${buf.length} B)`);
    return{avatar:hash,w:meta.w,h:meta.h,bytes:buf.length};
  },{rate:{scope:'token',lim:LIMITS.tokenWrite},raw:{max:AVATAR.MAX_BYTES+1024}});

  // DELETE /api/me/avatar 🔒
  router.add('DELETE',/^\/api\/me\/avatar$/,async ctx=>{
    const me=await requireUser(ctx);
    await db.tx(async c=>{await avatars.remove(c,me.id);await users.setAvatarHash(me.id,null,c);});
    return[204];
  },{rate:{scope:'token',lim:LIMITS.tokenWrite}});

  // GET /api/avatar/:userId — público (a foto aparece para a sala inteira de qualquer jeito)
  router.add('GET',/^\/api\/avatar\/(?<id>\d+)$/,async ctx=>{
    const row=await avatars.bytesOf(Number(ctx.params.id));
    if(!row)throw err(404,'not_found','sem avatar');
    const etag='"'+row.hash+'"';
    if(ctx.req.headers['if-none-match']===etag){ctx.res.writeHead(304,{ETag:etag,'Cache-Control':'public, max-age=31536000, immutable'});ctx.res.end();return RAW;}
    // `immutable` é seguro porque a URL do cliente carrega o hash (?v=…): foto nova = URL nova.
    // nosniff + CSP: mesmo que alguém consiga gravar um políglota que passe pelo probeImage, ele não
    // executa em navegador nenhum. É esta resposta, e não o validador, que fecha o buraco.
    ctx.res.writeHead(200,{'Content-Type':row.mime,'Content-Length':row.bytes.length,ETag:etag,
      'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'",'Content-Disposition':'inline'});
    ctx.res.end(row.bytes);return RAW;
  });

  // DELETE /api/avatar/:userId — moderação, com ADMIN_TOKEN. Sem isto, tirar uma foto imprópria do ar
  // dependeria de SQL na mão (a mesma postura já assumida para "esqueci a senha").
  router.add('DELETE',/^\/api\/avatar\/(?<id>\d+)$/,async ctx=>{
    const adm=config.adminToken;
    if(!adm)throw err(503,'admin_disabled','ADMIN_TOKEN não configurado');
    if(ctx.token!==adm)throw err(403,'forbidden','token administrativo inválido');
    const id=Number(ctx.params.id);
    await avatars.setStatus(id,'hidden');
    await users.setAvatarHash(id,null);
    log.warn(`avatar: #${id} escondido por moderação`);
    return[204];
  });
}

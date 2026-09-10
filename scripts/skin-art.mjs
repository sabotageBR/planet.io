// ── SEMEAR A ARTE DAS SKINS NO BANCO ──────────────────────────────────────────
// Sobe para `skin_art` a imagem de cada skin do catálogo que tenha arquivo em `client/public/faces/`, e
// carimba o ponteiro (`skins.art_hash`). Rodado UMA vez por ambiente; depois disso a arte é gerida pelo
// /admin, sem deploy.
//
// POR QUE ISTO EXISTE: as 35 caricaturas (ids 84-118) são de pessoas reais, onze delas políticos, e o
// pacote de portal as cortava por duas metades — `faceFile()` com `!PORTAL` e a poda do `portal-pack.mjs`
// — mas elas continuavam no repositório e na build do site. Indo para o banco elas saem da build
// inteiramente, e o nome do arquivo (`07_putin.webp`), que entrega a identidade sem ninguém abrir a
// imagem, deixa de existir no zip.
//
// ⚠️ NÃO TROCA ID NENHUM. `skins.art_hash` numa skin de CÓDIGO é um OVERRIDE de arte: o id continua o
// mesmo, `user_skins` fica intacta (todo mundo que já tem a skin continua tendo), os `unlockKey` valem, e
// um zip de portal congelado continua desenhando o que ele já desenhava.
// ⚠️ Idempotente: rodar de novo regrava os mesmos bytes e o mesmo hash. Se o hash não mudou, a URL do
// cliente não muda e o cache de um ano continua valendo.
//
// uso:  DATABASE_URL=... node scripts/skin-art.mjs [--dry]
import {readFile,readdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {SKINS} from "@warspace/shared/skins.js";
import {probeImage} from "../server/src/api/imagemeta.js";
import {createDb} from "../server/src/db/pool.js";

const RAIZ=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const DIR=path.join(RAIZ,"client","public","faces");
const seco=process.argv.includes("--dry");
const url=process.env.DATABASE_URL;
if(!url){console.error("faltou DATABASE_URL");process.exit(1);}
// ⚠️ A MESMA GUARDA de server/test/persist.test.js, e pelo mesmo motivo: o `.env` da raiz aponta para
// PRODUÇÃO, e um `node scripts/…` sem variável explícita escreveria lá.
if(!/@(127\.0\.0\.1|localhost)[:/]/.test(url)&&process.env.ALLOW_REMOTE_DB!=="1"){
  console.error("DATABASE_URL não é local. Se é de propósito, passe ALLOW_REMOTE_DB=1.");process.exit(1);}

const arquivos=await readdir(DIR).catch(()=>[]);
const porFace=new Map(arquivos.filter(f=>f.endsWith(".webp")).map(f=>[f.replace(/\.webp$/,""),f]));
const alvos=SKINS.filter(s=>s.face&&porFace.has(s.face));
console.log(`${alvos.length} skin(s) com arquivo de arte em client/public/faces/`);
if(!alvos.length)process.exit(0);

// `createDb` pede a forma de `config` do servidor; um log mínimo basta para um script de manutenção.
const db=createDb({databaseUrl:url,dbPoolMax:2,shard:"art",tz:"America/Sao_Paulo"},
  {info:()=>{},warn:(...a)=>console.warn(...a),error:(...a)=>console.error(...a)});
let n=0,pulou=0;
try{
  for(const s of alvos){
    const buf=await readFile(path.join(DIR,porFace.get(s.face)));
    const meta=probeImage(buf);
    if(!meta){console.warn(`  ! ${s.id} ${s.name}: não é PNG nem WebP — pulando`);pulou++;continue;}
    if(meta.w!==meta.h){console.warn(`  ! ${s.id} ${s.name}: ${meta.w}x${meta.h} não é quadrada — pulando`);pulou++;continue;}
    const hash=createHash("sha256").update(buf).digest("hex").slice(0,32);
    if(seco){console.log(`  · ${s.id} ${s.name} ${meta.w}px ${buf.length}B ${hash}`);n++;continue;}
    await db.tx(async c=>{
      await c.query(`INSERT INTO skin_art(skin_id,mime,bytes,w,h,size,hash) VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (skin_id) DO UPDATE SET mime=EXCLUDED.mime,bytes=EXCLUDED.bytes,w=EXCLUDED.w,h=EXCLUDED.h,
          size=EXCLUDED.size,hash=EXCLUDED.hash,status='ok',updated_at=now()`,
        [s.id,meta.mime,buf,meta.w,meta.h,buf.length,hash]);
      await c.query(`UPDATE skins SET art_hash=$2 WHERE id=$1`,[s.id,hash]);});
    console.log(`  ✓ ${s.id} ${s.name} (${meta.w}px, ${buf.length} B)`);n++;}
  console.log(`${seco?"(seco) ":""}${n} arte(s) ${seco?"prontas":"no banco"}${pulou?`, ${pulou} pulada(s)`:""}`);
}finally{await db.close().catch(()=>{});}

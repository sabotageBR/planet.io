// ── MIGRAÇÕES (advisory lock 727001, SQL numerado em transação, seed de skins) ─
// @ts-check
import {readdir,readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {SKINS} from '@warspace/shared/skins.js';
const LOCK_ID=727001;
const DIR=path.join(path.dirname(fileURLToPath(import.meta.url)),'migrations');
/** lista {version,name,file} ordenada pelo prefixo numérico */
async function listMigrations(){
  const files=(await readdir(DIR)).filter(f=>/^\d+_.+\.sql$/.test(f)).sort();
  return files.map(f=>{const m=/^(\d+)_(.+)\.sql$/.exec(f);return{version:Number(m[1]),name:m[2],file:path.join(DIR,f)};});
}
/**
 * Semeia/atualiza a tabela skins a partir do catálogo compartilhado; skins fora do catálogo ficam active=false.
 * ⚠️ OPERACIONAL: essa última linha é uma faca. Um pod com o `shared/skins.js` ANTIGO DESATIVA as skins
 * novas, e `skins.byId` filtra por `active` — a compra passa a dar 404. Com 3 shards e MIGRATE_ON_START=1,
 * um rollout parcial fica ligando e desligando as skins novas a cada restart. Os três shards têm que estar
 * na MESMA imagem antes de qualquer skin nova ficar comprável.
 */
export async function seedSkins(c){
  const vals=[],params=[];
  const N=10;
  SKINS.forEach((s,i)=>{const b=i*N;vals.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10})`);
    params.push(s.id,s.name,s.rarity,s.price,s.unlockKey||null,s.levelReq|0,s.color||null,s.accent||null,s.emoji||null,s.desc||null);});
  // ⚠️ `art_hash` NÃO entra no upsert, de propósito: ele é escrito pela rota de arte do /admin, e um seed
  // que o sobrescrevesse apagaria a arte de toda skin a cada boot de pod — inclusive das caricaturas, que
  // é justamente o que saiu da build para viver aqui.
  await c.query(`INSERT INTO skins(id,name,rarity,price,unlock_key,level_req,color,accent,emoji,descr) VALUES ${vals.join(',')}
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,rarity=EXCLUDED.rarity,price=EXCLUDED.price,
      unlock_key=EXCLUDED.unlock_key,level_req=EXCLUDED.level_req,color=EXCLUDED.color,accent=EXCLUDED.accent,
      emoji=EXCLUDED.emoji,descr=EXCLUDED.descr,source='code',active=true`,params);
  // ⚠️ `AND source='code'` É A LINHA QUE TORNA O /admin POSSÍVEL. Sem ela, o primeiro pod a bootar
  // DESATIVARIA toda skin criada pelo painel — ela não está no catálogo do bundle, por definição —, e a
  // compra passaria a dar 404 sem uma linha de log. A faca de sempre continua valendo para as de CÓDIGO:
  // um pod com `shared/skins.js` antigo desativa as skins de código novas, então os shards têm que subir
  // na MESMA imagem antes de uma skin de código nova ficar comprável.
  await c.query(`UPDATE skins SET active=false WHERE id<>ALL($1::int[]) AND active AND source='code'`,[SKINS.map(s=>s.id)]);
}
/**
 * Aplica migrações pendentes (serializado entre pods pelo advisory lock) e semeia skins.
 * @returns {Promise<{applied:string[]}>}
 */
export async function migrate(db,log){
  return db.withClient(async c=>{
    await c.query('SELECT pg_advisory_lock($1)',[LOCK_ID]);
    const applied=[];
    try{
      await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations(version int PRIMARY KEY,name text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`);
      const done=new Set((await c.query('SELECT version FROM schema_migrations')).rows.map(r=>Number(r.version)));
      for(const m of await listMigrations()){
        if(done.has(m.version))continue;
        const sql=await readFile(m.file,'utf8');
        await c.query('BEGIN');
        try{await c.query(sql);await c.query('INSERT INTO schema_migrations(version,name) VALUES($1,$2)',[m.version,m.name]);await c.query('COMMIT');}
        catch(e){await c.query('ROLLBACK').catch(()=>{});log.error(`migração ${m.version}_${m.name} falhou:`,e.message);throw e;}
        applied.push(`${m.version}_${m.name}`);log.info(`migração aplicada: ${m.version}_${m.name}`);
      }
      await c.query('BEGIN');try{await seedSkins(c);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
      log.info(`schema ok (${applied.length} migração(ões) nova(s), ${SKINS.length} skins semeadas)`);
    }finally{await c.query('SELECT pg_advisory_unlock($1)',[LOCK_ID]).catch(()=>{});}
    return{applied};
  });
}
// ── CLI: node server/src/db/migrate.js ──────────────────────────────────────
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [{config},{log},{createDb}]=await Promise.all([import('../config.js'),import('../log.js'),import('./pool.js')]);
  const db=createDb(config,log);
  try{await migrate(db,log);}catch(e){log.error('migrate:',e.message);process.exitCode=1;}
  finally{await db.close();}
}

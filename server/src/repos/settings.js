// ── REPO admin_settings: os parâmetros de jogo que o painel altera ────────────
// O VALOR AQUI É A VERDADE. Os três shards leem esta tabela no boot e a cada 30 s; o "push" entre irmãos
// (/internal/admin/tunables) existe só para a mudança valer na hora, não para carregar o valor — assim um
// pod que estava reiniciando durante o push converge sozinho, e a porta interna não tem autoridade nenhuma.
// A CHAVE é validada contra a whitelist de shared/src/tunables.js ANTES de chegar aqui: isto não é um
// `eval` com persistência.
// @ts-check
export function createSettings(db){
  const all=()=>db.query(`SELECT key,value,updated_at,updated_by FROM admin_settings`).then(r=>r.rows);
  const set=(key,value,byUserId=null,c=db)=>c.query(
    `INSERT INTO admin_settings(key,value,updated_by) VALUES($1,$2::jsonb,$3)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now(),updated_by=EXCLUDED.updated_by`,
    [key,JSON.stringify(value),byUserId]);
  const remove=(key,c=db)=>c.query(`DELETE FROM admin_settings WHERE key=$1`,[key]);
  return{all,set,remove};
}

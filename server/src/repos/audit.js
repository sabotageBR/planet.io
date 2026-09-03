// ── REPO admin_audit: toda ação de administrador deixa rastro ────────────────
// `target` é texto porque às vezes é um id de usuário e às vezes um código de sala; `detail` é jsonb
// porque cada ação tem os campos dela — normalizar isso seria inventar dez colunas nulas.
// Escrita FIRE-AND-FORGET nas rotas que não têm transação: um log que falha não pode derrubar a ação que
// o admin acabou de fazer. Onde há transação (moedas, ban), entra DENTRO dela.
// @ts-check

// Lista branca de ordenação, no molde de `repos/users.js` (que copia `repos/ranking.js`). `detail` é
// jsonb e fica de FORA: ordenar jsonb ordena pela representação interna, que não é nada que um humano
// tenha pedido. `ip` idem — não é dado que se compare.
export const ORDEM_AUDIT=new Map([
  ['id',    {expr:'a.id'}],
  ['at',    {expr:'a.created_at'}],
  ['admin', {expr:'lower(u.nick)',nulls:true}],
  ['action',{expr:'a.action'}],
  ['target',{expr:'a.target',nulls:true}],
]);
const DIR=new Map([['asc','ASC'],['desc','DESC']]);
export function orderAudit(by,dir){
  const o=ORDEM_AUDIT.get(by)||ORDEM_AUDIT.get('id'),d=DIR.get(dir)||'DESC';
  return `${o.expr} ${d}${o.nulls?' NULLS LAST':''}${by==='id'?'':', a.id DESC'}`;}

export function createAudit(db,log=null){
  const write=({adminId,action,target=null,detail=null,ip=null},c=db)=>
    c.query(`INSERT INTO admin_audit(admin_id,action,target,detail,ip) VALUES($1,$2,$3,$4::jsonb,$5)`,
      [adminId,String(action).slice(0,40),target==null?null:String(target).slice(0,64),JSON.stringify(detail||{}),ip||null]);
  const log_=(o,c=db)=>{const p=write(o,c);if(c===db)p.catch(e=>log&&log.debug('audit:',e.message));return p;};
  /** `more` sai de pedir `limit+1` e devolver `limit` — ver o comentário em `users.search`. */
  async function list({limit=100,before=null,adminId=null,by='id',dir='desc',offset=0}={}){
    const w=[],p=[];
    if(before){p.push(Number(before));w.push(`a.id<$${p.length}`);}
    if(adminId){p.push(Number(adminId));w.push(`a.admin_id=$${p.length}`);}
    const n=Math.max(1,Math.min(200,limit|0));
    p.push(n+1);
    const lim=`LIMIT $${p.length}`;
    let off='';if(offset>0){p.push(Math.max(0,offset|0));off=` OFFSET $${p.length}`;}
    const {rows}=await db.query(`SELECT a.*,u.nick AS admin_nick FROM admin_audit a LEFT JOIN users u ON u.id=a.admin_id
      ${w.length?`WHERE ${w.join(' AND ')}`:''} ORDER BY ${orderAudit(by,dir)} ${lim}${off}`,p);
    const more=rows.length>n;
    return{rows:rows.slice(0,n).map(r=>({id:Number(r.id),adminId:r.admin_id?Number(r.admin_id):null,adminNick:r.admin_nick||null,
      action:r.action,target:r.target,detail:r.detail,ip:r.ip,at:r.created_at})),more};}
  return{log:log_,list};
}

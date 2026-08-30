// ── REPO admin_audit: toda ação de administrador deixa rastro ────────────────
// `target` é texto porque às vezes é um id de usuário e às vezes um código de sala; `detail` é jsonb
// porque cada ação tem os campos dela — normalizar isso seria inventar dez colunas nulas.
// Escrita FIRE-AND-FORGET nas rotas que não têm transação: um log que falha não pode derrubar a ação que
// o admin acabou de fazer. Onde há transação (moedas, ban), entra DENTRO dela.
// @ts-check
export function createAudit(db,log=null){
  const write=({adminId,action,target=null,detail=null,ip=null},c=db)=>
    c.query(`INSERT INTO admin_audit(admin_id,action,target,detail,ip) VALUES($1,$2,$3,$4::jsonb,$5)`,
      [adminId,String(action).slice(0,40),target==null?null:String(target).slice(0,64),JSON.stringify(detail||{}),ip||null]);
  const log_=(o,c=db)=>{const p=write(o,c);if(c===db)p.catch(e=>log&&log.debug('audit:',e.message));return p;};
  async function list({limit=100,before=null,adminId=null}={}){
    const w=[],p=[];
    if(before){p.push(Number(before));w.push(`a.id<$${p.length}`);}
    if(adminId){p.push(Number(adminId));w.push(`a.admin_id=$${p.length}`);}
    p.push(Math.max(1,Math.min(200,limit|0)));
    const {rows}=await db.query(`SELECT a.*,u.nick AS admin_nick FROM admin_audit a LEFT JOIN users u ON u.id=a.admin_id
      ${w.length?`WHERE ${w.join(' AND ')}`:''} ORDER BY a.id DESC LIMIT $${p.length}`,p);
    return rows.map(r=>({id:Number(r.id),adminId:r.admin_id?Number(r.admin_id):null,adminNick:r.admin_nick||null,
      action:r.action,target:r.target,detail:r.detail,ip:r.ip,at:r.created_at}));}
  return{log:log_,list};
}

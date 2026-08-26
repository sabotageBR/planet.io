// ── REPO coin_ledger (toda variação de moedas passa por aqui, na mesma transação) ──
// @ts-check
export class InsufficientCoins extends Error{constructor(){super('moedas insuficientes');this.code='INSUFFICIENT_COINS';}}
export function createLedger(db){
  /**
   * Aplica delta com saldo nunca negativo e registra no ledger. Use sempre com o client da transação.
   * @returns {Promise<{coins:number,ledgerId:number}>}
   */
  async function apply(c,{userId,delta,reason,refType=null,refId=null}){
    delta=Math.trunc(delta);if(!delta)throw new Error('delta zero');
    const up=await c.query(`UPDATE users SET coins=coins+$2 WHERE id=$1 AND coins+$2>=0 RETURNING coins`,[userId,delta]);
    if(!up.rows[0])throw new InsufficientCoins();
    const coins=up.rows[0].coins;
    const ins=await c.query(`INSERT INTO coin_ledger(user_id,delta,balance_after,reason,ref_type,ref_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[userId,delta,coins,reason,refType,refId==null?null:String(refId)]);
    return{coins,ledgerId:Number(ins.rows[0].id)};
  }
  const sumFor=(userId,c=db)=>c.query(`SELECT coalesce(sum(delta),0)::int AS total FROM coin_ledger WHERE user_id=$1`,[userId]).then(r=>r.rows[0].total);
  const recent=(userId,limit=50)=>db.query(`SELECT id,delta,balance_after,reason,ref_type,ref_id,created_at FROM coin_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT $2`,[userId,limit]).then(r=>r.rows);
  return{apply,sumFor,recent};
}

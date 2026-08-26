// ── NICK (NFKC, espaços colapsados, 2–16; reserva de registrado; sugestão) ──────
// @ts-check
export const NICK_MIN=2,NICK_MAX=16;
const rnd4=()=>String(1000+Math.floor(Math.random()*9000));
/** normaliza; devolve null se inválido */
export function normalizeNick(raw){
  if(typeof raw!=='string')return null;
  const s=raw.normalize('NFKC').replace(/\s+/g,' ').trim();
  if(/[\p{C}]/u.test(s))return null;                       // controles/invisíveis
  const len=Array.from(s).length;if(len<NICK_MIN||len>NICK_MAX)return null;
  return s;
}
export const nickKey=nick=>nick.toLowerCase();
export const randomGuestNick=()=>`Viajante-${rnd4()}`;
/** `Nick_NNNN` mantendo ≤ 16 chars */
export function suggestNick(nick){const base=Array.from(String(nick||'Viajante')).slice(0,NICK_MAX-5).join('').replace(/[\s_]+$/,'')||'Viajante';return `${base}_${rnd4()}`;}
/** nick reservado por OUTRO usuário registrado (case-insensitive) */
export async function isReservedByOther(db,nick,userId=null){
  const {rows}=await db.query(`SELECT 1 FROM users WHERE kind='registered' AND lower(nick)=lower($1) AND ($2::bigint IS NULL OR id<>$2) LIMIT 1`,[nick,userId]);
  return rows.length>0;
}

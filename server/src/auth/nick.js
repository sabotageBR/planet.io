// ── NICK (livre) e LOGIN (único): NFKC, espaços colapsados, 2–16; sugestão ──────
// @ts-check
// O NICK é nome de planeta: livre, trocável, repetível — só não pode repetir DENTRO de uma sala
// (`Room.nickTaken`). O LOGIN é o nome de ENTRADA: nasce no cadastro, é ÚNICO (users_login_uq) e não
// muda mais. Eram a mesma coluna até a migração 0009, e era o login que obrigava o nick a ser único.
import {temGrave} from '../palavrao.js';
export const NICK_MIN=2,NICK_MAX=16;
const rnd4=()=>String(1000+Math.floor(Math.random()*9000));
/** normaliza; devolve null se inválido */
export function normalizeNick(raw){
  if(typeof raw!=='string')return null;
  const s=raw.normalize('NFKC').replace(/\s+/g,' ').trim();
  if(/[\p{C}]/u.test(s))return null;                       // controles/invisíveis
  const len=Array.from(s).length;if(len<NICK_MIN||len>NICK_MAX)return null;
  // ⚠️ Aqui se RECUSA, não se mascara (o chat faz o contrário, e por um motivo): o nick fica no placar, no
  // kill feed, no chat e no radar a partida inteira, e um `Fulano****` no pódio é pior que pedir outro
  // nome no instante em que a pessoa está escolhendo. Vale para o LOGIN também, que passa por aqui.
  if(temGrave(s))return null;
  return s;
}
/**
 * Mesma regra do nick MENOS o `@`. `byLogin` casa login OU e-mail no mesmo campo: um login com `@`
 * poderia "cobrir" o e-mail de outra conta e trancar o dono dele para fora, sem erro nenhum.
 */
export const normalizeLogin=raw=>{const s=normalizeNick(raw);return s&&!s.includes('@')?s:null;};
export const nickKey=nick=>nick.toLowerCase();
export const randomGuestNick=()=>`Viajante-${rnd4()}`;
/** `Nick_NNNN` mantendo ≤ 16 chars */
export function suggestNick(nick){const base=Array.from(String(nick||'Viajante')).slice(0,NICK_MAX-5).join('').replace(/[\s_]+$/,'')||'Viajante';return `${base}_${rnd4()}`;}
/** login já usado por OUTRA conta (case-insensitive). O guarda de verdade é o 23505 de users_login_uq. */
export async function loginTaken(db,login,userId=null){
  const {rows}=await db.query(`SELECT 1 FROM users WHERE lower(login)=lower($1) AND ($2::bigint IS NULL OR id<>$2) LIMIT 1`,[login,userId]);
  return rows.length>0;
}

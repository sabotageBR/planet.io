// ── SENHA (scrypt nativo; formato scrypt$N$r$p$salt$hash em base64url) ─────────
// @ts-check
import {scrypt,randomBytes,timingSafeEqual} from 'node:crypto';
const N=2**15,R=8,P=1,KEYLEN=32,MAXMEM=128*N*R*2;   // 128·N·r = 32 MiB; maxmem precisa ser maior
export const PASSWORD_MIN=6,PASSWORD_MAX=128;
const kdf=(pw,salt,n,r,p)=>new Promise((res,rej)=>scrypt(pw.normalize('NFKC'),salt,KEYLEN,{N:n,r,p,maxmem:MAXMEM},(e,k)=>e?rej(e):res(k)));
export async function hashPassword(pw){
  const salt=randomBytes(16);const key=await kdf(pw,salt,N,R,P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}
export async function verifyPassword(pw,stored){
  if(typeof pw!=='string'||typeof stored!=='string')return false;
  const [alg,n,r,p,salt,hash]=stored.split('$');if(alg!=='scrypt'||!salt||!hash)return false;
  const exp=Buffer.from(hash,'base64url');const key=await kdf(pw,Buffer.from(salt,'base64url'),Number(n),Number(r),Number(p));
  return key.length===exp.length&&timingSafeEqual(key,exp);
}
export const validPassword=pw=>typeof pw==='string'&&pw.length>=PASSWORD_MIN&&pw.length<=PASSWORD_MAX;
// hash fixo para igualar o tempo do login quando o usuário não existe
let dummy=null;export const dummyHash=async()=>dummy||(dummy=await hashPassword('warspace-io-dummy'));

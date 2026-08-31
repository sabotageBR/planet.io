// ── Cliente HTTP do painel ───────────────────────────────────────────────────
// ⚠️ O TOKEN VIVE NUMA CHAVE PRÓPRIA (`warspace_admin_token`), nunca em `warspace_token`. É o que garante
// que o painel e o jogo não emprestem credencial um ao outro: o token do painel é de outro `kind`, e o do
// jogo não abre o painel. Misturar as duas chaves desfaria isso sem ninguém perceber.
import { apiUrl } from "../api/base.js";
const KEY="warspace_admin_token";
export const getToken=()=>{try{return localStorage.getItem(KEY)||"";}catch{return "";}};
export const setToken=t=>{try{t?localStorage.setItem(KEY,t):localStorage.removeItem(KEY);}catch{/* modo anônimo */}};

let onAuthFail=null;
export const setOnAuthFail=f=>{onAuthFail=f;};

async function req(method,path,body){
  const h={accept:"application/json"};const tk=getToken();
  if(tk)h.authorization="Bearer "+tk;
  if(body!==undefined)h["content-type"]="application/json";
  const r=await fetch(apiUrl("/api/admin"+path),{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});
  if(r.status===204)return null;
  const j=await r.json().catch(()=>null);
  if(r.status===401||r.status===403){setToken("");if(onAuthFail)onAuthFail();}
  if(!r.ok)throw Object.assign(new Error((j&&j.message)||`erro ${r.status}`),{code:j&&j.error,status:r.status});
  return j;
}
export const api={
  login:(login,password)=>req("POST","/login",{login,password}),
  logout:()=>req("POST","/logout"),
  me:()=>req("GET","/me"),
  users:q=>req("GET","/users"+q),
  user:id=>req("GET","/users/"+id),
  patchUser:(id,b)=>req("PATCH","/users/"+id,b),
  ban:(id,days,reason)=>req("POST",`/users/${id}/ban`,{days,reason}),
  coins:(id,delta,reason)=>req("POST",`/users/${id}/coins`,{delta,reason}),
  revoke:id=>req("POST",`/users/${id}/tokens/revoke`),
  setAdmin:(id,on)=>req("POST",`/users/${id}/admin`,{on}),
  rooms:()=>req("GET","/rooms"),
  room:code=>req("GET","/rooms/"+code),
  kick:(code,slot,sessionId,reason)=>req("POST",`/rooms/${code}/kick`,{slot,sessionId,reason}),
  closeRoom:code=>req("POST",`/rooms/${code}/close`),
  broadcast:(text,level,ttlMs)=>req("POST","/broadcast",{text,level,ttlMs}),
  settings:()=>req("GET","/settings"),
  setSetting:(key,value)=>req("PUT","/settings/"+key,{value}),
  resetSetting:key=>req("DELETE","/settings/"+key),
  audit:q=>req("GET","/audit"+(q||"")),
};

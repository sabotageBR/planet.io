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
/**
 * Abre um STREAM (SSE) com o mesmo Bearer e o mesmo contrato de 401/403 do `req()`.
 * ⚠️ Existe porque `req()` faz `await r.json()`, e num corpo que nunca termina isso NÃO REJEITA: fica
 * pendurado para sempre, a tela diz "carregando…" e o console fica limpo. Aqui o corpo é do chamador.
 * ⚠️ E não dá para usar `EventSource`: ele não manda header `Authorization`. Token na query string está
 * fora de questão — é credencial de 12 h com poder de kick e ban, e iria para o access log do nginx, para
 * o histórico do navegador e para o `Referer`. Cookie desfaria a decisão de guardar tudo em localStorage
 * (e abriria superfície de CSRF em rotas que hoje são imunes por construção).
 * O preço: reconexão e `Last-Event-ID` deixam de ser de graça e viram código nosso — o que aqui é ganho,
 * porque a retomada é pelo cursor `{shard,seq,epoch}` e não pelo palpite de um id só.
 */
export async function abreStream(path,{signal,lastId}={}){
  const h={accept:"text/event-stream"},tk=getToken();
  if(tk)h.authorization="Bearer "+tk;
  if(lastId)h["last-event-id"]=lastId;
  const r=await fetch(apiUrl("/api/admin"+path),{method:"GET",headers:h,signal,cache:"no-store"});
  // O MESMO branch do `req()`, e é por isso que ele mora aqui: `onAuthFail` é `let` de módulo e não é
  // exportado. Duplicá-lo no hook criaria dois lugares que sabem o que é falha de autenticação.
  if(r.status===401||r.status===403){setToken("");if(onAuthFail)onAuthFail();}
  return r;
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
  rooms:q=>req("GET","/rooms"+(q||"")),
  room:(code,q)=>req("GET","/rooms/"+code+(q||"")),
  kick:(code,slot,sessionId,reason)=>req("POST",`/rooms/${code}/kick`,{slot,sessionId,reason}),
  closeRoom:code=>req("POST",`/rooms/${code}/close`),
  broadcast:(text,level,ttlMs)=>req("POST","/broadcast",{text,level,ttlMs}),
  settings:()=>req("GET","/settings"),
  setSetting:(key,value)=>req("PUT","/settings/"+key,{value}),
  resetSetting:key=>req("DELETE","/settings/"+key),
  audit:q=>req("GET","/audit"+(q||"")),
  // ⚠️ `janela`, não mais `days`: "dia atual" não é um número de dias, e o `d|0` de antes truncava
  // qualquer coisa que não fosse inteiro. A lista de janelas é do SERVIDOR (`/retencao/janelas`) —
  // duplicá-la aqui a faria divergir na primeira janela nova.
  retencao:j=>req("GET","/retencao?janela="+encodeURIComponent(j||"")),
  retencaoJanelas:()=>req("GET","/retencao/janelas"),
  kpis:()=>req("GET","/kpis"),
};

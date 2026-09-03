// ── HOOKS NO-OP: contrato sim ↔ persistência (docs/spec/hooks.md) sem banco ─────
// @ts-check
const nickOf=n=>String(n||'Viajante').slice(0,16)||'Viajante';
export const NO_REWARDS=Object.freeze({saved:false,coinsEarned:0,coins:null,achievements:[],skinsUnlocked:[],rank:null});
export const NOOP_HOOKS=Object.freeze({
  onPlayerJoin:async({fallbackNick}={})=>({ok:true,userId:null,nick:nickOf(fallbackNick),registered:false,skinId:0,prefs:{},sessionId:null,unsaved:true}),
  onStat(){},onKill(){},onSample(){},
  onMatchEnd:async()=>null,
  onShutdown:async()=>{},
  // Uma vida nova para quem já está na sala (renascer no Livre). Sem banco não há sessão a abrir, e
  // `null` é a resposta certa: `Room.respawn` a trata como "esta vida não é gravada", que é o que o modo
  // unsaved já significa em todo o resto.
  openSession:()=>null,
});

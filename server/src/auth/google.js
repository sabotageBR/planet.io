// ── LOGIN COM GOOGLE (esqueleto plugável, INERTE sem credencial) ──────────────
// Sem GOOGLE_CLIENT_ID a rota existe, é testada e responde 503 — e o cliente nem desenha o botão, porque
// `/api/config` não devolve o clientId. É esse o estado "desenhado e desligado".
//
// Zero dependência nova: `server/package.json` continua com `pg` e `ws`. A verificação usa o endpoint
// `tokeninfo` do Google com o `fetch` nativo do Node 22. O upgrade natural (validar a assinatura contra as
// JWKS localmente, com `crypto.createPublicKey`+`crypto.verify`) também não exige biblioteca — só vale a
// pena quando o volume justificar não fazer uma ida à rede por login.
// @ts-check
const TOKENINFO='https://oauth2.googleapis.com/tokeninfo?id_token=';
const ISS=new Set(['accounts.google.com','https://accounts.google.com']);

export function createGoogle({config,log=null,fetchImpl=fetch}){
  const clientId=String(config&&config.googleClientId||'');
  return{
    get enabled(){return !!clientId;},
    get clientId(){return clientId;},
    /**
     * Valida o `id_token` e devolve a identidade, ou lança. O que é conferido, e por quê:
     *  • `aud` === o NOSSO clientId — sem isto, um token emitido para qualquer outro app entraria aqui;
     *  • `iss` do Google;
     *  • `exp` no futuro;
     *  • `email_verified` — e-mail não verificado não serve para casar conta.
     * O `sub` é a identidade, NUNCA o e-mail: o e-mail muda de dono, o sub não.
     */
    async verify(idToken){
      if(!clientId)throw new Error('google desligado');
      const t=String(idToken||'');
      if(!t||t.length>4096)throw new Error('id_token inválido');
      const r=await fetchImpl(TOKENINFO+encodeURIComponent(t),{signal:AbortSignal.timeout(5000)});
      if(!r.ok)throw new Error(`tokeninfo HTTP ${r.status}`);
      const p=await r.json();
      if(p.aud!==clientId)throw new Error('aud não é deste app');
      if(!ISS.has(String(p.iss)))throw new Error('iss inesperado');
      if(!(Number(p.exp)*1000>Date.now()))throw new Error('id_token expirado');
      if(String(p.email_verified)!=='true')throw new Error('e-mail não verificado');
      if(!p.sub)throw new Error('sem sub');
      if(log)log.debug(`google: ${p.email||p.sub} ok`);
      return{subject:String(p.sub),email:p.email?String(p.email):null,name:p.name?String(p.name):null};},
  };}

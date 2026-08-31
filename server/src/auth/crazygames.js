// ── LOGIN COM A CONTA CRAZYGAMES ──────────────────────────────────────────────
// O portal hospeda o cliente e o jogador já está logado LÁ. O SDK deles entrega um JWT curto
// (`SDK.user.getUserToken()`, validade de 1 h) e o nosso servidor o verifica para saber de quem se trata.
// É o gêmeo do `auth/google.js`, e a identidade cai na MESMA tabela (`provider='crazygames'`, `subject`
// = o `userId` deles) — não há migração nova.
//
// ⚠️ A DIFERENÇA para o Google é onde mora a confiança. Lá existe um endpoint `tokeninfo` que valida o
//    token por nós; aqui a verificação é NOSSA: assinatura RS256 contra a chave pública publicada em
//    `sdk.crazygames.com/publicKey.json`. Sem dependência nova — `node:crypto` faz RS256 —, mas isso
//    significa que cada checagem abaixo é a única coisa entre um token forjado e uma conta:
//      • assinatura RS256 confere com a chave pública deles;
//      • `exp` no futuro e `iat` não absurdamente no futuro (relógio torto do cliente não vale token);
//      • `gameId` é o NOSSO — sem isso, um token emitido para qualquer outro jogo da rede entraria aqui,
//        que é exatamente o buraco que o `aud` fecha no Google;
//      • `userId` presente — ele é a identidade, nunca o `username`, que o jogador troca.
// ⚠️ O `__dangerousUserId` do `getUser()` NÃO serve para isto (a própria doc deles avisa): ele vem do
//    lado do cliente, sem assinatura. Só o token vale.
// ⚠️ A chave é CACHEADA e re-buscada quando uma verificação falha: eles avisam que ela pode mudar, e um
//    cache eterno transformaria a troca de chave numa queda de login sem explicação.
// @ts-check
const KEY_URL='https://sdk.crazygames.com/publicKey.json';
const KEY_TTL_MS=6*60*60*1000;   // 6 h: a chave é estável; o re-fetch de emergência cobre a troca
const SKEW_MS=5*60*1000;         // tolerância de relógio para o `iat`

const b64url=s=>Buffer.from(String(s).replace(/-/g,'+').replace(/_/g,'/'),'base64');

/** @param {{config:any,log?:any,fetchImpl?:typeof fetch,crypto?:any}} o */
export function createCrazyGames({config,log=null,fetchImpl=fetch,crypto=null}){
  const gameId=String(config&&config.crazyGameId||'');
  let chave=null,chaveAt=0,buscando=null;
  const cripto=crypto||null;

  async function pegaCrypto(){return cripto||(await import('node:crypto'));}

  /** A chave pública deles, com cache. `forcar` ignora o cache (usado quando a assinatura falha). */
  async function chavePublica(forcar=false){
    if(!forcar&&chave&&Date.now()-chaveAt<KEY_TTL_MS)return chave;
    if(buscando)return buscando;
    buscando=(async()=>{
      const r=await fetchImpl(KEY_URL,{signal:AbortSignal.timeout(5000)});
      if(!r.ok)throw new Error(`publicKey HTTP ${r.status}`);
      const j=await r.json();
      const pem=String(j&&(j.publicKey||j.public_key)||'');
      if(!pem.includes('BEGIN'))throw new Error('publicKey sem PEM');
      chave=pem;chaveAt=Date.now();return pem;
    })().finally(()=>{buscando=null;});
    return buscando;
  }

  return{
    // Sem `CRAZY_GAME_ID` a rota existe e responde 503 — o mesmo "desenhado e desligado" do Google. É o
    // id que o portal deles dá ao jogo, e ele é o que amarra o token A ESTE jogo.
    get enabled(){return !!gameId;},
    get gameId(){return gameId;},
    /** Verifica o JWT e devolve a identidade, ou lança. */
    async verify(userToken){
      if(!gameId)throw new Error('crazygames desligado');
      const t=String(userToken||'');
      if(!t||t.length>4096)throw new Error('token inválido');
      const [h,p,s]=t.split('.');
      if(!h||!p||!s)throw new Error('token malformado');
      const cab=JSON.parse(b64url(h).toString('utf8'));
      if(String(cab.alg)!=='RS256')throw new Error(`alg inesperado: ${cab.alg}`);
      const {createVerify}=await pegaCrypto();
      const dados=Buffer.from(`${h}.${p}`),assinatura=b64url(s);
      const confere=async forcar=>{
        const v=createVerify('RSA-SHA256');v.update(dados);v.end();
        return v.verify(await chavePublica(forcar),assinatura);
      };
      // uma segunda tentativa com a chave RE-BUSCADA: é o caminho do dia em que eles trocarem a chave
      if(!(await confere(false))&&!(await confere(true)))throw new Error('assinatura inválida');
      const c=JSON.parse(b64url(p).toString('utf8'));
      const agora=Date.now();
      if(!(Number(c.exp)*1000>agora))throw new Error('token expirado');
      if(Number(c.iat)*1000>agora+SKEW_MS)throw new Error('iat no futuro');
      if(String(c.gameId)!==gameId)throw new Error('gameId não é deste jogo');
      if(!c.userId)throw new Error('sem userId');
      if(log)log.debug(`crazygames: ${c.username||c.userId} ok`);
      return{subject:String(c.userId),name:c.username?String(c.username):null,
        avatar:c.profilePictureUrl?String(c.profilePictureUrl):null};
    },
  };}

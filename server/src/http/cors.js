// ── CORS (o cliente pode morar fora de warspace.io) ───────────────────────────
// @ts-check
// O cliente virou um .zip que os portais de jogos (GameDistribution, CrazyGames, Poki, itch.io)
// hospedam no domínio DELES, dentro de um iframe, enquanto a API e o WS continuam aqui. Isso é o
// modelo normal de um .io em portal — eles servem os arquivos, o servidor multiplayer é nosso.
//
// ⚠️ ESTE ARQUIVO SÓ É SEGURO ENQUANTO NÃO HOUVER COOKIE NO PROJETO. A auth é `Authorization: Bearer`
//    em localStorage, e é por isso que (a) não mandamos `Allow-Credentials` e (b) o avatar pode sair
//    com `*`. No dia em que alguma rota passar a depender de cookie, as duas coisas viram buraco —
//    revise aqui ANTES de escrever o primeiro `Set-Cookie`.
//
// ⚠️ O casamento é por origem EXATA ou por sufixo de domínio declarado (`https://*.itch.zone`), e
//    nunca por `includes`/`startsWith`: `https://html5.gamedistribution.com.evil.tld` contém a nossa
//    origem inteira como prefixo. É a vulnerabilidade clássica de CORS e ela é barata de evitar.
const SEM_VARY=/^\/api\/avatar\/\d+$/;                       // leitura pública, cacheável: sai com `*`
const ALVO=/^\/api\//,FORA=/^\/api\/admin(\/|$)/;            // a superfície: /api/*, menos o painel
const METODOS='GET, POST, PATCH, DELETE, OPTIONS';
// `Authorization` nunca é safelisted, e o corpo vai como application/json ou image/webp (o upload de
// avatar) — nenhum dos dois é `Content-Type` simples. `Accept` É safelisted e por isso NÃO entra aqui.
const CABECALHOS='Authorization, Content-Type';
const MAX_AGE='7200';   // o Chrome tampa o cache de preflight em 2 h; pedir mais é fantasia

/** Normaliza uma origem para comparação: minúscula, sem espaço e sem barra final. */
const limpa=o=>String(o||'').trim().toLowerCase().replace(/\/+$/,'');

/**
 * Constrói o predicado de origem permitida. Puro e exportado à parte porque o WS usa o MESMO
 * predicado — duas listas de origens divergiriam no primeiro portal novo.
 * @param {string[]} lista entradas `esquema://host[:porta]`, com `*.` opcional no host
 * @param {{warn?:(...a:any)=>void}} [log]
 */
export function createOriginMatcher(lista,log=null){
  const exatas=new Set();const sufixos=[];
  for(const bruta of lista||[]){
    const e=limpa(bruta);
    // `*` sozinho é recusado de propósito: quem quer abrir para o mundo tem que dizer isso no código,
    // não numa vírgula do ConfigMap. E entrada quebrada é AVISADA — o modo de falha real aqui é typo,
    // e um typo silencioso vira "o portal não conecta e ninguém sabe por quê".
    if(!e||e==='*'){if(e&&log&&log.warn)log.warn('cors: entrada ignorada',{origem:bruta});continue;}
    const curinga=e.includes('://*.');
    let u=null;try{u=new URL(curinga?e.replace('://*.','://'):e);}catch{u=null;}
    // `https://` sozinho é o que sobra de `https://__HOST__` quando se aplica com NO_INGRESS=1: sem
    // host, e um matcher por sufixo ingênuo o transformaria em "casa tudo".
    if(!u||!u.hostname){if(log&&log.warn)log.warn('cors: entrada inválida',{origem:bruta});continue;}
    if(curinga)sufixos.push({proto:u.protocol,host:u.hostname});
    else exatas.add(`${u.protocol}//${u.host}`);
  }
  return origem=>{
    const o=limpa(origem);
    // "null" é o Origin de um iframe com `sandbox` sem `allow-same-origin`, de `data:` e de `file:`.
    // Qualquer atacante produz um; nunca é permitido.
    if(!o||o==='null')return false;
    if(exatas.has(o))return true;
    let u=null;try{u=new URL(o);}catch{return false;}
    return sufixos.some(s=>s.proto===u.protocol&&(u.hostname===s.host||u.hostname.endsWith('.'+s.host)));
  };
}

/**
 * Camada de CORS. Escreve os headers com `setHeader` ANTES do roteamento: no Node, o objeto de
 * `writeHead(status,{...})` é MESCLADO com o que já foi posto por `setHeader`, então um ponto só
 * cobre o `sendJson`, os headers próprios do avatar, o 304 dele por ETag, o 503 de "sem banco" e os
 * estáticos — sem tocar em nenhum call site.
 *
 * @param {{config:any,log:any}} o
 * @returns {(req:any,res:any,path:string)=>boolean} true = já respondeu (era preflight)
 */
export function createCors({config,log}){
  const permitida=createOriginMatcher(config.allowedOrigins||[],log);
  const ligado=(config.allowedOrigins||[]).length>0;
  return function cors(req,res,path){
    // Lista vazia = camada DESLIGADA, e desligada significa "nem um byte a mais em resposta nenhuma":
    // é essa garantia que faz a mudança ser inofensiva para quem só roda o site.
    if(!ligado||!ALVO.test(path)||FORA.test(path))return false;
    const origem=req.headers.origin;
    if(SEM_VARY.test(path)&&(req.method==='GET'||req.method==='HEAD')){
      // A foto é pública (um `<img>` cross-origin já a pega hoje, sem CORS) e a resposta é `immutable`
      // por um ano — com eco da origem + `Vary` o cache se fragmentaria por portal, e o 304 por ETag
      // precisaria do header também. `*` mantém uma entrada de cache servindo todo mundo.
      res.setHeader('Access-Control-Allow-Origin','*');return false;}
    // `Vary` SEMPRE, mesmo recusando: sem ele um cache intermediário serve a uma origem a resposta
    // que foi montada para outra.
    res.setHeader('Vary','Origin');
    const ok=permitida(origem);
    if(ok)res.setHeader('Access-Control-Allow-Origin',origem);
    else if(origem&&log&&log.debug)log.debug('cors: origem recusada',{origem,path});   // é assim que se descobre a origem real de um portal, sem chute
    if(req.method!=='OPTIONS')return false;
    // Preflight ANTES do roteamento por dois motivos: hoje ele cai no 405 de `router.js` (o path casa,
    // o método não), e respondendo aqui ele não consome cota do rate limiter — senão toda chamada
    // autenticada passaria a custar dois tokens do balde.
    if(ok){res.setHeader('Access-Control-Allow-Methods',METODOS);
      res.setHeader('Access-Control-Allow-Headers',CABECALHOS);
      res.setHeader('Access-Control-Max-Age',MAX_AGE);}
    res.writeHead(204);res.end();return true;
  };
}

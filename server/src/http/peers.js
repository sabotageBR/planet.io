// ── PEERS: fala com os shards irmãos (PEERS ou PEER_HOST) com timeout de 1200 ms ──────────────
// Duas perguntas: a lista de salas (/internal/rooms) e o lobby de equipe (/internal/party).
// @ts-check
const TIMEOUT_MS=1200;
/** @param {string[]} peers host:porta @returns {Promise<Array<{code:string,shard:number,players:number,max:number,bots:number}>>} */
export async function fetchPeerRooms(peers,{timeoutMs=TIMEOUT_MS,log=null}={}){
  const lists=await Promise.all(peers.map(async p=>{
    try{const r=await fetch(`http://${p}/internal/rooms`,{signal:AbortSignal.timeout(timeoutMs)});if(!r.ok)return[];const j=await r.json();return Array.isArray(j.rooms)?j.rooms:[];}
    catch(e){if(log)log.debug(`peer ${p} indisponível: ${e&&e.message}`);return[];}}));
  return lists.flat();
}

/**
 * Faz a MESMA pergunta a todos os irmãos e devolve a resposta de quem é DONO do recurso.
 * É o lobby de equipe que precisa disto: o party vive na memória do shard que gerou o código, mas o
 * Ingress balanceia /api entre os 3 pods — sem este desvio, 2 em cada 3 chamadas caem no pod errado.
 * Perguntar a todos é seguro até para MUTAÇÃO: quem não é dono recusa antes de tocar em nada (o guarda
 * de `rooms/Party.js`), e o código carrega o dono no 1º char, então dois pods nunca geram o mesmo.
 * @param {string[]} peers host:porta
 * @returns {Promise<{status:number,body:any}|null>} null = NINGUÉM respondeu (rede/timeout); quem chama
 *   devolve 503, nunca 404 — é o 404 que faz o cliente desfazer a equipe do jogador.
 */
export async function askPeers(peers,{path,method='GET',body=null,auth=null,timeoutMs=TIMEOUT_MS,log=null}={}){
  const headers={accept:'application/json'};if(auth)headers.authorization=auth;if(body!=null)headers['content-type']='application/json';
  const rs=await Promise.all(peers.map(async p=>{
    try{const r=await fetch(`http://${p}${path}`,{method,headers,body:body==null?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
      return{status:r.status,body:await r.json().catch(()=>null)};}
    catch(e){if(log)log.debug(`peer ${p} indisponível: ${e&&e.message}`);return null;}}));
  const vivos=rs.filter(Boolean);if(!vivos.length)return null;
  return vivos.find(r=>r.status!==404)||vivos[0];   // o dono é o único que não responde 404
}

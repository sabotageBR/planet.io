// ── PEERS: agrega /internal/rooms dos irmãos (PEERS ou PEER_HOST) com timeout de 1200 ms ──
// @ts-check
const TIMEOUT_MS=1200;
/** @param {string[]} peers host:porta @returns {Promise<Array<{code:string,shard:number,players:number,max:number,bots:number}>>} */
export async function fetchPeerRooms(peers,{timeoutMs=TIMEOUT_MS,log=null}={}){
  const lists=await Promise.all(peers.map(async p=>{
    try{const r=await fetch(`http://${p}/internal/rooms`,{signal:AbortSignal.timeout(timeoutMs)});if(!r.ok)return[];const j=await r.json();return Array.isArray(j.rooms)?j.rooms:[];}
    catch(e){if(log)log.debug(`peer ${p} indisponível: ${e&&e.message}`);return[];}}));
  return lists.flat();
}

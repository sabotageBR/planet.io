// ── RATE LIMIT em memória por pod (janela fixa por chave) ──────────────────────
// @ts-check
const MIN=60e3;
/** limites da spec (api.md) */
export const LIMITS={
  guest:{n:30,win:60*MIN},          // por IP (NAT: vários jogadores no mesmo IP)
  loginIp:{n:10,win:15*MIN},        // por IP
  loginNick:{n:5,win:15*MIN},       // falhas por nick
  tokenWrite:{n:10,win:MIN},        // claim / PATCH por token
  default:{n:60,win:MIN},           // demais, por IP
  join:{n:20,win:MIN},              // joins WS por IP (defensivo)
};
export function createRateLimiter(){
  const buckets=new Map();let hits=0;
  const get=(key,win)=>{const now=Date.now();let b=buckets.get(key);if(!b||b.resetAt<=now){b={count:0,resetAt:now+win};buckets.set(key,b);}return b;};
  /** consome 1; false se estourou (não consome além do limite) */
  function take(key,lim){const b=get(key,lim.win);if(b.count>=lim.n){hits++;return false;}b.count++;return true;}
  /** só consulta */
  const peek=(key,lim)=>get(key,lim.win).count<lim.n;
  const retryAfterS=(key,lim)=>Math.max(1,Math.ceil((get(key,lim.win).resetAt-Date.now())/1000));
  const reset=key=>buckets.delete(key);
  const sweep=()=>{const now=Date.now();for(const [k,b] of buckets)if(b.resetAt<=now)buckets.delete(k);};
  const timer=setInterval(sweep,5*MIN);timer.unref();
  return{take,peek,retryAfterS,reset,sweep,get hits(){return hits;},get size(){return buckets.size;},stop:()=>clearInterval(timer)};
}

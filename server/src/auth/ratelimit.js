// ── RATE LIMIT em memória por pod (janela fixa por chave) ──────────────────────
//
// ⚠️ **"POR IP" SÓ VALE SE O IP FOR O DO JOGADOR, E AQUI ELE NÃO É.** Medido em produção
// (2026-09-03): o ingress-nginx registra `10.32.0.1` para TODO MUNDO — o `externalTrafficPolicy`
// do Service dele é `Cluster` e o kube-proxy faz SNAT antes de o pacote chegar ao controller,
// então o IP do cliente já se perdeu quando o `X-Forwarded-For` é escrito. Consequência: cada
// limite abaixo deixa de ser "por pessoa" e vira um TETO GLOBAL por shard, compartilhado por
// todos os jogadores do mundo. Provado com 400 requisições a `/api/ranking`: **342 levaram 429**,
// e nenhuma delas era abuso — era uma máquina só ocupando o balde da humanidade inteira.
// O caso que dói mais é o `guest`: 30/h por shard = 90 contas novas por HORA no site inteiro, ou
// seja num portal com tráfego o 91º jogador da hora simplesmente não consegue entrar.
//
// Enquanto o IP não chegar de verdade (ver `docs/spec/api.md` e o CLAUDE.md: a correção é no
// ingress, com o controller em DaemonSet + `externalTrafficPolicy: Local`), um limite por IP tem
// que ser dimensionado pela SALA CHEIA e não por uma pessoa — daí `IP_CEGO_K`, aplicado no router
// quando `config.trustClientIp` é falso. Com o IP real chegando, basta ligar `TRUST_CLIENT_IP=1`
// e os números abaixo voltam a significar o que dizem.
// @ts-check
const MIN=60e3;
/** limites da spec (api.md) — POR PESSOA, e só quando o IP identifica uma (ver o cabeçalho) */
export const LIMITS={
  guest:{n:30,win:60*MIN},          // por IP (NAT: vários jogadores no mesmo IP)
  loginIp:{n:10,win:15*MIN},        // por IP
  loginNick:{n:5,win:15*MIN},       // falhas por nick
  tokenWrite:{n:10,win:MIN},        // claim / PATCH por token
  default:{n:60,win:MIN},           // demais, por IP
  join:{n:20,win:MIN},              // joins WS por IP (defensivo)
};
/**
 * Quantas pessoas cabem atrás do "IP" quando ele não identifica ninguém. Não é um número de
 * conforto: é a capacidade de um shard (uma sala cheia é `ROOM.MAX`, e o shard segura algumas),
 * porque é exatamente esse o grupo que hoje divide um balde só. `loginNick` e `tokenWrite` NÃO
 * escalam — a chave deles já é a pessoa (o nick e o token), então continuam valendo por pessoa.
 */
export const IP_CEGO_K=50;
/** Mesmo limite, `n` multiplicado por `k` (janela intacta). Objeto novo: `LIMITS` é a fonte. */
export const escala=(lim,k)=>k<=1?lim:{n:Math.ceil(lim.n*k),win:lim.win};
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

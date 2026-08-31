// ── MÉTRICAS: ring buffers (600 amostras) para tick/lag + contadores por segundo (bytes out, msgs in) ──
// @ts-check
const N=600,WIN=10;
class Ring{
  constructor(n=N){this.buf=new Float64Array(n);this.n=0;this.i=0;}
  push(v){this.buf[this.i]=v;this.i=(this.i+1)%this.buf.length;if(this.n<this.buf.length)this.n++;}
  /** percentis por ordenação de uma cópia (só no /healthz) */
  pct(){if(!this.n)return{p50:0,p99:0,max:0};const a=this.buf.slice(0,this.n).sort();const q=p=>a[Math.min(a.length-1,Math.floor(p*a.length))];return{p50:q(.5),p99:q(.99),max:a[a.length-1]};}
}
const r3=v=>Math.round(v*1000)/1000;
export function createMetrics(){
  const tick=new Ring(),lag=new Ring();let overruns=0,rateLimitHits=0,bytesOutTotal=0,msgsInTotal=0;
  // ── fala gerada (Ollama) ──
  // O que interessa aqui não é "quantas gerações": é quantas viraram FALA. `fallback` alto com `fail`
  // baixo quer dizer que o teto de gerações está apertando; `fail` alto quer dizer que o modelo saiu da
  // memória; `veto` alto quer dizer que o prompt está produzindo coisa que a peneira recusa.
  const llmMs=new Ring(120);
  const llmN={ask:0,ok:0,veto:0,fail:0,stale:0,drop:0,teto:0,fallback:0,conv:0,puxa:0};
  let llmInflight=()=>0,llmBreaker=()=>false;
  const startedAt=Date.now();
  // janela de WIN s em baldes por segundo (bytes de saída, mensagens de entrada)
  const secs=new Float64Array(WIN).fill(-1),bo=new Float64Array(WIN),mi=new Float64Array(WIN);
  const bucket=()=>{const s=Math.floor(Date.now()/1000),k=s%WIN;if(secs[k]!==s){secs[k]=s;bo[k]=0;mi[k]=0;}return k;};
  const rate=arr=>{const s=Math.floor(Date.now()/1000);let sum=0;for(let k=0;k<WIN;k++)if(secs[k]>s-WIN)sum+=arr[k];
    const span=Math.min(WIN,Math.max(1,(Date.now()-startedAt)/1000));return sum/span;};
  return{
    tick:ms=>tick.push(ms),lag:ms=>lag.push(ms),overrun:()=>{overruns++;},
    bytesOut:n=>{bo[bucket()]+=n;bytesOutTotal+=n;},msgIn:()=>{mi[bucket()]++;msgsInTotal++;},rateLimitHit:()=>{rateLimitHits++;},
    /** @param {'ask'|'ok'|'veto'|'fail'|'stale'|'drop'|'teto'|'fallback'|'conv'|'puxa'} ev */
    llm:(ev,ms)=>{if(llmN[ev]!=null)llmN[ev]++;if(ms>=0&&(ev==='ok'||ev==='fail'))llmMs.push(ms);},
    /** O cliente do Ollama é criado depois das métricas; estes dois getters fecham o laço sem inverter a ordem. */
    llmSource:(inflight,breaker)=>{llmInflight=inflight;llmBreaker=breaker;},
    get overruns(){return overruns;},get rateLimitHits(){return rateLimitHits;},get bytesOutTotal(){return bytesOutTotal;},get msgsInTotal(){return msgsInTotal;},
    /** {tick:{p50,p99,max,overruns},loopLagMs:{p50,p99},net:{outKBps,inMsgps,rateLimitHits}} */
    snapshot(){const t=tick.pct(),l=lag.pct();
      const m=llmMs.pct();
      return{tick:{p50:r3(t.p50),p99:r3(t.p99),max:r3(t.max),overruns},loopLagMs:{p50:r3(l.p50),p99:r3(l.p99)},
        net:{outKBps:r3(rate(bo)/1024),inMsgps:r3(rate(mi)),rateLimitHits},
        llm:{...llmN,p50:r3(m.p50),p99:r3(m.p99),inflight:llmInflight()|0,breaker:!!llmBreaker()}};},
  };
}

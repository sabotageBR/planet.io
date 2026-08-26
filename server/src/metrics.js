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
  const startedAt=Date.now();
  // janela de WIN s em baldes por segundo (bytes de saída, mensagens de entrada)
  const secs=new Float64Array(WIN).fill(-1),bo=new Float64Array(WIN),mi=new Float64Array(WIN);
  const bucket=()=>{const s=Math.floor(Date.now()/1000),k=s%WIN;if(secs[k]!==s){secs[k]=s;bo[k]=0;mi[k]=0;}return k;};
  const rate=arr=>{const s=Math.floor(Date.now()/1000);let sum=0;for(let k=0;k<WIN;k++)if(secs[k]>s-WIN)sum+=arr[k];
    const span=Math.min(WIN,Math.max(1,(Date.now()-startedAt)/1000));return sum/span;};
  return{
    tick:ms=>tick.push(ms),lag:ms=>lag.push(ms),overrun:()=>{overruns++;},
    bytesOut:n=>{bo[bucket()]+=n;bytesOutTotal+=n;},msgIn:()=>{mi[bucket()]++;msgsInTotal++;},rateLimitHit:()=>{rateLimitHits++;},
    get overruns(){return overruns;},get rateLimitHits(){return rateLimitHits;},get bytesOutTotal(){return bytesOutTotal;},get msgsInTotal(){return msgsInTotal;},
    /** {tick:{p50,p99,max,overruns},loopLagMs:{p50,p99},net:{outKBps,inMsgps,rateLimitHits}} */
    snapshot(){const t=tick.pct(),l=lag.pct();
      return{tick:{p50:r3(t.p50),p99:r3(t.p99),max:r3(t.max),overruns},loopLagMs:{p50:r3(l.p50),p99:r3(l.p99)},
        net:{outKBps:r3(rate(bo)/1024),inMsgps:r3(rate(mi)),rateLimitHits}};},
  };
}

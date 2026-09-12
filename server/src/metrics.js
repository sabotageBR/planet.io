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
  // ── O OVERRUN PASSA A DIZER DE QUE TAMANHO ELE FOI ──────────────────────────
  // ⚠️ Contar overrun e jogar fora o ATRASO era medir metade do que interessa. Um overrun é o laço ter
  // ficado mais de `MAX_STEPS` (5) ticks para trás, ou seja **no mínimo 83 ms de simulação parada para a
  // sala inteira** — que é exatamente a forma do engasgo que se está caçando do lado do cliente. Com só
  // o contador, "43 overruns" não distingue 43 tropeços de 90 ms de 43 travadas de dois segundos, e as
  // duas coisas têm causas e consertos diferentes.
  // ⚠️ E o `loopLagMs` NÃO responde isso: ele é medido na ENTRADA do turno, sobre um anel de 600
  // amostras a 60 Hz — dez segundos. Um tropeço a cada poucos minutos cai fora do p99 dele e some. Por
  // isso aqui é MÁXIMO acumulado e ÚLTIMO, que não expiram, mais o instante do último.
  const atraso=new Ring(120);let overrunMax=0,overrunUlt=0,overrunAt=0;
  // ── fala gerada (Ollama) ──
  // O que interessa aqui não é "quantas gerações": é quantas viraram FALA. `fallback` alto com `fail`
  // baixo quer dizer que o teto de gerações está apertando; `fail` alto quer dizer que o modelo saiu da
  // memória; `veto` alto quer dizer que o prompt está produzindo coisa que a peneira recusa.
  const llmMs=new Ring(120);
  const llmN={ask:0,ok:0,veto:0,fail:0,stale:0,drop:0,teto:0,fallback:0,conv:0,puxa:0};
  let llmInflight=()=>0,llmBreaker=()=>false;
  // ── quem entrou, e em QUE VERSÃO ──
  // A distribuição das versões declaradas no join é a única medida de quanta gente ainda joga numa build
  // antiga, e ela não existia: nenhum código de erro do WS era contado, e a recusa por versão acontecia no
  // NAVEGADOR do jogador, onde nada é reportado. `n/d` é o cliente que não declara nada (toda build
  // publicada até a v15). `versionRefused` conta quem ficou fora da faixa [PROTOCOL_MIN..PROTOCOL_VERSION].
  /** @type {Map<string,number>} */const proto=new Map();let joins=0,versionRefused=0;
  // ── PRODUTO: quanto tempo uma vida dura, e como ela acaba ──
  // Existe porque enxerga o que o BANCO não grava — banco fora, sessão `unsaved`, convidado sem
  // persistência —, e custa zero I/O. ⚠️ NÃO é fonte de decisão: é por POD, zera no restart e com N shards
  // cada um vê 1/N do tráfego. Quem responde "o jogador fica 3 minutos?" é a tela de retenção, que lê o
  // Postgres; isto aqui é sanidade, e serve para saber que uma queda no gráfico foi incidente de banco e
  // não fuga de jogador. Os baldes são locais (não são tunable de jogo): 180 s é a fronteira do pedido.
  const VIDA_BALDES=[15,30,60,120,180,300,600];
  const vidaN=new Float64Array(VIDA_BALDES.length+1);
  /** @type {Map<string,number>} */const vidaCausa=new Map();
  /** @type {Map<string,number>} */const vidaComo=new Map();
  let vidas=0,vidas3min=0,spawnOk=0,spawnRuim=0;
  const startedAt=Date.now();
  // janela de WIN s em baldes por segundo (bytes de saída, mensagens de entrada, e as ENTRADAS de jogador)
  // ⚠️ `jo` existe porque `joins.total` é CUMULATIVO desde o boot, e derivar a taxa no painel diferenciando
  // duas amostras dá NEGATIVO quando o pod reinicia e mente quando o HPA escala. O balde por segundo já
  // estava aqui; entrar nele é a única forma honesta de dizer "entradas por minuto".
  const secs=new Float64Array(WIN).fill(-1),bo=new Float64Array(WIN),mi=new Float64Array(WIN),jo=new Float64Array(WIN);
  const bucket=()=>{const s=Math.floor(Date.now()/1000),k=s%WIN;if(secs[k]!==s){secs[k]=s;bo[k]=0;mi[k]=0;jo[k]=0;}return k;};
  const rate=arr=>{const s=Math.floor(Date.now()/1000);let sum=0;for(let k=0;k<WIN;k++)if(secs[k]>s-WIN)sum+=arr[k];
    const span=Math.min(WIN,Math.max(1,(Date.now()-startedAt)/1000));return sum/span;};
  return{
    tick:ms=>tick.push(ms),lag:ms=>lag.push(ms),
    /** @param {number} [ms] quanto o laço estava atrasado quando desistiu de recuperar (ver Scheduler) */
    overrun:(ms=0)=>{overruns++;if(ms>0){atraso.push(ms);overrunUlt=ms;overrunAt=Date.now();if(ms>overrunMax)overrunMax=ms;}},
    bytesOut:n=>{bo[bucket()]+=n;bytesOutTotal+=n;},msgIn:()=>{mi[bucket()]++;msgsInTotal++;},rateLimitHit:()=>{rateLimitHits++;},
    /** @param {number|null} v versão declarada no join (null = o cliente não declarou) */
    join:v=>{joins++;jo[bucket()]++;const k=v==null?'n/d':String(v);proto.set(k,(proto.get(k)||0)+1);},
    versionRefused:()=>{versionRefused++;},
    /** @param {'ask'|'ok'|'veto'|'fail'|'stale'|'drop'|'teto'|'fallback'|'conv'|'puxa'} ev */
    llm:(ev,ms)=>{if(llmN[ev]!=null)llmN[ev]++;if(ms>=0&&(ev==='ok'||ev==='fail'))llmMs.push(ms);},
    /** O cliente do Ollama é criado depois das métricas; estes dois getters fecham o laço sem inverter a ordem. */
    llmSource:(inflight,breaker)=>{llmInflight=inflight;llmBreaker=breaker;},
    /** Uma vida acabou. Recebe o `summary` do MatchSession — inclusive o de quem não foi gravado. */
    vida(m){if(!m)return;const s=m.durationS|0;vidas++;if(s>=180)vidas3min++;
      let i=0;while(i<VIDA_BALDES.length&&s>=VIDA_BALDES[i])i++;vidaN[i]++;
      const c=m.cause||'?';vidaCausa.set(c,(vidaCausa.get(c)||0)+1);
      if(m.how)vidaComo.set(m.how,(vidaComo.get(m.how)||0)+1);},
    /** O `_farSpot` do nascimento achou lugar, ou desistiu e devolveu a última tentativa? (World._spawnPiece) */
    spawn(ok){if(ok)spawnOk++;else spawnRuim++;},
    get overruns(){return overruns;},get rateLimitHits(){return rateLimitHits;},get bytesOutTotal(){return bytesOutTotal;},get msgsInTotal(){return msgsInTotal;},
    /** {tick:{p50,p99,max,overruns},loopLagMs:{p50,p99},net:{outKBps,inMsgps,rateLimitHits}} */
    snapshot(){const t=tick.pct(),l=lag.pct();
      const m=llmMs.pct();
      const o=atraso.pct();
      return{tick:{p50:r3(t.p50),p99:r3(t.p99),max:r3(t.max),overruns},loopLagMs:{p50:r3(l.p50),p99:r3(l.p99)},
        // `atrasoMs` é o tamanho dos tropeços, em ms de simulação descartada. `ultimoHa` em segundos:
        // saber que o último foi há 4 s ou há 3 h é a diferença entre "está acontecendo agora" e
        // "aconteceu no boot".
        overrunMs:{p50:r3(o.p50),p99:r3(o.p99),max:r3(overrunMax),ultimo:r3(overrunUlt),
          ultimoHa:overrunAt?Math.round((Date.now()-overrunAt)/1000):null},
        net:{outKBps:r3(rate(bo)/1024),inMsgps:r3(rate(mi)),rateLimitHits},
        llm:{...llmN,p50:r3(m.p50),p99:r3(m.p99),inflight:llmInflight()|0,breaker:!!llmBreaker()},
        joins:{total:joins,refused:versionRefused,perMin:r3(rate(jo)*60),proto:Object.fromEntries(proto)},
        // ⚠️ POR POD e zerado no restart — sanidade, não medição (ver o bloco de produto lá em cima).
        vida:{total:vidas,acima3min:vidas3min,pct3min:vidas?r3(vidas3min/vidas):0,
          baldes:Object.fromEntries(VIDA_BALDES.map((b,i)=>[`<${b}s`,vidaN[i]]).concat([[`>=${VIDA_BALDES[VIDA_BALDES.length-1]}s`,vidaN[VIDA_BALDES.length]]])),
          causa:Object.fromEntries(vidaCausa),como:Object.fromEntries(vidaComo)},
        spawn:{ok:spawnOk,semLugar:spawnRuim}};},
  };
}

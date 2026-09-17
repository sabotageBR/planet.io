// ── MÉTRICAS: ring buffers (600 amostras) para tick/lag + contadores por segundo (bytes out, msgs in) ──
// @ts-check
import {monitorEventLoopDelay,PerformanceObserver,constants as PERF} from 'node:perf_hooks';
import v8 from 'node:v8';
import {criaLeitorCgroup} from './cgroup.js';
const N=600,WIN=10;
// ── DE QUEM É O ENGASGO (o bloco que transforma "o laço atrasou" em "POR QUE o laço atrasou") ──
// `ELD_RES`: resolução do monitor nativo de atraso do event loop — ele SOMA a própria resolução ao valor
// (medido: 20,17 ms com o laço ocioso), então ela é subtraída na saída. `ELD_JANELA_S`: o histograma é
// zerado a cada minuto, senão um pico do boot contamina o p99 para sempre (o `maxTotal` é quem não expira).
// `GAP_MS`: a partir de quanto um intervalo entre dois turnos do scheduler vira EVENTO (o normal é 16,7).
// `CONGELA_K`: a fração de CPU da thread principal abaixo da qual o intervalo foi PARADA, não trabalho.
// `LEITURA_MS`: o cgroup e o heap são lidos por timer, nunca por requisição e nunca no tick.
const ELD_RES=20,ELD_JANELA_S=60,GAP_MS=40,CONGELA_K=.5,LEITURA_MS=10000,GC_TOL_MS=150;
class Ring{
  constructor(n=N){this.buf=new Float64Array(n);this.n=0;this.i=0;}
  push(v){this.buf[this.i]=v;this.i=(this.i+1)%this.buf.length;if(this.n<this.buf.length)this.n++;}
  /** percentis por ordenação de uma cópia (só no /healthz) */
  pct(){if(!this.n)return{p50:0,p99:0,max:0};const a=this.buf.slice(0,this.n).sort();const q=p=>a[Math.min(a.length-1,Math.floor(p*a.length))];return{p50:q(.5),p99:q(.99),max:a[a.length-1]};}
}
const r3=v=>Math.round(v*1000)/1000;
const r1=v=>Math.round(v*10)/10;
/**
 * O classificador de turno, PURO: `wall` é o intervalo entre dois turnos que rodaram passos e `cpu` é o
 * quanto a THREAD PRINCIPAL gastou de CPU nesse intervalo. Wall alto com CPU baixa = o processo esteve
 * PARADO (cota do CFS, preempção, stop-the-world de outro processo); CPU alta = havia trabalho de verdade
 * (um passo caro, um GC na thread principal, um JSON gigante). São dois defeitos com consertos opostos —
 * um é de infra e o outro é de código —, e um contador de "overruns" não distingue um do outro.
 * ⚠️ Tem que ser a CPU da thread (`process.threadCpuUsage`), não a do processo: na parada por cota, quem
 * queimou a cota foram as threads AUXILIARES (GC paralelo, JIT), e a CPU do processo sai alta justamente
 * no intervalo em que a thread principal não andou.
 * @param {number} wallMs @param {number} cpuMs @returns {'congelado'|'trabalho'|null}
 */
export function classificaGap(wallMs,cpuMs){if(!(wallMs>=GAP_MS))return null;return cpuMs<CONGELA_K*wallMs?'congelado':'trabalho';}
/**
 * @param {{vivo?:boolean}} [o] `vivo:false` = sem observadores nem timers (teste de unidade, ferramenta de
 *   bancada). O padrão liga tudo: o custo é um histograma nativo, um callback por GC e uma leitura de 3
 *   arquivos a cada 10 s.
 */
export function createMetrics({vivo=true}={}){
  const tick=new Ring(),lag=new Ring();let overruns=0,rateLimitHits=0,rateDrops=0,rateKicks=0,bytesOutTotal=0,msgsInTotal=0;
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
  // ── atraso do event loop (nativo) ── pega o que o anel de 600 amostras do `lag` perde: o pico raro.
  let eld=null,eldMaxTotal=0,eldAnterior=null,eldIdade=0;
  // ── GC ── por tipo; os MAJORS ganham anel próprio porque são eles que se cruza com as paradas.
  const gcN={minor:{n:0,somaMs:0,maxMs:0},major:{n:0,somaMs:0,maxMs:0},incremental:{n:0,somaMs:0,maxMs:0},weakcb:{n:0,somaMs:0,maxMs:0}};
  /** @type {{t:number,dur:number}[]} */const majors=[];let majorAt=0,gcObs=null;
  // TODO GC recente (qualquer tipo), para dizer quanto de um turno lento foi coleta: num núcleo lento um
  // scavenge de semi-space de 16 MiB chega a 10–14 ms e um ciclo de marcação incremental soma vários deles.
  /** @type {{t:number,dur:number}[]} */const gcs=[];
  // ── paradas do laço ── anel de 64: a 1 evento a cada ~11 s (o medido) são 12 min de história.
  const laco={congelado:{n:0,somaMs:0,maxMs:0,at:0},trabalho:{n:0,somaMs:0,maxMs:0,at:0}};
  /** @type {{t:number,at:number,wall:number,cpu:number,tipo:string,passo:number}[]} */const gaps=[];
  // ── passos lentos de UMA sala (≥12 ms), com a fase que custou ──
  const lentos={n:0,maxMs:0};/** @type {any[]} */const lentosUlt=[];
  // ── cgroup + heap (lidos por timer) ──
  let cfs=null,cfsAnt=null,cfsDelta=0,cfsAt=0,heap=null,leitura=null,writerRot=0;
  const leitor=criaLeitorCgroup();
  const fechaJanelaEld=()=>{if(!eld)return;const mx=Math.max(0,eld.max/1e6-ELD_RES);if(mx>eldMaxTotal)eldMaxTotal=mx;
    eldAnterior={p50:r1(Math.max(0,eld.percentile(50)/1e6-ELD_RES)),p99:r1(Math.max(0,eld.percentile(99)/1e6-ELD_RES)),max:r1(mx)};eld.reset();eldIdade=0;};
  const leTudo=async()=>{
    try{const c=await leitor.le();if(c){if(cfsAnt){cfsDelta=c.throttled-cfsAnt.throttled;if(cfsDelta>0)cfsAt=Date.now();}cfsAnt=c;cfs=c;}}catch{}
    try{const h=v8.getHeapStatistics();let novo=0;for(const sp of v8.getHeapSpaceStatistics())if(sp.space_name==='new_space')novo=sp.space_size;
      heap={usadoMB:r1(h.used_heap_size/1048576),totalMB:r1(h.total_heap_size/1048576),limiteMB:Math.round(h.heap_size_limit/1048576),
        externoMB:r1(h.external_memory/1048576),novoMB:r1(novo/1048576),rssMB:Math.round(process.memoryUsage.rss()/1048576)};}catch{}
    eldIdade+=LEITURA_MS/1000;if(eldIdade>=ELD_JANELA_S)fechaJanelaEld();};
  if(vivo){
    try{eld=monitorEventLoopDelay({resolution:ELD_RES});eld.enable();}catch{eld=null;}
    try{gcObs=new PerformanceObserver(l=>{for(const e of l.getEntries()){const k=/** @type {any} */(e).detail?.kind;
        const b=k===PERF.NODE_PERFORMANCE_GC_MAJOR?gcN.major:k===PERF.NODE_PERFORMANCE_GC_MINOR?gcN.minor:k===PERF.NODE_PERFORMANCE_GC_INCREMENTAL?gcN.incremental:gcN.weakcb;
        b.n++;b.somaMs+=e.duration;if(e.duration>b.maxMs)b.maxMs=e.duration;
        gcs.push({t:e.startTime,dur:e.duration});if(gcs.length>128)gcs.shift();
        if(b===gcN.major){majors.push({t:e.startTime,dur:e.duration});if(majors.length>32)majors.shift();majorAt=Date.now();}}});
      gcObs.observe({entryTypes:['gc']});}catch{gcObs=null;}
    leitura=setInterval(()=>{leTudo();},LEITURA_MS);leitura.unref&&leitura.unref();leTudo();}
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
    /**
     * Um turno do scheduler chegou `wallMs` depois do anterior, e a thread principal gastou `cpuMs` de CPU
     * nesse meio (ver `classificaGap`). Chamado pelo `loop.js` só acima de `GAP_MS` — o caminho normal não
     * passa por aqui.
     */
    gap(wallMs,cpuMs,t=performance.now(),passoMs=0){const tipo=classificaGap(wallMs,cpuMs);if(!tipo)return null;
      const b=laco[tipo];b.n++;b.somaMs+=wallMs;if(wallMs>b.maxMs)b.maxMs=wallMs;b.at=Date.now();
      gaps.push({t,at:b.at,wall:wallMs,cpu:cpuMs,tipo,passo:passoMs});if(gaps.length>64)gaps.shift();return tipo;},
    /**
     * O passo de UMA sala passou do limiar (loop.js). `room._fase` diz onde: `sim` (cérebros + física +
     * eventos), `envio` (snapshots/placar/eventos por sessão) e o resto (zona, chegada de bots, fala).
     */
    passoLento(room,ms){lentos.n++;if(ms>lentos.maxMs)lentos.maxMs=ms;const f=room&&room._fase||{};
      lentosUlt.push({at:Date.now(),sala:room&&room.code,ms:r1(ms),sim:r1(f.sim||0),envio:r1(f.envio||0),fase:room&&room.phase,
        tick:room&&room.sim?room.sim.tick:0,humanos:room?room.humanCount:0,bots:room&&room.sim?room.sim.botCount():0});
      if(lentosUlt.length>8)lentosUlt.shift();},
    /** O writer de broadcast foi trocado por um novo de 32 KiB (havia socket com bytes pendentes). */
    writerRot:()=>{writerRot++;},
    /** Para os observadores e o timer. Idempotente; sem isto cada `startServer` de teste deixa um monitor ligado. */
    stop(){if(leitura){clearInterval(leitura);leitura=null;}if(gcObs){try{gcObs.disconnect();}catch{}gcObs=null;}if(eld){try{eld.disable();}catch{}eld=null;}},
    bytesOut:n=>{bo[bucket()]+=n;bytesOutTotal+=n;},msgIn:()=>{mi[bucket()]++;msgsInTotal++;},
    // ⚠️ `rateLimitHits` passou a contar RAJADAS (uma violação por segundo, no máximo — ver `Session.violation`),
    // não mensagens; o excedente da mesma rajada vai em `drops`, e `kicks` é quem de fato perdeu a conexão.
    rateLimitHit:()=>{rateLimitHits++;},rateDrop:()=>{rateDrops++;},rateKick:()=>{rateKicks++;},
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
      // ── as paradas, cruzadas com o GC major SÓ AQUI (no /healthz), nunca no caminho do laço ──
      const agoraP=performance.now(),agora=Date.now(),ha=at=>at?Math.round((agora-at)/1000):null;
      const noMin=tipo=>{let n=0;for(const g of gaps)if(g.tipo===tipo&&agoraP-g.t<=60000)n++;return n;};
      // o intervalo parado é [t−wall, t]; o GC major é [t, t+dur]. Tolerância dos dois lados: o observador
      // entrega a entrada DEPOIS do GC, e a cota estoura pelas threads auxiliares que continuam varrendo.
      let comGc=0;for(const g of gaps)if(g.tipo==='congelado'&&majors.some(j=>j.t<g.t+GC_TOL_MS&&j.t+j.dur>g.t-g.wall-GC_TOL_MS))comGc++;
      // quanto do intervalo [t−wall, t] foi GC na thread principal (soma das sobreposições)
      const gcNo=g=>{let s=0;const a=g.t-g.wall,z=g.t;for(const c of gcs){const i=Math.max(a,c.t),f=Math.min(z,c.t+c.dur);if(f>i)s+=f-i;}return s;};
      const lado=(b,tipo)=>({n:b.n,somaMs:Math.round(b.somaMs),maxMs:r1(b.maxMs),ultimoHa:ha(b.at),porMin:noMin(tipo)});
      const gcOut=k=>({n:gcN[k].n,somaMs:Math.round(gcN[k].somaMs),maxMs:r1(gcN[k].maxMs)});
      let majMin=0;for(const j of majors)if(agoraP-j.t<=60000)majMin++;
      return{tick:{p50:r3(t.p50),p99:r3(t.p99),max:r3(t.max),overruns},loopLagMs:{p50:r3(l.p50),p99:r3(l.p99)},
        // `atrasoMs` é o tamanho dos tropeços, em ms de simulação descartada. `ultimoHa` em segundos:
        // saber que o último foi há 4 s ou há 3 h é a diferença entre "está acontecendo agora" e
        // "aconteceu no boot".
        overrunMs:{p50:r3(o.p50),p99:r3(o.p99),max:r3(overrunMax),ultimo:r3(overrunUlt),
          ultimoHa:overrunAt?Math.round((Date.now()-overrunAt)/1000):null},
        // ── DE QUEM É O ENGASGO ── `laco.congelado` = o processo esteve PARADO (infra: cota de CPU,
        // preempção); `laco.trabalho` = a thread principal estava ocupada (código). `cfs.throttled` andando
        // é a prova de que a parada foi a cota. `eld` é o atraso do event loop visto pelo próprio Node.
        eld:eld?{p50:r1(Math.max(0,eld.percentile(50)/1e6-ELD_RES)),p99:r1(Math.max(0,eld.percentile(99)/1e6-ELD_RES)),max:r1(Math.max(0,eld.max/1e6-ELD_RES)),
          janelaS:eldIdade,anterior:eldAnterior,maxTotal:r1(Math.max(eldMaxTotal,eld.max/1e6-ELD_RES,0))}:null,
        gc:{minor:gcOut('minor'),major:{...gcOut('major'),ultimoHa:ha(majorAt),porMin:majMin},incremental:gcOut('incremental'),weakcb:gcOut('weakcb')},
        laco:{congelado:{...lado(laco.congelado,'congelado'),comGcMajor:comGc},trabalho:lado(laco.trabalho,'trabalho'),
          // `passo` = quanto do intervalo foi o passo das salas; o que sobra de `cpu` é trabalho FORA dele
          // `gc` = quanto dele foi coleta de lixo. O que sobra de `cpu − passo − gc` é trabalho de verdade fora do
          // passo (um join, uma sala nascendo, um JSON grande).
          ultimos:gaps.slice(-5).map(g=>({ha:Math.round((agora-g.at)/1000),wall:r1(g.wall),cpu:r1(g.cpu),passo:r1(g.passo||0),gc:r1(gcNo(g)),tipo:g.tipo})),
          passosLentos:{n:lentos.n,maxMs:r1(lentos.maxMs),ultimos:lentosUlt.slice(-5).map(l=>({...l,ha:Math.round((agora-l.at)/1000),at:undefined}))}},
        cfs:cfs?{cota:cfs.cota,periods:cfs.periods,throttled:cfs.throttled,throttledMs:cfs.throttledMs,throttled10s:cfsDelta,ultimoHa:ha(cfsAt)}:null,
        heap,writerRot,
        net:{outKBps:r3(rate(bo)/1024),inMsgps:r3(rate(mi)),rateLimitHits,rateDrops,rateKicks},
        llm:{...llmN,p50:r3(m.p50),p99:r3(m.p99),inflight:llmInflight()|0,breaker:!!llmBreaker()},
        joins:{total:joins,refused:versionRefused,perMin:r3(rate(jo)*60),proto:Object.fromEntries(proto)},
        // ⚠️ POR POD e zerado no restart — sanidade, não medição (ver o bloco de produto lá em cima).
        vida:{total:vidas,acima3min:vidas3min,pct3min:vidas?r3(vidas3min/vidas):0,
          baldes:Object.fromEntries(VIDA_BALDES.map((b,i)=>[`<${b}s`,vidaN[i]]).concat([[`>=${VIDA_BALDES[VIDA_BALDES.length-1]}s`,vidaN[VIDA_BALDES.length]]])),
          causa:Object.fromEntries(vidaCausa),como:Object.fromEntries(vidaComo)},
        spawn:{ok:spawnOk,semLugar:spawnRuim}};},
  };
}

// ── O ENGASGO FOI DA REDE OU DO FRAME? ────────────────────────────────────────────────────────────────
// `?stats` sempre disse o RTT e quantas vezes o buffer de interpolação secou, e `?perf` diz de que fase é o
// frame longo. O que nenhum dos dois dizia é a pergunta que um jogador faz: "isso que eu senti agora foi a
// minha máquina ou foi o servidor?". A resposta está num número só — o intervalo entre dois SNAPSHOTs
// consecutivos —, e ele nunca foi medido: o servidor manda um a cada 50 ms (3 ticks), então um buraco de
// 130 ms É o servidor (ou o caminho) parado, por mais liso que o frame esteja.
//
// ⚠️ SEMPRE LIGADO, e por isso NÃO ALOCA: roda a 20 Hz, em `Uint32Array`/`Float32Array` criados uma vez.
// Um medidor que só existisse com `?stats` na URL mediria a sessão em que ninguém reclamou.
// ⚠️ NÃO mede nada do frame — isso é o `perf.js`. Aqui só entra o que chega pelo fio e o que o netcode
// decidiu por causa disso (saltos de relógio, ressincronizações, teleportes). É a outra metade.
// ⚠️ PURO: nada de DOM, nada de `performance` por dentro (o `now` vem de quem chama). É o que deixa as
// faixas e os percentis serem conferidos em tabela por `client/test/netstat.test.js`.

/** Limites das faixas do histograma de Δt entre snapshots, em ms. O esperado é 50. */
export const FAIXAS=[67,83,120,200,500];
const ANEL=1200;   // 60 s de snapshots a 20 Hz: a janela dos percentis

/**
 * Percentil de um anel de amostras (copia e ordena — só quando o overlay vai escrever, a 4 Hz).
 * @param {Float32Array} anel @param {number} n quantas posições estão preenchidas @param {number[]} qs
 */
export function percentis(anel,n,qs){
  if(!n)return qs.map(()=>0);
  const a=Array.from(anel.subarray(0,n)).sort((x,y)=>x-y);
  return qs.map(q=>a[Math.min(a.length-1,Math.floor(q*a.length))]);}

/**
 * De quem foi o buraco. Um snapshot que "atrasou" porque a PRÓPRIA aba ficou 200 ms sem rodar JS não é
 * atraso de rede: os pacotes estavam na fila do navegador, e são entregues em rajada quando o frame longo
 * acaba. `bloqueioLocalMs` é o maior frame (ou long task) que cobriu o intervalo.
 * @param {number} gapMs @param {number} bloqueioLocalMs @returns {'rede'|'local'}
 */
export function classifica(gapMs,bloqueioLocalMs){return bloqueioLocalMs>=gapMs*.6?"local":"rede";}

/** O medidor desligado (pacote de portal: "remove debug code" é requisito escrito, e lá ninguém o lê). */
export const NETSTAT_INERTE={snap(){},frame(){},bloqueio(){},recomeca(){},relogioSnap(){},desvio(){},resync(){},snapDistou(){},extrapPop(){},evento(){},zera(){},foto(){return null;},texto(){return"";}};

export function criaNetstat(){
  const hist=new Uint32Array(FAIXAS.length+1),anel=new Float32Array(ANEL);
  let i=0,n=0,ultimo=0,ultimoTick=-1,total=0,max=0,rajadas=0,saltosTick=0,noFrame=0,maxNoFrame=0;
  let relogioSnaps=0,desvioMax=0,resyncs=0,resyncTarde=0,snapDist=0,snapDistMax=0,popMax=0,pops=0;
  let piorLocal=0;   // o maior bloqueio local desde o snapshot anterior (frame ou long task)
  /** @type {{tipo:string,ms:number,at:number,detalhe:string}[]} */const eventos=[];
  const evento=(tipo,ms,at,detalhe="")=>{eventos.push({tipo,ms:Math.round(ms),at,detalhe});if(eventos.length>8)eventos.shift();};
  const s={
    /** Chegou um SNAPSHOT (`now` = performance.now() de quem chama; `tick` = o do servidor). */
    snap(now,tick){
      if(ultimo){const dt=now-ultimo;let f=0;while(f<FAIXAS.length&&dt>FAIXAS[f])f++;hist[f]++;total++;
        anel[i]=dt;i=(i+1)%ANEL;if(n<ANEL)n++;if(dt>max)max=dt;
        if(dt<8)rajadas++;
        if(dt>FAIXAS[1])evento(classifica(dt,piorLocal)==="local"?"REDE?(aba parada)":"REDE",dt,now);
        if(ultimoTick>=0&&tick-ultimoTick>3)saltosTick++;}
      ultimo=now;ultimoTick=tick;noFrame++;piorLocal=0;},
    /** Fecha um frame: quantos snapshots chegaram desde o anterior (rajada = a aba ou a rede represou). */
    frame(frameMs){if(noFrame>maxNoFrame)maxNoFrame=noFrame;noFrame=0;if(frameMs>piorLocal)piorLocal=frameMs;},
    /** Um bloqueio local que NÃO é frame (long task entre dois rAF). */
    bloqueio(ms){if(ms>piorLocal)piorLocal=ms;},
    /** Sala nova / resume: o relógio de snapshot recomeça, e o intervalo até o 1º não é um buraco. */
    recomeca(){ultimo=0;ultimoTick=-1;noFrame=0;piorLocal=0;},
    relogioSnap(dTicks){relogioSnaps++;},
    desvio(dTicks){const a=Math.abs(dTicks);if(a>desvioMax)desvioMax=a;},
    resync(tarde){resyncs++;if(tarde)resyncTarde++;},
    snapDistou(px){snapDist++;if(px>snapDistMax)snapDistMax=px;},
    extrapPop(px){pops++;if(px>popMax)popMax=px;},
    evento,
    zera(){hist.fill(0);i=n=total=0;max=0;rajadas=saltosTick=maxNoFrame=0;relogioSnaps=0;desvioMax=0;resyncs=resyncTarde=0;snapDist=0;snapDistMax=0;popMax=0;pops=0;eventos.length=0;},
    /** Foto para o overlay e para o `__warspace.net()`. Aloca — só no frame em que o texto vai para o DOM. */
    foto(){const [p50,p95,p99]=percentis(anel,n,[.5,.95,.99]);
      // acima de FAIXAS[k] = soma das faixas k+1 em diante
      const acima=k=>{let t=0;for(let f=k+1;f<hist.length;f++)t+=hist[f];return t;};
      return{total,p50,p95,p99,max,acima83:acima(1),acima120:acima(2),acima200:acima(3),rajadas,saltosTick,maxNoFrame,
        relogioSnaps,desvioMax,resyncs,resyncTarde,snapDist,snapDistMax,pops,popMax,eventos:eventos.slice()};},
    /** As duas linhas do `?stats`. `now` para o "há N s". */
    texto(now){const f=s.foto();
      const ult=f.eventos.slice(-3).reverse().map(e=>`${e.tipo} ${e.ms} ms${e.detalhe?` (${e.detalhe})`:""} há ${Math.max(0,Math.round((now-e.at)/1000))} s`).join(" · ");
      return`Δsnap p50 ${f.p50.toFixed(0)} · p99 ${f.p99.toFixed(0)} · máx ${f.max.toFixed(0)} ms · >83:${f.acima83} >120:${f.acima120} >200:${f.acima200} · rajadas ${f.rajadas} (${f.maxNoFrame}/frame) · relógio snap ${f.relogioSnaps} desvio ±${f.desvioMax.toFixed(1)} tk · resync ${f.resyncs} (por atraso ${f.resyncTarde}) · SNAP_DIST ${f.snapDist} · pop ${f.popMax.toFixed(0)} px`+
        (ult?`\núltimos: ${ult}`:"");},
  };
  return s;}

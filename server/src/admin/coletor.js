// ── COLETOR: junta os anéis dos 24 pods e vira UM stream SSE para o painel ────
// O `/api` do Ingress é balanceado, então o SSE do navegador gruda num pod qualquer — e é ELE que passa a
// perguntar aos 23 irmãos "o que aconteceu depois do seq N" (`/internal/admin/live`), a cada
// ADMIN_BUS.FANIN_MS. Nenhum shard sabe quem tem o stream aberto; o desenho é PULL, e por isso não há
// registro distribuído a manter.
//
// ⚠️ O LAÇO É POR POD, NÃO POR STREAM. Um timer e um conjunto de 23 requisições por segundo, COMPARTILHADO
// por todos os SSE deste pod. É isso que faz dez abas de F5 custarem O(1) em vez de O(abas) — a defesa
// principal contra abuso é estrutural, não é o rate limit.
//
// ⚠️ O COLETOR TEM ANEL PRÓPRIO (`historico`), e é ele que atende a RECONEXÃO. Sem isso, um cliente que
// volta de um rollout de 3 s ou perderia tudo o que passou, ou obrigaria a uma segunda rodada de fan-out
// só para ele. Com o anel, a retomada é local e instantânea; o que não couber nele vira um CORTE que o
// painel imprime, nunca um buraco silencioso.
// @ts-check
import {ADMIN_BUS} from '@warspace/shared/constants.js';
import {tellPeers} from '../http/peers.js';

/** Chave de deduplicação e de ordem dentro de um shard. */
const chave=e=>`${e.shard}:${e.seq}`;

/**
 * @param {{config:any,rooms:any,bus:any,metrics:any,log:any}} o
 */
export function createColetor({config,rooms,bus,metrics,log}){
  /** @type {Set<any>} respostas HTTP com o stream aberto */const clientes=new Set();
  /** @type {Map<number,{seq:number,epoch:number}>} onde cada shard parou */const cursores=new Map();
  /** @type {Map<string,number>} peer → shard, aprendido na 1ª resposta dele */const shardDoPeer=new Map();
  /** @type {any[]} anel agregado, para a retomada de quem reconecta */let historico=[];
  /** @type {any[]} saúde de cada irmão na última coleta (o `24/24` do painel) */let saude=[];
  let timer=null,timerKpi=null,timerPing=null,coletando=false,auth=null;
  let seqSaida=0;   // numeração do STREAM, o que vira `id:` do SSE

  const cursor=s=>cursores.get(s)||{seq:0,epoch:0};

  /** Escreve um frame SSE em todos os clientes; quem falhar sai da lista (socket morto). */
  function emite(evento,dados,id){
    if(!clientes.size)return;
    const txt=`${id?`id: ${id}\n`:''}event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
    for(const res of [...clientes]){
      try{res.write(txt);}catch(e){clientes.delete(res);try{res.end();}catch{}}}
  }

  /** Guarda no anel agregado o que acabou de sair, para quem reconectar em seguida. */
  function guarda(ev){
    if(!ev.length)return;
    historico=historico.concat(ev);
    if(historico.length>ADMIN_BUS.RING)historico=historico.slice(historico.length-ADMIN_BUS.RING);
  }

  /**
   * Uma volta do fan-in: o próprio pod + os 23 irmãos, cada um a partir do cursor DELE.
   * ⚠️ Reentrância barrada por `coletando`: com peers lentos (o timeout é de 1200 ms) duas voltas se
   * sobreporiam e o mesmo evento sairia duas vezes com `seq` do stream diferente — ou seja, duplicata que
   * a deduplicação do cliente NÃO pega, porque ela é por `(shard,seq)` de origem.
   */
  async function coleta(){
    if(coletando||!clientes.size)return;
    coletando=true;
    try{
      /** @type {any[]} */const lote=[];
      const marca=(shard,r)=>{
        if(!r)return;
        // ⚠️ `+r.epoch` e NUNCA `r.epoch|0`: o epoch é um `Date.now()`, que passa de 2³¹ desde 1970 —
        // `|0` o TRUNCA para 32 bits com sinal e o cursor guarda um número que nunca mais bate com o do
        // pod. Resultado medido antes do conserto: `perdidos:-1` ("este shard reiniciou") em TODA coleta,
        // uma vez por segundo, num pod que não tinha reiniciado nenhuma vez.
        cursores.set(shard,{seq:r.seq|0,epoch:+r.epoch||0});
        if(r.perdidos)lote.push({shard,kind:'lacuna',at:Date.now(),n:r.perdidos,seq:r.seq|0});
        for(const e of r.ev||[])lote.push(e);};

      // O pod local não passa por HTTP: ele É o coletor.
      const meu=cursor(config.shard);
      marca(config.shard,bus.desde(meu.seq,meu.epoch||undefined));

      if(config.peers.length){
        const rs=await tellPeers(config.peers,{method:'GET',auth,log,
          // ⚠️ path por PEER: cada irmão é perguntado a partir do cursor dele (ver peers.js).
          path:p=>{const s=shardDoPeer.get(p);const c=s==null?{seq:0,epoch:0}:cursor(s);
            return `/internal/admin/live?since=${c.seq}&epoch=${c.epoch}`;}});
        saude=rs.map(r=>({shard:r.body&&r.body.shard,peer:r.peer,ok:!r.error&&r.status===200}));
        for(const r of rs){
          const b=r.body;
          if(!b||typeof b.shard!=='number')continue;
          shardDoPeer.set(r.peer,b.shard);
          marca(b.shard,b);}}
      else saude=[];

      if(!lote.length)return;
      // ⚠️ ORDENAR POR `at` ENTRE SHARDS FARIA O FLUXO ANDAR PARA TRÁS: os relógios dos 24 pods não são
      // sincronizados o bastante, e uma linha do shard 7 apareceria acima de uma do shard 2 que aconteceu
      // depois. A ordem garantida é: TOTAL dentro de um shard, arbitrária entre shards dentro da janela de
      // 1 s — e isso vai declarado no payload, em vez de fingir uma precisão que não existe.
      guarda(lote);
      emite('ev',lote,String(++seqSaida));
    }catch(e){if(log)log.warn('coletor: falha na coleta:',e&&e.message);}
    finally{coletando=false;}
  }

  /**
   * KPI do CLUSTER. Cadência própria (3 s) e não junto dos eventos, porque `metrics.snapshot()` chama
   * `Ring.pct()`, que ORDENA uma cópia de 600 floats três vezes — o comentário de metrics.js:7 diz que
   * isso é "só no /healthz". A 1/3 Hz continua irrelevante; a 1 Hz × 24 pods seria desperdício puro.
   */
  async function kpis(){
    if(!clientes.size)return;
    const meu=local();
    const fragmentos=[meu];
    if(config.peers.length){
      const rs=await tellPeers(config.peers,{path:'/internal/admin/kpis',method:'GET',auth,log});
      saude=rs.map(r=>({shard:r.body&&r.body.shard,peer:r.peer,ok:!r.error&&r.status===200}));
      for(const r of rs)if(r.body&&typeof r.body.shard==='number')fragmentos.push(r.body);}
    emite('kpi',agrega(fragmentos));
  }

  /** O fragmento de KPI DESTE pod. Mesma forma que `/internal/admin/kpis` devolve. */
  function local(){
    const m=metrics?metrics.snapshot():null;
    let salas=0,humanos=0,bots=0;
    /** @type {any[]} */const lista=[];
    if(rooms){for(const r of rooms.rooms.values()){
      salas++;humanos+=r.humanCount;bots+=r.sim.botCount();
      lista.push({code:r.code,shard:r.shard,mode:r.modeId,phase:r.phase,
        humans:r.humanCount,bots:r.sim.botCount(),restam:r.roundLeft()});}}
    return{shard:config.shard,bootAt:bus.epoch,salas,humanos,bots,lista,
      tickP99:m?m.tick.p99:0,tickP50:m?m.tick.p50:0,overruns:m?m.tick.overruns:0,
      kbps:m?m.net.outKBps:0,joinsMin:m&&m.joins?m.joins.perMin||0:0,
      llmOk:!(m&&m.llm&&m.llm.breaker),llmMs:m&&m.llm?m.llm.p50:0};
  }

  /**
   * Junta os fragmentos num painel só.
   * ⚠️ PERCENTIL NÃO SOMA E NÃO TIRA MÉDIA. A média de 24 p99 não é o p99 de nada — o que interessa ao
   * operador é o PIOR shard, porque é nele que alguém está jogando mal e é nele que ele vai agir. Por isso
   * o campo se chama `tickPior` e leva o número do shard junto, em vez de um número anônimo.
   * ⚠️ `joinsMin` e `kbps` são TAXAS, então somam. `bootAt` viaja por fragmento porque um pod que o HPA
   * acabou de subir arrasta qualquer cumulativo para baixo — o painel esmaece o shard mais novo que a janela.
   */
  function agrega(fs){
    let salas=0,humanos=0,bots=0,kbps=0,joinsMin=0,overruns=0,pior={shard:-1,ms:0},llmRuins=0;
    /** @type {any[]} */let lista=[];
    for(const f of fs){
      salas+=f.salas|0;humanos+=f.humanos|0;bots+=f.bots|0;
      kbps+=+f.kbps||0;joinsMin+=+f.joinsMin||0;overruns+=f.overruns|0;
      if((+f.tickP99||0)>pior.ms)pior={shard:f.shard,ms:+f.tickP99||0};
      if(f.llmOk===false)llmRuins++;
      if(Array.isArray(f.lista))lista=lista.concat(f.lista);}
    const vivos=1+saude.filter(s=>s.ok).length;
    return{at:Date.now(),online:humanos,salas,bots,joinsMin:Math.round(joinsMin),
      tickPior:pior,overruns,mbps:+(kbps/1024).toFixed(2),
      shardsOk:vivos,shardsTot:1+saude.length,llmRuins,
      shards:[{shard:config.shard,ok:true},...saude],
      salasLista:lista};
  }

  return{
    clientes,
    /**
     * Liga um stream. `since` é o mapa `shard:seq:epoch` que o cliente trouxe (vazio na estreia).
     * ⚠️ A retomada sai do anel LOCAL do coletor, sem uma segunda rodada de fan-out. Se o cliente pediu
     * algo mais velho que o anel, ele recebe o que há MAIS um evento `corte` — porque uma lista de eventos
     * com um buraco invisível leva a "não houve denúncia nenhuma nessa hora".
     */
    liga(res,{since=null,authorization=null}={}){
      auth=authorization||auth;
      clientes.add(res);
      if(since&&since.size){
        const atras=historico.filter(e=>{const c=since.get(e.shard);
          return !c||c.epoch!==(cursor(e.shard).epoch)||e.seq>c.seq;});
        const faltou=historico.length>=ADMIN_BUS.RING;
        if(faltou)atras.unshift({shard:-1,kind:'corte',at:Date.now()});
        if(atras.length)try{res.write(`event: ev\ndata: ${JSON.stringify(atras)}\n\n`);}catch{}
      }
      if(clientes.size===1){
        timer=setInterval(coleta,ADMIN_BUS.FANIN_MS);
        timerKpi=setInterval(()=>{kpis().catch(()=>{});},ADMIN_BUS.KPI_MS);
        // Heartbeat: comentário SSE, que não vira evento mas VIRA BYTES — é o que faz o cão de guarda do
        // cliente distinguir "noite calma" de "stream morto". E é aqui que se descobre socket zumbi.
        timerPing=setInterval(()=>{for(const r of [...clientes]){
          try{r.write(': ping\n\n');}catch{clientes.delete(r);}}},ADMIN_BUS.PING_MS);
        // `unref` nos três: o servidor HTTP já segura o event loop, então eles rodam do mesmo jeito — e
        // um teste que esqueça de fechar o stream não fica pendurado por causa do painel.
        for(const t of [timer,timerKpi,timerPing])if(t&&t.unref)t.unref();
      }
      kpis().catch(()=>{});   // a primeira pintura não espera 3 s
    },
    /**
     * ⚠️ PARAR OS TIMERS NO ÚLTIMO CLIENTE é obrigatório: sem isso o pod segue batendo em 23 irmãos para
     * sempre depois que o admin fechou a aba — um vazamento que só apareceria no access log dos OUTROS pods.
     */
    desliga(res){
      clientes.delete(res);
      if(!clientes.size){
        clearInterval(timer);clearInterval(timerKpi);clearInterval(timerPing);
        timer=timerKpi=timerPing=null;}
    },
    /** O fragmento deste pod, para a rota `/internal/admin/kpis`. */
    fragmento:local,
    stop(){for(const r of [...clientes])try{r.end();}catch{}
      clientes.clear();clearInterval(timer);clearInterval(timerKpi);clearInterval(timerPing);},
  };
}

/** `"0:12:1699,3:4:1700"` → Map<shard,{seq,epoch}>. Formato compacto porque ele viaja numa query string. */
export function leCursor(s){
  /** @type {Map<number,{seq:number,epoch:number}>} */const m=new Map();
  for(const parte of String(s||'').split(',')){
    const [a,b,c]=parte.split(':');
    if(a==='')continue;
    const shard=+a;if(!Number.isInteger(shard)||shard<0)continue;
    m.set(shard,{seq:+b||0,epoch:+c||0});}
  return m;
}

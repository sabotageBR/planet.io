// ── ?perf — DE QUEM É O FRAME LONGO ──────────────────────────────────────────────────────────────
// O `?stats` responde "o frame demorou?" (`createFrameStats` em bench.js guarda dois números por frame:
// lógica e render). Ele nunca respondeu "demorou POR QUÊ?", e é essa a pergunta de um ENGASGO — um frame
// isolado de dezenas de milissegundos no meio de sessenta frames de 3 ms. A média não o vê, o p95 mal o
// vê, e o Performance do Chrome o vê mas não sabe os nomes que a gente usa.
//
// Aqui o frame é dividido em FASES nomeadas e só os frames RUINS são guardados, inteiros. O relatório
// sai ordenado por quanto cada fase contribuiu para eles.
//
// ⚠️ **DESLIGADO, É QUASE LITERALMENTE NADA**: `ini`/`fim` viram funções vazias e o laço não paga
// `performance.now()` nem escrita em objeto. Por isso as chamadas podem morar em caminhos de render sem
// precisar de um `if` em volta de cada uma. O que NÃO pode é entrar em laço POR ENTIDADE: instrumentar
// `cache.get` inteiro mediria 200 chamadas por frame para achar as 2 que assam. Instrumenta-se o MISS.
// ⚠️ **E ele não existe no pacote de portal**, pelo mesmo motivo de `?stats` e `?bench`: "remove
// development tools and debug code" é requisito escrito da Poki. `PORTAL` é literal de `define`, então
// o Rollup dobra a comparação e poda.
// ⚠️ **A ALOCAÇÃO É SÓ NO FRAME RUIM.** Uma das suspeitas do engasgo é justamente pressão de GC, e um
// medidor que alocasse um objeto por frame estaria fabricando o fenômeno que veio medir. O acumulador
// é UM objeto reusado; a cópia só acontece quando o frame passa do limiar.
import {qflag} from "./util.js";
import {PORTAL} from "../portal/flags.js";

export const isPerf=()=>!PORTAL&&qflag("perf");
/**
 * O MEDIDOR DESLIGADO, como CONSTANTE de módulo — e ele existe separado por causa da PODA.
 *
 * ⚠️ `export const perf=criaPerf(isPerf())` era uma CHAMADA, e uma chamada o Rollup tem que manter: o
 * corpo inteiro de `criaPerf` — com as strings do relatório — ia parar no zip do portal, apesar de
 * `isPerf()` dobrar para `false` ali. Medido com `grep` no bundle, que é como o `portal-pack.mjs`
 * confere as outras podas. Com o ternário sobre `PORTAL`, que é literal de `define`, o compilado do
 * portal vira `perf = INERTE` e `criaPerf`/`resumo` ficam sem referência, ou seja saem.
 * ⚠️ Os `perf.ini("nome")` espalhados FICAM, e é o certo: são chamadas de método num objeto vazio, do
 * tamanho do rótulo. Podá-las exigiria um `if` em volta de cada uma, que é justamente o que este
 * arquivo existe para evitar.
 */
// ⚠️ TODO MÉTODO NOVO DO MEDIDOR ENTRA AQUI TAMBÉM (há teste de paridade das chaves): é este objeto que roda
// em produção sem `?perf`, e um método ausente vira `TypeError` dentro do laço de render.
const INERTE={ativo:false,abre(){},ini(){},fim(){},nota(){},frame(){},relatorio(){return"";},reset(){},longas(){return[];}};
/** Acima disto o frame é "ruim" e vai para a amostra (ms). 16,7 = um quadro a 60 Hz. */
export const LIMIAR_MS=17;
/** Quantos frames ruins guardar (os piores; o resto é descartado na inserção). */
export const AMOSTRA=40;

/**
 * O FRAME FOI RUIM PELO INTERVALO, e não pelo custo? PURA. `dt` é o tempo entre dois rAF e `base` é a média
 * móvel dele (60 Hz → 16,7; 144 Hz → 6,9; 30 Hz → 33). Um frame que custou 3 ms mas chegou 70 ms depois do
 * anterior É um engasgo — só que o culpado mora FORA do frame: o processamento de uma rajada de snapshots,
 * o React do HUD, uma instalação de fonte, o GC. Era exatamente essa metade que o `?perf` não via.
 * @param {number} dt @param {number} base
 */
export const ehBuraco=(dt,base)=>dt>=Math.max(25,1.6*base);
/**
 * Resume uma entrada de `long-animation-frame` (ou `longtask`) para o relatório, PURA.
 * @param {any} e PerformanceEntry @returns {{ms:number,bloqueio:number,scripts:{quem:string,ms:number,layout:number}[]}}
 */
export function resumeLoaf(e){
  const scripts=(e.scripts||[]).map(s=>({quem:String(s.invoker||s.name||s.sourceFunctionName||"?").slice(0,80),ms:Math.round(s.duration||0),layout:Math.round(s.forcedStyleAndLayoutDuration||0)}))
    .sort((a,b)=>b.ms-a.ms).slice(0,3);
  return{ms:Math.round(e.duration||0),bloqueio:Math.round(e.blockingDuration||0),scripts};}

/**
 * O RELATÓRIO, e ele é PURO — é o que dá para conferir em tabela, no molde de `game/quality.js`.
 *
 * Recebe as amostras (cada uma `{ms, fases:{nome:ms}}`) e devolve as fases ordenadas por tempo TOTAL
 * gasto nos frames ruins, com quantas vezes cada uma apareceu e o pior caso individual dela.
 * ⚠️ Ordena por `total` e não por `pior`: um bake de 9 ms que acontece três vezes por segundo é um
 * problema maior que um de 40 ms que acontece na virada de tema, e é o total que separa os dois.
 * @param {{ms:number,fases:Record<string,number>}[]} amostras
 * @returns {{nome:string,total:number,n:number,pior:number}[]}
 */
export function resumo(amostras){
  const m=new Map();
  for(const a of amostras)for(const nome in a.fases){
    const v=a.fases[nome],e=m.get(nome);
    if(e){e.total+=v;e.n++;if(v>e.pior)e.pior=v;}
    else m.set(nome,{nome,total:v,n:1,pior:v});}
  return [...m.values()].sort((a,b)=>b.total-a.total);}

/**
 * O gravador. `ini(nome)` … `fim(nome)` em volta do que se suspeita; `frame(ms)` fecha o quadro.
 *
 * ⚠️ `ini`/`fim` toleram aninhamento do MESMO nome? Não — e de propósito: um par desbalanceado é um bug
 * de instrumentação, e somar tempo em cima de si mesmo esconderia exatamente o frame que se procura. O
 * `fim` sem `ini` correspondente é ignorado.
 *
 * ⚠️ **AS FASES SE ANINHAM, E POR ISSO SÓ AS DE TOPO ENTRAM NA CONTA DO "(não medido)".** `assaTextura`,
 * `assaAtlas`, `bakeBorder`, `assaCeu` e `despejo` acontecem DENTRO de `render` — somar todas daria mais
 * que o frame inteiro e a linha do não medido sairia NEGATIVA, que é pior que não existir. Cada fase
 * continua aparecendo na tabela com o tempo dela (é a informação que se quer: quanto do render foi
 * bake); o que muda é que as aninhadas não são contadas duas vezes no resto. O nível é medido na
 * ABERTURA — quantas estavam abertas naquele instante —, e não por nome, para não precisar de uma lista
 * de "quem está dentro de quem" que envelheceria na primeira fase nova.
 * @param {boolean} [ativo]
 */
export function criaPerf(ativo=false,{agora=()=>performance.now(),observa=true}={}){
  if(!ativo)return INERTE;
  const abertos=new Map(),fases=Object.create(null),fora=Object.create(null),amostras=[],longas=[];
  let frames=0,ruins=0,buracos=0,topo=0,noFrame=false,base=16.7;
  // ── TAREFAS LONGAS DO NAVEGADOR (Chrome) ── o que bloqueou a thread ENTRE dois frames, com o script culpado.
  // `long-animation-frame` diz QUEM (invoker + layout forçado); `longtask` só diz quanto. Só existe com o
  // medidor ligado, então não custa nada em produção.
  if(observa&&typeof PerformanceObserver==="function"){try{
    const tipos=PerformanceObserver.supportedEntryTypes||[],tipo=tipos.includes("long-animation-frame")?"long-animation-frame":tipos.includes("longtask")?"longtask":null;
    if(tipo)new PerformanceObserver(l=>{for(const e of l.getEntries()){if((e.duration||0)<50)continue;
      longas.push(resumeLoaf(e));if(longas.length>10){longas.sort((a,b)=>b.ms-a.ms);longas.length=10;}}}).observe({type:tipo,buffered:true});}catch{}}
  return{
    ativo:true,
    /** Topo do frame. Fase aberta FORA daqui (um `onmessage`, um `setTheme` vindo de evento) é contada à parte. */
    abre(){noFrame=true;},
    ini(nome){abertos.set(nome,{t0:agora(),nivel:abertos.size,fora:!noFrame});},
    fim(nome){const e=abertos.get(nome);if(e===undefined)return;abertos.delete(nome);
      const d=agora()-e.t0;
      // ⚠️ FORA do frame não entra em `fases` nem em `topo`: senão a linha "(não medido)" do frame SEGUINTE
      // sairia negativa — o tempo foi gasto, mas não DENTRO do quadro que o `ms` mede.
      if(e.fora){fora[nome]=(fora[nome]||0)+d;return;}
      fases[nome]=(fases[nome]||0)+d;
      if(e.nivel===0)topo+=d;},
    /** Uma duração já medida por outro caminho (ex.: o React do HUD), sempre contada como FORA do frame. */
    nota(nome,ms){fora[nome]=(fora[nome]||0)+ms;},
    /**
     * Fecha o quadro. `ms` é o custo REAL dele (o mesmo número que `fstats` recebe); `dt` é o intervalo desde o
     * rAF anterior, SEM teto — é ele que acusa o engasgo cujo custo não está dentro do frame.
     */
    frame(ms,dt=0){
      frames++;noFrame=false;
      const buraco=dt>0&&ehBuraco(dt,base);if(dt>0&&!buraco)base=base*.95+dt*.05;   // o buraco não contamina a média
      if(ms>=LIMIAR_MS||buraco){
        ruins++;if(buraco&&ms<LIMIAR_MS)buracos++;
        // cópia só aqui — ver o aviso do cabeçalho sobre GC
        const copia={};
        for(const k in fases)copia[k]=Math.round(fases[k]*100)/100;
        copia["(não medido)"]=Math.round((ms-topo)*100)/100;   // `topo`, não a soma: ver o aviso do aninhamento
        let somaFora=0;for(const k in fora){copia["fora:"+k]=Math.round(fora[k]*100)/100;somaFora+=fora[k];}
        // o que sobra do INTERVALO depois do frame e do que foi medido fora dele: GC, GPU, o navegador, outra aba
        if(buraco)copia["(entre frames, sem nome)"]=Math.max(0,Math.round((dt-ms-somaFora)*100)/100);
        amostras.push({ms:Math.round(Math.max(ms,buraco?dt:0)*100)/100,fases:copia});
        // guarda os PIORES, não os primeiros: um engasgo que só aparece depois de dez minutos de
        // partida nunca caberia numa janela que enche e para de aceitar.
        if(amostras.length>AMOSTRA){amostras.sort((a,b)=>b.ms-a.ms);amostras.length=AMOSTRA;}}
      for(const k in fases)delete fases[k];for(const k in fora)delete fora[k];
      abertos.clear();topo=0;},
    reset(){amostras.length=0;longas.length=0;frames=0;ruins=0;buracos=0;topo=0;for(const k in fases)delete fases[k];for(const k in fora)delete fora[k];abertos.clear();},
    /** As piores tarefas longas vistas pelo navegador (Chrome). */
    longas(){return longas.slice().sort((a,b)=>b.ms-a.ms);},
    /** Texto para o console — a saída que se copia e cola num relato de bug. */
    relatorio(){
      const linhas=[`?perf · ${frames} frames · ${ruins} ruins (${(ruins/(frames||1)*100).toFixed(1)}%): ${ruins-buracos} acima de ${LIMIAR_MS} ms de custo + ${buracos} BURACOS (frame barato que chegou atrasado — o culpado está FORA dele)`];
      const piores=[...amostras].sort((a,b)=>b.ms-a.ms).slice(0,5);
      if(piores.length)linhas.push("piores: "+piores.map(a=>a.ms+" ms").join(" · "));
      for(const f of resumo(amostras))
        linhas.push(`  ${f.nome.padEnd(26)} total ${f.total.toFixed(1)} ms · ${f.n}× · pior ${f.pior.toFixed(1)} ms`);
      if(longas.length){linhas.push("tarefas longas do navegador (as piores):");
        for(const l of longas.slice().sort((a,b)=>b.ms-a.ms).slice(0,5))
          linhas.push(`  ${String(l.ms).padStart(4)} ms (bloqueio ${l.bloqueio})  ${l.scripts.map(s=>`${s.quem} ${s.ms} ms${s.layout?` [layout forçado ${s.layout}]`:""}`).join(" · ")||"—"}`);}
      return linhas.join("\n");},
  };}

/**
 * A INSTÂNCIA ÚNICA, no molde de `Q`/`qflag`: quem instrumenta importa isto e chama, sem receber nada
 * por parâmetro nem carregar um objeto por seis camadas de render até a folha que interessa.
 * ⚠️ Módulo, e não estado do `createGame`: as camadas de render (`renderer/layers/*`) e o `TextureCache`
 * não conhecem o jogo, e passar o medidor até lá seria mudar a assinatura de todas elas para medir.
 */
export const perf=PORTAL?INERTE:criaPerf(isPerf());

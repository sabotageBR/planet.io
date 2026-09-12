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
const INERTE={ativo:false,ini(){},fim(){},frame(){},relatorio(){return"";},reset(){}};
/** Acima disto o frame é "ruim" e vai para a amostra (ms). 16,7 = um quadro a 60 Hz. */
export const LIMIAR_MS=17;
/** Quantos frames ruins guardar (os piores; o resto é descartado na inserção). */
export const AMOSTRA=40;

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
export function criaPerf(ativo=false){
  if(!ativo)return INERTE;
  const abertos=new Map(),fases=Object.create(null),amostras=[];
  let frames=0,ruins=0,topo=0;
  return{
    ativo:true,
    ini(nome){abertos.set(nome,{t0:performance.now(),nivel:abertos.size});},
    fim(nome){const e=abertos.get(nome);if(e===undefined)return;abertos.delete(nome);
      const d=performance.now()-e.t0;
      fases[nome]=(fases[nome]||0)+d;
      if(e.nivel===0)topo+=d;},
    /** Fecha o quadro. `ms` é o custo REAL dele (o mesmo número que `fstats` recebe). */
    frame(ms){
      frames++;
      if(ms>=LIMIAR_MS){
        ruins++;
        // cópia só aqui — ver o aviso do cabeçalho sobre GC
        const copia={};
        for(const k in fases)copia[k]=Math.round(fases[k]*100)/100;
        copia["(não medido)"]=Math.round((ms-topo)*100)/100;   // `topo`, não a soma: ver o aviso do aninhamento
        amostras.push({ms:Math.round(ms*100)/100,fases:copia});
        // guarda os PIORES, não os primeiros: um engasgo que só aparece depois de dez minutos de
        // partida nunca caberia numa janela que enche e para de aceitar.
        if(amostras.length>AMOSTRA){amostras.sort((a,b)=>b.ms-a.ms);amostras.length=AMOSTRA;}}
      for(const k in fases)delete fases[k];
      abertos.clear();topo=0;},
    reset(){amostras.length=0;frames=0;ruins=0;topo=0;for(const k in fases)delete fases[k];abertos.clear();},
    /** Texto para o console — a saída que se copia e cola num relato de bug. */
    relatorio(){
      const linhas=[`?perf · ${frames} frames · ${ruins} acima de ${LIMIAR_MS} ms (${(ruins/(frames||1)*100).toFixed(1)}%)`];
      const piores=[...amostras].sort((a,b)=>b.ms-a.ms).slice(0,5);
      if(piores.length)linhas.push("piores: "+piores.map(a=>a.ms+" ms").join(" · "));
      for(const f of resumo(amostras))
        linhas.push(`  ${f.nome.padEnd(18)} total ${f.total.toFixed(1)} ms · ${f.n}× · pior ${f.pior.toFixed(1)} ms`);
      return linhas.join("\n");},
  };}

/**
 * A INSTÂNCIA ÚNICA, no molde de `Q`/`qflag`: quem instrumenta importa isto e chama, sem receber nada
 * por parâmetro nem carregar um objeto por seis camadas de render até a folha que interessa.
 * ⚠️ Módulo, e não estado do `createGame`: as camadas de render (`renderer/layers/*`) e o `TextureCache`
 * não conhecem o jogo, e passar o medidor até lá seria mudar a assinatura de todas elas para medir.
 */
export const perf=PORTAL?INERTE:criaPerf(isPerf());

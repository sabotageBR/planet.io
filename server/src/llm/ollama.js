// ── CLIENTE OLLAMA: uma chamada de chat, curta, com prazo e sem dependência nova ──────────────
// Mesmo formato de `http/peers.js`, que é o outro (único) lugar do servidor que fala HTTP para fora:
// `fetch` global do Node 22 + `AbortSignal.timeout` + erro engolido + retorno NEUTRO. Aqui o neutro é
// `null`, e quem chama entende "não deu, use o repertório fixo".
//
// Duas coisas não são detalhe:
//  1. `keep_alive` — carregar o modelo custa ~27 s (medido). Sem manter o modelo residente, a primeira
//     fala de cada partida chegaria meia hora depois do evento que a motivou. `warmup()` paga esse preço
//     uma vez, no boot, em vez de na cara do primeiro jogador.
//  2. `think` — os modelos daqui têm capability "thinking", e o raciocínio custa segundos que o chat de uma
//     partida não tem. Desligá-lo é o padrão, mas nem todo modelo obedece: o gpt-oss é um raciocinador
//     nativo, devolve o raciocínio à parte e, com `num_predict` curto, entrega `content` VAZIO — HTTP 200,
//     sala inteira muda, sem erro em log nenhum. Quem declara o que fazer é a entrada do modelo em
//     `BOT_LLM.MODELOS` (`think` + `reserva`), e `perfil()` a lê a cada chamada.
// E um disjuntor: com o Ollama fora, 50 bots tentando falar pagariam o timeout inteiro a cada gatilho.
// @ts-check
import {BOT_LLM} from '@warspace/shared/constants.js';

/**
 * A escolha do OPERADOR (env `OLLAMA_MODEL`) entrando no tunable, uma vez, no boot. Nome vazio ou igual ao
 * que já vale não faz nada; nome desconhecido é ACRESCENTADO à lista fechada em vez de recusado — a máquina
 * do Ollama pode ter um modelo que este código não conhece, e um `<select>` sem o valor em uso mostraria ao
 * admin um modelo que o servidor não está usando. Como `BOT_LLM.MODELOS` é lido por REFERÊNCIA pelo
 * descritor de `shared/tunables.js`, o acréscimo já vale para a validação do PUT e para o painel.
 * @param {string} nome @param {any} [log]
 */
/**
 * O que ESTE modelo exige do cliente: se aceita `think:false` e quantos tokens o raciocínio come antes da
 * primeira letra. Modelo desconhecido (o do env que não está na lista) cai no comportamento de sempre —
 * não pensar e não reservar nada —, que é o que os dois modelos não-raciocinadores daqui fazem.
 */
const perfil=()=>{
  const m=BOT_LLM.MODELOS.find(o=>o.v===BOT_LLM.MODELO)||{think:false,reserva:0};
  // O interruptor do painel ganha do que o modelo declara — menos na RESERVA, que continua sendo dele:
  // forçar `false` num raciocinador não faz ele parar de pensar (medido), só o deixa sem cota para falar.
  if(BOT_LLM.THINK==='sim')return{think:m.think||'low',reserva:m.reserva||0};
  if(BOT_LLM.THINK==='nao')return{think:false,reserva:m.reserva||0};
  return m;};

export function seedModelo(nome,log=null){
  const m=String(nome||'').trim();
  if(!m||m===BOT_LLM.MODELO)return BOT_LLM.MODELO;
  if(!BOT_LLM.MODELOS.some(o=>o.v===m)){
    BOT_LLM.MODELOS.push({v:m,label:`${m} — do OLLAMA_MODEL`});
    log&&log.info(`ollama: ${m} não está na lista do painel; acrescentado como opção`);}
  BOT_LLM.MODELO=m;
  return m;}

/**
 * @param {{url:string,timeoutMs?:number,maxInflight?:number,metrics?:any,log?:any}} o
 * `maxInflight` é o teto de gerações simultâneas por PROCESSO (todas as salas do shard somam aqui) e vem do
 * env OLLAMA_MAX_INFLIGHT. ⚠️ Subi-lo não adianta nada se o `OLLAMA_NUM_PARALLEL` da máquina do Ollama for
 * menor: os pedidos enfileiram lá dentro e cada um paga o timeout inteiro.
 *
 * ⚠️ O MODELO NÃO É PARÂMETRO: ele é lido de `BOT_LLM.MODELO` a cada chamada, que é o mesmo aliasing de
 * objeto que a física faz com POWERUP — é o que deixa o painel /admin trocá-lo em runtime sem recriar o
 * cliente e sem perder o disjuntor, o teto de gerações em voo e as métricas. Quem semeia o valor do env
 * `OLLAMA_MODEL` é o composition root, antes daqui.
 */
export function createOllama({url,timeoutMs=BOT_LLM.TIMEOUT_MS,maxInflight=BOT_LLM.MAX_INFLIGHT,metrics=null,log=null}){
  const base=String(url||'').replace(/\/+$/,'');
  let falhas=0,abertoAte=0,voando=0,aquecendo=false;
  const cli={
    get model(){return BOT_LLM.MODELO;},
    get url(){return base;},
    /** Dá para tentar agora? (configurado, disjuntor fechado e sem fila de gerações) */
    ok(){return !!base&&!!cli.model&&Date.now()>=abertoAte&&voando<maxInflight;},
    get maxInflight(){return maxInflight;},
    get breakerOpen(){return Date.now()<abertoAte;},
    get inflight(){return voando;},
    /**
     * Uma resposta curta. Devolve o texto cru (quem limpa é o botChat) ou `null` em qualquer tropeço.
     * @param {{system:string,user:string,numPredict?:number,temp?:number,timeoutMs?:number}} o
     */
    async chat({system,user,numPredict=BOT_LLM.NUM_PREDICT,temp=BOT_LLM.TEMP,timeoutMs:tm=timeoutMs,force=false}){
      if(!force&&!cli.ok())return null;
      if(force&&!base)return null;
      voando++;const t0=Date.now();
      // ⚠️ A reserva é SOMADA, nunca substituída: quem chama pede o tamanho da FALA e não tem por que saber
      // que existe modelo que pensa antes de falar. Sem ela o raciocínio consome a cota inteira e a resposta
      // volta vazia — que é a falha mais cara daqui, porque parece "o modelo não quis responder".
      const {think,reserva}=perfil();
      try{
        const r=await fetch(`${base}/api/chat`,{method:'POST',headers:{'content-type':'application/json'},
          signal:AbortSignal.timeout(tm),
          body:JSON.stringify({model:cli.model,stream:false,think,keep_alive:BOT_LLM.KEEP_ALIVE,
            options:{temperature:temp,num_predict:numPredict+(reserva||0)},
            messages:[{role:'system',content:system},{role:'user',content:user}]})});
        if(!r.ok)throw new Error(`HTTP ${r.status}`);
        const j=await r.json();
        const txt=j&&j.message&&typeof j.message.content==='string'?j.message.content:null;
        falhas=0;
        if(metrics)metrics.llm('ok',Date.now()-t0);
        return txt;
      }catch(e){
        if(metrics)metrics.llm('fail',Date.now()-t0);
        if(++falhas>=BOT_LLM.FAILS_OPEN){abertoAte=Date.now()+BOT_LLM.BREAKER_MS;falhas=0;
          if(log)log.warn(`ollama fora (${e&&e.message}): fala dos bots volta ao repertório fixo por ${BOT_LLM.BREAKER_MS/1000}s`);
          // O motivo mais comum de estourar o prazo não é o Ollama estar fora: é o MODELO ter saído da
          // memória (o keep_alive expira numa madrugada sem partidas) e a primeira chamada pagar os ~27 s de
          // load. Reaquecer enquanto o disjuntor está aberto faz o modelo estar pronto quando ele fechar —
          // sem isto, a primeira leva de falas de cada dia era perdida, e a seguinte também.
          cli.warmup().catch(()=>{});}
        else if(log)log.debug(`ollama: ${e&&e.message}`);
        return null;}
      finally{voando--;}},
    /**
     * Deixa o modelo residente ANTES da primeira partida (o load custa ~27 s). Ignora o disjuntor de
     * propósito — é justamente com ele aberto que o aquecimento é mais útil. Nunca lança, nunca empilha.
     */
    async warmup(){
      const modelo=cli.model;
      if(!base||!modelo||aquecendo)return false;
      aquecendo=true;
      const t0=Date.now();
      try{
        const r=await cli.chat({system:'Reply with one word.',user:'ping',numPredict:8,timeoutMs:120000,force:true});
        if(log){if(r!=null)log.info(`ollama pronto: ${modelo} em ${base} (${Date.now()-t0} ms)`);
          else log.warn(`ollama não respondeu em ${base}: a fala dos bots usa o repertório fixo`);}
        return r!=null;}
      finally{aquecendo=false;}},
    /** Já dá para contar com ele? (o teste ponta a ponta espera por isto em vez de dormir um número mágico) */
    get quente(){return !aquecendo&&Date.now()>=abertoAte;},
  };
  return cli;}

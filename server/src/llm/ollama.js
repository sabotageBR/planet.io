// ── CLIENTE OLLAMA: uma chamada de chat, curta, com prazo e sem dependência nova ──────────────
// Mesmo formato de `http/peers.js`, que é o outro (único) lugar do servidor que fala HTTP para fora:
// `fetch` global do Node 22 + `AbortSignal.timeout` + erro engolido + retorno NEUTRO. Aqui o neutro é
// `null`, e quem chama entende "não deu, use o repertório fixo".
//
// Duas coisas não são detalhe:
//  1. `keep_alive` — carregar o modelo custa ~27 s (medido). Sem manter o modelo residente, a primeira
//     fala de cada partida chegaria meia hora depois do evento que a motivou. `warmup()` paga esse preço
//     uma vez, no boot, em vez de na cara do primeiro jogador.
//  2. `think:false` — o modelo tem capability "thinking". Ligado, o raciocínio vem junto no texto e custa
//     segundos que o chat de uma partida não tem.
// E um disjuntor: com o Ollama fora, 50 bots tentando falar pagariam o timeout inteiro a cada gatilho.
// @ts-check
import {BOT_LLM} from '@warspace/shared/constants.js';

/**
 * @param {{url:string,model:string,timeoutMs?:number,maxInflight?:number,metrics?:any,log?:any}} o
 * `maxInflight` é o teto de gerações simultâneas por PROCESSO (todas as salas do shard somam aqui) e vem do
 * env OLLAMA_MAX_INFLIGHT. ⚠️ Subi-lo não adianta nada se o `OLLAMA_NUM_PARALLEL` da máquina do Ollama for
 * menor: os pedidos enfileiram lá dentro e cada um paga o timeout inteiro.
 */
export function createOllama({url,model,timeoutMs=BOT_LLM.TIMEOUT_MS,maxInflight=BOT_LLM.MAX_INFLIGHT,metrics=null,log=null}){
  const base=String(url||'').replace(/\/+$/,'');
  let falhas=0,abertoAte=0,voando=0,aquecendo=false;
  const cli={
    get model(){return model;},
    get url(){return base;},
    /** Dá para tentar agora? (configurado, disjuntor fechado e sem fila de gerações) */
    ok(){return !!base&&!!model&&Date.now()>=abertoAte&&voando<maxInflight;},
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
      try{
        const r=await fetch(`${base}/api/chat`,{method:'POST',headers:{'content-type':'application/json'},
          signal:AbortSignal.timeout(tm),
          body:JSON.stringify({model,stream:false,think:false,keep_alive:BOT_LLM.KEEP_ALIVE,
            options:{temperature:temp,num_predict:numPredict},
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
      if(!base||!model||aquecendo)return false;
      aquecendo=true;
      const t0=Date.now();
      try{
        const r=await cli.chat({system:'Reply with one word.',user:'ping',numPredict:4,timeoutMs:120000,force:true});
        if(log){if(r!=null)log.info(`ollama pronto: ${model} em ${base} (${Date.now()-t0} ms)`);
          else log.warn(`ollama não respondeu em ${base}: a fala dos bots usa o repertório fixo`);}
        return r!=null;}
      finally{aquecendo=false;}},
    /** Já dá para contar com ele? (o teste ponta a ponta espera por isto em vez de dormir um número mágico) */
    get quente(){return !aquecendo&&Date.now()>=abertoAte;},
  };
  return cli;}

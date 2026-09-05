// ── NICK SORTEADO PARA O JOGADOR, ESCRITO POR LLM ─────────────────────────────
// A tela inicial entrega o campo de nome já preenchido (ver `ENTRY.NICK_AUTO`). A primeira escolha é a
// LLM, e o CHÃO é `playerNick` (shared/constants.js) — o mesmo contrato da FALA e do balde de
// apelidos dos bots: sem `OLLAMA_URL`, com o disjuntor aberto ou com o balde vazio, sai a lista fixa e
// nada denuncia que havia um caminho a mais.
//
// ⚠️ POR QUE NÃO REUSAR `rooms/botNames.js`. Ele existe para o preenchimento PASSAR POR GENTE, e o
// prompt dele pede, literalmente, que metade sejam "names of a real person in that country's
// language" — que é exatamente o que não pode aparecer aqui: o jogador não pediu para se chamar
// Lucas. E ele é organizado por PAÍS (um lote por bandeira, `take` rodando entre elas) para que uma
// sala de 50 não nasça com uma bandeira só — dimensão que aqui não tem função nenhuma, porque isto
// entrega UM nick para UMA pessoa. O que se reusa dele é o que é comum de verdade: `recusa()` e
// `parseLote()`.
//
// ⚠️ NUNCA é esperado por quem chama. `take()` é síncrono e devolver `null` é a resposta NORMAL; quem
// enche é um `setInterval` em segundo plano, o mesmo desenho de `tunables.js` e do balde dos bots.
// @ts-check
import {BOT_LLM,BOT_NICKS} from '@warspace/shared/constants.js';
import {recusa,parseLote} from '../rooms/botNames.js';

const BOT_SET=new Set(BOT_NICKS.map(n=>n.toLowerCase()));

/**
 * O apelido serve para um JOGADOR? Devolve o motivo da recusa ou `null`.
 * Tudo o que `recusa()` já cobra (formato, valor-vazio, sem-raiz, palavra-comum, celebridade,
 * temático) mais UMA regra própria: não pode ser um nome que o preenchimento também usa.
 * ⚠️ Não é preciosismo. Nick igual ao de um bot na mesma sala faz `Room.nickTaken` RECUSAR a entrada
 * do jogador com `NICK_IN_ROOM` — a lista fixa é disjunta de `BOT_NICKS` pelo mesmo motivo, e o que
 * vem da LLM tem que respeitar a mesma fronteira.
 * @param {string} nick
 */
export function recusaJogador(nick){
  const m=recusa(nick);if(m)return m;
  if(BOT_SET.has(String(nick).toLowerCase()))return 'nome-de-bot';
  return null;}

// ── LOTE ─────────────────────────────────────────────────────────────────────
const SYSTEM='You invent usernames for players of an online game. Output only the list, nothing else.';
/**
 * ⚠️ A proibição de nome de pessoa é dita de QUATRO jeitos porque o modelo escapa de um. É a mesma
 * lição da peneira da fala: o prompt é um PEDIDO, e quem garante é `recusaJogador`.
 * @param {number} n
 */
function pedido(n){
  return `Generate ${n} usernames for players of a space-themed multiplayer .io game where everyone is a planet.
Use THINGS, never people: astronomy and space words, machines, animals, food, gaming slang.
Never a human name. No first names, no surnames, no nicknames of a person, no celebrities, no brands.
Lowercase, mixed case and digits are all fine. 2 to 14 characters, letters digits and underscore only.
No spaces, no accents, no punctuation, no @.
One per line, nothing else, no numbering.`;}

/**
 * @param {{llm:any,log?:any,metrics?:any}} o
 * `take(usados)` devolve um apelido ou `null` — e `null` é a resposta NORMAL: quem chama volta a
 * `playerNick`. Nunca espera e nunca lança.
 */
export function createNickPool({llm,log=null,metrics=null}){
  /** @type {string[]} */const pool=[];
  const usadosGlobal=new Set();   // não repetir dentro do PROCESSO
  let timer=null,enchendo=false;
  // ⚠️ UM lote em voo, e não `NICK_FILL_PAR` como no balde dos bots: lá o paralelismo existe para o
  // balde ter várias BANDEIRAS ao mesmo tempo, e aqui não há bandeira nenhuma a diversificar.
  async function enche(){
    if(enchendo||!llm||!llm.ok()||pool.length>=BOT_LLM.NICK_POOL_MAX)return;
    enchendo=true;
    try{
      // ⚠️ `numPredict`/`timeoutMs` explícitos: o default é de UMA linha de chat (48 tokens) e cortaria
      // o lote no meio. Este pedido não tem prazo — o oposto da fala, que é do INSTANTE.
      const cru=await llm.chat({system:SYSTEM,user:pedido(BOT_LLM.NICK_LOTE),
        numPredict:BOT_LLM.NICK_NUM_PREDICT,timeoutMs:BOT_LLM.NICK_TIMEOUT_MS,temp:BOT_LLM.NICK_TEMP});
      let n=0;
      // `parseLote` já apara e peneira por `recusa()`; o que falta é a regra PRÓPRIA daqui.
      for(const nick of parseLote(cru)){
        const k=nick.toLowerCase();
        if(usadosGlobal.has(k)||recusaJogador(nick))continue;
        usadosGlobal.add(k);pool.push(nick);n++;
        if(pool.length>=BOT_LLM.NICK_POOL_MAX)break;}
      if(usadosGlobal.size>BOT_LLM.NICK_POOL_MAX*8)usadosGlobal.clear();
      if(metrics&&metrics.llm)metrics.llm(n?'ok':'veto');
      if(log)log.debug(`nicks de jogador: +${n} (balde ${pool.length})`);
    }catch(e){if(log)log.debug(`nicks de jogador falharam: ${e&&e.message}`);}
    finally{enchendo=false;}}
  return{
    /**
     * Um apelido do balde, ou `null`. `usados` são os nicks EM USO agora (a união dos `usedNicks` das
     * salas do shard): item ocupado é DESCARTADO em vez de devolvido — insistir num nome disputado é
     * trabalho à toa, e ele não serve a mais ninguém enquanto aquela partida durar.
     * @param {Set<string>} usados
     */
    take(usados){
      while(pool.length){
        const nick=pool.pop();
        if(usados&&usados.has(String(nick).toLowerCase()))continue;
        if(pool.length<BOT_LLM.NICK_POOL_MIN)enche().catch(()=>{});   // repõe sem esperar
        return nick;}
      enche().catch(()=>{});
      return null;},
    start(){if(timer||!llm)return;
      enche().catch(()=>{});
      timer=setInterval(()=>{if(pool.length<BOT_LLM.NICK_POOL_MIN)enche().catch(()=>{});},BOT_LLM.NICK_FILL_MS);
      // `unref` para o balde não segurar o processo vivo — o mesmo cuidado de `tunables.js`.
      if(timer.unref)timer.unref();},
    stop(){if(timer){clearInterval(timer);timer=null;}},
    get size(){return pool.length;},
    recusa:recusaJogador,parseLote};}

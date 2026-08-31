// ── APELIDO DOS PREENCHIMENTOS GERADO POR LLM ─────────────────────────────────
// `botNick` (shared/constants.js) sorteia uma das 373 bases de `BOT_NICKS` em quatro formatos, e o país
// vinha DEPOIS, derivado do nick — com coerência só para as 76 raízes de `US_ROOTS`, então um "Kaua73"
// podia sair com bandeira do Japão. Aqui a ordem se inverte: sorteia-se o PAÍS e pedem-se apelidos DELE.
//
// A LLM não pode ser consultada no nascimento de um bot, e isso não é preferência: o lobby do Battle
// Royale pede até 50 nicks num ÚNICO tick (`Room.fillTo`, quando a janela fecha), o `step()` é de TODAS as
// salas do processo a 60 Hz, e o Ollama leva ~0,5 s por chamada quente. Então ela nunca é consultada ali.
// Ela enche um BALDE em segundo plano e quem nasce tira do balde — o mesmo desenho de `server/src/
// tunables.js`, onde um `setInterval` escreve num objeto que o laço de 60 Hz lê síncrono, sem saber que
// existe um caminho assíncrono do outro lado.
//
// O CHÃO continua sendo `botNick`: balde vazio, disjuntor aberto, OLLAMA_URL ausente ou nick reprovado na
// peneira e a sala usa os nomes de sempre. É a mesma regra da FALA (repertório fixo é o chão, a LLM
// acrescenta), e é o que mantém o `?local=1` — que não tem servidor com quem falar — funcionando igual.
//
// É de PROCESSO, não de sala: uma sala nasce e chama `start()` no mesmo instante, e um pool por sala
// estaria sempre vazio justamente no momento em que é preciso.
// @ts-check
import {BOT_NAMES,BOT_NICKS,BOT_LLM,botCountry} from '@warspace/shared/constants.js';
import {baseNick,normalizar} from '@warspace/shared/util.js';
import {eggSkinFor} from '@warspace/shared/eggs.js';
import {COUNTRY_BY_CODE} from '@warspace/shared/countries.js';
import {COMUNS} from './botChat.js';

// ── VALIDADOR ────────────────────────────────────────────────────────────────
// Todas estas regras JÁ existiam — como asserção de TESTE sobre as listas estáticas, nenhuma como função
// que rodasse em produção. Um apelido que vem de fora passa por fora dessas garantias, então elas
// precisaram virar código.
const PROIBIDOS=new Set(['null','undefined','nan','true','false','none','nil','(null)','nan','inf','infinity']);
const FORMATO=/^[A-Za-z0-9_]{2,16}$/;
/**
 * O apelido serve? Devolve o motivo da recusa (string) ou `null` quando passa — motivo em vez de booleano
 * porque é ele que o teste e o `llm-bench` imprimem quando um lote sai ruim.
 * @param {string} nick
 */
export function recusa(nick){
  const n=String(nick||'').trim();
  if(!FORMATO.test(n))return 'formato';                       // 2..16, sem espaço, sem pontuação, sem acento
  if(PROIBIDOS.has(n.toLowerCase()))return 'valor-vazio';     // se confunde com campo vazio no placar e no log
  // Sem raiz não há MENÇÃO: `citou()` compara a raiz, e um apelido que vira raiz vazia deixa o bot surdo
  // ao próprio nome — ele nunca responderia a quem o chamasse.
  if(baseNick(n).length<2)return 'sem-raiz';
  // Apelido que é palavra comum faz o bot responder a quem NÃO o chamou, que é o pecado grave de `citou`.
  if(COMUNS.has(normalizar(n))||COMUNS.has(baseNick(n)))return 'palavra-comum';
  // ⚠️ O FURO MAIS PROVÁVEL DESTA FEATURE. O prompt pede "nada de celebridades" e o modelo escapa uma em
  // dez (é a mesma lição que a peneira da fala documenta). Um preenchimento chamado "messi" ganharia a
  // caricatura do Messi no `_quemE` e seria tratado como ele no chat — o oposto exato de passar por gente.
  // O teste de eggs varre BOT_NICKS e BOT_NAMES, mas nada que venha de fora passa por lá.
  if(eggSkinFor(n)!==null)return 'celebridade';
  // Nome temático da lista antiga: denuncia o preenchimento pelo NOME antes de qualquer movimento.
  if(BOT_NAMES.some(b=>b.toLowerCase()===n.toLowerCase()))return 'tematico';
  return null;}

// ── LOTE ─────────────────────────────────────────────────────────────────────
const SYSTEM='You invent usernames for players of an online game. Output only the list, nothing else.';
/** @param {string} pais nome do país em pt-BR (é o que COUNTRY_BY_CODE guarda) */
function pedido(pais,n){
  return `Generate ${n} usernames of online game players from ${pais}.
Mix two kinds, about half and half: names or nicknames of a real person in that country's language, and playful gamer handles (a word plus digits, a food, an animal, a joke).
Lowercase, mixed case and digits are all fine. 2 to 14 characters, letters digits and underscore only.
No spaces, no accents, no punctuation, no @.
Do not use the names of famous people, celebrities, athletes, politicians or brands.
One per line, nothing else, no numbering.`;}
/**
 * Uma lista por linha, e não JSON: o cliente do Ollama não usa `format:'json'` em lugar nenhum, e uma
 * lista crua é bem mais robusta com um modelo pequeno do que um objeto que pode voltar malformado.
 * Aguenta o lixo que sempre vem junto — numeração, marcador, aspas, uma linha de prefácio.
 */
export function parseLote(txt){
  const out=[];
  for(let l of String(txt||'').split('\n')){
    l=l.replace(/^\s*[-*•\d]+[.)\]]?\s*/,'').replace(/^[\s"'`]+|[\s"'`,.]+$/g,'').trim();
    if(!l||/\s/.test(l))continue;                 // frase de prefácio ("Here are the names:") cai aqui
    if(!recusa(l))out.push(l);}
  return out;}

/**
 * @param {{llm:any,log?:any,metrics?:any}} o
 * `take(usados)` devolve `{nick,pais}` ou `null` — e `null` é a resposta NORMAL: sem LLM, com o balde
 * vazio ou com o disjuntor aberto, quem chama volta a `botNick`. Nunca espera e nunca lança.
 */
export function createBotNames({llm,log=null,metrics=null}){
  /** @type {{nick:string,pais:string}[]} */const pool=[];
  const usadosGlobal=new Set();   // não repetir dentro do PROCESSO: duas salas com o mesmo nick raro chama atenção
  let timer=null,enchendo=false;
  /** Sorteia um país pela MESMA distribuição de sempre: `botCountry` sem nick cai na roleta ponderada. */
  const sorteiaPais=()=>botCountry({next:Math.random,int:(a,b)=>a+Math.floor(Math.random()*(b-a+1))},'');
  async function enche(){
    if(enchendo||!llm||!llm.ok()||pool.length>=BOT_LLM.NICK_POOL_MAX)return;
    enchendo=true;
    try{
      const cc=sorteiaPais(),pais=COUNTRY_BY_CODE.get(cc)||'Brasil';
      // ⚠️ `numPredict` e `timeoutMs` PRECISAM vir explícitos: o default é 48 tokens (dimensionado para
      // UMA linha de chat) e não caberia um lote. Este pedido não tem prazo — o oposto da fala, que é do
      // INSTANTE —, então pode esperar bem mais.
      const cru=await llm.chat({system:SYSTEM,user:pedido(pais,BOT_LLM.NICK_LOTE),
        numPredict:BOT_LLM.NICK_NUM_PREDICT,timeoutMs:BOT_LLM.NICK_TIMEOUT_MS,temp:BOT_LLM.NICK_TEMP});
      const nicks=parseLote(cru);
      let n=0;
      for(const nick of nicks){
        const k=nick.toLowerCase();
        if(usadosGlobal.has(k))continue;
        usadosGlobal.add(k);pool.push({nick,pais:cc});n++;
        if(pool.length>=BOT_LLM.NICK_POOL_MAX)break;}
      if(usadosGlobal.size>BOT_LLM.NICK_POOL_MAX*8)usadosGlobal.clear();   // memória limitada: a repetição só incomoda no curto prazo
      if(metrics&&metrics.llm)metrics.llm(n?'ok':'veto');
      if(log)log.debug(`apelidos: +${n} de ${pais} (balde ${pool.length})`);
    }catch(e){if(log)log.debug(`apelidos falharam: ${e&&e.message}`);}
    finally{enchendo=false;}}
  const cli={
    /**
     * Um apelido do balde, ou null. `usados` é o `usedNicks` da SALA — quem já está lá não pode repetir,
     * e o item é DESCARTADO nesse caso em vez de devolvido: insistir num nome disputado é trabalho à toa.
     */
    take(usados){
      while(pool.length){
        const it=pool.pop();
        if(usados&&usados.has(it.nick.toLowerCase()))continue;
        if(pool.length<BOT_LLM.NICK_POOL_MIN)enche().catch(()=>{});   // repõe sem esperar
        return it;}
      enche().catch(()=>{});
      return null;},
    start(){if(timer||!llm)return;
      enche().catch(()=>{});
      timer=setInterval(()=>{if(pool.length<BOT_LLM.NICK_POOL_MIN)enche().catch(()=>{});},BOT_LLM.NICK_FILL_MS);
      // `unref` para o balde não segurar o processo vivo — é o mesmo cuidado de `tunables.js`.
      if(timer.unref)timer.unref();},
    stop(){if(timer){clearInterval(timer);timer=null;}},
    get size(){return pool.length;},
    recusa,parseLote};
  return cli;}

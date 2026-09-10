// ── O REPERTÓRIO FIXO DOS BOTS, NAS TRÊS LÍNGUAS ─────────────────────────────
// Ele é o CHÃO da fala: sai sempre que a LLM não responde — sem `OLLAMA_URL`, com o disjuntor aberto, com
// o teto de gerações em voo estourado ou quando a resposta passa de `STALE_MS`. E isso acontece com muito
// mais frequência do que se imagina, o que fazia dele a maior fonte de português na tela: com
// `BOT_LLM.IDIOMA` travado em inglês, o prompt saía todo em inglês, o modelo obedecia — e aí a metade das
// falas que nunca chegou a passar por ele continuava dizendo "peguei", "ah nao", "o gas".
//
// ⚠️ SAIU DE `shared/src/constants.js` INTEIRO, e não pela metade. Ele tinha exatamente DOIS consumidores
// de produção (`Room._fraseFixa` e `Room._fraseResposta`) e ZERO no cliente — o LocalServer do `?local=1`
// não tem chat. Deixar o pt-BR lá e trazer só en/es para cá criaria duas verdades que divergem na primeira
// correção, que é o mesmo argumento de `botPersonas.js` estar aqui.
//
// ⚠️ O TOM É O DA LISTA ORIGINAL, e ele é metade do disfarce: minúsculas, sem pontuação, 1 a 4 palavras,
// erro de digitação bem-vindo. Uma tradução "correta" — com maiúscula e ponto final — denuncia o bot tão
// bem quanto o português vazando denunciava.
// @ts-check
import {BOT_LLM} from '@warspace/shared/constants.js';
import {normalizar} from '@warspace/shared/util.js';

// ── idioma ───────────────────────────────────────────────────────────────────
// Dizer ao modelo "responda no idioma da mensagem" funciona quase sempre — e "quase" é o problema: uma
// resposta em português para quem escreveu em espanhol é justamente o que se queria evitar. Nomear o idioma
// ("reply in Spanish") tira a decisão do modelo e a traz para cá, onde dá para testar.
// Não é um detector geral de idioma: é um voto entre as três línguas que aparecem no jogo, com palavras
// FUNCIONAIS (as que ninguém escreve por acaso) e o desempate na dúvida sendo NÃO nomear nada.
// ⚠️ A chave é o NOME QUE VAI PARA O PROMPT, então ela é "Brazilian Portuguese" e não "Portuguese": o
// mesmo prompt podia sair com `[write your line in Portuguese]` (daqui) e `use Brazilian Portuguese` (do
// chão da LANGUAGE RULE), uma contradição pequena que o modelo tinha de resolver sozinho. Uma grafia por
// idioma no servidor inteiro — e é ela que `IDIOMA_NOME` espelha.
const MARCAS={
  'Brazilian Portuguese':'nao não vc você voce ta tá pra pro muito mano cara kkk kkkk seu sua dele dela isso aqui entao então vou vai tem foi eu te comer corre gordo lixo caralho porra merda mesmo agora ja já so só'.split(' '),
  Spanish:'eres muy pero porque donde dónde jaja jajaja hola amigo basura mierda bueno malo mucho estas estás vamos tio tío puta joder gilipollas nino niño esto eso alli allí'.split(' '),
  English:'the you your are is and this that what why how get got out off fuck shit bro dude man noob easy trash gonna dont don not going'.split(' '),
};
/** Idioma provável de um texto curto, ou `null` quando não dá para afirmar. */
export function detectaIdioma(texto){
  const ws=new Set(normalizar(texto).split(' ').filter(Boolean));
  if(!ws.size)return null;
  let melhor=null,max=0,empate=false;
  for(const [lang,marcas] of Object.entries(MARCAS)){
    let n=0;for(const m of marcas)if(ws.has(normalizar(m)))n++;
    if(n>max){max=n;melhor=lang;empate=false;}else if(n===max&&n>0)empate=true;}
  return max>=1&&!empate?melhor:null;}
/**
 * O IDIOMA TRAVADO NO PAINEL (`BOT_LLM.IDIOMA`) → o nome EM INGLÊS que entra no prompt, que é a MESMA chave
 * de `MARCAS` logo acima. Server-only, pelo mesmo motivo de `ESTILO_PROMPT`: `shared/` vai inteiro para o
 * bundle do `?local=1` e instrução de LLM não tem o que fazer lá.
 * ⚠️ Este objeto é a ponte entre as listas de idioma que sempre viveram com grafias diferentes: o `LANGS`
 * do cliente ("pt-BR"), a pref de `api/me.js` e as chaves de `MARCAS`, que vão LITERALMENTE para dentro do
 * prompt. Um id oferecido no painel sem par aqui é um `<select>` que grava e não faz nada — há teste.
 */
export const IDIOMA_NOME={'pt-BR':'Brazilian Portuguese',en:'English',es:'Spanish'};
export {MARCAS};
/** O nome inglês do idioma travado, ou `null` em `auto` (o comportamento de sempre: quem falou decide). */
const idiomaFixo=()=>IDIOMA_NOME[BOT_LLM.IDIOMA]||null;
export {idiomaFixo};

/** A língua do CHÃO quando não há sinal nenhum — a mesma que o SYSTEM do prompt já ditava. */
export const IDIOMA_BASE='pt-BR';

/**
 * O repertório, por idioma. As CHAVES são as mesmas nos três (há teste), porque `_fraseFixa` indexa por
 * `kind` e um buraco faria o bot cair no `||` e dizer "peguei" ao LEVAR um míssil.
 */
export const FRASES={
  'pt-BR':{
    start:["bora","boa sorte","alguem ai","vamo","glhf","to dentro","partiu","primeira vez aqui","oi","salve"],
    kill:["boa","peguei","kkkk","foi","ez","acertei","sai fora","proximo","huum","valeu"],
    morte:["ah nao","kkkk","fui","boa ai","tava perdido","errei feio","de novo nao","travou","eita","foi mal"],
    zona:["o gas","corre","to fora","vem pro meio","ta fechando","fui pego","sai dai","cuidado com o gas"],
    poucos:["quantos faltam","ta apertado","chegando la","aguenta","top 5","calma ai","gg","boa sorte ai"],
    equipe:["vem","to fraco","cuidado","atras de voce","me segue","toma massa","juntos","corre","espera","to indo"],
    tiro:["quem atirou","ei","para com isso","serio isso","vou lembrar disso","me erra","ta me caçando?","calma la"],
    escudo:["la se foi o escudo","perdi o escudo","ih","aguenta","to sem escudo","era meu escudo"],
    cacado:["me deixa","sai de mim","to encurralado","socorro","ta colado em mim","nao me segue"],
    lider:["to em primeiro","olha eu ai","cheguei","topo","vem me tirar dai","primeiro lugar"],
    resposta:["fala ai","que isso mano","kkkk","calma ai","vem entao","pode vir","que foi","to aqui",
              "sei nao hein","fala serio","era so o que faltava","ta bom ne"],
    puxa:["alguem vivo ai","que silencio","essa sala ta quieta","quem ta ganhando","cade a galera",
          "ta osso essa partida","alguem viu esse gigante","to quase morrendo aqui"]},
  en:{
    start:["lets go","gl","anyone here","glhf","im in","first time here","hi","yo","here we go","sup"],
    kill:["nice","got him","lmao","gone","ez","hit it","get out","next","hm","ty"],
    morte:["oh no","lmao","im out","gg","i was done","big miss","not again","lagged","oof","my bad"],
    zona:["the gas","run","im outside","get to the middle","its closing","it got me","get out of there","watch the gas"],
    poucos:["how many left","its tight now","almost there","hang on","top 5","easy there","gg","gl out there"],
    equipe:["come","im small","careful","behind you","follow me","take mass","together","run","wait","coming"],
    tiro:["who shot that","hey","stop that","really","ill remember that","leave me alone","are you hunting me?","chill"],
    escudo:["there goes the shield","lost my shield","ugh","hang on","no shield now","that was my shield"],
    cacado:["leave me","get off me","im cornered","help","hes on me","stop following me"],
    lider:["im first","look at me","made it","top","come take it","first place"],
    resposta:["whats up","what man","lmao","chill","come then","bring it","what","im here",
              "yeah right","seriously","thats just great","sure buddy"],
    puxa:["anyone alive","so quiet","this room is dead","whos winning","where is everyone",
          "rough match this one","did you see that giant","im barely alive here"]},
  es:{
    start:["vamos","suerte","hay alguien","glhf","estoy dentro","primera vez aqui","hola","buenas","alla vamos","que tal"],
    kill:["buena","lo pille","jaja","cayo","ez","le di","fuera","siguiente","hmm","gracias"],
    morte:["ay no","jaja","me voy","gg","estaba perdido","fallé feo","otra vez no","se trabo","uf","culpa mia"],
    zona:["el gas","corre","estoy fuera","al centro","se esta cerrando","me pillo","sal de ahi","cuidado con el gas"],
    poucos:["cuantos quedan","esta apretado","ya casi","aguanta","top 5","tranquilo","gg","suerte alla"],
    equipe:["ven","estoy chico","cuidado","detras de ti","sigueme","toma masa","juntos","corre","espera","ya voy"],
    tiro:["quien disparo","eh","para ya","en serio","me acordare de esto","dejame en paz","me estas cazando?","calma"],
    escudo:["adios escudo","perdi el escudo","uy","aguanta","sin escudo","ese era mi escudo"],
    cacado:["dejame","salte de encima","estoy acorralado","socorro","lo tengo pegado","no me sigas"],
    lider:["voy primero","mirame","llegue","cima","ven a quitarmelo","primer lugar"],
    resposta:["que pasa","que dices","jaja","tranquilo","ven pues","adelante","que fue","aqui estoy",
              "si claro","en serio","lo que faltaba","vale vale"],
    puxa:["alguien vivo","que silencio","esta sala esta muerta","quien va ganando","donde esta la gente",
          "dura esta partida","viste ese gigante","apenas estoy vivo"]},
};

/**
 * EM QUE LÍNGUA ESTE BOT FALA AGORA — a MESMA função para a linha gerada e para a enlatada.
 *
 * ⚠️ Ter dois caminhos decidindo língua separadamente é como se produz um bot que responde ao mesmo
 * "hey bro" em inglês quando a LLM está de pé e em português quando ela cai. Como ela cai o tempo todo,
 * isso seria visível na primeira partida.
 *
 * Travado (`BOT_LLM.IDIOMA` != 'auto'), é ele e pronto. Em `auto`, a ordem é a MESMA cadeia que
 * `montaPrompt` já usava: a mensagem dirigida a mim → as últimas linhas do chat → o chão.
 * ⚠️ SÓ LINHA DE HUMANO entra na detecção da sala. O bot lendo a própria fala trava a sala na língua do
 * chão para sempre: um "peguei" enlatado vira evidência de que a sala fala português, e ela nunca mais sai
 * de lá. A língua de uma sala é a das PESSOAS que estão nela.
 * @param {string|null} texto a mensagem dirigida ao bot, quando há
 * @param {{text:string,bot?:boolean}[]} [historico] o chatLog da sala
 * @returns {string} um id de `FRASES` ('pt-BR' | 'en' | 'es')
 */
export function idiomaDaFala(texto,historico){
  if(BOT_LLM.IDIOMA&&BOT_LLM.IDIOMA!=='auto'&&FRASES[BOT_LLM.IDIOMA])return BOT_LLM.IDIOMA;
  const porNome=n=>{for(const [id,nome] of Object.entries(IDIOMA_NOME))if(nome===n)return id;return null;};
  const daMsg=texto?porNome(detectaIdioma(texto)):null;
  if(daMsg&&FRASES[daMsg])return daMsg;
  const gente=(historico||[]).filter(l=>l&&!l.bot).slice(-3).map(l=>l.text).join(' ');
  const daSala=gente?porNome(detectaIdioma(gente)):null;
  return daSala&&FRASES[daSala]?daSala:IDIOMA_BASE;}

/** O pool de um gatilho, na língua da vez. Cai no chão quando a língua não tem a chave (não deve haver). */
export const frasesDe=(kind,lang)=>(FRASES[lang]||FRASES[IDIOMA_BASE])[kind]||FRASES[IDIOMA_BASE][kind];

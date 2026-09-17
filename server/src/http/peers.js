// ── PEERS: fala com os shards irmãos (PEERS ou PEER_HOST) com timeout de 1200 ms ──────────────
// Três coisas: a lista de salas (/internal/rooms, por `criaPeerRooms`), o lobby de equipe (/internal/party) e o painel de
// administração (/internal/admin/*). E DOIS padrões, que não podem ser confundidos:
//   askPeers  — "quem é o DONO disto?" (devolve UMA resposta, descartando os 404)
//   tellPeers — "façam TODOS isto" (devolve o que cada um respondeu, inclusive as falhas)
// @ts-check
const TIMEOUT_MS=1200;
/**
 * AS SALAS DOS IRMÃOS, com SONDA, MEMO e UMA busca em voo por vez.
 *
 * ⚠️ `fetchPeerRooms` perguntava a TODOS os `config.peers` em TODA chamada — e `config.peers` sai de `SHARDS`
 * (24 no ConfigMap) enquanto quem decide quantos pods existem é o HPA (3 na maior parte do tempo). Eram 23
 * `fetch` por chamada, ~20 deles para nomes que nem resolvem no DNS, cada um com o seu `AbortSignal.timeout`,
 * o seu socket e o seu `Error` com stack. E quem chama isto são as duas rotas mais QUENTES do menu:
 * `/api/rooms` (a tela de Salas faz polling a 5 s POR JOGADOR parado nela) e `/api/auto` (todo clique em
 * JOGAR). Cem pessoas no menu = ~460 fetch/s num pod cujo trabalho é rodar o laço do jogo — lixo de GC em
 * rajada, no mesmo processo em que rajada de GC era exatamente o que congelava a partida.
 * Três remédios, e nenhum sozinho basta:
 *   sonda  — só se pergunta a quem EXISTE (`admin/sonda.js`, a mesma do painel); o desconhecido é revisitado
 *            a cada `ADMIN_BUS.SONDA_MS`, que é o atraso máximo para enxergar um pod que o HPA acabou de subir;
 *   memo   — `ttlMs` (1,5 s) só da parte dos IRMÃOS. As salas LOCAIS são sempre lidas na hora por quem chama;
 *   em voo — N chamadas simultâneas dividem UMA rodada de fan-out (o molde de `admin/coletor.js`).
 * ⚠️ `conta(code)` existe por causa do memo: dentro da janela, todo `/api/auto` deste pod veria a MESMA
 * contagem e mandaria todo mundo para a mesma sala do irmão — o atrator que `matchmaking.js` existe para
 * desfazer, reintroduzido por um cache. Quem escolhe uma sala de irmão soma 1 nela até a próxima rodada.
 * @param {{peers:string[],sonda?:any,log?:any,ttlMs?:number,timeoutMs?:number,agora?:()=>number,busca?:typeof fetch}} o
 */
export function criaPeerRooms({peers,sonda=null,log=null,ttlMs=1500,timeoutMs=TIMEOUT_MS,agora=Date.now,busca=fetch}){
  /** @type {any[]} */let memo=[];let memoAte=0;/** @type {Promise<any[]>|null} */let emVoo=null;
  /** @type {Map<string,number>} */const extra=new Map();
  const st={rodadas:0,pedidos:0,doMemo:0};
  async function rodada(){
    const alvos=sonda?sonda.aPerguntar():peers;st.rodadas++;st.pedidos+=alvos.length;
    const lists=await Promise.all(alvos.map(async p=>{
      try{const r=await busca(`http://${p}/internal/rooms`,{signal:AbortSignal.timeout(timeoutMs)});
        if(!r.ok){if(sonda)sonda.anota(p,false);return[];}
        const j=await r.json();if(sonda)sonda.anota(p,true,j&&j.shard);return Array.isArray(j.rooms)?j.rooms:[];}
      catch(e){if(sonda)sonda.anota(p,false);if(log)log.debug(`peer ${p} indisponível: ${e&&e.message}`);return[];}}));
    memo=lists.flat();memoAte=agora()+ttlMs;extra.clear();return memo;}
  const comExtra=l=>extra.size?l.map(r=>extra.has(r.code)?{...r,players:(r.players|0)+(extra.get(r.code)||0)}:r):l;
  return{
    /** As salas públicas dos irmãos (nunca as locais). Nunca lança. */
    async rooms(){if(!peers.length)return[];
      if(agora()<memoAte){st.doMemo++;return comExtra(memo);}
      if(!emVoo)emVoo=rodada().finally(()=>{emVoo=null;});
      return comExtra(await emVoo);},
    /** Este pod acabou de mandar alguém para a sala `code` de um irmão: conta até a próxima rodada. */
    conta(code){if(code)extra.set(code,(extra.get(code)||0)+1);},
    limpa(){memoAte=0;extra.clear();},
    get stats(){return{...st};},
  };}

/**
 * Faz a MESMA pergunta a todos os irmãos e devolve a resposta de quem é DONO do recurso.
 * É o lobby de equipe que precisa disto: o party vive na memória do shard que gerou o código, mas o
 * Ingress balanceia /api entre os 3 pods — sem este desvio, 2 em cada 3 chamadas caem no pod errado.
 * Perguntar a todos é seguro até para MUTAÇÃO: quem não é dono recusa antes de tocar em nada (o guarda
 * de `rooms/Party.js`), e o código carrega o dono no 1º char, então dois pods nunca geram o mesmo.
 * @param {string[]} peers host:porta
 * @returns {Promise<{status:number,body:any}|null>} null = NINGUÉM respondeu (rede/timeout); quem chama
 *   devolve 503, nunca 404 — é o 404 que faz o cliente desfazer a equipe do jogador.
 */
export async function askPeers(peers,{path,method='GET',body=null,auth=null,timeoutMs=TIMEOUT_MS,log=null,anota=null}={}){
  const headers={accept:'application/json'};if(auth)headers.authorization=auth;if(body!=null)headers['content-type']='application/json';
  // `anota(peer,respondeu)`: quem passa a lista da SONDA recebe de volta quem respondeu — qualquer status
  // HTTP é "existe", inclusive o 404 de quem não é o dono —, senão o desconhecido seria revisitado em toda
  // chamada em vez de a cada `SONDA_MS`.
  const rs=await Promise.all(peers.map(async p=>{
    try{const r=await fetch(`http://${p}${path}`,{method,headers,body:body==null?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
      if(anota)anota(p,true);return{status:r.status,body:await r.json().catch(()=>null)};}
    catch(e){if(anota)anota(p,false);if(log)log.debug(`peer ${p} indisponível: ${e&&e.message}`);return null;}}));
  const vivos=rs.filter(Boolean);if(!vivos.length)return null;
  return vivos.find(r=>r.status!==404)||vivos[0];   // o dono é o único que não responde 404
}

/**
 * Manda a MESMA coisa a TODOS os irmãos e devolve o que CADA UM respondeu — sem escolher vencedor.
 *
 * ⚠️ É a diferença para `askPeers`, e ela não é de estilo: `askPeers` existe para ACHAR O DONO de um
 * recurso (o lobby de equipe) e por isso descarta os 404 e devolve UMA resposta. Um broadcast global feito
 * com ele entregaria a mensagem a um shard e a rota diria "ok" — o bug mais silencioso que este servidor
 * poderia ter. Aqui não há dono: todos aplicam, e quem falhou aparece no resultado para a resposta HTTP
 * poder dizer ao administrador que o shard 2 não recebeu.
 *
 * Nunca lança: um irmão fora do ar vira `{peer,error}`, não uma exceção no meio de uma rota.
 *
 * ⚠️ `path` PODE SER UMA FUNÇÃO `(peer)=>string`, e isso não é açúcar: o fluxo ao vivo do painel guarda um
 * CURSOR POR SHARD, então cada irmão precisa ser perguntado a partir de um ponto diferente. A alternativa
 * era mandar o mapa inteiro dos 24 cursores para cada um dos 23 peers, 23 vezes por segundo, para que cada
 * um lesse uma linha dele. A forma string continua sendo a de todos os outros chamadores.
 * @param {string[]} peers host:porta
 * @param {{path:string|((peer:string)=>string),method?:string,body?:any,auth?:string|null,timeoutMs?:number,log?:any}} o
 * @returns {Promise<Array<{peer:string,status:number,body:any}|{peer:string,error:string}>>}
 */
export async function tellPeers(peers,{path,method='POST',body=null,auth=null,timeoutMs=TIMEOUT_MS,log=null}={}){
  const headers={accept:'application/json'};if(auth)headers.authorization=auth;if(body!=null)headers['content-type']='application/json';
  return Promise.all(peers.map(async p=>{
    try{const r=await fetch(`http://${p}${typeof path==='function'?path(p):path}`,{method,headers,body:body==null?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
      return{peer:p,status:r.status,body:await r.json().catch(()=>null)};}
    catch(e){if(log)log.debug(`peer ${p} indisponível: ${e&&e.message}`);return{peer:p,error:String(e&&e.message||e)};}}));
}

// ── CONEXÃO: ws `${wss}://${host}/ws/${shard}` (ou socket falso do LocalServer) ──────
// ⚠️ As `message` em pt-BR daqui NÃO são o texto que o jogador lê: quem escreve a frase é
// `i18n/errors.js`, a partir do `code` (UNREACHABLE · LOST · VERSION). Elas ficam como paraquedas do
// paraquedas — se um dia o dicionário perder a chave, ainda sai algo em vez de vazio.
// Máquina: idle → connecting → (join|resume) → connected; queda não deliberada → reconnecting
// (backoff 0.5→1→2→4→4 s, 5 tentativas) → closed. `error` JSON do servidor é fatal (o servidor
// fecha com 4400+ em seguida).
// ⚠️ VERSÃO DIFERENTE NO `room` SÃO DUAS COISAS, e tratá-las como uma só foi o que produziu o laço de
// reload. (a) O servidor está À FRENTE = a minha build é velha; recarregar é o conserto — mas só no SITE,
// porque no zip de um portal o reload traz o mesmo bundle e a coisa nunca acaba. Daí o reload valer UMA
// vez (marca em sessionStorage) e depois virar tela. (b) O servidor está ATRÁS = rollout em curso: o
// Deployment do cliente sobe em segundos e o StatefulSet dos shards leva minutos, então o cliente NOVO
// sorteia um shard ainda velho. Aí recarregar não conserta nada — quem tem que mudar é o SHARD, e é o
// `onStale` que pede ao host para refazer a escolha.
// Ping de aplicação a 1 Hz ({t:"ping",c}) → PONG binário → RTT (EMA) e relógio de ticks do servidor.
import {PROTOCOL_VERSION,MSG,decodeMessage,TICK_HZ} from "@warspace/shared";
import {PORTAL} from "../../portal/flags.js";
// ⚠️ `sessionStorage` LANÇA em origem opaca (um portal que serve o zip com sandbox sem allow-same-origin),
// e é justamente lá que o laço de reload doía mais — então os dois acessos vão com guarda. Sem storage a
// marca não existe e o comportamento cai no de antes: recarrega. Não é pior que hoje, e é o único lugar
// onde não dá para fazer melhor.
const RELOAD_KEY="warspace_proto_reload";
const jaRecarregou=v=>{try{return sessionStorage.getItem(RELOAD_KEY)===String(v);}catch{return false;}};
const marcaReload=v=>{try{sessionStorage.setItem(RELOAD_KEY,String(v));}catch{}};

const BACKOFF=[500,1000,2000,4000,4000],MAX_ATTEMPTS=5;
export function createConnection({makeSocket,onJson,onBinary,onState,onOpenSend,onStale}){
  let ws=null,state="idle",attempt=0,timer=0,pingT=0,deliberate=false,fatal=false,joinedOnce=false,stale=false;
  const c={state:"idle",session:null,room:null,rtt:0,rttAvg:0,bytesIn:0,msgsIn:0,pongTick:0,pongAt:0,tickOffset:NaN,
    get isOpen(){return ws&&ws.readyState===1;}};
  const setState=(s,extra)=>{state=c.state=s;if(onState)onState(Object.assign({state:s,room:c.room},extra||{}));};
  function connect(){
    clearTimeout(timer);
    try{ws=makeSocket();}catch(e){return fail(e);}
    const sock=ws;sock.binaryType="arraybuffer";
    sock.onopen=()=>{if(ws!==sock)return;pingT=0;onOpenSend(c);startPing();};
    sock.onmessage=ev=>{if(ws!==sock)return;const d=ev.data;
      if(typeof d==="string"){c.bytesIn+=d.length;c.msgsIn++;let m=null;try{m=JSON.parse(d);}catch{return;}handleJson(m);}
      else{c.bytesIn+=d.byteLength;c.msgsIn++;let m=null;try{m=decodeMessage(d);}catch(e){console.warn("[net] mensagem inválida",e);return;}
        if(!m)return;if(m.type===MSG.PONG){onPong(m);return;}onBinary(m);}};
    sock.onerror=()=>{};
    sock.onclose=ev=>{if(ws!==sock)return;stopPing();ws=null;
      if(deliberate){setState("closed");return;}
      // ⚠️ O `fatal` INTEIRO, não `{code,message}`: o payload carrega campos de molde — o `nick` do
      // NICK_IN_ROOM e a `suggestion` que a tela oferece. Copiar dois campos aqui desfazia, em silêncio,
      // o mesmo conserto feito no `handleJson` logo acima: a frase saía com as aspas vazias ("já há
      // alguém chamado \"\" nessa sala") e o jogador ficava sem o nome sugerido.
      if(fatal){setState("closed",fatal);return;}
      // Fechamos NÓS, porque o shard está atrás. Vem antes do UNREACHABLE de propósito: o socket abriu e o
      // servidor respondeu o `room` — chamar isso de "não foi possível conectar" mandaria o jogador olhar a
      // internet dele. Sem `onStale` (o LocalServer, os testes) cai no backoff de sempre.
      if(stale){stale=false;setState("reconnecting",{attempt:1,code:"UPDATING"});
        if(onStale)return onStale();return scheduleReconnect(ev&&ev.code);}
      if(!joinedOnce&&attempt===0){setState("error",{code:"UNREACHABLE",message:"Não foi possível conectar ao servidor"});return;}
      scheduleReconnect(ev&&ev.code);};}
  function fail(e){setState("error",{code:"UNREACHABLE",message:e&&e.message||"falha ao abrir o socket"});}
  function scheduleReconnect(code){
    if(attempt>=MAX_ATTEMPTS){setState("closed",{code:"LOST",message:"Conexão perdida"});return;}
    const wait=BACKOFF[Math.min(attempt,BACKOFF.length-1)];attempt++;setState("reconnecting",{attempt,code});
    timer=setTimeout(connect,wait);}
  function handleJson(m){
    if(m.t==="room"){
      // O servidor NOVO ecoa a versão que este cliente declarou no join, então chegar aqui já quer dizer
      // que um dos dois lados é de outra safra. O sentido decide o que fazer (ver o cabeçalho).
      if(m.protocol!==undefined&&m.protocol!==PROTOCOL_VERSION){
        if(m.protocol>PROTOCOL_VERSION){                              // (a) a minha build é a velha
          fatal={code:"OUTDATED",message:"Versão do jogo desatualizada"};
          setState("error",fatal);try{ws.close();}catch{}
          if(!PORTAL&&!jaRecarregou(m.protocol)){marcaReload(m.protocol);setTimeout(()=>location.reload(),1000);}
          return;}
        stale=true;try{ws.close();}catch{}return;}                    // (b) o servidor é que está atrás: outro shard
      c.session={sessionId:m.sessionId,resumeToken:m.resumeToken,slot:m.slot,shard:m.shard};c.room=m.code;attempt=0;joinedOnce=true;
      setState("connected",{room:m.code,slot:m.slot});}
    // O payload INTEIRO vira o `fatal` (menos o `t`): o erro do WS carrega campos de molde — o `nick` do
    // NICK_IN_ROOM é um deles, e copiar campo a campo o deixava de fora, então a frase saía com as aspas
    // vazias ("já há alguém chamado \"\" nessa sala").
    else if(m.t==="error"){const{t,...resto}=m;fatal=resto;}
    onJson(m);}
  function onPong(m){const now=performance.now(),rtt=Math.max(0,now-(m.clientTime>>>0));c.rtt=rtt;c.rttAvg=c.rttAvg?c.rttAvg*.8+rtt*.2:rtt;
    c.pongTick=m.serverTick;c.pongAt=now;const off=m.serverTick+rtt/2*TICK_HZ/1000-now*TICK_HZ/1000;c.tickOffset=Number.isNaN(c.tickOffset)?off:c.tickOffset*.9+off*.1;}
  function startPing(){stopPing();pingT=setInterval(()=>{if(c.isOpen)c.sendJson({t:"ping",c:performance.now()>>>0});},1000);}
  function stopPing(){if(pingT){clearInterval(pingT);pingT=0;}}
  c.open=()=>{deliberate=false;fatal=false;stale=false;attempt=0;joinedOnce=false;c.session=null;c.room=null;setState("connecting");connect();};
  /** Reagenda a reconexão com o backoff de sempre — para quem interceptou o `onStale` e decidiu esperar
   *  no mesmo shard (sala por código, ou tentativas esgotadas). */
  c.retry=()=>scheduleReconnect();
  c.send=data=>{if(c.isOpen)ws.send(data);};
  c.sendJson=obj=>{if(c.isOpen)ws.send(JSON.stringify(obj));};
  /** Fecha de propósito: sem callback de estado (o shell já saiu da partida). */
  c.close=()=>{deliberate=true;clearTimeout(timer);stopPing();const w=ws;ws=null;if(w){try{w.onclose=null;w.close(1000);}catch{}}state=c.state="idle";};
  /** Estimativa de tick do servidor agora, pelo PONG (o SnapshotBuffer tem a sua, pelos snapshots). */
  c.pongTickAt=now=>Number.isNaN(c.tickOffset)?0:c.tickOffset+now*TICK_HZ/1000;
  return c;}

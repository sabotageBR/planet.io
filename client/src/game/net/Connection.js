// ── CONEXÃO: ws `${wss}://${host}/ws/${shard}` (ou socket falso do LocalServer) ──────
// Máquina: idle → connecting → (join|resume) → connected; queda não deliberada → reconnecting
// (backoff 0.5→1→2→4→4 s, 5 tentativas) → closed. `error` JSON do servidor é fatal (o servidor
// fecha com 4400+ em seguida). PROTOCOL_VERSION diferente no `room` → onState VERSION + reload em 1 s.
// Ping de aplicação a 1 Hz ({t:"ping",c}) → PONG binário → RTT (EMA) e relógio de ticks do servidor.
import {PROTOCOL_VERSION,MSG,decodeMessage,TICK_HZ} from "@warspace/shared";

const BACKOFF=[500,1000,2000,4000,4000],MAX_ATTEMPTS=5;
export function createConnection({makeSocket,onJson,onBinary,onState,onOpenSend}){
  let ws=null,state="idle",attempt=0,timer=0,pingT=0,deliberate=false,fatal=false,joinedOnce=false;
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
      if(fatal){setState("closed",{code:fatal.code,message:fatal.message});return;}
      if(!joinedOnce&&attempt===0){setState("error",{code:"UNREACHABLE",message:"Não foi possível conectar ao servidor"});return;}
      scheduleReconnect(ev&&ev.code);};}
  function fail(e){setState("error",{code:"UNREACHABLE",message:e&&e.message||"falha ao abrir o socket"});}
  function scheduleReconnect(code){
    if(attempt>=MAX_ATTEMPTS){setState("closed",{code:"LOST",message:"Conexão perdida"});return;}
    const wait=BACKOFF[Math.min(attempt,BACKOFF.length-1)];attempt++;setState("reconnecting",{attempt,code});
    timer=setTimeout(connect,wait);}
  function handleJson(m){
    if(m.t==="room"){
      if(m.protocol!==undefined&&m.protocol!==PROTOCOL_VERSION){fatal={code:"VERSION",message:"Versão do jogo desatualizada — recarregando"};
        setState("error",fatal);try{ws.close();}catch{}setTimeout(()=>location.reload(),1000);return;}
      c.session={sessionId:m.sessionId,resumeToken:m.resumeToken,slot:m.slot,shard:m.shard};c.room=m.code;attempt=0;joinedOnce=true;
      setState("connected",{room:m.code,slot:m.slot});}
    else if(m.t==="error"){fatal={code:m.code,message:m.message,suggestion:m.suggestion};}
    onJson(m);}
  function onPong(m){const now=performance.now(),rtt=Math.max(0,now-(m.clientTime>>>0));c.rtt=rtt;c.rttAvg=c.rttAvg?c.rttAvg*.8+rtt*.2:rtt;
    c.pongTick=m.serverTick;c.pongAt=now;const off=m.serverTick+rtt/2*TICK_HZ/1000-now*TICK_HZ/1000;c.tickOffset=Number.isNaN(c.tickOffset)?off:c.tickOffset*.9+off*.1;}
  function startPing(){stopPing();pingT=setInterval(()=>{if(c.isOpen)c.sendJson({t:"ping",c:performance.now()>>>0});},1000);}
  function stopPing(){if(pingT){clearInterval(pingT);pingT=0;}}
  c.open=()=>{deliberate=false;fatal=false;attempt=0;joinedOnce=false;c.session=null;c.room=null;setState("connecting");connect();};
  c.send=data=>{if(c.isOpen)ws.send(data);};
  c.sendJson=obj=>{if(c.isOpen)ws.send(JSON.stringify(obj));};
  /** Fecha de propósito: sem callback de estado (o shell já saiu da partida). */
  c.close=()=>{deliberate=true;clearTimeout(timer);stopPing();const w=ws;ws=null;if(w){try{w.onclose=null;w.close(1000);}catch{}}state=c.state="idle";};
  /** Estimativa de tick do servidor agora, pelo PONG (o SnapshotBuffer tem a sua, pelos snapshots). */
  c.pongTickAt=now=>Number.isNaN(c.tickOffset)?0:c.tickOffset+now*TICK_HZ/1000;
  return c;}

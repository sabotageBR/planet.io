// ── MICROFONE: push-to-talk (Ctrl) → clipe curto µ-law 8 kHz → fio ───────────
// Por que µ-law e não Opus: `MediaRecorder` grava webm/opus no Chrome/Firefox e mp4/aac no Safari, e o
// Safari NÃO decodifica webm — um clipe gravado no Chrome sairia MUDO para metade da sala. µ-law é 4×
// mais gordo (8 KB/s, então VOICE.MAX_MS = 40 KB) e em troca é 100% previsível: o AudioBuffer é montado
// à mão, sem `decodeAudioData` e sem negociação de formato. O byte `codec` do fio já está reservado para
// trocar por Opus depois, sem versionar o protocolo de novo.
// Captura: AudioWorklet (o processador vai num Blob, sem arquivo extra para o bundler) com queda para
// ScriptProcessorNode, que é obsoleto mas existe em tudo. O motor de áudio (audio/index.js) só toca.
//
// `state` é um GETTER, nunca um campo guardado. Antes era um campo, e `stop()` chamava `onState(null)` sem
// zerá-lo: o `pushHud` do jogo (8 Hz) relia o objeto velho 125 ms depois e a barra de progresso voltava
// CONGELADA na tela, para não sair mais. Estado derivado não tem como ficar preso.
// @ts-check
import {VOICE} from "@warspace/shared";
import {encodeVoiceUp,createWriter} from "@warspace/shared/protocol/index.js";

const AVISO_MS=1600;   // quanto tempo o motivo da recusa (cooldown, permissão negada) fica na tela

const WORKLET=`
class MicTap extends AudioWorkletProcessor{
  process(inputs){const ch=inputs[0]&&inputs[0][0];if(ch&&ch.length)this.port.postMessage(ch.slice(0));return true;}
}
registerProcessor("mic-tap",MicTap);`;

/** G.711 µ-law: 16 bits com sinal → 8 bits. Fórmula padrão (mesma tabela de todo telefone). */
function muEncode(s){
  const BIAS=0x84,CLIP=32635;
  let sign=(s>>8)&0x80;if(sign)s=-s;if(s>CLIP)s=CLIP;
  s+=BIAS;let e=7;for(let mask=0x4000;(s&mask)===0&&e>0;e--,mask>>=1);
  return(~(sign|(e<<4)|((s>>(e+3))&0x0f)))&0xff;}
/** µ-law → −1..1 (o decodificador vive aqui junto do codificador: os dois têm que casar). */
export function muDecodeTo(u8,out){
  for(let i=0;i<u8.length;i++){
    const u=~u8[i]&0xff,sign=u&0x80,e=(u>>4)&0x07,m=u&0x0f;
    let v=(((m<<3)+0x84)<<e)-0x84;
    out[i]=(sign?-v:v)/32768;}
  return out;}

/**
 * Reamostra para VOICE.RATE_HZ com média da janela (passa-baixa pobre, mas suficiente para voz: sem ela
 * a decimação pura vira serrilhado agudo) e codifica em µ-law.
 * @param {Float32Array} src @param {number} rate taxa de origem (a do AudioContext)
 */
function toMuLaw(src,rate){
  const step=rate/VOICE.RATE_HZ,n=Math.floor(src.length/step),out=new Uint8Array(n);
  for(let i=0;i<n;i++){
    const a=Math.floor(i*step),b=Math.min(src.length,Math.floor((i+1)*step));
    let sum=0;for(let j=a;j<b;j++)sum+=src[j];
    const v=b>a?sum/(b-a):0,s=v<-1?-1:v>1?1:v;
    out[i]=muEncode(Math.round(s*32767));}
  return out;}

/**
 * @param {{audio:any,send:(d:Uint8Array)=>void,onState:(s:any)=>void,onTalk?:(on:boolean)=>void}} o
 * `onTalk(on)` avisa a REDE que o microfone abriu/fechou: é o que acende o ícone de "falando" em cima do
 * planeta dos outros no INSTANTE do Ctrl. O clipe só chega quando a tecla é solta — esperar por ele
 * deixaria o ícone sempre atrasado em relação a quem está falando.
 */
export function createMic({audio,send,onState,onTalk=null}){
  let stream=null,node=null,src=null,ctx=null,chunks=[],total=0,startAt=0,rec=false,quer=false,cdUntil=0,timer=0,erro=null,aviso=null;
  const writer=createWriter(VOICE.MAX_BYTES+256);
  const vivo={on:true,ms:0,k:0};
  /** Recusa visível: o HUD precisa dizer POR QUE nada aconteceu, senão segurar o Ctrl no cooldown parece bug. */
  const recusa=hint=>{erro=hint;aviso={on:false,hint,until:performance.now()+AVISO_MS};onState(aviso);};
  const m={error:()=>erro,
    /** Está gravando agora? (o HUD desenha o círculo por este estado) */
    get on(){return rec;},
    /** Derivado: gravando → progresso; recusado há pouco → o motivo; senão nada. NUNCA fica preso. */
    get state(){
      if(rec){vivo.ms=performance.now()-startAt;vivo.k=Math.min(1,vivo.ms/VOICE.MAX_MS);return vivo;}
      if(aviso&&performance.now()<aviso.until)return aviso;
      aviso=null;return null;},
    /** Quanto falta do cooldown, em ms (0 = livre). */
    cdLeft(){return Math.max(0,cdUntil-performance.now());},
    async start(){
      if(rec||quer)return;
      quer=true;
      const now=performance.now();
      if(now<cdUntil){quer=false;recusa("cd");return;}                // cooldown: o servidor recusaria de todo jeito
      if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){quer=false;recusa("unsupported");return;}
      try{
        ctx=audio.ctx();if(!ctx){quer=false;recusa("audio");return;}
        if(!stream)stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
        // Soltou o Ctrl enquanto o navegador pedia permissão. A guarda velha testava `node`, que é null na
        // PRIMEIRA vez — então o mic abria sozinho e só fechava no teto de 5 s. `quer` é escrito por stop().
        if(!quer){m._teardown();return;}
        chunks=[];total=0;
        src=ctx.createMediaStreamSource(stream);
        if(ctx.audioWorklet&&typeof AudioWorkletNode!=="undefined"){
          if(!m._wl){const url=URL.createObjectURL(new Blob([WORKLET],{type:"text/javascript"}));
            await ctx.audioWorklet.addModule(url);URL.revokeObjectURL(url);m._wl=true;}
          if(!quer){m._teardown();return;}                            // o addModule também é assíncrono
          node=new AudioWorkletNode(ctx,"mic-tap");
          node.port.onmessage=e=>{if(rec){chunks.push(e.data);total+=e.data.length;}};}
        else{node=ctx.createScriptProcessor(2048,1,1);               // obsoleto, mas é o que existe em tudo
          node.onaudioprocess=e=>{if(rec){const c=e.inputBuffer.getChannelData(0);chunks.push(new Float32Array(c));total+=c.length;}};}
        // o nó precisa de destino para processar; um gain mudo evita devolver a própria voz ao alto-falante
        const mute=ctx.createGain();mute.gain.value=0;src.connect(node);node.connect(mute);mute.connect(ctx.destination);
        m._mute=mute;rec=true;startAt=performance.now();erro=null;aviso=null;
        audio.play("micOn",{mine:true,bus:"ui"});
        if(onTalk)onTalk(true);
        tick();
      }catch(e){quer=false;m._teardown();recusa(e&&e.name==="NotAllowedError"?"denied":"fail");}},
    /** Soltou o Ctrl (ou estourou o tempo): fecha, codifica e manda. */
    stop(){
      const gravava=rec;quer=false;
      if(!gravava){m._teardown();return;}                             // soltou durante o pedido de permissão
      const ms=performance.now()-startAt;rec=false;
      const rate=ctx?ctx.sampleRate:48000;
      m._teardown();
      if(onTalk)onTalk(false);
      audio.play("micOff",{mine:true,bus:"ui"});
      if(ms<VOICE.MIN_MS){onState(null);return;}                      // toque acidental no Ctrl não vira áudio
      const flat=new Float32Array(total);let o=0;for(const c of chunks){flat.set(c,o);o+=c.length;}
      chunks=[];
      let data=toMuLaw(flat,rate);
      if(data.length>VOICE.MAX_BYTES)data=data.subarray(0,VOICE.MAX_BYTES);
      const dur=Math.min(VOICE.MAX_MS,Math.round(data.length*1000/VOICE.RATE_HZ));
      if(dur>=VOICE.MIN_MS&&data.length)send(encodeVoiceUp(writer,{codec:0,durMs:dur,data}));
      cdUntil=performance.now()+VOICE.CD_MS;onState(null);},
    /** Aborta sem mandar nada (morri, saí da sala, perdi o foco). */
    cancel(){const gravava=rec;quer=false;rec=false;chunks=[];total=0;m._teardown();
      if(gravava&&onTalk)onTalk(false);
      aviso=null;onState(null);},
    _teardown(){
      if(timer){cancelAnimationFrame(timer);timer=0;}
      try{if(node){node.disconnect();if(node.port)node.port.onmessage=null;node.onaudioprocess=null;}}catch{}
      try{if(src)src.disconnect();}catch{}
      try{if(m._mute)m._mute.disconnect();}catch{}
      node=null;src=null;m._mute=null;},
    /** Solta o microfone de vez (sair do jogo): a luzinha do navegador tem que apagar. */
    release(){m.cancel();if(stream){for(const t of stream.getTracks())t.stop();stream=null;}},
  };
  function tick(){
    if(!rec)return;
    if(performance.now()-startAt>=VOICE.MAX_MS){m.stop();return;}      // o jogo não deixa mandar áudio grande
    onState(m.state);
    timer=requestAnimationFrame(tick);}
  return m;}

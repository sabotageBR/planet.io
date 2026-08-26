// ── INPUT: 30 Hz quando muda (>2 px ou flag), keepalive 10 Hz, seq u16 com wrap ─────────
// Flags one-shot (SPLIT/EJECT/FIRE) ficam pendentes até `ackSeq ≥ seq` do input em que foram
// enviadas; como o WebSocket é confiável, só são REENVIADAS se o ack demorar mais que
// max(2·RTT, 150 ms) (queda/resume) — os cooldowns do servidor absorvem repetições raras.
// EJECT_HOLD vai em todo input enquanto a tecla/botão está segurado. Guarda histórico
// {seq,tick,tx,ty,flags} para o Predictor reaplicar após o snapshot. Nada é enviado antes do 1º setTarget
// (senão o keepalive mandaria tx=ty=0 e o servidor puxaria a peça para o canto até o mouse mexer).
import {INPUT_FLAG,NET,encodeInput} from "@planet/shared";

const SEND_MS=1000/NET.INPUT_HZ,KEEP_MS=1000/NET.KEEPALIVE_HZ,HIST=256;
export const seqGE=(a,b)=>((a-b)&0xFFFF)<0x8000;   // a ≥ b com wrap u16
export function createInputSender({send,getTick,getRtt}){
  const buf=new Uint8Array(10),pending=[];   // pending: {flag,seq,at}
  let seq=0,tx=0,ty=0,sentTx=NaN,sentTy=NaN,lastSend=0,hold=false,oneShot=0,ackSeq=-1,dirty=false,hasTarget=false;
  const s={history:[],sent:0,ackSeq:-1,
    setTarget(x,y){tx=x;ty=y;hasTarget=true;},
    press(flag){oneShot|=flag;dirty=true;},
    setHold(on){if(hold!==on){hold=on;dirty=true;}},
    get hold(){return hold;},
    onAck(a){ackSeq=s.ackSeq=a;let k=0;for(let i=0;i<pending.length;i++)if(!seqGE(a,pending[i].seq))pending[k++]=pending[i];pending.length=k;
      const h=s.history;let j=0;while(j<h.length&&seqGE(a,h[j].seq)&&h.length-j>2)j++;if(j>0)h.splice(0,j);},   // mantém ≥2 p/ replay
    /** Chamado após resume: reenvia pendências no próximo input. */
    resend(){for(const p of pending)p.at=-1e9;dirty=true;sentTx=NaN;},
    update(now){if(!hasTarget)return false;
      const moved=Math.abs(tx-sentTx)>2||Math.abs(ty-sentTy)>2;
      const due=now-lastSend>=SEND_MS,keep=now-lastSend>=KEEP_MS;
      if(!((due&&(moved||dirty))||keep))return false;
      let flags=oneShot;oneShot=0;const rtt=getRtt?getRtt():0,lim=Math.max(150,rtt*2);
      for(const p of pending)if(now-p.at>lim){flags|=p.flag;p.at=now;}
      if(hold)flags|=INPUT_FLAG.EJECT_HOLD;
      seq=(seq+1)&0xFFFF;const tick=getTick();
      for(const f of [INPUT_FLAG.SPLIT,INPUT_FLAG.EJECT,INPUT_FLAG.FIRE])if(flags&f&&!pending.some(p=>p.flag&f))
        pending.push({flag:f===INPUT_FLAG.FIRE?(flags&(INPUT_FLAG.FIRE|INPUT_FLAG.AIM)):f,seq,at:now});   // FIRE leva o AIM junto: um reenvio não vira tiro teleguiado
      for(const p of pending)if(flags&p.flag)p.seq=seq;
      send(encodeInput({seq,tx,ty,flags,clientTick:tick},buf));
      s.history.push({seq,tick,tx,ty,flags});if(s.history.length>HIST)s.history.splice(0,s.history.length-HIST);
      sentTx=tx;sentTy=ty;lastSend=now;dirty=false;s.sent++;return true;},
    reset(){seq=0;pending.length=0;s.history.length=0;oneShot=0;hold=false;sentTx=NaN;ackSeq=s.ackSeq=-1;dirty=false;hasTarget=false;},
    get pending(){return pending.length;},
  };
  return s;}

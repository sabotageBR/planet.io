// ── SESSION: socket + slot + seq/ack + AOI conhecida + token buckets + resume ────
// Vive além do socket: na queda fica NET.RESUME_MS sem ws (o jogador segue no mundo sem thrust);
// `resume` válido religa outro ws na mesma Session (known zera → recria tudo).
// @ts-check
import {randomBytes} from 'node:crypto';
import {NET,WORLD,ZOOM} from '@warspace/shared/constants.js';
import {ERROR_CODE} from '@warspace/shared/protocol/constants.js';
import {NO_REWARDS} from '../sim/hooks.js';
// ⚠️ `VIOLATION_GAP_MS`: UMA RAJADA É UMA VIOLAÇÃO. O excedente do balde sempre foi descartado; o que mudou
// é quanto ele CUSTA. Um celular com o uplink travado 2,5 s entrega ~75 INPUTs de uma vez: 60 passam (o
// burst), 15 estouram — e eram 15 violações no mesmo milissegundo, ou seja a expulsão (3 em 10 s) saía NA
// HORA, com close 4429 e SEM resume (`kicked`): o jogador honesto perdia a partida por causa de um túnel.
// Medido em produção: 360 / 779 / 871 `rateLimitHits` por shard em menos de um dia. Agora o excedente que
// chega a menos de 1 s da violação anterior é descartado em silêncio; um flood SUSTENTADO continua
// produzindo uma violação por segundo e cai em ~2–3 s, que é para quem o limite existe.
const VIOLATIONS=3,VIOLATION_WINDOW_MS=10000,VIOLATION_GAP_MS=1000,VIEW_MIN=240,VIEW_MAX=8192;
/** Token bucket: `rate` fichas/s até `burst`. */
export class Bucket{
  constructor(rate,burst){this.rate=rate;this.burst=burst;this.tokens=burst;this.last=performance.now();}
  take(now=performance.now()){const t=this.tokens+(now-this.last)*this.rate/1000;this.tokens=t>this.burst?this.burst:t;this.last=now;
    if(this.tokens>=1){this.tokens-=1;return true;}return false;}
}
export class Session{
  /** @param {{ws:any,metrics:any,log?:any,remoteAddr?:string|null,userAgent?:string|null}} o */
  constructor({ws,metrics,log=null,remoteAddr=null,userAgent=null}){
    this.ws=ws;this.metrics=metrics;this.log=log;this.remoteAddr=remoteAddr;this.userAgent=userAgent;
    this.slot=-1;this.pid=0;this.room=null;this.sessionId=null;this.userId=null;this.key=null;this.name='';this.unsaved=true;
    // Versão do protocolo que ESTA sessão declarou no join/resume, ou null quando o cliente não declarou
    // (é o caso de toda build publicada até a v15). Ela é a resposta do `room`: o servidor ECOA a versão do
    // cliente em vez de anunciar a dele, e assim o cliente antigo não se acha desatualizado. `null` faz o
    // campo ser OMITIDO — campo ausente é "não checado" nos dois lados desde sempre.
    /** @type {number|null} */this.protocol=null;
    // `pid`: handle OPACO por sala, para o painel do dono (ver Room.hostRoster). `key`: hash do token, o
    // mesmo `keyOf` do lobby de equipe — é o que permite banir quem não tem conta.
    this.resumeToken=randomBytes(16).toString('hex');
    /** @type {Map<number,number>} id → kind | (carimbo da passada << 3) */this.known=new Map();this.stamp=0;this.resync=false;
    this.view={w:1280,h:720,zoom:1};this.zoomHold=1;this.zoomHoldAt=0;   // marca d'água do zoom manual na AOI (ver net/snapshot.js)
    // ⚠️ ESTES CINCO CAMPOS VIVIAM DENTRO DO COMENTÁRIO DA LINHA ACIMA — um `//` que não fechava engolia
    // `cx`, `cy`, `scale`, `rect` e `specSlot`, e nenhum deles era inicializado no construtor. É a mesma
    // armadilha que `holdEject`/`rightSplit` já tiveram no `PREF_DEFAULTS` do cliente, e ela ficava
    // mascarada porque `Room.join` escreve `rect`/`specSlot` e tira `cx/cy` da primeira PEÇA. Sem peça —
    // o lobby do Battle Royale e, agora, o espectador — `viewRect(undefined,…)` devolve um retângulo
    // `NaN`, `rectHas` é sempre falso e o snapshot sai VAZIO, sem erro em lugar nenhum. `scale` nunca era
    // inicializado por caminho nenhum, e `specSlot` de uma sessão que ainda não entrou em sala ficava
    // `undefined`, com `undefined>=0` falso: o ramo do espectador em `net/snapshot.js` não era alcançado.
    this.cx=WORLD.w/2;this.cy=WORLD.h/2;this.scale=1;this.rect=null;
    /** Slot que esta sessão está ASSISTINDO (a AOI segue esse jogador). -1 = ninguém. */
    this.specSlot=-1;
    this.inputs=new Bucket(NET.RATE_INPUTS,NET.RATE_BURST);this.json=new Bucket(NET.RATE_JSON,NET.RATE_JSON*2);
    /** @type {number[]} */this.violations=[];this.lastPong=Date.now();this.disconnectedAt=0;this.pendingRewards=null;this.joining=false;this.kicked=false;this.connectedAt=Date.now();
    /** Último convite de Battle Royale entregue a ESTA sessão (`BR.INVITE_CD_MS`). Ver `Room.brInvite`. */
    this.brInviteAt=0;
    /**
     * O jogador mandou CALAR o convite de Battle Royale (`{t:"brMute"}`). É por SESSÃO, e é a sessão que
     * define o alcance: ela nasce com o socket e morre com ele, então calar vale nesta sala e acaba
     * quando o jogador entra em outra — que é exatamente o que se pediu. Um `resume` reata a MESMA
     * sessão, então cair a rede e voltar não desfaz o silêncio da sala em que ele está.
     * ⚠️ Não confundir com a pref `brInvite` da conta: aquela é "nunca mais, em lugar nenhum", vive no
     * banco e se desliga nas Opções. Esta é "agora não, aqui".
     */
    this.brMudo=false;
    /**
     * Esta sessão está só ASSISTINDO (`Room.joinSpec`). Ela tem slot e sessão como qualquer outra — é o
     * que faz snapshot, câmera e chat funcionarem sem código novo —, mas não conta em `humanCount`, não
     * ocupa vaga e não vira uma linha em `matches`. A marca mora aqui, e não só no `GamePlayer`, porque
     * `Room.humanCount`/`isFull` iteram SESSÕES e são chamados por caminhos (matchmaking, `info()`) que
     * não têm o `Sim` à mão.
     */
    this.espectador=false;
    // ⚠️ `lastActiveAt` NÃO é `lastPong`, e a semelhança dos nomes é a armadilha inteira: aquele é renovado
    // por QUALQUER mensagem (ver o `ws.on('message')` do wsServer), inclusive o keepalive de 10 Hz que o
    // cliente manda com o mouse PARADO e o ping de 1 Hz — ele mede SOCKET VIVO. Este mede PESSOA PRESENTE, e
    // só quem escreve nele é `marcaAtivo`, chamado pelo que é gesto de gente. Consolidar os dois desliga a
    // expulsão por inatividade sem quebrar nada e sem log nenhum: ninguém mais seria removido, jamais.
    // `falaAwake`: esta sessão já mandou um `{t:"awake"}`, ou seja o cliente dela sabe dizer sozinho quando
    // houve gesto de gente. Enquanto for falso, o servidor se vira com o alvo do INPUT — que é um piso ruim
    // (o planeta persegue o cursor para sempre e o alvo nunca para de mudar), mas é o único sinal que uma
    // build antiga oferece. Não é campo de protocolo: é a capacidade lida do comportamento.
    this.lastActiveAt=Date.now();this.idleWarnedAt=0;this.falaAwake=false;}
  /**
   * "Tem gente aqui." Zerar o aviso mora DENTRO do método de propósito: "voltou a se mexer" e "a faixa
   * some" são o mesmo fato, e em dois lugares eles divergem no primeiro caminho novo que alguém escrever.
   */
  marcaAtivo(now=Date.now()){this.lastActiveAt=now;this.idleWarnedAt=0;}
  get connected(){return !!this.ws&&this.ws.readyState===1;}
  /**
   * Tamanho da tela e o ZOOM MANUAL pedido pelo jogador (a roda). O `z` aqui leva só o saneamento
   * ABSOLUTO: a Session não conhece a massa, e a massa muda a cada tick. Quem clampa de VERDADE é o
   * snapshot, com o ΣR autoritativo (`clampZoom` em shared/camera.js) — sem ele, um cliente adulterado
   * pediria o mapa inteiro. Valor ausente não zera nada: cliente velho simplesmente fica em 1 para sempre.
   */
  setView(w,h,z){w=Number(w),h=Number(h);if(Number.isFinite(w))this.view.w=w<VIEW_MIN?VIEW_MIN:w>VIEW_MAX?VIEW_MAX:w;if(Number.isFinite(h))this.view.h=h<VIEW_MIN?VIEW_MIN:h>VIEW_MAX?VIEW_MAX:h;
    if(z!==undefined){const n=Number(z);this.view.zoom=Number.isFinite(n)&&n>0?(n<ZOOM.ABS_MIN?ZOOM.ABS_MIN:n>ZOOM.ABS_MAX?ZOOM.ABS_MAX:n):1;}}
  /** Envia a vista binária sem copiar. Devolve false se o socket ficou com bytes pendentes (o chamador troca de writer). */
  send(view){const ws=this.ws;if(!ws||ws.readyState!==1)return true;
    ws.send(Buffer.from(view.buffer,view.byteOffset,view.byteLength));this.metrics.bytesOut(view.byteLength);return ws.bufferedAmount===0;}
  /** Envia uma cópia (mensagens pequenas fora do writer da sala). */
  sendCopy(view){const ws=this.ws;if(!ws||ws.readyState!==1)return;ws.send(Buffer.from(view));this.metrics.bytesOut(view.byteLength);}
  sendJson(obj){const ws=this.ws;if(!ws||ws.readyState!==1)return;const s=JSON.stringify(obj);ws.send(s);this.metrics.bytesOut(s.length);}
  /** `error {code,message,suggestion?}` + close com o código de ERROR_CODE. */
  error(code,message,extra){this.sendJson({t:'error',code,message,...(extra||{})});this.kicked=true;const ws=this.ws;if(!ws)return;
    try{ws.close(ERROR_CODE[code]||4400,code);}catch{}}
  /** Registra uma violação de taxa; true quando estourou (VIOLATIONS em VIOLATION_WINDOW_MS). */
  violation(now=Date.now()){const v=this.violations;
    if(v.length&&now-v[v.length-1]<VIOLATION_GAP_MS){if(this.metrics.rateDrop)this.metrics.rateDrop();return false;}   // mesma rajada: descarta, não conta
    v.push(now);if(v.length>VIOLATIONS)v.shift();this.metrics.rateLimitHit();
    return v.length>=VIOLATIONS&&now-v[0]<=VIOLATION_WINDOW_MS;}
  deliverRewards(r){const msg={t:'rewards',...(r||NO_REWARDS)};if(this.connected)this.sendJson(msg);else this.pendingRewards=msg;}
  detach(){this.ws=null;this.disconnectedAt=Date.now();}
  // ⚠️ `marcaAtivo` aqui não é zelo: retomar a sessão É ação de gente, e sem isto quem cai a rede por 9 s e
  // volta pelo `resume` herda o cronômetro parado de antes — ou seja, a inatividade passaria a expulsar
  // exatamente quem acabou de se reconectar.
  attach(ws){this.ws=ws;this.disconnectedAt=0;this.known.clear();this.rect=null;this.lastPong=Date.now();this.violations.length=0;this.marcaAtivo();
    this.inputs=new Bucket(NET.RATE_INPUTS,NET.RATE_BURST);this.json=new Bucket(NET.RATE_JSON,NET.RATE_JSON*2);
    if(this.pendingRewards){const m=this.pendingRewards;this.pendingRewards=null;this.sendJson(m);}}
}

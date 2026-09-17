// ── BUFFER DE SNAPSHOTS: entidades por id com histórico de amostras + relógio do servidor ──
// Cada entidade guarda as últimas 10 amostras {tick,x,y,r,vx,vy}; comida parada tem uma só
// (o servidor só a atualiza quando o ímã/buraco negro a move). Removidas ficam marcadas (reason)
// para o Interpolator apagar (sumiço com efeito ou fade curto, conforme o motivo).
// Relógio: cada snapshot mede off = tick − now·60/1000; o ALVO é a mediana das últimas OFF_N medições
// (imune a um pacote atrasado) e o offset usado no render DESLIZA até o alvo (`passoRelogio`, chamado pelo
// Interpolator com o dt do frame) — sem degraus a cada pacote; só um desvio ENORME (resume, aba que dormiu) salta.
import {KIND,UPD,TICK_HZ} from "@warspace/shared";

const MAX_SAMPLES=10,OFF_N=8;
// ── O RELÓGIO DESLIZA POR TEMPO, E NUNCA ANDA PARA TRÁS ───────────────────────────────────────────────
// Era `SLEW=.02` tick POR FRAME e `SNAP=3` ticks. Dois defeitos, e os dois só aparecem quando o servidor
// tropeça — que é exatamente quando o cliente precisa se comportar bem:
//  (1) por FRAME a correção depende do fps: 1,2 tick/s a 60 fps, METADE disso a 30 — a máquina que já
//      está mal é a que demora o dobro para acertar o relógio;
//  (2) acima de 3 ticks (50 ms) o offset SALTAVA. Um overrun do servidor descarta simulação
//      (`server/src/loop.js`: p99 de 100 ms = 6 ticks), o relógio estimado cai de uma vez, e o salto joga
//      TODAS as entidades interpoladas para trás no mesmo frame — o mundo inteiro dá um tranco.
// Agora a velocidade é proporcional ao desvio (constante de tempo de `TAU_S`), com piso e teto:
//   adiantar — até `V_MAIS` tick/s: o mundo roda a no máximo 115 % por um instante;
//   atrasar  — até `V_MENOS` tick/s: o tempo de render cai a 60 % da velocidade, mas NUNCA para e NUNCA
//              volta (o render anda a 60 tick/s; tirar 24 deixa 36). Andar para trás é o que se vê como tranco.
// O salto ficou para |desvio| > `SNAP` = 12 ticks (200 ms): resume, aba que dormiu, relógio do SO corrigido.
export const RELOGIO={TAU_S:.5,V_MIN:1.2,V_MAIS:9,V_MENOS:24,SNAP:12};
/**
 * Um passo do relógio, PURO. `dtS` em segundos (o dt do frame, já com o teto de quem chama).
 * @param {number} offset @param {number} alvo @param {number} dtS @returns {number} o offset novo
 */
export function passoRelogio(offset,alvo,dtS){
  if(Number.isNaN(alvo))return offset;if(Number.isNaN(offset))return alvo;
  const d=alvo-offset,a=Math.abs(d);if(a>RELOGIO.SNAP)return alvo;
  const teto=d>0?RELOGIO.V_MAIS:RELOGIO.V_MENOS,v=Math.min(teto,Math.max(RELOGIO.V_MIN,a/RELOGIO.TAU_S)),passo=v*dtS;
  return passo>=a?alvo:offset+(d>0?passo:-passo);}
export function createSnapshotBuffer(){
  const entities=new Map(),offs=[];
  const b={entities,lastTick:0,lastRecv:0,offset:NaN,offsetTarget:NaN,offsetJitter:0,count:0,bytes:0,
    // `late`: quantos TICKS o último snapshot chegou depois do que o relógio esperava (contra a mediana de
    // ANTES dele). `lateMax` é o pior desde a última leitura — entre dois frames pode chegar uma rajada, e
    // quem lê por frame (o Interpolator) veria só o último, que é justamente o que chegou no horário.
    late:0,lateMax:0,snaps:0,
    /** Lê e zera o pior atraso de chegada desde a última leitura. */
    tomaLate(){const v=b.lateMax;b.lateMax=0;return v;},
    /** tick estimado do servidor em `now` (performance.now) */
    tickAt(now){return Number.isNaN(b.offset)?b.lastTick:b.offset+now*TICK_HZ/1000;},
    /** Uma vez por frame, com o dt do frame em segundos: aproxima o offset do alvo (ver `passoRelogio`). */
    slew(dtS=1/60){const antes=b.offset,novo=passoRelogio(antes,b.offsetTarget,dtS);
      if(!Number.isNaN(antes)&&Math.abs(novo-antes)>RELOGIO.SNAP)b.snaps++;
      b.offset=novo;},
    apply(snap,now){
      const tick=snap.tick,off=tick-now*TICK_HZ/1000;
      offs.push(off);if(offs.length>OFF_N)offs.shift();
      const sorted=offs.slice().sort((x,y)=>x-y),med=sorted[sorted.length>>1];
      if(!Number.isNaN(b.offsetTarget)){b.offsetJitter=b.offsetJitter*.9+Math.abs(off-b.offsetTarget)*.1;
        b.late=b.offsetTarget-off;if(b.late>b.lateMax)b.lateMax=b.late;}
      b.offsetTarget=med;if(Number.isNaN(b.offset))b.offset=med;
      b.lastTick=tick;b.lastRecv=now;b.count++;
      for(const c of snap.creates){let e=entities.get(c.id);
        if(!e){e={id:c.id,kind:c.kind,x:c.x,y:c.y,r:c.r,vx:c.vx||0,vy:c.vy||0,flags:c.flags||0,owner:c.owner==null?-1:c.owner,type:c.type||0,hue:c.hue||0,seed:c.seed||0,
          influenceR:c.influenceR||0,phase:c.phase||0,target:c.target==null?-1:c.target,samples:[],firstTick:tick,lastTick:tick,removed:0,reason:-1,
          rx:c.x,ry:c.y,rr:c.r,alpha:1,gone:false,extrap:false,vanished:false};entities.set(c.id,e);}
        else{e.kind=c.kind;e.x=c.x;e.y=c.y;e.r=c.r;e.vx=c.vx||0;e.vy=c.vy||0;e.flags=c.flags||0;if(c.owner!=null)e.owner=c.owner;if(c.type!=null)e.type=c.type;if(c.hue!=null)e.hue=c.hue;
          if(c.seed!=null)e.seed=c.seed;if(c.influenceR!=null)e.influenceR=c.influenceR;if(c.phase!=null)e.phase=c.phase;if(c.target!=null)e.target=c.target;
          e.removed=0;e.reason=-1;e.gone=false;e.vanished=false;e.samples.length=0;e.alpha=1;}
        push(e,tick,e.x,e.y,e.r,e.vx,e.vy);e.lastTick=tick;}
      for(const u of snap.updates){const e=entities.get(u.id);if(!e)continue;const m=u.mask;
        if(m&UPD.X_Y){e.x=u.x;e.y=u.y;}if(m&UPD.R)e.r=u.r;if(m&UPD.V){e.vx=u.vx;e.vy=u.vy;}if(m&UPD.FLAGS)e.flags=u.flags;
        if(m&UPD.EXTRA){e.phase=u.phase;e.influenceR=u.influenceR;}
        push(e,tick,e.x,e.y,e.r,e.vx,e.vy);e.lastTick=tick;}
      for(const r of snap.removes){const e=entities.get(r.id);if(!e)continue;e.removed=tick;e.reason=r.reason;}},
    /** Última amostra de uma entidade (ou null). */
    last(e){const s=e.samples;return s.length?s[s.length-1]:null;},
    clear(){entities.clear();b.lastTick=0;b.offset=NaN;b.offsetTarget=NaN;b.offsetJitter=0;offs.length=0;b.count=0;b.late=0;b.lateMax=0;},
    delete(id){entities.delete(id);},
  };
  function push(e,tick,x,y,r,vx,vy){const s=e.samples;const l=s[s.length-1];
    if(l&&l.tick===tick){l.x=x;l.y=y;l.r=r;l.vx=vx;l.vy=vy;return;}
    if(s.length>=MAX_SAMPLES)s.shift();s.push({tick,x,y,r,vx,vy});}
  return b;}
export const isPieceOf=(e,slot)=>e.kind===KIND.PIECE&&e.owner===slot;

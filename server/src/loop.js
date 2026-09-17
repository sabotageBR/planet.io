// ── SCHEDULER: UM laço de 60 Hz por processo para todas as salas ──────────────
// Acumulador com performance.now() (corrige deriva): dorme com setTimeout(next-now-1) e fecha o
// intervalo com setImmediate; recupera até MAX_STEPS passos de atraso; além disso conta overrun e
// descarta o atraso (a simulação não tenta "voltar no tempo").
// @ts-check
import {TICK_HZ} from '@warspace/shared/constants.js';
const MAX_STEPS=5,PASSO_LENTO_MS=12;   // 12 ms = 3/4 de um tick: daqui para cima a sala sozinha já compromete o próximo
// ── A CPU DA THREAD PRINCIPAL, em ms ──────────────────────────────────────────
// É a outra metade do relógio: `performance.now()` diz quanto tempo PASSOU entre dois turnos, isto diz
// quanto a thread TRABALHOU nesse meio. Intervalo longo com CPU baixa = o processo esteve parado (cota do
// CFS, preempção); com CPU alta = havia trabalho. ⚠️ Tem que ser a da THREAD: na parada por cota quem
// gastou a CPU foram as threads auxiliares do V8, e a CPU do PROCESSO sai alta justo quando a principal
// não andou. `threadCpuUsage` existe a partir do Node 22.19 (medido: ~0,25 µs por chamada, 60×/s); a do
// processo fica como chão para um runtime mais antigo — classifica pior, mas não quebra.
const cpuDaThread=typeof process.threadCpuUsage==='function'
  ?()=>{const u=process.threadCpuUsage();return(u.user+u.system)/1000;}
  :()=>{const u=process.cpuUsage();return(u.user+u.system)/1000;};
export class Scheduler{
  /** @param {{hz?:number,metrics?:any,log?:any,cpuMs?:()=>number}} [o] `cpuMs` é injetável para o teste */
  constructor({hz=TICK_HZ,metrics=null,log=null,cpuMs=cpuDaThread}={}){
    this.period=1000/hz;this.rooms=new Set();this.metrics=metrics;this.log=log;this.cpuMs=cpuMs;
    this.running=false;this.next=0;this.overruns=0;this.steps=0;this.timer=null;this._run=this._run.bind(this);
    this._turnoAt=0;this._turnoCpu=0;this._turnoPasso=0;}
  add(room){this.rooms.add(room);if(!this.running)this.start();}
  remove(room){this.rooms.delete(room);}
  // ⚠️ `_turnoAt=0` ZERA A RÉGUA: o scheduler DORME sem salas, e o primeiro turno depois de uma hora de
  // servidor vazio não pode virar "uma parada de uma hora".
  start(){if(this.running)return;this.running=true;this.next=performance.now()+this.period;this._turnoAt=0;this._arm();}
  stop(){this.running=false;if(this.timer){clearTimeout(this.timer);this.timer=null;}}
  _arm(){const wait=this.next-performance.now()-1;if(wait>0)this.timer=setTimeout(this._run,wait);else setImmediate(this._run);}
  _run(){
    this.timer=null;if(!this.running)return;
    if(this.rooms.size===0){this.running=false;return;}          // sem salas: dorme até o próximo add()
    let now=performance.now();const m=this.metrics;
    if(now>=this.next){
      // ── de quem foi o intervalo desde o turno anterior? ── medido AQUI DENTRO, e não na entrada do
      // `_run`: o `_arm` gira em `setImmediate` no último ~1 ms de cada tick, e esses giros vazios não são
      // turnos. O caminho normal paga uma leitura de CPU e uma subtração; só o intervalo longo vira evento.
      // `_turnoPasso` = quanto do intervalo foi o PASSO das salas do turno anterior: separa "o trabalho era
      // da simulação" de "era de fora dela" (HTTP, join, GC na thread principal, um JSON gigante).
      if(m&&m.gap){const cpu=this.cpuMs();
        if(this._turnoAt&&now-this._turnoAt>=40)m.gap(now-this._turnoAt,cpu-this._turnoCpu,now,this._turnoPasso);
        this._turnoAt=now;this._turnoCpu=cpu;this._turnoPasso=0;}
      if(m)m.lag(now-this.next);let n=0;
      while(now>=this.next&&n<MAX_STEPS){
        const t0=performance.now();
        // ⚠️ O PASSO LENTO GANHA NOME: acima de `PASSO_LENTO_MS` a sala diz QUAL fase dela custou (`Room._fase`:
        // simulação × envio). Um relógio por sala por passo (~0,1 µs) para nunca mais ter de adivinhar.
        for(const r of this.rooms){const r0=performance.now();
          try{r.step();}catch(e){if(this.log)this.log.error(`sala ${r.code}: erro no passo:`,e);}
          const d=performance.now()-r0;if(d>=PASSO_LENTO_MS&&m&&m.passoLento)m.passoLento(r,d);}
        const dt=performance.now()-t0;this._turnoPasso+=dt;
        if(m)m.tick(dt);
        this.steps++;this.next+=this.period;n++;now=performance.now();}
      // ⚠️ O ATRASO VAI JUNTO: `now-this.next` é quanta simulação está sendo DESCARTADA aqui, e é o
      // número que diz se o tropeço foi de 90 ms ou de dois segundos. Sem ele, `overruns` conta
      // eventos de tamanho desconhecido — ver o bloco em metrics.js.
      if(now>=this.next){this.overruns++;if(m)m.overrun(now-this.next);this.next=now+this.period;}   // atrasou mais que MAX_STEPS: descarta
    }
    this._arm();}
}

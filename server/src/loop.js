// ── SCHEDULER: UM laço de 60 Hz por processo para todas as salas ──────────────
// Acumulador com performance.now() (corrige deriva): dorme com setTimeout(next-now-1) e fecha o
// intervalo com setImmediate; recupera até MAX_STEPS passos de atraso; além disso conta overrun e
// descarta o atraso (a simulação não tenta "voltar no tempo").
// @ts-check
import {TICK_HZ} from '@planet/shared/constants.js';
const MAX_STEPS=5;
export class Scheduler{
  /** @param {{hz?:number,metrics?:any,log?:any}} [o] */
  constructor({hz=TICK_HZ,metrics=null,log=null}={}){
    this.period=1000/hz;this.rooms=new Set();this.metrics=metrics;this.log=log;
    this.running=false;this.next=0;this.overruns=0;this.steps=0;this.timer=null;this._run=this._run.bind(this);}
  add(room){this.rooms.add(room);if(!this.running)this.start();}
  remove(room){this.rooms.delete(room);}
  start(){if(this.running)return;this.running=true;this.next=performance.now()+this.period;this._arm();}
  stop(){this.running=false;if(this.timer){clearTimeout(this.timer);this.timer=null;}}
  _arm(){const wait=this.next-performance.now()-1;if(wait>0)this.timer=setTimeout(this._run,wait);else setImmediate(this._run);}
  _run(){
    this.timer=null;if(!this.running)return;
    if(this.rooms.size===0){this.running=false;return;}          // sem salas: dorme até o próximo add()
    let now=performance.now();const m=this.metrics;
    if(now>=this.next){
      if(m)m.lag(now-this.next);let n=0;
      while(now>=this.next&&n<MAX_STEPS){
        const t0=performance.now();
        for(const r of this.rooms){try{r.step();}catch(e){if(this.log)this.log.error(`sala ${r.code}: erro no passo:`,e);}}
        if(m)m.tick(performance.now()-t0);
        this.steps++;this.next+=this.period;n++;now=performance.now();}
      if(now>=this.next){this.overruns++;if(m)m.overrun();this.next=now+this.period;}   // atrasou mais que MAX_STEPS: descarta
    }
    this._arm();}
}

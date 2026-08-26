// ── ?bench (pior caso no LocalServer) e ?stats (overlay em partidas reais) ─────────────────
// Overlay = <pre> dentro de #hud (DOM, não canvas). O index alimenta o texto a 4 Hz.
import {Q,qflag} from "./util.js";

export const isBench=()=>qflag("bench"),isStats=()=>qflag("stats")||qflag("bench");
/** Opções do LocalServer para o pior caso: 8 peças próprias, ~400 comidas visíveis, 40 asteroides, 3 buracos, 12 rastros. */
export function benchOptions(){return{bench:true,lag:+(Q.get("lag")||0),bots:Math.max(15,+(Q.get("bots")||15)),seed:+(Q.get("seed")||7)};}
export function createOverlay(hud){
  const el=document.createElement("pre");el.id="game-stats";
  el.style.cssText="position:absolute;left:12px;top:64px;z-index:9;margin:0;padding:6px 8px;font:11px/1.35 'Courier New',monospace;color:#fff;background:rgba(0,0,0,.55);border-radius:6px;pointer-events:none;white-space:pre;max-width:46vw";
  (hud||document.body).appendChild(el);let last=0;
  return{el,update(now,text){if(now-last<250)return;last=now;el.textContent=text;},destroy(){el.remove();}};}
/** Acumulador de tempos de frame (update/render) com médias e p95 por janela. */
export function createFrameStats(){const upd=[],ren=[];let sum=0,n=0;
  return{push(u,r){upd.push(u);ren.push(r);if(upd.length>240){upd.shift();ren.shift();}sum+=u+r;n++;},
    get avgUpdate(){return upd.length?upd.reduce((a,b)=>a+b,0)/upd.length:0;},get avgRender(){return ren.length?ren.reduce((a,b)=>a+b,0)/ren.length:0;},
    get p95(){if(!upd.length)return 0;const s=upd.map((u,i)=>u+ren[i]).sort((a,b)=>a-b);return s[Math.floor(s.length*.95)];},
    get avgFrame(){return this.avgUpdate+this.avgRender;},get total(){return n?sum/n:0;},reset(){upd.length=ren.length=0;sum=0;n=0;}};}

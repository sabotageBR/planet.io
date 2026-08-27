// ── FADE da troca de tema ─────────────────────────────────────────────────────
// Trocar de tema mexe em tudo de uma vez (tokens CSS do HUD/telas + rebake das texturas do Pixi): sem cobrir a
// tela o corte pisca feio. Aqui um overlay na cor do céu sobe até 1 em metade de ROUND.FADE_MS, a troca acontece
// no pico (ninguém vê) e ele volta a 0. Sem DOM (testes/SSR) a troca é direta.
import {ROUND} from "@planet/shared";

let el=null,t1=0,t2=0;
function node(){if(el||typeof document==="undefined"||!document.body)return el;
  el=document.createElement("div");el.className="theme-fade";document.body.appendChild(el);return el;}
/** Cobre a tela, chama `swap()` no escuro e descobre de volta. Devolve true se houve fade. */
export function fadeSwap(swap){
  const n=node();if(!n){swap();return false;}
  const half=Math.max(80,(ROUND.FADE_MS||600)/2);
  clearTimeout(t1);clearTimeout(t2);
  n.style.transitionDuration=half+"ms";n.classList.add("on");
  t1=setTimeout(()=>{swap();t2=setTimeout(()=>n.classList.remove("on"),50);},half);
  return true;}

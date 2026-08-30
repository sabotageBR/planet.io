// ── RODA DO MOUSE: zoom manual dentro da faixa que a MASSA permite ────────────────────────────
// Produz PASSOS (±1), não um valor contínuo, e quem guarda o fator é o `game/index.js` — aqui só se traduz
// gesto em passo. Três coisas que não são detalhe:
//
// 1. O LISTENER É NA JANELA, não no canvas — a mesma razão do `pointermove` (ver o cabeçalho de Pointer.js):
//    o #hud fica por cima e todo bloco dele que precisa de clique tem `pointer-events:auto`, então um
//    `wheel` no canvas MORRE assim que o cursor passa por cima do placar, do chat ou de um chip de powerup.
//    O jogador descobriria que "o zoom às vezes não funciona" sem nunca ligar isso ao painel embaixo do
//    cursor. Em compensação, na janela chega tudo — daí a guarda `emUI`: as telas React e a gaveta ROLAM
//    (styles/ui.css), e roubar a rolagem delas seria trocar um defeito por outro. Nenhum bloco do #hud rola
//    (são todos `overflow:hidden`), então a roda sobre o HUD é nossa por direito.
//
// 2. `preventDefault` TAMBÉM na pinça. Pinça de trackpad (macOS e Windows Precision) chega como `wheel` com
//    `ctrlKey:true`; sem o preventDefault o navegador dá zoom na PÁGINA INTEIRA — canvas, HUD e telas —, e o
//    jogador não sai disso sem Ctrl+0. Consumindo o evento, a pinça vira o mesmo passo da roda de graça.
//
// 3. PASSOS DISCRETOS, com acumulador. Contínuo não serve por três motivos independentes: `deltaMode` varia
//    (0 = pixel, 1 = linha, 2 = página), a magnitude por entalhe varia ~100× entre um mouse (±100 no Chrome)
//    e um trackpad (1–4 px por evento, a 120 Hz), e o `{t:"view"}` disputa um balde de 5 JSON/s — um valor
//    contínuo pediria envio constante.
import {ZOOM} from "@warspace/shared";
const LINE_PX=34,PAGE_PX=400;   // 3 linhas ≈ 102 px é o entalhe do Firefox; página é um chute deliberadamente grande
/** Quantos passos um evento de roda vale, dado o acumulador. Pura e testável — é onde o Firefox quebra sozinho. */
export function stepsFromWheel(deltaY,deltaMode,acc,px){
  const d=deltaY*(deltaMode===1?LINE_PX:deltaMode===2?PAGE_PX:1);
  let a=acc+d,n=0;
  while(Math.abs(a)>=px&&n<ZOOM.MAX_STEPS){const sg=a<0?-1:1;n+=sg;a-=sg*px;}   // teto por EVENTO: um deltaMode=2 não varre a faixa inteira de uma vez
  return{steps:n,acc:n?a:a>px*2?px*2:a<-px*2?-px*2:a};}
/**
 * @param {{onStep:(n:number)=>void,enabled:()=>boolean,prefs:any}} o `onStep(+1)` = afastar
 */
export function createWheel({onStep,enabled=()=>true,prefs={}}){
  let acc=0,lastT=0,curPrefs=prefs;
  // as telas React e a gaveta rolam; o #hud não. Um `closest` só, no alvo do evento.
  const emUI=t=>!!(t&&t.closest&&t.closest(".screen,.overlay,.drawer"));
  const onWheel=e=>{
    if(curPrefs.wheelZoom===false||!enabled()||emUI(e.target))return;
    e.preventDefault();   // ⚠️ inclusive (e sobretudo) com ctrlKey: senão a pinça reescala a página inteira
    const now=performance.now();
    if(now-lastT>ZOOM.ACC_MS)acc=0;   // meia rolagem de um minuto atrás não soma com a de agora
    lastT=now;
    const r=stepsFromWheel(e.deltaY,e.deltaMode|0,acc,e.ctrlKey?ZOOM.PINCH_PX:ZOOM.WHEEL_PX);
    acc=r.acc;if(r.steps)onStep(r.steps);};
  addEventListener("wheel",onWheel,{passive:false});
  return{setPrefs(p){curPrefs=p||{};},destroy(){removeEventListener("wheel",onWheel,{passive:false});}};}

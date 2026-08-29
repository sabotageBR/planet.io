// ── PONTEIRO: mouse e toque unificados (pointer events) no canvas ────────────────────────────
// Guarda a última posição de tela (o index converte para o mundo pela câmera a cada frame);
// botões → onButton(button, phase, pointerType). contextmenu bloqueado; touch-action:none.
// DUAS regras que só importam no dedo e que faltavam:
// 1. SOLTAR O DEDO PARA O PLANETA. `st.active` só voltava a false em `center()`, e o handler de `pointerup`
//    chamava `pos(e)` — que reafirma active=true. Ou seja: depois do primeiro toque o alvo ficava cravado no
//    último ponto tocado PARA SEMPRE, e não havia como ficar parado. No mouse não se nota (o cursor continua
//    existindo e se movendo); no toque era o comportamento inteiro do jogo.
// 2. UM DEDO SÓ DIRIGE. Sem guardar o ponteiro primário, qualquer segundo dedo no canvas roubava o rumo —
//    inclusive o polegar que ia apertar um botão do HUD e encostou fora dele.
export function createPointer(canvas,{onButton}){
  const st={sx:NaN,sy:NaN,down:false,type:"mouse",active:false};
  let pid=-1;   // ponteiro que está dirigindo (-1 = nenhum; o mouse dirige mesmo sem botão, por isso o `pid<0` no move)
  const pos=e=>{const r=canvas.getBoundingClientRect();st.sx=e.clientX-r.left;st.sy=e.clientY-r.top;st.type=e.pointerType||"mouse";st.active=true;};
  const move=e=>{if(pid>=0&&e.pointerId!==pid)return;pos(e);};
  const down=e=>{if(pid>=0&&e.pointerId!==pid)return;pid=e.pointerId;pos(e);st.down=true;
    try{canvas.setPointerCapture(e.pointerId);}catch{}
    if(e.button===2||e.button===1)e.preventDefault();onButton(e.button,"down",st.type);};
  const up=e=>{if(pid>=0&&e.pointerId!==pid)return;pos(e);st.down=false;pid=-1;
    if(st.type!=="mouse")st.active=false;   // dedo levantado = sem alvo: o index volta a mirar no próprio centroide (parar)
    onButton(e.button,"up",st.type);};
  const ctx=e=>e.preventDefault();
  canvas.addEventListener("pointermove",move);canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",up);
  canvas.addEventListener("contextmenu",ctx);
  return{state:st,center(W,H){st.sx=W/2;st.sy=H/2;st.active=false;pid=-1;},
    destroy(){canvas.removeEventListener("pointermove",move);canvas.removeEventListener("pointerdown",down);canvas.removeEventListener("pointerup",up);canvas.removeEventListener("pointercancel",up);canvas.removeEventListener("contextmenu",ctx);}};}

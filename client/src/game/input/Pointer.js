// ── PONTEIRO: mouse e toque unificados (pointer events) no canvas ────────────────────────────
// Guarda a última posição de tela (o index converte para o mundo pela câmera a cada frame);
// botões → onButton(button, phase, pointerType). contextmenu bloqueado; touch-action:none.
export function createPointer(canvas,{onButton}){
  const st={sx:NaN,sy:NaN,down:false,type:"mouse",active:false};
  const pos=e=>{const r=canvas.getBoundingClientRect();st.sx=e.clientX-r.left;st.sy=e.clientY-r.top;st.type=e.pointerType||"mouse";st.active=true;};
  const move=e=>pos(e),down=e=>{pos(e);st.down=true;try{canvas.setPointerCapture(e.pointerId);}catch{}if(e.button===2||e.button===1)e.preventDefault();onButton(e.button,"down",st.type);},
    up=e=>{pos(e);st.down=false;onButton(e.button,"up",st.type);},ctx=e=>e.preventDefault();
  canvas.addEventListener("pointermove",move);canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",up);
  canvas.addEventListener("contextmenu",ctx);
  return{state:st,center(W,H){st.sx=W/2;st.sy=H/2;st.active=false;},
    destroy(){canvas.removeEventListener("pointermove",move);canvas.removeEventListener("pointerdown",down);canvas.removeEventListener("pointerup",up);canvas.removeEventListener("pointercancel",up);canvas.removeEventListener("contextmenu",ctx);}};}

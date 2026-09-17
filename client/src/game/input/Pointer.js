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
// ⚠️ O `pointermove` do MOUSE é escutado na JANELA, não no canvas. O canvas parece o lugar óbvio e não é:
//    o HUD fica por cima dele, e todo elemento do HUD que precisa receber clique tem `pointer-events:auto`
//    (`styles/ui.css`) — passar o mouse sobre o chat, sobre um botão ou sobre um chip de powerup fazia o
//    canvas parar de receber `pointermove`, e o alvo do jogador CONGELAVA no último ponto lido. É por isso
//    que era impossível ter um hint no HUD sem quebrar o controle. Na janela, o alvo nunca congela — e as
//    coordenadas continuam sendo do canvas, convertidas pelo `getBoundingClientRect()`.
//    `down`/`up` continuam NO CANVAS de propósito: eles são cliques de jogo, e no HUD o clique é da UI.
// ⚠️ **O RETÂNGULO DO CANVAS É CACHEADO, e isso é conserto de ENGASGO, não microotimização.**
//    `getBoundingClientRect()` é uma leitura de LAYOUT: chamada depois de qualquer escrita no DOM, ela
//    obriga o navegador a recalcular o layout do documento inteiro ali mesmo (forced reflow). Ela estava
//    em TODO `pointermove` — num mouse de 500–1000 Hz, num listener de JANELA — e o HUD é reconciliado
//    pelo React 8 vezes por segundo (`pushHud`, game/index.js). O par "React escreve · mouse lê" é
//    layout thrashing com cadência de 8 Hz, que é exatamente a forma do sintoma: para e volta.
//    O retângulo do canvas só muda quando o LAYOUT muda, e para isso existe o `ResizeObserver` que o
//    jogo já mantém (`agendaResize` em game/index.js chama `game.resize()`, que passa por aqui). Então
//    ele é lido uma vez e invalidado por evento: resize, rolagem e a própria troca de tamanho do canvas.
//    ⚠️ `scroll` em CAPTURA e na janela: a página do jogo não rola, mas o embutidor de portal rola — e
//    um scroll de ancestral move o canvas sem disparar resize nenhum.
export function createPointer(canvas,{onButton}){
  const st={sx:NaN,sy:NaN,down:false,type:"mouse",active:false};
  let pid=-1;   // ponteiro que está dirigindo (-1 = nenhum; o mouse dirige mesmo sem botão, por isso o `pid<0` no move)
  let cx=0,cy=0,temRect=false;
  const mediu=()=>{const r=canvas.getBoundingClientRect();cx=r.left;cy=r.top;temRect=true;};
  const invalida=()=>{temRect=false;};
  const pos=e=>{if(!temRect)mediu();st.sx=e.clientX-cx;st.sy=e.clientY-cy;st.type=e.pointerType||"mouse";st.active=true;};
  // ⚠️ `e.__volante` = o dedo que DIRIGE, já tratado pelo direcional (input/Joystick.js, em captura no mesmo
  // canvas). Ele MARCA o evento em vez de dar `stopPropagation()`, porque parar o evento o escondia também do
  // SDK do portal, que escuta na bolha da janela — ver o bloco no fim de Joystick.js. Aqui o efeito é o de
  // sempre: o Pointer não vê esse dedo. As três portas têm de ter a guarda; o dedo da MIRA vem sem marca.
  const move=e=>{if(e.__volante)return;if(pid>=0&&e.pointerId!==pid)return;
    if(e.pointerType&&e.pointerType!=="mouse"&&e.target!==canvas&&pid<0)return;   // dedo fora do canvas e sem captura não dirige
    pos(e);};
  const down=e=>{if(e.__volante)return;if(pid>=0&&e.pointerId!==pid)return;pid=e.pointerId;pos(e);st.down=true;
    try{canvas.setPointerCapture(e.pointerId);}catch{}
    if(e.button===2||e.button===1)e.preventDefault();onButton(e.button,"down",st.type);};
  const up=e=>{if(e.__volante)return;if(pid>=0&&e.pointerId!==pid)return;pos(e);st.down=false;pid=-1;
    if(st.type!=="mouse")st.active=false;   // dedo levantado = sem alvo: o index volta a mirar no próprio centroide (parar)
    onButton(e.button,"up",st.type);};
  const ctx=e=>e.preventDefault();
  // UM listener, na janela: o evento do canvas borbulha até aqui de qualquer jeito, e um segundo listener no
  // canvas só faria o mesmo `pos(e)` rodar duas vezes por movimento.
  const alvoMove=typeof window!=="undefined"?window:canvas;
  alvoMove.addEventListener("pointermove",move);
  canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",up);
  canvas.addEventListener("contextmenu",ctx);
  if(typeof window!=="undefined"){addEventListener("resize",invalida);addEventListener("orientationchange",invalida);addEventListener("scroll",invalida,true);}
  return{state:st,center(W,H){st.sx=W/2;st.sy=H/2;st.active=false;pid=-1;},
    /** O canvas mudou de tamanho/lugar: a próxima leitura remede. Chamado pelo `resize()` do jogo. */
    invalida,
    destroy(){alvoMove.removeEventListener("pointermove",move);canvas.removeEventListener("pointerdown",down);canvas.removeEventListener("pointerup",up);canvas.removeEventListener("pointercancel",up);canvas.removeEventListener("contextmenu",ctx);
      if(typeof window!=="undefined"){removeEventListener("resize",invalida);removeEventListener("orientationchange",invalida);removeEventListener("scroll",invalida,true);}}};}

// ── JOYSTICK VIRTUAL (celular) ────────────────────────────────────────────────
// A preferência `joystick` existia desde sempre nas Opções e não era lida por NENHUMA linha do jogo.
// Por que ele importa: arrastando direto no canvas o dedo fica EM CIMA do próprio planeta — você tapa
// exatamente a bola que precisa ver. Com o analógico o polegar mora no canto e a tela fica livre.
//
// Origem DINÂMICA: a base nasce onde o polegar encostar dentro da metade esquerda (padrão do gênero), em vez
// de um lugar fixo que obriga a procurar. A metade direita não dirige — ela só move a MIRA, então dá para
// apontar num lado e andar para o outro, coisa que era impossível (o mesmo dedo fazia as duas coisas).
//
// A saída é a mesma de sempre: um ponto de MUNDO para `input.setTarget`. A distância é o que controla a
// velocidade (o motor anda `vmax·min(d,RAMP)/RAMP`), então empurrar o analógico até a metade anda na metade
// da velocidade — analógico de verdade, não liga/desliga.
import {SPEED} from "@warspace/shared";

const RAIO=52,MORTO=.14;   // raio da base em px de tela; abaixo de MORTO o toque é considerado parado

export function createJoystick(alvo,hud){
  const st={on:false,dx:0,dy:0,k:0,aimX:NaN,aimY:NaN,aim:false};
  let pid=-1,ox=0,oy=0,ligado=false;
  const base=document.createElement("div");base.id="joy";base.hidden=true;
  const knob=document.createElement("i");base.appendChild(knob);
  (hud||document.body).appendChild(base);
  const meia=()=>alvo.getBoundingClientRect().width/2;
  const põe=()=>{base.style.left=ox+"px";base.style.top=oy+"px";
    knob.style.transform=`translate(-50%,-50%) translate(${st.dx*st.k*RAIO}px,${st.dy*st.k*RAIO}px)`;};
  const down=e=>{
    if(!ligado||e.pointerType==="mouse")return;
    const r=alvo.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
    if(x>meia()){st.aimX=x;st.aimY=y;st.aim=true;return;}   // metade direita: só mira, não dirige
    if(pid>=0)return;
    pid=e.pointerId;ox=x;oy=y;st.on=true;st.dx=0;st.dy=0;st.k=0;
    base.hidden=false;põe();
    e.stopPropagation();e.preventDefault();};
  const move=e=>{
    if(!ligado)return;
    const r=alvo.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
    if(e.pointerId!==pid){if(st.aim&&x>meia()){st.aimX=x;st.aimY=y;}return;}
    const dx=x-ox,dy=y-oy,d=Math.hypot(dx,dy);
    st.k=Math.min(1,d/RAIO);st.dx=d>0?dx/d:0;st.dy=d>0?dy/d:0;
    if(st.k<MORTO)st.k=0;
    põe();e.stopPropagation();e.preventDefault();};
  const up=e=>{
    if(!ligado)return;
    if(e.pointerId!==pid){st.aim=false;return;}
    pid=-1;st.on=false;st.k=0;base.hidden=true;e.stopPropagation();};
  // captura: o canvas escuta na fase de bolha, então parar aqui tira o toque do Pointer sem tocar nele
  alvo.addEventListener("pointerdown",down,true);
  alvo.addEventListener("pointermove",move,true);
  alvo.addEventListener("pointerup",up,true);
  alvo.addEventListener("pointercancel",up,true);
  return{state:st,
    /** Liga/desliga: só faz sentido no dedo — no mouse o ponteiro já É o controle. */
    setEnabled(v){ligado=!!v;if(!ligado){pid=-1;st.on=false;st.aim=false;base.hidden=true;}},
    get enabled(){return ligado;},
    /** Alvo de MUNDO para o input: direção do analógico, distância = velocidade. */
    target(cx,cy){const d=SPEED.RAMP*st.k;return{x:cx+st.dx*d,y:cy+st.dy*d};},
    destroy(){alvo.removeEventListener("pointerdown",down,true);alvo.removeEventListener("pointermove",move,true);
      alvo.removeEventListener("pointerup",up,true);alvo.removeEventListener("pointercancel",up,true);base.remove();}};
}

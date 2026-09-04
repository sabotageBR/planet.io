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
//
// ⚠️ MAS ISSO SÓ VALE COM UMA PEÇA, e ignorar essa letra miúda travava o jogador dividido. O alvo é UM ponto
// para o jogador inteiro e `integratePiece` mede a distância de CADA peça até ele: com o alvo a 32 px do
// centróide e as peças a ~390 px dele (SPLIT.DIST=780), todas correm a vmax cheia PARA O CENTRO. Medido, o
// grupo andava a 8% da velocidade — e a ZERO com o eixo do split alinhado ao rumo, as duas metades correndo
// uma contra a outra. Por isso `joyTarget` soma `spread·JOY.SPREAD_K`: o alvo passa a estar longe o bastante
// para que todas as peças recebam praticamente o MESMO vetor unitário, que é o que o mouse já faz de graça.
// Com uma peça `spread` é 0 e a conta volta a ser exatamente `RAMP·k` — o analógico proporcional de sempre.
// O preço, geometricamente inevitável com um alvo só: dividido o curso do polegar deixa de graduar a
// velocidade (dar meia velocidade a peças espalhadas exigiria `d ≤ RAMP` para todas ao mesmo tempo).
import {SPEED,JOY,WORLD} from "@warspace/shared";

/**
 * O ponto de MUNDO do analógico: direção do polegar, distância = `RAMP·k` mais o espalhamento das peças.
 * ⚠️ O RECORTE AO MUNDO É POR RAIO, NUNCA POR EIXO. O alvo é saturado eixo a eixo mais adiante (`qPos` no fio
 * e `World.setTarget` no servidor), e isso TORCE a direção: medido, um centróide em (9000,4800) com o polegar
 * a 25,8° e o alvo a 2372 px sai do mundo em x e o clamp por eixo entrega 59,9° — 34 graus de erro, ou seja o
 * jogador empurra para a direita e anda na diagonal. Encurtando o raio o ângulo fica intacto. Isso não
 * aparecia antes porque o alvo nunca saía do mundo: ele ficava a 32 px do jogador.
 * @param {number} cx @param {number} cy centróide das peças próprias
 * @param {number} dx @param {number} dy direção unitária do polegar
 * @param {number} k curso do polegar, 0..1 (0 = solto: o alvo é o próprio centróide, e o grupo se reagrupa)
 * @param {number} spread maior distância de uma peça própria ao centróide (o `spread` de camera.js:focusOf)
 */
export function joyTarget(cx,cy,dx,dy,k,spread=0,out=T,w=WORLD.w,h=WORLD.h){
  let d=k>0?SPEED.RAMP*k+(spread>0?spread*JOY.SPREAD_K:0):0;
  if(d>0){const px=dx*d,py=dy*d;let t=1;   // o menor passo que ainda cabe no mundo, aplicado aos DOIS eixos (o sinal guarda a divisão)
    if(px>0){const m=(w-cx)/px;if(m<t)t=m;}else if(px<0){const m=-cx/px;if(m<t)t=m;}
    if(py>0){const m=(h-cy)/py;if(m<t)t=m;}else if(py<0){const m=-cy/py;if(m<t)t=m;}
    d=t>0?d*t:0;}
  out.x=cx+dx*d;out.y=cy+dy*d;return out;}

// RAIO: raio da base em px de TELA. MORTO: abaixo dessa fração do raio o toque é considerado parado (evita
// tremor perto do centro). PLATO: só existe por causa de um bug de PERCEPÇÃO, não de fórmula — no mouse o
// cursor mora a centenas de px do planeta, então ele passa a maior parte do tempo acima de `SPEED.RAMP`
// (32 px de MUNDO) e anda a vmax cheia; no analógico `k` é literal (d/RAIO) e `d=RAMP·k`, então vmax cheia
// exigia encostar o dedo EXATAMENTE na borda física de 52 px — qualquer folga de alguns pixels (o normal de
// um polegar, que não é um ponteiro) já cortava a velocidade, e como o corte é LINEAR em k, cortava a
// velocidade NA MESMA proporção: 90% do raio = 90% da velocidade máxima. Era "empurro até o talo e o
// planeta anda devagar assim mesmo". PLATO satura em k=1 a partir de 50% do curso: sobra METADE do raio
// como MARGEM DE ERRO do dedo antes de perder velocidade máxima, e o trecho MORTO..PLATO continua
// proporcional (analógico de verdade), só que comprimido — não muda o tamanho da base na tela, só facilita
// CHEGAR a 100%.
// ⚠️ A ORIGEM É DINÂMICA (nasce onde o dedo toca, `down()` acima), então TODO novo toque começa em k=0 —
// soltar e tocar de novo é sempre um recomeço, e antes o platô só saturava a 75% do raio (~39 px): um
// retoque rápido, com o polegar arrastando pouco, ficava preso na faixa baixa da rampa e "sentia" lento.
// Baixar o platô para 50% (~26 px) e a zona morta de .14 para .10 encurta essa distância sem mudar o
// tamanho FÍSICO da base (RAIO continua 52) nem o comportamento com peça dividida (JOY.SPREAD_K, acima).
const RAIO=52,MORTO=.10,PLATO=.5;
const T={x:0,y:0};   // saída reusada: isto roda a NET.INPUT_HZ, não é lugar de alocar objeto por chamada

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
    const dx=x-ox,dy=y-oy,d=Math.hypot(dx,dy),raw=Math.min(1,d/RAIO);
    st.k=raw<MORTO?0:raw>=PLATO?1:(raw-MORTO)/(PLATO-MORTO);
    st.dx=d>0?dx/d:0;st.dy=d>0?dy/d:0;
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
    /** Alvo de MUNDO para o input: direção do analógico, distância = velocidade + o espalhamento das peças. */
    target(cx,cy,spread,out){return joyTarget(cx,cy,st.dx,st.dy,st.k,spread||0,out);},
    destroy(){alvo.removeEventListener("pointerdown",down,true);alvo.removeEventListener("pointermove",move,true);
      alvo.removeEventListener("pointerup",up,true);alvo.removeEventListener("pointercancel",up,true);base.remove();}};
}

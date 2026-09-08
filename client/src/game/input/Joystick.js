// ── DIRECIONAL DE TOQUE (celular): o modelo do agar.io ─────────────────────────
// Aqui morava um ANALÓGICO: base e manopla desenhadas em DOM sob o polegar, na metade esquerda da tela,
// e o planeta só andava enquanto o dedo estivesse encostado. Soltar PARAVA — não por escolha, mas porque
// o `up` zerava o curso e o `enviarInput` passava a mandar o alvo em cima do próprio centróide (distância
// zero é peça imóvel, `min(d,RAMP)/RAMP` em physics/integrate.js). O preço era o jogo inteiro: o polegar
// tinha de morar na tela, tapando exatamente a bola que o jogador precisa ver, a mão nunca descansava, e
// metade da tela não dirigia.
//
// O modelo novo é o do agar.io mobile, e são CINCO regras:
//   1. QUALQUER PARTE DA TELA dirige. Não há base, não há metade esquerda, não há lugar certo de encostar.
//   2. NADA É DESENHADO SOB O DEDO. Quem informa o rumo é a seta colada ao planeta (renderer/layers/
//      Heading.js) — o indicador fica onde o jogador está OLHANDO, não onde a mão dele está tapando.
//   3. O RUMO SOBREVIVE AO DEDO ("latch"): soltar não para nada. `up()` mantém a direção e o planeta segue
//      nela até o jogador mandar outra coisa. NÃO EXISTE GESTO DE PARADA — como no agar.io, quem quer
//      parar aponta para outro lado. As únicas coisas que param o planeta são a pausa, o fim de rodada e
//      a morte (todas em game/index.js), e o nascimento, que começa sem rumo nenhum.
//   4. SOLTAR VAI A VELOCIDADE MÁXIMA (`k=1`). Enquanto o dedo está no chão o curso gradua a velocidade —
//      analógico de verdade —, mas um rumo travado a meia força seria um planeta lento sem nada na tela
//      explicando por quê. Travou, é a todo vapor.
//   5. TOCAR SEM ARRASTAR TAMBÉM DIRIGE: o rumo aponta do planeta para o ponto tocado. Sem isto, um toque
//      limpo não produzia NADA — `st.tem` só era escrito dentro do `move`, e só depois de o dedo andar
//      mais de MORTO·RAIO (5,2 px). Não era um planeta lento: era zero, e como a regra 2 não desenha nada
//      sob o dedo, a tela ficava inteiramente inerte. Visto em teste de leitura de tela: o jogador toca,
//      toca de novo, e nada acontece nem se move nem responde. Tocar onde se quer ir é o modelo mental
//      de quem chega do celular, e aqui esse gesto estava livre — no dedo o toque no canvas não atira
//      (`actions.button` ignora `type==="touch"`) e o `down` do volante já dá `stopPropagation`.
//
// OS DOIS DEDOS. Só o primeiro dirige; o segundo move a MIRA (a retícula do tiro segurado, que game/
// index.js injeta no `pointer.state`). ⚠️ Isso precisa de um complemento que não é óbvio: com o rumo
// travado, o normal passa a ser NENHUM dedo no canvas — então o dedo que vai mirar seria lido como
// "primeiro" e viraria o planeta para o alvo. Por isso `setAiming(on)`, alimentado pelo mesmo `onAim` que
// arma a reta de mira: enquanto o jogador está mirando, o próximo dedo é da MIRA, e um dedo depois DESSE
// volta a ser o volante (é a regra de PAPÉIS abaixo, não de ordem de chegada).
//
// ⚠️ A saída continua sendo a mesma de sempre — um ponto de MUNDO para `input.setTarget` —, então nada
// disto toca no protocolo, no servidor ou na física: o INPUT segue com os mesmos 10 bytes.
import {SPEED,JOY,WORLD} from "@warspace/shared";

/**
 * O ponto de MUNDO do direcional: direção do dedo, distância = `RAMP·k` mais o espalhamento das peças.
 * ⚠️ O RECORTE AO MUNDO É POR RAIO, NUNCA POR EIXO. O alvo é saturado eixo a eixo mais adiante (`qPos` no fio
 * e `World.setTarget` no servidor), e isso TORCE a direção: medido, um centróide em (9000,4800) com o dedo
 * a 25,8° e o alvo a 2372 px sai do mundo em x e o clamp por eixo entrega 59,9° — 34 graus de erro, ou seja o
 * jogador empurra para a direita e anda na diagonal. Encurtando o raio o ângulo fica intacto. Isso não
 * aparecia antes porque o alvo nunca saía do mundo: ele ficava a 32 px do jogador.
 * ⚠️ MAS A GRADUAÇÃO SÓ VALE COM UMA PEÇA, e ignorar essa letra miúda travava o jogador dividido. O alvo é UM
 * ponto para o jogador inteiro e `integratePiece` mede a distância de CADA peça até ele: com o alvo a 32 px do
 * centróide e as peças a ~390 px dele (SPLIT.DIST=780), todas correm a vmax cheia PARA O CENTRO. Medido, o
 * grupo andava a 8% da velocidade — e a ZERO com o eixo do split alinhado ao rumo, as duas metades correndo
 * uma contra a outra. Por isso soma-se `spread·JOY.SPREAD_K`: o alvo passa a estar longe o bastante para que
 * todas as peças recebam praticamente o MESMO vetor unitário, que é o que o mouse já faz de graça.
 * @param {number} cx @param {number} cy centróide das peças próprias
 * @param {number} dx @param {number} dy direção unitária do rumo
 * @param {number} k curso do dedo, 0..1 (0 = sem rumo: o alvo é o próprio centróide, e o grupo se reagrupa)
 * @param {number} spread maior distância de uma peça própria ao centróide (o `spread` de camera.js:focusOf)
 */
export function joyTarget(cx,cy,dx,dy,k,spread=0,out=T,w=WORLD.w,h=WORLD.h){
  let d=k>0?SPEED.RAMP*k+(spread>0?spread*JOY.SPREAD_K:0):0;
  if(d>0){const px=dx*d,py=dy*d;let t=1;   // o menor passo que ainda cabe no mundo, aplicado aos DOIS eixos (o sinal guarda a divisão)
    if(px>0){const m=(w-cx)/px;if(m<t)t=m;}else if(px<0){const m=-cx/px;if(m<t)t=m;}
    if(py>0){const m=(h-cy)/py;if(m<t)t=m;}else if(py<0){const m=-cy/py;if(m<t)t=m;}
    d=t>0?d*t:0;}
  out.x=cx+dx*d;out.y=cy+dy*d;return out;}

// RAIO: curso do dedo, em px de TELA, que vale velocidade máxima. Não desenha mais nada (a base saiu), é
// só a régua do gesto. MORTO: abaixo dessa fração o arrasto é ruído de dedo pousando e NÃO troca o rumo.
// PLATO: satura em k=1 a partir de metade do curso — no mouse o cursor mora a centenas de px do planeta,
// então ele passa quase todo o tempo acima de `SPEED.RAMP` e anda a vmax cheia; no dedo `k` é literal
// (d/RAIO), e sem o platô a velocidade máxima exigia encostar EXATAMENTE na borda dos 52 px. Qualquer
// folga (o normal de um polegar, que não é um ponteiro) cortava a velocidade na mesma proporção: 90% do
// curso = 90% da velocidade. Com PLATO sobra METADE do raio como margem de erro, e o trecho MORTO..PLATO
// continua proporcional.
const RAIO=52,MORTO=.10,PLATO=.5;
// TOQUE_MIN: distância, em px de TELA, entre o dedo e o CENTRO DA CÂMERA (onde o planeta é desenhado —
// `Renderer.js` põe `cam.x,cam.y` em `W/2,H/2`) abaixo da qual um toque não vira rumo. Tocar em cima do
// próprio planeta não diz para onde ir: ali a direção é imprecisão de polegar, e girar o planeta por
// causa dela seria pior que ignorar. Acima disso vale a regra 4 e o rumo trava a todo vapor.
const TOQUE_MIN=40;
const T={x:0,y:0};   // saída reusada: isto roda a NET.INPUT_HZ, não é lugar de alocar objeto por chamada

/** Curso cru do dedo (0..1 do RAIO) → acelerador 0..1: zona morta, rampa e platô. Pura, para poder ser testada. */
export function cursoK(raw){return raw<MORTO?0:raw>=PLATO?1:(raw-MORTO)/(PLATO-MORTO);}

/**
 * Regra 5: direção unitária de um TOQUE, medida do planeta para o dedo. `null` = toque perto demais do
 * planeta para dizer alguma coisa, e aí o rumo anterior fica de pé (é o mesmo princípio da zona morta do
 * arrasto). Pura pelo motivo de sempre: `createJoystick` é DOM e não há jsdom no projeto.
 * @param {number} dx @param {number} dy do centro da câmera até o ponto tocado, em px de TELA
 */
export function toqueDir(dx,dy){const d=Math.hypot(dx,dy);
  return d>=TOQUE_MIN?{dx:dx/d,dy:dy/d}:null;}

/**
 * A máquina do rumo, SEM DOM: recebe coordenadas de tela e mantém `{on,tem,dx,dy,k}`. Fica separada dos
 * handlers porque é aqui que moram as quatro regras do cabeçalho, e porque não há jsdom no projeto — o
 * padrão da casa para decisão testável é a função pura (game/quality.js, admin/ordenar.js, ui/roundClock.js).
 * `on` = há dedo no chão · `tem` = há rumo (com ou sem dedo) — é `tem` que o enviarInput consulta.
 */
export function createRumo(st={on:false,tem:false,dx:0,dy:0,k:0}){
  let ox=0,oy=0,ux=0,uy=0,arrastou=false;
  return{state:st,
    /** ⚠️ NÃO zera o rumo: zerar aqui faria o planeta dar um solavanco de parada no instante do toque. */
    down(x,y){ox=ux=x;oy=uy=y;arrastou=false;st.on=true;},
    /** Abaixo da zona morta o rumo ANTERIOR fica de pé — senão o dedo pousando apagaria o rumo travado. */
    move(x,y){ux=x;uy=y;const dx=x-ox,dy=y-oy,d=Math.hypot(dx,dy);if(d<=0)return;
      const raw=Math.min(1,d/RAIO);if(raw<MORTO)return;
      st.dx=dx/d;st.dy=dy/d;st.k=cursoK(raw);st.tem=true;arrastou=true;},
    /**
     * Solta o dedo e TRAVA o rumo, sempre a todo vapor (regra 4).
     * Recebendo o centro da câmera, um gesto que NUNCA passou da zona morta é lido como TOQUE e vira rumo
     * (regra 5) — é o único caminho que cria rumo fora do `move`.
     * ⚠️ Sem argumentos NÃO há conversão, e isso é o contrato de `release()`: a pinça e a pausa largam o
     * dedo sem que o jogador tenha pedido rumo nenhum, e ali um toque convertido viraria o planeta sozinho.
     * @param {number} [cx] @param {number} [cy] centro da câmera em px de TELA (= onde o planeta é desenhado)
     */
    up(cx,cy){st.on=false;
      if(!arrastou&&cx!==undefined&&cy!==undefined){
        const t=toqueDir(ux-cx,uy-cy);
        if(t){st.dx=t.dx;st.dy=t.dy;st.tem=true;}}
      if(st.tem)st.k=1;},
    /** A única coisa que devolve o planeta ao estado parado: nascer, renascer, desligar o controle. */
    reset(){st.on=false;st.tem=false;st.dx=0;st.dy=0;st.k=0;arrastou=false;}};}

export function createJoystick(alvo){
  const st={on:false,tem:false,dx:0,dy:0,k:0,aim:false,aimX:NaN,aimY:NaN};
  const rumo=createRumo(st);
  let pid=-1,aimPid=-1,ligado=false,mirando=false;
  // PAPÉIS, não ordem de chegada: há uma vaga de volante e uma de mira. O dedo novo vai para a MIRA se ela
  // está vaga E (o volante já está ocupado OU o jogador está mirando); senão pega o volante. Assim tanto
  // "dirijo e depois miro" quanto "miro e depois dirijo" funcionam, e um terceiro dedo é ignorado.
  const down=e=>{
    if(!ligado||e.pointerType==="mouse")return;
    const r=alvo.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
    if(aimPid<0&&(pid>=0||mirando)){aimPid=e.pointerId;st.aim=true;st.aimX=x;st.aimY=y;return;}   // sem stopPropagation: a mira precisa que o Pointer veja o dedo
    if(pid>=0)return;
    pid=e.pointerId;rumo.down(x,y);
    e.stopPropagation();e.preventDefault();};
  const move=e=>{
    if(!ligado)return;
    const r=alvo.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
    if(e.pointerId===pid){rumo.move(x,y);e.stopPropagation();e.preventDefault();return;}
    if(e.pointerId===aimPid){st.aimX=x;st.aimY=y;}};
  const up=e=>{
    if(!ligado)return;
    // O centro do canvas É o planeta (`Renderer.js` desenha `cam.x,cam.y` em `W/2,H/2`), e é o que a regra 5
    // precisa para transformar um toque em direção. Passar a CÂMERA e não o centróide é de propósito: o
    // jogador aponta para o que ele VÊ, e a câmera é suavizada.
    if(e.pointerId===pid){const r=alvo.getBoundingClientRect();
      pid=-1;rumo.up(r.width/2,r.height/2);e.stopPropagation();return;}   // o rumo FICA: soltar não para
    if(e.pointerId===aimPid){aimPid=-1;st.aim=false;}};
  // ⚠️ `pointercancel` tem handler PRÓPRIO: gesto cancelado (o navegador assumiu o toque) não é um toque
  // deliberado, e convertê-lo em rumo viraria o planeta por causa de algo que o jogador não pediu.
  const cancel=e=>{
    if(!ligado)return;
    if(e.pointerId===pid){pid=-1;rumo.up();return;}
    if(e.pointerId===aimPid){aimPid=-1;st.aim=false;}};
  // captura: o canvas escuta na fase de bolha, então parar aqui tira o toque do Pointer sem tocar nele.
  // ⚠️ Agora isso vale em QUALQUER ponto do canvas (antes só na metade esquerda), então o Pointer deixa de
  // ver o down/up do dedo que dirige. É inócuo — `actions.button` já ignora `type==="touch"` e quem liga o
  // `pointer.state.active` no dedo é o dedo da MIRA, via game/index.js —, mas é uma mudança silenciosa.
  alvo.addEventListener("pointerdown",down,true);
  alvo.addEventListener("pointermove",move,true);
  alvo.addEventListener("pointerup",up,true);
  alvo.addEventListener("pointercancel",cancel,true);
  return{state:st,
    /** Liga/desliga: só faz sentido no dedo — no mouse o ponteiro já É o controle. */
    setEnabled(v){ligado=!!v;if(!ligado){pid=-1;aimPid=-1;st.aim=false;rumo.reset();}},
    get enabled(){return ligado;},
    /** O jogador está com a mira armada (game/index.js:onAim): o próximo dedo é da MIRA, não do volante. */
    setAiming(on){mirando=!!on;},
    /** Larga o rumo de vez — o planeta fica parado. Nascer e renascer passam por aqui. */
    reset(){pid=-1;aimPid=-1;st.aim=false;rumo.reset();},
    /** Larga o DEDO mantendo o rumo. Para a pinça (que não pode virar o planeta) e para a pausa, onde o
     *  `up` pode nunca chegar porque o modal cobre o canvas. */
    release(){if(pid>=0){pid=-1;rumo.up();}},
    /** Alvo de MUNDO para o input: direção do rumo, distância = velocidade + o espalhamento das peças. */
    target(cx,cy,spread,out){return joyTarget(cx,cy,st.dx,st.dy,st.k,spread||0,out);},
    destroy(){alvo.removeEventListener("pointerdown",down,true);alvo.removeEventListener("pointermove",move,true);
      alvo.removeEventListener("pointerup",up,true);alvo.removeEventListener("pointercancel",cancel,true);}};
}

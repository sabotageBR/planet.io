// ── TEM GENTE AQUI: o detector de gesto humano ────────────────────────────────
// Ele responde a UMA pergunta que o resto do jogo não sabia responder: "ainda tem alguém do outro lado?".
// Duas coisas dependem dela — a contagem do respawn na tela de morte, que só ARMA depois do primeiro gesto
// (senão a aba esquecida renasce sozinha para sempre), e o `{t:"awake"}`, que conta ao servidor que a pessoa
// está presente mesmo quando o INPUT não conta.
//
// ⚠️ POR QUE ELE NÃO É O `Pointer.js`, que já escuta `pointermove` na janela. Três razões independentes:
//   (a) o Pointer só NASCE depois do `createRenderer(...).then()` e morre no `leave()` — este precisa existir
//       antes da partida, durante ela, na tela de morte e no fim de rodada;
//   (b) o `pos(e)` de lá faz `getBoundingClientRect()` por evento e devolve coordenadas de CANVAS, que aqui
//       não servem para nada;
//   (c) ele tem guardas de `pointerId` e de captura que descartam eventos que SÃO gesto de gente.
// O custo aqui é uma subtração e uma comparação por evento.
//
// ⚠️ O LIMIAR EM PIXELS DE TELA É OBRIGATÓRIO, não é zelo. O navegador dispara `pointermove` quando o
// elemento sob o cursor muda — e a própria tela de morte, ao montar, desloca o layout debaixo do ponteiro —,
// além do jitter sub-pixel de trackpad. Sem ele a contagem armaria sozinha no instante da morte e a mudança
// inteira seria inerte. E em pixels de TELA, nunca de mundo: o mundo se move sozinho (o planeta persegue o
// cursor e a câmera vai junto, então o ponto de MUNDO sob o mesmo pixel muda sem ninguém tocar em nada).
//
// ⚠️ AQUI NÃO SE FILTRA `activeElement`, ao contrário do `Keyboard.js`. Lá o filtro existe para escrever
// "amanha" no chat não dividir o planeta; aqui digitar no chat É estar presente. Essa diferença é a razão de
// este arquivo existir separado.
const MOVE_PX=8;   // acumulados desde o último carimbo
/**
 * @param {{onAtivo:(now:number)=>void,hud?:Element|null}} o
 */
export function createActivity({onAtivo,hud=null}){
  let lx=NaN,ly=NaN,acc=0;
  const bate=()=>{lx=NaN;ly=NaN;acc=0;onAtivo(performance.now());};
  const onMove=e=>{
    const x=e.clientX,y=e.clientY;
    if(!Number.isFinite(lx)){lx=x;ly=y;return;}
    acc+=Math.abs(x-lx)+Math.abs(y-ly);lx=x;ly=y;
    if(acc>=MOVE_PX)bate();};
  // ⚠️ `!e.repeat`: o auto-repeat de uma tecla presa embaixo de um objeto marcaria presença eterna — que é
  // exatamente o jogador que isto existe para encontrar.
  const onKey=e=>{if(!e.repeat)bate();};
  const onDown=()=>bate();
  // ⚠️ `touchstart` NÃO entra: todo alvo suportado sintetiza `pointerdown`, e dois listeners para o mesmo
  // gesto contariam duas vezes sem comprar nada. O pedido falava em mouse, mas no celular não há mouse — sem
  // o ponteiro do dedo a tela de morte ficaria travada para sempre em metade do público de um .io.
  // ⚠️ CAPTURA, não bolha. O detector existe para responder "alguém fez alguma coisa?", e na bolha
  // qualquer `stopPropagation()` no caminho ESCONDE o gesto dele — e os handlers do canvas ficam todos
  // entre o alvo e a janela. (O `down` do direcional virtual JÁ DEU `stopPropagation` — hoje ele só MARCA o
  // evento, porque parar escondia o toque também do SDK do portal; ver o fim de input/Joystick.js. A captura
  // fica: ela não depende de ninguém no caminho se comportar.) Na captura o evento passa por aqui ANTES de qualquer um
  // deles, e ninguém consegue mentir sobre presença. Isso deixou de ser detalhe quando o
  // `gameplayStart` da Poki passou a depender do PRIMEIRO INPUT (ver portal/sessao.js): no dedo, um
  // toque sem arrastar pode ser o único input que existe, e engoli-lo é o evento não sair nunca.
  // ⚠️ O `removeEventListener` TEM que repetir o flag — sem ele o listener não sai, e `destroy()` vira
  // um vazamento silencioso.
  const CAP={capture:true,passive:true};
  addEventListener("pointermove",onMove,CAP);
  addEventListener("pointerdown",onDown,CAP);
  addEventListener("pointerup",onDown,CAP);
  addEventListener("keydown",onKey,{capture:true});
  addEventListener("wheel",onDown,CAP);   // roda e pinça de trackpad
  if(hud)hud.addEventListener("warspace:action",onDown);   // os botões de toque do HUD
  return{
    /** O clique num botão da UI também é gesto — quem chama sabe disso sem depender de bubbling. */
    marca:bate,
    destroy(){
      removeEventListener("pointermove",onMove,CAP);removeEventListener("pointerdown",onDown,CAP);
      removeEventListener("pointerup",onDown,CAP);removeEventListener("keydown",onKey,{capture:true});
      removeEventListener("wheel",onDown,CAP);
      if(hud)hud.removeEventListener("warspace:action",onDown);}};}

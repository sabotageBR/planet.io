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
  addEventListener("pointermove",onMove,{passive:true});
  addEventListener("pointerdown",onDown,{passive:true});
  addEventListener("pointerup",onDown,{passive:true});
  addEventListener("keydown",onKey);
  addEventListener("wheel",onDown,{passive:true});   // roda e pinça de trackpad
  if(hud)hud.addEventListener("warspace:action",onDown);   // os botões de toque do HUD
  return{
    /** O clique num botão da UI também é gesto — quem chama sabe disso sem depender de bubbling. */
    marca:bate,
    destroy(){
      removeEventListener("pointermove",onMove);removeEventListener("pointerdown",onDown);
      removeEventListener("pointerup",onDown);removeEventListener("keydown",onKey);
      removeEventListener("wheel",onDown);
      if(hud)hud.removeEventListener("warspace:action",onDown);}};}

// ── ZOOM POR PINÇA (mobile) ────────────────────────────────────────────────────
// Só entra em modo PINÇA quando os DOIS toques COMEÇAM perto um do outro (o gesto de verdade, polegar
// e indicador quase colados). Dois toques afastados são o combo normal de mover+mirar que Joystick.js
// já usa (o primeiro dedo dirige, o segundo mira), e sem esse limiar o zoom oscilaria sozinho toda vez
// que alguém jogasse com os dois polegares.
//
// Não disputa nada com o Joystick: os dois módulos leem os MESMOS eventos do canvas de forma
// independente (nenhum chama `stopImmediatePropagation`, que é a única coisa que cortaria outro listener no
// MESMO elemento — e hoje nem `stopPropagation` há: o Joystick só MARCA o evento, ver o fim dele) — quem
// decide mover/mirar continua sendo só o Joystick, e a pinça só participa do zoom, nunca do alvo do jogador.
//
// ⚠️ MAS ELE PRECISA AVISAR QUE COMEÇOU (`onPinch`). Enquanto o direcional só valia na metade esquerda,
// uma pinça na metade direita não mexia no rumo; agora que QUALQUER dedo dirige, o primeiro dedo da
// pinça é o volante — e dar zoom viraria o planeta junto. O aviso sai UMA vez, no instante em que o par
// é fechado, e o index o liga em `joy.release()`: o rumo travado fica exatamente onde estava e a pinça
// volta a ser só zoom.
const LIMIAR=220;   // px de TELA: distância máxima entre os dois toques, no instante em que o 2º pousa, para contar como pinça

export function createPinch(alvo,{onZoom,onPinch}={}){
  const toques=new Map();   // pointerId → {x,y} de TELA, de todo toque ativo no canvas
  let par=null,dist=0;      // os dois ids em pinça no momento, e a última distância medida entre eles
  const dedos=()=>Math.hypot(toques.get(par[0]).x-toques.get(par[1]).x,toques.get(par[0]).y-toques.get(par[1]).y);
  const down=e=>{
    if(e.pointerType!=="touch")return;
    const r=alvo.getBoundingClientRect();
    toques.set(e.pointerId,{x:e.clientX-r.left,y:e.clientY-r.top});
    if(par||toques.size!==2)return;   // só o 2º toque decide se é pinça; um 3º dedo não reabre a decisão
    const ids=[...toques.keys()];
    const d=Math.hypot(toques.get(ids[0]).x-toques.get(ids[1]).x,toques.get(ids[0]).y-toques.get(ids[1]).y);
    if(d<=LIMIAR){par=ids;dist=d;if(onPinch)onPinch();}};
  const move=e=>{
    if(!toques.has(e.pointerId))return;
    const r=alvo.getBoundingClientRect();
    toques.set(e.pointerId,{x:e.clientX-r.left,y:e.clientY-r.top});
    if(!par||(e.pointerId!==par[0]&&e.pointerId!==par[1]))return;
    const d=dedos();
    // razão em relação à distância ANTERIOR (não à inicial): sem isso o zoom acumularia deriva se a mão
    // tremesse — a cada frame só importa o quanto os dedos se moveram desde a última leitura.
    if(dist>0&&d>0&&onZoom)onZoom(d/dist);
    dist=d;};
  const up=e=>{
    toques.delete(e.pointerId);
    if(par&&(e.pointerId===par[0]||e.pointerId===par[1])){par=null;dist=0;}};
  // captura, como Joystick.js: o canvas escuta na fase de bolha, e capturar aqui não impede o Joystick de
  // ver o mesmo evento — nenhum dos dois corta listeners irmãos no MESMO nó.
  alvo.addEventListener("pointerdown",down,true);
  alvo.addEventListener("pointermove",move,true);
  alvo.addEventListener("pointerup",up,true);
  alvo.addEventListener("pointercancel",up,true);
  return{destroy(){
    alvo.removeEventListener("pointerdown",down,true);alvo.removeEventListener("pointermove",move,true);
    alvo.removeEventListener("pointerup",up,true);alvo.removeEventListener("pointercancel",up,true);}};
}

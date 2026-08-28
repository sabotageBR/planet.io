// ── TECLADO: Space = dividir, W = ejetar (segurar), F = míssil, Ctrl = falar (push-to-talk) ──
// `inInput()` ignora tudo com o foco num campo de texto — é o que faz digitar no chat NÃO dividir o
// planeta, e vale de graça para o Ctrl também.
const MAP={Space:"split",KeyW:"eject",KeyF:"fire",ControlLeft:"talk",ControlRight:"talk"};
export function createKeyboard({onAction,enabled=()=>true}){
  const held=new Set();
  const inInput=()=>{const a=document.activeElement;return a&&/INPUT|SELECT|TEXTAREA/.test(a.tagName);};
  const kd=e=>{const a=MAP[e.code];if(!a||inInput()||!enabled())return;if(e.code==="Space"||a==="talk")e.preventDefault();if(e.repeat||held.has(a))return;held.add(a);onAction(a,"down");};   // sem preventDefault o Ctrl continua abrindo atalho do navegador
  const ku=e=>{const a=MAP[e.code];if(!a)return;if(held.delete(a))onAction(a,"up");};
  const blur=()=>{for(const a of held)onAction(a,"up");held.clear();};
  addEventListener("keydown",kd);addEventListener("keyup",ku);addEventListener("blur",blur);
  return{destroy(){removeEventListener("keydown",kd);removeEventListener("keyup",ku);removeEventListener("blur",blur);}};}

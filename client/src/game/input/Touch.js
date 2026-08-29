// ── BOTÕES DO HUD (React): CustomEvent `warspace:action` {action, phase} que borbulha até #hud ──
export function createTouchButtons(hud,{onAction}){
  const h=e=>{const d=e.detail;if(d&&d.action)onAction(d.action,d.phase||"down");};
  if(hud)hud.addEventListener("warspace:action",h);
  return{destroy(){if(hud)hud.removeEventListener("warspace:action",h);}};}

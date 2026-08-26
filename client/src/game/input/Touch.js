// ── BOTÕES DO HUD (React): CustomEvent `planet:action` {action, phase} que borbulha até #hud ──
export function createTouchButtons(hud,{onAction}){
  const h=e=>{const d=e.detail;if(d&&d.action)onAction(d.action,d.phase||"down");};
  if(hud)hud.addEventListener("planet:action",h);
  return{destroy(){if(hud)hud.removeEventListener("planet:action",h);}};}

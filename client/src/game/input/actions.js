// ── AÇÕES: teclado/HUD/mouse → flags do InputSender (split, eject one-shot + hold, fire com mira) ──
// Tiro: o botão/tecla SEGURADO mira (a reta pontilhada aparece pelo onAim) e o disparo sai ao SOLTAR —
// segurou ≥ AIM_MS vai com INPUT_FLAG.AIM (míssil reto na direção do ponteiro), clique rápido continua
// teleguiado/interceptador. Sem munição, o botão de tiro ejeta massa como antes (no `down`).
import {INPUT_FLAG} from "@planet/shared";

const AIM_MS=160;
/** prefs(): {holdEject,rightSplit}; ammo(): mísseis atuais; canAct(): vivo e conectado; onAim(on): liga/desliga a reta */
export function createActions({input,prefs,ammo,canAct,onAim=null}){
  let aimAt=0;   // performance.now() do início da mira (0 = não está mirando)
  const setAim=on=>{aimAt=on?performance.now():0;if(onAim)onAim(on);};
  const act=(action,phase)=>{if(!canAct()){if(phase==="up"){input.setHold(false);if(aimAt)setAim(false);}return;}
    if(action==="split"){if(phase==="down")input.press(INPUT_FLAG.SPLIT);}
    else if(action==="eject"){if(phase==="down"){input.press(INPUT_FLAG.EJECT);if(prefs().holdEject!==false)input.setHold(true);}else input.setHold(false);}
    else if(action==="fire"){
      if(phase==="down"){if(ammo()>0)setAim(true);else input.press(INPUT_FLAG.EJECT);}
      else if(aimAt){const held=performance.now()-aimAt;setAim(false);input.press(held>=AIM_MS?INPUT_FLAG.FIRE|INPUT_FLAG.AIM:INPUT_FLAG.FIRE);}}};
  return{act,
    /** botão do ponteiro: 0 = míssil (segurar mira) / ejetar, 2 = dividir (prefs.rightSplit) */
    button(btn,phase,type){if(type==="touch")return;if(btn===0)act("fire",phase);else if(btn===2&&prefs().rightSplit!==false)act("split",phase);}};}

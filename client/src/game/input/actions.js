// ── AÇÕES: teclado/HUD/mouse → flags do InputSender (split, eject one-shot + hold, fire) ────
import {INPUT_FLAG} from "@planet/shared";

/** prefs(): {holdEject,rightSplit}; ammo(): mísseis atuais; canAct(): vivo e conectado */
export function createActions({input,prefs,ammo,canAct}){
  const act=(action,phase)=>{if(!canAct()){if(phase==="up")input.setHold(false);return;}
    if(action==="split"){if(phase==="down")input.press(INPUT_FLAG.SPLIT);}
    else if(action==="eject"){if(phase==="down"){input.press(INPUT_FLAG.EJECT);if(prefs().holdEject!==false)input.setHold(true);}else input.setHold(false);}
    else if(action==="fire"){if(phase==="down")input.press(ammo()>0?INPUT_FLAG.FIRE:INPUT_FLAG.EJECT);}};
  return{act,
    /** botão do ponteiro: 0 = míssil/ejetar, 2 = dividir (prefs.rightSplit) */
    button(btn,phase,type){if(type==="touch")return;if(btn===0)act("fire",phase);else if(btn===2&&prefs().rightSplit!==false)act("split",phase);}};}

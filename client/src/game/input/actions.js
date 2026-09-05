// ── AÇÕES: teclado/HUD/mouse → flags do InputSender (split, eject one-shot + hold, fire com mira, swap) ──
// CANCELAR o tiro: com a mira carregada, o ESPAÇO (e o botão direito, que é a mesma ação "split") desarma em vez
// de dividir — e como o `down` do tiro não manda NADA para o servidor, cancelar é 100% local: some a reta, e o
// `up` do botão cai fora do `if(held)` e não dispara. O preço é não dar para dividir com um tiro carregado.
// Tiro: a mira só ARMA depois de AIM_MS com o botão/tecla segurado — é aí que a reta pontilhada aparece
// (onAim(true)) e o disparo, ao SOLTAR, vai com INPUT_FLAG.AIM (o míssil persegue a bolinha mais próxima
// do ponteiro). Clique rápido (soltar antes de AIM_MS) continua teleguiado/interceptador e
// nunca desenha reta. Sem munição, o botão de tiro NÃO ejeta massa — isso é EXCLUSIVO da tecla W (ver
// "eject" acima); o clique/F sem munição só chama onNoAmmo() para o som de "não pode".
import {INPUT_FLAG} from "@warspace/shared";

const AIM_MS=160;
/** prefs(): {holdEject,rightSplit}; ammo(): mísseis atuais; canAct(): vivo e conectado; onAim(on): liga/desliga a reta; onCancel(): o tiro foi cancelado; onNoAmmo(): tiro sem munição */
export function createActions({input,prefs,ammo,canAct,onAim=null,onCancel=null,onNoAmmo=null}){
  let held=false,armed=false,timer=0;   // held: botão de tiro apertado; armed: passou de AIM_MS (reta na tela)
  const setAim=on=>{if(armed===on)return;armed=on;if(onAim)onAim(on);};
  const disarm=()=>{if(timer){clearTimeout(timer);timer=0;}held=false;setAim(false);};
  const act=(action,phase)=>{if(!canAct()){if(phase==="up"){input.setHold(false);disarm();}return;}
    if(action==="split"){if(phase==="down"){if(held){disarm();if(onCancel)onCancel();return;}input.press(INPUT_FLAG.SPLIT);}}
    else if(action==="eject"){if(phase==="down"){input.press(INPUT_FLAG.EJECT);if(prefs().holdEject!==false)input.setHold(true);}else input.setHold(false);}
    else if(action==="swap"){if(phase==="down"){disarm();input.press(INPUT_FLAG.SWAP);}}   // trocar com a mira carregada desarma: a arma nova não herda o alvo
    else if(action==="fire"){
      if(phase==="down"){if(held)return;
        if(ammo()>0){held=true;timer=setTimeout(()=>{timer=0;setAim(true);},AIM_MS);}
        else if(onNoAmmo)onNoAmmo();}   // sem munição: NUNCA ejeta massa (isso é só da tecla W) — só avisa por som
      else if(held){const aimed=armed;disarm();input.press(aimed?INPUT_FLAG.FIRE|INPUT_FLAG.AIM:INPUT_FLAG.FIRE);}}};
  return{act,
    /**
     * Larga TUDO o que estava segurado. Quem chama é o menu de pausa: `canAct()` já passa a recusar as ações
     * novas, mas o botão de tiro que ficou apertado só receberia o `up` depois — e com o modal na frente esse
     * `up` pode nunca vir, deixando a mira armada e o W preso enquanto o jogador mexe no volume.
     */
    reset(){disarm();input.setHold(false);},
    /** botão do ponteiro: 0 = míssil (segurar mira) — sem munição não faz nada além de avisar; 2 = dividir (prefs.rightSplit) */
    button(btn,phase,type){if(type==="touch")return;if(btn===0)act("fire",phase);else if(btn===2&&prefs().rightSplit!==false)act("split",phase);},
    destroy(){disarm();}};}

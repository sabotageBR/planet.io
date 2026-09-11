// ── AÇÕES: teclado/HUD/mouse → flags do InputSender (split, eject one-shot + hold, fire com mira, swap) ──
// CANCELAR o tiro: com a mira carregada, o ESPAÇO (e o botão direito, que é a mesma ação "split") desarma em vez
// de dividir — e como o `down` do tiro não manda NADA para o servidor, cancelar é 100% local: some a reta, e o
// `up` do botão cai fora do `if(held)` e não dispara. O preço é não dar para dividir com um tiro carregado.
// Tiro: a mira só ARMA depois de AIM_MS com o botão/tecla segurado — é aí que a reta pontilhada aparece
// (onAim(true)) e o disparo, ao SOLTAR, vai com INPUT_FLAG.AIM (o míssil persegue a bolinha mais próxima
// do ponteiro). Clique rápido (soltar antes de AIM_MS) continua teleguiado/interceptador e
// nunca desenha reta. Sem munição, o botão de tiro NÃO ejeta massa — isso é EXCLUSIVO da tecla W (ver
// "eject" acima); o clique/F sem munição só chama onNoAmmo() para o som de "não pode".
import {INPUT_FLAG,MISSILE} from "@warspace/shared";

// ── O LIMIAR DA MIRA É MAIOR NO DEDO, E ISSO CONSERTA DOIS DEFEITOS DE UMA VEZ ──────────────────────
// `AIM_MS` era 160 ms fixo, CAPTURADO na carga do módulo — o antipadrão que `SPLIT.MIN_R` documenta. E
// 160 ms está DENTRO da cauda de um toque de polegar num botão de ação, ou seja o jogador de celular
// arma a mira sem saber que armou. O preço disso é alto e vem por dois caminhos independentes:
//   · O TIRO DEIXA DE ACERTAR. `aimTarget` exige alvo a menos de `MISSILE.AIM_PICK` do "cursor", e no
//     dedo esse cursor é o alvo de MOVIMENTO (a mira do dedo nunca chegou ao servidor). Não achando
//     nada, o míssil sai RETO — o clique teleguiado, que acertaria alguém em qualquer canto do mapa,
//     vira um foguete burro.
//   · O VOLANTE É ROUBADO. `setAim(true)` chama `onAim(true)` → `joy.setAiming(true)`, e pela regra de
//     PAPÉIS do Joystick o PRÓXIMO dedo vai para a MIRA, não para o volante. Enquanto o polegar segura o
//     FOGO, o outro dedo não dirige — que é literalmente o sintoma "o planeta não anda" que o 1.14 manda
//     investigar como regressão. O item 1 do T6 estava CAUSANDO o item 3.
// ⚠️ Os dois números são tunables de escopo 'wire' e são lidos A CADA CHAMADA: `MISSILE` já está em
// RAIZES_WIRE, então o painel pode calibrar o limiar do dedo sem um pacote novo — que é o ponto, porque
// o número certo sai de medição em aparelho real, não de palpite.
/** prefs(): {holdEject,rightSplit}; ammo(): mísseis atuais; canAct(): vivo e conectado; onAim(on): liga/desliga a reta; onCancel(): o tiro foi cancelado; onNoAmmo(): tiro sem munição */
export function createActions({input,prefs,ammo,canAct,dedo=()=>false,onAim=null,onCancel=null,onNoAmmo=null}){
  let held=false,armed=false,timer=0;   // held: botão de tiro apertado; armed: passou de AIM_MS (reta na tela)
  const setAim=on=>{if(armed===on)return;armed=on;if(onAim)onAim(on);};
  const disarm=()=>{if(timer){clearTimeout(timer);timer=0;}held=false;setAim(false);};
  const act=(action,phase)=>{if(!canAct()){if(phase==="up"){input.setHold(false);disarm();}return;}
    if(action==="split"){if(phase==="down"){if(held){disarm();if(onCancel)onCancel();return;}input.press(INPUT_FLAG.SPLIT);}}
    else if(action==="eject"){if(phase==="down"){input.press(INPUT_FLAG.EJECT);if(prefs().holdEject!==false)input.setHold(true);}else input.setHold(false);}
    else if(action==="swap"){if(phase==="down"){disarm();input.press(INPUT_FLAG.SWAP);}}   // trocar com a mira carregada desarma: a arma nova não herda o alvo
    else if(action==="fire"){
      if(phase==="down"){if(held)return;
        // ⚠️ `dedo()` é um GETTER, não um valor: ele muda quando o jogador troca mouse por toque, e
        // capturá-lo na criação deixaria o limiar errado para sempre. A fonte é o MESMO
        // `matchMedia("(pointer: coarse)")` que liga o direcional e escolhe a frase da dica.
        if(ammo()>0){held=true;timer=setTimeout(()=>{timer=0;setAim(true);},dedo()?MISSILE.AIM_MS_TOUCH:MISSILE.AIM_MS);}
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

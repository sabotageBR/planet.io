// ── A DICA DO DIVIDIR ─────────────────────────────────────────────────────────
// O jogo nunca contou a ninguém como se alcança alguém, e a física torna isso indescobrível sozinho:
// `vmax = 2110,6/r^0,449` faz a PRESA ser sempre mais rápida que o predador (ser maior é a condição para
// comer, e ser maior é ser mais lento), então perseguir NUNCA funciona — não é difícil, é impossível. O
// único fechador em campo aberto é o salto, e é por isso que `bot.js:_plan` o trata como a arma principal.
//
// Medido nos jogadores da Poki, primeira vida: 79% não matam ninguém e nunca apertam dividir, e esse grupo
// chega a 3 min em 22% contra 54% de quem matou. Não há tutorial em lugar nenhum do cliente (`grep`: zero),
// e a única instrução é a linha da tela inicial — que fala de MOUSE e é `display:none` no celular.
//
// ⚠️ A DICA SÓ APARECE PARA QUEM PODE DIVIDIR (`r >= SPLIT.MIN_R`), e isso não é detalhe: com o portão em
// 60 (massa 3.600) e o pico mediano da primeira vida em 2.214, DOIS TERÇOS dos novatos não conseguem
// dividir de jeito nenhum. Anunciar o botão para eles seria ensinar um comando que o servidor recusa —
// pior que não ensinar nada. Quem move esse número é o tunable `SPLIT.MIN_R` (grupo "Proteção do novato").
// ⚠️ `SPLIT.MIN_R` é lido A CADA CHAMADA, nunca capturado: ele é 'wire' e o `aplicaWire` do `room` o
// reescreve em cima do objeto de `constants.js` (o mesmo aliasing da física). Capturado na carga do
// módulo, o cliente anunciaria o portão do BUILD enquanto o servidor usa o do painel.
// @ts-check
import {SPLIT,EAT} from "@warspace/shared";

/** Teto de aparições, quanto fica no ar e o intervalo mínimo entre duas. */
export const DICA={MAX:3,DUR_MS:5000,GAP_MS:12000};
/** Estado zerado — nasce assim e volta assim a cada vida nova. */
export const DICA0={n:0,ate:0,prox:0};

/**
 * Há presa ao alcance de UM salto? Pura, para poder ser testada sem DOM (o molde de `game/quality.js`).
 *
 * Duas condições, e as duas são do jogo: a peça tem que ser ENGOLÍVEL (`EAT.RATIO` de raio) e estar dentro
 * de `SPLIT.DIST`, que é literalmente a distância que o arremesso percorre. Fora disso a dica mentiria.
 *
 * @param {{x:number,y:number,r:number}|null} me a MAIOR peça própria
 * @param {Array<{x:number,y:number,r:number}>} alvos peças de terceiros (sem aliados, sem as minhas)
 * @param {number} [alcance]
 */
export function temPresa(me,alvos,alcance=SPLIT.DIST){
  if(!me||me.r<SPLIT.MIN_R)return false;   // não posso dividir: não há o que dizer
  const lim=me.r/EAT.RATIO,d2=alcance*alcance;
  for(let i=0;i<alvos.length;i++){const a=alvos[i];
    if(!(a.r<=lim))continue;               // não engulo: perseguir isso não é a lição
    const dx=a.x-me.x,dy=a.y-me.y;
    if(dx*dx+dy*dy<=d2)return true;}
  return false;}

/**
 * O passo da dica. Pura pelo mesmo motivo de `ui/roundClock.js`: é a decisão que precisa ser conferida.
 *
 * ⚠️ `pode` FALSO apaga na hora (`ate:0`) e não gasta aparição: ele cobre dividir (a lição foi aprendida),
 * morrer, pausar e sair. Deixá-la no ar depois do primeiro split é o jeito mais rápido de virar ruído.
 * ⚠️ O contador `n` NÃO zera com a presa sumindo — o teto é por VIDA, senão um jogador andando entre
 * planetas veria a mesma frase a cada dez segundos até fechar a aba.
 *
 * @param {{n:number,ate:number,prox:number}} est
 * @param {{pode:boolean,presa:boolean}} ctx
 * @param {number} agora ms monotônicos (`performance.now()`)
 * @returns {{est:{n:number,ate:number,prox:number},visivel:boolean}}
 */
export function passoDica(est,ctx,agora){
  if(!ctx.pode)return{est:{...est,ate:0},visivel:false};
  if(agora<est.ate)return{est,visivel:true};                     // já está no ar: não reavalia a presa
  if(est.n>=DICA.MAX||agora<est.prox||!ctx.presa)return{est,visivel:false};
  return{est:{n:est.n+1,ate:agora+DICA.DUR_MS,prox:agora+DICA.DUR_MS+DICA.GAP_MS},visivel:true};}

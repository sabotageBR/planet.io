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
 * Há peça de terceiro ENGOLÍVEL à vista? Pura, para poder ser testada sem DOM (o molde de
 * `game/quality.js`). É o laço de `temPresa` SEM o portão do split — que é o que a etapa 2 da missão
 * precisa: comer alguém menor não pede `SPLIT.MIN_R`, pede só ser maior.
 *
 * @param {{x:number,y:number,r:number}|null} me a MAIOR peça própria
 * @param {Array<{x:number,y:number,r:number}>} alvos peças de terceiros (sem aliados, sem as minhas)
 * @param {number} [alcance]
 */
export function temComivel(me,alvos,alcance=Infinity){
  if(!me)return false;
  const lim=me.r/EAT.RATIO,d2=alcance*alcance;
  for(let i=0;i<alvos.length;i++){const a=alvos[i];
    if(!(a.r<=lim))continue;               // não engulo: perseguir isso não é a lição
    const dx=a.x-me.x,dy=a.y-me.y;
    if(dx*dx+dy*dy<=d2)return true;}
  return false;}

/**
 * Há presa ao alcance de UM salto? Duas condições, e as duas são do jogo: a peça tem que ser ENGOLÍVEL
 * (`EAT.RATIO` de raio) e estar dentro de `SPLIT.DIST`, que é literalmente a distância que o arremesso
 * percorre. Fora disso a dica mentiria.
 *
 * @param {{x:number,y:number,r:number}|null} me @param {Array<{x:number,y:number,r:number}>} alvos
 * @param {number} [alcance]
 */
export function temPresa(me,alvos,alcance=SPLIT.DIST){
  // ⚠️ `SPLIT.MIN_R` LIDO AQUI, a cada chamada, e não hoistado para fora na refatoração: ele é 'wire' e o
  // `aplicaWire` do JSON `room` o reescreve em cima do objeto de constants.js.
  if(!me||me.r<SPLIT.MIN_R)return false;   // não posso dividir: não há o que dizer
  return temComivel(me,alvos,alcance);}

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

// ── A MISSÃO DE SESSÃO 0 ──────────────────────────────────────────────────────
// A dica do dividir ensina a ÚLTIMA coisa que um novato precisa aprender, e ela só aparece para quem já
// chegou ao portão (`SPLIT.MIN_R`) — ou seja, para um terço deles. As duas etapas antes dela são as que o
// resto nunca recebe: "coma as partículas" e "coma o planeta pequeno".
//
// ⚠️ A INVARIANTE É A FORMA DO RETORNO: `banda` é uma STRING SÓ. "No máximo uma faixa de texto por vez"
// deixa de ser disciplina de quem chama e passa a ser impossível de violar — que é o pedido literal.
// ⚠️ `passoDica` e `temPresa` NÃO mudaram uma linha: a etapa 3 é a dica de hoje, DELEGADA, e o teste que
// já existe continua sendo a prova disso.
// ⚠️ Nada aqui é tutorial: sem modal, sem bloquear input, sem `alert`. A faixa mora no rodapé do HUD e
// some sozinha.

/** As etapas, na ordem. `FIM` nunca é escrito — quem já viveu uma vida entra direto em `SPLIT`. */
export const ETAPA={FIM:0,COMER:1,PRESA:2,SPLIT:3};
/**
 * Quantas PARTÍCULAS fecham a etapa 1, e quanto o "consegui" fica no ar antes de a próxima subir.
 *
 * ⚠️ **A frase dizia "pedras", e mandava o novato para cima de um ASTEROIDE.** É o pior erro possível
 * numa missão de primeira vida: a pedra do jogo é o asteroide, que POP/estilhaça quem encosta — a
 * missão ensinava exatamente o que mata. O grão é uma partícula, e é como o resto do jogo o chama.
 */
export const MISSAO={COMIDAS:8,SOBRA_MS:3000};
export const MISSAO0={etapa:ETAPA.COMER,ate:0,feito:0,desde:0,dica:DICA0};
/** Quem já viveu uma vida NESTA sessão entra na etapa 3: comer grão e comer quem é menor ele já sabe. */
export const MISSAO_VETERANO={etapa:ETAPA.SPLIT,ate:0,feito:0,desde:0,dica:DICA0};

/** Sobe (ou mantém) a faixa `id`, carimbando `desde` só quando ela estava FORA — é o `key` do React. */
const sobe=(est,id,agora,extra)=>({est:{...est,...extra,desde:est.desde||agora},banda:id,festa:0});

/**
 * O passo da missão. Pura, como `passoDica` — e ela ENVOLVE o `passoDica`, não o substitui.
 *
 * @param {{etapa:number,ate:number,feito:number,desde:number,dica:{n:number,ate:number,prox:number}}} est
 * @param {{vivo:boolean,comidas:number,comeuAlguem:boolean,comivel:boolean,pode:boolean,presa:boolean}} ctx
 * @param {number} agora ms monotônicos
 * @returns {{est:object,banda:""|"comer"|"presa"|"split",festa:number}}
 */
export function passoMissao(est,ctx,agora){
  // morto, pausado, fora da sala: apaga tudo e não gasta aparição (a mesma regra do `pode` de passoDica)
  if(!ctx.vivo)return{est:{...est,ate:0,feito:0,desde:0,dica:{...est.dica,ate:0}},banda:"",festa:0};
  if(est.etapa===ETAPA.COMER){
    if(est.feito)return agora>=est.feito
      // ⚠️ ATALHO: quem já comeu alguém enquanto completava as pedras pula a etapa 2 — ela existe para
      // ensinar isso, e ensinar o que já foi feito é ruído.
      ? passoMissao({...est,etapa:ctx.comeuAlguem?ETAPA.SPLIT:ETAPA.PRESA,feito:0,desde:0},ctx,agora)
      : sobe(est,"comer",agora);
    if(ctx.comidas>=MISSAO.COMIDAS)return{...sobe(est,"comer",agora,{feito:agora+MISSAO.SOBRA_MS}),festa:ETAPA.COMER};
    return sobe(est,"comer",agora);}
  if(est.etapa===ETAPA.PRESA){
    if(est.feito)return agora>=est.feito
      ? passoMissao({...est,etapa:ETAPA.SPLIT,feito:0,desde:0},ctx,agora)
      : sobe(est,"presa",agora);
    if(ctx.comeuAlguem)return{...sobe(est,"presa",agora,{feito:agora+MISSAO.SOBRA_MS}),festa:ETAPA.PRESA};
    // ⚠️ PISO DE TELA (`ate`): a presa cruza a borda da AOI o tempo todo, e sem ele a faixa piscaria a
    // 8 Hz. É o mesmo papel do `est.ate` de `passoDica`.
    if(agora<est.ate)return sobe(est,"presa",agora);
    if(ctx.comivel)return sobe(est,"presa",agora,{ate:agora+DICA.DUR_MS});
    return{est:{...est,desde:0},banda:"",festa:0};}
  // etapa 3: a dica do dividir, inteira e intacta
  const p=passoDica(est.dica,{pode:ctx.pode,presa:ctx.presa},agora);
  return p.visivel?sobe({...est,dica:p.est},"split",agora)
                  :{est:{...est,dica:p.est,desde:0},banda:"",festa:0};}

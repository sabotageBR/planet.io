// ── A CONTAGEM DO RESPAWN SÓ COMEÇA COM UM SINAL DE VIDA ─────────────────────
// A tela de morte renascia SOZINHA: o efeito armava um intervalo no instante da morte e, cinco segundos
// depois, chamava `respawnAqui()` sem que ninguém clicasse em nada — o botão "DE NOVO! · 5s" era o espelho
// dessa contagem, não a causa dela. Uma aba esquecida aberta virava um jogador que morre, renasce, morre e
// renasce para sempre, ocupando vaga, servindo de comida de graça e poluindo o placar e o kill feed de todas
// as salas por onde passasse.
//
// Aqui a contagem passa a ARMAR no primeiro gesto humano depois da morte. É pura pelo mesmo motivo declarado
// em `roundClock.js`: o defeito que ela fecha é de PROVENIÊNCIA, e proveniência não se confere lendo o
// componente.
//
// ⚠️ O LATCH É O MIOLO. `armAt` é escrito UMA vez por morte, e não a cada gesto: andando com o mouse, a
// contagem reiniciaria a cada movimento e quem ficasse mexendo o ponteiro na tela de morte NUNCA renasceria.
// ⚠️ E 'morte' zera `armAt`. É o mesmo conserto que o par `{chave,at}` faz em `roundClock.js` — aqui ele sai
// de graça porque os dois viajam no MESMO objeto: é estruturalmente impossível o armamento de uma morte
// disparar o respawn da seguinte, que é o defeito que pulava a tela inteira do fim de rodada.

/** Nem morto, nem armado. */
export function morteZero(){return{deadAt:0,armAt:0};}

/**
 * @param {{deadAt:number,armAt:number}} st
 * @param {{tipo:'morte'|'vida'|'atividade',now:number}} ev
 * @returns {{deadAt:number,armAt:number}} o mesmo objeto quando nada muda (o React compara por identidade)
 */
export function passoMorte(st,{tipo,now}){
  if(tipo==='morte')return{deadAt:now,armAt:0};
  if(tipo==='vida')return st.deadAt||st.armAt?morteZero():st;
  // 'atividade': só arma quem está MORTO e ainda não armou. Gesto durante a partida não vale para a morte
  // seguinte, e gesto depois de armado não reinicia nada.
  if(tipo==='atividade')return st.deadAt&&!st.armAt?{deadAt:st.deadAt,armAt:now}:st;
  return st;}

/**
 * Quando o respawn automático vence. **0 = não armado** — e é esse valor que faz a tela nunca renascer
 * sozinha. Zero nunca é um instante válido de `performance.now()` num jogo em andamento, então não há
 * ambiguidade com "venceu agora".
 */
export function prazoDe(st,respawnMs){return st&&st.armAt?st.armAt+respawnMs:0;}

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
 *
 * ⚠️ `telaAt` É O PISO, E ELE FECHA UM DEFEITO DE PROVENIÊNCIA — não é conforto de UI. O par
 * `{deadAt,armAt}` viaja no mesmo objeto DENTRO do motor, mas chega à tela por um store COM THROTTLE
 * (`throttleStore(hudStore,200)` em `ui/Dead.jsx`), cujo `get()` devolve o último snapshot PUBLICADO —
 * enquanto `screen:"dead"` é escrito no store `app`, sem throttle. Ou seja: no PRIMEIRO render da tela de
 * morte, o par que ela lê é o de ANTES da morte. Some a isso que `game/index.js` nunca zerava `morte` em
 * `join`/`leave` (só o `{t:"alive"}` zerava), e o par de antes podia ser um armamento de outra vida, já
 * vencido — o efeito rodava `tick()` síncrono na montagem, `end` já estava no passado e o respawn saía no
 * primeiro frame. A tela de morte não chegava a aparecer, e o jogador reentrava no ato. "Só às vezes"
 * porque exigia que a vida anterior tivesse terminado por um caminho `play()` em vez de `{t:"alive"}`.
 * O piso corta isso pela raiz: nada vence antes de a tela ter estado `minMs` na frente, seja qual for o
 * par que chegou. E `telaAt` 0 é "a tela ainda não apareceu" — aí não há prazo nenhum.
 *
 * @param {{deadAt:number,armAt:number}} st
 * @param {number} respawnMs
 * @param {number} [telaAt] instante em que a tela de morte apareceu (0 = ainda não)
 * @param {number} [minMs] piso de tempo com a tela na frente
 * @returns {number} instante do respawn automático, ou 0
 */
export function prazoDe(st,respawnMs,telaAt=0,minMs=0){
  if(!st||!st.armAt)return 0;
  if(minMs>0&&!telaAt)return 0;
  return Math.max(st.armAt+respawnMs,telaAt+minMs);}

// ── O FIM DE UMA VIDA, VISTO DO STORE ─────────────────────────────────────────
// Dois portais precisam da MESMA resposta ("acabou uma vida, e o placar dela foi este"): a Bounty Board
// manda `gameOver` e o Playgama manda o score para o placar SaaS. A lógica é curta e cheia de arestas,
// e duas cópias dela divergiriam na primeira correção — daí este arquivo.
//
// ⚠️ POR QUE O STORE, e não uma chamada em `state/actions.js`: a Bounty Board enquadra o SITE, onde
//    `PORTAL` é falso e os ganchos de portal do jogo não são chamados. Assinar o `app` é o molde de
//    `app/analytics.js` e cobre os mesmos instantes sem espalhar `if` por arquivo nenhum.
// ⚠️ UMA VEZ POR VIDA, e é o que os dois contratos pedem (a Bounty Board escreve isso em regra: "call
//    gameOver() exactly once per run"). Quem garante é a VIDA ABERTA: ela abre ao entrar na partida e
//    fecha no primeiro fim que chegar. Morrer e o BIG CRUNCH são dois sinais distintos — quem morreu e
//    ficou assistindo o fim de rodada receberia DOIS —, e o campeão que nunca morreu só tem o segundo.
// ⚠️ `lastMatch` e `roundResult` são comparados por REFERÊNCIA: o store é imutável e reescreve o objeto
//    a cada partida, então "mudou de objeto" é exatamente "é outra vida".
import { app } from "../state/app.js";

/** Meu score no fim de rodada: a linha do meu slot no placar, ou o `mine` que o servidor anexa a quem não coube nele. */
const meuFim = r => { const b = (r && r.board) || [], m = b.find(x => x && x.slot === r.mySlot);
  return (m && m.score) || (r && r.mine && r.mine.score) || 0; };

/**
 * Chama `cb(score)` UMA vez por vida. Devolve a função de cancelar.
 * @param {(score:number)=>void} cb
 */
export function aoAcabarAVida(cb) {
  let aberta = false, ultimaMorte = null, ultimoFim = null;
  const acaba = n => { if (!aberta) return; aberta = false; try { cb(Math.trunc(+n || 0)); } catch { /* nunca derruba o jogo */ } };
  const passo = st => {
    if (st.screen === "game") aberta = true;
    if (st.lastMatch && st.lastMatch !== ultimaMorte) { ultimaMorte = st.lastMatch; acaba(st.lastMatch.score); }
    if (st.roundResult && st.roundResult !== ultimoFim) { ultimoFim = st.roundResult; acaba(meuFim(st.roundResult)); }
  };
  const off = app.subscribe(passo);
  // ⚠️ E o estado de AGORA: estes adaptadores são chunks sob demanda com um script de terceiro dentro, e
  // numa rede ruim o jogador chega à partida antes de o SDK carregar.
  passo(app.get());
  return off;
}

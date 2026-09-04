// ── O RELÓGIO DA TELA DE FIM DE RODADA ───────────────────────────────────────
// Uma função pura, no molde de `game/quality.js` e `admin/ordenar.js`, porque o defeito que ela existe
// para fechar é de PROVENIÊNCIA e não de aritmética — e proveniência não se confere lendo o componente.
//
// O que aconteceu: `Round.jsx` guardava o instante em que o placar ficou pronto (`prontoAt`) num `useState`
// SEM dizer de que rodada ele era. Na virada seguinte, o efeito que zera esse instante e o efeito que arma
// a contagem rodam no MESMO passo, e o segundo lê o valor ANTERIOR — um instante 15 s no passado. O
// primeiro `tick()` via prazo vencido e chamava `play({})` na hora: a tela inteira era pulada, sem placar,
// sem campeão e sem contagem, e o jogador caía direto numa sala nova. Medido em dev: `roundEnd` às 113,1 s
// e o `quit` às 113,2 s. E o defeito ALTERNAVA — a 1ª virada da carga da página funcionava, a 2ª pulava, a
// 3ª funcionava —, porque o passo que disparava cedo ainda deixava o zero gravado para a rodada seguinte.
//
// A chave amarra o instante à rodada a que ele pertence, então ler o de outra deixa de ser possível: fora
// dela o valor é 0 e a contagem cai no `at` do próprio `roundEnd`, que é o carimbo de chegada DESTA.

/** A identidade da rodada: o `roundEnd` traz `code` (a sala) e recebe `at` (a chegada) em `onRoundEnd`. */
export function chaveDe(r) { return r ? (r.code || "") + ":" + (r.at || 0) : ""; }

/**
 * Quando a contagem para a próxima sala vence.
 * @param {{at?:number,nextInMs?:number}|null} r   o `roundResult` do store
 * @param {string} chave                          `chaveDe(r)`
 * @param {{chave:string,at:number}} pronto        o instante em que o placar apareceu, com a rodada dele
 * @param {number} agora                          `Date.now()` (parâmetro para o teste não depender do relógio)
 */
export function prazoDe(r, chave, pronto, agora) {
  if (!r) return agora;
  // ⚠️ A comparação é o conserto. Sem ela, `pronto.at` de outra rodada entra aqui como se fosse desta.
  const at = pronto && pronto.chave === chave ? pronto.at : 0;
  return (at || r.at || agora) + (r.nextInMs || 15000);
}

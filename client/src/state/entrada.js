// ── PARA ONDE O BOOT VAI, E PARA ONDE SE VAI AO SAIR DA PARTIDA ──────────────
// Duas decisões de UMA linha cada, extraídas para um módulo PURO pelo mesmo motivo de `game/quality.js`,
// `ui/deadClock.js` e `admin/ordenar.js`: não há jsdom no projeto, e o que precisa ser conferido aqui não
// é o efeito (navegar) e sim a ESCOLHA.
//
// ⚠️ O PACOTE NÃO TEM TELA INICIAL (`SEM_MENU`, ver portal/flags.js), e o invariante que isso cria é
// PRECISO: nenhum caminho pode terminar numa tela que não está MONTADA — um `go("entry")` ali não dá erro
// nenhum, só deixa o jogador olhando um shell VAZIO. É exatamente o tipo de defeito que não aparece em
// nenhum teste de componente e aparece no histograma do Fit Test.
// ⚠️ E ele NÃO é "nenhum caminho sai da arena". Ler assim custou o Battle Royale inteiro por uma entrega
// — ver `destinoDaSaida`. O BOOT termina na arena (T1); SAIR termina na tela de MODOS, que está montada.
// @ts-check

/** @typedef {{tipo:'party'|'spec'|'sala'|'jogar'|'dev',code?:string}} Destino */

/**
 * O destino do boot. A ORDEM é a decisão, e ela é a de hoje: os quatro ramos de querystring ganham do
 * boot direto porque **todos eles já terminam numa partida ou numa sala** — mandar quem chegou por um
 * link de convite para uma sala qualquer do Livre faria o link do amigo terminar no lugar errado.
 *
 * ⚠️ `jogar` NÃO carrega modo: quem chama crava `MODE.FREE`. Herdar `gameMode` deixaria um Battle Royale
 * de uma visita anterior decidir a partida de ESTREIA de quem acabou de chegar de um portal — e no BR a
 * estreia é um lobby de espera, que é o oposto do que o boot direto existe para fazer.
 *
 * @param {{semMenu:boolean,party?:string|null,sala?:string|null,assistir?:boolean}} q
 * @returns {Destino}
 */
export function destinoDoBoot({ semMenu, party = null, sala = null, assistir = false }) {
  if (party) return { tipo: "party", code: String(party) };
  if (sala && assistir) return { tipo: "spec", code: String(sala) };
  if (sala) return { tipo: "sala", code: String(sala) };
  return semMenu ? { tipo: "jogar" } : { tipo: "dev" };
}

/**
 * O destino de SAIR DA PARTIDA. No site é a tela de SALAS; no pacote é a tela de MODOS.
 *
 * ⚠️ Ela existe porque são SETE botões de sair espalhados pelo cliente (o ☰ do HUD, o lobby do BR, o
 * espectador, o pódio, a reconexão, a tela de morte e a pausa). Sete `if (PORTAL)` divergem no primeiro
 * conserto — é a mesma lição de `useSpec`/`SpecBar`, que nasceu de duas cópias do mesmo código.
 *
 * ⚠️ **ISTO JÁ FOI `{tipo:'jogar'}` E ERA UM BECO SEM SAÍDA.** A entrega 1.14 leu "no pacote não existe
 * fora da partida" ao pé da letra e fez toda saída RE-ENTRAR no Livre — com o efeito colateral de que
 * "leave the match" reiniciava o jogo e o **Battle Royale deixava de ser alcançável**: o único lugar do
 * cliente que oferece o modo é a tela de Modos, e nenhum caminho chegava mais nela. O invariante certo
 * nunca foi "nenhum caminho sai da arena", e sim "nenhum caminho termina numa tela que NÃO ESTÁ
 * MONTADA" — e `modes` está (`App.jsx` a monta sem guarda; quem não monta no pacote são `Entry` e
 * `Scene`). Quem entra pela PRIMEIRA vez continua caindo direto na arena, que é o item T1 do Player
 * Fit; sair de propósito é um gesto deliberado e merece uma escolha.
 *
 * ⚠️ **`entry` continua proibida no pacote** — ela é o cartão de 17% de abandono que o 1.14 removeu, e
 * além disso o componente nem existe no bundle. Quem garante isso é o mapeamento em `go()`/`leaveGame()`.
 *
 * @param {boolean} semMenu @returns {{tipo:'jogar'}|{tipo:'tela',tela:string}}
 */
export function destinoDaSaida(semMenu) {
  return { tipo: "tela", tela: semMenu ? "modes" : "lobby" };
}

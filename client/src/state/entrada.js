// ── PARA ONDE O BOOT VAI, E PARA ONDE SE VAI AO SAIR DA PARTIDA ──────────────
// Duas decisões de UMA linha cada, extraídas para um módulo PURO pelo mesmo motivo de `game/quality.js`,
// `ui/deadClock.js` e `admin/ordenar.js`: não há jsdom no projeto, e o que precisa ser conferido aqui não
// é o efeito (navegar) e sim a ESCOLHA — que no pacote de portal tem que ser "a arena", sempre, por todos
// os caminhos.
//
// ⚠️ O PACOTE NÃO TEM TELA INICIAL (`SEM_MENU`, ver portal/flags.js). Isso transforma uma pergunta de
// navegação num INVARIANTE: nenhum caminho pode terminar num menu, porque o menu não está montado — e um
// `go("entry")` ali não dá erro nenhum, só deixa o jogador olhando um shell VAZIO. É exatamente o tipo de
// defeito que não aparece em nenhum teste de componente e aparece no histograma do Fit Test.
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
 * O destino de SAIR DA PARTIDA. No site é voltar ao menu; no pacote **não existe "fora da partida"**, e a
 * decisão do dono é re-entrar no Livre.
 *
 * ⚠️ Ela existe porque são SETE botões de sair espalhados pelo cliente (o ☰ do HUD, o lobby do BR, o
 * espectador, o pódio, a reconexão, a tela de morte e a pausa). Sete `if (PORTAL)` divergem no primeiro
 * conserto — é a mesma lição de `useSpec`/`SpecBar`, que nasceu de duas cópias do mesmo código.
 *
 * @param {boolean} semMenu @returns {{tipo:'jogar'}|{tipo:'tela',tela:string}}
 */
export function destinoDaSaida(semMenu) {
  return semMenu ? { tipo: "jogar" } : { tipo: "tela", tela: "lobby" };
}

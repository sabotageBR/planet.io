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

/** @typedef {{tipo:'party'|'spec'|'sala'|'tutor'|'jogar'|'dev',code?:string}} Destino */

/**
 * O destino do boot. A ORDEM é a decisão, e ela é a de hoje: os quatro ramos de querystring ganham do
 * boot direto porque **todos eles já terminam numa partida ou numa sala** — mandar quem chegou por um
 * link de convite para uma sala qualquer do Livre faria o link do amigo terminar no lugar errado.
 *
 * ⚠️ `jogar` NÃO carrega modo: quem chama crava `MODE.FREE`. Herdar `gameMode` deixaria um Battle Royale
 * de uma visita anterior decidir a partida de ESTREIA de quem acabou de chegar de um portal — e no BR a
 * estreia é um lobby de espera, que é o oposto do que o boot direto existe para fazer.
 *
 * ⚠️ `tutor` entra DEPOIS dos quatro ramos de link e ANTES do boot direto, e a ordem é a decisão: um
 * link de convite não pode terminar num tutorial (o amigo está esperando do outro lado), mas o tutorial
 * GANHA do boot direto — ele É o boot direto de quem nunca jogou. Vale para o site também, se a
 * plataforma estiver marcada no painel.
 * ⚠️ O parâmetro é OPCIONAL e cai em `false`: sem ele, todo chamador antigo (e todo teste que já
 * existia) continua devolvendo exatamente o que devolvia.
 *
 * @param {{semMenu:boolean,party?:string|null,sala?:string|null,assistir?:boolean,tutor?:boolean}} q
 * @returns {Destino}
 */
export function destinoDoBoot({ semMenu, party = null, sala = null, assistir = false, tutor = false }) {
  if (party) return { tipo: "party", code: String(party) };
  if (sala && assistir) return { tipo: "spec", code: String(sala) };
  if (sala) return { tipo: "sala", code: String(sala) };
  if (tutor) return { tipo: "tutor" };
  return semMenu ? { tipo: "jogar" } : { tipo: "dev" };
}

/**
 * ESTA PESSOA PRECISA DO TUTORIAL DE ESTREIA?
 *
 * Pura pelo mesmo motivo das duas acima: o que precisa ser conferido é a ESCOLHA, e cada termo dela
 * fecha um buraco medido.
 *
 * ⚠️ **`games === 0` NÃO quer dizer "nunca jogou"**, e essa é a armadilha central. Com o boot em erro
 * (`bootError`) o `applySession` nunca roda e `stats` fica zerado; com o banco fora (`online:false`) o
 * perfil LOCAL devolve `games:0` em toda carga da página. Nos dois casos o tutorial ligaria para todo
 * mundo, para sempre — e no pacote de portal ele ainda competiria com a tela de `servidorFora`. Daí a
 * conjunção: só entra quem realmente chegou ao servidor e realmente nunca jogou.
 * ⚠️ `marcado` vem de `localStorage`, que **lança** em aba anônima e em origem opaca (a Bounty Board
 * roda em sandbox). Quem lê tem que engolir a exceção e devolver `false` — a degradação aceitável é o
 * tutorial reaparecer, nunca o boot morrer.
 * ⚠️ `forcado` é o interruptor de bancada (`?tutorial=1|0`), no molde exato do `?vida1=1`: sem ele não
 * há como PROVAR a tela sem limpar o `localStorage`, e a lista de plataformas é decidida por uma
 * constante de build que não se falsifica em 127.0.0.1. Ele ganha dos dois lados.
 *
 * @param {{games:number,marcado:boolean,online:boolean,erro:boolean,forcado?:string|null}} ctx
 */
export function precisaTutorial({ games, marcado, online, erro, forcado = null }) {
  if (forcado === "1") return true;
  if (forcado === "0") return false;
  if (marcado || erro || online !== true) return false;
  return (games | 0) === 0;
}

/**
 * A ESTREIA PODE COMEÇAR ANTES DA CONTA? — o primeiro dos dois portões de `estreiaRapida` (state/actions.js).
 *
 * Um aparelho NOVO numa plataforma com tutorial entra nele assim que a sonda do `/api/config` responde, e a
 * conta do convidado (criar + `/api/me`: duas idas ao servidor em série) corre por trás. Este predicado diz
 * se o boot PODE tentar isso; o segundo portão (a lista de plataformas, `tutorialEm`) só se conhece depois
 * da sonda, e é por isso que ele não mora aqui.
 *
 * ⚠️ `temToken` é o que separa "aparelho novo" de "conta que já existe": com token, a conta pode já ter
 * jogado, e só o `/api/me` sabe — o boot normal (`precisaTutorial`) decide. Sem token, `games` é zero POR
 * DEFINIÇÃO: a conta nem nasceu.
 * ⚠️ `marcado` (a marca do tutorial em localStorage) fecha a porta mesmo sem token: quem limpou o token mas
 * não a marca já viu o tutorial neste aparelho.
 * ⚠️ Os LINKS (`?party=`/`?sala=`) nunca: eles têm destino próprio, e o amigo está esperando do outro lado.
 * ⚠️ `?tutorial=0` desliga; `?tutorial=1` não precisa deste portão para nada além de não ser barrado.
 *
 * @param {{temToken:boolean,marcado:boolean,link?:boolean,forcado?:string|null}} q
 */
export function estreiaSemConta({ temToken, marcado, link = false, forcado = null }) {
  if (forcado === "0" || link || temToken || marcado) return false;
  return true;
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

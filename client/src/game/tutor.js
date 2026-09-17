// ── O TUTORIAL DE ESTREIA: A DECISÃO ──────────────────────────────────────────
// Três etapas — crescer na supernova, atirar num planeta, dividir para alcançar uma presa — e a máquina
// que decide em qual delas o jogador está, o quanto ele avançou e quando a etapa fechou.
//
// PURA, e pelo mesmo motivo de `game/dica.js`, `game/quality.js`, `ui/roundClock.js` e `state/entrada.js`:
// não há jsdom no projeto, e o que precisa ser conferido aqui não é o efeito (montar o mundo, desenhar a
// faixa) — é a ESCOLHA. Quem executa é `game/net/tutorServer.js`; quem desenha é `ui/Tutor.jsx`.
//
// ⚠️ A INVARIANTE É A FORMA DO RETORNO, como em `passoMissao`: `etapa` é UM número e `pct` é UM número
// entre 0 e 1. "Uma faixa e uma barra por vez" deixa de ser disciplina de quem chama e passa a ser
// impossível de violar.
// ⚠️ `festa` sai UMA VEZ por construção — no tick em que a etapa fecha, `feito` ainda é zero; nos
// seguintes ele já é truthy e o ramo não repete. É o mesmo truque de `dica.js`, e ele existe para o
// chamador não precisar de uma flag própria.
// ⚠️ NADA AQUI USA RELÓGIO DE PAREDE POR CONTA PRÓPRIA: `agora` entra por argumento. O render pode estar
// congelado (pausa da plataforma, contexto WebGL perdido) com o mundo andando, e o inverso também — o
// avanço das etapas é por EVENTO do mundo, e só a escala de AJUDA olha o tempo.
// @ts-check

/** As etapas, na ordem. `FIM` é terminal: a máquina nunca volta dele. */
export const ETAPA = { NOVA: 1, TIRO: 2, SPLIT: 3, FIM: 4 };
/** Quantas etapas a barra de progresso desenha (o FIM não é um passo, é o destino). */
export const ETAPAS = 3;

/**
 * Quanto a festa fica no ar antes de a próxima etapa subir, e a META de massa da etapa 1.
 *
 * ⚠️ **A meta é 6.000 e não 3.600, e a diferença é a coisa mais fácil de errar no tutorial inteiro.**
 * `SPLIT.MIN_R`=60 pede massa 3.600 — mas `rules.applySplit` tem uma linha ANTES dela, e `sobGraca` só
 * solta pela massa em `BOT.NOVATO_MASS`. Quem chega a 3.600 e aperta DIVIDIR leva um `return 0`
 * SILENCIOSO. E 6.000 é o mesmo número que apaga `souNovato` no cliente e faz o `#t-split` aparecer na
 * tela: o botão nascer no fim da etapa 1 não é enfeite, é a recompensa ficando visível.
 * ⚠️ Ela é PARÂMETRO da função, não import: `BOT.NOVATO_MASS` é tunable do /admin e quem o lê é o
 * diretor, a cada chamada — capturá-lo aqui na carga do módulo é o antipadrão que `dica.js` documenta.
 */
// ⚠️ `FIM_MS` é quanto a tela de PARABÉNS fica no ar antes de entrar na primeira sala sozinha. Ela não tem
// botão, então este número é a única saída — e é por isso que ele é curto: o tutorial acabou, o jogador
// quer jogar, e a tela anterior (um cartão com botão) prendia 24% de quem chegava até aqui porque a
// contagem dela podia congelar. Nunca subir isto a ponto de a tela virar espera; nunca zerar, senão o
// parabéns pisca e a promessa da skin não é lida.
export const TUTOR = { SOBRA_MS: 3200, LIMPO_MS: 4000, FIM_MS: 3000 };

/**
 * Os três degraus de ajuda de cada etapa, em ms desde que ela abriu, e o TETO em que ela se conclui
 * sozinha. Um tutorial do qual se pode ficar preso é pior que tutorial nenhum — e o funil quebra aos
 * 30 s, então não há orçamento para teimosia.
 *
 * ⚠️ Nos degraus 1 e 2 o jogador SEMPRE executa o gesto (o marcador aponta, os fragmentos derivam, a
 * presa para) — é só no 3 que o tutorial age, e aí ele DIZ que agiu. Fazer por alguém em silêncio é a
 * pior das três opções, porque a pessoa sai achando que aprendeu.
 */
export const AJUDA = {
  // ⚠️ A etapa 1 é a mais LONGA de todas, e os números de antes (4/10/22 s) não cabiam nela: são 24
  // fragmentos espalhados por um disco de ~250 px, e um iniciante descobrindo o mouse leva 15–25 s para
  // varrê-los. Com o teto em 22 s o caso NORMAL terminava em "concedemos a massa por você", que é a
  // mensagem oposta à que a primeira vitória do jogo tem de dar.
  [ETAPA.NOVA]:  { d1: 6000, d2: 14000, teto: 30000 },
  // ⚠️ **A ETAPA 2 TEM `folga`, E É O CONSERTO DE UM TETO QUE MENTIA.** O teto fechava a etapa e ligava a festa
  // NO MESMO passo — e o diretor não age durante a festa (`tutorServer.ajuda` sai cedo em `r.celebra`). O
  // "o tutorial atira por ele" nunca rodou: os 216 `tutor_tiro_auto` do painel da 1.31 (contra 135 manuais)
  // eram desistências MUDAS aos 18 s, sem um míssil na tela, e o cartão ainda dizia "Atiramos por você".
  // Agora o teto tem dois tempos: em `teto` sai `ajuda:3` com a etapa ABERTA (o diretor atira, `ctx.demo`),
  // e a festa vem do BOOM — ou em `teto+folga`, que mantém a regra "o teto SEMPRE fecha". O míssil cobre os
  // ~330 px da cena em menos de 1 s; os 3 s são só a rede.
  [ETAPA.TIRO]:  { d1: 5000, d2: 10000, teto: 18000, folga: 3000 },
  // ⚠️ A etapa 3 abre o primeiro degrau em 5 s, e não nos 8 que ela teve: ali o degrau 1 não é uma
  // muleta, é o "aha" da lição — a frase que explica por que perseguir não funciona e o botão de
  // DIVIDIR aparecendo grande. Oito segundos correndo atrás de algo que a física torna inalcançável
  // não ensinam nada; ensinam que o jogo não responde. A mediana de uma primeira vida é 31 s.
  [ETAPA.SPLIT]: { d1: 5000, d2: 12000, teto: 24000 },
};

/**
 * O ALUNO ESTÁ PRESO NO LUGAR? — enquanto a estrela não estoura, o planeta NÃO ANDA.
 *
 * ⚠️ **ELE TROMBAVA NA ESTRELA ANTES DE ELA EXPLODIR.** A etapa 1 abre com a estrela inteira a ~290 px e o
 * aviso "A ESTRELA VAI EXPLODIR!" — e a 448 px/s um novato que segue o instinto (ir até a coisa que brilha)
 * chega nela em menos de um segundo. O diretor até ADIAVA o estouro com o aluno perto (`CENA.NOVA_SAFE`,
 * com teto de 4 s), mas adiar não resolve: ele encosta, a estrela o queima e estilhaça, e a PRIMEIRA coisa
 * que o jogo faz com quem acabou de chegar é puni-lo por obedecer ao aviso. Visto pelo dono do jogo.
 * Preso, a explosão vira o que ela sempre devia ter sido: a ABERTURA da cena, assistida de longe — e só
 * então a lição de mover começa, já com os pedaços na tela.
 * ⚠️ `!t` TAMBÉM PRENDE: entre o nascimento e o primeiro `{t:"tutor"}` há alguns ticks em que o estado
 * ainda não chegou; sem isso o planeta já sairia andando nesse intervalo, com a estrela logo ali.
 * ⚠️ Quem executa é o `enviarInput` de `game/index.js`, pelo MESMO caminho da pausa e do fim de rodada
 * (mandar o alvo em cima do próprio centróide — no modelo do agar, distância zero é peça imóvel). Parar de
 * MANDAR input não serviria: sem alvo novo o mundo segue movendo a peça na direção velha. E tem de ser no
 * cliente: é ele que alimenta a predição das peças próprias, e segurar só no mundo faria a peça predita
 * andar e ser puxada de volta a cada snapshot.
 * @param {boolean} souTutorial a partida em curso é o tutorial?
 * @param {{pre?:boolean}|null} t o último `{t:"tutor"}` recebido
 */
export const presoNaEspera = (souTutorial, t) => !!souTutorial && (!t || !!t.pre);

/** Estado zerado. `desde` 0 = a etapa ainda não abriu (quem a abre é o primeiro passo). */
export const TUTOR0 = { etapa: ETAPA.NOVA, desde: 0, feito: 0, ajuda: 0, auto: 0 };

/** O degrau de ajuda de uma etapa, pelo tempo que ela está aberta. 0 = nenhuma ainda. */
const degrau = (etapa, dt) => {
  const a = AJUDA[etapa]; if (!a) return 0;
  return dt >= a.teto ? 3 : dt >= a.d2 ? 2 : dt >= a.d1 ? 1 : 0;
};

/**
 * O quanto a etapa avançou, entre 0 e 1.
 *
 * ⚠️ A etapa 1 é a única com progresso CONTÍNUO, e é a única que pode ter: o diretor tem `massOf(slot)`
 * de graça, e é a contagem exata. As outras duas são um gesto só — 0 até acontecer, 1 depois —, e fingir
 * granularidade nelas seria uma barra que se move sem o jogador ter feito nada.
 */
function fracao(etapa, ctx) {
  if (etapa === ETAPA.NOVA) {
    const base = ctx.base || 0, meta = ctx.meta || 0;
    if (!(meta > base)) return ctx.massa >= meta ? 1 : 0;
    const p = (ctx.massa - base) / (meta - base);
    return p < 0 ? 0 : p > 1 ? 1 : p;
  }
  if (etapa === ETAPA.TIRO) return ctx.acertou ? 1 : 0;
  if (etapa === ETAPA.SPLIT) return ctx.comeu ? 1 : 0;
  return 1;
}

/**
 * A etapa cumpriu o que pedia?
 *
 * ⚠️ A etapa 1 pede DUAS coisas: a massa E o cacho ter acabado (ou 4 s sem comer nada). A segunda metade
 * existe para a festa não sair com metade dos fragmentos ainda na mesa — o jogador estaria no meio de
 * uma varredura satisfatória e a tela mudaria por baixo dele.
 */
function cumpriu(etapa, ctx, agora) {
  if (etapa === ETAPA.NOVA) {
    if (ctx.massa < (ctx.meta || 0)) return false;
    return (ctx.sobrou | 0) <= 3 || (ctx.ultimo > 0 && agora - ctx.ultimo >= TUTOR.LIMPO_MS);
  }
  if (etapa === ETAPA.TIRO) return !!ctx.acertou;
  if (etapa === ETAPA.SPLIT) return !!ctx.comeu;
  return false;
}

/**
 * O passo do tutorial. Envolve nada e não delega a ninguém — ao contrário de `passoMissao`, que delega
 * a etapa 3 ao `passoDica`, aqui as três etapas são do mesmo dono.
 *
 * @param {{etapa:number,desde:number,feito:number,ajuda:number,auto:number}} est
 * @param {{vivo:boolean,massa:number,base:number,meta:number,sobrou:number,ultimo:number,
 *          acertou:boolean,comeu:boolean}} ctx
 * @param {number} agora ms monotônicos (`performance.now()` no cliente, um contador no teste)
 * ⚠️ `celebra` é a JANELA da tela de "etapa concluída", não o instante: `festa` sai uma vez (é o gatilho
 * do som e do efeito) e `celebra` fica verdadeiro pelos `SOBRA_MS` inteiros, que é o que a tela precisa
 * para existir. Sem os dois, ou a tela pisca um frame, ou o som toca a 8 Hz.
 *
 * @returns {{est:object, etapa:number, pct:number, festa:number, celebra:boolean, ajuda:number,
 *            auto:boolean, fim:boolean}}
 */
export function passoTutor(est, ctx, agora) {
  const saida = (e, extra) => ({
    est: e, etapa: e.etapa, pct: e.etapa >= ETAPA.FIM ? 1 : fracao(e.etapa, ctx),
    festa: 0, celebra: !!e.feito, ajuda: e.ajuda, auto: !!e.auto, fim: e.etapa >= ETAPA.FIM, ...extra });

  // Morto, pausado, fora da sala: congela sem gastar nada. Mesma regra do `vivo` de `passoMissao` e do
  // `pode` de `passoDica` — o relógio da ajuda não pode correr com o jogador sem controle.
  if (!ctx.vivo) return saida(est);
  if (est.etapa >= ETAPA.FIM) return saida(est);

  // A etapa ainda não abriu: abre agora, e é `agora` que vira a régua dos degraus de ajuda.
  if (!est.desde) return saida({ ...est, desde: agora, ajuda: 0, auto: 0 });

  // Já cumpriu: a festa fica `SOBRA_MS` no ar e só então a próxima sobe.
  if (est.feito) {
    if (agora < est.feito + TUTOR.SOBRA_MS) return saida(est);
    // ⚠️ `desde:0` e não `desde:agora`: quem abre a etapa é o ramo acima, no passo SEGUINTE. Assim
    // "abrir" é um lugar só, e o relógio da ajuda nunca começa a contar num tick em que a etapa nova
    // ainda não foi montada pelo diretor.
    return saida({ etapa: est.etapa + 1, desde: 0, feito: 0, ajuda: 0, auto: 0 });
  }

  const dt = agora - est.desde, d = degrau(est.etapa, dt), a = AJUDA[est.etapa] || {};
  const ok = cumpriu(est.etapa, ctx, agora);

  // Cumpriu agora — pelo próprio gesto, ou pelo teto (e aí fica marcado como `auto`, que é o que
  // distingue "aprendeu" de "foi carregado" no funil).
  // ⚠️ `ctx.demo` = o DIRETOR puxou o gatilho (só a etapa 2 tem isso): o BOOM desse míssil cumpre a etapa,
  //    mas quem atirou não foi o aluno — sem a marca ele entraria no funil como `tutor_tiro` manual, que é
  //    justamente a métrica que mede se o celular consegue atirar.
  if (ok || (d >= 3 && dt >= a.teto + (a.folga || 0))) {
    const auto = ok && !ctx.demo ? 0 : 1;
    const e = { ...est, feito: agora, ajuda: d, auto };
    return { est: e, etapa: e.etapa, pct: 1, festa: e.etapa, celebra: true, ajuda: d, auto: !!auto, fim: false };
  }
  return saida(d === est.ajuda ? est : { ...est, ajuda: d });
}

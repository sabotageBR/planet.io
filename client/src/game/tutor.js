// ── O TUTORIAL DE ESTREIA: A DECISÃO ──────────────────────────────────────────
// Duas etapas — crescer na supernova e dividir para alcançar uma presa (a do tiro está dormente: ver
// `SEQUENCIA`) — e a máquina que decide em qual delas o jogador está, o quanto ele avançou e quando a
// etapa fechou.
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

/** As etapas. `FIM` é terminal: a máquina nunca volta dele. Os NÚMEROS são nomes (viram marco do funil:
 *  `tutor_nova|tiro|split`), por isso não mudam quando a ordem muda — quem diz a ordem é `SEQUENCIA`. */
export const ETAPA = { NOVA: 1, TIRO: 2, SPLIT: 3, FIM: 4 };
/**
 * A ORDEM DAS ETAPAS: comer (a supernova) e dividir (a presa). **O TIRO SAIU do tutorial** (28/09/2026,
 * depois da recusa do Web Fit Test da Poki): era a etapa que o celular menos conseguia fazer sozinho (69% de
 * tiros manuais na 1.0.1, contra quase todos nas outras duas), e o guia deles pede o contrário de ensinar
 * tudo de uma vez — "reveal actions and buttons over the first few levels". O míssil passou a ser ensinado
 * NA PARTIDA, no instante em que o jogador pega a primeira munição (o botão aparece pulsando).
 * ⚠️ A etapa continua DORMENTE e testada — a máquina ainda sabe atravessá-la (`proximaEtapa` cai no `+1`
 * para quem estiver fora da sequência) e o diretor ainda a monta —, no precedente de `BLACKHOLE.COUNT=0`:
 * volta acrescentando `ETAPA.TIRO` aqui.
 */
export const SEQUENCIA = [ETAPA.NOVA, ETAPA.SPLIT];
/** Quantas etapas a trilha desenha (o FIM não é um passo, é o destino). */
export const ETAPAS = SEQUENCIA.length;
/** A etapa seguinte na sequência (a última leva ao FIM). Fora da sequência — a etapa dormente —, a de número seguinte. */
export const proximaEtapa = e => { const i = SEQUENCIA.indexOf(e); return i < 0 ? e + 1 : SEQUENCIA[i + 1] || ETAPA.FIM; };
/** A POSIÇÃO de uma etapa na trilha, 1-based (a do FIM é a última + 1). É ela que a tela desenha, nunca o número. */
export const posicaoDaEtapa = e => { const i = SEQUENCIA.indexOf(e); return i < 0 ? (e >= ETAPA.FIM ? ETAPAS + 1 : 1) : i + 1; };

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
// ⚠️ **O TUTORIAL NÃO TEM MAIS TELA DE PARADA NENHUMA, e os dois números abaixo são essa decisão.**
// `SOBRA_MS` já foi 3.200 ms de uma tela cheia de "ETAPA COMPLETA" (que escondia o HUD inteiro) e `FIM_MS`
// 3.000 ms de um cartão de PARABÉNS: 3 × 3,2 + 3 = **12,6 s de espera obrigatória** num tutorial de ~60 s, em
// quatro paradas — e cada parada é um ponto de saída (medido no Game Events da Poki, 1.33: os passos perdem
// 7% · 11% · 8% · 7%). É a tela de "Level Complete" do estudo de caso que a própria Poki divulga: um
// desenvolvedor tirou a dele, o jogador passou a FLUIR de uma fase para a outra, e o playtime médio subiu
// 2 minutos. Aqui: `SOBRA_MS` virou um BATIMENTO (o som e o efeito da `festa` leem, o mundo da etapa
// seguinte monta logo atrás, e o elogio é um selo que não bloqueia nada — `ui/TutorCena.jsx`), e `FIM_MS`
// é ZERO: acabou a terceira lição, entra na sala.
// ⚠️ Este comentário já disse "nunca zerar o `FIM_MS`, senão a promessa da skin não é lida". A premissa
// morreu: a promessa (e o parabéns) viraram uma FAIXA por cima da primeira partida
// (`ui/TutorParabens.jsx`, `app.parabensAte`) — que é o instante exato em que o Marte Bravo é tirado do
// jogador, ou seja o instante em que a promessa tem de ser feita.
export const TUTOR = { SOBRA_MS: 700, LIMPO_MS: 4000, FIM_MS: 0 };

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

/** Quanto dura o deslize de volta para dentro quando a etapa do salto abre com o aluno numa parede. */
export const RECENTRA_MS = 1800;
/**
 * A ETAPA DO SALTO NÃO COMEÇA NUMA PAREDE: se ela abre com o aluno acuado, o planeta DESLIZA para o centro da
 * arena por `RECENTRA_MS` — pelo mesmo caminho do `presoNaEspera` (o alvo que o cliente manda), nunca por
 * teletransporte.
 * ⚠️ O MOTIVO É A PRESA FORA DA TELA, visto em bancada: a arena é um quadradinho de 1.800 px e o rumo travado
 * do dedo leva o planeta até a parede em segundos, então muita gente termina a etapa 1 encostada num canto. A
 * pista da presa tem de CABER na arena (`orbita`, em tutorServer.js, clampa o centro dela a `folga` das
 * paredes), e com o aluno no canto esse centro fica até ~380 px para dentro — a presa circulando do outro
 * lado passava de 600 px do planeta, fora da tela de um celular em pé. A lição era "salte nela", e ela não
 * estava na tela.
 * ⚠️ Só DENTRO da janela: depois o controle é do jogador de novo (e no dedo o rumo é zerado na abertura da
 * etapa, senão ele voltaria direto para a parede).
 * @param {{etapa:number}|null} t o último `{t:"tutor"}`
 * @param {{x:number,y:number}|null} pos o centróide do aluno
 * @param {{w:number,h:number}} arena
 * @param {number} folga a distância das paredes em que a pista da presa cabe inteira
 * @returns {{x:number,y:number}|null} para onde deslizar, ou null (nada a fazer)
 */
export function recentraNoSalto(t, pos, arena, folga) {
  if (!t || t.etapa !== ETAPA.SPLIT || !pos || !arena) return null;
  const acuado = pos.x < folga || pos.x > arena.w - folga || pos.y < folga || pos.y > arena.h - folga;
  return acuado ? { x: arena.w / 2, y: arena.h / 2 } : null;
}

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
 * ⚠️ `celebra` é a JANELA do batimento entre duas etapas (`SOBRA_MS`), não o instante: `festa` sai uma
 * vez (é o gatilho do som, do efeito e do selo ✓) e `celebra` fica verdadeiro até a etapa seguinte subir —
 * é ele que cala a AJUDA do diretor nesse intervalo (`tutorServer.ajuda`), senão o teto da etapa 2
 * seguiria atirando por trás do elogio. Tela nenhuma depende mais dele.
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

  // Já cumpriu: um batimento de `SOBRA_MS` e a próxima sobe (não há tela no meio — ver `TUTOR`).
  if (est.feito) {
    if (agora < est.feito + TUTOR.SOBRA_MS) return saida(est);
    // ⚠️ `desde:0` e não `desde:agora`: quem abre a etapa é o ramo acima, no passo SEGUINTE. Assim
    // "abrir" é um lugar só, e o relógio da ajuda nunca começa a contar num tick em que a etapa nova
    // ainda não foi montada pelo diretor.
    return saida({ etapa: proximaEtapa(est.etapa), desde: 0, feito: 0, ajuda: 0, auto: 0 });
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

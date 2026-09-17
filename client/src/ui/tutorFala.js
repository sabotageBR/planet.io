// ── O QUE O TUTORIAL DIZ, E O QUE ELE MANDA APERTAR ──────────────────────────
// Duas funções PURAS, num `.js` e não dentro do `.jsx`, pelo mesmo motivo de `ui/premio.js`,
// `ui/deadEstilo.js` e `ui/roundClock.js`: não há jsdom no projeto, e o que precisa ser conferido aqui é a
// ESCOLHA — qual frase, qual botão. O `node --test` não carrega `.jsx`, então uma função de decisão que
// mora lá dentro é uma função que ninguém testa.
//
// ⚠️ O QUE ESTAS DUAS ERRAM FALHA EM SILÊNCIO. No dedo, tocar no canvas NÃO atira — dirige o planeta. Um
// jogador de celular a quem se diz "clique para atirar" toca na tela, o planeta vira, nada explode, e ele
// conclui que o tutorial mente. O precedente do par é `hintSplit`/`hintSplitTouch`.
// @ts-check
import { ETAPA } from "../game/tutor.js";
import { preenche } from "../i18n/index.js";

/**
 * O título e a instrução da vez.
 * @param {{etapa:number,ajuda:number,pct:number,dedo:boolean,pre?:boolean}} d
 * @param {*} T o grupo `tutor` do i18n
 * @param {string} tecla a tecla de dividir que o JOGADOR configurou (`prefs.keySplit`)
 * @returns {[string,string]} [título, instrução]
 */
export function falaDoTutor(d, T, tecla) {
  const dedo = !!d.dedo;
  if (d.etapa === ETAPA.NOVA) {
    // ⚠️ A FASE `pre` É A EXPLOSÃO ACONTECENDO, e ela tem fala PRÓPRIA: enquanto a estrela não estourou
    // não existem pedaços, e "leve seu planeta até os pedaços" pede algo que não está na tela. Pedir o
    // impossível na primeira frase do jogo é o jeito mais rápido de alguém concluir que não entendeu.
    if (d.pre) return [T.nova, T.novaEspera];
    if (d.ajuda >= 2) return [T.novaTit, T.novaPuxa];
    // e depois do primeiro terço a instrução vira ELOGIO: repetir "mova o mouse" para quem já está
    // movendo o mouse é a tela dizendo que não percebeu o que ele fez.
    if (d.pct >= .35) return [T.novaTit, T.novaMais];
    if (d.pct > 0) return [T.novaTit, dedo ? T.novaRumo : T.novaMouse];
    return [T.novaTit, dedo ? T.novaDedo : T.novaMouse];
  }
  if (d.etapa === ETAPA.TIRO) {
    // o teto: o míssil do TUTORIAL está no ar (`tutorServer.ajuda`, `st.demo`) — agora a frase é verdade.
    if (d.ajuda >= 3) return [T.tiroTit, T.tiroAuto];
    // ⚠️ NO DEDO A FRASE CONTINUA NOMEANDO O BOTÃO. "Atire agora" serve a quem já sabe COMO se atira; no
    // celular a única frase que dizia "toque em MÍSSIL" vivia 5 s, e 62% das pessoas que chegavam a esta
    // etapa saíam dela sem ter atirado (216 `tutor_tiro_auto` × 135 manuais na 1.31, 85% de tráfego touch).
    if (d.ajuda >= 1) return [T.tiroTit, dedo ? T.tiroAjudaDedo : T.tiroAjuda];
    return [T.tiroTit, dedo ? T.tiroDedo : T.tiroMouse];
  }
  if (d.etapa === ETAPA.SPLIT) {
    if (d.ajuda >= 2) return [T.splitTit, T.splitAjuda];
    // ⚠️ NO DEGRAU 1 O TÍTULO VIRA O DIAGNÓSTICO ("CORRENDO VOCÊ NUNCA ALCANÇA"), e isso é a lição
    // inteira da etapa 3 em duas linhas: primeiro POR QUE a corrida não funciona — que é física, não
    // falta de habilidade: `vmax ∝ r^-0,449` faz a presa ser sempre mais rápida —, depois o que apertar.
    // Repetir "DIVIDA PARA ALCANÇAR" ali só mandaria de novo, mais alto, o que ele já tentou.
    if (d.ajuda >= 1) return [T.splitNao, dedo ? T.splitDedo : preenche(T.splitMouse, { k: tecla })];
    return [T.splitTit, T.splitCaca];
  }
  return ["", ""];
}

/**
 * O PROMPT DE BOTÃO — o bloco grande que mostra O QUE APERTAR. O `tipo` é o que o CSS desenha:
 * `mouse-mover` · `mouse-clique` (com a metade ESQUERDA acesa) · `tecla` · `toque` · `hud`.
 *
 * ⚠️ Ele é a resposta literal a "aparece grande o botão que tem que apertar, se for desktop, se for mouse
 * qual botão na tela". E ele é o ÚNICO lugar que pode responder isso: no mouse não existe nada na tela
 * dizendo a tecla — `#hud-cd` é `display:none` nos três temas e `#touch` só aparece com `pointer:coarse`.
 * ⚠️ A tecla vem do JOGADOR (`prefs.keySplit` é configurável, e o `code` é a posição física, então vale em
 * ABNT, QWERTY e AZERTY). Cravar "ESPAÇO" aqui seria uma legenda que mente para quem remapeou.
 * ⚠️ `null` quando não há gesto a pedir — a etapa 3 antes de o jogador descobrir que perseguir não
 * funciona. Uma dica que chega ANTES do problema é ruído; depois do problema é alívio, e é a razão de a
 * etapa 3 ter dois tempos.
 * @returns {{tipo:string,rotulo:string}|null}
 */
export function promptDoTutor(d, T, tecla) {
  const dedo = !!d.dedo;
  // ⚠️ Nada a apertar enquanto a estrela não estourou: um botão pulsando durante a explosão manda o
  // jogador agir antes de haver o que fazer, e o gesto que ele fizer ali não produz retorno nenhum.
  if (d.etapa === ETAPA.NOVA)
    return d.pre ? null
      : dedo ? { tipo: "toque", rotulo: T.btnDedoTocar } : { tipo: "mouse-mover", rotulo: T.btnMouseMover };
  if (d.etapa === ETAPA.TIRO)
    return dedo ? { tipo: "hud", rotulo: T.btnDedoMissil } : { tipo: "mouse-clique", rotulo: T.btnMouseClicar };
  if (d.etapa === ETAPA.SPLIT && d.ajuda >= 1)
    return dedo ? { tipo: "hud", rotulo: T.btnDedoDividir } : { tipo: "tecla", rotulo: tecla };
  return null;
}

// ── O QUE OS TRÊS MODELOS NOVOS PERGUNTAM (ui/tutorEstilo.js) ─────────────────
// Moram aqui, e não nos `.jsx` de cada modelo, pelo motivo do cabeçalho: são DECISÕES, e decisão que mora
// num `.jsx` é decisão que ninguém testa. Nenhuma delas muda o que `falaDoTutor`/`promptDoTutor` dizem —
// os modelos mudam a FORMA da aula, nunca o conteúdo.

/**
 * A PALAVRA GIGANTE da etapa: MOVA · ATIRE · DIVIDA. Uma palavra só, porque é o que sobra legível a 2 m de
 * um celular na mão de uma criança — e a frase inteira continua vindo de `falaDoTutor`, logo abaixo dela.
 * @returns {string}
 */
export function verboDoTutor(d, T) {
  return d.etapa === ETAPA.NOVA ? T.verbo1 : d.etapa === ETAPA.TIRO ? T.verbo2
    : d.etapa === ETAPA.SPLIT ? T.verbo3 : "";
}

/**
 * QUAL TIRINHA o modelo `cena` desenha: `espera` · `nova` · `tiro` · `caca` · `salto`, ou `null`.
 *
 * ⚠️ **A ETAPA 3 TEM DUAS, E A ORDEM É A LIÇÃO.** `caca` mostra o OBJETIVO (coma o planeta pequeno) e só
 * com `ajuda>=1` entra `salto`, que mostra o COMO. É o mesmo tempo duplo de `promptDoTutor`, que devolve
 * `null` ali: uma dica que chega antes do problema é ruído. Mostrar o salto no segundo zero entregaria a
 * resposta antes de o jogador descobrir que correr não alcança — e é essa descoberta que faz o botão de
 * DIVIDIR ser um alívio em vez de mais uma ordem.
 * ⚠️ `espera` é a fase `pre` (a estrela ainda não estourou): sem gesto na tirinha, porque não há o que
 * fazer ainda — o mesmo argumento que tira o prompt dessa fase.
 * @returns {"espera"|"nova"|"tiro"|"caca"|"salto"|null}
 */
export function cenaDoTutor(d) {
  if (d.etapa === ETAPA.NOVA) return d.pre ? "espera" : "nova";
  if (d.etapa === ETAPA.TIRO) return "tiro";
  if (d.etapa === ETAPA.SPLIT) return d.ajuda >= 1 ? "salto" : "caca";
  return null;
}

/**
 * A tirinha que a tela de ETAPA COMPLETA mostra como "A SEGUIR" — a pausa de `SOBRA_MS` vira pré-aula.
 * ⚠️ Depois da etapa 2 vem `caca`, NUNCA `salto`: pelo motivo de cima, antecipar o salto na comemoração
 * estragaria a etapa seguinte inteira. Depois da 3 não há próxima.
 * @returns {"tiro"|"caca"|null}
 */
export function proximaCena(etapa) {
  return etapa === ETAPA.NOVA ? "tiro" : etapa === ETAPA.TIRO ? "caca" : null;
}

/**
 * O cartão do modelo `cena` está ABERTO (tirinha à vista) ou virou PÍLULA (uma linha)?
 *
 * ⚠️ Só a etapa 1 encolhe, e não é preguiça: ela é a única com sinal de "começou a acertar" (`pct` sai da
 * massa). Nas outras duas o gesto É a etapa — quando ele acontece, ela acabou. E encolher por TEMPO está
 * fora: `body[data-reduce="1"] *` zera toda duração de animação, então nada aqui pode depender de um
 * relógio de CSS, e um relógio de JS bateria de frente com o degrau de ajuda dos 5 s.
 * ⚠️ Reabre no degrau 2 (`ajuda>=2`): é quando os pedaços passam a vir até o jogador, ou seja, quando ele
 * claramente NÃO entendeu — e a tirinha é a explicação.
 * @returns {"aberto"|"pilula"}
 */
export function formaDoCartao(d) {
  return d.etapa === ETAPA.NOVA && !d.pre && d.pct > 0 && d.ajuda < 2 ? "pilula" : "aberto";
}

/**
 * QUAL BOTÃO DE VERDADE DO HUD PULSA (`#t-fire` · `#t-split`), ou `null`.
 *
 * ⚠️ **SÓ NO DEDO, E É O CONSERTO DE UM CONVITE ERRADO.** O prompt desenha uma RÉPLICA do botão MÍSSIL /
 * DIVIDIR, longe do botão real — e uma criança toca na réplica. O toque cai no canvas, que no dedo DIRIGE
 * o planeta: ele vira, nada explode, e ela conclui que o jogo não responde. A etapa 2 é a que mais perde
 * gente no funil (172 de 1.140). Com o botão VERDADEIRO pulsando, o olho vai para onde o dedo tem de ir.
 * No mouse não há botão na tela (`#touch` só existe com `pointer:coarse`), então não há o que pulsar.
 * ⚠️ Função à parte, e não um campo em `promptDoTutor`: o retorno de lá é comparado por `deepEqual` nos
 * testes e é o contrato do modelo clássico, que fica como está.
 * @returns {"t-fire"|"t-split"|null}
 */
export function alvoDoTutor(d) {
  if (!d.dedo || d.pre) return null;
  if (d.etapa === ETAPA.TIRO) return "t-fire";
  if (d.etapa === ETAPA.SPLIT && d.ajuda >= 1) return "t-split";
  return null;
}

/**
 * O PROMPT DO MODELO CLÁSSICO (o de produção): com o botão REAL pulsando, a réplica SAI.
 *
 * ⚠️ A réplica do botão (uma pílula amarela de 110×52 px, pulsando, no canto inferior ESQUERDO) parece
 * exatamente um botão apertável — e é `pointer-events:none`: o toque atravessa para o canvas, que no dedo
 * DIRIGE o planeta. Ele vira, nada explode, e a pessoa conclui que o jogo não responde. O botão de verdade
 * mora no canto DIREITO. Duas coisas pedindo o mesmo toque em cantos opostos é o defeito; com o `#t-fire`
 * real pulsando e com seta (`alvoDoTutor` → `data-alvo`), o olho tem UM lugar para ir.
 * ⚠️ Função à parte: o retorno de `promptDoTutor` é contrato (`deepEqual` nos testes) e os três modelos
 * candidatos o usam como está. No mouse nada muda — lá não há botão na tela, e o prompt É a instrução.
 */
export const promptClassico = (d, T, tecla) => alvoDoTutor(d) ? null : promptDoTutor(d, T, tecla);

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
 * @param {{etapa:number,ajuda:number,pct:number,dedo:boolean}} d @param {*} T o grupo `tutor` do i18n
 * @param {string} tecla a tecla de dividir que o JOGADOR configurou (`prefs.keySplit`)
 * @returns {[string,string]} [título, instrução]
 */
export function falaDoTutor(d, T, tecla) {
  const dedo = !!d.dedo;
  if (d.etapa === ETAPA.NOVA) {
    if (d.ajuda >= 2) return [T.novaTit, T.novaPuxa];
    if (d.pct > 0) return [T.novaTit, dedo ? T.novaRumo : T.novaMouse];
    return [T.novaTit, dedo ? T.novaDedo : T.novaMouse];
  }
  if (d.etapa === ETAPA.TIRO) {
    if (d.ajuda >= 1) return [T.tiroTit, T.tiroAjuda];
    return [T.tiroTit, dedo ? T.tiroDedo : T.tiroMouse];
  }
  if (d.etapa === ETAPA.SPLIT) {
    if (d.ajuda >= 2) return [T.splitTit, T.splitAjuda];
    if (d.ajuda >= 1) return [T.splitTit, dedo ? T.splitDedo : preenche(T.splitMouse, { k: tecla })];
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
  if (d.etapa === ETAPA.NOVA)
    return dedo ? { tipo: "toque", rotulo: T.btnDedoTocar } : { tipo: "mouse-mover", rotulo: T.btnMouseMover };
  if (d.etapa === ETAPA.TIRO)
    return dedo ? { tipo: "hud", rotulo: T.btnDedoMissil } : { tipo: "mouse-clique", rotulo: T.btnMouseClicar };
  if (d.etapa === ETAPA.SPLIT && d.ajuda >= 1)
    return dedo ? { tipo: "hud", rotulo: T.btnDedoDividir } : { tipo: "tecla", rotulo: tecla };
  return null;
}

// ── MODO DE VIEWPORT: forma do aparelho + capacidade de entrada ───────────────
// São DUAS informações independentes, e misturá-las era a raiz da bagunça de responsividade:
//   body[data-mode]    = FORMA   desktop | tablet | landscape | portrait   (trocas grossas de layout, tamanho do radar)
//   body[data-pointer] = ENTRADA coarse | fine                             (botões de toque, joystick, alvo de 44 px)
//   body[data-h]       = ALTURA  short | ""                                (cabe? — o frame de portal é um desktop BAIXO)
// Medida fina (largura exata, quantas colunas cabem) é decisão do CSS, não daqui: assim o PRIMEIRO PAINT já
// sai certo — o HTML nasce com data-mode="desktop" e, antes desta correção, qualquer celular pintava a tela
// de desktop até o React montar.
// `tablet` existe porque tela grande COM toque caía em `desktop`: um iPad deitado (1180×820, 1366×1024) não
// passa em `h<=500` nem em `coarse && w<=1100`, e recebia a gaveta lateral, as tabelas de 6 colunas e os
// alvos de 18 px do desktop — sendo operado com o dedo.
// HISTERESE: os limiares têm folga (BAND) e a decisão leva em conta o modo ANTERIOR. Sem isso, arrastar a
// borda da janela por cima de 820 px repintava o layout inteiro a cada pixel.
import { useEffect } from "react";
import { app } from "../state/app.js";

export const MODES = ["desktop", "tablet", "landscape", "portrait"];
const PHONE_W = 700;      // largura acima da qual um retrato deixa de ser "celular em pé" (o celular mais
                          // largo do mercado tem ~430 css px; um iPad mini em pé tem 744, e antes o limiar
                          // de 820 dava a ELE o layout de telefone)
const SHORT_H = 500;      // altura abaixo da qual uma tela deitada é celular deitado
const TABLET_W = 1500;    // acima disso, tela com toque já é do tamanho de um desktop
const BAND = 40;          // folga da histerese: o limiar de subida e o de descida não são o mesmo número

/** Limiar com folga: para SAIR de `dentro` é preciso passar de `lim+BAND`; para entrar, basta `lim`. */
const cruza = (v, lim, dentro) => (dentro ? v <= lim + BAND : v <= lim);

// ── A TERCEIRA DIMENSÃO: ALTURA ÚTIL ──────────────────────────────────────────
// `data-mode` diz a FORMA e `data-pointer` diz a ENTRADA; nenhum dos dois responde "cabe?". Um frame de
// portal é um DESKTOP BAIXO — 960×540 e 1920×1080 são o MESMO `data-mode`, com metade da altura —, e é
// exatamente ali que o rodapé de ação das telas sai da dobra. Foi o que os prints da Poki mostraram.
// ⚠️ `@media` não serve: a regra da casa é decidir por atributo (e o CDP da sonda fixa atributo, não
// media query — sem isso a matriz não conseguiria medir a forma de tela que este número existe para pegar).
// O número é a soma dos blocos fixos de uma tela: `--screen-top`×2 (88) + `--nav-h` (74) + o miolo mínimo
// de um cartão (420) = 582, arredondado para cima.
const SHORT_H_UI = 640;
/**
 * Falta ALTURA para o layout confortável desta tela? Puro, para ser conferido em tabela.
 * ⚠️ Acende TAMBÉM no celular deitado (375 px de altura), e isso é correto, não descuido: ele tem o mesmo
 * problema. O que a cascata precisa cuidar é de não EMPATAR com as regras de `data-mode="landscape"` —
 * quem quiser tratar o caso combinado escreve `[data-h="short"][data-mode="landscape"]`, que ganha.
 * @param {number} h @param {boolean} [antes] estava em "short"? (histerese, como o resto do arquivo)
 */
export const ehBaixa = (h, antes) => cruza(h, SHORT_H_UI, !!antes);

/**
 * Decisão pura — sem globais, para poder ser testada. `antes` é o modo atual (histerese).
 * @param {number} w @param {number} h @param {boolean} coarse @param {string} [antes]
 * @returns {"desktop"|"tablet"|"landscape"|"portrait"}
 */
export function modeFor(w, h, coarse, antes) {
  if (h > w) {   // ── em pé ──
    if (!coarse) return cruza(w, PHONE_W, antes === "portrait") ? "portrait" : "desktop";
    return cruza(w, PHONE_W, antes === "portrait") ? "portrait" : "tablet";
  }
  // ── deitado ──
  if (cruza(h, SHORT_H, antes === "landscape")) return "landscape";
  if (!coarse) return "desktop";
  return cruza(w, TABLET_W, antes === "tablet") ? "tablet" : "desktop";
}
/** `coarse` = o ponteiro PRIMÁRIO é grosso (dedo). É o que decide affordance de toque, não o tamanho. */
export const pointerFor = coarse => (coarse ? "coarse" : "fine");

/**
 * É CELULAR? — as duas formas de telefone, em pé e deitado. Quem some no telefone (hoje: o chat, ver
 * ui/Chat.jsx) pergunta aqui, e não a um `matchMedia` próprio.
 * ⚠️ `tablet` fica de FORA, e é o ponto inteiro de a constante existir: `data-pointer="coarse"` responde
 * "é dedo?" e casaria com um iPad, que tem 1180 px de largura e espaço de sobra para um painel de chat no
 * canto. O que atrapalha a gameplay é a tela PEQUENA, não o dedo — e `modeFor` já separou as duas coisas.
 * @param {string|null|undefined} mode o `app.mode` (= `body[data-mode]`)
 */
export const ehCelular = mode => mode === "portrait" || mode === "landscape";

const forced = () => {
  const m = new URLSearchParams(location.search).get("mode");   // relido a cada chamada: antes era lido uma vez, no load do módulo
  return MODES.includes(m) ? m : null;
};
/** Modo atual a partir do viewport (ou `?mode=…` forçado). */
export function computeMode(antes) {
  return forced() || modeFor(innerWidth, innerHeight, matchMedia("(pointer: coarse)").matches, antes);
}
export const computePointer = () => pointerFor(matchMedia("(pointer: coarse)").matches);

/**
 * Mantém body[data-mode] e body[data-pointer] em dia. O resize é DEBOUNCED: além de evitar trabalho à toa,
 * é o mesmo evento que dispara o reenvio de `view` ao servidor — e sem debounce arrastar a borda da janela
 * estourava o balde de 5 JSON/s e derrubava a conexão com RATE.
 */
export function useViewportMode() {
  useEffect(() => {
    let t = 0;
    const apply = () => {
      const m = computeMode(document.body.dataset.mode), p = computePointer();
      // "" e não "tall": o atributo só EXISTE quando falta altura, então nenhum seletor precisa do caso
      // negativo — é o mesmo idioma de `body[data-shell]`, que também nasce vazio.
      const alt = ehBaixa(innerHeight, document.body.dataset.h === "short") ? "short" : "";
      if (document.body.dataset.mode !== m) document.body.dataset.mode = m;
      if (document.body.dataset.pointer !== p) document.body.dataset.pointer = p;
      if (document.body.dataset.h !== alt) document.body.dataset.h = alt;
      if (app.get().mode !== m) app.update({ mode: m });
    };
    const agenda = () => { clearTimeout(t); t = setTimeout(apply, 150); };
    apply();
    addEventListener("resize", agenda); addEventListener("orientationchange", agenda);
    return () => { clearTimeout(t); removeEventListener("resize", agenda); removeEventListener("orientationchange", agenda); };
  }, []);
}

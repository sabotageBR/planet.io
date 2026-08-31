import { useSyncExternalStore } from "react";
import { currentTheme } from "../app/theme.js";
import { getLabels, currentLang } from "../i18n/index.js";

const subscribe = fn => { addEventListener("warspace:theme", fn); return () => removeEventListener("warspace:theme", fn); };
/** Tema atual; re-renderiza no evento `warspace:theme`. */
export function useTheme() { return useSyncExternalStore(subscribe, currentTheme, currentTheme); }

// Os textos dependem de DOIS eixos — idioma e tema — e cada um tem o seu evento. Assinar os dois aqui
// é o que faz a tela inteira se retraduzir na hora em que o jogador troca de idioma nas Opções, sem
// um único `useEffect` espalhado pelos 24 componentes que chamam `useLabels()`.
// ⚠️ O snapshot tem que ser uma REFERÊNCIA ESTÁVEL (useSyncExternalStore compara com Object.is, e um
// objeto novo a cada leitura seria um laço de render infinito). `getLabels` memoiza por (idioma, tema),
// então a mesma dupla devolve sempre o mesmo objeto — e a chave inclui o tema porque ele vem de
// `html[data-theme]`, que já mudou quando o evento chega.
const assinaLabels = fn => {
  addEventListener("warspace:theme", fn); addEventListener("warspace:lang", fn);
  return () => { removeEventListener("warspace:theme", fn); removeEventListener("warspace:lang", fn); };
};
const snapLabels = () => getLabels();
/** Os textos do idioma ativo, já com o que o tema diz diferente. */
export function useLabels() { return useSyncExternalStore(assinaLabels, snapLabels, snapLabels); }
/** O id do idioma ativo, para quem precisa dele (formatação por locale). */
export function useLang() { return useSyncExternalStore(assinaLabels, currentLang, currentLang); }

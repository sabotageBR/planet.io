// ── O CONVITE ─────────────────────────────────────────────────────────────────
// No site é um link que abre a sala: `https://warspace.io/?sala=ABCD`.
// ⚠️ No pacote de portal, NÃO. `location.origin` ali é o domínio do portal, então o link nem levaria a
//    lugar nenhum — e mesmo que levasse, mandar o jogador para fora é justamente o que os portais
//    proíbem (link de saída). Lá o convite é o CÓDIGO, que é o que o amigo digita na tela de Salas.
import { PORTAL } from "../portal/flags.js";

/** @param {"sala"|"party"} tipo @param {string} code */
export function linkConvite(tipo, code) {
  const c = String(code || "");
  return PORTAL ? c : `${location.origin}/?${tipo}=${c}`;
}

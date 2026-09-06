// ── DE ONDE A CONTA VEIO: o Origin cru vira o nome do portal ──────────────────
// `users.origin` (migração 0010) guarda o cabeçalho `Origin` do `POST /api/auth/guest`, ou seja um domínio
// (`https://html5.gamemonetize.co`), não um id de portal — e é assim que tem que ser: um portal novo
// aparece no banco antes de qualquer código nosso conhecer o nome dele. A tradução é de EXIBIÇÃO e mora
// aqui, no painel, ao lado do `ordenar.js`: pura, sem React e testável sem jsdom.
//
// ⚠️ ISTO NÃO É UM PORTÃO. `server/src/http/cors.js` é quem decide quem pode falar com a API, e a lista
// dele é o ConfigMap. Uma origem que não casa aqui não é recusada em lugar nenhum — ela só aparece pelo
// domínio, que é a resposta honesta para "de onde veio essa conta?".
// ⚠️ O casamento é por HOST exato ou por sufixo de domínio (`.poki.com`), nunca por `includes`: é a mesma
// regra do cors.js, e pelo mesmo motivo — `poki.com.outracoisa.tld` contém a string inteira.

/** domínio → nome que se lê. A ordem não importa: o casamento é por host, não por posição. */
const PORTAIS = [
  ["gamedistribution.com", "GameDistribution"],
  ["crazygames.com", "CrazyGames"],
  ["poki.com", "Poki"], ["poki.io", "Poki"], ["poki.dev", "Poki"],
  ["poki-cdn.com", "Poki"], ["poki-gdn.com", "Poki"], ["poki-user-content.com", "Poki"],
  ["itch.zone", "itch.io"], ["itch.io", "itch.io"],
  ["y8.com", "Y8"],
  ["gamemonetize.co", "GameMonetize"], ["gamemonetize.com", "GameMonetize"],
  ["gameflare.com", "GameFlare"],
  ["playgama.com", "Playgama"], ["playgama.net", "Playgama"],
  ["gamepix.com", "GamePix"],
  ["warspace.io", "site"],
];

/**
 * O nome do portal de uma origem. `null`/vazio = **site**: conta nascida na mesma origem não manda
 * `Origin`, e essa ausência é informação, não buraco.
 * @param {string|null|undefined} origem o valor cru de `users.origin`
 * @returns {string} o nome do portal, `"site"`, ou o próprio HOST quando é desconhecido
 */
export function portalDe(origem) {
  const o = String(origem || "").trim().toLowerCase();
  if (!o || o === "site") return "site";
  let host = "";
  try { host = new URL(o.includes("://") ? o : "https://" + o).hostname; } catch { host = ""; }
  if (!host) return o;
  for (const [d, nome] of PORTAIS) if (host === d || host.endsWith("." + d)) return nome;
  // Desconhecido sai pelo HOST, sem o esquema: "algumcdn.com" ainda diz de onde veio, e é assim que o
  // portal seguinte aparece no painel sem uma linha de código.
  return host.replace(/^www\./, "");
}

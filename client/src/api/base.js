// ── ONDE MORA O SERVIDOR ──────────────────────────────────────────────────────
// O cliente sempre falou com a própria origem: `/api/…` relativo e o WebSocket em `location.host`.
// Isso continua valendo para warspace.io e é o caminho que o Ingress serve. Mas o MESMO cliente é
// empacotado num .zip que os portais de jogos (GameDistribution, CrazyGames, Poki, itch.io) servem do
// domínio DELES, dentro de um iframe — e lá `location.host` é o portal, não nós.
//
// ⚠️ O CONTRATO É QUE BASE VAZIA NÃO MUDA NADA. `apiUrl("/api/me")` com base vazia é concatenação com
//    string vazia: sai `/api/me`, byte a byte como antes, sem um `if` em runtime. É isso que faz esta
//    mudança ser inofensiva para o site — e é por isso que não há normalização condicional aqui.
//
// ⚠️ NUNCA crie `client/.env` (sem sufixo de modo): ele valeria também para o `npm run build` de dentro
//    do client/Dockerfile, e toda chamada de produção viraria cross-origin — com preflight, com CORS e
//    sem ninguém entender por quê. A base só é injetada pelo empacotador (scripts/portal-pack.mjs).
const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
/** Origem absoluta do servidor (`https://warspace.io`), ou "" para falar com a própria origem. */
export const API_BASE = String(env.VITE_API_BASE || "").replace(/\/+$/, "");

/** `/api/me` → `/api/me` no site, `https://warspace.io/api/me` no pacote de portal. */
export const apiUrl = p => API_BASE + p;

/**
 * URL do WebSocket do shard.
 * ⚠️ O esquema sai da BASE, não de `location.protocol`: a verificação do pacote roda servida em
 * `http://127.0.0.1`, e derivar do protocolo da página tentaria `ws://` contra um servidor `wss://` —
 * um falso negativo que faria você culpar o servidor.
 */
export const wsUrl = shard => (API_BASE
  ? API_BASE.replace(/^http/, "ws")
  : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`) + `/ws/${shard}`;

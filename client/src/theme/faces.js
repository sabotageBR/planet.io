// ── AS ARTES QUE VÃO DENTRO DO DISCO: caricaturas de egg e os TRÊS MASCOTES ───
// Gêmeo de `avatars.js`, e pelo mesmo motivo: `paintPattern` é SÍNCRONO — roda dentro de `cache.get`/`warm`
// do TextureCache, onde não há await —, então o bitmap tem que estar decodificado ANTES de a textura ser
// assada. Aqui a arte é ESTÁTICA (vem de `client/public/faces/`), o que torna tudo mais simples que a foto
// do jogador: não há versão, não há usuário, e o navegador guarda o arquivo no cache dele.
//
// A CHAVE da textura carrega "a cara já chegou?" — enquanto não chegou, o planeta é assado no fallback
// (disco liso da cor da skin) e, quando o bitmap fica pronto, a chave muda sozinha e a textura nova é
// assada no frame seguinte. É o mesmo truque de `avatars.js`, porque o TextureCache não tem `drop(key)`.
// @ts-check
import { skinById } from "@warspace/shared";
import { PORTAL } from "../portal/flags.js";
import { apiUrl } from "../api/base.js";

/**
 * OS TRÊS MASCOTES. Mesma máquina das caricaturas — mesmo cache, mesma chave, mesmo "assa liso agora e
 * reassa quando o bitmap chegar" — e três diferenças que são o ponto:
 *  1. eles NUNCA são cortados no pacote de portal. As 35 caricaturas são de pessoas reais e caem no
 *     `!PORTAL` de `faceFile`; estes são personagens NOSSOS, e é justamente por isso que eles servem
 *     como skin premium num portal.
 *  2. a arte é a MESMA que o cenário do menu (`ui/Scene.jsx`) e os cartões da tela de modos já usam. Não
 *     há cópia em `client/public/`: `new URL(..., import.meta.url)` é reescrito pelo Vite para o asset
 *     hasheado — o mesmo arquivo que o `import` daqueles dois módulos emite —, então o zip não engorda
 *     um byte e o cache do navegador é compartilhado.
 *     ⚠️ `new URL(...)` e NÃO `import`: este módulo está na cadeia de import dos TRÊS temas, e
 *     `client/test/textures.test.js` os carrega no `node --test`, onde importar um `.webp` derruba o
 *     loader. `new URL` é só aritmética de URL — o Node a avalia sem tocar no arquivo.
 *  3. elas não têm moldura própria: a arte tem fundo TRANSPARENTE e é desenhada SOBRE o disco da cor da
 *     skin (ver `mascote()` em patterns.js), enquanto a caricatura é uma imagem cheia de borda a borda.
 * @type {Record<string,string>}
 */
const MASCOTES = {
  marte: new URL("../assets/scene/planeta-laranja.webp", import.meta.url).href,
  terra: new URL("../assets/scene/planeta-azul.webp", import.meta.url).href,
  lua: new URL("../assets/scene/lua.webp", import.meta.url).href,
};
/** A chave de um mascote leva `@` para nunca colidir com um nome de arquivo de caricatura. */
const chaveMascote = m => "@" + m;

/** @type {Map<string,ImageBitmap|null>} arquivo → bitmap pronto (ou null enquanto carrega/falhou) */
const cache = new Map();
/** Quem quer saber quando uma arte chega. No JOGO isso é de graça (a chave da textura muda e o frame
 *  seguinte reassa), mas a PRÉVIA da loja é um canvas pintado uma vez — sem aviso, ela ficaria no disco
 *  liso até o React repintar por outro motivo. @type {Set<Function>} */
const ouvintes = new Set();
export function onFaceReady(cb) { ouvintes.add(cb); return () => ouvintes.delete(cb); }

/**
 * O nome do arquivo da skin, ou null se ela não é uma caricatura.
 *
 * ⚠️ AS CARICATURAS NÃO VÃO NO PACOTE DE PORTAL, e o risco deixou de ser hipótese: a decisão anterior
 * era mantê-las em todo lugar e assumir a reprovação, e a reprovação veio. As *Prohibited Practices* da
 * GameDistribution batem nelas por dois lados — "use of intellectual properties without proper ownership
 * rights — proof of ownership must be available" (são 35 pessoas REAIS: Messi, Neymar, Elon Musk…) e
 * "explicit use of … politics" (Trump, Lula, Bolsonaro, Putin, Zelensky, Milei, Macron, Xi, Modi,
 * Lincoln, Churchill) — e, num jogo chamado WARspace, Putin e Zelensky com bandeira no mesmo catálogo
 * são o pior par possível. Some a isso que elas são arte GERADA, e "jogo feito por IA" foi a palavra
 * exata de uma das reprovações.
 *
 * O corte é de EXIBIÇÃO e tem duas metades que andam juntas: este `!PORTAL` e a linha `"faces"` na PODA
 * de scripts/portal-pack.mjs (sem ela, os 35 arquivos continuariam dentro do zip, com o nome entregando
 * a identidade — `07_putin.webp` — mesmo sem ninguém desenhá-los). O SERVIDOR continua escolhendo a skin
 * de egg pelo nick (`persist/hooks.js`), porque ele é o mesmo do site; o que muda é que o planeta cai no
 * disco liso da cor da skin — o mesmo caminho já usado enquanto a arte não chegou. No site, nada muda.
 *
 * ⚠️ O MASCOTE PASSA EM TODO LUGAR, portal incluído, e responde por esta MESMA função de propósito: quem
 * pergunta "esta skin tem arte dentro do disco?" são quatro lugares (a textura do planeta, a chave do
 * cache, a prévia da loja e — o que menos se lembra — a decisão de NÃO escrever o nome do jogador em
 * cima dela, em `layers/Planets.js`), e duas respostas para a mesma pergunta divergem na 1ª correção.
 */
/**
 * ── A ARTE VINDA DO BANCO ─────────────────────────────────────────────────────
 * `skinId → hash` do que o servidor mandou em `/api/skins` (campo `db`). É este mapa que faz uma skin de
 * CÓDIGO ser desenhada com imagem sem trocar de id — o caminho pelo qual as 35 caricaturas saem do pacote
 * e passam a vir do Postgres, mantendo `user_skins` e os `unlockKey` intactos.
 * ⚠️ A CHAVE do cache carrega o HASH (`#84:abc123`): arte trocada no /admin = chave nova = textura reassada
 * no frame seguinte, sem F5 e sem `drop(key)` — que o TextureCache não tem. É o mesmo mecanismo do avatar.
 */
const artDb = new Map();
export function setSkinArt(lista) {
  artDb.clear();
  for (const s of lista || []) if (s && s.id != null && s.art_hash) artDb.set(s.id | 0, String(s.art_hash));
}
const chaveArt = (id, hash) => `#${id}:${hash}`;
const artUrl = f => { const i = f.indexOf(":"); return apiUrl(`/api/skins/${f.slice(1, i)}/art?v=${f.slice(i + 1)}`); };
/**
 * ⚠️ A ORDEM É A REGRA, e cada degrau tem um porquê:
 *   1. BANCO   — vale em TODA plataforma, portal incluído. É o que "não colocar elas no zip mas ter elas
 *                no banco" quer dizer: os arquivos saem da build e a arte vem por URL.
 *   2. MASCOTE — arte NOSSA, sempre embutida; é o que a torna vendável num portal.
 *   3. ARQUIVO — a caricatura local, RESERVA e só fora do portal, até a migração para o banco provar em
 *                produção. Ela sai da build num commit seguinte.
 */
export const faceFile = sk => {
  if (!sk) return null;
  const h = artDb.get(sk.id | 0);
  if (h) return chaveArt(sk.id | 0, h);
  if (sk.mascot) return chaveMascote(sk.mascot);
  return (!PORTAL && sk.face) || null;
};
/** O bitmap, se já estiver pronto. Nunca espera — quem desenha está dentro de um frame. */
export const faceBitmap = sk => { const f = faceFile(sk); return f ? cache.get(f) || null : null; };
/** Sufixo de chave: só muda quando o bitmap CHEGA, que é exatamente quando a textura tem que ser refeita. */
export const faceKey = sk => (faceBitmap(sk) ? "1" : "");

/** Dispara e esquece. Chamado do laço de render, então tem que ser barato quando já existe: um `has`. */
export function ensureFace(sk) {
  const f = faceFile(sk); if (!f || cache.has(f)) return;
  cache.set(f, null);   // marca ANTES do await: senão 60 frames disparam 60 fetches
  (async () => {
    try {
      // ⚠️ `BASE_URL` (e não "/"): num portal o jogo é servido de um subcaminho, e a raiz do zip é ele.
      // Ele SEMPRE termina em "/" — daí a interpolação sem barra própria, senão vira ".//faces/".
      // O mascote já vem com a URL pronta do bundler; a caricatura mora em `public/faces/`.
      // ⚠️ A arte de BANCO passa por `apiUrl`, e não por caminho relativo: num portal o jogo roda no
      // domínio DELES e isto é cross-origin — quem consome é `fetch`, sujeito a CORS, exatamente como o
      // avatar do jogador (ver theme/avatars.js). O `?v=` é o hash: é ele que torna o `immutable` de um
      // ano seguro do lado do servidor.
      const url = f[0] === "#" ? artUrl(f) : f[0] === "@" ? MASCOTES[f.slice(1)] : `${import.meta.env.BASE_URL}faces/${f}.webp`;
      if (!url) return;
      const r = await fetch(url, { cache: "force-cache" });
      if (!r.ok) return;
      cache.set(f, await createImageBitmap(await r.blob()));
      for (const cb of ouvintes) { try { cb(f); } catch { /* um ouvinte quebrado não derruba os outros */ } }
    } catch { /* sem a arte é o disco liso: o jogo não para por isso */ }
  })();
}
/**
 * Aquece as caricaturas que a SALA vai precisar. As skins de egg são poucas e pequenas (~15 KB), e o
 * custo de descobrir isso no meio da partida é o planeta do adversário piscando de liso para cara.
 */
export function warmFaces(skinIds) {
  // `faceFile` e não `sk.face`: sem isso o MASCOTE ficaria de fora do aquecimento e só seria descoberto
  // no meio da partida — o planeta do adversário piscando de liso para arte, que é o que isto evita.
  for (const id of skinIds || []) { const sk = skinById(id); if (faceFile(sk)) ensureFace(sk); }
}
export function clearFaces() { for (const b of cache.values()) if (b && b.close) b.close(); cache.clear(); }

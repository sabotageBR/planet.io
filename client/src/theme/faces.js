// ── CARICATURAS DOS EASTER EGGS (as skins escolhidas pelo NICK) ───────────────
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

/** @type {Map<string,ImageBitmap|null>} arquivo → bitmap pronto (ou null enquanto carrega/falhou) */
const cache = new Map();
/** Quem quer saber quando uma arte chega. No JOGO isso é de graça (a chave da textura muda e o frame
 *  seguinte reassa), mas a PRÉVIA da loja é um canvas pintado uma vez — sem aviso, ela ficaria no disco
 *  liso até o React repintar por outro motivo. @type {Set<Function>} */
const ouvintes = new Set();
export function onFaceReady(cb) { ouvintes.add(cb); return () => ouvintes.delete(cb); }

/** O nome do arquivo da skin, ou null se ela não é uma caricatura. */
export const faceFile = sk => (sk && sk.face) || null;
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
      const r = await fetch(`${import.meta.env.BASE_URL}faces/${f}.webp`, { cache: "force-cache" });
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
  for (const id of skinIds || []) { const sk = skinById(id); if (sk && sk.face) ensureFace(sk); }
}
export function clearFaces() { for (const b of cache.values()) if (b && b.close) b.close(); cache.clear(); }

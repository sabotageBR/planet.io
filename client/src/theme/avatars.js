// ── FOTOS DOS JOGADORES (a skin "Retrato") ────────────────────────────────────
// `paintPattern` é SÍNCRONO: roda dentro de `cache.get`/`warm` do TextureCache, onde não há await. Então
// o bitmap precisa estar decodificado ANTES de a textura ser assada.
//
// O truque que evita qualquer invalidação de cache: a CHAVE da textura inclui a versão do avatar. Enquanto
// a foto não chegou, o jogador é assado com a chave sem avatar (silhueta); quando o bitmap fica pronto, a
// chave muda sozinha e a textura nova é assada no frame seguinte. A velha morre na eviction LRU — o
// TextureCache não tem (nem precisa de) um `drop(key)`.
// @ts-check
import { api } from "../api/client.js";

/** @type {Map<string,ImageBitmap|null>} chave "userId:v" → bitmap pronto (ou null enquanto carrega/falhou) */
const cache = new Map();
const MAX = 64;   // 50 numa sala; o resto é folga para trocas durante a rodada

export const avatarKey = a => (a && a.userId && a.v ? `${a.userId}:${a.v}` : null);
/** O bitmap, se já estiver pronto. Nunca espera — quem desenha está dentro de um frame. */
export const avatarBitmap = a => { const k = avatarKey(a); return k ? cache.get(k) || null : null; };

/**
 * Garante o carregamento (dispara e esquece). Chamado do laço de render, então tem que ser barato quando
 * já existe: um `has` no Map.
 */
export function ensureAvatar(a) {
  const k = avatarKey(a); if (!k || cache.has(k)) return;
  cache.set(k, null);   // marca ANTES do await: senão 60 frames disparam 60 fetches
  (async () => {
    try {
      const r = await fetch(api.avatarUrl(a.userId, a.v), { cache: "force-cache" });
      if (!r.ok) return;
      const bmp = await createImageBitmap(await r.blob());
      cache.set(k, bmp);
      if (cache.size > MAX) { const velho = cache.keys().next().value; const b = cache.get(velho); if (b && b.close) b.close(); cache.delete(velho); }
    } catch { /* sem foto é a silhueta: o jogo não para por isso */ }
  })();
}
export function clearAvatars() { for (const b of cache.values()) if (b && b.close) b.close(); cache.clear(); }

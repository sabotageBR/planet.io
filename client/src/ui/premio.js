// ── O QUE A TELA DE MORTE OFERECE ─────────────────────────────────────────────
// Função PURA, no molde de `game/quality.js` e `ui/roundClock.js`: a decisão é uma tabela de prioridade e
// merece teste próprio, sem jsdom e sem Pixi.
//
// A PRIORIDADE é "prêmio > oferta > nada", e ela existe porque as três mecânicas pedidas chegam por portas
// diferentes e não podem virar três blocos empilhados numa tela que já estava cortada:
//   1. skin DESTRAVADA nesta partida — vem em `rewards.skinsUnlocked`, e é a única que é um FATO
//      consumado. Ela ganha de tudo: anunciar uma oferta por cima de um prêmio que o jogador acabou de
//      conquistar é trocar a comemoração por uma venda.
//   2. oferta de ANÚNCIO — a primeira da pool que ele ainda não tem. Só quando há SDK de anúncio de
//      verdade: um botão que não abre vídeo nenhum é pior que botão nenhum (a lição de Shop.jsx).
//   3. nada.
import { AD_GIFT_SKINS, SKIN_BY_ID, skinById } from "@warspace/shared";

/**
 * @param {{skinsUnlocked?:number[]}|null} rewards o `{t:"rewards"}` da partida (pode não ter chegado)
 * @param {number[]} owned as skins que a conta já tem
 * @param {boolean} temAnuncio o portal tem anúncio recompensado? (`portal.temRecompensa`)
 * @param {boolean} logado conta de verdade (convidado local não tem onde guardar)
 * @returns {{tipo:'skin'|'anuncio',id:number,skin:any}|null}
 */
export function escolhePremio(rewards, owned, temAnuncio, logado) {
  const tem = new Set(owned || []);
  // 1) o que a partida DESTRAVOU. Mais de uma? A de maior id — as famílias crescem em dificuldade, então
  //    a mais nova é a mais difícil, e é dela que o jogador quer saber.
  // ⚠️ `SKIN_BY_ID.has` e NUNCA `skinById(id)` como predicado: aquele tem fallback para `SKINS[0]` (o
  // Planeta Padrão) e é sempre truthy, então o filtro não filtraria nada e um id desconhecido viraria um
  // "você ganhou o Planeta Padrão". Isso acontece de verdade no rollout: um pod com catálogo mais novo
  // manda um id que esta build ainda não tem.
  const ganhas = ((rewards && rewards.skinsUnlocked) || []).filter(id => SKIN_BY_ID.has(id));
  if (ganhas.length) { const id = Math.max(...ganhas); return { tipo: "skin", id, skin: skinById(id) }; }
  // 2) a oferta. Determinística (a PRIMEIRA da pool que falta), nunca sorteada: uma oferta que troca entre
  //    a morte e o clique é a forma mais rápida de o jogador achar que foi enganado.
  if (!temAnuncio || !logado) return null;
  const id = AD_GIFT_SKINS.find(x => !tem.has(x));
  return id == null ? null : { tipo: "anuncio", id, skin: skinById(id) };
}

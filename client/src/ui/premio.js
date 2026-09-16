// ── O QUE A TELA DE MORTE OFERECE ─────────────────────────────────────────────
// Função PURA, no molde de `game/quality.js` e `ui/roundClock.js`: a decisão é uma tabela de prioridade e
// merece teste próprio, sem jsdom e sem Pixi.
//
// A PRIORIDADE é "prêmio > progresso > oferta > nada", e ela existe porque as mecânicas pedidas chegam por
// portas diferentes e não podem virar blocos empilhados numa tela que já estava cortada:
//   1. skin DESTRAVADA nesta partida — vem em `rewards.skinsUnlocked`, e é a única que é um FATO
//      consumado. Ela ganha de tudo: anunciar uma oferta por cima de um prêmio que o jogador acabou de
//      conquistar é trocar a comemoração por uma venda.
//   2. PROGRESSO da skin do tutorial — a barra "1/3, 2/3" do Marte Bravo, que ele acabou de experimentar
//      e perder ao entrar na primeira sala.
//   3. oferta de ANÚNCIO — a primeira da pool que ele ainda não tem. Só quando há SDK de anúncio de
//      verdade: um botão que não abre vídeo nenhum é pior que botão nenhum (a lição de Shop.jsx).
//   4. nada.
//
// ⚠️ **O PROGRESSO VEM ANTES DA OFERTA, e não é questão de gosto.** `pedagioLiberado`
// (portal/primeiraVida.js) proíbe anúncio nas duas primeiras vidas, que são EXATAMENTE as duas em que a
// barra precisa aparecer para a promessa do fim do tutorial fazer sentido — com a ordem invertida os dois
// blocos nunca disputariam a mesma tela, mas o jogador veria a barra pela primeira vez já em 2/3, e a
// mecânica chegaria depois de quase cumprida. Além disso a progressão passou a ser a mecânica principal:
// a oferta é o que sobra para quem já tem a skin.
import { AD_GIFT_SKINS, PROGRESSO, SKIN_BY_ID, SKIN_TUTORIAL, skinById } from "@warspace/shared";

/**
 * @param {{skinsUnlocked?:number[]}|null} rewards o `{t:"rewards"}` da partida (pode não ter chegado)
 * @param {number[]} owned as skins que a conta já tem
 * @param {boolean} temAnuncio o portal tem anúncio recompensado? (`portal.temRecompensa`)
 * @param {boolean} logado conta de verdade (convidado local não tem onde guardar)
 * @param {number} games partidas já jogadas pela conta (`session.stats.games`)
 * @returns {{tipo:'skin'|'progresso'|'anuncio',id:number,skin:any,feitas?:number,alvo?:number}|null}
 */
export function escolhePremio(rewards, owned, temAnuncio, logado, games = 0) {
  const tem = new Set(owned || []);
  // 1) o que a partida DESTRAVOU. Mais de uma? A de maior id — as famílias crescem em dificuldade, então
  //    a mais nova é a mais difícil, e é dela que o jogador quer saber.
  // ⚠️ `SKIN_BY_ID.has` e NUNCA `skinById(id)` como predicado: aquele tem fallback para `SKINS[0]` (o
  // Planeta Padrão) e é sempre truthy, então o filtro não filtraria nada e um id desconhecido viraria um
  // "você ganhou o Planeta Padrão". Isso acontece de verdade no rollout: um pod com catálogo mais novo
  // manda um id que esta build ainda não tem.
  const ganhas = ((rewards && rewards.skinsUnlocked) || []).filter(id => SKIN_BY_ID.has(id));
  if (ganhas.length) { const id = Math.max(...ganhas); return { tipo: "skin", id, skin: skinById(id) }; }
  // 2) o progresso da skin do tutorial. Exige `logado` pelo mesmo motivo da oferta — sem conta não há onde
  //    guardar a skin, e prometer o que não se pode entregar é pior que não prometer. Não depende de
  //    `temAnuncio`: esta mecânica não tem nada a ver com vídeo, e é justamente ela que cobre o jogador do
  //    site e o das duas primeiras vidas, onde `pedagioLiberado` cala a oferta.
  // ⚠️ O teto é `>=` e não `===`: com a skin já concedida o `tem.has` sai na frente, mas uma conta que
  //    passe de PARTIDAS sem ter recebido (banco fora na hora da concessão) não pode ficar com uma barra
  //    em 5/3 para sempre — ela simplesmente some e a oferta assume.
  const feitas = Math.max(0, games | 0);
  if (logado && !tem.has(SKIN_TUTORIAL) && feitas < PROGRESSO.PARTIDAS)
    return { tipo: "progresso", id: SKIN_TUTORIAL, skin: skinById(SKIN_TUTORIAL), feitas, alvo: PROGRESSO.PARTIDAS };
  // 3) a oferta. Determinística (a PRIMEIRA da pool que falta), nunca sorteada: uma oferta que troca entre
  //    a morte e o clique é a forma mais rápida de o jogador achar que foi enganado.
  if (!temAnuncio || !logado) return null;
  const id = AD_GIFT_SKINS.find(x => !tem.has(x));
  return id == null ? null : { tipo: "anuncio", id, skin: skinById(id) };
}

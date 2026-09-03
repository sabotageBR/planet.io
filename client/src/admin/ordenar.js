// ── Comparador das tabelas do /admin que ordenam EM MEMÓRIA ──────────────────
// São só duas — "Partidas recentes" e "Sessões", do detalhe de uma conta —, e elas ordenam no cliente por
// um motivo honesto: o conjunto é FECHADO no servidor (`LIMIT 10` / `LIMIT 20`), não existe página 2, e
// ordenar as linhas que estão na tela ordena o recorte inteiro. As outras quatro tabelas ordenam no
// SERVIDOR, porque lá o que está na tela é um pedaço de uma base maior — e ordenar o pedaço e chamar
// isso de "por moedas" seria mostrar o mais rico entre as 50 contas mais recentes.
// ⚠️ A condição para isto ser verdade é o cabeçalho DIZER o recorte ("Partidas recentes (10 últimas)").
//
// Módulo puro e sem React de propósito: `client/test/` roda `node --test` sem jsdom, então é a única
// forma de haver teste automatizado do painel.

const vazio = v => v == null || v === "";

/**
 * Compara dois valores PRESENTES. Quem cuida de nulo é `ordenar`, e não este — ver o porquê lá embaixo.
 * ⚠️ Texto por `localeCompare`: sem ele "Ávila" cai depois de "Zé", porque a comparação vira código de
 * caractere. Número por subtração — e o valor tem que ser o CRU, nunca o `num()` já formatado
 * ("1.234" < "999" em qualquer comparação de texto).
 */
export function compara(a, b) {
  if (vazio(a) || vazio(b)) return vazio(a) && vazio(b) ? 0 : vazio(a) ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const na = +a, nb = +b;
  if (!Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== "" && String(b).trim() !== "") return na - nb;
  return String(a).localeCompare(String(b), "pt-BR", { numeric: true, sensitivity: "base" });
}

/**
 * Ordena uma cópia de `linhas` por `by`/`dir`, extraindo o valor com `campos[by]`.
 * ⚠️ O VAZIO É RESOLVIDO ANTES DA DIREÇÃO, e é por isso que ele não pode morar dentro de `compara`:
 * multiplicado por `k`, "nulo por último" vira "nulo primeiro" ao inverter a ordem — e aí clicar duas
 * vezes enche a primeira tela de "—" e parece que a ordenação quebrou. É o mesmo motivo do `NULLS LAST`
 * explícito no lado do servidor (`repos/users.js`).
 * `by` fora de `campos` devolve a lista como está — o chamador não desenha seta nesse caso, então a tela
 * nunca anuncia uma ordenação que não aconteceu.
 * O `sort` do JS é estável desde o ES2019, então a ordem original serve de desempate sozinha.
 */
export function ordenar(linhas, campos, by, dir) {
  const f = campos && campos[by];
  if (!f || !Array.isArray(linhas)) return linhas || [];
  const k = dir === "asc" ? 1 : -1;
  return linhas.slice().sort((x, y) => {
    const a = f(x), b = f(y);
    if (vazio(a) || vazio(b)) return vazio(a) && vazio(b) ? 0 : vazio(a) ? 1 : -1;
    return k * compara(a, b);
  });
}

/** O próximo estado ao clicar num cabeçalho: mesma coluna inverte, coluna nova começa no padrão dela. */
export const proxOrdem = (ord, col, padrao = "desc") =>
  ord.by === col ? { by: col, dir: ord.dir === "asc" ? "desc" : "asc" } : { by: col, dir: padrao };

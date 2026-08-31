// ── AS FLAGS DO PACOTE DE PORTAL ──────────────────────────────────────────────
// Ficam num arquivo SÓ delas porque o valor precisa virar CONSTANTE de build: é a poda do Rollup em cima
// destas comparações que faz o chunk do /admin não ser emitido no zip do portal — e é o `portal-pack.mjs`
// que confere isso a cada pacote, em vez de a gente acreditar.
//
// PORTAL      o pacote está hospedado por um portal (qualquer um deles).
// PORTAL_ID   qual — decide o adaptador de anúncio.
// SEM_CONTA   O INTERRUPTOR. A regra 7 da GameDistribution proíbe coleta de dados e login sem acordo à
//             parte. A decisão foi manter conta, Google e foto e assumir o risco; se reprovarem, isto
//             vira 1 e o pacote seguinte já sai sem nada disso — sem retrabalho e sem tocar no site.
// ⚠️ VÊM DE `define` (vite.config.js), e não de `import.meta.env`, por um motivo medido: estes módulos
// também são importados FORA do Vite — `theme/patterns.js` chega aqui pelo `faces.js`, e
// `client/test/textures.test.js` assa o catálogo inteiro num `node --test`. Com `import.meta.env.VITE_X`
// o teste morre ("Cannot read properties of undefined"); com a leitura defensiva o teste passa mas o
// valor deixa de ser LITERAL, o Rollup para de podar e o zip da GameDistribution sai com os adaptadores
// da Poki e da CrazyGames dentro (foi o que a guarda do `portal-pack.mjs` pegou). O `define` resolve os
// dois: no build vira texto literal e dobra; no Node o identificador não existe e o `typeof` devolve o
// padrão sem lançar.
export const PORTAL = typeof __PORTAL__ !== "undefined" && __PORTAL__ === "1";
export const PORTAL_ID = typeof __PORTAL_ID__ !== "undefined" ? __PORTAL_ID__ : "";
export const SEM_CONTA = typeof __PORTAL_STRICT__ !== "undefined" && __PORTAL_STRICT__ === "1";

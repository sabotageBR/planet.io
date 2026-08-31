// ── AS FLAGS DO PACOTE DE PORTAL ──────────────────────────────────────────────
// Ficam num arquivo SÓ delas, com a forma textual exata `import.meta.env.VITE_X`, porque é essa forma
// que o Vite substitui por um literal e o Rollup consegue podar. `api/base.js` lê a env de outro jeito
// (defensivo, para poder ser importado por um teste de node), e ali a poda não importa — aqui importa:
// é ela que faz o chunk do /admin não ser emitido no zip.
//
// PORTAL      o pacote está hospedado por um portal (qualquer um deles).
// PORTAL_ID   qual — decide o adaptador de anúncio.
// SEM_CONTA   O INTERRUPTOR. A regra 7 da GameDistribution proíbe coleta de dados e login sem acordo à
//             parte. A decisão foi manter conta, Google e foto e assumir o risco; se reprovarem, isto
//             vira 1 e o pacote seguinte já sai sem nada disso — sem retrabalho e sem tocar no site.
export const PORTAL = import.meta.env.VITE_PORTAL === "1";
export const PORTAL_ID = import.meta.env.VITE_PORTAL_ID || "";
export const SEM_CONTA = import.meta.env.VITE_PORTAL_STRICT === "1";

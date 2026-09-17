// ── QUAL MODELO DA TELA DO TUTORIAL ──────────────────────────────────────────
// Duas FORMAS da mesma aula (ui/Tutor.jsx). A máquina de etapas (`game/tutor.js`), o mundo
// (`game/net/tutorServer.js`) e as DECISÕES de fala (`ui/tutorFala.js`) são as mesmas nas duas — o que muda
// é como a instrução, o progresso e a comemoração aparecem na tela.
//
//   cena     — o PADRÃO. "Mostre, não diga": uma tirinha de três quadros (gesto ▸ ação ▸ resultado) que
//              ensina sem depender de ler, com a palavra gigante (MOVA · ATIRE · DIVIDA) ao lado
//   classico — a tela anterior: faixa no topo com título + instrução e o prompt de botão no rodapé
//
// ⚠️ **O `cena` FOI ESCOLHIDO PELO DONO DO JOGO, JOGANDO**: houve três candidatos em bancada (`legenda`,
// `sargento` e `cena`), e os dois que perderam SAÍRAM do código. O clássico fica alcançável por
// `?tutor=classico` enquanto o Fit Test não disser que o `cena` não é pior que ele — depois disso ele sai
// também, e este arquivo com ele.
// ⚠️ SEM PREF DE CONTA, sem whitelist no servidor e sem tunable, e não é economia: o tutorial é visto UMA
// vez, antes de o jogador saber que existe uma tela de Opções — uma pref aqui seria um interruptor que
// ninguém alcança a tempo. A escolha é do DONO, feita em bancada.
// Pura pelo mesmo motivo de `ui/deadEstilo.js`: não há jsdom no projeto, e o que se confere é a ORDEM.
// @ts-check

/** A ORDEM é a numeração do `?tutor=`: 1 é o padrão, 2 é o clássico. */
export const ESTILOS = ["cena", "classico"];
export const PADRAO = "cena";

/** Número 1-based ou nome → nome válido, ou `null`. Lixo não derruba nada: só não vale. */
const nomeDe = v => {
  if (v == null || v === "") return null;
  const s = String(v);
  return ESTILOS[+s - 1] || (ESTILOS.includes(s) ? s : null);
};

/**
 * ⚠️ A ORDEM É O CONTRÁRIO DA DE `?dead=`, e de propósito: aqui o que vem da BANCADA (`d.estilo`, gravado
 * por `tutorDemo` no objeto `tutor` do hudStore) ganha da query string. A matriz de responsividade troca de
 * modelo por `window.__tela("tutor:<estilo>:<cara>")` SEM recarregar a página, e não tem como ver qual
 * modelo mediu — então o mais explícito tem de vencer, senão um `?tutor=2` esquecido na URL faria a sonda
 * medir o mesmo modelo quatro vezes, calada. No jogo de verdade `d.estilo` não existe e vale o `?tutor=`.
 *
 * @param {{demo?:string|number|null,q?:string|null}} [ctx]
 * @returns {string}
 */
export function estiloDe({ demo = null, q = null } = {}) {
  return nomeDe(demo) || nomeDe(q) || PADRAO;
}

/**
 * O sufixo do `?screen=tutor:…` em duas partes: `"classico:2@1"` → `{estilo:"classico", cara:"2@1"}`.
 * Estilo PRIMEIRO, no molde de `dead:<estilo>:livre`. Sem estilo (`"2@1"`, `"fim"`, `""`) ele sai `null` e
 * a cara é a string inteira — é o que mantém as sete entradas antigas da matriz valendo sem mudança.
 * ⚠️ Só NOME vale como estilo aqui, nunca número: `"2"` é a ETAPA 2, e aceitar `tutor:2:1` tornaria
 * ambíguo justamente o sufixo mais usado.
 * @param {string} suf
 * @returns {{estilo:string|null,cara:string}}
 */
export function partesDoDemo(suf) {
  const s = String(suf || ""), i = s.indexOf(":"), cab = i < 0 ? s : s.slice(0, i);
  if (ESTILOS.includes(cab)) return { estilo: cab, cara: i < 0 ? "" : s.slice(i + 1) };
  return { estilo: null, cara: s };
}

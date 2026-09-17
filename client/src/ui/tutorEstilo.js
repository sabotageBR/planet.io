// ── QUAL MODELO DA TELA DO TUTORIAL ──────────────────────────────────────────
// Quatro FORMAS da mesma aula (ui/Tutor.jsx). A máquina de etapas (`game/tutor.js`), o mundo
// (`game/net/tutorServer.js`) e as DECISÕES de fala (`ui/tutorFala.js`) são as mesmas nos quatro — o que
// muda é como a instrução, o progresso e a comemoração aparecem na tela.
//
//   legenda  — "o jogo nunca é coberto": três segmentos e uma pílula no topo; a etapa completa é um selo,
//              sem cartão e sem véu, e o jogador continua dirigindo
//   sargento — "alguém está te ensinando": a Lua Soldado com balão de quadrinho e medalhas
//   cena     — "mostre, não diga": uma tirinha de três quadros (gesto ▸ ação ▸ resultado) que ensina
//              sem depender de ler
//   classico — a tela que está em produção
//
// ⚠️ **OS TRÊS PRIMEIROS SÃO PROVISÓRIOS.** Eles existem para o dono do jogo COMPARAR, jogando, e escolher
// um. Depois da escolha `PADRAO` muda e os perdedores saem do código (arquivo, bloco de CSS, chaves de
// i18n pelo prefixo, entradas da matriz). Nenhum zip de portal deve sair com os quatro dentro.
// ⚠️ SEM PREF DE CONTA, sem whitelist no servidor e sem tunable, e não é economia: o tutorial é visto UMA
// vez, antes de o jogador saber que existe uma tela de Opções — uma pref aqui seria um interruptor que
// ninguém alcança a tempo. A escolha é do DONO, feita em bancada.
// Pura pelo mesmo motivo de `ui/deadEstilo.js`: não há jsdom no projeto, e o que se confere é a ORDEM.
// @ts-check

/** A ORDEM é a numeração do `?tutor=`: 1, 2 e 3 são os candidatos; 4 é o que está em produção. */
export const ESTILOS = ["legenda", "sargento", "cena", "classico"];
export const PADRAO = "classico";

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
 * O sufixo do `?screen=tutor:…` em duas partes: `"sargento:2@1"` → `{estilo:"sargento", cara:"2@1"}`.
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

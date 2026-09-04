// ── A LÓGICA DA TELA "AO VIVO", SEM REACT E SEM DOM ──────────────────────────
// Módulo puro pelo mesmo motivo declarado em `ordenar.js`: `client/test/` roda `node --test` sem jsdom,
// então isto é a única forma de haver teste automatizado do painel. Tudo o que decide alguma coisa mora
// aqui — o parser do SSE, o anel, a coalescência, o filtro, a sparkline e a política de reconexão —, e o
// `AoVivo.jsx` fica só com JSX e efeitos.
import { ADMIN_BUS } from "@warspace/shared/constants.js";

// ── 1. O PARSER DO SSE ───────────────────────────────────────────────────────
/**
 * Corta o acumulado em frames completos e devolve o RESTO (o pedaço que ainda não fechou).
 * ⚠️ É a peça de maior risco do arquivo: um chunk de rede pode cortar um frame ao meio, e um parser que
 * assume "um chunk = um frame" funciona no localhost e falha em produção sob carga — que é quando ninguém
 * está disponível para depurar.
 * ⚠️ `\r\n\r\n` também separa: a spec permite CRLF e um proxy pode reescrever.
 * ⚠️ Vários `data:` no mesmo frame se juntam com `\n` (é o que a spec manda). O caso real é uma linha de
 * chat com quebra de linha dentro.
 * ⚠️ Linha começando com `:` é COMENTÁRIO (o heartbeat): não vira evento, mas os bytes dela contam para o
 * cão de guarda — quem trata disso é o chamador, aqui ela só não produz frame.
 */
export function fatiaFrames(acc) {
  const frames = [];
  let resto = String(acc || "");
  for (;;) {
    const m = /\r?\n\r?\n/.exec(resto);
    if (!m) break;
    const bruto = resto.slice(0, m.index);
    resto = resto.slice(m.index + m[0].length);
    const f = leFrame(bruto);
    if (f) frames.push(f);
  }
  // ⚠️ TETO NO ACUMULADOR. Um frame sem terminador (bug do servidor, proxy que trunca) faria esta string
  // crescer até a aba morrer — e o sintoma seria "o navegador ficou lento", nunca "o SSE está quebrado".
  if (resto.length > 256 * 1024) resto = "";
  return { frames, resto };
}

/** Um frame cru → `{evento,dados,id}`, ou null quando não há `data:` nenhum (comentário, só `id:`…). */
function leFrame(bruto) {
  let evento = "message", id = null;
  const dados = [];
  for (const linha of bruto.split(/\r?\n/)) {
    if (!linha || linha[0] === ":") continue;              // comentário: o heartbeat cai aqui
    const i = linha.indexOf(":");
    const campo = i < 0 ? linha : linha.slice(0, i);
    const valor = i < 0 ? "" : linha.slice(i + 1).replace(/^ /, "");
    if (campo === "event") evento = valor;
    else if (campo === "data") dados.push(valor);
    else if (campo === "id") id = valor;
  }
  if (!dados.length) return null;
  let json = null;
  try { json = JSON.parse(dados.join("\n")); } catch { return null; }
  return { evento, dados: json, id };
}

// ── 2. O ANEL DA TELA ────────────────────────────────────────────────────────
/**
 * ⚠️ Anel, e não `arr.slice(-N)`: o `slice` aloca um array novo A CADA evento, e a 60 eventos/s isso é uma
 * pausa de coletor de lixo por segundo numa tela que fica aberta a noite inteira. `empurra` escreve num
 * índice e não aloca nada; quem materializa um array é `lista()`, chamado UMA vez por publicação (4 Hz).
 */
export const criaAnel = (n = ADMIN_BUS.CLIENTE_RING) => ({ buf: new Array(n), i: 0, n: 0, cap: n });

export function empurra(anel, ev) {
  anel.buf[anel.i] = ev;
  anel.i = (anel.i + 1) % anel.cap;
  if (anel.n < anel.cap) anel.n++;
  return anel;
}

/** Do mais NOVO para o mais velho, que é a ordem em que a coluna desenha. */
export function lista(anel) {
  const out = [];
  for (let k = 1; k <= anel.n; k++) {
    const it = anel.buf[(anel.i - k + anel.cap * 2) % anel.cap];
    if (it) out.push(it);
  }
  return out;
}

/**
 * Chave estável para o React.
 * ⚠️ NUNCA usar o índice da lista: ela é *prepend* do mais novo, então todo evento desloca todas as
 * chaves e o React remonta a lista inteira — o oposto exato do que o `memo` existe para fazer.
 * ⚠️ E nunca `Date.now()`: a 60 eventos/s ele colide garantidamente dentro do mesmo milissegundo.
 */
export const chaveDe = ev => `${ev.shard}:${ev.seq != null ? ev.seq : ev.at}:${ev.kind}`;

// ── 3. GRUPOS E TEXTO ────────────────────────────────────────────────────────
/**
 * ⚠️ O grupo é derivado do `kind` AQUI e não no servidor porque a lista de kinds é fechada e mora nos dois
 * lados — mas o `default` é `sis` e não "some": um kind novo do servidor tem que aparecer em ALGUM filtro,
 * senão ele cai fora de todos e desaparece da tela em silêncio.
 */
export function grupoDe(kind) {
  switch (kind) {
    case "entrou": case "saiu": case "caiu": return "entra";
    case "kill": case "hazard": case "morte": return "abate";
    case "chat": case "report": return "chat";
    default: return "sis";
  }
}

export const GRUPOS = [
  ["entra", "entra/sai"],
  ["abate", "abates"],
  ["chat", "chat/denúncia"],
  ["sis", "sistema"],
];

/**
 * ⚠️ SÓ GLIFOS DE TEXTO, NENHUM EMOJI. Medido no navegador: `⚔`, `☠`, `💬`, `⚠` e `🏆` têm apresentação
 * EMOJI por padrão, e a fonte de emoji desenha em cores PRÓPRIAS — ou seja, ela ignora o `color` do CSS e
 * a codificação de grupo (verde entra · vermelho abate · azul chat) simplesmente deixa de existir, sem
 * nada acusar. Além disso, a 13 px o `⚔` vira um "x" borrado e o `☠` vira uma caixa.
 * Estes aqui são todos apresentação de TEXTO, então herdam a cor e desenham nítido no tamanho da linha.
 */
const ICONE = {
  entrou: "→", saiu: "←", caiu: "↯", kill: "✕", hazard: "†", morte: "▪",
  chat: "✎", report: "⚑", marco: "◆", fim: "★", "sala+": "+", "sala-": "−",
  lacuna: "⋯", corte: "⋯",
};
export const iconeDe = ev => ICONE[ev.kind] || "·";

/** Como o gás, a estrela e o asteroide se chamam no feed — o `how` vem cru de `Sim._feedMorte`. */
const COMO = { zone: "no gás", hole: "no buraco negro", eat: "devorado", star: "na estrela",
  missile: "de míssil", asteroid: "no asteroide", nova: "na supernova" };
const MARCO = { start: "a partida começou", few: "poucos vivos", zone: "a zona fechou",
  lead: "assumiu a liderança", crunch: "BIG CRUNCH se aproximando", streak: "sequência de abates",
  joined: "entrou", left: "saiu" };

/**
 * A frase de uma linha. Fica aqui, e não no JSX, porque é o único jeito de testá-la — e porque uma linha
 * de log que se lê errado é pior que uma linha a menos.
 */
export function textoDe(ev) {
  switch (ev.kind) {
    case "entrou": return `${ev.quem} entrou${ev.conta ? "" : " (convidado)"}${ev.voltou ? " · voltou" : ""}`;
    case "saiu": return `${ev.quem} saiu${ev.por && ev.por !== "left" ? ` (${ev.por})` : ""}` +
      `${ev.durouS ? ` · ${dur(ev.durouS)}` : ""}`;
    case "caiu": return `${ev.quem} perdeu a conexão`;
    case "kill": return `${ev.a || "?"} matou ${ev.b || "?"}${ev.how && COMO[ev.how] && ev.how !== "eat" ? ` (${COMO[ev.how]})` : ""}`;
    case "hazard": return `${ev.b || "?"} morreu ${COMO[ev.how] || ev.how || ""}`.trim();
    case "morte": return `${ev.quem} · ${ev.abates || 0} abates · ${dur(ev.durouS)} · ${ev.score || 0} pts`;
    case "chat": return `${ev.quem}: ${ev.txt}`;
    case "report": return `${ev.de} DENUNCIOU ${ev.alvo}${ev.bot ? " (preenchimento)" : ""}`;
    case "marco": return `${ev.a ? `${ev.a} — ` : ""}${MARCO[ev.how] || ev.how || "marco"}${ev.n ? ` (${ev.n})` : ""}`;
    case "fim": return `fim de rodada — campeão ${ev.campeao || "ninguém"} · ${ev.total || 0} participantes`;
    case "sala+": return `sala aberta${ev.dono ? ` por ${ev.dono}` : ""}${ev.privada ? " (privada)" : ""}`;
    case "sala-": return `sala encerrada (${ev.por})`;
    case "lacuna": return ev.n < 0 ? "este shard reiniciou — a contagem recomeçou"
      : `${ev.n} evento(s) perdido(s): o painel não acompanhou`;
    case "corte": return "reconectado — pode faltar evento aqui";
    default: return ev.kind;
  }
}

const dur = s => { s = Math.max(0, Math.round(+s || 0)); const m = Math.floor(s / 60);
  return m ? `${m}m${String(s % 60).padStart(2, "0")}` : `${s}s`; };

/** `1699…` → `19:42:07`. O relógio de cada linha, no fuso de quem está olhando. */
export const fmtHora = at => new Date(at || 0).toLocaleTimeString("pt-BR", { hour12: false });

// ── 4. COALESCÊNCIA ──────────────────────────────────────────────────────────
/**
 * Junta repetições ADJACENTES do mesmo (kind, sala, autor) dentro de uma janela, num `×N`.
 * ⚠️ SÓ ADJACENTE. Coalescer não-adjacente reordenaria a linha do tempo — uma linha antiga saltaria para
 * cima ao repetir — e custaria uma varredura; adjacente é uma comparação com a cabeça.
 * ⚠️ A linha mostra o timestamp do ÚLTIMO e mantém a CHAVE do primeiro: trocando a chave, o React remonta
 * a linha a cada incremento e o `memo` deixa de valer exatamente onde ele mais serve.
 * ⚠️ Roda ANTES do filtro. Filtrar primeiro separaria um `×3` que deveria ser uma linha só, e a contagem
 * mudaria conforme o filtro — uma tela que mente.
 */
export function coalesce(linhas, janelaMs = ADMIN_BUS.COALESCE_MS) {
  const out = [];
  for (const ev of linhas) {
    const topo = out[out.length - 1];
    if (topo && topo.kind === ev.kind && topo.sala === ev.sala && autor(topo) === autor(ev) &&
        Math.abs((topo.at || 0) - (ev.at || 0)) <= janelaMs && ev.kind !== "chat" && ev.kind !== "report") {
      topo.n_ = (topo.n_ || 1) + 1;
      continue;
    }
    out.push(topo === ev ? ev : { ...ev });
  }
  return out;
}
const autor = ev => ev.quem || ev.a || ev.de || "";

/**
 * Teto por segundo e por grupo: passando de `TETO_S` num mesmo segundo, o excesso vira UMA linha de
 * resumo. ⚠️ E ela APARECE na tela — log truncado em silêncio é log mentiroso.
 */
export function limita(linhas, teto = ADMIN_BUS.TETO_S) {
  /** @type {Map<string,number>} */const conta = new Map();
  const out = [];
  for (const ev of linhas) {
    const k = `${grupoDe(ev.kind)}:${Math.floor((ev.at || 0) / 1000)}`;
    const n = (conta.get(k) || 0) + 1;
    conta.set(k, n);
    if (n <= teto) out.push(ev);
    else if (n === teto + 1) out.push({ ...ev, kind: "resumo", grupo: grupoDe(ev.kind), at: ev.at, n_: 0 });
    else { const r = out[out.length - 1]; if (r && r.kind === "resumo") r.n_++; }
  }
  return out;
}

// ── 5. FILTRO ────────────────────────────────────────────────────────────────
/**
 * ⚠️ O filtro é uma VISTA, nunca uma peneira de chegada: o anel guarda tudo. Filtrando na entrada, trocar
 * o filtro mostraria um passado vazio — e o que foi jogado fora não volta.
 * ⚠️ O nick compara SEM ACENTO e sem caixa: digitar "kaua" tem que achar "Kauã", que é a busca que o
 * operador realmente faz. É a mesma lição do `localeCompare` de `ordenar.js`.
 */
export function filtra(linhas, { grupos = null, sala = "", nick = "" } = {}) {
  const s = String(sala || "").trim().toUpperCase();
  const n = crua(nick);
  return linhas.filter(ev => {
    if (ev.kind === "lacuna" || ev.kind === "corte") return true;   // aviso nunca é filtrado
    if (grupos && grupos.size && !grupos.has(ev.kind === "resumo" ? ev.grupo : grupoDe(ev.kind))) return false;
    if (s && String(ev.sala || "").toUpperCase().indexOf(s) !== 0) return false;
    if (n && crua(`${ev.quem || ""} ${ev.a || ""} ${ev.b || ""} ${ev.de || ""} ${ev.alvo || ""} ${ev.txt || ""}`).indexOf(n) < 0) return false;
    return true;
  });
}
const crua = s => String(s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

// ── 6. SPARKLINE ─────────────────────────────────────────────────────────────
/**
 * Série de números → o atributo `points` de um `<polyline>`. Sem biblioteca, no mesmo espírito das barras
 * da tela de Retenção ("nada de biblioteca de gráfico para cinco números").
 * ⚠️ O `y` é INVERTIDO: em SVG ele cresce para baixo, e esquecer disso desenha a sparkline de cabeça para
 * baixo — o erro de estreia de todo mundo.
 * ⚠️ SÉRIE CHATA TEM GUARDA. Com `max === min` a divisão vira `NaN`, o `points` sai com "NaN" no meio e o
 * polyline SOME INTEIRO, sem um erro no console. Série chata desenha reta no meio.
 * ⚠️ `null` é LACUNA, não zero: uma reconexão desenhada como zero transforma um blip de rede num apagão
 * visual. Aqui ela vira quebra da linha (um `points` por segmento — o chamador desenha vários polylines).
 */
export function sparkPath(serie, { w = 60, h = 20 } = {}) {
  const v = Array.isArray(serie) ? serie : [];
  const nums = v.filter(x => typeof x === "number" && isFinite(x));
  if (!nums.length) return [];
  const max = Math.max(...nums), min = Math.min(...nums);
  const amp = max - min;
  const passo = v.length > 1 ? w / (v.length - 1) : 0;
  /** @type {string[]} */const segmentos = [];
  /** @type {string[]} */let atual = [];
  for (let i = 0; i < v.length; i++) {
    const x = v.length > 1 ? i * passo : w / 2;
    const val = v[i];
    if (typeof val !== "number" || !isFinite(val)) {
      if (atual.length) segmentos.push(atual.join(" "));
      atual = [];
      continue;
    }
    const y = amp === 0 ? h / 2 : h - ((val - min) / amp) * h;
    atual.push(`${r2(x)},${r2(y)}`);
  }
  if (atual.length) segmentos.push(atual.join(" "));
  return segmentos;
}
const r2 = n => Math.round(n * 100) / 100;

/** Empurra uma amostra na série de um KPI, mantendo a janela. `null` é lacuna e sobrevive como tal. */
export function empurraSerie(serie, valor, n = ADMIN_BUS.SERIE) {
  const out = (serie || []).concat([valor]);
  return out.length > n ? out.slice(out.length - n) : out;
}

// ── 7. RECONEXÃO ─────────────────────────────────────────────────────────────
/**
 * ⚠️ SEM DESISTÊNCIA, ao contrário do `game/net/Connection.js`, que para em 5 tentativas. Lá a desistência
 * vira uma tela que o jogador LÊ; aqui o painel fica aberto a noite inteira e um dashboard que para de
 * tentar depois de 20 s é um dashboard que mente calado — o defeito exato que esta tela existe para não
 * ter. Teto na última espera e segue tentando, com o estado visível na faixa.
 */
export const proxEspera = tentativa =>
  ADMIN_BUS.ESPERA_MS[Math.min(Math.max(0, tentativa | 0), ADMIN_BUS.ESPERA_MS.length - 1)];

/**
 * 401/403 é TERMINAL e nunca reagenda.
 * ⚠️ Reconectar com backoff contra um token revogado é um laço quente contra o balde de login — e o
 * painel já derruba a sessão nesse caso (`api.js` chama `onAuthFail`).
 */
export const terminal = status => status === 401 || status === 403;

/** O cursor `{shard:{seq,epoch}}` → `"0:12:1699,1:5:1700"`, que é como ele viaja na query string. */
export function escreveCursor(mapa) {
  const p = [];
  for (const [shard, c] of mapa) p.push(`${shard}:${c.seq | 0}:${c.epoch | 0}`);
  return p.join(",");
}

/** Atualiza o cursor com o que veio num lote. O maior `seq` por shard é o que vale. */
export function avancaCursor(mapa, ev) {
  for (const e of ev) {
    if (e.shard == null || e.shard < 0 || e.seq == null) continue;
    const c = mapa.get(e.shard);
    if (!c || e.seq > c.seq) mapa.set(e.shard, { seq: e.seq, epoch: (c && c.epoch) || 0 });
  }
  return mapa;
}

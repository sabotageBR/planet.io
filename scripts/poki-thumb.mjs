// ── A THUMBNAIL DA POKI ───────────────────────────────────────────────────────
// Ilustrações VETORIAIS da jogada, com o Marte Bravo (o planeta do jogador — o do tutorial e das três
// primeiras partidas no pacote da Poki) no centro de cada uma. São quatro cenas, uma pergunta cada:
//   A · perseguição — o laço inteiro: ele engole a comida do campo enquanto persegue um planeta MENOR;
//   B · supernova   — a etapa 1 do tutorial: a estrela estoura e ele come os pedaços (a luz vem do estouro);
//   C · o salto     — a etapa 2: ele se DIVIDE e a metade lançada alcança o menor (a de trás tem o sorriso
//                     da skin do jogo);
//   D · close       — o rosto ocupando o tile, a mais legível no tile de 94 px.
//
// ⚠️ É A PARTIDA, NÃO UM CARTAZ: tudo o que aparece existe no jogo do jeito que o jogador vai ver no pacote.
// O elenco é o do tutorial (Marte = você, Terra = o outro — `SKIN_TUTORIAL`/`SKIN_ALVO`); o céu é a rampa do
// céu `dusk`, o tema fixo do pacote (azul-marinho → violeta → magenta → brasa, theme/dusk/index.js); a comida
// tem as cores `WARM` do mesmo tema, com o contorno de tinta, o brilho branco e o halo — e duas delas são o
// grão-estrela; a regra de quem come quem é a de verdade (o maior engole o menor); o rastro é o do planeta
// que corre esticado (o "blob"). Screenshot cru foi descartado de propósito: no tile de 94 px ele vira ruído,
// e a regra deles pede UM objeto claro.
//
// ⚠️ AS REGRAS SÃO DELES (developers.poki.com/guide/game-thumbnail), na letra:
//   · quadrada 1:1, "at least 628x628px", FULL-BLEED — sem borda, sem margem, sem letterbox (os cantos
//     arredondados, 16 px no tile, quem aplica é a Poki);
//   · "Avoid text" — nada de logo nem título: o nome aparece no hover, e texto vira borrão no tile pequeno;
//   · "One clear foreground object, a main character or a key gameplay element, not a collage";
//   · "Include your main character in their default skin" — no pacote, o Marte Bravo é a skin com que o
//     jogador nasce no tutorial e fica nas três primeiras partidas;
//   · "Suggest movement" — ele avança (inclinado, com rastro), o menor foge suando e as partículas voam;
//   · "Keep the background simple" e CONTRASTE com o fundo do site deles, #83FFE7 (menta, com losangos):
//     o céu daqui é escuro e saturado de ponta a ponta, sem um trecho perto da menta.
// ⚠️ E a que NÃO está escrita, mas foi o recado da recusa do Web Fit Test (28/09/2026): a arte antiga
// "parecia feita por IA". Aqui é tudo desenho à mão em SVG — um contorno só (a tinta do jogo), sombra em
// faixas duras, poucos detalhes —, a MESMA personagem do jogo (cor, crateras, sobrancelhas, dentes, cinto
// de metal) redesenhada numa linguagem só.
//
// Os PNG saem do Chrome headless, como os de scripts/brand-assets.mjs (a mesma técnica: bloco de tamanho
// EXATO + folga na janela + recorte no PIL, porque a viewport do headless é mais baixa que o --window-size).
//
// uso:  [POKI_THUMB=<id>] node scripts/poki-thumb.mjs [pasta]   → brand/poki/ por padrão:
//   opcoes/<id>-628.png + <id>.svg   as quatro cenas, para comparar (a-perseguicao · b-supernova · c-salto · d-close)
//   thumb-1256.png  a ESCOLHIDA (POKI_THUMB, padrão a-perseguicao), no tamanho de SUBIR — o dobro do mínimo:
//                   o tile maior tem 314 px, e o celular tem dpr 2–3
//   thumb-1256.jpg  a mesma em JPG, se o formulário recusar o PNG pelo tamanho
//   thumb-628.png   o mínimo exato deles
//   thumb.svg       a fonte vetorial — é dela que o ilustrador parte quando vier refazer
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAI = path.join(RAIZ, "brand", "poki");
const CHROME = process.env.CHROME_BIN || "/opt/google/chrome/chrome";
const FOLGA = 200;

// ── PALETA ──────────────────────────────────────────────────────────────────
const C = {
  tinta: "#241238",                                        // o contorno de TUDO: a INK do tema dusk (o do pacote)
  m0: "#ff7a2e", mLuz: "#ffab62", mBrilho: "#fff3dc",      // Marte
  mSombra: "#7a1408", cr: "#d24a1f", crFundo: "#9c2a13", crBorda: "#ffa060",
  a0: "#9ba4b8", a1: "#d3d9e4", a2: "#646b86", rebite: "#e8ecf3",   // o cinto de metal
  b0: "#420b1e", b1: "#26040f", lingua: "#ff5d80", linguaLuz: "#ff9db1", dente: "#fff6e6", denteSombra: "#e9cfb4",
  olho: "#ffffff", pupila: "#1c0612",
  t0: "#3a8cff", tLuz: "#9fd0ff", tSombra: "#0b2474", verde: "#42d66f", gota: "#b8ecff",   // Terra
  aro: "#ff5fae",                                          // a luz de borda: o brilho do céu batendo neles
};
// a comida do jogo no tema do pacote (dusk: `WARM`), com o mesmo contorno de tinta e o mesmo brilho
const PARTICULAS = ["#ffb547", "#ff5e6c", "#ffd96b", "#ff7ab3", "#ff8a3d", "#ffcf9a", "#e0417f"];

// ── UTILITÁRIOS ─────────────────────────────────────────────────────────────
const n = v => +(+v).toFixed(1);
let seq = 0;
const uid = p => `${p}${++seq}`;
const circ = (cx, cy, r) => `M ${n(cx - r)} ${n(cy)} a ${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0 a ${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0 Z`;
/** gerador determinístico (a mesma semente dá o mesmo céu): mulberry32, o do jogo */
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** arco de circunferência (raio R, de a0 a a1 graus, sentido horário da tela) — o brilho de desenho animado */
const arco = (R, a0, a1) => { const p = a => [n(R * Math.cos(a * Math.PI / 180)), n(R * Math.sin(a * Math.PI / 180))], [x0, y0] = p(a0), [x1, y1] = p(a1); return `M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}`; };
/** amostra uma cúbica de Bézier em k+1 pontos [[x,y],…] */
function cubica(p0, p1, p2, p3, k = 24) {
  const o = [];
  for (let i = 0; i <= k; i++) { const t = i / k, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3; o.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]); }
  return o;
}
/** interpola linearmente y(x) numa lista de amostras [[x,y],…] ordenada por x */
function amostra(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return pts[pts.length - 1][1];
}

/** de onde vem a luz da cena (vetor unitário APONTANDO para a luz); cada cena escreve o seu antes de desenhar */
let LUZ = [-.707, -.707];
const angLuz = () => Math.atan2(LUZ[1], LUZ[0]) * 180 / Math.PI;

/**
 * O VOLUME de um disco em faixas duras, no espaço UNITÁRIO de raio R: a sombra é a parte do disco FORA de
 * um círculo deslocado para a luz, e o brilho é a lua crescente do lado oposto. Tudo `evenodd` dentro do
 * clip do disco — dois círculos, nenhuma conta de interseção.
 */
function volume(R, id, { sombra, luz, aro }) {
  const [lx, ly] = LUZ, o = k => [lx * R * k, ly * R * k];
  const [a1, b1] = o(.3), [a2, b2] = o(.106), [a3, b3] = o(-.134), [a4, b4] = o(.053);
  return `<g clip-path="url(#${id})">
    <path fill-rule="evenodd" fill="${sombra}" opacity=".30" d="${circ(0, 0, R)} ${circ(a1, b1, R * .95)}"/>
    <path fill-rule="evenodd" fill="${sombra}" opacity=".30" d="${circ(0, 0, R)} ${circ(a2, b2, R * .985)}"/>
    <path fill-rule="evenodd" fill="${luz}" opacity=".55" d="${circ(0, 0, R)} ${circ(a3, b3, R * .975)}"/>
    <path fill-rule="evenodd" fill="${aro}" opacity=".6" d="${circ(0, 0, R)} ${circ(a4, b4, R * .99)}"/>
  </g>`;
}

// ── MARTE BRAVO (espaço unitário: raio 300) ───────────────────────────────────
// Cratera no espaço LOCAL do planeta (que gira com o rosto): achatada perto da borda (é uma esfera), com a
// parede de dentro virada para a luz no escuro e a borda de fora pegando luz do lado oposto.
function cratera(x, y, R, giro) {
  const id = uid("cr");
  const d = Math.hypot(x, y), a = Math.atan2(y, x) * 180 / Math.PI;
  const k = Math.max(.38, Math.sqrt(Math.max(0, 1 - (d / 300) ** 2)));
  // a luz do MUNDO, trazida para o referencial da cratera
  const t = -(giro + a) * Math.PI / 180, [lx, ly] = LUZ;
  const ux = lx * Math.cos(t) - ly * Math.sin(t), uy = lx * Math.sin(t) + ly * Math.cos(t);
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(a)}) scale(${n(k)} 1)">
    <clipPath id="${id}"><circle r="${R}"/></clipPath>
    <circle cx="${n(-ux * R * .14)}" cy="${n(-uy * R * .14)}" r="${n(R * 1.06)}" fill="${C.crBorda}"/>
    <circle r="${R}" fill="${C.crFundo}"/>
    <circle cx="${n(-ux * R * .34)}" cy="${n(-uy * R * .34)}" r="${R}" fill="${C.cr}" clip-path="url(#${id})"/>
  </g>`;
}

/** o cinto de metal: uma faixa em volta da esfera, vista um pouco de cima (curva para baixo no meio) */
function cinto(lw) {
  const A = [-330, 118], K = [0, 392], B = [330, 118], h = 25;
  const q = (dy) => `M ${A[0]} ${A[1] + dy} Q ${K[0]} ${K[1] + dy} ${B[0]} ${B[1] + dy}`;
  const faixa = (d0, d1, cor) => `<path fill="${cor}" d="${q(d0)} L ${B[0]} ${B[1] + d1} Q ${K[0]} ${K[1] + d1} ${A[0]} ${A[1] + d1} Z"/>`;
  const P = t => [(1 - t) ** 2 * A[0] + 2 * (1 - t) * t * K[0] + t * t * B[0], (1 - t) ** 2 * A[1] + 2 * (1 - t) * t * K[1] + t * t * B[1]];
  const N = t => { const tx = 2 * (1 - t) * (K[0] - A[0]) + 2 * t * (B[0] - K[0]), ty = 2 * (1 - t) * (K[1] - A[1]) + 2 * t * (B[1] - K[1]), l = Math.hypot(tx, ty); return [-ty / l, tx / l]; };
  let o = faixa(-h, h, C.a0) + faixa(-h, -h * .45, C.a1) + faixa(h * .42, h, C.a2);
  for (const t of [.2, .35, .5, .65, .8]) { const [x, y] = P(t), [nx, ny] = N(t); o += `<path d="M ${n(x - nx * h)} ${n(y - ny * h)} L ${n(x + nx * h)} ${n(y + ny * h)}" stroke="${C.tinta}" stroke-width="${n(lw * .55)}"/>`; }
  for (const t of [.275, .425, .575, .725]) {
    const [x, y] = P(t), [nx, ny] = N(t);
    for (const s of [-1, 1]) o += `<circle cx="${n(x + nx * h * .5 * s)}" cy="${n(y + ny * h * .5 * s)}" r="7" fill="${C.rebite}" stroke="${C.tinta}" stroke-width="${n(lw * .35)}"/>`;
  }
  o += `<path d="${q(-h)}" fill="none" stroke="${C.tinta}" stroke-width="${n(lw * .8)}"/><path d="${q(h)}" fill="none" stroke="${C.tinta}" stroke-width="${n(lw * .8)}"/>`;
  return o;
}

/** o SORRISO da skin do jogo: boca fechada em meia-lua, com os dentes pontudos de cima e de baixo encaixados */
function sorriso(lw) {
  const id = uid("sor");
  const L = [-196, 18], R = [214, 4];
  const cima = cubica(L, [-120, 74], [120, 74], R), baixo = [...cubica(R, [196, 124], [110, 180], [12, 184]), ...cubica([12, 184], [-92, 186], [-178, 126], L)];
  const D = `M ${L[0]} ${L[1]} C -120 74, 120 74, ${R[0]} ${R[1]} C 196 124, 110 180, 12 184 C -92 186, -178 126, ${L[0]} ${L[1]} Z`;
  const topo = [...cima].sort((a, b) => a[0] - b[0]), base = [...baixo].sort((a, b) => a[0] - b[0]);
  let dentes = "";
  for (let i = 0; i < 9; i++) {           // de cima, apontando para baixo
    const x = -166 + i * 44, y0 = amostra(topo, x), y1 = amostra(base, x), len = (y1 - y0) * .64, hw = 21;
    dentes += `<path d="M ${n(x - hw)} ${n(y0 - 30)} L ${n(x + hw)} ${n(y0 - 30)} L ${n(x)} ${n(y0 + len)} Z" fill="${C.dente}" stroke="${C.tinta}" stroke-width="${n(lw * .5)}" stroke-linejoin="round"/>`;
  }
  for (let i = 0; i < 8; i++) {           // de baixo, apontando para cima, nos vãos
    const x = -144 + i * 44, y0 = amostra(topo, x), y1 = amostra(base, x), len = (y1 - y0) * .62, hw = 20;
    dentes += `<path d="M ${n(x - hw)} ${n(y1 + 30)} L ${n(x + hw)} ${n(y1 + 30)} L ${n(x)} ${n(y1 - len)} Z" fill="${C.dente}" stroke="${C.tinta}" stroke-width="${n(lw * .5)}" stroke-linejoin="round"/>`;
  }
  return `<clipPath id="${id}"><path d="${D}"/></clipPath>
    <g clip-path="url(#${id})"><path d="${D}" fill="${C.b1}"/>${dentes}</g>
    <path d="${D}" fill="none" stroke="${C.tinta}" stroke-width="${lw}" stroke-linejoin="round"/>
    <path d="M -228 -8 Q -238 24 -214 50" fill="none" stroke="${C.tinta}" stroke-width="${n(lw * .7)}" stroke-linecap="round"/>
    <path d="M 246 -22 Q 256 10 234 36" fill="none" stroke="${C.tinta}" stroke-width="${n(lw * .7)}" stroke-linecap="round"/>`;
}

/** o rosto: olhos travados na presa, sobrancelhas em V e a boca — escancarada (comendo) ou o sorriso da skin */
function rostoMarte(lw, olhar, boca = "aberta") {
  const id = uid("boca");
  const BOCA = "M -178 48 C -112 78, 118 72, 206 38 C 202 148, 124 238, 22 242 C -86 244, -168 148, -178 48 Z";
  const TOPO = [[-178, 48], [-100, 64], [7, 67], [119, 59], [206, 38]];
  const BASE = [[-178, 48], [-117, 192], [-56, 239], [22, 242], [90, 237], [148, 189], [206, 38]];
  let dentes = "";
  const sup = [[-148, 24, 60], [-94, 28, 76], [-38, 25, 62], [20, 28, 78], [78, 25, 64], [132, 26, 72], [180, 20, 50]];
  for (const [x, hw, len] of sup) { const y = amostra(TOPO, x); dentes += `<path d="M ${x - hw} ${n(y - 34)} L ${x + hw} ${n(y - 34)} L ${n(x + hw * .18)} ${n(y + len)} Z" fill="${C.dente}" stroke="${C.tinta}" stroke-width="${n(lw * .55)}" stroke-linejoin="round"/>`
    + `<path d="M ${n(x + hw * .35)} ${n(y - 30)} L ${x + hw} ${n(y - 30)} L ${n(x + hw * .22)} ${n(y + len * .8)} Z" fill="${C.denteSombra}"/>`; }
  const inf = [[-122, 22, 48], [-62, 25, 58], [0, 24, 52], [62, 25, 58], [120, 21, 46]];
  for (const [x, hw, len] of inf) { const y = amostra(BASE, x); dentes += `<path d="M ${x - hw} ${n(y + 34)} L ${x + hw} ${n(y + 34)} L ${n(x - hw * .1)} ${n(y - len)} Z" fill="${C.dente}" stroke="${C.tinta}" stroke-width="${n(lw * .55)}" stroke-linejoin="round"/>`; }
  const [ox, oy] = olhar;   // para onde as pupilas apontam (a presa)
  const aberta = `
    <clipPath id="${id}"><path d="${BOCA}"/></clipPath>
    <g clip-path="url(#${id})">
      <path d="${BOCA}" fill="${C.b0}"/>
      <ellipse cx="14" cy="62" rx="210" ry="62" fill="${C.b1}"/>
      <ellipse cx="30" cy="226" rx="116" ry="54" fill="${C.lingua}" stroke="${C.tinta}" stroke-width="${n(lw * .5)}"/>
      <ellipse cx="2" cy="205" rx="46" ry="14" fill="${C.linguaLuz}"/>
      <path d="M 34 190 Q 40 218 34 252" fill="none" stroke="#c9365a" stroke-width="${n(lw * .5)}" stroke-linecap="round"/>
      ${dentes}
    </g>
    <path d="${BOCA}" fill="none" stroke="${C.tinta}" stroke-width="${lw}" stroke-linejoin="round"/>
    <path d="M -214 22 Q -224 52 -200 80" fill="none" stroke="${C.tinta}" stroke-width="${n(lw * .7)}" stroke-linecap="round"/>
    <path d="M 240 6 Q 250 36 228 64" fill="none" stroke="${C.tinta}" stroke-width="${n(lw * .7)}" stroke-linecap="round"/>`;
  return `${boca === "sorriso" ? sorriso(lw) : aberta}
    <ellipse cx="-112" cy="-38" rx="74" ry="60" fill="${C.olho}" stroke="${C.tinta}" stroke-width="${lw}"/>
    <ellipse cx="124" cy="-44" rx="70" ry="58" fill="${C.olho}" stroke="${C.tinta}" stroke-width="${lw}"/>
    <circle cx="${-112 + ox}" cy="${-30 + oy}" r="26" fill="${C.pupila}"/><circle cx="${-121 + ox}" cy="${-39 + oy}" r="9" fill="#fff"/>
    <circle cx="${124 + ox}" cy="${-36 + oy}" r="25" fill="${C.pupila}"/><circle cx="${115 + ox}" cy="${-45 + oy}" r="8" fill="#fff"/>
    <path d="M -230 -150 Q -132 -134 -34 -90 Q -16 -66 -38 -30 Q -126 -76 -214 -116 Z" fill="${C.tinta}" stroke="${C.tinta}" stroke-width="${n(lw * .4)}" stroke-linejoin="round"/>
    <path d="M 246 -166 Q 142 -146 38 -96 Q 20 -72 42 -36 Q 134 -84 232 -134 Z" fill="${C.tinta}" stroke="${C.tinta}" stroke-width="${n(lw * .4)}" stroke-linejoin="round"/>`;
}

/**
 * O Marte Bravo inteiro. `giro` inclina o rosto (e com ele as crateras e o cinto) na direção da presa;
 * `rosto` desloca o rosto no disco (ele está virado para a presa, então o rosto sai do centro).
 * O VOLUME é do mundo (a luz não gira com a personagem); o rosto fica POR CIMA da sombra, para a
 * expressão ler inteira mesmo no tile de 94 px.
 */
function marte({ x, y, r, giro = -16, rosto = [40, -20], olhar = [20, 4], lw = 12, boca = "aberta" }) {
  const id = uid("marte"), s = r / 300, u = lw / s;
  const crateras = [[-40, -236, 34], [100, -228, 20], [-240, -46, 27], [-250, 104, 31], [230, -182, 18], [262, 116, 15], [-150, -214, 14], [-176, 196, 16]]
    .map(([cx, cy, R]) => cratera(cx, cy, R, giro)).join("");
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})">
    <clipPath id="${id}"><circle r="300"/></clipPath>
    <circle r="300" fill="${C.m0}"/>
    <g clip-path="url(#${id})"><g transform="rotate(${giro})">${crateras}${cinto(u)}</g></g>
    ${volume(300, id, { sombra: C.mSombra, luz: C.mLuz, aro: C.aro })}
    <path d="${arco(250, angLuz() - 29, angLuz() + 11)}" fill="none" stroke="${C.mBrilho}" stroke-width="30" stroke-linecap="round" opacity=".92"/>
    <circle cx="${n(250 * Math.cos((angLuz() + 22) * Math.PI / 180))}" cy="${n(250 * Math.sin((angLuz() + 22) * Math.PI / 180))}" r="15" fill="${C.mBrilho}" opacity=".92"/>
    <g clip-path="url(#${id})"><g transform="rotate(${giro}) translate(${rosto[0]} ${rosto[1]})">${rostoMarte(u, olhar, boca)}</g></g>
    <circle r="300" fill="none" stroke="${C.tinta}" stroke-width="${n(u)}"/>
  </g>`;
}

// ── A PRESA (Terra, espaço unitário: raio 100) ────────────────────────────────
function terra({ x, y, r, giro = 8, lw = 12 }) {
  const id = uid("terra"), s = r / 100, u = lw / s;
  const cont = [
    "M -112 -34 C -88 -66 -56 -74 -46 -50 C -36 -28 -60 -8 -74 2 C -90 14 -116 4 -112 -34 Z",
    "M 20 -104 C 54 -94 80 -66 64 -44 C 48 -28 22 -42 12 -62 C 4 -78 6 -100 20 -104 Z",
    "M 34 58 C 60 42 96 52 92 78 C 88 100 50 106 34 90 C 22 78 18 64 34 58 Z",
    "M -64 64 C -42 52 -20 72 -30 94 C -40 106 -74 100 -76 84 C -78 74 -72 68 -64 64 Z",
  ].map(d => `<path d="${d}" fill="${C.verde}"/>`).join("");
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})">
    <clipPath id="${id}"><circle r="100"/></clipPath>
    <circle r="100" fill="${C.t0}"/>
    <g clip-path="url(#${id})"><g transform="rotate(${giro})">${cont}</g></g>
    ${volume(100, id, { sombra: C.tSombra, luz: C.tLuz, aro: C.aro })}
    <ellipse cx="${n(LUZ[0] * 78)}" cy="${n(LUZ[1] * 78)}" rx="18" ry="9" transform="rotate(${n(angLuz() + 90)} ${n(LUZ[0] * 78)} ${n(LUZ[1] * 78)})" fill="#fff" opacity=".9"/>
    <g transform="rotate(${giro})">
      <ellipse cx="-34" cy="-8" rx="25" ry="31" fill="${C.olho}" stroke="${C.tinta}" stroke-width="${n(u * .8)}"/>
      <ellipse cx="30" cy="-12" rx="24" ry="30" fill="${C.olho}" stroke="${C.tinta}" stroke-width="${n(u * .8)}"/>
      <circle cx="-43" cy="3" r="10" fill="${C.pupila}"/><circle cx="-46" cy="0" r="3.5" fill="#fff"/>
      <circle cx="21" cy="-1" r="10" fill="${C.pupila}"/><circle cx="18" cy="-4" r="3.5" fill="#fff"/>
      <path d="M -62 -46 Q -42 -64 -18 -62" fill="none" stroke="${C.tinta}" stroke-width="${n(u * .7)}" stroke-linecap="round"/>
      <path d="M 14 -66 Q 38 -68 58 -50" fill="none" stroke="${C.tinta}" stroke-width="${n(u * .7)}" stroke-linecap="round"/>
      <ellipse cx="-4" cy="44" rx="17" ry="21" fill="${C.b0}" stroke="${C.tinta}" stroke-width="${n(u * .7)}"/>
      <ellipse cx="-4" cy="57" rx="10" ry="6" fill="${C.lingua}"/>
    </g>
    <circle r="100" fill="none" stroke="${C.tinta}" stroke-width="${n(u)}"/>
    <g stroke="${C.tinta}" stroke-width="${n(u * .6)}" stroke-linejoin="round">
      <path transform="translate(118 -72) rotate(28) scale(1.15)" d="M 0 -18 C 10 -4 12 6 0 12 C -12 6 -10 -4 0 -18 Z" fill="${C.gota}"/>
      <path transform="translate(96 -116) rotate(18) scale(.75)" d="M 0 -18 C 10 -4 12 6 0 12 C -12 6 -10 -4 0 -18 Z" fill="${C.gota}"/>
    </g>
  </g>`;
}

// ── PARTÍCULAS (a comida do jogo: bolinhas coloridas com halo aditivo) ────────
function particula(x, y, r, cor, rastro, estrela = false) {
  let o = "";
  if (rastro) { const [dx, dy, L] = rastro; o += cauda(x, y, dx, dy, L, r * 1.7, cor, .42); }
  o += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 2.6)}" fill="url(#h${cor.slice(1)})"/>`;
  const lw = n(Math.max(2.6, r * .26));
  if (estrela) {   // o grão-estrela do jogo (foodType "star"): 5 pontas
    let d = ""; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, R = i % 2 ? r * .8 : r * 1.6; d += `${i ? "L" : "M"} ${n(x + R * Math.cos(a))} ${n(y + R * Math.sin(a))} `; }
    o += `<path d="${d}Z" fill="${cor}" stroke="${C.tinta}" stroke-width="${lw}" stroke-linejoin="round"/>`;
  } else o += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${cor}" stroke="${C.tinta}" stroke-width="${lw}"/>`;
  return o + `<circle cx="${n(x - r * .3)}" cy="${n(y - r * .32)}" r="${n(r * .27)}" fill="#fff" opacity=".7"/>`;
}
/** um traço AFILADO: largo em (x,y) e em ponta a L px na direção (dx,dy) — rastro de movimento, não feixe */
function cauda(x, y, dx, dy, L, w, cor, op) {
  const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, px = -uy * w / 2, py = ux * w / 2;
  return `<path d="M ${n(x + px)} ${n(y + py)} Q ${n(x + ux * w * .7)} ${n(y + uy * w * .7)} ${n(x - px)} ${n(y - py)} L ${n(x - ux * L)} ${n(y - uy * L)} Z" fill="${cor}" opacity="${op}"/>`;
}
const faisca = (x, y, s, op = 1) => `<path transform="translate(${x} ${y}) scale(${s / 10})" opacity="${op}" fill="#fff" d="M 0 -10 Q 1.4 -1.4 10 0 Q 1.4 1.4 0 10 Q -1.4 1.4 -10 0 Q -1.4 -1.4 0 -10 Z"/>`;

/** leva um ponto do espaço do ROSTO do Marte (o de `rostoMarte`) ao mundo, para mirar coisas na boca */
function doRosto(M, giro, rosto, [fx, fy]) {
  const a = giro * Math.PI / 180, x = fx + rosto[0], y = fy + rosto[1], s = M.r / 300;
  return [M.x + s * (x * Math.cos(a) - y * Math.sin(a)), M.y + s * (x * Math.sin(a) + y * Math.cos(a))];
}

// ── O CÉU E O QUE AS QUATRO CENAS DIVIDEM ────────────────────────────────────
// A rampa do céu `dusk` do jogo (theme/dusk/index.js: NAVY → VIO → … → EMB2), avivada no meio para o tile
// não afundar ao lado dos vizinhos, e as luzes de cada cena por cima dela.
const CORES_HALO = [...new Set([...PARTICULAS, "#fff1d6", "#ff9e57"])];
function defs() {
  return `<defs>
    <linearGradient id="ceu" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#141a4a"/><stop offset=".46" stop-color="#3f2a86"/><stop offset=".72" stop-color="#57287c"/><stop offset=".88" stop-color="#8a2f6a"/><stop offset="1" stop-color="#c8542f"/>
    </linearGradient>
    <radialGradient id="luz"><stop offset="0" stop-color="#8b46ff" stop-opacity=".75"/><stop offset=".6" stop-color="#6a33e0" stop-opacity=".3"/><stop offset="1" stop-color="#6a33e0" stop-opacity="0"/></radialGradient>
    <radialGradient id="neb"><stop offset="0" stop-color="#ff4fb6" stop-opacity=".55"/><stop offset="1" stop-color="#ff4fb6" stop-opacity="0"/></radialGradient>
    <radialGradient id="aura"><stop offset=".55" stop-color="#ff7a3a" stop-opacity=".42"/><stop offset="1" stop-color="#ff7a3a" stop-opacity="0"/></radialGradient>
    <radialGradient id="clarao"><stop offset="0" stop-color="#fffbea"/><stop offset=".16" stop-color="#ffeaa6" stop-opacity=".95"/><stop offset=".42" stop-color="#ffb547" stop-opacity=".5"/><stop offset="1" stop-color="#ff7a3a" stop-opacity="0"/></radialGradient>
    ${CORES_HALO.map(c => `<radialGradient id="h${c.slice(1)}"><stop offset="0" stop-color="${c}" stop-opacity=".8"/><stop offset=".45" stop-color="${c}" stop-opacity=".32"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`).join("")}
  </defs>`;
}
function estrelas(seed, qtd = 46) {
  const rnd = rng(seed); let o = "";
  for (let i = 0; i < qtd; i++) { const x = rnd() * 1000, y = rnd() * 1000, r = .9 + rnd() * 2.1; o += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#fff1d6" opacity="${n(.25 + rnd() * .6)}"/>`; }
  return o;
}
const svgDe = corpo => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%">
  ${defs()}
  <rect width="1000" height="1000" fill="url(#ceu)"/>
  ${corpo}
</svg>`;
/** o rastro de quem corre: traços AFILADOS paralelos ao movimento (ux,uy), saindo das costas do corpo B */
function rastroDe(B, ux, uy, specs, cor = "#e6d9ff", op = .5) {
  const costas = Math.atan2(-uy, -ux);
  return specs.map(([da, L, w]) => {
    const a = costas + da, px = B.x + Math.cos(a) * (B.r + 24), py = B.y + Math.sin(a) * (B.r + 24);
    return cauda(px, py, ux, uy, L, w, cor, op);
  }).join("");
}
/** esticado na direção do movimento — o mesmo "blob" que o planeta faz no jogo quando corre */
const estica = (B, ux, uy, k = 1.05) => { const a = n(Math.atan2(uy, ux) * 180 / Math.PI); return `translate(${B.x} ${B.y}) rotate(${a}) scale(${k} ${n(1 / k ** .95)}) rotate(${-a}) translate(${-B.x} ${-B.y})`; };
/** o campo em volta: o mapa é cheio de comida, e é isso que se come o jogo inteiro */
const campo = lista => lista.map(([x, y, r, c, est]) => particula(x, y, r, PARTICULAS[c % PARTICULAS.length], null, !!est)).join("");
/** uma corrente de grãos numa curva S→K→E, encolhendo, com a cauda apontando de onde vieram */
function corrente(S, K, E, passos, cores = PARTICULAS) {
  const Bz = t => [(1 - t) ** 2 * S[0] + 2 * (1 - t) * t * K[0] + t * t * E[0], (1 - t) ** 2 * S[1] + 2 * (1 - t) * t * K[1] + t * t * E[1]];
  const dBz = t => [2 * (1 - t) * (K[0] - S[0]) + 2 * t * (E[0] - K[0]), 2 * (1 - t) * (K[1] - S[1]) + 2 * t * (E[1] - K[1])];
  return passos.map(([t, r], i) => { const [x, y] = Bz(t), [vx, vy] = dBz(t); return particula(x, y, r, cores[i % cores.length], i > 0 ? [vx, vy, r * 4.4] : null); }).join("");
}

// ── A · A PERSEGUIÇÃO ─────────────────────────────────────────────────────────
// O laço inteiro numa imagem: ele engole a comida do campo enquanto persegue um planeta menor.
function cenaPerseguicao() {
  seq = 0; LUZ = [-.707, -.707];
  const M = { x: 384, y: 616, r: 318 }, T = { x: 800, y: 248, r: 116 };
  const GIRO = -18, ROSTO = [36, -46];
  const dx = T.x - M.x, dy = T.y - M.y, dl = Math.hypot(dx, dy), ux = dx / dl, uy = dy / dl;   // para onde ele avança
  const [bx, by] = doRosto(M, GIRO, ROSTO, [150, 118]);                      // dentro da boca, junto ao canto
  return svgDe(`
  <circle cx="${M.x + 40}" cy="${M.y - 60}" r="620" fill="url(#luz)"/>
  ${estrelas(7)}
  <circle cx="${T.x}" cy="${T.y}" r="300" fill="url(#neb)"/>
  <circle cx="${M.x}" cy="${M.y}" r="${M.r * 1.45}" fill="url(#aura)"/>
  ${faisca(168, 120, 20, .95)}${faisca(676, 104, 12, .8)}${faisca(640, 930, 14, .7)}${faisca(60, 640, 10, .6)}
  ${campo([[140, 176, 14, 3], [312, 112, 10, 0, 1], [566, 88, 12, 2], [84, 420, 10, 1], [886, 790, 16, 4], [740, 912, 12, 1], [956, 330, 10, 5, 1], [606, 866, 9, 0], [960, 680, 11, 2], [472, 232, 9, 1]])}
  ${rastroDe(M, ux, uy, [[-.66, 170, 22], [-.36, 250, 30], [-.06, 205, 24], [.24, 260, 20], [.52, 150, 14]])}
  ${rastroDe(T, ux, uy, [[-.42, 64, 12], [.34, 50, 10]], "#ffffff", .5)}
  ${terra({ ...T, giro: 10, lw: 12 })}
  <g transform="${estica(M, ux, uy)}">${marte({ ...M, giro: GIRO, rosto: ROSTO, olhar: [22, 2], lw: 13 })}</g>
  ${corrente([958, 468], [812, 612], [bx, by], [[0, 30], [.16, 26], [.31, 31], [.45, 23], [.58, 20], [.7, 17], [.81, 13], [.91, 10]])}`);
}

// ── B · A SUPERNOVA ───────────────────────────────────────────────────────────
// A etapa 1 do tutorial: a estrela estoura e ele avança de boca aberta sobre os pedaços brilhantes. Um
// personagem só e o elemento de jogo mais vistoso do mapa; quem ilumina a cena é a explosão.
function cenaSupernova() {
  seq = 0;
  const N = { x: 738, y: 280 };                                  // o centro do estouro
  const M = { x: 352, y: 652, r: 306 };
  const dx = N.x - M.x, dy = N.y - M.y, dl = Math.hypot(dx, dy), ux = dx / dl, uy = dy / dl;
  LUZ = [ux, uy];
  const GIRO = -20, ROSTO = [44, -50];
  const rnd = rng(23);
  let raios = "";
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * 2 * Math.PI + (rnd() - .5) * .16, longo = i % 2 === 0;
    raios += cauda(N.x, N.y, -Math.cos(a), -Math.sin(a), longo ? 340 + rnd() * 120 : 190 + rnd() * 80, longo ? 46 : 30, longo ? "#fff1d6" : "#ffd96b", longo ? .5 : .45);
  }
  // os pedaços voando para FORA (a cauda aponta de volta para o centro)…
  const cores = ["#ffd96b", "#fff1d6", "#ffb547", "#ff9e57", "#ff7ab3", "#ffcf9a"];
  const paraEle = Math.atan2(M.y - N.y, M.x - N.x);
  let pedacos = "";
  for (let i = 0; i < 26; i++) {
    const a = rnd() * 2 * Math.PI, d = 150 + rnd() * 320, r = 9 + rnd() * 14;
    const x = N.x + Math.cos(a) * d, y = N.y + Math.sin(a) * d;
    if (Math.abs(Math.atan2(Math.sin(a - paraEle), Math.cos(a - paraEle))) < .5 || x < 40 || x > 960 || y < 40 || y > 960) continue;
    if (Math.hypot(x - M.x, y - M.y) < M.r + 30) continue;
    pedacos += particula(x, y, r, cores[i % cores.length], [Math.cos(a), Math.sin(a), r * 3.6]);
  }
  // …e os que ele suga: saem do estouro, contornam o rosto pela direita e entram pelo canto da boca
  const [bx, by] = doRosto(M, GIRO, ROSTO, [150, 118]);
  const S0 = [N.x - ux * 120, N.y - uy * 120];
  const naBoca = corrente(S0, [S0[0] + 120, S0[1] + 230], [bx, by], [[0, 28], [.17, 25], [.33, 29], [.48, 22], [.62, 19], [.74, 16], [.85, 12], [.93, 9.5]], cores);
  return svgDe(`
  ${estrelas(11)}
  <circle cx="${N.x}" cy="${N.y}" r="560" fill="url(#clarao)" opacity=".55"/>
  <circle cx="${M.x}" cy="${M.y}" r="${M.r * 1.4}" fill="url(#aura)"/>
  ${faisca(120, 150, 16, .8)}${faisca(90, 560, 10, .6)}${faisca(560, 940, 12, .6)}
  ${raios}
  <circle cx="${N.x}" cy="${N.y}" r="210" fill="url(#clarao)"/>
  <circle cx="${N.x}" cy="${N.y}" r="62" fill="#fffbea"/>
  ${faisca(N.x, N.y, 118, 1)}
  ${pedacos}
  ${rastroDe(M, ux, uy, [[-.6, 170, 22], [-.28, 240, 28], [.04, 200, 22], [.36, 150, 16]])}
  <g transform="${estica(M, ux, uy)}">${marte({ ...M, giro: GIRO, rosto: ROSTO, olhar: [24, -6], lw: 13 })}</g>
  ${naBoca}`);
}

// ── C · O SALTO ───────────────────────────────────────────────────────────────
// A etapa 2 do tutorial: ele se DIVIDE e a metade lançada alcança o menor, que era mais rápido que ele
// inteiro. A metade que fica tem o sorriso da skin; a que voa já abriu a boca.
function cenaSalto() {
  seq = 0; LUZ = [-.707, -.707];
  const A = { x: 196, y: 826, r: 148 }, B = { x: 556, y: 486, r: 232 };
  const dx = B.x - A.x, dy = B.y - A.y, dl = Math.hypot(dx, dy), ux = dx / dl, uy = dy / dl;
  const T = { x: n(B.x + ux * (B.r + 86 + 54)), y: n(B.y + uy * (B.r + 86 + 54)), r: 86 };
  return svgDe(`
  <circle cx="${B.x}" cy="${B.y}" r="600" fill="url(#luz)"/>
  ${estrelas(5)}
  <circle cx="${T.x}" cy="${T.y}" r="260" fill="url(#neb)"/>
  <circle cx="${B.x}" cy="${B.y}" r="${B.r * 1.45}" fill="url(#aura)"/>
  ${faisca(150, 140, 18, .9)}${faisca(640, 90, 12, .8)}${faisca(930, 560, 12, .7)}${faisca(560, 940, 12, .6)}
  ${campo([[120, 330, 13, 2], [300, 190, 11, 0, 1], [480, 118, 12, 3], [70, 560, 10, 1], [860, 700, 15, 4], [700, 860, 12, 0], [950, 420, 10, 5, 1], [520, 900, 10, 2], [930, 880, 12, 3], [410, 760, 10, 6]])}
  ${rastroDe(B, ux, uy, [[-.46, 150, 24], [-.16, 150, 34], [.14, 150, 28], [.44, 130, 20]])}
  ${marte({ ...A, giro: -26, rosto: [40, -30], olhar: [26, -8], lw: 12, boca: "sorriso" })}
  ${rastroDe(T, ux, uy, [[-.42, 56, 11], [.34, 44, 9]], "#ffffff", .5)}
  ${terra({ ...T, giro: 10, lw: 11 })}
  <g transform="${estica(B, ux, uy, 1.07)}">${marte({ ...B, giro: -24, rosto: [42, -48], olhar: [24, -6], lw: 13 })}</g>`);
}

// ── D · O CLOSE ───────────────────────────────────────────────────────────────
// O rosto dele ocupando o tile, de boca aberta para a comida que entra em espiral — a mais legível no tile de
// 94 px, com o menor fugindo lá no canto para contar a história.
function cenaClose() {
  seq = 0; LUZ = [-.707, -.707];
  const M = { x: 478, y: 650, r: 462 }, T = { x: 852, y: 132, r: 66 };
  const GIRO = -10, ROSTO = [16, -44];
  const [bx, by] = doRosto(M, GIRO, ROSTO, [40, 150]);
  const dx = T.x - M.x, dy = T.y - M.y, dl = Math.hypot(dx, dy), ux = dx / dl, uy = dy / dl;   // o menor foge dele
  return svgDe(`
  <circle cx="${M.x}" cy="${M.y - 80}" r="640" fill="url(#luz)"/>
  ${estrelas(3, 40)}
  <circle cx="${T.x}" cy="${T.y}" r="220" fill="url(#neb)"/>
  <circle cx="${M.x}" cy="${M.y}" r="${M.r * 1.3}" fill="url(#aura)"/>
  ${faisca(96, 110, 18, .9)}${faisca(620, 70, 11, .8)}
  ${campo([[70, 250, 12, 3], [220, 90, 11, 0, 1], [430, 70, 10, 2], [40, 470, 10, 1], [700, 200, 11, 5, 1]])}
  ${rastroDe(T, ux, uy, [[-.42, 50, 10], [.34, 40, 8]], "#ffffff", .5)}
  ${terra({ ...T, giro: -16, lw: 10 })}
  ${marte({ ...M, giro: GIRO, rosto: ROSTO, olhar: [30, -10], lw: 15 })}
  ${corrente([994, 372], [936, 690], [bx, by], [[0, 32], [.15, 28], [.3, 33], [.44, 25], [.57, 22], [.69, 18], [.8, 14], [.9, 11]])}`);
}

const CENAS = [
  ["a-perseguicao", cenaPerseguicao],
  ["b-supernova", cenaSupernova],
  ["c-salto", cenaSalto],
  ["d-close", cenaClose],
];

// ── RASTERIZAÇÃO ────────────────────────────────────────────────────────────
function assa(svg, px, saida, { jpg = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "warspace-poki-"));
  const pagina = path.join(tmp, "a.html"), bruto = path.join(tmp, "a.png");
  fs.writeFileSync(pagina, `<!doctype html><meta charset="utf-8"><style>*{margin:0;padding:0}html,body{background:#000}
#a{position:absolute;left:0;top:0;width:${px}px;height:${px}px;overflow:hidden}#a svg{display:block}</style><div id="a">${svg}</div>`);
  const r = spawnSync(CHROME, ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars", "--force-device-scale-factor=1",
    `--screenshot=${bruto}`, `--window-size=${Math.max(px, 500)},${px + FOLGA}`, "file://" + pagina], { stdio: "ignore", timeout: 90000 });
  if (r.status !== 0 || !fs.existsSync(bruto)) throw new Error(`Chrome falhou ao assar ${path.basename(saida)} (status ${r.status}). CHROME_BIN=${CHROME}`);
  const c = spawnSync("python3", ["-c", `from PIL import Image
i=Image.open(${JSON.stringify(bruto)}).convert("RGB").crop((0,0,${px},${px}))
${jpg ? `i.save(${JSON.stringify(saida)},quality=93,optimize=True,progressive=True)` : `i.save(${JSON.stringify(saida)},optimize=True)`}`], { stdio: "pipe" });
  fs.rmSync(tmp, { recursive: true, force: true });
  if (c.status !== 0) throw new Error("recorte falhou (PIL): " + String(c.stderr));
  return fs.statSync(saida).size;
}

// ── SAÍDA ───────────────────────────────────────────────────────────────────
// As quatro cenas saem em opcoes/ (o PNG de 628 para comparar e a fonte SVG); a PRINCIPAL — a que vai para o
// painel — sai também como thumb-* no tamanho de subir. Trocar a principal: POKI_THUMB=<id> node …
const PRINCIPAL = process.env.POKI_THUMB || "a-perseguicao";
if (!CENAS.some(([id]) => id === PRINCIPAL)) throw new Error(`POKI_THUMB desconhecida: ${PRINCIPAL} (${CENAS.map(([id]) => id).join(", ")})`);
const destino = process.argv[2] ? path.resolve(process.argv[2]) : SAI;
fs.mkdirSync(path.join(destino, "opcoes"), { recursive: true });
for (const [id, cena] of CENAS) {
  const svg = cena();
  fs.writeFileSync(path.join(destino, "opcoes", `${id}.svg`), svg);
  console.log(`opcoes/${id}-628.png`.padEnd(28) + `${assa(svg, 628, path.join(destino, "opcoes", `${id}-628.png`))} B`);
  if (id !== PRINCIPAL) continue;
  fs.writeFileSync(path.join(destino, "thumb.svg"), svg);
  for (const [px, arq, jpg] of [[1256, "thumb-1256.png"], [628, "thumb-628.png"], [1256, "thumb-1256.jpg", true]])
    console.log(arq.padEnd(28) + `${assa(svg, px, path.join(destino, arq), { jpg })} B`);
}

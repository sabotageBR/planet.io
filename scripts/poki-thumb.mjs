// ── A THUMBNAIL DA POKI ───────────────────────────────────────────────────────
// Uma ilustração VETORIAL da jogada principal: o Marte Bravo (o planeta do jogador — o do tutorial e das
// três primeiras partidas no pacote da Poki) avança de boca aberta sobre um planeta MENOR, que foge
// apavorado, enquanto as partículas do campo são sugadas para dentro dele. É o laço do jogo numa imagem:
// comer as partículas, crescer e engolir quem é menor.
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
// uso:  node scripts/poki-thumb.mjs [pasta]   → brand/poki/ por padrão:
//   thumb-1256.png  o arquivo a SUBIR (o dobro do mínimo: o tile maior tem 314 px, e o celular tem dpr 2–3)
//   thumb-1256.jpg  o mesmo em JPG, se o formulário recusar o PNG pelo tamanho
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
/** interpola linearmente y(x) numa lista de amostras [[x,y],…] ordenada por x */
function amostra(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return pts[pts.length - 1][1];
}

/**
 * O VOLUME de um disco em faixas duras, no espaço UNITÁRIO de raio R: a sombra é a parte do disco FORA de
 * um círculo deslocado para a luz (alto à esquerda), e o brilho é a lua crescente do lado oposto. Tudo
 * `evenodd` dentro do clip do disco — dois círculos, nenhuma conta de interseção.
 */
function volume(R, id, { sombra, luz, aro }) {
  return `<g clip-path="url(#${id})">
    <path fill-rule="evenodd" fill="${sombra}" opacity=".30" d="${circ(0, 0, R)} ${circ(-R * .2, -R * .23, R * .95)}"/>
    <path fill-rule="evenodd" fill="${sombra}" opacity=".30" d="${circ(0, 0, R)} ${circ(-R * .07, -R * .08, R * .985)}"/>
    <path fill-rule="evenodd" fill="${luz}" opacity=".55" d="${circ(0, 0, R)} ${circ(R * .09, R * .1, R * .975)}"/>
    <path fill-rule="evenodd" fill="${aro}" opacity=".6" d="${circ(0, 0, R)} ${circ(-R * .035, -R * .04, R * .99)}"/>
  </g>`;
}

// ── MARTE BRAVO (espaço unitário: raio 300) ───────────────────────────────────
// Cratera no espaço LOCAL do planeta (que gira com o rosto): achatada perto da borda (é uma esfera), com a
// parede de dentro virada para a luz no escuro e a borda de fora pegando luz do lado oposto.
function cratera(x, y, R, giro) {
  const id = uid("cr");
  const d = Math.hypot(x, y), a = Math.atan2(y, x) * 180 / Math.PI;
  const k = Math.max(.38, Math.sqrt(Math.max(0, 1 - (d / 300) ** 2)));
  // a luz do MUNDO (alto à esquerda), trazida para o referencial da cratera
  const t = -(giro + a) * Math.PI / 180, lx = -.707, ly = -.707;
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

/** o rosto: olhos travados na presa, sobrancelhas em V e a boca escancarada (espaço do rosto) */
function rostoMarte(lw, olhar) {
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
  return `
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
    <path d="M 240 6 Q 250 36 228 64" fill="none" stroke="${C.tinta}" stroke-width="${n(lw * .7)}" stroke-linecap="round"/>
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
function marte({ x, y, r, giro = -16, rosto = [40, -20], olhar = [20, 4], lw = 12 }) {
  const id = uid("marte"), s = r / 300, u = lw / s;
  const crateras = [[-40, -236, 34], [100, -228, 20], [-240, -46, 27], [-250, 104, 31], [230, -182, 18], [262, 116, 15], [-150, -214, 14], [-176, 196, 16]]
    .map(([cx, cy, R]) => cratera(cx, cy, R, giro)).join("");
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})">
    <clipPath id="${id}"><circle r="300"/></clipPath>
    <circle r="300" fill="${C.m0}"/>
    <g clip-path="url(#${id})"><g transform="rotate(${giro})">${crateras}${cinto(u)}</g></g>
    ${volume(300, id, { sombra: C.mSombra, luz: C.mLuz, aro: C.aro })}
    <path d="${arco(250, 196, 236)}" fill="none" stroke="${C.mBrilho}" stroke-width="30" stroke-linecap="round" opacity=".92"/>
    <circle cx="${n(250 * Math.cos(247 * Math.PI / 180))}" cy="${n(250 * Math.sin(247 * Math.PI / 180))}" r="15" fill="${C.mBrilho}" opacity=".92"/>
    <g clip-path="url(#${id})"><g transform="rotate(${giro}) translate(${rosto[0]} ${rosto[1]})">${rostoMarte(u, olhar)}</g></g>
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
    <ellipse cx="-50" cy="-60" rx="18" ry="9" transform="rotate(-38 -50 -60)" fill="#fff" opacity=".9"/>
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
const halos = () => PARTICULAS.map(c => `<radialGradient id="h${c.slice(1)}"><stop offset="0" stop-color="${c}" stop-opacity=".8"/><stop offset=".45" stop-color="${c}" stop-opacity=".32"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`).join("");
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

// ── A CENA ──────────────────────────────────────────────────────────────────
function cena() {
  seq = 0;
  const M = { x: 384, y: 616, r: 318 }, T = { x: 800, y: 248, r: 116 };
  const GIRO = -18, ROSTO = [36, -46];
  const dx = T.x - M.x, dy = T.y - M.y, dl = Math.hypot(dx, dy), ux = dx / dl, uy = dy / dl;   // para onde ele avança
  const ang = Math.atan2(uy, ux) * 180 / Math.PI;
  const rnd = rng(7);
  let ceu = "";
  for (let i = 0; i < 46; i++) { const x = rnd() * 1000, y = rnd() * 1000, r = .9 + rnd() * 2.1; ceu += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#fff1d6" opacity="${n(.25 + rnd() * .6)}"/>`; }
  // o rastro dele: traços AFILADOS paralelos ao movimento, saindo das costas
  const costas = Math.atan2(-uy, -ux);
  const rastro = [[-.66, 170, 22], [-.36, 250, 30], [-.06, 205, 24], [.24, 260, 20], [.52, 150, 14]].map(([da, L, w]) => {
    const a = costas + da, px = M.x + Math.cos(a) * (M.r + 26), py = M.y + Math.sin(a) * (M.r + 26);
    return cauda(px, py, ux, uy, L, w, "#e6d9ff", .5);
  }).join("");
  // a corrente de partículas sendo SUGADA: vem do campo, à direita, e entra pelo canto da boca — por cima
  // do rosto, encolhendo: é a imagem de "comer" que o jogo inteiro é
  const [bx, by] = doRosto(M, GIRO, ROSTO, [150, 118]);                      // dentro da boca, junto ao canto
  const S = [958, 468], K = [812, 612], E = [bx, by];
  const Bz = t => [(1 - t) ** 2 * S[0] + 2 * (1 - t) * t * K[0] + t * t * E[0], (1 - t) ** 2 * S[1] + 2 * (1 - t) * t * K[1] + t * t * E[1]];
  const dBz = t => [2 * (1 - t) * (K[0] - S[0]) + 2 * t * (E[0] - K[0]), 2 * (1 - t) * (K[1] - S[1]) + 2 * t * (E[1] - K[1])];
  let corrente = "";
  [[0, 30], [.16, 26], [.31, 31], [.45, 23], [.58, 20], [.7, 17], [.81, 13], [.91, 10]].forEach(([t, r], i) => {
    const [x, y] = Bz(t), [vx, vy] = dBz(t);
    corrente += particula(x, y, r, PARTICULAS[i % PARTICULAS.length], i > 0 ? [vx, vy, r * 4.4] : null);
  });
  // o campo em volta (o mapa é cheio de comida: é isso que se come o jogo inteiro)
  const soltas = [[140, 176, 14, 3], [312, 112, 10, 0], [566, 88, 12, 2], [84, 420, 10, 1], [886, 790, 16, 4], [740, 912, 12, 1], [956, 330, 10, 5], [606, 866, 9, 0], [960, 680, 11, 2], [472, 232, 9, 1]]
    .map(([x, y, r, c], i) => particula(x, y, r, PARTICULAS[c % PARTICULAS.length], null, i === 1 || i === 6)).join("");
  // a fuga do menor: rastro curto do lado de TRÁS dele (o lado de quem o persegue)
  const atras = Math.atan2(-uy, -ux);
  const fuga = [[-.42, 64, 12], [.34, 50, 10]].map(([da, L, w]) => {
    const a = atras + da, px = T.x + Math.cos(a) * (T.r + 16), py = T.y + Math.sin(a) * (T.r + 16);
    return cauda(px, py, ux, uy, L, w, "#ffffff", .5);
  }).join("");
  // esticado na direção do movimento — o mesmo "blob" que o planeta faz no jogo quando corre
  const estica = `translate(${M.x} ${M.y}) rotate(${n(ang)}) scale(1.05 .955) rotate(${n(-ang)}) translate(${-M.x} ${-M.y})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%">
  <defs>
    <linearGradient id="ceu" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#141a4a"/><stop offset=".46" stop-color="#3f2a86"/><stop offset=".72" stop-color="#57287c"/><stop offset=".88" stop-color="#8a2f6a"/><stop offset="1" stop-color="#c8542f"/>
    </linearGradient>
    <radialGradient id="luz"><stop offset="0" stop-color="#8b46ff" stop-opacity=".75"/><stop offset=".6" stop-color="#6a33e0" stop-opacity=".3"/><stop offset="1" stop-color="#6a33e0" stop-opacity="0"/></radialGradient>
    <radialGradient id="neb"><stop offset="0" stop-color="#ff4fb6" stop-opacity=".55"/><stop offset="1" stop-color="#ff4fb6" stop-opacity="0"/></radialGradient>
    <radialGradient id="aura"><stop offset=".55" stop-color="#ff7a3a" stop-opacity=".42"/><stop offset="1" stop-color="#ff7a3a" stop-opacity="0"/></radialGradient>
    ${halos()}
  </defs>
  <rect width="1000" height="1000" fill="url(#ceu)"/>
  <circle cx="${M.x + 40}" cy="${M.y - 60}" r="620" fill="url(#luz)"/>
  ${ceu}
  <circle cx="${T.x}" cy="${T.y}" r="300" fill="url(#neb)"/>
  <circle cx="${M.x}" cy="${M.y}" r="${M.r * 1.45}" fill="url(#aura)"/>
  ${faisca(168, 120, 20, .95)}${faisca(676, 104, 12, .8)}${faisca(640, 930, 14, .7)}${faisca(60, 640, 10, .6)}
  ${soltas}
  ${rastro}
  ${fuga}
  ${terra({ ...T, giro: 10, lw: 12 })}
  <g transform="${estica}">${marte({ ...M, giro: GIRO, rosto: ROSTO, olhar: [22, 2], lw: 13 })}</g>
  ${corrente}
</svg>`;
}

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
const svg = cena();
const destino = process.argv[2] ? path.resolve(process.argv[2]) : SAI;
fs.mkdirSync(destino, { recursive: true });
fs.writeFileSync(path.join(destino, "thumb.svg"), svg);
for (const [px, nome, jpg] of [[1256, "thumb-1256.png"], [628, "thumb-628.png"], [1256, "thumb-1256.jpg", true]])
  console.log(nome.padEnd(16) + `${assa(svg, px, path.join(destino, nome), { jpg })} B`);

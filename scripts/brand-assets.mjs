// ── ASSETS DA MARCA ───────────────────────────────────────────────────────────
// Assa, a partir da MESMA arte que a tela usa (client/src/ui/logoArt.js), tudo que é arquivo solto e
// portanto não enxerga os tokens do tema:
//   client/public/favicon.svg          o ícone da aba
//   client/public/icon-{180,192,512}.png   apple-touch-icon + PWA
//   client/public/og.png               1200×630, o cartão de quem cola o link num chat
//   client/public/manifest.webmanifest
//
// Os PNG saem do Chrome headless (o mesmo binário de scripts/responsive-check.mjs) porque não há
// rasterizador de SVG nesta máquina — e o Chrome é o rasterizador que os jogadores usam de qualquer forma.
//
// uso:  node scripts/brand-assets.mjs
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logoArt, logoSvgFile, PALETA_FIXA } from "../client/src/ui/logoArt.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = path.join(RAIZ, "client", "public");
// As thumbnails dos portais NÃO vão para client/public: elas são material do catálogo deles, não do
// jogo, e tudo que está em public/ entra em todo dist — inclusive no zip, onde só ocupariam espaço.
const BRAND = path.join(RAIZ, "brand");
const CHROME = process.env.CHROME_BIN || "/opt/google/chrome/chrome";
const { ink, a1, tx } = PALETA_FIXA;

// ⚠️ A VIEWPORT DO CHROME HEADLESS É ~87 px MAIS BAIXA que o `--window-size` pedido, e o screenshot sai
// no tamanho pedido: a diferença aparece como uma FAIXA BRANCA no rodapé da imagem. Em vez de adivinhar a
// compensação, a página desenha um bloco de tamanho EXATO ancorado no canto superior esquerdo, pedimos uma
// janela com folga e recortamos os w×h de cima — o resultado não depende da versão do Chrome.
const FOLGA = 200;

/** Renderiza um HTML num PNG de exatamente w×h com o Chrome headless. */
function assa(corpo, css, w, h, saida) {
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "warspace-brand-"));
  const pagina = path.join(tmp, "a.html");
  fs.writeFileSync(pagina, `<!doctype html><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:transparent}
#a{position:absolute;left:0;top:0;width:${w}px;height:${h}px;overflow:hidden}
${css}</style><div id="a">${corpo}</div>`);
  const r = spawnSync(CHROME, ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars",
    "--default-background-color=00000000", `--screenshot=${saida}`, `--window-size=${w},${h + FOLGA}`, "file://" + pagina],
    { stdio: "ignore", timeout: 60000 });
  fs.rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0 || !fs.existsSync(saida)) throw new Error(`Chrome falhou ao assar ${path.basename(saida)} (status ${r.status}). CHROME_BIN=${CHROME}`);
  // recorta os w×h de cima; sem isto sobra a faixa da folga no rodapé
  const c = spawnSync("python3", ["-c",
    `from PIL import Image;i=Image.open(${JSON.stringify(saida)});i.crop((0,0,${w},${h})).save(${JSON.stringify(saida)})`],
    { stdio: "pipe" });
  if (c.status !== 0) throw new Error("recorte falhou (PIL): " + String(c.stderr));
  return fs.statSync(saida).size;
}

fs.mkdirSync(PUB, { recursive: true });

// 1. favicon — SVG, com as cores literais do tema dawn (um arquivo solto não lê os tokens da página)
const svg = logoSvgFile(PALETA_FIXA);
fs.writeFileSync(path.join(PUB, "favicon.svg"), svg);
console.log(`favicon.svg        ${svg.length} B`);

// 2. ícones quadrados. Fundo CHAPADO, não transparente: o apple-touch-icon é composto sobre branco no
//    iOS, e um símbolo de tinta escura sobre branco perde a metade escura do desenho.
for (const n of [180, 192, 512]) {
  const p = path.join(PUB, `icon-${n}.png`);
  const b = assa(`<div class="w"><svg viewBox="0 0 64 64">${logoArt(PALETA_FIXA)}</svg></div>`,
    `.w{width:100%;height:100%;background:${ink};display:flex;align-items:center;justify-content:center}
     .w svg{width:78%;height:78%}`, n, n, p);
  console.log(`icon-${n}.png`.padEnd(19) + `${b} B`);
}

// 3. cartão de compartilhamento. O wordmark é a ARTE (client/src/assets/scene/logo.webp), a mesma que a
//    tela desenha — antes era texto em Archivo Black, e um cartão que não é a marca do jogo não serve.
//    ⚠️ Embutida em base64 pelo mesmo motivo da fonte: `file://` dentro de um Chrome headless com
//    --no-sandbox é frágil, e uma imagem que não carregar sai como um retângulo vazio SEM ERRO NENHUM.
//    A tagline continua em webfont, então o `throw` da fonte fica.
// ⚠️ Aqui havia um `throw` se a fonte da marca não estivesse em client/public/fonts. A checagem era
// VESTIGIAL — a receita do og.png abaixo usa `font-family:system-ui`, a webfont não entra nela — e virou
// um estorvo no dia em que as .woff2 se mudaram para client/src/assets/fonts (de onde o bundler as
// hasheia, que é o que faz a marca ter fonte também no pacote servido de um subcaminho por um portal).
const marca = path.join(RAIZ, "client", "src", "assets", "scene", "logo.webp");
if (!fs.existsSync(marca)) throw new Error(`falta a arte da marca em ${marca}`);
const marcaB64 = fs.readFileSync(marca).toString("base64");
const og = path.join(PUB, "og.png");
const bytes = assa(
  `<div class="w"><img src="data:image/webp;base64,${marcaB64}">
   <span>Conquiste a galáxia · divida · ejete · devore</span></div>`,
  `.w{width:100%;height:100%;background:linear-gradient(160deg,#232f63,#1b2450 60%,#3b1f6b);
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;padding:0 70px}
   .w>img{width:820px;height:auto;filter:drop-shadow(0 10px 18px rgba(0,0,0,.45))}
   span{font-family:system-ui,sans-serif;font-size:30px;letter-spacing:.09em;text-transform:uppercase;color:#8fa0d8;text-align:center}`,
  1200, 630, og);
console.log(`og.png             ${bytes} B`);

// 4. manifest. O ícone SVG cobre qualquer tamanho; os PNG existem para quem não aceita SVG (iOS).
fs.writeFileSync(path.join(PUB, "manifest.webmanifest"), JSON.stringify({
  name: "warspace.io", short_name: "warspace", description: "Conquiste a galáxia: cresça, divida, ejete e devore.",
  start_url: "/", scope: "/", display: "fullscreen", orientation: "any",
  background_color: "#1b2450", theme_color: "#1b2450", lang: "pt-BR", categories: ["games"],
  icons: [
    { src: "/favicon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
    { src: "/icon-192.png", type: "image/png", sizes: "192x192" },
    { src: "/icon-512.png", type: "image/png", sizes: "512x512" },
  ],
}, null, 2) + "\n");
console.log("manifest.webmanifest");

// ── 5. THUMBNAILS DOS PORTAIS ────────────────────────────────────────────────
// Obrigatórias na GameDistribution (§5.1) e pedidas pelos outros nos mesmos três formatos. Saem daqui
// e não de um editor de imagem porque a máquina já existe (`assa`) e porque thumbnail feita à mão
// diverge da marca na primeira mudança dela.
// ⚠️ A de 200×120 leva SÓ o wordmark. A 120 px de altura, qualquer texto abaixo de ~14 px vira borrão —
//    é a que todo mundo erra, e é a que mais aparece (é ela que vai na grade dos publishers).
// ⚠️ Fundo OPACO: o `assa` pede screenshot com fundo transparente, e thumbnail com alfa fica com um
//    quadriculado ou um preto chapado dependendo de onde o portal a desenha.
// ⚠️ O texto é em INGLÊS: o catálogo dos portais é internacional e o idioma padrão exigido por eles é o
//    inglês. É a única superfície do projeto onde isso vale — a UI continua saindo do i18n.
fs.mkdirSync(BRAND, { recursive: true });
const FUNDO = "background:linear-gradient(160deg,#232f63,#1b2450 60%,#3b1f6b)";
const THUMBS = [
  // 1:1 — o wordmark é DEITADO (742×269) e num quadrado sobraria uma faixa vazia em cima e embaixo:
  // aqui quem manda é o símbolo, com o nome pequeno embaixo.
  { w: 512, h: 512, corpo: `<div class="w"><svg viewBox="0 0 64 64">${logoArt(PALETA_FIXA)}</svg><b>WARSPACE.IO</b></div>`,
    css: `.w{width:100%;height:100%;${FUNDO};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px}
          .w svg{width:58%;height:58%}
          b{font-family:system-ui,sans-serif;font-size:44px;letter-spacing:.10em;color:#f0d68a}` },
  // 4:3 — a receita do og.png reescalada: aqui o wordmark cabe inteiro e é ele que identifica o jogo
  { w: 512, h: 384, corpo: `<div class="w"><img src="data:image/webp;base64,${marcaB64}"><span>CONQUER THE GALAXY</span></div>`,
    css: `.w{width:100%;height:100%;${FUNDO};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:0 28px}
          .w>img{width:88%;height:auto;filter:drop-shadow(0 6px 12px rgba(0,0,0,.45))}
          span{font-family:system-ui,sans-serif;font-size:17px;letter-spacing:.14em;color:#8fa0d8}` },
  // 5:3 pequena — só a marca, o maior possível
  { w: 200, h: 120, corpo: `<div class="w"><img src="data:image/webp;base64,${marcaB64}"></div>`,
    css: `.w{width:100%;height:100%;${FUNDO};display:flex;align-items:center;justify-content:center}
          .w>img{width:86%;height:auto}` },
];
for (const t of THUMBS) {
  const p = path.join(BRAND, `thumb-${t.w}x${t.h}.png`);
  console.log(`thumb-${t.w}x${t.h}.png`.padEnd(19) + `${assa(t.corpo, t.css, t.w, t.h, p)} B`);
}

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

// 3. cartão de compartilhamento. O wordmark aqui é a webfont de verdade: sem ela o cartão sai numa
//    fonte de sistema qualquer e não é a marca.
const fonte = path.join(PUB, "fonts", "archivo-black-latin.woff2");
if (!fs.existsSync(fonte)) throw new Error(`falta a fonte da marca em ${fonte}`);
const fonteB64 = fs.readFileSync(fonte).toString("base64");
const og = path.join(PUB, "og.png");
const bytes = assa(
  `<div class="w"><svg viewBox="0 0 64 64">${logoArt(PALETA_FIXA)}</svg>
   <div class="t"><b>WARSPACE<i>.IO</i></b><span>Conquiste a galáxia · divida · ejete · devore</span></div></div>`,
  `@font-face{font-family:AB;src:url(data:font/woff2;base64,${fonteB64}) format("woff2")}
   .w{width:100%;height:100%;background:linear-gradient(160deg,#232f63,#1b2450 60%,#3b1f6b);
      display:flex;align-items:center;justify-content:center;gap:44px;padding:0 70px}
   .w>svg{width:250px;height:250px;flex:none}
   .t{display:flex;flex-direction:column;gap:18px}
   b{font-family:AB,sans-serif;font-size:96px;line-height:1;color:${tx};text-shadow:6px 6px 0 ${ink};letter-spacing:-.02em}
   i{font-style:normal;color:${a1}}
   span{font-family:system-ui,sans-serif;font-size:27px;letter-spacing:.09em;text-transform:uppercase;color:#8fa0d8}`,
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

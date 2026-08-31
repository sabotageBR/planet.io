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

/**
 * Renderiza um HTML em exatamente w×h com o Chrome headless. PNG por padrão; se `saida` terminar em
 * `.jpg`, o PIL converte no mesmo passo do recorte — as thumbnails dos portais são obrigatoriamente JPG
 * ("Upload thumbnails in JPG format"), e o Chrome headless só sabe tirar PNG.
 */
function assa(corpo, css, w, h, saida) {
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "warspace-brand-"));
  const pagina = path.join(tmp, "a.html");
  fs.writeFileSync(pagina, `<!doctype html><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:transparent}
#a{position:absolute;left:0;top:0;width:${w}px;height:${h}px;overflow:hidden}
${css}</style><div id="a">${corpo}</div>`);
  const jpg = /\.jpe?g$/i.test(saida);
  const bruto = jpg ? saida.replace(/\.jpe?g$/i, ".tmp.png") : saida;
  const r = spawnSync(CHROME, ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars",
    "--default-background-color=00000000", `--screenshot=${bruto}`, `--window-size=${w},${h + FOLGA}`, "file://" + pagina],
    { stdio: "ignore", timeout: 60000 });
  fs.rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0 || !fs.existsSync(bruto)) throw new Error(`Chrome falhou ao assar ${path.basename(saida)} (status ${r.status}). CHROME_BIN=${CHROME}`);
  // recorta os w×h de cima (sem isto sobra a faixa da folga no rodapé) e, no JPG, achata sobre o fundo:
  // JPEG não tem alfa, e sem o `paste` o transparente sairia PRETO.
  const c = spawnSync("python3", ["-c", jpg
    ? `from PIL import Image;i=Image.open(${JSON.stringify(bruto)}).crop((0,0,${w},${h})).convert("RGBA");f=Image.new("RGB",i.size,(27,36,80));f.paste(i,mask=i.split()[3]);f.save(${JSON.stringify(saida)},quality=92,optimize=True);import os;os.remove(${JSON.stringify(bruto)})`
    : `from PIL import Image;i=Image.open(${JSON.stringify(saida)});i.crop((0,0,${w},${h})).save(${JSON.stringify(saida)})`],
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
// Obrigatórias na GameDistribution e pedidas pelos outros nos mesmos formatos. Saem daqui e não de um
// editor porque a máquina já existe (`assa`) e porque thumbnail feita à mão diverge da marca na primeira
// mudança dela. As regras deles, na letra:
//   · JPG, e os tamanhos EXATOS 512×384, 512×512 e 200×120 (mandatórios) + 1280×720 e 1280×550;
//   · nada de bordas arredondadas — a imagem inteira, como uma ilustração;
//   · "combine colors, shapes and characters", nada de screenshot cru, e tipografia só nos formatos
//     grandes. Daí os PERSONAGENS (os mesmos planetas com cara do cenário do menu) entrarem em todas, e
//     o wordmark sair da menor: a 120 px de altura ele viraria borrão.
fs.mkdirSync(BRAND, { recursive: true });
const b64 = f => fs.readFileSync(path.join(RAIZ, "client", "src", "assets", "scene", f)).toString("base64");
const ART = { logo: b64("logo.webp"), laranja: b64("planeta-laranja.webp"), azul: b64("planeta-azul.webp"),
  lua: b64("lua.webp"), missil: b64("missil.webp"), ceu: b64("bg-dawn.webp") };
const img = (k, cls) => `<img class="${cls}" src="data:image/webp;base64,${ART[k]}">`;
// o céu do jogo é o fundo; os planetas brigando são o "personagem"; o míssil dá o movimento que eles
// pedem ("displaying movement tends to be more effective than static images")
const CENA = `.w{position:absolute;inset:0;overflow:hidden;background:#1b2450}
  .ceu{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .p{position:absolute;filter:drop-shadow(0 8px 16px rgba(0,0,0,.5))}
  .marca{position:absolute;left:50%;transform:translateX(-50%);filter:drop-shadow(0 6px 14px rgba(0,0,0,.55))}`;

const THUMBS = [
  // 4:3 e 16:9 — cabe a briga inteira e o wordmark
  { w: 512, h: 384, css: `${CENA}
      .marca{top:6%;width:88%} .laranja{left:-14%;bottom:-16%;width:56%} .azul{right:-12%;bottom:-10%;width:50%}
      .missil{left:36%;top:52%;width:26%;transform:rotate(-12deg)} .lua{left:6%;top:6%;width:16%;opacity:.9}` },
  { w: 1280, h: 720, css: `${CENA}
      .marca{top:7%;width:66%} .laranja{left:-8%;bottom:-18%;width:42%} .azul{right:-6%;bottom:-14%;width:38%}
      .missil{left:40%;top:56%;width:20%;transform:rotate(-12deg)} .lua{left:8%;top:10%;width:11%;opacity:.9}` },
  { w: 1280, h: 550, css: `${CENA}
      .marca{top:6%;width:58%} .laranja{left:-6%;bottom:-26%;width:38%} .azul{right:-5%;bottom:-22%;width:34%}
      .missil{left:41%;top:52%;width:18%;transform:rotate(-12deg)} .lua{left:8%;top:12%;width:10%;opacity:.9}` },
  // 1:1 — o wordmark é DEITADO (742×269); num quadrado ele fica pequeno, então os personagens dominam
  { w: 512, h: 512, css: `${CENA}
      .marca{top:5%;width:92%} .laranja{left:-16%;bottom:-8%;width:66%} .azul{right:-14%;bottom:-4%;width:60%}
      .missil{left:34%;top:56%;width:30%;transform:rotate(-12deg)} .lua{left:4%;top:30%;width:20%;opacity:.85}` },
  // 5:3 pequena — SEM texto: a 120 px de altura qualquer tipografia vira mancha. É a que mais aparece.
  { w: 200, h: 120, semMarca: true, css: `${CENA}
      .laranja{left:-10%;bottom:-30%;width:62%} .azul{right:-8%;bottom:-26%;width:56%}
      .missil{left:34%;top:38%;width:34%;transform:rotate(-12deg)} .lua{left:6%;top:8%;width:22%;opacity:.9}` },
];
for (const t of THUMBS) {
  const corpo = `<div class="w">${img("ceu","ceu")}${img("lua","p lua")}${img("laranja","p laranja")}` +
    `${img("azul","p azul")}${img("missil","p missil")}${t.semMarca ? "" : img("logo","marca")}</div>`;
  const p = path.join(BRAND, `thumb-${t.w}x${t.h}.jpg`);
  console.log(`thumb-${t.w}x${t.h}.jpg`.padEnd(21) + `${assa(corpo, t.css, t.w, t.h, p)} B`);
}

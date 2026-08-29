// Gera os HTMLs autossuficientes de mockups/ (engine + tema inline, zero rede).
// uso: node mockups/src/build.js
const fs=require("fs"),path=require("path");
const SRC=__dirname,OUT=path.join(SRC,"..");
const base=fs.readFileSync(path.join(SRC,"base.css"),"utf8");
const engine=fs.readFileSync(path.join(SRC,"engine.js"),"utf8");

const MODELS=[
  ["classic","Agar Espacial Clássico","A tradução mais fiel do agar.io: tudo chapado, grid fino no fundo, aro escuro, nome + massa no centro. Tema escuro espacial.","#4ecdc4","#2f6bd8"],
  ["light","Agar Claro","O agar.io original: fundo claro com grid cinza e círculos pastel de contorno fino. O espaço entra pelas skins, cometas e constelações.","#9fc7ff","#e6ecf7"],
  ["neon","Neon Arcade","Mesma leitura, acabamento emissivo: fundo preto, grid ciano, aro brilhante, rastro de luz e scanlines de CRT.","#00e5ff","#ff2fb9"],
  ["toon","Cartoon Cósmico","Contorno preto grosso, cores saturadas e formas chapadas — leitura instantânea e cara de jogo mobile.","#ffd23d","#ff6b4a"],
  ["cosmic","Cinematográfico","O tema atual levado a sério: parallax de estrelas, nebulosas volumétricas, relevo nos planetas e HUD de vidro.","#7aa2ff","#c56bff"],
  ["pixel","Pixel 16-bit","Baixa resolução escalada, paleta limitada, dithering e HUD com moldura estilo SNES.","#7bd44b","#2b3a67"],
  ["hybrid","Neon Cinematográfico (híbrido)","Planeta com volume, atmosfera e terminador do modelo 5, com aro emissivo, grid, borda e HUD do modelo 3. Painéis de vidro com acento ciano.","#4fe3ff","#2f6bff"],
];

for(const [id,name] of MODELS){
  const tf=path.join(SRC,`theme.${id}.js`);
  if(!fs.existsSync(tf)){console.log("--  tema ainda não escrito: "+id);continue;}
  const theme=fs.readFileSync(tf,"utf8");
  const html=`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>warspace.io — modelo: ${name}</title>
<style>
${base}</style>
<style id="theme-css"></style>
</head>
<body>
<div id="app"></div>
<script>
${engine}</script>
<script>
${theme}</script>
<script>
document.getElementById("theme-css").textContent=THEME.css;
MOCK.boot(THEME);
</script>
</body>
</html>`;
  fs.writeFileSync(path.join(OUT,id+".html"),html);
  console.log("ok  mockups/"+id+".html");
}

// ── launcher ─────────────────────────────────────────────────────────────────
const cards=MODELS.map(([id,name,desc,c1,c2],i)=>`
    <a class="card" href="${id}.html">
      <div class="thumb" style="--a:${c1};--b:${c2}"><span>${i+1}</span></div>
      <div class="body"><h2>${name}</h2><p>${desc}</p><em>abrir demo →</em></div>
    </a>`).join("");
fs.writeFileSync(path.join(OUT,"index.html"),`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>warspace.io — 6 modelos visuais</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0b0e14;color:#e6edf6;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;padding:44px 24px 60px}
.wrap{max-width:1100px;margin:0 auto}
h1{font-size:32px;letter-spacing:-.5px}
.sub{color:#8b9bb4;margin:8px 0 6px;font-size:15px;line-height:1.6}
.keys{color:#63738c;font-size:13px;margin-bottom:28px}
.keys b{color:#9fb0c8;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
.card{display:flex;gap:14px;padding:14px;background:#141a24;border:1px solid #202a38;border-radius:14px;
  text-decoration:none;color:inherit;transition:.15s}
.card:hover{border-color:#3d5a80;transform:translateY(-2px);background:#182030}
.thumb{width:92px;height:92px;flex:none;border-radius:10px;position:relative;
  background:linear-gradient(135deg,var(--a),var(--b))}
.thumb span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-size:34px;font-weight:800;color:rgba(0,0,0,.45)}
.body h2{font-size:17px;margin-bottom:5px}
.body p{font-size:13px;color:#8b9bb4;line-height:1.5}
.body em{display:block;margin-top:8px;font-style:normal;font-size:12px;color:#5b8cff}
footer{margin-top:34px;color:#4d5b70;font-size:12.5px;line-height:1.8}
</style>
</head>
<body><div class="wrap">
<h1>warspace.io — 6 modelos visuais</h1>
<p class="sub">Cada modelo é uma demo jogável em tela cheia, com a mesma simulação (células, comida, vírus, massa ejetada, mísseis e bots) e arte totalmente diferente — mundo, HUD, menu, loja e tela de morte.</p>
<p class="keys">Dentro da demo: <b>mouse</b> mover · <b>ESPAÇO</b> dividir · <b>W</b> ejetar · <b>clique</b> míssil/ejetar · <b>botão direito</b> dividir · <b>M</b> menu · <b>L</b> loja · <b>K</b> tela de morte · <b>1–7</b> trocar de modelo · <b>ESC</b> voltar aqui</p>
<div class="grid">${cards}
</div>
<footer>Protótipos descartáveis — nada em <code>game.js</code>, <code>server.js</code> ou <code>index.html</code> foi alterado.<br>
Escolhido o rumo, ele vira o visual definitivo do jogo (e dá pra pedir variações de qualquer um antes disso).</footer>
</div></body></html>`);
console.log("ok  mockups/index.html");

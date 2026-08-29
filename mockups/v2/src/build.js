// Gera os HTMLs autossuficientes de mockups/v2/ (dados + engine + tema inline, zero rede)
// e a galeria index.html. O tema é a única fonte de id/name/desc/tags/swatch/tokens.
// uso: node mockups/v2/src/build.js            → html + galeria
//      node mockups/v2/src/build.js --tokens nebula → client/src/theme/nebula/tokens.css
const fs=require("fs"),path=require("path"),vm=require("vm");
const SRC=__dirname,OUT=path.join(SRC,".."),ROOT=path.join(SRC,"..","..","..");
const read=f=>fs.readFileSync(path.join(SRC,f),"utf8");
const base=read("base.css"),data=read("data.js"),engine=read("engine2.js");
const ORDER=["nebula","console","orbit","toon","mono","cockpit"];
const VARIANTS=["toon","toon-candy","toon-neon","toon-comic","toon-sunset","toon-dusk","toon-dawn"];   // rodada 2: variações do modelo escolhido

// avalia o tema num sandbox só para ler os metadados (sem DOM: o tema não pode tocar document no topo)
function meta(id){
  const ctx={window:{},document:undefined,console};ctx.window.window=ctx.window;
  vm.createContext(ctx);
  vm.runInContext(data,ctx);
  const D=ctx.window.MOCKDATA;
  ctx.MOCK={u:{SKINS:D.SKINS,RARITY:D.RARITY,RARITY_COLOR:D.RARITY_COLOR,RARITY_ORDER:D.RARITY_ORDER,DATA:D,WW:3000,WH:3000,mulberry:D.mulberry,
    sprite:()=>null,tier:r=>128,sh:()=>"",rgba:()=>"",clamp:(v,a,b)=>v,lerp:(a,b,t)=>a,rnd:()=>0,pick:a=>a[0]}};
  vm.runInContext(read(`theme.${id}.js`),ctx);
  const T=ctx.window.THEME;if(!T)throw new Error("tema não definiu window.THEME: "+id);
  return{id:T.id,name:T.name,desc:T.desc||"",tags:T.tags||[],swatch:T.swatch||["#888","#444"],tokens:T.tokens||{},layout:T.layout||{}};
}
const kebab=s=>s.replace(/([A-Z])/g,m=>"-"+m.toLowerCase());
const tokensCss=m=>":root{\n"+Object.keys(m.tokens).map(k=>`  --${kebab(k)}: ${m.tokens[k]};`).join("\n")+"\n}\n";

if(process.argv[2]==="--tokens"){const id=process.argv[3],m=meta(id);
  const dir=path.join(ROOT,"client","src","theme",id);fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,"tokens.css"),`/* gerado de mockups/v2/src/theme.${id}.js — modelo "${m.name}" */\n`+tokensCss(m));
  console.log("ok  client/src/theme/"+id+"/tokens.css");process.exit(0);}

const models=[];
for(const id of ORDER.concat(VARIANTS.filter(v=>!ORDER.includes(v)))){
  if(!fs.existsSync(path.join(SRC,`theme.${id}.js`))){console.log("--  tema ainda não escrito: "+id);continue;}
  const m=meta(id);models.push(m);
  const theme=read(`theme.${id}.js`);
  const html=`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
<title>warspace.io v2 — modelo: ${m.name}</title>
<style>
${base}</style>
<style id="theme-css"></style>
</head>
<body>
<div id="app"></div>
<script>
${data}</script>
<script>
${engine}</script>
<script>
${theme}</script>
<script>
MOCK.boot(THEME);
</script>
</body>
</html>`;
  fs.writeFileSync(path.join(OUT,id+".html"),html);
  console.log("ok  mockups/v2/"+id+".html  ("+(html.length/1024).toFixed(0)+" KB)");
}

// ── galeria ──────────────────────────────────────────────────────────────────
let bench={};try{bench=JSON.parse(fs.readFileSync(path.join(OUT,"shots","bench.json"),"utf8"));}catch(e){}
const SCREENS=[["entry","Entrada"],["account","Conta"],["lobby","Salas"],["rank","Ranking"],["profile","Perfil"],["shop","Loja"],["prefs","Opções"],["game","Jogo"],["dead","Morte"],["reconn","Reconectando"]];
const shot=(id,s,mode)=>{const f=`shots/${id}-${s}${mode?"-"+mode:""}.jpg`;return fs.existsSync(path.join(OUT,f))?f:null;};
const thumb=(id,s,mode,label)=>{const f=shot(id,s,mode);const href=`${id}.html?screen=${s}${mode?"&mode="+mode:""}`;
  return f?`<a class="th ${mode||""}" href="${href}" title="${label}"><img src="${f}" alt="${label}" loading="lazy"></a>`:`<a class="th empty ${mode||""}" href="${href}">${label}</a>`;};
const card=(m,i)=>{const b=bench[m.id];
  return`
    <article class="card" style="--a:${m.swatch[0]};--b:${m.swatch[1]}">
      <div class="thumbs">${thumb(m.id,"entry",null,"entrada")}${thumb(m.id,"game",null,"jogo")}${thumb(m.id,"lobby",null,"salas")}${thumb(m.id,"game","portrait","jogo · retrato")}</div>
      <div class="body"><h2><span class="n">${i+1}</span>${m.name}</h2><p>${m.desc}</p>
        <div class="tags">${m.tags.map(t=>`<span>${t}</span>`).join("")}${b?`<span class="bench" title="pior caso, 1920×1080, culling ligado">${b.heavy} ms/quadro</span>`:""}</div>
        <div class="links"><a class="go" href="${m.id}.html">abrir demo →</a><a href="${m.id}.html?bench">bench</a><a href="${m.id}.html?mode=portrait&screen=game">celular</a></div></div>
    </article>`;};
const baseModels=models.filter(m=>ORDER.includes(m.id)),varModels=VARIANTS.map(id=>models.find(m=>m.id===id)).filter(Boolean);
const cards=baseModels.map(card).join("");
const varCards=varModels.map((m,i)=>card(m,i)).join("");
const matrix=`<table class="matrix"><thead><tr><th>tela</th>${models.map((m,i)=>`<th>${i+1}. ${m.name}</th>`).join("")}</tr></thead><tbody>${
  SCREENS.map(([s,l])=>`<tr><td>${l}</td>${models.map(m=>`<td><a href="${m.id}.html?screen=${s}">abrir</a></td>`).join("")}</tr>`).join("")}
  <tr><td>Jogo · retrato</td>${models.map(m=>`<td><a href="${m.id}.html?screen=game&mode=portrait">abrir</a></td>`).join("")}</tr>
  <tr><td>Jogo · paisagem</td>${models.map(m=>`<td><a href="${m.id}.html?screen=game&mode=landscape">abrir</a></td>`).join("")}</tr>
  <tr><td>Bench (pior caso)</td>${models.map(m=>`<td><a href="${m.id}.html?bench">${bench[m.id]?bench[m.id].heavy+" ms":"rodar"}</a></td>`).join("")}</tr></tbody></table>`;
fs.writeFileSync(path.join(OUT,"index.html"),`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>warspace.io v2 — ${models.length} modelos de layout</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0b0e14;color:#e6edf6;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;padding:44px 24px 60px}
.wrap{max-width:1180px;margin:0 auto}
h1{font-size:32px;letter-spacing:-.5px}
.sub{color:#8b9bb4;margin:8px 0 6px;font-size:15px;line-height:1.6;max-width:900px}
.keys{color:#63738c;font-size:13px;margin-bottom:28px;line-height:1.8}
.keys b{color:#9fb0c8;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:18px}
.card{display:flex;flex-direction:column;background:#141a24;border:1px solid #202a38;border-radius:14px;overflow:hidden;transition:.15s}
.card:hover{border-color:#3d5a80;transform:translateY(-2px)}
.thumbs{display:grid;grid-template-columns:1fr 1fr 1fr .55fr;gap:3px;background:linear-gradient(135deg,var(--a),var(--b));padding:3px}
.th{display:block;aspect-ratio:16/10;background:#0b0e14;overflow:hidden;font-size:11px;color:#8b9bb4;display:flex;align-items:center;justify-content:center;text-decoration:none}
.th.portrait{aspect-ratio:auto}
.th img{width:100%;height:100%;object-fit:cover;object-position:top}
.body{padding:14px 16px 16px}
.body h2{font-size:18px;margin-bottom:5px;display:flex;align-items:center;gap:10px}
.body h2 .n{display:inline-flex;width:26px;height:26px;border-radius:8px;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--a),var(--b));color:rgba(0,0,0,.6);font-size:14px;font-weight:800}
.body p{font-size:13px;color:#8b9bb4;line-height:1.5}
.tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.tags span{font-size:11px;padding:3px 8px;border-radius:999px;background:#1c2432;color:#9fb0c8}
.tags .bench{background:#12321e;color:#7CFC00;font-family:monospace}
.links{display:flex;gap:14px;margin-top:12px;font-size:12.5px}
.links a{color:#7fa4ff;text-decoration:none}.links .go{color:#fff;font-weight:600}
h3{margin:40px 0 12px;font-size:18px}
h3.r2{margin-top:10px;color:#ffc22e}
.matrix{border-collapse:collapse;font-size:13px;width:100%}
.matrix th,.matrix td{border:1px solid #202a38;padding:7px 10px;text-align:left}
.matrix th{background:#141a24;color:#9fb0c8;font-weight:600}
.matrix a{color:#7fa4ff;text-decoration:none}
footer{margin-top:34px;color:#4d5b70;font-size:12.5px;line-height:1.8}
footer a{color:#7fa4ff}
</style>
</head>
<body><div class="wrap">
<h1>warspace.io v2 — ${models.length} modelos de layout</h1>
<p class="sub">Cada modelo é uma demo jogável (mesma simulação, mesmos dados falsos) com <b>todas as 11 telas do jogo novo</b>: entrada, conta, salas, ranking, perfil, loja, preferências, jogo (desktop, retrato e paisagem), morte e reconexão. A física nova já aparece: inércia, quique entre planetas, asteroides e buracos negros.</p>
<p class="keys"><b>Na demo:</b> <b>E</b> entrada · <b>C</b> conta · <b>S</b> salas · <b>R</b> ranking · <b>P</b> perfil · <b>L</b> loja · <b>O</b> opções · <b>J</b> jogo · <b>K</b> morte · <b>X</b> reconectando · <b>T</b> desktop/retrato/paisagem · <b>1–6</b> ou <b>[ ]</b> trocar de modelo · <b>H</b> esconde a barra · <b>ESC</b> volta aqui<br>
<b>No jogo:</b> mouse mira · <b>ESPAÇO</b>/botão direito divide · <b>W</b> ejeta · <b>F</b>/clique míssil · no celular: arrastar mira + botões</p>
${varModels.length>1?`<h3 class="r2">Rodadas 2 e 3 — variações do Cartoon Cósmico (modelo escolhido)</h3>
<p class="sub">Mesma linguagem (tinta grossa, cores chapadas, sombras sólidas, folhas que sobem, botões redondos) em climas diferentes; o original fica como referência. <b>Rodada 3:</b> Crepúsculo sem sol + dois cruzamentos Crepúsculo × Cósmico (Anoitecer e Amanhecer).</p>
<div class="grid">${varCards}
</div>
<h3>Rodada 1 — os 6 modelos originais</h3>`:""}
<div class="grid">${cards}
</div>
<h3>Comparar a mesma tela em todos os modelos</h3>
${matrix}
<footer>Protótipos descartáveis em <code>mockups/v2/</code> — nada em <code>client/</code>, <code>server/</code> ou <code>k8s/</code> foi alterado. Os 7 modelos da rodada anterior continuam em <a href="../index.html">mockups/index.html</a>.<br>
Feedback por modelo × tela: <b>aprova</b> / <b>ajustar (o quê)</b> / <b>rejeita</b>, e "quero X deste em Y daquele" — vira a rodada híbrida.</footer>
</div></body></html>`);
console.log("ok  mockups/v2/index.html");

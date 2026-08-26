#!/usr/bin/env node
// ── porta o CSS dos mockups aprovados para client/src/theme/<id>/ ─────────────
// Lê mockups/v2/src/theme.toon-<mockup>.js num sandbox (como build.js faz), pega
// THEME.tokens e THEME.css e escreve:
//   client/src/theme/<id>/tokens.css   html[data-theme="<id>"]{--bg:…} + color-scheme
//   client/src/theme/<id>/hud.css      seção HUD + regras MOBILE que tocam o HUD
//   client/src/theme/<id>/screens.css  BASE / ENTRADA / … / RECONN + resto do MOBILE
//   client/src/styles/base.css         mockups/v2/src/base.css sem #devbar e sem a moldura de aparelho
// Todo seletor do tema ganha o prefixo `:where(html[data-theme="<id>"])`: o :where
// tem especificidade zero, então a cascata entre base.css (sem prefixo) e o CSS do
// tema fica IDÊNTICA à do mockup (lá o tema também não tinha prefixo). Um prefixo
// "html[data-theme=x]" comum somaria (0,1,1) só ao tema e viraria empates que o
// mockup não tinha (ex.: .room-row do tema passaria por cima do mobile do base).
// @keyframes viram <id>-nome (e as referências em animation/animation-name também);
// blocos @media/@supports têm os seletores internos prefixados.
// uso: node client/src/theme/port.js            → os três temas + base.css
//      node client/src/theme/port.js dawn        → só um
import fs from "node:fs";import path from "node:path";import vm from "node:vm";import {fileURLToPath} from "node:url";
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,"..","..",".."),SRC=path.join(ROOT,"mockups","v2","src");
const MAP={dawn:"toon-dawn",sunset:"toon-sunset",dusk:"toon-dusk"};
const read=f=>fs.readFileSync(path.join(SRC,f),"utf8");

function loadTheme(mock){
  const ctx={window:{},document:undefined,console};ctx.window.window=ctx.window;vm.createContext(ctx);
  vm.runInContext(read("data.js"),ctx);const D=ctx.window.MOCKDATA;
  ctx.MOCK={u:{SKINS:D.SKINS,RARITY:D.RARITY,RARITY_COLOR:D.RARITY_COLOR,RARITY_ORDER:D.RARITY_ORDER,DATA:D,WW:3000,WH:3000,mulberry:D.mulberry,
    sprite:()=>null,tier:r=>128,sh:()=>"",rgba:()=>"",clamp:(v,a,b)=>v,lerp:(a,b,t)=>a,rnd:()=>0,pick:a=>a[0]}};
  vm.runInContext(read(`theme.${mock}.js`),ctx);const T=ctx.window.THEME;if(!T)throw new Error("tema não definiu window.THEME: "+mock);return T;}

// ── mini parser de CSS (o CSS dos temas é plano: regras, comentários e no máximo @media/@keyframes) ──
function parse(css){const out=[];let i=0;const n=css.length;
  const skipWs=()=>{while(i<n&&/\s/.test(css[i]))i++;};
  const readComment=()=>{const j=css.indexOf("*/",i+2);const t=css.slice(i,j+2);i=j+2;return t;};
  const readBlock=()=>{let d=0,j=i,q=null;for(;j<n;j++){const ch=css[j];if(q){if(ch==="\\")j++;else if(ch===q)q=null;continue;}
      if(ch==='"'||ch==="'")q=ch;else if(ch==="{")d++;else if(ch==="}"){d--;if(d===0)break;}}
    const t=css.slice(i+1,j);i=j+1;return t;};
  while(i<n){skipWs();if(i>=n)break;
    if(css.startsWith("/*",i)){out.push({kind:"comment",text:readComment()});continue;}
    let j=i,q=null;for(;j<n;j++){const ch=css[j];if(q){if(ch==="\\")j++;else if(ch===q)q=null;continue;}if(ch==='"'||ch==="'")q=ch;else if(ch==="{")break;if(ch===";"&&!q){break;}}
    if(j>=n)break;
    if(css[j]===";"){out.push({kind:"at",text:css.slice(i,j+1)});i=j+1;continue;}   // @import x;
    const head=css.slice(i,j).trim();i=j;const body=readBlock();
    if(head.startsWith("@")){const m=/^@(-webkit-)?keyframes\s+([\w-]+)/.exec(head);
      if(m)out.push({kind:"keyframes",prefix:m[1]||"",name:m[2],body});
      else out.push({kind:"atblock",head,rules:parse(body)});}
    else out.push({kind:"rule",selector:head,body});}
  return out;}

// divide lista de seletores em vírgulas de nível zero (fora de parênteses/strings)
function splitSel(s){const parts=[];let d=0,q=null,cur="";for(let i=0;i<s.length;i++){const ch=s[i];
    if(q){cur+=ch;if(ch==="\\"){cur+=s[++i];}else if(ch===q)q=null;continue;}
    if(ch==='"'||ch==="'"){q=ch;cur+=ch;continue;}
    if(ch==="(")d++;else if(ch===")")d--;
    if(ch===","&&d===0){parts.push(cur);cur="";}else cur+=ch;}
  parts.push(cur);return parts.map(p=>p.trim()).filter(Boolean);}
const prefixSel=(sel,id)=>{if(/^:root\b/.test(sel))return sel.replace(/^:root/,`html[data-theme="${id}"]`);
  if(/^html\b/.test(sel))return sel.replace(/^html/,`html[data-theme="${id}"]`);
  return`:where(html[data-theme="${id}"]) ${sel}`;};
function serialize(nodes,id,kf){let s="";for(const nd of nodes){
    if(nd.kind==="comment")s+=nd.text+"\n";
    else if(nd.kind==="at")s+=nd.text+"\n";
    else if(nd.kind==="keyframes")s+=`@${nd.prefix}keyframes ${id}-${nd.name}{${nd.body}}\n`;
    else if(nd.kind==="atblock")s+=`${nd.head}{\n${serialize(nd.rules,id,kf)}}\n`;
    else{let body=nd.body;for(const k of kf)body=body.replace(new RegExp(`(animation(?:-name)?\\s*:[^;]*?)\\b${k}\\b`,"g"),`$1${id}-${k}`);
      s+=splitSel(nd.selector).map(x=>prefixSel(x,id)).join(",")+"{"+body+"}\n";}}
  return s;}
function keyframeNames(nodes){const out=[];for(const nd of nodes){if(nd.kind==="keyframes")out.push(nd.name);if(nd.kind==="atblock")out.push(...keyframeNames(nd.rules));}return out;}

// seções "/* ── NOME ── */" → {NOME:[nodes]}
function sections(nodes){const out={};let cur="BASE";for(const nd of nodes){
    const m=nd.kind==="comment"&&/^\/\*\s*──\s*([A-ZÀ-Ü]+)\s*──\s*\*\/$/.exec(nd.text.trim());
    if(m){cur=m[1];(out[cur]=out[cur]||[]);continue;}(out[cur]=out[cur]||[]).push(nd);}
  return out;}
const HUD_RE=/#hud|#lb-rows|\.lb-|\.score-|#touch|\.tbtn|#t-(split|eject|fire|ammo)|#h-(exit|room|net)|\.pw\b|#cd-|\.cd\b/;
const touchesHud=nd=>nd.kind==="rule"?HUD_RE.test(nd.selector):nd.kind==="atblock"?nd.rules.some(touchesHud):false;

const kebab=s=>s.replace(/([A-Z])/g,m=>"-"+m.toLowerCase());
function port(id){const mock=MAP[id],T=loadTheme(mock),dir=path.join(HERE,id);fs.mkdirSync(dir,{recursive:true});
  const hdr=(what)=>`/* ${what} — gerado por client/src/theme/port.js a partir de mockups/v2/src/theme.${mock}.js ("${T.name}"). NÃO EDITE À MÃO: rode \`node client/src/theme/port.js ${id}\`. */\n`;
  const tk=T.tokens||{};
  fs.writeFileSync(path.join(dir,"tokens.css"),hdr("tokens")+`html[data-theme="${id}"]{\n`+Object.keys(tk).map(k=>`  --${kebab(k)}:${tk[k]};`).join("\n")+`\n  color-scheme:dark;\n}\n`);
  const nodes=parse(T.css||""),kf=keyframeNames(nodes),S=sections(nodes);
  const order=Object.keys(S);
  const hud=[],screens=[];
  for(const sec of order){const list=S[sec];
    if(sec==="HUD")hud.push({kind:"comment",text:"/* ── HUD ── */"},...list);
    else if(sec==="MOBILE"){const h=list.filter(touchesHud),s=list.filter(nd=>!touchesHud(nd));
      if(h.length)hud.push({kind:"comment",text:"/* ── MOBILE (HUD) ── */"},...h);
      if(s.length)screens.push({kind:"comment",text:"/* ── MOBILE ── */"},...s);}
    else screens.push({kind:"comment",text:`/* ── ${sec} ── */`},...list);}
  fs.writeFileSync(path.join(dir,"hud.css"),hdr("HUD in-game")+serialize(hud,id,kf));
  fs.writeFileSync(path.join(dir,"screens.css"),hdr("telas")+serialize(screens,id,kf));
  const sty=`/* ${T.name} (${id}) — ordem: tokens, telas, HUD (a mesma do mockup: BASE…RECONN vêm antes de HUD nos seletores que se cruzam; MOBILE fica no fim de cada arquivo) */\n@import "./tokens.css";\n@import "./screens.css";\n@import "./hud.css";\n`;
  fs.writeFileSync(path.join(dir,"styles.css"),sty);
  const count=n=>n.reduce((s,nd)=>s+(nd.kind==="rule"?1:nd.kind==="atblock"?count(nd.rules):0),0);
  console.log(`ok  client/src/theme/${id}/  tokens=${Object.keys(tk).length} hud=${count(hud)} screens=${count(screens)} keyframes=${kf.length}`);}

function portBase(){const src=read("base.css").split("\n"),out=[];let skip=null;
  for(const l of src){
    if(l.startsWith("/* aparelho móvel")){skip="frame";continue;}
    if(l.startsWith("/* ── barra de desenvolvimento")){skip="devbar";continue;}
    if(skip==="frame"){if(l.trim()==="")skip=null;continue;}
    if(skip==="devbar")continue;
    out.push(l);}
  let txt=out.join("\n").replace(/\n+$/,"")+"\n";
  txt=txt.replace(/^\/\* ── BASE v2 ──[\s\S]*?\*\//,`/* ── BASE v2 ── só estrutura/layout. Toda a aparência (cores, fontes, bordas,
   sombras, posições finais do HUD) vem do CSS do tema (client/src/theme/<id>/),
   que pode sobrescrever qualquer regra daqui. Variáveis --bg, --accent… vêm de
   client/src/theme/<id>/tokens.css. Portado de mockups/v2/src/base.css sem o
   #devbar e sem a moldura de "aparelho": aqui a viewport É o aparelho — o app
   seta body[data-mode="portrait"|"landscape"] a partir de innerWidth/innerHeight.
   Regenerar: node client/src/theme/port.js (também reescreve este arquivo). ── */`);
  const dst=path.join(HERE,"..","styles","base.css");fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,txt);
  console.log("ok  client/src/styles/base.css  "+out.length+" linhas");}

const only=process.argv[2];
if(only&&!MAP[only]){console.error("tema desconhecido: "+only+" (use dawn|sunset|dusk)");process.exit(1);}
for(const id of only?[only]:Object.keys(MAP))port(id);
if(!only)portBase();

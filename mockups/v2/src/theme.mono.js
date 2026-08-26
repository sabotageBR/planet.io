// ── MODELO 5 — MÍNIMO ─────────────────────────────────────────────────────────
// Quase monocromático, sem painéis: toda informação é texto grande e fio de 1px
// direto sobre o fundo. Um único acento ácido (#d6ff3c). HUD em texto: placar
// como lista no canto superior esquerdo, SUA MASSA como numeral gigante à direita,
// cooldowns como linhas de 2px sob o numeral, minimapa como retângulo de fio.
// Menus: listas de sangria total com fios horizontais, títulos enormes à esquerda,
// navegação como coluna de links grandes. Mundo: discos chapados, comida = pontos,
// asteroide = contorno, buraco negro = círculos concêntricos, fx = arcos e linhas.
// É o modelo mais barato de desenhar: nenhum gradiente, nenhuma sombra, nenhum sprite.
(function(){
const u=MOCK.u,WW=u.WW,WH=u.WH,rgba=u.rgba;
const BG="#0e0e11",TX="#f2f2f2",MU="#8a8a93",LN="#26262c",AC="#d6ff3c",DG="#ff5470",DOT="#1c1c22",STAR="#34343c";
const TRA="rgba(214,255,60,.5)",TRW="rgba(242,242,242,.22)",EDGE="rgba(242,242,242,.28)";
const T=900;let ST=[],S=.5,HL=2,H2=4;

// ── cores chapadas (dessatura ~15%; cache por cor) ────────────────────────────
const FLAT=new Map();
function flat(hex){let v=FLAT.get(hex);if(v)return v;
  const n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255,L=r*.3+g*.59+b*.11,k=.15;
  v=`rgb(${Math.round(r+(L-r)*k)},${Math.round(g+(L-g)*k)},${Math.round(b+(L-b)*k)})`;FLAT.set(hex,v);return v;}
const AST_SEED=[11,18,25],AST_N=[9,11,13];

window.THEME={
id:"mono",name:"Mínimo",
desc:"Quase monocromático e sem painéis: texto grande, fios de 1px e um único acento ácido. Placar em lista, massa como numeral gigante, cooldowns como linhas, minimapa de fio. Menus de sangria total com títulos enormes. O modelo mais legível e o mais barato de desenhar.",
tags:["mínimo","texto","hardcore","leve"],swatch:["#d6ff3c","#0e0e11"],
tokens:{bg:"#0e0e11",surface:"transparent",text:"#f2f2f2",muted:"#8a8a93",accent:"#d6ff3c",accent2:"#ffffff",danger:"#ff5470",ok:"#d6ff3c",
  line:"#26262c",radius:"0",radiusLg:"0",space:"16px",fontUi:"system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif",fontMono:"'Courier New',Courier,monospace",
  shadow:"none"},
layout:{hud:"text",nav:"list"},
rarityColor:{free:"#8a8a93",common:"#c8c8d0",rare:"#7fb4ff",epic:"#c48cff",legendary:"#d6ff3c",earned:"#5ee6a0",secret:"#ff5470"},
labels:{title:"PLANET.IO",play:"JOGAR",playAuto:"JOGAR (AUTO)",respawn:"RENASCER",deadIcon:"",coinIcon:"¤",back:"← Início",botTag:"bot",regTag:"✓",tagline:"CONQUISTE A GALÁXIA — DIVIDA, EJETE, DEVORE"},

init(g){const rand=u.mulberry(5);ST=Array.from({length:70},()=>({x:rand()*T,y:rand()*T}));},

// ── fundo: preenchimento chapado + poucas estrelas de 1px ─────────────────────
drawBg(c,W,H,cam,t,g){S=cam.scale;HL=1/S;H2=2/S;
  c.fillStyle=BG;c.fillRect(0,0,W,H);
  if(g&&g.prefs&&!g.prefs.parallax)return;
  const f=.25,ox=((-cam.x*f*cam.scale)%T+T)%T,oy=((-cam.y*f*cam.scale)%T+T)%T;c.fillStyle=STAR;
  for(let i=0;i<ST.length;i++){const s=ST[i],bx=(s.x+ox)%T,by=(s.y+oy)%T;for(let x=bx;x<W;x+=T)for(let y=by;y<H;y+=T)c.fillRect(x|0,y|0,1,1);}},

// ── mundo: grade de pontos de 3px (só o que cabe na tela) + borda de fio ──────
drawWorld(c,cam,t,g,W,H){
  if(!g||!g.prefs||g.prefs.grid){const st=100,hw=W/(2*cam.scale),hh=H/(2*cam.scale);
    const x0=Math.max(0,Math.floor((cam.x-hw)/st)*st),x1=Math.min(WW,cam.x+hw),y0=Math.max(0,Math.floor((cam.y-hh)/st)*st),y1=Math.min(WH,cam.y+hh);
    c.fillStyle=DOT;for(let x=x0;x<=x1;x+=st)for(let y=y0;y<=y1;y+=st)c.fillRect(x-1.5,y-1.5,3,3);}
  c.strokeStyle=MU;c.lineWidth=HL;c.strokeRect(0,0,WW,WH);},

// ── comida: pontos; power-up/míssil = ponto de acento com quadrado de fio ─────
drawFood(c,f,t){const ty=f.type;
  if(ty==="missile_ammo"||ty.indexOf("powerup_")===0){const s=f.r*.5;c.fillStyle=AC;c.fillRect(f.x-s/2,f.y-s/2,s,s);
    if(ty!=="missile_ammo"){c.strokeStyle=AC;c.lineWidth=HL;c.strokeRect(f.x-f.r,f.y-f.r,f.r*2,f.r*2);}return;}
  const s=Math.max(3,f.r*.42);c.fillStyle=ty==="star"||ty==="comet"?TX:MU;c.fillRect(f.x-s/2,f.y-s/2,s,s);},
drawEjected(c,e){const s=Math.max(4,e.r*.6);c.fillStyle=TX;c.fillRect(e.x-s/2,e.y-s/2,s,s);},

// ── asteroide: só o contorno do polígono, girando ─────────────────────────────
drawAsteroid(c,a,t){c.save();c.translate(a.x,a.y);c.rotate(a.rot);const v=a.variant%3;
  c.strokeStyle=MU;c.lineWidth=1.5/S;u.astPoly(c,a.r,AST_SEED[v],AST_N[v]);c.stroke();c.restore();},

// ── buraco negro: 4 círculos finos concêntricos + centro preto; o de dentro gira ─
drawBlackHole(c,h,t){const k=h.k,rc=h.rc*k,ri=h.ri*k;c.lineWidth=HL;
  c.strokeStyle="rgba(138,138,147,.3)";c.setLineDash([6/S,10/S]);c.beginPath();c.arc(h.x,h.y,ri,0,6.283);c.stroke();c.setLineDash([]);
  c.strokeStyle="rgba(242,242,242,.14)";c.beginPath();c.arc(h.x,h.y,rc*3.2,0,6.283);c.stroke();
  c.strokeStyle="rgba(242,242,242,.32)";c.beginPath();c.arc(h.x,h.y,rc*2,0,6.283);c.stroke();
  c.fillStyle="#000";c.beginPath();c.arc(h.x,h.y,rc,0,6.283);c.fill();
  c.strokeStyle=TX;c.lineWidth=H2;c.beginPath();c.arc(h.x,h.y,rc*1.18,h.spin,h.spin+5.5);c.stroke();},

// ── rastro: uma polilinha de 1px com alfa ─────────────────────────────────────
drawTrail(c,pc,p,isMe){if(!u.trailPath(c,pc))return;c.strokeStyle=isMe?TRA:TRW;c.lineWidth=HL;c.lineJoin="round";c.stroke();},

// ── míssil: traço de rastro + ponto + seta na direção ─────────────────────────
drawMissile(c,m,t){const tr=m.trail;
  if(tr.length>1){c.strokeStyle="rgba(255,84,112,.45)";c.lineWidth=HL;c.beginPath();c.moveTo(tr[0].x,tr[0].y);for(let i=1;i<tr.length;i++)c.lineTo(tr[i].x,tr[i].y);c.lineTo(m.x,m.y);c.stroke();}
  const a=Math.atan2(m.vy,m.vx);c.fillStyle=DG;c.beginPath();c.arc(m.x,m.y,m.r*.45,0,6.283);c.fill();
  c.strokeStyle=DG;c.lineWidth=H2;c.beginPath();c.moveTo(m.x,m.y);c.lineTo(m.x+Math.cos(a)*m.r*1.8,m.y+Math.sin(a)*m.r*1.8);c.stroke();},

// ── planeta: disco chapado + fio de borda; anel de acento só para "você" ──────
drawCell(c,pc,p,isMe,t,prev,g){
  const r=pc.displayR||pc.r,sk=p.skin,pr=(g&&g.prefs)||{names:true,mass:true},x=pc.x,y=pc.y;
  c.fillStyle=flat(sk.color);c.beginPath();c.arc(x,y,r,0,6.283);c.fill();
  c.strokeStyle=EDGE;c.lineWidth=HL;c.stroke();
  if(sk.ring){c.strokeStyle=rgba(sk.glow||sk.color,.55);c.lineWidth=HL;c.beginPath();c.ellipse(x,y,r*1.55,r*.42,0,0,6.283);c.stroke();}
  if(isMe){c.strokeStyle=AC;c.lineWidth=H2;c.beginPath();c.arc(x,y,r+4/S,0,6.283);c.stroke();}
  if(pc.mergeTimer>0){c.strokeStyle=MU;c.lineWidth=HL;c.beginPath();c.arc(x,y,r+9/S,-1.5708,-1.5708+(1-pc.mergeTimer/u.mergeTime(pc.r))*6.283);c.stroke();}
  const pw=Object.keys(p._powerups||{});
  if(pw.length){c.strokeStyle=AC;c.lineWidth=HL;c.setLineDash([r*.3,r*.2]);
    for(let i=0;i<pw.length;i++){c.beginPath();c.arc(x,y,r*(1.22+i*.14),t*.001,t*.001+6.283);c.stroke();}c.setLineDash([]);}
  if(!prev&&r>13){const fs=Math.max(11,r*.3),both=pr.names!==false&&pr.mass!==false;
    c.textAlign="center";c.textBaseline="middle";c.lineJoin="round";c.strokeStyle=BG;c.lineWidth=2.5/S;
    if(pr.names!==false){c.font=`600 ${fs}px system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif`;const nm=p.name+(p.registered?" ✓":""),ny=both?y-fs*.32:y;
      c.strokeText(nm,x,ny);c.fillStyle=TX;c.fillText(nm,x,ny);}
    if(pr.mass!==false){c.font=`${fs*.72}px 'Courier New',Courier,monospace`;const ms=u.fmt(pc.r*pc.r),my=both?y+fs*.62:y;
      c.strokeText(ms,x,my);c.fillStyle=isMe?AC:MU;c.fillText(ms,x,my);}}},

// ── efeitos: só arcos e linhas ────────────────────────────────────────────────
drawFx(c,f,t){const k=f.age/f.ttl,a=(1-k).toFixed(2),W=`rgba(242,242,242,${a})`;c.lineWidth=H2;
  switch(f.t){
    case "bounce":c.strokeStyle=W;c.beginPath();c.arc(f.x,f.y,f.r*(.3+k*.9),0,6.283);c.stroke();break;
    case "pop":case "shoot":c.strokeStyle=W;c.lineWidth=HL;c.beginPath();
      for(let i=0;i<6;i++){const an=i*1.0472+k*.4,cs=Math.cos(an),sn=Math.sin(an),r0=f.r*(1+k*.6),r1=f.r*(1.5+k*2.2);c.moveTo(f.x+cs*r0,f.y+sn*r0);c.lineTo(f.x+cs*r1,f.y+sn*r1);}c.stroke();break;
    case "eat":c.strokeStyle=`rgba(214,255,60,${a})`;c.lineWidth=HL;c.beginPath();c.arc(f.x,f.y,f.r*(1.6-k),0,6.283);c.stroke();break;
    case "suck":c.strokeStyle=W;c.beginPath();c.arc(f.x,f.y,f.r*(3-k*2.6),0,6.283);c.stroke();break;
    case "exit":case "split":case "merge":c.strokeStyle=W;c.beginPath();c.arc(f.x,f.y,f.r*(.6+k*1.5),0,6.283);c.stroke();break;
    case "chip":c.strokeStyle=W;c.lineWidth=HL;c.beginPath();
      for(let i=-1;i<=1;i+=2){const an=Math.atan2(f.ny,f.nx)+i*.45;c.moveTo(f.x,f.y);c.lineTo(f.x+Math.cos(an)*f.r*3*k,f.y+Math.sin(an)*f.r*3*k);}c.stroke();break;
    case "boom":c.strokeStyle=`rgba(255,84,112,${a})`;c.lineWidth=3/S;c.beginPath();c.arc(f.x,f.y,f.r*(.5+k*2),0,6.283);c.stroke();break;
    case "rock":c.strokeStyle=`rgba(138,138,147,${(1-k)*.6})`;c.lineWidth=HL;c.beginPath();c.arc(f.x,f.y,f.r*.4*(1+k),0,6.283);c.stroke();break;}},

// ── HUD em canvas: só o minimapa (retângulo de fio + pontos) ──────────────────
drawHud(c,W,H,g,t,mode){
  if(g.prefs&&!g.prefs.minimap)return;
  const MS=mode==="portrait"?84:mode==="landscape"?76:140,MP=mode==="desktop"?20:16;
  const mx=W-MS-MP,my=mode==="desktop"?H-MS-MP:H-MS-MP-68;
  c.fillStyle="rgba(14,14,17,.7)";c.fillRect(mx,my,MS,MS);
  c.strokeStyle=MU;c.lineWidth=1;c.strokeRect(mx+.5,my+.5,MS,MS);
  u.minimap(c,mx,my,MS,g,{me:AC,player:TX,bot:MU,ast:"#44444d",hole:"rgba(255,84,112,.55)",view:"rgba(138,138,147,.4)"});
  c.font="10px 'Courier New',Courier,monospace";c.fillStyle=MU;c.textAlign="right";c.textBaseline="bottom";c.fillText("MAPA",mx+MS,my-4);},

paintSkin(c,sk,r){c.fillStyle=flat(sk.color);c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.strokeStyle=EDGE;c.lineWidth=1;c.stroke();
  if(sk.ring){c.strokeStyle=rgba(sk.glow||sk.color,.7);c.lineWidth=1.5;c.beginPath();c.ellipse(0,0,r*1.5,r*.42,0,0,6.283);c.stroke();}},

css:`
/* ── BASE ── */
body{font-family:var(--font-ui);font-variant-numeric:tabular-nums;color:var(--text)}
button,input,select{font-variant-numeric:tabular-nums}
.card,.panel{background:none;border:0;padding:0;color:var(--text);border-radius:0;box-shadow:none}
.ph{font-size:11px;letter-spacing:3px;color:var(--muted);font-family:var(--font-mono);text-transform:uppercase;border-bottom:1px solid var(--line);padding-bottom:6px;margin-bottom:6px}
.hint{font-size:11px;color:var(--muted);font-family:var(--font-mono);line-height:1.6}
.dim{color:var(--muted);opacity:1}
.reg{color:var(--accent);font-size:.85em}
.bot{color:var(--muted);font-size:.75em;letter-spacing:1px}
.code,.mono{font-family:var(--font-mono)}
.coinbar{font-family:var(--font-mono);font-size:13px;color:var(--muted);gap:5px}
.coinbar b{color:var(--text);font-weight:400}
.coinbar span{font-size:11px;letter-spacing:2px;text-transform:uppercase}
.btn-primary{width:auto;background:var(--accent);color:#000;border-radius:0;padding:14px 32px;font-size:15px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;line-height:1}
.btn-primary:hover{background:#fff}
.btn-secondary{width:auto;background:none;color:var(--text);border-radius:0;border-bottom:1px solid var(--accent);padding:4px 0;font-size:14px;line-height:1.2}
.btn-secondary:hover{color:var(--accent)}
.btn-mini{color:var(--accent);border-bottom:1px solid var(--accent);border-radius:0;padding:2px 0;font-size:13px;white-space:nowrap;line-height:1.2}
.btn-mini:hover{color:#fff;border-color:#fff}
.btn-link{color:var(--accent);border-bottom:1px solid var(--accent);font-size:12px;padding:1px 0}
.field label{font-size:11px;color:var(--muted);letter-spacing:2px;font-family:var(--font-mono);text-transform:uppercase}
.field input,.code-row input{background:none;border:0;border-bottom:1px solid var(--muted);border-radius:0;padding:8px 0;font-size:22px;color:var(--text);outline:none}
.field input:focus,.code-row input:focus{border-bottom-color:var(--accent)}
select{background:var(--bg);border:0;border-bottom:1px solid var(--muted);border-radius:0;padding:4px 0;color:var(--text);font-family:var(--font-mono);font-size:13px;outline:none}
.seg{gap:18px;border:0;border-radius:0;background:none}
.seg button{padding:4px 0;font-size:14px;color:var(--muted);border-bottom:1px solid transparent}
.seg button.on{color:var(--accent);border-bottom-color:var(--accent)}
.toggles{gap:36px;border-bottom:1px solid var(--line);padding-bottom:10px}
.wrap{width:100%;max-width:1280px;gap:18px 40px}
.screen{background:var(--bg);padding:36px 48px}
.nav{flex-direction:column;flex-wrap:nowrap;gap:2px;align-items:flex-start;padding:4px 24px 0 0;border-right:1px solid var(--line);align-self:stretch}
.nav-btn{padding:5px 0;border-radius:0;color:var(--muted);font-size:20px;font-weight:600;letter-spacing:-.3px;line-height:1.1}
.nav-btn:hover{color:var(--text)}
.nav-btn.on{color:var(--accent)}
.sh{align-items:flex-end;gap:24px;border-bottom:1px solid var(--line);padding-bottom:14px}
.sh .back{display:none}
.sh .stitle{font-size:60px;font-weight:700;letter-spacing:-3px;line-height:.95;color:var(--text)}
th{font-size:11px;letter-spacing:2px;color:var(--muted);font-family:var(--font-mono);font-weight:400;text-transform:uppercase;border-bottom:1px solid var(--line);padding:8px}
td{font-size:14px;font-family:var(--font-mono);border-bottom:1px solid var(--line);padding:9px 8px}
#toast{background:var(--accent);color:#000;border-radius:0;font-family:var(--font-mono);font-size:12px;letter-spacing:2px;text-transform:uppercase;padding:8px 14px}
/* ── HUD ── */
#hud-top{top:auto;bottom:20px;left:20px;gap:22px}
#hud-top .chip{font-family:var(--font-mono);font-size:12px;color:var(--muted);padding:0;border:0;background:none;gap:4px}
#hud-top .chip i{font-size:11px;letter-spacing:1px;text-transform:uppercase}
#hud-top .chip b{color:var(--text);font-weight:400}
#h-exit{font-size:12px;font-family:var(--font-mono);letter-spacing:1px;text-transform:uppercase}
#hud-lb{top:20px;left:20px;right:auto;min-width:240px;font-family:var(--font-mono)}
#hud-lb .ph{margin-bottom:6px}
.lb-row{font-size:13px;color:var(--text);padding:3px 0;gap:12px}
.lb-pos{color:var(--muted)}
.lb-val{color:var(--muted);font-weight:400}
.lb-row.mine,.lb-row.mine .lb-pos,.lb-row.mine .lb-val{color:var(--accent)}
#hud-score{top:20px;right:20px;left:auto;bottom:auto;min-width:0;text-align:right}
.score-big{font-size:56px;font-weight:700;letter-spacing:-2.5px;color:var(--text);line-height:.95}
.score-sub{font-size:11px;color:var(--muted);letter-spacing:3px;font-family:var(--font-mono);margin:4px 0 6px}
.score-row{justify-content:flex-end;font-size:11px;color:var(--muted);font-family:var(--font-mono);line-height:1.5}
.score-row .k{letter-spacing:1px}
.score-row b{color:var(--text);font-weight:400}
#hud-cd{top:150px;right:20px;left:auto;bottom:auto;flex-direction:column;gap:8px;width:170px}
.cd{width:100%;height:14px;flex-direction:row;justify-content:space-between;align-items:flex-start;overflow:visible;border:0;background:none;font-family:var(--font-mono);color:var(--muted)}
.cd::before{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--line)}
.cd .cd-fill{height:2px;background:var(--muted);z-index:1;transition:none}
.cd span{font-size:10px;letter-spacing:2px;font-weight:400}.cd em{font-size:10px;color:var(--muted)}
.cd.ready{color:var(--text)}.cd.ready .cd-fill{background:var(--accent)}
#hud-status{top:196px;right:20px;left:auto;bottom:auto;align-items:flex-end;gap:4px}
#hud-ammo{background:none;border:0;padding:0;font-family:var(--font-mono);font-size:12px;color:var(--text)}
#hud-ammo i{display:none}
#hud-ammo b{color:var(--accent);font-weight:400}
#hud-ammo span{font-size:11px;letter-spacing:1px;color:var(--muted);text-transform:uppercase}
#hud-ammo.empty{opacity:.4}
#hud-pw{justify-content:flex-end}
.pw{background:none;border:0;padding:0;font-size:11px;font-family:var(--font-mono);color:var(--muted);letter-spacing:1px}
.pw i{display:none}
.pw b{color:var(--accent);font-weight:400}
.tbtn{background:rgba(14,14,17,.75);border:1px solid var(--muted);border-radius:0;color:var(--text);font-family:var(--font-mono)}
#t-fire{border-color:var(--danger)}
#t-fire.empty{opacity:.4}
/* ── ENTRADA ── */
.entry-wrap{width:min(1080px,100%);grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:28px 72px}
.brand-block{align-items:flex-start;text-align:left;border-bottom:1px solid var(--line);padding-bottom:22px;gap:10px}
.brand{font-size:96px;font-weight:700;letter-spacing:-5px;line-height:.9;color:var(--text)}
.tagline{font-size:11px;color:var(--muted);letter-spacing:3px;font-family:var(--font-mono)}
.entry-main{align-items:stretch;gap:20px}
.entry-main .coinbar{align-self:flex-start}
.entry-main .field input{font-size:28px;font-weight:600;letter-spacing:-.5px}
.skinrow{border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:12px 0;border-radius:0;background:none}
.skinmeta b{font-size:18px;font-weight:600}.skinmeta i{font-style:normal;font-size:11px;letter-spacing:2px;font-family:var(--font-mono);text-transform:uppercase}
.entry-main .btn-primary{align-self:flex-start;padding:18px 44px;font-size:17px}
.entry-links{display:flex;gap:24px;width:auto;border-top:1px solid var(--line);padding-top:14px}
.entry-links .btn-secondary{padding:0;border:0;color:var(--muted);font-size:15px;font-weight:500}
.entry-links .btn-secondary:hover{color:var(--accent)}
.guest-note{justify-content:flex-start;font-size:12px;color:var(--muted);font-family:var(--font-mono)}
.guest-note[data-kind="registered"] .gn-txt{color:var(--accent)}
.entry-side{gap:4px;padding-top:2px}
.entry-side .mini-rank{margin-bottom:22px}
.mr-row{font-size:14px;font-family:var(--font-mono);color:var(--text);padding:6px 0;border-bottom:1px solid var(--line)}
.mr-pos,.mr-val{color:var(--muted)}
.mr-row .code{font-size:16px;letter-spacing:2px}
/* ── CONTA ── */
.overlay{background:rgba(14,14,17,.97)}
.modal{width:min(480px,100%);gap:16px}
.modal-title{font-size:56px;font-weight:700;letter-spacing:-3px;line-height:.95;color:var(--text)}
.tabs{gap:22px;border:0;border-bottom:1px solid var(--line);border-radius:0}
.tabs button{flex:none;padding:6px 0;margin-bottom:-1px;font-size:15px;color:var(--muted);border-bottom:1px solid transparent}
.tabs button.on{color:var(--accent);border-bottom-color:var(--accent);background:none;font-weight:600}
.modal-actions{gap:26px;align-items:center;justify-content:flex-start;padding-top:6px}
.modal-actions button{flex:none;width:auto}
/* ── LOBBY ── */
.lobby-wrap{grid-template-columns:200px minmax(0,1fr);grid-template-areas:"nav head" "nav hero" "nav list" "nav side"}
.lobby-hero{grid-template-columns:auto auto 1fr;grid-template-areas:"me play code" "me note code";gap:6px 32px;border-bottom:1px solid var(--line);padding:16px 0}
.me-chip b{font-size:22px;font-weight:600;letter-spacing:-.3px}.me-chip i{font-style:normal;font-size:11px;letter-spacing:2px;color:var(--muted);font-family:var(--font-mono);text-transform:uppercase}
.me-chip i[data-kind="registered"]{color:var(--accent)}
.me-chip canvas{width:48px;height:48px}
.lobby-hero .btn-primary{justify-self:start}
.lobby-hero .hint{font-size:11px}
.code-row{justify-self:end;align-self:center;align-items:flex-end;gap:20px}
.code-row input{flex:none;width:120px;font-family:var(--font-mono);font-size:24px;letter-spacing:5px;padding:4px 0}
.code-row .btn-secondary{flex:none;white-space:nowrap}
.code-row input::placeholder{font-size:11px;letter-spacing:2px;color:var(--muted)}
.room-row{grid-template-columns:110px 1fr 90px 100px;gap:16px;padding:12px 0;border-bottom:1px solid var(--line);font-family:var(--font-mono);font-size:14px;color:var(--text)}
.room-row .shard,.room-row .bots{display:none}
.room-row .code{font-size:24px;letter-spacing:3px;color:var(--text)}
.room-row.head{font-size:11px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;padding:6px 0}
.room-row.head .code{font-size:11px;letter-spacing:2px;color:var(--muted)}
.room-row .pl .bar{width:60px;height:2px;background:var(--line);color:var(--accent);border-radius:0}
.room-row .ping{color:var(--muted)}
.room-row:not(.head) .ping::after{content:" ms"}
.room-row.full{opacity:.4}
.room-row .act .btn-mini::after{content:" →"}
.lobby-side{padding-top:8px}
/* ── RANKING ── */
.rank-wrap{grid-template-columns:200px minmax(0,1fr);grid-template-areas:"nav head" "nav toggles" "nav table" "nav me"}
.rank-table{padding:0;max-height:56vh}
th.c-delta,td.c-delta{display:none}
#rk-table td.c-nick{font-family:var(--font-ui);font-size:15px}
#rk-table tr.me td{color:var(--accent)}
#rk-table tr.top .c-rank{color:var(--text)}
.rank-me{font-family:var(--font-mono);font-size:14px;color:var(--muted);padding:14px 0;border-bottom:1px solid var(--line);gap:16px}
.rank-me b{font-size:44px;font-weight:700;letter-spacing:-2px;line-height:1;color:var(--accent);font-family:var(--font-ui)}
/* ── PERFIL ── */
.profile-wrap{grid-template-columns:200px minmax(0,1fr) minmax(0,1fr);grid-template-areas:"nav head head" "nav phead phead" "nav stats stats" "nav hist ach"}
.profile-head{border-bottom:1px solid var(--line);padding-bottom:18px}
.profile-head canvas{width:64px;height:64px}
.pf-nick{font-size:36px;font-weight:700;letter-spacing:-1.5px;line-height:1}
.pf-kind{font-style:normal;font-size:11px;letter-spacing:2px;color:var(--muted);font-family:var(--font-mono);text-transform:uppercase}
.pf-kind[data-kind="registered"]{color:var(--accent)}
.stat-cards{gap:0;border-bottom:1px solid var(--line);padding-bottom:18px}
.stat{align-items:flex-start;text-align:left;padding:4px 16px 0 14px;border-left:1px solid var(--line)}
.stat b{font-size:36px;font-weight:700;letter-spacing:-1.5px;white-space:nowrap;line-height:1;color:var(--text)}
.stat i{font-style:normal;font-size:11px;letter-spacing:2px;color:var(--muted);font-family:var(--font-mono);text-transform:uppercase;margin-top:6px}
.pf-hist td{font-size:12.5px;padding:8px 6px}
.pf-hist td.cause{color:var(--muted)}
.pf-hist td.cause.blackhole{color:var(--danger)}.pf-hist td.cause i{font-style:normal;color:var(--text)}
.ach-grid{grid-template-columns:1fr;gap:0}
.ach{padding:9px 0;border-bottom:1px solid var(--line);opacity:.55;gap:12px}
.ach.done{opacity:1}
.ach.done b{color:var(--accent)}
.ach.secret{opacity:.3}
.ach-ico{display:none}
.ach b{font-size:14px;font-weight:600}.ach i{font-size:11px;color:var(--muted);font-family:var(--font-mono)}
.ach-bar{height:1px;background:var(--line);color:var(--accent);margin-top:6px;border-radius:0}
.ach-coins{font-style:normal;font-size:12px;color:var(--muted);font-family:var(--font-mono)}
/* ── LOJA ── */
.shop-wrap{grid-template-columns:200px minmax(0,1fr);grid-template-areas:"nav head" "nav eq" "nav filters" "nav grid" "nav note"}
.shop-eq{border-bottom:1px solid var(--line);padding-bottom:14px}
.shop-eq canvas{width:56px;height:56px}
.shop-eq .skinmeta b{font-size:22px}
.shop-eq .badge{position:static;margin-left:auto;background:none;color:var(--accent);font-size:11px;letter-spacing:2px;font-family:var(--font-mono);border-bottom:1px solid var(--accent);padding:2px 0;border-radius:0;font-weight:400}
.filters{gap:20px;border-bottom:1px solid var(--line);padding-bottom:10px}
.filters button{padding:3px 0;border:0;border-bottom:1px solid transparent;border-radius:0;font-size:13px;color:var(--muted)}
.filters button.on{color:var(--rc,var(--accent));border-bottom-color:var(--rc,var(--accent));background:none}
.shop-grid{grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:6px;max-height:none;overflow:visible;padding:8px 0 0}
.skin-card{padding:8px 4px 20px;gap:0;background:none;border:0;border-radius:0;color:var(--text)}
.skin-card canvas{width:60px;height:60px;border-radius:50%}
.skin-card::after{content:"";position:absolute;left:50%;bottom:9px;width:16px;height:2px;margin-left:-8px;background:var(--rc)}
.skin-card b,.skin-card i,.skin-card em{display:none;position:absolute;left:50%;transform:translateX(-50%);white-space:nowrap;background:var(--bg);padding:1px 6px;z-index:4;font-style:normal;pointer-events:none;line-height:1.2}
.skin-card:hover::after{display:none}
.skin-card:hover b{display:block;top:68px;font-size:12px;font-weight:600}
.skin-card:hover i{display:block;top:85px;font-size:11px;letter-spacing:1.5px;color:var(--rc);text-transform:uppercase}
.skin-card:hover em{display:block;top:100px;font-size:11px;color:var(--muted);font-family:var(--font-mono)}
.skin-card:hover canvas{outline:1px solid var(--muted);outline-offset:3px}
.skin-card.eq canvas,.skin-card.eq:hover canvas{outline:1px solid var(--accent);outline-offset:3px}
.skin-card .badge{display:none}
.skin-card.locked,.skin-card.secret{opacity:.3}.skin-card.poor{opacity:.6}
.skin-card.locked:hover,.skin-card.secret:hover,.skin-card.poor:hover{opacity:1}
.skin-card.poor:hover em{color:var(--danger)}
.shop-note{text-align:left;border-top:1px solid var(--line);padding-top:10px}
/* ── PREFS ── */
.prefs-wrap{width:100%;max-width:1280px;grid-template-columns:200px minmax(0,1fr);grid-template-areas:"nav head" "nav groups" "nav foot"}
.prefs-groups{grid-template-columns:1fr 1fr;gap:8px 56px}
.pg h2{font-size:11px;letter-spacing:3px;color:var(--muted);font-family:var(--font-mono);text-transform:uppercase;font-weight:400;border-bottom:1px solid var(--line);padding:16px 0 8px;margin-bottom:0}
.pref-row{border-bottom:1px solid var(--line);font-size:14px;padding:10px 0}
.toggle{width:18px;height:18px;border-radius:0;border:1px solid var(--muted);background:none;color:var(--accent)}
.toggle i{display:none}
.toggle[aria-checked="true"]{border-color:var(--accent);background:none}
.toggle[aria-checked="true"] i{display:block;top:3px;left:3px;width:10px;height:10px;border-radius:0;background:var(--accent)}
input[type=range]{accent-color:var(--accent)}
.range b{font-family:var(--font-mono);font-size:13px;color:var(--muted)}
.prefs-foot{justify-content:flex-start;align-items:center;gap:28px;padding-top:6px}
.prefs-foot .btn-primary{padding:14px 32px}
/* ── MORTE ── */
#s-dead.on{justify-content:flex-start;padding:36px 48px}
.dead-card{width:min(820px,100%);align-items:flex-start;gap:16px}
.dead-icon{display:none}
.dead-title{font-size:128px;font-weight:700;letter-spacing:-7px;line-height:.9;color:var(--text)}
.dead-sub{font-size:12px;color:var(--muted);font-family:var(--font-mono);letter-spacing:1px}
.dead-by{flex-direction:row;align-items:baseline;gap:14px;width:100%;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:14px 0}
.dead-by span{font-size:11px;color:var(--muted);letter-spacing:3px;font-family:var(--font-mono)}
.dead-by b{font-size:30px;font-weight:600;letter-spacing:-.5px;color:var(--accent)}
.dead-stats{gap:0;width:100%;flex-wrap:wrap}
.dead-stats div{align-items:flex-start;padding:4px 40px 4px 14px;border-left:1px solid var(--line)}
.dead-stats b{font-size:52px;font-weight:700;letter-spacing:-2.5px;line-height:1;color:var(--text)}
.dead-stats i{font-style:normal;font-size:11px;color:var(--muted);letter-spacing:2px;font-family:var(--font-mono);margin-top:6px}
.dead-rank{flex-direction:row;align-items:baseline;gap:14px;width:100%;border-top:1px solid var(--line);padding:14px 0 6px}
.dead-rank span{font-size:11px;color:var(--muted);letter-spacing:3px;font-family:var(--font-mono);text-transform:uppercase}
.dead-rank b{font-size:24px;font-weight:400;font-family:var(--font-mono);color:var(--text)}.dead-rank .arrow{color:var(--accent)}
.dead-actions{flex-direction:row;align-items:center;gap:30px;width:auto;margin-top:6px}
.dead-actions .btn-primary{padding:18px 44px;font-size:17px}
/* ── RECONN ── */
#s-reconn.overlay{background:rgba(14,14,17,.86)}
.reconn{flex-direction:row;align-items:center;gap:18px;width:auto;text-align:left;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:18px 24px}
.spinner{width:14px;height:14px;border:0;border-radius:0;background:var(--accent);animation:blink .8s steps(2,start) infinite}
@keyframes blink{to{visibility:hidden}}
.rc-title{font-size:18px;font-weight:600;letter-spacing:1px;color:var(--text);line-height:1}
.rc-sub{font-family:var(--font-mono);font-size:13px;color:var(--muted)}
.reconn .btn-secondary{width:auto}
/* ── MOBILE ── */
body[data-mode="portrait"] .screen,body[data-mode="landscape"] .screen{padding:20px 16px}
body[data-mode="portrait"] .wrap,body[data-mode="landscape"] .wrap{gap:14px}
body[data-mode="portrait"] .nav,body[data-mode="landscape"] .nav{flex-direction:row;flex-wrap:wrap;border:0;padding:0;gap:2px 16px}
body[data-mode="portrait"] .nav-btn,body[data-mode="landscape"] .nav-btn{font-size:15px}
body[data-mode="portrait"] .sh .stitle,body[data-mode="landscape"] .sh .stitle{font-size:38px;letter-spacing:-2px}
body[data-mode="portrait"] .sh,body[data-mode="landscape"] .sh{padding-bottom:10px}
body[data-mode="portrait"] .brand{font-size:56px;letter-spacing:-3px}
body[data-mode="landscape"] .brand{font-size:48px;letter-spacing:-2.5px}
body[data-mode="portrait"] .tagline{font-size:10px;letter-spacing:2px}
body[data-mode="portrait"] .entry-main .field input{font-size:22px}
body[data-mode="portrait"] .entry-links{flex-wrap:wrap;gap:8px 18px}
body[data-mode="portrait"] .entry-main .btn-primary{align-self:stretch;text-align:center}
body[data-mode="portrait"] .lobby-hero{grid-template-columns:1fr;grid-template-areas:"me" "play" "note" "code";gap:10px}
body[data-mode="portrait"] .lobby-hero .btn-primary{justify-self:stretch}
body[data-mode="portrait"] .code-row{justify-self:stretch;width:100%}
body[data-mode="portrait"] .room-row{grid-template-columns:82px 1fr 56px 76px;gap:10px}
body[data-mode="portrait"] .room-row.head .code{font-size:11px;letter-spacing:2px}
body[data-mode="portrait"] .room-row .code{font-size:20px;letter-spacing:2px}
body[data-mode="portrait"] .room-row .pl .bar{width:36px}
body[data-mode="portrait"] .stat-cards{grid-template-columns:repeat(3,1fr);row-gap:16px}
body[data-mode="portrait"] .stat b{font-size:30px}
body[data-mode="portrait"] .pf-nick{font-size:26px}
body[data-mode="portrait"] .shop-grid{grid-template-columns:repeat(4,1fr)}
body[data-mode="portrait"] .prefs-groups,body[data-mode="landscape"] .prefs-groups{grid-template-columns:1fr}
body[data-mode="portrait"] .modal-title{font-size:40px}
body[data-mode="portrait"] #s-dead.on,body[data-mode="landscape"] #s-dead.on{padding:20px 16px}
body[data-mode="portrait"] .dead-title{font-size:62px;letter-spacing:-3px}
body[data-mode="landscape"] .dead-title{font-size:54px;letter-spacing:-3px}
body[data-mode="portrait"] .dead-stats div,body[data-mode="landscape"] .dead-stats div{padding-right:22px}
body[data-mode="portrait"] .dead-stats b,body[data-mode="landscape"] .dead-stats b{font-size:32px;letter-spacing:-1.5px}
body[data-mode="portrait"] .dead-by b{font-size:22px}
body[data-mode="landscape"] .dead-card{gap:10px}
body[data-mode="portrait"] .reconn{flex-direction:column;gap:10px;padding:16px}
body[data-mode="portrait"] #hud-lb,body[data-mode="landscape"] #hud-lb{top:14px;left:14px;min-width:0;width:150px}
body[data-mode="portrait"] #hud-lb .ph,body[data-mode="landscape"] #hud-lb .ph{display:none}
body[data-mode="portrait"] .lb-row,body[data-mode="landscape"] .lb-row{font-size:11px;padding:2px 0;gap:8px}
body[data-mode="portrait"] #hud-score,body[data-mode="landscape"] #hud-score{top:12px;right:14px}
body[data-mode="portrait"] .score-big{font-size:40px;letter-spacing:-2px}
body[data-mode="landscape"] .score-big{font-size:34px;letter-spacing:-1.5px}
body[data-mode="portrait"] .score-sub,body[data-mode="landscape"] .score-sub{margin:2px 0 2px}
body[data-mode="portrait"] .score-row,body[data-mode="landscape"] .score-row{font-size:10px}
body[data-mode="landscape"] .score-row{display:none}
body[data-mode="portrait"] #hud-top{top:auto;left:14px;right:auto;bottom:130px;gap:14px}
body[data-mode="portrait"] #hud-top .chip{font-size:11px}
body[data-mode="landscape"] #hud-top{top:auto;bottom:88px;left:14px;gap:14px}
body[data-mode="landscape"] #hud-top .chip{font-size:11px}
body[data-mode="portrait"] #hud-status{top:auto;right:auto;left:14px;bottom:88px;align-items:flex-start}
body[data-mode="landscape"] #hud-status{top:auto;right:auto;left:14px;bottom:110px;align-items:flex-start}
body[data-mode="portrait"] #hud-pw,body[data-mode="landscape"] #hud-pw{justify-content:flex-start}
#touch{left:12px;right:12px;bottom:16px;justify-content:space-between;gap:10px;align-items:stretch}
body[data-mode="landscape"] #touch{left:auto;width:400px}
.tbtn{flex:1;width:auto;height:56px;flex-direction:row;gap:8px}
.tbtn span{font-size:12px;letter-spacing:2px}
.tbtn b{font-size:12px;color:var(--accent)}
.tbtn.cd{opacity:.4}
`};
})();

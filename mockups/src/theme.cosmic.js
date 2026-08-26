// ── MODELO 5 — CINEMATOGRÁFICO ────────────────────────────────────────────────
// A leitura do agar.io com acabamento caprichado: parallax de estrelas em 3
// camadas, nebulosas volumétricas, planetas com relevo e terminador, grão de
// filme e HUD de vidro.
//
// PERFORMANCE: o relevo do planeta (4 gradientes) e a comida com gradiente eram
// recalculados por objeto/quadro. Agora cada um é um sprite assado uma vez; as
// camadas de parallax e o grão também viram imagens em cache.
(function(){
const u=MOCK.u,WW=u.WW,WH=u.WH;
function sh(hex,a){let n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255;
  const f=x=>Math.max(0,Math.min(255,Math.round(a>0?x+(255-x)*a:x*(1+a))));return`rgb(${f(r)},${f(g)},${f(b)})`;}
function rgba(hex,a){const n=parseInt(hex.slice(1),16);return`rgba(${n>>16},${n>>8&255},${n&255},${a})`;}
const T=760,FK=2.0;
let L=[],NEB=[],neb=null,bg=null,bgW=0,bgH=0,grain=null,grW=0,grH=0,vig=null,vigW=0,vigH=0;

const LB={title:"🪐 PLANET.IO",tagline:"Conquiste a galáxia. Divida, ejete e devore.",
  coinIcon:"🪙",coinWord:"moedas",nameLabel:"Nome do seu planeta:",swap:"Trocar",
  play:"🚀 JOGAR",shop:"🛍️ LOJA DE SKINS",shopShort:"🛍️ Loja",shopTitle:"LOJA DE SKINS",
  shopNote:"12 skins de amostra — as 50 do jogo entram quando o modelo for aprovado.",
  hint:"🖱️ mouse = mover · ESPAÇO = dividir · W = ejetar · clique = míssil",
  back:"← Voltar",equipped:"EQUIPADA",owned:"Equipar",lbTitle:"PLACAR",massLabel:"massa total",
  youLabel:"planeta",killsWord:"abates",botTag:"🤖",dead:"ABSORVIDO",deadIcon:"💥",
  deadSub:"— a galáxia continua sem você —",eatenBy:"DEVORADO POR",respawn:"🔄 RENASCER",menu:"Menu"};

// ── sprites ───────────────────────────────────────────────────────────────────
const PK=sk=>sk.ring?2.35:1.62;                 // cobertura do sprite (anel/atmosfera)
function planetSpr(sk,isMe,size){
  return u.sprite("cp"+sk.id+(isMe?"m":"")+size,size,(c,R)=>{
    const K=PK(sk),r=R/K,col=sk.color;
    if(sk.ring){c.save();c.scale(1,.28);
      const rg=c.createRadialGradient(0,0,r*1.1,0,0,r*2.1);
      rg.addColorStop(0,rgba(col,.85));rg.addColorStop(.55,rgba(col,.4));rg.addColorStop(1,"rgba(0,0,0,0)");
      c.fillStyle=rg;c.beginPath();c.arc(0,0,r*2.1,0,6.283);c.arc(0,0,r*1.06,0,6.283,true);c.fill();c.restore();}
    const atmo=c.createRadialGradient(0,0,r*.75,0,0,r*1.45);
    atmo.addColorStop(0,rgba(col,0));atmo.addColorStop(.45,rgba(sk.glow||col,isMe?.5:.3));atmo.addColorStop(1,rgba(col,0));
    c.fillStyle=atmo;c.beginPath();c.arc(0,0,r*1.45,0,6.283);c.fill();
    const gd=c.createRadialGradient(-r*.35,-r*.4,r*.05,0,0,r*1.05);
    gd.addColorStop(0,sh(col,.5));gd.addColorStop(.45,col);gd.addColorStop(1,sh(col,-.62));
    c.fillStyle=gd;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
    c.save();c.beginPath();c.arc(0,0,r,0,6.283);c.clip();
    c.globalAlpha=.22;c.font=`${r*1.66}px serif`;c.textAlign="center";c.textBaseline="middle";
    c.fillText(sk.emoji,0,r*.05);c.globalAlpha=1;
    const hl=c.createRadialGradient(-r*.4,-r*.45,0,-r*.4,-r*.45,r*.75);
    hl.addColorStop(0,"rgba(255,255,255,.4)");hl.addColorStop(1,"rgba(255,255,255,0)");
    c.fillStyle=hl;c.fillRect(-r,-r,r*2,r*2);
    const term=c.createLinearGradient(r*.1,-r,r,r*.9);
    term.addColorStop(0,"rgba(0,0,0,0)");term.addColorStop(1,"rgba(0,0,10,.55)");
    c.fillStyle=term;c.fillRect(-r,-r,r*2,r*2);c.restore();
    c.strokeStyle=rgba(sk.glow||col,isMe?.9:.45);c.lineWidth=Math.max(1.5,r*.035);
    c.beginPath();c.arc(0,0,r*.99,0,6.283);c.stroke();});}

function foodSpr(f){
  return u.sprite("cf"+f.type+f.color,64,(c,R)=>{
    const r=R/FK;
    if(f.type==="missile_ammo"||f.type.indexOf("powerup_")===0){
      const gd=c.createRadialGradient(0,0,0,0,0,r);
      gd.addColorStop(0,"#fff");gd.addColorStop(.5,f.color);gd.addColorStop(1,rgba(f.color,.15));
      c.fillStyle=gd;c.shadowBlur=r*1.4;c.shadowColor=f.color;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
      c.shadowBlur=0;c.font=`${r*1.05}px serif`;c.textAlign="center";c.textBaseline="middle";
      c.fillText({missile_ammo:"🚀",powerup_speed:"⚡",powerup_magnet:"🧲",powerup_shield:"🛡️"}[f.type],0,1);return;}
    if(f.type==="comet"){const gd=c.createLinearGradient(-r*3.4,0,r,0);
      gd.addColorStop(0,"rgba(255,255,255,0)");gd.addColorStop(1,f.color);
      c.fillStyle=gd;c.beginPath();c.ellipse(-r*1.3,0,r*3,r*.32,0,0,6.283);c.fill();
      c.shadowBlur=r*.8;c.shadowColor="#fff";c.fillStyle="#fff";c.beginPath();c.arc(0,0,r*.55,0,6.283);c.fill();return;}
    if(f.type==="star"){c.shadowBlur=r*1.1;c.shadowColor=f.color;c.fillStyle=f.color;
      u.spikes(c,r*1.15,4,.32,0);c.fill();return;}
    const gd=c.createRadialGradient(-r*.3,-r*.3,0,0,0,r);
    gd.addColorStop(0,"#ffffff");gd.addColorStop(.25,f.color);gd.addColorStop(1,"rgba(0,0,0,.55)");
    c.fillStyle=gd;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();});}

const ejSpr=col=>u.sprite("ce"+col,48,(c,R)=>{const r=R/1.8;
  const gd=c.createRadialGradient(0,0,0,0,0,r);
  gd.addColorStop(0,"#fff");gd.addColorStop(.45,col);gd.addColorStop(1,"rgba(0,0,0,0)");
  c.shadowBlur=r*.9;c.shadowColor=col;c.fillStyle=gd;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();});

const virusSpr=()=>u.sprite("cv",256,(c,R)=>{const r=R/1.35;
  c.shadowBlur=r*.4;c.shadowColor="#00ff9d";
  const gd=c.createRadialGradient(0,0,r*.15,0,0,r);
  gd.addColorStop(0,"#9dffd8");gd.addColorStop(.5,"#00cc66");gd.addColorStop(1,"#053a20");
  c.fillStyle=gd;u.spikes(c,r,26,.72,0);c.fill();c.shadowBlur=0;
  c.strokeStyle="rgba(180,255,220,.35)";c.lineWidth=r*.02;u.spikes(c,r*.6,26,.72,.12);c.stroke();});

window.THEME={
id:"cosmic",name:"Cinematográfico",skins:u.SKINS,rarity:u.RARITY,
rarityColor:{free:"#8c9ab5",common:"#8fd6ff",rare:"#5b9dff",epic:"#c56bff",legendary:"#ffd166"},
labels:LB,

init(){
  const rand=u.mulberry(41);
  // cada camada de parallax vira um ladrilho pronto (antes: ~1000 fillRects/quadro)
  L=[.18,.42,.8].map((f,li)=>({f,stars:Array.from({length:li===2?45:90},()=>({
    x:rand()*T,y:rand()*T,r:li===2?1.6+rand()*1.6:.6+rand()*1.1,
    a:+((li===2?.55:.22)+rand()*.35).toFixed(2)}))}));
  NEB=[];const cols=["#3b5bff","#a855f7","#ff4d6d","#22d3ee","#7c3aed"];
  for(let i=0;i<16;i++)NEB.push({x:rand(),y:rand(),r:.22+rand()*.5,
    col:cols[i%cols.length],a:.10+rand()*.16});
  neb=document.createElement("canvas");neb.width=neb.height=1024;
  const c=neb.getContext("2d");c.globalAlpha=.85;
  [["#3b5bff",.30],["#a855f7",.26],["#ff4d6d",.16],["#22d3ee",.20],["#7c3aed",.22]].forEach(([col,al])=>{
    for(let i=0;i<7;i++){const x=rand()*1024,y=rand()*1024,r=140+rand()*300;
      const gd=c.createRadialGradient(x,y,0,x,y,r);
      gd.addColorStop(0,rgba(col,al));gd.addColorStop(.55,rgba(col,al*.35));gd.addColorStop(1,"rgba(0,0,0,0)");
      c.fillStyle=gd;c.beginPath();c.arc(x,y,r,0,6.283);c.fill();}});},

drawBg(c,W,H,cam){
  if(!bg||bgW!==W||bgH!==H){                               // gradiente do fundo em cache
    bgW=W;bgH=H;bg=document.createElement("canvas");bg.width=W;bg.height=H;
    const x=bg.getContext("2d");
    const gd=x.createRadialGradient(W*.5,H*.42,0,W*.5,H*.5,Math.max(W,H)*.9);
    gd.addColorStop(0,"#131a3a");gd.addColorStop(.5,"#080c1c");gd.addColorStop(1,"#03040a");
    x.fillStyle=gd;x.fillRect(0,0,W,H);
    const D=Math.max(W,H);
    NEB.forEach(n=>{const nx=n.x*W,ny=n.y*H,nr=n.r*D;
      const g2=x.createRadialGradient(nx,ny,0,nx,ny,nr);
      g2.addColorStop(0,rgba(n.col,n.a));g2.addColorStop(.5,rgba(n.col,n.a*.4));g2.addColorStop(1,"rgba(0,0,0,0)");
      x.fillStyle=g2;x.beginPath();x.arc(nx,ny,nr,0,6.283);x.fill();});}
  c.drawImage(bg,0,0);                                     // gradiente + nebulosa, um blit opaco
  c.fillStyle="#dfe8ff";
  L.forEach(l=>{const ox=((-cam.x*l.f*cam.scale)%T+T)%T,oy=((-cam.y*l.f*cam.scale)%T+T)%T;
    l.stars.forEach(s=>{c.globalAlpha=s.a;const bx=(s.x+ox)%T,by=(s.y+oy)%T;
      for(let x=bx;x<W;x+=T)for(let y=by;y<H;y+=T)c.fillRect(x,y,s.r,s.r);});});
  c.globalAlpha=1;},

drawWorld(c,cam,t){
  u.grid(c,150,"rgba(140,170,255,.035)",1);
  [[34,.05],[16,.10],[6,.28],[3,.6]].forEach(([w,a])=>{
    c.strokeStyle="rgba(120,170,255,"+a+")";c.lineWidth=w;c.strokeRect(0,0,WW,WH);});},

drawFood(c,f,t){const p=f.type==="star"?1+Math.sin(t*.003+f.seed)*.16:1,r=f.r*FK*p;
  c.drawImage(foodSpr(f),f.x-r,f.y-r,r*2,r*2);},

drawEjected(c,e){const r=e.r*1.8;c.drawImage(ejSpr(e.color),e.x-r,e.y-r,r*2,r*2);},

drawVirus(c,v){const r=v.r*(1+Math.sin(v.pulseT)*.06)*1.35;
  c.drawImage(virusSpr(),v.x-r,v.y-r,r*2,r*2);},

drawMissile(c,m){
  m.trail.forEach((pt,i)=>{const a=i/m.trail.length;c.fillStyle=`rgba(255,170,60,${a*.32})`;
    c.beginPath();c.arc(pt.x,pt.y,m.r*a*.9,0,6.283);c.fill();});
  c.save();c.translate(m.x,m.y);c.rotate(Math.atan2(m.vy,m.vx));
  const gd=c.createLinearGradient(-m.r*3.5,0,0,0);
  gd.addColorStop(0,"rgba(255,80,0,0)");gd.addColorStop(1,"rgba(255,200,60,.95)");
  c.fillStyle=gd;c.beginPath();c.ellipse(-m.r*2,0,m.r*3,m.r*.5,0,0,6.283);c.fill();
  c.shadowBlur=16;c.shadowColor="#ff6a00";c.fillStyle="#e8e8ee";
  c.beginPath();c.ellipse(0,0,m.r,m.r*.42,0,0,6.283);c.fill();
  c.fillStyle="#ff3b1f";c.beginPath();c.ellipse(m.r*.5,0,m.r*.55,m.r*.42,0,0,6.283);c.fill();
  c.shadowBlur=0;c.restore();},

drawCell(c,pc,p,isMe,t,prev){
  const r=pc.displayR||pc.r,sk=p.skin,K=PK(sk),d=r*K;
  c.drawImage(planetSpr(sk,isMe,u.tier(r)),pc.x-d,pc.y-d,d*2,d*2);
  c.save();c.translate(pc.x,pc.y);
  if(pc.mergeTimer>0){c.strokeStyle="rgba(255,255,255,.55)";c.lineWidth=2.5;c.beginPath();
    c.arc(0,0,r+5,-1.5708,-1.5708+(1-pc.mergeTimer/u.mergeTime(pc.r))*6.283);c.stroke();}
  const pw=Object.keys(p._powerups||{});
  if(pw.length){const cl={speed:"#ffdd00",magnet:"#ff66ff",shield:"#44aaff"};
    pw.forEach((k,i)=>{c.strokeStyle=cl[k];c.lineWidth=2.5;
      c.globalAlpha=.55+.45*Math.sin(t*.012+i);c.beginPath();c.arc(0,0,r*(1.5+i*.16),0,6.283);c.stroke();
      c.globalAlpha=1;});}
  if(!prev&&r>13){const fs=Math.max(11,r*.3);
    u.outText(c,p.name,0,-fs*.28,fs,"#fff","rgba(0,0,0,.75)");
    u.outText(c,String(Math.round(pc.r*pc.r/10)),0,fs*.76,fs*.68,"rgba(255,255,255,.85)","rgba(0,0,0,.7)");}
  c.restore();},

drawHud(c,W,H,g){
  const MS=152,MP=16,mx=W-MS-MP,my=H-MS-MP;
  c.fillStyle="rgba(10,16,34,.55)";c.strokeStyle="rgba(160,190,255,.22)";c.lineWidth=1;
  u.rr(c,mx,my,MS,MS,12);c.fill();c.stroke();
  const sc=MS/WW;
  c.save();u.rr(c,mx,my,MS,MS,12);c.clip();c.globalAlpha=.5;c.drawImage(neb,mx,my,MS,MS);c.globalAlpha=1;c.restore();
  g.viruses.forEach(v=>{c.fillStyle="rgba(0,255,157,.5)";c.beginPath();c.arc(mx+v.x*sc,my+v.y*sc,2,0,6.283);c.fill();});
  Object.values(g.players).filter(p=>!p.dead).forEach(p=>{const me=p.id===g.me;
    const x=mx+(p.pieces.reduce((s,q)=>s+q.x,0)/p.pieces.length)*sc,y=my+(p.pieces.reduce((s,q)=>s+q.y,0)/p.pieces.length)*sc;
    c.fillStyle=me?"#fff":p.color;c.beginPath();c.arc(x,y,me?4:2.4,0,6.283);c.fill();});
  [["DIVIDIR","ESPAÇO",g.splitCD>0,0],["EJETAR","W",g.ejectCD>0,1]].forEach(([lb,key,cd,i])=>{
    const bw=88,bh=40,bx=W-MP-bw-i*(bw+9),by=my-bh-12;
    c.fillStyle=cd?"rgba(20,26,44,.6)":"rgba(60,110,230,.35)";
    c.strokeStyle=cd?"rgba(120,140,180,.25)":"rgba(150,190,255,.6)";c.lineWidth=1.2;
    u.rr(c,bx,by,bw,bh,10);c.fill();c.stroke();
    c.fillStyle=cd?"#6b7691":"#eef4ff";c.textAlign="center";c.textBaseline="middle";
    c.font="bold 12px system-ui,Arial";c.fillText(lb,bx+bw/2,by+bh*.38);
    c.font="10px system-ui,Arial";c.fillStyle=cd?"#59637c":"rgba(238,244,255,.7)";
    c.fillText("["+key+"]",bx+bw/2,by+bh*.72);});
  c.fillStyle="rgba(10,16,34,.5)";u.rr(c,MP,MP,68,23,8);c.fill();
  c.fillStyle=g.fps>=50?"#4ade80":g.fps>=30?"#fbbf24":"#f87171";
  c.font="bold 12px system-ui,monospace";c.textAlign="left";c.textBaseline="middle";c.fillText("FPS "+g.fps,MP+8,MP+12);
  const me=g.players[g.me];
  if(me&&me._missiles>0){c.fillStyle="rgba(10,16,34,.55)";c.strokeStyle="rgba(255,160,60,.45)";c.lineWidth=1;
    u.rr(c,MP,MP+29,106,34,10);c.fill();c.stroke();
    c.font="16px serif";c.textAlign="left";c.textBaseline="middle";c.fillText("🚀",MP+10,MP+46);
    c.fillStyle="#ffb057";c.font="bold 15px system-ui,Arial";c.fillText("x"+me._missiles,MP+36,MP+46);
    c.font="10px system-ui,Arial";c.fillStyle="rgba(255,176,87,.7)";c.fillText("clique",MP+64,MP+47);}},

css:`
body{font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif}
/* grão de filme + vinheta: overlay de CSS, composto pela GPU (custo ~0 no canvas) */
body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:45;
  background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 45%,rgba(0,0,0,.55) 100%)}
body::before{content:"";position:fixed;inset:-50%;pointer-events:none;z-index:44;opacity:.05;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
  animation:grain 1.2s steps(4) infinite}
@keyframes grain{0%{transform:translate(0,0)}25%{transform:translate(-3%,2%)}
  50%{transform:translate(2%,-3%)}75%{transform:translate(-2%,-2%)}100%{transform:translate(0,0)}}
#hud-lb{left:auto;right:16px;top:16px;background:rgba(10,16,34,.42);border:1px solid rgba(160,190,255,.18);
  border-radius:14px;padding:12px 16px;color:#e6edfb;font-size:13px;min-width:210px;
  backdrop-filter:blur(14px);box-shadow:0 8px 30px rgba(0,0,0,.35)}
.ph{font-size:10px;letter-spacing:3px;color:#93a8d4;text-align:center;font-weight:600}
.lb-row{font-size:13px;color:#c3d0ea}
.lb-row.mine{color:#ffd166;font-weight:700}
.lb-row b{color:#8fd6ff;font-weight:500}
#hud-score{top:auto;right:auto;bottom:16px;left:16px;text-align:left;background:rgba(10,16,34,.42);
  border:1px solid rgba(160,190,255,.18);border-radius:14px;padding:12px 16px;color:#e6edfb;
  backdrop-filter:blur(14px);box-shadow:0 8px 30px rgba(0,0,0,.35)}
.score-big{font-size:28px;font-weight:300;color:#fff;letter-spacing:-1px}
.score-sub{font-size:10px;color:#93a8d4;letter-spacing:2px;margin-bottom:8px}
.score-row{justify-content:flex-start;font-size:11.5px;color:#a9b8d8}
.score-row.dim{color:#66759a}
.btn-mini{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);border-radius:8px;
  padding:6px 12px;font-size:11.5px;color:#dbe6ff}
.btn-mini:hover{background:rgba(255,255,255,.16)}
.screen{background:radial-gradient(ellipse at 50% 35%,rgba(19,26,58,.6),rgba(3,4,10,.9))}
.menu-card,.dead-card,.shop-wrap{background:rgba(10,16,34,.55);border:1px solid rgba(160,190,255,.18);
  border-radius:22px;padding:30px 34px;color:#e6edfb;backdrop-filter:blur(20px);
  box-shadow:0 24px 70px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.08)}
.brand{font-size:46px;font-weight:200;letter-spacing:8px;color:#fff;text-shadow:0 0 40px rgba(90,150,255,.7)}
.tagline{font-size:14px;color:#93a8d4;font-weight:300}
.coinbar{display:flex;align-items:center;gap:8px;background:rgba(255,209,102,.08);
  border:1px solid rgba(255,209,102,.25);border-radius:999px;padding:6px 18px;font-size:15px;color:#ffd166}
.coinbar span{font-size:11px;color:#9a8547}
.field label{font-size:11px;color:#93a8d4;letter-spacing:1px}
.field input{background:rgba(255,255,255,.06);border:1px solid rgba(160,190,255,.3);border-radius:12px;
  padding:12px;font-size:17px;color:#fff;outline:none}
.field input:focus{border-color:#5b9dff;box-shadow:0 0 0 3px rgba(91,157,255,.15)}
.skinrow{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:9px 12px}
.skinmeta b{font-size:14px;font-weight:600}.skinmeta i{font-style:normal;font-size:11px}
.btn-primary{background:linear-gradient(135deg,#5b9dff,#2f5ce0);border:none;border-radius:14px;padding:15px;
  font-size:17px;font-weight:600;color:#fff;letter-spacing:2px;box-shadow:0 10px 30px rgba(60,110,240,.35)}
.btn-primary:hover{transform:translateY(-1px);box-shadow:0 14px 36px rgba(60,110,240,.5)}
.btn-secondary{background:rgba(255,209,102,.08);border:1px solid rgba(255,209,102,.28);border-radius:14px;
  padding:12px;font-size:14px;font-weight:600;color:#ffd166}
.hint{font-size:11.5px;color:#66759a}
.shop-title{font-size:20px;font-weight:300;letter-spacing:6px;text-align:center;color:#fff}
.skin-card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:16px;color:#e6edfb}
.skin-card:hover{background:rgba(255,255,255,.1);transform:translateY(-2px)}
.skin-card.eq{border-color:rgba(91,157,255,.7);background:rgba(91,157,255,.14)}
.skin-card b{font-size:12.5px;font-weight:600}.skin-card i{font-style:normal;font-size:10.5px}
.skin-card em{font-style:normal;font-size:12px;color:#ffd166}
.badge{background:rgba(91,157,255,.9);color:#fff;font-size:8.5px;font-weight:700;padding:3px 7px;border-radius:6px}
.shop-note{font-size:11.5px;color:#66759a}
.dead-card{border-color:rgba(255,90,90,.28)}
.dead-icon{font-size:56px;filter:drop-shadow(0 0 24px rgba(255,90,90,.8))}
.dead-title{font-size:40px;font-weight:200;color:#ff6b6b;letter-spacing:8px;text-shadow:0 0 40px rgba(255,80,80,.6)}
.dead-sub{font-size:12px;color:#c98d95;font-weight:300}
.dead-by span{font-size:10px;color:#8c9ab5;letter-spacing:3px}
.dead-by b{font-size:24px;color:#ffb057;font-weight:500}
.dead-stats b{font-size:22px;color:#4ecdc4;font-weight:500}
.dead-stats i{font-style:normal;font-size:10px;color:#66759a;letter-spacing:1px}
`};
})();

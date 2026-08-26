// ── MODELO 7 — HÍBRIDO (NEON CINEMATOGRÁFICO) ─────────────────────────────────
// Planeta com volume, atmosfera e terminador do modelo Cinematográfico, com o
// aro emissivo, o grid, a borda e o HUD do Neon Arcade. Fundo com nebulosa e
// parallax; scanlines discretas.
//
// PERFORMANCE: mesma receita dos outros dois — sprite assado uma vez por skin e
// por faixa de tamanho, fundo em cache, pós-processamento em CSS.
(function(){
const u=MOCK.u,WW=u.WW,WH=u.WH;
function sh(hex,a){let n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255;
  const f=x=>Math.max(0,Math.min(255,Math.round(a>0?x+(255-x)*a:x*(1+a))));return`rgb(${f(r)},${f(g)},${f(b)})`;}
function rgba(hex,a){const n=parseInt(hex.slice(1),16);return`rgba(${n>>16},${n>>8&255},${n&255},${a})`;}
const CY="#4fe3ff",MG="#ff4fd8",T=760,FK=2.1;
let L=[],NEB=[],bg=null,bgW=0,bgH=0;

const LB={title:"🪐 PLANET.IO",tagline:"CONQUISTE A GALÁXIA · DIVIDA · EJETE · DEVORE",
  coinIcon:"🪙",coinWord:"moedas",nameLabel:"Nome do seu planeta",swap:"Trocar",
  play:"🚀 JOGAR",shop:"◈ LOJA DE SKINS",shopShort:"◈ Loja",shopTitle:"LOJA DE SKINS",
  shopNote:"12 skins de amostra — as 50 do jogo entram quando o modelo for aprovado.",
  hint:"🖱️ mouse = mover · ESPAÇO = dividir · W = ejetar · clique = míssil",
  back:"◄ Voltar",equipped:"EQUIPADA",owned:"Equipar",lbTitle:"PLACAR",massLabel:"MASSA TOTAL",
  youLabel:"planeta",killsWord:"abates",botTag:"◆",dead:"ABSORVIDO",deadIcon:"💥",
  deadSub:"— a galáxia continua sem você —",eatenBy:"DEVORADO POR",respawn:"⟳ RENASCER",menu:"Menu"};

// ── sprites ───────────────────────────────────────────────────────────────────
const PK=sk=>sk.ring?2.4:1.75;
function planetSpr(sk,isMe,size){
  return u.sprite("hp"+sk.id+(isMe?"m":"")+size,size,(c,R)=>{
    const K=PK(sk),r=R/K,col=sk.color,glow=sk.glow||sk.color;
    if(sk.ring){c.save();c.scale(1,.28);
      const rg=c.createRadialGradient(0,0,r*1.1,0,0,r*2.1);
      rg.addColorStop(0,rgba(col,.9));rg.addColorStop(.55,rgba(col,.42));rg.addColorStop(1,"rgba(0,0,0,0)");
      c.fillStyle=rg;c.beginPath();c.arc(0,0,r*2.1,0,6.283);c.arc(0,0,r*1.06,0,6.283,true);c.fill();
      c.strokeStyle=rgba(glow,.55);c.lineWidth=r*.06;c.shadowBlur=r*.3;c.shadowColor=glow;
      c.beginPath();c.arc(0,0,r*1.72,0,6.283);c.stroke();c.shadowBlur=0;c.restore();}
    // halo emissivo (o "neon" do aro), assado no sprite
    const halo=c.createRadialGradient(0,0,r*.92,0,0,r*1.5);
    halo.addColorStop(0,rgba(glow,isMe?.55:.34));halo.addColorStop(.45,rgba(glow,isMe?.22:.13));
    halo.addColorStop(1,rgba(glow,0));
    c.fillStyle=halo;c.beginPath();c.arc(0,0,r*1.5,0,6.283);c.fill();
    // corpo com volume
    const gd=c.createRadialGradient(-r*.35,-r*.4,r*.05,0,0,r*1.05);
    gd.addColorStop(0,sh(col,.55));gd.addColorStop(.45,col);gd.addColorStop(1,sh(col,-.6));
    c.fillStyle=gd;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
    c.save();c.beginPath();c.arc(0,0,r,0,6.283);c.clip();
    c.globalAlpha=.2;c.font=`${r*1.66}px serif`;c.textAlign="center";c.textBaseline="middle";
    c.fillText(sk.emoji,0,r*.05);c.globalAlpha=1;
    const hl=c.createRadialGradient(-r*.4,-r*.45,0,-r*.4,-r*.45,r*.75);
    hl.addColorStop(0,"rgba(255,255,255,.42)");hl.addColorStop(1,"rgba(255,255,255,0)");
    c.fillStyle=hl;c.fillRect(-r,-r,r*2,r*2);
    const term=c.createLinearGradient(r*.1,-r,r,r*.9);
    term.addColorStop(0,"rgba(0,0,0,0)");term.addColorStop(1,"rgba(0,4,14,.6)");
    c.fillStyle=term;c.fillRect(-r,-r,r*2,r*2);c.restore();
    // aro neon
    c.shadowBlur=r*(isMe?.5:.3);c.shadowColor=glow;
    c.strokeStyle=rgba(glow,isMe?1:.8);c.lineWidth=Math.max(2,r*.055);
    c.beginPath();c.arc(0,0,r*.985,0,6.283);c.stroke();if(isMe)c.stroke();
    c.shadowBlur=0;});}

function foodSpr(f){
  return u.sprite("hf"+f.type+f.color,68,(c,R)=>{
    const r=R/FK;
    if(f.type==="missile_ammo"||f.type.indexOf("powerup_")===0){
      c.shadowBlur=r*1.3;c.shadowColor=f.color;
      const gd=c.createRadialGradient(0,0,0,0,0,r);
      gd.addColorStop(0,"#fff");gd.addColorStop(.55,f.color);gd.addColorStop(1,rgba(f.color,.2));
      c.fillStyle=gd;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
      c.strokeStyle=rgba(f.color,.9);c.lineWidth=r*.12;c.stroke();c.shadowBlur=0;
      c.font=`${r*1.05}px serif`;c.textAlign="center";c.textBaseline="middle";
      c.fillText({missile_ammo:"🚀",powerup_speed:"⚡",powerup_magnet:"🧲",powerup_shield:"🛡️"}[f.type],0,1);return;}
    if(f.type==="comet"){const gd=c.createLinearGradient(-r*3.4,0,r,0);
      gd.addColorStop(0,"rgba(255,255,255,0)");gd.addColorStop(1,f.color);
      c.fillStyle=gd;c.beginPath();c.ellipse(-r*1.3,0,r*3,r*.3,0,0,6.283);c.fill();
      c.shadowBlur=r*.9;c.shadowColor="#fff";c.fillStyle="#fff";c.beginPath();c.arc(0,0,r*.5,0,6.283);c.fill();return;}
    if(f.type==="star"){c.shadowBlur=r*1.2;c.shadowColor=f.color;c.fillStyle=f.color;
      u.spikes(c,r*1.15,4,.32,0);c.fill();return;}
    c.shadowBlur=r*.7;c.shadowColor=f.color;
    const gd=c.createRadialGradient(-r*.3,-r*.3,0,0,0,r);
    gd.addColorStop(0,"#ffffff");gd.addColorStop(.3,f.color);gd.addColorStop(1,"rgba(0,0,0,.55)");
    c.fillStyle=gd;c.beginPath();c.arc(0,0,r*.95,0,6.283);c.fill();});}

const ejSpr=col=>u.sprite("he"+col,48,(c,R)=>{const r=R/1.85;
  c.shadowBlur=r*1.1;c.shadowColor=col;
  const gd=c.createRadialGradient(0,0,0,0,0,r);
  gd.addColorStop(0,"#fff");gd.addColorStop(.45,col);gd.addColorStop(1,rgba(col,0));
  c.fillStyle=gd;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();});

const virusSpr=()=>u.sprite("hv",256,(c,R)=>{const r=R/1.4;
  c.shadowBlur=r*.4;c.shadowColor="#2bff9d";
  const gd=c.createRadialGradient(-r*.2,-r*.2,r*.1,0,0,r);
  gd.addColorStop(0,"#b6ffe0");gd.addColorStop(.5,"#00cc70");gd.addColorStop(1,"#04361f");
  c.fillStyle=gd;u.spikes(c,r,22,.8,0);c.fill();
  c.strokeStyle="#39ff88";c.lineWidth=r*.035;c.stroke();c.shadowBlur=0;
  c.strokeStyle="rgba(180,255,220,.4)";c.lineWidth=r*.018;u.spikes(c,r*.58,22,.8,.14);c.stroke();});

window.THEME={
id:"hybrid",name:"Neon Cinematográfico",skins:u.SKINS,rarity:u.RARITY,
rarityColor:{free:"#8c9ab5",common:"#4fe3ff",rare:"#5b9dff",epic:"#ff4fd8",legendary:"#ffd166"},
labels:LB,

init(){const rand=u.mulberry(41);
  L=[.18,.42,.8].map((f,li)=>({f,stars:Array.from({length:li===2?45:90},()=>({
    x:rand()*T,y:rand()*T,r:li===2?1.6+rand()*1.6:.6+rand()*1.1,
    a:+((li===2?.55:.22)+rand()*.35).toFixed(2)}))}));
  NEB=[];const cols=["#2f6bff","#a855f7","#ff4d6d","#22d3ee","#7c3aed"];
  for(let i=0;i<16;i++)NEB.push({x:rand(),y:rand(),r:.22+rand()*.5,col:cols[i%cols.length],a:.055+rand()*.10});},

drawBg(c,W,H,cam){
  if(!bg||bgW!==W||bgH!==H){                                 // gradiente + nebulosa em cache
    bgW=W;bgH=H;bg=document.createElement("canvas");bg.width=W;bg.height=H;
    const x=bg.getContext("2d"),D=Math.max(W,H);
    const gd=x.createRadialGradient(W*.5,H*.42,0,W*.5,H*.5,D*.9);
    gd.addColorStop(0,"#080d24");gd.addColorStop(.5,"#04060d");gd.addColorStop(1,"#010208");
    x.fillStyle=gd;x.fillRect(0,0,W,H);
    NEB.forEach(n=>{const nx=n.x*W,ny=n.y*H,nr=n.r*D;
      const g2=x.createRadialGradient(nx,ny,0,nx,ny,nr);
      g2.addColorStop(0,rgba(n.col,n.a));g2.addColorStop(.5,rgba(n.col,n.a*.4));g2.addColorStop(1,"rgba(0,0,0,0)");
      x.fillStyle=g2;x.beginPath();x.arc(nx,ny,nr,0,6.283);x.fill();});}
  c.drawImage(bg,0,0);
  c.fillStyle="#dfe8ff";
  L.forEach(l=>{const ox=((-cam.x*l.f*cam.scale)%T+T)%T,oy=((-cam.y*l.f*cam.scale)%T+T)%T;
    l.stars.forEach(s=>{c.globalAlpha=s.a;const bx=(s.x+ox)%T,by=(s.y+oy)%T;
      for(let x=bx;x<W;x+=T)for(let y=by;y<H;y+=T)c.fillRect(x,y,s.r,s.r);});});
  c.globalAlpha=1;},

drawWorld(c){
  u.grid(c,60,"rgba(79,227,255,.06)",1);                     // grid do neon
  u.grid(c,300,"rgba(79,227,255,.13)",1.4);
  [[30,.05],[14,.11],[6,.26],[3,.7]].forEach(([w,a])=>{      // borda emissiva sem shadowBlur
    c.strokeStyle="rgba(79,227,255,"+a+")";c.lineWidth=w;c.strokeRect(0,0,WW,WH);});
  c.strokeStyle=rgba(MG,.25);c.lineWidth=1.5;c.strokeRect(-12,-12,WW+24,WH+24);},

drawFood(c,f,t){const p=f.type==="star"?1+Math.sin(t*.003+f.seed)*.16:1,r=f.r*FK*p;
  c.drawImage(foodSpr(f),f.x-r,f.y-r,r*2,r*2);},

drawEjected(c,e){const r=e.r*1.85;c.drawImage(ejSpr(e.color),e.x-r,e.y-r,r*2,r*2);},

drawVirus(c,v){const r=v.r*(1+Math.sin(v.pulseT)*.05)*1.4;
  c.drawImage(virusSpr(),v.x-r,v.y-r,r*2,r*2);},

drawMissile(c,m){
  m.trail.forEach((pt,i)=>{const a=i/m.trail.length;c.fillStyle=`rgba(255,120,60,${a*.4})`;
    c.beginPath();c.arc(pt.x,pt.y,m.r*a*.9,0,6.283);c.fill();});
  c.save();c.translate(m.x,m.y);c.rotate(Math.atan2(m.vy,m.vx));
  const gd=c.createLinearGradient(-m.r*3.5,0,0,0);
  gd.addColorStop(0,"rgba(255,80,0,0)");gd.addColorStop(1,"rgba(255,200,60,.95)");
  c.fillStyle=gd;c.beginPath();c.ellipse(-m.r*2,0,m.r*3,m.r*.5,0,0,6.283);c.fill();
  c.shadowBlur=14;c.shadowColor="#ff6a00";c.fillStyle="#eef4ff";
  c.beginPath();c.ellipse(0,0,m.r,m.r*.42,0,0,6.283);c.fill();
  c.fillStyle="#ff3b6b";c.beginPath();c.ellipse(m.r*.5,0,m.r*.55,m.r*.42,0,0,6.283);c.fill();
  c.shadowBlur=0;c.restore();},

drawCell(c,pc,p,isMe,t,prev){
  const r=pc.displayR||pc.r,sk=p.skin,K=PK(sk),d=r*K;
  c.drawImage(planetSpr(sk,isMe,u.tier(r)),pc.x-d,pc.y-d,d*2,d*2);
  c.save();c.translate(pc.x,pc.y);
  if(pc.mergeTimer>0){c.strokeStyle=rgba(CY,.75);c.lineWidth=2.5;c.beginPath();
    c.arc(0,0,r+6,-1.5708,-1.5708+(1-pc.mergeTimer/u.mergeTime(pc.r))*6.283);c.stroke();}
  const pw=Object.keys(p._powerups||{});
  if(pw.length){const cl={speed:"#ffd23d",magnet:MG,shield:CY};
    pw.forEach((k,i)=>{c.strokeStyle=cl[k];c.lineWidth=2.2;c.globalAlpha=.5+.5*Math.sin(t*.012+i);
      c.setLineDash([r*.36,r*.26]);c.beginPath();c.arc(0,0,r*(1.26+i*.15),0,6.283);c.stroke();
      c.setLineDash([]);c.globalAlpha=1;});}
  if(!prev&&r>13){const fs=Math.max(11,r*.31);
    u.outText(c,p.name,0,-fs*.28,fs,"#fff","rgba(0,0,0,.75)");
    u.outText(c,String(Math.round(pc.r*pc.r/10)),0,fs*.78,fs*.7,rgba(sk.glow||sk.color,.95),"rgba(0,0,0,.7)");}
  c.restore();},

drawHud(c,W,H,g){                                            // HUD do neon: cantoneiras + mono
  const MS=152,MP=16,mx=W-MS-MP,my=H-MS-MP;
  c.fillStyle="rgba(4,10,24,.62)";c.fillRect(mx,my,MS,MS);
  c.strokeStyle=rgba(CY,.5);c.lineWidth=1.5;
  [[mx,my,1,1],[mx+MS,my,-1,1],[mx,my+MS,1,-1],[mx+MS,my+MS,-1,-1]].forEach(([x,y,sx,sy])=>{
    c.beginPath();c.moveTo(x+sx*18,y);c.lineTo(x,y);c.lineTo(x,y+sy*18);c.stroke();});
  const sc=MS/WW;
  c.strokeStyle=rgba(CY,.08);c.lineWidth=1;
  for(let i=1;i<5;i++){c.beginPath();c.moveTo(mx+MS*i/5,my);c.lineTo(mx+MS*i/5,my+MS);
    c.moveTo(mx,my+MS*i/5);c.lineTo(mx+MS,my+MS*i/5);c.stroke();}
  g.viruses.forEach(v=>{c.fillStyle="rgba(57,255,136,.55)";c.fillRect(mx+v.x*sc-1.5,my+v.y*sc-1.5,3,3);});
  Object.values(g.players).filter(p=>!p.dead).forEach(p=>{const me=p.id===g.me;
    const x=mx+(p.pieces.reduce((s,q)=>s+q.x,0)/p.pieces.length)*sc,y=my+(p.pieces.reduce((s,q)=>s+q.y,0)/p.pieces.length)*sc;
    c.fillStyle=me?"#fff":p.skin.glow||p.color;
    c.fillRect(x-(me?2.5:1.8),y-(me?2.5:1.8),me?5:3.6,me?5:3.6);});
  [["DIVIDIR","ESPAÇO",g.splitCD>0,0],["EJETAR","W",g.ejectCD>0,1]].forEach(([lb,key,cd,i])=>{
    const bw=90,bh=40,bx=W-MP-bw-i*(bw+9),by=my-bh-12;
    c.fillStyle=cd?"rgba(18,24,40,.7)":"rgba(10,60,90,.55)";c.fillRect(bx,by,bw,bh);
    c.strokeStyle=cd?"rgba(90,110,140,.45)":rgba(CY,.85);c.lineWidth=1.5;c.strokeRect(bx,by,bw,bh);
    c.fillStyle=cd?"#59667f":"#dff7ff";c.textAlign="center";c.textBaseline="middle";
    c.font="bold 12px 'Courier New',monospace";c.fillText(lb,bx+bw/2,by+bh*.38);
    c.font="10px 'Courier New',monospace";c.fillStyle=cd?"#46536b":rgba(CY,.75);
    c.fillText("["+key+"]",bx+bw/2,by+bh*.72);});
  c.fillStyle="rgba(4,10,24,.6)";c.fillRect(MP,MP,68,22);
  c.fillStyle=g.fps>=50?"#39ff88":g.fps>=30?"#ffd23d":"#ff4d6d";
  c.font="bold 12px 'Courier New',monospace";c.textAlign="left";c.textBaseline="middle";
  c.fillText("FPS "+g.fps,MP+7,MP+11);
  const me=g.players[g.me];
  if(me&&me._missiles>0){c.fillStyle="rgba(30,4,24,.7)";c.fillRect(MP,MP+28,106,32);
    c.strokeStyle=rgba(MG,.8);c.lineWidth=1.5;c.strokeRect(MP,MP+28,106,32);
    c.font="16px serif";c.textAlign="left";c.textBaseline="middle";c.fillText("🚀",MP+9,MP+44);
    c.fillStyle=MG;c.font="bold 15px 'Courier New',monospace";c.fillText("x"+me._missiles,MP+35,MP+44);
    c.font="9px 'Courier New',monospace";c.fillStyle=rgba(MG,.7);c.fillText("CLIQUE",MP+64,MP+45);}},

css:`
body{font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif}
/* scanlines discretas + vinheta + grão: overlay de CSS, composto pela GPU */
body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:45;
  background:repeating-linear-gradient(180deg,rgba(79,227,255,.05) 0 1px,transparent 1px 4px),
    radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 42%,rgba(0,0,0,.5) 100%)}
body::before{content:"";position:fixed;inset:-50%;pointer-events:none;z-index:44;opacity:.035;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
  animation:grain 1.2s steps(4) infinite}
@keyframes grain{0%{transform:translate(0,0)}25%{transform:translate(-3%,2%)}
  50%{transform:translate(2%,-3%)}75%{transform:translate(-2%,-2%)}100%{transform:translate(0,0)}}
.mono{font-family:'Courier New',monospace}
#hud-lb{left:auto;right:16px;top:16px;background:rgba(6,12,28,.5);border:1px solid rgba(79,227,255,.3);
  border-radius:12px;padding:11px 15px;color:#e6f4ff;font-size:13px;min-width:210px;
  backdrop-filter:blur(14px);box-shadow:0 8px 30px rgba(0,0,0,.4),0 0 24px rgba(79,227,255,.08)}
.ph{font-size:10px;letter-spacing:4px;color:#4fe3ff;text-align:center;font-weight:700;font-family:'Courier New',monospace}
.lb-row{font-size:12.5px;color:#b9cbe6;font-family:'Courier New',monospace}
.lb-row.mine{color:#ffd166;font-weight:700}
.lb-row b{color:#4fe3ff;font-weight:400}
#hud-score{top:auto;right:auto;bottom:16px;left:16px;text-align:left;background:rgba(6,12,28,.5);
  border:1px solid rgba(79,227,255,.3);border-radius:12px;padding:11px 15px;color:#e6f4ff;
  backdrop-filter:blur(14px);box-shadow:0 8px 30px rgba(0,0,0,.4),0 0 24px rgba(79,227,255,.08)}
.score-big{font-size:28px;font-weight:300;color:#fff;letter-spacing:-.5px;text-shadow:0 0 18px rgba(79,227,255,.6)}
.score-sub{font-size:9.5px;color:#4fe3ff;letter-spacing:3px;margin-bottom:7px;font-family:'Courier New',monospace}
.score-row{justify-content:flex-start;font-size:11.5px;color:#9fb4d4}
.score-row.dim{color:#5d6c8c}
.btn-mini{background:rgba(10,60,90,.45);border:1px solid rgba(79,227,255,.45);border-radius:8px;
  padding:6px 12px;font-size:11.5px;color:#dff7ff}
.btn-mini:hover{box-shadow:0 0 16px rgba(79,227,255,.45)}
.screen{background:radial-gradient(ellipse at 50% 35%,rgba(11,18,48,.66),rgba(2,3,10,.92))}
.menu-card,.dead-card,.shop-wrap{background:rgba(6,12,28,.62);border:1px solid rgba(79,227,255,.32);
  border-radius:18px;padding:28px 32px;color:#e6f4ff;backdrop-filter:blur(20px);
  box-shadow:0 24px 70px rgba(0,0,0,.55),0 0 60px rgba(79,227,255,.08),inset 0 1px 0 rgba(255,255,255,.07)}
.brand{font-size:42px;font-weight:200;letter-spacing:4px;white-space:nowrap;color:#fff;
  text-shadow:0 0 16px rgba(79,227,255,.9),0 0 50px rgba(47,107,255,.7)}
.tagline{font-size:9.5px;color:#4fe3ff;letter-spacing:1.6px;text-align:center;font-family:'Courier New',monospace}
.coinbar{display:flex;align-items:center;gap:8px;background:rgba(255,209,102,.07);
  border:1px solid rgba(255,209,102,.3);border-radius:999px;padding:6px 18px;font-size:15px;color:#ffd166}
.coinbar span{font-size:10px;color:#9a8547;letter-spacing:2px}
.field label{font-size:10px;color:#4fe3ff;letter-spacing:3px;font-family:'Courier New',monospace}
.field input{background:rgba(0,14,30,.75);border:1px solid rgba(79,227,255,.45);border-radius:10px;
  padding:12px;font-size:17px;color:#fff;outline:none;letter-spacing:1px}
.field input:focus{border-color:#4fe3ff;box-shadow:0 0 0 3px rgba(79,227,255,.14),0 0 22px rgba(79,227,255,.35)}
.skinrow{background:rgba(255,255,255,.045);border:1px solid rgba(79,227,255,.2);border-radius:12px;padding:9px 12px}
.skinmeta b{font-size:14px;font-weight:600}.skinmeta i{font-style:normal;font-size:10px;letter-spacing:2px}
.btn-primary{background:linear-gradient(135deg,rgba(79,227,255,.22),rgba(47,92,224,.5));
  border:1px solid rgba(79,227,255,.75);border-radius:12px;padding:15px;font-size:17px;font-weight:600;
  color:#fff;letter-spacing:4px;text-shadow:0 0 14px rgba(79,227,255,.9);box-shadow:0 8px 28px rgba(30,90,200,.3)}
.btn-primary:hover{box-shadow:0 0 32px rgba(79,227,255,.55),0 8px 28px rgba(30,90,200,.4)}
.btn-secondary{background:rgba(255,79,216,.07);border:1px solid rgba(255,79,216,.45);border-radius:12px;
  padding:12px;font-size:13px;font-weight:600;color:#ff85e2;letter-spacing:2px}
.hint{font-size:11px;color:#5d6c8c}
.shop-title{font-size:19px;font-weight:300;letter-spacing:6px;text-align:center;color:#fff;
  text-shadow:0 0 14px rgba(79,227,255,.8)}
.skin-card{background:rgba(255,255,255,.045);border:1px solid rgba(79,227,255,.16);border-radius:14px;color:#e6f4ff}
.skin-card:hover{background:rgba(79,227,255,.1);transform:translateY(-2px);box-shadow:0 0 22px rgba(79,227,255,.2)}
.skin-card.eq{border-color:rgba(79,227,255,.8);background:rgba(79,227,255,.14);box-shadow:0 0 24px rgba(79,227,255,.25)}
.skin-card b{font-size:12.5px;font-weight:600}.skin-card i{font-style:normal;font-size:10px;letter-spacing:1.5px}
.skin-card em{font-style:normal;font-size:12px;color:#ffd166}
.badge{background:#4fe3ff;color:#02121c;font-size:8.5px;font-weight:700;padding:3px 7px;border-radius:5px;letter-spacing:1px}
.shop-note{font-size:11px;color:#5d6c8c}
.dead-card{border-color:rgba(255,79,216,.4);box-shadow:0 24px 70px rgba(0,0,0,.55),0 0 60px rgba(255,79,216,.14)}
.dead-icon{font-size:54px;filter:drop-shadow(0 0 24px rgba(255,90,120,.8))}
.dead-title{font-size:38px;font-weight:200;color:#ff5f8f;letter-spacing:8px;text-shadow:0 0 34px rgba(255,80,130,.75)}
.dead-sub{font-size:11.5px;color:#c98d95}
.dead-by span{font-size:9.5px;color:#5d6c8c;letter-spacing:3px;font-family:'Courier New',monospace}
.dead-by b{font-size:23px;color:#4fe3ff;font-weight:500}
.dead-stats b{font-size:21px;color:#fff;font-weight:500}
.dead-stats i{font-style:normal;font-size:9.5px;color:#5d6c8c;letter-spacing:2px;font-family:'Courier New',monospace}
`};
})();

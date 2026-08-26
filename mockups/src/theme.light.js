// ── MODELO 2 — AGAR CLARO ─────────────────────────────────────────────────────
// O agar.io original: fundo claro com grid cinza, círculos pastel de contorno
// fino, nome + massa no centro, pontinhos de comida, vírus verde espinhoso.
// A temática espacial entra pelas skins de planeta, cometas e constelações.
(function(){
const u=MOCK.u,WW=u.WW,WH=u.WH;
function sh(hex,a){let n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255;
  const f=x=>Math.max(0,Math.min(255,Math.round(a>0?x+(255-x)*a:x*(1+a))));return`rgb(${f(r)},${f(g)},${f(b)})`;}
const lum=hex=>{const n=parseInt(hex.slice(1),16);return(.299*(n>>16)+.587*(n>>8&255)+.114*(n&255))/255;};
const BG="#f4f6fa",GRID="#e2e6ee",INK="#2b3040";
let stars=[],lines=[];

const LB={title:"🪐 PLANET.IO",tagline:"Conquiste a galáxia. Divida, ejete e devore.",
  coinIcon:"🪙",coinWord:"moedas",nameLabel:"Nome do seu planeta:",swap:"Trocar",
  play:"🚀 JOGAR",shop:"🛍️ LOJA DE SKINS",shopShort:"🛍️ Loja",shopTitle:"LOJA DE SKINS",
  shopNote:"12 skins de amostra — as 50 do jogo entram quando o modelo for aprovado.",
  hint:"🖱️ mouse = mover · ESPAÇO = dividir · W = ejetar · clique = míssil",
  back:"← Voltar",equipped:"EQUIPADA",owned:"Equipar",lbTitle:"PLACAR",massLabel:"massa total",
  youLabel:"planeta",killsWord:"abates",botTag:"🤖",dead:"ABSORVIDO",deadIcon:"💥",
  deadSub:"— a galáxia continua sem você —",eatenBy:"DEVORADO POR",respawn:"🔄 RENASCER",menu:"Menu"};

window.THEME={
id:"light",name:"Agar Claro",skins:u.SKINS,rarity:u.RARITY,
rarityColor:{free:"#8b93a5",common:"#2f8fd6",rare:"#2f6bd8",epic:"#8e44c8",legendary:"#d99b0e"},
labels:LB,

init(){const rand=u.mulberry(11);stars=[];lines=[];
  for(let i=0;i<300;i++)stars.push({x:rand()*WW,y:rand()*WH,r:1+rand()*2.2,a:.10+rand()*.16});
  for(let i=0;i<26;i++){const a=stars[Math.floor(rand()*stars.length)],b=stars[Math.floor(rand()*stars.length)];
    if(Math.hypot(a.x-b.x,a.y-b.y)<420)lines.push([a,b]);}},

drawBg(c,W,H){c.fillStyle=BG;c.fillRect(0,0,W,H);},

drawWorld(c){
  u.grid(c,50,GRID,1);
  c.fillStyle="#aab4c6";stars.forEach(s=>{c.globalAlpha=s.a;c.beginPath();c.arc(s.x,s.y,s.r,0,6.283);c.fill();});
  c.strokeStyle="#c3cad8";c.lineWidth=1;c.globalAlpha=.5;
  lines.forEach(([a,b])=>{c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();});c.globalAlpha=1;
  c.strokeStyle="#c8cedb";c.lineWidth=10;c.strokeRect(0,0,WW,WH);},

drawFood(c,f){
  if(f.type==="missile_ammo"||f.type.indexOf("powerup_")===0){
    c.fillStyle=sh(f.color,.1);c.beginPath();c.arc(f.x,f.y,f.r,0,6.283);c.fill();
    c.strokeStyle=sh(f.color,-.3);c.lineWidth=2;c.stroke();
    c.font=`${f.r*1.1}px serif`;c.textAlign="center";c.textBaseline="middle";
    c.fillText({missile_ammo:"🚀",powerup_speed:"⚡",powerup_magnet:"🧲",powerup_shield:"🛡️"}[f.type],f.x,f.y+1);return;}
  const col=f.color.indexOf("hsl")===0?f.color:f.color;
  c.fillStyle=col;
  if(f.type==="comet"){c.globalAlpha=.3;c.fillRect(f.x-f.r*3,f.y-f.r*.2,f.r*2.8,f.r*.4);c.globalAlpha=1;
    c.beginPath();c.arc(f.x,f.y,f.r*.85,0,6.283);c.fill();}
  else if(f.type==="star"){c.save();c.translate(f.x,f.y);u.spikes(c,f.r*1.1,4,.35,0);c.fill();c.restore();}
  else{c.beginPath();c.arc(f.x,f.y,f.r,0,6.283);c.fill();}},

drawEjected(c,e){c.fillStyle=e.color;c.beginPath();c.arc(e.x,e.y,e.r,0,6.283);c.fill();
  c.strokeStyle="rgba(0,0,0,.14)";c.lineWidth=2;c.stroke();},

drawVirus(c,v){c.save();c.translate(v.x,v.y);const p=1+Math.sin(v.pulseT)*.03;
  u.spikes(c,v.r*p,24,.9,0);c.fillStyle="#5fd97a";c.fill();
  c.strokeStyle="#2e9c4c";c.lineWidth=Math.max(2,v.r*.05);c.stroke();c.restore();},

drawMissile(c,m){c.save();c.translate(m.x,m.y);c.rotate(Math.atan2(m.vy,m.vx));
  c.globalAlpha=.28;c.fillStyle="#ff8a3d";c.fillRect(-m.r*3.2,-m.r*.2,m.r*2.8,m.r*.4);c.globalAlpha=1;
  c.fillStyle="#f0f2f6";c.beginPath();c.moveTo(m.r*1.3,0);c.lineTo(-m.r*.9,-m.r*.7);c.lineTo(-m.r*.9,m.r*.7);
  c.closePath();c.fill();c.strokeStyle="#e0523c";c.lineWidth=2.5;c.stroke();c.restore();},

drawCell(c,pc,p,isMe,t,prev){
  const r=pc.displayR||pc.r,sk=p.skin,fill=sh(sk.color,.26),line=sh(sk.color,-.28);
  const lp=lum(sk.color)+(1-lum(sk.color))*.26,dark=lp>.62;
  c.save();c.translate(pc.x,pc.y);
  if(sk.ring){c.save();c.scale(1,.3);c.strokeStyle=sh(sk.color,.05);c.lineWidth=r*.4;c.globalAlpha=.7;
    c.beginPath();c.arc(0,0,r*1.55,0,6.283);c.stroke();c.globalAlpha=1;c.restore();}
  c.fillStyle=fill;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
  c.strokeStyle=isMe?"#20262f":line;c.lineWidth=Math.max(2.5,r*(isMe?.09:.07));c.stroke();
  if(r>20){c.save();c.beginPath();c.arc(0,0,r*.94,0,6.283);c.clip();c.globalAlpha=.2;
    c.font=`${r*1.7}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(sk.emoji,0,r*.04);c.restore();}
  if(pc.mergeTimer>0){c.strokeStyle="rgba(0,0,0,.35)";c.lineWidth=2.5;c.beginPath();
    c.arc(0,0,r+5,-1.5708,-1.5708+(1-pc.mergeTimer/u.mergeTime(pc.r))*6.283);c.stroke();}
  const pw=Object.keys(p._powerups||{});
  if(pw.length){const cl={speed:"#f0a800",magnet:"#c845c8",shield:"#2f8fd6"};
    pw.forEach((k,i)=>{c.strokeStyle=cl[k];c.lineWidth=2.5;c.globalAlpha=.6+.4*Math.sin(t*.012+i);
      c.beginPath();c.arc(0,0,r*(1.15+i*.13),0,6.283);c.stroke();c.globalAlpha=1;});}
  if(!prev&&r>13){const fs=Math.max(11,r*.32);
    u.outText(c,p.name,0,-fs*.28,fs,dark?INK:"#fff",dark?"rgba(255,255,255,.8)":"rgba(0,0,0,.55)");
    u.outText(c,String(Math.round(pc.r*pc.r/10)),0,fs*.72,fs*.72,dark?"rgba(43,48,64,.8)":"rgba(255,255,255,.9)",dark?"rgba(255,255,255,.7)":"rgba(0,0,0,.5)");}
  c.restore();},

drawHud(c,W,H,g){
  const MS=150,MP=16,mx=W-MS-MP,my=H-MS-MP;
  c.fillStyle="rgba(255,255,255,.92)";c.strokeStyle="#d6dbe6";c.lineWidth=1;
  u.rr(c,mx,my,MS,MS,6);c.fill();c.stroke();
  const sc=MS/WW;c.strokeStyle="#eceff5";
  for(let i=1;i<5;i++){c.beginPath();c.moveTo(mx+MS*i/5,my);c.lineTo(mx+MS*i/5,my+MS);
    c.moveTo(mx,my+MS*i/5);c.lineTo(mx+MS,my+MS*i/5);c.stroke();}
  g.viruses.forEach(v=>{c.fillStyle="rgba(95,217,122,.7)";c.beginPath();c.arc(mx+v.x*sc,my+v.y*sc,2,0,6.283);c.fill();});
  Object.values(g.players).filter(p=>!p.dead).forEach(p=>{const me=p.id===g.me;
    c.fillStyle=me?"#20262f":p.color;c.beginPath();
    c.arc(mx+(p.pieces.reduce((s,q)=>s+q.x,0)/p.pieces.length)*sc,my+(p.pieces.reduce((s,q)=>s+q.y,0)/p.pieces.length)*sc,me?4:2.4,0,6.283);c.fill();});
  [["DIVIDIR","ESPAÇO",g.splitCD>0,0],["EJETAR","W",g.ejectCD>0,1]].forEach(([lb,key,cd,i])=>{
    const bw=86,bh=38,bx=W-MP-bw-i*(bw+8),by=my-bh-10;
    c.fillStyle=cd?"#e8eaf0":"#2f6bd8";c.strokeStyle=cd?"#d6dbe6":"#2557b5";c.lineWidth=1.5;
    u.rr(c,bx,by,bw,bh,6);c.fill();c.stroke();
    c.fillStyle=cd?"#a3aab8":"#fff";c.textAlign="center";c.textBaseline="middle";
    c.font="bold 12px Arial";c.fillText(lb,bx+bw/2,by+bh*.38);
    c.font="10px Arial";c.fillStyle=cd?"#b8bec9":"rgba(255,255,255,.8)";c.fillText("["+key+"]",bx+bw/2,by+bh*.72);});
  c.fillStyle="rgba(255,255,255,.85)";u.rr(c,MP,MP,66,22,4);c.fill();
  c.fillStyle=g.fps>=50?"#1f9d55":g.fps>=30?"#c08a00":"#d64545";
  c.font="bold 12px monospace";c.textAlign="left";c.textBaseline="middle";c.fillText("FPS "+g.fps,MP+7,MP+11);
  const me=g.players[g.me];
  if(me&&me._missiles>0){c.fillStyle="rgba(255,255,255,.92)";c.strokeStyle="#f0b48a";c.lineWidth=1;
    u.rr(c,MP,MP+28,104,32,6);c.fill();c.stroke();
    c.font="16px serif";c.textAlign="left";c.textBaseline="middle";c.fillText("🚀",MP+10,MP+44);
    c.fillStyle="#e2622a";c.font="bold 15px Arial";c.fillText("x"+me._missiles,MP+34,MP+44);
    c.font="10px Arial";c.fillStyle="#c08a6a";c.fillText("clique",MP+62,MP+45);}},

css:`
body{font-family:Arial,Helvetica,sans-serif}
#hud-lb{left:auto;right:16px;top:16px;background:rgba(255,255,255,.94);border:1px solid #d6dbe6;
  border-radius:8px;padding:10px 14px;color:#2b3040;font-size:13px;min-width:200px;box-shadow:0 2px 10px rgba(30,40,70,.08)}
.ph{font-size:11px;letter-spacing:2px;color:#8b93a5;text-align:center;font-weight:700}
.lb-row{font-size:13px;color:#3d4557}
.lb-row.mine{color:#2f6bd8;font-weight:700}
.lb-row b{color:#8b93a5;font-weight:400}
#hud-score{top:auto;right:auto;bottom:16px;left:16px;text-align:left;background:rgba(255,255,255,.94);
  border:1px solid #d6dbe6;border-radius:8px;padding:10px 14px;color:#2b3040;box-shadow:0 2px 10px rgba(30,40,70,.08)}
.score-big{font-size:26px;font-weight:700;color:#20262f}
.score-sub{font-size:11px;color:#8b93a5;letter-spacing:1px;margin-bottom:6px}
.score-row{justify-content:flex-start;font-size:11.5px;color:#5c6577}
.score-row.dim{color:#a3aab8}
.btn-mini{background:#eef1f7;border:1px solid #d6dbe6;border-radius:5px;padding:5px 12px;font-size:11.5px;color:#3d4557}
.btn-mini:hover{background:#e2e7f0}
.screen{background:radial-gradient(ellipse at 50% 35%,rgba(244,246,250,.82),rgba(226,231,240,.94))}
.menu-card,.dead-card,.shop-wrap{background:#fff;border:1px solid #dfe4ed;border-radius:12px;
  padding:26px 28px;color:#2b3040;box-shadow:0 10px 40px rgba(30,40,70,.12)}
.brand{font-size:42px;font-weight:700;letter-spacing:2px;color:#20262f}
.tagline{font-size:14px;color:#6f7a8d}
.coinbar{display:flex;align-items:center;gap:7px;background:#fff8e2;border:1px solid #f0d99a;
  border-radius:6px;padding:6px 16px;font-size:15px;color:#b8860b;font-weight:700}
.coinbar span{font-size:12px;color:#b0a06a;font-weight:400}
.field label{font-size:12px;color:#6f7a8d}
.field input{background:#f7f9fc;border:2px solid #2f6bd8;border-radius:6px;padding:11px;font-size:17px;color:#20262f;outline:none}
.skinrow{background:#f7f9fc;border:1px solid #e3e7ef;border-radius:8px;padding:8px 10px}
.skinmeta b{font-size:14px}.skinmeta i{font-style:normal;font-size:11px}
.btn-primary{background:#2f6bd8;border:none;border-radius:6px;padding:14px;font-size:18px;font-weight:700;color:#fff;letter-spacing:1px}
.btn-primary:hover{background:#2557b5}
.btn-secondary{background:#fff8e2;border:1px solid #f0d99a;border-radius:6px;padding:11px;font-size:14px;font-weight:700;color:#b8860b}
.hint{font-size:12px;color:#8b93a5}
.shop-title{font-size:20px;font-weight:700;letter-spacing:2px;text-align:center;color:#20262f}
.skin-card{background:#f7f9fc;border:1px solid #e3e7ef;border-radius:10px;color:#2b3040}
.skin-card:hover{background:#eef2f8}
.skin-card.eq{border-color:#2f6bd8;background:#e8f0ff}
.skin-card b{font-size:12.5px}.skin-card i{font-style:normal;font-size:10.5px}
.skin-card em{font-style:normal;font-size:12px;color:#b8860b}
.badge{background:#2f6bd8;color:#fff;font-size:8.5px;font-weight:700;padding:2px 6px;border-radius:3px}
.shop-note{font-size:11.5px;color:#8b93a5}
.dead-card{border-color:#f2c4c4}
.dead-icon{font-size:52px}
.dead-title{font-size:38px;font-weight:700;color:#d64545;letter-spacing:2px}
.dead-sub{font-size:12px;color:#c08a8a}
.dead-by span{font-size:11px;color:#8b93a5;letter-spacing:1px}
.dead-by b{font-size:22px;color:#e2622a}
.dead-stats b{font-size:20px;color:#2f6bd8}
.dead-stats i{font-style:normal;font-size:10px;color:#8b93a5}
`};
})();

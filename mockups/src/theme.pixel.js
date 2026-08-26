// ── MODELO 6 — PIXEL 16-BIT ───────────────────────────────────────────────────
// Mesma leitura do agar.io renderizada num canvas de baixa resolução escalado
// sem suavização: paleta limitada, sombra por dithering, fonte pixelada e HUD
// com moldura estilo SNES.
(function(){
const u=MOCK.u,WW=u.WW,WH=u.WH;
const PAL={bg:"#12172e",bg2:"#1b2244",grid:"#232c55",ink:"#0a0d1c",wall:"#4a5ba8",
  hud:"#2b3a67",hudL:"#5a6db5",hudD:"#141a33",txt:"#e8edff",dim:"#8b97cc",
  green:"#7bd44b",greenD:"#3f8a2a",yellow:"#ffd23d",red:"#e8524f",orange:"#ff9a3c"};
function q(hex,a){ // clareia/escurece em degraus (paleta limitada)
  let n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255;
  const f=x=>{const v=a>0?x+(255-x)*a:x*(1+a);return Math.max(0,Math.min(255,Math.round(v/24)*24));};
  return`rgb(${f(r)},${f(g)},${f(b)})`;}
let stars=[],dith=null;

const LB={title:"PLANET.IO",tagline:"CONQUISTE A GALAXIA - DIVIDA E DEVORE",
  coinIcon:"$",coinWord:"MOEDAS",nameLabel:"NOME DO PLANETA",swap:"TROCAR",
  play:"► JOGAR",shop:"★ LOJA",shopShort:"★ LOJA",shopTitle:"LOJA DE SKINS",
  shopNote:"12 SKINS DE AMOSTRA - AS 50 DO JOGO ENTRAM SE O MODELO FOR APROVADO",
  hint:"MOUSE MOVER · ESPACO DIVIDIR · W EJETAR · CLIQUE MISSIL",
  back:"◄ VOLTAR",equipped:"EM USO",owned:"EQUIPAR",lbTitle:"PLACAR",massLabel:"MASSA",
  youLabel:"PLANETA",killsWord:"ABATES",botTag:"*",dead:"GAME OVER",deadIcon:"☠",
  deadSub:"CONTINUE? A GALAXIA SEGUE SEM VOCE",eatenBy:"DEVORADO POR",respawn:"► RENASCER",menu:"MENU"};

window.THEME={
id:"pixel",name:"Pixel 16-bit",skins:u.SKINS,rarity:u.RARITY,renderScale:.42,
rarityColor:{free:"#8b97cc",common:"#7bd44b",rare:"#4aa3ff",epic:"#c56bff",legendary:"#ffd23d"},
labels:LB,

init(){const rand=u.mulberry(9);stars=[];
  for(let i=0;i<380;i++)stars.push({x:Math.round(rand()*WW/6)*6,y:Math.round(rand()*WH/6)*6,
    s:rand()<.15?2:1,c:rand()<.7?"#e8edff":rand()<.5?"#8b97cc":"#ffd23d"});
  dith=document.createElement("canvas");dith.width=dith.height=4;
  const d=dith.getContext("2d");d.fillStyle="rgba(0,0,0,.42)";
  d.fillRect(0,0,2,2);d.fillRect(2,2,2,2);},

drawBg(c,W,H){c.fillStyle=PAL.bg;c.fillRect(0,0,W,H);},

drawWorld(c,cam,t){
  c.imageSmoothingEnabled=false;
  stars.forEach(s=>{c.fillStyle=s.c;c.fillRect(s.x,s.y,s.s*4,s.s*4);});
  u.grid(c,96,PAL.grid,2);
  c.fillStyle=PAL.wall;
  c.fillRect(-24,-24,WW+48,24);c.fillRect(-24,WH,WW+48,24);
  c.fillRect(-24,0,24,WH);c.fillRect(WW,0,24,WH);
  c.fillStyle=q(PAL.wall,-.4);
  for(let x=0;x<WW;x+=48){c.fillRect(x,-24,24,24);c.fillRect(x+24,WH,24,24);}
  for(let y=0;y<WH;y+=48){c.fillRect(-24,y,24,24);c.fillRect(WW,y+24,24,24);}},

drawFood(c,f,t){
  const x=Math.round(f.x),y=Math.round(f.y),r=Math.max(3,Math.round(f.r*.9));
  if(f.type==="missile_ammo"||f.type.indexOf("powerup_")===0){
    const col={missile_ammo:PAL.orange,powerup_speed:PAL.yellow,powerup_magnet:"#c56bff",powerup_shield:"#4aa3ff"}[f.type];
    const bob=Math.round(Math.sin(t*.005+f.seed)*3);
    c.fillStyle=PAL.ink;c.fillRect(x-r-2,y-r-2+bob,r*2+4,r*2+4);
    c.fillStyle=col;c.fillRect(x-r,y-r+bob,r*2,r*2);
    c.fillStyle=q(col,.5);c.fillRect(x-r,y-r+bob,r*2,2);c.fillRect(x-r,y-r+bob,2,r*2);
    c.fillStyle=PAL.ink;c.font=`bold ${Math.round(r*1.5)}px monospace`;c.textAlign="center";c.textBaseline="middle";
    c.fillText({missile_ammo:"M",powerup_speed:"V",powerup_magnet:"I",powerup_shield:"E"}[f.type],x,y+bob+1);return;}
  if(f.type==="star"){c.fillStyle=f.color;c.fillRect(x-r,y-2,r*2,4);c.fillRect(x-2,y-r,4,r*2);return;}
  if(f.type==="comet"){c.fillStyle=q(f.color,-.35);c.fillRect(x-r*4,y-2,r*3,4);
    c.fillStyle=f.color;c.fillRect(x-r,y-r,r*2,r*2);return;}
  c.fillStyle=f.color;c.fillRect(x-r,y-r,r*2,r*2);
  c.fillStyle="rgba(255,255,255,.35)";c.fillRect(x-r,y-r,r,r);},

drawEjected(c,e){const x=Math.round(e.x),y=Math.round(e.y),r=Math.round(e.r*.8);
  c.fillStyle=PAL.ink;c.fillRect(x-r-2,y-r-2,r*2+4,r*2+4);
  c.fillStyle=e.color;c.fillRect(x-r,y-r,r*2,r*2);},

drawVirus(c,v){c.save();c.translate(Math.round(v.x),Math.round(v.y));
  u.spikes(c,v.r,12,.72,0);c.fillStyle=PAL.ink;c.lineWidth=6;c.strokeStyle=PAL.ink;c.stroke();
  c.fillStyle=PAL.green;c.fill();
  u.spikes(c,v.r*.55,12,.72,0);c.fillStyle=PAL.greenD;c.fill();
  c.restore();},

drawMissile(c,m){const x=Math.round(m.x),y=Math.round(m.y),r=Math.round(m.r*.8);
  m.trail.forEach((p,i)=>{if(i%3)return;c.fillStyle=i>8?"#ffd23d":"#8b97cc";
    c.fillRect(Math.round(p.x)-2,Math.round(p.y)-2,4,4);});
  c.fillStyle=PAL.ink;c.fillRect(x-r-2,y-r-2,r*2+4,r*2+4);
  c.fillStyle=PAL.red;c.fillRect(x-r,y-r,r*2,r*2);
  c.fillStyle=PAL.yellow;c.fillRect(x-r,y-r,r,r);},

drawCell(c,pc,p,isMe,t,prev){
  const r=Math.round(pc.displayR||pc.r),sk=p.skin,col=sk.color;
  c.save();c.translate(Math.round(pc.x),Math.round(pc.y));
  if(sk.ring){c.save();c.scale(1,.3);c.strokeStyle=q(col,.35);c.lineWidth=r*.4;
    c.beginPath();c.arc(0,0,r*1.6,0,6.283);c.stroke();c.restore();}
  c.fillStyle=PAL.ink;c.beginPath();c.arc(0,0,r+3,0,6.283);c.fill();
  c.fillStyle=q(col,0);c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
  c.save();c.beginPath();c.arc(0,0,r,0,6.283);c.clip();
  c.fillStyle=q(col,.3);c.beginPath();c.arc(-r*.25,-r*.25,r*.72,0,6.283);c.fill();   // luz
  if(dith){const pt=c.createPattern(dith,"repeat");c.fillStyle=pt;                    // sombra por dithering
    c.beginPath();c.arc(r*.62,r*.66,r*1.05,0,6.283);c.fill();}
  c.restore();
  if(isMe){c.strokeStyle=PAL.txt;c.lineWidth=3;c.beginPath();c.arc(0,0,r+1,0,6.283);c.stroke();}
  if(pc.mergeTimer>0){c.strokeStyle=PAL.yellow;c.lineWidth=3;c.beginPath();
    c.arc(0,0,r+7,-1.5708,-1.5708+(1-pc.mergeTimer/u.mergeTime(pc.r))*6.283);c.stroke();}
  const pw=Object.keys(p._powerups||{});
  if(pw.length){const cl={speed:PAL.yellow,magnet:"#c56bff",shield:"#4aa3ff"};
    pw.forEach((k,i)=>{if(Math.floor(t/200)%2)return;c.strokeStyle=cl[k];c.lineWidth=2;
      c.beginPath();c.arc(0,0,r*(1.2+i*.16),0,6.283);c.stroke();});}
  if(!prev&&r>10){const fs=Math.max(7,Math.round(r*.3));
    u.outText(c,p.name.toUpperCase(),0,-fs*.3,fs,PAL.txt,PAL.ink,"monospace");
    u.outText(c,String(Math.round(pc.r*pc.r/10)),0,fs*.9,Math.max(6,fs*.75),PAL.yellow,PAL.ink,"monospace");}
  c.restore();},

drawHud(c,W,H,g){
  const MS=68,MP=7,mx=W-MS-MP,my=H-MS-MP;
  const frame=(x,y,w,h)=>{c.fillStyle=PAL.hudD;c.fillRect(x,y,w,h);
    c.fillStyle=PAL.hudL;c.fillRect(x,y,w,2);c.fillRect(x,y,2,h);
    c.fillStyle=q(PAL.hudD,-.5);c.fillRect(x,y+h-2,w,2);c.fillRect(x+w-2,y,2,h);};
  frame(mx,my,MS,MS);
  const IN=3,sc=(MS-IN*2)/WW;
  c.fillStyle=PAL.bg;c.fillRect(mx+IN,my+IN,MS-IN*2,MS-IN*2);
  g.viruses.forEach(v=>{c.fillStyle=PAL.green;c.fillRect(mx+IN+v.x*sc-1,my+IN+v.y*sc-1,2,2);});
  Object.values(g.players).filter(p=>!p.dead).forEach(p=>{const me=p.id===g.me;
    c.fillStyle=me?"#fff":p.color;
    c.fillRect(mx+IN+(p.pieces.reduce((s,q2)=>s+q2.x,0)/p.pieces.length)*sc-(me?2:1),
               my+IN+(p.pieces.reduce((s,q2)=>s+q2.y,0)/p.pieces.length)*sc-(me?2:1),me?4:2,me?4:2);});
  [["DIVIDIR","ESP",g.splitCD>0,0],["EJETAR","W",g.ejectCD>0,1]].forEach(([lb,key,cd,i])=>{
    const bw=44,bh=20,bx=W-MP-bw-i*(bw+5),by=my-bh-6;
    c.fillStyle=cd?"#3a4160":PAL.hud;c.fillRect(bx,by,bw,bh);
    c.fillStyle=cd?"#4a5170":PAL.hudL;c.fillRect(bx,by,bw,2);c.fillRect(bx,by,2,bh);
    c.fillStyle=q(PAL.hudD,-.4);c.fillRect(bx,by+bh-2,bw,2);c.fillRect(bx+bw-2,by,2,bh);
    c.fillStyle=cd?"#6d76a0":PAL.txt;c.textAlign="center";c.textBaseline="middle";
    c.font="bold 7px monospace";c.fillText(lb,bx+bw/2,by+7);
    c.fillStyle=cd?"#5a6288":PAL.dim;c.font="6px monospace";c.fillText("["+key+"]",bx+bw/2,by+14);});
  frame(MP,MP,42,13);
  c.fillStyle=g.fps>=50?PAL.green:g.fps>=30?PAL.yellow:PAL.red;
  c.font="bold 7px monospace";c.textAlign="left";c.textBaseline="middle";c.fillText("FPS "+g.fps,MP+4,MP+7);
  const me=g.players[g.me];
  if(me&&me._missiles>0){frame(MP,MP+17,52,15);
    c.fillStyle=PAL.orange;c.font="bold 8px monospace";c.textAlign="left";c.textBaseline="middle";
    c.fillText("MSL x"+me._missiles,MP+4,MP+25);}},

css:`
body{font-family:'Courier New',monospace;image-rendering:pixelated}
canvas#game,.skin-card canvas,.skinprev{image-rendering:pixelated}
#hud-lb{left:auto;right:16px;top:16px;background:#141a33;border:3px solid #5a6db5;border-radius:0;
  padding:9px 12px;color:#e8edff;font-size:12px;min-width:200px;box-shadow:4px 4px 0 rgba(0,0,0,.5)}
.ph{font-size:10px;letter-spacing:3px;color:#ffd23d;text-align:center;font-weight:700}
.lb-row{font-size:11.5px;color:#b6c0ea;letter-spacing:.5px}
.lb-row.mine{color:#ffd23d;font-weight:700}
.lb-row b{color:#7bd44b;font-weight:400}
#hud-score{top:auto;right:auto;bottom:16px;left:16px;text-align:left;background:#141a33;border:3px solid #5a6db5;
  padding:9px 12px;color:#e8edff;box-shadow:4px 4px 0 rgba(0,0,0,.5)}
.score-big{font-size:24px;font-weight:700;color:#ffd23d;letter-spacing:1px}
.score-sub{font-size:9px;color:#8b97cc;letter-spacing:2px;margin-bottom:6px}
.score-row{justify-content:flex-start;font-size:10.5px;color:#b6c0ea;letter-spacing:.5px}
.score-row.dim{color:#5e6893}
.btn-mini{background:#2b3a67;border:3px solid #5a6db5;border-radius:0;padding:4px 10px;font-size:10.5px;
  color:#e8edff;letter-spacing:1px}
.btn-mini:active{background:#1b2244}
.screen{background:rgba(10,13,28,.86);image-rendering:pixelated}
.menu-card,.dead-card,.shop-wrap{background:#1b2244;border:4px solid #5a6db5;border-radius:0;
  padding:22px 24px;color:#e8edff;box-shadow:6px 6px 0 rgba(0,0,0,.55)}
.brand{font-size:38px;font-weight:700;letter-spacing:4px;color:#ffd23d;text-shadow:3px 3px 0 #0a0d1c}
.tagline{font-size:10px;color:#8b97cc;letter-spacing:2px;text-align:center}
.coinbar{display:flex;align-items:center;gap:8px;background:#141a33;border:3px solid #ffd23d;padding:5px 14px;
  font-size:14px;color:#ffd23d;letter-spacing:1px}
.coinbar span{font-size:9px;color:#8a7526;letter-spacing:2px}
.field label{font-size:9px;color:#8b97cc;letter-spacing:3px}
.field input{background:#0a0d1c;border:3px solid #5a6db5;border-radius:0;padding:10px;font-size:16px;
  color:#e8edff;outline:none;font-family:inherit;letter-spacing:2px}
.skinrow{background:#141a33;border:3px solid #2b3a67;padding:7px 9px}
.skinmeta b{font-size:12px;letter-spacing:1px}.skinmeta i{font-style:normal;font-size:9.5px;letter-spacing:1px}
.btn-primary{background:#7bd44b;border:4px solid #0a0d1c;border-radius:0;padding:12px;font-size:17px;
  font-weight:700;color:#0a2a0a;letter-spacing:4px;box-shadow:0 5px 0 #3f8a2a}
.btn-primary:active{transform:translateY(3px);box-shadow:0 2px 0 #3f8a2a}
.btn-secondary{background:#ffd23d;border:4px solid #0a0d1c;border-radius:0;padding:10px;font-size:13px;
  font-weight:700;color:#3a2b04;letter-spacing:3px;box-shadow:0 4px 0 #a8850f}
.hint{font-size:9px;color:#5e6893;letter-spacing:1.5px}
.shop-title{font-size:17px;font-weight:700;letter-spacing:5px;text-align:center;color:#ffd23d;text-shadow:2px 2px 0 #0a0d1c}
.skin-card{background:#141a33;border:3px solid #2b3a67;border-radius:0;color:#e8edff}
.skin-card:hover{border-color:#5a6db5}
.skin-card.eq{border-color:#ffd23d;background:#242c55}
.skin-card b{font-size:11px;letter-spacing:.5px}.skin-card i{font-style:normal;font-size:9px;letter-spacing:1px}
.skin-card em{font-style:normal;font-size:11px;color:#ffd23d}
.badge{background:#ffd23d;color:#0a0d1c;font-size:8px;font-weight:700;padding:2px 5px;letter-spacing:1px}
.shop-note{font-size:9px;color:#5e6893;letter-spacing:1px}
.dead-card{background:#3a1430;border-color:#e8524f}
.dead-icon{font-size:44px;color:#e8524f}
.dead-title{font-size:32px;font-weight:700;color:#e8524f;letter-spacing:5px;text-shadow:3px 3px 0 #0a0d1c}
.dead-sub{font-size:9px;color:#c08a9a;letter-spacing:2px}
.dead-by span{font-size:9px;color:#8b97cc;letter-spacing:2px}
.dead-by b{font-size:19px;color:#ffd23d;letter-spacing:2px}
.dead-stats b{font-size:18px;color:#7bd44b}
.dead-stats i{font-style:normal;font-size:8px;color:#8b97cc;letter-spacing:1px}
`};
})();

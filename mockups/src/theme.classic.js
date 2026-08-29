// ── MODELO 1 — AGAR ESPACIAL CLÁSSICO ─────────────────────────────────────────
// A tradução mais fiel do agar.io: tudo chapado, sem brilho, grid fino no fundo,
// círculo com aro escuro, nome + massa no centro, comida em pontinhos, vírus
// espinhoso verde. Tema escuro espacial.
(function(){
const u=MOCK.u,WW=u.WW,WH=u.WH;
function sh(hex,a){let n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255;
  const f=x=>Math.max(0,Math.min(255,Math.round(a>0?x+(255-x)*a:x*(1+a))));return`rgb(${f(r)},${f(g)},${f(b)})`;}
const BG="#0a0f1e",GRID="rgba(255,255,255,.045)",BORDER="rgba(90,140,255,.5)";
let stars=[];

const LB={title:"WARSPACE.IO",tagline:"Conquiste a galáxia. Divida, ejete e devore.",
  coinIcon:"🪙",coinWord:"moedas",nameLabel:"Nome do seu planeta:",swap:"Trocar",
  play:"🚀 JOGAR",shop:"🛍️ LOJA DE SKINS",shopShort:"🛍️ Loja",shopTitle:"LOJA DE SKINS",
  shopNote:"12 skins de amostra — as 50 do jogo entram quando o modelo for aprovado.",
  hint:"🖱️ mouse = mover · ESPAÇO = dividir · W = ejetar · clique = míssil",
  back:"← Voltar",equipped:"EQUIPADA",owned:"Equipar",lbTitle:"PLACAR",massLabel:"massa total",
  youLabel:"planeta",killsWord:"abates",botTag:"🤖",dead:"ABSORVIDO",deadIcon:"💥",
  deadSub:"— a galáxia continua sem você —",eatenBy:"DEVORADO POR",respawn:"🔄 RENASCER",menu:"Menu"};

window.THEME={
id:"classic",name:"Agar Espacial Clássico",skins:u.SKINS,rarity:u.RARITY,
rarityColor:{free:"#8a97ab",common:"#7fd4ff",rare:"#4a9eff",epic:"#c06bff",legendary:"#ffc83d"},
labels:LB,

init(){const rand=u.mulberry(7);stars=[];
  for(let i=0;i<520;i++)stars.push({x:rand()*WW,y:rand()*WH,r:.6+rand()*1.5,a:.12+rand()*.4});},

drawBg(c,W,H){c.fillStyle=BG;c.fillRect(0,0,W,H);},

drawWorld(c){
  c.fillStyle="#fff";stars.forEach(s=>{c.globalAlpha=s.a;c.beginPath();c.arc(s.x,s.y,s.r,0,6.283);c.fill();});
  c.globalAlpha=1;
  u.grid(c,60,GRID,1);
  c.strokeStyle=BORDER;c.lineWidth=8;c.strokeRect(0,0,WW,WH);},

drawFood(c,f,t){
  if(f.type==="missile_ammo"||f.type.indexOf("powerup_")===0){
    c.fillStyle=f.color;c.beginPath();c.arc(f.x,f.y,f.r,0,6.283);c.fill();
    c.font=`${f.r*1.15}px serif`;c.textAlign="center";c.textBaseline="middle";
    c.fillText({missile_ammo:"🚀",powerup_speed:"⚡",powerup_magnet:"🧲",powerup_shield:"🛡️"}[f.type],f.x,f.y+1);return;}
  c.fillStyle=f.color;
  if(f.type==="comet"){c.globalAlpha=.35;c.fillRect(f.x-f.r*3.2,f.y-f.r*.22,f.r*3,f.r*.44);c.globalAlpha=1;
    c.beginPath();c.arc(f.x,f.y,f.r*.85,0,6.283);c.fill();}
  else if(f.type==="star"){c.save();c.translate(f.x,f.y);u.spikes(c,f.r*1.15,4,.34,0);c.fill();c.restore();}
  else{c.beginPath();c.arc(f.x,f.y,f.r,0,6.283);c.fill();}},

drawEjected(c,e){c.fillStyle=e.color;c.beginPath();c.arc(e.x,e.y,e.r,0,6.283);c.fill();
  c.strokeStyle="rgba(0,0,0,.25)";c.lineWidth=2;c.stroke();},

drawVirus(c,v){c.save();c.translate(v.x,v.y);const p=1+Math.sin(v.pulseT)*.03;
  u.spikes(c,v.r*p,22,.9,0);c.fillStyle="#25d366";c.fill();
  c.strokeStyle="#14803e";c.lineWidth=Math.max(2,v.r*.06);c.stroke();
  u.spikes(c,v.r*p*.72,22,.9,0);c.fillStyle="rgba(255,255,255,.10)";c.fill();c.restore();},

drawMissile(c,m){c.save();c.translate(m.x,m.y);c.rotate(Math.atan2(m.vy,m.vx));
  c.globalAlpha=.4;c.fillStyle="#ff9040";c.fillRect(-m.r*3.4,-m.r*.22,m.r*3,m.r*.44);c.globalAlpha=1;
  c.fillStyle="#ffd9a0";c.beginPath();c.moveTo(m.r*1.3,0);c.lineTo(-m.r*.9,-m.r*.7);c.lineTo(-m.r*.9,m.r*.7);
  c.closePath();c.fill();c.strokeStyle="#c0562a";c.lineWidth=2;c.stroke();c.restore();},

drawCell(c,pc,p,isMe,t,prev){
  const r=pc.displayR||pc.r,sk=p.skin;
  c.save();c.translate(pc.x,pc.y);
  if(sk.ring){c.save();c.scale(1,.3);c.strokeStyle=sh(sk.color,.25);c.lineWidth=r*.42;c.globalAlpha=.75;
    c.beginPath();c.arc(0,0,r*1.55,0,6.283);c.stroke();c.globalAlpha=1;c.restore();}
  c.fillStyle=sk.color;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
  c.strokeStyle=isMe?"#ffffff":sh(sk.color,-.4);c.lineWidth=Math.max(2.5,r*.085);c.stroke();
  if(r>20){c.save();c.beginPath();c.arc(0,0,r*.94,0,6.283);c.clip();c.globalAlpha=.14;
    c.font=`${r*1.7}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(sk.emoji,0,r*.04);c.restore();}
  if(pc.mergeTimer>0){c.strokeStyle="rgba(255,255,255,.6)";c.lineWidth=2.5;c.beginPath();
    c.arc(0,0,r+5,-1.5708,-1.5708+(1-pc.mergeTimer/u.mergeTime(pc.r))*6.283);c.stroke();}
  const pw=Object.keys(p._powerups||{});
  if(pw.length){const cl={speed:"#ffdd00",magnet:"#ff66ff",shield:"#44aaff"};
    pw.forEach((k,i)=>{c.strokeStyle=cl[k];c.lineWidth=2.5;c.globalAlpha=.55+.45*Math.sin(t*.012+i);
      c.beginPath();c.arc(0,0,r*(1.16+i*.14),0,6.283);c.stroke();c.globalAlpha=1;});}
  if(!prev&&r>13){
    const fs=Math.max(11,r*.32);
    u.outText(c,p.name,0,-fs*.28,fs,"#fff","rgba(0,0,0,.8)");
    u.outText(c,String(Math.round(pc.r*pc.r/10)),0,fs*.72,fs*.72,"rgba(255,255,255,.9)","rgba(0,0,0,.8)");}
  c.restore();},

drawHud(c,W,H,g){
  const MS=150,MP=16,mx=W-MS-MP,my=H-MS-MP;
  c.fillStyle="rgba(6,10,22,.72)";c.strokeStyle="rgba(90,140,255,.28)";c.lineWidth=1;
  u.rr(c,mx,my,MS,MS,4);c.fill();c.stroke();
  const sc=MS/WW;
  c.strokeStyle="rgba(255,255,255,.07)";c.lineWidth=1;
  for(let i=1;i<5;i++){c.beginPath();c.moveTo(mx+MS*i/5,my);c.lineTo(mx+MS*i/5,my+MS);
    c.moveTo(mx,my+MS*i/5);c.lineTo(mx+MS,my+MS*i/5);c.stroke();}
  g.viruses.forEach(v=>{c.fillStyle="rgba(37,211,102,.55)";c.beginPath();c.arc(mx+v.x*sc,my+v.y*sc,2,0,6.283);c.fill();});
  Object.values(g.players).filter(p=>!p.dead).forEach(p=>{const me=p.id===g.me;
    c.fillStyle=me?"#fff":p.color;c.beginPath();
    c.arc(mx+(p.pieces.reduce((s,q)=>s+q.x,0)/p.pieces.length)*sc,my+(p.pieces.reduce((s,q)=>s+q.y,0)/p.pieces.length)*sc,me?4:2.4,0,6.283);c.fill();});
  [["DIVIDIR","ESPAÇO",g.splitCD>0,0],["EJETAR","W",g.ejectCD>0,1]].forEach(([lb,key,cd,i])=>{
    const bw=86,bh=38,bx=W-MP-bw-i*(bw+8),by=my-bh-10;
    c.fillStyle=cd?"rgba(30,36,52,.8)":"rgba(40,86,190,.85)";c.strokeStyle=cd?"rgba(90,100,120,.5)":"rgba(120,170,255,.7)";
    c.lineWidth=1.5;u.rr(c,bx,by,bw,bh,4);c.fill();c.stroke();
    c.fillStyle=cd?"#69748c":"#eaf1ff";c.textAlign="center";c.textBaseline="middle";
    c.font="bold 12px Arial";c.fillText(lb,bx+bw/2,by+bh*.38);
    c.font="10px Arial";c.fillStyle=cd?"#5a637a":"rgba(234,241,255,.72)";c.fillText("["+key+"]",bx+bw/2,by+bh*.72);});
  c.fillStyle="rgba(6,10,22,.6)";u.rr(c,MP,MP,66,22,3);c.fill();
  c.fillStyle=g.fps>=50?"#3ddc84":g.fps>=30?"#ffcc00":"#ff5252";
  c.font="bold 12px monospace";c.textAlign="left";c.textBaseline="middle";c.fillText("FPS "+g.fps,MP+7,MP+11);
  const me=g.players[g.me];
  if(me&&me._missiles>0){c.fillStyle="rgba(6,10,22,.72)";c.strokeStyle="rgba(255,140,40,.5)";c.lineWidth=1;
    u.rr(c,MP,MP+28,104,32,4);c.fill();c.stroke();
    c.font="16px serif";c.textAlign="left";c.textBaseline="middle";c.fillText("🚀",MP+10,MP+44);
    c.fillStyle="#ff9c3d";c.font="bold 15px Arial";c.fillText("x"+me._missiles,MP+34,MP+44);
    c.font="10px Arial";c.fillStyle="rgba(255,156,61,.7)";c.fillText("clique",MP+62,MP+45);}},

css:`
body{font-family:Arial,Helvetica,sans-serif}
/* HUD no layout do agar.io: placar em cima à direita, massa embaixo à esquerda */
#hud-lb{left:auto;right:16px;top:16px;background:rgba(6,10,22,.72);border:1px solid rgba(90,140,255,.28);
  border-radius:6px;padding:10px 14px;color:#dbe6ff;font-size:13px;min-width:200px}
.ph{font-size:11px;letter-spacing:2px;color:#7f9ac9;text-align:center;font-weight:700}
.lb-row{font-size:13px;color:#c3d2ec}
.lb-row.mine{color:#ffd23d;font-weight:700}
.lb-row b{color:#7fd4ff;font-weight:400}
#hud-score{top:auto;right:auto;bottom:16px;left:16px;text-align:left;
  background:rgba(6,10,22,.72);border:1px solid rgba(90,140,255,.28);border-radius:6px;padding:10px 14px;color:#dbe6ff}
.score-big{font-size:26px;font-weight:700;color:#fff}
.score-sub{font-size:11px;color:#7f9ac9;letter-spacing:1px;margin-bottom:6px}
.score-row{justify-content:flex-start;font-size:11.5px;color:#9fb2d4}
.score-row.dim{color:#5c6d8c}
.btn-mini{background:rgba(40,86,190,.5);border:1px solid rgba(120,170,255,.5);border-radius:4px;
  padding:5px 12px;font-size:11.5px;color:#dbe6ff}
.screen{background:radial-gradient(ellipse at 50% 35%,rgba(16,26,54,.7),rgba(5,7,15,.93))}
.menu-card,.dead-card,.shop-wrap{background:rgba(10,16,32,.92);border:1px solid rgba(90,140,255,.28);
  border-radius:10px;padding:26px 28px;color:#dbe6ff}
.brand{font-size:42px;font-weight:700;letter-spacing:3px;color:#fff}
.tagline{font-size:14px;color:#8fa6cc}
.coinbar{display:flex;align-items:center;gap:7px;background:rgba(255,200,0,.08);border:1px solid rgba(255,200,0,.28);
  border-radius:6px;padding:6px 16px;font-size:15px;color:#ffcc44}
.coinbar span{font-size:12px;color:#9a7c2a}
.field label{font-size:12px;color:#8fa6cc}
.field input{background:rgba(4,8,18,.9);border:2px solid #2f6bd8;border-radius:6px;padding:11px;font-size:17px;color:#fff;outline:none}
.skinrow{background:rgba(255,255,255,.04);border:1px solid rgba(90,140,255,.2);border-radius:8px;padding:8px 10px}
.skinmeta b{font-size:14px}.skinmeta i{font-style:normal;font-size:11px}
.btn-primary{background:#2f6bd8;border:none;border-radius:6px;padding:14px;font-size:18px;font-weight:700;color:#fff;letter-spacing:1px}
.btn-primary:hover{background:#3d7cf0}
.btn-secondary{background:rgba(255,200,0,.1);border:1px solid rgba(255,200,0,.35);border-radius:6px;
  padding:11px;font-size:14px;font-weight:700;color:#ffcc44}
.hint{font-size:12px;color:#6d80a3}
.shop-title{font-size:20px;font-weight:700;letter-spacing:2px;text-align:center;color:#fff}
.skin-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#dbe6ff}
.skin-card:hover{background:rgba(255,255,255,.08)}
.skin-card.eq{border-color:#2f6bd8;background:rgba(47,107,216,.16)}
.skin-card b{font-size:12.5px}.skin-card i{font-style:normal;font-size:10.5px}
.skin-card em{font-style:normal;font-size:12px;color:#ffcc44}
.badge{background:#2f6bd8;color:#fff;font-size:8.5px;font-weight:700;padding:2px 6px;border-radius:3px}
.shop-note{font-size:11.5px;color:#6d80a3}
.dead-card{border-color:rgba(255,70,70,.35)}
.dead-icon{font-size:52px}
.dead-title{font-size:38px;font-weight:700;color:#ff4d4d;letter-spacing:3px}
.dead-sub{font-size:12px;color:#c9707a}
.dead-by span{font-size:11px;color:#7f8fa8;letter-spacing:1px}
.dead-by b{font-size:22px;color:#ffaa44}
.dead-stats b{font-size:20px;color:#4ecdc4}
.dead-stats i{font-style:normal;font-size:10px;color:#5c6d8c}
`};
})();

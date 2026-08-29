// ── MODELO 4 — CARTOON CÓSMICO ────────────────────────────────────────────────
// Mesma leitura do agar.io, acabamento de desenho: contorno preto grosso, cores
// saturadas, brilho chapado, tipografia pesada. Cara de jogo mobile.
(function(){
const u=MOCK.u,WW=u.WW,WH=u.WH;
function sh(hex,a){let n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255;
  const f=x=>Math.max(0,Math.min(255,Math.round(a>0?x+(255-x)*a:x*(1+a))));return`rgb(${f(r)},${f(g)},${f(b)})`;}
const INK="#141026",BG="#1b2450";
let stars=[],props=[];

const LB={title:"WARSPACE.IO",tagline:"Conquiste a galáxia. Divida, ejete e devore!",
  coinIcon:"🪙",coinWord:"moedas",nameLabel:"Nome do seu planeta:",swap:"Trocar",
  play:"🚀 JOGAR!",shop:"🛍️ LOJA DE SKINS",shopShort:"🛍️ Loja",shopTitle:"LOJA DE SKINS",
  shopNote:"12 skins de amostra — as 50 do jogo entram quando o modelo for aprovado.",
  hint:"🖱️ mouse = mover · ESPAÇO = dividir · W = ejetar · clique = míssil",
  back:"← Voltar",equipped:"EQUIPADA",owned:"Equipar",lbTitle:"🏆 PLACAR",massLabel:"massa total",
  youLabel:"planeta",killsWord:"abates",botTag:"🤖",dead:"ABSORVIDO!",deadIcon:"💥",
  deadSub:"— a galáxia continua sem você —",eatenBy:"DEVORADO POR",respawn:"🔄 RENASCER",menu:"Menu"};

window.THEME={
id:"toon",name:"Cartoon Cósmico",skins:u.SKINS,rarity:u.RARITY,
rarityColor:{free:"#9aa3c0",common:"#3fc4ff",rare:"#3d7bff",epic:"#c56bff",legendary:"#ffc22e"},
labels:LB,

init(){const rand=u.mulberry(21);stars=[];props=[];
  for(let i=0;i<230;i++)stars.push({x:rand()*WW,y:rand()*WH,r:2+rand()*5,big:rand()<.22});
  const pal=["#ff6b4a","#ffc22e","#3fc4ff","#c56bff","#4ecdc4"];
  for(let i=0;i<14;i++)props.push({x:rand()*WW,y:rand()*WH,r:90+rand()*160,
    col:pal[Math.floor(rand()*pal.length)],ring:rand()<.4,rot:rand()*6.28});},

drawBg(c,W,H){const gd=c.createLinearGradient(0,0,0,H);gd.addColorStop(0,"#232f63");gd.addColorStop(1,"#12183a");
  c.fillStyle=gd;c.fillRect(0,0,W,H);},

drawWorld(c,cam,t){
  // planetas gigantes de cenário (bem atrás, chapados)
  c.globalAlpha=.5;
  props.forEach(p=>{c.save();c.translate(p.x,p.y);c.rotate(p.rot);
    if(p.ring){c.save();c.scale(1,.32);c.strokeStyle=sh(p.col,-.15);c.lineWidth=p.r*.3;
      c.beginPath();c.arc(0,0,p.r*1.5,0,6.283);c.stroke();c.restore();}
    c.fillStyle=sh(p.col,-.45);c.beginPath();c.arc(0,0,p.r,0,6.283);c.fill();
    c.strokeStyle=INK;c.lineWidth=p.r*.06;c.stroke();
    c.fillStyle=sh(p.col,-.28);c.beginPath();c.arc(-p.r*.3,-p.r*.3,p.r*.55,0,6.283);c.fill();c.restore();});
  c.globalAlpha=1;
  // estrelas cartoon
  stars.forEach(s=>{if(s.big){c.save();c.translate(s.x,s.y);u.spikes(c,s.r*2.2,4,.3,0);
      c.fillStyle="#fff5c2";c.fill();c.strokeStyle=INK;c.lineWidth=1.6;c.stroke();c.restore();}
    else{c.fillStyle="rgba(255,255,255,.5)";c.beginPath();c.arc(s.x,s.y,s.r*.5,0,6.283);c.fill();}});
  u.grid(c,120,"rgba(255,255,255,.045)",2);
  c.strokeStyle=INK;c.lineWidth=16;c.strokeRect(0,0,WW,WH);
  c.strokeStyle="#ffc22e";c.lineWidth=6;c.setLineDash([40,26]);c.strokeRect(0,0,WW,WH);c.setLineDash([]);},

drawFood(c,f,t){
  const r=f.r*1.15;c.save();c.translate(f.x,f.y);c.lineJoin="round";
  c.strokeStyle=INK;c.lineWidth=Math.max(1.8,r*.22);
  if(f.type==="missile_ammo"||f.type.indexOf("powerup_")===0){
    const bob=Math.sin(t*.005+f.seed)*r*.16;c.translate(0,bob);
    c.fillStyle=f.color;c.beginPath();c.arc(0,0,r*1.15,0,6.283);c.fill();c.stroke();
    c.font=`${r*1.25}px serif`;c.textAlign="center";c.textBaseline="middle";
    c.fillText({missile_ammo:"🚀",powerup_speed:"⚡",powerup_magnet:"🧲",powerup_shield:"🛡️"}[f.type],0,1);c.restore();return;}
  c.fillStyle=f.color;
  if(f.type==="star"){u.spikes(c,r*1.25,5,.45,t*.0004+f.seed);c.fill();c.stroke();}
  else if(f.type==="comet"){c.globalAlpha=.35;c.fillStyle=f.color;c.beginPath();
    c.moveTo(-r*2.6,0);c.lineTo(-r*.2,-r*.7);c.lineTo(-r*.2,r*.7);c.closePath();c.fill();c.globalAlpha=1;
    c.fillStyle=f.color;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.stroke();
    c.fillStyle="rgba(255,255,255,.55)";c.beginPath();c.arc(-r*.28,-r*.3,r*.26,0,6.283);c.fill();}
  else{c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.stroke();
    c.fillStyle="rgba(255,255,255,.55)";c.beginPath();c.arc(-r*.3,-r*.32,r*.26,0,6.283);c.fill();}
  c.restore();},

drawEjected(c,e){c.save();c.translate(e.x,e.y);c.fillStyle=e.color;
  c.beginPath();c.arc(0,0,e.r,0,6.283);c.fill();c.strokeStyle=INK;c.lineWidth=2.4;c.stroke();
  c.fillStyle="rgba(255,255,255,.5)";c.beginPath();c.arc(-e.r*.28,-e.r*.3,e.r*.28,0,6.283);c.fill();c.restore();},

drawVirus(c,v,t){c.save();c.translate(v.x,v.y);const p=1+Math.sin(v.pulseT)*.05;c.lineJoin="round";
  u.spikes(c,v.r*p,14,.76,t*.0002);c.fillStyle="#3ddc5f";c.fill();
  c.strokeStyle=INK;c.lineWidth=Math.max(3,v.r*.1);c.stroke();
  c.beginPath();c.arc(0,0,v.r*p*.62,0,6.283);c.fillStyle="#7cf58f";c.fill();c.lineWidth=Math.max(2,v.r*.06);c.stroke();
  c.fillStyle="rgba(255,255,255,.55)";c.beginPath();c.arc(-v.r*.22,-v.r*.24,v.r*.16,0,6.283);c.fill();c.restore();},

drawMissile(c,m){
  m.trail.forEach((pt,i)=>{const a=i/m.trail.length;c.fillStyle=`rgba(255,255,255,${a*.35})`;
    c.beginPath();c.arc(pt.x,pt.y,m.r*.8*a,0,6.283);c.fill();});
  c.save();c.translate(m.x,m.y);c.rotate(Math.atan2(m.vy,m.vx));c.lineJoin="round";
  c.strokeStyle=INK;c.lineWidth=2.6;c.fillStyle="#ff6b4a";
  c.beginPath();c.moveTo(m.r*1.5,0);c.lineTo(m.r*.1,-m.r*.75);c.lineTo(-m.r*1.1,-m.r*.6);
  c.lineTo(-m.r*1.1,m.r*.6);c.lineTo(m.r*.1,m.r*.75);c.closePath();c.fill();c.stroke();
  c.fillStyle="#fff5c2";c.beginPath();c.arc(m.r*.1,0,m.r*.34,0,6.283);c.fill();c.stroke();c.restore();},

drawCell(c,pc,p,isMe,t,prev){
  const r=pc.displayR||pc.r,sk=p.skin;
  c.save();c.translate(pc.x,pc.y);c.lineJoin="round";
  if(sk.ring){c.save();c.scale(1,.3);c.strokeStyle=sh(sk.color,.2);c.lineWidth=r*.42;
    c.beginPath();c.arc(0,0,r*1.6,0,6.283);c.stroke();
    c.strokeStyle=INK;c.lineWidth=r*.09;c.beginPath();c.arc(0,0,r*1.82,0,6.283);c.stroke();
    c.beginPath();c.arc(0,0,r*1.38,0,6.283);c.stroke();c.restore();}
  c.fillStyle=sk.color;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
  c.save();c.beginPath();c.arc(0,0,r,0,6.283);c.clip();
  c.fillStyle=sh(sk.color,-.32);c.beginPath();c.arc(r*.42,r*.46,r*1.05,0,6.283);c.fill();
  c.fillStyle="rgba(255,255,255,.35)";c.beginPath();c.ellipse(-r*.34,-r*.36,r*.4,r*.26,-.7,0,6.283);c.fill();
  if(r>24){c.globalAlpha=.2;c.font=`${r*1.6}px serif`;c.textAlign="center";c.textBaseline="middle";
    c.fillText(sk.emoji,0,r*.04);c.globalAlpha=1;}
  c.restore();
  c.strokeStyle=isMe?"#fff5c2":INK;c.lineWidth=Math.max(3,r*(isMe?.13:.1));c.beginPath();c.arc(0,0,r,0,6.283);c.stroke();
  if(isMe){c.strokeStyle=INK;c.lineWidth=Math.max(2,r*.05);c.beginPath();c.arc(0,0,r*1.08,0,6.283);c.stroke();}
  if(pc.mergeTimer>0){c.strokeStyle="#ffc22e";c.lineWidth=Math.max(3,r*.07);c.beginPath();
    c.arc(0,0,r+r*.16,-1.5708,-1.5708+(1-pc.mergeTimer/u.mergeTime(pc.r))*6.283);c.stroke();}
  const pw=Object.keys(p._powerups||{});
  if(pw.length){const cl={speed:"#ffc22e",magnet:"#c56bff",shield:"#3fc4ff"};
    pw.forEach((k,i)=>{c.strokeStyle=cl[k];c.lineWidth=Math.max(2.5,r*.07);c.globalAlpha=.6+.4*Math.sin(t*.012+i);
      c.setLineDash([r*.4,r*.3]);c.beginPath();c.arc(0,0,r*(1.24+i*.16),0,6.283);c.stroke();
      c.setLineDash([]);c.globalAlpha=1;});}
  if(!prev&&r>13){const fs=Math.max(12,r*.34);
    u.outText(c,p.name,0,-fs*.26,fs,"#fff",INK,"'Trebuchet MS',Verdana,sans-serif");
    u.outText(c,String(Math.round(pc.r*pc.r/10)),0,fs*.8,fs*.68,"#ffe9a8",INK,"'Trebuchet MS',Verdana,sans-serif");}
  c.restore();},

drawHud(c,W,H,g){
  const MS=156,MP=16,mx=W-MS-MP,my=H-MS-MP;c.lineJoin="round";
  c.fillStyle="rgba(20,16,38,.55)";u.rr(c,mx+5,my+6,MS,MS,14);c.fill();
  c.fillStyle="#232f63";c.strokeStyle=INK;c.lineWidth=4;u.rr(c,mx,my,MS,MS,14);c.fill();c.stroke();
  const IN=8,sc=(MS-IN*2)/WW;
  c.save();u.rr(c,mx+IN,my+IN,MS-IN*2,MS-IN*2,8);c.clip();
  c.fillStyle="#12183a";c.fillRect(mx+IN,my+IN,MS-IN*2,MS-IN*2);
  g.viruses.forEach(v=>{c.fillStyle="#3ddc5f";c.beginPath();c.arc(mx+IN+v.x*sc,my+IN+v.y*sc,2.4,0,6.283);c.fill();});
  Object.values(g.players).filter(p=>!p.dead).forEach(p=>{const me=p.id===g.me;
    c.fillStyle=me?"#fff5c2":p.color;c.strokeStyle=INK;c.lineWidth=1.5;c.beginPath();
    c.arc(mx+IN+(p.pieces.reduce((s,q)=>s+q.x,0)/p.pieces.length)*sc,my+IN+(p.pieces.reduce((s,q)=>s+q.y,0)/p.pieces.length)*sc,me?4.5:3,0,6.283);
    c.fill();c.stroke();});
  c.restore();
  [["DIVIDIR","ESPAÇO",g.splitCD>0,0],["EJETAR","W",g.ejectCD>0,1]].forEach(([lb,key,cd,i])=>{
    const bw=92,bh=42,bx=W-MP-bw-i*(bw+9),by=my-bh-13;
    c.fillStyle=INK;u.rr(c,bx,by+5,bw,bh,10);c.fill();
    c.fillStyle=cd?"#4a5170":"#3d7bff";c.strokeStyle=INK;c.lineWidth=3.5;u.rr(c,bx,by,bw,bh,10);c.fill();c.stroke();
    c.fillStyle=cd?"#8d94ad":"#fff";c.textAlign="center";c.textBaseline="middle";
    c.font="bold 14px 'Trebuchet MS',Verdana,sans-serif";c.fillText(lb,bx+bw/2,by+bh*.38);
    c.font="10px 'Trebuchet MS',Verdana,sans-serif";c.fillStyle=cd?"#7a819c":"rgba(255,255,255,.75)";
    c.fillText("["+key+"]",bx+bw/2,by+bh*.73);});
  c.fillStyle="rgba(20,16,38,.6)";u.rr(c,MP,MP,70,24,8);c.fill();
  c.fillStyle=g.fps>=50?"#3ddc5f":g.fps>=30?"#ffc22e":"#ff6b4a";
  c.font="bold 13px 'Trebuchet MS',Verdana,sans-serif";c.textAlign="left";c.textBaseline="middle";
  c.fillText("FPS "+g.fps,MP+8,MP+12);
  const me=g.players[g.me];
  if(me&&me._missiles>0){c.fillStyle=INK;u.rr(c,MP,MP+31,110,36,9);c.fill();
    c.fillStyle="#ff6b4a";u.rr(c,MP,MP+30,110,36,9);c.fill();c.strokeStyle=INK;c.lineWidth=3;c.stroke();
    c.font="18px serif";c.textAlign="left";c.textBaseline="middle";c.fillText("🚀",MP+10,MP+48);
    c.fillStyle="#fff";c.font="bold 17px 'Trebuchet MS',Verdana,sans-serif";c.fillText("x"+me._missiles,MP+38,MP+48);
    c.font="10px 'Trebuchet MS',Verdana,sans-serif";c.fillStyle="rgba(255,255,255,.8)";c.fillText("clique",MP+68,MP+49);}},

css:`
body{font-family:'Trebuchet MS',Verdana,sans-serif}
#hud-lb{left:auto;right:16px;top:16px;background:#232f63;border:4px solid #141026;border-radius:14px;
  padding:11px 15px;color:#eaf0ff;font-size:13px;min-width:205px;box-shadow:0 5px 0 rgba(20,16,38,.55)}
.ph{font-size:12px;letter-spacing:1px;color:#ffc22e;text-align:center;font-weight:700}
.lb-row{font-size:13px;color:#c7d2f0;font-weight:600}
.lb-row.mine{color:#ffc22e}
.lb-row b{color:#7cf58f;font-weight:700}
#hud-score{top:auto;right:auto;bottom:16px;left:16px;text-align:left;background:#232f63;border:4px solid #141026;
  border-radius:14px;padding:11px 15px;color:#eaf0ff;box-shadow:0 5px 0 rgba(20,16,38,.55)}
.score-big{font-size:30px;font-weight:700;color:#fff;text-shadow:2px 2px 0 #141026}
.score-sub{font-size:11px;color:#8fa0d8;margin-bottom:6px}
.score-row{justify-content:flex-start;font-size:12px;color:#c7d2f0}
.score-row.dim{color:#6d7bab}
.btn-mini{background:#3d7bff;border:3px solid #141026;border-radius:9px;padding:5px 12px;font-size:12px;
  color:#fff;font-weight:700;box-shadow:0 3px 0 #141026}
.btn-mini:active{transform:translateY(2px);box-shadow:0 1px 0 #141026}
.screen{background:radial-gradient(ellipse at 50% 35%,rgba(35,47,99,.72),rgba(10,14,34,.93))}
.menu-card,.dead-card,.shop-wrap{background:#232f63;border:5px solid #141026;border-radius:20px;
  padding:24px 26px;color:#eaf0ff;box-shadow:0 8px 0 rgba(20,16,38,.6)}
.brand{font-size:44px;font-weight:700;letter-spacing:2px;color:#ffc22e;text-shadow:3px 3px 0 #141026}
.tagline{font-size:14px;color:#c7d2f0}
.coinbar{display:flex;align-items:center;gap:8px;background:#141026;border:3px solid #ffc22e;border-radius:999px;
  padding:5px 16px;font-size:16px;color:#ffc22e;font-weight:700}
.coinbar span{font-size:11px;color:#a08a3c;font-weight:400}
.field label{font-size:12px;color:#8fa0d8}
.field input{background:#12183a;border:4px solid #141026;border-radius:12px;padding:11px;font-size:18px;
  color:#fff;outline:none;font-family:inherit;font-weight:700}
.skinrow{background:#1a2350;border:3px solid #141026;border-radius:12px;padding:8px 10px}
.skinmeta b{font-size:14px}.skinmeta i{font-style:normal;font-size:11px}
.btn-primary{background:#3ddc5f;border:4px solid #141026;border-radius:14px;padding:14px;font-size:19px;
  font-weight:700;color:#0d2a13;box-shadow:0 6px 0 #141026;letter-spacing:1px}
.btn-primary:active{transform:translateY(4px);box-shadow:0 2px 0 #141026}
.btn-secondary{background:#ffc22e;border:4px solid #141026;border-radius:14px;padding:11px;font-size:15px;
  font-weight:700;color:#3a2b04;box-shadow:0 5px 0 #141026}
.hint{font-size:12px;color:#8fa0d8;background:rgba(20,16,38,.4);padding:7px 12px;border-radius:10px}
.shop-title{font-size:22px;font-weight:700;letter-spacing:1px;text-align:center;color:#ffc22e;text-shadow:2px 2px 0 #141026}
.skin-card{background:#1a2350;border:3px solid #141026;border-radius:14px;color:#eaf0ff}
.skin-card:hover{background:#2a3670;transform:translateY(-2px)}
.skin-card.eq{border-color:#ffc22e;background:#2a3670}
.skin-card b{font-size:13px}.skin-card i{font-style:normal;font-size:10.5px}
.skin-card em{font-style:normal;font-size:12.5px;color:#ffc22e;font-weight:700}
.badge{background:#ffc22e;color:#141026;font-size:9px;font-weight:700;padding:2px 6px;border-radius:6px;border:2px solid #141026}
.shop-note{font-size:12px;color:#8fa0d8}
.dead-card{background:#5c1f3a;border-color:#141026}
.dead-icon{font-size:56px}
.dead-title{font-size:38px;font-weight:700;color:#ff6b4a;text-shadow:3px 3px 0 #141026;letter-spacing:1px}
.dead-sub{font-size:12.5px;color:#e0a0b0}
.dead-by span{font-size:11px;color:#e0a0b0}
.dead-by b{font-size:23px;color:#ffc22e}
.dead-stats b{font-size:21px;color:#fff}
.dead-stats i{font-style:normal;font-size:10px;color:#e0a0b0}
`};
})();

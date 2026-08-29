// ── MODELO 3 — NEON ARCADE ────────────────────────────────────────────────────
// Mesma leitura do agar.io (círculo, nome+massa, pontinhos, vírus espinhoso),
// mas em vetor emissivo: fundo preto, grid ciano, aro brilhante, rastro de luz,
// scanlines de CRT. Alto contraste — dá pra ler tamanho no susto.
//
// PERFORMANCE: nada de shadowBlur por objeto (é a operação mais cara do canvas).
// Cada planeta/comida/vírus é um sprite desenhado UMA vez num canvas offscreen,
// com o brilho já queimado dentro, e depois só copiado com drawImage.
(function(){
const u=MOCK.u,WW=u.WW,WH=u.WH;
function rgba(hex,a){const n=parseInt(hex.slice(1),16);return`rgba(${n>>16},${n>>8&255},${n&255},${a})`;}
const CY="#00e5ff",MG="#ff2fb9";
const CK=1.95,FK=2.4,VK=1.45,EK=1.9;      // quanto cada sprite cobre além do raio
let stars=[];

const LB={title:"WARSPACE.IO",tagline:"CONQUISTE A GALÁXIA · DIVIDA · EJETE · DEVORE",
  coinIcon:"🪙",coinWord:"créditos",nameLabel:"IDENTIFICAÇÃO DO PLANETA",swap:"TROCAR",
  play:"▶ INICIAR",shop:"◈ LOJA DE SKINS",shopShort:"◈ LOJA",shopTitle:"LOJA DE SKINS",
  shopNote:"12 skins de amostra — as 50 do jogo entram quando o modelo for aprovado.",
  hint:"MOUSE MOVER · ESPAÇO DIVIDIR · W EJETAR · CLIQUE MÍSSIL",
  back:"◄ VOLTAR",equipped:"ATIVA",owned:"EQUIPAR",lbTitle:"RANKING",massLabel:"MASSA",
  youLabel:"PLANETA",killsWord:"ABATES",botTag:"◆",dead:"ABSORVIDO",deadIcon:"☠",
  deadSub:"SINAL PERDIDO — A GALÁXIA SEGUE SEM VOCÊ",eatenBy:"DEVORADO POR",respawn:"⟳ RENASCER",menu:"MENU"};

// ── sprites ───────────────────────────────────────────────────────────────────
function cellSpr(sk,isMe,size){
  return u.sprite("n"+sk.id+(isMe?"m":"")+size,size,(c,R)=>{
    const r=R/CK,col=sk.glow||sk.color;
    if(sk.ring){c.save();c.scale(1,.3);c.shadowBlur=r*.35;c.shadowColor=col;
      c.strokeStyle=rgba(sk.color,.75);c.lineWidth=r*.3;
      c.beginPath();c.arc(0,0,r*1.6,0,6.283);c.stroke();c.restore();}
    const gd=c.createRadialGradient(0,0,r*.1,0,0,r);
    gd.addColorStop(0,rgba(sk.color,.16));gd.addColorStop(.7,rgba(sk.color,.42));gd.addColorStop(1,rgba(sk.color,.8));
    c.fillStyle=gd;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
    c.shadowBlur=r*(isMe?.62:.42);c.shadowColor=col;
    c.strokeStyle=col;c.lineWidth=Math.max(2,r*.07);c.beginPath();c.arc(0,0,r,0,6.283);c.stroke();
    if(isMe){c.stroke();}                                   // segunda passada = halo mais forte
    c.shadowBlur=0;c.strokeStyle=rgba(sk.color,.4);c.lineWidth=Math.max(1,r*.025);
    c.beginPath();c.arc(0,0,r*.72,0,6.283);c.stroke();
    c.globalAlpha=.22;c.font=`${r*1.5}px serif`;c.textAlign="center";c.textBaseline="middle";
    c.fillStyle="#fff";c.fillText(sk.emoji,0,r*.04);c.globalAlpha=1;});}

function foodSpr(f){
  return u.sprite("nf"+f.type+f.color,72,(c,R)=>{
    const r=R/FK;
    if(f.type==="missile_ammo"||f.type.indexOf("powerup_")===0){
      c.shadowBlur=r*1.2;c.shadowColor=f.color;c.strokeStyle=f.color;c.lineWidth=r*.2;
      c.beginPath();c.arc(0,0,r,0,6.283);c.stroke();c.fillStyle=rgba(f.color,.18);c.fill();
      c.shadowBlur=0;c.font=`${r*1.05}px serif`;c.textAlign="center";c.textBaseline="middle";
      c.fillText({missile_ammo:"🚀",powerup_speed:"⚡",powerup_magnet:"🧲",powerup_shield:"🛡️"}[f.type],0,1);return;}
    c.shadowBlur=r*1.1;c.shadowColor=f.color;c.fillStyle=f.color;
    if(f.type==="star"){u.spikes(c,r*1.2,4,.3,0);c.fill();}
    else if(f.type==="comet"){c.globalAlpha=.5;c.fillRect(-r*3.4,-r*.14,r*3,r*.28);c.globalAlpha=1;
      c.beginPath();c.arc(0,0,r*.8,0,6.283);c.fill();}
    else{c.beginPath();c.arc(0,0,r*.9,0,6.283);c.fill();}});}

const ejSpr=col=>u.sprite("ne"+col,48,(c,R)=>{const r=R/EK;
  c.shadowBlur=r*1.3;c.shadowColor=col;c.fillStyle=col;c.beginPath();c.arc(0,0,r*.9,0,6.283);c.fill();});

const virusSpr=()=>u.sprite("nv",256,(c,R)=>{const r=R/VK;
  c.shadowBlur=r*.42;c.shadowColor="#39ff88";
  u.spikes(c,r,20,.86,0);c.fillStyle="rgba(57,255,136,.10)";c.fill();
  c.strokeStyle="#39ff88";c.lineWidth=Math.max(2,r*.045);c.stroke();c.stroke();
  c.shadowBlur=0;u.spikes(c,r*.55,20,.86,0);c.strokeStyle="rgba(57,255,136,.45)";c.lineWidth=r*.02;c.stroke();});

window.THEME={
id:"neon",name:"Neon Arcade",skins:u.SKINS,rarity:u.RARITY,
rarityColor:{free:"#5f7a8a",common:"#00e5ff",rare:"#3d7bff",epic:"#ff2fb9",legendary:"#ffd23d"},
labels:LB,

init(){const rand=u.mulberry(3);stars=[];
  for(let i=0;i<420;i++)stars.push({x:rand()*WW,y:rand()*WH,r:.5+rand()*1.4,
    c:rand()<.5?CY:rand()<.6?MG:"#ffffff",a:.15+rand()*.5});},

drawBg(c,W,H){c.fillStyle="#04060e";c.fillRect(0,0,W,H);},

drawWorld(c,cam,t,g,W,H){
  // estrelas: só as que estão na tela, como retângulo de 1px (sem path/arc)
  const hw=W/(2*cam.scale),hh=H/(2*cam.scale),x0=cam.x-hw,x1=cam.x+hw,y0=cam.y-hh,y1=cam.y+hh;
  stars.forEach(s=>{if(s.x<x0||s.x>x1||s.y<y0||s.y>y1)return;
    c.globalAlpha=s.a;c.fillStyle=s.c;c.fillRect(s.x,s.y,s.r*1.6,s.r*1.6);});
  c.globalAlpha=1;
  u.grid(c,60,"rgba(0,229,255,.085)",1);
  u.grid(c,300,"rgba(0,229,255,.17)",1.4);
  [[30,.06],[14,.13],[6,.3],[3,.85]].forEach(([w,a])=>{                 // brilho sem shadowBlur
    c.strokeStyle="rgba(0,229,255,"+a+")";c.lineWidth=w;c.strokeRect(0,0,WW,WH);});
  c.strokeStyle=rgba(MG,.35);c.lineWidth=1.5;c.strokeRect(-10,-10,WW+20,WH+20);},

drawFood(c,f,t){const r=f.r*(.9+.1*Math.sin(t*.005+f.seed))*FK;
  c.drawImage(foodSpr(f),f.x-r,f.y-r,r*2,r*2);},

drawEjected(c,e){const r=e.r*EK;c.drawImage(ejSpr(e.color),e.x-r,e.y-r,r*2,r*2);},

drawVirus(c,v,t){const r=v.r*(1+Math.sin(v.pulseT)*.05)*VK;
  c.drawImage(virusSpr(),v.x-r,v.y-r,r*2,r*2);},

drawMissile(c,m){
  m.trail.forEach((pt,i)=>{const a=i/m.trail.length;c.fillStyle=`rgba(255,47,185,${a*.5})`;
    c.beginPath();c.arc(pt.x,pt.y,m.r*.5*a,0,6.283);c.fill();});
  c.save();c.translate(m.x,m.y);c.rotate(Math.atan2(m.vy,m.vx));
  c.shadowBlur=20;c.shadowColor=MG;c.strokeStyle="#fff";c.fillStyle=MG;c.lineWidth=2;
  c.beginPath();c.moveTo(m.r*1.5,0);c.lineTo(-m.r,-m.r*.75);c.lineTo(-m.r*.4,0);c.lineTo(-m.r,m.r*.75);
  c.closePath();c.fill();c.stroke();c.shadowBlur=0;c.restore();},

drawCell(c,pc,p,isMe,t,prev){
  const r=pc.displayR||pc.r,sk=p.skin,col=sk.glow||sk.color,d=r*CK;
  c.drawImage(cellSpr(sk,isMe,u.tier(r)),pc.x-d,pc.y-d,d*2,d*2);
  c.save();c.translate(pc.x,pc.y);
  if(pc.mergeTimer>0){c.strokeStyle=CY;c.lineWidth=2.5;c.beginPath();
    c.arc(0,0,r+6,-1.5708,-1.5708+(1-pc.mergeTimer/u.mergeTime(pc.r))*6.283);c.stroke();}
  const pw=Object.keys(p._powerups||{});
  if(pw.length){const cl={speed:"#ffd23d",magnet:MG,shield:CY};
    pw.forEach((k,i)=>{c.strokeStyle=cl[k];c.lineWidth=2;c.globalAlpha=.5+.5*Math.sin(t*.012+i);
      c.setLineDash([r*.35,r*.25]);c.beginPath();c.arc(0,0,r*(1.2+i*.14),0,6.283);c.stroke();
      c.setLineDash([]);c.globalAlpha=1;});}
  if(!prev&&r>13){const fs=Math.max(11,r*.3);
    u.outText(c,p.name.toUpperCase(),0,-fs*.3,fs,"#fff","rgba(0,0,0,.6)");
    u.outText(c,String(Math.round(pc.r*pc.r/10)),0,fs*.78,fs*.7,rgba(sk.glow,.95),"rgba(0,0,0,.6)");}
  c.restore();},

drawHud(c,W,H,g){
  const MS=150,MP=16,mx=W-MS-MP,my=H-MS-MP;
  c.fillStyle="rgba(0,10,18,.7)";c.fillRect(mx,my,MS,MS);
  c.strokeStyle="rgba(0,229,255,.5)";c.lineWidth=1.5;
  [[mx,my,1,1],[mx+MS,my,-1,1],[mx,my+MS,1,-1],[mx+MS,my+MS,-1,-1]].forEach(([x,y,sx,sy])=>{
    c.beginPath();c.moveTo(x+sx*18,y);c.lineTo(x,y);c.lineTo(x,y+sy*18);c.stroke();});
  const sc=MS/WW;
  c.strokeStyle="rgba(0,229,255,.09)";c.lineWidth=1;
  for(let i=1;i<5;i++){c.beginPath();c.moveTo(mx+MS*i/5,my);c.lineTo(mx+MS*i/5,my+MS);
    c.moveTo(mx,my+MS*i/5);c.lineTo(mx+MS,my+MS*i/5);c.stroke();}
  g.viruses.forEach(v=>{c.fillStyle="rgba(57,255,136,.6)";c.fillRect(mx+v.x*sc-1.5,my+v.y*sc-1.5,3,3);});
  Object.values(g.players).filter(p=>!p.dead).forEach(p=>{const me=p.id===g.me;
    const x=mx+(p.pieces.reduce((s,q)=>s+q.x,0)/p.pieces.length)*sc,y=my+(p.pieces.reduce((s,q)=>s+q.y,0)/p.pieces.length)*sc;
    c.fillStyle=me?"#fff":p.skin.glow||p.color;
    c.fillRect(x-(me?2.5:1.8),y-(me?2.5:1.8),me?5:3.6,me?5:3.6);});
  [["DIVIDIR","ESPAÇO",g.splitCD>0,0],["EJETAR","W",g.ejectCD>0,1]].forEach(([lb,key,cd,i])=>{
    const bw=88,bh=38,bx=W-MP-bw-i*(bw+8),by=my-bh-10;
    c.fillStyle=cd?"rgba(20,26,36,.7)":"rgba(0,60,80,.55)";c.fillRect(bx,by,bw,bh);
    c.strokeStyle=cd?"rgba(90,110,130,.5)":CY;c.lineWidth=1.5;c.strokeRect(bx,by,bw,bh);
    c.fillStyle=cd?"#546678":"#d8feff";c.textAlign="center";c.textBaseline="middle";
    c.font="bold 12px 'Courier New',monospace";c.fillText(lb,bx+bw/2,by+bh*.38);
    c.font="10px 'Courier New',monospace";c.fillStyle=cd?"#41505f":"rgba(0,229,255,.75)";
    c.fillText("["+key+"]",bx+bw/2,by+bh*.72);});
  c.fillStyle="rgba(0,10,18,.6)";c.fillRect(MP,MP,68,22);
  c.fillStyle=g.fps>=50?"#39ff88":g.fps>=30?"#ffd23d":"#ff4d6d";
  c.font="bold 12px 'Courier New',monospace";c.textAlign="left";c.textBaseline="middle";c.fillText("FPS "+g.fps,MP+7,MP+11);
  const me=g.players[g.me];
  if(me&&me._missiles>0){c.fillStyle="rgba(30,0,20,.7)";c.fillRect(MP,MP+28,104,32);
    c.strokeStyle=MG;c.lineWidth=1.5;c.strokeRect(MP,MP+28,104,32);
    c.font="16px serif";c.textAlign="left";c.textBaseline="middle";c.fillText("🚀",MP+9,MP+44);
    c.fillStyle=MG;c.font="bold 15px 'Courier New',monospace";c.fillText("x"+me._missiles,MP+34,MP+44);
    c.font="9px 'Courier New',monospace";c.fillStyle="rgba(255,47,185,.7)";c.fillText("CLIQUE",MP+62,MP+45);}},

css:`
body{font-family:'Courier New',monospace}
/* scanlines + vinheta: overlay de CSS, composto pela GPU (custo ~0 no canvas) */
body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:45;
  background:repeating-linear-gradient(180deg,rgba(0,229,255,.10) 0 1px,transparent 1px 3px),
    radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 40%,rgba(0,0,0,.45) 100%)}
#hud-lb{left:auto;right:16px;top:16px;background:rgba(0,10,18,.72);border:1px solid rgba(0,229,255,.35);
  padding:10px 14px;color:#bff6ff;font-size:12.5px;min-width:210px;box-shadow:0 0 24px rgba(0,229,255,.14)}
.ph{font-size:11px;letter-spacing:4px;color:#00e5ff;text-align:center;font-weight:700}
.lb-row{font-size:12.5px;color:#8fd8e8;letter-spacing:.5px}
.lb-row.mine{color:#ff2fb9;font-weight:700;text-shadow:0 0 10px rgba(255,47,185,.7)}
.lb-row b{color:#fff;font-weight:400}
#hud-score{top:auto;right:auto;bottom:16px;left:16px;text-align:left;background:rgba(0,10,18,.72);
  border:1px solid rgba(0,229,255,.35);padding:10px 14px;color:#bff6ff;box-shadow:0 0 24px rgba(0,229,255,.14)}
.score-big{font-size:28px;font-weight:700;color:#fff;text-shadow:0 0 16px rgba(0,229,255,.9)}
.score-sub{font-size:10px;color:#00e5ff;letter-spacing:3px;margin-bottom:6px}
.score-row{justify-content:flex-start;font-size:11px;color:#7fb8c8;letter-spacing:1px}
.score-row.dim{color:#3f5f6f}
.btn-mini{background:rgba(0,60,80,.5);border:1px solid rgba(0,229,255,.5);padding:5px 12px;font-size:11px;
  color:#bff6ff;letter-spacing:1px}
.btn-mini:hover{box-shadow:0 0 14px rgba(0,229,255,.5)}
.screen{background:radial-gradient(ellipse at 50% 50%,rgba(10,20,40,.62),rgba(2,3,10,.92))}
.menu-card,.dead-card,.shop-wrap{background:rgba(2,8,18,.9);border:1px solid rgba(0,229,255,.4);
  padding:26px 30px;color:#bff6ff;box-shadow:0 0 60px rgba(0,229,255,.12),inset 0 0 40px rgba(0,229,255,.05)}
.brand{font-size:42px;font-weight:700;letter-spacing:6px;color:#fff;text-shadow:0 0 14px #00e5ff,0 0 38px #0090ff}
.tagline{font-size:11px;color:#00e5ff;letter-spacing:3px;text-align:center}
.coinbar{display:flex;align-items:center;gap:8px;border:1px solid rgba(255,210,61,.45);padding:6px 16px;
  font-size:15px;color:#ffd23d;letter-spacing:1px}
.coinbar span{font-size:10px;color:#8a7526;letter-spacing:2px}
.field label{font-size:10px;color:#00e5ff;letter-spacing:3px}
.field input{background:rgba(0,20,32,.9);border:1px solid #00e5ff;padding:11px;font-size:17px;color:#fff;
  outline:none;letter-spacing:2px;font-family:inherit}
.field input:focus{box-shadow:0 0 18px rgba(0,229,255,.45)}
.skinrow{border:1px solid rgba(0,229,255,.22);padding:8px 10px;background:rgba(0,229,255,.04)}
.skinmeta b{font-size:13px;letter-spacing:1px}.skinmeta i{font-style:normal;font-size:10px;letter-spacing:2px}
.btn-primary{background:linear-gradient(90deg,rgba(0,229,255,.2),rgba(255,47,185,.2));border:1px solid #00e5ff;
  padding:14px;font-size:18px;font-weight:700;color:#fff;letter-spacing:5px;text-shadow:0 0 12px #00e5ff}
.btn-primary:hover{box-shadow:0 0 30px rgba(0,229,255,.6)}
.btn-secondary{background:rgba(255,47,185,.08);border:1px solid rgba(255,47,185,.55);padding:11px;
  font-size:13px;font-weight:700;color:#ff2fb9;letter-spacing:3px}
.hint{font-size:10px;color:#4f7f8f;letter-spacing:2px}
.shop-title{font-size:18px;font-weight:700;letter-spacing:6px;text-align:center;color:#fff;text-shadow:0 0 12px #00e5ff}
.skin-card{background:rgba(0,229,255,.04);border:1px solid rgba(0,229,255,.18);color:#bff6ff}
.skin-card:hover{background:rgba(0,229,255,.1);box-shadow:0 0 20px rgba(0,229,255,.2)}
.skin-card.eq{border-color:#ff2fb9;background:rgba(255,47,185,.1);box-shadow:0 0 20px rgba(255,47,185,.25)}
.skin-card b{font-size:12px;letter-spacing:.5px}.skin-card i{font-style:normal;font-size:9.5px;letter-spacing:2px}
.skin-card em{font-style:normal;font-size:12px;color:#ffd23d}
.badge{background:#ff2fb9;color:#0a0010;font-size:8px;font-weight:700;padding:2px 6px;letter-spacing:1px}
.shop-note{font-size:10px;color:#4f7f8f;letter-spacing:1px}
.dead-card{border-color:rgba(255,47,185,.5);box-shadow:0 0 60px rgba(255,47,185,.18)}
.dead-icon{font-size:48px;color:#ff2fb9}
.dead-title{font-size:38px;font-weight:700;color:#ff2fb9;letter-spacing:8px;text-shadow:0 0 20px #ff2fb9}
.dead-sub{font-size:10px;color:#8a4f74;letter-spacing:3px}
.dead-by span{font-size:9px;color:#4f7f8f;letter-spacing:3px}
.dead-by b{font-size:22px;color:#00e5ff;letter-spacing:2px}
.dead-stats b{font-size:20px;color:#fff}
.dead-stats i{font-style:normal;font-size:9px;color:#4f7f8f;letter-spacing:2px}
`};
})();

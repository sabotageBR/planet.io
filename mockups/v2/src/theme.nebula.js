// ── MODELO 1 — NEBULOSA ───────────────────────────────────────────────────────
// Evolução do "Neon Cinematográfico" em produção: mesma paleta (ciano/magenta/
// dourado sobre azul-noite), painéis de vidro com cantoneiras, micro-rótulos em
// Courier, scanlines/vinheta/grão como overlay CSS. Novidades: HUD com hierarquia
// (chips no topo, status sob os chips, cooldowns junto ao minimapa), menus como
// hub de colunas (conteúdo + coluna lateral com ranking/salas) e as entidades
// novas (asteroide com aresta ciano, buraco negro com anel de acreção magenta→ciano,
// rastros emissivos) no mesmo vocabulário.
//
// CONTRATO DO TEMA (v2) — todo tema implementa este objeto:
//   id,name,desc,tags,swatch, tokens{bg,surface,text,muted,accent,accent2,danger,ok,line,radius,radiusLg,space,fontUi,fontMono,shadow}
//   layout{hud,nav}, labels? (só o que sobrescrever), rarityColor?, init?(g,u), mount?(app,g,u)
//   drawBg(c,W,H,cam,t,g)  drawWorld(c,cam,t,g,W,H)  drawFood(c,f,t)  drawEjected(c,e,t)  drawMissile(c,m,t)
//   drawCell(c,pc,p,isMe,t,prev,g)  → respeitar g.prefs.names / g.prefs.mass
//   drawAsteroid(c,a,t,g)  drawBlackHole(c,h,t,g)  drawTrail?(c,pc,p,isMe,t,g)  drawFx?(c,fx,t,g)
//   drawHud(c,W,H,g,t,mode)  → minimapa (respeitar g.prefs.minimap) e o que mais for canvas; mode = desktop|portrait|landscape
//   drawPost?(c,W,H,t,g)  paintSkin?(c,sk,r,g)  css (string; usar var(--…))
// PERFORMANCE: shadowBlur/createRadialGradient só dentro de u.sprite(); rastro = 1 stroke;
// efeitos = arcs/lines; fundo em cache por resolução; nada de backdrop-filter por objeto.
(function(){
const u=MOCK.u,WW=u.WW,WH=u.WH,sh=u.sh,rgba=u.rgba;
const CY="#4fe3ff",MG="#ff4fd8",GD="#ffd166",T=760,FK=2.1;
let L=[],NEB=[],bg=null,bgW=0,bgH=0;

// ── sprites ───────────────────────────────────────────────────────────────────
const PK=sk=>sk.ring?2.4:1.75;
function planetSpr(sk,isMe,size){
  return u.sprite("np"+sk.id+(isMe?"m":"")+size,size,(c,R)=>{
    const K=PK(sk),r=R/K,col=sk.color,glow=sk.glow||sk.color;
    if(sk.ring){c.save();c.scale(1,.28);
      const rg=c.createRadialGradient(0,0,r*1.1,0,0,r*2.1);
      rg.addColorStop(0,rgba(col,.9));rg.addColorStop(.55,rgba(col,.42));rg.addColorStop(1,"rgba(0,0,0,0)");
      c.fillStyle=rg;c.beginPath();c.arc(0,0,r*2.1,0,6.283);c.arc(0,0,r*1.06,0,6.283,true);c.fill();
      c.strokeStyle=rgba(glow,.55);c.lineWidth=r*.06;c.shadowBlur=r*.3;c.shadowColor=glow;
      c.beginPath();c.arc(0,0,r*1.72,0,6.283);c.stroke();c.shadowBlur=0;c.restore();}
    const halo=c.createRadialGradient(0,0,r*.92,0,0,r*1.5);
    halo.addColorStop(0,rgba(glow,isMe?.55:.34));halo.addColorStop(.45,rgba(glow,isMe?.22:.13));halo.addColorStop(1,rgba(glow,0));
    c.fillStyle=halo;c.beginPath();c.arc(0,0,r*1.5,0,6.283);c.fill();
    const gd=c.createRadialGradient(-r*.35,-r*.4,r*.05,0,0,r*1.05);
    gd.addColorStop(0,sh(col,.55));gd.addColorStop(.45,col);gd.addColorStop(1,sh(col,-.6));
    c.fillStyle=gd;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
    c.save();c.beginPath();c.arc(0,0,r,0,6.283);c.clip();
    c.globalAlpha=.2;c.font=`${r*1.66}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(sk.emoji,0,r*.05);c.globalAlpha=1;
    const hl=c.createRadialGradient(-r*.4,-r*.45,0,-r*.4,-r*.45,r*.75);
    hl.addColorStop(0,"rgba(255,255,255,.42)");hl.addColorStop(1,"rgba(255,255,255,0)");c.fillStyle=hl;c.fillRect(-r,-r,r*2,r*2);
    const term=c.createLinearGradient(r*.1,-r,r,r*.9);term.addColorStop(0,"rgba(0,0,0,0)");term.addColorStop(1,"rgba(0,4,14,.6)");
    c.fillStyle=term;c.fillRect(-r,-r,r*2,r*2);c.restore();
    c.shadowBlur=r*(isMe?.5:.3);c.shadowColor=glow;c.strokeStyle=rgba(glow,isMe?1:.8);c.lineWidth=Math.max(2,r*.055);
    c.beginPath();c.arc(0,0,r*.985,0,6.283);c.stroke();if(isMe)c.stroke();c.shadowBlur=0;});}

function foodSpr(f){
  return u.sprite("nf"+f.type+f.color,68,(c,R)=>{const r=R/FK;
    if(f.type==="missile_ammo"||f.type.indexOf("powerup_")===0){
      c.shadowBlur=r*1.3;c.shadowColor=f.color;
      const gd=c.createRadialGradient(0,0,0,0,0,r);gd.addColorStop(0,"#fff");gd.addColorStop(.55,f.color);gd.addColorStop(1,rgba(f.color,.2));
      c.fillStyle=gd;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.strokeStyle=rgba(f.color,.9);c.lineWidth=r*.12;c.stroke();c.shadowBlur=0;
      c.font=`${r*1.05}px serif`;c.textAlign="center";c.textBaseline="middle";
      c.fillText({missile_ammo:"🚀",powerup_speed:"⚡",powerup_magnet:"🧲",powerup_shield:"🛡️"}[f.type],0,1);return;}
    if(f.type==="comet"){const gd=c.createLinearGradient(-r*3.4,0,r,0);gd.addColorStop(0,"rgba(255,255,255,0)");gd.addColorStop(1,f.color);
      c.fillStyle=gd;c.beginPath();c.ellipse(-r*1.3,0,r*3,r*.3,0,0,6.283);c.fill();
      c.shadowBlur=r*.9;c.shadowColor="#fff";c.fillStyle="#fff";c.beginPath();c.arc(0,0,r*.5,0,6.283);c.fill();return;}
    if(f.type==="star"){c.shadowBlur=r*1.2;c.shadowColor=f.color;c.fillStyle=f.color;u.spikes(c,r*1.15,4,.32,0);c.fill();return;}
    if(f.type==="dust"){c.shadowBlur=r*1.4;c.shadowColor=f.color;c.fillStyle=rgba(f.color,.85);
      for(let i=0;i<4;i++){const a=i*1.7;c.beginPath();c.arc(Math.cos(a)*r*.4,Math.sin(a)*r*.4,r*.32,0,6.283);c.fill();}return;}
    c.shadowBlur=r*.7;c.shadowColor=f.color;
    const gd=c.createRadialGradient(-r*.3,-r*.3,0,0,0,r);gd.addColorStop(0,"#ffffff");gd.addColorStop(.3,f.color);gd.addColorStop(1,"rgba(0,0,0,.55)");
    c.fillStyle=gd;c.beginPath();c.arc(0,0,r*.95,0,6.283);c.fill();});}

const ejSpr=col=>u.sprite("ne"+col,48,(c,R)=>{const r=R/1.85;c.shadowBlur=r*1.1;c.shadowColor=col;
  const gd=c.createRadialGradient(0,0,0,0,0,r);gd.addColorStop(0,"#fff");gd.addColorStop(.45,col);gd.addColorStop(1,rgba(col,0));
  c.fillStyle=gd;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();});

// asteroide: 3 variantes de silhueta, volume cinza-azulado, crateras e aresta ciano fraca
const AK=1.35;
function astSpr(variant,size){return u.sprite("na"+variant+size,size,(c,R)=>{const r=R/AK,seed=11+variant*7;
  c.shadowBlur=r*.25;c.shadowColor=CY;
  const gd=c.createRadialGradient(-r*.3,-r*.35,r*.1,0,0,r*1.05);
  gd.addColorStop(0,"#8a9bb8");gd.addColorStop(.5,"#4b5872");gd.addColorStop(1,"#141a2a");
  c.fillStyle=gd;u.astPoly(c,r,seed,9+variant*2);c.fill();c.shadowBlur=0;
  c.strokeStyle=rgba(CY,.45);c.lineWidth=Math.max(1.5,r*.05);c.stroke();
  const cr=u.mulberry(seed*3);for(let i=0;i<4;i++){const a=cr()*6.28,d=cr()*r*.55,cr2=r*(.1+cr()*.16);
    c.fillStyle="rgba(8,12,24,.55)";c.beginPath();c.arc(Math.cos(a)*d,Math.sin(a)*d,cr2,0,6.283);c.fill();
    c.strokeStyle="rgba(180,200,235,.25)";c.lineWidth=1;c.beginPath();c.arc(Math.cos(a)*d,Math.sin(a)*d,cr2,3.4,5.6);c.stroke();}});}

// buraco negro: núcleo preto + anel de acreção magenta→ciano (sprite girado)
const BK=2.6;
const bhSpr=()=>u.sprite("nbh",256,(c,R)=>{const r=R/BK;
  const ac=c.createRadialGradient(0,0,r*1.05,0,0,r*2.5);
  ac.addColorStop(0,rgba(MG,.95));ac.addColorStop(.25,rgba(MG,.55));ac.addColorStop(.55,rgba(CY,.28));ac.addColorStop(1,"rgba(0,0,0,0)");
  c.save();c.scale(1,.78);c.fillStyle=ac;c.beginPath();c.arc(0,0,r*2.5,0,6.283);c.fill();
  c.strokeStyle="rgba(255,255,255,.35)";c.lineWidth=r*.07;c.beginPath();c.arc(0,0,r*1.5,.4,2.6);c.stroke();
  c.beginPath();c.arc(0,0,r*1.9,3.5,5.4);c.stroke();c.restore();
  c.shadowBlur=r*.6;c.shadowColor=MG;c.fillStyle="#000";c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.shadowBlur=0;
  c.strokeStyle="rgba(255,255,255,.9)";c.lineWidth=Math.max(1.5,r*.05);c.beginPath();c.arc(0,0,r*1.02,0,6.283);c.stroke();});

window.THEME={
id:"nebula",name:"Nebulosa",
desc:"Evolução do visual atual: vidro, ciano/magenta, cantoneiras e Courier. HUD com hierarquia nos quatro cantos; menus como hub de colunas; asteroides e buracos negros no mesmo vocabulário emissivo.",
tags:["continuidade","premium","escuro","vidro"],swatch:["#4fe3ff","#2f2fb0"],
tokens:{bg:"#04060d",surface:"rgba(6,12,28,.62)",text:"#e6f4ff",muted:"#5d6c8c",accent:"#4fe3ff",accent2:"#ff4fd8",danger:"#ff5f8f",ok:"#39ff88",
  line:"rgba(79,227,255,.3)",radius:"12px",radiusLg:"18px",space:"14px",fontUi:"system-ui,-apple-system,'Segoe UI',Arial,sans-serif",fontMono:"'Courier New',monospace",
  shadow:"0 8px 30px rgba(0,0,0,.4),0 0 24px rgba(79,227,255,.08)"},
layout:{hud:"corners",nav:"hub"},
rarityColor:{free:"#8c9ab5",common:"#4fe3ff",rare:"#5b9dff",epic:"#ff4fd8",legendary:"#ffd166",earned:"#39ff88",secret:"#ff5f8f"},
labels:{title:"WARSPACE.IO"},

init(g){const rand=u.mulberry(41);
  L=[.18,.42,.8].map((f,li)=>({f,stars:Array.from({length:li===2?45:90},()=>({x:rand()*T,y:rand()*T,r:li===2?1.6+rand()*1.6:.6+rand()*1.1,a:+((li===2?.55:.22)+rand()*.35).toFixed(2)}))}));
  NEB=[];const cols=["#2f6bff","#a855f7","#ff4d6d","#22d3ee","#7c3aed"];
  for(let i=0;i<16;i++)NEB.push({x:rand(),y:rand(),r:.22+rand()*.5,col:cols[i%cols.length],a:.055+rand()*.10});},

drawBg(c,W,H,cam,t,g){
  if(!bg||bgW!==W||bgH!==H){bgW=W;bgH=H;bg=document.createElement("canvas");bg.width=W;bg.height=H;
    const x=bg.getContext("2d"),D=Math.max(W,H);
    const gd=x.createRadialGradient(W*.5,H*.42,0,W*.5,H*.5,D*.9);gd.addColorStop(0,"#080d24");gd.addColorStop(.5,"#04060d");gd.addColorStop(1,"#010208");
    x.fillStyle=gd;x.fillRect(0,0,W,H);
    NEB.forEach(n=>{const nx=n.x*W,ny=n.y*H,nr=n.r*D;const g2=x.createRadialGradient(nx,ny,0,nx,ny,nr);
      g2.addColorStop(0,rgba(n.col,n.a));g2.addColorStop(.5,rgba(n.col,n.a*.4));g2.addColorStop(1,"rgba(0,0,0,0)");x.fillStyle=g2;x.beginPath();x.arc(nx,ny,nr,0,6.283);x.fill();});}
  c.drawImage(bg,0,0);
  if(g&&g.prefs&&!g.prefs.parallax)return;
  c.fillStyle="#dfe8ff";
  L.forEach(l=>{const ox=((-cam.x*l.f*cam.scale)%T+T)%T,oy=((-cam.y*l.f*cam.scale)%T+T)%T;
    l.stars.forEach(s=>{c.globalAlpha=s.a;const bx=(s.x+ox)%T,by=(s.y+oy)%T;for(let x=bx;x<W;x+=T)for(let y=by;y<H;y+=T)c.fillRect(x,y,s.r,s.r);});});
  c.globalAlpha=1;},

drawWorld(c,cam,t,g){
  if(!g||!g.prefs||g.prefs.grid){u.grid(c,60,"rgba(79,227,255,.06)",1);u.grid(c,300,"rgba(79,227,255,.13)",1.4);}
  [[30,.05],[14,.11],[6,.26],[3,.7]].forEach(([w,a])=>{c.strokeStyle="rgba(79,227,255,"+a+")";c.lineWidth=w;c.strokeRect(0,0,WW,WH);});
  c.strokeStyle=rgba(MG,.25);c.lineWidth=1.5;c.strokeRect(-12,-12,WW+24,WH+24);},

drawFood(c,f,t){const p=f.type==="star"?1+Math.sin(t*.003+f.seed)*.16:1,r=f.r*FK*p;c.drawImage(foodSpr(f),f.x-r,f.y-r,r*2,r*2);},
drawEjected(c,e){const r=e.r*1.85;c.drawImage(ejSpr(e.color),e.x-r,e.y-r,r*2,r*2);},

drawAsteroid(c,a,t){const r=a.r*AK;c.save();c.translate(a.x,a.y);c.rotate(a.rot);c.drawImage(astSpr(a.variant,u.tier(a.r)),-r,-r,r*2,r*2);c.restore();},

drawBlackHole(c,h,t){const k=h.k,rc=h.rc*k,ri=h.ri*k;
  c.strokeStyle=rgba(MG,.12+.06*Math.sin(t*.004));c.lineWidth=1.5;c.setLineDash([10,14]);c.beginPath();c.arc(h.x,h.y,ri,h.spin*.3,h.spin*.3+6.283);c.stroke();c.setLineDash([]);
  c.strokeStyle="rgba(79,227,255,.07)";c.lineWidth=rc*.5;c.beginPath();c.arc(h.x,h.y,rc*3.6,0,6.283);c.stroke();
  c.strokeStyle="rgba(255,79,216,.06)";c.beginPath();c.arc(h.x,h.y,rc*5.2,0,6.283);c.stroke();
  const R=rc*BK;c.save();c.translate(h.x,h.y);c.rotate(h.spin);c.globalAlpha=Math.min(1,k*1.2);c.drawImage(bhSpr(),-R,-R,R*2,R*2);c.restore();c.globalAlpha=1;},

drawTrail(c,pc,p,isMe){if(!u.trailPath(c,pc))return;const glow=p.skin.glow||p.color;
  c.strokeStyle=rgba(glow,isMe?.26:.15);c.lineWidth=Math.max(2,pc.r*.5);c.lineCap="round";c.lineJoin="round";c.stroke();},

drawMissile(c,m,t){
  m.trail.forEach((pt,i)=>{const a=i/m.trail.length;c.fillStyle=`rgba(255,120,60,${a*.4})`;c.beginPath();c.arc(pt.x,pt.y,m.r*a*.9,0,6.283);c.fill();});
  c.save();c.translate(m.x,m.y);c.rotate(Math.atan2(m.vy,m.vx));
  c.fillStyle="rgba(255,200,60,.55)";c.beginPath();c.ellipse(-m.r*2,0,m.r*3,m.r*.5,0,0,6.283);c.fill();
  c.fillStyle="#eef4ff";c.beginPath();c.ellipse(0,0,m.r,m.r*.42,0,0,6.283);c.fill();
  c.fillStyle="#ff3b6b";c.beginPath();c.ellipse(m.r*.5,0,m.r*.55,m.r*.42,0,0,6.283);c.fill();c.restore();},

drawCell(c,pc,p,isMe,t,prev,g){
  const r=pc.displayR||pc.r,sk=p.skin,K=PK(sk),d=r*K,pr=(g&&g.prefs)||{names:true,mass:true};
  c.drawImage(planetSpr(sk,isMe,u.tier(r)),pc.x-d,pc.y-d,d*2,d*2);
  c.save();c.translate(pc.x,pc.y);
  if(pc.mergeTimer>0){c.strokeStyle=rgba(CY,.75);c.lineWidth=2.5;c.beginPath();c.arc(0,0,r+6,-1.5708,-1.5708+(1-pc.mergeTimer/u.mergeTime(pc.r))*6.283);c.stroke();}
  const pw=Object.keys(p._powerups||{});
  if(pw.length){const cl={speed:GD,magnet:MG,shield:CY};
    pw.forEach((k,i)=>{c.strokeStyle=cl[k];c.lineWidth=2.2;c.globalAlpha=.5+.5*Math.sin(t*.012+i);c.setLineDash([r*.36,r*.26]);
      c.beginPath();c.arc(0,0,r*(1.26+i*.15),0,6.283);c.stroke();c.setLineDash([]);c.globalAlpha=1;});}
  if(!prev&&r>13){const fs=Math.max(11,r*.31);
    if(pr.names!==false)u.outText(c,p.name+(p.registered?" ✓":""),0,pr.mass!==false?-fs*.28:0,fs,"#fff","rgba(0,0,0,.75)");
    if(pr.mass!==false)u.outText(c,u.fmt(pc.r*pc.r),0,pr.names!==false?fs*.78:0,fs*.7,rgba(sk.glow||sk.color,.95),"rgba(0,0,0,.7)");}
  c.restore();},

drawFx(c,f,t){const k=f.age/f.ttl,a=1-k;c.lineWidth=2.5;
  switch(f.t){
    case "bounce":c.strokeStyle=`rgba(255,255,255,${a*.8})`;c.beginPath();c.arc(f.x,f.y,f.r*(.25+k*.9),0,6.283);c.stroke();
      c.strokeStyle=rgba(CY,a*.7);c.lineWidth=4;c.beginPath();c.moveTo(f.x-f.ny*f.r*.5,f.y+f.nx*f.r*.5);c.lineTo(f.x+f.ny*f.r*.5,f.y-f.nx*f.r*.5);c.stroke();break;
    case "pop":case "shoot":c.strokeStyle=rgba(CY,a);for(let i=0;i<8;i++){const an=i/8*6.283;c.beginPath();c.moveTo(f.x+Math.cos(an)*f.r*(1+k),f.y+Math.sin(an)*f.r*(1+k));c.lineTo(f.x+Math.cos(an)*f.r*(1.6+k*1.4),f.y+Math.sin(an)*f.r*(1.6+k*1.4));c.stroke();}
      c.strokeStyle=`rgba(255,255,255,${a})`;c.beginPath();c.arc(f.x,f.y,f.r*(1+k*1.5),0,6.283);c.stroke();break;
    case "eat":c.strokeStyle=rgba(f.color&&f.color[0]==="#"?f.color:CY,a*.9);c.beginPath();c.arc(f.x,f.y,f.r*(1.4-k),0,6.283);c.stroke();break;
    case "suck":c.strokeStyle=rgba(MG,a);c.beginPath();c.arc(f.x,f.y,f.r*(3-k*2.6),0,6.283);c.stroke();break;
    case "exit":case "split":case "merge":c.strokeStyle=rgba(f.color&&f.color[0]==="#"?f.color:CY,a);c.beginPath();c.arc(f.x,f.y,f.r*(.6+k*1.6),0,6.283);c.stroke();break;
    case "chip":c.strokeStyle=rgba(GD,a);c.lineWidth=2;for(let i=-1;i<=1;i++){const an=Math.atan2(f.ny,f.nx)+i*.5;c.beginPath();c.moveTo(f.x,f.y);c.lineTo(f.x+Math.cos(an)*f.r*3*k,f.y+Math.sin(an)*f.r*3*k);c.stroke();}break;
    case "boom":c.strokeStyle=`rgba(255,140,40,${a})`;c.lineWidth=5;c.beginPath();c.arc(f.x,f.y,f.r*(.5+k*2),0,6.283);c.stroke();
      c.fillStyle=`rgba(255,255,255,${a*.5})`;c.beginPath();c.arc(f.x,f.y,f.r*.5*a,0,6.283);c.fill();break;
    case "rock":c.strokeStyle=`rgba(180,200,235,${a*.5})`;c.beginPath();c.arc(f.x,f.y,f.r*.4*(1+k),0,6.283);c.stroke();break;}},

drawHud(c,W,H,g,t,mode){
  if(g.prefs&&!g.prefs.minimap)return;
  const MS=mode==="portrait"?84:mode==="landscape"?96:152,MP=12;
  const mx=W-MS-MP,my=mode==="portrait"?118:mode==="landscape"?112:H-MS-MP;
  c.fillStyle="rgba(4,10,24,.62)";c.fillRect(mx,my,MS,MS);
  c.strokeStyle=rgba(CY,.5);c.lineWidth=1.5;
  [[mx,my,1,1],[mx+MS,my,-1,1],[mx,my+MS,1,-1],[mx+MS,my+MS,-1,-1]].forEach(([x,y,sx,sy])=>{c.beginPath();c.moveTo(x+sx*14,y);c.lineTo(x,y);c.lineTo(x,y+sy*14);c.stroke();});
  c.strokeStyle=rgba(CY,.08);c.lineWidth=1;
  for(let i=1;i<4;i++){c.beginPath();c.moveTo(mx+MS*i/4,my);c.lineTo(mx+MS*i/4,my+MS);c.moveTo(mx,my+MS*i/4);c.lineTo(mx+MS,my+MS*i/4);c.stroke();}
  u.minimap(c,mx,my,MS,g,{me:"#fff",player:CY,bot:"#8fa4c8",ast:"rgba(180,200,235,.7)",hole:rgba(MG,.55),view:rgba(CY,.25)});
  c.font="9px 'Courier New',monospace";c.fillStyle=rgba(CY,.6);c.textAlign="left";c.textBaseline="top";c.fillText("MAPA",mx+6,my+4);},

paintSkin(c,sk,r){const K=PK(sk),d=r*K;c.drawImage(planetSpr(sk,false,u.tier(r)),-d,-d+2,d*2,d*2);},

css:`
/* ── BASE ── */
body{font-family:var(--font-ui)}
body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:45;
  background:repeating-linear-gradient(180deg,rgba(79,227,255,.05) 0 1px,transparent 1px 4px),radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 42%,rgba(0,0,0,.5) 100%)}
body::before{content:"";position:fixed;inset:-50%;pointer-events:none;z-index:44;opacity:.035;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
  animation:grain 1.2s steps(4) infinite}
@keyframes grain{0%{transform:translate(0,0)}25%{transform:translate(-3%,2%)}50%{transform:translate(2%,-3%)}75%{transform:translate(-2%,-2%)}100%{transform:translate(0,0)}}
body[data-mode="portrait"]::after,body[data-mode="landscape"]::after,body[data-mode="portrait"]::before,body[data-mode="landscape"]::before{display:none}
.card,.panel{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);padding:18px 20px;color:var(--text);
  backdrop-filter:blur(18px);box-shadow:var(--shadow),inset 0 1px 0 rgba(255,255,255,.06);position:relative}
.panel{padding:11px 15px;border-radius:var(--radius)}
.card::before,.card::after,.panel::before,.panel::after{content:"";position:absolute;width:12px;height:12px;border:1.5px solid var(--accent);opacity:.7;pointer-events:none}
.card::before,.panel::before{left:-1px;top:-1px;border-right:0;border-bottom:0;border-top-left-radius:var(--radius)}
.card::after,.panel::after{right:-1px;bottom:-1px;border-left:0;border-top:0;border-bottom-right-radius:var(--radius)}
.ph{font-size:10px;letter-spacing:4px;color:var(--accent);font-weight:700;font-family:var(--font-mono)}
.hint{font-size:11px;color:var(--muted)}
.dim{color:var(--muted);opacity:1}
.reg{color:var(--ok);font-size:.85em}
.bot{color:var(--muted);font-size:.85em}
.code,.mono{font-family:var(--font-mono);letter-spacing:1px}
.coinbar{background:rgba(255,209,102,.07);border:1px solid rgba(255,209,102,.3);border-radius:999px;padding:6px 16px;font-size:14px;color:#ffd166}
.coinbar span{font-size:10px;color:#9a8547;letter-spacing:2px}
.btn-primary{background:linear-gradient(135deg,rgba(79,227,255,.22),rgba(47,92,224,.5));border:1px solid rgba(79,227,255,.75);border-radius:var(--radius);padding:14px;font-size:16px;font-weight:600;
  color:#fff;letter-spacing:4px;text-shadow:0 0 14px rgba(79,227,255,.9);box-shadow:0 8px 28px rgba(30,90,200,.3)}
.btn-primary:hover{box-shadow:0 0 32px rgba(79,227,255,.55)}
.btn-secondary{background:rgba(255,79,216,.07);border:1px solid rgba(255,79,216,.45);border-radius:var(--radius);padding:11px;font-size:12.5px;font-weight:600;color:#ff85e2;letter-spacing:2px}
.btn-secondary:hover{background:rgba(255,79,216,.16)}
.btn-mini{background:rgba(10,60,90,.45);border:1px solid rgba(79,227,255,.45);border-radius:8px;padding:6px 12px;font-size:11.5px;color:#dff7ff;white-space:nowrap}
.btn-mini:hover{box-shadow:0 0 16px rgba(79,227,255,.45)}
.btn-link{color:var(--accent);text-decoration:underline;font-size:12px;letter-spacing:1px}
.field label{font-size:10px;color:var(--accent);letter-spacing:3px;font-family:var(--font-mono)}
.field input,.code-row input{background:rgba(0,14,30,.75);border:1px solid rgba(79,227,255,.45);border-radius:10px;padding:11px 12px;font-size:16px;color:#fff;outline:none;letter-spacing:1px}
.field input:focus,.code-row input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(79,227,255,.14),0 0 22px rgba(79,227,255,.35)}
select{background:rgba(0,14,30,.75);border:1px solid rgba(79,227,255,.45);border-radius:8px;padding:6px 10px;color:#fff}
.seg{border:1px solid var(--line);border-radius:999px;overflow:hidden;background:rgba(0,14,30,.5)}
.seg button{padding:7px 16px;font-size:11.5px;letter-spacing:2px;color:var(--muted);font-family:var(--font-mono)}
.seg button.on{background:var(--accent);color:#02121c;font-weight:700}
.nav{gap:6px}
.nav-btn{padding:7px 14px;border-radius:999px;border:1px solid transparent;color:var(--muted);font-size:11.5px;letter-spacing:2px;font-family:var(--font-mono)}
.nav-btn:hover{color:var(--text)}
.nav-btn.on{border-color:var(--line);color:var(--accent);background:rgba(79,227,255,.08)}
.sh .stitle{font-size:19px;font-weight:300;letter-spacing:6px;color:#fff;text-shadow:0 0 14px rgba(79,227,255,.8)}
th{font-size:10px;letter-spacing:2px;color:var(--accent);font-family:var(--font-mono);font-weight:700;border-bottom:1px solid var(--line)}
td{font-size:12.5px;border-bottom:1px solid rgba(79,227,255,.08)}
#toast{background:rgba(6,12,28,.9);border:1px solid var(--line);border-radius:999px;color:var(--accent);font-family:var(--font-mono);font-size:12px;letter-spacing:2px}
/* ── HUD ── */
#hud-top .chip{background:rgba(6,12,28,.6);border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-family:var(--font-mono);font-size:12px;color:var(--text);backdrop-filter:blur(10px)}
#hud-top .chip i{color:var(--accent);font-size:9px;letter-spacing:2px}
#hud-top .chip b{font-weight:700}
#hud-lb{font-size:13px;min-width:210px}
#hud-lb .ph{text-align:center}
.lb-row{font-size:12.5px;color:#b9cbe6;font-family:var(--font-mono)}
.lb-row::before{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;background:linear-gradient(90deg,rgba(79,227,255,.35) calc(var(--p)*100%),transparent 0)}
.lb-row.mine{color:#ffd166;font-weight:700}
.lb-row.top .lb-pos{color:var(--accent)}
.lb-val{color:var(--accent);font-weight:400}
#hud-score{text-align:left}
.score-big{font-size:28px;font-weight:300;color:#fff;letter-spacing:-.5px;text-shadow:0 0 18px rgba(79,227,255,.6)}
.score-sub{font-size:9.5px;color:var(--accent);letter-spacing:3px;margin-bottom:7px;font-family:var(--font-mono)}
.score-row{font-size:11.5px;color:#9fb4d4}
.score-row .k{font-family:var(--font-mono);font-size:10px;letter-spacing:1px;color:var(--muted)}
#hud-status{left:12px;bottom:auto;top:52px}
#hud-ammo{background:rgba(30,4,24,.7);border:1px solid rgba(255,79,216,.8);border-radius:8px;padding:5px 10px;font-family:var(--font-mono);font-size:12px;color:var(--accent2)}
#hud-ammo span{font-size:9px;letter-spacing:2px;opacity:.7}
#hud-ammo.empty{opacity:.35;border-color:rgba(255,79,216,.3)}
.pw{background:rgba(6,12,28,.6);border:1px solid var(--line);border-radius:8px;padding:4px 9px;font-size:11px;font-family:var(--font-mono);color:var(--text)}
.pw-speed{border-color:rgba(255,209,102,.6)}.pw-magnet{border-color:rgba(255,79,216,.6)}.pw-shield{border-color:rgba(79,227,255,.8)}
.cd{background:rgba(18,24,40,.7);border:1px solid rgba(90,110,140,.45);color:#59667f;font-family:var(--font-mono)}
.cd span{font-size:11px;font-weight:700}.cd em{font-size:9px;color:#46536b}
.cd .cd-fill{background:rgba(10,60,90,.55)}
.cd.ready{border-color:rgba(79,227,255,.85);color:#dff7ff}.cd.ready em{color:rgba(79,227,255,.75)}
.tbtn{background:rgba(6,12,28,.7);border:1.5px solid var(--accent);color:#dff7ff;font-family:var(--font-mono);backdrop-filter:blur(10px);box-shadow:0 0 18px rgba(79,227,255,.25)}
#t-fire{border-color:var(--accent2);color:#ff85e2}
#t-fire.empty{opacity:.4}
#h-exit{border-color:rgba(255,95,143,.5);color:#ff9bb8}
body[data-mode="portrait"] #hud-lb{top:48px;left:12px;right:auto;min-width:150px;padding:7px 10px;font-size:11px}
body[data-mode="portrait"] #hud-lb .ph{display:none}
body[data-mode="portrait"] #hud-score{min-width:120px;padding:8px 11px}
body[data-mode="portrait"] .score-big{font-size:22px}
body[data-mode="portrait"] #hud-status{top:auto;bottom:126px;left:12px}
body[data-mode="portrait"] #hud-status .pw{font-size:10px;padding:3px 7px}
body[data-mode="portrait"] #hud-top .chip{padding:4px 9px;font-size:11px}
body[data-mode="landscape"] #hud-lb{min-width:160px;padding:7px 10px;font-size:11px}
/* ── ENTRADA ── */
.screen{background:radial-gradient(ellipse at 50% 35%,rgba(11,18,48,.66),rgba(2,3,10,.92))}
#s-entry{background:radial-gradient(ellipse at 50% 35%,rgba(11,18,48,.5),rgba(2,3,10,.8))}
.brand{font-size:42px;font-weight:200;letter-spacing:4px;color:#fff;text-shadow:0 0 16px rgba(79,227,255,.9),0 0 50px rgba(47,107,255,.7)}
.tagline{font-size:9.5px;color:var(--accent);letter-spacing:1.6px;font-family:var(--font-mono)}
.entry-main{padding:26px 30px}
.skinrow{background:rgba(255,255,255,.045);border:1px solid rgba(79,227,255,.2);border-radius:var(--radius);padding:9px 12px}
.skinmeta b{font-size:14px;font-weight:600}.skinmeta i{font-style:normal;font-size:10px;letter-spacing:2px}
.entry-links .btn-secondary{padding:9px 4px;font-size:11px;letter-spacing:1px}
.guest-note{font-size:11px;color:var(--muted);letter-spacing:1px}
.guest-note[data-kind="registered"] .gn-txt{color:var(--ok)}
.mr-row{font-size:12px;font-family:var(--font-mono);color:#b9cbe6;padding:3px 0;border-bottom:1px solid rgba(79,227,255,.08)}
.mr-pos{color:var(--accent)}.mr-val{color:var(--accent)}
.mini-rooms .mr-row .code{color:#fff}
.entry-side .mini-rank+.ph{margin-top:12px}
/* ── CONTA ── */
.overlay{background:rgba(2,3,10,.7);backdrop-filter:blur(6px)}
.modal-title{font-size:17px;font-weight:300;letter-spacing:6px;color:#fff;text-align:center;text-shadow:0 0 14px rgba(79,227,255,.8)}
.tabs{border:1px solid var(--line);border-radius:999px;overflow:hidden}
.tabs button{flex:1;padding:8px;font-size:11.5px;letter-spacing:2px;color:var(--muted);font-family:var(--font-mono)}
.tabs button.on{background:var(--accent);color:#02121c;font-weight:700}
.modal-actions button{flex:1;padding:11px;font-size:13px;letter-spacing:2px}
/* ── LOBBY ── */
.lobby-hero .hint{font-size:11px}
.room-row{font-family:var(--font-mono);font-size:12.5px;color:#b9cbe6;border-bottom:1px solid rgba(79,227,255,.1)}
.room-row.head{font-size:10px;letter-spacing:2px;color:var(--accent);font-weight:700}
.room-row .code{color:#fff;font-size:15px;letter-spacing:2px}
.room-row .bar{background:rgba(79,227,255,.12);border-radius:3px;color:var(--accent)}
.room-row.full{opacity:.5}
.me-chip b{font-size:15px}.me-chip i{font-style:normal;font-size:10px;letter-spacing:2px;color:var(--muted)}
.me-chip i[data-kind="registered"]{color:var(--ok)}
/* ── RANKING ── */
.rank-table{padding:8px 14px}
#rk-table tr.me td{color:#ffd166;font-weight:700;background:rgba(255,209,102,.06)}
#rk-table tr.top1 .c-rank{color:#ffd166}#rk-table tr.top2 .c-rank{color:#c8d3e8}#rk-table tr.top3 .c-rank{color:#d09a5c}
.c-delta.up{color:var(--ok)}.c-delta.down{color:var(--danger)}
.rank-me{font-family:var(--font-mono);color:#ffd166;padding:12px 18px}
.rank-me b{font-size:22px;font-weight:400}
/* ── PERFIL ── */
.pf-nick{font-size:22px;font-weight:300;letter-spacing:2px}
.pf-kind{font-style:normal;font-size:10px;letter-spacing:2px;color:var(--muted)}
.pf-kind[data-kind="registered"]{color:var(--ok)}
.stat{padding:12px 8px}
.stat b{font-size:20px;font-weight:300;color:#fff}.stat i{font-style:normal;font-size:9px;letter-spacing:2px;color:var(--accent);font-family:var(--font-mono)}
.pf-hist td.cause{font-size:11px;color:var(--muted)}
.pf-hist td.cause.blackhole{color:var(--accent2)}.pf-hist td.cause i{font-style:normal;color:#b9cbe6}
.ach{padding:8px;border:1px solid rgba(79,227,255,.12);border-radius:var(--radius);opacity:.55}
.ach.done{opacity:1;border-color:rgba(57,255,136,.4)}
.ach.secret{opacity:.35}
.ach b{font-size:12.5px}.ach i{font-size:10.5px;color:var(--muted)}
.ach-bar{background:rgba(79,227,255,.12);color:var(--accent);border-radius:2px;margin-top:3px}
.ach.done .ach-bar{color:var(--ok)}
.ach-coins{font-style:normal;font-size:11px;color:#ffd166;font-family:var(--font-mono)}
/* ── LOJA ── */
.shop-eq .badge{position:static;margin-left:auto}
.filters button{padding:6px 12px;border-radius:999px;border:1px solid rgba(79,227,255,.2);font-size:11px;letter-spacing:1.5px;color:var(--muted);font-family:var(--font-mono)}
.filters button.on{border-color:var(--rc,var(--accent));color:var(--rc,var(--accent));background:rgba(79,227,255,.08)}
.skin-card{background:rgba(255,255,255,.045);border:1px solid rgba(79,227,255,.16);border-radius:14px;color:var(--text);border-top:2px solid var(--rc)}
.skin-card:hover{background:rgba(79,227,255,.1);transform:translateY(-2px);box-shadow:0 0 22px rgba(79,227,255,.2)}
.skin-card.eq{border-color:var(--accent);background:rgba(79,227,255,.14);box-shadow:0 0 24px rgba(79,227,255,.25)}
.skin-card.locked,.skin-card.secret{opacity:.55}.skin-card.poor em{color:var(--danger)}
.skin-card b{font-size:12.5px;font-weight:600}.skin-card i{font-style:normal;font-size:10px;letter-spacing:1.5px;color:var(--rc)}
.skin-card em{font-style:normal;font-size:12px;color:#ffd166}
.badge{background:var(--accent);color:#02121c;font-size:8.5px;font-weight:700;padding:3px 7px;border-radius:5px;letter-spacing:1px}
/* ── PREFS ── */
.pg h2{font-size:11px;letter-spacing:4px;color:var(--accent);font-family:var(--font-mono)}
.pref-row{border-bottom:1px solid rgba(79,227,255,.08);font-size:13px}
.toggle{background:rgba(0,14,30,.75);border:1px solid rgba(79,227,255,.45);color:var(--muted)}
.toggle[aria-checked="true"]{background:rgba(79,227,255,.25);color:var(--accent)}
input[type=range]{accent-color:var(--accent)}
.prefs-foot button{padding:10px 22px}
/* ── MORTE ── */
.dead-card{border-color:rgba(255,79,216,.4);box-shadow:0 24px 70px rgba(0,0,0,.55),0 0 60px rgba(255,79,216,.14);padding:28px 32px}
.dead-icon{font-size:54px;filter:drop-shadow(0 0 24px rgba(255,90,120,.8))}
.dead-title{font-size:38px;font-weight:200;color:var(--danger);letter-spacing:8px;text-shadow:0 0 34px rgba(255,80,130,.75)}
.dead-sub{font-size:11.5px;color:#c98d95}
.dead-by span,.dead-rank span{font-size:9.5px;color:var(--muted);letter-spacing:3px;font-family:var(--font-mono)}
.dead-by b{font-size:23px;color:var(--accent);font-weight:500}
.dead-rank b{font-size:18px;color:#ffd166;font-weight:400;font-family:var(--font-mono)}.dead-rank .arrow{color:var(--ok)}
.dead-stats b{font-size:21px;color:#fff;font-weight:500}
.dead-stats i{font-style:normal;font-size:9.5px;color:var(--muted);letter-spacing:2px;font-family:var(--font-mono)}
/* ── RECONN ── */
.reconn{border-color:rgba(255,95,143,.5)}
.spinner{color:var(--accent)}
.rc-title{color:var(--danger)}
.rc-sub{font-family:var(--font-mono);font-size:12px;color:#b9cbe6;letter-spacing:1px}
/* ── MOBILE ── */
body[data-mode="portrait"] .card{padding:14px 14px}
body[data-mode="portrait"] .brand{font-size:30px}
body[data-mode="portrait"] .btn-primary{padding:12px;font-size:15px}
body[data-mode="portrait"] .tbtn{width:60px;height:60px}
`};
})();

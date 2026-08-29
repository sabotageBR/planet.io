// ── VARIAÇÃO — CARTOON NEON ───────────────────────────────────────────────────
// O Cartoon Cósmico à noite, num fliperama: mesma tinta grossa, cores chapadas e
// sombras sólidas, mas o céu é violeta quase preto com manchas magenta/ciano, e
// tudo que tem borda ganha um filete neon (rosa nos painéis, ciano nos chips,
// lima no "ok"). Estrutura igual (folhas por cima do mundo, JOGAR gigante,
// ícones redondos, três botões de toque), com um giro no HUD: o pódio vira uma
// TIRA horizontal de fichas centrada no topo, sala/ping vão para o canto
// superior esquerdo e a massa vira um placar de fliperama (dígitos ciano) no
// centro inferior; munição/power-ups ficam no canto inferior esquerdo.
// Desempenho: halos neon são assados dentro dos sprites (planeta por skin/tier,
// comida, asteroide, buraco negro); efeitos = arcs/lines + um texto; fundo em cache.
(function(){
const u=MOCK.u,WW=u.WW,WH=u.WH,sh=u.sh,rgba=u.rgba;
const INK="#0a0818",TXT="#f4f0ff",PINK="#ff3fa4",CYAN="#2ee6ff",LIME="#b6ff3c",VIO="#8b5cff",AMB="#ffb830",RED="#ff4d6d";
const FONT="'Trebuchet MS',Verdana,sans-serif",T=900;
let L=[],BIG=null,PROPS=[],bg=null,bgW=0,bgH=0;

// ── sprites ───────────────────────────────────────────────────────────────────
// planeta: fill chapado + crescente + brilho + tinta, e um filete neon assado da cor de glow da skin;
// "eu" ganha anel duplo ciano. Halo = uma shadowBlur só, dentro do bake.
const PK=sk=>sk.ring?2.1:1.48;   // halo mais justo: sprite menor = drawImage mais barato
function planetSpr(sk,isMe,size){return u.sprite("tnp"+sk.id+(isMe?"m":"")+size,size,(c,R)=>{
  const K=PK(sk),r=R/K,col=sk.color,glow=isMe?CYAN:(sk.glow||sk.color),lw=Math.max(2.5,r*.1);c.lineJoin="round";c.lineCap="round";
  c.save();c.shadowBlur=r*.34;c.shadowColor=glow;c.strokeStyle=rgba(glow,.85);c.lineWidth=lw*.9;c.beginPath();c.arc(0,0,r+lw*1.05,0,6.283);c.stroke();c.stroke();c.restore();
  const band=(a0,a1)=>{c.beginPath();c.ellipse(0,0,r*1.85,r*.56,0,a0,a1,false);c.ellipse(0,0,r*1.3,r*.39,0,a1,a0,true);c.closePath();c.fill();c.stroke();};
  if(sk.ring){c.fillStyle=sh(col,.2);c.strokeStyle=INK;c.lineWidth=lw*.7;band(Math.PI,Math.PI*2);}
  c.fillStyle=col;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
  c.save();c.beginPath();c.arc(0,0,r,0,6.283);c.clip();
  c.fillStyle="rgba(10,8,24,.38)";c.beginPath();c.arc(r*.38,r*.4,r*1.05,0,6.283);c.fill();
  c.fillStyle="rgba(255,255,255,.4)";c.beginPath();c.ellipse(-r*.36,-r*.38,r*.34,r*.2,-.75,0,6.283);c.fill();
  c.fillStyle="rgba(255,255,255,.28)";c.beginPath();c.arc(-r*.08,-r*.58,r*.08,0,6.283);c.fill();
  c.globalAlpha=.16;c.font=`${r*1.3}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(sk.emoji,r*.05,r*.15);c.globalAlpha=1;
  c.restore();
  if(sk.ring){c.fillStyle=sh(col,.2);c.strokeStyle=INK;c.lineWidth=lw*.7;band(0,Math.PI);}
  c.strokeStyle=INK;c.lineWidth=lw;c.beginPath();c.arc(0,0,r,0,6.283);c.stroke();
  if(isMe){c.strokeStyle=CYAN;c.lineWidth=lw*.5;c.beginPath();c.arc(0,0,r+lw*.8,0,6.283);c.stroke();c.beginPath();c.arc(0,0,r+lw*1.45,0,6.283);c.stroke();}
  else{c.strokeStyle=rgba(glow,.95);c.lineWidth=lw*.48;c.beginPath();c.arc(0,0,r+lw*.82,0,6.283);c.stroke();}});}

// comida: pontos/estrelas luminosos — halo assado + fill chapado + tinta
const FK=2.1,FICON={missile_ammo:"🚀",powerup_speed:"⚡",powerup_magnet:"🧲",powerup_shield:"🛡️"};
function foodSpr(f){return u.sprite("tnf"+f.type+f.color,72,(c,R)=>{const r=R/FK;c.lineJoin="round";c.strokeStyle=INK;c.lineWidth=Math.max(2,r*.22);c.fillStyle=f.color;
  const fs=()=>{c.shadowBlur=r*.75;c.shadowColor=f.color;c.fill();c.shadowBlur=0;c.stroke();};
  const gl=(x,y,k)=>{c.fillStyle="rgba(255,255,255,.6)";c.beginPath();c.arc(x,y,r*k,0,6.283);c.fill();};
  if(FICON[f.type]){c.beginPath();c.arc(0,0,r*1.45,0,6.283);fs();c.font=`${r*1.45}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(FICON[f.type],0,r*.1);return;}
  if(f.type==="star"){u.spikes(c,r*1.55,5,.5,-1.5708);fs();gl(-r*.25,-r*.3,.22);return;}
  if(f.type==="comet"){c.beginPath();c.moveTo(-r*2,0);c.lineTo(-r*.15,-r*.8);c.arc(0,0,r*.85,-1.4,1.4);c.lineTo(-r*.15,r*.8);c.closePath();fs();gl(-r*.2,-r*.3,.25);return;}
  if(f.type==="rock"){c.rotate(.45);u.rr(c,-r,-r,r*2,r*2,r*.3);fs();gl(-r*.4,-r*.4,.24);return;}
  c.beginPath();c.arc(0,0,r,0,6.283);fs();gl(-r*.3,-r*.32,.26);});}

const EK=1.6;
const ejSpr=col=>u.sprite("tne"+col,44,(c,R)=>{const r=R/EK;c.fillStyle=col;c.shadowBlur=r*.6;c.shadowColor=col;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.shadowBlur=0;
  c.strokeStyle=INK;c.lineWidth=Math.max(2,r*.22);c.stroke();c.fillStyle="rgba(255,255,255,.55)";c.beginPath();c.arc(-r*.3,-r*.32,r*.26,0,6.283);c.fill();});

// estrelas grandes do fundo (ciano / rosa) e planetas de cenário escuros com filete neon
const starSpr=v=>u.sprite("tnstar"+v,36,(c,R)=>{c.lineJoin="round";const col=v?PINK:CYAN;u.spikes(c,R*.78,v?5:4,v?.5:.36,-1.5708);
  c.shadowBlur=R*.3;c.shadowColor=col;c.fillStyle=col;c.fill();c.shadowBlur=0;c.strokeStyle=INK;c.lineWidth=2;c.stroke();});
function propSpr(p,i){return u.sprite("tnprop"+i,256,(c,R)=>{const K=p.ring?2.05:1.3,r=R/K;c.lineJoin="round";
  if(p.ring){c.fillStyle=sh(p.col,-.5);c.strokeStyle=INK;c.lineWidth=r*.06;c.beginPath();c.ellipse(0,0,r*1.8,r*.5,-.35,0,6.283);c.ellipse(0,0,r*1.35,r*.36,-.35,6.283,0,true);c.fill("evenodd");c.stroke();}
  c.save();c.shadowBlur=r*.2;c.shadowColor=p.col;c.strokeStyle=rgba(p.col,.8);c.lineWidth=r*.05;c.beginPath();c.arc(0,0,r*1.09,0,6.283);c.stroke();c.restore();
  c.fillStyle=sh(p.col,-.62);c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
  c.save();c.clip();c.fillStyle="rgba(10,8,24,.35)";c.beginPath();c.arc(r*.35,r*.4,r*1.05,0,6.283);c.fill();
  c.fillStyle=sh(p.col,-.35);c.beginPath();c.ellipse(-r*.3,-r*.3,r*.45,r*.25,-.7,0,6.283);c.fill();
  c.fillStyle="rgba(10,8,24,.22)";[-.45,.1,.5].forEach(y=>{c.beginPath();c.ellipse(0,r*y,r*1.05,r*.1,0,0,6.283);c.fill();});c.restore();
  c.strokeStyle=INK;c.lineWidth=r*.08;c.beginPath();c.arc(0,0,r,0,6.283);c.stroke();});}

// asteroide: rocha violeta escura, 3 crateras, tinta grossa e aresta ciano no lado iluminado (3 variantes × tier)
const AK=1.35;
function astSpr(variant,size){return u.sprite("tna"+variant+size,size,(c,R)=>{const r=R/AK,seed=11+variant*7,n=9+variant*2;c.lineJoin="round";
  c.save();c.shadowBlur=r*.18;c.shadowColor=CYAN;c.fillStyle="#2a1f52";u.astPoly(c,r,seed,n);c.fill();c.restore();
  c.save();u.astPoly(c,r,seed,n);c.clip();c.fillStyle="rgba(10,8,24,.4)";c.beginPath();c.arc(r*.35,r*.4,r*1.05,0,6.283);c.fill();
  c.fillStyle="rgba(46,230,255,.16)";c.beginPath();c.ellipse(-r*.35,-r*.4,r*.35,r*.2,-.7,0,6.283);c.fill();c.restore();
  const cr=u.mulberry(seed*3);for(let i=0;i<3;i++){const a=cr()*6.28,d=cr()*r*.5,c2=r*(.12+cr()*.14);
    c.fillStyle="#170f33";c.beginPath();c.arc(Math.cos(a)*d,Math.sin(a)*d,c2,0,6.283);c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(1.5,r*.045);c.stroke();}
  u.astPoly(c,r,seed,n);c.strokeStyle=INK;c.lineWidth=Math.max(3,r*.1);c.stroke();
  c.save();c.rotate(-.785);c.beginPath();c.rect(-r*2,0,r*4,r*2);c.clip();c.rotate(.785);c.scale(.9,.9);u.astPoly(c,r,seed,n);c.strokeStyle=rgba(CYAN,.85);c.lineWidth=Math.max(1.5,r*.05);c.stroke();c.restore();});}

// buraco negro: disco de tinta com espiral rosa + linhas de sucção ciano (1 sprite, girado por h.spin)
const BK=2.4;
const bhSpr=()=>u.sprite("tnbh",256,(c,R)=>{const r=R/BK;c.lineJoin="round";c.lineCap="round";
  c.strokeStyle=CYAN;c.lineWidth=r*.1;for(let i=0;i<10;i++){const a=i/10*6.283+.3;c.beginPath();c.moveTo(Math.cos(a)*r*1.55,Math.sin(a)*r*1.55);c.lineTo(Math.cos(a+.25)*r*2.2,Math.sin(a+.25)*r*2.2);c.stroke();}
  c.save();c.shadowBlur=r*.3;c.shadowColor=PINK;c.fillStyle="#140c2c";c.beginPath();c.arc(0,0,r*1.3,0,6.283);c.fill();c.restore();
  c.strokeStyle=INK;c.lineWidth=Math.max(3,r*.12);c.beginPath();c.arc(0,0,r*1.3,0,6.283);c.stroke();
  c.strokeStyle=rgba(PINK,.9);c.lineWidth=r*.05;c.beginPath();c.arc(0,0,r*1.38,0,6.283);c.stroke();
  c.strokeStyle=PINK;c.lineWidth=r*.15;c.beginPath();for(let i=0;i<=90;i++){const k=i/90,a=k*6.283*2.2,rr=r*.15+k*r*1.05;i?c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.stroke();
  c.strokeStyle=rgba(CYAN,.7);c.lineWidth=r*.04;c.beginPath();for(let i=0;i<=90;i++){const k=i/90,a=k*6.283*2.2,rr=r*.15+k*r*1.05+r*.11;i?c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.stroke();
  c.fillStyle=INK;c.beginPath();c.arc(0,0,r*.5,0,6.283);c.fill();c.strokeStyle=PINK;c.lineWidth=r*.08;c.stroke();});

window.THEME={
id:"toon-neon",name:"Cartoon Neon",
desc:"O Cartoon Cósmico à noite, num fliperama: céu violeta quase preto com manchas magenta e ciano, tinta grossa e cores chapadas, mas toda borda ganha um filete neon. O pódio vira uma tira de fichas no topo, a massa vira placar de fliperama com dígitos ciano no centro inferior, e os botões de toque brilham em ciano, lima e rosa.",
tags:["fliperama","noite","neon","cartoon"],swatch:["#ff3fa4","#2ee6ff"],
tokens:{bg:"#0d0b1f",surface:"#1c1440",text:"#f4f0ff",muted:"#8f86c9",accent:"#ff3fa4",accent2:"#2ee6ff",danger:"#ff4d6d",ok:"#b6ff3c",
  line:"#0a0818",radius:"14px",radiusLg:"20px",space:"14px",fontUi:"'Trebuchet MS',Verdana,sans-serif",fontMono:"'Courier New',monospace",
  shadow:"6px 6px 0 #0a0818"},
layout:{hud:"strip",nav:"sheet"},
rarityColor:{free:"#8f86c9",common:"#2ee6ff",rare:"#8b5cff",epic:"#ff3fa4",legendary:"#ffb830",earned:"#b6ff3c",secret:"#ff4d6d"},
labels:{title:"WARSPACE.IO",tagline:"Noite de fliperama na galáxia. Divida, ejete e devore!",play:"🚀 JOGAR",playAuto:"🚀 JOGAR (AUTO)",lbTitle:"PÓDIO",
  dead:"KABOOM!",deadSub:"— você virou poeira neon —",respawn:"🔄 DE NOVO!",reconnTitle:"SINAL FRACO!",reconnSub:"Procurando o satélite… tentativa {n}/5",
  back:"◄",create:"➕ Criar sala",top5:"TOP 5 HOJE"},

init(g){const rand=u.mulberry(21);
  L=[.2,.45].map((f,li)=>({f,stars:Array.from({length:li?50:80},()=>({x:rand()*T,y:rand()*T,s:li?2.5+rand()*1.5:1.5+rand(),a:+(.35+rand()*.4).toFixed(2)}))}));
  BIG={f:.7,stars:Array.from({length:22},()=>({x:rand()*T,y:rand()*T,s:14+rand()*12,v:rand()<.5?1:0}))};
  PROPS=[];const pal=[PINK,CYAN,VIO,AMB,"#3dffc0"];
  for(let i=0;i<10;i++)PROPS.push({x:200+rand()*(WW-400),y:200+rand()*(WH-400),r:80+rand()*120,col:pal[i%5],ring:rand()<.4});},

drawBg(c,W,H,cam,t,g){
  if(!bg||bgW!==W||bgH!==H){bgW=W;bgH=H;bg=document.createElement("canvas");bg.width=W;bg.height=H;const x=bg.getContext("2d");
    const gd=x.createLinearGradient(0,0,0,H);gd.addColorStop(0,"#0d0b1f");gd.addColorStop(1,"#1a1040");x.fillStyle=gd;x.fillRect(0,0,W,H);
    const rand=u.mulberry(5),D=Math.max(W,H);
    for(let i=0;i<6;i++){const bx=rand()*W,by=rand()*H,br=(.16+rand()*.22)*D,col=i%2?CYAN:PINK;
      const rg=x.createRadialGradient(bx,by,0,bx,by,br);rg.addColorStop(0,rgba(col,.13));rg.addColorStop(.6,rgba(col,.05));rg.addColorStop(1,rgba(col,0));
      x.fillStyle=rg;x.beginPath();x.arc(bx,by,br,0,6.283);x.fill();}}
  c.drawImage(bg,0,0);
  if(g&&g.prefs&&!g.prefs.parallax)return;
  L.forEach((l,li)=>{const ox=((-cam.x*l.f*cam.scale)%T+T)%T,oy=((-cam.y*l.f*cam.scale)%T+T)%T;c.fillStyle=li?PINK:CYAN;
    l.stars.forEach(s=>{c.globalAlpha=s.a;const bx=(s.x+ox)%T,by=(s.y+oy)%T;for(let x=bx;x<W;x+=T)for(let y=by;y<H;y+=T)c.fillRect(x,y,s.s,s.s);});});
  c.globalAlpha=1;
  const l=BIG,ox=((-cam.x*l.f*cam.scale)%T+T)%T,oy=((-cam.y*l.f*cam.scale)%T+T)%T,sp=[starSpr(0),starSpr(1)];
  l.stars.forEach(s=>{const bx=(s.x+ox)%T,by=(s.y+oy)%T,h=s.s/2;for(let x=bx;x<W;x+=T)for(let y=by;y<H;y+=T)c.drawImage(sp[s.v],x-h,y-h,s.s,s.s);});},

drawWorld(c,cam,t,g,W,H){
  const hw=W/(2*cam.scale),hh=H/(2*cam.scale);c.globalAlpha=.5;
  PROPS.forEach((p,i)=>{const R=p.r*(p.ring?2.05:1.3);if(Math.abs(p.x-cam.x)>hw+R||Math.abs(p.y-cam.y)>hh+R)return;c.drawImage(propSpr(p,i),p.x-R,p.y-R,R*2,R*2);});
  c.globalAlpha=1;
  if(!g||!g.prefs||g.prefs.grid)u.grid(c,150,"rgba(46,230,255,.08)",2);
  c.strokeStyle=INK;c.lineWidth=18;c.strokeRect(0,0,WW,WH);
  c.strokeStyle=PINK;c.lineWidth=6;c.setLineDash([40,26]);c.strokeRect(0,0,WW,WH);c.setLineDash([]);},

drawFood(c,f,t){const p=f.type==="star"?1+Math.sin(t*.003+f.seed)*.14:1,r=f.r*FK*p,s=foodSpr(f);
  if(f.type==="rock"||f.type==="comet"){c.save();c.translate(f.x,f.y);c.rotate(f.seed);c.drawImage(s,-r,-r,r*2,r*2);c.restore();return;}
  const bob=FICON[f.type]?Math.sin(t*.005+f.seed)*3:0;c.drawImage(s,f.x-r,f.y-r+bob,r*2,r*2);},
drawEjected(c,e){const r=e.r*EK;c.drawImage(ejSpr(e.color),e.x-r,e.y-r,r*2,r*2);},

drawAsteroid(c,a,t){const r=a.r*AK;c.save();c.translate(a.x,a.y);c.rotate(a.rot);c.drawImage(astSpr(a.variant,u.tier(a.r)),-r,-r,r*2,r*2);c.restore();},

drawBlackHole(c,h,t){const k=h.k,rc=h.rc*k,ri=h.ri*k;
  c.strokeStyle=rgba(CYAN,.25+.1*Math.sin(t*.004));c.lineWidth=3;c.setLineDash([14,18]);c.beginPath();c.arc(h.x,h.y,ri,-h.spin*.4,-h.spin*.4+6.283);c.stroke();c.setLineDash([]);
  const R=rc*BK;c.save();c.translate(h.x,h.y);c.rotate(h.spin);c.globalAlpha=Math.min(1,k*1.2);c.drawImage(bhSpr(),-R,-R,R*2,R*2);c.restore();c.globalAlpha=1;},

drawTrail(c,pc,p,isMe){if(!u.trailPath(c,pc))return;
  c.strokeStyle=rgba(isMe?CYAN:(p.skin.glow||p.skin.color),isMe?.6:.4);c.lineWidth=Math.max(2,pc.r*.22);c.lineCap="round";c.lineJoin="round";
  c.setLineDash([pc.r*.35,pc.r*.35]);c.stroke();c.setLineDash([]);},

drawMissile(c,m,t){c.lineJoin="round";
  m.trail.forEach((pt,i)=>{if(i%2)return;const a=i/m.trail.length;c.fillStyle=`rgba(46,230,255,${a*.5})`;c.beginPath();c.arc(pt.x,pt.y,m.r*.7*a,0,6.283);c.fill();});
  c.save();c.translate(m.x,m.y);c.rotate(Math.atan2(m.vy,m.vx));const r=m.r,fl=1+.25*Math.sin(t*.05);
  c.fillStyle=AMB;c.beginPath();c.moveTo(-r*1.1,0);c.lineTo(-r*2.4*fl,-r*.6);c.lineTo(-r*2*fl,0);c.lineTo(-r*2.4*fl,r*.6);c.closePath();c.fill();
  c.strokeStyle=INK;c.lineWidth=2.6;c.fillStyle=PINK;
  c.beginPath();c.moveTo(r*1.6,0);c.quadraticCurveTo(r*.6,-r*.95,-r*.9,-r*.7);c.lineTo(-r*1.3,-r*1.1);c.lineTo(-r*1.3,r*1.1);c.lineTo(-r*.9,r*.7);c.quadraticCurveTo(r*.6,r*.95,r*1.6,0);c.closePath();c.fill();c.stroke();
  c.fillStyle=CYAN;c.beginPath();c.arc(r*.25,0,r*.36,0,6.283);c.fill();c.stroke();c.restore();},

drawCell(c,pc,p,isMe,t,prev,g){const r=pc.displayR||pc.r,sk=p.skin,d=r*PK(sk),pr=(g&&g.prefs)||{names:true,mass:true};
  c.drawImage(planetSpr(sk,isMe,u.tier(r)),pc.x-d,pc.y-d,d*2,d*2);
  c.save();c.translate(pc.x,pc.y);c.lineCap="round";
  if(pc.mergeTimer>0){c.strokeStyle=AMB;c.lineWidth=Math.max(3,r*.08);c.beginPath();c.arc(0,0,r*1.22,-1.5708,-1.5708+(1-pc.mergeTimer/u.mergeTime(pc.r))*6.283);c.stroke();}
  const pw=Object.keys(p._powerups||{});
  if(pw.length){const cl={speed:AMB,magnet:VIO,shield:CYAN};
    pw.forEach((k,i)=>{const a0=t*.001*(i%2?-1:1);c.strokeStyle=cl[k];c.lineWidth=Math.max(3,r*.08);c.globalAlpha=.6+.4*Math.sin(t*.012+i);
      c.setLineDash([r*.4,r*.3]);c.beginPath();c.arc(0,0,r*(1.34+i*.16),a0,a0+6.283);c.stroke();c.setLineDash([]);c.globalAlpha=1;});}
  if(!prev&&r>13){const fs=Math.max(12,r*.34);
    if(pr.names!==false)u.outText(c,p.name+(p.registered?" ✓":""),0,pr.mass!==false?-fs*.28:0,fs,"#fff",INK,FONT);
    if(pr.mass!==false)u.outText(c,u.fmt(pc.r*pc.r),0,pr.names!==false?fs*.8:0,fs*.68,CYAN,INK,FONT);}
  c.restore();},

drawFx(c,f,t){const k=f.age/f.ttl,a=1-k;c.lineJoin="round";c.lineCap="round";
  switch(f.t){
    case "bounce":{const s=f.r*(.7+k*.3)*(.6+(f.power||1)*.5);c.save();c.translate(f.x,f.y);c.rotate(f.nx*.6);
      u.spikes(c,s,8,.55,0);c.fillStyle=PINK;c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(2,s*.08);c.stroke();
      u.outText(c,"POW!",0,0,Math.max(10,s*.5),LIME,INK,FONT);c.restore();break;}
    case "pop":{const s=f.r*(1+k*.8);c.save();c.translate(f.x,f.y);c.globalAlpha=Math.min(1,a*1.5);
      u.spikes(c,s,10,.5,k*.6);c.fillStyle=CYAN;c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(2,s*.06);c.stroke();
      u.outText(c,"BOOM",0,0,Math.max(10,s*.42),PINK,INK,FONT);c.restore();break;}
    case "boom":{const s=f.r*(.8+k*1.2);c.save();c.translate(f.x,f.y);c.globalAlpha=Math.min(1,a*1.5);
      u.spikes(c,s,12,.55,-k*.5);c.fillStyle=PINK;c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(2.5,s*.06);c.stroke();
      u.spikes(c,s*.55,12,.55,-k*.5);c.fillStyle=LIME;c.fill();u.outText(c,"KABOOM!",0,0,Math.max(11,s*.34),CYAN,INK,FONT);c.restore();break;}
    case "eat":c.strokeStyle=rgba(CYAN,a);c.lineWidth=3;c.beginPath();c.arc(f.x,f.y,f.r*(1.2+k*1.2),0,6.283);c.stroke();
      if(f.r>8)u.outText(c,"nom",f.x,f.y-f.r*(1+k*2),Math.max(9,f.r*.9),LIME,INK,FONT);break;
    case "suck":c.strokeStyle=rgba(PINK,a);c.lineWidth=4;c.beginPath();c.arc(f.x,f.y,f.r*(3-k*2.6),0,6.283);c.stroke();break;
    case "exit":case "split":case "merge":c.strokeStyle=`rgba(255,255,255,${a})`;c.lineWidth=3;c.beginPath();c.arc(f.x,f.y,f.r*(.6+k*1.5),0,6.283);c.stroke();break;
    case "chip":c.strokeStyle=rgba(AMB,a);c.lineWidth=3;for(let i=-1;i<=1;i++){const an=Math.atan2(f.ny,f.nx)+i*.5;c.beginPath();c.moveTo(f.x,f.y);c.lineTo(f.x+Math.cos(an)*f.r*3*k,f.y+Math.sin(an)*f.r*3*k);c.stroke();}break;
    case "shoot":c.strokeStyle=rgba(PINK,a);c.lineWidth=3;for(let i=0;i<8;i++){const an=i/8*6.283;c.beginPath();c.moveTo(f.x+Math.cos(an)*f.r*(1+k),f.y+Math.sin(an)*f.r*(1+k));c.lineTo(f.x+Math.cos(an)*f.r*(1.6+k*1.4),f.y+Math.sin(an)*f.r*(1.6+k*1.4));c.stroke();}break;
    case "rock":c.strokeStyle=rgba(VIO,a*.6);c.lineWidth=2;c.beginPath();c.arc(f.x,f.y,f.r*.4*(1+k),0,6.283);c.stroke();break;}},

// radar redondo no canto superior direito com filete neon (o resto do HUD é DOM).
// No retrato ele desce um pouco para deixar a tira do pódio no topo.
drawHud(c,W,H,g,t,mode){
  if(g.prefs&&!g.prefs.minimap)return;
  const D=mode==="portrait"?92:mode==="landscape"?84:150,MP=mode==="landscape"?10:12,R=D/2,cx=W-MP-R,cy=(mode==="portrait"?44:MP)+R;c.lineJoin="round";
  c.fillStyle=INK;c.beginPath();c.arc(cx+4,cy+4,R+2,0,6.283);c.fill();
  c.strokeStyle=PINK;c.lineWidth=2;c.beginPath();c.arc(cx,cy,R+3,0,6.283);c.stroke();
  c.fillStyle="#120c28";c.beginPath();c.arc(cx,cy,R,0,6.283);c.fill();c.strokeStyle=INK;c.lineWidth=4;c.stroke();
  c.strokeStyle="rgba(46,230,255,.35)";c.lineWidth=1.5;[.33,.66].forEach(k=>{c.beginPath();c.arc(cx,cy,R*k,0,6.283);c.stroke();});
  c.beginPath();c.moveTo(cx-R,cy);c.lineTo(cx+R,cy);c.moveTo(cx,cy-R);c.lineTo(cx,cy+R);c.stroke();
  const a=t*.0025;c.fillStyle="rgba(255,63,164,.18)";c.beginPath();c.moveTo(cx,cy);c.arc(cx,cy,R-2,a-.7,a);c.closePath();c.fill();
  c.strokeStyle=PINK;c.lineWidth=2;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.cos(a)*(R-2),cy+Math.sin(a)*(R-2));c.stroke();
  const S=D*.72,mx=cx-S/2,my=cy-S/2;
  c.save();c.beginPath();c.arc(cx,cy,R-2,0,6.283);c.clip();
  u.minimap(c,mx,my,S,g,{me:CYAN,player:PINK,bot:"#b48cff",ast:"rgba(139,92,255,.85)",hole:"rgba(255,63,164,.8)",view:"rgba(46,230,255,.35)"});
  const me=g.players[g.me];
  if(me&&!me.dead&&me.pieces.length){const sc=S/WW,n=me.pieces.length,x=mx+me.pieces.reduce((s,q)=>s+q.x,0)/n*sc,y=my+me.pieces.reduce((s,q)=>s+q.y,0)/n*sc;
    c.fillStyle=CYAN;c.strokeStyle=INK;c.lineWidth=1.5;c.beginPath();c.arc(x,y,mode==="desktop"?4:3,0,6.283);c.fill();c.stroke();}
  c.restore();
  if(mode==="desktop"){c.font="bold 9px "+FONT;c.fillStyle=CYAN;c.textAlign="center";c.textBaseline="middle";c.fillText("RADAR",cx,cy+R-10);}},

paintSkin(c,sk,r){const rr=sk.ring?r*.68:r,d=rr*PK(sk);c.drawImage(planetSpr(sk,false,u.tier(rr)),-d,-d+2,d*2,d*2);},

css:`
/* ── BASE ── */
body{font-family:var(--font-ui);font-weight:700}
.card,.panel{background:var(--surface);border:4px solid var(--line);border-radius:var(--radius-lg);padding:14px 16px;color:var(--text);box-shadow:0 0 0 2px var(--accent),var(--shadow)}
.panel{padding:10px 12px;border-radius:var(--radius)}
.ph{font-size:12px;letter-spacing:1px;color:var(--accent2);text-shadow:2px 2px 0 var(--line);text-transform:uppercase}
.hint{font-size:12px;color:var(--muted);font-weight:600}
.dim{color:var(--muted);opacity:1}
.reg{color:var(--ok)}.bot{color:var(--muted)}
.code,.mono{font-family:var(--font-mono);font-weight:700}
.coinbar{background:var(--line);border:3px solid #ffb830;border-radius:999px;padding:4px 14px;font-size:15px;color:#ffb830;box-shadow:0 0 0 2px rgba(255,184,48,.35)}
.coinbar span{font-size:11px;color:#c99a3a;font-weight:600}
.btn-primary{background:var(--accent);border:4px solid var(--line);border-radius:var(--radius-lg);padding:14px;font-size:20px;font-weight:700;color:var(--line);box-shadow:0 0 0 2px var(--accent),var(--shadow);letter-spacing:1px;text-transform:uppercase;transition:transform .05s,box-shadow .05s}
.btn-primary:hover{background:#ff6dbb}
.btn-secondary{background:var(--accent2);border:4px solid var(--line);border-radius:var(--radius);padding:11px;font-size:14px;font-weight:700;color:var(--line);box-shadow:0 0 0 2px var(--accent2),4px 4px 0 var(--line);transition:transform .05s,box-shadow .05s}
.btn-secondary:hover{background:#7af0ff}
.btn-mini{background:var(--accent2);border:3px solid var(--line);border-radius:10px;padding:6px 12px;font-size:12px;color:var(--line);font-weight:700;box-shadow:0 0 0 2px var(--accent2),3px 3px 0 var(--line);white-space:nowrap;transition:transform .05s,box-shadow .05s}
.btn-primary:active,.btn-secondary:active{transform:translate(4px,4px);box-shadow:0 0 0 2px var(--accent2)}
.btn-primary:active{box-shadow:0 0 0 2px var(--accent)}
.btn-mini:active{transform:translate(3px,3px);box-shadow:0 0 0 2px var(--accent2)}
.btn-link{color:var(--accent2);text-decoration:underline;font-size:12px}
.field label{font-size:12px;color:var(--muted)}
.field input,.code-row input{background:var(--bg);border:4px solid var(--line);border-radius:var(--radius);padding:10px 12px;font-size:17px;color:#fff;outline:none;font-weight:700;font-family:inherit;box-shadow:0 0 0 2px #2d2266}
.field input:focus,.code-row input:focus{box-shadow:0 0 0 2px var(--accent2)}
select{background:var(--bg);border:3px solid var(--line);border-radius:10px;padding:6px 10px;color:#fff;font-weight:700;font-family:inherit;box-shadow:0 0 0 2px #2d2266}
.seg{gap:4px;padding:0 6px;border-bottom:4px solid var(--line)}
.seg button{padding:8px 14px;font-size:12.5px;color:var(--muted);background:#140f33;border:4px solid var(--line);border-bottom:0;border-radius:14px 14px 0 0;margin-bottom:-4px}
.seg button.on{background:var(--accent);color:var(--line)}
.sh{position:sticky;top:0;z-index:3;background:var(--surface);padding:6px 0 10px;border-bottom:4px solid var(--line);gap:12px;box-shadow:0 4px 0 -2px var(--accent)}
.sh .stitle{font-size:24px;color:var(--accent);text-shadow:2px 2px 0 var(--accent2),4px 4px 0 var(--line);letter-spacing:1px}
.btn-mini.back{width:38px;height:38px;border-radius:50%;padding:0;display:flex;align-items:center;justify-content:center;font-size:14px;background:var(--accent2)}
.nav{order:99;position:sticky;bottom:0;z-index:3;background:var(--line);margin:4px -16px 0;padding:8px 8px 0;height:74px;gap:2px;justify-content:space-around;flex-wrap:nowrap;box-shadow:0 8px 0 var(--line),0 -2px 0 var(--accent)}
.nav-btn{flex:1;flex-direction:column;gap:3px;padding:2px;border-radius:12px;color:var(--muted);font-size:10px;font-weight:700}
.nav-ico{display:flex;width:40px;height:40px;border-radius:50%;background:#231a55;border:3px solid #3d2e80;align-items:center;justify-content:center;font-size:19px;font-style:normal}
.nav-btn[data-nav="entry"] .nav-ico::before{content:"🏠"}.nav-btn[data-nav="lobby"] .nav-ico::before{content:"🛰️"}.nav-btn[data-nav="rank"] .nav-ico::before{content:"🏆"}
.nav-btn[data-nav="profile"] .nav-ico::before{content:"👤"}.nav-btn[data-nav="shop"] .nav-ico::before{content:"🛍️"}.nav-btn[data-nav="prefs"] .nav-ico::before{content:"⚙️"}
.nav-btn.on{color:var(--accent2)}
.nav-btn.on .nav-ico{background:var(--accent);border-color:var(--accent2);box-shadow:0 0 10px rgba(255,63,164,.6)}
th{font-size:11px;color:var(--muted);border-bottom:3px solid var(--line);text-transform:uppercase}
td{font-size:13px;border-bottom:2px solid rgba(10,8,24,.5)}
#toast{background:var(--accent2);border:3px solid var(--line);border-radius:999px;color:var(--line);font-size:13px;box-shadow:0 0 0 2px var(--accent2),4px 4px 0 var(--line)}
/* folhas: toda tela é um bottom sheet por cima do mundo, com filete rosa na borda */
.screen{background:rgba(10,8,24,.35);padding:0;overflow:hidden}
.screen.on{display:block}
.screen .wrap{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:min(520px,100%);max-height:88%;overflow:auto;border-radius:24px 24px 0 0;
  background:var(--surface);border:5px solid var(--line);border-bottom:0;padding:0 16px;gap:12px;grid-template-columns:1fr;grid-template-areas:none;box-shadow:0 0 0 2px var(--accent),0 -10px 40px rgba(255,63,164,.25)}
.screen .wrap>*{grid-area:auto}
.screen .wrap::before{content:"";display:block;width:60px;height:8px;border-radius:99px;background:var(--accent2);margin:8px auto -4px;justify-self:center;box-shadow:2px 2px 0 var(--line)}
/* ── HUD ── */
/* sala/ping no canto superior esquerdo; pódio = tira de fichas centrada no topo; placar no centro inferior; munição à esquerda */
#hud-top{left:12px;top:12px;transform:none;gap:8px}
#hud-top .chip{background:var(--surface);border:3px solid var(--line);border-radius:999px;padding:4px 12px;font-size:12px;color:#fff;box-shadow:0 0 0 2px var(--accent2),3px 3px 0 var(--line)}
#hud-top .chip i{color:var(--muted);font-size:10px;text-transform:uppercase}
#h-exit{background:var(--accent);border-radius:999px;box-shadow:0 0 0 2px var(--accent),3px 3px 0 var(--line)}
#hud-lb{left:50%;right:auto;top:12px;transform:translateX(-50%);min-width:0;background:transparent;border:0;box-shadow:none;padding:0}
#hud-lb .ph{display:none}
#lb-rows{display:flex;flex-direction:row;gap:10px;align-items:center;justify-content:center}
.lb-row{position:relative;background:var(--surface);border:3px solid var(--line);border-radius:999px;padding:4px 12px 4px 5px;gap:8px;color:#fff;font-size:13px;--rim:#8b5cff;box-shadow:0 0 0 2px var(--rim),3px 3px 0 var(--line);min-width:150px;max-width:220px}
.lb-row:nth-child(n+4):not(.mine){display:none}
.lb-pos{flex:none;width:24px;min-width:24px;height:24px;border-radius:50%;background:var(--rim);color:var(--line);display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid var(--line)}
.lb-row:nth-child(1){font-size:15px;min-width:180px;--rim:var(--accent)}
.lb-row:nth-child(2){--rim:var(--accent2)}
.lb-row:nth-child(3){--rim:#8b5cff}
.lb-row.mine{background:var(--ok);color:var(--line);--rim:var(--ok)}
.lb-row.mine .lb-pos{background:var(--line);color:var(--ok)}
.lb-val{color:var(--accent2)}.lb-row.mine .lb-val{color:var(--line)}
#hud-score{left:50%;bottom:16px;transform:translateX(-50%);min-width:0;max-width:300px;background:var(--line);border:4px solid #2d2266;border-radius:18px;padding:6px 18px 8px;color:var(--accent2);box-shadow:0 0 0 3px var(--accent2),5px 5px 0 var(--line);
  display:flex;flex-wrap:wrap;justify-content:center;align-items:baseline;gap:0 14px;text-align:center}
.score-big{width:100%;font-family:var(--font-mono);font-size:34px;line-height:1;letter-spacing:2px;color:var(--accent2);text-shadow:2px 2px 0 #0a0818,0 0 14px rgba(46,230,255,.65)}
.score-sub{width:100%;font-size:10px;letter-spacing:3px;color:var(--accent);margin-bottom:4px}
.score-row{font-size:12px;color:#fff}.score-row .k{font-size:10px;color:var(--muted);text-transform:uppercase}
#hud-status{left:12px;bottom:16px;transform:none;flex-direction:row;align-items:center;gap:8px}
#hud-ammo{background:var(--accent);border:3px solid var(--line);border-radius:999px;padding:5px 12px;font-size:13px;color:var(--line);box-shadow:0 0 0 2px var(--accent),3px 3px 0 var(--line)}
#hud-ammo span{font-size:10px;text-transform:uppercase;opacity:.85}
#hud-ammo.empty{background:#2d2266;color:#8f86c9;box-shadow:0 0 0 2px #3d2e80,3px 3px 0 var(--line)}
.pw{background:var(--surface);border:3px solid var(--line);border-radius:999px;padding:4px 10px;font-size:11px;color:#fff;box-shadow:0 0 0 2px #8b5cff,3px 3px 0 var(--line)}
.pw-speed{background:#a56f10;box-shadow:0 0 0 2px #ffb830,3px 3px 0 var(--line)}.pw-magnet{background:#5a2fb0;box-shadow:0 0 0 2px #8b5cff,3px 3px 0 var(--line)}.pw-shield{background:#0f6f80;box-shadow:0 0 0 2px var(--accent2),3px 3px 0 var(--line)}
#hud-cd{display:none}
#touch{display:flex;bottom:16px;right:16px;gap:14px}
.tbtn{position:relative;width:72px;height:72px;border:4px solid var(--line);color:var(--line);font-weight:700;gap:0;transition:transform .05s,box-shadow .05s}
.tbtn::before{font-size:24px;line-height:1}
#t-split{background:var(--accent2);box-shadow:0 0 0 2px var(--accent2),4px 4px 0 var(--line)}#t-split::before{content:"✂️"}
#t-eject{background:var(--ok);box-shadow:0 0 0 2px var(--ok),4px 4px 0 var(--line)}#t-eject::before{content:"💨"}
#t-fire{background:var(--accent);box-shadow:0 0 0 2px var(--accent),4px 4px 0 var(--line)}#t-fire::before{content:"🚀"}
.tbtn span{font-size:9px;letter-spacing:.5px}
.tbtn b{position:absolute;top:-7px;right:-7px;width:24px;height:24px;border-radius:50%;background:var(--accent2);border:3px solid var(--line);font-size:11px;display:flex;align-items:center;justify-content:center;color:var(--line)}
.tbtn:active{transform:translate(4px,4px);box-shadow:none}
.tbtn.cd,#t-fire.empty{opacity:1;background:#2d2266;color:#8f86c9;box-shadow:0 0 0 2px #3d2e80;transform:translate(4px,4px)}
.tbtn.cd::before,#t-fire.empty::before{filter:grayscale(1);opacity:.5}
/* ── ENTRADA ── */
#s-entry{background:rgba(10,8,24,.2)}
#s-entry .entry-wrap{position:absolute;inset:0;left:0;bottom:auto;transform:none;width:100%;max-height:none;border:0;border-radius:0;background:transparent;box-shadow:none;padding:0;overflow:hidden;
  display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:0}
#s-entry .entry-wrap::before{display:none}
.brand-block{padding-top:8vh;gap:8px}
.brand{font-size:56px;color:var(--accent);text-shadow:3px 3px 0 var(--accent2),6px 6px 0 var(--line);letter-spacing:1px;transform:rotate(-3deg);line-height:1.1}
.tagline{font-size:13px;color:var(--text);background:var(--line);padding:4px 14px;border-radius:999px;border:3px solid var(--accent2);box-shadow:0 0 12px rgba(46,230,255,.4)}
.entry-main{background:transparent;border:0;box-shadow:none;padding:0 16px 22px;width:min(440px,100%);gap:12px}
.entry-main .coinbar{position:absolute;top:14px;right:14px}
.entry-main .field{order:2;align-items:center}
.entry-main .field input{border-radius:999px;text-align:center;max-width:320px}
.skinrow{order:1;background:var(--surface);border:4px solid var(--line);border-radius:999px;padding:5px 12px 5px 6px;width:auto;min-width:270px;box-shadow:0 0 0 2px var(--accent2),4px 4px 0 var(--line)}
.skinrow canvas{width:56px;height:56px}
.skinmeta b{font-size:15px;color:#fff}.skinmeta i{font-style:normal;font-size:11px;text-transform:uppercase}
.entry-main .btn-primary{order:3;font-size:30px;padding:18px;border-radius:26px;border-width:5px;box-shadow:0 0 0 3px var(--accent),8px 8px 0 var(--line),0 0 28px rgba(255,63,164,.5);transform:rotate(-1.5deg)}
.entry-main .btn-primary:active{transform:rotate(-1.5deg) translate(6px,6px);box-shadow:0 0 0 3px var(--accent)}
.entry-links{order:4;display:flex;justify-content:center;gap:10px}
.entry-links .btn-secondary{display:flex;flex-direction:column;align-items:center;gap:5px;width:66px;padding:0;background:none;border:0;box-shadow:none;font-size:10.5px;color:#fff;text-shadow:1px 1px 0 var(--line)}
.entry-links .btn-secondary::before{content:"";display:flex;align-items:center;justify-content:center;width:58px;height:58px;border-radius:50%;background:var(--accent2);border:4px solid var(--line);box-shadow:0 0 0 2px var(--rim,var(--accent2)),4px 4px 0 var(--line);font-size:26px;transition:transform .05s,box-shadow .05s}
.entry-links [data-go="lobby"]::before{content:"🛰️";background:#2ee6ff;--rim:#2ee6ff}.entry-links [data-go="rank"]::before{content:"🏆";background:#ff3fa4;--rim:#ff3fa4}
.entry-links [data-go="profile"]::before{content:"👤";background:#b6ff3c;--rim:#b6ff3c}.entry-links [data-go="shop"]::before{content:"🛍️";background:#8b5cff;--rim:#8b5cff}.entry-links [data-go="prefs"]::before{content:"⚙️";background:#ffb830;--rim:#ffb830}
.entry-links .btn-secondary:hover{background:none}
.entry-links .btn-secondary:active{transform:none}
.entry-links .btn-secondary:active::before{transform:translate(4px,4px);box-shadow:0 0 0 2px var(--rim,var(--accent2))}
.guest-note{order:5;font-size:12px;color:var(--text);text-shadow:1px 1px 0 var(--line)}
.guest-note[data-kind="registered"] .gn-txt{color:var(--ok)}
.entry-main .hint{order:6;font-size:11px;text-align:center;color:var(--muted);text-shadow:1px 1px 0 var(--line)}
.entry-side{display:none}
/* ── CONTA ── */
.overlay{background:rgba(10,8,24,.55);padding:0;backdrop-filter:blur(2px)}
.modal{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:min(520px,100%);max-height:88%;overflow:auto;border-radius:24px 24px 0 0;border:5px solid var(--line);border-bottom:0;
  background:var(--surface);padding:12px 18px 20px;box-shadow:0 0 0 2px var(--accent2),0 -10px 40px rgba(46,230,255,.2)}
.modal::before{content:"";display:block;width:60px;height:8px;border-radius:99px;background:var(--accent2);margin:0 auto 2px;flex:none;box-shadow:2px 2px 0 var(--line)}
.modal-title{font-size:24px;color:var(--accent);text-shadow:2px 2px 0 var(--accent2),4px 4px 0 var(--line);text-align:center}
.tabs{gap:4px;padding:0 6px;border-bottom:4px solid var(--line)}
.tabs button{flex:1;padding:9px;font-size:13px;color:var(--muted);background:#140f33;border:4px solid var(--line);border-bottom:0;border-radius:14px 14px 0 0;margin-bottom:-4px}
.tabs button.on{background:var(--accent);color:var(--line)}
.modal-actions button{flex:1;padding:12px;font-size:15px}
/* ── LOBBY ── */
.lobby-hero{order:50;position:sticky;bottom:74px;z-index:2;background:var(--surface);border:0;border-top:4px solid var(--line);border-radius:0;box-shadow:0 -2px 0 var(--accent2);margin:0 -16px;padding:10px 16px 12px;grid-template-columns:auto 1fr auto;gap:10px;grid-template-areas:"me input enter" "create play play"}
.me-chip{grid-area:me;background:#140f33;border:3px solid var(--line);border-radius:999px;padding:4px 14px 4px 5px;width:max-content;box-shadow:0 0 0 2px var(--accent2),3px 3px 0 var(--line)}
.me-chip canvas{width:40px;height:40px}
.me-chip b{font-size:15px;color:#fff}.me-chip i{font-style:normal;font-size:10px;color:var(--muted);text-transform:uppercase}
.me-chip i[data-kind="registered"]{color:var(--ok)}
.code-row{display:contents}
.code-row input{grid-area:input;text-align:center;letter-spacing:3px;font-size:17px;padding:8px 6px;min-width:0}
.code-row .btn-secondary:first-of-type{grid-area:enter;width:auto;padding:8px 16px}
.code-row .btn-secondary:last-of-type{grid-area:create;background:var(--ok);padding:12px 14px;font-size:15px;white-space:nowrap;box-shadow:0 0 0 2px var(--ok),4px 4px 0 var(--line)}
.lobby-hero .btn-primary{grid-area:play;font-size:16px;padding:12px}
.lobby-hero .hint{display:none}
.room-list{background:transparent;border:0;box-shadow:none;padding:2px 0 0;gap:8px}
.room-row{background:#140f33;border:3px solid var(--line);border-radius:12px;padding:6px 8px;grid-template-columns:70px 44px 1fr 44px 46px 78px;font-size:12.5px;color:#cfc8f0;box-shadow:0 0 0 2px #2d2266,3px 3px 0 var(--line)}
.room-row.head{background:transparent;border:0;box-shadow:none;padding:0 8px;font-size:10px;color:var(--muted);text-transform:uppercase}
.room-row.head .code{background:none;border:0;color:var(--muted);font-size:10px;padding:0;text-align:left;box-shadow:none}
.room-row .code{background:var(--accent2);color:var(--line);border:3px solid var(--line);border-radius:8px;padding:3px 4px;text-align:center;font-size:13px;letter-spacing:1px}
.room-row .bar{background:var(--line);border-radius:4px;color:var(--ok);height:8px;border:1px solid var(--line)}
.room-row .btn-mini{background:var(--accent);padding:5px 10px;box-shadow:0 0 0 2px var(--accent),3px 3px 0 var(--line)}
.room-row.full{opacity:.5}
.lobby-side{display:none}
/* ── RANKING ── */
.toggles{flex-direction:column;gap:8px;align-items:stretch}
#rk-period button{flex:1;text-align:center}
#rk-metric{border:0;padding:0;gap:6px;justify-content:center}
#rk-metric button{border:3px solid var(--line);border-radius:999px;padding:5px 14px;font-size:11px;margin:0}
#rk-metric button.on{background:var(--accent2)}
.rank-table{background:transparent;border:0;box-shadow:none;padding:0;max-height:none;overflow:visible}
#rk-table td{padding:7px 8px}
#rk-table tr.me td{background:var(--accent);color:var(--line)}
#rk-table tr.top1 .c-rank,#rk-table tr.top2 .c-rank,#rk-table tr.top3 .c-rank{font-size:0;text-align:center}
#rk-table tr.top1 .c-rank::before{content:"🥇";font-size:20px}#rk-table tr.top2 .c-rank::before{content:"🥈";font-size:20px}#rk-table tr.top3 .c-rank::before{content:"🥉";font-size:20px}
.c-delta.up{color:var(--ok)}.c-delta.down{color:var(--danger)}
.rank-me{position:sticky;bottom:82px;z-index:2;background:var(--accent);color:var(--line);border-radius:999px;padding:8px 20px;justify-content:center;box-shadow:0 0 0 2px var(--accent),4px 4px 0 var(--line);margin-bottom:8px}
.rank-me b{font-size:24px}
/* ── PERFIL ── */
.profile-head{background:transparent;border:0;box-shadow:none;padding:0;flex-wrap:wrap}
.profile-head canvas{width:80px;height:80px}
.pf-nick{font-size:24px;color:#fff;text-shadow:2px 2px 0 var(--accent),4px 4px 0 var(--line)}
.pf-kind{font-style:normal;font-size:11px;color:var(--muted);text-transform:uppercase}
.pf-kind[data-kind="registered"]{color:var(--ok)}
.pf-meta .coinbar{width:max-content}
.stat-cards{grid-template-columns:repeat(3,1fr);gap:12px 10px;padding:0 4px 4px 0}
.stat{padding:10px 6px;border-radius:18px;border:4px solid var(--line);background:var(--accent2);color:var(--line);box-shadow:0 0 0 2px var(--accent2),4px 4px 0 var(--line)}
.stat:nth-child(2){background:var(--accent);box-shadow:0 0 0 2px var(--accent),4px 4px 0 var(--line);transform:rotate(1.5deg)}.stat:nth-child(3){background:var(--ok);box-shadow:0 0 0 2px var(--ok),4px 4px 0 var(--line)}
.stat:nth-child(4){background:#8b5cff;box-shadow:0 0 0 2px #8b5cff,4px 4px 0 var(--line);transform:rotate(-1.5deg)}
.stat:nth-child(5){background:#ffb830;box-shadow:0 0 0 2px #ffb830,4px 4px 0 var(--line)}.stat:nth-child(6){background:#8f86c9;box-shadow:0 0 0 2px #8f86c9,4px 4px 0 var(--line);transform:rotate(1deg)}
.stat b{font-size:22px;color:var(--line)}.stat i{font-style:normal;font-size:9.5px;font-weight:700;text-transform:uppercase;line-height:1.1}
.pf-hist{overflow-x:auto;padding:10px 12px;box-shadow:0 0 0 2px #2d2266,var(--shadow)}
#pf-table th{font-size:10px;padding:5px 6px}
#pf-table td{font-size:11.5px;padding:5px 6px;white-space:nowrap}
#pf-table th:nth-child(2),#pf-table td:nth-child(2),#pf-table th:nth-child(6),#pf-table td:nth-child(6){display:none}
.pf-hist td.cause{color:var(--muted)}.pf-hist td.cause.blackhole{color:#8b5cff}.pf-hist td.cause i{font-style:normal;color:#fff}
.pf-ach{box-shadow:0 0 0 2px #2d2266,var(--shadow)}
.ach-grid{grid-template-columns:1fr}
.ach{padding:8px 10px;border:3px solid var(--line);border-radius:14px;background:#140f33;opacity:.6}
.ach.done{opacity:1;background:#1f3a1a;border-color:var(--ok);box-shadow:0 0 8px rgba(182,255,60,.35)}
.ach.secret{opacity:.4}
.ach b{font-size:13px;color:#fff}.ach i{font-size:11px;color:var(--muted)}
.ach-bar{background:var(--line);color:var(--accent2);border-radius:4px;height:6px;margin-top:4px}
.ach.done .ach-bar{color:var(--ok)}
.ach-coins{font-style:normal;font-size:12px;color:#ffb830}
/* ── LOJA ── */
.shop-eq{background:#140f33;padding:10px 14px;box-shadow:0 0 0 2px var(--accent2),var(--shadow)}
.shop-eq .badge{position:static;margin-left:auto}
.shop-eq .skinmeta b{font-size:16px}
.filters button{padding:6px 12px;border-radius:999px;border:3px solid var(--line);background:#140f33;font-size:11px;color:var(--muted);font-weight:700}
.filters button.on{background:var(--rc,var(--accent));color:var(--line);box-shadow:0 0 0 2px var(--rc,var(--accent))}
.shop-grid{grid-template-columns:repeat(3,1fr);max-height:none;overflow:visible;gap:14px;padding:6px 6px 10px 2px}
.skin-card{background:#231a55;border:4px solid var(--line);border-radius:18px;color:var(--text);box-shadow:0 0 0 2px var(--rc),4px 4px 0 var(--line);padding:12px 6px 10px;transition:transform .1s}
.skin-card:nth-child(3n+1){transform:rotate(-1.5deg)}.skin-card:nth-child(3n){transform:rotate(1.5deg)}
.skin-card:hover{transform:translateY(-3px) rotate(0);background:#2d2266}
.skin-card.eq{background:var(--accent);color:var(--line);box-shadow:0 0 0 2px #fff,4px 4px 0 var(--line)}
.skin-card.eq i,.skin-card.eq em{color:var(--line)}
.skin-card.locked,.skin-card.secret{opacity:.55;filter:grayscale(.4)}.skin-card.poor em{color:var(--danger)}
.skin-card b{font-size:12.5px}.skin-card i{font-style:normal;font-size:9.5px;color:var(--rc);text-transform:uppercase}
.skin-card em{font-style:normal;font-size:12px;color:#ffb830;font-weight:700}
.badge{background:var(--accent2);color:var(--line);font-size:9px;font-weight:700;padding:3px 7px;border-radius:8px;border:2px solid var(--line)}
.shop-note{font-size:11px;padding-bottom:4px}
/* ── PREFS ── */
.pg{padding:10px 14px;background:#140f33;box-shadow:0 0 0 2px #2d2266,var(--shadow)}
.pg h2{font-size:13px;color:var(--accent2);text-shadow:2px 2px 0 var(--line);text-transform:uppercase;letter-spacing:1px}
.pref-row{border-bottom:2px solid rgba(10,8,24,.6);font-size:13px;padding:8px 0}
.pref-row:last-child{border-bottom:0}
.toggle{width:58px;height:32px;border-radius:16px;background:#2d2266;border:3px solid var(--line);color:#fff}
.toggle i{top:2px;left:2px;width:22px;height:22px;background:#fff;border:2px solid var(--line)}
.toggle[aria-checked="true"]{background:var(--ok);box-shadow:0 0 8px rgba(182,255,60,.5)}
.toggle[aria-checked="true"] i{left:24px}
input[type=range]{accent-color:var(--accent2)}
.prefs-foot{position:sticky;bottom:74px;z-index:2;background:var(--surface);margin:0 -16px;padding:10px 16px 12px;border-top:4px solid var(--line);box-shadow:0 -2px 0 var(--accent2)}
.prefs-foot button{padding:10px 20px;font-size:14px}
/* ── MORTE ── */
#s-dead{background:rgba(255,63,164,.14)}
#s-dead .dead-card{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:min(520px,100%);max-height:90%;overflow:auto;border-radius:24px 24px 0 0;border:5px solid var(--line);border-bottom:0;
  background:#180f38;padding:10px 20px 22px;gap:10px;box-shadow:0 0 0 2px var(--accent),0 -10px 50px rgba(255,63,164,.4)}
#s-dead .dead-card::before{content:"";display:block;width:60px;height:8px;border-radius:99px;background:var(--accent);flex:none;box-shadow:2px 2px 0 var(--line)}
.dead-icon{font-size:60px;line-height:1}
.dead-title{font-size:46px;color:var(--accent);text-shadow:3px 3px 0 var(--accent2),6px 6px 0 var(--line),0 0 24px rgba(255,63,164,.7);transform:rotate(-4deg);letter-spacing:1px;line-height:1}
.dead-sub{font-size:12px;color:var(--muted)}
.dead-by{background:var(--line);border-radius:999px;padding:6px 20px;box-shadow:0 0 0 2px var(--danger)}
.dead-by span{font-size:10px;color:var(--muted);letter-spacing:2px}.dead-by b{font-size:22px;color:var(--danger)}
.dead-stats{gap:12px;flex-wrap:wrap;justify-content:center;padding:4px 6px}
.dead-stats div{background:var(--accent2);border:4px solid var(--line);border-radius:16px;padding:8px 10px;min-width:96px;color:var(--line);box-shadow:0 0 0 2px var(--accent2),4px 4px 0 var(--line);transform:rotate(-2deg)}
.dead-stats div:nth-child(2){background:var(--accent);box-shadow:0 0 0 2px var(--accent),4px 4px 0 var(--line);transform:rotate(2deg)}.dead-stats div:nth-child(3){background:var(--ok);box-shadow:0 0 0 2px var(--ok),4px 4px 0 var(--line);transform:rotate(-1deg)}
.dead-stats div:nth-child(4){background:#8b5cff;box-shadow:0 0 0 2px #8b5cff,4px 4px 0 var(--line);transform:rotate(2deg)}
.dead-stats b{font-size:22px}.dead-stats i{font-style:normal;font-size:9.5px;text-transform:uppercase}
.dead-rank span{font-size:10px;color:var(--muted);letter-spacing:2px}.dead-rank b{font-size:18px;color:#fff}.dead-rank .arrow{color:var(--ok)}
.dead-actions{flex-direction:row}
.dead-actions .btn-primary{font-size:18px;padding:12px}
/* ── RECONN ── */
.modal.reconn{bottom:auto;top:45%;transform:translate(-50%,-50%);width:min(340px,92%);max-height:none;overflow:visible;border-radius:28px;border-bottom:5px solid var(--line);background:#231a55;color:var(--text);padding:22px 22px 24px;box-shadow:0 0 0 2px var(--accent2),var(--shadow),0 0 30px rgba(46,230,255,.3)}
.modal.reconn::before{display:none}
.modal.reconn::after{content:"";position:absolute;left:44px;bottom:-19px;width:26px;height:26px;background:#231a55;border-right:5px solid var(--line);border-bottom:5px solid var(--line);transform:rotate(45deg)}
.spinner{width:52px;height:52px;border:5px solid #3d2e80;border-top-color:var(--accent2)}
.rc-title{font-size:24px;color:var(--accent2);text-shadow:2px 2px 0 var(--accent),4px 4px 0 var(--line)}
.rc-title::before{content:"📡 "}
.rc-sub{font-size:13px;color:var(--muted)}
.reconn .btn-secondary{width:auto;padding:10px 22px}
/* ── MOBILE ── */
body[data-mode="portrait"] .screen,body[data-mode="landscape"] .screen{padding:0}
body[data-mode="portrait"] .screen .wrap,body[data-mode="portrait"] .modal,body[data-mode="portrait"] #s-dead .dead-card{width:100%;max-height:86%}
body[data-mode="portrait"] .modal.reconn{width:92%}
body[data-mode="portrait"] .brand{font-size:40px}
body[data-mode="portrait"] .tagline{font-size:11px}
body[data-mode="portrait"] .entry-main .btn-primary{font-size:26px;padding:16px}
body[data-mode="portrait"] .entry-main .hint{display:none}
body[data-mode="portrait"] .entry-links{gap:6px}
body[data-mode="portrait"] .skinrow{min-width:0}
body[data-mode="portrait"] .sh .stitle{font-size:20px}
body[data-mode="portrait"] .room-row .btn-mini{padding:5px 8px}
body[data-mode="portrait"] .me-chip{padding:3px 10px 3px 4px;gap:6px}
body[data-mode="portrait"] .me-chip canvas{width:34px;height:34px}
body[data-mode="portrait"] .me-chip b{font-size:13px}
body[data-mode="portrait"] .code-row .btn-secondary:first-of-type{padding:8px 10px;font-size:13px}
body[data-mode="portrait"] .code-row .btn-secondary:last-of-type{font-size:13px;padding:12px 10px}
body[data-mode="portrait"] .lobby-hero .btn-primary{font-size:14px}
body[data-mode="portrait"] .stat-cards{gap:10px 8px}
body[data-mode="portrait"] .stat b{font-size:18px}
body[data-mode="portrait"] .shop-grid{gap:10px}
body[data-mode="portrait"] .dead-title{font-size:38px}
body[data-mode="portrait"] .dead-stats div{min-width:120px}
/* retrato: tira do pódio ocupa o topo inteiro; sala/ping em coluna à esquerda logo abaixo; radar desce (drawHud) */
body[data-mode="portrait"] #hud-top{left:10px;right:auto;top:46px;transform:none;flex-direction:column;align-items:flex-start;gap:6px}
body[data-mode="portrait"] #hud-top .chip{padding:3px 9px;font-size:11px}
body[data-mode="portrait"] #hud-lb{top:8px;left:8px;right:8px;transform:none;width:auto}
body[data-mode="portrait"] #lb-rows{gap:5px}
body[data-mode="portrait"] .lb-row{flex:1 1 0;min-width:0;max-width:120px;font-size:10px;padding:2px 7px 2px 3px;gap:4px}
body[data-mode="portrait"] .lb-row:nth-child(1){font-size:11px;min-width:0}
body[data-mode="portrait"] .lb-pos{width:18px;min-width:18px;height:18px;font-size:9px}
body[data-mode="portrait"] #hud-lb .lb-row.mine,body[data-mode="landscape"] #hud-lb .lb-row.mine{display:flex}
body[data-mode="portrait"] #hud-score{padding:4px 12px 6px;bottom:106px;left:calc(50% + 14px);gap:0 10px}
body[data-mode="portrait"] .score-big{font-size:22px}
body[data-mode="portrait"] .score-sub{font-size:9px;letter-spacing:2px;margin-bottom:2px}
body[data-mode="portrait"] .score-row:nth-child(n+4){display:none}
body[data-mode="portrait"] #hud-status{left:10px;bottom:14px;transform:none;flex-direction:column-reverse;align-items:flex-start;gap:6px}
body[data-mode="portrait"] #hud-pw{flex-direction:column;align-items:flex-start}
body[data-mode="portrait"] .pw{font-size:10px;padding:3px 8px}
body[data-mode="portrait"] #hud-ammo{font-size:12px;padding:4px 10px}
body[data-mode="portrait"] #touch{bottom:14px;right:12px;gap:8px}
body[data-mode="portrait"] .tbtn{width:66px;height:66px}
body[data-mode="landscape"] #s-entry .entry-wrap{flex-direction:row;justify-content:center;align-items:center;gap:30px;padding:0 20px}
body[data-mode="landscape"] .brand-block{padding-top:0}
body[data-mode="landscape"] .brand{font-size:40px}
body[data-mode="landscape"] .entry-main{padding:0;width:400px;gap:8px}
body[data-mode="landscape"] .entry-main .btn-primary{font-size:22px;padding:12px}
body[data-mode="landscape"] .entry-main .hint,body[data-mode="landscape"] .entry-main .field label{display:none}
body[data-mode="landscape"] .entry-links .btn-secondary::before{width:48px;height:48px;font-size:20px}
body[data-mode="landscape"] .skinrow canvas{width:44px;height:44px}
body[data-mode="landscape"] .screen .wrap,body[data-mode="landscape"] .modal{max-height:92%}
/* paisagem: sala/ping em coluna à esquerda, tira menor no centro, placar embaixo no centro */
body[data-mode="landscape"] #hud-top{left:10px;top:10px;transform:none;flex-direction:column;align-items:flex-start;gap:5px}
body[data-mode="landscape"] #hud-top .chip{padding:3px 9px;font-size:11px}
body[data-mode="landscape"] #hud-lb{top:10px}
body[data-mode="landscape"] #lb-rows{gap:6px}
body[data-mode="landscape"] .lb-row{font-size:11px;min-width:120px;max-width:170px;padding:3px 9px 3px 4px;gap:6px}
body[data-mode="landscape"] .lb-row:nth-child(1){font-size:12px;min-width:135px}
body[data-mode="landscape"] .lb-pos{width:20px;min-width:20px;height:20px;font-size:10px}
body[data-mode="landscape"] #hud-score{padding:4px 12px 6px;bottom:12px;gap:0 10px}
body[data-mode="landscape"] .score-big{font-size:22px}
body[data-mode="landscape"] .score-sub{font-size:9px;letter-spacing:2px;margin-bottom:2px}
body[data-mode="landscape"] .score-row:nth-child(n+4){display:none}
body[data-mode="landscape"] #hud-status{left:10px;bottom:12px;transform:none;flex-direction:column-reverse;align-items:flex-start;gap:5px}
body[data-mode="landscape"] #hud-pw{flex-direction:column;align-items:flex-start}
body[data-mode="landscape"] .pw{font-size:10px;padding:3px 8px}
body[data-mode="landscape"] #touch{gap:8px;bottom:12px;right:12px}
body[data-mode="landscape"] .tbtn{width:60px;height:60px}
`};
})();

// ── VARIAÇÃO 4b — CARTOON DOCE ────────────────────────────────────────────────
// Mesmo DNA do Cartoon Cósmico (tinta grossa, cores chapadas, sombras sólidas,
// folhas que sobem por cima do mundo, JOGAR gigante, ícones redondos, pódio de
// balões, radar redondo, três botões de toque) — mas de DIA: céu de bala em
// lavanda→menta com nuvens pastel, painéis brancos com tinta ameixa, rosa-chiclete
// como cor principal, limão e menta de apoio. Planetas viram balas brilhosas
// (crescente = tom mais escuro da própria cor + brilho branco grande), comida é
// bala com pontinho de brilho, estrelas são faíscas amarelas.
// Desempenho: tudo que tem contorno/volume é sprite assado por (skin, tier);
// efeitos são arcs/lines + um texto; fundo em cache por resolução.
(function(){
const u=MOCK.u,WW=u.WW,WH=u.WH,sh=u.sh,rgba=u.rgba;
const INK="#2b1b3d",WHT="#ffffff",PINK="#ff6fa8",LEM="#ffd23d",MINT="#3ad2a5",SKY="#5ec8ff",LIL="#b48cff",DAN="#ff5470",PEACH="#ffb08a",PLUM="#3a1f5e";
const FONT="'Trebuchet MS',Verdana,sans-serif",T=900;
let L=[],BIG=null,PROPS=[],bg=null,bgW=0,bgH=0;

// ── sprites (prefixo "cnd" — cache global por página) ─────────────────────────
const PK=sk=>sk.ring?2.05:1.3;
function planetSpr(sk,isMe,size){return u.sprite("cndp"+sk.id+(isMe?"m":"")+size,size,(c,R)=>{
  const K=PK(sk),r=R/K,col=sk.color,lw=Math.max(2.5,r*.1);c.lineJoin="round";c.lineCap="round";
  const band=(a0,a1)=>{c.beginPath();c.ellipse(0,0,r*1.85,r*.56,0,a0,a1,false);c.ellipse(0,0,r*1.3,r*.39,0,a1,a0,true);c.closePath();c.fill();c.stroke();};
  if(sk.ring){c.fillStyle=sh(col,.45);c.strokeStyle=INK;c.lineWidth=lw*.7;band(Math.PI,Math.PI*2);}
  c.fillStyle=col;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
  c.save();c.beginPath();c.arc(0,0,r,0,6.283);c.clip();
  c.fillStyle=sh(col,-.22);c.beginPath();c.arc(r*.38,r*.4,r*1.05,0,6.283);c.fill();               // crescente = tom mais escuro da própria cor
  const hl=c.createRadialGradient(-r*.35,-r*.4,0,-r*.35,-r*.4,r*.9);hl.addColorStop(0,"rgba(255,255,255,.7)");hl.addColorStop(.55,"rgba(255,255,255,.22)");hl.addColorStop(1,"rgba(255,255,255,0)");
  c.fillStyle=hl;c.fillRect(-r,-r,r*2,r*2);                                                         // brilho grande e macio (bala)
  c.fillStyle="rgba(255,255,255,.85)";c.beginPath();c.ellipse(-r*.38,-r*.42,r*.3,r*.16,-.75,0,6.283);c.fill();
  c.fillStyle="rgba(255,255,255,.75)";c.beginPath();c.arc(-r*.04,-r*.63,r*.08,0,6.283);c.fill();
  c.globalAlpha=.16;c.font=`${r*1.3}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(sk.emoji,r*.05,r*.15);c.globalAlpha=1;
  c.restore();
  if(sk.ring){c.fillStyle=sh(col,.45);c.strokeStyle=INK;c.lineWidth=lw*.7;band(0,Math.PI);}
  c.strokeStyle=isMe?WHT:INK;c.lineWidth=lw;c.beginPath();c.arc(0,0,r,0,6.283);c.stroke();
  if(isMe){c.strokeStyle=INK;c.lineWidth=lw*.55;c.beginPath();c.arc(0,0,r+lw*.78,0,6.283);c.stroke();}});}

const FK=2.1,FICON={missile_ammo:"🚀",powerup_speed:"⚡",powerup_magnet:"🧲",powerup_shield:"🛡️"};
function foodSpr(f){return u.sprite("cndf"+f.type+f.color,64,(c,R)=>{const r=R/FK;c.lineJoin="round";c.strokeStyle=INK;c.lineWidth=Math.max(2,r*.24);c.fillStyle=f.color;
  const gl=(x,y,k)=>{c.fillStyle="rgba(255,255,255,.8)";c.beginPath();c.arc(x,y,r*k,0,6.283);c.fill();};
  if(FICON[f.type]){c.fillStyle=WHT;c.beginPath();c.arc(0,0,r*1.5,0,6.283);c.fill();c.stroke();c.font=`${r*1.5}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(FICON[f.type],0,r*.1);return;}
  if(f.type==="star"){c.fillStyle=LEM;u.spikes(c,r*1.7,4,.38,-1.5708);c.fill();c.stroke();gl(-r*.12,-r*.45,.16);return;}   // faísca amarela
  if(f.type==="comet"){c.beginPath();c.moveTo(-r*2,0);c.lineTo(-r*.15,-r*.8);c.arc(0,0,r*.85,-1.4,1.4);c.lineTo(-r*.15,r*.8);c.closePath();c.fill();c.stroke();gl(-r*.2,-r*.3,.25);return;}
  if(f.type==="rock"){c.rotate(.45);u.rr(c,-r,-r,r*2,r*2,r*.3);c.fill();c.stroke();gl(-r*.4,-r*.4,.24);return;}
  c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.stroke();gl(-r*.3,-r*.32,.28);});}                 // bala redonda com pontinho de brilho

const EK=1.5;
const ejSpr=col=>u.sprite("cnde"+col,40,(c,R)=>{const r=R/EK;c.fillStyle=col;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(2,r*.22);c.stroke();
  c.fillStyle="rgba(255,255,255,.8)";c.beginPath();c.arc(-r*.3,-r*.32,r*.26,0,6.283);c.fill();});

// faíscas brancas do fundo (2 variantes) e planetas pastel de cenário
const starSpr=v=>u.sprite("cndstar"+v,32,(c,R)=>{c.lineJoin="round";u.spikes(c,R*.9,4,v?.3:.22,-1.5708);c.fillStyle=v?"#ffe6f1":WHT;c.fill();c.strokeStyle=v?PINK:LIL;c.lineWidth=1.5;c.stroke();});
function propSpr(p,i){return u.sprite("cndprop"+i,256,(c,R)=>{const K=p.ring?2:1.2,r=R/K;c.lineJoin="round";
  if(p.ring){c.fillStyle=sh(p.col,.35);c.strokeStyle=INK;c.lineWidth=r*.06;c.beginPath();c.ellipse(0,0,r*1.8,r*.5,-.35,0,6.283);c.ellipse(0,0,r*1.35,r*.36,-.35,6.283,0,true);c.fill("evenodd");c.stroke();}
  c.fillStyle=p.col;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
  c.save();c.clip();c.fillStyle="rgba(43,27,61,.14)";c.beginPath();c.arc(r*.35,r*.4,r*1.05,0,6.283);c.fill();
  c.fillStyle="rgba(255,255,255,.6)";c.beginPath();c.ellipse(-r*.3,-r*.3,r*.45,r*.25,-.7,0,6.283);c.fill();
  c.fillStyle="rgba(43,27,61,.1)";[-.45,.1,.5].forEach(y=>{c.beginPath();c.ellipse(0,r*y,r*1.05,r*.1,0,0,6.283);c.fill();});c.restore();
  c.strokeStyle=INK;c.lineWidth=r*.08;c.beginPath();c.arc(0,0,r,0,6.283);c.stroke();});}

// asteroide: pedra lilás-acinzentada, crateras de menta, contorno de tinta (3 variantes × tier)
const AK=1.3;
function astSpr(variant,size){return u.sprite("cnda"+variant+size,size,(c,R)=>{const r=R/AK,seed=11+variant*7,n=9+variant*2;c.lineJoin="round";
  c.fillStyle="#cbc2e3";u.astPoly(c,r,seed,n);c.fill();
  c.save();c.clip();c.fillStyle="rgba(43,27,61,.16)";c.beginPath();c.arc(r*.35,r*.4,r*1.05,0,6.283);c.fill();
  c.fillStyle="rgba(255,255,255,.5)";c.beginPath();c.ellipse(-r*.35,-r*.4,r*.35,r*.2,-.7,0,6.283);c.fill();c.restore();
  const cr=u.mulberry(seed*3);for(let i=0;i<3;i++){const a=cr()*6.28,d=cr()*r*.5,c2=r*(.12+cr()*.14);
    c.fillStyle="#8fe6cc";c.beginPath();c.arc(Math.cos(a)*d,Math.sin(a)*d,c2,0,6.283);c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(1.5,r*.045);c.stroke();}
  u.astPoly(c,r,seed,n);c.strokeStyle=INK;c.lineWidth=Math.max(3,r*.1);c.stroke();});}

// buraco negro: disco ameixa com espiral rosa + linhas de sucção (1 sprite, girado por h.spin)
const BK=2.4;
const bhSpr=()=>u.sprite("cndbh",256,(c,R)=>{const r=R/BK;c.lineJoin="round";c.lineCap="round";
  c.strokeStyle=PINK;c.lineWidth=r*.12;for(let i=0;i<10;i++){const a=i/10*6.283+.3;c.beginPath();c.moveTo(Math.cos(a)*r*1.55,Math.sin(a)*r*1.55);c.lineTo(Math.cos(a+.25)*r*2.2,Math.sin(a+.25)*r*2.2);c.stroke();}
  c.fillStyle=PLUM;c.beginPath();c.arc(0,0,r*1.3,0,6.283);c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(3,r*.12);c.stroke();
  c.strokeStyle=PINK;c.lineWidth=r*.16;c.beginPath();for(let i=0;i<=90;i++){const k=i/90,a=k*6.283*2.2,rr=r*.15+k*r*1.05;i?c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.stroke();
  c.strokeStyle=INK;c.lineWidth=r*.04;c.beginPath();for(let i=0;i<=90;i++){const k=i/90,a=k*6.283*2.2,rr=r*.15+k*r*1.05+r*.1;i?c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.stroke();
  c.fillStyle=INK;c.beginPath();c.arc(0,0,r*.5,0,6.283);c.fill();c.strokeStyle=PINK;c.lineWidth=r*.08;c.stroke();});

window.THEME={
id:"toon-candy",name:"Cartoon Doce",
desc:"O Cartoon Cósmico de dia: céu de bala em lavanda e menta com nuvens pastel, painéis brancos com tinta ameixa e rosa-chiclete no comando. Planetas viram balas brilhosas, a comida é confeito e as estrelas são faíscas; mesma estrutura de folhas, JOGAR gigante, pódio de balões e radar redondo.",
tags:["fofo","claro","pastel","cartoon"],swatch:["#ff6fa8","#cfd8ff"],
tokens:{bg:"#dfe6ff",surface:"#ffffff",text:"#2b1b3d",muted:"#8a7fa8",accent:"#ff6fa8",accent2:"#ffd23d",danger:"#ff5470",ok:"#3ad2a5",
  line:"#2b1b3d",radius:"14px",radiusLg:"20px",space:"14px",fontUi:"'Trebuchet MS',Verdana,sans-serif",fontMono:"'Courier New',monospace",
  shadow:"6px 6px 0 #2b1b3d"},
layout:{hud:"bubbles",nav:"sheet"},
rarityColor:{free:"#8a7fa8",common:"#2f9fe0",rare:"#5b6cff",epic:"#9b5cff",legendary:"#e0a800",earned:"#1fa37c",secret:"#ff5470"},
labels:{title:"🪐 PLANET.IO",tagline:"Conquiste a galáxia. Divida, ejete e devore!",play:"🚀 JOGAR",playAuto:"🚀 JOGAR (AUTO)",lbTitle:"PÓDIO",
  dead:"KABOOM!",deadSub:"— você virou açúcar cósmico —",respawn:"🔄 DE NOVO!",reconnTitle:"SINAL FRACO!",reconnSub:"Procurando o satélite… tentativa {n}/5",
  back:"◄",create:"➕ Criar sala",top5:"TOP 5 HOJE"},

init(g){const rand=u.mulberry(21);
  L=[.2,.45].map((f,li)=>({f,stars:Array.from({length:li?50:80},()=>({x:rand()*T,y:rand()*T,s:li?2.5+rand()*1.5:1.5+rand(),a:+(.45+rand()*.45).toFixed(2)}))}));
  BIG={f:.7,stars:Array.from({length:22},()=>({x:rand()*T,y:rand()*T,s:14+rand()*12,v:rand()<.5?1:0}))};
  PROPS=[];const pal=["#ffb3d1","#ffe27a","#a8e2ff","#d4bdff","#b3f0dd"];
  for(let i=0;i<10;i++)PROPS.push({x:200+rand()*(WW-400),y:200+rand()*(WH-400),r:80+rand()*120,col:pal[i%5],ring:rand()<.4});},

drawBg(c,W,H,cam,t,g){
  if(!bg||bgW!==W||bgH!==H){bgW=W;bgH=H;bg=document.createElement("canvas");bg.width=W;bg.height=H;const x=bg.getContext("2d");
    const gd=x.createLinearGradient(0,0,0,H);gd.addColorStop(0,"#cfd8ff");gd.addColorStop(1,"#d9f7ee");x.fillStyle=gd;x.fillRect(0,0,W,H);
    const rand=u.mulberry(5),D=Math.max(W,H);
    // nuvens pastel: aglomerados de círculos macios (blur só aqui, no cache)
    const cols=["rgba(255,255,255,.55)","rgba(255,214,232,.5)","rgba(230,220,255,.55)","rgba(255,255,255,.45)"];
    x.shadowBlur=D*.02;
    for(let i=0;i<9;i++){const cx=rand()*W,cy=rand()*H,s=(.05+rand()*.07)*D;x.fillStyle=cols[i%4];x.shadowColor=cols[i%4];
      for(let k=0;k<6;k++){const a=k/6*6.283;x.beginPath();x.arc(cx+Math.cos(a)*s*(.6+rand()*.4),cy+Math.sin(a)*s*(.35+rand()*.2),s*(.45+rand()*.35),0,6.283);x.fill();}}
    x.shadowBlur=0;}
  c.drawImage(bg,0,0);
  if(g&&g.prefs&&!g.prefs.parallax)return;
  c.fillStyle=WHT;
  L.forEach(l=>{const ox=((-cam.x*l.f*cam.scale)%T+T)%T,oy=((-cam.y*l.f*cam.scale)%T+T)%T;
    l.stars.forEach(s=>{c.globalAlpha=s.a;const bx=(s.x+ox)%T,by=(s.y+oy)%T;for(let x=bx;x<W;x+=T)for(let y=by;y<H;y+=T)c.fillRect(x,y,s.s,s.s);});});
  c.globalAlpha=1;
  const l=BIG,ox=((-cam.x*l.f*cam.scale)%T+T)%T,oy=((-cam.y*l.f*cam.scale)%T+T)%T,sp=[starSpr(0),starSpr(1)];
  l.stars.forEach(s=>{const bx=(s.x+ox)%T,by=(s.y+oy)%T,h=s.s/2;for(let x=bx;x<W;x+=T)for(let y=by;y<H;y+=T)c.drawImage(sp[s.v],x-h,y-h,s.s,s.s);});},

drawWorld(c,cam,t,g,W,H){
  const hw=W/(2*cam.scale),hh=H/(2*cam.scale);c.globalAlpha=.55;
  PROPS.forEach((p,i)=>{const R=p.r*(p.ring?2:1.2);if(Math.abs(p.x-cam.x)>hw+R||Math.abs(p.y-cam.y)>hh+R)return;c.drawImage(propSpr(p,i),p.x-R,p.y-R,R*2,R*2);});
  c.globalAlpha=1;
  if(!g||!g.prefs||g.prefs.grid)u.grid(c,150,"rgba(43,27,61,.07)",2);
  c.strokeStyle=INK;c.lineWidth=18;c.strokeRect(0,0,WW,WH);
  c.strokeStyle=PINK;c.lineWidth=6;c.setLineDash([40,26]);c.strokeRect(0,0,WW,WH);c.setLineDash([]);},

drawFood(c,f,t){const p=f.type==="star"?1+Math.sin(t*.003+f.seed)*.14:1,r=f.r*FK*p,s=foodSpr(f);
  if(f.type==="rock"||f.type==="comet"){c.save();c.translate(f.x,f.y);c.rotate(f.seed);c.drawImage(s,-r,-r,r*2,r*2);c.restore();return;}
  const bob=FICON[f.type]?Math.sin(t*.005+f.seed)*3:0;c.drawImage(s,f.x-r,f.y-r+bob,r*2,r*2);},
drawEjected(c,e){const r=e.r*EK;c.drawImage(ejSpr(e.color),e.x-r,e.y-r,r*2,r*2);},

drawAsteroid(c,a,t){const r=a.r*AK;c.save();c.translate(a.x,a.y);c.rotate(a.rot);c.drawImage(astSpr(a.variant,u.tier(a.r)),-r,-r,r*2,r*2);c.restore();},

drawBlackHole(c,h,t){const k=h.k,rc=h.rc*k,ri=h.ri*k;
  c.strokeStyle=rgba(PINK,.35+.12*Math.sin(t*.004));c.lineWidth=3;c.setLineDash([14,18]);c.beginPath();c.arc(h.x,h.y,ri,-h.spin*.4,-h.spin*.4+6.283);c.stroke();c.setLineDash([]);
  const R=rc*BK;c.save();c.translate(h.x,h.y);c.rotate(h.spin);c.globalAlpha=Math.min(1,k*1.2);c.drawImage(bhSpr(),-R,-R,R*2,R*2);c.restore();c.globalAlpha=1;},

drawTrail(c,pc,p,isMe){if(!u.trailPath(c,pc))return;
  c.strokeStyle=`rgba(255,255,255,${isMe?.8:.55})`;c.lineWidth=Math.max(2,pc.r*.22);c.lineCap="round";c.lineJoin="round";
  c.setLineDash([pc.r*.35,pc.r*.35]);c.stroke();c.setLineDash([]);},

drawMissile(c,m,t){c.lineJoin="round";
  m.trail.forEach((pt,i)=>{if(i%2)return;const a=i/m.trail.length;c.fillStyle=`rgba(255,255,255,${a*.7})`;c.beginPath();c.arc(pt.x,pt.y,m.r*.7*a,0,6.283);c.fill();});
  c.save();c.translate(m.x,m.y);c.rotate(Math.atan2(m.vy,m.vx));const r=m.r,fl=1+.25*Math.sin(t*.05);
  c.fillStyle=LEM;c.beginPath();c.moveTo(-r*1.1,0);c.lineTo(-r*2.4*fl,-r*.6);c.lineTo(-r*2*fl,0);c.lineTo(-r*2.4*fl,r*.6);c.closePath();c.fill();
  c.strokeStyle=INK;c.lineWidth=2.6;c.fillStyle=PINK;
  c.beginPath();c.moveTo(r*1.6,0);c.quadraticCurveTo(r*.6,-r*.95,-r*.9,-r*.7);c.lineTo(-r*1.3,-r*1.1);c.lineTo(-r*1.3,r*1.1);c.lineTo(-r*.9,r*.7);c.quadraticCurveTo(r*.6,r*.95,r*1.6,0);c.closePath();c.fill();c.stroke();
  c.fillStyle=SKY;c.beginPath();c.arc(r*.25,0,r*.36,0,6.283);c.fill();c.stroke();c.restore();},

drawCell(c,pc,p,isMe,t,prev,g){const r=pc.displayR||pc.r,sk=p.skin,d=r*PK(sk),pr=(g&&g.prefs)||{names:true,mass:true};
  c.drawImage(planetSpr(sk,isMe,u.tier(r)),pc.x-d,pc.y-d,d*2,d*2);
  c.save();c.translate(pc.x,pc.y);c.lineCap="round";
  if(pc.mergeTimer>0){c.strokeStyle=LEM;c.lineWidth=Math.max(3,r*.08);c.beginPath();c.arc(0,0,r*1.18,-1.5708,-1.5708+(1-pc.mergeTimer/u.mergeTime(pc.r))*6.283);c.stroke();}
  const pw=Object.keys(p._powerups||{});
  if(pw.length){const cl={speed:LEM,magnet:LIL,shield:SKY};
    pw.forEach((k,i)=>{const a0=t*.001*(i%2?-1:1);c.strokeStyle=cl[k];c.lineWidth=Math.max(3,r*.08);c.globalAlpha=.6+.4*Math.sin(t*.012+i);
      c.setLineDash([r*.4,r*.3]);c.beginPath();c.arc(0,0,r*(1.3+i*.16),a0,a0+6.283);c.stroke();c.setLineDash([]);c.globalAlpha=1;});}
  if(!prev&&r>13){const fs=Math.max(12,r*.34);
    if(pr.names!==false)u.outText(c,p.name+(p.registered?" ✓":""),0,pr.mass!==false?-fs*.28:0,fs,"#fff",INK,FONT);
    if(pr.mass!==false)u.outText(c,u.fmt(pc.r*pc.r),0,pr.names!==false?fs*.8:0,fs*.68,LEM,INK,FONT);}
  c.restore();},

drawFx(c,f,t){const k=f.age/f.ttl,a=1-k;c.lineJoin="round";c.lineCap="round";
  switch(f.t){
    case "bounce":{const s=f.r*(.7+k*.3)*(.6+(f.power||1)*.5);c.save();c.translate(f.x,f.y);c.rotate(f.nx*.6);
      u.spikes(c,s,8,.55,0);c.fillStyle=PINK;c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(2,s*.08);c.stroke();
      u.outText(c,"POW!",0,0,Math.max(10,s*.5),"#fff",INK,FONT);c.restore();break;}
    case "pop":{const s=f.r*(1+k*.8);c.save();c.translate(f.x,f.y);c.globalAlpha=Math.min(1,a*1.5);
      u.spikes(c,s,10,.5,k*.6);c.fillStyle=LEM;c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(2,s*.06);c.stroke();
      u.outText(c,"BOOM",0,0,Math.max(10,s*.42),PINK,INK,FONT);c.restore();break;}
    case "boom":{const s=f.r*(.8+k*1.2);c.save();c.translate(f.x,f.y);c.globalAlpha=Math.min(1,a*1.5);
      u.spikes(c,s,12,.55,-k*.5);c.fillStyle=PINK;c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(2.5,s*.06);c.stroke();
      u.spikes(c,s*.55,12,.55,-k*.5);c.fillStyle=LEM;c.fill();u.outText(c,"KABOOM!",0,0,Math.max(11,s*.34),"#fff",INK,FONT);c.restore();break;}
    case "eat":c.strokeStyle=rgba(PINK,a);c.lineWidth=3;c.beginPath();c.arc(f.x,f.y,f.r*(1.2+k*1.2),0,6.283);c.stroke();
      if(f.r>8)u.outText(c,"nom",f.x,f.y-f.r*(1+k*2),Math.max(9,f.r*.9),"#fff",INK,FONT);break;
    case "suck":c.strokeStyle=rgba(LIL,a);c.lineWidth=4;c.beginPath();c.arc(f.x,f.y,f.r*(3-k*2.6),0,6.283);c.stroke();break;
    case "exit":case "split":case "merge":c.strokeStyle=rgba(SKY,a);c.lineWidth=3;c.beginPath();c.arc(f.x,f.y,f.r*(.6+k*1.5),0,6.283);c.stroke();break;
    case "chip":c.strokeStyle=rgba(LEM,a);c.lineWidth=3;for(let i=-1;i<=1;i++){const an=Math.atan2(f.ny,f.nx)+i*.5;c.beginPath();c.moveTo(f.x,f.y);c.lineTo(f.x+Math.cos(an)*f.r*3*k,f.y+Math.sin(an)*f.r*3*k);c.stroke();}break;
    case "shoot":c.strokeStyle=rgba(PINK,a);c.lineWidth=3;for(let i=0;i<8;i++){const an=i/8*6.283;c.beginPath();c.moveTo(f.x+Math.cos(an)*f.r*(1+k),f.y+Math.sin(an)*f.r*(1+k));c.lineTo(f.x+Math.cos(an)*f.r*(1.6+k*1.4),f.y+Math.sin(an)*f.r*(1.6+k*1.4));c.stroke();}break;
    case "rock":c.strokeStyle=rgba(INK,a*.35);c.lineWidth=2;c.beginPath();c.arc(f.x,f.y,f.r*.4*(1+k),0,6.283);c.stroke();break;}},

// radar redondo no canto superior direito (o resto do HUD é DOM)
drawHud(c,W,H,g,t,mode){
  if(g.prefs&&!g.prefs.minimap)return;
  const D=mode==="portrait"?92:mode==="landscape"?84:150,MP=12,R=D/2,cx=W-MP-R,cy=MP+R;c.lineJoin="round";
  c.fillStyle=INK;c.beginPath();c.arc(cx+4,cy+4,R,0,6.283);c.fill();
  c.fillStyle=WHT;c.beginPath();c.arc(cx,cy,R,0,6.283);c.fill();c.strokeStyle=INK;c.lineWidth=4;c.stroke();
  c.strokeStyle="rgba(43,27,61,.15)";c.lineWidth=1.5;[.33,.66].forEach(k=>{c.beginPath();c.arc(cx,cy,R*k,0,6.283);c.stroke();});
  c.beginPath();c.moveTo(cx-R,cy);c.lineTo(cx+R,cy);c.moveTo(cx,cy-R);c.lineTo(cx,cy+R);c.stroke();
  const a=t*.0025;c.fillStyle="rgba(255,111,168,.22)";c.beginPath();c.moveTo(cx,cy);c.arc(cx,cy,R-2,a-.7,a);c.closePath();c.fill();
  c.strokeStyle=PINK;c.lineWidth=2;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.cos(a)*(R-2),cy+Math.sin(a)*(R-2));c.stroke();
  const S=D*.72,mx=cx-S/2,my=cy-S/2;
  c.save();c.beginPath();c.arc(cx,cy,R-2,0,6.283);c.clip();
  u.minimap(c,mx,my,S,g,{me:PINK,player:"#7a4fd0",bot:"#2f9fe0",ast:"rgba(140,125,170,.85)",hole:"rgba(58,31,94,.8)",view:"rgba(43,27,61,.35)"});
  const me=g.players[g.me];
  if(me&&!me.dead&&me.pieces.length){const sc=S/WW,n=me.pieces.length,x=mx+me.pieces.reduce((s,q)=>s+q.x,0)/n*sc,y=my+me.pieces.reduce((s,q)=>s+q.y,0)/n*sc;
    c.fillStyle=PINK;c.strokeStyle=INK;c.lineWidth=1.5;c.beginPath();c.arc(x,y,mode==="desktop"?4:3,0,6.283);c.fill();c.stroke();}
  c.restore();
  if(mode==="desktop"){c.font="bold 9px "+FONT;c.fillStyle="#d6336f";c.textAlign="center";c.textBaseline="middle";c.fillText("RADAR",cx,cy+R-10);}},

paintSkin(c,sk,r){const rr=sk.ring?r*.68:r,d=rr*PK(sk);c.drawImage(planetSpr(sk,false,u.tier(rr)),-d,-d+2,d*2,d*2);},

css:`
/* ── BASE ── */
body{font-family:var(--font-ui);font-weight:700}
.card,.panel{background:var(--surface);border:4px solid var(--line);border-radius:var(--radius-lg);padding:14px 16px;color:var(--text);box-shadow:var(--shadow)}
.panel{padding:10px 12px;border-radius:var(--radius)}
.ph{font-size:12px;letter-spacing:1px;color:var(--accent);text-shadow:2px 2px 0 var(--line);text-transform:uppercase}
.hint{font-size:12px;color:var(--muted);font-weight:600}
.dim{color:var(--muted);opacity:1}
.reg{color:#157a5c}.bot{color:var(--muted)}
.code,.mono{font-family:var(--font-mono);font-weight:700}
.coinbar{background:var(--accent2);border:3px solid var(--line);border-radius:999px;padding:4px 14px;font-size:15px;color:var(--line);box-shadow:3px 3px 0 var(--line)}
.coinbar span{font-size:11px;color:#7a6520;font-weight:600}
.btn-primary{background:var(--accent);border:4px solid var(--line);border-radius:var(--radius-lg);padding:14px;font-size:20px;font-weight:700;color:#fff;text-shadow:2px 2px 0 var(--line);box-shadow:var(--shadow);letter-spacing:1px;text-transform:uppercase;transition:transform .05s,box-shadow .05s}
.btn-primary:hover{background:#ff8ab9}
.btn-secondary{background:#5ec8ff;border:4px solid var(--line);border-radius:var(--radius);padding:11px;font-size:14px;font-weight:700;color:var(--line);box-shadow:4px 4px 0 var(--line);transition:transform .05s,box-shadow .05s}
.btn-secondary:hover{background:#86d7ff}
.btn-mini{background:var(--accent2);border:3px solid var(--line);border-radius:10px;padding:6px 12px;font-size:12px;color:var(--line);font-weight:700;box-shadow:3px 3px 0 var(--line);white-space:nowrap;transition:transform .05s,box-shadow .05s}
.btn-mini:hover{background:#ffde6b}
.btn-primary:active,.btn-secondary:active{transform:translate(4px,4px);box-shadow:none}
.btn-mini:active{transform:translate(3px,3px);box-shadow:none}
.btn-link{color:#d6336f;text-decoration:underline;font-size:12px}
.field label{font-size:12px;color:var(--muted)}
.field input,.code-row input{background:#f3f0ff;border:4px solid var(--line);border-radius:var(--radius);padding:10px 12px;font-size:17px;color:var(--text);outline:none;font-weight:700;font-family:inherit}
.field input::placeholder,.code-row input::placeholder{color:#a79dc0}
.field input:focus,.code-row input:focus{border-color:var(--accent)}
select{background:#f3f0ff;border:3px solid var(--line);border-radius:10px;padding:6px 10px;color:var(--text);font-weight:700;font-family:inherit}
.seg{gap:4px;padding:0 6px;border-bottom:4px solid var(--line)}
.seg button{padding:8px 14px;font-size:12.5px;color:#6b5d8a;background:#efe9ff;border:4px solid var(--line);border-bottom:0;border-radius:14px 14px 0 0;margin-bottom:-4px}
.seg button.on{background:var(--accent2);color:var(--line)}
.sh{position:sticky;top:0;z-index:3;background:var(--surface);padding:6px 0 10px;border-bottom:4px solid var(--line);gap:12px}
.sh .stitle{font-size:24px;color:var(--accent);text-shadow:3px 3px 0 var(--line);letter-spacing:1px}
.btn-mini.back{width:38px;height:38px;border-radius:50%;padding:0;display:flex;align-items:center;justify-content:center;font-size:14px;background:#5ec8ff}
.nav{order:99;position:sticky;bottom:0;z-index:3;background:#efe9ff;margin:4px -16px 0;padding:4px 8px 0;height:74px;gap:2px;justify-content:space-around;flex-wrap:nowrap;border-top:4px solid var(--line);box-shadow:0 8px 0 #efe9ff}
.nav-btn{flex:1;flex-direction:column;gap:3px;padding:2px;border-radius:12px;color:#6b5d8a;font-size:10px;font-weight:700}
.nav-ico{display:flex;width:40px;height:40px;border-radius:50%;background:#fff;border:3px solid var(--line);align-items:center;justify-content:center;font-size:19px;font-style:normal}
.nav-btn[data-nav="entry"] .nav-ico::before{content:"🏠"}.nav-btn[data-nav="lobby"] .nav-ico::before{content:"🛰️"}.nav-btn[data-nav="rank"] .nav-ico::before{content:"🏆"}
.nav-btn[data-nav="profile"] .nav-ico::before{content:"👤"}.nav-btn[data-nav="shop"] .nav-ico::before{content:"🛍️"}.nav-btn[data-nav="prefs"] .nav-ico::before{content:"⚙️"}
.nav-btn.on{color:#d6336f}
.nav-btn.on .nav-ico{background:var(--accent);box-shadow:2px 2px 0 var(--line)}
th{font-size:11px;color:var(--muted);border-bottom:3px solid var(--line);text-transform:uppercase}
td{font-size:13px;border-bottom:2px solid rgba(43,27,61,.14)}
#toast{background:var(--accent2);border:3px solid var(--line);border-radius:999px;color:var(--line);font-size:13px;box-shadow:4px 4px 0 var(--line)}
/* folhas: toda tela é um bottom sheet por cima do mundo */
.screen{background:rgba(43,27,61,.22);padding:0;overflow:hidden}
.screen.on{display:block}
.screen .wrap{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:min(520px,100%);max-height:88%;overflow:auto;border-radius:24px 24px 0 0;
  background:var(--surface);border:5px solid var(--line);border-bottom:0;padding:0 16px;gap:12px;grid-template-columns:1fr;grid-template-areas:none;box-shadow:0 -10px 40px rgba(43,27,61,.3)}
.screen .wrap>*{grid-area:auto}
.screen .wrap::before{content:"";display:block;width:60px;height:8px;border-radius:99px;background:var(--line);margin:8px auto -4px;justify-self:center}
/* ── HUD ── */
#hud-top{left:50%;top:12px;transform:translateX(-50%);gap:8px}
#hud-top .chip{background:var(--surface);border:3px solid var(--line);border-radius:999px;padding:4px 12px;font-size:12px;color:var(--text);box-shadow:3px 3px 0 var(--line)}
#hud-top .chip i{color:var(--muted);font-size:10px;text-transform:uppercase}
#h-exit{background:var(--danger);border-radius:999px;color:#fff;text-shadow:1px 1px 0 var(--line)}
#hud-lb{left:12px;right:auto;top:12px;min-width:0;background:transparent;border:0;box-shadow:none;padding:0}
#hud-lb .ph{display:none}
#lb-rows{display:flex;flex-direction:column;gap:9px;align-items:flex-start;padding-left:8px}
.lb-row{position:relative;background:var(--surface);border:3px solid var(--line);border-radius:14px;padding:5px 12px 5px 6px;gap:8px;color:var(--text);font-size:13px;box-shadow:3px 3px 0 var(--line);min-width:172px;max-width:240px}
.lb-row::after{content:"";position:absolute;left:-9px;top:9px;width:10px;height:10px;background:inherit;border-left:3px solid var(--line);border-bottom:3px solid var(--line);transform:rotate(45deg)}
.lb-row:nth-child(n+4):not(.mine){display:none}
.lb-pos{flex:none;width:24px;min-width:24px;height:24px;border-radius:50%;background:#d9d3ea;color:var(--line);display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid var(--line)}
.lb-row:nth-child(1){font-size:15px;min-width:204px}
.lb-row:nth-child(2){min-width:188px}
.lb-row:nth-child(1) .lb-pos{background:var(--accent2)}.lb-row:nth-child(2) .lb-pos{background:#e2e6f5}.lb-row:nth-child(3) .lb-pos{background:#ffb08a}
.lb-row.mine{background:var(--accent);color:var(--line)}
.lb-row.mine .lb-pos{background:#fff}
.lb-val{color:#157a5c}.lb-row.mine .lb-val{color:var(--line)}
#hud-score{left:12px;bottom:12px;min-width:0;background:var(--accent2);border:4px solid var(--line);border-radius:18px;padding:8px 14px;color:var(--line);box-shadow:4px 4px 0 var(--line)}
.score-big{font-size:30px;text-shadow:2px 2px 0 rgba(255,255,255,.6)}
.score-sub{font-size:10px;letter-spacing:2px;margin-bottom:5px}
.score-row{font-size:12px}.score-row .k{font-size:10px;opacity:.7;text-transform:uppercase}
#hud-status{left:50%;bottom:16px;transform:translateX(-50%);flex-direction:row;align-items:center;gap:8px}
#hud-ammo{background:var(--accent);border:3px solid var(--line);border-radius:999px;padding:5px 12px;font-size:13px;color:#fff;text-shadow:1px 1px 0 var(--line);box-shadow:3px 3px 0 var(--line)}
#hud-ammo span{font-size:10px;text-transform:uppercase;opacity:.9}
#hud-ammo.empty{background:#d9d3ea;color:#7a6f95;text-shadow:none}
.pw{background:var(--surface);border:3px solid var(--line);border-radius:999px;padding:4px 10px;font-size:11px;color:var(--line);box-shadow:3px 3px 0 var(--line)}
.pw-speed{background:var(--accent2)}.pw-magnet{background:#b48cff}.pw-shield{background:#5ec8ff}
#hud-cd{display:none}
#touch{display:flex;bottom:16px;right:16px;gap:12px}
.tbtn{position:relative;width:72px;height:72px;border:4px solid var(--line);box-shadow:4px 4px 0 var(--line);color:var(--line);font-weight:700;gap:0;transition:transform .05s,box-shadow .05s}
.tbtn::before{font-size:24px;line-height:1}
#t-split{background:#5ec8ff}#t-split::before{content:"✂️"}
#t-eject{background:var(--ok)}#t-eject::before{content:"💨"}
#t-fire{background:var(--accent)}#t-fire::before{content:"🚀"}
.tbtn span{font-size:9px;letter-spacing:.5px}
.tbtn b{position:absolute;top:-7px;right:-7px;width:24px;height:24px;border-radius:50%;background:var(--accent2);border:3px solid var(--line);font-size:11px;display:flex;align-items:center;justify-content:center}
.tbtn:active{transform:translate(4px,4px);box-shadow:none}
.tbtn.cd,#t-fire.empty{opacity:1;background:#d9d3ea;color:#8a7fa8;box-shadow:none;transform:translate(4px,4px)}
.tbtn.cd::before,#t-fire.empty::before{filter:grayscale(1);opacity:.5}
/* ── ENTRADA ── */
#s-entry{background:rgba(255,255,255,.08)}
#s-entry .entry-wrap{position:absolute;inset:0;left:0;bottom:auto;transform:none;width:100%;max-height:none;border:0;border-radius:0;background:transparent;box-shadow:none;padding:0;overflow:hidden;
  display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:0}
#s-entry .entry-wrap::before{display:none}
.brand-block{padding-top:8vh;gap:8px}
.brand{font-size:56px;color:var(--accent);text-shadow:4px 4px 0 var(--line);letter-spacing:1px;transform:rotate(-3deg);line-height:1.1}
.tagline{font-size:13px;color:var(--line);background:#fff;padding:4px 14px;border-radius:999px;border:3px solid var(--line);box-shadow:3px 3px 0 var(--line)}
.entry-main{background:transparent;border:0;box-shadow:none;padding:0 16px 22px;width:min(440px,100%);gap:12px}
.entry-main .coinbar{position:absolute;top:14px;right:14px}
.entry-main .field{order:2;align-items:center}
.entry-main .field label{color:#5a4a78;text-shadow:1px 1px 0 #fff}
.entry-main .field input{border-radius:999px;text-align:center;max-width:320px;background:#fff}
.skinrow{order:1;background:var(--surface);border:4px solid var(--line);border-radius:999px;padding:5px 12px 5px 6px;width:auto;min-width:270px;box-shadow:4px 4px 0 var(--line)}
.skinrow canvas{width:56px;height:56px}
.skinmeta b{font-size:15px;color:var(--text)}.skinmeta i{font-style:normal;font-size:11px;text-transform:uppercase}
.entry-main .btn-primary{order:3;font-size:30px;padding:18px;border-radius:26px;border-width:5px;box-shadow:8px 8px 0 var(--line);transform:rotate(-1.5deg);text-shadow:3px 3px 0 var(--line)}
.entry-main .btn-primary:active{transform:rotate(-1.5deg) translate(6px,6px);box-shadow:none}
.entry-links{order:4;display:flex;justify-content:center;gap:10px}
.entry-links .btn-secondary{display:flex;flex-direction:column;align-items:center;gap:5px;width:66px;padding:0;background:none;border:0;box-shadow:none;font-size:10.5px;color:var(--line);text-shadow:1px 1px 0 #fff}
.entry-links .btn-secondary::before{content:"";display:flex;align-items:center;justify-content:center;width:58px;height:58px;border-radius:50%;background:#5ec8ff;border:4px solid var(--line);box-shadow:4px 4px 0 var(--line);font-size:26px;transition:transform .05s,box-shadow .05s}
.entry-links [data-go="lobby"]::before{content:"🛰️";background:#5ec8ff}.entry-links [data-go="rank"]::before{content:"🏆";background:#ffd23d}
.entry-links [data-go="profile"]::before{content:"👤";background:#3ad2a5}.entry-links [data-go="shop"]::before{content:"🛍️";background:#b48cff}.entry-links [data-go="prefs"]::before{content:"⚙️";background:#e2e6f5}
.entry-links .btn-secondary:hover{background:none}
.entry-links .btn-secondary:active{transform:none}
.entry-links .btn-secondary:active::before{transform:translate(4px,4px);box-shadow:none}
.guest-note{order:5;font-size:12px;color:var(--line);background:rgba(255,255,255,.7);border-radius:999px;padding:4px 14px}
.guest-note[data-kind="registered"] .gn-txt{color:#157a5c}
.entry-main .hint{order:6;font-size:11px;text-align:center;color:#5a4a78}
.entry-side{display:none}
/* ── CONTA ── */
.overlay{background:rgba(43,27,61,.4);padding:0;backdrop-filter:blur(2px)}
.modal{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:min(520px,100%);max-height:88%;overflow:auto;border-radius:24px 24px 0 0;border:5px solid var(--line);border-bottom:0;
  background:var(--surface);padding:12px 18px 20px;box-shadow:0 -10px 40px rgba(43,27,61,.3)}
.modal::before{content:"";display:block;width:60px;height:8px;border-radius:99px;background:var(--line);margin:0 auto 2px;flex:none}
.modal-title{font-size:24px;color:var(--accent);text-shadow:3px 3px 0 var(--line);text-align:center}
.tabs{gap:4px;padding:0 6px;border-bottom:4px solid var(--line)}
.tabs button{flex:1;padding:9px;font-size:13px;color:#6b5d8a;background:#efe9ff;border:4px solid var(--line);border-bottom:0;border-radius:14px 14px 0 0;margin-bottom:-4px}
.tabs button.on{background:var(--accent2);color:var(--line)}
.modal-actions button{flex:1;padding:12px;font-size:15px}
/* ── LOBBY ── */
.lobby-hero{order:50;position:sticky;bottom:74px;z-index:2;background:var(--surface);border:0;border-top:4px solid var(--line);border-radius:0;box-shadow:none;margin:0 -16px;padding:10px 16px 12px;grid-template-columns:auto 1fr auto;gap:10px;grid-template-areas:"me input enter" "create play play"}
.me-chip{grid-area:me;background:#f3f0ff;border:3px solid var(--line);border-radius:999px;padding:4px 14px 4px 5px;width:max-content;box-shadow:3px 3px 0 var(--line)}
.me-chip canvas{width:40px;height:40px}
.me-chip b{font-size:15px;color:var(--text)}.me-chip i{font-style:normal;font-size:10px;color:var(--muted);text-transform:uppercase}
.me-chip i[data-kind="registered"]{color:#157a5c}
.code-row{display:contents}
.code-row input{grid-area:input;text-align:center;letter-spacing:3px;font-size:17px;padding:8px 6px;min-width:0}
.code-row .btn-secondary:first-of-type{grid-area:enter;width:auto;padding:8px 16px}
.code-row .btn-secondary:last-of-type{grid-area:create;background:var(--ok);padding:12px 14px;font-size:15px;white-space:nowrap}
.lobby-hero .btn-primary{grid-area:play;font-size:16px;padding:12px}
.lobby-hero .hint{display:none}
.room-list{background:transparent;border:0;box-shadow:none;padding:2px 0 0;gap:8px}
.room-row{background:#f7f5ff;border:3px solid var(--line);border-radius:12px;padding:6px 8px;grid-template-columns:70px 44px 1fr 44px 46px 78px;font-size:12.5px;color:var(--text);box-shadow:3px 3px 0 var(--line)}
.room-row.head{background:transparent;border:0;box-shadow:none;padding:0 8px;font-size:10px;color:var(--muted);text-transform:uppercase}
.room-row.head .code{background:none;border:0;color:var(--muted);font-size:10px;padding:0;text-align:left;box-shadow:none}
.room-row .code{background:var(--accent2);color:var(--line);border:3px solid var(--line);border-radius:8px;padding:3px 4px;text-align:center;font-size:13px;letter-spacing:1px}
.room-row .bar{background:#d9d3ea;border-radius:4px;color:var(--ok);height:8px;border:1px solid var(--line)}
.room-row .btn-mini{background:var(--accent);color:#fff;text-shadow:1px 1px 0 var(--line);padding:5px 10px}
.room-row.full{opacity:.5}
.lobby-side{display:none}
/* ── RANKING ── */
.toggles{flex-direction:column;gap:8px;align-items:stretch}
#rk-period button{flex:1;text-align:center}
#rk-metric{border:0;padding:0;gap:6px;justify-content:center}
#rk-metric button{border:3px solid var(--line);border-radius:999px;padding:5px 14px;font-size:11px;margin:0}
.rank-table{background:transparent;border:0;box-shadow:none;padding:0;max-height:none;overflow:visible}
#rk-table td{padding:7px 8px}
#rk-table tr.me td{background:var(--accent2);color:var(--line)}
#rk-table tr.top1 .c-rank,#rk-table tr.top2 .c-rank,#rk-table tr.top3 .c-rank{font-size:0;text-align:center}
#rk-table tr.top1 .c-rank::before{content:"🥇";font-size:20px}#rk-table tr.top2 .c-rank::before{content:"🥈";font-size:20px}#rk-table tr.top3 .c-rank::before{content:"🥉";font-size:20px}
.c-delta.up{color:#157a5c}.c-delta.down{color:#d6284f}
.rank-me{position:sticky;bottom:82px;z-index:2;background:var(--accent);color:var(--line);border:3px solid var(--line);border-radius:999px;padding:8px 20px;justify-content:center;box-shadow:4px 4px 0 var(--line);margin-bottom:8px}
.rank-me b{font-size:24px}
/* ── PERFIL ── */
.profile-head{background:transparent;border:0;box-shadow:none;padding:0;flex-wrap:wrap}
.profile-head canvas{width:80px;height:80px}
.pf-nick{font-size:24px;color:var(--text)}
.pf-kind{font-style:normal;font-size:11px;color:var(--muted);text-transform:uppercase}
.pf-kind[data-kind="registered"]{color:#157a5c}
.pf-meta .coinbar{width:max-content}
.stat-cards{grid-template-columns:repeat(3,1fr);gap:12px 10px;padding:0 4px 4px 0}
.stat{padding:10px 6px;border-radius:18px;border:4px solid var(--line);background:#5ec8ff;color:var(--line);box-shadow:4px 4px 0 var(--line)}
.stat:nth-child(2){background:var(--accent2);transform:rotate(1.5deg)}.stat:nth-child(3){background:var(--ok)}.stat:nth-child(4){background:#b48cff;transform:rotate(-1.5deg)}
.stat:nth-child(5){background:var(--accent)}.stat:nth-child(6){background:#e2e6f5;transform:rotate(1deg)}
.stat b{font-size:22px;color:var(--line)}.stat i{font-style:normal;font-size:9.5px;font-weight:700;text-transform:uppercase;line-height:1.1}
.pf-hist{overflow-x:auto;padding:10px 12px}
#pf-table th{font-size:10px;padding:5px 6px}
#pf-table td{font-size:11.5px;padding:5px 6px;white-space:nowrap}
#pf-table th:nth-child(2),#pf-table td:nth-child(2),#pf-table th:nth-child(6),#pf-table td:nth-child(6){display:none}
.pf-hist td.cause{color:var(--muted)}.pf-hist td.cause.blackhole{color:#7a4fd0}.pf-hist td.cause i{font-style:normal;color:var(--text)}
.ach-grid{grid-template-columns:1fr}
.ach{padding:8px 10px;border:3px solid var(--line);border-radius:14px;background:#f7f5ff;opacity:.6}
.ach.done{opacity:1;background:#e3fbf3;border-color:var(--ok)}
.ach.secret{opacity:.4}
.ach b{font-size:13px;color:var(--text)}.ach i{font-size:11px;color:var(--muted)}
.ach-bar{background:#d9d3ea;color:var(--accent);border-radius:4px;height:6px;margin-top:4px}
.ach.done .ach-bar{color:var(--ok)}
.ach-coins{font-style:normal;font-size:12px;color:#9a7300}
/* ── LOJA ── */
.shop-eq{background:#f3f0ff;padding:10px 14px}
.shop-eq .badge{position:static;margin-left:auto}
.shop-eq .skinmeta b{font-size:16px}
.filters button{padding:6px 12px;border-radius:999px;border:3px solid var(--line);background:#efe9ff;font-size:11px;color:#6b5d8a;font-weight:700}
.filters button.on{background:var(--rc,var(--accent));color:#fff;text-shadow:1px 1px 0 var(--line)}
.shop-grid{grid-template-columns:repeat(3,1fr);max-height:none;overflow:visible;gap:14px;padding:6px 6px 10px 2px}
.skin-card{background:#fff;border:4px solid var(--rc);border-radius:18px;color:var(--text);box-shadow:4px 4px 0 var(--line);padding:12px 6px 10px;transition:transform .1s}
.skin-card:nth-child(3n+1){transform:rotate(-1.5deg)}.skin-card:nth-child(3n){transform:rotate(1.5deg)}
.skin-card:hover{transform:translateY(-3px) rotate(0);background:#f7f5ff}
.skin-card.eq{background:var(--accent2);color:var(--line);border-color:var(--line)}
.skin-card.eq i,.skin-card.eq em{color:var(--line)}
.skin-card.locked,.skin-card.secret{opacity:.55;filter:grayscale(.4)}.skin-card.poor em{color:#d6284f}
.skin-card b{font-size:12.5px}.skin-card i{font-style:normal;font-size:9.5px;color:var(--rc);text-transform:uppercase}
.skin-card em{font-style:normal;font-size:12px;color:#d6336f;font-weight:700}
.badge{background:var(--accent2);color:var(--line);font-size:9px;font-weight:700;padding:3px 7px;border-radius:8px;border:2px solid var(--line)}
.shop-note{font-size:11px;padding-bottom:4px}
/* ── PREFS ── */
.pg{padding:10px 14px;background:#fbfaff}
.pg h2{font-size:13px;color:var(--accent);text-shadow:2px 2px 0 var(--line);text-transform:uppercase;letter-spacing:1px}
.pref-row{border-bottom:2px solid rgba(43,27,61,.14);font-size:13px;padding:8px 0}
.pref-row:last-child{border-bottom:0}
.toggle{width:58px;height:32px;border-radius:16px;background:#d9d3ea;border:3px solid var(--line);color:#fff}
.toggle i{top:2px;left:2px;width:22px;height:22px;background:#fff;border:2px solid var(--line)}
.toggle[aria-checked="true"]{background:var(--ok)}
.toggle[aria-checked="true"] i{left:24px}
input[type=range]{accent-color:var(--accent)}
.prefs-foot{position:sticky;bottom:74px;z-index:2;background:var(--surface);margin:0 -16px;padding:10px 16px 12px;border-top:4px solid var(--line)}
.prefs-foot button{padding:10px 20px;font-size:14px}
/* ── MORTE ── */
#s-dead{background:rgba(255,111,168,.28)}
#s-dead .dead-card{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:min(520px,100%);max-height:90%;overflow:auto;border-radius:24px 24px 0 0;border:5px solid var(--line);border-bottom:0;
  background:linear-gradient(var(--accent) 0 100px,var(--line) 100px 105px,#fff 105px);padding:10px 20px 22px;gap:10px;box-shadow:0 -10px 40px rgba(43,27,61,.3)}
#s-dead .dead-card::before{content:"";display:block;width:60px;height:8px;border-radius:99px;background:var(--line);flex:none}
.dead-icon{font-size:60px;line-height:1;padding-bottom:14px}
.dead-title{font-size:46px;color:var(--accent);text-shadow:4px 4px 0 var(--line);transform:rotate(-4deg);letter-spacing:1px;line-height:1;margin-top:4px}
.dead-sub{font-size:12px;color:var(--muted)}
.dead-by{background:var(--line);border-radius:999px;padding:6px 20px}
.dead-by span{font-size:10px;color:#d9c9ee;letter-spacing:2px}.dead-by b{font-size:22px;color:var(--accent)}
.dead-stats{gap:12px;flex-wrap:wrap;justify-content:center;padding:4px 6px}
.dead-stats div{background:#5ec8ff;border:4px solid var(--line);border-radius:16px;padding:8px 10px;min-width:96px;color:var(--line);box-shadow:4px 4px 0 var(--line);transform:rotate(-2deg)}
.dead-stats div:nth-child(2){background:var(--accent2);transform:rotate(2deg)}.dead-stats div:nth-child(3){background:var(--ok);transform:rotate(-1deg)}.dead-stats div:nth-child(4){background:#b48cff;transform:rotate(2deg)}
.dead-stats b{font-size:22px}.dead-stats i{font-style:normal;font-size:9.5px;text-transform:uppercase}
.dead-rank span{font-size:10px;color:var(--muted);letter-spacing:2px}.dead-rank b{font-size:18px;color:var(--text)}.dead-rank .arrow{color:#157a5c}
.dead-actions{flex-direction:row}
.dead-actions .btn-primary{font-size:18px;padding:12px}
/* ── RECONN ── */
.modal.reconn{bottom:auto;top:45%;transform:translate(-50%,-50%);width:min(340px,92%);max-height:none;overflow:visible;border-radius:28px;border-bottom:5px solid var(--line);background:#fff;color:var(--line);padding:22px 22px 24px;box-shadow:var(--shadow)}
.modal.reconn::before{display:none}
.modal.reconn::after{content:"";position:absolute;left:44px;bottom:-19px;width:26px;height:26px;background:#fff;border-right:5px solid var(--line);border-bottom:5px solid var(--line);transform:rotate(45deg)}
.spinner{width:52px;height:52px;border:5px solid var(--line);border-top-color:var(--accent)}
.rc-title{font-size:24px;color:var(--accent);text-shadow:2px 2px 0 var(--line)}
.rc-title::before{content:"📡 "}
.rc-sub{font-size:13px;color:#5a4a78}
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
body[data-mode="portrait"] #hud-top{left:auto;right:12px;top:112px;transform:none;flex-direction:column;align-items:flex-end;gap:6px}
body[data-mode="portrait"] #hud-top .chip{padding:3px 9px;font-size:11px}
body[data-mode="portrait"] #hud-lb{top:12px;left:12px}
body[data-mode="portrait"] #lb-rows{gap:7px}
body[data-mode="portrait"] .lb-row{font-size:11px;min-width:140px;max-width:180px;padding:3px 9px 3px 4px;gap:6px}
body[data-mode="portrait"] .lb-row:nth-child(1){font-size:12px;min-width:160px}
body[data-mode="portrait"] .lb-row:nth-child(2){min-width:150px}
body[data-mode="portrait"] .lb-pos{width:20px;min-width:20px;height:20px;font-size:10px}
body[data-mode="portrait"] #hud-lb .lb-row.mine,body[data-mode="landscape"] #hud-lb .lb-row.mine{display:flex}
body[data-mode="portrait"] #hud-score{padding:6px 10px;bottom:12px}
body[data-mode="portrait"] .score-big{font-size:22px}
body[data-mode="portrait"] .score-row:nth-child(n+4){display:none}
body[data-mode="portrait"] #hud-status{left:12px;bottom:106px;transform:none;flex-direction:column;align-items:flex-start}
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
body[data-mode="landscape"] #hud-top{top:10px}
body[data-mode="landscape"] #lb-rows{gap:6px}
body[data-mode="landscape"] .lb-row{font-size:11px;min-width:140px;padding:3px 9px 3px 4px;gap:6px}
body[data-mode="landscape"] .lb-row:nth-child(1){font-size:12px;min-width:160px}
body[data-mode="landscape"] .lb-row:nth-child(2){min-width:150px}
body[data-mode="landscape"] .lb-pos{width:20px;min-width:20px;height:20px;font-size:10px}
body[data-mode="landscape"] #hud-score{padding:6px 10px}
body[data-mode="landscape"] .score-big{font-size:22px}
body[data-mode="landscape"] .score-row:nth-child(n+4){display:none}
body[data-mode="landscape"] #hud-status{left:150px;bottom:14px;transform:none}
body[data-mode="landscape"] #touch{gap:8px;bottom:12px}
body[data-mode="landscape"] .tbtn{width:60px;height:60px}
`};
})();

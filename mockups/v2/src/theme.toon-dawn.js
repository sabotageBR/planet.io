// ── VARIAÇÃO 6 — CARTOON AMANHECER ────────────────────────────────────────────
// Cruzamento do Cartoon Cósmico com o Cartoon Crepúsculo: a ESTRUTURA é a do
// Crepúsculo (no desktop/paisagem os menus são uma GAVETA que entra pela direita,
// altura inteira, abas fixas no rodapé e fileiras ancoradas acima delas, com o
// mundo à vista à esquerda; no retrato voltam a ser folhas que sobem; placar em
// cima à esquerda, pódio de balões embaixo à esquerda, chips no centro, radar em
// cima à direita, munição no centro e botões de toque à direita; coluna vertical
// de ícones na entrada) e a PALETA é a do Cósmico (tinta #141026, creme, amarelo,
// laranja, azul, roxo, verde) num céu de MANHÃ CEDO: azul-marinho no alto → azul
// céu → brilho pêssego no horizonte, SEM SOL (o sol distraía), estrelas pálidas só
// em azul-poeira. Mundo: receita de planeta do Cósmico (chapado + crescente escuro +
// brilho elíptico + contorno de tinta), comida confete, asteroide marrom-cinza,
// buraco negro roxo em espiral, rastro branco tracejado e POW! amarelo.
// Desempenho: tudo que tem contorno/volume é sprite assado por (skin, tier);
// efeitos são arcs/lines + um texto; fundo (céu, nuvens, planetas) em cache por resolução.
(function(){
const u=MOCK.u,WW=u.WW,WH=u.WH,sh=u.sh,rgba=u.rgba;
const INK="#141026",CREAM="#fff5c2",YEL="#ffc22e",ORA="#ff6b4a",BLU="#3fc4ff",PUR="#c56bff",GRN="#3ddc5f";
const NAVY="#1b2450",SKY="#3fa9e8",PEACH="#ffd58a",PALE="#ffe9b8",DUST="#4d68a8";
const FONT="'Trebuchet MS',Verdana,sans-serif",T=900;
let L=[],BIG=null,PROPS=[],bg=null,bgW=0,bgH=0;

// ── sprites (prefixo "tw": o cache de sprites é global por página) ────────────
const PK=sk=>sk.ring?2.05:1.3;
function planetSpr(sk,isMe,size){return u.sprite("twp"+sk.id+(isMe?"m":"")+size,size,(c,R)=>{
  const K=PK(sk),r=R/K,col=sk.color,lw=Math.max(2.5,r*.1);c.lineJoin="round";c.lineCap="round";
  const band=(a0,a1)=>{c.beginPath();c.ellipse(0,0,r*1.85,r*.56,0,a0,a1,false);c.ellipse(0,0,r*1.3,r*.39,0,a1,a0,true);c.closePath();c.fill();c.stroke();};
  if(sk.ring){c.fillStyle=sh(col,.3);c.strokeStyle=INK;c.lineWidth=lw*.7;band(Math.PI,Math.PI*2);}
  c.fillStyle=col;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
  c.save();c.beginPath();c.arc(0,0,r,0,6.283);c.clip();
  c.fillStyle="rgba(20,16,38,.3)";c.beginPath();c.arc(r*.38,r*.4,r*1.05,0,6.283);c.fill();
  c.fillStyle="rgba(255,255,255,.38)";c.beginPath();c.ellipse(-r*.36,-r*.38,r*.34,r*.2,-.75,0,6.283);c.fill();
  c.fillStyle="rgba(255,255,255,.25)";c.beginPath();c.arc(-r*.08,-r*.58,r*.08,0,6.283);c.fill();
  c.globalAlpha=.16;c.font=`${r*1.3}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(sk.emoji,r*.05,r*.15);c.globalAlpha=1;
  c.restore();
  if(sk.ring){c.fillStyle=sh(col,.3);c.strokeStyle=INK;c.lineWidth=lw*.7;band(0,Math.PI);}
  c.strokeStyle=isMe?CREAM:INK;c.lineWidth=lw;c.beginPath();c.arc(0,0,r,0,6.283);c.stroke();
  if(isMe){c.strokeStyle=INK;c.lineWidth=lw*.55;c.beginPath();c.arc(0,0,r+lw*.78,0,6.283);c.stroke();}});}

// comida confete (cor quantizada do servidor) com contorno de tinta e brilho branco
const FK=2.1,FICON={missile_ammo:"🚀",powerup_speed:"⚡",powerup_magnet:"🧲",powerup_shield:"🛡️"};
function foodSpr(f){return u.sprite("twf"+f.type+f.color,64,(c,R)=>{const r=R/FK;c.lineJoin="round";c.strokeStyle=INK;c.lineWidth=Math.max(2,r*.24);c.fillStyle=f.color;
  const gl=(x,y,k)=>{c.fillStyle="rgba(255,255,255,.55)";c.beginPath();c.arc(x,y,r*k,0,6.283);c.fill();};
  if(FICON[f.type]){c.beginPath();c.arc(0,0,r*1.5,0,6.283);c.fill();c.stroke();c.font=`${r*1.5}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(FICON[f.type],0,r*.1);return;}
  if(f.type==="star"){u.spikes(c,r*1.6,5,.5,-1.5708);c.fill();c.stroke();gl(-r*.25,-r*.3,.22);return;}
  if(f.type==="comet"){c.beginPath();c.moveTo(-r*2,0);c.lineTo(-r*.15,-r*.8);c.arc(0,0,r*.85,-1.4,1.4);c.lineTo(-r*.15,r*.8);c.closePath();c.fill();c.stroke();gl(-r*.2,-r*.3,.25);return;}
  if(f.type==="rock"){c.rotate(.45);u.rr(c,-r,-r,r*2,r*2,r*.3);c.fill();c.stroke();gl(-r*.4,-r*.4,.24);return;}
  c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.stroke();gl(-r*.3,-r*.32,.26);});}

const EK=1.5;
const ejSpr=col=>u.sprite("twe"+col,40,(c,R)=>{const r=R/EK;c.fillStyle=col;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(2,r*.22);c.stroke();
  c.fillStyle="rgba(255,255,255,.5)";c.beginPath();c.arc(-r*.3,-r*.32,r*.26,0,6.283);c.fill();});

// estrelas grandes do fundo (2 variantes, pálidas) e planetas de cenário em azul-poeira com fio claro vindo do horizonte
const starSpr=v=>u.sprite("twstar"+v,32,(c,R)=>{c.lineJoin="round";u.spikes(c,R*.9,v?5:4,v?.5:.38,-1.5708);c.fillStyle=v?PALE:CREAM;c.fill();c.strokeStyle=INK;c.lineWidth=2;c.stroke();});
function propSpr(p,i){return u.sprite("twprop"+i,256,(c,R)=>{const K=p.ring?2:1.2,r=R/K;c.lineJoin="round";
  if(p.ring){c.fillStyle=sh(DUST,-.15);c.strokeStyle=INK;c.lineWidth=r*.05;c.beginPath();c.ellipse(0,0,r*1.8,r*.5,-.35,0,6.283);c.ellipse(0,0,r*1.35,r*.36,-.35,6.283,0,true);c.fill("evenodd");c.stroke();}
  c.fillStyle=DUST;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
  c.save();c.clip();c.fillStyle="rgba(20,16,38,.28)";c.beginPath();c.arc(-r*.3,-r*.45,r*1.05,0,6.283);c.fill();          // sombra em cima (a luz vem do horizonte, embaixo)
  c.strokeStyle="rgba(255,233,184,.7)";c.lineWidth=r*.13;c.beginPath();c.arc(0,0,r*.94,.55,2.55);c.stroke();          // fio pêssego embaixo
  c.fillStyle="rgba(255,233,184,.1)";[-.45,.1,.5].forEach(y=>{c.beginPath();c.ellipse(0,r*y,r*1.05,r*.1,0,0,6.283);c.fill();});c.restore();
  c.strokeStyle=INK;c.lineWidth=r*.07;c.beginPath();c.arc(0,0,r,0,6.283);c.stroke();});}

// asteroide: "batata" marrom-cinza, 3 crateras, contorno de tinta (3 variantes × tier)
const AK=1.3;
function astSpr(variant,size){return u.sprite("twa"+variant+size,size,(c,R)=>{const r=R/AK,seed=11+variant*7,n=9+variant*2;c.lineJoin="round";
  c.fillStyle="#8c7b6b";u.astPoly(c,r,seed,n);c.fill();
  c.save();c.clip();c.fillStyle="rgba(20,16,38,.3)";c.beginPath();c.arc(r*.35,r*.4,r*1.05,0,6.283);c.fill();
  c.fillStyle="rgba(255,255,255,.14)";c.beginPath();c.ellipse(-r*.35,-r*.4,r*.35,r*.2,-.7,0,6.283);c.fill();c.restore();
  const cr=u.mulberry(seed*3);for(let i=0;i<3;i++){const a=cr()*6.28,d=cr()*r*.5,c2=r*(.12+cr()*.14);
    c.fillStyle="#5a4a40";c.beginPath();c.arc(Math.cos(a)*d,Math.sin(a)*d,c2,0,6.283);c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(1.5,r*.045);c.stroke();}
  u.astPoly(c,r,seed,n);c.strokeStyle=INK;c.lineWidth=Math.max(3,r*.1);c.stroke();});}

// buraco negro: disco roxo com espiral + linhas de sucção (1 sprite, girado por h.spin)
const BK=2.4;
const bhSpr=()=>u.sprite("twbh",256,(c,R)=>{const r=R/BK;c.lineJoin="round";c.lineCap="round";
  c.strokeStyle=PUR;c.lineWidth=r*.12;for(let i=0;i<10;i++){const a=i/10*6.283+.3;c.beginPath();c.moveTo(Math.cos(a)*r*1.55,Math.sin(a)*r*1.55);c.lineTo(Math.cos(a+.25)*r*2.2,Math.sin(a+.25)*r*2.2);c.stroke();}
  c.fillStyle="#7a2fd6";c.beginPath();c.arc(0,0,r*1.3,0,6.283);c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(3,r*.12);c.stroke();
  c.strokeStyle=PUR;c.lineWidth=r*.16;c.beginPath();for(let i=0;i<=90;i++){const k=i/90,a=k*6.283*2.2,rr=r*.15+k*r*1.05;i?c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.stroke();
  c.strokeStyle=INK;c.lineWidth=r*.04;c.beginPath();for(let i=0;i<=90;i++){const k=i/90,a=k*6.283*2.2,rr=r*.15+k*r*1.05+r*.1;i?c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.stroke();
  c.fillStyle=INK;c.beginPath();c.arc(0,0,r*.5,0,6.283);c.fill();c.strokeStyle=PUR;c.lineWidth=r*.08;c.stroke();});

window.THEME={
id:"toon-dawn",name:"Cartoon Amanhecer",
desc:"Cruzamento do Crepúsculo com o Cósmico: a estrutura do Crepúsculo — no desktop os menus são uma gaveta que entra pela direita (altura inteira, abas fixas no rodapé) com o mundo à vista ao lado; no celular em pé voltam a ser folhas — com a paleta azul e amarela do Cartoon Cósmico num céu de manhã cedo: azul-marinho no alto, azul céu no meio e um brilho pêssego no horizonte, sem sol nenhum. Estrelas pálidas só lá em cima, nuvens creme, placar amarelo, pódio de balões, radar azul e botões azul, verde e laranja.",
tags:["manhã","gaveta","cartoon","azul e amarelo"],swatch:["#3fa9e8","#ffc22e"],
tokens:{bg:"#1b2450",surface:"#232f63",text:"#fff5c2",muted:"#8fa0d8",accent:"#ffc22e",accent2:"#ff6b4a",danger:"#ff3d5a",ok:"#3ddc5f",
  line:"#141026",radius:"14px",radiusLg:"20px",space:"14px",fontUi:"'Trebuchet MS',Verdana,sans-serif",fontMono:"'Courier New',monospace",
  shadow:"6px 6px 0 #141026"},
layout:{hud:"bubbles",nav:"drawer"},
rarityColor:{free:"#9aa3c0",common:"#3fc4ff",rare:"#3d7bff",epic:"#c56bff",legendary:"#ffc22e",earned:"#3ddc5f",secret:"#ff6b4a"},
labels:{title:"WARSPACE.IO",tagline:"Conquiste a galáxia antes do dia clarear!",play:"🚀 JOGAR",playAuto:"🚀 JOGAR (AUTO)",lbTitle:"PÓDIO",
  dead:"KABOOM!",deadSub:"— você virou poeira de manhã cedo —",respawn:"🔄 DE NOVO!",reconnTitle:"SINAL FRACO!",reconnSub:"Procurando o satélite… tentativa {n}/5",
  back:"◄",create:"➕ Criar sala",top5:"TOP 5 HOJE"},

init(g){const rand=u.mulberry(21);
  L=[.2,.45].map((f,li)=>({f,stars:Array.from({length:li?50:80},()=>({x:rand()*T,y:rand()*T,s:li?2.5+rand()*1.5:1.5+rand(),a:+(.3+rand()*.35).toFixed(2)}))}));
  BIG={f:.7,stars:Array.from({length:22},()=>({x:rand()*T,y:rand()*T,s:14+rand()*12,v:rand()<.5?1:0}))};
  PROPS=[];
  for(let i=0;i<10;i++)PROPS.push({x:200+rand()*(WW-400),y:200+rand()*(WH-400),r:80+rand()*120,ring:rand()<.4});},

drawBg(c,W,H,cam,t,g){
  if(!bg||bgW!==W||bgH!==H){bgW=W;bgH=H;bg=document.createElement("canvas");bg.width=W;bg.height=H;const x=bg.getContext("2d");x.lineJoin="round";x.lineCap="round";
    // céu de manhã cedo: marinho → azul céu → pêssego no horizonte (SEM sol)
    const gd=x.createLinearGradient(0,0,0,H);gd.addColorStop(0,NAVY);gd.addColorStop(.2,"#24407f");gd.addColorStop(.48,SKY);gd.addColorStop(.68,"#a8dcf5");gd.addColorStop(.82,PEACH);gd.addColorStop(1,PALE);x.fillStyle=gd;x.fillRect(0,0,W,H);
    const rand=u.mulberry(5);
    // planetas distantes em azul-poeira, chapados, com fio claro embaixo (luz do horizonte)
    for(let i=0;i<3;i++){const r=H*(.05+rand()*.07),px=W*(.1+rand()*.8),py=H*(.5+rand()*.18);
      x.fillStyle="rgba(77,104,168,.4)";x.beginPath();x.arc(px,py,r,0,6.283);x.fill();
      x.strokeStyle="rgba(255,233,184,.55)";x.lineWidth=Math.max(2,r*.12);x.beginPath();x.arc(px,py,r*.9,.6,2.5);x.stroke();}
    // estrelas pálidas só no terço de cima (a noite acabando)
    x.fillStyle=CREAM;for(let i=0;i<50;i++){const y=H*rand()*.3;x.globalAlpha=(.15+rand()*.45)*(1-y/(H*.3));x.fillRect(rand()*W,y,2,2);}x.globalAlpha=1;}
  c.drawImage(bg,0,0);
  if(g&&g.prefs&&!g.prefs.parallax)return;
  // parallax só no terço de cima (parte ainda escura), com fade
  const Y0=H*.32,FD=H*.16;c.fillStyle=CREAM;
  L.forEach(l=>{const ox=((-cam.x*l.f*cam.scale)%T+T)%T,oy=((-cam.y*l.f*cam.scale)%T+T)%T;
    l.stars.forEach(s=>{const bx=(s.x+ox)%T,by=(s.y+oy)%T;for(let x=bx;x<W;x+=T)for(let y=by;y<H;y+=T){if(y>Y0)continue;c.globalAlpha=s.a*Math.min(1,(Y0-y)/FD);c.fillRect(x,y,s.s,s.s);}});});
  c.globalAlpha=1;
  const l=BIG,ox=((-cam.x*l.f*cam.scale)%T+T)%T,oy=((-cam.y*l.f*cam.scale)%T+T)%T,sp=[starSpr(0),starSpr(1)];
  l.stars.forEach(s=>{const bx=(s.x+ox)%T,by=(s.y+oy)%T,h=s.s/2;for(let x=bx;x<W;x+=T)for(let y=by;y<H;y+=T){if(y>Y0-FD*.5)continue;c.globalAlpha=.85*Math.min(1,(Y0-y)/FD);c.drawImage(sp[s.v],x-h,y-h,s.s,s.s);}});
  c.globalAlpha=1;},

drawWorld(c,cam,t,g,W,H){
  const hw=W/(2*cam.scale),hh=H/(2*cam.scale);c.globalAlpha=.5;
  PROPS.forEach((p,i)=>{const R=p.r*(p.ring?2:1.2);if(Math.abs(p.x-cam.x)>hw+R||Math.abs(p.y-cam.y)>hh+R)return;c.drawImage(propSpr(p,i),p.x-R,p.y-R,R*2,R*2);});
  c.globalAlpha=1;
  if(!g||!g.prefs||g.prefs.grid)u.grid(c,150,"rgba(255,245,194,.09)",2);
  c.strokeStyle=INK;c.lineWidth=18;c.strokeRect(0,0,WW,WH);
  c.strokeStyle=YEL;c.lineWidth=6;c.setLineDash([40,26]);c.strokeRect(0,0,WW,WH);c.setLineDash([]);},

drawFood(c,f,t){const p=f.type==="star"?1+Math.sin(t*.003+f.seed)*.14:1,r=f.r*FK*p,s=foodSpr(f);
  if(f.type==="rock"||f.type==="comet"){c.save();c.translate(f.x,f.y);c.rotate(f.seed);c.drawImage(s,-r,-r,r*2,r*2);c.restore();return;}
  const bob=FICON[f.type]?Math.sin(t*.005+f.seed)*3:0;c.drawImage(s,f.x-r,f.y-r+bob,r*2,r*2);},
drawEjected(c,e){const r=e.r*EK;c.drawImage(ejSpr(e.color),e.x-r,e.y-r,r*2,r*2);},

drawAsteroid(c,a,t){const r=a.r*AK;c.save();c.translate(a.x,a.y);c.rotate(a.rot);c.drawImage(astSpr(a.variant,u.tier(a.r)),-r,-r,r*2,r*2);c.restore();},

drawBlackHole(c,h,t){const k=h.k,rc=h.rc*k,ri=h.ri*k;
  c.strokeStyle=rgba(PUR,.25+.1*Math.sin(t*.004));c.lineWidth=3;c.setLineDash([14,18]);c.beginPath();c.arc(h.x,h.y,ri,-h.spin*.4,-h.spin*.4+6.283);c.stroke();c.setLineDash([]);
  const R=rc*BK;c.save();c.translate(h.x,h.y);c.rotate(h.spin);c.globalAlpha=Math.min(1,k*1.2);c.drawImage(bhSpr(),-R,-R,R*2,R*2);c.restore();c.globalAlpha=1;},

drawTrail(c,pc,p,isMe){if(!u.trailPath(c,pc))return;
  c.strokeStyle=`rgba(255,255,255,${isMe?.55:.35})`;c.lineWidth=Math.max(2,pc.r*.22);c.lineCap="round";c.lineJoin="round";
  c.setLineDash([pc.r*.35,pc.r*.35]);c.stroke();c.setLineDash([]);},

drawMissile(c,m,t){c.lineJoin="round";
  m.trail.forEach((pt,i)=>{if(i%2)return;const a=i/m.trail.length;c.fillStyle=`rgba(255,245,194,${a*.5})`;c.beginPath();c.arc(pt.x,pt.y,m.r*.7*a,0,6.283);c.fill();});
  c.save();c.translate(m.x,m.y);c.rotate(Math.atan2(m.vy,m.vx));const r=m.r,fl=1+.25*Math.sin(t*.05);
  c.fillStyle=YEL;c.beginPath();c.moveTo(-r*1.1,0);c.lineTo(-r*2.4*fl,-r*.6);c.lineTo(-r*2*fl,0);c.lineTo(-r*2.4*fl,r*.6);c.closePath();c.fill();
  c.strokeStyle=INK;c.lineWidth=2.6;c.fillStyle=ORA;
  c.beginPath();c.moveTo(r*1.6,0);c.quadraticCurveTo(r*.6,-r*.95,-r*.9,-r*.7);c.lineTo(-r*1.3,-r*1.1);c.lineTo(-r*1.3,r*1.1);c.lineTo(-r*.9,r*.7);c.quadraticCurveTo(r*.6,r*.95,r*1.6,0);c.closePath();c.fill();c.stroke();
  c.fillStyle=BLU;c.beginPath();c.arc(r*.25,0,r*.36,0,6.283);c.fill();c.stroke();c.restore();},

drawCell(c,pc,p,isMe,t,prev,g){const r=pc.displayR||pc.r,sk=p.skin,d=r*PK(sk),pr=(g&&g.prefs)||{names:true,mass:true};
  c.drawImage(planetSpr(sk,isMe,u.tier(r)),pc.x-d,pc.y-d,d*2,d*2);
  c.save();c.translate(pc.x,pc.y);c.lineCap="round";
  if(pc.mergeTimer>0){c.strokeStyle=YEL;c.lineWidth=Math.max(3,r*.08);c.beginPath();c.arc(0,0,r*1.18,-1.5708,-1.5708+(1-pc.mergeTimer/u.mergeTime(pc.r))*6.283);c.stroke();}
  const pw=Object.keys(p._powerups||{});
  if(pw.length){const cl={speed:YEL,magnet:PUR,shield:BLU};
    pw.forEach((k,i)=>{const a0=t*.001*(i%2?-1:1);c.strokeStyle=cl[k];c.lineWidth=Math.max(3,r*.08);c.globalAlpha=.6+.4*Math.sin(t*.012+i);
      c.setLineDash([r*.4,r*.3]);c.beginPath();c.arc(0,0,r*(1.3+i*.16),a0,a0+6.283);c.stroke();c.setLineDash([]);c.globalAlpha=1;});}
  // rótulos sempre com traço de tinta: a faixa de baixo do céu é clara (pêssego)
  if(!prev&&r>13){const fs=Math.max(12,r*.34);
    if(pr.names!==false)u.outText(c,p.name+(p.registered?" ✓":""),0,pr.mass!==false?-fs*.28:0,fs,"#fff",INK,FONT);
    if(pr.mass!==false)u.outText(c,u.fmt(pc.r*pc.r),0,pr.names!==false?fs*.8:0,fs*.68,CREAM,INK,FONT);}
  c.restore();},

drawFx(c,f,t){const k=f.age/f.ttl,a=1-k;c.lineJoin="round";c.lineCap="round";
  switch(f.t){
    case "bounce":{const s=f.r*(.7+k*.3)*(.6+(f.power||1)*.5);c.save();c.translate(f.x,f.y);c.rotate(f.nx*.6);
      u.spikes(c,s,8,.55,0);c.fillStyle=YEL;c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(2,s*.08);c.stroke();
      u.outText(c,"POW!",0,0,Math.max(10,s*.5),"#fff",INK,FONT);c.restore();break;}
    case "pop":{const s=f.r*(1+k*.8);c.save();c.translate(f.x,f.y);c.globalAlpha=Math.min(1,a*1.5);
      u.spikes(c,s,10,.5,k*.6);c.fillStyle=ORA;c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(2,s*.06);c.stroke();
      u.outText(c,"BOOM",0,0,Math.max(10,s*.42),YEL,INK,FONT);c.restore();break;}
    case "boom":{const s=f.r*(.8+k*1.2);c.save();c.translate(f.x,f.y);c.globalAlpha=Math.min(1,a*1.5);
      u.spikes(c,s,12,.55,-k*.5);c.fillStyle=ORA;c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(2.5,s*.06);c.stroke();
      u.spikes(c,s*.55,12,.55,-k*.5);c.fillStyle=YEL;c.fill();u.outText(c,"KABOOM!",0,0,Math.max(11,s*.34),"#fff",INK,FONT);c.restore();break;}
    case "eat":c.strokeStyle=`rgba(255,245,194,${a})`;c.lineWidth=3;c.beginPath();c.arc(f.x,f.y,f.r*(1.2+k*1.2),0,6.283);c.stroke();
      if(f.r>8)u.outText(c,"nom",f.x,f.y-f.r*(1+k*2),Math.max(9,f.r*.9),CREAM,INK,FONT);break;
    case "suck":c.strokeStyle=rgba(PUR,a);c.lineWidth=4;c.beginPath();c.arc(f.x,f.y,f.r*(3-k*2.6),0,6.283);c.stroke();break;
    case "exit":case "split":case "merge":c.strokeStyle=`rgba(255,255,255,${a})`;c.lineWidth=3;c.beginPath();c.arc(f.x,f.y,f.r*(.6+k*1.5),0,6.283);c.stroke();break;
    case "chip":c.strokeStyle=rgba(YEL,a);c.lineWidth=3;for(let i=-1;i<=1;i++){const an=Math.atan2(f.ny,f.nx)+i*.5;c.beginPath();c.moveTo(f.x,f.y);c.lineTo(f.x+Math.cos(an)*f.r*3*k,f.y+Math.sin(an)*f.r*3*k);c.stroke();}break;
    case "shoot":c.strokeStyle=rgba(ORA,a);c.lineWidth=3;for(let i=0;i<8;i++){const an=i/8*6.283;c.beginPath();c.moveTo(f.x+Math.cos(an)*f.r*(1+k),f.y+Math.sin(an)*f.r*(1+k));c.lineTo(f.x+Math.cos(an)*f.r*(1.6+k*1.4),f.y+Math.sin(an)*f.r*(1.6+k*1.4));c.stroke();}break;
    case "rock":c.strokeStyle=`rgba(255,245,194,${a*.5})`;c.lineWidth=2;c.beginPath();c.arc(f.x,f.y,f.r*.4*(1+k),0,6.283);c.stroke();break;}},

// radar redondo no canto superior direito: cara marinho, varredura azul (o resto do HUD é DOM)
drawHud(c,W,H,g,t,mode){
  if(g.prefs&&!g.prefs.minimap)return;
  const D=mode==="portrait"?92:mode==="landscape"?84:150,MP=12,R=D/2,cx=W-MP-R,cy=MP+R;c.lineJoin="round";
  c.fillStyle=INK;c.beginPath();c.arc(cx+4,cy+4,R,0,6.283);c.fill();
  c.fillStyle="#12183a";c.beginPath();c.arc(cx,cy,R,0,6.283);c.fill();c.strokeStyle=INK;c.lineWidth=4;c.stroke();
  c.strokeStyle="rgba(63,196,255,.3)";c.lineWidth=1.5;[.33,.66].forEach(k=>{c.beginPath();c.arc(cx,cy,R*k,0,6.283);c.stroke();});
  c.beginPath();c.moveTo(cx-R,cy);c.lineTo(cx+R,cy);c.moveTo(cx,cy-R);c.lineTo(cx,cy+R);c.stroke();
  const a=t*.0025;c.fillStyle="rgba(63,196,255,.16)";c.beginPath();c.moveTo(cx,cy);c.arc(cx,cy,R-2,a-.7,a);c.closePath();c.fill();
  c.strokeStyle=BLU;c.lineWidth=2;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.cos(a)*(R-2),cy+Math.sin(a)*(R-2));c.stroke();
  const S=D*.72,mx=cx-S/2,my=cy-S/2;
  c.save();c.beginPath();c.arc(cx,cy,R-2,0,6.283);c.clip();
  u.minimap(c,mx,my,S,g,{me:CREAM,player:YEL,bot:BLU,ast:"rgba(200,180,160,.8)",hole:"rgba(197,107,255,.75)",view:"rgba(255,245,194,.35)"});
  const me=g.players[g.me];
  if(me&&!me.dead&&me.pieces.length){const sc=S/WW,n=me.pieces.length,x=mx+me.pieces.reduce((s,q)=>s+q.x,0)/n*sc,y=my+me.pieces.reduce((s,q)=>s+q.y,0)/n*sc;
    c.fillStyle=CREAM;c.strokeStyle=INK;c.lineWidth=1.5;c.beginPath();c.arc(x,y,mode==="desktop"?4:3,0,6.283);c.fill();c.stroke();}
  c.restore();
  if(mode==="desktop"){c.font="bold 9px "+FONT;c.fillStyle=BLU;c.textAlign="center";c.textBaseline="middle";c.fillText("RADAR",cx,cy+R-10);}},

paintSkin(c,sk,r){const rr=sk.ring?r*.68:r,d=rr*PK(sk);c.drawImage(planetSpr(sk,false,u.tier(rr)),-d,-d+2,d*2,d*2);},

css:`
/* ── BASE ── */
body{font-family:var(--font-ui);font-weight:700}
.card,.panel{background:var(--surface);border:4px solid var(--line);border-radius:var(--radius-lg);padding:14px 16px;color:var(--text);box-shadow:var(--shadow)}
.panel{padding:10px 12px;border-radius:var(--radius)}
.ph{font-size:12px;letter-spacing:1px;color:var(--accent);text-shadow:2px 2px 0 var(--line);text-transform:uppercase}
.hint{font-size:12px;color:var(--muted);font-weight:600}
.dim{color:var(--muted);opacity:1}
.reg{color:var(--ok)}.bot{color:var(--muted)}
.code,.mono{font-family:var(--font-mono);font-weight:700}
.coinbar{background:var(--line);border:3px solid var(--accent);border-radius:999px;padding:4px 14px;font-size:15px;color:var(--accent)}
.coinbar span{font-size:11px;color:#b89a3a;font-weight:600}
.btn-primary{background:var(--accent);border:4px solid var(--line);border-radius:var(--radius-lg);padding:14px;font-size:20px;font-weight:700;color:var(--line);box-shadow:var(--shadow);letter-spacing:1px;text-transform:uppercase;transition:transform .05s,box-shadow .05s}
.btn-primary:hover{background:#ffd25c}
.btn-secondary{background:#3fc4ff;border:4px solid var(--line);border-radius:var(--radius);padding:11px;font-size:14px;font-weight:700;color:var(--line);box-shadow:4px 4px 0 var(--line);transition:transform .05s,box-shadow .05s}
.btn-secondary:hover{background:#6fd4ff}
.btn-mini{background:#3fc4ff;border:3px solid var(--line);border-radius:10px;padding:6px 12px;font-size:12px;color:var(--line);font-weight:700;box-shadow:3px 3px 0 var(--line);white-space:nowrap;transition:transform .05s,box-shadow .05s}
.btn-primary:active,.btn-secondary:active{transform:translate(4px,4px);box-shadow:none}
.btn-mini:active{transform:translate(3px,3px);box-shadow:none}
.btn-link{color:var(--accent);text-decoration:underline;font-size:12px}
.field label{font-size:12px;color:var(--muted)}
.field input,.code-row input{background:#12183a;border:4px solid var(--line);border-radius:var(--radius);padding:10px 12px;font-size:17px;color:#fff;outline:none;font-weight:700;font-family:inherit}
.field input:focus,.code-row input:focus{border-color:var(--accent)}
select{background:#12183a;border:3px solid var(--line);border-radius:10px;padding:6px 10px;color:#fff;font-weight:700;font-family:inherit}
.seg{gap:4px;padding:0 6px;border-bottom:4px solid var(--line)}
.seg button{padding:8px 14px;font-size:12.5px;color:var(--muted);background:#1a2350;border:4px solid var(--line);border-bottom:0;border-radius:14px 14px 0 0;margin-bottom:-4px}
.seg button.on{background:var(--accent);color:var(--line)}
.sh{position:sticky;top:0;z-index:3;background:var(--surface);padding:8px 0 10px;border-bottom:4px solid var(--line);gap:12px}
.sh .stitle{font-size:24px;color:var(--accent);text-shadow:3px 3px 0 var(--line);letter-spacing:1px}
.btn-mini.back{width:38px;height:38px;border-radius:50%;padding:0;display:flex;align-items:center;justify-content:center;font-size:14px;background:var(--accent2)}
.nav{order:99;position:sticky;bottom:0;z-index:3;background:var(--line);margin:auto -16px 0 -22px;padding:8px 8px 0;height:74px;gap:2px;justify-content:space-around;flex-wrap:nowrap;box-shadow:0 8px 0 var(--line)}
.nav-btn{flex:1;flex-direction:column;gap:3px;padding:2px;border-radius:12px;color:var(--muted);font-size:10px;font-weight:700}
.nav-ico{display:flex;width:40px;height:40px;border-radius:50%;background:#2a3670;border:3px solid #3a4a8a;align-items:center;justify-content:center;font-size:19px;font-style:normal}
.nav-btn[data-nav="entry"] .nav-ico::before{content:"🏠"}.nav-btn[data-nav="lobby"] .nav-ico::before{content:"🛰️"}.nav-btn[data-nav="rank"] .nav-ico::before{content:"🏆"}
.nav-btn[data-nav="profile"] .nav-ico::before{content:"👤"}.nav-btn[data-nav="shop"] .nav-ico::before{content:"🛍️"}.nav-btn[data-nav="prefs"] .nav-ico::before{content:"⚙️"}
.nav-btn.on{color:var(--accent)}
.nav-btn.on .nav-ico{background:var(--accent);border-color:#fff5c2}
th{font-size:11px;color:var(--muted);border-bottom:3px solid var(--line);text-transform:uppercase}
td{font-size:13px;border-bottom:2px solid rgba(20,16,38,.35)}
#toast{background:var(--accent);border:3px solid var(--line);border-radius:999px;color:var(--line);font-size:13px;box-shadow:4px 4px 0 var(--line)}
/* gaveta: no desktop/paisagem toda tela entra pela direita, altura inteira, com o mundo à vista à esquerda (retrato volta a folha em MOBILE) */
.screen{background:rgba(20,16,38,.22);padding:0;overflow:hidden}
.screen.on{display:block}
.screen .wrap{position:absolute;left:auto;right:0;top:0;bottom:0;transform:none;width:min(480px,100%);height:100%;max-height:none;overflow:auto;border-radius:24px 0 0 24px;
  background:var(--surface);border:5px solid var(--line);border-right:0;padding:0 16px 0 22px;gap:12px;display:flex;flex-direction:column;box-shadow:-10px 0 40px rgba(0,0,0,.45)}
.screen .wrap>*{grid-area:auto;flex:none}
.screen .wrap::before{display:none}
.screen::after{content:"";position:absolute;right:calc(min(480px,100%) - 19px);top:50%;width:8px;height:64px;margin-top:-32px;border-radius:99px;background:var(--line);z-index:11;pointer-events:none}
#s-entry::after{display:none}
/* ── HUD ── */
#hud-top{left:50%;top:12px;transform:translateX(-50%);gap:8px}
#hud-top .chip{background:var(--surface);border:3px solid var(--line);border-radius:999px;padding:4px 12px;font-size:12px;color:#fff;box-shadow:3px 3px 0 var(--line)}
#hud-top .chip i{color:var(--muted);font-size:10px;text-transform:uppercase}
#h-exit{background:var(--accent2);border-radius:999px}
#hud-lb{left:12px;right:auto;top:auto;bottom:12px;min-width:0;background:transparent;border:0;box-shadow:none;padding:0}
#hud-lb .ph{display:none}
#lb-rows{display:flex;flex-direction:column;gap:9px;align-items:flex-start;padding-left:8px}
.lb-row{position:relative;background:var(--surface);border:3px solid var(--line);border-radius:14px;padding:5px 12px 5px 6px;gap:8px;color:#fff;font-size:13px;box-shadow:3px 3px 0 var(--line);min-width:172px;max-width:240px}
.lb-row::after{content:"";position:absolute;left:-9px;top:9px;width:10px;height:10px;background:inherit;border-left:3px solid var(--line);border-bottom:3px solid var(--line);transform:rotate(45deg)}
.lb-row:nth-child(n+11):not(.mine){display:none}
.lb-pos{flex:none;width:24px;min-width:24px;height:24px;border-radius:50%;background:#8fa0d8;color:var(--line);display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid var(--line)}
.lb-row:nth-child(1){font-size:15px;min-width:204px}
.lb-row:nth-child(2){min-width:188px}
.lb-row:nth-child(1) .lb-pos{background:var(--accent)}.lb-row:nth-child(2) .lb-pos{background:#e2e6f5}.lb-row:nth-child(3) .lb-pos{background:#d0905c}
.lb-row.mine{background:var(--accent);color:var(--line)}
.lb-row.mine .lb-pos{background:#fff}
.lb-val{color:var(--ok)}.lb-row.mine .lb-val{color:var(--line)}
#hud-score{left:12px;top:12px;bottom:auto;min-width:0;background:var(--accent);border:4px solid var(--line);border-radius:18px;padding:8px 14px;color:var(--line);box-shadow:4px 4px 0 var(--line)}
.score-big{font-size:30px;text-shadow:2px 2px 0 rgba(255,255,255,.45)}
.score-sub{font-size:10px;letter-spacing:2px;margin-bottom:5px}
.score-row{font-size:12px}.score-row .k{font-size:10px;opacity:.7;text-transform:uppercase}
#hud-status{left:50%;bottom:16px;transform:translateX(-50%);flex-direction:row;align-items:center;gap:8px}
#hud-ammo{background:var(--accent2);border:3px solid var(--line);border-radius:999px;padding:5px 12px;font-size:13px;color:#fff;box-shadow:3px 3px 0 var(--line)}
#hud-ammo span{font-size:10px;text-transform:uppercase;opacity:.85}
#hud-ammo.empty{background:#4a5170;color:#aab0c8}
.pw{background:var(--surface);border:3px solid var(--line);border-radius:999px;padding:4px 10px;font-size:11px;color:#fff;box-shadow:3px 3px 0 var(--line)}
.pw-speed{background:#c9a025}.pw-magnet{background:#8a3fc0}.pw-shield{background:#1f8fc0}
#hud-cd{display:none}
#touch{display:flex;bottom:16px;right:16px;gap:12px}
.tbtn{position:relative;width:72px;height:72px;border:4px solid var(--line);box-shadow:4px 4px 0 var(--line);color:var(--line);font-weight:700;gap:0;transition:transform .05s,box-shadow .05s}
.tbtn::before{font-size:24px;line-height:1}
#t-split{background:#3fc4ff}#t-split::before{content:"✂️"}
#t-eject{background:var(--ok)}#t-eject::before{content:"💨"}
#t-fire{background:var(--accent2)}#t-fire::before{content:"🚀"}
.tbtn span{font-size:9px;letter-spacing:.5px}
.tbtn b{position:absolute;top:-7px;right:-7px;width:24px;height:24px;border-radius:50%;background:var(--accent);border:3px solid var(--line);font-size:11px;display:flex;align-items:center;justify-content:center}
.tbtn:active{transform:translate(4px,4px);box-shadow:none}
.tbtn.cd,#t-fire.empty{opacity:1;background:#4a5170;color:#9aa0b8;box-shadow:none;transform:translate(4px,4px)}
.tbtn.cd::before,#t-fire.empty::before{filter:grayscale(1);opacity:.5}
/* ── ENTRADA ── */
#s-entry{background:rgba(20,16,38,.12)}
#s-entry .entry-wrap{position:absolute;inset:0;left:0;right:0;bottom:0;transform:none;width:100%;height:100%;max-height:none;border:0;border-radius:0;background:transparent;box-shadow:none;padding:0;overflow:hidden;
  display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:0}
#s-entry .entry-wrap::before{display:none}
.brand-block{padding-top:8vh;gap:8px}
.brand{font-size:56px;color:var(--accent);text-shadow:4px 4px 0 var(--line);letter-spacing:1px;transform:rotate(-3deg);line-height:1.1}
.tagline{font-size:13px;color:var(--text);background:var(--line);padding:4px 14px;border-radius:999px;border:3px solid var(--accent2)}
.entry-main{background:transparent;border:0;box-shadow:none;padding:0 16px 22px;width:min(440px,100%);gap:12px}
.entry-main .coinbar{position:absolute;top:14px;right:14px}
.entry-main .field{order:2;align-items:center}
.entry-main .field input{border-radius:999px;text-align:center;max-width:320px}
.skinrow{order:1;background:var(--surface);border:4px solid var(--line);border-radius:999px;padding:5px 12px 5px 6px;width:auto;min-width:270px;box-shadow:4px 4px 0 var(--line)}
.skinrow canvas{width:56px;height:56px}
.skinmeta b{font-size:15px;color:#fff}.skinmeta i{font-style:normal;font-size:11px;text-transform:uppercase}
.entry-main .btn-primary{order:3;font-size:30px;padding:18px;border-radius:26px;border-width:5px;box-shadow:8px 8px 0 var(--line);transform:rotate(-1.5deg)}
.entry-main .btn-primary:active{transform:rotate(-1.5deg) translate(6px,6px);box-shadow:none}
/* ícones redondos: coluna vertical na borda direita (no retrato viram fileira, ver MOBILE) */
.entry-links{order:4;position:absolute;right:18px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;justify-content:center;gap:12px;width:auto}
.entry-links .btn-secondary{display:flex;flex-direction:column;align-items:center;gap:5px;width:66px;padding:0;background:none;border:0;box-shadow:none;font-size:10.5px;color:#fff;text-shadow:1px 1px 0 var(--line)}
.entry-links .btn-secondary::before{content:"";display:flex;align-items:center;justify-content:center;width:58px;height:58px;border-radius:50%;background:#3fc4ff;border:4px solid var(--line);box-shadow:4px 4px 0 var(--line);font-size:26px;transition:transform .05s,box-shadow .05s}
.entry-links [data-go="lobby"]::before{content:"🛰️";background:#3fc4ff}.entry-links [data-go="rank"]::before{content:"🏆";background:#ff6b4a}
.entry-links [data-go="profile"]::before{content:"👤";background:#3ddc5f}.entry-links [data-go="shop"]::before{content:"🛍️";background:#c56bff}.entry-links [data-go="prefs"]::before{content:"⚙️";background:#8fa0d8}
.entry-links .btn-secondary:hover{background:none}
.entry-links .btn-secondary:active{transform:none}
.entry-links .btn-secondary:active::before{transform:translate(4px,4px);box-shadow:none}
/* textos soltos sobre o céu claro: contorno de tinta nos 4 lados (como os rótulos do canvas) */
.guest-note{order:5;font-size:12px;color:#fff;text-shadow:1px 1px 0 var(--line),-1px -1px 0 var(--line),1px -1px 0 var(--line),-1px 1px 0 var(--line)}
.guest-note[data-kind="registered"] .gn-txt{color:var(--ok)}
.entry-main .hint{order:6;font-size:11px;text-align:center;color:#fff;text-shadow:1px 1px 0 var(--line),-1px -1px 0 var(--line),1px -1px 0 var(--line),-1px 1px 0 var(--line)}
.entry-links .btn-secondary,.entry-links .btn-secondary:hover{text-shadow:1px 1px 0 var(--line),-1px -1px 0 var(--line),1px -1px 0 var(--line),-1px 1px 0 var(--line)}
.entry-side{display:none}
/* ── CONTA ── */
.overlay{background:rgba(20,16,38,.45);padding:0;backdrop-filter:blur(2px)}
.modal{position:absolute;left:auto;right:0;top:0;bottom:0;transform:none;width:min(480px,100%);height:100%;max-height:none;overflow:auto;border-radius:24px 0 0 24px;border:5px solid var(--line);border-right:0;
  background:var(--surface);padding:24px 22px 24px 30px;justify-content:safe center;box-shadow:-10px 0 40px rgba(0,0,0,.45)}
.modal::before{content:"";position:absolute;left:6px;top:50%;width:8px;height:64px;margin-top:-32px;border-radius:99px;background:var(--line);flex:none}
.modal-title{font-size:24px;color:var(--accent);text-shadow:3px 3px 0 var(--line);text-align:center}
.tabs{gap:4px;padding:0 6px;border-bottom:4px solid var(--line)}
.tabs button{flex:1;padding:9px;font-size:13px;color:var(--muted);background:#1a2350;border:4px solid var(--line);border-bottom:0;border-radius:14px 14px 0 0;margin-bottom:-4px}
.tabs button.on{background:var(--accent);color:var(--line)}
.modal-actions button{flex:1;padding:12px;font-size:15px}
/* ── LOBBY ── */
.lobby-hero{order:50;position:sticky;bottom:74px;z-index:2;background:var(--surface);border:0;border-top:4px solid var(--line);border-radius:0;box-shadow:none;margin:auto -16px 0 -22px;padding:10px 16px 12px 22px;grid-template-columns:auto 1fr auto;gap:10px;grid-template-areas:"me input enter" "create play play"}
.lobby-wrap .nav{margin-top:4px}
.me-chip{grid-area:me;background:#1a2350;border:3px solid var(--line);border-radius:999px;padding:4px 14px 4px 5px;width:max-content;box-shadow:3px 3px 0 var(--line)}
.me-chip canvas{width:40px;height:40px}
.me-chip b{font-size:15px;color:#fff}.me-chip i{font-style:normal;font-size:10px;color:var(--muted);text-transform:uppercase}
.me-chip i[data-kind="registered"]{color:var(--ok)}
.code-row{display:contents}
.code-row input{grid-area:input;text-align:center;letter-spacing:3px;font-size:17px;padding:8px 6px;min-width:0}
.code-row .btn-secondary:first-of-type{grid-area:enter;width:auto;padding:8px 16px}
.code-row .btn-secondary:last-of-type{grid-area:create;background:var(--ok);padding:12px 14px;font-size:15px;white-space:nowrap}
.lobby-hero .btn-primary{grid-area:play;font-size:16px;padding:12px}
.lobby-hero .hint{display:none}
.room-list{background:transparent;border:0;box-shadow:none;padding:2px 0 0;gap:8px}
.room-row{background:#1a2350;border:3px solid var(--line);border-radius:12px;padding:6px 8px;grid-template-columns:70px 44px 1fr 44px 46px 78px;font-size:12.5px;color:#c7d2f0;box-shadow:3px 3px 0 var(--line)}
.room-row.head{background:transparent;border:0;box-shadow:none;padding:0 8px;font-size:10px;color:var(--muted);text-transform:uppercase}
.room-row.head .code{background:none;border:0;color:var(--muted);font-size:10px;padding:0;text-align:left;box-shadow:none}
.room-row .code{background:var(--accent);color:var(--line);border:3px solid var(--line);border-radius:8px;padding:3px 4px;text-align:center;font-size:13px;letter-spacing:1px}
.room-row .bar{background:var(--line);border-radius:4px;color:var(--ok);height:8px;border:1px solid var(--line)}
.room-row .btn-mini{background:var(--accent);padding:5px 10px}
.room-row.full{opacity:.5}
.lobby-side{display:none}
/* ── RANKING ── */
.toggles{flex-direction:column;gap:8px;align-items:stretch}
#rk-period button{flex:1;text-align:center}
#rk-metric{border:0;padding:0;gap:6px;justify-content:center}
#rk-metric button{border:3px solid var(--line);border-radius:999px;padding:5px 14px;font-size:11px;margin:0}
.rank-table{background:transparent;border:0;box-shadow:none;padding:0;max-height:none;overflow:visible}
#rk-table td{padding:7px 8px}
#rk-table tr.me td{background:var(--accent);color:var(--line)}
#rk-table tr.top1 .c-rank,#rk-table tr.top2 .c-rank,#rk-table tr.top3 .c-rank{font-size:0;text-align:center}
#rk-table tr.top1 .c-rank::before{content:"🥇";font-size:20px}#rk-table tr.top2 .c-rank::before{content:"🥈";font-size:20px}#rk-table tr.top3 .c-rank::before{content:"🥉";font-size:20px}
.c-delta.up{color:var(--ok)}.c-delta.down{color:var(--accent2)}
.rank-me{position:sticky;bottom:82px;z-index:2;background:var(--accent);color:var(--line);border-radius:999px;padding:8px 20px;justify-content:center;box-shadow:4px 4px 0 var(--line);margin:auto 0 8px}
.rank-wrap .nav{margin-top:4px}
.rank-me b{font-size:24px}
/* ── PERFIL ── */
.profile-head{background:transparent;border:0;box-shadow:none;padding:0;flex-wrap:wrap}
.profile-head canvas{width:80px;height:80px}
.pf-nick{font-size:24px;color:#fff;text-shadow:2px 2px 0 var(--line)}
.pf-kind{font-style:normal;font-size:11px;color:var(--muted);text-transform:uppercase}
.pf-kind[data-kind="registered"]{color:var(--ok)}
.pf-meta .coinbar{width:max-content}
.stat-cards{grid-template-columns:repeat(3,1fr);gap:12px 10px;padding:0 4px 4px 0}
.stat{padding:10px 6px;border-radius:18px;border:4px solid var(--line);background:#3fc4ff;color:var(--line);box-shadow:4px 4px 0 var(--line)}
.stat:nth-child(2){background:var(--accent);transform:rotate(1.5deg)}.stat:nth-child(3){background:var(--ok)}.stat:nth-child(4){background:#c56bff;transform:rotate(-1.5deg)}
.stat:nth-child(5){background:var(--accent2)}.stat:nth-child(6){background:#8fa0d8;transform:rotate(1deg)}
.stat b{font-size:22px;color:var(--line)}.stat i{font-style:normal;font-size:9.5px;font-weight:700;text-transform:uppercase;line-height:1.1}
.pf-hist{overflow-x:auto;padding:10px 12px}
#pf-table th{font-size:10px;padding:5px 6px}
#pf-table td{font-size:11.5px;padding:5px 6px;white-space:nowrap}
#pf-table th:nth-child(2),#pf-table td:nth-child(2),#pf-table th:nth-child(6),#pf-table td:nth-child(6){display:none}
.pf-hist td.cause{color:var(--muted)}.pf-hist td.cause.blackhole{color:#c56bff}.pf-hist td.cause i{font-style:normal;color:#fff}
.ach-grid{grid-template-columns:1fr}
.ach{padding:8px 10px;border:3px solid var(--line);border-radius:14px;background:#1a2350;opacity:.6}
.ach.done{opacity:1;background:#1f3d2a;border-color:var(--ok)}
.ach.secret{opacity:.4}
.ach b{font-size:13px;color:#fff}.ach i{font-size:11px;color:var(--muted)}
.ach-bar{background:var(--line);color:var(--accent);border-radius:4px;height:6px;margin-top:4px}
.ach.done .ach-bar{color:var(--ok)}
.ach-coins{font-style:normal;font-size:12px;color:var(--accent)}
/* ── LOJA ── */
.shop-eq{background:#1a2350;padding:10px 14px}
.shop-eq .badge{position:static;margin-left:auto}
.shop-eq .skinmeta b{font-size:16px}
.filters button{padding:6px 12px;border-radius:999px;border:3px solid var(--line);background:#1a2350;font-size:11px;color:var(--muted);font-weight:700}
.filters button.on{background:var(--rc,var(--accent));color:var(--line)}
.shop-grid{grid-template-columns:repeat(3,1fr);max-height:none;overflow:visible;gap:14px;padding:6px 6px 10px 2px}
.skin-card{background:#2a3670;border:4px solid var(--rc);border-radius:18px;color:var(--text);box-shadow:4px 4px 0 var(--line);padding:12px 6px 10px;transition:transform .1s}
.skin-card:nth-child(3n+1){transform:rotate(-1.5deg)}.skin-card:nth-child(3n){transform:rotate(1.5deg)}
.skin-card:hover{transform:translateY(-3px) rotate(0);background:#344080}
.skin-card.eq{background:var(--accent);color:var(--line);border-color:#fff}
.skin-card.eq i,.skin-card.eq em{color:var(--line)}
.skin-card.locked,.skin-card.secret{opacity:.55;filter:grayscale(.4)}.skin-card.poor em{color:var(--accent2)}
.skin-card b{font-size:12.5px}.skin-card i{font-style:normal;font-size:9.5px;color:var(--rc);text-transform:uppercase}
.skin-card em{font-style:normal;font-size:12px;color:var(--accent);font-weight:700}
.badge{background:var(--accent);color:var(--line);font-size:9px;font-weight:700;padding:3px 7px;border-radius:8px;border:2px solid var(--line)}
.shop-note{font-size:11px;padding-bottom:4px}
/* ── PREFS ── */
.pg{padding:10px 14px;background:#1a2350}
.pg h2{font-size:13px;color:var(--accent);text-shadow:2px 2px 0 var(--line);text-transform:uppercase;letter-spacing:1px}
.pref-row{border-bottom:2px solid rgba(20,16,38,.4);font-size:13px;padding:8px 0}
.pref-row:last-child{border-bottom:0}
.toggle{width:58px;height:32px;border-radius:16px;background:#4a5170;border:3px solid var(--line);color:#fff}
.toggle i{top:2px;left:2px;width:22px;height:22px;background:#fff;border:2px solid var(--line)}
.toggle[aria-checked="true"]{background:var(--ok)}
.toggle[aria-checked="true"] i{left:24px}
input[type=range]{accent-color:var(--accent)}
.prefs-foot{position:sticky;bottom:74px;z-index:2;background:var(--surface);margin:auto -16px 0 -22px;padding:10px 16px 12px 22px;border-top:4px solid var(--line)}
.prefs-wrap .nav{margin-top:4px}
.prefs-foot button{padding:10px 20px;font-size:14px}
/* ── MORTE ── */
#s-dead{background:transparent}   /* sem véu: a sala onde o jogador morreu tem que aparecer nítida atrás do card */
#s-dead .dead-card{position:absolute;left:auto;right:0;top:0;bottom:0;transform:none;width:min(480px,100%);height:100%;max-height:none;overflow:auto;border-radius:24px 0 0 24px;border:5px solid var(--line);border-right:0;
  background:#1a2350;padding:20px 20px 22px 28px;gap:10px;justify-content:safe center;box-shadow:-10px 0 40px rgba(0,0,0,.45)}
#s-dead .dead-card::before{content:"";position:absolute;left:6px;top:50%;width:8px;height:64px;margin-top:-32px;border-radius:99px;background:var(--line);flex:none}
.dead-icon{font-size:60px;line-height:1}
.dead-title{font-size:46px;color:var(--accent);text-shadow:4px 4px 0 var(--line);transform:rotate(-4deg);letter-spacing:1px;line-height:1}
.dead-sub{font-size:12px;color:#8fa0d8}
.dead-by{background:var(--line);border-radius:999px;padding:6px 20px}
.dead-by span{font-size:10px;color:#8fa0d8;letter-spacing:2px}.dead-by b{font-size:22px;color:var(--accent2)}
.dead-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;width:min(320px,100%);padding:4px 6px}
.dead-stats div{background:#3fc4ff;border:4px solid var(--line);border-radius:16px;padding:8px 10px;min-width:96px;color:var(--line);box-shadow:4px 4px 0 var(--line);transform:rotate(-2deg)}
.dead-stats div:nth-child(2){background:var(--accent);transform:rotate(2deg)}.dead-stats div:nth-child(3){background:var(--ok);transform:rotate(-1deg)}.dead-stats div:nth-child(4){background:#c56bff;transform:rotate(2deg)}
.dead-stats b{font-size:22px}.dead-stats i{font-style:normal;font-size:9.5px;text-transform:uppercase}
.dead-rank span{font-size:10px;color:#8fa0d8;letter-spacing:2px}.dead-rank b{font-size:18px;color:#fff}.dead-rank .arrow{color:var(--ok)}
.dead-actions{flex-direction:row}
.dead-actions .btn-primary{font-size:18px;padding:12px}
/* ── RECONN ── */
.modal.reconn{left:50%;right:auto;top:45%;bottom:auto;height:auto;transform:translate(-50%,-50%);width:min(340px,92%);max-height:none;overflow:visible;border-radius:28px;border:5px solid var(--line);background:var(--text);color:var(--line);padding:22px 22px 24px;justify-content:center;box-shadow:var(--shadow)}
.modal.reconn::before{display:none}
.modal.reconn::after{content:"";position:absolute;left:44px;bottom:-19px;width:26px;height:26px;background:var(--text);border-right:5px solid var(--line);border-bottom:5px solid var(--line);transform:rotate(45deg)}
.spinner{width:52px;height:52px;border:5px solid var(--line);border-top-color:var(--accent2)}
.rc-title{font-size:24px;color:var(--accent2);text-shadow:2px 2px 0 var(--line)}
.rc-title::before{content:"📡 "}
.rc-sub{font-size:13px;color:#3a4a8a}
.reconn .btn-secondary{width:auto;padding:10px 22px}
/* ── MOBILE ── */
body[data-mode="portrait"] .screen,body[data-mode="landscape"] .screen{padding:0}
/* retrato: de volta às folhas que sobem (gaveta só no desktop/paisagem) */
body[data-mode="portrait"] .screen .wrap{left:50%;right:auto;top:auto;bottom:0;transform:translateX(-50%);width:100%;height:auto;max-height:86%;border-radius:24px 24px 0 0;border-right:5px solid var(--line);border-bottom:0;padding:0 16px;box-shadow:0 -10px 40px rgba(0,0,0,.45)}
body[data-mode="portrait"] .screen .wrap::before{content:"";display:block;width:60px;height:8px;border-radius:99px;background:var(--line);margin:8px auto -4px;align-self:center;flex:none}
body[data-mode="portrait"] .screen::after{display:none}
body[data-mode="portrait"] .nav,body[data-mode="portrait"] .lobby-hero,body[data-mode="portrait"] .prefs-foot{margin-left:-16px}
body[data-mode="portrait"] .lobby-hero,body[data-mode="portrait"] .prefs-foot{padding-left:16px}
body[data-mode="portrait"] .modal{left:50%;right:auto;top:auto;bottom:0;transform:translateX(-50%);width:100%;height:auto;max-height:86%;border-radius:24px 24px 0 0;border-right:5px solid var(--line);border-bottom:0;padding:12px 18px 20px;justify-content:flex-start;box-shadow:0 -10px 40px rgba(0,0,0,.45)}
body[data-mode="portrait"] .modal::before{position:static;width:60px;height:8px;margin:0 auto 2px;align-self:center}
body[data-mode="portrait"] .modal.reconn{left:50%;right:auto;top:45%;bottom:auto;transform:translate(-50%,-50%);width:92%;height:auto;max-height:none;border-radius:28px;border:5px solid var(--line);padding:22px 22px 24px;justify-content:center;box-shadow:var(--shadow)}
body[data-mode="portrait"] .modal.reconn::before{display:none}
body[data-mode="portrait"] #s-dead .dead-card{left:50%;right:auto;top:auto;bottom:0;transform:translateX(-50%);width:100%;height:auto;max-height:90%;border-radius:24px 24px 0 0;border-right:5px solid var(--line);border-bottom:0;padding:10px 20px 22px;justify-content:flex-start;box-shadow:0 -10px 40px rgba(0,0,0,.45)}
body[data-mode="portrait"] #s-dead .dead-card::before{position:static;width:60px;height:8px;margin:0}
body[data-mode="portrait"] .brand{font-size:40px}
body[data-mode="portrait"] .tagline{font-size:11px}
body[data-mode="portrait"] .entry-main .btn-primary{font-size:26px;padding:16px}
body[data-mode="portrait"] .entry-main .hint{display:none}
body[data-mode="portrait"] .entry-links{position:static;transform:none;flex-direction:row;gap:6px;width:100%}
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
body[data-mode="portrait"] #hud-lb{top:12px;bottom:auto;left:12px}
body[data-mode="portrait"] #lb-rows{gap:7px}
body[data-mode="portrait"] .lb-row{font-size:11px;min-width:140px;max-width:180px;padding:3px 9px 3px 4px;gap:6px}
body[data-mode="portrait"] .lb-row:nth-child(1){font-size:12px;min-width:160px}
body[data-mode="portrait"] .lb-row:nth-child(2){min-width:150px}
body[data-mode="portrait"] .lb-pos{width:20px;min-width:20px;height:20px;font-size:10px}
body[data-mode="portrait"] #hud-lb .lb-row.mine,body[data-mode="landscape"] #hud-lb .lb-row.mine{display:flex}
body[data-mode="portrait"] #hud-score{padding:6px 10px;top:auto;bottom:12px}
body[data-mode="portrait"] .score-big{font-size:22px}
body[data-mode="portrait"] .score-row:nth-child(n+4){display:none}
body[data-mode="portrait"] #hud-status{left:12px;bottom:106px;transform:none;flex-direction:column;align-items:flex-start}
body[data-mode="portrait"] #touch{bottom:14px;right:12px;gap:8px}
body[data-mode="portrait"] .tbtn{width:66px;height:66px}
body[data-mode="landscape"] #s-entry .entry-wrap{flex-direction:row;justify-content:center;align-items:center;gap:26px;padding:0 96px 0 16px}
body[data-mode="landscape"] .brand-block{padding-top:0}
body[data-mode="landscape"] .brand{font-size:40px}
body[data-mode="landscape"] .entry-main{padding:0;width:360px;gap:8px}
body[data-mode="landscape"] .entry-main .btn-primary{font-size:22px;padding:12px}
body[data-mode="landscape"] .entry-main .hint,body[data-mode="landscape"] .entry-main .field label{display:none}
body[data-mode="landscape"] .entry-main .coinbar{right:auto;left:14px;top:10px;padding:3px 12px;font-size:13px}
body[data-mode="landscape"] .entry-links{right:12px;gap:4px}
body[data-mode="landscape"] .entry-links .btn-secondary{width:56px;gap:2px;font-size:9.5px}
body[data-mode="landscape"] .entry-links .btn-secondary::before{width:46px;height:46px;font-size:20px}
body[data-mode="landscape"] .skinrow canvas{width:44px;height:44px}
body[data-mode="landscape"] .sh .stitle{font-size:20px}
body[data-mode="landscape"] .nav{height:64px;padding-top:6px}
body[data-mode="landscape"] .nav-ico{width:34px;height:34px;font-size:16px}
body[data-mode="landscape"] .lobby-hero,body[data-mode="landscape"] .rank-me,body[data-mode="landscape"] .prefs-foot{bottom:64px}
body[data-mode="landscape"] .sh{padding:4px 0 6px}
body[data-mode="landscape"] .lobby-hero{padding:6px 16px 8px 22px;gap:6px 8px}
body[data-mode="landscape"] .me-chip{padding:2px 10px 2px 4px;gap:6px}
body[data-mode="landscape"] .me-chip canvas{width:30px;height:30px}
body[data-mode="landscape"] .me-chip b{font-size:13px}
body[data-mode="landscape"] .code-row input{padding:5px 6px;font-size:14px}
body[data-mode="landscape"] .code-row .btn-secondary:first-of-type{padding:6px 12px;font-size:13px}
body[data-mode="landscape"] .code-row .btn-secondary:last-of-type{padding:7px 10px;font-size:13px}
body[data-mode="landscape"] .lobby-hero .btn-primary{padding:7px;font-size:14px}
body[data-mode="landscape"] .rank-me{padding:5px 16px}
body[data-mode="landscape"] .rank-me b{font-size:18px}
body[data-mode="landscape"] .prefs-foot{padding:6px 16px 8px 22px}
body[data-mode="landscape"] .prefs-foot button{padding:7px 14px;font-size:13px}
body[data-mode="landscape"] #s-dead .dead-card{gap:6px;padding:12px 16px 12px 26px}
body[data-mode="landscape"] .dead-icon{font-size:30px}
body[data-mode="landscape"] .dead-title{font-size:28px}
body[data-mode="landscape"] .dead-by{padding:4px 16px}
body[data-mode="landscape"] .dead-stats{grid-template-columns:repeat(4,1fr);gap:8px;width:100%;padding:2px 4px}
body[data-mode="landscape"] .dead-stats div{min-width:0;padding:5px 3px}
body[data-mode="landscape"] .dead-stats b{font-size:16px}
body[data-mode="landscape"] .dead-stats i{font-size:8.5px}
body[data-mode="landscape"] .dead-by b{font-size:17px}
body[data-mode="landscape"] .dead-rank b{font-size:15px}
body[data-mode="landscape"] .dead-actions .btn-primary{font-size:15px;padding:8px}
body[data-mode="landscape"] .dead-actions .btn-secondary{padding:8px}
body[data-mode="landscape"] .modal{padding:14px 18px 14px 26px;gap:7px}
body[data-mode="landscape"] .modal-title{font-size:20px}
body[data-mode="landscape"] .modal .field input{padding:6px 10px;font-size:14px}
body[data-mode="landscape"] .modal .field{gap:2px}
body[data-mode="landscape"] .modal-actions button{padding:8px;font-size:14px}
body[data-mode="landscape"] .modal .tab.on{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px}
body[data-mode="landscape"] .modal .tab .hint,body[data-mode="landscape"] .modal .modal-actions{grid-column:1/-1}
body[data-mode="landscape"] #hud-top{top:10px}
body[data-mode="landscape"] #lb-rows{gap:6px}
body[data-mode="landscape"] .lb-row{font-size:11px;min-width:140px;padding:3px 9px 3px 4px;gap:6px}
body[data-mode="landscape"] .lb-row:nth-child(1){font-size:12px;min-width:160px}
body[data-mode="landscape"] .lb-row:nth-child(2){min-width:150px}
body[data-mode="landscape"] .lb-pos{width:20px;min-width:20px;height:20px;font-size:10px}
body[data-mode="landscape"] #hud-score{padding:6px 10px}
body[data-mode="landscape"] .score-big{font-size:22px}
body[data-mode="landscape"] .score-row:nth-child(n+4){display:none}
body[data-mode="landscape"] #hud-status{left:50%;bottom:14px;transform:translateX(-50%)}
body[data-mode="landscape"] #touch{gap:8px;bottom:12px}
body[data-mode="landscape"] .tbtn{width:60px;height:60px}
`};
})();

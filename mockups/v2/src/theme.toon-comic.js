// ── MODELO 4C — CARTOON HQ ────────────────────────────────────────────────────
// Variação "gibi de banca" do Cartoon Cósmico: papel envelhecido com retícula
// (halftone) ciano/magenta, tinta PRETA de verdade em todo contorno, cores
// primárias chapadas e sombra em RETÍCULA nos planetas (pontos no lugar do
// crescente escuro). Tudo é um quadrinho: folhas e cartões com filete duplo,
// títulos em caixa de legenda amarela inclinada, pódio em legendas, placar em
// balão de fala, radar em painel quadrado, onomatopeias gigantes (POW! BOOM!
// KABOOM! CRASH!) e morte com "CONTINUA…". Mesma estrutura do modelo escolhido:
// mundo sempre visível, menus em folha, JOGAR gigante, ícones redondos e três
// botões de toque sempre à mão.
// Desempenho: mesma receita — sprites assados por (skin, tier), fx = arcs/lines
// + um texto, fundo (papel + retícula) em cache por resolução.
(function(){
const u=MOCK.u,WW=u.WW,WH=u.WH,sh=u.sh,rgba=u.rgba;
const INK="#111111",PAPER="#f6e7c8",WHITE="#fff8e6",RED="#e8272b",YEL="#ffd52b",BLU="#2b6fe8",MAG="#e83f9a",GRN="#2fbf5f",CYN="#3ec8e8";
const FONT="'Trebuchet MS',Verdana,sans-serif",DISP="Impact,'Arial Black','Arial Narrow','Liberation Sans Narrow',sans-serif",T=900;
let L=[],BIG=null,PROPS=[],bg=null,bgW=0,bgH=0;

// texto de HQ: Impact sem negrito sintético, contorno de tinta (um texto por efeito)
function pow(c,s,x,y,size,fill,rot){c.save();c.translate(x,y);if(rot)c.rotate(rot);c.font=`900 ${size}px ${DISP}`;c.textAlign="center";c.textBaseline="middle";c.lineJoin="round";
  c.strokeStyle=INK;c.lineWidth=Math.max(2,size*.18);c.strokeText(s,0,0);c.fillStyle=fill;c.fillText(s,0,0);c.restore();}
// retícula: pontos que crescem conforme se afastam da luz (lx,ly). SÓ dentro de sprite.
function halftone(c,r,lx,ly,step,col,k0){c.fillStyle=col;const n=Math.ceil(r/step)+1;k0=k0==null?.75:k0;
  for(let j=-n;j<=n;j++)for(let i=-n;i<=n;i++){const x=i*step+(j&1?step/2:0),y=j*step*.87;if(x*x+y*y>r*r)continue;
    const k=(Math.hypot(x-lx,y-ly)/r-k0)/.95;if(k<=0)continue;const d=Math.min(step*.48,step*.6*k);c.beginPath();c.arc(x,y,d,0,6.283);c.fill();}}

// ── sprites ───────────────────────────────────────────────────────────────────
const PK=sk=>sk.ring?2.05:1.3;
function planetSpr(sk,isMe,size){return u.sprite("tqp"+sk.id+(isMe?"m":"")+size,size,(c,R)=>{
  const K=PK(sk),r=R/K,col=sk.color,lw=Math.max(2.5,r*.1);c.lineJoin="round";c.lineCap="round";
  const band=(a0,a1)=>{c.beginPath();c.ellipse(0,0,r*1.85,r*.56,0,a0,a1,false);c.ellipse(0,0,r*1.3,r*.39,0,a1,a0,true);c.closePath();c.fill();c.stroke();};
  if(sk.ring){c.fillStyle=sh(col,.35);c.strokeStyle=INK;c.lineWidth=lw*.7;band(Math.PI,Math.PI*2);}
  c.fillStyle=col;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
  c.save();c.beginPath();c.arc(0,0,r,0,6.283);c.clip();
  halftone(c,r,-r*.45,-r*.45,Math.max(3.5,r*.13),"rgba(17,17,17,.5)");
  c.fillStyle="rgba(255,255,255,.85)";c.beginPath();c.ellipse(-r*.36,-r*.4,r*.3,r*.17,-.75,0,6.283);c.fill();
  c.beginPath();c.arc(-r*.1,-r*.62,r*.07,0,6.283);c.fill();
  c.globalAlpha=.15;c.font=`${r*1.3}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(sk.emoji,r*.05,r*.15);c.globalAlpha=1;
  c.restore();
  if(sk.ring){c.fillStyle=sh(col,.35);c.strokeStyle=INK;c.lineWidth=lw*.7;band(0,Math.PI);}
  c.strokeStyle=INK;c.lineWidth=lw;c.beginPath();c.arc(0,0,r,0,6.283);c.stroke();
  if(isMe){c.strokeStyle=WHITE;c.lineWidth=lw*.8;c.beginPath();c.arc(0,0,r+lw*1.2,0,6.283);c.stroke();
    c.strokeStyle=INK;c.lineWidth=lw*.5;c.beginPath();c.arc(0,0,r+lw*1.85,0,6.283);c.stroke();}});}

const FK=2.1,FICON={missile_ammo:"🚀",powerup_speed:"⚡",powerup_magnet:"🧲",powerup_shield:"🛡️"};
function foodSpr(f){return u.sprite("tqf"+f.type+f.color,64,(c,R)=>{const r=R/FK;c.lineJoin="round";c.strokeStyle=INK;c.lineWidth=Math.max(2,r*.24);c.fillStyle=f.color;
  const gl=(x,y,k)=>{c.fillStyle="rgba(255,255,255,.9)";c.beginPath();c.arc(x,y,r*k,0,6.283);c.fill();};
  if(FICON[f.type]){c.fillStyle=WHITE;c.beginPath();c.arc(0,0,r*1.5,0,6.283);c.fill();c.stroke();c.font=`${r*1.5}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(FICON[f.type],0,r*.1);return;}
  if(f.type==="star"){u.spikes(c,r*1.6,4,.42,-1.5708);c.fill();c.stroke();gl(-r*.2,-r*.25,.2);return;}
  if(f.type==="comet"){c.beginPath();c.moveTo(-r*2,0);c.lineTo(-r*.15,-r*.8);c.arc(0,0,r*.85,-1.4,1.4);c.lineTo(-r*.15,r*.8);c.closePath();c.fill();c.stroke();gl(-r*.2,-r*.3,.25);return;}
  if(f.type==="rock"){c.rotate(.45);u.rr(c,-r,-r,r*2,r*2,r*.2);c.fill();c.stroke();gl(-r*.4,-r*.4,.24);return;}
  c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.stroke();gl(-r*.3,-r*.32,.26);});}

const EK=1.5;
const ejSpr=col=>u.sprite("tqe"+col,40,(c,R)=>{const r=R/EK;c.fillStyle=col;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(2,r*.22);c.stroke();
  c.fillStyle="rgba(255,255,255,.9)";c.beginPath();c.arc(-r*.3,-r*.32,r*.24,0,6.283);c.fill();});

// estrelas de 4 pontas, brancas com contorno de tinta (0 = reta, 1 = 45°, 2 = miúda com traço grosso) e planetas de cenário "Ben-Day"
const starSpr=v=>u.sprite("tqstar"+v,32,(c,R)=>{c.lineJoin="round";u.spikes(c,R*.86,4,v===1?.32:.4,v===1?-.785:-1.5708);c.fillStyle=WHITE;c.fill();c.strokeStyle=INK;c.lineWidth=v===2?4.5:2.6;c.stroke();});
function propSpr(p,i){return u.sprite("tqprop"+i,256,(c,R)=>{const K=p.ring?2:1.2,r=R/K;c.lineJoin="round";
  if(p.ring){c.fillStyle=sh(p.col,.3);c.strokeStyle=INK;c.lineWidth=r*.06;c.beginPath();c.ellipse(0,0,r*1.8,r*.5,-.35,0,6.283);c.ellipse(0,0,r*1.35,r*.36,-.35,6.283,0,true);c.fill("evenodd");c.stroke();}
  c.fillStyle=sh(p.col,.3);c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
  c.save();c.clip();halftone(c,r,-r*.5,-r*.5,r*.1,sh(p.col,-.15),.25);
  c.fillStyle="rgba(255,255,255,.7)";c.beginPath();c.ellipse(-r*.32,-r*.34,r*.36,r*.18,-.7,0,6.283);c.fill();c.restore();
  c.strokeStyle=INK;c.lineWidth=r*.07;c.beginPath();c.arc(0,0,r,0,6.283);c.stroke();});}

// asteroide: cinza chapado, hachura cruzada de tinta na metade sombreada, 3 crateras (3 variantes × tier)
const AK=1.3;
function astSpr(variant,size){return u.sprite("tqa"+variant+size,size,(c,R)=>{const r=R/AK,seed=11+variant*7,n=9+variant*2;c.lineJoin="round";c.lineCap="round";
  c.fillStyle="#b9b1a4";u.astPoly(c,r,seed,n);c.fill();
  c.save();c.clip();c.strokeStyle="rgba(17,17,17,.45)";c.lineWidth=Math.max(1,r*.03);const st=Math.max(4,r*.15);c.beginPath();
  for(let d=r*.25;d<r*2.4;d+=st){c.moveTo(-r*1.5,d+r*1.5);c.lineTo(r*1.5,d-r*1.5);}
  for(let e=-r*2;e<r*2;e+=st){c.moveTo((e+r*.95)/2,(r*.95-e)/2);c.lineTo((e+r*2.6)/2,(r*2.6-e)/2);}c.stroke();
  c.fillStyle="rgba(255,255,255,.5)";c.beginPath();c.ellipse(-r*.35,-r*.4,r*.32,r*.17,-.7,0,6.283);c.fill();c.restore();
  const cr=u.mulberry(seed*3);for(let i=0;i<3;i++){const a=cr()*6.28,d=cr()*r*.5,c2=r*(.12+cr()*.14);
    c.fillStyle="#7d756a";c.beginPath();c.arc(Math.cos(a)*d,Math.sin(a)*d,c2,0,6.283);c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(1.5,r*.045);c.stroke();}
  u.astPoly(c,r,seed,n);c.strokeStyle=INK;c.lineWidth=Math.max(3,r*.1);c.stroke();});}

// buraco negro: disco de tinta com espiral branca ("linhas de velocidade"), anel magenta e riscos de sucção (1 sprite, girado por h.spin)
const BK=2.4;
const bhSpr=()=>u.sprite("tqbh",256,(c,R)=>{const r=R/BK;c.lineJoin="round";c.lineCap="round";
  for(let i=0;i<12;i++){const a=i/12*6.283+.3,o=(i%2)*.3;c.strokeStyle=i%3?INK:MAG;c.lineWidth=r*.08;c.beginPath();c.moveTo(Math.cos(a)*r*1.52,Math.sin(a)*r*1.52);c.lineTo(Math.cos(a+.22)*r*(2.05+o),Math.sin(a+.22)*r*(2.05+o));c.stroke();}
  c.fillStyle=INK;c.beginPath();c.arc(0,0,r*1.36,0,6.283);c.fill();
  c.strokeStyle=MAG;c.lineWidth=r*.13;c.beginPath();c.arc(0,0,r*1.2,0,6.283);c.stroke();
  c.strokeStyle=WHITE;c.lineWidth=r*.09;c.beginPath();for(let i=0;i<=90;i++){const k=i/90,a=k*6.283*2.2,rr=r*.12+k*r*.92;i?c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.stroke();
  c.strokeStyle=MAG;c.lineWidth=r*.06;c.beginPath();c.arc(0,0,r*.3,0,6.283);c.stroke();});

window.THEME={
id:"toon-comic",name:"Cartoon HQ",
desc:"O Cartoon Cósmico impresso em gibi de banca: papel envelhecido com retícula ciano/magenta, tinta preta em todo contorno, cores primárias chapadas e sombra em pontinhos nos planetas. Cada tela é um quadrinho com filete duplo: título em legenda amarela inclinada, pódio em caixas de legenda, placar em balão de fala, radar em painel quadrado e onomatopeias gigantes (POW! KABOOM!). A morte termina em CONTINUA…",
tags:["gibi","papel","retícula","cartoon"],swatch:["#ffd52b","#e8272b"],
tokens:{bg:"#f6e7c8",surface:"#fff8e6",text:"#111111",muted:"#6b6257",accent:"#e8272b",accent2:"#ffd52b",danger:"#d0141a",ok:"#2fbf5f",
  line:"#111111",radius:"8px",radiusLg:"12px",space:"14px",fontUi:"'Trebuchet MS',Verdana,sans-serif",fontMono:"'Courier New',Courier,monospace",
  shadow:"6px 6px 0 #111111"},
layout:{hud:"panels",nav:"sheet"},
rarityColor:{free:"#8a8177",common:"#2b6fe8",rare:"#e83f9a",epic:"#7a2fd6",legendary:"#b8730a",earned:"#178a3f",secret:"#e85a1a"},
labels:{title:"WARSPACE.IO",tagline:"Conquiste a galáxia. Divida, ejete e devore!",play:"🚀 JOGAR!",playAuto:"🚀 JOGAR (AUTO)",lbTitle:"PÓDIO",
  dead:"KABOOM!",deadIcon:"💥",deadSub:"CONTINUA NA PRÓXIMA EDIÇÃO…",respawn:"🔄 DE NOVO!",reconnTitle:"SINAL FRACO!",reconnSub:"Procurando o satélite… tentativa {n}/5",
  back:"◄",create:"➕ Criar sala",top5:"TOP 5 HOJE"},

init(g){const rand=u.mulberry(21);
  L=[.2,.45].map((f,li)=>({f,stars:Array.from({length:li?50:80},()=>({x:rand()*T,y:rand()*T,s:li?7+rand()*4:1.5+rand()*1.2,a:+(.25+rand()*.35).toFixed(2)}))}));
  BIG={f:.7,stars:Array.from({length:22},()=>({x:rand()*T,y:rand()*T,s:14+rand()*12,v:rand()<.5?1:0}))};
  PROPS=[];const pal=[BLU,RED,YEL,MAG,CYN];
  for(let i=0;i<10;i++)PROPS.push({x:200+rand()*(WW-400),y:200+rand()*(WH-400),r:80+rand()*120,col:pal[i%5],ring:rand()<.4});},

drawBg(c,W,H,cam,t,g){
  if(!bg||bgW!==W||bgH!==H){bgW=W;bgH=H;bg=document.createElement("canvas");bg.width=W;bg.height=H;const x=bg.getContext("2d");
    x.fillStyle=PAPER;x.fillRect(0,0,W,H);
    const rand=u.mulberry(5),D=Math.max(W,H);
    x.fillStyle="rgba(120,80,20,.04)";for(let i=0;i<6;i++){x.beginPath();x.arc(rand()*W,rand()*H,(.08+rand()*.2)*D,0,6.283);x.fill();}   // manchas de papel velho
    x.fillStyle="rgba(43,111,232,.24)";for(let i=0;i<5;i++){const cx=rand()*W,cy=rand()*H,cr=(.1+rand()*.17)*D;                           // círculos Ben-Day: só pontos azuis, na mesma grade de 7px da retícula
      for(let px=Math.floor((cx-cr)/7)*7;px<cx+cr;px+=7)for(let py=Math.floor((cy-cr)/7)*7;py<cy+cr;py+=7){const dx=px-cx,dy=py-cy;if(dx*dx+dy*dy<cr*cr)x.fillRect(px,py,2.6,2.6);}}
    x.fillStyle="rgba(62,200,232,.22)";for(let px=0;px<W;px+=7)for(let py=0;py<H;py+=7)x.fillRect(px,py,2,2);                             // retícula ciano
    x.fillStyle="rgba(232,63,154,.15)";for(let px=3.5;px<W;px+=7)for(let py=3.5;py<H;py+=7)x.fillRect(px,py,2,2);}                        // retícula magenta (fora de registro)
  c.drawImage(bg,0,0);
  if(g&&g.prefs&&!g.prefs.parallax)return;
  const sm=starSpr(2);
  L.forEach((l,li)=>{const ox=((-cam.x*l.f*cam.scale)%T+T)%T,oy=((-cam.y*l.f*cam.scale)%T+T)%T;
    if(li){l.stars.forEach(s=>{const bx=(s.x+ox)%T,by=(s.y+oy)%T,h=s.s/2;for(let x=bx;x<W;x+=T)for(let y=by;y<H;y+=T)c.drawImage(sm,x-h,y-h,s.s,s.s);});return;}
    c.fillStyle=INK;l.stars.forEach(s=>{c.globalAlpha=s.a;const bx=(s.x+ox)%T,by=(s.y+oy)%T;for(let x=bx;x<W;x+=T)for(let y=by;y<H;y+=T)c.fillRect(x,y,s.s,s.s);});c.globalAlpha=1;});
  const l=BIG,ox=((-cam.x*l.f*cam.scale)%T+T)%T,oy=((-cam.y*l.f*cam.scale)%T+T)%T,sp=[starSpr(0),starSpr(1)];
  l.stars.forEach(s=>{const bx=(s.x+ox)%T,by=(s.y+oy)%T,h=s.s/2;for(let x=bx;x<W;x+=T)for(let y=by;y<H;y+=T)c.drawImage(sp[s.v],x-h,y-h,s.s,s.s);});},

drawWorld(c,cam,t,g,W,H){
  const hw=W/(2*cam.scale),hh=H/(2*cam.scale);c.globalAlpha=.45;
  PROPS.forEach((p,i)=>{const R=p.r*(p.ring?2:1.2);if(Math.abs(p.x-cam.x)>hw+R||Math.abs(p.y-cam.y)>hh+R)return;c.drawImage(propSpr(p,i),p.x-R,p.y-R,R*2,R*2);});
  c.globalAlpha=1;
  if(!g||!g.prefs||g.prefs.grid)u.grid(c,150,"rgba(17,17,17,.1)",1.5);   // lápis
  c.strokeStyle=INK;c.lineWidth=26;c.strokeRect(0,0,WW,WH);                 // borda do quadrinho
  c.lineWidth=4;c.strokeRect(24,24,WW-48,WH-48);},                          // filete duplo

drawFood(c,f,t){const p=f.type==="star"?1+Math.sin(t*.003+f.seed)*.14:1,r=f.r*FK*p,s=foodSpr(f);
  if(f.type==="rock"||f.type==="comet"){c.save();c.translate(f.x,f.y);c.rotate(f.seed);c.drawImage(s,-r,-r,r*2,r*2);c.restore();return;}
  const bob=FICON[f.type]?Math.sin(t*.005+f.seed)*3:0;c.drawImage(s,f.x-r,f.y-r+bob,r*2,r*2);},
drawEjected(c,e){const r=e.r*EK;c.drawImage(ejSpr(e.color),e.x-r,e.y-r,r*2,r*2);},

drawAsteroid(c,a,t){const r=a.r*AK;c.save();c.translate(a.x,a.y);c.rotate(a.rot);c.drawImage(astSpr(a.variant,u.tier(a.r)),-r,-r,r*2,r*2);c.restore();},

drawBlackHole(c,h,t){const k=h.k,rc=h.rc*k,ri=h.ri*k;
  c.strokeStyle=rgba(MAG,.35+.12*Math.sin(t*.004));c.lineWidth=3;c.setLineDash([14,18]);c.beginPath();c.arc(h.x,h.y,ri,-h.spin*.4,-h.spin*.4+6.283);c.stroke();c.setLineDash([]);
  const R=rc*BK;c.save();c.translate(h.x,h.y);c.rotate(h.spin);c.globalAlpha=Math.min(1,k*1.2);c.drawImage(bhSpr(),-R,-R,R*2,R*2);c.restore();c.globalAlpha=1;},

// rastro = linhas de velocidade de tinta (uma stroke tracejada)
drawTrail(c,pc,p,isMe){if(!u.trailPath(c,pc))return;
  c.strokeStyle=`rgba(17,17,17,${isMe?.5:.3})`;c.lineWidth=Math.max(2,pc.r*.18);c.lineCap="butt";c.lineJoin="round";
  c.setLineDash([pc.r*.4,pc.r*.3]);c.stroke();c.setLineDash([]);},

drawMissile(c,m,t){c.lineJoin="round";
  m.trail.forEach((pt,i)=>{if(i%2)return;const a=i/m.trail.length;c.fillStyle=`rgba(17,17,17,${a*.3})`;c.beginPath();c.arc(pt.x,pt.y,m.r*.7*a,0,6.283);c.fill();});
  c.save();c.translate(m.x,m.y);c.rotate(Math.atan2(m.vy,m.vx));const r=m.r,fl=1+.25*Math.sin(t*.05);
  c.strokeStyle=INK;c.lineWidth=2.6;c.fillStyle=YEL;c.beginPath();c.moveTo(-r*1.1,0);c.lineTo(-r*2.4*fl,-r*.6);c.lineTo(-r*2*fl,0);c.lineTo(-r*2.4*fl,r*.6);c.closePath();c.fill();c.stroke();
  c.fillStyle=RED;
  c.beginPath();c.moveTo(r*1.6,0);c.quadraticCurveTo(r*.6,-r*.95,-r*.9,-r*.7);c.lineTo(-r*1.3,-r*1.1);c.lineTo(-r*1.3,r*1.1);c.lineTo(-r*.9,r*.7);c.quadraticCurveTo(r*.6,r*.95,r*1.6,0);c.closePath();c.fill();c.stroke();
  c.fillStyle=BLU;c.beginPath();c.arc(r*.25,0,r*.36,0,6.283);c.fill();c.stroke();c.restore();},

drawCell(c,pc,p,isMe,t,prev,g){const r=pc.displayR||pc.r,sk=p.skin,d=r*PK(sk),pr=(g&&g.prefs)||{names:true,mass:true};
  c.drawImage(planetSpr(sk,isMe,u.tier(r)),pc.x-d,pc.y-d,d*2,d*2);
  c.save();c.translate(pc.x,pc.y);c.lineCap="round";
  if(pc.mergeTimer>0){c.strokeStyle=RED;c.lineWidth=Math.max(3,r*.08);c.beginPath();c.arc(0,0,r*1.18,-1.5708,-1.5708+(1-pc.mergeTimer/u.mergeTime(pc.r))*6.283);c.stroke();}
  const pw=Object.keys(p._powerups||{});
  if(pw.length){const cl={speed:YEL,magnet:MAG,shield:BLU};
    pw.forEach((k,i)=>{const a0=t*.001*(i%2?-1:1);c.strokeStyle=cl[k];c.lineWidth=Math.max(3,r*.08);c.globalAlpha=.7+.3*Math.sin(t*.012+i);
      c.setLineDash([r*.4,r*.3]);c.beginPath();c.arc(0,0,r*(1.3+i*.16),a0,a0+6.283);c.stroke();c.setLineDash([]);c.globalAlpha=1;});}
  if(!prev&&r>13){const fs=Math.max(12,r*.34);
    if(pr.names!==false)u.outText(c,p.name+(p.registered?" ✓":""),0,pr.mass!==false?-fs*.28:0,fs,"#fff",INK,FONT);
    if(pr.mass!==false)u.outText(c,u.fmt(pc.r*pc.r),0,pr.names!==false?fs*.8:0,fs*.68,YEL,INK,FONT);}
  c.restore();},

// onomatopeias: explosão amarela/vermelha de tinta + UM texto em Impact
drawFx(c,f,t){const k=f.age/f.ttl,a=1-k;c.lineJoin="round";c.lineCap="round";
  switch(f.t){
    case "bounce":{const s=f.r*(.7+k*.3)*(.6+(f.power||1)*.5);c.save();c.translate(f.x,f.y);c.rotate(f.nx*.6);
      u.spikes(c,s,8,.55,0);c.fillStyle=YEL;c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(2,s*.08);c.stroke();
      pow(c,"POW!",0,0,Math.max(11,s*.55),"#fff",-.12);c.restore();break;}
    case "pop":{const s=f.r*(1+k*.8);c.save();c.translate(f.x,f.y);c.globalAlpha=Math.min(1,a*1.5);
      u.spikes(c,s,10,.5,k*.6);c.fillStyle=RED;c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(2,s*.06);c.stroke();
      pow(c,"BOOM!",0,0,Math.max(11,s*.46),YEL,.1);c.restore();break;}
    case "boom":{const s=f.r*(.8+k*1.2);c.save();c.translate(f.x,f.y);c.globalAlpha=Math.min(1,a*1.5);
      u.spikes(c,s,12,.55,-k*.5);c.fillStyle=RED;c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(2.5,s*.06);c.stroke();
      u.spikes(c,s*.6,12,.55,-k*.5);c.fillStyle=YEL;c.fill();c.stroke();pow(c,"KABOOM!",0,0,Math.max(12,s*.38),"#fff",-.15);c.restore();break;}
    case "eat":c.strokeStyle=`rgba(17,17,17,${a*.7})`;c.lineWidth=3;c.beginPath();c.arc(f.x,f.y,f.r*(1.2+k*1.2),0,6.283);c.stroke();
      if(f.r>8)pow(c,"nhac",f.x,f.y-f.r*(1+k*2),Math.max(10,f.r*.9),YEL,.08);break;
    case "suck":c.strokeStyle=rgba(MAG,a);c.lineWidth=4;c.beginPath();c.arc(f.x,f.y,f.r*(3-k*2.6),0,6.283);c.stroke();break;
    case "exit":case "split":case "merge":c.strokeStyle=`rgba(17,17,17,${a*.8})`;c.lineWidth=3;c.setLineDash([8,6]);c.beginPath();c.arc(f.x,f.y,f.r*(.6+k*1.5),0,6.283);c.stroke();c.setLineDash([]);break;
    case "chip":c.strokeStyle=rgba(INK,a);c.lineWidth=3;for(let i=-1;i<=1;i++){const an=Math.atan2(f.ny,f.nx)+i*.5;c.beginPath();c.moveTo(f.x,f.y);c.lineTo(f.x+Math.cos(an)*f.r*3*k,f.y+Math.sin(an)*f.r*3*k);c.stroke();}
      if(f.r>5)pow(c,"CRASH!",f.x,f.y-f.r*(1.5+k),Math.max(11,f.r*1.3),YEL,.12);break;
    case "shoot":c.strokeStyle=rgba(RED,a);c.lineWidth=3;for(let i=0;i<8;i++){const an=i/8*6.283;c.beginPath();c.moveTo(f.x+Math.cos(an)*f.r*(1+k),f.y+Math.sin(an)*f.r*(1+k));c.lineTo(f.x+Math.cos(an)*f.r*(1.6+k*1.4),f.y+Math.sin(an)*f.r*(1.6+k*1.4));c.stroke();}break;
    case "rock":c.strokeStyle=`rgba(17,17,17,${a*.4})`;c.lineWidth=2;c.beginPath();c.arc(f.x,f.y,f.r*.4*(1+k),0,6.283);c.stroke();break;}},

// radar = painel quadrado com moldura de tinta e canto em retícula (o resto do HUD é DOM)
drawHud(c,W,H,g,t,mode){
  if(g.prefs&&!g.prefs.minimap)return;
  const D=mode==="portrait"?92:mode==="landscape"?84:150,MP=12,x=W-MP-D-5,y=MP;c.lineJoin="miter";
  c.fillStyle=INK;c.fillRect(x+5,y+5,D,D);
  c.fillStyle=WHITE;c.fillRect(x,y,D,D);
  const st=mode==="desktop"?6:5;c.fillStyle="rgba(62,200,232,.55)";
  for(let px=st;px<D;px+=st)for(let py=st;py<D;py+=st){if(px+py<D*1.38)continue;c.fillRect(x+px-1,y+py-1,2,2);}
  c.strokeStyle="rgba(17,17,17,.14)";c.lineWidth=1;c.beginPath();[1/3,2/3].forEach(k=>{c.moveTo(x+D*k,y);c.lineTo(x+D*k,y+D);c.moveTo(x,y+D*k);c.lineTo(x+D,y+D*k);});c.stroke();
  const cx=x+D/2,cy=y+D/2,a=t*.0025,R=D*.68;c.save();c.beginPath();c.rect(x,y,D,D);c.clip();
  c.fillStyle="rgba(43,111,232,.16)";c.beginPath();c.moveTo(cx,cy);c.arc(cx,cy,R,a-.7,a);c.closePath();c.fill();
  c.strokeStyle=BLU;c.lineWidth=2;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.cos(a)*R,cy+Math.sin(a)*R);c.stroke();
  const S=D-12,mx=x+6,my=y+6;
  u.minimap(c,mx,my,S,g,{me:RED,player:BLU,bot:"#555",ast:"rgba(100,90,80,.8)",hole:"rgba(232,63,154,.8)",view:"rgba(17,17,17,.4)"});
  const me=g.players[g.me];
  if(me&&!me.dead&&me.pieces.length){const sc=S/WW,n=me.pieces.length,px=mx+me.pieces.reduce((s,q)=>s+q.x,0)/n*sc,py=my+me.pieces.reduce((s,q)=>s+q.y,0)/n*sc;
    c.fillStyle=RED;c.strokeStyle=INK;c.lineWidth=1.5;c.beginPath();c.arc(px,py,mode==="desktop"?4:3,0,6.283);c.fill();c.stroke();}
  c.restore();
  c.strokeStyle=INK;c.lineWidth=4;c.strokeRect(x,y,D,D);
  if(mode==="desktop"){c.fillStyle=YEL;c.fillRect(x+6,y+D-19,50,15);c.strokeStyle=INK;c.lineWidth=2;c.strokeRect(x+6,y+D-19,50,15);
    c.font="900 11px "+DISP;c.fillStyle=INK;c.textAlign="center";c.textBaseline="middle";c.fillText("RADAR",x+31,y+D-11);}},

paintSkin(c,sk,r){const rr=sk.ring?r*.68:r,d=rr*PK(sk);c.drawImage(planetSpr(sk,false,u.tier(rr)),-d,-d+2,d*2,d*2);},

css:`
/* ── BASE ── */
body{font-family:var(--font-ui);font-weight:700;color:var(--text)}
.card,.panel{background:var(--surface);border:4px solid var(--line);border-radius:0;padding:14px 16px;color:var(--text);box-shadow:var(--shadow)}
.panel{padding:10px 12px}
.ph{display:inline-block;font-family:Impact,'Arial Black','Arial Narrow','Liberation Sans Narrow',sans-serif;font-weight:900;font-size:14px;letter-spacing:1px;color:var(--line);background:var(--accent2);border:3px solid var(--line);padding:2px 10px;transform:rotate(-1.5deg);text-transform:uppercase;margin:0 0 10px 2px;box-shadow:3px 3px 0 var(--line)}
.hint{font-size:12px;color:var(--muted);font-weight:600}
.dim{color:var(--muted);opacity:1}
.reg{color:#178a3f}.bot{color:var(--muted)}
.code,.mono{font-family:var(--font-mono);font-weight:700}
.coinbar{background:var(--accent2);border:3px solid var(--line);padding:3px 12px;font-size:15px;color:var(--line);box-shadow:3px 3px 0 var(--line);font-family:Impact,'Arial Black','Arial Narrow','Liberation Sans Narrow',sans-serif;font-weight:900;letter-spacing:.5px}
.coinbar span{font-size:11px;color:var(--muted);font-family:var(--font-ui);font-weight:700}
.btn-primary{background:var(--accent2);border:4px solid var(--line);border-radius:var(--radius-lg);padding:14px;font-size:22px;font-family:Impact,'Arial Black','Arial Narrow','Liberation Sans Narrow',sans-serif;font-weight:900;color:var(--line);box-shadow:var(--shadow);letter-spacing:1px;text-transform:uppercase;transition:transform .05s,box-shadow .05s}
.btn-primary:hover{background:#ffe066}
.btn-secondary{background:#2b6fe8;border:4px solid var(--line);border-radius:var(--radius);padding:11px;font-size:14px;font-weight:700;color:#fff;text-shadow:1px 1px 0 var(--line);box-shadow:4px 4px 0 var(--line);transition:transform .05s,box-shadow .05s}
.btn-secondary:hover{background:#4a86f0}
.btn-mini{background:#2b6fe8;border:3px solid var(--line);border-radius:6px;padding:6px 12px;font-size:12px;color:#fff;text-shadow:1px 1px 0 var(--line);font-weight:700;box-shadow:3px 3px 0 var(--line);white-space:nowrap;transition:transform .05s,box-shadow .05s}
.btn-primary:active,.btn-secondary:active{transform:translate(4px,4px);box-shadow:none}
.btn-mini:active{transform:translate(3px,3px);box-shadow:none}
.btn-link{color:var(--accent);text-decoration:underline;font-size:12px;font-weight:700}
.field label{font-size:12px;color:var(--muted)}
.field input,.code-row input{background:#fff;border:4px solid var(--line);border-radius:0;padding:10px 12px;font-size:17px;color:var(--line);outline:none;font-weight:700;font-family:inherit;box-shadow:3px 3px 0 var(--line)}
.field input:focus,.code-row input:focus{border-color:var(--accent)}
.field input::placeholder,.code-row input::placeholder{color:#a39a8c}
select{background:#fff;border:3px solid var(--line);border-radius:0;padding:6px 10px;color:var(--line);font-weight:700;font-family:inherit}
.seg{gap:4px;padding:0 6px;border-bottom:4px solid var(--line)}
.seg button{padding:8px 14px;font-size:12.5px;color:var(--muted);background:#efe0bf;border:4px solid var(--line);border-bottom:0;border-radius:0;margin-bottom:-4px}
.seg button.on{background:var(--accent2);color:var(--line)}
.sh{position:sticky;top:0;z-index:3;background:var(--surface);padding:10px 0 10px;border-bottom:4px solid var(--line);gap:12px}
.sh .stitle{flex:0 1 auto;font-family:Impact,'Arial Black','Arial Narrow','Liberation Sans Narrow',sans-serif;font-weight:900;font-size:24px;color:var(--line);background:var(--accent2);border:3px solid var(--line);padding:2px 14px;transform:rotate(-2deg);box-shadow:3px 3px 0 var(--line);letter-spacing:1px;margin-right:auto;white-space:nowrap}
.btn-mini.back{width:38px;height:38px;border-radius:50%;padding:0;display:flex;align-items:center;justify-content:center;font-size:14px;background:var(--accent)}
.nav{order:99;position:sticky;bottom:0;z-index:3;background:var(--line);margin:4px -16px 0;padding:6px 6px 0;height:74px;gap:4px;justify-content:space-around;flex-wrap:nowrap;box-shadow:0 8px 0 var(--line)}
.nav-btn{flex:1;flex-direction:column;justify-content:center;gap:1px;height:60px;padding:2px;border:3px solid var(--line);border-radius:0;background:var(--surface);color:var(--line);font-size:9.5px;font-weight:700}
.nav-ico{display:flex;width:28px;height:28px;align-items:center;justify-content:center;font-size:19px;font-style:normal}
.nav-btn[data-nav="entry"] .nav-ico::before{content:"🏠"}.nav-btn[data-nav="lobby"] .nav-ico::before{content:"🛰️"}.nav-btn[data-nav="rank"] .nav-ico::before{content:"🏆"}
.nav-btn[data-nav="profile"] .nav-ico::before{content:"👤"}.nav-btn[data-nav="shop"] .nav-ico::before{content:"🛍️"}.nav-btn[data-nav="prefs"] .nav-ico::before{content:"⚙️"}
.nav-btn.on{background:var(--accent2);color:var(--line);transform:translateY(-3px);box-shadow:0 3px 0 var(--accent)}
th{font-size:11px;color:var(--line);border-bottom:3px solid var(--line);text-transform:uppercase}
td{font-size:13px;border-bottom:2px solid rgba(17,17,17,.2)}
#toast{background:var(--accent2);border:3px solid var(--line);border-radius:0;color:var(--line);font-size:13px;box-shadow:4px 4px 0 var(--line);font-family:Impact,'Arial Black','Arial Narrow','Liberation Sans Narrow',sans-serif;font-weight:900;letter-spacing:.5px}
/* folhas: toda tela é um quadrinho (filete duplo) que sobe por cima do mundo */
.screen{background:rgba(17,17,17,.22);padding:0;overflow:hidden}
.screen.on{display:block}
.screen .wrap{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:min(520px,100%);max-height:88%;overflow:auto;border-radius:0;
  background:var(--surface);border:5px solid var(--line);border-bottom:0;outline:2px solid var(--line);outline-offset:3px;padding:0 16px;gap:12px;grid-template-columns:1fr;grid-template-areas:none;box-shadow:0 -10px 40px rgba(0,0,0,.35)}
.screen .wrap>*{grid-area:auto}
.screen .wrap::before{content:"";display:block;width:60px;height:8px;background:var(--line);margin:8px auto -4px;justify-self:center}
/* ── HUD ── */
#hud-top{left:50%;top:12px;transform:translateX(-50%);gap:8px}
#hud-top .chip{background:var(--surface);border:3px solid var(--line);border-radius:0;padding:3px 10px;font-size:12px;color:var(--line);box-shadow:3px 3px 0 var(--line);transform:rotate(-1deg)}
#hud-top .chip:nth-child(2){transform:rotate(1deg)}
#hud-top .chip i{color:var(--muted);font-size:10px;text-transform:uppercase}
#h-exit{background:var(--accent);border-radius:0}
#hud-lb{left:12px;right:auto;top:12px;min-width:0;background:transparent;border:0;box-shadow:none;padding:0}
#hud-lb .ph{display:none}
#lb-rows{display:flex;flex-direction:column;gap:9px;align-items:flex-start;padding:4px 0 0 4px}
.lb-row{position:relative;background:var(--accent2);border:3px solid var(--line);border-radius:0;padding:5px 12px 5px 6px;gap:8px;color:var(--line);font-size:13px;box-shadow:3px 3px 0 var(--line);min-width:172px;max-width:240px;transform:rotate(-1.5deg)}
.lb-row:nth-child(2n){transform:rotate(1.5deg)}
.lb-row:nth-child(n+4):not(.mine){display:none}
.lb-pos{flex:none;width:24px;min-width:24px;height:24px;background:var(--surface);color:var(--line);display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid var(--line);font-family:Impact,'Arial Black','Arial Narrow','Liberation Sans Narrow',sans-serif;font-weight:900}
.lb-row:nth-child(1){font-size:15px;min-width:204px}
.lb-row:nth-child(2){min-width:188px}
.lb-row:nth-child(1) .lb-pos{background:var(--accent);color:#fff}.lb-row:nth-child(2) .lb-pos{background:#fff}.lb-row:nth-child(3) .lb-pos{background:#d0905c}
.lb-row.mine{background:var(--accent);color:#fff;text-shadow:1px 1px 0 var(--line)}
.lb-row.mine .lb-pos{background:#fff;color:var(--line);text-shadow:none}
.lb-val{color:var(--line);font-family:Impact,'Arial Black','Arial Narrow','Liberation Sans Narrow',sans-serif;font-weight:900;letter-spacing:.5px}.lb-row.mine .lb-val{color:#fff}
#hud-score{left:14px;bottom:36px;min-width:0;background:#fff;border:4px solid var(--line);border-radius:14px;padding:8px 16px 8px 14px;color:var(--line);box-shadow:5px 5px 0 var(--line)}
#hud-score::after{content:"";position:absolute;left:22px;bottom:-24px;width:20px;height:20px;background:#fff;border-right:4px solid var(--line);border-bottom:4px solid var(--line);transform:rotate(45deg)}
.score-big{font-family:Impact,'Arial Black','Arial Narrow','Liberation Sans Narrow',sans-serif;font-weight:900;font-size:34px;letter-spacing:.5px}
.score-sub{font-size:10px;letter-spacing:2px;margin-bottom:5px;color:var(--muted)}
.score-row{font-size:12px}.score-row .k{font-size:10px;color:var(--muted);text-transform:uppercase}
#hud-status{left:50%;bottom:16px;transform:translateX(-50%);flex-direction:row;align-items:center;gap:10px}
#hud-ammo{background:var(--accent);border:3px solid var(--line);border-radius:0;padding:4px 10px;font-size:13px;color:#fff;text-shadow:1px 1px 0 var(--line);box-shadow:3px 3px 0 var(--line);transform:rotate(-1.5deg)}
#hud-ammo span{font-size:10px;text-transform:uppercase}
#hud-ammo.empty{background:#b9b1a4;color:#4a443c;text-shadow:none}
.pw{background:var(--surface);border:3px solid var(--line);border-radius:0;padding:3px 9px;font-size:11px;color:var(--line);box-shadow:3px 3px 0 var(--line);transform:rotate(1.5deg)}
.pw:nth-child(2n){transform:rotate(-1.5deg)}
.pw-speed{background:var(--accent2)}.pw-magnet{background:#e83f9a;color:#fff;text-shadow:1px 1px 0 var(--line)}.pw-shield{background:#2b6fe8;color:#fff;text-shadow:1px 1px 0 var(--line)}
#hud-cd{display:none}
#touch{display:flex;bottom:16px;right:16px;gap:12px}
.tbtn{position:relative;width:72px;height:72px;border:4px solid var(--line);box-shadow:4px 4px 0 var(--line);color:#fff;text-shadow:1px 1px 0 var(--line);font-weight:700;gap:0;transition:transform .05s,box-shadow .05s;
  background-image:radial-gradient(circle,rgba(17,17,17,.22) 1.1px,transparent 1.6px);background-size:6px 6px}
.tbtn::before{font-size:24px;line-height:1;text-shadow:none}
#t-split{background-color:#2b6fe8}#t-split::before{content:"✂️"}
#t-eject{background-color:var(--ok)}#t-eject::before{content:"💨"}
#t-fire{background-color:var(--accent)}#t-fire::before{content:"🚀"}
.tbtn span{font-size:9px;letter-spacing:.5px}
.tbtn b{position:absolute;top:-7px;right:-7px;width:24px;height:24px;border-radius:50%;background:var(--accent2);border:3px solid var(--line);font-size:11px;color:var(--line);text-shadow:none;display:flex;align-items:center;justify-content:center}
.tbtn:active{transform:translate(4px,4px);box-shadow:none}
.tbtn.cd,#t-fire.empty{opacity:1;background-color:#b9b1a4;color:#4a443c;text-shadow:none;box-shadow:none;transform:translate(4px,4px)}
.tbtn.cd::before,#t-fire.empty::before{filter:grayscale(1);opacity:.5}
/* ── ENTRADA ── */
#s-entry{background:rgba(246,231,200,.45)}
#s-entry .entry-wrap{position:absolute;inset:0;left:0;bottom:auto;transform:none;width:100%;max-height:none;border:0;outline:none;border-radius:0;background:transparent;box-shadow:none;padding:0;overflow:hidden;
  display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:0}
#s-entry .entry-wrap::before{display:none}
.brand-block{padding-top:8vh;gap:12px}
.brand{font-family:Impact,'Arial Black','Arial Narrow','Liberation Sans Narrow',sans-serif;font-weight:900;font-size:66px;color:var(--accent);-webkit-text-stroke:1.5px var(--line);text-shadow:5px 5px 0 var(--line);letter-spacing:2px;transform:rotate(-3deg);line-height:1.1}
.brand::before{content:"💥";-webkit-text-stroke:0;text-shadow:none;margin-right:8px;font-size:.8em;vertical-align:middle}
.tagline{font-size:13px;color:var(--line);background:#fff;padding:4px 14px;border:3px solid var(--line);box-shadow:3px 3px 0 var(--line);transform:rotate(1deg)}
.entry-main{background:transparent;border:0;box-shadow:none;padding:0 16px 22px;width:min(440px,100%);gap:12px}
.entry-main .coinbar{position:absolute;top:14px;right:14px;transform:rotate(2deg)}
.entry-main .field{order:2;align-items:center}
.entry-main .field input{text-align:center;max-width:320px}
.skinrow{order:1;background:var(--surface);border:4px solid var(--line);padding:5px 12px 5px 6px;width:auto;min-width:270px;box-shadow:4px 4px 0 var(--line);transform:rotate(-1deg)}
.skinrow canvas{width:56px;height:56px}
.skinmeta b{font-size:15px;color:var(--line)}.skinmeta i{font-style:normal;font-size:11px;text-transform:uppercase}
.entry-main .btn-primary{order:3;font-size:36px;padding:16px;border-radius:14px;border-width:5px;box-shadow:8px 8px 0 var(--line);transform:rotate(-1.5deg)}
.entry-main .btn-primary:active{transform:rotate(-1.5deg) translate(6px,6px);box-shadow:none}
.entry-links{order:4;display:flex;justify-content:center;gap:10px}
.entry-links .btn-secondary{display:flex;flex-direction:column;align-items:center;gap:5px;width:66px;padding:0;background:none;border:0;box-shadow:none;font-size:10.5px;color:var(--line);text-shadow:none}
.entry-links .btn-secondary::before{content:"";display:flex;align-items:center;justify-content:center;width:58px;height:58px;border-radius:50%;background-color:#2b6fe8;border:4px solid var(--line);box-shadow:4px 4px 0 var(--line);font-size:26px;transition:transform .05s,box-shadow .05s;
  background-image:radial-gradient(circle,rgba(17,17,17,.22) 1.1px,transparent 1.6px);background-size:6px 6px}
.entry-links [data-go="lobby"]::before{content:"🛰️";background-color:#2b6fe8}.entry-links [data-go="rank"]::before{content:"🏆";background-color:#e8272b}
.entry-links [data-go="profile"]::before{content:"👤";background-color:#2fbf5f}.entry-links [data-go="shop"]::before{content:"🛍️";background-color:#e83f9a}.entry-links [data-go="prefs"]::before{content:"⚙️";background-color:#3ec8e8}
.entry-links .btn-secondary:hover{background:none}
.entry-links .btn-secondary:active{transform:none}
.entry-links .btn-secondary:active::before{transform:translate(4px,4px);box-shadow:none}
.guest-note{order:5;font-size:12px;color:var(--line)}
.guest-note[data-kind="registered"] .gn-txt{color:#178a3f}
.entry-main .hint{order:6;font-size:11px;text-align:center;color:var(--muted)}
.entry-side{display:none}
/* ── CONTA ── */
.overlay{background:rgba(17,17,17,.45);padding:0}
.modal{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:min(520px,100%);max-height:88%;overflow:auto;border-radius:0;border:5px solid var(--line);border-bottom:0;outline:2px solid var(--line);outline-offset:3px;
  background:var(--surface);padding:12px 18px 20px;box-shadow:0 -10px 40px rgba(0,0,0,.35)}
.modal::before{content:"";display:block;width:60px;height:8px;background:var(--line);margin:0 auto 2px;flex:none}
.modal-title{align-self:center;font-family:Impact,'Arial Black','Arial Narrow','Liberation Sans Narrow',sans-serif;font-weight:900;font-size:24px;color:var(--line);background:var(--accent2);border:3px solid var(--line);padding:2px 16px;transform:rotate(-2deg);box-shadow:3px 3px 0 var(--line);letter-spacing:1px;text-align:center}
.tabs{gap:4px;padding:0 6px;border-bottom:4px solid var(--line)}
.tabs button{flex:1;padding:9px;font-size:13px;color:var(--muted);background:#efe0bf;border:4px solid var(--line);border-bottom:0;border-radius:0;margin-bottom:-4px}
.tabs button.on{background:var(--accent2);color:var(--line)}
.modal-actions button{flex:1;padding:12px;font-size:15px}
/* ── LOBBY ── */
.lobby-hero{order:50;position:sticky;bottom:74px;z-index:2;background:var(--surface);border:0;border-top:4px solid var(--line);border-radius:0;box-shadow:none;margin:0 -16px;padding:10px 16px 12px;grid-template-columns:auto 1fr auto;gap:10px;grid-template-areas:"me input enter" "create play play"}
.me-chip{grid-area:me;background:#fff;border:3px solid var(--line);padding:4px 14px 4px 5px;width:max-content;box-shadow:3px 3px 0 var(--line);transform:rotate(-1.5deg)}
.me-chip canvas{width:40px;height:40px}
.me-chip b{font-size:15px;color:var(--line)}.me-chip i{font-style:normal;font-size:10px;color:var(--muted);text-transform:uppercase}
.me-chip i[data-kind="registered"]{color:#178a3f}
.code-row{display:contents}
.code-row input{grid-area:input;text-align:center;letter-spacing:3px;font-size:17px;padding:8px 6px;min-width:0}
.code-row .btn-secondary:first-of-type{grid-area:enter;width:auto;padding:8px 16px}
.code-row .btn-secondary:last-of-type{grid-area:create;background:var(--ok);color:var(--line);text-shadow:none;padding:12px 14px;font-size:15px;white-space:nowrap}
.lobby-hero .btn-primary{grid-area:play;font-size:18px;padding:12px}
.lobby-hero .hint{display:none}
.room-list{background:transparent;border:0;box-shadow:none;padding:2px 0 0;gap:8px}
.room-row{background:#fff;border:3px solid var(--line);border-radius:0;padding:6px 8px;grid-template-columns:70px 44px 1fr 44px 46px 78px;font-size:12.5px;color:var(--line);box-shadow:3px 3px 0 var(--line)}
.room-row.head{background:transparent;border:0;box-shadow:none;padding:0 8px;font-size:10px;color:var(--muted);text-transform:uppercase}
.room-row.head .code{background:none;border:0;color:var(--muted);font-size:10px;padding:0;text-align:left;box-shadow:none}
.room-row .code{background:var(--accent2);color:var(--line);border:3px solid var(--line);padding:3px 4px;text-align:center;font-size:13px;letter-spacing:1px}
.room-row .bar{background:#e6d9b8;border-radius:0;color:var(--ok);height:8px;border:2px solid var(--line)}
.room-row .btn-mini{background:var(--accent);padding:5px 10px}
.room-row.full{opacity:.5}
.lobby-side{display:none}
/* ── RANKING ── */
.toggles{flex-direction:column;gap:8px;align-items:stretch}
#rk-period button{flex:1;text-align:center}
#rk-metric{border:0;padding:0;gap:6px;justify-content:center}
#rk-metric button{border:3px solid var(--line);border-radius:0;padding:5px 14px;font-size:11px;margin:0;background:#fff;box-shadow:2px 2px 0 var(--line)}
#rk-metric button.on{background:var(--accent2)}
.rank-table{background:transparent;border:0;box-shadow:none;padding:0;max-height:none;overflow:visible}
#rk-table td{padding:7px 8px}
#rk-table tr.me td{background:var(--accent2);color:var(--line)}
#rk-table tr.top1 .c-rank,#rk-table tr.top2 .c-rank,#rk-table tr.top3 .c-rank{font-size:0;text-align:center}
#rk-table tr.top1 .c-rank::before{content:"🥇";font-size:20px}#rk-table tr.top2 .c-rank::before{content:"🥈";font-size:20px}#rk-table tr.top3 .c-rank::before{content:"🥉";font-size:20px}
.c-delta.up{color:#178a3f}.c-delta.down{color:var(--accent)}
.rank-me{position:sticky;bottom:82px;z-index:2;background:var(--accent2);color:var(--line);border:4px solid var(--line);padding:8px 20px;justify-content:center;box-shadow:4px 4px 0 var(--line);margin-bottom:8px;transform:rotate(-1deg)}
.rank-me b{font-size:24px;font-family:Impact,'Arial Black','Arial Narrow','Liberation Sans Narrow',sans-serif;font-weight:900}
/* ── PERFIL ── */
.profile-head{background:transparent;border:0;box-shadow:none;padding:0;flex-wrap:wrap}
.profile-head canvas{width:80px;height:80px}
.pf-nick{font-family:Impact,'Arial Black','Arial Narrow','Liberation Sans Narrow',sans-serif;font-weight:900;font-size:26px;color:var(--line);letter-spacing:1px}
.pf-kind{font-style:normal;font-size:11px;color:var(--muted);text-transform:uppercase}
.pf-kind[data-kind="registered"]{color:#178a3f}
.pf-meta .coinbar{width:max-content}
.stat-cards{grid-template-columns:repeat(3,1fr);gap:12px 10px;padding:0 4px 4px 0}
.stat{padding:10px 6px;border-radius:0;border:4px solid var(--line);background:#2b6fe8;color:var(--line);box-shadow:4px 4px 0 var(--line)}
.stat:nth-child(2){background:var(--accent2);transform:rotate(1.5deg)}.stat:nth-child(3){background:var(--ok)}.stat:nth-child(4){background:#e83f9a;transform:rotate(-1.5deg)}
.stat:nth-child(5){background:var(--accent)}.stat:nth-child(6){background:#3ec8e8;transform:rotate(1deg)}
.stat b{font-size:24px;color:var(--line);font-family:Impact,'Arial Black','Arial Narrow','Liberation Sans Narrow',sans-serif;font-weight:900}.stat i{font-style:normal;font-size:9.5px;font-weight:700;text-transform:uppercase;line-height:1.1}
.pf-hist{overflow-x:auto;padding:10px 12px}
#pf-table th{font-size:10px;padding:5px 6px}
#pf-table td{font-size:11.5px;padding:5px 6px;white-space:nowrap}
#pf-table th:nth-child(2),#pf-table td:nth-child(2),#pf-table th:nth-child(6),#pf-table td:nth-child(6){display:none}
.pf-hist td.cause{color:var(--muted)}.pf-hist td.cause.blackhole{color:#b8237a}.pf-hist td.cause i{font-style:normal;color:var(--line)}
.ach-grid{grid-template-columns:1fr}
.ach{padding:8px 10px;border:3px solid var(--line);border-radius:0;background:#fff;opacity:.6}
.ach.done{opacity:1;background:#dff5e4;border-color:var(--line)}
.ach.secret{opacity:.4}
.ach b{font-size:13px;color:var(--line)}.ach i{font-size:11px;color:var(--muted)}
.ach-bar{background:#e6d9b8;color:var(--accent);height:6px;margin-top:4px;border:1px solid var(--line)}
.ach.done .ach-bar{color:var(--ok)}
.ach-coins{font-style:normal;font-size:12px;color:var(--accent)}
/* ── LOJA ── */
.shop-eq{background:#efe0bf;padding:10px 14px}
.shop-eq .badge{position:static;margin-left:auto}
.shop-eq .skinmeta b{font-size:16px}
.filters button{padding:6px 12px;border-radius:0;border:3px solid var(--line);background:#fff;font-size:11px;color:var(--line);font-weight:700;box-shadow:2px 2px 0 var(--line)}
.filters button.on{background:var(--rc,var(--accent2));color:#fff;text-shadow:1px 1px 0 var(--line)}
.filters button[data-f="all"].on{color:var(--line);text-shadow:none}
.shop-grid{grid-template-columns:repeat(3,1fr);max-height:none;overflow:visible;gap:14px;padding:6px 6px 10px 2px}
.skin-card{background:#fff;border:4px solid var(--rc);border-radius:0;color:var(--line);box-shadow:4px 4px 0 var(--line);padding:12px 6px 10px;transition:transform .1s}
.skin-card:nth-child(3n+1){transform:rotate(-1.5deg)}.skin-card:nth-child(3n){transform:rotate(1.5deg)}
.skin-card:hover{transform:translateY(-3px) rotate(0);background:#fffdf5}
.skin-card.eq{background:var(--accent2);color:var(--line);border-color:var(--line)}
.skin-card.eq i,.skin-card.eq em{color:var(--line)}
.skin-card.locked,.skin-card.secret{opacity:.55;filter:grayscale(.4)}.skin-card.poor em{color:var(--accent)}
.skin-card b{font-size:12.5px}.skin-card i{font-style:normal;font-size:9.5px;color:var(--rc);text-transform:uppercase}
.skin-card em{font-style:normal;font-size:12px;color:var(--line);font-weight:700}
.badge{background:var(--accent);color:#fff;text-shadow:1px 1px 0 var(--line);font-size:9px;font-weight:700;padding:3px 7px;border-radius:0;border:2px solid var(--line)}
.shop-note{font-size:11px;padding-bottom:4px}
/* ── PREFS ── */
.pg{padding:10px 14px;background:#fff}
.pg h2{display:inline-block;font-family:Impact,'Arial Black','Arial Narrow','Liberation Sans Narrow',sans-serif;font-weight:900;font-size:13px;color:var(--line);background:var(--accent2);border:2px solid var(--line);padding:1px 8px;transform:rotate(-1.5deg);text-transform:uppercase;letter-spacing:1px;box-shadow:2px 2px 0 var(--line)}
.pref-row{border-bottom:2px solid rgba(17,17,17,.2);font-size:13px;padding:8px 0}
.pref-row:last-child{border-bottom:0}
.toggle{width:58px;height:32px;border-radius:16px;background:#c9bfae;border:3px solid var(--line);color:#fff}
.toggle i{top:2px;left:2px;width:22px;height:22px;background:#fff;border:2px solid var(--line)}
.toggle[aria-checked="true"]{background:var(--ok)}
.toggle[aria-checked="true"] i{left:24px}
input[type=range]{accent-color:var(--accent)}
.prefs-foot{position:sticky;bottom:74px;z-index:2;background:var(--surface);margin:0 -16px;padding:10px 16px 12px;border-top:4px solid var(--line)}
.prefs-foot button{padding:10px 20px;font-size:14px}
/* ── MORTE ── */
#s-dead{background:rgba(232,39,43,.25)}
#s-dead .dead-card{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:min(520px,100%);max-height:90%;overflow:auto;border-radius:0;border:5px solid var(--line);border-bottom:0;outline:2px solid var(--line);outline-offset:3px;
  background:var(--surface);padding:10px 20px 22px;gap:10px;box-shadow:0 -10px 40px rgba(0,0,0,.35)}
#s-dead .dead-card::before{content:"";display:block;width:60px;height:8px;background:var(--line);flex:none}
.dead-icon{font-size:60px;line-height:1}
.dead-title{font-family:Impact,'Arial Black','Arial Narrow','Liberation Sans Narrow',sans-serif;font-weight:900;font-size:58px;color:var(--accent);-webkit-text-stroke:1.5px var(--line);text-shadow:5px 5px 0 var(--line);transform:rotate(-4deg);letter-spacing:2px;line-height:1}
.dead-sub{display:inline-block;font-family:Impact,'Arial Black','Arial Narrow','Liberation Sans Narrow',sans-serif;font-weight:900;font-size:14px;letter-spacing:1px;color:var(--line);background:var(--accent2);border:3px solid var(--line);padding:3px 12px;box-shadow:3px 3px 0 var(--line);transform:rotate(1.5deg);margin-top:4px}
.dead-by{background:var(--line);padding:6px 20px;color:#fff}
.dead-by span{font-size:10px;color:#c9bfae;letter-spacing:2px}.dead-by b{font-size:22px;color:var(--accent2);font-family:Impact,'Arial Black','Arial Narrow','Liberation Sans Narrow',sans-serif;font-weight:900;letter-spacing:1px}
.dead-stats{gap:12px;flex-wrap:wrap;justify-content:center;padding:4px 6px}
.dead-stats div{background:#2b6fe8;border:4px solid var(--line);border-radius:0;padding:8px 10px;min-width:96px;color:var(--line);box-shadow:4px 4px 0 var(--line);transform:rotate(-2deg)}
.dead-stats div:nth-child(2){background:var(--accent2);transform:rotate(2deg)}.dead-stats div:nth-child(3){background:var(--ok);transform:rotate(-1deg)}.dead-stats div:nth-child(4){background:#e83f9a;transform:rotate(2deg)}
.dead-stats b{font-size:24px;font-family:Impact,'Arial Black','Arial Narrow','Liberation Sans Narrow',sans-serif;font-weight:900}.dead-stats i{font-style:normal;font-size:9.5px;text-transform:uppercase}
.dead-rank span{font-size:10px;color:var(--muted);letter-spacing:2px}.dead-rank b{font-size:18px;color:var(--line)}.dead-rank .arrow{color:#178a3f}
.dead-actions{flex-direction:row}
.dead-actions .btn-primary{font-size:20px;padding:12px}
/* ── RECONN ── */
.modal.reconn{bottom:auto;top:44%;transform:translate(-50%,-50%);width:min(360px,92%);max-height:none;overflow:visible;border-radius:48% 52% 46% 54%/56% 44% 56% 44%;border:5px solid var(--line);outline:none;background:#fff;color:var(--line);padding:30px 34px 32px;box-shadow:var(--shadow)}
.modal.reconn::before{content:"";display:block;position:absolute;left:40px;bottom:-32px;width:28px;height:28px;border-radius:50%;background:#fff;border:4px solid var(--line);margin:0;box-shadow:4px 4px 0 var(--line)}
.modal.reconn::after{content:"";position:absolute;left:16px;bottom:-56px;width:16px;height:16px;border-radius:50%;background:#fff;border:4px solid var(--line);box-shadow:3px 3px 0 var(--line)}
.spinner{width:52px;height:52px;border:5px solid var(--line);border-top-color:var(--accent)}
.rc-title{background:none;border:0;box-shadow:none;transform:none;padding:0;font-size:28px;color:var(--accent);-webkit-text-stroke:1px var(--line);text-shadow:3px 3px 0 var(--line);letter-spacing:1px}
.rc-title::before{content:"📡 ";-webkit-text-stroke:0;text-shadow:none}
.rc-sub{font-size:13px;color:var(--muted)}
.reconn .btn-secondary{width:auto;padding:10px 22px}
/* ── MOBILE ── */
body[data-mode="portrait"] .screen,body[data-mode="landscape"] .screen{padding:0}
body[data-mode="portrait"] .screen .wrap,body[data-mode="portrait"] .modal,body[data-mode="portrait"] #s-dead .dead-card{width:100%;max-height:86%}
body[data-mode="portrait"] .modal.reconn{width:92%}
body[data-mode="portrait"] .brand{font-size:46px}
body[data-mode="portrait"] .tagline{font-size:11px}
body[data-mode="portrait"] .entry-main .btn-primary{font-size:30px;padding:14px}
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
body[data-mode="portrait"] .lobby-hero .btn-primary{font-size:16px}
body[data-mode="portrait"] .stat-cards{gap:10px 8px}
body[data-mode="portrait"] .stat b{font-size:20px}
body[data-mode="portrait"] .shop-grid{gap:10px}
body[data-mode="portrait"] .dead-title{font-size:46px}
body[data-mode="portrait"] .dead-stats div{min-width:120px}
body[data-mode="portrait"] #hud-top{left:auto;right:12px;top:116px;transform:none;flex-direction:column;align-items:flex-end;gap:6px}
body[data-mode="portrait"] #hud-top .chip{padding:3px 9px;font-size:11px}
body[data-mode="portrait"] #hud-lb{top:12px;left:12px}
body[data-mode="portrait"] #lb-rows{gap:7px}
body[data-mode="portrait"] .lb-row{font-size:11px;min-width:140px;max-width:180px;padding:3px 9px 3px 4px;gap:6px}
body[data-mode="portrait"] .lb-row:nth-child(1){font-size:12px;min-width:160px}
body[data-mode="portrait"] .lb-row:nth-child(2){min-width:150px}
body[data-mode="portrait"] .lb-pos{width:20px;min-width:20px;height:20px;font-size:10px}
body[data-mode="portrait"] #hud-lb .lb-row.mine,body[data-mode="landscape"] #hud-lb .lb-row.mine{display:flex}
body[data-mode="portrait"] #hud-score{padding:6px 12px 6px 10px;bottom:32px;left:12px}
body[data-mode="portrait"] .score-big{font-size:24px}
body[data-mode="portrait"] .score-row:nth-child(n+4){display:none}
body[data-mode="portrait"] #hud-status{left:12px;bottom:128px;transform:none;flex-direction:column;align-items:flex-start;gap:8px}
body[data-mode="portrait"] #touch{bottom:14px;right:12px;gap:8px}
body[data-mode="portrait"] .tbtn{width:66px;height:66px}
body[data-mode="landscape"] #s-entry .entry-wrap{flex-direction:row;justify-content:center;align-items:center;gap:30px;padding:0 20px}
body[data-mode="landscape"] .brand-block{padding-top:0}
body[data-mode="landscape"] .brand{font-size:44px}
body[data-mode="landscape"] .entry-main{padding:0;width:400px;gap:8px}
body[data-mode="landscape"] .entry-main .btn-primary{font-size:24px;padding:12px}
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
body[data-mode="landscape"] #hud-score{padding:6px 12px 6px 10px;bottom:30px;left:12px}
body[data-mode="landscape"] .score-big{font-size:24px}
body[data-mode="landscape"] .score-row:nth-child(n+4){display:none}
body[data-mode="landscape"] #hud-status{left:160px;bottom:14px;transform:none}
body[data-mode="landscape"] #touch{gap:8px;bottom:12px}
body[data-mode="landscape"] .tbtn{width:60px;height:60px}
`};
})();

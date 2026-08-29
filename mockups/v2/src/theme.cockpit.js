// ── MODELO 6 — CABINE ─────────────────────────────────────────────────────────
// Retro-futurista NASA anos 60/70: o jogador pilota o planeta de dentro de uma
// cabine. HUD = painel de instrumentos (placa creme com parafusos) ao longo da
// base da tela, desenhado no canvas: manômetro de massa, arcos de cooldown, LEDs
// de mísseis, radar circular com varredura, mostradores de ping/FPS, lâmpadas de
// power-up e o placar como "fita" de papel. Menus = caderno de bordo paginado com
// abas de índice à esquerda. Creme quente sobre teal profundo; Georgia nos títulos,
// Courier nas leituras. Contrato do tema: ver cabeçalho de theme.nebula.js.
(function(){
const u=MOCK.u,WW=u.WW,WH=u.WH,sh=u.sh,rgba=u.rgba;
const TEAL="#061a1f",INK="#0b2a31",CREAM="#f1e9d8",OR="#ffa53a",TQ="#52e0c4",RED="#ff5e3a",MUTED="#8fa9ad",METAL="#24444b",PAPER="#fbf6ec",PLINE="#cdbfa5";
const T=760,FK=2.0,A0=2.356,SW=4.712;                         // dial: começa a 135° e varre 270°
let L=[],bg=null,bgW=0,bgH=0,plate=null,plateKey="",G=null;

// ── sprites ───────────────────────────────────────────────────────────────────
function grain(c,r,n,seed){const rd=u.mulberry(seed);for(let i=0;i<n;i++){const a=rd()*6.283,d=Math.sqrt(rd())*r;
  c.fillStyle=rd()<.5?"rgba(255,244,220,.2)":"rgba(0,10,14,.24)";c.fillRect(Math.cos(a)*d,Math.sin(a)*d,1.6,1.6);}}
const PK=sk=>sk.ring?2.3:1.5;
function planetSpr(sk,isMe,size){
  return u.sprite("cp"+sk.id+(isMe?"m":"")+size,size,(c,R)=>{
    const K=PK(sk),r=R/K,col=sk.color;let rg=null;
    if(sk.ring){rg=c.createRadialGradient(0,0,r*1.12,0,0,r*2.15);rg.addColorStop(0,rgba(CREAM,0));rg.addColorStop(.2,rgba(CREAM,.85));rg.addColorStop(.6,rgba(OR,.55));rg.addColorStop(1,"rgba(0,0,0,0)");
      c.save();c.scale(1,.3);c.fillStyle=rg;c.beginPath();c.arc(0,0,r*2.15,0,6.283);c.arc(0,0,r*1.1,0,6.283,true);c.fill();c.restore();}
    const halo=c.createRadialGradient(0,0,r*.96,0,0,r*1.4);halo.addColorStop(0,rgba(OR,isMe?.4:.2));halo.addColorStop(1,rgba(OR,0));
    c.fillStyle=halo;c.beginPath();c.arc(0,0,r*1.4,0,6.283);c.fill();
    const gd=c.createRadialGradient(-r*.38,-r*.4,r*.06,0,0,r*1.02);gd.addColorStop(0,sh(col,.55));gd.addColorStop(.5,col);gd.addColorStop(1,sh(col,-.7));
    c.fillStyle=gd;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
    c.save();c.beginPath();c.arc(0,0,r,0,6.283);c.clip();
    grain(c,r,220,sk.id*13+7);
    c.globalAlpha=.22;c.font=`${r*1.5}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(sk.emoji,0,r*.06);c.globalAlpha=1;
    const hl=c.createRadialGradient(-r*.4,-r*.45,0,-r*.4,-r*.45,r*.7);hl.addColorStop(0,"rgba(255,246,225,.45)");hl.addColorStop(1,"rgba(255,246,225,0)");c.fillStyle=hl;c.fillRect(-r,-r,r*2,r*2);
    const term=c.createLinearGradient(-r*.1,-r*.1,r*.95,r*.95);term.addColorStop(0,"rgba(0,0,0,0)");term.addColorStop(.5,"rgba(3,12,16,.18)");term.addColorStop(1,"rgba(3,12,16,.8)");c.fillStyle=term;c.fillRect(-r,-r,r*2,r*2);
    c.shadowBlur=r*.4;c.shadowColor=OR;c.strokeStyle=rgba(OR,.85);c.lineWidth=r*.1;c.beginPath();c.arc(0,0,r*.95,-.8,1.7);c.stroke();c.shadowBlur=0;
    c.restore();
    if(sk.ring){c.save();c.scale(1,.3);c.fillStyle=rg;c.beginPath();c.arc(0,0,r*2.15,0,3.1416);c.arc(0,0,r*1.1,3.1416,0,true);c.fill();c.restore();}
    c.strokeStyle=isMe?CREAM:rgba(CREAM,.55);c.lineWidth=Math.max(1.5,r*(isMe?.06:.04));c.beginPath();c.arc(0,0,r*.99,0,6.283);c.stroke();});}

function foodSpr(f){
  return u.sprite("cf"+f.type+f.color,64,(c,R)=>{const r=R/FK;
    if(f.type==="missile_ammo"||f.type.indexOf("powerup_")===0){
      c.shadowBlur=r*.9;c.shadowColor=f.color;c.fillStyle=CREAM;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.shadowBlur=0;
      c.strokeStyle=f.color;c.lineWidth=r*.18;c.beginPath();c.arc(0,0,r*.86,0,6.283);c.stroke();
      c.font=`${r*.95}px serif`;c.textAlign="center";c.textBaseline="middle";
      c.fillText({missile_ammo:"🚀",powerup_speed:"⚡",powerup_magnet:"🧲",powerup_shield:"🛡️"}[f.type],0,1);return;}
    if(f.type==="comet"){const gd=c.createLinearGradient(-r*3.2,0,r*.3,0);gd.addColorStop(0,rgba(CREAM,0));gd.addColorStop(1,rgba(CREAM,.85));
      c.fillStyle=gd;c.beginPath();c.ellipse(-r*1.2,0,r*2.8,r*.28,0,0,6.283);c.fill();
      c.fillStyle=f.color;c.beginPath();c.arc(0,0,r*.55,0,6.283);c.fill();c.fillStyle=CREAM;c.beginPath();c.arc(-r*.15,-r*.15,r*.22,0,6.283);c.fill();return;}
    if(f.type==="star"){c.shadowBlur=r*.9;c.shadowColor=CREAM;c.fillStyle=CREAM;u.spikes(c,r*1.15,4,.3,0);c.fill();c.shadowBlur=0;
      c.fillStyle=f.color;u.spikes(c,r*.6,4,.3,0);c.fill();return;}
    if(f.type==="dust"){c.fillStyle=rgba(f.color,.85);for(let i=0;i<4;i++){const a=i*1.7;c.beginPath();c.arc(Math.cos(a)*r*.42,Math.sin(a)*r*.42,r*.3,0,6.283);c.fill();}
      c.fillStyle=CREAM;c.beginPath();c.arc(-r*.2,-r*.25,r*.16,0,6.283);c.fill();return;}
    const gd=c.createRadialGradient(-r*.3,-r*.3,r*.05,0,0,r);gd.addColorStop(0,sh(f.color,.4));gd.addColorStop(.6,f.color);gd.addColorStop(1,sh(f.color,-.6));
    c.fillStyle=gd;c.beginPath();c.arc(0,0,r*.95,0,6.283);c.fill();
    c.fillStyle="rgba(255,248,230,.9)";c.beginPath();c.arc(-r*.35,-r*.35,r*.2,0,6.283);c.fill();});}

const ejSpr=col=>u.sprite("ce"+col,40,(c,R)=>{const r=R/1.6;
  const gd=c.createRadialGradient(-r*.3,-r*.3,0,0,0,r);gd.addColorStop(0,sh(col,.45));gd.addColorStop(.65,col);gd.addColorStop(1,sh(col,-.55));
  c.fillStyle=gd;c.beginPath();c.arc(0,0,r*.92,0,6.283);c.fill();
  c.fillStyle="rgba(255,248,230,.85)";c.beginPath();c.arc(-r*.32,-r*.32,r*.2,0,6.283);c.fill();});

// asteroide: 3 variantes, rocha marrom-cinza com volume assado e sombra de um lado
const AK=1.3;
function astSpr(variant,size){return u.sprite("ca"+variant+size,size,(c,R)=>{const r=R/AK,seed=11+variant*7;
  const gd=c.createRadialGradient(-r*.35,-r*.4,r*.08,0,0,r*1.1);gd.addColorStop(0,"#a08b72");gd.addColorStop(.45,"#5e4f42");gd.addColorStop(1,"#1a1512");
  c.fillStyle=gd;u.astPoly(c,r,seed,9+variant*2);c.fill();
  c.save();u.astPoly(c,r,seed,9+variant*2);c.clip();grain(c,r,160,seed*5);
  const sd=c.createLinearGradient(-r*.2,-r*.2,r*.9,r*.9);sd.addColorStop(0,"rgba(0,0,0,0)");sd.addColorStop(1,"rgba(5,10,12,.7)");c.fillStyle=sd;c.fillRect(-r,-r,r*2,r*2);
  const cr=u.mulberry(seed*3);for(let i=0;i<4;i++){const a=cr()*6.28,d=cr()*r*.55,c2=r*(.1+cr()*.16);
    c.fillStyle="rgba(10,8,6,.5)";c.beginPath();c.arc(Math.cos(a)*d,Math.sin(a)*d,c2,0,6.283);c.fill();
    c.strokeStyle="rgba(241,233,216,.28)";c.lineWidth=1;c.beginPath();c.arc(Math.cos(a)*d,Math.sin(a)*d,c2,3.4,5.6);c.stroke();}
  c.restore();
  c.strokeStyle="rgba(241,233,216,.35)";c.lineWidth=Math.max(1.2,r*.04);u.astPoly(c,r,seed,9+variant*2);c.stroke();});}

// buraco negro: disco preto + anel de acreção laranja→creme (inclinado) + anel "lente" fino
const BK=2.6;
const bhSpr=()=>u.sprite("cbh",256,(c,R)=>{const r=R/BK;
  const ac=c.createRadialGradient(0,0,r*1.02,0,0,r*2.3);ac.addColorStop(0,rgba(CREAM,.95));ac.addColorStop(.18,rgba(OR,.9));ac.addColorStop(.5,rgba(OR,.35));ac.addColorStop(1,"rgba(0,0,0,0)");
  c.save();c.scale(1,.72);c.fillStyle=ac;c.beginPath();c.arc(0,0,r*2.3,0,6.283);c.fill();
  c.strokeStyle=rgba(CREAM,.5);c.lineWidth=r*.06;c.beginPath();c.arc(0,0,r*1.45,.5,2.5);c.stroke();c.restore();
  c.strokeStyle=rgba(CREAM,.35);c.lineWidth=Math.max(1,r*.03);c.beginPath();c.arc(0,0,r*2.45,0,6.283);c.stroke();
  c.shadowBlur=r*.5;c.shadowColor=OR;c.fillStyle="#000";c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.shadowBlur=0;
  c.strokeStyle=rgba(CREAM,.9);c.lineWidth=Math.max(1.5,r*.05);c.beginPath();c.arc(0,0,r*1.02,0,6.283);c.stroke();});

// ── painel (geometria + placa assada) ────────────────────────────────────────
// y das peças é relativo ao topo da placa; Y() soma G.top na hora de desenhar
function geo(W,H,mode,fpsOn){
  const m=mode==="portrait"?1:mode==="landscape"?2:0,DH=m?84:112,G={W,H,DH,top:H-DH,m,fpsOn,sep:[]};
  if(!m){G.tape={x:30,y:20,w:260,h:84};G.mass={x:334,y:56,r:34};G.ro={x:378,y:24,w:82,h:40};G.split={x:494,y:52,r:20};G.eject={x:544,y:52,r:20};
    const rx=Math.max(Math.round(W/2),574+70);G.radar={x:rx,y:52,r:46,b:54};let x=rx+54+22;
    G.leds={x,y:50,r:6,dx:19};x+=60;
    if(fpsOn){G.ping={x:x+30,y:50,r:18};G.fps={x:x+80,y:50,r:18};x+=112;}
    G.lamps={x:x+26,y:46,r:8,dx:48};x+=150;
    if(W-30-x>=170)G.name={x:W-30,w:176};G.grille=[x,W-30-(G.name?196:0)];
    G.sep=[306,474,rx-70,rx+70,x-150,x];}
  else if(m===1){G.tape={x:14,y:7,w:124,h:70};G.mass={x:164,y:42,r:23};G.ro={x:192,y:22,w:64,h:32};G.split={x:274,y:38,r:14};G.eject={x:306,y:38,r:14};
    G.leds={x:333,y:38,r:4.5,dx:13};G.mm={x:W-86,y:10,s:76};G.sep=[144,262];}
  else{G.tape={x:16,y:7,w:160,h:70};G.mass={x:208,y:42,r:24};G.ro={x:242,y:22,w:76,h:32};G.split={x:342,y:38,r:15};G.eject={x:378,y:38,r:15};
    G.leds={x:410,y:38,r:5,dx:14};let x=456;if(fpsOn){G.ping={x:x+18,y:40,r:14};G.fps={x:x+54,y:40,r:14};x+=80;}
    G.lamps={x:x+16,y:36,r:7,dx:36};x+=112;if(W-16-x>=140)G.name={x:W-16,w:140};G.mm={x:W-82,y:10,s:72};G.sep=[186,326,446,x-112,x];}
  return G;}
function eng(c,txt,x,y,size,align,font){c.font=(font||"")+size+"px 'Courier New',monospace";c.textAlign=align||"center";c.textBaseline="alphabetic";c.letterSpacing="1.5px";
  c.fillStyle="rgba(255,255,255,.75)";c.fillText(txt,x,y+1);c.fillStyle=INK;c.fillText(txt,x,y);c.letterSpacing="0px";}
function screw(c,x,y){const g=c.createRadialGradient(x-1.5,y-1.5,0,x,y,5.5);g.addColorStop(0,"#dfe9ea");g.addColorStop(.6,"#7f9aa0");g.addColorStop(1,"#243d43");
  c.fillStyle=g;c.beginPath();c.arc(x,y,5,0,6.283);c.fill();c.strokeStyle="rgba(11,42,49,.6)";c.lineWidth=1.3;c.beginPath();c.moveTo(x-3.2,y-1.2);c.lineTo(x+3.2,y+1.2);c.stroke();}
function face(c,d,ticks,maj,zone,zc){const{x,y,r}=d;
  c.fillStyle=PAPER;c.beginPath();c.arc(x,y,r,0,6.283);c.fill();
  if(zone){c.strokeStyle=zc;c.lineWidth=r*.12;c.beginPath();c.arc(x,y,r*.82,A0+SW*zone[0],A0+SW*zone[1]);c.stroke();}
  c.strokeStyle=INK;for(let i=0;i<=ticks;i++){const a=A0+SW*i/ticks,M=i%maj===0,r0=r*(M?.72:.8),r1=r*.9;c.lineWidth=M?1.5:1;
    c.beginPath();c.moveTo(x+Math.cos(a)*r0,y+Math.sin(a)*r0);c.lineTo(x+Math.cos(a)*r1,y+Math.sin(a)*r1);c.stroke();}
  c.strokeStyle=METAL;c.lineWidth=Math.max(2,r*.1);c.beginPath();c.arc(x,y,r,0,6.283);c.stroke();
  c.strokeStyle="rgba(255,255,255,.6)";c.lineWidth=1;c.beginPath();c.arc(x,y,r-c.lineWidth-r*.06,0,6.283);c.stroke();}
function needle(c,d,f,Y){const{x,r}=d,y=Y(d.y),a=A0+SW*Math.max(0,Math.min(1,f));
  c.strokeStyle=RED;c.lineWidth=Math.max(1.5,r*.07);c.lineCap="round";c.beginPath();c.moveTo(x-Math.cos(a)*r*.18,y-Math.sin(a)*r*.18);c.lineTo(x+Math.cos(a)*r*.76,y+Math.sin(a)*r*.76);c.stroke();
  c.fillStyle=METAL;c.beginPath();c.arc(x,y,r*.13,0,6.283);c.fill();c.fillStyle=CREAM;c.beginPath();c.arc(x,y,r*.05,0,6.283);c.fill();}
function arcTrack(c,d){const{x,y,r}=d;c.fillStyle=PAPER;c.beginPath();c.arc(x,y,r,0,6.283);c.fill();
  c.strokeStyle="#d9cdb3";c.lineWidth=r*.32;c.lineCap="butt";c.beginPath();c.arc(x,y,r*.76,A0,A0+SW);c.stroke();
  c.strokeStyle=METAL;c.lineWidth=Math.max(2,r*.1);c.beginPath();c.arc(x,y,r,0,6.283);c.stroke();}
function arcGauge(c,d,f,key,Y){const{x,r}=d,y=Y(d.y);
  c.lineCap="butt";c.strokeStyle=f>=1?TQ:OR;c.lineWidth=r*.32;c.beginPath();c.arc(x,y,r*.76,A0,A0+SW*Math.max(.03,Math.min(1,f)));c.stroke();
  c.font="bold "+Math.round(r*.55)+"px 'Courier New',monospace";c.textAlign="center";c.textBaseline="middle";c.fillStyle=f>=1?INK:"#9a8a68";c.fillText(key,x,y+1);}
function socket(c,x,y,r){c.fillStyle=METAL;c.beginPath();c.arc(x,y,r+2.5,0,6.283);c.fill();c.fillStyle="#0b2a31";c.beginPath();c.arc(x,y,r+.5,0,6.283);c.fill();}
function window_(c,x,y,w,h){u.rr(c,x-2,y-2,w+4,h+4,5);c.fillStyle=METAL;c.fill();u.rr(c,x,y,w,h,4);c.fillStyle="#0a2128";c.fill();
  c.strokeStyle="rgba(82,224,196,.18)";c.lineWidth=1;u.rr(c,x+1.5,y+1.5,w-3,h-3,3);c.stroke();}
function bakePlate(G){const W=G.W,DH=G.DH,m=G.m,cv=document.createElement("canvas");cv.width=W;cv.height=DH;const c=cv.getContext("2d"),R=m?12:16;
  const path=()=>{c.beginPath();c.moveTo(0,R);c.arcTo(0,0,R,0,R);c.lineTo(W-R,0);c.arcTo(W,0,W,R,R);c.lineTo(W,DH);c.lineTo(0,DH);c.closePath();};
  path();const gd=c.createLinearGradient(0,0,0,DH);gd.addColorStop(0,"#f7f0e1");gd.addColorStop(.7,"#efe5d2");gd.addColorStop(1,"#e1d5bc");c.fillStyle=gd;c.fill();
  c.save();path();c.clip();c.fillStyle=METAL;c.fillRect(0,0,W,3);c.fillStyle="rgba(255,255,255,.75)";c.fillRect(0,3,W,1);c.fillStyle="rgba(11,42,49,.08)";c.fillRect(0,DH-5,W,5);c.restore();
  path();c.strokeStyle=METAL;c.lineWidth=2;c.stroke();
  const sx=m?9:15,sy=m?9:14;screw(c,sx,sy);screw(c,W-sx,sy);screw(c,sx,DH-sy);screw(c,W-sx,DH-sy);
  G.sep.forEach(x=>{c.fillStyle="rgba(11,42,49,.22)";c.fillRect(x,12,1,DH-24);c.fillStyle="rgba(255,255,255,.7)";c.fillRect(x+1,12,1,DH-24);});
  // fita do placar (o DOM #hud-lb senta aqui)
  const tp=G.tape;c.strokeStyle=METAL;c.lineWidth=2;c.strokeRect(tp.x-3,tp.y-3,tp.w+6,tp.h+6);c.fillStyle=PAPER;c.fillRect(tp.x,tp.y,tp.w,tp.h);
  if(!m)eng(c,"PLACAR",tp.x+tp.w/2,14,9);
  // manômetro de massa
  face(c,G.mass,12,3,[.7,1],rgba(OR,.7));eng(c,"MASSA",G.mass.x,G.mass.y+G.mass.r+(m?10:12),m?8:9);
  if(!m){const ms=G.mass;[[0,"0"],[1,"10k"]].forEach(([f,l])=>{const a=A0+SW*f;eng(c,l,ms.x+Math.cos(a)*ms.r*.62,ms.y+Math.sin(a)*ms.r*.62+7,8);});}
  // leitura digital
  const ro=G.ro;window_(c,ro.x,ro.y,ro.w,ro.h);if(!m)eng(c,"LEITURA",ro.x+ro.w/2,ro.y-6,8);
  // arcos de cooldown
  arcTrack(c,G.split);arcTrack(c,G.eject);
  if(!m){eng(c,"DIVIDIR",G.split.x,G.split.y+G.split.r+16,9);eng(c,"EJETAR",G.eject.x,G.eject.y+G.eject.r+16,9);}
  // LEDs de mísseis
  const ld=G.leds;u.rr(c,ld.x-ld.r-6,ld.y-ld.r-6,ld.dx*2+ld.r*2+12,ld.r*2+12,5);c.fillStyle=METAL;c.fill();
  for(let i=0;i<3;i++)socket(c,ld.x+i*ld.dx,ld.y,ld.r);
  if(!m)eng(c,"MÍSSEIS",ld.x+ld.dx,ld.y+ld.r+22,9);else if(m===2)eng(c,"MÍSSEIS",ld.x+ld.dx,ld.y+ld.r+18,8);
  // radar (desktop)
  if(G.radar){const rd=G.radar;const bz=c.createRadialGradient(rd.x,rd.y,rd.r,rd.x,rd.y,rd.b);bz.addColorStop(0,"#5f7a80");bz.addColorStop(.5,"#2c4b52");bz.addColorStop(1,"#18343a");
    c.fillStyle=bz;c.beginPath();c.arc(rd.x,rd.y,rd.b,0,6.283);c.fill();
    c.strokeStyle=CREAM;c.lineWidth=2;c.beginPath();c.arc(rd.x,rd.y,rd.r+2.5,0,6.283);c.stroke();
    c.fillStyle="#08232a";c.beginPath();c.arc(rd.x,rd.y,rd.r,0,6.283);c.fill();
    c.strokeStyle="rgba(82,224,196,.22)";c.lineWidth=1;[.33,.66,1].forEach(k=>{c.beginPath();c.arc(rd.x,rd.y,rd.r*k-(k===1?1:0),0,6.283);c.stroke();});
    c.beginPath();c.moveTo(rd.x-rd.r,rd.y);c.lineTo(rd.x+rd.r,rd.y);c.moveTo(rd.x,rd.y-rd.r);c.lineTo(rd.x,rd.y+rd.r);c.stroke();
    const S=rd.r*1.4;c.strokeStyle="rgba(241,233,216,.14)";c.strokeRect(rd.x-S/2,rd.y-S/2,S,S);
    for(let i=0;i<8;i++){const a=i/8*6.283;c.fillStyle="rgba(241,233,216,.8)";c.fillRect(rd.x+Math.cos(a)*(rd.b-4)-1,rd.y+Math.sin(a)*(rd.b-4)-1,2,2);}}
  // mostradores de ping/fps
  if(G.ping){face(c,G.ping,8,4,[.7,1],rgba(RED,.75));face(c,G.fps,8,4,[0,.4],rgba(RED,.75));
    const ly=G.ping.y+G.ping.r+(m?10:12);eng(c,"PING",G.ping.x,ly,m?8:9);eng(c,"FPS",G.fps.x,ly,m?8:9);}
  // lâmpadas de power-up
  if(G.lamps){const lp=G.lamps;["VELOC.","ÍMÃ","ESCUDO"].forEach((l,i)=>{socket(c,lp.x+i*lp.dx,lp.y,lp.r);eng(c,l,lp.x+i*lp.dx,lp.y+lp.r+(m?12:15),m?7:8);});}
  // placa do fabricante + grelha decorativa
  if(G.name){const n=G.name,x0=n.x-n.w,y0=m?18:24,h=m?48:62;c.strokeStyle=METAL;c.lineWidth=1.5;c.strokeRect(x0,y0,n.w,h);c.strokeStyle="rgba(255,255,255,.7)";c.strokeRect(x0+1.5,y0+1.5,n.w-3,h-3);
    eng(c,"WARSPACE.IO",n.x-12,y0+(m?20:26),m?13:16,"right","italic ");eng(c,"CABINE Mk.II · SÉRIE 2026",n.x-12,y0+(m?36:44),m?7:8,"right");
    if(!m)eng(c,"PILOTO AUTOMÁTICO DESLIGADO",n.x-12,y0+56,7,"right");}
  if(G.grille&&G.grille[1]-G.grille[0]>120){const[x0,x1]=G.grille;for(let i=0;i<5;i++){const y=30+i*12;c.fillStyle="rgba(11,42,49,.16)";c.fillRect(x0+14,y,x1-x0-28,1.5);c.fillStyle="rgba(255,255,255,.6)";c.fillRect(x0+14,y+1.5,x1-x0-28,1);}}
  return cv;}

window.THEME={
id:"cockpit",name:"Cabine",
desc:"Retro-futurismo NASA anos 60/70: o jogador pilota o planeta de dentro de uma cabine. HUD é um painel de instrumentos creme na base da tela — manômetro de massa, arcos de cooldown, LEDs de mísseis, radar com varredura e o placar em fita de papel. Menus viram um caderno de bordo com abas de índice; creme quente sobre teal profundo.",
tags:["retrô","cabine","instrumentos","aconchegante"],swatch:["#ffa53a","#0b2a31"],
tokens:{bg:"#061a1f",surface:"#f1e9d8",text:"#0b2a31",muted:"#8fa9ad",accent:"#ffa53a",accent2:"#52e0c4",danger:"#ff5e3a",ok:"#52e0c4",
  line:"#1a3940",radius:"10px",radiusLg:"16px",space:"14px",fontUi:"Georgia,'Times New Roman',serif",fontMono:"'Courier New',Courier,monospace",
  shadow:"0 10px 30px rgba(0,0,0,.45),0 2px 0 rgba(255,255,255,.35) inset"},
layout:{hud:"dashboard",nav:"book"},
hudInset:mode=>mode==="desktop"?112:84,
rarityColor:{free:"#8fa9ad",common:"#52a8c4",rare:"#2f7fd6",epic:"#a24bd6",legendary:"#e0a020",earned:"#2fb894",secret:"#ff5e3a"},
labels:{title:"WARSPACE.IO",tagline:"CADERNO DE BORDO · CONQUISTE A GALÁXIA",play:"🚀 DECOLAR",playAuto:"🚀 Decolar (auto)",
  lobbyTitle:"Salas",rankTitle:"Ranking",profileTitle:"Diário de bordo",shopTitle:"Catálogo de skins",prefsTitle:"Preferências",accountTitle:"Ficha do piloto",
  dead:"MISSÃO ENCERRADA",deadIcon:"🛰️",deadSub:"— relatório de voo —",respawn:"⟳ NOVA MISSÃO",reconnTitle:"SINAL PERDIDO"},

init(g){const rand=u.mulberry(66);
  L=[.2,.5].map((f,li)=>({f,stars:Array.from({length:li?50:80},()=>({x:rand()*T,y:rand()*T,r:li?1.6+rand()*1.4:.8+rand()*1,a:+((li?.5:.25)+rand()*.35).toFixed(2)}))}));},

drawBg(c,W,H,cam,t,g){
  if(!bg||bgW!==W||bgH!==H){bgW=W;bgH=H;bg=document.createElement("canvas");bg.width=W;bg.height=H;const x=bg.getContext("2d");
    const gd=x.createLinearGradient(0,0,0,H);gd.addColorStop(0,"#0e343c");gd.addColorStop(.45,"#061a1f");gd.addColorStop(1,"#03100f");x.fillStyle=gd;x.fillRect(0,0,W,H);
    const sun=x.createRadialGradient(W*.5,-H*.1,0,W*.5,-H*.1,H*.8);sun.addColorStop(0,rgba(OR,.16));sun.addColorStop(.5,rgba(OR,.04));sun.addColorStop(1,"rgba(0,0,0,0)");x.fillStyle=sun;x.fillRect(0,0,W,H);
    const vg=x.createRadialGradient(W*.5,H*.45,H*.3,W*.5,H*.45,Math.max(W,H)*.75);vg.addColorStop(0,"rgba(0,0,0,0)");vg.addColorStop(1,"rgba(2,8,10,.55)");x.fillStyle=vg;x.fillRect(0,0,W,H);
    const rand=u.mulberry(9);x.fillStyle=CREAM;for(let i=0;i<220;i++){x.globalAlpha=.08+rand()*.22;x.fillRect(rand()*W,rand()*H,1,1);}x.globalAlpha=1;}
  c.drawImage(bg,0,0);
  if(g&&g.prefs&&!g.prefs.parallax)return;
  c.fillStyle="#f6eedc";
  L.forEach(l=>{const ox=((-cam.x*l.f*cam.scale)%T+T)%T,oy=((-cam.y*l.f*cam.scale)%T+T)%T;
    l.stars.forEach(s=>{c.globalAlpha=s.a;const bx=(s.x+ox)%T,by=(s.y+oy)%T;for(let x=bx;x<W;x+=T)for(let y=by;y<H;y+=T)c.fillRect(x,y,s.r,s.r);});});
  c.globalAlpha=1;},

drawWorld(c,cam,t,g){
  if(!g||!g.prefs||g.prefs.grid){u.grid(c,100,"rgba(241,233,216,.035)",1);u.grid(c,500,"rgba(255,165,58,.1)",1);}
  c.strokeStyle=rgba(CREAM,.55);c.lineWidth=3;c.strokeRect(0,0,WW,WH);c.strokeStyle=rgba(OR,.5);c.lineWidth=1.5;c.strokeRect(-14,-14,WW+28,WH+28);
  c.strokeStyle=rgba(OR,.9);c.lineWidth=4;[[0,0,1,1],[WW,0,-1,1],[0,WH,1,-1],[WW,WH,-1,-1]].forEach(([x,y,sx,sy])=>{c.beginPath();c.moveTo(x+sx*90,y);c.lineTo(x,y);c.lineTo(x,y+sy*90);c.stroke();});},

drawFood(c,f,t){const p=f.type==="star"?1+Math.sin(t*.003+f.seed)*.14:1,r=f.r*FK*p;c.drawImage(foodSpr(f),f.x-r,f.y-r,r*2,r*2);},
drawEjected(c,e){const r=e.r*1.6;c.drawImage(ejSpr(e.color),e.x-r,e.y-r,r*2,r*2);},

drawAsteroid(c,a,t){const r=a.r*AK;c.save();c.translate(a.x,a.y);c.rotate(a.rot);c.drawImage(astSpr(a.variant,u.tier(a.r)),-r,-r,r*2,r*2);c.restore();},

drawBlackHole(c,h,t){const k=h.k,rc=h.rc*k,ri=h.ri*k;
  c.strokeStyle=rgba(OR,.14+.06*Math.sin(t*.004));c.lineWidth=1.5;c.setLineDash([8,12]);c.beginPath();c.arc(h.x,h.y,ri,-h.spin*.3,-h.spin*.3+6.283);c.stroke();c.setLineDash([]);
  c.strokeStyle="rgba(241,233,216,.05)";c.lineWidth=rc*.5;c.beginPath();c.arc(h.x,h.y,rc*3.4,0,6.283);c.stroke();
  const R=rc*BK;c.save();c.translate(h.x,h.y);c.rotate(h.spin);c.globalAlpha=Math.min(1,k*1.2);c.drawImage(bhSpr(),-R,-R,R*2,R*2);c.restore();c.globalAlpha=1;},

drawTrail(c,pc,p,isMe){if(!u.trailPath(c,pc))return;
  c.strokeStyle=rgba(OR,isMe?.28:.16);c.lineWidth=Math.max(2,pc.r*.4);c.lineCap="round";c.lineJoin="round";c.stroke();},

drawMissile(c,m,t){
  m.trail.forEach((pt,i)=>{const a=i/m.trail.length;c.fillStyle=`rgba(255,165,58,${a*.45})`;c.beginPath();c.arc(pt.x,pt.y,m.r*a*.8,0,6.283);c.fill();});
  c.save();c.translate(m.x,m.y);c.rotate(Math.atan2(m.vy,m.vx));
  c.fillStyle=rgba(CREAM,.6);c.beginPath();c.ellipse(-m.r*1.8,0,m.r*2.4,m.r*.4,0,0,6.283);c.fill();
  c.fillStyle=CREAM;c.beginPath();c.ellipse(0,0,m.r,m.r*.42,0,0,6.283);c.fill();
  c.fillStyle=RED;c.beginPath();c.moveTo(-m.r*.6,0);c.lineTo(-m.r*1.1,-m.r*.7);c.lineTo(-m.r*.2,0);c.lineTo(-m.r*1.1,m.r*.7);c.closePath();c.fill();
  c.fillStyle=OR;c.beginPath();c.ellipse(m.r*.55,0,m.r*.5,m.r*.4,0,0,6.283);c.fill();c.restore();},

drawCell(c,pc,p,isMe,t,prev,g){
  const r=pc.displayR||pc.r,sk=p.skin,d=r*PK(sk),pr=(g&&g.prefs)||{names:true,mass:true};
  c.drawImage(planetSpr(sk,isMe,u.tier(r)),pc.x-d,pc.y-d,d*2,d*2);
  c.save();c.translate(pc.x,pc.y);
  if(pc.mergeTimer>0){c.strokeStyle=rgba(CREAM,.7);c.lineWidth=2;c.beginPath();c.arc(0,0,r+6,-1.5708,-1.5708+(1-pc.mergeTimer/u.mergeTime(pc.r))*6.283);c.stroke();}
  const pw=Object.keys(p._powerups||{});
  if(pw.length){const cl={speed:OR,magnet:RED,shield:TQ};
    pw.forEach((k,i)=>{c.strokeStyle=cl[k];c.lineWidth=2.2;c.globalAlpha=.55+.45*Math.sin(t*.012+i);c.setLineDash([r*.3,r*.22]);
      c.beginPath();c.arc(0,0,r*(1.24+i*.14),0,6.283);c.stroke();c.setLineDash([]);c.globalAlpha=1;});}
  if(!prev&&r>13){const fs=Math.max(11,r*.3);
    if(pr.names!==false)u.outText(c,p.name+(p.registered?" ✓":""),0,pr.mass!==false?-fs*.3:0,fs,CREAM,"rgba(6,26,31,.85)","Georgia,'Times New Roman',serif");
    if(pr.mass!==false)u.outText(c,u.fmt(pc.r*pc.r),0,pr.names!==false?fs*.75:0,fs*.68,OR,"rgba(6,26,31,.8)","'Courier New',monospace");}
  c.restore();},

drawFx(c,f,t){const k=f.age/f.ttl,a=1-k;c.lineWidth=2.5;
  switch(f.t){
    case "bounce":c.strokeStyle=rgba(CREAM,a*.9);c.lineWidth=3;c.beginPath();c.arc(f.x,f.y,f.r*(.3+k*1.1),0,6.283);c.stroke();
      c.strokeStyle=rgba(OR,a*.7);c.lineWidth=4;c.beginPath();c.moveTo(f.x-f.ny*f.r*.5,f.y+f.nx*f.r*.5);c.lineTo(f.x+f.ny*f.r*.5,f.y-f.nx*f.r*.5);c.stroke();break;
    case "pop":case "shoot":c.strokeStyle=rgba(OR,a);for(let i=0;i<10;i++){const an=i/10*6.283+k;c.beginPath();c.moveTo(f.x+Math.cos(an)*f.r*(1+k),f.y+Math.sin(an)*f.r*(1+k));c.lineTo(f.x+Math.cos(an)*f.r*(1.5+k*1.6),f.y+Math.sin(an)*f.r*(1.5+k*1.6));c.stroke();}
      c.strokeStyle=rgba(CREAM,a);c.beginPath();c.arc(f.x,f.y,f.r*(1+k*1.4),0,6.283);c.stroke();break;
    case "eat":c.strokeStyle=rgba(f.color&&f.color[0]==="#"?f.color:CREAM,a*.9);c.beginPath();c.arc(f.x,f.y,f.r*(1.4-k),0,6.283);c.stroke();break;
    case "suck":c.strokeStyle=rgba(OR,a);c.beginPath();c.arc(f.x,f.y,f.r*(3-k*2.6),0,6.283);c.stroke();break;
    case "exit":case "split":case "merge":c.strokeStyle=rgba(CREAM,a);c.beginPath();c.arc(f.x,f.y,f.r*(.6+k*1.6),0,6.283);c.stroke();break;
    case "chip":c.strokeStyle=rgba(OR,a);c.lineWidth=2;for(let i=-1;i<=1;i++){const an=Math.atan2(f.ny,f.nx)+i*.5;c.beginPath();c.moveTo(f.x,f.y);c.lineTo(f.x+Math.cos(an)*f.r*3*k,f.y+Math.sin(an)*f.r*3*k);c.stroke();}break;
    case "boom":c.strokeStyle=rgba(OR,a);c.lineWidth=5;c.beginPath();c.arc(f.x,f.y,f.r*(.5+k*2),0,6.283);c.stroke();
      c.fillStyle=rgba(CREAM,a*.6);c.beginPath();c.arc(f.x,f.y,f.r*.5*a,0,6.283);c.fill();break;
    case "rock":c.strokeStyle=`rgba(200,180,150,${a*.5})`;c.beginPath();c.arc(f.x,f.y,f.r*.4*(1+k),0,6.283);c.stroke();break;}},

drawHud(c,W,H,g,t,mode){
  const fpsOn=!g.prefs||g.prefs.fps!==false,key=W+"x"+H+":"+mode+":"+(fpsOn?1:0);
  if(!plate||plateKey!==key){plateKey=key;G=geo(W,H,mode,fpsOn);plate=bakePlate(G);}
  const Y=v=>G.top+v,m=G.m,me=g.players[g.me],mass=g.myMass||0,rank=g.myRank||0,score=me?me.score:0,am=me?me._missiles:0,pw=(me&&me._powerups)||{};
  c.drawImage(plate,0,G.top);
  needle(c,G.mass,Math.sqrt(Math.min(mass,10000)/10000),Y);
  const ro=G.ro;c.textAlign="right";c.textBaseline="alphabetic";c.font="bold "+(m?15:18)+"px 'Courier New',monospace";c.fillStyle=OR;c.fillText(u.fmt(mass),ro.x+ro.w-7,Y(ro.y)+(m?15:19));
  c.font=(m?9:10)+"px 'Courier New',monospace";c.fillStyle=TQ;c.fillText((rank?"Nº"+rank:"—")+(m?"":" · "+u.fmt(score)+" PTS"),ro.x+ro.w-7,Y(ro.y)+(m?27:33));
  if(!m){c.textAlign="center";c.font="italic 11px Georgia,serif";c.fillStyle=INK;c.fillText(g.myName||"",ro.x+ro.w/2,Y(ro.y+ro.h)+16);}
  arcGauge(c,G.split,1-g.splitCD/24,"ESP",Y);arcGauge(c,G.eject,1-g.ejectCD/7,"W",Y);
  const ld=G.leds;for(let i=0;i<3;i++){const lit=am>i,x=ld.x+i*ld.dx,y=Y(ld.y);c.fillStyle=lit?OR:"#2b3a3c";c.beginPath();c.arc(x,y,ld.r,0,6.283);c.fill();
    if(lit){c.fillStyle=CREAM;c.beginPath();c.arc(x-ld.r*.3,y-ld.r*.3,ld.r*.32,0,6.283);c.fill();}}
  const mmOn=!g.prefs||g.prefs.minimap!==false,st={me:CREAM,player:OR,bot:MUTED,ast:"rgba(241,233,216,.55)",hole:rgba(RED,.8),view:rgba(TQ,.45)};
  if(G.radar&&mmOn){const rd=G.radar,y=Y(rd.y),S=rd.r*1.4;c.save();c.beginPath();c.arc(rd.x,y,rd.r,0,6.283);c.clip();
    u.minimap(c,rd.x-S/2,y-S/2,S,g,st);
    const a=(t*.0022)%6.283;c.fillStyle=rgba(TQ,.16);c.beginPath();c.moveTo(rd.x,y);c.arc(rd.x,y,rd.r,a-.9,a);c.closePath();c.fill();
    c.strokeStyle=rgba(TQ,.9);c.lineWidth=1.5;c.beginPath();c.moveTo(rd.x,y);c.lineTo(rd.x+Math.cos(a)*rd.r,y+Math.sin(a)*rd.r);c.stroke();c.restore();}
  if(G.mm&&mmOn){const mm=G.mm;u.rr(c,mm.x-4,mm.y-4,mm.s+8,mm.s+8,6);c.fillStyle=CREAM;c.fill();c.fillStyle="#08232a";c.fillRect(mm.x,mm.y,mm.s,mm.s);
    c.strokeStyle="rgba(82,224,196,.2)";c.lineWidth=1;c.beginPath();c.moveTo(mm.x+mm.s/2,mm.y);c.lineTo(mm.x+mm.s/2,mm.y+mm.s);c.moveTo(mm.x,mm.y+mm.s/2);c.lineTo(mm.x+mm.s,mm.y+mm.s/2);c.stroke();
    u.minimap(c,mm.x,mm.y,mm.s,g,st);c.font="8px 'Courier New',monospace";c.fillStyle=rgba(TQ,.8);c.textAlign="left";c.textBaseline="top";c.fillText("RADAR",mm.x+4,mm.y+3);}
  if(G.ping){needle(c,G.ping,g.ping/100,Y);needle(c,G.fps,g.fps/80,Y);
    c.font=(m?9:10)+"px 'Courier New',monospace";c.fillStyle=INK;c.textAlign="center";c.textBaseline="alphabetic";const vy=Y(G.ping.y+G.ping.r)+(m?20:24);
    c.fillText(g.ping+"ms",G.ping.x,vy);c.fillText(g.fps+"fps",G.fps.x,vy);}
  if(G.lamps){const lp=G.lamps,cl={speed:OR,magnet:RED,shield:TQ};["speed","magnet","shield"].forEach((k,i)=>{const on=pw[k]>0,x=lp.x+i*lp.dx,y=Y(lp.y);
    c.fillStyle=on?cl[k]:"#2b3a3c";c.beginPath();c.arc(x,y,lp.r,0,6.283);c.fill();
    if(on){c.fillStyle=CREAM;c.beginPath();c.arc(x-lp.r*.3,y-lp.r*.3,lp.r*.3,0,6.283);c.fill();
      c.font="bold "+(m?9:10)+"px 'Courier New',monospace";c.fillStyle=INK;c.textAlign="center";c.textBaseline="alphabetic";c.fillText(Math.ceil(pw[k]/60)+"s",x,y+lp.r+(m?22:27));}});}},

paintSkin(c,sk,r){const d=r*PK(sk);c.drawImage(planetSpr(sk,false,u.tier(r)),-d,-d+2,d*2,d*2);},

css:`
/* ── BASE ── */
:root{--ink:#0b2a31;--ink-soft:#4f6c72;--paper:#fbf6ec;--paper-line:#cdbfa5;--cream2:#e6dcc6;--metal:#24444b;--lever:#8a4a10;--rust:#b8600e}
body{font-family:var(--font-ui);color:var(--text)}
body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:45;background:linear-gradient(180deg,rgba(241,233,216,.06),rgba(241,233,216,0) 16%),radial-gradient(ellipse at 50% 40%,rgba(0,0,0,0) 55%,rgba(2,8,10,.5) 100%)}
body[data-screen="game"]::after{bottom:112px}
body[data-mode="portrait"]::after,body[data-mode="landscape"]::after{display:none}
.card,.panel{background:var(--paper);border:1px solid var(--paper-line);border-radius:var(--radius);padding:16px 18px;color:var(--ink);position:relative;box-shadow:0 1px 0 rgba(255,255,255,.8) inset,0 2px 6px rgba(11,42,49,.12)}
.card::before{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;
  background:radial-gradient(circle at 8px 8px,var(--metal) 2.2px,rgba(0,0,0,0) 3.2px),radial-gradient(circle at calc(100% - 8px) 8px,var(--metal) 2.2px,rgba(0,0,0,0) 3.2px),radial-gradient(circle at 8px calc(100% - 8px),var(--metal) 2.2px,rgba(0,0,0,0) 3.2px),radial-gradient(circle at calc(100% - 8px) calc(100% - 8px),var(--metal) 2.2px,rgba(0,0,0,0) 3.2px)}
.panel{padding:10px 14px}
.ph{font-size:10px;letter-spacing:3px;color:var(--rust);font-weight:700;font-family:var(--font-mono);text-transform:uppercase}
.hint{font-size:11.5px;color:var(--ink-soft);font-style:italic}
.dim{color:var(--ink-soft);opacity:1}
.reg{color:#1f9a7a;font-size:.85em}
.bot{color:var(--ink-soft);font-size:.85em}
.code,.mono{font-family:var(--font-mono);letter-spacing:1px}
.coinbar{border:1.5px solid var(--rust);border-radius:4px;padding:5px 12px;font-size:13px;color:var(--rust);font-family:var(--font-mono);letter-spacing:1px;background:rgba(255,165,58,.08)}
.coinbar span{font-size:9px;letter-spacing:2px}
.btn-primary{background:linear-gradient(180deg,#ffb95a,var(--accent));border:1px solid var(--lever);border-radius:8px;padding:13px;font-size:16px;font-weight:700;color:var(--ink);letter-spacing:3px;
  box-shadow:0 4px 0 var(--lever),0 1px 0 rgba(255,255,255,.6) inset;transition:.08s}
.btn-primary:hover{filter:brightness(1.06)}
.btn-primary:active{transform:translateY(3px);box-shadow:0 1px 0 var(--lever)}
.btn-secondary{background:linear-gradient(180deg,#efe6d3,var(--cream2));border:1px solid #b9a985;border-radius:8px;padding:10px;font-size:12.5px;font-weight:700;color:var(--ink);letter-spacing:1.5px;box-shadow:0 3px 0 #b9a985;transition:.08s}
.btn-secondary:hover{filter:brightness(1.04)}
.btn-secondary:active{transform:translateY(2px);box-shadow:0 1px 0 #b9a985}
.btn-mini{background:var(--metal);border:1px solid var(--ink);border-radius:6px;padding:5px 11px;font-size:11px;color:var(--surface);white-space:nowrap;font-family:var(--font-mono);letter-spacing:1px;box-shadow:0 2px 0 var(--ink)}
.btn-mini:hover{background:#2f5960}
.btn-mini:active{transform:translateY(2px);box-shadow:none}
.btn-link{color:var(--rust);text-decoration:underline;font-size:12px;font-style:italic}
.field label{font-size:9.5px;color:var(--ink-soft);letter-spacing:2.5px;font-family:var(--font-mono);text-transform:uppercase}
.field input,.code-row input{background:#fffaf0;border:1px solid var(--paper-line);border-bottom:2px solid var(--ink);border-radius:4px;padding:10px 12px;font-size:16px;color:var(--ink);outline:none;font-family:var(--font-mono)}
.field input:focus,.code-row input:focus{border-color:var(--rust);box-shadow:0 0 0 3px rgba(255,165,58,.25)}
select{background:#fffaf0;border:1px solid var(--paper-line);border-radius:4px;padding:5px 8px;color:var(--ink);font-family:var(--font-mono);font-size:12px}
.seg{background:var(--metal);padding:4px;border-radius:8px;gap:3px;box-shadow:inset 0 2px 4px rgba(0,0,0,.45)}
.seg button{padding:6px 14px;font-size:11px;letter-spacing:2px;color:var(--ink);font-family:var(--font-mono);background:linear-gradient(180deg,#efe6d3,var(--cream2));border-radius:4px;box-shadow:0 2px 0 #b9a985;transition:.08s}
.seg button.on{background:var(--accent);box-shadow:inset 0 2px 3px rgba(0,0,0,.35);transform:translateY(2px);font-weight:700}
.wrap{position:relative;background:var(--surface);border-radius:4px 16px 16px 4px;padding:24px 30px 30px;color:var(--ink);box-shadow:var(--shadow);width:min(1000px,calc(100% - 100px));margin-left:100px;gap:14px}
.wrap::after{content:"";position:absolute;left:0;top:0;bottom:0;width:10px;border-radius:4px 0 0 4px;background:repeating-linear-gradient(180deg,var(--metal) 0 14px,rgba(36,68,75,0) 14px 22px),var(--cream2);pointer-events:none}
.nav{position:absolute;left:-106px;top:22px;flex-direction:column;gap:5px;width:106px;flex-wrap:nowrap}
.nav-btn{width:100px;padding:9px 12px 9px 8px;background:var(--cream2);color:var(--ink);border-radius:8px 0 0 8px;box-shadow:-2px 2px 0 rgba(0,0,0,.18);font-family:var(--font-ui);font-style:italic;font-size:13px;justify-content:flex-end;gap:8px;transition:.1s}
.nav-btn .nav-ico{display:block;width:6px;height:16px;border-radius:2px;background:var(--accent);order:-1;margin-right:auto}
.nav-btn:nth-child(2) .nav-ico{background:var(--accent2)}.nav-btn:nth-child(3) .nav-ico{background:var(--danger)}.nav-btn:nth-child(4) .nav-ico{background:var(--muted)}.nav-btn:nth-child(5) .nav-ico{background:#e0a020}.nav-btn:nth-child(6) .nav-ico{background:var(--metal)}
.nav-btn:hover{width:104px}
.nav-btn.on{background:var(--surface);width:112px;margin-left:-6px;font-style:normal;font-weight:700;box-shadow:-3px 3px 0 rgba(0,0,0,.22)}
.sh{border-bottom:2px solid var(--ink);padding-bottom:10px}
.sh .stitle{font-size:26px;font-weight:400;font-style:italic;letter-spacing:.5px;color:var(--ink)}
th{font-size:12.5px;font-style:italic;color:var(--ink);font-weight:400;border-bottom:2px solid var(--ink)}
td{font-size:12.5px;border-bottom:1px solid rgba(11,42,49,.14)}
tbody tr:nth-child(even) td{background:rgba(11,42,49,.04)}
#toast{background:var(--paper);border:1px solid var(--rust);border-radius:4px;color:var(--rust);font-family:var(--font-mono);font-size:12px;letter-spacing:2px;box-shadow:0 3px 0 #b9a985}
/* ── HUD ── */
#hud-top{top:10px;left:14px;gap:0;background:var(--surface);border-radius:6px;box-shadow:0 2px 0 #b9a985,0 4px 10px rgba(0,0,0,.35);overflow:hidden;align-items:stretch;border:1px solid var(--metal)}
#hud-top .chip{padding:5px 12px;border-right:1px solid var(--paper-line);font-family:var(--font-mono);font-size:12px;color:var(--ink);font-weight:700}
#hud-top .chip i{color:var(--rust);font-size:9px;letter-spacing:2px;font-weight:400}
body[data-mode="desktop"] #h-net{display:none}
#h-exit{border-radius:0;box-shadow:none;border:0;background:var(--danger);color:var(--surface);padding:5px 12px;font-size:11px;letter-spacing:2px}
#hud-lb{top:auto;right:auto;left:30px;bottom:8px;width:260px;height:84px;min-width:0;padding:4px 8px;background:var(--paper);border:0;border-radius:2px;box-shadow:inset 0 2px 5px rgba(11,42,49,.25);overflow:hidden;
  background-image:repeating-linear-gradient(180deg,rgba(11,42,49,0) 0 14px,rgba(11,42,49,.07) 14px 15px)}
#hud-lb .ph{display:none}
#lb-rows{display:grid;grid-auto-flow:column;grid-template-rows:repeat(5,15px);column-gap:12px}
.lb-row{font-family:var(--font-mono);font-size:11px;color:var(--ink);padding:0;gap:4px;line-height:15px;min-width:0}
.lb-row::before{content:"";position:absolute;left:0;right:0;bottom:1px;height:1px;background:linear-gradient(90deg,rgba(255,165,58,.7) calc(var(--p)*100%),transparent 0)}
.lb-row.mine{color:var(--rust);font-weight:700}
.lb-row.top .lb-pos{color:var(--rust);font-weight:700}
.lb-val{font-weight:400}
#hud-score,#hud-cd,#hud-ammo{display:none}
#hud-status{display:none}
.pw{background:var(--paper);border:1px solid var(--metal);border-radius:4px;padding:3px 8px;font-size:11px;font-family:var(--font-mono);color:var(--ink);box-shadow:0 2px 0 #b9a985}
.pw i{width:8px;height:8px;border-radius:50%;display:inline-block;font-size:0;background:var(--accent)}
.pw-magnet i{background:var(--danger)}.pw-shield i{background:var(--accent2)}
.tbtn{background:var(--surface);border:3px solid var(--metal);color:var(--ink);font-family:var(--font-mono);box-shadow:0 4px 0 #8a7a5a,0 6px 12px rgba(0,0,0,.4);font-weight:700}
.tbtn:active{transform:translateY(3px);box-shadow:0 1px 0 #8a7a5a}
#t-fire{background:var(--accent);box-shadow:0 4px 0 var(--lever),0 6px 12px rgba(0,0,0,.4)}
#t-fire.empty{opacity:.45}
/* ── ENTRADA ── */
.screen{background:radial-gradient(ellipse at 50% 30%,rgba(36,68,75,.75),rgba(6,26,31,.96))}
#s-entry .entry-wrap{margin-left:0;width:min(880px,100%);border-radius:6px 18px 18px 6px;padding:28px 34px 30px 40px;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr)}
.brand-block{padding-bottom:6px;border-bottom:2px solid var(--ink);margin-bottom:4px}
.brand{font-size:46px;font-weight:400;font-style:italic;letter-spacing:3px;color:var(--ink);text-shadow:0 1px 0 rgba(255,255,255,.7)}
.tagline{font-size:10px;color:var(--rust);letter-spacing:3px;font-family:var(--font-mono)}
.entry-main{padding:22px 26px}
.skinrow{background:#fffaf0;border:1px solid var(--paper-line);border-radius:8px;padding:8px 12px}
.skinmeta b{font-size:15px;font-weight:700}.skinmeta i{font-style:normal;font-size:10px;letter-spacing:2px;font-family:var(--font-mono);text-transform:uppercase}
.entry-links .btn-secondary{padding:8px 4px;font-size:11px;letter-spacing:1px}
.guest-note{font-size:11.5px;color:var(--ink-soft);font-style:italic}
.guest-note[data-kind="registered"] .gn-txt{color:#1f9a7a}
.mr-row{font-size:12px;font-family:var(--font-mono);color:var(--ink);padding:3px 0;border-bottom:1px dotted var(--paper-line)}
.mr-pos{color:var(--rust);font-weight:700}.mr-val{color:var(--rust)}
.entry-side .ph:nth-of-type(2){margin-top:12px}
.entry-side,.lobby-side{align-self:start}
/* ── CONTA ── */
.overlay{background:rgba(6,26,31,.74)}
.modal-title{font-size:24px;font-weight:400;font-style:italic;color:var(--ink);text-align:center;border-bottom:2px solid var(--ink);padding-bottom:8px}
.tabs{gap:4px;border-bottom:2px solid var(--ink);padding:0 6px}
.tabs button{flex:1;padding:8px;font-size:12px;letter-spacing:1px;color:var(--ink);font-family:var(--font-ui);font-style:italic;background:var(--cream2);border-radius:8px 8px 0 0}
.tabs button.on{background:var(--accent);font-style:normal;font-weight:700}
.modal-actions button{flex:1;padding:11px;font-size:13px;letter-spacing:2px}
/* ── LOBBY ── */
.lobby-wrap{grid-template-areas:"head head" "hero side" "list side"}
.lobby-hero .hint{font-size:11.5px}
.room-row{font-family:var(--font-mono);font-size:12.5px;color:var(--ink);border-bottom:1px solid rgba(11,42,49,.12)}
.room-row:nth-child(even){background:rgba(11,42,49,.045)}
.room-row.head{font-family:var(--font-ui);font-style:italic;font-size:12.5px;color:var(--ink);border-bottom:2px solid var(--ink);background:none}
.room-row .code{color:var(--ink);font-size:15px;letter-spacing:2px;font-weight:700}
.room-row .bar{background:rgba(11,42,49,.12);border-radius:2px;color:var(--rust)}
.room-row.full{opacity:.5}
.me-chip b{font-size:16px;font-weight:700}.me-chip i{font-style:normal;font-size:9.5px;letter-spacing:2px;color:var(--ink-soft);font-family:var(--font-mono);text-transform:uppercase}
.me-chip i[data-kind="registered"]{color:#1f9a7a}
/* ── RANKING ── */
.rank-wrap{grid-template-areas:"head" "toggles" "table" "me"}
.rank-table{padding:8px 14px}
#rk-table tr.me td{color:var(--rust);font-weight:700;background:rgba(255,165,58,.16)}
#rk-table tr.top1 .c-rank{color:#c98a12}#rk-table tr.top2 .c-rank{color:#7a8c90}#rk-table tr.top3 .c-rank{color:#a9642c}
.c-delta.up{color:#1f9a7a}.c-delta.down{color:var(--danger)}
.rank-me{font-family:var(--font-mono);color:var(--ink);padding:12px 18px;background:var(--metal);color:var(--surface);border-color:var(--ink)}
.rank-me b{font-size:22px;font-weight:700;color:var(--accent)}
/* ── PERFIL ── */
.profile-wrap{grid-template-areas:"head head" "phead phead" "stats stats" "hist ach"}
.pf-nick{font-size:24px;font-weight:400;font-style:italic}
.pf-kind{font-style:normal;font-size:9.5px;letter-spacing:2px;color:var(--ink-soft);font-family:var(--font-mono);text-transform:uppercase}
.pf-kind[data-kind="registered"]{color:#1f9a7a}
.stat{padding:10px 6px;background:var(--metal);border:3px solid var(--cream2);box-shadow:0 0 0 1px var(--ink),inset 0 0 12px rgba(0,0,0,.5);border-radius:8px}
.stat::before{display:none}
.stat b{font-size:19px;font-weight:700;color:var(--accent);font-family:var(--font-mono)}.stat i{font-style:normal;font-size:8.5px;letter-spacing:1.5px;color:var(--surface);font-family:var(--font-mono);text-transform:uppercase}
.pf-hist td{font-size:12px}
.pf-hist td.cause{font-size:11px;color:var(--ink-soft);font-style:italic}
.pf-hist td.cause.blackhole{color:var(--rust)}.pf-hist td.cause i{font-style:normal;color:var(--ink)}
.ach{padding:8px;border:1px solid var(--paper-line);border-radius:6px;opacity:.6;background:#fffaf0}
.ach.done{opacity:1;border-color:#1f9a7a;background:#eef7f1}
.ach.secret{opacity:.4}
.ach b{font-size:12.5px}.ach i{font-size:10.5px;color:var(--ink-soft);font-style:italic}
.ach-bar{background:rgba(11,42,49,.12);color:var(--rust);border-radius:2px;margin-top:3px}
.ach.done .ach-bar{color:#1f9a7a}
.ach-coins{font-style:normal;font-size:11px;color:var(--rust);font-family:var(--font-mono)}
/* ── LOJA ── */
.shop-wrap{grid-template-areas:"head" "eq" "filters" "grid" "note"}
.shop-eq .badge{position:static;margin-left:auto}
.filters button{padding:6px 12px;border-radius:4px;border:1px solid var(--paper-line);font-size:11px;letter-spacing:1.5px;color:var(--ink);font-family:var(--font-mono);background:#fffaf0;box-shadow:0 2px 0 #b9a985}
.filters button.on{border-color:var(--rc,var(--rust));color:#fff;background:var(--rc,var(--accent));box-shadow:inset 0 2px 3px rgba(0,0,0,.3);transform:translateY(1px)}
.shop-grid{grid-template-columns:repeat(4,1fr);gap:14px;max-height:58vh}
.skin-card{background:#fffaf0;border:1px solid var(--paper-line);border-radius:6px;color:var(--ink);clip-path:inset(0 round 6px);box-shadow:0 2px 0 #e0d5bd;padding:14px 8px 12px}
.skin-card::after{content:"";position:absolute;top:10px;right:-26px;width:96px;height:14px;background:var(--rc);transform:rotate(45deg);box-shadow:0 1px 0 rgba(0,0,0,.25)}
.skin-card:hover{transform:translateY(-2px);box-shadow:0 4px 0 #d3c6aa,0 8px 16px rgba(0,0,0,.15)}
.skin-card.eq{border-color:var(--rust);background:#fff3df;box-shadow:0 0 0 2px var(--accent)}
.skin-card.locked,.skin-card.secret{opacity:.55}.skin-card.poor em{color:var(--danger)}
.skin-card b{font-size:12.5px;font-weight:700}.skin-card i{font-style:normal;font-size:9.5px;letter-spacing:1.5px;color:var(--rc);font-family:var(--font-mono);text-transform:uppercase}
.skin-card em{font-style:normal;font-size:12px;color:var(--rust);font-family:var(--font-mono)}
.badge{background:var(--ink);color:var(--surface);font-size:8.5px;font-weight:700;padding:3px 7px;border-radius:3px;letter-spacing:1px;font-family:var(--font-mono);right:auto;left:6px;top:6px}
/* ── PREFS ── */
.prefs-wrap{grid-template-areas:"head" "groups" "foot";width:min(760px,calc(100% - 100px))}
.pg h2{font-size:17px;font-weight:400;font-style:italic;color:var(--ink);border-bottom:1px solid var(--paper-line);padding-bottom:4px}
.pref-row{border-bottom:1px dotted var(--paper-line);font-size:13.5px}
.toggle{width:50px;height:26px;border-radius:6px;background:var(--metal);box-shadow:inset 0 2px 4px rgba(0,0,0,.55);color:var(--surface)}
.toggle i{top:3px;left:3px;width:20px;height:20px;border-radius:4px;background:linear-gradient(180deg,#f7f0e1,var(--paper-line));box-shadow:0 2px 0 #8a7a5a}
.toggle[aria-checked="true"]{background:var(--accent2)}
.toggle[aria-checked="true"] i{left:27px}
input[type=range]{accent-color:var(--accent)}
.range b{font-family:var(--font-mono);color:var(--rust)}
.prefs-foot button{padding:10px 22px}
/* ── MORTE ── */
#s-dead{background:radial-gradient(ellipse at 50% 40%,rgba(80,30,20,.55),rgba(6,26,31,.96))}
.dead-card{padding:26px 30px;border:1px solid var(--paper-line)}
.dead-icon{font-size:44px}
.dead-title{font-family:var(--font-mono);font-size:24px;font-weight:700;color:var(--danger);letter-spacing:4px;border:4px double var(--danger);padding:6px 16px;border-radius:6px;transform:rotate(-5deg);opacity:.9;margin:4px 0 6px}
.dead-sub{font-size:12px;color:var(--ink-soft);font-style:italic}
.dead-by span,.dead-rank span{font-size:9.5px;color:var(--ink-soft);letter-spacing:3px;font-family:var(--font-mono)}
.dead-by b{font-size:24px;color:var(--ink);font-weight:400;font-style:italic}
.dead-rank b{font-size:18px;color:var(--rust);font-weight:700;font-family:var(--font-mono)}.dead-rank .arrow{color:#1f9a7a}
.dead-stats div{background:var(--metal);border:3px solid var(--cream2);box-shadow:0 0 0 1px var(--ink);border-radius:8px;padding:8px 12px;min-width:84px}
.dead-stats b{font-size:19px;color:var(--accent);font-weight:700;font-family:var(--font-mono)}
.dead-stats i{font-style:normal;font-size:8.5px;color:var(--surface);letter-spacing:1.5px;font-family:var(--font-mono);text-transform:uppercase}
/* ── RECONN ── */
.reconn{border-color:var(--danger);padding-top:26px}
.spinner{border:0;animation:blink 1s steps(2,start) infinite;background:var(--danger);box-shadow:0 0 0 4px var(--metal),0 0 22px var(--danger);width:36px;height:36px;position:relative;margin-bottom:14px}
.spinner::after{content:"SINAL";position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:10px;font:9px var(--font-mono);letter-spacing:3px;color:var(--ink)}
@keyframes blink{50%{opacity:.25;box-shadow:0 0 0 4px var(--metal)}}
.rc-title{color:var(--danger);font-family:var(--font-mono);font-style:normal;font-size:20px;letter-spacing:3px;border:0}
.rc-sub{font-family:var(--font-mono);font-size:12px;color:var(--ink);letter-spacing:1px}
/* ── MOBILE ── */
body[data-mode="portrait"] .wrap,body[data-mode="landscape"] .wrap{margin-left:0;width:100%;padding:14px;border-radius:0 0 12px 12px;gap:10px}
body[data-mode="portrait"] .wrap::after,body[data-mode="landscape"] .wrap::after{display:none}
body[data-mode="portrait"] .nav,body[data-mode="landscape"] .nav{position:static;flex-direction:row;width:auto;flex-wrap:wrap;gap:3px;margin:-14px -14px 0;padding:8px 8px 0;background:var(--cream2);border-radius:0}
body[data-mode="portrait"] .nav-btn,body[data-mode="landscape"] .nav-btn{width:auto;border-radius:6px 6px 0 0;padding:7px 9px;font-size:12px;box-shadow:none;gap:5px;background:#dccfb4}
body[data-mode="portrait"] .nav-btn .nav-ico,body[data-mode="landscape"] .nav-btn .nav-ico{height:12px;width:4px;margin:0}
body[data-mode="portrait"] .nav-btn.on,body[data-mode="landscape"] .nav-btn.on{margin-left:0;width:auto;background:var(--surface);box-shadow:none}
body[data-mode="portrait"] #s-entry .entry-wrap{padding:18px 16px 18px 24px}
body[data-mode="portrait"] .brand{font-size:30px}
body[data-mode="portrait"] .card{padding:12px 12px}
body[data-mode="portrait"] .btn-primary{padding:12px;font-size:15px}
body[data-mode="portrait"] .sh .stitle{font-size:21px}
body[data-mode="portrait"] .shop-grid{grid-template-columns:repeat(3,1fr);gap:8px}
body[data-mode="portrait"] .dead-stats{flex-wrap:wrap;justify-content:center;gap:8px}
body[data-mode="portrait"] #hud-top{left:10px;top:10px}
body[data-mode="portrait"] #hud-top .chip{padding:4px 8px;font-size:11px}
body[data-mode="portrait"] #hud-lb{left:14px;bottom:7px;width:124px;height:70px;padding:4px 6px}
body[data-mode="portrait"] #lb-rows{grid-template-rows:repeat(3,20px);column-gap:0}
body[data-mode="portrait"] .lb-row{line-height:20px}
body[data-mode="portrait"] #hud-status{display:flex;left:12px;bottom:96px}
body[data-mode="portrait"] #hud-pw{flex-direction:column;align-items:flex-start;gap:5px}
body[data-mode="portrait"] .lobby-hero .btn-primary{letter-spacing:1px;font-size:14px}
body[data-mode="portrait"] .room-row{grid-template-columns:54px 1fr 40px 60px;gap:6px}
body[data-mode="portrait"] .room-row .bar{width:52px}
body[data-mode="portrait"] .room-row .code{font-size:14px;letter-spacing:1px}
body[data-mode="portrait"] .room-row .act .btn-mini{padding:5px 7px;letter-spacing:0}
body[data-mode="portrait"] #touch{bottom:100px;right:12px;gap:10px}
body[data-mode="portrait"] .tbtn{width:60px;height:60px}
body[data-mode="landscape"] #hud-top{left:10px;top:8px}
body[data-mode="landscape"] #hud-top .chip{padding:4px 9px;font-size:11px}
body[data-mode="landscape"] #hud-lb{left:16px;bottom:7px;width:160px;height:70px;padding:5px 6px}
body[data-mode="landscape"] #lb-rows{grid-template-rows:repeat(4,15px);column-gap:0}
body[data-mode="landscape"] #hud-status{display:flex;left:12px;bottom:92px}
body[data-mode="landscape"] #touch{bottom:94px;right:12px;gap:10px}
body[data-mode="landscape"] .tbtn{width:58px;height:58px}
body[data-mode="landscape"] .sh .stitle{font-size:21px}
`};
})();

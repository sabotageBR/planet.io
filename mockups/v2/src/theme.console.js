// ── MODELO 2 — CONSOLE DE COMANDO ─────────────────────────────────────────────
// HUD como moldura fixa: barra superior (sala, ping, fps, tempo, powerups), barra
// inferior (cooldowns em 8 segmentos, mísseis, atalhos), trilho esquerdo com o
// placar em barras proporcionais à massa e trilho direito com minimapa + radar de
// ameaças. Nada arredondado, nada borrado: linhas de 1px, âmbar/verde fósforo sobre
// quase-preto, Courier em tudo. Menus são telas de terminal: coluna-índice à
// esquerda com atalhos entre colchetes, cabeçalhos invertidos, listas densas.
// Mundo: grade verde-escura, planeta = disco chapado + anel vetorial com 12 marcas +
// vetor de velocidade; asteroide wireframe; buraco negro com anéis tracejados
// contrarrotativos; rastro tracejado; efeitos = linhas, "×" e cantoneiras.
(function(){
const u=MOCK.u,WW=u.WW,WH=u.WH,rgba=u.rgba;
const AM="#ffb000",GN="#35ff8a",RD="#ff3b3b",TX="#d8e0e8",MU="#5a6b78",LN="#1f2a33",LN2="#2c3a46",GR="#8a97a3";
const PNL="rgba(14,21,28,.94)",T=800,FK=1.5,AK=1.3,BK=2.4,RNG=1000;
const MONO="'Courier New',Consolas,'Liberation Mono',monospace";
const F=px=>px+"px "+MONO;
let L=[];

// ── sprites ───────────────────────────────────────────────────────────────────
const PK=sk=>sk.ring?1.85:1.4;
function planetSpr(sk,isMe,size){
  return u.sprite("cp"+sk.id+(isMe?"m":"")+size,size,(c,R)=>{const K=PK(sk),r=R/K,col=sk.color,ring=isMe?AM:GR;
    if(sk.ring){c.strokeStyle=rgba(sk.glow||col,.8);c.lineWidth=Math.max(1.5,r*.1);c.beginPath();c.ellipse(0,0,r*1.7,r*.55,-.35,0,6.283);c.stroke();}
    c.fillStyle=col;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
    c.strokeStyle="rgba(0,0,0,.35)";c.lineWidth=Math.max(1,r*.04);c.beginPath();c.arc(0,0,r*.84,0,6.283);c.stroke();
    c.globalAlpha=.32;c.font=`${r*1.1}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillStyle="#000";c.fillText(sk.emoji,0,r*.06);c.globalAlpha=1;
    if(sk.ring){c.strokeStyle=rgba(sk.glow||col,.8);c.lineWidth=Math.max(1.5,r*.1);c.beginPath();c.ellipse(0,0,r*1.7,r*.55,-.35,0,3.1416);c.stroke();}
    c.strokeStyle=ring;c.lineWidth=Math.max(1,r*.028);c.beginPath();c.arc(0,0,r*1.18,0,6.283);c.stroke();
    c.lineWidth=Math.max(1,r*.035);c.beginPath();
    for(let i=0;i<12;i++){const a=i*.5236,l=i%3?r*.06:r*.13;c.moveTo(Math.cos(a)*r*1.18,Math.sin(a)*r*1.18);c.lineTo(Math.cos(a)*(r*1.18+l),Math.sin(a)*(r*1.18+l));}c.stroke();
    if(isMe){c.strokeStyle=rgba(AM,.35);c.lineWidth=1;c.beginPath();c.arc(0,0,r*1.34,0,6.283);c.stroke();}});}

function foodSpr(f){
  return u.sprite("cf"+f.type+f.color,40,(c,R)=>{const r=R/FK,col=f.color;c.strokeStyle=col;c.fillStyle=col;c.lineWidth=Math.max(1.5,r*.16);
    if(f.type==="missile_ammo"||f.type.indexOf("powerup_")===0){c.strokeRect(-r*.9,-r*.9,r*1.8,r*1.8);
      c.font=`${r*1.15}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillText({missile_ammo:"🚀",powerup_speed:"⚡",powerup_magnet:"🧲",powerup_shield:"🛡️"}[f.type],0,1);return;}
    if(f.type==="comet"){c.setLineDash([r*.3,r*.2]);c.beginPath();c.moveTo(-r*1.7,r*.2);c.lineTo(r*.2,-r*.1);c.stroke();c.setLineDash([]);c.beginPath();c.arc(r*.4,-r*.15,r*.32,0,6.283);c.fill();return;}
    if(f.type==="star"){c.beginPath();c.moveTo(-r*.9,0);c.lineTo(r*.9,0);c.moveTo(0,-r*.9);c.lineTo(0,r*.9);c.stroke();return;}
    if(f.type==="dust"){for(let i=0;i<4;i++){const a=i*1.57+.6;c.fillRect(Math.cos(a)*r*.45-1.5,Math.sin(a)*r*.45-1.5,3,3);}return;}
    c.fillRect(-r*.45,-r*.45,r*.9,r*.9);c.strokeStyle="rgba(0,0,0,.4)";c.lineWidth=1;c.strokeRect(-r*.45,-r*.45,r*.9,r*.9);});}

const ejSpr=col=>u.sprite("ce"+col,24,(c,R)=>{const r=R/1.6;c.fillStyle=col;c.beginPath();c.arc(0,0,r*.5,0,6.283);c.fill();
  c.strokeStyle=col;c.globalAlpha=.5;c.lineWidth=1;c.beginPath();c.arc(0,0,r*.95,0,6.283);c.stroke();});

function astSpr(variant,size){return u.sprite("ca"+variant+size,size,(c,R)=>{const r=R/AK,seed=11+variant*7,n=9+variant*2;
  u.astPoly(c,r,seed,n);c.fillStyle="rgba(14,21,28,.6)";c.fill();c.strokeStyle=GR;c.lineWidth=Math.max(1.5,r*.045);c.stroke();
  c.save();c.scale(.5,.5);u.astPoly(c,r,seed,n);c.restore();c.strokeStyle=rgba("#8a97a3",.4);c.lineWidth=1;c.setLineDash([r*.12,r*.1]);c.stroke();c.setLineDash([]);
  const s=u.astShape(seed,n);c.strokeStyle=rgba("#8a97a3",.3);c.beginPath();for(let i=0;i<n;i+=3){const a=i/n*6.283;c.moveTo(0,0);c.lineTo(Math.cos(a)*r*s[i],Math.sin(a)*r*s[i]);}c.stroke();
  c.fillStyle=GR;c.fillRect(-2,-2,4,4);});}

const bhSpr=()=>u.sprite("cbh",256,(c,R)=>{const r=R/BK;
  c.fillStyle="#000";c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
  c.strokeStyle=AM;c.lineWidth=Math.max(2,r*.08);c.beginPath();c.arc(0,0,r*1.03,0,6.283);c.stroke();
  c.strokeStyle=rgba(AM,.6);c.lineWidth=r*.05;c.setLineDash([r*.25,r*.18]);c.beginPath();c.arc(0,0,r*1.5,0,6.283);c.stroke();
  c.strokeStyle=rgba(RD,.5);c.lineWidth=r*.04;c.setLineDash([r*.12,r*.32]);c.beginPath();c.arc(0,0,r*2.1,0,6.283);c.stroke();c.setLineDash([]);});

// ── helpers de HUD (canvas) ───────────────────────────────────────────────────
function panel(c,x,y,w,h){c.fillStyle=PNL;c.fillRect(x,y,w,h);}
function hline(c,x0,x1,y,col){c.fillStyle=col||LN2;c.fillRect(x0,y,x1-x0,1);}
function vline(c,x,y0,y1,col){c.fillStyle=col||LN2;c.fillRect(x,y0,1,y1-y0);}
function hdr(c,x,y,w,s){c.fillStyle=AM;c.fillRect(x,y,w,16);c.fillStyle="#000";c.font="bold "+F(11);c.textAlign="left";c.textBaseline="middle";c.fillText(s,x+6,y+8.5);}
function txt(c,s,x,y,col,al,bold,px){c.fillStyle=col;c.font=(bold?"bold ":"")+F(px||11);c.textAlign=al||"left";c.textBaseline="middle";c.fillText(s,x,y);}
function segs(c,x,y,p,ready,w,h,gap){const n=Math.round(Math.max(0,Math.min(1,p))*8);
  for(let i=0;i<8;i++){c.fillStyle=i<n?(ready?GN:AM):LN2;c.fillRect(x+i*(w+gap),y,w,h);}return 8*(w+gap)-gap;}
function pips(c,x,y,n,max){for(let i=0;i<max;i++){const sx=x+i*13;c.fillStyle=i<n?RD:LN2;c.beginPath();c.moveTo(sx+4.5,y-5);c.lineTo(sx+9,y+4);c.lineTo(sx,y+4);c.closePath();c.fill();}return max*13;}
function brackets(c,x,y,b,l){c.beginPath();[[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx,sy])=>{c.moveTo(x+sx*b,y+sy*(b-l));c.lineTo(x+sx*b,y+sy*b);c.lineTo(x+sx*(b-l),y+sy*b);});c.stroke();}
const center=p=>({x:p.pieces.reduce((s,q)=>s+q.x,0)/p.pieces.length,y:p.pieces.reduce((s,q)=>s+q.y,0)/p.pieces.length});
const maxR=p=>p.pieces.reduce((m,q)=>Math.max(m,q.r),0);
const cls=k=>k>=1.15?[RD,"▲"]:k<=1/1.15?[GN,"▼"]:[AM,"◆"];
function map(c,x,y,S,g){c.fillStyle="#05080b";c.fillRect(x,y,S,S);c.fillStyle=LN;
  for(let i=1;i<4;i++){c.fillRect(x+S*i/4,y,1,S);c.fillRect(x,y+S*i/4,S,1);}
  u.minimap(c,x,y,S,g,{me:AM,player:TX,bot:MU,ast:GR,hole:rgba(RD,.6),view:rgba(AM,.4)});
  c.strokeStyle=LN2;c.lineWidth=1;c.strokeRect(x+.5,y+.5,S-1,S-1);}
function radar(c,cx,cy,R,g,me,t){
  c.fillStyle="#05080b";c.beginPath();c.arc(cx,cy,R,0,6.283);c.fill();
  c.strokeStyle=LN2;c.lineWidth=1;for(let i=1;i<=3;i++){c.beginPath();c.arc(cx,cy,R*i/3,0,6.283);c.stroke();}
  c.beginPath();c.moveTo(cx-R,cy);c.lineTo(cx+R,cy);c.moveTo(cx,cy-R);c.lineTo(cx,cy+R);c.stroke();
  const a=(t*.0022)%6.283;c.fillStyle=rgba(GN,.08);c.beginPath();c.moveTo(cx,cy);c.arc(cx,cy,R,a-.8,a);c.closePath();c.fill();
  c.strokeStyle=rgba(GN,.7);c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.cos(a)*R,cy+Math.sin(a)*R);c.stroke();
  if(!me||me.dead||!me.pieces.length){txt(c,"SEM SINAL",cx,cy+R*.5,RD,"center",true);return;}
  const mc=center(me),sc=R/RNG,mr=maxR(me)||1;
  c.save();c.beginPath();c.arc(cx,cy,R,0,6.283);c.clip();
  g.holes.forEach(h=>{if(h.k<=0)return;const dx=h.x-mc.x,dy=h.y-mc.y;if(Math.hypot(dx,dy)>RNG+h.ri*h.k)return;
    c.strokeStyle=rgba(RD,.6);c.setLineDash([4,4]);c.beginPath();c.arc(cx+dx*sc,cy+dy*sc,h.ri*h.k*sc,0,6.283);c.stroke();c.setLineDash([]);
    c.fillStyle=RD;c.fillRect(cx+dx*sc-2,cy+dy*sc-2,4,4);});
  g.asteroids.forEach(o=>{const dx=o.x-mc.x,dy=o.y-mc.y;if(Math.hypot(dx,dy)<RNG){c.fillStyle=GR;c.fillRect(cx+dx*sc-1,cy+dy*sc-1,2,2);}});
  Object.values(g.players).forEach(p=>{if(p===me||p.dead)return;p.pieces.forEach(q=>{const dx=q.x-mc.x,dy=q.y-mc.y;if(Math.hypot(dx,dy)>RNG)return;
    c.fillStyle=cls(q.r/mr)[0];c.fillRect(cx+dx*sc-2,cy+dy*sc-2,4,4);});});
  g.missiles.forEach(m=>{if(m.target!==g.me)return;const dx=m.x-mc.x,dy=m.y-mc.y;if(Math.hypot(dx,dy)>RNG)return;
    c.fillStyle=RD;c.beginPath();c.moveTo(cx+dx*sc,cy+dy*sc-4);c.lineTo(cx+dx*sc+4,cy+dy*sc+3);c.lineTo(cx+dx*sc-4,cy+dy*sc+3);c.closePath();c.fill();});
  c.restore();
  c.fillStyle=AM;c.fillRect(cx-2,cy-2,4,4);c.strokeStyle=AM;c.strokeRect(cx-5.5,cy-5.5,11,11);}
function threats(g,me){if(!me||me.dead||!me.pieces.length)return[];const mc=center(me),mr=maxR(me)||1,out=[];
  Object.values(g.players).forEach(p=>{if(p===me||p.dead||!p.pieces.length)return;let best=null,bd=1e9;
    p.pieces.forEach(q=>{const d=Math.hypot(q.x-mc.x,q.y-mc.y);if(d<bd){bd=d;best=q;}});
    if(bd<1800)out.push({p,d:bd,k:best.r/mr});});
  return out.sort((a,b)=>a.d-b.d).slice(0,4);}
function threatList(c,x,y,w,g,me,lines){const list=threats(g,me);
  if(!list.length){txt(c,"— nenhum contato —",x+w/2,y+9,MU,"center");return;}
  list.slice(0,lines).forEach((o,i)=>{const [col,gl]=cls(o.k),yy=y+9+i*17;
    txt(c,gl+" "+o.p.name.slice(0,9),x+4,yy,col,"left",o.k>=1.15);txt(c,Math.round(o.d)+"u",x+w-46,yy,TX,"right");txt(c,o.k.toFixed(1)+"×",x+w-4,yy,col,"right");});}

window.THEME={
id:"console",name:"Console de Comando",
desc:"HUD como moldura fixa: barra superior, barra inferior com cooldowns em 8 segmentos, trilho esquerdo com o placar em barras e trilho direito com minimapa e radar de ameaças. Menus como telas de terminal em âmbar sobre preto: coluna-índice com atalhos entre colchetes, cabeçalhos invertidos, listas densas.",
tags:["tático","terminal","âmbar","denso"],swatch:["#ffb000","#0a0f14"],
tokens:{bg:"#0a0f14",surface:"#0e151c",text:"#d8e0e8",muted:"#5a6b78",accent:"#ffb000",accent2:"#35ff8a",danger:"#ff3b3b",ok:"#35ff8a",
  line:"#1f2a33",radius:"0px",radiusLg:"0px",space:"10px",fontUi:"'Courier New',Consolas,'Liberation Mono',monospace",fontMono:"'Courier New',Consolas,'Liberation Mono',monospace",shadow:"none"},
layout:{hud:"rails",nav:"terminal"},
rarityColor:{free:"#5a6b78",common:"#d8e0e8",rare:"#35ff8a",epic:"#ffb000",legendary:"#ff3b3b",earned:"#7cc7ff",secret:"#c66bff"},
labels:{title:"WARSPACE.IO",tagline:"CONSOLE DE COMANDO · CONQUISTE A GALÁXIA · DIVIDA · EJETE · DEVORE",
  play:"JOGAR",playAuto:"JOGAR (AUTO)",swap:"TROCAR",enter:"ENTRAR",create:"CRIAR SALA",exit:"SAIR",back:"◄ VOLTAR",
  guestNote:"modo convidado",claim:"REIVINDICAR CONTA",lbTitle:"PLACAR",top5:"TOP 5 HOJE",activeRooms:"SALAS ATIVAS",
  hint:"MOUSE mira · [ESPAÇO] dividir · [W] ejetar · [F]/[CLIQUE] míssil · [BTN DIR] dividir",
  dead:"SINAL PERDIDO",deadIcon:"⚠",deadSub:"telemetria final · a galáxia continua sem você",eatenBy:"ABSORVIDO POR",suckedBy:"SUGADO POR",
  respawn:"RENASCER",toLobby:"LOBBY",reconnTitle:"CONEXÃO PERDIDA",reconnSub:"reconectando… tentativa {n}/5"},

init(g){const rand=u.mulberry(23);
  L=[{f:.15,col:"rgba(53,255,138,.16)",stars:[]},{f:.4,col:"rgba(216,224,232,.28)",stars:[]}];
  L.forEach((l,i)=>{for(let k=0;k<(i?36:60);k++)l.stars.push({x:rand()*T,y:rand()*T,r:i?1.5:1});});},

mount(app){const tb=app.querySelector("#rk-table tbody");if(!tb)return;
  const upd=()=>{let max=0;const rows=Array.from(tb.querySelectorAll("tr")).map(r=>{const td=r.querySelector(".c-val");const v=td?parseFloat(td.textContent.replace(/\./g,"").replace(",","."))||0:0;max=Math.max(max,v);return[td,v];});
    rows.forEach(([td,v])=>{if(td)td.style.setProperty("--p",(max?v/max:0).toFixed(3));});};
  new MutationObserver(upd).observe(tb,{childList:true});upd();},

drawBg(c,W,H,cam,t,g){c.fillStyle="#05080b";c.fillRect(0,0,W,H);
  if(g&&g.prefs&&!g.prefs.parallax)return;
  L.forEach(l=>{c.fillStyle=l.col;const ox=((-cam.x*l.f*cam.scale)%T+T)%T,oy=((-cam.y*l.f*cam.scale)%T+T)%T;
    l.stars.forEach(s=>{const bx=(s.x+ox)%T,by=(s.y+oy)%T;for(let x=bx;x<W;x+=T)for(let y=by;y<H;y+=T)c.fillRect(x,y,s.r,s.r);});});},

drawWorld(c,cam,t,g){
  if(!g||!g.prefs||g.prefs.grid){u.grid(c,50,"rgba(53,255,138,.05)",1);u.grid(c,250,"rgba(53,255,138,.11)",1);}
  c.strokeStyle=rgba(AM,.75);c.lineWidth=2;c.strokeRect(0,0,WW,WH);
  c.strokeStyle=rgba(RD,.4);c.lineWidth=1.5;c.setLineDash([14,10]);c.strokeRect(-20,-20,WW+40,WH+40);c.setLineDash([]);
  c.strokeStyle=AM;c.lineWidth=3;[[0,0,1,1],[WW,0,-1,1],[0,WH,1,-1],[WW,WH,-1,-1]].forEach(([x,y,sx,sy])=>{c.beginPath();c.moveTo(x+sx*60,y);c.lineTo(x,y);c.lineTo(x,y+sy*60);c.stroke();});},

drawFood(c,f){const r=f.r*FK;c.drawImage(foodSpr(f),f.x-r,f.y-r,r*2,r*2);},
drawEjected(c,e){const r=e.r*1.6;c.drawImage(ejSpr(e.color),e.x-r,e.y-r,r*2,r*2);},
drawAsteroid(c,a){const r=a.r*AK;c.save();c.translate(a.x,a.y);c.rotate(a.rot);c.drawImage(astSpr(a.variant,u.tier(a.r)),-r,-r,r*2,r*2);c.restore();},

drawBlackHole(c,h,t){const k=h.k,rc=h.rc*k,ri=h.ri*k;
  c.strokeStyle=rgba(RD,.22);c.lineWidth=1;c.setLineDash([10,12]);c.lineDashOffset=h.spin*40;c.beginPath();c.arc(h.x,h.y,ri,0,6.283);c.stroke();
  c.strokeStyle=rgba(AM,.45);c.lineWidth=1.5;c.setLineDash([6,10]);c.lineDashOffset=-h.spin*60;c.beginPath();c.arc(h.x,h.y,rc*2.9,0,6.283);c.stroke();
  c.setLineDash([]);c.lineDashOffset=0;
  const R=rc*BK;c.save();c.translate(h.x,h.y);c.rotate(h.spin);c.globalAlpha=Math.min(1,k*1.2);c.drawImage(bhSpr(),-R,-R,R*2,R*2);c.restore();c.globalAlpha=1;},

drawTrail(c,pc,p,isMe){if(!u.trailPath(c,pc))return;c.strokeStyle=isMe?rgba(AM,.55):"rgba(216,224,232,.3)";c.lineWidth=1.2;c.setLineDash([3,7]);c.stroke();c.setLineDash([]);},

drawMissile(c,m){const tr=m.trail;
  if(tr.length>1){c.beginPath();c.moveTo(tr[0].x,tr[0].y);for(let i=1;i<tr.length;i++)c.lineTo(tr[i].x,tr[i].y);c.strokeStyle=rgba(RD,.55);c.lineWidth=1;c.setLineDash([4,4]);c.stroke();c.setLineDash([]);}
  c.save();c.translate(m.x,m.y);c.rotate(Math.atan2(m.vy,m.vx));c.fillStyle=RD;c.beginPath();c.moveTo(m.r*1.3,0);c.lineTo(-m.r*.8,m.r*.7);c.lineTo(-m.r*.4,0);c.lineTo(-m.r*.8,-m.r*.7);c.closePath();c.fill();
  c.strokeStyle="#fff";c.lineWidth=1;c.stroke();c.restore();},

drawCell(c,pc,p,isMe,t,prev,g){
  const r=pc.displayR||pc.r,sk=p.skin,d=r*PK(sk),pr=(g&&g.prefs)||{names:true,mass:true};
  c.drawImage(planetSpr(sk,isMe,u.tier(r)),pc.x-d,pc.y-d,d*2,d*2);
  c.save();c.translate(pc.x,pc.y);
  const sp=Math.hypot(pc.vx,pc.vy);
  if(sp>.5){const Lv=Math.min(r*2.4,r*.3+sp*7),ux=pc.vx/sp,uy=pc.vy/sp,x0=ux*r*1.36,y0=uy*r*1.36;
    c.strokeStyle=isMe?AM:"rgba(216,224,232,.6)";c.lineWidth=1.5;c.beginPath();c.moveTo(x0,y0);c.lineTo(x0+ux*Lv,y0+uy*Lv);c.stroke();
    c.fillStyle=c.strokeStyle;c.fillRect(x0+ux*Lv-2,y0+uy*Lv-2,4,4);}
  if(!isMe&&!prev&&g&&g.players){const me=g.players[g.me];
    if(me&&!me.dead&&me.pieces.length){const [col]=cls(pc.r/(maxR(me)||1)),b=r*1.5,l=r*.32;c.strokeStyle=col;c.lineWidth=1.5;brackets(c,0,0,b,l);}}
  if(pc.mergeTimer>0){c.strokeStyle=rgba(AM,.8);c.lineWidth=1.5;c.setLineDash([3,3]);c.beginPath();c.arc(0,0,r*1.26,-1.5708,-1.5708+(1-pc.mergeTimer/u.mergeTime(pc.r))*6.283);c.stroke();c.setLineDash([]);}
  const pw=Object.keys(p._powerups||{});
  if(pw.length){const cl={speed:AM,magnet:"#c66bff",shield:TX};
    pw.forEach((k,i)=>{c.strokeStyle=cl[k];c.lineWidth=1.5;c.setLineDash([r*.3,r*.2]);c.lineDashOffset=t*.02*(i%2?-1:1);c.beginPath();c.arc(0,0,r*(1.62+i*.14),0,6.283);c.stroke();});c.setLineDash([]);c.lineDashOffset=0;}
  if(!prev&&r>13){const fs=Math.max(11,r*.3);
    if(pr.names!==false)u.outText(c,p.name+(p.registered?" ✓":""),0,pr.mass!==false?-fs*.3:0,fs,"#fff","rgba(0,0,0,.8)",MONO);
    if(pr.mass!==false)u.outText(c,u.fmt(pc.r*pc.r),0,pr.names!==false?fs*.8:0,fs*.75,AM,"rgba(0,0,0,.8)",MONO);}
  c.restore();},

drawFx(c,f,t){const k=f.age/f.ttl,a=1-k;c.globalAlpha=a;c.lineWidth=1.5;const col=f.color&&f.color!=="#fff"?f.color:AM;
  switch(f.t){
    case "bounce":{const Lb=f.r*1.3;c.strokeStyle="#fff";c.lineWidth=2;c.beginPath();c.moveTo(f.x-f.nx*Lb,f.y-f.ny*Lb);c.lineTo(f.x+f.nx*Lb,f.y+f.ny*Lb);c.stroke();
      const s=f.r*.3*(1+k);c.strokeStyle=AM;c.beginPath();c.moveTo(f.x-s,f.y-s);c.lineTo(f.x+s,f.y+s);c.moveTo(f.x+s,f.y-s);c.lineTo(f.x-s,f.y+s);c.stroke();break;}
    case "pop":c.strokeStyle=AM;c.lineWidth=2;brackets(c,f.x,f.y,f.r*(1+k*1.8),f.r*.45);break;
    case "boom":{c.strokeStyle=RD;c.lineWidth=2.5;brackets(c,f.x,f.y,f.r*(.6+k*2),f.r*.5);const s=f.r*.5;c.beginPath();c.moveTo(f.x-s,f.y-s);c.lineTo(f.x+s,f.y+s);c.moveTo(f.x+s,f.y-s);c.lineTo(f.x-s,f.y+s);c.stroke();break;}
    case "eat":{const s=f.r*(1.6-k);c.strokeStyle=GN;c.beginPath();c.moveTo(f.x-s,f.y);c.lineTo(f.x+s,f.y);c.moveTo(f.x,f.y-s);c.lineTo(f.x,f.y+s);c.stroke();break;}
    case "suck":c.strokeStyle=RD;c.setLineDash([5,5]);c.beginPath();c.arc(f.x,f.y,f.r*(3-k*2.6),0,6.283);c.stroke();c.setLineDash([]);break;
    case "exit":case "split":case "merge":c.strokeStyle=col;brackets(c,f.x,f.y,f.r*(.7+k*1.2),f.r*.3);break;
    case "chip":c.strokeStyle=AM;for(let i=-1;i<=1;i++){const an=Math.atan2(f.ny,f.nx)+i*.5;c.beginPath();c.moveTo(f.x,f.y);c.lineTo(f.x+Math.cos(an)*f.r*3*k,f.y+Math.sin(an)*f.r*3*k);c.stroke();}break;
    case "shoot":c.strokeStyle=GR;for(let i=0;i<6;i++){const an=i/6*6.283;c.beginPath();c.moveTo(f.x+Math.cos(an)*f.r*(1+k),f.y+Math.sin(an)*f.r*(1+k));c.lineTo(f.x+Math.cos(an)*f.r*(1.5+k*1.5),f.y+Math.sin(an)*f.r*(1.5+k*1.5));c.stroke();}break;
    case "rock":c.strokeStyle=GR;c.beginPath();c.arc(f.x,f.y,f.r*.4*(1+k),0,6.283);c.stroke();break;}
  c.globalAlpha=1;},

drawHud(c,W,H,g,t,mode){
  const me=g.players[g.me],pr=g.prefs||{},alive=me&&!me.dead;
  const secs=me?Math.max(0,(g.tick-g.session.start)/60):0,time="T+"+u.fmtTime(secs);
  const nP=Object.values(g.players).filter(p=>!p.dead).length,pos="POS "+(g.myRank||"-")+"/"+nP;
  c.textBaseline="middle";
  if(mode==="desktop"){const TB=28,BB=32,LR=200,RR=200;
    panel(c,0,0,W,TB);panel(c,0,H-BB,W,BB);panel(c,0,TB,LR,H-TB-BB);panel(c,W-RR,TB,RR,H-TB-BB);
    hline(c,0,W,TB-1);hline(c,0,W,H-BB);vline(c,LR-1,TB,H-BB);vline(c,W-RR,TB,H-BB);
    txt(c,time+"   ·   "+pos,W/2,TB/2,AM,"center",true,12);
    // trilho esquerdo: sessão (abaixo do placar DOM: 22px de cabeçalho + 20px por linha)
    const y0=TB+22+g.lb.length*20+10;
    if(y0+16+6*16+8<=H-BB-112){hdr(c,0,y0,LR-1,"SESSÃO");const s=g.session;
      [["TEMPO",u.fmtTime(secs)],["ABATES",s.kills],["DIVISÕES",s.splits],["EJEÇÕES",s.ejects],["MASSA MÁX",u.fmt(s.maxMass)],["POSIÇÃO",(g.myRank||"-")+"/"+nP]]
        .forEach(([k,v],i)=>{const y=y0+16+12+i*16;txt(c,k,8,y,MU);txt(c,String(v),LR-10,y,TX,"right",true);});
      // telemetria do planeta (posição, vetor, peças) — só se couber acima do bloco de massa (DOM)
      const y1=y0+16+6*16+14;
      if(alive&&me.pieces.length&&y1+16+6*16+8<=H-BB-112){hdr(c,0,y1,LR-1,"TELEMETRIA");const mc=center(me),q=me.pieces[0],sp=Math.hypot(q.vx,q.vy),head=((Math.atan2(q.vy,q.vx)*57.2958)+450)%360;
        [["X",Math.round(mc.x)+"u"],["Y",Math.round(mc.y)+"u"],["VEL",sp.toFixed(1)+"u/t"],["RUMO",Math.round(head)+"°"],["PEÇAS",me.pieces.length+"/"+u.MAX_PIECES],["MÍSSEIS",me._missiles+"/3"]]
          .forEach(([k,v],i)=>{const y=y1+16+12+i*16;txt(c,k,8,y,MU);txt(c,String(v),LR-10,y,k==="MÍSSEIS"?RD:GN,"right",true);});}}
    // trilho direito: mapa, radar, ameaças
    let y=TB+8;hdr(c,W-RR+8,y,RR-16,"MAPA");y+=18;
    if(pr.minimap!==false)map(c,W-RR+8,y,RR-16,g);else{c.strokeStyle=LN2;c.strokeRect(W-RR+8.5,y+.5,RR-17,RR-17);txt(c,"MINIMAPA DESLIGADO",W-RR/2,y+(RR-16)/2,MU,"center");}
    y+=RR-16+10;hdr(c,W-RR+8,y,RR-16,"RADAR · "+RNG+"u");y+=18;
    radar(c,W-RR/2,y+86,84,g,me,t);y+=172+10;
    hdr(c,W-RR+8,y,RR-16,"AMEAÇAS");y+=18;threatList(c,W-RR+8,y,RR-16,g,me,4);
    // barra inferior: cooldowns em segmentos, mísseis, atalhos
    const yb=H-BB/2;let x=12;
    txt(c,"DIVIDIR",x,yb,AM,"left",true);x+=66;x+=segs(c,x,yb-5,1-g.splitCD/24,g.splitCD<=0,10,10,2)+8;txt(c,"[ESPAÇO]",x,yb,MU);x+=74;
    txt(c,"EJETAR",x,yb,AM,"left",true);x+=58;x+=segs(c,x,yb-5,1-g.ejectCD/7,g.ejectCD<=0,10,10,2)+8;txt(c,"[W]",x,yb,MU);x+=40;
    txt(c,"MÍSSEIS",x,yb,RD,"left",true);x+=64;x+=pips(c,x,yb,alive?me._missiles:0,3)+6;txt(c,"[F]",x,yb,MU);
    txt(c,"MOUSE mira  ·  [BTN DIR] dividir  ·  [CLIQUE] míssil / ejetar",W-12,yb,MU,"right");
    return;}
  if(mode==="portrait"){const TB=30,BB=96;
    panel(c,0,0,W,TB);panel(c,0,H-BB,W,BB);hline(c,0,W,TB-1);hline(c,0,W,H-BB);
    txt(c,time+" · "+pos,W-84,TB/2,AM,"right",true);
    if(pr.minimap!==false){const S=84;map(c,W-S-6,TB+6,S,g);}
    const yb=H-88;segs(c,W-224,yb,1-g.splitCD/24,g.splitCD<=0,7,8,1);segs(c,W-150,yb,1-g.ejectCD/7,g.ejectCD<=0,7,8,1);
    pips(c,W-76+13,yb+4,alive?me._missiles:0,3);return;}
  // landscape
  {const TB=26,BB=26;
    panel(c,0,0,W,TB);panel(c,0,H-BB,W,BB);hline(c,0,W,TB-1);hline(c,0,W,H-BB);
    txt(c,time+"  ·  "+pos,W/2,TB/2,AM,"center",true);
    if(pr.minimap!==false){const S=80;map(c,W-S-6,TB+6,S,g);}
    const yb=H-BB/2;let x=400;
    txt(c,"[ESPAÇO]",x,yb,MU);x+=66;x+=segs(c,x,yb-4,1-g.splitCD/24,g.splitCD<=0,8,8,2)+14;
    txt(c,"[W]",x,yb,MU);x+=30;x+=segs(c,x,yb-4,1-g.ejectCD/7,g.ejectCD<=0,8,8,2)+14;
    txt(c,"[F]",x,yb,MU);x+=28;pips(c,x,yb,alive?me._missiles:0,3);}},

paintSkin(c,sk,r){const d=r*PK(sk);c.drawImage(planetSpr(sk,false,u.tier(r)),-d,-d,d*2,d*2);},

css:`
/* ── BASE ── */
body{font-family:var(--font-ui);font-size:13px}
body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:45;background:repeating-linear-gradient(180deg,rgba(0,0,0,.16) 0 1px,transparent 1px 3px)}
body[data-mode="portrait"]::after,body[data-mode="landscape"]::after{display:none}
@keyframes blink{50%{opacity:0}}
@keyframes alert{50%{background:#7a1414}}
.card,.panel{background:var(--surface);border:1px solid var(--line);border-radius:0;padding:12px 14px;color:var(--text)}
.ph{background:var(--accent);color:#000;font:bold 11px var(--font-mono);letter-spacing:3px;text-transform:uppercase;padding:0 8px;height:22px;line-height:22px;margin:0 -14px 8px}
.card>.ph:first-child{margin-top:-12px}
.hint{font-size:11.5px;color:var(--muted);line-height:1.5}
.dim{color:var(--muted);opacity:1}
.reg{color:var(--ok);font-size:.9em}
.bot{color:var(--muted);font-size:.9em}
.code,.mono{letter-spacing:1px}
.coinbar{border:1px solid var(--accent);color:var(--accent);padding:4px 10px;font-size:12.5px;letter-spacing:1px}
.coinbar span{font-size:11px;color:var(--muted);letter-spacing:2px;text-transform:uppercase}
button{text-transform:uppercase;letter-spacing:1px}
.btn-primary{background:var(--accent);color:#000;border:1px solid var(--accent);padding:11px 14px;font-size:14px;font-weight:bold;letter-spacing:3px}
.btn-primary:hover{background:#ffc63d}
.btn-secondary{background:none;color:var(--accent);border:1px solid var(--accent);padding:9px 12px;font-size:12px;font-weight:bold}
.btn-secondary:hover,.btn-mini:hover{background:var(--accent);color:#000}
.btn-mini{border:1px solid var(--line);color:var(--text);padding:5px 10px;font-size:11px;white-space:nowrap}
.btn-link{color:var(--ok);font-size:11.5px;text-decoration:none}
.btn-link::before{content:"["}.btn-link::after{content:"]"}
.field label{font-size:11px;color:var(--accent);letter-spacing:2px;text-transform:uppercase}
.field label::before{content:"> "}
.field input,.code-row input{background:#05080b;border:1px solid var(--line);padding:9px 10px;font-size:15px;color:var(--ok);outline:none;letter-spacing:1px;font-family:var(--font-mono)}
.field input:focus,.code-row input:focus{border-color:var(--ok)}
.field input::placeholder,.code-row input::placeholder{color:var(--muted)}
select{background:#05080b;border:1px solid var(--line);padding:5px 8px;color:var(--ok);font-family:var(--font-mono)}
.seg{border:1px solid var(--line)}
.seg button{padding:6px 14px;font-size:11.5px;color:var(--muted);border-right:1px solid var(--line)}
.seg button:last-child{border-right:0}
.seg button.on{background:var(--accent);color:#000;font-weight:bold}
.nav{flex-direction:column;flex-wrap:nowrap;gap:0;border:1px solid var(--line);background:var(--surface);align-self:stretch}
.nav::before{content:"ÍNDICE";display:block;background:var(--accent);color:#000;font:bold 11px var(--font-mono);letter-spacing:3px;padding:0 10px;height:22px;line-height:22px}
.nav-btn{justify-content:flex-start;padding:9px 10px;border-bottom:1px solid var(--line);font-size:11.5px;letter-spacing:2px;color:var(--muted)}
.nav-btn::before{font-weight:bold;color:var(--accent)}
.nav-btn[data-nav="entry"]::before{content:"[E]"}.nav-btn[data-nav="lobby"]::before{content:"[S]"}.nav-btn[data-nav="rank"]::before{content:"[R]"}
.nav-btn[data-nav="profile"]::before{content:"[P]"}.nav-btn[data-nav="shop"]::before{content:"[L]"}.nav-btn[data-nav="prefs"]::before{content:"[O]"}
.nav-btn:hover{background:rgba(255,176,0,.12);color:var(--text)}
.nav-btn.on{background:var(--accent);color:#000;font-weight:bold}
.nav-btn.on::before{color:#000}
.nav-btn.on::after{content:"◄";margin-left:auto}
.sh{background:var(--accent);color:#000;gap:0;height:34px}
.sh .back{height:34px;padding:0 12px;border:0;border-right:1px solid rgba(0,0,0,.35);color:#000;font-weight:bold}
.sh .back:hover{background:#000;color:var(--accent)}
.sh .stitle{font:bold 14px var(--font-mono);letter-spacing:6px;text-transform:uppercase;padding:0 14px}
.sh .coinbar{height:34px;border:0;border-left:1px solid rgba(0,0,0,.35);color:#000;font-weight:bold}
th{background:var(--accent);color:#000;font:bold 11px var(--font-mono);letter-spacing:2px;text-transform:uppercase;padding:4px 8px}
td{font-size:12px;border-bottom:1px solid var(--line);padding:4px 8px}
#toast{background:var(--accent);color:#000;font:bold 12px var(--font-mono);letter-spacing:2px;text-transform:uppercase}
/* ── HUD ── */
#hud-top{top:0;left:0;right:0;height:28px;display:flex;align-items:stretch;gap:0}
#hud-top .chip{padding:0 10px;border-right:1px solid var(--line);font-size:11px;letter-spacing:1px;color:var(--text)}
#hud-top .chip i{color:var(--muted);text-transform:uppercase}
#hud-top .chip b{color:var(--accent)}
#h-exit{margin-left:auto;border:0;border-left:1px solid var(--line);padding:0 12px;color:var(--danger);font-weight:bold;font-size:11px}
#h-exit::before{content:"× "}
#h-exit:hover{background:var(--danger);color:#000}
#hud-status{display:contents}
#hud-ammo{display:none}
#hud-pw{position:absolute;z-index:5;top:0;right:66px;height:28px;display:flex;align-items:center;gap:6px}
.pw{font-size:0;border:1px solid var(--line);padding:2px 6px;height:20px;gap:3px}
.pw i,.pw b{font-size:11px}
.pw b{color:var(--text)}
.pw-speed{border-color:var(--accent)}.pw-magnet{border-color:#c66bff}.pw-shield{border-color:var(--text)}
#hud-cd{display:none!important}
#hud-lb{top:28px;left:0;width:200px;min-width:0;padding:0;border:0;background:transparent}
#hud-lb .ph{margin:0;letter-spacing:4px}
.lb-row{height:20px;padding:0 8px;font-size:11.5px;color:var(--text);border-bottom:1px solid rgba(31,42,51,.7);background:linear-gradient(90deg,rgba(255,176,0,.2) calc(var(--p)*100%),transparent 0)}
.lb-row.mine{background:linear-gradient(90deg,rgba(255,176,0,.5) calc(var(--p)*100%),rgba(255,176,0,.08) 0);color:#fff;font-weight:bold}
.lb-pos{color:var(--muted);min-width:1.6em}
.lb-row.top .lb-pos{color:var(--accent)}
.lb-val{color:var(--accent)}
#hud-score{bottom:32px;left:0;width:200px;min-width:0;padding:8px 10px;border:0;border-top:1px solid #2c3a46;background:transparent}
.score-big{font-size:24px;font-weight:bold;color:var(--accent)}
.score-sub{font-size:11px;color:var(--muted);letter-spacing:3px;margin-bottom:6px}
.score-row{font-size:11.5px;justify-content:space-between}
.score-row .k{color:var(--muted);text-transform:uppercase;font-size:11px}
.tbtn{border-radius:0;border:1px solid var(--accent);background:rgba(14,21,28,.92);color:var(--accent);font-weight:bold}
.tbtn span{font-size:11px}
.tbtn b{font-size:13px;color:var(--text)}
#t-fire{border-color:var(--danger);color:var(--danger)}
#t-fire.empty{opacity:.4}
/* ── ENTRADA ── */
.screen{background:rgba(10,15,20,.96)}
#s-entry{background:rgba(10,15,20,.9)}
.entry-wrap{width:min(1100px,100%);grid-template-columns:minmax(0,1fr) 300px;grid-template-areas:"brand brand" "main side"}
.brand-block{align-items:flex-start;text-align:left;border:1px solid var(--line);background:var(--surface);padding:12px 16px;gap:4px}
.brand{font-size:30px;font-weight:bold;letter-spacing:10px;color:var(--accent)}
.brand::before{content:"> "}
.brand::after{content:"▌";animation:blink 1s steps(1) infinite}
.tagline{font-size:11px;color:var(--ok);letter-spacing:2px}
.tagline::before{content:"// "}
.entry-main{display:grid;grid-template-columns:200px minmax(0,1fr);grid-template-areas:"links coins" "links name" "links skin" "links play" "links guest" "links hint";gap:10px 18px;align-items:start;padding:0}
.entry-main>.coinbar{grid-area:coins;justify-self:start;margin:12px 14px 0 0}
.entry-main>.field{grid-area:name;padding-right:14px}
.entry-main>.skinrow{grid-area:skin;margin-right:14px;width:auto}
.entry-main>.btn-primary{grid-area:play;margin-right:14px;width:auto}
.entry-main>.guest-note{grid-area:guest;justify-content:flex-start}
.entry-main>.hint{grid-area:hint;padding:0 14px 12px 0}
.entry-links{grid-area:links;display:flex;flex-direction:column;gap:0;border-right:1px solid var(--line);align-self:stretch}
.entry-links::before{content:"ÍNDICE";background:var(--accent);color:#000;font:bold 11px var(--font-mono);letter-spacing:3px;padding:0 10px;height:22px;line-height:22px}
.entry-links .btn-secondary{border:0;border-bottom:1px solid var(--line);text-align:left;padding:10px 10px;font-size:11.5px;letter-spacing:2px;color:var(--muted);font-weight:normal;width:auto}
.entry-links .btn-secondary::before{font-weight:bold;color:var(--accent);margin-right:6px}
.entry-links [data-go="lobby"]::before{content:"[S]"}.entry-links [data-go="rank"]::before{content:"[R]"}.entry-links [data-go="profile"]::before{content:"[P]"}
.entry-links [data-go="shop"]::before{content:"[L]"}.entry-links [data-go="prefs"]::before{content:"[O]"}
.entry-links .btn-secondary:hover{background:var(--accent);color:#000}
.entry-links .btn-secondary:hover::before{color:#000}
.btn-primary[data-go="play"]::before{content:"[ENTER] "}
.skinrow{border:1px solid var(--line);background:#05080b;padding:8px 10px}
.skinrow canvas{border:1px solid var(--line)}
.skinmeta b{font-size:13px}.skinmeta i{font-style:normal;font-size:11px;letter-spacing:2px;text-transform:uppercase}
.guest-note{font-size:11.5px;color:var(--muted);letter-spacing:1px;text-transform:uppercase}
.guest-note[data-kind="registered"] .gn-txt{color:var(--ok)}
.entry-side .mini-rank{margin-bottom:6px}
.mr-row{font-size:12px;padding:3px 0;border-bottom:1px solid var(--line)}
.mr-pos{color:var(--accent)}.mr-val{color:var(--accent)}
.mini-rooms .mr-row .code{color:var(--ok)}
/* ── CONTA ── */
.overlay{background:rgba(5,8,11,.8)}
.modal{padding:0;gap:0}
.modal-title{background:var(--accent);color:#000;font:bold 13px var(--font-mono);letter-spacing:6px;text-transform:uppercase;padding:8px 14px}
.modal .tabs{margin:12px 14px 0}
.tabs button{flex:1;padding:8px;font-size:11.5px;color:var(--muted);border:1px solid var(--line)}
.tabs button[data-tab="claim"]::before{content:"[1] "}.tabs button[data-tab="login"]::before{content:"[2] "}
.tabs button.on{background:var(--accent);color:#000;font-weight:bold}
.modal .tab{padding:12px 14px 14px}
.modal-actions button{flex:1;padding:10px;font-size:12px}
/* ── LOBBY ── */
.lobby-wrap{width:min(1100px,100%);grid-template-columns:170px minmax(0,1fr) 250px;grid-template-areas:"nav head head" "nav hero side" "nav list side"}
.lobby-hero .hint{font-size:11px;text-transform:uppercase;letter-spacing:1px}
.lobby-hero .btn-primary::before{content:"[A] "}
.me-chip canvas{border:1px solid var(--line);background:#05080b}
.me-chip b{font-size:14px}.me-chip i{font-style:normal;font-size:11px;letter-spacing:2px;color:var(--muted);text-transform:uppercase}
.me-chip i[data-kind="registered"]{color:var(--ok)}
.code-row .btn-secondary{width:auto;padding:0 12px}
.code-row .btn-secondary:nth-of-type(1)::before{content:"[↵] "}
.code-row .btn-secondary:nth-of-type(2)::before{content:"[C] "}
.room-list{padding:0}
.room-row{font-size:12px;padding:5px 10px;border-bottom:1px solid var(--line)}
.room-row.head{background:var(--accent);color:#000;font-weight:bold;font-size:11px;letter-spacing:2px;text-transform:uppercase;border:0}
.room-row .code{color:var(--ok);font-size:14px;letter-spacing:2px}
.room-row.head .code{color:#000;font-size:11px}
.room-row:not(.head):hover,.room-row:nth-child(2){background:rgba(255,176,0,.12)}
.room-row:nth-child(2) .code::before{content:"▸ ";color:var(--accent)}
.room-row .bar{width:80px;height:8px;color:var(--ok);background:repeating-linear-gradient(90deg,var(--line) 0 6px,transparent 6px 8px)}
.room-row .bar::after{background:repeating-linear-gradient(90deg,currentColor 0 6px,transparent 6px 8px)}
.room-row.full{opacity:.55}.room-row.full .bar{color:var(--danger)}
.room-list::after{content:"[↑↓] NAVEGAR   [↵] ENTRAR   [A] AUTO   [C] CRIAR   [E] VOLTAR";display:block;font-size:11px;color:var(--muted);padding:8px 10px;letter-spacing:1px;white-space:pre}
/* ── RANKING ── */
.rank-wrap{width:min(1100px,100%);grid-template-columns:170px minmax(0,1fr);grid-template-areas:"nav head" "nav toggles" "nav table" "nav me"}
.rank-table{padding:0}
#rk-table td{font-size:12px}
#rk-table .c-val::before{content:"";display:inline-block;width:calc(var(--p,0)*90px);height:8px;background:var(--accent);margin-right:8px;vertical-align:middle}
#rk-table tr.me td{background:var(--accent);color:#000;font-weight:bold}
#rk-table tr.me .c-val::before{background:#000}
#rk-table tr.me .c-nick::before{content:"▸ "}
#rk-table tr.top1 .c-rank{color:var(--accent);font-weight:bold}#rk-table tr.top2 .c-rank{color:var(--text)}#rk-table tr.top3 .c-rank{color:#c88c5a}
.c-delta.up{color:var(--ok)}.c-delta.down{color:var(--danger)}
.rank-me{color:var(--accent);padding:10px 14px;text-transform:uppercase;letter-spacing:1px}
.rank-me b{font-size:20px}
/* ── PERFIL ── */
.profile-wrap{width:min(1100px,100%);grid-template-columns:170px minmax(0,1fr) minmax(0,1fr);grid-template-areas:"nav head head" "nav phead stats" "nav hist ach"}
.profile-head canvas{border:1px solid var(--line);background:#05080b}
.pf-nick{font-size:20px;font-weight:bold;letter-spacing:2px;color:var(--accent)}
.pf-kind{font-style:normal;font-size:11px;letter-spacing:2px;color:var(--muted);text-transform:uppercase}
.pf-kind[data-kind="registered"]{color:var(--ok)}
.pf-meta .coinbar{align-self:flex-start}
.stat-cards{grid-template-columns:repeat(3,1fr);gap:8px}
.stat{padding:10px 6px}
.stat b{font-size:18px;color:var(--accent);font-weight:bold}.stat i{font-style:normal;font-size:11px;letter-spacing:1px;color:var(--muted);text-transform:uppercase}
.pf-hist td{font-size:11.5px;padding:3px 6px}
.pf-hist td.cause{color:var(--muted)}
.pf-hist td.cause.blackhole{color:var(--danger)}.pf-hist td.cause i{font-style:normal;color:var(--text)}
.ach-grid{grid-template-columns:1fr;gap:6px}
.ach{padding:6px 8px;border:1px solid var(--line);opacity:.6}
.ach.done{opacity:1;border-color:var(--ok)}
.ach.secret{opacity:.4}
.ach-ico{font-size:18px}
.ach b{font-size:12px}.ach i{font-size:11px;color:var(--muted)}
.ach-bar{background:var(--line);color:var(--accent);height:6px;margin-top:3px}
.ach.done .ach-bar{color:var(--ok)}
.ach-coins{font-style:normal;font-size:11.5px;color:var(--accent)}
/* ── LOJA ── */
.shop-wrap{width:min(1100px,100%);grid-template-columns:170px minmax(0,1fr);grid-template-areas:"nav head" "nav eq" "nav filters" "nav grid" "nav note"}
.shop-eq canvas{border:1px solid var(--line);background:#05080b}
.shop-eq .badge{position:static;margin-left:auto}
.filters button{padding:5px 10px;border:1px solid var(--line);font-size:11px;color:var(--muted)}
.filters button.on{background:var(--rc,var(--accent));color:#000;border-color:var(--rc,var(--accent));font-weight:bold}
.shop-grid{grid-template-columns:repeat(6,1fr);gap:8px;max-height:52vh;padding:2px}
.skin-card{background:var(--surface);border:1px solid var(--line);border-top:3px solid var(--rc);padding:8px 6px;gap:2px}
.skin-card canvas{width:56px;height:56px}
.skin-card:hover{border-color:var(--rc);background:rgba(255,176,0,.08)}
.skin-card.eq{border-color:var(--accent);background:rgba(255,176,0,.16)}
.skin-card.locked,.skin-card.secret{opacity:.5}.skin-card.poor em{color:var(--danger)}
.skin-card b{font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.skin-card i{font-style:normal;font-size:11px;letter-spacing:1px;color:var(--rc);text-transform:uppercase}
.skin-card em{font-style:normal;font-size:11.5px;color:var(--accent);text-transform:uppercase}
.badge{background:var(--accent);color:#000;font-size:11px;font-weight:bold;padding:2px 6px;letter-spacing:1px}
.skin-card .badge{top:-3px;left:-1px;right:-1px;text-align:center;padding:1px 4px}
.skin-card.eq{padding-top:18px}
/* ── PREFS ── */
.prefs-wrap{width:min(1100px,100%);grid-template-columns:170px minmax(0,1fr);grid-template-areas:"nav head" "nav groups" "nav foot"}
.prefs-groups{grid-template-columns:1fr 1fr;gap:10px}
.pg{padding:0 14px 6px}
.pg h2{background:var(--accent);color:#000;font:bold 11px var(--font-mono);letter-spacing:3px;text-transform:uppercase;padding:0 8px;height:22px;line-height:22px;margin:0 -14px 4px}
.pref-row{border-bottom:1px solid var(--line);font-size:12.5px;padding:6px 0}
.pref-row label::before{content:"· ";color:var(--muted)}
.toggle{width:auto;height:auto;border-radius:0;background:none;color:var(--muted);font:bold 13px var(--font-mono);letter-spacing:1px}
.toggle i{display:none}
.toggle::before{content:"[ ]"}
.toggle[aria-checked="true"]{color:var(--ok)}
.toggle[aria-checked="true"]::before{content:"[x]"}
input[type=range]{accent-color:var(--accent)}
.range b{color:var(--accent)}
.prefs-foot button{padding:9px 18px}
#pf-save::before{content:"[ENTER] "}
/* ── MORTE ── */
#s-dead .dead-card{width:min(760px,100%);padding:0;gap:0;border-color:var(--danger)}
.dead-icon{display:none}
.dead-title{width:100%;background:var(--danger);color:#000;font-size:26px;font-weight:bold;letter-spacing:12px;text-align:center;padding:14px 10px;animation:alert 1s steps(1) infinite}
.dead-title::before{content:"!! "}.dead-title::after{content:" !!"}
.dead-sub{width:100%;text-align:center;font-size:11.5px;color:var(--danger);letter-spacing:2px;text-transform:uppercase;padding:8px;border-bottom:1px solid var(--line)}
.dead-by{width:100%;flex-direction:row;justify-content:center;gap:12px;padding:12px;border-bottom:1px solid var(--line)}
.dead-by span,.dead-rank span{font-size:11px;color:var(--muted);letter-spacing:3px;text-transform:uppercase}
.dead-by b{font-size:20px;color:var(--accent);font-weight:bold}
.dead-stats{width:100%;display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-bottom:1px solid var(--line)}
.dead-stats div{padding:12px 6px;border-right:1px solid var(--line)}
.dead-stats div:last-child{border-right:0}
.dead-stats b{font-size:20px;color:var(--text);font-weight:bold}
.dead-stats i{font-style:normal;font-size:11px;color:var(--muted);letter-spacing:2px;text-transform:uppercase}
.dead-rank{width:100%;flex-direction:row;justify-content:center;gap:12px;padding:10px;border-bottom:1px solid var(--line)}
.dead-rank b{font-size:16px;color:var(--accent)}.dead-rank .arrow{color:var(--ok)}
.dead-actions{flex-direction:row;padding:12px;gap:8px}
.dead-actions .btn-primary::before{content:"[ENTER] "}
.dead-actions .btn-secondary::before{content:"[S] "}
/* ── RECONN ── */
.reconn{border-color:var(--danger);padding:0}
.spinner{display:none}
.rc-title{width:100%;background:var(--danger);animation:alert 1s steps(1) infinite}
.rc-title::before{content:"!! "}.rc-title::after{content:" !!"}
.rc-sub{font-size:12.5px;color:var(--ok);letter-spacing:1px;padding:16px 14px 6px;text-align:left;align-self:stretch}
.rc-sub::before{content:"> "}
.rc-sub::after{content:"▌";animation:blink 1s steps(1) infinite}
.reconn .btn-secondary{width:auto;margin:6px 14px 14px;align-self:flex-start}
.reconn .btn-secondary::before{content:"[S] "}
/* ── MOBILE ── */
body[data-mode="portrait"] .card,body[data-mode="landscape"] .card{padding:10px 12px}
body[data-mode="portrait"] .ph,body[data-mode="landscape"] .ph{margin:0 -12px 6px}
body[data-mode="portrait"] .card>.ph:first-child,body[data-mode="landscape"] .card>.ph:first-child{margin-top:-10px}
body[data-mode="portrait"] .nav,body[data-mode="landscape"] .nav{flex-direction:row;flex-wrap:wrap}
body[data-mode="portrait"] .nav::before,body[data-mode="landscape"] .nav::before{display:none}
body[data-mode="portrait"] .nav-btn,body[data-mode="landscape"] .nav-btn{padding:7px 8px;border:0;font-size:11px}
body[data-mode="portrait"] .nav-btn.on::after,body[data-mode="landscape"] .nav-btn.on::after{display:none}
body[data-mode="portrait"] .entry-main,body[data-mode="landscape"] .entry-main{display:flex;padding:12px}
body[data-mode="portrait"] .entry-main>*,body[data-mode="landscape"] .entry-main>*{margin:0!important;padding:0!important;width:100%}
body[data-mode="portrait"] .entry-links,body[data-mode="landscape"] .entry-links{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;border:0}
body[data-mode="portrait"] .entry-links::before,body[data-mode="landscape"] .entry-links::before{display:none}
body[data-mode="portrait"] .entry-links .btn-secondary,body[data-mode="landscape"] .entry-links .btn-secondary{border:1px solid var(--line);text-align:center;padding:8px 4px!important;font-size:11px}
body[data-mode="portrait"] .brand,body[data-mode="landscape"] .brand{font-size:22px;letter-spacing:6px}
body[data-mode="portrait"] .brand-block{width:100%}
body[data-mode="portrait"] .prefs-groups,body[data-mode="landscape"] .prefs-groups{grid-template-columns:1fr}
body[data-mode="portrait"] .shop-grid{grid-template-columns:repeat(3,1fr)}
body[data-mode="landscape"] .shop-grid{grid-template-columns:repeat(4,1fr)}
body[data-mode="portrait"] .dead-stats{grid-template-columns:repeat(2,1fr)}
body[data-mode="portrait"] .dead-stats div:nth-child(2){border-right:0}
body[data-mode="portrait"] .dead-stats div:nth-child(-n+2){border-bottom:1px solid var(--line)}
body[data-mode="portrait"] .dead-title{font-size:20px;letter-spacing:6px}
body[data-mode="portrait"] .dead-actions{flex-direction:column}
body[data-mode="portrait"] .room-list::after{white-space:normal}
body[data-mode="portrait"] .code-row .btn-secondary{padding:0 6px;font-size:11px;letter-spacing:0}
body[data-mode="portrait"] #hud-top{height:30px}
body[data-mode="portrait"] #hud-top .chip{padding:0 7px;font-size:11px;letter-spacing:0}
body[data-mode="portrait"] #hud-pw{top:34px;left:156px;right:auto;height:auto;flex-direction:column;align-items:flex-start;gap:4px}
body[data-mode="portrait"] #hud-lb{top:30px;width:150px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);background:rgba(14,21,28,.94)}
body[data-mode="portrait"] #hud-lb .ph{height:18px;line-height:18px;font-size:11px;letter-spacing:2px}
body[data-mode="portrait"] .lb-row{height:19px;padding:0 6px;font-size:11px}
body[data-mode="portrait"] #hud-score{bottom:8px;left:6px;width:146px;padding:5px 7px;border:1px solid var(--line)}
body[data-mode="portrait"] .score-big{font-size:18px}
body[data-mode="portrait"] .score-sub{margin-bottom:3px;letter-spacing:2px}
body[data-mode="portrait"] .score-row{font-size:11px}
body[data-mode="portrait"] #touch{bottom:12px;right:12px;gap:10px}
body[data-mode="portrait"] .tbtn{width:64px;height:64px}
body[data-mode="landscape"] #hud-top{height:26px}
body[data-mode="landscape"] #hud-top .chip{padding:0 8px}
body[data-mode="landscape"] #h-exit{padding:0 10px}
body[data-mode="landscape"] #hud-pw{top:0;left:200px;right:auto;height:26px}
body[data-mode="landscape"] #hud-lb{top:26px;width:150px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);background:rgba(14,21,28,.94)}
body[data-mode="landscape"] #hud-lb .ph{height:18px;line-height:18px;font-size:11px;letter-spacing:2px}
body[data-mode="landscape"] .lb-row{height:19px;padding:0 6px;font-size:11px}
body[data-mode="landscape"] #hud-score{bottom:0;left:0;width:auto;height:26px;padding:0 10px;border:0;display:flex;flex-direction:row;align-items:center;gap:12px}
body[data-mode="landscape"] .score-big{font-size:13px}
body[data-mode="landscape"] .score-sub{margin:0;letter-spacing:2px}
body[data-mode="landscape"] .score-row{font-size:11px}
body[data-mode="landscape"] #touch{bottom:32px;right:10px;gap:8px}
body[data-mode="landscape"] .tbtn{width:56px;height:56px}
`};
})();

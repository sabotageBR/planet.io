// ── MODELO 3 — ÓRBITA CLARA ───────────────────────────────────────────────────
// O único modelo claro: interface de "produto bem feito". Desktop com barra
// lateral fixa (Início / Salas / Ranking / Perfil / Loja / Opções) — o jogador
// nunca "volta ao menu", só troca de aba; no celular a mesma nav vira barra de
// abas no rodapé. Em jogo, HUD mínimo numa única barra superior (sala, top-3
// como chips, massa grande no centro, munição, sair), pílulas de ação no canto
// inferior direito e minimapa como cartão branco no canto inferior esquerdo.
// Mundo em papel claro com grade pontilhada; planetas como discos chapados de
// dois tons + contorno; comida = confete pastel; asteroide cinza; buraco negro
// = mancha de tinta com halo violeta; efeitos = anéis coral e confete.
// Contraste: todo texto ≥ 4,5:1 (índigo #4f5dff, coral escuro #d43d2c e verde
// #12805a em texto pequeno; coral/menta puros só em áreas grandes).
(function(){
const u=MOCK.u,WW=u.WW,WH=u.WH,sh=u.sh,rgba=u.rgba;
const INK="#1d2433",IND="#4f5dff",COR="#ff6a5c",MINT="#23c48e",AMB="#ffb020",VIO="#7c3aed",PAPER="#eef1f7",DOT="#d6dbe6",MUT="#6b7385";
const UI="system-ui,'Segoe UI',Roboto,sans-serif",T=640;
let L=[],bg=null,bgW=0,bgH=0;
const lum=h=>{if(!h||h[0]!=="#")return .5;const n=parseInt(h.slice(1),16);return((n>>16)*.299+(n>>8&255)*.587+(n&255)*.114)/255;};

// ── sprites ───────────────────────────────────────────────────────────────────
// planeta: disco chapado na cor da skin + crescente mais escuro (2 tons) + contorno; anel = faixa elíptica; "eu" = anel índigo
const PK=sk=>sk.ring?2.15:1.32;
function planetSpr(sk,isMe,size){
  return u.sprite("op"+sk.id+(isMe?"m":"")+size,size,(c,R)=>{
    const K=PK(sk),r=R/K,col=sk.color,dark=lum(col)<.3,cres=dark?sh(col,.32):sh(col,-.22),edge=dark?sh(col,.5):sh(col,-.42);
    const lw=Math.max(1.5,r*.045);
    if(sk.ring){c.save();c.scale(1,.32);c.strokeStyle=cres;c.globalAlpha=.55;c.lineWidth=r*.36;c.beginPath();c.arc(0,0,r*1.62,0,6.283);c.stroke();c.restore();}
    if(isMe){c.strokeStyle=IND;c.lineWidth=Math.max(2,r*.07);c.beginPath();c.arc(0,0,r*1.17,0,6.283);c.stroke();}
    c.fillStyle=cres;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
    c.save();c.beginPath();c.arc(0,0,r,0,6.283);c.clip();
    c.fillStyle=col;c.beginPath();c.arc(-r*.2,-r*.2,r*.94,0,6.283);c.fill();
    c.globalAlpha=.3;c.font=`${r*1.1}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(sk.emoji,0,r*.06);c.globalAlpha=1;c.restore();
    c.strokeStyle=edge;c.lineWidth=lw;c.beginPath();c.arc(0,0,r-lw/2,0,6.283);c.stroke();
    if(sk.ring){c.save();c.beginPath();c.rect(-R,0,R*2,R);c.clip();c.scale(1,.32);c.strokeStyle=cres;c.globalAlpha=.85;c.lineWidth=r*.36;c.beginPath();c.arc(0,0,r*1.62,0,6.283);c.stroke();
      c.strokeStyle=edge;c.globalAlpha=.5;c.lineWidth=r*.05;c.beginPath();c.arc(0,0,r*1.8,0,6.283);c.stroke();c.restore();}});}

// comida: confete pastel (pontos, pílulas, estrelinhas, quadradinhos) com contorno leve; power-ups = disco branco com aro colorido
const FK=2;
function foodSpr(f){
  return u.sprite("of"+f.type+f.color,64,(c,R)=>{const r=R/FK;c.lineJoin="round";
    if(f.type==="missile_ammo"||f.type.indexOf("powerup_")===0){
      c.shadowBlur=r*.5;c.shadowColor="rgba(29,36,51,.25)";c.fillStyle="#fff";c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.shadowBlur=0;
      c.strokeStyle=f.color;c.lineWidth=r*.2;c.beginPath();c.arc(0,0,r*.86,0,6.283);c.stroke();
      c.font=`${r*.95}px serif`;c.textAlign="center";c.textBaseline="middle";
      c.fillText({missile_ammo:"🚀",powerup_speed:"⚡",powerup_magnet:"🧲",powerup_shield:"🛡️"}[f.type],0,1);return;}
    c.fillStyle=f.color;c.strokeStyle="rgba(29,36,51,.22)";c.lineWidth=1.5;
    if(f.type==="comet"){u.rr(c,-r*2.1,-r*.42,r*3,r*.84,r*.42);c.fill();c.stroke();c.fillStyle="#fff";c.beginPath();c.arc(r*.45,0,r*.36,0,6.283);c.fill();return;}
    if(f.type==="star"){u.spikes(c,r*1.15,4,.4,0);c.fill();c.stroke();return;}
    if(f.type==="dust"){for(let i=0;i<3;i++){const a=i*2.1;c.beginPath();c.arc(Math.cos(a)*r*.42,Math.sin(a)*r*.42,r*.4,0,6.283);c.fill();c.stroke();}return;}
    c.save();c.rotate(.6);u.rr(c,-r*.8,-r*.8,r*1.6,r*1.6,r*.35);c.fill();c.stroke();c.restore();});}

const ejSpr=col=>u.sprite("oe"+col,40,(c,R)=>{const r=R/1.7;c.fillStyle="#fff";c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
  c.fillStyle=col;c.beginPath();c.arc(0,0,r*.76,0,6.283);c.fill();c.strokeStyle=rgba(col,.55);c.lineWidth=1.5;c.beginPath();c.arc(0,0,r-1,0,6.283);c.stroke();});

// asteroide: 3 silhuetas, cinza chapado, contorno e 2 crateras
const AK=1.3;
function astSpr(variant,size){return u.sprite("oa"+variant+size,size,(c,R)=>{const r=R/AK,seed=11+variant*7;
  c.fillStyle="#c3c9d6";u.astPoly(c,r,seed,9+variant*2);c.fill();c.strokeStyle="#8a93a6";c.lineJoin="round";c.lineWidth=Math.max(2,r*.06);c.stroke();
  const cr=u.mulberry(seed*3);for(let i=0;i<2;i++){const a=cr()*6.28,d=cr()*r*.45,c2=r*(.14+cr()*.14),x=Math.cos(a)*d,y=Math.sin(a)*d;
    c.fillStyle="#aab2c2";c.beginPath();c.arc(x,y,c2,0,6.283);c.fill();
    c.strokeStyle="#8a93a6";c.lineWidth=Math.max(1,r*.03);c.beginPath();c.arc(x,y,c2*.85,3.6,5.8);c.stroke();}
  c.fillStyle="rgba(255,255,255,.35)";c.beginPath();c.arc(-r*.35,-r*.38,r*.12,0,6.283);c.fill();});}

// buraco negro: mancha de tinta + halo violeta suave (sprite girado); os 3 arcos giram por quadro
const BK=2.4;
const bhSpr=()=>u.sprite("obh",256,(c,R)=>{const r=R/BK;
  const halo=c.createRadialGradient(0,0,r*.8,0,0,r*2.4);halo.addColorStop(0,rgba(VIO,.36));halo.addColorStop(.5,rgba(VIO,.12));halo.addColorStop(1,rgba(VIO,0));
  c.fillStyle=halo;c.beginPath();c.arc(0,0,r*2.4,0,6.283);c.fill();
  c.fillStyle=INK;u.astPoly(c,r*1.12,33,13);c.fill();c.beginPath();c.arc(0,0,r*.98,0,6.283);c.fill();
  c.strokeStyle=rgba(VIO,.5);c.lineWidth=Math.max(1.5,r*.06);c.beginPath();c.arc(0,0,r*.6,0,6.283);c.stroke();});

// cartão branco com sombra assada (minimapa)
const cardSpr=S=>u.sprite("ocard"+S,S+64,(c,R)=>{c.shadowBlur=22;c.shadowColor="rgba(29,36,51,.18)";c.shadowOffsetY=8;c.fillStyle="#fff";u.rr(c,-S/2,-S/2,S,S,14);c.fill();c.shadowBlur=0;});

window.THEME={
id:"orbit",name:"Órbita Clara",
desc:"O único modelo claro: interface de produto, acessível e amigável. Barra lateral fixa no desktop (abas em vez de \"voltar\"), barra de abas no celular, HUD numa única faixa superior com a massa no centro, cartões brancos com sombra suave e mundo em papel com grade pontilhada.",
tags:["claro","produto","acessível","limpo"],swatch:["#4f5dff","#ff6a5c"],
tokens:{bg:"#f5f7fb",surface:"#ffffff",text:"#1d2433",muted:"#6b7385",accent:"#4f5dff",accent2:"#ff6a5c",danger:"#d43d2c",ok:"#23c48e",
  line:"#e3e7ef",radius:"10px",radiusLg:"16px",space:"14px",fontUi:"system-ui,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",fontMono:"ui-monospace,'SF Mono',Menlo,Consolas,monospace",
  shadow:"0 8px 24px rgba(29,36,51,.08)"},
layout:{hud:"topbar",nav:"sidebar"},
rarityColor:{free:"#6b7385",common:"#4f5dff",rare:"#0ea5c9",epic:"#9333ea",legendary:"#e0a100",earned:"#12805a",secret:"#d43d2c"},
labels:{title:"🪐 Planet.io",tagline:"Conquiste a galáxia · divida · ejete · devore",play:"🚀 Jogar",playAuto:"🚀 Jogar agora",
  lobbyTitle:"Salas",rankTitle:"Ranking",profileTitle:"Perfil",shopTitle:"Loja de skins",prefsTitle:"Preferências",accountTitle:"Conta",
  reconnTitle:"Conexão perdida",top5:"Top 5 hoje",activeRooms:"Salas ativas",history:"Histórico",achievements:"Conquistas",roomCode:"Código",
  room:"Sala",lbTitle:"Placar",massLabel:"massa",split:"Dividir",eject:"Ejetar",fire:"Míssil",respawn:"⟳ Renascer",equipped:"Equipada",
  dead:"Absorvido",deadSub:"A galáxia continua sem você",eatenBy:"Devorado por",suckedBy:"Sugado por",rankWord:"Ranking diário",coinsEarned:"moedas ganhas",
  hint:"Mouse move · Espaço divide · W ejeta · F ou clique dispara míssil · botão direito divide"},

init(g){const rand=u.mulberry(23);
  L=[.22,.5].map((f,li)=>({f,stars:Array.from({length:li?40:60},()=>({x:rand()*T,y:rand()*T,r:li?2.5:1.5,a:li?.12:.08}))}));},

// a tela de entrada não tem nav no DOM da engine: clona a nav do lobby para ela (mesma marcação → mesmo CSS)
mount(app){const src=app.querySelector("#s-lobby .nav"),w=app.querySelector("#s-entry .wrap");if(!src||!w)return;
  const n=src.cloneNode(true);n.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("on",b.dataset.nav==="entry"));w.prepend(n);},

drawBg(c,W,H,cam,t,g){
  if(!bg||bgW!==W||bgH!==H){bgW=W;bgH=H;bg=document.createElement("canvas");bg.width=W;bg.height=H;
    const x=bg.getContext("2d"),D=Math.max(W,H);x.fillStyle="#e6e9f1";x.fillRect(0,0,W,H);
    [[.12,.18,IND,.07],[.88,.8,COR,.07],[.72,.12,MINT,.06],[.2,.86,VIO,.05]].forEach(([nx,ny,col,a])=>{const px=nx*W,py=ny*H,pr=D*.42;
      const g2=x.createRadialGradient(px,py,0,px,py,pr);g2.addColorStop(0,rgba(col,a));g2.addColorStop(1,rgba(col,0));x.fillStyle=g2;x.beginPath();x.arc(px,py,pr,0,6.283);x.fill();});}
  c.drawImage(bg,0,0);
  if(g&&g.prefs&&!g.prefs.parallax)return;
  c.fillStyle=IND;
  L.forEach(l=>{const ox=((-cam.x*l.f*cam.scale)%T+T)%T,oy=((-cam.y*l.f*cam.scale)%T+T)%T;
    l.stars.forEach(s=>{c.globalAlpha=s.a;const bx=(s.x+ox)%T,by=(s.y+oy)%T;for(let x=bx;x<W;x+=T)for(let y=by;y<H;y+=T)c.fillRect(x,y,s.r,s.r);});});
  c.globalAlpha=1;},

drawWorld(c,cam,t,g){
  c.fillStyle=PAPER;u.rr(c,0,0,WW,WH,28);c.fill();
  if(!g||!g.prefs||g.prefs.grid)u.gridDots(c,60,DOT,2);
  c.strokeStyle=rgba(IND,.1);c.lineWidth=16;u.rr(c,0,0,WW,WH,28);c.stroke();
  c.strokeStyle=rgba(IND,.45);c.lineWidth=4;u.rr(c,0,0,WW,WH,28);c.stroke();},

drawFood(c,f,t){const p=f.type==="star"?1+Math.sin(t*.003+f.seed)*.14:1,r=f.r*FK*p;c.drawImage(foodSpr(f),f.x-r,f.y-r,r*2,r*2);},
drawEjected(c,e){const r=e.r*1.7;c.drawImage(ejSpr(e.color),e.x-r,e.y-r,r*2,r*2);},

drawAsteroid(c,a,t){const r=a.r*AK;c.save();c.translate(a.x,a.y);c.rotate(a.rot);c.drawImage(astSpr(a.variant,u.tier(a.r)),-r,-r,r*2,r*2);c.restore();},

drawBlackHole(c,h,t){const k=h.k,rc=h.rc*k,ri=h.ri*k;
  c.strokeStyle=rgba(VIO,.16);c.lineWidth=1.5;c.setLineDash([5,11]);c.beginPath();c.arc(h.x,h.y,ri,h.spin*.2,h.spin*.2+6.283);c.stroke();c.setLineDash([]);
  const R=rc*BK;c.save();c.translate(h.x,h.y);c.rotate(h.spin);c.globalAlpha=Math.min(1,k*1.2);c.drawImage(bhSpr(),-R,-R,R*2,R*2);
  c.lineWidth=2;c.lineCap="round";
  for(let i=0;i<3;i++){c.strokeStyle=rgba(VIO,.6-i*.15);c.beginPath();const a0=h.spin*(1.6+i*.5)+i*2.1;c.arc(0,0,rc*(1.4+i*.32),a0,a0+1.7);c.stroke();}
  c.restore();c.globalAlpha=1;},

drawTrail(c,pc,p,isMe){if(!u.trailPath(c,pc))return;
  c.strokeStyle=rgba(p.color,isMe?.22:.14);c.lineWidth=Math.max(3,pc.r*.7);c.lineCap="round";c.lineJoin="round";c.stroke();},

drawMissile(c,m,t){
  m.trail.forEach((pt,i)=>{const a=i/m.trail.length;c.fillStyle=`rgba(255,106,92,${a*.35})`;c.beginPath();c.arc(pt.x,pt.y,m.r*a*.7,0,6.283);c.fill();});
  c.save();c.translate(m.x,m.y);c.rotate(Math.atan2(m.vy,m.vx));
  c.fillStyle="#fff";c.strokeStyle=COR;c.lineWidth=2.5;u.rr(c,-m.r,-m.r*.45,m.r*2,m.r*.9,m.r*.45);c.fill();c.stroke();
  c.fillStyle=COR;c.beginPath();c.arc(m.r*.55,0,m.r*.42,0,6.283);c.fill();
  c.fillStyle=INK;c.beginPath();c.moveTo(-m.r*.9,-m.r*.45);c.lineTo(-m.r*1.5,-m.r*.9);c.lineTo(-m.r*.5,-m.r*.45);c.closePath();c.fill();
  c.beginPath();c.moveTo(-m.r*.9,m.r*.45);c.lineTo(-m.r*1.5,m.r*.9);c.lineTo(-m.r*.5,m.r*.45);c.closePath();c.fill();c.restore();},

drawCell(c,pc,p,isMe,t,prev,g){
  const r=pc.displayR||pc.r,sk=p.skin,K=PK(sk),d=r*K,pr=(g&&g.prefs)||{names:true,mass:true};
  c.drawImage(planetSpr(sk,isMe,u.tier(r)),pc.x-d,pc.y-d,d*2,d*2);
  c.save();c.translate(pc.x,pc.y);
  if(pc.mergeTimer>0){c.strokeStyle=rgba(IND,.7);c.lineWidth=2.5;c.lineCap="round";c.beginPath();c.arc(0,0,r+7,-1.5708,-1.5708+(1-pc.mergeTimer/u.mergeTime(pc.r))*6.283);c.stroke();}
  const pw=Object.keys(p._powerups||{});
  if(pw.length){const cl={speed:AMB,magnet:"#d946ef",shield:IND};
    pw.forEach((k,i)=>{c.strokeStyle=cl[k];c.lineWidth=2.5;c.globalAlpha=.55+.4*Math.sin(t*.012+i);c.setLineDash([r*.3,r*.22]);
      c.beginPath();c.arc(0,0,r*(1.3+i*.14),t*.001*(i%2?-1:1),t*.001*(i%2?-1:1)+6.283);c.stroke();c.setLineDash([]);c.globalAlpha=1;});}
  if(!prev&&r>13){const fs=Math.max(11,r*.3),dark=lum(sk.color)<.45,fill=dark?"#fff":INK,st=dark?"rgba(0,0,0,.35)":"rgba(255,255,255,.65)";
    if(pr.names!==false)u.outText(c,p.name+(p.registered?" ✓":""),0,pr.mass!==false?-fs*.3:0,fs,fill,st,UI);
    if(pr.mass!==false)u.outText(c,u.fmt(pc.r*pc.r),0,pr.names!==false?fs*.78:0,fs*.72,fill,st,UI);}
  c.restore();},

drawFx(c,f,t){const k=f.age/f.ttl,a=1-k,col=f.color&&f.color[0]==="#"?f.color:null;c.lineWidth=2.5;c.lineCap="round";
  switch(f.t){
    case "bounce":c.strokeStyle=rgba(COR,a*.9);c.lineWidth=3;c.beginPath();c.arc(f.x,f.y,f.r*(.3+k*1.2),0,6.283);c.stroke();
      c.lineWidth=4;c.beginPath();c.moveTo(f.x-f.ny*f.r*.5,f.y+f.nx*f.r*.5);c.lineTo(f.x+f.ny*f.r*.5,f.y-f.nx*f.r*.5);c.stroke();break;
    case "pop":{const cs=[IND,COR,MINT,AMB,"#d946ef"];c.lineWidth=3;
      for(let i=0;i<10;i++){const an=i/10*6.283+.3,r0=f.r*(.7+k*1.3),r1=f.r*(1.1+k*2.2);c.strokeStyle=rgba(cs[i%5],a);
        c.beginPath();c.moveTo(f.x+Math.cos(an)*r0,f.y+Math.sin(an)*r0);c.lineTo(f.x+Math.cos(an)*r1,f.y+Math.sin(an)*r1);c.stroke();}break;}
    case "shoot":c.strokeStyle=`rgba(138,147,166,${a})`;for(let i=0;i<8;i++){const an=i/8*6.283;c.beginPath();c.moveTo(f.x+Math.cos(an)*f.r*(1+k),f.y+Math.sin(an)*f.r*(1+k));c.lineTo(f.x+Math.cos(an)*f.r*(1.5+k*1.4),f.y+Math.sin(an)*f.r*(1.5+k*1.4));c.stroke();}break;
    case "eat":c.globalAlpha=a;c.strokeStyle=f.color||MINT;c.beginPath();c.arc(f.x,f.y,f.r*(1.4-k),0,6.283);c.stroke();c.globalAlpha=1;break;
    case "suck":c.strokeStyle=rgba(VIO,a);c.beginPath();c.arc(f.x,f.y,f.r*(3-k*2.6),0,6.283);c.stroke();break;
    case "exit":case "split":case "merge":c.strokeStyle=rgba(col||IND,a);c.beginPath();c.arc(f.x,f.y,f.r*(.6+k*1.6),0,6.283);c.stroke();break;
    case "chip":c.strokeStyle=rgba(AMB,a);c.lineWidth=3;for(let i=-1;i<=1;i++){const an=Math.atan2(f.ny,f.nx)+i*.5;c.beginPath();c.moveTo(f.x,f.y);c.lineTo(f.x+Math.cos(an)*f.r*3*k,f.y+Math.sin(an)*f.r*3*k);c.stroke();}break;
    case "boom":c.strokeStyle=rgba(COR,a);c.lineWidth=6;c.beginPath();c.arc(f.x,f.y,f.r*(.5+k*2),0,6.283);c.stroke();
      c.fillStyle=`rgba(255,255,255,${a*.7})`;c.beginPath();c.arc(f.x,f.y,f.r*.5*a,0,6.283);c.fill();break;
    case "rock":c.strokeStyle=`rgba(138,147,166,${a*.6})`;c.beginPath();c.arc(f.x,f.y,f.r*.4*(1+k),0,6.283);c.stroke();break;}},

// barra superior branca (o DOM do HUD flutua sobre ela), pílula de posição ao lado da massa e minimapa em cartão
drawHud(c,W,H,g,t,mode){
  const BH=mode==="desktop"?56:mode==="portrait"?52:44;
  c.fillStyle="#fff";c.fillRect(0,0,W,BH);c.fillStyle="#e3e7ef";c.fillRect(0,BH,W,1);
  c.fillStyle="rgba(29,36,51,.045)";c.fillRect(0,BH+1,W,3);c.fillStyle="rgba(29,36,51,.02)";c.fillRect(0,BH+4,W,4);
  if(g.myRank){const px=W/2+(mode==="desktop"?58:mode==="portrait"?48:46),py=BH/2,txt=g.myRank+"º";
    c.font=`700 ${mode==="desktop"?12:11}px ${UI}`;c.textAlign="left";c.textBaseline="middle";const w=c.measureText(txt).width+14;
    c.fillStyle=g.myRank<=3?"#fff4dc":"#eef0ff";u.rr(c,px,py-11,w,22,11);c.fill();c.fillStyle=g.myRank<=3?"#7a4f00":IND;c.fillText(txt,px+7,py+1);}
  if(g.prefs&&!g.prefs.minimap)return;
  const MS=mode==="portrait"?92:mode==="landscape"?84:150,MP=mode==="desktop"?16:12,mx=MP,my=H-MS-MP;
  c.drawImage(cardSpr(MS),mx-32,my-32);
  c.fillStyle=DOT;for(let i=1;i<4;i++){c.fillRect(mx+MS*i/4,my+8,1,MS-16);c.fillRect(mx+8,my+MS*i/4,MS-16,1);}
  u.minimap(c,mx,my,MS,g,{me:IND,player:INK,bot:"#9aa3b5",ast:"#b3bac8",hole:rgba(VIO,.55),view:rgba(IND,.3)});
  if(mode==="desktop"){c.font=`700 9px ${UI}`;c.fillStyle=MUT;c.textAlign="left";c.textBaseline="top";c.fillText("MAPA",mx+8,my+6);}},

paintSkin(c,sk,r){const K=PK(sk),d=r*K;c.drawImage(planetSpr(sk,false,u.tier(r)),-d,-d+2,d*2,d*2);},

css:`
/* ── BASE ── */
body{font-family:var(--font-ui);font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
.screen{background:rgba(245,247,251,.96)}
.card,.panel{background:var(--surface);border:0;border-radius:var(--radius-lg);padding:18px 20px;color:var(--text);box-shadow:var(--shadow)}
.panel{padding:11px 15px;border-radius:var(--radius)}
.ph{font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);font-weight:700}
.hint{font-size:12px;color:var(--muted)}
.dim{color:var(--muted);opacity:1}
.reg{color:#12805a;font-size:.85em;font-weight:700}
.bot{color:var(--muted);font-size:.8em}
.code,.mono{font-family:var(--font-mono);letter-spacing:.5px}
.coinbar{background:#fff4dc;color:#7a4f00;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:700}
.coinbar span{font-size:11px;font-weight:600;opacity:.8}
.btn-primary{background:var(--accent);color:#fff;border-radius:12px;padding:13px 18px;font-size:15px;font-weight:700;box-shadow:0 6px 16px rgba(79,93,255,.28);transition:.12s}
.btn-primary:hover{background:#3d4be6;transform:translateY(-1px)}
.btn-secondary{background:#fff;border:1.5px solid var(--accent);color:var(--accent);border-radius:12px;padding:10px 14px;font-size:13.5px;font-weight:700;transition:.12s}
.btn-secondary:hover{background:#eef0ff}
.btn-mini{background:#eef0ff;color:var(--accent);border-radius:8px;padding:6px 12px;font-size:12.5px;font-weight:700;white-space:nowrap}
.btn-mini:hover{background:#dfe3ff}
.btn-link{color:var(--accent);font-weight:600;font-size:12.5px;text-decoration:underline}
.field label{font-size:12px;font-weight:600;color:var(--muted)}
.field input,.code-row input{background:#fff;border:1.5px solid var(--line);border-radius:10px;padding:11px 12px;font-size:15px;color:var(--text);outline:none}
.field input:focus,.code-row input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(79,93,255,.18)}
select{background:#fff;border:1.5px solid var(--line);border-radius:8px;padding:6px 10px;color:var(--text)}
.seg{background:#eaedf3;border-radius:10px;padding:3px;gap:2px}
.seg button{padding:6px 14px;border-radius:8px;font-size:12.5px;font-weight:600;color:var(--muted)}
.seg button.on{background:#fff;color:var(--text);box-shadow:0 1px 3px rgba(29,36,51,.14)}
.nav{position:fixed;left:0;top:0;bottom:0;width:200px;display:flex;flex-direction:column;gap:2px;padding:14px 10px;background:var(--surface);border-right:1px solid var(--line);z-index:12;flex-wrap:nowrap}
.nav::before{content:"🪐 Planet.io";font-size:17px;font-weight:800;letter-spacing:-.3px;padding:6px 12px 16px;color:var(--text)}
.nav::after{content:"v2 · Órbita Clara";margin-top:auto;font-size:11px;color:var(--muted);padding:10px 12px 4px}
.nav-btn{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;color:var(--muted);font-size:13.5px;font-weight:600;text-align:left;width:100%}
.nav-btn:hover{background:#f1f3f8;color:var(--text)}
.nav-btn.on{background:#eef0ff;color:var(--accent)}
.nav-ico{display:inline-flex;width:22px;justify-content:center;font-style:normal;font-size:16px}
.nav-btn[data-nav="entry"] .nav-ico::before{content:"🏠"}.nav-btn[data-nav="lobby"] .nav-ico::before{content:"🛰️"}.nav-btn[data-nav="rank"] .nav-ico::before{content:"🏆"}
.nav-btn[data-nav="profile"] .nav-ico::before{content:"👤"}.nav-btn[data-nav="shop"] .nav-ico::before{content:"🛍️"}.nav-btn[data-nav="prefs"] .nav-ico::before{content:"⚙️"}
.sh{padding:4px 0 2px}
.sh .back{display:none}
.sh .stitle{font-size:24px;font-weight:800;letter-spacing:-.4px;color:var(--text)}
th{font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);font-weight:700;border-bottom:1px solid var(--line);padding:8px}
td{font-size:13px;padding:9px 8px;border-bottom:1px solid #f1f3f8}
#toast{background:var(--text);color:#fff;border-radius:999px;font-size:13px;font-weight:600;box-shadow:var(--shadow)}
#app>.screen{padding:24px 28px 24px 228px}
/* ── HUD ── */
#hud>*{z-index:6}
#hud .panel{background:none;box-shadow:none;padding:0;border-radius:0}
#hud-top{top:0;left:0;right:0;height:56px;gap:8px;padding:0 16px}
#hud-top .chip{background:#f1f3f8;border-radius:999px;padding:6px 12px;font-size:12.5px;font-weight:700;color:var(--text)}
#hud-top .chip i{font-size:10px;color:var(--muted);letter-spacing:.8px;text-transform:uppercase;font-weight:700}
#h-room b{font-family:var(--font-mono);letter-spacing:1px}
#h-net{margin-left:auto;background:none;color:var(--muted);padding:0 6px}
#h-net b{font-weight:700}
#h-exit{background:#fff;border:1.5px solid var(--line);color:var(--muted);border-radius:999px;padding:7px 14px}
#h-exit:hover{border-color:var(--accent2);color:var(--danger);background:#fff0ee}
#hud-lb{top:0;left:122px;right:auto;min-width:0;height:56px;display:flex;align-items:center}
#hud-lb .ph{display:none}
#lb-rows{display:flex;gap:6px}
.lb-row{display:inline-flex;align-items:center;gap:6px;padding:3px 10px 3px 3px;border-radius:999px;background:#f1f3f8;font-size:12px;font-weight:600;color:var(--text);max-width:140px}
.lb-row:nth-child(n+4){display:none}
.lb-row::before{display:none}
.lb-pos{width:22px;height:22px;border-radius:50%;background:#c9cfdb;color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;min-width:0}
.lb-row:nth-child(1) .lb-pos{background:#ffb020;color:#5a3a00}.lb-row:nth-child(2) .lb-pos{background:#a7b0c2}.lb-row:nth-child(3) .lb-pos{background:#d99a63}
.lb-name{max-width:58px}
.lb-val{color:var(--muted);font-weight:700;font-size:11.5px}
.lb-row.mine{background:#eef0ff;color:var(--accent)}.lb-row.mine .lb-val{color:var(--accent)}
#hud-score{top:0;left:50%;bottom:auto;transform:translateX(-50%);min-width:0;height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;line-height:1}
.score-big{font-size:26px;font-weight:800;letter-spacing:-.5px;color:var(--text)}
.score-sub{font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted);margin:3px 0 0}
.score-row{display:none}
#hud-status{top:0;bottom:auto;left:auto;right:206px;height:56px;flex-direction:row;align-items:center;gap:6px}
#hud-ammo{background:#fff0ee;color:#d43d2c;border-radius:999px;padding:6px 12px;font-size:12.5px;font-weight:800}
#hud-ammo span{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px}
#hud-ammo.empty{background:#f1f3f8;color:var(--muted)}
.pw{background:#f1f3f8;border-radius:999px;padding:6px 10px;font-size:0;font-weight:800;color:var(--text)}
.pw i,.pw b{font-size:12px}
.pw-speed{background:#fff4dc;color:#7a4f00}.pw-magnet{background:#fbe8fb;color:#7a1f7a}.pw-shield{background:#e6f1ff;color:#1e4f9e}
#hud-cd{bottom:24px;right:24px;gap:10px}
.cd{width:auto;height:44px;padding:0 16px;border-radius:999px;background:#fff;box-shadow:var(--shadow);flex-direction:row;gap:8px;color:var(--muted)}
.cd .cd-fill{height:4px;bottom:0;background:var(--accent);z-index:0;opacity:.4}
.cd span{font-size:12.5px;font-weight:800}
.cd em{font-size:10px;font-weight:700;background:#f1f3f8;border-radius:6px;padding:2px 6px;color:var(--muted)}
.cd.ready{color:var(--text)}.cd.ready .cd-fill{opacity:1;background:var(--ok)}.cd.ready em{color:var(--accent);background:#eef0ff}
.tbtn{background:var(--accent);color:#fff;box-shadow:0 6px 16px rgba(79,93,255,.35);width:64px;height:64px}
.tbtn span{font-size:10.5px;font-weight:800;letter-spacing:.3px}
#t-eject{background:#fff;color:var(--accent);border:2px solid var(--accent);box-shadow:var(--shadow)}
#t-fire{background:var(--accent2);box-shadow:0 6px 16px rgba(255,106,92,.35)}
#t-fire.empty{background:#c9cfdb;box-shadow:none}
.tbtn.cd{opacity:.5}
/* ── ENTRADA ── */
#s-entry.on{align-items:center}
.entry-wrap{grid-template-columns:minmax(0,1fr) 300px;grid-template-areas:"brand brand" "main side";width:min(880px,100%);gap:18px}
.brand-block{align-items:flex-start;text-align:left;gap:4px}
.brand{font-size:36px;font-weight:800;letter-spacing:-1px;color:var(--text)}
.tagline{font-size:14px;color:var(--muted)}
.entry-main{padding:22px 24px;align-items:stretch;gap:14px}
.entry-main .coinbar{align-self:flex-start}
.skinrow{background:#f7f8fb;border-radius:12px;padding:10px 12px}
.skinmeta b{font-size:15px;font-weight:700}.skinmeta i{font-style:normal;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px}
.entry-links{display:none}
.guest-note{font-size:12.5px;color:var(--muted)}
.guest-note[data-kind="registered"] .gn-txt{color:#12805a;font-weight:700}
.entry-side{gap:6px}
.mr-row{font-size:13px;padding:5px 0;border-bottom:1px solid #f1f3f8}
.mr-pos{color:var(--muted);font-weight:700;font-size:12px}.mr-val{font-weight:700}
.mini-rooms .mr-row .code{font-weight:700;color:var(--accent)}
.entry-side .ph:nth-of-type(2){margin-top:14px}
/* ── CONTA ── */
.overlay{background:rgba(29,36,51,.45);backdrop-filter:blur(4px)}
.modal{padding:24px 26px}
.modal-title{font-size:20px;font-weight:800;letter-spacing:-.3px}
.tabs{background:#eaedf3;border-radius:10px;padding:3px;gap:2px}
.tabs button{flex:1;padding:8px;border-radius:8px;font-size:13px;font-weight:600;color:var(--muted)}
.tabs button.on{background:#fff;color:var(--text);box-shadow:0 1px 3px rgba(29,36,51,.14)}
.modal-actions button{flex:1;padding:11px;font-size:14px}
/* ── LOBBY ── */
.lobby-wrap{grid-template-columns:minmax(0,1fr) 280px;grid-template-areas:"head head" "hero side" "list side"}
.lobby-hero{padding:18px 20px}
.lobby-side{align-self:start}
.lobby-hero .hint{font-size:12px}
.room-list{background:none;box-shadow:none;padding:0;gap:8px}
.room-row{background:var(--surface);border-radius:12px;box-shadow:var(--shadow);padding:12px 16px;grid-template-columns:84px 60px 1fr 60px 60px 92px;font-size:13px;color:var(--text)}
.room-row.head{background:none;box-shadow:none;padding:2px 16px 0;font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);font-weight:700}
.room-row.head .code{font-family:var(--font-ui);font-size:11px;color:var(--muted)}
.room-row .code{font-size:16px;font-weight:800;color:var(--text)}
.room-row .shard,.room-row .bots,.room-row .ping{color:var(--muted)}
.room-row .bar{background:#e9ecf3;border-radius:3px;color:var(--ok)}
.room-row.full{opacity:.6}
.room-row .btn-mini{background:var(--accent);color:#fff;padding:7px 16px;border-radius:999px}
.room-row .btn-mini:disabled{background:#e3e7ef;color:var(--muted)}
.me-chip b{font-size:16px;font-weight:800}.me-chip i{font-style:normal;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)}
.me-chip i[data-kind="registered"]{color:#12805a}
/* ── RANKING ── */
.rank-wrap{grid-template-areas:"head" "toggles" "table" "me"}
.rank-table{padding:4px 8px}
#rk-table tbody tr:nth-child(even) td{background:#f7f8fb}
#rk-table td.c-nick::before{content:"";display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;vertical-align:-1px;background:var(--dc,#4f5dff)}
#rk-table tr:nth-child(6n+1){--dc:#4f5dff}#rk-table tr:nth-child(6n+2){--dc:#ff6a5c}#rk-table tr:nth-child(6n+3){--dc:#23c48e}
#rk-table tr:nth-child(6n+4){--dc:#ffb020}#rk-table tr:nth-child(6n+5){--dc:#9333ea}#rk-table tr:nth-child(6n){--dc:#0ea5c9}
#rk-table tr.me td{background:#eef0ff!important;color:var(--accent);font-weight:800}
#rk-table td.c-rank{color:var(--muted);font-weight:700}
#rk-table tr.top1 .c-rank{color:#b07600}#rk-table tr.top2 .c-rank{color:#6b7385}#rk-table tr.top3 .c-rank{color:#9a5a24}
.c-delta.up{color:#12805a;font-weight:700}.c-delta.down{color:var(--danger);font-weight:700}
.rank-me{background:var(--accent);color:#fff;padding:14px 20px;box-shadow:0 8px 24px rgba(79,93,255,.3)}
.rank-me b{font-size:24px;font-weight:800}
/* ── PERFIL ── */
.profile-wrap{grid-template-columns:1.25fr 1fr;grid-template-areas:"head head" "phead phead" "stats stats" "hist ach"}
.pf-nick{font-size:22px;font-weight:800;letter-spacing:-.3px}
.pf-kind{font-style:normal;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)}
.pf-kind[data-kind="registered"]{color:#12805a}
.pf-meta .coinbar{align-self:flex-start;margin-top:4px}
.stat{padding:14px 10px}
.stat b{font-size:22px;font-weight:800;color:var(--text)}.stat i{font-style:normal;font-size:11px;font-weight:600;color:var(--muted)}
.pf-hist td{font-size:12.5px;white-space:nowrap}
.pf-hist td.cause{color:var(--muted)}
.pf-hist td.cause.blackhole{color:#6d28d9}.pf-hist td.cause i{font-style:normal;color:var(--text);font-weight:600}
.ach-grid{grid-template-columns:1fr;gap:6px}
.ach{padding:8px 10px;border-radius:10px;background:#f7f8fb}
.ach.done{background:#e9f9f2}
.ach.secret{opacity:.55}
.ach b{font-size:13px;font-weight:700}.ach i{font-size:11.5px;color:var(--muted)}
.ach-bar{background:#e3e7ef;color:var(--accent);border-radius:2px;margin-top:4px}
.ach.done .ach-bar{color:var(--ok)}
.ach-coins{font-style:normal;font-size:12px;font-weight:700;color:#7a4f00;background:#fff4dc;border-radius:999px;padding:3px 8px}
/* ── LOJA ── */
.shop-eq .badge{position:static;margin-left:auto}
.filters button{padding:6px 12px;border-radius:999px;background:#fff;border:1.5px solid var(--line);font-size:12.5px;font-weight:600;color:var(--muted)}
.filters button.on{border-color:var(--rc,var(--accent));color:var(--rc,var(--accent));background:#fff;font-weight:700}
.shop-grid{grid-template-columns:repeat(4,1fr);gap:12px;padding:6px 8px 12px}
.skin-card{background:var(--surface);border-radius:var(--radius-lg);box-shadow:var(--shadow);color:var(--text);padding:16px 8px 12px;transition:.12s}
.skin-card::before{content:"";position:absolute;top:0;left:0;right:0;height:6px;background:var(--rc);border-radius:var(--radius-lg) var(--radius-lg) 0 0}
.skin-card:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(29,36,51,.14)}
.skin-card.eq{box-shadow:0 0 0 2px var(--accent),var(--shadow)}
.skin-card.locked,.skin-card.secret{opacity:.6}.skin-card.poor em{color:var(--danger)}
.skin-card b{font-size:13px;font-weight:700}.skin-card i{font-style:normal;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--rc)}
.skin-card em{font-style:normal;font-size:12.5px;font-weight:700;color:#7a4f00}
.skin-card.owned em{color:var(--accent)}
.badge{background:var(--accent);color:#fff;font-size:9.5px;font-weight:800;padding:3px 8px;border-radius:999px;letter-spacing:.5px;top:12px;right:8px}
/* ── PREFS ── */
.pg h2{font-size:15px;font-weight:800;letter-spacing:-.2px}
.pref-row{border-bottom:1px solid #f1f3f8;font-size:13.5px}
.toggle{background:#d9dde6;border:0;color:#fff;transition:.15s}
.toggle[aria-checked="true"]{background:var(--ok)}
.toggle i{box-shadow:0 1px 3px rgba(29,36,51,.3)}
input[type=range]{accent-color:var(--accent)}
.range b{font-weight:700;color:var(--muted)}
.prefs-foot button{padding:10px 22px}
/* ── MORTE ── */
#s-dead{background:rgba(29,36,51,.35);backdrop-filter:blur(5px);padding-left:24px}
.dead-card{padding:30px 34px;text-align:center}
.dead-icon{font-size:48px}
.dead-title{font-size:40px;font-weight:800;color:var(--accent2);letter-spacing:-1px}
.dead-sub{font-size:13px;color:var(--muted)}
.dead-by span,.dead-rank span{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)}
.dead-by b{font-size:22px;font-weight:800;color:var(--text)}
.dead-rank b{font-size:18px;font-weight:800;color:var(--text)}.dead-rank .arrow{color:var(--accent)}
.dead-stats{background:#f7f8fb;border-radius:12px;padding:12px 18px;gap:24px}
.dead-stats b{font-size:22px;font-weight:800;color:var(--text)}
.dead-stats i{font-style:normal;font-size:11px;font-weight:600;color:var(--muted)}
.dead-stats div:nth-child(4) b{color:#12805a}
/* ── RECONN ── */
.reconn{background:var(--surface);padding:28px}
.spinner{color:var(--accent);border-width:4px;border-top-color:#eef0ff}
.rc-title{color:var(--text)}
.rc-sub{font-size:13px;color:var(--muted)}
.reconn .btn-secondary{margin-top:4px}
/* ── MOBILE ── */
body[data-mode="portrait"] .nav,body[data-mode="landscape"] .nav{left:0;right:0;top:auto;bottom:0;width:auto;height:62px;flex-direction:row;gap:0;padding:6px 4px 4px;border-right:0;border-top:1px solid var(--line);justify-content:space-around}
body[data-mode="portrait"] .nav::before,body[data-mode="portrait"] .nav::after,body[data-mode="landscape"] .nav::before,body[data-mode="landscape"] .nav::after{display:none}
body[data-mode="portrait"] .nav-btn,body[data-mode="landscape"] .nav-btn{flex:1;flex-direction:column;gap:2px;padding:4px 2px;font-size:10.5px;border-radius:8px;text-align:center;width:auto}
body[data-mode="portrait"] .nav-ico,body[data-mode="landscape"] .nav-ico{font-size:20px;width:auto}
body[data-mode="portrait"] #app>.screen{padding:14px 14px 78px}
body[data-mode="landscape"] #app>.screen{padding:12px 14px 74px}
body[data-mode="landscape"] .nav{height:54px}
body[data-mode="landscape"] .nav-btn{flex-direction:row;gap:6px;font-size:11px}
body[data-mode="landscape"] .nav-ico{font-size:16px}
body[data-mode="portrait"] .card{padding:14px 14px}
body[data-mode="portrait"] .brand{font-size:28px}
body[data-mode="portrait"] .tagline{font-size:12.5px}
body[data-mode="portrait"] .sh .stitle{font-size:20px}
body[data-mode="portrait"] .btn-primary{padding:12px;font-size:15px}
body[data-mode="portrait"] .shop-grid{grid-template-columns:repeat(2,1fr)}
body[data-mode="portrait"] .room-row{grid-template-columns:66px 1fr 36px 72px;padding:10px 12px;gap:6px}
body[data-mode="portrait"] .room-row .bar{width:54px}
body[data-mode="portrait"] .room-row>*{min-width:0}
body[data-mode="portrait"] .room-row .btn-mini{padding:7px 12px}
body[data-mode="portrait"] #hud-top{height:52px;padding:0 12px}
body[data-mode="portrait"] #h-net{display:none!important}
body[data-mode="portrait"] #h-exit{margin-left:auto}
body[data-mode="portrait"] #hud-score{height:52px}
body[data-mode="portrait"] .score-big{font-size:22px}
body[data-mode="portrait"] #hud-lb{top:60px;left:auto;right:12px;height:auto}
body[data-mode="portrait"] #lb-rows{flex-direction:column;gap:4px;align-items:flex-end}
body[data-mode="portrait"] .lb-row{background:rgba(255,255,255,.92);box-shadow:var(--shadow);font-size:11.5px}
body[data-mode="portrait"] #hud-status{top:60px;right:auto;left:12px;bottom:auto;height:auto;flex-direction:column;align-items:flex-start}
body[data-mode="portrait"] #hud-ammo,body[data-mode="portrait"] .pw{box-shadow:var(--shadow)}
body[data-mode="portrait"] #hud-pw{flex-direction:column}
body[data-mode="portrait"] .tbtn{width:64px;height:64px}
body[data-mode="portrait"] #touch{bottom:20px;right:14px}
body[data-mode="landscape"] #hud-top{height:44px;padding:0 12px}
body[data-mode="landscape"] #hud-top .chip{padding:4px 10px;font-size:11.5px}
body[data-mode="landscape"] #h-net{display:none!important}
body[data-mode="landscape"] #h-exit{margin-left:auto;padding:5px 12px;font-size:12px}
body[data-mode="landscape"] #hud-lb{top:52px;left:12px;height:auto}
body[data-mode="landscape"] #lb-rows{flex-direction:column;gap:4px;align-items:flex-start}
body[data-mode="landscape"] .lb-row{background:rgba(255,255,255,.92);box-shadow:var(--shadow);font-size:11px;padding:2px 8px 2px 2px;max-width:150px}
body[data-mode="landscape"] .lb-pos{width:18px;height:18px;font-size:10px}
body[data-mode="landscape"] .lb-name{max-width:64px}
body[data-mode="landscape"] #hud-score{height:44px}
body[data-mode="landscape"] .score-big{font-size:20px}
body[data-mode="landscape"] .score-sub{font-size:9px;margin-top:2px}
body[data-mode="landscape"] #hud-status{height:44px;right:76px;top:0;left:auto;bottom:auto}
body[data-mode="landscape"] #hud-ammo{padding:4px 9px;font-size:11.5px}
body[data-mode="landscape"] .pw{padding:4px 9px}
body[data-mode="landscape"] .pw i,body[data-mode="landscape"] .pw b{font-size:11.5px}
body[data-mode="landscape"] .tbtn{width:58px;height:58px}
body[data-mode="landscape"] #touch{bottom:14px;right:14px;gap:10px}
`};
})();

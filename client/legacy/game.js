import { useState, useEffect, useRef, useCallback } from "react";

const WORLD_W=7200,WORLD_H=7200,FOOD_COUNT=840,VIRUS_COUNT=44,MAX_PIECES=8;
const SPLIT_SPEED=24,MERGE_TIME_BASE=300,FRICTION=0.86,EJECT_SPEED=18,EJECT_R=9;
const PLAYER_COLORS=["#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD","#98D8C8","#F7DC6F"];
const BOT_NAMES=["Nebulox","Vortexia","Cosmara","Drakonis","Stellara","Graviton","Quasara","Pulsaris","Meteora","Darkion","Nexaris","Solaron","Astrophex","Hydraxis","Volcanix","Luminos","Aetheron","Aurorax","Voidrix","Pyronis"];

const SKINS=[
  {id:0,name:"Planeta Padrão",emoji:"🪐",rarity:"free",price:0,color:"#4ECDC4",ring:false,glow:"#4ECDC4",desc:"Seu ponto de partida"},
  {id:1,name:"Marte",emoji:"🔴",rarity:"common",price:200,color:"#c1440e",ring:false,glow:"#ff6644",desc:"O planeta vermelho"},
  {id:2,name:"Netuno",emoji:"🔵",rarity:"common",price:200,color:"#4060c8",ring:false,glow:"#6080ff",desc:"Azul profundo"},
  {id:3,name:"Vênus",emoji:"🟡",rarity:"common",price:250,color:"#e8c87a",ring:false,glow:"#ffdd88",desc:"Dourado nebuloso"},
  {id:4,name:"Mercúrio",emoji:"⚫",rarity:"common",price:200,color:"#9090a8",ring:false,glow:"#aaaacc",desc:"Cinzento rochoso"},
  {id:5,name:"Júpiter",emoji:"🟠",rarity:"common",price:300,color:"#c88c5a",ring:false,glow:"#ffaa66",desc:"O gigante das listras"},
  {id:6,name:"Terra",emoji:"🌍",rarity:"common",price:300,color:"#4a9eff",ring:false,glow:"#44aaff",desc:"Lar doce lar"},
  {id:7,name:"Lua",emoji:"🌕",rarity:"common",price:150,color:"#d0d0d8",ring:false,glow:"#eeeeff",desc:"Satélite clássico"},
  {id:8,name:"Cometa",emoji:"☄️",rarity:"common",price:250,color:"#88ccff",ring:false,glow:"#aaddff",desc:"Velocidade cósmica"},
  {id:9,name:"Asteroide",emoji:"🪨",rarity:"common",price:200,color:"#886644",ring:false,glow:"#aa8866",desc:"Rocha espacial"},
  {id:10,name:"Saturno",emoji:"💛",rarity:"rare",price:600,color:"#c8a060",ring:true,glow:"#ffcc66",desc:"Com anel dourado"},
  {id:11,name:"Urano",emoji:"🩵",rarity:"rare",price:700,color:"#7ab8d4",ring:true,glow:"#88ddff",desc:"Gigante de gelo"},
  {id:12,name:"Estrela Cadente",emoji:"🌠",rarity:"rare",price:800,color:"#ffffaa",ring:false,glow:"#ffffff",desc:"Faísca do universo"},
  {id:13,name:"Nebulosa Rosa",emoji:"🌸",rarity:"rare",price:750,color:"#ff88bb",ring:false,glow:"#ffaad0",desc:"Nuvem cósmica"},
  {id:14,name:"Nebulosa Verde",emoji:"💚",rarity:"rare",price:750,color:"#44dd88",ring:false,glow:"#66ffaa",desc:"Gás esmeralda"},
  {id:15,name:"Pulsar",emoji:"⚡",rarity:"rare",price:900,color:"#ddff44",ring:false,glow:"#eeff66",desc:"Emite energia"},
  {id:16,name:"Anã Branca",emoji:"⭐",rarity:"rare",price:850,color:"#eeeeff",ring:false,glow:"#ffffff",desc:"Núcleo estelar"},
  {id:17,name:"Planeta Gelo",emoji:"🧊",rarity:"rare",price:700,color:"#aaddff",ring:false,glow:"#cceeFF",desc:"Congelado no espaço"},
  {id:18,name:"Planeta Lava",emoji:"🌋",rarity:"rare",price:800,color:"#ff4422",ring:false,glow:"#ff6600",desc:"Fervendo de energia"},
  {id:19,name:"Planeta Veneno",emoji:"☠️",rarity:"rare",price:700,color:"#88ff44",ring:false,glow:"#aaff66",desc:"Venenoso e letal"},
  {id:20,name:"Buraco Negro",emoji:"🕳️",rarity:"epic",price:1500,color:"#110022",ring:true,glow:"#aa00ff",desc:"Absorve tudo"},
  {id:21,name:"Quasar",emoji:"🔮",rarity:"epic",price:2000,color:"#cc44ff",ring:false,glow:"#ee66ff",desc:"Núcleo galáctico"},
  {id:22,name:"Supernova",emoji:"💥",rarity:"epic",price:2500,color:"#ff8800",ring:false,glow:"#ffcc00",desc:"Explosão estelar"},
  {id:23,name:"Planeta Cristal",emoji:"💎",rarity:"epic",price:1800,color:"#88eeff",ring:false,glow:"#aaffff",desc:"Translúcido e raro"},
  {id:24,name:"Planeta Sombra",emoji:"🌑",rarity:"epic",price:1600,color:"#222244",ring:false,glow:"#4444aa",desc:"Escuridão total"},
  {id:25,name:"Estrela Nêutron",emoji:"💫",rarity:"epic",price:2200,color:"#ffffff",ring:false,glow:"#88aaff",desc:"Ultra-densa e rápida"},
  {id:26,name:"Planeta Aurora",emoji:"🌌",rarity:"epic",price:1700,color:"#44ffcc",ring:false,glow:"#88ffee",desc:"Luzes polares"},
  {id:27,name:"Planeta Tempestade",emoji:"🌀",rarity:"epic",price:1900,color:"#6688cc",ring:false,glow:"#88aaff",desc:"Furacão eterno"},
  {id:28,name:"Anã Vermelha",emoji:"❤️",rarity:"epic",price:1600,color:"#cc2200",ring:false,glow:"#ff4400",desc:"Estrela em brasa"},
  {id:29,name:"Planeta Fantasma",emoji:"👻",rarity:"epic",price:2000,color:"#eeeeff",ring:false,glow:"#aaaaff",desc:"Semitransparente"},
  {id:30,name:"Galáxia",emoji:"🌌",rarity:"legendary",price:5000,color:"#cc88ff",ring:true,glow:"#ff88ff",desc:"Uma galáxia inteira"},
  {id:31,name:"Big Bang",emoji:"✨",rarity:"legendary",price:8000,color:"#ffffff",ring:false,glow:"#ffffff",desc:"O início de tudo"},
  {id:32,name:"Universo",emoji:"🔭",rarity:"legendary",price:10000,color:"#000088",ring:true,glow:"#0044ff",desc:"Contém tudo"},
  {id:33,name:"Deus Cósmico",emoji:"👁️",rarity:"legendary",price:15000,color:"#ffdd00",ring:true,glow:"#ffff00",desc:"Além da compreensão"},
  {id:34,name:"Dragão Estelar",emoji:"🐉",rarity:"legendary",price:7000,color:"#ff4400",ring:false,glow:"#ff8800",desc:"Lenda do cosmos"},
  {id:35,name:"Sobrevivente",emoji:"🛡️",rarity:"earned",price:0,unlockKey:"survive5",color:"#44aa88",ring:false,glow:"#66ccaa",desc:"Sobreviva 5 min"},
  {id:36,name:"Devorador",emoji:"👅",rarity:"earned",price:0,unlockKey:"eat50",color:"#ff6644",ring:false,glow:"#ff8866",desc:"Coma 50 inimigos"},
  {id:37,name:"Massivo",emoji:"⚖️",rarity:"earned",price:0,unlockKey:"mass5000",color:"#ddaa44",ring:false,glow:"#ffcc66",desc:"Massa >= 5.000"},
  {id:38,name:"Divisor",emoji:"✂️",rarity:"earned",price:0,unlockKey:"split100",color:"#88aaff",ring:false,glow:"#aaccff",desc:"Divida 100 vezes"},
  {id:39,name:"Campeão",emoji:"🏆",rarity:"earned",price:0,unlockKey:"top1_3min",color:"#ffcc00",ring:true,glow:"#ffee44",desc:"Nº1 por 3 minutos"},
  {id:40,name:"Veterano",emoji:"🎖️",rarity:"earned",price:0,unlockKey:"games10",color:"#cc8844",ring:false,glow:"#ddaa66",desc:"10 partidas jogadas"},
  {id:41,name:"Caçador",emoji:"🎯",rarity:"earned",price:0,unlockKey:"eatbots10",color:"#ff4488",ring:false,glow:"#ff66aa",desc:"Coma 10 bots"},
  {id:42,name:"Ejector",emoji:"💨",rarity:"earned",price:0,unlockKey:"eject200",color:"#44ccff",ring:false,glow:"#66eeff",desc:"Ejete 200 vezes"},
  {id:43,name:"Explorador",emoji:"🗺️",rarity:"earned",price:0,unlockKey:"explore4",color:"#88cc44",ring:false,glow:"#aaee66",desc:"Explore todo o mapa"},
  {id:44,name:"Imparável",emoji:"🌪️",rarity:"earned",price:0,unlockKey:"streak5",color:"#cc44ff",ring:false,glow:"#ee66ff",desc:"5 kills sem morrer"},
  {id:45,name:"???",emoji:"❓",rarity:"secret",price:0,unlockKey:"secret1",color:"#333355",ring:false,glow:"#555588",desc:"Segredo oculto"},
  {id:46,name:"???",emoji:"❓",rarity:"secret",price:0,unlockKey:"secret2",color:"#333355",ring:false,glow:"#555588",desc:"Segredo oculto"},
  {id:47,name:"???",emoji:"❓",rarity:"secret",price:0,unlockKey:"secret3",color:"#333355",ring:false,glow:"#555588",desc:"Segredo oculto"},
  {id:48,name:"???",emoji:"❓",rarity:"secret",price:0,unlockKey:"secret4",color:"#333355",ring:false,glow:"#555588",desc:"Segredo oculto"},
  {id:49,name:"Lenda Suprema",emoji:"🌟",rarity:"legendary",price:20000,color:"#ffff88",ring:true,glow:"#ffffff",desc:"O mais raro de todos"},
];

const RARITY_COLORS={free:"#aaaaaa",common:"#88ccff",rare:"#44aaff",epic:"#aa44ff",legendary:"#ffcc00",earned:"#44ffaa",secret:"#ff4488"};
const RARITY_LABELS={free:"Grátis",common:"Comum",rare:"Raro",epic:"Épico",legendary:"Lendário",earned:"Conquista",secret:"Secreto"};
// paleta das telas React — espelha o CSS do modelo híbrido
const UI={
  font:"system-ui,-apple-system,'Segoe UI',Arial,sans-serif",mono:"'Courier New',monospace",
  cyan:"#4fe3ff",magenta:"#ff4fd8",gold:"#ffd166",text:"#e6f4ff",muted:"#9fb4d4",dim:"#5d6c8c",
  screen:"radial-gradient(ellipse at 50% 35%,rgba(11,18,48,.86),rgba(2,3,10,.97))",
  panel:{background:"rgba(6,12,28,.62)",border:"1px solid rgba(79,227,255,.32)",borderRadius:18,
    padding:"22px 26px",backdropFilter:"blur(20px)",
    boxShadow:"0 24px 70px rgba(0,0,0,.55),0 0 60px rgba(79,227,255,.08),inset 0 1px 0 rgba(255,255,255,.07)"},
  hud:{background:"rgba(6,12,28,.5)",border:"1px solid rgba(79,227,255,.3)",borderRadius:12,
    padding:"11px 15px",backdropFilter:"blur(14px)",boxShadow:"0 8px 30px rgba(0,0,0,.4),0 0 24px rgba(79,227,255,.08)"},
  btn:{background:"linear-gradient(135deg,rgba(79,227,255,.22),rgba(47,92,224,.5))",border:"1px solid rgba(79,227,255,.75)",
    borderRadius:12,color:"#fff",fontWeight:600,letterSpacing:3,cursor:"pointer",
    textShadow:"0 0 14px rgba(79,227,255,.9)",boxShadow:"0 8px 28px rgba(30,90,200,.3)"},
  btn2:{background:"rgba(255,79,216,.07)",border:"1px solid rgba(255,79,216,.45)",borderRadius:12,
    color:"#ff85e2",fontWeight:600,letterSpacing:2,cursor:"pointer"},
  input:{background:"rgba(0,14,30,.75)",border:"1px solid rgba(79,227,255,.45)",borderRadius:10,
    color:"#fff",outline:"none",boxSizing:"border-box"},
};

const COIN_PACKAGES=[
  {id:"p1",coins:500,price:"R$ 4,99",bonus:0,icon:"💰"},
  {id:"p2",coins:1200,price:"R$ 9,99",bonus:200,icon:"💎"},
  {id:"p3",coins:3000,price:"R$ 19,99",bonus:500,icon:"👑"},
  {id:"p4",coins:8000,price:"R$ 49,99",bonus:2000,icon:"🌟"},
];

const uid=()=>Math.random().toString(36).substr(2,9);
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const lerp=(a,b,t)=>a+(b-a)*t;
const calcMergeTime=r=>Math.floor(MERGE_TIME_BASE+r*2.2);
const initGameMeta=()=>({coins:500,totalCoins:0,owned:[0],equipped:0,stats:{games:0,kills:0},achievements:{}});

// ── WS CLIENT ─────────────────────────────────────────────────────────────────
// A conexão aponta para um shard: /ws/<shard>?room=<código>. No cluster o nginx do
// front roteia cada shard para o pod correspondente do StatefulSet.
const shardDoCodigo=code=>{const n=parseInt(String(code||"0")[0],36);return Number.isFinite(n)?n:0;};

class WsClient{
  constructor(){this.listeners={};this._ws=null;this._lastJoin=null;this._alvo={shard:0,code:null};}
  connect(alvo){if(alvo)this._alvo={shard:alvo.shard||0,code:alvo.code||null};this._connect();}
  _connect(){
    const proto=location.protocol==='https:'?'wss:':'ws:';
    const{shard,code}=this._alvo;
    const url=`${proto}//${location.host}/ws/${shard}${code?`?room=${encodeURIComponent(code)}`:''}`;
    if(this._ws&&this._ws.readyState<=1){this._ws.onclose=null;this._ws.close();}
    const ws=new WebSocket(url);
    // re-send the last join on every (re)connect — the server drops the player on
    // disconnect, so without this a reconnect leaves the world frozen on screen
    ws.onopen=()=>{this._ws=ws;if(this._lastJoin)ws.send(JSON.stringify(this._lastJoin));};
    ws.onmessage=e=>{try{const{type,...data}=JSON.parse(e.data);(this.listeners[type]||[]).forEach(cb=>cb(data));}catch(err){}};
    ws.onclose=()=>{this._ws=null;setTimeout(()=>this._connect(),2000);};
    ws.onerror=()=>ws.close();
  }
  on(ev,cb){(this.listeners[ev]||(this.listeners[ev]=[])).push(cb);}
  off(ev,cb){if(this.listeners[ev])this.listeners[ev]=this.listeners[ev].filter(f=>f!==cb);}
  clientSend(ev,d){if(ev==='join')this._lastJoin={type:ev,...d};const msg=JSON.stringify({type:ev,...d});if(this._ws&&this._ws.readyState===1)this._ws.send(msg);}
}

let _clientInstance=null;
function getServer(){if(!_clientInstance)_clientInstance=new WsClient();return _clientInstance;}
const apiGet=async p=>{try{const r=await fetch(p,{cache:"no-store"});return r.ok?await r.json():null;}catch{return null;}};

// ── TEMA: NEON CINEMATOGRÁFICO ────────────────────────────────────────────────
// Planeta com volume/atmosfera/terminador + aro emissivo, grid e HUD neon.
// Regra de performance: nada de shadowBlur ou gradiente por objeto no laço —
// cada planeta/comida/vírus é um sprite assado uma vez (por skin e por faixa de
// tamanho) e depois só copiado com drawImage. Ver mockups/src/theme.hybrid.js.
const CY="#4fe3ff",MG="#ff4fd8",PLX_T=760,FOOD_K=2.1;
const MINI=152,MINI_PAD=16;
const SKIN_BY_ID=new Map(SKINS.map(s=>[s.id,s]));
const mulberry=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const sh=(hex,a)=>{const n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255,f=x=>Math.max(0,Math.min(255,Math.round(a>0?x+(255-x)*a:x*(1+a))));return`rgb(${f(r)},${f(g)},${f(b)})`;};
const rgba=(hex,a)=>{const n=parseInt(hex.slice(1),16);return`rgba(${n>>16},${n>>8&255},${n&255},${a})`;};

const _spr=new Map();
function sprite(key,size,draw){let c=_spr.get(key);if(c)return c;c=document.createElement("canvas");c.width=c.height=size;const x=c.getContext("2d");x.translate(size/2,size/2);draw(x,size/2);_spr.set(key,c);return c;}
const tierOf=r=>r<=44?128:r<=120?256:512;
function spikes(c,r,n,inner,phase){c.beginPath();for(let i=0;i<n*2;i++){const a=(i/(n*2))*6.2832+(phase||0),rr=i%2?r*inner:r;i?c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.closePath();}
function outText(c,txt,x,y,size,fill,stroke){c.font=`bold ${size}px Arial,Helvetica,sans-serif`;c.textAlign="center";c.textBaseline="middle";c.strokeStyle=stroke;c.lineWidth=Math.max(2,size*.2);c.lineJoin="round";c.strokeText(txt,x,y);c.fillStyle=fill;c.fillText(txt,x,y);}
function roundRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}

// fundo: parallax de estrelas (espaço de tela) + nebulosas assadas no cache
const _rnd=mulberry(41);
const PLX=[.18,.42,.8].map((f,li)=>({f,stars:Array.from({length:li===2?45:90},()=>({x:_rnd()*PLX_T,y:_rnd()*PLX_T,r:li===2?1.6+_rnd()*1.6:.6+_rnd()*1.1,a:+((li===2?.55:.22)+_rnd()*.35).toFixed(2)}))}));
const NEB_COLS=["#2f6bff","#a855f7","#ff4d6d","#22d3ee","#7c3aed"];
const NEB=Array.from({length:16},(_,i)=>({x:_rnd(),y:_rnd(),r:.22+_rnd()*.5,col:NEB_COLS[i%5],a:.055+_rnd()*.10}));
let _bg=null,_bgW=0,_bgH=0;
function drawBg(ctx,W,H,cam){
  if(!_bg||_bgW!==W||_bgH!==H){
    _bgW=W;_bgH=H;_bg=document.createElement("canvas");_bg.width=W;_bg.height=H;
    const x=_bg.getContext("2d"),D=Math.max(W,H);
    const gd=x.createRadialGradient(W*.5,H*.42,0,W*.5,H*.5,D*.9);
    gd.addColorStop(0,"#080d24");gd.addColorStop(.5,"#04060d");gd.addColorStop(1,"#010208");
    x.fillStyle=gd;x.fillRect(0,0,W,H);
    NEB.forEach(n=>{const nx=n.x*W,ny=n.y*H,nr=n.r*D,g2=x.createRadialGradient(nx,ny,0,nx,ny,nr);
      g2.addColorStop(0,rgba(n.col,n.a));g2.addColorStop(.5,rgba(n.col,n.a*.4));g2.addColorStop(1,"rgba(0,0,0,0)");
      x.fillStyle=g2;x.beginPath();x.arc(nx,ny,nr,0,6.283);x.fill();});}
  ctx.drawImage(_bg,0,0);
  ctx.fillStyle="#dfe8ff";
  PLX.forEach(l=>{const ox=((-cam.x*l.f*cam.scale)%PLX_T+PLX_T)%PLX_T,oy=((-cam.y*l.f*cam.scale)%PLX_T+PLX_T)%PLX_T;
    l.stars.forEach(s=>{ctx.globalAlpha=s.a;const bx=(s.x+ox)%PLX_T,by=(s.y+oy)%PLX_T;
      for(let x=bx;x<W;x+=PLX_T)for(let y=by;y<H;y+=PLX_T)ctx.fillRect(x,y,s.r,s.r);});});
  ctx.globalAlpha=1;}

// grid só na faixa visível — o mundo tem 7200px, não adianta traçar tudo
function drawGrid(ctx,step,color,w,x0,x1,y0,y1){
  ctx.strokeStyle=color;ctx.lineWidth=w;ctx.beginPath();
  const gy0=clamp(y0,0,WORLD_H),gy1=clamp(y1,0,WORLD_H),gx0=clamp(x0,0,WORLD_W),gx1=clamp(x1,0,WORLD_W);
  for(let x=Math.ceil(gx0/step)*step;x<=gx1;x+=step){ctx.moveTo(x,gy0);ctx.lineTo(x,gy1);}
  for(let y=Math.ceil(gy0/step)*step;y<=gy1;y+=step){ctx.moveTo(gx0,y);ctx.lineTo(gx1,y);}
  ctx.stroke();}

// ── sprites ───────────────────────────────────────────────────────────────────
const planetK=sk=>sk.ring?2.4:1.75;
function planetSpr(sk,isMe,size){
  return sprite("p"+sk.id+(isMe?"m":"")+size,size,(c,R)=>{
    const K=planetK(sk),r=R/K,col=sk.color,glow=sk.glow||sk.color;
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
    hl.addColorStop(0,"rgba(255,255,255,.42)");hl.addColorStop(1,"rgba(255,255,255,0)");
    c.fillStyle=hl;c.fillRect(-r,-r,r*2,r*2);
    const term=c.createLinearGradient(r*.1,-r,r,r*.9);
    term.addColorStop(0,"rgba(0,0,0,0)");term.addColorStop(1,"rgba(0,4,14,.6)");
    c.fillStyle=term;c.fillRect(-r,-r,r*2,r*2);c.restore();
    c.shadowBlur=r*(isMe?.5:.3);c.shadowColor=glow;
    c.strokeStyle=rgba(glow,isMe?1:.8);c.lineWidth=Math.max(2,r*.055);
    c.beginPath();c.arc(0,0,r*.985,0,6.283);c.stroke();if(isMe)c.stroke();
    c.shadowBlur=0;});}

const FOOD_EMOJI={missile_ammo:"🚀",powerup_speed:"⚡",powerup_magnet:"🧲",powerup_shield:"🛡️"};
function foodSpr(f){
  return sprite("f"+f.type+f.color,68,(c,R)=>{
    const r=R/FOOD_K;
    if(f.type==="missile_ammo"||(f.type&&f.type.indexOf("powerup_")===0)){
      c.shadowBlur=r*1.3;c.shadowColor=f.color;
      const gd=c.createRadialGradient(0,0,0,0,0,r);
      gd.addColorStop(0,"#fff");gd.addColorStop(.55,f.color);gd.addColorStop(1,rgba(f.color,.2));
      c.fillStyle=gd;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
      c.strokeStyle=rgba(f.color,.9);c.lineWidth=r*.12;c.stroke();c.shadowBlur=0;
      c.font=`${r*1.05}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(FOOD_EMOJI[f.type],0,1);return;}
    if(f.type==="comet"){const gd=c.createLinearGradient(-r*3.4,0,r,0);
      gd.addColorStop(0,"rgba(255,255,255,0)");gd.addColorStop(1,f.color);
      c.fillStyle=gd;c.beginPath();c.ellipse(-r*1.3,0,r*3,r*.3,0,0,6.283);c.fill();
      c.shadowBlur=r*.9;c.shadowColor="#fff";c.fillStyle="#fff";c.beginPath();c.arc(0,0,r*.5,0,6.283);c.fill();return;}
    if(f.type==="star"){c.shadowBlur=r*1.2;c.shadowColor=f.color;c.fillStyle=f.color;spikes(c,r*1.15,4,.32,0);c.fill();return;}
    c.shadowBlur=r*.7;c.shadowColor=f.color;
    const gd=c.createRadialGradient(-r*.3,-r*.3,0,0,0,r);
    gd.addColorStop(0,"#ffffff");gd.addColorStop(.3,f.color);gd.addColorStop(1,"rgba(0,0,0,.55)");
    c.fillStyle=gd;c.beginPath();c.arc(0,0,r*.95,0,6.283);c.fill();});}

const ejectSpr=col=>sprite("e"+col,48,(c,R)=>{const r=R/1.85;
  c.shadowBlur=r*1.1;c.shadowColor=col;
  const gd=c.createRadialGradient(0,0,0,0,0,r);
  gd.addColorStop(0,"#fff");gd.addColorStop(.45,col);gd.addColorStop(1,rgba(col,0));
  c.fillStyle=gd;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();});

const virusSpr=()=>sprite("virus",256,(c,R)=>{const r=R/1.4;
  c.shadowBlur=r*.4;c.shadowColor="#2bff9d";
  const gd=c.createRadialGradient(-r*.2,-r*.2,r*.1,0,0,r);
  gd.addColorStop(0,"#b6ffe0");gd.addColorStop(.5,"#00cc70");gd.addColorStop(1,"#04361f");
  c.fillStyle=gd;spikes(c,r,22,.8,0);c.fill();
  c.strokeStyle="#39ff88";c.lineWidth=r*.035;c.stroke();c.shadowBlur=0;
  c.strokeStyle="rgba(180,255,220,.4)";c.lineWidth=r*.018;spikes(c,r*.58,22,.8,.14);c.stroke();});

// ── entidades ─────────────────────────────────────────────────────────────────
function drawFood(ctx,f,time){
  const p=f.type==="star"?1+Math.sin(time*.003+f.x)*.16:1,r=f.r*FOOD_K*p;
  ctx.drawImage(foodSpr(f),f.x-r,f.y-r,r*2,r*2);}
function drawEjected(ctx,e){const r=e.r*1.85;ctx.drawImage(ejectSpr(e.color),e.x-r,e.y-r,r*2,r*2);}
function drawVirus(ctx,v){const r=v.r*(1+Math.sin(v.pulseT)*.05)*1.4;ctx.drawImage(virusSpr(),v.x-r,v.y-r,r*2,r*2);}
function drawMissile(ctx,m){
  ctx.save();ctx.translate(m.x,m.y);ctx.rotate(Math.atan2(m.vy,m.vx));
  const g=ctx.createLinearGradient(-m.r*3.5,0,0,0);
  g.addColorStop(0,"rgba(255,80,0,0)");g.addColorStop(1,"rgba(255,200,60,0.95)");
  ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(-m.r*2,0,m.r*3,m.r*.5,0,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=14;ctx.shadowColor="#ff6a00";ctx.fillStyle="#eef4ff";
  ctx.beginPath();ctx.ellipse(0,0,m.r,m.r*.42,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#ff3b6b";ctx.beginPath();ctx.ellipse(m.r*.5,0,m.r*.55,m.r*.42,0,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;ctx.restore();}

function drawPlanet(ctx,pc,p,isMe,time,overrideSkinId){
  const r=pc.displayR||pc.r;
  const skinId=overrideSkinId!=null?overrideSkinId:(p.skinId??0);
  const sk=SKIN_BY_ID.get(skinId)||SKINS[0];
  const spd=Math.hypot(pc.vx,pc.vy),dir=Math.atan2(pc.vy,pc.vx);
  const K=planetK(sk),d=r*K,spr=planetSpr(sk,isMe,tierOf(r));
  // rastro do arremesso: cópias do próprio sprite ficando para trás (estilingue)
  if(spd>7){const cs=Math.cos(dir),sn=Math.sin(dir);
    for(let i=4;i>0;i--){const t=i/4,atras=spd*1.5*t,rr=d*(1-.14*t);
      ctx.globalAlpha=.2*(1-t*.55);ctx.drawImage(spr,pc.x-cs*atras-rr,pc.y-sn*atras-rr,rr*2,rr*2);}
    ctx.globalAlpha=1;}
  ctx.save();ctx.translate(pc.x,pc.y);
  // esticada na direção do tiro — forte durante o lançamento, sutil no passeio normal
  const esticar=Math.min(spd*.028,pc.launch>0?.42:.12);
  if(esticar>.005){ctx.rotate(dir);ctx.scale(1+esticar,1-esticar*.5);ctx.rotate(-dir);}
  ctx.drawImage(spr,-d,-d,d*2,d*2);
  // clarão curto no instante do disparo
  if(pc.splitting&&pc.splitT!=null&&pc.splitT<.45){const a=1-pc.splitT/.45;
    ctx.strokeStyle=`rgba(223,244,255,${a*.7})`;ctx.lineWidth=2+a*4;
    ctx.beginPath();ctx.arc(0,0,r*(1+.55*(1-a)),0,Math.PI*2);ctx.stroke();}
  if(pc.mergeTimer>0){ctx.strokeStyle=rgba(CY,.75);ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(0,0,r+6,-Math.PI/2,-Math.PI/2+(1-pc.mergeTimer/calcMergeTime(pc.r))*Math.PI*2);ctx.stroke();}
  if(p._powerups&&Object.keys(p._powerups).length){const cl={speed:"#ffd23d",magnet:MG,shield:CY};
    Object.keys(p._powerups).forEach((t,i)=>{ctx.strokeStyle=cl[t]||"#fff";ctx.lineWidth=2.2;ctx.globalAlpha=.5+.5*Math.sin(time*.012+i);
      ctx.setLineDash([r*.36,r*.26]);ctx.beginPath();ctx.arc(0,0,r*(1.26+i*.15),0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;});}
  if(r>13){const fs=Math.max(11,r*.31);
    outText(ctx,p.name,0,-fs*.28,fs,"#fff","rgba(0,0,0,.75)");
    outText(ctx,String(Math.round(pc.r*pc.r/10)),0,fs*.78,fs*.7,rgba(sk.glow||sk.color,.95),"rgba(0,0,0,.7)");}
  ctx.restore();}

function drawScene(ctx,W,H,cam,stateRef,myId,time){
  const{players,food,viruses,ejected,missiles}=stateRef.current;
  drawBg(ctx,W,H,cam);
  ctx.save();ctx.translate(W/2,H/2);ctx.scale(cam.scale,cam.scale);ctx.translate(-cam.x,-cam.y);
  // culling: desenha só o que cabe na tela
  const hw=W/(2*cam.scale),hh=H/(2*cam.scale);
  const x0=cam.x-hw,x1=cam.x+hw,y0=cam.y-hh,y1=cam.y+hh;
  const vis=(x,y,r)=>x+r>x0&&x-r<x1&&y+r>y0&&y-r<y1;
  drawGrid(ctx,60,"rgba(79,227,255,0.06)",1,x0,x1,y0,y1);
  drawGrid(ctx,300,"rgba(79,227,255,0.13)",1.4,x0,x1,y0,y1);
  [[30,.05],[14,.11],[6,.26],[3,.7]].forEach(([w,a])=>{ctx.strokeStyle="rgba(79,227,255,"+a+")";ctx.lineWidth=w;ctx.strokeRect(0,0,WORLD_W,WORLD_H);});
  ctx.strokeStyle=rgba(MG,.25);ctx.lineWidth=1.5;ctx.strokeRect(-12,-12,WORLD_W+24,WORLD_H+24);
  food.forEach(f=>{if(vis(f.x,f.y,f.r*4))drawFood(ctx,f,time);});
  (ejected||[]).forEach(e=>{if(vis(e.x,e.y,e.r*2))drawEjected(ctx,e);});
  viruses.forEach(v=>{if(vis(v.x,v.y,v.r*1.5))drawVirus(ctx,v);});
  (missiles||[]).forEach(m=>{if(vis(m.x,m.y,m.r*6))drawMissile(ctx,m);});
  const all=[];Object.values(players).filter(p=>!p.dead).forEach(p=>{p.pieces.forEach(pc=>{if(vis(pc.x,pc.y,pc.r*2.4))all.push({pc,p});});});
  all.sort((a,b)=>a.pc.r-b.pc.r).forEach(({pc,p})=>drawPlanet(ctx,pc,p,p.id===myId,time,p.id===myId?undefined:p.skinId));
  ctx.restore();}

// ── HUD do canvas (minimapa, botões, munição, FPS) ────────────────────────────
function hudButtons(W,H){const my=H-MINI-MINI_PAD,bw=90,bh=40,by=my-bh-12;
  return[{x:W-MINI_PAD-bw,y:by,w:bw,h:bh,label:"DIVIDIR",key:"ESPAÇO",act:"split"},
         {x:W-MINI_PAD-bw*2-9,y:by,w:bw,h:bh,label:"EJETAR",key:"W",act:"eject"}];}
function drawHud(ctx,W,H,stateRef,myId,fps,splitCD,ejectCD,missiles){
  const mx=W-MINI-MINI_PAD,my=H-MINI-MINI_PAD;
  ctx.fillStyle="rgba(4,10,24,.62)";ctx.fillRect(mx,my,MINI,MINI);
  ctx.strokeStyle=rgba(CY,.5);ctx.lineWidth=1.5;
  [[mx,my,1,1],[mx+MINI,my,-1,1],[mx,my+MINI,1,-1],[mx+MINI,my+MINI,-1,-1]].forEach(([x,y,sx,sy])=>{
    ctx.beginPath();ctx.moveTo(x+sx*18,y);ctx.lineTo(x,y);ctx.lineTo(x,y+sy*18);ctx.stroke();});
  ctx.strokeStyle=rgba(CY,.08);ctx.lineWidth=1;
  for(let i=1;i<5;i++){ctx.beginPath();ctx.moveTo(mx+MINI*i/5,my);ctx.lineTo(mx+MINI*i/5,my+MINI);ctx.moveTo(mx,my+MINI*i/5);ctx.lineTo(mx+MINI,my+MINI*i/5);ctx.stroke();}
  const sc=MINI/WORLD_W;
  stateRef.current.viruses.forEach(v=>{ctx.fillStyle="rgba(57,255,136,.55)";ctx.fillRect(mx+v.x*sc-1.5,my+v.y*sc-1.5,3,3);});
  Object.values(stateRef.current.players).filter(p=>!p.dead).forEach(p=>{const me=p.id===myId;
    const x=mx+(p.pieces.reduce((s,q)=>s+q.x,0)/p.pieces.length)*sc,y=my+(p.pieces.reduce((s,q)=>s+q.y,0)/p.pieces.length)*sc;
    const sk=SKIN_BY_ID.get(p.skinId??0)||SKINS[0];
    ctx.fillStyle=me?"#fff":(sk.glow||p.color);ctx.fillRect(x-(me?2.5:1.8),y-(me?2.5:1.8),me?5:3.6,me?5:3.6);});
  hudButtons(W,H).forEach(b=>{const cd=b.act==="split"?splitCD:ejectCD;
    ctx.fillStyle=cd?"rgba(18,24,40,.7)":"rgba(10,60,90,.55)";ctx.fillRect(b.x,b.y,b.w,b.h);
    ctx.strokeStyle=cd?"rgba(90,110,140,.45)":rgba(CY,.85);ctx.lineWidth=1.5;ctx.strokeRect(b.x,b.y,b.w,b.h);
    ctx.fillStyle=cd?"#59667f":"#dff7ff";ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.font="bold 12px 'Courier New',monospace";ctx.fillText(b.label,b.x+b.w/2,b.y+b.h*.38);
    ctx.font="10px 'Courier New',monospace";ctx.fillStyle=cd?"#46536b":rgba(CY,.75);ctx.fillText("["+b.key+"]",b.x+b.w/2,b.y+b.h*.72);});
  ctx.fillStyle="rgba(4,10,24,.6)";ctx.fillRect(MINI_PAD,MINI_PAD,68,22);
  ctx.fillStyle=fps>=50?"#39ff88":fps>=30?"#ffd23d":"#ff4d6d";
  ctx.font="bold 12px 'Courier New',monospace";ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText("FPS "+fps,MINI_PAD+7,MINI_PAD+11);
  if(missiles>0){ctx.fillStyle="rgba(30,4,24,.7)";ctx.fillRect(MINI_PAD,MINI_PAD+28,106,32);
    ctx.strokeStyle=rgba(MG,.8);ctx.lineWidth=1.5;ctx.strokeRect(MINI_PAD,MINI_PAD+28,106,32);
    ctx.font="16px serif";ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText("🚀",MINI_PAD+9,MINI_PAD+44);
    ctx.fillStyle=MG;ctx.font="bold 15px 'Courier New',monospace";ctx.fillText("x"+missiles,MINI_PAD+35,MINI_PAD+44);
    ctx.font="9px 'Courier New',monospace";ctx.fillStyle=rgba(MG,.7);ctx.fillText("CLIQUE",MINI_PAD+64,MINI_PAD+45);}}

// ── TELA DE MORTE: cena de fundo ──────────────────────────────────────────────
// Fica FORA do PlanetIO de propósito. Definida dentro do corpo do componente, a cada
// re-render ela virava um tipo novo: o React desmontava e remontava o canvas, a câmera
// reiniciava (escala volta pra 0.7, posição pro ponto da morte) e o rAF era recriado —
// como o tick chama setLeaderboard 60x/s, isso acontecia 60x/s e a tela tremia.
function DeathBg({deathCamRef,killerIdRef,stateRef}){
  const bgRef=useRef(null);
  const camState=useRef(null);
  useEffect(()=>{
    const canvas=bgRef.current;if(!canvas)return;const ctx=canvas.getContext("2d");
    const dc=deathCamRef.current||{x:WORLD_W/2,y:WORLD_H/2};
    camState.current={x:dc.x,y:dc.y,scale:0.7,targetScale:0.6,driftAngle:Math.random()*Math.PI*2,driftSpeed:0.14,t:0};
    let af;
    const draw=()=>{
      const W=canvas.width=canvas.offsetWidth,H=canvas.height=canvas.offsetHeight;
      const c=camState.current;c.t+=0.016;
      const killer=killerIdRef.current?stateRef.current.players[killerIdRef.current]:null;
      if(killer&&!killer.dead&&killer.pieces.length>0){
    const kx=killer.pieces.reduce((s,pc)=>s+pc.x,0)/killer.pieces.length;
    const ky=killer.pieces.reduce((s,pc)=>s+pc.y,0)/killer.pieces.length;
    const bigR=Math.max(...killer.pieces.map(pc=>pc.r));
    c.x=lerp(c.x,kx,0.06);c.y=lerp(c.y,ky,0.06);
    c.targetScale=clamp(55/(bigR+5),0.28,1.3);
    c.scale=lerp(c.scale,c.targetScale,0.05);
      } else {
    c.scale=lerp(c.scale,0.28,0.008);
    c.x+=Math.cos(c.driftAngle)*c.driftSpeed;c.y+=Math.sin(c.driftAngle)*c.driftSpeed;c.driftAngle+=0.003;
    c.x=clamp(c.x,200,WORLD_W-200);c.y=clamp(c.y,200,WORLD_H-200);
      }
      drawScene(ctx,W,H,c,stateRef,killerIdRef.current,c.t*60);
      // death X marker
      ctx.save();ctx.translate(W/2+(dc.x-c.x)*c.scale,H/2+(dc.y-c.y)*c.scale);
      const pulse=0.6+0.4*Math.sin(c.t*4);
      ctx.globalAlpha=0.6*pulse;ctx.strokeStyle="#ff3333";ctx.lineWidth=4;
      const xs=22;ctx.beginPath();ctx.moveTo(-xs,-xs);ctx.lineTo(xs,xs);ctx.stroke();ctx.beginPath();ctx.moveTo(xs,-xs);ctx.lineTo(-xs,xs);ctx.stroke();
      ctx.globalAlpha=0.15*pulse;ctx.beginPath();ctx.arc(0,0,50,0,Math.PI*2);ctx.strokeStyle="#ff3333";ctx.lineWidth=2;ctx.stroke();
      ctx.globalAlpha=1;ctx.restore();
      // vignette
      const vig=ctx.createRadialGradient(W/2,H/2,H*.2,W/2,H/2,H*.85);vig.addColorStop(0,"rgba(0,0,0,0)");vig.addColorStop(1,"rgba(0,0,0,0.75)");ctx.fillStyle=vig;ctx.fillRect(0,0,W,H);
      // red wash fades
      const ra=Math.max(0,0.18-c.t*0.04);if(ra>0){ctx.fillStyle=`rgba(160,0,0,${ra})`;ctx.fillRect(0,0,W,H);}
      af=requestAnimationFrame(draw);
    };
    af=requestAnimationFrame(draw);return()=>cancelAnimationFrame(af);
  },[]);
  return <canvas ref={bgRef} style={{position:"absolute",inset:0,width:"100%",height:"100%"}}/>;
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export default function PlanetIO(){
  const canvasRef=useRef(null);
  const stateRef=useRef({players:{},food:[],viruses:[],ejected:[],missiles:[],leaderboard:[]});
  const mouseRef=useRef({x:0,y:0});
  const myIdRef=useRef("player_"+uid());
  const myNameRef=useRef("Explorer");
  const camRef=useRef({x:WORLD_W/2,y:WORLD_H/2,scale:1});
  const animRef=useRef(null);
  const timeRef=useRef(0);
  const splitCDRef=useRef(false);
  const ejectCDRef=useRef(false);
  const keysRef=useRef({});
  const equippedSkinIdRef=useRef(0);
  const deathCamRef=useRef(null);
  const missileCountRef=useRef(0);
  const killerIdRef=useRef(null);
  const uiTRef=useRef(0);
  const sessionRef=useRef({startTime:0,kills:0,splits:0,ejects:0,botKills:0,streak:0,quadVisited:new Set(),top1Time:0,lastTop1:0});

  const[screen,setScreen]=useState("menu");
  const[nameInput,setNameInput]=useState("Explorer");
  const[leaderboard,setLeaderboard]=useState([]);
  const[myScore,setMyScore]=useState(0);
  const[eatenBy,setEatenBy]=useState("");
  const[finalScore,setFinalScore]=useState(0);
  const[deathCoins,setDeathCoins]=useState(0);
  const[ping,setPing]=useState(12);
  const[splitCD,setSplitCD]=useState(false);
  const[ejectCD,setEjectCD]=useState(false);
  const[gameMeta,setGameMeta]=useState(initGameMeta);
  const[shopTab,setShopTab]=useState("all");
  const[notification,setNotification]=useState(null);
  const[purchaseModal,setPurchaseModal]=useState(null);
  const[roomCode,setRoomCode]=useState("");
  const[roomList,setRoomList]=useState([]);
  const[roomInput,setRoomInput]=useState("");
  const roomRef=useRef(null);

  const showNotif=(msg,color="#4af")=>{setNotification({msg,color});setTimeout(()=>setNotification(null),2800);};
  const addCoins=n=>setGameMeta(m=>({...m,coins:m.coins+n,totalCoins:m.totalCoins+n}));

  useEffect(()=>{equippedSkinIdRef.current=gameMeta.equipped;},[gameMeta.equipped]);

  useEffect(()=>{
    // local mirror only — the server owns skinId and re-sends it on the next tick
    const p=stateRef.current.players[myIdRef.current];
    if(p){const skin=SKINS.find(s=>s.id===gameMeta.equipped)||SKINS[0];p.skinId=skin.id;p.color=skin.color;}
  },[gameMeta.equipped]);

  useEffect(()=>{
    const server=getServer();
    const onState=d=>{stateRef.current={...stateRef.current,...d};};
    const onTick=({players,food,viruses,ejected,missiles,leaderboard:lb})=>{
      if(!players)return;
      stateRef.current={players,food,viruses,ejected,missiles:missiles||[],leaderboard:lb};
      // o HUD não precisa de 60 atualizações por segundo — e re-renderizar o componente
      // inteiro a cada tick era o que remontava a tela de morte e fazia ela tremer
      const agora=performance.now(),ui=agora-uiTRef.current>120;
      if(ui){uiTRef.current=agora;setLeaderboard([...lb]);}
      const me=players[myIdRef.current];
      if(me&&!me.dead){
        missileCountRef.current=me._missiles||0;
        const mass=Math.round(me.pieces.reduce((s,pc)=>s+pc.r*pc.r,0));
        if(ui)setMyScore(mass);
        if(Math.random()<0.00055)addCoins(Math.max(1,Math.floor(mass/2000)));
        if(mass>=5000&&!gameMeta.achievements?.mass5000){
          setGameMeta(m=>{if(m.achievements.mass5000)return m;const no=[...m.owned];const sk=SKINS.find(s=>s.unlockKey==="mass5000");if(sk&&!no.includes(sk.id))no.push(sk.id);return{...m,achievements:{...m.achievements,mass5000:true},owned:no};});
          showNotif("⚖️ Desbloqueado: Massivo","#44ffaa");
        }
      }
    };
    const onEaten=({by,score,dx,dy,killerId,victimId})=>{
      if(victimId&&victimId!==myIdRef.current)return;
      setEatenBy(by);setFinalScore(score);
      const coinsEarned=Math.floor(score/300)+Math.floor(sessionRef.current.kills*2);
      addCoins(coinsEarned);setDeathCoins(coinsEarned);
      setGameMeta(m=>({...m,stats:{...m.stats,games:m.stats.games+1}}));
      if(dx!=null)deathCamRef.current={x:dx,y:dy};
      killerIdRef.current=killerId||null;
      setScreen("dead");
    };
    const onRoom=d=>{roomRef.current=d.code||null;setRoomCode(d.code||"");};
    server.on("gameState",onState);server.on("tick",onTick);server.on("eaten",onEaten);server.on("room",onRoom);
    const iv=setInterval(()=>setPing(7+Math.floor(Math.random()*14)),2800);
    return()=>{server.off("gameState",onState);server.off("tick",onTick);server.off("eaten",onEaten);server.off("room",onRoom);clearInterval(iv);};
  },[gameMeta.achievements]);

  // entra numa sala: com código vai direto no shard dele; sem código, /api/auto escolhe
  const entrarNaSala=useCallback(async code=>{
    myNameRef.current=nameInput||myNameRef.current||"Explorer";
    sessionRef.current={startTime:Date.now(),kills:0,splits:0,ejects:0,botKills:0,streak:0,quadVisited:new Set(),top1Time:0,lastTop1:0};
    const skin=SKINS.find(s=>s.id===gameMeta.equipped)||SKINS[0];
    const limpo=code?String(code).toUpperCase().trim():null;
    let alvo=limpo?{code:limpo,shard:shardDoCodigo(limpo)}:await apiGet("/api/auto");
    if(!alvo)alvo={code:null,shard:0};
    roomRef.current=alvo.code||null;setRoomCode(alvo.code||"");
    getServer().connect({shard:alvo.shard||0,code:alvo.code||null});
    getServer().clientSend("join",{id:myIdRef.current,name:myNameRef.current,skinId:skin.id,room:alvo.code||undefined});
    setMyScore(0);setScreen("game");
  },[nameInput,gameMeta.equipped]);
  const startGame=useCallback(()=>{entrarNaSala(null);},[entrarNaSala]);
  const respawn=useCallback(()=>{entrarNaSala(roomRef.current);},[entrarNaSala]);

  useEffect(()=>{
    if(screen!=="menu")return;let vivo=true;
    const carregar=async()=>{const d=await apiGet("/api/rooms");if(vivo&&d)setRoomList(d.rooms||[]);};
    carregar();const iv=setInterval(carregar,5000);
    return()=>{vivo=false;clearInterval(iv);};
  },[screen]);

  useEffect(()=>{
    const mv=e=>{const c=canvasRef.current;if(!c)return;const r=c.getBoundingClientRect();mouseRef.current={x:e.clientX-r.left,y:e.clientY-r.top};};
    const mt=e=>{e.preventDefault();const c=canvasRef.current;if(!c)return;const r=c.getBoundingClientRect();const t=e.touches[0];mouseRef.current={x:t.clientX-r.left,y:t.clientY-r.top};};
    window.addEventListener("mousemove",mv);window.addEventListener("touchmove",mt,{passive:false});
    return()=>{window.removeEventListener("mousemove",mv);window.removeEventListener("touchmove",mt);};
  },[]);

  const fireMissile=useCallback(()=>{if(missileCountRef.current>0)getServer().clientSend("fire",{id:myIdRef.current});},[]);
  const doSplit=useCallback(()=>{
    if(splitCDRef.current)return;const canvas=canvasRef.current;if(!canvas)return;
    const cam=camRef.current,wx=cam.x+(mouseRef.current.x-canvas.offsetWidth/2)/cam.scale,wy=cam.y+(mouseRef.current.y-canvas.offsetHeight/2)/cam.scale;
    getServer().clientSend("split",{id:myIdRef.current,tx:wx,ty:wy});sessionRef.current.splits++;
    splitCDRef.current=true;setSplitCD(true);setTimeout(()=>{splitCDRef.current=false;setSplitCD(false);},380);
  },[]);
  const doEject=useCallback(()=>{
    if(ejectCDRef.current)return;const canvas=canvasRef.current;if(!canvas)return;
    const cam=camRef.current,wx=cam.x+(mouseRef.current.x-canvas.offsetWidth/2)/cam.scale,wy=cam.y+(mouseRef.current.y-canvas.offsetHeight/2)/cam.scale;
    getServer().clientSend("eject",{id:myIdRef.current,tx:wx,ty:wy});sessionRef.current.ejects++;
    ejectCDRef.current=true;setEjectCD(true);setTimeout(()=>{ejectCDRef.current=false;setEjectCD(false);},120);
  },[]);

  useEffect(()=>{if(screen!=="game")return;const kd=e=>{if(e.code==="Space"){e.preventDefault();doSplit();}if(e.code==="KeyW"){e.preventDefault();keysRef.current.w=true;doEject();}};const ku=e=>{if(e.code==="KeyW")keysRef.current.w=false;};window.addEventListener("keydown",kd);window.addEventListener("keyup",ku);return()=>{window.removeEventListener("keydown",kd);window.removeEventListener("keyup",ku);};},[screen,doSplit,doEject]);
  useEffect(()=>{if(screen!=="game")return;const iv=setInterval(()=>{if(keysRef.current.w||keysRef.current.lmb)doEject();},110);return()=>clearInterval(iv);},[screen,doEject]);

  // game render loop
  useEffect(()=>{
    if(screen!=="game")return;const canvas=canvasRef.current;if(!canvas)return;const ctx=canvas.getContext("2d");
    let lastT=performance.now(),fps=0,fFrames=0,fAccum=0;
    const loop=()=>{
      const now=performance.now();fAccum+=now-lastT;lastT=now;fFrames++;if(fAccum>=500){fps=Math.round(fFrames*1000/fAccum);fFrames=0;fAccum=0;}
      const W=canvas.width=canvas.offsetWidth,H=canvas.height=canvas.offsetHeight;
      timeRef.current+=16;const time=timeRef.current;const id=myIdRef.current;
      const me=stateRef.current.players[id];
      if(me&&!me.dead){
        const cam=camRef.current;
        const tx=cam.x+(mouseRef.current.x-W/2)/cam.scale,ty=cam.y+(mouseRef.current.y-H/2)/cam.scale;
        getServer().clientSend("move",{id,tx,ty});
        const avgX=me.pieces.reduce((s,pc)=>s+pc.x,0)/me.pieces.length,avgY=me.pieces.reduce((s,pc)=>s+pc.y,0)/me.pieces.length;
        cam.x=lerp(cam.x,avgX,.07);cam.y=lerp(cam.y,avgY,.07);
        let spread=0;if(me.pieces.length>1)me.pieces.forEach(pc=>{spread=Math.max(spread,dist(pc,{x:avgX,y:avgY}));});
        const bigR=Math.max(...me.pieces.map(pc=>pc.r));
        cam.scale=lerp(cam.scale,clamp(55/(bigR+spread*.3),.28,1.3),.06);
      }
      drawScene(ctx,W,H,camRef.current,stateRef,id,time);
      drawHud(ctx,W,H,stateRef,id,fps,splitCD,ejectCD,missileCountRef.current);
      animRef.current=requestAnimationFrame(loop);
    };
    animRef.current=requestAnimationFrame(loop);return()=>cancelAnimationFrame(animRef.current);
  },[screen,splitCD,ejectCD]);

  useEffect(()=>{
    if(screen!=="game")return;const canvas=canvasRef.current;if(!canvas)return;
    const onMouseDown=e=>{const W=canvas.offsetWidth,H=canvas.offsetHeight;const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
      const hit=hudButtons(W,H).find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);
      if(hit){hit.act==="split"?doSplit():doEject();return;}
      if(e.button===0){if(missileCountRef.current>0)fireMissile();else doEject();}if(e.button===2)doSplit();};
    const onMU=e=>{if(e.button===0)keysRef.current.lmb=false;};const onMD=e=>{if(e.button===0)keysRef.current.lmb=true;};
    canvas.addEventListener("mousedown",onMouseDown);canvas.addEventListener("mousedown",onMD);canvas.addEventListener("mouseup",onMU);canvas.addEventListener("contextmenu",e=>e.preventDefault());
    return()=>{canvas.removeEventListener("mousedown",onMouseDown);canvas.removeEventListener("mousedown",onMD);canvas.removeEventListener("mouseup",onMU);};
  },[screen,doSplit,doEject]);

  const buySkin=skin=>{
    if(gameMeta.owned.includes(skin.id)){setGameMeta(m=>({...m,equipped:skin.id}));showNotif(`✅ Equipada: ${skin.name}`);return;}
    if(gameMeta.coins<skin.price){showNotif("❌ Moedas insuficientes!","#ff4444");return;}
    setGameMeta(m=>({...m,coins:m.coins-skin.price,owned:[...m.owned,skin.id],equipped:skin.id}));
    showNotif(`🎉 Comprado: ${skin.name} ${skin.emoji}`,"#ffcc44");
  };
  const buyCoins=pkg=>{addCoins(pkg.coins+pkg.bonus);showNotif(`💰 +${pkg.coins+pkg.bonus} moedas!`,"#ffcc44");setPurchaseModal(null);};

  const equippedSkin=SKINS.find(s=>s.id===gameMeta.equipped)||SKINS[0];
  const filteredSkins=SKINS.filter(s=>{
    if(shopTab==="all")return true;if(shopTab==="owned")return gameMeta.owned.includes(s.id);
    if(shopTab==="earned")return s.rarity==="earned"||s.rarity==="secret";return s.rarity===shopTab;
  });

  // ── SHOP ─────────────────────────────────────────────────────────────────────
  if(screen==="shop")return(
    <div style={{position:"fixed",inset:0,background:UI.screen,color:"#fff",fontFamily:UI.font,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:"1px solid rgba(79,227,255,.28)",background:"rgba(6,12,28,.62)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>setScreen("menu")} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",color:"#9fb4d4",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:13}}>← Voltar</button>
          <span style={{fontSize:22,fontWeight:"bold",letterSpacing:2}}>🛍️ LOJA DE SKINS</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setPurchaseModal("coins")} style={{background:"linear-gradient(135deg,#ffb057,#ff7a2f)",border:"none",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,fontWeight:"bold"}}>+ Comprar Moedas</button>
          <div style={{background:"rgba(255,200,0,.15)",border:"1px solid #ffcc00",borderRadius:10,padding:"6px 14px",display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:18}}>🪙</span><span style={{fontSize:18,fontWeight:"bold",color:"#ffcc00"}}>{gameMeta.coins.toLocaleString()}</span>
          </div>
        </div>
      </div>
      <div style={{padding:"10px 20px",background:"rgba(255,255,255,.045)",borderBottom:"1px solid rgba(79,227,255,.18)",display:"flex",alignItems:"center",gap:14,flexShrink:0}}>
        <div style={{width:52,height:52,borderRadius:"50%",background:equippedSkin.color,boxShadow:`0 0 18px ${equippedSkin.glow}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,border:`2px solid ${equippedSkin.glow}`}}>{equippedSkin.emoji}</div>
        <div><div style={{fontSize:11,color:"#4fe3ff"}}>EQUIPADA AGORA</div><div style={{fontSize:17,fontWeight:"bold"}}>{equippedSkin.name}</div><div style={{fontSize:11,color:RARITY_COLORS[equippedSkin.rarity]}}>{RARITY_LABELS[equippedSkin.rarity]}</div></div>
        <div style={{marginLeft:"auto",fontSize:12,color:"#5d6c8c"}}>{gameMeta.owned.length}/50 desbloqueadas</div>
      </div>
      <div style={{display:"flex",gap:6,padding:"10px 20px",flexShrink:0,overflowX:"auto"}}>
        {[["all","Todas"],["owned","Minhas"],["common","Comum"],["rare","Raro"],["epic","Épico"],["legendary","Lendário"],["earned","Conquistas"],["secret","Secretas"]].map(([k,l])=>(
          <button key={k} onClick={()=>setShopTab(k)} style={{background:shopTab===k?"rgba(79,227,255,.3)":"rgba(255,255,255,.05)",border:shopTab===k?"1px solid #4fe3ff":"1px solid rgba(255,255,255,.1)",color:shopTab===k?"#88ddff":"#778899",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:12,whiteSpace:"nowrap",flexShrink:0}}>{l}</button>
        ))}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"8px 16px 20px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,alignContent:"start"}}>
        {filteredSkins.map(skin=>{
          const owned=gameMeta.owned.includes(skin.id),equipped=gameMeta.equipped===skin.id,canAfford=gameMeta.coins>=skin.price,isSecret=skin.rarity==="secret"&&!owned;
          return(
            <div key={skin.id} onClick={()=>!isSecret&&buySkin(skin)}
              style={{background:equipped?"rgba(79,227,255,.2)":"rgba(255,255,255,.04)",border:equipped?"1px solid #4fe3ff":owned?"1px solid rgba(255,255,255,.2)":"1px solid rgba(255,255,255,.07)",borderRadius:14,padding:"12px 10px",cursor:isSecret?"default":"pointer",position:"relative",transition:"transform .15s",opacity:isSecret?.5:1}}
              onMouseEnter={e=>{if(!isSecret)e.currentTarget.style.transform="scale(1.04)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";}}>
              {equipped&&<div style={{position:"absolute",top:6,right:6,background:UI.cyan,borderRadius:4,fontSize:9,padding:"1px 5px",fontWeight:"bold",color:"#000"}}>EQUIPADA</div>}
              {owned&&!equipped&&<div style={{position:"absolute",top:6,right:6,background:"rgba(68,255,136,.7)",borderRadius:4,fontSize:9,padding:"1px 5px",color:"#000",fontWeight:"bold"}}>✓</div>}
              <div style={{width:54,height:54,borderRadius:"50%",background:isSecret?"#222":skin.color,boxShadow:isSecret?"none":`0 0 14px ${skin.glow}44`,margin:"0 auto 8px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,border:`2px solid ${isSecret?"#444":skin.glow+"66"}`}}>{isSecret?"❓":skin.emoji}</div>
              <div style={{fontSize:12,fontWeight:"bold",textAlign:"center",marginBottom:3,color:isSecret?"#445":"#eee"}}>{isSecret?"???":skin.name}</div>
              <div style={{fontSize:10,textAlign:"center",color:RARITY_COLORS[skin.rarity],marginBottom:5}}>{RARITY_LABELS[skin.rarity]}</div>
              {!owned&&skin.price>0&&<div style={{textAlign:"center",fontSize:12,color:canAfford?"#ffcc44":"#cc4444",fontWeight:"bold"}}>🪙 {skin.price.toLocaleString()}</div>}
              {!owned&&skin.rarity==="earned"&&!isSecret&&<div style={{textAlign:"center",fontSize:9,color:"#44ffaa",lineHeight:1.3}}>{skin.desc}</div>}
              {owned&&<div style={{textAlign:"center",fontSize:11,color:equipped?UI.cyan:"#44ffaa"}}>{equipped?"✅ Equipada":"Toque p/ equipar"}</div>}
              {skin.price===0&&skin.rarity==="free"&&<div style={{textAlign:"center",fontSize:11,color:"#888"}}>Grátis</div>}
            </div>
          );
        })}
      </div>
      {purchaseModal==="coins"&&(
        <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
          <div style={{background:"#0a0e2a",border:"1px solid rgba(255,200,0,.4)",borderRadius:18,padding:"28px 32px",maxWidth:420,width:"90%"}}>
            <div style={{fontSize:22,fontWeight:"bold",marginBottom:4,textAlign:"center"}}>💰 Comprar Moedas</div>
            <div style={{fontSize:12,color:"#556",textAlign:"center",marginBottom:20}}>*(Simulado — sem cobrança real)*</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {COIN_PACKAGES.map(pkg=>(
                <div key={pkg.id} onClick={()=>buyCoins(pkg)} style={{background:"rgba(255,200,0,.08)",border:"1px solid rgba(255,200,0,.3)",borderRadius:12,padding:"16px 10px",cursor:"pointer",textAlign:"center",transition:"transform .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.transform="scale(1.05)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
                  <div style={{fontSize:28}}>{pkg.icon}</div>
                  <div style={{fontSize:18,fontWeight:"bold",color:"#ffcc44"}}>{(pkg.coins+pkg.bonus).toLocaleString()}</div>
                  <div style={{fontSize:10,color:"#888"}}>🪙{pkg.bonus>0&&<span style={{color:"#44ffaa"}}> +{pkg.bonus} bônus</span>}</div>
                  <div style={{marginTop:8,background:"linear-gradient(135deg,#ffb057,#ff7a2f)",borderRadius:8,padding:"5px",fontSize:14,fontWeight:"bold",color:"#fff"}}>{pkg.price}</div>
                </div>
              ))}
            </div>
            <button onClick={()=>setPurchaseModal(null)} style={{marginTop:18,width:"100%",padding:"10px",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.15)",borderRadius:10,color:"#aaa",cursor:"pointer",fontSize:14}}>Cancelar</button>
          </div>
        </div>
      )}
      {notification&&<div style={{position:"absolute",bottom:24,left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,30,.95)",border:`1px solid ${notification.color}`,borderRadius:12,padding:"10px 22px",fontSize:15,color:notification.color,fontWeight:"bold",pointerEvents:"none",whiteSpace:"nowrap"}}>{notification.msg}</div>}
    </div>
  );

  // ── MENU ─────────────────────────────────────────────────────────────────────
  if(screen==="menu")return(
    <div style={{position:"fixed",inset:0,background:UI.screen,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:UI.text,fontFamily:UI.font,overflow:"auto",padding:20,gap:12}}>
      {Array.from({length:90}).map((_,i)=><div key={i} style={{position:"absolute",left:`${Math.random()*100}%`,top:`${Math.random()*100}%`,width:`${.8+Math.random()*2}px`,height:`${.8+Math.random()*2}px`,borderRadius:"50%",background:"#dfe8ff",opacity:.15+Math.random()*.5}}/>)}
      <div style={{fontSize:44,fontWeight:200,letterSpacing:4,whiteSpace:"nowrap",textShadow:"0 0 16px rgba(79,227,255,.9),0 0 50px rgba(47,107,255,.7)",textAlign:"center"}}>🪐 PLANET.IO</div>
      <div style={{fontSize:10,letterSpacing:1.6,color:UI.cyan,fontFamily:UI.mono,marginBottom:4}}>CONQUISTE A GALÁXIA · DIVIDA · EJETE · DEVORE</div>
      <div style={{display:"flex",gap:14,alignItems:"flex-start",flexWrap:"wrap",justifyContent:"center",zIndex:1}}>
        <div style={{...UI.panel,width:330,display:"flex",flexDirection:"column",gap:12,boxSizing:"border-box"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,alignSelf:"center",background:"rgba(255,209,102,.07)",border:"1px solid rgba(255,209,102,.3)",borderRadius:999,padding:"5px 16px"}}>
            <span style={{fontSize:16}}>🪙</span><b style={{fontSize:15,color:UI.gold}}>{gameMeta.coins.toLocaleString()}</b><span style={{fontSize:10,color:"#9a8547",letterSpacing:2}}>moedas</span>
          </div>
          <div>
            <div style={{fontSize:10,letterSpacing:3,color:UI.cyan,fontFamily:UI.mono,marginBottom:5}}>NOME DO SEU PLANETA</div>
            <input value={nameInput} onChange={e=>setNameInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&startGame()} maxLength={14}
              style={{...UI.input,padding:12,fontSize:17,textAlign:"center",width:"100%",letterSpacing:1}}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,.045)",border:"1px solid rgba(79,227,255,.2)",borderRadius:12,padding:"9px 12px"}}>
            <div style={{width:42,height:42,borderRadius:"50%",background:equippedSkin.color,boxShadow:`0 0 18px ${equippedSkin.glow}66`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,border:`1px solid ${equippedSkin.glow}`,flexShrink:0}}>{equippedSkin.emoji}</div>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:14,fontWeight:600}}>{equippedSkin.name}</div><div style={{fontSize:10,letterSpacing:2,color:RARITY_COLORS[equippedSkin.rarity]}}>{RARITY_LABELS[equippedSkin.rarity]}</div></div>
            <button onClick={()=>setScreen("shop")} style={{background:"rgba(10,60,90,.45)",border:"1px solid rgba(79,227,255,.45)",borderRadius:8,padding:"6px 12px",color:"#dff7ff",fontSize:11.5,cursor:"pointer"}}>Trocar</button>
          </div>
          <button onClick={startGame} style={{...UI.btn,padding:15,fontSize:17,width:"100%"}}>🚀 JOGAR</button>
          <button onClick={()=>setScreen("shop")} style={{...UI.btn2,padding:12,fontSize:13,width:"100%"}}>◈ LOJA DE SKINS</button>
        </div>
        <div style={{...UI.panel,width:300,display:"flex",flexDirection:"column",gap:9,boxSizing:"border-box"}}>
          <div style={{fontSize:10,letterSpacing:3,color:UI.cyan,fontFamily:UI.mono,textAlign:"center"}}>SALAS ABERTAS</div>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:190,overflowY:"auto"}}>
            {roomList.length===0&&<div style={{fontSize:12,color:UI.dim,textAlign:"center",padding:"14px 0"}}>nenhuma sala ativa — clique em JOGAR para abrir a primeira</div>}
            {roomList.map(r=>(
              <div key={r.code} onClick={()=>entrarNaSala(r.code)}
                style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,cursor:"pointer",
                  background:"rgba(255,255,255,.045)",border:"1px solid rgba(79,227,255,.16)",borderRadius:10,padding:"8px 12px"}}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(79,227,255,.12)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.045)"}>
                <span style={{fontFamily:UI.mono,fontSize:15,letterSpacing:2,color:UI.cyan}}>{r.code}</span>
                <span style={{fontSize:11,color:r.players>=r.max?"#ff6b6b":UI.muted}}>{r.players}/{r.max} jogadores</span>
              </div>
            ))}
          </div>
          <div style={{height:1,background:"rgba(79,227,255,.18)",margin:"2px 0"}}/>
          <div style={{fontSize:10,letterSpacing:3,color:UI.cyan,fontFamily:UI.mono}}>ENTRAR POR CÓDIGO</div>
          <div style={{display:"flex",gap:8}}>
            <input value={roomInput} onChange={e=>setRoomInput(e.target.value.toUpperCase().slice(0,4))}
              onKeyDown={e=>e.key==="Enter"&&roomInput.length===4&&entrarNaSala(roomInput)} placeholder="0ABC" maxLength={4}
              style={{...UI.input,padding:10,fontSize:16,letterSpacing:5,textAlign:"center",flex:1,fontFamily:UI.mono}}/>
            <button onClick={()=>roomInput.length===4&&entrarNaSala(roomInput)} disabled={roomInput.length!==4}
              style={{...UI.btn,padding:"10px 16px",fontSize:12,letterSpacing:2,opacity:roomInput.length===4?1:.4}}>ENTRAR</button>
          </div>
          <div style={{fontSize:11,color:UI.dim,lineHeight:1.5}}>O código aparece no HUD durante a partida — passe para um amigo entrar na mesma sala.</div>
        </div>
      </div>
      <div style={{marginTop:6,color:UI.dim,fontSize:11.5,textAlign:"center",zIndex:1}}>
        🖱️ mouse = mover &nbsp;·&nbsp; <b style={{color:UI.cyan}}>ESPAÇO</b> = dividir &nbsp;·&nbsp; <b style={{color:UI.gold}}>W</b> = ejetar &nbsp;·&nbsp; clique = míssil
      </div>
      {notification&&<div style={{position:"absolute",bottom:24,left:"50%",transform:"translateX(-50%)",background:"rgba(6,12,28,.95)",border:`1px solid ${notification.color}`,borderRadius:12,padding:"10px 22px",fontSize:15,color:notification.color,fontWeight:"bold",pointerEvents:"none"}}>{notification.msg}</div>}
    </div>
  );

  // ── DEAD ─────────────────────────────────────────────────────────────────────
  if(screen==="dead"){
    return(
      <div style={{position:"fixed",inset:0,fontFamily:UI.font,color:UI.text,overflow:"hidden"}}>
        <DeathBg deathCamRef={deathCamRef} killerIdRef={killerIdRef} stateRef={stateRef}/>
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",pointerEvents:"none",gap:12}}>
          <div style={{pointerEvents:"auto",textAlign:"center"}}>
            <div style={{fontSize:54,lineHeight:1,filter:"drop-shadow(0 0 24px rgba(255,90,120,.8))"}}>💥</div>
            <div style={{fontSize:38,fontWeight:200,color:"#ff5f8f",textShadow:"0 0 34px rgba(255,80,130,.75)",letterSpacing:8,marginTop:4}}>ABSORVIDO</div>
            <div style={{fontSize:11.5,color:"#c98d95",marginTop:4}}>— a galáxia continua sem você —</div>
          </div>
          <div style={{pointerEvents:"auto",...UI.panel,border:"1px solid rgba(255,79,216,.4)",display:"flex",flexDirection:"column",alignItems:"center",gap:8,minWidth:300}}>
            <div style={{fontSize:9.5,color:UI.dim,letterSpacing:3,fontFamily:UI.mono}}>DEVORADO POR</div>
            <div style={{fontSize:23,fontWeight:500,color:UI.cyan}}>{eatenBy}</div>
            <div style={{display:"flex",gap:22,marginTop:2}}>
              <div style={{textAlign:"center"}}><div style={{fontSize:21,fontWeight:500,color:"#fff"}}>{finalScore.toLocaleString()}</div><div style={{fontSize:9.5,color:UI.dim,letterSpacing:2,fontFamily:UI.mono}}>MASSA</div></div>
              <div style={{width:1,background:"rgba(79,227,255,.18)"}}/>
              <div style={{textAlign:"center"}}><div style={{fontSize:21,fontWeight:500,color:UI.gold}}>+{deathCoins}</div><div style={{fontSize:9.5,color:UI.dim,letterSpacing:2,fontFamily:UI.mono}}>MOEDAS</div></div>
              <div style={{width:1,background:"rgba(79,227,255,.18)"}}/>
              <div style={{textAlign:"center"}}><div style={{fontSize:21,fontWeight:500,color:UI.magenta}}>{sessionRef.current.kills}</div><div style={{fontSize:9.5,color:UI.dim,letterSpacing:2,fontFamily:UI.mono}}>ABATES</div></div>
            </div>
            {roomCode&&<div style={{fontSize:11,color:UI.muted}}>sala <b style={{color:UI.cyan,fontFamily:UI.mono,letterSpacing:2}}>{roomCode}</b></div>}
          </div>
          <div style={{pointerEvents:"auto",...UI.panel,padding:"16px 20px",display:"flex",flexDirection:"column",gap:10,alignItems:"center",minWidth:300}}>
            <input value={nameInput} onChange={e=>setNameInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&respawn()} maxLength={14}
              style={{...UI.input,padding:11,fontSize:16,textAlign:"center",width:"100%"}}/>
            <div style={{display:"flex",gap:8,width:"100%"}}>
              <button onClick={()=>setScreen("shop")} style={{...UI.btn2,flex:1,padding:11,fontSize:12.5}}>◈ Loja</button>
              <button onClick={respawn} style={{...UI.btn,flex:2,padding:12,fontSize:15}}>⟳ RENASCER</button>
            </div>
            <button onClick={()=>setScreen("menu")} style={{background:"none",border:"none",color:UI.dim,fontSize:11.5,cursor:"pointer"}}>voltar ao menu / trocar de sala</button>
          </div>
        </div>
        {notification&&<div style={{position:"absolute",bottom:24,left:"50%",transform:"translateX(-50%)",background:"rgba(6,12,28,.95)",border:`1px solid ${notification.color}`,borderRadius:12,padding:"10px 22px",fontSize:15,color:notification.color,fontWeight:"bold",pointerEvents:"none"}}>{notification.msg}</div>}
      </div>
    );
  }

  // ── GAME ─────────────────────────────────────────────────────────────────────
  return(
    <div style={{position:"fixed",inset:0,overflow:"hidden",background:"#04060d"}}>
      <canvas ref={canvasRef} style={{display:"block",width:"100%",height:"100%"}}/>
      <div style={{position:"absolute",top:16,right:16,minWidth:210,color:UI.text,fontFamily:UI.font,...UI.hud}}>
        <div style={{fontSize:10,letterSpacing:3,color:"#93a8d4",textAlign:"center",fontWeight:600,fontFamily:UI.mono,marginBottom:7}}>PLACAR</div>
        {leaderboard.slice(0,8).map((p,i)=>{const eu=p.name===myNameRef.current;return(
          <div key={i} style={{fontSize:12.5,fontFamily:UI.mono,padding:"2px 0",display:"flex",justifyContent:"space-between",gap:10,
            color:eu?UI.gold:"#b9cbe6",fontWeight:eu?700:400}}>
            <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:120}}>{i<3?`${i+1}º`:`${i+1}.`} {p.name}{p.isBot?" ◆":""}</span>
            <b style={{color:UI.cyan,fontWeight:400,flexShrink:0}}>{p.mass.toLocaleString()}</b>
          </div>);})}
      </div>
      <div style={{position:"absolute",bottom:16,left:16,color:UI.text,fontFamily:UI.font,...UI.hud}}>
        <div style={{fontSize:28,fontWeight:300,letterSpacing:-.5,color:"#fff",textShadow:"0 0 18px rgba(79,227,255,.6)"}}>{myScore.toLocaleString()}</div>
        <div style={{fontSize:9.5,letterSpacing:3,color:UI.cyan,fontFamily:UI.mono,marginBottom:7}}>MASSA TOTAL</div>
        <div style={{fontSize:11.5,color:"#9fb4d4"}}>planeta <b style={{color:"#e6f4ff"}}>{myNameRef.current}</b></div>
        {roomCode&&<div style={{fontSize:11.5,color:"#9fb4d4"}}>sala <b style={{color:UI.cyan,fontFamily:UI.mono,letterSpacing:2}}>{roomCode}</b></div>}
        <div style={{fontSize:11.5,color:"#9fb4d4"}}>🪙 <b style={{color:UI.gold}}>{gameMeta.coins.toLocaleString()}</b></div>
        <div style={{fontSize:11,color:UI.dim}}>ping {ping}ms</div>
        <button onClick={()=>setScreen("shop")} style={{marginTop:8,width:"100%",background:"rgba(10,60,90,.45)",border:"1px solid rgba(79,227,255,.45)",borderRadius:8,padding:"6px 12px",color:"#dff7ff",fontSize:11.5,cursor:"pointer"}}>◈ Loja</button>
      </div>
      {notification&&<div style={{position:"absolute",bottom:24,left:"50%",transform:"translateX(-50%)",background:"rgba(6,12,28,.95)",border:`1px solid ${notification.color}`,borderRadius:12,padding:"10px 22px",fontSize:15,color:notification.color,fontWeight:"bold",pointerEvents:"none",whiteSpace:"nowrap",fontFamily:UI.font}}>{notification.msg}</div>}
    </div>
  );
}

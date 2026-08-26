// ── MOCKUP ENGINE ─────────────────────────────────────────────────────────────
// Mini-simulação local que replica as entidades do planet.io real (células com
// peças, comida tipada, vírus, massa ejetada, mísseis, bots wander/hunt/flee).
// Cada tema só implementa desenho + CSS; a simulação é sempre esta.
(function(){
"use strict";

const WW=3000,WH=3000;
const MAX_PIECES=8,SPLIT_SPEED=22,FRICTION=0.86,EJECT_SPEED=17,EJECT_R=8,MERGE_BASE=240;
const FOOD_N=180,VIRUS_N=7,BOT_N=9;
const FOOD_TYPES=["asteroid","comet","star","rock"];

const rnd=(a,b)=>a+Math.random()*(b-a);
const pick=a=>a[Math.floor(Math.random()*a.length)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const mergeTime=r=>Math.floor(MERGE_BASE+r*2.2);
function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
// ruído determinístico (mesmo cenário em todo reload — comparação justa)
function mulberry(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

const NAMES=["Nebulox","Vortexia","Cosmara","Drakonis","Stellara","Graviton","Quasara","Pulsaris","Meteora","Darkion","Nexaris","Solaron"];
const MODELS=[["classic","Clássico"],["light","Claro"],["neon","Neon"],["toon","Cartoon"],["cosmic","Cinema"],["pixel","Pixel"],["hybrid","Híbrido"]];

// skins espaciais — mesmos id/nome/preço da tabela real de game.js
const SKINS=[
  {id:0,name:"Planeta Padrão",emoji:"🪐",rarity:"free",price:0,color:"#4ECDC4",glow:"#4ECDC4",ring:false},
  {id:6,name:"Terra",emoji:"🌍",rarity:"common",price:300,color:"#4a9eff",glow:"#44aaff",ring:false},
  {id:1,name:"Marte",emoji:"🔴",rarity:"common",price:200,color:"#c1440e",glow:"#ff6644",ring:false},
  {id:2,name:"Netuno",emoji:"🔵",rarity:"common",price:200,color:"#4060c8",glow:"#6080ff",ring:false},
  {id:5,name:"Júpiter",emoji:"🟠",rarity:"common",price:300,color:"#c88c5a",glow:"#ffaa66",ring:false},
  {id:10,name:"Saturno",emoji:"💛",rarity:"rare",price:600,color:"#c8a060",glow:"#ffcc66",ring:true},
  {id:17,name:"Planeta Gelo",emoji:"🧊",rarity:"rare",price:700,color:"#aaddff",glow:"#cceeff",ring:false},
  {id:18,name:"Planeta Lava",emoji:"🌋",rarity:"rare",price:800,color:"#ff4422",glow:"#ff6600",ring:false},
  {id:21,name:"Quasar",emoji:"🔮",rarity:"epic",price:2000,color:"#cc44ff",glow:"#ee66ff",ring:false},
  {id:22,name:"Supernova",emoji:"💥",rarity:"epic",price:2500,color:"#ff8800",glow:"#ffcc00",ring:false},
  {id:20,name:"Buraco Negro",emoji:"🕳️",rarity:"epic",price:1500,color:"#241033",glow:"#aa00ff",ring:true},
  {id:30,name:"Galáxia",emoji:"🌌",rarity:"legendary",price:5000,color:"#cc88ff",glow:"#ff88ff",ring:true},
];
const RARITY={free:"Grátis",common:"Comum",rare:"Raro",epic:"Épico",legendary:"Lendário"};

// polígono espinhoso do vírus (mesma silhueta do agar.io)
function spikes(c,r,n,inner,phase){c.beginPath();
  for(let i=0;i<n*2;i++){const a=(i/(n*2))*6.2832+(phase||0),rad=i%2?r*inner:r;
    i?c.lineTo(Math.cos(a)*rad,Math.sin(a)*rad):c.moveTo(Math.cos(a)*rad,Math.sin(a)*rad);}
  c.closePath();}
// texto com contorno — nome/massa dentro da célula, igual ao agar.io
function outText(c,txt,x,y,size,fill,stroke,w){
  c.font=`bold ${size}px ${w||'Arial,Helvetica,sans-serif'}`;c.textAlign="center";c.textBaseline="middle";
  if(stroke!==null){c.strokeStyle=stroke||"rgba(0,0,0,.85)";c.lineWidth=Math.max(2,size*.2);c.lineJoin="round";c.strokeText(txt,x,y);}
  c.fillStyle=fill||"#fff";c.fillText(txt,x,y);}
// grid de fundo do agar.io, em coordenadas de mundo
function grid(c,step,color,w){c.strokeStyle=color;c.lineWidth=w||1;c.beginPath();
  for(let x=0;x<=WW;x+=step){c.moveTo(x,0);c.lineTo(x,WH);}
  for(let y=0;y<=WH;y+=step){c.moveTo(0,y);c.lineTo(WW,y);}c.stroke();}

const _spr=new Map();
function sprite(key,size,draw){let c=_spr.get(key);if(c)return c;
  c=document.createElement("canvas");c.width=c.height=size;
  const x=c.getContext("2d");x.translate(size/2,size/2);draw(x,size/2);
  _spr.set(key,c);return c;}
// tamanho do sprite conforme o raio na tela (evita borrar em célula gigante)
const tier=r=>r<=44?128:r<=120?256:512;

const U={rnd,pick,clamp,lerp,dist,rr,mulberry,sprite,tier,WW,WH,mergeTime,spikes,outText,grid,SKINS,RARITY};

function boot(TH){
  const u=U;
  const CULL=()=>{try{return document.body.getAttribute("data-cull")!=="0";}catch(e){return true;}};
  const g={players:{},food:[],viruses:[],ejected:[],missiles:[],lb:[],time:0,screen:"menu",
           me:null,myName:"Explorer",skin:0,coins:2450,kills:0,eatenBy:"",finalScore:0,
           cam:{x:WW/2,y:WH/2,scale:.55*(TH.renderScale||1)},drift:Math.random()*6.28,mouse:{x:0,y:0},
           splitCD:0,ejectCD:0,fps:60,W:0,H:0};

  // ── mundo ───────────────────────────────────────────────────────────────────
  const mkFood=()=>{const roll=Math.random();
    const t=roll<.055?"missile_ammo":roll<.10?pick(["powerup_speed","powerup_magnet","powerup_shield"]):pick(FOOD_TYPES);
    const pc={powerup_speed:"#ffdd00",powerup_magnet:"#ff66ff",powerup_shield:"#44aaff",missile_ammo:"#ff6600"};
    return{x:rnd(40,WW-40),y:rnd(40,WH-40),r:t.indexOf("power")===0?13:t==="missile_ammo"?13:rnd(6,15),
           type:t,color:pc[t]||`hsl(${Math.floor(Math.random()*12)*30},80%,68%)`,seed:Math.random()*99};};
  const mkPiece=(x,y,r,vx,vy)=>({x,y,vx:vx||0,vy:vy||0,r,displayR:r,mergeTimer:0,splitting:false,splitT:null});
  const mkPlayer=(id,name,isBot,skinIx)=>{const sk=TH.skins[skinIx%TH.skins.length];
    return{id,name,isBot,skin:sk,skinId:sk.id,color:sk.color,score:0,dead:false,_missiles:isBot?1:2,_powerups:{},
           pieces:[mkPiece(rnd(300,WW-300),rnd(300,WH-300),isBot?rnd(24,58):26)],
           _tx:WW/2,_ty:WH/2,_st:"wander",_t:0,_hunt:null,_flee:null};};

  for(let i=0;i<FOOD_N;i++)g.food.push(mkFood());
  for(let i=0;i<VIRUS_N;i++)g.viruses.push({x:rnd(300,WW-300),y:rnd(300,WH-300),r:rnd(52,72),pulseT:Math.random()*6.28,seed:Math.random()*99});
  for(let i=0;i<BOT_N;i++){const id="bot"+i;g.players[id]=mkPlayer(id,NAMES[i%NAMES.length],true,i+1);}

  if(TH.init)TH.init(g,u);

  // ── DOM ─────────────────────────────────────────────────────────────────────
  const app=document.getElementById("app");
  app.innerHTML=`
  <canvas id="game"></canvas>
  <div id="hud" class="hidden">
    <div class="hud panel" id="hud-lb"><div class="ph">${TH.labels.lbTitle}</div><div id="lb-rows"></div></div>
    <div class="hud panel" id="hud-score">
      <div class="score-big"><span id="v-mass">0</span></div>
      <div class="score-sub">${TH.labels.massLabel}</div>
      <div class="score-row"><span class="k">${TH.labels.youLabel}</span> <b id="v-name">Explorer</b></div>
      <div class="score-row"><span class="k">${TH.labels.coinIcon}</span> <b id="v-coins">0</b></div>
      <div class="score-row dim">ping 11ms</div>
      <button class="btn-mini" data-go="shop">${TH.labels.shopShort}</button>
    </div>
  </div>
  <div class="screen" id="s-menu">
    <div class="menu-card">
      <div class="brand">${TH.labels.title}</div>
      <div class="tagline">${TH.labels.tagline}</div>
      <div class="coinbar">${TH.labels.coinIcon} <b id="m-coins">2.450</b> <span>${TH.labels.coinWord}</span></div>
      <div class="field"><label>${TH.labels.nameLabel}</label><input id="nameIn" maxlength="14" value="Explorer"></div>
      <div class="skinrow"><canvas class="skinprev" width="112" height="112"></canvas>
        <div class="skinmeta"><b id="m-skin"></b><i id="m-rar"></i></div>
        <button class="btn-mini" data-go="shop">${TH.labels.swap}</button></div>
      <button class="btn-primary" data-go="play">${TH.labels.play}</button>
      <button class="btn-secondary" data-go="shop">${TH.labels.shop}</button>
      <div class="hint">${TH.labels.hint}</div>
    </div>
  </div>
  <div class="screen" id="s-shop">
    <div class="shop-wrap">
      <div class="shop-top"><button class="btn-mini" data-go="menu">${TH.labels.back}</button>
        <span class="shop-title">${TH.labels.shopTitle}</span>
        <span class="coinbar">${TH.labels.coinIcon} <b id="s-coins">2.450</b></span></div>
      <div class="shop-grid" id="shop-grid"></div>
      <div class="shop-note">${TH.labels.shopNote}</div>
    </div>
  </div>
  <div class="screen" id="s-dead">
    <div class="dead-card">
      <div class="dead-icon">${TH.labels.deadIcon}</div>
      <div class="dead-title">${TH.labels.dead}</div>
      <div class="dead-sub">${TH.labels.deadSub}</div>
      <div class="dead-by"><span>${TH.labels.eatenBy}</span><b id="d-by">Nebulox</b></div>
      <div class="dead-stats">
        <div><b id="d-mass">0</b><i>${TH.labels.massLabel}</i></div>
        <div><b id="d-coins">0</b><i>${TH.labels.coinWord}</i></div>
        <div><b id="d-kills">0</b><i>${TH.labels.killsWord}</i></div>
      </div>
      <button class="btn-primary" data-go="play">${TH.labels.respawn}</button>
      <button class="btn-secondary" data-go="menu">${TH.labels.menu}</button>
    </div>
  </div>
  <div id="switcher">
    <span class="sw-lab">${TH.name}</span>
    ${MODELS.map(([f,n],i)=>`<a href="${f}.html" class="${f===TH.id?"on":""}">${i+1}. ${n}</a>`).join("")}
    <a href="index.html" class="sw-home">galeria</a>
  </div>`;

  const cv=document.getElementById("game"),ctx=cv.getContext("2d");
  const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
  const RS=TH.renderScale||1;                       // pixel-art renderiza em baixa resolução
  let off=null,octx=ctx;
  if(RS!==1){off=document.createElement("canvas");octx=off.getContext("2d");}

  // ── telas ───────────────────────────────────────────────────────────────────
  function show(s){g.screen=s;
    $("#s-menu").classList.toggle("on",s==="menu");
    $("#s-shop").classList.toggle("on",s==="shop");
    $("#s-dead").classList.toggle("on",s==="dead");
    $("#hud").classList.toggle("hidden",s!=="game");
    document.body.dataset.screen=s;}
  function fmt(n){return Math.round(n).toLocaleString("pt-BR");}

  function paintSkinPreview(canvas,sk,r){
    if(RS!==1){const w=Math.round(112*RS);if(canvas.width!==w)canvas.width=canvas.height=w;r=r*RS;}
    const c=canvas.getContext("2d");c.clearRect(0,0,canvas.width,canvas.height);
    const p={id:"prev",name:"",skin:sk,skinId:sk.id,color:sk.color,_powerups:{},pieces:[]};
    TH.drawCell(c,{x:canvas.width/2,y:canvas.height/2+2,r:r,displayR:r,vx:0,vy:0,mergeTimer:0,splitting:false},p,false,g.time,true);
  }
  function refreshSkin(){const sk=TH.skins[g.skin];$("#m-skin").textContent=sk.name;
    $("#m-rar").textContent=(TH.rarity[sk.rarity]||sk.rarity);$("#m-rar").style.color=TH.rarityColor[sk.rarity]||"#999";
    paintSkinPreview($(".skinprev"),sk,40);}
  function buildShop(){
    $("#shop-grid").innerHTML=TH.skins.map((s,i)=>`
      <div class="skin-card ${i===g.skin?"eq":""}" data-skin="${i}">
        ${i===g.skin?`<span class="badge">${TH.labels.equipped}</span>`:""}
        <canvas width="112" height="112"></canvas>
        <b>${s.name}</b>
        <i style="color:${TH.rarityColor[s.rarity]}">${TH.rarity[s.rarity]}</i>
        <em>${s.price?TH.labels.coinIcon+" "+fmt(s.price):TH.labels.owned}</em>
      </div>`).join("");
    $$("#shop-grid .skin-card").forEach((el,i)=>{paintSkinPreview(el.querySelector("canvas"),TH.skins[i],38);
      el.onclick=()=>{g.skin=i;const me=g.players[g.me];if(me){me.skin=TH.skins[i];me.skinId=TH.skins[i].id;me.color=TH.skins[i].color;}
        refreshSkin();buildShop();};});
  }

  function startGame(){
    g.myName=($("#nameIn").value||"Explorer").slice(0,14);
    if(g.me&&g.players[g.me])delete g.players[g.me];
    g.me="me";g.kills=0;
    const p=mkPlayer("me",g.myName,false,0);p.skin=TH.skins[g.skin];p.skinId=p.skin.id;p.color=p.skin.color;
    p.pieces=[mkPiece(WW/2+rnd(-500,500),WH/2+rnd(-500,500),30)];
    g.players.me=p;g.cam.x=p.pieces[0].x;g.cam.y=p.pieces[0].y;
    show("game");
  }
  function die(byName){const me=g.players[g.me];if(!me)return;
    const mass=Math.round(me.pieces.reduce((s,p)=>s+p.r*p.r,0));
    g.eatenBy=byName;g.finalScore=mass;const c=Math.floor(mass/300)+g.kills*2;g.coins+=c;
    $("#d-by").textContent=byName;$("#d-mass").textContent=fmt(mass);
    $("#d-coins").textContent="+"+c;$("#d-kills").textContent=g.kills;
    me.dead=true;show("dead");}

  $$("[data-go]").forEach(b=>b.onclick=()=>{const a=b.dataset.go;
    if(a==="play")startGame();else if(a==="shop"){buildShop();show("shop");}else show("menu");});

  // ── input ───────────────────────────────────────────────────────────────────
  addEventListener("mousemove",e=>{const r=cv.getBoundingClientRect();g.mouse.x=e.clientX-r.left;g.mouse.y=e.clientY-r.top;});
  addEventListener("touchmove",e=>{const t=e.touches[0],r=cv.getBoundingClientRect();g.mouse.x=t.clientX-r.left;g.mouse.y=t.clientY-r.top;e.preventDefault();},{passive:false});
  function worldMouse(){const c=g.cam;return{x:c.x+(g.mouse.x-g.W/2)/c.scale,y:c.y+(g.mouse.y-g.H/2)/c.scale};}
  function doSplit(){const me=g.players[g.me];if(!me||me.dead||g.splitCD>0)return;g.splitCD=24;
    const t=worldMouse(),np=[];
    me.pieces.forEach(p=>{if(me.pieces.length+np.length>=MAX_PIECES||p.r<26){np.push(p);return;}
      const nr=p.r/Math.SQRT2,a=Math.atan2(t.y-p.y,t.x-p.x);
      p.r=nr;p.mergeTimer=mergeTime(nr);
      const b=mkPiece(p.x+Math.cos(a)*nr,p.y+Math.sin(a)*nr,nr,Math.cos(a)*SPLIT_SPEED,Math.sin(a)*SPLIT_SPEED);
      b.mergeTimer=mergeTime(nr);b.splitting=true;b.splitT=0;np.push(p,b);});
    me.pieces=np.slice(0,MAX_PIECES);}
  function doEject(){const me=g.players[g.me];if(!me||me.dead||g.ejectCD>0)return;g.ejectCD=7;
    const t=worldMouse();
    me.pieces.forEach(p=>{if(p.r<26)return;const a=Math.atan2(t.y-p.y,t.x-p.x);
      p.r=Math.max(20,Math.sqrt(p.r*p.r-EJECT_R*EJECT_R*1.3));
      g.ejected.push({x:p.x+Math.cos(a)*(p.r+6),y:p.y+Math.sin(a)*(p.r+6),vx:Math.cos(a)*EJECT_SPEED,vy:Math.sin(a)*EJECT_SPEED,r:EJECT_R,color:me.color,life:900});});}
  function fire(p){if(!p||p.dead||!p._missiles)return;p._missiles--;
    const src=p.pieces[0];let best=null,bd=1e9;
    Object.values(g.players).forEach(o=>{if(o===p||o.dead||!o.pieces.length)return;const d=dist(src,o.pieces[0]);if(d<bd){bd=d;best=o;}});
    const a=best?Math.atan2(best.pieces[0].y-src.y,best.pieces[0].x-src.x):Math.random()*6.28;
    g.missiles.push({x:src.x,y:src.y,vx:Math.cos(a)*11,vy:Math.sin(a)*11,r:11,owner:p.id,target:best?best.id:null,life:280,trail:[]});}

  addEventListener("keydown",e=>{
    const k=e.code;
    if(k==="Escape"){location.href="index.html";return;}
    if(document.activeElement&&document.activeElement.tagName==="INPUT")return;
    const n="Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7".split(" ").indexOf(k);
    if(n>=0){location.href=MODELS[n][0]+".html";return;}
    if(k==="KeyM"){show("menu");return;}
    if(k==="KeyL"){buildShop();show("shop");return;}
    if(k==="KeyK"){if(g.screen!=="game"&&!g.players[g.me])startGame();die(pick(NAMES));return;}
    if(g.screen!=="game")return;
    if(k==="Space"){e.preventDefault();doSplit();}
    if(k==="KeyW"){e.preventDefault();g.wDown=true;doEject();}
    if(k==="KeyF")fire(g.players[g.me]);
  });
  addEventListener("keyup",e=>{if(e.code==="KeyW")g.wDown=false;});
  cv.addEventListener("mousedown",e=>{if(g.screen!=="game")return;
    if(e.button===2){doSplit();return;}
    const me=g.players[g.me];if(me&&me._missiles>0)fire(me);else doEject();});
  cv.addEventListener("contextmenu",e=>e.preventDefault());
  setInterval(()=>{if(g.wDown&&g.screen==="game")doEject();},110);

  // ── simulação ───────────────────────────────────────────────────────────────
  function botThink(b){
    b._t--;
    if(b._t<=0){b._t=25+Math.random()*45;
      const c=b.pieces[0],mass=b.pieces.reduce((s,p)=>s+p.r*p.r,0);
      let threat=null,prey=null,td=1e9,pd=1e9;
      Object.values(g.players).forEach(o=>{if(o===b||o.dead||!o.pieces.length)return;
        const om=o.pieces.reduce((s,p)=>s+p.r*p.r,0),d=dist(c,o.pieces[0]);
        if(om>mass*1.25&&d<620&&d<td){td=d;threat=o;}
        else if(mass>om*1.3&&d<760&&d<pd){pd=d;prey=o;}});
      if(threat){b._st="flee";b._flee=threat.id;}
      else if(prey){b._st="hunt";b._hunt=prey.id;}
      else{b._st="wander";b._tx=rnd(150,WW-150);b._ty=rnd(150,WH-150);}}
    const c=b.pieces[0];
    if(b._st==="flee"){const o=g.players[b._flee];
      if(o&&!o.dead&&o.pieces.length){b._tx=c.x*2-o.pieces[0].x;b._ty=c.y*2-o.pieces[0].y;
        if(b._missiles&&Math.random()<.012)fire(b);}else b._st="wander";}
    else if(b._st==="hunt"){const o=g.players[b._hunt];
      if(o&&!o.dead&&o.pieces.length){b._tx=o.pieces[0].x;b._ty=o.pieces[0].y;
        if(b._missiles&&Math.random()<.01)fire(b);
        if(dist(c,o.pieces[0])<c.r*3.2&&c.r>o.pieces[0].r*1.5&&Math.random()<.05)botSplit(b);}else b._st="wander";}
    else{let bf=null,bd=1e9;g.food.forEach(f=>{const d=dist(c,f);if(d<420&&d<bd){bd=d;bf=f;}});
      if(bf){b._tx=bf.x;b._ty=bf.y;}}
    b._tx=clamp(b._tx,40,WW-40);b._ty=clamp(b._ty,40,WH-40);
  }
  function botSplit(b){if(b.pieces.length>=4)return;const np=[];
    b.pieces.forEach(p=>{if(b.pieces.length+np.length>=4||p.r<30){np.push(p);return;}
      const nr=p.r/Math.SQRT2,a=Math.atan2(b._ty-p.y,b._tx-p.x);
      p.r=nr;p.mergeTimer=mergeTime(nr);
      const q=mkPiece(p.x,p.y,nr,Math.cos(a)*SPLIT_SPEED,Math.sin(a)*SPLIT_SPEED);
      q.mergeTimer=mergeTime(nr);q.splitting=true;q.splitT=0;np.push(p,q);});
    b.pieces=np;}

  function tick(){
    g.time+=16;
    const plist=Object.values(g.players).filter(p=>!p.dead);
    const me=g.players[g.me];
    if(me&&!me.dead&&g.screen==="game"){const t=worldMouse();me._tx=t.x;me._ty=t.y;}
    plist.forEach(p=>{if(p.isBot)botThink(p);});

    // movimento
    plist.forEach(p=>{p.pieces.forEach(pc=>{
      const dx=p._tx-pc.x,dy=p._ty-pc.y,len=Math.hypot(dx,dy)||1;
      const spd=clamp(220/pc.r,.8,6)*(p._powerups.speed>0?1.85:1);
      if(len>4){pc.vx+=(dx/len)*spd*.34;pc.vy+=(dy/len)*spd*.34;}
      pc.vx*=FRICTION;pc.vy*=FRICTION;pc.x+=pc.vx;pc.y+=pc.vy;
      pc.x=clamp(pc.x,pc.r,WW-pc.r);pc.y=clamp(pc.y,pc.r,WH-pc.r);
      pc.displayR=lerp(pc.displayR,pc.r,.16);
      if(pc.mergeTimer>0)pc.mergeTimer--;
      if(pc.splitting){pc.splitT+=.06;if(pc.splitT>=1){pc.splitting=false;pc.splitT=null;}}});
      for(const k in p._powerups){if(--p._powerups[k]<=0)delete p._powerups[k];}
      // separar / fundir peças
      for(let i=0;i<p.pieces.length;i++)for(let j=i+1;j<p.pieces.length;j++){
        const a=p.pieces[i],b=p.pieces[j],d=dist(a,b),min=a.r+b.r;
        if(a.mergeTimer<=0&&b.mergeTimer<=0&&d<Math.max(a.r,b.r)*.75){
          a.r=Math.min(Math.sqrt(a.r*a.r+b.r*b.r),300);p.pieces.splice(j,1);j--;continue;}
        if(d<min&&d>0){const nx=(b.x-a.x)/d,ny=(b.y-a.y)/d,push=(min-d)*.24;
          a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;}}
      if(p.pieces.length>1&&p.pieces.every(pc=>pc.mergeTimer<=0)){
        const cx=p.pieces.reduce((s,q)=>s+q.x,0)/p.pieces.length,cy=p.pieces.reduce((s,q)=>s+q.y,0)/p.pieces.length;
        p.pieces.forEach(q=>{q.vx+=(cx-q.x)*.004;q.vy+=(cy-q.y)*.004;});}
    });

    // comida
    plist.forEach(p=>p.pieces.forEach(pc=>{
      g.food=g.food.filter(f=>{
        if(p._powerups.magnet>0&&dist(pc,f)<pc.r*7){const d=dist(pc,f)||1;f.x+=(pc.x-f.x)/d*3.4;f.y+=(pc.y-f.y)/d*3.4;}
        if(dist(pc,f)<pc.r+f.r*.5){
          if(f.type==="missile_ammo")p._missiles=Math.min(p._missiles+1,3);
          else if(f.type.indexOf("powerup_")===0){const t=f.type.slice(8);if(Object.keys(p._powerups).length<3||p._powerups[t])p._powerups[t]=(p._powerups[t]||0)+420;}
          else{pc.r=Math.min(Math.sqrt(pc.r*pc.r+f.r*f.r*.16),300);p.score+=Math.floor(f.r);}
          if(p.id===g.me&&TH.onEat)TH.onEat(g,f,pc);
          g.food.push(mkFood());return false;}
        return true;});}));

    // massa ejetada
    g.ejected.forEach(e=>{e.x+=e.vx;e.y+=e.vy;e.vx*=.94;e.vy*=.94;e.life--;
      e.x=clamp(e.x,e.r,WW-e.r);e.y=clamp(e.y,e.r,WH-e.r);});
    g.ejected=g.ejected.filter(e=>{
      for(const p of plist)for(const pc of p.pieces)
        if(dist(pc,e)<pc.r&&e.life<880){pc.r=Math.min(Math.sqrt(pc.r*pc.r+e.r*e.r*.9),300);return false;}
      return e.life>0;});

    // vírus
    g.viruses.forEach(v=>{v.pulseT+=.05;
      plist.forEach(p=>p.pieces.forEach(pc=>{
        if(pc.r>v.r*.92&&dist(pc,v)<pc.r&&p.pieces.length<MAX_PIECES){
          const n=Math.min(4,MAX_PIECES-p.pieces.length),nr=pc.r/Math.sqrt(n+1);pc.r=nr;pc.mergeTimer=mergeTime(nr);
          for(let i=0;i<n;i++){const a=Math.random()*6.28;
            const q=mkPiece(pc.x,pc.y,nr,Math.cos(a)*SPLIT_SPEED*.8,Math.sin(a)*SPLIT_SPEED*.8);
            q.mergeTimer=mergeTime(nr);q.splitting=true;q.splitT=0;p.pieces.push(q);}
          v.x=rnd(300,WW-300);v.y=rnd(300,WH-300);
          if(TH.onVirus)TH.onVirus(g,v);}}));});

    // mísseis
    g.missiles.forEach(m=>{const t=g.players[m.target];
      if(t&&!t.dead&&t.pieces.length){const a=Math.atan2(t.pieces[0].y-m.y,t.pieces[0].x-m.x);
        m.vx=lerp(m.vx,Math.cos(a)*12,.07);m.vy=lerp(m.vy,Math.sin(a)*12,.07);}
      m.x+=m.vx;m.y+=m.vy;m.life--;
      m.trail.push({x:m.x,y:m.y});if(m.trail.length>14)m.trail.shift();});
    g.missiles=g.missiles.filter(m=>{
      for(const p of plist){if(p.id===m.owner)continue;
        for(const pc of p.pieces)if(dist(pc,m)<pc.r+m.r){
          pc.r=Math.max(18,pc.r*.78);
          for(let i=0;i<5;i++){const a=Math.random()*6.28;
            g.ejected.push({x:pc.x,y:pc.y,vx:Math.cos(a)*9,vy:Math.sin(a)*9,r:EJECT_R,color:p.color,life:700});}
          if(TH.onBoom)TH.onBoom(g,m);return false;}}
      return m.life>0&&m.x>0&&m.y>0&&m.x<WW&&m.y<WH;});

    // jogador vs jogador
    for(const a of plist)for(const b of plist){if(a===b)continue;if(b._powerups.shield>0)continue;
      for(const ap of a.pieces)b.pieces=b.pieces.filter(bp=>{
        if(ap.r<bp.r*1.08)return true;
        if(dist(ap,bp)<ap.r*.72){ap.r=Math.min(Math.sqrt(ap.r*ap.r+bp.r*bp.r*.6),320);a.score+=Math.floor(bp.r*8);
          if(a.id===g.me)g.kills++;
          if(b.id===g.me&&b.pieces.length===1)setTimeout(()=>die(a.name),0);
          return false;}
        return true;});
      if(b.isBot&&b.pieces.length===0)b.pieces=[mkPiece(rnd(300,WW-300),rnd(300,WH-300),rnd(22,32))];}

    // câmera
    if(me&&!me.dead&&me.pieces.length&&g.screen!=="menu"){
      const ax=me.pieces.reduce((s,p)=>s+p.x,0)/me.pieces.length,ay=me.pieces.reduce((s,p)=>s+p.y,0)/me.pieces.length;
      let spread=0;me.pieces.forEach(p=>spread=Math.max(spread,Math.hypot(p.x-ax,p.y-ay)));
      const big=Math.max(...me.pieces.map(p=>p.r));
      g.cam.x=lerp(g.cam.x,ax,.08);g.cam.y=lerp(g.cam.y,ay,.08);
      g.cam.scale=lerp(g.cam.scale,clamp(58/(big+spread*.3),.3,1.25)*RS,.06);
    }else{const c=g.cam;g.drift+=.0016;c.x=clamp(c.x+Math.cos(g.drift)*.7,400,WW-400);c.y=clamp(c.y+Math.sin(g.drift)*.7,400,WH-400);
      c.scale=lerp(c.scale,.42*RS,.01);}

    // leaderboard (com a linha do jogador anexada quando ele está fora do top 8)
    const full=Object.values(g.players).filter(p=>!p.dead).map(p=>({name:p.name,isBot:p.isBot,me:p.id===g.me,
      mass:Math.round(p.pieces.reduce((s,q)=>s+q.r*q.r,0))})).sort((a,b)=>b.mass-a.mass);
    full.forEach((r,i)=>r.rank=i+1);
    const mine=full.find(r=>r.me);
    g.myMass=mine?mine.mass:0;
    g.lb=full.slice(0,8);if(mine&&mine.rank>8)g.lb.push(mine);
    if(g.splitCD>0)g.splitCD--;if(g.ejectCD>0)g.ejectCD--;
  }

  // ── render ──────────────────────────────────────────────────────────────────
  // culling: só desenha o que cabe na tela (o jogo real hoje desenha o mundo
  // inteiro todo quadro — ver relatório de performance)
  function draw(){
    const W=g.W,H=g.H,c=octx,cam=g.cam,t=g.time;
    const hw=W/(2*cam.scale),hh=H/(2*cam.scale);
    const x0=cam.x-hw,x1=cam.x+hw,y0=cam.y-hh,y1=cam.y+hh;
    const cull=CULL();
    const vis=(x,y,r)=>!cull||(x+r>x0&&x-r<x1&&y+r>y0&&y-r<y1);
    let drawn=0;
    c.setTransform(1,0,0,1,0,0);
    TH.drawBg(c,W,H,cam,t,g);
    c.save();c.translate(W/2,H/2);c.scale(cam.scale,cam.scale);c.translate(-cam.x,-cam.y);
    TH.drawWorld(c,cam,t,g,W,H);
    g.food.forEach(f=>{if(vis(f.x,f.y,f.r*4)){TH.drawFood(c,f,t);drawn++;}});
    g.ejected.forEach(e=>{if(vis(e.x,e.y,e.r*2)){TH.drawEjected(c,e,t);drawn++;}});
    g.viruses.forEach(v=>{if(vis(v.x,v.y,v.r*1.5)){TH.drawVirus(c,v,t);drawn++;}});
    g.missiles.forEach(m=>{if(vis(m.x,m.y,m.r*6)){TH.drawMissile(c,m,t);drawn++;}});
    const all=[];Object.values(g.players).filter(p=>!p.dead).forEach(p=>p.pieces.forEach(pc=>{
      if(vis(pc.x,pc.y,pc.r*2.4))all.push([pc,p]);}));
    all.sort((a,b)=>a[0].r-b[0].r).forEach(([pc,p])=>{TH.drawCell(c,pc,p,p.id===g.me,t,false);drawn++;});
    c.restore();
    if(g.screen==="game")TH.drawHud(c,W,H,g,t);
    if(TH.drawPost)TH.drawPost(c,W,H,t,g);
    g.drawn=drawn;
  }

  function sizeCanvas(){const W=cv.offsetWidth,H=cv.offsetHeight;
    if(RS===1){if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}g.W=W;g.H=H;}
    else{const w2=Math.round(W*RS),h2=Math.round(H*RS);
      if(off.width!==w2||off.height!==h2){off.width=w2;off.height=h2;}
      if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}g.W=w2;g.H=h2;}}

  // ── loop ────────────────────────────────────────────────────────────────────
  // métrica: custo por quadro em ms (tick + draw). Não depende de throttle da aba,
  // ao contrário do FPS — aba em segundo plano cai para 1 quadro/s por design.
  let last=performance.now(),acc=0,frames=0,uiT=0,tAcc=0,dAcc=0,sN=0;
  function frame(now){
    const dt=now-last;last=now;
    if(dt<250){acc+=dt;frames++;}          // ignora quadros de pausa/throttle
    const W=cv.offsetWidth,H=cv.offsetHeight;sizeCanvas();
    const _t0=performance.now();tick();const _t1=performance.now();draw();
    if(RS!==1){ctx.setTransform(1,0,0,1,0,0);ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,W,H);ctx.drawImage(off,0,0,W,H);}
    tAcc+=_t1-_t0;dAcc+=performance.now()-_t1;sN++;
    if(sN>=40){
      const st={theme:TH.id,fps:acc>0?Math.round(frames*1000/acc):0,
        tick:+(tAcc/sN).toFixed(2),draw:+(dAcc/sN).toFixed(2),frame:+((tAcc+dAcc)/sN).toFixed(2),
        drawn:g.drawn,cull:CULL()};
      g.fps=st.fps;window.__stats=st;
      const sb=document.getElementById("statbox");
      if(sb)sb.textContent=st.theme+"  ·  "+st.frame+" ms/quadro (tick "+st.tick+" + desenho "+st.draw+
        ")  ·  "+st.drawn+" objetos  ·  culling "+(st.cull?"ligado":"desligado")+"  ·  "+st.fps+" fps";
      tAcc=0;dAcc=0;sN=0;acc=0;frames=0;}
    if(g.screen==="game"&&(uiT+=dt)>120){uiT=0;
      $("#v-mass").textContent=fmt(g.myMass||0);
      $("#v-name").textContent=g.myName;$("#v-coins").textContent=fmt(g.coins);
      $("#lb-rows").innerHTML=g.lb.map(r=>`<div class="lb-row ${r.me?"mine":""}">
        <span>${r.rank<=3?r.rank+"º":r.rank+"."} ${r.name}${r.isBot?" "+TH.labels.botTag:""}</span><b>${fmt(r.mass)}</b></div>`).join("");}
    requestAnimationFrame(frame);
  }
  refreshSkin();show("menu");$("#m-coins").textContent=fmt(g.coins);$("#s-coins").textContent=fmt(g.coins);

  // ── bench ───────────────────────────────────────────────────────────────────
  // ?bench = pior caso: 400 comidas, todo mundo dividido, câmera aberta.
  if(location.search.indexOf("bench")>=0){
    const sb=document.createElement("div");sb.id="statbox";
    sb.style.cssText="position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:99;font:12px monospace;"+
      "color:#7CFC00;background:rgba(0,0,0,.75);padding:5px 12px;border-radius:6px;pointer-events:none";
    document.body.appendChild(sb);
    const heavy=()=>{
      while(g.food.length<400)g.food.push(mkFood());
      const me=g.players.me;if(!me)return;
      const cx=me.pieces[0].x,cy=me.pieces[0].y;
      me.pieces=[];for(let i=0;i<8;i++){const a=i/8*6.283;
        me.pieces.push(mkPiece(cx+Math.cos(a)*190,cy+Math.sin(a)*190,62));}
      me.pieces.forEach(pc=>pc.mergeTimer=9999);
      Object.values(g.players).forEach(b=>{if(!b.isBot)return;
        const r=Math.max(26,b.pieces[0].r/2),bx=b.pieces[0].x,by=b.pieces[0].y;
        b.pieces=[];for(let i=0;i<4;i++){const a=i/4*6.283;
          b.pieces.push(mkPiece(bx+Math.cos(a)*r*2,by+Math.sin(a)*r*2,r));}
        b.pieces.forEach(pc=>pc.mergeTimer=9999);});
      // mísseis sempre em voo
      if(g.missiles.length<6)Object.values(g.players).slice(0,6).forEach(p=>{p._missiles=3;fire(p);});};
    // benchmark síncrono: 60 quadros num laço, imune ao throttle de aba oculta
    const measure=(fn,n)=>{const t0=performance.now();for(let i=0;i<n;i++)fn();
      try{octx.getImageData(0,0,1,1);}catch(e){}                       // força o flush
      return (performance.now()-t0)/n;};
    const runBench=()=>{
      sizeCanvas();                                                    // aba oculta nunca rodou o rAF
      const out=[];
      [true,false].forEach(cullOn=>{
        document.body.setAttribute("data-cull",cullOn?"1":"0");
        for(let i=0;i<12;i++){tick();draw();}                          // aquecimento
        const dms=measure(draw,60),tms=measure(tick,40);
        const bg=measure(()=>TH.drawBg(octx,g.W,g.H,g.cam,g.time,g),30);
        const wl=measure(()=>{octx.save();octx.translate(g.W/2,g.H/2);octx.scale(g.cam.scale,g.cam.scale);
          octx.translate(-g.cam.x,-g.cam.y);TH.drawWorld(octx,g.cam,g.time,g,g.W,g.H);octx.restore();},30);
        const post=TH.drawPost?measure(()=>TH.drawPost(octx,g.W,g.H,g.time,g),30):0;
        out.push((cullOn?"culling ON":"culling OFF")+": desenho "+dms.toFixed(2)+
          "ms + lógica "+tms.toFixed(2)+"ms = "+(dms+tms).toFixed(2)+"ms/quadro ("+g.drawn+" objs"+
          "; fundo "+bg.toFixed(2)+"ms, mundo "+wl.toFixed(2)+"ms, pós "+post.toFixed(2)+"ms)");});
      const txt=TH.id+" | "+out.join(" | ");
      const sb=document.getElementById("statbox");if(sb)sb.textContent=txt;
      document.title="BENCH "+txt;
    };
    const leve=location.search.indexOf("leve")>=0;
    setTimeout(()=>{startGame();if(!leve)heavy();setTimeout(runBench,900);},150);
  }


  requestAnimationFrame(frame);
}

window.MOCK={boot,u:U};
})();

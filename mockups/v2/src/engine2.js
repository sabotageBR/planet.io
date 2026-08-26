// ── MOCKUP ENGINE v2 ──────────────────────────────────────────────────────────
// Mini-simulação local com a física nova (inércia, quique entre planetas,
// asteroides, buracos negros, rastros) + DOM das 11 telas do jogo novo.
// Cada tema só implementa desenho + CSS; a simulação e os dados são sempre estes.
// Contrato do tema: ver docs/design/telas.md (ou o cabeçalho de theme.nebula.js).
(function(){
"use strict";
const D=window.MOCKDATA;
const WW=3000,WH=3000;
const MAX_PIECES=8,SPLIT_SPEED=22,FRICTION=0.92,LAUNCH_FRICTION=0.94,ACC=0.14,EJECT_SPEED=17,EJECT_R=8,MERGE_BASE=240;
const EAT_RATIO=1.15,BOUNCE_E=0.55;
const FOOD_N=180,AST_N=12,BH_N=3,BOT_N=9;
const FOOD_TYPES=["dust","comet","star","rock"];
const Q=new URLSearchParams(location.search);
const SEED=+(Q.get("seed")||7);
const R=mulberry(SEED);                                   // toda aleatoriedade da sim passa por aqui
const rnd=(a,b)=>a+R()*(b-a);
const pick=a=>a[Math.floor(R()*a.length)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const mergeTime=r=>Math.floor(MERGE_BASE+r*2.2);
function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function mulberry(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function sh(hex,a){let n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255;
  const f=x=>Math.max(0,Math.min(255,Math.round(a>0?x+(255-x)*a:x*(1+a))));return`rgb(${f(r)},${f(g)},${f(b)})`;}
function rgba(hex,a){const n=parseInt(hex.slice(1),16);return`rgba(${n>>16},${n>>8&255},${n&255},${a})`;}
const fmt=n=>Math.round(n).toLocaleString("pt-BR");
const fmtTime=s=>{s=Math.round(s);const m=Math.floor(s/60),h=Math.floor(m/60);return h?`${h}h ${m%60}m`:`${m}:${String(s%60).padStart(2,"0")}`;};
const fmtDate=ms=>{const d=new Date(ms);return d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});};

// polígono espinhoso (vírus antigo / estrelas)
function spikes(c,r,n,inner,phase){c.beginPath();
  for(let i=0;i<n*2;i++){const a=(i/(n*2))*6.2832+(phase||0),rad=i%2?r*inner:r;
    i?c.lineTo(Math.cos(a)*rad,Math.sin(a)*rad):c.moveTo(Math.cos(a)*rad,Math.sin(a)*rad);}
  c.closePath();}
// polígono irregular de asteroide (forma determinística por seed; cache)
const _ast=new Map();
function astShape(seed,n){const k=seed+":"+(n||9);let s=_ast.get(k);if(s)return s;
  const r=mulberry(Math.floor(seed*1e6)+1);n=n||9;s=[];for(let i=0;i<n;i++)s.push(.72+r()*.36);_ast.set(k,s);return s;}
function astPoly(c,r,seed,n){const s=astShape(seed,n);c.beginPath();
  for(let i=0;i<s.length;i++){const a=i/s.length*6.2832,rad=r*s[i];
    i?c.lineTo(Math.cos(a)*rad,Math.sin(a)*rad):c.moveTo(Math.cos(a)*rad,Math.sin(a)*rad);}
  c.closePath();}
function outText(c,txt,x,y,size,fill,stroke,w){
  c.font=`bold ${size}px ${w||'Arial,Helvetica,sans-serif'}`;c.textAlign="center";c.textBaseline="middle";
  if(stroke!==null){c.strokeStyle=stroke||"rgba(0,0,0,.85)";c.lineWidth=Math.max(2,size*.2);c.lineJoin="round";c.strokeText(txt,x,y);}
  c.fillStyle=fill||"#fff";c.fillText(txt,x,y);}
function grid(c,step,color,w){c.strokeStyle=color;c.lineWidth=w||1;c.beginPath();
  for(let x=0;x<=WW;x+=step){c.moveTo(x,0);c.lineTo(x,WH);}
  for(let y=0;y<=WH;y+=step){c.moveTo(0,y);c.lineTo(WW,y);}c.stroke();}
function gridDots(c,step,color,size){c.fillStyle=color;const s=size||1.5;
  for(let x=0;x<=WW;x+=step)for(let y=0;y<=WH;y+=step)c.fillRect(x-s/2,y-s/2,s,s);}
// polilinha do rastro: uma única stroke (barato)
function trailPath(c,pc){const t=pc.trail;if(t.length<2)return false;c.beginPath();c.moveTo(t[0].x,t[0].y);
  for(let i=1;i<t.length;i++)c.lineTo(t[i].x,t[i].y);c.lineTo(pc.x,pc.y);return true;}
// minimapa genérico: quem chama já desenhou o fundo; st = cores {me,player,bot,ast,hole,view}
function minimap(c,mx,my,S,g,st){const sc=S/WW;
  if(st.hole)g.holes.forEach(h=>{c.fillStyle=st.hole;c.beginPath();c.arc(mx+h.x*sc,my+h.y*sc,Math.max(2.2,h.ri*sc*.5),0,6.283);c.fill();});
  if(st.ast)g.asteroids.forEach(a=>{c.fillStyle=st.ast;c.fillRect(mx+a.x*sc-1,my+a.y*sc-1,2,2);});
  Object.values(g.players).filter(p=>!p.dead&&p.pieces.length).forEach(p=>{const me=p.id===g.me;
    const x=mx+(p.pieces.reduce((s,q)=>s+q.x,0)/p.pieces.length)*sc,y=my+(p.pieces.reduce((s,q)=>s+q.y,0)/p.pieces.length)*sc;
    c.fillStyle=me?st.me:p.isBot?(st.bot||st.player):st.player;const d=me?2.6:1.8;c.fillRect(x-d,y-d,d*2,d*2);});
  if(st.view&&g.W){const cam=g.cam,hw=g.W/(2*cam.scale)*sc,hh=g.H/(2*cam.scale)*sc;
    c.strokeStyle=st.view;c.lineWidth=1;c.strokeRect(mx+cam.x*sc-hw,my+cam.y*sc-hh,hw*2,hh*2);}}

const _spr=new Map();
function sprite(key,size,draw){let c=_spr.get(key);if(c)return c;
  c=document.createElement("canvas");c.width=c.height=size;
  const x=c.getContext("2d");x.translate(size/2,size/2);draw(x,size/2);
  _spr.set(key,c);return c;}
const tier=r=>r<=44?128:r<=120?256:512;

const U={rnd,pick,clamp,lerp,dist,rr,mulberry,sprite,tier,WW,WH,mergeTime,spikes,astShape,astPoly,outText,grid,gridDots,trailPath,minimap,
  sh,rgba,fmt,fmtTime,fmtDate,SKINS:D.SKINS,RARITY:D.RARITY,RARITY_ORDER:D.RARITY_ORDER,RARITY_COLOR:D.RARITY_COLOR,DATA:D,
  MAX_PIECES,SPLIT_SPEED,EJECT_R};

// ── rótulos padrão (tema sobrescreve só o que quiser) ─────────────────────────
const LABELS={
  title:"🪐 PLANET.IO",tagline:"CONQUISTE A GALÁXIA · DIVIDA · EJETE · DEVORE",
  coinIcon:"🪙",coinWord:"moedas",nameLabel:"Nome do seu planeta",swap:"Trocar",
  play:"🚀 JOGAR",playAuto:"🚀 Jogar (auto)",rooms:"Salas",ranking:"Ranking",profile:"Perfil",shop:"Loja",prefs:"Opções",home:"Início",
  guestNote:"Jogando como convidado",claim:"Reivindicar conta",login:"Entrar",logout:"Sair",guest:"convidado",registered:"conta protegida",
  hint:"mouse = mover · ESPAÇO = dividir · W = ejetar · F/clique = míssil · botão direito = dividir",
  back:"◄ Voltar",equipped:"EQUIPADA",equip:"Equipar",buy:"Comprar",locked:"Bloqueada",secret:"???",
  lbTitle:"PLACAR",massLabel:"MASSA",scoreLabel:"pontos",youLabel:"planeta",killsWord:"abates",botTag:"◆",regTag:"✓",
  dead:"ABSORVIDO",deadIcon:"💥",deadSub:"— a galáxia continua sem você —",eatenBy:"DEVORADO POR",suckedBy:"SUGADO POR",
  respawn:"⟳ RENASCER",toLobby:"Lobby",timeWord:"tempo",rankWord:"ranking diário",coinsEarned:"moedas ganhas",
  lobbyTitle:"SALAS",roomCode:"CÓDIGO",enter:"Entrar",create:"Criar sala",autoNote:"Entra na sala mais cheia com vaga",shard:"shard",botsWord:"bots",
  rankTitle:"RANKING",periods:{all:"Geral",week:"Semanal",day:"Diário"},metrics:{score:"Pontos",mass:"Massa",kills:"Abates"},you:"Você",rankPos:"posição",
  profileTitle:"PERFIL",history:"HISTÓRICO",achievements:"CONQUISTAS",
  stats:{games:"partidas",kills:"abates",bestScore:"melhor pontuação",bestMass:"maior massa",playTime:"tempo jogado",bestStreak:"melhor sequência"},
  causes:{eaten:"devorado",blackhole:"buraco negro",left:"saiu",shutdown:"servidor"},
  shopTitle:"LOJA DE SKINS",shopNote:"Moedas se ganham jogando. Skins de conquista desbloqueiam sozinhas.",filterAll:"Todas",unlocked:"desbloqueadas",
  prefsTitle:"PREFERÊNCIAS",save:"Salvar",reset:"Restaurar padrão",saved:"Preferências salvas",
  accountTitle:"CONTA",claimTab:"Reivindicar",loginTab:"Entrar",nick:"Nick",password:"Senha",password2:"Confirmar senha",email:"E-mail (opcional)",
  claimNote:"Reivindicar a conta trava seu nick e leva skins e moedas para outros dispositivos.",loginNote:"Entre com um nick já reivindicado.",
  confirm:"Confirmar",cancel:"Cancelar",
  reconnTitle:"CONEXÃO PERDIDA",reconnSub:"Reconectando… tentativa {n}/5",
  split:"DIVIDIR",eject:"EJETAR",fire:"MÍSSIL",exit:"Sair",keySplit:"ESPAÇO",keyEject:"W",keyFire:"F",
  ammo:"mísseis",powerups:{speed:"Velocidade",magnet:"Ímã",shield:"Escudo"},
  room:"SALA",ping:"ms",fps:"fps",top5:"TOP 5 HOJE",activeRooms:"SALAS ATIVAS",
};

function boot(TH){
  const u=U,LB=Object.assign({},LABELS,TH.labels||{});
  LB.periods=Object.assign({},LABELS.periods,(TH.labels||{}).periods||{});
  LB.metrics=Object.assign({},LABELS.metrics,(TH.labels||{}).metrics||{});
  LB.stats=Object.assign({},LABELS.stats,(TH.labels||{}).stats||{});
  LB.powerups=Object.assign({},LABELS.powerups,(TH.labels||{}).powerups||{});
  LB.causes=Object.assign({},LABELS.causes,(TH.labels||{}).causes||{});
  TH.labels=LB;
  TH.rarity=TH.rarity||D.RARITY;TH.rarityColor=TH.rarityColor||D.RARITY_COLOR;TH.skins=TH.skins||D.SKINS;
  const CULL=()=>{try{return document.body.getAttribute("data-cull")!=="0";}catch(e){return true;}};
  const SK=id=>TH.skins.find(s=>s.id===id)||TH.skins[0];

  // tokens → :root{--…} antes do CSS do tema
  const tk=TH.tokens||{};
  const kebab=s=>s.replace(/([A-Z])/g,m=>"-"+m.toLowerCase());
  const rootCss=":root{"+Object.keys(tk).map(k=>`--${kebab(k)}:${tk[k]}`).join(";")+"}\n";
  const tcss=document.getElementById("theme-css");if(tcss)tcss.textContent=rootCss+(TH.css||"");

  const g={players:{},food:[],asteroids:[],holes:[],ejected:[],missiles:[],fx:[],lb:[],time:0,tick:0,screen:"entry",
    me:null,myName:D.ME.nick,skin:D.ME.skin,owned:D.ME.owned.slice(),coins:D.ME.coins,kind:D.ME.kind,kills:0,eatenBy:"",finalScore:0,
    cam:{x:WW/2,y:WH/2,scale:.55*(TH.renderScale||1)},drift:rnd(0,6.28),mouse:{x:0,y:0},
    splitCD:0,ejectCD:0,fps:60,ping:24,W:0,H:0,mode:"desktop",prefs:D.prefsDefault(),room:"1ABC",
    session:{start:0,kills:0,maxMass:0,splits:0,ejects:0},reconn:false,reconnN:2,account:false,drawn:0,paused:false};
  g.prefsLive=()=>g.prefs;

  // ── mundo ───────────────────────────────────────────────────────────────────
  const mkFood=()=>{const roll=R();
    const t=roll<.055?"missile_ammo":roll<.10?pick(["powerup_speed","powerup_magnet","powerup_shield"]):pick(FOOD_TYPES);
    const pc={powerup_speed:"#ffdd00",powerup_magnet:"#ff66ff",powerup_shield:"#44aaff",missile_ammo:"#ff6600"};
    return{x:rnd(40,WW-40),y:rnd(40,WH-40),r:t.indexOf("power")===0?13:t==="missile_ammo"?13:rnd(6,15),
      type:t,color:pc[t]||`hsl(${Math.floor(R()*12)*30},80%,68%)`,hue:Math.floor(R()*12),seed:R()*99};};
  let pid=0;
  const mkPiece=(x,y,r,vx,vy)=>({id:++pid,x,y,vx:vx||0,vy:vy||0,r,displayR:r,mergeTimer:0,splitting:false,splitT:null,trail:[],astCd:0,bhCd:0,dead:false});
  const mkPlayer=(id,name,isBot,skinIx,reg)=>{const sk=TH.skins[skinIx%TH.skins.length];
    return{id,name,isBot,showBot:isBot&&!reg,registered:!!reg,skin:sk,skinId:sk.id,color:sk.color,score:0,dead:false,_missiles:isBot?1:2,_powerups:{},
      pieces:[mkPiece(rnd(300,WW-300),rnd(300,WH-300),isBot?rnd(24,58):26)],
      _tx:WW/2,_ty:WH/2,_st:"wander",_t:0,_hunt:null,_flee:null};};
  const mkAst=(belt)=>{const r=rnd(30,62);
    const a={x:rnd(200,WW-200),y:rnd(200,WH-200),vx:0,vy:0,r,rot:rnd(0,6.28),vrot:rnd(-.012,.012),variant:Math.floor(R()*3),seed:R()*99,belt:belt||null,fx:0,fy:0};
    if(belt){a.belt={cx:belt.cx,cy:belt.cy,rad:belt.rad+rnd(-40,40),ang:belt.ang,w:belt.w};a.x=belt.cx+Math.cos(belt.ang)*a.belt.rad;a.y=belt.cy+Math.sin(belt.ang)*a.belt.rad;}
    else{const an=rnd(0,6.28),sp=rnd(.35,1);a.vx=Math.cos(an)*sp;a.vy=Math.sin(an)*sp;}
    return a;};
  const respawnAst=a=>{const n=mkAst(a.belt);Object.assign(a,n);if(a.belt){a.belt.ang=rnd(0,6.28);a.x=a.belt.cx+Math.cos(a.belt.ang)*a.belt.rad;a.y=a.belt.cy+Math.sin(a.belt.ang)*a.belt.rad;}};
  const farFrom=(pts,min)=>{for(let k=0;k<40;k++){const x=rnd(350,WW-350),y=rnd(350,WH-350);
      if(pts.every(p=>Math.hypot(p.x-x,p.y-y)>min))return{x,y};}return{x:rnd(350,WW-350),y:rnd(350,WH-350)};};
  const mkHole=(others)=>{const p=farFrom(others,800),ex=farFrom([p],1200);
    return{x:p.x,y:p.y,rc:32,ri:280,phase:"grow",t:0,k:0,life:Math.floor(rnd(2700,5400)),dir:rnd(0,6.28),ex:ex.x,ey:ex.y,seed:R()*99,spin:rnd(0,6.28)};};
  const respawnHole=h=>Object.assign(h,mkHole(g.holes.filter(o=>o!==h)));

  for(let i=0;i<FOOD_N;i++)g.food.push(mkFood());
  const belt={cx:rnd(900,WW-900),cy:rnd(900,WH-900),rad:330,ang:0,w:.0022};
  for(let i=0;i<6;i++){belt.ang=i/6*6.283;g.asteroids.push(mkAst(belt));}
  for(let i=6;i<AST_N;i++)g.asteroids.push(mkAst(null));
  for(let i=0;i<BH_N;i++)g.holes.push(mkHole(g.holes));
  g.holes.forEach((h,i)=>{if(i){h.phase="active";h.k=1;h.t=Math.floor(rnd(0,h.life*.5));}});
  for(let i=0;i<BOT_N;i++){const id="bot"+i;g.players[id]=mkPlayer(id,i%3===0?D.HUMANS[(i*5+2)%D.HUMANS.length]:D.NAMES[i%D.NAMES.length],true,i+1,i%3===0);}

  if(TH.init)TH.init(g,u);

  // ── DOM ─────────────────────────────────────────────────────────────────────
  const app=document.getElementById("app");
  const NAV=[["entry",LB.home],["lobby",LB.rooms],["rank",LB.ranking],["profile",LB.profile],["shop",LB.shop],["prefs",LB.prefs]];
  const nav=cur=>`<nav class="nav">${NAV.map(([s,l])=>`<button class="nav-btn ${s===cur?"on":""}" data-go="${s}" data-nav="${s}"><i class="nav-ico"></i><span>${l}</span></button>`).join("")}</nav>`;
  const header=(title,cur)=>`<header class="sh"><button class="btn-mini back" data-go="entry">${LB.back}</button><h1 class="stitle">${title}</h1><span class="coinbar sh-coins">${LB.coinIcon} <b class="v-coins"></b></span></header>`;
  const field=(id,label,type,extra)=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type||"text"}" ${extra||""}></div>`;
  app.innerHTML=`
  <canvas id="game"></canvas>
  <div id="hud" class="hidden">
    <div id="hud-top">
      <span class="chip" id="h-room"><i>${LB.room}</i> <b id="v-room">1ABC</b></span>
      <span class="chip" id="h-net"><b id="v-ping">24</b><i>${LB.ping}</i> <b id="v-fps">60</b><i>${LB.fps}</i></span>
      <button class="btn-mini" id="h-exit" data-go="lobby">${LB.exit}</button>
    </div>
    <div class="panel" id="hud-lb"><div class="ph">${LB.lbTitle}</div><div id="lb-rows"></div></div>
    <div class="panel" id="hud-score">
      <div class="score-big"><span id="v-mass">0</span></div>
      <div class="score-sub">${LB.massLabel}</div>
      <div class="score-row"><span class="k">${LB.scoreLabel}</span> <b id="v-score">0</b></div>
      <div class="score-row"><span class="k">${LB.youLabel}</span> <b id="v-name"></b></div>
      <div class="score-row"><span class="k">${LB.coinIcon}</span> <b id="v-coins"></b></div>
    </div>
    <div id="hud-status">
      <div class="chip" id="hud-ammo"><i>🚀</i> <b id="v-ammo">0</b> <span>${LB.ammo}</span></div>
      <div id="hud-pw"></div>
    </div>
    <div id="hud-cd">
      <div class="cd" id="cd-split"><i class="cd-fill"></i><span>${LB.split}</span><em>${LB.keySplit}</em></div>
      <div class="cd" id="cd-eject"><i class="cd-fill"></i><span>${LB.eject}</span><em>${LB.keyEject}</em></div>
    </div>
    <div id="touch">
      <button class="tbtn" id="t-split"><span>${LB.split}</span></button>
      <button class="tbtn" id="t-eject"><span>${LB.eject}</span></button>
      <button class="tbtn" id="t-fire"><span>${LB.fire}</span><b id="t-ammo">0</b></button>
    </div>
  </div>

  <div class="screen" id="s-entry"><div class="wrap entry-wrap">
    <div class="brand-block"><div class="brand">${LB.title}</div><div class="tagline">${LB.tagline}</div></div>
    <div class="card entry-main">
      <div class="coinbar">${LB.coinIcon} <b class="v-coins"></b> <span>${LB.coinWord}</span></div>
      ${field("nameIn",LB.nameLabel,"text",'maxlength="16" autocomplete="off"')}
      <div class="skinrow"><canvas class="skinprev" width="112" height="112"></canvas>
        <div class="skinmeta"><b id="m-skin"></b><i id="m-rar"></i></div>
        <button class="btn-mini" data-go="shop">${LB.swap}</button></div>
      <button class="btn-primary" data-go="play">${LB.play}</button>
      <div class="entry-links">
        <button class="btn-secondary" data-go="lobby">${LB.rooms}</button>
        <button class="btn-secondary" data-go="rank">${LB.ranking}</button>
        <button class="btn-secondary" data-go="profile">${LB.profile}</button>
        <button class="btn-secondary" data-go="shop">${LB.shop}</button>
        <button class="btn-secondary" data-go="prefs">${LB.prefs}</button>
      </div>
      <div class="guest-note"><span class="gn-txt">${LB.guestNote}</span><button class="btn-link" data-go="account">${LB.claim}</button></div>
      <div class="hint">${LB.hint}</div>
    </div>
    <aside class="card entry-side">
      <div class="ph">${LB.top5}</div><div class="mini-rank" id="entry-top5"></div>
      <div class="ph">${LB.activeRooms}</div><div class="mini-rooms" id="entry-rooms"></div>
    </aside>
  </div></div>

  <div class="screen" id="s-lobby"><div class="wrap lobby-wrap">
    ${nav("lobby")}${header(LB.lobbyTitle,"lobby")}
    <div class="card lobby-hero">
      <div class="me-chip"><canvas class="skinprev-sm" width="56" height="56"></canvas><div><b class="v-nick"></b><i class="v-kind"></i></div></div>
      <button class="btn-primary" data-go="play">${LB.playAuto}</button><span class="hint">${LB.autoNote}</span>
      <div class="code-row"><input id="codeIn" maxlength="4" placeholder="${LB.roomCode}" autocomplete="off">
        <button class="btn-secondary" data-go="play">${LB.enter}</button><button class="btn-secondary" data-go="play">${LB.create}</button></div>
    </div>
    <div class="card room-list" id="room-list"></div>
    <aside class="card lobby-side"><div class="ph">${LB.top5}</div><div class="mini-rank" id="lobby-top5"></div></aside>
  </div></div>

  <div class="screen" id="s-rank"><div class="wrap rank-wrap">
    ${nav("rank")}${header(LB.rankTitle,"rank")}
    <div class="toggles">
      <div class="seg" id="rk-period">${D.PERIODS.map(p=>`<button data-p="${p}" class="${p==="all"?"on":""}">${LB.periods[p]}</button>`).join("")}</div>
      <div class="seg" id="rk-metric">${D.METRICS.map(m=>`<button data-m="${m}" class="${m==="score"?"on":""}">${LB.metrics[m]}</button>`).join("")}</div>
    </div>
    <div class="card rank-table"><table id="rk-table"><thead><tr><th class="c-rank">#</th><th class="c-nick">${LB.youLabel}</th><th class="c-val num" id="rk-valh">${LB.metrics.score}</th><th class="c-delta num">Δ</th></tr></thead><tbody></tbody></table></div>
    <div class="card rank-me" id="rk-me"></div>
  </div></div>

  <div class="screen" id="s-profile"><div class="wrap profile-wrap">
    ${nav("profile")}${header(LB.profileTitle,"profile")}
    <div class="card profile-head">
      <canvas class="skinprev" width="112" height="112"></canvas>
      <div class="pf-meta"><b class="v-nick pf-nick"></b><i class="v-kind pf-kind"></i><span class="coinbar">${LB.coinIcon} <b class="v-coins"></b></span></div>
      <button class="btn-secondary pf-claim" data-go="account">${LB.claim}</button>
    </div>
    <div class="stat-cards" id="pf-stats"></div>
    <div class="card pf-hist"><div class="ph">${LB.history}</div><table id="pf-table"><thead><tr><th>data</th><th>sala</th><th class="num">massa</th><th class="num">${LB.killsWord}</th><th class="num">pos.</th><th class="num">${LB.timeWord}</th><th class="num">${LB.coinIcon}</th><th>fim</th></tr></thead><tbody></tbody></table></div>
    <div class="card pf-ach"><div class="ph">${LB.achievements}</div><div class="ach-grid" id="pf-ach"></div></div>
  </div></div>

  <div class="screen" id="s-shop"><div class="wrap shop-wrap">
    ${nav("shop")}${header(LB.shopTitle,"shop")}
    <div class="card shop-eq"><canvas class="skinprev" width="112" height="112"></canvas>
      <div class="skinmeta"><b id="s-skin"></b><i id="s-rar"></i><span class="hint" id="s-count"></span></div><span class="badge">${LB.equipped}</span></div>
    <div class="filters" id="shop-filters"><button data-f="all" class="on">${LB.filterAll}</button>${D.RARITY_ORDER.map(r=>`<button data-f="${r}" style="--rc:${D.RARITY_COLOR[r]}">${D.RARITY[r]}</button>`).join("")}</div>
    <div class="shop-grid" id="shop-grid"></div>
    <div class="shop-note hint">${LB.shopNote}</div>
  </div></div>

  <div class="screen" id="s-prefs"><div class="wrap prefs-wrap">
    ${nav("prefs")}${header(LB.prefsTitle,"prefs")}
    <div class="prefs-groups" id="prefs-groups"></div>
    <div class="prefs-foot"><button class="btn-secondary" id="pf-reset">${LB.reset}</button><button class="btn-primary" id="pf-save">${LB.save}</button></div>
  </div></div>

  <div class="screen" id="s-dead"><div class="card dead-card">
    <div class="dead-icon">${LB.deadIcon}</div>
    <div class="dead-title">${LB.dead}</div>
    <div class="dead-sub">${LB.deadSub}</div>
    <div class="dead-by"><span id="d-by-lab">${LB.eatenBy}</span><b id="d-by"></b></div>
    <div class="dead-stats">
      <div><b id="d-mass">0</b><i>${LB.massLabel}</i></div>
      <div><b id="d-kills">0</b><i>${LB.killsWord}</i></div>
      <div><b id="d-time">0</b><i>${LB.timeWord}</i></div>
      <div><b id="d-coins">0</b><i>${LB.coinsEarned}</i></div>
    </div>
    <div class="dead-rank"><span>${LB.rankWord}</span><b id="d-rank"></b></div>
    <div class="dead-actions"><button class="btn-primary" data-go="play">${LB.respawn}</button><button class="btn-secondary" data-go="lobby">${LB.toLobby}</button></div>
  </div></div>

  <div class="overlay" id="s-account"><div class="card modal account">
    <div class="modal-title">${LB.accountTitle}</div>
    <div class="tabs"><button data-tab="claim" class="on">${LB.claimTab}</button><button data-tab="login">${LB.loginTab}</button></div>
    <form class="tab tab-claim on" onsubmit="return false">
      <p class="hint">${LB.claimNote}</p>
      ${field("ac-nick",LB.nick,"text",'value="Evandro"')}${field("ac-pass",LB.password,"password")}${field("ac-pass2",LB.password2,"password")}${field("ac-mail",LB.email,"email")}
      <div class="modal-actions"><button class="btn-secondary" data-go="account-close">${LB.cancel}</button><button class="btn-primary" data-go="account-claim">${LB.confirm}</button></div>
    </form>
    <form class="tab tab-login" onsubmit="return false">
      <p class="hint">${LB.loginNote}</p>
      ${field("lg-nick",LB.nick,"text")}${field("lg-pass",LB.password,"password")}
      <div class="modal-actions"><button class="btn-secondary" data-go="account-close">${LB.cancel}</button><button class="btn-primary" data-go="account-close">${LB.login}</button></div>
    </form>
  </div></div>

  <div class="overlay" id="s-reconn"><div class="card modal reconn">
    <div class="spinner"></div>
    <div class="modal-title rc-title">${LB.reconnTitle}</div>
    <div class="rc-sub" id="rc-sub"></div>
    <button class="btn-secondary" data-go="lobby">${LB.toLobby}</button>
  </div></div>`;

  // barra de desenvolvimento (fora do #app: não entra no "aparelho" nem no screenshot)
  const SCREENS=[["entry","Entrada","E"],["account","Conta","C"],["lobby","Salas","S"],["rank","Ranking","R"],["profile","Perfil","P"],["shop","Loja","L"],["prefs","Opções","O"],["game","Jogo","J"],["dead","Morte","K"],["reconn","Reconn.","X"]];
  const mi=D.MODELS.findIndex(m=>m[0]===TH.id),prev=D.MODELS[(mi-1+D.MODELS.length)%D.MODELS.length],next=D.MODELS[(mi+1)%D.MODELS.length];
  const bar=document.createElement("div");bar.id="devbar";
  bar.innerHTML=`<a class="db-arrow" href="${prev[0]}.html${location.search}" title="[">◄</a><b class="db-model">${mi+1}. ${TH.name}</b><a class="db-arrow" href="${next[0]}.html${location.search}" title="]">►</a>
    <span class="db-sep"></span>${SCREENS.map(([s,l,k])=>`<button data-screen="${s}" title="${k}">${l}</button>`).join("")}
    <span class="db-sep"></span>${[["desktop","Desktop"],["portrait","Retrato"],["landscape","Paisagem"]].map(([m,l])=>`<button data-mode="${m}" title="T">${l}</button>`).join("")}
    <span class="db-sep"></span><a href="index.html">galeria</a><span class="db-key">H esconde</span>`;
  document.body.appendChild(bar);
  if(Q.has("nobar"))bar.style.display="none";

  const cv=document.getElementById("game"),ctx=cv.getContext("2d");
  const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
  const RS=TH.renderScale||1;
  let off=null,octx=ctx;
  if(RS!==1){off=document.createElement("canvas");octx=off.getContext("2d");}

  // ── telas ───────────────────────────────────────────────────────────────────
  const MAIN=["entry","lobby","rank","profile","shop","prefs","dead","game"];
  function show(s){if(!MAIN.includes(s))return;g.screen=s;
    MAIN.forEach(k=>{const el=$("#s-"+k);if(el)el.classList.toggle("on",k===s);});
    $("#hud").classList.toggle("hidden",s!=="game");
    document.body.dataset.screen=s;
    const r={lobby:renderLobby,rank:renderRank,profile:renderProfile,shop:renderShop,prefs:renderPrefs,entry:renderEntry}[s];if(r)r();}
  function setAccount(on){g.account=on;$("#s-account").classList.toggle("on",on);}
  function setReconn(on){g.reconn=on;$("#s-reconn").classList.toggle("on",on);
    if(on){$("#rc-sub").textContent=LB.reconnSub.replace("{n}",g.reconnN);}}
  function setMode(m){g.mode=m;document.body.dataset.mode=m;$$("#devbar [data-mode]").forEach(b=>b.classList.toggle("on",b.dataset.mode===m));fit();}
  function fit(){const W=innerWidth,H=innerHeight;let s=1;if(document.body.dataset.frame==="0"){document.documentElement.style.setProperty("--fit","1");return;}
    if(g.mode==="portrait")s=Math.min(1,(H-56)/844,(W-24)/390);else if(g.mode==="landscape")s=Math.min(1,(H-56)/390,(W-24)/844);
    document.documentElement.style.setProperty("--fit",s.toFixed(3));}

  function paintSkinPreview(canvas,sk,r){
    if(RS!==1){const w=Math.round(112*RS);if(canvas.width!==w)canvas.width=canvas.height=w;r=r*RS;}
    const c=canvas.getContext("2d");c.clearRect(0,0,canvas.width,canvas.height);
    if(TH.paintSkin){c.save();c.translate(canvas.width/2,canvas.height/2);TH.paintSkin(c,sk,r*(canvas.width/112),g);c.restore();return;}
    const p={id:"prev",name:"",skin:sk,skinId:sk.id,color:sk.color,_powerups:{},pieces:[]};
    TH.drawCell(c,{x:canvas.width/2,y:canvas.height/2+2,r:r*(canvas.width/112),displayR:r*(canvas.width/112),vx:0,vy:0,mergeTimer:0,splitting:false,trail:[]},p,false,g.time,true,g);}
  function refreshMeta(){const sk=TH.skins[g.skin];if(document.activeElement!==$("#nameIn"))$("#nameIn").value=g.myName;
    $$(".v-coins").forEach(e=>e.textContent=fmt(g.coins));$$(".v-nick").forEach(e=>e.textContent=g.myName);
    $$(".v-kind").forEach(e=>{e.textContent=g.kind==="guest"?LB.guest:LB.registered;e.dataset.kind=g.kind;});
    $("#m-skin").textContent=sk.name;$("#m-rar").textContent=TH.rarity[sk.rarity]||sk.rarity;$("#m-rar").style.color=TH.rarityColor[sk.rarity]||"#999";
    $$(".skinprev").forEach(c=>paintSkinPreview(c,sk,40));$$(".skinprev-sm").forEach(c=>paintSkinPreview(c,sk,20));
    $(".guest-note").dataset.kind=g.kind;$(".gn-txt").textContent=g.kind==="guest"?LB.guestNote:LB.registered;
    $(".guest-note .btn-link").style.display=g.kind==="guest"?"":"none";$(".pf-claim").style.display=g.kind==="guest"?"":"none";}
  const miniRank=(el,n)=>{el.innerHTML=D.RANK.day.score.slice(0,n).map(r=>`<div class="mr-row"><span class="mr-pos">${r.rank}</span><span class="mr-nick">${r.nick}${r.registered?` <i class="reg">${LB.regTag}</i>`:""}</span><b class="mr-val">${fmt(r.value)}</b></div>`).join("");};
  function renderEntry(){miniRank($("#entry-top5"),5);
    $("#entry-rooms").innerHTML=D.ROOMS.slice(0,4).map(r=>`<div class="mr-row"><b class="code">${r.code}</b><span>${r.players}/${r.max}</span><span class="dim">${r.ping} ms</span></div>`).join("");}
  function renderLobby(){miniRank($("#lobby-top5"),5);
    $("#room-list").innerHTML=`<div class="room-row head"><span class="code">${LB.roomCode}</span><span class="shard">${LB.shard}</span><span class="pl">${LB.youLabel}s</span><span class="bots">${LB.botsWord}</span><span class="ping">${LB.ping}</span><span class="act"></span></div>`+
      D.ROOMS.map(r=>`<div class="room-row ${r.players>=r.max?"full":""}" data-code="${r.code}"><b class="code">${r.code}</b><span class="shard">${r.shard}</span>
        <span class="pl"><i class="bar" style="--p:${r.players/r.max}"></i>${r.players}/${r.max}</span><span class="bots">${r.bots}</span><span class="ping">${r.ping}</span>
        <span class="act"><button class="btn-mini" data-go="play" data-room="${r.code}" ${r.players>=r.max?"disabled":""}>${LB.enter}</button></span></div>`).join("");}
  let rkP="all",rkM="score";
  function renderRank(){const rows=D.RANK[rkP][rkM];$("#rk-valh").textContent=LB.metrics[rkM];
    $("#rk-table tbody").innerHTML=rows.map(r=>`<tr class="${r.me?"me":""} ${r.rank<=3?"top top"+r.rank:""}"><td class="c-rank">${r.rank}</td><td class="c-nick">${r.nick}${r.registered?` <i class="reg">${LB.regTag}</i>`:""}</td><td class="c-val num">${fmt(r.value)}</td><td class="c-delta num ${r.delta>0?"up":r.delta<0?"down":""}">${r.delta>0?"▲"+r.delta:r.delta<0?"▼"+(-r.delta):"·"}</td></tr>`).join("");
    const me=rows.find(r=>r.me);$("#rk-me").innerHTML=`<span>${LB.you}</span><b>${me.rank}º</b><span>${fmt(me.value)} ${LB.metrics[rkM].toLowerCase()}</span>`;
    $$("#rk-period button").forEach(b=>b.classList.toggle("on",b.dataset.p===rkP));$$("#rk-metric button").forEach(b=>b.classList.toggle("on",b.dataset.m===rkM));}
  function renderProfile(){const s=D.ME.stats;
    $("#pf-stats").innerHTML=[["games",s.games],["kills",s.kills],["bestScore",fmt(s.bestScore)],["bestMass",fmt(s.bestMass)],["playTime",fmtTime(s.playTime)],["bestStreak",s.bestStreak]]
      .map(([k,v])=>`<div class="stat card"><b>${v}</b><i>${LB.stats[k]}</i></div>`).join("");
    $("#pf-table tbody").innerHTML=D.HISTORY.map(h=>`<tr><td>${fmtDate(h.when)}</td><td class="code">${h.room}</td><td class="num">${fmt(h.mass)}</td><td class="num">${h.kills}</td><td class="num">${h.rank}º</td><td class="num">${fmtTime(h.dur)}</td><td class="num">+${h.coins}</td><td class="cause ${h.cause}">${LB.causes[h.cause]}${h.by?` <i>${h.by}</i>`:""}</td></tr>`).join("");
    $("#pf-ach").innerHTML=D.ACHIEVEMENTS.map(a=>{const done=g.achievements.includes(a.key),pr=a.progress?Math.min(1,a.progress[0]/a.progress[1]):done?1:0;
      return`<div class="ach ${done?"done":""} ${a.secret?"secret":""}"><span class="ach-ico">${a.icon}</span><div class="ach-body"><b>${a.title}</b><i>${a.desc}</i>
        <span class="ach-bar"><i style="--p:${pr}"></i></span></div><em class="ach-coins">+${a.coins}</em></div>`;}).join("");}
  let shopF="all";
  function renderShop(){const sk=TH.skins[g.skin];$("#s-skin").textContent=sk.name;$("#s-rar").textContent=TH.rarity[sk.rarity];$("#s-rar").style.color=TH.rarityColor[sk.rarity];
    $("#s-count").textContent=`${g.owned.length}/${TH.skins.length} ${LB.unlocked}`;
    $$("#shop-filters button").forEach(b=>b.classList.toggle("on",b.dataset.f===shopF));
    const list=TH.skins.filter(s=>shopF==="all"||s.rarity===shopF);
    $("#shop-grid").innerHTML=list.map(s=>{const own=g.owned.includes(s.id),eq=s.id===sk.id,sec=s.rarity==="secret"&&!own,earned=s.rarity==="earned"&&!own;
      const st=eq?"eq":own?"owned":sec?"secret":earned?"locked":s.price>g.coins?"poor":"buyable";
      return`<div class="skin-card ${st}" data-skin="${s.id}" data-rar="${s.rarity}" style="--rc:${TH.rarityColor[s.rarity]}">
        ${eq?`<span class="badge">${LB.equipped}</span>`:""}<canvas width="112" height="112"></canvas>
        <b>${sec?LB.secret:s.name}</b><i>${TH.rarity[s.rarity]}</i>
        <em>${own?(eq?"":LB.equip):sec?"???":earned?s.desc:LB.coinIcon+" "+fmt(s.price)}</em></div>`;}).join("");
    $$("#shop-grid .skin-card").forEach(el=>{const s=SK(+el.dataset.skin);paintSkinPreview(el.querySelector("canvas"),el.classList.contains("secret")?Object.assign({},s,{emoji:"❓"}):s,36);
      el.onclick=()=>{const own=g.owned.includes(s.id);
        if(own){g.skin=TH.skins.indexOf(s);}else if(s.price>0&&g.coins>=s.price){g.coins-=s.price;g.owned.push(s.id);g.skin=TH.skins.indexOf(s);}else return;
        const me=g.players[g.me];if(me){me.skin=TH.skins[g.skin];me.skinId=me.skin.id;me.color=me.skin.color;}
        refreshMeta();renderShop();};});
    $$(".skinprev").forEach(c=>paintSkinPreview(c,sk,40));}
  function renderPrefs(){$("#prefs-groups").innerHTML=D.PREFS.map(gp=>`<section class="card pg" id="pg-${gp.id}"><h2>${gp.title}</h2>${gp.items.map(it=>{const v=g.prefs[it.key];
      const ctl=it.type==="toggle"?`<button class="toggle" role="switch" aria-checked="${v}" data-pref="${it.key}"><i></i></button>`
        :it.type==="select"?`<select data-pref="${it.key}">${it.opts.map(([k,l])=>`<option value="${k}" ${k===v?"selected":""}>${l}</option>`).join("")}</select>`
        :`<span class="range"><input type="range" min="${it.min}" max="${it.max}" value="${v}" data-pref="${it.key}"><b>${v}</b></span>`;
      return`<div class="pref-row"><label>${it.label}</label>${ctl}</div>`;}).join("")}</section>`).join("");
    $$("[data-pref]").forEach(el=>{const k=el.dataset.pref;
      if(el.classList.contains("toggle"))el.onclick=()=>{g.prefs[k]=!g.prefs[k];el.setAttribute("aria-checked",g.prefs[k]);applyPrefs();};
      else if(el.tagName==="SELECT")el.onchange=()=>{g.prefs[k]=el.value;applyPrefs();};
      else el.oninput=()=>{g.prefs[k]=+el.value;el.nextElementSibling.textContent=el.value;};});}
  function applyPrefs(){$("#h-net").style.display=g.prefs.fps?"":"none";document.body.dataset.reduce=g.prefs.reduceMotion?"1":"0";document.body.dataset.bigtext=g.prefs.bigText?"1":"0";}
  $("#pf-reset").onclick=()=>{g.prefs=D.prefsDefault();renderPrefs();applyPrefs();};
  $("#pf-save").onclick=()=>{toast(LB.saved);};
  let toastT=null;function toast(msg){let t=$("#toast");if(!t){t=document.createElement("div");t.id="toast";app.appendChild(t);}t.textContent=msg;t.classList.add("on");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("on"),1800);}

  g.achievements=D.ME.achievements.slice();
  function startGame(){
    g.myName=($("#nameIn").value||D.ME.nick).slice(0,16);
    if(g.me&&g.players[g.me])delete g.players[g.me];
    g.me="me";g.kills=0;g.session={start:g.tick,kills:0,maxMass:0,splits:0,ejects:0};
    const p=mkPlayer("me",g.myName,false,0,g.kind==="registered");p.skin=TH.skins[g.skin];p.skinId=p.skin.id;p.color=p.skin.color;
    const sp=farFrom(g.holes.concat(g.asteroids),420);p.pieces=[mkPiece(sp.x,sp.y,30)];
    g.players.me=p;g.cam.x=p.pieces[0].x;g.cam.y=p.pieces[0].y;
    $("#v-room").textContent=g.room;setReconn(false);show("game");}
  function die(byName,hole){const me=g.players[g.me];if(!me)return;
    const mass=Math.round(g.session.maxMass),secs=(g.tick-g.session.start)/60;
    g.eatenBy=byName;g.finalScore=mass;const c=Math.min(500,Math.floor(me.score/300)+g.kills*2+(secs>=300?25:0));g.coins+=c;
    $("#d-by-lab").textContent=hole?LB.suckedBy:LB.eatenBy;$("#d-by").textContent=byName;$("#d-mass").textContent=fmt(mass);
    $("#d-kills").textContent=g.kills;$("#d-time").textContent=fmtTime(secs);$("#d-coins").textContent="+"+c;
    const before=41,after=Math.max(1,before-Math.floor(mass/600)-g.kills);$("#d-rank").innerHTML=`${before}º <span class="arrow">→</span> ${after}º`;
    me.dead=true;refreshMeta();show("dead");}

  // navegação (data-go) e barra
  document.addEventListener("click",e=>{const b=e.target.closest("[data-go]");if(!b)return;const a=b.dataset.go;
    if(a==="play"){if(b.dataset.room)g.room=b.dataset.room;else if($("#codeIn").value.length===4)g.room=$("#codeIn").value.toUpperCase();startGame();}
    else if(a==="account")setAccount(true);
    else if(a==="account-close")setAccount(false);
    else if(a==="account-claim"){g.kind="registered";g.myName=$("#ac-nick").value||g.myName;$("#nameIn").value=g.myName;setAccount(false);refreshMeta();toast("Conta reivindicada");}
    else{setAccount(false);show(a);}});
  $$("#s-account .tabs button").forEach(b=>b.onclick=()=>{$$("#s-account .tabs button").forEach(x=>x.classList.toggle("on",x===b));
    $(".tab-claim").classList.toggle("on",b.dataset.tab==="claim");$(".tab-login").classList.toggle("on",b.dataset.tab==="login");});
  $$("#rk-period button").forEach(b=>b.onclick=()=>{rkP=b.dataset.p;renderRank();});
  $$("#rk-metric button").forEach(b=>b.onclick=()=>{rkM=b.dataset.m;renderRank();});
  $$("#shop-filters button").forEach(b=>b.onclick=()=>{shopF=b.dataset.f;renderShop();});
  $("#codeIn").addEventListener("input",e=>{e.target.value=e.target.value.toUpperCase().replace(/[^0-9A-Z]/g,"");});
  $("#nameIn").addEventListener("change",()=>{g.myName=$("#nameIn").value||g.myName;refreshMeta();});
  $$("#devbar [data-screen]").forEach(b=>b.onclick=()=>gotoScreen(b.dataset.screen));
  $$("#devbar [data-mode]").forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
  function gotoScreen(s){
    if(s==="game"){if(g.screen!=="game"||!g.players[g.me]||g.players[g.me].dead)startGame();else show("game");}
    else if(s==="dead"){if(!g.players[g.me]||g.players[g.me].dead)startGame();g.session={start:g.tick-372*60,kills:3,maxMass:4820,splits:9,ejects:31};g.kills=3;g.players.me.score=6900;die(pick(D.NAMES),false);}
    else if(s==="account"){show("entry");setAccount(true);}
    else if(s==="reconn"){if(g.screen!=="game"||!g.players[g.me]||g.players[g.me].dead)startGame();setReconn(!g.reconn);}
    else{setAccount(false);show(s);}}
  if(TH.mount)TH.mount(app,g,u);

  // ── input ───────────────────────────────────────────────────────────────────
  function canvasPos(e){const r=cv.getBoundingClientRect();const sx=cv.offsetWidth/(r.width||1),sy=cv.offsetHeight/(r.height||1);
    return{x:(e.clientX-r.left)*sx,y:(e.clientY-r.top)*sy};}
  addEventListener("pointermove",e=>{const p=canvasPos(e);g.mouse.x=p.x;g.mouse.y=p.y;});
  addEventListener("touchmove",e=>{if(e.target===cv)e.preventDefault();},{passive:false});
  function worldMouse(){const c=g.cam;return{x:c.x+(g.mouse.x*RS-g.W/2)/c.scale,y:c.y+(g.mouse.y*RS-g.H/2)/c.scale};}
  function doSplit(){const me=g.players[g.me];if(!me||me.dead||g.splitCD>0)return;g.splitCD=24;g.session.splits++;
    const t=worldMouse(),np=[];
    me.pieces.forEach(p=>{if(me.pieces.length+np.length>=MAX_PIECES||p.r<26){np.push(p);return;}
      const nr=p.r/Math.SQRT2,a=Math.atan2(t.y-p.y,t.x-p.x);
      p.r=nr;p.mergeTimer=mergeTime(nr);p.vx-=Math.cos(a)*SPLIT_SPEED*.1;p.vy-=Math.sin(a)*SPLIT_SPEED*.1;
      const b=mkPiece(p.x+Math.cos(a)*nr*.6,p.y+Math.sin(a)*nr*.6,nr,p.vx+Math.cos(a)*SPLIT_SPEED,p.vy+Math.sin(a)*SPLIT_SPEED);
      b.mergeTimer=mergeTime(nr);b.splitting=true;b.splitT=0;np.push(p,b);
      g.fx.push({t:"split",x:p.x,y:p.y,r:nr,age:0,ttl:16,color:me.color});});
    me.pieces=np.slice(0,MAX_PIECES);}
  function doEject(){const me=g.players[g.me];if(!me||me.dead||g.ejectCD>0)return;g.ejectCD=7;g.session.ejects++;
    const t=worldMouse();
    me.pieces.forEach(p=>{if(p.r<26)return;const a=Math.atan2(t.y-p.y,t.x-p.x);
      const m0=p.r*p.r;p.r=Math.max(20,Math.sqrt(p.r*p.r-EJECT_R*EJECT_R*1.3));
      p.vx-=Math.cos(a)*EJECT_SPEED*(EJECT_R*EJECT_R/m0);p.vy-=Math.sin(a)*EJECT_SPEED*(EJECT_R*EJECT_R/m0);
      g.ejected.push({x:p.x+Math.cos(a)*(p.r+6),y:p.y+Math.sin(a)*(p.r+6),vx:p.vx+Math.cos(a)*EJECT_SPEED,vy:p.vy+Math.sin(a)*EJECT_SPEED,r:EJECT_R,color:me.color,hue:me.skin.glow||me.color,life:900,owner:me.id});});}
  function fire(p){if(!p||p.dead||!p._missiles)return;p._missiles--;
    const src=p.pieces[0];let best=null,bd=1e9;
    Object.values(g.players).forEach(o=>{if(o===p||o.dead||!o.pieces.length)return;const d=dist(src,o.pieces[0]);if(d<bd){bd=d;best=o;}});
    const a=best?Math.atan2(best.pieces[0].y-src.y,best.pieces[0].x-src.x):rnd(0,6.28);
    g.missiles.push({x:src.x,y:src.y,vx:Math.cos(a)*11,vy:Math.sin(a)*11,r:11,owner:p.id,target:best?best.id:null,life:280,trail:[]});}
  const inInput=()=>document.activeElement&&/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  addEventListener("keydown",e=>{
    const k=e.code;
    if(k==="Escape"){if(g.account){setAccount(false);return;}if(inInput()){document.activeElement.blur();return;}location.href="index.html";return;}
    if(inInput())return;
    const n="Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9 Digit0".split(" ").indexOf(k);
    if(n>=0&&D.MODELS[n]){location.href=D.MODELS[n][0]+".html"+location.search;return;}
    if(k==="BracketLeft"){location.href=prev[0]+".html"+location.search;return;}
    if(k==="BracketRight"){location.href=next[0]+".html"+location.search;return;}
    const sk={KeyE:"entry",KeyM:"entry",KeyC:"account",KeyS:"lobby",KeyR:"rank",KeyP:"profile",KeyL:"shop",KeyO:"prefs",KeyJ:"game",KeyK:"dead",KeyX:"reconn"}[k];
    if(sk){gotoScreen(sk);return;}
    if(k==="KeyT"){setMode(g.mode==="desktop"?"portrait":g.mode==="portrait"?"landscape":"desktop");return;}
    if(k==="KeyH"){bar.style.display=bar.style.display==="none"?"":"none";return;}
    if(g.screen!=="game")return;
    if(k==="Space"){e.preventDefault();doSplit();}
    if(k==="KeyW"){e.preventDefault();g.wDown=true;doEject();}
    if(k==="KeyF")fire(g.players[g.me]);
  });
  addEventListener("keyup",e=>{if(e.code==="KeyW")g.wDown=false;});
  cv.addEventListener("pointerdown",e=>{if(g.screen!=="game")return;const p=canvasPos(e);g.mouse.x=p.x;g.mouse.y=p.y;
    if(g.mode!=="desktop"||e.pointerType==="touch")return;             // no celular o toque só mira; ações nos botões
    if(e.button===2){if(g.prefs.rightSplit)doSplit();return;}
    const me=g.players[g.me];if(me&&me._missiles>0)fire(me);else doEject();});
  cv.addEventListener("contextmenu",e=>e.preventDefault());
  const hold=(el,fn,rep)=>{let iv=null;const down=e=>{e.preventDefault();fn();if(rep)iv=setInterval(fn,110);};const up=()=>{clearInterval(iv);iv=null;};
    el.addEventListener("pointerdown",down);el.addEventListener("pointerup",up);el.addEventListener("pointercancel",up);el.addEventListener("pointerleave",up);};
  hold($("#t-split"),doSplit,false);hold($("#t-eject"),doEject,true);hold($("#t-fire"),()=>fire(g.players[g.me]),false);
  setInterval(()=>{if(g.wDown&&g.prefs.holdEject&&g.screen==="game")doEject();},110);

  // ── simulação ───────────────────────────────────────────────────────────────
  const G=3920;                                                       // buraco negro: a = G/max(d,rc)²
  function botThink(b){
    b._t--;
    if(b._t<=0){b._t=25+R()*45;
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
        if(b._missiles&&R()<.012)fire(b);}else b._st="wander";}
    else if(b._st==="hunt"){const o=g.players[b._hunt];
      if(o&&!o.dead&&o.pieces.length){b._tx=o.pieces[0].x;b._ty=o.pieces[0].y;
        if(b._missiles&&R()<.01)fire(b);
        if(dist(c,o.pieces[0])<c.r*3.2&&c.r>o.pieces[0].r*1.5&&R()<.05)botSplit(b);}else b._st="wander";}
    else{let bf=null,bd=1e9;g.food.forEach(f=>{const d=dist(c,f);if(d<420&&d<bd){bd=d;bf=f;}});
      if(bf){b._tx=bf.x;b._ty=bf.y;}}
    for(const h of g.holes){const d=dist(c,h);if(h.k>.3&&d<h.ri*1.3){b._tx=c.x+(c.x-h.x)*3;b._ty=c.y+(c.y-h.y)*3;}}   // evita buracos negros
    b._tx=clamp(b._tx,40,WW-40);b._ty=clamp(b._ty,40,WH-40);
  }
  function botSplit(b){if(b.pieces.length>=4)return;const np=[];
    b.pieces.forEach(p=>{if(b.pieces.length+np.length>=4||p.r<30){np.push(p);return;}
      const nr=p.r/Math.SQRT2,a=Math.atan2(b._ty-p.y,b._tx-p.x);
      p.r=nr;p.mergeTimer=mergeTime(nr);
      const q=mkPiece(p.x,p.y,nr,Math.cos(a)*SPLIT_SPEED,Math.sin(a)*SPLIT_SPEED);
      q.mergeTimer=mergeTime(nr);q.splitting=true;q.splitT=0;np.push(p,q);});
    b.pieces=np;}
  // impulso elástico entre dois círculos com massa r² (correção posicional + restituição e)
  function bounce(A,B,e,fxKind){const dx=B.x-A.x,dy=B.y-A.y,d=Math.hypot(dx,dy);if(d<1e-4)return false;
    const nx=dx/d,ny=dy/d,ma=A.r*A.r,mb=B.r*B.r,ia=1/ma,ib=1/mb,im=ia+ib,pen=A.r+B.r-d;
    A.x-=nx*pen*.3*ia/im;A.y-=ny*pen*.3*ia/im;B.x+=nx*pen*.3*ib/im;B.y+=ny*pen*.3*ib/im;
    const vn=(B.vx-A.vx)*nx+(B.vy-A.vy)*ny;if(vn>0)return false;
    const j=-(1+e)*vn/im;A.vx-=j*nx*ia;A.vy-=j*ny*ia;B.vx+=j*nx*ib;B.vy+=j*ny*ib;
    if(fxKind&&-vn>1.6&&g.fx.length<32)g.fx.push({t:fxKind,x:A.x+nx*A.r,y:A.y+ny*A.r,r:Math.min(A.r,B.r),age:0,ttl:14,nx,ny,power:Math.min(1,-vn/8)});
    return true;}
  function pop(p,pc,a){const n=Math.min(clamp(Math.floor(pc.r/22),2,6),MAX_PIECES-p.pieces.length);if(n<1)return false;
    const nr=pc.r/Math.sqrt(n+1);pc.r=nr;pc.mergeTimer=mergeTime(nr);
    for(let i=0;i<n;i++){const an=rnd(0,6.28);const q=mkPiece(pc.x,pc.y,nr,Math.cos(an)*SPLIT_SPEED*.8,Math.sin(an)*SPLIT_SPEED*.8);
      q.mergeTimer=mergeTime(nr);q.splitting=true;q.splitT=0;p.pieces.push(q);}
    g.fx.push({t:"pop",x:a.x,y:a.y,r:a.r,age:0,ttl:22,color:p.color});respawnAst(a);
    if(TH.onPop)TH.onPop(g,pc,a);return true;}
  function chip(p,pc,a,nx,ny){pc.r=Math.max(16,pc.r*Math.sqrt(.96));const n=1+(R()<.5?1:0);
    for(let i=0;i<n;i++){const an=Math.atan2(-ny,-nx)+rnd(-.6,.6);
      g.ejected.push({x:pc.x-nx*pc.r,y:pc.y-ny*pc.r,vx:Math.cos(an)*6,vy:Math.sin(an)*6,r:EJECT_R*.8,color:p.color,hue:p.skin.glow||p.color,life:600,owner:null});}
    g.fx.push({t:"chip",x:pc.x+nx*pc.r,y:pc.y+ny*pc.r,r:pc.r*.4,age:0,ttl:12,nx,ny,color:p.color});}
  function suck(p,pc,h){pc.r*=Math.sqrt(.7);g.fx.push({t:"suck",x:h.x,y:h.y,r:h.rc,age:0,ttl:20,color:p.color});
    if(pc.r<16){pc.dead=true;return;}
    pc.x=h.ex+rnd(-30,30);pc.y=h.ey+rnd(-30,30);const an=rnd(0,6.28);pc.vx=Math.cos(an)*15;pc.vy=Math.sin(an)*15;pc.bhCd=60;pc.trail=[];
    g.fx.push({t:"exit",x:pc.x,y:pc.y,r:pc.r,age:0,ttl:20,color:p.color});}

  function tick(){
    g.time+=16;g.tick++;
    const plist=Object.values(g.players).filter(p=>!p.dead);
    const me=g.players[g.me];
    if(me&&!me.dead&&g.screen==="game"&&!g.reconn){const t=worldMouse();me._tx=t.x;me._ty=t.y;}
    plist.forEach(p=>{if(p.isBot)botThink(p);});

    // movimento com inércia: acelera até vmax; acima de vmax (arremesso) só o arrasto freia
    plist.forEach(p=>{p.pieces.forEach(pc=>{
      const dx=p._tx-pc.x,dy=p._ty-pc.y,len=Math.hypot(dx,dy)||1;
      const vmax=clamp(220/pc.r,.8,6)*(p._powerups.speed>0?1.85:1);
      const sp=Math.hypot(pc.vx,pc.vy),launch=sp>vmax*1.05;
      if(len>4&&!(p.id===g.me&&g.reconn)){const k=vmax*ACC*(launch?1.5:1);pc.vx+=(dx/len)*k;pc.vy+=(dy/len)*k;}
      const f=launch?LAUNCH_FRICTION:FRICTION;pc.vx*=f;pc.vy*=f;
      if(!launch){const s2=Math.hypot(pc.vx,pc.vy);if(s2>vmax){pc.vx*=vmax/s2;pc.vy*=vmax/s2;}}
      pc.x+=pc.vx;pc.y+=pc.vy;
      if(pc.x<pc.r){pc.x=pc.r;pc.vx*=-.4;}else if(pc.x>WW-pc.r){pc.x=WW-pc.r;pc.vx*=-.4;}
      if(pc.y<pc.r){pc.y=pc.r;pc.vy*=-.4;}else if(pc.y>WH-pc.r){pc.y=WH-pc.r;pc.vy*=-.4;}
      pc.displayR=lerp(pc.displayR,pc.r,.16);
      if(pc.mergeTimer>0)pc.mergeTimer--;if(pc.astCd>0)pc.astCd--;if(pc.bhCd>0)pc.bhCd--;
      if(pc.splitting){pc.splitT+=.06;if(pc.splitT>=1){pc.splitting=false;pc.splitT=null;}}
      if(g.tick%2===0){if(Math.hypot(pc.vx,pc.vy)>1.2)pc.trail.push({x:pc.x,y:pc.y});else if(pc.trail.length)pc.trail.shift();
        if(pc.trail.length>12)pc.trail.shift();}});
      for(const k in p._powerups){if(--p._powerups[k]<=0)delete p._powerups[k];}
      // separar / fundir peças do mesmo dono
      for(let i=0;i<p.pieces.length;i++)for(let j=i+1;j<p.pieces.length;j++){
        const a=p.pieces[i],b=p.pieces[j],d=dist(a,b),min=a.r+b.r;
        if(a.mergeTimer<=0&&b.mergeTimer<=0&&d<Math.max(a.r,b.r)*.75){
          const ma=a.r*a.r,mb=b.r*b.r;a.vx=(a.vx*ma+b.vx*mb)/(ma+mb);a.vy=(a.vy*ma+b.vy*mb)/(ma+mb);
          a.r=Math.min(Math.sqrt(ma+mb),300);g.fx.push({t:"merge",x:a.x,y:a.y,r:a.r,age:0,ttl:18,color:p.color});p.pieces.splice(j,1);j--;continue;}
        if(d<min*.92&&d>0){const nx=(b.x-a.x)/d,ny=(b.y-a.y)/d,push=(min*.92-d)*.2;
          a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;
          const vn=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(vn<0){a.vx+=vn*nx*.3;a.vy+=vn*ny*.3;b.vx-=vn*nx*.3;b.vy-=vn*ny*.3;}}}
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
          if(p.id===g.me){if(g.fx.length<32)g.fx.push({t:"eat",x:f.x,y:f.y,r:f.r,age:0,ttl:10,color:f.color});if(TH.onEat)TH.onEat(g,f,pc);}
          g.food.push(mkFood());return false;}
        return true;});}));

    // massa ejetada: voa, alimenta asteroides, é comida
    g.ejected.forEach(e=>{e.x+=e.vx;e.y+=e.vy;e.vx*=.94;e.vy*=.94;e.life--;
      if(e.x<e.r){e.x=e.r;e.vx*=-.5;}else if(e.x>WW-e.r){e.x=WW-e.r;e.vx*=-.5;}
      if(e.y<e.r){e.y=e.r;e.vy*=-.5;}else if(e.y>WH-e.r){e.y=WH-e.r;e.vy*=-.5;}});
    g.ejected=g.ejected.filter(e=>{
      for(const a of g.asteroids)if(dist(a,e)<a.r+e.r*.6&&e.life<880){a.r=Math.min(a.r+1.6,80);a.fx+=e.vx;a.fy+=e.vy;a.vx+=e.vx*.04;a.vy+=e.vy*.04;
        if(a.r>72){const l=Math.hypot(a.fx,a.fy)||1,child=mkAst(null);child.x=a.x+a.fx/l*(a.r+40);child.y=a.y+a.fy/l*(a.r+40);child.r=28;child.vx=a.fx/l*9;child.vy=a.fy/l*9;
          g.asteroids.push(child);a.r=36;a.fx=a.fy=0;g.fx.push({t:"shoot",x:a.x,y:a.y,r:a.r,age:0,ttl:16});}
        return false;}
      for(const p of plist)for(const pc of p.pieces)
        if(dist(pc,e)<pc.r&&(e.owner!==p.id||e.life<880)){pc.r=Math.min(Math.sqrt(pc.r*pc.r+e.r*e.r*.9),300);return false;}
      return e.life>0;});
    if(g.asteroids.length>AST_N+6)g.asteroids.splice(AST_N+6);

    // asteroides: cinturão orbita, errantes vagam; quicam entre si e nas bordas
    g.asteroids.forEach(a=>{
      if(a.belt){a.belt.ang+=a.belt.w;const tx=a.belt.cx+Math.cos(a.belt.ang)*a.belt.rad,ty=a.belt.cy+Math.sin(a.belt.ang)*a.belt.rad;
        a.vx+=(tx-a.x)*.004;a.vy+=(ty-a.y)*.004;a.vx*=.96;a.vy*=.96;}
      a.x+=a.vx;a.y+=a.vy;a.rot+=a.vrot;
      if(a.x<a.r){a.x=a.r;a.vx*=-.9;}else if(a.x>WW-a.r){a.x=WW-a.r;a.vx*=-.9;}
      if(a.y<a.r){a.y=a.r;a.vy*=-.9;}else if(a.y>WH-a.r){a.y=WH-a.r;a.vy*=-.9;}});
    for(let i=0;i<g.asteroids.length;i++)for(let j=i+1;j<g.asteroids.length;j++){const a=g.asteroids[i],b=g.asteroids[j];
      if(dist(a,b)<a.r+b.r)bounce(a,b,.9,"rock");}
    // peças × asteroides: maior estoura (pop), menor quica e perde lascas
    plist.forEach(p=>p.pieces.forEach(pc=>{for(const a of g.asteroids){const d=dist(pc,a);
      if(pc.r>a.r*1.1&&d<pc.r*.82){if(pop(p,pc,a))break;}
      if(d<pc.r+a.r&&d>0){const nx=(a.x-pc.x)/d,ny=(a.y-pc.y)/d;
        if(bounce(pc,a,.6,"bounce")&&pc.astCd<=0){pc.astCd=30;chip(p,pc,a,nx,ny);}}}}));

    // buracos negros
    g.holes.forEach(h=>{h.t++;h.spin+=.02;
      if(h.phase==="grow"){h.k=h.t/120;if(h.t>=120){h.phase="active";h.k=1;h.t=0;}}
      else if(h.phase==="active"){h.k=1;if(h.t%240===0)h.dir=rnd(0,6.28);h.x=clamp(h.x+Math.cos(h.dir)*.17,300,WW-300);h.y=clamp(h.y+Math.sin(h.dir)*.17,300,WH-300);
        if(h.t>=h.life){h.phase="fade";h.t=0;}}
      else{h.k=1-h.t/180;if(h.t>=180){respawnHole(h);return;}}
      const ri=h.ri*h.k,rc=h.rc*h.k;if(ri<10)return;
      const pull=(o,mult)=>{const dx=h.x-o.x,dy=h.y-o.y,d=Math.hypot(dx,dy);if(d>ri||d<1e-3)return 1e9;
        const a=Math.min(G/(Math.max(d,rc)*Math.max(d,rc)),1.4)*h.k*mult;o.vx+=dx/d*a;o.vy+=dy/d*a;return d;};
      plist.forEach(p=>p.pieces.forEach(pc=>{const d=pull(pc,1);if(d<rc&&pc.bhCd<=0)suck(p,pc,h);}));
      g.ejected.forEach(e=>{if(pull(e,1.6)<rc)e.life=0;});
      g.missiles.forEach(m=>pull(m,.8));
      g.asteroids.forEach(a=>{if(!a.belt&&pull(a,.5)<rc)respawnAst(a);});
      g.food.forEach(f=>{const dx=h.x-f.x,dy=h.y-f.y,d=Math.hypot(dx,dy);if(d<ri&&d>1e-3){const a=Math.min(G/(Math.max(d,rc)*Math.max(d,rc)),1.4)*h.k*6;f.x+=dx/d*a;f.y+=dy/d*a;
        if(d<rc)Object.assign(f,mkFood());}});});
    plist.forEach(p=>{p.pieces=p.pieces.filter(pc=>!pc.dead);
      if(!p.pieces.length){if(p.isBot)p.pieces=[mkPiece(rnd(300,WW-300),rnd(300,WH-300),rnd(22,32))];else if(p.id===g.me&&!p.dead)setTimeout(()=>die("buraco negro",true),0);}});

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
          for(let i=0;i<5;i++){const a=rnd(0,6.28);
            g.ejected.push({x:pc.x,y:pc.y,vx:Math.cos(a)*9,vy:Math.sin(a)*9,r:EJECT_R,color:p.color,hue:p.skin.glow||p.color,life:700,owner:null});}
          g.fx.push({t:"boom",x:m.x,y:m.y,r:pc.r,age:0,ttl:24});if(TH.onBoom)TH.onBoom(g,m);return false;}}
      return m.life>0&&m.x>0&&m.y>0&&m.x<WW&&m.y<WH;});

    // jogador × jogador: só o bem maior engole; tamanhos parecidos quicam
    for(let i=0;i<plist.length;i++)for(let j=i+1;j<plist.length;j++){const a=plist[i],b=plist[j];
      for(const ap of a.pieces)for(const bp of b.pieces){if(ap.dead||bp.dead)continue;const d=dist(ap,bp);
        if(ap.r>=bp.r*EAT_RATIO){if(d<ap.r-bp.r*.4&&!(b._powerups.shield>0))eat(a,ap,b,bp);}
        else if(bp.r>=ap.r*EAT_RATIO){if(d<bp.r-ap.r*.4&&!(a._powerups.shield>0))eat(b,bp,a,ap);}
        else if(d<ap.r+bp.r&&d>0)bounce(ap,bp,(a._powerups.shield>0||b._powerups.shield>0)?.9:BOUNCE_E,"bounce");}}
    function eat(a,ap,b,bp){bp.dead=true;ap.r=Math.min(Math.sqrt(ap.r*ap.r+bp.r*bp.r*.6),320);a.score+=Math.floor(bp.r*8);
      g.fx.push({t:"eat",x:bp.x,y:bp.y,r:bp.r,age:0,ttl:16,color:b.color});
      if(a.id===g.me){g.kills++;g.session.kills++;}}
    plist.forEach(p=>{p.pieces=p.pieces.filter(pc=>!pc.dead);
      if(!p.pieces.length){if(p.isBot){p.pieces=[mkPiece(rnd(300,WW-300),rnd(300,WH-300),rnd(22,32))];p.score=Math.floor(p.score*.3);}
        else if(p.id===g.me&&!p.dead){let killer=null;for(const o of plist)if(o!==p&&o.pieces.some(q=>dist(q,p._last||q)<1e9))killer=killer||o;setTimeout(()=>die((g.lastKiller||pick(D.NAMES))),0);}}});
    // quem me comeu (aprox.: maior peça mais próxima do meu último centro)
    if(me&&!me.dead&&me.pieces.length){me._last={x:me.pieces[0].x,y:me.pieces[0].y};let best=null,bd=1e9;
      plist.forEach(o=>{if(o===me)return;o.pieces.forEach(q=>{const d=dist(q,me._last);if(d<bd){bd=d;best=o;}});});if(best&&bd<400)g.lastKiller=best.name;}

    // efeitos
    g.fx.forEach(f=>f.age++);g.fx=g.fx.filter(f=>f.age<f.ttl);

    // câmera
    if(me&&!me.dead&&me.pieces.length&&g.screen!=="entry"){
      const ax=me.pieces.reduce((s,p)=>s+p.x,0)/me.pieces.length,ay=me.pieces.reduce((s,p)=>s+p.y,0)/me.pieces.length;
      let spread=0;me.pieces.forEach(p=>spread=Math.max(spread,Math.hypot(p.x-ax,p.y-ay)));
      const big=Math.max(...me.pieces.map(p=>p.r));
      const inset=TH.hudInset?TH.hudInset(g.mode):0;   // HUD que ocupa a base da tela: centraliza na área visível
      g.cam.x=lerp(g.cam.x,ax,.08);g.cam.y=lerp(g.cam.y,ay+inset/(2*g.cam.scale),.08);
      const base=g.mode==="portrait"?46:58;
      g.cam.scale=lerp(g.cam.scale,clamp(base/(big+spread*.3),.3,1.25)*RS,.06);
      g.session.maxMass=Math.max(g.session.maxMass,me.pieces.reduce((s,p)=>s+p.r*p.r,0));
    }else{const c=g.cam;g.drift+=.0016;c.x=clamp(c.x+Math.cos(g.drift)*.7,400,WW-400);c.y=clamp(c.y+Math.sin(g.drift)*.7,400,WH-400);
      c.scale=lerp(c.scale,.42*RS,.01);}

    // placar
    const N=+(g.prefs.lbSize||8);
    const full=Object.values(g.players).filter(p=>!p.dead).map(p=>({name:p.name,isBot:p.showBot,registered:p.registered,me:p.id===g.me,
      mass:Math.round(p.pieces.reduce((s,q)=>s+q.r*q.r,0))})).sort((a,b)=>b.mass-a.mass);
    full.forEach((r,i)=>r.rank=i+1);
    const mine=full.find(r=>r.me);
    g.myMass=mine?mine.mass:0;g.myRank=mine?mine.rank:0;
    g.lb=full.slice(0,N);if(mine&&mine.rank>N)g.lb.push(mine);
    g.lbMax=full[0]?full[0].mass:1;
    if(g.splitCD>0)g.splitCD--;if(g.ejectCD>0)g.ejectCD--;
  }

  // ── render ──────────────────────────────────────────────────────────────────
  function draw(){
    const W=g.W,H=g.H,c=octx,cam=g.cam,t=g.time,pr=g.prefs;
    const hw=W/(2*cam.scale),hh=H/(2*cam.scale);
    const x0=cam.x-hw,x1=cam.x+hw,y0=cam.y-hh,y1=cam.y+hh;
    const cull=CULL();
    const vis=(x,y,r)=>!cull||(x+r>x0&&x-r<x1&&y+r>y0&&y-r<y1);
    let drawn=0;
    c.setTransform(1,0,0,1,0,0);
    TH.drawBg(c,W,H,cam,t,g);
    c.save();c.translate(W/2,H/2);c.scale(cam.scale,cam.scale);c.translate(-cam.x,-cam.y);
    TH.drawWorld(c,cam,t,g,W,H);
    g.holes.forEach(h=>{if(h.k>0&&vis(h.x,h.y,h.ri*h.k)){TH.drawBlackHole(c,h,t,g);drawn++;}});
    g.food.forEach(f=>{if(vis(f.x,f.y,f.r*4)){TH.drawFood(c,f,t);drawn++;}});
    g.ejected.forEach(e=>{if(vis(e.x,e.y,e.r*2)){TH.drawEjected(c,e,t);drawn++;}});
    g.asteroids.forEach(a=>{if(vis(a.x,a.y,a.r*1.6)){TH.drawAsteroid(c,a,t,g);drawn++;}});
    g.missiles.forEach(m=>{if(vis(m.x,m.y,m.r*6)){TH.drawMissile(c,m,t);drawn++;}});
    const all=[];Object.values(g.players).filter(p=>!p.dead).forEach(p=>p.pieces.forEach(pc=>{
      if(vis(pc.x,pc.y,pc.r*2.4))all.push([pc,p]);}));
    all.sort((a,b)=>a[0].r-b[0].r);
    if(pr.trails&&TH.drawTrail)all.forEach(([pc,p])=>{if(pc.trail.length>1)TH.drawTrail(c,pc,p,p.id===g.me,t,g);});
    all.forEach(([pc,p])=>{TH.drawCell(c,pc,p,p.id===g.me,t,false,g);drawn++;});
    if(pr.fx&&TH.drawFx)g.fx.forEach(f=>{if(vis(f.x,f.y,f.r*3)){TH.drawFx(c,f,t,g);drawn++;}});
    c.restore();
    if(g.screen==="game")TH.drawHud(c,W,H,g,t,g.mode);
    if(TH.drawPost)TH.drawPost(c,W,H,t,g);
    g.drawn=drawn;
  }
  function sizeCanvas(){const W=cv.offsetWidth,H=cv.offsetHeight;
    if(RS===1){if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}g.W=W;g.H=H;}
    else{const w2=Math.round(W*RS),h2=Math.round(H*RS);
      if(off.width!==w2||off.height!==h2){off.width=w2;off.height=h2;}
      if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}g.W=w2;g.H=h2;}}
  function refreshHud(){const me=g.players[g.me];
    $("#v-mass").textContent=fmt(g.myMass||0);$("#v-score").textContent=fmt(me?me.score:0);
    $("#v-name").textContent=g.myName;$("#v-coins").textContent=fmt(g.coins);
    $("#v-ping").textContent=g.ping;$("#v-fps").textContent=g.fps;
    const am=me?me._missiles:0;$("#v-ammo").textContent=am;$("#t-ammo").textContent=am;$("#hud-ammo").classList.toggle("empty",!am);$("#t-fire").classList.toggle("empty",!am);
    $("#hud-pw").innerHTML=me?Object.keys(me._powerups).map(k=>`<span class="pw pw-${k}"><i>${{speed:"⚡",magnet:"🧲",shield:"🛡️"}[k]}</i>${LB.powerups[k]} <b>${Math.ceil(me._powerups[k]/60)}s</b></span>`).join(""):"";
    const cs=$("#cd-split"),ce=$("#cd-eject");cs.style.setProperty("--p",(1-g.splitCD/24).toFixed(2));cs.classList.toggle("ready",g.splitCD<=0);
    ce.style.setProperty("--p",(1-g.ejectCD/7).toFixed(2));ce.classList.toggle("ready",g.ejectCD<=0);
    $("#t-split").classList.toggle("cd",g.splitCD>0);$("#t-eject").classList.toggle("cd",g.ejectCD>0);
    $("#lb-rows").innerHTML=g.lb.map(r=>`<div class="lb-row ${r.me?"mine":""} ${r.rank<=3?"top":""}" style="--p:${(r.mass/g.lbMax).toFixed(3)}">
      <span class="lb-pos">${r.rank}</span><span class="lb-name">${r.name}${r.isBot?` <i class="bot">${LB.botTag}</i>`:""}${r.registered?` <i class="reg">${LB.regTag}</i>`:""}</span><b class="lb-val">${fmt(r.mass)}</b></div>`).join("");}

  // ── loop ────────────────────────────────────────────────────────────────────
  let last=performance.now(),acc=0,frames=0,uiT=0,tAcc=0,dAcc=0,sN=0,pingT=0;
  function frame(now){
    if(g.stopped)return;
    const dt=now-last;last=now;
    if(dt<250){acc+=dt;frames++;}
    const W=cv.offsetWidth,H=cv.offsetHeight;sizeCanvas();
    const _t0=performance.now();if(!g.paused)tick();const _t1=performance.now();draw();
    if(RS!==1){ctx.setTransform(1,0,0,1,0,0);ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,W,H);ctx.drawImage(off,0,0,W,H);}
    tAcc+=_t1-_t0;dAcc+=performance.now()-_t1;sN++;
    if(sN>=40){
      const st={theme:TH.id,fps:acc>0?Math.round(frames*1000/acc):0,
        tick:+(tAcc/sN).toFixed(2),draw:+(dAcc/sN).toFixed(2),frame:+((tAcc+dAcc)/sN).toFixed(2),drawn:g.drawn,cull:CULL()};
      g.fps=st.fps;window.__stats=st;
      const sb=document.getElementById("statbox");
      if(sb&&!g.benchDone)sb.textContent=st.theme+"  ·  "+st.frame+" ms/quadro (tick "+st.tick+" + desenho "+st.draw+")  ·  "+st.drawn+" objetos  ·  culling "+(st.cull?"ligado":"desligado")+"  ·  "+st.fps+" fps";
      tAcc=0;dAcc=0;sN=0;acc=0;frames=0;}
    if((pingT+=dt)>1400){pingT=0;g.ping=20+Math.floor(R()*12);}
    if(g.screen==="game"&&(uiT+=dt)>120){uiT=0;refreshHud();}
    if(g.reconn&&g.tick%90===0){g.reconnN=1+(g.reconnN%5);$("#rc-sub").textContent=LB.reconnSub.replace("{n}",g.reconnN);}
    requestAnimationFrame(frame);
  }
  addEventListener("resize",fit);
  refreshMeta();applyPrefs();if(Q.get("frame")==="0")document.body.dataset.frame="0";setMode(Q.get("mode")||"desktop");
  const startScreen=Q.get("screen")||Q.get("shot");
  if(startScreen)gotoScreen(startScreen);else show("entry");
  for(let i=0;i<120;i++)tick();                                      // aquece o mundo (bots espalhados, rastros)

  // ── ?shot=<tela>: cena estável para screenshot ──────────────────────────────
  if(Q.has("shot")){bar.style.display="none";sizeCanvas();g.mouse.x=cv.offsetWidth/2;g.mouse.y=cv.offsetHeight/2;
    {const me=g.players.me;if(me&&!me.dead){me._powerups.shield=400;me.pieces[0].r=52;}}
    for(let i=0;i<300;i++)tick();
    if(Q.get("shot")==="game"||Q.get("shot")==="dead"||Q.get("shot")==="reconn"){const me=g.players.me;if(me&&!me.dead){me.pieces[0].r=52;me._missiles=2;me._powerups.speed=300;
      const h=g.holes[0];h.x=me.pieces[0].x+260;h.y=me.pieces[0].y-140;h.phase="active";h.k=1;h.t=10;
      const a=g.asteroids[6];a.x=me.pieces[0].x-220;a.y=me.pieces[0].y+120;a.belt=null;
      g.cam.x=me.pieces[0].x;g.cam.y=me.pieces[0].y;g.cam.scale=.9;for(let i=0;i<40;i++){tick();}g.paused=true;refreshHud();}}
    setTimeout(()=>{g.paused=true;g.stopped=true;draw();window.__ready=true;document.title="READY";
      if(Q.has("rects"))document.title="RECTS "+JSON.stringify(Array.from(document.querySelectorAll(Q.get("rects")||"#touch,#touch .tbtn,#hud-status,#hud-score,#app")).map(e=>{const r=e.getBoundingClientRect();return[(e.id||e.className),Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)];}));},1500);}

  // ── ?selftest: percorre telas × modos e reporta no título ───────────────────
  if(Q.has("selftest")){const errs=[];const orig=console.error;
    window.addEventListener("error",e=>errs.push(String(e.message)));
    try{["desktop","portrait","landscape"].forEach(m=>{setMode(m);sizeCanvas();
      SCREENS.forEach(([s])=>{gotoScreen(s);for(let i=0;i<20;i++){tick();}draw();});
      gotoScreen("game");doSplit();doEject();fire(g.players.me);for(let i=0;i<60;i++){tick();}draw();setReconn(false);setAccount(false);});
      renderShop();shopF="legendary";renderShop();shopF="all";rkP="week";rkM="kills";renderRank();renderProfile();renderPrefs();
      const miss=["id","name","tokens","css","drawBg","drawWorld","drawFood","drawEjected","drawMissile","drawCell","drawAsteroid","drawBlackHole","drawHud"].filter(k=>!(k in TH));
      if(miss.length)errs.push("tema sem: "+miss.join(","));
      const tkm=["bg","surface","text","muted","accent","accent2","danger","ok","line","radius","radiusLg","space","fontUi","fontMono","shadow"].filter(k=>!(k in (TH.tokens||{})));
      if(tkm.length)errs.push("tokens sem: "+tkm.join(","));}
    catch(e){errs.push(String(e&&e.stack||e));}
    setMode("desktop");
    setTimeout(()=>{document.title=errs.length?"SELFTEST FAIL: "+errs.join(" | "):"SELFTEST OK";},300);}

  // ── ?bench: pior caso ───────────────────────────────────────────────────────
  if(Q.has("bench")){
    const sb=document.createElement("div");sb.id="statbox";
    sb.style.cssText="position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:99;font:12px monospace;"+
      "color:#7CFC00;background:rgba(0,0,0,.75);padding:5px 12px;border-radius:6px;pointer-events:none;max-width:96vw;white-space:pre-wrap";
    document.body.appendChild(sb);
    const heavy=()=>{
      while(g.food.length<400)g.food.push(mkFood());
      const me=g.players.me;if(!me)return;
      const cx=me.pieces[0].x,cy=me.pieces[0].y;
      me.pieces=[];for(let i=0;i<8;i++){const a=i/8*6.283;const q=mkPiece(cx+Math.cos(a)*190,cy+Math.sin(a)*190,62);q.vx=Math.cos(a)*2;q.vy=Math.sin(a)*2;
        for(let k=0;k<12;k++)q.trail.push({x:q.x-Math.cos(a)*k*4,y:q.y-Math.sin(a)*k*4});me.pieces.push(q);}
      me.pieces.forEach(pc=>pc.mergeTimer=9999);me._powerups={speed:500,magnet:500,shield:500};
      Object.values(g.players).forEach(b=>{if(!b.isBot)return;
        const r=Math.max(26,b.pieces[0].r/2),bx=cx+rnd(-500,500),by=cy+rnd(-400,400);
        b.pieces=[];for(let i=0;i<4;i++){const a=i/4*6.283;const q=mkPiece(bx+Math.cos(a)*r*2,by+Math.sin(a)*r*2,r);q.vx=Math.cos(a)*1.5;q.vy=Math.sin(a)*1.5;
          for(let k=0;k<12;k++)q.trail.push({x:q.x-k*3,y:q.y});b.pieces.push(q);}
        b.pieces.forEach(pc=>pc.mergeTimer=9999);});
      g.asteroids.forEach((a,i)=>{a.x=cx+Math.cos(i)*(250+i*20);a.y=cy+Math.sin(i*1.7)*300;});
      g.holes.forEach((h,i)=>{h.x=cx+(i-1)*420;h.y=cy+240;h.phase="active";h.k=1;h.t=5;});
      for(let i=0;i<8;i++)g.fx.push({t:["bounce","pop","eat","suck","merge","chip","boom","split"][i],x:cx+rnd(-300,300),y:cy+rnd(-200,200),r:40,age:2,ttl:9999,nx:1,ny:0,power:1,color:"#fff"});
      if(g.missiles.length<6)Object.values(g.players).slice(0,6).forEach(p=>{p._missiles=3;fire(p);});};
    const measure=(fn,n)=>{const t0=performance.now();for(let i=0;i<n;i++)fn();try{octx.getImageData(0,0,1,1);}catch(e){}return(performance.now()-t0)/n;};
    const runBench=()=>{sizeCanvas();g.paused=true;g.cam.scale=.5;const out=[];
      document.body.setAttribute("data-cull","0");for(let i=0;i<40;i++){draw();}   // aquece: assa todos os sprites visíveis antes de medir
      [false,true].forEach(cullOn=>{document.body.setAttribute("data-cull",cullOn?"1":"0");
        for(let i=0;i<12;i++){draw();}
        const dms=measure(draw,60),tms=measure(tick,40);
        const bg=measure(()=>TH.drawBg(octx,g.W,g.H,g.cam,g.time,g),30);
        const world=(fn)=>()=>{octx.save();octx.translate(g.W/2,g.H/2);octx.scale(g.cam.scale,g.cam.scale);octx.translate(-g.cam.x,-g.cam.y);fn();octx.restore();};
        const wl=measure(world(()=>TH.drawWorld(octx,g.cam,g.time,g,g.W,g.H)),30);
        const ast=measure(world(()=>g.asteroids.forEach(a=>TH.drawAsteroid(octx,a,g.time,g))),30);
        const bh=measure(world(()=>g.holes.forEach(h=>TH.drawBlackHole(octx,h,g.time,g))),30);
        const tr=TH.drawTrail?measure(world(()=>Object.values(g.players).forEach(p=>p.pieces.forEach(pc=>TH.drawTrail(octx,pc,p,p.id===g.me,g.time,g)))),30):0;
        const fx=TH.drawFx?measure(world(()=>g.fx.forEach(f=>TH.drawFx(octx,f,g.time,g))),30):0;
        const post=TH.drawPost?measure(()=>TH.drawPost(octx,g.W,g.H,g.time,g),30):0;
        out.push((cullOn?"culling ON":"culling OFF")+": desenho "+dms.toFixed(2)+"ms + lógica "+tms.toFixed(2)+"ms = "+(dms+tms).toFixed(2)+"ms/quadro ("+g.drawn+" objs; fundo "+bg.toFixed(2)+", mundo "+wl.toFixed(2)+", asteroides "+ast.toFixed(2)+", buracos "+bh.toFixed(2)+", rastros "+tr.toFixed(2)+", fx "+fx.toFixed(2)+", pós "+post.toFixed(2)+")");});
      document.body.setAttribute("data-cull","1");
      const txt=TH.id+" | "+g.W+"x"+g.H+" | "+out.reverse().join(" | ");sb.textContent=txt;document.title="BENCH "+txt;g.benchDone=true;g.paused=false;
      try{fetch("/__bench?"+encodeURIComponent(txt)).catch(()=>{});}catch(e){}   // servido por http: o log do servidor guarda o resultado
    };
    const leve=Q.has("leve");
    setTimeout(()=>{startGame();if(!leve)heavy();setTimeout(runBench,900);},150);
  }

  requestAnimationFrame(frame);
}

window.MOCK={boot,u:U};
})();

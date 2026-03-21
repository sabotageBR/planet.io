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

// ── SERVER ─────────────────────────────────────────────────────────────────────
class GameServer{
  constructor(){this.players={};this.food=[];this.viruses=[];this.ejected=[];this.listeners={};this.running=false;this._spawnFood();this._spawnViruses();}
  on(ev,cb){(this.listeners[ev]||(this.listeners[ev]=[])).push(cb);}
  off(ev,cb){if(this.listeners[ev])this.listeners[ev]=this.listeners[ev].filter(f=>f!==cb);}
  _emit(ev,d){(this.listeners[ev]||[]).forEach(cb=>cb(d));}
  clientSend(ev,d){this._handleClient(ev,d);}
  _spawnFood(){
    const types=["asteroid","comet","star","moon"];
    const puTypes=["powerup_speed","powerup_magnet","powerup_shield"];
    const puColors={"powerup_speed":"#ffdd00","powerup_magnet":"#ff66ff","powerup_shield":"#44aaff"};
    let puCount=this.food.filter(f=>f.type&&f.type.startsWith("powerup_")).length;
    while(this.food.length<FOOD_COUNT){
      const wantPU=puCount<15&&Math.random()<0.04;
      if(wantPU){const t=puTypes[Math.floor(Math.random()*3)];this.food.push({id:uid(),x:Math.random()*WORLD_W,y:Math.random()*WORLD_H,r:12+Math.random()*5,type:t,color:puColors[t]});puCount++;}
      else{const t=types[Math.floor(Math.random()*4)];this.food.push({id:uid(),x:Math.random()*WORLD_W,y:Math.random()*WORLD_H,r:6+Math.random()*9,type:t,color:`hsl(${Math.random()*360},80%,70%)`});}
    }
  }
  _spawnViruses(){
    while(this.viruses.length<VIRUS_COUNT)
      this.viruses.push({id:uid(),x:200+Math.random()*(WORLD_W-400),y:200+Math.random()*(WORLD_H-400),r:40,pulseT:Math.random()*Math.PI*2,vx:0,vy:0,hits:0});
  }
  _explodeVirus(cx,cy,r){
    for(let k=0;k<10;k++){
      const ang=(k/10)*Math.PI*2,spd=8+Math.random()*10;
      this.food.push({id:uid(),x:cx+Math.cos(ang)*(r+4),y:cy+Math.sin(ang)*(r+4),r:9+Math.random()*7,type:"star",color:`hsl(${100+Math.random()*80},90%,65%)`,_vx:Math.cos(ang)*spd,_vy:Math.sin(ang)*spd,_life:240});
    }
  }
  _mkPiece(x,y,r,vx=0,vy=0,mt=null){return{id:uid(),x,y,r,vx,vy,ax:0,ay:0,mergeTimer:mt!==null?mt:calcMergeTime(r),displayR:r,growAnim:0,splitting:false,splitT:0};}
  _handleClient(ev,d){
    if(ev==="join"){
      const skin=SKINS.find(s=>s.id===(d.skinId||0))||SKINS[0];
      const sx=400+Math.random()*(WORLD_W-800),sy=400+Math.random()*(WORLD_H-800);
      if(this.players[d.id]){
        const p=this.players[d.id];p.name=d.name;p.score=0;p.dead=false;p.skinId=d.skinId||0;p.color=skin.color;
        p.pieces=[this._mkPiece(sx,sy,32,0,0,0)];this._emit("gameState",{players:this.players,food:this.food,viruses:this.viruses});return;
      }
      this.players[d.id]={id:d.id,name:d.name,color:skin.color,skinId:d.skinId||0,isBot:false,score:0,dead:false,pieces:[this._mkPiece(sx,sy,32,0,0,0)],_tx:sx,_ty:sy};
      this._emit("gameState",{players:this.players,food:this.food,viruses:this.viruses});
    }
    if(ev==="move"){const p=this.players[d.id];if(p&&!p.dead){p._tx=d.tx;p._ty=d.ty;}}
    if(ev==="split"){const p=this.players[d.id];if(p&&!p.dead)this._splitPlayer(p,d.tx,d.ty);}
    if(ev==="eject"){const p=this.players[d.id];if(p&&!p.dead)this._ejectMass(p,d.tx,d.ty);}
  }
  _splitPlayer(p,tx,ty){
    if(p.pieces.length>=MAX_PIECES)return;const news=[];
    [...p.pieces].forEach(pc=>{
      if(p.pieces.length+news.length>=MAX_PIECES||pc.r<22)return;
      let dx=tx-pc.x,dy=ty-pc.y;const rawLen=Math.hypot(dx,dy);
      if(rawLen<1){const vl=Math.hypot(pc.vx,pc.vy);if(vl>0.05){dx=pc.vx/vl;dy=pc.vy/vl;}else{dx=0;dy=-1;}}else{dx/=rawLen;dy/=rawLen;}
      const nr=pc.r/Math.SQRT2;pc.r=nr;pc.mergeTimer=calcMergeTime(nr);pc.vx=dx*-1.5;pc.vy=dy*-1.5;
      const np=this._mkPiece(pc.x+dx*(pc.r+nr+4),pc.y+dy*(pc.r+nr+4),nr,dx*SPLIT_SPEED,dy*SPLIT_SPEED,calcMergeTime(nr));
      np.splitting=true;np.splitT=0;news.push(np);
    });
    p.pieces.push(...news);
  }
  _ejectMass(p,tx,ty){
    p.pieces.forEach(pc=>{
      if(pc.r<28)return;
      const dx=tx-pc.x,dy=ty-pc.y,len=Math.hypot(dx,dy)||1,nx=dx/len,ny=dy/len;
      pc.r=Math.sqrt(Math.max(pc.r*pc.r-EJECT_R*EJECT_R*3,20*20));
      this.ejected.push({id:uid(),x:pc.x+nx*(pc.r+EJECT_R+2),y:pc.y+ny*(pc.r+EJECT_R+2),r:EJECT_R,vx:nx*EJECT_SPEED,vy:ny*EJECT_SPEED,color:p.color,ownerId:p.id,life:4});
      pc.vx-=nx*1.8;pc.vy-=ny*1.8;
    });
  }
  start(){if(this.running)return;this.running=true;this._spawnBots(20);this._interval=setInterval(()=>this._tick(),16);}
  stop(){clearInterval(this._interval);this.running=false;}
  _spawnBots(n){
    for(let i=0;i<n;i++){
      const id="bot_"+i,skinId=Math.floor(Math.random()*10);
      const sk=SKINS[skinId]||SKINS[0];
      const sx=400+Math.random()*(WORLD_W-800),sy=400+Math.random()*(WORLD_H-800);
      this.players[id]={id,name:BOT_NAMES[i%BOT_NAMES.length],color:sk.color,skinId,isBot:true,score:0,dead:false,
        pieces:[this._mkPiece(sx,sy,24+Math.random()*16,0,0,0)],_tx:Math.random()*WORLD_W,_ty:Math.random()*WORLD_H,
        _state:"wander",_huntId:null,_stateTimer:0,_fleeFrom:null};
    }
  }
  _cx(p){return p.pieces.length?p.pieces.reduce((s,pc)=>s+pc.x,0)/p.pieces.length:0;}
  _cy(p){return p.pieces.length?p.pieces.reduce((s,pc)=>s+pc.y,0)/p.pieces.length:0;}
  _bigR(p){return p.pieces.length?Math.max(...p.pieces.map(pc=>pc.r)):0;}
  _tick(){
    const plist=Object.values(this.players).filter(p=>!p.dead);const DT=0.016;
    // move viruses
    this.viruses.forEach(v=>{
      v.pulseT+=0.06;v.vx=(v.vx||0)*0.92;v.vy=(v.vy||0)*0.92;
      v.x=clamp(v.x+v.vx,v.r,WORLD_W-v.r);v.y=clamp(v.y+v.vy,v.r,WORLD_H-v.r);
      if(v.x<=v.r||v.x>=WORLD_W-v.r)v.vx*=-0.5;if(v.y<=v.r||v.y>=WORLD_H-v.r)v.vy*=-0.5;
    });
    // virus-virus collision
    const deadV=new Set();
    for(let i=0;i<this.viruses.length;i++){
      if(deadV.has(i))continue;
      for(let j=i+1;j<this.viruses.length;j++){
        if(deadV.has(j))continue;
        const va=this.viruses[i],vb=this.viruses[j];
        if(Math.hypot(va.x-vb.x,va.y-vb.y)<va.r+vb.r){
          deadV.add(i);deadV.add(j);
          this._explodeVirus((va.x+vb.x)/2,(va.y+vb.y)/2,va.r);
        }
      }
    }
    if(deadV.size>0)this.viruses=this.viruses.filter((_,i)=>!deadV.has(i));
    // animate fragment food
    this.food.forEach(f=>{if(f._vx!=null){f._vx*=0.87;f._vy*=0.87;f.x=clamp(f.x+f._vx,f.r,WORLD_W-f.r);f.y=clamp(f.y+f._vy,f.r,WORLD_H-f.r);f._life--;}});
    this.food=this.food.filter(f=>f._life==null||f._life>0);
    this.ejected.forEach(e=>{e.vx*=0.92;e.vy*=0.92;e.x=clamp(e.x+e.vx,e.r,WORLD_W-e.r);e.y=clamp(e.y+e.vy,e.r,WORLD_H-e.r);if(e.life>0)e.life--;});
    // bot AI
    plist.filter(p=>p.isBot).forEach(bot=>{
      const bx=this._cx(bot),by=this._cy(bot),botBig=this._bigR(bot);bot._stateTimer--;
      if(bot._stateTimer<=0){
        bot._stateTimer=25+Math.floor(Math.random()*45);
        let flee=null,fleeD=Infinity;
        plist.forEach(th=>{if(th.id===bot.id)return;const thBig=this._bigR(th);if(thBig>botBig*1.1){const d=dist({x:bx,y:by},{x:this._cx(th),y:this._cy(th)});if(d<400&&d<fleeD){fleeD=d;flee=th;}}});
        let bestHunt=null,bestVal=-Infinity;
        plist.forEach(t=>{if(t.id===bot.id)return;const tr=this._bigR(t);if(botBig<=tr*1.15)return;const d=dist({x:bx,y:by},{x:this._cx(t),y:this._cy(t)});const val=tr*(!t.isBot?2.2:1.4)-d*0.001;if(val>bestVal){bestVal=val;bestHunt=t;}});
        if(flee){bot._state="flee";bot._fleeFrom=flee;}else if(bestHunt){bot._state="hunt";bot._huntId=bestHunt.id;}else bot._state="wander";
      }
      if(bot._state==="flee"&&bot._fleeFrom){const th=bot._fleeFrom;if(!th||th.dead){bot._state="wander";return;}const dx=bx-this._cx(th),dy=by-this._cy(th);bot._tx=clamp(bx+dx*4,100,WORLD_W-100);bot._ty=clamp(by+dy*4,100,WORLD_H-100);}
      else if(bot._state==="hunt"&&bot._huntId){const t=this.players[bot._huntId];if(!t||t.dead){bot._state="wander";return;}bot._tx=this._cx(t);bot._ty=this._cy(t);const d=dist({x:bx,y:by},{x:this._cx(t),y:this._cy(t)});if(d<botBig*2.8&&botBig>this._bigR(t)*1.3&&bot.pieces.length<MAX_PIECES&&Math.random()<0.03)this._splitPlayer(bot,bot._tx,bot._ty);}
      else{const d=dist({x:bx,y:by},{x:bot._tx,y:bot._ty});if(d<100){bot._tx=200+Math.random()*(WORLD_W-400);bot._ty=200+Math.random()*(WORLD_H-400);}}
    });
    // physics
    plist.forEach(p=>{
      p.pieces.forEach(pc=>{
        const dx=p._tx-pc.x,dy=p._ty-pc.y,len=Math.hypot(dx,dy)||1;const baseSpd=clamp(220/pc.r,0.8,6);const maxSpd=p._powerups&&p._powerups.speed>0?baseSpd*1.85:baseSpd;
        pc.ax=(dx/len)*maxSpd*6;pc.ay=(dy/len)*maxSpd*6;pc.vx=(pc.vx+pc.ax*DT)*FRICTION;pc.vy=(pc.vy+pc.ay*DT)*FRICTION;
        const spd=Math.hypot(pc.vx,pc.vy);if(spd>maxSpd){pc.vx=(pc.vx/spd)*maxSpd;pc.vy=(pc.vy/spd)*maxSpd;}
        pc.x=clamp(pc.x+pc.vx,pc.r,WORLD_W-pc.r);pc.y=clamp(pc.y+pc.vy,pc.r,WORLD_H-pc.r);
        if(pc.x<=pc.r||pc.x>=WORLD_W-pc.r)pc.vx*=-0.4;if(pc.y<=pc.r||pc.y>=WORLD_H-pc.r)pc.vy*=-0.4;
        if(pc.mergeTimer>0)pc.mergeTimer--;
        if(pc.splitting){pc.splitT=Math.min((pc.splitT||0)+0.065,1);if(pc.splitT>=1)pc.splitting=false;}
        pc.displayR=lerp(pc.displayR||pc.r,pc.r,0.18);
      });
      for(let i=0;i<p.pieces.length;i++){for(let j=i+1;j<p.pieces.length;j++){const a=p.pieces[i],b=p.pieces[j];if(a.mergeTimer<=0&&b.mergeTimer<=0)continue;const d=dist(a,b),minD=(a.r+b.r)*0.92;if(d<minD&&d>0.01){const nx=(b.x-a.x)/d,ny=(b.y-a.y)/d,push=(minD-d)*0.2;a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;const dv=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(dv>0){a.vx-=dv*nx*.3;a.vy-=dv*ny*.3;b.vx+=dv*nx*.3;b.vy+=dv*ny*.3;}}}}
      let merged=true;while(merged){merged=false;for(let i=0;i<p.pieces.length;i++){for(let j=i+1;j<p.pieces.length;j++){const a=p.pieces[i],b=p.pieces[j];if(a.mergeTimer>0||b.mergeTimer>0)continue;if(dist(a,b)<Math.max(a.r,b.r)*0.75){const tm=a.r*a.r+b.r*b.r;a.vx=(a.vx*a.r*a.r+b.vx*b.r*b.r)/tm;a.vy=(a.vy*a.r*a.r+b.vy*b.r*b.r)/tm;a.r=Math.sqrt(tm);a.growAnim=Math.min(1.4,a.growAnim+0.6);p.pieces.splice(j,1);merged=true;break;}}if(merged)break;}}
    });
    // magnet power-up: pull nearby food toward piece
    plist.forEach(p=>{if(!p._powerups||!p._powerups.magnet)return;p.pieces.forEach(pc=>{this.food.forEach(f=>{if(f._life!=null||f.type.startsWith("powerup_"))return;const d=dist(pc,f);if(d<pc.r*7&&d>1){const nx=(pc.x-f.x)/d,ny=(pc.y-f.y)/d;f.x=clamp(f.x+nx*3.5,f.r,WORLD_W-f.r);f.y=clamp(f.y+ny*3.5,f.r,WORLD_H-f.r);}});});});
    // eat food
    plist.forEach(p=>{p.pieces.forEach(pc=>{this.food=this.food.filter(f=>{if(f._life!=null)return true;if(dist(pc,f)<pc.r+f.r*0.5){if(f.type&&f.type.startsWith("powerup_")){if(!p._powerups)p._powerups={};const pt=f.type.replace("powerup_","");if(p._powerups[pt]){p._powerups[pt]+=400;}else if(Object.keys(p._powerups).length<3){p._powerups[pt]=400;}}else{pc.r=Math.min(Math.sqrt(pc.r*pc.r+f.r*f.r*0.15),260);p.score+=Math.floor(f.r);}return false;}return true;});});});
    this._spawnFood();
    // eat ejected
    plist.forEach(p=>{p.pieces.forEach(pc=>{this.ejected=this.ejected.filter(e=>{if(e.ownerId===p.id&&e.life>0)return true;if(dist(pc,e)<pc.r+e.r*0.6){pc.r=Math.min(Math.sqrt(pc.r*pc.r+e.r*e.r*2),260);p.score+=2;return false;}return true;});});});
    this.ejected=this.ejected.filter(e=>e.life>-60);
    // ejected hits viruses
    const VIRUS_MAX_R=80,VIRUS_SPLIT_R=72,VIRUS_FEED_R=36;
    this.ejected=this.ejected.filter(e=>{
      for(let vi=0;vi<this.viruses.length;vi++){const v=this.viruses[vi];if(dist(e,v)<v.r+e.r*0.6){const dx=v.x-e.x,dy=v.y-e.y,len=Math.hypot(dx,dy)||1;v.vx+=(dx/len)*6;v.vy+=(dy/len)*6;v.r=Math.min(v.r+EJECT_R*0.7,VIRUS_MAX_R);v.hits=(v.hits||0)+1;if(v.r>=VIRUS_SPLIT_R&&this.viruses.length<VIRUS_COUNT+6){const ang=Math.random()*Math.PI*2;v.r=VIRUS_FEED_R;this.viruses.push({id:uid(),x:v.x+Math.cos(ang)*VIRUS_FEED_R*2,y:v.y+Math.sin(ang)*VIRUS_FEED_R*2,r:VIRUS_FEED_R,pulseT:Math.random()*Math.PI*2,vx:Math.cos(ang)*8,vy:Math.sin(ang)*8,hits:0});}return false;}}return true;
    });
    // virus splits player then disappears and respawns elsewhere
    const hitV=new Set();
    plist.forEach(p=>{p.pieces.forEach(pc=>{this.viruses.forEach((v,vi)=>{if(!hitV.has(vi)&&pc.r>v.r*1.1&&dist(pc,v)<pc.r*0.82){hitV.add(vi);const splits=clamp(Math.floor(pc.r/22),2,MAX_PIECES-p.pieces.length+1);if(splits<2)return;const nr=pc.r/Math.sqrt(splits);pc.r=nr;pc.mergeTimer=calcMergeTime(nr);for(let k=1;k<splits&&p.pieces.length<MAX_PIECES;k++){const ang=Math.random()*Math.PI*2;p.pieces.push(this._mkPiece(pc.x,pc.y,nr,Math.cos(ang)*SPLIT_SPEED*.8,Math.sin(ang)*SPLIT_SPEED*.8,calcMergeTime(nr)));}}});});});
    if(hitV.size>0){this.viruses=this.viruses.filter((_,i)=>!hitV.has(i));this._spawnViruses();}
    // eat players
    for(let i=0;i<plist.length;i++){for(let j=0;j<plist.length;j++){if(i===j)continue;const a=plist[i],b=plist[j];if(b._powerups&&b._powerups.shield>0)continue;a.pieces.forEach(ap=>{b.pieces=b.pieces.filter(bp=>{if(ap.r<bp.r*1.08)return true;if(dist(ap,bp)<ap.r*0.72){ap.r=Math.min(Math.sqrt(ap.r*ap.r+bp.r*bp.r*0.55),290);a.score+=Math.floor(bp.r*8);if(!b.isBot&&b.pieces.length===1){b.dead=true;this._emit("eaten",{by:a.name,score:b.score,isBot:a.isBot,dx:bp.x,dy:bp.y,killerId:a.id});}return false;}return true;});});if(b.isBot&&b.pieces.length===0){b.score=Math.floor(b.score*0.3);const sx=400+Math.random()*(WORLD_W-800),sy=400+Math.random()*(WORLD_H-800);b.pieces=[this._mkPiece(sx,sy,22+Math.random()*10,0,0,0)];}}}
    // decrement power-up timers
    plist.forEach(p=>{if(p._powerups){for(const t in p._powerups){p._powerups[t]--;if(p._powerups[t]<=0)delete p._powerups[t];}}});
    const lb=Object.values(this.players).filter(p=>!p.dead).map(p=>{const mass=Math.round(p.pieces.reduce((s,pc)=>s+pc.r*pc.r,0));return{name:p.name,mass,score:p.score,isBot:p.isBot};}).sort((a,b)=>b.mass-a.mass).slice(0,10);
    this._spawnViruses();
    this._emit("tick",{players:this.players,food:this.food,viruses:this.viruses,ejected:this.ejected,leaderboard:lb});
  }
}

let _serverInstance=null;
function getServer(){if(!_serverInstance){_serverInstance=new GameServer();_serverInstance.start();}return _serverInstance;}

const STARS=Array.from({length:600},()=>({x:Math.random()*WORLD_W,y:Math.random()*WORLD_H,r:.4+Math.random()*1.6,b:.2+Math.random()*.8,tw:Math.random()*Math.PI*2,sp:.01+Math.random()*.03}));

function drawStars(ctx,time){STARS.forEach(s=>{ctx.globalAlpha=s.b*(.7+.3*Math.sin(time*s.sp+s.tw));ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;}

function drawFood(ctx,f,time){
  ctx.save();ctx.translate(f.x,f.y);
  if(f.type==="asteroid"){ctx.fillStyle=f.color;ctx.beginPath();ctx.ellipse(0,0,f.r,f.r*.7,Math.PI/4,0,Math.PI*2);ctx.fill();ctx.fillStyle="rgba(0,0,0,.3)";ctx.beginPath();ctx.arc(-f.r*.2,-f.r*.2,f.r*.25,0,Math.PI*2);ctx.fill();}
  else if(f.type==="comet"){const g=ctx.createLinearGradient(-f.r*2.5,0,f.r,0);g.addColorStop(0,"rgba(255,255,255,0)");g.addColorStop(1,f.color);ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(-f.r,0,f.r*2.5,f.r*.35,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=8;ctx.shadowColor="#fff";ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(f.r*.4,0,f.r*.5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
  else if(f.type==="star"){const p=1+Math.sin(time*.003+f.x)*.15;ctx.fillStyle=f.color;ctx.shadowBlur=f.r*2;ctx.shadowColor=f.color;ctx.beginPath();for(let i=0;i<5;i++){const a=(i*Math.PI*2)/5-Math.PI/2,ia=(i+.5)*Math.PI*2/5-Math.PI/2;i===0?ctx.moveTo(Math.cos(a)*f.r*p,Math.sin(a)*f.r*p):ctx.lineTo(Math.cos(a)*f.r*p,Math.sin(a)*f.r*p);ctx.lineTo(Math.cos(ia)*f.r*.4*p,Math.sin(ia)*f.r*.4*p);}ctx.closePath();ctx.fill();ctx.shadowBlur=0;}
  else if(f.type==="powerup_speed"){const g=ctx.createRadialGradient(0,0,0,0,0,f.r);g.addColorStop(0,"#ffffff");g.addColorStop(0.5,"#ffdd00");g.addColorStop(1,"#ff8800");ctx.fillStyle=g;ctx.shadowBlur=18;ctx.shadowColor="#ffdd00";ctx.beginPath();ctx.arc(0,0,f.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.font=`bold ${Math.round(f.r*1.1)}px serif`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("⚡",0,1);}
  else if(f.type==="powerup_magnet"){const g=ctx.createRadialGradient(0,0,0,0,0,f.r);g.addColorStop(0,"#ffffff");g.addColorStop(0.5,"#ff66ff");g.addColorStop(1,"#aa00aa");ctx.fillStyle=g;ctx.shadowBlur=18;ctx.shadowColor="#ff66ff";ctx.beginPath();ctx.arc(0,0,f.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.font=`bold ${Math.round(f.r*1.1)}px serif`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("🧲",0,1);}
  else if(f.type==="powerup_shield"){const g=ctx.createRadialGradient(0,0,0,0,0,f.r);g.addColorStop(0,"#ffffff");g.addColorStop(0.5,"#44aaff");g.addColorStop(1,"#0044aa");ctx.fillStyle=g;ctx.shadowBlur=18;ctx.shadowColor="#44aaff";ctx.beginPath();ctx.arc(0,0,f.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.font=`bold ${Math.round(f.r*1.1)}px serif`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("🛡️",0,1);}
  else{ctx.fillStyle="#ccd";ctx.beginPath();ctx.arc(0,0,f.r,0,Math.PI*2);ctx.fill();ctx.fillStyle="rgba(0,0,0,.2)";[[-f.r*.3,-f.r*.2,f.r*.25],[f.r*.2,f.r*.2,f.r*.2],[f.r*.1,-f.r*.4,f.r*.15]].forEach(([cx,cy,cr])=>{ctx.beginPath();ctx.arc(cx,cy,cr,0,Math.PI*2);ctx.fill();});}
  ctx.restore();
}
function drawEjected(ctx,e){ctx.save();ctx.translate(e.x,e.y);ctx.shadowBlur=10;ctx.shadowColor=e.color;const g=ctx.createRadialGradient(0,0,0,0,0,e.r);g.addColorStop(0,"#fff");g.addColorStop(.4,e.color);g.addColorStop(1,e.color+"44");ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,e.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.restore();}
function drawVirus(ctx,v){ctx.save();ctx.translate(v.x,v.y);const p=1+Math.sin(v.pulseT)*.09;ctx.shadowBlur=20;ctx.shadowColor="#00ff88";const g=ctx.createRadialGradient(0,0,v.r*.15*p,0,0,v.r*p);g.addColorStop(0,"#80ffcc");g.addColorStop(.5,"#00cc55");g.addColorStop(1,"#003311");ctx.fillStyle=g;ctx.beginPath();for(let i=0;i<28;i++){const ang=(i/28)*Math.PI*2,r2=i%2===0?v.r*p:v.r*p*.68;i===0?ctx.moveTo(Math.cos(ang)*r2,Math.sin(ang)*r2):ctx.lineTo(Math.cos(ang)*r2,Math.sin(ang)*r2);}ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle="#00ff88aa";ctx.font=`bold ${Math.max(8,v.r*.28)}px Arial`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("VÍRUS",0,0);ctx.restore();}

function drawPlanet(ctx,pc,p,isMe,time,overrideSkinId){
  const dr=pc.displayR||pc.r;
  const skinId=overrideSkinId!=null?overrideSkinId:(p.skinId??0);
  const skin=SKINS.find(s=>s.id===skinId)||SKINS[0];
  const col=skin.color,glowCol=skin.glow,hasRing=skin.ring,emoji=skin.emoji;

  ctx.save();ctx.translate(pc.x,pc.y);
  if(pc.splitting&&pc.splitT!=null){
    const t=pc.splitT,ease=t<0.5?4*t*t*t:(t-1)*(2*t-2)*(2*t-2)+1,squish=1-ease,dir=Math.atan2(pc.vy,pc.vx);
    ctx.rotate(dir);ctx.scale(1+squish*1.1,1/(1+squish*1.05));ctx.rotate(-dir);
  }
  if(isMe){ctx.shadowBlur=32;ctx.shadowColor=glowCol+"ee";}
  if(!pc.splitting){const spd=Math.hypot(pc.vx,pc.vy),ta=Math.atan2(pc.vy,pc.vx),tilt=Math.min(spd*.04,.18);ctx.rotate(ta);ctx.scale(1+tilt*.5,1-tilt*.3);ctx.rotate(-ta);}

  // ring
  if(hasRing){ctx.save();ctx.scale(1,.28);const rg=ctx.createRadialGradient(0,0,dr*1.1,0,0,dr*2.2);rg.addColorStop(0,col+"cc");rg.addColorStop(.5,col+"66");rg.addColorStop(1,"transparent");ctx.fillStyle=rg;ctx.beginPath();ctx.arc(0,0,dr*2.2,0,Math.PI*2);ctx.arc(0,0,dr*1.05,0,Math.PI*2,true);ctx.fill();ctx.restore();}

  // atmosphere
  const atmo=ctx.createRadialGradient(0,0,dr*.7,0,0,dr*1.4);atmo.addColorStop(0,col+"00");atmo.addColorStop(.5,col+"44");atmo.addColorStop(1,col+"00");ctx.fillStyle=atmo;ctx.beginPath();ctx.arc(0,0,dr*1.4,0,Math.PI*2);ctx.fill();

  // clipped sphere interior
  ctx.save();ctx.beginPath();ctx.arc(0,0,dr,0,Math.PI*2);ctx.clip();

  // base color
  ctx.fillStyle=col;ctx.fillRect(-dr,-dr,dr*2,dr*2);

  // emoji fills the sphere
  ctx.font=`${dr*1.72}px serif`;ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.globalAlpha=0.95;ctx.fillText(emoji,0,dr*0.06);ctx.globalAlpha=1;

  // specular highlight
  const hl=ctx.createRadialGradient(-dr*.38,-dr*.42,0,-dr*.38,-dr*.42,dr*.55);hl.addColorStop(0,"rgba(255,255,255,.42)");hl.addColorStop(1,"rgba(255,255,255,0)");ctx.fillStyle=hl;ctx.fillRect(-dr,-dr,dr*2,dr*2);

  // dark edge
  const edge=ctx.createRadialGradient(0,0,dr*.6,0,0,dr);edge.addColorStop(0,"rgba(0,0,0,0)");edge.addColorStop(1,"rgba(0,0,0,0.4)");ctx.fillStyle=edge;ctx.fillRect(-dr,-dr,dr*2,dr*2);
  ctx.restore();// unclip

  if(pc.splitting&&pc.splitT!=null){const alpha=(1-pc.splitT)*0.85;ctx.strokeStyle=`rgba(255,255,255,${alpha})`;ctx.lineWidth=3+pc.splitT*5;ctx.beginPath();ctx.arc(0,0,dr*(1+pc.splitT*0.45),0,Math.PI*2);ctx.stroke();}
  ctx.shadowBlur=0;
  if(pc.mergeTimer>0){const progress=1-(pc.mergeTimer/calcMergeTime(pc.r));ctx.beginPath();ctx.arc(0,0,dr+4,-Math.PI/2,-Math.PI/2+progress*Math.PI*2);ctx.strokeStyle="rgba(255,255,255,0.55)";ctx.lineWidth=2.5;ctx.stroke();}

  // power-up ring
  if(p._powerups&&Object.keys(p._powerups).length){const puGlow={speed:"#ffdd00",magnet:"#ff66ff",shield:"#44aaff"};Object.keys(p._powerups).forEach((t,i)=>{const puColor=puGlow[t]||"#ffffff";const pulse=0.65+0.35*Math.sin(time*0.012+i*1.1);ctx.globalAlpha=pulse;ctx.strokeStyle=puColor;ctx.lineWidth=2.5;ctx.shadowBlur=10;ctx.shadowColor=puColor;ctx.beginPath();ctx.arc(0,0,dr*(1.48+i*0.18),0,Math.PI*2);ctx.stroke();});ctx.shadowBlur=0;ctx.globalAlpha=1;}
  // name below planet
  const fs=Math.max(9,dr*.28);ctx.font=`bold ${fs}px Arial`;ctx.textAlign="center";ctx.textBaseline="top";
  ctx.strokeStyle="rgba(0,0,0,.85)";ctx.lineWidth=Math.max(2,fs*.38);ctx.strokeText(p.name,0,dr+4);
  ctx.fillStyle="#fff";ctx.fillText(p.name,0,dr+4);
  ctx.restore();
}

function drawScene(ctx,W,H,cam,stateRef,myId,time){
  const{players,food,viruses,ejected}=stateRef.current;
  const bg=ctx.createRadialGradient(W*.5,H*.4,0,W*.5,H*.5,Math.max(W,H));bg.addColorStop(0,"#0a0e2a");bg.addColorStop(.5,"#060910");bg.addColorStop(1,"#030507");ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  ctx.save();ctx.translate(W/2,H/2);ctx.scale(cam.scale,cam.scale);ctx.translate(-cam.x,-cam.y);
  drawStars(ctx,time);
  ctx.globalAlpha=.025;[[WORLD_W*.3,WORLD_H*.3,400,"#4466ff"],[WORLD_W*.7,WORLD_H*.6,350,"#aa44ff"],[WORLD_W*.5,WORLD_H*.8,500,"#ff4444"],[WORLD_W*.15,WORLD_H*.7,280,"#44ffaa"]].forEach(([nx,ny,nr,nc])=>{const ng=ctx.createRadialGradient(nx,ny,0,nx,ny,nr);ng.addColorStop(0,nc);ng.addColorStop(1,"transparent");ctx.fillStyle=ng;ctx.beginPath();ctx.arc(nx,ny,nr,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;
  ctx.strokeStyle="rgba(255,255,255,0.018)";ctx.lineWidth=1;for(let x=0;x<WORLD_W;x+=140){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,WORLD_H);ctx.stroke();}for(let y=0;y<WORLD_H;y+=140){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(WORLD_W,y);ctx.stroke();}
  ctx.strokeStyle="rgba(80,120,255,0.4)";ctx.lineWidth=10;ctx.strokeRect(0,0,WORLD_W,WORLD_H);
  ctx.strokeStyle="rgba(80,120,255,0.12)";ctx.lineWidth=24;ctx.strokeRect(-12,-12,WORLD_W+24,WORLD_H+24);
  food.forEach(f=>drawFood(ctx,f,time));
  (ejected||[]).forEach(e=>drawEjected(ctx,e));
  viruses.forEach(v=>drawVirus(ctx,v));
  const all=[];Object.values(players).filter(p=>!p.dead).forEach(p=>{p.pieces.forEach(pc=>all.push({pc,p}));});
  all.sort((a,b)=>a.pc.r-b.pc.r).forEach(({pc,p})=>drawPlanet(ctx,pc,p,p.id===myId,time,p.id===myId?undefined:p.skinId));
  ctx.restore();
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export default function PlanetIO(){
  const canvasRef=useRef(null);
  const stateRef=useRef({players:{},food:[],viruses:[],ejected:[],leaderboard:[]});
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
  const killerIdRef=useRef(null);
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

  const showNotif=(msg,color="#4af")=>{setNotification({msg,color});setTimeout(()=>setNotification(null),2800);};
  const addCoins=n=>setGameMeta(m=>({...m,coins:m.coins+n,totalCoins:m.totalCoins+n}));

  useEffect(()=>{equippedSkinIdRef.current=gameMeta.equipped;},[gameMeta.equipped]);

  useEffect(()=>{
    const p=getServer().players[myIdRef.current];
    if(p){const skin=SKINS.find(s=>s.id===gameMeta.equipped)||SKINS[0];p.skinId=skin.id;p.color=skin.color;}
  },[gameMeta.equipped]);

  useEffect(()=>{
    const server=getServer();
    const onState=d=>{stateRef.current={...stateRef.current,...d};};
    const onTick=({players,food,viruses,ejected,leaderboard:lb})=>{
      stateRef.current={players,food,viruses,ejected,leaderboard:lb};
      setLeaderboard([...lb]);
      const me=players[myIdRef.current];
      if(me&&!me.dead){
        const mass=Math.round(me.pieces.reduce((s,pc)=>s+pc.r*pc.r,0));
        setMyScore(mass);
        if(Math.random()<0.00055)addCoins(Math.max(1,Math.floor(mass/2000)));
        if(mass>=5000&&!gameMeta.achievements?.mass5000){
          setGameMeta(m=>{if(m.achievements.mass5000)return m;const no=[...m.owned];const sk=SKINS.find(s=>s.unlockKey==="mass5000");if(sk&&!no.includes(sk.id))no.push(sk.id);return{...m,achievements:{...m.achievements,mass5000:true},owned:no};});
          showNotif("⚖️ Desbloqueado: Massivo","#44ffaa");
        }
      }
    };
    const onEaten=({by,score,dx,dy,killerId})=>{
      setEatenBy(by);setFinalScore(score);
      const coinsEarned=Math.floor(score/300)+Math.floor(sessionRef.current.kills*2);
      addCoins(coinsEarned);setDeathCoins(coinsEarned);
      setGameMeta(m=>({...m,stats:{...m.stats,games:m.stats.games+1}}));
      if(dx!=null)deathCamRef.current={x:dx,y:dy};
      killerIdRef.current=killerId||null;
      setScreen("dead");
    };
    server.on("gameState",onState);server.on("tick",onTick);server.on("eaten",onEaten);
    const iv=setInterval(()=>setPing(7+Math.floor(Math.random()*14)),2800);
    return()=>{server.off("gameState",onState);server.off("tick",onTick);server.off("eaten",onEaten);clearInterval(iv);};
  },[gameMeta.achievements]);

  const startGame=useCallback(()=>{
    myNameRef.current=nameInput||"Explorer";
    sessionRef.current={startTime:Date.now(),kills:0,splits:0,ejects:0,botKills:0,streak:0,quadVisited:new Set(),top1Time:0,lastTop1:0};
    const skin=SKINS.find(s=>s.id===gameMeta.equipped)||SKINS[0];
    getServer().clientSend("join",{id:myIdRef.current,name:myNameRef.current,skinId:skin.id});
    setMyScore(0);setScreen("game");
  },[nameInput,gameMeta.equipped]);

  const respawn=useCallback(()=>{
    myNameRef.current=nameInput||myNameRef.current;
    sessionRef.current={startTime:Date.now(),kills:0,splits:0,ejects:0,botKills:0,streak:0,quadVisited:new Set(),top1Time:0,lastTop1:0};
    const skin=SKINS.find(s=>s.id===gameMeta.equipped)||SKINS[0];
    getServer().clientSend("join",{id:myIdRef.current,name:myNameRef.current,skinId:skin.id});
    setMyScore(0);setScreen("game");
  },[nameInput,gameMeta.equipped]);

  useEffect(()=>{
    const mv=e=>{const c=canvasRef.current;if(!c)return;const r=c.getBoundingClientRect();mouseRef.current={x:e.clientX-r.left,y:e.clientY-r.top};};
    const mt=e=>{e.preventDefault();const c=canvasRef.current;if(!c)return;const r=c.getBoundingClientRect();const t=e.touches[0];mouseRef.current={x:t.clientX-r.left,y:t.clientY-r.top};};
    window.addEventListener("mousemove",mv);window.addEventListener("touchmove",mt,{passive:false});
    return()=>{window.removeEventListener("mousemove",mv);window.removeEventListener("touchmove",mt);};
  },[]);

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
      // minimap
      const MS=155,MP=16,mx=W-MS-MP,myt=H-MS-MP;
      ctx.fillStyle="rgba(2,4,18,0.82)";ctx.strokeStyle="rgba(80,130,255,0.45)";ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(mx,myt,MS,MS,8);ctx.fill();ctx.stroke();
      Object.values(stateRef.current.players).filter(p=>!p.dead).forEach(p=>{const pcx=p.pieces.reduce((s,pc)=>s+pc.x,0)/p.pieces.length,pcy=p.pieces.reduce((s,pc)=>s+pc.y,0)/p.pieces.length;ctx.fillStyle=p.id===id?"#fff":p.color;ctx.shadowBlur=p.id===id?6:0;ctx.shadowColor="#fff";ctx.beginPath();ctx.arc(mx+(pcx/WORLD_W)*MS,myt+(pcy/WORLD_H)*MS,p.id===id?4.5:2.5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;});
      stateRef.current.viruses.forEach(v=>{ctx.fillStyle="#00ff8866";ctx.beginPath();ctx.arc(mx+(v.x/WORLD_W)*MS,myt+(v.y/WORLD_H)*MS,2,0,Math.PI*2);ctx.fill();});
      // HUD buttons
      [[{x:W-MS/2-MP,y:myt-68},"DIVIDIR","ESPAÇO",splitCD],[{x:W-MS/2-MP-76,y:myt-68},"EJETAR","W",ejectCD]].forEach(([btn,lbl,key,cd])=>{ctx.fillStyle=cd?"rgba(40,40,60,.9)":"rgba(50,100,255,.88)";ctx.shadowBlur=cd?0:14;ctx.shadowColor="#4af";ctx.beginPath();ctx.arc(btn.x,btn.y,28,0,Math.PI*2);ctx.fill();ctx.strokeStyle=cd?"#333":"#88aaff";ctx.lineWidth=2;ctx.beginPath();ctx.arc(btn.x,btn.y,28,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle=cd?"#555":"#fff";ctx.font="bold 9px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(lbl,btn.x,btn.y-4);ctx.fillText(`[${key}]`,btn.x,btn.y+7);});
      // FPS counter
      const fpsColor=fps>=50?"#00ff88":fps>=30?"#ffcc00":"#ff4444";
      ctx.font="bold 13px monospace";ctx.textAlign="left";ctx.textBaseline="top";
      ctx.fillStyle="rgba(0,0,0,0.45)";ctx.fillRect(12,H-34,72,22);
      ctx.fillStyle=fpsColor;ctx.fillText(`FPS: ${fps}`,16,H-31);
      animRef.current=requestAnimationFrame(loop);
    };
    animRef.current=requestAnimationFrame(loop);return()=>cancelAnimationFrame(animRef.current);
  },[screen,splitCD,ejectCD]);

  useEffect(()=>{
    if(screen!=="game")return;const canvas=canvasRef.current;if(!canvas)return;
    const onMouseDown=e=>{const MS=155,MP=16,W=canvas.offsetWidth,H=canvas.offsetHeight;const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(Math.hypot(x-(W-MS/2-MP),y-(H-MS-MP-68))<28){doSplit();return;}if(Math.hypot(x-(W-MS/2-MP-76),y-(H-MS-MP-68))<28){doEject();return;}if(e.button===0)doEject();if(e.button===2)doSplit();};
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
    <div style={{position:"fixed",inset:0,background:"radial-gradient(ellipse at 50% 30%,#0d1230,#030508)",color:"#fff",fontFamily:"Arial,sans-serif",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:"1px solid rgba(80,130,255,.25)",background:"rgba(0,0,20,.7)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>setScreen("menu")} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",color:"#aabbff",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:13}}>← Voltar</button>
          <span style={{fontSize:22,fontWeight:"bold",letterSpacing:2}}>🛍️ LOJA DE SKINS</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setPurchaseModal("coins")} style={{background:"linear-gradient(135deg,#f90,#f60)",border:"none",color:"#fff",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,fontWeight:"bold"}}>+ Comprar Moedas</button>
          <div style={{background:"rgba(255,200,0,.15)",border:"1px solid #ffcc00",borderRadius:10,padding:"6px 14px",display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:18}}>🪙</span><span style={{fontSize:18,fontWeight:"bold",color:"#ffcc00"}}>{gameMeta.coins.toLocaleString()}</span>
          </div>
        </div>
      </div>
      <div style={{padding:"10px 20px",background:"rgba(0,0,40,.5)",borderBottom:"1px solid rgba(80,130,255,.15)",display:"flex",alignItems:"center",gap:14,flexShrink:0}}>
        <div style={{width:52,height:52,borderRadius:"50%",background:equippedSkin.color,boxShadow:`0 0 18px ${equippedSkin.glow}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,border:`2px solid ${equippedSkin.glow}`}}>{equippedSkin.emoji}</div>
        <div><div style={{fontSize:11,color:"#7799ee"}}>EQUIPADA AGORA</div><div style={{fontSize:17,fontWeight:"bold"}}>{equippedSkin.name}</div><div style={{fontSize:11,color:RARITY_COLORS[equippedSkin.rarity]}}>{RARITY_LABELS[equippedSkin.rarity]}</div></div>
        <div style={{marginLeft:"auto",fontSize:12,color:"#445566"}}>{gameMeta.owned.length}/50 desbloqueadas</div>
      </div>
      <div style={{display:"flex",gap:6,padding:"10px 20px",flexShrink:0,overflowX:"auto"}}>
        {[["all","Todas"],["owned","Minhas"],["common","Comum"],["rare","Raro"],["epic","Épico"],["legendary","Lendário"],["earned","Conquistas"],["secret","Secretas"]].map(([k,l])=>(
          <button key={k} onClick={()=>setShopTab(k)} style={{background:shopTab===k?"rgba(80,130,255,.35)":"rgba(255,255,255,.05)",border:shopTab===k?"1px solid #4af":"1px solid rgba(255,255,255,.1)",color:shopTab===k?"#88ddff":"#778899",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:12,whiteSpace:"nowrap",flexShrink:0}}>{l}</button>
        ))}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"8px 16px 20px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,alignContent:"start"}}>
        {filteredSkins.map(skin=>{
          const owned=gameMeta.owned.includes(skin.id),equipped=gameMeta.equipped===skin.id,canAfford=gameMeta.coins>=skin.price,isSecret=skin.rarity==="secret"&&!owned;
          return(
            <div key={skin.id} onClick={()=>!isSecret&&buySkin(skin)}
              style={{background:equipped?"rgba(80,130,255,.2)":"rgba(255,255,255,.04)",border:equipped?"2px solid #4af":owned?"1px solid rgba(255,255,255,.2)":"1px solid rgba(255,255,255,.07)",borderRadius:12,padding:"12px 10px",cursor:isSecret?"default":"pointer",position:"relative",transition:"transform .15s",opacity:isSecret?.5:1}}
              onMouseEnter={e=>{if(!isSecret)e.currentTarget.style.transform="scale(1.04)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";}}>
              {equipped&&<div style={{position:"absolute",top:6,right:6,background:"#4af",borderRadius:4,fontSize:9,padding:"1px 5px",fontWeight:"bold",color:"#000"}}>EQUIPADA</div>}
              {owned&&!equipped&&<div style={{position:"absolute",top:6,right:6,background:"rgba(68,255,136,.7)",borderRadius:4,fontSize:9,padding:"1px 5px",color:"#000",fontWeight:"bold"}}>✓</div>}
              <div style={{width:54,height:54,borderRadius:"50%",background:isSecret?"#222":skin.color,boxShadow:isSecret?"none":`0 0 14px ${skin.glow}44`,margin:"0 auto 8px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,border:`2px solid ${isSecret?"#444":skin.glow+"66"}`}}>{isSecret?"❓":skin.emoji}</div>
              <div style={{fontSize:12,fontWeight:"bold",textAlign:"center",marginBottom:3,color:isSecret?"#445":"#eee"}}>{isSecret?"???":skin.name}</div>
              <div style={{fontSize:10,textAlign:"center",color:RARITY_COLORS[skin.rarity],marginBottom:5}}>{RARITY_LABELS[skin.rarity]}</div>
              {!owned&&skin.price>0&&<div style={{textAlign:"center",fontSize:12,color:canAfford?"#ffcc44":"#cc4444",fontWeight:"bold"}}>🪙 {skin.price.toLocaleString()}</div>}
              {!owned&&skin.rarity==="earned"&&!isSecret&&<div style={{textAlign:"center",fontSize:9,color:"#44ffaa",lineHeight:1.3}}>{skin.desc}</div>}
              {owned&&<div style={{textAlign:"center",fontSize:11,color:equipped?"#4af":"#44ffaa"}}>{equipped?"✅ Equipada":"Toque p/ equipar"}</div>}
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
                  <div style={{marginTop:8,background:"linear-gradient(135deg,#f90,#f60)",borderRadius:8,padding:"5px",fontSize:14,fontWeight:"bold",color:"#fff"}}>{pkg.price}</div>
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
    <div style={{position:"fixed",inset:0,background:"radial-gradient(ellipse at 50% 40%,#0d1230,#030508)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#fff",fontFamily:"Arial,sans-serif",overflow:"hidden"}}>
      {Array.from({length:80}).map((_,i)=><div key={i} style={{position:"absolute",left:`${Math.random()*100}%`,top:`${Math.random()*100}%`,width:`${.8+Math.random()*2.2}px`,height:`${.8+Math.random()*2.2}px`,borderRadius:"50%",background:"#fff",opacity:.2+Math.random()*.8}}/>)}
      <div style={{fontSize:54,fontWeight:"bold",letterSpacing:5,textShadow:"0 0 40px #4af,0 0 80px #26f",marginBottom:6,textAlign:"center"}}>🪐 PLANET.IO</div>
      <div style={{color:"#8899cc",marginBottom:18,fontSize:15,textAlign:"center"}}>Conquiste a galáxia. Divida, ejete e devore.</div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:18,background:"rgba(255,200,0,.1)",border:"1px solid rgba(255,200,0,.3)",borderRadius:10,padding:"6px 18px"}}>
        <span style={{fontSize:20}}>🪙</span><span style={{fontSize:20,fontWeight:"bold",color:"#ffcc44"}}>{gameMeta.coins.toLocaleString()}</span><span style={{fontSize:12,color:"#886600"}}>moedas</span>
      </div>
      <div style={{background:"rgba(255,255,255,.06)",borderRadius:18,padding:"22px 36px",border:"1px solid rgba(255,255,255,.12)",display:"flex",flexDirection:"column",alignItems:"center",gap:14,minWidth:300}}>
        <div style={{fontSize:13,color:"#99aacc"}}>Nome do seu planeta:</div>
        <input value={nameInput} onChange={e=>setNameInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&startGame()} maxLength={14}
          style={{padding:"11px 18px",borderRadius:10,border:"2px solid #4af",background:"rgba(0,0,60,.7)",color:"#fff",fontSize:19,textAlign:"center",outline:"none",width:"100%",boxSizing:"border-box"}}/>
        <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(0,0,40,.5)",borderRadius:10,padding:"8px 16px",width:"100%",boxSizing:"border-box",border:"1px solid rgba(80,130,255,.2)"}}>
          <div style={{width:44,height:44,borderRadius:"50%",background:equippedSkin.color,boxShadow:`0 0 12px ${equippedSkin.glow}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,border:`2px solid ${equippedSkin.glow}66`}}>{equippedSkin.emoji}</div>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:"bold"}}>{equippedSkin.name}</div><div style={{fontSize:10,color:RARITY_COLORS[equippedSkin.rarity]}}>{RARITY_LABELS[equippedSkin.rarity]}</div></div>
          <button onClick={()=>setScreen("shop")} style={{background:"rgba(80,130,255,.3)",border:"1px solid #4af",color:"#aaddff",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:11}}>Trocar</button>
        </div>
        <button onClick={startGame} style={{padding:"13px 0",borderRadius:10,border:"none",background:"linear-gradient(135deg,#4af,#26f)",color:"#fff",fontSize:19,fontWeight:"bold",cursor:"pointer",width:"100%",boxShadow:"0 0 24px #4af5",letterSpacing:2}}>🚀 JOGAR</button>
        <button onClick={()=>setScreen("shop")} style={{padding:"10px 0",borderRadius:10,border:"1px solid rgba(255,200,0,.4)",background:"rgba(255,200,0,.08)",color:"#ffcc44",fontSize:15,fontWeight:"bold",cursor:"pointer",width:"100%"}}>🛍️ LOJA — 50 SKINS</button>
      </div>
      <div style={{marginTop:20,color:"#445566",fontSize:12,textAlign:"center",lineHeight:2.1}}>
        🖱️ mouse = mover &nbsp;|&nbsp; <b style={{color:"#88aaff"}}>ESPAÇO</b> = dividir &nbsp;|&nbsp; <b style={{color:"#ffd700"}}>W</b> = ejetar massa
      </div>
      {notification&&<div style={{position:"absolute",bottom:24,left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,30,.95)",border:`1px solid ${notification.color}`,borderRadius:12,padding:"10px 22px",fontSize:15,color:notification.color,fontWeight:"bold",pointerEvents:"none"}}>{notification.msg}</div>}
    </div>
  );

  // ── DEAD ─────────────────────────────────────────────────────────────────────
  if(screen==="dead"){
    const DeathBg=()=>{
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
    };
    return(
      <div style={{position:"fixed",inset:0,fontFamily:"Arial,sans-serif",color:"#fff",overflow:"hidden"}}>
        <DeathBg/>
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
          <div style={{pointerEvents:"auto",textAlign:"center",marginBottom:16}}>
            <div style={{fontSize:64,lineHeight:1,filter:"drop-shadow(0 0 24px #f55)"}}>💥</div>
            <div style={{fontSize:44,fontWeight:"bold",color:"#ff4444",textShadow:"0 0 40px #f55,0 0 80px #f004",letterSpacing:3,marginTop:6}}>ABSORVIDO</div>
            <div style={{fontSize:13,color:"#ff8888",marginTop:4,letterSpacing:2}}>— A galáxia continua sem você —</div>
          </div>
          <div style={{pointerEvents:"auto",background:"rgba(4,2,20,0.82)",border:"1px solid rgba(255,60,60,0.35)",borderRadius:18,padding:"18px 32px",backdropFilter:"blur(14px)",display:"flex",flexDirection:"column",alignItems:"center",gap:6,minWidth:280,marginBottom:14,boxShadow:"0 0 40px rgba(200,0,0,0.2)"}}>
            <div style={{fontSize:12,color:"#886",letterSpacing:1,marginBottom:2}}>DEVORADO POR</div>
            <div style={{fontSize:24,fontWeight:"bold",color:"#ffaa44",marginBottom:8}}>{eatenBy}</div>
            <div style={{display:"flex",gap:20}}>
              <div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:"bold",color:"#4ecdc4"}}>{finalScore.toLocaleString()}</div><div style={{fontSize:10,color:"#445"}}>MASSA FINAL</div></div>
              <div style={{width:1,background:"rgba(255,255,255,.1)"}}/>
              <div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:"bold",color:"#ffcc44"}}>+{deathCoins}</div><div style={{fontSize:10,color:"#445"}}>🪙 MOEDAS</div></div>
              <div style={{width:1,background:"rgba(255,255,255,.1)"}}/>
              <div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:"bold",color:"#cc88ff"}}>{sessionRef.current.kills}</div><div style={{fontSize:10,color:"#445"}}>ABATES</div></div>
            </div>
          </div>
          <div style={{pointerEvents:"auto",background:"rgba(4,2,20,0.82)",border:"1px solid rgba(255,255,255,.1)",borderRadius:16,padding:"14px 24px",backdropFilter:"blur(14px)",display:"flex",flexDirection:"column",gap:10,alignItems:"center",minWidth:280}}>
            <input value={nameInput} onChange={e=>setNameInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&respawn()} maxLength={14}
              style={{padding:"9px 16px",borderRadius:8,border:"2px solid rgba(255,60,60,.6)",background:"rgba(40,0,0,.6)",color:"#fff",fontSize:16,textAlign:"center",outline:"none",width:"100%",boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:8,width:"100%"}}>
              <button onClick={()=>setScreen("shop")} style={{flex:1,padding:"10px",borderRadius:10,border:"1px solid rgba(255,200,0,.4)",background:"rgba(255,200,0,.08)",color:"#ffcc44",fontSize:13,fontWeight:"bold",cursor:"pointer"}}>🛍️ Loja</button>
              <button onClick={respawn} style={{flex:2,padding:"11px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#ff5555,#aa1111)",color:"#fff",fontSize:16,fontWeight:"bold",cursor:"pointer",boxShadow:"0 0 22px #f554",letterSpacing:1}}>🔄 RENASCER</button>
            </div>
          </div>
        </div>
        {notification&&<div style={{position:"absolute",bottom:24,left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,30,.95)",border:`1px solid ${notification.color}`,borderRadius:12,padding:"10px 22px",fontSize:15,color:notification.color,fontWeight:"bold",pointerEvents:"none"}}>{notification.msg}</div>}
      </div>
    );
  }

  // ── GAME ─────────────────────────────────────────────────────────────────────
  return(
    <div style={{position:"fixed",inset:0,overflow:"hidden",background:"#030507"}}>
      <canvas ref={canvasRef} style={{display:"block",width:"100%",height:"100%"}}/>
      <div style={{position:"absolute",top:14,left:14,color:"#fff",fontFamily:"Arial,sans-serif",background:"rgba(2,4,20,.82)",borderRadius:12,padding:"12px 18px",border:"1px solid rgba(80,130,255,.3)",minWidth:155,backdropFilter:"blur(6px)"}}>
        <div style={{fontSize:11,color:"#7799ee",marginBottom:6,letterSpacing:1}}>🏆 MASSA</div>
        {leaderboard.slice(0,8).map((p,i)=>(
          <div key={i} style={{fontSize:12,padding:"2px 0",color:p.name===myNameRef.current?"#ffd700":"#bbc",fontWeight:p.name===myNameRef.current?"bold":"normal",display:"flex",justifyContent:"space-between",gap:8}}>
            <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:90}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}.`} {p.name}{p.isBot?" 🤖":""}</span>
            <span style={{color:"#4ecdc4",flexShrink:0}}>{p.mass.toLocaleString()}</span>
          </div>
        ))}
      </div>
      <div style={{position:"absolute",top:14,right:14,color:"#fff",fontFamily:"Arial,sans-serif",background:"rgba(2,4,20,.82)",borderRadius:12,padding:"12px 18px",border:"1px solid rgba(80,130,255,.3)",textAlign:"right",backdropFilter:"blur(6px)"}}>
        <div style={{fontSize:20,fontWeight:"bold",color:"#4ecdc4"}}>⚖️ {myScore.toLocaleString()}</div>
        <div style={{fontSize:10,color:"#336655",marginTop:1}}>massa total</div>
        <div style={{fontSize:11,color:"#7799ee",marginTop:3}}>Planeta: <b style={{color:"#ccd"}}>{myNameRef.current}</b></div>
        <div style={{fontSize:10,color:"#886600",marginTop:2}}>🪙 {gameMeta.coins.toLocaleString()}</div>
        <div style={{fontSize:10,color:"#334455",marginTop:2}}>ping: {ping}ms</div>
        <button onClick={()=>setScreen("shop")} style={{marginTop:7,background:"rgba(255,200,0,.12)",border:"1px solid rgba(255,200,0,.3)",color:"#ffcc44",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:10,width:"100%"}}>🛍️ Loja</button>
      </div>
      {notification&&<div style={{position:"absolute",bottom:24,left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,30,.95)",border:`1px solid ${notification.color}`,borderRadius:12,padding:"10px 22px",fontSize:15,color:notification.color,fontWeight:"bold",pointerEvents:"none",whiteSpace:"nowrap"}}>{notification.msg}</div>}
    </div>
  );
}
'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');
const WebSocket=require('ws');

// ── CONSTANTS ──────────────────────────────────────────────────────────────────
const WORLD_W=7200,WORLD_H=7200,FOOD_COUNT=840,VIRUS_COUNT=44,MAX_PIECES=8;
const SPLIT_SPEED=24,MERGE_TIME_BASE=300,FRICTION=0.86,EJECT_SPEED=18,EJECT_R=9;
const ROOM_MAX=30,ROOM_BOTS=15;
const BOT_NAMES=["Nebulox","Vortexia","Cosmara","Drakonis","Stellara","Graviton","Quasara","Pulsaris","Meteora","Darkion","Nexaris","Solaron","Astrophex","Hydraxis","Volcanix","Luminos","Aetheron","Aurorax","Voidrix","Pyronis"];
const SKINS=[
  {id:0,color:"#4ECDC4"},{id:1,color:"#c1440e"},{id:2,color:"#4060c8"},{id:3,color:"#e8c87a"},{id:4,color:"#9090a8"},
  {id:5,color:"#c88c5a"},{id:6,color:"#4a9eff"},{id:7,color:"#d0d0d8"},{id:8,color:"#88ccff"},{id:9,color:"#886644"},
  {id:10,color:"#c8a060"},{id:11,color:"#7ab8d4"},{id:12,color:"#ffffaa"},{id:13,color:"#ff88bb"},{id:14,color:"#44dd88"},
  {id:15,color:"#ddff44"},{id:16,color:"#eeeeff"},{id:17,color:"#aaddff"},{id:18,color:"#ff4422"},{id:19,color:"#88ff44"},
  {id:20,color:"#110022"},{id:21,color:"#cc44ff"},{id:22,color:"#ff8800"},{id:23,color:"#88eeff"},{id:24,color:"#222244"},
  {id:25,color:"#ffffff"},{id:26,color:"#44ffcc"},{id:27,color:"#6688cc"},{id:28,color:"#cc2200"},{id:29,color:"#eeeeff"},
  {id:30,color:"#cc88ff"},{id:31,color:"#ffffff"},{id:32,color:"#000088"},{id:33,color:"#ffdd00"},{id:34,color:"#ff4400"},
  {id:35,color:"#44aa88"},{id:36,color:"#ff6644"},{id:37,color:"#ddaa44"},{id:38,color:"#88aaff"},{id:39,color:"#ffcc00"},
  {id:40,color:"#cc8844"},{id:41,color:"#ff4488"},{id:42,color:"#44ccff"},{id:43,color:"#88cc44"},{id:44,color:"#cc44ff"},
  {id:45,color:"#333355"},{id:46,color:"#333355"},{id:47,color:"#333355"},{id:48,color:"#333355"},{id:49,color:"#ffff88"},
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
const uid=()=>Math.random().toString(36).substr(2,9);
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const lerp=(a,b,t)=>a+(b-a)*t;
const calcMergeTime=r=>Math.floor(MERGE_TIME_BASE+r*2.2);

// ── GAME SERVER ───────────────────────────────────────────────────────────────
class GameServer{
  constructor(){this.players={};this.food=[];this.viruses=[];this.ejected=[];this.missiles=[];this.listeners={};this.running=false;this._spawnFood();this._spawnViruses();}
  on(ev,cb){(this.listeners[ev]||(this.listeners[ev]=[])).push(cb);}
  off(ev,cb){if(this.listeners[ev])this.listeners[ev]=this.listeners[ev].filter(f=>f!==cb);}
  _emit(ev,d){(this.listeners[ev]||[]).forEach(cb=>cb(d));}
  clientSend(ev,d){this._handleClient(ev,d);}
  _spawnFood(){
    const types=["asteroid","comet","star","moon"];
    const puTypes=["powerup_speed","powerup_magnet","powerup_shield"];
    const puColors={"powerup_speed":"#ffdd00","powerup_magnet":"#ff66ff","powerup_shield":"#44aaff"};
    let puCount=this.food.filter(f=>f.type&&f.type.startsWith("powerup_")).length;
    let msCount=this.food.filter(f=>f.type==="missile_ammo").length;
    while(this.food.length<FOOD_COUNT){
      const r=Math.random();
      const wantMS=msCount<20&&r<0.05;
      const wantPU=!wantMS&&puCount<15&&r<0.06;
      if(wantMS){this.food.push({id:uid(),x:Math.random()*WORLD_W,y:Math.random()*WORLD_H,r:13,type:"missile_ammo",color:"#ff6600"});msCount++;}
      else if(wantPU){const t=puTypes[Math.floor(Math.random()*3)];this.food.push({id:uid(),x:Math.random()*WORLD_W,y:Math.random()*WORLD_H,r:12+Math.random()*5,type:t,color:puColors[t]});puCount++;}
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
    if(ev==="fire"){
      const p=this.players[d.id];if(!p||p.dead||!(p._missiles>0))return;
      const cx=this._cx(p),cy=this._cy(p);
      let nearest=null,nearestD=Infinity;
      Object.values(this.players).filter(t=>!t.dead&&t.id!==p.id).forEach(t=>{const td=dist({x:cx,y:cy},{x:this._cx(t),y:this._cy(t)});if(td<nearestD){nearestD=td;nearest=t;}});
      if(!nearest)return;
      p._missiles--;
      const tx=this._cx(nearest),ty=this._cy(nearest),dx=tx-cx,dy=ty-cy,len=Math.hypot(dx,dy)||1;
      this.missiles.push({id:uid(),x:cx,y:cy,vx:(dx/len)*20,vy:(dy/len)*20,ownerId:p.id,targetId:nearest.id,r:7,life:500});
    }
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
  start(){if(this.running)return;this.running=true;this._spawnBots(ROOM_BOTS);this._interval=setInterval(()=>this._tick(),16);}
  stop(){clearInterval(this._interval);this.running=false;}
  _spawnBots(n){
    for(let i=0;i<n;i++){
      const id="bot_"+uid(),skinId=Math.floor(Math.random()*10);
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
    this.viruses.forEach(v=>{
      v.pulseT+=0.06;v.vx=(v.vx||0)*0.92;v.vy=(v.vy||0)*0.92;
      v.x=clamp(v.x+v.vx,v.r,WORLD_W-v.r);v.y=clamp(v.y+v.vy,v.r,WORLD_H-v.r);
      if(v.x<=v.r||v.x>=WORLD_W-v.r)v.vx*=-0.5;if(v.y<=v.r||v.y>=WORLD_H-v.r)v.vy*=-0.5;
    });
    const deadV=new Set();
    for(let i=0;i<this.viruses.length;i++){
      if(deadV.has(i))continue;
      for(let j=i+1;j<this.viruses.length;j++){
        if(deadV.has(j))continue;
        const va=this.viruses[i],vb=this.viruses[j];
        if(Math.hypot(va.x-vb.x,va.y-vb.y)<va.r+vb.r){deadV.add(i);deadV.add(j);this._explodeVirus((va.x+vb.x)/2,(va.y+vb.y)/2,va.r);}
      }
    }
    if(deadV.size>0)this.viruses=this.viruses.filter((_,i)=>!deadV.has(i));
    this.food.forEach(f=>{if(f._vx!=null){f._vx*=0.87;f._vy*=0.87;f.x=clamp(f.x+f._vx,f.r,WORLD_W-f.r);f.y=clamp(f.y+f._vy,f.r,WORLD_H-f.r);f._life--;}});
    this.food=this.food.filter(f=>f._life==null||f._life>0);
    this.ejected.forEach(e=>{e.vx*=0.92;e.vy*=0.92;e.x=clamp(e.x+e.vx,e.r,WORLD_W-e.r);e.y=clamp(e.y+e.vy,e.r,WORLD_H-e.r);if(e.life>0)e.life--;});
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
      if(bot._state==="flee"&&bot._fleeFrom){const th=bot._fleeFrom;if(!th||th.dead){bot._state="wander";return;}const dx=bx-this._cx(th),dy=by-this._cy(th);bot._tx=clamp(bx+dx*4,100,WORLD_W-100);bot._ty=clamp(by+dy*4,100,WORLD_H-100);if(bot._missiles>0&&Math.random()<0.04)this._handleClient("fire",{id:bot.id});}
      else if(bot._state==="hunt"&&bot._huntId){const t=this.players[bot._huntId];if(!t||t.dead){bot._state="wander";return;}bot._tx=this._cx(t);bot._ty=this._cy(t);const d=dist({x:bx,y:by},{x:this._cx(t),y:this._cy(t)});if(d<botBig*2.8&&botBig>this._bigR(t)*1.3&&bot.pieces.length<MAX_PIECES&&Math.random()<0.03)this._splitPlayer(bot,bot._tx,bot._ty);if(bot._missiles>0&&d<botBig*6&&Math.random()<0.05)this._handleClient("fire",{id:bot.id});}
      else{const d=dist({x:bx,y:by},{x:bot._tx,y:bot._ty});if(d<100){bot._tx=200+Math.random()*(WORLD_W-400);bot._ty=200+Math.random()*(WORLD_H-400);}}
    });
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
    plist.forEach(p=>{if(!p._powerups||!p._powerups.magnet)return;p.pieces.forEach(pc=>{this.food.forEach(f=>{if(f._life!=null||f.type.startsWith("powerup_"))return;const d=dist(pc,f);if(d<pc.r*7&&d>1){const nx=(pc.x-f.x)/d,ny=(pc.y-f.y)/d;f.x=clamp(f.x+nx*3.5,f.r,WORLD_W-f.r);f.y=clamp(f.y+ny*3.5,f.r,WORLD_H-f.r);}});});});
    plist.forEach(p=>{p.pieces.forEach(pc=>{this.food=this.food.filter(f=>{if(f._life!=null)return true;if(dist(pc,f)<pc.r+f.r*0.5){if(f.type==="missile_ammo"){p._missiles=Math.min((p._missiles||0)+1,3);}else if(f.type&&f.type.startsWith("powerup_")){if(!p._powerups)p._powerups={};const pt=f.type.replace("powerup_","");if(p._powerups[pt]){p._powerups[pt]+=400;}else if(Object.keys(p._powerups).length<3){p._powerups[pt]=400;}}else{pc.r=Math.min(Math.sqrt(pc.r*pc.r+f.r*f.r*0.15),260);p.score+=Math.floor(f.r);}return false;}return true;});});});
    this._spawnFood();
    plist.forEach(p=>{p.pieces.forEach(pc=>{this.ejected=this.ejected.filter(e=>{if(e.ownerId===p.id&&e.life>0)return true;if(dist(pc,e)<pc.r+e.r*0.6){pc.r=Math.min(Math.sqrt(pc.r*pc.r+e.r*e.r*2),260);p.score+=2;return false;}return true;});});});
    this.ejected=this.ejected.filter(e=>e.life>-60);
    const VIRUS_MAX_R=80,VIRUS_SPLIT_R=72,VIRUS_FEED_R=36;
    this.ejected=this.ejected.filter(e=>{
      for(let vi=0;vi<this.viruses.length;vi++){const v=this.viruses[vi];if(dist(e,v)<v.r+e.r*0.6){const dx=v.x-e.x,dy=v.y-e.y,len=Math.hypot(dx,dy)||1;v.vx+=(dx/len)*6;v.vy+=(dy/len)*6;v.r=Math.min(v.r+EJECT_R*0.7,VIRUS_MAX_R);v.hits=(v.hits||0)+1;if(v.r>=VIRUS_SPLIT_R&&this.viruses.length<VIRUS_COUNT+6){const ang=Math.random()*Math.PI*2;v.r=VIRUS_FEED_R;this.viruses.push({id:uid(),x:v.x+Math.cos(ang)*VIRUS_FEED_R*2,y:v.y+Math.sin(ang)*VIRUS_FEED_R*2,r:VIRUS_FEED_R,pulseT:Math.random()*Math.PI*2,vx:Math.cos(ang)*8,vy:Math.sin(ang)*8,hits:0});}return false;}}return true;
    });
    const hitV=new Set();
    plist.forEach(p=>{p.pieces.forEach(pc=>{this.viruses.forEach((v,vi)=>{if(!hitV.has(vi)&&pc.r>v.r*1.1&&dist(pc,v)<pc.r*0.82){hitV.add(vi);const splits=clamp(Math.floor(pc.r/22),2,MAX_PIECES-p.pieces.length+1);if(splits<2)return;const nr=pc.r/Math.sqrt(splits);pc.r=nr;pc.mergeTimer=calcMergeTime(nr);for(let k=1;k<splits&&p.pieces.length<MAX_PIECES;k++){const ang=Math.random()*Math.PI*2;p.pieces.push(this._mkPiece(pc.x,pc.y,nr,Math.cos(ang)*SPLIT_SPEED*.8,Math.sin(ang)*SPLIT_SPEED*.8,calcMergeTime(nr)));}}});});});
    if(hitV.size>0){this.viruses=this.viruses.filter((_,i)=>!hitV.has(i));this._spawnViruses();}
    for(let i=0;i<plist.length;i++){for(let j=0;j<plist.length;j++){if(i===j)continue;const a=plist[i],b=plist[j];if(b._powerups&&b._powerups.shield>0)continue;a.pieces.forEach(ap=>{b.pieces=b.pieces.filter(bp=>{if(ap.r<bp.r*1.08)return true;if(dist(ap,bp)<ap.r*0.72){ap.r=Math.min(Math.sqrt(ap.r*ap.r+bp.r*bp.r*0.55),290);a.score+=Math.floor(bp.r*8);if(!b.isBot&&b.pieces.length===1){b.dead=true;this._emit("eaten",{by:a.name,score:b.score,isBot:a.isBot,dx:bp.x,dy:bp.y,killerId:a.id,victimId:b.id});}return false;}return true;});});if(b.isBot&&b.pieces.length===0){b.score=Math.floor(b.score*0.3);const sx=400+Math.random()*(WORLD_W-800),sy=400+Math.random()*(WORLD_H-800);b.pieces=[this._mkPiece(sx,sy,22+Math.random()*10,0,0,0)];}}}
    this.missiles.forEach(m=>{const target=this.players[m.targetId];if(target&&!target.dead){const tx=this._cx(target),ty=this._cy(target),dx=tx-m.x,dy=ty-m.y,len=Math.hypot(dx,dy)||1;m.vx=lerp(m.vx,(dx/len)*20,0.1);m.vy=lerp(m.vy,(dy/len)*20,0.1);}m.x=clamp(m.x+m.vx,0,WORLD_W);m.y=clamp(m.y+m.vy,0,WORLD_H);m.life--;});
    const deadM=new Set();
    this.missiles.forEach((m,mi)=>{if(deadM.has(mi))return;const target=this.players[m.targetId];if(!target||target.dead){deadM.add(mi);return;}for(const pc of target.pieces){if(dist(m,pc)<pc.r+m.r){deadM.add(mi);for(let k=0;k<4;k++)this._splitPlayer(target,pc.x+(Math.random()-.5)*40,pc.y+(Math.random()-.5)*40);break;}}});
    this.missiles=this.missiles.filter((_,i)=>!deadM.has(i)&&_.life>0);
    plist.forEach(p=>{if(p._powerups){for(const t in p._powerups){p._powerups[t]--;if(p._powerups[t]<=0)delete p._powerups[t];}}});
    const lb=Object.values(this.players).filter(p=>!p.dead).map(p=>{const mass=Math.round(p.pieces.reduce((s,pc)=>s+pc.r*pc.r,0));return{name:p.name,mass,score:p.score,isBot:p.isBot};}).sort((a,b)=>b.mass-a.mass).slice(0,10);
    this._spawnViruses();
    this._emit("tick",{players:this.players,food:this.food,viruses:this.viruses,ejected:this.ejected,missiles:this.missiles,leaderboard:lb});
  }
}

// ── ROOM ──────────────────────────────────────────────────────────────────────
class Room{
  constructor(id){
    this.id=id;
    this.clients=new Map(); // playerId -> ws
    this.server=new GameServer();
    this.server.on('tick',data=>{
      const msg=JSON.stringify({type:'tick',...data});
      for(const ws of this.clients.values())if(ws.readyState===1)ws.send(msg);
    });
    this.server.on('eaten',data=>{
      const msg=JSON.stringify({type:'eaten',...data});
      for(const ws of this.clients.values())if(ws.readyState===1)ws.send(msg);
    });
    this.server.start();
  }
  join(ws,data){
    this.clients.set(data.id,ws);
    const onState=d=>{if(ws.readyState===1)ws.send(JSON.stringify({type:'gameState',...d}));this.server.off('gameState',onState);};
    this.server.on('gameState',onState);
    this.server.clientSend('join',data);
  }
  relay(ev,data){this.server.clientSend(ev,data);}
  leave(playerId){
    this.clients.delete(playerId);
    delete this.server.players[playerId];
    if(this.clients.size===0&&Object.keys(this.server.players).filter(id=>!this.server.players[id].isBot).length===0)
      setTimeout(()=>{if(this.clients.size===0)this.server.stop();},30000);
  }
  get humanCount(){return this.clients.size;}
  isFull(){return this.humanCount>=ROOM_MAX;}
}

// ── ROOM MANAGER ──────────────────────────────────────────────────────────────
const rooms=[];
function findOrCreateRoom(){
  for(const room of rooms)if(!room.isFull())return room;
  const room=new Room('room_'+rooms.length);
  rooms.push(room);
  console.log(`New room created: ${room.id} (total rooms: ${rooms.length})`);
  return room;
}

// ── HTTP SERVER ───────────────────────────────────────────────────────────────
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.ico':'image/x-icon'};
const httpServer=http.createServer((req,res)=>{
  const filePath=path.join(__dirname,req.url==='/'?'index.html':req.url.split('?')[0]);
  fs.readFile(filePath,(err,data)=>{
    if(err){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(filePath)]||'text/plain'});
    res.end(data);
  });
});

// ── WEBSOCKET SERVER ──────────────────────────────────────────────────────────
const wss=new WebSocket.Server({server:httpServer});
const playerRoom=new Map();

wss.on('connection',ws=>{
  let playerId=null,room=null;
  ws.on('message',rawMsg=>{
    let msg;try{msg=JSON.parse(rawMsg);}catch{return;}
    const{type,...data}=msg;
    if(type==='join'){
      playerId=data.id;
      room=findOrCreateRoom();
      playerRoom.set(playerId,room);
      room.join(ws,data);
      console.log(`Player joined room ${room.id} (${room.humanCount}/${ROOM_MAX} humans)`);
    }else if(room&&playerId){
      room.relay(type,{...data,id:playerId});
    }
  });
  ws.on('close',()=>{
    if(room&&playerId){
      room.leave(playerId);
      playerRoom.delete(playerId);
      console.log(`Player left room ${room.id} (${room.humanCount}/${ROOM_MAX} humans)`);
    }
  });
});

const PORT=process.env.PORT||3000;
httpServer.listen(PORT,()=>console.log(`planet.io running on http://localhost:${PORT}`));

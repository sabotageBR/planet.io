// ── SERVIDOR LOCAL (na página): World do shared + bots, codificado com o codec real ───────────
// Serve para ?local=1 (sem servidor), modo offline do app e ?bench. Entrega um socket falso com a
// mesma interface do WebSocket (onopen/onmessage/onclose/send/close), então a Connection não sabe
// a diferença. Mensagens: room/error/dead/rewards (JSON) e SNAPSHOT/PLAYERS/LEADERBOARD/EVENT/PONG
// (binário). AOI por sessão = viewRect da câmera + NET.AOI_PAD (histerese AOI_PAD_OUT), `known` por id
// com último estado quantizado (UPDATE só se mudou). ?lag=<ms> simula latência nos dois sentidos.
import {createWriter,encodeSnapshot,encodePlayers,encodeLeaderboard,encodeEvent,encodePong,decodeInput,
  MSG,KIND,PIECE_FLAG,PLAYER_FLAG,SELF_FLAG,POWER_BIT,UPD,REMOVE,EVENT,INPUT_FLAG,PROTOCOL_VERSION,
  WORLD,TICK_HZ,DT,SNAPSHOT_EVERY,LEADERBOARD_EVERY,ROOM,ROUND,PLAYER,BOT,BOT_NAMES,NET,BLACKHOLE,MISSILE,SKINS,FOOD,STAR,
  focusOf,zoomFor,viewRect,rectHas,qPos,qR,qV,createRng,SCORE_COINS,clamp,packDir} from "@planet/shared";
import {createWorld,applySplit,liveCount,firstLive} from "@planet/shared/physics/index.js";

const seqNewer=(a,b)=>b<0||(((a-b)&0xFFFF)>0&&((a-b)&0xFFFF)<0x8000);
export function createLocalServer({seed=7,bots=ROOM.BOTS,bench=false,lag=0,food=FOOD.COUNT,code="0LOC",roundTicks=ROUND.TICKS}={}){
  const w=createWorld({seed,food:bench?Math.max(food,1800):food,holes:BLACKHOLE.COUNT});
  const rng=createRng(seed*7+1),writer=createWriter(1<<16),meta=new Map(),sessions=new Set(),brains=new Map();
  let nextSlot=0,timer=0,acc=0,last=0,playersDirty=true,running=false,over=false;   // over: a rodada acabou (mundo explodido)
  const reasonMap=new Map();
  // ── bots ──
  function addBot(x=NaN,y=NaN){const slot=nextSlot++;const r=rng.range(PLAYER.BOT_R[0],PLAYER.BOT_R[1]);w.addPlayer(slot,{x,y,r,isBot:true,missiles:rng.chance(.3)?1:0});
    meta.set(slot,{slot,name:BOT_NAMES[slot%BOT_NAMES.length]+(slot>=BOT_NAMES.length?"-"+slot:""),skinId:rng.int(0,34),isBot:true,registered:false});
    brains.set(slot,{think:0,st:"wander",tgt:-1,tx:w.w/2,ty:w.h/2});playersDirty=true;return slot;}
  function botThink(slot,b){const ps=w.players.get(slot);if(!ps||!ps.alive)return;const c=firstLive(ps.pieces);if(!c)return;b.think--;
    if(b.think<=0){b.think=rng.int(BOT.THINK_TICKS[0],BOT.THINK_TICKS[1]);const mass=w.massOf(slot);let threat=-1,prey=-1,td=1e18,pd=1e18;
      for(const o of w.players.values()){if(o.slot===slot||!o.alive)continue;const op=firstLive(o.pieces);if(!op)continue;const om=w.massOf(o.slot),dx=op.x-c.x,dy=op.y-c.y,d2=dx*dx+dy*dy;
        if(om>mass*BOT.FLEE_RATIO&&d2<BOT.FLEE_DIST*BOT.FLEE_DIST&&d2<td){td=d2;threat=o.slot;}
        else if(mass>om*BOT.HUNT_RATIO&&d2<BOT.HUNT_DIST*BOT.HUNT_DIST&&d2<pd){pd=d2;prey=o.slot;}}
      if(threat>=0){b.st="flee";b.tgt=threat;}else if(prey>=0){b.st="hunt";b.tgt=prey;}else{b.st="wander";b.tx=rng.range(150,w.w-150);b.ty=rng.range(150,w.h-150);}}
    if(b.st==="flee"||b.st==="hunt"){const o=w.players.get(b.tgt),op=o&&o.alive?firstLive(o.pieces):null;
      const sh=c.shieldLv>0;   // com escudo não atira nem divide (preserva o escudo; o escudo é por peça — vale o da que atira)
      if(!op)b.st="wander";else if(b.st==="flee"){b.tx=c.x*2-op.x;b.ty=c.y*2-op.y;if(!sh&&ps.missiles&&rng.chance(BOT.FIRE_P))w.requestFire(slot);}
      else{b.tx=op.x;b.ty=op.y;if(!sh&&ps.missiles&&rng.chance(BOT.FIRE_P*.8))w.requestFire(slot);
        const d=Math.hypot(op.x-c.x,op.y-c.y);if(!sh&&d<c.r*3.2&&c.r>op.r*1.5&&liveCount(ps.pieces)<BOT.MAX_PIECES&&rng.chance(BOT.SPLIT_P))w.requestSplit(slot);}}
    else if(b.think%5===0){let bf=null,bd=BOT.FOOD_DIST*BOT.FOOD_DIST;const q=[];const n=w.foodGrid.query(c.x,c.y,BOT.FOOD_DIST,q);
      for(let i=0;i<n;i++){const f=w.food[q[i]];if(!f||f.dead)continue;const dx=f.x-c.x,dy=f.y-c.y,d2=dx*dx+dy*dy;if(d2<bd){bd=d2;bf=f;}}if(bf){b.tx=bf.x;b.ty=bf.y;}}
    for(const h of w.holes){const ri=h.r*BLACKHOLE.INFLUENCE*h.k,dx=c.x-h.x,dy=c.y-h.y;if(h.k>.3&&dx*dx+dy*dy<ri*ri*BOT.HOLE_AVOID*BOT.HOLE_AVOID){b.tx=c.x+dx*3;b.ty=c.y+dy*3;}}
    for(const st of w.stars){const ri=st.r*STAR.HALO,dx=c.x-st.x,dy=c.y-st.y;if(st.k>=STAR.ARM_K&&dx*dx+dy*dy<ri*ri*BOT.HOLE_AVOID*BOT.HOLE_AVOID){b.tx=c.x+dx*3;b.ty=c.y+dy*3;}}
    w.setTarget(slot,clamp(b.tx,40,w.w-40),clamp(b.ty,40,w.h-40));}
  for(let i=0;i<bots;i++)addBot();
  // ── sessões ──
  function mkSocket(){const sock={readyState:0,binaryType:"arraybuffer",onopen:null,onmessage:null,onclose:null,onerror:null,
    send(data){if(sock.readyState!==1)return;const d=typeof data==="string"?data:(data.buffer?data.slice().buffer:data);defer(()=>recv(sock,d));},
    close(){if(sock.readyState>=2)return;sock.readyState=3;drop(sock);defer(()=>sock.onclose&&sock.onclose({code:1000}));}};
    defer(()=>{sock.readyState=1;sock.onopen&&sock.onopen({});start();});return sock;}
  const defer=lag>0?fn=>setTimeout(fn,lag/2):fn=>queueMicrotask(fn);
  const deliver=(sock,data)=>{if(sock.readyState!==1)return;defer(()=>{if(sock.readyState===1&&sock.onmessage)sock.onmessage({data});});};
  const sendJson=(sock,o)=>deliver(sock,JSON.stringify(o));
  const sendBin=(sock,u8)=>deliver(sock,u8.slice().buffer);
  function sessOf(sock){for(const s of sessions)if(s.sock===sock)return s;return null;}
  function drop(sock){const s=sessOf(sock);if(!s)return;sessions.delete(s);if(s.slot>=0){w.removePlayer(s.slot);meta.delete(s.slot);playersDirty=true;}if(!sessions.size)stopLoop();}
  function recv(sock,d){const s=sessOf(sock);
    if(typeof d==="string"){let m=null;try{m=JSON.parse(d);}catch{return;}
      if(m.t==="join"||m.t==="resume"){let sess=s;
        if(!sess&&m.t==="resume")for(const o of sessions)if("local-"+o.slot===m.sessionId){sess=o;sess.sock=sock;break;}   // religa a sessão caída
        if(!sess){sess={sock,slot:-1,known:new Map(),lastSeq:-1,ackSeq:0,view:{w:1280,h:720},dead:false,kills:0,maxMass:0,startTick:w.tick,name:"",skinId:0};sessions.add(sess);}
        if(m.view)sess.view=m.view;if(m.t==="join"){sess.name=(m.fallbackNick||"Viajante").slice(0,16);sess.skinId=m.skinId|0;}
        if(sess.slot<0){sess.slot=nextSlot++;spawn(sess);}else if(m.t==="join"&&sess.dead){spawn(sess);}
        sendJson(sock,{t:"room",code,shard:0,slot:sess.slot,sessionId:"local-"+sess.slot,resumeToken:"local",protocol:PROTOCOL_VERSION,tick:w.tick,world:{w:w.w,h:w.h},
          round:{start:0,ticks:roundTicks,dayStart:ROUND.DAY_START_H,breakMs:ROUND.BREAK_MS}});
        sess.known.clear();sendBin(sock,encodePlayers(writer,playerList()));return;}
      if(!s)return;
      if(m.t==="view"){s.view={w:m.w,h:m.h};}
      else if(m.t==="ping"){sendBin(sock,encodePong(writer,{clientTime:m.c>>>0,serverTick:w.tick}));}
      return;}
    if(!s||s.slot<0)return;let inp=null;try{inp=decodeInput(d);}catch{return;}
    if(!seqNewer(inp.seq,s.lastSeq))return;s.lastSeq=inp.seq;s.ackSeq=inp.seq;
    const ps=w.players.get(s.slot);if(!ps||!ps.alive)return;w.setTarget(s.slot,inp.tx,inp.ty);
    if(inp.flags&INPUT_FLAG.SPLIT)w.requestSplit(s.slot);if(inp.flags&INPUT_FLAG.EJECT)w.requestEject(s.slot);if(inp.flags&INPUT_FLAG.FIRE)w.requestFire(s.slot,!!(inp.flags&INPUT_FLAG.AIM));
    w.setEjectHold(s.slot,!!(inp.flags&INPUT_FLAG.EJECT_HOLD));}
  function spawn(sess){const slot=sess.slot;meta.set(slot,{slot,name:sess.name,skinId:sess.skinId,isBot:false,registered:false});sess.dead=false;sess.kills=0;sess.maxMass=0;sess.startTick=w.tick;
    if(bench){const x=w.w/2,y=w.h/2;w.addPlayer(slot,{x,y,r:190,missiles:3});const ps=w.players.get(slot);ps.tx=x+300;ps.ty=y+120;
      for(let i=0;i<3;i++)applySplit(w,ps);ps.splitCdUntil=0;
      let i=0;for(const b of brains.keys()){const a=i/brains.size*6.283,d=900+(i%3)*400;const bp=w.players.get(b);if(bp)w.respawnPlayer(b,{x:x+Math.cos(a)*d,y:y+Math.sin(a)*d,r:40+(i%4)*12});i++;}
      w.holes.forEach((h,j)=>{h.x=x+Math.cos(j*2.1)*1100;h.y=y+Math.sin(j*2.1)*900;h.type=1;h.k=1;h.life=w.tick+5000;});
      w.asteroids.forEach((a,j)=>{if(j%2)return;a.x=x+Math.cos(j*.7)*(500+j*40);a.y=y+Math.sin(j*.7)*(400+j*30);});}
    else w.addPlayer(slot,{missiles:0});playersDirty=true;}
  function playerList(){const out=[];for(const [slot,m] of meta){const ps=w.players.get(slot);out.push({slot,flags:(m.isBot?PLAYER_FLAG.BOT:0)|(ps&&!ps.alive?PLAYER_FLAG.DEAD:0)|(m.registered?PLAYER_FLAG.REG:0),skinId:m.skinId,name:m.name,score:ps?ps.score:0});}return out;}
  // ── passo ──
  function start(){if(running)return;running=true;last=performance.now();acc=0;timer=setInterval(loop,8);}
  function stopLoop(){running=false;clearInterval(timer);timer=0;}
  function loop(){const now=performance.now();acc+=Math.min(250,now-last);last=now;let n=0;while(acc>=1000/TICK_HZ&&n<5){acc-=1000/TICK_HZ;step();n++;}}
  /** Fim do mundo local: placar por massa viva (campeão = 1º) e `roundEnd` para as sessões. */
  function endRound(){if(over)return;over=true;
    const board=[];for(const [slot,m] of meta){const ps=w.players.get(slot);if(!ps||!ps.alive)continue;
      board.push({slot,name:m.name,mass:Math.round(w.massOf(slot)),score:ps.score,kills:0,isBot:m.isBot,registered:m.registered,skinId:m.skinId});}
    board.sort((a,b)=>b.mass-a.mass);
    for(const s of sessions)if(s.slot>=0&&!board.some(b=>b.slot===s.slot))board.push({slot:s.slot,name:s.name,mass:0,score:0,kills:s.kills,isBot:false,registered:false,skinId:s.skinId});
    const msg={t:"roundEnd",code,champion:board[0]||null,board:board.slice(0,20),nextInMs:ROUND.BREAK_MS,tick:w.tick};
    for(const s of sessions)if(s.slot>=0)sendJson(s.sock,msg);}
  function step(){if(over)return;if(w.tick>=roundTicks)return endRound();
    for(const [slot,b] of brains)botThink(slot,b);w.step();
    reasonMap.clear();const tick=w.tick;
    for(const ev of w.events){let e=null;
      switch(ev.type){
        case "EAT":reasonMap.set(ev.pieceId,REMOVE.EATEN);e={kind:EVENT.EAT,x:ev.x,y:ev.y,r:ev.r,slotA:ev.killerSlot,slotB:ev.victimSlot,extra:ev.lastPiece?1:0};
          for(const s of sessions)if(s.slot===ev.killerSlot&&ev.lastPiece)s.kills++;break;
        case "EJECT_EATEN":reasonMap.set(ev.ejectId,REMOVE.EATEN);break;
        case "MERGE":reasonMap.set(ev.mergedId,REMOVE.MERGED);e={kind:EVENT.MERGE,x:ev.x,y:ev.y,r:ev.r,slotA:ev.slot,slotB:0,extra:0};break;
        case "POP":reasonMap.set(ev.asteroidId,REMOVE.POPPED);e={kind:EVENT.POP,x:ev.x,y:ev.y,r:ev.r,slotA:ev.slot,slotB:0,extra:0};break;
        case "SPLIT":e={kind:EVENT.SPLIT,x:ev.x,y:ev.y,r:ev.r,slotA:ev.slot,slotB:0,extra:0};break;
        case "BH_SUCK":if(ev.destroyed)reasonMap.set(ev.pieceId,REMOVE.SUCKED);e={kind:EVENT.BH_SUCK,x:ev.fromX,y:ev.fromY,r:40,slotA:ev.slot,slotB:0,extra:ev.destroyed?1:0};break;
        case "EXIT":e={kind:EVENT.EXIT,x:ev.x,y:ev.y,r:ev.r,slotA:ev.slot,slotB:0,extra:0};break;
        case "CHIP":e={kind:EVENT.CHIP,x:ev.x,y:ev.y,r:ev.r,slotA:ev.slot,slotB:0,extra:packDir(ev.nx,ev.ny,0)};break;
        case "BOUNCE":e={kind:EVENT.BOUNCE,x:ev.x,y:ev.y,r:ev.r,slotA:0,slotB:0,extra:packDir(ev.nx,ev.ny,ev.vn)};break;
        case "BOOM":e={kind:EVENT.BOOM,x:ev.x,y:ev.y,r:ev.r,slotA:ev.slot,slotB:ev.bySlot,extra:0};break;
        case "SHOOT":e={kind:EVENT.SHOOT,x:ev.x,y:ev.y,r:36,slotA:0,slotB:0,extra:packDir(ev.nx,ev.ny,0)};break;
        case "SHIELD_BREAK":e={kind:EVENT.SHIELD_BREAK,x:ev.x,y:ev.y,r:ev.r,slotA:ev.slot,slotB:ev.bySlot<0?65535:ev.bySlot,extra:0};break;
        case "SHIELD_HIT":e={kind:EVENT.SHIELD_HIT,x:ev.x,y:ev.y,r:ev.r,slotA:ev.slot,slotB:ev.bySlot<0?65535:ev.bySlot,extra:packDir(ev.nx,ev.ny,ev.level)};break;
        case "SHIELD_UP":e={kind:EVENT.SHIELD_UP,x:ev.x,y:ev.y,r:ev.r,slotA:ev.slot,slotB:65535,extra:ev.level};break;
        case "CLASH":e={kind:EVENT.CLASH,x:ev.x,y:ev.y,r:ev.r,slotA:ev.slotA,slotB:ev.slotB,extra:0};break;
        case "DEFLECT":e={kind:EVENT.DEFLECT,x:ev.x,y:ev.y,r:ev.r,slotA:ev.bySlot<0?65535:ev.bySlot,slotB:65535,extra:packDir(ev.nx,ev.ny,0)};break;
        case "STAR_BURST":e={kind:EVENT.STAR_BURST,x:ev.x,y:ev.y,r:ev.r,slotA:ev.slot,slotB:65535,extra:ev.starId};break;
        case "SUPERNOVA":e={kind:EVENT.SUPERNOVA,x:ev.x,y:ev.y,r:ev.r,slotA:65535,slotB:65535,extra:ev.starId};break;
        case "PLAYER_DEAD":{const m=meta.get(ev.slot);
          if(m&&m.isBot){const ps=w.players.get(ev.slot);w.respawnPlayer(ev.slot,{score:Math.floor((ps?ps.score:0)*BOT.RESPAWN_SCORE)});const bp=w.players.get(ev.slot);if(bp)bp.missiles=rng.chance(.3)?1:0;playersDirty=true;}
          else for(const s of sessions)if(s.slot===ev.slot&&!s.dead){s.dead=true;playersDirty=true;const ps=w.players.get(ev.slot),by=meta.get(ev.bySlot),durationS=Math.round((tick-s.startTick)/TICK_HZ);
            const info={by:ev.cause==="blackhole"?"buraco negro":(by?by.name:"?"),byHole:ev.cause==="blackhole",score:ps?ps.score:0,maxMass:Math.round(s.maxMass),kills:s.kills,durationS};
            sendJson(s.sock,{t:"dead",...info});const coins=SCORE_COINS(info.score,info.kills,0,durationS);
            setTimeout(()=>sendJson(s.sock,{t:"rewards",saved:false,coinsEarned:coins,coins:null,achievements:[],skinsUnlocked:[],rank:{day:null}}),600);}
          e={kind:EVENT.DEATH,x:0,y:0,r:0,slotA:ev.slot,slotB:ev.bySlot<0?0:ev.bySlot,extra:0};break;}}
      if(e){const u8=encodeEvent(writer,e);for(const s of sessions)if(s.slot>=0&&(e.kind===EVENT.DEATH||!s.aoi||rectHas(s.aoi,e.x,e.y,e.r*3+200)))sendBin(s.sock,u8);}}
    if(playersDirty){playersDirty=false;const u8=encodePlayers(writer,playerList());for(const s of sessions)if(s.slot>=0)sendBin(s.sock,u8);}
    if(tick%SNAPSHOT_EVERY===0)for(const s of sessions)if(s.slot>=0)snapshot(s);
    if(tick%LEADERBOARD_EVERY===0){const rows=[];for(const slot of meta.keys()){const ps=w.players.get(slot);if(ps&&ps.alive)rows.push({slot,mass:Math.round(w.massOf(slot))});}
      rows.sort((a,b)=>b.mass-a.mass);const top=rows.slice(0,10);for(const s of sessions)if(s.slot>=0&&!top.some(r=>r.slot===s.slot)){const mine=rows.find(r=>r.slot===s.slot);if(mine)top.push(mine);}
      const u8=encodeLeaderboard(writer,top);for(const s of sessions)if(s.slot>=0)sendBin(s.sock,u8);}}
  // ── snapshot por sessão ──
  const cr=[],up=[],rm=[];
  function snapshot(s){const ps=w.players.get(s.slot),tick=w.tick,view=s.view;let cx,cy,scale;
    const alive=ps&&ps.alive?ps.pieces.filter(p=>!p.dead):[];
    if(alive.length){const f=focusOf(alive);cx=f.cx;cy=f.cy;scale=zoomFor(f.bigR,f.spread,view.h>view.w);s.cx=cx;s.cy=cy;s.scale=scale;s.maxMass=Math.max(s.maxMass,w.massOf(s.slot));}
    else{cx=s.cx==null?w.w/2:s.cx;cy=s.cy==null?w.h/2:s.cy;scale=s.scale||.42;}
    const rect=viewRect(cx,cy,scale,view.w,view.h,NET.AOI_PAD),out=viewRect(cx,cy,scale,view.w,view.h,NET.AOI_PAD_OUT);s.aoi=out;
    cr.length=up.length=rm.length=0;const known=s.known;let seenN=0;const stamp=tick;
    const visit=(b,rad)=>{if(b.dead)return;let k=known.get(b.id);
      if(!k){if(!rectHas(rect,b.x,b.y,rad))return;k={x:-1,y:-1,r:-1,vx:0,vy:0,flags:-1,phase:-1,ri:-1,seen:stamp};known.set(b.id,k);cr.push(toCreate(b,s.slot));setLast(k,b,s.slot);seenN++;return;}
      if(!rectHas(out,b.x,b.y,rad))return;k.seen=stamp;seenN++;
      const u=toUpdate(b,k,s.slot);if(u)up.push(u);};
    for(const b of w.pieces)visit(b,b.r);for(const b of w.food)visit(b,b.r);for(const b of w.ejected)visit(b,b.r);
    for(const b of w.asteroids)visit(b,b.r);for(const b of w.holes)visit(b,Math.max(b.r,b.r*BLACKHOLE.INFLUENCE*b.k));
    for(const b of w.stars)visit(b,b.r*STAR.HALO);for(const b of w.missiles)visit(b,b.r);
    for(const [id,k] of known)if(k.seen!==stamp){const body=w.entityById.get(id);rm.push({id,reason:body&&!body.dead?REMOVE.LEFT_AOI:(reasonMap.has(id)?reasonMap.get(id):REMOVE.DESPAWN)});known.delete(id);}
    let mt=0,sh=0;if(ps)for(const pc of ps.pieces){if(pc.dead)continue;const m=pc.magnetUntil-tick;if(m>mt)mt=m;if(pc.shieldLv>sh)sh=pc.shieldLv;}   // powerups por peça: o HUD leva o melhor
    const self=ps?{flags:ps.alive?0:SELF_FLAG.DEAD,missiles:ps.missiles,powerBits:(mt>0?POWER_BIT.magnet:0)|(sh>0?POWER_BIT.shield:0),
      magnetT:mt,shieldLv:sh,score:ps.score,splitCd:Math.max(0,ps.splitCdUntil-tick),ejectCd:Math.max(0,ps.ejectCdUntil-tick),
      rank:rankOf(s.slot),mass:Math.round(w.massOf(s.slot))}:undefined;
    sendBin(s.sock,encodeSnapshot(writer,{tick,ackSeq:s.ackSeq,creates:cr,updates:up,removes:rm,self}));}
  function rankOf(slot){const m=w.massOf(slot);let r=1;for(const o of meta.keys()){if(o===slot)continue;const ps=w.players.get(o);if(ps&&ps.alive&&w.massOf(o)>m)r++;}return r;}
  function toCreate(b,me){const c={kind:b.kind,id:b.id,x:b.x,y:b.y,r:b.r};
    switch(b.kind){
      case KIND.PIECE:c.owner=b.owner;c.vx=b.vx;c.vy=b.vy;c.flags=b.flags|(b.owner===me?PIECE_FLAG.ME:0);break;
      case KIND.FOOD:c.type=b.type;c.hue=b.hue;break;
      case KIND.EJECT:c.owner=b.owner;c.hue=b.hue;c.vx=b.vx;c.vy=b.vy;break;
      case KIND.ASTEROID:c.seed=Math.floor(b.seed*65535);c.vx=b.vx;c.vy=b.vy;c.hue=b.hue;break;   // hue não vai no fio (variante = seed%3 no cliente)
      case KIND.BLACKHOLE:c.seed=Math.floor(b.seed*65535);c.influenceR=Math.round(b.r*BLACKHOLE.INFLUENCE*b.k);c.phase=b.type;break;
      case KIND.STAR:c.seed=Math.floor(b.seed*65535);c.influenceR=Math.round(b.r*STAR.HALO*b.k);c.phase=b.type;break;
      case KIND.MISSILE:c.owner=b.owner;c.target=(b.type!==0||b.targetId<0)?65535:b.targetId;c.vx=b.vx;c.vy=b.vy;break;}
    return c;}
  const extraR=b=>b.kind===KIND.BLACKHOLE?Math.round(b.r*BLACKHOLE.INFLUENCE*b.k):b.kind===KIND.STAR?Math.round(b.r*STAR.HALO*b.k):0;
  function setLast(k,b,me){k.x=qPos(b.x,WORLD.w);k.y=qPos(b.y,WORLD.h);k.r=qR(b.r);k.vx=qV(b.vx);k.vy=qV(b.vy);k.flags=b.kind===KIND.PIECE?(b.flags|(b.owner===me?PIECE_FLAG.ME:0))&255:0;
    k.phase=b.type;k.ri=extraR(b);}
  function toUpdate(b,k,me){let mask=0;const x=qPos(b.x,WORLD.w),y=qPos(b.y,WORLD.h),r=qR(b.r),vx=qV(b.vx),vy=qV(b.vy);
    if(x!==k.x||y!==k.y)mask|=UPD.X_Y;if(r!==k.r)mask|=UPD.R;
    if(b.kind===KIND.PIECE||b.kind===KIND.EJECT||b.kind===KIND.ASTEROID||b.kind===KIND.MISSILE){if(vx!==k.vx||vy!==k.vy)mask|=UPD.V;}
    let flags=0;if(b.kind===KIND.PIECE){flags=(b.flags|(b.owner===me?PIECE_FLAG.ME:0))&255;if(flags!==k.flags)mask|=UPD.FLAGS;}
    let ri=0;if(b.kind===KIND.BLACKHOLE||b.kind===KIND.STAR){ri=extraR(b);if(ri!==k.ri||b.type!==k.phase)mask|=UPD.EXTRA;}
    if(!mask)return null;k.x=x;k.y=y;k.r=r;k.vx=vx;k.vy=vy;k.flags=flags;k.ri=ri;k.phase=b.type;
    const u={id:b.id,mask};if(mask&UPD.X_Y){u.x=b.x;u.y=b.y;}if(mask&UPD.R)u.r=b.r;if(mask&UPD.V){u.vx=b.vx;u.vy=b.vy;}if(mask&UPD.FLAGS)u.flags=flags;if(mask&UPD.EXTRA){u.phase=b.type;u.influenceR=ri;}return u;}
  return{world:w,code,
    /** Socket falso para a Connection (makeSocket). */
    connect(){return mkSocket();},
    get tick(){return w.tick;},
    stop(){stopLoop();sessions.clear();},
  };}

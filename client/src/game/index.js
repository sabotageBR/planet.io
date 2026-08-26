// ── MOTOR DO JOGO v2 (PixiJS) — createGame(), contrato do shell React ────────────────────────
//   createGame({container, hud, prefs, theme, onDead, onRewards, onConnection}) →
//     { join({token, fallbackNick, room, local?, skinId?}), leave(), setPrefs(p), setTheme(t), resize(), destroy(), hudStore }
//   hudStore (8 Hz): {mass,score,rank,coins:null,ammo,powerups:{magnet (s),shield (nível 0..3)},splitCd,ejectCd (0..1 restante),
//                    lb:[{slot,name,mass,isBot,registered,me,rank}],room,ping,fps,dead}
//   onConnection({state:'connecting'|'connected'|'reconnecting'|'closed'|'error', room?, attempt?, code?, message?})
// Fluxo por frame: ponteiro → alvo no mundo → InputSender (30 Hz) · Predictor (60 Hz, peças próprias, render
// interpolado entre passos) · Interpolator (outros, −100 ms; removidas somem com efeito via onVanish)
// · WorldView.build · Camera · Renderer (Pixi) · radar 10 Hz · HUD 8 Hz. EVENTs de terceiros esperam o
// atraso de interpolação; texturas das skins da sala são aquecidas ao receber PLAYERS.
// Dev: ?local=1 (servidor na página) · ?bench (pior caso + overlay) · ?stats (overlay) · ?lag=80 · ?theme=dawn|sunset|dusk
import {createStore} from "../state/store.js";
import {applyTheme,currentTheme,THEMES} from "../theme/index.js";
import {api} from "../api/client.js";
import {app as appStore} from "../state/app.js";
import {MSG,EVENT,SELF_FLAG,SPLIT,EJECT,TICK_HZ,KIND,REMOVE,unpackDir} from "@planet/shared";
import {createConnection} from "./net/Connection.js";
import {createInputSender} from "./net/InputSender.js";
import {createLocalServer} from "./net/LocalServer.js";
import {createSnapshotBuffer} from "./state/SnapshotBuffer.js";
import {createInterpolator} from "./state/Interpolator.js";
import {createPredictor} from "./state/Predictor.js";
import {createWorldView} from "./state/WorldView.js";
import {createRenderer} from "./renderer/Renderer.js";
import {createCamera} from "./renderer/Camera.js";
import {createPointer} from "./input/Pointer.js";
import {createKeyboard} from "./input/Keyboard.js";
import {createTouchButtons} from "./input/Touch.js";
import {createActions} from "./input/actions.js";
import {createMinimap} from "./hud/Minimap.js";
import {isBench,isStats,benchOptions,createOverlay,createFrameStats} from "./bench.js";
import {Q,qflag,bodyMode} from "./util.js";

const initialHud=()=>({mass:0,score:0,rank:0,coins:null,ammo:0,powerups:{speed:0,magnet:0,shield:0},splitCd:0,ejectCd:0,lb:[],room:null,ping:0,fps:0,dead:false});
const PREF_DEFAULTS={quality:"auto",showNames:true,showMass:true,showGrid:true,showMinimap:true,showFps:true,holdEject:true,rightSplit:true,reduceMotion:false};
const FX_OF={[EVENT.EAT]:"eat",[EVENT.POP]:"pop",[EVENT.MERGE]:"merge",[EVENT.SPLIT]:"split",[EVENT.BH_SUCK]:"suck",[EVENT.CHIP]:"chip",[EVENT.BOUNCE]:"bounce",[EVENT.BOOM]:"boom",[EVENT.EXIT]:"exit",[EVENT.SHOOT]:"shoot",
  [EVENT.DEATH]:"death",[EVENT.SHIELD_BREAK]:"shieldBreak",[EVENT.SHIELD_HIT]:"shieldHit",[EVENT.SHIELD_UP]:"shieldUp",[EVENT.CLASH]:"clash",[EVENT.DEFLECT]:"deflect"};
const DIR_EVENTS=new Set([EVENT.BOUNCE,EVENT.CHIP,EVENT.SHOOT,EVENT.DEFLECT,EVENT.SHIELD_HIT]);
const shardOf=code=>{const n=parseInt(String(code||"")[0],36);return Number.isFinite(n)?n:0;};

export function createGame({container,hud,prefs={},theme=null,onDead,onRewards,onConnection}){
  if(getComputedStyle(container).position==="static")container.style.position="absolute";
  Object.assign(container.style,{inset:"0",overflow:"hidden"});
  const hudStore=createStore(initialHud());
  let curPrefs={...PREF_DEFAULTS,...prefs},curTheme=theme||currentTheme();
  // ?theme= força um tema (dev/screenshots); o relógio do app pode tentar voltar — reaplica uma vez por evento
  const forced=Q.get("theme");let themeGuard=null;
  if(forced&&THEMES[forced]){curTheme=applyTheme(forced);themeGuard=e=>{if(e.detail&&e.detail.id!==forced)setTimeout(()=>applyTheme(forced),0);};addEventListener("planet:theme",themeGuard);}
  const onThemeEvent=e=>{if(e.detail&&e.detail.theme&&e.detail.theme!==curTheme)game.setTheme(e.detail.theme);};addEventListener("planet:theme",onThemeEvent);

  // ── estado de rede/simulação ──
  const buffer=createSnapshotBuffer();
  let conn=null,local=null,renderer=null,ready=false,joined=false,joinOpts=null,dead=false,visible=true,raf=0,lastT=0,selfTick=0,lastHud=0,frames=0,fpsT=0,fps=0,econ=false,slowSince=0,econAt=0,statsOv=null;
  const input=createInputSender({send:d=>conn&&conn.send(d),getTick:()=>predictor.localTick,getRtt:()=>conn?conn.rttAvg:0});
  const predictor=createPredictor({buffer,input});
  const interp=createInterpolator(buffer,{isOwn:e=>predictor.isOwn(e),onVanish});
  const view=createWorldView({buffer,predictor});
  const cam=createCamera(),fstats=createFrameStats();
  const canAct=()=>joined&&!dead&&conn&&conn.isOpen;
  const actions=createActions({input,prefs:()=>curPrefs,ammo:()=>(view.self?view.self.missiles:0),canAct});
  const keyboard=createKeyboard({onAction:actions.act,enabled:()=>joined});
  const touch=createTouchButtons(hud,{onAction:actions.act});
  let pointer=null;
  const minimap=createMinimap({hud,theme:()=>curTheme,getScene:()=>{if(!joined)return null;
    const players=[];const seenSlots=new Set();for(const p of view.pieces){if(seenSlots.has(p.owner)&&!p.isMe)continue;seenSlots.add(p.owner);const pl=view.playerOf(p.owner);players.push({x:p.rx,y:p.ry,isMe:!!p.isMe,isBot:pl?pl.isBot:false});}
    return{players,asteroids:view.asteroids.map(a=>({x:a.rx,y:a.ry})),holes:view.holes.map(h=>({x:h.rx,y:h.ry,ri:h.influenceR})),cam};}});
  minimap.show(false);
  if(isStats())statsOv=createOverlay(hud);

  // ── renderer (assíncrono: Pixi init) ──
  let destroyed=false;   // StrictMode destrói a 1ª instância com o init do Pixi ainda pendente: não pode sobrar um canvas zumbi
  createRenderer({container,theme:curTheme,prefs:{fx:!curPrefs.reduceMotion}}).then(r=>{if(destroyed){r.destroy();return;}renderer=r;ready=true;
    pointer=createPointer(r.canvas,{onButton:actions.button});applyQuality();r.setTheme(curTheme);r.resize();lastT=performance.now();warmSkins();
    if(!raf)raf=requestAnimationFrame(frame);}).catch(e=>{console.error("[game] renderer",e&&e.stack||e);container.innerHTML=`<div style="padding:20px;color:#fff">Não foi possível iniciar o renderizador (WebGL indisponível): ${e.message}</div>`;});
  const ro=typeof ResizeObserver!=="undefined"?new ResizeObserver(()=>game.resize()):null;if(ro)ro.observe(container);
  const onVis=()=>{visible=document.visibilityState!=="hidden";lastT=performance.now();if(visible){frames=0;fpsT=lastT;}};document.addEventListener("visibilitychange",onVis);

  // ── sumiço de entidades (Interpolator, no tempo de render): planeta comido explode, comida/pellet faísca ──
  function onVanish(e){if(!renderer)return;
    if(e.kind===KIND.PIECE){if(e.reason===REMOVE.EATEN||e.reason===REMOVE.SUCKED){const pl=view.playerOf(e.owner);renderer.fx.add("vanish",{x:e.rx,y:e.ry,r:e.rr,color:pl?pl.skin.color:null});}}
    else if((e.kind===KIND.FOOD||e.kind===KIND.EJECT)&&e.reason===REMOVE.EATEN){const pl=e.kind===KIND.EJECT?view.playerOf(e.owner):null;renderer.fx.spark(e.rx,e.ry,e.rr,pl?pl.skin.color:null);}}
  // ── texturas: aquece as skins da sala (tiers 128/256) e a própria (128/256/512, variante isMe) ──
  function warmSkins(){if(!renderer||!joined)return;const skins=[];let me=null;
    for(const pl of view.players.values()){if(!pl.skin)continue;if(pl.slot===view.mySlot)me=pl.skin;else if(!skins.includes(pl.skin))skins.push(pl.skin);}
    renderer.warmPlanets(skins,me);}
  // ── rede ──
  function viewSize(){return{w:Math.round(renderer?renderer.W:container.clientWidth||innerWidth),h:Math.round(renderer?renderer.H:container.clientHeight||innerHeight)};}
  function onOpenSend(c){if(c.session){buffer.clear();predictor.reset();c.sendJson({t:"resume",sessionId:c.session.sessionId,resumeToken:c.session.resumeToken,view:viewSize()});input.resend();}
    else c.sendJson({t:"join",token:joinOpts.token||null,room:joinOpts.room||null,view:viewSize(),fallbackNick:joinOpts.fallbackNick||"Viajante",skinId:joinOpts.skinId|0});}
  function onJson(m){
    if(m.t==="room"){view.mySlot=m.slot;predictor.setSlot(m.slot);view.room=m.code;view.rebuildLb();warmSkins();}
    else if(m.t==="dead"){dead=true;input.setHold(false);pushHud(performance.now());if(onDead)onDead({by:m.by,byHole:!!m.byHole,score:m.score,maxMass:m.maxMass,kills:m.kills,durationS:m.durationS});}
    else if(m.t==="rewards"){if(onRewards)onRewards(m);}}
  function onBinary(m){const now=performance.now();
    switch(m.type){
      case MSG.SNAPSHOT:buffer.apply(m,now);predictor.onSnapshot(m,conn.rttAvg);view.self=m.self;selfTick=m.tick;if(m.self.flags&SELF_FLAG.DEAD)dead=true;break;
      case MSG.PLAYERS:view.setPlayers(m.players);warmSkins();break;
      case MSG.LEADERBOARD:view.setLeaderboard(m.rows);break;
      case MSG.EVENT:{const kind=FX_OF[m.kind];if(!kind||!renderer)break;const f={x:m.x,y:m.y,r:m.r||10};
        if(DIR_EVENTS.has(m.kind)){const d=unpackDir(m.extra);f.nx=d.nx;f.ny=d.ny;f.power=Math.min(1,d.vn/480);if(m.kind===EVENT.SHIELD_HIT)f.level=d.vn;}
        else if(m.kind===EVENT.SHIELD_UP)f.level=m.extra;
        const mine=m.slotA===view.mySlot||m.slotB===view.mySlot;   // o que envolve a própria peça (já à frente) não espera
        renderer.fx.add(kind,f,mine?0:interp.delayMs);break;}}}
  function onState(ev){if(ev.state==="connected"){game.resize();}
    if(onConnection)onConnection(ev);}
  function connectWith(makeSocket){conn=createConnection({makeSocket,onJson,onBinary,onState,onOpenSend});conn.open();}
  const game={hudStore,
    join({token,fallbackNick,room,local:useLocal,skinId}={}){
      game.leave(true);joined=true;dead=false;selfTick=0;
      const user=(appStore.get().session||{}).user||{};
      joinOpts={token,fallbackNick:fallbackNick||user.nick||"Viajante",room:room||null,skinId:skinId!=null?skinId:(user.equippedSkin|0)};
      buffer.clear();predictor.reset();interp.update(performance.now());view.reset();input.reset();cam.reset();hudStore.set({...initialHud(),room:room||null});minimap.show(curPrefs.showMinimap!==false);
      if(pointer&&renderer)pointer.center(renderer.W,renderer.H);
      const isLocal=useLocal||qflag("local")||isBench()||api.server===false;
      if(isLocal){local=createLocalServer(isBench()?benchOptions():{lag:+(Q.get("lag")||0),seed:+(Q.get("seed")||7)});connectWith(()=>local.connect());return;}
      const proto=location.protocol==="https:"?"wss":"ws";
      const go=shard=>{if(!joined)return;connectWith(()=>new WebSocket(`${proto}://${location.host}/ws/${shard}`));};
      if(room)go(shardOf(room));
      else fetch("/api/config",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(c=>go(c&&c.shard!=null?c.shard:0)).catch(()=>go(0));},
    leave(silent){if(conn){const c=conn;conn=null;c.close();}if(local){local.stop();local=null;}
      const was=joined;joined=false;dead=false;input.reset();input.setHold(false);buffer.clear();predictor.reset();view.reset();minimap.show(false);
      if(was&&!silent)hudStore.set({...initialHud()});},
    setPrefs(p){curPrefs={...curPrefs,...(p||{})};applyQuality();minimap.show(joined&&curPrefs.showMinimap!==false);if(renderer)renderer.R.prefs.fx=!curPrefs.reduceMotion;},
    setTheme(t){if(!t||t===curTheme)return;curTheme=t;if(renderer)renderer.setTheme(t);minimap.setTheme(t);},
    resize(){if(!renderer)return;renderer.resize();if(conn&&conn.isOpen&&joined){const v=viewSize();if(v.w!==game._vw||v.h!==game._vh){game._vw=v.w;game._vh=v.h;conn.sendJson({t:"view",w:v.w,h:v.h});}}},
    destroy(){destroyed=true;cancelAnimationFrame(raf);raf=0;game.leave(true);keyboard.destroy();touch.destroy();if(pointer)pointer.destroy();minimap.destroy();if(statsOv)statsOv.destroy();
      if(ro)ro.disconnect();document.removeEventListener("visibilitychange",onVis);removeEventListener("planet:theme",onThemeEvent);if(themeGuard)removeEventListener("planet:theme",themeGuard);
      if(renderer){renderer.destroy();renderer=null;}ready=false;},
    debug:{stats:()=>({conn,buffer,interp,predictor,view,cam,renderer,fstats}),local:()=>local},
  };

  // ── qualidade / modo econômico ──
  function applyQuality(){if(!renderer)return;const q=curPrefs.quality||"auto";
    if(q==="low")setEcon(true);else if(q==="high")setEcon(false);else if(!econ)setEcon(false);}
  function setEcon(on){econ=on;if(!renderer)return;renderer.setEcon(on);renderer.setResolution(on?1:Math.min(2,devicePixelRatio||1));}
  // frame > 20 ms por 2 s → econ; tenta sair após econBackoff (30 s; dobra até 5 min se voltar a ficar lento em < 5 s — sem "piscar" a nitidez)
  let econBackoff=30000,econLeftAt=-1e9;
  function econCheck(now,ms){if((curPrefs.quality||"auto")!=="auto")return;
    if(!econ){if(ms>20){if(!slowSince)slowSince=now;else if(now-slowSince>2000){if(now-econLeftAt<5000)econBackoff=Math.min(300000,econBackoff*2);setEcon(true);econAt=now;slowSince=0;}}else slowSince=0;}
    else if(now-econAt>econBackoff){setEcon(false);econAt=now;econLeftAt=now;}}

  // ── HUD (8 Hz) ──
  function pushHud(now){const s=view.self,tk=buffer.tickAt(now),el=Math.max(0,tk-selfTick);
    const cd=(v,max)=>s?Math.min(1,Math.max(0,(v-el)/max)):0,sec=v=>s?Math.max(0,(v-el)/TICK_HZ):0;
    hudStore.set({mass:s?s.mass:0,score:s?s.score:0,rank:s&&s.rank?s.rank:view.myRank(),coins:null,ammo:s?s.missiles:0,
      powerups:{magnet:sec(s?s.magnetT:0),shield:s?s.shieldLv|0:0},splitCd:cd(s?s.splitCd:0,SPLIT.COOLDOWN_TICKS),ejectCd:cd(s?s.ejectCd:0,EJECT.COOLDOWN_TICKS),
      lb:view.lb,room:view.room,ping:conn?Math.round(conn.rttAvg):0,fps,dead});}
  function statsText(){const c=renderer.counts(),st=predictor.stats;
    const net=conn?`rtt ${conn.rttAvg.toFixed(0)} ms · clock off ${Number.isNaN(buffer.offset)?"—":buffer.offset.toFixed(1)} tk (jit ${buffer.offsetJitter.toFixed(2)}) · interp ${interp.delayMs.toFixed(0)} ms (seco ${interp.dry}, extrap ${interp.extrap}) · bytes/s ${bytesRate.toFixed(0)} · msgs ${conn.msgsIn}`:"sem conexão";
    return`${isBench()?"BENCH":"STATS"} · ${renderer.kind} · ${bodyMode()} · ${fps} fps${econ?" · ECON":""}\nframe ${fstats.avgFrame.toFixed(2)} ms (update ${fstats.avgUpdate.toFixed(2)} + render ${fstats.avgRender.toFixed(2)}) · p95 ${fstats.p95.toFixed(2)}\n${net}\npred: corr média ${st.corrAvg.toFixed(1)} px · última ${st.lastCorr.toFixed(1)} px · replay ${st.replaySteps} tk · pend ${input.pending} · hist ${input.history.length} · seq ${input.sent}\nents: planetas ${c.planets} · comida ${c.food} · ejet ${c.ejected} · ast ${c.asteroids} · buracos ${c.holes} · mísseis ${c.missiles} · fx ${c.fx} · buffer ${buffer.entities.size}\ndraw calls ≈ ${renderer.drawCallsEstimate()} · texturas ${c.textures} (${c.texMB} MB) · res ${renderer.R.res.toFixed(2)} · ${renderer.W}×${renderer.H}`;}
  let bytesRate=0,bytesLast=0,bytesT=0,themeAt=0,own0=[];

  // ── laço ──
  function frame(now){raf=requestAnimationFrame(frame);if(!ready)return;
    const dt=Math.min(.1,Math.max(0,(now-lastT)/1000));lastT=now;const t0=performance.now();
    frames++;if(now-fpsT>1000){fps=Math.round(frames*1000/(now-fpsT));frames=0;fpsT=now;}
    if(forced&&document.documentElement.dataset.theme!==forced&&now-themeAt>500){themeAt=now;applyTheme(forced);}
    if(renderer.R.theme!==curTheme)renderer.setTheme(curTheme);
    if(joined&&conn){if(!dead){let w=null;if(pointer&&pointer.state.active)w=cam.toWorld(pointer.state.sx,pointer.state.sy);
        else if(own0.length){w={x:0,y:0};for(const p of own0){w.x+=p.rx/own0.length;w.y+=p.ry/own0.length;}}   // sem ponteiro ainda: fica parado
        if(w){input.setTarget(w.x,w.y);predictor.setTarget(w.x,w.y);}}
      if(conn.isOpen&&!dead)input.update(now);}
    predictor.update(dt);interp.update(now);view.build();
    const own=[];predictor.forEach(pc=>own.push(pc));own0=own;cam.W=renderer.W;cam.H=renderer.H;cam.update(own,dt,bodyMode()==="portrait");
    const t1=performance.now();
    renderer.render({view,cam,now,dt,t:now,rt:interp.renderTick,rect:cam.rect(.05),parallax:!curPrefs.reduceMotion,showGrid:curPrefs.showGrid!==false,
      showNames:curPrefs.showNames!==false,showMass:curPrefs.showMass!==false,showTrails:!curPrefs.reduceMotion});
    const t2=performance.now();fstats.push(t1-t0,t2-t1);econCheck(now,t2-t0);
    if(joined){minimap.update(now);if(now-lastHud>=125){lastHud=now;pushHud(now);}}
    if(statsOv){if(now-bytesT>1000){bytesRate=conn?(conn.bytesIn-bytesLast)*1000/(now-bytesT):0;bytesLast=conn?conn.bytesIn:0;bytesT=now;}statsOv.update(now,statsText());}}
  return game;}

// ── MOTOR DO JOGO v2 (PixiJS) — createGame(), contrato do shell React ────────────────────────
//   createGame({container, hud, prefs, theme, onDead, onRewards, onConnection}) →
//     { join({token, fallbackNick, room, local?, skinId?}), leave(), setPrefs(p), setTheme(t), resize(), destroy(), hudStore }
//   hudStore (8 Hz): {mass,score,rank,coins:null,ammo,powerups:{magnet (s),shield (nível 0..3)},splitCd,ejectCd (0..1 restante),
//                    lb:[{slot,name,mass,isBot,registered,me,rank}],room,ping,fps,dead}
//   onConnection({state:'connecting'|'connected'|'reconnecting'|'closed'|'error', room?, attempt?, code?, message?})
//   onRoundEnd({code, champion, board, nextInMs}) — o mundo explodiu: a sala acabou e o shell mostra o placar
//   hudStore.clock: {h,m,leftS} do relógio do espaço (a rodada inteira = um dia; o tema segue essa hora)
// Absorção: no EVENT.EAT a vítima é sugada para a peça de quem comeu (fx eat/vanish com destino) e o vencedor dá um
// "gulp" (renderer.planets.pop). Fim da rodada = BIG CRUNCH (o contrário do big bang), com o pódio na tela React.
// Tiro: segurar o botão esquerdo por ~160 ms arma a mira (reta pontilhada local + anel no alvo provável) e soltar
// dispara — mirado, o míssil persegue o objeto mais próximo dentro do cone da flecha; clique rápido é o tiro de sempre.
// Fluxo por frame: ponteiro → alvo no mundo → InputSender (30 Hz) · Predictor (60 Hz, peças próprias, render
// interpolado entre passos) · Interpolator (outros, −100 ms; removidas somem com efeito via onVanish)
// · WorldView.build · Camera · Renderer (Pixi) · radar 10 Hz · HUD 8 Hz. EVENTs de terceiros esperam o
// atraso de interpolação; texturas das skins da sala são aquecidas ao receber PLAYERS.
// Dev: ?local=1 (servidor na página) · ?bench (pior caso + overlay) · ?stats (overlay) · ?lag=80 · ?theme=dawn|sunset|dusk · ?round=<s>
import {createStore} from "../state/store.js";
import {applyTheme,currentTheme,THEMES,resolveThemeId} from "../theme/index.js";
import {warmFaces} from "../theme/faces.js";
import {mergeLabels} from "../ui/labels.js";   // o texto desenhado DENTRO do mundo (fx) também é texto de UI
import {createAudio} from "../audio/index.js";
import {api} from "../api/client.js";
import {app as appStore} from "../state/app.js";
import {setRoundHour} from "../state/game.js";
import {MSG,EVENT,SELF_FLAG,SPLIT,EJECT,TICK_HZ,KIND,REMOVE,ROUND,FEED,MISSILE,PLAYER,STAR,MODE,NET,POWERUP,aimScore,unpackDir} from "@warspace/shared";
import {createConnection} from "./net/Connection.js";
import {createInputSender} from "./net/InputSender.js";
import {createLocalServer} from "./net/LocalServer.js";
import {createMic} from "../audio/mic.js";
import {createSnapshotBuffer} from "./state/SnapshotBuffer.js";
import {createInterpolator} from "./state/Interpolator.js";
import {createPredictor} from "./state/Predictor.js";
import {createWorldView} from "./state/WorldView.js";
import {createRenderer} from "./renderer/Renderer.js";
import {createCamera} from "./renderer/Camera.js";
import {createPointer} from "./input/Pointer.js";
import {createJoystick} from "./input/Joystick.js";
import {createKeyboard} from "./input/Keyboard.js";
import {createTouchButtons} from "./input/Touch.js";
import {createActions} from "./input/actions.js";
import {createMinimap} from "./hud/Minimap.js";
import {isBench,isStats,benchOptions,createOverlay,createFrameStats} from "./bench.js";
import {Q,qflag,bodyMode} from "./util.js";

const initialHud=()=>({mass:0,score:0,rank:0,coins:null,ammo:0,powerups:{magnet:0,shield:0,autodef:0,zoom:0,feast:0},splitCd:0,ejectCd:0,lb:[],room:null,ping:0,fps:0,dead:false,clock:null,
  mode:MODE.FREE,teamSize:1,team:-1,phase:"live",startsInMs:0,alive:0,weapon:0,zoneHurt:false,talk:null,chat:[],feed:[],map:"",notice:null});
const PREF_DEFAULTS={quality:"auto",showNames:true,showGrid:true,showMinimap:true,showFps:true,holdEject:true,rightSplit:true,reduceMotion:false,
  keySplit:"Space",keyEject:"KeyW",
  sound:true,music:false,ambience:true,volume:70};   // som/música/ambiência/volume TÊM que estar aqui: são os mesmos padrões de state/app.js e sem eles o áudio caía num estado que ninguém escreveu
const SEM_SLOT=0xffff;   // `NO_SLOT` do fio: slot ausente num EVENT (o servidor o escreve em Sim.js)
const FX_OF={[EVENT.EAT]:"eat",[EVENT.POP]:"pop",[EVENT.MERGE]:"merge",[EVENT.SPLIT]:"split",[EVENT.BH_SUCK]:"suck",[EVENT.CHIP]:"chip",[EVENT.BOUNCE]:"bounce",[EVENT.BOOM]:"boom",[EVENT.EXIT]:"exit",[EVENT.SHOOT]:"shoot",
  [EVENT.DEATH]:"death",[EVENT.SHIELD_BREAK]:"shieldBreak",[EVENT.SHIELD_HIT]:"shieldHit",[EVENT.SHIELD_UP]:"shieldUp",[EVENT.CLASH]:"clash",[EVENT.DEFLECT]:"deflect",
  [EVENT.STAR_BURST]:"starBurst",[EVENT.SUPERNOVA]:"supernova",[EVENT.STAR_HIT]:"starHit",[EVENT.STAR_SPLIT]:"starSplit",[EVENT.SMASH]:"smash",
  [EVENT.ZONE_SHRINK]:"zoneShrink",[EVENT.ZONE_BURN]:"zoneBurn",[EVENT.STUCK]:"stuck"};
const AIM_LEN=1100;   // comprimento máximo da reta de mira (px de mundo)
const RESIZE_MS=150;   // debounce de todo caminho de resize (ver agendaResize)
const PREWARM_S=12;   // com quantos segundos de antecedência o céu seguinte é assado (fora da virada, para ela não custar nada)
const AIM_R2=MISSILE.AIM_RANGE*MISSILE.AIM_RANGE;
const MASS_STEP=1.6;   // de quanto em quanto a massa toca o carrilhão de "cresci" (marcos geométricos: sempre a mesma sensação de avanço)
const AMB_MS=200;      // a ambiência é reajustada 5×/s: ela responde a estado, não a evento
const DIR_EVENTS=new Set([EVENT.BOUNCE,EVENT.CHIP,EVENT.SHOOT,EVENT.DEFLECT,EVENT.SHIELD_HIT,EVENT.STAR_HIT,EVENT.SMASH]);
const shardOf=code=>{const n=parseInt(String(code||"")[0],36);return Number.isFinite(n)?n:0;};

export function createGame({container,hud,prefs={},theme=null,onDead,onRewards,onRoundEnd,onConnection}){
  if(getComputedStyle(container).position==="static")container.style.position="absolute";
  // Só `overflow`. O `inset:0` que ficava aqui era ESTILO INLINE: ganhava de qualquer folha, então era
  // impossível encolher a câmera por CSS — a gaveta lateral apenas COBRIA o canvas em vez de dividir a
  // tela com ele. O inset vem de base.css (`#game`), e ui.css o reduz pela largura da gaveta.
  container.style.overflow="hidden";
  const hudStore=createStore(initialHud());
  let curPrefs={...PREF_DEFAULTS,...prefs},curTheme=theme||currentTheme();
  const audio=createAudio(curPrefs);let lastAmmo=0,lastMagnet=false;   // som: o que o cliente descobre sozinho (atirar/munição/ímã) sai do self
  let lastMass=0,marco=0,lastFireCd=0,lastDead=false,lastLock=-1,ambT=0,threat=null;   // marcos de massa, arma pronta, dano, troca de alvo e a ameaça do míssil
  let ejHold=false,ejT=0,ejN=0;   // cusparada: o som sai do gesto local (não há evento no fio), com a rampa de força junto
  const wakeAudio=()=>audio.resume();   // fica armado: o contexto pode ser suspenso de novo (aba em segundo plano, política do navegador)
  if(typeof addEventListener==="function"){addEventListener("pointerdown",wakeAudio);addEventListener("keydown",wakeAudio);}
  // ?theme= força um tema (dev/screenshots); o relógio do app pode tentar voltar — reaplica uma vez por evento
  const forced=Q.get("theme");let themeGuard=null;
  if(forced&&THEMES[forced]){curTheme=applyTheme(forced);themeGuard=e=>{if(e.detail&&e.detail.id!==forced)setTimeout(()=>applyTheme(forced),0);};addEventListener("warspace:theme",themeGuard);}
  const onThemeEvent=e=>{if(e.detail&&e.detail.theme&&e.detail.theme!==curTheme)game.setTheme(e.detail.theme);};addEventListener("warspace:theme",onThemeEvent);

  // ── estado de rede/simulação ──
  const buffer=createSnapshotBuffer();
  const alvo={x:0,y:0};let inputTimer=0,joy=null;
  // o analógico só vale onde o ponteiro é o DEDO: no mouse o próprio ponteiro já é o controle
  const aplicaJoystick=()=>{if(joy)joy.setEnabled(curPrefs.joystick!==false&&typeof matchMedia!=="undefined"&&matchMedia("(pointer: coarse)").matches);};   // alvo reusado; inputTimer: o envio de input não depende do rAF (ver enviarInput)
  // "" = fechado · "map" = o RADAR ampliado · "live" = a visão em TEMPO REAL da sala (o mesmo radar, ocupando
  // o espaço todo, com o blip na cor da skin, nome e massa, e a posição INTERPOLADA entre as amostras de 2 Hz).
  // Só faz sentido MORTO: com o jogador vivo, ver a sala inteira seria vantagem tática.
  let mapOn="";
  let conn=null,local=null,renderer=null,ready=false,joined=false,joinOpts=null,dead=false,specSlot=-1,visible=true,raf=0,lastT=0,selfTick=0,lastHud=0,frames=0,fpsT=0,fps=0,econ=false,econLevel=0,slowSince=0,econAt=0,statsOv=null;
  let round=null,roundOver=false,roundClock=null,lastCount=-1,warmedSky=null;   // rodada: {start,ticks,dayStart,breakMs} do JSON `room`
  // ── modo, equipe, zona, chat e voz ──
  let modeId=MODE.FREE,teamSize=1,myTeam=-1,phase="live",startsAt=0,roomCap=0,lobby=null,spec=null;   // `lobby` = o estado da tela de espera (JSON `lobby`, em ms)
  let zone=null,zoneShown={x:0,y:0,r:0},lastShrink=0,lastHurt=false,lobbyBeep=false;   // `zone` = o par de círculos do fio; `zoneShown` é o interpolado do frame
  /** @type {{slot:number,name:string,team:number|null,text:string,at:number}[]} */let chatLog=[];
  /** @type {{id:number,at:number,k:string,how:string,n:number,a:object|null,b:object|null,assist:object|null,mine:boolean}[]} */
  let feedLog=[],feedSeq=0;
  const mic=createMic({audio,send:d=>conn&&conn.send(d),onState:st=>{hudStore.update(h=>({...h,talk:st}));},
    // O ícone de "falando" tem que acender no INSTANTE do Ctrl, não quando o áudio chega (o clipe só sai ao
    // soltar a tecla). Vai como JSON de controle: o servidor repassa para os mesmos ouvintes do clipe.
    onTalk:on=>{if(conn&&conn.isOpen&&joined)conn.sendJson({t:"talk",on:!!on});
      if(view.mySlot>=0)view.setTalking(view.mySlot,on);}});
  const input=createInputSender({send:d=>conn&&conn.send(d),getTick:()=>predictor.localTick,getRtt:()=>conn?conn.rttAvg:0});
  const predictor=createPredictor({buffer,input});
  const interp=createInterpolator(buffer,{isOwn:e=>predictor.isOwn(e),onVanish});
  const view=createWorldView({buffer,predictor});
  const cam=createCamera(),fstats=createFrameStats();
  const canAct=()=>joined&&!dead&&!roundOver&&conn&&conn.isOpen;
  let aiming=false,aim=null;const pendingEat=new Map();   // id da peça comida → id de quem comeu (destino da sucção no frame do sumiço)
  let travado=-1,travadoAte=0;   // o alvo do último tiro mirado e até quando o anel continua na tela (MISSILE.AIM_HOLD_TICKS)
  const actions=createActions({input,prefs:()=>curPrefs,ammo:()=>(view.self&&!view.self.fireCd?view.self.missiles:0),canAct,
    onAim:on=>{aiming=on;if(!on){aim=null;lastLock=-1;audio.stopLoop("aimCharge");}else audio.startLoop("aimCharge",{k:0});},
    onCancel:()=>audio.play("cancel",{mine:true})});
  /** Envelope das ações: repassa tudo e, de quebra, marca o hold do W para o som da cusparada. */
  const somEject=()=>{const m=view.self?view.self.mass:0;
    if(m<EJECT.MIN_R*EJECT.MIN_R)return;   // pequeno demais para cuspir (applyEject recusa): não pode sair som de uma cusparada que não houve
    audio.play("eject",{mine:true,pitch:pitchOf(m)});};
  const act=(a,ph)=>{
    if(a==="eject"){if(ph==="down"){if(canAct()){ejHold=curPrefs.holdEject!==false;ejN=0;ejT=performance.now();somEject();}}
      else ejHold=false;}
    // PUSH-TO-TALK: segurar grava, soltar manda. Não passa pelo `actions` porque não é ação de jogo —
    // não vira flag de INPUT nem é predita; é uma mensagem própria (MSG.VOICE_UP).
    if(a==="talk"){if(ph==="down"){if(joined&&curPrefs.voice!==false)mic.start();}else mic.stop();return;}   // morto também fala: o escopo é do servidor (Room._escopoFala)
    if(a==="specPrev"||a==="specNext"){if(ph==="down")game.spectate({dir:a==="specNext"?1:-1});return;}
    if(a==="swap"&&ph==="down")audio.play("weapon",{mine:true});
    actions.act(a,ph);};
  /** Botão do ponteiro: sem munição (ou na carência) o esquerdo cospe em vez de atirar — e isso também soa. */
  const button=(btn,ph,type)=>{
    if(btn===0&&ph==="down"&&canAct()&&!(view.self&&!view.self.fireCd&&view.self.missiles>0))somEject();
    actions.button(btn,ph,type);};
  const keyboard=createKeyboard({onAction:act,enabled:()=>joined,prefs:curPrefs});
  const touch=createTouchButtons(hud,{onAction:act});
  let pointer=null;
  const minimap=createMinimap({hud,theme:()=>curTheme,getScene:()=>{if(!joined)return null;
    // inimigos: vêm do PLACAR (que traz TODOS os vivos com posição, a 2 Hz), não da AOI — o snapshot só
    // conhece quem está na janela da sessão, e o radar tem que mostrar o mapa inteiro.
    const me=view.mySlot,enemies=[];
    for(const r of view.lbRows(mapOn==="live")){if(r.slot===me)continue;const pl=view.playerOf(r.slot);
      enemies.push({slot:r.slot,name:pl?pl.name:"",x:r.x,y:r.y,mass:r.mass,isBot:pl?pl.isBot:false,ally:pl?pl.ally:false,
        skin:pl?pl.skin:null,country:pl?pl.country:null});}
    const mine=[];for(const p of view.pieces)if(p.isMe)mine.push({x:p.rx,y:p.ry,r:p.rr});
    const ms=[];for(const m of view.missiles)ms.push({x:m.rx,y:m.ry,mira:m.target===me});   // o teleguiado que vem em mim pisca no radar
    return{enemies,mine,missiles:ms,asteroids:view.asteroids.map(a=>({x:a.rx,y:a.ry})),holes:view.holes.map(h=>({x:h.rx,y:h.ry,ri:h.influenceR})),
      stars:view.stars.map(st=>({x:st.rx,y:st.ry,r:st.rr})),cam};},
    onPick:slot=>{game.spectate({slot});}});   // clicar num planeta do mapa grande = assistir a ele
  /**
   * Quem manda no radar: vivo, a preferência do jogador; MORTO, o mapa grande — na tela de morte o radar
   * pequeno não tem para onde apontar (não há peça própria), e é o mapa aberto que ocupa o lugar dele.
   */
  function aplicaRadar(){minimap.show(!!joined&&(dead?!!mapOn:curPrefs.showMinimap!==false));}
  minimap.show(false);
  if(isStats())statsOv=createOverlay(hud);

  // ── renderer (assíncrono: Pixi init) ──
  let destroyed=false;   // StrictMode destrói a 1ª instância com o init do Pixi ainda pendente: não pode sobrar um canvas zumbi
  createRenderer({container,theme:curTheme,prefs:{fx:!curPrefs.reduceMotion}}).then(r=>{if(destroyed){r.destroy();return;}renderer=r;ready=true;
    pointer=createPointer(r.canvas,{onButton:button});joy=createJoystick(r.canvas,hud);aplicaJoystick();applyQuality();r.setTheme(curTheme);r.resize();lastT=performance.now();warmSkins();
    if(!raf)raf=requestAnimationFrame(frame);
    if(!inputTimer)inputTimer=setInterval(()=>enviarInput(performance.now()),Math.max(8,Math.round(1000/NET.INPUT_HZ)));}).catch(e=>{console.error("[game] renderer",e&&e.stack||e);container.innerHTML=`<div style="padding:20px;color:#fff">Não foi possível iniciar o renderizador (WebGL indisponível): ${e.message}</div>`;});
  // DEBOUNCE obrigatório: o observer dispara a cada frame enquanto a borda da janela é arrastada, e
  // `game.resize()` reenvia `{t:"view"}` ao servidor. Sem isso eram ~60 JSON/s contra um balde de 5/s
  // (NET.RATE_JSON) e a 3ª rejeição em 10 s ENCERRAVA a conexão com RATE — arrastar a janela derrubava o
  // jogador no meio da partida. O canvas em si pode esperar 150 ms; girar o celular continua instantâneo
  // aos olhos porque o layout do CSS não depende deste caminho.
  let roT=0;const agendaResize=()=>{clearTimeout(roT);roT=setTimeout(()=>game.resize(),RESIZE_MS);};
  const ro=typeof ResizeObserver!=="undefined"?new ResizeObserver(agendaResize):null;if(ro)ro.observe(container);
  const onVis=()=>{visible=document.visibilityState!=="hidden";lastT=performance.now();if(visible){frames=0;fpsT=lastT;}};document.addEventListener("visibilitychange",onVis);

  // ── sumiço de entidades (Interpolator, no tempo de render): planeta comido explode, comida/pellet faísca ──
  function onVanish(e){if(!renderer)return;
    if(e.kind===KIND.PIECE){if(e.reason===REMOVE.EATEN||e.reason===REMOVE.SUCKED){const pl=view.playerOf(e.owner);
      const f={x:e.rx,y:e.ry,r:e.rr,color:pl?pl.skin.color:null},eid=pendingEat.get(e.id);   // quem comeu: o sumiço vira sucção na direção dele
      if(eid!=null){pendingEat.delete(e.id);for(const p of view.pieces)if(p.id===eid){f.tx=p.rx;f.ty=p.ry;f.tr=p.rr;break;}}
      renderer.fx.add("vanish",f);}}
    else if((e.kind===KIND.FOOD||e.kind===KIND.EJECT)&&e.reason===REMOVE.EATEN){const pl=e.kind===KIND.EJECT?view.playerOf(e.owner):null;renderer.fx.spark(e.rx,e.ry,e.rr,pl?pl.skin.color:null);
      if(own0.some(p=>Math.hypot(p.rx-e.rx,p.ry-e.ry)<p.rr+e.rr+18))audio.play("food",{mine:true,ladder:true});}}   // só o grão que EU comi faz barulho — e a fila sobe a escada
  // ── texturas: aquece as skins da sala (tiers 128/256) e a própria (128/256/512, variante isMe) ──
  function warmSkins(){if(!renderer||!joined)return;const skins=[];let me=null;
    for(const pl of view.players.values()){if(!pl.skin)continue;if(pl.slot===view.mySlot)me=pl.skin;else if(!skins.includes(pl.skin))skins.push(pl.skin);}
    // as caricaturas de easter egg são ARQUIVO, então precisam de rede: descobrir isso no meio da partida
    // faz o planeta do adversário piscar de disco liso para cara. Aqui elas chegam com o PLAYERS.
    warmFaces([...skins,me].filter(Boolean).map(sk=>sk.id));
    renderer.warmHazards();renderer.warmPlanets(skins,me);}
  // ── rede ──
  function viewSize(){return{w:Math.round(renderer?renderer.W:container.clientWidth||innerWidth),h:Math.round(renderer?renderer.H:container.clientHeight||innerHeight)};}
  function onOpenSend(c){if(c.session){buffer.clear();predictor.reset();c.sendJson({t:"resume",sessionId:c.session.sessionId,resumeToken:c.session.resumeToken,view:viewSize()});input.resend();}
    else c.sendJson({t:"join",token:joinOpts.token||null,room:joinOpts.room||null,view:viewSize(),fallbackNick:joinOpts.fallbackNick||"Viajante",skinId:joinOpts.skinId|0,
      mode:joinOpts.mode|0,teamSize:joinOpts.teamSize|0,party:joinOpts.party||null});}
  function onJson(m){
    if(m.t==="room"){view.mySlot=m.slot;predictor.setSlot(m.slot);view.room=m.code;view.rebuildLb();warmSkins();
      round=m.round||null;roundOver=false;lastCount=-1;warmedSky=null;lastAmmo=0;lastMagnet=false;
      modeId=m.mode|0;teamSize=m.teamSize||1;myTeam=m.team==null?-1:m.team;roomCap=m.cap||0;
      phase=(m.round&&m.round.phase)||"live";startsAt=(m.round&&m.round.startsAt)||0;
      view.setMyTeam(myTeam);chatLog=[];feedLog=[];lobby=null;spec=null;
      audio.resume();audio.play("join",{mine:true});}
    else if(m.t==="lobby"){   // a sala enchendo: contagem em MS, porque no lobby não há snapshot para sincronizar o tick
      lobby={filled:m.filled,cap:m.cap,humans:m.humans,startsInMs:m.startsInMs,waitMs:m.waitMs,at:performance.now()};
      if(m.startsInMs&&!lobbyBeep){lobbyBeep=true;audio.play("countdown",{mine:true});}}
    else if(m.t==="phase"){   // largada: relógio, contagem e céu saem todos do bloco `round` novo
      phase=m.phase;round=m.round||round;startsAt=(m.round&&m.round.startsAt)||0;lastCount=-1;lobby=null;lobbyBeep=false;
      pushHud(performance.now());   // na hora: o HUD roda a 8 Hz e a tela do lobby ficaria até 125 ms por cima da partida já em curso
      if(phase==="live"){audio.play("matchStart",{mine:true});chatSys("A partida começou!");}}
    else if(m.t==="chat"){pushChat(m);}
    else if(m.t==="talk"){view.setTalking(m.slot,!!m.on);}   // push-to-talk de outro: acende/apaga o ícone no planeta dele
    else if(m.t==="feed"){pushFeed(m);}
    // AVISO GLOBAL do painel /admin: a faixa por cima do jogo E uma linha de sistema no chat. As duas de
    // uma fonte só — quem estava olhando o chat lê ali, quem estava olhando o jogo lê na faixa, e nenhuma
    // delas depende de o jogador ter olhado no instante certo.
    else if(m.t==="notice"){chatSys(m.text);
      hudStore.update(h=>({...h,notice:{text:m.text,level:m.level||"info",at:performance.now(),ttlMs:m.ttlMs|0||12000}}));
      audio.play("toast",{mine:true});}
    else if(m.t==="avatars"){view.setAvatars(m.list);}
    else if(m.t==="flags"){view.setFlags(m.list);}   // bandeira de cada jogador (humano e preenchimento) — ver Room.broadcastFlags
    else if(m.t==="roundEnd"){roundOver=true;input.setHold(false);
      const venci=m.champion&&m.champion.slot===view.mySlot;
      if(venci)celebrate();                                   // ganhei: o planeta comemora
      if(!venci||m.reason!=="lastAlive")endOfWorld();          // o mundo só explode quando acabou o TEMPO (ou quando não fui eu)
      pushHud(performance.now());if(onRoundEnd)onRoundEnd({...m,mySlot:view.mySlot});}
    else if(m.t==="dead"){dead=true;input.setHold(false);mic.cancel();aplicaRadar();pushHud(performance.now());
      if(onDead)onDead({by:m.by,byHole:!!m.byHole,byZone:!!m.byZone,score:m.score,maxMass:m.maxMass,kills:m.kills,durationS:m.durationS,placement:m.placement||0,players:m.players||0});}
    else if(m.t==="spectate"){specSlot=m.slot>=0?m.slot:-1;spec={slot:specSlot,name:m.name||null,vivos:m.vivos|0};if(mapOn)minimap.setView(mapOn,specSlot);pushHud(performance.now());}   // morto: de quem é a cena que continua rodando atrás da tela de KABOOM
    else if(m.t==="rewards"){if(onRewards)onRewards(m);}}
  function onBinary(m){const now=performance.now();
    switch(m.type){
      case MSG.SNAPSHOT:if(m.self.flags&SELF_FLAG.RESYNC)buffer.clear();buffer.apply(m,now);predictor.onSnapshot(m,conn.rttAvg);view.self=m.self;selfTick=m.tick;if(m.self.flags&SELF_FLAG.DEAD)dead=true;break;
      case MSG.PLAYERS:view.setPlayers(m.players);warmSkins();break;
      case MSG.ZONE:zone=m.zone;predictor.setZone(zone);break;
      case MSG.VOICE:onVoice(m);break;
      case MSG.LEADERBOARD:view.setLeaderboard(m.rows);break;
      case MSG.EVENT:{const kind=FX_OF[m.kind];if(!kind||!renderer)break;const f={x:m.x,y:m.y,r:m.r||10};
        if(DIR_EVENTS.has(m.kind)){const d=unpackDir(m.extra);f.nx=d.nx;f.ny=d.ny;f.power=Math.min(1,d.vn/480);
          if(m.kind===EVENT.SHIELD_HIT)f.level=d.vn;else if(m.kind===EVENT.STAR_HIT)f.n=d.vn;}
        else if(m.kind===EVENT.SHIELD_UP)f.level=m.extra;
        // A MESMA estrela morre com dois nomes. Quando quem a matou foi uma TROMBADA de planeta, ela não
        // larga prêmio (STAR.RAM_REWARD) e não é supernova de verdade: é uma nebulosa planetária — e o
        // servidor diz isso mandando o slot de quem trombou no `slotA`, que neste evento estava livre.
        else if(m.kind===EVENT.SUPERNOVA){const L=mergeLabels(currentTheme()&&currentTheme().labels).fx||{};
          f.text=m.slotA!==SEM_SLOT?(L.nebula||"NEBULOSA PLANETÁRIA!"):(L.supernova||"SUPERNOVA!");}
        const mine=m.slotA===view.mySlot||m.slotB===view.mySlot;   // o que envolve a própria peça (já à frente) não espera
        const delay=mine?0:interp.delayMs;
        if(m.kind===EVENT.EAT){const eater=nearestPieceOf(m.slotA,m.x,m.y);   // absorção: a vítima é sugada para quem comeu, que dá um "gulp" e cresce
          if(eater){f.tx=eater.rx;f.ty=eater.ry;f.tr=eater.rr;pendingEat.set(m.extra,eater.id);renderer.planets.pop(eater.id,delay);}}
        else if(m.kind===EVENT.BH_SUCK){const h=nearestHole(m.x,m.y);   // espaguetificação: o planeta se estica de onde estava até a boca do buraco
          if(h){f.tx=h.rx;f.ty=h.ry;}}
        renderer.fx.add(kind,f,delay);
        const pitch=mine?pitchOf(view.self?view.self.mass:0):1;   // o que é MEU soa mais grave quanto maior eu estou
        const som=()=>audio.play(kind,{x:f.x,y:f.y,r:f.r,mine,cam,pitch});
        if(delay)setTimeout(som,delay);else som();   // o som acompanha o efeito (terceiros esperam o atraso de interpolação)
        break;}}}
  // ── chat ──
  function pushChat(m){
    chatLog.push({slot:m.slot,name:m.name,team:m.team==null?null:m.team,text:m.text,at:m.at||Date.now(),mine:m.slot===view.mySlot,dead:!!m.dead,scope:m.scope||null});
    if(chatLog.length>40)chatLog.shift();
    hudStore.update(h=>({...h,chat:chatLog.slice()}));
    if(m.slot!==view.mySlot)audio.play("chatIn",{mine:true,bus:"ui"});}
  const chatSys=text=>pushChat({slot:-1,name:null,team:null,text,at:Date.now()});
  // ── kill feed ──
  /**
   * Uma leva de linhas do feed. Os nomes são resolvidos AQUI, na chegada, e não na renderização: quem sai
   * da sala desaparece de `view.players` no PLAYERS seguinte, e uma linha de 8 s atrás mostraria "?"
   * justamente para quem acabou de ser morto e fechou a aba. O HUD é renderizador burro em todo o resto.
   */
  function pushFeed(m){
    const quem=sl=>{if(sl==null||sl<0)return null;const p=view.playerOf(sl);
      return{slot:sl,name:p?p.name:"?",bot:p?p.isBot:false,ally:p?p.ally:false,level:p?p.level|0:0,me:sl===view.mySlot};};
    // ⚠️ O carimbo é o relógio DAQUI, não o `m.at` do servidor. O `at` só serve para uma coisa — a
    // expiração por idade em KillFeed.jsx, que compara com o `Date.now()` do NAVEGADOR —, então
    // misturar os dois relógios nunca fez sentido: com o pod atrasado mais que FEED.TTL_MS toda
    // linha nascia vencida e o feed sumia inteiro, sem erro, sem log e sem sintoma nenhum.
    const at=Date.now();
    for(const it of (m.v||[])){
      const a=quem(it.a),b=quem(it.b),as=quem(it.by);
      feedLog.push({id:feedSeq++,at,k:it.k,how:it.how,byHow:it.byHow||null,n:it.n|0,a,b,assist:as,
        mine:!!((a&&a.me)||(b&&b.me)||(as&&as.me))});}
    if(feedLog.length>FEED.KEEP)feedLog.splice(0,feedLog.length-FEED.KEEP);
    hudStore.update(h=>({...h,feed:feedLog.slice()}));}   // no EVENTO, não no relógio de 8 Hz: abate é do instante
  // ── voz ──
  /**
   * Clipe de outro jogador: decodifica os bytes (µ-law → AudioBuffer, sem depender de codec do navegador) e
   * toca no barramento próprio, com volume/estéreo pela distância. Companheiro chega com `x,y` do servidor;
   * no Livre a distância é a de verdade, e o motor usa o MESMO cálculo dos efeitos.
   */
  function onVoice(m){
    const eu=modeId!==MODE.FREE&&myTeam>=0&&teamMate(m.slot);
    audio.playVoice(m.data,m.codec,{x:m.x,y:m.y,cam,mine:eu});
    const pl=view.players.get(m.slot);
    if(pl)chatSys(`🎤 ${pl.name}`);}
  const teamMate=slot=>{const a=view.players.get(slot);return !!(a&&myTeam>=0&&a.team===myTeam);};
  // ── zona ──
  /** Círculo da zona no tick de render (o servidor manda origem+destino; a interpolação é local, como em tudo). */
  function zoneNow(tk){
    if(!zone)return null;
    const span=zone.t1-zone.t0;
    let u=span>0&&Number.isFinite(span)?(tk-zone.t0)/span:1;u=u<0?0:u>1?1:u;
    zoneShown.x=zone.x0+(zone.x1-zone.x0)*u;zoneShown.y=zone.y0+(zone.y1-zone.y0)*u;zoneShown.r=zone.r0+(zone.r1-zone.r0)*u;
    return zoneShown;}
  /** Buraco negro mais próximo de (x,y) — para onde o planeta sugado se estica. */
  function nearestHole(x,y){let best=null,bd=Infinity;
    for(const h of view.holes){const dx=h.rx-x,dy=h.ry-y,d2=dx*dx+dy*dy;if(d2<bd){bd=d2;best=h;}}
    return best;}
  /** Peça viva do slot mais próxima de (x,y) — quem engoliu, para a animação de absorção. */
  function nearestPieceOf(slot,x,y){let best=null,bd=Infinity;
    for(const e of view.pieces){if(e.owner!==slot)continue;const dx=e.rx-x,dy=e.ry-y,d2=dx*dx+dy*dy;if(d2<bd){bd=d2;best=e;}}
    return best;}
  function onState(ev){if(ev.state==="connected"){game.resize();}
    if(onConnection)onConnection(ev);}
  function connectWith(makeSocket){conn=createConnection({makeSocket,onJson,onBinary,onState,onOpenSend});conn.open();}
  const game={hudStore,
    /**
     * Manda uma linha de chat (a tela React chama isto). Quem decide o escopo continua sendo o SERVIDOR;
     * `scope` é só o PEDIDO de quem já morreu no Battle Royale ("all" = arquibancada, "team" = esquadrão).
     */
    sendChat(text,scope){const t=String(text||"").trim();if(!t||!conn||!joined)return false;conn.sendJson({t:"chat",text:t.slice(0,240),scope:scope||undefined});return true;},
    /** Push-to-talk pelo botão de toque (o espelho do Ctrl para o mobile). */
    talk(on){if(!joined)return;if(on)mic.start();else mic.stop();},
    /**
     * Morto: troca de quem é a câmera. `dir` ±1 anda na lista de vivos por massa (a mesma do placar) e
     * `slot` pula direto para alguém. Quem decide é o SERVIDOR — a AOI da sessão segue o mesmo alvo, senão
     * a câmera olharia para um pedaço de espaço que o servidor não está mandando.
     */
    spectate({slot=-1,dir=0}={}){if(!conn||!joined||!dead)return;conn.sendJson({t:"spectate",slot,dir});},
    /**
     * Mapa grande: o radar ampliado, com nome em cada planeta e clique para trocar de câmera. Só com o
     * jogador MORTO — ver o mapa inteiro jogando seria vantagem tática, e não é o que se pediu.
     */
    /** `modo`: "" fecha · "map" o radar ampliado · "live" a visão em tempo real. `true` = "map" (compatível). */
    showMap(modo){const m=modo===true?"map":(modo||"");const v=joined&&dead?m:"";if(v===mapOn)return;
      mapOn=v;minimap.setView(mapOn,specSlot);aplicaRadar();pushHud(performance.now());},
    toggleMap(modo){const m=modo===true||modo===undefined?"map":(modo||"");game.showMap(mapOn===m?"":m);},
    join({token,fallbackNick,room,local:useLocal,skinId,mode,teamSize:ts,party}={}){
      game.leave(true);joined=true;dead=false;specSlot=-1;selfTick=0;
      const user=(appStore.get().session||{}).user||{};
      joinOpts={token,fallbackNick:fallbackNick||user.nick||"Viajante",room:room||null,skinId:skinId!=null?skinId:(user.equippedSkin|0),
        mode:mode|0,teamSize:ts||1,party:party||null};
      buffer.clear();predictor.reset();interp.update(performance.now());view.reset();input.reset();cam.reset();hudStore.set({...initialHud(),room:room||null});mapOn="";minimap.setView("",-1);aplicaRadar();
      if(pointer&&renderer)pointer.center(renderer.W,renderer.H);
      const isLocal=useLocal||qflag("local")||isBench()||api.server===false;
      if(isLocal){const rs=+(Q.get("round")||0);   // ?round=<segundos> encurta a rodada local (dev)
        local=createLocalServer(isBench()?benchOptions():{lag:+(Q.get("lag")||0),seed:+(Q.get("seed")||7),...(rs>0?{roundTicks:Math.round(rs*TICK_HZ)}:{})});connectWith(()=>local.connect());return;}
      const proto=location.protocol==="https:"?"wss":"ws";
      const go=shard=>{if(!joined)return;connectWith(()=>new WebSocket(`${proto}://${location.host}/ws/${shard}`));};
      if(room)go(shardOf(room));
      else fetch("/api/config",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(c=>go(c&&c.shard!=null?c.shard:0)).catch(()=>go(0));},
    // sair é DELIBERADO: avisa o servidor antes de fechar. Sem o `quit`, o `close` do socket é
    // indistinguível de uma queda de rede — a sessão fica em graça por NET.RESUME_MS segurando o slot, e
    // no lobby do battle royale isso põe um fantasma no mapa na largada. A reconexão automática não passa
    // por aqui (ela é do Connection, e volta pelo `resume`), então nada disso atrapalha quem só caiu.
    leave(silent){if(conn){const c=conn;conn=null;try{c.sendJson({t:"quit"});}catch{}c.close();}if(local){local.stop();local=null;}
      const was=joined;joined=false;dead=false;specSlot=-1;spec=null;audio.stop();mic.release();round=null;roundOver=false;roundClock=null;zone=null;chatLog=[];feedLog=[];phase="live";modeId=MODE.FREE;myTeam=-1;pendingEat.clear();setRoundHour(null);input.reset();input.setHold(false);buffer.clear();predictor.reset();view.reset();mapOn="";minimap.setView("",-1);minimap.show(false);
      if(was&&!silent)hudStore.set({...initialHud()});},
    setPrefs(p){curPrefs={...curPrefs,...(p||{})};aplicaJoystick();applyQuality();audio.setPrefs(curPrefs);aplicaRadar();keyboard.setKeys(curPrefs);if(renderer)renderer.R.prefs.fx=!curPrefs.reduceMotion;},
    setTheme(t){if(!t||t===curTheme)return;curTheme=t;if(renderer){renderer.setTheme(t);warmSkins();}minimap.setTheme(t);},   // o cache foi invalidado: reaquece as skins para a troca no meio da rodada não engasgar
    resize(){if(!renderer)return;renderer.resize();if(conn&&conn.isOpen&&joined){const v=viewSize();if(v.w!==game._vw||v.h!==game._vh){game._vw=v.w;game._vh=v.h;conn.sendJson({t:"view",w:v.w,h:v.h});}}},
    destroy(){destroyed=true;if(typeof window!=="undefined")delete window.__warspace;cancelAnimationFrame(raf);raf=0;clearInterval(inputTimer);inputTimer=0;clearTimeout(roT);if(joy)joy.destroy();game.leave(true);audio.suspend();removeEventListener("pointerdown",wakeAudio);removeEventListener("keydown",wakeAudio);keyboard.destroy();touch.destroy();actions.destroy();if(pointer)pointer.destroy();minimap.destroy();if(statsOv)statsOv.destroy();
      if(ro)ro.disconnect();document.removeEventListener("visibilitychange",onVis);removeEventListener("warspace:theme",onThemeEvent);if(themeGuard)removeEventListener("warspace:theme",themeGuard);
      if(renderer){renderer.destroy();renderer=null;}ready=false;},
    debug:{stats:()=>({conn,buffer,interp,predictor,view,cam,renderer,fstats,aim,aiming,audio}),local:()=>local,
      hud:()=>hudStore.get(),estado:()=>({modeId,teamSize,myTeam,phase,startsAt,roomCap,lobby,zone}),
      fogos:()=>celebrate()},   // aprovar a salva de olho sem ter de vencer um battle royale
  };

  // ── qualidade / modo econômico (0 = cheio, 1 = econômico, 2 = mínimo) ──
  // O custo de frame é dominado pelas camadas que cobrem a tela toda (grade e fundo) — por isso cada nível
  // corta resolução E camadas: 1 desliga grade, parallax e trilhas (res .8); 2 ainda tira props (res .6).
  const ECON_RES=[0,.8,.6];
  // `auto` no DEDO começa em 1, não em 0: sem isto todo celular renderizava a res=min(2,DPR)=2 por pelo menos
  // 1 s (o tempo de o econCheck reagir) — a pior tela justamente na entrada. O econCheck sobe sozinho para 0
  // depois de 2 s acima de 55 fps, então quem tem aparelho bom não perde nitidez, só demora 2 s a ganhá-la.
  const noDedo=()=>typeof matchMedia!=="undefined"&&matchMedia("(pointer: coarse)").matches;
  function applyQuality(){if(!renderer)return;const q=curPrefs.quality||"auto";
    if(q==="low")setEcon(2);else if(q==="high")setEcon(0);else if(!econLevel)setEcon(noDedo()?1:0);}
  function setEcon(lv){econLevel=lv;econ=lv>0;if(!renderer)return;renderer.setEcon(lv);
    renderer.setResolution(lv?ECON_RES[lv]:Math.min(2,devicePixelRatio||1));}
  // Decide pelo tempo REAL entre frames (o custo de CPU medido não enxerga o trabalho da GPU: um jogo a 20 fps
  // podia ter "6 ms de frame" e o modo econômico nunca ligava). > SLOW_MS (menos de 50 fps) por 1 s → sobe um
  // nível; < FAST_MS (55 fps+, folga com vsync a 60 Hz) por 2 s e passado o backoff → desce. O backoff dobra
  // até 5 min quando a queda se repete rápido, para a nitidez não ficar piscando.
  const SLOW_MS=20,FAST_MS=18;
  let econBackoff=30000,econLeftAt=-1e9,fastSince=0;
  function econCheck(now,ms){if((curPrefs.quality||"auto")!=="auto")return;
    if(ms>SLOW_MS){fastSince=0;
      if(econLevel<2){if(!slowSince)slowSince=now;else if(now-slowSince>1000){if(now-econLeftAt<5000)econBackoff=Math.min(300000,econBackoff*2);setEcon(econLevel+1);econAt=now;slowSince=0;}}}
    else{slowSince=0;
      if(econLevel>0&&ms<FAST_MS){if(!fastSince)fastSince=now;else if(now-fastSince>2000&&now-econAt>econBackoff){setEcon(econLevel-1);econAt=now;econLeftAt=now;fastSince=0;}}else fastSince=0;}}

  // ── rodada: relógio do espaço (um dia inteiro por rodada), contagem final e explosão do mundo ──
  // Tudo derivado do tick do servidor (buffer.tickAt) + o bloco `round` do JSON `room`: nada extra no fio.
  function roundTick(now){
    if(!round||!round.ticks){if(roundClock){roundClock=null;setRoundHour(null);}return;}
    const rt=Math.min(round.ticks,Math.max(0,buffer.tickAt(now)-round.start)),left=(round.ticks-rt)/TICK_HZ;
    // `days` vem do JSON `room` do servidor: os ticks da rodada saem do env (ROUND_TICKS) e os dias eram
    // constante do CLIENTE — cliente novo com env velho desenhava o relógio do espaço na metade da velocidade.
    const dias=round.days||ROUND.DAYS;
    const h=(round.dayStart+24*dias*(rt/round.ticks))%24;roundClock={h:Math.floor(h),m:Math.floor(h%1*60),leftS:Math.max(0,left)};
    setRoundHour(h);
    prewarmNextSky(h);
    if(!renderer||dead)return;
    const n=Math.ceil(left);   // contagem gigante nos segundos finais (um efeito por segundo)
    if(!roundOver&&n>0&&n<=ROUND.WARN_S&&n!==lastCount){lastCount=n;
      renderer.fx.add("countdown",{x:cam.x,y:cam.y,r:cam.H/cam.scale*.16,n});audio.play("countdown",{mine:true});}}
  /**
   * O céu do próximo horário é assado ANTES de entrar (PREWARM_S segundos reais de antecedência): na virada não
   * sobra nada para assar e a tela não engasga. Só vale com a preferência em "auto" (é o relógio da rodada que
   * manda) e o custo é pago uma vez por virada, fora dela.
   */
  function prewarmNextSky(h){
    if(!renderer||!round||!round.ticks)return;
    if((curPrefs.theme||"auto")!=="auto")return;
    const dh=24*(round.days||ROUND.DAYS)/(round.ticks/TICK_HZ)*PREWARM_S;   // quantas horas do relógio do espaço andam em PREWARM_S reais
    const next=resolveThemeId("auto",(h+dh)%24);
    if(next===warmedSky||!THEMES[next]||next===(curTheme&&curTheme.id))return;
    warmedSky=next;
    const skins=[];let me=null;
    for(const pl of view.players.values()){if(!pl.skin)continue;if(pl.slot===view.mySlot)me=pl.skin;else if(!skins.includes(pl.skin))skins.push(pl.skin);}
    renderer.prewarmTheme(THEMES[next],skins,me);}
  /**
   * Alvo provável do tiro mirado — a bolinha mais próxima do PONTEIRO (mesmo `aimScore` do servidor, só que com as
   * posições interpoladas que o cliente vê): serve de aviso na tela; quem decide de verdade é o servidor.
   * Roda todo frame, então o anel PULA de bolinha em bolinha conforme o mouse anda — que é a graça da mira nova.
   */
  function lockOn(src,tx,ty){let bs=MISSILE.AIM_PICK,best=null;
    const scan=arr=>{for(const e of arr){if(e.owner===view.mySlot)continue;
      const ax=e.rx-src.rx,ay=e.ry-src.ry;if(ax*ax+ay*ay>=AIM_R2)continue;   // fora do alcance da arma
      const sc=aimScore(e.rx-tx,e.ry-ty,e.rr);if(sc>=bs)continue;bs=sc;best=e;}};
    scan(view.pieces);scan(view.missiles);scan(view.asteroids);scan(view.stars);
    return best?{x:best.rx,y:best.ry,r:best.rr,id:best.id}:null;}
  // ── som derivado de ESTADO (não de evento): tamanho, perigo, ameaça, rampa do W ──
  const massK=m=>Math.min(1,Math.sqrt(Math.max(0,m))/PLAYER.MAX_R);       // 0 = recém-nascido, 1 = no teto de raio
  const pitchOf=m=>1/(1+massK(m)*1.1);                                     // o TAMANHO vira som: o gigante soa quase uma oitava abaixo
  /** Quão perto estou da estrela mais próxima (0..1): é o que faz a ambiência ficar tensa. */
  function perigo(){if(!own0.length)return 0;const p=own0[0];let k=0;
    for(const st of view.stars){const lim=st.rr*STAR.HALO*2,d=Math.hypot(st.rx-p.rx,st.ry-p.ry)-p.rr-st.rr;
      if(d<lim){const v=1-Math.max(0,d)/lim;if(v>k)k=v;}}
    return k;}
  /**
   * Alerta de míssil teleguiado. O QUANTO vem do servidor (`self.threat`), porque o míssil nasce muito além da
   * AOI; a DIREÇÃO usa o míssil de verdade quando ele já está na janela (é exata) e cai no `threatDir` quando não.
   */
  function ameaca(sf){
    const t=sf.threat|0;
    if(!t||dead){if(threat){threat=null;audio.stopLoop("alert");}return;}
    const k=(t-1)/254,ang=sf.threatDir/256*6.2831853;
    let nx=Math.cos(ang),ny=Math.sin(ang);
    const me=own0.length?own0[0]:null;
    if(me){let bd=Infinity,b=null;
      for(const m of view.missiles){if(m.target!==view.mySlot)continue;const d=Math.hypot(m.rx-me.rx,m.ry-me.ry);if(d<bd){bd=d;b=m;}}
      if(b){const dx=b.rx-me.rx,dy=b.ry-me.ry,l=Math.hypot(dx,dy)||1;nx=dx/l;ny=dy/l;}}
    threat={nx,ny,k};
    audio.startLoop("alert",{k,pan:Math.max(-.9,Math.min(.9,nx))});}
  /**
   * Tudo que o cliente descobre sozinho olhando o `self`: munição, tiro, ímã, arma pronta, marcos de massa,
   * dano, morte/renascimento, a ameaça e a ambiência. É o gancho para som de ESTADO — o de evento vem do EVENT.
   */
  function somDoSelf(sf,now){
    if(sf.missiles>lastAmmo)audio.play("ammo",{mine:true});
    else if(sf.missiles<lastAmmo&&!dead)audio.play("fire",{mine:true,pitch:pitchOf(sf.mass)});
    const mag=sf.magnetT>0;
    if(mag&&!lastMagnet){audio.play("powerup",{mine:true});audio.startLoop("magnet",{k:1});}
    else if(!mag&&lastMagnet)audio.stopLoop("magnet");
    if(lastFireCd>0&&!sf.fireCd&&sf.missiles>0&&!dead)audio.play("ready",{mine:true});   // a carência de spawn acabou
    if(sf.mass>0){
      const mk=Math.floor(Math.log(sf.mass)/Math.log(MASS_STEP));
      if(!lastMass||sf.mass<lastMass*.5)marco=mk;                                        // nasci/renasci/fui partido: recalibra sem tocar nada
      else{if(mk>marco){marco=mk;audio.play("grow",{mine:true,pitch:pitchOf(sf.mass)});}
        else if(mk<marco)marco=mk;
        if(sf.mass<lastMass*.88&&!dead)audio.play("hurt",{mine:true,pitch:pitchOf(sf.mass)});}}   // levei um tombo de massa (queimadura, míssil, lasca)
    const fora=!dead&&!!(sf.flags&SELF_FLAG.ZONE_HURT);   // o servidor é quem diz: o círculo do cliente é interpolado e ficaria discordando na borda
    if(fora&&!lastHurt)audio.startLoop("alert",{k:.55});
    else if(!fora&&lastHurt&&!threat)audio.stopLoop("alert");
    lastHurt=fora;
    if(dead&&!lastDead){audio.stopLoop("alert");audio.stopLoop("magnet");threat=null;lastHurt=false;}
    else if(!dead&&lastDead)audio.play("respawn",{mine:true});
    lastDead=dead;lastAmmo=sf.missiles;lastMagnet=mag;lastFireCd=sf.fireCd;lastMass=sf.mass;
    ameaca(sf);
    if(now-ambT>AMB_MS){ambT=now;
      const perigoK=dead?0:perigo(),urgencia=roundClock&&roundClock.leftS<60?1-roundClock.leftS/60:0;
      audio.setLoop("ambience",{mass:massK(sf.mass),danger:perigoK,urgency:urgencia});
      // A TRILHA lê o MESMO estado, num número só. Massa = o quanto eu virei assunto na sala; perigo e
      // urgência = o quanto a sala virou assunto para mim. O maior dos três manda, porque a trilha
      // acompanha o que está mais quente, não a média (uma média deixaria o clímax morno para sempre).
      // Morto, ela cai para a seção de menu: quem assiste não está no clímax de ninguém.
      audio.setLoop("music",{intensity:dead?.08:Math.max(massK(sf.mass)*.75,perigoK,urgencia)});}}
  /** Fim do mundo: BIG CRUNCH — tudo colapsa para o centro da tela (o pódio vem pela tela React). */
  function endOfWorld(){if(!renderer)return;renderer.fx.add("bigCrunch",{x:cam.x,y:cam.y,r:cam.W/cam.scale*.6});audio.play("bigCrunch",{mine:true});}
  /**
   * VITÓRIA: a salva de fogos sai do MEU planeta, que é quem fica na tela atrás do pódio.
   * Os foguetes são agendados com atraso (o `delayMs` que o fx já aceita para os eventos de terceiros), em
   * pares e trios, com altura, inclinação, carga e cor sorteadas — uma salva regular soa a efeito repetido,
   * e é justamente a irregularidade que faz parecer show de verdade. O som acompanha cada um: assobio na
   * hora do lançamento e estouro no ápice (RISE do fireworkPrims), senão o áudio descola da imagem.
   */
  function celebrate(){
    if(!renderer||!renderer.R.prefs.fx)return;
    const mine=own0&&own0.length?own0:view.pieces.filter(p=>p.owner===view.mySlot);
    if(!mine.length)return;
    let big=mine[0];for(const p of mine)if(p.rr>big.rr)big=p;
    const R=Math.max(60,big.rr),vista=cam.H/cam.scale;
    const N=14,rnd=Math.random;let t=180;
    for(let i=0;i<N;i++){
      const h=vista*(.30+rnd()*.34),dx=(rnd()*2-1)*.45;
      const f={x:big.rx+(rnd()*2-1)*R*.85,y:big.ry-R*.15,h,dx,r:h,n:34+((rnd()*14)|0),
        seed:(rnd()*1e6)|0,willow:rnd()<.35};
      renderer.fx.add("firework",f,t);
      const dt=t,ap=t+150*16.7*.28;   // 0,28 da vida é a subida (RISE), onde o estouro acontece
      setTimeout(()=>audio.play("fireUp",{x:f.x,y:f.y,cam,r:0}),dt);
      setTimeout(()=>audio.play("fireBoom",{x:f.x,y:f.y-h,cam,r:h*.25}),ap);
      t+=180+rnd()*420;   // cadência irregular, às vezes quase junto
    }
    setTimeout(()=>{if(joined)audio.play("podium",{mine:true});},600);}

  // ── HUD (8 Hz) ──
  function pushHud(now){const s=view.self,tk=buffer.tickAt(now),el=Math.max(0,tk-selfTick);
    const cd=(v,max)=>s?Math.min(1,Math.max(0,(v-el)/max)):0,sec=v=>s?Math.max(0,(v-el)/TICK_HZ):0;
    hudStore.set({mass:s?s.mass:0,score:s?s.score:0,rank:s&&s.rank?s.rank:view.myRank(),coins:null,ammo:s?s.missiles:0,fireCd:sec(s?s.fireCd:0),
      powerups:{magnet:sec(s?s.magnetT:0),shield:s?s.shieldLv|0:0,autodef:s?s.autoDefN|0:0,zoom:sec(s?s.zoomT:0),feast:sec(s?s.feastT:0)},splitCd:cd(s?s.splitCd:0,SPLIT.COOLDOWN_TICKS),ejectCd:cd(s?s.ejectCd:0,EJECT.COOLDOWN_TICKS),
      lb:view.lb,room:view.room,ping:conn?Math.round(conn.rttAvg):0,fps,dead,map:mapOn,clock:roundClock,
      mode:modeId,teamSize,team:myTeam,phase,cap:roomCap,
      lobby:lobby?{...lobby,
        // o servidor manda a 2 Hz; aqui o número desce liso, descontando o tempo desde que a mensagem chegou
        startsInMs:lobby.startsInMs?Math.max(0,lobby.startsInMs-(now-lobby.at)):0,
        waitMs:lobby.waitMs?Math.max(0,lobby.waitMs-(now-lobby.at)):0,
        roster:[...view.players.values()].map(p=>({slot:p.slot,name:p.name,skinId:p.skinId,me:p.slot===view.mySlot}))}:null,
      alive:s?s.alive:0,weapon:s?s.weapon|0:0,owned:s?s.owned|1:1,zoneHurt:!!(s&&(s.flags&SELF_FLAG.ZONE_HURT)),
      talk:mic.state,chat:chatLog,feed:feedLog,notice:hudStore.get().notice,spec});}
  function statsText(){const c=renderer.counts(),st=predictor.stats;
    const net=conn?`rtt ${conn.rttAvg.toFixed(0)} ms · clock off ${Number.isNaN(buffer.offset)?"—":buffer.offset.toFixed(1)} tk (jit ${buffer.offsetJitter.toFixed(2)}) · interp ${interp.delayMs.toFixed(0)} ms (seco ${interp.dry}, extrap ${interp.extrap}) · bytes/s ${bytesRate.toFixed(0)} · msgs ${conn.msgsIn}`:"sem conexão";
    return`${isBench()?"BENCH":"STATS"} · ${renderer.kind} · ${bodyMode()} · ${fps} fps${econ?" · ECON "+econLevel:""}\nframe ${fstats.avgFrame.toFixed(2)} ms (update ${fstats.avgUpdate.toFixed(2)} + render ${fstats.avgRender.toFixed(2)}) · p95 ${fstats.p95.toFixed(2)}\n${net}\npred: corr média ${st.corrAvg.toFixed(1)} px · última ${st.lastCorr.toFixed(1)} px · replay ${st.replaySteps} tk · pend ${input.pending} · hist ${input.history.length} · seq ${input.sent}\nents: planetas ${c.planets} · comida ${c.food} · ejet ${c.ejected} · ast ${c.asteroids} · buracos ${c.holes} · estrelas ${c.stars} · mísseis ${c.missiles} · fx ${c.fx} · buffer ${buffer.entities.size}\ndraw calls ≈ ${renderer.drawCallsEstimate()} · texturas ${c.textures} (${c.texMB} MB) · res ${renderer.R.res.toFixed(2)} · ${renderer.W}×${renderer.H}`;}
  let bytesRate=0,bytesLast=0,bytesT=0,themeAt=0,own0=[];

  // ── laço ──
  /**
   * Alvo do ponteiro → InputSender. **NÃO pode depender do render**: saindo de dentro do frame, uma travada
   * de render deixa o servidor sem alvo novo, ele segue movendo a peça na direção velha e o snapshot seguinte
   * corrige tudo de uma vez — é exatamente o "volta atrás"/atraso de mouse que aparece quando o fps cai (e o
   * Battle Royale é onde ele cai, porque a AOI enche). Por isso roda também num timer a NET.INPUT_HZ.
   */
  function enviarInput(now){
    if(!ready||!joined||!conn||dead)return;
    let w=null,cx=0,cy=0;
    if(own0.length){for(const p of own0){cx+=p.rx;cy+=p.ry;}cx/=own0.length;cy/=own0.length;}
    // ── FIM DE RODADA: O PLANETA PARA ──
    // A partida acabou, o pódio está na tela e o campeão está sendo homenageado — mas o ponteiro continuava
    // sendo enviado, então o planeta seguia atrás do mouse e saía de baixo da própria salva de fogos, às
    // vezes para fora do enquadramento. Parar de mandar input NÃO resolveria: sem alvo novo o servidor
    // continua movendo a peça na direção velha, para sempre. O que para é mandar o alvo em cima de onde ela
    // já está — no modelo do agar a velocidade é `min(d,RAMP)/RAMP`, então distância zero é peça imóvel.
    if(roundOver){
      if(own0.length){w=alvo;w.x=cx;w.y=cy;input.setTarget(cx,cy);predictor.setTarget(cx,cy);}
      if(conn.isOpen)input.update(now);
      return;}
    if(joy&&joy.enabled&&joy.state.on&&own0.length){const t=joy.target(cx,cy);w=alvo;w.x=t.x;w.y=t.y;}   // analógico: direção do polegar, distância = velocidade
    else if(joy&&joy.enabled)   { if(own0.length){w=alvo;w.x=cx;w.y=cy;} }                                // analógico solto = parado (é o ponto do analógico)
    else if(pointer&&pointer.state.active)w=cam.toWorld(pointer.state.sx,pointer.state.sy);
    else if(own0.length){w=alvo;w.x=cx;w.y=cy;}   // sem ponteiro ainda: fica parado
    if(w){input.setTarget(w.x,w.y);predictor.setTarget(w.x,w.y);}   // o alvo é marcado mesmo com o socket caído (a predição local continua)
    if(conn.isOpen)input.update(now);}
  function frame(now){raf=requestAnimationFrame(frame);if(!ready)return;
    // o teto do passo tem que bater com o do acumulador do Predictor (.25): com .1 aqui, uma travada de
    // 300 ms fazia o servidor andar 300 ms e a predição só 100 — a peça ficava para trás e o snapshot
    // seguinte passava dos NET.SNAP_DIST e dava o solavanco. O Predictor já limita a 15 sub-passos.
    const dt=Math.min(.25,Math.max(0,(now-lastT)/1000));lastT=now;const t0=performance.now();
    frames++;if(now-fpsT>1000){fps=Math.round(frames*1000/(now-fpsT));frames=0;fpsT=now;}
    if(forced&&document.documentElement.dataset.theme!==forced&&now-themeAt>500){themeAt=now;applyTheme(forced);}
    if(renderer.R.theme!==curTheme)renderer.setTheme(curTheme);
    enviarInput(now);
    predictor.update(dt);interp.update(now);view.build();roundTick(now);
    const own=[];predictor.forEach(pc=>own.push(pc));own0=own;cam.W=renderer.W;cam.H=renderer.H;
    let camPieces=own;   // morto: a câmera acompanha quem o servidor mandou assistir (mesmo slot que a AOI segue), senão congela
    if(!own.length&&specSlot>=0){const sp=view.pieces.filter(p=>p.owner===specSlot);if(sp.length)camPieces=sp;}
    // O powerup de ZOOM afasta a câmera — e o servidor amplia a AOI pelo mesmo fator (net/snapshot.js),
    // então o que aparece a mais é mundo de verdade, não borda vazia.
    // ⚠️ `hold` é `joined||!ready`, não só `joined`: FORA de partida a câmera entrava no ramo do lobby e
    // PASSEAVA (Camera.js:24) pelo mundo vazio. Como o canvas continua montado e renderizando depois do
    // `leave()`, o resultado era o menu com um pedaço de arena atrás — a borda tracejada do mundo cortando
    // a tela na diagonal, planeta nenhum, mapa nenhum. Parada, o que fica atrás do menu é o CÉU, que é o
    // fundo que a tela inicial sempre teve.
    cam.update(camPieces,dt,joined||!conn,view.self&&view.self.zoomT>0?POWERUP.ZOOM_K:1);   // na sala sem peças (morto/BIG CRUNCH) a câmera congela: é o que o AOI do servidor continua mandando
    aim=null;   // reta de mira: da 1ª peça própria (a que dispara no servidor) até o ponteiro, com o anel no alvo travado
    if(joy&&joy.enabled&&joy.state.aim&&pointer){pointer.state.sx=joy.state.aimX;pointer.state.sy=joy.state.aimY;pointer.state.active=true;}   // metade direita mira sem virar o planeta
    if(aiming&&joined&&!dead&&own.length&&pointer&&pointer.state.active){const src=own[0],p=cam.toWorld(pointer.state.sx,pointer.state.sy);
      const dx=p.x-src.rx,dy=p.y-src.ry,l=Math.hypot(dx,dy)||1,len=Math.min(AIM_LEN,Math.max(src.rr*2.5,l));
      const lock=lockOn(src,p.x,p.y);
      aim={x0:src.rx+dx/l*src.rr,y0:src.ry+dy/l*src.rr,x1:src.rx+dx/l*len,y1:src.ry+dy/l*len,lock};
      if(lock){travado=lock.id;travadoAte=now+MISSILE.AIM_HOLD_TICKS/TICK_HZ*1000;}}
    // O anel CONTINUA na tela por 3 s depois de soltar o botão, porque a trava continua valendo por 3 s no
    // servidor (MISSILE.AIM_HOLD_TICKS): o próximo míssil sai nela sem mirar de novo. Sem o anel, a regra
    // existiria e ninguém confiaria nela — mirar de novo "por garantia" custa o movimento que a mira cobra.
    else if(travado>=0&&now<travadoAte&&joined&&!dead&&own.length){
      const acha=arr=>arr&&arr.find(e=>e.id===travado);
      const alvo=acha(view.pieces)||acha(view.missiles)||acha(view.asteroids)||acha(view.stars);
      if(alvo)aim={hold:true,lock:{x:alvo.rx,y:alvo.ry,r:alvo.rr,id:alvo.id}};
      else travadoAte=0;}
    const lk=aim&&aim.lock?aim.lock.id:-1;   // trocou de bolinha: um "tk" seco e o zumbido da carga sobe — é o que faz a mira sentir viva
    if(lk!==lastLock){if(lk>=0&&aiming)audio.play("lock",{mine:true});lastLock=lk;if(aiming)audio.setLoop("aimCharge",{k:lk>=0?1:0});}
    const t1=performance.now();
    const zc=zoneNow(interp.renderTick);
    const zoneDraw=zc?{x:zc.x,y:zc.y,r:zc.r,tx:zone.x1,ty:zone.y1,tr:zone.r1}:null;
    // Fora de partida some a GRADE e a borda do mundo: elas são a moldura da arena, e com o menu na frente
    // viram um traço solto no meio da tela. O céu (que é assado por resolução e não custa nada) fica.
    renderer.render({view,cam,now,dt,t:now,rt:interp.renderTick,rect:cam.rect(.05),aim,threat,zone:zoneDraw,glow:!econ&&!curPrefs.reduceMotion,parallax:!curPrefs.reduceMotion,wobble:!curPrefs.reduceMotion,showGrid:joined&&curPrefs.showGrid!==false,idle:!joined&&!conn,
      showNames:curPrefs.showNames!==false,showTrails:!curPrefs.reduceMotion&&!econ});
    const t2=performance.now();fstats.push(t1-t0,t2-t1);econCheck(now,dt*1000);   // dt real entre frames, não o custo de CPU
    if(joined){minimap.update(now,zoneDraw);if(now-lastHud>=125){lastHud=now;pushHud(now);}
      const sf=view.self;if(sf)somDoSelf(sf,now);
      // cuspir não tem evento no fio (seriam ~9 por segundo por jogador, só para um "pft"): o som sai do MEU
      // gesto, na mesma cadência do servidor, e a altura sobe com a rampa — dá para OUVIR a força aumentando.
      if(ejHold&&canAct()&&now-ejT>=EJECT.HOLD_TICKS/TICK_HZ*1000){ejT=now;
        const m=sf?sf.mass:0;
        if(m>=EJECT.MIN_R*EJECT.MIN_R){audio.play("eject",{mine:true,pitch:pitchOf(m)*(1+.55*Math.min(1,ejN/EJECT.RAMP_N))});
          if(ejN<EJECT.RAMP_N)ejN++;}}}
    if(statsOv){if(now-bytesT>1000){bytesRate=conn?(conn.bytesIn-bytesLast)*1000/(now-bytesT):0;bytesLast=conn?conn.bytesIn:0;bytesT=now;}statsOv.update(now,statsText());}}
  // Em dev sempre; em produção só com `?stats`. Sem isto, um bug que só aparece na BUILD (ordem de módulos,
  // minificação) vira caça às cegas: o console não mostra estado nenhum e não há como perguntar ao motor.
  if(typeof window!=="undefined"&&((import.meta.env&&import.meta.env.DEV)||isStats()))window.__warspace=game.debug;
  return game;}

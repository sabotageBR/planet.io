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
import {getLabels,preenche} from "../i18n/index.js";   // o texto desenhado DENTRO do mundo (fx) também é texto de UI
import {createAudio} from "../audio/index.js";
import {ESCADA} from "../audio/kit.js";
import {api} from "../api/client.js";
import {apiUrl,wsUrl} from "../api/base.js";
import {PORTAL} from "../portal/flags.js";
import {app as appStore} from "../state/app.js";
import {setRoundHour} from "../state/game.js";
import {MSG,EVENT,SELF_FLAG,SPLIT,EJECT,TICK_HZ,KIND,REMOVE,ROUND,FEED,MISSILE,PLAYER,STAR,MODE,NET,POWERUP,ZOOM,CAM,WORLD,PROTOCOL_VERSION,ZONE_WARN_AT_S,clampZoom,zoomSpan,focusOf,aimScore,unpackDir} from "@warspace/shared";
// direto do módulo: `tunables.js` não entra no barril de `shared` (ele é a lista BRANCA do painel, não
// vocabulário de jogo), e o cliente só precisa do aplicador — a validação vem junto de graça.
import {aplicaWire} from "@warspace/shared/tunables.js";
/** As raízes que um tunable 'wire' pode escrever. A chave do descritor É o caminho (`CAM.K`). */
const RAIZES_WIRE={CAM,ZOOM,STAR,ROUND};
import {createConnection} from "./net/Connection.js";
import {createInputSender} from "./net/InputSender.js";
import {createLocalServer} from "./net/LocalServer.js";
import {createMic} from "../audio/mic.js";
import {SEM_VOZ} from "../portal/flags.js";
import {createSnapshotBuffer} from "./state/SnapshotBuffer.js";
import {createInterpolator} from "./state/Interpolator.js";
import {createPredictor} from "./state/Predictor.js";
import {createWorldView} from "./state/WorldView.js";
import {createRenderer} from "./renderer/Renderer.js";
import {createCamera} from "./renderer/Camera.js";
import {createPointer} from "./input/Pointer.js";
import {createJoystick} from "./input/Joystick.js";
import {createPinch} from "./input/Pinch.js";
import {createKeyboard} from "./input/Keyboard.js";
import {createWheel} from "./input/Wheel.js";
import {createTouchButtons} from "./input/Touch.js";
import {createActions} from "./input/actions.js";
import {createMinimap} from "./hud/Minimap.js";
import {isBench,isStats,benchOptions,createOverlay,createFrameStats} from "./bench.js";
import {passoQualidade,qualidadeZero} from "./quality.js";
import {Q,qflag,bodyMode} from "./util.js";

const initialHud=()=>({mass:0,score:0,rank:0,coins:null,ammo:0,powerups:{magnet:0,shield:0,autodef:0,zoom:0,feast:0},splitCd:0,ejectCd:0,lb:[],room:null,ping:0,fps:0,dead:false,clock:null,
  mode:MODE.FREE,teamSize:1,team:-1,phase:"live",startsInMs:0,alive:0,weapon:0,zoneHurt:false,talk:null,chat:[],feed:[],map:"",notice:null,zoom:null,host:null,
  brInvite:null,zoneWarn:null,zoneAlarmAt:0});
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
// combo: acerto = eu fui o ATACANTE (slotB) num BOOM/SHIELD_HIT/SHIELD_BREAK — nunca quando sou vítima.
// CLASH/DEFLECT com meu slot são "miss" explícito e zeram na hora; o míssil que expira no vácuo não avisa
// ninguém, e por isso o combo também esfria sozinho depois de COMBO_RESET_MS sem um acerto novo.
const COMBO_HIT=new Set([EVENT.BOOM,EVENT.SHIELD_HIT,EVENT.SHIELD_BREAK]);
const COMBO_RESET_MS=3000;
const shardOf=code=>{const n=parseInt(String(code||"")[0],36);return Number.isFinite(n)?n:0;};

// Quantos shards sortear quando o pod que atendeu está ATRÁS deste cliente (rollout em curso) antes de
// desistir e cair no backoff normal do Connection. 4×700 ms cobre a troca de pod sem virar laço, e o teto
// existe porque no começo de um rollout TODOS os shards estão velhos — insistir seria martelar a API.
const STALE_MAX=4,STALE_WAIT_MS=700;
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
  // ⚠️ QUATRO EVENTOS, não dois: `pointerdown` cobre mouse e dedo de verdade, mas a certificação de
  // portal ("No audio. The game should not be completely silent") roda por automação, e um clique
  // sintético entrega `click` sem `pointerdown`. `touchend` entra pelo mesmo motivo em WebViews antigas.
  // Custa quatro listeners e um `resume()` que é no-op em contexto já rodando; o preço de faltar é o
  // jogo inteiro mudo, porque o contexto nasce SUSPENSO e nada mais o religa.
  if(typeof addEventListener==="function")for(const ev of ["pointerdown","keydown","click","touchend"])addEventListener(ev,wakeAudio);
  // ?theme= força um tema (dev/screenshots); o relógio do app pode tentar voltar — reaplica uma vez por evento
  const forced=Q.get("theme");let themeGuard=null;
  if(forced&&THEMES[forced]){curTheme=applyTheme(forced);themeGuard=e=>{if(e.detail&&e.detail.id!==forced)setTimeout(()=>applyTheme(forced),0);};addEventListener("warspace:theme",themeGuard);}
  const onThemeEvent=e=>{if(e.detail&&e.detail.theme&&e.detail.theme!==curTheme)game.setTheme(e.detail.theme);};addEventListener("warspace:theme",onThemeEvent);

  // ── estado de rede/simulação ──
  const buffer=createSnapshotBuffer();
  const alvo={x:0,y:0};let inputTimer=0,joy=null,pinch=null;
  // o analógico só vale onde o ponteiro é o DEDO: no mouse o próprio ponteiro já é o controle
  const aplicaJoystick=()=>{if(joy)joy.setEnabled(curPrefs.joystick!==false&&typeof matchMedia!=="undefined"&&matchMedia("(pointer: coarse)").matches);};   // alvo reusado; inputTimer: o envio de input não depende do rAF (ver enviarInput)
  // "" = fechado · "map" = o RADAR ampliado · "live" = a visão em TEMPO REAL da sala (o mesmo radar, ocupando
  // o espaço todo, com o blip na cor da skin, nome e massa, e a posição INTERPOLADA entre as amostras de 2 Hz).
  // Só faz sentido MORTO: com o jogador vivo, ver a sala inteira seria vantagem tática.
  let mapOn="";
  let conn=null,local=null,renderer=null,ready=false,joined=false,joinOpts=null,dead=false,specSlot=-1,visible=true,portalPausado=false,raf=0,lastT=0,selfTick=0,lastHud=0,frames=0,fpsT=0,fps=0,econ=false,econLevel=0,econAlvo=0,statsOv=null;
  let round=null,roundOver=false,roundClock=null,lastCount=-1,warmedSky=null;   // rodada: {start,ticks,dayStart,breakMs} do JSON `room`
  // ── modo, equipe, zona, chat e voz ──
  let modeId=MODE.FREE,teamSize=1,myTeam=-1,phase="live",startsAt=0,roomCap=0,lobby=null,spec=null;   // `lobby` = o estado da tela de espera (JSON `lobby`, em ms)
  let zone=null,zoneShown={x:0,y:0,r:0},lastShrink=0,lastHurt=false,lobbyBeep=false,zoneWarnIdx=0;   // `zone` = o par de círculos do fio; `zoneShown` é o interpolado do frame
  /** @type {{slot:number,name:string,team:number|null,text:string,at:number}[]} */let chatLog=[];
  /** @type {{id:number,at:number,k:string,how:string,n:number,a:object|null,b:object|null,assist:object|null,mine:boolean}[]} */
  let feedLog=[],feedSeq=0;
  const mic=createMic({audio,send:d=>conn&&conn.send(d),onState:st=>{hudStore.update(h=>({...h,talk:st}));},
    // O ícone de "falando" tem que acender no INSTANTE do K, não quando o áudio chega (o clipe só sai ao
    // soltar a tecla). Vai como JSON de controle: o servidor repassa para os mesmos ouvintes do clipe.
    onTalk:on=>{if(conn&&conn.isOpen&&joined)conn.sendJson({t:"talk",on:!!on});
      if(view.mySlot>=0)view.setTalking(view.mySlot,on);}});
  const input=createInputSender({send:d=>conn&&conn.send(d),getTick:()=>predictor.localTick,getRtt:()=>conn?conn.rttAvg:0});
  const predictor=createPredictor({buffer,input});
  const interp=createInterpolator(buffer,{isOwn:e=>predictor.isOwn(e),onVanish});
  const view=createWorldView({buffer,predictor});
  const cam=createCamera(),fstats=createFrameStats();
  let pausado=false;   // menu do Esc aberto: o motor larga o CONTROLE (a partida continua no servidor — ver ui/Pause.jsx)
  const canAct=()=>joined&&!dead&&!roundOver&&!pausado&&conn&&conn.isOpen;
  let aiming=false,aim=null;const pendingEat=new Map();   // id da peça comida → id de quem comeu (destino da sucção no frame do sumiço)
  let travado=-1,travadoAte=0;   // o alvo do último tiro mirado e até quando o anel continua na tela (MISSILE.AIM_HOLD_TICKS)
  let comboN=0,comboT=0;   // acertos SEGUIDOS do meu tiro — só cosmético (fx/som), nunca entra na física
  const actions=createActions({input,prefs:()=>curPrefs,ammo:()=>(view.self&&!view.self.fireCd?view.self.missiles:0),canAct,
    onAim:on=>{aiming=on;if(!on){aim=null;lastLock=-1;audio.stopLoop("aimCharge");}else audio.startLoop("aimCharge",{k:0});},
    onCancel:()=>audio.play("cancel",{mine:true}),
    onNoAmmo:()=>audio.play("error",{mine:true})});
  /** Envelope das ações: repassa tudo e, de quebra, marca o hold do W para o som da cusparada. */
  const somEject=()=>{const m=view.self?view.self.mass:0;
    if(m<EJECT.MIN_R*EJECT.MIN_R)return;   // pequeno demais para cuspir (applyEject recusa): não pode sair som de uma cusparada que não houve
    audio.play("eject",{mine:true,pitch:pitchOf(m)});};
  const act=(a,ph)=>{
    if(a==="eject"){if(ph==="down"){if(canAct()){ejHold=curPrefs.holdEject!==false;ejN=0;ejT=performance.now();somEject();}}
      else ejHold=false;}
    // PUSH-TO-TALK: segurar grava, soltar manda. Não passa pelo `actions` porque não é ação de jogo —
    // não vira flag de INPUT nem é predita; é uma mensagem própria (MSG.VOICE_UP).
    if(a==="talk"){if(ph==="down"){if(joined&&!SEM_VOZ&&curPrefs.voice!==false)mic.start();}else mic.stop();return;}   // morto também fala: o escopo é do servidor (Room._escopoFala)
    if(a==="specPrev"||a==="specNext"){if(ph==="down")game.spectate({dir:a==="specNext"?1:-1});return;}
    if(a==="zoomReset"){if(ph==="down")zoomReset();return;}
    if(a==="swap"&&ph==="down")audio.play("weapon",{mine:true});
    actions.act(a,ph);};
  /** Botão do ponteiro: mira/tiro (esquerdo) e split (direito) são inteiramente do createActions — sem
   *  munição o esquerdo só avisa por som (onNoAmmo), nunca ejeta. */
  const button=(btn,ph,type)=>{
    // O BOTÃO DO MEIO desfaz o que a roda fez. Ele já era interceptado (Pointer.js dá preventDefault nele
    // para não abrir o scroll do meio) e não fazia nada: "o botão da roda desfaz a roda" é a associação mais
    // direta que existe, e não disputa com o esquerdo, que é o tiro com carga de mira.
    if(btn===1&&ph==="down"){zoomReset();return;}
    actions.button(btn,ph,type);};
  /**
   * Um entalhe de roda. ⚠️ O DETENT: um passo que CRUZARIA o zoom automático para exatamente nele. É a única
   * coisa que torna "voltar ao automático" descobrível sem ninguém explicar, e custa uma linha. Efeito
   * colateral bom: para quem tem o tamanho inicial (faixa ±10 %, passo de 12 %) o controle vira literalmente
   * três posições — perto, automático, longe.
   */
  function zoomStep(n){if(!canAct()||!own0.length)return;
    const alvo=zoomF*Math.pow(ZOOM.STEP,n);
    zoomF=(zoomF-1)*(alvo-1)<0?1:alvo;   // cruzou o 1: para nele
    zoomAplica();}
  /** Prende o fator à faixa da massa ATUAL e avisa a rede/HUD se algo mudou. */
  function zoomAplica(){const f=clampZoom(zoomF,focusOf(own0.map(p=>({x:p.rx,y:p.ry,r:p.rr}))).sumR);
    if(f===zoomF)return f;zoomF=f;return f;}
  function zoomReset(){if(zoomF===1)return;zoomF=1;zoomAt=performance.now();agendaView();}
  /** Zoom por PINÇA (Pinch.js): `fator` é a razão de distância entre os dedos desde a última leitura —
      contínuo, não em degraus como a roda. Mesmo pipeline de sempre (clampa pela massa, agenda o {t:"view"}). */
  function zoomPinch(fator){if(!canAct()||!own0.length||!Number.isFinite(fator))return;
    zoomF*=fator;zoomAplica();zoomAt=performance.now();agendaView();}
  const wheel=createWheel({onStep:n=>{zoomStep(n);zoomAt=performance.now();agendaView();},enabled:()=>joined&&!dead&&!isBench(),prefs:curPrefs});
  const keyboard=createKeyboard({onAction:act,enabled:()=>joined&&!pausado,prefs:curPrefs});
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
    pointer=createPointer(r.canvas,{onButton:button});joy=createJoystick(r.canvas,hud);pinch=createPinch(r.canvas,{onZoom:zoomPinch});aplicaJoystick();applyQuality();r.setTheme(curTheme);r.resize();lastT=performance.now();warmSkins();
    if(!raf)raf=requestAnimationFrame(frame);
    if(!inputTimer)inputTimer=setInterval(()=>enviarInput(performance.now()),Math.max(8,Math.round(1000/NET.INPUT_HZ)));}).catch(e=>{console.error("[game] renderer",e&&e.stack||e);container.innerHTML=`<div style="padding:20px;color:#fff">${getLabels().err.noWebGL}: ${e.message}</div>`;});
  // DEBOUNCE obrigatório: o observer dispara a cada frame enquanto a borda da janela é arrastada, e
  // `game.resize()` reenvia `{t:"view"}` ao servidor. Sem isso eram ~60 JSON/s contra um balde de 5/s
  // (NET.RATE_JSON) e a 3ª rejeição em 10 s ENCERRAVA a conexão com RATE — arrastar a janela derrubava o
  // jogador no meio da partida. O canvas em si pode esperar 150 ms; girar o celular continua instantâneo
  // aos olhos porque o layout do CSS não depende deste caminho.
  let roT=0;const agendaResize=()=>{clearTimeout(roT);roT=setTimeout(()=>game.resize(),RESIZE_MS);};
  const ro=typeof ResizeObserver!=="undefined"?new ResizeObserver(agendaResize):null;if(ro)ro.observe(container);
  const onVis=()=>{visible=document.visibilityState!=="hidden";lastT=performance.now();if(visible){frames=0;fpsT=lastT;}};document.addEventListener("visibilitychange",onVis);
  // ⚠️ PAUSA DA PLATAFORMA (portais): o SDK avisa quando uma camada DELES cobre o jogo — anúncio, menu do
  // site, diálogo do sistema — e a certificação do Playgama reprova com "the game continues running when
  // a system overlay is opened. Subscribe to the SDK pause event and stop the game loop". `visibilitychange`
  // NÃO cobre isso: a aba continua visível. Quem avisa é `state/actions.js`, por evento de janela, porque o
  // motor não conhece o React nem os portais (ele roda igual no `?local=1`).
  // ⚠️ O que para é o RENDER, nunca o `enviarInput`: ele tem timer PRÓPRIO (NET.INPUT_HZ, acima) e é por
  // ele que a pausa manda o alvo em cima do próprio centróide — parar os dois faria o planeta seguir
  // andando na última direção, que é o oposto de pausar. O jogo é multijogador e autoritativo no servidor:
  // o mundo continua lá, como continua para qualquer .io.
  const onPortalPause=e=>{portalPausado=!!(e&&e.detail&&e.detail.on);lastT=performance.now();frames=0;fpsT=lastT;};
  addEventListener("warspace:pause",onPortalPause);

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
  function viewSize(){return{w:Math.round(renderer?renderer.W:container.clientWidth||innerWidth),h:Math.round(renderer?renderer.H:container.clientHeight||innerHeight),z:Math.round(zoomF*100)/100};}
  // UM SÓ EMISSOR de `{t:"view"}` — resize e roda passam por aqui. ⚠️ Os dois disputam o MESMO balde de
  // NET.RATE_JSON (5/s) e 3 rejeições em 10 s ENCERRAM a conexão: foi exatamente assim que arrastar a janela
  // derrubava o jogador antes do debounce. Cada um com o seu orçamento estouraria o balde na soma.
  // Throttle com borda de ATAQUE e de saída: a primeira mudança sai na hora (a AOI tem que abrir antes de a
  // câmera chegar lá) e o resto é coalescido. `sujo` só é limpo quando um envio de fato aconteceu — senão uma
  // mensagem perdida com o socket fechado deixaria a borda vazia até o jogador mexer de novo.
  let viewT=0,viewAt=0,viewSujo=false;
  function enviaView(){viewT=0;
    if(!conn||!conn.isOpen||!joined)return;
    const v=viewSize();
    if(v.w===game._vw&&v.h===game._vh&&v.z===game._vz){viewSujo=false;return;}
    game._vw=v.w;game._vh=v.h;game._vz=v.z;viewAt=performance.now();viewSujo=false;
    conn.sendJson({t:"view",w:v.w,h:v.h,z:v.z});}
  function agendaView(){viewSujo=true;const espera=ZOOM.VIEW_MS-(performance.now()-viewAt);
    if(espera<=0)return enviaView();
    if(!viewT)viewT=setTimeout(()=>{if(viewSujo)enviaView();else viewT=0;},espera);}
  // ⚠️ `protocol` nos DOIS: era o campo que o servidor conferia e que o cliente NUNCA mandou, então a
  // guarda de versão de lá (`wsServer.js`) era código morto e quem recusava era este cliente, sozinho,
  // DEPOIS de já ter slot na sala. Declarando, o servidor decide antes de alocar qualquer coisa e ECOA
  // esta versão no `room` — é ela que faz um cliente de outra safra parar de se achar desatualizado.
  function onOpenSend(c){if(c.session){buffer.clear();predictor.reset();c.sendJson({t:"resume",sessionId:c.session.sessionId,resumeToken:c.session.resumeToken,view:viewSize(),protocol:PROTOCOL_VERSION});input.resend();}
    else c.sendJson({t:"join",token:joinOpts.token||null,room:joinOpts.room||null,view:viewSize(),fallbackNick:joinOpts.fallbackNick||"Viajante",skinId:joinOpts.skinId|0,
      mode:joinOpts.mode|0,teamSize:joinOpts.teamSize|0,party:joinOpts.party||null,protocol:PROTOCOL_VERSION});}
  function onJson(m){
    // ⚠️ ANTES de qualquer `cam.update`: `tun` traz os parâmetros do /admin que o CLIENTE lê (a câmera e a
    // arte da estrela). Sem isto o painel mudaria o número só no servidor e o jogo enquadraria diferente
    // dos dois lados — a AOI viria por um zoom e a tela desenharia por outro, o que se lê como uma borda
    // sem comida. `aplicaWire` escreve nos objetos de constants.js, que não são congelados: é o mesmo
    // aliasing que a física do servidor já usa, e vale para todo leitor no frame seguinte.
    if(m.t==="room"||m.t==="phase")aplicaWire(m.tun,RAIZES_WIRE);
    // ⚠️ O TAMANHO DO MUNDO VEM DA SALA, e este campo existia sem consumidor desde sempre (`wsServer` já o
    // mandava e o cliente lia a própria constante). Ele passou a ser parâmetro do /admin aplicado no BOOT
    // do servidor, então um pod com o mundo mudado e um bundle antigo quantizariam em escalas diferentes —
    // TODA posição do fio sairia deslocada, com fator de erro constante e nada na tela dizendo por quê.
    // Chega ANTES de qualquer snapshot, e `protocol/codec.js` lê `WORLD.w` a cada chamada justamente para
    // que isto valha. Câmera, radar, grade, analógico e predição já liam a constante por chamada.
    if(m.t==="room"&&m.world&&m.world.w>0&&(m.world.w!==WORLD.w||m.world.h!==WORLD.h)){
      WORLD.w=m.world.w;WORLD.h=m.world.h;
      if(renderer)renderer.worldResized();}   // a grade e o fundo guardam o tamanho: sem isto ficam do tamanho velho
    if(m.t==="room"){view.mySlot=m.slot;predictor.setSlot(m.slot);view.room=m.code;view.rebuildLb();warmSkins();
      round=m.round||null;roundOver=false;lastCount=-1;warmedSky=null;lastAmmo=0;lastMagnet=false;
      modeId=m.mode|0;teamSize=m.teamSize||1;myTeam=m.team==null?-1:m.team;roomCap=m.cap||0;
      phase=(m.round&&m.round.phase)||"live";startsAt=(m.round&&m.round.startsAt)||0;
      view.setMyTeam(myTeam);chatLog=[];feedLog=[];lobby=null;spec=null;
      souDono=!!m.host;salaPrivada=!!m.private;painel=null;
      audio.resume();audio.play("join",{mine:true});}
    // O painel do DONO da sala (quem está aqui, quem está banido). Só o dono recebe — o servidor decide, e a
    // lista traz `pid` opaco em vez de slot/sessionId: slot recicla e sessionId é metade da credencial de resume.
    else if(m.t==="host"){souDono=!!m.you;salaPrivada=!!m.private;painel={roster:m.roster||[],bans:m.bans||[]};pushHud(performance.now());}
    else if(m.t==="lobby"){   // a sala enchendo: contagem em MS, porque no lobby não há snapshot para sincronizar o tick
      lobby={filled:m.filled,cap:m.cap,humans:m.humans,startsInMs:m.startsInMs,waitMs:m.waitMs,at:performance.now()};
      if(m.startsInMs&&!lobbyBeep){lobbyBeep=true;audio.play("countdown",{mine:true});}}
    else if(m.t==="phase"){   // largada: relógio, contagem e céu saem todos do bloco `round` novo
      phase=m.phase;round=m.round||round;startsAt=(m.round&&m.round.startsAt)||0;lastCount=-1;lobby=null;lobbyBeep=false;
      pushHud(performance.now());   // na hora: o HUD roda a 8 Hz e a tela do lobby ficaria até 125 ms por cima da partida já em curso
      if(phase==="live"){audio.play("matchStart",{mine:true});chatSys(getLabels().killFeed.sys_start);}}
    else if(m.t==="chat"){pushChat(m);}
    else if(m.t==="talk"){view.setTalking(m.slot,!!m.on);}   // push-to-talk de outro: acende/apaga o ícone no planeta dele
    else if(m.t==="feed"){pushFeed(m);}
    // CONVITE DE BATTLE ROYALE: só chega em sala do modo Livre (Room.brInvite filtra no servidor).
    // Interativo — fica no hudStore até responder ou o TTL vencer, ao contrário do `notice` passivo.
    else if(m.t==="brStart"){
      hudStore.update(h=>({...h,brInvite:{room:m.room,at:performance.now(),ttlMs:m.ttlMs|0||20000}}));
      audio.play("toast",{mine:true});}
    // O GÁS COMEÇOU A FECHAR, para a sala inteira (não só quem está perto do círculo novo — o
    // EVENT.ZONE_SHRINK é filtrado por AOI). Reusa o MESMO som `zoneShrink`; o GAP.zoneShrink dedupe
    // quem também recebe o EVENT posicional por estar perto.
    else if(m.t==="zoneMove"){audio.play("zoneShrink",{mine:true});
      hudStore.update(h=>({...h,zoneAlarmAt:performance.now()}));}
    // AVISO GLOBAL do painel /admin: a faixa por cima do jogo E uma linha de sistema no chat. As duas de
    // uma fonte só — quem estava olhando o chat lê ali, quem estava olhando o jogo lê na faixa, e nenhuma
    // delas depende de o jogador ter olhado no instante certo.
    else if(m.t==="notice"){chatSys(m.text);
      hudStore.update(h=>({...h,notice:{text:m.text,level:m.level||"info",at:performance.now(),ttlMs:m.ttlMs|0||12000}}));
      audio.play("toast",{mine:true});}
    // ENTROU GENTE, e só quem é admin recebe (o servidor decide: nenhuma sessão comum vê esta mensagem).
    // Reusa a faixa `#notice`, que já expira sozinha e já é `aria-live`, e tenta a notificação do SISTEMA
    // por cima — ela só sai com permissão já concedida, e a permissão é pedida por um botão em Opções.
    // Nunca `requestPermission()` daqui: o navegador exige gesto do usuário, e num iframe de portal ela
    // nem existe. O toast é o chão.
    else if(m.t==="adm"){
      const L=getLabels(),txt=preenche(L.admJoin||"{n} entrou",{n:m.name||"?"})+(m.room?` (${m.room})`:"");
      chatSys(txt);
      hudStore.update(h=>({...h,notice:{text:txt,level:"info",at:performance.now(),ttlMs:8000}}));
      audio.play("toast",{mine:true});
      notificaSistema(L.admJoinTitle||"warspace.io",txt);}
    else if(m.t==="avatars"){view.setAvatars(m.list);}
    else if(m.t==="flags"){view.setFlags(m.list);}   // bandeira de cada jogador (humano e preenchimento) — ver Room.broadcastFlags
    else if(m.t==="roundEnd"){roundOver=true;input.setHold(false);
      const venci=m.champion&&m.champion.slot===view.mySlot;
      if(venci)celebrate();                                   // ganhei: o planeta comemora
      if(!venci||m.reason!=="lastAlive")endOfWorld();          // o mundo só explode quando acabou o TEMPO (ou quando não fui eu)
      pushHud(performance.now());if(onRoundEnd)onRoundEnd({...m,mySlot:view.mySlot});}
    else if(m.t==="dead"){dead=true;input.setHold(false);mic.cancel();aplicaRadar();pushHud(performance.now());
      // QUEM ME MATOU, com planeta. O `bySlot` já existia no `info` do servidor e parava no `Room.js`; com
      // ele o cliente resolve skin e nível pelo PLAYERS (que traz a sala inteira, não só a AOI) e a tela de
      // morte deixa de dizer só um nome. A skin do MORTO também vai daqui e não de `session.user`: a skin da
      // vida é decidida no servidor (o easter egg por nick mora em `gp.skinId`) e só o PLAYERS a conhece.
      const alg=m.bySlot>=0?view.playerOf(m.bySlot):null,eu=view.playerOf(view.mySlot);
      if(onDead)onDead({by:m.by,bySlot:m.bySlot>=0?m.bySlot:-1,bySkin:alg?alg.skinId|0:0,byLevel:alg?alg.level|0:0,
        mySkin:eu?eu.skinId|0:0,myLevel:eu?eu.level|0:0,myName:eu?eu.name:"",
        byHole:!!m.byHole,byZone:!!m.byZone,score:m.score,maxMass:m.maxMass,kills:m.kills,durationS:m.durationS,placement:m.placement||0,players:m.players||0});}
    // RENASCI, na mesma sessão e na mesma sala (Livre). ⚠️ NÃO repetir o tratamento de `m.t==="room"`: ele
    // zera `chatLog`/`feedLog` e toca o som de entrada — e apagar a conversa de quem estava falando na tela
    // de morte seria uma regressão do jeito mais visível possível. Aqui não houve entrada nenhuma.
    // ⚠️ O `sessionId` precisa ser atualizado: um `resume` depois disto mandaria o da vida MORTA e cairia
    // em ROOM_EXPIRED.
    else if(m.t==="alive"){dead=false;specSlot=-1;spec=null;mapOn="";minimap.setView("",-1);minimap.show(false);
      if(m.sessionId&&conn&&conn.session)conn.session.sessionId=m.sessionId;
      buffer.clear();predictor.reset();view.reset();input.reset();input.setHold(false);cam.reset();
      aplicaRadar();pushHud(performance.now());}
    else if(m.t==="spectate"){specSlot=m.slot>=0?m.slot:-1;spec={slot:specSlot,name:m.name||null,vivos:m.vivos|0};if(mapOn)minimap.setView(mapOn,specSlot);pushHud(performance.now());}   // morto: de quem é a cena que continua rodando atrás da tela de KABOOM
    else if(m.t==="rewards"){if(onRewards)onRewards(m);}}
  function onBinary(m){const now=performance.now();
    switch(m.type){
      case MSG.SNAPSHOT:if(m.self.flags&SELF_FLAG.RESYNC)buffer.clear();buffer.apply(m,now);predictor.onSnapshot(m,conn.rttAvg);view.self=m.self;selfTick=m.tick;if(m.self.flags&SELF_FLAG.DEAD)dead=true;break;
      case MSG.PLAYERS:view.setPlayers(m.players);warmSkins();break;
      case MSG.ZONE:{const shrinking=!!(m.zone.x0!==m.zone.x1||m.zone.y0!==m.zone.y1||m.zone.r0!==m.zone.r1);
        if(!shrinking)zoneWarnIdx=0;   // nova espera começou: os limiares de aviso valem de novo
        zone=m.zone;predictor.setZone(zone);break;}
      case MSG.VOICE:onVoice(m);break;
      case MSG.LEADERBOARD:view.setLeaderboard(m.rows);break;
      case MSG.EVENT:{const kind=FX_OF[m.kind];if(!kind||!renderer)break;const f={x:m.x,y:m.y,r:m.r||10};
        if(DIR_EVENTS.has(m.kind)){const d=unpackDir(m.extra);f.nx=d.nx;f.ny=d.ny;f.power=Math.min(1,d.vn/480);
          if(m.kind===EVENT.SHIELD_HIT)f.level=d.vn;else if(m.kind===EVENT.STAR_HIT)f.n=d.vn;}
        // ⚠️ O nível vem no byte baixo e o "subiu de verdade" no bit 8 (protocolo 15). No teto o 🛡️ continua
        // com anel e som — o que sai é só o TEXTO, que ali não diz mais nada. E ele passou a vir do i18n,
        // como SUPERNOVA/NEBULOSA: estava cravado em português dentro dos TRÊS temas.
        else if(m.kind===EVENT.SHIELD_UP){f.level=m.extra&0xff;f.up=!!(m.extra&0x100);
          if(f.up)f.text=(getLabels().fx||{}).shield||"ESCUDO";}
        // A MESMA estrela morre com dois nomes. Quando quem a matou foi uma TROMBADA de planeta, ela não
        // larga prêmio (STAR.RAM_REWARD) e não é supernova de verdade: é uma nebulosa planetária — e o
        // servidor diz isso mandando o slot de quem trombou no `slotA`, que neste evento estava livre.
        else if(m.kind===EVENT.SUPERNOVA){const L=getLabels().fx||{};
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
        // ── COMBO (cosmético): acerto meu soma, miss explícito ou espera longa demais zera ──
        if(COMBO_HIT.has(m.kind)&&m.slotB===view.mySlot){
          if(now-comboT>COMBO_RESET_MS)comboN=0;
          comboN++;comboT=now;
          if(comboN>=2){
            const L=getLabels().fx||{};
            renderer.fx.add("combo",{x:m.x,y:m.y,r:m.r||10,n:comboN,text:preenche(L.combo||"COMBO {n}x",{n:comboN})},0);
            audio.play("combo",{mine:true,pitch:ESCADA[Math.min(comboN-2,ESCADA.length-1)]});}
        }else if((m.kind===EVENT.CLASH&&(m.slotA===view.mySlot||m.slotB===view.mySlot))||(m.kind===EVENT.DEFLECT&&m.slotA===view.mySlot)){
          comboN=0;}   // miss explícito: não espera o timeout
        break;}}}
  // ── chat ──
  /**
   * SILENCIAR ALGUÉM é do CLIENTE, e de propósito. O jogo não tinha nada disso — dava para desligar o
   * chat e a voz INTEIROS nas Opções, o que é desistir da sala por causa de uma pessoa —, e é requisito
   * formal dos portais que o jogador possa se proteger de outro. Aqui, e não no servidor, porque o efeito
   * é sobre o que ESTE jogador vê e ouve: não precisa de rede, funciona sem banco, vale no `?local=1` e
   * ninguém descobre que foi silenciado. ⚠️ Vale por SALA: o slot é reciclado quando alguém sai, então
   * `leave()` limpa — carregar isto para a sala seguinte silenciaria um desconhecido.
   */
  const mudos=new Map();   // slot → nome de quem foi silenciado (o nome é para a UI conseguir desfazer)
  function pushChat(m){
    if(mudos.has(m.slot))return;   // nem entra no log: o fade é por idade, e uma linha guardada voltaria a aparecer
    chatLog.push({slot:m.slot,name:m.name,team:m.team==null?null:m.team,text:m.text,at:m.at||Date.now(),mine:m.slot===view.mySlot,dead:!!m.dead,scope:m.scope||null});
    if(chatLog.length>40)chatLog.shift();
    hudStore.update(h=>({...h,chat:chatLog.slice()}));
    if(m.slot!==view.mySlot)audio.play("chatIn",{mine:true,bus:"ui"});}
  const chatSys=text=>pushChat({slot:-1,name:null,team:null,text,at:Date.now()});
  /**
   * Notificação do SISTEMA, e só se a permissão JÁ foi concedida. Não se pede aqui: `requestPermission()`
   * exige gesto do usuário (a tela de Opções tem o botão) e no iframe de um portal ela nem existe. Tudo
   * dentro de try/catch porque em contexto inseguro o construtor lança.
   */
  function notificaSistema(titulo,corpo){
    try{
      if(typeof Notification==="undefined"||Notification.permission!=="granted")return;
      if(typeof document!=="undefined"&&!document.hidden)return;   // com a aba na frente, a faixa já disse
      new Notification(titulo,{body:corpo,tag:"warspace-admin",silent:false});
    }catch{}}
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
      // ⚠️ `it.name` ganha do `playerOf` quando existe, e é por isso que a linha de SAÍDA o carrega: quem
      // saiu já não está em `view.players`, e o PLAYERS sem o slot pode chegar antes desta leva.
      const a=it.name?{slot:it.a,name:it.name,bot:false,ally:false,level:0,me:it.a===view.mySlot}:quem(it.a);
      const b=quem(it.b),as=quem(it.by);
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
    if(mudos.has(m.slot))return;   // silenciar é das DUAS bocas: texto e voz. Só uma seria meio silêncio.
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
  function connectWith(makeSocket){conn=createConnection({makeSocket,onJson,onBinary,onState,onOpenSend,onStale});conn.open();}
  // ⚠️ SHARD NOVO A CADA TENTATIVA, e é isso que tira o jogador de um pod ainda antigo durante um rollout:
  // sem código de sala o shard vem do /api/config, que é BALANCEADO entre os pods, então refazer a consulta
  // sorteia de novo. Com código de sala não há escolha (o shard é o 1º char do código) e só resta esperar
  // aquele pod subir — aí o backoff do Connection é o certo, e é o que o teto abaixo devolve.
  let staleTries=0;
  function onStale(){
    if(!joined)return;
    if(++staleTries>STALE_MAX||joinOpts.room){if(conn)conn.retry();return;}
    setTimeout(()=>{if(joined)conectaAoServidor();},STALE_WAIT_MS);}
  function conectaAoServidor(){
    if(!joined)return;
    if(conn){const c=conn;conn=null;c.close();}   // troca de shard: fecha a anterior, senão ficam ping e backoff vivos
    // O host sai de `api/base.js`, não de `location.host`: no iframe de um portal o host é o PORTAL.
    const go=shard=>{if(!joined)return;connectWith(()=>new WebSocket(wsUrl(shard)));};
    if(joinOpts.room)return go(shardOf(joinOpts.room));
    // ⚠️ Sem código de sala o shard vem do /api/config, e o `catch` NÃO pode mascarar: cair no 0 manda
    // a sala inteira para o mesmo shard e, com a API fora, esconde a única pista do que aconteceu.
    fetch(apiUrl("/api/config"),{cache:"no-store"}).then(r=>r.ok?r.json():null).then(c=>go(c&&c.shard!=null?c.shard:0))
      .catch(e=>{console.warn("[net] /api/config falhou, caindo no shard 0:",e&&e.message);go(0);});}
  const game={hudStore,
    /**
     * Manda uma linha de chat (a tela React chama isto). Quem decide o escopo continua sendo o SERVIDOR;
     * `scope` é só o PEDIDO de quem já morreu no Battle Royale ("all" = arquibancada, "team" = esquadrão).
     */
    sendChat(text,scope){const t=String(text||"").trim();if(!t||!conn||!joined)return false;conn.sendJson({t:"chat",text:t.slice(0,240),scope:scope||undefined});return true;},
    /** Push-to-talk pelo botão de toque (o espelho do K para o mobile). */
    talk(on){if(!joined)return;if(on)mic.start();else mic.stop();},
    /**
     * Morto: troca de quem é a câmera. `dir` ±1 anda na lista de vivos por massa (a mesma do placar) e
     * `slot` pula direto para alguém. Quem decide é o SERVIDOR — a AOI da sessão segue o mesmo alvo, senão
     * a câmera olharia para um pedaço de espaço que o servidor não está mandando.
     */
    spectate({slot=-1,dir=0}={}){if(!conn||!joined||!dead)return;conn.sendJson({t:"spectate",slot,dir});},
    /**
     * Renascer SEM reconectar (Livre). Devolve `false` quando não dá para nem tentar — e aí o chamador cai
     * no `play({room})` de sempre, que continua sendo o caminho inteiro e a rede de segurança. O servidor
     * também pode recusar em silêncio (sala acabou, BR): aí o `{t:'alive'}` não chega e o jogador continua
     * na tela de morte, com o botão ainda ali.
     */
    respawn(){if(!conn||!conn.isOpen||!joined||!dead)return false;conn.sendJson({t:"respawn"});return true;},
    zoomReset(){zoomReset();},   // o chip do HUD (e a tecla 0, e o botão do meio) devolvem a câmera ao automático
    /** Silencia (ou devolve a voz a) um jogador. Local, por sala — ver o comentário de `mudos`. */
    mute(slot,on=true){const sl=slot|0;if(sl<0||sl===view.mySlot)return;
      if(on){const p=view.players.get(sl);mudos.set(sl,p?p.name:"?");
        chatLog=chatLog.filter(l=>l.slot!==sl);hudStore.update(h=>({...h,chat:chatLog.slice()}));}
      else mudos.delete(sl);
      hudStore.update(h=>({...h,mudos:[...mudos].map(([slot,name])=>({slot,name}))}));},
    unmuteAll(){mudos.clear();hudStore.update(h=>({...h,mudos:[]}));},
    /**
     * Denúncia. Vai ao servidor e não a lugar nenhum do cliente: silenciar resolve para MIM, denunciar é
     * para o resto da sala — e o servidor é o único que sabe quem é a pessoa por trás do slot e tem as
     * últimas linhas dela (`Room.chatLog`) para anexar ao registro.
     */
    report(slot){const sl=slot|0;if(!conn||!joined||sl<0||sl===view.mySlot)return false;
      conn.sendJson({t:"report",slot:sl});return true;},
    /**
     * Dono da sala: expulsar / banir. Vai pelo WS e não por HTTP porque o socket do dono JÁ está no shard que
     * conhece a sala (ele foi aberto em `/ws/<shardOf(code)>`) — não há nada a rotear, e a identidade dele já
     * foi resolvida no join. Quem autoriza é o servidor: `Room.isHost`.
     */
    hostAct(act,pid){if(!conn||!conn.isOpen||!souDono)return;conn.sendJson({t:"room",act,pid:pid|0});},
    /** Menu do Esc: larga o controle sem sair da sala. Solta o que estiver segurado, senão o W fica preso. */
    setPaused(on){const v=!!on;if(v===pausado)return;pausado=v;
      if(v){ejHold=false;input.setHold(false);actions.reset();if(pointer)pointer.state.down=false;audio.stopLoop("aimCharge");}},
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
      buffer.clear();predictor.reset();interp.update(performance.now());view.reset();input.reset();cam.reset();zoomF=1;hudStore.set({...initialHud(),room:room||null});mapOn="";minimap.setView("",-1);aplicaRadar();
      if(pointer&&renderer)pointer.center(renderer.W,renderer.H);
      // ⚠️ No pacote de portal, servidor fora NÃO vira partida local: o jogador entrou num .io para jogar
      // com gente, e cair calado num single-player é a falha mais enganosa possível — parece que
      // funcionou. Quem avisa é a tela de `servidorFora` (state/actions.js). O `?local=1` e o `?bench`
      // continuam funcionando: o que sai é só o automático.
      const isLocal=useLocal||qflag("local")||isBench()||(api.server===false&&!PORTAL);
      if(isLocal){const rs=+(Q.get("round")||0);   // ?round=<segundos> encurta a rodada local (dev)
        local=createLocalServer(isBench()?benchOptions():{lag:+(Q.get("lag")||0),seed:+(Q.get("seed")||7),...(rs>0?{roundTicks:Math.round(rs*TICK_HZ)}:{})});connectWith(()=>local.connect());return;}
      staleTries=0;conectaAoServidor();},
    // sair é DELIBERADO: avisa o servidor antes de fechar. Sem o `quit`, o `close` do socket é
    // indistinguível de uma queda de rede — a sessão fica em graça por NET.RESUME_MS segurando o slot, e
    // no lobby do battle royale isso põe um fantasma no mapa na largada. A reconexão automática não passa
    // por aqui (ela é do Connection, e volta pelo `resume`), então nada disso atrapalha quem só caiu.
    leave(silent){if(conn){const c=conn;conn=null;try{c.sendJson({t:"quit"});}catch{}c.close();}if(local){local.stop();local=null;}
      const was=joined;joined=false;dead=false;specSlot=-1;spec=null;audio.stop();mic.release();round=null;roundOver=false;roundClock=null;zone=null;mudos.clear();chatLog=[];feedLog=[];phase="live";modeId=MODE.FREE;myTeam=-1;pendingEat.clear();setRoundHour(null);input.reset();input.setHold(false);buffer.clear();predictor.reset();view.reset();zoomF=1;souDono=false;salaPrivada=false;painel=null;mapOn="";minimap.setView("",-1);minimap.show(false);comboN=0;comboT=0;zoneWarnIdx=0;
      if(was&&!silent)hudStore.set({...initialHud()});},
    setPrefs(p){curPrefs={...curPrefs,...(p||{})};aplicaJoystick();applyQuality();audio.setPrefs(curPrefs);aplicaRadar();keyboard.setKeys(curPrefs);wheel.setPrefs(curPrefs);if(renderer)renderer.R.prefs.fx=!curPrefs.reduceMotion;},
    setTheme(t){if(!t||t===curTheme)return;curTheme=t;if(renderer){renderer.setTheme(t);warmSkins();}minimap.setTheme(t);},   // o cache foi invalidado: reaquece as skins para a troca no meio da rodada não engasgar
    /** O painel do TAB abriu/fechou. ⚠️ NÃO mexe em `pausado`: o jogo continua vivo por baixo, e é o
     *  `enviarInput` da pausa (alvo em cima do centróide) que congelaria o planeta. */
    setRoster(on){const v=!!on;if(v===rosterOn)return;rosterOn=v;pushHud(performance.now());},
    /** "Agora não" no convite de Battle Royale: só fecha o card, não sai da sala do Livre. */
    dismissBrInvite(){hudStore.update(h=>({...h,brInvite:null}));},
    resize(){if(!renderer)return;renderer.resize();agendaView();},
    destroy(){destroyed=true;if(typeof window!=="undefined")delete window.__warspace;cancelAnimationFrame(raf);raf=0;clearInterval(inputTimer);inputTimer=0;clearTimeout(roT);if(joy)joy.destroy();if(pinch)pinch.destroy();game.leave(true);audio.suspend();for(const ev of ["pointerdown","keydown","click","touchend"])removeEventListener(ev,wakeAudio);keyboard.destroy();wheel.destroy();touch.destroy();actions.destroy();clearTimeout(viewT);if(pointer)pointer.destroy();minimap.destroy();if(statsOv)statsOv.destroy();
      if(ro)ro.disconnect();document.removeEventListener("visibilitychange",onVis);removeEventListener("warspace:pause",onPortalPause);removeEventListener("warspace:theme",onThemeEvent);if(themeGuard)removeEventListener("warspace:theme",themeGuard);
      if(renderer){renderer.destroy();renderer=null;}ready=false;},
    debug:{stats:()=>({conn,buffer,interp,predictor,view,cam,renderer,fstats,aim,aiming,audio}),local:()=>local,
      hud:()=>hudStore.get(),estado:()=>({modeId,teamSize,myTeam,phase,startsAt,roomCap,lobby,zone}),
      zoom:()=>({f:zoomF,pausado,joined,dead,pref:curPrefs.wheelZoom,span:own0.length?zoomSpan(focusOf(own0.map(p=>({x:p.rx,y:p.ry,r:p.rr}))).sumR):null,pecas:own0.length}),
      fogos:()=>celebrate(),   // aprovar a salva de olho sem ter de vencer um battle royale
      // Derruba o contexto WebGL de propósito. É o único jeito de conferir a recuperação sem ter de estourar
      // a memória de GPU de verdade — e é por não haver esse jeito que o defeito passou tanto tempo no ar.
      loseContext:()=>{if(renderer)renderer.loseContext();},
      qualidade:()=>({nivel:econLevel,alvo:econAlvo,pref:curPrefs.quality||"auto",st:qSt,perdido:!!(renderer&&renderer.R.lost)})},
  };

  // ── qualidade / modo econômico (0 = cheio, 1 = econômico, 2 = mínimo) ──
  // O custo de frame é dominado pelas camadas que cobrem a tela toda (grade e fundo) — por isso cada nível
  // corta resolução E camadas: 1 desliga grade, parallax e trilhas (res .8); 2 ainda tira props (res .6).
  // ⚠️ ERA `[0,.8,.6]` ABSOLUTO, E ERA ISSO QUE DEIXAVA O NOME DOS PLANETAS ILEGÍVEL. `.8` não é "80% da
  // nitidez": é 0,8 pixel de framebuffer por pixel de CSS, enquanto o canvas continua esticado a 100% pelo
  // `#game canvas{width:100%;height:100%}`. A perda é a razão dpr/res — num celular dpr 3 isso é 3,75× de
  // ampliação no nível 1 e 5,0× no nível 2. Aplicado ao nome: o piso `NAME_MIN_PX` é medido em px de CSS,
  // então no pior caso permitido o "em" tem 6 px de DEVICE, o contorno (`strokeWidth` = 11% do em) fica
  // SUB-PIXEL e o miolo é translúcido de propósito (`nameFill` .68, para a arte aparecer por dentro) —
  // contorno que some + miolo transparente + ampliação linear = a mancha borrada.
  // Agora é FATOR do dpr com piso em 1: nunca menos de um texel por pixel de CSS, que é o que a letra
  // precisa para ter forma. O corte de custo que se quer é "menos pixels que o dpr cheio", e não "menos
  // pixels que a tela".
  const ECON_K=[1,.7,.5],RES_PISO=1;
  const resDe=lv=>{const dpr=Math.min(2,devicePixelRatio||1);
    return Math.max(Math.min(dpr,RES_PISO),Math.min(2,dpr*ECON_K[lv]||dpr));};
  const noDedo=()=>typeof matchMedia!=="undefined"&&matchMedia("(pointer: coarse)").matches;
  /**
   * O nível de BOOT. "Alta é prioridade": nasce em 0 e só cai com EVIDÊNCIA DURA, medida — não com palpite.
   * As duas que valem já estão prontas no `createRenderer` e nenhuma delas alimentava a decisão antes:
   * `kind !== "webgl"` (o Pixi caiu para canvas 2D, e ali o jogo é lento de verdade) e `!R.mesh` (sem o pipe
   * de malha o blob nem existe). `hardwareConcurrency`/`deviceMemory` são palpite e por isso só chegam ao
   * nível 1, nunca ao 2.
   * ⚠️ O DEDO deixou de ser motivo. Ele começava em 1 para poupar ~1 s de frame pesado na entrada, e o
   * preço era a partida INTEIRA borrada em todo celular — 1 s de gagueira contra 100% do tempo ilegível.
   * Com o `ECON_K` acima o nível 1 também parou de ser ilegível, então o argumento perdeu as duas pontas.
   */
  function nivelDeBoot(){
    if(!renderer)return 0;
    if(renderer.kind!=="webgl"||!renderer.R.mesh)return 2;
    const nav=typeof navigator!=="undefined"?navigator:null;
    if(nav&&((nav.hardwareConcurrency>0&&nav.hardwareConcurrency<=2)||(nav.deviceMemory>0&&nav.deviceMemory<=2)))return 1;
    return 0;}
  function applyQuality(){if(!renderer)return;const q=curPrefs.quality||"auto";
    if(q==="low")setEcon(2);else if(q==="high")setEcon(0);
    // ⚠️ `auto` REASSENTA, e antes não reassentava nada: o ramo era `if(!econLevel)`, ou seja quem estava em
    // "Baixa" e voltava para "Automática" ficava preso no nível 2 até a política descer dois degraus — e
    // descer exige 2 s de frames rápidos MAIS o backoff, que começa em 30 s e dobra. O jogador clicava em
    // "Automática" e não acontecia nada por meio minuto.
    else{setEcon(nivelDeBoot());qSt=qualidadeZero();}}
  function setEcon(lv){econLevel=lv;econAlvo=lv;econ=lv>0;if(!renderer)return;renderer.setEcon(lv);
    renderer.setResolution(resDe(lv));}
  // A decisão mora em `quality.js`, pura e conferida em tabela (client/test/quality.test.js). Aqui só entram
  // o gatilho e a aplicação — que são coisas separadas DE PROPÓSITO, e é essa separação que tira a piscada:
  // `econCheck` roda no FIM do frame (é onde o tempo do frame fica pronto) e apenas MARCA o nível desejado;
  // quem aplica é `aplicaEcon`, na ABERTURA do frame seguinte. Aplicando no fim, o `app.resize()` de
  // `setResolution` trocava o backing store — o que LIMPA o canvas — e o buraco durava até o render do frame
  // seguinte, que ainda por cima carregava o rebake do céu. Aplicando na abertura, resize e render caem no
  // mesmo tick e o navegador nunca chega a compor um quadro vazio.
  let qSt=qualidadeZero();
  function econCheck(now,ms){if((curPrefs.quality||"auto")!=="auto")return;
    const r=passoQualidade(qSt,{now,ms,nivel:econLevel});qSt=r.st;econAlvo=r.nivel;}
  function aplicaEcon(){if(econAlvo!==econLevel)setEcon(econAlvo);}

  // ── rodada: relógio do espaço (um dia inteiro por rodada), contagem final e explosão do mundo ──
  // Tudo derivado do tick do servidor (buffer.tickAt) + o bloco `round` do JSON `room`: nada extra no fio.
  function roundTick(now){
    if(!round){if(roundClock){roundClock=null;setRoundHour(null);}return;}
    // ⚠️ SALA SEM FIM (`ticks:0`, sala com dono): não há contagem regressiva, mas o CÉU CONTINUA GIRANDO.
    // O relógio do espaço saía de `ticks/days`, e sem `ticks` ele simplesmente pararia — justo na sala que
    // dura mais. Por isso o servidor manda `dayTicks`: para rodada finita o valor é idêntico ao que se
    // calculava aqui (`24·days·rt/ticks ≡ 24·rt/(ticks/days)`), então nada muda nas salas de sempre.
    const dia=round.dayTicks||(round.ticks?round.ticks/(round.days||ROUND.DAYS):0);
    if(!dia){if(roundClock){roundClock=null;setRoundHour(null);}return;}
    const decorrido=Math.max(0,buffer.tickAt(now)-round.start);
    const rt=round.ticks?Math.min(round.ticks,decorrido):decorrido,left=round.ticks?(round.ticks-rt)/TICK_HZ:null;
    const h=(round.dayStart+24*(rt/dia))%24;roundClock={h:Math.floor(h),m:Math.floor(h%1*60),leftS:left==null?null:Math.max(0,left)};
    setRoundHour(h);
    prewarmNextSky(h);
    if(!renderer||dead||left==null)return;   // sem fim: não há contagem regressiva para anunciar
    const n=Math.ceil(left);   // contagem gigante nos segundos finais (um efeito por segundo)
    if(!roundOver&&n>0&&n<=ROUND.WARN_S&&n!==lastCount){lastCount=n;
      renderer.fx.add("countdown",{x:cam.x,y:cam.y,r:cam.H/cam.scale*.16,n});audio.play("countdown",{mine:true});}}
  /**
   * O céu do próximo horário é assado ANTES de entrar (PREWARM_S segundos reais de antecedência): na virada não
   * sobra nada para assar e a tela não engasga. Só vale com a preferência em "auto" (é o relógio da rodada que
   * manda) e o custo é pago uma vez por virada, fora dela.
   */
  function prewarmNextSky(h){
    if(!renderer||!round)return;
    if((curPrefs.theme||"auto")!=="auto")return;
    const dia=round.dayTicks||(round.ticks?round.ticks/(round.days||ROUND.DAYS):0);if(!dia)return;
    const dh=24/(dia/TICK_HZ)*PREWARM_S;   // quantas horas do relógio do espaço andam em PREWARM_S reais (o DIA manda, e ele existe mesmo sem fim de rodada)
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
    if(dead&&!lastDead){audio.stopLoop("alert");audio.stopLoop("magnet");threat=null;lastHurt=false;comboN=0;}
    else if(!dead&&lastDead)audio.play("respawn",{mine:true});
    lastDead=dead;lastAmmo=sf.missiles;lastMagnet=mag;lastFireCd=sf.fireCd;lastMass=sf.mass;
    ameaca(sf);
    if(now-ambT>AMB_MS){ambT=now;
      // ⚠️ `leftS!=null`: numa sala SEM FIM ele é null, e `null<60` é VERDADEIRO (null vira 0) — sem esta
      // guarda a urgência ficaria em 1 desde o primeiro segundo, com a ambiência tensa e a TRILHA presa na
      // seção de clímax para sempre. É o oposto exato do que "sem fim" deveria significar.
      const leftS=roundClock?roundClock.leftS:null;
      const perigoK=dead?0:perigo(),urgencia=leftS!=null&&leftS<60?1-leftS/60:0;
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
    // AVISO REFORÇADO DO GÁS: `zoneIn` já é global (não passa por AOI), então os limiares (10s/3s antes do
    // PRÓXIMO fechamento) são checados aqui mesmo, sem protocolo novo — cada um dispara uma vez por espera
    // (zoneWarnIdx reseta no MSG.ZONE quando uma nova espera começa, ver onBinary).
    const zoneIn0=zone&&Number.isFinite(zone.t1)?Math.max(0,(zone.t1-tk)/TICK_HZ):null;
    const zoneShrinking0=!!(zone&&(zone.x0!==zone.x1||zone.y0!==zone.y1||zone.r0!==zone.r1));
    let zoneWarn=hudStore.get().zoneWarn;
    if(zoneIn0!=null&&!zoneShrinking0){
      while(zoneWarnIdx<ZONE_WARN_AT_S.length&&zoneIn0<=ZONE_WARN_AT_S[zoneWarnIdx]){
        zoneWarn={sec:ZONE_WARN_AT_S[zoneWarnIdx],at:now};zoneWarnIdx++;
        audio.play("zoneWarn",{mine:true});}}
    hudStore.set({mass:s?s.mass:0,score:s?s.score:0,rank:s&&s.rank?s.rank:view.myRank(),coins:null,ammo:s?s.missiles:0,fireCd:sec(s?s.fireCd:0),
      powerups:{magnet:sec(s?s.magnetT:0),shield:s?s.shieldLv|0:0,autodef:s?s.autoDefN|0:0,zoom:sec(s?s.zoomT:0),feast:sec(s?s.feastT:0)},splitCd:cd(s?s.splitCd:0,SPLIT.COOLDOWN_TICKS),ejectCd:cd(s?s.ejectCd:0,EJECT.COOLDOWN_TICKS),
      lb:view.lb,room:view.room,ping:conn?Math.round(conn.rttAvg):0,fps,dead,map:mapOn,clock:roundClock,
      // ZOOM MANUAL: só existe no HUD quando o jogador saiu do automático — widget permanente para
      // funcionalidade ocasional é ruído. `pct` é o que ele PERCEBE (quanto de mundo a mais/a menos), não o
      // fator; `fresh` diz se o gesto foi agora, para o chip aparecer opaco e depois esmaecer.
      zoom:zoomF===1?null:{pct:Math.round((zoomF-1)*100),fresh:now-zoomAt<1500},
      host:souDono?{private:salaPrivada,roster:painel?painel.roster:[],bans:painel?painel.bans:[]}:null,
      mode:modeId,teamSize,team:myTeam,phase,cap:roomCap,
      lobby:lobby?{...lobby,
        // o servidor manda a 2 Hz; aqui o número desce liso, descontando o tempo desde que a mensagem chegou
        startsInMs:lobby.startsInMs?Math.max(0,lobby.startsInMs-(now-lobby.at)):0,
        waitMs:lobby.waitMs?Math.max(0,lobby.waitMs-(now-lobby.at)):0,
        roster:[...view.players.values()].map(p=>({slot:p.slot,name:p.name,skinId:p.skinId,me:p.slot===view.mySlot}))}:null,
      alive:s?s.alive:0,weapon:s?s.weapon|0:0,owned:s?s.owned|1:1,zoneHurt:!!(s&&(s.flags&SELF_FLAG.ZONE_HURT)),
      // CONTADOR DO FECHAMENTO DO GÁS: `zone.t1` já chega pelo fio (MSG.ZONE, ver protocol/codec.js) —
      // é o tick em que a FASE ATUAL (parada ou fechamento) termina, então `(t1-tk)/TICK_HZ` é quanto
      // falta em segundos sem precisar rodar a máquina de fases do servidor aqui (shared/zone.js é dele).
      // `t1` chega `Infinity` quando a zona já fechou tudo (`done`) — aí não há mais o que contar.
      // "Parada = origem e destino iguais" (mesmo comentário do codec): é isso que distingue mostrar
      // "fecha em" (contando para o PRÓXIMO fechamento começar) de "O GÁS ESTÁ AVANÇANDO" (já em curso).
      zoneIn:zoneIn0,zoneShrinking:zoneShrinking0,zoneWarn,
      // brInvite/zoneAlarmAt são escritos por outros handlers via hudStore.update — como este `set` troca
      // o objeto INTEIRO (ver client/src/state/store.js), sem reler o valor atual eles seriam apagados no
      // próximo pushHud (8 Hz), no mesmo molde do `notice` logo abaixo.
      brInvite:hudStore.get().brInvite,zoneAlarmAt:hudStore.get().zoneAlarmAt,
      // O ROSTER DO TAB não custa um byte de protocolo: o PLAYERS já traz a sala INTEIRA fora da AOI (slot,
      // nome, skin, nível, equipe, bot, morto) e o `view.lb` já cruza isso com o placar de 2 Hz, que tem a
      // massa de todos os vivos. O que falta ali são os MORTOS, e eles estão em `view.players` com a flag.
      // Só é montado com o painel ABERTO: `pushHud` roda a 8 Hz, e 50 objetos por tick de HUD para uma
      // tela que quase sempre está fechada é trabalho jogado fora.
      roster:rosterOn?montaRoster():null,
      talk:mic.state,chat:chatLog,feed:feedLog,notice:hudStore.get().notice,spec});}
  /** Todo mundo da sala, vivo ou morto, com a massa de quem está no placar. Ordem: massa, depois nome. */
  function montaRoster(){
    const massa=new Map();for(const l of view.lb)massa.set(l.slot,l.mass);
    const out=[];
    for(const p of view.players.values())
      out.push({slot:p.slot,name:p.name,skinId:p.skinId|0,level:p.level|0,country:p.country||null,
        isBot:!!p.isBot,ally:!!p.ally,dead:!!p.dead,registered:!!p.registered,
        me:p.slot===view.mySlot,mass:massa.get(p.slot)||0});
    out.sort((a,b)=>b.mass-a.mass||String(a.name||"").localeCompare(String(b.name||"")));
    return out;}
  function statsText(){const c=renderer.counts(),st=predictor.stats;
    const net=conn?`rtt ${conn.rttAvg.toFixed(0)} ms · clock off ${Number.isNaN(buffer.offset)?"—":buffer.offset.toFixed(1)} tk (jit ${buffer.offsetJitter.toFixed(2)}) · interp ${interp.delayMs.toFixed(0)} ms (seco ${interp.dry}, extrap ${interp.extrap}) · bytes/s ${bytesRate.toFixed(0)} · msgs ${conn.msgsIn}`:"sem conexão";
    return`${isBench()?"BENCH":"STATS"} · ${renderer.kind} · ${bodyMode()} · ${fps} fps${econ?" · ECON "+econLevel:""}\nframe ${fstats.avgFrame.toFixed(2)} ms (update ${fstats.avgUpdate.toFixed(2)} + render ${fstats.avgRender.toFixed(2)}) · p95 ${fstats.p95.toFixed(2)}\n${net}\npred: corr média ${st.corrAvg.toFixed(1)} px · última ${st.lastCorr.toFixed(1)} px · replay ${st.replaySteps} tk · pend ${input.pending} · hist ${input.history.length} · seq ${input.sent}\nents: planetas ${c.planets} · comida ${c.food} · ejet ${c.ejected} · ast ${c.asteroids} · buracos ${c.holes} · estrelas ${c.stars} · mísseis ${c.missiles} · fx ${c.fx} · buffer ${buffer.entities.size}\ndraw calls ≈ ${renderer.drawCallsEstimate()} · texturas ${c.textures} (${c.texMB} MB) · res ${renderer.R.res.toFixed(2)} · ${renderer.W}×${renderer.H}`;}
  let bytesRate=0,bytesLast=0,bytesT=0,themeAt=0,own0=[];
  // ZOOM MANUAL (a roda). O fator é guardado CRU e reclampado todo frame pela faixa da massa do momento
  // (`clampZoom`): assim a faixa anda junto com o jogador e leva o fator com ela — quem estacionou no máximo
  // afastado continua no máximo enquanto cresce (a visão abre sozinha, sem degrau), e quem foi comido até o
  // tamanho inicial volta ao automático sem ter de desfazer oito entalhes fantasmas. Estado de VISTA por
  // partida: mora aqui, não na store, e `leave()`/`join()` o zeram junto do `cam.reset()`.
  let zoomF=1,zoomAt=0;
  let souDono=false,salaPrivada=false,painel=null;   // sala com dono: o painel só existe para quem é o dono
  let rosterOn=false;   // o painel do TAB está aberto? (só então o roster é montado — ver montaRoster)

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
    // ⚠️ A PAUSA usa o MESMO caminho, e pelo mesmo motivo. Um overlay não impede o planeta de andar: o
    // ponteiro é lido na JANELA (input/Pointer.js), então o alvo continuaria seguindo o mouse por cima do
    // modal — o jogador abriria o menu para mexer no volume e voltaria tendo atravessado meio mapa.
    if(roundOver||pausado){
      if(own0.length){w=alvo;w.x=cx;w.y=cy;input.setTarget(cx,cy);predictor.setTarget(cx,cy);}
      if(conn.isOpen)input.update(now);
      return;}
    if(joy&&joy.enabled&&joy.state.on&&own0.length){
      // ESPALHAMENTO (o `spread` do focusOf, à mão): o alvo do analógico tem que ficar longe o bastante para
      // DOMINÁ-LO, senão ele cai dentro do próprio cacho e as peças se anulam — 8% da velocidade dividido, e
      // ZERO com o eixo do split alinhado ao rumo (ver joyTarget). `focusOf` espera {x,y,r} e own0 tem
      // {rx,ry,rr}, então reusá-lo custaria um .map() por envio, 30×/s, para devolver dois números que aqui
      // não servem; e comparar d² deixa UMA raiz no fim, como faz o integrate.js.
      let s2=0;if(own0.length>1)for(const p of own0){const dx=p.rx-cx,dy=p.ry-cy,d2=dx*dx+dy*dy;if(d2>s2)s2=d2;}
      w=joy.target(cx,cy,s2>0?Math.sqrt(s2):0,alvo);}   // analógico: direção do polegar, distância = velocidade (+ espalhamento)
    else if(joy&&joy.enabled)   { if(own0.length){w=alvo;w.x=cx;w.y=cy;} }                                // solto = alvo no centróide: peça única PARA; dividido, as peças CONVERGEM (reagrupar) — não existe alvo único que pare peças dispersas, ver joyTarget
    else if(pointer&&pointer.state.active)w=cam.toWorld(pointer.state.sx,pointer.state.sy);
    else if(own0.length){w=alvo;w.x=cx;w.y=cy;}   // sem ponteiro ainda: fica parado
    if(w){input.setTarget(w.x,w.y);predictor.setTarget(w.x,w.y);}   // o alvo é marcado mesmo com o socket caído (a predição local continua)
    if(conn.isOpen)input.update(now);}
  function frame(now){raf=requestAnimationFrame(frame);if(!ready)return;
    if(portalPausado){lastT=now;return;}   // camada da plataforma por cima: nada de render (ver onPortalPause)
    // o teto do passo tem que bater com o do acumulador do Predictor (.25): com .1 aqui, uma travada de
    // 300 ms fazia o servidor andar 300 ms e a predição só 100 — a peça ficava para trás e o snapshot
    // seguinte passava dos NET.SNAP_DIST e dava o solavanco. O Predictor já limita a 15 sub-passos.
    const dt=Math.min(.25,Math.max(0,(now-lastT)/1000));lastT=now;const t0=performance.now();
    frames++;if(now-fpsT>1000){fps=Math.round(frames*1000/(now-fpsT));frames=0;fpsT=now;}
    if(forced&&document.documentElement.dataset.theme!==forced&&now-themeAt>500){themeAt=now;applyTheme(forced);}
    if(renderer.R.theme!==curTheme)renderer.setTheme(curTheme);
    aplicaEcon();   // a troca de nível acontece AQUI, no mesmo tick do render — ver econCheck
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
    // O fator da roda é reclampado TODO FRAME pela faixa da massa do momento (ver `zoomF`): a faixa fecha
    // sozinha quando o jogador encolhe, e o servidor faz a mesma conta com o ΣR dele — é isso que faz os
    // dois enquadrarem a mesma coisa sem um byte novo de protocolo.
    let zf=1;
    if(own.length){const antes=zoomF;zf=zoomAplica();if(zf!==antes)agendaView();}
    cam.update(camPieces,dt,joined||!conn,view.self&&view.self.zoomT>0?POWERUP.ZOOM_K:1,zf);   // na sala sem peças (morto/BIG CRUNCH) a câmera congela: é o que o AOI do servidor continua mandando
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

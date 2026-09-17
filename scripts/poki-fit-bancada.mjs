// ── BANCADA DO RELÓGIO DO PLAYER FIT TEST: O SDK DA POKI VÊ O DEDO QUE DIRIGE? ─────────────
// A pergunta que custou ~20 rodadas reprovadas: no celular, o relógio DELES (o relator do Fit Test, replicado
// verbatim em `scripts/poki-stub.js`) congela para sempre depois de 60 s sem um `pointerdown`/`keydown` que o
// listener de BOLHA deles veja — e o `down` do nosso direcional dava `stopPropagation()` em captura. Para a
// Poki, quem só DIRIGE (o novato inteiro) não interagia nunca, e a duração dele parava em ~2m10.
// Este script é o antes/depois: abre o pacote da Poki com o stub, num "celular" emulado, dirige SÓ por
// toques no canvas (nenhum botão do HUD) e imprime o que o painel deles leria.
//
//   DATABASE_URL=postgres://planet:planet@127.0.0.1:5433/planet PORT=3002 SHARDS=1 MIGRATE_ON_START=1 \
//     ALLOWED_ORIGINS=http://127.0.0.1:4173 npm -w server start          # ⚠️ `start`, nunca `dev`
//   WARSPACE_API_BASE=http://127.0.0.1:3002 VITE_POKI_SDK_URL=./poki-sdk.js node scripts/portal-pack.mjs poki
//   cp scripts/poki-stub.js portal/poki/dist/poki-sdk.js
//   python3 -m http.server 4173 --directory portal
//   node scripts/poki-fit-bancada.mjs [http://127.0.0.1:4173/poki/dist/] [--seg 40]
//
// ⚠️ **O TIMEOUT É ENCURTADO** (`__fitTimeoutMs` 15 s, tick de 2 s): a regra é a mesma, e ninguém precisa
//    esperar 70 s por rodada para ler um booleano. Os 60 s de verdade continuam sendo o padrão do stub.
// ⚠️ **`matchMedia("(pointer: coarse)")` É FORÇADO por um calço**, e o script ABORTA se ele não pegar: o
//    direcional só é armado no dedo (`aplicaJoystick`, game/index.js), o CDP não emula esse media feature de
//    forma confiável, e sem o direcional armado o toque cairia no `Pointer.js` — a bancada mediria OUTRO
//    caminho e aprovaria qualquer coisa (a lição da matriz que aprovava página em branco).
// ⚠️ `?tutorial=0` pula o tutorial (a pergunta é sobre a PARTIDA, onde o novato só dirige).
// ⚠️ **SÃO DUAS PERGUNTAS, E CADA BUILD RESPONDE UMA.** No PACOTE o stub responde "o SDK viu o dedo?", mas
//    `?perf` é desligado lá (`isPerf=()=>!PORTAL&&…`), então não há `__warspace` para provar que o planeta
//    OBEDECE. No build de DEV é o contrário: há `__warspace` (a câmera tem de andar e VIRAR com os toques) e
//    não há SDK. Rode nos dois — o conserto só vale se as duas respostas forem sim:
//      node scripts/poki-fit-bancada.mjs                                  # pacote: o SDK vê?
//      node scripts/poki-fit-bancada.mjs "http://127.0.0.1:5174/?local=1&tutorial=1" # dev: o controle continua igual?
// @ts-check
import {spawn} from "node:child_process";

const arg=n=>{const i=process.argv.indexOf("--"+n);return i>0?process.argv[i+1]:null;};
const BASE=(process.argv[2]&&!process.argv[2].startsWith("--")?process.argv[2]:"http://127.0.0.1:4173/poki/dist/");
const SEG=+(arg("seg")||40),PORT=9500+Math.floor(Math.random()*300);
const CHROME=process.env.CHROME_BIN||"/opt/google/chrome/chrome";
const W=390,H=844;

const ch=spawn(CHROME,["--headless=new",`--remote-debugging-port=${PORT}`,"--no-sandbox","--disable-dev-shm-usage",
  "--use-gl=swiftshader","--enable-unsafe-swiftshader",`--window-size=${W},${H}`,"about:blank"],{stdio:"ignore"});
const fim=c=>{try{ch.kill();}catch{}process.exit(c);};
let alvo=null;
for(let i=0;i<60&&!alvo;i++){await new Promise(r=>setTimeout(r,300));
  try{const l=await fetch(`http://127.0.0.1:${PORT}/json`).then(r=>r.json());alvo=l.find(t=>t.type==="page");}catch{}}
if(!alvo){console.error("não consegui abrir o Chrome");fim(2);}
const {default:WebSocket}=await import(new URL("../node_modules/ws/index.js",import.meta.url).pathname);
const ws=new WebSocket(alvo.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:64*1024*1024});
await new Promise(r=>ws.on("open",r));
let id=1;const call=(m,p={})=>new Promise(res=>{const i=id++;
  const h=d=>{const j=JSON.parse(d);if(j.id===i){ws.off("message",h);res(j.result);}};ws.on("message",h);
  ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const o=await call("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  return o&&o.result?o.result.value:null;};
const dorme=ms=>new Promise(r=>setTimeout(r,ms));

await call("Page.enable");await call("Runtime.enable");
await call("Emulation.setDeviceMetricsOverride",{width:W,height:H,deviceScaleFactor:1,mobile:true});
await call("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:5});
await call("Page.addScriptToEvaluateOnNewDocument",{source:`
  window.__fitTimeoutMs=15000;window.__fitTickMs=2000;
  (function(){const mm=window.matchMedia.bind(window);
    window.matchMedia=q=>/pointer:\\s*coarse/.test(q)?{matches:true,media:q,onchange:null,addListener(){},removeListener(){},
      addEventListener(){},removeEventListener(){},dispatchEvent(){return false;}}:mm(q);})();`});
// `perf` só vale fora do pacote; e quem já disse `tutorial=` na URL manda (no build de DEV o boot para na tela
// inicial, então lá a partida da bancada é o próprio tutorial: `?local=1&tutorial=1` — mesmo motor, mesmo direcional)
await call("Page.navigate",{url:BASE+(BASE.includes("?")?"&":"?")+(BASE.includes("tutorial=")?"":"tutorial=0&")+"perf"});

// ── esperar a arena ──
let tela="";
for(let i=0;i<60;i++){await dorme(500);tela=await ev("document.body.dataset.screen||''");if(tela==="game")break;}
if(tela!=="game"){console.error(`a arena não abriu (tela="${tela}") — o servidor local está de pé e o pacote foi feito com WARSPACE_API_BASE?`);fim(2);}
await dorme(2500);   // o primeiro snapshot: sem peça própria a câmera ainda é a do lobby
const temSdk=await ev("typeof window.__sdkFit==='function'"),temCam=await ev("!!(window.__warspace&&window.__warspace.stats)");
if(!temSdk&&!temCam){console.error("nem stub (`cp scripts/poki-stub.js portal/poki/dist/poki-sdk.js`) nem `__warspace` (build de dev com ?perf): não há o que medir aqui");fim(2);}
if(!await ev("matchMedia('(pointer: coarse)').matches")){console.error("o calço de (pointer: coarse) não pegou — sem ele o direcional não arma e a bancada mede outro caminho");fim(2);}

// ── dirigir SÓ por toque no canvas: um toque a cada 3 s, rodando o alvo em volta do planeta ──
// ⚠️ à prova de recarga: se a página recarregar no meio (build desatualizada, queda), `__warspace` some por um
// instante — a amostra repete a anterior em vez de derrubar a bancada, e a tela final é impressa de todo jeito.
let ultCam=[0,0];
const cam=async()=>{const v=await ev("(()=>{try{const c=window.__warspace.stats().cam;return [Math.round(c.x),Math.round(c.y)];}catch(e){return null;}})()");
  if(Array.isArray(v))ultCam=v;return ultCam;};
const pontos=[[W*.85,H*.5],[W*.5,H*.2],[W*.15,H*.5],[W*.5,H*.8]];
const rota=[await cam()];
const t0=Date.now();let n=0;
while(Date.now()-t0<SEG*1000){
  const [x,y]=pontos[n++%pontos.length];
  await call("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y,id:1}]});
  await dorme(60);
  await call("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await dorme(2940);rota.push(await cam());}

const fit=temSdk?await ev("window.__sdkFit()"):null,res=temSdk?await ev("window.__sdkResumo()"):null;
console.log("tela final: "+await ev("document.body.dataset.screen")+(temCam?" · rota da câmera: "+rota.map(p=>p.join(",")).join(" → "):""));
const andou=rota.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-rota[i][0],p[1]-rota[i][1]),0);
// virou? o sinal do deslocamento em X tem de trocar entre o 1º toque (direita) e o 3º (esquerda)
const dx=rota.slice(1).map((p,i)=>p[0]-rota[i][0]);
const virou=dx.some(v=>v>30)&&dx.some(v=>v<-30);
console.log(`\n## ${SEG} s dirigindo só por toque no canvas (${n} toques, nenhum botão)`);
let ok=true;
if(temCam){console.log("o planeta obedeceu?   andou "+Math.round(andou)+" px · "+(virou?"VIROU com os toques ✓":"NÃO virou ✗"));ok=ok&&virou;}
else console.log("o planeta obedeceu?   (sem `__warspace` neste build — confira no de dev, ver o cabeçalho)");
if(temSdk){console.log("gameplayStart:        "+(res.seq.filter(s=>s.includes("gameplayStart")).join(" | ")||"NENHUM"));
  console.log("relógio do Fit Test:  ",fit);
  const viu=fit.haveInteraction&&!fit.timedOut&&res.invalidos===0&&res.gameplayStart>0;ok=ok&&viu;
  console.log(viu?"\n✓ o SDK VÊ o dedo que dirige: a duração segue contando":"\n✗ o SDK NÃO vê o dedo que dirige: a duração deste jogador CONGELA");}
else console.log("SDK:                  (sem stub neste build — confira no pacote, ver o cabeçalho)");
fim(ok?0:1);

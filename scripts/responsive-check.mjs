// ── MATRIZ DE RESPONSIVIDADE ──────────────────────────────────────────────────
// Percorre aparelhos × telas num Chrome headless e transforma "está responsivo?" em asserção:
//   1. nada transborda na horizontal (scrollWidth > innerWidth)
//   2. nenhum alvo tocável abaixo de 44 px, onde o ponteiro é o dedo
//   3. nenhum par de blocos do HUD se sobrepondo
//   4. nada saindo da viewport (aproximação de área segura)
//   5. a caixa da tela cabe na janela quando não há como rolar até ela
//   6. nenhum CONTÊINER rolando na horizontal (o critério 1 mede o DOCUMENTO e não pega a caixa das telas)
// As TELAS são DOM (React) e renderizam bem em headless; só o canvas do Pixi não roda aqui — por isso a
// matriz mede layout e HUD, e o jogo em si continua sendo aprovado de olho, em Chrome de verdade.
// uso:  node scripts/responsive-check.mjs [url]        (padrão: http://127.0.0.1:5173)
import {spawn} from "node:child_process";

const BASE=process.argv[2]||process.env.RESP_URL||"http://127.0.0.1:5173";
const PORT=9800+Math.floor(Math.random()*300);
const CHROME=process.env.CHROME_BIN||"/opt/google/chrome/chrome";
const APARELHOS=[   // nome, largura, altura, dedo?, modo (o mesmo que modeFor devolve — ver o teste unitário)
  ["iPhone SE em pé",375,667,1,"portrait"],   ["iPhone SE deitado",667,375,1,"landscape"],
  ["iPhone 14 em pé",390,844,1,"portrait"],   ["iPhone 14 deitado",844,390,1,"landscape"],
  ["Galaxy S8 em pé",360,740,1,"portrait"],   ["iPhone Pro Max em pé",430,932,1,"portrait"],
  ["iPad mini deitado",1133,744,1,"tablet"],  ["iPad 10.9 deitado",1180,820,1,"tablet"],
  ["iPad Pro em pé",1024,1366,1,"tablet"],
  ["Notebook",1440,900,0,"desktop"],          ["Desktop",1920,1080,0,"desktop"],["Ultrawide",2560,1080,0,"desktop"],
];
// `dead` e `round` são as telas do PÓS-JOGO (menu na gaveta, câmera à esquerda) e ficavam de fora — logo
// as duas que mais precisam: o card do fim de rodada não tinha CSS nenhum e caía cortado no canto.
// `entry@rail` é a MESMA tela inicial no estado "já joguei nesta aba", que é quando ela vira gaveta.
// `shop@rail` é a gaveta com o conteúdo MAIS largo do jogo: os três temas fixavam a grade de skins em 3
// colunas, que respondem à largura da TELA e não à do painel — em 480 px os cartões transbordavam e a loja
// ganhava barra de rolagem horizontal. Nenhuma combinação de `shop` no centro pegava isso.
// `round:<estilo>` são os TRÊS modelos da tela de fim de rodada (ui/Round.jsx). Medir um só não serve:
// eles têm larguras de caixa diferentes (`--screen-w`), o dossiê é de duas colunas e o cinema desenha o
// planeta do campeão com 340 px — cada um cai de um jeito diferente numa tela baixa.
// ⚠️ `modes@rail` entrou porque a tela de Modos NÃO era medida na gaveta — só `entry@rail` e `shop@rail`
// existiam aqui —, e é lá que o cartão largo aperta: na gaveta o bloco "TODA TELA NO MESMO LUGAR" não se
// aplica (`body:not([data-shell="rail"])`), quem manda é o CSS de gaveta do tema com `--drawer-w`, e o
// `#s-modes{--screen-w:760px}` não vale.
const TELAS=["entry","entry@rail","modes","modes@rail","lobby","rank","profile","shop","shop@rail","prefs","game",
  "dead:duelo","dead:balanco","dead:sala","round:podio","round:cinema","round:dossie"];
const TEMAS=(process.env.RESP_TEMAS||"dawn,sunset,dusk").split(",");   // o dusk é o mais fraco: tem menos regras de mobile que os outros dois

const ch=spawn(CHROME,["--headless=new",`--remote-debugging-port=${PORT}`,"--no-sandbox","--disable-dev-shm-usage",
  "--use-gl=swiftshader","--enable-unsafe-swiftshader","--window-size=1920,1080",BASE+"/?local=1"],{stdio:"ignore"});
const fim=c=>{try{ch.kill();}catch{}process.exit(c);};
let alvo=null;
for(let i=0;i<60&&!alvo;i++){await new Promise(r=>setTimeout(r,300));
  try{const l=await fetch(`http://127.0.0.1:${PORT}/json`).then(r=>r.json());alvo=l.find(t=>t.type==="page"&&t.url.startsWith(BASE));}catch{}}
if(!alvo){console.error("não consegui abrir o Chrome em "+BASE);fim(2);}
const {default:WebSocket}=await import(new URL("../node_modules/ws/index.js",import.meta.url).pathname);
const ws=new WebSocket(alvo.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:64*1024*1024});
await new Promise(r=>ws.on("open",r));
let id=1;const call=(m,p={})=>new Promise(res=>{const i=id++;
  const h=d=>{const j=JSON.parse(d);if(j.id===i){ws.off("message",h);res(j.result);}};ws.on("message",h);
  ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const o=await call("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});
  return o&&o.result?o.result.value:null;};
await call("Runtime.enable");
await new Promise(r=>setTimeout(r,3500));

// Navegar por CLIQUE só funciona quando a tela atual tem o botão certo — e `dead`/`round` não têm nenhum,
// então o resíduo delas vazava para a combinação seguinte e a sonda media a tela errada. `window.__tela`
// (exposto em DEV por state/actions.js) leva a qualquer tela de qualquer tela. O clique fica de reserva.
const IR=t=>`(()=>{if(window.__tela){window.__tela(${JSON.stringify(t)});return 1;}
  const b=document.querySelector('[data-go="${t}"]');if(b){b.click();return 1;}return 0;})()`;
const SONDA=`(()=>{
  const hud=document.getElementById('hud'),tela=document.querySelector('.screen.on');
  const jogo=!tela; if(jogo&&hud)hud.classList.remove('hidden');
  const vis=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>0.01;};
  const nome=el=>el.id?'#'+el.id:(el.className&&el.className.baseVal===undefined?'.'+String(el.className).trim().split(/\\s+/)[0]:el.tagName);
  const over=Math.max(0,document.documentElement.scrollWidth-innerWidth);
  const dedo=document.body.dataset.pointer==='coarse',pequenos=[];
  if(dedo)for(const el of document.querySelectorAll('button,a[href],input,select,[role=button]')){
    if(!vis(el))continue;const r=el.getBoundingClientRect();
    if(r.width<44||r.height<44)pequenos.push(nome(el)+' '+Math.round(r.width)+'x'+Math.round(r.height));}
  // Só blocos com CAIXA própria: os wrappers (#hud-left é display:contents no desktop, #hud-right contém
  // os três da direita) colidiriam com os próprios filhos e dariam falso positivo o tempo todo.
  const ids=['hud-top','hud-lb','hud-score','hud-status','hud-mode','touch','chat','talk','radar','toast','kill-feed'];
  const cai=ids.map(i=>document.getElementById(i)).filter(e=>e&&vis(e)),cx=[];
  for(let a=0;a<cai.length;a++)for(let b=a+1;b<cai.length;b++){
    const A=cai[a].getBoundingClientRect(),B=cai[b].getBoundingClientRect();
    const ox=Math.min(A.right,B.right)-Math.max(A.left,B.left),oy=Math.min(A.bottom,B.bottom)-Math.max(A.top,B.top);
    if(ox>4&&oy>4)cx.push(cai[a].id+'×'+cai[b].id+' '+Math.round(ox)+'×'+Math.round(oy)+'px');}
  // CLIPADO = fora de um ancestral que corta E NÃO ROLA. Conteúdo que passa da dobra mas está num container
  // rolável é normal; o que interessa é o inalcançável — como os botões do fim de rodada, que ficam abaixo de
  // um .screen com overflow:hidden.
  const rolavel=(el,eixo)=>{const s=getComputedStyle(el),o=eixo==='y'?s.overflowY:s.overflowX;
    if(o==='visible'||o==='clip')return null;                      // não corta
    const pode=eixo==='y'?el.scrollHeight-el.clientHeight>2:el.scrollWidth-el.clientWidth>2;
    return pode?'rola':'corta';};
  const clipado=[];
  const candidatos=tela?tela.querySelectorAll('button,a[href],input,select,.card,table,.wrap'):cai;
  for(const e2 of candidatos){if(!vis(e2))continue;const r=e2.getBoundingClientRect();
    for(let p=e2.parentElement;p&&p!==document.body;p=p.parentElement){
      const pr=p.getBoundingClientRect();
      const cy=rolavel(p,'y'),cx2=rolavel(p,'x');
      if(cy==='rola'||cx2==='rola')break;                          // achei quem rola: o conteúdo é alcançável
      if(cy==='corta'&&(r.bottom>pr.bottom+2||r.top<pr.top-2)){clipado.push(nome(e2)+' cortado em '+nome(p)+'↕');break;}
      if(cx2==='corta'&&(r.right>pr.right+2||r.left<pr.left-2)){clipado.push(nome(e2)+' cortado em '+nome(p)+'↔');break;}}}
  const fora=[...new Set(clipado)];
  // A CAIXA CABE NA JANELA. O critério "clipado" acima NÃO pega isto, e o motivo é sutil: um ancestral
  // com overflow:hidden cujo conteúdo transborda para BAIXO tem scrollHeight>clientHeight, então
  // rolavel() o chama de "rola" e a varredura para ali. Ou seja: empurrar o painel inteiro para debaixo
  // da dobra passava limpo pela matriz. Isto virou risco de verdade quando --screen-top deixou de ser um
  // número fixo e passou a ser a altura do logo do cenário: em tela baixa, é o primeiro que estoura.
  // A barra de navegação entra junto porque ela é o rodapé do cartão: se ela sai da janela, saem com ela
  // os três blocos que os temas colam em sticky;bottom:74px.
  // ⚠️ Só vale quando NÃO HÁ COMO ROLAR até lá: a tela inicial é uma caixa de altura livre dentro de um
  // .screen que rola de propósito, e acusá-la seria confundir "layout alto" com "conteúdo perdido".
  // (Sem crase em comentário nenhum daqui: a sonda inteira é um template literal.)
  const caixa=tela&&tela.querySelector('.wrap,.dead-card'),estoura=[];
  let podeRolar=false;
  for(let p=caixa&&caixa.parentElement;p&&p!==document.body;p=p.parentElement)
    if(rolavel(p,'y')==='rola'){podeRolar=true;break;}
  if(caixa&&vis(caixa)&&!podeRolar){const r=caixa.getBoundingClientRect();
    if(r.bottom>innerHeight+1)estoura.push('caixa passa '+Math.round(r.bottom-innerHeight)+'px do rodapé');
    if(r.top<-1)estoura.push('caixa começa '+Math.round(-r.top)+'px acima do topo');
    const nav=caixa.querySelector(':scope>nav.nav');
    if(nav&&vis(nav)){const n=nav.getBoundingClientRect();
      if(n.bottom>innerHeight+1)estoura.push('a barra sai '+Math.round(n.bottom-innerHeight)+'px da janela');}}
  // NENHUM CONTÊINER ROLA DE LADO. O critério 1 mede o DOCUMENTO, e por isso deixou passar um defeito que
  // o jogador sente na mão: a caixa das telas é overflow:auto, e bastou a barra de navegação passar 2 px do
  // padding para ela ganhar um eixo horizontal próprio — o documento não transbordava, mas o painel andava
  // de lado no dedo e a rolagem vertical saía torta. Nenhuma tela do jogo tem conteúdo horizontal, então
  // qualquer sobra aqui é defeito. Só auto/scroll: hidden e clip CORTAM (é o caso do #cena, que planta
  // sprites fora da tela de propósito) e quem cobra corte é o critério "clipado".
  // (Sem crase aqui: a sonda inteira é um template literal — já custou uma rodada da matriz.)
  const lados=[];
  for(const el of document.querySelectorAll('#app *')){
    const s2=getComputedStyle(el);if(s2.display==='none')continue;
    if((s2.overflowX==='auto'||s2.overflowX==='scroll')&&el.scrollWidth-el.clientWidth>1)
      lados.push(nome(el)+' '+el.scrollWidth+'>'+el.clientWidth);}
  return{modo:document.body.dataset.mode,ponteiro:document.body.dataset.pointer,over,pequenos,cx,
         fora:fora.slice(0,6),estoura,lados:[...new Set(lados)].slice(0,4),tela:tela?tela.id:'game'};
})()`;

let falhas=0;const linhas=[];
for(const [nome,w,h,toque,modo] of APARELHOS){
  await call("Emulation.setDeviceMetricsOverride",{width:w,height:h,deviceScaleFactor:1,mobile:!!toque});
  await call("Emulation.setTouchEmulationEnabled",{enabled:!!toque,maxTouchPoints:toque?5:0});
  await call("Emulation.setEmulatedMedia",{features:[{name:"pointer",value:toque?"coarse":"fine"},
                                                     {name:"any-pointer",value:toque?"coarse":"fine"},
                                                     {name:"hover",value:toque?"none":"hover"}]});
  await ev("window.dispatchEvent(new Event('resize'))");
  await new Promise(r=>setTimeout(r,400));
  // O CDP não consegue emular `pointer: coarse` de forma confiável, então a matriz FIXA a classificação em
  // vez de deduzi-la. A separação é proposital: quem prova que 1180×820 com toque é `tablet` é o teste
  // unitário de `modeFor` (client/test/viewport.test.js); aqui o que se mede é o LAYOUT dado um modo.
  await ev(`document.body.dataset.mode=${JSON.stringify(modo)};document.body.dataset.pointer=${JSON.stringify(toque?"coarse":"fine")};`);
  await new Promise(r=>setTimeout(r,120));
 for(const tema of TEMAS){
  await ev(`document.documentElement.dataset.theme=${JSON.stringify(tema)}`);
  await new Promise(r=>setTimeout(r,120));
  for(const t of TELAS){
    if(t==="game"){await ev(`(()=>{const b=document.querySelector('[data-go="entry"]');if(b)b.click();})()`);
          await new Promise(r=>setTimeout(r,200));
          // `__hudDemo` põe a tela em "game" DE VERDADE e enche o hudStore com dados sintéticos. Só remover
          // o `.on` da tela não bastava: sem partida, #hud-lb / #hud-score / #kill-feed ficam com 0 linhas e
          // altura zero, o `vis()` da sonda os descarta, e a coluna inteira passava sem ser medida. Pior:
          // `Hud.jsx` escreve `className={screen==="game"?"":"hidden"}`, então qualquer re-render desfazia
          // o `classList.remove('hidden')` que a sonda fazia na mão.
          await ev(`window.__hudDemo&&window.__hudDemo()`);
          await new Promise(r=>setTimeout(r,300));}
    // 900 ms e não 420: os blocos do fim de rodada entram em CASCATA (`rd-sobe`, o último acaba em 760 ms)
    // e medir no meio dela lê um `translateY` de transição como se fosse transbordo.
    else if(t.startsWith("dead")||t.startsWith("round")){await ev(IR(t));await new Promise(r=>setTimeout(r,900));}
    else if(t.endsWith("@rail")){await ev(IR(t.slice(0,-5)));await new Promise(r=>setTimeout(r,220));
          await ev(`document.body.dataset.shell="rail"`);await new Promise(r=>setTimeout(r,320));}
    else {await ev(IR(t));await new Promise(r=>setTimeout(r,320));}
    // o React só reescreve data-shell quando `played` muda, então a matriz o fixa como fixa data-mode
    if(!t.endsWith("@rail")&&!t.startsWith("dead")&&!t.startsWith("round"))await ev(`document.body.dataset.shell="center"`);
    // REAFIRMA modo e ponteiro logo antes de medir. `useViewportMode` roda com 150 ms de debounce depois de
    // cada resize/navegação e reescreve os dois — e como o CDP não emula `pointer:coarse` de verdade, ele
    // reescrevia "fine" e as regras de toque saíam do ar bem na hora em que a sonda ia cobrar os 44 px.
    await ev(`document.body.dataset.mode=${JSON.stringify(modo)};document.body.dataset.pointer=${JSON.stringify(toque?"coarse":"fine")};`);
    await new Promise(r=>setTimeout(r,80));
    const r=await ev(SONDA);if(!r)continue;
    await ev(`(()=>{const h=document.getElementById('hud');if(h&&!document.querySelector('.screen.on'))return;if(h)h.classList.add('hidden');})()`);
    const ruim=r.over>0||r.cx.length||r.pequenos.length||r.fora.length||(r.estoura&&r.estoura.length)||(r.lados&&r.lados.length);
    if(ruim)falhas++;
    linhas.push({nome,w,h,t,tema,...r,ruim});
  }
 }
}
const porTela=new Map();for(const l of linhas){const k=l.t+" → "+l.tela;porTela.set(k,(porTela.get(k)||0)+1);}
console.log("visitas (tela pedida → tela medida):");
for(const [k,n] of porTela)console.log("  "+k.padEnd(28)+n);
console.log("aparelho                    tela      tema      modo      ponteiro  problemas");
for(const l of linhas){
  if(!l.ruim)continue;
  const p=[];if(l.over)p.push("transborda "+l.over+"px");
  if(l.cx.length)p.push("colide: "+l.cx.join(" | "));
  if(l.pequenos.length)p.push("alvo<44: "+l.pequenos.slice(0,4).join(", ")+(l.pequenos.length>4?` (+${l.pequenos.length-4})`:""));
  if(l.fora.length)p.push("clipado: "+l.fora.join(", "));
  if(l.estoura&&l.estoura.length)p.push("fora da janela: "+l.estoura.join(", "));
  if(l.lados&&l.lados.length)p.push("rola de lado: "+l.lados.join(", "));
  console.log((l.nome+" "+l.w+"x"+l.h).padEnd(28)+l.t.padEnd(10)+String(l.tema).padEnd(10)+String(l.modo).padEnd(10)+String(l.ponteiro).padEnd(10)+p.join("  ·  "));
}
console.log(`\n${linhas.length} combinações · ${falhas} com problema · ${linhas.length-falhas} limpas`);
ws.close();fim(falhas?1:0);

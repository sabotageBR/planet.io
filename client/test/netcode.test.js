// ── NETCODE DO CLIENTE: relógio, atraso de interpolação e a predição diante de um pacote ATRASADO ──────
// Até aqui NÃO EXISTIA teste de `SnapshotBuffer`, `Interpolator` nem `Predictor` — só a paridade da física
// (`stepOwnPieces`). Os três módulos importam apenas `@warspace/shared`, então rodam em `node --test` sem
// jsdom. O que se trava aqui é o comportamento quando o servidor (ou a rede) TROPEÇA, que é exatamente onde
// o cliente transformava um buraco de 100 ms num tranco da tela inteira.
import {test} from "node:test";
import assert from "node:assert/strict";
import {KIND,PIECE_FLAG,NET,TICK_HZ,DT} from "@warspace/shared";
import {createBody,stepOwnPieces} from "@warspace/shared/physics/index.js";
import {createSnapshotBuffer,passoRelogio,RELOGIO} from "../src/game/state/SnapshotBuffer.js";
import {createInterpolator,alvoDeAtraso,atrasoZero} from "../src/game/state/Interpolator.js";
import {createPredictor,deveRessincronizar,leadDe} from "../src/game/state/Predictor.js";

const T=TICK_HZ/1000;

// ── relógio ──
test("relógio: um degrau de −6 ticks (overrun do servidor) NUNCA faz o tempo de render voltar, e converge em < 2 s",()=>{
  let off=100;const alvo=94;let t=0,rtAnt=-Infinity;
  for(let f=0;f<180;f++){const dt=1/60;off=passoRelogio(off,alvo,dt);t+=dt;
    const rt=off+t*TICK_HZ;   // o tick de render (sem o atraso, que é constante)
    assert.ok(rt>rtAnt,`frame ${f}: o tempo de render andou para trás (${rtAnt} → ${rt})`);rtAnt=rt;
    if(off===alvo)break;}
  assert.equal(off,alvo);assert.ok(t<2,`convergiu em ${t.toFixed(2)} s`);   // 100 ms de relógio em ~1,6 s: 94 % do caminho no 1º segundo, o resto no piso de V_MIN
});
test("relógio: a convergência é por TEMPO — 30 fps e 60 fps levam o mesmo",()=>{
  const dura=fps=>{let off=0,t=0;while(off!==4&&t<10){off=passoRelogio(off,4,1/fps);t+=1/fps;}return t;};
  assert.ok(Math.abs(dura(60)-dura(30))<.08,`60 fps: ${dura(60).toFixed(2)} s · 30 fps: ${dura(30).toFixed(2)} s`);
});
test("relógio: só um desvio ENORME salta (resume, aba que dormiu); adiantar é mais contido que atrasar",()=>{
  assert.equal(passoRelogio(0,RELOGIO.SNAP+1,1/60),RELOGIO.SNAP+1,"acima do SNAP: salto");
  assert.ok(passoRelogio(0,RELOGIO.SNAP,1/60)<1,"no limite ainda desliza");
  const mais=passoRelogio(0,10,1/60),menos=-passoRelogio(0,-RELOGIO.SNAP,1/60);   // desvios grandes o bastante para bater no teto de cada lado
  assert.ok(Math.abs(mais-RELOGIO.V_MAIS/60)<1e-9);assert.ok(Math.abs(menos-RELOGIO.V_MENOS/60)<1e-9);
  assert.ok(RELOGIO.V_MENOS<TICK_HZ,"atrasando, o render ainda ANDA (60 − V_MENOS > 0)");
  assert.equal(passoRelogio(NaN,5,1/60),5);assert.equal(passoRelogio(5,NaN,1/60),5);
  assert.equal(passoRelogio(3,3.001,1/60),3.001,"chega no alvo, sem ficar orbitando");
});
test("SnapshotBuffer: `late` mede o atraso de chegada contra a mediana, e tomaLate() guarda o PIOR da rajada",()=>{
  const b=createSnapshotBuffer(),snap=tick=>({tick,creates:[],updates:[],removes:[],self:{flags:0}});
  let now=1000;for(let i=0;i<8;i++){b.apply(snap(600+i*3),now);now+=50;}
  assert.ok(Math.abs(b.late)<.01,"chegando no ritmo, late ≈ 0");b.tomaLate();
  b.apply(snap(624),now+100);           // 100 ms atrasado = 6 ticks
  assert.ok(Math.abs(b.late-6)<.01,`late=${b.late}`);
  b.apply(snap(627),now+101);           // o seguinte da rajada chega "quase no horário" (50 ms de atraso)
  assert.ok(b.late<4);
  assert.ok(Math.abs(b.tomaLate()-6)<.01,"quem lê por frame vê o pior, não o último");assert.equal(b.tomaLate(),0);
});

// ── atraso de interpolação ──
test("atraso: o 1º pacote atrasado já sobe o alvo (a regra antiga esperava 2 secas em 5 s — e o servidor tropeçava 1×/11 s)",()=>{
  const BASE=NET.INTERP_DELAY_MS*T,MAX=NET.INTERP_MAX_MS*T,MAX2=NET.INTERP_MAX2_MS*T;
  let st=atrasoZero();assert.equal(st.alvo,BASE);
  st=alvoDeAtraso(st,{now:1000,late:.5});assert.equal(st.alvo,BASE,"jitter normal não mexe");
  st=alvoDeAtraso(st,{now:2000,late:5});assert.equal(st.alvo,MAX,"late 5 precisa de 9 ticks: o 1º degrau");
  st=alvoDeAtraso(st,{now:13000,late:7});assert.equal(st.alvo,Math.min(MAX2,11),"2º evento em < 30 s: libera o 2º teto");
  st=alvoDeAtraso(st,{now:14000,late:30});assert.equal(st.alvo,MAX2,"e nunca passa dele");
});
test("atraso: um evento isolado não passa do 1º teto, e volta sozinho à base em tempo calmo",()=>{
  const BASE=NET.INTERP_DELAY_MS*T,MAX=NET.INTERP_MAX_MS*T;
  let st=alvoDeAtraso(atrasoZero(),{now:0,late:20});assert.equal(st.alvo,MAX);
  let now=0;for(let i=0;i<40&&st.alvo>BASE;i++){now+=10001;st=alvoDeAtraso(st,{now,late:0});}
  assert.equal(st.alvo,BASE);assert.ok(now<=10001*4,"1 tick a cada 10 s: 3 ticks em ~30 s");
  // 31 s depois do 1º, outro evento isolado: NÃO é "segundo em 30 s"
  st=alvoDeAtraso(atrasoZero(),{now:0,late:20});st=alvoDeAtraso(st,{now:31000,late:20});assert.equal(st.alvo,MAX);
});
test("Interpolator: buracos de 130 ms a cada 11 s — só o PRIMEIRO seca o buffer",()=>{
  const b=createSnapshotBuffer(),it=createInterpolator(b),snap=tick=>({tick,creates:[],updates:[],removes:[],self:{flags:0}});
  let now=0,tick=0,prox=0,secas=[];const fim=60000;let buracoEm=11000;
  while(now<fim){
    if(now>=prox){let atraso=0;if(now>=buracoEm){atraso=130;buracoEm+=11000;}
      // o pacote atrasado chega `atraso` ms depois; os seguintes no horário (o relógio de envio não para)
      b.apply(snap(tick),now+atraso);tick+=3;prox+=50;if(atraso){now+=atraso;continue;}}
    const d0=it.dry;it.update(now);if(it.dry>d0)secas.push(Math.round(now/1000));now+=1000/60;}
  assert.ok(secas.length<=1,`secou em ${JSON.stringify(secas)} s — depois do 1º buraco o atraso tem de cobrir os seguintes`);
  assert.ok(it.alvoMs>NET.INTERP_DELAY_MS,"o alvo subiu");
});

// ── predição ──
test("deveRessincronizar: relógio à frente + pacote atrasado = NÃO; atrás = sempre; deriva de verdade = sim",()=>{
  assert.equal(deveRessincronizar(1.5,0),false,"dentro do limiar");
  assert.equal(deveRessincronizar(6,6),false,"à frente 6 ticks porque o pacote atrasou 6 ticks: o relógio está certo");
  assert.equal(deveRessincronizar(6,.2),true,"à frente 6 ticks com o pacote NO HORÁRIO: deriva de verdade (overrun já absorvido pela mediana)");
  assert.equal(deveRessincronizar(-3,0),true,"atrás: frame longo do próprio cliente");
  assert.equal(deveRessincronizar(-3,8),true,"atrás ressincroniza mesmo com pacote atrasado");
});
test("leadDe: histerese — um RTT passeando na fronteira de um tick não troca o lead a cada amostra",()=>{
  assert.equal(leadDe(40,-1),3,"sem lead ainda: o cru (40 ms → 1,2 tick → 2+1)");
  let lead=leadDe(32,-1);assert.equal(lead,2);   // 0,96 tick
  const trocas=[33,34,32,35,33,36,32].reduce((n,rtt)=>{const l=leadDe(rtt,lead);if(l!==lead){n++;lead=l;}return n;},0);
  assert.equal(trocas,0,"33–36 ms cruza 1,0 tick mas não passa de 1,3: fica em 2");
  assert.equal(leadDe(45,2),3,"passou da fronteira com folga: troca");
  assert.equal(leadDe(30,3),3,"voltou só um pouco: não destroca");assert.equal(leadDe(20,3),2,"voltou de verdade: destroca");
  assert.equal(leadDe(200,2),7,"salto grande de RTT: vai direto");
});

/**
 * Bancada: um planeta andando em linha reta, servidor a 60 Hz mandando snapshot a cada 3 ticks com 20 ms
 * de latência. `atrasos` = {tickDoSnapshot: ms a mais}. Devolve o pior desvio do passo por frame da
 * posição RENDERIZADA contra o passo nominal — que é o que o olho vê como tranco.
 */
function bancada(atrasos,frames=360,fps=60){
  let relogio=0,resyncs=0;
  const buffer=createSnapshotBuffer(),pred=createPredictor({buffer,input:null,agora:()=>relogio,netstat:{resync(){resyncs++;},snapDistou(){}}});pred.setSlot(0);
  const srv=createBody(KIND.PIECE,7,2000,6000,63);srv.owner=0;
  const alvo={tx:11000,ty:6000};pred.setTarget(alvo.tx,alvo.ty);
  const fila=[];let tick=0,now=0,acc=0,criado=false,xAnt=null,pior=0,nominal=0;const LAT=20;
  for(let f=0;f<frames;f++){const dt=1/fps;now+=1000/fps;acc+=dt;
    while(acc>=DT){acc-=DT;tick++;stepOwnPieces([srv],alvo,tick,DT);
      if(tick%3===0){const base={tick,ackSeq:0,self:{flags:0,ejectCd:0},removes:[]};
        const snap=criado?{...base,creates:[],updates:[{id:7,mask:1|2|4,x:srv.x,y:srv.y,r:srv.r,vx:0,vy:0}]}
          :{...base,updates:[],creates:[{id:7,kind:KIND.PIECE,x:srv.x,y:srv.y,r:srv.r,vx:0,vy:0,flags:PIECE_FLAG.ME,owner:0}]};criado=true;
        // ⚠️ a chegada sai do TICK do servidor, não do instante do frame: a 12 fps o laço daqui gera 5 ticks por
        // volta, e carimbar todos com `now` fazia os snapshots chegarem alinhados ao frame — exatamente o que NÃO
        // acontece de verdade, e o que escondia o defeito do relógio local a fps baixo.
        fila.push({at:tick*1000/60+LAT+(atrasos[tick]||0),snap});}}
    fila.sort((a,b)=>a.at-b.at);
    // o `onmessage` roda ENTRE dois frames, no instante da chegada (`at`); o `update()` roda no frame (`now`)
    while(fila.length&&fila[0].at<=now){const {at,snap}=fila.shift();relogio=at;buffer.apply(snap,at);pred.onSnapshot(snap,2*LAT);}
    relogio=now;pred.update(dt);
    const pc=pred.pieces[0];if(!pc)continue;
    const x=pc.px+(pc.x-pc.px)*pred.alpha+pc.vox;
    if(f===Math.round(1.5*fps))resyncs=0;   // o começo (1º PONG, 1ª sincronização) não conta
    if(xAnt!=null&&f>1.5*fps){const passo=x-xAnt;if(!nominal)nominal=passo;const desvio=Math.abs(passo-nominal);if(desvio>pior)pior=desvio;}
    xAnt=x;}
  return{pior,nominal,resyncs};}

test("UPD mask da bancada confere com o protocolo (X_Y|R|V)",async()=>{const {UPD}=await import("@warspace/shared");assert.equal(UPD.X_Y|UPD.R|UPD.V,1|2|4);});

test("predição: rede limpa → o planeta próprio anda em passo constante",()=>{
  const r=bancada({});assert.ok(r.nominal>3,`passo nominal ${r.nominal}`);assert.ok(r.pior<.6,`pior desvio ${r.pior.toFixed(2)} px`);
});
test("⚠️ predição: UM snapshot 90 ms atrasado não pode virar freada-e-disparo do planeta próprio",()=>{
  // tick 150 chega 90 ms depois (5,4 ticks de atraso, sozinho — os outros no horário): é o caso do jitter
  // de rede móvel e do congelamento curto do servidor. A regra antiga voltava o relógio local 5 ticks
  // (−30 px na predição) e o snapshot seguinte o devolvia: a posição renderizada freava e disparava.
  const limpo=bancada({}),sujo=bancada({150:90});
  assert.ok(sujo.pior<limpo.pior+.8,`pior desvio do passo com o pacote atrasado: ${sujo.pior.toFixed(2)} px (limpo: ${limpo.pior.toFixed(2)})`);
});

test("⚠️ predição a 12 fps (celular fraco): o relógio local NÃO ressincroniza a cada snapshot",()=>{
  // `localTick` só anda no frame; a 12 fps o snapshot chega com o relógio local até 5 ticks "atrás" do que
  // o frame seguinte vai pôr. A conta antiga lia isso como deriva: 426 ressincronizações em 434 snapshots,
  // medido num navegador sem GPU. A deriva tem de contar o que o relógio JÁ andou desde o último update().
  const r=bancada({},12*12,12);
  assert.ok(r.resyncs<=2,`${r.resyncs} ressincronizações em ~10 s a 12 fps`);
  assert.ok(r.pior<r.nominal*.35,`o passo por frame continua regular: pior desvio ${r.pior.toFixed(1)} px de ${r.nominal.toFixed(1)}`);
});
test("predição a 30 fps e a 144 fps: mesma coisa",()=>{
  for(const fps of [30,144]){const r=bancada({},fps*8,fps);assert.ok(r.resyncs<=1,`${fps} fps: ${r.resyncs} resyncs`);}
});

// ── TEMA "dawn" — Cartoon Amanhecer (05:00–15:59) ────────────────────────────
// Porte literal de mockups/v2/src/theme.toon-dawn.js: paleta do Cartoon Cósmico
// (tinta #141026, creme, amarelo, laranja, azul, roxo, verde) num céu de manhã cedo
// — marinho no alto → azul céu → brilho pêssego no horizonte, SEM SOL. Estrutura do
// Crepúsculo: gaveta pela direita no desktop/paisagem, folhas no retrato.
// O CSS (tokens/screens/hud.css) é gerado por ../port.js; aqui ficam só os dados e as
// receitas de canvas. Contrato:
//   textures.<x>(ctx,size,params)  desenha no contexto JÁ TRANSLADADO para o centro (R=size/2);
//                                  textures.scale.<x> diz quanto o sprite excede o raio (d=r*K)
//   textures.background(ctx,W,H)   fundo fixo por resolução (0,0)-(W,H), assado uma vez
//   textures.bandLayers()          camadas de parallax + estrelas grandes + planetas de cenário (seed fixa)
//   effects.fx(kind,k,f)           primitivas {ring|star|text|line|burst} do drawFx (k=age/ttl)
//   hud / world                    números do drawHud / drawTrail / drawCell / drawWorld
import {sh,rgba,spikes,astPoly,rr,mulberry,tier,foodType,FOOD_ICON,FOOD_FIXED,paintGlow,fireworkPrims} from "../util.js";
import {paintPattern,paintHole,paintNova} from "../patterns.js";

const INK="#141026",CREAM="#fff5c2",YEL="#ffc22e",ORA="#ff6b4a",BLU="#3fc4ff",PUR="#c56bff",GRN="#3ddc5f";
const NAVY="#1b2450",SKY="#3fa9e8",PEACH="#ffd58a",PALE="#ffe9b8",DUST="#4d68a8";
const BH_INK="#0a0714",BH_HOT="#ff9126",BH_RED="#a32a12";   // buraco negro: rampa SÓ quente (sombra → vermelho → dourado → branco), como as fotos do M87
const FONT="'Trebuchet MS',Verdana,sans-serif",T=900;

export const id="dawn",name="Cartoon Amanhecer";
export const schedule={from:5,to:16};
export const tokens={bg:"#1b2450",surface:"#232f63",text:"#fff5c2",muted:"#8fa0d8",accent:"#ffc22e",accent2:"#ff6b4a",danger:"#ff3d5a",ok:"#3ddc5f",
  line:"#141026",radius:"14px",radiusLg:"20px",space:"14px",fontUi:FONT,fontMono:"'Courier New',monospace",shadow:"6px 6px 0 #141026"};
export const layout={hud:"bubbles",nav:"drawer"};
export const rarityColor={free:"#9aa3c0",common:"#3fc4ff",rare:"#3d7bff",epic:"#c56bff",legendary:"#ffc22e",earned:"#3ddc5f",secret:"#ff6b4a"};
export const labels={title:"WARSPACE.IO",tagline:"Conquiste a galáxia antes do dia clarear!",play:"JOGAR",playAuto:"🚀 JOGAR (AUTO)",lbTitle:"PÓDIO",
  dead:"KABOOM!",deadSub:"— você virou poeira de manhã cedo —",respawn:"🔄 DE NOVO!",reconnTitle:"SINAL FRACO!",reconnSub:"Procurando o satélite… tentativa {n}/5",
  back:"◄",create:"➕ Criar sala",top5:"TOP 5 HOJE"};

// ── fatores de escala: o sprite é assado com raio R/K e desenhado com meia-largura r*K ──
const PK=sk=>sk.ring?2.05:1.3,FK=2.1,EK=1.5,AK=1.3,BK=2.4,MK=2.6,NK=2,PROPK=p=>p.ring?2:1.2;

export const textures={
  scale:{planet:PK,food:FK,ejected:EK,asteroid:AK,blackHole:BK,missile:MK,nova:NK,prop:PROPK,star:1},
  tier,
  // chave de cache por (tipo, params, size) — mesma granularidade dos mockups
  key(kind,p={},size=0){switch(kind){
    // A versão do AVATAR entra na chave: sem ela, dois jogadores com fotos diferentes e a mesma skin
    // colidiriam na mesma textura — e é ela também que faz a foto aparecer sozinha quando o bitmap chega,
    // porque a chave muda e o cache assa a nova (não existe invalidação no TextureCache).
    case "planet":return`${id}:p${p.skin.id}${p.isMe?"m":""}${p.avatar?"@"+p.avatar:""}:${size}`;
    case "food":return`${id}:f${foodType(p.type)}${foodColor(p)}`;
    case "ejected":return`${id}:e${p.glow?"nova":p.color}`;
    case "glow":return`${id}:g${p.color}${p.k||""}`;
    case "asteroid":return`${id}:a${p.variant}:${size}`;
    case "prop":return`${id}:prop${p.i}`;
    case "star":return`${id}:star${p.variant?1:0}`;
    case "nova":return`${id}:nova${p.old?"o":""}:${size}`;
    case "blackHole":return`${id}:bh:${size}`;
    default:return`${id}:${kind}`;}},

  // planeta: chapado + crescente de tinta + brilho elíptico + emoji fantasma + contorno (creme se for eu, com fio de tinta por fora)
  planet(c,size,{skin:sk,isMe=false,avatarBmp=null}){const R=size/2,K=PK(sk),r=R/K,col=sk.color,lw=Math.max(2.5,r*.1);c.lineJoin="round";c.lineCap="round";
    const band=(a0,a1)=>{c.beginPath();c.ellipse(0,0,r*1.85,r*.56,0,a0,a1,false);c.ellipse(0,0,r*1.3,r*.39,0,a1,a0,true);c.closePath();c.fill();c.stroke();};
    if(sk.ring){c.fillStyle=sh(col,.3);c.strokeStyle=INK;c.lineWidth=lw*.7;band(Math.PI,Math.PI*2);}
    c.fillStyle=col;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
    c.save();c.beginPath();c.arc(0,0,r,0,6.283);c.clip();const pat=paintPattern(c,r,sk,{ink:INK,light:CREAM,avatar:avatarBmp});
    c.fillStyle="rgba(20,16,38,.3)";c.beginPath();c.arc(r*.38,r*.4,r*1.05,0,6.283);c.fill();
    c.fillStyle="rgba(255,255,255,.38)";c.beginPath();c.ellipse(-r*.36,-r*.38,r*.34,r*.2,-.75,0,6.283);c.fill();
    c.fillStyle="rgba(255,255,255,.25)";c.beginPath();c.arc(-r*.08,-r*.58,r*.08,0,6.283);c.fill();
    if(!pat){c.globalAlpha=.16;c.font=`${r*1.3}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(sk.emoji,r*.05,r*.15);c.globalAlpha=1;}   // skin com textura dispensa o emoji fantasma
    c.restore();
    if(sk.ring){c.fillStyle=sh(col,.3);c.strokeStyle=INK;c.lineWidth=lw*.7;band(0,Math.PI);}
    c.strokeStyle=isMe?CREAM:INK;c.lineWidth=lw;c.beginPath();c.arc(0,0,r,0,6.283);c.stroke();
    if(isMe){c.strokeStyle=INK;c.lineWidth=lw*.55;c.beginPath();c.arc(0,0,r+lw*.78,0,6.283);c.stroke();}},

  // comida confete (cor quantizada do servidor) com contorno de tinta e brilho branco; size padrão 64
  food(c,size,p){const R=size/2,r=R/FK,type=foodType(p.type),col=foodColor(p);c.lineJoin="round";c.strokeStyle=INK;c.lineWidth=Math.max(2,r*.24);c.fillStyle=col;
    const gl=(x,y,k)=>{c.fillStyle="rgba(255,255,255,.55)";c.beginPath();c.arc(x,y,r*k,0,6.283);c.fill();};
    if(FOOD_ICON[type]){c.beginPath();c.arc(0,0,r*1.5,0,6.283);c.fill();c.stroke();c.font=`${r*1.5}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(FOOD_ICON[type],0,r*.1);return;}
    if(type==="star"){spikes(c,r*1.6,5,.5,-1.5708);c.fill();c.stroke();gl(-r*.25,-r*.3,.22);return;}
    if(type==="comet"){c.beginPath();c.moveTo(-r*2,0);c.lineTo(-r*.15,-r*.8);c.arc(0,0,r*.85,-1.4,1.4);c.lineTo(-r*.15,r*.8);c.closePath();c.fill();c.stroke();gl(-r*.2,-r*.3,.25);return;}
    if(type==="rock"){c.rotate(.45);rr(c,-r,-r,r*2,r*2,r*.3);c.fill();c.stroke();gl(-r*.4,-r*.4,.24);return;}
    c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.stroke();gl(-r*.3,-r*.32,.26);},

  // HALO das partículas (comida e fragmentos): a moldura inteira, em blendMode "add" por baixo do corpo.
  // É o brilho no estilo dos .io modernos — assado, porque aqui não há filtro nem blur (ver paintGlow).
  glow(c,size,{color,k}){paintGlow(c,size,color,k==null?undefined:{k});},

  // massa ejetada; size padrão 40
  ejected(c,size,{color,glow=false}){const r=size/2/EK;
    if(glow){const R=size/2;   // estilhaço de supernova: coroa quente que VAZA para fora do disco (o brilho é assado — o cliente não tem filtro nem blend)
      for(let i=3;i>=1;i--){c.fillStyle=rgba(i>2?ORA:YEL,.12+(3-i)*.13);c.beginPath();c.arc(0,0,R*(.52+i*.16),0,6.283);c.fill();}
      c.fillStyle=YEL;spikes(c,r*1.24,6,.52,-1.5708);c.fill();
      c.fillStyle=CREAM;c.beginPath();c.arc(0,0,r*.62,0,6.283);c.fill();
      c.strokeStyle=INK;c.lineWidth=Math.max(1.5,r*.14);c.stroke();return;}
    c.fillStyle=color;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(2,r*.22);c.stroke();
    c.fillStyle="rgba(255,255,255,.5)";c.beginPath();c.arc(-r*.3,-r*.32,r*.26,0,6.283);c.fill();},

  // asteroide: "batata" marrom-cinza, 3 crateras, contorno de tinta (3 variantes × tier)
  asteroid(c,size,{variant=0}){const r=size/2/AK,seed=11+variant*7,n=9+variant*2;c.lineJoin="round";
    c.fillStyle="#8c7b6b";astPoly(c,r,seed,n);c.fill();
    c.save();c.clip();c.fillStyle="rgba(20,16,38,.3)";c.beginPath();c.arc(r*.35,r*.4,r*1.05,0,6.283);c.fill();
    c.fillStyle="rgba(255,255,255,.14)";c.beginPath();c.ellipse(-r*.35,-r*.4,r*.35,r*.2,-.7,0,6.283);c.fill();c.restore();
    const cr=mulberry(seed*3);for(let i=0;i<3;i++){const a=cr()*6.28,d=cr()*r*.5,c2=r*(.12+cr()*.14);
      c.fillStyle="#5a4a40";c.beginPath();c.arc(Math.cos(a)*d,Math.sin(a)*d,c2,0,6.283);c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(1.5,r*.045);c.stroke();}
    astPoly(c,r,seed,n);c.strokeStyle=INK;c.lineWidth=Math.max(3,r*.1);c.stroke();},

  // buraco negro: disco de acreção em perspectiva + horizonte + anel de fóton (../patterns.js; 1 sprite de 256 girado por h.spin)
  blackHole(c,size){paintHole(c,size/2/BK,{ink:BH_INK,glow:CREAM,hot:BH_HOT,cold:BH_RED});},

  // estrela do mundo (perigo): coroa em camadas, núcleo quente e línguas de plasma; `old` = gigante vermelha rachada, a caminho da supernova
  nova(c,size,{old=false}){paintNova(c,size/2/NK,old,{ink:INK,core:CREAM,edge:YEL,deep:ORA});},

  // estrelas grandes do fundo (2 variantes, pálidas); size padrão 32
  star(c,size,{variant=0}){const R=size/2,v=variant;c.lineJoin="round";spikes(c,R*.9,v?5:4,v?.5:.38,-1.5708);c.fillStyle=v?PALE:CREAM;c.fill();c.strokeStyle=INK;c.lineWidth=2;c.stroke();},

  // planeta de cenário em azul-poeira: sombra em cima, fio pêssego embaixo (luz do horizonte); size padrão 256
  prop(c,size,{prop:p}){const R=size/2,r=R/PROPK(p);c.lineJoin="round";
    if(p.ring){c.fillStyle=sh(DUST,-.15);c.strokeStyle=INK;c.lineWidth=r*.05;c.beginPath();c.ellipse(0,0,r*1.8,r*.5,-.35,0,6.283);c.ellipse(0,0,r*1.35,r*.36,-.35,6.283,0,true);c.fill("evenodd");c.stroke();}
    c.fillStyle=DUST;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
    c.save();c.clip();c.fillStyle="rgba(20,16,38,.28)";c.beginPath();c.arc(-r*.3,-r*.45,r*1.05,0,6.283);c.fill();
    c.strokeStyle="rgba(255,233,184,.7)";c.lineWidth=r*.13;c.beginPath();c.arc(0,0,r*.94,.55,2.55);c.stroke();
    c.fillStyle="rgba(255,233,184,.1)";[-.45,.1,.5].forEach(y=>{c.beginPath();c.ellipse(0,r*y,r*1.05,r*.1,0,0,6.283);c.fill();});c.restore();
    c.strokeStyle=INK;c.lineWidth=r*.07;c.beginPath();c.arc(0,0,r,0,6.283);c.stroke();},

  // míssil apontando para +x (o renderer gira por atan2(vy,vx)); chama amarela fixa (o mockup pulsa fl=1±.25)
  missile(c,size){const r=size/2/MK,fl=1;c.lineJoin="round";
    c.fillStyle=YEL;c.beginPath();c.moveTo(-r*1.1,0);c.lineTo(-r*2.4*fl,-r*.6);c.lineTo(-r*2*fl,0);c.lineTo(-r*2.4*fl,r*.6);c.closePath();c.fill();
    c.strokeStyle=INK;c.lineWidth=Math.max(1.5,r*.24);c.fillStyle=ORA;
    c.beginPath();c.moveTo(r*1.6,0);c.quadraticCurveTo(r*.6,-r*.95,-r*.9,-r*.7);c.lineTo(-r*1.3,-r*1.1);c.lineTo(-r*1.3,r*1.1);c.lineTo(-r*.9,r*.7);c.quadraticCurveTo(r*.6,r*.95,r*1.6,0);c.closePath();c.fill();c.stroke();
    c.fillStyle=BLU;c.beginPath();c.arc(r*.25,0,r*.36,0,6.283);c.fill();c.stroke();},

  // prévia de skin (entrada/loja/perfil): desenha o planeta centrado na origem atual com raio r (paintSkin do mockup)
  paintSkin(c,sk,r){const rr2=sk.ring?r*.68:r,d=rr2*PK(sk),size=tier(rr2),k=d*2/size;c.save();c.translate(0,2);c.scale(k,k);textures.planet(c,size,{skin:sk,isMe:false});c.restore();},

  // fundo assado por resolução: céu de manhã cedo (marinho → azul céu → pêssego, SEM sol) e estrelas pálidas no terço de cima
  // (sem os planetas distantes: confundiam com planeta de verdade)
  background(x,W,H,{rng}={}){x.lineJoin="round";x.lineCap="round";
    const gd=x.createLinearGradient(0,0,0,H);gd.addColorStop(0,NAVY);gd.addColorStop(.2,"#24407f");gd.addColorStop(.48,SKY);gd.addColorStop(.68,"#a8dcf5");gd.addColorStop(.82,PEACH);gd.addColorStop(1,PALE);x.fillStyle=gd;x.fillRect(0,0,W,H);
    const rand=rng||mulberry(5);
    x.fillStyle=CREAM;for(let i=0;i<50;i++){const y=H*rand()*.3;x.globalAlpha=(.15+rand()*.45)*(1-y/(H*.3));x.fillRect(rand()*W,y,2,2);}x.globalAlpha=1;},

  // parallax (init do mockup, seed 21): pontos creme em 2 camadas + 22 estrelas grandes, só no terço de cima com fade; 10 planetas de cenário no mundo
  bandLayers({seed=21,WW=3000,WH=3000}={}){const rand=mulberry(seed);
    const layers=[.2,.45].map((f,li)=>({f,color:CREAM,count:li?50:80,size:li?[2.5,4]:[1.5,2.5],alpha:[.3,.65],
      stars:Array.from({length:li?50:80},()=>({x:rand()*T,y:rand()*T,s:li?2.5+rand()*1.5:1.5+rand(),a:+(.3+rand()*.35).toFixed(2)}))}));
    const bigStars={f:.7,count:22,size:[14,26],alpha:.85,variants:2,stars:Array.from({length:22},()=>({x:rand()*T,y:rand()*T,s:14+rand()*12,v:rand()<.5?1:0}))};
    const props=[];   // sem planetas de cenário: as bolas translúcidas do fundo confundiam com planeta de verdade (textures.prop segue aqui se um dia voltarem)
    return{tile:T,fade:{y0:.32,d:.16},layers,bigStars,props,propsAlpha:.5};},
};
function foodColor(p){const t=foodType(p.type);return FOOD_ICON[t]?(p.color||FOOD_FIXED[t]):(p.color||`hsl(${((p.hue|0)%12)*30},80%,68%)`);}

// ── mundo (drawWorld): grade creme fraca, borda de tinta + tracejado amarelo ──
export const world={grid:{step:150,color:"rgba(255,245,194,.09)",width:2},border:[{color:INK,width:18},{color:YEL,width:6,dash:[40,26]}],propsAlpha:.5,
  foodAnim:{starPulse:{amp:.14,speed:.003},bob:{amp:3,speed:.005}},
  // fragmentos: o de supernova lateja (é o melhor troco do mapa); o gordo só respira, para dizer que vale mais sem virar pisca-pisca
  ejectAnim:{novaPulse:{amp:.18,speed:.006},richPulse:{amp:.07,speed:.0025}}};

// ── efeitos (drawFx) como primitivas; k=age/ttl, f={x,y,r,nx,ny,power} ──
// escudo por nível (1 → 2 → 3): cor, largura, pulso e nº de anéis — usados pelos anéis (Planets.js), pelo HUD e pelos efeitos
const SHIELD_LV=[{color:BLU,widthK:1,pulse:.012,alpha:[.6,1],rings:1},{color:PUR,widthK:1.25,pulse:.02,alpha:[.7,1],rings:1},{color:YEL,widthK:1.5,pulse:.03,alpha:[.85,1],rings:2}],ROCK_DUST="#b8a898";
// paletas dos fogos da vitória: a FÍSICA é compartilhada (fireworkPrims em theme/util.js), aqui só a cor.
// Cinco cargas diferentes para a salva não sair monocromática — é o que separa "fogos" de "um efeito repetido".
const FOGOS=[{hot:"#fffdf0",body:YEL,ember:ORA,trail:"#ffd9a0"},{hot:"#fffdf0",body:BLU,ember:"#2f7fc0",trail:"#c6ecff"},{hot:"#fffdf0",body:PUR,ember:"#7a3fb0",trail:"#e6ccff"},{hot:"#fffdf0",body:GRN,ember:"#2a8f42",trail:"#ccffd8"},{hot:"#fffdf0",body:ORA,ember:"#a33a12",trail:"#ffd2b0"}];
export const effects={
  fx(kind,k,f){const a=1-k,P=[];
    switch(kind){
      case "firework":return fireworkPrims(k,f,FOGOS[(f.seed|0)%FOGOS.length]);
      case "bounce":{const s=f.r*(.7+k*.3)*(.6+(f.power||1)*.5),rot=(f.nx||0)*.6;
        P.push({type:"star",x:f.x,y:f.y,r:s,n:8,inner:.55,phase:0,rot,fill:YEL,stroke:INK,width:Math.max(2,s*.08)});
        P.push({type:"text",x:f.x,y:f.y,text:"POW!",size:Math.max(10,s*.5),fill:"#fff",stroke:INK,font:FONT,rot});break;}
      case "pop":{const s=f.r*(1+k*.8),al=Math.min(1,a*1.5);
        P.push({type:"star",x:f.x,y:f.y,r:s,n:10,inner:.5,phase:k*.6,fill:ORA,stroke:INK,width:Math.max(2,s*.06),alpha:al});
        P.push({type:"text",x:f.x,y:f.y,text:"BOOM",size:Math.max(10,s*.42),fill:YEL,stroke:INK,font:FONT,alpha:al});break;}
      case "boom":{const s=f.r*(.8+k*1.2),al=Math.min(1,a*1.5);
        P.push({type:"star",x:f.x,y:f.y,r:s,n:12,inner:.55,phase:-k*.5,fill:ORA,stroke:INK,width:Math.max(2.5,s*.06),alpha:al});
        P.push({type:"star",x:f.x,y:f.y,r:s*.55,n:12,inner:.55,phase:-k*.5,fill:YEL,alpha:al});
        P.push({type:"text",x:f.x,y:f.y,text:"KABOOM!",size:Math.max(11,s*.34),fill:"#fff",stroke:INK,font:FONT,alpha:al});break;}
      case "suck":{const tx=f.tx==null?f.x:f.tx,ty=f.ty==null?f.y:f.ty;   // espaguetificação: o planeta se estica de onde estava até a boca do buraco
        const dx=tx-f.x,dy=ty-f.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d,px=-uy,py=ux,head=Math.min(1,k*1.35);
        for(let i=-1;i<=1;i++){const off=i*f.r*.6*(1-k*.75);
          P.push({type:"line",x1:f.x+px*off,y1:f.y+py*off,x2:f.x+ux*d*head+px*off*.15,y2:f.y+uy*d*head+py*off*.15,
            color:PUR,alpha:a,width:Math.max(2,f.r*.4*(1-k*.65))});}
        P.push({type:"ring",x:tx,y:ty,r:f.r*(2.2-k*1.8),color:PUR,alpha:a,width:4});break;}
      case "exit":case "split":case "merge":P.push({type:"ring",x:f.x,y:f.y,r:f.r*(.6+k*1.5),color:"#ffffff",alpha:a,width:3});break;
      case "chip":{const b=Math.atan2(f.ny||0,f.nx||1);for(let i=-1;i<=1;i++){const an=b+i*.5;
        P.push({type:"line",x1:f.x,y1:f.y,x2:f.x+Math.cos(an)*f.r*3*k,y2:f.y+Math.sin(an)*f.r*3*k,color:YEL,alpha:a,width:3});}break;}
      case "shoot":P.push({type:"burst",x:f.x,y:f.y,n:8,r0:f.r*(1+k),r1:f.r*(1.6+k*1.4),color:ORA,alpha:a,width:3});break;
      case "eat":{const al=Math.min(1,a*1.4),tx=f.tx==null?f.x:f.tx,ty=f.ty==null?f.y:f.ty,tr=f.tr||f.r;   // absorção: a vítima é sugada para quem comeu
        for(let i=0;i<3;i++){const kk=Math.min(1,k+i*.14),x=f.x+(tx-f.x)*kk,y=f.y+(ty-f.y)*kk;
          P.push({type:"ring",x,y,r:f.r*(1-kk*.75)+2,color:YEL,alpha:a*(1-i*.28),width:Math.max(2,f.r*.18*(1-kk))});}
        P.push({type:"burst",x:f.x,y:f.y,n:8,r0:f.r*(.9+k*.8),r1:f.r*(1.2+k*1.2),color:CREAM,alpha:a*.8,width:Math.max(2,f.r*.07)});
        P.push({type:"ring",x:tx,y:ty,r:tr*(1.05+k*.35),color:CREAM,alpha:a,width:Math.max(2,tr*.08)});
        if(f.r>8)P.push({type:"text",x:tx,y:ty-tr*(1+k*.6),text:"NHAC!",size:Math.max(10,tr*.55),fill:"#fff",stroke:INK,font:FONT,alpha:al});break;}
      case "vanish":{const col=f.color||CREAM;   // sumiço no mesmo frame: colapsa e, se foi comida, voa para quem comeu
        if(f.tx!=null){const x=f.x+(f.tx-f.x)*k,y=f.y+(f.ty-f.y)*k;
          P.push({type:"line",x1:f.x,y1:f.y,x2:x,y2:y,color:col,alpha:a*.45,width:Math.max(1.5,f.r*.14*(1-k))});
          P.push({type:"ring",x,y,r:f.r*(1-k*.85)+1,color:col,alpha:a,width:Math.max(2,f.r*.2*(1-k))});break;}
        P.push({type:"ring",x:f.x,y:f.y,r:f.r*(1-k*.9)+1,color:col,alpha:a,width:Math.max(3,f.r*.15*(1-k))});
        P.push({type:"burst",x:f.x,y:f.y,n:6,r0:f.r*(.4+k*2),r1:f.r*(.9+k*2.6),color:col,alpha:a,width:Math.max(2,f.r*.1),phase:.5});break;}
      case "starHit":{const b=Math.atan2(f.ny||0,f.nx||1);   // tiro/partícula empurrou a estrela (o contador vai até rachar)
        P.push({type:"burst",x:f.x,y:f.y,n:7,r0:f.r*(.9+k*.5),r1:f.r*(1.15+k*.9),color:YEL,alpha:a,width:Math.max(2,f.r*.06),phase:b});
        P.push({type:"star",x:f.x,y:f.y,r:f.r*.32*(1+k),n:6,inner:.5,phase:k,fill:CREAM,stroke:INK,width:2,alpha:a});
        if(f.n)P.push({type:"text",x:f.x,y:f.y-f.r*(1.2+k*.6),text:"×"+f.n,size:Math.max(10,f.r*.34),fill:YEL,stroke:INK,font:FONT,alpha:a});break;}
      case "smash":{const s=f.r*(1+k*1.6),al=Math.min(1,a*1.5);   // meteoro trombou na estrela: poeira de rocha para trás e clarão
        P.push({type:"burst",x:f.x,y:f.y,n:9,r0:f.r*(.4+k*1.3),r1:f.r*(.9+k*2.2),color:ROCK_DUST,alpha:a,width:Math.max(2,f.r*.14),phase:Math.atan2(f.ny||0,f.nx||1)});
        P.push({type:"star",x:f.x,y:f.y,r:s*.55,n:8,inner:.45,phase:k*.8,fill:YEL,stroke:INK,width:Math.max(2,s*.05),alpha:al});
        P.push({type:"ring",x:f.x,y:f.y,r:f.r*(.5+k*1.6),color:ORA,alpha:a,width:Math.max(2,f.r*.06)});
        P.push({type:"text",x:f.x,y:f.y-f.r*(1+k),text:"SMASH!",size:Math.max(11,f.r*.55),fill:CREAM,stroke:INK,font:FONT,alpha:al});break;}
      case "starSplit":{const s=f.r*(.3+k*.7),al=Math.min(1,a*1.5);   // a estrela rachou: clarão e as filhas saindo em leque
        P.push({type:"star",x:f.x,y:f.y,r:s*.5,n:12,inner:.45,phase:-k*.6,fill:YEL,stroke:INK,width:Math.max(2,s*.03),alpha:al});
        P.push({type:"ring",x:f.x,y:f.y,r:f.r*(.2+k*.8),color:ORA,alpha:a,width:Math.max(3,f.r*.03)});
        P.push({type:"burst",x:f.x,y:f.y,n:10,r0:f.r*(.2+k*.6),r1:f.r*(.35+k*.95),color:CREAM,alpha:a,width:Math.max(2,f.r*.02)});
        P.push({type:"text",x:f.x,y:f.y,text:"CRACK!",size:Math.max(12,f.r*.13),fill:CREAM,stroke:INK,font:FONT,alpha:al});break;}
      case "bigCrunch":{const al=Math.min(1,a*1.6);   // fim da rodada: tudo colapsa num ponto (o contrário do big bang)
        for(let i=0;i<4;i++){const kk=Math.min(1,k+i*.1);
          P.push({type:"ring",x:f.x,y:f.y,r:f.r*(1.15-kk)*(1-i*.06)+2,color:i%2?PUR:CREAM,alpha:a*(1-i*.18),width:Math.max(3,f.r*.02*(1+kk))});}
        P.push({type:"burst",x:f.x,y:f.y,n:16,r0:f.r*(1.1-k)*.9,r1:f.r*(1.15-k),color:ORA,alpha:a,width:Math.max(2,f.r*.015),phase:k*.4});
        P.push({type:"star",x:f.x,y:f.y,r:f.r*.06*(1+k*3),n:14,inner:.4,phase:k,fill:CREAM,alpha:al});
        P.push({type:"text",x:f.x,y:f.y,text:"BIG CRUNCH!",size:Math.max(14,f.r*.14),fill:CREAM,stroke:INK,font:FONT,alpha:al});break;}
      case "death":{const s=f.r*(1+k*2),al=Math.min(1,a*1.3);
        P.push({type:"star",x:f.x,y:f.y,r:s,n:14,inner:.5,phase:k*.4,fill:ORA,stroke:INK,width:Math.max(3,s*.05),alpha:al});
        P.push({type:"star",x:f.x,y:f.y,r:s*.5,n:14,inner:.5,phase:-k*.4,fill:YEL,alpha:al});
        P.push({type:"ring",x:f.x,y:f.y,r:s*1.3,color:"#fff",alpha:a,width:4});
        P.push({type:"text",x:f.x,y:f.y,text:"KABOOM!",size:Math.max(12,s*.3),fill:"#fff",stroke:INK,font:FONT,alpha:al});break;}
      case "shieldBreak":{const col=SHIELD_LV[0].color,R0=f.r+6;   // anel estilhaça em 8 arcos que voam
        P.push({type:"ring",x:f.x,y:f.y,r:R0*(1+k*.4),color:col,alpha:a*.6,width:3,dash:[R0*.5,R0*.35]});
        P.push({type:"burst",x:f.x,y:f.y,n:8,r0:R0*(1+k*1.2),r1:R0*(1.3+k*1.8),color:col,alpha:a,width:Math.max(3,f.r*.1),phase:.4});
        P.push({type:"text",x:f.x,y:f.y-f.r*1.4,text:"CRACK!",size:Math.max(10,f.r*.5),fill:"#fff",stroke:INK,font:FONT,alpha:a});break;}
      case "shieldHit":{const col=(SHIELD_LV[(f.level||1)-1]||SHIELD_LV[0]).color,hx=f.x+(f.nx||0)*(f.r+6),hy=f.y+(f.ny||0)*(f.r+6);   // flash do anel + impacto na borda
        P.push({type:"ring",x:f.x,y:f.y,r:(f.r+6)*(1+k*.15),color:col,alpha:a,width:Math.min(16,Math.max(4,f.r*.12))});
        P.push({type:"star",x:hx,y:hy,r:f.r*.45*(1+k),n:6,inner:.5,phase:k,fill:"#fff",stroke:INK,width:2,alpha:a});break;}
      case "shieldUp":{const col=(SHIELD_LV[(f.level||1)-1]||SHIELD_LV[0]).color;
        P.push({type:"ring",x:f.x,y:f.y,r:f.r+6+k*f.r*1.4,color:col,alpha:a,width:4});
        P.push({type:"text",x:f.x,y:f.y-f.r*(1.2+k*.8),text:"ESCUDO "+(f.level||1),size:Math.max(10,f.r*.5),fill:col,stroke:INK,font:FONT,alpha:a});break;}
      case "clash":{const s=f.r*(2+k*3),al=Math.min(1,a*1.4);   // míssil × míssil
        P.push({type:"star",x:f.x,y:f.y,r:s,n:9,inner:.5,phase:k*.7,fill:ORA,stroke:INK,width:Math.max(2,s*.06),alpha:al});
        P.push({type:"star",x:f.x,y:f.y,r:s*.5,n:9,inner:.5,phase:-k*.7,fill:"#fff",alpha:al});
        P.push({type:"text",x:f.x,y:f.y,text:"BAM!",size:Math.max(11,s*.4),fill:YEL,stroke:INK,font:FONT,alpha:al});break;}
      case "deflect":{P.push({type:"burst",x:f.x,y:f.y,n:7,r0:f.r*(.3+k*1.2),r1:f.r*(.7+k*1.8),color:ROCK_DUST,alpha:a,width:Math.max(2,f.r*.08),phase:(f.nx||0)});   // poeira de rocha
        P.push({type:"star",x:f.x,y:f.y,r:f.r*.5*(1+k),n:7,inner:.5,phase:k,fill:YEL,stroke:INK,width:2,alpha:a});break;}
      case "starBurst":{const s=f.r*(1+k*1.4),al=Math.min(1,a*1.4);   // planeta estilhaçado pela estrela
        P.push({type:"star",x:f.x,y:f.y,r:s,n:11,inner:.45,phase:k*.9,fill:YEL,stroke:INK,width:Math.max(2,s*.06),alpha:al});
        P.push({type:"burst",x:f.x,y:f.y,n:9,r0:f.r*(.8+k*2),r1:f.r*(1.4+k*3),color:ORA,alpha:a,width:Math.max(2,f.r*.12)});
        P.push({type:"text",x:f.x,y:f.y-f.r*(1.2+k),text:"CRASH!",size:Math.max(11,f.r*.6),fill:"#fff",stroke:INK,font:FONT,alpha:al});break;}
      case "supernova":{const s=f.r*(.25+k*.85),al=Math.min(1,a*1.6);   // onda de choque: anéis crescendo + clarão + texto
        for(let i=0;i<3;i++){const kk=Math.max(0,k-i*.12);P.push({type:"ring",x:f.x,y:f.y,r:f.r*(.15+kk*1.05),color:i?ORA:CREAM,alpha:a*(1-i*.25),width:Math.max(3,f.r*.03*(1-kk))});}
        P.push({type:"star",x:f.x,y:f.y,r:s*.5,n:16,inner:.45,phase:-k*.5,fill:YEL,stroke:INK,width:Math.max(2,s*.02),alpha:al});
        P.push({type:"burst",x:f.x,y:f.y,n:14,r0:f.r*(.2+k*.9),r1:f.r*(.35+k*1.15),color:CREAM,alpha:a,width:Math.max(2,f.r*.02)});
        P.push({type:"text",x:f.x,y:f.y,text:"SUPERNOVA!",size:Math.max(14,f.r*.14),fill:CREAM,stroke:INK,font:FONT,alpha:al});break;}
      case "countdown":{const s=f.r*(1.6-k*.5),al=Math.min(1,a*2);   // contagem do fim do mundo (segundos finais)
        P.push({type:"ring",x:f.x,y:f.y,r:f.r*(.7+k*1.1),color:ORA,alpha:a*.7,width:Math.max(4,f.r*.05)});
        P.push({type:"text",x:f.x,y:f.y,text:String(f.n||0),size:s,fill:"#fff",stroke:INK,font:FONT,alpha:al});break;}
      case "rock":P.push({type:"ring",x:f.x,y:f.y,r:f.r*.4*(1+k),color:CREAM,alpha:a*.5,width:2});break;}
    return P;},
  missileTrail:{color:CREAM,alphaK:.5,radiusK:.7,every:2},                                   // pontinhos atrás do míssil (alpha=i/n*alphaK, r=m.r*radiusK*i/n)
  missileFlame:{amp:.25,speed:.05},                                                          // escala da chama: 1+amp*sin(t*speed)
  blackHole:{ring:{color:BH_HOT,alpha:[.16,.26],pulse:.004,width:3,dash:[14,18],spinK:-.4},ring2:{color:CREAM,alpha:[.5,.95],pulse:.013,width:3,dash:[10,9],spinK:.9,rK:2.4},spark:{n:9,speed:.022,rxK:.95,ryK:.14,r:d=>Math.max(1.5,d*.05),color:CREAM,alpha:[.25,.95]},alphaK:1.2},   // ring = raio de influência; ring2 = a LINHA DA MORTE (rK = BLACKHOLE.CRUSH_K): cabe dentro dela, é esmagado; alpha do sprite = min(1,k·alphaK)
  // estrela do mundo: pulso do sprite, giro e coroa tracejada no halo (vermelha e nervosa na fase OLD)
  star:{ring:{color:YEL,colorOld:ORA,alpha:[.18,.4],pulse:.005,pulseOld:.02,width:3,dash:[18,16],spinK:-.15},pulse:{amp:.06,speed:.004,speedOld:.02},spin:.004,alphaK:1.15},
  aim:{color:CREAM,width:3,dash:[16,12],head:26,alpha:[.45,.85],pulse:.008},                          // reta pontilhada do tiro mirado
  threat:{color:ORA,width:5,size:34,margin:54,alpha:[.35,1],pulse:.012},
  // ZONA do Battle Royale: o anel vermelho pulsa, o tracejado mostra o destino e `dim` tinge só o lado de FORA.
  // Baixo de propósito — o jogador tem que continuar enxergando o inimigo fora da zona, não só o vermelho.
  zone:{color:"#ff3d5a",warn:"#ffc22e",width:5,dash:70,alpha:[.5,.95],dim:.22,pulse:.0022},                            // seta do míssil teleguiado vindo em mim (pisca mais rápido quanto mais perto)
  sparkColor:CREAM,                                                                          // faíscas de comida/pellet comido (Fx.spark)
  // ímã (por frame, t em ms): 3 anéis tracejados contraindo para a peça + 6 traços radiais correndo para dentro
  ambient(kind,t,f){if(kind!=="magnet")return null;const P=[],col=PUR,R1=f.r*1.3;
    for(let i=0;i<3;i++){const ph=((t*.0009)+i/3)%1,r=R1+(1-ph)*f.r*2.4;P.push({type:"ring",x:f.x,y:f.y,r,color:col,alpha:.15+ph*.5,width:2,dash:[r*.3,r*.22]});}
    const ph2=(t*.0018)%1,r0=R1+(1-ph2)*f.r*2.2,r1=r0+f.r*.35;
    for(let i=0;i<6;i++){const an=i/6*6.2832+t*.0006;P.push({type:"line",x1:f.x+Math.cos(an)*r1,y1:f.y+Math.sin(an)*r1,x2:f.x+Math.cos(an)*r0,y2:f.y+Math.sin(an)*r0,color:col,alpha:.35+ph2*.4,width:2});}
    return P;},
};

// ── HUD/rótulos/rastro (drawHud, drawTrail, drawCell) ──
export const hud={
  radar:{shape:"circle",size:{desktop:150,tablet:120,portrait:92,landscape:84},position:{corner:"top-left",margin:12},
    shadow:{color:INK,dx:4,dy:4},face:"#12183a",border:{color:INK,width:4},
    rings:{color:"rgba(63,196,255,.3)",width:1.5,at:[.33,.66],crosshair:true},
    sweep:{fill:"rgba(63,196,255,.16)",line:BLU,width:2,speed:.0025,span:.7},
    mapK:.72,colors:{me:CREAM,player:YEL,bot:BLU,ast:"rgba(200,180,160,.8)",hole:"rgba(197,107,255,.75)",star:"rgba(255,194,46,.9)",missile:"rgba(255,107,74,.95)",view:"rgba(255,245,194,.35)"},
    meDot:{fill:CREAM,stroke:INK,width:1.5,r:{desktop:4,tablet:4,portrait:3,landscape:3}},
    label:{text:"RADAR",font:"bold 9px "+FONT,color:BLU,desktopOnly:true,dy:-10}},
  trail:{style:"dashed",color:(skin,isMe)=>`rgba(255,255,255,${isMe?.55:.35})`,width:r=>Math.max(2,r*.22),dash:r=>[r*.35,r*.35]},
  labels:{font:FONT,nameColor:"#fff",massColor:CREAM,stroke:INK,minR:13,size:r=>Math.max(12,r*.34),massK:.68,nameY:()=>0,massY:fs=>fs*.8,strokeWidth:s=>Math.max(2,s*.2)},
  cell:{merge:{color:YEL,width:r=>Math.max(3,r*.08),radiusK:1.18},
    powerups:{colors:{magnet:PUR,shield:BLU},width:r=>Math.min(14,Math.max(3,r*.08)),dash:r=>[Math.min(48,r*.4),Math.min(36,r*.3)],
      ringR:(r,i)=>r+6+i*10,alpha:[.6,1],pulse:.012,spin:.001,shieldLevels:SHIELD_LV}},
    // o anel é OFFSET ABSOLUTO da borda (r+6px), não múltiplo do raio: com `radiusK:1.3` ele ficava 176 px
    // fora de um planeta de r=587 e com 47 px de traço — parecia outro planeta em volta. Traço e tracejado
    // também ganharam teto para o anel não virar um aro grosso no planetão.
  skinPreview:{ringK:.68,dy:2},
};

export {foodColor};   // o atlas do BRILHO precisa da cor da bolinha, e cor não sai de theme/
export default {id,name,schedule,tokens,layout,labels,rarityColor,textures,world,effects,hud,foodColor};

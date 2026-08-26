// ── TEMA "sunset" — Cartoon Crepúsculo (16:00–19:59) ─────────────────────────
// Porte literal de mockups/v2/src/theme.toon-sunset.js: fim de tarde quente — céu
// ameixa → magenta → laranja SEM sol, nuvens em silhueta com fio pêssego, cenário em
// silhueta. Estrutura: gaveta pela direita no desktop/paisagem, folhas no retrato.
// Placar dourado, radar quente, botões teal/ouro/coral. Contrato: ver ../dawn/index.js.
import {sh,rgba,spikes,astPoly,rr,mulberry,tier,foodType,FOOD_ICON,FOOD_FIXED} from "../util.js";

const INK="#241238",CREAM="#fff1d6",GOLD="#ffb547",CORAL="#ff5e6c",TEAL="#2ec4b6",PEACH="#ffcf9a",PLUM="#3b1f6b",MAG="#e0417f",ORA="#ff8a3d",SIL="#2a1550";
const FONT="'Trebuchet MS',Verdana,sans-serif",T=900;

export const id="sunset",name="Cartoon Crepúsculo";
export const schedule={from:16,to:20};
export const tokens={bg:"#3b1f6b",surface:"#4a2a7a",text:"#fff1d6",muted:"#c9a6d8",accent:"#ffb547",accent2:"#ff5e6c",danger:"#ff3b5c",ok:"#2ec4b6",
  line:"#241238",radius:"14px",radiusLg:"20px",space:"14px",fontUi:FONT,fontMono:"'Courier New',monospace",shadow:"6px 6px 0 #241238"};
export const layout={hud:"bubbles",nav:"drawer"};
export const rarityColor={free:"#c9a6d8",common:"#2ec4b6",rare:"#7fb3ff",epic:"#e0417f",legendary:"#ffb547",earned:"#7ee08a",secret:"#ff5e6c"};
export const labels={title:"🪐 PLANET.IO",tagline:"Conquiste a galáxia antes do sol se pôr!",play:"🚀 JOGAR",playAuto:"🚀 JOGAR (AUTO)",lbTitle:"PÓDIO",
  dead:"KABOOM!",deadSub:"— você virou poeira no fim da tarde —",respawn:"🔄 DE NOVO!",reconnTitle:"SINAL FRACO!",reconnSub:"Procurando o satélite… tentativa {n}/5",
  back:"◄",create:"➕ Criar sala",top5:"TOP 5 HOJE"};

// comida em 12 matizes quentes (indexados por hue 0–11) — mantém o cache pequeno
const WARM=["#ffb547","#ff8a3d","#ff5e6c","#ff7ab3","#ffcf9a","#ffd96b","#ff9e57","#e0417f","#ffc0a0","#f4a261","#ff6f91","#ffe1a8"];
const PK=sk=>sk.ring?2.05:1.3,FK=2.1,EK=1.5,AK=1.3,BK=2.4,MK=2.6,NK=2,PROPK=p=>p.ring?2:1.2;

export const textures={
  scale:{planet:PK,food:FK,ejected:EK,asteroid:AK,blackHole:BK,missile:MK,nova:NK,prop:PROPK,star:1},
  tier,
  key(kind,p={},size=0){switch(kind){
    case "planet":return`${id}:p${p.skin.id}${p.isMe?"m":""}:${size}`;
    case "food":return`${id}:f${foodType(p.type)}${foodColor(p)}`;
    case "ejected":return`${id}:e${p.color}`;
    case "asteroid":return`${id}:a${p.variant}:${size}`;
    case "prop":return`${id}:prop${p.i}`;
    case "star":return`${id}:star${p.variant?1:0}`;
    case "nova":return`${id}:nova${p.old?"o":""}:${size}`;
    default:return`${id}:${kind}`;}},

  // planeta: chapado + crescente roxo (lado oposto ao horizonte) + fio quente + brilho + emoji fantasma + contorno
  planet(c,size,{skin:sk,isMe=false}){const R=size/2,K=PK(sk),r=R/K,col=sk.color,lw=Math.max(2.5,r*.1);c.lineJoin="round";c.lineCap="round";
    const band=(a0,a1)=>{c.beginPath();c.ellipse(0,0,r*1.85,r*.56,0,a0,a1,false);c.ellipse(0,0,r*1.3,r*.39,0,a1,a0,true);c.closePath();c.fill();c.stroke();};
    if(sk.ring){c.fillStyle=sh(col,.3);c.strokeStyle=INK;c.lineWidth=lw*.7;band(Math.PI,Math.PI*2);}
    c.fillStyle=col;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
    c.save();c.beginPath();c.arc(0,0,r,0,6.283);c.clip();
    c.fillStyle="rgba(59,31,107,.45)";c.beginPath();c.arc(r*.42,r*.44,r*1.05,0,6.283);c.fill();
    c.strokeStyle="rgba(255,207,154,.8)";c.lineWidth=r*.16;c.beginPath();c.arc(0,0,r*.9,-2.95,-.95);c.stroke();
    c.fillStyle="rgba(255,241,214,.42)";c.beginPath();c.ellipse(-r*.36,-r*.38,r*.34,r*.2,-.75,0,6.283);c.fill();
    c.fillStyle="rgba(255,255,255,.3)";c.beginPath();c.arc(-r*.08,-r*.58,r*.08,0,6.283);c.fill();
    c.globalAlpha=.16;c.font=`${r*1.3}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(sk.emoji,r*.05,r*.15);c.globalAlpha=1;
    c.restore();
    if(sk.ring){c.fillStyle=sh(col,.3);c.strokeStyle=INK;c.lineWidth=lw*.7;band(0,Math.PI);}
    c.strokeStyle=isMe?CREAM:INK;c.lineWidth=lw;c.beginPath();c.arc(0,0,r,0,6.283);c.stroke();
    if(isMe){c.strokeStyle=INK;c.lineWidth=lw*.55;c.beginPath();c.arc(0,0,r+lw*.78,0,6.283);c.stroke();}},

  food(c,size,p){const R=size/2,r=R/FK,type=foodType(p.type),col=foodColor(p);c.lineJoin="round";c.strokeStyle=INK;c.lineWidth=Math.max(2,r*.24);c.fillStyle=col;
    const gl=(x,y,k)=>{c.fillStyle="rgba(255,255,255,.55)";c.beginPath();c.arc(x,y,r*k,0,6.283);c.fill();};
    if(FOOD_ICON[type]){c.beginPath();c.arc(0,0,r*1.5,0,6.283);c.fill();c.stroke();c.font=`${r*1.5}px serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(FOOD_ICON[type],0,r*.1);return;}
    if(type==="star"){spikes(c,r*1.6,5,.5,-1.5708);c.fill();c.stroke();gl(-r*.25,-r*.3,.22);return;}
    if(type==="comet"){c.beginPath();c.moveTo(-r*2,0);c.lineTo(-r*.15,-r*.8);c.arc(0,0,r*.85,-1.4,1.4);c.lineTo(-r*.15,r*.8);c.closePath();c.fill();c.stroke();gl(-r*.2,-r*.3,.25);return;}
    if(type==="rock"){c.rotate(.45);rr(c,-r,-r,r*2,r*2,r*.3);c.fill();c.stroke();gl(-r*.4,-r*.4,.24);return;}
    c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.stroke();gl(-r*.3,-r*.32,.26);},

  ejected(c,size,{color}){const r=size/2/EK;c.fillStyle=color;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(2,r*.22);c.stroke();
    c.fillStyle="rgba(255,241,214,.55)";c.beginPath();c.arc(-r*.3,-r*.32,r*.26,0,6.283);c.fill();},

  // asteroide: silhueta roxa escura com aresta pêssego do lado do horizonte, 3 crateras, contorno de tinta
  asteroid(c,size,{variant=0}){const r=size/2/AK,seed=11+variant*7,n=9+variant*2;c.lineJoin="round";
    astPoly(c,r,seed,n);c.fillStyle=PEACH;c.fill();
    c.save();c.clip();c.translate(r*.15,r*.15);astPoly(c,r,seed,n);c.fillStyle="#3a2258";c.fill();c.restore();
    const cr=mulberry(seed*3);for(let i=0;i<3;i++){const a=cr()*6.28,d=cr()*r*.5,c2=r*(.12+cr()*.14);
      c.fillStyle=INK;c.beginPath();c.arc(Math.cos(a)*d,Math.sin(a)*d,c2,0,6.283);c.fill();c.strokeStyle="rgba(255,207,154,.35)";c.lineWidth=Math.max(1.5,r*.04);c.stroke();}
    astPoly(c,r,seed,n);c.strokeStyle=INK;c.lineWidth=Math.max(3,r*.1);c.stroke();},

  // buraco negro: disco ameixa com espiral, anel dourado e linhas de sucção coral
  blackHole(c,size){const r=size/2/BK;c.lineJoin="round";c.lineCap="round";
    c.strokeStyle=CORAL;c.lineWidth=r*.12;for(let i=0;i<10;i++){const a=i/10*6.283+.3;c.beginPath();c.moveTo(Math.cos(a)*r*1.55,Math.sin(a)*r*1.55);c.lineTo(Math.cos(a+.25)*r*2.2,Math.sin(a+.25)*r*2.2);c.stroke();}
    c.fillStyle=INK;c.beginPath();c.arc(0,0,r*1.42,0,6.283);c.fill();
    c.fillStyle=SIL;c.beginPath();c.arc(0,0,r*1.3,0,6.283);c.fill();c.strokeStyle=GOLD;c.lineWidth=Math.max(3,r*.13);c.stroke();
    c.strokeStyle="#5a2f8e";c.lineWidth=r*.16;c.beginPath();for(let i=0;i<=90;i++){const k=i/90,a=k*6.283*2.2,rr=r*.15+k*r*1.0;i?c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.stroke();
    c.strokeStyle=INK;c.lineWidth=r*.04;c.beginPath();for(let i=0;i<=90;i++){const k=i/90,a=k*6.283*2.2,rr=r*.15+k*r*1.0+r*.1;i?c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.stroke();
    c.fillStyle=INK;c.beginPath();c.arc(0,0,r*.5,0,6.283);c.fill();c.strokeStyle=GOLD;c.lineWidth=r*.07;c.stroke();},

  // estrela do mundo (perigo): disco quente com raios e contorno de tinta; `old` = inchada e vermelha, a caminho da supernova
  nova(c,size,{old=false}){const r=size/2/NK,core=old?GOLD:CREAM,edge=old?CORAL:GOLD,rays=old?1.85:1.55;c.lineJoin="round";c.lineCap="round";
    c.strokeStyle=edge;c.lineWidth=Math.max(2,r*.16);
    for(let i=0;i<12;i++){const a=i/12*6.283+(old?.26:0);c.beginPath();c.moveTo(Math.cos(a)*r*1.05,Math.sin(a)*r*1.05);c.lineTo(Math.cos(a)*r*rays,Math.sin(a)*r*rays);c.stroke();}
    spikes(c,r*1.22,8,.8,-1.5708);c.fillStyle=edge;c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(2.5,r*.1);c.stroke();
    c.fillStyle=core;c.beginPath();c.arc(0,0,r*.84,0,6.283);c.fill();c.strokeStyle=INK;c.lineWidth=Math.max(2,r*.08);c.stroke();
    c.fillStyle="rgba(255,255,255,.5)";c.beginPath();c.arc(-r*.26,-r*.28,r*.24,0,6.283);c.fill();
    if(old){c.fillStyle="rgba(36,18,56,.22)";c.beginPath();c.arc(r*.3,r*.32,r*.42,0,6.283);c.fill();}},

  star(c,size,{variant=0}){const R=size/2,v=variant;c.lineJoin="round";spikes(c,R*.9,v?5:4,v?.5:.38,-1.5708);c.fillStyle=v?PEACH:CREAM;c.fill();c.strokeStyle=INK;c.lineWidth=2;c.stroke();},

  // planeta de cenário em silhueta com fio quente do lado do horizonte
  prop(c,size,{prop:p}){const R=size/2,r=R/PROPK(p);c.lineJoin="round";
    if(p.ring){c.fillStyle=SIL;c.strokeStyle=PEACH;c.lineWidth=r*.05;c.beginPath();c.ellipse(0,0,r*1.8,r*.5,-.35,0,6.283);c.ellipse(0,0,r*1.35,r*.36,-.35,6.283,0,true);c.fill("evenodd");c.stroke();}
    c.fillStyle=SIL;c.beginPath();c.arc(0,0,r,0,6.283);c.fill();
    c.save();c.clip();c.strokeStyle=PEACH;c.lineWidth=r*.13;c.beginPath();c.arc(0,0,r*.94,-2.9,-.55);c.stroke();
    c.fillStyle="rgba(255,207,154,.1)";[-.45,.1,.5].forEach(y=>{c.beginPath();c.ellipse(0,r*y,r*1.05,r*.1,0,0,6.283);c.fill();});c.restore();
    c.strokeStyle=INK;c.lineWidth=r*.07;c.beginPath();c.arc(0,0,r,0,6.283);c.stroke();},

  missile(c,size){const r=size/2/MK,fl=1;c.lineJoin="round";
    c.fillStyle=GOLD;c.beginPath();c.moveTo(-r*1.1,0);c.lineTo(-r*2.4*fl,-r*.6);c.lineTo(-r*2*fl,0);c.lineTo(-r*2.4*fl,r*.6);c.closePath();c.fill();
    c.strokeStyle=INK;c.lineWidth=Math.max(1.5,r*.24);c.fillStyle=CORAL;
    c.beginPath();c.moveTo(r*1.6,0);c.quadraticCurveTo(r*.6,-r*.95,-r*.9,-r*.7);c.lineTo(-r*1.3,-r*1.1);c.lineTo(-r*1.3,r*1.1);c.lineTo(-r*.9,r*.7);c.quadraticCurveTo(r*.6,r*.95,r*1.6,0);c.closePath();c.fill();c.stroke();
    c.fillStyle=CREAM;c.beginPath();c.arc(r*.25,0,r*.36,0,6.283);c.fill();c.stroke();},

  paintSkin(c,sk,r){const rr2=sk.ring?r*.68:r,d=rr2*PK(sk),size=tier(rr2),k=d*2/size;c.save();c.translate(0,2);c.scale(k,k);textures.planet(c,size,{skin:sk,isMe:false});c.restore();},

  background(x,W,H,{rng}={}){x.lineJoin="round";x.lineCap="round";
    const gd=x.createLinearGradient(0,0,0,H);gd.addColorStop(0,SIL);gd.addColorStop(.22,PLUM);gd.addColorStop(.6,MAG);gd.addColorStop(1,ORA);x.fillStyle=gd;x.fillRect(0,0,W,H);
    const rand=rng||mulberry(5);
    x.fillStyle=CREAM;for(let i=0;i<70;i++){const y=H*(rand()*.42);x.globalAlpha=.25+rand()*.5;x.fillRect(rand()*W,y,2,2);}x.globalAlpha=1;},

  // parallax só acima do horizonte (metade de cima), com fade
  bandLayers({seed=21,WW=3000,WH=3000}={}){const rand=mulberry(seed);
    const layers=[.2,.45].map((f,li)=>({f,color:CREAM,count:li?50:80,size:li?[2.5,4]:[1.5,2.5],alpha:[.35,.75],
      stars:Array.from({length:li?50:80},()=>({x:rand()*T,y:rand()*T,s:li?2.5+rand()*1.5:1.5+rand(),a:+(.35+rand()*.4).toFixed(2)}))}));
    const bigStars={f:.7,count:22,size:[14,26],alpha:1,variants:2,stars:Array.from({length:22},()=>({x:rand()*T,y:rand()*T,s:14+rand()*12,v:rand()<.5?1:0}))};
    const props=[];for(let i=0;i<10;i++)props.push({x:200+rand()*(WW-400),y:200+rand()*(WH-400),r:80+rand()*120,ring:rand()<.4});
    return{tile:T,fade:{y0:.5,d:.2},layers,bigStars,props,propsAlpha:.55};},
};
function foodColor(p){const t=foodType(p.type);return FOOD_ICON[t]?(p.color||FOOD_FIXED[t]):WARM[(p.hue|0)%12];}

export const world={grid:{step:150,color:"rgba(255,207,154,.09)",width:2},border:[{color:INK,width:18},{color:GOLD,width:6,dash:[40,26]}],propsAlpha:.55,
  foodAnim:{starPulse:{amp:.14,speed:.003},bob:{amp:3,speed:.005}}};

// escudo por nível (1 → 2 → 3): cor, largura, pulso e nº de anéis — usados pelos anéis (Planets.js), pelo HUD e pelos efeitos
const SHIELD_LV=[{color:TEAL,widthK:1,pulse:.012,alpha:[.6,1],rings:1},{color:MAG,widthK:1.25,pulse:.02,alpha:[.7,1],rings:1},{color:GOLD,widthK:1.5,pulse:.03,alpha:[.85,1],rings:2}],ROCK_DUST="#b8a898";
export const effects={
  fx(kind,k,f){const a=1-k,P=[];
    switch(kind){
      case "bounce":{const s=f.r*(.7+k*.3)*(.6+(f.power||1)*.5),rot=(f.nx||0)*.6;
        P.push({type:"star",x:f.x,y:f.y,r:s,n:8,inner:.55,phase:0,rot,fill:GOLD,stroke:INK,width:Math.max(2,s*.08)});
        P.push({type:"text",x:f.x,y:f.y,text:"POW!",size:Math.max(10,s*.5),fill:CREAM,stroke:INK,font:FONT,rot});break;}
      case "pop":{const s=f.r*(1+k*.8),al=Math.min(1,a*1.5);
        P.push({type:"star",x:f.x,y:f.y,r:s,n:10,inner:.5,phase:k*.6,fill:CORAL,stroke:INK,width:Math.max(2,s*.06),alpha:al});
        P.push({type:"text",x:f.x,y:f.y,text:"BOOM",size:Math.max(10,s*.42),fill:GOLD,stroke:INK,font:FONT,alpha:al});break;}
      case "boom":{const s=f.r*(.8+k*1.2),al=Math.min(1,a*1.5);
        P.push({type:"star",x:f.x,y:f.y,r:s,n:12,inner:.55,phase:-k*.5,fill:CORAL,stroke:INK,width:Math.max(2.5,s*.06),alpha:al});
        P.push({type:"star",x:f.x,y:f.y,r:s*.55,n:12,inner:.55,phase:-k*.5,fill:GOLD,alpha:al});
        P.push({type:"text",x:f.x,y:f.y,text:"KABOOM!",size:Math.max(11,s*.34),fill:CREAM,stroke:INK,font:FONT,alpha:al});break;}
      case "suck":P.push({type:"ring",x:f.x,y:f.y,r:f.r*(3-k*2.6),color:CORAL,alpha:a,width:4});break;
      case "exit":case "split":case "merge":P.push({type:"ring",x:f.x,y:f.y,r:f.r*(.6+k*1.5),color:CREAM,alpha:a,width:3});break;
      case "chip":{const b=Math.atan2(f.ny||0,f.nx||1);for(let i=-1;i<=1;i++){const an=b+i*.5;
        P.push({type:"line",x1:f.x,y1:f.y,x2:f.x+Math.cos(an)*f.r*3*k,y2:f.y+Math.sin(an)*f.r*3*k,color:GOLD,alpha:a,width:3});}break;}
      case "shoot":P.push({type:"burst",x:f.x,y:f.y,n:8,r0:f.r*(1+k),r1:f.r*(1.6+k*1.4),color:CORAL,alpha:a,width:3});break;
      case "eat":{const s=f.r*(1+k*1.1),al=Math.min(1,a*1.4);   // planeta comido: explosão (estrela + estilhaços + anel + texto)
        P.push({type:"star",x:f.x,y:f.y,r:s,n:10,inner:.5,phase:k*.8,fill:GOLD,stroke:INK,width:Math.max(2,s*.06),alpha:al});
        P.push({type:"burst",x:f.x,y:f.y,n:8,r0:f.r*(1.1+k*1.6),r1:f.r*(1.5+k*2.6),color:CREAM,alpha:a,width:Math.max(2,f.r*.08)});
        P.push({type:"ring",x:f.x,y:f.y,r:f.r*(1.2+k*1.6),color:CREAM,alpha:a,width:3});
        if(f.r>8)P.push({type:"text",x:f.x,y:f.y-f.r*(1+k*1.5),text:"NHAC!",size:Math.max(10,f.r*.7),fill:"#fff",stroke:INK,font:FONT,alpha:al});break;}
      case "vanish":{const col=f.color||CREAM;   // sumiço no mesmo frame: anel que colapsa + 6 estilhaços na cor do planeta
        P.push({type:"ring",x:f.x,y:f.y,r:f.r*(1-k*.9)+1,color:col,alpha:a,width:Math.max(3,f.r*.15*(1-k))});
        P.push({type:"burst",x:f.x,y:f.y,n:6,r0:f.r*(.4+k*2),r1:f.r*(.9+k*2.6),color:col,alpha:a,width:Math.max(2,f.r*.1),phase:.5});break;}
      case "death":{const s=f.r*(1+k*2),al=Math.min(1,a*1.3);
        P.push({type:"star",x:f.x,y:f.y,r:s,n:14,inner:.5,phase:k*.4,fill:CORAL,stroke:INK,width:Math.max(3,s*.05),alpha:al});
        P.push({type:"star",x:f.x,y:f.y,r:s*.5,n:14,inner:.5,phase:-k*.4,fill:GOLD,alpha:al});
        P.push({type:"ring",x:f.x,y:f.y,r:s*1.3,color:"#fff",alpha:a,width:4});
        P.push({type:"text",x:f.x,y:f.y,text:"KABOOM!",size:Math.max(12,s*.3),fill:"#fff",stroke:INK,font:FONT,alpha:al});break;}
      case "shieldBreak":{const col=SHIELD_LV[0].color,R0=f.r*1.3;   // anel estilhaça em 8 arcos que voam
        P.push({type:"ring",x:f.x,y:f.y,r:R0*(1+k*.4),color:col,alpha:a*.6,width:3,dash:[R0*.5,R0*.35]});
        P.push({type:"burst",x:f.x,y:f.y,n:8,r0:R0*(1+k*1.2),r1:R0*(1.3+k*1.8),color:col,alpha:a,width:Math.max(3,f.r*.1),phase:.4});
        P.push({type:"text",x:f.x,y:f.y-f.r*1.4,text:"CRACK!",size:Math.max(10,f.r*.5),fill:"#fff",stroke:INK,font:FONT,alpha:a});break;}
      case "shieldHit":{const col=(SHIELD_LV[(f.level||1)-1]||SHIELD_LV[0]).color,hx=f.x+(f.nx||0)*f.r*1.3,hy=f.y+(f.ny||0)*f.r*1.3;   // flash do anel + impacto na borda
        P.push({type:"ring",x:f.x,y:f.y,r:f.r*1.3*(1+k*.15),color:col,alpha:a,width:Math.max(4,f.r*.12)});
        P.push({type:"star",x:hx,y:hy,r:f.r*.45*(1+k),n:6,inner:.5,phase:k,fill:"#fff",stroke:INK,width:2,alpha:a});break;}
      case "shieldUp":{const col=(SHIELD_LV[(f.level||1)-1]||SHIELD_LV[0]).color;
        P.push({type:"ring",x:f.x,y:f.y,r:f.r*(1.3+k*1.4),color:col,alpha:a,width:4});
        P.push({type:"text",x:f.x,y:f.y-f.r*(1.2+k*.8),text:"NÍVEL "+(f.level||1)+"!",size:Math.max(10,f.r*.5),fill:col,stroke:INK,font:FONT,alpha:a});break;}
      case "clash":{const s=f.r*(2+k*3),al=Math.min(1,a*1.4);   // míssil × míssil
        P.push({type:"star",x:f.x,y:f.y,r:s,n:9,inner:.5,phase:k*.7,fill:CORAL,stroke:INK,width:Math.max(2,s*.06),alpha:al});
        P.push({type:"star",x:f.x,y:f.y,r:s*.5,n:9,inner:.5,phase:-k*.7,fill:"#fff",alpha:al});
        P.push({type:"text",x:f.x,y:f.y,text:"BAM!",size:Math.max(11,s*.4),fill:GOLD,stroke:INK,font:FONT,alpha:al});break;}
      case "deflect":{P.push({type:"burst",x:f.x,y:f.y,n:7,r0:f.r*(.3+k*1.2),r1:f.r*(.7+k*1.8),color:ROCK_DUST,alpha:a,width:Math.max(2,f.r*.08),phase:(f.nx||0)});   // poeira de rocha
        P.push({type:"star",x:f.x,y:f.y,r:f.r*.5*(1+k),n:7,inner:.5,phase:k,fill:GOLD,stroke:INK,width:2,alpha:a});break;}
      case "starBurst":{const s=f.r*(1+k*1.4),al=Math.min(1,a*1.4);   // planeta estilhaçado pela estrela
        P.push({type:"star",x:f.x,y:f.y,r:s,n:11,inner:.45,phase:k*.9,fill:GOLD,stroke:INK,width:Math.max(2,s*.06),alpha:al});
        P.push({type:"burst",x:f.x,y:f.y,n:9,r0:f.r*(.8+k*2),r1:f.r*(1.4+k*3),color:CORAL,alpha:a,width:Math.max(2,f.r*.12)});
        P.push({type:"text",x:f.x,y:f.y-f.r*(1.2+k),text:"CRASH!",size:Math.max(11,f.r*.6),fill:"#fff",stroke:INK,font:FONT,alpha:al});break;}
      case "supernova":{const s=f.r*(.25+k*.85),al=Math.min(1,a*1.6);   // onda de choque: anéis crescendo + clarão + texto
        for(let i=0;i<3;i++){const kk=Math.max(0,k-i*.12);P.push({type:"ring",x:f.x,y:f.y,r:f.r*(.15+kk*1.05),color:i?CORAL:CREAM,alpha:a*(1-i*.25),width:Math.max(3,f.r*.03*(1-kk))});}
        P.push({type:"star",x:f.x,y:f.y,r:s*.5,n:16,inner:.45,phase:-k*.5,fill:GOLD,stroke:INK,width:Math.max(2,s*.02),alpha:al});
        P.push({type:"burst",x:f.x,y:f.y,n:14,r0:f.r*(.2+k*.9),r1:f.r*(.35+k*1.15),color:CREAM,alpha:a,width:Math.max(2,f.r*.02)});
        P.push({type:"text",x:f.x,y:f.y,text:"SUPERNOVA!",size:Math.max(14,f.r*.14),fill:CREAM,stroke:INK,font:FONT,alpha:al});break;}
      case "countdown":{const s=f.r*(1.6-k*.5),al=Math.min(1,a*2);   // contagem do fim do mundo (segundos finais)
        P.push({type:"ring",x:f.x,y:f.y,r:f.r*(.7+k*1.1),color:CORAL,alpha:a*.7,width:Math.max(4,f.r*.05)});
        P.push({type:"text",x:f.x,y:f.y,text:String(f.n||0),size:s,fill:"#fff",stroke:INK,font:FONT,alpha:al});break;}
      case "rock":P.push({type:"ring",x:f.x,y:f.y,r:f.r*.4*(1+k),color:PEACH,alpha:a*.5,width:2});break;}
    return P;},
  missileTrail:{color:CREAM,alphaK:.5,radiusK:.7,every:2},
  missileFlame:{amp:.25,speed:.05},
  blackHole:{ring:{color:CORAL,alpha:[.3,.4],pulse:.004,width:3,dash:[14,18],spinK:-.4},alphaK:1.2},
  // estrela do mundo: pulso do sprite, giro e coroa tracejada no halo (vermelha e nervosa na fase OLD)
  star:{ring:{color:GOLD,colorOld:CORAL,alpha:[.18,.4],pulse:.005,pulseOld:.02,width:3,dash:[18,16],spinK:-.15},pulse:{amp:.06,speed:.004,speedOld:.02},spin:.004,alphaK:1.15},
  aim:{color:CREAM,width:3,dash:[16,12],head:26,alpha:[.45,.85],pulse:.008},                          // reta pontilhada do tiro mirado
  sparkColor:CREAM,                                                                          // faíscas de comida/pellet comido (Fx.spark)
  // ímã (por frame, t em ms): 3 anéis tracejados contraindo para a peça + 6 traços radiais correndo para dentro
  ambient(kind,t,f){if(kind!=="magnet")return null;const P=[],col=MAG,R1=f.r*1.3;
    for(let i=0;i<3;i++){const ph=((t*.0009)+i/3)%1,r=R1+(1-ph)*f.r*2.4;P.push({type:"ring",x:f.x,y:f.y,r,color:col,alpha:.15+ph*.5,width:2,dash:[r*.3,r*.22]});}
    const ph2=(t*.0018)%1,r0=R1+(1-ph2)*f.r*2.2,r1=r0+f.r*.35;
    for(let i=0;i<6;i++){const an=i/6*6.2832+t*.0006;P.push({type:"line",x1:f.x+Math.cos(an)*r1,y1:f.y+Math.sin(an)*r1,x2:f.x+Math.cos(an)*r0,y2:f.y+Math.sin(an)*r0,color:col,alpha:.35+ph2*.4,width:2});}
    return P;},
};

export const hud={
  radar:{shape:"circle",size:{desktop:150,portrait:92,landscape:84},position:{corner:"top-right",margin:12},
    shadow:{color:INK,dx:4,dy:4},face:"#5a2450",border:{color:INK,width:4},
    rings:{color:"rgba(255,207,154,.3)",width:1.5,at:[.33,.66],crosshair:true},
    sweep:{fill:"rgba(255,181,71,.2)",line:GOLD,width:2,speed:.0025,span:.7},
    mapK:.72,colors:{me:CREAM,player:GOLD,bot:TEAL,ast:"rgba(255,207,154,.75)",hole:"rgba(255,94,108,.85)",star:"rgba(255,181,71,.9)",view:"rgba(255,241,214,.35)"},
    meDot:{fill:CREAM,stroke:INK,width:1.5,r:{desktop:4,portrait:3,landscape:3}},
    label:{text:"RADAR",font:"bold 9px "+FONT,color:GOLD,desktopOnly:true,dy:-10}},
  trail:{style:"dashed",color:(skin,isMe)=>rgba(PEACH,isMe?.7:.42),width:r=>Math.max(2,r*.22),dash:r=>[r*.35,r*.35]},
  labels:{font:FONT,nameColor:"#fff",massColor:PEACH,stroke:INK,minR:13,size:r=>Math.max(12,r*.34),massK:.68,nameY:fs=>-fs*.28,massY:fs=>fs*.8,strokeWidth:s=>Math.max(2,s*.2)},
  cell:{merge:{color:GOLD,width:r=>Math.max(3,r*.08),radiusK:1.18},
    powerups:{colors:{magnet:MAG,shield:TEAL},width:r=>Math.max(3,r*.08),dash:r=>[r*.4,r*.3],radiusK:i=>1.3+i*.16,alpha:[.6,1],pulse:.012,spin:.001,shieldLevels:SHIELD_LV}},
  skinPreview:{ringK:.68,dy:2},
};

export default {id,name,schedule,tokens,layout,labels,rarityColor,textures,world,effects,hud};

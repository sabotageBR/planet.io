// ── PADRÕES DE SKIN (procedurais) + arte dos perigos ─────────────────────────
// Uma fonte só para os três temas: o padrão é desenhado DENTRO do disco já recortado
// (textures.planet faz o clip), em coordenadas centradas com raio r. Nada de imagem —
// tudo canvas, assado uma vez por (skin, tier) no TextureCache, então custa zero por frame.
//   paintPattern(c,r,skin,P)   P = {ink,light,shadow} do tema
//   paintHole(c,r,P)           buraco negro: disco de acreção + anel de fóton + núcleo
//   paintNova(c,r,old,P)       estrela: coroa em camadas, núcleo quente e línguas de plasma
// skin.pattern escolhe o desenho; skin.accent é a 2ª cor (quando o padrão usa).
import {sh,rgba,spikes,mulberry} from "./util.js";

const TAU=6.2832;
const arc=(c,x,y,rad)=>{c.beginPath();c.arc(x,y,rad,0,TAU);c.fill();};
/** Faixas horizontais (gigantes gasosos): n elipses alternando claro/escuro. */
function stripes(c,r,col,acc,n=5){
  for(let i=0;i<n;i++){const t=(i+.5)/n,y=(t*2-1)*r,h=r/n*(.55+.35*Math.sin(t*3.1));
    c.fillStyle=i%2?sh(col,.16):sh(col,-.16);c.beginPath();c.ellipse(0,y,r*1.02,h,0,0,TAU);c.fill();}
  if(acc){c.fillStyle=acc;c.beginPath();c.ellipse(r*.34,r*.18,r*.26,r*.15,-.25,0,TAU);c.fill();
    c.strokeStyle=sh(acc,-.3);c.lineWidth=Math.max(1,r*.03);c.stroke();}}
/** Espiral (tempestade/galáxia): `arms` braços de `turns` voltas. */
function spiral(c,r,color,width,arms=2,turns=1.15,fade=1){
  c.lineCap="round";
  for(let a=0;a<arms;a++){c.strokeStyle=color;c.globalAlpha=fade;c.lineWidth=width;c.beginPath();
    for(let i=0;i<=60;i++){const k=i/60,an=a/arms*TAU+k*TAU*turns,rad=r*(.12+k*.92);
      i?c.lineTo(Math.cos(an)*rad,Math.sin(an)*rad):c.moveTo(Math.cos(an)*rad,Math.sin(an)*rad);}
    c.stroke();}
  c.globalAlpha=1;}
/** Crateras determinísticas por seed. */
function craters(c,r,col,ink,n=6,seed=7){const g=mulberry(seed*97+3);
  for(let i=0;i<n;i++){const a=g()*TAU,d=g()*r*.72,cr=r*(.09+g()*.17),x=Math.cos(a)*d,y=Math.sin(a)*d;
    c.fillStyle=sh(col,-.22);arc(c,x,y,cr);
    c.fillStyle=sh(col,.12);arc(c,x-cr*.18,y-cr*.18,cr*.72);
    c.strokeStyle=rgba(ink,.35);c.lineWidth=Math.max(1,r*.02);c.beginPath();c.arc(x,y,cr,0,TAU);c.stroke();}}
/** Manchas irregulares (continentes, nebulosa, veneno). */
function blobs(c,r,color,n,seed,scale=.34,alpha=1){const g=mulberry(seed*131+11);c.globalAlpha=alpha;c.fillStyle=color;
  for(let i=0;i<n;i++){const a=g()*TAU,d=g()*r*.62,br=r*scale*(.5+g()*.8),x=Math.cos(a)*d,y=Math.sin(a)*d;
    c.beginPath();
    for(let k=0;k<=10;k++){const an=k/10*TAU,rad=br*(.62+g()*.5);
      k?c.lineTo(x+Math.cos(an)*rad,y+Math.sin(an)*rad):c.moveTo(x+Math.cos(an)*rad,y+Math.sin(an)*rad);}
    c.closePath();c.fill();}
  c.globalAlpha=1;}
/** Rachaduras que brilham (lava, cristal, gelo). */
function cracks(c,r,color,width,n,seed,glow){const g=mulberry(seed*57+5);c.lineCap="round";c.lineJoin="round";
  for(let i=0;i<n;i++){let x=Math.cos(g()*TAU)*r*.2,y=Math.sin(g()*TAU)*r*.2,an=g()*TAU;
    if(glow){c.strokeStyle=rgba(glow,.5);c.lineWidth=width*2.6;}
    for(let pass=0;pass<(glow?2:1);pass++){
      if(pass){c.strokeStyle=color;c.lineWidth=width;}
      let px=x,py=y,pa=an;c.beginPath();c.moveTo(px,py);
      const gg=mulberry(seed*57+5+i*13);
      for(let k=0;k<5;k++){pa+=gg()*1.1-.55;const step=r*(.16+gg()*.2);px+=Math.cos(pa)*step;py+=Math.sin(pa)*step;c.lineTo(px,py);}
      c.stroke();}}}

/**
 * Padrão da skin dentro do disco (já recortado). Devolve true se desenhou algo —
 * quem chama usa isso para decidir se ainda põe o emoji fantasma.
 * @param {CanvasRenderingContext2D} c @param {number} r
 */
export function paintPattern(c,r,sk,{ink="#141026",light="#fff5c2"}={}){
  const p=sk&&sk.pattern,col=sk.color,acc=sk.accent||sh(col,.35),seed=(sk.id|0)+1;
  if(!p||p==="plain")return false;
  c.save();c.lineJoin="round";
  switch(p){
    case "stripes":stripes(c,r,col,sk.accent||null,5);break;
    case "clouds":stripes(c,r,col,null,7);blobs(c,r,rgba(light,.22),4,seed,.3);break;
    case "storm":spiral(c,r,rgba(light,.5),r*.14,2,1.3);c.fillStyle=acc;c.beginPath();c.ellipse(r*.1,-r*.05,r*.3,r*.22,.4,0,TAU);c.fill();break;
    case "swirl":spiral(c,r,rgba(light,.45),r*.12,3,1.1);break;
    case "galaxy":{spiral(c,r,rgba(acc,.75),r*.1,2,1.4);spiral(c,r,rgba(light,.5),r*.06,2,1.4,.7);
      c.fillStyle=light;const g=mulberry(seed*7);for(let i=0;i<14;i++){const a=g()*TAU,d=r*(.15+g()*.8);arc(c,Math.cos(a)*d,Math.sin(a)*d,r*.035);}
      c.fillStyle=rgba(light,.85);arc(c,0,0,r*.16);break;}
    case "craters":craters(c,r,col,ink,6,seed);break;
    case "continents":{blobs(c,r,acc,4,seed,.4);c.fillStyle=rgba(light,.75);
      c.beginPath();c.ellipse(0,-r*.86,r*.5,r*.2,0,0,TAU);c.fill();c.beginPath();c.ellipse(0,r*.86,r*.44,r*.17,0,0,TAU);c.fill();break;}
    case "lava":{c.fillStyle=sh(col,-.55);arc(c,0,0,r);blobs(c,r,sh(col,-.35),5,seed,.42);
      cracks(c,r,acc,Math.max(1.5,r*.055),4,seed,acc);break;}
    case "ice":{blobs(c,r,rgba(light,.5),4,seed,.36);cracks(c,r,rgba(light,.9),Math.max(1,r*.04),3,seed);break;}
    case "poison":{blobs(c,r,rgba(acc,.5),3,seed,.42);const g=mulberry(seed*23);
      for(let i=0;i<7;i++){const a=g()*TAU,d=g()*r*.75,br=r*(.07+g()*.1);c.fillStyle=rgba(acc,.85);arc(c,Math.cos(a)*d,Math.sin(a)*d,br);
        c.fillStyle=rgba(light,.5);arc(c,Math.cos(a)*d-br*.25,Math.sin(a)*d-br*.25,br*.35);}break;}
    case "aurora":{for(let i=0;i<3;i++){c.strokeStyle=rgba(i%2?acc:light,.45);c.lineWidth=r*.16;c.beginPath();
      for(let k=0;k<=24;k++){const x=-r+k/24*r*2,y=(i-1)*r*.42+Math.sin(k/24*4+i)*r*.16;k?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();}break;}
    case "checker":{const n=5,s=r*2/n;c.fillStyle=sh(col,-.3);
      for(let i=0;i<n;i++)for(let j=0;j<n;j++)if((i+j)%2)c.fillRect(-r+i*s,-r+j*s,s,s);break;}
    case "crystal":{const g=mulberry(seed*11);c.strokeStyle=rgba(light,.6);c.lineWidth=Math.max(1,r*.035);
      for(let i=0;i<6;i++){const a=g()*TAU;c.fillStyle=rgba(light,.12+g()*.18);c.beginPath();
        c.moveTo(0,0);c.lineTo(Math.cos(a)*r,Math.sin(a)*r);c.lineTo(Math.cos(a+.7)*r,Math.sin(a+.7)*r);c.closePath();c.fill();c.stroke();}break;}
    case "rings2":{c.strokeStyle=rgba(light,.45);for(const k of [.42,.66,.88]){c.lineWidth=r*.07;c.beginPath();c.ellipse(0,0,r*k,r*k*.42,-.3,0,TAU);c.stroke();}break;}
    case "eye":{c.fillStyle=light;c.beginPath();c.ellipse(0,0,r*.72,r*.46,0,0,TAU);c.fill();
      c.fillStyle=acc;arc(c,0,0,r*.34);c.fillStyle=ink;arc(c,0,0,r*.17);
      c.fillStyle=rgba(light,.9);arc(c,-r*.12,-r*.14,r*.07);
      c.strokeStyle=ink;c.lineWidth=Math.max(2,r*.07);c.beginPath();c.ellipse(0,0,r*.72,r*.46,0,0,TAU);c.stroke();break;}
    case "sparkle":{const g=mulberry(seed*17);c.fillStyle=rgba(light,.9);
      for(let i=0;i<9;i++){const a=g()*TAU,d=g()*r*.8,s2=r*(.08+g()*.12);c.save();c.translate(Math.cos(a)*d,Math.sin(a)*d);spikes(c,s2,4,.34,g()*TAU);c.fill();c.restore();}break;}
    case "void":{c.fillStyle=ink;arc(c,0,0,r*.99);c.strokeStyle=rgba(acc,.9);c.lineWidth=r*.1;
      c.beginPath();c.ellipse(0,0,r*.86,r*.3,-.35,0,TAU);c.stroke();
      c.strokeStyle=rgba(light,.55);c.lineWidth=r*.045;c.beginPath();c.arc(0,0,r*.5,0,TAU);c.stroke();break;}
    case "nebula":{blobs(c,r,rgba(acc,.45),4,seed,.5);blobs(c,r,rgba(light,.28),3,seed+9,.36);
      c.fillStyle=light;const g=mulberry(seed*29);for(let i=0;i<8;i++){const a=g()*TAU,d=g()*r*.85;arc(c,Math.cos(a)*d,Math.sin(a)*d,r*.03);}break;}
    case "metal":{for(let i=0;i<4;i++){c.fillStyle=rgba(light,i%2?.1:.22);c.fillRect(-r,-r+i*r*.5,r*2,r*.25);}
      c.fillStyle=rgba(ink,.5);const g=mulberry(seed*37);for(let i=0;i<6;i++){const a=g()*TAU;arc(c,Math.cos(a)*r*.72,Math.sin(a)*r*.72,r*.06);}break;}
    case "scales":{c.strokeStyle=rgba(ink,.45);c.lineWidth=Math.max(1,r*.03);const s=r*.32;
      for(let y=-r;y<r;y+=s*.62)for(let x=-r;x<r+s;x+=s){c.beginPath();c.arc(x+((Math.round(y/(s*.62))%2)?s/2:0),y,s*.5,Math.PI,0);c.stroke();}
      c.fillStyle=rgba(acc,.35);c.fillRect(-r,-r*.12,r*2,r*.24);break;}
    case "plasma":{c.strokeStyle=rgba(acc,.7);c.lineWidth=r*.1;c.lineCap="round";
      for(let i=0;i<7;i++){const a=i/7*TAU;c.beginPath();c.moveTo(Math.cos(a)*r*.15,Math.sin(a)*r*.15);
        c.quadraticCurveTo(Math.cos(a+.5)*r*.6,Math.sin(a+.5)*r*.6,Math.cos(a)*r*.95,Math.sin(a)*r*.95);c.stroke();}
      c.fillStyle=rgba(light,.8);arc(c,0,0,r*.3);break;}
    default:c.restore();return false;}
  c.restore();return true;}

/**
 * Buraco negro: núcleo preto, disco de acreção elíptico em perspectiva (metade de trás por cima do horizonte,
 * metade da frente por baixo), anel de fóton e braços finos de sucção. `P` = {ink,glow,hot,cold}.
 */
export function paintHole(c,r,{ink="#141026",glow="#c56bff",hot="#ff8a3d",cold="#7a2fd6"}={}){
  c.lineJoin="round";c.lineCap="round";
  const disc=(y0,y1)=>{const g=c.createLinearGradient(-r*2,0,r*2,0);g.addColorStop(0,rgba(cold,.15));g.addColorStop(.32,hot);
    g.addColorStop(.5,rgba(glow,.95));g.addColorStop(.68,hot);g.addColorStop(1,rgba(cold,.15));c.fillStyle=g;
    c.beginPath();c.ellipse(0,0,r*2.1,r*.72,0,y0,y1,false);c.ellipse(0,0,r*1.3,r*.42,0,y1,y0,true);c.closePath();c.fill();};
  c.strokeStyle=rgba(glow,.5);c.lineWidth=r*.06;   // braços de sucção
  for(let i=0;i<12;i++){const a=i/12*TAU+.2;c.beginPath();c.moveTo(Math.cos(a)*r*1.5,Math.sin(a)*r*1.5*.55);
    c.lineTo(Math.cos(a+.3)*r*2.3,Math.sin(a+.3)*r*2.3*.55);c.stroke();}
  disc(Math.PI,TAU);                                  // metade de trás (aparece por cima)
  c.fillStyle=ink;c.beginPath();c.arc(0,0,r*1.12,0,TAU);c.fill();                       // horizonte
  c.strokeStyle=rgba(hot,.9);c.lineWidth=r*.09;c.beginPath();c.arc(0,0,r*1.2,0,TAU);c.stroke();   // anel de fóton
  c.strokeStyle=rgba(glow,.55);c.lineWidth=r*.04;c.beginPath();c.arc(0,0,r*1.34,0,TAU);c.stroke();
  disc(0,Math.PI);                                    // metade da frente
  c.fillStyle=ink;c.beginPath();c.arc(0,0,r*.92,0,TAU);c.fill();
  c.strokeStyle=rgba(glow,.35);c.lineWidth=r*.05;c.beginPath();c.arc(0,0,r*.62,-1.2,2.1);c.stroke();}

/**
 * Estrela do mundo: coroa em 3 camadas, línguas de plasma curvas e núcleo quente. `old` = gigante vermelha
 * inchada, com manchas escuras e rachaduras brilhantes (telegrafa a supernova). `P` = {ink,core,edge,deep}.
 */
export function paintNova(c,r,old,{ink="#141026",core="#fff5c2",edge="#ffc22e",deep="#ff6b4a"}={}){
  c.lineJoin="round";c.lineCap="round";
  const hot=old?deep:edge,mid=old?edge:core;
  for(let i=3;i>0;i--){c.fillStyle=rgba(hot,.1*i);arc(c,0,0,r*(1+i*.22));}          // coroa
  c.strokeStyle=rgba(hot,.85);c.lineWidth=Math.max(2,r*.1);                          // línguas de plasma
  for(let i=0;i<9;i++){const a=i/9*TAU+(old?.3:0),l=r*(old?1.75:1.5);
    c.beginPath();c.moveTo(Math.cos(a)*r*.96,Math.sin(a)*r*.96);
    c.quadraticCurveTo(Math.cos(a+.42)*l*.82,Math.sin(a+.42)*l*.82,Math.cos(a+.12)*l,Math.sin(a+.12)*l);c.stroke();}
  const g=c.createRadialGradient(-r*.2,-r*.24,r*.06,0,0,r);
  g.addColorStop(0,old?mid:"#ffffff");g.addColorStop(.45,mid);g.addColorStop(1,hot);
  c.fillStyle=g;arc(c,0,0,r);
  c.strokeStyle=ink;c.lineWidth=Math.max(2,r*.09);c.beginPath();c.arc(0,0,r,0,TAU);c.stroke();
  if(old){c.save();c.beginPath();c.arc(0,0,r*.98,0,TAU);c.clip();
    blobs(c,r,rgba(ink,.3),4,3,.3);cracks(c,r,rgba(core,.9),Math.max(1.5,r*.05),3,9,core);c.restore();}
  else{c.fillStyle="rgba(255,255,255,.45)";arc(c,-r*.28,-r*.3,r*.22);}}

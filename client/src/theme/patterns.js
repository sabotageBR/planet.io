// ── PADRÕES DE SKIN (procedurais) + arte dos perigos ─────────────────────────
// Uma fonte só para os três temas: o padrão é desenhado DENTRO do disco já recortado
// (textures.planet faz o clip), em coordenadas centradas com raio r. Nada de imagem —
// tudo canvas, assado uma vez por (skin, tier) no TextureCache, então custa zero por frame.
//   paintPattern(c,r,skin,P)   P = {ink,light,shadow} do tema
//   paintHole(c,r,P)           buraco negro: sombra + disco de acreção lenteado + anel de fóton (perspectiva FIXA)
//   paintNova(c,r,old,P)       estrela: coroa em camadas, núcleo quente e línguas de plasma
// skin.pattern escolhe o desenho; skin.accent é a 2ª cor (quando o padrão usa).
import {sh,rgba,spikes,mulberry} from "./util.js";
import {STARTER_SKINS} from "@warspace/shared";

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
/** Crateras determinísticas por seed. `acc` (opcional) tinge o rebordo de uma cratera em cada três e
 *  espalha uma poeira leve na cor dela por cima do disco; `sizeK` encolhe/aumenta o raio das crateras
 *  (o Asteroide usa < 1 para ficar mais "picado" que a Lua). Sem os dois, Marte/Mercúrio/Lua/Asteroide
 *  reaproveitam o MESMO desenho e só diferem pela cor de base — `acc` já existe em cada skin
 *  (shared/src/skins.js) e simplesmente nunca era lido aqui. */
function craters(c,r,col,ink,n=6,seed=7,acc=null,sizeK=1){const g=mulberry(seed*97+3);
  for(let i=0;i<n;i++){const a=g()*TAU,d=g()*r*.72,cr=r*(.09+g()*.17)*sizeK,x=Math.cos(a)*d,y=Math.sin(a)*d;
    c.fillStyle=sh(col,-.22);arc(c,x,y,cr);
    c.fillStyle=sh(col,.12);arc(c,x-cr*.18,y-cr*.18,cr*.72);
    c.strokeStyle=rgba(i%3&&acc?ink:acc||ink,.35);c.lineWidth=Math.max(1,r*.02);c.beginPath();c.arc(x,y,cr,0,TAU);c.stroke();}
  if(acc){const gg=mulberry(seed*97+3+n*7);c.fillStyle=rgba(acc,.16);
    for(let i=0;i<8;i++){const a=gg()*TAU,d=gg()*r*.85,sp=r*(.018+gg()*.03);arc(c,Math.cos(a)*d,Math.sin(a)*d,sp);}}}
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
export function paintPattern(c,r,sk,{ink="#141026",light="#fff5c2",avatar=null,face:faceBmp=null}={}){
  const p=sk&&sk.pattern,col=sk.color,acc=sk.accent||sh(col,.35),seed=(sk.id|0)+1;
  // ── A ARTE VINDA DO BANCO DECIDE ANTES DO SWITCH ────────────────────────────────────────────────
  // ⚠️ TEM que ser aqui, e este é o ponto que quase passou batido: o despacho abaixo é por `sk.pattern`,
  // então uma skin com arte no banco cairia no case do PADRÃO PROCEDURAL dela (uma lendária continuaria
  // desenhando a coroa) ou, se fosse `plain`, no `return false` que leva ao emoji fantasma. Marcar a arte
  // fora do `pattern` e esperar que `faceFile` resolvesse não funcionaria: aquele governa o DOWNLOAD e a
  // CHAVE do cache, nunca o desenho.
  // ⚠️ SEM o bitmap, CAI NO PATTERN de sempre — e não num disco liso. Enquanto a arte não chega (ou se o
  // banco estiver fora), a skin continua sendo desenhada como sempre foi: é o degrade certo para uma
  // caricatura ou uma lendária, e não um flash de disco vazio. Quando o bitmap chega, a CHAVE da textura
  // muda (faces.js) e o frame seguinte reassa com a imagem.
  // O predicado é "TEM bitmap e o pattern não é um dos que já o consomem", e não um campo novo na skin:
  // `faceBmp` só chega aqui porque `faceFile` disse que esta skin tem arte, e `face`/`mascote`/`avatar` já
  // têm case próprio logo abaixo. Assim uma skin de banco (`plain`) e uma lendária com override (`crown`)
  // caem no mesmo caminho, sem inventar bandeira nenhuma no catálogo.
  if(faceBmp&&p!=="face"&&p!=="mascote"&&p!=="avatar"){
    c.save();arte(c,r,faceBmp,{ink});c.restore();return true;}
  if(!p||p==="plain")return false;
  c.save();c.lineJoin="round";
  switch(p){
    case "stripes":stripes(c,r,col,sk.accent||null,5);break;
    // a 2ª passada de `blobs` tinge parte da neblina com o accent da skin (`acc`) — sem ela Planeta
    // Padrão e Vênus, os dois "clouds", eram idênticos fora da cor de base.
    case "clouds":stripes(c,r,col,null,7);blobs(c,r,rgba(light,.16),4,seed,.3);blobs(c,r,rgba(acc,.2),3,seed+5,.22);break;
    case "storm":spiral(c,r,rgba(light,.5),r*.14,2,1.3);c.fillStyle=acc;c.beginPath();c.ellipse(r*.1,-r*.05,r*.3,r*.22,.4,0,TAU);c.fill();break;
    case "swirl":spiral(c,r,rgba(light,.45),r*.12,3,1.1);break;
    case "galaxy":{spiral(c,r,rgba(acc,.75),r*.1,2,1.4);spiral(c,r,rgba(light,.5),r*.06,2,1.4,.7);
      c.fillStyle=light;const g=mulberry(seed*7);for(let i=0;i<14;i++){const a=g()*TAU,d=r*(.15+g()*.8);arc(c,Math.cos(a)*d,Math.sin(a)*d,r*.035);}
      c.fillStyle=rgba(light,.85);arc(c,0,0,r*.16);break;}
    // Asteroide (id 9) ganha mais crateras e menores — mais "picado" que a Lua/Mercúrio/Marte, que
    // seguem com o desenho de sempre. `acc` (ver `craters()`) já diferencia os quatro entre si.
    case "craters":{const asteroide=sk.id===9;craters(c,r,col,ink,asteroide?11:6,seed,acc,asteroide?.62:1);break;}
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
    // ── LENDÁRIAS POR NÍVEL ──────────────────────────────────────────────────
    // Estas não são texturas de planeta como as 22 acima: são EMBLEMAS. Figura central forte, duas cores,
    // simetria e contraste alto — é o que faz uma skin premium ser legível a 24 px no meio da partida, e é
    // também o que as separa do catálogo comum (nenhuma delas parece um planeta).
    case "belt":{c.save();c.rotate(-.5);
      for(let i=-1;i<=1;i++){c.fillStyle=rgba(acc,i?.55:.85);c.fillRect(-r,i*r*.34-r*.06,r*2,r*.12);}
      c.fillStyle=light;for(let i=-1;i<=1;i++){c.save();c.translate(i*r*.42,i*r*.34);spikes(c,r*(i?.16:.22),4,.3,0);c.fill();c.restore();}
      c.restore();break;}
    case "magma":{c.fillStyle=sh(col,-.72);arc(c,0,0,r);
      blobs(c,r,sh(col,-.45),4,seed,.5);
      c.fillStyle=rgba(acc,.9);arc(c,0,0,r*.3);c.fillStyle=rgba(light,.85);arc(c,0,0,r*.15);
      // rachaduras saindo do NÚCLEO para fora: o oposto de `lava`, que racha a casca
      {const g=mulberry(seed*13+1);c.lineCap="round";
        for(let i=0;i<7;i++){const a=i/7*TAU+g()*.4;let x=Math.cos(a)*r*.28,y=Math.sin(a)*r*.28,an=a;
          c.strokeStyle=rgba(acc,.75);c.lineWidth=Math.max(1.5,r*.05);c.beginPath();c.moveTo(x,y);
          for(let k=0;k<4;k++){an+=g()*.7-.35;const st=r*.2;x+=Math.cos(an)*st;y+=Math.sin(an)*st;c.lineTo(x,y);}
          c.stroke();}}
      break;}
    case "prism":{// seis cunhas em ângulos FIXOS: é a simetria que lê "premium", e não o ruído
      for(let i=0;i<6;i++){const a=i/6*TAU-Math.PI/2;
        c.fillStyle=rgba(i%2?acc:light,i%2?.55:.3);c.beginPath();c.moveTo(0,0);
        c.lineTo(Math.cos(a)*r,Math.sin(a)*r);c.lineTo(Math.cos(a+TAU/6)*r,Math.sin(a+TAU/6)*r);c.closePath();c.fill();
        c.strokeStyle=rgba(light,.5);c.lineWidth=Math.max(1,r*.02);c.stroke();}
      c.fillStyle=rgba(light,.95);arc(c,0,0,r*.18);break;}
    case "orbits":{c.strokeStyle=rgba(light,.5);
      const incl=[-.3,.9,2.1],raio=[.5,.72,.94];
      for(let i=0;i<3;i++){c.lineWidth=Math.max(1.5,r*.045);c.beginPath();
        c.ellipse(0,0,r*raio[i],r*raio[i]*.4,incl[i],0,TAU);c.stroke();
        const a=i*2.1+.6,x=Math.cos(a)*r*raio[i],y=Math.sin(a)*r*raio[i]*.4;
        c.save();c.rotate(incl[i]);c.fillStyle=acc;arc(c,x,y,r*.09);c.restore();}
      c.fillStyle=rgba(acc,.9);arc(c,0,0,r*.26);break;}
    case "tide":{for(let i=0;i<3;i++){
        c.fillStyle=rgba(i===2?light:acc,i===2?.35:.3+i*.18);c.beginPath();c.moveTo(-r,r);
        for(let k=0;k<=28;k++){const x=-r+k/28*r*2,y=(i-1.2)*r*.34+Math.sin(k/28*4.4+i*1.7)*r*.13;
          k?c.lineTo(x,y):c.lineTo(x,y);}
        c.lineTo(r,r);c.closePath();c.fill();}
      c.fillStyle=rgba(light,.9);arc(c,r*.3,-r*.42,r*.08);break;}
    case "crown":{for(let i=0;i<4;i++){c.fillStyle=rgba(light,i%2?.1:.2);c.fillRect(-r,-r+i*r*.5,r*2,r*.25);}
      c.fillStyle=acc;c.strokeStyle=ink;c.lineWidth=Math.max(2,r*.05);c.lineJoin="round";
      c.beginPath();c.moveTo(-r*.72,r*.28);
      for(let i=0;i<5;i++){const x0=-r*.72+i*r*.36;c.lineTo(x0+r*.18,-r*.5);c.lineTo(x0+r*.36,r*.1);}
      c.lineTo(r*.72,r*.28);c.closePath();c.fill();c.stroke();
      c.fillStyle=light;for(let i=0;i<5;i++)arc(c,-r*.54+i*r*.36,-r*.34,r*.06);break;}
    case "phoenix":{c.strokeStyle=rgba(acc,.85);c.lineCap="round";c.lineWidth=r*.14;
      for(let i=0;i<5;i++){const a=-Math.PI+ (i+.5)/5*Math.PI;
        c.beginPath();c.moveTo(0,r*.2);
        c.quadraticCurveTo(Math.cos(a)*r*.9,Math.sin(a)*r*.9,Math.cos(a)*r*.55,r*.2);c.stroke();}
      c.strokeStyle=rgba(light,.7);c.lineWidth=r*.07;
      c.beginPath();c.arc(-r*.34,r*.05,r*.4,Math.PI*1.05,Math.PI*1.95);c.stroke();
      c.beginPath();c.arc(r*.34,r*.05,r*.4,Math.PI*1.05,Math.PI*1.95);c.stroke();
      c.fillStyle=light;c.save();c.translate(0,-r*.24);spikes(c,r*.24,5,.42,-Math.PI/2);c.fill();c.restore();break;}
    case "singular":{c.fillStyle=ink;arc(c,0,0,r*.99);
      c.strokeStyle=rgba(acc,.95);c.lineWidth=r*.11;c.beginPath();c.ellipse(0,0,r*.88,r*.28,-.35,0,TAU);c.stroke();
      c.strokeStyle=rgba(light,.5);c.lineWidth=r*.04;c.beginPath();c.arc(0,0,r*.44,0,TAU);c.stroke();
      c.fillStyle=ink;arc(c,0,0,r*.3);
      {const g=mulberry(seed*19);c.fillStyle=rgba(light,.9);
        for(let i=0;i<10;i++){const a=g()*TAU,d=r*(.5+g()*.45);c.save();c.translate(Math.cos(a)*d,Math.sin(a)*d);
          spikes(c,r*(.04+g()*.05),4,.3,g()*TAU);c.fill();c.restore();}}
      break;}
    // ── EASTER EGG: a caricatura escolhida pelo NICK (shared/src/eggs.js) ──────
    case "face":face(c,r,sk,faceBmp,{ink});break;
    // ── OS TRÊS MASCOTES do jogo (Marte, Terra e Lua) ──────────────────────────
    case "mascote":mascote(c,r,sk,faceBmp,{ink,light});break;
    // ── A FOTO DO JOGADOR (skin "Retrato") ────────────────────────────────────
    // `paintPattern` é SÍNCRONO (roda dentro de cache.get/warm), então a imagem tem que chegar já
    // decodificada em `P.avatar`. Enquanto não chega, desenha a silhueta e devolve `true` — devolver
    // `false` faria cair no emoji fantasma, que é pior que um lugar reservado.
    case "avatar":{
      if(avatar){c.drawImage(avatar,-r,-r,r*2,r*2);
        c.strokeStyle=rgba(acc,.9);c.lineWidth=Math.max(2,r*.07);c.beginPath();c.arc(0,0,r*.96,0,TAU);c.stroke();}
      else{c.fillStyle=rgba(light,.18);arc(c,0,0,r);
        c.fillStyle=rgba(ink,.45);arc(c,0,-r*.22,r*.3);
        c.beginPath();c.ellipse(0,r*.55,r*.5,r*.34,0,Math.PI,TAU);c.fill();}
      break;}
    default:c.restore();return false;}
  // Acabamento suave só nas 10 skins iniciais (grátis + comuns, `STARTER_SKINS`): um brilho especular
  // baixo dá um ar mais "polido" na primeira impressão do jogo, sem se aproximar do vocabulário das
  // lendárias (que são emblemas, não planetas) — mesmo idioma visual do destaque que `paintNova` já usa
  // na estrela jovem.
  if(STARTER_SKINS.includes(sk.id)){c.fillStyle=rgba(light,.22);
    c.beginPath();c.ellipse(-r*.32,-r*.36,r*.34,r*.2,-.6,0,TAU);c.fill();}
  c.restore();return true;}


// ── CARICATURAS DOS EASTER EGGS ──────────────────────────────────────────────
// Aqui houve um desenho procedural (um rosto genérico montado com elipses, recolorido por personagem) e
// ele saiu inteiro. O motivo é simples de medir: dez caricaturas feitas de elipses saem parecidas entre si
// e nenhuma parece com quem devia — o que identifica uma pessoa é justamente o que uma elipse não tem.
// Hoje a arte é ILUSTRAÇÃO (client/public/faces/*.webp, 256², ~15 KB), carregada por `theme/faces.js`.
//
// ⚠️ `paintPattern` é SÍNCRONO — roda dentro de `cache.get`/`warm` do TextureCache —, então o bitmap tem
// que chegar já decodificado em `P.face`. Enquanto não chega, isto desenha o disco liso da cor da skin e
// devolve `true`: devolver `false` cairia no emoji fantasma, que seria uma bandeira no lugar de um rosto.
// Quando o bitmap fica pronto a CHAVE da textura muda (faces.js:faceKey) e o planeta é reassado sozinho.
/**
 * A ARTE DE CATÁLOGO dentro do disco. Gêmea de `face` logo abaixo, com duas diferenças que importam:
 * ela não tem fallback próprio (quem decide o degrade é `paintPattern`, que cai no pattern procedural) e
 * o aro é mais discreto — arte de catálogo já vem com contorno próprio, ao contrário das caricaturas.
 * ⚠️ QUADRADA por contrato (o upload recusa o resto): é o que dispensa a tabela de ajuste por personagem
 * que os mascotes precisaram, e faz `drawImage(-r,-r,2r,2r)` ser a única conta.
 */
function arte(c,r,bmp,{ink}){
  c.drawImage(bmp,-r,-r,r*2,r*2);
  c.strokeStyle=rgba(ink,.35);c.lineWidth=Math.max(1.5,r*.035);
  c.beginPath();c.arc(0,0,r*.985,0,TAU);c.stroke();}
function face(c,r,sk,face,{ink}){
  if(face){c.drawImage(face,-r,-r,r*2,r*2);
    // o fio de tinta por dentro da borda cola a ilustração no corpo do planeta; sem ele o recorte do
    // círculo fica com a beirada crua do JPEG contra o contorno da skin
    c.strokeStyle=rgba(ink,.55);c.lineWidth=Math.max(1.5,r*.045);c.beginPath();c.arc(0,0,r*.98,0,TAU);c.stroke();return;}
  c.fillStyle=sk.color;arc(c,0,0,r);
  c.fillStyle=rgba(ink,.12);c.beginPath();c.ellipse(0,r*.2,r*.55,r*.4,0,Math.PI,TAU);c.fill();}

/**
 * OS TRÊS MASCOTES dentro do disco. Chega pelo MESMO caminho da caricatura (`theme/faces.js`, mesmo cache
 * e mesma chave), e desenha diferente por duas razões que não dá para ignorar:
 *  1. a arte tem FUNDO TRANSPARENTE — o disco da cor da skin vai por BAIXO, senão o personagem fica um
 *     recorte flutuando no vazio, com o buraco mostrando o que estiver atrás do planeta;
 *  2. ela NÃO É QUADRADA (448×463, 448×431 e 256×321), então o `drawImage(-r,-r,r*2,r*2)` da caricatura
 *     esticaria as três de um jeito diferente cada — a Lua, que é a mais alta, viraria uma bola. É
 *     `contain`: a MAIOR dimensão vira o diâmetro e a outra acompanha a proporção.
 * ⚠️ O FATOR É POR PERSONAGEM, e não um só, porque o que cada arte tem de sobra é diferente. Marte e
 * Terra SÃO a esfera — a arte vem cortada rente a ela, então 2.06 (e não 2) põe a bola encostando na
 * borda do disco; com 2 exato sobrava um fio da cor da skin em volta deles, que é justamente o que não
 * se quer ver. A LUA não: ela é uma esfera COM CAPACETE, e o capacete é o personagem. Em 2.06 a cúpula
 * dele cai fora do círculo e é decepada pelo recorte — então ela entra menor, e a faixa de cor que
 * sobra ao lado do corpo não custa nada porque a cor da skin é o MESMO cinza da lua. O excesso do
 * Marte e da Terra também não vaza: quem chama `paintPattern` já recortou o disco.
 * É por isso que o disco tem relevo: sem o brilho e a sombra, aquela faixa seria um chapado.
 */
const MASC_FIT={marte:2.06,terra:2.06,lua:1.8};
function mascote(c,r,sk,bmp,{ink,light}){
  c.fillStyle=sk.color;arc(c,0,0,r);
  c.fillStyle=rgba(light,.18);c.beginPath();c.ellipse(-r*.34,-r*.36,r*.42,r*.25,-.7,0,TAU);c.fill();
  c.fillStyle=rgba(ink,.18);c.beginPath();c.ellipse(0,r*.22,r*.62,r*.46,0,Math.PI,TAU);c.fill();
  if(bmp){const k=r*(MASC_FIT[sk.mascot]||2)/Math.max(bmp.width,bmp.height),w=bmp.width*k,h=bmp.height*k;
    c.drawImage(bmp,-w/2,-h/2,w,h);}
  // o mesmo fio de tinta da caricatura: cola a ilustração no corpo e esconde a beirada crua do recorte
  c.strokeStyle=rgba(ink,.55);c.lineWidth=Math.max(1.5,r*.045);c.beginPath();c.arc(0,0,r*.98,0,TAU);c.stroke();}

/**
 * Buraco negro (Gargantua/M87): sombra preta GRANDE, disco de acreção quase de perfil com a face de TRÁS lenteada
 * por cima e por baixo — os dois arcos que abraçam a sombra são o que faz a arte ler "buraco negro" e não "donut" —,
 * anel de fóton branco colado na borda, faixa da frente cruzando por cima da esfera e Doppler (o lado que vem em
 * nossa direção sai branco, o que se afasta sai vermelho profundo).
 * `P` = {ink,glow,hot,cold} — rampa SÓ quente: glow = branco do bordo interno, hot = dourado, cold = vermelho do
 * bordo externo, ink = a sombra.
 * O canvas vai até r·2.4 e esse r é o `rc` do buraco na tela, então a arte inteira ocupa exatamente rc·CRUSH_K —
 * é a promessa de `BLACKHOLE.CRUSH_K`: quem é maior que a bola inteira passa por cima e não morre.
 * NÃO gire este sprite (Hazards.js mantém rotation=0): a perspectiva é fixa, girar faz a elipse cambalear.
 */
export function paintHole(c,r,{ink="#07040e",glow="#fff3d0",hot="#ff9126",cold="#8c1b06"}={}){
  c.lineJoin="round";c.lineCap="round";
  const SH=r*1.26,PH=r*1.295;   // sombra (o horizonte) e o anel de fóton colado nela
  /** anel elíptico (setor a0→a1): elipse externa no sentido normal, interna ao contrário = furo */
  const band=(rxo,ryo,rxi,ryi,a0,a1,fill)=>{c.fillStyle=fill;c.beginPath();
    c.ellipse(0,0,rxo,ryo,0,a0,a1,false);c.ellipse(0,0,rxi,ryi,0,a1,a0,true);c.closePath();c.fill();};
  /** rampa horizontal do disco (k = brilho): esquerda = matéria vindo para nós (branca), direita = se afastando */
  const ramp=k=>{const g=c.createLinearGradient(-r*2.4,0,r*2.4,0);
    g.addColorStop(0,rgba(cold,.04*k));g.addColorStop(.12,rgba(hot,.5*k));g.addColorStop(.26,rgba(glow,.98*k));
    g.addColorStop(.42,rgba(hot,.92*k));g.addColorStop(.6,rgba(hot,.66*k));g.addColorStop(.8,rgba(cold,.66*k));
    g.addColorStop(1,rgba(cold,.04*k));return g;};
  const bl=c.createRadialGradient(0,0,r*1.1,0,0,r*2.36);   // bloom: o brilho é assado, o cliente não tem filtro nem blend
  bl.addColorStop(0,rgba(hot,.24));bl.addColorStop(.5,rgba(hot,.08));bl.addColorStop(1,rgba(hot,0));
  c.fillStyle=bl;arc(c,0,0,r*2.36);
  band(r*2.3,r*1.9,r*1.6,r*1.42,Math.PI,TAU,ramp(1));       // face de trás lenteada POR CIMA (o arco alto)
  band(r*2.12,r*1.66,r*1.52,r*1.2,0,Math.PI,ramp(.7));      // e o arco menor POR BAIXO — tem de passar da sombra, senão some
  c.fillStyle=ink;arc(c,0,0,SH);                            // a sombra tapa o miolo dos dois arcos
  const ph=c.createRadialGradient(0,0,SH,0,0,r*1.72);ph.addColorStop(0,rgba(glow,.42));ph.addColorStop(1,rgba(glow,0));
  c.beginPath();c.arc(0,0,r*1.72,0,TAU);c.arc(0,0,SH,0,TAU);c.fillStyle=ph;c.fill("evenodd");   // halo curto do anel de fóton
  c.strokeStyle=rgba(glow,.85);c.lineWidth=Math.max(1,r*.028);c.beginPath();c.arc(0,0,PH,0,TAU);c.stroke();
  band(r*2.32,r*.34,r*.5,r*.06,0,Math.PI,ramp(1));          // face da FRENTE: cruza por cima da esfera
  c.lineWidth=Math.max(1,r*.011);                           // estriações: é o que dá a textura filamentar das fotos
  for(let i=1;i<8;i++){const t=i/8,od=i%2;c.strokeStyle=rgba(od?ink:glow,od?.26:.11);
    c.beginPath();c.ellipse(0,0,r*(1.6+t*.7),r*(1.42+t*.48),0,Math.PI,TAU);c.stroke();
    c.beginPath();c.ellipse(0,0,r*(1.52+t*.6),r*(1.2+t*.46),0,0,Math.PI);c.stroke();
    c.beginPath();c.ellipse(0,0,r*(.5+t*1.82),r*(.05+t*.27),0,0,Math.PI);c.stroke();}}

/**
 * As CINCO estrelas. `paintNova` continua sendo a variante 0 (assinatura intacta, quatro chamadores), e
 * `paintNovaV` despacha — quebrar a assinatura de uma função de tema custaria mais do que ela vale.
 * ⚠️ A VARIANTE TEM QUE ENTRAR NA CHAVE DO CACHE (`theme/<id>/index.js`, `case "nova"`). O `TextureCache`
 * não tem `drop(key)`: sem ela, trocar o layout no /admin devolveria a textura do anterior, em silêncio.
 * ⚠️ Nada de animação aqui: isto é assado UMA vez por (variante, fase, tier, tema). O que se mexe por
 * frame mora em `layers/Hazards.js`.
 * ⚠️ E nada de `createConicGradient`, `filter`, `Path2D` ou `ImageData`: `client/test/textures.test.js`
 * usa um contexto 2D falso via Proxy, onde qualquer método passa — o teste ficaria verde e o jogo
 * quebraria. Só o vocabulário que já está em uso neste arquivo.
 * @param {number} v 0..4
 */
export function paintNovaV(c,r,{variant=0,old=false},P={}){
  const V=[paintNova,novaAnã,novaAzul,novaDupla,novaPulsar];
  (V[((v=>v<0?0:v>4?4:v)(variant|0))]||paintNova)(c,r,old,P);}
/**
 * 1 — ANÃ MANCHADA: disco fosco de granulação grossa, sem coroa de plasma. É a estrela "sólida", a que
 * menos se confunde com um planeta grande porque não tem aro nem brilho especular.
 */
function novaAnã(c,r,old,{ink="#141026",core="#fff5c2",edge="#ffc22e",deep="#ff6b4a"}={}){
  const hot=old?deep:edge,mid=old?edge:core;
  c.fillStyle=rgba(hot,.16);arc(c,0,0,r*1.5);
  const g=c.createRadialGradient(-r*.18,-r*.2,r*.1,0,0,r);
  g.addColorStop(0,mid);g.addColorStop(.7,hot);g.addColorStop(1,old?ink:deep);
  c.fillStyle=g;arc(c,0,0,r);
  c.save();c.beginPath();c.arc(0,0,r*.99,0,TAU);c.clip();
  blobs(c,r,rgba(ink,old?.34:.2),9,5,.22);
  blobs(c,r,rgba(core,old?.2:.34),7,9,.16);
  if(old)cracks(c,r,rgba(core,.95),Math.max(1.5,r*.06),4,13,core);
  c.restore();
  c.strokeStyle=ink;c.lineWidth=Math.max(2,r*.09);c.beginPath();c.arc(0,0,r,0,TAU);c.stroke();}
/**
 * 2 — AZUL COM JATOS: dois jatos polares opostos e um disco fino em volta. É a mais "direcional" das
 * cinco, e a que muda mais de silhueta ao inchar.
 */
function novaAzul(c,r,old,{ink="#141026",core="#fff5c2",edge="#ffc22e",deep="#ff6b4a"}={}){
  const hot=old?deep:edge,mid=old?edge:core,jato=old?deep:core;
  for(let i=3;i>0;i--){c.fillStyle=rgba(hot,.08*i);arc(c,0,0,r*(1+i*.3));}
  c.strokeStyle=rgba(jato,.55);c.lineCap="round";
  for(const s of [-1,1]){c.lineWidth=Math.max(2,r*.3);
    c.beginPath();c.moveTo(0,s*r*.7);c.lineTo(0,s*r*(old?2.6:2.1));c.stroke();
    c.lineWidth=Math.max(1.5,r*.12);c.strokeStyle=rgba(core,.85);
    c.beginPath();c.moveTo(0,s*r*.7);c.lineTo(0,s*r*(old?2.4:1.95));c.stroke();
    c.strokeStyle=rgba(jato,.55);}
  c.strokeStyle=rgba(hot,.5);c.lineWidth=Math.max(2,r*.14);
  c.beginPath();c.ellipse(0,0,r*1.55,r*.4,0,0,TAU);c.stroke();
  const g=c.createRadialGradient(0,0,r*.05,0,0,r);
  g.addColorStop(0,"#ffffff");g.addColorStop(.5,mid);g.addColorStop(1,hot);
  c.fillStyle=g;arc(c,0,0,r);
  c.strokeStyle=ink;c.lineWidth=Math.max(2,r*.09);c.beginPath();c.arc(0,0,r,0,TAU);c.stroke();
  if(old){c.save();c.beginPath();c.arc(0,0,r*.98,0,TAU);c.clip();blobs(c,r,rgba(ink,.28),5,7,.28);c.restore();}}
/**
 * 3 — BINÁRIA: dois núcleos em volta do mesmo centro, ligados por uma ponte de matéria. Ao envelhecer os
 * dois se encostam — a leitura de "vai acontecer alguma coisa" vem da geometria, não da cor.
 */
function novaDupla(c,r,old,{ink="#141026",core="#fff5c2",edge="#ffc22e",deep="#ff6b4a"}={}){
  const hot=old?deep:edge,mid=old?edge:core,sep=old?r*.2:r*.42,rr=r*(old?.62:.5);
  for(let i=3;i>0;i--){c.fillStyle=rgba(hot,.09*i);arc(c,0,0,r*(1+i*.24));}
  c.strokeStyle=rgba(mid,.6);c.lineWidth=Math.max(2,r*(old?.5:.3));c.lineCap="round";
  c.beginPath();c.moveTo(-sep,0);c.lineTo(sep,0);c.stroke();
  for(const s of [-1,1]){
    const g=c.createRadialGradient(s*sep-rr*.25,-rr*.25,rr*.08,s*sep,0,rr);
    g.addColorStop(0,"#ffffff");g.addColorStop(.5,mid);g.addColorStop(1,hot);
    c.fillStyle=g;arc(c,s*sep,0,rr);
    c.strokeStyle=ink;c.lineWidth=Math.max(2,r*.08);c.beginPath();c.arc(s*sep,0,rr,0,TAU);c.stroke();}
  if(old){c.strokeStyle=rgba(core,.9);c.lineWidth=Math.max(1.5,r*.05);
    for(let i=0;i<6;i++){const a=i/6*TAU;c.beginPath();c.moveTo(Math.cos(a)*r*.9,Math.sin(a)*r*.9);
      c.lineTo(Math.cos(a)*r*1.35,Math.sin(a)*r*1.35);c.stroke();}}}
/**
 * 4 — PULSAR: núcleo pequeno e denso dentro de anéis concêntricos que o envolvem. É a que menos ocupa
 * área de disco — e por isso a que deixa o esconderijo (STAR.PASS_R) mais visível.
 */
function novaPulsar(c,r,old,{ink="#141026",core="#fff5c2",edge="#ffc22e",deep="#ff6b4a"}={}){
  const hot=old?deep:edge,mid=old?edge:core;
  c.fillStyle=rgba(hot,.14);arc(c,0,0,r*1.7);
  c.lineCap="round";
  for(let i=0;i<4;i++){const k=1-i*.2;
    c.strokeStyle=rgba(i%2?mid:hot,old?.5+i*.1:.34+i*.1);c.lineWidth=Math.max(1.5,r*(.1-i*.015));
    c.beginPath();c.ellipse(0,0,r*(1.55-i*.16),r*(1.55-i*.16)*(old?.85:.5),i*.5,0,TAU);c.stroke();
    if(k<0)break;}
  const g=c.createRadialGradient(0,0,r*.02,0,0,r*.66);
  g.addColorStop(0,"#ffffff");g.addColorStop(.4,mid);g.addColorStop(1,hot);
  c.fillStyle=g;arc(c,0,0,r*.66);
  c.strokeStyle=ink;c.lineWidth=Math.max(2,r*.08);c.beginPath();c.arc(0,0,r*.66,0,TAU);c.stroke();
  c.strokeStyle=rgba(core,old?.95:.7);c.lineWidth=Math.max(1.5,r*.07);
  for(const s of [-1,1]){c.beginPath();c.moveTo(s*r*.7,0);c.lineTo(s*r*(old?1.9:1.5),0);c.stroke();}
  if(old){c.save();c.beginPath();c.arc(0,0,r*.65,0,TAU);c.clip();cracks(c,r*.66,rgba(core,.9),Math.max(1.5,r*.05),3,17,core);c.restore();}}
/**
 * 0 — Estrela do mundo: coroa em 3 camadas, línguas de plasma curvas e núcleo quente. `old` = gigante
 * vermelha inchada, com manchas escuras e rachaduras brilhantes (telegrafa a supernova).
 * `P` = {ink,core,edge,deep}.
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

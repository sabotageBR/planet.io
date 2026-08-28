// ── util de desenho dos temas ─────────────────────────────────────────────────
// Cópia dos helpers de mockups/v2/src/engine2.js que as receitas de sprite usam
// (u.sh / u.rgba / u.spikes / u.astPoly / u.rr / u.mulberry / u.outText). As receitas
// em client/src/theme/<id>/index.js são portes literais dos mockups; mexer aqui
// muda o desenho dos três temas.

// clareia (a>0) ou escurece (a<0) um hex "#rrggbb" → "rgb(r,g,b)"
export function sh(hex,a){let n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255;
  const f=x=>Math.max(0,Math.min(255,Math.round(a>0?x+(255-x)*a:x*(1+a))));return`rgb(${f(r)},${f(g)},${f(b)})`;}
// hex "#rrggbb" + alfa → "rgba(r,g,b,a)"
export function rgba(hex,a){const n=parseInt(hex.slice(1),16);return`rgba(${n>>16},${n>>8&255},${n&255},${a})`;}
// gerador determinístico (mesmo do engine e de shared/src/rng.js)
export function mulberry(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// retângulo arredondado (só o path)
export function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
// polígono espinhoso (estrelas, POW!)
export function spikes(c,r,n,inner,phase){c.beginPath();
  for(let i=0;i<n*2;i++){const a=(i/(n*2))*6.2832+(phase||0),rad=i%2?r*inner:r;
    i?c.lineTo(Math.cos(a)*rad,Math.sin(a)*rad):c.moveTo(Math.cos(a)*rad,Math.sin(a)*rad);}
  c.closePath();}
// polígono irregular de asteroide (forma determinística por seed; cache)
const _ast=new Map();
export function astShape(seed,n){const k=seed+":"+(n||9);let s=_ast.get(k);if(s)return s;
  const r=mulberry(Math.floor(seed*1e6)+1);n=n||9;s=[];for(let i=0;i<n;i++)s.push(.72+r()*.36);_ast.set(k,s);return s;}
export function astPoly(c,r,seed,n){const s=astShape(seed,n);c.beginPath();
  for(let i=0;i<s.length;i++){const a=i/s.length*6.2832,rad=r*s[i];
    i?c.lineTo(Math.cos(a)*rad,Math.sin(a)*rad):c.moveTo(Math.cos(a)*rad,Math.sin(a)*rad);}
  c.closePath();}
// texto com contorno (rótulos, POW!)
export function outText(c,txt,x,y,size,fill,stroke,w){
  c.font=`bold ${size}px ${w||'Arial,Helvetica,sans-serif'}`;c.textAlign="center";c.textBaseline="middle";
  if(stroke!==null){c.strokeStyle=stroke||"rgba(0,0,0,.85)";c.lineWidth=Math.max(2,size*.2);c.lineJoin="round";c.strokeText(txt,x,y);}
  c.fillStyle=fill||"#fff";c.fillText(txt,x,y);}
// faixa de tamanho do sprite (128/256/512) por raio em pixels de mundo
export const tier=r=>r<=44?128:r<=120?256:512;
/**
 * FOGOS DE ARTIFÍCIO (a comemoração de quem vence o battle royale) — devolve as primitivas de um FOGUETE
 * inteiro para o instante `k` (0..1 da vida do efeito), do lançamento à queda das faíscas.
 * Está aqui, e não copiado nos três temas, porque a FÍSICA é a mesma; o que muda por céu é só a paleta.
 *
 * O que faz parecer de verdade, em ordem de importância:
 *  1. RASTRO — cada faísca é um traço do ponto anterior até o atual, não um ponto. Fogo real é registrado
 *     como risco porque a faísca anda mais que o olho integra; um campo de pontinhos parece confete.
 *  2. ARRASTO — o raio satura (`v/λ·(1−e^{−λu})`), então a explosão abre rápido e freia. Expansão linear
 *     parece um pisca-pisca saindo do centro.
 *  3. GRAVIDADE — o `+G·u²` faz a esfera virar sino e cair. É o que dá peso à cena.
 *  4. COR EM TRÊS TEMPOS — branco quente → cor da carga → brasa. A faísca esfria enquanto cai.
 *  5. CINTILAÇÃO — parte das faíscas pisca em alta frequência (o "crepitar" do estrôncio/magnésio).
 *  6. SUBIDA COM DESACELERAÇÃO — o foguete chega ao ápice com velocidade quase zero, e é ali que estoura.
 * @param {number} k 0..1 @param {{x:number,y:number,h:number,dx:number,n:number,seed:number,willow:boolean}} f
 * @param {{hot:string,body:string,ember:string,trail:string}} pal
 */
export function fireworkPrims(k,f,pal){
  const P=[],RISE=.28,n=f.n||40,rnd=mulberry((f.seed|0)+1);
  // sorteio determinístico por faísca (mesma semente ⇒ mesmo desenho todo frame)
  const A=[],V=[],T=[];
  for(let i=0;i<n;i++){A.push(rnd()*6.2832);V.push(.55+rnd()*.45);T.push(rnd());}
  const apice={x:f.x+f.dx*f.h,y:f.y-f.h};
  if(k<RISE){                                        // ── subida ──
    const u=k/RISE,e=1-(1-u)*(1-u);                  // desacelera até parar no ápice
    const x=f.x+(apice.x-f.x)*e,y=f.y+(apice.y-f.y)*e;
    const passo=f.h*.055;
    for(let i=0;i<4;i++){const b=Math.max(0,e-i*.045),bx=f.x+(apice.x-f.x)*b,by=f.y+(apice.y-f.y)*b;
      P.push({type:"line",x1:bx,y1:by,x2:bx+(x-bx)*.6,y2:by+(y-by)*.6,color:i?pal.trail:pal.hot,
        alpha:(1-i*.24)*(.35+.65*u),width:Math.max(1.5,passo*(1-i*.2)*.5)});}
    P.push({type:"ring",x,y,r:passo*(.9+u*.5),color:pal.hot,alpha:.9,width:Math.max(1.5,passo*.35)});
    return P;}
  // ── estouro ──
  const u=(k-RISE)/(1-RISE),LAM=1.5,G=f.willow?.95:.55;
  const dist=uu=>(1-Math.exp(-LAM*uu))/LAM;          // arrasto: o raio satura
  // R0/LAM ≈ .55·h de raio final: a bola tem que abrir MAIS LARGA que meia subida, senão parece faísca de vela
  const R0=f.h*(f.willow?1.25:1.05),du=.085;
  const flash=u<.10?1-u/.10:0;
  if(flash>0){                                        // clarão do estouro
    P.push({type:"star",x:apice.x,y:apice.y,r:R0*.10*(1+u*4),n:14,inner:.22,phase:u,fill:pal.hot,alpha:flash*.85});
    P.push({type:"ring",x:apice.x,y:apice.y,r:R0*(.06+u*3.2),color:pal.body,alpha:flash*.5,width:Math.max(1.5,R0*.02)});}
  const fade=u<.78?1:1-(u-.78)/.22;                   // as faíscas apagam no fim
  for(let i=0;i<n;i++){
    const a=A[i],v=V[i]*R0,ca=Math.cos(a),sa=Math.sin(a);
    const dd=du*(1-u*.6);                             // o rastro encurta enquanto a faísca perde velocidade
    const d1=dist(u)*v,d0=dist(Math.max(0,u-dd))*v;
    const g1=G*R0*u*u,g0=G*R0*Math.max(0,u-dd)**2;
    const x1=apice.x+ca*d1,y1=apice.y+sa*d1+g1,x0=apice.x+ca*d0,y0=apice.y+sa*d0+g0;
    // cor em três tempos + cintilação em parte das faíscas
    const cor=u<.18?pal.hot:u<.62?pal.body:pal.ember;
    const cint=T[i]>.55?(.55+.45*Math.sin(u*46+i*2.1)):1;
    P.push({type:"line",x1:x0,y1:y0,x2:x1,y2:y1,color:cor,
      alpha:Math.max(0,fade*cint*(1-u*.35)),width:Math.max(1,R0*.014*(1-u*.45))});}
  return P;}

/**
 * HALO assado (o brilho das partículas): gradiente radial da cor da bolinha até transparente, desenhado no
 * frame INTEIRO do atlas — o corpo ocupa só `size/2/K`, então o resto da moldura é exatamente a sobra por
 * onde o brilho vaza para fora do disco.
 * Vai numa TEXTURA, e não num filtro: o renderer não usa filtro nem blur (custam render target e são o que
 * derrubava o fps), e o precedente já existia no estilhaço de supernova. Quem soma de verdade é o
 * ParticleContainer do brilho, que é desenhado em blendMode "add" por baixo do normal.
 * `core` = fração do raio em que o halo ainda está no máximo; `k` = intensidade.
 */
export function paintGlow(c,size,color,{core=.26,k=.40}={}){
  const R=size/2,n=parseInt(color.slice(1),16),r=n>>16,g=n>>8&255,b=n&255;
  const gr=c.createRadialGradient(0,0,R*core*.3,0,0,R);
  gr.addColorStop(0,`rgba(${r},${g},${b},${k})`);
  gr.addColorStop(core,`rgba(${r},${g},${b},${k*.42})`);
  gr.addColorStop(.5,`rgba(${r},${g},${b},${k*.11})`);
  gr.addColorStop(.78,`rgba(${r},${g},${b},${k*.02})`);
  gr.addColorStop(1,`rgba(${r},${g},${b},0)`);
  c.fillStyle=gr;c.beginPath();c.arc(0,0,R,0,6.283);c.fill();}
// A queda é RÁPIDA de propósito. Com um halo largo e opaco (a primeira tentativa: k .85 e meia-queda em .62)
// o aditivo satura para branco e a tela vira névoa leitosa — some o contraste que faz enxergar a comida. Aqui
// o brilho é uma auréola justa em volta do disco: dá o "neon" dos .io modernos e a bolinha continua nítida.


// tipos de comida: o mockup usa strings; shared/src/constants.js FOOD_TYPE usa índices. Aceita os dois.
const FOOD_NAMES=["dust","comet","star","rock","missile_ammo","powerup_merge","powerup_magnet","powerup_shield",
  "w_burst","w_cluster","w_nova"];   // 8..10 = as armas do Battle Royale (índice = FOOD_TYPE)
export const foodType=t=>typeof t==="number"?(FOOD_NAMES[t]||"dust"):(t||"dust");
export const FOOD_ICON={missile_ammo:"🚀",powerup_merge:"⚛️",powerup_magnet:"🧲",powerup_shield:"🛡️",
  w_burst:"✳️",w_cluster:"💥",w_nova:"🌟"};
export const FOOD_FIXED={powerup_merge:"#5cf08a",powerup_magnet:"#ff66ff",powerup_shield:"#44aaff",missile_ammo:"#ff6600",
  w_burst:"#ffd24a",w_cluster:"#ff5c8a",w_nova:"#66f0ff"};   // cores dos especiais (engine2 mkFood); a raridade sobe na escala quente→fria

// desenha as primitivas de effects.fx() num contexto 2D (referência; o Pixi faz o equivalente)
export function drawPrims(c,prims){
  for(const p of prims){c.save();c.globalAlpha=p.alpha==null?1:p.alpha;c.lineJoin="round";c.lineCap="round";
    switch(p.type){
      case "star":c.translate(p.x,p.y);c.rotate(p.rot||0);spikes(c,p.r,p.n,p.inner,p.phase||0);
        if(p.fill){c.fillStyle=p.fill;c.fill();}if(p.stroke){c.strokeStyle=p.stroke;c.lineWidth=p.width||2;c.stroke();}break;
      case "text":c.translate(p.x,p.y);c.rotate(p.rot||0);outText(c,p.text,0,0,p.size,p.fill,p.stroke===undefined?null:p.stroke,p.font);break;
      case "ring":c.strokeStyle=p.color;c.lineWidth=p.width||2;if(p.dash)c.setLineDash(p.dash);c.beginPath();c.arc(p.x,p.y,p.r,0,6.283);c.stroke();break;
      case "line":c.strokeStyle=p.color;c.lineWidth=p.width||2;c.beginPath();c.moveTo(p.x1,p.y1);c.lineTo(p.x2,p.y2);c.stroke();break;
      case "burst":c.strokeStyle=p.color;c.lineWidth=p.width||2;for(let i=0;i<p.n;i++){const an=i/p.n*6.283+(p.phase||0);c.beginPath();
        c.moveTo(p.x+Math.cos(an)*p.r0,p.y+Math.sin(an)*p.r0);c.lineTo(p.x+Math.cos(an)*p.r1,p.y+Math.sin(an)*p.r1);c.stroke();}break;}
    c.restore();}}
